// Tuyauteur : calculateur de poids (masses) des tubes, tôles, profilés et barres.
//   piece()  masse d'une ligne (masse linéique ou surfacique, masse unitaire, masse totale)
//   liste()  total d'une liste de pièces, par matière
// Masses des poutrelles IPE, HEA, HEB et UPN : valeurs des tables (EN 10365), acier 7,85.
// Cornières, tubes carrés / rectangulaires : section calculée avec les rayons d'angle normalisés
// (EN 10056-1, EN 10219-2). Les autres matières sont obtenues au prorata de la masse volumique.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./dessin.js'));
  else racine.Poids = fabrique(racine.Dessin);
}(typeof self !== 'undefined' ? self : this, function (Dessin) {
  'use strict';
  const exiger = (c, m) => { if (!c) throw new Dessin.ErreurSaisie(m); };
  const nb = v => (v === '' || v == null || !isFinite(+v)) ? NaN : +v;
  const pos = (v, nom) => { const x = nb(v); exiger(x > 0, `${nom} : saisir une valeur positive.`); return x; };
  const fmt = (v, d = 1) => (+v).toFixed(d).replace('.', ',').replace(/,0+$/, '');
  const arr = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

  // Masses volumiques (kg/dm³ = t/m³)
  const MATIERES = {
    acier: ['Acier', 7.85], inox: ['Inox austénitique', 7.93], alu: ['Aluminium', 2.70], cuivre: ['Cuivre', 8.96],
    laiton: ['Laiton', 8.50], fonte: ['Fonte', 7.20], galva: ['Acier galvanisé', 7.85],
  };
  // Poutrelles et UPN : kg/m (acier)
  const POUTRELLES = {
    IPE: { 80: 6.0, 100: 8.1, 120: 10.4, 140: 12.9, 160: 15.8, 180: 18.8, 200: 22.4, 220: 26.2, 240: 30.7, 270: 36.1, 300: 42.2, 330: 49.1, 360: 57.1, 400: 66.3, 450: 77.6, 500: 90.7, 550: 106, 600: 122 },
    HEA: { 100: 16.7, 120: 19.9, 140: 24.7, 160: 30.4, 180: 35.5, 200: 42.3, 220: 50.5, 240: 60.3, 260: 68.2, 280: 76.4, 300: 88.3, 320: 97.6, 340: 105, 360: 112, 400: 125, 450: 140, 500: 155, 600: 178 },
    HEB: { 100: 20.4, 120: 26.7, 140: 33.7, 160: 42.6, 180: 51.2, 200: 61.3, 220: 71.5, 240: 83.2, 260: 93.0, 280: 103, 300: 117, 320: 127, 340: 134, 360: 142, 400: 155, 450: 171, 500: 187, 600: 212 },
    UPN: { 80: 8.64, 100: 10.6, 120: 13.4, 140: 16.0, 160: 18.8, 180: 22.0, 200: 25.3, 220: 29.4, 240: 33.2, 260: 37.9, 280: 41.8, 300: 46.2 },
  };
  // Cornières à ailes égales courantes [aile, épaisseur, rayon de congé r1]
  const CORNIERES = [[20, 3, 3.5], [25, 3, 3.5], [30, 3, 5], [35, 4, 5], [40, 4, 6], [40, 5, 6], [45, 5, 7], [50, 5, 7], [50, 6, 7], [60, 6, 8], [70, 7, 9], [80, 8, 10], [90, 9, 11], [100, 10, 12], [120, 12, 13], [150, 15, 16]];
  const congeCorniere = a => (CORNIERES.find(c => c[0] >= a) || CORNIERES[CORNIERES.length - 1])[2];

  // Section (mm²) d'une forme
  const sections = {
    tube: (De, e) => { exiger(2 * e < De, 'Épaisseur trop forte pour ce diamètre.'); return Math.PI * (De - e) * e; },
    rond: d => Math.PI * d * d / 4,
    carre: a => a * a,
    plat: (b, e) => b * e,
    // Tube carré ou rectangulaire EN 10219 : rayon extérieur 2t (t ≤ 6), 2,5t (t ≤ 10), 3t au-delà
    tubeRect: (H, B, t) => {
      exiger(2 * t < Math.min(H, B), 'Épaisseur trop forte pour ce tube.');
      const ro = t <= 6 ? 2 * t : t <= 10 ? 2.5 * t : 3 * t, ri = Math.max(0, ro - t);
      return 2 * t * (H + B - 2 * t) - (4 - Math.PI) * (ro * ro - ri * ri);
    },
    // Cornière EN 10056-1 : t(2a − t) + (1 − π/4)(r1² − 2 r2²), r2 = r1 / 2 (ailes inégales : a + b)
    corniere: (a, b, t) => {
      exiger(t < Math.min(a, b), 'Épaisseur trop forte pour cette cornière.');
      const r1 = congeCorniere(Math.max(a, b)), r2 = r1 / 2;
      return t * (a + b - t) + (1 - Math.PI / 4) * (r1 * r1 - 2 * r2 * r2);
    },
  };

  // p : { type, matiere, quantite, longueur (mm) | L, l (tôle), dimensions selon le type, contenu, isolant… }
  function piece(p) {
    const mat = MATIERES[p.matiere] || MATIERES.acier;
    const rho = mat[1];
    const q = Math.max(1, Math.round(nb(p.quantite) || 1));
    const type = p.type || 'tube';
    let kgm = null, kgm2 = null, unitaire, designation, detail = '', service = null;
    const L = () => pos(p.longueur, 'Longueur');
    if (type === 'tole' || type === 'disque' || type === 'virole') {
      const e = pos(p.epaisseur, 'Épaisseur');
      kgm2 = e * rho; // kg/m² pour e en mm
      let aire;
      if (type === 'tole') { const a = pos(p.L, 'Longueur'), b = pos(p.l, 'Largeur'); aire = a * b; designation = `Tôle ${fmt(a)} × ${fmt(b)} × ${fmt(e)}`; }
      else if (type === 'disque') {
        const D = pos(p.D, 'Ø'), di = Math.max(0, nb(p.dInt) || 0);
        exiger(di < D, 'Le trou central doit être plus petit que le disque.');
        aire = Math.PI * (D * D - di * di) / 4; designation = `Disque Ø${fmt(D)}${di ? ` percé Ø${fmt(di)}` : ''} ép. ${fmt(e)}`;
      } else {
        const D = pos(p.D, 'Ø extérieur'), h = pos(p.hauteur, 'Hauteur');
        exiger(2 * e < D, 'Épaisseur trop forte pour ce diamètre.');
        aire = Math.PI * (D - e) * h; designation = `Virole Ø${fmt(D)} × ${fmt(e)} hauteur ${fmt(h)}`;
        detail = `développé ${fmt(Math.PI * (D - e), 0)} mm (fibre neutre)`;
      }
      unitaire = aire / 1e6 * kgm2;
    } else {
      let A;
      if (type === 'tube') {
        const De = pos(p.de, 'Ø extérieur'), e = pos(p.ep, 'Épaisseur');
        A = sections.tube(De, e);
        designation = `Tube Ø${fmt(De)} × ${fmt(e)}`;
        // Masse en service : contenu (eau ou densité saisie) et calorifuge
        const di = De - 2 * e;
        const dens = p.contenu === 'eau' ? 1 : p.contenu === 'autre' ? Math.max(0, nb(p.densite) || 0) : 0;
        const ei = Math.max(0, nb(p.isolant) || 0), rhoI = nb(p.rhoIsolant) > 0 ? nb(p.rhoIsolant) : 100;
        const kgContenu = Math.PI * di * di / 4 / 1e6 * dens * 1000;
        const kgIsolant = ei ? Math.PI * ((De + 2 * ei) ** 2 - De * De) / 4 / 1e6 * rhoI : 0;
        if (kgContenu || kgIsolant) service = { contenu: arr(kgContenu, 2), isolant: arr(kgIsolant, 2) };
      } else if (type === 'tubeRect') {
        const H = pos(p.H, 'Hauteur'), B = pos(p.B, 'Largeur'), t = pos(p.ep, 'Épaisseur');
        A = sections.tubeRect(H, B, t);
        designation = H === B ? `Tube carré ${fmt(H)} × ${fmt(H)} × ${fmt(t)}` : `Tube rectangulaire ${fmt(H)} × ${fmt(B)} × ${fmt(t)}`;
      } else if (type === 'corniere') {
        const a = pos(p.H, 'Aile'), b = nb(p.B) > 0 ? nb(p.B) : a, t = pos(p.ep, 'Épaisseur');
        A = sections.corniere(a, b, t);
        designation = `Cornière ${fmt(a)} × ${fmt(b)} × ${fmt(t)}`;
      } else if (type === 'plat') {
        const b = pos(p.H, 'Largeur'), t = pos(p.ep, 'Épaisseur');
        A = sections.plat(b, t); designation = `Fer plat ${fmt(b)} × ${fmt(t)}`;
      } else if (type === 'rond') {
        const d = pos(p.de, 'Ø'); A = sections.rond(d); designation = `Rond plein Ø${fmt(d)}`;
      } else if (type === 'carre') {
        const a = pos(p.H, 'Côté'); A = sections.carre(a); designation = `Carré plein ${fmt(a)}`;
      } else if (POUTRELLES[type]) {
        const kg = POUTRELLES[type][p.taille];
        exiger(kg, `${type} ${p.taille || ''} : taille absente de la table.`);
        A = kg / 7.85 * 1000; // section équivalente (mm²)
        designation = `${type} ${p.taille}`;
      } else exiger(false, 'Type de pièce inconnu.');
      kgm = A / 1e6 * rho * 1000; // kg/m
      unitaire = kgm * L() / 1000;
      designation += ` - L ${fmt(L(), 0)}`;
      if (service) service.total = arr(kgm + service.contenu + service.isolant, 2);
    }
    return {
      designation, matiere: mat[0], quantite: q, kgm: kgm == null ? null : arr(kgm, 3), kgm2: kgm2 == null ? null : arr(kgm2, 2),
      unitaire: arr(unitaire, 2), total: arr(unitaire * q, 2), service, detail,
    };
  }

  // Total d'une liste de pièces, avec un sous-total par matière
  function liste(lignes) {
    const parMatiere = {};
    let total = 0;
    for (const l of lignes) { total += l.total; parMatiere[l.matiere] = (parMatiere[l.matiere] || 0) + l.total; }
    return { total: arr(total, 2), parMatiere: Object.entries(parMatiere).map(([m, kg]) => ({ matiere: m, kg: arr(kg, 2) })) };
  }

  return { MATIERES, POUTRELLES, CORNIERES, sections, piece, liste };
}));
