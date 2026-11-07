// Tuyauteur : escaliers et passerelles industriels (montée, partie droite, descente).
// Calcul des marches (par l'angle ou par le giron), traçage des limons, garde-corps (main courante, lisse, plinthe),
// débit des pièces. Repères ISO 14122-3 / NF E 85-015 : angle conseillé 30° à 38° (20° à 45° admis),
// 600 ≤ giron + 2 × hauteur ≤ 660 mm, volée de 3 m maxi sans palier, garde-corps 1 100 mm, plinthe ≥ 100 mm.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./dessin.js'));
  else racine.Escalier = fabrique(racine.Dessin);
}(typeof self !== 'undefined' ? self : this, function (Dessin) {
  'use strict';
  const RAD = Math.PI / 180;
  const exiger = (c, m) => { if (!c) throw new Dessin.ErreurSaisie(m); };
  const nb = v => (v === '' || v == null || !isFinite(+v)) ? NaN : +v;
  const num = (v, d = 0) => isFinite(nb(v)) ? nb(v) : d;
  const fmt = (v, d = 1) => (+v).toFixed(d).replace('.', ',');
  const arr = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

  // Volée montant vers la droite : contremarche 1 en x = 0, nez de marche k en ((k−1)·g, k·h), arrivée en ((n−1)·g, H)
  function volee(H, p) {
    exiger(H > 0, 'Hauteur à franchir : saisir une valeur positive.');
    const hCible = num(p.hauteurMarche, 190);
    exiger(hCible >= 100 && hCible <= 300, 'Hauteur de marche visée : entre 100 et 300 mm.');
    const n = Math.max(1, Math.round(H / hCible));
    const h = H / n;
    let g, alpha;
    if (p.mode === 'giron') {
      g = num(p.giron); exiger(g >= 100, 'Giron (longueur de marche) : au moins 100 mm.');
      alpha = Math.atan2(h, g) / RAD;
    } else {
      alpha = num(p.angle, 38); exiger(alpha >= 15 && alpha <= 60, 'Angle de l\'escalier : entre 15° et 60°.');
      g = h / Math.tan(alpha * RAD);
    }
    return { H, n, h, g, alpha, marches: n - 1, reculement: (n - 1) * g, blondel: g + 2 * h };
  }

  // Limon : plat de largeur W (perpendiculaire), arête haute à e au-dessus de la ligne des nez ;
  // coupe basse horizontale (sol), coupe haute verticale au nez du palier.
  function limon(v, W, e) {
    const t = Math.tan(v.alpha * RAD), c = Math.cos(v.alpha * RAD);
    const U = x => v.h + x * t + e / c, Lo = x => U(x) - W / c;
    const xU0 = -(v.h + e / c) / t, xL0 = -(v.h + e / c - W / c) / t;
    const xt = v.reculement;
    const contour = [[xL0, 0], [xt, Lo(xt)], [xt, U(xt)], [xU0, 0]];
    // Traits des marches (dessus de marche) dans la largeur du limon
    const traits = [];
    for (let k = 1; k <= v.n - 1; k++) {
      const y = k * v.h, xa = (y - v.h - e / c) / t, xb = (y - v.h - e / c + W / c) / t;
      traits.push([[xa, y], [Math.min(xb, xt), y]]);
    }
    const longueur = Math.hypot(xt - xU0, U(xt));
    return { contour, traits, longueur, longueurBas: Math.hypot(xt - xL0, Lo(xt)), coupeSol: v.alpha, coupeHaut: 90 - v.alpha, U, Lo, xU0, xL0 };
  }

  // p : { type: 'escalier' | 'passerelle', H1, H2, droite, mode: 'angle'|'giron', angle, giron, hauteurMarche, largeur,
  //       limonL (largeur du limon), limonE (épaisseur), surNez, gardeCorps: 'aucun'|'un'|'deux', hauteurGC, hauteurMC,
  //       lisse (bool), plinthe (bool), plintheVolees (bool), hPlinthe, espacementPoteaux }
  function calculer(p) {
    const passerelle = p.type === 'passerelle';
    const H1 = num(p.H1), H2 = passerelle ? num(p.H2, H1) : 0, P = passerelle ? num(p.droite, 0) : num(p.droite, 0);
    const v1 = volee(H1, p), v2 = passerelle ? volee(H2, p) : null;
    exiger(P >= 0, 'Longueur de la partie droite : valeur positive ou nulle.');
    const W = num(p.limonL, 200), eL = num(p.limonE, 8), e = num(p.surNez, 60);
    exiger(W > e + 40, 'Largeur de limon trop faible par rapport à la hauteur au-dessus des nez.');
    const larg = num(p.largeur, 800);
    const gc = p.gardeCorps || 'deux', nCotes = gc === 'aucun' ? 0 : gc === 'un' ? 1 : 2;
    const hGC = num(p.hauteurGC, 1100), hMC = num(p.hauteurMC, 1000), hPl = num(p.hPlinthe, 100), esp = num(p.espacementPoteaux, 1500);
    const avert = [];
    for (const [v, nom] of [[v1, 'Montée'], [v2, 'Descente']]) {
      if (!v) continue;
      if (v.alpha < 30 || v.alpha > 38) avert.push(`${nom} : angle de ${fmt(v.alpha)}° hors de la plage conseillée 30° à 38°${v.alpha < 20 || v.alpha > 45 ? ' (et hors 20° à 45° admis)' : ''}.`);
      if (v.blondel < 600 || v.blondel > 660) avert.push(`${nom} : g + 2h = ${fmt(v.blondel, 0)} mm hors de 600 à 660 mm (pas confortable).`);
      if (v.H > 3000) avert.push(`${nom} : volée de ${fmt(v.H, 0)} mm, prévoir un palier intermédiaire au-delà de 3 m.`);
    }
    if (nCotes === 0 && (H1 > 500 || H2 > 500)) avert.push('Hauteur de chute supérieure à 500 mm : garde-corps requis.');
    if (nCotes > 0 && hGC < 1100) avert.push('Garde-corps de palier : hauteur minimale 1 100 mm.');
    if (passerelle && nCotes > 0 && !p.plinthe) avert.push('Partie droite sans plinthe : plinthe de 100 mm requise sur les paliers et passerelles.');

    // ------------------------------------------------ Élévation
    const d = Dessin.creer();
    const L1 = limon(v1, W, e);
    const xP0 = v1.reculement, xP1 = xP0 + P;
    const sol2 = passerelle ? H1 - H2 : 0;
    // Volée descendante : géométrie d'une volée montante, retournée en miroir au bout de la partie droite
    const L2 = v2 ? limon(v2, W, e) : null;
    const m2 = ([x, y]) => [xP1 + (v2.reculement - x), y + sol2];
    const xFin = v2 ? xP1 + v2.reculement : xP1;
    const marg = 400;
    d.ligne([L1.xU0 - marg, 0], [Math.max(xP1, 0) + (v2 ? 0 : marg), 0], 'TRACAGE');
    if (v2) d.ligne([m2([L2.xU0, 0])[0] + marg, sol2], [xP1, sol2], 'TRACAGE');
    // Marches et contremarches
    const marches = (v, f) => {
      for (let k = 1; k <= v.n; k++) {
        d.polyligne([f([(k - 1) * v.g, (k - 1) * v.h]), f([(k - 1) * v.g, k * v.h]), ...(k < v.n ? [f([k * v.g, k * v.h])] : [])], 'DECOUPE');
      }
    };
    const id = q => q;
    marches(v1, id);
    d.polyligne(L1.contour, 'TRACAGE', true);
    if (v2) { marches(v2, m2); d.polyligne(L2.contour.map(m2), 'TRACAGE', true); }
    // Palier / partie droite
    const hPal = Math.min(W, 160);
    if (P > 0) d.polyligne([[xP0, H1], [xP1, H1], [xP1, H1 - hPal], [xP0, H1 - hPal]], 'DECOUPE', true);
    else if (!v2) d.ligne([xP0, H1], [xP0 + 300, H1], 'TRACAGE');
    // Garde-corps : main courante à hMC au-dessus des nez dans les volées, hGC sur la partie droite
    const t1 = Math.tan(v1.alpha * RAD);
    const poteaux = [];
    if (nCotes) {
      // [x, niveau du nez ou du plancher, hauteur de main courante]
      const trace = [[0, v1.h, hMC], [xP0, H1, hMC]];
      if (P > 0) trace.push([xP0, H1, hGC], [xP1, H1, hGC], [xP1, H1, hMC]);
      if (v2) trace.push([xFin, sol2 + v2.h, hMC]);
      d.polyligne(trace.map(([x, y, hh]) => [x, y + hh]), 'DECOUPE');
      if (p.lisse !== false) d.polyligne(trace.map(([x, y, hh]) => [x, y + hh / 2]), 'TRACAGE');
      // Poteaux : départ, arrivée, puis tous les « esp » au plus (mesuré à l'horizontale)
      const repartir = (x0, x1) => { const n = Math.max(1, Math.ceil((x1 - x0) / esp - 1e-9)); for (let i = 0; i <= n; i++) poteaux.push(x0 + (x1 - x0) * i / n); };
      repartir(0, xP0);
      if (P > 0) repartir(xP0, xP1);
      if (v2) repartir(xP1, xFin);
      const uniques = poteaux.sort((a, b) => a - b).filter((x, i, t) => !i || x - t[i - 1] > 1);
      poteaux.length = 0; poteaux.push(...uniques);
      const nezY = x => {
        if (x <= xP0) return v1.h + Math.max(0, x) * t1;
        if (x <= xP1 + 1e-6 || !v2) return H1;
        return v2.h + Math.max(0, xFin - x) * Math.tan(v2.alpha * RAD) + sol2;
      };
      const mcY = x => x < xP0 - 1 ? nezY(x) + hMC : x <= xP1 + 1 ? H1 + (P > 0 ? hGC : hMC) : nezY(x) + hMC;
      for (const x of poteaux) d.ligne([x, nezY(x)], [x, mcY(x)], 'DECOUPE');
      if (p.plinthe && P > 0) d.polyligne([[xP0, H1], [xP1, H1], [xP1, H1 + hPl], [xP0, H1 + hPl]], 'TRACAGE', true);
    }
    // Cotes
    const h = Math.max(25, Math.max(xFin - L1.xU0, H1) / 60);
    d.cote([L1.xU0 - marg * 0.6, 0], [L1.xU0 - marg * 0.6, H1], -2 * h, `H ${fmt(H1, 0)} = ${v1.n} × ${fmt(v1.h)}`, h);
    d.cote([0, -2 * h], [xP0, -2 * h], -2 * h, `${v1.marches} × ${fmt(v1.g)} = ${fmt(v1.reculement, 0)}`, h);
    if (P > 0) d.cote([xP0, H1 + (nCotes ? hGC : 0) + 2 * h], [xP1, H1 + (nCotes ? hGC : 0) + 2 * h], 2 * h, `partie droite ${fmt(P, 0)}`, h);
    if (v2) {
      d.cote([xP1, sol2 - 2 * h], [xFin, sol2 - 2 * h], -2 * h, `${v2.marches} × ${fmt(v2.g)} = ${fmt(v2.reculement, 0)}`, h);
      d.cote(m2([L2.xU0 - marg * 0.6, 0]), m2([L2.xU0 - marg * 0.6, H2]), 2 * h, `H ${fmt(H2, 0)} = ${v2.n} × ${fmt(v2.h)}`, h);
    }
    d.texte(v1.g * 0.6, v1.h * 0.4 + 2.2 * v1.h, h, `${fmt(v1.alpha)}°`, 'COTES');

    // ------------------------------------------------ Limons à plat (traçage / découpe)
    const limons = [];
    const dessinLimon = (Lm, v, nom) => {
      const dl = Dessin.creer();
      dl.polyligne(Lm.contour, 'DECOUPE', true);
      for (const [a, b] of Lm.traits) dl.ligne(a, b, 'PLIAGE');
      const hh = Math.max(8, W / 12);
      dl.texte((Lm.contour[0][0] + Lm.contour[1][0]) / 2, Lm.Lo((Lm.contour[0][0] + Lm.contour[1][0]) / 2) + W * 0.35, hh, `${nom} - ${v.marches} marches - h ${fmt(v.h)} g ${fmt(v.g)}`, 'TEXTE', 'c', v.alpha);
      dl.cote(Lm.contour[3], Lm.contour[2], 2 * hh, `${fmt(Lm.longueur, 0)}`, hh);
      dl.texte(Lm.contour[0][0] + hh, hh * 0.5, hh, `coupe ${fmt(Lm.coupeSol)}°`, 'COTES');
      dl.texte(Lm.contour[2][0] - hh * 0.5, Lm.contour[2][1] - 2 * hh, hh, `coupe ${fmt(Lm.coupeHaut)}°`, 'COTES', 'd');
      return dl;
    };
    limons.push({ nom: 'Limon montée', volee: v1, limon: L1, dessin: dessinLimon(L1, v1, 'Limon montee'), quantite: 2 });
    if (v2) limons.push({ nom: 'Limon descente', volee: v2, limon: L2, dessin: dessinLimon(L2, v2, 'Limon descente'), quantite: 2 });

    // ------------------------------------------------ Débit
    const rampant = v => v.reculement / Math.cos(v.alpha * RAD);
    const debit = [];
    for (const l of limons) debit.push([l.nom, `plat ${fmt(W, 0)} × ${fmt(eL, 0)}`, l.quantite, arr(l.limon.longueur, 0), `coupes ${fmt(l.limon.coupeSol)}° / ${fmt(l.limon.coupeHaut)}°`]);
    const nMarches = v1.marches + (v2 ? v2.marches : 0);
    if (nMarches) debit.push(['Marches (caillebotis ou tôle larmée)', `${fmt(larg, 0)} × ${fmt(Math.ceil(v1.g / 5) * 5 + 30, 0)}`, nMarches, arr(larg, 0), 'giron + recouvrement 30 mm']);
    if (P > 0) debit.push(['Partie droite : plancher', `${fmt(larg, 0)} de large`, 1, arr(P, 0), `${fmt(P * larg / 1e6, 2)} m²`]);
    if (nCotes) {
      const lMC = rampant(v1) + P + (v2 ? rampant(v2) : 0);
      debit.push(['Main courante', 'tube Ø 42,4 × 2,6', nCotes, arr(lMC, 0), 'longueur développée']);
      if (p.lisse !== false) debit.push(['Lisse intermédiaire', 'tube Ø 33,7 × 2,6', nCotes, arr(lMC, 0), '']);
      debit.push(['Poteaux', 'tube Ø 42,4 × 2,6 ou plat 50 × 10', poteaux.length * nCotes, arr(Math.max(hGC, hMC) + 100, 0), 'longueur maxi, à ajuster']);
      if (p.plinthe) {
        const lPl = P + (p.plintheVolees ? rampant(v1) + (v2 ? rampant(v2) : 0) : 0);
        if (lPl > 0) debit.push(['Plinthe', `plat ${fmt(hPl, 0)} × 3`, nCotes, arr(lPl, 0), p.plintheVolees ? 'paliers et volées' : 'partie droite']);
      }
    }
    return {
      volees: [v1, v2].filter(Boolean).map(v => ({ ...v, h: arr(v.h, 2), g: arr(v.g, 1), alpha: arr(v.alpha, 2), reculement: arr(v.reculement, 0), blondel: arr(v.blondel, 0), rampant: arr(rampant(v), 0) })),
      emprise: arr((v2 ? m2([L2.xU0, 0])[0] : Math.max(xP1, xP0)) - L1.xU0, 0),
      longueurTotale: arr(xFin, 0), poteaux: poteaux.length * nCotes, debit, avertissements: avert,
      dessins: { elevation: d, limons },
      tableauMarches: v1 ? Array.from({ length: v1.n }, (_, i) => ({ k: i + 1, x: arr(i * v1.g, 1), y: arr((i + 1) * v1.h, 1) })) : [],
    };
  }

  return { calculer, volee, limon };
}));
