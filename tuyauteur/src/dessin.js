// Tuyauteur : modèle de dessin commun (mm, axe Y vers le haut) et ses sorties SVG (aperçu) et DXF (découpe laser).
// Un même dessin sert à l'aperçu, au PDF et au DXF : ce qui est vu à l'écran est ce qui est découpé.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Dessin = fabrique();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // Calques : nom DXF, couleur DXF (ACI), type de trait, couleur et épaisseur à l'écran / sur papier (mm)
  const CALQUES = {
    DECOUPE: { aci: 7, ltype: 'CONTINUOUS', couleur: '#111111', ep: 0.35 },
    PLIAGE: { aci: 1, ltype: 'DASHED', couleur: '#c0392b', ep: 0.2, tirets: [6, 3] },
    TRACAGE: { aci: 3, ltype: 'CONTINUOUS', couleur: '#6b7280', ep: 0.15 },
    AXES: { aci: 4, ltype: 'DASHED', couleur: '#2563eb', ep: 0.15, tirets: [10, 2, 2, 2] },
    COTES: { aci: 5, ltype: 'CONTINUOUS', couleur: '#1d4ed8', ep: 0.15 },
    TEXTE: { aci: 2, ltype: 'CONTINUOUS', couleur: '#111111', ep: 0.15 },
  };

  // Erreur de saisie commune à tous les calculs : affichée telle quelle à l'utilisateur
  class ErreurSaisie extends Error {}

  function creer() {
    const d = { entites: [] };
    d.polyligne = (pts, calque = 'DECOUPE', ferme = false) => { if (pts.length > 1) d.entites.push({ type: 'polyligne', pts: pts.map(p => [p[0], p[1]]), calque, ferme }); return d; };
    d.ligne = (a, b, calque = 'TRACAGE') => d.polyligne([a, b], calque);
    // align : 'g' (gauche), 'c' (centre), 'd' (droite) ; angle en degrés
    d.texte = (x, y, h, texte, calque = 'TEXTE', align = 'g', angle = 0) => { d.entites.push({ type: 'texte', x, y, h, texte: String(texte), calque, align, angle }); return d; };
    d.cercle = (cx, cy, r, calque = 'DECOUPE', n = 72) => d.polyligne(Array.from({ length: n }, (_, i) => [cx + r * Math.cos(2 * Math.PI * i / n), cy + r * Math.sin(2 * Math.PI * i / n)]), calque, true);
    // Trou : vrai cercle dans le DXF (entité CIRCLE, découpe laser propre), polygone fin ailleurs
    d.trou = (cx, cy, r, calque = 'DECOUPE') => {
      d.cercle(cx, cy, r, calque, Math.max(24, Math.min(144, Math.round(r * 2))));
      d.entites[d.entites.length - 1].cercle = { cx, cy, r };
      return d;
    };
    // Cote alignée entre a et b, décalée de « decal » (vers la gauche du vecteur a→b)
    d.cote = (a, b, decal, texte, h = 3.5) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
      if (l < 1e-9) return d;
      const nx = -dy / l * decal, ny = dx / l * decal, ux = dx / l, uy = dy / l;
      const a2 = [a[0] + nx, a[1] + ny], b2 = [b[0] + nx, b[1] + ny];
      const s = Math.sign(decal) || 1, ext = 2 * s;
      d.ligne(a, [a2[0] + ext * -uy, a2[1] + ext * ux], 'COTES');
      d.ligne(b, [b2[0] + ext * -uy, b2[1] + ext * ux], 'COTES');
      d.ligne(a2, b2, 'COTES');
      const f = Math.min(h, l / 4);
      for (const [p, sg] of [[a2, 1], [b2, -1]]) {
        d.polyligne([[p[0] + sg * (ux * f - uy * f * 0.3), p[1] + sg * (uy * f + ux * f * 0.3)], p, [p[0] + sg * (ux * f + uy * f * 0.3), p[1] + sg * (uy * f - ux * f * 0.3)]], 'COTES');
      }
      let ang = Math.atan2(dy, dx) * 180 / Math.PI;
      if (ang > 90.001 || ang < -89.999) ang += 180;
      // Texte du côté extérieur de la cote, lisible (jamais à l'envers)
      const ox = -uy * s, oy = ux * s, ar = ang * Math.PI / 180;
      const dehors = (-Math.sin(ar)) * ox + Math.cos(ar) * oy > 0;
      const k = dehors ? 0.8 : 0.8 + h;
      d.texte((a2[0] + b2[0]) / 2 + ox * k, (a2[1] + b2[1]) / 2 + oy * k, h, texte, 'COTES', 'c', ang);
      return d;
    };
    return d;
  }

  function boite(d, calques) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of d.entites) {
      if (calques && !calques.includes(e.calque)) continue;
      const pts = e.type === 'texte' ? texteCoins(e) : e.pts;
      for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    }
    if (x0 === Infinity) return { x0: 0, y0: 0, x1: 1, y1: 1, l: 1, h: 1 };
    return { x0, y0, x1, y1, l: x1 - x0, h: y1 - y0 };
  }
  // Emprise approximative d'un texte (largeur moyenne d'un caractère ≈ 0,55 × hauteur)
  function texteCoins(e) {
    const l = e.texte.length * e.h * 0.55, a = e.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const dx = e.align === 'c' ? -l / 2 : e.align === 'd' ? -l : 0;
    return [[dx, 0], [dx + l, 0], [dx + l, e.h], [dx, e.h]].map(([u, v]) => [e.x + u * c - v * s, e.y + u * s + v * c]);
  }

  // Applique une transformation (rotation en degrés autour de l'origine puis translation)
  function transformer(d, angle, tx, ty) {
    const a = angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const f = ([x, y]) => [x * c - y * s + tx, x * s + y * c + ty];
    for (const e of d.entites) {
      if (e.type === 'texte') { [e.x, e.y] = f([e.x, e.y]); e.angle += angle; } else {
        e.pts = e.pts.map(f);
        if (e.cercle) [e.cercle.cx, e.cercle.cy] = f([e.cercle.cx, e.cercle.cy]);
      }
    }
    return d;
  }

  function fusionner(cible, source, tx = 0, ty = 0) {
    for (const e of source.entites) {
      const c = JSON.parse(JSON.stringify(e));
      if (c.type === 'texte') { c.x += tx; c.y += ty; } else {
        c.pts = c.pts.map(([x, y]) => [x + tx, y + ty]);
        if (c.cercle) { c.cercle.cx += tx; c.cercle.cy += ty; }
      }
      cible.entites.push(c);
    }
    return cible;
  }

  const echapperXML = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const n2 = v => Math.round(v * 100) / 100;

  // Aperçu SVG : le dessin entier, ajusté à la boîte du SVG (viewBox en mm)
  function versSVG(d, opts = {}) {
    const b = boite(d), m = Math.max(b.l, b.h) * 0.04 + 2;
    const vb = [b.x0 - m, -(b.y1 + m), b.l + 2 * m, b.h + 2 * m];
    // Traits en pixels écran (non-scaling-stroke), quelle que soit la taille du dessin
    const parts = [];
    for (const e of d.entites) {
      const c = CALQUES[e.calque] || CALQUES.TRACAGE;
      if (e.type === 'texte') {
        const anchor = e.align === 'c' ? 'middle' : e.align === 'd' ? 'end' : 'start';
        parts.push(`<text x="${n2(e.x)}" y="${n2(-e.y)}" font-size="${n2(e.h)}" text-anchor="${anchor}" fill="${c.couleur}"${e.angle ? ` transform="rotate(${n2(-e.angle)} ${n2(e.x)} ${n2(-e.y)})"` : ''}>${echapperXML(e.texte)}</text>`);
      } else {
        const pts = e.pts.map(([x, y]) => `${n2(x)},${n2(-y)}`).join(' ');
        const dash = c.tirets ? ` stroke-dasharray="${c.tirets.map(t => n2(t * 0.8)).join(' ')}"` : '';
        parts.push(`<${e.ferme ? 'polygon' : 'polyline'} points="${pts}" fill="none" stroke="${c.couleur}" stroke-width="${n2(Math.max(c.ep, 0.1) * 4.5)}"${dash} vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`);
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(n2).join(' ')}"${opts.classe ? ` class="${opts.classe}"` : ''} font-family="Helvetica, Arial, sans-serif">${parts.join('')}</svg>`;
  }

  // Texte DXF R12 : pas d'accents (les logiciels de découpe les lisent mal)
  const sansAccents = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/Ø/g, 'D').replace(/ø/g, 'd').replace(/°/g, '%%d').replace(/×/g, 'x').replace(/[^\x20-\x7e]/g, '?');
  const f6 = v => (Math.round(v * 1e4) / 1e4).toFixed(4);

  // DXF R12 (AC1009) en millimètres : POLYLINE, LINE, TEXT ; calques DECOUPE, PLIAGE, TRACAGE…
  // opts.calques : liste des calques à exporter (par défaut tous) ; opts.polylignes3d : [[x,y,z]…][] (axe de tuyauterie)
  function versDXF(d, opts = {}) {
    const L = [];
    const g = (code, val) => { L.push(String(code).padStart(3, ' '), String(val)); };
    const garder = e => !opts.calques || opts.calques.includes(e.calque);
    const ents = d.entites.filter(garder);
    const b = boite({ entites: ents });
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009');
    g(9, '$INSUNITS'); g(70, 4);
    g(9, '$EXTMIN'); g(10, f6(b.x0)); g(20, f6(b.y0)); g(30, f6(0));
    g(9, '$EXTMAX'); g(10, f6(b.x1)); g(20, f6(b.y1)); g(30, f6(0));
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 2);
    g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, f6(0));
    g(0, 'LTYPE'); g(2, 'DASHED'); g(70, 0); g(3, '__ __ __'); g(72, 65); g(73, 2); g(40, f6(9)); g(49, f6(6)); g(49, f6(-3));
    g(0, 'ENDTAB');
    const noms = Object.keys(CALQUES);
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, noms.length + 1);
    g(0, 'LAYER'); g(2, '0'); g(70, 0); g(62, 7); g(6, 'CONTINUOUS');
    for (const n of noms) { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, CALQUES[n].aci); g(6, CALQUES[n].ltype); }
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    for (const e of ents) {
      if (e.type === 'texte') {
        const al = e.align === 'c' ? 1 : e.align === 'd' ? 2 : 0;
        g(0, 'TEXT'); g(8, e.calque); g(10, f6(e.x)); g(20, f6(e.y)); g(30, f6(0)); g(40, f6(e.h)); g(1, sansAccents(e.texte));
        if (e.angle) g(50, f6(e.angle));
        if (al) { g(72, al); g(11, f6(e.x)); g(21, f6(e.y)); g(31, f6(0)); }
      } else if (e.cercle) {
        g(0, 'CIRCLE'); g(8, e.calque); g(10, f6(e.cercle.cx)); g(20, f6(e.cercle.cy)); g(30, f6(0)); g(40, f6(e.cercle.r));
      } else if (e.pts.length === 2 && !e.ferme) {
        g(0, 'LINE'); g(8, e.calque); g(10, f6(e.pts[0][0])); g(20, f6(e.pts[0][1])); g(30, f6(0)); g(11, f6(e.pts[1][0])); g(21, f6(e.pts[1][1])); g(31, f6(0));
      } else {
        g(0, 'POLYLINE'); g(8, e.calque); g(66, 1); g(10, f6(0)); g(20, f6(0)); g(30, f6(0)); g(70, e.ferme ? 1 : 0);
        for (const [x, y] of e.pts) { g(0, 'VERTEX'); g(8, e.calque); g(10, f6(x)); g(20, f6(y)); g(30, f6(0)); }
        g(0, 'SEQEND'); g(8, e.calque);
      }
    }
    for (const pl of opts.polylignes3d || []) {
      g(0, 'POLYLINE'); g(8, pl.calque || 'AXES'); g(66, 1); g(10, f6(0)); g(20, f6(0)); g(30, f6(0)); g(70, 8);
      for (const [x, y, z] of pl.pts) { g(0, 'VERTEX'); g(8, pl.calque || 'AXES'); g(10, f6(x)); g(20, f6(y)); g(30, f6(z)); g(70, 32); }
      g(0, 'SEQEND'); g(8, pl.calque || 'AXES');
    }
    g(0, 'ENDSEC');
    g(0, 'EOF');
    return L.join('\r\n') + '\r\n';
  }

  return { ErreurSaisie, CALQUES, creer, boite, transformer, fusionner, versSVG, versDXF, sansAccents };
}));
