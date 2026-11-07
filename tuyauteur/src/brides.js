// Tuyauteur : brides EN 1092-1 (PN 6 à 40) et ASME B16.5 (classes 150 et 300).
//   reconnaitre()  retrouve DN et PN d'une bride sans inscription, à partir du nombre de trous et d'un entraxe mesuré
//   boulonnerie()  longueur des tiges / vis d'un montage (bride-bride, bride-filtre, vanne papillon à insérer ou taraudée)
//   abaque()       tableau des longueurs pour tous les DN et PN d'un type de montage
// Les épaisseurs de brides (type 11 à collerette) et les longueurs face à face des vannes papillon (EN 558 série 20)
// sont des valeurs indicatives : elles restent modifiables au calcul.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./dessin.js'));
  else racine.Brides = fabrique(racine.Dessin);
}(typeof self !== 'undefined' ? self : this, function (Dessin) {
  'use strict';
  const ErreurSaisie = Dessin.ErreurSaisie;
  const exiger = (c, m) => { if (!c) throw new ErreurSaisie(m); };
  const nb = v => (v === '' || v == null || !isFinite(+v)) ? NaN : +v;
  const fmt = (v, d = 1) => (+v).toFixed(d).replace('.', ',');

  // EN 1092-1 : [DN, Ø extérieur D, Ø de perçage K, Ø des trous L, nombre de trous, filetage, épaisseur type 11]
  const EN = {
    6: [[15, 80, 55, 11, 4, 'M10', 12], [20, 90, 65, 11, 4, 'M10', 14], [25, 100, 75, 11, 4, 'M10', 14], [32, 120, 90, 14, 4, 'M12', 14], [40, 130, 100, 14, 4, 'M12', 14], [50, 140, 110, 14, 4, 'M12', 14], [65, 160, 130, 14, 4, 'M12', 14], [80, 190, 150, 18, 4, 'M16', 16], [100, 210, 170, 18, 4, 'M16', 16], [125, 240, 200, 18, 8, 'M16', 18], [150, 265, 225, 18, 8, 'M16', 18], [200, 320, 280, 18, 8, 'M16', 20], [250, 375, 335, 18, 12, 'M16', 22], [300, 440, 395, 22, 12, 'M20', 22], [350, 490, 445, 22, 12, 'M20', 22], [400, 540, 495, 22, 16, 'M20', 22], [450, 595, 550, 22, 16, 'M20', 24], [500, 645, 600, 22, 20, 'M20', 24], [600, 755, 705, 26, 20, 'M24', 30]],
    10: [[15, 95, 65, 14, 4, 'M12', 16], [20, 105, 75, 14, 4, 'M12', 18], [25, 115, 85, 14, 4, 'M12', 18], [32, 140, 100, 18, 4, 'M16', 18], [40, 150, 110, 18, 4, 'M16', 18], [50, 165, 125, 18, 4, 'M16', 18], [65, 185, 145, 18, 8, 'M16', 18], [80, 200, 160, 18, 8, 'M16', 20], [100, 220, 180, 18, 8, 'M16', 20], [125, 250, 210, 18, 8, 'M16', 22], [150, 285, 240, 22, 8, 'M20', 22], [200, 340, 295, 22, 8, 'M20', 24], [250, 395, 350, 22, 12, 'M20', 26], [300, 445, 400, 22, 12, 'M20', 26], [350, 505, 460, 22, 16, 'M20', 26], [400, 565, 515, 26, 16, 'M24', 26], [450, 615, 565, 26, 20, 'M24', 28], [500, 670, 620, 26, 20, 'M24', 28], [600, 780, 725, 30, 20, 'M27', 30]],
    16: [[15, 95, 65, 14, 4, 'M12', 16], [20, 105, 75, 14, 4, 'M12', 18], [25, 115, 85, 14, 4, 'M12', 18], [32, 140, 100, 18, 4, 'M16', 18], [40, 150, 110, 18, 4, 'M16', 18], [50, 165, 125, 18, 4, 'M16', 18], [65, 185, 145, 18, 8, 'M16', 18], [80, 200, 160, 18, 8, 'M16', 20], [100, 220, 180, 18, 8, 'M16', 20], [125, 250, 210, 18, 8, 'M16', 22], [150, 285, 240, 22, 8, 'M20', 22], [200, 340, 295, 22, 12, 'M20', 24], [250, 405, 355, 26, 12, 'M24', 26], [300, 460, 410, 26, 12, 'M24', 28], [350, 520, 470, 26, 16, 'M24', 30], [400, 580, 525, 30, 16, 'M27', 32], [450, 640, 585, 30, 20, 'M27', 34], [500, 715, 650, 33, 20, 'M30', 36], [600, 840, 770, 36, 20, 'M33', 40]],
    25: [[15, 95, 65, 14, 4, 'M12', 16], [20, 105, 75, 14, 4, 'M12', 18], [25, 115, 85, 14, 4, 'M12', 18], [32, 140, 100, 18, 4, 'M16', 18], [40, 150, 110, 18, 4, 'M16', 18], [50, 165, 125, 18, 4, 'M16', 20], [65, 185, 145, 18, 8, 'M16', 22], [80, 200, 160, 18, 8, 'M16', 24], [100, 235, 190, 22, 8, 'M20', 24], [125, 270, 220, 26, 8, 'M24', 26], [150, 300, 250, 26, 8, 'M24', 28], [200, 360, 310, 26, 12, 'M24', 30], [250, 425, 370, 30, 12, 'M27', 32], [300, 485, 430, 30, 16, 'M27', 34], [350, 555, 490, 33, 16, 'M30', 38], [400, 620, 550, 36, 16, 'M33', 40], [450, 670, 600, 36, 20, 'M33', 46], [500, 730, 660, 36, 20, 'M33', 48], [600, 845, 770, 39, 20, 'M36', 58]],
    40: [[15, 95, 65, 14, 4, 'M12', 16], [20, 105, 75, 14, 4, 'M12', 18], [25, 115, 85, 14, 4, 'M12', 18], [32, 140, 100, 18, 4, 'M16', 18], [40, 150, 110, 18, 4, 'M16', 18], [50, 165, 125, 18, 4, 'M16', 20], [65, 185, 145, 18, 8, 'M16', 22], [80, 200, 160, 18, 8, 'M16', 24], [100, 235, 190, 22, 8, 'M20', 24], [125, 270, 220, 26, 8, 'M24', 26], [150, 300, 250, 26, 8, 'M24', 28], [200, 375, 320, 30, 12, 'M27', 34], [250, 450, 385, 33, 12, 'M30', 38], [300, 515, 450, 33, 16, 'M30', 42], [350, 580, 510, 36, 16, 'M33', 46], [400, 660, 585, 39, 16, 'M36', 50], [450, 685, 610, 39, 20, 'M36', 50], [500, 755, 670, 42, 20, 'M39', 52], [600, 890, 795, 48, 20, 'M45', 60]],
  };
  const PNS = [6, 10, 16, 25, 40];
  const DNS = EN[16].map(r => r[0]);
  const bride = (dn, pn) => {
    const r = (EN[pn] || []).find(x => x[0] === +dn);
    return r ? { norme: 'EN 1092-1', dn: r[0], pn: +pn, D: r[1], K: r[2], L: r[3], n: r[4], filetage: r[5], epaisseur: r[6] } : null;
  };

  // ASME B16.5 : [NPS, DN, D, K, L, n, boulon] (mm)
  const ASME = {
    150: [['1/2', 15, 88.9, 60.3, 15.7, 4, '1/2"'], ['3/4', 20, 98.4, 69.8, 15.7, 4, '1/2"'], ['1', 25, 108, 79.4, 15.7, 4, '1/2"'], ['1 1/4', 32, 117.5, 88.9, 15.7, 4, '1/2"'], ['1 1/2', 40, 127, 98.4, 15.7, 4, '1/2"'], ['2', 50, 152.4, 120.7, 19.1, 4, '5/8"'], ['2 1/2', 65, 177.8, 139.7, 19.1, 4, '5/8"'], ['3', 80, 190.5, 152.4, 19.1, 4, '5/8"'], ['4', 100, 228.6, 190.5, 19.1, 8, '5/8"'], ['5', 125, 254, 215.9, 22.4, 8, '3/4"'], ['6', 150, 279.4, 241.3, 22.4, 8, '3/4"'], ['8', 200, 342.9, 298.5, 22.4, 8, '3/4"'], ['10', 250, 406.4, 362, 25.4, 12, '7/8"'], ['12', 300, 482.6, 431.8, 25.4, 12, '7/8"'], ['14', 350, 533.4, 476.3, 28.4, 12, '1"'], ['16', 400, 596.9, 539.8, 28.4, 16, '1"'], ['18', 450, 635, 577.9, 31.8, 16, '1 1/8"'], ['20', 500, 698.5, 635, 31.8, 20, '1 1/8"'], ['24', 600, 812.8, 749.3, 35.1, 20, '1 1/4"']],
    300: [['1/2', 15, 95.2, 66.7, 15.7, 4, '1/2"'], ['3/4', 20, 117.5, 82.6, 19.1, 4, '5/8"'], ['1', 25, 123.8, 88.9, 19.1, 4, '5/8"'], ['1 1/4', 32, 133.4, 98.4, 19.1, 4, '5/8"'], ['1 1/2', 40, 155.6, 114.3, 22.4, 4, '3/4"'], ['2', 50, 165.1, 127, 19.1, 8, '5/8"'], ['2 1/2', 65, 190.5, 149.2, 22.4, 8, '3/4"'], ['3', 80, 209.6, 168.3, 22.4, 8, '3/4"'], ['4', 100, 254, 200, 22.4, 8, '3/4"'], ['5', 125, 279.4, 235, 22.4, 8, '3/4"'], ['6', 150, 317.5, 269.9, 22.4, 12, '3/4"'], ['8', 200, 381, 330.2, 25.4, 12, '7/8"'], ['10', 250, 444.5, 387.4, 28.4, 16, '1"'], ['12', 300, 520.7, 450.8, 31.8, 16, '1 1/8"'], ['14', 350, 584.2, 514.4, 31.8, 20, '1 1/8"'], ['16', 400, 647.7, 571.5, 35.1, 20, '1 1/4"'], ['18', 450, 711.2, 628.6, 35.1, 24, '1 1/4"'], ['20', 500, 774.7, 685.8, 35.1, 24, '1 1/4"'], ['24', 600, 914.4, 812.8, 41.1, 24, '1 1/2"']],
  };

  // Toutes les brides connues, les perçages identiques regroupés (ex. PN 10 et PN 16 jusqu'au DN 150)
  function catalogue() {
    const grp = new Map();
    for (const pn of PNS) for (const r of EN[pn]) {
      const cle = `EN|${r[0]}|${r[1]}|${r[2]}|${r[3]}|${r[4]}`;
      const g = grp.get(cle) || { norme: 'EN 1092-1', dn: r[0], D: r[1], K: r[2], L: r[3], n: r[4], filetage: r[5], pns: [] };
      g.pns.push(pn); grp.set(cle, g);
    }
    for (const cl of [150, 300]) for (const r of ASME[cl]) {
      grp.set(`AS|${cl}|${r[0]}`, { norme: 'ASME B16.5', nps: r[0], dn: r[1], D: r[2], K: r[3], L: r[4], n: r[5], filetage: r[6], classe: cl, pns: [] });
    }
    return [...grp.values()].map(g => ({ ...g, designation: g.norme === 'EN 1092-1' ? `DN ${g.dn} PN ${g.pns.join(' / ')}` : `NPS ${g.nps}" (DN ${g.dn}) classe ${g.classe}` }));
  }

  // Reconnaissance : n trous + une mesure. Modes : « voisins » (centre à centre de deux trous voisins),
  // « opposes » (centre à centre de deux trous diamétralement opposés), « bord » (bord à bord intérieur de deux trous voisins).
  function reconnaitre(p) {
    const n = Math.round(nb(p.n));
    exiger(n >= 3 && n <= 64, 'Nombre de trous : entre 3 et 64.');
    const m = nb(p.mesure), dTrou = nb(p.dTrou), D = nb(p.D);
    exiger(m > 0, 'Saisir la mesure entre les trous.');
    let K;
    if (p.mode === 'opposes') { exiger(n % 2 === 0, 'Trous opposés : seulement avec un nombre de trous pair.'); K = m; }
    else {
      let c = m;
      if (p.mode === 'bord') { exiger(dTrou > 0, 'Mesure bord à bord : saisir aussi le Ø des trous.'); c = m + dTrou; }
      K = c / Math.sin(Math.PI / n);
    }
    // Écart pondéré : perçage (prioritaire), Ø des trous et Ø extérieur s'ils sont saisis
    const cands = catalogue().filter(b => b.n === n).map(b => {
      const eK = Math.abs(b.K - K) / b.K;
      const eL = dTrou > 0 ? Math.abs(b.L - dTrou) / b.L : 0;
      const eD = D > 0 ? Math.abs(b.D - D) / b.D : 0;
      return { ...b, ecartK: b.K - K, score: eK + 0.35 * eL + 0.5 * eD };
    }).sort((a, b) => a.score - b.score).slice(0, 6);
    const meilleur = cands[0];
    const certitude = !meilleur ? 'aucune' : meilleur.score < 0.012 && (!cands[1] || cands[1].score > 2 * meilleur.score + 0.01) ? 'forte' : meilleur.score < 0.03 ? 'moyenne' : 'faible';
    return { K, entraxeVoisins: K * Math.sin(Math.PI / n), candidats: cands, certitude, dessin: meilleur ? dessinBride(meilleur, K) : null };
  }

  function dessinBride(b, Kmesure) {
    const d = Dessin.creer();
    d.cercle(0, 0, b.D / 2, 'DECOUPE', 144);
    d.cercle(0, 0, b.K / 2, 'AXES', 144);
    d.cercle(0, 0, b.K / 2 - 1.1 * b.L, 'TRACAGE', 96); // portée de joint (indicative)
    for (let i = 0; i < b.n; i++) {
      const a = Math.PI / b.n + 2 * Math.PI * i / b.n;
      d.trou(b.K / 2 * Math.cos(a), b.K / 2 * Math.sin(a), b.L / 2);
    }
    const h = Math.max(4, b.D / 40);
    d.ligne([-b.D / 2 - 10, 0], [b.D / 2 + 10, 0], 'AXES'); d.ligne([0, -b.D / 2 - 10], [0, b.D / 2 + 10], 'AXES');
    const a0 = Math.PI / b.n, a1 = a0 + 2 * Math.PI / b.n;
    d.cote([b.K / 2 * Math.cos(a0), b.K / 2 * Math.sin(a0)], [b.K / 2 * Math.cos(a1), b.K / 2 * Math.sin(a1)], h * 2.5, `entraxe ${fmt(b.K * Math.sin(Math.PI / b.n))}`, h);
    d.cote([-b.K / 2, -b.D / 2 - 4 * h], [b.K / 2, -b.D / 2 - 4 * h], 0, `K ${fmt(b.K)}${Kmesure ? ` (mesuré ${fmt(Kmesure)})` : ''}`, h);
    d.cote([-b.D / 2, -b.D / 2 - 8 * h], [b.D / 2, -b.D / 2 - 8 * h], 0, `D ${fmt(b.D)}`, h);
    d.texte(0, b.D / 2 + 3 * h, h * 1.2, `${b.designation} - ${b.n} trous Ø${fmt(b.L)} - ${b.filetage}`, 'TEXTE', 'c');
    return d;
  }

  // ---------------------------------------------------------------- Boulonnerie
  // Pas, hauteur d'écrou ISO 4032, épaisseur de rondelle ISO 7089
  const VIS = { M10: [1.5, 8.4, 2], M12: [1.75, 10.8, 2.5], M16: [2, 14.8, 3], M20: [2.5, 18, 3], M24: [3, 21.5, 4], M27: [3, 23.8, 4], M30: [3.5, 25.6, 4], M33: [3.5, 28.7, 5], M36: [4, 31, 5], M39: [4, 33.4, 6], M45: [4.5, 36, 8] };
  const LONGUEURS_VIS = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 220, 240, 260, 280, 300, 320, 340, 360, 380, 400];
  // Vannes papillon à insérer / à oreilles : EN 558 série 20 (face à face)
  const PAPILLON = { 25: 33, 32: 33, 40: 33, 50: 43, 65: 46, 80: 46, 100: 52, 125: 56, 150: 56, 200: 60, 250: 68, 300: 78, 350: 78, 400: 102, 450: 114, 500: 127, 600: 154 };
  const MONTAGES = {
    'bride-bride': 'Bride / bride (joint entre deux brides)',
    'bride-filtre': 'Bride / filtre à brides',
    'papillon-wafer': 'Bride / vanne papillon à insérer / bride (tiges traversantes)',
    'papillon-taraude': 'Bride / vanne papillon taraudée (à oreilles)',
  };
  const arrondi5 = v => Math.ceil(v / 5 - 1e-9) * 5;
  const visNormale = v => LONGUEURS_VIS.find(l => l >= v - 1e-9) || arrondi5(v);

  // p : { dn, pn, montage, fixation: 'tige' | 'vis', joint, rondelles, epaisseur (bride), epaisseur2 (bride du filtre), faceAFace, engagement }
  function boulonnerie(p) {
    const b = bride(p.dn, p.pn);
    exiger(b, `Bride DN ${p.dn} PN ${p.pn} absente de la table EN 1092-1.`);
    const vis = VIS[b.filetage];
    const [P, m, s] = vis;
    const d = +b.filetage.slice(1);
    const t = nb(p.epaisseur) > 0 ? nb(p.epaisseur) : b.epaisseur;
    const j = nb(p.joint) >= 0 ? nb(p.joint) : 2;
    const rond = p.rondelles ? s : 0;
    const depasse = 2 * P; // dépassement : 2 filets au-delà de l'écrou
    const montage = MONTAGES[p.montage] ? p.montage : 'bride-bride';
    const avert = [];
    let serrage, nbre = b.n, longueurCalc, longueur, desig, detail;
    if (montage === 'papillon-taraude') {
      const F = nb(p.faceAFace) > 0 ? nb(p.faceAFace) : PAPILLON[b.dn];
      exiger(F, `Pas de longueur face à face EN 558 pour le DN ${b.dn} : la saisir.`);
      const jv = nb(p.joint) >= 0 && p.jointVanne ? j : 0;
      const e = nb(p.engagement) > 0 ? nb(p.engagement) : d;
      if (e > F / 2 - 1) avert.push(`Engagement de ${fmt(e, 0)} mm trop long : les vis des deux côtés se toucheraient (maxi ${fmt(F / 2 - 1, 0)} mm).`);
      if (e < 0.8 * d) avert.push(`Engagement inférieur à 0,8 × d (${fmt(0.8 * d, 0)} mm) : filetage insuffisant.`);
      serrage = t + jv + rond;
      longueurCalc = serrage + e;
      longueur = visNormale(longueurCalc);
      nbre = 2 * b.n;
      desig = `${nbre} vis H ${b.filetage} × ${longueur} (ISO 4017)`;
      detail = `bride ${fmt(t, 0)}${jv ? ` + joint ${fmt(jv)}` : ''}${rond ? ` + rondelle ${fmt(rond)}` : ''} + engagement dans l'oreille ${fmt(e, 0)} (face à face ${fmt(F, 0)})`;
    } else {
      let parts;
      if (montage === 'papillon-wafer') {
        const F = nb(p.faceAFace) > 0 ? nb(p.faceAFace) : PAPILLON[b.dn];
        exiger(F, `Pas de longueur face à face EN 558 pour le DN ${b.dn} : la saisir.`);
        const jv = p.jointVanne ? 2 * j : 0;
        serrage = 2 * t + F + jv;
        parts = `2 brides ${fmt(t, 0)} + vanne ${fmt(F, 0)}${jv ? ` + 2 joints ${fmt(j)}` : ''}`;
      } else if (montage === 'bride-filtre') {
        const t2 = nb(p.epaisseur2) > 0 ? nb(p.epaisseur2) : t;
        serrage = t + t2 + j;
        parts = `bride ${fmt(t, 0)} + bride du filtre ${fmt(t2, 0)} + joint ${fmt(j)}`;
      } else {
        serrage = 2 * t + j;
        parts = `2 brides ${fmt(t, 0)} + joint ${fmt(j)}`;
      }
      if (p.fixation === 'vis') {
        longueurCalc = serrage + 2 * rond + m + depasse;
        longueur = visNormale(longueurCalc);
        desig = `${nbre} vis H ${b.filetage} × ${longueur} + ${nbre} écrous`;
        detail = `${parts}${rond ? ` + 2 rondelles ${fmt(s)}` : ''} + écrou ${fmt(m)} + 2 filets ${fmt(depasse)}`;
      } else {
        longueurCalc = serrage + 2 * rond + 2 * (m + depasse);
        longueur = arrondi5(longueurCalc);
        desig = `${nbre} tiges ${b.filetage} × ${longueur} + ${2 * nbre} écrous`;
        detail = `${parts}${rond ? ` + 2 rondelles ${fmt(s)}` : ''} + 2 écrous ${fmt(m)} + 2 × 2 filets ${fmt(depasse)}`;
      }
      if (montage === 'papillon-wafer' && b.dn >= 300) avert.push('Grandes vannes à insérer : vérifier que le corps porte des oreilles de centrage ; longues tiges, serrer en croix.');
    }
    return { bride: b, montage, serrage, longueurCalc, longueur, nombre: nbre, rondelles: p.rondelles ? (montage === 'papillon-taraude' ? nbre : 2 * nbre) : 0, ecrous: montage === 'papillon-taraude' ? 0 : (p.fixation === 'vis' ? nbre : 2 * nbre), designation: desig, detail, avertissements: avert, filetage: b.filetage };
  }

  // Abaque : pour chaque DN, la boulonnerie de chaque PN
  function abaque(p) {
    return DNS.map(dn => ({
      dn,
      pns: PNS.map(pn => {
        try {
          if (p.montage && p.montage.startsWith('papillon') && !PAPILLON[dn]) return null;
          const r = boulonnerie({ ...p, dn, pn, epaisseur: null, epaisseur2: null, faceAFace: null });
          return { pn, n: r.nombre, filetage: r.filetage, longueur: r.longueur, texte: `${r.nombre} × ${r.filetage} × ${r.longueur}` };
        } catch { return null; }
      }),
    }));
  }

  return { EN, ASME, PNS, DNS, PAPILLON, MONTAGES, VIS, bride, catalogue, reconnaitre, boulonnerie, abaque, dessinBride, ErreurSaisie };
}));
