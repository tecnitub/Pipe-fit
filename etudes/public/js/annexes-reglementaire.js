// Calculs annexes — Réglementation et contrôle : classement de chaufferie, calorifugeage économique, traitement d'eau et désembouage.
// Rangés à part dans l'étude (famille « Calculs annexes », thème « Réglementation et contrôle ») ; chaque type déclare annexe: true, theme,
// et sa fonction lier(ctx) qui reprend les données des autres notes de l'étude (voir Liens.resoudreLiens).
// Module pur (navigateur, node, tests).
const AnnexesReglementaire = ((N) => {
  const { nf, num } = N;
  const alerte = (niveau, texte) => ({ niveau, texte });
  const Dn = () => (typeof Donnees !== 'undefined' ? Donnees : require('./donnees'));
  const Ca = () => (typeof Calculs !== 'undefined' ? Calculs : require('./calculs'));
  const Sc = () => (typeof Schema !== 'undefined' ? Schema : require('./schema'));
  const Ln = () => (typeof Liens !== 'undefined' ? Liens : require('./liens'));
  const vide = v => v === undefined || v === null || String(v).trim() === '';
  const ou = (v, d) => (vide(v) ? d : num(v, d));
  // Valeurs réglementaires (seuils de chaufferie et ICPE) : défauts des champs vides, surchargeables dans les Réglages
  const VR = () => (typeof ValeursRegl !== 'undefined' ? ValeursRegl : (() => { try { return require('./valeurs-regl'); } catch (e) { return null; } })());
  const vReg = (cle, d) => { const R = VR(); return R ? R.v(cle, d) : d; };
  const THEME = 'Réglementation et contrôle', FAMILLE = 'Calculs annexes';
  const notesDe = (ctx, type) => (ctx.notes || []).filter(n => n.type === type);

  /* ---------- Générateurs d'un schéma de principe (production de chaleur) ---------- */
  // Lignes détaillées (production hétérogène) ou générateur × nombre ; les groupes froids sont écartés
  function generateursPid(es) {
    const G = Sc().GENERATEURS, l = (es.generateurs || []).filter(x => x && G[x.type] && num(x.P) > 0).map((x, i) => ({ rep: x.rep || `G${i + 1}`, type: x.type, P: num(x.P), role: x.role || 'base' }));
    const gens = l.length ? l : Array.from({ length: Math.max(1, Math.min(6, Math.round(num(es.nGen, 1)))) }, (_, i) => ({ rep: `G${i + 1}`, type: es.generateur || 'chaudiere-cond', P: num(es.Pgen), role: 'base' }));
    return gens.filter(g => G[g.type] && G[g.type][1] !== 'froid');
  }
  // Combustible d'un type de générateur : clé de la liste des combustibles ci-dessous
  const combustibleDe = type => (/^chaudiere-(cond|gaz)$/.test(type) ? 'gaz' : type === 'chaudiere-fioul' ? 'fioul' : type === 'chaudiere-bois' ? 'bois' : /^pac|^gf/.test(type) ? 'elec' : /^echangeur/.test(type) ? 'reseau' : 'gaz');
  // Schéma de principe choisi, sinon le premier qui a une production de chaleur
  function pidDe(ctx, cle) {
    const pids = notesDe(ctx, 'pid');
    if (cle) return { n: pids.find(n => n.id === cle) || null, choisi: true };
    return { n: pids.find(n => generateursPid(ctx.resoudre(n)).some(g => g.P > 0)) || null, choisi: false };
  }

  /* =====================================================================================================================
     22. Classement de chaufferie
     ===================================================================================================================== */
  const COMBUSTIBLES = { gaz: ['Gaz naturel', 0.95], gpl: ['GPL (propane)', 0.93], fioul: ['Fioul domestique', 0.92], bois: ['Bois, biomasse', 0.85], elec: ['Électricité (PAC, chaudière électrique : sans combustion)', 1], reseau: ['Sous-station de réseau de chaleur (échangeur, sans combustion)', 1] };
  const BATIMENTS = { erp: 'Établissement recevant du public (règlement ERP, articles CH et GZ)', habitation: 'Bâtiment d\'habitation', bureaux: 'Bureaux, lieux de travail (code du travail)', industrie: 'Industrie, ateliers (code du travail)' };
  const IMPLANTATIONS = { local: 'Local dédié en rez-de-chaussée ou en étage', soussol: 'Local dédié en sous-sol', terrasse: 'Chaufferie en terrasse ou en toiture', exterieur: 'Générateurs à l\'extérieur (modules, PAC)', nonDedie: 'Local non dédié (cuisine, cellier, placard technique)' };
  const DEPUIS_TYPE_BAT = { bureaux: 'bureaux', enseignement: 'erp', ehpad: 'erp', creche: 'erp', gymnase: 'erp', hotel: 'erp', commerce: 'erp', restauration: 'erp', logement: 'habitation', industrie: 'industrie' };
  // Obligations : [libellé, référence, condition (contexte) → 'obligatoire' | 'conseil' | null]
  const OBLIGATIONS = {
    local: ['Local dédié aux générateurs, sans stockage étranger à la chaufferie', 'Arrêté du 23/06/1978 ; ERP : CH ; NF DTU 65.4', x => (x.chauff && x.implLocal ? 'obligatoire' : null)],
    parois: ['Parois, plancher haut et porte coupe-feu, porte à fermeture automatique (degrés selon le texte applicable, à vérifier)', 'Arrêté du 23/06/1978 ; ERP : CH ; code du travail', x => (x.chauff && x.implLocal ? 'obligatoire' : null)],
    portes: ['Porte(s) ouvrant vers l\'extérieur du local, manœuvrables de l\'intérieur sans clé, fermant à clé de l\'extérieur', 'Arrêté du 23/06/1978', x => (x.chauff && x.implLocal ? 'obligatoire' : null)],
    ventilation: ['Ventilation haute et basse du local (amenée d\'air et évacuation) — voir le calcul « Ventilation de chaufferie »', 'Arrêté du 23/06/1978 ; NF DTU 65.4 ; arrêté du 23/02/2018 (gaz)', x => (x.combustion ? 'obligatoire' : null)],
    coupureComb: ['Organe de coupure de l\'alimentation en combustible à l\'extérieur du local, signalé et accessible', 'Arrêté du 23/06/1978 ; NF DTU 61.1 ; ERP : GZ', x => (x.combustion && (x.chauff || x.gazeux) ? 'obligatoire' : null)],
    coupureElec: ['Coupure d\'urgence de l\'alimentation électrique de la chaufferie à l\'extérieur, près de l\'accès', 'Arrêté du 23/06/1978 ; NF C 15-100', x => (x.chauff ? 'obligatoire' : null)],
    detectionGaz: ['Détection de gaz asservie à la coupure (électrovanne) et à l\'arrêt des générateurs', 'Indicatif : obligatoire dans certains cas (sous-sol, ERP) — à vérifier dans le texte applicable', x => (x.gazeux && x.chauff ? (x.soussol ? 'obligatoire' : 'conseil') : null)],
    eclairage: ['Éclairage de sécurité (BAES) au droit des accès du local', 'Code du travail R. 4227-14 ; ERP : EC', x => (x.chauff ? 'obligatoire' : null)],
    extincteurs: ['Extincteurs adaptés au combustible et au risque électrique (bac à sable et pelle pour le fioul)', 'Code du travail R. 4227-29 ; règle APSAD R4', x => (x.chauff ? 'obligatoire' : null)],
    retention: ['Rétention du fioul : au moins 100 % de la plus grande cuve ou 50 % du volume total stocké', 'Arrêté du 01/07/2004 (stockage de fioul) ; ICPE', x => (x.comb === 'fioul' ? 'obligatoire' : null)],
    silo: ['Silo de bois séparé du local de la chaudière, dispositif anti-retour de flamme, détection et extinction', 'NF DTU 65.4 ; guides biomasse', x => (x.comb === 'bois' ? 'obligatoire' : null)],
    conduits: ['Conduits de fumée conformes (tubage, plaque signalétique), trappe de ramonage', 'NF DTU 24.1 ; arrêté du 22/10/1969', x => (x.combustion ? 'obligatoire' : null)],
    consignes: ['Consignes d\'exploitation et d\'urgence affichées, plan de l\'installation, numéros d\'urgence', 'Arrêté du 23/06/1978 ; code du travail', x => (x.chauff ? 'obligatoire' : null)],
    entretien: ['Entretien annuel des chaudières de 4 à 400 kW, attestation remise à l\'exploitant', 'Décret 2009-649 ; arrêté du 15/09/2009', x => (x.combustion && x.P >= 4 && x.P <= 400 ? 'obligatoire' : null)],
    cpee: ['Contrôle périodique de l\'efficacité énergétique (tous les 2 ans), livret de chaufferie, appareils de mesure', 'Arrêté du 02/10/2009 (chaudières de 400 kW à 20 MW)', x => (x.combustion && x.P > 400 && x.Pth < 20000 ? 'obligatoire' : null)],
    icpe: ['Installation classée (rubrique 2910) : dossier de déclaration ou d\'enregistrement, prescriptions générales, contrôle périodique', 'Code de l\'environnement, nomenclature ICPE 2910', x => (x.icpe ? 'obligatoire' : null)],
    verifErp: ['Vérifications périodiques des installations de chauffage et de gaz (technicien compétent ou organisme agréé)', 'Règlement ERP : CH 58, GZ 30', x => (x.erp && (x.combustion || x.chauff) ? 'obligatoire' : null)],
    ramonage: ['Ramonage des conduits de fumée (fréquence selon le combustible)', 'Règlement sanitaire départemental (art. 31)', x => (x.combustion ? 'obligatoire' : null)],
  };

  function calculerChauff(e) {
    const alertes = [], P = ou(e.P, 300), comb = COMBUSTIBLES[e.combustible] ? e.combustible : 'gaz', bat = BATIMENTS[e.batiment] ? e.batiment : 'bureaux', impl = IMPLANTATIONS[e.implantation] ? e.implantation : 'local';
    const eta = ou(e.rendement, COMBUSTIBLES[comb][1] * 100) / 100, combustion = !['elec', 'reseau'].includes(comb), gazeux = ['gaz', 'gpl'].includes(comb);
    const sCh = ou(e.sChauff, vReg('chaufferie.seuil', 70)), sDC = ou(e.sIcpeDC, vReg('icpe.dc', 1000)), sE = ou(e.sIcpeE, vReg('icpe.e', 20000)), sA = ou(e.sIcpeA, vReg('icpe.a', 50000));
    const clesRegl = [['sChauff', 'chaufferie.seuil'], ['sIcpeDC', 'icpe.dc'], ['sIcpeE', 'icpe.e'], ['sIcpeA', 'icpe.a']].filter(([k]) => vide(e[k])).map(x => x[1]);
    // Puissance thermique nominale (ICPE) : puissance maximale de combustible consommée, en PCI = puissance utile / rendement
    const Pth = combustion ? P / Math.max(0.3, eta) : 0;
    const chauff = P > sCh && impl !== 'exterieur', implLocal = !['exterieur', 'nonDedie'].includes(impl);
    const icpeClasse = !combustion ? 'non' : Pth >= sA ? 'A' : Pth >= sE ? 'E' : Pth >= sDC ? 'DC' : 'NC';
    const LIB_ICPE = { non: 'Non concerné (pas de combustion)', NC: 'Non classé', DC: 'Déclaration avec contrôle périodique (2910-A-2)', E: 'Enregistrement (2910-A-1)', A: 'Autorisation (rubrique 3110, installations de combustion ≥ 50 MW)' };
    let classe;
    if (impl === 'exterieur') classe = 'Générateurs extérieurs : pas de local de chaufferie ; règles d\'implantation (accès, distances aux baies, évacuation des produits de combustion)';
    else if (!chauff) classe = `Puissance utile ≤ ${nf(sCh, 0)} kW : pas de chaufferie au sens réglementaire, appareils admis hors local dédié sous conditions (ventilation, évacuation des fumées)`;
    else classe = `Chaufferie (puissance utile > ${nf(sCh, 0)} kW) en ${IMPLANTATIONS[impl].toLowerCase()}`;
    if (P > sCh && impl === 'nonDedie') alertes.push(alerte('erreur', `${nf(P, 0)} kW > ${nf(sCh, 0)} kW : les générateurs doivent être installés dans une chaufferie (local dédié).`));
    if (comb === 'gpl' && impl === 'soussol') alertes.push(alerte('erreur', 'GPL plus lourd que l\'air : générateurs et canalisations de GPL interdits en sous-sol.'));
    if (!combustion) alertes.push(alerte('ok', `${COMBUSTIBLES[comb][0]} : pas de combustion, la rubrique ICPE 2910 et les règles de ventilation de combustion ne s'appliquent pas (local technique selon le texte applicable au bâtiment).`));
    else alertes.push(alerte(icpeClasse === 'NC' ? 'ok' : 'attention', `Puissance thermique nominale ${nf(Pth / 1000, 2)} MW (PCI) : ICPE ${LIB_ICPE[icpeClasse].toLowerCase()}${icpeClasse === 'NC' ? '' : ' — à confirmer selon le combustible exact et la nomenclature en vigueur'}.`));
    if (bat === 'erp' && chauff) alertes.push(alerte('attention', 'ERP : chaufferie soumise aux articles CH (et GZ pour le gaz) du règlement de sécurité ; avis de la commission de sécurité pour les travaux soumis à autorisation.'));
    if (bat === 'habitation' && chauff) alertes.push(alerte('attention', 'Habitation : chaufferie soumise à l\'arrêté du 23/06/1978 (installations fixes de chauffage et d\'ECS des bâtiments d\'habitation, de bureaux ou recevant du public).'));
    // Check-list : obligations applicables et cases cochées
    const x = { P, Pth, comb, combustion, gazeux, chauff, implLocal, soussol: impl === 'soussol', erp: bat === 'erp', icpe: ['DC', 'E', 'A'].includes(icpeClasse) };
    const faits = Array.isArray(e.faits) ? e.faits : [];
    const liste = Object.entries(OBLIGATIONS).map(([k, [lib, ref, f]]) => ({ k, lib: k === 'ventilation' && e._ventilation ? `${lib} (${e._ventilation})` : lib, ref, niveau: f(x), fait: faits.includes(k) })).filter(o => o.niveau);
    const restent = liste.filter(o => o.niveau === 'obligatoire' && !o.fait);
    if (restent.length) alertes.push(alerte('attention', `${restent.length} obligation(s) à vérifier ou à réaliser : ${restent.map(o => o.lib.split(' (')[0].split(',')[0]).join(' ; ')}.`));
    else if (liste.length) alertes.push(alerte('ok', 'Toutes les obligations applicables sont cochées.'));
    if (combustion && !e._ventilation) alertes.push(alerte('attention', 'Ventilation haute et basse : ajouter un calcul « Ventilation de chaufferie » à l\'étude (sections des amenées d\'air et des évacuations).'));
    const r0 = {
      valeurs: { P, Pth, eta, combustible: comb, classe, chaufferie: chauff, icpe: icpeClasse, obligations: liste.length, restent: restent.length },
      resume: [['Puissance utile totale', `${nf(P, 0)} kW`], ['Combustible', COMBUSTIBLES[comb][0]], ['Puissance thermique nominale (PCI)', combustion ? `${nf(Pth, 0)} kW (rendement ${nf(eta * 100, 0)} %)` : 'sans objet'],
        ['Bâtiment', BATIMENTS[bat]], ['Classement du local', classe], ['ICPE (rubrique 2910)', LIB_ICPE[icpeClasse]],
        ['Contrôles périodiques', combustion ? (P <= 400 ? 'entretien annuel (4 à 400 kW)' : Pth < 20000 ? 'contrôle de l\'efficacité énergétique tous les 2 ans' : 'selon les prescriptions ICPE') + (x.icpe ? ' · contrôle ICPE' : '') + (x.erp ? ' · vérifications ERP' : '') : 'selon le matériel'],
        ['Obligations', `${liste.length} applicable(s) · ${liste.filter(o => o.fait).length} cochée(s) · ${restent.length} obligatoire(s) à faire`]],
      tableaux: [{ titre: 'Check-list des obligations (cochez-les dans la saisie)', entetes: ['Obligation', 'Niveau', 'Référence', 'État'], lignes: liste.map(o => [o.lib, o.niveau === 'obligatoire' ? 'Obligatoire' : 'Conseillé', o.ref, o.fait ? '✔ fait' : 'à faire']) },
        { titre: 'Seuils retenus (saisissables)', entetes: ['Seuil', 'Valeur', 'Référence'], lignes: [['Chaufferie (local dédié)', `> ${nf(sCh, 0)} kW utiles`, 'Arrêté du 23/06/1978 ; ERP : CH'],
          ['ICPE déclaration (DC)', `≥ ${nf(sDC / 1000, 0)} MW PCI`, 'Rubrique 2910-A-2'], ['ICPE enregistrement (E)', `≥ ${nf(sE / 1000, 0)} MW PCI`, 'Rubrique 2910-A-1'], ['Autorisation (IED)', `≥ ${nf(sA / 1000, 0)} MW PCI`, 'Rubrique 3110'],
          ['Entretien annuel', '4 à 400 kW', 'Décret 2009-649'], ['Contrôle de l\'efficacité énergétique', '400 kW à 20 MW', 'Arrêté du 02/10/2009']] }],
      onglets: [{ titre: 'Obligations', blocs: [{ titre: 'Obligations applicables', items: liste.map(o => ({ niveau: o.niveau, texte: `${o.fait ? '✔ ' : ''}${o.lib}`, ref: o.ref })) }] }],
      alertes,
      hypotheses: ['Puissance utile totale : somme des puissances des générateurs de chaleur du local (secours compris, puissance installée) ; groupes froids exclus.',
        'Puissance thermique nominale (ICPE) : puissance de combustible consommée en PCI = puissance utile / rendement.',
        `Seuils indicatifs saisissables : chaufferie au-delà de ${nf(sCh, 0)} kW, ICPE 2910-A (gaz naturel, GPL, fioul domestique, biomasse) : DC de 1 à 20 MW, E de 20 à 50 MW, au-delà rubrique 3110 ; combustibles hors 2910-A (2910-B) : seuils différents, à vérifier.`,
        'Les degrés coupe-feu, le nombre d\'accès et les dispositifs de détection dépendent du texte applicable (habitation, ERP, code du travail) et de la puissance : liste de contrôle à confirmer sur les textes en vigueur.'],
      synthese: `${nf(P, 0)} kW · ${COMBUSTIBLES[comb][0].split(' (')[0]} · ${chauff ? 'chaufferie' : impl === 'exterieur' ? 'extérieur' : '≤ 70 kW'} · ICPE ${icpeClasse === 'non' ? 'sans objet' : icpeClasse}${restent.length ? ` · ${restent.length} à faire` : ''}`,
    };
    return VR() ? VR().marquer(r0, clesRegl) : r0;
  }

  N.TYPES.chaufferie = {
    titre: 'Classement de chaufferie et obligations', icone: '🏭', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Puissance utile, combustible, type de bâtiment (ERP, habitation, code du travail), ICPE 2910 ; classement du local et check-list des obligations (local, ventilation, coupures, détection, contrôles périodiques).',
    champs: [{ g: 'Production' }, { k: 'pid', l: 'Schéma de principe de la chaufferie (vide : le premier de l\'étude)', t: 's', o: (e, et) => Ln().optPid(et, e && e.pid), d: '' },
      { k: 'P', l: 'Puissance utile totale (vide : somme des générateurs du schéma)', u: 'kW', d: '' },
      { k: 'combustible', l: 'Combustible', t: 's', o: [['', '— (repris du schéma, sinon gaz naturel)'], ...Object.entries(COMBUSTIBLES).map(([k, c]) => [k, c[0]])], d: '' },
      { k: 'rendement', l: 'Rendement PCI (vide : valeur usuelle du combustible)', u: '%', d: '' },
      { g: 'Bâtiment et local' }, { k: 'batiment', l: 'Type de bâtiment (vide : repris de l\'étude)', t: 's', o: [['', '— (repris de l\'étude, sinon bureaux)'], ...Object.entries(BATIMENTS)], d: '' },
      { k: 'implantation', l: 'Implantation', t: 's', o: Object.entries(IMPLANTATIONS), d: 'local' },
      { g: 'Seuils (indicatifs, saisissables)' }, { k: 'sChauff', l: 'Seuil de chaufferie (puissance utile ; vide : Réglages, 70)', u: 'kW', d: '' },
      { k: 'sIcpeDC', l: 'ICPE 2910 : seuil de déclaration (PCI ; vide : Réglages, 1 000)', u: 'kW', d: '' }, { k: 'sIcpeE', l: 'ICPE 2910 : seuil d\'enregistrement (PCI ; vide : Réglages, 20 000)', u: 'kW', d: '' }, { k: 'sIcpeA', l: 'Seuil de la rubrique 3110 (PCI ; vide : Réglages, 50 000)', u: 'kW', d: '' },
      { g: 'Check-list' }, { k: 'faits', l: 'Obligations réalisées ou vérifiées (seules les obligations applicables sont reprises dans les résultats)', t: 'cases', o: Object.entries(OBLIGATIONS).map(([k, [l, ref]]) => [k, l, ref]), d: [] }],
    calcul: calculerChauff,
    // Puissance et combustible repris des générateurs du schéma de principe ; type de bâtiment de l'étude ; calcul de ventilation
    lier(ctx) {
      const { n, choisi } = pidDe(ctx, ctx.e.pid);
      if (ctx.e.pid && !n) ctx.alertes.push(alerte('attention', 'Le schéma de principe choisi a été supprimé : valeurs saisies conservées.'));
      if (n) {
        const gens = generateursPid(ctx.resoudre(n)), P = gens.reduce((a, g) => a + g.P, 0), comb = gens.map(g => combustibleDe(g.type)), cb = comb.find(c => !['elec', 'reseau'].includes(c)) || comb[0];
        const Cmb = Ln().COMBUSTION || {}, g0 = gens.find(g => combustibleDe(g.type) === cb), rd = g0 && Cmb[g0.type] ? Math.round(Cmb[g0.type][1] * 100) : NaN;
        const src = `${ctx.libelle(n)} (${gens.length} générateur(s))`, vals = { P: Math.round(P * 10) / 10 || NaN, combustible: cb, rendement: rd };
        if (choisi) ctx.imposer(vals, src); else ctx.proposer(vals, src);
        if (new Set(comb).size > 1) ctx.alertes.push(alerte('attention', `${ctx.libelle(n)} : production mixte (${[...new Set(comb)].map(c => COMBUSTIBLES[c][0].split(' (')[0]).join(', ')}) : puissance totale retenue, classement à vérifier par local.`));
      }
      const tb = ctx.etude && ctx.etude.typeBatiment;
      if (DEPUIS_TYPE_BAT[tb]) ctx.proposer({ batiment: DEPUIS_TYPE_BAT[tb] }, 'type de bâtiment de l\'étude');
      const v = notesDe(ctx, 'ventilation')[0];
      if (v) { const r = ctx.calculer(v); ctx.e._ventilation = `${ctx.libelle(v)} : ${r.synthese || ''}`; }
    },
  };

  /* =====================================================================================================================
     23. Calorifugeage économique
     ===================================================================================================================== */
  const EPAISSEURS = [0, 10, 20, 25, 30, 40, 50, 60, 80, 100];
  // Classes d'isolation 1 à 6 (NF EN 12828, annexe B, indicatif) : U maximal (W/m·K) = a · De (m) + b
  const CLASSES = [[3.3, 0.22], [2.6, 0.20], [2.0, 0.18], [1.5, 0.16], [1.1, 0.14], [0.8, 0.12]];
  const classeIsolation = (U, De) => { let c = 0; CLASSES.forEach(([a, b], i) => { if (U <= a * De + b + 1e-12) c = i + 1; }); return c; };

  function calculerCalo(e) {
    const alertes = [], C = Ca(), D = Dn(), iso = D.ISOLANTS[e.isolant] ? e.isolant : 'laine-verre', I = D.ISOLANTS[iso], eps = (D.REVETEMENTS[e.revetement] || ['', 0.9])[1];
    const Ta = ou(e.Ta, 20), hDef = ou(e.heures, 5000), prix = ou(e.prix, 0.12), eta = ou(e.rendement, 90) / 100, cF = ou(e.coutFixe, 10), cV = ou(e.coutVolume, 600), duree = ou(e.duree, 20);
    const exigee = Math.max(0, Math.min(6, Math.round(ou(e.classeMin, 0))));
    const lignes = (e.lignes || []).filter(l => l && num(l.de) > 0 && num(l.L) > 0).map((l, i) => {
      const De = num(l.de) / 1000, L = num(l.L), T = ou(l.T, 70), h = ou(l.heures, hDef), dT = Math.abs(T - Ta) || 1;
      if (T > I.tmax || T < I.tmin) alertes.push(alerte('erreur', `${l.rep || `Ligne ${i + 1}`} : ${nf(T, 0)} °C hors du domaine d'emploi de l'isolant (${I.tmin} à ${I.tmax} °C).`));
      const ep = EPAISSEURS.map(x => {
        const r = C.isolation({ De, e: x / 1000, Tf: T, Ta, isolant: iso, emissivite: x ? eps : 0.9 }), q = Math.abs(r.q);
        const kWh = q * L * h / 1000 / Math.max(0.1, eta), cout = kWh * prix, invest = x ? L * (cF + cV * Math.PI / 4 * ((De + 2 * x / 1000) ** 2 - De ** 2)) : 0;
        return { e: x, q, U: q / dT, kWh, cout, invest, classe: classeIsolation(q / dT, De), Ts: r.Ts };
      });
      const nu = ep[0];
      ep.forEach(x => { x.gain = nu.cout - x.cout; x.trb = x.e && x.gain > 0 ? x.invest / x.gain : NaN; x.global = x.invest + duree * x.cout; });
      const opt = ep.reduce((a, x) => (x.global < a.global ? x : a), ep[0]);
      const pourClasse = exigee ? ep.find(x => x.classe >= exigee) : null, ret = pourClasse && pourClasse.e > opt.e ? pourClasse : opt;
      if (exigee && !pourClasse) alertes.push(alerte('erreur', `${l.rep || `Ligne ${i + 1}`} : classe ${exigee} inaccessible avec 100 mm de cet isolant.`));
      return { rep: l.rep || `L${i + 1}`, De, L, T, h, ep, nu, opt, ret };
    });
    if (!lignes.length) alertes.push(alerte('attention', 'Ajoutez les tuyauteries (diamètre extérieur, longueur, température) ou reprenez-les des réseaux de l\'étude.'));
    const tot = k => lignes.reduce((a, l) => a + l.ret[k], 0), totNu = k => lignes.reduce((a, l) => a + l.nu[k], 0);
    const invest = tot('invest'), gain = totNu('cout') - tot('cout'), trb = gain > 0 ? invest / gain : NaN;
    if (lignes.length) alertes.push(alerte('ok', `Calorifugeage retenu : ${nf(invest, 0)} € d'investissement, ${nf(totNu('kWh') - tot('kWh'), 0)} kWh/an et ${nf(gain, 0)} €/an économisés, temps de retour ${nf(trb, 1)} an(s).`));
    const faibles = lignes.filter(l => l.ret.classe < 2 && l.ret.e > 0);
    if (faibles.length) alertes.push(alerte('attention', `${faibles.map(l => l.rep).join(', ')} : classe d'isolation inférieure à 2 à l'optimum économique — vérifier l'exigence réglementaire ou du CCTP (champ « classe minimale »).`));
    if (lignes.some(l => l.T < Ta)) alertes.push(alerte('attention', 'Réseaux froids : l\'épaisseur doit d\'abord éviter la condensation (note « Isolation des tuyauteries »), isolant à cellules fermées avec pare-vapeur ; rendement = efficacité de la production de froid.'));
    return {
      valeurs: { invest, gain, trb, kWhNu: totNu('kWh'), kWhIso: tot('kWh'), lignes: lignes.map(l => ({ rep: l.rep, e: l.ret.e, opt: l.opt.e, classe: l.ret.classe, trb: l.ret.trb })) },
      resume: [['Isolant', `${I.libelle}`], ['Énergie', `${nf(prix, 3)} €/kWh, rendement ${nf(eta * 100, 0)} %, ${nf(hDef, 0)} h/an par défaut`],
        ['Calorifuge', `${nf(cF, 2)} €/m + ${nf(cV, 0)} €/m³ d'isolant posé, analyse sur ${nf(duree, 0)} ans`],
        ['Pertes nues → isolées', `${nf(totNu('kWh'), 0)} → ${nf(tot('kWh'), 0)} kWh/an`], ['Investissement', `${nf(invest, 0)} €`], ['Économie annuelle', `${nf(gain, 0)} €/an`], ['Temps de retour global', `${nf(trb, 1)} an(s)`]],
      tableaux: [{ titre: 'Épaisseur retenue par tuyauterie (optimum du coût global)', entetes: ['Tuyauterie', 'De (mm)', 'L (m)', 'T (°C)', 'q nu (W/m)', 'Épaisseur optimale (mm)', 'Épaisseur retenue (mm)', 'q isolé (W/m)', 'Économie (kWh/an)', 'Économie (€/an)', 'Investissement (€)', 'Retour (ans)', 'Classe'],
        lignes: lignes.map(l => [l.rep, nf(l.De * 1000, 1), nf(l.L, 0), nf(l.T, 0), nf(l.nu.q, 1), String(l.opt.e), String(l.ret.e), nf(l.ret.q, 1), nf(l.nu.kWh - l.ret.kWh, 0), nf(l.ret.gain, 0), nf(l.ret.invest, 0), nf(l.ret.trb, 1), l.ret.classe ? String(l.ret.classe) : '—']) },
      ...lignes.map(l => ({ titre: `${l.rep} : épaisseurs de 0 à 100 mm`, entetes: ['Épaisseur (mm)', 'q (W/m)', 'U (W/m·K)', 'kWh/an', 'Coût énergie (€/an)', 'Investissement (€)', 'Retour (ans)', `Coût global ${nf(duree, 0)} ans (€)`, 'Classe'],
        lignes: l.ep.map(x => [String(x.e), nf(x.q, 1), nf(x.U, 3), nf(x.kWh, 0), nf(x.cout, 0), nf(x.invest, 0), nf(x.trb, 1), nf(x.global, 0), x.classe ? String(x.classe) : '—']), surligne: l.ep.indexOf(l.ret) }))],
      alertes,
      hypotheses: ['Déperditions : conduction radiale dans l\'isolant et échanges extérieurs (convection naturelle, rayonnement), même méthode que la note « Isolation des tuyauteries » ; résistances intérieure et de paroi négligées.',
        'Énergie perdue = q · L · heures / rendement ; coût = énergie × prix saisi.',
        'Coût du calorifuge = L × (coût fixe par mètre + coût volumique × volume d\'isolant) : valeurs saisies, à remplacer par les prix de l\'entreprise.',
        `Épaisseur optimale : coût global minimal (investissement + ${nf(duree, 0)} ans d'énergie, sans actualisation) ; temps de retour = investissement / économie annuelle.`,
        'Classes d\'isolation 1 à 6 (NF EN 12828, annexe B) : U = q / ΔT ≤ a · De + b ; valeurs indicatives, l\'exigence réglementaire (arrêtés « existant », RE2020) ou du CCTP prime.'],
      synthese: lignes.length ? `${lignes.length} tuyauterie(s) · ${nf(invest, 0)} € · ${nf(gain, 0)} €/an · retour ${nf(trb, 1)} an(s)` : 'Aucune tuyauterie',
    };
  }

  N.TYPES.calorifugeEco = {
    titre: 'Calorifugeage économique (épaisseur optimale, temps de retour)', icone: '🧶', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Pertes nues et isolées par diamètre, épaisseurs de 0 à 100 mm, coût de l\'énergie et du calorifuge, temps de retour, épaisseur optimale et classe d\'isolation (NF EN 12828).',
    champs: [{ g: 'Isolant et ambiance' }, { k: 'isolant', l: 'Isolant', t: 's', o: () => Object.entries(Dn().ISOLANTS).map(([k, i]) => [k, i.libelle]), d: 'laine-verre' },
      { k: 'revetement', l: 'Surface extérieure', t: 's', o: () => Object.entries(Dn().REVETEMENTS).map(([k, [l]]) => [k, l]), d: 'pvc' },
      { k: 'Ta', l: 'Température ambiante', u: '°C', d: 20 }, { k: 'heures', l: 'Durée de fonctionnement par défaut', u: 'h/an', d: 5000 },
      { g: 'Coûts (saisis)' }, { k: 'prix', l: 'Prix de l\'énergie', u: '€/kWh', d: 0.12 }, { k: 'rendement', l: 'Rendement de la production', u: '%', d: 90 },
      { k: 'coutFixe', l: 'Calorifuge : coût fixe (main-d\'œuvre, finition)', u: '€/m', d: 10 }, { k: 'coutVolume', l: 'Calorifuge : coût de l\'isolant posé', u: '€/m³', d: 600 },
      { k: 'duree', l: 'Durée d\'analyse', u: 'ans', d: 20 }, { k: 'classeMin', l: 'Classe d\'isolation minimale exigée (0 : aucune)', d: 0 },
      { g: 'Tuyauteries' }, { k: 'lignes', l: 'Tuyauteries (reprises des réseaux de l\'étude si vide)', t: 'lignes', d: [],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'de', l: 'Ø extérieur (mm)' }, { k: 'L', l: 'Longueur (m)' }, { k: 'T', l: 'Température du fluide (°C)' }, { k: 'heures', l: 'Heures/an (vide : par défaut)' }] }],
    calcul: calculerCalo,
    // Tronçons des réseaux et pompes, circuits des schémas de principe (diamètre, longueur, température)
    lier(ctx) {
      const C = Ca(), out = [], srcs = [];
      notesDe(ctx, 'reseau').forEach(n => {
        const es = ctx.resoudre(n), v = ctx.calculer(n).valeurs || {};
        (v.troncons || []).forEach(t => { const u = C.tube(t.serie || es.serie, t.tube); if (u && t.L > 0) out.push({ rep: `${n.titre} — ${t.rep}`, de: u.de, L: t.L, T: num(es.T, 70), heures: '' }); });
        if ((v.troncons || []).length) srcs.push(ctx.libelle(n));
      });
      notesDe(ctx, 'pid').forEach(n => {
        const es = ctx.resoudre(n), v = ctx.calculer(n).valeurs || {}, R = (Sc().REGIMES || {})[es.reseau];
        const Tm = es.reseau === 'perso' ? (num(es.Tdep) + num(es.Tret)) / 2 : es.reseau === 'co' ? (num(es.TdepC) + num(es.TretC)) / 2 : R ? (R[1] + R[2]) / 2 : 60;
        (v.circuits || []).forEach(c => { const u = C.tube(es.serie, c.tube); if (u && c.L > 0) out.push({ rep: `${n.titre} — ${c.rep}`, de: u.de, L: c.L, T: Math.round(Tm * 10) / 10, heures: '' }); });
        if ((v.circuits || []).length) srcs.push(ctx.libelle(n));
      });
      if (out.length) ctx.proposer({ lignes: out }, srcs.join(', '));
    },
  };

  /* =====================================================================================================================
     24. Traitement d'eau et désembouage (VDI 2035, NF EN 12828, NF EN 14868)
     ===================================================================================================================== */
  // Dureté totale admissible de l'eau de remplissage et d'appoint (°dH, somme des alcalino-terreux) selon la puissance totale et le
  // volume spécifique (VDI 2035-1, valeurs guides) : [P max kW, [≤ 20 L/kW, > 20 et ≤ 50 L/kW, > 50 L/kW]]
  const VDI = [[50, [16.8, 11.2, 0.11]], [200, [11.2, 8.4, 0.11]], [600, [8.4, 0.11, 0.11]], [Infinity, [0.11, 0.11, 0.11]]];
  const DH_F = 1.78; // 1 °dH = 1,78 °f
  const thLimite = (P, Vs) => { const l = VDI.find(([p]) => P <= p)[1]; return Vs <= 20 ? l[0] : Vs <= 50 ? l[1] : l[2]; };
  const MATERIAUX = [['alu', 'Aluminium et alliages (échangeurs de chaudières)'], ['acier', 'Acier, fonte'], ['cuivre', 'Cuivre, laiton'], ['inox', 'Acier inoxydable']];
  const ETAPES = ['Diagnostic : analyse de l\'eau en place (pH, conductivité, dureté, fer, aspect), relevé des désordres (corps de chauffe froids, bruits, purges fréquentes).',
    'Protection : isoler ou déposer les générateurs et équipements sensibles (échangeurs à plaques, vannes de régulation), poser des filtres provisoires.',
    'Injection du désembouant (dosage selon la fiche du produit) et circulation à débit élevé, si possible réseau chaud, pendant la durée préconisée.',
    'Rinçage par chasse, circuit par circuit et en inversant le sens si possible, jusqu\'à obtention d\'une eau claire ; contrôle de la conductivité et du pH.',
    'Pose ou contrôle du désemboueur (magnétique, sur le retour général avant les générateurs) et du filtre ; nettoyage des pots à boue.',
    'Remplissage à l\'eau traitée (adoucie ou déminéralisée selon le calcul), compteur d\'appoint relevé et noté, disconnecteur contrôlé.',
    'Injection de l\'inhibiteur de corrosion (dosage selon la fiche du produit), purge de l\'air, mise en température.',
    'Analyse de contrôle 8 à 12 semaines après la mise en service (pH stabilisé, conductivité, concentration d\'inhibiteur), puis annuelle ; carnet d\'entretien tenu à jour.'];

  function calculerEau(e) {
    const alertes = [], C = Ca(), V = ou(e.V, 1000), P = ou(e.P, 100), TH = ou(e.TH, 25), cond = ou(e.cond, 400), pH = ou(e.pH, 7.5);
    const mats = Array.isArray(e.materiaux) ? e.materiaux : [], alu = mats.includes('alu'), Vs = P > 0 ? V / P : 0;
    const app = ou(e.appoint, 5), duree = ou(e.duree, 20), Vcum = vide(e.Vcumul) ? V * (1 + app / 100 * duree) : num(e.Vcumul);
    // Valeur guide de dureté (VDI 2035-1), réduite au prorata si l'eau cumulée de remplissage et d'appoint dépasse 3 fois le volume
    const thVdi = thLimite(P, Vs) * DH_F, thBase = vide(e.THmax) ? thVdi : num(e.THmax), fCum = Math.max(1, Vcum / (3 * Math.max(1, V))), thAdm = thBase / fCum;
    let decision;
    if (TH <= thAdm) decision = 'brute';
    else if (thAdm >= 1 && !alu) decision = 'adoucissement';
    else decision = 'demineralisation';
    const LIB = { brute: 'Eau de remplissage brute admise (dureté)', adoucissement: 'Adoucissement de l\'eau de remplissage et d\'appoint', demineralisation: 'Déminéralisation de l\'eau de remplissage et d\'appoint (fonctionnement pauvre en sels)' };
    alertes.push(alerte(decision === 'brute' ? 'ok' : 'attention', `${LIB[decision]} : TH ${nf(TH, 1)} °f pour ${nf(thAdm, 2)} °f admissibles (${nf(P, 0)} kW, ${nf(Vs, 1)} L/kW, ${nf(Vcum / 1000, 1)} m³ d'eau cumulée).`));
    if (alu && decision === 'adoucissement') alertes.push(alerte('attention', 'Aluminium : l\'adoucissement remonte le pH ; préférer une eau déminéralisée.'));
    const pHmax = alu ? 8.5 : 10;
    alertes.push(alerte('attention', `pH de l'eau en circulation (après 8 à 12 semaines) à maintenir entre 8,2 et ${nf(pHmax, 1)}${alu ? ' (aluminium : 9,0 au plus selon le constructeur)' : ''} ; pH de remplissage mesuré : ${nf(pH, 1)}.`));
    if (cond > 1500) alertes.push(alerte('attention', `Conductivité ${nf(cond, 0)} µS/cm au-delà de 1 500 µS/cm : eau très minéralisée, déminéralisation conseillée.`));
    if (alu && cond > 100 && decision !== 'demineralisation') alertes.push(alerte('attention', 'Aluminium : fonctionnement pauvre en sels conseillé (conductivité < 100 µS/cm).'));
    if (app > 10) alertes.push(alerte('attention', `Appoint de ${nf(app, 0)} %/an : rechercher les fuites ; un appoint régulier apporte calcaire et oxygène.`));
    if (thBase !== thVdi) alertes.push(alerte('ok', `Dureté maximale de la notice du générateur retenue (${nf(thBase, 2)} °f) à la place de la valeur guide VDI 2035 (${nf(thVdi, 2)} °f).`));
    // Calcaire apporté : 1 °f = 10 mg/L de CaCO3
    const calcaire = TH * 10 * Vcum / 1e6; // kg
    // Désemboueur : DN de la tuyauterie de retour général (v ≤ 1 m/s) au débit de la production
    const dT = ou(e.dT, 20), Q = P / (1.163 * Math.max(1, dT)), vmax = ou(e.vmax, 1);
    const tubes = C.tubes('acier-10255').concat(C.tubes('acier-10216').filter(t => t.dn > 150)), tb = tubes.find(t => Q / 3600 / (Math.PI * (t.di / 2000) ** 2) <= vmax) || tubes[tubes.length - 1];
    const dosI = ou(e.dosageInhib, 1), dosD = ou(e.dosageDes, 1), existante = e.etat === 'existante';
    if (existante) alertes.push(alerte('attention', 'Installation existante : désembouage avant raccordement du nouveau générateur (exigé par la plupart des constructeurs), procédure ci-dessous.'));
    alertes.push(alerte('attention', 'Remplissage par disconnecteur BA (eau traitée de catégorie 3 ou 4, NF EN 1717) avec compteur d\'appoint relevé et consigné au carnet d\'entretien.'));
    const prod = [['Inhibiteur de corrosion', `${nf(dosI, 2)} % du volume`, `${nf(V * dosI / 100, 1)} L`, 'Dosage indicatif : suivre la fiche du produit retenu'],
      ...(existante || e.desembouage === 'oui' ? [['Désembouant', `${nf(dosD, 2)} % du volume`, `${nf(V * dosD / 100, 1)} L`, 'Dosage indicatif : suivre la fiche du produit retenu']] : [])];
    return {
      valeurs: { V, P, Vs, Vcum, thVdi, thAdm, decision, calcaire, Q, dnDesemboueur: tb.dn, inhibiteur: V * dosI / 100 },
      resume: [['Installation', `${nf(V, 0)} L · ${nf(P, 0)} kW · ${nf(Vs, 1)} L/kW${mats.length ? ` · ${mats.map(m => (MATERIAUX.find(x => x[0] === m) || [m, m])[1].split(' (')[0].toLowerCase()).join(', ')}` : ''}`],
        ['Eau de remplissage', `TH ${nf(TH, 1)} °f (${nf(TH / DH_F, 1)} °dH) · ${nf(cond, 0)} µS/cm · pH ${nf(pH, 1)}`], ['Eau cumulée (remplissage + appoint)', `${nf(Vcum / 1000, 2)} m³ sur ${nf(duree, 0)} ans (${nf(Vcum / Math.max(1, V), 1)} × le volume)`],
        ['Dureté admissible', `${nf(thAdm, 2)} °f (valeur guide ${nf(thBase, 2)} °f${fCum > 1 ? `, réduite d'un facteur ${nf(fCum, 2)}` : ''})`], ['Décision', LIB[decision]],
        ['Calcaire potentiel apporté', `${nf(calcaire, 2)} kg de CaCO₃`], ['Désemboueur et filtre', `DN ${tb.dn} sur le retour général (${nf(Q, 2)} m³/h)`], ['Compteur d\'appoint', 'obligatoire de fait pour suivre l\'eau cumulée (VDI 2035), relevé consigné']],
      tableaux: [{ titre: 'Valeurs guides de dureté (VDI 2035-1, °f)', entetes: ['Puissance totale', '≤ 20 L/kW', '20 à 50 L/kW', '> 50 L/kW'], lignes: VDI.map(([p, l], i) => [i ? `${VDI[i - 1][0]} à ${Number.isFinite(p) ? p : '∞'} kW` : `≤ ${p} kW`, ...l.map(x => nf(x * DH_F, 1))]) },
        { titre: 'Produits (dosages indicatifs)', entetes: ['Produit', 'Dosage', 'Quantité', 'Remarque'], lignes: prod }],
      onglets: [{ titre: 'Désembouage', blocs: [{ titre: 'Procédure de désembouage et de mise en eau', liste: ETAPES, texte: ['Procédure type d\'après NF EN 14868 et les guides de traitement d\'eau ; les durées et dosages sont ceux de la fiche du produit retenu.'] }] }],
      alertes,
      hypotheses: ['Valeurs guides de dureté de la VDI 2035-1 (édition 2005, reprises par la plupart des constructeurs) selon la puissance totale et le volume spécifique ; la notice du générateur prime (champ « dureté maximale »).',
        'Eau cumulée = volume × (1 + appoint annuel × durée) ; au-delà de 3 fois le volume de l\'installation, la dureté admissible est réduite au prorata (VDI 2035).',
        'Décision : eau brute si TH ≤ TH admissible ; sinon adoucissement si TH admissible ≥ 1 °f et sans aluminium ; sinon déminéralisation.',
        `Conversions : 1 °dH = 1,78 °f ; 1 °f = 10 mg/L de CaCO₃. Désemboueur au DN du retour général pour v ≤ ${nf(vmax, 1)} m/s au débit P / (1,163 · ΔT).`,
        'pH guide de l\'eau en circulation : 8,2 à 10,0, 8,2 à 8,5 en présence d\'aluminium (VDI 2035-2, indicatif) ; conductivité < 100 µS/cm en fonctionnement pauvre en sels.'],
      synthese: `${nf(V, 0)} L · ${nf(P, 0)} kW · TH ${nf(TH, 0)} °f / ${nf(thAdm, 1)} °f admis · ${decision === 'brute' ? 'eau brute' : decision}`,
    };
  }

  N.TYPES.traitementEau = {
    titre: 'Traitement d\'eau et désembouage', icone: '🧪', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Volume et puissance de l\'installation, matériaux, qualité de l\'eau de remplissage (TH, conductivité, pH) contre les valeurs guides VDI 2035, eau cumulée, adoucissement ou déminéralisation, filtre et désemboueur, produits et procédure de désembouage.',
    champs: [{ g: 'Installation' }, { k: 'pid', l: 'Schéma de principe (vide : le premier de l\'étude)', t: 's', o: (e, et) => Ln().optPid(et, e && e.pid), d: '' },
      { k: 'V', l: 'Volume d\'eau de l\'installation (vide : repris du schéma de principe)', u: 'L', d: '' },
      { k: 'P', l: 'Puissance totale des générateurs (vide : reprise du schéma)', u: 'kW', d: '' },
      { k: 'materiaux', l: 'Matériaux en contact avec l\'eau', t: 'cases', o: MATERIAUX, d: ['acier', 'cuivre'] },
      { k: 'etat', l: 'Installation', t: 's', o: [['neuve', 'Neuve'], ['existante', 'Existante (raccordement d\'un nouveau générateur)']], d: 'neuve' },
      { k: 'desembouage', l: 'Désembouage prévu', t: 's', o: [['non', 'Non'], ['oui', 'Oui']], d: 'non', si: e => e.etat !== 'existante' },
      { g: 'Eau de remplissage' }, { k: 'TH', l: 'Dureté totale (TH)', u: '°f', d: 25 }, { k: 'cond', l: 'Conductivité', u: 'µS/cm', d: 400 }, { k: 'pH', l: 'pH', d: 7.5 },
      { k: 'THmax', l: 'Dureté maximale de la notice du générateur (vide : valeur guide VDI 2035)', u: '°f', d: '' },
      { g: 'Appoint' }, { k: 'appoint', l: 'Appoint annuel', u: '% du volume', d: 5 }, { k: 'duree', l: 'Durée de vie considérée', u: 'ans', d: 20 },
      { k: 'Vcumul', l: 'Volume cumulé de remplissage et d\'appoint (vide : calculé)', u: 'L', d: '' },
      { g: 'Filtration et produits' }, { k: 'dT', l: 'Écart de température de la production', u: 'K', d: 20 }, { k: 'vmax', l: 'Vitesse maximale au désemboueur', u: 'm/s', d: 1 },
      { k: 'dosageInhib', l: 'Dosage de l\'inhibiteur (fiche du produit)', u: '%', d: 1 }, { k: 'dosageDes', l: 'Dosage du désembouant (fiche du produit)', u: '%', d: 1 }],
    calcul: calculerEau,
    // Volume d'eau (valeurs.volume) et puissance des générateurs repris du schéma de principe
    lier(ctx) {
      const { n, choisi } = pidDe(ctx, ctx.e.pid);
      if (ctx.e.pid && !n) ctx.alertes.push(alerte('attention', 'Le schéma de principe choisi a été supprimé : valeurs saisies conservées.'));
      if (!n) return;
      const v = ctx.calculer(n).valeurs || {}, P = generateursPid(ctx.resoudre(n)).reduce((a, g) => a + g.P, 0);
      const vals = { V: Number.isFinite(v.volume) && v.volume > 0 ? Math.round(v.volume) : NaN, P: P > 0 ? Math.round(P * 10) / 10 : NaN };
      if (choisi) ctx.imposer(vals, ctx.libelle(n)); else ctx.proposer(vals, ctx.libelle(n));
    },
  };

  return { COMBUSTIBLES, BATIMENTS, OBLIGATIONS, CLASSES, VDI, EPAISSEURS, generateursPid, combustibleDe, classeIsolation, thLimite, calculerChauff, calculerCalo, calculerEau };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = AnnexesReglementaire;
