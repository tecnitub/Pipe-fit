// Tuyauteur : tables de tubes et de coudes.
// Diamètres extérieurs : ISO 4200 / EN 10220 série 1 (tubes acier soudés et sans soudure),
// identiques à ISO 1127 pour l'inox. Rayons de coudes : EN 10253-2 / ISO 3419 (types 2D, 3D, 5D).
// Les épaisseurs sont des valeurs usuelles indicatives ; la saisie reste libre.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Normes = fabrique();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // [DN, Ø extérieur, épaisseurs usuelles, rayon 2D, rayon 3D]
  const TABLE = [
    [10, 17.2, [1.6, 1.8, 2.0, 2.3], null, null],
    [15, 21.3, [1.6, 2.0, 2.3, 2.6, 3.2], null, 28],
    [20, 26.9, [1.6, 2.0, 2.3, 2.6, 3.2], null, 29],
    [25, 33.7, [2.0, 2.6, 3.2, 4.0], 25, 38],
    [32, 42.4, [2.0, 2.6, 3.2, 4.0], 32, 48],
    [40, 48.3, [2.0, 2.6, 3.2, 4.0], 38, 57],
    [50, 60.3, [2.0, 2.9, 3.6, 4.0, 5.0], 51, 76],
    [65, 76.1, [2.0, 2.9, 3.6, 5.0], 64, 95],
    [80, 88.9, [2.0, 3.2, 4.0, 5.6], 76, 114],
    [100, 114.3, [2.0, 3.6, 4.0, 6.3], 102, 152],
    [125, 139.7, [2.0, 4.0, 5.0, 6.3], 127, 190],
    [150, 168.3, [2.0, 4.5, 5.6, 7.1], 152, 229],
    [200, 219.1, [2.6, 5.9, 6.3, 8.0], 203, 305],
    [250, 273.0, [2.9, 6.3, 7.1, 8.8], 254, 381],
    [300, 323.9, [2.9, 7.1, 8.0, 10.0], 305, 457],
    [350, 355.6, [3.2, 8.0, 8.8, 11.0], 356, 533],
    [400, 406.4, [3.2, 8.8, 10.0, 12.5], 406, 610],
    [450, 457.0, [4.0, 10.0, 12.5], 457, 686],
    [500, 508.0, [4.0, 11.0, 12.5], 508, 762],
    [600, 610.0, [5.0, 12.5, 14.2], 610, 914],
    [700, 711.0, [6.3, 12.5, 14.2], 711, 1067],
    [800, 813.0, [6.3, 12.5, 16.0], 813, 1219],
    [900, 914.0, [7.1, 12.5, 16.0], 914, 1372],
    [1000, 1016.0, [8.0, 12.5, 16.0], 1016, 1524],
  ];
  const TUBES = TABLE.map(([dn, de, ep, r2, r3]) => ({ dn, de, epaisseurs: ep, r2D: r2, r3D: r3, r5D: Math.round(2.5 * de) }));
  const TYPES_COUDES = [
    ['3D', 'Coude 3D (grand rayon, R ≈ 1,5 × DN)'],
    ['2D', 'Coude 2D (petit rayon, R ≈ 1 × DN)'],
    ['5D', 'Coude 5D (R ≈ 2,5 × Ø ext.)'],
    ['libre', 'Rayon libre'],
  ];
  const tube = dn => TUBES.find(t => t.dn === +dn) || null;
  // Rayon de cintrage normalisé pour un DN et un type ; null si le coude n'existe pas dans la norme
  function rayonCoude(dn, type) {
    const t = tube(dn);
    if (!t) return null;
    return { '2D': t.r2D, '3D': t.r3D, '5D': t.r5D }[type] ?? null;
  }
  // DN le plus proche d'un diamètre extérieur saisi (pour retrouver le rayon de coude)
  function dnDepuisDiametre(de) {
    let meilleur = null;
    for (const t of TUBES) if (!meilleur || Math.abs(t.de - de) < Math.abs(meilleur.de - de)) meilleur = t;
    return meilleur && Math.abs(meilleur.de - de) <= 0.02 * de ? meilleur.dn : null;
  }
  return { TUBES, TYPES_COUDES, tube, rayonCoude, dnDepuisDiametre, MASSE_VOLUMIQUE: { acier: 7.85, inox: 7.95, aluminium: 2.70 } };
}));
