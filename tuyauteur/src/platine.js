// Tuyauteur : platines simples pour la découpe laser (rectangulaires ou rondes, angles vifs, arrondis ou chanfreinés)
// percées de trous en coins, en grille ou sur un cercle, avec un trou central éventuel.
// Contrôle des pinces et entraxes des trous (repères EN 1993-1-8 : pince ≥ 1,2 d0, entraxe ≥ 2,2 d0).
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./dessin.js'));
  else racine.Platine = fabrique(racine.Dessin);
}(typeof self !== 'undefined' ? self : this, function (Dessin) {
  'use strict';
  const exiger = (c, m) => { if (!c) throw new Dessin.ErreurSaisie(m); };
  const nb = v => (v === '' || v == null || !isFinite(+v)) ? NaN : +v;
  const num = (v, d = 0) => isFinite(nb(v)) ? nb(v) : d;
  const fmt = (v, d = 1) => (+v).toFixed(d).replace('.', ',').replace(/,0+$/, '');
  const arr = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

  // Contour d'un rectangle centré, angles vifs, arrondis (rayon r) ou chanfreinés (c × c)
  function contourRect(L, l, coins, r) {
    const x = L / 2, y = l / 2;
    if (coins === 'vifs' || !(r > 0)) return [[-x, -y], [x, -y], [x, y], [-x, y]];
    // Chanfreins c × c
    if (coins === 'chanfreins') return [[-x + r, -y], [x - r, -y], [x, -y + r], [x, y - r], [x - r, y], [-x + r, y], [-x, y - r], [-x, -y + r]];
    // Arrondis de rayon r (12 segments par quart)
    const pts = [];
    for (const [cx, cy, a0] of [[x - r, -y + r, -90], [x - r, y - r, 0], [-x + r, y - r, 90], [-x + r, -y + r, 180]]) {
      for (let k = 0; k <= 12; k++) { const a = (a0 + 90 * k / 12) * Math.PI / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    }
    return pts;
  }

  // Positions des trous
  function trous(p, forme, L, l, D) {
    const t = [];
    const disp = p.disposition || (forme === 'rond' ? 'cercle' : 'coins');
    if (disp === 'coins') {
      const ex = num(p.bordX, 30), ey = num(p.bordY, ex);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) t.push([sx * (L / 2 - ex), sy * (l / 2 - ey)]);
    } else if (disp === 'grille') {
      const nx = Math.max(1, Math.round(num(p.nx, 2))), ny = Math.max(1, Math.round(num(p.ny, 2)));
      const ax = num(p.entraxeX, 100), ay = num(p.entraxeY, 100);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) t.push([(i - (nx - 1) / 2) * ax, (j - (ny - 1) / 2) * ay]);
    } else if (disp === 'cercle') {
      const n = Math.max(1, Math.round(num(p.n, 4))), R = num(p.pcd, forme === 'rond' ? 0.75 * D : 0.7 * Math.min(L, l)) / 2;
      const a0 = num(p.angleDepart, 180 / n) * Math.PI / 180;
      for (let i = 0; i < n; i++) { const a = a0 + 2 * Math.PI * i / n; t.push([R * Math.cos(a), R * Math.sin(a)]); }
    }
    return t;
  }

  // Distance d'un point au contour (polygone) : pince
  function distanceContour(pt, contour) {
    let dmin = Infinity;
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i], b = contour[(i + 1) % contour.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2));
      dmin = Math.min(dmin, Math.hypot(pt[0] - a[0] - u * dx, pt[1] - a[1] - u * dy));
    }
    return dmin;
  }
  const dedans = (pt, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  };

  // p : { forme: 'rect' | 'rond', L, l, D, epaisseur, coins, rayon, disposition, bordX, bordY, nx, ny, entraxeX, entraxeY,
  //       n, pcd, angleDepart, dTrou, dCentral, quantite, masseVolumique, repere, cotes (bool) }
  function platine(p) {
    const forme = p.forme === 'rond' ? 'rond' : 'rect';
    const t = num(p.epaisseur, 10), dT = num(p.dTrou, 14), dC = num(p.dCentral, 0);
    exiger(t > 0, 'Épaisseur : saisir une valeur positive.');
    let L, l, D, contour;
    if (forme === 'rond') {
      D = num(p.D); exiger(D > 0, 'Ø de la platine : saisir une valeur positive.');
      L = l = D;
      contour = Array.from({ length: 144 }, (_, i) => [D / 2 * Math.cos(2 * Math.PI * i / 144), D / 2 * Math.sin(2 * Math.PI * i / 144)]);
    } else {
      L = num(p.L); l = num(p.l);
      exiger(L > 0 && l > 0, 'Longueur et largeur de la platine : saisir des valeurs positives.');
      const r = num(p.rayon, 0);
      exiger(!(r > 0) || p.coins === 'vifs' || 2 * r < Math.min(L, l), 'Rayon / chanfrein trop grand pour la platine.');
      contour = contourRect(L, l, p.coins, r);
    }
    const pos = p.disposition === 'aucun' ? [] : trous(p, forme, L, l, D);
    const avert = [];
    exiger(dT > 0 || !pos.length, 'Ø des trous : saisir une valeur positive.');
    for (const q of pos) exiger(dedans(q, contour) && distanceContour(q, contour) > dT / 2, 'Un trou sort de la platine : revoir les pinces ou les entraxes.');
    if (pos.length) {
      const pince = Math.min(...pos.map(q => distanceContour(q, contour)));
      if (pince < 1.2 * dT) avert.push(`Pince de ${fmt(pince)} mm inférieure à 1,2 × Ø trou (${fmt(1.2 * dT)} mm).`);
      let ent = Infinity;
      for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) ent = Math.min(ent, Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]));
      if (pos.length > 1 && ent < 2.2 * dT) avert.push(`Entraxe de ${fmt(ent)} mm inférieur à 2,2 × Ø trou (${fmt(2.2 * dT)} mm).`);
      if (dC > 0 && Math.min(...pos.map(q => Math.hypot(q[0], q[1]))) < dC / 2 + dT / 2 + 5) avert.push('Trou central trop proche des trous de fixation.');
    }
    if (dT > 0 && dT < t) avert.push(`Trous Ø${fmt(dT)} plus petits que l'épaisseur ${fmt(t)} : limite courante de la découpe laser (Ø ≥ épaisseur).`);
    if (dC > 0) exiger(dC < Math.min(L, l) - 10, 'Trou central plus grand que la platine.');

    const d = Dessin.creer();
    d.polyligne(contour, 'DECOUPE', true);
    for (const [x, y] of pos) d.trou(x, y, dT / 2);
    if (dC > 0) d.trou(0, 0, dC / 2);
    const h = Math.max(3, Math.min(L, l) / 30);
    if (p.cotes !== false) {
      d.ligne([-L / 2 - 8, 0], [L / 2 + 8, 0], 'AXES'); d.ligne([0, -l / 2 - 8], [0, l / 2 + 8], 'AXES');
      if (forme === 'rond') d.cote([-D / 2, -D / 2 - 4 * h], [D / 2, -D / 2 - 4 * h], 0, `Ø ${fmt(D)}`, h);
      else {
        d.cote([-L / 2, -l / 2], [L / 2, -l / 2], -4 * h, fmt(L), h);
        d.cote([L / 2, -l / 2], [L / 2, l / 2], -4 * h, fmt(l), h);
      }
      const xs = [...new Set(pos.map(q => arr(q[0])))].sort((a, b) => a - b), ys = [...new Set(pos.map(q => arr(q[1])))].sort((a, b) => a - b);
      if (p.disposition !== 'cercle' && forme === 'rect' && pos.length) {
        const pts = [-L / 2, ...xs];
        for (let i = 1; i < pts.length; i++) d.cote([pts[i - 1], l / 2], [pts[i], l / 2], 2.5 * h, fmt(pts[i] - pts[i - 1]), h * 0.8);
        const pys = [-l / 2, ...ys];
        for (let i = 1; i < pys.length; i++) d.cote([-L / 2, pys[i - 1]], [-L / 2, pys[i]], 2.5 * h, fmt(pys[i] - pys[i - 1]), h * 0.8);
      } else if (pos.length && p.disposition === 'cercle') {
        const R = Math.hypot(pos[0][0], pos[0][1]);
        d.cercle(0, 0, R, 'AXES', 144);
        d.texte(0, R + h * 0.6, h * 0.8, `${pos.length} trous Ø${fmt(dT)} sur Ø${fmt(2 * R)}`, 'COTES', 'c');
      }
      if (p.disposition !== 'cercle' && pos.length) d.texte(pos[0][0] + dT / 2 + 1, pos[0][1] - dT / 2 - h, h * 0.8, `${pos.length} × Ø${fmt(dT)}`, 'COTES');
      if (dC > 0) d.texte(dC / 2 * 0.72 + 1, dC / 2 * 0.72 + 1, h * 0.8, `Ø${fmt(dC)}`, 'COTES');
    }
    if (p.repere) d.texte(0, -l / 2 + h * 1.2 + (dC > 0 ? 0 : 0), h, `${p.repere} ép.${fmt(t)}`, 'TEXTE', 'c');

    const aireBrute = Math.abs(contour.reduce((s, a, i) => { const b = contour[(i + 1) % contour.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
    const aire = aireBrute - pos.length * Math.PI * dT * dT / 4 - (dC > 0 ? Math.PI * dC * dC / 4 : 0);
    const q = Math.max(1, Math.round(num(p.quantite, 1)));
    const masse = aire / 1e6 * t * num(p.masseVolumique, 7.85);
    const perimetre = contour.reduce((s, a, i) => { const b = contour[(i + 1) % contour.length]; return s + Math.hypot(b[0] - a[0], b[1] - a[1]); }, 0) + pos.length * Math.PI * dT + (dC > 0 ? Math.PI * dC : 0);
    return {
      forme, L, l, D, trous: pos.map(([x, y]) => ({ x: arr(x), y: arr(y), dx: arr(x + L / 2), dy: arr(y + l / 2) })), avertissements: avert, dessin: d,
      resultats: { aire: arr(aire / 1e6, 4), masse: arr(masse, 2), masseTotale: arr(masse * q, 2), quantite: q, longueurDecoupe: arr(perimetre * q / 1000, 2), nbTrous: pos.length + (dC > 0 ? 1 : 0) },
    };
  }

  return { platine, contourRect };
}));
