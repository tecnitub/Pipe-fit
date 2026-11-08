// Tuyauteur : dilatation thermique d'une ligne entre deux points fixes, lyre de dilatation en U et bras de dilatation.
// Méthode simplifiée du bras guidé (« guided cantilever ») : un bras de longueur L qui encaisse un déplacement Δ
// travaille à σ = 3·E·D·Δ / L², d'où L = √(3·E·D·Δ / σadm).
// Lyre en U : L est la longueur développée de la lyre, L = 2H + W ; avec W = H/2 → H = 2L/5 ; avec W = H → H = L/3.
// Pré-dimensionnement d'atelier : une ligne critique (haute température, gros DN, appareils fragiles) se vérifie
// par une note de calcul de flexibilité (EN 13480-3, CODETI, ASME B31.3).
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./dessin.js'));
  else racine.Dilatation = fabrique(racine.Dessin);
}(typeof self !== 'undefined' ? self : this, function (Dessin) {
  'use strict';
  const exiger = (c, m) => { if (!c) throw new Dessin.ErreurSaisie(m); };
  const nb = v => (v === '' || v == null || !isFinite(+v)) ? NaN : +v;
  const fmt = (v, d = 1) => (+v).toFixed(d).replace('.', ',');
  const arr = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
  const arrondi = (v, pas = 50) => Math.ceil(v / pas - 1e-9) * pas;

  // [nom, α moyen (10⁻⁶ /K, de 20 à ~200 °C), E (MPa), contrainte admissible de flexion conseillée (MPa)]
  const MATIERES = {
    acier: ['Acier carbone', 12.0, 200000, 150],
    inox: ['Inox austénitique', 16.5, 195000, 150],
    cuivre: ['Cuivre', 17.0, 115000, 60],
    alu: ['Aluminium', 23.0, 70000, 50],
  };

  // p : { de, ep, rayon (coudes de la lyre), matiere, alpha?, E?, sigma?, longueur (m), tPose, tMax, tMin?,
  //       largeur ('demi' = H/2 | 'egale' = H | valeur mm), prechauffage? }
  function calculer(p) {
    const m = MATIERES[p.matiere] || MATIERES.acier;
    const de = nb(p.de), ep = nb(p.ep), R = nb(p.rayon) > 0 ? nb(p.rayon) : 1.5 * de;
    exiger(de > 0 && ep > 0 && 2 * ep < de, 'Tube : Ø extérieur et épaisseur à saisir.');
    const L = nb(p.longueur);
    exiger(L > 0, 'Longueur entre points fixes : saisir une valeur positive (en mètres).');
    const alpha = (nb(p.alpha) > 0 ? nb(p.alpha) : m[1]) * 1e-6;
    const E = nb(p.E) > 0 ? nb(p.E) : m[2];
    const sigma = nb(p.sigma) > 0 ? nb(p.sigma) : m[3];
    const tPose = isFinite(nb(p.tPose)) ? nb(p.tPose) : 10;
    const tMax = nb(p.tMax);
    exiger(isFinite(tMax), 'Température maximale de service : à saisir.');
    const tMin = isFinite(nb(p.tMin)) ? nb(p.tMin) : tPose;
    exiger(tMax > tMin, 'La température maxi doit être supérieure à la température mini.');
    const avert = [];
    // Dilatations (mm) : allongement à chaud, raccourcissement à froid, course totale
    const dChaud = alpha * L * 1000 * Math.max(0, tMax - tPose);
    const dFroid = alpha * L * 1000 * Math.max(0, tPose - tMin);
    const course = alpha * L * 1000 * (tMax - tMin);
    // Effort si la ligne était bloquée entre deux points fixes : F = E·A·α·ΔT
    const A = Math.PI * (de - ep) * ep; // mm²
    const effort = E * A * alpha * (tMax - tMin) / 1000; // kN
    // Bras de dilatation (changement de direction en L) : la branche perpendiculaire absorbe la course
    const bras = Math.sqrt(3 * E * de * course / sigma);
    // Lyre en U au milieu de la ligne : longueur développée L = 2H + W
    const egale = p.largeur === 'egale';
    const H = Math.max(bras * (egale ? 1 / 3 : 2 / 5), 2 * R + 2 * de);
    const Hr = arrondi(H);
    const W = Math.max(arrondi(egale ? Hr : Hr / 2, 10), 2 * R + 2 * de);
    // Débit de la lyre : 4 coudes 90° ; jambes et traverse droites entre coudes (cotes axe à axe H et W)
    const jambe = Hr - 2 * R, traverse = W - 2 * R;
    exiger(jambe > 0 && traverse > 0, 'Coudes trop grands pour cette lyre : choisir un rayon plus petit ou une lyre plus grande.');
    const developpe = 2 * jambe + traverse + 4 * (Math.PI / 2) * R;
    const pretension = course / 2;
    // Guides : 1er à 4·D de la lyre, 2e à 14·D (règle de bonne pratique), puis espacement courant
    const g1 = 4 * de, g2 = 14 * de;
    if (course > 200) avert.push(`Course de ${fmt(course, 0)} mm : prévoir plusieurs lyres ou réduire la distance entre points fixes.`);
    if (tMax > 250) avert.push('Température élevée : vérifier α, E et la contrainte admissible à chaud, et faire une note de calcul de flexibilité.');
    if (Hr > 6000) avert.push('Lyre très haute : diviser la ligne avec un point fixe intermédiaire et deux lyres.');

    // ---- Schéma de la ligne (vue de dessus) : points fixes aux extrémités, lyre au milieu
    const d = Dessin.creer();
    // Longueurs droites raccourcies (vue schématique) : la vraie longueur est écrite sur la cote
    const Lmm = Math.min(L * 1000, Math.max(6 * W, 2 * (g2 + W), 3 * Hr));
    const x0 = 0, x1 = Lmm, xm = Lmm / 2;
    const h = Math.max(Lmm, Hr * 2) / 45;
    const axe = [[x0, 0], [xm - W / 2, 0], [xm - W / 2, Hr], [xm + W / 2, Hr], [xm + W / 2, 0], [x1, 0]];
    d.polyligne(axe, 'DECOUPE');
    const pf = x => { d.polyligne([[x - h, -h], [x + h, h]], 'PLIAGE'); d.polyligne([[x - h, h], [x + h, -h]], 'PLIAGE'); d.ligne([x - 1.4 * h, -1.4 * h], [x + 1.4 * h, -1.4 * h], 'PLIAGE'); };
    pf(x0); pf(x1);
    d.texte(x0, -3.4 * h, h * 1.1, 'point fixe', 'TEXTE', 'c'); d.texte(x1, -3.4 * h, h * 1.1, 'point fixe', 'TEXTE', 'c');
    for (const x of [xm - W / 2 - g1, xm - W / 2 - g2, xm + W / 2 + g1, xm + W / 2 + g2]) {
      if (x > x0 + h && x < x1 - h) { d.ligne([x, -h * 0.9], [x, h * 0.9], 'COTES'); d.ligne([x - h * 0.5, -h * 0.9], [x + h * 0.5, -h * 0.9], 'COTES'); }
    }
    d.texte(xm - W / 2 - g2, h * 1.4, h * 0.9, 'guides', 'COTES', 'c');
    // Flèches de dilatation vers la lyre
    for (const [xa, s] of [[x0 + Lmm * 0.18, 1], [x1 - Lmm * 0.18, -1]]) {
      d.polyligne([[xa, h * 2.2], [xa + s * h * 4, h * 2.2]], 'COTES');
      d.polyligne([[xa + s * h * 3, h * 2.9], [xa + s * h * 4, h * 2.2], [xa + s * h * 3, h * 1.5]], 'COTES');
    }
    d.texte(x0 + Lmm * 0.18, h * 3.4, h, `${fmt(course / 2)} mm`, 'COTES', 'g');
    d.cote([x0, 0], [x1, 0], -6 * h, `${fmt(L, 2)} m entre points fixes${Lmm < L * 1000 ? ' (longueurs droites raccourcies)' : ''}`, h);
    d.cote([xm + W / 2, 0], [xm + W / 2, Hr], -2.5 * h, `H ${fmt(Hr, 0)}`, h);
    d.cote([xm - W / 2, Hr], [xm + W / 2, Hr], 2 * h, `W ${fmt(W, 0)}`, h);

    // ---- Lyre seule, à l'échelle, avec les coudes et les longueurs de tube à couper
    const ly = Dessin.creer();
    const arc = (cx, cy, a0, a1) => Array.from({ length: 13 }, (_, i) => { const a = (a0 + (a1 - a0) * i / 12) * Math.PI / 180; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
    const xa = -W / 2, xb = W / 2, l0 = Math.max(2 * R, 300);
    const ptsAxe = [[xa - R - l0, 0], ...arc(xa - R, R, -90, 0), ...arc(xa + R, Hr - R, 180, 90), ...arc(xb - R, Hr - R, 90, 0), ...arc(xb + R, R, 180, 270), [xb + R + l0, 0]];
    // Parois de part et d'autre de l'axe
    const off = (pts, k) => pts.map((q, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
      return [q[0] - ty / l * k, q[1] + tx / l * k];
    });
    ly.polyligne(off(ptsAxe, de / 2), 'DECOUPE'); ly.polyligne(off(ptsAxe, -de / 2), 'DECOUPE'); ly.polyligne(ptsAxe, 'AXES');
    const hl = Math.max(8, Hr / 30);
    ly.cote([xa, 0], [xa, Hr], 3 * hl, `H ${fmt(Hr, 0)} (axe à axe)`, hl);
    ly.cote([xa, Hr], [xb, Hr], 2.5 * hl, `W ${fmt(W, 0)}`, hl);
    ly.texte(xb + de, Hr / 2, hl, `jambe droite ${fmt(jambe, 0)}`, 'COTES');
    ly.texte(0, Hr - de - 1.6 * hl, hl, `traverse droite ${fmt(traverse, 0)}`, 'COTES', 'c');
    ly.texte(0, -de - 2.5 * hl, hl, `4 coudes 90° R ${fmt(R, 0)} - prétension au montage : écarter de ${fmt(pretension)} mm`, 'TEXTE', 'c');

    return {
      matiere: m[0], alpha: arr(alpha * 1e6, 2), E, sigma, avertissements: avert,
      resultats: {
        dChaud: arr(dChaud), dFroid: arr(dFroid), course: arr(course), parMetre: arr(alpha * 1000 * (tMax - tMin), 3),
        effort: arr(effort, 1), bras: arrondi(bras), brasCalcule: arr(bras, 0), H: Hr, Hcalcule: arr(H, 0), W,
        jambe: arr(jambe, 0), traverse: arr(traverse, 0), developpe: arr(developpe, 0), pretension: arr(pretension),
        guide1: arr(g1, 0), guide2: arr(g2, 0), coudes: 4,
      },
      dessins: { ligne: d, lyre: ly },
    };
  }

  return { MATIERES, calculer };
}));
