// Moteur d'Atelier PDF : assemble les pages choisies (PDF, images, pages blanches) en un seul PDF,
// avec rotations, éléments ajoutés (texte, masque, surlignage, cadre, image/signature), numérotation,
// filigrane, page de sommaire et signets. Utilise pdf-lib (global PDFLib), dans le navigateur comme sous Node.
//
// Coordonnées des éléments ajoutés : fractions (0..1) de la page TELLE QU'AFFICHÉE (rotation comprise),
// origine en haut à gauche. Elles sont converties ici dans l'espace de la page PDF non tournée.
(function (racine, fabrique) {
  const api = fabrique(() => racine.PDFLib);
  if (typeof module === 'object' && module.exports) module.exports = api; else racine.MoteurPDF = api;
})(typeof self !== 'undefined' ? self : globalThis, function (lib) {
  'use strict';

  const A4 = [595.28, 841.89];
  const mm = v => v * 72 / 25.4;

  // ---------- Géométrie ----------
  const normRot = r => ((Math.round(r / 90) * 90) % 360 + 360) % 360;

  // Point affiché (u, v) -> point PDF (x, y) pour une boîte {x, y, width, height} tournée de r degrés (sens horaire)
  function versPdf(boite, r, u, v) {
    const { x: x0, y: y0, width: W, height: H } = boite;
    switch (normRot(r)) {
      case 90: return { x: x0 + v * W, y: y0 + u * H };
      case 180: return { x: x0 + (1 - u) * W, y: y0 + v * H };
      case 270: return { x: x0 + (1 - v) * W, y: y0 + (1 - u) * H };
      default: return { x: x0 + u * W, y: y0 + (1 - v) * H };
    }
  }
  // Taille affichée (points) de la page
  const tailleAffichee = (boite, r) => (normRot(r) % 180 ? { l: boite.height, h: boite.width } : { l: boite.width, h: boite.height });

  // Rectangle affiché (fractions) -> rectangle PDF aligné sur les axes
  function rectPdf(boite, r, e) {
    const a = versPdf(boite, r, e.x, e.y), b = versPdf(boite, r, e.x + e.w, e.y + e.h);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
  }

  function couleur(hex, defaut = [0, 0, 0]) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    const c = m ? [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16) / 255) : defaut;
    return lib().rgb(c[0], c[1], c[2]);
  }

  // Caractères non représentables par la police standard (WinAnsi) remplacés, pour ne jamais échouer
  function nettoyer(police, texte) {
    const remplacements = { '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-', ' ': ' ', ' ': ' ', '…': '...' };
    let sortie = '';
    for (const ch of String(texte ?? '')) {
      const c = remplacements[ch] ?? ch;
      try { police.encodeText(c); sortie += c; } catch { sortie += '?'; }
    }
    return sortie;
  }

  // Texte posé à l'endroit (dans le sens de lecture de la page affichée), coin haut-gauche en (u, v)
  function poserTexte(page, boite, r, police, { texte, u, v, taille, coul, opacite = 1, interligne = 1.2 }) {
    const { degrees } = lib();
    const affiche = tailleAffichee(boite, r);
    const lignes = String(texte).split(/\r?\n/);
    lignes.forEach((ligne, i) => {
      const t = nettoyer(police, ligne);
      if (!t) return;
      const vBase = v + ((i * interligne * taille) + taille * 0.94) / affiche.h;
      const p = versPdf(boite, r, u, vBase);
      page.drawText(t, { x: p.x, y: p.y, size: taille, font: police, color: coul, opacity: opacite, rotate: degrees(normRot(r)) });
    });
  }

  // ---------- Formes vectorielles (communes à l'écran et au PDF) ----------
  // Chaque forme est décrite dans le repère de la page affichée, en unités « l × h » (points pour le PDF,
  // pixels à l'écran), k = unités par point (taille des pointes de flèche, épaisseurs, arrondis).
  // Résultat : [{ cmds: [['M',x,y],['L',x,y],['C',x1,y1,x2,y2,x,y],['Z']], trait, fond, epaisseur, rond, opacite }]
  const DEFAUTS = { ligne: '#d32f2f', fleche: '#d32f2f', crayon: '#1565c0', ellipse: '#d32f2f', cadre: '#d32f2f', bulle: '#1565c0', texte: '#000000' };
  const K_ELLIPSE = 0.5523;

  function cmdsRect(x, y, w, h) { return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']]; }
  function cmdsEllipse(x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, ox = rx * K_ELLIPSE, oy = ry * K_ELLIPSE;
    return [['M', cx - rx, cy], ['C', cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry], ['C', cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy],
      ['C', cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry], ['C', cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy], ['Z']];
  }
  // Bulle : rectangle arrondi dont un côté porte une pointe dirigée vers (px, py)
  function cmdsBulle(x, y, w, h, px, py, k) {
    const r = Math.min(8 * k, w / 3, h / 3);
    const dx = (px - (x + w / 2)) / Math.max(w, 1e-6), dy = (py - (y + h / 2)) / Math.max(h, 1e-6);
    const dedans = px > x && px < x + w && py > y && py < y + h;
    const cote = dedans ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'd' : 'g') : (dy > 0 ? 'b' : 'h');
    const base = (debut, fin) => Math.min(14 * k, (fin - debut - 2 * r) * 0.5); // largeur de la pointe
    const c = [];
    // Points de passage dans le sens horaire (y vers le bas)
    c.push(['M', x + r, y]);
    if (cote === 'h') { const b = base(x, x + w); const m = Math.min(Math.max(px, x + r + b / 2), x + w - r - b / 2); c.push(['L', m - b / 2, y], ['L', px, py], ['L', m + b / 2, y]); }
    c.push(['L', x + w - r, y], ['C', x + w - r * (1 - K_ELLIPSE), y, x + w, y + r * (1 - K_ELLIPSE), x + w, y + r]);
    if (cote === 'd') { const b = base(y, y + h); const m = Math.min(Math.max(py, y + r + b / 2), y + h - r - b / 2); c.push(['L', x + w, m - b / 2], ['L', px, py], ['L', x + w, m + b / 2]); }
    c.push(['L', x + w, y + h - r], ['C', x + w, y + h - r * (1 - K_ELLIPSE), x + w - r * (1 - K_ELLIPSE), y + h, x + w - r, y + h]);
    if (cote === 'b') { const b = base(x, x + w); const m = Math.min(Math.max(px, x + r + b / 2), x + w - r - b / 2); c.push(['L', m + b / 2, y + h], ['L', px, py], ['L', m - b / 2, y + h]); }
    c.push(['L', x + r, y + h], ['C', x + r * (1 - K_ELLIPSE), y + h, x, y + h - r * (1 - K_ELLIPSE), x, y + h - r]);
    if (cote === 'g') { const b = base(y, y + h); const m = Math.min(Math.max(py, y + r + b / 2), y + h - r - b / 2); c.push(['L', x, m + b / 2], ['L', px, py], ['L', x, m - b / 2]); }
    c.push(['L', x, y + r], ['C', x, y + r * (1 - K_ELLIPSE), x + r * (1 - K_ELLIPSE), y, x + r, y], ['Z']);
    return c;
  }

  function formes(e, l, h, k = 1) {
    const ep = (e.epaisseur || 2) * k;
    const coul = e.couleur || DEFAUTS[e.type] || '#000000';
    const X = v => v * l, Y = v => v * h;
    switch (e.type) {
      case 'ligne':
        return [{ cmds: [['M', X(e.x1), Y(e.y1)], ['L', X(e.x2), Y(e.y2)]], trait: coul, epaisseur: ep, rond: true }];
      case 'fleche': {
        const x1 = X(e.x1), y1 = Y(e.y1), x2 = X(e.x2), y2 = Y(e.y2);
        const lg = Math.hypot(x2 - x1, y2 - y1) || 1;
        const ux = (x2 - x1) / lg, uy = (y2 - y1) / lg;
        const tete = Math.min(lg * 0.6, Math.max(9 * k, ep * 4)), demi = tete * 0.45;
        const bx = x2 - ux * tete, by = y2 - uy * tete;
        return [
          { cmds: [['M', x1, y1], ['L', bx + ux * ep * 0.5, by + uy * ep * 0.5]], trait: coul, epaisseur: ep, rond: true },
          { cmds: [['M', x2, y2], ['L', bx - uy * demi, by + ux * demi], ['L', bx + uy * demi, by - ux * demi], ['Z']], fond: coul },
        ];
      }
      case 'crayon': {
        const pts = e.points || [];
        if (!pts.length) return [];
        const cmds = pts.map(([px, py], i) => [i ? 'L' : 'M', X(px), Y(py)]);
        if (pts.length === 1) cmds.push(['L', X(pts[0][0]) + 0.01, Y(pts[0][1])]);
        return [{ cmds, trait: coul, epaisseur: ep, rond: true }];
      }
      case 'ellipse':
        return [{ cmds: cmdsEllipse(X(e.x), Y(e.y), X(e.w), Y(e.h)), trait: coul, epaisseur: ep, fond: e.fond || null }];
      case 'bulle':
        return [{ cmds: cmdsBulle(X(e.x), Y(e.y), X(e.w), Y(e.h), X(e.px ?? e.x), Y(e.py ?? (e.y + e.h + 0.05)), k), trait: coul, epaisseur: Math.max(k, ep * 0.75), fond: e.fond || '#ffffff' }];
      default:
        return [];
    }
  }

  // Commandes -> chemin SVG, chaque point passé par f(x, y) -> [X, Y]
  function chemin(cmds, f = (x, y) => [x, y]) {
    const n = v => (Math.round(v * 1000) / 1000).toString();
    return cmds.map(c => {
      if (c[0] === 'Z') return 'Z';
      const pts = [];
      for (let i = 1; i < c.length; i += 2) { const [a, b] = f(c[i], c[i + 1]); pts.push(n(a), n(b)); }
      return `${c[0]} ${pts.join(' ')}`;
    }).join(' ');
  }

  // Texte coupé en lignes tenant dans « max » (mots trop longs coupés)
  function couperLignes(mesure, texte, max) {
    const res = [];
    String(texte || '').split(/\r?\n/).forEach(par => {
      let ligne = '';
      for (const mot of par.split(/(\s+)/)) {
        const essai = ligne + mot;
        if (!ligne || mesure(essai.trimEnd()) <= max) { ligne = essai; continue; }
        res.push(ligne.trimEnd());
        ligne = mot.trimStart();
        while (ligne.length > 1 && mesure(ligne) > max) {
          let i = ligne.length - 1;
          while (i > 1 && mesure(ligne.slice(0, i)) > max) i--;
          res.push(ligne.slice(0, i)); ligne = ligne.slice(i);
        }
      }
      res.push(ligne.trimEnd());
    });
    return res;
  }
  const MARGE_BULLE = 6; // points

  // ---------- Éléments ajoutés sur une page ----------
  async function dessinerElements(sortie, page, r, elements, ctx) {
    const { degrees, LineCapStyle } = lib();
    const boite = page.getCropBox();
    const affiche = tailleAffichee(boite, r);
    const versChemin = (x, y) => { const p = versPdf(boite, r, x / affiche.l, y / affiche.h); return [p.x, -p.y]; };
    for (const e of elements || []) {
      if (e.type === 'texte') {
        const police = e.gras ? ctx.policeGras : ctx.police;
        poserTexte(page, boite, r, police, { texte: e.texte || '', u: e.x, v: e.y, taille: e.taille || 12, coul: couleur(e.couleur) });
      } else if (e.type === 'masque') {
        page.drawRectangle({ ...rectPdf(boite, r, e), color: couleur(e.couleur, [1, 1, 1]) });
      } else if (e.type === 'caviarde') {
        page.drawRectangle({ ...rectPdf(boite, r, e), color: couleur('#000000') });
      } else if (e.type === 'surligne') {
        page.drawRectangle({ ...rectPdf(boite, r, e), color: couleur(e.couleur || '#ffeb3b'), opacity: 0.35 });
      } else if (e.type === 'cadre') {
        page.drawRectangle({ ...rectPdf(boite, r, e), borderColor: couleur(e.couleur || '#d32f2f'), borderWidth: e.epaisseur || 2 });
      } else if (e.type === 'image') {
        const img = await ctx.image(e.image);
        if (!img) continue;
        // Coin bas-gauche de l'image affichée = point d'ancrage, puis rotation pour qu'elle reste à l'endroit
        const p = versPdf(boite, r, e.x, e.y + e.h);
        page.drawImage(img, { x: p.x, y: p.y, width: e.w * affiche.l, height: e.h * affiche.h, rotate: degrees(normRot(r)) });
      }
      for (const f of formes(e, affiche.l, affiche.h, 1)) {
        const o = { x: 0, y: 0 };
        if (f.trait) Object.assign(o, { borderColor: couleur(f.trait), borderWidth: f.epaisseur, borderLineCap: f.rond ? LineCapStyle.Round : LineCapStyle.Butt });
        if (f.fond) o.color = couleur(f.fond);
        page.drawSvgPath(chemin(f.cmds, versChemin), o);
      }
      if (e.type === 'bulle' && e.texte) {
        const police = e.gras ? ctx.policeGras : ctx.police;
        const taille = e.taille || 11;
        const largeur = e.w * affiche.l - 2 * MARGE_BULLE;
        const lignes = couperLignes(t => police.widthOfTextAtSize(nettoyer(police, t), taille), e.texte, largeur);
        poserTexte(page, boite, r, police, { texte: lignes.join('\n'), u: e.x + MARGE_BULLE / affiche.l, v: e.y + MARGE_BULLE / affiche.h, taille, coul: couleur(e.couleurTexte || '#000000') });
      }
    }
  }

  // ---------- Sommaire et signets ----------
  // Pages consécutives d'un même document = une entrée
  function groupes(pages) {
    const res = [];
    pages.forEach((p, i) => {
      const titre = p.groupe || '';
      const dernier = res[res.length - 1];
      if (dernier && dernier.cle === (p.source ?? `blanc${i}`) && p.source != null) return;
      res.push({ cle: p.source ?? `blanc${i}`, titre, debut: i, sansTitre: p.source == null });
    });
    return res.filter(g => !g.sansTitre && g.titre);
  }

  const LIGNES_PAR_PAGE_SOMMAIRE = 32;
  function ajouterSommaire(sortie, entrees, ctx, titreDoc, numeroDe) {
    const { rgb } = lib();
    const nb = Math.max(1, Math.ceil(entrees.length / LIGNES_PAR_PAGE_SOMMAIRE));
    const pagesS = [];
    for (let s = 0; s < nb; s++) {
      const page = sortie.insertPage(s, A4);
      pagesS.push(page);
      const [L, H] = A4;
      let y = H - mm(25);
      if (s === 0) {
        if (titreDoc) {
          page.drawText(nettoyer(ctx.policeGras, titreDoc), { x: mm(20), y, size: 18, font: ctx.policeGras, color: rgb(0.1, 0.1, 0.1) });
          y -= 30;
        }
        page.drawText('Sommaire', { x: mm(20), y, size: 15, font: ctx.policeGras, color: rgb(0.15, 0.3, 0.55) });
        y -= 10;
        page.drawLine({ start: { x: mm(20), y }, end: { x: L - mm(20), y }, thickness: 1, color: rgb(0.15, 0.3, 0.55) });
        y -= 24;
      }
      entrees.slice(s * LIGNES_PAR_PAGE_SOMMAIRE, (s + 1) * LIGNES_PAR_PAGE_SOMMAIRE).forEach(e => {
        const num = String(numeroDe(e.pageFinale));
        const largeurNum = ctx.police.widthOfTextAtSize(num, 11);
        let titre = nettoyer(ctx.police, e.titre);
        const max = L - mm(40) - largeurNum - 30;
        while (titre.length > 3 && ctx.police.widthOfTextAtSize(titre, 11) > max) titre = titre.slice(0, -4) + '...';
        const lt = ctx.police.widthOfTextAtSize(titre, 11);
        page.drawText(titre, { x: mm(20), y, size: 11, font: ctx.police, color: rgb(0.1, 0.1, 0.1) });
        // Points de conduite
        const debutPts = mm(20) + lt + 6, finPts = L - mm(20) - largeurNum - 6;
        if (finPts > debutPts) {
          const pas = ctx.police.widthOfTextAtSize('.', 11) + 1.5;
          const n = Math.floor((finPts - debutPts) / pas);
          page.drawText('.'.repeat(Math.max(0, n)), { x: debutPts, y, size: 11, font: ctx.police, color: rgb(0.6, 0.6, 0.6), characterSpacing: 1.5 });
        }
        page.drawText(num, { x: L - mm(20) - largeurNum, y, size: 11, font: ctx.police, color: rgb(0.1, 0.1, 0.1) });
        e.zone = { page, x: mm(20), y: y - 3, w: L - mm(40), h: 15 };
        y -= 21;
      });
    }
    return pagesS;
  }

  // Liens cliquables du sommaire vers les pages
  function liensSommaire(sortie, entrees) {
    const { PDFName } = lib();
    const ctxPdf = sortie.context;
    entrees.forEach(e => {
      if (!e.zone) return;
      const cible = sortie.getPage(e.pageFinale);
      const lien = ctxPdf.register(ctxPdf.obj({
        Type: 'Annot', Subtype: 'Link', Rect: [e.zone.x, e.zone.y, e.zone.x + e.zone.w, e.zone.y + e.zone.h],
        Border: [0, 0, 0], Dest: [cible.ref, 'Fit'],
      }));
      const annots = e.zone.page.node.lookup(PDFName.of('Annots'));
      if (annots) annots.push(lien); else e.zone.page.node.set(PDFName.of('Annots'), ctxPdf.obj([lien]));
    });
  }

  function ajouterSignets(sortie, entrees) {
    const { PDFName, PDFHexString, PDFNumber } = lib();
    if (!entrees.length) return;
    const c = sortie.context;
    const racine = c.nextRef();
    const refs = entrees.map(() => c.nextRef());
    entrees.forEach((e, i) => {
      const d = c.obj({ Parent: racine, Dest: [sortie.getPage(e.pageFinale).ref, 'Fit'] });
      d.set(PDFName.of('Title'), PDFHexString.fromText(e.titre));
      if (i > 0) d.set(PDFName.of('Prev'), refs[i - 1]);
      if (i < refs.length - 1) d.set(PDFName.of('Next'), refs[i + 1]);
      c.assign(refs[i], d);
    });
    const dict = c.obj({ Type: 'Outlines', First: refs[0], Last: refs[refs.length - 1] });
    dict.set(PDFName.of('Count'), PDFNumber.of(refs.length));
    c.assign(racine, dict);
    sortie.catalog.set(PDFName.of('Outlines'), racine);
    sortie.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  }

  // ---------- Numérotation et filigrane ----------
  function numeroter(sortie, ctx, o, ignorer) {
    const pages = sortie.getPages();
    const total = pages.length - ignorer;
    const taille = Number(o.taille) || 10;
    pages.forEach((page, i) => {
      if (i < ignorer) return;
      const n = i - ignorer + (Number(o.debut) || 1);
      const texte = nettoyer(ctx.police, String(o.format || 'Page {n} / {total}').replace(/\{n\}/g, n).replace(/\{total\}/g, total + (Number(o.debut) || 1) - 1));
      const boite = page.getCropBox(), r = page.getRotation().angle;
      const affiche = tailleAffichee(boite, r);
      const l = ctx.police.widthOfTextAtSize(texte, taille) / affiche.l;
      const marge = mm(10);
      const pos = o.position || 'bas-centre';
      const u = pos.endsWith('gauche') ? marge / affiche.l : pos.endsWith('droite') ? 1 - marge / affiche.l - l : 0.5 - l / 2;
      const v = pos.startsWith('haut') ? marge / affiche.h : 1 - (marge + taille) / affiche.h;
      poserTexte(page, boite, r, ctx.police, { texte, u, v, taille, coul: couleur(o.couleur || '#333333') });
    });
  }

  function filigraner(sortie, ctx, o) {
    const { degrees } = lib();
    const texte = nettoyer(ctx.policeGras, o.texte || '');
    if (!texte) return;
    sortie.getPages().forEach(page => {
      const boite = page.getCropBox(), r = normRot(page.getRotation().angle);
      const affiche = tailleAffichee(boite, r);
      const diag = Math.hypot(affiche.l, affiche.h);
      const taille = Math.min(Number(o.taille) || 60, (diag * 0.75) / Math.max(1, ctx.policeGras.widthOfTextAtSize(texte, 1)));
      const largeur = ctx.policeGras.widthOfTextAtSize(texte, taille);
      // Centre affiché, texte incliné vers le haut-droite dans le sens de lecture
      const angleAffiche = Math.atan2(affiche.h, affiche.l) * 180 / Math.PI;
      const a = angleAffiche * Math.PI / 180;
      const du = (-Math.cos(a) * largeur / 2 + Math.sin(a) * taille * 0.35) / affiche.l;
      const dv = (Math.sin(a) * largeur / 2 + Math.cos(a) * taille * 0.35) / affiche.h;
      const p = versPdf(boite, r, 0.5 + du, 0.5 + dv);
      page.drawText(texte, { x: p.x, y: p.y, size: taille, font: ctx.policeGras, color: couleur(o.couleur || '#c62828'), opacity: Number(o.opacite ?? 0.2), rotate: degrees(angleAffiche + r) });
    });
  }

  // ---------- Assemblage ----------
  // sources : { [id]: { type: 'pdf', octets } }
  // pages : [{ source, index, rotation (totale, degrés), elements, groupe (titre du document) }
  //          | { type: 'image', octets, mime, rotation, largeur?, hauteur?, plein?, elements, groupe, source }
  //          | { type: 'blanche', largeur, hauteur, rotation, elements }]
  // options : { titre, auteur, sujet, sommaire, signets, numerotation: {...}, filigrane: {...}, aplatir }
  async function compiler({ sources = {}, pages, options = {}, images = {}, progression = () => {} }) {
    const { PDFDocument, StandardFonts, degrees } = lib();
    if (!pages || !pages.length) throw new Error('Aucune page à assembler.');
    const sortie = await PDFDocument.create();
    const ctx = {
      police: await sortie.embedFont(StandardFonts.Helvetica),
      policeGras: await sortie.embedFont(StandardFonts.HelveticaBold),
      cacheImages: new Map(),
      async image(id) {
        if (!id || !images[id]) return null;
        if (!this.cacheImages.has(id)) this.cacheImages.set(id, integrerImage(sortie, images[id].octets, images[id].mime));
        return this.cacheImages.get(id);
      },
    };

    // Documents sources : chargés une fois ; pages copiées en un seul appel par document (ressources partagées)
    const docs = new Map();
    const copies = new Map();
    for (const p of pages) {
      if (p.type && p.type !== 'pdf') continue;
      if (!docs.has(p.source)) {
        const s = sources[p.source];
        if (!s) throw new Error('Document source introuvable.');
        const doc = await PDFDocument.load(s.octets, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
        if (options.aplatir) { try { doc.getForm().flatten(); } catch { /* formulaire illisible : laissé tel quel */ } }
        docs.set(p.source, doc);
        copies.set(p.source, []);
      }
      copies.get(p.source).push(p.index);
    }
    const copiees = new Map();
    for (const [id, indices] of copies) {
      const pagesCopiees = await sortie.copyPages(docs.get(id), indices);
      copiees.set(id, pagesCopiees);
    }

    let k = 0;
    for (const p of pages) {
      let page;
      if (!p.type || p.type === 'pdf') {
        page = copiees.get(p.source).shift();
        sortie.addPage(page);
      } else if (p.type === 'image') {
        const img = await integrerImage(sortie, p.octets, p.mime);
        if (p.plein) {
          // Page à la taille exacte de l'image (pages rendues en image, PDF protégé ou compression)
          page = sortie.addPage([p.largeur, p.hauteur]);
          page.drawImage(img, { x: 0, y: 0, width: p.largeur, height: p.hauteur });
        } else {
          const paysage = img.width > img.height;
          const [L, H] = paysage ? [A4[1], A4[0]] : A4;
          page = sortie.addPage([L, H]);
          const marge = mm(10);
          const e = Math.min((L - 2 * marge) / img.width, (H - 2 * marge) / img.height);
          page.drawImage(img, { x: (L - img.width * e) / 2, y: (H - img.height * e) / 2, width: img.width * e, height: img.height * e });
        }
      } else {
        page = sortie.addPage([p.largeur || A4[0], p.hauteur || A4[1]]);
      }
      const r = normRot(p.rotation || 0);
      page.setRotation(degrees(r));
      await dessinerElements(sortie, page, r, p.elements, ctx);
      progression(++k / pages.length);
    }

    // Sommaire (inséré en tête) puis signets
    const entrees = (options.sommaire || options.signets) ? groupes(pages).map(g => ({ titre: g.titre, pageInitiale: g.debut })) : [];
    let nbSommaire = 0;
    const numNumerotation = options.numerotation && options.numerotation.actif;
    const ignorer = numNumerotation ? Math.max(0, Number(options.numerotation.ignorer) || 0) : 0;
    if (options.sommaire && entrees.length) {
      nbSommaire = Math.max(1, Math.ceil(entrees.length / LIGNES_PAR_PAGE_SOMMAIRE));
      entrees.forEach(e => { e.pageFinale = e.pageInitiale + nbSommaire; });
      const premierNumero = numNumerotation ? (Number(options.numerotation.debut) || 1) : 1;
      // Numéro affiché dans le sommaire = numéro imprimé sur la page (ou rang dans le fichier si pas de numérotation)
      const numeroDe = i => numNumerotation ? (i - ignorer + premierNumero) : i + 1;
      ajouterSommaire(sortie, entrees, ctx, options.titre, numeroDe);
    } else {
      entrees.forEach(e => { e.pageFinale = e.pageInitiale; });
    }
    if (numNumerotation) numeroter(sortie, ctx, options.numerotation, ignorer);
    if (options.filigrane && options.filigrane.actif) filigraner(sortie, ctx, options.filigrane);
    if (options.sommaire && nbSommaire) liensSommaire(sortie, entrees);
    if (options.signets) {
      const sig = entrees.slice();
      if (nbSommaire) sig.unshift({ titre: 'Sommaire', pageFinale: 0 });
      ajouterSignets(sortie, sig);
    }

    sortie.setTitle(options.titre || '', { showInWindowTitleBar: !!options.titre });
    if (options.auteur) sortie.setAuthor(options.auteur);
    if (options.sujet) sortie.setSubject(options.sujet);
    sortie.setCreator('Atelier PDF');
    sortie.setProducer('Atelier PDF (pdf-lib)');
    sortie.setCreationDate(new Date());
    sortie.setModificationDate(new Date());
    return sortie.save({ useObjectStreams: true });
  }

  async function integrerImage(doc, octets, mime) {
    const t = String(mime || '').toLowerCase();
    if (t.includes('png')) return doc.embedPng(octets);
    if (t.includes('jpeg') || t.includes('jpg')) return doc.embedJpg(octets);
    // Détection par signature
    const b = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
    if (b[0] === 0x89 && b[1] === 0x50) return doc.embedPng(b);
    return doc.embedJpg(b);
  }

  // Plages « 1-3, 5, 8-10 » -> [[0,1,2],[4],[7,8,9]] (indices à partir de 0), bornées à total
  function lirePlages(texte, total) {
    const res = [];
    for (const morceau of String(texte || '').split(/[;,]/)) {
      const m = morceau.trim();
      if (!m) continue;
      const r = /^(\d+)\s*(?:-\s*(\d*))?$/.exec(m);
      if (!r) throw new Error(`Plage invalide : « ${m} »`);
      const a = Number(r[1]);
      const b = r[2] === undefined ? a : (r[2] === '' ? total : Number(r[2]));
      if (a < 1 || b < a || a > total) throw new Error(`Plage hors du document : « ${m} » (1 à ${total})`);
      const groupe = [];
      for (let i = a; i <= Math.min(b, total); i++) groupe.push(i - 1);
      res.push(groupe);
    }
    if (!res.length) throw new Error('Indiquez au moins une plage de pages.');
    return res;
  }

  return { compiler, lirePlages, versPdf, tailleAffichee, rectPdf, normRot, A4, formes, chemin, couperLignes, MARGE_BULLE, DEFAUTS };
});
