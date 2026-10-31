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
    regul: ['Régulation propre, report à la GTB', [['', 'Défaut / état', 'ETOR']], 'régulé par son régulateur propre (consigne locale ou par bus) ; état et défaut reportés'],
    bus: ['Communication par bus (Modbus / BACnet)', [['', 'États, défauts, consignes, mesures', 'Bus']], 'piloté par bus (marche, consignes) ; états, défauts et mesures remontés par la communication'],
  };
  const CALIBRES = [2, 4, 6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400, 500, 630];
  const SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240];
  // Section mini (mm², cuivre, PVC, pose sur chemin de câbles) selon le calibre de la protection
  const SECTION_CAL = { 2: 1.5, 4: 1.5, 6: 1.5, 10: 1.5, 16: 2.5, 20: 2.5, 25: 4, 32: 6, 40: 10, 50: 10, 63: 16, 80: 25, 100: 35, 125: 50, 160: 70, 200: 95, 250: 120, 320: 185, 400: 240, 500: 240, 630: 240 };
  const RHO = 0.0225; // Ω·mm²/m, cuivre en service

  const listeOpt = t => Object.entries(t).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]);
  // Armoires d'abord : une ligne sans choix est alimentée par la première armoire (sans armoire : attente électrique)
  const optAlim = e => [...(e.armoires || []).filter(a => a.rep).map(a => [a.rep, `Armoire ${a.rep}${a.local ? ` (${a.local})` : ''}`]), ['elec', 'Attente électrique (lot électricité)']];
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
      const q = { ...x, rep, t, moteur: t[1], tension: x.tension || t[2], depart: x.depart || t[3], regulation: x.regulation || t[4], alim: x.alim || (arm[0] ? arm[0].rep : 'elec') };
      if (q.alim !== 'elec' && !parRep.has(q.alim)) { alertes.push(alerte('attention', `${rep} : armoire « ${q.alim} » inconnue, équipement compté en attente électrique.`)); q.alim = 'elec'; }
      if (q.tension === '24V' && q.alim === 'elec') alertes.push(alerte('attention', `${rep} : un équipement en 24 V est alimenté depuis une armoire (choisissez l'armoire).`));
      q.d = q.tension === '24V' ? { Ib: 0, cal: 0, S: 0, du: 0, cable: '' } : depart(q);
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
    // Points automate par armoire (régulation de chaque équipement)
    const pts = [];
    eqs.forEach(q => {
      const reg = REGULS[q.regulation] || REGULS.aucune;
      const liste = [...reg[1]];
      if (q.moteur && q.regulation === 'tor' && q.depart === 'variateur') liste.push(['', 'Consigne de vitesse', 'SA']);
      liste.forEach(([, des, type]) => { const p = [q.rep, `${des} — ${q.designation || q.t[0]}`, type, q.pilote ? q.pilote.rep : 'autonome']; pts.push(p); if (q.pilote) q.pilote.pts.push(p); });
    });
    arm.forEach(a => { (a.sondes || '').split(/[;\n]+/).map(s => s.trim()).filter(Boolean).forEach(s => { const p = [`S-${a.rep}`, s, 'EA', a.rep]; pts.push(p); a.pts.push(p); }); });
    const TYPES_PTS = ['EA', 'SA', 'ETOR', 'STOR', 'Bus'], LIB_PTS = { EA: 'Entrées analogiques (EA)', SA: 'Sorties analogiques (SA)', ETOR: 'Entrées TOR (ETOR)', STOR: 'Sorties TOR (STOR)', Bus: 'Points par bus' };
    const compte = l => TYPES_PTS.map(t => [t, l.filter(p => p[2] === t).length]);
    // Analyse fonctionnelle : une phrase par équipement, puis les principes communs
    const af = eqs.map(q => `${q.rep} — ${q.designation || q.t[0]}${q.regulation !== 'aucune' ? '' : ''} : ${(REGULS[q.regulation] || REGULS.aucune)[2]}${q.fonctionnement ? `. ${String(q.fonctionnement).trim().replace(/\.$/, '')}` : ''}${q.pilote ? ` (automate de l'armoire ${q.pilote.rep})` : q.regulation === 'aucune' ? '' : ' (régulation autonome)'}.`);
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
          `Automate programmable : ${nb('EA')} EA, ${nb('SA')} SA, ${nb('ETOR')} ETOR, ${nb('STOR')} STOR${nb('Bus') ? `, ${nb('Bus')} équipement(s) par bus` : ''}, plus 20 % de réserve câblée ; ${e.gtb && e.gtb !== 'aucune' ? `communication ${e.gtb} vers la GTB` : 'interface opérateur en façade'}.`,
          `Enveloppe : IP 54 minimum, ventilation adaptée aux variateurs, 20 % de place disponible, éclairage et prise de service, porte-plans ; schémas et programme remis au DOE.`] },
        { titre: `Départs de l'armoire ${a.rep}`, tableau: { entetes: ['Repère', 'Équipement', 'P (kW)', 'Tension', 'Phase', 'Départ', 'Ib (A)', 'Protection', 'Câble'],
          lignes: a.eqs.map(q => [q.rep, q.designation || q.t[0], nf(num(q.P), 2), TENSIONS[q.tension] || q.tension, q.phase || '24 V', DEPARTS[q.depart] || q.depart, q.d.Ib ? nf(q.d.Ib, 1) : '—', q.d.cal ? `${q.d.cal} A ${q.d.courbe}` : '—', q.d.cable || '—']) } },
        { titre: `Bilan de puissance de l'armoire ${a.rep}`, tableau: { entetes: ['Puissance installée (kW)', 'Foisonnée (kW)', 'L1 (A)', 'L2 (A)', 'L3 (A)', 'Ib avec réserve (A)', 'Interrupteur général'],
          lignes: [[nf(a.P, 2), nf(a.Pf, 2), ...a.phases.map(v => nf(v * a.ks, 1)), nf(a.Ib, 1), `${a.cal} A`]] } },
        { titre: `Points automate de l'armoire ${a.rep}`, tableau: { entetes: ['Repère', 'Désignation', 'Type'], lignes: a.pts.map(p => p.slice(0, 3)) } },
      ];
    };
    return {
      valeurs: { Ptot, PCvc, Pelec, armoires: arm.map(a => ({ rep: a.rep, P: a.P, Ib: a.Ib, cal: a.cal })), points: pts.length },
      resume: [['Équipements', `${eqs.length} (${eqs.filter(q => q.alim === 'elec').length} sur attente électrique, ${eqs.filter(q => q.alim !== 'elec').length} sur armoire CVC)`],
        ['Puissance électrique installée', `${nf(Ptot, 1)} kW`], ['Dont armoires CVC (lot CVC, commande comprise)', `${nf(PCvc, 1)} kW`], ['Dont attentes du lot électricité', `${nf(Pelec, 1)} kW`],
        ...arm.map(a => [`Armoire ${a.rep}`, `${nf(a.P, 1)} kW installés, Ib ${nf(a.Ib, 1)} A → interrupteur ${a.cal} A, alimentation 5G${String(a.S).replace('.', ',')}`]),
        ['Points automate', `${pts.length} (${compte(pts).filter(x => x[1]).map(([t, n]) => `${n} ${t}`).join(', ')})`]],
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
      titreSchema: 'Schéma unifilaire des armoires CVC',
      onglets: [
        { titre: 'Régulation', blocs: [
          { titre: 'Analyse fonctionnelle', liste: af },
          { titre: 'Liste des points (automate / GTB)', tableau: { entetes: ['Repère', 'Désignation', 'Type', 'Armoire'], lignes: pts } },
          { titre: 'Entrées / sorties par armoire', tableau: { entetes: ['Armoire', ...TYPES_PTS.map(t => LIB_PTS[t]), 'Total avec 20 % de réserve'],
            lignes: arm.map(a => { const io = compte(a.pts); return [a.rep, ...io.map(([, n]) => String(n)), String(io.filter(([t]) => t !== 'Bus').reduce((s, [, n]) => s + Math.ceil(n * 1.2), 0))]; }) } }] },
        { titre: 'Cahier des charges armoires', blocs: [{ titre: 'Objet', liste: [`Réalisation des armoires CVC (lot CVC) : puissance, commande et automatisme, d'après le schéma unifilaire et la liste des points ci-dessous. Les attentes électriques des armoires et des équipements alimentés directement sont dues par le ${lot}.`] },
          ...arm.flatMap(ccArmoire)] },
      ],
    };
  }

  /* ---------- Schéma unifilaire (SVG) ---------- */
  function unifilaire(arm, lot) {
    if (!arm.length) return '';
    const pas = 112, haut = 330, marge = 24, larg = Math.max(...arm.map(a => a.eqs.length + 2)) * pas + 60, out = [];
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
        else if (q.depart === 'contacteur' || q.depart === 'etoile') { r(x - 12, y, 24, 18); t(x, y + 13, 'KM', { fs: 8 }); y += 18; }
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
    notes.forEach((n, ni) => {
      let es, r;
      try { es = Liens.resoudre(etude, n).entrees; r = N.calculer(n.type, es); } catch (err) { return; }
      const v = r.valeurs || {}, titre = n.titre || '';
      const ajout = (cle, o) => { if (!dejaInv.has(o.type) || o.type === 'sonde') out.push({ src: `${n.id}:${cle}`, ...o }); };
      if (n.type === 'pid') {
        let d; try { d = Sc.dimensionner(es); } catch (err) { return; }
        const G = Sc.GENERATEURS[es.generateur] || ['Générateur'], pac = /^(pac|gf)/.test(es.generateur || '');
        for (let i = 1; i <= d.n; i++) {
          if (/^echangeur/.test(es.generateur || '')) continue;
          ajout(`gen${i}`, { rep: `${pac ? 'PAC' : 'G'}${i}`, designation: `${G[0]} ${i}`, type: pac ? 'pac' : 'generateur', P: pac ? Math.round(d.Pg / 3 * 10) / 10 : Math.max(0.2, Math.round(d.Pg * 0.003 * 10) / 10), tension: pac || d.Pg > 300 ? 'tri' : 'mono', regulation: pac ? 'bus' : 'mod' });
          if (d.pompesInd && (d.bouteille || d.echangeur || d.n > 1)) ajout(`pp${i}`, { rep: `PP${i}`, designation: `Pompe primaire ${i}`, type: 'pompe', P: Math.max(0.05, Math.round(d.Qg * 8 / 367 / 0.45 * 100) / 100), tension: 'mono', regulation: 'tor' });
        }
        d.circuits.forEach((c, i) => {
          const k = i + 1;
          ajout(`pc${k}`, { rep: `PC${k}`, designation: `Pompe ${c.rep}`, type: 'pompe', P: c.pompe && c.pompe.P1 ? kW(c.pompe.P1) : Math.max(0.05, Math.round(c.Q * Math.max(2, c.hmt) / 367 / 0.45 * 100) / 100), tension: 'mono',
            regulation: c.reg === '2v' || c.emetteur === 'ventilo' ? 'var' : 'tor', depart: c.reg === '2v' || c.emetteur === 'ventilo' ? 'variateur' : undefined });
          if (c.reg !== 'direct') ajout(`v${k}`, { rep: `V${k}`, designation: `Vanne de régulation ${c.rep}`, type: 'vanne', P: 0.01, tension: '24V', regulation: 'v010' });
          ajout(`td${k}`, { rep: `TD${k}`, designation: `Sonde de départ ${c.rep}`, type: 'sonde', P: 0, tension: '24V', regulation: 'sonde' });
          const em = { aerotherme: ['aerotherme', 0.5], ventilo: ['ventilo', 0.1], cta: ['cta', 3] }[c.emetteur];
          if (em) ajout(`em${k}`, { rep: `E${k}`, designation: `${(Sc.EMETTEURS[c.emetteur] || [''])[0]} — ${c.rep} (puissance à préciser)`, type: em[0], P: em[1], tension: 'mono', regulation: em[0] === 'aerotherme' ? 'tor' : 'regul' });
        });
        ajout('te', { rep: 'TE', designation: 'Sonde de température extérieure', type: 'sonde', P: 0, tension: '24V', regulation: 'sonde' });
      }
      if ((n.type === 'reseau' || n.type === 'arbo') && Number.isFinite(v.Pabs) && !(n.lien && n.lien.note)) ajout('pompe', { rep: `P-N${ni + 1}`, designation: `Pompe — ${titre}`, type: 'pompe', P: pompeP(v.pompe, v.Pabs), tension: 'mono', regulation: 'tor' });
      if (n.type === 'aeraulique' && Number.isFinite(v.Pabs)) ajout('vent', { rep: `V-N${ni + 1}`, designation: `Ventilateur — ${titre}`, type: 'ventilateur', P: Math.max(0.1, kW(v.Pabs * 1.15)), tension: v.Pabs > 2200 ? 'tri' : 'mono', regulation: 'var', depart: 'variateur' });
      // Schéma aéraulique : ventilateurs du producteur (soufflage / insufflation, reprise / extraction)
      if (n.type === 'aero') {
        const cta = /^cta/.test(v.producteur || ''), nom = es.titreInstallation || titre;
        if (v.Qs > 0 && Number.isFinite(v.PvS)) ajout('vs', { rep: `${cta ? 'VS' : 'VI'}-N${ni + 1}`, designation: `Ventilateur de ${cta ? 'soufflage' : 'insufflation'} — ${nom}`, type: 'ventilateur', P: Math.max(0.1, kW(v.PvS * 1.15)), tension: v.PvS > 2200 ? 'tri' : 'mono', regulation: 'var', depart: 'variateur' });
        if (v.Qr > 0 && Number.isFinite(v.PvR)) ajout('vr', { rep: `${cta ? 'VR' : 'VE'}-N${ni + 1}`, designation: `Ventilateur ${cta ? 'de reprise' : 'd\'extraction'} — ${nom}`, type: 'ventilateur', P: Math.max(0.1, kW(v.PvR * 1.15)), tension: v.PvR > 2200 ? 'tri' : 'mono', regulation: 'var', depart: 'variateur' });
      }
      if (n.type === 'cta' && Number.isFinite(v.PvS)) {
        ajout('vs', { rep: `VS-N${ni + 1}`, designation: `Ventilateur de soufflage — ${titre}`, type: 'ventilateur', P: Math.max(0.1, kW(v.PvS * 1.15)), tension: v.PvS > 2200 ? 'tri' : 'mono', regulation: 'var', depart: 'variateur' });
        if (Number.isFinite(v.PvR) && v.PvR > 0) ajout('vr', { rep: `VR-N${ni + 1}`, designation: `Ventilateur de reprise — ${titre}`, type: 'ventilateur', P: Math.max(0.1, kW(v.PvR * 1.15)), tension: v.PvR > 2200 ? 'tri' : 'mono', regulation: 'var', depart: 'variateur' });
      }
    });
    return out;
  }
  // Fusion avec les lignes déjà saisies : les choix (alimentation, départ, régulation, longueur…) des lignes déjà reprises sont gardés
  function fusionner(lignes, reprises) {
    const garde = (lignes || []).slice(), n = { ajoutees: 0, majs: 0 };
    reprises.forEach(r => {
      const ex = garde.find(l => l.src === r.src);
      if (ex) { if (num(ex.P) !== num(r.P) || ex.designation !== r.designation) { Object.assign(ex, { P: r.P, designation: ex.designationModifiee ? ex.designation : r.designation }); n.majs++; } }
      else { garde.push({ ...r, alim: '', depart: r.depart || '', pilote: '', L: '', fonctionnement: '' }); n.ajoutees++; }
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
      { k: 'equipements', l: 'Équipements — « ⚡ Reprendre les équipements de l\'étude » les ajoute depuis les autres calculs', t: 'lignes', d: [],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'designation', l: 'Désignation', t: 't' }, { k: 'type', l: 'Type', t: 's', o: [['', '— Type —'], ...listeOpt(TYPES_EQ)] },
          { k: 'P', l: 'P électrique (kW)' }, { k: 'tension', l: 'Tension', t: 's', o: selonType(Object.entries(TENSIONS)) },
          { k: 'alim', l: 'Alimenté par', t: 's', o: optAlim }, { k: 'depart', l: 'Départ', t: 's', o: selonType(Object.entries(DEPARTS)) }, { k: 'L', l: 'Longueur câble (m)' },
          { k: 'regulation', l: 'Régulation', t: 's', o: selonType(listeOpt(REGULS)) }, { k: 'pilote', l: 'Piloté par', t: 's', o: optPilote },
          { k: 'local', l: 'Local', t: 't' }, { k: 'fonctionnement', l: 'Fonctionnement particulier (analyse fonctionnelle)', t: 't' }] },
      { g: 'Lots et supervision' },
      { k: 'lotElec', l: 'Lot électricité (destinataire des demandes d\'attentes)', t: 't', d: 'Lot électricité' },
      { k: 'gtb', l: 'Supervision / GTB', t: 's', o: [['aucune', 'Aucune (interface en façade)'], ['BACnet/IP', 'BACnet/IP'], ['Modbus TCP', 'Modbus TCP'], ['KNX', 'KNX'], ['LON', 'LON']], d: 'BACnet/IP' },
    ],
    calcul: calculer,
  };

  return { TYPES_EQ, TENSIONS, DEPARTS, REGULS, depart, calculer, unifilaire, equipementsEtude, fusionner };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'), typeof Schema !== 'undefined' ? Schema : require('./schema'));
if (typeof module !== 'undefined') module.exports = Electricite;
