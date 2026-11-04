// Alimentation électrique et régulation des équipements d'une étude : pour chaque émetteur, producteur ou auxiliaire,
// d'où il est alimenté (attente électrique du lot électricité, ou armoire CVC à la charge du lot CVC), son départ
// (protection, contacteur, variateur, câble) et sa régulation (points automate, analyse fonctionnelle).
// Vision globale : bilan de puissance par armoire (phases équilibrées, foisonnement, réserve), demandes au lot électricité,
// liste des points et entrées / sorties par armoire, analyse fonctionnelle, cahier des charges du tableautier et schéma
// unifilaire de chaque armoire. Les équipements se reprennent des autres calculs de l'étude (schéma de principe, réseaux,
// CTA, ventilation…). Valeurs de pré-dimensionnement : la note de calcul du lot électricité fait foi (NF C 15-100).
const Electricite = ((N, Sc) => {
  const nf = N.nf, num = N.num, alerte = (niveau, texte) => ({ niveau, texte });

  /* ---------- Listes ---------- */
  // Types d'équipements : [libellé, moteur (pointe de démarrage), tension, départ, régulation, préfixe de repère]
  const TYPES_EQ = {
    generateur: ['Chaudière / générateur (auxiliaires)', false, 'mono', 'direct', 'mod', 'G'],
    pac: ['PAC / groupe froid', true, 'tri', 'direct', 'bus', 'PAC'],
    pompe: ['Pompe / circulateur', true, 'mono', 'direct', 'tor', 'P'],
    ventilateur: ['Ventilateur, extracteur, caisson VMC', true, 'tri', 'variateur', 'var', 'V'],
    cta: ['Centrale de traitement d\'air (armoire propre)', true, 'tri', 'direct', 'bus', 'CTA'],
    aerotherme: ['Aérotherme', true, 'mono', 'contacteur', 'tor', 'AT'],
    ventilo: ['Ventilo-convecteur, cassette', true, 'mono', 'direct', 'regul', 'VC'],
    split: ['Split, unité intérieure / extérieure', true, 'mono', 'direct', 'regul', 'SP'],
    resistance: ['Résistance électrique, batterie électrique, ballon', false, 'tri', 'contacteur', 'tor', 'R'],
    vanne: ['Vanne motorisée, servomoteur', false, '24V', 'equipement', 'v010', 'VM'],
    regulateur: ['Régulateur terminal, thermostat', false, '24V', 'equipement', 'regul', 'RT'],
    sonde: ['Sonde, capteur, compteur', false, '24V', 'equipement', 'sonde', 'S'],
    securite: ['Sécurité (arrêt d\'urgence, détection gaz, pressostat, thermostat)', false, '24V', 'equipement', 'securite', 'SEC'],
    electrovanne: ['Électrovanne gaz / vanne de police', false, 'mono', 'equipement', 'evGaz', 'EVG'],
    autre: ['Autre équipement', false, 'mono', 'direct', 'tor', 'EQ'],
  };
  const TENSIONS = { mono: '230 V mono', tri: '400 V tri', '24V': '24 V (depuis l\'armoire)' };
  const DEPARTS = { direct: 'Disjoncteur (départ direct)', contacteur: 'Disjoncteur + contacteur', variateur: 'Variateur de vitesse', etoile: 'Démarreur étoile-triangle / progressif', equipement: 'Sans départ propre (24 V de l\'armoire ou via l\'équipement)' };
  // Régulation : libellé, points [suffixe, désignation, type], phrase d'analyse fonctionnelle
  const REGULS = {
    aucune: ['Aucune (marche permanente)', [], 'en marche permanente dès la mise sous tension'],
    tor: ['Marche / arrêt, défaut', [['', 'Commande de marche', 'STOR'], ['', 'Défaut', 'ETOR']], 'mis en marche par l\'automate selon la demande et la programmation horaire ; défaut reporté'],
    torRetour: ['Marche / arrêt, défaut, retour de marche', [['', 'Commande de marche', 'STOR'], ['', 'Retour de marche', 'ETOR'], ['', 'Défaut', 'ETOR']], 'mis en marche par l\'automate selon la demande ; retour de marche contrôlé (alarme si absent après temporisation) ; défaut reporté'],
    var: ['Variateur : marche, vitesse, défaut', [['', 'Commande de marche', 'STOR'], ['', 'Consigne de vitesse', 'SA'], ['', 'Défaut variateur', 'ETOR']], 'mis en marche par l\'automate ; vitesse modulée (0-10 V) selon la consigne de débit ou de pression ; défaut du variateur reporté'],
    mod: ['Autorisation, modulation, défaut', [['', 'Autorisation de marche', 'STOR'], ['', 'Consigne / modulation', 'SA'], ['', 'Défaut', 'ETOR']], 'autorisé par l\'automate, puissance modulée par la consigne de départ (0-10 V) ; défaut reporté'],
    v3p: ['Vanne 3 points', [['', 'Ouverture', 'STOR'], ['', 'Fermeture', 'STOR']], 'positionnée par l\'automate (3 points) pour tenir la consigne de température'],
    v010: ['Vanne 0-10 V', [['', 'Commande 0-10 V', 'SA']], 'positionnée par l\'automate (0-10 V) pour tenir la consigne de température'],
    v010r: ['Vanne 0-10 V avec recopie', [['', 'Commande 0-10 V', 'SA'], ['', 'Recopie de position', 'EA']], 'positionnée par l\'automate (0-10 V) avec contrôle de la recopie de position'],
    sonde: ['Mesure (sonde, capteur)', [['', 'Mesure', 'EA']], 'mesure transmise à l\'automate (régulation et historiques)'],
    securite: ['Sécurité câblée, report d\'alarme', [['', 'Alarme / déclenchement', 'ETOR']], 'câblé en dur dans la chaîne de sécurité (coupure indépendante de l\'automate) ; déclenchement reporté à l\'automate et à la GTB'],
    evGaz: ['Électrovanne normalement fermée', [['', 'Commande d\'ouverture', 'STOR'], ['', 'Position fermée (fin de course)', 'ETOR']], 'ouverte par l\'automate quand la chaufferie est autorisée ; refermée en dur par l\'arrêt d\'urgence et la détection gaz ; position contrôlée'],
    terminal: ['Terminal piloté par l\'automate (points par appareil)', [], 'piloté par l\'automate de l\'armoire (points par appareil ci-dessous)'],
    esclave: ['Esclave d\'un maître (câblage maître / esclave)', [], 'commandé en parallèle par le régulateur de son maître (même consigne, sans sonde propre)'],
    impulsion: ['Comptage par impulsions', [['', 'Impulsions de comptage', 'ETOR']], 'comptage relevé par l\'automate (historiques, bilans d\'énergie)'],
    regul: ['Régulation propre, report à la GTB', [['', 'Défaut / état', 'ETOR']], 'régulé par son régulateur propre (consigne locale ou par bus) ; état et défaut reportés'],
    bus: ['Communication par bus (Modbus / BACnet)', [['', 'États, défauts, consignes, mesures', 'Bus']], 'piloté par bus (marche, consignes) ; états, défauts et mesures remontés par la communication'],
  };
  // Cartes d'entrées / sorties de l'automate : voies par carte et signal câblé
  const CARTES = { EA: [8, 'PT1000 / 0-10 V / 4-20 mA'], SA: [8, '0-10 V'], ETOR: [16, 'Contact sec 24 V DC'], STOR: [16, 'Relais 24 V DC / 230 V AC'] };
  // Liste de points GTB (présentation usuelle) : télé-alarme TA, télé-signalisation TS, télécomptage TCP, télémesure TM,
  // télécommande TC, téléréglage TR, point communiqué par bus COM, point logiciel LOG
  const CLASSES = ['TA', 'TS', 'TCP', 'TM', 'TC', 'TR'];
  function classeGtb(des, type) {
    const d = String(des || '').toLowerCase();
    if (type === 'LOG') return 'LOG';
    if (/impulsion|comptage|énergie|energie|compteur/.test(d)) return 'TCP';
    if (type === 'ETOR') return /défaut|defaut|alarme|déclenchement|sécurité|securite/.test(d) ? 'TA' : 'TS';
    if (type === 'EA') return 'TM';
    if (type === 'STOR') return 'TC';
    if (type === 'SA') return 'TR';
    // Point communiqué : classé d'après son libellé
    if (/défaut|defaut|alarme/.test(d)) return 'TA';
    if (/consigne|réglage|reglage/.test(d)) return 'TR';
    if (/marche \/ arrêt|commande|autorisation/.test(d)) return 'TC';
    if (/état|etat|retour de marche|mode|en service/.test(d)) return 'TS';
    return 'TM';
  }
  // Points lus et écrits par le bus d'un équipement communicant (Modbus / BACnet), selon son type
  const POINTS_BUS = {
    pac: ['Marche / arrêt', 'Consigne de température de départ', 'Température de départ', 'Température de retour', 'État de marche', 'Défaut / code alarme', 'Puissance électrique absorbée', 'Énergie électrique', 'Heures de fonctionnement et démarrages'],
    generateur: ['Autorisation de marche', 'Consigne de température de départ', 'Température de départ', 'Température de retour', 'État de marche (brûleur)', 'Défaut / code alarme', 'Taux de modulation', 'Heures de fonctionnement'],
    pompe: ['Marche / arrêt', 'Consigne (pression différentielle ou vitesse)', 'Retour de marche', 'Défaut / code alarme', 'Vitesse', 'Pression différentielle', 'Débit', 'Puissance électrique', 'Énergie électrique'],
    cta: ['Marche / arrêt', 'Consigne de température de soufflage', 'Température de soufflage', 'Température de reprise', 'Température d\'air neuf', 'État de marche', 'Défauts (ventilateurs, gel, filtres)', 'Encrassement des filtres', 'Vitesse des ventilateurs', 'Énergie électrique'],
    ventilateur: ['Marche / arrêt', 'Consigne de vitesse', 'Retour de marche', 'Défaut variateur', 'Vitesse', 'Puissance électrique'],
    ventilo: ['Marche / arrêt', 'Consigne de température', 'Température ambiante', 'Mode chaud / froid', 'État de marche', 'Défaut'],
    split: ['Marche / arrêt', 'Consigne de température', 'Température ambiante', 'Mode chaud / froid', 'État de marche', 'Défaut'],
  };
  const CALIBRES = [2, 4, 6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400, 500, 630];
  const SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240];
  // Section mini (mm², cuivre, PVC, pose sur chemin de câbles) selon le calibre de la protection
  const SECTION_CAL = { 2: 1.5, 4: 1.5, 6: 1.5, 10: 1.5, 16: 2.5, 20: 2.5, 25: 4, 32: 6, 40: 10, 50: 10, 63: 16, 80: 25, 100: 35, 125: 50, 160: 70, 200: 95, 250: 120, 320: 185, 400: 240, 500: 240, 630: 240 };
  const RHO = 0.0225; // Ω·mm²/m, cuivre en service

  const listeOpt = t => Object.entries(t).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]);
  // Armoires d'abord : une ligne sans choix est alimentée par la première armoire (sans armoire : attente électrique)
  const optAlim = e => [...(e.armoires || []).filter(a => a.rep).map(a => [a.rep, `Armoire ${a.rep}${a.local ? ` (${a.local})` : ''}`]), ['elec', 'Attente électrique (lot électricité)'], ['cvc', 'Armoire CVC (local CVC, la première)']];
  const selonType = l => [['', 'Selon le type'], ...l];
  const optPilote = e => [['', 'Armoire d\'alimentation'], ['autonome', 'Autonome (régulation propre)'], ...(e.armoires || []).filter(a => a.rep).map(a => [a.rep, `Armoire ${a.rep}`])];

  /* ---------- Calcul d'un départ ---------- */
  // Intensité d'emploi (A), protection, section et chute de tension d'un équipement alimenté en 230 / 400 V
  function depart(q) {
    const tri = q.tension === 'tri', P = num(q.P), cos = Math.min(1, Math.max(0.5, num(q.cos, q.moteur ? 0.85 : 0.95)));
    const Ib = P > 0 ? P * 1000 / (tri ? Math.sqrt(3) * 400 * cos : 230 * cos) : 0;
    const cal = CALIBRES.find(c => c >= Ib * (q.moteur && ['direct', 'contacteur'].includes(q.depart) ? 1.25 : 1)) || CALIBRES[CALIBRES.length - 1];
    let S = SECTION_CAL[cal] || 1.5;
    const L = num(q.L), du = s => (Ib && L ? (tri ? Math.sqrt(3) : 2) * RHO * L * Ib * cos / s / (tri ? 400 : 230) * 100 : 0);
    while (du(S) > 3 && SECTIONS.indexOf(S) < SECTIONS.length - 1) S = SECTIONS[SECTIONS.indexOf(S) + 1];
    const courbe = q.moteur && ['direct', 'contacteur', 'etoile'].includes(q.depart) ? 'D' : 'C';
    const conducteurs = tri ? (q.neutre ? '5G' : '4G') : '3G';
    return { Ib, cal, courbe, S, du: du(S), cable: `${conducteurs}${String(S).replace('.', ',')}`, tri };
  }

  /* ---------- Calcul complet ---------- */
  function calculer(e) {
    const alertes = [], arm = (e.armoires || []).filter(a => String(a.rep || '').trim()).map((a, i) => ({ ...a, rep: String(a.rep).trim(), i, ks: num(a.ks, 80) / 100, reserve: num(a.reserve, 20) / 100, eqs: [], phases: [0, 0, 0], pts: [] }));
    const parRep = new Map(arm.map(a => [a.rep, a]));
    if (!arm.length) alertes.push(alerte('attention', 'Aucune armoire CVC : ajoutez au moins une armoire (à la charge du lot CVC) ou alimentez tous les équipements par des attentes du lot électricité.'));
    const reps = new Set();
    const eqs = (e.equipements || []).map((x, i) => {
      const t = TYPES_EQ[x.type] || TYPES_EQ.autre, rep = String(x.rep || `${t[5]}${i + 1}`).trim();
      if (reps.has(rep)) alertes.push(alerte('erreur', `Repère ${rep} en double.`)); reps.add(rep);
      // « Armoire CVC » choisie sur l'appareil : la première armoire de l'étude (celle du local CVC)
      const alim0 = x.alim === 'cvc' ? (arm[0] ? arm[0].rep : 'elec') : x.alim;
      const q = { ...x, rep, t, moteur: t[1], tension: x.tension || t[2], depart: x.depart || t[3], regulation: x.regulation || t[4], alim: alim0 || (arm[0] ? arm[0].rep : 'elec') };
      if (q.alim !== 'elec' && !parRep.has(q.alim)) { alertes.push(alerte('attention', `${rep} : armoire « ${q.alim} » inconnue, équipement compté en attente électrique.`)); q.alim = 'elec'; }
      if (q.tension === '24V' && q.alim === 'elec') alertes.push(alerte('attention', `${rep} : un équipement en 24 V est alimenté depuis une armoire (choisissez l'armoire).`));
      q.d = q.tension === '24V' ? { Ib: 0, cal: 0, S: 0, du: 0, cable: '' } : depart(q);
      q.cosphi = Math.min(1, Math.max(0.5, num(q.cos, q.moteur ? 0.85 : 0.95)));
      // Contacteur : départ à contacteur ou démarreur, ou départ direct commandé en marche / arrêt par l'automate
      q.km = q.tension !== '24V' && (['contacteur', 'etoile'].includes(q.depart) || (q.depart === 'direct' && ['tor', 'torRetour'].includes(q.regulation)));
      if (q.d.du > 3) alertes.push(alerte('attention', `${rep} : chute de tension ${nf(q.d.du, 1)} % même en ${nf(q.d.S, 1)} mm² (longueur ${num(q.L)} m) — à vérifier par le lot électricité.`));
      if (q.tension !== '24V' && !num(q.P)) alertes.push(alerte('attention', `${rep} : puissance électrique à renseigner.`));
      if (q.depart === 'variateur' && q.tension !== '24V') q.diff = 'Différentiel 30 mA / 300 mA type B ou F (variateur)';
      // Armoire qui pilote (points automate) : celle choisie, sinon celle de l'alimentation, sinon la première
      q.pilote = x.pilote === 'autonome' ? null : parRep.get(x.pilote) || parRep.get(q.alim) || arm[0] || null;
      return q;
    });
    // Équilibrage des phases (charges monophasées réparties sur la phase la moins chargée), bilan par armoire
    eqs.filter(q => q.alim !== 'elec' && q.tension !== '24V').forEach(q => {
      const a = parRep.get(q.alim);
      a.eqs.push(q);
      if (q.d.tri) { a.phases = a.phases.map(v => v + q.d.Ib); q.phase = 'L1-L2-L3'; }
      else { const k = a.phases.indexOf(Math.min(...a.phases)); a.phases[k] += q.d.Ib; q.phase = `L${k + 1}`; }
    });
    eqs.filter(q => q.alim !== 'elec' && q.tension === '24V').forEach(q => parRep.get(q.alim).eqs.push(q));
    arm.forEach(a => {
      // Circuit de commande : automate, alimentation 24 V, éclairage et prise de l'armoire (environ 300 W sur une phase)
      const Icmd = 300 / 230;
      const k = a.phases.indexOf(Math.min(...a.phases)); a.phases[k] += Icmd;
      a.P = a.eqs.reduce((s, q) => s + num(q.P), 0) + 0.3;
      a.Pf = a.P * a.ks;
      a.Ib = Math.max(...a.phases) * a.ks * (1 + a.reserve);
      a.cal = CALIBRES.find(c => c >= a.Ib) || CALIBRES[CALIBRES.length - 1];
      a.S = SECTION_CAL[a.cal] || 1.5;
      const L = num(a.L);
      const du = s => (L ? Math.sqrt(3) * RHO * L * a.Ib * 0.85 / s / 400 * 100 : 0);
      while (du(a.S) > 2 && SECTIONS.indexOf(a.S) < SECTIONS.length - 1) a.S = SECTIONS[SECTIONS.indexOf(a.S) + 1];
      a.du = du(a.S);
      const ph = a.phases.filter(v => v > 0);
      a.desequilibre = ph.length ? (Math.max(...a.phases) - Math.min(...a.phases)) / Math.max(...a.phases) : 0;
      if (a.desequilibre > 0.3 && a.Ib > 10) alertes.push(alerte('attention', `Armoire ${a.rep} : phases déséquilibrées de ${nf(a.desequilibre * 100, 0)} % (répartissez les charges monophasées).`));
      if (!a.eqs.length) alertes.push(alerte('attention', `Armoire ${a.rep} : aucun équipement alimenté.`));
    });
    // Courts-circuits (méthode des impédances, pré-dimensionnement) : Icc maxi au jeu de barres de chaque armoire
    // (pouvoir de coupure des appareils), Icc mini en bout de chaque départ (déclenchement magnétique), sélectivité
    const iccT = Math.max(1, num(e.iccTgbt, 10)) * 1000, Zs = 400 / (Math.sqrt(3) * iccT), XL = 0.00008, RHO0 = 0.01851, RHOC = RHO0 * 1.25;
    const PDC = [6, 10, 15, 25, 36, 50, 70], IM = { B: 5, C: 10, D: 20 }, ccLignes = [];
    const iccMin = (Ramont, Xamont, L, S) => 0.95 * 230 / Math.hypot(Ramont + 2 * RHOC * L / S, Xamont + 2 * XL * L);
    arm.forEach(a => {
      // Sélectivité ampèremétrique avec le plus gros départ : la protection en tête (et son câble) est relevée si besoin
      const dep = a.eqs.filter(q => q.d.cal), maxDep = dep.reduce((m, q) => Math.max(m, q.d.cal), 0), tete = CALIBRES.find(c => c >= 1.6 * maxDep) || CALIBRES[CALIBRES.length - 1];
      a.selectif = !maxDep || a.cal >= 1.6 * maxDep;
      if (!a.selectif) {
        alertes.push(alerte('attention', `Armoire ${a.rep} : protection en tête ${a.cal} A pour un départ de ${maxDep} A — sélectivité ampèremétrique non assurée (rapport < 1,6) : portée à ${tete} A au TGBT (câble d'alimentation adapté), ou sélectivité vérifiée sur les tables du constructeur.`));
        a.calInitial = a.cal; a.cal = tete; a.S = Math.max(a.S, SECTION_CAL[a.cal] || a.S);
      }
      const L = num(a.L), Rc = RHO0 * L / a.S;
      a.Icc = 400 / (Math.sqrt(3) * Math.hypot(Rc, Zs + XL * L)); a.pdc = PDC.find(k => k * 1000 >= a.Icc) || 70;
      ccLignes.push([`Armoire ${a.rep} (jeu de barres)`, nf(a.Icc / 1000, 1), `${a.pdc} kA`, `${a.cal} A en tête`, maxDep ? `${maxDep} A` : '—', a.selectif ? 'Oui (≥ 1,6)' : `Portée de ${a.calInitial} à ${a.cal} A`]);
      dep.forEach(q => {
        q.Icc = a.Icc; q.pdc = a.pdc;
        q.IccMin = iccMin(2 * RHOC * L / a.S, Zs + 2 * XL * L, num(q.L), q.d.S);
        q.Ia = q.d.cal * (IM[q.d.courbe] || 10);
        if (num(q.L) && q.IccMin < q.Ia) alertes.push(alerte('erreur', `${q.rep} : Icc mini en bout de ligne ${nf(q.IccMin, 0)} A < seuil magnétique ${nf(q.Ia, 0)} A (${q.d.cal} A courbe ${q.d.courbe}) : section supérieure, courbe plus basse ou longueur réduite.`));
      });
    });
    eqs.filter(q => q.alim === 'elec' && q.d.cal).forEach(q => { q.Icc = iccT; q.pdc = PDC.find(k => k * 1000 >= iccT) || 70; q.IccMin = iccMin(0, Zs, num(q.L), q.d.S); q.Ia = q.d.cal * (IM[q.d.courbe] || 10); });
    const ccDeparts = eqs.filter(q => q.d.cal && num(q.L)).map(q => [q.rep, q.alim === 'elec' ? 'TGBT' : q.alim, `${q.d.cal} A ${q.d.courbe}`, q.d.cable, `${num(q.L)} m`, nf(q.IccMin, 0), nf(q.Ia, 0), q.IccMin >= q.Ia ? 'Oui' : 'Non']);

    // Points automate par armoire (régulation de chaque équipement)
    const pts = [];
    eqs.forEach(q => {
      const reg = REGULS[q.regulation] || REGULS.aucune;
      // Terminal piloté par l'automate : ses points (ventilateur, vannes, sonde…) ; groupe de n appareils : points par appareil
      const liste = q.regulation === 'terminal' && Array.isArray(q.pointsUnit) ? q.pointsUnit.map(([d, t]) => ['', d, t])
        : q.regulation === 'bus' && POINTS_BUS[q.type] ? POINTS_BUS[q.type].map(d => ['', d, 'Bus']) : [...reg[1]];
      if (q.moteur && q.regulation === 'tor' && q.depart === 'variateur') liste.push(['', 'Consigne de vitesse', 'SA']);
      const nb = Math.max(1, Math.round(num(q.nb, 1))), court = String(q.designation || q.t[0]).replace(/^\d+ × /, '');
      // Point : [repère, libellé, type d'E/S, armoire, classe GTB, protocole, équipement, libellé court]
      const proto = q.protocole || (e.busEquip || 'Modbus RTU');
      for (let k = 1; k <= nb; k++) liste.forEach(([, des, type]) => { const p = [nb > 1 ? `${q.rep}.${String(k).padStart(2, '0')}` : q.rep, `${des} — ${court}`, type, q.pilote ? q.pilote.rep : 'autonome', classeGtb(des, type), type === 'Bus' ? proto : '', `${q.rep} — ${court}${q.local && !court.includes(q.local) ? ` (${q.local})` : ''}`, des]; pts.push(p); if (q.pilote) q.pilote.pts.push(p); });
    });
    arm.forEach(a => { (a.sondes || '').split(/[;\n]+/).map(s => s.trim()).filter(Boolean).forEach(s => { const p = [`S-${a.rep}`, s, 'EA', a.rep, 'TM', '', `Mesures communes de l'armoire ${a.rep}`, s]; pts.push(p); a.pts.push(p); }); });
    // Points logiciels de chaque armoire : programmation horaire, consignes, alarmes de synthèse (présentation GTB)
    arm.filter(a => a.eqs.length).forEach(a => [['Programme horaire d\'occupation'], ['Consignes générales (confort, réduit, hors gel)'], ['Synthèse des défauts de l\'armoire']].forEach(([d]) => { const p = [`LOG-${a.rep}`, d, 'LOG', a.rep, d.startsWith('Synthèse') ? 'TA' : 'LOG', '', `Points logiciels de l'armoire ${a.rep}`, d]; pts.push(p); a.pts.push(p); }));
    // Liste de points au format GTB : une ligne par point, regroupée par armoire puis par équipement, une croix par classe
    const ptsGtb = (() => {
      const lignes = [], tot = { TA: 0, TS: 0, TCP: 0, TM: 0, TC: 0, TR: 0, COM: 0, LOG: 0 };
      const armoires = [...new Set(pts.map(p => p[3]))];
      armoires.forEach(ar => {
        lignes.push([ar === 'autonome' ? 'Équipements autonomes (régulation propre)' : `Armoire ${ar}`, '', '', '', '', '', '', '', '', '', '']);
        let eq = null;
        pts.filter(p => p[3] === ar).forEach(p => {
          const c = p[4], x = k => (c === k ? 'x' : '');
          CLASSES.forEach(k => { if (c === k) tot[k]++; }); if (p[5]) tot.COM++; if (p[2] === 'LOG') tot.LOG++;
          lignes.push([p[6] !== eq ? p[6] : '', p[7] || p[1], x('TA'), x('TS'), x('TCP'), x('TM'), x('TC'), x('TR'), p[5] || '', p[2] === 'LOG' ? 'x' : '', ['EA', 'SA', 'ETOR', 'STOR'].includes(p[2]) ? p[2] : '']);
          eq = p[6];
        });
      });
      lignes.push(['Totaux', '', ...CLASSES.map(k => String(tot[k])), String(tot.COM), String(tot.LOG), String(pts.filter(p => ['EA', 'SA', 'ETOR', 'STOR'].includes(p[2])).length)]);
      return { entetes: ['Équipement', 'Libellé du point', 'TA', 'TS', 'TCP', 'TM', 'TC', 'TR', 'COM (bus)', 'LOG', 'E/S automate'], lignes, total: true };
    })();
    const TYPES_PTS = ['EA', 'SA', 'ETOR', 'STOR', 'Bus'], LIB_PTS = { EA: 'Entrées analogiques (EA)', SA: 'Sorties analogiques (SA)', ETOR: 'Entrées TOR (ETOR)', STOR: 'Sorties TOR (STOR)', Bus: 'Points par bus' };
    const compte = l => TYPES_PTS.map(t => [t, l.filter(p => p[2] === t).length]);
    const gtb = e.gtb && e.gtb !== 'aucune' ? e.gtb : '';
    // Plan d'adressage : points rangés par type sur les cartes de l'automate (20 % de réserve), bornier X2 (2 bornes par point)
    arm.forEach(a => {
      a.cartes = {}; a.adresses = [];
      let borne = 1;
      ['EA', 'SA', 'ETOR', 'STOR'].forEach(t => {
        const l = a.pts.filter(p => p[2] === t), [cap, signal] = CARTES[t], nb = l.length ? Math.ceil(Math.ceil(l.length * 1.2) / cap) : 0;
        a.cartes[t] = nb;
        l.forEach((p, i) => { a.adresses.push([`${t}${Math.floor(i / cap) + 1}.${String(i % cap).padStart(2, '0')}`, `X2:${borne}-${borne + 1}`, p[0], p[1], t, signal]); borne += 2; });
        if (nb * cap > l.length) a.adresses.push([`${t}${Math.floor(l.length / cap) + 1}.${String(l.length % cap).padStart(2, '0')} …`, '', '—', `Réserve : ${nb * cap - l.length} voie(s) libre(s)`, t, signal]);
      });
      a.pts.filter(p => p[2] === 'Bus').forEach(p => a.adresses.push([`Bus ${gtb || 'Modbus'}`, '', p[0], p[1], 'Bus', 'Communication']));
      a.bornesES = borne - 1;
    });
    // Nomenclature de l'appareillage de chaque armoire (pour le tableautier)
    arm.forEach(a => {
      const lignes = new Map(), add = (famille, des, carac, qte = 1) => { const k = `${famille}|${des}|${carac}`, x = lignes.get(k); if (x) x[3] += qte; else lignes.set(k, [famille, des, carac, qte]); };
      const puiss = a.eqs.filter(q => q.tension !== '24V'), b24 = a.eqs.filter(q => q.tension === '24V');
      add('Arrivée', 'Interrupteur-sectionneur général 4P cadenassable', `${a.cal} A`);
      add('Arrivée', 'Parafoudre type 2 + protection', `400 V, Icc ${nf(a.Icc / 1000, 1)} kA`);
      let modules = 8, bornesP = 0, variateurs = 0;
      puiss.forEach(q => {
        const tri = q.d.tri, pol = tri ? '3P' : '1P+N';
        add('Protection', q.moteur ? 'Disjoncteur moteur magnéto-thermique' : 'Disjoncteur', `${pol} ${q.d.cal} A courbe ${q.d.courbe}, PdC ≥ ${a.pdc} kA`);
        modules += tri ? 3 : 2; bornesP += tri ? 5 : 3;
        if (q.km) { add('Commande', 'Contacteur bobine 24 V', `${tri ? '3P' : '2P'} ${q.d.cal} A (AC-3)`); modules += tri ? 3 : 2; }
        if (q.depart === 'variateur') { add('Variation', 'Variateur de vitesse', `${nf(num(q.P), 2)} kW ${tri ? '400 V tri' : '230 V mono'}, entrée 0-10 V, relais de défaut`); add('Protection', 'Interrupteur différentiel 30 mA type B ou F', `${tri ? '4P' : '2P'} ${q.d.cal} A`); variateurs++; modules += tri ? 4 : 2; }
        if (q.depart === 'etoile') add('Commande', 'Démarreur progressif (ou étoile-triangle)', `${nf(num(q.P), 2)} kW`);
        if (q.moteur && (q.km || q.depart === 'variateur')) { add('Façade', 'Commutateur arrêt / auto / manu', '3 positions'); add('Façade', 'Voyants marche (vert) et défaut (rouge)', 'LED 24 V', 2); }
      });
      const n24 = b24.length, nVannes = b24.filter(q => ['vanne', 'regulateur'].includes(q.type)).length;
      add('Commande', 'Disjoncteur du circuit de commande', '1P+N 2 A');
      add('Commande', 'Alimentation 24 V DC (automate, entrées, sondes)', `${nf(Math.max(2.5, Math.ceil((0.8 + n24 * 0.05 + a.pts.length * 0.01) * 2) / 2), 1)} A`);
      if (nVannes) add('Commande', 'Transformateur 230 / 24 V AC (servomoteurs)', `${Math.max(63, Math.ceil((nVannes * 12 + 20) / 25) * 25)} VA`);
      add('Automatisme', `Automate programmable (unité centrale)${gtb ? ` + communication ${gtb}` : ''}`, 'Horloge, historiques, serveur web');
      Object.entries(a.cartes).forEach(([t, n]) => { if (n) add('Automatisme', `Carte ${CARTES[t][0]} ${t}`, CARTES[t][1], n); });
      if (a.pts.some(p => p[2] === 'Bus')) add('Automatisme', 'Passerelle / port de communication des équipements', 'Modbus RTU ou BACnet MS/TP');
      add('Raccordement', 'Bornes de puissance (bornier X1)', 'Section selon départ', bornesP + 5);
      add('Raccordement', 'Bornes d\'entrées / sorties (bornier X2), sectionnables pour les mesures', '2,5 mm²', a.bornesES + Math.ceil(a.bornesES * 0.2));
      add('Enveloppe', 'Éclairage intérieur, prise de service 2P+T, porte-plans', '');
      modules += 8 + Object.values(a.cartes).reduce((s, n) => s + 2 * n, 0);
      const rangees = Math.max(2, Math.ceil(modules * 1.2 / 24)), H = Math.min(2000, Math.ceil((rangees * 150 + 300 + (variateurs ? 400 : 0)) / 200) * 200), L = variateurs > 2 || rangees > 8 ? 800 : 600;
      add('Enveloppe', 'Armoire métallique IP 54 (estimation)', `≈ ${H} × ${L} × 300 mm, ${rangees} rangées DIN de 24 modules${variateurs ? ` + ${variateurs} variateur(s) sur plaque` : ''}, 20 % de réserve`);
      a.nomenclature = [...lignes.values()];
      a.enveloppe = { H, L, rangees, variateurs };
    });
    // Bornier de puissance : bornes numérotées à la suite, phases, neutre et terre par départ
    const borniersX1 = a => { let n = 1; return a.eqs.filter(q => q.tension !== '24V').map(q => { const c = q.d.tri ? (q.neutre ? ['L1', 'L2', 'L3', 'N', 'PE'] : ['L1', 'L2', 'L3', 'PE']) : ['L', 'N', 'PE'], b = `X1:${n}-${n + c.length - 1}`; n += c.length; return [b, `Q-${q.rep}`, `${q.rep} — ${q.designation || q.t[0]}`, c.join(' · '), q.d.cable, q.local || ''] }); };
    // Bilan de puissance jusqu'au TGBT : armoires CVC (foisonnées) et attentes directes du lot électricité
    const ksT = num(e.ksTgbt, 90) / 100;
    const ligneBilan = (nom, alim, P, ks, S, Ib) => [nom, alim, nf(P, 2), `${nf(ks * 100, 0)} %`, nf(P * ks, 2), S ? nf(P / S, 2) : '—', nf(S * ks, 2), nf(Ib, 1)];
    const bilan = [
      ...arm.map(a => { const S = a.eqs.reduce((s, q) => s + num(q.P) / q.cosphi, 0) + 0.3; return { nom: `Armoire ${a.rep}${a.local ? ` (${a.local})` : ''}`, alim: '400 V tri', P: a.P, ks: a.ks, S, Ib: a.Ib }; }),
      ...eqs.filter(q => q.alim === 'elec' && q.tension !== '24V').map(q => ({ nom: `${q.rep} — ${q.designation || q.t[0]}`, alim: TENSIONS[q.tension], P: num(q.P), ks: 1, S: num(q.P) / q.cosphi, Ib: q.d.Ib })),
    ];
    const Pappel = bilan.reduce((s, x) => s + x.P * x.ks, 0) * ksT, Sappel = bilan.reduce((s, x) => s + x.S * x.ks, 0) * ksT, Itgbt = Sappel * 1000 / (Math.sqrt(3) * 400);
    const tableauBilan = { entetes: ['Départ du TGBT', 'Alimentation', 'P installée (kW)', 'Foisonnement', 'P appelée (kW)', 'cos φ', 'S appelée (kVA)', 'Ib (A, phase la plus chargée)'],
      lignes: [...bilan.map(x => ligneBilan(x.nom, x.alim, x.P, x.ks, x.S, x.Ib)),
        ['Total CVC au TGBT', `simultanéité ${nf(ksT * 100, 0)} %`, nf(bilan.reduce((s, x) => s + x.P, 0), 2), '', nf(Pappel, 2), Sappel ? nf(Pappel / Sappel, 2) : '—', nf(Sappel, 2), `${nf(Itgbt, 1)} (phases équilibrées)`]], total: true };
    // Analyse fonctionnelle : une phrase par équipement, puis les principes communs
    const af = eqs.map(q => `${q.rep} — ${q.designation || q.t[0]}${q.regulation !== 'aucune' ? '' : ''} : ${q.afAuto || (REGULS[q.regulation] || REGULS.aucune)[2]}${q.fonctionnement ? `. ${String(q.fonctionnement).trim().replace(/\.$/, '')}` : ''}${q.pilote ? ` (automate de l'armoire ${q.pilote.rep})` : q.regulation === 'aucune' ? '' : ' (régulation autonome)'}.`);
    af.push(`Modes de marche de chaque départ : arrêt / automatique / marche forcée (commutateur en façade ou forçage depuis la ${e.gtb && e.gtb !== 'aucune' ? `GTB (${e.gtb})` : 'supervision'}) ; voyants de marche et de défaut.`);
    af.push('Programmation horaire et dérogations par zone ; hors gel des équipements à eau sous 3 °C extérieur ; dégommage hebdomadaire des pompes et des vannes en période d\'arrêt.');
    af.push('Coupure d\'urgence et sécurités câblées en dur (indépendantes de l\'automate) ; reprise automatique après coupure secteur avec démarrages échelonnés.');
    if (e.gtb && e.gtb !== 'aucune') af.push(`Communication ${e.gtb} avec la GTB : états, défauts, consignes, mesures, comptages et historiques.`);
    const lot = String(e.lotElec || 'lot électricité');
    // Demandes au lot électricité : alimentation de chaque armoire CVC et attentes directes des équipements
    const demandes = [
      ...arm.map(a => [`Armoire ${a.rep}`, a.local || '', '400 V tri + N + PE', nf(a.Pf, 1), nf(a.Ib, 1), `${a.cal} A`, `5G${String(a.S).replace('.', ',')}${num(a.L) ? ` (${num(a.L)} m)` : ''}`, 'Alimentation de l\'armoire CVC depuis le TGBT']),
      ...eqs.filter(q => q.alim === 'elec').map(q => [`${q.rep} — ${q.designation || q.t[0]}`, q.local || '', TENSIONS[q.tension] || q.tension, nf(num(q.P), 2), nf(q.d.Ib, 1), q.d.cal ? `${q.d.cal} A courbe ${q.d.courbe}` : '—',
        q.d.cable ? `${q.d.cable}${num(q.L) ? ` (${num(q.L)} m)` : ''}` : '', `Attente électrique avec interrupteur de proximité${q.diff ? ` ; ${q.diff}` : ''}${q.pilote ? ` ; liaisons de commande et de défaut vers l'armoire ${q.pilote.rep} (lot CVC)` : ''}`]),
    ];
    const ligneEq = q => [q.rep, q.designation || q.t[0], nf(num(q.P), 2), TENSIONS[q.tension] || q.tension, q.alim === 'elec' ? `Attente ${lot}` : `Armoire ${q.alim}${q.phase ? ` (${q.phase})` : ''}`,
      DEPARTS[q.depart] || q.depart, q.d.Ib ? nf(q.d.Ib, 1) : '—', q.d.cal ? `${q.d.cal} A ${q.d.courbe}` : '—', q.d.cable ? `${q.d.cable}${q.d.du ? ` · ΔU ${nf(q.d.du, 1)} %` : ''}` : '—', (REGULS[q.regulation] || REGULS.aucune)[0]];
    const PCvc = arm.reduce((s, a) => s + a.P, 0), Pelec = eqs.filter(q => q.alim === 'elec').reduce((s, q) => s + num(q.P), 0), Ptot = PCvc + Pelec;
    // Cahier des charges de chaque armoire (pour le tableautier)
    const ccArmoire = a => {
      const io = compte(a.pts), nb = t => (io.find(x => x[0] === t) || [, 0])[1];
      return [
        { titre: `Armoire ${a.rep}${a.local ? ` — ${a.local}` : ''}`, liste: [
          `Alimentation : 400 V tri + N + PE depuis le TGBT (${lot}), intensité d'emploi ${nf(a.Ib, 1)} A (foisonnement ${nf(a.ks * 100, 0)} %, réserve ${nf(a.reserve * 100, 0)} %).`,
          `Interrupteur-sectionneur général ${a.cal} A cadenassable en façade, parafoudre, protection différentielle des départs selon le schéma de liaison à la terre${a.regime ? ` (${a.regime})` : ''}.`,
          `${a.eqs.filter(q => q.tension !== '24V').length} départ(s) de puissance (voir le tableau), chaque départ repéré, avec commutateur arrêt / auto / manu et voyants marche / défaut pour les moteurs.`,
          `Circuit de commande : transformateur ou alimentation 24 V, protection dédiée, alimentation de l'automate et des organes 24 V (${a.eqs.filter(q => q.tension === '24V').length} équipement(s) : vannes, sondes, régulateurs).`,
          `Automate programmable : ${nb('EA')} EA, ${nb('SA')} SA, ${nb('ETOR')} ETOR, ${nb('STOR')} STOR${nb('Bus') ? `, ${nb('Bus')} équipement(s) par bus` : ''}, plus 20 % de réserve câblée, soit ${Object.entries(a.cartes).filter(([, n]) => n).map(([t, n]) => `${n} carte(s) ${CARTES[t][0]} ${t}`).join(', ') || 'aucune carte'} ; ${e.gtb && e.gtb !== 'aucune' ? `communication ${e.gtb} vers la GTB` : 'interface opérateur en façade'}.`,
          `Enveloppe : IP 54 minimum (≈ ${a.enveloppe.H} × ${a.enveloppe.L} × 300 mm estimés), ventilation adaptée aux variateurs, 20 % de place disponible, éclairage et prise de service, porte-plans ; schémas, plan d'adressage et programme remis au DOE.`] },
        { titre: `Bornier X1 (puissance) — armoire ${a.rep}`, tableau: { entetes: ['Bornes', 'Départ', 'Équipement', 'Conducteurs', 'Câble', 'Vers'], lignes: borniersX1(a) } },
        { titre: `Nomenclature de l'appareillage — armoire ${a.rep}`, tableau: { entetes: ['Famille', 'Désignation', 'Caractéristiques', 'Qté'], lignes: a.nomenclature.map(x => [x[0], x[1], x[2], String(x[3])]) } },
        { titre: `Départs de l'armoire ${a.rep}`, tableau: { entetes: ['Repère', 'Équipement', 'P (kW)', 'Tension', 'Phase', 'Départ', 'Ib (A)', 'Protection', 'Câble'],
          lignes: a.eqs.map(q => [q.rep, q.designation || q.t[0], nf(num(q.P), 2), TENSIONS[q.tension] || q.tension, q.phase || '24 V', DEPARTS[q.depart] || q.depart, q.d.Ib ? nf(q.d.Ib, 1) : '—', q.d.cal ? `${q.d.cal} A ${q.d.courbe}` : '—', q.d.cable || '—']) } },
        { titre: `Bilan de puissance de l'armoire ${a.rep}`, tableau: { entetes: ['Puissance installée (kW)', 'Foisonnée (kW)', 'L1 (A)', 'L2 (A)', 'L3 (A)', 'Ib avec réserve (A)', 'Interrupteur général'],
          lignes: [[nf(a.P, 2), nf(a.Pf, 2), ...a.phases.map(v => nf(v * a.ks, 1)), nf(a.Ib, 1), `${a.cal} A`]] } },
        { titre: `Plan d'adressage des entrées / sorties — armoire ${a.rep}`, tableau: { entetes: ['Adresse', 'Bornes', 'Repère', 'Désignation', 'Type', 'Signal'], lignes: a.adresses } },
      ];
    };
    return {
      valeurs: { listePoints: pts, Ptot, PCvc, Pelec, Pappel, Sappel, Itgbt, armoires: arm.map(a => ({ rep: a.rep, P: a.P, Ib: a.Ib, cal: a.cal, cartes: a.cartes, enveloppe: a.enveloppe })), points: pts.length,
        // Classeur Excel : bilan, attentes, équipements, points, puis adressage et nomenclature de chaque armoire
        feuilles: [
          { name: 'Bilan de puissance', entetes: tableauBilan.entetes, lignes: tableauBilan.lignes },
          { name: 'Attentes lot élec', entetes: ['Pour', 'Local', 'Tension', 'P (kW)', 'Ib (A)', 'Protection en tête', 'Câble indicatif', 'À prévoir'], lignes: demandes },
          { name: 'Équipements', entetes: ['Repère', 'Équipement', 'P (kW)', 'Tension', 'Alimenté par', 'Départ', 'Ib (A)', 'Protection', 'Câble', 'Régulation'], lignes: eqs.map(ligneEq) },
          { name: 'Liste des points', entetes: ptsGtb.entetes, lignes: ptsGtb.lignes },
          ...arm.flatMap(a => [{ name: `E-S ${a.rep}`, entetes: ['Adresse', 'Bornes', 'Repère', 'Désignation', 'Type', 'Signal'], lignes: a.adresses },
            { name: `Nomenclature ${a.rep}`, entetes: ['Famille', 'Désignation', 'Caractéristiques', 'Qté'], lignes: a.nomenclature }])] },
      resume: [['Équipements', `${eqs.length} (${eqs.filter(q => q.alim === 'elec').length} sur attente électrique, ${eqs.filter(q => q.alim !== 'elec').length} sur armoire CVC)`],
        ['Puissance électrique installée', `${nf(Ptot, 1)} kW`], ['Dont armoires CVC (lot CVC, commande comprise)', `${nf(PCvc, 1)} kW`], ['Dont attentes du lot électricité', `${nf(Pelec, 1)} kW`],
        ...arm.map(a => [`Armoire ${a.rep}`, `${nf(a.P, 1)} kW installés, Ib ${nf(a.Ib, 1)} A → interrupteur ${a.cal} A, alimentation 5G${String(a.S).replace('.', ',')}`]),
        ['Points automate', `${pts.length} (${compte(pts).filter(x => x[1]).map(([t, n]) => `${n} ${t}`).join(', ')})`],
        ['Puissance appelée au TGBT (CVC)', `${nf(Pappel, 1)} kW · ${nf(Sappel, 1)} kVA · ${nf(Itgbt, 1)} A sous 400 V`]],
      tableaux: [
        { titre: 'Équipements : alimentation et régulation', entetes: ['Repère', 'Équipement', 'P (kW)', 'Tension', 'Alimenté par', 'Départ', 'Ib (A)', 'Protection', 'Câble', 'Régulation'], lignes: eqs.map(ligneEq) },
        { titre: 'Bilan par armoire CVC', entetes: ['Armoire', 'Équipements', 'P installée (kW)', 'P foisonnée (kW)', 'L1 / L2 / L3 (A)', 'Ib (A)', 'Interrupteur', 'Alimentation'],
          lignes: arm.map(a => [a.rep, String(a.eqs.length), nf(a.P, 2), nf(a.Pf, 2), a.phases.map(v => nf(v * a.ks, 1)).join(' / '), nf(a.Ib, 1), `${a.cal} A`, `5G${String(a.S).replace('.', ',')}${a.du ? ` · ΔU ${nf(a.du, 1)} %` : ''}`]) },
        { titre: `Demandes au ${lot}`, entetes: ['Pour', 'Local', 'Tension', 'P (kW)', 'Ib (A)', 'Protection en tête', 'Câble indicatif', 'À prévoir'], lignes: demandes },
      ],
      alertes,
      hypotheses: ['Intensité d\'emploi : Ib = P / (U · cos φ) en monophasé 230 V, P / (√3 · 400 · cos φ) en triphasé ; cos φ 0,85 pour les moteurs, 0,95 sinon (modifiable).',
        'Protection : calibre normalisé ≥ Ib (≥ 1,25 Ib pour un moteur en démarrage direct), courbe D pour les moteurs démarrés en direct, C sinon.',
        'Section : cuivre, isolant PVC, pose sur chemin de câbles, au moins la section associée au calibre ; augmentée tant que la chute de tension du départ dépasse 3 % (2 % pour l\'alimentation d\'une armoire).',
        'Armoire : charges monophasées réparties sur la phase la moins chargée ; Ib = phase la plus chargée × foisonnement × (1 + réserve) ; circuit de commande compté 300 W.',
        'Pré-dimensionnement à confirmer par la note de calcul du lot électricité (NF C 15-100 : facteurs de correction, sélectivité, courts-circuits, schéma de liaison à la terre).'],
      synthese: `${eqs.length} équipement(s) · ${nf(Ptot, 1)} kW · ${arm.length} armoire(s) CVC · ${pts.length} point(s) automate`,
      schema: unifilaire(arm, lot),
      // Folios complémentaires par armoire : commande (contacteurs, variateurs, chaîne de sécurité) et cartes de l'automate
      schemas: arm.flatMap(a => [{ titre: `Folio de commande — armoire ${a.rep}`, svg: folioCommande(a) }, ...(a.adresses.some(x => x[2] !== '—' && !/^Bus/.test(x[0])) ? [{ titre: `Cartes d'entrées / sorties — armoire ${a.rep}`, svg: folioCartes(a) }] : [])]).filter(s => s.svg),
      titreSchema: 'Schéma unifilaire des armoires CVC',
      onglets: [
        { titre: 'Bilan de puissance', blocs: [
          { titre: 'Bilan de puissance au TGBT (lot CVC)', tableau: tableauBilan },
          { titre: `Attentes à demander au ${lot}`, tableau: { entetes: ['Pour', 'Local', 'Tension', 'P (kW)', 'Ib (A)', 'Protection en tête', 'Câble indicatif', 'À prévoir'], lignes: demandes } },
          { titre: 'Courts-circuits et sélectivité', tableau: { entetes: ['Point', 'Icc maxi (kA)', 'Pouvoir de coupure mini', 'Protection en tête', 'Plus gros départ', 'Sélectivité ampèremétrique'], lignes: ccLignes } },
          ...(ccDeparts.length ? [{ titre: 'Déclenchement en bout de ligne (Icc mini)', tableau: { entetes: ['Départ', 'Depuis', 'Protection', 'Câble', 'Longueur', 'Icc mini (A)', 'Seuil magnétique (A)', 'Protégé'], lignes: ccDeparts } }] : []),
          { texte: [`Icc au TGBT pris égal à ${nf(iccT / 1000, 1)} kA (à confirmer par le lot électricité) ; impédance amont réactive, câbles cuivre (ρ ${RHO0} Ω·mm²/m à 20 °C pour l'Icc maxi, × 1,25 pour l'Icc mini), réactance 0,08 mΩ/m ; Icc mini phase-neutre à 0,95 · 230 V ; seuil magnétique 5, 10 ou 20 In (courbes B, C, D).`] },
          { texte: [`Puissance installée ${nf(Ptot, 1)} kW ; appelée ${nf(Pappel, 1)} kW (${nf(Sappel, 1)} kVA), foisonnement de chaque armoire puis simultanéité ${nf(ksT * 100, 0)} % au TGBT. À transmettre au ${lot} pour le bilan général et l'abonnement.`] }] },
        { titre: 'Régulation', blocs: [
          { titre: 'Analyse fonctionnelle', liste: af },
          { titre: 'Liste des points GTB (TA télé-alarme, TS télé-signalisation, TCP télécomptage, TM télémesure, TC télécommande, TR téléréglage, COM point communiqué, LOG point logiciel)', tableau: ptsGtb },
          { titre: 'Entrées / sorties par armoire', tableau: { entetes: ['Armoire', ...TYPES_PTS.map(t => LIB_PTS[t]), 'Total avec 20 % de réserve'],
            lignes: arm.map(a => { const io = compte(a.pts); return [a.rep, ...io.map(([, n]) => String(n)), String(io.filter(([t]) => t !== 'Bus').reduce((s, [, n]) => s + Math.ceil(n * 1.2), 0))]; }) } },
          ...arm.map(a => ({ titre: `Plan d'adressage — armoire ${a.rep} (${Object.entries(a.cartes).filter(([, n]) => n).map(([t, n]) => `${n} × ${CARTES[t][0]} ${t}`).join(', ') || 'aucune carte'})`, tableau: { entetes: ['Adresse', 'Bornes', 'Repère', 'Désignation', 'Type', 'Signal'], lignes: a.adresses } }))] },
        { titre: 'Cahier des charges armoires', blocs: [{ titre: 'Objet', liste: [`Réalisation des armoires CVC (lot CVC) : puissance, commande et automatisme, d'après le schéma unifilaire et la liste des points ci-dessous. Les attentes électriques des armoires et des équipements alimentés directement sont dues par le ${lot}.`] },
          ...arm.flatMap(ccArmoire)] },
      ],
    };
  }

  /* ---------- Folios de commande et des cartes de l'automate (SVG) ---------- */
  const echapper = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Schéma « à échelle » : rail 24 V à gauche, 0 V à droite ; une ligne par circuit de commande
  function folioCommande(a) {
    const adr = (rep, type) => (a.adresses.find(x => x[2] === rep && x[4] === type) || [])[0] || '';
    const secu = a.pts.filter(p => p[2] === 'ETOR' && /Alarme \/ déclenchement/.test(p[1])).map(p => p[0]);
    const lignes = [];
    if (secu.length) lignes.push({ titre: 'Chaîne de sécurité (câblée en dur, indépendante de l\'automate)', el: secu.map(r => ({ t: 'NF', l: r })), fin: { t: 'bobine', l: 'KA1', s: 'Relais de sécurité' } });
    a.eqs.forEach(q => {
      if (q.regulation === 'evGaz') lignes.push({ titre: `${q.rep} — ${q.designation || q.t[0]}`, el: [...(secu.length ? [{ t: 'NO', l: 'KA1' }] : []), { t: 'NO', l: adr(q.rep, 'STOR'), s: 'automate' }], fin: { t: 'bobine', l: q.rep, s: 'électrovanne NF' } });
      else if (q.regulation === 'mod' || (q.type === 'generateur' && q.regulation !== 'bus')) lignes.push({ titre: `${q.rep} — ${q.designation || q.t[0]}`, el: [...(secu.length ? [{ t: 'NO', l: 'KA1' }] : []), { t: 'NO', l: adr(q.rep, 'STOR'), s: 'automate' }], fin: { t: 'sortie', l: `${q.rep}`, s: 'autorisation (bornier du générateur)' } });
      else if (q.km) lignes.push({ titre: `${q.rep} — ${q.designation || q.t[0]}`, el: [{ t: 'S3', l: `S-${q.rep}`, s: 'A / 0 / M' }, { t: 'NO', l: adr(q.rep, 'STOR'), s: 'automate' }, { t: 'NF', l: `Q-${q.rep}`, s: 'disj. moteur' }], fin: { t: 'bobine', l: `KM-${q.rep}`, s: `${q.d.cal} A` }, voyants: q.moteur });
      else if (q.depart === 'variateur') lignes.push({ titre: `${q.rep} — ${q.designation || q.t[0]} (variateur)`, el: [{ t: 'S3', l: `S-${q.rep}`, s: 'A / 0 / M' }, { t: 'NO', l: adr(q.rep, 'STOR'), s: 'automate' }], fin: { t: 'sortie', l: `VAR-${q.rep}`, s: `marche ; vitesse ${adr(q.rep, 'SA') || '0-10 V'}` }, voyants: true });
    });
    if (!lignes.length) return '';
    const pas = 58, W = 980, H = 70 + lignes.length * pas, out = [], xG = 40, xD = W - 40;
    const tx = (x, y, s, o = {}) => out.push(`<text x="${x}" y="${y}" font-size="${o.fs || 10}" text-anchor="${o.a || 'middle'}"${o.b ? ' font-weight="bold"' : ''} fill="${o.c || '#222'}">${echapper(s)}</text>`);
    const ln = (x1, y1, x2, y2, w = 1.2) => out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#222" stroke-width="${w}"/>`);
    tx(10, 18, `Armoire ${a.rep} — folio de commande 24 V`, { a: 'start', b: true, fs: 12 });
    tx(xG, 40, '+24 V', { fs: 9 }); tx(xD, 40, '0 V', { fs: 9 });
    ln(xG, 46, xG, H - 10, 2); ln(xD, 46, xD, H - 10, 2);
    lignes.forEach((l, i) => {
      const y = 70 + i * pas;
      tx(xG + 8, y - 16, l.titre, { a: 'start', fs: 9, c: '#555' });
      let x = xG;
      l.el.forEach(c => {
        ln(x, y, x + 30, y); x += 30;
        if (c.t === 'NO' || c.t === 'NF') { ln(x, y - 9, x, y + 9); ln(x + 14, y - 9, x + 14, y + 9); if (c.t === 'NF') ln(x - 3, y + 8, x + 17, y - 8, 1); }
        else { out.push(`<rect x="${x}" y="${y - 9}" width="14" height="18" fill="#fff" stroke="#222"/>`); ln(x + 3, y + 6, x + 11, y - 6, 1); }
        tx(x + 7, y + 22, c.l, { fs: 8, b: true }); if (c.s) tx(x + 7, y + 32, c.s, { fs: 7, c: '#555' });
        x += 14;
      });
      const xf = xD - 150;
      ln(x, y, xf, y);
      if (l.fin.t === 'bobine') { out.push(`<rect x="${xf}" y="${y - 10}" width="34" height="20" fill="#fff" stroke="#222" stroke-width="1.4"/>`); ln(xf + 34, y, xD, y); }
      else { out.push(`<polygon points="${xf},${y - 9} ${xf + 26},${y} ${xf},${y + 9}" fill="#fff" stroke="#222"/>`); }
      tx(xf + 17, y + 24, l.fin.l, { fs: 8, b: true }); tx(xf + 40, y - 12, l.fin.s, { a: 'start', fs: 8, c: '#555' });
      if (l.voyants) { tx(xf - 60, y + 24, 'H vert : marche · H rouge : défaut', { fs: 7, c: '#555' }); }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif"><rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>${out.join('')}</svg>`;
  }
  // Cartes de l'automate : une colonne par carte, une ligne par voie (adresse, bornes, repère, désignation)
  function folioCartes(a) {
    const cartes = new Map();
    // Toutes les cartes prévues (réserve comprise), dans l'ordre EA, SA, ETOR, STOR
    Object.entries(a.cartes).forEach(([t, n]) => { for (let k = 1; k <= n; k++) cartes.set(`${t}${k}`, []); });
    a.adresses.filter(x => x[2] !== '—' && !/^Bus/.test(x[0])).forEach(x => { const c = x[0].split('.')[0]; if (!cartes.has(c)) cartes.set(c, []); cartes.get(c).push(x); });
    [...cartes.keys()].forEach(c => { if (!cartes.get(c).length) cartes.get(c).type = c.replace(/\d+$/, ''); });
    if (!cartes.size) return '';
    const larg = 235, hl = 15, maxV = Math.max(...[...cartes.values()].map(l => (CARTES[l.length ? l[0][4] : l.type] || [16])[0])), W = 20 + cartes.size * (larg + 15), H = 70 + maxV * hl + 20, out = [];
    const tx = (x, y, s, o = {}) => out.push(`<text x="${x}" y="${y}" font-size="${o.fs || 8}" text-anchor="${o.a || 'start'}"${o.b ? ' font-weight="bold"' : ''} fill="${o.c || '#222'}">${echapper(s)}</text>`);
    tx(10, 18, `Armoire ${a.rep} — cartes d'entrées / sorties de l'automate (réserve en grisé)`, { b: true, fs: 12 });
    [...cartes.entries()].forEach(([nom, l], k) => {
      const x = 20 + k * (larg + 15), type = l.length ? l[0][4] : l.type, cap = (CARTES[type] || [16])[0];
      out.push(`<rect x="${x}" y="34" width="${larg}" height="${30 + cap * hl}" fill="#fff" stroke="#222" stroke-width="1.4"/>`);
      tx(x + 6, 50, `${nom} — ${cap} ${type}`, { b: true, fs: 10 }); tx(x + larg - 6, 50, (CARTES[type] || [, ''])[1], { a: 'end', fs: 7, c: '#555' });
      for (let v = 0; v < cap; v++) {
        const y = 70 + v * hl, p = l.find(z => z[0] === `${nom}.${String(v).padStart(2, '0')}`);
        out.push(`<line x1="${x}" y1="${y - 11}" x2="${x + larg}" y2="${y - 11}" stroke="#ddd"/>`);
        tx(x + 6, y, String(v).padStart(2, '0'), { c: p ? '#222' : '#aaa' });
        if (p) { tx(x + 24, y, p[1], { c: '#555', fs: 7 }); tx(x + 72, y, p[2], { b: true }); tx(x + 112, y, String(p[3]).replace(/^[^—]*— /, '').slice(0, 26), { fs: 7 }); }
        else tx(x + 24, y, 'réserve', { c: '#aaa', fs: 7 });
      }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif"><rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>${out.join('')}</svg>`;
  }

  /* ---------- Schéma unifilaire (SVG) ---------- */
  function unifilaire(arm, lot) {
    if (!arm.length) return '';
    const pas = 112, haut = 330, marge = 24, larg = Math.max(...arm.map(a => a.eqs.filter(q => q.tension !== '24V').length + 2)) * pas + 60, out = [];
    const t = (x, y, s, o = {}) => out.push(`<text x="${x}" y="${y}" font-size="${o.fs || 10}" text-anchor="${o.a || 'middle'}"${o.b ? ' font-weight="bold"' : ''} fill="#222">${String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`);
    const l = (x1, y1, x2, y2, w = 1.4) => out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#222" stroke-width="${w}"/>`);
    const r = (x, y, w, h) => out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#222" stroke-width="1.2"/>`);
    arm.forEach((a, n) => {
      const y0 = marge + n * (haut + 30), xa = 50;
      t(10, y0, `Armoire ${a.rep}${a.local ? ` — ${a.local}` : ''} · ${nf(a.P, 1)} kW installés · Ib ${nf(a.Ib, 1)} A`, { a: 'start', b: true, fs: 12 });
      // Arrivée et interrupteur général
      t(xa, y0 + 22, `Attente ${lot}`, { fs: 9 }); t(xa, y0 + 33, `5G${String(a.S).replace('.', ',')} · 400 V`, { fs: 9 });
      l(xa, y0 + 38, xa, y0 + 60); r(xa - 16, y0 + 60, 32, 26); l(xa - 10, y0 + 80, xa + 10, y0 + 66); t(xa + 22, y0 + 76, `QG ${a.cal} A`, { a: 'start', fs: 9 });
      l(xa, y0 + 86, xa, y0 + 104);
      const departs = [...a.eqs.filter(q => q.tension !== '24V'), { rep: 'CMD', designation: 'Commande 24 V, automate', commande: true }];
      const xFin = xa + departs.length * pas;
      l(xa, y0 + 104, xFin, y0 + 104, 3);
      departs.forEach((q, i) => {
        const x = xa + (i + 1) * pas - 30;
        l(x, y0 + 104, x, y0 + 124);
        r(x - 12, y0 + 124, 24, 22); l(x - 7, y0 + 141, x + 7, y0 + 129);
        t(x + 16, y0 + 134, `Q${i + 1}`, { a: 'start', fs: 8 }); t(x + 16, y0 + 144, q.commande ? '2 A' : `${q.d.cal} A ${q.d.courbe}`, { a: 'start', fs: 8 });
        let y = y0 + 146;
        l(x, y, x, y + 14); y += 14;
        if (q.commande) { out.push(`<circle cx="${x}" cy="${y + 8}" r="8" fill="#fff" stroke="#222"/>`, `<circle cx="${x}" cy="${y + 18}" r="8" fill="#fff" stroke="#222"/>`); t(x + 16, y + 16, 'T 230/24 V', { a: 'start', fs: 8 }); y += 26; }
        else if (q.km) { r(x - 12, y, 24, 18); t(x, y + 13, q.depart === 'etoile' ? 'DEM' : 'KM', { fs: 8 }); y += 18; }
        else if (q.depart === 'variateur') { r(x - 16, y, 32, 22); t(x, y + 14, 'VAR', { fs: 8 }); l(x - 14, y + 20, x + 14, y + 2, 0.8); y += 22; }
        l(x, y, x, y + 40); y += 40;
        if (!q.commande) { t(x - 4, y - 24, q.d.cable, { a: 'end', fs: 8 }); if (num(q.L)) t(x - 4, y - 14, `${num(q.L)} m`, { a: 'end', fs: 8 }); }
        if (q.commande) { r(x - 26, y, 52, 24); t(x, y + 15, 'Automate', { fs: 8 }); }
        else { out.push(`<circle cx="${x}" cy="${y + 12}" r="12" fill="#fff" stroke="#222" stroke-width="1.2"/>`); t(x, y + 16, q.moteur ? 'M' : '~', { fs: 10, b: true }); }
        t(x, y + 40, q.rep, { fs: 9, b: true }); t(x, y + 52, String(q.designation || '').slice(0, 20), { fs: 8 });
        if (!q.commande) t(x, y + 64, `${nf(num(q.P), 2)} kW · ${q.d.tri ? '400 V' : '230 V'}${q.phase ? ` · ${q.phase}` : ''}`, { fs: 8 });
      });
    });
    const H = marge + arm.length * (haut + 30);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${larg}" height="${H}" viewBox="0 0 ${larg} ${H}"><rect x="0" y="0" width="${larg}" height="${H}" fill="#fff"/>${out.join('')}</svg>`;
  }

  /* ---------- Reprise des équipements des autres calculs de l'étude ---------- */
  // Renvoie des lignes d'équipements { src, rep, designation, type, P (kW), tension, regulation } ; src identifie la source
  function equipementsEtude(etude, Liens) {
    const out = [], notes = (etude.notes || []).filter(n => n.type !== 'elec');
    // Inventaire du dossier de consultation (CCTP / DPGF) : ses équipements d'abord ; ceux du schéma de même type sont alors écartés
    const inv = typeof InventaireCVC !== 'undefined' && (etude.inventaire || []).length ? InventaireCVC.versElec(etude.inventaire) : [];
    out.push(...inv);
    const dejaInv = new Set(inv.map(x => x.type));
    const kW = w => Math.round(num(w) / 10) / 100;
    const pompeP = (pompe, Pabs) => kW(pompe && pompe.P1 ? pompe.P1 : Pabs);
    // Terminaux saisis appareil par appareil : ils remplacent l'estimation des émetteurs des circuits
    const avecTerminaux = notes.some(n => n.type === 'terminaux' && ((n.entrees || {}).appareils || []).length);
    // Puissance électrique lue sur la fiche technique (kW), sinon saisie, sinon estimation
    const kwFiche = x => (x !== undefined && x !== '' && Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : null);
    notes.forEach((n, ni) => {
      let es, r;
      try { es = Liens.resoudre(etude, n).entrees; r = N.calculer(n.type, es); } catch (err) { return; }
      const v = r.valeurs || {}, titre = n.titre || '';
      const ajout = (cle, o) => { if (!dejaInv.has(o.type) || o.type === 'sonde') out.push({ src: `${n.id}:${cle}`, ...o }); };
      if (n.type === 'terminaux' && typeof Terminaux !== 'undefined') { Terminaux.versElec(n, r).forEach(o => out.push(o)); return; }
      const fiche = es.fiche || {};
      if (n.type === 'pid') {
        let d; try { d = Sc.dimensionner(es); } catch (err) { return; }
        const G = Sc.GENERATEURS[es.generateur] || ['Générateur'], pac = /^(pac|gf)/.test(es.generateur || '');
        for (let i = 1; i <= d.n; i++) {
          if (/^echangeur/.test(es.generateur || '')) continue;
          // Puissance électrique du générateur : saisie, sinon lue sur sa fiche technique (P absorbée), sinon estimée
          const pGen = kwFiche(es.PelecGen) ?? (kwFiche(fiche.P1) ? Math.round(fiche.P1 / 10) / 100 : null);
          ajout(`gen${i}`, { metre: `gen|${es.generateur}|${d.Pg}`, rep: `${pac ? 'PAC' : 'G'}${i}`, designation: `${G[0]} ${i}${fiche.fabricant || fiche.reference ? ` — ${[fiche.fabricant, fiche.reference].filter(Boolean).join(' ')}` : ''}`, type: pac ? 'pac' : 'generateur',
            P: pGen ?? (pac ? Math.round(d.Pg / 3 * 10) / 10 : Math.max(0.2, Math.round(d.Pg * 0.003 * 10) / 10)), tension: es.tensionGen || (pac || d.Pg > 300 ? 'tri' : 'mono'), regulation: pac ? 'bus' : 'mod', alim: es.alimProd || '', ...(pGen != null ? { pFiche: true } : {}) });
          if (d.pompesInd && (d.bouteille || d.echangeur || d.n > 1)) ajout(`pp${i}`, { rep: `PP${i}`, designation: `Pompe primaire ${i}`, type: 'pompe', P: Math.max(0.05, Math.round(d.Qg * 8 / 367 / 0.45 * 100) / 100), tension: 'mono', regulation: 'tor' });
        }
        // PAC / groupe eau-eau sur nappe : pompe de forage, pompe de la boucle intermédiaire, contrôle de débit et température
        if (d.forage) {
          const F = d.forage;
          ajout('pforage', { rep: 'PF', designation: `Pompe immergée du forage (${nf(F.Qn, 1)} m³/h, ${nf(F.H, 0)} mCE)`, type: 'pompe', P: Math.max(0.37, Math.round(F.Pel * 1.1 * 100) / 100), tension: F.Pel > 2.2 ? 'tri' : 'mono', regulation: 'torRetour', depart: F.Pel > 4 ? 'variateur' : 'contacteur', alim: es.alimProd || '' });
          ajout('pinter', { rep: 'PBI', designation: 'Pompe de la boucle intermédiaire (échangeur de barrage)', type: 'pompe', P: Math.max(0.1, Math.round(F.Qi * 8 / 367 / 0.45 * 100) / 100), tension: 'mono', regulation: 'tor', alim: es.alimProd || '' });
          ajout('fqn', { rep: 'FT-N', designation: 'Contrôleur de débit de l\'eau de nappe', type: 'securite', P: 0, tension: '24V', regulation: 'securite' });
          ajout('tn', { rep: 'TN', designation: 'Sonde de température de l\'eau de nappe (entrée échangeur)', type: 'sonde', P: 0, tension: '24V', regulation: 'sonde' });
        }
        d.circuits.forEach((c, i) => {
          const k = i + 1;
          ajout(`pc${k}`, { ...(c.pompe ? { metre: `pompe|${c.pompe.modele}` } : {}), rep: `PC${k}`, designation: `Pompe ${c.rep}`, type: 'pompe', P: c.pompe && c.pompe.P1 ? kW(c.pompe.P1) : Math.max(0.05, Math.round(c.Q * Math.max(2, c.hmt) / 367 / 0.45 * 100) / 100), tension: 'mono',
            regulation: c.reg === '2v' || c.emetteur === 'ventilo' ? 'var' : 'tor', depart: c.reg === '2v' || c.emetteur === 'ventilo' ? 'variateur' : undefined });
          if (c.reg !== 'direct') ajout(`v${k}`, { rep: `V${k}`, designation: `Vanne de régulation ${c.rep}`, type: 'vanne', P: 0.01, tension: '24V', regulation: 'v010' });
          ajout(`td${k}`, { rep: `TD${k}`, designation: `Sonde de départ ${c.rep}`, type: 'sonde', P: 0, tension: '24V', regulation: 'sonde' });
          if (es.compteurs === 'oui') ajout(`ce${k}`, { rep: `CE${k}`, designation: `Compteur d'énergie ${c.rep}`, type: 'sonde', P: 0, tension: '24V', regulation: 'impulsion' });
          const annexe = ((es.circuits || [])[i] || {}).annexe, ctaReliee = annexe && (etude.notes || []).some(x => x.id === annexe && x.type === 'cta');
          const em = ctaReliee || (avecTerminaux && ['ventilo', 'aerotherme'].includes(c.emetteur)) ? null : { aerotherme: ['aerotherme', 0.5], ventilo: ['ventilo', 0.1], cta: ['cta', 3] }[c.emetteur];
          if (em) ajout(`em${k}`, { rep: `E${k}`, designation: `${(Sc.EMETTEURS[c.emetteur] || [''])[0]} — ${c.rep} (puissance à préciser)`, type: em[0], P: em[1], tension: 'mono', regulation: em[0] === 'aerotherme' ? 'tor' : 'regul' });
        });
        ajout('te', { rep: 'TE', designation: 'Sonde de température extérieure', type: 'sonde', P: 0, tension: '24V', regulation: 'sonde' });
        // Mesures et sécurités de la chaufferie / sous-station
        const gen = es.generateur || '', gaz = /^chaudiere-(cond|gaz)/.test(gen), fioul = gen === 'chaudiere-fioul', combustion = gaz || fioul || gen === 'chaudiere-bois';
        ajout('tdg', { rep: 'TDG', designation: 'Sonde de départ général (après découplage)', type: 'sonde', P: 0, tension: '24V', regulation: 'sonde' });
        ajout('pr', { rep: 'PR', designation: 'Capteur de pression du réseau', type: 'sonde', P: 0, tension: '24V', regulation: 'sonde' });
        ajout('pmq', { rep: 'PMQ', designation: 'Pressostat manque d\'eau', type: 'securite', P: 0, tension: '24V', regulation: 'securite' });
        if (combustion) ajout('au', { rep: 'AU', designation: 'Arrêt d\'urgence de la chaufferie (coup de poing à l\'extérieur du local)', type: 'securite', P: 0, tension: '24V', regulation: 'securite' });
        if (gaz) {
          ajout('dg', { rep: 'DG', designation: 'Centrale de détection gaz et capteurs', type: 'securite', P: 0.03, tension: 'mono', regulation: 'securite' });
          ajout('evg', { rep: 'EVG', designation: 'Électrovanne gaz normalement fermée (coupure de la chaufferie)', type: 'electrovanne', P: 0.02, tension: 'mono', regulation: 'evGaz' });
        }
        if (fioul) ajout('evg', { rep: 'EVF', designation: 'Vanne de police fioul (coupure de la chaufferie)', type: 'electrovanne', P: 0.02, tension: 'mono', regulation: 'evGaz' });
      }
      // Plomberie sanitaire : pompe de bouclage d'ECS (asservie à la température de retour) et sonde de retour de boucle
      if (n.type === 'sanitaire' && v.bouclage) {
        const B = v.bouclage;
        ajout('pbecs', { rep: 'PB-ECS', designation: `Pompe de bouclage ECS (${nf(B.Qb, 2)} m³/h, ${nf(B.H, 1)} mCE)`, type: 'pompe', P: Math.max(0.03, Math.round(B.Pel / 10) / 100), tension: 'mono', regulation: 'torRetour', alim: es.alimBouclage || '' });
        ajout('trb', { rep: 'TRB', designation: 'Sonde de température du retour de boucle ECS', type: 'sonde', P: 0, tension: '24V', regulation: 'sonde' });
      }
      if ((n.type === 'reseau' || n.type === 'arbo') && Number.isFinite(v.Pabs) && !(n.lien && n.lien.note) && !(Liens.circuitDeAnnexe && Liens.circuitDeAnnexe(etude.notes || [], n))) ajout('pompe', { rep: `P-N${ni + 1}`, designation: `Pompe — ${titre}`, type: 'pompe', P: pompeP(v.pompe, v.Pabs), tension: 'mono', regulation: 'tor' });
      if (n.type === 'aeraulique' && Number.isFinite(v.Pabs) && !(es.cta && notes.some(x => x.id === es.cta && x.type === 'cta'))) ajout('vent', { rep: `V-N${ni + 1}`, designation: `Ventilateur — ${titre}`, type: 'ventilateur', P: Math.max(0.1, kW(v.Pabs * 1.15)), tension: v.Pabs > 2200 ? 'tri' : 'mono', regulation: 'var', depart: 'variateur' });
      // Schéma aéraulique : ventilateurs du producteur (soufflage / insufflation, reprise / extraction)
      if (n.type === 'aero' && !(es.cta && notes.some(x => x.id === es.cta && x.type === 'cta'))) {
        const cta = /^cta/.test(v.producteur || ''), nom = es.titreInstallation || titre;
        const cleAero = `aero|${v.producteur}|${Math.round(Math.max(v.Qs || 0, v.Qr || 0))}`;
        if (v.Qs > 0 && Number.isFinite(v.PvS)) ajout('vs', { metre: cleAero, rep: `${cta ? 'VS' : 'VI'}-N${ni + 1}`, designation: `Ventilateur de ${cta ? 'soufflage' : 'insufflation'} — ${nom}`, type: 'ventilateur', P: Math.max(0.1, kW(v.PvS * 1.15)), tension: v.PvS > 2200 ? 'tri' : 'mono', regulation: 'var', depart: 'variateur' });
        if (v.Qr > 0 && Number.isFinite(v.PvR)) ajout('vr', { metre: cleAero, rep: `${cta ? 'VR' : 'VE'}-N${ni + 1}`, designation: `Ventilateur ${cta ? 'de reprise' : 'd\'extraction'} — ${nom}`, type: 'ventilateur', P: Math.max(0.1, kW(v.PvR * 1.15)), tension: v.PvR > 2200 ? 'tri' : 'mono', regulation: 'var', depart: 'variateur' });
      }
      if (n.type === 'cta' && Number.isFinite(v.PvS)) {
        // Ventilateurs : puissance saisie, sinon celle de la fiche technique de la centrale, sinon calculée (+ 15 %)
        const pS = kwFiche(es.PelecVS) ?? kwFiche(fiche.PelS), pR = kwFiche(es.PelecVR) ?? kwFiche(fiche.PelR), nomF = fiche.fabricant || fiche.reference ? ` — ${[fiche.fabricant, fiche.reference].filter(Boolean).join(' ')}` : '';
        const tS = es.tensionCta || ((pS ?? v.PvS / 1000) > 2.2 ? 'tri' : 'mono'), tR = es.tensionCta || ((pR ?? v.PvR / 1000) > 2.2 ? 'tri' : 'mono');
        ajout('vs', { metre: `cta|${num(es.Qs)}`, rep: `VS-N${ni + 1}`, designation: `Ventilateur de soufflage — ${titre}${nomF}`, type: 'ventilateur', P: pS ?? Math.max(0.1, kW(v.PvS * 1.15)), tension: tS, regulation: 'var', depart: 'variateur', alim: es.alim || '', ...(pS != null ? { pFiche: true } : {}) });
        if (Number.isFinite(v.PvR) && v.PvR > 0) ajout('vr', { metre: `cta|${num(es.Qs)}`, rep: `VR-N${ni + 1}`, designation: `Ventilateur de reprise — ${titre}${nomF}`, type: 'ventilateur', P: pR ?? Math.max(0.1, kW(v.PvR * 1.15)), tension: tR, regulation: 'var', depart: 'variateur', alim: es.alim || '', ...(pR != null ? { pFiche: true } : {}) });
        const pBe = kwFiche(es.PelBe) ?? kwFiche(fiche.Pbe);
        if (pBe) ajout('be', { rep: `BE-N${ni + 1}`, designation: `Batterie électrique — ${titre}`, type: 'resistance', P: pBe, tension: es.tensionCta || (pBe > 3.6 ? 'tri' : 'mono'), regulation: 'tor', alim: es.alim || '' });
      }
    });
    // Matériel retenu choisi dans le catalogue des fabricants : sa puissance électrique remplace l'estimation
    // (par appareil ; partagée entre les ventilateurs de soufflage et de reprise d'une même centrale)
    const retenu = etude.materiel || {}, groupes = new Map();
    out.forEach(o => { const m = o.metre && retenu[o.metre]; if (m && String(m.reference || '').trim() && m.pElec != null && Number.isFinite(Number(m.pElec))) { if (!groupes.has(o.metre)) groupes.set(o.metre, []); groupes.get(o.metre).push(o); } });
    groupes.forEach((ls, k) => {
      const m = retenu[k], pe = Number(m.pElec), ref = [m.fabricant, m.reference].map(x => String(x || '').trim()).filter(Boolean).join(' ');
      const partage = ls.length > 1 && ls.every(o => o.type === 'ventilateur'), tot = ls.reduce((s, o) => s + (num(o.P) || 0), 0) || ls.length;
      ls.forEach(o => { o.P = Math.round((partage ? pe * (num(o.P) || 1) / tot : pe) * 100) / 100; o.designation = `${o.designation} — ${ref}`; o.catalogue = ref; });
    });
    return out;
  }
  // Fusion avec les lignes déjà saisies : les choix (alimentation, départ, régulation, longueur…) des lignes déjà reprises sont gardés
  // L'alimentation choisie sur l'appareil (terminal, CTA, producteur) s'impose ; les lignes ajoutées à la main (sans
  // source) sont gardées telles quelles ; celles d'un calcul supprimé de l'étude sont retirées (noteIds : calculs existants)
  function fusionner(lignes, reprises, noteIds) {
    let garde = (lignes || []).slice();
    const n = { ajoutees: 0, majs: 0, retirees: 0 };
    if (noteIds) { const avant = garde.length; garde = garde.filter(l => !l.src || /^inv/.test(l.src) || noteIds.has(String(l.src).split(':')[0])); n.retirees = avant - garde.length; }
    reprises.forEach(r => {
      const ex = garde.find(l => l.src === r.src);
      if (ex) {
        const ch = {};
        if (num(ex.P) !== num(r.P)) ch.P = r.P;
        if (ex.designation !== r.designation && !ex.designationModifiee) ch.designation = r.designation;
        if (r.alim && ex.alim !== r.alim) ch.alim = r.alim;
        if (r.tension && r.pFiche && ex.tension !== r.tension) ch.tension = r.tension;
        if (r.regImpose && r.regulation && ex.regulation !== r.regulation) ch.regulation = r.regulation;
        ['nb', 'pointsUnit', 'afAuto', 'local'].forEach(k => { if (r[k] !== undefined && JSON.stringify(ex[k]) !== JSON.stringify(r[k])) ch[k] = r[k]; });
        if (Object.keys(ch).length) { Object.assign(ex, ch); n.majs++; }
      } else { garde.push({ ...r, alim: r.alim || '', depart: r.depart || '', pilote: '', L: '', fonctionnement: '' }); n.ajoutees++; }
    });
    return { lignes: garde, ...n };
  }

  /* ---------- Type de note ---------- */
  N.TYPES.elec = {
    titre: 'Alimentation électrique et régulation (armoires CVC)', icone: '⚡', famille: 'Électricité et régulation',
    description: 'Pour chaque équipement : alimenté par une attente du lot électricité ou par une armoire CVC, départ, protection, câble et régulation ; bilan des armoires, demandes au lot électricité, points automate, analyse fonctionnelle, cahier des charges et schéma unifilaire.',
    champs: [
      { g: 'Armoires CVC (à la charge du lot CVC)' },
      { k: 'armoires', l: 'Armoires', t: 'lignes', d: [{ rep: 'AR-CVC-01', local: 'Chaufferie', L: 30, ks: 80, reserve: 20, regime: 'TT', sondes: '' }],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'local', l: 'Local', t: 't' }, { k: 'L', l: 'Longueur depuis le TGBT (m)' }, { k: 'ks', l: 'Foisonnement (%)' }, { k: 'reserve', l: 'Réserve (%)' },
          { k: 'regime', l: 'Liaison à la terre', t: 's', o: [['TT', 'TT'], ['TN-S', 'TN-S'], ['TN-C', 'TN-C'], ['IT', 'IT']] }, { k: 'sondes', l: 'Sondes d\'ambiance / mesures communes (séparées par ;)', t: 't' }] },
      { g: 'Équipements (émetteurs, producteurs, auxiliaires)' },
      { k: 'equipements', l: 'Équipements — repris automatiquement des terminaux, CTA, producteurs et réseaux de l\'étude ; « + Ajouter une ligne » pour un équipement oublié (il figure au bilan et au schéma de l\'armoire)', t: 'lignes', d: [],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'designation', l: 'Désignation', t: 't' }, { k: 'type', l: 'Type', t: 's', o: [['', '— Type —'], ...listeOpt(TYPES_EQ)] },
          { k: 'P', l: 'P électrique (kW)' }, { k: 'tension', l: 'Tension', t: 's', o: selonType(Object.entries(TENSIONS)) },
          { k: 'alim', l: 'Alimenté par', t: 's', o: optAlim }, { k: 'depart', l: 'Départ', t: 's', o: selonType(Object.entries(DEPARTS)) }, { k: 'L', l: 'Longueur câble (m)' },
          { k: 'regulation', l: 'Régulation', t: 's', o: selonType(listeOpt(REGULS)) }, { k: 'pilote', l: 'Piloté par', t: 's', o: optPilote },
          { k: 'local', l: 'Local', t: 't' }, { k: 'fonctionnement', l: 'Fonctionnement particulier (analyse fonctionnelle)', t: 't' }] },
      { g: 'Lots et supervision' },
      { k: 'lotElec', l: 'Lot électricité (destinataire des demandes d\'attentes)', t: 't', d: 'Lot électricité' },
      { k: 'ksTgbt', l: 'Simultanéité des départs CVC au TGBT', u: '%', d: 90 },
      { k: 'iccTgbt', l: 'Courant de court-circuit au TGBT (donnée du lot électricité)', u: 'kA', d: 10 },
      { k: 'busEquip', l: 'Bus des équipements communicants', t: 's', o: [['Modbus RTU', 'Modbus RTU (RS485)'], ['Modbus TCP', 'Modbus TCP'], ['BACnet MS/TP', 'BACnet MS/TP'], ['BACnet/IP', 'BACnet/IP'], ['M-Bus', 'M-Bus (compteurs)']], d: 'Modbus RTU' },
      { k: 'gtb', l: 'Supervision / GTB', t: 's', o: [['aucune', 'Aucune (interface en façade)'], ['BACnet/IP', 'BACnet/IP'], ['Modbus TCP', 'Modbus TCP'], ['KNX', 'KNX'], ['LON', 'LON']], d: 'BACnet/IP' },
    ],
    calcul: calculer,
  };

  return { TYPES_EQ, TENSIONS, DEPARTS, REGULS, CARTES, depart, calculer, unifilaire, equipementsEtude, fusionner };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'), typeof Schema !== 'undefined' ? Schema : require('./schema'));
if (typeof module !== 'undefined') module.exports = Electricite;
