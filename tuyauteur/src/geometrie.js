// Tuyauteur : calculs de tuyauterie industrielle et de chaudronnerie.
//   piquage()      traçage d'un piquage (perpendiculaire, oblique, excentré) : gabarit de coupe et gabarit du trou
//   baionnette()   baïonnette (renvoi parallèle à deux coudes), orientée dans l'espace, par l'angle ou par la distance
//   coudeOriente() coude orienté : coude 90° incliné + tranche de coude pour rattraper un dénivelé
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
  const ErreurSaisie = Dessin.ErreurSaisie;
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
    // Points consécutifs confondus retirés : sinon la tangente est nulle et la paroi part de travers
    axe2 = axe2.filter((q, i) => !i || Math.hypot(q[0] - axe2[i - 1][0], q[1] - axe2[i - 1][1]) > 1e-6);
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

  // ---------------------------------------------------------------- Coude orienté : coude 90° incliné + tranche de coude
  // Montage : le tube arrive à l'horizontale (suivant X). Vu de dessus il tourne de 90° (à gauche ou à droite), mais la
  // sortie est à une autre hauteur. Le coude 90° est pivoté sur l'axe d'arrivée d'un angle θ (vu dans l'axe de
  // l'arrivée, sa sortie fait θ avec l'horizontale) ; une tranche de θ, soudée dessus (tournée d'un quart de tour),
  // ramène le tube à l'horizontale. Un tube droit peut s'intercaler entre les deux (0 = bout à bout).
  // Dans la vue dans l'axe de l'arrivée : sommet du 90° → sommet de la tranche = K(θ) = R + R·tan(θ/2) + tube + jeux,
  //   hauteur  ΔH = K·sin θ   ;   horizontale (axe d'arrivée → face de sortie) = K·cos θ + R·tan(θ/2).
  // Calcul par : « hauteur » (ΔH connu), « horizontale » (horizontale connue) ou « angle » (θ imposé).
  function coudeOriente(p) {
    const de = positif(nb(p.de), 'Ø extérieur'), R = positif(nb(p.rayon), 'Rayon de coude'), jeu = nb(p.jeu) || 0;
    exiger(R > de / 2, 'Le rayon de coude doit être supérieur au rayon du tube.');
    const L = Math.max(0, nb(p.tube) || 0);
    const g = jeu * (L > 0 ? 2 : 1); // soudures entre le coude 90° et la tranche
    const v = p.sens === 'descend' ? -1 : 1; // +1 : la sortie est plus haute
    const s = p.virage === 'droite' ? -1 : 1; // +1 : virage à gauche
    const r = de / 2;
    const E2 = th => R * Math.tan(th * RAD / 2);
    const K = th => R + E2(th) + L + g;
    const hauteurDe = th => K(th) * Math.sin(th * RAD);
    const horizDe = th => K(th) * Math.cos(th * RAD) + E2(th);
    // Racine de f(θ) = cible sur ]0 ; 90], recherche par balayage puis dichotomie (la première trouvée)
    const resoudre = (f, cible) => {
      let a = 1e-6, fa = f(a) - cible;
      for (let x = 0.05; x <= 90 + 1e-9; x += 0.05) {
        const fx = f(x) - cible;
        if (fa === 0) return a;
        if (Math.sign(fx) !== Math.sign(fa)) {
          let lo = a, hi = x;
          for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (Math.sign(f(m) - cible) === Math.sign(fa)) lo = m; else hi = m; }
          return (lo + hi) / 2;
        }
        a = x; fa = fx;
      }
      return null;
    };
    let theta;
    if (p.mode === 'horizontale') {
      const Hz = positif(nb(p.horizontale), 'Distance horizontale');
      let mini = Infinity, maxi = -Infinity;
      for (let x = 0.05; x <= 90; x += 0.05) { mini = Math.min(mini, horizDe(x)); maxi = Math.max(maxi, horizDe(x)); }
      theta = resoudre(horizDe, Hz);
      exiger(theta != null, `Distance horizontale impossible avec ce coude : entre ${fmt(mini)} et ${fmt(maxi)} mm${L ? ' (avec ce tube)' : ''}.`);
      // L'horizontale passe par un maximum : un second angle peut donner la même valeur
      const th0 = theta;
      const autre = resoudre(x => (x <= th0 + 0.5 ? horizDe(th0 + 0.5) : horizDe(x)), Hz);
      if (autre != null && autre > th0 + 0.5) p._autreAngle = autre;
    } else if (p.mode === 'angle') {
      theta = nb(p.angle);
      exiger(theta > 0 && theta <= 90, 'Angle : entre 0 et 90°.');
    } else {
      const dH = positif(Math.abs(nb(p.denivele)), 'Différence de hauteur');
      exiger(dH <= hauteurDe(90) + 1e-6, `Hauteur trop grande : au plus ${fmt(hauteurDe(90))} mm avec ${L ? 'ce tube' : 'le coude et la tranche bout à bout'}. Ajouter un tube droit entre le coude 90° et la tranche.`);
      theta = resoudre(hauteurDe, dH);
    }
    const t = theta * RAD, e2 = E2(theta), k = K(theta);
    const dH = hauteurDe(theta), Hz = horizDe(theta);
    const tranche = coupeCoude(R, de, theta);
    const C = Math.PI * de;
    const avert = [];
    if (theta > 85) avert.push('Tranche presque égale à un coude 90° complet.');
    if (p._autreAngle) avert.push(`Un second angle donne la même horizontale : ${fmt(p._autreAngle, 1)}° (hauteur ${fmt(hauteurDe(p._autreAngle))} mm). Calculer par la hauteur pour lever le doute.`);
    if (theta < 5) avert.push(`Tranche de ${fmt(theta)}° : très fine, la couper avec soin.`);
    // Traçage au trusquin : coude posé sur une face, coupe à θ de la table
    const trusquin = { extrados: (R + r) * Math.sin(t), axe: R * Math.sin(t), intrados: (R - r) * Math.sin(t) };

    // ---- Vue dans l'axe de l'arrivée (le tube d'arrivée est vu en bout)
    const vue = Dessin.creer();
    const u = [Math.cos(t), Math.sin(t)];
    const IP2 = [k * u[0], k * u[1]], fin = [IP2[0] + e2, IP2[1]];
    const axe = axeAvecCoudes([[0, 0, 0], [IP2[0], IP2[1], 0], [fin[0], fin[1], 0]], R).map(q => [q[0], q[1]]);
    const [pg, pd] = parois(axe, de);
    vue.polyligne(pg, 'DECOUPE'); vue.polyligne(pd, 'DECOUPE');
    vue.ligne(pg[pg.length - 1], pd[pd.length - 1], 'DECOUPE');
    vue.polyligne(axe, 'AXES');
    vue.cercle(0, 0, r, 'DECOUPE', 96);
    vue.ligne([-r * 0.7, -r * 0.7], [r * 0.7, r * 0.7], 'AXES'); vue.ligne([-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], 'AXES');
    // Soudure coude 90° / tranche (et tube éventuel)
    const nrm = [-u[1], u[0]];
    const soud = d => vue.ligne([d * u[0] + nrm[0] * r, d * u[1] + nrm[1] * r], [d * u[0] - nrm[0] * r, d * u[1] - nrm[1] * r], 'DECOUPE');
    soud(R); if (L > 0) soud(R + L + g);
    vue.cercle(IP2[0], IP2[1], Math.max(3, de / 25), 'COTES', 24);
    const h = Math.max(5, de / 9);
    // Angle θ depuis l'horizontale
    vue.ligne([0, 0], [R * 1.3, 0], 'COTES');
    const arcA = Array.from({ length: 25 }, (_, i) => { const a = t * i / 24; return [R * 0.85 * Math.cos(a), R * 0.85 * Math.sin(a)]; });
    vue.polyligne(arcA, 'COTES');
    vue.texte(-r * 0.4, -h * 0.4, h * 1.3, `${fmt(theta, 1)}°`, 'TEXTE', 'c');
    // Cotes
    vue.cote([0, 0], [R * u[0], R * u[1]], r + 3 * h, fmt(R), h);
    if (L > 0) vue.cote([R * u[0], R * u[1]], [(R + L + g) * u[0], (R + L + g) * u[1]], r + 3 * h, `tube ${fmt(L)}`, h);
    vue.cote([IP2[0] - e2 * u[0], IP2[1] - e2 * u[1]], IP2, -h * 1.5, fmt(e2), h * 0.9);
    vue.cote(IP2, fin, h * 1.5, fmt(e2), h * 0.9);
    vue.texte(IP2[0] + e2 * 0.2, IP2[1] + r + h * 1.8, h, `extrados ${fmt(tranche.extrados)}`, 'COTES', 'c');
    vue.texte(IP2[0] + e2 * 0.6, IP2[1] - r - h * 2.2, h, `intrados ${fmt(tranche.intrados)}`, 'COTES', 'c');
    vue.cote([fin[0] + r * 0.6, 0], [fin[0] + r * 0.6, dH], -2 * h, `hauteur ${fmt(dH)}`, h);
    vue.cote([0, -r - 2 * h], [fin[0], -r - 2 * h], -2 * h, `horizontale ${fmt(Hz)}`, h);
    // Sortie plus basse : la même vue retournée de haut en bas (textes gardés à l'endroit)
    if (v < 0) {
      for (const e of vue.entites) {
        if (e.type === 'texte') { e.y = -e.y - e.h; e.angle = -e.angle; } else {
          e.pts = e.pts.map(([x, y]) => [x, -y]);
          if (e.cercle) e.cercle.cy = -e.cercle.cy;
        }
      }
    }
    const bv = Dessin.boite(vue);
    vue.texte((bv.x0 + bv.x1) / 2, bv.y0 - 2 * h, h, `vue dans l'axe de l'arrivée, sortie plus ${v < 0 ? 'basse' : 'haute'}`, 'TEXTE', 'c');

    // ---- Traçage de la tranche au trusquin : coude 90° posé sur une face, sur un marbre
    const tr = Dessin.creer();
    const Re = R + r, Ri = R - r;
    const arcs = (rr, a0, a1, n = 48) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * RAD; return [rr * Math.cos(a), rr * Math.sin(a)]; });
    tr.polyligne(arcs(Re, 0, 90), 'DECOUPE'); tr.polyligne(arcs(Ri, 0, 90), 'DECOUPE'); tr.polyligne(arcs(R, 0, 90), 'AXES');
    tr.ligne([Ri, 0], [Re, 0], 'DECOUPE'); tr.ligne([0, Ri], [0, Re], 'DECOUPE');
    tr.ligne([Ri * Math.cos(t), Ri * Math.sin(t)], [Re * Math.cos(t), Re * Math.sin(t)], 'PLIAGE');
    tr.ligne([-0.1 * Re, 0], [Re + 0.5 * Re, 0], 'TRACAGE');
    const hc = Math.max(5, Re / 22);
    tr.texte(Re * 1.05, -hc * 1.4, hc * 0.9, 'marbre', 'TEXTE');
    const am = t / 2, au = (t + Math.PI / 2) / 2;
    tr.texte(R * Math.cos(am), R * Math.sin(am), hc * 1.2, `${fmt(theta, 1)}°`, 'TEXTE', 'c');
    tr.texte(R * Math.cos(au), R * Math.sin(au), hc * 1.2, `${fmt(90 - theta, 1)}°`, 'TRACAGE', 'c');
    tr.cote([Re + 0.35 * Re, 0], [Re + 0.35 * Re, trusquin.extrados], -2 * hc, fmt(trusquin.extrados), hc);
    tr.ligne([Re * Math.cos(t), trusquin.extrados], [Re + 0.4 * Re, trusquin.extrados], 'COTES');
    tr.cote([-0.25 * Re, 0], [-0.25 * Re, trusquin.intrados], 2 * hc, fmt(trusquin.intrados), hc);
    tr.ligne([-0.3 * Re, trusquin.intrados], [Ri * Math.cos(t), trusquin.intrados], 'COTES');
    tr.texte(Re * 0.55, -hc * 3.2, hc, 'hauteurs à reporter au trusquin, coude posé sur sa face', 'TEXTE', 'c');

    // ---- Vue de dessus (le 90°) et vue isométrique, en 3D
    const d1 = [0, s * Math.cos(t), v * Math.sin(t)], d2 = [0, s, 0];
    const IP2b = mul(d1, k);
    const Lt = Math.max(2 * de, 1.2 * R);
    const sommets = [[-(R + Lt), 0, 0], [0, 0, 0], IP2b, add(IP2b, mul(d2, e2 + Lt))];
    const axe3 = axeAvecCoudes(sommets, R);
    const vue3 = proj => { const d = Dessin.creer(); const a2 = axe3.map(proj); const [g1, g2] = parois(a2, de); d.polyligne(g1, 'DECOUPE'); d.polyligne(g2, 'DECOUPE'); d.polyligne(a2, 'AXES'); return d; };
    const dessus = vue3(q => [q[0], q[1]]);
    dessus.texte(de * 0.7, -s * de * 1.1, h, '90° vu de dessus', 'COTES');
    const c30 = Math.cos(30 * RAD);
    const iso = vue3(q => [(q[0] - q[1]) * c30, q[2] + (q[0] + q[1]) * 0.5]);

    // ---- Bande de repérage 1:1 (rotation du coude 90° sur l'arrivée, quart de tour de la tranche)
    const gab = Dessin.creer();
    const Hb = Math.max(40, de * 0.4), arcIncl = theta / 360 * C;
    gab.polyligne([[0, 0], [C, 0], [C, Hb], [0, Hb]], 'DECOUPE', true);
    const trait = (x, txt, calque) => { gab.ligne([x, 0], [x, Hb], calque); gab.texte(x + 1.5, Hb - 7, 3.5, txt, 'TEXTE'); };
    trait(0, 'HORIZONTALE', 'COTES'); trait(arcIncl, `ROTATION ${fmt(theta, 1)}° = ${fmt(arcIncl)}`, 'PLIAGE');
    gab.texte(C / 2, -6, 3.5, `Ø${fmt(de)} - circonférence ${fmt(C)} - à enrouler sur le tube d'arrivée`, 'TEXTE', 'c');

    return {
      avertissements: avert,
      resultats: {
        inclinaison: arr(theta, 2), tranche: arr(theta, 2), chute: arr(90 - theta, 2), arcInclinaison: arr(arcIncl, 1), quartDeTour: arr(C / 4, 1),
        hauteur: arr(dH, 1), horizontale: arr(Hz, 1), reduction90: arr(R, 1), reductionTranche: arr(e2, 1), entraxe: arr(k, 1), tube: arr(L, 1),
        extrados: tranche.extrados, intrados: tranche.intrados, axe: tranche.axe,
        trusquinExtrados: arr(trusquin.extrados, 1), trusquinAxe: arr(trusquin.axe, 1), trusquinIntrados: arr(trusquin.intrados, 1),
        enAvant: arr(R, 1), virage: s > 0 ? 'gauche' : 'droite', sens: v < 0 ? 'descend' : 'monte', dosTranche: v < 0 ? 'en dessous' : 'au-dessus',
      },
      tranche, dessins: { vue, trusquin: tr, dessus, iso, gabarit: gab },
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

  return { piquage, baionnette, coudeOriente, developpe, axeAvecCoudes, coupeCoude, ErreurSaisie, fmt, _interne: { deplier, placer, dist } };
}));
