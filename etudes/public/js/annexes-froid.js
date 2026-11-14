// Calculs annexes — Froid et climatisation : détente directe DRV/VRF, fluides frigorigènes (F-gaz, EN 378), bilan de chambre froide.
// Rangés à part dans l'étude (famille « Calculs annexes », thème « Froid et climatisation ») ; chaque type déclare annexe: true, theme,
// et sa fonction lier(ctx) qui reprend les données des autres notes de l'étude (voir Liens.resoudreLiens).
// Valeurs de référence indicatives (repères normatifs, ordres de grandeur) : toutes saisissables, à remplacer par les données
// du fabricant retenu et à confirmer avec le bureau de contrôle. Module pur (navigateur, node, tests).
const AnnexesFroid = ((N) => {
  const { nf, num } = N;
  const alerte = (niveau, texte) => ({ niveau, texte });
  const THEME = 'Froid et climatisation', FAMILLE = 'Calculs annexes';
  const vide = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const P_ = () => (typeof Pieces !== 'undefined' ? Pieces : (() => { try { return require('./pieces'); } catch (e) { return null; } })());
  const L_ = () => (typeof Liens !== 'undefined' ? Liens : (() => { try { return require('./liens'); } catch (e) { return null; } })());

  /* ---------- Lignes reprises de l'étude ---------- */
  // Lignes « auto » (reprises d'une autre note) ajoutées après les lignes saisies, toutes leurs cellules verrouillées ;
  // une ligne saisie de même clé (repère, local) remplace la ligne reprise et en reprend les cellules laissées vides.
  function reprendre(ctx, liste, auto, cle) {
    const e = ctx.e, l = e[liste] = Array.isArray(e[liste]) ? e[liste].slice() : [];
    const verr = (i, k, src) => { const key = `${liste}.${i}.${k}`; ctx.imposer({ [key]: 1 }, src); delete e[key]; };
    auto.forEach(a => {
      const j = l.findIndex(x => x && !x._auto && norm(x[cle]) && norm(x[cle]) === norm(a[cle]));
      if (j >= 0) { const x = l[j] = { ...l[j] }; Object.keys(a).filter(k => k[0] !== '_' && vide(x[k]) && !vide(a[k])).forEach(k => { x[k] = a[k]; }); return; }
      const i = l.length; l.push({ ...a }); Object.keys(a).filter(k => k[0] !== '_').forEach(k => verr(i, k, a._auto));
    });
    return l;
  }

  /* ---------- Fluides frigorigènes ---------- */
  // [libellé, PRP AR4 (règlement (UE) 517/2014, annexes I et IV), PRP AR5 (GIEC 5e rapport, 100 ans), classe de sécurité (ISO 817 / EN 378-1),
  //  limite pratique (kg/m³, EN 378-1 annexe C), LFL (kg/m³, inflammables), masse volumique du liquide à 25 °C (kg/m³), gaz fluoré (F-gaz)]
  // Valeurs indicatives, à vérifier sur la fiche de données de sécurité et dans l'édition en vigueur des textes.
  const FLUIDES = {
    R32: ['R32', 675, 677, 'A2L', 0.061, 0.307, 961, true],
    R410A: ['R410A', 2088, 1924, 'A1', 0.44, 0, 1062, true],
    R454B: ['R454B', 466, 467, 'A2L', 0.059, 0.296, 1040, true],
    R407C: ['R407C', 1774, 1624, 'A1', 0.31, 0, 1136, true],
    R134a: ['R134a', 1430, 1300, 'A1', 0.25, 0, 1207, true],
    R513A: ['R513A', 631, 573, 'A1', 0.35, 0, 1170, true],
    R404A: ['R404A', 3922, 3943, 'A1', 0.52, 0, 1044, true],
    R449A: ['R449A', 1397, 1282, 'A1', 0.36, 0, 1110, true],
    R448A: ['R448A', 1387, 1273, 'A1', 0.39, 0, 1100, true],
    R452A: ['R452A', 2140, 1945, 'A1', 0.42, 0, 1110, true],
    R454C: ['R454C', 148, 146, 'A2L', 0.059, 0.293, 1050, true],
    R1234yf: ['R1234yf', 4, 1, 'A2L', 0.058, 0.289, 1092, true],
    R1234ze: ['R1234ze(E)', 7, 1, 'A2L', 0.061, 0.303, 1163, true],
    R290: ['R290 (propane)', 3, 3, 'A3', 0.008, 0.038, 493, false],
    R600a: ['R600a (isobutane)', 3, 3, 'A3', 0.011, 0.043, 551, false],
    R744: ['R744 (CO₂)', 1, 1, 'A1', 0.1, 0, 710, false],
    R717: ['R717 (ammoniac)', 0, 0, 'B2L', 0.00035, 0.116, 603, false],
  };
  const optFluides = Object.entries(FLUIDES).map(([k, f]) => [k, `${f[0]} — ${f[3]}, PRP ${f[1]}`]);
  const inflammable = f => /2L|2|3/.test(f[3]);
  const prp = (f, ref) => (ref === 'AR5' ? f[2] : f[1]);
  // Contrôles d'étanchéité (règlement (UE) 517/2014 art. 4 et 5, repris par le règlement (UE) 2024/573) : [seuil tCO₂e, mois sans détection, mois avec détection]
  const SEUILS_FGAZ = [[500, 3, 6], [50, 6, 12], [5, 12, 24]];
  function controleFgaz(t, f, { hermetique = false, detection = false } = {}) {
    if (!f[7]) return { mois: 0, texte: 'Hors règlement F-gaz (fluide non fluoré) : maintenance selon EN 378-4 et notice', detObl: false };
    if (hermetique && t < 10) return { mois: 0, texte: 'Équipement hermétiquement scellé < 10 tCO₂e : pas de contrôle périodique F-gaz', detObl: false };
    const s = SEUILS_FGAZ.find(([x]) => t >= x);
    if (!s) return { mois: 0, texte: 'Moins de 5 tCO₂e : pas de contrôle périodique F-gaz (bonnes pratiques EN 378-4)', detObl: false };
    const detObl = t >= 500, mois = detection ? s[2] : s[1];
    return { mois, texte: `Contrôle d'étanchéité tous les ${mois} mois${detection ? ' (détection de fuite installée)' : ''}`, detObl };
  }
  // Charge maxi par local (EN 378-1 annexe C) : limite pratique × volume ; pour A2L / A3 en confort, m_max = 2,5 · LFL^(5/4) · h₀ · A^(1/2)
  const H0 = { sol: [0.6, 'Unité au sol'], fenetre: [1.0, 'Unité en allège (fenêtre)'], mur: [1.8, 'Unité murale'], plafond: [2.2, 'Unité au plafond'] };
  function chargeMaxLocal(f, S, H, pos, { lp, lfl } = {}) {
    const PL = num(lp) > 0 ? num(lp) : f[4], LFL = num(lfl) > 0 ? num(lfl) : f[5], V = S * H, h0 = (H0[pos] || H0.mur)[0];
    const mPL = PL * V, mConf = LFL > 0 ? 2.5 * LFL ** 1.25 * h0 * Math.sqrt(S) : Infinity;
    return { S, H, PL, LFL, V, h0, mPL, mConf, m1: LFL * 4, m2: LFL * 26, m3: LFL * 130, mMax: Math.min(mPL, mConf) };
  }

  /* ---------- 10. Détente directe DRV / VRF ---------- */
  // Diamètres de liaison indicatifs (liquide / gaz, mm, tube cuivre EN 12735-1) selon la puissance froid desservie (kW) — ordre de grandeur
  // des notices DRV au R410A / R32, à remplacer par la table du fabricant retenu
  const DIAM_PRINC = [[15, '9,52', '15,88'], [22.4, '9,52', '19,05'], [28, '9,52', '22,22'], [40, '12,7', '28,58'], [56, '15,88', '28,58'], [70, '15,88', '34,92'], [100, '19,05', '34,92'], [Infinity, '19,05', '41,28']];
  const DIAM_UI = [[2.8, '6,35', '9,52'], [5.6, '6,35', '12,7'], [16, '9,52', '15,88'], [Infinity, '9,52', '19,05']];
  const diam = (t, P) => t.find(([p]) => P <= p);
  // Tubes de liquide : diamètre extérieur (mm) → épaisseur (mm), EN 12735-1
  const TUBES_LIQ = { '6.35': 0.8, '9.52': 0.8, '12.7': 0.8, '15.88': 1.0, '19.05': 1.0, '22.22': 1.0, '28.58': 1.0 };
  // Charge complémentaire (g/m) = masse volumique du liquide × section intérieure (ligne liquide pleine)
  const gParM = (de, rho) => { const di = (num(de) - 2 * (TUBES_LIQ[de] ?? 1)) / 1000; return rho * Math.PI * di * di / 4 * 1000; };
  const TYPES_UI = { mural: 'Murale (split)', cassette: 'Cassette', gainable: 'Gainable', console: 'Console', plafonnier: 'Plafonnier', autre: 'Autre' };
  // Terminaux de l'étude à détente directe : splits, et cassettes / gainables sans batterie à eau
  const estDX = a => a && (a.type === 'split' || (/^(cassette|gainable|vc)/.test(a.type || '') && a.batterie === 'aucune'));
  const typeUI = t => (t === 'split' ? 'mural' : /^cassette/.test(t || '') ? 'cassette' : /gainable/.test(t || '') ? 'gainable' : /^vc/.test(t || '') ? 'console' : 'autre');

  function calculerDrv(e) {
    const alertes = [], f = FLUIDES[e.fluide] || FLUIDES.R410A, PfrUE = num(e.PfrUE), PchUE = num(e.PchUE);
    const uis = (e.uis || []).filter(u => u && (u.rep || num(u.Pfr) > 0)).map((u, i) => ({ rep: String(u.rep || `UI${i + 1}`), local: u.local || '', type: TYPES_UI[u.type] ? u.type : 'autre', n: Math.max(1, Math.round(num(u.n, 1))), Pfr: num(u.Pfr), Pch: num(u.Pch), L: num(u.L, NaN), H: num(u.H, 0), auto: u._auto || '' }));
    const Pui = uis.reduce((a, u) => a + u.n * u.Pfr, 0), PuiC = uis.reduce((a, u) => a + u.n * u.Pch, 0), nUI = uis.reduce((a, u) => a + u.n, 0);
    const tc = PfrUE > 0 && Pui > 0 ? Pui / PfrUE * 100 : NaN, tcMin = num(e.tcMin, 50), tcMax = num(e.tcMax, 130);
    if (!uis.length) alertes.push(alerte('attention', 'Ajoutez les unités intérieures (ou reliez des terminaux de type split, cassette ou gainable à détente directe dans l\'étude).'));
    if (!(PfrUE > 0)) alertes.push(alerte('erreur', 'Puissance frigorifique nominale de l\'unité extérieure à saisir (fiche du fabricant).'));
    else if (Number.isFinite(tc)) alertes.push(alerte(tc < tcMin || tc > tcMax ? 'erreur' : 'ok', `Taux de connexion ${nf(tc, 0)} % (${nf(Pui, 1)} kW intérieurs / ${nf(PfrUE, 1)} kW extérieurs) : ${tc < tcMin || tc > tcMax ? `hors de la plage admise ${nf(tcMin, 0)}–${nf(tcMax, 0)} %` : `dans la plage ${nf(tcMin, 0)}–${nf(tcMax, 0)} %`}.`));
    if (Number.isFinite(tc) && tc > 100 && tc <= tcMax) alertes.push(alerte('info', 'Taux de connexion supérieur à 100 % : foisonnement des unités intérieures admis ; vérifier la puissance restituée simultanément au point de calcul (courbes du fabricant).'));
    // Longueurs
    const avecL = uis.filter(u => Number.isFinite(u.L)), loin = avecL.reduce((a, u) => (!a || u.L > a.L ? u : a), null);
    const Lloin = loin ? loin.L : 0, Leq = Lloin + num(e.nCoudes) * num(e.eqCoude, 0.5) + num(e.nRaccords) * num(e.eqRaccord, 0.5);
    const lims = { reel: num(e.LmaxReel, 165), eq: num(e.LmaxEq, 190), tot: num(e.LtotMax, 1000), L1: num(e.L1max, 40), haut: num(e.dHhaut, 50), bas: num(e.dHbas, 40), ui: num(e.dHui, 30) };
    const liq = (e.liquide || []).filter(x => x && num(x.L) > 0).map(x => { const d = String(x.d || '9.52'), g = num(x.gpm) > 0 ? num(x.gpm) : gParM(d, f[6]); return { d, L: num(x.L), g, m: num(x.L) * g / 1000, saisi: num(x.gpm) > 0 }; });
    const Ltot = liq.reduce((a, x) => a + x.L, 0), L1 = num(e.L1, NaN);
    const Hs = uis.map(u => u.H), Hmax = Hs.length ? Math.max(0, ...Hs) : 0, Hmin = Hs.length ? Math.min(0, ...Hs) : 0, dHui = Hs.length > 1 ? Math.max(...Hs) - Math.min(...Hs) : 0;
    const ctrl = [];
    const ajCtrl = (lib, v, lim, u = 'm') => { const ok = !(v > lim); ctrl.push([lib, `${nf(v, 1)} ${u}`, `${nf(lim, 0)} ${u}`, ok ? 'conforme' : 'DÉPASSÉE']); if (!ok) alertes.push(alerte('erreur', `${lib} : ${nf(v, 1)} ${u} pour ${nf(lim, 0)} ${u} admis (notice du fabricant à confirmer).`)); };
    if (loin) { ajCtrl(`Longueur réelle de l'UI la plus éloignée (${loin.rep})`, Lloin, lims.reel); ajCtrl('Longueur équivalente de l\'UI la plus éloignée', Leq, lims.eq); }
    else if (uis.length) alertes.push(alerte('attention', 'Longueurs de liaison UE → UI à saisir (colonne « Longueur réelle ») pour contrôler la plus éloignée.'));
    if (Number.isFinite(L1)) ajCtrl('Longueur après le premier raccord de dérivation', L1, lims.L1);
    if (Ltot) ajCtrl('Longueur totale de liaison (lignes liquide)', Ltot, lims.tot);
    if (Hmin < 0) ajCtrl('Dénivelé UE au-dessus des UI', -Hmin, lims.haut);
    if (Hmax > 0) ajCtrl('Dénivelé UE en dessous des UI', Hmax, lims.bas);
    if (uis.length > 1) ajCtrl('Dénivelé entre unités intérieures', dHui, lims.ui);
    // Diamètres indicatifs
    const dp = diam(DIAM_PRINC, Math.max(PfrUE, Pui));
    // Charge
    const chargeComp = liq.reduce((a, x) => a + x.m, 0), chargeUsine = num(e.chargeUsine), chargeTot = chargeUsine + chargeComp;
    if (!(chargeUsine > 0)) alertes.push(alerte('attention', 'Charge usine de l\'unité extérieure à saisir (plaque signalétique / notice) : charge totale incomplète.'));
    if (!liq.length) alertes.push(alerte('attention', 'Lignes liquide (diamètre, longueur) à saisir pour la charge complémentaire.'));
    if (liq.some(x => !x.saisi)) alertes.push(alerte('info', 'Charge complémentaire calculée ligne liquide pleine (masse volumique du liquide à 25 °C × section intérieure) : à remplacer par les g/m de la notice du fabricant.'));
    const ref = e.refPrp === 'AR5' ? 'AR5' : 'AR4', t = chargeTot * prp(f, ref) / 1000;
    if (inflammable(f)) alertes.push(alerte('attention', `${f[0]} : fluide de classe ${f[3]} — limite de charge par local (EN 378-1) à vérifier dans le calcul « Fluides frigorigènes ».`));
    // Plus petit local
    const Smin = num(e.Smin), Hloc = num(e.Hmin, 2.5);
    let loc = null;
    if (Smin > 0 && chargeTot > 0) {
      loc = chargeMaxLocal(f, Smin, Hloc, e.posUI || 'mur');
      const c = chargeTot / (Smin * Hloc);
      if (chargeTot > loc.mMax) alertes.push(alerte('erreur', `Plus petit local desservi (${nf(Smin, 1)} m², ${nf(Smin * Hloc, 0)} m³) : charge ${nf(chargeTot, 1)} kg > ${nf(loc.mMax, 1)} kg admis (EN 378-1, ${nf(c, 3)} kg/m³) : mesures complémentaires (détection, ventilation, vannes d'isolement) ou réseau à fractionner.`));
      else alertes.push(alerte('ok', `Plus petit local desservi : ${nf(c, 3)} kg/m³ pour ${nf(loc.PL, 3)} kg/m³ de limite pratique (charge ${nf(chargeTot, 1)} ≤ ${nf(loc.mMax, 1)} kg).`));
    }
    const eer = num(e.EER, 3.5), PelUE = num(e.PelUE) > 0 ? num(e.PelUE) : PfrUE / Math.max(eer, 0.5);
    alertes.push(alerte('attention', 'Limites de longueur, de dénivelé et de taux de connexion : valeurs usuelles par défaut, à remplacer par celles de la notice de la gamme retenue (elles varient selon le fabricant et la puissance).'));
    const lignesUI = uis.map(u => { const d = diam(DIAM_UI, u.Pfr); return [`${u.auto ? '🔗 ' : ''}${u.rep}`, u.local, TYPES_UI[u.type], String(u.n), nf(u.Pfr, 2), nf(u.Pch, 2), Number.isFinite(u.L) ? nf(u.L, 1) : '—', nf(u.H, 1), `${d[1]} / ${d[2]}`]; });
    return {
      valeurs: { Pui, PuiC, PfrUE, PchUE, tc, nUI, Lloin, Leq, Ltot, dHui, chargeComp, chargeUsine, chargeTot, tCO2e: t, fluide: e.fluide || 'R410A', Smin, Hmin: Hloc, PelUE, repUE: e.repUE || 'UE1' },
      resume: [['Unité extérieure', `${e.repUE || 'UE1'} · ${nf(PfrUE, 1)} kW froid / ${nf(PchUE, 1)} kW chaud · ${f[0]}`], ['Unités intérieures', `${nUI} · ${nf(Pui, 1)} kW froid / ${nf(PuiC, 1)} kW chaud`],
        ['Taux de connexion', Number.isFinite(tc) ? `${nf(tc, 0)} % (admis ${nf(tcMin, 0)}–${nf(tcMax, 0)} %)` : '—'], ['UI la plus éloignée', loin ? `${loin.rep} : ${nf(Lloin, 1)} m réels, ${nf(Leq, 1)} m équivalents` : '—'],
        ['Liaison principale (indicatif)', dp ? `liquide ${dp[1]} / gaz ${dp[2]} mm` : '—'], ['Charge complémentaire', `${nf(chargeComp, 2)} kg`], ['Charge totale', `${nf(chargeTot, 2)} kg · ${nf(t, 2)} tCO₂e (PRP ${ref} ${prp(f, ref)})`],
        ['Puissance électrique de l\'UE', `${nf(PelUE, 1)} kW${num(e.PelUE) > 0 ? '' : ` (estimée, EER ${nf(eer, 1)})`}`]],
      tableaux: [{ titre: 'Unités intérieures', entetes: ['Repère', 'Local', 'Type', 'Nombre', 'Froid (kW)', 'Chaud (kW)', 'Longueur réelle UE → UI (m)', 'Altitude / UE (m)', 'Liaison indicative liquide / gaz (mm)'], lignes: lignesUI },
        { titre: 'Contrôle des liaisons', entetes: ['Contrôle', 'Valeur', 'Limite', 'État'], lignes: ctrl },
        { titre: 'Charge complémentaire', entetes: ['Ligne liquide (mm)', 'Longueur (m)', 'g/m', 'Charge (kg)'], lignes: [...liq.map(x => [x.d.replace('.', ','), nf(x.L, 1), `${nf(x.g, 1)}${x.saisi ? '' : ' (calculé)'}`, nf(x.m, 3)]), ['Total', nf(Ltot, 1), '', nf(chargeComp, 3)]] }],
      alertes,
      hypotheses: ['Taux de connexion = Σ puissances frigorifiques nominales des unités intérieures / puissance nominale de l\'unité extérieure.',
        `Longueur équivalente = longueur réelle de l'UI la plus éloignée + coudes × ${nf(num(e.eqCoude, 0.5), 2)} m + raccords de dérivation × ${nf(num(e.eqRaccord, 0.5), 2)} m.`,
        'Dénivelés repris de l\'altitude de chaque UI par rapport à l\'UE (positive : UI au-dessus de l\'UE).',
        `Charge complémentaire = Σ longueur de liquide × g/m ; g/m par défaut = ρ liquide à 25 °C (${f[6]} kg/m³) × section intérieure (tube EN 12735-1).`,
        'Diamètres indicatifs : ordre de grandeur des notices DRV (R410A / R32), à confirmer par le logiciel de sélection du fabricant.', 'tCO₂e = charge (kg) × PRP / 1000.'],
      synthese: `${nUI} UI · ${Number.isFinite(tc) ? `${nf(tc, 0)} %` : '—'} · charge ${nf(chargeTot, 1)} kg`,
    };
  }
  N.TYPES.drv = {
    titre: 'Détente directe DRV / VRF (taux de connexion, liaisons, charge)', icone: '❄️', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Unité extérieure et unités intérieures (reprises des terminaux), taux de connexion, longueurs et dénivelés contrôlés, diamètres indicatifs, charge complémentaire et charge totale.',
    champs: [{ g: 'Unité extérieure' }, { k: 'repUE', l: 'Repère de l\'unité extérieure', t: 't', d: 'UE1' }, { k: 'fluide', l: 'Fluide frigorigène', t: 's', o: optFluides, d: 'R410A' },
      { k: 'PfrUE', l: 'Puissance frigorifique nominale', u: 'kW', d: 28 }, { k: 'PchUE', l: 'Puissance calorifique nominale', u: 'kW', d: 31.5 },
      { k: 'chargeUsine', l: 'Charge usine de l\'unité extérieure (plaque signalétique)', u: 'kg', d: '' },
      { k: 'PelUE', l: 'Puissance électrique absorbée (vide : estimée selon l\'EER)', u: 'kW', d: '' }, { k: 'EER', l: 'EER indicatif pour l\'estimation', d: 3.5 },
      { k: 'tension', l: 'Tension', t: 's', o: [['tri', '400 V tri'], ['mono', '230 V mono']], d: 'tri' },
      { k: 'refPrp', l: 'PRP retenu', t: 's', o: [['AR4', 'AR4 (règlement 517/2014, étiquetage)'], ['AR5', 'AR5 (GIEC, 5e rapport)']], d: 'AR4' },
      { g: 'Unités intérieures' },
      { k: 'reprise', l: 'Unités intérieures', t: 's', o: [['etude', 'Reprises des terminaux de l\'étude (split, cassette, gainable à détente directe) + lignes saisies'], ['saisie', 'Saisies seulement']], d: 'etude' },
      { k: 'uis', l: 'Unités intérieures (🔗 reprises de l\'étude ; une ligne saisie au même repère complète la ligne reprise : longueur, altitude)', t: 'lignes', d: [],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'local', l: 'Local', t: 't', lst: (e, et) => N.lieuxEtude(et).salles }, { k: 'type', l: 'Type', t: 's', o: Object.entries(TYPES_UI) }, { k: 'n', l: 'Nombre' },
          { k: 'Pfr', l: 'Puissance froid (kW)' }, { k: 'Pch', l: 'Puissance chaud (kW)' }, { k: 'L', l: 'Longueur réelle UE → UI (m)' }, { k: 'H', l: 'Altitude par rapport à l\'UE (m, + au-dessus)' }] },
      { k: 'tcMin', l: 'Taux de connexion minimal', u: '%', d: 50 }, { k: 'tcMax', l: 'Taux de connexion maximal', u: '%', d: 130 },
      { g: 'Liaisons frigorifiques' },
      { k: 'nCoudes', l: 'Coudes sur le trajet de l\'UI la plus éloignée', d: 10 }, { k: 'eqCoude', l: 'Longueur équivalente d\'un coude', u: 'm', d: 0.5 },
      { k: 'nRaccords', l: 'Raccords de dérivation sur ce trajet', d: 3 }, { k: 'eqRaccord', l: 'Longueur équivalente d\'un raccord', u: 'm', d: 0.5 },
      { k: 'L1', l: 'Longueur du premier raccord à l\'UI la plus éloignée', u: 'm', d: '' },
      { k: 'liquide', l: 'Lignes liquide (charge complémentaire ; g/m vide : calculé)', t: 'lignes', d: [{ d: '9.52', L: 30, gpm: '' }, { d: '6.35', L: 40, gpm: '' }],
        colonnes: [{ k: 'd', l: 'Diamètre liquide (mm)', t: 's', o: Object.keys(TUBES_LIQ).map(k => [k, k.replace('.', ',')]) }, { k: 'L', l: 'Longueur (m)' }, { k: 'gpm', l: 'Charge (g/m, notice)' }] },
      { g: 'Limites de la gamme (notice du fabricant ; valeurs usuelles par défaut)' },
      { k: 'LmaxReel', l: 'Longueur réelle maxi jusqu\'à l\'UI la plus éloignée', u: 'm', d: 165 }, { k: 'LmaxEq', l: 'Longueur équivalente maxi', u: 'm', d: 190 },
      { k: 'LtotMax', l: 'Longueur totale de liaison maxi', u: 'm', d: 1000 }, { k: 'L1max', l: 'Longueur maxi après le premier raccord', u: 'm', d: 40 },
      { k: 'dHhaut', l: 'Dénivelé maxi UE au-dessus des UI', u: 'm', d: 50 }, { k: 'dHbas', l: 'Dénivelé maxi UE en dessous des UI', u: 'm', d: 40 }, { k: 'dHui', l: 'Dénivelé maxi entre UI', u: 'm', d: 30 },
      { g: 'Plus petit local desservi (limite de charge EN 378)' },
      { k: 'Smin', l: 'Surface du plus petit local desservi (vide : reprise des pièces de l\'étude)', u: 'm²', d: '' }, { k: 'Hmin', l: 'Hauteur de ce local', u: 'm', d: 2.5 },
      { k: 'posUI', l: 'Position de l\'unité dans ce local', t: 's', o: Object.entries(H0).map(([k, x]) => [k, x[1]]), d: 'mur' }],
    calcul: calculerDrv,
    lier(ctx) {
      const { e, notes } = ctx;
      if (e.reprise === 'saisie') return;
      const auto = [];
      notes.filter(n => n.type === 'terminaux').forEach(n => {
        const es = ctx.resoudre(n), lib = ctx.libelle(n);
        (es.appareils || []).filter(estDX).forEach((a, i) => auto.push({ rep: String(a.rep || `UI${i + 1}`), local: a.local || '', type: typeUI(a.type), n: Math.max(1, Math.round(num(a.n, 1))), Pfr: num(a.Pfr), Pch: num(a.Pch), L: '', H: '', _auto: lib }));
      });
      reprendre(ctx, 'uis', auto, 'rep');
      // Plus petit local desservi : surface reprise des pièces de l'étude (même nom de local que les UI)
      const P = P_();
      if (P && notes.some(n => n.type === 'pieces')) {
        const b = P.besoinsEtude(ctx.etude), locaux = (e.uis || []).map(u => u && b[norm(u.local)]).filter(Boolean);
        if (locaux.length) { const p = locaux.reduce((a, x) => (x.S < a.S ? x : a)); ctx.proposer({ Smin: Math.round(p.S * 10) / 10 }, `pièce ${p.nom} (bilan pièce par pièce)`); }
      }
    },
    versElec(v, e) {
      if (!(v.PelUE > 0)) return [];
      return [{ rep: v.repUE || 'UE1', designation: `Unité extérieure DRV ${v.repUE || ''} (${nf(v.PfrUE, 1)} kW froid, ${(FLUIDES[v.fluide] || FLUIDES.R410A)[0]})`.replace('  ', ' '), type: 'split', P: Math.round(v.PelUE * 100) / 100, tension: e.tension || 'tri', regulation: 'bus' }];
    },
  };

  /* ---------- 11. Fluides frigorigènes ---------- */
  function calculerFluides(e) {
    const alertes = [], ref = e.refPrp === 'AR5' ? 'AR5' : 'AR4';
    const eqs = (e.equipements || []).filter(x => x && (x.rep || num(x.charge) > 0)).map((x, i) => {
      const f = FLUIDES[x.fluide] || FLUIDES.R410A, charge = num(x.charge), t = charge * prp(f, ref) / 1000, rep = String(x.rep || `EQ${i + 1}`);
      const det = x.detection === 'oui', c = controleFgaz(t, f, { hermetique: x.hermetique === 'oui', detection: det });
      const S = num(x.S), H = num(x.H, 2.5), loc = S > 0 ? chargeMaxLocal(f, S, H, x.pos || 'mur', { lp: e.lpSaisie, lfl: e.lflSaisie }) : null;
      if (c.detObl && !det) alertes.push(alerte('erreur', `${rep} : ${nf(t, 0)} tCO₂e ≥ 500 : système de détection de fuite obligatoire (règlement F-gaz).`));
      if (!(charge > 0)) alertes.push(alerte('attention', `${rep} : charge en fluide à saisir.`));
      if (loc) {
        if (charge > loc.mMax) alertes.push(alerte('erreur', `${rep} : ${nf(charge, 1)} kg dans un local de ${nf(loc.V, 0)} m³ — au-delà de ${nf(loc.mMax, 2)} kg (${loc.mConf < loc.mPL ? `formule A2L/A3 2,5·LFL^1,25·h₀·√A` : `limite pratique ${nf(loc.PL, 3)} kg/m³ × volume`}) : mesures de l'EN 378-3 (détection, ventilation, vannes d'isolement) ou réduction de charge.`));
        else alertes.push(alerte('ok', `${rep} : ${nf(charge / loc.V, 3)} kg/m³ dans le local, sous la limite (${nf(loc.mMax, 2)} kg admis).`));
        if (inflammable(f) && charge > loc.m3) alertes.push(alerte('erreur', `${rep} : charge > m₃ = 130 m³ × LFL = ${nf(loc.m3, 1)} kg : fluide ${f[3]} non admis en confort dans ce cas (EN 378-1, à confirmer).`));
      } else if (inflammable(f)) alertes.push(alerte('attention', `${rep} : fluide ${f[3]} — surface et hauteur du plus petit local desservi à saisir pour la limite de charge EN 378.`));
      if (/A3|B/.test(f[3])) alertes.push(alerte('attention', `${rep} : ${f[0]} (classe ${f[3]}) : zone ATEX, ventilation de la salle des machines et détection (EN 378-3) à étudier.`));
      return { rep, f, charge, t, c, det, loc, auto: x._auto || '', hermetique: x.hermetique === 'oui' };
    });
    if (!eqs.length) alertes.push(alerte('attention', 'Ajoutez les équipements frigorifiques (ou reliez un calcul DRV ou chambre froide de l\'étude).'));
    const tTot = eqs.reduce((a, x) => a + x.t, 0), cTot = eqs.reduce((a, x) => a + x.charge, 0);
    if (eqs.some(x => x.f[7] && x.t >= 5)) alertes.push(alerte('attention', 'Registre de l\'équipement (fiches d\'intervention CERFA 15497), opérateur titulaire de l\'attestation de capacité, contrôle d\'étanchéité à la mise en service.'));
    alertes.push(alerte('info', `PRP ${ref} retenu. Le règlement (UE) 2024/573 a remplacé le 517/2014 : seuils et PRP de son annexe I à vérifier pour l'étiquetage et le registre.`));
    return {
      valeurs: { tCO2e: tTot, charge: cTot, equipements: eqs.map(x => ({ rep: x.rep, fluide: x.f[0], charge: x.charge, tCO2e: x.t, mois: x.c.mois })) },
      resume: [['Équipements', String(eqs.length)], ['Charge totale', `${nf(cTot, 2)} kg`], ['Équivalent CO₂', `${nf(tTot, 2)} tCO₂e (PRP ${ref})`],
        ['Contrôle le plus fréquent', (() => { const m = eqs.filter(x => x.c.mois).map(x => x.c.mois); return m.length ? `tous les ${Math.min(...m)} mois` : 'aucun contrôle périodique F-gaz'; })()]],
      tableaux: [{ titre: 'Fluides et obligations F-gaz', entetes: ['Équipement', 'Fluide', 'Classe', `PRP ${ref}`, 'Charge (kg)', 'tCO₂e', 'Contrôle d\'étanchéité', 'Détection'], lignes: eqs.map(x => [`${x.auto ? '🔗 ' : ''}${x.rep}`, x.f[0], x.f[3], String(prp(x.f, ref)), nf(x.charge, 2), nf(x.t, 2), x.c.texte, x.c.detObl ? (x.det ? 'obligatoire — installée' : 'OBLIGATOIRE') : x.det ? 'installée' : 'non obligatoire']) },
        { titre: 'Limite de charge par local (EN 378-1 annexe C)', entetes: ['Équipement', 'Local (m² / m³)', 'Limite pratique (kg/m³)', 'LFL (kg/m³)', 'm (limite pratique)', 'm (A2L/A3 confort)', 'Charge maxi (kg)', 'Charge (kg)'], lignes: eqs.filter(x => x.loc).map(x => [x.rep, `${nf(x.loc.S, 1)} m² / ${nf(x.loc.V, 0)} m³`, nf(x.loc.PL, 3), x.loc.LFL ? nf(x.loc.LFL, 3) : '—', nf(x.loc.mPL, 2), Number.isFinite(x.loc.mConf) ? nf(x.loc.mConf, 2) : '—', nf(x.loc.mMax, 2), nf(x.charge, 2)]) },
        { titre: 'Registre des équipements (à tenir à jour)', entetes: ['Équipement', 'Fluide', 'Charge (kg)', 'tCO₂e', 'Périodicité', 'Date de mise en service', 'Dernier contrôle', 'Opérateur (attestation de capacité)'], lignes: eqs.map(x => [x.rep, x.f[0], nf(x.charge, 2), nf(x.t, 2), x.c.mois ? `${x.c.mois} mois` : '—', '', '', '']) }],
      alertes,
      hypotheses: ['tCO₂e = charge × PRP / 1000 ; PRP AR4 (règlement (UE) 517/2014) ou AR5 (GIEC) au choix.',
        'Contrôles d\'étanchéité : ≥ 5 tCO₂e tous les 12 mois, ≥ 50 tous les 6 mois, ≥ 500 tous les 3 mois ; périodicité doublée avec un système de détection de fuite ; détection obligatoire à partir de 500 tCO₂e ; équipements hermétiquement scellés exemptés sous 10 tCO₂e.',
        'Limite de charge par local (EN 378-1 annexe C) : limite pratique × volume du plus petit local desservi ; fluides inflammables (A2L, A3) en confort : m_max = 2,5 × LFL^1,25 × h₀ × √A (h₀ selon la position de l\'unité) ; m₁ = 4 m³ × LFL, m₂ = 26 m³ × LFL, m₃ = 130 m³ × LFL.',
        'Limites pratiques, LFL et PRP : valeurs indicatives (EN 378-1 annexe C, fiches de données de sécurité), saisissables ; à vérifier dans les éditions en vigueur.'],
      synthese: `${eqs.length} équipement(s) · ${nf(cTot, 1)} kg · ${nf(tTot, 1)} tCO₂e`,
    };
  }
  N.TYPES.fluides = {
    titre: 'Fluides frigorigènes (F-gaz, tCO₂e, EN 378)', icone: '🧪', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Équivalent CO₂ des charges (reprises des calculs DRV et chambre froide), périodicité des contrôles d\'étanchéité, détection obligatoire, limite de charge par local selon l\'EN 378, registre.',
    champs: [{ g: 'Références' }, { k: 'refPrp', l: 'PRP retenu', t: 's', o: [['AR4', 'AR4 (règlement 517/2014, étiquetage)'], ['AR5', 'AR5 (GIEC, 5e rapport)']], d: 'AR4' },
      { k: 'lpSaisie', l: 'Limite pratique imposée (vide : table EN 378-1)', u: 'kg/m³', d: '' }, { k: 'lflSaisie', l: 'LFL imposée (vide : table)', u: 'kg/m³', d: '' },
      { g: 'Équipements' },
      { k: 'reprise', l: 'Équipements', t: 's', o: [['etude', 'Repris des calculs DRV et chambre froide de l\'étude + lignes saisies'], ['saisie', 'Saisis seulement']], d: 'etude' },
      { k: 'equipements', l: 'Équipements (🔗 repris ; une ligne saisie au même repère complète la ligne reprise : détection, local…)', t: 'lignes', d: [],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'fluide', l: 'Fluide', t: 's', o: optFluides }, { k: 'charge', l: 'Charge (kg)' },
          { k: 'hermetique', l: 'Hermétiquement scellé', t: 's', o: [['non', 'Non'], ['oui', 'Oui']] }, { k: 'detection', l: 'Détection de fuite', t: 's', o: [['non', 'Non'], ['oui', 'Oui']] },
          { k: 'S', l: 'Plus petit local : surface (m²)' }, { k: 'H', l: 'Hauteur (m)' }, { k: 'pos', l: 'Position de l\'unité', t: 's', o: Object.entries(H0).map(([k, x]) => [k, x[1]]) }] }],
    calcul: calculerFluides,
    lier(ctx) {
      if (ctx.e.reprise === 'saisie') return;
      const auto = [];
      ctx.notes.filter(n => n.type === 'drv' || n.type === 'chambreFroide').forEach(n => {
        const v = ctx.calculer(n).valeurs || {}, es = ctx.resoudre(n);
        if (!(v.chargeTot > 0)) return;
        auto.push({ rep: n.type === 'drv' ? String(es.repUE || n.titre) : String(es.repGroupe || n.titre), fluide: v.fluide, charge: Math.round(v.chargeTot * 100) / 100, hermetique: 'non', detection: 'non', S: v.Smin || '', H: v.Hmin || '', pos: n.type === 'drv' ? es.posUI || 'mur' : 'plafond', _auto: ctx.libelle(n) });
      });
      reprendre(ctx, 'equipements', auto, 'rep');
    },
  };

  /* ---------- 12. Bilan frigorifique d'une chambre froide ---------- */
  // Psychrométrie (pression atmosphérique 101 325 Pa) : pression de vapeur saturante (Magnus, eau / glace), humidité, enthalpie
  const pws = T => (T >= 0 ? 610.94 * Math.exp(17.625 * T / (T + 243.04)) : 611.21 * Math.exp(22.587 * T / (T + 273.86)));
  const xDe = (T, HR) => { const pv = HR / 100 * pws(T); return 0.622 * pv / (101325 - pv); };
  const hDe = (T, x) => 1.006 * T + x * (2501 + 1.86 * T);
  // Renouvellements d'air par 24 h dus aux ouvertures de porte, usage normal (table ASHRAE Refrigeration, volumes convertis en m³) :
  // [volume m³, chambre positive, chambre négative]
  const RENOUV = [[5.7, 44, 33.5], [8.5, 34.5, 26.2], [11.3, 29.5, 22.5], [14.2, 26, 20], [17, 23, 18], [22.7, 20, 15.3], [28.3, 17.5, 13.5], [42.5, 14, 11], [56.6, 12, 9.3], [85, 9.5, 7.4],
    [113, 8.2, 6.3], [142, 7.2, 5.6], [170, 6.5, 5], [227, 5.5, 4.3], [283, 4.9, 3.8], [425, 3.9, 3], [566, 3.5, 2.6], [708, 3, 2.3], [850, 2.7, 2.1], [1133, 2.3, 1.8], [1416, 2, 1.6], [2124, 1.6, 1.2], [2832, 1.4, 1.1]];
  function renouvellement(V, negatif) {
    const c = negatif ? 2 : 1, t = RENOUV;
    if (V <= t[0][0]) return t[0][c];
    if (V >= t[t.length - 1][0]) return t[t.length - 1][c];
    const i = t.findIndex(r => r[0] >= V), a = t[i - 1], b = t[i], k = (Math.log(V) - Math.log(a[0])) / (Math.log(b[0]) - Math.log(a[0]));
    return a[c] + k * (b[c] - a[c]);
  }
  // Denrées : [libellé, cp avant congélation, cp après (kJ/kg·K), chaleur latente (kJ/kg), température de congélation (°C), respiration (W/t, vers 0–5 °C)]
  // Ordres de grandeur (tables de propriétés des denrées, ASHRAE Refrigeration) : à remplacer par les données du produit
  const DENREES = { viande: ['Viande', 3.2, 1.7, 230, -1.7, 0], volaille: ['Volaille', 3.3, 1.8, 245, -2, 0], poisson: ['Poisson', 3.6, 1.9, 270, -2.2, 0],
    fruits: ['Fruits', 3.7, 1.9, 280, -1.5, 20], legumes: ['Légumes', 3.8, 1.9, 290, -1, 40], laitiers: ['Produits laitiers', 3.3, 1.9, 250, -1, 0],
    boissons: ['Boissons', 3.9, 2, 300, -2, 0], surgeles: ['Produits déjà surgelés', 3.2, 1.8, 240, -2, 0], perso: ['Autre (propriétés saisies)', 3.5, 1.8, 250, -2, 0] };
  // Chaleur dégagée par une personne dans la chambre (W) : 272 − 6 × T (table ASHRAE : 210 W à 10 °C, 390 W à −20 °C)
  const chaleurPersonne = T => 272 - 6 * T;
  function calculerChambre(e) {
    const alertes = [], Ti = num(e.Ti, 2), Ta = num(e.Tamb, 25), L = num(e.L, 4), l = num(e.l, 3), H = num(e.H, 2.5), Ssol = L * l, V = Ssol * H, neg = Ti < 0;
    // Parois
    const parois = [['Murs', 2 * (L + l) * H, num(e.Upan, 0.22), Ta], ['Plafond', Ssol, num(e.Upan, 0.22), num(e.Tplaf, Ta)], ['Sol', Ssol, num(e.Usol, 0.3), num(e.Tsol, 15)],
      ...(e.parois || []).filter(p => p && num(p.S) > 0).map(p => [p.nom || 'Paroi', num(p.S), num(p.U), num(p.Text, Ta)])]
      .map(([nom, S, U, Te]) => ({ nom, S, U, Te, W: U * S * (Te - Ti) }));
    const Wparois = parois.reduce((a, p) => a + Math.max(0, p.W), 0), Eparois = Wparois * 24 / 1000;
    // Renouvellement d'air
    const nTab = renouvellement(V, neg), fact = { normal: 1, intensif: 2, faible: 0.6 }[e.usagePortes] || 1, n = num(e.nSaisi) > 0 ? num(e.nSaisi) : nTab * fact;
    const xe = xDe(Ta, num(e.HRamb, 50)), xi = xDe(Ti, num(e.HRint, 90)), dh = Math.max(0, hDe(Ta, xe) - hDe(Ti, xi)), rho = 1.293 * 273.15 / (273.15 + Ti);
    const Eair = V * n * rho * dh / 3600;
    // Denrées
    const den = (e.denrees || []).filter(d => d && num(d.m) > 0).map(d => {
      const D = DENREES[d.produit] || DENREES.perso, cp1 = num(d.cp1, D[1]), cp2 = num(d.cp2, D[2]), Lf = num(d.Lf, D[3]), Tc = num(d.Tc, D[4]), m = num(d.m), Te = num(d.Te, Ta), Tf = num(d.Tf, Ti), t = Math.max(1, num(d.t, 24));
      const q = Tf >= Tc ? cp1 * Math.max(0, Te - Tf) : cp1 * Math.max(0, Te - Tc) + Lf + cp2 * (Tc - Tf);
      const E = m * q / 3600, resp = num(d.resp, D[5]) * num(d.stock) * 24 / 1000; // kWh/j
      return { nom: d.nom || D[0], m, Te, Tf, t, q, E, P: E / t, resp, cong: Tf < Tc };
    });
    const Eden = den.reduce((a, d) => a + d.E, 0), Eresp = den.reduce((a, d) => a + d.resp, 0);
    if (den.some(d => d.cong) && !neg) alertes.push(alerte('attention', 'Denrées à congeler dans une chambre positive : vérifier les températures.'));
    if (den.some(d => d.t < 24)) alertes.push(alerte('info', `Refroidissement en moins de 24 h : puissance de mise en température ${nf(den.reduce((a, d) => a + d.P, 0), 2)} kW pendant la descente (contrôler l'évaporateur à ce régime).`));
    // Charges internes
    const Eecl = num(e.eclairage, 8) * Ssol * num(e.hEcl, 4) / 1000;
    const Epers = num(e.nPers) * num(e.hPers, 2) * chaleurPersonne(Ti) / 1000;
    const Eautres = num(e.Pautres) * num(e.hAutres);
    const sousTotal = Eparois + Eair + Eden + Eresp + Eecl + Epers + Eautres;
    const tFonct = num(e.tFonct) > 0 ? num(e.tFonct) : neg ? 18 : 16;
    if (tFonct < 14 || tFonct > 20) alertes.push(alerte('attention', `Temps de fonctionnement ${nf(tFonct, 0)} h/j hors de la plage usuelle 16–20 h/j (marge pour le dégivrage et les pointes).`));
    // Ventilateurs (fonctionnent avec le groupe) et dégivrage
    const Pvent = num(e.Pvent) > 0 ? num(e.Pvent) : sousTotal / tFonct * num(e.pctVent, 5) / 100, Event = Pvent * (neg ? 24 : tFonct);
    const Pdeg = num(e.Pdeg), nDeg = num(e.nDeg, neg ? 4 : 0), dDeg = num(e.dDeg, 30), Edeg = Pdeg * nDeg * dDeg / 60 * num(e.partDeg, 30) / 100;
    if (neg && !(Pdeg > 0)) alertes.push(alerte('attention', 'Chambre négative : puissance des résistances de dégivrage à saisir (fiche de l\'évaporateur).'));
    const Etot = (sousTotal + Event + Edeg) * (1 + num(e.securite, 10) / 100), Pevap = Etot / tFonct;
    // Groupe : COP estimé (Carnot × rendement), T évaporation = Ti − ΔT évaporateur, T condensation = air extérieur + 15 K
    const Tev = Ti - num(e.dTevap, 8), Tco = num(e.Tcond, 32) + 15, cop = Math.max(1, num(e.etaCarnot, 0.45) * (Tev + 273.15) / Math.max(5, Tco - Tev));
    const Pcomp = num(e.Pgroupe) > 0 ? num(e.Pgroupe) : Pevap / cop;
    alertes.push(alerte('ok', `Évaporateur : ${nf(Pevap, 2)} kW (${nf(Etot, 1)} kWh/j sur ${nf(tFonct, 0)} h/j) pour ${nf(V, 1)} m³ à ${nf(Ti, 0)} °C ; groupe ≈ ${nf(Pcomp, 2)} kW électriques${num(e.Pgroupe) > 0 ? '' : ` (COP estimé ${nf(cop, 2)})`}.`));
    alertes.push(alerte('attention', 'Bilan d\'avant-projet : propriétés des denrées, renouvellements et dégivrage indicatifs ; sélection finale de l\'évaporateur et du groupe aux conditions du fabricant (ΔT, givrage, régime).'));
    const postes = [['Parois', Eparois], ['Renouvellement d\'air', Eair], ['Denrées (refroidissement, congélation)', Eden], ['Respiration des denrées', Eresp], ['Éclairage', Eecl], ['Personnes', Epers], ['Autres apports', Eautres], ['Ventilateurs de l\'évaporateur', Event], ['Dégivrage (part restituée)', Edeg]];
    return {
      valeurs: { V, Ssol, Pevap, Etot, tFonct, Pvent, Pdeg, Pcomp, cop, Wparois, Eair, Eden, n, fluide: e.fluide || 'R449A', chargeTot: num(e.charge), Smin: Ssol, Hmin: H, repGroupe: e.repGroupe || 'GF-CF' },
      resume: [['Chambre', `${nf(L, 2)} × ${nf(l, 2)} × ${nf(H, 2)} m = ${nf(V, 1)} m³ à ${nf(Ti, 0)} °C (${neg ? 'négative' : 'positive'})`], ['Besoin journalier', `${nf(Etot, 1)} kWh/j (sécurité ${nf(num(e.securite, 10), 0)} % comprise)`],
        ['Puissance de l\'évaporateur', `${nf(Pevap, 2)} kW sur ${nf(tFonct, 0)} h/j`], ['Renouvellement d\'air', `${nf(n, 1)} vol/24 h`], ['Groupe (électrique)', `${nf(Pcomp, 2)} kW${num(e.Pgroupe) > 0 ? '' : ` (COP ≈ ${nf(cop, 2)})`}`], ['Ventilateurs / dégivrage', `${nf(Pvent, 2)} kW / ${nf(Pdeg, 2)} kW`]],
      tableaux: [{ titre: 'Bilan journalier', entetes: ['Poste', 'kWh/j', 'Part'], lignes: [...postes.map(([p, x]) => [p, nf(x, 2), `${nf(x / Math.max(Etot, 1e-9) * 100, 0)} %`]), ['Total (sécurité comprise)', nf(Etot, 2), '100 %']] },
        { titre: 'Parois', entetes: ['Paroi', 'Surface (m²)', 'U (W/m²·K)', 'Température extérieure (°C)', 'Flux (W)'], lignes: parois.map(p => [p.nom, nf(p.S, 1), nf(p.U, 2), nf(p.Te, 0), nf(p.W, 0)]) },
        ...(den.length ? [{ titre: 'Denrées', entetes: ['Denrée', 'Masse (kg/j)', 'Entrée → finale (°C)', 'Chaleur (kJ/kg)', 'Énergie (kWh/j)', 'Durée (h)', 'Puissance pendant la descente (kW)'], lignes: den.map(d => [d.nom, nf(d.m, 0), `${nf(d.Te, 0)} → ${nf(d.Tf, 0)}`, nf(d.q, 0), nf(d.E, 2), nf(d.t, 0), nf(d.P, 2)]) }] : [])],
      alertes,
      hypotheses: ['Parois : U × S × (T extérieure − T chambre) sur 24 h.', 'Renouvellement d\'air : volumes par 24 h selon le volume de la chambre (table ASHRAE, usage normal, × 2 en usage intensif) × ρ × (h extérieur − h intérieur).',
        'Denrées : m × [cp × ΔT (+ chaleur latente et cp congelé en dessous du point de congélation)] ; respiration des fruits et légumes en W/t stockée.',
        'Personnes : 272 − 6 × T (W) ; éclairage en W/m² × heures.', `Ventilateurs : ${num(e.Pvent) > 0 ? 'puissance saisie' : `${nf(num(e.pctVent, 5), 0)} % du bilan`}, en marche ${neg ? '24 h/j' : 'avec le groupe'} ; dégivrage : part restituée à la chambre ${nf(num(e.partDeg, 30), 0)} %.`,
        'Puissance de l\'évaporateur = besoin journalier / temps de fonctionnement (16 h/j positive, 18 h/j négative par défaut).', 'COP estimé = rendement × T évaporation / (T condensation − T évaporation), T condensation = air extérieur + 15 K.'],
      synthese: `${nf(V, 0)} m³ à ${nf(Ti, 0)} °C · évaporateur ${nf(Pevap, 1)} kW`,
    };
  }
  N.TYPES.chambreFroide = {
    titre: 'Bilan frigorifique d\'une chambre froide', icone: '🧊', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Parois, renouvellement d\'air par les ouvertures, denrées (refroidissement, congélation, respiration), éclairage, personnes, ventilateurs et dégivrage ; puissance de l\'évaporateur selon le temps de fonctionnement.',
    champs: [{ g: 'Chambre' }, { k: 'Ti', l: 'Température de la chambre', u: '°C', d: 2 }, { k: 'HRint', l: 'Humidité relative de la chambre', u: '%', d: 90 },
      { k: 'L', l: 'Longueur intérieure', u: 'm', d: 4 }, { k: 'l', l: 'Largeur intérieure', u: 'm', d: 3 }, { k: 'H', l: 'Hauteur intérieure', u: 'm', d: 2.5 },
      { k: 'Tamb', l: 'Température autour de la chambre', u: '°C', d: 25 }, { k: 'HRamb', l: 'Humidité relative autour de la chambre', u: '%', d: 50 },
      { g: 'Parois' }, { k: 'Upan', l: 'U des panneaux (murs, plafond)', u: 'W/m²·K', d: 0.22 }, { k: 'Tplaf', l: 'Température au-dessus du plafond', u: '°C', d: 25 },
      { k: 'Usol', l: 'U du sol', u: 'W/m²·K', d: 0.3 }, { k: 'Tsol', l: 'Température sous le sol', u: '°C', d: 15 },
      { k: 'parois', l: 'Autres parois (porte, paroi sur extérieur…)', t: 'lignes', d: [], colonnes: [{ k: 'nom', l: 'Paroi', t: 't' }, { k: 'S', l: 'Surface (m²)' }, { k: 'U', l: 'U (W/m²·K)' }, { k: 'Text', l: 'Température extérieure (°C)' }] },
      { g: 'Ouvertures' }, { k: 'usagePortes', l: 'Usage des portes', t: 's', o: [['normal', 'Normal'], ['intensif', 'Intensif (× 2)'], ['faible', 'Faible (× 0,6)']], d: 'normal' },
      { k: 'nSaisi', l: 'Renouvellements imposés (vide : table)', u: 'vol/24 h', d: '' },
      { g: 'Denrées' }, { k: 'denrees', l: 'Denrées entrantes (vides : propriétés du produit)', t: 'lignes', d: [{ nom: 'Viande', produit: 'viande', m: 200, Te: 10, Tf: '', t: 24, stock: '', cp1: '', cp2: '', Lf: '', Tc: '', resp: '' }],
        colonnes: [{ k: 'nom', l: 'Denrée', t: 't' }, { k: 'produit', l: 'Produit', t: 's', o: Object.entries(DENREES).map(([k, x]) => [k, x[0]]) }, { k: 'm', l: 'Masse entrante (kg/j)' }, { k: 'Te', l: 'Température d\'entrée (°C)' },
          { k: 'Tf', l: 'Température finale (°C, vide : chambre)' }, { k: 't', l: 'Durée de refroidissement (h)' }, { k: 'stock', l: 'Stock (t, respiration)' }, { k: 'cp1', l: 'cp avant congélation (kJ/kg·K)' },
          { k: 'cp2', l: 'cp congelé (kJ/kg·K)' }, { k: 'Lf', l: 'Chaleur latente (kJ/kg)' }, { k: 'Tc', l: 'Congélation (°C)' }, { k: 'resp', l: 'Respiration (W/t)' }] },
      { g: 'Charges internes' }, { k: 'eclairage', l: 'Éclairage', u: 'W/m²', d: 8 }, { k: 'hEcl', l: 'Durée d\'éclairage', u: 'h/j', d: 4 },
      { k: 'nPers', l: 'Personnes', d: 1 }, { k: 'hPers', l: 'Présence par personne', u: 'h/j', d: 2 }, { k: 'Pautres', l: 'Autres apports (chariot…)', u: 'kW', d: 0 }, { k: 'hAutres', l: 'Durée des autres apports', u: 'h/j', d: 0 },
      { g: 'Évaporateur et groupe' }, { k: 'tFonct', l: 'Temps de fonctionnement (vide : 16 h/j positive, 18 h/j négative)', u: 'h/j', d: '' }, { k: 'securite', l: 'Sécurité', u: '%', d: 10 },
      { k: 'Pvent', l: 'Puissance des ventilateurs de l\'évaporateur (vide : estimée)', u: 'kW', d: '' }, { k: 'pctVent', l: 'Estimation des ventilateurs', u: '% du bilan', d: 5 },
      { k: 'Pdeg', l: 'Puissance des résistances de dégivrage', u: 'kW', d: 0 }, { k: 'nDeg', l: 'Dégivrages par jour', d: '' }, { k: 'dDeg', l: 'Durée d\'un dégivrage', u: 'min', d: 30 }, { k: 'partDeg', l: 'Part du dégivrage restituée à la chambre', u: '%', d: 30 },
      { k: 'dTevap', l: 'Écart chambre − évaporation', u: 'K', d: 8 }, { k: 'Tcond', l: 'Température de l\'air au condenseur (vide : été du climat de l\'étude)', u: '°C', d: '' }, { k: 'etaCarnot', l: 'Rendement par rapport au cycle de Carnot', d: 0.45 },
      { k: 'Pgroupe', l: 'Puissance électrique du groupe (fiche ; vide : estimée)', u: 'kW', d: '' }, { k: 'repGroupe', l: 'Repère du groupe', t: 't', d: 'GF-CF' },
      { k: 'fluide', l: 'Fluide frigorigène', t: 's', o: optFluides, d: 'R449A' }, { k: 'charge', l: 'Charge en fluide (fiche)', u: 'kg', d: '' },
      { k: 'tension', l: 'Tension du groupe', t: 's', o: [['tri', '400 V tri'], ['mono', '230 V mono']], d: 'tri' }],
    calcul: calculerChambre,
    lier(ctx) {
      const L = L_(), c = L && L.climatEtude ? L.climatEtude(ctx.etude) : null;
      if (c) ctx.proposer({ Tcond: c.Tete }, `climat de l'étude (${c.libelle})`);
    },
    versElec(v, e) {
      const out = [], r = v.repGroupe || 'GF-CF';
      if (v.Pcomp > 0) out.push({ rep: r, designation: `Groupe frigorifique de la chambre froide (${nf(v.Pevap, 1)} kW froid)`, type: 'pac', P: Math.round(v.Pcomp * 100) / 100, tension: e.tension || 'tri', regulation: 'contact' });
      if (v.Pvent > 0) out.push({ rep: `${r}-EV`, designation: 'Ventilateurs de l\'évaporateur de la chambre froide', type: 'ventilateur', P: Math.round(v.Pvent * 100) / 100, tension: 'mono', regulation: 'tor' });
      if (v.Pdeg > 0) out.push({ rep: `${r}-DG`, designation: 'Résistances de dégivrage de l\'évaporateur', type: 'resistance', P: Math.round(v.Pdeg * 100) / 100, tension: v.Pdeg > 3.6 ? 'tri' : 'mono', regulation: 'tor' });
      return out;
    },
  };

  return { FLUIDES, SEUILS_FGAZ, controleFgaz, chargeMaxLocal, H0, DIAM_PRINC, DIAM_UI, TUBES_LIQ, gParM, RENOUV, renouvellement, DENREES, chaleurPersonne, pws, xDe, hDe, calculerDrv, calculerFluides, calculerChambre, reprendre, estDX };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = AnnexesFroid;
