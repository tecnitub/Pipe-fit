// Tuyauteur : calculs de tuyauterie industrielle et de chaudronnerie.
//   piquage()      traçage d'un piquage (perpendiculaire, oblique, excentré) : gabarit de coupe et gabarit du trou
//   baionnette()   baïonnette (renvoi parallèle à deux coudes), orientée dans l'espace, par l'angle ou par la distance
//   renvoi3D()     ligne de tuyauterie par points (isométrique) : angles de coudes, rotations, longueurs de coupe
//   developpe()    développés de tôlerie par triangulation : rond-carré, trémie carré-carré, rond-rond (cône)
// Toutes les longueurs sont en millimètres, les angles en degrés. Chaque calcul renvoie ses résultats,
// ses avertissements et les dessins (aperçu, PDF, DXF) construits avec Dessin.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./dessin.js'));
  else racine.Geometrie = fabrique(racine.Dessin);
}(typeof self !== 'undefined' ? self : this, function (Dessin) {
  'use strict';
  const RAD = Math.PI / 180;
  const nb = v => (v === '' || v == null || !isFinite(+v)) ? NaN : +v;
  const arr = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
  const fmt = (v, d = 1) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('.', ',');
  class ErreurSaisie extends Error {}
  const exiger = (cond, msg) => { if (!cond) throw new ErreurSaisie(msg); };
  const positif = (v, nom) => { exiger(v > 0, `${nom} : saisir une valeur positive.`); return v; };

  // Vecteurs 3D
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norme = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => { const n = norme(a); return n < 1e-12 ? null : mul(a, 1 / n); };
  const dist = (a, b) => norme(sub(a, b));

  // ---------------------------------------------------------------- Piquage
  // Collecteur d'axe X (x² … y² + z² = R²), piquage arrivant par le dessus (z > 0), son axe dans le plan y = excentration,
  // incliné de « angle » sur l'axe du collecteur. Génératrice θ du piquage : 0° = latérale côté excentration,
  // 90° = côté angle obtus, 180° = latérale opposée, 270° = côté angle aigu.
  function piquage(p) {
    const D = positif(nb(p.D), 'Ø extérieur du collecteur');
    const eD = nb(p.eD) || 0, d = positif(nb(p.d), 'Ø extérieur du piquage'), ed = nb(p.ed) || 0;
    const alpha = nb(p.angle ?? 90), exc = nb(p.excentration) || 0;
    const N = Math.max(4, Math.round(nb(p.divisions) || 16));
    const type = p.type === 'penetrant' ? 'penetrant' : 'pose';
    exiger(alpha >= 15 && alpha <= 90, 'Angle du piquage : entre 15° et 90°.');
    exiger(eD >= 0 && eD < D / 2 && ed >= 0 && ed < d / 2, 'Épaisseur incompatible avec le diamètre.');
    const Re = D / 2, Ri = D / 2 - eD, re = d / 2, ri = d / 2 - ed;
    // Fibres de traçage : piquage posé = alésage du piquage sur l'extérieur du collecteur ;
    // pénétrant = extérieur du piquage arrêté sur l'intérieur du collecteur, trou au Ø extérieur du piquage.
    const coupe = type === 'pose' ? { r: ri, R: Re } : { r: re, R: Ri };
    const trou = { r: type === 'pose' ? ri : re, R: Re };
    for (const f of [coupe, trou]) {
      exiger(f.r + Math.abs(exc) <= f.R + 1e-9, `Le piquage (Ø ${fmt(2 * f.r)}${exc ? ` excentré de ${fmt(exc)}` : ''}) dépasse du collecteur (Ø ${fmt(2 * f.R)}) : réduire le diamètre ou l'excentration.`);
    }
    const a = alpha * RAD, sa = Math.sin(a), ca = Math.cos(a);
    // Position t (le long de l'axe du piquage, depuis l'axe du collecteur) de l'intersection sur la génératrice θ
    const tDe = (th, f) => {
      const y = exc + f.r * Math.cos(th);
      const z = Math.sqrt(Math.max(0, f.R * f.R - y * y));
      return (z - f.r * Math.sin(th) * ca) / sa;
    };
    const RES = 720;
    const thetas = Array.from({ length: RES + 1 }, (_, i) => 2 * Math.PI * i / RES);
    const tc = thetas.map(th => tDe(th, coupe));
    const tMin = Math.min(...tc), tMax = Math.max(...tc);
    const H = nb(p.hauteur);
    const avecH = H > 0;
    const avert = [];
    if (avecH) exiger(H - tMax >= 5, `Hauteur du piquage trop faible : au moins ${fmt(tMax + 5, 0)} mm depuis l'axe du collecteur.`);
    if (re + Math.abs(exc) > Re - 1e-9 && type === 'pose') avert.push('Piquage tangent au collecteur : vérifier l\'accostage sur les génératrices latérales.');
    if (alpha < 30) avert.push('Piquage très incliné : prévoir une préparation de soudure adaptée côté angle aigu.');

    // Gabarit de coupe (enroulé sur l'extérieur du piquage) : abscisse = arc sur Ø ext., ordonnée = hauteur au-dessus du point le plus bas
    const circ = Math.PI * d;
    const haut = avecH ? H - tMin : (tMax - tMin) + Math.max(50, 0.25 * d);
    const gab = Dessin.creer();
    const courbe = thetas.map((th, i) => [re * th, tc[i] - tMin]);
    gab.polyligne([...courbe, [circ, haut], [0, haut]], 'DECOUPE', true);
    const table = [];
    for (let i = 0; i <= N; i++) {
      const th = 2 * Math.PI * i / N, t = tDe(th, coupe), x = re * th, h = t - tMin;
      // Point du trou correspondant (même génératrice)
      const tt = tDe(th, trou), y = exc + trou.r * Math.cos(th);
      const X = tt * ca - trou.r * Math.sin(th) * sa, S = Re * Math.asin(Math.max(-1, Math.min(1, y / Re)));
      table.push({ n: i, angle: arr(360 * i / N, 2), abscisse: arr(x), hauteur: arr(h), longueur: avecH ? arr(H - t) : null, trouX: arr(X), trouS: arr(S) });
      if (i < N) {
        gab.ligne([x, h], [x, haut], 'TRACAGE');
        gab.texte(x + 1.5, haut - 8, 3.5, String(i), 'TEXTE');
        gab.texte(x + 1.5, h + 3, 2.5, fmt(h), 'TEXTE', 'g', 90);
      }
    }
    gab.texte(circ / 2, haut + 4, 4, `Gabarit piquage Ø${fmt(d)} sur Ø${fmt(D)} - ${fmt(alpha, 1)}°${exc ? ` - excentré ${fmt(exc)}` : ''} - à enrouler sur l'extérieur du piquage`, 'TEXTE', 'c');
    gab.cote([0, haut + 12], [circ, haut + 12], 4, `développé π × ${fmt(d)} = ${fmt(circ)}`);

    // Gabarit du trou (développé sur l'extérieur du collecteur) : X le long de l'axe, S = arc depuis la génératrice supérieure
    const tro = Dessin.creer();
    const ptsTrou = thetas.slice(0, RES).map(th => {
      const tt = tDe(th, trou), y = exc + trou.r * Math.cos(th);
      return [tt * ca - trou.r * Math.sin(th) * sa, Re * Math.asin(Math.max(-1, Math.min(1, y / Re)))];
    });
    tro.polyligne(ptsTrou, 'DECOUPE', true);
    const bt = Dessin.boite(tro);
    const mx = Math.max(20, 0.3 * bt.l), my = Math.max(20, 0.3 * bt.h);
    tro.ligne([bt.x0 - mx, 0], [bt.x1 + mx, 0], 'AXES');
    tro.ligne([0, bt.y0 - my], [0, bt.y1 + my], 'AXES');
    tro.texte(bt.x1 + mx + 2, -1.5, 3, 'génératrice supérieure du collecteur', 'TEXTE');
    tro.texte(1.5, bt.y1 + my - 4, 3, 'axe du piquage', 'TEXTE');
    tro.cote([bt.x0, bt.y0 - my * 0.6], [bt.x1, bt.y0 - my * 0.6], -4, `${fmt(bt.l)} le long du collecteur`);
    tro.cote([bt.x0 - mx * 0.6, bt.y0], [bt.x0 - mx * 0.6, bt.y1], 4, `${fmt(bt.h)} développé`);

    return {
      type, coupe, trou, table, avertissements: avert,
      resultats: {
        developpe: arr(circ), profondeur: arr(tMax - tMin), hauteurMin: arr(tMin), hauteurMax: arr(tMax),
        longueurMin: avecH ? arr(H - tMax) : null, longueurMax: avecH ? arr(H - tMin) : null,
        trouLongueur: arr(bt.l), trouLargeur: arr(bt.h),
        trouCorde: arr(2 * Re * Math.sin(bt.h / 2 / Re)),
      },
      dessins: { gabarit: gab, trou: tro },
    };
  }

  // ---------------------------------------------------------------- Axe de tuyauterie avec coudes
  // Points d'intersection (sommets) → échantillonnage de l'axe réel (droites + arcs de rayon R), en 3D
  function axeAvecCoudes(sommets, R, pas = 3) {
    const pts = [sommets[0]];
    for (let i = 1; i < sommets.length - 1; i++) {
      const P = sommets[i], din = unit(sub(P, sommets[i - 1])), dout = unit(sub(sommets[i + 1], P));
      const beta = Math.acos(Math.max(-1, Math.min(1, dot(din, dout))));
      if (beta < 1e-6) { pts.push(P); continue; }
      const E = R * Math.tan(beta / 2), T1 = sub(P, mul(din, E));
      // centre : depuis T1, perpendiculairement à din, dans le plan du coude, côté intérieur
      const nIn = unit(sub(dout, mul(din, dot(dout, din))));
      const Cc = add(T1, mul(nIn, R));
      const u1 = unit(sub(T1, Cc));
      const n = Math.max(4, Math.ceil(R * beta / pas));
      for (let k = 0; k <= n; k++) {
        const s = beta * k / n;
        pts.push(add(Cc, add(mul(u1, R * Math.cos(s)), mul(din, R * Math.sin(s)))));
      }
    }
    pts.push(sommets[sommets.length - 1]);
    return pts;
  }

  // Parois d'un tube (vue en plan, 2D) de part et d'autre d'un axe échantillonné
  function parois(axe2, de) {
    const g = [], dr = [];
    for (let i = 0; i < axe2.length; i++) {
      const a = axe2[Math.max(0, i - 1)], b = axe2[Math.min(axe2.length - 1, i + 1)];
      const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
      const nx = -ty / l * de / 2, ny = tx / l * de / 2;
      g.push([axe2[i][0] + nx, axe2[i][1] + ny]); dr.push([axe2[i][0] - nx, axe2[i][1] - ny]);
    }
    return [g, dr];
  }

  function coupeCoude(R, de, beta) {
    const b = beta * RAD;
    return { axe: arr(R * b), extrados: arr((R + de / 2) * b), intrados: arr(Math.max(0, R - de / 2) * b), reduction: arr(R * Math.tan(b / 2)) };
  }

  // ---------------------------------------------------------------- Baïonnette
  // Deux coudes identiques d'angle α décalent la ligne de V (vertical) et Hz (horizontal) en restant parallèle.
  // mode « angle » : α imposé → avance calculée ; « avance » : distance le long de la ligne imposée → α calculé ;
  // « longueur » : entraxe des coudes (longueur inclinée entre sommets) imposé → α calculé.
  function baionnette(p) {
    const de = positif(nb(p.de), 'Ø extérieur'), R = positif(nb(p.rayon), 'Rayon de coude');
    const V = nb(p.decalageV) || 0, Hz = nb(p.decalageH) || 0, jeu = nb(p.jeu) || 0;
    const Dv = Math.hypot(V, Hz);
    exiger(Dv > 0, 'Saisir au moins un décalage (vertical ou horizontal).');
    exiger(R >= de / 2, 'Le rayon de coude doit être au moins égal au rayon du tube.');
    let alpha;
    if (p.mode === 'avance') {
      const A = positif(nb(p.avance), 'Distance (avance)');
      alpha = Math.atan2(Dv, A) / RAD;
    } else if (p.mode === 'longueur') {
      const T = positif(nb(p.longueur), 'Entraxe des coudes');
      exiger(T >= Dv, `L'entraxe des coudes doit être au moins égal au décalage réel (${fmt(Dv)} mm).`);
      alpha = Math.asin(Dv / T) / RAD;
    } else {
      alpha = nb(p.angle);
      exiger(alpha > 0 && alpha <= 90, 'Angle des coudes : entre 0 et 90°.');
    }
    const a = alpha * RAD;
    const T = Dv / Math.sin(a), A = Dv / Math.tan(a), E = R * Math.tan(a / 2);
    const L = T - 2 * E - 2 * jeu;
    const roulis = Math.atan2(V, Hz) / RAD;
    const avert = [];
    // Angle maximal pour que les coudes ne se chevauchent pas : D/sin α ≥ 2R tan(α/2) + 2 jeu
    let aMax = 90;
    for (let x = 90; x > 0.1; x -= 0.05) { if (Dv / Math.sin(x * RAD) - 2 * R * Math.tan(x * RAD / 2) - 2 * jeu >= 0) { aMax = x; break; } aMax = 0; }
    exiger(L >= -1e-6, `Impossible : les coudes se chevauchent (il manque ${fmt(-L)} mm). Angle maximal pour ce décalage : ${fmt(aMax)}°.`);
    if (L < Math.min(50, de)) avert.push(`Tube droit très court (${fmt(L)} mm) entre les coudes : soudures rapprochées.`);
    if (Math.abs(alpha - Math.round(alpha)) > 0.05 && p.mode !== 'angle') avert.push('Angle non rond : coudes à recouper dans des coudes 90° (longueurs d\'extrados / intrados ci-dessous).');
    const coude = coupeCoude(R, de, alpha);

    // Croquis à l'échelle dans le plan du décalage réel
    const des = Dessin.creer();
    const amont = Math.max(2 * de, 150);
    const som = [[-E - amont, 0, 0], [0, 0, 0], [A, Dv, 0], [A + E + amont, Dv, 0]];
    const axe = axeAvecCoudes(som, R).map(q => [q[0], q[1]]);
    const [g, dr] = parois(axe, de);
    des.polyligne(g, 'DECOUPE'); des.polyligne(dr, 'DECOUPE');
    des.polyligne(axe, 'AXES');
    des.polyligne([[0, 0], [A, Dv]], 'TRACAGE');
    des.ligne([-E - amont, 0], [A + E + amont, 0], 'TRACAGE');
    // Soudures (traits perpendiculaires aux points de tangence)
    const d2 = [Math.cos(a), Math.sin(a)], n2 = [-Math.sin(a), Math.cos(a)];
    const traitSoudure = (P, n) => des.ligne([P[0] + n[0] * de * 0.6, P[1] + n[1] * de * 0.6], [P[0] - n[0] * de * 0.6, P[1] - n[1] * de * 0.6], 'PLIAGE');
    traitSoudure([-E, 0], [0, 1]); traitSoudure([E * d2[0], E * d2[1]], n2);
    traitSoudure([A - E * d2[0], Dv - E * d2[1]], n2); traitSoudure([A + E, Dv], [0, 1]);
    const h = Math.max(3.5, Math.max(A, Dv) / 40);
    des.cote([A + E + amont * 0.6, 0], [A + E + amont * 0.6, Dv], -2 * h, `décalage ${fmt(Dv)}`, h);
    des.cote([0, -de], [A, -de], -2 * h, `avance ${fmt(A)}`, h);
    des.cote([0, 0], [A, Dv], de * 0.8 + 2 * h, `entraxe ${fmt(T)}`, h);
    des.texte(A / 2 - de, Dv / 2 + de, h, `tube ${fmt(L)}`, 'TEXTE', 'd');
    des.texte(E + h, h * 0.3, h, `${fmt(alpha)}°`, 'COTES');

    return {
      avertissements: avert,
      resultats: {
        angle: arr(alpha, 2), decalageReel: arr(Dv), roulis: arr(roulis, 2), entraxe: arr(T), avance: arr(A),
        reduction: arr(E), tubeDroit: arr(L), encombrement: arr(A + 2 * E), angleMax: arr(aMax, 1),
        projectionV: arr(V), projectionH: arr(Hz),
      },
      coude, dessins: { croquis: des },
    };
  }

  // ---------------------------------------------------------------- Renvoi 3D (ligne par points)
  // Repère : X = Est, Y = Nord, Z = haut. Les points sont les sommets (intersections d'axes) de la ligne.
  function renvoi3D(p) {
    const de = positif(nb(p.de), 'Ø extérieur'), R = positif(nb(p.rayon), 'Rayon de coude'), jeu = nb(p.jeu) || 0;
    const P = (p.points || []).map(q => [nb(q[0]) || 0, nb(q[1]) || 0, nb(q[2]) || 0]);
    exiger(P.length >= 3, 'Saisir au moins trois points (départ, un coude, arrivée).');
    const segs = [];
    for (let i = 0; i < P.length - 1; i++) {
      const l = dist(P[i], P[i + 1]);
      exiger(l > 1e-6, `Les points ${i + 1} et ${i + 2} sont confondus.`);
      segs.push({ de: i + 1, a: i + 2, longueur: l, dir: unit(sub(P[i + 1], P[i])), delta: sub(P[i + 1], P[i]) });
    }
    const avert = [], coudes = [];
    for (let i = 1; i < P.length - 1; i++) {
      const din = segs[i - 1].dir, dout = segs[i].dir;
      const beta = Math.acos(Math.max(-1, Math.min(1, dot(din, dout)))) / RAD;
      exiger(beta < 179, `Point ${i + 1} : demi-tour (180°), à réaliser avec deux coudes.`);
      const nrm = beta > 1e-4 ? unit(cross(din, dout)) : null;
      if (beta > 90.05) avert.push(`Point ${i + 1} : angle de ${fmt(beta)}° supérieur à 90°, pas de coude standard (deux coudes ou coude 180° recoupé).`);
      coudes.push({ point: i + 1, angle: beta, normale: nrm, ...coupeCoude(R, de, beta) });
    }
    // Rotation entre deux coudes successifs : angle autour du tube qui les relie, de la normale du premier à celle du second
    for (let k = 0; k < coudes.length - 1; k++) {
      const c1 = coudes[k], c2 = coudes[k + 1], d = segs[k + 1].dir;
      c2.rotation = (c1.normale && c2.normale) ? Math.atan2(dot(cross(c1.normale, c2.normale), d), dot(c1.normale, c2.normale)) / RAD : null;
    }
    const tableSegs = segs.map((s, k) => {
      const Ed = k > 0 ? coudes[k - 1].reduction : 0, Ea = k < coudes.length ? coudes[k].reduction : 0;
      const soud = (k > 0 && coudes[k - 1].angle > 1e-4 ? 1 : 0) + (k < coudes.length && coudes[k].angle > 1e-4 ? 1 : 0);
      const coupe = s.longueur - Ed - Ea - soud * jeu;
      if (coupe < -1e-6) avert.push(`Tronçon ${s.de}→${s.a} : trop court pour les coudes (${fmt(coupe)} mm), les coudes se chevauchent.`);
      else if (coupe < 20) avert.push(`Tronçon ${s.de}→${s.a} : tube de ${fmt(coupe)} mm seulement entre soudures.`);
      return { de: s.de, a: s.a, dx: arr(s.delta[0]), dy: arr(s.delta[1]), dz: arr(s.delta[2]), longueur: arr(s.longueur), coupe: arr(coupe), pente: arr(Math.asin(Math.max(-1, Math.min(1, s.dir[2]))) / RAD, 2) };
    });
    const tableCoudes = coudes.map(c => ({ point: c.point, angle: arr(c.angle, 2), rotation: c.rotation == null ? null : arr(c.rotation, 1), reduction: c.reduction, axe: c.axe, extrados: c.extrados, intrados: c.intrados }));
    const axe = axeAvecCoudes(P, R);
    let longueurAxe = 0;
    for (let i = 1; i < axe.length; i++) longueurAxe += dist(axe[i - 1], axe[i]);

    // Vue isométrique
    const c30 = Math.cos(30 * RAD), s30 = 0.5;
    const iso = q => [(q[0] - q[1]) * c30, q[2] + (q[0] + q[1]) * s30];
    const des = Dessin.creer();
    const axe2 = axe.map(iso);
    const [g, dr] = parois(axe2, de);
    des.polyligne(g, 'DECOUPE'); des.polyligne(dr, 'DECOUPE');
    des.polyligne(axe2, 'AXES');
    des.polyligne(P.map(iso), 'TRACAGE');
    const bb = Dessin.boite(des), h = Math.max(4, Math.max(bb.l, bb.h) / 45);
    P.forEach((q, i) => {
      const [x, y] = iso(q);
      des.cercle(x, y, h * 0.35, 'TRACAGE', 16);
      const c = coudes.find(cc => cc.point === i + 1);
      des.texte(x + h * 0.6, y + h * 0.6, h, `P${i + 1}${c ? ` ${fmt(c.angle)}°` : ''}`, 'TEXTE');
    });
    segs.forEach((s, k) => {
      const m = iso(mul(add(P[k], P[k + 1]), 0.5));
      des.texte(m[0] + h * 0.4, m[1] - h * 1.4, h * 0.8, `${fmt(tableSegs[k].coupe)}`, 'COTES');
    });
    // Trièdre
    const o = [bb.x0 - 6 * h, bb.y0 - 2 * h], L3 = 4 * h;
    for (const [v, nom] of [[[1, 0, 0], 'X Est'], [[0, 1, 0], 'Y Nord'], [[0, 0, 1], 'Z']]) {
      const [x, y] = iso(mul(v, L3));
      des.ligne(o, [o[0] + x, o[1] + y], 'COTES');
      des.texte(o[0] + x * 1.15, o[1] + y * 1.15, h * 0.8, nom, 'COTES');
    }
    return {
      avertissements: avert, coudes: tableCoudes, segments: tableSegs,
      resultats: { nbCoudes: coudes.filter(c => c.angle > 1e-4).length, longueurAxe: arr(longueurAxe), longueurDroite: arr(tableSegs.reduce((t, s) => t + Math.max(0, s.coupe), 0)) },
      dessins: { iso: des }, axe3D: axe, sommets: P,
    };
  }

  // ---------------------------------------------------------------- Développés (triangulation)
  // Contour bas (z = 0) et contour haut (z = H). Une « bande » est une suite d'échelons (point bas, point haut) ;
  // deux échelons successifs partagent un point et forment un triangle, déplié à ses longueurs vraies.
  function rectanglePts(A, B, cx = 0, cy = 0, z = 0) {
    // ordre : M0 (milieu côté +X), K0 (+X+Y), M1 (+Y), K1, M2 (−X), K2, M3 (−Y), K3
    return {
      M: [[cx + A / 2, cy, z], [cx, cy + B / 2, z], [cx - A / 2, cy, z], [cx, cy - B / 2, z]],
      K: [[cx + A / 2, cy + B / 2, z], [cx - A / 2, cy + B / 2, z], [cx - A / 2, cy - B / 2, z], [cx + A / 2, cy - B / 2, z]],
    };
  }
  const cerclePt = (D, cx, cy, z, th) => [cx + D / 2 * Math.cos(th), cy + D / 2 * Math.sin(th), z];

  function bandeRondCarre(A, B, D, H, ex, ey, nq) {
    const r = rectanglePts(A, B), N = 4 * nq, ech = [];
    const C = j => ({ p: cerclePt(D, ex, ey, H, 2 * Math.PI * j / N), nom: `${j % N}` });
    const noms = ['A', 'B', 'C', 'D'];
    for (let q = 0; q < 4; q++) {
      ech.push({ b: { p: r.M[q], nom: `m${q + 1}` }, h: C(q * nq), couture: true });
      for (let j = q * nq; j <= (q + 1) * nq; j++) ech.push({ b: { p: r.K[q], nom: noms[q] }, h: C(j), pli: true });
    }
    ech.push({ b: { p: r.M[0], nom: 'm1' }, h: C(N), couture: true });
    return ech;
  }
  function bandeCarreCarre(A1, B1, A2, B2, H, ex, ey) {
    const b = rectanglePts(A1, B1), t = rectanglePts(A2, B2, ex, ey, H), ech = [];
    const nb = ['A', 'B', 'C', 'D'], nh = ['a', 'b', 'c', 'd'];
    for (let q = 0; q < 4; q++) {
      ech.push({ b: { p: b.M[q], nom: `m${q + 1}` }, h: { p: t.M[q], nom: `n${q + 1}` }, couture: true });
      ech.push({ b: { p: b.K[q], nom: nb[q] }, h: { p: t.M[q], nom: `n${q + 1}` } });
      ech.push({ b: { p: b.K[q], nom: nb[q] }, h: { p: t.K[q], nom: nh[q] }, pli: true });
      ech.push({ b: { p: b.M[(q + 1) % 4], nom: `m${(q + 1) % 4 + 1}` }, h: { p: t.K[q], nom: nh[q] } });
    }
    ech.push({ b: { p: b.M[0], nom: 'm1' }, h: { p: t.M[0], nom: 'n1' }, couture: true });
    return ech;
  }
  function bandeRondRond(D1, D2, H, ex, ey, N) {
    const ech = [];
    for (let j = 0; j < N; j++) {
      const th = 2 * Math.PI * j / N, th2 = 2 * Math.PI * (j + 1) / N;
      ech.push({ b: { p: cerclePt(D1, 0, 0, 0, th), nom: `${j}` }, h: { p: cerclePt(D2, ex, ey, H, th), nom: `${j}'` } });
      ech.push({ b: { p: cerclePt(D1, 0, 0, 0, th), nom: `${j}` }, h: { p: cerclePt(D2, ex, ey, H, th2), nom: `${(j + 1) % N}'` }, diag: true });
    }
    ech.push({ b: { p: cerclePt(D1, 0, 0, 0, 2 * Math.PI), nom: '0' }, h: { p: cerclePt(D2, ex, ey, H, 2 * Math.PI), nom: "0'" } });
    return ech;
  }

  // Intersection de deux cercles, du côté droit du vecteur a→b (sens de déroulement)
  function placer(a, b, ra, rb) {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
    const x = (ra * ra - rb * rb + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, ra * ra - x * x));
    const ux = dx / d, uy = dy / d;
    return [a[0] + ux * x + uy * h, a[1] + uy * x - ux * h];
  }

  function deplier(ech) {
    const L0 = dist(ech[0].b.p, ech[0].h.p);
    const plat = [{ b: [0, 0], h: [0, L0] }];
    for (let k = 1; k < ech.length; k++) {
      const pr = ech[k - 1], cu = ech[k], fp = plat[k - 1];
      const memeB = pr.b.p === cu.b.p || dist(pr.b.p, cu.b.p) < 1e-9;
      if (memeB) {
        // nouveau point haut, à ses distances vraies du point bas commun et du point haut précédent
        plat.push({ b: fp.b, h: dist(pr.h.p, cu.h.p) < 1e-9 ? fp.h : placer(fp.b, fp.h, dist(cu.b.p, cu.h.p), dist(pr.h.p, cu.h.p)) });
      } else {
        // nouveau point bas : triangle (bas précédent, haut commun, nouveau bas), à droite de l'arête
        const nb2 = placer(fp.b, fp.h, dist(pr.b.p, cu.b.p), dist(cu.h.p, cu.b.p));
        plat.push({ b: nb2, h: fp.h });
      }
    }
    return plat;
  }

  // Rotation qui minimise le rectangle d'encombrement (imbrication sur la tôle)
  function meilleureRotation(pts) {
    let best = { a: 0, aire: Infinity };
    for (let deg = 0; deg < 180; deg += 0.5) {
      const a = deg * RAD, c = Math.cos(a), s = Math.sin(a);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { const u = x * c - y * s, v = x * s + y * c; if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v; }
      const aire = (x1 - x0) * (y1 - y0);
      if (aire < best.aire - 1e-6) best = { a: deg, aire, l: x1 - x0, h: y1 - y0, x0, y0 };
    }
    // Pièce couchée (plus large que haute)
    if (best.h > best.l) { best.a += 90; [best.l, best.h] = [best.h, best.l]; }
    return best;
  }

  const aireContour = pts => Math.abs(pts.reduce((t, p, i) => { const q = pts[(i + 1) % pts.length]; return t + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

  function developpe(p) {
    const forme = p.forme || 'rond-carre';
    const t = nb(p.epaisseur) || 0, H = positif(nb(p.hauteur), 'Hauteur');
    const ex = nb(p.ex) || 0, ey = nb(p.ey) || 0;
    // Fibre neutre : cotes intérieures + épaisseur, extérieures − épaisseur
    const k = p.cotes === 'int' ? t : p.cotes === 'ext' ? -t : 0;
    const parties = [1, 2, 4].includes(+p.parties) ? +p.parties : 1;
    let ech, titre, dims;
    if (forme === 'carre-carre') {
      const A1 = positif(nb(p.A) + k, 'Côté A bas'), B1 = positif(nb(p.B) + k, 'Côté B bas');
      const A2 = positif(nb(p.A2) + k, 'Côté A haut'), B2 = positif(nb(p.B2) + k, 'Côté B haut');
      ech = bandeCarreCarre(A1, B1, A2, B2, H, ex, ey);
      titre = `Trémie ${fmt(nb(p.A), 0)}×${fmt(nb(p.B), 0)} / ${fmt(nb(p.A2), 0)}×${fmt(nb(p.B2), 0)} H${fmt(H, 0)}`;
      dims = { A1, B1, A2, B2 };
    } else if (forme === 'rond-rond') {
      const D1 = positif(nb(p.D) + k, 'Ø bas'), D2 = positif(nb(p.D2) + k, 'Ø haut');
      const N = 4 * Math.max(2, Math.round(nb(p.divisions) || 12));
      ech = bandeRondRond(D1, D2, H, ex, ey, N);
      titre = `Cône Ø${fmt(nb(p.D), 0)} / Ø${fmt(nb(p.D2), 0)} H${fmt(H, 0)}`;
      dims = { D1, D2 };
    } else {
      const A = positif(nb(p.A) + k, 'Côté A'), B = positif(nb(p.B) + k, 'Côté B'), D = positif(nb(p.D) + k, 'Ø du rond');
      const nq = Math.max(2, Math.round(nb(p.divisions) || 12));
      ech = bandeRondCarre(A, B, D, H, ex, ey, nq);
      titre = `Rond-carré ${fmt(nb(p.A), 0)}×${fmt(nb(p.B), 0)} / Ø${fmt(nb(p.D), 0)} H${fmt(H, 0)}`;
      dims = { A, B, D };
    }
    if (ex || ey) titre += ` excentré ${fmt(ex, 0)}/${fmt(ey, 0)}`;
    // Découpe en parties aux coutures : 1 (couture m1), 2 (m1 et m3), 4 (chaque milieu)
    const coutures = ech.map((e, i) => e.couture ? i : -1).filter(i => i >= 0);
    let decoupes;
    if (forme === 'rond-rond') {
      const N = (ech.length - 1) / 2;
      const pas = N / parties;
      decoupes = Array.from({ length: parties + 1 }, (_, i) => i * 2 * pas);
    } else {
      const choix = parties === 1 ? [0, 4] : parties === 2 ? [0, 2, 4] : [0, 1, 2, 3, 4];
      decoupes = choix.map(i => coutures[i]);
    }
    const pieces = [];
    const masseVol = nb(p.masseVolumique) || 7.85;
    for (let i = 0; i < decoupes.length - 1; i++) {
      const sous = ech.slice(decoupes[i], decoupes[i + 1] + 1);
      const plat = deplier(sous);
      // Contour : points bas dans l'ordre puis points hauts à rebours (sans doublons consécutifs)
      const bas = [], haut = [];
      plat.forEach((f, j) => {
        if (!j || dist(sous[j].b.p, sous[j - 1].b.p) > 1e-9) bas.push(f.b);
        if (!j || dist(sous[j].h.p, sous[j - 1].h.p) > 1e-9) haut.push(f.h);
      });
      const contour = [...bas, ...haut.reverse()];
      const rot = meilleureRotation(contour);
      const des = Dessin.creer();
      des.polyligne(contour, 'DECOUPE', true);
      sous.forEach((e, j) => { if (e.pli && j > 0 && j < sous.length - 1) des.ligne(plat[j].b, plat[j].h, 'PLIAGE'); });
      // Repères des points (traçage)
      const hT = Math.max(3, Math.min(8, Math.sqrt(rot.l * rot.h) / 60));
      Dessin.transformer(des, rot.a, 0, 0);
      const bb = Dessin.boite(des);
      Dessin.transformer(des, 0, -bb.x0, -bb.y0);
      const aire = aireContour(contour);
      des.texte(bb.l / 2, bb.h / 2, hT, `${titre} - pièce ${i + 1}/${decoupes.length - 1} - ép. ${fmt(t)}`, 'TEXTE', 'c');
      const lignes = sous.map((e, j) => ({ n: j, bas: e.b.nom, haut: e.h.nom, vraie: arr(dist(e.b.p, e.h.p)), pli: !!e.pli }));
      pieces.push({ dessin: des, largeur: arr(bb.l), hauteur: arr(bb.h), aire: arr(aire / 1e6, 4), masse: arr(aire / 1e6 * t * masseVol, 2), lignes });
    }
    // Longueurs vraies (traçage à la main) de la première pièce, sans doublon
    const vues = new Set(), lignesVraies = [];
    for (const e of ech) {
      const cle = `${e.b.nom}-${e.h.nom}`;
      if (vues.has(cle)) continue; vues.add(cle);
      lignesVraies.push({ bas: e.b.nom, haut: e.h.nom, vraie: arr(dist(e.b.p, e.h.p)), projetee: arr(Math.hypot(e.h.p[0] - e.b.p[0], e.h.p[1] - e.b.p[1])) });
    }
    const avert = [];
    if (t > 0 && !p.cotes) avert.push('Cotes prises sur la fibre neutre (moyenne).');
    if (forme === 'rond-carre' && (Math.abs(ex) + dims.D / 2 > dims.A / 2 || Math.abs(ey) + dims.D / 2 > dims.B / 2)) avert.push('Le rond déborde du carré en vue de dessus : vérifier la faisabilité du pliage.');
    return { forme, titre, fibreNeutre: dims, pieces, lignesVraies, avertissements: avert, resultats: { pieces: pieces.length, aireTotale: arr(pieces.reduce((s, x) => s + x.aire, 0), 4), masseTotale: arr(pieces.reduce((s, x) => s + x.masse, 0), 2) } };
  }

  return { piquage, baionnette, renvoi3D, developpe, axeAvecCoudes, coupeCoude, ErreurSaisie, fmt, _interne: { deplier, placer, dist } };
}));
