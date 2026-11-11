// Évacuations des eaux usées (EU) et des eaux vannes (EV) : appareils repérés par salle et étage, unités de décharge (DU,
// NF EN 12056-2 système I), débit Qww = K √ΣDU, diamètres des branchements, des chutes (ventilation primaire) et des
// collecteurs (écoulement partiellement rempli, Prandtl-Colebrook, pente), vitesse d'autocurage, ventilation.
// Module pur (navigateur, node, tests).
const Evacuation = ((N) => {
  const { nf, num } = N;
  const alerte = (niveau, texte) => ({ niveau, texte });
  // Appareils : [libellé, DU (L/s), Ø de branchement PVC (mm), eaux vannes]
  const APPAREILS = {
    lavabo: ['Lavabo', 0.5, 40, false], laveMains: ['Lave-mains', 0.3, 32, false], douche: ['Douche', 0.6, 40, false], baignoire: ['Baignoire', 0.8, 40, false],
    evier: ['Évier', 0.8, 40, false], videSeau: ['Vide-seau', 2.0, 100, true], wc: ['WC (réservoir 6 L)', 2.0, 100, true], wc9: ['WC (réservoir 9 L)', 2.5, 100, true],
    urinoir: ['Urinoir', 0.5, 50, true], bidet: ['Bidet', 0.5, 40, false], lavelinge: ['Lave-linge', 0.8, 40, false], lavevaisselle: ['Lave-vaisselle', 0.8, 40, false],
    siphonSol: ['Siphon de sol', 0.8, 50, false], condensats: ['Condensats CVC', 0.1, 32, false],
  };
  // Correspondance avec les points de puisage du calcul sanitaire
  const DEPUIS_SANITAIRE = { lavabo: 'lavabo', laveMains: 'laveMains', douche: 'douche', baignoire: 'baignoire', evier: 'evier', videSeau: 'videSeau', wc: 'wc', wcRobinet: 'wc9', urinoir: 'urinoir', bidet: 'bidet', lavelinge: 'lavelinge', lavevaisselle: 'lavevaisselle' };
  const USAGES = { logement: ['Logements, bureaux (K = 0,5)', 0.5], collectif: ['Hôpitaux, écoles, restaurants, hôtels (K = 0,7)', 0.7], public: ['Sanitaires et douches publics (K = 1,0)', 1.0], labo: ['Laboratoires, industrie (K = 1,2)', 1.2] };
  // Tubes PVC évacuation (NF EN 1329) : diamètre extérieur, épaisseur
  const PVC = [[32, 1.8], [40, 1.9], [50, 2.0], [63, 2.4], [75, 2.6], [80, 2.6], [90, 2.8], [100, 3.0], [110, 3.2], [125, 3.2], [140, 3.5], [160, 4.0], [200, 4.9], [250, 6.2]];
  // Chutes à ventilation primaire, culottes à 87° (NF EN 12056-2, système I) : Ø et débit maximal (L/s)
  const CHUTES = [[63, 0.5], [75, 1.5], [90, 2.0], [100, 4.0], [125, 5.8], [160, 9.5], [200, 16.0]];
  // Débit à pleine section (Prandtl-Colebrook, kb = 1 mm, eau à 10 °C) et rapport de remplissage
  const pleine = (di, I) => { const D = di / 1000, g = 9.81, nu = 1.31e-6, kb = 0.001, a = Math.sqrt(2 * g * D * I); const v = -2 * a * Math.log10(2.51 * nu / (D * a) + kb / (3.71 * D)); return { v, Q: v * Math.PI * D * D / 4 * 1000 }; };
  // Section partiellement remplie : Q/Qp et v/vp selon h/d
  const partiel = hd => { const th = 2 * Math.acos(1 - 2 * hd), A = (th - Math.sin(th)) / (2 * Math.PI), P = th / (2 * Math.PI), R = A / P; return { q: A * R ** (2 / 3), v: R ** (2 / 3) }; };

  function calculer(e) {
    const alertes = [], K = (USAGES[e.usage] || USAGES.logement)[1], hdMax = num(e.hd, 50) / 100, pente = num(e.pente, 1) / 100;
    const tr = (e.troncons || []).filter(x => x && x.rep).map(x => ({ x, rep: String(x.rep).trim(), amont: String(x.amont || '').trim(), nom: x.nom || '', L: num(x.L), sorte: x.sorte || 'collecteur', I: x.pente !== '' && x.pente !== undefined && num(x.pente) > 0 ? num(x.pente) / 100 : pente, enfants: [], app: [] }));
    const parRep = new Map(); tr.forEach(t => { if (parRep.has(t.rep)) alertes.push(alerte('erreur', `Repère ${t.rep} en double.`)); else parRep.set(t.rep, t); });
    // Ici « amont » désigne le tronçon qui reçoit les eaux (en aval) : on décrit le réseau depuis le rejet
    const racines = []; tr.forEach(t => { const p = t.amont && parRep.get(t.amont); if (t.amont && !p) alertes.push(alerte('erreur', `${t.rep} : tronçon « ${t.amont} » introuvable.`)); if (p && p !== t) p.enfants.push(t); else racines.push(t); });
    const apps = (e.appareils || []).filter(a => a && (a.rep || a.type)).map((a, i) => { const A = APPAREILS[a.type] || APPAREILS.lavabo, t = parRep.get(String(a.troncon || '').trim());
      const o = { rep: a.rep || `EV${i + 1}`, salle: a.salle || '', etage: a.etage || '', type: a.type || 'lavabo', A, du: num(a.du) > 0 ? num(a.du) : A[1], t };
      if (!t) alertes.push(alerte('erreur', `${o.rep} (${o.salle || A[0]}) : rattachez l'appareil à un tronçon.`)); else t.app.push(o); return o; });
    if (!apps.length) alertes.push(alerte('attention', 'Ajoutez les appareils (lavabos, WC, douches…) et rattachez-les aux tronçons.'));
    const cumul = t => { t.enfants.forEach(cumul); t.tous = [...t.app, ...t.enfants.flatMap(c => c.tous)]; t.sdu = t.tous.reduce((a, o) => a + o.du, 0); t.duMax = t.tous.reduce((a, o) => Math.max(a, o.du), 0);
      t.ev = t.tous.some(o => o.A[3]); t.wc = t.tous.some(o => o.A[2] >= 100); t.dMin = t.tous.reduce((a, o) => Math.max(a, o.A[2]), 0); t.dEnf = t.enfants.reduce((a, c) => Math.max(a, c.d || 0), 0); };
    // Dimensionnement : de l'amont des eaux vers le rejet (enfants d'abord)
    const dim = t => {
      t.enfants.forEach(dim);
      cumul(t);
      t.Q = Math.max(K * Math.sqrt(t.sdu), t.duMax);
      const base = Math.max(t.dMin, ...t.enfants.map(c => c.d || 0));
      if (t.sorte === 'chute') {
        const c = CHUTES.find(([d, q]) => d >= base && q >= t.Q) || CHUTES[CHUTES.length - 1]; t.d = c[0]; t.cap = c[1];
        if (t.Q > c[1]) alertes.push(alerte('erreur', `${t.rep} : ${nf(t.Q, 2)} L/s dépasse la capacité d'une chute Ø ${c[0]} à ventilation primaire : ventilation secondaire ou chutes séparées.`));
        t.v = null; t.hd = null;
      } else {
        const ok = PVC.map(([de, ep]) => { const di = de - 2 * ep, p = pleine(di, t.I), pr = partiel(hdMax); return { de, di, Qmax: p.Q * pr.q, vp: p.v, Qp: p.Q }; }).filter(x => x.de >= base);
        const c = ok.find(x => x.Qmax >= t.Q) || ok[ok.length - 1] || { de: base, di: base * 0.94, Qmax: 0, vp: 0, Qp: 1 };
        t.d = c.de; t.cap = c.Qmax;
        // Remplissage réel : h/d tel que Q = Qp × q(h/d) (dichotomie)
        let lo = 0.01, hi = 0.99; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (c.Qp * partiel(m).q < t.Q) lo = m; else hi = m; } t.hd = (lo + hi) / 2; t.v = c.vp * partiel(t.hd).v;
        if (t.Q > c.Qmax) alertes.push(alerte('erreur', `${t.rep} : ${nf(t.Q, 2)} L/s au-delà de la capacité du plus grand tube à ${nf(t.I * 100, 1)} % : augmenter la pente ou dédoubler.`));
        if (t.v < 0.5 && t.sorte === 'collecteur') alertes.push(alerte('attention', `${t.rep} : vitesse ${nf(t.v, 2)} m/s sous 0,5 m/s (autocurage) : augmenter la pente.`));
        if (t.I < 0.01) alertes.push(alerte('attention', `${t.rep} : pente de ${nf(t.I * 100, 1)} %, 1 % minimum conseillé pour les collecteurs (DTU 60.11).`));
        if (t.sorte === 'branchement' && t.L > 4 && !t.wc) alertes.push(alerte('attention', `${t.rep} : branchement de ${nf(t.L, 1)} m (> 4 m) : clapet d'admission d'air ou ventilation secondaire.`));
        if (t.sorte === 'branchement' && t.wc && t.L > 1.5) alertes.push(alerte('attention', `${t.rep} : branchement de WC de ${nf(t.L, 1)} m : le garder court (1,5 m conseillé) ou le ventiler.`));
      }
    };
    racines.forEach(dim);
    const chutes = tr.filter(t => t.sorte === 'chute');
    if (chutes.length) alertes.push(alerte('ok', `${chutes.length} chute(s) prolongée(s) en ventilation primaire hors toiture, Ø au moins égal à celui de la chute (DTU 60.11).`));
    const tot = racines.reduce((a, t) => a + t.Q, 0);
    if (racines.length) alertes.push(alerte('ok', `Rejet : ${nf(tot, 2)} L/s (K = ${nf(K, 1)}) ; ${racines.map(t => `${t.rep} Ø ${t.d}`).join(', ')}.`));
    const sorteLib = { chute: 'Chute', collecteur: 'Collecteur', branchement: 'Branchement' };
    return {
      valeurs: { Q: tot, K, troncons: tr.map(t => ({ rep: t.rep, sorte: t.sorte, d: t.d, L: t.L, Q: t.Q, ev: t.ev })), appareils: apps.reduce((o, a) => ({ ...o, [a.type]: (o[a.type] || 0) + 1 }), {}), chutes: chutes.length },
      resume: [['Appareils', `${apps.length} (ΣDU ${nf(apps.reduce((a, o) => a + o.du, 0), 1)} L/s)`], ['Coefficient de simultanéité', `K = ${nf(K, 1)}`], ['Débit au rejet', `${nf(tot, 2)} L/s`],
        ...racines.map(t => [`Rejet ${t.rep}`, `PVC Ø ${t.d} mm${t.v ? ` · pente ${nf(t.I * 100, 1)} % · ${nf(t.v, 2)} m/s · remplissage ${nf(t.hd * 100, 0)} %` : ''}`])],
      tableaux: [{ titre: 'Tronçons (débit Qww = K √ΣDU, au moins le plus grand DU)', entetes: ['Tronçon', 'Nature', 'Se rejette dans', 'Appareils', 'ΣDU (L/s)', 'Qww (L/s)', 'Ø PVC (mm)', 'Pente (%)', 'Remplissage', 'v (m/s)', 'Capacité (L/s)', 'Réseau'],
        lignes: tr.map(t => [t.rep, sorteLib[t.sorte] || t.sorte, t.amont || 'rejet', String(t.tous.length), nf(t.sdu, 1), nf(t.Q, 2), String(t.d), t.sorte === 'chute' ? '—' : nf(t.I * 100, 1), t.hd ? `${nf(t.hd * 100, 0)} %` : '—', t.v ? nf(t.v, 2) : '—', nf(t.cap, 2), t.ev ? 'EV (ou EU + EV)' : 'EU']) },
      { titre: 'Appareils et branchements', entetes: ['Repère', 'Salle', 'Étage', 'Appareil', 'DU (L/s)', 'Ø de branchement mini (mm)', 'Tronçon'], lignes: apps.map(a => [a.rep, a.salle, a.etage, a.A[0], nf(a.du, 1), String(a.A[2]), a.t ? a.t.rep : '—']) }],
      alertes,
      hypotheses: ['Unités de décharge et coefficients K de la NF EN 12056-2 (système I) ; Qww = K √ΣDU, au moins le plus grand DU raccordé.', `Collecteurs et branchements : écoulement à surface libre, Prandtl-Colebrook (kb = 1 mm), remplissage maximal ${nf(hdMax * 100, 0)} %.`,
        'Chutes à ventilation primaire, culottes à 87°, capacités de la NF EN 12056-2 ; Ø 100 mini en aval d\'un WC ; diamètre jamais réduit vers l\'aval.'],
      synthese: `${apps.length} appareils · ${nf(tot, 2)} L/s au rejet`,
    };
  }

  N.TYPES.evacuation = {
    titre: 'Évacuations eaux usées et eaux vannes (EU / EV)', icone: '🚽', famille: 'Hydraulique',
    description: 'Appareils par salle et étage, unités de décharge, diamètres des branchements, chutes et collecteurs selon la pente, vitesse d\'autocurage et ventilation (NF EN 12056-2, DTU 60.11).',
    champs: [{ g: 'Réseau' }, { k: 'usage', l: 'Usage (coefficient K)', t: 's', o: Object.entries(USAGES).map(([k, u]) => [k, u[0]]), d: 'logement' },
      { k: 'pente', l: 'Pente par défaut des collecteurs', u: '%', d: 1 }, { k: 'hd', l: 'Remplissage maximal', u: '%', d: 50 },
      { k: 'sanitaire', l: 'Appareils repris du calcul sanitaire (bouton « Reprendre les appareils »)', t: 's', o: (e, et) => [['', '—'], ...(et ? (et.notes || []).map((n, i) => [n, i]).filter(([n]) => n.type === 'sanitaire').map(([n, i]) => [n.id, `N${i + 1} — ${n.titre}`]) : e.sanitaire ? [[e.sanitaire, e.sanitaire]] : [])], d: '' },
      { g: 'Tronçons et appareils' },
      { k: 'troncons', l: 'Tronçons, décrits depuis le rejet (« se rejette dans » vide = sortie vers le réseau public)', t: 'lignes', d: [
        { rep: 'COL', amont: '', nom: 'Collecteur sous dallage', sorte: 'collecteur', L: 15, pente: '' }, { rep: 'CH1', amont: 'COL', nom: 'Chute sanitaires', sorte: 'chute', L: 6, pente: '' },
        { rep: 'B1', amont: 'CH1', nom: 'Branchement WC', sorte: 'branchement', L: 1.2, pente: 2 }, { rep: 'B2', amont: 'CH1', nom: 'Branchement lavabos', sorte: 'branchement', L: 3, pente: 2 }],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'amont', l: 'Se rejette dans', t: 's', o: N.optAmont('troncons', '— (réseau public)'), libre: true }, { k: 'nom', l: 'Désignation', t: 't' }, { k: 'sorte', l: 'Nature', t: 's', o: [['collecteur', 'Collecteur'], ['chute', 'Chute'], ['branchement', 'Branchement']] },
          { k: 'L', l: 'Longueur (m)' }, { k: 'pente', l: 'Pente (%) (vide : par défaut)' }] },
      { k: 'appareils', l: 'Appareils, une ligne par appareil', t: 'lignes', d: [
        { rep: 'WC-01', salle: 'Sanitaires H', etage: 'R+1', type: 'wc', troncon: 'B1' }, { rep: 'LV-01', salle: 'Sanitaires H', etage: 'R+1', type: 'lavabo', troncon: 'B2' }, { rep: 'LV-02', salle: 'Sanitaires F', etage: 'R+1', type: 'lavabo', troncon: 'B2' }],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'salle', l: 'Salle', t: 't', lst: (e, et) => N.lieuxEtude(et).salles }, { k: 'etage', l: 'Étage', t: 't', lst: (e, et) => N.lieuxEtude(et).etages }, { k: 'type', l: 'Appareil', t: 's', o: Object.entries(APPAREILS).map(([k, a]) => [k, a[0]]) },
          { k: 'troncon', l: 'Tronçon', t: 's', o: e => [['', '—'], ...(e.troncons || []).filter(t => t.rep).map(t => [t.rep, `${t.rep}${t.nom ? ` — ${t.nom}` : ''}`])] }, { k: 'du', l: 'DU fiche (L/s)' }] }],
    calcul: calculer,
  };
  // Appareils d'un calcul sanitaire convertis en appareils d'évacuation (tronçon à choisir)
  const depuisSanitaire = points => (points || []).filter(p => p && DEPUIS_SANITAIRE[p.type]).map(p => ({ rep: p.rep || '', salle: p.salle || '', etage: p.etage || '', type: DEPUIS_SANITAIRE[p.type], troncon: '', du: '' }));
  return { APPAREILS, USAGES, calculer, depuisSanitaire, pleine, partiel };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = Evacuation;
