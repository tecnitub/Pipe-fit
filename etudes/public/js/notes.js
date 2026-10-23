// Types de notes de calcul du bureau d'études : champs de saisie (valeurs par défaut, conditions d'affichage) et calcul.
// Chaque calcul renvoie { valeurs (nombres bruts), resume [[libellé, texte]], tableaux, alertes, hypotheses, synthese }.
const Notes = ((D, C) => {
  const nf = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const num = (v, def = 0) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : def; };
  const alerte = (niveau, texte) => ({ niveau, texte });
  // Catalogue de pompes et de vannes (gamme générique ou catalogues fournisseurs importés)
  const Cat = () => (typeof Catalogue !== 'undefined' ? Catalogue : require('./catalogue'));
  const libPompe = p => `${p.fabricant === 'Gamme générique' ? '' : `${p.fabricant} `}${p.modele}${p.dn ? ` (DN ${p.dn})` : ''}, vitesse ≈ ${nf(Math.min(1, p.vitesse) * 100, 0)} %`;
  const libVanne = v => `${v.fabricant === 'Gamme générique' ? '' : `${v.fabricant} `}${v.modele}${v.dn && !/DN/.test(v.modele) ? ` (DN ${v.dn})` : ''}`;

  /* ---------- Listes de choix ---------- */
  const optFluides = [['eau', 'Eau'], ...Object.entries(D.GLYCOLS).map(([k, g]) => [k, g.libelle]), ['perso', 'Autre fluide (propriétés saisies)']];
  const optSeries = (filtre = () => true) => Object.entries(D.SERIES).filter(([k, s]) => filtre(k, s)).map(([k, s]) => [k, s.libelle]);
  const optTubes = e => C.tubes(e.serie || 'acier-10216').map(t => [t.cle, t.nom]);
  const optMateriaux = Object.entries(D.MATERIAUX).map(([k, m]) => [k, m.libelle]);
  const optIsolants = Object.entries(D.ISOLANTS).map(([k, i]) => [k, i.libelle]);
  const champsFluide = [
    { k: 'fluide', l: 'Fluide', t: 's', o: optFluides, d: 'eau' },
    { k: 'T', l: 'Température moyenne du fluide', u: '°C', d: 70 },
    { k: 'rho', l: 'Masse volumique', u: 'kg/m³', d: 1000, si: e => e.fluide === 'perso' },
    { k: 'cp', l: 'Capacité thermique massique', u: 'kJ/kg·K', d: 4.18, si: e => e.fluide === 'perso' },
    { k: 'mu', l: 'Viscosité dynamique', u: 'mPa·s', d: 1, si: e => e.fluide === 'perso' },
  ];
  const fluideDe = e => C.liquide(e.fluide, num(e.T, 20), { rho: e.rho, cp: e.cp, mu: e.mu });
  const alertesFluide = (e, f) => {
    const out = [];
    if (f.gel !== null && f.gel !== undefined && num(e.T) < f.gel + 3) out.push(alerte('erreur', `Température proche ou en dessous du point de congélation du fluide (${nf(f.gel, 1)} °C).`));
    if (f.horsPlage) out.push(alerte('attention', 'Température hors de la plage des données du mélange glycolé : propriétés extrapolées.'));
    if ((!e.fluide || e.fluide === 'eau') && (num(e.T) > 150 || num(e.T) < 0)) out.push(alerte('attention', 'Propriétés de l\'eau valables de 0 à 150 °C (eau liquide sous pression au-delà de 100 °C).'));
    return out;
  };
  const libelleFluide = (e, f) => `${f.libelle} à ${nf(num(e.T), 0)} °C : ρ = ${nf(f.rho, 1)} kg/m³, cp = ${nf(f.cp / 1000, 3)} kJ/kg·K, μ = ${nf(f.mu * 1000, 3)} mPa·s`;
  const HYP_DARCY = ['Pertes de charge linéiques : Darcy-Weisbach, ΔP = λ · L/Di · ρv²/2 ; λ par Colebrook-White en régime turbulent, 64/Re en laminaire.',
    'Pertes de charge singulières : ΔP = Σζ · ρv²/2.'];

  /* ---------- Débit ↔ puissance ---------- */
  // Débit volumique (m³/h) d'après le mode de saisie : débit direct ou puissance / écart de température
  function debitHydraulique(e, f) {
    if (e.mode === 'puissance') { const dT = num(e.dT, 0); return dT > 0 ? num(e.P) * 1000 / (f.rho * f.cp * dT) * 3600 : 0; }
    return num(e.Q);
  }
  const champsDebit = [
    { k: 'mode', l: 'Saisie du débit', t: 's', o: [['debit', 'Débit volumique'], ['puissance', 'Puissance et écart de température']], d: 'puissance' },
    { k: 'Q', l: 'Débit', u: 'm³/h', d: 10, si: e => e.mode !== 'puissance' },
    { k: 'P', l: 'Puissance', u: 'kW', d: 150, si: e => e.mode === 'puissance' },
    { k: 'dT', l: 'Écart de température (départ − retour)', u: 'K', d: 15, si: e => e.mode === 'puissance' },
  ];

  const TYPES = {};

  /* ---------- 1. Dimensionnement d'une tuyauterie (liquide) ---------- */
  TYPES.tuyauterie = {
    titre: 'Dimensionnement de tuyauterie (eau, eau glycolée)', icone: '🔧', famille: 'Hydraulique',
    description: 'Choix du diamètre selon la vitesse et la perte de charge linéique admissibles ; comparaison de tous les diamètres de la série.',
    champs: [{ g: 'Fluide' }, ...champsFluide, { g: 'Débit' }, ...champsDebit,
      { g: 'Tuyauterie' }, { k: 'serie', l: 'Série de tubes', t: 's', o: optSeries(), d: 'acier-10216' },
      { k: 'rug', l: 'Rugosité absolue (vide : valeur de la série)', u: 'mm', d: '' },
      { k: 'L', l: 'Longueur développée du tronçon', u: 'm', d: 50 }, { k: 'zeta', l: 'Somme des coefficients singuliers Σζ', d: 5 },
      { g: 'Critères' }, { k: 'vmax', l: 'Vitesse maximale', u: 'm/s', d: 1.5 }, { k: 'Rmax', l: 'Perte de charge linéique maximale', u: 'Pa/m', d: 150 },
      { k: 'vmin', l: 'Vitesse minimale (dégazage, dépôts)', u: 'm/s', d: 0.3 }],
    calcul(e) {
      const f = fluideDe(e), Q = debitHydraulique(e, f), qv = Q / 3600, s = D.SERIES[e.serie], rug = e.rug !== '' && e.rug !== undefined ? num(e.rug, s.rugosite) : s.rugosite;
      const L = num(e.L), Z = num(e.zeta), vmax = num(e.vmax, 1.5), Rmax = num(e.Rmax, 150);
      const lignes = C.tubes(e.serie).map(t => {
        const x = C.ecoulement(qv, t.di / 1000, f.rho, f.mu, rug), dp = x.R * L + Z * x.pd;
        return { t, ...x, dp, ok: x.v <= vmax && x.R <= Rmax };
      });
      const choix = lignes.find(l => l.ok), alertes = alertesFluide(e, f);
      if (!(Q > 0)) alertes.push(alerte('erreur', 'Débit nul : saisir un débit ou une puissance et un écart de température.'));
      else if (!choix) alertes.push(alerte('erreur', 'Aucun diamètre de la série ne respecte les critères : choisir une autre série ou assouplir les critères.'));
      else {
        alertes.push(alerte('ok', `Diamètre retenu : ${choix.t.nom} — v = ${nf(choix.v)} m/s, R = ${nf(choix.R, 0)} Pa/m.`));
        if (choix.v < num(e.vmin, 0)) alertes.push(alerte('attention', `Vitesse inférieure à ${nf(num(e.vmin), 2)} m/s : risque de dépôts et de mauvaise évacuation de l'air.`));
        if (choix.regime !== 'turbulent') alertes.push(alerte('attention', `Écoulement ${choix.regime} (Re = ${nf(choix.Re, 0)}).`));
      }
      return {
        valeurs: { Q, qm: qv * f.rho * 3600, rho: f.rho, choix: choix ? choix.t.cle : null, v: choix ? choix.v : NaN, R: choix ? choix.R : NaN, dp: choix ? choix.dp : NaN },
        resume: [['Débit volumique', `${nf(Q, 2)} m³/h (${nf(qv * 1000, 2)} L/s)`], ['Débit massique', `${nf(qv * f.rho * 3600, 0)} kg/h`],
          ['Diamètre retenu', choix ? choix.t.nom : '—'], ['Diamètre intérieur', choix ? `${nf(choix.t.di, 1)} mm` : '—'], ['Vitesse', choix ? `${nf(choix.v)} m/s` : '—'],
          ['Perte de charge linéique', choix ? `${nf(choix.R, 0)} Pa/m` : '—'], ['Perte de charge du tronçon', choix ? `${nf(choix.dp / 1000, 2)} kPa (${nf(choix.dp / (f.rho * C.G), 2)} mCE)` : '—'],
          ['Reynolds / régime', choix ? `${nf(choix.Re, 0)} — ${choix.regime}` : '—']],
        tableaux: [{ titre: 'Comparaison des diamètres', entetes: ['Tube', 'Di (mm)', 'v (m/s)', 'R (Pa/m)', 'Re', `ΔP ${nf(L, 0)} m + Σζ (kPa)`, 'Critères'],
          lignes: lignes.map(l => [l.t.nom, nf(l.t.di, 1), nf(l.v), nf(l.R, 0), nf(l.Re, 0), nf(l.dp / 1000, 2), l.ok ? 'OK' : l.v > vmax ? 'vitesse' : 'perte de charge']),
          surligne: choix ? lignes.indexOf(choix) : -1 }],
        alertes,
        hypotheses: [libelleFluide(e, f), e.mode === 'puissance' ? `Débit : qv = P / (ρ · cp · ΔT) avec P = ${nf(num(e.P), 1)} kW et ΔT = ${nf(num(e.dT), 1)} K.` : 'Débit saisi.',
          `${s.libelle}, rugosité ${nf(rug, 3)} mm.`, ...HYP_DARCY, `Critères : v ≤ ${nf(vmax)} m/s et R ≤ ${nf(Rmax, 0)} Pa/m ; le plus petit diamètre conforme est retenu.`],
        synthese: choix ? `${choix.t.nom} · ${nf(Q, 2)} m³/h · ${nf(choix.v)} m/s · ${nf(choix.R, 0)} Pa/m` : 'Aucun diamètre conforme',
      };
    },
  };

  /* ---------- 2. Réseau hydraulique : circuit le plus défavorisé, HMT de la pompe ---------- */
  TYPES.reseau = {
    titre: 'Pertes de charge d\'un réseau hydraulique et choix de pompe', icone: '🌀', famille: 'Hydraulique',
    description: 'Tronçons du circuit le plus défavorisé (aller + retour), équipements, hauteur manométrique et puissance de la pompe.',
    champs: [{ g: 'Fluide' }, ...champsFluide, { g: 'Réseau' },
      { k: 'serie', l: 'Série de tubes', t: 's', o: optSeries(), d: 'acier-10216' },
      { k: 'circuit', l: 'Type de circuit', t: 's', o: [['ferme', 'Circuit fermé (chauffage, eau glacée)'], ['ouvert', 'Circuit ouvert (transfert, process)']], d: 'ferme' },
      { k: 'Hgeo', l: 'Hauteur géométrique à vaincre', u: 'm', d: 0, si: e => e.circuit === 'ouvert' },
      { k: 'vmax', l: 'Vitesse maximale (dimensionnement auto)', u: 'm/s', d: 1.5 }, { k: 'Rmax', l: 'Perte linéique maxi (dimensionnement auto)', u: 'Pa/m', d: 150 },
      { k: 'troncons', l: 'Tronçons', t: 'lignes', d: [
        { rep: 'T1 — chaufferie → collecteur', Q: 12, tube: '', L: 24, zeta: 6 },
        { rep: 'T2 — collecteur → nourrice R+1', Q: 6, tube: '', L: 38, zeta: 4.5 },
        { rep: 'T3 — nourrice → CTA', Q: 3, tube: '', L: 16, zeta: 8 }],
      colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'Q', l: 'Débit (m³/h)' }, { k: 'tube', l: 'Tube', t: 's', o: e => [['', 'Auto'], ...optTubes(e)] },
        { k: 'L', l: 'Longueur aller + retour (m)' }, { k: 'zeta', l: 'Σζ' }] },
      { k: 'composants', l: 'Équipements et accessoires (pertes de charge constructeur)', t: 'lignes', d: [
        { nom: 'Générateur / échangeur', dp: 15 }, { nom: 'Batterie CTA', dp: 20 }, { nom: 'Vanne de régulation', dp: 20 }, { nom: 'Vanne d\'équilibrage', dp: 5 }],
      colonnes: [{ k: 'nom', l: 'Équipement', t: 't' }, { k: 'dp', l: 'ΔP (kPa)' }] },
      { g: 'Pompe' }, { k: 'marge', l: 'Marge de sécurité sur la HMT', u: '%', d: 10 }, { k: 'rendement', l: 'Rendement global de la pompe', u: '%', d: 55 }],
    calcul(e) {
      const f = fluideDe(e), s = D.SERIES[e.serie], tubes = C.tubes(e.serie), vmax = num(e.vmax, 1.5), Rmax = num(e.Rmax, 150), alertes = alertesFluide(e, f);
      const tr = (e.troncons || []).map((x, i) => {
        const Q = num(x.Q), qv = Q / 3600;
        let t = x.tube ? tubes.find(y => y.cle === x.tube) : null, auto = false;
        if (!t) { auto = true; t = tubes.find(y => { const r = C.ecoulement(qv, y.di / 1000, f.rho, f.mu, s.rugosite); return r.v <= vmax && r.R <= Rmax; }) || tubes[tubes.length - 1]; }
        const r = C.ecoulement(qv, t.di / 1000, f.rho, f.mu, s.rugosite), dpl = r.R * num(x.L), dps = num(x.zeta) * r.pd;
        if (r.v > vmax * 1.001) alertes.push(alerte('attention', `${x.rep || `Tronçon ${i + 1}`} : vitesse ${nf(r.v)} m/s supérieure à ${nf(vmax)} m/s.`));
        return { rep: x.rep || `Tronçon ${i + 1}`, Q, L: num(x.L), zeta: num(x.zeta), t, auto, ...r, dpl, dps, dp: dpl + dps };
      });
      const comp = (e.composants || []).map(c => ({ nom: c.nom || 'Équipement', dp: num(c.dp) * 1000 }));
      const dpRes = tr.reduce((a, x) => a + x.dp, 0), dpComp = comp.reduce((a, x) => a + x.dp, 0);
      const Hgeo = e.circuit === 'ouvert' ? num(e.Hgeo) : 0, dpTot = dpRes + dpComp + Hgeo * f.rho * C.G;
      const marge = num(e.marge, 10), HMT = dpTot * (1 + marge / 100) / (f.rho * C.G), Qp = tr.reduce((a, x) => Math.max(a, x.Q), 0);
      const Ph = Qp / 3600 * HMT * f.rho * C.G, Pabs = Ph / (num(e.rendement, 55) / 100);
      const choixPompes = Cat().pompesPour(Qp, HMT);
      if (!tr.length) alertes.push(alerte('erreur', 'Ajouter au moins un tronçon.'));
      else if (!choixPompes.length) alertes.push(alerte('attention', `Aucune pompe du catalogue ${Cat().generique().pompes ? 'générique ' : ''}ne couvre ${nf(Qp, 2)} m³/h sous ${nf(HMT, 2)} mCE : pompes en parallèle ou gamme plus puissante.`));
      if (tr.length) alertes.push(alerte('ok', `Pompe : ${nf(Qp, 2)} m³/h sous ${nf(HMT, 2)} mCE (${nf(HMT * f.rho * C.G / 1000, 1)} kPa), puissance absorbée ≈ ${nf(Pabs / 1000, 2)} kW.`));
      return {
        valeurs: { dpReseau: dpRes, dpComposants: dpComp, dpTotal: dpTot, HMT, Qpompe: Qp, Ph, Pabs, pompe: choixPompes[0] || null, troncons: tr.map(x => ({ rep: x.rep, serie: e.serie, tube: x.t.cle, dn: x.t.dn, L: x.L })) },
        resume: [['Pertes de charge des tuyauteries', `${nf(dpRes / 1000, 2)} kPa`], ['Pertes de charge des équipements', `${nf(dpComp / 1000, 2)} kPa`],
          ...(Hgeo ? [['Hauteur géométrique', `${nf(Hgeo, 2)} m`]] : []), ['Perte de charge totale', `${nf(dpTot / 1000, 2)} kPa (${nf(dpTot / (f.rho * C.G), 2)} mCE)`],
          ['Débit de la pompe', `${nf(Qp, 2)} m³/h`], [`HMT avec marge de ${nf(marge, 0)} %`, `${nf(HMT, 2)} mCE`], ['Puissance hydraulique', `${nf(Ph / 1000, 3)} kW`], ['Puissance absorbée estimée', `${nf(Pabs / 1000, 2)} kW`],
          ['Pompe proposée', choixPompes.length ? libPompe(choixPompes[0]) : '—']],
        tableaux: [{ titre: 'Tronçons', entetes: ['Repère', 'Q (m³/h)', 'Tube', 'L (m)', 'v (m/s)', 'R (Pa/m)', 'ΔP lin. (kPa)', 'Σζ', 'ΔP sing. (kPa)', 'ΔP (kPa)'],
          lignes: [...tr.map(x => [x.rep, nf(x.Q, 2), `${x.t.nom}${x.auto ? ' (auto)' : ''}`, nf(x.L, 1), nf(x.v), nf(x.R, 0), nf(x.dpl / 1000, 2), nf(x.zeta, 1), nf(x.dps / 1000, 2), nf(x.dp / 1000, 2)]),
            ['Total tuyauteries', '', '', '', '', '', '', '', '', nf(dpRes / 1000, 2)]], total: true },
          ...(comp.length ? [{ titre: 'Équipements', entetes: ['Équipement', 'ΔP (kPa)'], lignes: [...comp.map(c => [c.nom, nf(c.dp / 1000, 2)]), ['Total équipements', nf(dpComp / 1000, 2)]], total: true }] : []),
          ...(choixPompes.length ? [{ titre: `Pompes du catalogue adaptées (${Cat().generique().pompes ? 'gamme générique : importer le catalogue fournisseur dans les Réglages' : 'catalogue importé'})`,
            entetes: ['Modèle', 'Type', 'DN', 'Hmax (m)', 'Qmax (m³/h)', 'Vitesse au point', 'P1 maxi (W)'], lignes: choixPompes.slice(0, 5).map(p => [`${p.fabricant === 'Gamme générique' ? '' : `${p.fabricant} `}${p.modele}`, p.type, String(p.dn || '—'), nf(p.Hmax, 1), nf(p.Qmax, 1), `${nf(Math.min(1, p.vitesse) * 100, 0)} %`, p.P1 ? nf(p.P1, 0) : '—']), surligne: 0 }] : [])],
        alertes,
        hypotheses: [libelleFluide(e, f), `${s.libelle}, rugosité ${nf(s.rugosite, 3)} mm. Tube « auto » : plus petit diamètre avec v ≤ ${nf(vmax)} m/s et R ≤ ${nf(Rmax, 0)} Pa/m.`, ...HYP_DARCY,
          'Les tronçons décrivent le circuit le plus défavorisé, aller et retour. Débit de la pompe : débit du tronçon le plus chargé.',
          `HMT = ΔP totale × (1 + marge) / (ρ · g) ; puissance absorbée = ρ · g · Q · HMT / η (η = ${nf(num(e.rendement, 55), 0)} %).`],
        synthese: `${nf(Qp, 2)} m³/h · HMT ${nf(HMT, 2)} mCE · ${nf(Pabs / 1000, 2)} kW`,
      };
    },
  };

  /* ---------- 3. Vanne de régulation : Kvs et autorité ---------- */
  TYPES.vanne = {
    titre: 'Vanne de régulation : Kvs et autorité', icone: '🎚️', famille: 'Hydraulique',
    description: 'Coefficient de débit, Kvs normalisé, perte de charge réelle et autorité de la vanne.',
    champs: [{ g: 'Fluide' }, ...champsFluide, { g: 'Débit' }, ...champsDebit, { g: 'Vanne' },
      { k: 'methode', l: 'Méthode', t: 's', o: [['autorite', 'Autorité visée sur le circuit à débit variable'], ['dp', 'Perte de charge imposée']], d: 'autorite' },
      { k: 'dpCircuit', l: 'Perte de charge du circuit à débit variable (hors vanne)', u: 'kPa', d: 20, si: e => e.methode !== 'dp' },
      { k: 'beta', l: 'Autorité visée', d: 0.5, si: e => e.methode !== 'dp' },
      { k: 'dpVanne', l: 'Perte de charge souhaitée dans la vanne', u: 'kPa', d: 20, si: e => e.methode === 'dp' },
      { k: 'type', l: 'Type de vanne', t: 's', o: [['2v', 'Deux voies'], ['3v', 'Trois voies (mélange / répartition)']], d: '2v' }],
    calcul(e) {
      const f = fluideDe(e), Q = debitHydraulique(e, f), alertes = alertesFluide(e, f), beta = Math.min(0.95, Math.max(0.05, num(e.beta, 0.5)));
      const dpCirc = num(e.dpCircuit), dpVise = e.methode === 'dp' ? num(e.dpVanne) : beta / (1 - beta) * dpCirc;
      const Kv = dpVise > 0 ? C.kv(Q, dpVise, f.rho) : NaN, Kvs = D.KVS.find(k => k >= Kv * 0.97) || null;
      const dpReel = Kvs ? C.dpVanne(Q, Kvs, f.rho) : NaN, autorite = e.methode === 'dp' ? NaN : dpReel / (dpReel + dpCirc);
      if (!(Q > 0) || !(dpVise > 0)) alertes.push(alerte('erreur', 'Débit et perte de charge de la vanne doivent être positifs.'));
      else if (!Kvs) alertes.push(alerte('erreur', 'Kv supérieur à la gamme normalisée : prévoir plusieurs vannes en parallèle.'));
      else {
        alertes.push(alerte('ok', `Kvs retenu : ${nf(Kvs, Kvs < 1 ? 2 : 1)} m³/h — ΔP réelle ${nf(dpReel, 1)} kPa${Number.isFinite(autorite) ? `, autorité ${nf(autorite, 2)}` : ''}.`));
        if (Number.isFinite(autorite) && autorite < 0.5) alertes.push(alerte('attention', `Autorité ${nf(autorite, 2)} < 0,5 : régulation imprécise, choisir le Kvs inférieur si la pression disponible le permet.`));
        if (dpReel > 100) alertes.push(alerte('attention', 'Perte de charge supérieure à 100 kPa : vérifier le bruit et la pression différentielle de fermeture.'));
      }
      const voisins = D.KVS.filter(k => k >= Kv / 3 && k <= Kv * 3), modele = Cat().vannePour(Kv, e.type === '3v' ? '3v' : '2v');
      return {
        valeurs: { Q, Kv, Kvs, dpReel, autorite, vanne: modele },
        resume: [['Débit', `${nf(Q, 2)} m³/h`], ['Perte de charge visée', `${nf(dpVise, 1)} kPa`], ['Kv calculé', `${nf(Kv, 2)} m³/h`], ['Kvs retenu', Kvs ? `${nf(Kvs, Kvs < 1 ? 2 : 1)} m³/h` : '—'],
          ['Perte de charge réelle', `${nf(dpReel, 1)} kPa`], ...(Number.isFinite(autorite) ? [['Autorité réelle', nf(autorite, 2)]] : []),
          ['Vanne proposée', modele ? libVanne(modele) : 'Aucune vanne du catalogue']],
        tableaux: [{ titre: 'Kvs normalisés voisins', entetes: ['Kvs (m³/h)', 'ΔP vanne (kPa)', ...(e.methode === 'dp' ? [] : ['Autorité'])],
          lignes: voisins.map(k => { const d = C.dpVanne(Q, k, f.rho); return [nf(k, k < 1 ? 2 : 1), nf(d, 1), ...(e.methode === 'dp' ? [] : [nf(d / (d + dpCirc), 2)])]; }), surligne: voisins.indexOf(Kvs) }],
        alertes,
        hypotheses: [libelleFluide(e, f), 'Kv = Q · √(ρ/1000 / ΔP) avec Q en m³/h et ΔP en bar ; Kvs : valeur normalisée immédiatement supérieure (série R10).',
          'Autorité β = ΔP vanne / (ΔP vanne + ΔP du circuit à débit variable).', ...(e.type === '3v' ? ['Vanne trois voies : le circuit à débit variable est celui situé entre la vanne et le by-pass (batterie, échangeur…).'] : [])],
        synthese: Kvs ? `Kvs ${nf(Kvs, Kvs < 1 ? 2 : 1)} · ${nf(Q, 2)} m³/h · ${nf(dpReel, 1)} kPa` : 'Hors gamme',
      };
    },
  };

  /* ---------- 4. Vase d'expansion ---------- */
  TYPES.vase = {
    titre: 'Vase d\'expansion fermé (NF EN 12828)', icone: '🫙', famille: 'Hydraulique',
    description: 'Volume d\'expansion, réserve d\'eau, pressions de gonflage et de remplissage, volume nominal du vase.',
    champs: [{ g: 'Installation' }, { k: 'fluide', l: 'Fluide', t: 's', o: optFluides.filter(([k]) => k !== 'perso'), d: 'eau' },
      { k: 'modeV', l: 'Volume d\'eau de l\'installation', t: 's', o: [['saisi', 'Volume connu'], ['estime', 'Estimation d\'après la puissance']], d: 'estime' },
      { k: 'Vinst', l: 'Volume de l\'installation', u: 'L', d: 1500, si: e => e.modeV !== 'estime' },
      { k: 'P', l: 'Puissance installée', u: 'kW', d: 200, si: e => e.modeV === 'estime' },
      { k: 'ratio', l: 'Émetteurs (contenance)', t: 's', o: [['12', 'Radiateurs acier / fonte (12 L/kW)'], ['8', 'Radiateurs alu / panneaux (8 L/kW)'], ['18', 'Plancher chauffant (18 L/kW)'], ['5', 'Ventilo-convecteurs, CTA (5 L/kW)'], ['3', 'Réseau industriel compact (3 L/kW)']], d: '12', si: e => e.modeV === 'estime' },
      { k: 'Vsup', l: 'Volume complémentaire (ballon tampon, réseau enterré…)', u: 'L', d: 0 },
      { g: 'Températures et pressions' }, { k: 'Tmin', l: 'Température de remplissage', u: '°C', d: 10 },
      { k: 'Tmax', l: 'Température maximale (consigne du limiteur, ou ambiance à l\'arrêt pour l\'eau glacée)', u: '°C', d: 90 },
      { k: 'Hst', l: 'Hauteur statique au-dessus du vase', u: 'm', d: 12 }, { k: 'Psv', l: 'Pression de tarage de la soupape', u: 'bar', d: 3 },
      { k: 'marge', l: 'Majoration de la pression de gonflage', u: 'bar', d: 0.2 }, { k: 'p0', l: 'Pression de gonflage imposée (vide : calculée)', u: 'bar', d: '' }],
    calcul(e) {
      const Vinst = e.modeV === 'estime' ? num(e.P) * num(e.ratio, 12) + num(e.Vsup) : num(e.Vinst) + num(e.Vsup);
      const r = C.vaseExpansion({ Vinst, Tmin: num(e.Tmin, 10), Tmax: num(e.Tmax, 90), Hst: num(e.Hst), Psv: num(e.Psv, 3), fluide: e.fluide, marge: num(e.marge, 0.2), p0Impose: num(e.p0, 0) });
      const alertes = [];
      if (!(Vinst > 0)) alertes.push(alerte('erreur', 'Volume de l\'installation nul.'));
      else if (!Number.isFinite(r.Vn)) alertes.push(alerte('erreur', `Pression de gonflage (${nf(r.p0, 2)} bar) supérieure ou égale à la pression finale (${nf(r.pe, 2)} bar) : augmenter le tarage de la soupape ou placer le vase plus haut.`));
      else {
        alertes.push(alerte('ok', r.choisi ? `Vase de ${r.choisi} L (volume nominal calculé ${nf(r.Vn, 1)} L), gonflé à ${nf(r.p0, 2)} bar, remplissage à froid à ${nf(r.pa, 2)} bar.` : `Volume nominal ${nf(r.Vn, 0)} L : prévoir plusieurs vases ou un maintien de pression automatique.`));
        if (r.Vn > 1000) alertes.push(alerte('attention', 'Volume important : comparer avec une station de maintien de pression à compresseur ou à pompe.'));
        if (num(e.Tmax) > 105) alertes.push(alerte('attention', 'Température supérieure à 105 °C : installation à eau surchauffée, pression de vapeur prise en compte et règles des équipements sous pression applicables.'));
      }
      return {
        valeurs: { Vinst, ...r },
        resume: [['Volume de l\'installation', `${nf(Vinst, 0)} L`], ['Coefficient de dilatation', `${nf(r.e * 100, 2)} %`], ['Volume d\'expansion Ve', `${nf(r.Ve, 1)} L`], ['Réserve d\'eau Vwr', `${nf(r.Vwr, 1)} L`],
          ['Pression statique', `${nf(r.pst, 2)} bar`], ...(r.pD > 0 ? [['Pression de vapeur', `${nf(r.pD, 2)} bar`]] : []), ['Pression de gonflage p0', `${nf(r.p0, 2)} bar`],
          ['Pression finale pe', `${nf(r.pe, 2)} bar`], ['Volume nominal calculé Vn', `${nf(r.Vn, 1)} L`], ['Vase retenu', r.choisi ? `${r.choisi} L` : '—'], ['Pression de remplissage à froid', `${nf(r.pa, 2)} bar`]],
        tableaux: [],
        alertes,
        hypotheses: [e.modeV === 'estime' ? `Volume estimé : ${nf(num(e.P), 0)} kW × ${num(e.ratio, 12)} L/kW${num(e.Vsup) ? ` + ${nf(num(e.Vsup), 0)} L` : ''}.` : 'Volume de l\'installation saisi.',
          'Dilatation : e = ρ(Tremplissage) / ρ(Tmax) − 1 ; Ve = e · Vinst ; réserve Vwr = max(0,5 % Vinst ; 3 L).',
          'Pression de gonflage p0 = pression statique + pression de vapeur (au-delà de 100 °C) + majoration.',
          'Pression finale pe = Psv − 0,5 bar (Psv ≤ 5 bar), sinon 0,9 · Psv.', 'Volume nominal Vn = (Ve + Vwr) · (pe + 1) / (pe − p0) — pressions relatives en bar.'],
        synthese: r.choisi ? `${r.choisi} L · p0 ${nf(r.p0, 2)} bar · Ve ${nf(r.Ve, 0)} L` : 'Hors gamme',
      };
    },
  };

  /* ---------- 5. Vapeur saturée ---------- */
  TYPES.vapeur = {
    titre: 'Tuyauterie vapeur saturée et condensats', icone: '♨️', famille: 'Industriel',
    description: 'Diamètre de la conduite vapeur (vitesse, perte de charge en écoulement compressible) et revaporisation des condensats.',
    champs: [{ g: 'Vapeur' }, { k: 'p', l: 'Pression de service', u: 'bar rel.', d: 7 },
      { k: 'mode', l: 'Saisie du débit', t: 's', o: [['debit', 'Débit massique'], ['puissance', 'Puissance thermique de l\'utilisateur']], d: 'debit' },
      { k: 'm', l: 'Débit de vapeur', u: 'kg/h', d: 1500, si: e => e.mode !== 'puissance' }, { k: 'P', l: 'Puissance', u: 'kW', d: 800, si: e => e.mode === 'puissance' },
      { g: 'Tuyauterie' }, { k: 'serie', l: 'Série de tubes', t: 's', o: optSeries(k => /acier-10216|inox-1127/.test(k)), d: 'acier-10216' },
      { k: 'L', l: 'Longueur développée', u: 'm', d: 80 }, { k: 'zeta', l: 'Somme des coefficients singuliers Σζ', d: 8 },
      { g: 'Critères' }, { k: 'vmax', l: 'Vitesse maximale', u: 'm/s', d: 25 }, { k: 'dpmax', l: 'Perte de charge maximale', u: 'bar', d: 0.5 },
      { g: 'Condensats' }, { k: 'pc', l: 'Pression du réseau de retour des condensats', u: 'bar rel.', d: 0 }, { k: 'vflash', l: 'Vitesse maximale de la vapeur de revaporisation', u: 'm/s', d: 15 }],
    calcul(e) {
      const pAbs = num(e.p) + 1.013, sat = C.vapeurSat(pAbs), m = e.mode === 'puissance' ? num(e.P) / sat.r * 3600 : num(e.m), mks = m / 3600;
      const s = D.SERIES[e.serie], vmax = num(e.vmax, 25), dpmax = num(e.dpmax, 0.5), alertes = [];
      const lignes = C.tubes(e.serie).map(t => { const r = C.compressible({ m: mks, Di: t.di / 1000, L: num(e.L), zeta: num(e.zeta), rug: s.rugosite, pEntree: pAbs, rhoDe: p => C.vapeurSat(p).rho, mu: sat.mu }); return { t, ...r, conf: r.ok && r.vmax <= vmax && r.dp <= dpmax }; });
      const choix = lignes.find(l => l.conf);
      // Revaporisation : fraction x = (h'(p1) − h'(p2)) / r(p2) ; conduite de condensats dimensionnée sur le volume de vapeur de flash
      const pcAbs = num(e.pc) + 1.013, sc = C.vapeurSat(pcAbs), x = Math.max(0, (sat.hl - sc.hl) / sc.r), qFlash = x * mks * sc.vg;
      const cond = C.tubes(e.serie).map(t => ({ t, v: qFlash / (Math.PI * (t.di / 1000) ** 2 / 4) })), choixC = cond.find(c => c.v <= num(e.vflash, 15));
      if (sat.horsPlage) alertes.push(alerte('attention', 'Pression hors de la table de vapeur saturée (1 à 25 bar abs) : valeurs extrapolées.'));
      if (!(m > 0)) alertes.push(alerte('erreur', 'Débit de vapeur nul.'));
      else if (!choix) alertes.push(alerte('erreur', 'Aucun diamètre de la série ne respecte les critères.'));
      else alertes.push(alerte('ok', `Conduite vapeur ${choix.t.nom} : ${nf(choix.v, 1)} m/s, ΔP ${nf(choix.dp, 3)} bar. Condensats : ${choixC ? choixC.t.nom : 'hors série'}.`));
      if (num(e.pc) >= num(e.p)) alertes.push(alerte('erreur', 'La pression des condensats doit être inférieure à la pression de la vapeur.'));
      return {
        valeurs: { m, T: sat.T, rho: sat.rho, r: sat.r, choix: choix ? choix.t.cle : null, v: choix ? choix.v : NaN, dp: choix ? choix.dp : NaN, flash: x, condensats: choixC ? choixC.t.cle : null },
        resume: [['Pression absolue', `${nf(pAbs, 2)} bar`], ['Température de saturation', `${nf(sat.T, 1)} °C`], ['Masse volumique / volume massique', `${nf(sat.rho, 3)} kg/m³ / ${nf(sat.vg, 4)} m³/kg`],
          ['Chaleur latente', `${nf(sat.r, 1)} kJ/kg`], ['Débit de vapeur', `${nf(m, 0)} kg/h${e.mode === 'puissance' ? ` (P / r = ${nf(num(e.P), 0)} kW)` : ''}`],
          ['Diamètre retenu', choix ? choix.t.nom : '—'], ['Vitesse entrée / sortie', choix ? `${nf(choix.v, 1)} / ${nf(choix.vSortie, 1)} m/s` : '—'], ['Perte de charge', choix ? `${nf(choix.dp, 3)} bar (sortie ${nf(choix.pSortie - 1.013, 2)} bar rel.)` : '—'],
          ['Revaporisation des condensats', `${nf(x * 100, 1)} % (${nf(x * m, 0)} kg/h)`], ['Conduite de condensats', choixC ? choixC.t.nom : '—']],
        tableaux: [{ titre: 'Conduite vapeur : comparaison des diamètres', entetes: ['Tube', 'Di (mm)', 'v entrée (m/s)', 'v sortie (m/s)', 'ΔP (bar)', 'Critères'],
          lignes: lignes.map(l => [l.t.nom, nf(l.t.di, 1), nf(l.v, 1), l.ok ? nf(l.vSortie, 1) : '—', l.ok ? nf(l.dp, 3) : '> 80 % de p', l.conf ? 'OK' : !l.ok ? 'perte de charge' : l.vmax > vmax ? 'vitesse' : 'perte de charge']),
          surligne: choix ? lignes.indexOf(choix) : -1 },
        { titre: 'Conduite de condensats (vapeur de revaporisation)', entetes: ['Tube', 'v vapeur de flash (m/s)'], lignes: cond.slice(0, 12).map(c => [c.t.nom, nf(c.v, 1)]), surligne: choixC ? cond.indexOf(choixC) : -1 }],
        alertes,
        hypotheses: ['Propriétés de la vapeur saturée sèche interpolées dans les tables (1 à 25 bar abs).', `${s.libelle}, rugosité ${nf(s.rugosite, 3)} mm.`,
          'Écoulement compressible calculé par tranches (masse volumique recalculée à chaque pression locale) ; singularités converties en longueur équivalente.',
          'Revaporisation : x = (h\'(p vapeur) − h\'(p condensats)) / r(p condensats) ; conduite de condensats dimensionnée sur le débit volumique de la vapeur de flash.',
          'Prévoir purges de ligne tous les 30 à 50 m et en points bas, pente ≥ 0,5 % dans le sens de l\'écoulement.'],
        synthese: choix ? `${choix.t.nom} · ${nf(m, 0)} kg/h · ${nf(choix.v, 1)} m/s · ΔP ${nf(choix.dp, 3)} bar` : 'Aucun diamètre conforme',
      };
    },
  };

  /* ---------- 6. Air comprimé ---------- */
  TYPES.air = {
    titre: 'Réseau d\'air comprimé', icone: '💨', famille: 'Industriel',
    description: 'Diamètre d\'une conduite d\'air comprimé selon la vitesse et la chute de pression admissibles.',
    champs: [{ g: 'Air' }, { k: 'Q', l: 'Débit d\'air libre (aspiré, 1,013 bar et 20 °C)', u: 'm³/h', d: 300 }, { k: 'p', l: 'Pression de service', u: 'bar rel.', d: 7 },
      { k: 'T', l: 'Température de l\'air', u: '°C', d: 25 },
      { g: 'Tuyauterie' }, { k: 'serie', l: 'Série de tubes', t: 's', o: optSeries(k => /acier|inox|cuivre|pehd/.test(k)), d: 'acier-galva' },
      { k: 'L', l: 'Longueur développée', u: 'm', d: 120 }, { k: 'zeta', l: 'Somme des coefficients singuliers Σζ', d: 10 },
      { g: 'Critères' }, { k: 'vmax', l: 'Vitesse maximale', u: 'm/s', d: 8 }, { k: 'dpmax', l: 'Chute de pression maximale', u: 'bar', d: 0.1 }],
    calcul(e) {
      const pAbs = num(e.p) + 1.013, T = num(e.T, 20), rhoN = C.air(20, 101325).rho, mks = num(e.Q) / 3600 * rhoN, s = D.SERIES[e.serie];
      const mu = C.air(T).mu, vmax = num(e.vmax, 8), dpmax = num(e.dpmax, 0.1), alertes = [];
      const lignes = C.tubes(e.serie).map(t => { const r = C.compressible({ m: mks, Di: t.di / 1000, L: num(e.L), zeta: num(e.zeta), rug: s.rugosite, pEntree: pAbs, rhoDe: p => C.air(T, p * 1e5).rho, mu }); return { t, ...r, conf: r.ok && r.vmax <= vmax && r.dp <= dpmax }; });
      const choix = lignes.find(l => l.conf), qReel = mks / C.air(T, pAbs * 1e5).rho * 3600;
      if (!(mks > 0)) alertes.push(alerte('erreur', 'Débit nul.'));
      else if (!choix) alertes.push(alerte('erreur', 'Aucun diamètre de la série ne respecte les critères.'));
      else alertes.push(alerte('ok', `Conduite ${choix.t.nom} : ${nf(choix.v, 1)} m/s, chute de pression ${nf(choix.dp, 3)} bar.`));
      return {
        valeurs: { qReel, choix: choix ? choix.t.cle : null, v: choix ? choix.v : NaN, dp: choix ? choix.dp : NaN },
        resume: [['Débit d\'air libre', `${nf(num(e.Q), 0)} m³/h (${nf(num(e.Q) / 60 * 1000, 0)} L/min)`], ['Débit réel à la pression de service', `${nf(qReel, 1)} m³/h`],
          ['Masse volumique à la pression de service', `${nf(C.air(T, pAbs * 1e5).rho, 2)} kg/m³`], ['Diamètre retenu', choix ? choix.t.nom : '—'], ['Vitesse', choix ? `${nf(choix.v, 1)} m/s` : '—'],
          ['Chute de pression', choix ? `${nf(choix.dp, 3)} bar (${nf(choix.dp / num(e.p, 1) * 100, 1)} % de la pression de service)` : '—']],
        tableaux: [{ titre: 'Comparaison des diamètres', entetes: ['Tube', 'Di (mm)', 'v (m/s)', 'ΔP (bar)', 'Critères'],
          lignes: lignes.map(l => [l.t.nom, nf(l.t.di, 1), nf(l.v, 1), l.ok ? nf(l.dp, 3) : '> 80 % de p', l.conf ? 'OK' : !l.ok || l.dp > dpmax ? 'chute de pression' : 'vitesse']), surligne: choix ? lignes.indexOf(choix) : -1 }],
        alertes,
        hypotheses: ['Air sec, gaz parfait (r = 287 J/kg·K), viscosité de Sutherland ; écoulement isotherme calculé par tranches.', `${s.libelle}, rugosité ${nf(s.rugosite, 3)} mm.`,
          'Usage courant : chute de pression ≤ 0,1 bar entre compresseur et point d\'utilisation le plus éloigné, vitesse 6 à 10 m/s dans les conduites principales.',
          'Prévoir une pente de 1 % et des purges en points bas ; boucler le réseau principal si possible.'],
        synthese: choix ? `${choix.t.nom} · ${nf(num(e.Q), 0)} m³/h · ${nf(choix.dp, 3)} bar` : 'Aucun diamètre conforme',
      };
    },
  };

  /* ---------- 7. Gaine aéraulique ---------- */
  const optRug = Object.entries(D.RUGOSITE_GAINE).map(([k, [l, r]]) => [k, `${l} (${String(r).replace('.', ',')} mm)`]);
  const largeurs = Array.from({ length: 39 }, (_, i) => 100 + i * 50);
  TYPES.gaine = {
    titre: 'Dimensionnement de gaine aéraulique', icone: '🌬️', famille: 'Aéraulique',
    description: 'Section de gaine ronde ou rectangulaire selon la vitesse et la perte de charge linéique.',
    champs: [{ g: 'Air' }, { k: 'Q', l: 'Débit d\'air', u: 'm³/h', d: 4500 }, { k: 'T', l: 'Température de l\'air', u: '°C', d: 20 },
      { g: 'Gaine' }, { k: 'forme', l: 'Forme', t: 's', o: [['rond', 'Circulaire'], ['rect', 'Rectangulaire']], d: 'rond' },
      { k: 'h', l: 'Hauteur imposée (faux plafond)', u: 'mm', d: 300, si: e => e.forme === 'rect' },
      { k: 'materiau', l: 'Matériau', t: 's', o: optRug, d: 'galva' }, { k: 'L', l: 'Longueur', u: 'm', d: 20 }, { k: 'zeta', l: 'Somme des coefficients singuliers Σζ', d: 2 },
      { g: 'Critères' }, { k: 'vmax', l: 'Vitesse maximale', u: 'm/s', d: 5 }, { k: 'Rmax', l: 'Perte de charge linéique maximale', u: 'Pa/m', d: 1 }],
    calcul(e) {
      const qv = num(e.Q) / 3600, T = num(e.T, 20), rug = D.RUGOSITE_GAINE[e.materiau] ? D.RUGOSITE_GAINE[e.materiau][1] : 0.09, rect = e.forme === 'rect', h = num(e.h, 300);
      const vmax = num(e.vmax, 5), Rmax = num(e.Rmax, 1), alertes = [];
      const dims = rect ? largeurs.map(a => ({ a, b: h, nom: `${a} × ${h}` })) : D.GAINES_RONDES.map(d => ({ a: d, b: 0, nom: `Ø ${d}` }));
      const lignes = dims.map(d => { const r = C.gaine(qv, d, T, rug); return { d, ...r, dp: r.R * num(e.L) + num(e.zeta) * r.pd, ok: r.v <= vmax && r.R <= Rmax }; });
      const choix = lignes.find(l => l.ok), i = choix ? lignes.indexOf(choix) : -1;
      if (!(qv > 0)) alertes.push(alerte('erreur', 'Débit nul.'));
      else if (!choix) alertes.push(alerte('erreur', 'Aucune dimension ne respecte les critères.'));
      else {
        alertes.push(alerte('ok', `Gaine ${choix.d.nom} mm : ${nf(choix.v)} m/s, ${nf(choix.R, 2)} Pa/m.`));
        if (rect && choix.d.a / h > 4) alertes.push(alerte('attention', `Rapport des côtés ${nf(choix.d.a / h, 1)} > 4 : pertes de charge et bruit accrus, augmenter la hauteur si possible.`));
      }
      const vue = rect && i >= 0 ? lignes.slice(Math.max(0, i - 3), i + 5) : lignes;
      return {
        valeurs: { choix: choix ? choix.d.nom : null, v: choix ? choix.v : NaN, R: choix ? choix.R : NaN, dp: choix ? choix.dp : NaN },
        resume: [['Débit', `${nf(num(e.Q), 0)} m³/h (${nf(qv, 3)} m³/s)`], ['Gaine retenue', choix ? `${choix.d.nom} mm` : '—'], ['Section', choix ? `${nf(choix.S, 3)} m²` : '—'], ['Vitesse', choix ? `${nf(choix.v)} m/s` : '—'],
          ['Perte de charge linéique', choix ? `${nf(choix.R, 2)} Pa/m` : '—'], ['Perte de charge du tronçon', choix ? `${nf(choix.dp, 1)} Pa` : '—'],
          ...(rect && choix ? [['Diamètre équivalent (Huebscher)', `${nf(C.diametreEquivalent(choix.d.a, choix.d.b), 0)} mm`]] : [])],
        tableaux: [{ titre: 'Comparaison des dimensions', entetes: ['Dimension (mm)', 'Section (m²)', 'v (m/s)', 'R (Pa/m)', 'ΔP tronçon (Pa)', 'Critères'],
          lignes: vue.map(l => [l.d.nom, nf(l.S, 3), nf(l.v), nf(l.R, 2), nf(l.dp, 1), l.ok ? 'OK' : l.v > vmax ? 'vitesse' : 'perte de charge']), surligne: choix ? vue.indexOf(choix) : -1 }],
        alertes,
        hypotheses: [`Air à ${nf(T, 0)} °C sous 1 013 hPa : ρ = ${nf(C.air(T).rho, 3)} kg/m³.`, `Rugosité ${nf(rug, 2)} mm.`, 'Darcy-Weisbach / Colebrook sur le diamètre hydraulique Dh = 2ab / (a + b) avec la vitesse réelle dans la gaine.',
          'Repères usuels (tertiaire) : 4 à 6 m/s en réseau principal, 2,5 à 4 m/s en antennes, 0,8 à 1,5 Pa/m.'],
        synthese: choix ? `${choix.d.nom} mm · ${nf(num(e.Q), 0)} m³/h · ${nf(choix.v)} m/s · ${nf(choix.R, 2)} Pa/m` : 'Aucune dimension conforme',
      };
    },
  };

  /* ---------- 8. Réseau aéraulique ---------- */
  TYPES.aeraulique = {
    titre: 'Réseau aéraulique et choix du ventilateur', icone: '🌀', famille: 'Aéraulique',
    description: 'Pertes de charge du réseau le plus défavorisé (gaines, singularités, composants) et point de fonctionnement du ventilateur.',
    champs: [{ g: 'Réseau' }, { k: 'T', l: 'Température de l\'air', u: '°C', d: 20 }, { k: 'materiau', l: 'Matériau des gaines', t: 's', o: optRug, d: 'galva' },
      { k: 'vmax', l: 'Vitesse maximale (dimensionnement auto)', u: 'm/s', d: 5 }, { k: 'Rmax', l: 'Perte linéique maxi (dimensionnement auto)', u: 'Pa/m', d: 1 },
      { k: 'troncons', l: 'Tronçons (dimension : « 400 » pour Ø 400, « 600x300 » pour rectangulaire, vide = auto en circulaire)', t: 'lignes', d: [
        { rep: 'Soufflage CTA → plénum', Q: 6000, dim: '800x400', L: 6, zeta: 1.5 }, { rep: 'Gaine principale', Q: 4500, dim: '', L: 25, zeta: 0.8 },
        { rep: 'Antenne bureaux', Q: 1200, dim: '', L: 18, zeta: 1.2 }, { rep: 'Piquage + bouche', Q: 300, dim: '200', L: 3, zeta: 1.3 }],
      colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'Q', l: 'Débit (m³/h)' }, { k: 'dim', l: 'Dimension (mm)', t: 't' }, { k: 'L', l: 'Longueur (m)' }, { k: 'zeta', l: 'Σζ' }] },
      { k: 'composants', l: 'Composants (pertes de charge constructeur)', t: 'lignes', d: [
        { nom: 'Filtre F7 (encrassement moyen)', dp: 150 }, { nom: 'Batterie chaude', dp: 60 }, { nom: 'Batterie froide', dp: 110 }, { nom: 'Silencieux', dp: 40 }, { nom: 'Bouche de soufflage', dp: 30 }, { nom: 'Prise d\'air neuf', dp: 40 }],
      colonnes: [{ k: 'nom', l: 'Composant', t: 't' }, { k: 'dp', l: 'ΔP (Pa)' }] },
      { g: 'Ventilateur' }, { k: 'marge', l: 'Marge de sécurité', u: '%', d: 10 }, { k: 'rendement', l: 'Rendement global du ventilateur', u: '%', d: 60 }],
    calcul(e) {
      const T = num(e.T, 20), rug = D.RUGOSITE_GAINE[e.materiau] ? D.RUGOSITE_GAINE[e.materiau][1] : 0.09, vmax = num(e.vmax, 5), Rmax = num(e.Rmax, 1), alertes = [];
      const tr = (e.troncons || []).map((x, i) => {
        const qv = num(x.Q) / 3600; let dim = C.lireDimension(x.dim), auto = false;
        if (!dim) { auto = true; const d = D.GAINES_RONDES.find(d => { const r = C.gaine(qv, { a: d, b: 0 }, T, rug); return r.v <= vmax && r.R <= Rmax; }) || D.GAINES_RONDES[D.GAINES_RONDES.length - 1]; dim = { a: d, b: 0 }; }
        const r = C.gaine(qv, dim, T, rug), dpl = r.R * num(x.L), dps = num(x.zeta) * r.pd;
        if (r.v > vmax * 1.001) alertes.push(alerte('attention', `${x.rep || `Tronçon ${i + 1}`} : vitesse ${nf(r.v)} m/s supérieure à ${nf(vmax)} m/s.`));
        return { x, rep: x.rep || `Tronçon ${i + 1}`, Q: num(x.Q), nom: dim.b ? `${dim.a} × ${dim.b}` : `Ø ${dim.a}`, auto, ...r, dpl, dps, dp: dpl + dps };
      });
      const comp = (e.composants || []).map(c => ({ nom: c.nom || 'Composant', dp: num(c.dp) }));
      const dpRes = tr.reduce((a, x) => a + x.dp, 0), dpComp = comp.reduce((a, x) => a + x.dp, 0), dpTot = dpRes + dpComp, marge = num(e.marge, 10);
      const pVent = dpTot * (1 + marge / 100), Qv = tr.reduce((a, x) => Math.max(a, x.Q), 0), Pabs = Qv / 3600 * pVent / (num(e.rendement, 60) / 100);
      if (!tr.length) alertes.push(alerte('erreur', 'Ajouter au moins un tronçon.'));
      else alertes.push(alerte('ok', `Ventilateur : ${nf(Qv, 0)} m³/h sous ${nf(pVent, 0)} Pa, puissance absorbée ≈ ${nf(Pabs / 1000, 2)} kW (SFP ≈ ${nf(Pabs / (Qv / 3600) / 1000, 2)} kW/(m³/s)).`));
      return {
        valeurs: { dpReseau: dpRes, dpComposants: dpComp, dpTotal: dpTot, pVentilateur: pVent, Qv, Pabs, troncons: tr.map(x => ({ rep: x.rep, nom: x.nom, L: num(x.x.L) })) },
        resume: [['Pertes de charge des gaines', `${nf(dpRes, 0)} Pa`], ['Pertes de charge des composants', `${nf(dpComp, 0)} Pa`], ['Perte de charge totale', `${nf(dpTot, 0)} Pa`],
          ['Débit du ventilateur', `${nf(Qv, 0)} m³/h`], [`Pression totale avec marge de ${nf(marge, 0)} %`, `${nf(pVent, 0)} Pa`], ['Puissance absorbée estimée', `${nf(Pabs / 1000, 2)} kW`],
          ['Puissance spécifique (SFP)', `${nf(Pabs / Math.max(Qv / 3600, 1e-9) / 1000, 2)} kW/(m³/s)`]],
        tableaux: [{ titre: 'Tronçons', entetes: ['Repère', 'Q (m³/h)', 'Gaine (mm)', 'L (m)', 'v (m/s)', 'R (Pa/m)', 'ΔP lin. (Pa)', 'Σζ', 'ΔP sing. (Pa)', 'ΔP (Pa)'],
          lignes: [...tr.map(x => [x.rep, nf(x.Q, 0), `${x.nom}${x.auto ? ' (auto)' : ''}`, nf(num(x.x.L), 1), nf(x.v), nf(x.R, 2), nf(x.dpl, 1), nf(num(x.x.zeta), 2), nf(x.dps, 1), nf(x.dp, 1)]),
            ['Total gaines', '', '', '', '', '', '', '', '', nf(dpRes, 1)]], total: true },
        ...(comp.length ? [{ titre: 'Composants', entetes: ['Composant', 'ΔP (Pa)'], lignes: [...comp.map(c => [c.nom, nf(c.dp, 0)]), ['Total composants', nf(dpComp, 0)]], total: true }] : [])],
        alertes,
        hypotheses: [`Air à ${nf(T, 0)} °C : ρ = ${nf(C.air(T).rho, 3)} kg/m³ ; rugosité ${nf(rug, 2)} mm.`, 'Darcy-Weisbach / Colebrook sur le diamètre hydraulique, singularités ΔP = Σζ · ρv²/2.',
          `Gaine « auto » : plus petit diamètre normalisé avec v ≤ ${nf(vmax)} m/s et R ≤ ${nf(Rmax, 2)} Pa/m.`, 'Les tronçons décrivent le chemin le plus défavorisé ; débit du ventilateur : débit du tronçon le plus chargé.'],
        synthese: `${nf(Qv, 0)} m³/h · ${nf(pVent, 0)} Pa · ${nf(Pabs / 1000, 2)} kW`,
      };
    },
  };

  /* ---------- 9. Isolation thermique ---------- */
  TYPES.isolation = {
    titre: 'Isolation des tuyauteries : pertes, condensation, épaisseur', icone: '🧣', famille: 'Thermique',
    description: 'Déperditions, température de surface, risque de condensation (eau glacée) et épaisseur d\'isolant à retenir.',
    champs: [{ g: 'Tuyauterie' }, { k: 'serie', l: 'Série de tubes', t: 's', o: optSeries(), d: 'acier-10216' }, { k: 'tube', l: 'Tube', t: 's', o: optTubes, d: '60.3x2.9' },
      { k: 'Tf', l: 'Température du fluide', u: '°C', d: 7 }, { k: 'L', l: 'Longueur', u: 'm', d: 100 }, { k: 'heures', l: 'Durée de fonctionnement annuelle', u: 'h/an', d: 3000 },
      { g: 'Ambiance' }, { k: 'Ta', l: 'Température ambiante', u: '°C', d: 26 }, { k: 'HR', l: 'Humidité relative', u: '%', d: 65 },
      { k: 'vent', l: 'Vitesse de l\'air (0 = intérieur calme)', u: 'm/s', d: 0 },
      { g: 'Isolant' }, { k: 'isolant', l: 'Isolant', t: 's', o: optIsolants, d: 'elastomere' },
      { k: 'revetement', l: 'Surface extérieure', t: 's', o: Object.entries(D.REVETEMENTS).map(([k, [l, eps]]) => [k, `${l} (ε = ${String(eps).replace('.', ',')})`]), d: 'pvc' },
      { k: 'qmax', l: 'Déperdition maximale admise (vide : sans objet)', u: 'W/m', d: '' }, { k: 'TsMax', l: 'Température de surface maximale (protection des personnes)', u: '°C', d: 55 },
      { k: 'margeRosee', l: 'Marge sur le point de rosée', u: 'K', d: 1 }],
    calcul(e) {
      const t = C.tube(e.serie, e.tube) || C.tubes(e.serie)[0], iso = D.ISOLANTS[e.isolant], eps = (D.REVETEMENTS[e.revetement] || ['', 0.9])[1];
      const Tf = num(e.Tf), Ta = num(e.Ta, 20), froid = Tf < Ta, Td = C.pointRosee(Ta, num(e.HR, 60)), vent = num(e.vent, 0);
      const nu = C.isolation({ De: t.de / 1000, e: 0, Tf, Ta, isolant: e.isolant, emissivite: 0.9, vent });
      const qmax = e.qmax === '' || e.qmax === undefined ? NaN : num(e.qmax), TsMax = num(e.TsMax, 55), mr = num(e.margeRosee, 1);
      const lignes = iso.epaisseurs.map(ep => {
        const r = C.isolation({ De: t.de / 1000, e: ep / 1000, Tf, Ta, isolant: e.isolant, emissivite: eps, vent });
        const okRosee = !froid || r.Ts >= Td + mr, okQ = !Number.isFinite(qmax) || Math.abs(r.q) <= qmax, okTs = froid || r.Ts <= TsMax;
        return { ep, ...r, okRosee, okQ, okTs, ok: okRosee && okQ && okTs };
      });
      const choix = lignes.find(l => l.ok), alertes = [], L = num(e.L), h = num(e.heures);
      if (Tf > iso.tmax || Tf < iso.tmin) alertes.push(alerte('erreur', `Température du fluide hors du domaine d'emploi de l'isolant (${iso.tmin} à ${iso.tmax} °C).`));
      if (froid && nu.Ts < Td) alertes.push(alerte('attention', `Tube nu : condensation (surface ${nf(nu.Ts, 1)} °C < point de rosée ${nf(Td, 1)} °C).`));
      if (!choix) alertes.push(alerte('erreur', 'Aucune épaisseur commerciale ne satisfait les critères : changer d\'isolant ou superposer deux couches.'));
      else alertes.push(alerte('ok', `Épaisseur retenue : ${choix.ep} mm — ${nf(Math.abs(choix.q), 1)} W/m, surface à ${nf(choix.Ts, 1)} °C${froid ? ` (point de rosée ${nf(Td, 1)} °C)` : ''}.`));
      if (froid && choix) alertes.push(alerte('attention', 'Eau glacée : isolant à cellules fermées avec pare-vapeur continu, joints collés, supports avec cales isolantes.'));
      const kWh = x => Math.abs(x) * L * h / 1000;
      return {
        valeurs: { Td, qNu: nu.q, choix: choix ? choix.ep : null, q: choix ? choix.q : NaN, Ts: choix ? choix.Ts : NaN },
        resume: [['Tube', `${t.nom}`], ['Point de rosée de l\'ambiance', `${nf(Td, 1)} °C`], ['Tube nu : déperdition / surface', `${nf(Math.abs(nu.q), 1)} W/m / ${nf(nu.Ts, 1)} °C`],
          ['Épaisseur retenue', choix ? `${choix.ep} mm (${iso.libelle})` : '—'], ['Déperdition isolée', choix ? `${nf(Math.abs(choix.q), 1)} W/m — ${nf(Math.abs(choix.q) * L / 1000, 2)} kW sur ${nf(L, 0)} m` : '—'],
          ['Température de surface', choix ? `${nf(choix.Ts, 1)} °C` : '—'], ['Énergie annuelle (tube nu → isolé)', choix ? `${nf(kWh(nu.q), 0)} → ${nf(kWh(choix.q), 0)} kWh/an` : '—'],
          ['Efficacité de l\'isolation', choix ? `${nf((1 - Math.abs(choix.q / nu.q)) * 100, 1)} %` : '—']],
        tableaux: [{ titre: 'Épaisseurs commerciales', entetes: ['Épaisseur (mm)', 'Ø ext. (mm)', 'λ (W/m·K)', 'q (W/m)', 'T surface (°C)', 'kWh/an', 'Critères'],
          lignes: lignes.map(l => [String(l.ep), nf(l.Dext * 1000, 0), nf(l.lambda, 4), nf(Math.abs(l.q), 1), nf(l.Ts, 1), nf(kWh(l.q), 0), l.ok ? 'OK' : !l.okRosee ? 'condensation' : !l.okTs ? 'surface trop chaude' : 'déperdition']),
          surligne: choix ? lignes.indexOf(choix) : -1 }],
        alertes,
        hypotheses: ['Conduction radiale en régime permanent : q = ΔT / [ln(De/Di) / (2πλ) + 1 / (h · π · De)] ; résistances intérieure et de paroi négligées.',
          `Conductivité à la température moyenne de l'isolant : λ = λ10 + ${String(iso.dlambda).replace('.', ',')} · (Tm − 10).`,
          vent > 0 ? `Convection forcée (vent ${nf(vent, 1)} m/s) : hc = 8,9 · v^0,9 / D^0,1.` : 'Convection naturelle en air calme : hc = 1,32 · (ΔT / D)^0,25.',
          `Rayonnement : hr = ε · σ · (Ts⁴ − Ta⁴) / (Ts − Ta), ε = ${String(eps).replace('.', ',')}.`, 'Point de rosée : formule de Magnus.'],
        synthese: choix ? `${t.nom} · ${choix.ep} mm · ${nf(Math.abs(choix.q), 1)} W/m · Ts ${nf(choix.Ts, 1)} °C` : 'Aucune épaisseur conforme',
      };
    },
  };

  /* ---------- 10. Bilan thermique d'un local : déperditions de chauffage, apports de climatisation ---------- */
  const optU = (table, avecPerso = true) => [...Object.entries(table).map(([k, v]) => [k, `${v[0]} — U ${nf(v[1], 2)}`]), ...(avecPerso ? [['perso', 'Autre (U saisi)']] : [])];
  const optListe = table => Object.entries(table).map(([k, v]) => [k, v[0]]);
  // Humidité absolue (kg d'eau / kg d'air sec) à la pression atmosphérique
  const humiditeAbsolue = (T, HR) => { const pv = HR / 100 * 610.94 * Math.exp(17.625 * T / (T + 243.04)); return 0.622 * pv / (101325 - pv); };
  TYPES.bilan = {
    titre: 'Bilan chauffage et climatisation d\'un local', icone: '🏭', famille: 'Thermique',
    description: 'Local simple (longueur × largeur × hauteur) : puissance de chauffage (déperditions des parois et de l\'air) et puissance de climatisation (soleil, occupants, éclairage, air), avec les apports de process.',
    champs: [{ g: 'Local' }, { k: 'nom', l: 'Désignation du local', t: 't', d: 'Atelier de production' },
      { k: 'L', l: 'Longueur', u: 'm', d: 40 }, { k: 'l', l: 'Largeur', u: 'm', d: 25 }, { k: 'H', l: 'Hauteur sous toiture', u: 'm', d: 8 },
      { k: 'facades', l: 'Façades sur l\'extérieur', t: 's', o: [['4', '4 façades (bâtiment isolé)'], ['3', '3 façades (un pignon mitoyen chauffé)'], ['2', '2 façades (longueur + largeur)'], ['1', '1 façade (longueur)']], d: '4' },
      { k: 'Ti', l: 'Température intérieure en hiver', u: '°C', d: 17 }, { k: 'TiEte', l: 'Température intérieure en été (local climatisé)', u: '°C', d: 26 },
      { g: 'Climat' }, { k: 'climat', l: 'Site', t: 's', o: [...optListe(D.CLIMATS), ['perso', 'Autre (températures saisies)']], d: 'annonay' },
      { k: 'Te', l: 'Température extérieure de base en hiver', u: '°C', d: -10, si: e => e.climat === 'perso' },
      { k: 'TeEte', l: 'Température extérieure en été', u: '°C', d: 32, si: e => e.climat === 'perso' }, { k: 'HRete', l: 'Humidité relative extérieure en été', u: '%', d: 40, si: e => e.climat === 'perso' },
      { g: 'Enveloppe' }, { k: 'mur', l: 'Murs', t: 's', o: optU(D.MURS), d: 'bardage-double-60' }, { k: 'Umur', l: 'U des murs', u: 'W/m²·K', d: 0.5, si: e => e.mur === 'perso' },
      { k: 'toit', l: 'Toiture', t: 's', o: optU(D.TOITURES), d: 'bac-80' }, { k: 'Utoit', l: 'U de la toiture', u: 'W/m²·K', d: 0.4, si: e => e.toit === 'perso' },
      { k: 'teinte', l: 'Teinte de la toiture (été)', t: 's', o: [['claire', 'Claire'], ['foncee', 'Foncée']], d: 'claire' },
      { k: 'plancher', l: 'Plancher bas', t: 's', o: optU(D.PLANCHERS), d: 'dallage-nu' }, { k: 'Uplancher', l: 'U du plancher', u: 'W/m²·K', d: 0.5, si: e => e.plancher === 'perso' },
      { k: 'vitrage', l: 'Fenêtres en façade', t: 's', o: optU(D.VITRAGES), d: 'double-ancien' }, { k: 'Uvitrage', l: 'U des fenêtres', u: 'W/m²·K', d: 2, si: e => e.vitrage === 'perso' },
      { k: 'Svitrage', l: 'Surface des fenêtres', u: 'm²', d: 30 }, { k: 'orientation', l: 'Orientation principale des fenêtres', t: 's', o: optListe(D.SOLAIRE).filter(([k]) => k !== 'horizontal'), d: 'sud' },
      { k: 'protection', l: 'Protection solaire', t: 's', o: [['1', 'Aucune'], ['0.6', 'Store intérieur'], ['0.3', 'Brise-soleil, store extérieur']], d: '1' },
      { k: 'lanterneau', l: 'Lanterneaux, éclairement zénithal', t: 's', o: optU(D.VITRAGES), d: 'polycarbonate' }, { k: 'Slanterneau', l: 'Surface des lanterneaux', u: 'm²', d: 60 },
      { k: 'porte', l: 'Portes', t: 's', o: optU(D.PORTES), d: 'sectionnelle-nu' }, { k: 'Uporte', l: 'U des portes', u: 'W/m²·K', d: 3, si: e => e.porte === 'perso' },
      { k: 'Sporte', l: 'Surface des portes', u: 'm²', d: 32 },
      { k: 'ponts', l: 'Ponts thermiques (majoration des parois)', t: 's', o: [['0', 'Négligés'], ['10', '+ 10 % (bâtiment isolé courant)'], ['20', '+ 20 % (isolation intérieure, nombreuses liaisons)'], ['30', '+ 30 % (bâtiment ancien)']], d: '10' },
      { g: 'Renouvellement d\'air' }, { k: 'infiltration', l: 'Infiltrations', t: 's', o: Object.entries(D.INFILTRATIONS).map(([k, v]) => [k, `${v[0]} — ${nf(v[1], 1)} vol/h`]), d: 'standard' },
      { k: 'qv', l: 'Ventilation mécanique (air neuf)', u: 'm³/h', d: 0 }, { k: 'recup', l: 'Efficacité de la récupération de chaleur (0 : simple flux)', u: '%', d: 0 },
      { k: 'qext', l: 'Extraction de process compensée par de l\'air extérieur (fumées de soudage, cabines…)', u: 'm³/h', d: 0 },
      { g: 'Apports internes (été)' }, { k: 'occupants', l: 'Nombre de personnes', d: 10 }, { k: 'activite', l: 'Activité', t: 's', o: optListe(D.ACTIVITES), d: 'moyen' },
      { k: 'eclairage', l: 'Éclairage', u: 'W/m²', d: 8 },
      { g: 'Apports de process (machines, fours, compresseurs…)' },
      { k: 'process', l: 'Équipements de process (puissance dissipée dans le local)', t: 'lignes', d: [],
        colonnes: [{ k: 'nom', l: 'Équipement', t: 't' }, { k: 'P', l: 'Puissance dissipée (kW)' }, { k: 'simult', l: 'Simultanéité (%)' }, { k: 'sensible', l: 'Part sensible (%)' }] },
      { k: 'processHiver', l: 'Apports de process déduits du chauffage', t: 's', o: [['0', 'Aucun (chauffage dimensionné à l\'arrêt de la production)'], ['50', '50 % des apports'], ['100', '100 % des apports (production permanente)']], d: '0' },
      { g: 'Puissances' }, { k: 'relance', l: 'Majoration pour relance (chauffage intermittent)', t: 's', o: [['0', 'Aucune (chauffage continu)'], ['10', '+ 10 %'], ['20', '+ 20 % (arrêt le week-end)']], d: '10' },
      { k: 'marge', l: 'Marge de sécurité sur la climatisation', u: '%', d: 10 }],
    calcul(e) {
      const L = num(e.L), l = num(e.l), H = num(e.H), Sol = L * l, V = Sol * H, f = num(e.facades, 4), alertes = [];
      const c = D.CLIMATS[e.climat], Te = c ? c[1] : num(e.Te, -10), TeEte = c ? c[2] : num(e.TeEte, 32), HRete = c ? c[3] : num(e.HRete, 40);
      const Ti = num(e.Ti, 17), TiEte = num(e.TiEte, 26), dT = Ti - Te, dTete = TeEte - TiEte;
      const U = (table, cle, perso) => (cle === 'perso' ? [num(perso), 1] : [table[cle][1], table[cle].length > 2 && table === D.PLANCHERS ? table[cle][2] : 1]);
      const lib = (table, cle) => (cle === 'perso' ? 'U saisi' : table[cle][0]);
      // Surfaces : façades exposées selon le nombre de côtés sur l'extérieur, déduction des menuiseries
      const perimetre = { 4: 2 * (L + l), 3: 2 * Math.max(L, l) + Math.min(L, l), 2: L + l, 1: Math.max(L, l) }[f] || 2 * (L + l);
      const Sv = num(e.Svitrage), Sp = num(e.Sporte), Sl = Math.min(num(e.Slanterneau), Sol), Smur = Math.max(0, perimetre * H - Sv - Sp);
      if (Sv + Sp > perimetre * H) alertes.push(alerte('erreur', 'Fenêtres et portes plus grandes que les façades exposées.'));
      const [Uv, gv] = e.vitrage === 'perso' ? [num(e.Uvitrage), 0.6] : D.VITRAGES[e.vitrage].slice(1), [Ul, gl] = D.VITRAGES[e.lanterneau].slice(1);
      const maj = 1 + num(e.ponts) / 100;
      const parois = [
        ['Murs', lib(D.MURS, e.mur), Smur, ...U(D.MURS, e.mur, e.Umur), 5],
        ['Toiture', lib(D.TOITURES, e.toit), Sol - Sl, ...U(D.TOITURES, e.toit, e.Utoit), e.teinte === 'foncee' ? 20 : 10],
        ['Plancher bas', lib(D.PLANCHERS, e.plancher), Sol, ...U(D.PLANCHERS, e.plancher, e.Uplancher), null],
        ['Fenêtres', lib(D.VITRAGES, e.vitrage), Sv, Uv, 1, 0],
        ['Lanterneaux', D.VITRAGES[e.lanterneau][0], Sl, Ul, 1, 0],
        ['Portes', lib(D.PORTES, e.porte), Sp, ...U(D.PORTES, e.porte, e.Uporte), 5],
      ].filter(p => p[2] > 0).map(([paroi, compo, A, u, b, dTeq]) => ({ paroi, compo, A, U: u, b, H: A * u * b * maj, dTeq }));
      const Htr = parois.reduce((a, p) => a + p.H, 0), Ptr = Htr * dT;
      // Air : 0,34 Wh/m³·K (ρ·cp de l'air) ; ventilation diminuée de la récupération de chaleur
      const n = D.INFILTRATIONS[e.infiltration][1], qInf = n * V, qVent = num(e.qv) * (1 - num(e.recup) / 100), qExt = num(e.qext);
      const air = [['Infiltrations', qInf], ['Ventilation mécanique', qVent], ['Extraction de process', qExt]].filter(x => x[1] > 0).map(([poste, q]) => ({ poste, q, H: 0.34 * q }));
      const Hve = air.reduce((a, x) => a + x.H, 0), Pve = Hve * dT;
      const Pbrut = (Ptr + Pve) * (1 + num(e.relance) / 100);
      const process = (e.process || []).map(x => { const P = num(x.P) * num(x.simult, 100) / 100; return { nom: x.nom || 'Équipement', P, sens: P * num(x.sensible, 100) / 100 }; });
      const procSens = process.reduce((a, x) => a + x.sens, 0) * 1000, procLat = process.reduce((a, x) => a + x.P - x.sens, 0) * 1000;
      const deduit = procSens * num(e.processHiver) / 100, Pchauf = Math.max(0, Pbrut - deduit);
      // Été : transmission avec écart équivalent d'ensoleillement des parois opaques, apports solaires des vitrages, internes, process, air
      const etePar = parois.filter(p => p.dTeq !== null).map(p => ({ poste: `Transmission ${p.paroi.toLowerCase()}`, s: p.H * (dTete + p.dTeq), l: 0 }));
      const sol = [{ poste: 'Soleil par les fenêtres', s: Sv * D.SOLAIRE[e.orientation][1] * gv * num(e.protection, 1), l: 0 }, { poste: 'Soleil par les lanterneaux', s: Sl * D.SOLAIRE.horizontal[1] * gl, l: 0 }].filter(x => x.s > 0);
      const act = D.ACTIVITES[e.activite], nb = num(e.occupants);
      const dx = Math.max(0, humiditeAbsolue(TeEte, HRete) - humiditeAbsolue(TiEte, 50)), qAir = qInf + qVent + qExt;
      const ete = [...etePar, ...sol, { poste: 'Occupants', s: nb * act[1], l: nb * act[2] }, { poste: 'Éclairage', s: num(e.eclairage) * Sol, l: 0 },
        ...process.map(x => ({ poste: x.nom, s: x.sens * 1000, l: (x.P - x.sens) * 1000 })),
        { poste: 'Air extérieur (infiltrations, ventilation, extraction)', s: 0.34 * qAir * dTete, l: 1.2 * qAir / 3600 * 2501e3 * dx }].filter(x => Math.abs(x.s) + x.l > 0.5);
      const Ss = ete.reduce((a, x) => a + x.s, 0), Sla = ete.reduce((a, x) => a + x.l, 0), marge = 1 + num(e.marge, 10) / 100, Pfroid = (Ss + Sla) * marge;
      const k = v => nf(v / 1000, 1);
      if (!(V > 0)) alertes.push(alerte('erreur', 'Dimensions du local à renseigner.'));
      alertes.push(alerte('ok', `Chauffage : ${k(Pchauf)} kW (${nf(Pchauf / Math.max(Sol, 1), 0)} W/m², ${nf(Pchauf / Math.max(V, 1), 1)} W/m³) pour ${nf(Ti, 0)} °C intérieur par ${nf(Te, 0)} °C extérieur.`));
      if (deduit > 0 && deduit >= Pbrut) alertes.push(alerte('attention', 'Les apports de process couvrent les déperditions : prévoir tout de même un chauffage hors gel ou de relance pour les arrêts de production.'));
      else if (deduit > 0) alertes.push(alerte('attention', `${k(deduit)} kW d'apports de process déduits : en cas d'arrêt de la production, la puissance nécessaire remonte à ${k(Pbrut)} kW.`));
      if (Pve > Ptr) alertes.push(alerte('attention', 'Le renouvellement d\'air pèse plus que les parois : sas, portes rapides, rideaux d\'air ou récupération de chaleur sont les premiers leviers.'));
      if (H >= 6) alertes.push(alerte('attention', `Grande hauteur (${nf(H, 1)} m) : stratification de l'air chaud ; privilégier tubes radiants ou panneaux rayonnants, ou déstratificateurs avec des aérothermes.`));
      const nonIsole = parois.filter(p => p.U >= 3 && p.A > 0 && p.paroi !== 'Portes' && p.paroi !== 'Fenêtres').map(p => p.paroi.toLowerCase());
      if (nonIsole.length) alertes.push(alerte('attention', `Parois non isolées (${nonIsole.join(', ')}) : l'isolation réduirait fortement la puissance et la consommation.`));
      alertes.push(alerte('ok', `Climatisation : ${k(Pfroid)} kW avec marge (sensible ${k(Ss)} kW, latent ${k(Sla)} kW) pour ${nf(TiEte, 0)} °C intérieur par ${nf(TeEte, 0)} °C extérieur.`));
      return {
        valeurs: { Sol, V, Htr, Ptr, Hve, Pve, Pbrut, deduit, Pchauf, Ss, Sla, Pfroid, Te, TeEte },
        resume: [['Local', `${e.nom || '—'} : ${nf(L, 1)} × ${nf(l, 1)} × ${nf(H, 1)} m`], ['Surface au sol / volume', `${nf(Sol, 0)} m² / ${nf(V, 0)} m³`],
          ['Températures de base (hiver / été)', `${nf(Te, 0)} °C / ${nf(TeEte, 0)} °C${c ? ` — ${c[0]}` : ''}`],
          ['Déperditions par les parois', `${k(Ptr)} kW (${nf(Htr, 0)} W/K)`], ['Déperditions par le renouvellement d\'air', `${k(Pve)} kW (${nf(Hve, 0)} W/K)`],
          ['Puissance brute avec relance', `${k(Pbrut)} kW`], ...(deduit > 0 ? [['Apports de process déduits', `− ${k(deduit)} kW`]] : []),
          ['Puissance de chauffage', `${k(Pchauf)} kW`], ['Ratios de chauffage', `${nf(Pchauf / Math.max(Sol, 1), 0)} W/m² · ${nf(Pchauf / Math.max(V, 1), 1)} W/m³`],
          ['Apports de process (sensible / latent)', `${k(procSens)} / ${k(procLat)} kW`], ['Puissance frigorifique avec marge', `${k(Pfroid)} kW (${nf(Pfroid / Math.max(Sol, 1), 0)} W/m²)`]],
        tableaux: [{ titre: 'Déperditions de chauffage', entetes: ['Poste', 'Composition', 'Surface (m²) / débit (m³/h)', 'U (W/m²·K)', 'b', 'H (W/K)', 'Puissance (kW)'],
          lignes: [...parois.map(p => [p.paroi, p.compo, nf(p.A, 1), nf(p.U, 2), nf(p.b, 1), nf(p.H, 0), k(p.H * dT)]),
            ...air.map(x => [x.poste, x.poste === 'Infiltrations' ? `${nf(n, 1)} vol/h` : x.poste === 'Ventilation mécanique' && num(e.recup) ? `récupération ${nf(num(e.recup), 0)} %` : '', nf(x.q, 0), '', '', nf(x.H, 0), k(x.H * dT)]),
            ...(num(e.relance) ? [['Relance', `+ ${num(e.relance)} %`, '', '', '', '', k((Ptr + Pve) * num(e.relance) / 100)]] : []),
            ...(deduit > 0 ? [['Apports de process', `${num(e.processHiver)} % déduits`, '', '', '', '', `− ${k(deduit)}`]] : []),
            ['Puissance de chauffage', '', '', '', '', nf(Htr + Hve, 0), k(Pchauf)]], total: true },
        { titre: 'Apports d\'été (climatisation)', entetes: ['Poste', 'Sensible (kW)', 'Latent (kW)'],
          lignes: [...ete.map(x => [x.poste, nf(x.s / 1000, 2), nf(x.l / 1000, 2)]), [`Total avec marge de ${nf(num(e.marge, 10), 0)} %`, nf(Ss * marge / 1000, 2), nf(Sla * marge / 1000, 2)]], total: true }],
        alertes,
        hypotheses: ['Méthode simplifiée de la NF EN 12831 : Φ = (Σ U · A · b · (1 + ponts thermiques) + 0,34 · qv) · (θint − θbase), majorée pour la relance.',
          `Façades exposées : périmètre de ${nf(perimetre, 1)} m sur ${nf(H, 1)} m de hauteur, fenêtres et portes déduites ; toiture déduite des lanterneaux.`,
          'Coefficients U : ordres de grandeur des compositions courantes (à remplacer par les valeurs d\'un DPE ou d\'une étude thermique si elles existent).',
          'Renouvellement d\'air : 0,34 Wh/m³·K ; infiltrations exprimées en volumes par heure du local ; extraction de process compensée par de l\'air extérieur non préchauffé.',
          'Été : écart de température équivalent d\'ensoleillement (murs + 5 K, toiture + 10 ou + 20 K), apports solaires de pointe des vitrages × facteur solaire × protection, occupants et éclairage, latent de l\'air neuf calculé pour 50 % HR intérieur.',
          'Apports de process : puissance dissipée dans le local × simultanéité ; part latente pour les dégagements de vapeur (bains, lavage, cuisson).'],
        synthese: `${e.nom || 'Local'} · chauffage ${k(Pchauf)} kW · froid ${k(Pfroid)} kW`,
      };
    },
  };

  /* ---------- 11. Dilatation thermique ---------- */
  TYPES.dilatation = {
    titre: 'Dilatation thermique et compensation', icone: '↔️', famille: 'Mécanique',
    description: 'Allongement entre points fixes, longueur du bras flexible (L, Z), lyre et course des compensateurs.',
    champs: [{ g: 'Tuyauterie' }, { k: 'serie', l: 'Série de tubes', t: 's', o: optSeries(), d: 'acier-10216' }, { k: 'tube', l: 'Tube', t: 's', o: optTubes, d: '114.3x3.6' },
      { k: 'materiau', l: 'Matériau (vide : celui de la série)', t: 's', o: [['', 'Selon la série'], ...optMateriaux], d: '' },
      { k: 'L', l: 'Distance entre points fixes', u: 'm', d: 40 },
      { g: 'Températures' }, { k: 'Tpose', l: 'Température de pose', u: '°C', d: 10 }, { k: 'Tmin', l: 'Température minimale', u: '°C', d: 5 }, { k: 'Tmax', l: 'Température maximale', u: '°C', d: 90 },
      { g: 'Compensation' }, { k: 'sigma', l: 'Contrainte admissible de flexion (métaux, vide : valeur par défaut)', u: 'MPa', d: '' },
      { k: 'precontrainte', l: 'Précontrainte à la pose (lyre, compensateur)', t: 's', o: [['0', 'Aucune'], ['50', '50 % de la dilatation']], d: '0' }],
    calcul(e) {
      const t = C.tube(e.serie, e.tube) || C.tubes(e.serie)[0], mk = e.materiau || D.SERIES[e.serie].materiau, m = D.MATERIAUX[mk], L = num(e.L) * 1000;
      const dLc = m.alpha * L * (num(e.Tmax) - num(e.Tpose)), dLf = m.alpha * L * (num(e.Tpose) - num(e.Tmin)), dL = Math.abs(dLc) + Math.abs(dLf);
      const pre = num(e.precontrainte) / 100, dLcalc = Math.max(Math.abs(dLc), Math.abs(dLf), dL * (1 - pre));
      const metal = !m.C, sigma = metal ? num(e.sigma, m.sigma) || m.sigma : NaN;
      const Lb = metal ? Math.sqrt(3 * m.E * t.de * dLcalc / sigma) : m.C * Math.sqrt(t.de * dLcalc); // mm
      const H = Lb / 2.5; // lyre en U : 2 jambes H + traverse H/2 ≈ bras flexible développé
      const alertes = [alerte('ok', `Allongement ${nf(Math.abs(dLc), 1)} mm à chaud, bras flexible ≥ ${nf(Lb / 1000, 2)} m.`)];
      if (dL > 50 && metal) alertes.push(alerte('attention', 'Dilatation importante : vérifier l\'espace disponible pour les lyres ou prévoir des compensateurs axiaux guidés.'));
      if (!metal) alertes.push(alerte('attention', 'Tube plastique : appliquer les règles de pose du fabricant (bras flexible, colliers coulissants, points fixes).'));
      return {
        valeurs: { dLc, dLf, dL, Lb, H },
        resume: [['Tube / matériau', `${t.nom} — ${m.libelle}`], ['Coefficient de dilatation', `${nf(m.alpha * 1e6, 1)} × 10⁻⁶ /K`], ['Allongement à chaud (Tmax − Tpose)', `${nf(dLc, 1)} mm`],
          ['Raccourcissement à froid (Tpose − Tmin)', `${nf(dLf, 1)} mm`], ['Course totale', `${nf(dL, 1)} mm`], ['Dilatation à absorber par le bras', `${nf(dLcalc, 1)} mm${pre ? ' (précontrainte 50 %)' : ''}`],
          ['Longueur du bras flexible (L ou Z)', `${nf(Lb / 1000, 2)} m`], ['Lyre en U : hauteur × largeur', `${nf(H / 1000, 2)} × ${nf(H / 2000, 2)} m`],
          ['Compensateur axial : course nominale mini', `± ${nf(dL / 2 * 1.2, 0)} mm (ou ${nf(dL * 1.2, 0)} mm en course totale)`]],
        tableaux: [{ titre: 'Allongement selon la distance entre points fixes', entetes: ['Distance (m)', 'ΔL à chaud (mm)', 'Course totale (mm)', 'Bras flexible (m)'],
          lignes: [10, 20, 30, 40, 50, 60, 80, 100].map(x => { const k = x * 1000 / L || 0, d = dLcalc * k; return [String(x), nf(Math.abs(dLc) * k, 1), nf(dL * k, 1), nf((metal ? Math.sqrt(3 * m.E * t.de * d / sigma) : m.C * Math.sqrt(t.de * d)) / 1000, 2)]; }) }],
        alertes,
        hypotheses: ['ΔL = α · L · ΔT.', metal ? `Bras flexible (console guidée) : Lb = √(3 · E · De · ΔL / σ), E = ${nf(m.E, 0)} MPa, σ = ${nf(sigma, 0)} MPa.` : `Bras flexible (règle fabricant) : Lb = ${String(m.C).replace('.', ',')} · √(De · ΔL), en mm.`,
          'Lyre en U : pré-dimensionnement avec 2 jambes de hauteur H et une traverse H/2 (longueur développée ≈ bras flexible) ; à vérifier par calcul de flexibilité pour les tuyauteries soumises à la réglementation ESP.',
          'Compensateur : course minimale majorée de 20 % ; guides de part et d\'autre (4 D et 14 D) et points fixes dimensionnés pour l\'effet de fond.'],
        synthese: `${t.nom} · ΔL ${nf(Math.abs(dLc), 1)} mm · bras ${nf(Lb / 1000, 2)} m`,
      };
    },
  };

  /* ---------- 12. Épaisseur sous pression ---------- */
  TYPES.epaisseur = {
    titre: 'Épaisseur des tubes sous pression (NF EN 13480-3)', icone: '🧪', famille: 'Mécanique',
    description: 'Épaisseur minimale requise, vérification des tubes de la série, pression maximale admissible et pression d\'épreuve.',
    champs: [{ g: 'Conditions de calcul' }, { k: 'PS', l: 'Pression maximale admissible PS', u: 'bar', d: 16 }, { k: 'TS', l: 'Température de calcul', u: '°C', d: 120 },
      { g: 'Tube' }, { k: 'nuance', l: 'Nuance', t: 's', o: Object.entries(D.ACIERS_PRESSION).map(([k, m]) => [k, m.libelle]), d: 'P235GH' },
      { k: 'serie', l: 'Série de tubes', t: 's', o: optSeries(k => /acier-10216|acier-10255|inox-1127/.test(k)), d: 'acier-10216' },
      { k: 'z', l: 'Coefficient de joint de soudure z', t: 's', o: [['1', '1 — tube sans soudure ou soudure contrôlée à 100 %'], ['0.85', '0,85 — contrôle par sondage'], ['0.7', '0,7 — contrôle visuel seul']], d: '1' },
      { k: 'c0', l: 'Surépaisseur de corrosion c0', u: 'mm', d: 1 }, { k: 'tol', l: 'Tolérance négative sur l\'épaisseur', u: '%', d: 12.5 }],
    calcul(e) {
      const PS = num(e.PS), TS = num(e.TS, 20), z = num(e.z, 1), c0 = num(e.c0), tol = num(e.tol, 12.5) / 100, cn = C.contrainteNominale(e.nuance, TS), alertes = [];
      const lignes = C.tubes(e.serie).map(t => {
        const emin = C.epaisseurMini(PS, t.de, cn.f, z), eOrd = (emin + c0) / (1 - tol), eUtile = t.ep * (1 - tol) - c0;
        return { t, emin, eOrd, Pmax: C.pressionMaxi(eUtile, t.de, cn.f, z), ok: t.ep >= eOrd - 1e-9 };
      });
      const PT = Math.max(1.25 * PS * cn.f20 / cn.f, 1.43 * PS), ko = lignes.filter(l => !l.ok);
      if (cn.horsPlage) alertes.push(alerte('erreur', 'Température hors des valeurs tabulées (20 à 400 °C) : au-delà, le fluage doit être considéré.'));
      if (TS > 300 && !D.ACIERS_PRESSION[e.nuance].austenitique) alertes.push(alerte('attention', 'Au-delà de 300 °C pour les aciers ferritiques, vérifier les caractéristiques de fluage.'));
      alertes.push(ko.length ? alerte('attention', `Épaisseur de la série insuffisante pour : ${ko.map(l => l.t.nom).join(', ')}.`) : alerte('ok', 'Tous les tubes de la série conviennent.'));
      return {
        valeurs: { f: cn.f, PT, lignes: lignes.map(l => ({ cle: l.t.cle, emin: l.emin, eOrd: l.eOrd, Pmax: l.Pmax, ok: l.ok })) },
        resume: [['Nuance', D.ACIERS_PRESSION[e.nuance].libelle], [`Limite d'élasticité à ${nf(TS, 0)} °C`, `${nf(cn.Rp, 0)} MPa`], ['Contrainte nominale de calcul f', `${nf(cn.f, 1)} MPa`],
          ['Coefficient de soudure z', nf(z, 2)], ['Pression d\'épreuve hydraulique PT', `${nf(PT, 1)} bar`], ['Tubes non conformes', ko.length ? String(ko.length) : 'aucun']],
        tableaux: [{ titre: 'Vérification des tubes de la série', entetes: ['Tube', 'e nominale (mm)', 'e calcul (mm)', 'e à commander (mm)', 'P maxi admissible (bar)', 'Conformité'],
          lignes: lignes.map(l => [l.t.nom, nf(l.t.ep, 2), nf(l.emin, 2), nf(l.eOrd, 2), nf(l.Pmax, 1), l.ok ? 'OK' : 'insuffisant']) }],
        alertes,
        hypotheses: ['Épaisseur requise (EN 13480-3 § 6.1) : e = P · Do / (2 · f · z + P).', D.ACIERS_PRESSION[e.nuance].austenitique ? 'Acier austénitique : f = Rp1,0t / 1,5 (option prudente).' : 'Acier ferritique : f = min(ReH,t / 1,5 ; Rm / 2,4).',
          'Épaisseur à commander : (e + c0) / (1 − tolérance négative) ; pression maxi admissible calculée sur l\'épaisseur nominale diminuée de la tolérance et de c0.',
          'Pression d\'épreuve (EN 13480-5) : PT = max(1,25 · PS · f20 / ft ; 1,43 · PS).', 'Caractéristiques des matériaux indicatives : se référer au certificat matière (EN 10204 3.1).'],
        synthese: `${D.ACIERS_PRESSION[e.nuance].libelle.split(' ')[0]} · PS ${nf(PS, 1)} bar à ${nf(TS, 0)} °C · PT ${nf(PT, 1)} bar · ${ko.length ? `${ko.length} tube(s) insuffisant(s)` : 'série conforme'}`,
      };
    },
  };

  /* ---------- 13. Supportage ---------- */
  TYPES.supportage = {
    titre: 'Portée entre supports', icone: '🏗️', famille: 'Mécanique',
    description: 'Espacement maximal des supports d\'une tuyauterie métallique horizontale (poids propre, fluide, isolant).',
    champs: [{ g: 'Tuyauterie' }, { k: 'serie', l: 'Série de tubes', t: 's', o: optSeries(k => /acier|inox|cuivre/.test(k)), d: 'acier-10216' }, { k: 'tube', l: 'Tube', t: 's', o: optTubes, d: '114.3x3.6' },
      { k: 'contenu', l: 'Contenu', t: 's', o: [['1000', 'Eau'], ['1040', 'Eau glycolée'], ['0', 'Gaz / vapeur (tube vide)'], ['perso', 'Autre liquide']], d: '1000' },
      { k: 'rhoF', l: 'Masse volumique du liquide', u: 'kg/m³', d: 900, si: e => e.contenu === 'perso' }, { k: 'T', l: 'Température de service', u: '°C', d: 80 },
      { g: 'Isolation' }, { k: 'isolant', l: 'Isolant', t: 's', o: [['', 'Aucun'], ...optIsolants], d: 'laine-roche' }, { k: 'epIso', l: 'Épaisseur d\'isolant', u: 'mm', d: 40, si: e => !!e.isolant },
      { k: 'chargeSup', l: 'Charge répartie supplémentaire (tôle, traçage…)', u: 'N/m', d: 20 },
      { g: 'Critères' }, { k: 'fleche', l: 'Flèche admissible', u: 'mm', d: 2.5 }, { k: 'sigma', l: 'Contrainte de flexion admissible', u: 'MPa', d: 50 }],
    calcul(e) {
      const s = D.SERIES[e.serie], m = D.MATERIAUX[s.materiau], T = num(e.T, 20), E = m.E * (1 - 0.00026 * Math.max(0, T - 20));
      const rhoF = e.contenu === 'perso' ? num(e.rhoF) : num(e.contenu), iso = e.isolant ? D.ISOLANTS[e.isolant] : null, epIso = iso ? num(e.epIso) : 0;
      const p = t => C.portee({ de: t.de, ep: t.ep, rhoMat: m.rho, E, rhoFluide: rhoF, epIso, rhoIso: iso ? iso.rho : 0, fleche: num(e.fleche, 2.5), sigma: num(e.sigma, 50), chargeSup: num(e.chargeSup) });
      const t = C.tube(e.serie, e.tube) || C.tubes(e.serie)[0], r = p(t), arrondi = x => Math.floor(x * 10) / 10;
      return {
        valeurs: { ...r, retenue: arrondi(r.L) },
        resume: [['Tube', `${t.nom} — ${m.libelle}`], ['Masse linéique tube / fluide / isolant', `${nf(r.mTube, 2)} / ${nf(r.mFluide, 2)} / ${nf(r.mIso, 2)} kg/m`], ['Charge répartie totale', `${nf(r.q, 1)} N/m`],
          ['Portée limitée par la flèche', `${nf(r.Lf, 2)} m`], ['Portée limitée par la contrainte', `${nf(r.Ls, 2)} m`], ['Portée maximale retenue', `${nf(arrondi(r.L), 1)} m (critère : ${r.critere})`]],
        tableaux: [{ titre: `Portées maximales de la série (mêmes hypothèses)`, entetes: ['Tube', 'Charge (N/m)', 'L flèche (m)', 'L contrainte (m)', 'Portée retenue (m)'],
          lignes: C.tubes(e.serie).map(x => { const y = p(x); return [x.nom, nf(y.q, 1), nf(y.Lf, 2), nf(y.Ls, 2), nf(arrondi(y.L), 1)]; }), surligne: C.tubes(e.serie).findIndex(x => x.cle === t.cle) }],
        alertes: [alerte('ok', `Supports tous les ${nf(arrondi(r.L), 1)} m au maximum.`), alerte('attention', 'Ajouter un support près de chaque charge concentrée (vanne, filtre, compteur) et de part et d\'autre des changements de direction.')],
        hypotheses: ['Travée sur deux appuis simples (prudent par rapport à une poutre continue) : flèche 5qL⁴ / (384 EI), moment qL² / 8.', `Module d'Young corrigé à ${nf(T, 0)} °C : ${nf(E, 0)} MPa.`,
          'Tube plein du liquide ; les épreuves hydrauliques des réseaux vapeur/gaz se font avec supports provisoires si nécessaire.'],
        synthese: `${t.nom} · supports ≤ ${nf(arrondi(r.L), 1)} m`,
      };
    },
  };

  /* ---------- Exécution ---------- */
  // Valeurs par défaut d'un type (copie profonde des listes)
  function defauts(type) {
    const out = {};
    TYPES[type].champs.forEach(c => { if (c.k) out[c.k] = JSON.parse(JSON.stringify(c.d)); });
    return out;
  }
  function calculer(type, entrees) {
    const T = TYPES[type];
    if (!T) throw new Error(`Type de calcul inconnu : ${type}`);
    const e = { ...defauts(type), ...(entrees || {}) };
    // Tube choisi absent de la série (série modifiée) : premier tube de la série
    T.champs.filter(c => c.t === 's' && typeof c.o === 'function').forEach(c => { const o = c.o(e); if (!o.some(([v]) => v === e[c.k])) e[c.k] = o[0][0]; });
    try { return T.calcul(e); } catch (err) { return { valeurs: {}, resume: [], tableaux: [], alertes: [alerte('erreur', `Calcul impossible : ${err.message}`)], hypotheses: [], synthese: 'Erreur de calcul' }; }
  }
  const familles = () => [...new Set(Object.values(TYPES).map(t => t.famille))];
  return { TYPES, defauts, calculer, familles, nf, num, libPompe, libVanne };
})(typeof Donnees !== 'undefined' ? Donnees : require('./donnees'), typeof Calculs !== 'undefined' ? Calculs : require('./calculs'));
if (typeof module !== 'undefined') module.exports = Notes;
