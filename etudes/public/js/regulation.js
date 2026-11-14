// Régulation de l'étude : trois technologies par armoire CVC,
//  - automate programmable (points d'entrées / sorties, programme écrit d'après l'analyse fonctionnelle) ;
//  - régulateurs préprogrammés type Siemens Synco (application choisie puis paramétrée, pas de programmation) :
//    affectation des entrées / sorties sur le régulateur et ses modules d'extension, bornes N.X / N.Y / N.Q ;
//  - régulation intégrée aux équipements (PAC, chaudière, CTA « plug and play ») : l'armoire ne porte que la puissance
//    et les reports ; les réglages se font sur le régulateur de l'équipement.
// Pour toutes : analyse fonctionnelle par installation, reliée aux valeurs des calculs (régimes, lois d'eau, consignes
// de soufflage, débits, ECS), et liste des paramètres à régler et vérifier à la mise en service. Module pur.
const Regulation = (() => {
  const Nt = () => (typeof Notes !== 'undefined' ? Notes : require('./notes'));
  const Sc = () => (typeof Schema !== 'undefined' ? Schema : require('./schema'));
  const num = (v, d = 0) => { const x = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) && String(v ?? '').trim() !== '' ? x : d; };
  const nf = (v, d = 1) => (Number.isFinite(v) ? String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',') : '—');

  const TECHNOS = {
    automate: ['Automate programmable', 'programme écrit par l\'automaticien d\'après l\'analyse fonctionnelle ; points câblés sur les cartes de l\'automate'],
    synco: ['Régulateurs préprogrammés type Siemens Synco', 'application préprogrammée choisie puis paramétrée (pas de programmation) ; régulateur de base et modules d\'extension'],
    integree: ['Régulation intégrée aux équipements', 'chaque équipement est régulé par son propre régulateur (fabricant) ; l\'armoire porte la puissance, l\'autorisation de marche et les reports'],
  };
  // Familles de régulateurs préprogrammés (désignations indicatives) et capacités par défaut [entrées universelles,
  // sorties 0-10 V, sorties relais] — à reprendre de la fiche du régulateur retenu
  const APPS = {
    production: ['Production (chaufferie, PAC, groupe froid)', 'Régulateur de production préprogrammé (type Synco 700 RMK)'],
    chauffage: ['Circuits de chauffage et ECS', 'Régulateur de chauffage préprogrammé (type Synco 700 RMH)'],
    ventilation: ['Centrale de traitement d\'air, ventilation', 'Régulateur de ventilation préprogrammé (type Synco 700 RMU)'],
    terminaux: ['Terminaux et zones', 'Régulateur d\'ambiance communicant, un par terminal (type Synco RXB / RDG, KNX)'],
    autre: ['Auxiliaires', 'Régulateur universel préprogrammé (type Synco 700 RMU)'],
  };
  const COURT = { production: 'production', chauffage: 'chauffage et ECS', ventilation: 'ventilation', terminaux: 'terminaux', autre: 'auxiliaires' };
  const CAPACITES = { production: [8, 4, 6], chauffage: [8, 4, 6], ventilation: [8, 4, 6], autre: [8, 4, 6], extension: [4, 2, 2] };
  const MODULES_MAX = 3;

  // Application d'un équipement d'après le calcul d'où il vient (src « note:clé ») ; types : { idNote: type }
  function application(q, types = {}) {
    const [id, cle = ''] = String(q.src || '').split(':'), t = types[id] || '';
    if (t === 'terminaux') return 'terminaux';
    if (['cta', 'aero', 'aeraulique', 'desenfumage'].includes(t)) return 'ventilation';
    if (['ecs', 'sanitaire'].includes(t)) return 'chauffage';
    if (t === 'pid') return /^(pcp|pc|v|td|ce|em)\d/.test(cle) ? 'chauffage' : 'production';
    // Calculs annexes : application déclarée par le type (annexes-elec.js)
    const T = t && Nt().TYPES ? Nt().TYPES[t] : null;
    if (T && T.annexe && T.appRegulation) return q.type === 'cta' ? 'ventilation' : T.appRegulation;
    if (q.type === 'cta') return 'ventilation';
    if (['ventilo', 'split', 'regulateur'].includes(q.type)) return 'terminaux';
    if (['pac', 'generateur'].includes(q.type)) return 'production';
    return 'autre';
  }

  // Affectation des points physiques d'une application sur des régulateurs préprogrammés : régulateur de base et modules
  // d'extension (MODULES_MAX au plus), bornes N.X (entrées), N.Y (sorties 0-10 V), N.Q (relais), A1.X… sur les modules
  function allouer(points, app, capa = {}) {
    const C = capa[app] || CAPACITES[app] || CAPACITES.autre, M = capa.extension || CAPACITES.extension;
    const ent = points.filter(p => p[2] === 'EA' || p[2] === 'ETOR'), sa = points.filter(p => p[2] === 'SA'), rel = points.filter(p => p[2] === 'STOR');
    const reg = [], aff = [];
    let i = 0, j = 0, k = 0;
    while (i < ent.length || j < sa.length || k < rel.length || !reg.length) {
      const n = reg.length + 1, nom = `RC${n}`;
      // Modules nécessaires pour ce régulateur (au plus MODULES_MAX)
      const reste = [ent.length - i - C[0], sa.length - j - C[1], rel.length - k - C[2]], mods = Math.min(MODULES_MAX, Math.max(0, ...reste.map((r, x) => (r > 0 ? Math.ceil(r / [M[0], M[1], M[2]][x]) : 0))));
      const capX = C[0] + mods * M[0], capY = C[1] + mods * M[1], capQ = C[2] + mods * M[2];
      const borne = (prefixe, idx, cBase, cMod) => (idx < cBase ? `${nom}/N.${prefixe}${idx + 1}` : `${nom}/A${Math.floor((idx - cBase) / cMod) + 1}.${prefixe}${((idx - cBase) % cMod) + 1}`);
      const e0 = i, s0 = j, r0 = k;
      for (let x = 0; x < capX && i < ent.length; x++, i++) aff.push([borne('X', x, C[0], M[0]), ...ent[i]]);
      for (let x = 0; x < capY && j < sa.length; x++, j++) aff.push([borne('Y', x, C[1], M[1]), ...sa[j]]);
      for (let x = 0; x < capQ && k < rel.length; x++, k++) aff.push([borne('Q', x, C[2], M[2]), ...rel[k]]);
      reg.push({ rep: nom, app, modules: mods, entrees: [i - e0, capX], sorties: [j - s0, capY], relais: [k - r0, capQ] });
      if (reg.length > 20) break;
    }
    return { regulateurs: points.length ? reg : [], affectations: aff };
  }

  // Analyse fonctionnelle et paramètres de chaque installation de l'étude, d'après ses calculs
  // Exigences de régulation lues dans le CCTP / DPGF (inventaire du dossier de consultation)
  function exigencesCctp(inventaire) {
    const t = (inventaire || []).filter(x => x && x.inclus !== false).map(x => `${x.designation || ''} ${x.prescrit || ''} ${x.texte || ''}`).join(' \n ');
    const n = String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!n.trim()) return null;
    const protocoles = [['BACnet', /bacnet/], ['Modbus', /modbus/], ['KNX', /\bknx\b/], ['LON', /\blon(works)?\b/], ['M-Bus', /m-?bus/]].filter(([, re]) => re.test(n)).map(([p]) => p);
    const marques = [['Siemens', /siemens|synco|desigo/], ['Schneider', /schneider|ecostruxure|smartx/], ['Sauter', /sauter/], ['Distech', /distech/], ['Trend', /\btrend\b/], ['Honeywell', /honeywell/], ['Wit', /\bwit\b/]].filter(([, re]) => re.test(n)).map(([m]) => m);
    const CP = typeof ConsignesProjet !== 'undefined' ? ConsignesProjet : (() => { try { return require('./consignes-projet'); } catch (e) { return null; } })();
    return { consignes: CP ? CP.consignesCctp(t) : null, protocoles, marques, comptage: /comptage|compteur d.energie|calorimetr/.test(n), bacs: /bacs|decret.{0,20}(2020-887|gtb)|classe [ab] .{0,20}(gtb|en 15232|en iso 52120)|en 15232|52120/.test(n),
      automate: /automate programmable|\bapi\b|automate/.test(n), prepro: /regulateur.{0,30}(preprogramme|configurable)|synco|regulateur (de|d.)(chauffage|ventilation) /.test(n), integree: /regulation integree|regulation d.origine|regulation constructeur/.test(n) };
  }
  // Séquences, métré et application des calculs annexes (annexes-elec.js) : branchés une fois les modules chargés
  const annexes = () => { try { const A = typeof AnnexesElec !== 'undefined' ? AnnexesElec : (typeof window === 'undefined' ? require('./annexes-elec') : null); if (A) A.brancher(); return A; } catch (e) { return null; } };
  const nomMat = x => [x && x.fabricant, x && x.reference].map(s => String(s || '').trim()).filter(Boolean).join(' ');
  // Repère d'un poste du métré qui couvre une ligne d'équipement (EXT-PK couvre EXT-PK-1, EXT-PK-N2-1…)
  const couvre = (pr, r) => { const a = String(pr || ''), b = String(r || ''); return a && (a === b || (b.startsWith(`${a}-`) && /^(-N?\d+)+$/.test(b.slice(a.length)))); };
  // Matériel retenu (fabricant + référence) d'une étude, pour le citer dans l'analyse fonctionnelle et la table d'échange :
  // par clé du métré (et.materiel), par ligne d'équipement d'un calcul annexe (src « note:annK », repère « note|rep »),
  // par note reliée à un modèle du registre (CTA, production : lignes de ses types) et liste des modèles du registre
  function materiel(etude, Liens) {
    const et = etude || {}, N = Nt(), A = annexes(), M = { metre: {}, src: {}, rep: {}, note: {}, noms: [] };
    Object.entries(et.materiel || {}).forEach(([k, x]) => { if (x && String(x.reference || '').trim()) M.metre[k] = nomMat(x); });
    const reg = et.equipements || [];
    reg.forEach(x => { const s = nomMat(x); if (s && !M.noms.includes(s)) M.noms.push(s); });
    const vus = {};
    (et.notes || []).forEach((n, ni) => {
      const e0 = n.entrees || {}, x = e0.eq && reg.find(y => y.id === e0.eq);
      if (x && nomMat(x) && (n.type === 'cta' || n.type === 'pid')) M.note[n.id] = { nom: nomMat(x), types: n.type === 'cta' ? ['cta', 'ventilateur'] : ['generateur', 'pac'] };
      const T = N.TYPES[n.type];
      if (!A || !T || !T.annexe || typeof T.versMetre !== 'function') return;
      const sfx = vus[n.type] && !T.reperesEtude ? `-N${ni + 1}` : ''; vus[n.type] = true;
      if (!Object.keys(M.metre).some(k => k.startsWith(`annexe|${n.type}|`))) return;
      try {
        const e = Liens ? Liens.resoudre(et, n).entrees : e0, v = N.calculer(n.type, e).valeurs || {};
        const postes = T.versMetre(v, e, n, {}).map(p => ({ rep: p.rep, ref: M.metre[A.cleMetre(n.type, p.rep, sfx)] })).filter(p => p.ref);
        postes.forEach(p => { M.rep[`${n.id}|${p.rep}`] = p.ref; });
        (typeof T.versElec === 'function' ? T.versElec(v, e, n) || [] : []).forEach((l, k) => { const p = postes.find(y => couvre(y.rep, l.rep)); if (p) { M.src[`${n.id}:ann${k}`] = p.ref; M.rep[`${n.id}|${l.rep}`] = p.ref; } });
      } catch (err) { /* calcul incomplet */ }
    });
    return M;
  }
  // Fabricant + référence d'une ligne d'équipement (q : ligne du calcul des armoires) ; '' si aucun matériel retenu
  function materielDe(M, q) {
    if (!M || !q) return '';
    const id = String(q.src || '').split(':')[0], des = String(q.designation || ''), rep = String(q.rep || '');
    const parRep = Object.entries(M.rep || {}).find(([k]) => { const [i, r] = k.split('|'); return i === id && couvre(r, rep.replace(/-N\d+$/, '')); });
    const no = (M.note || {})[id];
    return (q.metre && (M.metre || {})[q.metre]) || (M.src || {})[q.src] || (parRep && parRep[1]) || (no && no.types.includes(q.type) ? no.nom : '') || (M.noms || []).find(s => des.includes(s)) || '';
  }
  // Désignation suivie du matériel retenu (« Pompe Radiateurs — Exemplair CX 40-8 »), sans doublon
  const avecMateriel = (designation, ref) => (ref && !String(designation || '').includes(ref) ? `${designation} — ${ref}` : String(designation || ''));
  // Circuit à vanne de régulation (loi d'eau possible) selon son montage hydraulique
  const aVanne = c => (Sc().montage ? !!Sc().montage(c.reg).vanne : c.reg !== 'direct');
  function contexte(etude, Liens, opts = {}) {
    const notes = (etude && etude.notes) || [], types = {}, installations = [], N = Nt();
    notes.forEach(n => { types[n.id] = n.type; });
    const A = annexes(), mat = materiel(etude, Liens), annVus = {};
    const res = n => { const e = Liens.resoudre(etude, n).entrees; return { e, v: (N.calculer(n.type, e).valeurs || {}) }; };
    const p = (libelle, valeur, unite) => (Number.isFinite(valeur) ? { libelle, valeur: Math.round(valeur * 100) / 100, unite } : null);
    notes.forEach(n => {
      try {
        const titre = n.titre || n.type;
        if (n.type === 'pid') {
          const { e } = res(n), d = Sc().dimensionner(e), r = Sc().regulation(d, e), Tb = num(e.Tbase, -10);
          const params = [p('Consigne de départ de la production', d.Td, '°C'), p('Abaissement en période réduite', num(e.reduit, 3), 'K')];
          if (d.n > 1) params.push(p('Permutation de la priorité des générateurs', num(e.permutation, 168), 'h'));
          // Production hétérogène : seuils d'enclenchement de la relève et de l'appoint, température de bivalence
          if (d.multi && d.multi.some(x => ['releve', 'appoint'].includes(x.role))) params.push(p('Relève / appoint : enclenchement si le départ reste sous la consigne de plus de', num(e.seuilReleve, 3), 'K'), p('Relève / appoint : temporisation d\'enclenchement', num(e.tempoReleve, 10), 'min'));
          if (Sc().bivalence && Sc().bivalence(d)) params.push(p(`Température extérieure de bivalence (${e.bivalence === 'alternatif' ? 'alternative' : 'parallèle'})`, num(e.Tbivalence, -3), '°C'));
          (d.ballons || []).filter(b => ['tampon', 'decouplage', 'stockage'].includes(b.fonction)).forEach(b => params.push(p(`Ballon ${b.rep} : différentiel d'enclenchement (sondes ${b.sondes.join(' / ') || '—'})`, 5, 'K')));
          d.circuits.forEach(c => {
            const loi = c.rc[0] > c.rc[1] && ['radiateurs', 'plancher', 'radiant', 'aerotherme'].includes(c.emetteur);
            if (loi && aVanne(c)) { params.push(p(`Loi d'eau ${c.rep} : départ à ${nf(Tb, 0)} °C extérieur`, c.rc[0], '°C'), p(`Loi d'eau ${c.rep} : départ à 18 °C extérieur`, Sc().depMini ? Sc().depMini(e, c) : (c.emetteur === 'plancher' ? 25 : 30), '°C')); }
            else params.push(p(`Consigne de départ ${c.rep}`, c.rc[0], '°C'));
          });
          const cc = Sc().courbeChauffe ? Sc().courbeChauffe(d.co ? d.co.dC : d, e) : null;
          if (cc) cc.circuits.forEach(c => { params.push(p(`Pente de la courbe de chauffe ${c.rep} (type Synco)`, Math.round(c.pente * 20) / 20, ''), p(`Déplacement parallèle ${c.rep}`, Math.round(c.deplacement * 2) / 2, 'K')); });
          if (d.chaud) params.push(p('Arrêt chauffage (non-chauffage) au-dessus de', cc ? cc.arret : 17, '°C ext.'));
          // Récupération d'énergie sur groupe froid : côté froid (production de chaleur récupérée), côté chaud (priorité)
          // Évacuation de la chaleur : consigne de sortie, by-pass hivernal
          if (d.evac) params.push(p(`${d.evac.lib} : consigne de température de sortie de l'eau`, d.evac.Tf, '°C'), p(`${d.evac.lib} : ouverture du by-pass hivernal sous`, Math.max(5, d.evac.Tf - 10), '°C'));
          if (e.recupGf) params.push(p('Récupération : consigne de l\'eau récupérée (départ)', num(String(e.regimeRecup || '45/40').split('/')[0], 45), '°C'));
          if (/-eau$/.test(e.generateur || '') && e.sourceEau === 'boucle' && Liens.circuitDeAnnexe && Liens.circuitDeAnnexe(etude.notes || [], n)) params.push(p('Boucle d\'eau tempérée : arrivée mini pour autoriser la PAC', 15, '°C'), p('Boucle d\'eau tempérée : arrivée maxi pour autoriser la PAC', 30, '°C'));
          if (e.recupDe && num(e.Precup) > 0) params.push(p('Récupération sur groupe froid : puissance disponible', num(e.Precup), 'kW'), p('Appoint : enclenché si le départ reste sous la consigne de plus de', 3, 'K pendant 10 min'));
          // Données structurées pour les consignes du projet : régimes, circuits et lois d'eau
          const dC = d.co ? d.co.dC : d, dF = d.co ? d.co.dF : null;
          const donnees = { Tbase: Tb, Td: dC.Td, Tr: dC.Tr, chaud: !!d.chaud || dC.Td > dC.Tr, froid: dF ? { Td: dF.Td, Tr: dF.Tr } : (!d.chaud && d.Td < d.Tr ? { Td: d.Td, Tr: d.Tr } : null), changeOver: !!d.co, generateurs: d.n || 1,
            circuits: d.circuits.map(c => { const loi = c.rc[0] > c.rc[1] && ['radiateurs', 'plancher', 'radiant', 'aerotherme'].includes(c.emetteur) && aVanne(c); return { rep: c.rep, emetteur: c.emetteur || '', dep: (c.rcC || c.rc)[0], ret: (c.rcC || c.rc)[1], loi, d18: loi ? (Sc().depMini ? Sc().depMini(e, c) : (c.emetteur === 'plancher' ? 25 : 30)) : null }; }) };
          installations.push({ noteId: n.id, titre, app: 'production', donnees, puissance: num(d.Pprod) + (d.co && d.co.dF ? num(d.co.dF.Pprod) : 0), af: [...(((Array.isArray(r) ? r.find(b => b.liste) : r) || {}).liste || r.af || []),
            ...(e.recupGf ? [`Récupération d'énergie (${e.recupGf === 'totale' ? 'totale au condenseur' : 'désurchauffeur'}) : la chaleur rejetée par le groupe froid est envoyée en priorité vers le schéma chaud (eau à ${e.regimeRecup || '45/40'} °C) ; sans besoin de chaleur, rejet par le condenseur à air / la tour (vanne de basculement).`] : []),
            ...(e.recupDe && num(e.Precup) > 0 ? [`Priorité à la récupération sur le groupe froid (${nf(num(e.Precup), 0)} kW disponibles quand le froid tourne) ; le générateur n'est enclenché qu'en appoint, si la température de départ reste sous la consigne, et en secours.`] : []),
            // Schémas imbriqués : schéma aval alimenté par un circuit d'un autre schéma, et circuits qui alimentent un schéma aval
            ...(() => { const amont = Liens.circuitDeAnnexe && Liens.circuitDeAnnexe(etude.notes || [], n), c = amont && (amont.pid.entrees.circuits || [])[amont.i];
              if (!c) return [];
              const boucle = /-eau$/.test(e.generateur || '') && e.sourceEau === 'boucle', ss = /^echangeur/.test(e.generateur || '');
              return [`Alimenté par le circuit « ${c.rep} » de ${amont.pid.titre} : demande de marche envoyée à la régulation amont (pompe du circuit en marche, consigne de départ amont relevée si besoin) ; ${boucle ? 'la PAC n\'est autorisée que si l\'eau de la boucle arrive entre 15 et 30 °C (protection de l\'évaporateur), arrêt et alarme sinon' : ss ? 'la vanne primaire de l\'échangeur n\'est ouverte qu\'avec la pompe amont en marche' : 'production autorisée avec la pompe amont en marche'} ; défaut de la source reporté.`]; })(),
            ...(e.circuits || []).filter(c => c && c.annexe && (etude.notes || []).some(x => x.id === c.annexe && x.type === 'pid')).map(c => `Circuit « ${c.rep} » : alimente le schéma ${((etude.notes || []).find(x => x.id === c.annexe) || {}).titre || ''} ; pompe en marche sur sa demande, sans vanne de mélange si le schéma aval régule lui-même (échangeur ou PAC), post-circulation 3 min.`),
            // Circuits qui alimentent les batteries d'une CTA (réseau annexe effectif : liaison saisie ou automatique)
            ...(e.circuits || []).filter(c => c && c.annexe && (etude.notes || []).some(x => x.id === c.annexe && x.type === 'cta')).map(c => `Circuit « ${c.rep} » : alimente les batteries de la CTA ${((etude.notes || []).find(x => x.id === c.annexe) || {}).titre || ''}${c._autoCta ? ' (liaison automatique)' : ''} ; pompe en marche sur demande de la CTA (centrale en marche, antigel), arrêt temporisé.`)], params: params.filter(Boolean) });
        } else if (n.type === 'cta') {
          const { e, v: vC } = res(n), f = e.froid || 'oui', recup = e.recup || '', co = f === 'co', bc = !['froide', 'aucune'].includes(f), bf = !['non', 'aucune'].includes(f), be = e.batElec || (num(e.PelBe) ? 'appoint' : '');
          const af = [
            `Démarrage : ouverture des registres d'air neuf et de rejet (fin de course contrôlée), puis ventilateur de reprise et, après temporisation (30 s), ventilateur de soufflage ; débits ${nf(num(e.Qs), 0)} m³/h soufflés${num(e.Qr) ? ` et ${nf(num(e.Qr), 0)} m³/h repris` : ''} tenus par la vitesse des ventilateurs (consigne de débit ou de pression, variateurs).`,
            `Température de soufflage : consigne ${nf(num(e.TsH, 20), 0)} °C l'hiver et ${nf(num(e.TsE, 16), 0)} °C l'été (ou décalée selon la température de reprise, régulation en cascade) ; séquences dans l'ordre : ${[be === 'prechauffage' ? 'préchauffage électrique (antigel de l\'air neuf)' : '', recup && recup !== 'aucun' ? 'récupérateur' : '', !bc ? '' : co ? 'batterie change-over (eau chaude l\'hiver)' : 'batterie chaude', be === 'chaude' && !bc ? 'batterie chaude électrique (gradateur ou étages)' : be === 'appoint' || (be === 'chaude' && bc) ? 'appoint électrique' : '', bf && !co ? 'batterie froide' : co ? 'batterie change-over (eau glacée l\'été)' : ''].filter(Boolean).join(' → ') || 'aucune batterie (air neuf seulement)'}, sans chevauchement chaud / froid.`,
            ...(recup && recup !== 'aucun' ? [`Récupérateur (${recup}) : modulé en tête de séquence ; protection antigivre (${recup === 'roue' ? 'vitesse de la roue réduite' : 'by-pass ou préchauffage'}) d'après la température de l'air rejeté ; by-pass en free-cooling quand l'air extérieur est plus favorable.`] : []),
            ...(bc ? ['Antigel : thermostat sur l\'aval de la batterie chaude (5 °C) — arrêt des ventilateurs, fermeture des registres, vanne chaude ouverte en grand et pompe en marche ; réarmement manuel.'] : []),
            ...(bf ? ['Rafraîchissement nocturne (free-cooling) en été si l\'air extérieur est plus frais que l\'ambiance de plus de 2 K, batteries arrêtées.'] : []),
            ...(e.humid === 'vapeur' ? [`Humidificateur vapeur : humidité relative mini ${nf(num(e.HRmin, 40), 0)} % sur la reprise, hygrostat de sécurité sur le soufflage (85 %).`] : []),
            ...(e.humid === 'adiabatique' ? [`Humidificateur adiabatique : humidité relative mini ${nf(num(e.HRmin, 40), 0)} % sur la reprise, tenue par la température de préchauffage (consigne calculée${vC && vC.adiabatique ? ` ${nf(vC.adiabatique.T1, 1)} °C en base` : ''}) puis post-chauffage à la consigne de soufflage ; pompe de recirculation en marche avec le ventilateur de soufflage (hygrostat de sécurité 85 % sur le soufflage) ; électrovanne d'alimentation sur niveau du bac ; déconcentration par l'électrovanne de vidange sur seuil de conductivité ; vidange complète et séchage du média à l'arrêt prolongé (hygiène, risque de légionelle).`] : []),
            ...(be ? [`${be === 'prechauffage' ? 'Préchauffage électrique : enclenché quand l\'air neuf passe sous −5 °C (protection du récupérateur et de la batterie à eau). ' : ''}Batterie électrique${num(vC && vC.Pbe) ? ` (${nf(num(vC.Pbe), 1)} kW)` : ''} : verrouillée sur le débit d\'air (pressostat), post-ventilation de 2 min à l\'arrêt, thermostat de sécurité à réarmement manuel.`] : []),
            'Filtres : pressostats d\'encrassement (alarme de maintenance) ; arrêt : fermeture des registres après l\'arrêt des ventilateurs ; programmation horaire et dérogation.',
          ];
          // Batteries à eau alimentées par un circuit de schéma de principe (liaison saisie ou automatique) : demande de marche
          const alim = (Liens.circuitsDeAnnexe ? Liens.circuitsDeAnnexe(notes, n) : []).map(r => ({ rep: (((r.pid.entrees || {}).circuits || [])[r.i] || {}).rep || `C${r.i + 1}`, schema: r.pid.titre || '', auto: !!r.auto })).filter(x => x.rep);
          alim.forEach(x => af.splice(af.length - 1, 0, `Batterie(s) à eau alimentée(s) par le circuit « ${x.rep} » de ${x.schema}${x.auto ? ' (liaison automatique)' : ''} : demande de marche de la pompe du circuit envoyée à la production quand la centrale fonctionne (et sur antigel) ; la vanne du circuit module la batterie suivant la consigne de soufflage.`));
          const params = [p('Consigne de soufflage hiver', num(e.TsH, 20), '°C'), ...(bf ? [p('Consigne de soufflage été', num(e.TsE, 16), '°C')] : []), p('Débit de soufflage', num(e.Qs), 'm³/h'), ...(num(e.Qr) ? [p('Débit de reprise', num(e.Qr), 'm³/h')] : []),
            ...(bc ? [p('Seuil de l\'antigel', 5, '°C')] : []), ...(be === 'prechauffage' ? [p('Enclenchement du préchauffage électrique', -5, '°C air neuf')] : []), p('Temporisation du ventilateur de soufflage', 30, 's'), ...(e.humid === 'vapeur' ? [p('Humidité relative mini', num(e.HRmin, 40), '%')] : []),
            ...(e.humid === 'adiabatique' ? [p('Humidité relative mini', num(e.HRmin, 40), '%'), ...(vC && vC.adiabatique ? [p('Température de préchauffage (base)', Math.round(vC.adiabatique.T1 * 10) / 10, '°C')] : []), p('Seuil de conductivité de déconcentration (à valider selon l\'eau)', 1000, 'µS/cm'), p('Vidange à l\'arrêt prolongé', 48, 'h')] : [])];
          installations.push({ noteId: n.id, titre, app: 'ventilation', af, params: params.filter(Boolean), donnees: { cta: true, TsH: num(e.TsH, 20), TsE: num(e.TsE, 16), froid: f, changeOver: co, batElec: be, alimentation: alim } });
        } else if (n.type === 'aero' && !(n.entrees || {}).cta) {
          const { e, v } = res(n), ext = e.producteur === 'extraction';
          installations.push({ noteId: n.id, titre, app: 'ventilation', af: [`${ext ? 'Caisson d\'extraction' : 'Ventilateur'} en marche selon la programmation horaire${ext ? ' (ou en permanence en logement)' : ''}, retour de marche par pressostat ; débit ${nf(v.Qs || v.Qr, 0)} m³/h ; défaut reporté.`],
            params: [p(ext ? 'Débit extrait' : 'Débit soufflé', v.Qs || v.Qr, 'm³/h')].filter(Boolean) });
        } else if (n.type === 'ecs') {
          const { e } = res(n), Tc = num(e.Tc, 60);
          installations.push({ noteId: n.id, titre, app: 'chauffage', af: [`Production d'ECS : consigne de stockage ${nf(Tc, 0)} °C (différentiel 5 K), priorité réglable sur le chauffage ; traitement anti-légionelle hebdomadaire (70 °C pendant 1 h, ou 60 °C maintenus) ; retour de bouclage ≥ 50 °C.`],
            donnees: { ecs: true, Tc }, params: [p('Consigne de stockage ECS', Tc, '°C'), p('Différentiel de charge', 5, 'K'), p('Choc thermique anti-légionelle', 70, '°C')].filter(Boolean) });
        } else if (n.type === 'terminaux') {
          const { v } = res(n), l = v.lignes || [], nb = l.reduce((s, x) => s + (x.n || 1), 0), froid = l.some(x => x.Pfr > 0), co = l.some(x => x.b === '2t');
          if (!nb) return;
          // Consignes par zone (calcul des armoires), sinon valeurs courantes ; une ligne « Toutes zones » s'applique partout
          const zl = (opts.zones || []).filter(z => z && (z.zone || z.confort)), zones = [...new Set(l.map(x => String(x.zone || '').trim()).filter(Boolean))];
          const consignes = z => { const r = zl.find(y => String(y.zone || '').trim() === z) || zl.find(y => /^toutes/i.test(String(y.zone || '').trim()) || !String(y.zone || '').trim()) || {}; return { confort: num(r.confort, 20), clim: num(r.clim, 26), inocc: num(r.inocc, 16), horsGel: num(r.horsGel, 8) }; };
          const lz = zones.length && zl.length ? zones : [''];
          const paramsZones = lz.flatMap(z => { const c = consignes(z), s = z ? ` — ${z}` : ''; return [p(`Consigne de confort chauffage${s}`, c.confort, '°C'), ...(froid ? [p(`Consigne de confort rafraîchissement${s}`, c.clim, '°C')] : []), p(`Consigne d'inoccupation chauffage${s}`, c.inocc, '°C'), p(`Consigne hors gel${s}`, c.horsGel, '°C')]; });
          installations.push({ noteId: n.id, titre, app: 'terminaux', donnees: { terminaux: nb, froid, changeOver: co, zones, emetteurs: [...new Set(l.map(x => x.type || x.emetteur || '').filter(Boolean))] }, params: paramsZones.filter(Boolean), af: [`${nb} terminal(aux) : chacun régulé sur la température de sa pièce (consigne locale ajustable ± 3 K), programmation horaire par zone, réduit en inoccupation, hors gel ; ventilateur arrêté en inoccupation.`,
            ...(co ? ['Terminaux 2 tubes : mode chaud / froid suivant l\'inversion (change-over) de la production.'] : []), 'Maîtres / esclaves : les esclaves suivent la consigne et la commande de leur maître.',
            ...(zones.length > 1 && zl.length ? [`Consignes par zone (${zones.join(', ')}) : voir la liste des paramètres.`] : [])] });
        } else if (n.type === 'desenfumage') {
          const { v } = res(n);
          installations.push({ noteId: n.id, titre, app: 'ventilation', securite: true, af: [
            'Désenfumage hors régulation CVC : commandé par le CMSI du lot SSI (déclencheurs manuels, détection) ; la GTB surveille sans commander.',
            `Sur ordre du CMSI : ouverture des volets du canton sinistré (contrôle de position par fins de course), fermeture des autres, démarrage du ventilateur d'extraction${v.QaMax > 0 ? ' et du ventilateur d\'amenée d\'air' : ''} en priorité, arrêt des CTA et ventilations de confort concernées (asservissement).`,
            'Alimentation de sécurité (secours) et câbles CR1 ; commande prioritaire sur l\'automate ou le régulateur CVC ; reports d\'état (marche, défaut, position des volets) vers le CMSI et la GTB.'],
            params: [p('Débit extrait du canton le plus exigeant', v.Qv ? v.Qv * 3600 : NaN, 'm³/h')].filter(Boolean) });
        } else if (n.type === 'sanitaire') {
          const { v } = res(n);
          if (v.bouclage) installations.push({ noteId: n.id, titre: `${titre} — bouclage ECS`, app: 'chauffage', af: ['Pompe de bouclage ECS en marche permanente (ou horloge hors occupation), vannes thermostatiques de bouclage réglées pour un retour ≥ 50 °C sur chaque antenne.'],
            params: [p('Température mini de retour de bouclage', 50, '°C')].filter(Boolean) });
        } else if (N.TYPES[n.type] && N.TYPES[n.type].annexe && typeof N.TYPES[n.type].versRegulation === 'function') {
          // Calcul annexe qui pose du matériel (hotte, parking, géothermie, solaire, bouclage, plancher…) : son analyse
          // fonctionnelle, ses séquences et ses paramètres par défaut (annexes-elec.js), le matériel retenu cité
          const T = N.TYPES[n.type], { e, v } = res(n), ni = notes.indexOf(n), sfx = annVus[n.type] ? `-N${ni + 1}` : ''; annVus[n.type] = true;
          const ref = r => { const k = Object.keys(mat.rep).find(x => { const [i, rr] = x.split('|'); return i === n.id && couvre(rr, r); }); const s = k ? mat.rep[k] : (A ? mat.metre[A.cleMetre(n.type, r, sfx)] : ''); return s ? ` — ${s}` : ''; };
          const x = T.versRegulation(v, e, n, { etude, ref });
          if (x && ((x.af || []).length || (x.sequences || []).length)) installations.push({ noteId: n.id, titre, app: x.app || T.appRegulation || 'autre', annexe: n.type, af: x.af || [], sequences: x.sequences || null, params: (x.params || []).filter(Boolean) });
        }
      } catch (err) { /* calcul incomplet : installation ignorée */ }
    });
    const CPz = typeof ConsignesProjet !== 'undefined' ? ConsignesProjet : (() => { try { return require('./consignes-projet'); } catch (e) { return null; } })();
    return { types, installations, materiel: mat, cctp: exigencesCctp(etude && etude.inventaire), zonesEtude: CPz ? CPz.zonesEtude(etude) : [] };
  }
  // Points de contrôle de mise en service de la régulation selon la technologie
  const CONTROLES = {
    automate: ['Programme chargé, version et date notées', 'Séquences de l\'analyse fonctionnelle testées une à une', 'Consignes et paramètres réglés suivant la liste', 'Sécurités câblées et alarmes testées', 'Modes arrêt / auto / manu et reprise après coupure secteur testés', 'Sauvegarde du programme remise'],
    synco: ['Application préprogrammée choisie conforme au schéma de l\'installation', 'Entrées / sorties configurées (affectation des bornes)', 'Paramètres réglés suivant la liste', 'Date, heure et programmes horaires', 'Communication (KNX / bus) et serveur web testés', 'Sauvegarde de la configuration remise'],
    integree: ['Paramètres du régulateur intégré réglés (avec le fabricant si besoin)', 'Autorisation de marche depuis l\'armoire testée', 'Reports d\'état et de défaut testés', 'Communication bus avec la GTB testée'],
  };
  // Fiche d'un régulateur préprogrammé ou d'un module : entrées universelles, sorties 0-10 V, relais, application
  function lireFiche(lignes) {
    const L = (Array.isArray(lignes) ? lignes : String(lignes || '').split(/\r?\n/)).map(String), v = {};
    const n = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    let fabricant = '', reference = '';
    L.forEach(l => {
      const m = /^\s*([^:]+?)\s*:\s*(.+?)\s*$/.exec(l); if (!m) return;
      const k = n(m[1]), val = m[2], x = /(\d+)/.exec(val);
      if (/^fabricant|^marque/.test(k)) fabricant = val;
      else if (/^reference|^modele/.test(k)) reference = val;
      else if (x && /entrees? (universelle|analogique|mixte)|^entrees?$|\bui\b/.test(k)) v.X = (v.X || 0) + Number(x[1]);
      else if (x && /entrees? (tor|digitale|numerique)/.test(k)) v.X = (v.X || 0) + Number(x[1]);
      else if (x && /sorties? (analogique|0-10|0 a 10|modulante)|\bao\b/.test(k)) v.Y = Number(x[1]);
      else if (x && /sorties? (relais|tor|digitale)|\bdo\b/.test(k)) v.Q = Number(x[1]);
      else if (x && /modules? d.extension maxi|extensions? maxi/.test(k)) v.modulesMax = Number(x[1]);
      else if (/^application|^type de regulateur/.test(k)) { const a = n(val); v.app = /extension|module/.test(a) ? 'extension' : /ventil|cta|air/.test(a) ? 'ventilation' : /chaudiere|chaufferie|production|cascade/.test(a) ? 'production' : /chauffage|ecs|circuit/.test(a) ? 'chauffage' : 'autre'; }
    });
    const t = L.find(l => /^\s*type\s*:/i.test(l)) || '';
    if (!v.app && /module|extension/i.test(t + reference)) v.app = 'extension';
    return { valeurs: v, fabricant, reference, nb: Object.keys(v).length };
  }
  // Régulation de l'étude pour le DOE et la notice d'exploitation : technologie, analyse fonctionnelle et paramètres de
  // chaque installation, courbes de chauffe, liste des points GTB (calcul des armoires s'il existe)
  function pourDoe(etude, Liens) {
    const notes = (etude && etude.notes) || [], N = Nt(), out = { installations: [], courbes: [], points: null, bacs: null, comptages: null, sequences: [], echange: null, folios: [], unifilaire: '', consignes: null, plannings: [], alarmes: [] };
    notes.filter(n => n.type === 'elec' && ((n.entrees || {}).equipements || []).length).forEach(elec => {
      try {
        const r = Liens.calculer(etude, elec), blocs = ((r.onglets || []).find(o => o.titre === 'Régulation') || {}).blocs || [], reg = (r.valeurs || {}).regulation || {};
        (reg.installations || []).filter(x => !out.installations.some(y => y.titre === x.titre)).forEach(x => { const b = blocs.find(y => (y.titre || '').startsWith(`Analyse fonctionnelle — ${x.titre}`)); out.installations.push({ titre: x.titre, techno: TECHNOS[x.techno] ? TECHNOS[x.techno][0] : '', af: (b && b.liste) || [], params: x.params || [] }); });
        // GTB et BACS : classe et exigences, comptages par usage, séquences, table d'échange ; folios des armoires
        const g = ((r.onglets || []).find(o => o.titre === 'GTB et BACS') || {}).blocs || [], tb = re => (g.find(y => re.test(y.titre || '')) || {}).tableau;
        if (!out.bacs && (r.valeurs || {}).bacs) out.bacs = { ...r.valeurs.bacs, fonctions: (tb(/^Fonctions de régulation/) || {}).lignes || [], exigences: (tb(/^Exigences du décret BACS/) || {}).lignes || [] };
        const cpt = tb(/^Comptage d'énergie par usage/); if (cpt && !out.comptages) out.comptages = cpt;
        g.filter(y => /^Séquences — /.test(y.titre || '') && y.tableau && !out.sequences.some(z => z.titre === y.titre)).forEach(y => out.sequences.push({ titre: y.titre.replace(/^Séquences — /, ''), lignes: y.tableau.lignes }));
        const ech = tb(/^Table d'échange GTB/); if (ech && ech.lignes.length) out.echange = { entetes: ech.entetes, lignes: [...((out.echange || {}).lignes || []), ...ech.lignes].slice(0, 800) };
        out.folios.push(...[r.titreSchema, ...(r.schemas || []).map(s => s.titre)].filter(Boolean).map(t => ({ note: elec.titre || 'Armoires', titre: t })));
        if (!out.unifilaire && r.schema && r.schema.length < 400000) out.unifilaire = r.schema;
        // Consignes du projet, plannings et alarmes avec la conduite à tenir (notice d'exploitation)
        const pj = (r.valeurs || {}).consignesProjet, G = typeof Gtb !== 'undefined' ? Gtb : require('./gtb');
        if (pj && !out.consignes) { out.consignes = pj.saisie; out.plannings = pj.plannings.map(p => [p.nom, p.agit, p.occupation, p.hors]); out.feries = pj.feries; }
        ((r.valeurs || {}).cahierProg || []).forEach(c => ((c.sections.find(s => s.titre === 'Alarmes') || { lignes: [] }).lignes).forEach(l => { if (out.alarmes.length < 150) out.alarmes.push([`${l[0]} — ${l[1]}`, `${l[2]} (${l[3]})`, l[4], l[5], G.queFaire(l[1], l[5])]); }));
        const pts = blocs.find(y => /^Liste des points GTB/.test(y.titre || ''));
        if (pts && pts.tableau && pts.tableau.lignes.length > 1) out.points = { entetes: pts.tableau.entetes, lignes: [...((out.points || {}).lignes || []), ...pts.tableau.lignes].slice(0, 600) };
      } catch (e) { /* calcul des armoires incomplet */ }
    });
    if (!out.installations.length) { try { contexte(etude, Liens).installations.forEach(x => out.installations.push({ titre: x.titre, techno: '', af: x.af, params: x.params })); } catch (e) { /* étude incomplète */ } }
    notes.filter(n => n.type === 'pid').forEach(n => {
      try { const e = Liens.resoudre(etude, n).entrees, d = Sc().dimensionner(e), c = Sc().courbeChauffe(d.co ? d.co.dC : d, e); if (c) out.courbes.push({ titre: `Courbe de chauffe — ${n.titre}`, svg: c.svg, tableau: c.tableau, reglages: c.circuits.map(x => `${x.rep} : pente ≈ ${nf(x.pente, 2)}, déplacement parallèle ≈ ${x.deplacement >= 0 ? '+' : ''}${nf(x.deplacement, 1)} K`) }); } catch (e) { /* calcul incomplet */ }
    });
    void N;
    return out.installations.length || out.courbes.length ? out : null;
  }
  return { materiel, materielDe, avecMateriel, couvre, pourDoe, exigencesCctp, lireFiche, COURT, TECHNOS, APPS, CAPACITES, CONTROLES, application, allouer, contexte };
})();
if (typeof module !== 'undefined') module.exports = Regulation;
