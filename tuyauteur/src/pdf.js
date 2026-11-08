// Tuyauteur : PDF imprimable (pdf-lib).
//   Fiche : données, résultats, tableaux de traçage, dessins à une échelle normalisée.
//   Gabarit 1:1 : le dessin en vraie grandeur, découpé en feuilles A4/A3 à assembler (repères, mire de 100 mm).
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./dessin.js'));
  else racine.ExportPDF = fabrique(racine.Dessin);
}(typeof self !== 'undefined' ? self : this, function (Dessin) {
  'use strict';
  const MM = 72 / 25.4;
  const FORMATS = { A4: [210, 297], A3: [297, 420] };
  const ECHELLES = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 500];
  const lib = () => (typeof PDFLib !== 'undefined' ? PDFLib : globalThis.PDFLib);

  // Caractères hors WinAnsi (police standard Helvetica) remplacés
  const WIN = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
  const REMPL = { 'α': 'a', 'β': 'b', 'π': 'pi', '≈': '~', '≤': '<=', '≥': '>=', '→': '->', '⌀': 'Ø', '−': '-', ' ': ' ', ' ': ' ', '✓': 'x', '⚠': '!' };
  const winAnsi = s => Array.from(String(s)).map(c => {
    const n = c.charCodeAt(0);
    if ((n >= 0x20 && n < 0x7f) || (n >= 0xa0 && n <= 0xff) || WIN.has(c)) return c;
    return REMPL[c] ?? '?';
  }).join('');
  const couleur = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  // Trace un dessin : point (0,0) du dessin en (ox, oy) points PDF, k points par mm de dessin, découpe optionnelle
  function tracer(page, polices, dessin, { ox, oy, k, clip, texteMin = 3 }) {
    const L = lib();
    const ops = [L.pushGraphicsState()];
    if (clip) ops.push(L.rectangle(clip[0], clip[1], clip[2], clip[3]), L.clip(), L.endPath());
    ops.push(L.setLineJoin(1), L.setLineCap(1));
    const P = ([x, y]) => [ox + x * k, oy + y * k];
    let enCours = null;
    for (const e of dessin.entites) {
      if (e.type === 'texte') continue;
      const c = Dessin.CALQUES[e.calque] || Dessin.CALQUES.TRACAGE;
      if (enCours !== e.calque) {
        const [r, g, b] = couleur(c.couleur);
        ops.push(L.setStrokingRgbColor(r, g, b), L.setLineWidth(c.ep * MM), L.setDashPattern(c.tirets ? c.tirets.map(t => t * MM) : [], 0));
        enCours = e.calque;
      }
      const [x0, y0] = P(e.pts[0]);
      ops.push(L.moveTo(x0, y0));
      for (let i = 1; i < e.pts.length; i++) { const [x, y] = P(e.pts[i]); ops.push(L.lineTo(x, y)); }
      if (e.ferme) ops.push(L.closePath());
      ops.push(L.stroke());
    }
    page.pushOperators(...ops);
    for (const e of dessin.entites) {
      if (e.type !== 'texte') continue;
      const c = Dessin.CALQUES[e.calque] || Dessin.CALQUES.TEXTE;
      const taille = Math.max(texteMin, e.h * k), txt = winAnsi(e.texte);
      const l = polices.n.widthOfTextAtSize(txt, taille);
      const dx = e.align === 'c' ? -l / 2 : e.align === 'd' ? -l : 0;
      const a = e.angle * Math.PI / 180, [x, y] = P([e.x, e.y]);
      const [r, g, b] = couleur(c.couleur);
      page.drawText(txt, { x: x + dx * Math.cos(a), y: y + dx * Math.sin(a), size: taille, font: polices.n, color: L.rgb(r, g, b), rotate: L.degrees(e.angle) });
    }
    page.pushOperators(L.popGraphicsState());
  }

  // Document d'une étude : { titre, sousTitre, infos: [[libellé, valeur]], resultats: [[libellé, valeur]],
  //   avertissements: [], tableaux: [{ titre, colonnes, lignes }], dessins: [{ titre, dessin, gabarit }],
  //   echelle1: bool (ajoute les feuilles 1:1 des dessins « gabarit »), format: 'A4' | 'A3', pied }
  async function creer(etude) {
    const L = lib();
    const doc = await L.PDFDocument.create();
    doc.setTitle(winAnsi(etude.titre)); doc.setCreator('Pipe-Fit Tuyauteur'); doc.setProducer('Pipe-Fit Tuyauteur');
    const polices = { n: await doc.embedFont(L.StandardFonts.Helvetica), g: await doc.embedFont(L.StandardFonts.HelveticaBold) };
    const [PW, PH] = FORMATS.A4.map(v => v * MM);
    const marge = 14 * MM;
    const gris = L.rgb(0.42, 0.45, 0.5), noir = L.rgb(0.07, 0.07, 0.07), bleu = L.rgb(0.11, 0.3, 0.85);
    const date = etude.date || new Date().toLocaleDateString('fr-FR');
    let page, y, nPage = 0;
    const pages = [];
    const nouvellePage = () => {
      page = doc.addPage([PW, PH]); pages.push(page); nPage++;
      page.drawText(winAnsi(etude.titre), { x: marge, y: PH - marge - 4, size: 14, font: polices.g, color: noir });
      if (etude.sousTitre) page.drawText(winAnsi(etude.sousTitre), { x: marge, y: PH - marge - 19, size: 9.5, font: polices.n, color: gris });
      page.drawText(winAnsi(`Pipe-Fit Tuyauteur - ${date}`), { x: PW - marge - polices.n.widthOfTextAtSize(winAnsi(`Pipe-Fit Tuyauteur - ${date}`), 8), y: PH - marge - 4, size: 8, font: polices.n, color: gris });
      page.drawLine({ start: { x: marge, y: PH - marge - 26 }, end: { x: PW - marge, y: PH - marge - 26 }, thickness: 0.6, color: bleu });
      y = PH - marge - 42;
    };
    const place = h => { if (y - h < marge + 14) nouvellePage(); };
    const texte = (t, x, yy, taille = 9, gras = false, c = noir) => page.drawText(winAnsi(t), { x, y: yy, size: taille, font: gras ? polices.g : polices.n, color: c });
    const titreSection = t => { place(24); texte(t, marge, y, 11, true, bleu); y -= 15; };

    nouvellePage();
    // Données et résultats côte à côte
    const colW = (PW - 2 * marge) / 2;
    const bloc = (titre, lignes, x) => {
      let yy = y;
      texte(titre, x, yy, 11, true, bleu); yy -= 15;
      for (const [lib2, val] of lignes) {
        texte(lib2, x, yy, 9, false, gris);
        const v = winAnsi(val);
        page.drawText(v, { x: x + colW - 10 - polices.g.widthOfTextAtSize(v, 9), y: yy, size: 9, font: polices.g, color: noir });
        yy -= 12.5;
      }
      return yy;
    };
    const hBloc = Math.max((etude.infos || []).length, (etude.resultats || []).length) * 12.5 + 20;
    place(hBloc);
    const y1 = bloc('Données', etude.infos || [], marge), y2 = bloc('Résultats', etude.resultats || [], marge + colW + 10);
    y = Math.min(y1, y2) - 8;
    if ((etude.avertissements || []).length) {
      for (const a of etude.avertissements) { place(14); texte(`! ${a}`, marge, y, 9, true, L.rgb(0.75, 0.22, 0.17)); y -= 13; }
      y -= 4;
    }
    // Tableaux (paginés)
    for (const t of etude.tableaux || []) {
      titreSection(t.titre);
      const n = t.colonnes.length, w = (PW - 2 * marge) / n;
      const entete = () => {
        page.drawRectangle({ x: marge, y: y - 3, width: PW - 2 * marge, height: 13, color: L.rgb(0.93, 0.95, 0.98) });
        t.colonnes.forEach((c, i) => { const v = winAnsi(c); page.drawText(v, { x: marge + (i + 1) * w - 4 - polices.g.widthOfTextAtSize(v, 8), y, size: 8, font: polices.g }); });
        y -= 13;
      };
      entete();
      for (const ligne of t.lignes) {
        if (y < marge + 24) { nouvellePage(); entete(); }
        ligne.forEach((c, i) => {
          const v = winAnsi(c == null ? '' : c);
          page.drawText(v, { x: marge + (i + 1) * w - 4 - polices.n.widthOfTextAtSize(v, 8), y, size: 8, font: polices.n, color: noir });
        });
        page.drawLine({ start: { x: marge, y: y - 3 }, end: { x: PW - marge, y: y - 3 }, thickness: 0.2, color: L.rgb(0.85, 0.87, 0.9) });
        y -= 11.5;
      }
      y -= 8;
    }
    // Dessins à l'échelle normalisée qui tient dans la place disponible (nouvelle page si besoin)
    for (const d of etude.dessins || []) {
      const b = Dessin.boite(d.dessin);
      const lDispo = PW - 2 * marge;
      const choisir = hDispo => ECHELLES.find(e => b.l * MM / e <= lDispo && b.h * MM / e <= hDispo);
      let e = choisir(y - marge - 40);
      const ePleine = choisir(PH - 2 * marge - 70);
      if (!e || (ePleine && e > ePleine * 2)) { nouvellePage(); e = ePleine || ECHELLES[ECHELLES.length - 1]; }
      titreSection(`${d.titre} - échelle ${e === 1 ? '1:1' : `1:${String(e).replace('.', ',')}`}`);
      const k = MM / e, hD = b.h * k;
      const ox = marge + (lDispo - b.l * k) / 2 - b.x0 * k, oy = y - 6 - hD - b.y0 * k;
      tracer(page, polices, d.dessin, { ox, oy, k, texteMin: 4 });
      y = y - 6 - hD - 16;
      if (d.gabarit && etude.echelle1) { texte(etude.format === 'page' ? 'Gabarit en vraie grandeur : voir la page 1:1 à la suite.' : 'Gabarit en vraie grandeur : voir les feuilles 1:1 à la suite.', marge, y + 4, 8, false, gris); y -= 10; }
    }
    // Feuilles 1:1 assemblables
    if (etude.echelle1) {
      for (const d of (etude.dessins || []).filter(x => x.gabarit)) {
        // Une seule grande page en vraie grandeur (traceur, imprimeur) ; au-delà de 5 m, feuilles A3
        if (etude.format === 'page' && !pageUnique(doc, polices, d, etude)) feuilles11(doc, polices, d, ...FORMATS.A3, etude);
        else if (etude.format !== 'page') feuilles11(doc, polices, d, ...FORMATS[etude.format === 'A3' ? 'A3' : 'A4'], etude);
      }
    }
    // Pied de page
    const toutes = doc.getPages();
    toutes.forEach((p, i) => {
      const [w] = [p.getWidth()];
      const t = winAnsi(`${etude.pied || etude.titre} - page ${i + 1}/${toutes.length}`);
      p.drawText(t, { x: w - 10 * MM - polices.n.widthOfTextAtSize(t, 7), y: 5 * MM, size: 7, font: polices.n, color: gris });
    });
    return doc.save();
  }

  // Dessin 1:1 sur une seule page à sa taille (marges 15 mm, bandeau 20 mm) ; false si la page dépasse 5 m
  function pageUnique(doc, polices, d, etude) {
    const L = lib();
    const b = Dessin.boite(d.dessin), m = 15, bandeau = 20;
    const w = Math.max(210, b.l + 2 * m), h = Math.max(150, b.h + 2 * m + bandeau);
    if (w > 5000 || h > 5000) return false;
    const page = doc.addPage([w * MM, h * MM]);
    const ox = (w - b.l) / 2 - b.x0, oy = bandeau + m + (h - bandeau - 2 * m - b.h) / 2 - b.y0;
    tracer(page, polices, d.dessin, { ox: ox * MM, oy: oy * MM, k: MM, texteMin: 0 });
    const gris = L.rgb(0.42, 0.45, 0.5);
    page.drawText(winAnsi(`${d.titre} - grandeur réelle 1:1 - page ${fmtMM(w)} × ${fmtMM(h)} mm`), { x: m * MM, y: 11 * MM, size: 9, font: polices.g });
    page.drawText(winAnsi('Imprimer en taille réelle (100 %, sans ajustement), sur traceur ou grand format. Contrôler la mire : 100 mm.'), { x: m * MM, y: 6.5 * MM, size: 7, font: polices.n, color: gris });
    const mx = (w - m - 100) * MM, my = 13 * MM;
    page.drawLine({ start: { x: mx, y: my }, end: { x: mx + 100 * MM, y: my }, thickness: 0.8 });
    for (let t = 0; t <= 10; t++) page.drawLine({ start: { x: mx + t * 10 * MM, y: my }, end: { x: mx + t * 10 * MM, y: my + (t % 5 ? 1.5 : 3) * MM }, thickness: 0.5 });
    page.drawText('100 mm', { x: mx + 42 * MM, y: my + 1.2 * MM, size: 6.5, font: polices.n });
    void etude;
    return true;
  }
  const fmtMM = v => String(Math.round(v));

  // Découpe un dessin 1:1 en feuilles (orientation qui minimise le nombre de feuilles), avec cadres, repères et mire
  function feuilles11(doc, polices, d, FW, FH, etude) {
    const L = lib();
    const b = Dessin.boite(d.dessin), m = 10, bandeau = 16;
    const options = [[FW, FH], [FH, FW]].map(([w, h]) => {
      const uw = w - 2 * m, uh = h - 2 * m - bandeau;
      return { w, h, uw, uh, nx: Math.ceil((b.l + 10) / uw), ny: Math.ceil((b.h + 10) / uh) };
    });
    const o = options.sort((p, q) => p.nx * p.ny - q.nx * q.ny)[0];
    // Dessin centré dans la grille
    const x0 = b.x0 - (o.nx * o.uw - b.l) / 2, y0 = b.y0 - (o.ny * o.uh - b.h) / 2;
    const gris = L.rgb(0.42, 0.45, 0.5);
    for (let j = o.ny - 1; j >= 0; j--) {
      for (let i = 0; i < o.nx; i++) {
        const page = doc.addPage([o.w * MM, o.h * MM]);
        const cx = m * MM, cy = (m + bandeau) * MM, cw = o.uw * MM, ch = o.uh * MM;
        // Zone (i, j) du dessin dans le cadre
        tracer(page, polices, d.dessin, { ox: cx - (x0 + i * o.uw) * MM, oy: cy - (y0 + j * o.uh) * MM, k: MM, clip: [cx, cy, cw, ch], texteMin: 0 });
        page.drawRectangle({ x: cx, y: cy, width: cw, height: ch, borderColor: gris, borderWidth: 0.3, borderDashArray: [2, 2] });
        // Croix de repérage aux coins (à superposer d'une feuille à l'autre)
        for (const [px, py] of [[cx, cy], [cx + cw, cy], [cx, cy + ch], [cx + cw, cy + ch]]) {
          page.drawLine({ start: { x: px - 4 * MM, y: py }, end: { x: px + 4 * MM, y: py }, thickness: 0.4, color: L.rgb(0, 0, 0) });
          page.drawLine({ start: { x: px, y: py - 4 * MM }, end: { x: px, y: py + 4 * MM }, thickness: 0.4, color: L.rgb(0, 0, 0) });
        }
        const lettre = String.fromCharCode(65 + (o.ny - 1 - j));
        const nom = `${lettre}${i + 1}`;
        page.drawText(winAnsi(`Feuille ${nom} (${o.ny} ligne${o.ny > 1 ? 's' : ''} x ${o.nx} colonne${o.nx > 1 ? 's' : ''}) - ${d.titre} 1:1`), { x: cx, y: 8 * MM, size: 8, font: polices.g });
        page.drawText(winAnsi(`Imprimer en taille réelle (100 %, sans ajustement). Contrôler la mire : 100 mm. Assembler bord à bord sur les traits pointillés.`), { x: cx, y: 4.5 * MM, size: 6.5, font: polices.n, color: gris });
        // Mire de contrôle 100 mm
        const mx = cx + cw - 100 * MM, my = 12.5 * MM;
        page.drawLine({ start: { x: mx, y: my }, end: { x: mx + 100 * MM, y: my }, thickness: 0.8 });
        for (let t = 0; t <= 10; t++) page.drawLine({ start: { x: mx + t * 10 * MM, y: my }, end: { x: mx + t * 10 * MM, y: my + (t % 5 ? 1.5 : 3) * MM }, thickness: 0.5 });
        page.drawText('100 mm', { x: mx + 42 * MM, y: my + 1.2 * MM, size: 6.5, font: polices.n });
        // Voisins
        const fleche = (txt, x, y) => page.drawText(winAnsi(txt), { x, y, size: 6, font: polices.n, color: gris });
        if (i > 0) fleche(`< ${lettre}${i}`, cx + 1 * MM, cy + ch / 2);
        if (i < o.nx - 1) fleche(`${lettre}${i + 2} >`, cx + cw - 10 * MM, cy + ch / 2);
        if (j < o.ny - 1) fleche(`^ ${String.fromCharCode(64 + (o.ny - 1 - j))}${i + 1}`, cx + cw / 2, cy + ch - 3 * MM);
        if (j > 0) fleche(`v ${String.fromCharCode(66 + (o.ny - 1 - j))}${i + 1}`, cx + cw / 2, cy + 1.5 * MM);
      }
    }
    return o.nx * o.ny;
  }

  return { creer, winAnsi, FORMATS };
}));
