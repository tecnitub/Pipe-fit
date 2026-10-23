// Export DXF (AutoCAD R12, lisible par AutoCAD, BricsCAD, DraftSight, LibreCAD…) des schémas dessinés en SVG par l'application :
// lignes, rectangles, cercles, tracés (M L H V Z, relatifs, courbes quadratiques) et textes, avec translations et rotations.
// Calques : DEPART et RETOUR (couleurs des réseaux, indiquées par data-depart / data-retour sur la racine), SYMBOLES, TEXTES.
// 1 unité DXF = 1 px du schéma (unités : mm).
const Dxf = (() => {
  const rgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
  // Couleur AutoCAD d'après la teinte : rouge 1, jaune 2, vert 3, cyan 4, bleu 5, magenta 6 ; gris et noir : 8 ou 7
  function aci(hex) {
    const c = rgb(hex);
    if (!c) return 7;
    const [r, g, b] = c.map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), sat = max ? (max - min) / max : 0;
    if (sat < 0.25 || max < 0.2) return max > 0.6 ? 8 : 7;
    const h = max === r ? 60 * (((g - b) / (max - min)) % 6) : max === g ? 60 * ((b - r) / (max - min) + 2) : 60 * ((r - g) / (max - min) + 4);
    return [1, 2, 3, 4, 5, 6, 1][Math.round(((h + 360) % 360) / 60)];
  }
  const attrs = s => Object.fromEntries([...String(s).matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const entites = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  // Fichier en Windows-1252 (page de code déclarée dans l'en-tête) ; caractères hors de cette page en séquences \U+XXXX
  const WIN = { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e,
    0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f };
  function octets(txt) {
    const out = [];
    for (const ch of txt) {
      let c = ch.codePointAt(0);
      if (c === 0x202f || c === 0x2009) c = 0x20;
      if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) out.push(c);
      else if (WIN[c]) out.push(WIN[c]);
      else for (const b of `\\U+${c.toString(16).toUpperCase().padStart(4, '0')}`) out.push(b.charCodeAt(0));
    }
    return Uint8Array.from(out);
  }
  const n = v => (Math.round(v * 1000) / 1000).toString();

  // Points d'un tracé SVG (sous-ensemble utilisé par l'application) : liste de polylignes
  function trace(d) {
    const out = [], tokens = String(d).match(/[MLHVZQmlhvzq]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    let i = 0, cmd = '', x = 0, y = 0, x0 = 0, y0 = 0, cour = null;
    const lire = () => parseFloat(tokens[i++]);
    while (i < tokens.length) {
      if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
      if (C === 'Z') { if (cour) { cour.push([x0, y0]); x = x0; y = y0; } cour = null; continue; }
      if (C === 'M') { const a = lire(), b = lire(); x = rel ? x + a : a; y = rel ? y + b : b; x0 = x; y0 = y; cour = [[x, y]]; out.push(cour); cmd = rel ? 'l' : 'L'; continue; }
      if (!cour) { cour = [[x, y]]; out.push(cour); }
      if (C === 'L') { const a = lire(), b = lire(); x = rel ? x + a : a; y = rel ? y + b : b; cour.push([x, y]); }
      else if (C === 'H') { const a = lire(); x = rel ? x + a : a; cour.push([x, y]); }
      else if (C === 'V') { const b = lire(); y = rel ? y + b : b; cour.push([x, y]); }
      else if (C === 'Q') {
        const c1 = [lire(), lire()], p = [lire(), lire()], cx = rel ? x + c1[0] : c1[0], cy = rel ? y + c1[1] : c1[1], px = rel ? x + p[0] : p[0], py = rel ? y + p[1] : p[1];
        for (let k = 1; k <= 8; k++) { const t = k / 8; cour.push([(1 - t) ** 2 * x + 2 * (1 - t) * t * cx + t * t * px, (1 - t) ** 2 * y + 2 * (1 - t) * t * cy + t * t * py]); }
        x = px; y = py;
      } else i++;
    }
    return out;
  }

  function depuisSvg(svg) {
    const racine = attrs((/<svg([^>]*)>/.exec(svg) || [])[1] || ''), H = parseFloat(racine.height) || 1000;
    const calques = { [String(racine['data-depart'] || '').toLowerCase()]: 'DEPART', [String(racine['data-retour'] || '').toLowerCase()]: 'RETOUR' };
    const ents = [], pile = [[0, 0]], calqueDe = c => calques[String(c || '').toLowerCase()] || 'SYMBOLES';
    const P = (x, y) => { const [tx, ty] = pile[pile.length - 1]; return [x + tx, H - (y + ty)]; };
    const ligne = (a, b, c) => ents.push(['LINE', 8, calqueDe(c), 62, aci(c), 10, n(a[0]), 20, n(a[1]), 30, 0, 11, n(b[0]), 21, n(b[1]), 31, 0]);
    const poly = (pts, c) => { for (let k = 1; k < pts.length; k++) ligne(pts[k - 1], pts[k], c); };
    const re = /<(\/?)(\w+)([^>]*?)(\/?)>|([^<]+)/g;
    let m, texteOuvert = null;
    while ((m = re.exec(svg))) {
      const [, ferme, tag, at, auto, contenu] = m;
      if (contenu !== undefined) { if (texteOuvert) texteOuvert.t += contenu; continue; }
      if (ferme) { if (tag === 'g') pile.pop(); if (tag === 'text' && texteOuvert) { const o = texteOuvert; texteOuvert = null; ecrireTexte(o); } continue; }
      const a = attrs(at), trait = a.stroke && a.stroke !== 'none' ? a.stroke : null, couleur = trait || a.fill;
      if (tag === 'g') { const t = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(a.transform || ''), [tx, ty] = pile[pile.length - 1]; pile.push(t ? [tx + +t[1], ty + +t[2]] : [tx, ty]); if (auto) pile.pop(); }
      else if (tag === 'line') ligne(P(+a.x1, +a.y1), P(+a.x2, +a.y2), couleur);
      else if (tag === 'rect' && trait) { const x = +a.x || 0, y = +a.y || 0, w = +a.width, h = +a.height; poly([P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h), P(x, y)], trait); }
      else if (tag === 'circle') { const [cx, cy] = P(+a.cx, +a.cy); ents.push(['CIRCLE', 8, calqueDe(couleur), 62, aci(couleur), 10, n(cx), 20, n(cy), 30, 0, 40, n(+a.r)]); }
      else if (tag === 'path' && (trait || (a.fill && a.fill !== 'none'))) trace(a.d).forEach(pts => poly(pts.map(([x, y]) => P(x, y)), couleur));
      else if (tag === 'text') texteOuvert = { a, t: '' };
    }
    function ecrireTexte({ a, t }) {
      const txt = entites(t).trim();
      if (!txt) return;
      const [x, y] = P(+a.x, +a.y), fs = parseFloat(a['font-size']) || 11, rot = /rotate\(([-\d.]+)/.exec(a.transform || ''), just = { middle: 1, end: 2 }[a['text-anchor']] || 0;
      ents.push(['TEXT', 8, 'TEXTES', 62, aci(a.fill), 10, n(x), 20, n(y), 30, 0, 40, n(fs * 0.72), 1, txt, ...(rot ? [50, n(-parseFloat(rot[1]))] : []),
        ...(just ? [72, just, 11, n(x), 21, n(y), 31, 0] : [])]);
    }
    const calquesDxf = [['DEPART', aci(racine['data-depart'])], ['RETOUR', aci(racine['data-retour'])], ['SYMBOLES', 7], ['TEXTES', 7]];
    const lignes = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '9', '$DWGCODEPAGE', '3', 'ANSI_1252', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LTYPE', '70', '1', '0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0.0', '0', 'ENDTAB',
      '0', 'TABLE', '2', 'LAYER', '70', String(calquesDxf.length), ...calquesDxf.flatMap(([nom, c]) => ['0', 'LAYER', '2', nom, '70', '0', '62', String(c), '6', 'CONTINUOUS']), '0', 'ENDTAB', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES', ...ents.flatMap(([type, ...kv]) => ['0', type, ...kv.map(String)]), '0', 'ENDSEC', '0', 'EOF'];
    const texte = lignes.join('\r\n') + '\r\n';
    return { texte, octets: octets(texte), entites: ents.length };
  }
  return { depuisSvg, trace, aci, octets };
})();
if (typeof module !== 'undefined') module.exports = Dxf;
