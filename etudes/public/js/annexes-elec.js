// Calculs annexes → bilan électrique et points GTC. Chaque calcul annexe qui pose du matériel (pompe, ventilateur,
// sonde, sécurité, compteur, électrovanne…) donne ses lignes d'équipements à l'armoire (Electricite.equipementsEtude) ;
// les points GTB / GTC en découlent par la régulation de chaque ligne (sonde → mesure EA, securite → alarme ETOR,
// tor → marche + défaut, var → marche + vitesse + défaut, impulsion → comptage, contact → état, bus → communication).
// Les lignes déjà données par un calcul (versElec propre : pompe, extracteur, groupe…) sont complétées ici par les
// mesures, sécurités et comptages attendus en exploitation. Les calculs sans matériel électrique (vérifications,
// réglementation, aides) n'ajoutent rien. Module pur (navigateur, node, tests).
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

  // Décore chaque type : lignes propres du calcul, puis compléments ; un calcul sans versElec en reçoit un
  function brancher() {
    Object.entries(COMPLEMENTS).forEach(([k, f]) => {
      const T = N.TYPES[k];
      if (!T || T._elecAnnexe) return;
      const propre = typeof T.versElec === 'function' ? T.versElec : null;
      T.versElec = (v, e, n) => [...(propre ? propre(v, e, n) || [] : []), ...(f(v || {}, e || {}, n) || [])];
      T._elecAnnexe = true;
    });
  }
  // Node : modules des calculs annexes chargés d'abord (dans le navigateur, ils précèdent ce fichier)
  if (typeof module !== 'undefined' && typeof window === 'undefined') ['emetteurs', 'energie', 'froid', 'air', 'plomberie', 'reglementaire'].forEach(t => { try { require(`./annexes-${t}`); } catch (err) { /* module absent */ } });
  brancher();
  return { COMPLEMENTS, brancher };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = AnnexesElec;
