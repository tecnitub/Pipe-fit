// Schéma de principe hydraulique (P&ID) d'un réseau d'eau chaude ou d'eau glacée : production (un générateur ou une cascade),
// bouteille de découplage ou non, collecteurs, circuits de distribution vers les émetteurs. Le calcul dimensionne débits,
// diamètres, pompes, vannes, bouteille et collecteurs, et dessine le schéma en SVG (affiché, joint à la note de calcul PDF).
const Schema = ((D, C, N) => {
  const { nf, num } = N;
  const alerte = (niveau, texte) => ({ niveau, texte });
  const xe = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- Données ---------- */
  // Régimes de température [libellé, départ, retour]
  const REGIMES = {
    'ch-80-60': ['Eau chaude 80/60 °C', 80, 60], 'ch-70-50': ['Eau chaude 70/50 °C', 70, 50], 'ch-55-45': ['Eau chaude 55/45 °C (condensation, PAC haute température)', 55, 45],
    'ch-45-35': ['Eau chaude 45/35 °C (PAC)', 45, 35], 'ch-35-30': ['Eau chaude 35/30 °C (plancher chauffant)', 35, 30],
    'eg-7-12': ['Eau glacée 7/12 °C', 7, 12], 'eg-6-12': ['Eau glacée 6/12 °C', 6, 12], 'eg-10-15': ['Eau glacée 10/15 °C (froid sensible)', 10, 15],
    'eg-14-17': ['Eau froide 14/17 °C (plafonds et poutres froides)', 14, 17], co: ['Change-over 2 tubes : eau chaude l\'hiver, eau glacée l\'été'], perso: ['Autre régime (températures saisies)'],
  };
  // Générateurs [libellé, usage : chaud, froid ou les deux]
  const GENERATEURS = {
    'chaudiere-cond': ['Chaudière gaz à condensation', 'chaud'], 'chaudiere-gaz': ['Chaudière gaz basse température', 'chaud'], 'chaudiere-fioul': ['Chaudière fioul', 'chaud'],
    'chaudiere-bois': ['Chaudière bois / biomasse', 'chaud'], 'pac-air': ['Pompe à chaleur air/eau', 'chaud'], 'pac-eau': ['Pompe à chaleur eau/eau', 'chaud'],
    'pac-rev': ['PAC réversible air/eau', 'mixte'], 'gf-air': ['Groupe froid air/eau', 'froid'], 'gf-eau': ['Groupe froid eau/eau (tour, aéroréfrigérant)', 'froid'],
    echangeur: ['Échangeur (sous-station, réseau de chaleur ou de froid)', 'mixte'], 'echangeur-vapeur': ['Échangeur vapeur / eau', 'chaud'],
  };
  // Émetteurs et utilisateurs [libellé, perte de charge usuelle kPa, usage]
  const EMETTEURS = {
    radiateurs: ['Radiateurs', 10, 'chaud'], plancher: ['Plancher chauffant', 25, 'chaud'], cta: ['Batterie de CTA', 20, 'mixte'], ventilo: ['Ventilo-convecteurs', 30, 'mixte'],
    aerotherme: ['Aérothermes', 15, 'chaud'], radiant: ['Panneaux rayonnants', 15, 'chaud'], plafond: ['Plafonds / poutres froides', 25, 'froid'],
    ecs: ['Production d\'ECS (ballon, échangeur)', 20, 'chaud'], process: ['Process (échangeur, machine)', 30, 'mixte'], sousstation: ['Départ réseau / sous-station', 20, 'mixte'],
  };
  // Robinetterie et accessoires : [libellé, ζ usuel (perte de charge si ni Kv ni ΔP de la fiche), quantité usuelle par circuit]
  const ROBINETTERIE = {
    isolement: ['Vanne d\'isolement 1/4 tour (papillon, sphérique)', 0.3, 2], clapet: ['Clapet anti-retour', 2.5, 1], equilibrage: ['Vanne d\'équilibrage (réglage, mesure)', 0, 1],
    filtre: ['Filtre à tamis', 2.5, 1], desemboueur: ['Pot à boue / désemboueur magnétique', 1.5, 1], compteur: ['Compteur d\'énergie (débitmètre)', 1.5, 1],
    regulation: ['Vanne de régulation motorisée (si autre que celle du circuit)', 0, 1], manchette: ['Manchette anti-vibratile', 0.5, 2], soupape: ['Soupape de sécurité', 0, 1],
    purgeur: ['Purgeur automatique', 0, 1], thermometre: ['Thermomètre / manomètre (doigt de gant)', 0, 2], echangeur: ['Échangeur, batterie (autre que l\'émetteur)', 0, 1], autre: ['Autre accessoire', 0, 1],
  };
  const REGULATIONS = { '3v': 'Vanne 3 voies mélangeuse', '2v': 'Vanne 2 voies (débit variable)', direct: 'Sans vanne (départ direct)',
    injection3: 'Injection par vanne 3 voies (pompes primaire et secondaire)', injection2: 'Injection par vanne 2 voies avec by-pass', decharge: 'Montage en décharge (vanne 3 voies répartitrice)',
    bouteille: 'Bouteille de découplage du circuit (pompes primaire et secondaire)', echangeur: 'Échangeur de circuit (pompes primaire et secondaire)' };
  // Montages hydrauliques des circuits : vanne (type pour le catalogue), mélange possible (régime propre au circuit),
  // pompe primaire de circuit (PCP) en plus de la pompe secondaire (PC), libellé court du schéma
  const MONTAGES = {
    '3v': { vanne: '3v', melange: true, pp: false, court: 'Mélange V3V' }, '2v': { vanne: '2v', melange: false, pp: false, court: 'V2V débit variable' },
    direct: { vanne: null, melange: false, pp: false, court: 'Départ direct' }, injection3: { vanne: '3v', melange: true, pp: true, court: 'Injection V3V' },
    injection2: { vanne: '2v', melange: true, pp: false, court: 'Injection V2V + by-pass' }, decharge: { vanne: '3v', melange: false, pp: false, court: 'Décharge V3V' },
    bouteille: { vanne: null, melange: false, pp: true, court: 'Bouteille de circuit' }, echangeur: { vanne: '2v', melange: true, pp: true, court: 'Échangeur de circuit' },
  };
  const montage = reg => MONTAGES[reg] || MONTAGES['3v'];
  // Rôles des générateurs d'une production hétérogène (ordre de priorité de la régulation)
  const ROLES = { base: 'Base', releve: 'Relève', appoint: 'Appoint', secours: 'Secours', recuperation: 'Récupération' };
  const ORDRE_ROLES = ['recuperation', 'base', 'releve', 'appoint', 'secours'];
  // Ballons : fonction [libellé, ratio par défaut L/kW (tampon, ECS), piquages, sondes par défaut]
  const BALLONS = {
    tampon: ['Ballon tampon (anti-courts-cycles)', 10, '2', 'haut,bas'], stockage: ['Ballon de stockage d\'énergie', 0, '4', 'haut,milieu,bas'],
    ecs: ['Ballon d\'eau chaude sanitaire', 20, '2', 'milieu'], decouplage: ['Ballon de découplage (4 piquages)', 10, '4', 'haut,bas'],
  };
  const SONDES = { haut: 'haute', milieu: 'médiane', bas: 'basse' };
  // Préfixe de repère par type de générateur
  const prefixeGen = t => (/^gf/.test(t) ? 'GF' : /^pac/.test(t) ? 'PAC' : /^echangeur/.test(t) ? 'EC' : 'G');
  // Générateurs saisis ligne par ligne (production hétérogène) ; vide : générateur × nombre (saisie historique)
  function lireGenerateurs(e, chaud, dT, debit, choisir) {
    const l = (e.generateurs || []).filter(x => x && GENERATEURS[x.type] && num(x.P) > 0);
    if (!l.length) return null;
    const n = l.length, pompesInd = n === 1 || e.pompesPrim !== 'commune';
    return l.map((x, i) => {
      const rg = regimeCircuit(x.regime), dTg = rg ? Math.abs(rg[0] - rg[1]) || dT : dT, P = num(x.P), Q = debit(P, dTg), t = choisir(Q), role = ROLES[x.role] ? x.role : 'base';
      const pompe = x.pompe === 'integree' || (!x.pompe && e.pompeGen === 'integree') ? 'integree' : '';
      // Perte de charge côté eau : colonne « ΔP » (saisie, ou reprise de la fiche du registre), sinon forfait selon le type
      const dpe = dpOuForfait(x.dp, DP_GEN(x.type), !!(x.eq && x.fiche));
      return { i, rep: String(x.rep || '').trim() || `${prefixeGen(x.type)}${i + 1}`, type: x.type, gen: GENERATEURS[x.type], P, role, pompe, regime: rg, Q, t, alim: x.alim || '', pp: pompesInd && pompe !== 'integree', dpEau: dpe.v, dpSrc: dpe.src };
    });
  }

  /* ---------- Calcul ---------- */
  const regimeCircuit = txt => { const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*\/\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(String(txt || '')); return m ? [num(m[1]), num(m[2])] : null; };
  function dimensionnerRegime(e) {
    const r = REGIMES[e.reseau] || REGIMES['ch-70-50'], Td = e.reseau === 'perso' ? num(e.Tdep, 70) : r[1], Tr = e.reseau === 'perso' ? num(e.Tret, 50) : r[2];
    const chaud = Td > Tr, dT = Math.abs(Td - Tr), f = C.liquide(e.fluide || 'eau', (Td + Tr) / 2), s = D.SERIES[e.serie] || D.SERIES['acier-10216'];
    const vmax = num(e.vmax, 1.5), Rmax = num(e.Rmax, 150), tubes = C.tubes(e.serie || 'acier-10216'), alertes = [];
    const debit = (P, ecart) => (ecart > 0 ? P * 1000 / (f.rho * f.cp * ecart) * 3600 : 0); // m³/h
    const choisir = (Q, v = vmax) => tubes.find(t => { const x = C.ecoulement(Q / 3600, t.di / 1000, f.rho, f.mu, s.rugosite); return x.v <= v && x.R <= Rmax; }) || tubes[tubes.length - 1];
    const ecoul = (Q, t) => C.ecoulement(Q / 3600, t.di / 1000, f.rho, f.mu, s.rugosite);
    if (dT <= 0) alertes.push(alerte('erreur', 'Les températures de départ et de retour doivent être différentes.'));
    // Échangeur à plaques : le secondaire est décalé du pincement (contre-courant)
    // Découplage hydraulique : bouteille 4 piquages, bouteille 3 piquages (retour commun) ou ballon tampon de découplage
    const decouplage = ['oui', 'bouteille3', 'ballon'].includes(e.bouteille) ? e.bouteille : '', bouteille = !!decouplage, echangeur = e.bouteille === 'echangeur', pinc = Math.max(0.5, num(e.pincement, 3));
    const Tsd = echangeur ? (chaud ? Td - pinc : Td + pinc) : Td, Tsr = echangeur ? (chaud ? Tr - pinc : Tr + pinc) : Tr;

    // Circuits de distribution
    // Pression différentielle variable côté collecteurs (branche primaire d'un circuit mélangé) : faible derrière un découplage
    const dpColl = bouteille || echangeur ? 2 : 10;
    const circuits = (e.circuits || []).map((c, i) => {
      const em = EMETTEURS[c.emetteur] || EMETTEURS.radiateurs, reg = REGULATIONS[c.regulation] ? c.regulation : '3v', M = montage(reg);
      const rc = regimeCircuit(c.regime) || [Tsd, Tsr], dTc = Math.abs(rc[0] - rc[1]), P = num(c.P), rep = c.rep || `C${i + 1}`;
      const Q = debit(P, dTc), t = choisir(Q), x = ecoul(Q, t);
      // Débit appelé sur le collecteur : un circuit mélangé reprend l'écart entre le départ du réseau et son propre retour ;
      // un échangeur de circuit reprend l'écart entre le départ du réseau et le retour secondaire décalé du pincement
      const TrPrimEch = chaud ? rc[1] + pinc : rc[1] - pinc;
      const Qcoll = ['3v', 'injection3', 'injection2'].includes(reg) ? debit(P, Math.abs(Tsd - rc[1])) : reg === 'echangeur' ? debit(P, Math.max(0.5, chaud ? Tsd - TrPrimEch : TrPrimEch - Tsd)) : Q;
      // Réseau annexe relié (réseau arborescent, réseau et pompe) : ses pertes de charge remplacent celle de l'émetteur
      const dpAnnexe = num(c.dpAnnexe) > 0 ? num(c.dpAnnexe) : 0, dpEm = dpAnnexe || em[1], dpL = x.R * num(c.L) * 1.3 / 1000;
      // Robinetterie saisie sur ce circuit (fiches techniques) : remplace la valeur forfaitaire de 5 kPa
      const rob = robinetterie(e, rep, Q, t, f), dpRob = rob.reduce((a, x) => a + x.dpTot, 0), dpRobF = rob.length ? dpRob : 5;
      // Échangeur de circuit : ΔP saisie (« 25 » pour les deux côtés, « 25/18 » primaire/secondaire), sinon forfait
      const dpEchC = reg === 'echangeur' ? dpEchCircuit(c.dpEch) : null, dpEchCP = dpEchC ? dpEchC.p : DP_ECH, dpEchCS = dpEchC ? dpEchC.s : DP_ECH;
      // Débit de la vanne : sur le primaire du circuit pour les montages en injection et l'échangeur
      const Qv = ['injection3', 'injection2', 'echangeur'].includes(reg) ? Qcoll : Q;
      // Vanne : perte de charge et partie du circuit à débit variable (autorité = ΔPvanne / (ΔPvanne + ΔP variable))
      const dpVar = { '3v': dpColl, '2v': dpL + dpEm + dpRobF, injection3: 2, injection2: dpColl + 3, decharge: dpEm, echangeur: dpEchCP + 3 }[reg] || 0;
      // Kvs retenu (saisi ou appliqué par le redimensionnement des vannes) : ΔP réelle de la vanne à son débit
      const kvsImpose = M.vanne && num(c.kvsVanne) > 0 ? num(c.kvsVanne) : 0;
      const dpV = !M.vanne ? 0 : kvsImpose ? (Qv / kvsImpose) ** 2 * 100 * f.rho / 1000 : reg === '3v' || reg === '2v' ? Math.max(em[1], 10) : Math.max(10, dpVar);
      const autorite = M.vanne ? dpV / (dpV + dpVar) : null;
      // Pompe secondaire (PC) : vanne dans sa boucle (mélange, 2 voies, décharge) ou non (injection, bouteille, échangeur)
      const dpSec = ['injection3', 'injection2', 'bouteille'].includes(reg) ? 1 : reg === 'echangeur' ? dpEchCS : dpV;
      const hmt = (dpL + dpEm + dpSec + dpRobF) * 1000 / (f.rho * C.G), kvs = !M.vanne ? null : kvsImpose || D.KVS.find(k => k >= C.kv(Qv, dpV, f.rho) * 0.97) || null;
      const different = Math.abs(rc[0] - Tsd) > 0.5 || Math.abs(rc[1] - Tsr) > 0.5;
      if (different && !M.melange) alertes.push(alerte('attention', `${rep} : régime ${rc[0]}/${rc[1]} °C différent du réseau sans vanne 3 voies de mélange.`));
      if (reg === '3v' && (chaud ? rc[0] > Tsd : rc[0] < Tsd)) alertes.push(alerte('erreur', `${rep} : départ du circuit (${rc[0]} °C) ${chaud ? 'plus chaud' : 'plus froid'} que le départ ${echangeur ? 'du secondaire de l\'échangeur' : 'du réseau'} (${Tsd} °C).`));
      if (['injection3', 'injection2'].includes(reg) && (chaud ? rc[0] > Tsd : rc[0] < Tsd)) alertes.push(alerte('erreur', `${rep} : départ du circuit (${rc[0]} °C) ${chaud ? 'plus chaud' : 'plus froid'} que le départ du réseau (${Tsd} °C) : l'injection ne peut que mélanger.`));
      if (reg === 'echangeur' && (chaud ? rc[0] > Tsd - pinc : rc[0] < Tsd + pinc)) alertes.push(alerte('erreur', `${rep} : départ secondaire de l'échangeur (${rc[0]} °C) incompatible avec le départ du réseau (${Tsd} °C) et le pincement (${nf(pinc, 1)} K).`));
      if (em[2] !== 'mixte' && em[2] !== (chaud ? 'chaud' : 'froid')) alertes.push(alerte('attention', `${rep} : ${em[0].toLowerCase()} sur un réseau d'${chaud ? 'eau chaude' : 'eau glacée'}.`));
      const Cat = typeof Catalogue !== 'undefined' ? Catalogue : require('./catalogue');
      const pompe = Cat.pompesPour(Q, hmt)[0] || null, vanne = !M.vanne ? null : Cat.vannePour(C.kv(Qv, dpV, f.rho), M.vanne);
      if (dpAnnexe) alertes.push(alerte('ok', `${rep} : pompe dimensionnée sur le réseau annexe (${nf(dpAnnexe, 1)} kPa) + vanne ${nf(dpV, 1)} kPa + liaison et collecteur ${nf(dpL + 5, 1)} kPa = ${nf(hmt, 2)} mCE.`));
      // Pompe primaire du circuit (PCP) : injection 3 voies (vanne sur le primaire), bouteille, échangeur
      let prim = null;
      if (M.pp) {
        const dpP = (reg === 'bouteille' ? 1 : dpV) + 5 + (reg === 'echangeur' ? dpEchCP : reg === 'injection3' ? 2 : 0), hP = dpP * 1000 / (f.rho * C.G);
        prim = { Q: Qcoll, hmt: hP, dp: dpP, pompe: Cat.pompesPour(Qcoll, hP)[0] || null };
      }
      // Bouteille de découplage du circuit : vitesse verticale ≤ 0,2 m/s, diamètre ≥ 3 fois le piquage
      let bout = null, ech = null;
      if (reg === 'bouteille') { const Db = Math.max(Math.sqrt(4 * Q / 3600 / (Math.PI * 0.2)) * 1000, 3 * t.dn); bout = { Db, tb: C.tubes('acier-10216').find(z => z.di >= Db) || null }; }
      if (reg === 'echangeur') ech = { A: P * 1000 / (4000 * pinc), Tprim: [Tsd, Math.round(TrPrimEch * 10) / 10] };
      // Alertes propres au montage
      if (autorite !== null && autorite < 0.5) alertes.push(alerte('attention', `${rep} : autorité de la vanne ${nf(autorite, 2)} < 0,5 (ΔP vanne ${nf(dpV, 1)} kPa, ΔP à débit variable ${nf(dpVar, 1)} kPa) : vanne plus résistante (bouton « Redimensionner les vannes ») ou régulateur de pression différentielle conseillé.`));
      const bypass = reg === '2v' ? { dp: Math.round((dpL + dpEm + dpRobF + dpV) * 10) / 10 } : null;
      if (bypass) alertes.push(alerte('attention', `${rep} : vanne 2 voies — by-pass différentiel (soupape différentielle) en bout de circuit, réglé vers ${nf(bypass.dp, 0)} kPa, pour garder le débit minimal de la pompe à vannes fermées.`));
      if (reg === 'injection2') alertes.push(bouteille || echangeur ? alerte('attention', `${rep} : injection 2 voies derrière ${echangeur ? 'un échangeur' : 'une bouteille de découplage'} : pas de pression différentielle au collecteur pour faire circuler le primaire ; préférer l'injection 3 voies (pompe primaire) ou une pompe de collecteur.`)
        : alerte('ok', `${rep} : injection 2 voies — pression différentielle disponible au collecteur ≥ ${nf(dpV + dpColl + 3, 0)} kPa, by-pass neutre (sans clapet) entre départ et retour du circuit.`));
      if (reg === 'decharge') alertes.push(alerte('ok', `${rep} : montage en décharge — débit constant au collecteur (${nf(Q, 2)} m³/h), débit variable dans l'émetteur ; la température de départ n'est pas abaissée.`));
      if (bout) alertes.push(alerte('ok', `${rep} : bouteille de découplage du circuit Ø intérieur mini ${nf(bout.Db, 0)} mm${bout.tb ? ` (${bout.tb.nom})` : ''} ; pompe primaire ${nf(prim.Q, 2)} m³/h, pompe secondaire ${nf(Q, 2)} m³/h.`));
      if (ech) alertes.push(alerte('ok', `${rep} : échangeur de circuit ${nf(P, 0)} kW ≈ ${nf(ech.A, 1)} m², primaire ${ech.Tprim[0]}/${ech.Tprim[1]} °C, secondaire ${rc[0]}/${rc[1]} °C ; vase d'expansion et soupape côté secondaire.`));
      // Pompe choisie sur la fiche du fabricant : point de fonctionnement sur sa courbe
      const pf = pointPompe(e, rep, Q, hmt);
      if (pf) {
        if (!pf.ok) alertes.push(alerte('erreur', `${rep} : pompe ${pf.ref || ''} insuffisante : ${nf(pf.Hpompe ?? 0, 2)} mCE à ${nf(Q, 2)} m³/h pour ${nf(hmt, 2)} mCE demandés (point réel ${nf(pf.Q, 2)} m³/h, ${nf(pf.ecart, 0)} %).`));
        else alertes.push(alerte(pf.ecart > 25 ? 'attention' : 'ok', `${rep} : pompe ${pf.ref || ''} : point de fonctionnement ${nf(pf.Q, 2)} m³/h sous ${nf(pf.H, 2)} mCE à pleine vitesse (+${nf(pf.ecart, 0)} %) ; vitesse de réglage ≈ ${nf(pf.vitesse, 0)} % pour ${nf(Q, 2)} m³/h${pf.ecart > 25 ? ' : pompe surdimensionnée à vitesse fixe' : ''}.`)); }
      return { rep, em, emetteur: c.emetteur, reg, M, rc, P, Q, Qcoll, t, v: x.v, hmt, kvs, kvsImpose, dpV, dpL, dpEm, dpAnnexe, L: num(c.L), pompe, vanne, rob, dpRob, pf, dpVar, autorite, Qv, prim, bout, ech, bypass, dpEchC };
    });
    // Production : générateurs saisis ligne par ligne (production hétérogène : base, relève, appoint, secours,
    // récupération), sinon un type de générateur × nombre identique (saisie historique)
    const multi = lireGenerateurs(e, chaud, dT, debit, choisir), actifs = multi ? multi.filter(x => x.role !== 'secours') : null;
    const principal = multi ? (actifs.find(x => x.role === 'base') || actifs[0] || multi[0]) : null, gk = principal ? principal.type : e.generateur || '';
    const plusGros = multi ? multi.reduce((a, x) => (x.P > a.P ? x : a), multi[0]) : null;
    const n = multi ? multi.length : Math.max(1, Math.min(6, Math.round(num(e.nGen, 1)))), Pg = multi ? plusGros.P : num(e.Pgen);
    const Pprod = multi ? actifs.reduce((a, x) => a + x.P, 0) : n * Pg, gen = multi ? principal.gen : GENERATEURS[e.generateur] || GENERATEURS['chaudiere-cond'];
    const Qg = multi ? plusGros.Q : debit(Pg, dT), tg = multi ? plusGros.t : choisir(Qg), Qp = multi ? actifs.reduce((a, x) => a + x.Q, 0) : n * Qg;
    const Pdem = circuits.reduce((a, c) => a + c.P, 0) * num(e.foisonnement, 100) / 100, Qs = circuits.reduce((a, c) => a + c.Qcoll, 0);
    const pompesInd = n === 1 || e.pompesPrim !== 'commune', tichelmann = n > 1 && e.tichelmann === 'oui';
    const Qcoll = Math.max(bouteille || echangeur ? Qs : Math.max(Qs, Qp), 0.01), tc = choisir(Qcoll, Math.min(vmax, 1.0));
    // Échangeur : puissance des besoins, surface indicative avec U ≈ 4 000 W/m²·K (eau / eau, plaques)
    const Aech = echangeur ? Pdem * 1000 / (4000 * pinc) : 0, Qech = echangeur ? debit(Pdem, dT) : 0;
    // Bouteille de découplage : vitesse verticale ≤ 0,2 m/s et diamètre ≥ 3 fois le plus gros piquage
    let tb = null, Db = 0;
    if (bouteille) {
      const Qmax = Math.max(Qp, Qs) / 3600, Dv = Math.sqrt(4 * Qmax / (Math.PI * 0.2)) * 1000, d3 = 3 * Math.max(tc.dn, tg.dn);
      Db = Math.max(Dv, d3); tb = decouplage === 'ballon' ? null : C.tubes('acier-10216').find(t => t.di >= Db) || null;
    }
    // Boucle de production : générateur(s) côté eau, liaisons (5 kPa) et découplage (bouteille, échangeur côté primaire) ;
    // valeurs saisies ou reprises des fiches, sinon forfaits (vide = forfait)
    const dpEchP = dpOuForfait(e.dpEchPrim, DP_ECH), dpEchS = dpOuForfait(e.dpEchSec, DP_ECH), dpBout = dpOuForfait(e.dpBouteille, DP_BOUTEILLE);
    const ssProd = !multi && /^echangeur/.test(gk);
    const dpGenU = multi ? null : dpOuForfait(num(e.dpGen) > 0 || !ssProd ? e.dpGen : e.dpEchSec, DP_GEN(gk), ficheGen(e));
    const gensDp = multi ? multi.map(x => ({ rep: x.rep, dp: { v: x.dpEau, src: x.dpSrc } })) : [{ rep: ssProd ? 'Échangeur (côté secondaire)' : 'Générateur', dp: dpGenU }];
    // Sous-station avec échangeur de découplage en plus : forfait conservé (même échangeur, valeur historique)
    const dec = echangeur ? (ssProd ? { v: DP_ECH, src: 'forfait' } : dpEchP) : bouteille ? dpBout : null;
    const decLib = echangeur ? 'échangeur côté primaire' : decouplage === 'ballon' ? 'ballon de découplage' : 'bouteille';
    const dpGenMax = Math.max(...gensDp.map(x => x.dp.v)), dpProd = dpGenMax + 5 + (dec ? dec.v : 0);
    const prod = { gens: gensDp, dpGen: dpGenMax, dec, decLib, dpDec: dec ? dec.v : 0, dp: dpProd, hmt: dpProd * 1000 / (f.rho * C.G),
      postes: [...gensDp.map(x => [`${x.rep} côté eau`, x.dp.v, x.dp.src]), ['Liaisons, robinetterie de production', 5, 'forfait'], ...(dec ? [[decLib[0].toUpperCase() + decLib.slice(1), dec.v, dec.src]] : [])] };
    // Contrôles
    if (!multi && gen[1] !== 'mixte' && gen[1] !== (chaud ? 'chaud' : 'froid')) alertes.push(alerte('erreur', `${gen[0]} incompatible avec un réseau d'${chaud ? 'eau chaude' : 'eau glacée'}.`));
    if (!circuits.length) alertes.push(alerte('erreur', 'Ajouter au moins un circuit de distribution.'));
    if (Pprod < Pdem * 0.999) alertes.push(alerte('erreur', `Production insuffisante : ${nf(Pprod, 0)} kW installés pour ${nf(Pdem, 0)} kW appelés.`));
    else if (Pdem > 0 && Pprod > 1.5 * Pdem) alertes.push(alerte('attention', `Production surdimensionnée (${nf(Pprod / Pdem * 100, 0)} % des besoins) : risque de cycles courts.`));
    if (multi) controlesGenerateurs(multi, { chaud, Td, Pprod, Pdem, Pg, plusGros, alertes });
    else if (n > 1 && Pdem > 0 && Pprod - Pg < Pdem * 0.6) alertes.push(alerte('attention', `Secours : un générateur à l'arrêt, il reste ${nf(Pprod - Pg, 0)} kW (${nf((Pprod - Pg) / Pdem * 100, 0)} % des besoins).`));
    if (decouplage === 'bouteille3') alertes.push(alerte('attention', `Bouteille 3 piquages : départs primaire et secondaire en partie haute, retour commun en partie basse ; à réserver à des débits primaire (${nf(Qp, 2)} m³/h) et secondaire (${nf(Qs, 2)} m³/h) proches, sinon préférer une bouteille 4 piquages.`));
    if (decouplage === 'ballon') alertes.push(alerte('ok', `Ballon tampon de découplage (4 piquages) : volume d'eau anti-courts-cycles et découplage ; diamètre intérieur mini ${nf(Db, 0)} mm (vitesse ≤ 0,2 m/s), piquages départ en haut, retours en bas.`));
    if (bouteille && Qp < Qs) alertes.push(alerte('attention', `Débit primaire (${nf(Qp, 2)} m³/h) inférieur au débit secondaire (${nf(Qs, 2)} m³/h) : le retour se recycle dans la bouteille et ${chaud ? 'abaisse' : 'relève'} la température de départ.`));
    if (bouteille && Qp > 1.25 * Qs && /condensation|pac/i.test(gen[0] + gk)) alertes.push(alerte('attention', 'Débit primaire nettement supérieur au secondaire : le départ se recycle vers le retour et dégrade la condensation ou le COP ; pompes primaires à vitesse variable conseillées.'));
    if (echangeur) alertes.push(alerte('attention', `Échangeur à plaques : deux circuits hydrauliques séparés, chacun avec vase d'expansion, soupape et remplissage ; secondaire au régime ${Tsd}/${Tsr} °C.`));
    if (n > 1 && !pompesInd && !tichelmann) alertes.push(alerte('attention', 'Cascade à pompe commune raccordée en direct : les générateurs les plus proches reçoivent plus de débit ; raccordement en Tichelmann ou vannes d\'équilibrage par générateur conseillés.'));
    if (e.bouteille === 'non' && n > 1) alertes.push(alerte('attention', 'Cascade sans bouteille de découplage : pompes primaires et secondaires en série interagissent ; à réserver à des générateurs acceptant un débit variable, avec vannes d\'isolement motorisées.'));
    if (e.bouteille === 'non' && circuits.some(c => c.reg === '2v')) alertes.push(alerte('attention', 'Circuits à vanne 2 voies sans bouteille : prévoir une soupape différentielle ou un by-pass pour garantir le débit minimal des générateurs.'));
    if ((!chaud || (multi ? multi.some(x => /pac/.test(x.type)) : /pac/.test(e.generateur))) && !['oui', 'depart'].includes(e.tampon) && decouplage !== 'ballon' && !(e.ballons || []).some(b => b && ['tampon', 'decouplage'].includes(b.fonction || 'tampon') && (!b.position || b.position === 'production'))) alertes.push(alerte('attention', 'Vérifier le volume d\'eau minimal exigé par le constructeur (anti-courts-cycles) : ballon tampon si le réseau est trop court.'));
    if (bouteille && chaud === false && Qp < Qs) alertes.push(alerte('attention', 'En eau glacée, un débit secondaire supérieur au primaire réchauffe le départ : prévoir des pompes secondaires à vitesse variable.'));
    // Pompes primaires : déportées (à notre charge, câblées et pilotées) ou intégrées au groupe (kit hydraulique du fabricant)
    if (multi) multi.forEach(x => { x.pp = x.pp && pompesInd && (!!bouteille || !!echangeur || n > 1); });
    const ppIntegree = multi ? multi.every(x => x.pompe === 'integree') : e.pompeGen === 'integree', ppDeportees = multi ? multi.some(x => x.pp) : pompesInd && !ppIntegree && (!!bouteille || !!echangeur || n > 1);
    const d = { prod, dpEchP, dpEchS, dpBout, multi, gk, ppIntegree, ppDeportees, Td, Tr, Tsd, Tsr, chaud, dT, f, s, n, Pg, Pprod, Pdem, gen, Qg, tg, Qp, Qs, bouteille, decouplage, echangeur, pinc, Aech, Qech, pompesInd, tichelmann, Qcoll, tc, tb, Db, circuits, alertes, regime: e.reseau === 'perso' ? `Régime ${Td}/${Tr} °C` : r[0] };
    // PAC ou groupe eau/eau sur nappe : forage de pompage, échangeur de barrage (protège l'évaporateur de l'eau de nappe),
    // boucle intermédiaire côté générateur, puits de rejet
    if (/-eau$/.test(gk) && e.sourceEau !== 'boucle' && !(gk === 'gf-eau' && EVACUATIONS[e.evacuation])) {
      const cop = Math.max(1.5, num(e.copForage, 4.5)), dTf = Math.max(1, num(e.dTforage, 4));
      const Psource = Pprod * (chaud ? 1 - 1 / cop : 1 + 1 / cop), Qn = Psource / (1.163 * dTf), Qi = Psource / (1.163 * Math.max(1, dTf - num(e.pincBarrage, 2) / 2 + 1));
      const tN = C.tubes(e.serie || 'acier-10216'), tf = tN.find(t => { const r = C.ecoulement(Qn / 3600, t.di / 1000, f.rho, f.mu, s.rugosite); return r.v <= 1.5 && r.R <= 200; }) || tN[tN.length - 1];
      const rf = C.ecoulement(Qn / 3600, tf.di / 1000, f.rho, f.mu, s.rugosite), dpL = rf.R * num(e.Lforage, 80) * 1.3 / 1000;
      const H = num(e.nivDyn, 15) + (num(e.dpBarrage, 30) + dpL + 50) / 9.81, Pel = Qn / 3600 * 1000 * 9.81 * H / 0.5 / 1000;
      const A = Psource * 1000 / (3500 * Math.max(0.5, num(e.pincBarrage, 2)));
      d.forage = { Psource, Qn, Qi, H, Pel, A, tube: tf, dTf, cop };
      alertes.push(alerte('ok', `Nappe : ${nf(Qn, 1)} m³/h pompés (${nf(Psource, 0)} kW ${chaud ? 'prélevés' : 'rejetés'}, ΔT ${nf(dTf, 0)} K) ; pompe de forage ≈ ${nf(H, 1)} mCE, ${nf(Pel, 2)} kW ; échangeur de barrage ≈ ${nf(A, 1)} m².`));
      alertes.push(alerte('attention', 'Forage : déclaration ou autorisation au titre du code de l\'environnement (prélèvement et rejet en nappe), essai de pompage et analyse d\'eau (fer, manganèse, colmatage) avant de fixer le débit et le matériau de l\'échangeur (inox 316 ou titane).'));
    }
    // Évacuation de la chaleur (aéroréfrigérant ou tour) : condenseur d'un groupe froid eau/eau ou boucle d'eau tempérée
    const ev = evacuation(e, d);
    if (ev) d.evac = ev;
    // Ballon tampon : volume d'eau minimal exigé (L/kW de production) diminué du volume de l'installation
    // (en série sur le retour ou sur le départ, ou ballon de découplage à la place de la bouteille)
    const posT = d.decouplage === 'ballon' ? 'decouplage' : e.tampon === 'depart' ? 'depart' : e.tampon === 'oui' ? 'retour' : '';
    if (posT) {
      const Vmin = num(e.ratioTampon, 10) * Pprod, Vres = volumeEau(d, gk).total, Vreq = Math.max(0, Vmin - Vres);
      // Ballon de découplage : au moins le volume d'une bouteille (le plus petit ballon commercial sinon)
      const choisi = num(e.Vtampon) > 0 ? num(e.Vtampon) : Vreq <= 0 ? (posT === 'decouplage' ? TAMPONS[1] : 0) : TAMPONS.find(v => v >= Vreq) || Math.ceil(Vreq / 500) * 500;
      d.tampon = { Vmin, Vres, Vreq, V: choisi, position: posT };
      if (num(e.Vtampon) > 0 && num(e.Vtampon) < Vreq) alertes.push(alerte('attention', `Ballon tampon de ${nf(num(e.Vtampon), 0)} L inférieur au volume nécessaire (${nf(Vreq, 0)} L).`));
    }
    // Ballons saisis comme éléments (tampon, stockage, ECS, découplage), à la production ou sur un circuit
    const bal = ballons(e, d);
    if (bal) d.ballons = bal;
    return d;
  }
  // Contrôles d'une production hétérogène : compatibilité chaud / froid, puissance avec le plus gros à l'arrêt, rôles
  function controlesGenerateurs(multi, { chaud, Td, Pprod, Pdem, Pg, plusGros, alertes }) {
    const usage = chaud ? 'chaud' : 'froid', reseau = chaud ? 'eau chaude' : 'eau glacée';
    multi.forEach(x => {
      if (x.gen[1] === 'mixte' || x.gen[1] === usage) return;
      if (chaud && x.role === 'recuperation') alertes.push(alerte('ok', `${x.rep} : ${x.gen[0].toLowerCase()} en récupération de chaleur (condenseur) sur le réseau d'eau chaude : disponible seulement quand il produit du froid.`));
      else alertes.push(alerte('erreur', `${x.rep} : ${x.gen[0].toLowerCase()} incompatible avec un réseau d'${reseau}${chaud ? ' (choisir le rôle « récupération » pour une récupération de chaleur au condenseur)' : ''}.`));
    });
    multi.forEach(x => {
      if (!x.regime) return;
      if (chaud ? x.regime[0] < Td - 0.5 : x.regime[0] > Td + 0.5) alertes.push(alerte('attention', `${x.rep} : départ du générateur ${x.regime[0]} °C ${chaud ? 'inférieur' : 'supérieur'} au départ du réseau (${Td} °C) : il ne peut assurer seul la consigne (préchauffage en série sur le retour ou circuits basse température).`));
    });
    if (multi.length > 1 && Pdem > 0) {
      const Ptot = multi.reduce((a, x) => a + x.P, 0), reste = Ptot - Pg, sec = multi.some(x => x.role === 'secours');
      alertes.push(reste < Pdem * 0.999 ? alerte('attention', `Plus gros générateur (${plusGros.rep}, ${nf(Pg, 0)} kW) à l'arrêt : il reste ${nf(reste, 0)} kW${sec ? ' secours compris' : ''} (${nf(reste / Pdem * 100, 0)} % des besoins).`)
        : alerte('ok', `Plus gros générateur (${plusGros.rep}) à l'arrêt : ${nf(reste, 0)} kW${sec ? ' secours compris' : ''}, besoins couverts à 100 %.`));
    }
    const Prec = multi.filter(x => x.role === 'recuperation').reduce((a, x) => a + x.P, 0);
    if (Prec > 0 && Pprod - Prec < Pdem * 0.999) alertes.push(alerte('attention', `Sans la récupération (${nf(Prec, 0)} kW, disponible seulement quand le froid tourne), il reste ${nf(Pprod - Prec, 0)} kW pour ${nf(Pdem, 0)} kW de besoins : base et appoint à dimensionner sur 100 % des besoins.`));
    if (!multi.some(x => x.role === 'base') && multi.some(x => ['releve', 'appoint'].includes(x.role))) alertes.push(alerte('attention', 'Relève ou appoint sans générateur de base : préciser le générateur prioritaire.'));
    if (multi.every(x => x.role === 'secours')) alertes.push(alerte('erreur', 'Tous les générateurs sont en secours : aucune production en fonctionnement normal.'));
  }
  // Ballons comme éléments du schéma : volume calculé si vide (tampon : ratio L/kW × puissance ; stockage : durée de
  // stockage × puissance / (ρ · cp · ΔT) ; ECS : ratio L/kW ; découplage : comme un tampon, au moins un ballon commercial)
  function ballons(e, d) {
    const l = (e.ballons || []).filter(b => b && (b.fonction || b.rep || num(b.V) > 0));
    if (!l.length) return null;
    return l.map((b, i) => {
      const fct = BALLONS[b.fonction] ? b.fonction : 'tampon', B = BALLONS[fct], rep = String(b.rep || '').trim() || `BAL${i + 1}`;
      const pos = String(b.position || 'production'), cRep = /^circuit:/.test(pos) ? pos.slice(8) : '', c = cRep ? d.circuits.find(x => x.rep === cRep) : null;
      if (cRep && !c) d.alertes.push(alerte('attention', `${rep} : circuit « ${cRep} » introuvable, ballon rattaché à la production.`));
      const Pref = c ? c.P : d.Pprod, dTref = c ? Math.abs(c.rc[0] - c.rc[1]) || d.dT : d.dT;
      const ratio = num(b.ratio) > 0 ? num(b.ratio) : fct === 'tampon' || fct === 'decouplage' ? num(e.ratioTampon, B[1]) : B[1];
      let Vcalc = 0;
      if (fct === 'stockage') Vcalc = num(b.duree) > 0 ? Pref * num(b.duree) * 3600 / (4.186 * Math.max(1, dTref)) : 0;
      else Vcalc = ratio * Pref;
      const saisi = num(b.V) > 0, comm = Vcalc <= 0 ? 0 : TAMPONS.find(v => v >= Vcalc) || Math.ceil(Vcalc / 500) * 500;
      const V = saisi ? num(b.V) : fct === 'decouplage' ? Math.max(TAMPONS[1], comm) : comm;
      const piquages = ['2', '4'].includes(String(b.piquages)) ? String(b.piquages) : B[2];
      const sondes = String(b.sondes === undefined || b.sondes === '' ? B[3] : b.sondes).split(/[,;\s]+/).filter(x => SONDES[x]);
      if (fct === 'stockage' && !saisi && !(num(b.duree) > 0)) d.alertes.push(alerte('attention', `${rep} : ballon de stockage — saisir le volume ou la durée de stockage (h).`));
      if (saisi && Vcalc > 0 && V < Vcalc * 0.95) d.alertes.push(alerte('attention', `${rep} : ${nf(V, 0)} L saisis pour ${nf(Vcalc, 0)} L calculés (${B[0].toLowerCase()}).`));
      if (fct === 'decouplage' && piquages !== '4') d.alertes.push(alerte('attention', `${rep} : un ballon de découplage demande 4 piquages (départs en haut, retours en bas).`));
      if (fct === 'decouplage' && !c && (d.bouteille || d.echangeur)) d.alertes.push(alerte('attention', `${rep} : ballon de découplage en plus ${d.echangeur ? 'de l\'échangeur' : 'de la bouteille'} de la production : double découplage, à justifier.`));
      if (fct === 'ecs' && !d.chaud) d.alertes.push(alerte('erreur', `${rep} : ballon d'ECS sur un réseau d'eau glacée.`));
      if (fct === 'ecs' && !saisi) d.alertes.push(alerte('attention', `${rep} : volume d'ECS estimé (${nf(ratio, 0)} L/kW) : à reprendre du calcul de production d'ECS.`));
      if (!sondes.length) d.alertes.push(alerte('attention', `${rep} : aucune sonde de température sur le ballon.`));
      if (fct === 'stockage' && sondes.length < 3) d.alertes.push(alerte('attention', `${rep} : stockage d'énergie — 3 sondes (haut, milieu, bas) conseillées pour suivre la stratification et l'état de charge.`));
      // Diamètre mini pour une vitesse verticale ≤ 0,1 m/s (préserver la stratification)
      const Qb = c ? c.Q : d.Qp, Dmin = Math.sqrt(4 * Qb / 3600 / (Math.PI * 0.1)) * 1000;
      return { i, rep, fonction: fct, lib: B[0], V, Vcalc, saisi, ratio, position: c ? `circuit:${c.rep}` : 'production', circuit: c ? c.rep : '', piquages, sondes, Pref, Dmin };
    });
  }
  // Perte de charge usuelle d'un échangeur à plaques de circuit (chaque côté)
  const DP_ECH = 20;
  // Schéma alimenté par le circuit d'un autre schéma (imbrication) : sous-station (générateur « échangeur »), PAC ou
  // groupe eau/eau sur boucle d'eau tempérée (évaporateur ou condenseur sur la boucle), sinon raccordement direct
  // (boucle secondaire derrière une bouteille, un échangeur de découplage ou en direct)
  const sousStation = e => /^echangeur/.test((e && e.generateur) || '') || ((e && e.generateurs) || []).some(x => x && /^echangeur/.test(x.type || '') && num(x.P) > 0);
  const sourceBoucle = e => !sousStation(e) && /-eau$/.test((e && e.generateur) || '') && e.sourceEau === 'boucle';
  // Ce que voit le circuit amont : puissance appelée (simultanéité comprise ; boucle d'eau tempérée : chaleur prélevée
  // ou rejetée à l'évaporateur ou au condenseur), pertes de charge côté primaire (échangeur et vanne primaire de la
  // sous-station, évaporateur, bouteille ou collecteur aval) et montage
  const DP_VANNE_PRIM = 20, DP_SOURCE = 30;
  // Vanne de régulation primaire d'une sous-station : Kvs saisi → ΔP au débit primaire (régime primaire), sinon forfait
  function vannePrimaire(e, d, P) {
    const kvs = num(e.kvsVannePrim);
    if (!(kvs > 0)) return { v: DP_VANNE_PRIM, src: 'forfait', Q: null, kvs: null };
    const rg = regimeCircuit(e.regimePrim), dT = rg ? Math.abs(rg[0] - rg[1]) || d.dT : d.dT, Q = P / (1.163 * Math.max(1, dT));
    return { v: (Q / kvs) ** 2 * 100, src: 'saisie', Q, kvs };
  }
  function primaireAmont(e, d) {
    const ss = sousStation(e), src = sourceBoucle(e), cop = Math.max(1.5, num(e.copForage, 4.5));
    const montage = ss ? 'sousstation' : src ? 'source' : d.echangeur ? 'echangeur' : d.bouteille ? 'bouteille' : 'direct';
    let P = d.Pdem, Pf = d.co ? d.co.dF.Pdem : null;
    if (src) P = d.chaud ? P * (1 - 1 / cop) : P * (1 + 1 / cop);
    // Postes [libellé, kPa, origine] : « forfait » (valeur usuelle), « saisie » (ou fiche)
    const echP = d.dpEchP || dpOuForfait(e.dpEchPrim, DP_ECH), vp = ss ? vannePrimaire(e, d, P) : null, srcDp = dpOuForfait(e.dpSource, DP_SOURCE);
    const postes = { sousstation: () => [['Échangeur côté primaire', echP.v, echP.src], [vp.kvs ? `Vanne de régulation primaire Kvs ${nf(vp.kvs, 1)} (${nf(vp.Q, 2)} m³/h)` : 'Vanne de régulation primaire (autorité ≈ 0,5)', vp.v, vp.src], ['Robinetterie, comptage', 5, 'forfait']],
      source: () => [['Évaporateur / condenseur côté boucle', srcDp.v, srcDp.src], ['Robinetterie', 5, 'forfait']], echangeur: () => [['Échangeur de découplage côté primaire', echP.v, echP.src], ['Collecteur, robinetterie', 5, 'forfait']],
      bouteille: () => { const b = d.dpBout || dpOuForfait(e.dpBouteille, DP_BOUTEILLE); return [['Bouteille de découplage', b.v, b.src], ['Collecteur, robinetterie', 5, 'forfait']]; }, direct: () => [['Collecteurs, robinetterie', 5, 'forfait']] }[montage]();
    const lib = { sousstation: 'échangeur de sous-station', source: 'source de la PAC (boucle d\'eau tempérée)', echangeur: 'échangeur de découplage', bouteille: d.decouplage === 'ballon' ? 'ballon de découplage' : 'bouteille de découplage', direct: 'raccordement direct (sans découplage)' }[montage];
    return { montage, libelle: lib, P, Pf, dp: postes.reduce((a, [, v]) => a + v, 0), postes, decouple: montage !== 'direct', ...(vp ? { vanne: vp } : {}) };
  }
  /* ---------- Pertes de charge réelles : saisies, reprises des fiches, sinon forfaits ---------- */
  // Perte de charge usuelle d'un générateur côté eau (kPa) : ordre de grandeur, la fiche technique fait foi
  const DP_GEN = t => (/^chaudiere/.test(t || '') ? 10 : /^(pac|gf)/.test(t || '') ? 40 : /^echangeur/.test(t || '') ? DP_ECH : 15);
  const DP_BOUTEILLE = 1;
  // { v (kPa), src : « saisie », « fiche » ou « forfait » } : valeur saisie > 0, sinon forfait (champ vide)
  const dpOuForfait = (x, forfait, fiche = false) => (num(x) > 0 ? { v: num(x), src: fiche ? 'fiche' : 'saisie' } : { v: forfait, src: 'forfait' });
  const dpTxt = o => `${nf(o.v, 1)} kPa (${o.src})`;
  // ΔP du générateur unique reprise de la fiche du registre (valeur « dpEau » du modèle placé)
  const ficheGen = e => !!(e && e.eq && e.fiche && num(e.fiche.dpEau) > 0 && Math.abs(num(e.fiche.dpEau) - num(e.dpGen)) < 1e-6);
  // Échangeur de circuit : « 25 » (les deux côtés) ou « 25/18 » (primaire/secondaire), vide : forfait
  function dpEchCircuit(txt) {
    const p = String(txt ?? '').split('/').map(x => num(x)), a = p[0] > 0 ? p[0] : 0, b = p.length > 1 && p[1] > 0 ? p[1] : a;
    return { p: a || DP_ECH, s: b || DP_ECH, src: a || b ? 'saisie' : 'forfait' };
  }
  // Pompe retenue (courbe du fabricant, tableau « pompesFab ») d'un circuit ou d'une pompe de production (PP1, PP, PECH1…) :
  // point de fonctionnement sur sa courbe ; repli : clé commune (« PP » pour les pompes primaires)
  function pointPompe(e, cle, Q, hmt, repli = null) {
    const l = ((e && e.pompesFab) || []).map((p, k) => ({ p, k })).filter(({ p }) => p && String(p.courbe || '').trim()), cl = x => String(x.p.circuit || '').trim();
    const x = l.find(y => cl(y) === String(cle).trim()) || (repli ? l.find(y => cl(y) === repli) : null);
    if (!x) return null;
    const PO = typeof Pompes !== 'undefined' ? Pompes : require('./pompes'), pf = PO.point(x.p.courbe, Q, hmt);
    if (!pf) return null;
    pf.ref = x.p.ref || ''; pf.k = x.k; pf.fiche = x.p.fiche || null;
    return pf;
  }
  const ETATS_POMPE = { ok: 'OK', sur: 'surdimensionnée', ko: 'insuffisante', choisir: 'à choisir' };
  const etatPompe = pf => (!pf ? 'choisir' : !pf.ok ? 'ko' : pf.ecart > 25 ? 'sur' : 'ok');
  // Récupération d'énergie sur le groupe froid : chaleur rejetée = froid produit × (1 + 1 / EER), part récupérée selon le montage
  function recuperation(e, d) {
    const froidGen = (GENERATEURS[e.generateur] || [])[1] !== 'chaud' && /^(gf|pac-rev)/.test(e.generateur || ''), Pfr = d.co ? d.co.dF.Pdem : d.chaud ? 0 : d.Pdem;
    const P = froidGen && e.recupGf && Pfr > 0 ? Math.round(Pfr * (1 + 1 / Math.max(1.5, num(e.eerRecup, 3.5))) * (e.recupGf === 'totale' ? 1 : 0.15) * 10) / 10 : 0;
    if (!P) return null;
    const rg = regimeCircuit(e.regimeRecup || '45/40') || [45, 40], dTr = Math.max(2, Math.abs(rg[0] - rg[1])), dpc = { v: DP_GEN(e.generateur), src: 'forfait' };
    return { P, Pfr, Q: P / (1.163 * dTr), dTr, dpc, dp: dpc.v + 5 };
  }
  /* ---------- Évacuation de la chaleur : aéroréfrigérant (dry-cooler) ou tour de refroidissement ---------- */
  const EVACUATIONS = { aero: 'Aéroréfrigérant (dry-cooler)', tour: 'Tour de refroidissement' };
  // Condenseur d'un groupe froid eau/eau (hors boucle d'eau), sinon boucle d'eau tempérée (régime saisi, réseau « perso »)
  function modeEvacuation(e) {
    const types = [e.generateur || '', ...((e.generateurs || []).filter(x => x && num(x.P) > 0).map(x => x.type))];
    if (types.includes('gf-eau') && e.sourceEau !== 'boucle') return 'condenseur';
    if (!types.some(t => /-eau$/.test(t)) && !sousStation(e) && e.reseau === 'perso') return 'boucle';
    return '';
  }
  // Ventilateurs : puissance électrique ≈ 2,5 % de la puissance évacuée (ordre de grandeur 2 à 3 % pour un aéroréfrigérant
  // à ventilateurs EC, 1,5 à 2,5 % pour une tour) ; un ventilateur pour ≈ 50 kW évacués (aéro) ou 150 kW (tour)
  const RATIO_VENT = 0.025;
  function evacuation(e, d) {
    const type = EVACUATIONS[e.evacuation] ? e.evacuation : '', mode = type ? modeEvacuation(e) : '';
    if (!mode) return null;
    const aero = type === 'aero', al = d.alertes;
    let Pfroid = 0, eer = null, Pcalc;
    if (mode === 'condenseur') {
      Pfroid = d.multi ? d.multi.filter(x => x.type === 'gf-eau' && x.role !== 'secours').reduce((a, x) => a + x.P, 0) : d.Pprod;
      eer = num(e.eerEvac) > 0 ? num(e.eerEvac) : Math.max(1.5, num(e.copForage, 4.5));
      Pcalc = Pfroid * (1 + 1 / eer);
    } else Pcalc = d.Pdem;
    const saisi = num(e.Pevac) > 0, P = saisi ? num(e.Pevac) : Pcalc;
    const rg = regimeCircuit(e.regimeEvac) || (mode === 'condenseur' ? (aero ? [45, 40] : [35, 30]) : [d.Td + 5, d.Td]);
    const Tc = Math.max(rg[0], rg[1]), Tf = Math.min(rg[0], rg[1]), dT = Math.max(1, Tc - Tf), Text = num(e.TextEvac, aero ? 35 : 24), approche = Tf - Text;
    const fluide = e.fluideEvac || (aero ? 'mpg30' : 'eau');
    let fl; try { fl = C.liquide(fluide, (Tc + Tf) / 2); } catch (er) { fl = C.liquide('eau', (Tc + Tf) / 2); }
    const Q = P > 0 ? P * 1000 / (fl.rho * fl.cp * dT) * 3600 : 0, tubes = C.tubes(e.serie || 'acier-10216');
    const t = tubes.find(x => { const r = C.ecoulement(Q / 3600, x.di / 1000, fl.rho, fl.mu, d.s.rugosite); return r.v <= 1.5 && r.R <= 150; }) || tubes[tubes.length - 1];
    const L = num(e.Levac, 40), dpL = Q > 0 ? C.ecoulement(Q / 3600, t.di / 1000, fl.rho, fl.mu, d.s.rugosite).R * L * 1.3 / 1000 : 0;
    const dpE = dpOuForfait(e.dpEvac, aero ? 50 : 40), cond = dpOuForfait(e.dpSource, DP_SOURCE);
    // Échangeur intermédiaire : tour ouverte (protection du condenseur) ou fluide différent de celui de la boucle
    const ech = !aero || (mode === 'boucle' && fluide !== (e.fluide || 'eau'));
    const postes = [[aero ? 'Aéroréfrigérant côté eau' : 'Tour (circuit d\'eau)', dpE.v, dpE.src], [`Liaisons (${nf(L, 0)} m aller + retour, ${t.nom.replace(/ \(.*/, '')})`, dpL, 'calcul'],
      ech ? ['Échangeur intermédiaire', DP_ECH, 'forfait'] : mode === 'condenseur' ? ['Condenseur du groupe froid', cond.v, cond.src] : ['Raccordement sur la boucle (collecteur)', 5, 'forfait'],
      ['Vanne 3 voies de by-pass hivernal (autorité ≈ 0,5)', 10, 'forfait'], ['Robinetterie', 5, 'forfait']];
    const dp = postes.reduce((a, [, v]) => a + v, 0), hmt = dp * 1000 / (fl.rho * C.G);
    const PventSaisi = num(e.PventEvac) > 0, Pvent = PventSaisi ? num(e.PventEvac) : P * RATIO_VENT, nVent = Math.max(1, Math.ceil(P / (aero ? 50 : 150)));
    const Ppompe = Math.max(0.05, Math.round(Q * Math.max(2, hmt) / 367 / 0.45 * 100) / 100);
    const lib = EVACUATIONS[type];
    al.push(alerte('ok', `${lib} : ${nf(P, 0)} kW à évacuer (${saisi ? 'saisis' : mode === 'condenseur' ? `froid ${nf(Pfroid, 0)} kW × (1 + 1 / EER ${nf(eer, 1)})` : 'excédent de la boucle estimé à la puissance des circuits'}), eau ${Tc}/${Tf} °C (ΔT ${nf(dT, 0)} K), ${fl.libelle.toLowerCase()} ${nf(Q, 2)} m³/h ; ventilateurs ≈ ${nf(Pvent, 1)} kW${PventSaisi ? '' : ' (2,5 % de la puissance évacuée)'} ; pompe PEV ${nf(Q, 2)} m³/h × ${nf(hmt, 2)} mCE.`));
    if (approche <= 0) al.push(alerte('erreur', `${lib} : eau refroidie à ${Tf} °C impossible avec ${Text} °C ${aero ? 'd\'air sec' : 'de bulbe humide'} — relever le régime (${aero ? 'aéroréfrigérant adiabatique, tour' : 'tour plus grande'} ou condensation plus chaude).`));
    else if (approche < (aero ? 5 : 3)) al.push(alerte('attention', `${lib} : approche de ${nf(approche, 1)} K (eau ${Tf} °C pour ${Text} °C ${aero ? 'd\'air' : 'de bulbe humide'}) inférieure à ${aero ? 5 : 3} K : appareil très grand ; ${aero ? 'pulvérisation adiabatique ou ' : ''}régime plus chaud conseillé.`));
    if (aero && !/glycol|meg|mpg/i.test(`${fluide} ${fl.libelle}`)) al.push(alerte('attention', `${lib} à l'extérieur en eau non glycolée : risque de gel l'hiver — eau glycolée (antigel), vidange automatique ou traçage.`));
    if (!aero) al.push(alerte('attention', `${lib} : circuit ouvert — traitement d'eau, prévention de la légionellose (ICPE rubrique 2921, analyses), échangeur intermédiaire pour protéger ${mode === 'condenseur' ? 'le condenseur' : 'la boucle'}, purge de déconcentration et appoint d'eau.`));
    if (mode === 'boucle' && !saisi) al.push(alerte('attention', `${lib} : excédent de la boucle en été estimé à ${nf(Pcalc, 0)} kW (puissance des circuits) ; saisir la puissance à évacuer (chaleur rejetée par les PAC en froid moins la chaleur reprise).`));
    return { type, lib, mode, P, Pcalc, saisi, Pfroid, eer, Tc, Tf, dT, Text, approche, fluide, fluideLib: fl.libelle, Q, t, L, dpL, dpE, postes, dp, hmt, Pvent, PventSaisi, nVent, Ppompe, ech };
  }
  /* ---------- Pompes de production, d'échangeur, de récupération et de refroidissement ---------- */
  // [{ cle (repère de la pompe dans « pompesFab »), lib, Q (m³/h), dp (kPa), hmt (mCE), detail, pf, etat }]
  function pompesProduction(e, d) {
    const out = [], rho = d.f.rho, P = d.prod || { dp: 0, dpDec: 0, gens: [] }, h = dp => dp * 1000 / (rho * C.G);
    const ajout = (cle, lib, Q, dp, detail, repli = null, hImpose = null) => { const hmt = hImpose ?? h(dp), pf = Q > 0 ? pointPompe(e, cle, Q, hmt, repli) : null; out.push({ cle, lib, Q, dp, hmt, detail, pf, etat: etatPompe(pf) }); };
    const dec = P.dec ? ` + ${P.decLib} ${dpTxt(P.dec)}` : '';
    if (d.multi) {
      d.multi.forEach((x, i) => { if (x.pp) ajout(`PP${i + 1}`, `Pompe primaire de ${x.rep}`, x.Q, x.dpEau + 5 + P.dpDec, `${x.rep} ${dpTxt({ v: x.dpEau, src: x.dpSrc })} + liaisons 5 kPa${dec}`, 'PP'); });
      if (!d.pompesInd && d.multi.length > 1 && (d.bouteille || d.echangeur)) ajout('PP', 'Pompe primaire commune', d.Qp, P.dp, `générateur le plus résistant ${nf(P.dpGen, 1)} kPa + liaisons 5 kPa${dec}`);
    } else if (!/^echangeur/.test(d.gk || '')) {
      const g0 = (P.gens[0] || {}).dp || { v: P.dpGen, src: 'forfait' };
      if (d.ppDeportees) ajout('PP', d.n > 1 ? `Pompes primaires des générateurs (${d.n} identiques)` : 'Pompe primaire du générateur', d.Qg, P.dp, `générateur ${dpTxt(g0)} + liaisons 5 kPa${dec}`);
      else if (!d.pompesInd && d.n > 1 && (d.bouteille || d.echangeur)) ajout('PP', 'Pompe primaire commune', d.Qp, P.dp, `générateur ${dpTxt(g0)} + liaisons 5 kPa${dec}`);
    }
    if (e.bouteille === 'echangeur' || /^echangeur/.test(e.generateur || '')) {
      const Qprim = d.echangeur ? (d.Qech || d.Qp) : d.Qp;
      if (e.pompeEchPrim === 'ajouter') {
        const pa = sousStation(e) ? primaireAmont(e, d) : null, echP = d.dpEchP || dpOuForfait(e.dpEchPrim, DP_ECH);
        ajout('PECH1', 'Pompe primaire de l\'échangeur', Qprim, pa ? pa.dp : echP.v + 5, pa ? pa.postes.map(([l, v, s]) => `${l} ${nf(v, 1)} kPa (${s})`).join(' + ') : `échangeur côté primaire ${dpTxt(echP)} + liaisons 5 kPa`);
      }
      if (e.pompeEchSec === 'ajouter') { const echS = d.dpEchS || dpOuForfait(e.dpEchSec, DP_ECH); ajout('PECH2', 'Pompe secondaire de l\'échangeur', d.Qs, echS.v + 5, `échangeur côté secondaire ${dpTxt(echS)} + collecteurs 5 kPa`); }
    }
    const rec = e.recupGf ? recuperation(e, d) : null;
    if (rec && e.pompeRecup !== 'integree') ajout('PREC', 'Pompe du circuit de récupération', rec.Q, rec.dp, `${e.recupGf === 'totale' ? 'condenseur' : 'désurchauffeur'} ${dpTxt(rec.dpc)} + liaisons 5 kPa`);
    if (d.evac) ajout('PEV', `Pompe du circuit de refroidissement (${d.evac.lib.toLowerCase()})`, d.evac.Q, d.evac.dp, d.evac.postes.map(([l, v, s]) => `${l.replace(/ \(.*/, '')} ${nf(v, 1)} kPa (${s})`).join(' + '), null, d.evac.hmt);
    return out;
  }
  // Clés des pompes de production proposées dans le tableau des pompes retenues
  const clesPompesProduction = e => { try { return pompesProduction(e, dimensionner(e)).map(p => [p.cle, `${p.cle} — ${p.lib}`]); } catch (er) { return []; } };
  /* ---------- Redimensionnement des vannes : autorité ≥ 0,5 ---------- */
  // Pour chaque vanne de circuit d'autorité insuffisante : ΔP cible (autorité visée), Kv cible, Kvs normalisé retenu
  // (immédiatement inférieur : la vanne est plus résistante), vanne du catalogue la plus proche ; rien n'est modifié
  function redimensionnerVannes(e, cible = 0.5) {
    const d = dimensionner(e), Cat = typeof Catalogue !== 'undefined' ? Catalogue : require('./catalogue'), out = [];
    d.circuits.forEach((c, i) => {
      if (!c.M.vanne || c.autorite === null || c.autorite === undefined || c.autorite >= cible - 1e-6 || !(c.Qv > 0)) return;
      const rho = d.f.rho, dpCible = Math.max(c.dpVar * cible / (1 - cible), 1), kvCible = C.kv(c.Qv, dpCible, rho);
      const kvs = [...D.KVS].reverse().find(k => k <= kvCible * 1.0001) || D.KVS[0];
      const dpApres = (c.Qv / kvs) ** 2 * 100 * rho / 1000, aApres = dpApres / (dpApres + c.dpVar);
      const v = (Cat.vannes || []).filter(x => x.type === c.M.vanne && x.Kvs <= kvs * 1.03).sort((a, b) => b.Kvs - a.Kvs || a.dn - b.dn)[0] || Cat.vannePour(kvs, c.M.vanne);
      out.push({ i, rep: c.rep, reg: c.reg, type: c.M.vanne, Qv: c.Qv, dpVar: c.dpVar, autoriteAvant: c.autorite, dpAvant: c.dpV, kvsAvant: c.kvs, dpCible, kvCible, kvs, dpApres, autoriteApres: aApres,
        vanne: v ? N.libVanne(v) : '', vanneKvs: v ? v.Kvs : null });
    });
    return out;
  }
  // Applique les Kvs retenus aux circuits (colonne « Kvs retenu ») ; renvoie le nombre de vannes modifiées
  function appliquerVannes(e, mods) {
    let k = 0;
    (mods || []).forEach(m => { const c = (e.circuits || [])[m.i]; if (c && String(c.rep || `C${m.i + 1}`).trim() === String(m.rep).trim()) { c.kvsVanne = m.kvs; k++; } });
    return k;
  }
  const TAMPONS = [100, 200, 300, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000];
  // Change-over 2 tubes : dimensionnement au régime chaud et au régime froid, diamètres retenus au débit le plus fort
  // Perte de charge d'un organe au débit Q (m³/h) : ΔP de la fiche, sinon (Q / Kv)², sinon ζ × pression dynamique ;
  // une vanne d'équilibrage garde au moins 3 kPa à son réglage pour mesurer le débit
  function organe(r, i, Q, t, rho) {
    const R = ROBINETTERIE[r.type] || ROBINETTERIE.autre, q = Math.max(1, Math.round(num(r.qte, R[2]))), kv = num(r.kv), dpS = num(r.dp);
    const di = num(r.dn) > 0 ? num(r.dn) : t.di, v = Q / 3600 / (Math.PI * (di / 1000) ** 2 / 4), pd = rho * v * v / 2;
    const brut = dpS > 0 ? dpS : kv > 0 ? (Q / kv) ** 2 * 100 * (rho / 1000) : R[1] * pd / 1000, mini = r.type === 'equilibrage' && !(dpS > 0) && brut < 3;
    const dpU = mini ? 3 : brut;
    return { i, rep: r.rep || `${R[0].split(' ')[0]} ${i + 1}`, type: r.type, lib: R[0], dn: num(r.dn) > 0 ? num(r.dn) : t.dn, qte: q, kv, tours: num(r.tours), abaque: lireAbaque(r.abaque), dpU, dpTot: dpU * q,
      source: mini ? 'réglage mini 3 kPa' : dpS > 0 ? 'ΔP fiche' : kv > 0 ? 'Kv fiche' : R[1] ? `ζ ${String(R[1]).replace('.', ',')}` : 'négligeable',
      ref: r.ref || '', fiche: r.fiche && (r.fiche.fabricant || r.fiche.reference) ? r.fiche : null, Q };
  }
  // Robinetterie d'un circuit (ou d'un tronçon : champ « circuit » ou « troncon » de la ligne)
  function robinetterie(e, rep, Q, t, f, champ = 'circuit') {
    return (e.robinetterie || []).map((r, i) => ({ r, i })).filter(({ r }) => r && r.type && String(r[champ] || '').trim() === String(rep).trim()).map(({ r, i }) => organe(r, i, Q, t, f.rho));
  }
  // Abaque d'une vanne d'équilibrage : « tours:Kv » séparés par des points-virgules (ex. « 0,5:0,4 ; 1:0,9 ; 2:2,1 »)
  function lireAbaque(txt) {
    return String(txt || '').split(/[;|\n]+/).map(p => p.trim().split(/\s*[:=→]\s*|\s+/).map(x => Number(String(x).replace(',', '.'))))
      .filter(p => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] >= 0).map(p => [p[0], p[1]]).sort((a, b) => a[0] - b[0]);
  }
  const ecrireAbaque = pts => pts.map(([t, k]) => `${String(t).replace('.', ',')}:${String(k).replace('.', ',')}`).join(' ; ');
  // Position (tours) donnant le Kv demandé, par interpolation linéaire entre les points de l'abaque
  function toursAbaque(pts, Kv) {
    if (!pts || pts.length < 2 || !(Kv > 0)) return null;
    if (Kv <= pts[0][1]) return { tours: pts[0][0], borne: Kv < pts[0][1] ? 'mini' : '' };
    for (let i = 1; i < pts.length; i++) { const [t0, k0] = pts[i - 1], [t1, k1] = pts[i]; if (Kv <= k1) return { tours: k1 === k0 ? t1 : t0 + (t1 - t0) * (Kv - k0) / (k1 - k0), borne: '' }; }
    return { tours: pts[pts.length - 1][0], borne: 'maxi' };
  }
  // Organes qui changent le calcul (pertes de charge) ; les autres ne servent qu'au DOE (repérage, fiche technique)
  const ORGANES_CALCUL = ['isolement', 'clapet', 'equilibrage', 'filtre', 'desemboueur', 'compteur', 'regulation', 'manchette', 'echangeur'];
  function dimensionner(e) {
    if (e.reseau !== 'co') return dimensionnerRegime(e);
    const base = { ...e, reseau: 'perso' };
    // Production détaillée : générateurs de chaque saison (chaud ou mixte l'hiver ; froid ou mixte l'été, à leur puissance
    // froid « Pf », vide = P) ; une saison sans générateur garde la liste entière (les contrôles le signalent)
    const ls = multiSaisi(e), saison = froid => {
      if (!ls.length) return e.generateurs;
      const l = (e.generateurs || []).filter(x => x && GENERATEURS[x.type] && GENERATEURS[x.type][1] !== (froid ? 'chaud' : 'froid')).map(x => (froid && num(x.Pf) > 0 ? { ...x, P: x.Pf } : x));
      return l.some(x => num(x.P) > 0) ? l : e.generateurs;
    };
    const dC = dimensionnerRegime({ ...base, Tdep: num(e.TdepC, 45), Tret: num(e.TretC, 40), generateurs: saison(false) });
    const dF = dimensionnerRegime({ ...base, Tdep: num(e.TdepF, 7), Tret: num(e.TretF, 12), Pgen: num(e.PgenF, num(e.Pgen)), generateurs: saison(true), circuits: (e.circuits || []).map(c => ({ ...c, P: c.Pf, regime: '' })) });
    const circuits = dC.circuits.map((cC, i) => { const cF = dF.circuits[i], g = cF.Q >= cC.Q ? cF : cC; return { ...g, P: cC.P, Pf: cF.P, Qc: cC.Q, Qf: cF.Q, rcC: cC.rc, rcF: cF.rc, hmt: Math.max(cC.hmt, cF.hmt), gouverne: g === cF ? 'froid' : 'chaud' }; });
    const prim = dF.Qp >= dC.Qp ? dF : dC, coll = dF.Qcoll >= dC.Qcoll ? dF : dC, bt = dF.Db >= dC.Db ? dF : dC, vus = new Set();
    const alertes = [...dC.alertes, ...dF.alertes].filter(a => !vus.has(a.texte) && vus.add(a.texte));
    const sansFroid = (e.circuits || []).filter(c => !(num(c.Pf) > 0)).map(c => c.rep);
    if (sansFroid.length) alertes.unshift(alerte('attention', `Change-over : puissance froid à renseigner pour ${sansFroid.join(', ')} (colonne « Puissance froid »).`));
    const us = t => (GENERATEURS[t] || [])[1], okCo = ls.length ? ls.some(x => us(x.type) === 'mixte') || (ls.some(x => us(x.type) === 'chaud') && ls.some(x => us(x.type) === 'froid')) : /pac-rev|echangeur/.test(e.generateur || '');
    if (!okCo) alertes.unshift(alerte('erreur', 'Change-over : choisir une PAC réversible ou un échangeur (réseaux de chaleur et de froid), ou des générateurs chauds et froids (colonne « Puissance froid »).'));
    return { ...prim, circuits, tc: coll.tc, Qcoll: coll.Qcoll, Qs: Math.max(dC.Qs, dF.Qs), tb: bt.tb, Db: bt.Db, tampon: dF.tampon || dC.tampon, alertes, co: { dC, dF },
      Pprod: dC.Pprod, Pdem: dC.Pdem, regime: `Change-over : chaud ${dC.Td}/${dC.Tr} °C, froid ${dF.Td}/${dF.Tr} °C` };
  }

  /* ---------- Volume d'eau de l'installation (pour le vase d'expansion) ---------- */
  // Contenance des émetteurs (L/kW) et des générateurs (L/kW) : ordres de grandeur, à remplacer par les données constructeur
  const CONTENANCE = { radiateurs: 10, plancher: 15, cta: 1, ventilo: 2, aerotherme: 1.5, radiant: 2, plafond: 3, ecs: 2, process: 2, sousstation: 2 };
  const CONTENANCE_GEN = g => (/^chaudiere-(fioul|bois)/.test(g) ? 1 : /^chaudiere/.test(g) ? 0.4 : /echangeur/.test(g) ? 0.1 : 0.3);
  function volumeEau(d, generateur) {
    const sec = di => Math.PI * (di / 1000) ** 2 / 4 * 1000; // L/m
    const tubes = d.circuits.reduce((a, c) => a + sec(c.t.di) * c.L, 0), emet = d.circuits.reduce((a, c) => a + (CONTENANCE[c.emetteur] || 2) * c.P, 0);
    const coll = sec(d.tc.di) * 2 * (d.circuits.length + 2), prod = d.multi ? d.multi.reduce((a, x) => a + x.P * CONTENANCE_GEN(x.type) + sec(x.t.di) * 6, 0) : d.n * d.Pg * CONTENANCE_GEN(generateur || '') + sec(d.tg.di) * d.n * 6;
    const bout = d.tb ? sec(d.tb.di) * 1.2 : 0;
    const postes = [['Tuyauteries des circuits', tubes], ['Émetteurs', emet], ['Collecteurs', coll], ['Générateurs et raccordements', prod], ...(bout ? [['Bouteille de découplage', bout]] : []), ...(d.tampon && d.tampon.V > 0 ? [['Ballon tampon', d.tampon.V]] : []), ...(d.ballons || []).filter(b => b.fonction !== 'ecs' && b.V > 0).map(b => [`Ballon ${b.rep}`, b.V])];
    return { total: postes.reduce((a, [, v]) => a + v, 0), postes };
  }

  /* ---------- Dessin ---------- */
  function dessiner(d, e) {
    const nG = d.n, nC = Math.max(d.circuits.length, 1), Y1 = 330, Y2 = 380, H0 = d.forage ? 1000 : 720, H = H0 + ((d.ballons || []).length ? 230 : 0);
    const decouple = d.bouteille || d.echangeur, extra = d.tampon && d.tampon.V > 0 && d.tampon.position !== 'decouplage' ? 90 : 0, G = d.co ? 'PAC' : d.chaud ? 'G' : 'GF';
    const xG0 = 150, pasG = 150, xB = xG0 + nG * pasG + 90 + extra, xS0 = decouple ? xB + 110 : xG0 + nG * pasG + 110 + extra, pasC = 175;
    const W = Math.max(xS0 + nC * pasC + 150, 900);
    const cD = d.co ? '#6a1b9a' : d.chaud ? '#c62828' : '#1565c0', cR = d.co ? '#00838f' : d.chaud ? '#1565c0' : '#2e7d32', out = [], masques = [], dessus = [];
    const ligne = (x1, y1, x2, y2, c, ep = 3) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${ep}" stroke-linecap="round"/>`;
    const texte = (x, y, t, o = {}) => `<text x="${x}" y="${y}" font-size="${o.fs || 11}" font-family="Arial, Helvetica, sans-serif" fill="${o.c || '#222'}" text-anchor="${o.a || 'start'}"${o.b ? ' font-weight="700"' : ''}${o.rot ? ` transform="rotate(${o.rot} ${x} ${y})"` : ''}>${xe(t)}</text>`;
    const point = (x, y, c) => `<circle cx="${x}" cy="${y}" r="4" fill="${c}"/>`;
    const croisement = (x, y) => masques.push(`<rect x="${x - 5}" y="${y - 4}" width="10" height="8" fill="#fff"/>`);
    // Symboles (sur une conduite verticale en x, centrés en y)
    const vanne = (x, y) => `<path d="M${x - 7} ${y - 8} L${x + 7} ${y - 8} L${x - 7} ${y + 8} L${x + 7} ${y + 8} Z" fill="#fff" stroke="#222" stroke-width="1.4"/>`;
    const vanneH = (x, y) => `<path d="M${x - 8} ${y - 7} L${x - 8} ${y + 7} L${x + 8} ${y - 7} L${x + 8} ${y + 7} Z" fill="#fff" stroke="#222" stroke-width="1.4"/>`;
    const equilibrage = (x, y) => `${vanne(x, y)}<line x1="${x - 11}" y1="${y + 10}" x2="${x + 11}" y2="${y - 10}" stroke="#222" stroke-width="1.2"/><path d="M${x + 11} ${y - 10} l-6 1 l3 4 Z" fill="#222"/>`;
    const pompe = (x, y, haut = true) => `<circle cx="${x}" cy="${y}" r="12" fill="#fff" stroke="#222" stroke-width="1.6"/><path d="${haut ? `M${x - 8} ${y + 6} L${x} ${y - 10} L${x + 8} ${y + 6}` : `M${x - 8} ${y - 6} L${x} ${y + 10} L${x + 8} ${y - 6}`}" fill="none" stroke="#222" stroke-width="1.4"/>`;
    const pompeH = (x, y) => `<circle cx="${x}" cy="${y}" r="12" fill="#fff" stroke="#222" stroke-width="1.6"/><path d="M${x - 6} ${y - 8} L${x + 10} ${y} L${x - 6} ${y + 8}" fill="none" stroke="#222" stroke-width="1.4"/>`;
    const clapet = (x, y, haut = true) => `<path d="M${x - 7} ${haut ? y + 7 : y - 7} L${x + 7} ${haut ? y + 7 : y - 7} L${x} ${haut ? y - 6 : y + 6} Z" fill="#222"/><line x1="${x - 8}" y1="${haut ? y - 7 : y + 7}" x2="${x + 8}" y2="${haut ? y - 7 : y + 7}" stroke="#222" stroke-width="2"/>`;
    const moteur = (x, y) => `<line x1="${x}" y1="${y}" x2="${x - 18}" y2="${y}" stroke="#222" stroke-width="1.2"/><circle cx="${x - 25}" cy="${y}" r="7" fill="#fff" stroke="#222" stroke-width="1.2"/>${texte(x - 25, y + 4, 'M', { fs: 9, a: 'middle', b: true })}`;
    const vanne3v = (x, y) => `${vanne(x, y)}<path d="M${x} ${y} L${x + 14} ${y - 7} L${x + 14} ${y + 7} Z" fill="#fff" stroke="#222" stroke-width="1.4"/>${moteur(x - 7, y)}`;
    const vanne2v = (x, y) => `${vanne(x, y)}${moteur(x - 7, y)}`;
    const compteur = (x, y) => `<rect x="${x - 11}" y="${y - 9}" width="22" height="18" fill="#fff" stroke="#222" stroke-width="1.3"/>${texte(x, y + 4, 'CE', { fs: 9, a: 'middle', b: true })}`;
    const thermo = (x, y) => `<line x1="${x}" y1="${y}" x2="${x + 12}" y2="${y}" stroke="#222" stroke-width="1"/><circle cx="${x + 17}" cy="${y}" r="5" fill="#fff" stroke="#222" stroke-width="1"/>${texte(x + 17, y + 3, 'T', { fs: 7, a: 'middle' })}`;
    const fleche = (x, y, sens, c) => ({ haut: `<path d="M${x - 5} ${y + 4} L${x} ${y - 5} L${x + 5} ${y + 4} Z" fill="${c}"/>`, bas: `<path d="M${x - 5} ${y - 4} L${x} ${y + 5} L${x + 5} ${y - 4} Z" fill="${c}"/>`,
      droite: `<path d="M${x - 4} ${y - 5} L${x + 5} ${y} L${x - 4} ${y + 5} Z" fill="${c}"/>`, gauche: `<path d="M${x + 4} ${y - 5} L${x - 5} ${y} L${x + 4} ${y + 5} Z" fill="${c}"/>` }[sens]);

    out.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
    out.push(texte(20, 26, `Schéma de principe hydraulique — ${d.regime}`, { fs: 15, b: true, c: '#1F3864' }));
    out.push(texte(20, 44, `${e.titreInstallation || ''}${e.titreInstallation ? ' · ' : ''}Production ${nf(d.Pprod, 0)} kW${d.multi ? ` (${d.multi.length} générateur${d.multi.length > 1 ? 's' : ''} : ${d.multi.map(x => `${x.rep} ${(ROLES[x.role] || '').toLowerCase()}`).join(', ')})` : d.n > 1 ? ` (cascade ${d.n} × ${nf(d.Pg, 0)} kW)` : ''} · besoins ${nf(d.Pdem, 0)} kW${d.co ? ` (froid ${nf(d.co.dF.Pdem, 0)} kW)` : ''} · ${d.echangeur ? 'échangeur à plaques' : d.decouplage === 'ballon' ? 'ballon tampon de découplage' : d.decouplage === 'bouteille3' ? 'bouteille 3 piquages' : d.bouteille ? 'bouteille de découplage' : 'sans découplage'}${d.tichelmann ? ' · cascade en Tichelmann' : ''}`, { fs: 11, c: '#555' }));

    // Collecteurs
    const xFinD = d.circuits.length ? xS0 + (d.circuits.length - 1) * pasC + 50 : xS0 + 50, xFinR = d.circuits.length ? xS0 + (d.circuits.length - 1) * pasC + 120 : xS0 + 120;
    if (d.echangeur) {
      // Échangeur à plaques : primaire à gauche, secondaire à droite, circuits séparés
      out.push(ligne(xG0 + 40, Y1, xB, Y1, cD), ligne(40, Y2, xB, Y2, cR), ligne(xB + 50, Y1, xFinD, Y1, cD), ligne(xB + 50, Y2, xFinR, Y2, cR));
      out.push(`<rect x="${xB}" y="${Y1 - 40}" width="50" height="${Y2 - Y1 + 80}" rx="4" fill="#fff" stroke="#222" stroke-width="1.6"/>`,
        `<path d="M${xB + 6} ${Y1 - 30} ${Array.from({ length: 9 }, (_, k) => `L${xB + (k % 2 ? 44 : 6)} ${Y1 - 30 + (k + 1) * (Y2 - Y1 + 60) / 9}`).join(' ')}" fill="none" stroke="#666" stroke-width="1.2"/>`);
      out.push(texte(xB + 25, Y2 + 62, 'Échangeur', { fs: 10, a: 'middle', b: true }), texte(xB + 25, Y2 + 75, 'à plaques', { fs: 10, a: 'middle', b: true }),
        texte(xB + 25, Y2 + 89, `${nf(d.Pdem, 0)} kW · ≈ ${nf(d.Aech, 1)} m²`, { fs: 9, a: 'middle' }), texte(xB + 25, Y2 + 102, `secondaire ${d.Tsd}/${d.Tsr} °C`, { fs: 9, a: 'middle' }));
      // Vase et soupape du circuit secondaire
      const xv = xB + 85;
      out.push(ligne(xv, Y2, xv, Y2 + 120, cR, 2), `<path d="M${xv - 18} ${Y2 + 124} q18 -12 36 0 v46 q-18 12 -36 0 Z" fill="#f1f1f1" stroke="#222" stroke-width="1.4"/>`);
      dessus.push(point(xv, Y2, cR), vanne(xv, Y2 + 30), texte(xv + 24, Y2 + 150, 'Vase', { fs: 8.5 }), texte(xv + 24, Y2 + 161, 'secondaire', { fs: 8.5 }));
    } else if (d.decouplage === 'bouteille3') {
      // Bouteille 3 piquages : départs primaire et secondaire en haut, retour commun en bas (le retour passe sous la bouteille)
      out.push(ligne(xG0 + 40, Y1, xB, Y1, cD), ligne(xB + 50, Y1, xFinD, Y1, cD), ligne(40, Y2, xFinR, Y2, cR));
      out.push(`<rect x="${xB}" y="${Y1 - 60}" width="50" height="${Y2 - Y1 + 30}" rx="10" fill="#eef2f8" stroke="#222" stroke-width="1.6"/>`, ligne(xB + 25, Y2 - 30, xB + 25, Y2, cR, 3));
      dessus.push(point(xB + 25, Y2, cR));
      out.push(ligne(xB + 25, Y1 - 60, xB + 25, Y1 - 75, '#222', 1.4), `<path d="M${xB + 19} ${Y1 - 75} h12 v-8 h-12 Z" fill="#fff" stroke="#222" stroke-width="1.2"/>`, texte(xB + 37, Y1 - 75, 'Purgeur', { fs: 9 }));
      out.push(texte(xB + 25, Y2 + 30, 'Bouteille', { fs: 10, a: 'middle', b: true }), texte(xB + 25, Y2 + 43, '3 piquages', { fs: 10, a: 'middle', b: true }),
        texte(xB + 25, Y2 + 56, d.tb ? d.tb.nom.replace(/ \(.*/, '') : `Ø ${nf(d.Db, 0)} mm`, { fs: 9.5, a: 'middle' }), texte(xB + 25, Y2 + 69, 'retour commun', { fs: 8.5, a: 'middle', c: '#555' }));
    } else if (d.decouplage === 'ballon') {
      // Ballon tampon de découplage : 4 piquages, départs en haut, retours en bas
      out.push(ligne(xG0 + 40, Y1, xB - 5, Y1, cD), ligne(40, Y2, xB - 5, Y2, cR), ligne(xB + 55, Y1, xFinD, Y1, cD), ligne(xB + 55, Y2, xFinR, Y2, cR));
      out.push(`<rect x="${xB - 5}" y="${Y1 - 80}" width="60" height="${Y2 - Y1 + 150}" rx="26" fill="#f1f1f1" stroke="#222" stroke-width="1.8"/>`);
      out.push(ligne(xB + 25, Y1 - 80, xB + 25, Y1 - 92, '#222', 1.4), `<path d="M${xB + 19} ${Y1 - 92} h12 v-8 h-12 Z" fill="#fff" stroke="#222" stroke-width="1.2"/>`, texte(xB + 37, Y1 - 92, 'Purgeur', { fs: 9 }));
      dessus.push(thermo(xB + 55, Y1 - 50), thermo(xB + 55, Y2 + 40), texte(xB + 80, Y1 - 46, 'TT haut', { fs: 8 }), texte(xB + 80, Y2 + 44, 'TT bas', { fs: 8 }));
      out.push(texte(xB + 25, Y2 + 100, 'Ballon tampon', { fs: 10, a: 'middle', b: true }), texte(xB + 25, Y2 + 113, 'de découplage', { fs: 10, a: 'middle', b: true }),
        texte(xB + 25, Y2 + 126, `${nf(d.tampon ? d.tampon.V : 0, 0)} L`, { fs: 9.5, a: 'middle' }));
    } else if (d.bouteille) {
      out.push(ligne(xG0 + 40, Y1, xB, Y1, cD), ligne(40, Y2, xB, Y2, cR), ligne(xB + 50, Y1, xFinD, Y1, cD), ligne(xB + 50, Y2, xFinR, Y2, cR));
      out.push(`<rect x="${xB}" y="${Y1 - 60}" width="50" height="${Y2 - Y1 + 120}" rx="10" fill="#eef2f8" stroke="#222" stroke-width="1.6"/>`);
      out.push(ligne(xB + 25, Y1 - 60, xB + 25, Y1 - 75, '#222', 1.4), `<path d="M${xB + 19} ${Y1 - 75} h12 v-8 h-12 Z" fill="#fff" stroke="#222" stroke-width="1.2"/>`, texte(xB + 37, Y1 - 75, 'Purgeur', { fs: 9 }));
      out.push(ligne(xB + 25, Y2 + 60, xB + 25, Y2 + 78, '#222', 1.4), vanneH(xB + 25, Y2 + 86), texte(xB + 37, Y2 + 90, 'Vidange', { fs: 9 }));
      out.push(texte(xB + 25, Y2 + 115, 'Bouteille de', { fs: 10, a: 'middle', b: true }), texte(xB + 25, Y2 + 128, 'découplage', { fs: 10, a: 'middle', b: true }),
        texte(xB + 25, Y2 + 141, d.tb ? d.tb.nom.replace(/ \(.*/, '') : `Ø ${nf(d.Db, 0)} mm`, { fs: 9.5, a: 'middle' }));
    } else {
      out.push(ligne(xG0 + 40, Y1, xFinD, Y1, cD), ligne(40, Y2, xFinR, Y2, cR));
    }
    out.push(texte(xFinR + 14, Y1 + 4, 'Collecteur départ', { fs: 9.5, c: cD, b: true }), texte(xFinR + 14, Y1 + 16, d.tc.nom.replace(/ \(.*/, ''), { fs: 9, c: cD }),
      texte(xFinR + 14, Y2 + 4, 'Collecteur retour', { fs: 9.5, c: cR, b: true }));
    out.push(fleche(xS0 - 30, Y1, 'droite', cD), fleche(xS0 - 30, Y2, 'gauche', cR));

    out.push(`<circle cx="30" cy="72" r="10" fill="#fff" stroke="#222" stroke-width="1.3"/>`, texte(30, 76, 'TE', { fs: 8, a: 'middle', b: true }), texte(46, 76, 'Sonde extérieure', { fs: 9 }));
    // Cascade en Tichelmann : le retour longe les générateurs depuis le premier (retour inversé, longueurs égales)
    const Y3 = Y2 + 45, xTi = xG0 + 15;
    if (d.tichelmann) {
      out.push(ligne(xTi, Y2, xTi, Y3, cR), ligne(xTi, Y3, xG0 + (nG - 1) * pasG + 100, Y3, cR));
      dessus.push(point(xTi, Y2, cR), texte(xG0 + (nG - 1) * pasG + 108, Y3 + 4, 'Retour en Tichelmann', { fs: 8.5, c: cR }));
    }
    // Ballon tampon en série : sur le retour primaire (avant les générateurs) ou sur le départ (après les générateurs)
    if (d.tampon && d.tampon.V > 0 && d.tampon.position !== 'decouplage') {
      const xT = (decouple ? xB : xS0) - 145, dep = d.tampon.position === 'depart';
      if (dep) { out.push(`<rect x="${xT - 22}" y="${Y1 - 85}" width="44" height="110" rx="14" fill="#f1f1f1" stroke="#222" stroke-width="1.6"/>`);
        dessus.push(texte(xT, Y1 - 112, 'Ballon tampon', { fs: 9, a: 'middle', b: true }), texte(xT, Y1 - 100, `${nf(d.tampon.V, 0)} L · départ`, { fs: 9, a: 'middle' })); }
      else { out.push(`<rect x="${xT - 22}" y="${Y2 - 40}" width="44" height="110" rx="14" fill="#f1f1f1" stroke="#222" stroke-width="1.6"/>`);
        dessus.push(texte(xT, Y2 + 86, 'Ballon tampon', { fs: 9, a: 'middle', b: true }), texte(xT, Y2 + 98, `${nf(d.tampon.V, 0)} L · retour`, { fs: 9, a: 'middle' })); }
    }
    // Générateurs
    const yGen = 560;
    for (let i = 0; i < nG; i++) {
      const x = xG0 + i * pasG, xd = x + 40, xr = x + 100, GI = d.multi ? d.multi[i] : null;
      const chaudG = GI ? (GI.gen[1] === 'mixte' ? d.chaud : GI.gen[1] === 'chaud') : d.chaud;
      out.push(`<rect x="${x + 10}" y="${yGen}" width="120" height="70" rx="6" fill="${chaudG ? '#fdecea' : '#e3f0ff'}" stroke="#222" stroke-width="1.6"${GI && GI.role === 'secours' ? ' stroke-dasharray="6 3"' : ''}/>`);
      const lib = (GI ? GI.gen : d.gen)[0].split(/ (?=[a-z(])/);
      out.push(texte(x + 70, yGen + 18, GI ? `${GI.rep} · ${ROLES[GI.role]}` : `${G}${i + 1}`, { fs: 11, a: 'middle', b: true }), texte(x + 70, yGen + 33, lib[0], { fs: 9, a: 'middle' }),
        texte(x + 70, yGen + 45, lib.slice(1).join(' ').slice(0, 26), { fs: 9, a: 'middle' }), texte(x + 70, yGen + 61, GI ? `${nf(GI.P, 0)} kW · ${nf(GI.Q, 2)} m³/h${GI.regime ? ` · ${GI.regime[0]}/${GI.regime[1]}` : ''}` : d.co ? `${nf(d.co.dC.Pg, 0)} / ${nf(d.co.dF.Pg, 0)} kW` : `${nf(d.Pg, 0)} kW · ${nf(d.Qg, 2)} m³/h`, { fs: 9.5, a: 'middle', b: true }));
      const yRet = d.tichelmann ? Y3 : Y2;
      out.push(ligne(xd, yGen, xd, Y1, cD), ligne(xr, yRet, xr, yGen, cR));
      croisement(xd, Y2); if (d.tichelmann) croisement(xd, Y3);
      dessus.push(point(xd, Y1, cD), point(xr, yRet, cR), vanne(xd, Y2 + 30), vanne(xr, yRet + 25), thermo(xd, yGen - 30));
      const yP = yRet + (d.tichelmann ? 60 : 75);
      if (GI ? GI.pp : d.pompesInd && !d.ppIntegree && (decouple || nG > 1)) dessus.push(pompe(xr, yP, false), texte(xr + 16, yP + 4, GI ? `PP${i + 1}` : `P${G}${i + 1}`, { fs: 9 }), clapet(xr, yP + 35, false));
      else if (GI && GI.pompe === 'integree') dessus.push(texte(xr + 8, yP + 4, 'Pompe intégrée', { fs: 8.5 }));
      else if (nG > 1) dessus.push(vanne2v(xr, yP + 10), texte(xr + 12, yP + 14, 'Vanne motorisée', { fs: 8.5 }));
      dessus.push(`<line x1="${xd}" y1="${yGen - 55}" x2="${xd - 22}" y2="${yGen - 55}" stroke="#222" stroke-width="1.2"/><path d="M${xd - 22} ${yGen - 62} l-12 7 l12 7 Z" fill="#fff" stroke="#222" stroke-width="1.2"/>`,
        texte(xd - 30, yGen - 66, 'Soupape', { fs: 8.5, a: 'middle' }));
      dessus.push(texte(xd + 6, yGen - 8, (GI ? GI.t : d.tg).nom.replace(/ \(.*/, ''), { fs: 9, c: cD }));
      if (d.chaud && (GI ? GI.P : d.Pg) > 300) dessus.push(`<line x1="${xd}" y1="${yGen - 95}" x2="${xd - 18}" y2="${yGen - 95}" stroke="#222" stroke-width="1"/><circle cx="${xd - 26}" cy="${yGen - 95}" r="8" fill="#fff" stroke="#222" stroke-width="1.2"/>`, texte(xd - 26, yGen - 92, 'PS', { fs: 7, a: 'middle', b: true }), texte(xd - 36, yGen - 92, 'Manque d\'eau', { fs: 8, a: 'end' }));
    }
    // Nappe : boucle intermédiaire (évaporateurs), échangeur de barrage, forage de pompage et puits de rejet
    if (d.forage) {
      const F = d.forage, cN = '#00897b', cI = '#5d4037', yA = yGen + 110, yB = yGen + 150, xE = xG0 + nG * pasG + 40, xP = xE + 170, xRj = xP + 150;
      for (let i = 0; i < nG; i++) { const x = xG0 + i * pasG; out.push(ligne(x + 50, yGen + 70, x + 50, yA, cI, 2.5), ligne(x + 90, yB, x + 90, yGen + 70, cI, 2.5)); dessus.push(point(x + 50, yA, cI), point(x + 90, yB, cI)); }
      out.push(ligne(xG0 + 50, yA, xE, yA, cI, 2.5), ligne(xG0 + 90, yB, xE, yB, cI, 2.5));
      dessus.push(pompeH(xE - 60, yA), texte(xE - 60, yA - 18, 'Pompe boucle intermédiaire', { fs: 8.5, a: 'middle' }), texte(xE - 60, yB + 22, `${nf(F.Qi, 1)} m³/h`, { fs: 8.5, a: 'middle', c: cI }));
      out.push(`<rect x="${xE}" y="${yA - 30}" width="50" height="${yB - yA + 60}" rx="4" fill="#fff" stroke="#222" stroke-width="1.6"/>`,
        `<path d="M${xE + 6} ${yA - 20} ${Array.from({ length: 7 }, (_, k) => `L${xE + (k % 2 ? 44 : 6)} ${yA - 20 + (k + 1) * (yB - yA + 40) / 7}`).join(' ')}" fill="none" stroke="#666" stroke-width="1.2"/>`);
      dessus.push(texte(xE + 25, yB + 46, 'Échangeur de barrage', { fs: 9.5, a: 'middle', b: true }), texte(xE + 25, yB + 58, `${nf(F.Psource, 0)} kW · ≈ ${nf(F.A, 1)} m² (inox / titane)`, { fs: 8.5, a: 'middle' }));
      // Côté nappe : forage de pompage → échangeur → puits de rejet
      const yS = yB + 160;
      out.push(ligne(xE + 50, yA, xP, yA, cN, 2.5), ligne(xP, yA, xP, yS - 60, cN, 2.5), ligne(xE + 50, yB, xRj, yB, cN, 2.5), ligne(xRj, yB, xRj, yS - 60, cN, 2.5));
      [[xP, 'Forage de pompage'], [xRj, 'Puits de rejet']].forEach(([x, t]) => {
        out.push(`<rect x="${x - 14}" y="${yS - 110}" width="28" height="110" fill="#e0f2f1" stroke="#222" stroke-width="1.4"/>`, `<path d="M${x - 30} ${yS - 70} h60" stroke="${cN}" stroke-width="1" stroke-dasharray="4 3"/>`);
        dessus.push(texte(x, yS + 14, t, { fs: 9.5, a: 'middle', b: true }));
      });
      dessus.push(pompe(xP, yS - 40), texte(xP + 18, yS - 36, 'Pompe immergée', { fs: 8.5 }), texte(xP + 18, yS - 24, `${nf(F.Qn, 1)} m³/h · ${nf(F.H, 0)} mCE`, { fs: 8.5, c: cN }),
        texte(xP - 32, yS - 74, 'niveau dynamique', { fs: 7.5, a: 'end', c: '#555' }), vanne(xP, yA + 40), `<rect x="${xP - 11}" y="${yA + 70}" width="22" height="16" fill="#fff" stroke="#222" stroke-width="1.2"/>`, texte(xP, yA + 82, 'FT', { fs: 8, a: 'middle', b: true }),
        texte(xP + 16, yA + 82, 'Débitmètre (contrôleur de débit)', { fs: 8 }), thermo(xP, yA + 105), vanne(xRj, yB + 40), clapet(xRj, yB + 70, false),
        texte((xP + xRj) / 2, yA - 10, `Eau de nappe ΔT ${nf(F.dTf, 0)} K`, { fs: 9, a: 'middle', c: cN, b: true }), texte((xP + xRj) / 2, yA + 4, F.tube.nom.replace(/ \(.*/, ''), { fs: 8.5, a: 'middle', c: cN }));
    }
    if (!d.pompesInd && nG > 1 && decouple) dessus.push(pompeH(xB - 45, Y1), texte(xB - 45, Y1 - 18, 'Pompe primaire', { fs: 8.5, a: 'middle' }));
    // Accessoires du primaire : vase d'expansion, remplissage, désemboueur
    if (e.vase !== 'non') {
      out.push(ligne(40, Y2, 40, 470, cR, 2.5), `<path d="M15 475 q25 -18 50 0 v70 q-25 18 -50 0 Z" fill="#f1f1f1" stroke="#222" stroke-width="1.5"/>`);
      dessus.push(point(40, Y2, cR), vanne(40, 445), texte(40, 575, 'Vase', { fs: 9.5, a: 'middle', b: true }), texte(40, 587, 'd\'expansion', { fs: 9.5, a: 'middle', b: true }));
      dessus.push(`<line x1="40" y1="420" x2="80" y2="420" stroke="#666" stroke-width="1.6"/>`, point(40, 420, cR), `<rect x="80" y="412" width="16" height="16" fill="#fff" stroke="#222" stroke-width="1.2"/>`,
        texte(88, 424, 'D', { fs: 9, a: 'middle', b: true }), texte(100, 424, 'Remplissage (disconnecteur)', { fs: 8.5 }));
    }
    if (e.desemboueur !== 'non') {
      const xd = (decouple ? xB : xS0) - 60;
      dessus.push(`<rect x="${xd - 14}" y="${Y2 - 12}" width="28" height="34" rx="4" fill="#fff" stroke="#222" stroke-width="1.4"/>`, texte(xd, Y2 + 36, 'Pot à boue', { fs: 8.5, a: 'middle' }),
        texte(xd, Y2 + 46, 'désemboueur', { fs: 8.5, a: 'middle' }));
    }

    // Circuits
    d.circuits.forEach((c, i) => {
      const x = xS0 + i * pasC, xd = x + 50, xr = x + 120, yE = 80;
      out.push(ligne(xd, Y1, xd, yE + 70, cD), ligne(xr, yE + 70, xr, Y2, cR));
      croisement(xr, Y1);
      out.push(`<rect x="${x + 20}" y="${yE}" width="130" height="70" rx="6" fill="#fff" stroke="#222" stroke-width="1.6"/>`);
      out.push(texte(x + 85, yE + 16, c.rep.slice(0, 24), { fs: 10.5, a: 'middle', b: true }), texte(x + 85, yE + 30, c.em[0].split(' (')[0].slice(0, 28), { fs: 9, a: 'middle' }),
        texte(x + 85, yE + 45, d.co ? `ch. ${nf(c.P, 0)} / fr. ${nf(c.Pf, 0)} kW` : `${nf(c.P, 0)} kW · ${c.rc[0]}/${c.rc[1]} °C`, { fs: 9.5, a: 'middle' }),
        texte(x + 85, yE + 60, d.co ? `${nf(c.Qc, 1)} / ${nf(c.Qf, 1)} m³/h` : `${nf(c.Q, 2)} m³/h`, { fs: 9.5, a: 'middle', b: true }));
      dessus.push(point(xd, Y1, cD), point(xr, Y2, cR), vanne(xd, Y1 - 22), vanne(xr, Y1 - 22));
      // Montage hydraulique du circuit : libellé au-dessus de l'émetteur, organes selon le montage
      dessus.push(texte(x + 85, yE - 6, (c.M || montage(c.reg)).court, { fs: 8.5, a: 'middle', c: '#555', b: true }));
      if (['injection3', 'injection2', 'bouteille', 'echangeur'].includes(c.reg)) {
        // Secondaire (vers l'émetteur) en haut, séparation au milieu, primaire (vers le collecteur) en bas
        dessus.push(pompe(xd, 192), texte(xd - 16, 196, `PC${i + 1}`, { fs: 8.5, a: 'end' }), thermo(xd, 165), equilibrage(xr, 285), texte(xr + 13, 301, 'Équil.', { fs: 8 }));
        if (c.reg === 'injection3' || c.reg === 'injection2') dessus.push(`<line x1="${xd}" y1="224" x2="${xr}" y2="224" stroke="${cR}" stroke-width="2.5"/>`, point(xd, 224, cD), point(xr, 224, cR), texte((xd + xr) / 2, 219, 'by-pass neutre', { fs: 7.5, a: 'middle' }));
        if (c.reg === 'injection3') dessus.push(`<line x1="${xd + 14}" y1="252" x2="${xr}" y2="252" stroke="${cR}" stroke-width="2.5"/>`, point(xr, 252, cR), vanne3v(xd, 252), texte(xd + 14, 246, 'V3V inj.', { fs: 8 }));
        if (c.reg === 'injection2' || c.reg === 'echangeur') dessus.push(vanne2v(xd, 252), texte(xd + 10, 246, c.reg === 'echangeur' ? 'V2V prim.' : 'V2V inj.', { fs: 8 }));
        if (c.reg === 'bouteille') dessus.push(`<rect x="${xd - 10}" y="212" width="${xr - xd + 20}" height="24" rx="8" fill="#eef2f8" stroke="#222" stroke-width="1.4"/>`, texte((xd + xr) / 2, 228, 'Bouteille', { fs: 8.5, a: 'middle', b: true }));
        if (c.reg === 'echangeur') dessus.push(`<rect x="${xd - 10}" y="208" width="${xr - xd + 20}" height="30" rx="3" fill="#fff" stroke="#222" stroke-width="1.4"/>`,
          `<path d="M${xd - 4} 214 ${Array.from({ length: 8 }, (_, k) => `L${xd - 4 + (k + 1) * (xr - xd + 8) / 8} ${k % 2 ? 214 : 232}`).join(' ')}" fill="none" stroke="#666" stroke-width="1"/>`, texte(xr + 14, 227, 'Éch.', { fs: 8, b: true }));
        if (c.M && c.M.pp) dessus.push(pompe(xd, 290), texte(xd - 16, 294, `PCP${i + 1}`, { fs: 8.5, a: 'end' }));
        if (e.compteurs === 'oui') dessus.push(compteur(xr, 175));
      } else {
        dessus.push(pompe(xd, 255), texte(xd - 16, 259, `PC${i + 1}`, { fs: 8.5, a: 'end' }), clapet(xd, 285));
        if (c.reg === '3v') { dessus.push(`<line x1="${xd + 14}" y1="200" x2="${xr}" y2="200" stroke="${cR}" stroke-width="2.5"/>`, point(xr, 200, cR), vanne3v(xd, 200), texte(xd + 14, 192, 'V3V', { fs: 8.5 })); }
        if (c.reg === '2v') dessus.push(vanne2v(xd, 200), texte(xd + 10, 192, 'V2V', { fs: 8.5 }), `<line x1="${xd}" y1="160" x2="${xr}" y2="160" stroke="#222" stroke-width="1.2" stroke-dasharray="4 3"/>`, texte((xd + xr) / 2, 156, 'BP diff.', { fs: 7.5, a: 'middle' }));
        // Décharge : vanne 3 voies répartitrice sur le retour, dérivation du départ vers le retour
        if (c.reg === 'decharge') dessus.push(`<line x1="${xd}" y1="200" x2="${xr - 14}" y2="200" stroke="${cD}" stroke-width="2.5"/>`, point(xd, 200, cD), vanne(xr, 200),
          `<path d="M${xr} 200 L${xr - 14} ${193} L${xr - 14} ${207} Z" fill="#fff" stroke="#222" stroke-width="1.4"/>`, moteur(xr + 25, 200), texte(xr + 10, 192, 'V3V déch.', { fs: 8 }));
        dessus.push(thermo(xd, 172), equilibrage(xr, 260), texte(xr + 13, 276, 'Équil.', { fs: 8 }));
        if (e.compteurs === 'oui') dessus.push(compteur(xr, 228));
      }
      dessus.push(...(c.M && c.M.pp || c.reg === 'injection2' ? [] : [fleche(xd, 228, 'haut', cD)]), fleche(xr, 172, 'bas', cR));
      dessus.push(texte(xd - 6, 150 + 14, c.t.nom.replace(/ \(.*/, ''), { fs: 9, c: cD, a: 'end', rot: -90 }));
      // Robinetterie et accessoires saisis : repérés sous le circuit (symbole, repère, quantité, DN, référence)
      (c.rob || []).slice(0, 9).forEach((r, k) => {
        const y = Y2 + 34 + k * 20, xs = x + 30, sym = { isolement: vanneH(xs, y), clapet: clapet(xs, y), equilibrage: equilibrage(xs, y), compteur: compteur(xs, y), thermometre: thermo(xs, y),
          filtre: `<path d="M${xs - 9} ${y} L${xs + 9} ${y} M${xs - 3} ${y} L${xs + 4} ${y + 8}" stroke="#222" stroke-width="1.6" fill="none"/><rect x="${xs + 1}" y="${y + 6}" width="6" height="5" fill="#fff" stroke="#222"/>`,
          manchette: `<path d="M${xs - 9} ${y} l3 -5 l3 10 l3 -10 l3 10 l3 -10 l3 5" stroke="#222" stroke-width="1.4" fill="none"/>`,
          desemboueur: `<circle cx="${xs}" cy="${y}" r="6" fill="#fff" stroke="#222" stroke-width="1.4"/><line x1="${xs - 4}" y1="${y + 3}" x2="${xs + 4}" y2="${y + 3}" stroke="#222"/>` }[r.type]
          || `<circle cx="${xs}" cy="${y}" r="5" fill="#fff" stroke="#222" stroke-width="1.4"/>`;
        dessus.push(sym, texte(xs + 30, y + 4, `${r.rep}${r.qte > 1 ? ` ×${r.qte}` : ''} · DN ${r.dn}${r.ref ? ` · ${String(r.ref).slice(0, 16)}` : ''}`, { fs: 8.5 }));
      });
      if ((c.rob || []).length > 9) dessus.push(texte(x + 30, Y2 + 34 + 9 * 20, `+ ${c.rob.length - 9} autre(s) (tableau)`, { fs: 8, c: '#666' }));
    });

    // Ballons (éléments) : bande sous le schéma, à l'aplomb de la production ou de leur circuit
    if ((d.ballons || []).length) {
      const yB = H0 - 20, prodX = [], parC = {};
      out.push(texte(20, yB, 'Ballons', { fs: 11, b: true, c: '#1F3864' }));
      d.ballons.forEach(b => {
        const ci = b.circuit ? d.circuits.findIndex(c => c.rep === b.circuit) : -1;
        const x = ci >= 0 ? xS0 + ci * pasC + 85 + 70 * ((parC[ci] = (parC[ci] || 0) + 1) - 1) : xG0 + 30 + prodX.length * 120;
        if (ci < 0) prodX.push(x);
        const y0 = yB + 20, h = 120;
        out.push(`<rect x="${x - 24}" y="${y0}" width="48" height="${h}" rx="18" fill="${b.fonction === 'ecs' ? '#fff4e5' : '#f1f1f1'}" stroke="#222" stroke-width="1.6"/>`);
        // Piquages : départ / retour (2) ou charge et décharge séparées (4)
        const piq = b.piquages === '4' ? [[x - 24, y0 + 22, -1], [x - 24, y0 + h - 22, -1], [x + 24, y0 + 22, 1], [x + 24, y0 + h - 22, 1]] : [[x - 24, y0 + 22, -1], [x - 24, y0 + h - 22, -1]];
        piq.forEach(([px, py, sg]) => out.push(ligne(px, py, px + sg * 14, py, py < y0 + h / 2 ? cD : cR, 2.5)));
        const yS = { haut: y0 + 18, milieu: y0 + h / 2, bas: y0 + h - 18 };
        b.sondes.forEach(so => dessus.push(thermo(x + (b.piquages === '4' ? -2 : 24), yS[so])));
        dessus.push(texte(x, y0 + h + 14, b.rep, { fs: 9.5, a: 'middle', b: true }), texte(x, y0 + h + 26, `${b.lib.split(' (')[0]}`.slice(0, 30), { fs: 8, a: 'middle' }),
          texte(x, y0 + h + 38, `${nf(b.V, 0)} L · ${b.piquages} piquages · ${b.circuit ? `circuit ${b.circuit}` : 'production'}`.slice(0, 44), { fs: 8, a: 'middle', c: '#555' }));
      });
    }
    // Évacuation de la chaleur : aéroréfrigérant ou tour au-dessus des générateurs, relié au premier (pointillés)
    if (d.evac) {
      const ev = d.evac, xa = xG0 + 10, ya = 70, cE = '#ef6c00';
      out.push(`<rect x="${xa}" y="${ya}" width="170" height="54" rx="4" fill="#fff8e1" stroke="#222" stroke-width="1.4"/>`);
      for (let k = 0; k < Math.min(ev.nVent, 4); k++) out.push(`<circle cx="${xa + 22 + k * 40}" cy="${ya + 14}" r="9" fill="#fff" stroke="#222" stroke-width="1.1"/>`, `<path d="M${xa + 15 + k * 40} ${ya + 14} h14 M${xa + 22 + k * 40} ${ya + 7} v14" stroke="#888" stroke-width="1"/>`);
      dessus.push(texte(xa + 85, ya + 36, `${ev.type === 'aero' ? 'Aéroréfrigérant' : 'Tour'} ${nf(ev.P, 0)} kW`, { fs: 9.5, a: 'middle', b: true }), texte(xa + 85, ya + 48, `${ev.Tc}/${ev.Tf} °C · PEV ${nf(ev.Q, 1)} m³/h · VBP`, { fs: 8.5, a: 'middle', c: cE }));
      out.push(`<path d="M${xa + 60} ${ya + 54} V${yGen + 35} H${xG0 + 10}" fill="none" stroke="${cE}" stroke-width="1.6" stroke-dasharray="6 4"/>`, `<path d="M${xa + 110} ${ya + 54} V${ya + 70}" fill="none" stroke="${cE}" stroke-width="1.6" stroke-dasharray="6 4"/>`);
    }
    // Légende
    const yl = H - 34, lg = [[`<line x1="0" y1="0" x2="26" y2="0" stroke="${cD}" stroke-width="3"/>`, d.co ? `Départ ${d.co.dC.Td} °C / ${d.co.dF.Td} °C` : `Départ ${d.Td} °C`], [`<line x1="0" y1="0" x2="26" y2="0" stroke="${cR}" stroke-width="3"/>`, d.co ? `Retour ${d.co.dC.Tr} °C / ${d.co.dF.Tr} °C` : `Retour ${d.Tr} °C`],
      [pompeH(13, 0), 'Pompe'], [vanneH(13, 0), 'Vanne d\'isolement'], [`${vanne(13, 0)}<path d="M13 0 L27 -7 L27 7 Z" fill="#fff" stroke="#222" stroke-width="1.4"/>`, 'Vanne 3 voies'],
      [equilibrage(13, 0), 'Vanne d\'équilibrage'], [clapet(13, 0), 'Clapet anti-retour'], [compteur(13, 0), 'Compteur d\'énergie']];
    out.push(`<line x1="20" y1="${yl - 22}" x2="${W - 20}" y2="${yl - 22}" stroke="#ccc" stroke-width="1"/>`);
    let xl = 20;
    lg.forEach(([sym, lib]) => { out.push(`<g transform="translate(${xl} ${yl})">${sym}</g>`, texte(xl + 34, yl + 4, lib, { fs: 9.5 })); xl += 40 + lib.length * 5.6; });
    out.push(texte(W - 20, H - 8, 'Schéma de principe — ne vaut pas plan d\'exécution', { fs: 8.5, a: 'end', c: '#888' }));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-depart="${cD}" data-retour="${cR}">${out.join('')}${masques.join('')}${dessus.join('')}</svg>`;
  }

  /* ---------- Réglementation selon la puissance (synthèse indicative) ---------- */
  // Fluides frigorigènes : potentiel de réchauffement planétaire (PRP, règlement UE 2024/573)
  const FLUIDES_FRIGO = { R32: 675, R410A: 2088, R134a: 1430, R513A: 631, R454B: 466, R1234ze: 7, R290: 3, R744: 1 };
  const exigence = (niveau, texte, ref = '') => ({ niveau, texte, ref });
  // Relecture de la synthèse par l'entreprise (Réglages) : relecteur, date, validité, exigences complémentaires
  let visaRegl = null;
  const utiliserReglementation = v => { visaRegl = v && v.date ? v : null; };
  const jour = () => new Date().toISOString().slice(0, 10), dateFr = iso => (iso ? iso.split('-').reverse().join('/') : '');
  function blocVisa() {
    if (!visaRegl) return { titre: 'Validité de la synthèse', items: [exigence('conseil', 'Synthèse non encore relue par l\'entreprise : à faire viser dans les Réglages (relecteur, date, validité) avant d\'en faire une exigence contractuelle.')] };
    const ok = !visaRegl.validite || visaRegl.validite >= jour();
    return { titre: 'Validité de la synthèse', items: [exigence(ok ? 'info' : 'conseil', ok ? `Synthèse relue le ${dateFr(visaRegl.date)} par ${visaRegl.relecteur || '—'}${visaRegl.validite ? `, valable jusqu'au ${dateFr(visaRegl.validite)}` : ''}.`
      : `Relecture du ${dateFr(visaRegl.date)} expirée le ${dateFr(visaRegl.validite)} : textes à revérifier.`)] };
  }
  function reglementation(d, e) {
    const g = e.generateur, Pg = d.Pg, types = d.multi ? d.multi.map(x => x.type) : [g], a = re => types.some(t => re.test(t || ''));
    const comb = a(/^chaudiere/), gaz = a(/^chaudiere-(cond|gaz)$/), thermo = a(/^(pac|gf)/);
    // Production hétérogène : la chaufferie et l'ICPE 2910 portent sur les générateurs à combustion, le reste sur l'ensemble
    const P = d.Pprod, Pc = d.multi ? d.multi.filter(x => /^chaudiere/.test(x.type)).reduce((s, x) => s + x.P, 0) : P;
    const usage = e.usage || 'tertiaire', tertiaire = usage === 'tertiaire' || usage === 'erp', blocs = [];
    // Sécurité hydraulique
    const soupape = [[50, 'DN 15'], [100, 'DN 20'], [200, 'DN 25'], [350, 'DN 32'], [600, 'DN 40'], [900, 'DN 50']].find(([p]) => Pg <= p);
    const sec = [
      exigence('obligatoire', `Soupape de sécurité sur chaque générateur, tarée au plus à la pression maximale admissible, ${soupape ? `de diamètre ${soupape[1]} au minimum pour ${nf(Pg, 0)} kW` : 'en plusieurs soupapes au-delà de 900 kW'}, avec décharge visible vers l'égout.`, 'NF EN 12828, NF EN ISO 4126'),
      exigence('obligatoire', 'Vase d\'expansion ou maintien de pression sans organe d\'isolement manœuvrable par erreur (vanne cadenassée), manomètre et thermomètre à la production.', 'NF EN 12828'),
      exigence('obligatoire', `Disconnecteur sur le remplissage depuis l'eau potable${e.fluide && e.fluide !== 'eau' ? ', adapté à la catégorie du fluide glycolé (BA en général), remplissage par bac de préparation' : ''}.`, 'NF EN 1717, code de la santé publique'),
    ];
    if (d.chaud && comb) sec.push(exigence('obligatoire', 'Thermostat de réglage et limiteur de température de sécurité à réarmement manuel sur chaque générateur.', 'NF EN 12828'));
    if (d.chaud && Pg > 300) sec.push(exigence('obligatoire', `Générateurs de plus de 300 kW : limiteur de pression maximale et sécurité de manque d'eau (pressostat, limiteur de niveau ou de débit) sur chaque générateur.`, 'NF EN 12828'));
    if (d.Td > 105) sec.push(exigence('obligatoire', 'Départ au-delà de 105 °C : eau surchauffée hors NF EN 12828, soumise à la réglementation des équipements sous pression (conception et suivi en service).', 'Directive 2014/68/UE, arrêté du 20 novembre 2017'));
    if (types.includes('echangeur-vapeur')) sec.push(exigence('obligatoire', 'Échangeur alimenté en vapeur : équipement sous pression (déclaration, requalification selon PS·V) ; sécurité de surchauffe coupant la vapeur côté primaire.', 'Directive 2014/68/UE, arrêté du 20 novembre 2017'));
    if (d.echangeur) sec.push(exigence('obligatoire', 'Circuits primaire et secondaire séparés par l\'échangeur : vase d\'expansion, soupape de sécurité et remplissage sur chacun.', 'NF EN 12828'));
    sec.push(exigence('conseil', 'Désemboueur et traitement d\'eau conformes aux prescriptions des constructeurs (dureté, pH, oxygène).', 'Constructeurs, VDI 2035'));
    blocs.push({ titre: 'Sécurité de l\'installation', items: sec });
    // Local et combustible
    if (comb) {
      const loc = [], Pcomb = Pc / 0.92;
      loc.push(Pc > 70 ? exigence('obligatoire', `Puissance totale de ${nf(Pc, 0)} kW (> 70 kW) : chaufferie en local dédié, parois et porte coupe-feu, ventilation haute et basse, arrêt d'urgence et coupure du combustible depuis l'extérieur du local.`,
        usage === 'erp' ? 'Règlement de sécurité ERP (articles CH)' : usage === 'industrie' ? 'Arrêté du 23 juin 1978, code du travail' : 'Arrêté du 23 juin 1978')
        : exigence('info', 'Puissance totale ≤ 70 kW : pas d\'obligation de chaufferie dédiée (règles du constructeur et des DTU).', 'Arrêté du 23 juin 1978'));
      if (gaz) loc.push(exigence('obligatoire', 'Alimentation gaz : robinet de coupure extérieur au local, conduits d\'évacuation des produits de combustion et amenée d\'air comburant dimensionnés.', usage === 'erp' ? 'NF DTU 61.1, NF DTU 24.1, ERP articles GZ' : 'NF DTU 61.1, NF DTU 24.1'));
      if (types.includes('chaudiere-fioul')) loc.push(exigence('obligatoire', 'Stockage de fioul : cuve double paroi ou en rétention, limiteur de remplissage, jaugeage ; classement ICPE selon la quantité stockée.', 'Arrêté du 1er juillet 2004, rubrique ICPE 4734'));
      if (types.includes('chaudiere-bois')) loc.push(exigence('obligatoire', 'Chaudière biomasse : silo séparé, dispositif anti-retour de flamme, évacuation des cendres.', 'Arrêté du 23 juin 1978, constructeur'));
      loc.push(Pcomb >= 1000
        ? exigence('obligatoire', `Puissance thermique nominale ≈ ${nf(Pcomb / 1000, 2)} MW : installation de combustion classée ICPE (rubrique 2910) — ${Pcomb < 20000 ? 'déclaration avec contrôle périodique' : Pcomb < 50000 ? 'enregistrement' : 'autorisation'}.`, 'Nomenclature ICPE 2910')
        : exigence('info', `Puissance thermique nominale ≈ ${nf(Pcomb, 0)} kW (< 1 MW) : pas de classement ICPE au titre de la rubrique 2910.`, 'Nomenclature ICPE 2910'));
      blocs.push({ titre: 'Local et combustible', items: loc });
    }
    // Exploitation et contrôles
    const exp = [];
    if (comb && Pg >= 4 && Pg <= 400) exp.push(exigence('obligatoire', 'Entretien annuel de chaque chaudière par un professionnel qualifié, avec attestation d\'entretien.', 'Code de l\'environnement R.224-41-4 et suivants'));
    if (comb && Pg > 400) exp.push(exigence('obligatoire', 'Chaudières de plus de 400 kW : contrôle de l\'efficacité énergétique tous les 2 ans par un organisme accrédité, livret de chaufferie, appareils de mesure (fumées, combustible).', 'Code de l\'environnement R.224-20 et suivants, arrêté du 2 octobre 2009'));
    exp.push(P > 70 ? exigence('obligatoire', `Système de ${d.chaud ? 'chauffage' : 'climatisation'} de plus de 70 kW : inspection périodique tous les 5 ans par une personne certifiée.`, 'Décret n° 2020-912 du 28 juillet 2020')
      : exigence('info', 'Système de 70 kW ou moins : pas d\'inspection périodique obligatoire (entretien selon le générateur).', 'Décret n° 2020-912'));
    if (tertiaire) {
      exp.push(P > 290 ? exigence('obligatoire', 'Bâtiment tertiaire, système de plus de 290 kW : système d\'automatisation et de contrôle (BACS / GTB) obligatoire depuis le 1er janvier 2025.', 'Code de la construction R.175-1 à R.175-6 (décret BACS)')
        : P > 70 ? exigence('obligatoire', 'Bâtiment tertiaire, système de plus de 70 kW : système d\'automatisation et de contrôle (BACS / GTB) obligatoire au 1er janvier 2027.', 'Code de la construction R.175-1 à R.175-6 (décret BACS)')
          : exigence('info', 'Système de 70 kW ou moins : GTB non imposée par le décret BACS.', 'Décret BACS'));
      exp.push(exigence('info', 'Bâtiment tertiaire de 1 000 m² ou plus : objectifs de réduction des consommations et déclaration annuelle (dispositif éco-énergie tertiaire) ; le comptage par circuit facilite le suivi.', 'Code de la construction L.174-1, R.174-22 et suivants'));
    }
    exp.push(exigence(e.compteurs === 'oui' ? 'info' : 'conseil', e.compteurs === 'oui' ? 'Compteurs d\'énergie par circuit prévus.' : 'Comptage de l\'énergie par circuit ou par usage conseillé (exigé en construction neuve selon le type de bâtiment).', 'RE 2020, décret BACS'));
    blocs.push({ titre: 'Exploitation et contrôles périodiques', items: exp });
    // Froid et fluides frigorigènes
    if (thermo) {
      const fl = FLUIDES_FRIGO[e.fluideFrigo] ? e.fluideFrigo : 'R32', estimee = !(num(e.chargeFrigo) > 0), charge = estimee ? 0.3 * P : num(e.chargeFrigo), teq = charge * FLUIDES_FRIGO[fl] / 1000, it = [];
      it.push(exigence('info', `Charge ${estimee ? 'estimée (≈ 0,3 kg/kW, à remplacer par la valeur constructeur)' : 'déclarée'} : ${nf(charge, 0)} kg de ${fl} (PRP ${FLUIDES_FRIGO[fl]}), soit ${nf(teq, 1)} t éq. CO₂ pour l'ensemble de la production.`));
      if (fl !== 'R290' && fl !== 'R744' && teq / d.n >= 5) it.push(exigence('obligatoire', `Contrôle d'étanchéité périodique de chaque équipement : tous les ${teq / d.n >= 500 ? '3' : teq / d.n >= 50 ? '6' : '12'} mois (délais doublés avec un système de détection des fuites), fiche d'intervention et registre, opérateur titulaire d'une attestation de capacité.`, 'Règlement (UE) 2024/573, code de l\'environnement R.543-75 et suivants'));
      if (teq / d.n >= 500) it.push(exigence('obligatoire', 'Plus de 500 t éq. CO₂ par équipement : système de détection des fuites obligatoire.', 'Règlement (UE) 2024/573'));
      if (fl !== 'R290' && fl !== 'R744' && charge > 300) it.push(exigence('obligatoire', `Quantité cumulée de fluides fluorés supérieure à 300 kg : installation classée ICPE (rubrique 1185), déclaration avec contrôle périodique.`, 'Nomenclature ICPE 1185'));
      if (fl === 'R290') it.push(exigence('obligatoire', 'Fluide inflammable (propane, classe A3) : charge limitée selon l\'emplacement, zones ATEX, installation en extérieur ou en salle des machines ventilée avec détection.', 'NF EN 378, directives ATEX'));
      if (fl === 'R744') it.push(exigence('obligatoire', 'CO₂ (R744) : très hautes pressions, équipements sous pression ; détection de CO₂ en local occupé.', 'NF EN 378, directive 2014/68/UE'));
      if (types.includes('gf-eau')) it.push(exigence('obligatoire', 'Tour aéroréfrigérante ouverte (le cas échéant) : ICPE 2921 — déclaration avec contrôle en dessous de 3 000 kW, enregistrement au-delà — et plan de prévention des légionelles ; sans objet avec un aéroréfrigérant sec.', 'Nomenclature ICPE 2921, arrêtés du 14 décembre 2013'));
      it.push(exigence('obligatoire', 'Conception et installation de l\'équipement frigorifique (salle des machines, ventilation, détection) selon le fluide et sa charge.', 'NF EN 378'));
      blocs.push({ titre: 'Fluides frigorigènes', items: it });
    }
    // Distribution et usages
    const dist = [];
    if (d.circuits.some(c => c.emetteur === 'plancher')) dist.push(exigence('obligatoire', 'Plancher chauffant : thermostat de sécurité sur le départ du circuit, coupant le circulateur au-delà de la température admissible des tubes et du revêtement.', 'NF DTU 65.14'));
    if (d.circuits.some(c => c.emetteur === 'ecs')) dist.push(exigence('obligatoire', 'Eau chaude sanitaire : 55 °C au moins en sortie de production et 50 °C dans le bouclage (prévention des légionelles), 50 °C au plus aux points de puisage des pièces de toilette.', 'Arrêté du 30 novembre 2005'));
    if (d.circuits.some(c => c.emetteur === 'plafond')) dist.push(exigence('obligatoire', 'Plafonds et poutres froides : sécurité anti-condensation (sonde de point de rosée coupant la vanne du circuit).', 'Constructeurs'));
    dist.push(d.chaud ? exigence('obligatoire', 'Calorifugeage des réseaux de distribution situés hors volume chauffé.', 'RE 2020 (neuf), arrêté du 3 mai 2007 (existant)')
      : exigence('obligatoire', 'Calorifugeage des réseaux d\'eau glacée avec pare-vapeur continu (voir le calcul d\'isolation).', 'NF DTU 45.2'));
    dist.push(exigence('obligatoire', 'Organes d\'équilibrage et de mesure permettant le réglage et le contrôle des débits de chaque circuit.', 'NF DTU 65.11'));
    blocs.push({ titre: 'Distribution et usages', items: dist });
    // Seuils
    // [seuil, exigence, s'applique, puissance comparée]
    const seuils = [[70, 'Chaufferie dédiée (générateurs à combustion)', comb, Pc], [70, 'Inspection périodique des systèmes (5 ans)', true, P], [70, 'BACS / GTB en tertiaire (2027)', tertiaire, P], [290, 'BACS / GTB en tertiaire (2025)', tertiaire, P],
      [300, 'Sécurité manque d\'eau, pression maxi (par générateur)', d.chaud, Pg], [400, 'Contrôle d\'efficacité énergétique, livret de chaufferie (par chaudière)', comb, Pg], [1000, 'ICPE 2910 (puissance thermique de combustion)', comb, Pc / 0.92]].filter(s => s[2]);
    blocs.push({ titre: 'Seuils de puissance', tableau: { entetes: ['Seuil', 'Exigence', 'Situation'], lignes: seuils.map(([s, lib, , ref]) => [`${nf(s, 0)} kW`, lib, ref > s ? `Concerné (${nf(ref, 0)} kW)` : `Non concerné (${nf(ref, 0)} kW)`]) } });
    const complements = String((visaRegl && visaRegl.complements) || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (complements.length) blocs.push({ titre: 'Exigences complémentaires de l\'entreprise', items: complements.map(t => exigence('obligatoire', t, 'Règle interne')) });
    blocs.push({ titre: '', texte: ['Synthèse établie d\'après la puissance, le type de générateur et l\'usage du bâtiment : vérifier les textes en vigueur, le CCTP et les exigences du bureau de contrôle.'] });
    return [blocVisa(), ...blocs];
  }

  // Départ de la loi d'eau à 18 °C extérieur : saisi sur le circuit, sinon 30 °C (25 °C pour un plancher)
  const depMini = (e, c) => { const x = ((e.circuits || []).find(y => String(y.rep || '').trim() === String(c.rep || '').trim()) || {}).depMini; const v = num(x, NaN); return Number.isFinite(v) && String(x).trim() !== '' ? v : c.emetteur === 'plancher' ? 25 : 30; };
  /* ---------- Courbe de chauffe (loi d'eau) de chaque circuit ---------- */
  // Départ linéaire entre (température de base, départ nominal) et (18 °C, départ mini) ; retour : écart proportionnel à la
  // charge ; arrêt du chauffage au-delà du seuil de non-chauffage. Équivalent « pente / déplacement parallèle » (type Synco).
  function courbeChauffe(d, e) {
    const Tb = num(e.Tbase, -10), arret = Math.min(19, Math.max(Tb + 5, num(e.nonChauffage, 17))), Ta = 20;
    const circ = (d.circuits || []).filter(c => c.rc[0] > c.rc[1] && ['radiateurs', 'plancher', 'radiant', 'aerotherme'].includes(c.emetteur) && montage(c.reg).vanne).map(c => {
      const base = depMini(e, c), s = (c.rc[0] - base) / (18 - Tb);
      const dep = T => Math.max(base, Math.min(c.rc[0], c.rc[0] - s * (T - Tb))), ret = T => { const x = dep(T); return x - (c.rc[0] - c.rc[1]) * (x - Ta) / (c.rc[0] - Ta); };
      return { rep: c.rep, emetteur: c.emetteur, regime: c.rc, base, pente: s, deplacement: base - s * (Ta - 18) - Ta, dep, ret };
    });
    if (!circ.length) return null;
    // Graphique : abscisse température extérieure (de Tb à 20 °C), ordonnée température d'eau
    const W = 720, H = 400, g = { x: 60, y: 20, w: 600, h: 320 }, xmin = Math.floor(Tb / 5) * 5, xmax = 20, ymax = Math.ceil(Math.max(...circ.map(c => c.regime[0])) / 10) * 10 + 10, ymin = 10;
    const X = T => g.x + (T - xmin) / (xmax - xmin) * g.w, Y = t => g.y + g.h - (t - ymin) / (ymax - ymin) * g.h;
    const COUL = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#117a65'];
    const o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Arial, sans-serif" font-size="11"><rect width="${W}" height="${H}" fill="#fff"/>`];
    for (let T = xmin; T <= xmax; T += 5) o.push(`<line x1="${X(T)}" y1="${g.y}" x2="${X(T)}" y2="${g.y + g.h}" stroke="#ddd"/><text x="${X(T)}" y="${g.y + g.h + 16}" text-anchor="middle">${T}</text>`);
    for (let t = ymin; t <= ymax; t += 10) o.push(`<line x1="${g.x}" y1="${Y(t)}" x2="${g.x + g.w}" y2="${Y(t)}" stroke="#ddd"/><text x="${g.x - 6}" y="${Y(t) + 4}" text-anchor="end">${t}</text>`);
    o.push(`<text x="${g.x + g.w / 2}" y="${H - 22}" text-anchor="middle">Température extérieure (°C)</text><text transform="translate(16 ${g.y + g.h / 2}) rotate(-90)" text-anchor="middle">Température d'eau (°C)</text>`);
    o.push(`<line x1="${X(arret)}" y1="${g.y}" x2="${X(arret)}" y2="${g.y + g.h}" stroke="#555" stroke-dasharray="5 4"/><text x="${X(arret) - 4}" y="${g.y + 12}" text-anchor="end" fill="#555">arrêt chauffage ${arret} °C</text>`);
    o.push(`<line x1="${X(Tb)}" y1="${g.y}" x2="${X(Tb)}" y2="${g.y + g.h}" stroke="#555" stroke-dasharray="2 3"/><text x="${X(Tb) + 4}" y="${g.y + 12}" fill="#555">base ${Tb} °C</text>`);
    circ.forEach((c, i) => {
      const k = COUL[i % COUL.length], pts = f => { const l = []; for (let T = Tb; T <= arret + 1e-9; T += 0.5) l.push(`${X(T).toFixed(1)},${Y(f(T)).toFixed(1)}`); return l.join(' '); };
      o.push(`<polyline points="${pts(c.dep)}" fill="none" stroke="${k}" stroke-width="2.5"/><polyline points="${pts(c.ret)}" fill="none" stroke="${k}" stroke-width="1.5" stroke-dasharray="6 4"/>`);
      o.push(`<circle cx="${X(Tb)}" cy="${Y(c.dep(Tb))}" r="3.5" fill="${k}"/><text x="${X(Tb) + 8}" y="${Y(c.dep(Tb)) - 6}" fill="${k}" font-weight="bold">${String(c.rep).replace(/&/g, '&amp;').replace(/</g, '&lt;')} : ${c.regime[0]}/${c.regime[1]} °C</text>`);
    });
    o.push(`<text x="${g.x + g.w}" y="${H - 6}" text-anchor="end" fill="#555">trait plein : départ · pointillés : retour</text></svg>`);
    const temps = [Tb, ...[-5, 0, 5, 10, 15].filter(T => T > Tb && T < arret), arret];
    return { circuits: circ, Tb, arret, svg: o.join(''), tableau: { entetes: ['Circuit', ...temps.map(T => `${T} °C ext.`)], lignes: circ.map(c => [c.rep, ...temps.map(T => `${nf(c.dep(T), 0)} / ${nf(c.ret(T), 0)}`)]) } };
  }

  /* ---------- Régulation : analyse fonctionnelle et liste des points ---------- */
  function regulation(d, e) {
    const Tb = num(e.Tbase, -10), red = num(e.reduit, 3), perm = num(e.permutation, 168), af = [], pts = [];
    const pt = (rep, des, type, rem = '') => pts.push([rep, des, type, rem]);
    const G = d.co ? 'PAC' : d.chaud ? 'G' : 'GF';
    pt('TE', 'Température extérieure', 'EA', 'Façade nord, à l\'abri du soleil');
    // Production
    const aval = d.decouplage === 'ballon' ? 'du ballon tampon de découplage' : d.bouteille ? 'de la bouteille de découplage' : d.echangeur ? 'de l\'échangeur (départ secondaire)' : '';
    af.push(d.chaud ? `Production : la consigne de départ ${aval && !d.echangeur ? `mesurée en aval ${aval} (sonde de départ commun)` : d.echangeur ? `mesurée en aval ${aval}` : 'mesurée sur le collecteur de départ'} est égale à la demande la plus élevée des circuits majorée de 5 K, plafonnée à ${d.Td} °C.`
      : `Production : consigne de départ d'eau glacée ${d.Td} °C ${aval ? `en aval ${aval}` : 'sur le collecteur (départ commun)'}, relevée jusqu'à ${d.Td + 3} °C par temps doux ou faible hygrométrie.`);
    if (d.co) af.push(`Change-over : basculement chauffage / climatisation selon la température extérieure moyenne sur 24 h (chaud sous 15 °C, froid au-dessus de 22 °C, réglables) ou par commande manuelle ; temporisation d'au moins 2 h entre deux inversions, consignes et lois d'eau propres à chaque saison, inversion des vannes des émetteurs.`);
    if (d.co) pt('CO', 'Commande de la saison (chaud / froid)', 'STOR', 'Inversion PAC et émetteurs');
    if (d.echangeur) { af.push(`Échangeur à plaques : la consigne de départ secondaire (${d.Tsd} °C au maximum) est tenue par la production ; sécurité de surchauffe du secondaire coupant la production.`); pt('TS2', 'Température de départ secondaire de l\'échangeur', 'EA'); pt('PI2', 'Pression du circuit secondaire', 'EA'); }
    if (d.tampon && d.tampon.V > 0) { af.push(`Ballon tampon de ${nf(d.tampon.V, 0)} L : les générateurs démarrent sur la sonde haute et s'arrêtent sur la sonde basse du ballon (anti-courts-cycles).`); pt('TT1', 'Température haute du ballon tampon', 'EA'); pt('TT2', 'Température basse du ballon tampon', 'EA'); }
    if (d.multi) afGenerateurs(d, e, af, pt, perm);
    else if (d.n > 1) af.push(e.cascadeMode === 'parallele'
      ? `Cascade de ${d.n} générateurs en modulation parallèle : les générateurs en service modulent ensemble au-dessus de leur taux de charge minimal (meilleur rendement${/cond|pac/.test(g(e)) ? ' et condensation' : ''}) ; un générateur supplémentaire démarre lorsque les autres dépassent 80 % de charge.`
      : `Cascade de ${d.n} générateurs en séquence : le générateur suivant démarre lorsque la consigne n'est pas atteinte après une temporisation (10 min réglable) avec le précédent au-delà de 90 % de charge ; arrêt dans l'ordre inverse.`);
    if (!d.multi && d.n > 1) af.push(`Permutation de l'ordre de priorité toutes les ${nf(perm, 0)} h de fonctionnement et basculement automatique sur le générateur suivant en cas de défaut (secours).`);
    for (let i = 1; i <= (d.multi ? 0 : d.n); i++) {
      pt(`${G}${i}`, `Autorisation de marche du générateur ${i}`, 'STOR'); pt(`${G}${i}`, `Consigne ou modulation du générateur ${i}`, 'SA', '0-10 V ou bus constructeur'); pt(`${G}${i}`, `État de marche du générateur ${i}`, 'ETOR'); pt(`${G}${i}`, `Défaut du générateur ${i}`, 'ETOR');
      if (d.ppDeportees) { pt(`P${G}${i}`, `Commande de la pompe primaire ${i}`, 'STOR', 'Post-circulation 5 min'); pt(`P${G}${i}`, `Défaut de la pompe primaire ${i}`, 'ETOR'); }
      else if (d.n > 1) { pt(`VM${i}`, `Vanne d'isolement motorisée du générateur ${i}`, 'STOR'); pt(`VM${i}`, `Fin de course de la vanne ${i}`, 'ETOR'); }
    }
    if (avecEchangeur(e) && e.pompeEchPrim === 'ajouter') af.push('Pompe primaire de l\'échangeur : en marche sur demande de chaleur (ou de froid), retour de marche contrôlé, post-circulation 3 min ; la vanne primaire de l\'échangeur régule la température de départ secondaire.');
    if (avecEchangeur(e) && e.pompeEchSec === 'ajouter') af.push('Pompe secondaire de l\'échangeur : à vitesse variable sur la pression différentielle du réseau secondaire, en marche dès qu\'un circuit est en demande ; défaut variateur reporté.');
    if (avecEchangeur(e) && [e.pompeEchPrim, e.pompeEchSec].includes('existante')) af.push('Pompe existante reliée à l\'échangeur : son autorisation de marche est asservie à la demande de l\'échangeur (contact sec ou ordre par la GTB) ; vérifier sa régulation existante.');
    if (d.ppIntegree) af.push('Pompe primaire intégrée au générateur : commandée par sa propre régulation (marche, post-circulation, protection antigel) ; l\'automate autorise le générateur et lit son état et ses défauts.');
    if (d.ppDeportees && !/^echangeur/.test(d.gk || g(e))) af.push(`Pompes primaires asservies à leur générateur, avec post-circulation de 5 min à l'arrêt${d.bouteille && /cond|pac/.test(g(e)) ? ' ; vitesse variable pour limiter le débit primaire et garder un retour froid' : ''}.`);
    if (!d.pompesInd && d.n > 1) { af.push('Vannes d\'isolement motorisées : ouverture avant le démarrage du générateur, fermeture après sa post-circulation ; un générateur à l\'arrêt n\'est pas irrigué.'); if (d.bouteille) { pt('PP', 'Commande de la pompe primaire commune', 'STOR'); pt('PP', 'Défaut de la pompe primaire commune', 'ETOR'); pt('PP', 'Vitesse de la pompe primaire commune', 'SA'); } }
    const orgD = d.decouplage === 'ballon' ? 'ballon' : 'bouteille';
    pt('TD', d.bouteille ? `Température de départ commun (aval ${orgD})` : 'Température du collecteur de départ', 'EA'); pt('TR', d.bouteille ? `Température de retour commun (amont ${orgD})` : 'Température du collecteur de retour', 'EA');
    // Ballons (éléments) : charge, décharge et stratification, une sonde par position
    (d.ballons || []).forEach(b => {
      af.push(afBallon(b, d));
      b.sondes.forEach(so => pt(`${b.rep}-T${so[0].toUpperCase()}`, `Température ${SONDES[so]} du ballon ${b.rep}`, 'EA'));
    });
    // Évacuation de la chaleur (aéroréfrigérant, tour) : température de condensation ou de boucle, by-pass hivernal, antigel
    if (d.evac) afEvacuation(d.evac, af, pt);
    pt('PI', 'Pression de l\'installation', 'EA', `Alarme basse sous ${nf(1, 1)} bar (réglable)`);
    if (d.chaud && d.Pg > 300) pt('MDE', 'Sécurité de manque d\'eau', 'ETOR', 'Coupe les générateurs');
    // Circuits
    d.circuits.forEach((c, i) => {
      const k = i + 1, nom = `circuit ${k} (${c.rep})`, rc = c.rc, loi = rc[0] > rc[1] && ['radiateurs', 'plancher', 'radiant', 'aerotherme'].includes(c.emetteur);
      const base = depMini(e, c), txt = [], arret = num(e.nonChauffage, 17);
      if (loi && montage(c.reg).vanne) txt.push(`loi d'eau : départ à ${rc[0]} °C pour ${Tb} °C extérieur, ${base} °C pour 18 °C extérieur (courbe réglable, influence de la température ambiante possible)`);
      if (c.emetteur === 'cta') txt.push(`vanne pilotée par la régulation de la CTA (température de soufflage ou de reprise), pompe autorisée sur demande de la CTA${d.chaud ? ', protection antigel : vanne ouverte et pompe en marche si l\'air descend sous 5 °C' : ', déshumidification possible'}`);
      if (c.emetteur === 'ventilo') txt.push('vannes 2 voies sur chaque ventilo-convecteur commandées par les régulateurs terminaux, pompe à vitesse variable à pression différentielle constante, soupape différentielle en bout de réseau');
      if (c.emetteur === 'ecs') txt.push('charge du ballon sur demande de sa sonde (consigne 60 °C, différentiel 5 K), priorité ECS réglable, choc thermique hebdomadaire à 70 °C');
      if (c.emetteur === 'plancher') txt.push(`thermostat de sécurité sur le départ coupant la pompe (${d.chaud ? '50 °C' : 'sans objet'})`);
      if (c.emetteur === 'plafond') txt.push('départ régulé au-dessus du point de rosée ambiant (sonde d\'hygrométrie), détecteur de condensation fermant la vanne');
      if (c.emetteur === 'process') txt.push('consigne fixe donnée par le process, marche autorisée par le process');
      if (c.emetteur === 'sousstation') txt.push('pression différentielle disponible maintenue en tête de réseau');
      if (c.reg === '2v' && c.emetteur !== 'ventilo') txt.push('pompe à vitesse variable à pression différentielle constante, soupape différentielle (by-pass) en bout de circuit');
      if (AF_MONTAGES[c.reg]) txt.push(AF_MONTAGES[c.reg](c, d));
      if (d.chaud && !['ecs', 'cta', 'process'].includes(c.emetteur)) txt.push(`arrêt de la pompe et fermeture de la vanne au-delà de ${arret} °C extérieur (réglable)`);
      af.push(`Circuit ${k} — ${c.rep} (${c.em[0].split(' (')[0]}, ${REGULATIONS[c.reg].toLowerCase()}) : ${txt.join(' ; ') || 'marche selon la programmation horaire'}.`);
      pt(`TD${k}`, `Température de départ du ${nom}`, 'EA');
      if (montage(c.reg).vanne) pt(`V${k}`, `Vanne de régulation du ${nom}`, 'SA', '0-10 V');
      if (montage(c.reg).pp) { pt(`PCP${k}`, `Commande de la pompe primaire du ${nom}`, 'STOR'); pt(`PCP${k}`, `Défaut de la pompe primaire du ${nom}`, 'ETOR'); }
      pt(`PC${k}`, `Commande de la pompe du ${nom}`, 'STOR'); pt(`PC${k}`, `Défaut de la pompe du ${nom}`, 'ETOR');
      if (c.reg === '2v' || c.emetteur === 'ventilo') pt(`PC${k}`, `Vitesse de la pompe du ${nom}`, 'SA', 'ou consigne Δp par bus');
      if (c.emetteur === 'plancher') pt(`TS${k}`, `Thermostat de sécurité du ${nom}`, 'ETOR');
      if (c.emetteur === 'ecs') pt(`TB${k}`, 'Température du ballon d\'ECS', 'EA');
      if (c.emetteur === 'cta') pt(`DC${k}`, `Demande de la CTA (${c.rep})`, 'ETOR');
      if (c.emetteur === 'plafond') pt(`HR${k}`, 'Hygrométrie ambiante / détecteur de condensation', 'EA');
      if (e.compteurs === 'oui') pt(`CE${k}`, `Compteur d'énergie du ${nom}`, 'Bus', 'M-Bus ou Modbus');
    });
    af.push(`Programmation horaire par circuit : confort, réduit (abaissement de ${nf(red, 0)} K${d.chaud ? '' : ' ou arrêt'}) et hors gel ; relance optimisée selon la température extérieure.`);
    af.push('Hors gel : pompes en marche en dessous de 3 °C extérieur ; dégommage des pompes et des vannes 30 s par semaine en période d\'arrêt.');
    af.push('Alarmes remontées : défauts des générateurs et des pompes, pression basse, sécurités, écart de température prolongé par rapport à la consigne.');
    if (e.gtb && e.gtb !== 'aucune') af.push(`Communication ${e.gtb} avec la GTB : états, défauts, consignes, mesures et comptages, historiques ; suivi et comparaison des consommations, détection des dérives (exigences du décret BACS).`);
    const types = ['EA', 'SA', 'ETOR', 'STOR', 'Bus'], nb = t => pts.filter(p => p[2] === t).length;
    const total = types.map(t => [t, nb(t)]).filter(([, n]) => n);
    return [
      { titre: 'Analyse fonctionnelle', liste: af },
      { titre: 'Liste des points (automate / GTB)', tableau: { entetes: ['Repère', 'Désignation', 'Type', 'Remarque'], lignes: pts } },
      { titre: 'Récapitulatif des entrées / sorties', tableau: { entetes: ['Type', 'Nombre', 'Avec 20 % de réserve'], lignes: [...total.map(([t, n]) => [{ EA: 'Entrées analogiques (EA)', SA: 'Sorties analogiques (SA)', ETOR: 'Entrées tout-ou-rien (ETOR)', STOR: 'Sorties tout-ou-rien (STOR)', Bus: 'Équipements communicants (bus)' }[t], String(n), String(Math.ceil(n * 1.2))]),
        ['Total', String(pts.length), String(total.reduce((a, [, n]) => a + Math.ceil(n * 1.2), 0))]], total: true } },
    ];
  }
  const g = e => e.generateur || '';
  const kvsTxt = c => (c.kvs ? `${nf(c.kvs, c.kvs < 1 ? 2 : 1)}${c.kvsImpose ? ' (retenu)' : ''}` : '—');
  const autoriteTxt = c => (c.autorite === null || c.autorite === undefined ? '—' : `${nf(c.autorite, 2)}${c.autorite < 0.5 ? ' ⚠' : ''}`);
  // Analyse fonctionnelle par montage hydraulique de circuit (montages autres que vanne 3 voies, 2 voies et direct)
  const AF_MONTAGES = {
    injection3: c => `injection par vanne 3 voies : la pompe primaire PCP fait circuler le primaire du circuit en permanence (débit ${nf(c.prim ? c.prim.Q : c.Qcoll, 2)} m³/h), la vanne 3 voies dose l'eau injectée dans la boucle secondaire à travers le by-pass neutre, la pompe secondaire PC assure le débit de l'émetteur ; autorité de la vanne ${nf(c.autorite || 0, 2)}`,
    injection2: c => `injection par vanne 2 voies : la pression différentielle du collecteur fait circuler le primaire, la vanne 2 voies dose l'eau injectée, le by-pass neutre (sans clapet) recycle le retour ; pompe secondaire PC à débit constant ; autorité de la vanne ${nf(c.autorite || 0, 2)}`,
    decharge: c => `montage en décharge : la vanne 3 voies répartitrice dérive vers le retour l'eau non utilisée, débit constant au collecteur et débit variable dans l'émetteur (régulation de puissance à température de départ constante) ; autorité de la vanne ${nf(c.autorite || 0, 2)}`,
    bouteille: c => `bouteille de découplage du circuit : pompe primaire PCP (${nf(c.prim ? c.prim.Q : c.Q, 2)} m³/h) asservie à la demande du circuit, pompe secondaire PC indépendante ; débit primaire réglé au moins égal au débit secondaire pour ne pas recycler le retour`,
    echangeur: (c, d) => `échangeur de circuit : la vanne 2 voies du primaire tient la température de départ secondaire (${c.rc[0]} °C), pompe primaire PCP en marche sur demande avec post-circulation 3 min, pompe secondaire PC ; sécurité de ${d.chaud ? 'surchauffe' : 'gel'} du secondaire coupant la vanne primaire ; vase d'expansion et soupape côté secondaire`,
  };
  // Analyse fonctionnelle et points de l'évacuation de la chaleur
  function afEvacuation(ev, af, pt) {
    const aero = ev.type === 'aero', cond = ev.mode === 'condenseur', R = aero ? 'AR' : 'TRF', app = aero ? 'l\'aéroréfrigérant' : 'la tour';
    const glycol = /glycol/i.test(ev.fluideLib || '');
    af.push(`${ev.lib} (${cond ? 'condenseur du groupe froid eau/eau' : 'boucle d\'eau tempérée en été'}, ${nf(ev.P, 0)} kW) : ${cond ? 'la température de condensation (eau sortant de ' + app + ', consigne ' + ev.Tf + ' °C, abaissée par temps frais pour améliorer l\'EER sans descendre sous le minimum du groupe)' : 'la température de la boucle (consigne haute ' + ev.Tf + ' °C : au-delà, ' + app + ' est mis en service)'} est tenue par la vitesse des ventilateurs (${ev.nVent} ventilateur(s) à vitesse variable, enclenchés en cascade puis modulés) ; pompe PEV en marche ${cond ? 'avec le groupe froid (asservie, retour de marche contrôlé, post-circulation 3 min)' : 'dès que la boucle dépasse sa consigne haute'}.`);
    af.push(`By-pass hivernal : par temps froid, les ventilateurs sont arrêtés en premier puis la vanne 3 voies VBP dérive l'eau autour de ${app} pour garder ${cond ? 'une température d\'eau minimale à l\'entrée du condenseur (pression de condensation mini du groupe)' : 'la boucle au-dessus de sa consigne basse'} ; ${app} reste irrigué au débit minimal.`);
    af.push(aero ? (glycol ? `Antigel : circuit de refroidissement en ${String(ev.fluideLib).toLowerCase()} (aéroréfrigérant extérieur) ; contrôle annuel de la concentration, vase d'expansion et soupape propres au circuit glycolé${ev.ech ? ', échangeur intermédiaire avec la boucle' : ''}.`
      : 'Antigel : eau non glycolée — vidange automatique de l\'aéroréfrigérant (vannes motorisées) sous 3 °C extérieur à l\'arrêt, ou traçage ; alarme sur température d\'eau < 4 °C.')
      : 'Tour : appoint d\'eau sur niveau bas, purge de déconcentration sur conductivité, traitement d\'eau (biocide, anti-tartre) et analyses de légionelles ; arrêt et alarme sur défaut de traitement ; bassin protégé du gel (résistance) l\'hiver.');
    pt(R, `Commande des ventilateurs de ${app}`, 'STOR'); pt(R, `Vitesse des ventilateurs de ${app}`, 'SA', '0-10 V (variateurs ou moteurs EC)'); pt(R, `Défaut des ventilateurs de ${app}`, 'ETOR');
    pt('PEV', 'Commande de la pompe du circuit de refroidissement', 'STOR', cond ? 'Asservie au groupe froid' : 'Sur consigne haute de la boucle'); pt('PEV', 'Défaut de la pompe du circuit de refroidissement', 'ETOR');
    pt('TEV', `Température de l'eau sortant de ${app}`, 'EA'); pt('VBP', 'Vanne 3 voies de by-pass hivernal', 'SA', '0-10 V');
    if (!aero) { pt('LT', 'Niveau bas du bassin de la tour (appoint d\'eau)', 'ETOR'); pt('TRT', 'Défaut du traitement d\'eau de la tour', 'ETOR'); }
    else if (!glycol) pt('TEVG', 'Température d\'eau mini dans l\'aéroréfrigérant (antigel, vidange)', 'EA');
  }
  // Analyse fonctionnelle d'un ballon (élément) : charge, décharge, stratification
  function afBallon(b, d) {
    const ch = d.chaud, haut = ch ? 'haute' : 'basse', bas = ch ? 'basse' : 'haute', ou = b.circuit ? `sur le circuit ${b.circuit}` : 'à la production';
    const s = b.sondes.map(x => SONDES[x]).join(', ');
    const charge = b.fonction === 'ecs' ? `charge sur demande de la sonde ${b.sondes.includes('milieu') ? 'médiane' : 'du ballon'} (60 °C, différentiel 5 K), choc thermique hebdomadaire à 70 °C`
      : b.fonction === 'stockage' ? `charge (stockage) en période favorable (heures creuses, récupération, surplus de production) jusqu'à ce que la sonde ${bas} atteigne la consigne de stockage ; décharge prioritaire sur la production tant que la sonde ${haut} dépasse la consigne de départ ; état de charge suivi par les sondes ${s || '—'}`
        : b.fonction === 'decouplage' ? `découplage hydraulique (4 piquages : départs en haut, retours en bas) ; production enclenchée sur la sonde ${haut} et arrêtée sur la sonde ${bas}`
          : `production enclenchée quand la sonde ${haut} s'écarte de la consigne et arrêtée quand la sonde ${bas} l'atteint (anti-courts-cycles)`;
    return `Ballon ${b.rep} (${b.lib.toLowerCase()}, ${nf(b.V, 0)} L, ${b.piquages} piquages, ${ou}) : ${charge} ; stratification préservée : eau ${ch ? 'chaude en haut' : 'froide en bas'}, vitesse dans le ballon ≤ 0,1 m/s (Ø intérieur mini ${nf(b.Dmin, 0)} mm), piquages avec diffuseurs${b.piquages === '2' ? ', montage en série (charge et décharge par les mêmes piquages)' : ', charge et décharge par des piquages séparés'}.`;
  }
  // Analyse fonctionnelle et points d'une production hétérogène : priorité base → relève → appoint, secours en défaut
  function afGenerateurs(d, e, af, pt, perm) {
    const par = r => d.multi.filter(x => x.role === r).map(x => x.rep), seuil = num(e.seuilReleve, 3), tempo = num(e.tempoReleve, 10);
    const ordre = ['base', 'releve', 'appoint'].filter(r => par(r).length).map(r => `${ROLES[r].toLowerCase()} (${par(r).join(', ')})`);
    af.push(`Production de ${d.multi.length} générateurs : ordre de priorité ${par('recuperation').length ? `récupération (${par('recuperation').join(', ')}, prioritaire quand elle est disponible) → ` : ''}${ordre.join(' → ') || '—'}${par('secours').length ? ` ; secours (${par('secours').join(', ')}) enclenché uniquement en cas de défaut ou d'indisponibilité d'un générateur` : ''}.`);
    if (par('releve').length || par('appoint').length) af.push(`Relève et appoint : enclenchés dans l'ordre lorsque la température de départ reste sous la consigne de plus de ${nf(seuil, 1)} K pendant ${nf(tempo, 0)} min avec les générateurs précédents à pleine charge ; délestés dans l'ordre inverse (départ au-dessus de la consigne + 2 K pendant 5 min).`);
    const bival = bivalence(d);
    if (bival) af.push(`Bivalence ${e.bivalence === 'alternatif' ? 'alternative' : 'parallèle'} : au-dessous de ${nf(num(e.Tbivalence, -3), 0)} °C extérieur (température de bivalence), ${bival.map(x => x.rep).join(', ')} ${e.bivalence === 'alternatif' ? 'remplace la PAC, arrêtée' : 'complète la PAC, qui reste prioritaire'} ; au-dessus, la PAC assure seule les besoins tant que la consigne est tenue.`);
    if (d.multi.some(x => x.regime)) af.push(`Régimes propres : ${d.multi.filter(x => x.regime).map(x => `${x.rep} ${x.regime[0]}/${x.regime[1]} °C`).join(', ')} ; la consigne de chaque générateur est limitée à son régime.`);
    if (d.multi.length > 1) af.push(`Permutation entre générateurs de même rôle toutes les ${nf(perm, 0)} h de fonctionnement ; un générateur en défaut sort de la séquence et le suivant (ou le secours) prend le relais.`);
    d.multi.forEach((x, i) => {
      const nom = `${x.rep} (${ROLES[x.role].toLowerCase()})`;
      pt(x.rep, `Autorisation de marche du générateur ${nom}`, 'STOR'); pt(x.rep, `Consigne ou modulation du générateur ${nom}`, 'SA', '0-10 V ou bus constructeur'); pt(x.rep, `État de marche du générateur ${nom}`, 'ETOR'); pt(x.rep, `Défaut du générateur ${nom}`, 'ETOR');
      if (x.pp) { pt(`PP${i + 1}`, `Commande de la pompe primaire de ${x.rep}`, 'STOR', 'Post-circulation 5 min'); pt(`PP${i + 1}`, `Défaut de la pompe primaire de ${x.rep}`, 'ETOR'); }
      else if (!d.pompesInd) { pt(`VM${i + 1}`, `Vanne d'isolement motorisée de ${x.rep}`, 'STOR'); pt(`VM${i + 1}`, `Fin de course de la vanne de ${x.rep}`, 'ETOR'); }
    });
  }
  // PAC de base avec relève ou appoint non thermodynamique : générateurs d'appoint (bivalence), sinon null
  function bivalence(d) {
    if (!d.multi || !d.multi.some(x => /^pac/.test(x.type) && x.role === 'base')) return null;
    const app = d.multi.filter(x => ['releve', 'appoint'].includes(x.role) && !/^pac/.test(x.type));
    return app.length ? app : null;
  }

  /* ---------- Type de note ---------- */
  const optListe = t => Object.entries(t).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]);
  const avecEchangeur = e => e.bouteille === 'echangeur' || /^echangeur/.test(e.generateur || '');
  const evacOn = e => !!EVACUATIONS[e.evacuation] && !!modeEvacuation(e);
  // Production hétérogène saisie (lignes de générateurs valides), nombre de générateurs, rôles présents
  const multiSaisi = e => (e.generateurs || []).filter(x => x && GENERATEURS[x.type] && num(x.P) > 0);
  const nbGen = e => multiSaisi(e).length || num(e.nGen, 1);
  const roleSaisi = (e, r) => multiSaisi(e).some(x => (x.role || 'base') === r);
  const pacAvecAppoint = e => { const l = multiSaisi(e); return l.some(x => /^pac/.test(x.type) && (x.role || 'base') === 'base') && l.some(x => ['releve', 'appoint'].includes(x.role) && !/^pac/.test(x.type)); };
  // Pompes existantes de l'étude : réseaux et pompes, réseaux arborescents (pompe du réseau), circuits des schémas
  const optPompesEtude = (e, et, v) => [['', '—'], ...(et ? (et.notes || []).map((n, i) => [n, i]).flatMap(([n, i]) => n.type === 'reseau' ? [[`reseau|${n.id}`, `N${i + 1} — ${n.titre}`]]
    : n.type === 'arbo' ? [[`arbo|${n.id}`, `N${i + 1} — pompe de ${n.titre}`]]
      : n.type === 'pid' ? ((n.entrees || {}).circuits || []).filter(c => c && c.rep).map(c => [`pid|${n.id}|${c.rep}`, `N${i + 1} — pompe du circuit ${c.rep}`]) : []) : v ? [[v, v]] : [])];
  // Réseaux annexes proposés à un circuit : réseaux arborescents, réseaux et pompes, CTA, et autres schémas de principe
  // (sous-station, boucle secondaire) ; jamais le schéma lui-même, un schéma déjà en amont (boucle) ni un schéma déjà
  // alimenté par un autre circuit (sauf la valeur de la ligne)
  const avalDe = (notes, pid, vus = new Set()) => { ((pid.entrees || {}).circuits || []).forEach(c => { const n = c && c.annexe && notes.find(x => x.id === c.annexe && x.type === 'pid'); if (n && !vus.has(n.id)) { vus.add(n.id); avalDe(notes, n, vus); } }); return vus; };
  function optAnnexes(e, et, ligne) {
    const notes = (et && et.notes) || [], v = ligne && ligne.annexe;
    // Schéma en cours de saisie : même objet, mêmes circuits, sinon mêmes repères de circuits et même installation
    const reps = x => ((x && x.circuits) || []).map(c => String((c && c.rep) || '').trim()).join('|');
    const soi = notes.filter(n => n.type === 'pid' && (n.entrees === e || (n.entrees && n.entrees.circuits && n.entrees.circuits === (e && e.circuits))
      || (reps(n.entrees) === reps(e) && String((n.entrees || {}).titreInstallation || '') === String((e && e.titreInstallation) || '')) || ((n.entrees || {}).circuits || []).includes(ligne)));
    const alimentes = new Set(notes.filter(n => n.type === 'pid').flatMap(n => ((n.entrees || {}).circuits || []).map(c => c && c.annexe).filter(Boolean)));
    const permis = n => n.type !== 'pid' || n.id === v || (!soi.includes(n) && !soi.some(s => avalDe(notes, n).has(s.id)) && !alimentes.has(n.id));
    return [['', '—'], ...notes.map((n, i) => [n, i]).filter(([n]) => ['arbo', 'reseau', 'cta', 'pid'].includes(n.type) && !n.lien && permis(n))
      .map(([n, i]) => [n.id, `N${i + 1} — ${n.type === 'pid' ? '🏭 ' : ''}${n.titre}`])];
  }
  N.TYPES.pid = {
    titre: 'Schéma de principe hydraulique (P&ID) eau chaude / eau glacée', icone: '🗺️', famille: 'Schémas',
    description: 'Production (un générateur ou une cascade), bouteille de découplage ou non, collecteurs et circuits vers les émetteurs : schéma dessiné automatiquement, débits, diamètres, pompes, vannes et bouteille dimensionnés.',
    champs: [{ g: 'Réseau' }, { k: 'titreInstallation', l: 'Installation', t: 't', d: 'Chaufferie bâtiment A' },
      { k: 'reseau', l: 'Régime', t: 's', o: optListe(REGIMES), d: 'ch-70-50' },
      { k: 'Tdep', l: 'Température de départ', u: '°C', d: 70, si: e => e.reseau === 'perso' }, { k: 'Tret', l: 'Température de retour', u: '°C', d: 50, si: e => e.reseau === 'perso' },
      { k: 'TdepC', l: 'Chauffage : départ', u: '°C', d: 45, si: e => e.reseau === 'co' }, { k: 'TretC', l: 'Chauffage : retour', u: '°C', d: 40, si: e => e.reseau === 'co' },
      { k: 'TdepF', l: 'Climatisation : départ', u: '°C', d: 7, si: e => e.reseau === 'co' }, { k: 'TretF', l: 'Climatisation : retour', u: '°C', d: 12, si: e => e.reseau === 'co' },
      { k: 'fluide', l: 'Fluide', t: 's', o: () => N.optFluides().filter(([k]) => k !== 'perso'), d: 'eau' },
      { k: 'serie', l: 'Série de tubes', t: 's', o: Object.entries(D.SERIES).map(([k, s]) => [k, s.libelle]), d: 'acier-10216' },
      { k: 'vmax', l: 'Vitesse maximale', u: 'm/s', d: 1.5 }, { k: 'Rmax', l: 'Perte de charge linéique maximale', u: 'Pa/m', d: 150 },
      { g: 'Production' }, { k: 'generateur', l: 'Générateur', t: 's', o: optListe(GENERATEURS), d: 'chaudiere-cond' },
      { k: 'nGen', l: 'Nombre de générateurs', t: 's', o: [['1', '1 générateur (sans cascade)'], ['2', '2 en cascade'], ['3', '3 en cascade'], ['4', '4 en cascade'], ['5', '5 en cascade'], ['6', '6 en cascade']], d: '2', si: e => !multiSaisi(e).length },
      { k: 'Pgen', l: 'Puissance unitaire (chauffage en change-over)', u: 'kW', d: 150, si: e => !multiSaisi(e).length },
      { k: 'PgenF', l: 'Puissance frigorifique unitaire', u: 'kW', d: 130, si: e => e.reseau === 'co' },
      // Production hétérogène : un générateur par ligne (remplace générateur × nombre quand la liste est remplie)
      { k: 'generateurs', l: 'Générateurs détaillés (production hétérogène : base, relève, appoint, secours, récupération) — vide : générateur × nombre ci-dessus', t: 'lignes', d: [],
        colonnes: [{ k: 'rep', l: 'Repère (vide : G1, PAC2…)', t: 't' }, { k: 'type', l: 'Type', t: 's', o: [['', '—'], ...optListe(GENERATEURS)] }, { k: 'P', l: 'Puissance (kW)' },
          { k: 'role', l: 'Rôle', t: 's', o: Object.entries(ROLES) }, { k: 'pompe', l: 'Pompe primaire', t: 's', o: [['', 'Déportée (à notre charge)'], ['integree', 'Intégrée au générateur']] },
          { k: 'regime', l: 'Régime propre (« 55/45 », vide = réseau)', t: 't' },
          { k: 'dp', l: 'ΔP côté eau (kPa ; vide : forfait chaudière 10, PAC/GF 40, échangeur 20)' }, { k: 'Pf', l: 'Puissance froid (kW, change-over ; vide = P)', si: e => e.reseau === 'co' }, { k: 'alim', l: 'Alimenté par', t: 's', o: (e, et) => (typeof Terminaux !== 'undefined' ? Terminaux : require('./terminaux')).optAlim(e, et) }] },
      { k: 'pompeGen', l: 'Pompe primaire du générateur', t: 's', o: [['', 'Déportée (fournie, câblée et pilotée par nous)'], ['integree', 'Intégrée au générateur / au groupe (kit hydraulique du fabricant)']], d: '' },
      { k: 'dpGen', l: 'Perte de charge du générateur côté eau (vide : forfait chaudière 10, PAC/GF 40, échangeur 20 kPa ; « 📄 Fiche technique » la remplit)', u: 'kPa', d: '', si: e => !multiSaisi(e).length },
      { k: 'pompeRecup', l: 'Pompe du circuit de récupération', t: 's', o: [['', 'Déportée (fournie, câblée et pilotée par nous)'], ['integree', 'Intégrée au groupe froid']], d: '', si: e => /^(gf|pac-rev)/.test(e.generateur || '') && !!e.recupGf },
      { k: 'pompesPrim', l: 'Pompes de la cascade', t: 's', o: [['individuelles', 'Une pompe et un clapet par générateur'], ['commune', 'Pompe primaire commune et vannes motorisées']], d: 'individuelles', si: e => nbGen(e) > 1 },
      { k: 'tichelmann', l: 'Raccordement des générateurs', t: 's', o: [['non', 'Direct'], ['oui', 'En Tichelmann (retour inversé)']], d: 'non', si: e => nbGen(e) > 1 },
      { k: 'bouteille', l: 'Découplage production / distribution', t: 's', o: [['oui', 'Bouteille de découplage (4 piquages)'], ['bouteille3', 'Bouteille de découplage 3 piquages (retour commun)'], ['ballon', 'Ballon tampon de découplage (à la place de la bouteille)'], ['echangeur', 'Échangeur à plaques (circuits séparés)'], ['non', 'Aucun (raccordement direct)']], d: 'oui' },
      // Échangeur (sous-station ou découplage) : pompes primaire et secondaire ajoutées, ou pompe existante d'un réseau reliée
      { k: 'pompeEchPrim', l: 'Pompe primaire de l\'échangeur', t: 's', o: [['', 'Selon le montage (pompes des générateurs ; sous-station : pression du réseau primaire)'], ['ajouter', 'Pompe primaire à ajouter (à notre charge)'], ['existante', 'Pompe existante d\'un réseau (reliée)']], d: '', si: avecEchangeur },
      { k: 'pompeEchPrimLien', l: 'Pompe existante côté primaire', t: 's', o: (e, et) => optPompesEtude(e, et, e.pompeEchPrimLien), d: '', si: e => avecEchangeur(e) && e.pompeEchPrim === 'existante' },
      { k: 'pompeEchSec', l: 'Pompe secondaire de l\'échangeur', t: 's', o: [['', 'Pompes des circuits (pas de pompe secondaire générale)'], ['ajouter', 'Pompe secondaire à ajouter (à notre charge)'], ['existante', 'Pompe existante d\'un réseau (reliée)']], d: '', si: avecEchangeur },
      { k: 'pompeEchSecLien', l: 'Pompe existante côté secondaire', t: 's', o: (e, et) => optPompesEtude(e, et, e.pompeEchSecLien), d: '', si: e => avecEchangeur(e) && e.pompeEchSec === 'existante' },
      { k: 'pincement', l: 'Pincement de l\'échangeur', u: 'K', d: 3, si: e => e.bouteille === 'echangeur' || sousStation(e) },
      { k: 'dpEchPrim', l: 'Perte de charge de l\'échangeur côté primaire (fiche ; vide : forfait 20 kPa)', u: 'kPa', d: '', si: avecEchangeur },
      { k: 'dpEchSec', l: 'Perte de charge de l\'échangeur côté secondaire (fiche ; vide : forfait 20 kPa)', u: 'kPa', d: '', si: avecEchangeur },
      { k: 'kvsVannePrim', l: 'Kvs de la vanne de régulation primaire de la sous-station (vide : forfait 20 kPa)', d: '', si: e => sousStation(e) },
      { k: 'dpBouteille', l: 'Perte de charge de la bouteille / du ballon de découplage (vide : forfait 1 kPa)', u: 'kPa', d: '', si: e => ['oui', 'bouteille3', 'ballon'].includes(e.bouteille) },
      // Schéma alimenté par le circuit d'un autre schéma (sous-station, boucle d'eau tempérée) : repris du circuit amont
      { k: 'regimePrim', l: 'Régime primaire de l\'échangeur ou de la boucle (départ/retour, « 90/70 » ; repris du circuit amont)', t: 't', d: '', si: e => sousStation(e) || sourceBoucle(e) },
      { k: 'fluidePrim', l: 'Fluide du primaire', t: 's', o: () => [['', 'Comme le réseau'], ...N.optFluides().filter(([k]) => k !== 'perso')], d: '', si: e => sousStation(e) || sourceBoucle(e) },
      { k: 'dpDispo', l: 'Pression différentielle disponible au raccordement (circuit amont)', u: 'kPa', d: '', si: e => e.dpDispo !== '' && e.dpDispo !== undefined && e.dpDispo !== null },
      { k: 'tampon', l: 'Ballon tampon en série', t: 's', o: [['non', 'Sans'], ['oui', 'Sur le retour (avant les générateurs)'], ['depart', 'Sur le départ (après les générateurs)']], d: 'non', si: e => e.bouteille !== 'ballon' },
      { k: 'ratioTampon', l: 'Volume d\'eau minimal exigé par le constructeur', u: 'L/kW', d: 10, si: e => ['oui', 'depart'].includes(e.tampon) || e.bouteille === 'ballon' },
      { k: 'Vtampon', l: 'Volume du ballon imposé (vide : calculé)', u: 'L', d: '', si: e => ['oui', 'depart'].includes(e.tampon) || e.bouteille === 'ballon' },
      // Ballons comme éléments du schéma (en plus du ballon tampon ci-dessus) : production ou circuit
      { k: 'ballons', l: 'Ballons (tampon, stockage, ECS, découplage) : volume vide = calculé', t: 'lignes', d: [],
        colonnes: [{ k: 'rep', l: 'Repère (vide : BAL1…)', t: 't' }, { k: 'fonction', l: 'Fonction', t: 's', o: Object.entries(BALLONS).map(([k, b]) => [k, b[0]]) },
          { k: 'V', l: 'Volume (L, vide : calculé)' }, { k: 'position', l: 'Position', t: 's', o: e => [['production', 'Production (collecteurs)'], ...(e.circuits || []).map((c, i) => c.rep || `C${i + 1}`).map(r => [`circuit:${r}`, `Circuit ${r}`])] },
          { k: 'piquages', l: 'Piquages', t: 's', o: [['', 'Selon la fonction'], ['2', '2 piquages'], ['4', '4 piquages']] },
          { k: 'sondes', l: 'Sondes', t: 's', o: [['', 'Selon la fonction'], ['haut,bas', 'Haut et bas'], ['haut,milieu,bas', 'Haut, milieu et bas'], ['haut', 'Haut'], ['milieu', 'Milieu'], ['bas', 'Bas'], ['aucune', 'Aucune']] },
          { k: 'ratio', l: 'Ratio (L/kW ; tampon, ECS)' }, { k: 'duree', l: 'Durée de stockage (h)' }] },
      { k: 'sourceEau', l: 'Source d\'eau de la PAC / du groupe eau-eau', t: 's', o: [['forage', 'Nappe : forage de pompage et puits de rejet, échangeur de barrage'], ['boucle', 'Boucle d\'eau fermée (géothermie, boucle tempérée)']], d: 'forage', si: e => /-eau$/.test(e.generateur || '') },
      // Groupe froid avec récupération d'énergie : chaleur rejetée au condenseur reprise par un schéma de principe chaud
      { k: 'recupGf', l: 'Récupération d\'énergie sur le groupe froid', t: 's', o: [['', 'Sans récupération'], ['desurchauffeur', 'Désurchauffeur (récupération partielle, ≈ 15 % de la chaleur rejetée)'], ['totale', 'Récupération totale au condenseur (100 % de la chaleur rejetée)']], d: '', si: e => /^(gf|pac-rev)/.test(e.generateur || '') },
      { k: 'eerRecup', l: 'EER du groupe en récupération', d: 3.5, si: e => /^(gf|pac-rev)/.test(e.generateur || '') && !!e.recupGf },
      { k: 'regimeRecup', l: 'Régime de l\'eau récupérée (départ/retour)', t: 't', d: '45/40', si: e => /^(gf|pac-rev)/.test(e.generateur || '') && !!e.recupGf },
      { k: 'recupDe', l: 'Récupération de chaleur d\'un groupe froid (schéma de principe froid)', t: 's', o: (e, et) => [['', '—'], ...(et ? (et.notes || []).map((n, i) => [n, i]).filter(([n]) => n.type === 'pid' && (n.entrees || {}).recupGf).map(([n, i]) => [n.id, `N${i + 1} — ${n.titre}`]) : e.recupDe ? [[e.recupDe, e.recupDe]] : [])], d: '', si: e => (GENERATEURS[e.generateur] || [])[1] !== 'froid' },
      { k: 'Precup', l: 'Chaleur récupérée disponible (reprise du schéma froid)', u: 'kW', d: '', si: e => !!e.recupDe },
      { k: 'dpSource', l: 'Perte de charge de l\'évaporateur / du condenseur côté source (boucle, refroidissement ; vide : forfait 30 kPa)', u: 'kPa', d: '', si: e => sourceBoucle(e) || modeEvacuation(e) === 'condenseur' },
      // Évacuation de la chaleur : aéroréfrigérant ou tour, sur le condenseur d'un groupe froid eau/eau ou la boucle d'eau tempérée
      { k: 'evacuation', l: 'Évacuation de la chaleur (condenseur du groupe froid eau/eau, boucle d\'eau tempérée en été)', t: 's', o: [['', 'Sans'], ...Object.entries(EVACUATIONS)], d: '', si: e => !!modeEvacuation(e) || !!e.evacuation },
      { k: 'Pevac', l: 'Puissance à évacuer (vide : froid × (1 + 1/EER) ou excédent de la boucle)', u: 'kW', d: '', si: evacOn },
      { k: 'eerEvac', l: 'EER du groupe froid (vide : COP/EER ci-dessous, sinon 4,5)', d: '', si: e => evacOn(e) && modeEvacuation(e) === 'condenseur' },
      { k: 'regimeEvac', l: 'Régime de l\'eau de refroidissement (entrée/sortie, « 45/40 » ; vide : selon le type)', t: 't', d: '', si: evacOn },
      { k: 'TextEvac', l: 'Température extérieure de dimensionnement (vide : air sec 35 °C pour l\'aéro, bulbe humide 24 °C pour la tour)', u: '°C', d: '', si: evacOn },
      { k: 'fluideEvac', l: 'Fluide du circuit de refroidissement', t: 's', o: () => [['', 'Selon le type (aéro : eau glycolée 30 %, tour : eau)'], ...N.optFluides().filter(([k]) => k !== 'perso')], d: '', si: evacOn },
      { k: 'dpEvac', l: 'Perte de charge de l\'aéroréfrigérant / de la tour côté eau (fiche ; vide : forfait 50 / 40 kPa)', u: 'kPa', d: '', si: evacOn },
      { k: 'Levac', l: 'Liaisons du circuit de refroidissement (aller + retour)', u: 'm', d: 40, si: evacOn },
      { k: 'PventEvac', l: 'Puissance électrique des ventilateurs (vide : 2,5 % de la puissance évacuée)', u: 'kW', d: '', si: evacOn },
      { k: 'copForage', l: 'COP (chaud) ou EER (froid) du générateur', d: 4.5, si: e => /-eau$/.test(e.generateur || '') },
      { k: 'dTforage', l: 'Écart de température sur l\'eau de nappe', u: 'K', d: 4, si: e => /-eau$/.test(e.generateur || '') && e.sourceEau !== 'boucle' },
      { k: 'nivDyn', l: 'Niveau dynamique de la nappe (profondeur de pompage)', u: 'm', d: 15, si: e => /-eau$/.test(e.generateur || '') && e.sourceEau !== 'boucle' },
      { k: 'Lforage', l: 'Liaisons forage → échangeur → puits de rejet (aller + retour)', u: 'm', d: 80, si: e => /-eau$/.test(e.generateur || '') && e.sourceEau !== 'boucle' },
      { k: 'pincBarrage', l: 'Pincement de l\'échangeur de barrage', u: 'K', d: 2, si: e => /-eau$/.test(e.generateur || '') && e.sourceEau !== 'boucle' },
      { k: 'dpBarrage', l: 'Perte de charge de l\'échangeur de barrage (côté nappe)', u: 'kPa', d: 30, si: e => /-eau$/.test(e.generateur || '') && e.sourceEau !== 'boucle' },
      { k: 'PelecGen', l: 'Puissance électrique absorbée par générateur (vide : estimée ; « 📄 Fiche technique » la remplit)', u: 'kW', d: '' },
      { k: 'tensionGen', l: 'Tension du générateur', t: 's', o: [['', 'Selon le type'], ['mono', '230 V mono'], ['tri', '400 V tri']], d: '' },
      { k: 'alimProd', l: 'Production alimentée par', t: 's', o: (e, et) => (typeof Terminaux !== 'undefined' ? Terminaux : require('./terminaux')).optAlim(e, et, e.alimProd), d: '' },
      { g: 'Distribution' },
      { k: 'circuits', l: 'Circuits (régime : « 45/35 » si différent du réseau, vide = régime du réseau)', t: 'lignes', d: [
        { rep: 'Radiateurs bureaux', emetteur: 'radiateurs', P: 90, regime: '', regulation: '3v', L: 120 },
        { rep: 'CTA atelier', emetteur: 'cta', P: 80, regime: '', regulation: '3v', L: 60 },
        { rep: 'Plancher vestiaires', emetteur: 'plancher', P: 30, regime: '40/32', regulation: '3v', L: 40 },
        { rep: 'Ballon ECS', emetteur: 'ecs', P: 40, regime: '', regulation: 'direct', L: 20 }],
      colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'emetteur', l: 'Émetteur', t: 's', o: optListe(EMETTEURS) }, { k: 'P', l: 'Puissance (kW)' },
        { k: 'Pf', l: 'Puissance froid (kW)', si: e => e.reseau === 'co' },
        { k: 'bilan', l: 'Puissance reprise de', t: 's', o: (e, ctx) => [['', 'Saisie'], ...((ctx && ctx.notes) || []).map((n, i) => [n, i]).filter(([n]) => n.type === 'bilan').map(([n, i]) => [n.id, `N${i + 1} — ${n.titre}`])] },
        { k: 'annexe', l: 'Réseau annexe relié (réseau, CTA, schéma aval : sous-station, boucle secondaire)', t: 's', o: optAnnexes },
        { k: 'regime', l: 'Régime (°C)', t: 't' }, { k: 'regulation', l: 'Régulation', t: 's', o: optListe(REGULATIONS) }, { k: 'L', l: 'Longueur aller + retour (m)' },
        { k: 'depMini', l: 'Loi d\'eau : départ à 18 °C ext. (°C ; vide = 30, plancher 25)' },
        { k: 'kvsVanne', l: 'Kvs retenu de la vanne (vide : calculé ; « Redimensionner les vannes » le remplit)', si: e => (e.circuits || []).some(c => c && montage(c.regulation).vanne) },
        { k: 'dpEch', l: 'ΔP échangeur de circuit (kPa, « 25 » ou « prim/sec » ; vide : 20)', si: e => (e.circuits || []).some(c => c && c.regulation === 'echangeur') }] },
      { k: 'robinetterie', l: 'Robinetterie et accessoires par circuit (vannes, clapets, filtres…) : ΔP ou Kv de la fiche technique, sinon valeur usuelle ; « 📄 » dans le tableau des fiches charge la fiche', t: 'lignes', d: [],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'circuit', l: 'Circuit', t: 's', o: e => [['', '—'], ...(e.circuits || []).map((c, i) => c.rep || `C${i + 1}`).map(r => [r, r])] },
          { k: 'type', l: 'Organe', t: 's', o: Object.entries(ROBINETTERIE).map(([k, x]) => [k, x[0]]) }, { k: 'dn', l: 'DN (vide : celui du circuit)' }, { k: 'qte', l: 'Quantité sur le circuit' },
          { k: 'kv', l: 'Kv / Kvs (fiche)' }, { k: 'dp', l: 'ΔP (kPa, fiche)' }, { k: 'ref', l: 'Fabricant, référence', t: 't' }] },
      { k: 'pompesFab', l: 'Pompes retenues (fiche du fabricant) : courbe débit:hauteur « Q:H ; Q:H … » en m³/h et mCE (« 📄 » dans le tableau des fiches la lit) — circuits, pompes primaires (PP), d\'échangeur (PECH1, PECH2), de récupération (PREC) et de refroidissement (PEV)', t: 'lignes', d: [],
        colonnes: [{ k: 'circuit', l: 'Circuit ou pompe', t: 's', o: e => { const cs = (e.circuits || []).map((c, i) => c.rep || `C${i + 1}`).map(r => [r, r]), pp = clesPompesProduction(e), v = (e.pompesFab || []).map(p => p && p.circuit).filter(x => x && !cs.some(([k]) => k === x) && !pp.some(([k]) => k === x)).map(x => [x, x]); return [['', '—'], ...cs, ...pp, ...v]; } }, { k: 'ref', l: 'Fabricant, modèle', t: 't' }, { k: 'courbe', l: 'Courbe Q:H (m³/h:mCE)', t: 't' }] },
      { k: 'foisonnement', l: 'Coefficient de simultanéité des besoins', u: '%', d: 100 },
      { g: 'Réglementation' }, { k: 'usage', l: 'Usage du bâtiment', t: 's', o: [['tertiaire', 'Tertiaire (bureaux, commerces…)'], ['erp', 'Établissement recevant du public'], ['habitation', 'Habitation collective'], ['industrie', 'Industriel (locaux de production)']], d: 'tertiaire' },
      { k: 'fluideFrigo', l: 'Fluide frigorigène', t: 's', o: Object.keys(FLUIDES_FRIGO).map(k => [k, k]), d: 'R32', si: e => /^(pac|gf)/.test(e.generateur || '') },
      { k: 'chargeFrigo', l: 'Charge totale de fluide (vide : estimée)', u: 'kg', d: '', si: e => /^(pac|gf)/.test(e.generateur || '') },
      { g: 'Régulation' }, { k: 'Tbase', l: 'Température extérieure de base (loi d\'eau)', u: '°C', d: -10 },
      { k: 'nonChauffage', l: 'Arrêt du chauffage (non-chauffage) au-dessus de', u: '°C ext.', d: 17 },
      { k: 'reduit', l: 'Abaissement en période réduite', u: 'K', d: 3 },
      { k: 'cascadeMode', l: 'Gestion de la cascade', t: 's', o: [['sequence', 'Enclenchement séquentiel'], ['parallele', 'Modulation parallèle']], d: 'sequence', si: e => num(e.nGen, 1) > 1 && !multiSaisi(e) },
      { k: 'permutation', l: 'Permutation de la priorité des générateurs', u: 'h', d: 168, si: e => nbGen(e) > 1 },
      { k: 'seuilReleve', l: 'Relève / appoint : enclenchement si le départ reste sous la consigne de plus de', u: 'K', d: 3, si: e => roleSaisi(e, 'releve') || roleSaisi(e, 'appoint') },
      { k: 'tempoReleve', l: 'Relève / appoint : temporisation d\'enclenchement', u: 'min', d: 10, si: e => roleSaisi(e, 'releve') || roleSaisi(e, 'appoint') },
      { k: 'bivalence', l: 'Bivalence PAC / appoint', t: 's', o: [['parallele', 'Parallèle (l\'appoint complète la PAC)'], ['alternatif', 'Alternative (la PAC s\'arrête sous la bivalence)']], d: 'parallele', si: e => pacAvecAppoint(e) },
      { k: 'Tbivalence', l: 'Température extérieure de bivalence', u: '°C', d: -3, si: e => pacAvecAppoint(e) },
      { k: 'gtb', l: 'Communication avec la GTB', t: 's', o: [['BACnet IP', 'BACnet IP'], ['Modbus TCP', 'Modbus TCP'], ['KNX', 'KNX'], ['LON', 'LON'], ['aucune', 'Aucune (régulateur autonome)']], d: 'BACnet IP' },
      { g: 'Accessoires' }, { k: 'vase', l: 'Vase d\'expansion et remplissage', t: 's', o: [['oui', 'Représentés'], ['non', 'Non représentés']], d: 'oui' },
      { k: 'desemboueur', l: 'Pot à boue / désemboueur', t: 's', o: [['oui', 'Représenté'], ['non', 'Non représenté']], d: 'oui' },
      { k: 'compteurs', l: 'Compteurs d\'énergie par circuit', t: 's', o: [['non', 'Non'], ['oui', 'Oui']], d: 'non' }],
    calcul(e) {
      const d = dimensionner(e), alertes = [...d.alertes], vol = volumeEau(d, e.generateur), dr = d.co ? d.co.dC : d;
      if (!alertes.some(a => a.niveau === 'erreur')) alertes.unshift(alerte('ok', `${d.multi ? `Production de ${d.multi.length} générateur(s), ${nf(d.Pprod, 0)} kW hors secours` : d.n > 1 ? `Cascade de ${d.n} × ${nf(d.Pg, 0)} kW` : `Générateur de ${nf(d.Pg, 0)} kW`} pour ${nf(d.Pdem, 0)} kW de besoins ; débit primaire ${nf(d.Qp, 2)} m³/h, secondaire ${nf(d.Qs, 2)} m³/h${d.bouteille && d.tb ? `, bouteille ${d.tb.nom}` : ''}.`));
      const cc = courbeChauffe(dr, e);
      // Pompes de l'échangeur : débits à assurer ; pompe existante reliée : contrôle de son débit (lien de l'étude)
      if (avecEchangeur(e)) {
        const Qprim = d.echangeur ? (d.Qech || d.Qp) : d.Qp, Qsec = d.Qs;
        if (e.pompeEchPrim === 'ajouter') alertes.push(alerte('ok', `Pompe primaire de l'échangeur à ajouter : ${nf(Qprim, 2)} m³/h (hauteur : échangeur côté primaire + liaison${/^echangeur/.test(e.generateur || '') ? ' + vannes de la sous-station' : ''}).`));
        if (e.pompeEchSec === 'ajouter') alertes.push(alerte('ok', `Pompe secondaire de l'échangeur à ajouter : ${nf(Qsec, 2)} m³/h (débit appelé par les circuits) ; les circuits gardent leur pompe s'ils en ont besoin.`));
        [['pompeEchPrim', 'pompeEchPrimLien', 'primaire', Qprim], ['pompeEchSec', 'pompeEchSecLien', 'secondaire', Qsec]].forEach(([k, kl, cote, Q]) => {
          if (e[k] !== 'existante') return;
          if (!e[kl]) { alertes.push(alerte('attention', `Pompe ${cote} de l'échangeur : choisissez la pompe existante reliée.`)); return; }
          const q = num(e[`${kl}Q`], NaN);
          if (Number.isFinite(q) && q > 0) alertes.push(alerte(q < Q * 0.95 ? 'erreur' : 'ok', `Pompe ${cote} de l'échangeur : pompe existante « ${e[`${kl}Nom`] || ''} » ${nf(q, 2)} m³/h pour ${nf(Q, 2)} m³/h nécessaires${q < Q * 0.95 ? ' — débit insuffisant' : ''}.`));
          else alertes.push(alerte('attention', `Pompe ${cote} de l'échangeur : pompe existante « ${e[`${kl}Nom`] || e[kl]} » reliée — vérifier qu'elle assure ${nf(Q, 2)} m³/h.`));
        });
      }
      // Schéma alimenté par un circuit amont : régime primaire face au secondaire, pression disponible face au primaire
      const pa = primaireAmont(e, d), rgP = regimeCircuit(e.regimePrim);
      if (rgP && (sousStation(e) || sourceBoucle(e))) {
        const pinc = Math.max(0.5, num(e.pincement, 3)), chP = rgP[0] > rgP[1];
        if (sousStation(e) && (dr.chaud ? dr.Td > rgP[0] - pinc + 0.01 : dr.Td < rgP[0] + pinc - 0.01)) alertes.push(alerte('erreur', `Sous-station : départ secondaire ${dr.Td} °C incompatible avec le primaire ${rgP[0]}/${rgP[1]} °C (pincement ${nf(pinc, 1)} K) — régime secondaire à revoir.`));
        else if (sousStation(e) && chP !== dr.chaud) alertes.push(alerte('erreur', `Sous-station : primaire ${rgP[0]}/${rgP[1]} °C et secondaire ${dr.Td}/${dr.Tr} °C de natures différentes (eau chaude / eau glacée).`));
        else alertes.push(alerte('ok', `${sousStation(e) ? 'Sous-station' : 'Boucle d\'eau tempérée'} : primaire ${rgP[0]}/${rgP[1]} °C${e.fluidePrim ? ` (${e.fluidePrim})` : ''}, ${nf(pa.P, 0)} kW appelés au circuit amont, ${nf(pa.dp, 0)} kPa côté primaire.`));
      }
      const dispo = num(e.dpDispo, NaN);
      if (Number.isFinite(dispo) && e.dpDispo !== '') {
        if (dispo < pa.dp - 0.05) alertes.push(alerte('erreur', `Pression disponible au raccordement ${nf(dispo, 1)} kPa pour ${nf(pa.dp, 1)} kPa côté primaire (${pa.libelle}) : pompe du circuit amont insuffisante.`));
        else alertes.push(alerte('ok', `Pression disponible au raccordement ${nf(dispo, 1)} kPa pour ${nf(pa.dp, 1)} kPa côté primaire (${pa.libelle}).`));
      }
      // Récupération d'énergie : chaleur rejetée = froid produit × (1 + 1 / EER) ; part récupérée selon le montage
      const rec = recuperation(e, d), Precup = rec ? rec.P : 0, Pfr = rec ? rec.Pfr : 0;
      if (Precup) alertes.push(alerte('ok', `Récupération ${e.recupGf === 'totale' ? 'totale au condenseur' : 'par désurchauffeur'} : ${nf(Precup, 1)} kW de chaleur à ${e.regimeRecup || '45/40'} °C quand le groupe produit ${nf(Pfr, 0)} kW de froid — disponible seulement quand le froid tourne (appoint chaud nécessaire).`));
      // Pompes de production, d'échangeur, de récupération et de refroidissement : point sur la courbe de la pompe retenue
      const pProd = pompesProduction(e, d);
      pProd.filter(p => p.pf).forEach(p => {
        const pf = p.pf;
        if (!pf.ok) alertes.push(alerte('erreur', `${p.cle} (${p.lib.toLowerCase()}) : pompe ${pf.ref || ''} insuffisante : ${nf(pf.Hpompe ?? 0, 2)} mCE à ${nf(p.Q, 2)} m³/h pour ${nf(p.hmt, 2)} mCE demandés (point réel ${nf(pf.Q, 2)} m³/h, ${nf(pf.ecart, 0)} %).`));
        else alertes.push(alerte(pf.ecart > 25 ? 'attention' : 'ok', `${p.cle} (${p.lib.toLowerCase()}) : pompe ${pf.ref || ''} : point de fonctionnement ${nf(pf.Q, 2)} m³/h sous ${nf(pf.H, 2)} mCE à pleine vitesse (+${nf(pf.ecart, 0)} %) ; vitesse de réglage ≈ ${nf(pf.vitesse, 0)} % pour ${nf(p.Q, 2)} m³/h${pf.ecart > 25 ? ' : pompe surdimensionnée à vitesse fixe' : ''}.`));
      });
      // Vanne primaire de la sous-station (Kvs saisi) : autorité sur l'échangeur côté primaire
      if (pa.vanne && pa.vanne.kvs) { const ech = (d.dpEchP || { v: DP_ECH }).v, a = pa.vanne.v / (pa.vanne.v + ech); alertes.push(alerte(a < 0.5 ? 'attention' : 'ok', `Vanne primaire de la sous-station Kvs ${nf(pa.vanne.kvs, 1)} : ${nf(pa.vanne.v, 1)} kPa à ${nf(pa.vanne.Q, 2)} m³/h, autorité ${nf(a, 2)}${a < 0.5 ? ' < 0,5 : Kvs plus petit ou régulateur de pression différentielle' : ''}.`)); }
      const Pr = num(e.Precup);
      if (e.recupDe && Pr > 0) alertes.push(alerte('ok', `Récupération sur groupe froid : ${nf(Pr, 1)} kW disponibles, soit ${nf(Math.min(100, Pr / Math.max(1, dr.Pdem) * 100), 0)} % des besoins quand le froid tourne ; priorité à la récupération, le générateur assure l'appoint et le secours (dimensionné sur 100 % des besoins).`));
      if (e.recupDe && Pr > 0 && dr.chaud && dr.Td > 50) alertes.push(alerte('attention', `Départ chaud à ${dr.Td} °C : une récupération sur condenseur ne dépasse guère 45 à 55 °C ; prévoir un circuit basse température ou un réchauffage par le générateur.`));
      return {
        valeurs: { Precup, Precupe: Pr, primaire: { montage: pa.montage, libelle: pa.libelle, P: pa.P, Pf: pa.Pf, dp: pa.dp, dispo: Number.isFinite(dispo) && e.dpDispo !== '' ? dispo : null }, volume: vol.total, Pprod: d.Pprod, Pdem: d.Pdem, Qp: d.Qp, Qs: d.Qs, Qg: d.Qg, bouteille: d.tb ? d.tb.cle : null, Db: d.Db, collecteur: d.tc.cle, circuits: d.circuits.map(c => ({ rep: c.rep, Q: c.Q, Qcoll: c.Qcoll, tube: c.t.cle, hmt: c.hmt, kvs: c.kvs, L: c.L, reg: c.reg, dn: c.t.dn, tubeNom: c.t.nom, pompe: c.pf && c.pf.ref ? `${c.pf.ref} (${nf(c.Q, 2)} m³/h × ${nf(c.hmt, 2)} mCE, vitesse ≈ ${nf(c.pf.vitesse || 100, 0)} %)` : c.pompe ? N.libPompe(c.pompe) : '', pompeFiche: c.pf ? c.pf.fiche : null, vanne: c.vanne ? N.libVanne(c.vanne) : '', rob: (c.rob || []).map(x => ({ i: x.i, rep: x.rep, type: x.type, lib: x.lib, dn: x.dn, qte: x.qte, dpTot: x.dpTot, ref: x.ref, fiche: x.fiche })),
          ...(c.autorite !== null ? { autorite: Math.round(c.autorite * 100) / 100 } : {}), ...(c.prim ? { Qprim: c.prim.Q, hmtPrim: c.prim.hmt, pompePrim: c.prim.pompe ? N.libPompe(c.prim.pompe) : '' } : {}),
          ...(c.bypass ? { bypass: c.bypass.dp } : {}), ...(c.bout ? { bouteilleCircuit: c.bout.tb ? c.bout.tb.nom : `Ø ${nf(c.bout.Db, 0)} mm` } : {}), ...(c.ech ? { Aech: c.ech.A } : {}) })),
          ...(d.multi ? { generateurs: d.multi.map(x => ({ rep: x.rep, type: x.type, lib: x.gen[0], P: x.P, role: x.role, Q: x.Q, tube: x.t.nom, dn: x.t.dn, pompe: x.pompe, pp: x.pp, regime: x.regime, alim: x.alim, dp: x.dpEau, dpSrc: x.dpSrc })) } : {}),
          prod: { dp: d.prod.dp, hmt: d.prod.hmt, postes: d.prod.postes },
          pompesProd: pProd.map(p => ({ cle: p.cle, lib: p.lib, Q: p.Q, dp: p.dp, hmt: p.hmt, etat: p.etat, ref: p.pf ? p.pf.ref : '', vitesse: p.pf ? p.pf.vitesse : null, fiche: p.pf ? p.pf.fiche : null })),
          ...(d.evac ? { evac: { type: d.evac.type, lib: d.evac.lib, mode: d.evac.mode, P: d.evac.P, Q: d.evac.Q, dp: d.evac.dp, hmt: d.evac.hmt, Pvent: d.evac.Pvent, nVent: d.evac.nVent, Ppompe: d.evac.Ppompe, regime: [d.evac.Tc, d.evac.Tf], fluide: d.evac.fluide, tube: d.evac.t.nom, dn: d.evac.t.dn } } : {}),
          ...(d.ballons ? { ballons: d.ballons.map(b => ({ rep: b.rep, fonction: b.fonction, lib: b.lib, V: b.V, Vcalc: b.Vcalc, position: b.position, circuit: b.circuit, piquages: b.piquages, sondes: b.sondes })) } : {}) },
        resume: [['Réseau', `${d.regime} — ${d.f.libelle}`], ['Production', d.multi ? `${d.multi.map(x => `${x.rep} ${x.gen[0].toLowerCase()} ${nf(x.P, 0)} kW (${ROLES[x.role].toLowerCase()})`).join(' + ')} = ${nf(d.Pprod, 0)} kW hors secours` : `${d.n} × ${d.gen[0].toLowerCase()} de ${nf(d.Pg, 0)} kW = ${nf(d.Pprod, 0)} kW`],
          ['Besoins (avec simultanéité)', `${nf(d.Pdem, 0)} kW`], ['Débit par générateur', d.multi ? d.multi.map(x => `${x.rep} ${nf(x.Q, 2)} m³/h`).join(' ; ') : `${nf(d.Qg, 2)} m³/h — ${d.tg.nom}`], ['Débit primaire total', `${nf(d.Qp, 2)} m³/h`],
          ['Débit appelé par les circuits', `${nf(d.Qs, 2)} m³/h`], ['Collecteurs', `${d.tc.nom} (${nf(d.Qcoll, 2)} m³/h)`],
          ...(d.co ? [['Climatisation', `${d.n} × ${nf(d.co.dF.Pg, 0)} kW = ${nf(d.co.dF.Pprod, 0)} kW pour ${nf(d.co.dF.Pdem, 0)} kW de besoins ; débit ${nf(d.co.dF.Qp, 2)} m³/h`]] : []),
          d.decouplage === 'ballon' ? ['Ballon tampon de découplage', `${nf(d.tampon ? d.tampon.V : 0, 0)} L (Ø intérieur mini ${nf(d.Db, 0)} mm, 4 piquages)`] : d.echangeur ? ['Échangeur à plaques', `${nf(d.Pdem, 0)} kW, primaire ${d.Td}/${d.Tr} °C, secondaire ${d.Tsd}/${d.Tsr} °C, surface ≈ ${nf(d.Aech, 1)} m²`]
            : [d.decouplage === 'bouteille3' ? 'Bouteille de découplage 3 piquages' : 'Bouteille de découplage', d.bouteille ? `${d.tb ? d.tb.nom : '—'} (Ø intérieur mini ${nf(d.Db, 0)} mm)` : 'Sans'],
          ...(d.tampon && d.tampon.position !== 'decouplage' ? [['Ballon tampon', (d.tampon.position === 'depart' ? 'en série sur le départ — ' : 'en série sur le retour — ') + (d.tampon.V > 0 ? `${nf(d.tampon.V, 0)} L (minimum ${nf(d.tampon.Vmin, 0)} L − installation ${nf(d.tampon.Vres, 0)} L)` : `Non nécessaire : l'installation contient ${nf(d.tampon.Vres, 0)} L pour ${nf(d.tampon.Vmin, 0)} L exigés`)]] : []),
          ...(d.ballons || []).map(b => [`Ballon ${b.rep}`, `${b.lib} ${nf(b.V, 0)} L${b.saisi ? '' : ' (calculé)'}, ${b.circuit ? `circuit ${b.circuit}` : 'production'}, ${b.piquages} piquages, sondes ${b.sondes.map(x => SONDES[x]).join(', ') || '—'}`]),
          ['Volume d\'eau estimé', `${nf(vol.total, 0)} L`]],
        tableaux: [d.co ? { titre: 'Circuits de distribution (change-over : diamètre au débit le plus fort)', entetes: ['Circuit', 'Émetteur', 'P chaud / froid (kW)', 'Débit chaud / froid (m³/h)', 'Tube', 'v (m/s)', 'Régulation', 'Kvs', 'Autorité', 'Pompe (m³/h × mCE)'],
          lignes: d.circuits.map(c => [c.rep, c.em[0], `${nf(c.P, 0)} / ${nf(c.Pf, 0)}`, `${nf(c.Qc, 2)} / ${nf(c.Qf, 2)}`, c.t.nom, nf(c.v, 2), REGULATIONS[c.reg], kvsTxt(c), autoriteTxt(c), `${nf(c.Q, 2)} × ${nf(c.hmt, 1)}`]) }
          : { titre: 'Circuits de distribution', entetes: ['Circuit', 'Émetteur', 'P (kW)', 'Régime (°C)', 'Débit (m³/h)', 'Tube', 'v (m/s)', 'Régulation', 'Kvs', 'Autorité', 'Pompe (m³/h × mCE)'],
          lignes: d.circuits.map(c => [c.rep, c.em[0], nf(c.P, 0), `${c.rc[0]}/${c.rc[1]}`, nf(c.Q, 2), c.t.nom, nf(c.v, 2), REGULATIONS[c.reg], kvsTxt(c), autoriteTxt(c), `${nf(c.Q, 2)} × ${nf(c.hmt, 1)}`]) },
        ...(d.circuits.some(c => !['3v', '2v', 'direct'].includes(c.reg)) ? [{ titre: 'Montages hydrauliques des circuits', entetes: ['Circuit', 'Montage', 'Pompe secondaire PC (m³/h × mCE)', 'Pompe primaire PCP (m³/h × mCE)', 'Vanne (débit, ΔP, autorité)', 'Organe de séparation'],
          lignes: d.circuits.map((c, i) => [c.rep, REGULATIONS[c.reg], `PC${i + 1} : ${nf(c.Q, 2)} × ${nf(c.hmt, 2)}`, c.prim ? `PCP${i + 1} : ${nf(c.prim.Q, 2)} × ${nf(c.prim.hmt, 2)}` : '—',
            c.M.vanne ? `${c.M.vanne === '3v' ? '3 voies' : '2 voies'} ${nf(c.Qv, 2)} m³/h, ${nf(c.dpV, 1)} kPa, a = ${nf(c.autorite, 2)}` : '—',
            c.bout ? `bouteille ${c.bout.tb ? c.bout.tb.nom : `Ø ${nf(c.bout.Db, 0)} mm`}` : c.ech ? `échangeur ≈ ${nf(c.ech.A, 1)} m², primaire ${c.ech.Tprim[0]}/${c.ech.Tprim[1]} °C` : ['injection3', 'injection2'].includes(c.reg) ? 'by-pass neutre' : c.bypass ? `by-pass différentiel ${nf(c.bypass.dp, 0)} kPa` : '—']) }] : []),
        { titre: 'Pertes de charge et HMT des pompes de circuit', entetes: ['Circuit', 'Débit (m³/h)', 'Liaison (kPa)', 'Émetteur / réseau (kPa)', 'Vanne de régulation (kPa)', 'Robinetterie (kPa)', 'HMT (mCE)'],
          lignes: d.circuits.map(c => [c.rep, nf(c.Q, 2), nf(c.dpL, 1), nf(c.dpEm, 1), nf(c.dpV, 1), (c.rob || []).length ? nf(c.dpRob, 1) : '5,0 (forfait)', nf(c.hmt, 2)]) },
        ...(d.circuits.some(c => (c.rob || []).length) ? [{ titre: 'Robinetterie et accessoires : pertes de charge', entetes: ['Repère', 'Circuit', 'Organe', 'DN', 'Qté', 'Débit (m³/h)', 'ΔP unitaire (kPa)', 'ΔP total (kPa)', 'Origine', 'Fabricant, référence', 'Fiche'],
          lignes: d.circuits.flatMap(c => (c.rob || []).map(x => [x.rep, c.rep, x.lib, `DN ${x.dn}`, String(x.qte), nf(x.Q, 2), nf(x.dpU, 2), nf(x.dpTot, 2), x.source, x.ref || (x.fiche ? [x.fiche.fabricant, x.fiche.reference].filter(Boolean).join(' ') : ''), x.fiche ? '✓' : ''])) }] : []),
        ...(d.circuits.some(c => c.pf) ? [{ titre: 'Pompes retenues : point de fonctionnement sur la courbe du fabricant', entetes: ['Circuit', 'Pompe', 'Demandé (m³/h × mCE)', 'Hauteur de la pompe au débit demandé (mCE)', 'Point à pleine vitesse', 'Écart de débit', 'Vitesse de réglage', 'Contrôle'],
          lignes: d.circuits.filter(c => c.pf).map(c => [c.rep, c.pf.ref || '—', `${nf(c.Q, 2)} × ${nf(c.hmt, 2)}`, c.pf.Hpompe === null ? 'hors courbe' : nf(c.pf.Hpompe, 2), `${nf(c.pf.Q, 2)} m³/h · ${nf(c.pf.H, 2)} mCE`, `${c.pf.ecart >= 0 ? '+' : ''}${nf(c.pf.ecart, 0)} %`, c.pf.ok ? `≈ ${nf(c.pf.vitesse, 0)} %` : '—', c.pf.ok ? (c.pf.ecart > 25 ? 'surdimensionnée' : 'OK') : 'insuffisante']) }] : []),
        // Pertes de charge de la production, des échangeurs et du primaire amont : origine de chaque valeur (forfait, saisie, fiche)
        { titre: 'Pertes de charge de la production et des échangeurs (origine : forfait, saisie ou fiche)', entetes: ['Boucle', 'Poste', 'ΔP (kPa)', 'Origine'],
          lignes: [...d.prod.postes.map(([l, v, o]) => ['Production', l, nf(v, 1), o]), ['Production', 'Total (HMT de la boucle de production)', `${nf(d.prod.dp, 1)} (${nf(d.prod.hmt, 2)} mCE)`, ''],
            ...(avecEchangeur(e) && d.dpEchS ? [['Échangeur', 'Côté primaire', nf(d.dpEchP.v, 1), d.dpEchP.src], ['Échangeur', 'Côté secondaire', nf(d.dpEchS.v, 1), d.dpEchS.src]] : []),
            ...(sousStation(e) || sourceBoucle(e) || (e.dpDispo !== '' && e.dpDispo !== undefined && e.dpDispo !== null) ? pa.postes.map(([l, v, o]) => [`Primaire amont (${pa.libelle})`, l, nf(v, 1), o]) : []),
            ...d.circuits.filter(c => c.dpEchC).map(c => [`Circuit ${c.rep}`, 'Échangeur de circuit primaire / secondaire', `${nf(c.dpEchC.p, 1)} / ${nf(c.dpEchC.s, 1)}`, c.dpEchC.src]),
            ...(d.evac ? d.evac.postes.map(([l, v, o]) => [`Refroidissement (${d.evac.lib.toLowerCase()})`, l, nf(v, 1), o]) : [])] },
        ...(pProd.length ? [{ titre: 'Pompes de production, d\'échangeur, de récupération et de refroidissement', entetes: ['Repère', 'Pompe', 'Débit (m³/h)', 'HMT (mCE)', 'Détail (kPa)', 'Pompe retenue', 'Point à pleine vitesse', 'Contrôle'],
          lignes: pProd.map(p => [p.cle, p.lib, nf(p.Q, 2), nf(p.hmt, 2), p.detail, p.pf ? p.pf.ref || 'courbe saisie' : '—', p.pf ? `${nf(p.pf.Q, 2)} m³/h · ${nf(p.pf.H, 2)} mCE${p.pf.ok ? ` · vitesse ≈ ${nf(p.pf.vitesse, 0)} %` : ''}` : '—', ETATS_POMPE[p.etat]]) }] : []),
        ...(d.evac ? [{ titre: `Évacuation de la chaleur — ${d.evac.lib}`, entetes: ['Grandeur', 'Valeur'],
          lignes: [['Fonction', d.evac.mode === 'condenseur' ? 'Refroidissement du condenseur du groupe froid eau/eau' : 'Évacuation de l\'excédent de la boucle d\'eau tempérée (été)'],
            ['Puissance à évacuer', `${nf(d.evac.P, 0)} kW${d.evac.saisi ? ' (saisie)' : d.evac.mode === 'condenseur' ? ` (froid ${nf(d.evac.Pfroid, 0)} kW × (1 + 1 / ${nf(d.evac.eer, 1)}))` : ' (excédent estimé)'}`],
            ['Régime de l\'eau (entrée / sortie)', `${d.evac.Tc}/${d.evac.Tf} °C (ΔT ${nf(d.evac.dT, 0)} K) — ${d.evac.fluideLib}`], ['Air extérieur de dimensionnement', `${d.evac.Text} °C ${d.evac.type === 'aero' ? 'sec' : 'humide'} (approche ${nf(d.evac.approche, 1)} K)`],
            ['Débit d\'eau', `${nf(d.evac.Q, 2)} m³/h — ${d.evac.t.nom}`], ['Ventilateurs', `${d.evac.nVent} ventilateur(s) à vitesse variable, ≈ ${nf(d.evac.Pvent, 1)} kW${d.evac.PventSaisi ? ' (saisie)' : ' (hypothèse : 2,5 % de la puissance évacuée)'}`],
            ['Pompe PEV', `${nf(d.evac.Q, 2)} m³/h × ${nf(d.evac.hmt, 2)} mCE (≈ ${nf(d.evac.Ppompe, 2)} kW)`], ['Accessoires', `vanne 3 voies de by-pass hivernal, sonde de sortie${d.evac.ech ? ', échangeur intermédiaire' : ''}${d.evac.type === 'tour' ? ', traitement d\'eau, appoint et purge de déconcentration' : ', vase et soupape du circuit glycolé'}`]] }] : []),
        { titre: 'Matériel proposé (catalogue)', entetes: ['Circuit', 'Pompe', 'Vanne de régulation'],
          lignes: d.circuits.map(c => [c.rep, c.pompe ? N.libPompe(c.pompe) : 'aucune pompe du catalogue', !c.M.vanne ? '—' : c.vanne ? N.libVanne(c.vanne) : 'aucune vanne du catalogue']) },
        d.multi ? { titre: 'Production', entetes: ['Générateur', 'Rôle', 'P (kW)', 'Régime (°C)', 'Débit (m³/h)', 'Raccordement', 'Pompe primaire'],
          lignes: d.multi.map((x, i) => [`${x.rep} — ${x.gen[0]}`, ROLES[x.role], nf(x.P, 0), x.regime ? `${x.regime[0]}/${x.regime[1]}` : 'réseau', nf(x.Q, 2), x.t.nom,
            x.pompe === 'integree' ? 'intégrée au générateur (kit hydraulique)' : x.pp ? `PP${i + 1} : ${nf(x.Q, 2)} m³/h, avec clapet` : !d.pompesInd && d.bouteille ? `pompe commune, vanne motorisée` : d.multi.length > 1 ? 'vanne motorisée (pompes des circuits)' : 'sans (pompes des circuits)']) }
          : { titre: 'Production', entetes: ['Générateur', 'P (kW)', 'Débit (m³/h)', 'Raccordement', 'Pompe primaire'],
          lignes: Array.from({ length: d.n }, (_, i) => [`${d.co ? 'PAC' : d.chaud ? 'G' : 'GF'}${i + 1} — ${d.gen[0]}`, d.co ? `${nf(d.co.dC.Pg, 0)} / ${nf(d.co.dF.Pg, 0)}` : nf(d.Pg, 0), nf(d.Qg, 2), d.tg.nom,
            d.ppIntegree ? 'intégrée au générateur (kit hydraulique) — hauteur disponible à vérifier sur la fiche' : d.ppDeportees ? `${nf(d.Qg, 2)} m³/h, avec clapet` : d.n > 1 && d.bouteille ? `pompe commune ${nf(d.Qp, 2)} m³/h, vanne motorisée` : d.n > 1 ? 'vanne motorisée (pompes des circuits)' : 'sans (pompes des circuits)'] ) },
        ...(d.ballons ? [{ titre: 'Ballons', entetes: ['Repère', 'Fonction', 'Position', 'Volume (L)', 'Calculé (L)', 'Piquages', 'Sondes', 'Ø intérieur mini (mm)'],
          lignes: d.ballons.map(b => [b.rep, b.lib, b.circuit ? `circuit ${b.circuit}` : 'production', nf(b.V, 0), b.Vcalc > 0 ? nf(b.Vcalc, 0) : '—', b.piquages, b.sondes.map(x => SONDES[x]).join(', ') || '—', nf(b.Dmin, 0)]) }] : [])],
        alertes,
        hypotheses: ['Débits : Q = P / (ρ · cp · ΔT) au régime de chaque circuit ; un circuit à vanne 3 voies mélangeuse appelle sur le collecteur P / (ρ · cp · (départ réseau − retour circuit)).',
          'Diamètres : plus petit tube de la série respectant la vitesse et la perte de charge linéique maximales ; collecteurs limités à 1 m/s.',
          'Pompes de circuit : HMT estimée = pertes linéiques × 1,3 (singularités) + émetteur (valeur usuelle) + vanne de régulation (autorité ≈ 0,5) + équilibrage 5 kPa. À confirmer par le calcul de réseau.',
          'Pertes de charge côté eau : valeurs saisies ou reprises des fiches techniques (registre des équipements) ; à défaut (champ vide), forfaits : chaudière 10 kPa, PAC / groupe froid 40 kPa, échangeur 20 kPa par côté, bouteille 1 kPa, vanne primaire de sous-station 20 kPa, évaporateur / condenseur côté source 30 kPa (colonne « Origine »).',
          ...(d.evac ? ['Évacuation de la chaleur : puissance = froid × (1 + 1 / EER) pour un condenseur, excédent de la boucle sinon ; ventilateurs ≈ 2,5 % de la puissance évacuée (ordre de grandeur 2 à 3 % pour un aéroréfrigérant à ventilateurs EC, moins pour une tour), à remplacer par la fiche du fabricant ; débit au régime de l\'eau de refroidissement.'] : []),
          'Bouteille de découplage : vitesse verticale ≤ 0,2 m/s et diamètre ≥ 3 fois le plus gros piquage ; piquages départ en partie haute, retours en partie basse.',
          ...(d.echangeur ? ['Échangeur à plaques à contre-courant : secondaire décalé du pincement, surface indicative avec U ≈ 4 000 W/m²·K (à confirmer par le fabricant).'] : []),
          ...(d.tampon ? ['Ballon tampon : volume d\'eau minimal exigé (L/kW × puissance installée) diminué du volume estimé de l\'installation, arrondi au volume commercial.'] : []),
          ...(d.multi ? ['Production hétérogène : puissance installée = somme des générateurs hors secours ; débit primaire de chaque générateur à son régime (saisi, sinon celui du réseau) ; contrôle avec le plus gros générateur à l\'arrêt.'] : []),
          ...(d.circuits.some(c => c.M.vanne) ? ['Autorité de vanne = ΔP vanne / (ΔP vanne + ΔP de la partie à débit variable) ; 0,5 au moins conseillé. Vanne d\'un montage en injection, en décharge ou d\'échangeur dimensionnée pour une autorité ≥ 0,5 (10 kPa au moins) ; échangeur de circuit ≈ 20 kPa par côté.'] : []),
          ...(d.ballons ? ['Ballons : tampon et découplage = ratio L/kW × puissance (production ou circuit) ; stockage = puissance × durée / (ρ · cp · ΔT) ; ECS ≈ 20 L/kW à défaut du calcul d\'ECS ; volume arrondi au ballon commercial.'] : []),
          ...(d.tichelmann ? ['Cascade en Tichelmann : le premier générateur alimenté au départ est le dernier au retour, longueurs de circuit égales et débits répartis sans organe d\'équilibrage.'] : []),
          ...(d.co ? ['Change-over : chaque circuit est calculé au régime chaud et au régime froid ; le diamètre retenu est celui du débit le plus fort (en général le froid, à plus faible écart de température).'] : []),
          'Schéma de principe : ne remplace pas le plan d\'exécution (organes de sécurité, vidanges, purges et appareils de mesure à compléter selon le CCTP).'],
        synthese: `${d.co ? 'Change-over · ' : ''}${d.multi ? `${d.multi.length} générateur(s) ${nf(d.Pprod, 0)} kW` : d.n > 1 ? `Cascade ${d.n} × ${nf(d.Pg, 0)} kW` : `${nf(d.Pg, 0)} kW`} · ${d.circuits.length} circuit(s) · ${d.echangeur ? 'échangeur' : d.bouteille ? 'bouteille' : 'sans découplage'}${d.tampon && d.tampon.V > 0 ? ` · tampon ${nf(d.tampon.V, 0)} L` : ''} · ${nf(d.Qs, 1)} m³/h`,
        schema: dessiner(d, e),
        ...(cc ? { schemas: [{ titre: 'Courbe de chauffe (loi d\'eau) des circuits', svg: cc.svg }] } : {}),
        onglets: [{ titre: 'Réglementation', blocs: reglementation({ ...dr, Pprod: Math.max(d.Pprod, d.co ? d.co.dF.Pprod : 0), circuits: d.circuits, echangeur: d.echangeur }, e) }, { titre: 'Régulation', blocs: [...(cc ? [{ titre: 'Courbe de chauffe (loi d\'eau)', svg: cc.svg }, { titre: 'Températures de départ / retour (°C) selon la température extérieure', tableau: cc.tableau },
          { titre: 'Réglage de la courbe sur le régulateur', liste: cc.circuits.map(c => `${c.rep} : départ ${c.regime[0]} °C à ${cc.Tb} °C extérieur, ${c.base} °C à 18 °C extérieur ; équivalent type Synco : pente ≈ ${nf(c.pente, 2)}, déplacement parallèle ≈ ${c.deplacement >= 0 ? '+' : ''}${nf(c.deplacement, 1)} K (consigne d'ambiance 20 °C) — à affiner à l'usage.`) }] : []),
          ...regulation({ ...dr, circuits: dr.circuits, co: d.co }, e)] }],
      };
    },
  };
  // Fiche technique d'un organe de robinetterie : Kv / Kvs, DN, perte de charge, fabricant et référence
  function lireFicheRobinet(lignes) {
    const L = (Array.isArray(lignes) ? lignes : String(lignes || '').split(/\r?\n/)).map(String).filter(l => l.trim()), v = {}, src = {};
    const nrm = x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    L.forEach(l => { const x = nrm(l);
      if (v.kv === undefined) { const m = /\bkvs?\b\s*[:=]?\s*(\d+(?:[.,]\d+)?)/.exec(x); if (m) { v.kv = +m[1].replace(',', '.'); src.kv = l.trim(); } }
      if (v.dn === undefined) { const m = /\bdn\s*(\d{2,3})\b/.exec(x); if (m) { v.dn = +m[1]; src.dn = l.trim(); } }
      if (v.abaque === undefined && /abaque/.test(x)) { const m = /abaque[^:]*:\s*(.+)$/.exec(x.replace(/\(.*?\)/g, '')); const pts = m ? lireAbaque(m[1]) : []; if (pts.length >= 2) { v.abaque = ecrireAbaque(pts); src.abaque = l.trim(); } }
      if (v.tours === undefined && !/abaque/.test(x)) { const m = /(\d+(?:[.,]\d+)?)\s*tours/.exec(x) || /nombre de tours[^0-9]{0,10}(\d+(?:[.,]\d+)?)/.exec(x); if (m && +m[1].replace(',', '.') <= 20) { v.tours = +m[1].replace(',', '.'); src.tours = l.trim(); } }
      if (v.dp === undefined && /perte de charge|pression differentielle|delta ?p|Δp/.test(x)) { const m = /(\d+(?:[.,]\d+)?)\s*(kpa|mbar|mce)/.exec(x); if (m) { const n = +m[1].replace(',', '.'); v.dp = m[2] === 'kpa' ? n : m[2] === 'mbar' ? n / 10 : n * 9.81; src.dp = l.trim(); } } });
    // Abaque : ligne des positions (tours) suivie d'une ligne de Kv de même longueur, ou couples « 1 tour : Kv 0,9 »
    const nombres = l => (l.match(/\d+(?:[.,]\d+)?/g) || []).map(x => Number(x.replace(',', '.')));
    for (let i = 0; i < L.length && !v.abaque; i++) {
      const x = nrm(L[i]);
      if (!/tours?|position|reglage/.test(x)) continue;
      const t = nombres(L[i]).filter(n => n <= 20);
      for (let j = i + 1; j <= i + 3 && j < L.length; j++) {
        if (!/\bkv/.test(nrm(L[j]))) continue;
        const k = nombres(L[j].replace(/kvs?/i, ''));
        if (t.length >= 3 && k.length === t.length && t.every((n, z) => !z || n > t[z - 1])) { v.abaque = ecrireAbaque(t.map((n, z) => [n, k[z]])); src.abaque = `${L[i].trim()} / ${L[j].trim()}`; }
        break;
      }
    }
    if (!v.abaque) { const pts = L.map(l => /(\d+(?:[.,]\d+)?)\s*tours?\s*[:=–-]?\s*kv\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i.exec(nrm(l))).filter(Boolean).map(m => [Number(m[1].replace(',', '.')), Number(m[2].replace(',', '.'))]);
      if (pts.length >= 3) { v.abaque = ecrireAbaque(pts.sort((a, b) => a[0] - b[0])); src.abaque = 'couples tours / Kv'; } }
    if (v.abaque) { const d = lireAbaque(v.abaque).slice(-1)[0]; if (v.tours === undefined) v.tours = d[0]; if (/abaque|tours/.test(String(src.kv || '').toLowerCase()) || src.kv === undefined || v.kv < d[1]) { v.kv = d[1]; src.kv = 'Kvs : dernier point de l\'abaque'; } }
    let fabricant = '', reference = '';
    try { const FT = typeof FichesTech !== 'undefined' ? FichesTech : require('../../../public/js/fiches-tech'); const a = FT.analyser({ texte: L.join('\n') }); fabricant = a.fabricant || ''; reference = (a.references || [])[0] || ''; } catch (err) { /* sans bibliothèque */ }
    return { valeurs: v, sources: src, fabricant, reference, nb: Object.keys(v).length };
  }
  return { pompesProduction, pointPompe, etatPompe, ETATS_POMPE, recuperation, evacuation, modeEvacuation, EVACUATIONS, RATIO_VENT, DP_GEN, DP_BOUTEILLE, DP_VANNE_PRIM, DP_SOURCE, dpOuForfait, dpEchCircuit, redimensionnerVannes, appliquerVannes,
    sousStation, sourceBoucle, primaireAmont, DP_ECH, MONTAGES, montage, ROLES, BALLONS, SONDES, prefixeGen, bivalence, depMini, courbeChauffe, ROBINETTERIE, ORGANES_CALCUL, robinetterie, organe, lireFicheRobinet, lireAbaque, toursAbaque, REGIMES, GENERATEURS, EMETTEURS, REGULATIONS, FLUIDES_FRIGO, CONTENANCE, volumeEau, utiliserReglementation, dimensionner, dessiner, reglementation, regulation };
})(typeof Donnees !== 'undefined' ? Donnees : require('./donnees'), typeof Calculs !== 'undefined' ? Calculs : require('./calculs'), typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = Schema;
