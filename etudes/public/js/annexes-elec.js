// Calculs annexes → bilan électrique et points GTC, analyse fonctionnelle (séquences) et métré. Chaque calcul annexe qui pose du matériel (pompe, ventilateur,
// sonde, sécurité, compteur, électrovanne…) donne ses lignes d'équipements à l'armoire (Electricite.equipementsEtude) ;
// les points GTB / GTC en découlent par la régulation de chaque ligne (sonde → mesure EA, securite → alarme ETOR,
// tor → marche + défaut, var → marche + vitesse + défaut, impulsion → comptage, contact → état, bus → communication).
// Les lignes déjà données par un calcul (versElec propre : pompe, extracteur, groupe…) sont complétées ici par les
// mesures, sécurités et comptages attendus en exploitation. Les calculs sans matériel électrique (vérifications,
// réglementation, aides) n'ajoutent rien. Chaque type reçoit aussi versRegulation (analyse fonctionnelle, séquences
// démarrage / marche / arrêt / défaut / réarmement, paramètres par défaut à valider) et versMetre (postes du métré, donc
// chiffrage et matériel retenu). Module pur (navigateur, node, tests).
const AnnexesElec = ((N) => {
  const num = (v, d = 0) => N.num(v, d), nf = (v, d) => N.nf(v, d);
  const sonde = (rep, designation) => ({ rep, designation, type: 'sonde', P: 0, tension: '24V', regulation: 'sonde' });
  const secu = (rep, designation) => ({ rep, designation, type: 'securite', P: 0.01, tension: '24V', regulation: 'securite' });
  const comptage = (rep, designation) => ({ rep, designation, type: 'sonde', P: 0, tension: '24V', regulation: 'impulsion' });
  const contact = (rep, designation) => ({ rep, designation, type: 'sonde', P: 0, tension: '24V', regulation: 'contact' });
  const nbLocaux = v => (Array.isArray(v.locaux) ? v.locaux.length : num(v.locaux));

  // Lignes complémentaires par type de calcul annexe : (valeurs, entrées, note) → [lignes]
  const COMPLEMENTS = {
    // Plancher chauffant : thermostat de sécurité (coupure du circulateur au-delà de 50 °C au départ), sonde de départ ;
    // en rafraîchissement : sonde d'hygrométrie pour la limite de point de rosée
    plancher: (v, e) => [secu('TS-PL', 'Thermostat de sécurité du plancher chauffant (coupure du circulateur, départ > 50 °C)'), sonde('TD-PL', 'Sonde de température de départ du plancher'),
      ...(e.rafraich === 'oui' ? [sonde('HR-PL', `Sonde d'hygrométrie d'ambiance (limite du point de rosée en rafraîchissement, ${nf(v.Tros, 1)} °C)`)] : [])],
    // Plafonds et poutres froides : détecteurs de condensation sur les tubes, hygrométrie d'ambiance, sonde de départ
    plafonds: v => [secu('DC-PF', `Détecteurs de condensation des plafonds / poutres froides (fermeture de vanne)${nbLocaux(v) ? ` — ${nbLocaux(v)} zone(s)` : ''}`),
      sonde('HR-PF', 'Sonde d\'hygrométrie d\'ambiance (point de rosée)'), sonde('TD-PF', 'Sonde de température de départ de l\'eau froide des plafonds')],
    // Échangeur : sondes de départ secondaire et de retour primaire (régulation, contrôle du pincement)
    echangeurPlaques: v => (v.P > 0 ? [sonde('TS-ECH', 'Sonde de température de départ secondaire de l\'échangeur'), sonde('TRP-ECH', 'Sonde de température de retour primaire de l\'échangeur')] : []),
    // Géothermie : contrôleur de débit et pressostat du circuit glycolé, sondes entrée / sortie du champ de sondes, comptage
    geothermie: v => (v.P > 0 || v.Pext > 0 ? [secu('CD-GEO', 'Contrôleur de débit du circuit des sondes géothermiques'), secu('PS-GEO', 'Pressostat de sécurité du circuit glycolé (manque de pression)'),
      sonde('TE-GEO', 'Sonde de température d\'entrée du champ de sondes'), sonde('TS-GEO', 'Sonde de température de sortie du champ de sondes'), comptage('CPT-GEO', 'Compteur d\'énergie prélevée au sol')] : []),
    // Solaire : régulateur différentiel, sondes capteurs et ballon, comptage de l'énergie solaire, alarme de surchauffe
    solaireEcs: v => (v.S > 0 ? [{ rep: 'RG-SOL', designation: 'Régulateur solaire différentiel (report d\'état et de défaut)', type: 'regulateur', P: 0.01, tension: 'mono', regulation: 'regul' },
      sonde('TC-SOL', 'Sonde de température des capteurs solaires'), sonde('TB-SOL', 'Sonde de température bas du ballon solaire'),
      comptage('CPT-SOL', `Compteur d'énergie solaire (${nf(v.S, 1)} m² de capteurs)`), secu('SUR-SOL', 'Alarme de surchauffe / stagnation du circuit solaire')] : []),
    // DRV : passerelle de communication vers la GTC (états, défauts et consignes des unités par bus)
    drv: v => (v.PelUE > 0 ? [{ rep: `GW-${v.repUE || 'DRV'}`, designation: 'Passerelle de communication DRV ↔ GTC (Modbus / BACnet : unités intérieures et extérieure)', type: 'regulateur', P: 0.02, tension: 'mono', regulation: 'bus' }] : []),
    // Fluides frigorigènes : détection de fuite obligatoire à partir de 500 t éq. CO₂ (règlement F-gaz) ou prévue sur l'équipement
    fluides: (v, e) => (v.equipements || []).map((x, i) => ({ ...((e.equipements || [])[i] || {}), ...x })).filter(x => x && (x.tCO2e >= 500 || /oui/i.test(String(x.detection || '')))).map(x => secu(`DF-${x.rep || 'GF'}`, `Détecteur de fuite de fluide frigorigène — ${x.rep || 'équipement'} (${x.fluide || ''}, ${nf(x.tCO2e, 0)} t éq. CO₂)`)),
    // Chambre froide : sonde d'ambiance (enregistrement HACCP), contact de porte, alarme de personne enfermée
    chambreFroide: (v, e) => (v.Pevap > 0 ? [sonde(`${v.repGroupe || 'CF'}-TA`, `Sonde de température de la chambre froide (${nf(num(e.Ti), 0)} °C, enregistrement)`), contact(`${v.repGroupe || 'CF'}-PO`, 'Contact de porte de la chambre froide (arrêt des ventilateurs, alarme porte ouverte)'),
      secu(`${v.repGroupe || 'CF'}-PE`, 'Alarme de personne enfermée (bouton d\'appel intérieur)'), ...(num(e.Ti) > 0 ? [] : [{ rep: `${v.repGroupe || 'CF'}-RP`, designation: 'Cordon chauffant de porte (chambre négative)', type: 'resistance', P: 0.1, tension: 'mono', regulation: 'aucune' }])] : []),
    // Hotte : électrovanne gaz asservie à l'extraction (pas de cuisson au gaz sans extraction), contrôle du débit, encrassement des filtres
    hotte: (v, e) => (v.Q > 0 ? [{ rep: `EVG-${e.repE || 'CUI'}`, designation: 'Électrovanne gaz de la cuisine asservie à l\'extraction (coupure si la hotte est arrêtée)', type: 'electrovanne', P: 0.02, tension: 'mono', regulation: 'evGaz' },
      secu(`DP-${e.repE || 'CUI'}`, 'Pressostat de contrôle de l\'extraction de la hotte (asservissement gaz)'), contact(`FE-${e.repE || 'CUI'}`, 'Pressostat d\'encrassement des filtres de la hotte')] : []),
    // Parking : mesures de CO / NO₂ (la centrale de détection est déjà une ligne du calcul)
    parking: (v, e) => (v.nDet > 0 ? [sonde(`${e.repExt || 'EXT-PK'}-CO`, `Mesure CO / NO₂ du parking (${v.nDet} détecteurs, pilotage des deux vitesses)`)] : []),
    // Piscine : hygrométrie et température du hall, température de l'eau
    piscine: v => (v.Pvent > 0 || v.m > 0 ? [sonde('HR-PISC', 'Sonde d\'hygrométrie du hall de la piscine'), sonde('TA-PISC', 'Sonde de température d\'air du hall'), sonde('TW-PISC', 'Sonde de température de l\'eau du bassin')] : []),
    // Puits canadien : registre de by-pass motorisé, sondes d'entrée et de sortie
    puitsCanadien: v => (v.Q > 0 ? [{ rep: 'BP-PC', designation: 'Registre motorisé de by-pass du puits canadien', type: 'vanne', P: 0.01, tension: '24V', regulation: 'v010' },
      sonde('TE-PC', 'Sonde de température d\'air extérieur à l\'entrée du puits'), sonde('TS-PC', 'Sonde de température d\'air en sortie du puits canadien')] : []),
    // Récupération d'eau de pluie : niveau de la cuve, électrovanne d'appoint en eau de ville (disconnexion par surverse)
    eauxDePluie: v => (v.V > 0 ? [sonde('NIV-EDP', `Sonde de niveau de la cuve d'eau de pluie (${nf(v.V, 0)} L)`), { rep: 'EV-EDP', designation: 'Électrovanne d\'appoint en eau de ville (niveau bas de la cuve)', type: 'vanne', P: 0.01, tension: 'mono', regulation: 'tor' },
      comptage('CPT-EDP', 'Compteur d\'eau de pluie distribuée')] : []),
    // Bouclage d'ECS : températures de départ et de retour de chaque boucle (surveillance légionelle, arrêté du 1er février 2010)
    legionelle: (v, e) => { const n = Math.max(1, Math.round(num(e.nBoucles, 1))); return Number.isFinite(v.Qb) && v.Qb > 0 ? [sonde('TD-ECS', `Sonde de température de départ d'ECS (${nf(v.Tdep, 0)} °C mini)`),
      ...Array.from({ length: n }, (x, i) => sonde(`TR-ECS${n > 1 ? i + 1 : ''}`, `Sonde de température de retour de bouclage${n > 1 ? ` ${i + 1}` : ''} (${nf(v.Tret, 0)} °C mini, alarme sous 50 °C)`))] : []; },
    // Traitement d'eau : compteur d'eau d'appoint (surveillance des fuites et du volume d'eau ajouté)
    traitementEau: v => (v.V > 0 ? [comptage('CPT-APP', `Compteur d'eau d'appoint du réseau (${nf(v.V / 1000, 1)} m³ en installation : suivi des fuites et du traitement)`)] : []),
  };

  /* ---------- Analyse fonctionnelle et séquences de régulation des calculs annexes ---------- */
  // versRegulation(valeurs, entrées, note, ctx) → { app, af: [phrases], sequences: [[phase, déroulement, paramètres
  // par défaut]], params: [{ libelle, valeur, unite }] } ou null. Consommé par Regulation.contexte (une installation par
  // calcul annexe de l'étude) puis par Gtb.sequences / Gtb.cahier. ctx.ref(rep) : « — Fabricant Référence » du matériel
  // retenu de l'équipement (vide sinon). Valeurs prises dans le calcul : reprises telles quelles ; valeurs usuelles par
  // défaut : libellé suivi de « (à valider) » (à confirmer par le bureau d'études et à la mise en service).
  const AV = ' (à valider)';
  const par = (libelle, valeur, unite, defaut = true) => (Number.isFinite(valeur) ? { libelle: `${libelle}${defaut ? AV : ''}`, valeur: Math.round(valeur * 100) / 100, unite, ...(defaut ? { aValider: true } : {}) } : null);
  const f0 = v => nf(v, 0), f1 = v => nf(v, 1);
  const saisi = (e, k) => e[k] !== undefined && e[k] !== null && String(e[k]).trim() !== '';
  // Séquence normalisée : chaque phase [déroulement, paramètres par défaut]
  const seq = (dem, marche, arret, defaut, rearm) => [['Démarrage', ...dem], ['Marche normale', ...marche], ['Arrêt', ...arret], ['Défaut', ...defaut], ['Réarmement', ...rearm]].map(l => [l[0], l[1], l[2] || '—']);
  // Applications de régulation des équipements des calculs annexes (Regulation.application)
  const APPS = { hotte: 'ventilation', parking: 'ventilation', piscine: 'ventilation', puitsCanadien: 'ventilation', geothermie: 'production', echangeurPlaques: 'chauffage',
    solaireEcs: 'chauffage', legionelle: 'chauffage', plancher: 'chauffage', plafonds: 'chauffage', drv: 'autre', chambreFroide: 'autre', fluides: 'autre', eauxDePluie: 'autre', traitementEau: 'autre' };
  const detecteursFuite = (v, e) => (v.equipements || []).map((x, i) => ({ ...((e.equipements || [])[i] || {}), ...x })).filter(x => x && (x.tCO2e >= 500 || /oui/i.test(String(x.detection || ''))));

  const REGULATIONS = {
    // Hotte : pas de cuisson au gaz sans extraction (électrovanne asservie au retour de marche et au pressostat)
    hotte: (v, e, n, c) => {
      if (!(v.Q > 0)) return null;
      const r = e.repE || 'EXT-CUI', comp = v.Qc > 0 && e.compType !== 'transfert', R = c.ref;
      return { app: 'ventilation', af: [
        `Extracteur ${r}${R(r)} (${f0(v.Q)} m³/h)${comp ? ` et ventilateur de compensation ${r}-COMP${R(`${r}-COMP`)} (${f0(v.Qc)} m³/h)` : ''} commandés depuis la cuisine (marche / arrêt, vitesse) ou par la programmation horaire.`,
        `Électrovanne gaz EVG-${r}${R(`EVG-${r}`)} ouverte seulement si l'extraction tourne (retour de marche de ${r}) et que le pressostat DP-${r} confirme le débit ; fermeture immédiate sur perte du débit, arrêt de l'extraction, arrêt d'urgence ou ordre du SSI ; réarmement manuel.`,
        `Filtres à graisses : pressostat d'encrassement FE-${r} (alarme de maintenance) ; vitesse aux filtres ${nf(v.vF, 2)} m/s.`],
      sequences: seq(
        [`Marche de ${r}${comp ? `, puis de ${r}-COMP après 10 s` : ''} ; contrôle du débit par DP-${r} ; ouverture de EVG-${r} quand DP-${r} est établi depuis 30 s`, `Contrôle du pressostat 30 s${AV}`],
        [`Extraction ${f0(v.Q)} m³/h${comp ? `, compensation ${f0(v.Qc)} m³/h` : ''} ; vitesse réglable selon les appareils en service ; EVG-${r} maintenue ouverte tant que DP-${r} est établi`, `Seuil du pressostat 50 Pa${AV}`],
        ['Fermeture de l\'électrovanne gaz en premier, puis post-ventilation et arrêt des ventilateurs', `Post-ventilation 10 min${AV}`],
        [`Perte du débit (DP-${r} ouvert plus de 5 s), défaut d'un ventilateur ou arrêt d'urgence : fermeture de EVG-${r}, alarme P1 ; filtres encrassés : alarme P3 ; incendie : coupure du gaz et scénario du SSI`, `Temporisation de perte de débit 5 s${AV}`],
        [`Réarmement manuel de EVG-${r} sur site (bouton en cuisine) après retour du débit ; jamais de réouverture automatique`]),
      params: [par('Débit d\'extraction de la hotte', v.Q, 'm³/h', false), comp ? par('Débit d\'air de compensation', v.Qc, 'm³/h', false) : null, par('Contrôle du débit avant ouverture du gaz', 30, 's'),
        par('Seuil du pressostat de contrôle d\'extraction', 50, 'Pa'), par('Perte de débit : temporisation de coupure du gaz', 5, 's'), par('Post-ventilation après la cuisson', 10, 'min')] };
    },
    // Parking : petite / grande vitesse aux seuils de CO / NO₂ du calcul (20 / 50 ppm de CO par défaut), alarme 100 ppm
    parking: (v, e, n, c) => {
      if (!(v.QGV > 0)) return null;
      const r = e.repExt || 'EXT-PK', gaz = e.gaz || 'co+no2', co = gaz.includes('co'), no = gaz.includes('no2'), nb = v.niveaux * v.nExt;
      const S = { coPV: 20, coGV: 50, coAl: 100, noPV: 0.5, noGV: 1, noAl: 1 }, s = k => num(e[k], S[k]), propre = k => saisi(e, k) && num(e[k]) !== S[k];
      const txt = (kc, kn) => [co ? `CO > ${f0(s(kc))} ppm` : '', no ? `NO₂ > ${f1(s(kn))} ppm` : ''].filter(Boolean).join(' ou ');
      const R = c.ref, ext = v.niveaux > 1 ? `${r}-N1-1 à ${r}-N${v.niveaux}-${v.nExt}` : nb > 2 ? `${r}-1 à ${r}-${nb}` : nb === 2 ? `${r}-1 et ${r}-2` : `${r}-1`;
      return { app: 'ventilation', af: [
        `Extracteurs ${ext}${R(`${r}${v.niveaux > 1 ? '-N1' : ''}-1`)} à deux vitesses pilotés par la centrale de détection ${r}-DET (${v.nDet} détecteur(s)) : petite vitesse ${f0(v.QPV)} m³/h, grande vitesse ${f0(v.QGV)} m³/h.`,
        `Seuils : petite vitesse ${txt('coPV', 'noPV')}, grande vitesse ${txt('coGV', 'noGV')}, alarme ${txt('coAl', 'noAl')} (signalisation « évacuer le parking »).`,
        'Défaut d\'un détecteur ou de la centrale : grande vitesse de sécurité ; ordre du SSI prioritaire (désenfumage ou arrêt selon le scénario).'],
      sequences: seq(
        [`Petite vitesse (${f0(v.QPV)} m³/h) dès qu'un détecteur dépasse ${txt('coPV', 'noPV')} ; balayage horaire en petite vitesse pendant l'occupation si le règlement l'exige`, `Hystérésis 5 ppm de CO${AV}`],
        [`Grande vitesse (${f0(v.QGV)} m³/h) au-dessus de ${txt('coGV', 'noGV')} ; retour en petite vitesse sous le seuil moins l'hystérésis après temporisation ; ordre de démarrage des extracteurs permuté chaque semaine`, `Temporisation de retour en petite vitesse 10 min${AV}`],
        [`Arrêt quand tous les détecteurs sont sous le seuil de petite vitesse depuis 15 min`, `Temporisation d'arrêt 15 min${AV}`],
        [`${txt('coAl', 'noAl')} : alarme P1, grande vitesse forcée, signalisation lumineuse et sonore ; défaut d'un détecteur ou de ${r}-DET : grande vitesse de sécurité, alarme P2 ; défaut d'un extracteur : les autres en grande vitesse, alarme P2`, 'Alarme gaz sans temporisation'],
        [`Alarme gaz acquittée sur ${r}-DET une fois les teneurs redescendues ; défaut d'un variateur : réarmement local ; étalonnage des détecteurs selon le fabricant`, `Étalonnage tous les 12 mois${AV}`]),
      params: [...(co ? [par('CO : seuil de petite vitesse', s('coPV'), 'ppm', !propre('coPV')), par('CO : seuil de grande vitesse', s('coGV'), 'ppm', !propre('coGV')), par('CO : seuil d\'alarme', s('coAl'), 'ppm', !propre('coAl'))] : []),
        ...(no ? [par('NO₂ : seuil de petite vitesse', s('noPV'), 'ppm', !propre('noPV')), par('NO₂ : seuil de grande vitesse', s('noGV'), 'ppm', !propre('noGV')), par('NO₂ : seuil d\'alarme', s('noAl'), 'ppm', !propre('noAl'))] : []),
        par('Hystérésis des seuils de CO', 5, 'ppm'), par('Temporisation de retour en petite vitesse', 10, 'min'), par('Temporisation d\'arrêt', 15, 'min'), par('Débit de grande vitesse', v.QGV, 'm³/h', false), par('Débit de petite vitesse', v.QPV, 'm³/h', false)] };
    },
    // Piscine : hygrométrie et température du hall (air 2 K au-dessus de l'eau), ralenti de nuit, jamais d'arrêt complet
    piscine: (v, e, n, c) => {
      if (!(v.Pvent > 0 || v.m > 0)) return null;
      const r = e.rep || 'CTA-PISC', Ta = num(e.Ta, 30), HR = num(e.HR, 60), Tw = num(e.Tw, 28), thermo = e.deshu === 'thermo';
      return { app: 'ventilation', af: [
        `Centrale de déshumidification ${r}${c.ref(r)} : humidité du hall HR-PISC tenue à ${f0(HR)} % par l'air neuf modulé${thermo ? ' et la pompe à chaleur de déshumidification' : ' (registre de mélange)'} ; air du hall TA-PISC à ${f0(Ta)} °C, eau TW-PISC à ${f0(Tw)} °C.`,
        `Évaporation ${f1(v.m)} kg/h, soufflage ${f0(v.Qsouffle)} m³/h le long des vitrages ; récupération sur l'air extrait ; point de rosée du hall ${f1(v.Tr)} °C.`,
        'Inoccupation : ralenti (bassin bâché si possible), jamais d\'arrêt complet (condensation sur les parois).'],
      sequences: seq(
        ['Centrale en marche permanente ; passage en occupation selon la programmation horaire', `Relance 1 h avant l'ouverture${AV}`],
        [`HR ${f0(HR)} % (± 3 %) par la modulation de l'air neuf puis la déshumidification ; air ${f0(Ta)} °C par la batterie chaude après récupération ; soufflage ${f0(v.Qsouffle)} m³/h`, `PI hygrométrie : bande 10 %, intégrale 300 s${AV}`],
        ['Inoccupation : ralenti, consigne d\'humidité relevée, air maintenu au-dessus de la température de l\'eau ; arrêt pour maintenance seulement', `Ralenti 50 % du débit, HR 65 %${AV}`],
        ['HR > 70 % pendant 30 min ou air plus froid que l\'eau : alarme P2 ; défaut de la centrale (bus) : alarme P2 ; antigel de la batterie : sécurité propre de la centrale', `Seuil 70 % pendant 30 min${AV}`],
        ['Acquittement depuis la GTB ; défauts de la centrale : réarmement sur son régulateur']),
      params: [par('Consigne d\'humidité relative du hall', HR, '%', false), par('Consigne de température d\'air du hall', Ta, '°C', false), par('Température de l\'eau du bassin', Tw, '°C', false), par('Débit de soufflage', v.Qsouffle, 'm³/h', false),
        par('Alarme d\'humidité haute du hall', 70, '%'), par('Ralenti d\'inoccupation (part du débit)', 50, '%'), par('Consigne d\'humidité en inoccupation', 65, '%')] };
    },
    // Puits canadien : air par le puits quand il est favorable, by-pass sinon
    puitsCanadien: (v, e, n, c) => {
      if (!(v.Q > 0)) return null;
      return { app: 'ventilation', af: [
        `Registre de by-pass BP-PC${c.ref('BP-PC')} : air neuf (${f0(v.Q)} m³/h) par le puits quand il est favorable — hiver si l'extérieur TE-PC < 12 °C (préchauffage ≈ ${f1(v.gainH)} kW), été si TE-PC > 22 °C (rafraîchissement ≈ ${f1(v.gainE)} kW) — air neuf direct sinon ; efficacité contrôlée par TS-PC.`,
        `Condensats : regard de purge contrôlé${v.cond ? ' (condensation possible l\'été d\'après le calcul)' : ''}.`],
      sequences: seq(
        ['Suivant la marche de la ventilation qui aspire par le puits ; registre en position avant le ventilateur', 'Fin de course du registre contrôlée'],
        ['Passage par le puits si TE-PC < seuil d\'hiver ou > seuil d\'été ; by-pass en mi-saison ou si TS-PC est moins favorable que l\'air extérieur', `Seuils 12 / 22 °C, hystérésis 1 K${AV}`],
        ['Ventilation arrêtée : registre côté puits fermé'],
        ['Défaut de sonde ou discordance du registre : air neuf direct (by-pass), alarme P3 ; efficacité anormalement basse : alarme d\'entretien', '—'],
        ['Acquittement depuis la GTB ; inspection et nettoyage du puits chaque année']),
      params: [par('Passage par le puits en hiver sous', 12, '°C ext.'), par('Passage par le puits en été au-dessus de', 22, '°C ext.'), par('Débit d\'air par le puits', v.Q, 'm³/h', false)] };
    },
    // Géothermie : PAC autorisée seulement avec le débit et la pression du circuit des sondes
    geothermie: (v, e, n, c) => {
      if (!(v.P > 0 || v.Pext > 0)) return null;
      const dT = num(e.dT, 3), Tmin = /^eau$/.test(e.fluide || '') ? 3 : -3;
      return { app: 'production', af: [
        `Pompe PG${c.ref('PG')} du circuit des ${v.n} sondes géothermiques (${f0(v.H)} m chacune, ${f1(v.Q)} m³/h) asservie à la demande de la PAC.`,
        'Contrôleur de débit CD-GEO et pressostat PS-GEO dans la chaîne de sécurité de la PAC : arrêt de la PAC sur défaut de débit ou manque de pression.',
        `Températures d'entrée et de sortie du champ (TE-GEO / TS-GEO) et énergie prélevée (CPT-GEO) historisées ; PAC arrêtée si la sortie du champ passe sous ${f0(Tmin)} °C.`],
      sequences: seq(
        ['Demande de la PAC : pompe PG en marche, contrôle du débit (CD-GEO) puis autorisation du compresseur', `Contrôle du débit 60 s${AV}`],
        [`Débit nominal ${f1(v.Q)} m³/h, écart ${f0(dT)} K entre TE-GEO et TS-GEO ; vitesse de PG modulée sur l'écart de température`, `PI écart de température : bande 2 K, intégrale 120 s${AV}`],
        ['Arrêt du compresseur puis post-circulation de PG', `Post-circulation 2 min${AV}`],
        [`Défaut de débit (CD-GEO) ou manque de pression (PS-GEO) : arrêt immédiat de la PAC et de PG, alarme P1 ; sortie du champ TS-GEO < ${f0(Tmin)} °C : arrêt de la PAC (antigel), alarme P2 ; défaut de PG : alarme P2`, `Pression mini 1 bar ; sortie mini ${f0(Tmin)} °C${AV}`],
        ['Réarmement manuel sur site après remise en pression (appoint de fluide glycolé) ou rétablissement du débit ; antigel : automatique 2 K au-dessus du seuil']),
      params: [par('Débit du circuit des sondes', v.Q, 'm³/h', false), par('Écart de température du circuit des sondes', dT, 'K', false), par('Température mini de sortie du champ de sondes', Tmin, '°C'),
        par('Pression mini du circuit glycolé', 1, 'bar'), par('Contrôle du débit avant autorisation de la PAC', 60, 's'), par('Post-circulation de la pompe des sondes', 2, 'min')] };
    },
    // Solaire thermique : régulation différentielle, limitation du ballon, surchauffe des capteurs
    solaireEcs: (v, e, n, c) => {
      if (!(v.S > 0)) return null;
      const Tc = num(e.Tc, 60);
      return { app: 'chauffage', af: [
        `Station solaire PSOL${c.ref('PSOL')} pilotée par le régulateur différentiel RG-SOL${c.ref('RG-SOL')} : marche quand les capteurs (TC-SOL) sont plus chauds que le bas du ballon (TB-SOL) ; ${f1(v.S)} m² de capteurs, ballon ${f0(v.V)} L.`,
        'Protection : ballon limité en température, surchauffe des capteurs (SUR-SOL) : pompe arrêtée (stagnation) et alarme.',
        `Appoint : ECS à ${f0(Tc)} °C assurée par l'appoint après le préchauffage solaire (priorité au solaire) ; énergie solaire comptée (CPT-SOL).`],
      sequences: seq(
        ['PSOL en marche si TC-SOL − TB-SOL dépasse l\'écart de marche', `Écart de marche 7 K${AV}`],
        ['Charge du ballon solaire ; vitesse de la pompe modulée pour garder environ 10 K d\'écart (station à vitesse variable)', '—'],
        ['Arrêt si l\'écart passe sous l\'écart d\'arrêt ou si le ballon atteint sa température maxi', `Écart d'arrêt 3 K ; ballon maxi 80 °C${AV}`],
        ['Capteurs au-dessus du seuil de surchauffe : pompe arrêtée (stagnation), alarme P2 ; défaut de sonde, pompe en marche sans écart de température ou pression basse du circuit : alarme P2', `Surchauffe 120 °C${AV}`],
        ['Automatique quand les capteurs redescendent sous 100 °C ; défaut de pompe ou de pression : acquittement après contrôle (pression, fluide caloporteur)']),
      params: [par('Écart de marche de la pompe solaire', 7, 'K'), par('Écart d\'arrêt de la pompe solaire', 3, 'K'), par('Température maxi du ballon solaire', 80, '°C'), par('Seuil de surchauffe des capteurs', 120, '°C'),
        par('Consigne de l\'ECS (appoint)', Tc, '°C', false)] };
    },
    // Bouclage d'ECS : températures de départ et de retour (arrêté du 1er février 2010), alarme retour < 50 °C
    legionelle: (v, e, n, c) => {
      if (!(Number.isFinite(v.Qb) && v.Qb > 0)) return null;
      const choc = e.chocPossible !== 'non', Tch = num(e.Tchoc, 70), dCh = num(e.dureeChoc, 30);
      return { app: 'chauffage', af: [
        `Pompe de bouclage PB-ECS${c.ref('PB-ECS')} en marche permanente (${f0(v.Qb * 1000)} L/h) ; départ TD-ECS ≥ ${f0(v.Tdep)} °C, retour de chaque boucle (TR-ECS) ≥ 50 °C (arrêté du 1er février 2010) ; températures historisées pour le carnet sanitaire.`,
        ...(choc ? [`Choc thermique possible : ${f0(Tch)} °C pendant ${f0(dCh)} min aux points de puisage (sur analyse positive ou selon le carnet sanitaire).`] : [])],
      sequences: seq(
        ['Pompe de bouclage en marche dès la mise en eau de la production'],
        [`Départ ≥ ${f0(v.Tdep)} °C, retour attendu ≈ ${f0(v.Tret)} °C ; vannes thermostatiques de bouclage réglées par antenne`],
        ['Pompe jamais arrêtée en exploitation (maintenance seulement, avec consignation)'],
        ['Retour d\'une boucle < 50 °C ou départ < 55 °C pendant 30 min : alarme P2 (risque légionelle) ; défaut de la pompe : alarme P2', `Temporisation 30 min${AV}`],
        [`Acquittement depuis la GTB après retour des températures${choc ? ` ; choc thermique ${f0(Tch)} °C pendant ${f0(dCh)} min si besoin` : ''}`]),
      params: [par('Température mini de départ d\'ECS', v.Tdep, '°C', false), par('Température mini de retour de bouclage (arrêté du 1er février 2010)', 50, '°C', false), par('Alarme de départ d\'ECS bas', 55, '°C'),
        par('Temporisation des alarmes de température d\'ECS', 30, 'min'), ...(choc ? [par('Température du choc thermique', Tch, '°C', false)] : [])] };
    },
    // Plancher chauffant : thermostat de sécurité coupant le circulateur ; rafraîchissement : départ ≥ rosée + 2 K
    plancher: (v, e) => {
      const Td = Array.isArray(v.regime) ? v.regime[0] : num(e.Td, NaN), raf = e.rafraich === 'oui', Ts = 50;
      return { app: 'chauffage', af: [
        `Thermostat de sécurité TS-PL câblé en série sur la commande du circulateur du plancher : coupure si le départ dépasse ${f0(Ts)} °C (défaut de la vanne de mélange), indépendamment de l'automate.`,
        `Départ TD-PL régulé par la vanne de mélange du circuit (loi d'eau${Number.isFinite(Td) ? `, départ maxi ${f0(Td)} °C au régime de base` : ''}) ; surface du sol limitée (NF EN 1264).`,
        ...(raf ? [`Rafraîchissement : départ jamais sous le point de rosée de l'ambiance + 2 K (HR-PL ; rosée ${f1(v.Tros)} °C aux conditions de calcul, soit ≥ ${f1(v.Tros + 2)} °C).`] : [])],
      sequences: seq(
        ['Demande de chauffage du circuit : circulateur en marche (chaîne TS-PL fermée), puis ouverture progressive de la vanne de mélange', `Ouverture progressive sur 10 min${AV}`],
        [`Départ selon la loi d'eau${Number.isFinite(Td) ? `, plafonné à ${f0(Td)} °C` : ''}${raf ? ' ; en rafraîchissement, départ ≥ point de rosée + 2 K' : ''}`, 'PI départ : bande 20 K, intégrale 240 s'],
        ['Fin de demande : vanne fermée, puis arrêt du circulateur après post-circulation', `Post-circulation 3 min${AV}`],
        [`Départ > ${f0(Ts)} °C : TS-PL coupe le circulateur en direct, vanne fermée, alarme P1${raf ? ' ; rafraîchissement : départ sous la rosée + 2 K, vanne fermée, alarme P2' : ''} ; défaut du circulateur : alarme P2`, `Thermostat de sécurité ${f0(Ts)} °C${AV}`],
        ['Réarmement manuel du thermostat de sécurité après refroidissement et contrôle de la vanne de mélange ; acquittement depuis la GTB']),
      params: [Number.isFinite(Td) ? par('Départ maxi du plancher chauffant', Td, '°C', false) : null, par('Thermostat de sécurité du plancher (coupure du circulateur)', Ts, '°C'),
        ...(raf ? [par('Départ mini en rafraîchissement (rosée + 2 K)', v.Tros + 2, '°C', false)] : [])] };
    },
    // Plafonds et poutres froides : départ ≥ point de rosée + 2 K, fermeture de la vanne sur condensation
    plafonds: (v, e) => {
      const Td = num(e.Td, 16), mini = v.Tros + 2;
      return { app: 'chauffage', af: [
        `Départ d'eau froide TD-PF à ${f1(Number.isFinite(mini) ? Math.max(Td, mini) : Td)} °C : consigne ${f0(Td)} °C relevée automatiquement pour rester au-dessus du point de rosée de l'ambiance (HR-PF) + 2 K (rosée ${f1(v.Tros)} °C aux conditions de calcul).`,
        'Détecteurs de condensation DC-PF : fermeture immédiate de la vanne de la zone concernée.',
        `Air primaire déshumidifié (rosée ${f0(num(e.TrosAir, 11))} °C) en marche avant toute ouverture des vannes de plafond.`],
      sequences: seq(
        ['Demande de froid de la zone et air primaire en marche : ouverture de la vanne', `Air primaire en marche depuis 15 min${AV}`],
        ['Vanne modulée sur l\'ambiance ; départ recalculé en continu = max(consigne, rosée + 2 K)', 'Marge sur le point de rosée 2 K'],
        ['Inoccupation, fenêtre ouverte ou air primaire arrêté : vanne fermée'],
        ['Condensation détectée (DC-PF) : vanne de la zone fermée, alarme P2 ; défaut de HR-PF : départ porté à la valeur de repli ; départ sous la rosée + 2 K : vannes fermées', `Départ de repli 18 °C${AV}`],
        ['Réouverture automatique après disparition de la condensation et temporisation ; acquittement depuis la GTB', `Temporisation 15 min${AV}`]),
      params: [par('Consigne de départ d\'eau froide des plafonds', Td, '°C', !saisi(e, 'Td')), par('Point de rosée de l\'ambiance (conditions de calcul)', v.Tros, '°C', false), par('Départ mini (rosée + 2 K)', mini, '°C', false),
        par('Départ de repli sur défaut de la sonde d\'hygrométrie', 18, '°C'), par('Réouverture après condensation', 15, 'min')] };
    },
    // Échangeur à plaques : vanne primaire sur le départ secondaire, contrôle du retour primaire
    echangeurPlaques: (v, e) => {
      if (!(v.P > 0)) return null;
      const Ts2 = num(e.Ts2, 70), Ts1 = num(e.Ts1, 60), l1 = e.lib1 || 'Primaire', l2 = e.lib2 || 'Secondaire';
      return { app: 'chauffage', af: [
        `Vanne de régulation côté ${l1.toLowerCase()} : départ ${l2.toLowerCase()} TS-ECH tenu à ${f0(Ts2)} °C (${f0(v.P)} kW) ; retour ${l1.toLowerCase()} TRP-ECH surveillé (≈ ${f0(Ts1)} °C attendus : pincement, encrassement).`,
        'Vanne primaire ouverte seulement pompe secondaire en marche ; fermée à l\'arrêt.'],
      sequences: seq(
        ['Pompe secondaire en marche (retour de marche), puis pompe / vanne primaire', 'Temporisation 30 s'],
        [`Régulation du départ secondaire à ${f0(Ts2)} °C par la vanne primaire`, `PI : bande 15 K, intégrale 120 s${AV}`],
        ['Vanne primaire fermée, puis post-circulation secondaire', `Post-circulation 3 min${AV}`],
        [`Départ secondaire à plus de 10 K de la consigne : vanne primaire fermée, alarme P2 ; retour primaire à plus de 5 K de ${f0(Ts1)} °C durablement : alarme P3 (encrassement, nettoyage)`, `Écarts 10 K / 5 K${AV}`],
        ['Automatique au retour dans la plage ; acquittement depuis la GTB']),
      params: [par(`Consigne de départ ${l2.toLowerCase()} de l'échangeur`, Ts2, '°C', !saisi(e, 'Ts2')), par(`Retour ${l1.toLowerCase()} attendu`, Ts1, '°C', !saisi(e, 'Ts1')), par('Écart d\'alarme sur le départ secondaire', 10, 'K')] };
    },
    // DRV : régulation du constructeur, la GTC écrit marche / arrêt, mode et consignes par la passerelle
    drv: (v, e, n, c) => {
      if (!(v.PelUE > 0)) return null;
      const ue = v.repUE || 'UE1';
      return { app: 'autre', af: [
        `DRV ${ue}${c.ref(ue)} (${f1(v.PfrUE)} kW froid, ${v.fluide || ''}) : régulation propre du constructeur, unités intérieures sur leur commande ; la GTC lit états, défauts et températures et écrit marche / arrêt, mode et consignes par la passerelle GW-${ue}.`,
        'Plage de consigne laissée à l\'occupant limitée ; arrêt général hors occupation par la GTC ; unité extérieure jamais coupée électriquement (préchauffage du carter).'],
      sequences: seq(
        ['Programmation horaire de la GTC : marche des unités intérieures de la zone ; l\'unité extérieure démarre sur leur demande', 'Mise sous tension du groupe 6 h avant la première mise en service (carter)'],
        ['Consignes de confort écrites par la GTC, dérogation de l\'occupant dans la plage ; mode chaud / froid par l\'unité maîtresse ou automatique (récupération)', `Confort 20 °C chaud / 26 °C froid, plage ± 2 K${AV}`],
        ['Hors occupation : unités intérieures arrêtées ou en hors gel', `Hors gel 8 °C${AV}`],
        ['Code défaut d\'une unité (lu sur le bus) : alarme P2 avec le code ; perte de communication de la passerelle : alarme P2 ; détection de fuite de fluide (si prévue) : arrêt et alarme P1'],
        ['Acquittement sur la commande centralisée du constructeur après intervention du frigoriste, puis depuis la GTB']),
      params: [par('Consigne de confort chauffage (DRV)', 20, '°C'), par('Consigne de confort rafraîchissement (DRV)', 26, '°C'), par('Plage de dérogation de l\'occupant', 2, 'K'), par('Hors gel (DRV)', 8, '°C')] };
    },
    // Chambre froide : thermostat d'ambiance, dégivrage, porte, personne enfermée, alarmes de température (HACCP)
    chambreFroide: (v, e, n, c) => {
      if (!(v.Pevap > 0)) return null;
      const g = v.repGroupe || 'CF', Ti = num(e.Ti, 2), neg = Ti <= 0, nD = num(e.nDeg) > 0 ? num(e.nDeg) : (neg ? 4 : 2), dD = num(e.dDeg, 30);
      return { app: 'autre', af: [
        `Groupe ${g}${c.ref(g)} (${f1(v.Pevap)} kW froid, ${v.fluide || ''}) sur le thermostat d'ambiance ${g}-TA : consigne ${f0(Ti)} °C ; dégivrage ${neg ? 'électrique' : 'par arrêt du compresseur'} ${f0(nD)} fois par 24 h ; température enregistrée (traçabilité).`,
        `Porte ${g}-PO : ventilateurs de l'évaporateur arrêtés porte ouverte, alarme si elle reste ouverte ; alarme de personne enfermée ${g}-PE (signal sonore et lumineux à l'extérieur, report P1).`],
      sequences: seq(
        [`Compresseur en marche si ${g}-TA dépasse la consigne + 1 K, porte fermée`, `Anti-court-cycle 5 min${AV}`],
        [`Arrêt à la consigne − 1 K ; dégivrage ${f0(nD)} × ${f0(dD)} min par 24 h, ventilateurs retardés après dégivrage`, `Différentiel 2 K ; dégivrage ${f0(nD)} × ${f0(dD)} min${AV}`],
        ['Porte ouverte : ventilateurs arrêtés ; arrêt général pour le nettoyage seulement'],
        [`Température > ${f0(Ti + 3)} °C pendant 30 min : alarme P2 (denrées) ; porte ouverte > 5 min : alarme P3 ; personne enfermée : alarme P1 ; défaut haute / basse pression du groupe : alarme P2`, `Alarme haute ${f0(Ti + 3)} °C / 30 min ; porte 5 min${AV}`],
        ['Haute pression : réarmement manuel sur le groupe ; alarmes de température : automatiques au retour, acquittement depuis la GTB ; personne enfermée : réarmement sur le bouton intérieur']),
      params: [par('Consigne de la chambre froide', Ti, '°C', false), par('Différentiel du thermostat', 2, 'K'), par('Alarme de température haute', Ti + 3, '°C'), par('Temporisation de l\'alarme de température', 30, 'min'),
        par('Alarme de porte ouverte', 5, 'min'), par('Dégivrages par 24 h', nD, '', !(num(e.nDeg) > 0)), par('Durée d\'un dégivrage', dD, 'min', !saisi(e, 'dDeg'))] };
    },
    // Fluides frigorigènes : détection de fuite (pré-alarme, alarme, ventilation de secours)
    fluides: (v, e) => {
      const d = detecteursFuite(v, e);
      if (!d.length) return null;
      return { app: 'autre', af: [
        `Détecteurs de fuite ${d.map(x => `DF-${x.rep || 'GF'}`).join(', ')} : surveillance permanente du fluide dans le local de chaque équipement (règlement F-gaz, EN 378-3).`,
        'Pré-alarme puis alarme : ventilation mécanique de secours du local forcée, signalisation à l\'entrée du local, report P1 ; arrêt de l\'équipement concerné si l\'EN 378 l\'exige.'],
      sequences: seq(
        ['Détecteurs alimentés en permanence (préchauffage de la cellule selon le fabricant)'],
        ['Mesure continue ; seuil 1 (pré-alarme) et seuil 2 (alarme) en part de la limite pratique du fluide', `Seuils 25 % / 50 % de la limite pratique${AV}`],
        ['Détection jamais arrêtée (hors maintenance, avec report)'],
        ['Seuil 1 : ventilation de secours, alarme P2 ; seuil 2 : alarme P1, signalisation, arrêt de l\'équipement si exigé ; défaut d\'un détecteur : alarme P2'],
        ['Manuel sur la centrale après recherche et réparation de la fuite par un opérateur attesté ; contrôle des détecteurs tous les 12 mois']),
      params: [par('Seuil 1 de détection (part de la limite pratique)', 25, '%'), par('Seuil 2 de détection (part de la limite pratique)', 50, '%')] };
    },
    // Récupération d'eau de pluie : niveau de cuve, appoint en eau de ville par surverse, protection marche à sec
    eauxDePluie: (v, e, n, c) => {
      if (!(v.V > 0)) return null;
      const pompe = v.Ba > 0;
      return { app: 'autre', af: [
        `Cuve de ${f0(v.V)} L : niveau NIV-EDP ; appoint en eau de ville par l'électrovanne EV-EDP${c.ref('EV-EDP')} avec disconnexion par surverse totale (aucun raccordement direct au réseau d'eau potable).`,
        ...(pompe ? [`Pompe P-EDP${c.ref('P-EDP')} (${f1(v.Qp)} m³/h, ${f0(v.Hp)} mCE) : distribution sur demande, protégée contre la marche à sec.`] : []),
        'Volume distribué compté (CPT-EDP) et reporté au carnet sanitaire (arrêté du 21 août 2008).'],
      sequences: seq(
        [pompe ? 'Pompe P-EDP sur baisse de pression du réseau de distribution (puisage)' : 'Distribution gravitaire', 'Pressostat de la station réglé à la mise en service'],
        ['Niveau de cuve suivi en continu ; appoint EV-EDP ouvert au niveau bas, fermé au niveau de fin d\'appoint', `Appoint ouvert sous 10 %, fermé à 20 %${AV}`],
        ['Fin de puisage : pompe arrêtée après temporisation', 'Temporisation 30 s'],
        ['Niveau très bas : pompe arrêtée (marche à sec), alarme P2 ; appoint ouvert trop longtemps ou défaut de la pompe : alarme P2 ; trop-plein : alarme P3', `Niveau mini 5 % ; appoint maxi 12 h${AV}`],
        ['Automatique au retour du niveau ; défaut de pompe : réarmement local']),
      params: [par('Volume de la cuve', v.V, 'L', false), par('Ouverture de l\'appoint en eau de ville sous', 10, '%'), par('Fermeture de l\'appoint à', 20, '%'), par('Niveau mini de protection de la pompe', 5, '%'), par('Durée maxi d\'appoint continu', 12, 'h')] };
    },
    // Traitement d'eau : suivi des appoints (fuites) au compteur
    traitementEau: (v, e) => {
      if (!(v.V > 0)) return null;
      const pa = num(e.appoint, 5), Va = v.V * pa / 100;
      return { app: 'autre', af: [
        `Compteur d'appoint CPT-APP : volume d'eau ajouté au réseau (${f0(v.V)} L en installation) suivi par la GTB ; cumul annuel comparé au seuil de ${f0(Va)} L (${f0(pa)} % du volume).`,
        `Alerte de fuite si l'appoint journalier dépasse 1 % du volume ; qualité de l'eau (pH, TH, conductivité) contrôlée selon le carnet de traitement${v.decision ? ` (${v.decision})` : ''}.`],
      sequences: seq(
        ['Remplissage initial compté (volume de référence) après traitement de l\'eau de remplissage'],
        ['Index relevé chaque jour ; cumul annuel comparé au seuil', `Seuil annuel ${f0(Va)} L`],
        ['—'],
        ['Appoint journalier trop élevé ou cumul annuel dépassé : alarme P2 (fuite, soupape, vase d\'expansion)', `Seuil journalier 1 % du volume${AV}`],
        ['Acquittement depuis la GTB après recherche de fuite ; traitement complémentaire si le seuil est dépassé']),
      params: [par('Seuil d\'appoint annuel', Va, 'L', false), par('Seuil d\'appoint journalier', v.V / 100, 'L')] };
    },
  };

  /* ---------- Métré des calculs annexes ---------- */
  // versMetre(valeurs, entrées, note, ctx) → [{ rep, chapitre, designation, qte, heures (par unité), unite, type | mots }]
  // Consommé par Metre.metre : clé stable « annexe|<type>|<repère> » (suffixe « -N<n° de note> » pour un 2e calcul du même
  // type), donc chiffrage et matériel retenu. ctx : { etude, notes, valeurs(id) → { e, v } } pour écarter ce que le
  // schéma de principe ou la plomberie sanitaire comptent déjà (pompe de bouclage, échangeur, désemboueur).
  const libOpt = (type, k, val) => { const ch = ((N.TYPES[type] || {}).champs || []).find(x => x.k === k), o = ch && Array.isArray(ch.o) ? ch.o.find(x => x[0] === val) : null; return o ? o[1] : String(val || ''); };
  const cleMetre = (type, rep, sfx = '') => `annexe|${type}|${rep}${sfx}`;
  const it = (rep, chapitre, designation, qte, heures, r = {}) => ({ rep, chapitre, designation, qte, heures, unite: 'u', ...r });
  const REG_S = 'Régulation et sécurités', ENR = 'Énergies renouvelables';
  const METRES = {
    geothermie: (v, e) => (v.P > 0 || v.Pext > 0 ? [
      it('PG', ENR, `Pompe du circuit des sondes géothermiques ${f1(v.Q)} m³/h (fluide glycolé)`, 1, 3, { type: 'pompe' }),
      it('SGV', ENR, `Sonde géothermique verticale ${libOpt('geothermie', 'sonde', e.sonde || 'du32')} de ${f0(v.H)} m (forage et injection par l'entreprise spécialisée)`, v.n, 4, { mots: ['sonde', 'geotherm'] }),
      it('COL-GEO', ENR, `Collecteur des sondes géothermiques ${v.n} départs, vannes d'équilibrage`, 1, 6, { mots: ['collecteur'] }),
      it('SEC-GEO', REG_S, 'Contrôleur de débit et pressostat de sécurité du circuit glycolé', 1, 1, { mots: ['pressostat'] }),
      it('CPT-GEO', ENR, 'Compteur d\'énergie du circuit des sondes', 1, 2, { type: 'compteur' })] : []),
    solaireEcs: (v, e) => (v.S > 0 ? [
      it('CAPT-SOL', ENR, `${e.capteur === 'tubes' ? 'Capteur solaire à tubes sous vide' : 'Capteur solaire plan vitré'} ≈ 2,3 m² (${f1(v.S)} m² au total), châssis et fixations`, Math.max(1, Math.ceil(v.S / 2.3)), 3, { mots: ['capteur', 'solaire'] }),
      it('PSOL', ENR, 'Station solaire (pompe, débitmètre, soupape, purgeur)', 1, 4, { type: 'pompe' }),
      it('RG-SOL', REG_S, 'Régulateur solaire différentiel et sondes', 1, 2, { mots: ['regulateur', 'solaire'] }),
      ...(v.V > 0 ? [it('BAL-SOL', ENR, `Ballon de stockage solaire ${f0(v.V)} L`, 1, v.V > 1000 ? 8 : 6, { mots: ['ballon', 'solaire'] })] : []),
      it('VE-SOL', ENR, 'Vase d\'expansion solaire (membrane haute température)', 1, 1.5, { mots: ['vase', 'solaire'] }),
      it('CPT-SOL', ENR, 'Compteur d\'énergie solaire', 1, 2, { type: 'compteur' })] : []),
    // Bouclage : la pompe et les vannes sont comptées par la plomberie sanitaire quand elle porte un bouclage
    legionelle: (v, e, n, c) => {
      if (!(Number.isFinite(v.Qb) && v.Qb > 0)) return [];
      const nb = Math.max(1, Math.round(num(e.nBoucles, 1))), dejaSan = c.notes.some(x => x.type === 'sanitaire' && ((c.valeurs(x.id) || {}).v || {}).bouclage);
      return [...(dejaSan ? [] : [it('PB-ECS', 'Plomberie sanitaire', `Circulateur de bouclage ECS ${f0(v.Qb * 1000)} L/h · ${f1(v.H)} mCE (eau potable, corps bronze ou inox)`, 1, 3, { type: 'pompe' })]),
        it('SONDES-ECS', REG_S, 'Sonde de température d\'ECS (départ et retours de bouclage), doigt de gant', 1 + nb, 0.5, { mots: ['sonde', 'temperature'] })];
    },
    eauxDePluie: v => (v.V > 0 ? [
      it('CUVE-EDP', 'Plomberie sanitaire', `Cuve de récupération des eaux de pluie ${f0(v.V)} L (filtre, trop-plein siphonné, crépine flottante ; terrassement hors lot)`, 1, v.V > 10000 ? 16 : 10, { mots: ['cuve'] }),
      ...(v.Ba > 0 ? [it('P-EDP', 'Plomberie sanitaire', `Station de pompage d'eau de pluie ${f1(v.Qp)} m³/h · ${f0(v.Hp)} mCE (protection marche à sec)`, 1, 4, { type: 'pompe' })] : []),
      it('EV-EDP', 'Plomberie sanitaire', 'Disconnexion par surverse totale et électrovanne d\'appoint en eau de ville', 1, 3, { mots: ['surverse', 'disconnex'] }),
      it('NIV-EDP', REG_S, 'Sonde de niveau de la cuve d\'eau de pluie', 1, 1, { mots: ['sonde', 'niveau'] }),
      it('CPT-EDP', 'Plomberie sanitaire', 'Compteur d\'eau de pluie distribuée (émetteur d\'impulsions)', 1, 1, { mots: ['compteur', 'eau'] })] : []),
    hotte: (v, e) => {
      if (!(v.Q > 0)) return [];
      const r = e.repE || 'EXT-CUI';
      return [it(`HOTTE-${r}`, 'Aéraulique', `Hotte de cuisine professionnelle ${f1(num(e.Lh, 3))} × ${f1(num(e.lh, 1.2))} m, filtres à graisses`, 1, 8, { mots: ['hotte'] }),
        it(r, 'Aéraulique', `Extracteur de la hotte de cuisine ${f0(v.Q)} m³/h, ${f0(num(e.dpE, 500))} Pa`, 1, 6, { mots: ['extracteur'], modele: true }),
        ...(v.PeC > 0 ? [it(`${r}-COMP`, 'Aéraulique', `Caisson d'air de compensation de la cuisine ${f0(v.Qc)} m³/h`, 1, 6, { mots: ['caisson'] })] : []),
        ...(v.nFiltres > 0 ? [it(`FILTRES-${r}`, 'Aéraulique', `Filtre à graisses ${f1(num(e.lf, 0.5))} × ${f1(num(e.hf, 0.5))} m`, v.nFiltres, 0.1, { mots: ['filtre', 'graisse'] })] : []),
        it(`EVG-${r}`, REG_S, 'Électrovanne gaz de la cuisine asservie à l\'extraction (coffret de commande, réarmement manuel)', 1, 2, { mots: ['electrovanne', 'gaz'] }),
        it(`DP-${r}`, REG_S, 'Pressostat d\'air (contrôle d\'extraction, encrassement des filtres)', 2, 0.5, { mots: ['pressostat'] })];
    },
    parking: (v, e) => {
      if (!(v.QGV > 0)) return [];
      const r = e.repExt || 'EXT-PK';
      return [it(r, 'Aéraulique', `Extracteur de parking ${f0(v.Qext)} m³/h, ${f0(num(e.dp, 300))} Pa, deux vitesses`, v.niveaux * v.nExt, 6, { mots: ['extracteur'], modele: true }),
        ...(v.Pam > 0 ? [it(`${r}-AM`, 'Aéraulique', 'Ventilateur d\'amenée d\'air du parking', v.niveaux * v.nExt, 6, { mots: ['ventilateur'] })] : []),
        ...(v.nDet > 0 ? [it(`${r}-DET`, REG_S, `Centrale de détection ${(e.gaz || 'co+no2') === 'co' ? 'CO' : (e.gaz === 'no2' ? 'NO₂' : 'CO / NO₂')} du parking, signalisation`, 1, 4, { mots: ['centrale', 'detection'] }),
          it(`${r}-CO`, REG_S, `Détecteur ${(e.gaz || 'co+no2') === 'co' ? 'CO' : (e.gaz === 'no2' ? 'NO₂' : 'CO / NO₂')} du parking`, v.nDet, 1, { mots: ['detecteur'] })] : [])];
    },
    piscine: (v, e) => (v.Pvent > 0 ? [it(e.rep || 'CTA-PISC', 'Aéraulique', `Centrale de déshumidification de la piscine ${f0(v.Qsouffle)} m³/h (récupération, ${e.deshu === 'thermo' ? 'pompe à chaleur' : 'air neuf modulé'})`, 1, 24, { type: 'cta', modele: true }),
      it('SONDES-PISC', REG_S, 'Sondes du hall (hygrométrie, température) et de l\'eau du bassin', 3, 0.5, { mots: ['sonde'] })] : []),
    puitsCanadien: (v, e) => (v.Q > 0 ? [
      it('TUBE-PC', 'Aéraulique', `Tube de puits canadien Ø ${f0(num(e.D, 0.2) * 1000)} mm alimentaire, pente vers la purge (terrassement hors lot)`, Math.round(num(e.nTubes, 3) * num(e.L, 40)), 0.25, { unite: 'ml', mots: ['tube', 'puits'] }),
      it('COL-PC', 'Aéraulique', 'Collecteur d\'entrée ou de sortie du puits canadien', 2, 4, { mots: ['collecteur'] }),
      it('PA-PC', 'Aéraulique', 'Prise d\'air neuf du puits (borne, grille et filtre)', 1, 2, { mots: ['prise', 'air'] }),
      it('PURGE-PC', 'Aéraulique', 'Regard de visite et de purge des condensats', 1, 3, { mots: ['regard'] }),
      it('BP-PC', 'Aéraulique', 'Registre motorisé de by-pass du puits canadien', 1, 2, { mots: ['registre'] })] : []),
    chambreFroide: (v, e) => {
      if (!(v.Pevap > 0)) return [];
      const g = v.repGroupe || 'CF';
      return [it(g, 'Froid', `Groupe frigorifique de la chambre froide ${f1(v.Pevap)} kW à ${f0(num(e.Ti, 2))} °C (${v.fluide || 'fluide à choisir'})`, 1, 16, { mots: ['groupe', 'frigorifique'], modele: true }),
        it(`${g}-EV`, 'Froid', 'Évaporateur ventilé de la chambre froide', 1, 6, { mots: ['evaporateur'] }),
        it(`${g}-SEC`, REG_S, 'Alarme de personne enfermée et contact de porte de la chambre froide', 1, 2, { mots: ['alarme'] })];
    },
    drv: v => {
      if (!(v.PelUE > 0)) return [];
      const ue = v.repUE || 'UE1';
      return [it(ue, 'Froid', `Unité extérieure DRV ${f1(v.PfrUE)} kW froid / ${f1(v.PchUE)} kW chaud (${v.fluide || ''})`, 1, 16, { mots: ['unite', 'exterieure'], modele: true }),
        ...(v.nUI > 0 ? [it(`UI-${ue}`, 'Froid', 'Unité intérieure DRV (raccordement frigorifique, condensats, commande)', v.nUI, 4, { mots: ['unite', 'interieure'] })] : []),
        ...(v.Ltot > 0 ? [it(`LIAISONS-${ue}`, 'Froid', 'Liaisons frigorifiques cuivre isolées (liquide et gaz), brasées sous azote', Math.round(v.Ltot), 0.6, { unite: 'ml', mots: ['liaison', 'frigorifique'] })] : []),
        it(`GW-${ue}`, REG_S, 'Passerelle de communication DRV ↔ GTC (Modbus / BACnet)', 1, 2, { mots: ['passerelle'] })];
    },
    fluides: (v, e) => detecteursFuite(v, e).map(x => it(`DF-${x.rep || 'GF'}`, REG_S, `Détecteur de fuite de fluide frigorigène ${x.fluide || ''} — ${x.rep || 'équipement'}`.replace(/\s+/g, ' '), 1, 2, { mots: ['detecteur', 'fuite'] })),
    plancher: (v, e) => {
      if (!(v.S > 0)) return [{ ...it('TS-PL', REG_S, 'Thermostat de sécurité de plancher chauffant (applique)', 1, 0.5, { mots: ['thermostat', 'securite'] }) }];
      const Lt = (v.locaux || []).reduce((s, l) => s + num(l.nb) * num(l.Lb), 0);
      return [...(v.collecteurs > 0 ? [it('COLL-PL', 'Émetteurs', `Collecteur de plancher chauffant (${num(e.sorties, 12)} sorties maxi), coffret et vannes`, v.collecteurs, 4, { mots: ['collecteur', 'plancher'] })] : []),
        ...(Lt > 0 ? [it('TUBE-PL', 'Émetteurs', `Tube de plancher chauffant ${libOpt('plancher', 'tube', e.tube || 'pe16')} à barrière anti-oxygène (${v.boucles} boucle(s))`, Math.round(Lt), 0.04, { unite: 'ml', mots: ['tube', 'plancher'] })] : []),
        it('ISO-PL', 'Émetteurs', 'Isolant à plots et bande périphérique de plancher chauffant', Math.round(v.S), 0.15, { unite: 'm²', mots: ['isolant', 'plots'] }),
        it('TS-PL', REG_S, 'Thermostat de sécurité de plancher chauffant (applique)', 1, 0.5, { mots: ['thermostat', 'securite'] })];
    },
    plafonds: v => [it('DC-PF', REG_S, 'Détecteur de condensation (plafonds / poutres froides)', Math.max(1, nbLocaux(v)), 0.5, { mots: ['detecteur', 'condensation'] }),
      it('HR-PF', REG_S, 'Sonde d\'hygrométrie d\'ambiance', 1, 0.5, { mots: ['sonde', 'hygrometrie'] })],
    // Échangeur relié à un échangeur du schéma de principe : déjà compté par le schéma
    echangeurPlaques: (v, e, n, c) => (v.P > 0 && !(e.source && c.echangeurSchema) ? [it('ECH', 'Production', `Échangeur à plaques ${f0(v.P)} kW (≈ ${f1(v.A)} m²)`, 1, 8, { type: 'echangeur', modele: true }),
      it('SONDES-ECH', REG_S, 'Sonde de température à plongeur (départ secondaire, retour primaire)', 2, 0.5, { mots: ['sonde', 'temperature'] })] : []),
    // Désemboueur : compté par le schéma de principe s'il en porte un
    traitementEau: (v, e, n, c) => (v.V > 0 ? [it('CPT-APP', 'Équipements hydrauliques', 'Compteur d\'eau d\'appoint à émetteur d\'impulsions', 1, 1, { mots: ['compteur', 'eau'] }),
      ...(c.desemboueurSchema ? [] : [it('DESEMB', 'Équipements hydrauliques', `Pot à boue / désemboueur magnétique DN ${v.dnDesemboueur || 40}`, 1, 3, { type: 'desemboueur', dn: v.dnDesemboueur })]),
      ...(/adouc/i.test(v.decision || '') ? [it('ADOUC', 'Équipements hydrauliques', 'Adoucisseur de l\'eau d\'appoint', 1, 4, { mots: ['adoucisseur'] })] : []),
      it('POT-INJ', 'Équipements hydrauliques', 'Pot d\'introduction de produit de traitement (inhibiteur)', 1, 1.5, { mots: ['pot', 'introduction'] })] : []),
  };

  // Décore chaque type : lignes propres du calcul, puis compléments ; un calcul sans versElec en reçoit un ; séquences de
  // régulation (versRegulation), métré (versMetre) et application de régulation (appRegulation) ajoutés s'ils manquent
  function brancher() {
    Object.entries(COMPLEMENTS).forEach(([k, f]) => {
      const T = N.TYPES[k];
      if (!T || T._elecAnnexe) return;
      const propre = typeof T.versElec === 'function' ? T.versElec : null;
      T.versElec = (v, e, n) => [...(propre ? propre(v, e, n) || [] : []), ...(f(v || {}, e || {}, n) || [])];
      T._elecAnnexe = true;
    });
    const ctxVide = { ref: () => '', notes: [], valeurs: () => null };
    Object.entries(REGULATIONS).forEach(([k, f]) => { const T = N.TYPES[k]; if (T && typeof T.versRegulation !== 'function') T.versRegulation = (v, e, n, c) => f(v || {}, e || {}, n, { ...ctxVide, ...(c || {}) }); });
    Object.entries(METRES).forEach(([k, f]) => { const T = N.TYPES[k]; if (T && typeof T.versMetre !== 'function') T.versMetre = (v, e, n, c) => (f(v || {}, e || {}, n, { ...ctxVide, ...(c || {}) }) || []).filter(x => x && x.qte > 0); });
    Object.entries(APPS).forEach(([k, a]) => { const T = N.TYPES[k]; if (T && !T.appRegulation) T.appRegulation = a; });
  }
  // Node : modules des calculs annexes chargés d'abord (dans le navigateur, ils précèdent ce fichier)
  if (typeof module !== 'undefined' && typeof window === 'undefined') ['emetteurs', 'energie', 'froid', 'air', 'plomberie', 'reglementaire'].forEach(t => { try { require(`./annexes-${t}`); } catch (err) { /* module absent */ } });
  brancher();
  return { COMPLEMENTS, REGULATIONS, METRES, APPS, cleMetre, brancher };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = AnnexesElec;
