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

  // Police standard proche de celle du texte d'origine
  function nomPoliceStandard(e) {
    const { StandardFonts } = lib();
    const fam = e.police === 'times' ? 'TimesRoman' : e.police === 'courier' ? 'Courier' : 'Helvetica';
    const ital = e.italique ? (fam === 'TimesRoman' ? 'Italic' : 'Oblique') : '';
    return StandardFonts[fam + (e.gras ? 'Bold' : '') + ital] || StandardFonts[fam];
  }
  // Zone légèrement agrandie (1 pt) pour couvrir l'anticrénelage du texte d'origine
  function elargirZone(z, affiche) {
    const dx = 1 / affiche.l, dy = 1 / affiche.h;
    return { x: z.x - dx, y: z.y - dy, w: z.w + 2 * dx, h: z.h + 2 * dy };
  }

  // ---------- Formes vectorielles (communes à l'écran et au PDF) ----------
  // Chaque forme est décrite dans le repère de la page affichée, en unités « l × h » (points pour le PDF,
  // pixels à l'écran), k = unités par point (taille des pointes de flèche, épaisseurs, arrondis).
  // Résultat : [{ cmds: [['M',x,y],['L',x,y],['C',x1,y1,x2,y2,x,y],['Z']], trait, fond, epaisseur, rond, opacite }]
  const DEFAUTS = { ligne: '#d32f2f', fleche: '#d32f2f', crayon: '#1565c0', ellipse: '#d32f2f', cadre: '#d32f2f', bulle: '#1565c0', texte: '#000000',
    tampon: '#2e7d32', cote: '#e65100', longueur: '#e65100', surface: '#6a1b9a', angle: '#00838f' };
  const K_ELLIPSE = 0.5523;

  function cmdsRectArrondi(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    const c = r * (1 - K_ELLIPSE);
    return [['M', x + r, y], ['L', x + w - r, y], ['C', x + w - c, y, x + w, y + c, x + w, y + r], ['L', x + w, y + h - r],
      ['C', x + w, y + h - c, x + w - c, y + h, x + w - r, y + h], ['L', x + r, y + h], ['C', x + c, y + h, x, y + h - c, x, y + h - r],
      ['L', x, y + r], ['C', x, y + c, x + c, y, x + r, y], ['Z']];
  }
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
      case 'tampon': {
        const x = X(e.x), y = Y(e.y), w = X(e.w), hh = Y(e.h), i = 3.5 * k;
        return [
          { cmds: cmdsRectArrondi(x, y, w, hh, 6 * k), trait: coul, epaisseur: 2.2 * k },
          { cmds: cmdsRectArrondi(x + i, y + i, w - 2 * i, hh - 2 * i, 3.5 * k), trait: coul, epaisseur: 0.8 * k },
        ];
      }
      case 'cote': {
        // Cote : trait, traits de rappel perpendiculaires et pointes aux deux bouts
        const x1 = X(e.x1), y1 = Y(e.y1), x2 = X(e.x2), y2 = Y(e.y2);
        const lg = Math.hypot(x2 - x1, y2 - y1) || 1;
        const ux = (x2 - x1) / lg, uy = (y2 - y1) / lg, nx = -uy, ny = ux;
        const t = 6 * k, pt = Math.min(lg / 3, 7 * k), dp = pt * 0.4;
        return [
          { cmds: [['M', x1, y1], ['L', x2, y2], ['M', x1 + nx * t, y1 + ny * t], ['L', x1 - nx * t, y1 - ny * t], ['M', x2 + nx * t, y2 + ny * t], ['L', x2 - nx * t, y2 - ny * t]], trait: coul, epaisseur: Math.max(0.6 * k, ep * 0.6) },
          { cmds: [['M', x1, y1], ['L', x1 + ux * pt + nx * dp, y1 + uy * pt + ny * dp], ['L', x1 + ux * pt - nx * dp, y1 + uy * pt - ny * dp], ['Z'],
            ['M', x2, y2], ['L', x2 - ux * pt + nx * dp, y2 - uy * pt + ny * dp], ['L', x2 - ux * pt - nx * dp, y2 - uy * pt - ny * dp], ['Z']], fond: coul },
        ];
      }
      case 'longueur': {
        const pts = e.points || [];
        if (pts.length < 2) return [];
        const r = 1.8 * k;
        const sommets = pts.flatMap(([px, py]) => cmdsRect(X(px) - r, Y(py) - r, 2 * r, 2 * r));
        return [{ cmds: pts.map(([px, py], i) => [i ? 'L' : 'M', X(px), Y(py)]), trait: coul, epaisseur: ep, rond: true }, { cmds: sommets, fond: coul }];
      }
      case 'angle': {
        // Points : extrémité, sommet, extrémité ; arc entre les deux côtés
        const pts = e.points || [];
        if (pts.length < 2) return [];
        const [a, o, b] = pts.map(([px, py]) => [X(px), Y(py)]);
        const res = [{ cmds: [['M', a[0], a[1]], ['L', o[0], o[1]], ...(b ? [['L', b[0], b[1]]] : [])], trait: coul, epaisseur: ep, rond: true }];
        if (b) {
          const r = Math.min(18 * k, Math.hypot(a[0] - o[0], a[1] - o[1]) * 0.6, Math.hypot(b[0] - o[0], b[1] - o[1]) * 0.6);
          const t1 = Math.atan2(a[1] - o[1], a[0] - o[0]);
          let dt = Math.atan2(b[1] - o[1], b[0] - o[0]) - t1;
          while (dt > Math.PI) dt -= 2 * Math.PI;
          while (dt < -Math.PI) dt += 2 * Math.PI;
          const n = 12, arc = [];
          for (let i = 0; i <= n; i++) { const t = t1 + dt * i / n; arc.push([i ? 'L' : 'M', o[0] + r * Math.cos(t), o[1] + r * Math.sin(t)]); }
          res.push({ cmds: arc, trait: coul, epaisseur: Math.max(0.6 * k, ep * 0.6), rond: true });
        }
        return res;
      }
      case 'surface': {
        const pts = e.points || [];
        if (pts.length < 2) return [];
        return [{ cmds: [...pts.map(([px, py], i) => [i ? 'L' : 'M', X(px), Y(py)]), ['Z']], trait: coul, epaisseur: ep, fond: coul, opaciteFond: 0.15 }];
      }
      default:
        return [];
    }
  }

  // Étiquettes des mesures (valeur calculée par l'application dans e.etiquette), centrées en (cx, cy)
  function etiquettes(e, l, h, k = 1) {
    if (!e.etiquette || !['cote', 'longueur', 'surface', 'angle'].includes(e.type)) return [];
    const taille = (e.taille || 10) * k;
    let cx, cy;
    if (e.type === 'cote') { cx = (e.x1 + e.x2) / 2 * l; cy = (e.y1 + e.y2) / 2 * h; }
    else {
      const pts = e.points || [];
      if (!pts.length) return [];
      if (e.type === 'longueur') { const [px, py] = pts[pts.length - 1]; cx = px * l; cy = py * h - taille * 1.2; }
      else if (e.type === 'angle') {
        // Sur la bissectrice, un peu au-delà de l'arc
        if (pts.length < 3) return [];
        const [a, o, b] = pts.map(([px, py]) => [px * l, py * h]);
        const ua = Math.hypot(a[0] - o[0], a[1] - o[1]) || 1, ub = Math.hypot(b[0] - o[0], b[1] - o[1]) || 1;
        let bx = (a[0] - o[0]) / ua + (b[0] - o[0]) / ub, by = (a[1] - o[1]) / ua + (b[1] - o[1]) / ub;
        const nb = Math.hypot(bx, by) || 1;
        bx /= nb; by /= nb;
        const r = Math.min(18 * k, ua * 0.6, ub * 0.6) + taille * 1.6;
        cx = o[0] + bx * r; cy = o[1] + by * r;
      }
      else { cx = pts.reduce((a, q) => a + q[0], 0) / pts.length * l; cy = pts.reduce((a, q) => a + q[1], 0) / pts.length * h; }
    }
    return [{ texte: e.etiquette, cx, cy, taille, couleur: e.couleur || DEFAUTS[e.type] }];
  }

  // Lignes d'un tampon centrées dans son cadre ; mesure(texte, gras, taille) -> largeur dans les mêmes unités
  function lignesTampon(e, l, h, k, mesure) {
    const W = e.w * l, H = e.h * h, pad = 8 * k;
    const l2 = (e.ligne2 || '').trim();
    const m1 = Math.max(1e-6, mesure(e.texte || '', true, 1));
    const s1 = Math.max(1, Math.min(H * (l2 ? 0.36 : 0.6), (W - 2 * pad) / m1));
    const s2 = l2 ? Math.max(1, Math.min(H * 0.24, s1 * 0.75, (W - 2 * pad) / Math.max(1e-6, mesure(l2, false, 1)))) : 0;
    // Hauteur visible des majuscules ≈ 0,72 × taille ; haut du dessin à 0,22 × taille sous le haut de la ligne
    const bloc = 0.72 * s1 + (l2 ? 0.45 * s2 + 0.72 * s2 : 0);
    const haut = e.y * h + (H - bloc) / 2;
    const res = [{ texte: e.texte || '', gras: true, taille: s1, x: e.x * l + (W - mesure(e.texte || '', true, s1)) / 2, y: haut - 0.22 * s1 }];
    if (l2) {
      const haut2 = haut + 0.72 * s1 + 0.45 * s2;
      res.push({ texte: l2, gras: false, taille: s2, x: e.x * l + (W - mesure(l2, false, s2)) / 2, y: haut2 - 0.22 * s2 });
    }
    return res;
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
      } else if (e.type === 'texteModifie') {
        // Texte d'origine introuvable dans le contenu (scan, texte dans un sous-dessin) : recouvert par le fond
        if (!e.retire && !e.applique) {
          if (e.coins) page.drawSvgPath(chemin([...e.coins.map(([u, v], i) => [i ? 'L' : 'M', u * affiche.l, v * affiche.h]), ['Z']], versChemin), { x: 0, y: 0, color: couleur(e.fond, [1, 1, 1]), borderColor: couleur(e.fond, [1, 1, 1]), borderWidth: 1.5 });
          else page.drawRectangle({ ...rectPdf(boite, r, elargirZone(e.zone, affiche)), color: couleur(e.fond, [1, 1, 1]) });
        }
        const police = await ctx.policeStandard(nomPoliceStandard(e));
        // Police d'origine : désignée par sa référence (un sous-dessin peut nommer « F1 » une autre police que la page)
        const po = e.policeOrigine ? { ...e.policeOrigine, nom: nomPoliceSurPage(page, e.policeOrigine) } : null;
        // Largeur d'un texte : police d'origine (largeurs du PDF) ou police standard
        const largeurOrigine = t => { const h = po && encoderDansPolice(page, po.nom, t, po.infos.octets); if (!h) return null; let l = 0; for (let i = 0; i < h.length; i += po.infos.octets * 2) l += po.infos.largeur(parseInt(h.substr(i, po.infos.octets * 2), 16)); return l * e.taille; };
        const toutEnOrigine = po && encoderDansPolice(page, po.nom, String(e.texte || '').replace(/\s+/g, ' '), po.infos.octets) !== null;
        const mesure = t => (toutEnOrigine ? largeurOrigine(t) : null) ?? police.widthOfTextAtSize(nettoyer(police, t), e.taille);
        // Paragraphe : texte recoupé à la largeur d'origine, avec l'interligne d'origine
        const lignes = e.paragraphe
          ? couperLignes(mesure, e.texte, e.paragraphe.largeur * affiche.l)
          : String(e.texte || '').split(/\r?\n/);
        const interligne = e.paragraphe ? e.paragraphe.interligne : 1.2 * e.taille;
        const { PDFHexString, PDFName, pushGraphicsState, popGraphicsState, beginText, endText, setFontAndSize, setTextMatrix, showText, setFillingRgbColor } = lib();
        const coul = couleur(e.couleur);
        // Police d'origine seulement si elle contient tous les caractères du bloc : jamais deux polices mélangées
        const hexes = po ? lignes.map(l => (l ? encoderDansPolice(page, po.nom, l, po.infos.octets) : '')) : [];
        const origine = po && hexes.every(h => h !== null);
        lignes.forEach((ligne, i) => {
          if (!ligne) return;
          // Texte en biais (angle, degrés, sens inverse des aiguilles sur la page affichée) : lignes suivantes décalées
          // perpendiculairement à la ligne de base
          const ang = (e.angle || 0) * Math.PI / 180;
          const q = versPdf(boite, r, e.x + Math.sin(ang) * i * interligne / affiche.l, e.base + Math.cos(ang) * i * interligne / affiche.h);
          const hex = origine ? hexes[i] : null;
          if (hex) {
            // Police d'origine (incluse dans le PDF) : la correction ne se voit pas
            const a = (normRot(r) + (e.angle || 0)) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
            page.pushOperators(pushGraphicsState(), setFillingRgbColor(coul.red, coul.green, coul.blue), beginText(), setFontAndSize(PDFName.of(po.nom), e.taille),
              setTextMatrix(cs, sn, -sn, cs, q.x, q.y), showText(PDFHexString.of(hex)), endText(), popGraphicsState());
            return;
          }
          const t = nettoyer(police, ligne);
          if (t) page.drawText(t, { x: q.x, y: q.y, size: e.taille, font: police, color: coul, rotate: degrees(normRot(r) + (e.angle || 0)) });
        });
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
        if (f.fond) { o.color = couleur(f.fond); if (f.opaciteFond != null) o.opacity = f.opaciteFond; }
        page.drawSvgPath(chemin(f.cmds, versChemin), o);
      }
      for (const et of etiquettes(e, affiche.l, affiche.h, 1)) {
        const t = nettoyer(ctx.police, et.texte);
        const lt = ctx.police.widthOfTextAtSize(t, et.taille);
        const bw = lt + et.taille * 0.8, bh = et.taille * 1.35;
        page.drawSvgPath(chemin(cmdsRectArrondi(et.cx - bw / 2, et.cy - bh / 2, bw, bh, et.taille * 0.3), versChemin), { x: 0, y: 0, color: couleur('#ffffff'), borderColor: couleur(et.couleur), borderWidth: 0.6 });
        poserTexte(page, boite, r, ctx.police, { texte: t, u: (et.cx - lt / 2) / affiche.l, v: (et.cy - et.taille * 0.58) / affiche.h, taille: et.taille, coul: couleur(et.couleur) });
      }
      if (e.type === 'tampon') {
        const mesure = (t, gras, taille) => (gras ? ctx.policeGras : ctx.police).widthOfTextAtSize(nettoyer(gras ? ctx.policeGras : ctx.police, t), taille);
        for (const lg of lignesTampon(e, affiche.l, affiche.h, 1, mesure)) {
          poserTexte(page, boite, r, lg.gras ? ctx.policeGras : ctx.police, { texte: lg.texte, u: lg.x / affiche.l, v: lg.y / affiche.h, taille: lg.taille, coul: couleur(e.couleur || DEFAUTS.tampon) });
        }
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

  // Texte reconnu (OCR) posé de façon invisible sur la page : le PDF devient interrogeable et le texte sélectionnable.
  // Les mots situés sous une zone caviardée ne sont jamais écrits.
  function dessinerOcr(page, r, mots, elements, ctx) {
    const boite = page.getCropBox();
    const aff = tailleAffichee(boite, r);
    const caches = (elements || []).filter(e => e.type === 'caviarde');
    const sousCache = m => caches.some(c => m.x < c.x + c.w && m.x + m.w > c.x && m.y < c.y + c.h && m.y + m.h > c.y);
    for (const m of mots || []) {
      if (sousCache(m)) continue;
      const t = nettoyer(ctx.police, m.t);
      if (!t.trim()) continue;
      const hPt = m.h * aff.h, wPt = m.w * aff.l;
      let taille = hPt * 0.9;
      const lg = ctx.police.widthOfTextAtSize(t, taille);
      if (lg > 0) taille = Math.max(hPt * 0.4, Math.min(hPt * 1.3, taille * wPt / lg));
      poserTexte(page, boite, r, ctx.police, { texte: t, u: m.x, v: m.y + (hPt - taille) / 2 / aff.h, taille, coul: couleur('#000000'), opacite: 0 });
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
      polices: new Map(),
      policeStandard(nom) {
        if (nom === StandardFonts.Helvetica) return this.police;
        if (nom === StandardFonts.HelveticaBold) return this.policeGras;
        if (!this.polices.has(nom)) this.polices.set(nom, sortie.embedFont(nom));
        return this.polices.get(nom);
      },
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
        // Formulaire rempli dans Atelier PDF : valeurs écrites puis figées (le formulaire ne suit pas la copie des pages)
        if (s.champs && Object.keys(s.champs).length) remplirFormulaire(doc, s.champs);
        else if (options.aplatir) { try { doc.getForm().flatten(); } catch { /* formulaire illisible : laissé tel quel */ } }
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
    const infosPages = [];
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
      // Texte modifié : les caractères d'origine sont retirés du contenu de la page (PDF d'origine seulement)
      const modifs = (p.elements || []).filter(e => e.type === 'texteModifie');
      let elements = p.elements;
      if (modifs.length) {
        const boite0 = page.getCropBox();
        // Zone d'origine : rectangle, ou polygone pour un texte en biais (coins sur la page affichée)
        const zonePdf = e => (e.coins ? { poly: e.coins.map(([u, v]) => { const q = versPdf(boite0, r, u, v); return [q.x, q.y]; }) } : rectPdf(boite0, r, e.zone));
        const comptes = (!p.type || p.type === 'pdf') ? await retirerTexte(sortie, page, modifs.map(zonePdf), ctx) : modifs.map(() => 0);
        elements = p.elements.map(e => { const k = modifs.indexOf(e); return k >= 0 ? { ...e, retire: comptes[k] > 0, policeOrigine: comptes.polices ? comptes.polices[k] : null } : e; });
      }
      // Annotations et texte OCR dans un flux à part, retiré si le PDF est rouvert dans Atelier PDF pour être modifié
      nouveauFlux(page);
      // Option « commentaires » : annotations ajoutées comme commentaires PDF (Acrobat…), le reste dans la page
      if (options.commentaires) {
        const enCommentaire = (elements || []).filter(e => COMMENTABLES.includes(e.type));
        await dessinerElements(sortie, page, r, (elements || []).filter(e => !COMMENTABLES.includes(e.type)), ctx);
        if (enCommentaire.length) await ajouterCommentaires(sortie, page, r, enCommentaire, images, options);
      } else await dessinerElements(sortie, page, r, elements, ctx);
      if (p.ocr && p.ocr.length) dessinerOcr(page, r, p.ocr, p.elements, ctx);
      const calques = page.contentStreamRef ? [page.contentStreamRef] : [];
      nouveauFlux(page);
      infosPages.push({ page, calques, donnees: p.donnees });
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
    if (options.editable !== false) ecrireDonneesEdition(sortie, infosPages, images, options);

    sortie.setTitle(options.titre || '', { showInWindowTitleBar: !!options.titre });
    if (options.auteur) sortie.setAuthor(options.auteur);
    if (options.sujet) sortie.setSubject(options.sujet);
    sortie.setCreator('Atelier PDF');
    sortie.setProducer('Atelier PDF (pdf-lib)');
    sortie.setCreationDate(new Date());
    sortie.setModificationDate(new Date());
    return sortie.save({ useObjectStreams: true });
  }

  // ---------- Retrait du texte d'origine (modification du texte d'une page) ----------
  // Lit le contenu de la page, repère chaque caractère affiché et retire ceux dont le centre est dans une des zones
  // (repère PDF). Les caractères suivants gardent leur place : l'avance des caractères retirés est remplacée par un
  // décalage équivalent. Renvoie le nombre de caractères retirés par zone (0 : texte introuvable, ex. scan).
  const ESPACES = new Set([0, 9, 10, 12, 13, 32]);
  const DELIMS = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);
  function lexer(b) {
    let i = 0;
    const n = b.length;
    const latin = (d, f) => { let t = ''; for (let k = d; k < f; k++) t += String.fromCharCode(b[k]); return t; };
    function chaine() { // ( ... ) avec échappements et parenthèses imbriquées
      const o = [];
      let niv = 1;
      i++;
      while (i < n) {
        const c = b[i++];
        if (c === 92) {
          const e = b[i++];
          const simples = { 110: 10, 114: 13, 116: 9, 98: 8, 102: 12, 40: 40, 41: 41, 92: 92 };
          if (e in simples) o.push(simples[e]);
          else if (e >= 48 && e <= 55) {
            let v = e - 48;
            for (let k = 0; k < 2 && b[i] >= 48 && b[i] <= 55; k++) v = v * 8 + (b[i++] - 48);
            o.push(v & 255);
          } else if (e === 13) { if (b[i] === 10) i++; } else if (e !== 10) o.push(e);
        } else if (c === 40) { niv++; o.push(c); } else if (c === 41) { if (--niv === 0) break; o.push(c); } else o.push(c);
      }
      return Uint8Array.from(o);
    }
    function hex() {
      i++;
      let t = '';
      while (i < n && b[i] !== 62) { const c = b[i++]; if (!ESPACES.has(c)) t += String.fromCharCode(c); }
      i++;
      if (t.length % 2) t += '0';
      const o = new Uint8Array(t.length / 2);
      for (let k = 0; k < o.length; k++) o[k] = parseInt(t.substr(k * 2, 2), 16) || 0;
      return o;
    }
    return {
      get pos() { return i; },
      set pos(v) { i = v; },
      octets: b,
      suivant() {
        for (;;) {
          while (i < n && ESPACES.has(b[i])) i++;
          if (b[i] === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue; }
          break;
        }
        if (i >= n) return null;
        const d = i, c = b[i];
        if (c === 40) return { t: 'val', v: { chaine: chaine() }, d };
        if (c === 60) { if (b[i + 1] === 60) { i += 2; return { t: '<<', d }; } return { t: 'val', v: { chaine: hex() }, d }; }
        if (c === 62 && b[i + 1] === 62) { i += 2; return { t: '>>', d }; }
        if (c === 91) { i++; return { t: '[', d }; }
        if (c === 93) { i++; return { t: ']', d }; }
        if (c === 123 || c === 125) { i++; return { t: 'val', v: null, d }; }
        if (c === 47) { i++; const s0 = i; while (i < n && !ESPACES.has(b[i]) && !DELIMS.has(b[i])) i++; return { t: 'val', v: { nom: latin(s0, i) }, d }; }
        while (i < n && !ESPACES.has(b[i]) && !DELIMS.has(b[i])) i++;
        if (i === d) { i++; return { t: 'val', v: null, d }; }
        const mot = latin(d, i);
        if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(mot)) return { t: 'val', v: Number(mot), d };
        if (mot === 'true' || mot === 'false' || mot === 'null') return { t: 'val', v: mot, d };
        return { t: 'op', v: mot, d };
      },
    };
  }
  // Opérations du flux : { op, args, d (début des opérandes), f (fin de l'opérateur) }
  function operations(b) {
    const lx = lexer(b);
    const ops = [];
    let pile = [], debut = null;
    const conteneurs = [];
    for (let tk = lx.suivant(); tk; tk = lx.suivant()) {
      if (debut === null) debut = tk.d;
      if (tk.t === '[' || tk.t === '<<') { conteneurs.push(pile); pile = []; continue; }
      if (tk.t === ']' || tk.t === '>>') { const v = tk.t === ']' ? pile : { dict: pile }; pile = conteneurs.pop() || []; pile.push(v); continue; }
      if (tk.t === 'val') { pile.push(tk.v); continue; }
      if (conteneurs.length) { pile.push(tk.v); continue; }
      if (tk.v === 'BI') {
        // Image en ligne : données binaires jusqu'à « EI »
        let p = lx.pos;
        const fin = b.length;
        const id = (() => { for (let k = p; k < fin - 2; k++) if (b[k] === 73 && b[k + 1] === 68 && ESPACES.has(b[k + 2]) && ESPACES.has(b[k - 1])) return k + 3; return fin; })();
        p = id;
        while (p < fin - 1 && !(ESPACES.has(b[p - 1]) && b[p] === 69 && b[p + 1] === 73 && (p + 2 >= fin || ESPACES.has(b[p + 2])))) p++;
        lx.pos = Math.min(fin, p + 2);
        ops.push({ op: 'BI', args: [], d: debut, f: lx.pos });
      } else ops.push({ op: tk.v, args: pile, d: debut, f: lx.pos });
      pile = []; debut = null;
    }
    return ops;
  }
  const mult = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
  const appliquer = (m, x, y) => [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];

  // Largeurs des caractères d'une police de la page (unités de texte pour une taille 1)
  async function infosPolice(res, nom, ctx) {
    const { PDFName, PDFArray, PDFNumber, StandardFonts } = lib();
    const polices = res && res.lookup(PDFName.of('Font'));
    const f = polices && polices.lookup(PDFName.of(nom));
    if (!f || !f.lookup) return null;
    const nomDe = o => (o ? String(o).replace(/^\//, '') : '');
    const num = o => (o instanceof PDFNumber ? o.asNumber() : (typeof o?.asNumber === 'function' ? o.asNumber() : null));
    const sub = nomDe(f.get(PDFName.of('Subtype')));
    if (sub === 'Type0') {
      const enc = nomDe(f.get(PDFName.of('Encoding')));
      if (!/^Identity-[HV]$/.test(enc)) return null;
      const desc = f.lookup(PDFName.of('DescendantFonts'))?.lookup(0);
      const dw = num(desc?.lookup(PDFName.of('DW'))) ?? 1000;
      const larg = new Map();
      const w = desc?.lookup(PDFName.of('W'));
      if (w instanceof PDFArray) {
        const a = w.asArray().map(o => desc.context.lookup(o) || o);
        for (let k = 0; k < a.length;) {
          const c0 = num(a[k]);
          if (a[k + 1] instanceof PDFArray) { a[k + 1].asArray().forEach((v, j) => larg.set(c0 + j, num(desc.context.lookup(v) || v))); k += 2; }
          else { const c1 = num(a[k + 1]), v = num(a[k + 2]); for (let c = c0; c <= c1 && c - c0 < 65536; c++) larg.set(c, v); k += 3; }
        }
      }
      return { octets: 2, largeur: c => (larg.get(c) ?? dw) / 1000 };
    }
    const fm = f.lookup(PDFName.of('FontMatrix'));
    const echelle = fm instanceof PDFArray ? num(fm.lookup(0)) : 0.001;
    const premier = num(f.lookup(PDFName.of('FirstChar'))) ?? 0;
    const largeurs = f.lookup(PDFName.of('Widths'));
    const manquante = num(f.lookup(PDFName.of('FontDescriptor'))?.lookup(PDFName.of('MissingWidth'))) ?? 0;
    if (largeurs instanceof PDFArray) {
      const a = largeurs.asArray().map(o => num(f.context.lookup(o) || o) ?? 0);
      return { octets: 1, largeur: c => ((c >= premier && c - premier < a.length) ? a[c - premier] : manquante) * echelle };
    }
    // Police standard sans table de largeurs : métriques de la police standard la plus proche
    const base = nomDe(f.get(PDFName.of('BaseFont')));
    const famille = /courier|mono/i.test(base) ? 'Courier' : /times|serif|roman/i.test(base) ? 'TimesRoman' : 'Helvetica';
    const gras = /bold|black|heavy/i.test(base), ital = /italic|oblique/i.test(base);
    const cle = famille + (gras ? 'Bold' : '') + (ital ? (famille === 'TimesRoman' ? 'Italic' : 'Oblique') : '');
    const nomStd = StandardFonts[cle] || StandardFonts[famille];
    const pol = await ctx.policeStandard(nomStd);
    return { octets: 1, largeur: c => { try { return pol.widthOfTextAtSize(String.fromCharCode(c), 1); } catch { return 0.5; } } };
  }

  // Table ToUnicode d'une police : texte Unicode -> code du caractère dans la police (bfchar, bfrange)
  function tableUnicode(f) {
    const { PDFName, decodePDFRawStream } = lib();
    const tu = f.lookup(PDFName.of('ToUnicode'));
    if (!tu) return null;
    let t;
    try { t = new TextDecoder('latin1').decode(decodePDFRawStream(tu).decode()); } catch { return null; }
    const hexVersTexte = h => { let r = ''; for (let i = 0; i + 4 <= h.length; i += 4) r += String.fromCharCode(parseInt(h.substr(i, 4), 16)); return r; };
    const table = new Map();
    for (const bloc of t.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const m of bloc[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) { const u = hexVersTexte(m[2]); if (u && !table.has(u)) table.set(u, parseInt(m[1], 16)); }
    }
    for (const bloc of t.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const m of bloc[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g)) {
        const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
        if (hi - lo > 5000) continue;
        if (m[3][0] === '[') {
          [...m[3].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((d, k) => { const u = hexVersTexte(d[1]); if (u && !table.has(u)) table.set(u, lo + k); });
        } else {
          const base = parseInt(m[3].slice(1, -1), 16);
          for (let c = lo; c <= hi; c++) { const u = String.fromCodePoint(base + (c - lo)); if (!table.has(u)) table.set(u, c); }
        }
      }
    }
    return table;
  }
  // Nom, dans les ressources de la page, de la police de référence ref (ajoutée sous un nouveau nom si besoin)
  function nomPoliceSurPage(page, po) {
    const { PDFName, PDFDict } = lib();
    if (!po.ref) return po.nom;
    const res = page.node.Resources();
    if (!res) return null;
    let polices = res.lookup(PDFName.of('Font'));
    if (!polices) { polices = page.doc.context.obj({}); res.set(PDFName.of('Font'), polices); }
    if (!(polices instanceof PDFDict)) return null;
    for (const [k, v] of polices.entries()) if (v === po.ref || String(v) === String(po.ref)) return k.asString().slice(1);
    let n = 1;
    while (polices.get(PDFName.of(`AtelierF${n}`))) n++;
    polices.set(PDFName.of(`AtelierF${n}`), po.ref);
    return `AtelierF${n}`;
  }
  // Codes du texte dans la police d'origine de la page ; null si un caractère n'y existe pas (police réduite)
  function encoderDansPolice(page, nom, texte, octets) {
    const { PDFName } = lib();
    const f = page.node.Resources()?.lookup(PDFName.of('Font'))?.lookup(PDFName.of(nom));
    if (!f) return null;
    const table = tableUnicode(f);
    if (!table) return null;
    const codes = [];
    for (const ch of String(texte)) {
      const c = table.get(ch);
      if (c === undefined) return null;
      codes.push(c);
    }
    return codes.map(c => (octets === 2 ? c.toString(16).padStart(4, '0') : c.toString(16).padStart(2, '0'))).join('');
  }

  async function retirerTexte(sortie, page, zones, ctx) {
    const { PDFName, PDFArray, decodePDFRawStream } = lib();
    const compte = zones.map(() => 0);
    compte.polices = zones.map(() => null); // police (nom de ressource) du texte retiré dans chaque zone
    if (!zones.length) return compte;
    // Contenu de la page (plusieurs flux possibles, mis bout à bout)
    const c = page.node.get(PDFName.of('Contents'));
    const refs = c instanceof PDFArray ? c.asArray() : (c ? [c] : []);
    const morceaux = [];
    try {
      for (const r of refs) { morceaux.push(decodePDFRawStream(sortie.context.lookup(r)).decode(), Uint8Array.of(10)); }
    } catch { return compte; }
    const total = morceaux.reduce((a, m) => a + m.length, 0);
    const b = new Uint8Array(total);
    let pos = 0;
    for (const m of morceaux) { b.set(m, pos); pos += m.length; }

    // Zones : rectangle (x, y, width, height) ou polygone (poly : [[x, y]…], texte en biais), en points PDF
    const marge = 0.8;
    const dansPoly = (x, y, poly) => {
      let dedans = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dedans = !dedans;
      }
      return dedans;
    };
    const dans = (x, y) => zones.findIndex(z => (z.poly ? dansPoly(x, y, z.poly)
      : x >= z.x - marge && x <= z.x + z.width + marge && y >= z.y - marge && y <= z.y + z.height + marge));
    const polices = new Map();
    let compteurX = 0;
    const hexa = codes => `<${codes.map(v => v.toString(16).padStart(2, '0')).join('')}>`;
    // Nombre TJ équivalent à un déplacement (en fraction de taille) : n = -déplacement × 1000
    const decalage = v => String(Math.round(-v * 1e6) / 1000);

    // Un flux de contenu (page ou sous-dessin) : renvoie le flux réécrit, ou null s'il n'a pas changé
    async function traiterFlux(b, ressources, ctmInitial, etatTexte, profondeur) {
      const ops = operations(b);
      let ctm = ctmInitial;
      const pileEtat = [];
      let tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0];
      let { tc, tw, th, tl, rise, tfs, police, nomPolice, refPolice } = etatTexte;
      const remplacements = [];
      for (const o of ops) {
        const a = o.args;
        switch (o.op) {
          case 'q': pileEtat.push({ ctm, tc, tw, th, tl, rise, tfs, police, nomPolice, refPolice }); break;
          case 'Q': if (pileEtat.length) ({ ctm, tc, tw, th, tl, rise, tfs, police, nomPolice, refPolice } = pileEtat.pop()); break;
          case 'Do': {
            // Sous-dessin (Form XObject) : parcouru avec sa matrice et ses ressources ; modifié, il est copié sous un
            // nouveau nom pour ne pas toucher ses autres emplois (autres pages, autres endroits de la page)
            if (profondeur >= 6) break;
            const nom = a[0] && a[0].nom;
            const xobjs = ressources && ressources.lookup(PDFName.of('XObject'));
            const ref = nom && xobjs && xobjs.get(PDFName.of(nom));
            const xo = ref && sortie.context.lookup(ref);
            if (!xo || !xo.dict || String(xo.dict.get(PDFName.of('Subtype'))) !== '/Form') break;
            let contenu;
            try { contenu = decodePDFRawStream(xo).decode(); } catch { break; }
            const m = xo.dict.lookup(PDFName.of('Matrix'));
            const mat = m instanceof PDFArray && m.size() === 6 ? m.asArray().map(v => (sortie.context.lookup(v) || v).asNumber()) : [1, 0, 0, 1, 0, 0];
            const resForm = xo.dict.lookup(PDFName.of('Resources')) || ressources;
            const nouveau = await traiterFlux(contenu, resForm, mult(mat, ctm), { tc, tw, th, tl, rise, tfs, police, nomPolice, refPolice }, profondeur + 1);
            if (nouveau) {
              const copie = sortie.context.flateStream(nouveau);
              for (const [k, v] of xo.dict.entries()) if (!['/Filter', '/DecodeParms', '/Length'].includes(k.asString())) copie.dict.set(k, v);
              const nouveauNom = `AtelierX${++compteurX}`;
              xobjs.set(PDFName.of(nouveauNom), sortie.context.register(copie));
              remplacements.push({ d: o.d, f: o.f, texte: `/${nouveauNom} Do` });
            }
            break;
          }
          case 'cm': if (a.length === 6) ctm = mult(a, ctm); break;
          case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = tm; break;
          case 'Tm': if (a.length === 6) { tm = a.slice(); tlm = tm; } break;
          case 'Td': tlm = mult([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm; break;
          case 'TD': tl = -a[1]; tlm = mult([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm; break;
          case 'T*': tlm = mult([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; break;
          case 'Tc': tc = a[0]; break;
          case 'Tw': tw = a[0]; break;
          case 'Tz': th = a[0] / 100; break;
          case 'TL': tl = a[0]; break;
          case 'Ts': rise = a[0]; break;
          case 'Tf':
            nomPolice = a[0] && a[0].nom; tfs = a[1];
            if (!polices.has(ressources)) polices.set(ressources, new Map());
            if (!polices.get(ressources).has(nomPolice)) polices.get(ressources).set(nomPolice, await infosPolice(ressources, nomPolice, ctx).catch(() => null));
            police = polices.get(ressources).get(nomPolice);
            refPolice = ressources?.lookup(PDFName.of('Font'))?.get(PDFName.of(nomPolice)) || null;
            break;
          case 'Tj': case 'TJ': case "'": case '"': {
            let prefixe = '';
            if (o.op === "'") { tlm = mult([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; prefixe = 'T* '; }
            if (o.op === '"') { tw = a[0]; tc = a[1]; tlm = mult([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; prefixe = `${a[0]} Tw ${a[1]} Tc T* `; }
            const elems = o.op === 'TJ' ? (Array.isArray(a[0]) ? a[0] : []) : [a[a.length - 1]];
            if (!police || !tfs) {
              // Police illisible : avance inconnue, on ne touche à rien
              break;
            }
            const sortieTJ = [];
            let retire = false, enAttente = 0, courant = [];
            const vider = () => { if (courant.length) { sortieTJ.push(hexa(courant)); courant = []; } };
            for (const el of elems) {
              if (typeof el === 'number') {
                if (enAttente) { sortieTJ.push(decalage(enAttente)); enAttente = 0; }
                vider();
                sortieTJ.push(String(el));
                tm = mult([1, 0, 0, 1, -el / 1000 * tfs * th, 0], tm);
                continue;
              }
              const octets = el && el.chaine;
              if (!octets) continue;
              for (let k = 0; k + police.octets <= octets.length; k += police.octets) {
                const code = police.octets === 2 ? (octets[k] << 8) | octets[k + 1] : octets[k];
                const w0 = police.largeur(code) || 0;
                const tx = (w0 * tfs + tc + (police.octets === 1 && code === 32 ? tw : 0)) * th;
                const trm = mult([tfs * th, 0, 0, tfs, 0, rise], mult(tm, ctm));
                const [cx, cy] = appliquer(trm, (w0 * 0.5), 0.35);
                const z = dans(cx, cy);
                const codes = police.octets === 2 ? [octets[k], octets[k + 1]] : [octets[k]];
                if (z >= 0 && w0 > 0) {
                  compte[z]++;
                  if (!compte.polices[z]) compte.polices[z] = { nom: nomPolice, infos: police, ref: refPolice };
                  retire = true;
                  vider();
                  // Décalage TJ équivalent à l'avance du caractère retiré (en millièmes de taille)
                  enAttente += tx / (tfs * th);
                } else {
                  if (enAttente) { sortieTJ.push(decalage(enAttente)); enAttente = 0; }
                  courant.push(...codes);
                }
                tm = mult([1, 0, 0, 1, tx, 0], tm);
              }
            }
            if (retire) {
              vider();
              if (enAttente) sortieTJ.push(decalage(enAttente));
              remplacements.push({ d: o.d, f: o.f, texte: `${prefixe}[${sortieTJ.join(' ')}] TJ` });
            }
            break;
          }
          default: break;
        }
      }
      if (!remplacements.length) return null;
      // Flux réécrit : tout est conservé à l'identique, sauf les opérations modifiées
      const enc = new TextEncoder();
      const parts = [];
      let dern = 0;
      for (const r of remplacements) { parts.push(b.subarray(dern, r.d), enc.encode(r.texte)); dern = r.f; }
      parts.push(b.subarray(dern));
      const n = parts.reduce((x, m) => x + m.length, 0);
      const nouveau = new Uint8Array(n);
      let q = 0;
      for (const m of parts) { nouveau.set(m, q); q += m.length; }
      return nouveau;
    }

    const nouveau = await traiterFlux(b, page.node.Resources(), [1, 0, 0, 1, 0, 0],
      { tc: 0, tw: 0, th: 1, tl: 0, rise: 0, tfs: 0, police: null, nomPolice: null, refPolice: null }, 0);
    if (nouveau) page.node.set(PDFName.of('Contents'), sortie.context.register(sortie.context.flateStream(nouveau)));
    return compte;
  }

  function remplirFormulaire(doc, champs) {
    const { PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList } = lib();
    let form;
    try { form = doc.getForm(); } catch { return; }
    // Caractères de la police standard du formulaire (WinAnsi) ; les autres deviennent « ? »
    const latin = t => String(t ?? '').replace(/[^\n\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC]/g, '?');
    for (const [nom, v] of Object.entries(champs)) {
      let f = null;
      try { f = form.getFieldMaybe(nom); } catch { f = null; }
      if (!f) continue;
      try {
        if (f instanceof PDFTextField) {
          let t = latin(v);
          const max = f.getMaxLength();
          if (max) t = t.slice(0, max);
          // Taille automatique ou démesurée sur un champ de plusieurs lignes : 10 pt
          const m = /([\d.]+)\s+Tf/.exec(f.acroField.getDefaultAppearance() || '');
          if (f.isMultiline() && (!m || !Number(m[1]) || Number(m[1]) > 14)) f.setFontSize(10);
          f.setText(t);
        } else if (f instanceof PDFCheckBox) { if (v) f.check(); else f.uncheck(); }
        else if (f instanceof PDFRadioGroup) {
          if (!v) { f.clear(); continue; }
          // pdf.js donne l'état « activé » du bouton (souvent 0, 1…), pdf-lib attend l'option : correspondance par le rang
          const options = f.getOptions();
          let choix = String(v);
          if (!options.includes(choix)) {
            const etats = f.acroField.getOnValues().map(n => n.asString().slice(1));
            const k = etats.indexOf(choix);
            if (k >= 0 && options[k] != null) choix = options[k];
            else if (/^\d+$/.test(choix) && options[Number(choix)] != null) choix = options[Number(choix)];
          }
          f.select(choix);
        }
        else if (f instanceof PDFDropdown || f instanceof PDFOptionList) { if (v) f.select(String(v)); else f.clear(); }
      } catch (e) { /* valeur refusée par le champ : laissé tel quel */ }
    }
    try { form.flatten(); } catch { try { form.updateFieldAppearances(); } catch { /* rien */ } }
  }

  // ---------- Annotations en commentaires PDF ----------
  const COMMENTABLES = ['texte', 'bulle', 'ligne', 'fleche', 'cadre', 'ellipse', 'crayon', 'surligne', 'image', 'tampon', 'cote', 'longueur', 'surface', 'angle'];
  // Cadre (unités de la page affichée) occupé par le dessin d'un élément, marges comprises
  function cadreElement(e, l, h, mesureTexte) {
    const ep = (e.epaisseur || 2) + 2;
    const pts = [];
    const X = v => v * l, Y = v => v * h;
    if (e.type === 'texte') {
      const lignes = String(e.texte || '').split(/\r?\n/);
      const t = e.taille || 12;
      const w = Math.max(...lignes.map(x => mesureTexte(x, e.gras, t)), 1);
      pts.push([X(e.x), Y(e.y)], [X(e.x) + w, Y(e.y) + lignes.length * 1.2 * t]);
    } else if ('w' in e && 'x' in e) {
      pts.push([X(e.x), Y(e.y)], [X(e.x + e.w), Y(e.y + e.h)]);
      if (e.type === 'bulle') pts.push([X(e.px ?? e.x), Y(e.py ?? e.y)]);
    } else if ('x1' in e) pts.push([X(e.x1), Y(e.y1)], [X(e.x2), Y(e.y2)]);
    else (e.points || []).forEach(([x, y]) => pts.push([X(x), Y(y)]));
    for (const et of etiquettes(e, l, h, 1)) {
      const lt = mesureTexte(et.texte, false, et.taille);
      pts.push([et.cx - lt / 2 - et.taille, et.cy - et.taille], [et.cx + lt / 2 + et.taille, et.cy + et.taille]);
    }
    if (!pts.length) return null;
    const m = ep + (['fleche', 'cote', 'angle'].includes(e.type) ? 12 : 2);
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    return { x0: Math.min(...xs) - m, y0: Math.min(...ys) - m, x1: Math.max(...xs) + m, y1: Math.max(...ys) + m };
  }
  async function ajouterCommentaires(sortie, page, r, elements, images, options) {
    const { PDFDocument, PDFName, PDFHexString, PDFString, StandardFonts } = lib();
    const boite = page.getCropBox();
    const affiche = tailleAffichee(boite, r);
    // Chaque élément est dessiné seul sur une page temporaire, intégrée comme apparence du commentaire
    const tmp = await PDFDocument.create();
    const ctxTmp = {
      police: await tmp.embedFont(StandardFonts.Helvetica), policeGras: await tmp.embedFont(StandardFonts.HelveticaBold),
      polices: new Map(), cacheImages: new Map(),
      policeStandard(nom) { if (!this.polices.has(nom)) this.polices.set(nom, tmp.embedFont(nom)); return this.polices.get(nom); },
      async image(id) { if (!id || !images[id]) return null; if (!this.cacheImages.has(id)) this.cacheImages.set(id, integrerImage(tmp, images[id].octets, images[id].mime)); return this.cacheImages.get(id); },
    };
    const mesure = (t, gras, taille) => (gras ? ctxTmp.policeGras : ctxTmp.police).widthOfTextAtSize(nettoyer(gras ? ctxTmp.policeGras : ctxTmp.police, t), taille);
    const pages = [], cadres = [], retenus = [];
    for (const e of elements) {
      const c = cadreElement(e, affiche.l, affiche.h, mesure);
      if (!c) continue;
      const tp = tmp.addPage([boite.width, boite.height]);
      tp.setMediaBox(boite.x, boite.y, boite.width, boite.height);
      await dessinerElements(tmp, tp, r, [e], ctxTmp);
      const a = versPdf(boite, r, c.x0 / affiche.l, c.y0 / affiche.h), b = versPdf(boite, r, c.x1 / affiche.l, c.y1 / affiche.h);
      const rect = { left: Math.min(a.x, b.x), bottom: Math.min(a.y, b.y), right: Math.max(a.x, b.x), top: Math.max(a.y, b.y) };
      pages.push(tp); cadres.push(rect); retenus.push(e);
    }
    if (!pages.length) return;
    const integrees = await sortie.embedPages(pages, cadres);
    const ctxPdf = sortie.context;
    const auteur = options.auteur || 'Atelier PDF';
    const maintenant = PDFString.fromDate(new Date());
    const pt = (x, y) => { const q = versPdf(boite, r, x, y); return [q.x, q.y]; };
    let annots = page.node.lookup(PDFName.of('Annots'));
    if (!annots) { annots = ctxPdf.obj([]); page.node.set(PDFName.of('Annots'), annots); }
    retenus.forEach((e, i) => {
      const rect = cadres[i];
      const coul = couleur(e.couleur || DEFAUTS[e.type] || (e.type === 'surligne' ? '#ffeb3b' : '#000000'));
      const d = ctxPdf.obj({ Type: 'Annot', Rect: [rect.left, rect.bottom, rect.right, rect.top], F: 4, C: [coul.red, coul.green, coul.blue] });
      // Apparence : le dessin d'Atelier PDF ; propriétés : celles qu'Acrobat sait modifier
      const ap = ctxPdf.obj({});
      ap.set(PDFName.of('N'), integrees[i].ref);
      d.set(PDFName.of('AP'), ap);
      d.set(PDFName.of('T'), PDFHexString.fromText(auteur));
      d.set(PDFName.of('M'), maintenant);
      d.set(PDFName.of('CreationDate'), maintenant);
      d.set(PDFName.of('NM'), PDFString.of(`atelierpdf-${Date.now().toString(36)}-${i}`));
      d.set(PDFName.of('AtelierPDF'), ctxPdf.obj(true));
      const bord = ctxPdf.obj({ W: e.epaisseur || 2 });
      const texte = e.texte || e.etiquette || (e.type === 'tampon' ? [e.texte, e.ligne2].filter(Boolean).join(' – ') : '');
      if (texte) d.set(PDFName.of('Contents'), PDFHexString.fromText(texte));
      const sous = {
        texte: 'FreeText', bulle: 'FreeText', ligne: 'Line', fleche: 'Line', cote: 'Line', cadre: 'Square', surligne: 'Square', ellipse: 'Circle',
        crayon: 'Ink', longueur: 'PolyLine', angle: 'PolyLine', surface: 'Polygon', image: 'Stamp', tampon: 'Stamp',
      }[e.type];
      d.set(PDFName.of('Subtype'), PDFName.of(sous));
      if (sous === 'FreeText') {
        d.set(PDFName.of('DA'), PDFString.of(`/Helv ${e.taille || 12} Tf ${coul.red} ${coul.green} ${coul.blue} rg`));
        if (e.type === 'bulle') d.set(PDFName.of('IT'), PDFName.of('FreeTextCallout'));
      }
      if (sous === 'Line') {
        d.set(PDFName.of('L'), ctxPdf.obj([...pt(e.x1, e.y1), ...pt(e.x2, e.y2)]));
        if (e.type === 'fleche') d.set(PDFName.of('LE'), ctxPdf.obj(['None', 'OpenArrow']));
        if (e.type === 'cote') d.set(PDFName.of('LE'), ctxPdf.obj(['ClosedArrow', 'ClosedArrow']));
        d.set(PDFName.of('BS'), bord);
      }
      if (sous === 'Square' || sous === 'Circle') {
        d.set(PDFName.of('BS'), e.type === 'surligne' ? ctxPdf.obj({ W: 0 }) : bord);
        if (e.type === 'surligne') { d.set(PDFName.of('IC'), ctxPdf.obj([coul.red, coul.green, coul.blue])); d.set(PDFName.of('CA'), ctxPdf.obj(0.35)); }
      }
      if (sous === 'Ink') { d.set(PDFName.of('InkList'), ctxPdf.obj([(e.points || []).flatMap(([x, y]) => pt(x, y))])); d.set(PDFName.of('BS'), bord); }
      if (sous === 'PolyLine' || sous === 'Polygon') { d.set(PDFName.of('Vertices'), ctxPdf.obj((e.points || []).flatMap(([x, y]) => pt(x, y)))); d.set(PDFName.of('BS'), bord); }
      if (sous === 'Stamp') d.set(PDFName.of('Name'), PDFName.of(e.type === 'tampon' ? 'Approved' : 'Draft'));
      annots.push(ctxPdf.register(d));
    });
  }

  // pdf-lib écrit dans le dernier flux de la page : on en force un nouveau
  function nouveauFlux(page) { page.contentStream = undefined; page.contentStreamRef = undefined; }

  // Données de réédition : pour chaque page, les flux ajoutés (annotations, numéros, filigrane) et les annotations
  // d'origine ; pour le document, les images utilisées et les options. Invisibles pour les autres logiciels.
  function ecrireDonneesEdition(sortie, infosPages, images, options) {
    const { PDFName, PDFBool, PDFHexString } = lib();
    const c = sortie.context;
    const flux = obj => c.register(c.flateStream(new TextEncoder().encode(JSON.stringify(obj))));
    const parPage = new Map(infosPages.map(i => [i.page.ref.toString(), i]));
    sortie.getPages().forEach(page => {
      const info = parPage.get(page.ref.toString());
      const calques = info ? info.calques.slice() : [];
      // Flux créé ensuite par la numérotation ou le filigrane
      if (page.contentStreamRef) calques.push(page.contentStreamRef);
      const d = c.obj({ V: 1 });
      d.set(PDFName.of('Calques'), c.obj(calques));
      if (!info) d.set(PDFName.of('Genere'), PDFBool.True);       // page de sommaire
      else if (info.donnees) d.set(PDFName.of('Donnees'), flux(info.donnees));
      page.node.set(PDFName.of('AtelierPDF'), d);
    });
    const dImages = c.obj({});
    const utilisees = new Set();
    infosPages.forEach(i => (i.donnees?.elements || []).forEach(e => { if (e.type === 'image') utilisees.add(e.image); }));
    for (const id of utilisees) {
      if (!images[id]) continue;
      const s = c.stream(images[id].octets instanceof Uint8Array ? images[id].octets : new Uint8Array(images[id].octets), {});
      s.dict.set(PDFName.of('Mime'), PDFHexString.fromText(images[id].mime || 'image/png'));
      dImages.set(PDFName.of(id), c.register(s));
    }
    const doc = c.obj({ V: 1 });
    doc.set(PDFName.of('Images'), dImages);
    doc.set(PDFName.of('Options'), flux(options.donneesDocument || {}));
    sortie.catalog.set(PDFName.of('AtelierPDF'), doc);
  }

  // PDF produit par Atelier PDF -> PDF d'origine (sans annotations, numéros, filigrane ni sommaire) et données pour
  // retrouver les annotations modifiables. null si le fichier ne vient pas d'Atelier PDF.
  async function relire(octets) {
    const { PDFDocument, PDFName, PDFArray, PDFRef, decodePDFRawStream } = lib();
    let doc;
    try { doc = await PDFDocument.load(octets, { updateMetadata: false }); } catch { return null; }
    const racine = doc.catalog.lookup(PDFName.of('AtelierPDF'));
    if (!racine) return null;
    const lireJson = ref => {
      try { return JSON.parse(new TextDecoder().decode(decodePDFRawStream(doc.context.lookup(ref)).decode())); } catch { return null; }
    };
    const images = {};
    const dImages = racine.lookup(PDFName.of('Images'));
    if (dImages) {
      for (const [nom, ref] of dImages.entries()) {
        const st = doc.context.lookup(ref);
        const mime = st.dict.lookup(PDFName.of('Mime'));
        images[nom.asString().slice(1)] = { octets: st.getContents().slice(), mime: mime && mime.decodeText ? mime.decodeText() : 'image/png' };
      }
    }
    const options = racine.get(PDFName.of('Options')) ? lireJson(racine.get(PDFName.of('Options'))) : null;
    const pages = [];
    const aRetirer = [];
    doc.getPages().forEach((page, i) => {
      const d = page.node.lookup(PDFName.of('AtelierPDF'));
      if (!d) { pages.push({}); return; }
      if (d.get(PDFName.of('Genere'))?.toString() === 'true') { aRetirer.push(i); return; }
      const calques = new Set((d.lookup(PDFName.of('Calques'))?.asArray() || []).map(r => r.toString()));
      const contenus = page.node.get(PDFName.of('Contents'));
      if (contenus instanceof PDFArray) {
        const garder = contenus.asArray().filter(r => !(r instanceof PDFRef && calques.has(r.toString())));
        page.node.set(PDFName.of('Contents'), doc.context.obj(garder));
      }
      const ref = d.get(PDFName.of('Donnees'));
      const donnees = ref ? (lireJson(ref) || {}) : {};
      (donnees.elements || []).forEach(e => { if (e.type === 'texteModifie') e.applique = true; });
      pages.push(donnees);
      page.node.delete(PDFName.of('AtelierPDF'));
      // Commentaires créés par Atelier PDF : ils redeviennent des annotations modifiables (données ci-dessus)
      const annots = page.node.lookup(PDFName.of('Annots'));
      if (annots instanceof PDFArray) {
        const garder = annots.asArray().filter(ref => { const a = doc.context.lookup(ref); return !(a && a.get && a.get(PDFName.of('AtelierPDF'))); });
        if (garder.length) page.node.set(PDFName.of('Annots'), doc.context.obj(garder)); else page.node.delete(PDFName.of('Annots'));
      }
    });
    aRetirer.reverse().forEach(i => doc.removePage(i));
    doc.catalog.delete(PDFName.of('AtelierPDF'));
    doc.catalog.delete(PDFName.of('Outlines'));
    return { octets: await doc.save({ useObjectStreams: true }), pages, images, options };
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

  return { compiler, relire, retirerTexte, nomPoliceStandard, lirePlages, versPdf, tailleAffichee, rectPdf, normRot, A4, formes, chemin, couperLignes, etiquettes, lignesTampon, MARGE_BULLE, DEFAUTS };
});
