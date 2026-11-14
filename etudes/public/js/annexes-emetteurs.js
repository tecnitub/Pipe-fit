// Calculs annexes — Émetteurs et terminaux : plancher chauffant/rafraîchissant, radiateurs, plafonds rayonnants / poutres froides, échangeur à plaques.
// Rangés à part dans l'étude (famille « Calculs annexes », thème « Émetteurs et terminaux ») ; chaque type déclare annexe: true, theme,
// et sa fonction lier(ctx) qui reprend les données des autres notes de l'étude (voir Liens.resoudreLiens).
// Les normes sont citées comme repères (méthodes simplifiées documentées dans chaque calcul) ; les données de matériel
// (radiateurs, poutres, échangeurs, collecteurs) sont des ordres de grandeur génériques, à remplacer par celles du fabricant retenu.
// Module pur (navigateur, node, tests).
const AnnexesEmetteurs = ((N) => {
  const { nf, num } = N;
  const C = typeof Calculs !== 'undefined' ? Calculs : require('./calculs');
  const Ln = () => (typeof Liens !== 'undefined' ? Liens : require('./liens'));
  const Sc = () => (typeof Schema !== 'undefined' ? Schema : require('./schema'));
  const Pc = () => (typeof Pieces !== 'undefined' ? Pieces : require('./pieces'));
  const alerte = (niveau, texte) => ({ niveau, texte });
  const THEME = 'Émetteurs et terminaux', FAMILLE = 'Calculs annexes';
  const vide = v => v === undefined || v === null || String(v).trim() === '';
  // Valeur saisie, ou valeur usuelle si le champ est vide (champ « vide : … »)
  const val = (v, d) => (vide(v) ? d : num(v, d));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const interp = (pts, x) => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return pts[pts.length - 1][1]; };
  const CP = 4186; // J/kg·K (eau)
  // Écart logarithmique moyen entre l'eau (départ, retour) et l'ambiance (positif en chauffage)
  function dtlmAmbiance(Td, Tr, Ti) {
    const a = Td - Ti, b = Tr - Ti;
    if (!(a > 0 && b > 0) && !(a < 0 && b < 0)) return NaN;
    return Math.abs(a - b) < 1e-6 ? Math.abs(a) : Math.abs((a - b) / Math.log(a / b));
  }
  // Point de rosée (formule de Magnus, Calculs.pointRosee) et humidité absolue (g/kg d'air sec, 101 325 Pa)
  const rosee = (T, HR) => C.pointRosee(T, HR);
  const psat = T => 610.94 * Math.exp(17.625 * T / (T + 243.04));
  const humAbs = (T, HR) => { const pv = psat(T) * HR / 100; return 622 * pv / (101325 - pv); };
  const xRosee = Tr => { const pv = psat(Tr); return 622 * pv / (101325 - pv); };
  const Kv = (Qm3h, dpkPa) => (dpkPa > 0.05 ? Qm3h / Math.sqrt(dpkPa / 100) : NaN);

  /* ---------- Liens à l'étude : locaux repris des bilans, régime d'un circuit du schéma de principe ---------- */
  // Lignes « locaux » : les lignes saisies au nom d'une pièce des bilans prennent ses besoins (colonnes verrouillées) ;
  // avec mode « toutes », les pièces absentes de la liste sont ajoutées en lignes reprises (verrouillées, non modifiables :
  // ajouter une ligne au même nom pour régler ses autres colonnes).
  function lierLocaux(ctx, besoins, mode, colonnes, defLigne) {
    const { e, imposer } = ctx;
    if (mode === 'saisie' || !besoins.size) return 0;
    const l = e.locaux = Array.isArray(e.locaux) ? e.locaux : [];
    const verrou = (i, col, v, src) => { if (v !== undefined) l[i][col] = v; const k = `locaux.${i}.${col}`, x = l[i][col]; imposer({ [k]: vide(x) ? '—' : x }, src); delete e[k]; };
    const vus = new Set();
    l.forEach((x, i) => { if (!x) return; const b = besoins.get(norm(x.local)); if (!b) return; vus.add(norm(x.local)); Object.entries(b.vals).forEach(([c, v]) => verrou(i, c, v, b.src)); });
    let n = 0;
    if (mode === 'toutes') besoins.forEach((b, k) => {
      if (vus.has(k)) return;
      const i = l.length; l.push({ ...defLigne, local: b.nom, ...(b.etage !== undefined ? { etage: b.etage } : {}), ...b.vals, _auto: b.src }); n++;
      colonnes.forEach(c => verrou(i, c, undefined, b.src));
    });
    return n;
  }
  // Besoins des pièces de l'étude (bilans pièce par pièce) : Map nom normalisé → { nom, etage, vals, src }
  function besoinsPieces(ctx, f) {
    const out = new Map(), et = ctx.etude;
    let b = {}; try { b = Pc().besoinsEtude(et); } catch (err) { b = {}; }
    Object.entries(b).forEach(([k, p]) => { const n = ((et && et.notes) || []).find(x => x.id === p.note); const vals = f(p); if (vals) out.set(k, { nom: p.nom, etage: p.etage || '', vals, src: n ? ctx.libelle(n) : 'bilan pièce par pièce' }); });
    return out;
  }
  // Circuits des schémas de principe de l'étude (dimensionnés) : [{ note, c (circuit), es (entrées), d (dimensionnement) }]
  function circuitsEtude(ctx) {
    const out = [];
    (ctx.notes || []).filter(n => n.type === 'pid').forEach(n => {
      let es, d; try { es = ctx.resoudre(n); d = Sc().dimensionner(es); } catch (err) { return; }
      (d.circuits || []).forEach(c => out.push({ note: n, c, es, d }));
    });
    return out;
  }
  // Circuit choisi (« id|rep ») ou, en automatique, premier circuit dont l'émetteur convient
  function circuitChoisi(ctx, choix, emetteurs) {
    const l = circuitsEtude(ctx);
    if (choix && choix !== 'auto') { const [id, rep] = String(choix).split('|'); const x = l.find(y => y.note.id === id && y.c.rep === rep); if (!x) ctx.alertes.push(alerte('attention', 'Le circuit relié n\'existe plus dans l\'étude : régime saisi conservé.')); return x || null; }
    return choix === 'auto' ? l.find(y => emetteurs.includes(y.c.emetteur)) || null : null;
  }
  const optCircuit = (e, et) => { let o = []; try { o = Ln().optCircuits(et, e && e.circuit); } catch (err) { o = [['', 'Saisie']]; } return [['auto', 'Automatique (circuit de l\'étude de même émetteur)'], ...o]; };
  const libCircuit = (ctx, x) => `${ctx.libelle(x.note)} (circuit ${x.c.rep})`;

  /* =====================================================================================================
     1. Plancher chauffant / rafraîchissant (NF EN 1264)
     ===================================================================================================== */
  // Revêtements de sol : résistance thermique usuelle R λ,B (m²·K/W) ; NF EN 1264 : R ≤ 0,15
  const REVETEMENTS = { carrelage: ['Carrelage, pierre', 0.01], souple: ['Sol souple (PVC, linoléum)', 0.025], stratifie: ['Stratifié, parquet contrecollé mince', 0.07], parquet: ['Parquet (≤ 15 mm)', 0.10], moquette: ['Moquette', 0.15] };
  // Zones : température de surface maximale en chauffage (°C)
  const ZONES = { sejour: ['Zone de séjour (occupation)', 29], sdb: ['Salle d\'eau', 33], rive: ['Zone de rive (≤ 1 m des façades)', 33] };
  // Tubes : [libellé, diamètre extérieur (mm), diamètre intérieur (mm)]
  const TUBES_PL = { pe16: ['PER / multicouche 16 × 2', 16, 12], pe17: ['PER 17 × 2', 17, 13], pe20: ['PER / multicouche 20 × 2', 20, 16] };
  const PAS = [0.30, 0.25, 0.20, 0.15, 0.10];
  // Coefficient K_H (W/m²·K) de la courbe caractéristique, méthode simplifiée de la NF EN 1264-2 (système A, tubes dans la chape) :
  // q = B · aB · aT^mT · aU^mU · aD^mD · ΔθH, B = 6,7 W/m²·K ; aB = (1/α + su0/λu0) / (1/α + su/λE + R) ; mT = 1 − T/0,075 ;
  // mU = 100 (0,045 − su) ; mD = 250 (D − 0,020) ; aT selon R, aU selon T (tableaux A de la norme, interpolés), aD ≈ 1,04.
  function kH(T, R, Dm, su = 0.045, lE = 1.2) {
    const aB = (1 / 10.8 + 0.045 / 1) / (1 / 10.8 + su / lE + R);
    const aT = interp([[0, 1.23], [0.05, 1.188], [0.10, 1.156], [0.15, 1.134]], R), mT = 1 - T / 0.075;
    const aU = interp([[0.05, 1.069], [0.075, 1.066], [0.1, 1.063], [0.15, 1.057], [0.2, 1.051], [0.25, 1.0445], [0.3, 1.04], [0.375, 1.03]], T), mU = 100 * (0.045 - su);
    const mD = 250 * (Dm - 0.020);
    return 6.7 * aB * aT ** mT * aU ** mU * 1.04 ** mD;
  }
  // Courbe limite : q = 8,92 (θF − θi)^1,1 (W/m²) ; et inversement la température de surface moyenne
  const qLimite = (TFmax, Ti) => (TFmax > Ti ? 8.92 * (TFmax - Ti) ** 1.1 : 0);
  const tSurface = (q, Ti) => Ti + (Math.max(q, 0) / 8.92) ** (1 / 1.1);
  // Retour d'un local pour obtenir l'écart ΔθH demandé avec le départ commun (dichotomie : ΔθH croît avec le retour)
  function retourPour(dth, Td, Ti) {
    if (!(dth > 0) || !(Td - Ti > dth)) return NaN;
    let a = Ti + 1e-6, b = Td - 1e-6;
    for (let k = 0; k < 80; k++) { const m = (a + b) / 2; if (dtlmAmbiance(Td, m, Ti) < dth) a = m; else b = m; }
    return (a + b) / 2;
  }
  function calculerPlancher(e) {
    const alertes = [], Ti = val(e.Ti, 20), Td = val(e.Td, 35), dTn = val(e.dT, 5), Tr = Td - dTn, cov = Math.min(1, Math.max(0.3, val(e.couverture, 90) / 100));
    const tube = TUBES_PL[e.tube] || TUBES_PL.pe16, Dm = tube[1] / 1000, Di = tube[2] / 1000, su = val(e.su, 45) / 1000, lE = val(e.lambdaChape, 1.2);
    const Lmax = val(e.Lmax, 120), Ru = Math.max(0.3, val(e.Ru, 2)), dpColl = val(e.dpColl, 5), sorties = Math.max(2, Math.round(val(e.sorties, 12))), dpMaxB = val(e.dpMaxBoucle, 25);
    const fr = e.rafraich === 'oui', TiF = val(e.TiF, 26), HR = val(e.HR, 50), TdF = val(e.TdF, 18), dTF = val(e.dTF, 3), TrF = TdF + dTF;
    const Tros = rosee(TiF, HR), TFmin = Math.max(19, Tros + 1);
    const dthNom = dtlmAmbiance(Td, Tr, Ti), w = C.eau((Td + Tr) / 2);
    if (!(Td > Ti + 1) || !(dTn > 0) || !(Tr > Ti)) alertes.push(alerte('erreur', `Régime ${nf(Td, 1)}/${nf(Tr, 1)} °C incompatible avec l'ambiance à ${nf(Ti, 0)} °C (retour au-dessus de l'ambiance requis).`));
    if (Td > 50) alertes.push(alerte('attention', `Départ à ${nf(Td, 0)} °C : au-delà de 50 °C (55 °C au plus selon NF EN 1264-4), risque pour la chape et le revêtement.`));
    const lignes = (e.locaux || []).filter(x => x && (x.local || num(x.S) > 0)).map((x, i) => {
      const nom = x.local || `Local ${i + 1}`, S = num(x.S), Su = S * cov, P = num(x.P), z = ZONES[x.zone] ? x.zone : 'sejour', TFmax = ZONES[z][1];
      const R = vide(x.R) ? (REVETEMENTS[x.rev] || REVETEMENTS.carrelage)[1] : num(x.R), Lc = val(x.Lc, 5), Tu = val(x.Tdessous, Ti);
      const q = Su > 0 ? P * 1000 / Su : 0, qG = qLimite(TFmax, Ti), qPl = Math.min(q, qG), out = { nom, etage: x.etage || '', zone: z, S, Su, P, R, q, qG, qPl, Lc, auto: !!x._auto };
      if (R > 0.15) alertes.push(alerte('attention', `${nom} : revêtement de résistance ${nf(R, 2)} m²·K/W > 0,15 (limite NF EN 1264) : émission fortement réduite.`));
      if (!(Su > 0) || !(P > 0)) { alertes.push(alerte('attention', `${nom} : surface ou besoin manquant.`)); return { ...out, vide: true }; }
      if (q > qG) alertes.push(alerte('attention', `${nom} : besoin de ${nf(q, 0)} W/m² au-delà de la courbe limite (${nf(qG, 0)} W/m² pour ${TFmax} °C en surface) : ${nf((q - qG) * Su / 1000, 2)} kW d'appoint (radiateur, sèche-serviettes) à prévoir.`));
      // Pas de pose : le plus large qui fournit le besoin au régime nominal (sinon 10 cm et retour relevé), ou pas imposé
      const imp = num(x.pas) > 0 ? num(x.pas) / 100 : null;
      let T = imp || PAS.find(t => qPl / kH(t, R, Dm, su, lE) <= dthNom + 1e-9) || 0.10;
      let K = kH(T, R, Dm, su, lE), dth = qPl / K, TrL = retourPour(dth, Td, Ti), qEff = qPl;
      if (!(Td - TrL >= 0.5)) {
        // Départ insuffisant : émission plafonnée avec 2 K d'écart au plus serré
        TrL = Td - 2; dth = dtlmAmbiance(Td, TrL, Ti); qEff = K * dth;
        alertes.push(alerte('erreur', `${nom} : départ à ${nf(Td, 1)} °C insuffisant au pas de ${nf(T * 100, 0)} cm (${nf(qEff, 0)} W/m² au plus pour ${nf(qPl, 0)} W/m² demandés) : relever le départ, resserrer le pas ou prévoir un appoint.`));
      }
      const sigma = Td - TrL, TF = tSurface(qEff, Ti);
      // Débit du local, pertes vers le bas comprises (NF EN 1264-3) : m = A q / (σ cp) · (1 + R0/Ru + (θi − θu)/(q Ru))
      const R0 = 1 / 10.8 + R + su / lE, fact = 1 + R0 / Ru + (Ti - Tu) / (qEff * Ru);
      const m = Su * qEff * fact / (sigma * CP) * 3600, Q = m / w.rho * 1000; // kg/h, L/h
      // Boucles : longueur = surface / pas + liaison aller et retour au collecteur, au plus Lmax
      let nb = 1;
      if (2 * Lc >= Lmax) alertes.push(alerte('erreur', `${nom} : liaison au collecteur trop longue (${nf(2 * Lc, 0)} m aller et retour pour ${nf(Lmax, 0)} m de boucle au plus).`));
      else nb = Math.max(1, Math.ceil(Su / T / (Lmax - 2 * Lc)));
      const Lb = Su / (nb * T) + 2 * Lc, Qb = Q / nb, xe = C.ecoulement(Qb / 1000 / 3600, Di, w.rho, w.mu, 0.007), dpB = xe.R * Lb * 1.1 / 1000;
      if (dpB > dpMaxB) alertes.push(alerte('attention', `${nom} : ${nf(dpB, 1)} kPa par boucle (> ${nf(dpMaxB, 0)} kPa) : ajouter une boucle ou passer au tube ${Di < 0.016 ? '20 × 2' : 'supérieur'}.`));
      if (xe.v < 0.15) alertes.push(alerte('attention', `${nom} : vitesse de ${nf(xe.v, 2)} m/s dans les boucles, désaération difficile (≥ 0,15 à 0,2 m/s conseillé).`));
      // Rafraîchissement (NF EN 1264-5) : surface ≥ 19 °C et ≥ point de rosée + 1 K ; échange plancher → local ≈ 7 W/m²·K
      let froid = null;
      if (fr) {
        const dthF = dtlmAmbiance(TdF, TrF, TiF), qEau = K * dthF, qMax = Math.max(0, 7 * (TiF - TFmin)), qF = Math.min(qEau, qMax), Pfr = num(x.Pfr);
        froid = { qF, TFf: TiF - qF / 7, Pcouv: qF * Su / 1000, Pfr, QF: qF * Su / (CP * dTF) * 3600 / w.rho * 1000 };
        if (Pfr > froid.Pcouv * 1.02) alertes.push(alerte('attention', `${nom} : le plancher rafraîchissant couvre ${nf(froid.Pcouv, 2)} kW sur ${nf(Pfr, 2)} kW de froid (${nf(qF, 0)} W/m²) : complément (ventilo-convecteur, air neuf rafraîchi) à prévoir.`));
      }
      return { ...out, T, K, dth, sigma, TrL, qEff, TF, fact, m, Q, nb, Lb, Qb, v: xe.v, dpB, froid, Tu };
    });
    const ok = lignes.filter(l => !l.vide);
    if (!ok.length) alertes.push(alerte('attention', 'Ajoutez les locaux (surface et besoin), ou un bilan pièce par pièce dans l\'étude pour les reprendre.'));
    // Réglage : la boucle la plus défavorisée (ΔP boucle + collecteur) fixe la pression ; les autres sont freinées (Kv de la vanne de boucle)
    const boucles = ok.flatMap(l => Array.from({ length: l.nb }, (_, k) => ({ rep: `${l.nom}${l.nb > 1 ? ` · ${k + 1}` : ''}`, etage: l.etage, L: l.Lb, Q: l.Qb, dp: l.dpB })));
    const dpMax = boucles.reduce((a, b) => Math.max(a, b.dp), 0) + dpColl;
    boucles.forEach(b => { b.dpAj = dpMax - dpColl - b.dp; b.kv = Kv(b.Q / 1000, b.dpAj); });
    const etages = new Map(); boucles.forEach(b => { const k = b.etage || '—'; const x = etages.get(k) || { n: 0, Q: 0 }; x.n++; x.Q += b.Q; etages.set(k, x); });
    const nColl = [...etages.values()].reduce((a, x) => a + Math.ceil(x.n / sorties), 0);
    const Ptot = ok.reduce((a, l) => a + Math.min(l.P, l.qEff * l.Su / 1000), 0), Qtot = ok.reduce((a, l) => a + l.Q, 0), Stot = ok.reduce((a, l) => a + l.S, 0);
    const Pfr = fr ? ok.reduce((a, l) => a + l.froid.Pcouv, 0) : 0, QfrTot = fr ? ok.reduce((a, l) => a + l.froid.QF, 0) : 0;
    if (fr && TdF < Tros + 0.5) alertes.push(alerte('erreur', `Départ d'eau froide à ${nf(TdF, 1)} °C sous le point de rosée de l'ambiance (${nf(Tros, 1)} °C à ${nf(TiF, 0)} °C et ${nf(HR, 0)} % HR) : condensation sur les collecteurs et en surface ; relever le départ ou déshumidifier.`));
    else if (fr) alertes.push(alerte('ok', `Rafraîchissement : surface maintenue ≥ ${nf(TFmin, 1)} °C (19 °C et point de rosée ${nf(Tros, 1)} °C + 1 K) ; régulation du départ sur le point de rosée, sonde d'hygrométrie et coupure en cas de risque de condensation.`));
    if (ok.length) alertes.push(alerte('ok', `${ok.length} local(aux), ${boucles.length} boucle(s), ${nColl} collecteur(s) : ${nf(Ptot, 2)} kW au régime ${nf(Td, 1)}/${nf(Tr, 1)} °C, ${nf(Qtot, 0)} L/h ; boucle la plus défavorisée + collecteur : ${nf(dpMax, 1)} kPa.`));
    if (ok.some(l => l.TF > ZONES[l.zone][1] + 0.05)) alertes.push(alerte('erreur', 'Température de surface au-delà de la limite d\'une zone.'));
    const mT = ok.length ? Math.max(...ok.map(l => l.TF)) : NaN;
    return {
      valeurs: { P: Ptot, Q: Qtot, S: Stot, boucles: boucles.length, collecteurs: nColl, dpMax, Pfr, Qfr: QfrTot, Tros, TFmax: mT, locaux: ok.map(l => ({ local: l.nom, pas: l.T, TF: l.TF, q: l.qEff, Q: l.Q, nb: l.nb, Lb: l.Lb, dpB: l.dpB })), regime: [Td, Tr] },
      resume: [['Régime de chauffage', `${nf(Td, 1)}/${nf(Tr, 1)} °C, ambiance ${nf(Ti, 0)} °C (ΔθH nominal ${nf(dthNom, 1)} K)`], ['Puissance émise', `${nf(Ptot, 2)} kW sur ${nf(Stot, 0)} m²`], ['Débit total', `${nf(Qtot, 0)} L/h (${nf(Qtot / 1000, 2)} m³/h)`],
        ['Boucles / collecteurs', `${boucles.length} boucle(s) ≤ ${nf(Lmax, 0)} m · ${nColl} collecteur(s) de ${sorties} départs au plus`], ['Température de surface maximale', `${nf(mT, 1)} °C`], ['ΔP boucle la plus défavorisée + collecteur', `${nf(dpMax, 1)} kPa`],
        ...(fr ? [['Rafraîchissement', `${nf(Pfr, 2)} kW au régime ${nf(TdF, 1)}/${nf(TrF, 1)} °C · ${nf(QfrTot, 0)} L/h · point de rosée ${nf(Tros, 1)} °C`]] : [])],
      tableaux: [{ titre: 'Locaux', entetes: ['Local', 'Étage', 'Zone', 'Surface utile (m²)', 'Revêtement R (m²·K/W)', 'Besoin (W/m²)', 'Pas (cm)', 'K_H (W/m²·K)', 'Surface (°C)', 'Écart σ (K)', 'Débit (L/h)', 'Boucles', 'Longueur / boucle (m)', 'ΔP boucle (kPa)', ...(fr ? ['Froid (W/m²)', 'Surface été (°C)', 'Froid couvert (kW)'] : [])],
        lignes: lignes.filter(l => !l.vide).map(l => [l.nom, l.etage, ZONES[l.zone][0], nf(l.Su, 1), nf(l.R, 3), nf(l.qEff, 0), nf(l.T * 100, 0), nf(l.K, 2), nf(l.TF, 1), nf(l.sigma, 1), nf(l.Q, 0), String(l.nb), nf(l.Lb, 0), nf(l.dpB, 1), ...(fr ? [nf(l.froid.qF, 0), nf(l.froid.TFf, 1), nf(l.froid.Pcouv, 2)] : [])]) },
      { titre: 'Réglage des boucles (débitmètres du collecteur)', entetes: ['Boucle', 'Étage', 'Longueur (m)', 'Débit (L/h)', 'Débit (L/min)', 'ΔP boucle (kPa)', 'ΔP à créer (kPa)', 'Kv de la vanne de boucle'],
        lignes: boucles.map(b => [b.rep, b.etage, nf(b.L, 0), nf(b.Q, 0), nf(b.Q / 60, 2), nf(b.dp, 1), nf(b.dpAj, 1), Number.isFinite(b.kv) ? nf(b.kv, 2) : 'grande ouverture']) },
      { titre: 'Collecteurs par étage', entetes: ['Étage', 'Boucles', 'Collecteurs', 'Débit (L/h)'], lignes: [...etages.entries()].map(([k, x]) => [k, String(x.n), String(Math.ceil(x.n / sorties)), nf(x.Q, 0)]) }],
      alertes,
      hypotheses: ['NF EN 1264-2, méthode simplifiée (système A, tubes noyés) : q = K_H · ΔθH, K_H = 6,7 · aB · aT^mT · aU^mU · aD^mD ; ΔθH = (θV − θR) / ln((θV − θi) / (θR − θi)).',
        'Courbe limite q = 8,92 (θF − θi)^1,1 : surface ≤ 29 °C en zone de séjour, 33 °C en salle d\'eau et en zone de rive (35 °C admis par la norme, 33 °C retenu par prudence).',
        `Pas : le plus large qui fournit le besoin au départ ${nf(Td, 1)} °C avec un écart ≥ ${nf(dTn, 1)} K (pas de 10 à 30 cm) ; les locaux moins exigeants ont un écart plus grand (débit réduit, NF EN 1264-3).`,
        `Débit avec les pertes vers le bas : m = A·q / (σ·cp) · (1 + R0/Ru + (θi − θu)/(q·Ru)), Ru = ${nf(Ru, 2)} m²·K/W (isolant sous les tubes) ; surface utile = ${nf(cov * 100, 0)} % de la surface.`,
        `Boucles ≤ ${nf(Lmax, 0)} m, liaisons au collecteur comprises ; ΔP par Darcy-Weisbach (tube ${tube[0]}, rugosité 0,007 mm) + 10 % de singularités ; collecteur et vanne de boucle ${nf(dpColl, 0)} kPa.`,
        'Réglage : Kv de la vanne de boucle = Q / √ΔP (bar) pour équilibrer sur la boucle la plus défavorisée ; le préréglage (tours, position) se lit sur l\'abaque du collecteur retenu (donnée fabricant).',
        ...(fr ? [`Rafraîchissement (NF EN 1264-5) : échange plancher → local ≈ 7 W/m²·K, surface ≥ max(19 °C, point de rosée + 1 K) ; point de rosée par la formule de Magnus.`] : [])],
      synthese: ok.length ? `${nf(Ptot, 1)} kW · ${boucles.length} boucles · surface ≤ ${nf(mT, 1)} °C` : 'Locaux à saisir',
    };
  }
  N.TYPES.plancher = {
    titre: 'Plancher chauffant / rafraîchissant (NF EN 1264)', icone: '♨️', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Par local : pas de pose, température de surface, densité de flux, débit, boucles (≤ 120 m), pertes de charge et réglage des débitmètres ; rafraîchissement et point de rosée.',
    champs: [{ g: 'Régime et ambiance' }, { k: 'circuit', l: 'Circuit du schéma de principe (régime repris)', t: 's', o: optCircuit, d: 'auto' },
      { k: 'Td', l: 'Température de départ (vide : 35 °C)', u: '°C', d: '' }, { k: 'dT', l: 'Écart départ − retour nominal (vide : 5 K)', u: 'K', d: '' }, { k: 'Ti', l: 'Température intérieure', u: '°C', d: 20 },
      { g: 'Constitution du plancher' }, { k: 'tube', l: 'Tube', t: 's', o: Object.entries(TUBES_PL).map(([k, x]) => [k, x[0]]), d: 'pe16' }, { k: 'su', l: 'Épaisseur de chape au-dessus des tubes', u: 'mm', d: 45 },
      { k: 'lambdaChape', l: 'Conductivité de la chape', u: 'W/m·K', d: 1.2 }, { k: 'Ru', l: 'Résistance de l\'isolant sous les tubes', u: 'm²·K/W', d: 2 }, { k: 'couverture', l: 'Part de surface couverte par les tubes', u: '%', d: 90 },
      { k: 'Lmax', l: 'Longueur maximale d\'une boucle', u: 'm', d: 120 }, { k: 'dpMaxBoucle', l: 'Perte de charge maximale d\'une boucle', u: 'kPa', d: 25 },
      { k: 'dpColl', l: 'Collecteur et vanne de boucle', u: 'kPa', d: 5 }, { k: 'sorties', l: 'Départs par collecteur au plus', d: 12 },
      { g: 'Rafraîchissement' }, { k: 'rafraich', l: 'Plancher rafraîchissant l\'été', t: 's', o: [['non', 'Non'], ['oui', 'Oui (réversible)']], d: 'non' },
      { k: 'TdF', l: 'Départ d\'eau froide (vide : 18 °C)', u: '°C', d: '', si: e => e.rafraich === 'oui' }, { k: 'dTF', l: 'Écart en froid (vide : 3 K)', u: 'K', d: '', si: e => e.rafraich === 'oui' },
      { k: 'TiF', l: 'Température intérieure l\'été', u: '°C', d: 26, si: e => e.rafraich === 'oui' }, { k: 'HR', l: 'Humidité relative de l\'ambiance', u: '%', d: 50, si: e => e.rafraich === 'oui' },
      { g: 'Locaux' }, { k: 'reprise', l: 'Locaux repris des bilans pièce par pièce', t: 's', o: [['toutes', 'Toutes les pièces des bilans'], ['listees', 'Seulement les locaux saisis (même nom)'], ['saisie', 'Aucune (saisie)']], d: 'toutes' },
      { k: 'locaux', l: 'Locaux (nom d\'une pièce des bilans : surface et besoins repris)', t: 'lignes', d: [],
        colonnes: [{ k: 'local', l: 'Local', t: 't', lst: (e, et) => N.lieuxEtude(et).salles }, { k: 'etage', l: 'Étage', t: 't', lst: (e, et) => N.lieuxEtude(et).etages }, { k: 'S', l: 'Surface (m²)' }, { k: 'P', l: 'Besoin de chauffage (kW)' },
          { k: 'Pfr', l: 'Besoin de froid (kW)', si: e => e.rafraich === 'oui' }, { k: 'zone', l: 'Zone', t: 's', o: Object.entries(ZONES).map(([k, x]) => [k, `${x[0]} — ${x[1]} °C`]) },
          { k: 'rev', l: 'Revêtement', t: 's', o: Object.entries(REVETEMENTS).map(([k, x]) => [k, `${x[0]} (${x[1]})`]) }, { k: 'R', l: 'R revêtement (m²·K/W, vide : selon le revêtement)' },
          { k: 'pas', l: 'Pas imposé (cm, vide : auto)' }, { k: 'Lc', l: 'Distance au collecteur (m)' }, { k: 'Tdessous', l: 'Température sous le plancher (°C, vide : chauffé)' }] }],
    calcul: calculerPlancher,
    lier(ctx) {
      const { e } = ctx;
      const x = circuitChoisi(ctx, e.circuit, ['plancher']);
      if (x) {
        const rc = x.c.rcC || x.c.rc, lib = libCircuit(ctx, x);
        if (rc && rc[0] > rc[1]) ctx.imposer({ Td: rc[0], dT: Math.round((rc[0] - rc[1]) * 10) / 10 }, lib);
        else if (rc) ctx.alertes.push(alerte('attention', `${lib} : régime ${rc[0]}/${rc[1]} °C, pas un régime de chauffage.`));
        if (x.c.rcF) ctx.imposer({ rafraich: 'oui', TdF: x.c.rcF[0], dTF: Math.round(Math.abs(x.c.rcF[1] - x.c.rcF[0]) * 10) / 10 }, lib);
      }
      const b = besoinsPieces(ctx, p => ({ S: Math.round(p.S * 10) / 10, P: Math.round(p.Pch * 100) / 100, Pfr: Math.round(p.Pfr * 100) / 100 }));
      lierLocaux(ctx, b, e.reprise || 'toutes', ['local', 'etage', 'S', 'P', 'Pfr', 'zone', 'rev', 'R', 'pas', 'Lc', 'Tdessous'], { zone: 'sejour', rev: 'carrelage', R: '', pas: '', Lc: 5, Tdessous: '' });
    },
  };

  /* =====================================================================================================
     2. Sélection de radiateurs (NF EN 442)
     ===================================================================================================== */
  // Radiateurs à panneaux acier : puissance moyenne indicative à ΔT 50 K pour 1 m de longueur et 600 mm de hauteur (W/m),
  // facteurs de hauteur ; ordres de grandeur génériques à remplacer par le catalogue retenu (NF EN 442)
  const TYPES_RAD = { 11: ['Type 11 (1 panneau, 1 ailette)', 830], 21: ['Type 21 (2 panneaux, 1 ailette)', 1200], 22: ['Type 22 (2 panneaux, 2 ailettes)', 1580], 33: ['Type 33 (3 panneaux, 3 ailettes)', 2250] };
  const HAUTEURS = { 300: 0.56, 400: 0.71, 450: 0.78, 500: 0.86, 600: 1, 750: 1.2, 900: 1.38 };
  const LONGUEURS = [400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1400, 1600, 1800, 2000, 2300, 2600, 3000];
  const facteurRad = (dT, n) => (dT > 0 ? (dT / 50) ** n : NaN);
  function choixRadiateur(P50, type, H) {
    const types = type && TYPES_RAD[type] ? [type] : ['11', '21', '22', '33'], fh = HAUTEURS[H] || 1;
    for (const t of types) { const wm = TYPES_RAD[t][1] * fh, Lmm = Math.ceil(P50 / wm * 1000), L = LONGUEURS.find(x => x >= Lmm); if (L && (L <= 1600 || types.length === 1 || t === '33')) return { type: t, L, Lmm, wm, P50L: wm * L / 1000, hors: !L }; }
    const t = types[types.length - 1], wm = TYPES_RAD[t][1] * fh, Lmm = Math.ceil(P50 / wm * 1000);
    return { type: t, L: LONGUEURS.find(x => x >= Lmm) || Lmm, Lmm, wm, P50L: wm * (LONGUEURS.find(x => x >= Lmm) || Lmm) / 1000, hors: Lmm > 3000 };
  }
  function calculerRadiateurs(e) {
    const alertes = [], Td = val(e.Td, 70), Tr = val(e.Tr, 50), Ti0 = val(e.Ti, 20), n = val(e.n, 1.3), marge = 1 + val(e.marge, 0) / 100, dpRob = val(e.dpRobinet, 10), dpTe = val(e.dpTe, 3);
    if (!(Td > Tr)) alertes.push(alerte('erreur', `Régime ${nf(Td, 0)}/${nf(Tr, 0)} °C : le départ doit être plus chaud que le retour.`));
    const w = C.eau((Td + Tr) / 2);
    const lignes = (e.locaux || []).filter(x => x && (x.local || num(x.P) > 0)).map((x, i) => {
      const nom = x.local || `Local ${i + 1}`, P = num(x.P) * marge, nb = Math.max(1, Math.round(val(x.nb, 1))), Ti = val(x.Ti, Ti0), H = String(val(x.H, 600));
      const dT = dtlmAmbiance(Td, Tr, Ti), F = facteurRad(dT, n), Pu = P / nb, P50 = Pu * 1000 / F, ch = Number.isFinite(P50) && P50 > 0 ? choixRadiateur(P50, x.type, H) : null;
      const Q = Pu * 1000 / (w.rho * w.cp * (Td - Tr)) * 3600 * 1000; // L/h par radiateur
      const kvR = Kv(Q / 1000, dpRob), kvT = Kv(Q / 1000, dpTe), Preel = ch ? ch.P50L * F / 1000 : NaN;
      if (!(P > 0)) alertes.push(alerte('attention', `${nom} : besoin manquant.`));
      if (ch && ch.hors) alertes.push(alerte('attention', `${nom} : ${nf(P50 / 1000, 2)} kW à ΔT 50 par radiateur, au-delà des longueurs courantes : augmenter le nombre de radiateurs ou la hauteur.`));
      if (!(Tr > Ti)) alertes.push(alerte('erreur', `${nom} : retour ${nf(Tr, 0)} °C non supérieur à l'ambiance ${nf(Ti, 0)} °C.`));
      return { nom, etage: x.etage || '', P, nb, Ti, H, dT, F, Pu, P50, ch, Q, kvR, kvT, Preel, auto: !!x._auto };
    });
    const ok = lignes.filter(l => l.P > 0 && l.ch);
    if (!lignes.length) alertes.push(alerte('attention', 'Ajoutez les locaux et leurs besoins, ou un bilan pièce par pièce / des terminaux « radiateur » dans l\'étude pour les reprendre.'));
    const Ptot = ok.reduce((a, l) => a + l.P, 0), nbTot = ok.reduce((a, l) => a + l.nb, 0), Qtot = ok.reduce((a, l) => a + l.Q * l.nb, 0), P50tot = ok.reduce((a, l) => a + l.P50 * l.nb, 0) / 1000;
    const F0 = ok.length ? ok[0].F : facteurRad(dtlmAmbiance(Td, Tr, Ti0), n);
    if (Td - Tr < 10 && Td > Tr) alertes.push(alerte('attention', `Écart de ${nf(Td - Tr, 0)} K seulement : débits élevés, réseau et robinets à vérifier.`));
    if (Td <= 55 && F0 < 0.5) alertes.push(alerte('attention', `Basse température (facteur ${nf(F0, 2)}) : radiateurs plus de deux fois plus grands qu'à ΔT 50 ; vérifier la place disponible ou préférer un plancher chauffant.`));
    if (ok.length) alertes.push(alerte('ok', `${nbTot} radiateur(s) pour ${nf(Ptot, 2)} kW au régime ${nf(Td, 0)}/${nf(Tr, 0)} °C : ${nf(P50tot, 2)} kW au catalogue à ΔT 50 (facteur ${nf(F0, 3)}), ${nf(Qtot, 0)} L/h.`));
    // Modèle retenu (fiche du fabricant) : nombre de radiateurs de ce modèle par local et contenance en eau
    const P50f = num(e.P50fab), Vf = num(e.Vfab), fab = P50f > 0 ? ok.map(l => { const Pm = P50f * l.F, nbM = Math.max(1, Math.ceil(l.P * 1000 / Pm - 1e-9)); return { nom: l.nom, P: l.P, Pm, nbM, nb: l.nb, V: nbM * Vf }; }) : [];
    const nbFab = fab.reduce((a, x) => a + x.nbM, 0), Vrad = fab.reduce((a, x) => a + x.V, 0);
    if (fab.length) {
      const plus = fab.filter(x => x.nbM > x.nb);
      alertes.push(alerte(plus.length ? 'attention' : 'ok', `Modèle retenu (${nf(P50f, 0)} W à ΔT 50${num(e.Hfab) > 0 ? `, ${nf(num(e.Hfab), 0)} mm` : ''}${num(e.Lfab) > 0 ? ` × ${nf(num(e.Lfab), 0)} mm` : ''}) : ${nbFab} radiateur(s)${Vf > 0 ? `, ${nf(Vrad, 1)} L d'eau` : ''}${plus.length ? ` ; plus de radiateurs que prévu dans ${plus.map(x => `${x.nom} (${x.nbM} pour ${x.nb})`).join(', ')}` : ''}.`));
    }
    alertes.push(alerte('attention', 'Dimensions indicatives (puissances moyennes de radiateurs à panneaux) : choisir au catalogue du fabricant la puissance à ΔT 50 indiquée ; préréglage des robinets thermostatiques à lire sur l\'abaque du fabricant pour le Kv donné.'));
    return {
      valeurs: { P: Ptot, P50: P50tot, nb: nbTot, Q: Qtot, F: F0, nbFab, Vrad, locaux: ok.map(l => ({ local: l.nom, nb: l.nb, P50: l.P50, type: l.ch.type, H: +l.H, L: l.ch.L, Q: l.Q, kv: l.kvR })) },
      resume: [['Régime', `${nf(Td, 0)}/${nf(Tr, 0)} °C, ambiance ${nf(Ti0, 0)} °C`], ['Facteur de correction (ΔT/50)^n', `${nf(F0, 3)} (n = ${nf(n, 2)})`], ['Besoin total', `${nf(Ptot, 2)} kW`], ['Puissance au catalogue à ΔT 50', `${nf(P50tot, 2)} kW`],
        ['Radiateurs', String(nbTot)], ['Débit total', `${nf(Qtot, 0)} L/h`]],
      tableaux: [{ titre: 'Radiateurs par local', entetes: ['Local', 'Étage', 'Besoin (W)', 'Radiateurs', 'ΔT eau − air (K)', 'Facteur', 'Puissance requise à ΔT 50 (W)', 'Type', 'Hauteur (mm)', 'Longueur (mm)', 'Puissance au régime (W)', 'Débit (L/h)', 'Kv robinet thermostatique', 'Kv té de réglage'],
        lignes: ok.map(l => [l.nom, l.etage, nf(l.P * 1000, 0), String(l.nb), nf(l.dT, 1), nf(l.F, 3), nf(l.P50, 0), l.ch.type, l.H, String(l.ch.L), nf(l.Preel, 0), nf(l.Q, 1), nf(l.kvR, 3), nf(l.kvT, 3)]) },
        ...(fab.length ? [{ titre: 'Modèle retenu (fiche du fabricant)', entetes: ['Local', 'Besoin (W)', 'Puissance du modèle au régime (W)', 'Radiateurs nécessaires', 'Prévus', 'Contenance (L)'],
          lignes: [...fab.map(x => [x.nom, nf(x.P * 1000, 0), nf(x.Pm, 0), String(x.nbM), String(x.nb), Vf > 0 ? nf(x.V, 1) : '—']), ['Total', '', '', String(nbFab), String(nbTot), Vf > 0 ? nf(Vrad, 1) : '—']] }] : [])],
      alertes,
      hypotheses: ['NF EN 442 : Φ = Φ50 · (ΔT / 50)^n, ΔT = (θ1 − θ2) / ln((θ1 − θi) / (θ2 − θi)) (écart logarithmique), n ≈ 1,3 pour les radiateurs à panneaux.',
        'Longueurs : puissance moyenne indicative à ΔT 50 de radiateurs à panneaux acier (W/m pour 600 mm : 11 ≈ 830, 21 ≈ 1 200, 22 ≈ 1 580, 33 ≈ 2 250 ; hauteur : 300 mm × 0,56 … 900 mm × 1,38), longueurs courantes de 400 à 3 000 mm ; type automatique : le plus mince qui tient en 1,6 m.',
        `Débit par radiateur au régime nominal : Q = P / (ρ·cp·(θ1 − θ2)) ; Kv = Q / √ΔP (bar), robinet thermostatique à ${nf(dpRob, 0)} kPa (bande proportionnelle 2 K), té de réglage à ${nf(dpTe, 0)} kPa.`, ...(marge > 1 ? [`Besoins majorés de ${nf((marge - 1) * 100, 0)} %.`] : [])],
      synthese: ok.length ? `${nbTot} radiateurs · ${nf(Ptot, 1)} kW · ${nf(P50tot, 1)} kW à ΔT 50` : 'Locaux à saisir',
    };
  }
  N.TYPES.radiateurs = {
    titre: 'Sélection de radiateurs (NF EN 442)', icone: '🔥', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Par local : besoin, régime réel, puissance à ΔT 50 corrigée par (ΔT/50)^n, dimensions indicatives (types 11 à 33), débits et Kv des robinets thermostatiques et tés de réglage.',
    champs: [{ g: 'Régime' }, { k: 'circuit', l: 'Circuit du schéma de principe (régime repris)', t: 's', o: optCircuit, d: 'auto' },
      { k: 'Td', l: 'Température de départ (vide : 70 °C)', u: '°C', d: '' }, { k: 'Tr', l: 'Température de retour (vide : 50 °C)', u: '°C', d: '' }, { k: 'Ti', l: 'Température intérieure', u: '°C', d: 20 },
      { k: 'n', l: 'Exposant n des radiateurs', d: 1.3 }, { k: 'marge', l: 'Majoration des besoins (relance)', u: '%', d: 0 },
      { k: 'dpRobinet', l: 'ΔP du robinet thermostatique', u: 'kPa', d: 10 }, { k: 'dpTe', l: 'ΔP du té de réglage', u: 'kPa', d: 3 },
      { g: 'Modèle retenu (fiche du fabricant)' }, { k: 'P50fab', l: 'Puissance du modèle à ΔT 50 (vide : dimensions indicatives seulement)', u: 'W', d: '' },
      { k: 'Hfab', l: 'Hauteur du modèle', u: 'mm', d: '' }, { k: 'Lfab', l: 'Longueur du modèle', u: 'mm', d: '' }, { k: 'Vfab', l: 'Contenance en eau d\'un radiateur', u: 'L', d: '' },
      { g: 'Locaux' }, { k: 'reprise', l: 'Locaux repris de l\'étude (terminaux « radiateur », sinon bilans pièce par pièce)', t: 's', o: [['toutes', 'Toutes les pièces'], ['listees', 'Seulement les locaux saisis (même nom)'], ['saisie', 'Aucune (saisie)']], d: 'toutes' },
      { k: 'locaux', l: 'Locaux', t: 'lignes', d: [],
        colonnes: [{ k: 'local', l: 'Local', t: 't', lst: (e, et) => N.lieuxEtude(et).salles }, { k: 'etage', l: 'Étage', t: 't', lst: (e, et) => N.lieuxEtude(et).etages }, { k: 'P', l: 'Besoin (kW)' }, { k: 'nb', l: 'Nombre de radiateurs' },
          { k: 'type', l: 'Type', t: 's', o: [['', 'Automatique'], ...Object.entries(TYPES_RAD).map(([k, x]) => [k, x[0]])] }, { k: 'H', l: 'Hauteur', t: 's', o: Object.keys(HAUTEURS).map(h => [h, `${h} mm`]) }, { k: 'Ti', l: 'Température du local (°C, vide : générale)' }] }],
    calcul: calculerRadiateurs,
    lier(ctx) {
      const { e } = ctx;
      const x = circuitChoisi(ctx, e.circuit, ['radiateurs']);
      if (x) { const rc = x.c.rcC || x.c.rc; if (rc && rc[0] > rc[1]) ctx.imposer({ Td: rc[0], Tr: rc[1] }, libCircuit(ctx, x)); }
      // Terminaux « radiateur » de l'étude (puissance et nombre par local), sinon besoins des bilans pièce par pièce
      const b = besoinsPieces(ctx, p => ({ P: Math.round(p.Pch * 100) / 100 }));
      (ctx.notes || []).filter(n => n.type === 'terminaux').forEach(n => {
        const r = ctx.calculer(n), par = new Map();
        ((r.valeurs || {}).lignes || []).filter(l => l.type === 'radiateur' && l.Pch > 0).forEach(l => { const k = norm(l.local || l.rep); const y = par.get(k) || { nom: l.local || l.rep, P: 0, nb: 0 }; y.P += l.Pch * (l.n || 1); y.nb += l.n || 1; par.set(k, y); });
        par.forEach((y, k) => b.set(k, { nom: y.nom, etage: (b.get(k) || {}).etage, vals: { P: Math.round(y.P * 100) / 100, nb: y.nb }, src: ctx.libelle(n) }));
      });
      lierLocaux(ctx, b, e.reprise || 'toutes', ['local', 'etage', 'P', 'nb', 'type', 'H', 'Ti'], { nb: 1, type: '', H: '600', Ti: '' });
    },
  };

  /* =====================================================================================================
     3. Plafonds rayonnants / poutres froides
     ===================================================================================================== */
  // Puissance frigorifique usuelle côté eau (sensible) par K d'écart entre l'ambiance et l'eau (moyenne) :
  // [libellé, coefficient, unité de surface (m² actif ou m de poutre), exposant] — ordres de grandeur (NF EN 14240 plafonds, NF EN 14518 poutres passives, NF EN 15116 poutres actives)
  const SYSTEMES = { plafond: ['Plafond rayonnant froid (panneaux métalliques)', 8, 'm²', 1.0], passive: ['Poutre froide passive', 30, 'm', 1.0], active: ['Poutre froide active (induction d\'air primaire)', 45, 'm', 1.0] };
  function calculerPlafonds(e) {
    const alertes = [], sy = SYSTEMES[e.systeme] ? e.systeme : 'plafond', S0 = SYSTEMES[sy], Td = val(e.Td, 16), Tr = val(e.Tr, 19), Ti0 = val(e.Ti, 26), HR = val(e.HR, 50);
    const k = vide(e.coef) ? S0[1] : num(e.coef), Tsouf = val(e.Tsouf, 17), TrosAir = val(e.TrosAir, 11), occupe = Math.min(0.9, Math.max(0.2, val(e.occupation, 70) / 100));
    const Twm = (Td + Tr) / 2, Tros = rosee(Ti0, HR), marge = Td - Tros, xa = humAbs(Ti0, HR), xs = xRosee(TrosAir), w = C.eau(Twm);
    if (!(Tr > Td)) alertes.push(alerte('erreur', `Régime ${nf(Td, 1)}/${nf(Tr, 1)} °C : le retour doit être plus chaud que le départ (eau froide).`));
    if (marge < 0) alertes.push(alerte('erreur', `Condensation : départ d'eau ${nf(Td, 1)} °C sous le point de rosée de l'ambiance (${nf(Tros, 1)} °C à ${nf(Ti0, 0)} °C et ${nf(HR, 0)} % HR). Relever le départ ou déshumidifier l'air primaire.`));
    else if (marge < 1) alertes.push(alerte('erreur', `Marge au point de rosée de ${nf(marge, 1)} K seulement (< 1 K) : risque de condensation ; départ régulé sur le point de rosée et détecteurs de condensation indispensables.`));
    else if (marge < 2) alertes.push(alerte('attention', `Marge au point de rosée de ${nf(marge, 1)} K : départ régulé sur le point de rosée, détecteurs de condensation sur les départs.`));
    else alertes.push(alerte('ok', `Point de rosée de l'ambiance ${nf(Tros, 1)} °C : marge de ${nf(marge, 1)} K avec le départ à ${nf(Td, 1)} °C.`));
    if (TrosAir >= Tros) alertes.push(alerte('attention', `Air primaire au point de rosée ${nf(TrosAir, 1)} °C, pas plus sec que l'ambiance (${nf(Tros, 1)} °C) : il ne reprend pas les apports latents ; l'ambiance s'humidifiera.`));
    const dT = Ti0 - Twm, qU = dT > 0 ? k * dT ** S0[3] : 0;
    const lignes = (e.locaux || []).filter(x => x && (x.local || num(x.Pfr) > 0)).map((x, i) => {
      const nom = x.local || `Local ${i + 1}`, S = num(x.S), Pfr = num(x.Pfr), Qair = num(x.Qair);
      const Pair = Qair > 0 ? 0.34 * Qair * Math.max(0, Ti0 - Tsouf) / 1000 : 0, Peau = Math.max(0, Pfr - Pair), besoin = qU > 0 ? Peau * 1000 / qU : NaN;
      const dispo = sy === 'plafond' ? S * occupe : NaN, lat = Qair > 0 ? 0.83 * Qair * Math.max(0, xa - xs) / 1000 : 0, Q = Peau * 1000 / (w.rho * w.cp * Math.max(0.1, Tr - Td)) * 3600 * 1000;
      if (sy === 'plafond' && besoin > dispo) alertes.push(alerte('attention', `${nom} : ${nf(besoin, 1)} m² actifs nécessaires pour ${nf(dispo, 1)} m² disponibles (${nf(occupe * 100, 0)} % du plafond) : complément à prévoir (air primaire plus froid, ventilo-convecteur).`));
      if (sy !== 'plafond' && S > 0 && besoin > S / 2.5) alertes.push(alerte('attention', `${nom} : ${nf(besoin, 1)} m de poutres pour ${nf(S, 0)} m² (plus d'1 m pour 2,5 m²) : implantation et vitesse d'air dans la zone d'occupation à vérifier.`));
      if (S > 0 && Pfr * 1000 / S > 100) alertes.push(alerte('attention', `${nom} : ${nf(Pfr * 1000 / S, 0)} W/m², au-delà de ce que reprennent d'ordinaire ces systèmes (≈ 60 à 100 W/m²).`));
      return { nom, etage: x.etage || '', S, Pfr, Qair, Pair, Peau, besoin, dispo, lat, Q };
    });
    if (!lignes.length) alertes.push(alerte('attention', 'Ajoutez les locaux (surface, froid sensible, air primaire), ou un bilan pièce par pièce dans l\'étude pour les reprendre.'));
    const Peau = lignes.reduce((a, l) => a + l.Peau, 0), Pair = lignes.reduce((a, l) => a + l.Pair, 0), Q = lignes.reduce((a, l) => a + l.Q, 0), Qair = lignes.reduce((a, l) => a + l.Qair, 0), besoin = lignes.reduce((a, l) => a + (l.besoin || 0), 0), lat = lignes.reduce((a, l) => a + l.lat, 0);
    if (!(qU > 0)) alertes.push(alerte('erreur', 'Eau plus chaude que l\'ambiance : aucune puissance frigorifique.'));
    return {
      valeurs: { qU, Tros, marge, Peau, Pair, Q, Qair, besoin, lat, Twm },
      resume: [['Système', S0[0]], ['Régime d\'eau', `${nf(Td, 1)}/${nf(Tr, 1)} °C (moyenne ${nf(Twm, 1)} °C), ambiance ${nf(Ti0, 0)} °C · ${nf(HR, 0)} % HR`], ['Puissance unitaire', `${nf(qU, 0)} W/${S0[2]} (${nf(k, 1)} W/${S0[2]}·K × ${nf(dT, 1)} K)`],
        ['Point de rosée de l\'ambiance', `${nf(Tros, 1)} °C · marge ${nf(marge, 1)} K`], ['Froid repris par l\'eau', `${nf(Peau, 2)} kW · ${nf(Q, 0)} L/h`], ['Froid repris par l\'air primaire', `${nf(Pair, 2)} kW sensibles (${nf(Qair, 0)} m³/h à ${nf(Tsouf, 0)} °C) · ${nf(lat, 2)} kW latents`],
        [sy === 'plafond' ? 'Surface active' : 'Longueur de poutres', `${nf(besoin, 1)} ${S0[2]}`]],
      tableaux: [{ titre: 'Locaux', entetes: ['Local', 'Étage', 'Surface (m²)', 'Froid sensible (kW)', 'Air primaire (m³/h)', 'Repris par l\'air (kW)', 'Repris par l\'eau (kW)', sy === 'plafond' ? 'Surface active (m²)' : 'Poutres (m)', 'Débit d\'eau (L/h)', 'Latent repris par l\'air (kW)'],
        lignes: lignes.map(l => [l.nom, l.etage, nf(l.S, 1), nf(l.Pfr, 2), nf(l.Qair, 0), nf(l.Pair, 2), nf(l.Peau, 2), nf(l.besoin, 1), nf(l.Q, 0), nf(l.lat, 2)]) }],
      alertes,
      hypotheses: [`Puissance côté eau ≈ ${nf(k, 1)} W/${S0[2]}·K × (θi − θeau moyenne) : ordre de grandeur générique (${S0[0].toLowerCase()}), à remplacer par la courbe d'essai du fabricant (NF EN 14240 / 14518 / 15116).`,
        'Point de rosée par la formule de Magnus ; départ d\'eau à maintenir au-dessus (marge ≥ 1 à 2 K), régulation du départ sur le point de rosée et détecteurs de condensation.',
        `Air primaire : sensible 0,34 × q × (θi − θsoufflage) ; latent 0,83 × q × (x ambiance − x soufflage) (g/kg), soufflage au point de rosée ${nf(TrosAir, 1)} °C.`, ...(sy === 'plafond' ? [`Surface disponible : ${nf(occupe * 100, 0)} % du plafond (éclairage, bouches, trappes).`] : [])],
      synthese: lignes.length ? `${nf(Peau + Pair, 1)} kW · rosée ${nf(Tros, 1)} °C · marge ${nf(marge, 1)} K` : `Rosée ${nf(Tros, 1)} °C · marge ${nf(marge, 1)} K`,
    };
  }
  N.TYPES.plafonds = {
    titre: 'Plafonds rayonnants / poutres froides', icone: '❄️', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Puissance par m² ou par m, température moyenne d\'eau, point de rosée de l\'ambiance (Magnus) et marge, air primaire (sensible et latent), alerte de condensation.',
    champs: [{ g: 'Système' }, { k: 'systeme', l: 'Système', t: 's', o: Object.entries(SYSTEMES).map(([k, x]) => [k, x[0]]), d: 'plafond' },
      { k: 'coef', l: 'Puissance par K d\'écart (vide : usuelle ; fiche du fabricant)', u: 'W/(m² ou m)·K', d: '' }, { k: 'occupation', l: 'Part du plafond utilisable (plafond rayonnant)', u: '%', d: 70, si: e => (e.systeme || 'plafond') === 'plafond' },
      { g: 'Eau et ambiance' }, { k: 'circuit', l: 'Circuit du schéma de principe (régime repris)', t: 's', o: optCircuit, d: 'auto' },
      { k: 'Td', l: 'Départ d\'eau (vide : 16 °C)', u: '°C', d: '' }, { k: 'Tr', l: 'Retour d\'eau (vide : 19 °C)', u: '°C', d: '' },
      { k: 'Ti', l: 'Température de l\'ambiance', u: '°C', d: 26 }, { k: 'HR', l: 'Humidité relative de l\'ambiance', u: '%', d: 50 },
      { g: 'Air primaire' }, { k: 'Tsouf', l: 'Température de soufflage', u: '°C', d: 17 }, { k: 'TrosAir', l: 'Point de rosée de l\'air soufflé (déshumidifié)', u: '°C', d: 11 },
      { g: 'Locaux' }, { k: 'reprise', l: 'Locaux repris des bilans pièce par pièce', t: 's', o: [['toutes', 'Toutes les pièces des bilans'], ['listees', 'Seulement les locaux saisis (même nom)'], ['saisie', 'Aucune (saisie)']], d: 'toutes' },
      { k: 'locaux', l: 'Locaux', t: 'lignes', d: [],
        colonnes: [{ k: 'local', l: 'Local', t: 't', lst: (e, et) => N.lieuxEtude(et).salles }, { k: 'etage', l: 'Étage', t: 't', lst: (e, et) => N.lieuxEtude(et).etages }, { k: 'S', l: 'Surface (m²)' }, { k: 'Pfr', l: 'Froid sensible (kW)' }, { k: 'Qair', l: 'Air primaire (m³/h)' }] }],
    calcul: calculerPlafonds,
    lier(ctx) {
      const { e } = ctx;
      const x = circuitChoisi(ctx, e.circuit, ['plafond']);
      if (x) { const rc = x.c.rcF || x.c.rc; if (rc && rc[0] < rc[1]) ctx.imposer({ Td: rc[0], Tr: rc[1] }, libCircuit(ctx, x)); }
      let cl = null; try { cl = Ln().climatEtude(ctx.etude); } catch (err) { cl = null; }
      if (cl && cl.Tete >= 30 && val(e.HR, 50) < 50) ctx.alertes.push(alerte('info', `Climat de l'étude (${cl.libelle}) : vérifier l'humidité intérieure retenue en pointe (apports latents, air neuf).`));
      const b = besoinsPieces(ctx, p => ({ S: Math.round(p.S * 10) / 10, Pfr: Math.round(p.Pfr * 100) / 100, Qair: Math.round(p.Qair) }));
      (ctx.notes || []).filter(n => n.type === 'terminaux').forEach(n => {
        const r = ctx.calculer(n), par = new Map();
        ((r.valeurs || {}).lignes || []).filter(l => l.type === 'poutre' && l.Pfr > 0).forEach(l => { const k = norm(l.local || l.rep); par.set(k, (par.get(k) || 0) + l.Pfr * (l.n || 1)); });
        par.forEach((P, k) => { const y = b.get(k); if (y) y.vals = { ...y.vals, Pfr: Math.round(P * 100) / 100 }, y.src = ctx.libelle(n); });
      });
      lierLocaux(ctx, b, e.reprise || 'toutes', ['local', 'etage', 'S', 'Pfr', 'Qair'], {});
    },
  };

  /* =====================================================================================================
     4. Échangeur à plaques
     ===================================================================================================== */
  // Fluides : [libellé, ρ (kg/m³), cp (kJ/kg·K), facteur sur le U de l'eau]
  const FLUIDES_ECH = { eau: ['Eau', 990, 4.18, 1], mpg30: ['Eau + monopropylène glycol 30 %', 1030, 3.83, 0.75], meg30: ['Eau + monoéthylène glycol 30 %', 1045, 3.70, 0.8], mpg40: ['Eau + monopropylène glycol 40 %', 1040, 3.68, 0.65] };
  function calculerEchangeur(e) {
    const alertes = [], P = val(e.P, 100), Te1 = val(e.Te1, 80), Ts1 = val(e.Ts1, 60), Te2 = val(e.Te2, 50), Ts2 = val(e.Ts2, 70);
    const f1 = FLUIDES_ECH[e.fluide1] || FLUIDES_ECH.eau, f2 = FLUIDES_ECH[e.fluide2] || FLUIDES_ECH.eau, U = vide(e.U) ? 4000 * Math.min(f1[3], f2[3]) : num(e.U), marge = 1 + val(e.encrassement, 10) / 100;
    const chaudP = Te1 > Te2, [Thi, Tho, Tci, Tco] = chaudP ? [Te1, Ts1, Te2, Ts2] : [Te2, Ts2, Te1, Ts1];
    const d1 = Thi - Tco, d2 = Tho - Tci, dtlm = d1 > 0 && d2 > 0 ? (Math.abs(d1 - d2) < 1e-6 ? d1 : (d1 - d2) / Math.log(d1 / d2)) : NaN, pinc = Math.min(d1, d2);
    const dT1 = Math.abs(Te1 - Ts1), dT2 = Math.abs(Ts2 - Te2), Q1 = dT1 > 0 ? P / (f1[1] * f1[2] * dT1) * 3600 : NaN, Q2 = dT2 > 0 ? P / (f2[1] * f2[2] * dT2) * 3600 : NaN;
    const A = dtlm > 0 ? P * 1000 / (U * dtlm) * marge : NaN;
    const C1 = Q1 * f1[1] * f1[2] / 3600, C2 = Q2 * f2[1] * f2[2] / 3600, Cmin = Math.min(C1, C2), eps = P / (Cmin * (Thi - Tci)), NTU = U * (A / marge) / (Cmin * 1000);
    if (!(dT1 > 0) || !(dT2 > 0)) alertes.push(alerte('erreur', 'Écarts de température nuls : saisir entrée et sortie différentes de chaque côté.'));
    if (chaudP ? !(Te1 > Ts1 && Ts2 > Te2) : !(Ts1 > Te1 && Te2 > Ts2)) alertes.push(alerte('erreur', 'Sens des échanges incohérent : le fluide chaud doit se refroidir et le fluide froid se réchauffer.'));
    if (!(dtlm > 0)) alertes.push(alerte('erreur', `Températures impossibles même à contre-courant (écarts ${nf(d1, 1)} et ${nf(d2, 1)} K aux extrémités).`));
    else {
      if (pinc < 1) alertes.push(alerte('erreur', `Pincement de ${nf(pinc, 1)} K (< 1 K) : échangeur démesuré, régimes à revoir.`));
      else if (pinc < 2) alertes.push(alerte('attention', `Pincement de ${nf(pinc, 1)} K : échangeur très grand ; 2 à 5 K usuels.`));
      if (Tco > Tho) alertes.push(alerte('attention', `Températures croisées (sortie froide ${nf(Tco, 1)} °C > sortie chaude ${nf(Tho, 1)} °C) : contre-courant strict indispensable (échangeur à plaques), NTU ${nf(NTU, 1)}.`));
      else alertes.push(alerte('ok', `Échangeur à contre-courant : ΔTLM ${nf(dtlm, 1)} K, pincement ${nf(pinc, 1)} K, surface ≈ ${nf(A, 1)} m² (U ${nf(U, 0)} W/m²·K, encrassement ${nf((marge - 1) * 100, 0)} %).`));
    }
    const dp1 = val(e.dp1, 30), dp2 = val(e.dp2, 30);
    if (dp1 > 60 || dp2 > 60) alertes.push(alerte('attention', 'Perte de charge supérieure à 60 kPa : vérifier la consommation des pompes ; 20 à 50 kPa par côté sont usuels.'));
    // Échangeur retenu (fiche du fabricant) : puissance et surface face au besoin
    const Pf = num(e.Pfab), Af = num(e.Afab), nPl = Math.round(num(e.nPlaques));
    if (Pf > 0) alertes.push(alerte(Pf >= P * 0.98 ? 'ok' : 'erreur', `Échangeur retenu : ${nf(Pf, 1)} kW pour ${nf(P, 1)} kW à échanger${Pf >= P * 0.98 ? '' : ' : insuffisant'}${Af > 0 ? ` ; ${nf(Af, 2)} m²${nPl > 0 ? ` (${nPl} plaques)` : ''} pour ≈ ${nf(A, 1)} m² estimés` : ''}.`));
    if (Pf > 0) alertes.push(alerte('info', 'Pertes de charge reprises de la sélection du fabricant : vérifier que ses régimes sont ceux de ce calcul.'));
    else alertes.push(alerte('attention', 'Surface et pertes de charge indicatives : sélection (nombre de plaques, ΔP réelles) à faire avec le logiciel du fabricant aux régimes ci-dessus.'));
    const lib1 = e.lib1 || 'Primaire', lib2 = e.lib2 || 'Secondaire';
    return {
      valeurs: { P, dtlm, pinc, A, U, Q1, Q2, dp1, dp2, eps, NTU, croise: Tco > Tho, Pfab: Pf, Afab: Af, nPlaques: nPl },
      resume: [['Puissance', `${nf(P, 1)} kW`], [lib1, `${nf(Te1, 1)} → ${nf(Ts1, 1)} °C · ${nf(Q1, 2)} m³/h · ${f1[0]}`], [lib2, `${nf(Te2, 1)} → ${nf(Ts2, 1)} °C · ${nf(Q2, 2)} m³/h · ${f2[0]}`],
        ['ΔTLM (contre-courant)', `${nf(dtlm, 2)} K`], ['Pincement', `${nf(pinc, 1)} K`], ['Surface indicative', `${nf(A, 1)} m² (U ${nf(U, 0)} W/m²·K)`], ['Efficacité / NTU', `${nf(eps * 100, 0)} % · ${nf(NTU, 2)}`],
        ['Pertes de charge retenues', `${nf(dp1, 0)} kPa (${lib1.toLowerCase()}) · ${nf(dp2, 0)} kPa (${lib2.toLowerCase()})`],
        ...(Pf > 0 ? [['Échangeur retenu', `${nf(Pf, 1)} kW${Af > 0 ? ` · ${nf(Af, 2)} m²` : ''}${nPl > 0 ? ` · ${nPl} plaques` : ''}`]] : [])],
      tableaux: [{ titre: 'Côtés de l\'échangeur', entetes: ['Côté', 'Fluide', 'Entrée (°C)', 'Sortie (°C)', 'Écart (K)', 'Débit (m³/h)', 'ΔP retenue (kPa)'],
        lignes: [[lib1, f1[0], nf(Te1, 1), nf(Ts1, 1), nf(dT1, 1), nf(Q1, 2), nf(dp1, 0)], [lib2, f2[0], nf(Te2, 1), nf(Ts2, 1), nf(dT2, 1), nf(Q2, 2), nf(dp2, 0)]] }],
      alertes,
      hypotheses: ['Contre-courant : ΔTLM = (ΔT1 − ΔT2) / ln(ΔT1/ΔT2), ΔT1 = entrée chaude − sortie froide, ΔT2 = sortie chaude − entrée froide ; pincement = min(ΔT1, ΔT2).',
        `Surface A = P / (U · ΔTLM) × (1 + encrassement) ; U usuel eau/eau ≈ 4 000 W/m²·K (réduit pour l'eau glycolée), ordre de grandeur à confirmer par le fabricant.`,
        'Débits Q = P / (ρ · cp · ΔT) de chaque côté ; efficacité ε = P / (Cmin · (θ entrée chaude − θ entrée froide)), NTU = U·A / Cmin.', 'Pertes de charge : valeurs de conception saisies (20 à 50 kPa par côté usuels), à remplacer par celles de la sélection.'],
      synthese: `${nf(P, 0)} kW · ΔTLM ${nf(dtlm, 1)} K · pincement ${nf(pinc, 1)} K · ≈ ${nf(A, 1)} m²`,
    };
  }
  // Échangeurs du schéma de principe : sous-station (générateur échangeur), découplage par échangeur, circuits sur échangeur
  function optEchangeurs(et, v) {
    const out = [['auto', 'Automatique (premier échangeur de l\'étude)'], ['', 'Saisie']];
    ((et && et.notes) || []).forEach((n, i) => {
      if (n.type !== 'pid') return;
      const es = n.entrees || {}, lib = `N${i + 1} — ${n.titre}`;
      if (/^echangeur/.test(es.generateur || '') || (es.generateurs || []).some(x => x && /^echangeur/.test(x.type || ''))) out.push([`${n.id}|ss`, `${lib} : sous-station`]);
      if (es.bouteille === 'echangeur') out.push([`${n.id}|dec`, `${lib} : échangeur de découplage`]);
      (es.circuits || []).forEach(c => { if (c && c.rep && c.regulation === 'echangeur') out.push([`${n.id}|c|${c.rep}`, `${lib} : circuit ${c.rep}`]); });
    });
    if (v && !out.some(o => o[0] === v)) out.push([v, v]);
    return out;
  }
  N.TYPES.echangeurPlaques = {
    titre: 'Échangeur à plaques', icone: '🔀', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Puissance, régimes primaire et secondaire, ΔTLM, pincement, surface indicative, débits, pertes de charge et contrôle des températures croisées.',
    champs: [{ g: 'Échangeur de l\'étude' }, { k: 'source', l: 'Échangeur du schéma de principe (puissance et régimes repris)', t: 's', o: (e, et) => optEchangeurs(et, e && e.source), d: 'auto' },
      { g: 'Puissance et régimes' }, { k: 'P', l: 'Puissance échangée (vide : 100 kW)', u: 'kW', d: '' },
      { k: 'lib1', l: 'Nom du côté 1', t: 't', d: 'Primaire' }, { k: 'fluide1', l: 'Fluide du côté 1', t: 's', o: Object.entries(FLUIDES_ECH).map(([k, x]) => [k, x[0]]), d: 'eau' },
      { k: 'Te1', l: 'Côté 1 : entrée (vide : 80 °C)', u: '°C', d: '' }, { k: 'Ts1', l: 'Côté 1 : sortie (vide : 60 °C)', u: '°C', d: '' },
      { k: 'lib2', l: 'Nom du côté 2', t: 't', d: 'Secondaire' }, { k: 'fluide2', l: 'Fluide du côté 2', t: 's', o: Object.entries(FLUIDES_ECH).map(([k, x]) => [k, x[0]]), d: 'eau' },
      { k: 'Te2', l: 'Côté 2 : entrée (retour, vide : 50 °C)', u: '°C', d: '' }, { k: 'Ts2', l: 'Côté 2 : sortie (départ, vide : 70 °C)', u: '°C', d: '' },
      { g: 'Échange' }, { k: 'U', l: 'Coefficient d\'échange (vide : usuel)', u: 'W/m²·K', d: '' }, { k: 'encrassement', l: 'Marge d\'encrassement sur la surface', u: '%', d: 10 },
      { k: 'dp1', l: 'Perte de charge côté 1', u: 'kPa', d: 30 }, { k: 'dp2', l: 'Perte de charge côté 2', u: 'kPa', d: 30 },
      { g: 'Échangeur retenu (fiche du fabricant)' }, { k: 'Pfab', l: 'Puissance de l\'échangeur retenu (vide : pas de contrôle)', u: 'kW', d: '' },
      { k: 'Afab', l: 'Surface d\'échange', u: 'm²', d: '' }, { k: 'nPlaques', l: 'Nombre de plaques', d: '' }],
    calcul: calculerEchangeur,
    lier(ctx) {
      const { e } = ctx;
      if (!e.source) return;
      const pids = (ctx.notes || []).filter(n => n.type === 'pid');
      const essais = e.source === 'auto' ? pids.flatMap(n => optEchangeurs({ notes: [n] }, '').slice(2).map(o => o[0])) : [e.source];
      for (const s of essais) {
        const [id, sorte, rep] = String(s).split('|'), n = pids.find(x => x.id === id);
        if (!n) { if (e.source !== 'auto') ctx.alertes.push(alerte('attention', 'L\'échangeur relié n\'existe plus dans l\'étude : valeurs saisies conservées.')); continue; }
        let d; try { d = Sc().dimensionner(ctx.resoudre(n)); } catch (err) { continue; }
        const lib = ctx.libelle(n), r1 = x => Math.round(x * 10) / 10;
        if (sorte === 'ss') {
          // Sous-station : secondaire = régime du réseau du schéma ; primaire (réseau de chaleur) à saisir
          ctx.imposer({ P: r1(d.Pdem || d.Pprod), lib1: 'Primaire (réseau)', lib2: 'Secondaire (bâtiment)', Te2: d.Tr, Ts2: d.Td }, `${lib} (sous-station)`);
          ctx.alertes.push(alerte('info', 'Sous-station : régime du primaire (réseau de chaleur ou de froid) à saisir d\'après le concessionnaire.'));
        } else if (sorte === 'dec') {
          ctx.imposer({ P: r1(d.Pdem), lib1: 'Production', lib2: 'Distribution', Te1: d.Td, Ts1: d.Tr, Te2: d.Tsr, Ts2: d.Tsd }, `${lib} (découplage)`);
        } else {
          const c = (d.circuits || []).find(x => x.rep === rep); if (!c) continue;
          const rc = c.rcC || c.rc, chaud = rc[0] > rc[1], TrP = chaud ? rc[1] + d.pinc : rc[1] - d.pinc;
          ctx.imposer({ P: r1(c.P), lib1: 'Collecteur', lib2: `Circuit ${rep}`, Te1: d.Tsd, Ts1: r1(TrP), Te2: rc[1], Ts2: rc[0] }, `${lib} (circuit ${rep})`);
        }
        return;
      }
    },
  };

  return { dtlmAmbiance, rosee, humAbs, kH, qLimite, tSurface, retourPour, facteurRad, choixRadiateur, calculerPlancher, calculerRadiateurs, calculerPlafonds, calculerEchangeur, optEchangeurs, lierLocaux,
    REVETEMENTS, ZONES, TUBES_PL, TYPES_RAD, HAUTEURS, SYSTEMES, FLUIDES_ECH };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = AnnexesEmetteurs;
