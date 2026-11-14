// Liens entre les calculs d'une même étude : les valeurs reprises d'une autre note sont recalculées à chaque affichage
// (liens vivants) et les champs correspondants sont verrouillés dans le formulaire.
//  - schéma de principe : puissance d'un circuit reprise d'un bilan chauffage et climatisation ;
//  - notes créées depuis un schéma : réseau et pompe ou vanne de régulation d'un circuit, vase d'expansion de l'installation ;
//  - réseau aéraulique (schéma aéraulique ou réseau et ventilateur) relié à un calcul de CTA : type, récupérateur, batteries
//    et pertes de charge de la centrale repris dans le réseau ; débits et pertes de charge du réseau repris dans la CTA ;
//  - circuit d'une chaufferie ou d'une sous-station (schéma de principe) relié à un réseau annexe (réseau arborescent,
//    réseau et pompe, batteries d'une CTA) : fluide, régime et pertes de charge côté production vers le réseau ;
//    puissance (ou débit) et pertes de charge du réseau vers le circuit, dont la pompe est dimensionnée en conséquence.
const Liens = ((N, Sc) => {
  const nf = N.nf, num = N.num;
  const copie = o => JSON.parse(JSON.stringify(o));
  const ROLES = { reseau: 'réseau et pompe', vanne: 'vanne de régulation', vase: 'vase d\'expansion' };

  // Entrées effectives d'une note : { entrees, verrous: { champ ou 'liste.i.colonne': libellé de la source }, alertes, source }
  // Valeurs reprises du registre des équipements (modèle relié) : verrouillées comme les autres liens
  const Rg = () => (typeof Registre !== 'undefined' ? Registre : (() => { try { return require('./registre'); } catch (e) { return null; } })());
  function resoudre(etude, note, pile) {
    const r = resoudreLiens(etude, note, pile), R = etude && (etude.equipements || []).length ? Rg() : null;
    if (R) Object.entries(R.verrous(etude, note)).forEach(([k, v]) => { if (!r.verrous[k]) r.verrous[k] = v; });
    return r;
  }
  function resoudreLiens(etude, note, pile = new Set()) {
    const e = { ...N.defauts(note.type), ...copie(note.entrees || {}) }, verrous = {}, alertes = [];
    const notes = (etude && etude.notes) || [], libelle = n => `N${notes.indexOf(n) + 1} — ${n.titre}`;
    if (pile.has(note.id)) return { entrees: e, verrous, alertes: [{ niveau: 'erreur', texte: 'Liens circulaires entre calculs.' }], source: null };
    pile = new Set([...pile, note.id]);
    // Données saisies une fois pour l'étude (climat, type de bâtiment) et choix reliés (circuit primaire, chaufferie, tronçon)
    lienEtude(etude, note, e, verrous, alertes, libelle, pile);
    // Calculs annexes (et tout type qui le déclare) : données reprises des autres notes de l'étude par leur fonction « lier »
    //  - imposer(vals, source) : valeur reprise et verrouillée ; proposer(vals, source) : remplit seulement un champ vide
    //    (jamais une valeur saisie) ; resoudre(n) / calculer(n) : entrées et résultats d'une autre note
    const T = N.TYPES[note.type];
    if (T && typeof T.lier === 'function') {
      const imposer = (vals, src) => Object.entries(vals || {}).forEach(([k, v]) => { if (v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) return; e[k] = v; verrous[k] = src; });
      const vide = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
      const proposer = (vals, src) => Object.entries(vals || {}).forEach(([k, v]) => { if (vide(v) || (typeof v === 'number' && !Number.isFinite(v))) return; const saisi = note.entrees && !vide(note.entrees[k]); if (!saisi) { e[k] = v; (e._repris = e._repris || {})[k] = src; } });
      const autres = notes.filter(n => n !== note && !pile.has(n.id));
      try {
        T.lier({ etude, note, notes: autres, e, imposer, proposer, alertes, libelle,
          resoudre: n => resoudre(etude, n, pile).entrees,
          calculer: n => { try { return N.calculer(n.type, resoudre(etude, n, pile).entrees); } catch (err) { return { valeurs: {}, alertes: [] }; } } });
      } catch (err) { alertes.push({ niveau: 'attention', texte: `Données de l'étude non reprises : ${err.message}` }); }
    }
    // Schéma alimenté par le circuit d'un autre schéma : fluide et régime repris avant tout calcul de ses circuits
    const amont = note.type === 'pid' ? lienAmont(etude, note, e, verrous, alertes, libelle, pile) : null;
    // Schéma : puissances des circuits reprises des bilans
    if (note.type === 'pid') {
      const froid = (() => { const r = Sc.REGIMES[e.reseau]; return e.reseau === 'perso' ? num(e.Tdep) < num(e.Tret) : r && r[1] < r[2]; })();
      (e.circuits || []).forEach((c, i) => {
        if (!c.bilan) return;
        const src = notes.find(n => n.id === c.bilan);
        if (!src) { alertes.push({ niveau: 'attention', texte: `${c.rep || `Circuit ${i + 1}`} : le bilan d'origine a été supprimé, puissance saisie conservée.` }); return; }
        const v = N.calculer(src.type, resoudre(etude, src, pile).entrees).valeurs;
        c.P = Math.round((froid ? v.Pfroid : v.Pchauf) / 100) / 10;
        verrous[`circuits.${i}.P`] = libelle(src);
      });
    }
    // Terminaux : régimes d'eau chaude et glacée repris de la production choisie (schéma de principe)
    if (note.type === 'terminaux') [['prodChaud', 'TcAller', 'TcRetour', false], ['prodFroid', 'TfAller', 'TfRetour', true]].forEach(([k, kd, kr, froid]) => {
      if (!e[k]) return;
      const src = notes.find(n => n.id === e[k] && n.type === 'pid');
      if (!src) { alertes.push({ niveau: 'attention', texte: 'La production reliée a été supprimée : régimes saisis conservés.' }); return; }
      const es = brut(src), R = Sc.REGIMES[es.reseau];
      const rg = es.reseau === 'co' ? (froid ? [es.TdepF, es.TretF] : [es.TdepC, es.TretC]) : es.reseau === 'perso' ? [es.Tdep, es.Tret] : R ? [R[1], R[2]] : null;
      if (!rg) return;
      if (froid !== (num(rg[0]) < num(rg[1]))) { alertes.push({ niveau: 'attention', texte: `${libelle(src)} : régime ${rg[0]}/${rg[1]} °C, pas un régime ${froid ? 'd\'eau glacée' : 'd\'eau chaude'}.` }); return; }
      e[kd] = num(rg[0]); e[kr] = num(rg[1]); verrous[kd] = libelle(src); verrous[kr] = libelle(src);
    });
    // Production d'ECS choisie par un calcul sanitaire : besoins repris des points de puisage (méthode des puisages)
    if (note.type === 'ecs') {
      const san = notes.find(n => n.type === 'sanitaire' && (n.entrees || {}).production === note.id);
      if (san) {
        try {
          const v = N.calculer('sanitaire', resoudre(etude, san, pile).entrees).valeurs, b = v.besoinECS;
          if (b && b.Vj > 0) {
            Object.assign(e, { usage: 'perso', Vj: Math.round(b.Vj), pointe: Math.round(b.part * 100), tp: b.tp, Tc: b.Tst, Tf: num(brut(san).Tef) || e.Tf });
            ['usage', 'Vj', 'pointe', 'tp', 'Tc', 'Tf'].forEach(k => { verrous[k] = `${libelle(san)} (${v.points} points de puisage)`; });
          }
        } catch (err) { alertes.push({ niveau: 'attention', texte: 'Calcul sanitaire relié incomplet : besoins saisis conservés.' }); }
      }
    }
    // Terminaux : besoins des pièces des bilans pièce par pièce de l'étude
    if (note.type === 'terminaux' && notes.some(n => n.type === 'pieces')) { try { e._besoins = (typeof Pieces !== 'undefined' ? Pieces : require('./pieces')).besoinsEtude(etude); } catch (err) { /* sans bilan */ } }
    // Armoires CVC : analyse fonctionnelle et paramètres de chaque installation de l'étude (régulation)
    if (note.type === 'elec') e._affaire = { objet: etude.objet || '', client: etude.client || '', indice: etude.indice || '', date: etude.date || '', auteur: etude.auteur || '' };
    if (note.type === 'elec') { try { e._regulation = (typeof Regulation !== 'undefined' ? Regulation : require('./regulation')).contexte(etude, { resoudre: (et, n) => resoudre(et, n, pile) }, { zones: e.consignesZones }); } catch (err) { /* sans contexte */ } }
    // Réseau arborescent : branches reliées à un émetteur de l'étude (terminal, batterie de CTA)
    if (note.type === 'arbo') lienEmetteurs(etude, e, verrous, alertes, libelle, pile);
    // Schéma : puissance des circuits sans bilan ni réseau annexe = somme des terminaux qui y sont rattachés
    if (note.type === 'pid') {
      const terms = notes.filter(n => n.type === 'terminaux');
      (e.circuits || []).forEach((c, i) => {
        if (!c.rep || c.bilan || c.annexe) return;
        const cle = `${note.id}|${c.rep}`, srcs = [];
        let P = 0, Pf = 0, nb = 0;
        terms.forEach(n => {
          const r = N.calculer('terminaux', resoudre(etude, n, pile).entrees);
          (r.valeurs.lignes || []).forEach((x, k) => { const a = ((n.entrees || {}).appareils || []).find(y => y.rep === x.rep); if (a && a.circuit === cle) { P += x.Pch; Pf += x.Pfr; nb++; if (!srcs.includes(n)) srcs.push(n); } });
        });
        if (!nb) return;
        c.P = Math.round(P * 10) / 10; verrous[`circuits.${i}.P`] = `${nb} terminal(aux) de ${srcs.map(libelle).join(', ')}`;
        if (e.reseau === 'co') { c.Pf = Math.round(Pf * 10) / 10; verrous[`circuits.${i}.Pf`] = verrous[`circuits.${i}.P`]; }
      });
    }
    // Réseau aéraulique relié à une CTA (et CTA alimentée par ses réseaux)
    const air = lienAir(etude, note, e, verrous, alertes, libelle), eau = note.lien ? null : lienHydro(etude, note, e, verrous, alertes, libelle, pile, amont);
    if (air || eau) return { entrees: e, verrous, alertes, source: air && eau ? { ...air, libelle: `${air.libelle}, ${eau.libelle}`, texte: `${air.texte} ${eau.texte}` } : air || eau };
    // Note créée depuis un schéma : valeurs du circuit (ou de l'installation) recalculées
    const lien = note.lien;
    if (lien && lien.note) {
      const src = notes.find(n => n.id === lien.note);
      if (!src) return { entrees: e, verrous, alertes: [{ niveau: 'attention', texte: 'Le schéma d\'origine a été supprimé : valeurs conservées, lien à détacher.' }], source: null };
      const es = resoudre(etude, src, pile).entrees, d = Sc.dimensionner(es), c = d.circuits[lien.circuit];
      const imposer = (vals, cles = Object.keys(vals)) => { Object.assign(e, vals); cles.forEach(k => { verrous[k] = libelle(src); }); };
      const Tm = c ? (c.rc[0] + c.rc[1]) / 2 : (d.Td + d.Tr) / 2;
      if (lien.role !== 'vase' && !c) return { entrees: e, verrous, alertes: [{ niveau: 'attention', texte: 'Le circuit d\'origine n\'existe plus dans le schéma : valeurs conservées, lien à détacher.' }], source: { note: src, libelle: libelle(src) } };
      if (lien.role === 'reseau') {
        imposer({ fluide: es.fluide, T: Math.round(Tm * 10) / 10, serie: es.serie, circuit: 'ferme' });
        e.troncons = e.troncons && e.troncons.length ? e.troncons : [{}];
        Object.assign(e.troncons[0], { rep: e.troncons[0].rep || `${c.rep} — aller + retour`, Q: Math.round(c.Q * 100) / 100, tube: c.t.cle, L: c.L });
        ['Q', 'tube', 'L'].forEach(k => { verrous[`troncons.0.${k}`] = libelle(src); });
      }
      if (lien.role === 'vanne') imposer({ fluide: es.fluide, T: Math.round(Tm * 10) / 10, mode: 'debit', Q: Math.round(c.Q * 100) / 100, type: c.reg === '3v' ? '3v' : '2v' });
      if (lien.role === 'vase') {
        const vol = Sc.volumeEau(d, es.generateur);
        imposer({ fluide: es.fluide, modeV: 'saisi', Vinst: Math.round(vol.total), Tmax: d.chaud ? d.Td : 35 });
      }
      return { entrees: e, verrous, alertes, source: { note: src, libelle: libelle(src), circuit: c ? c.rep : '' } };
    }
    return { entrees: e, verrous, alertes, source: null };
  }

  /* ---------- Données de l'étude saisies une fois : climat, type de bâtiment, neuf / existant ---------- */
  const Dn = () => (typeof Donnees !== 'undefined' ? Donnees : require('./donnees'));
  const normT = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // Climat de l'étude : site de la liste (températures de base) ou températures saisies ; null si non défini
  function climatEtude(et) {
    const k = et && et.climat;
    if (!k) return null;
    if (k === 'perso') return { cle: 'perso', libelle: 'températures saisies', Tbase: num(et.Tbase, -7), Tete: num(et.Tete, 32), HRete: num(et.HRete, 40) };
    const c = Dn().CLIMATS[k];
    return c ? { cle: k, libelle: c[0], Tbase: c[1], Tete: c[2], HRete: c[3] } : null;
  }
  // Climat proposé d'après la ville (ou le code postal) du site du chantier
  const DEPARTEMENTS = { '07': 'annonay', 69: 'lyon', 42: 'st-etienne', 43: 'st-etienne', 26: 'valence', 38: 'grenoble', 73: 'chambery', 74: 'chambery', 63: 'clermont', '03': 'clermont', 15: 'clermont',
    21: 'dijon', 71: 'dijon', 75: 'paris', 77: 'paris', 78: 'paris', 91: 'paris', 92: 'paris', 93: 'paris', 94: 'paris', 95: 'paris', 59: 'lille', 62: 'lille', 67: 'strasbourg', 68: 'strasbourg',
    54: 'nancy', 55: 'nancy', 57: 'nancy', 88: 'nancy', 87: 'limoges', 19: 'limoges', 23: 'limoges', 44: 'nantes', 85: 'nantes', 49: 'nantes', 35: 'rennes', 22: 'rennes', 56: 'rennes', 29: 'brest',
    33: 'bordeaux', 31: 'toulouse', 34: 'montpellier', 30: 'montpellier', 13: 'marseille', 83: 'marseille', 84: 'marseille', '06': 'nice' };
  function climatDeVille(ville, cp) {
    const v = normT(ville);
    if (v) {
      // Ville citée dans le libellé du site (« Chambéry, Annecy », « Annonay, Ardèche nord (Davezieux) »)
      const m = Object.entries(Dn().CLIMATS).find(([, c]) => normT(c[0]).split(' ').filter(w => w.length > 3 && !['ardeche', 'nord'].includes(w)).some(w => v === w || v.startsWith(`${w} `)))
        || Object.entries(Dn().CLIMATS).find(([, c]) => normT(c[0].split(',')[0]) === v);
      if (m) return m[0];
    }
    const d = String(cp || '').replace(/\s/g, '').slice(0, 2);
    return /^\d\d$/.test(d) ? DEPARTEMENTS[d] || DEPARTEMENTS[+d] || '' : '';
  }
  // Type de bâtiment de l'étude → choix de chaque calcul (valeur par défaut : un choix fait dans le calcul reste)
  const TYPES_BATIMENT = {
    bureaux: ['Bureaux, tertiaire', { pid: 'tertiaire', sanitaire: 'bureau', evacuation: 'logement', aero: 'bureau', elec: 'bureaux' }],
    enseignement: ['Enseignement (école, collège, lycée)', { pid: 'erp', sanitaire: 'creche', evacuation: 'collectif', aero: 'classe', elec: 'enseignement' }],
    ehpad: ['EHPAD, établissement de soins', { pid: 'erp', sanitaire: 'sante', evacuation: 'collectif', aero: 'hotel', elec: 'ehpad' }],
    creche: ['Crèche, petite enfance', { pid: 'erp', sanitaire: 'creche', evacuation: 'collectif', aero: 'classe', elec: 'creche' }],
    gymnase: ['Salle de sport, gymnase', { pid: 'erp', sanitaire: 'vestiaire', evacuation: 'public', aero: 'open', elec: 'gymnase' }],
    logement: ['Logements collectifs', { pid: 'habitation', sanitaire: 'logement', evacuation: 'logement', aero: 'log', elec: 'logement' }],
    hotel: ['Hôtel', { pid: 'erp', sanitaire: 'hotel', evacuation: 'collectif', aero: 'hotel' }],
    commerce: ['Commerce (ERP)', { pid: 'erp', sanitaire: 'bureau', evacuation: 'logement', aero: 'open' }],
    restauration: ['Restauration', { pid: 'erp', sanitaire: 'restauration', evacuation: 'collectif', aero: 'open' }],
    industrie: ['Industrie, ateliers', { pid: 'industrie', sanitaire: 'industrie', evacuation: 'labo', aero: 'atelier' }],
  };
  // Champs des calculs repris du type de bâtiment ou de « neuf / existant » de l'étude (le premier : type de bâtiment)
  const CHAMPS_ETUDE = { pid: ['usage'], sanitaire: ['usage'], evacuation: ['usage'], aero: ['usageAcous'], elec: ['profilBatiment', 'batimentNeuf'] };
  const champEtude = (type, k) => (CHAMPS_ETUDE[type] || []).includes(k);
  const typeBatimentEtude = et => (et && TYPES_BATIMENT[et.typeBatiment] ? et.typeBatiment : '');
  // Protocoles de GTB : libellés harmonisés entre les armoires électriques (« BACnet/IP ») et les schémas (« BACnet IP »)
  const gtbPid = v => (/^bacnet/i.test(String(v || '')) ? 'BACnet IP' : /^modbus/i.test(String(v || '')) ? 'Modbus TCP' : String(v || ''));
  // Générateurs à combustion : combustible et rendement PCI usuel (débit calorifique = puissance utile / rendement)
  const COMBUSTION = { 'chaudiere-cond': ['gaz', 0.97], 'chaudiere-gaz': ['gaz', 0.92], 'chaudiere-fioul': ['fioul', 0.92], 'chaudiere-bois': ['bois', 0.85] };
  // Listes de choix reliées à l'étude (sans étude : la valeur enregistrée seule)
  const notesN = (et, f) => ((et && et.notes) || []).map((n, i) => [n, i]).filter(([n]) => f(n));
  const optPid = (et, v) => [['', '—'], ...(et ? notesN(et, n => n.type === 'pid').map(([n, i]) => [n.id, `N${i + 1} — ${n.titre}`]) : v ? [[v, v]] : [])];
  const optCircuits = (et, v) => [['', 'Saisie'], ...(et ? notesN(et, n => n.type === 'pid').flatMap(([n, i]) => ((n.entrees || {}).circuits || []).filter(c => c && c.rep).map(c => [`${n.id}|${c.rep}`, `N${i + 1} — ${c.rep}`])) : v ? [[v, v]] : [])];
  // Tronçons des réseaux et pompes, circuits des schémas de principe : source d'une isolation, d'une dilatation, d'un supportage
  const optTroncons = (et, v) => [['', 'Saisie'], ...(et ? notesN(et, n => n.type === 'reseau' || n.type === 'pid').flatMap(([n, i]) => (n.type === 'reseau'
    ? ((n.entrees || {}).troncons || []).map((t, j) => [`${n.id}|t|${j}`, `N${i + 1} — ${(t && t.rep) || `Tronçon ${j + 1}`}`])
    : ((n.entrees || {}).circuits || []).map((c, j) => [`${n.id}|c|${j}`, `N${i + 1} — circuit ${(c && c.rep) || `C${j + 1}`}`]))) : v ? [[v, v]] : [])];
  function lienEtude(etude, note, e, verrous, alertes, libelle, pile) {
    const notes = (etude && etude.notes) || [], t = note.type;
    const imposer = (vals, lib) => Object.entries(vals).forEach(([k, v]) => { e[k] = v; verrous[k] = lib; });
    // 1. Climat de l'étude : températures extérieures de base imposées (verrouillées)
    const cl = climatEtude(etude);
    if (cl) {
      const lib = `climat de l'étude (${cl.libelle})`;
      if (t === 'bilan' || t === 'batiment') imposer(cl.cle === 'perso' ? { climat: 'perso', Te: cl.Tbase, TeEte: cl.Tete, HRete: cl.HRete } : { climat: cl.cle }, lib);
      if (t === 'pieces') imposer({ Tbase: cl.Tbase, Tete: cl.Tete }, lib);
      if (t === 'cta' && e.modeP !== 'saisie') imposer({ TeH: cl.Tbase, TeE: cl.Tete, HReE: cl.HRete }, lib);
      if (t === 'pid') imposer({ Tbase: cl.Tbase }, lib);
    }
    // 2. Type de bâtiment et neuf / existant : valeur par défaut des calculs (sauf choix fait dans le calcul)
    if (CHAMPS_ETUDE[t] && etude) {
      const saisis = e._saisis || {}, k = CHAMPS_ETUDE[t][0], tb = typeBatimentEtude(etude), v = tb && TYPES_BATIMENT[tb][1][t];
      if (v && !saisis[k]) e[k] = v;
      if (t === 'elec' && ['oui', 'non'].includes(etude.neuf) && !saisis.batimentNeuf) e.batimentNeuf = etude.neuf;
    }
    // 3. Protocole de GTB du schéma de principe repris des armoires électriques de l'étude
    // Récupération d'énergie : chaleur récupérée sur le groupe froid (schéma froid) reprise par le schéma chaud
    if (t === 'pid' && e.recupDe) {
      const src = notes.find(n => n.id === e.recupDe && n.type === 'pid' && n !== note);
      if (!src) alertes.push({ niveau: 'attention', texte: 'Le schéma de principe froid de la récupération a été supprimé.' });
      else if (!pile.has(src.id)) { try { const v = N.calculer('pid', resoudre(etude, src, pile).entrees).valeurs || {}; imposer({ Precup: v.Precup || 0 }, libelle(src)); } catch (err) { /* schéma froid incomplet */ } }
    }
    if (t === 'pid') {
      const el = notes.find(n => n.type === 'elec');
      if (el) { const g = gtbPid((el.entrees || {}).gtb || (N.TYPES.elec ? N.defauts('elec').gtb : '')); if (g) imposer({ gtb: g }, libelle(el)); }
    }
    // Échangeur du schéma : pompe existante d'un réseau reliée côté primaire ou secondaire (débit et nom repris)
    if (t === 'pid') ['pompeEchPrimLien', 'pompeEchSecLien'].forEach(k => {
      if (!e[k] || e[k.replace('Lien', '')] !== 'existante') return;
      const [ty, id, rep] = String(e[k]).split('|'), src = notes.find(n => n.id === id);
      if (!src || src === note || pile.has(src.id)) { if (!src) alertes.push({ niveau: 'attention', texte: 'La pompe existante reliée à l\'échangeur a été supprimée.' }); return; }
      try {
        const v = N.calculer(src.type, resoudre(etude, src, pile).entrees).valeurs || {};
        const q = ty === 'pid' ? ((v.circuits || []).find(c => c.rep === rep) || {}).Q : ty === 'arbo' ? v.Qp : v.Qpompe;
        e[`${k}Nom`] = ty === 'pid' ? `${src.titre} — circuit ${rep}` : src.titre;
        if (Number.isFinite(q)) e[`${k}Q`] = Math.round(q * 100) / 100;
      } catch (err) { /* calcul relié incomplet */ }
    });
    // 4. Production d'ECS : puissance et régime du primaire repris du circuit du schéma de principe
    if (t === 'ecs' && e.circuitPrim) {
      const [id, rep] = String(e.circuitPrim).split('|'), src = notes.find(n => n.id === id && n.type === 'pid');
      if (!src) alertes.push({ niveau: 'attention', texte: 'Le schéma de principe du circuit primaire a été supprimé : puissance et régime saisis conservés.' });
      else {
        let c = null;
        try { c = Sc.dimensionner(resoudre(etude, src, pile).entrees).circuits.find(x => x.rep === rep); } catch (err) { c = null; }
        if (!c) alertes.push({ niveau: 'attention', texte: `Circuit « ${rep} » introuvable dans ${libelle(src)} : puissance et régime saisis conservés.` });
        else {
          const rc = c.rcC || c.rc, lib = `${libelle(src)} (circuit ${rep})`;
          imposer({ P: Math.round(num(c.P) * 10) / 10, Tp1: rc[0], Tp2: rc[1] }, lib);
          if (rc[0] < rc[1]) alertes.push({ niveau: 'erreur', texte: `Circuit « ${rep} » : régime ${rc[0]}/${rc[1]} °C, pas un régime d'eau chaude.` });
        }
      }
    }
    // 5. Gaz et ventilation de chaufferie : générateurs de la chaufferie de l'étude (schéma de principe)
    if (['gaz', 'gazReseau', 'ventilation'].includes(t) && e.chaufferie) {
      const src = notes.find(n => n.id === e.chaufferie && n.type === 'pid');
      if (!src) alertes.push({ niveau: 'attention', texte: 'Le schéma de principe de la chaufferie a été supprimé : valeurs saisies conservées.' });
      else {
        const es = brut(src), n = Math.max(1, Math.min(6, Math.round(num(es.nGen, 1)))), Pg = num(es.Pgen), cb = COMBUSTION[es.generateur], lib = libelle(src);
        const gen = (Sc.GENERATEURS[es.generateur] || ['Générateur'])[0];
        if (!cb) alertes.push({ niveau: 'attention', texte: `${lib} : ${gen.toLowerCase()}, sans combustion : ${t === 'ventilation' ? 'ventilation de chaufferie à saisir' : 'aucun appareil gaz repris'}.` });
        else if (t === 'ventilation') imposer({ P: Math.round(n * Pg * 10) / 10, combustible: cb[0], rendement: Math.round(cb[1] * 100) }, lib);
        else if (cb[0] !== 'gaz') alertes.push({ niveau: 'attention', texte: `${lib} : ${gen.toLowerCase()} (${cb[0]}), aucun appareil gaz repris.` });
        else {
          // Lignes ajoutées après les appareils saisis (mêmes numéros de ligne que la saisie), verrouillées
          const l = e.appareils = Array.isArray(e.appareils) ? e.appareils : [], i0 = l.length, nom = String(es.titreInstallation || src.titre || 'Chaufferie').trim();
          const doublons = l.filter(a => a && /chaudi[eè]re|g[ée]n[ée]rateur/i.test(a.nom || '') && num(a.P) > 0);
          if (doublons.length) alertes.push({ niveau: 'attention', texte: `Générateurs repris de ${lib} : ${doublons.map(a => a.nom).join(', ')} sans doute comptés deux fois — à retirer des appareils saisis.` });
          for (let k = 0; k < n; k++) {
            l.push({ nom: `${nom} — ${gen.toLowerCase()}${n > 1 ? ` ${k + 1}` : ''}`, P: Math.round(Pg / cb[1] * 10) / 10, ...(t === 'gazReseau' ? { troncon: e.troncChaufferie || '' } : {}), _auto: lib });
            ['nom', 'P', ...(t === 'gazReseau' ? ['troncon'] : [])].forEach(c => { verrous[`appareils.${i0 + k}.${c}`] = lib; });
          }
        }
      }
    }
    // 6. Isolation, dilatation, supportage : tube et températures d'un tronçon ou d'un circuit de l'étude
    if (['isolation', 'dilatation', 'supportage'].includes(t) && e.source) {
      const [id, sorte, j] = String(e.source).split('|'), src = notes.find(n => n.id === id);
      let x = null;
      try {
        if (src && src.type === 'reseau' && sorte === 't') {
          const es = resoudre(etude, src, pile).entrees, v = (N.calculer('reseau', es).valeurs.troncons || [])[+j], T = num(es.T);
          if (v) x = { rep: v.rep, serie: v.serie, tube: v.tube, L: v.L, Tc: T, Tf: T, co: false, fluide: es.fluide };
        } else if (src && src.type === 'pid' && sorte === 'c') {
          const es = resoudre(etude, src, pile).entrees, c = Sc.dimensionner(es).circuits[+j];
          if (c) { const rc = c.rcC || c.rc, rf = c.rcF || c.rc; x = { rep: c.rep, serie: es.serie, tube: c.t.cle, L: c.L, Tc: Math.max(rc[0], rc[1]), Tf: Math.min(rf[0], rf[1]), co: !!c.rcF, fluide: es.fluide }; }
        }
      } catch (err) { x = null; }
      if (!x) alertes.push({ niveau: 'attention', texte: 'Le tronçon ou le circuit relié n\'existe plus dans l\'étude : valeurs saisies conservées.' });
      else {
        // Eau glacée (ou change-over) : la température froide gouverne la condensation ; eau chaude : la plus chaude
        const lib = `${libelle(src)} (${x.rep})`, froid = x.co || x.Tc <= 25;
        if (t === 'isolation') imposer({ serie: x.serie, tube: x.tube, L: x.L, Tf: froid ? x.Tf : x.Tc }, lib);
        if (t === 'dilatation') imposer({ serie: x.serie, tube: x.tube, ...(x.Tc > 25 ? { Tmax: x.Tc } : {}), ...(froid ? { Tmin: Math.min(x.Tf, num(e.Tmin, 5)) } : {}) }, lib);
        if (t === 'supportage') {
          if (/acier|inox|cuivre/.test(x.serie)) imposer({ serie: x.serie, tube: x.tube }, lib);
          else alertes.push({ niveau: 'attention', texte: `${lib} : série de tubes non métallique, portée à voir avec le fabricant.` });
          imposer({ T: x.Tc > 25 ? x.Tc : x.Tf, contenu: !x.fluide || x.fluide === 'eau' ? '1000' : '1040' }, lib);
        }
      }
    }
    // 7. Bouches : surface et débit des locaux repris des pièces de l'étude (même nom)
    if (t === 'bouches' && e.reprise === 'pieces') {
      const P = typeof Pieces !== 'undefined' ? Pieces : require('./pieces'), b = P.besoinsEtude(etude), air = {};
      const libP = p => libelle(notes.find(n => n.id === p.note));
      notes.filter(n => n.type === 'aero').forEach(n => ((n.entrees || {}).bouchesL || []).forEach(x => {
        if (!x || !String(x.salle || '').trim()) return;
        const k = P.norm(x.salle), a = air[k] || (air[k] = { souf: 0, ext: 0, src: n });
        if (x.reseau === 'soufflage' || (!x.reseau && x.type !== 'extraction')) a.souf += num(x.Q); else a.ext += num(x.Q);
      }));
      (e.locaux || []).forEach((l, i) => {
        if (!l) return;
        const k = P.norm(l.local), p = b[k], a = air[k], ext = l.type === 'extraction', q = a ? (ext ? a.ext : a.souf) : 0;
        if (p) { l.S = Math.round(p.S * 10) / 10; verrous[`locaux.${i}.S`] = libP(p); }
        if (q > 0) { l.Q = Math.round(q); verrous[`locaux.${i}.Q`] = `${libelle(a.src)} (bouches de la pièce)`; }
        else if (p && !ext && p.Qair > 0) { l.Q = Math.round(p.Qair); verrous[`locaux.${i}.Q`] = `${libP(p)} (air neuf de la pièce)`; }
        if (!p && !a && String(l.local || '').trim()) alertes.push({ niveau: 'info', texte: `${l.local} : pièce absente des bilans et des bouches de l'étude, surface et débit saisis.` });
      });
    }
  }

  /* ---------- Réseau arborescent ← émetteurs (terminaux, batteries de CTA) ---------- */
  // Chaque branche reliée prend la puissance, le débit (régime de l'émetteur) et la perte de charge côté eau de la
  // batterie (fiche technique) + vanne de régulation ; seule l'arborescence (tronçons amont, longueurs) reste à saisir
  function lienEmetteurs(etude, e, verrous, alertes, libelle, pile) {
    const notes = (etude && etude.notes) || [], froid = e.saison === 'froid', cache = new Map();
    const calc = src => { if (!cache.has(src.id)) { try { cache.set(src.id, N.calculer(src.type, resoudre(etude, src, pile).entrees)); } catch (err) { cache.set(src.id, null); } } return cache.get(src.id); };
    // Pompes placées : point de fonctionnement repris de l'équipement (fiche technique)
    (e.troncons || []).forEach(t => {
      if (!t || !t.pompe) return;
      const [id, cle] = String(t.pompe).split(':'), src = notes.find(n => n.id === id), a = src && ((src.entrees || {}).appareils || []).find(x => x.rep === cle);
      if (!a) { alertes.push({ niveau: 'attention', texte: `${t.rep || 'Tronçon'} : la pompe placée n'existe plus dans les équipements.` }); return; }
      Object.assign(t, { pompeQ: num(a.Qp), pompeH: num(a.Hp), pompeNom: `${a.rep}${a.ref ? ` (${a.ref})` : ''}` });
    });
    const raccordes = new Map();
    (e.troncons || []).forEach((t, i) => {
      if (!t || !t.emetteur) return;
      if (raccordes.has(t.emetteur)) alertes.push({ niveau: 'erreur', texte: `${t.rep || `Tronçon ${i + 1}`} : émetteur ${String(t.emetteur).split(':')[1]} déjà raccordé sur la branche ${raccordes.get(t.emetteur)} (un émetteur = une branche).` });
      else raccordes.set(t.emetteur, t.rep || `Tronçon ${i + 1}`);
      const [id, cle] = String(t.emetteur).split(':'), src = notes.find(n => n.id === id), rep = t.rep || `Tronçon ${i + 1}`;
      if (!src) { alertes.push({ niveau: 'attention', texte: `${rep} : l'émetteur relié a été supprimé de l'étude, valeurs saisies conservées.` }); return; }
      const r = calc(src); if (!r) return;
      let P, Q, dp;
      if (src.type === 'terminaux') {
        const x = (r.valeurs.lignes || []).find(l => l.rep === cle);
        if (!x) { alertes.push({ niveau: 'attention', texte: `${rep} : terminal ${cle} introuvable dans ${libelle(src)}.` }); return; }
        const dpV = num((src.entrees || {}).dpVanne, 15), dpB = froid ? x.dpF : x.dpC;
        P = froid ? x.Pfr : x.Pch; Q = froid ? x.qf : x.qc; dp = (dpB || 0) + (x.nbV ? dpV : 0);
        // Vanne de régulation du terminal (2, 3 ou 4 voies) et son Kvs : reprises sur la branche
        t.vanneReg = x.v === 'aucune' ? 'aucune' : x.v || ''; t.kvsReg = x.kvs || ''; verrous[`troncons.${i}.vanneReg`] = libelle(src); if (x.kvs) verrous[`troncons.${i}.kvsReg`] = libelle(src);
        if (!dpB) alertes.push({ niveau: 'info', texte: `${rep} : perte de charge eau de ${cle} non renseignée (fiche technique du terminal) : seule la vanne est comptée.` });
      } else if (src.type === 'cta') {
        const v = r.valeurs, f = (src.entrees || {}).fiche || {}, dpB = froid ? f.dpEauBF : f.dpEauBC;
        P = froid ? v.Pfroid : v.Pchaud; Q = froid ? v.QwF : v.QwC; dp = (Number.isFinite(dpB) ? dpB : 20) + 15;
        if (!Number.isFinite(dpB)) alertes.push({ niveau: 'info', texte: `${rep} : batterie de ${src.titre} : 20 kPa côté eau pris par défaut (fiche technique de la CTA à charger) + 15 kPa de vanne.` });
      } else return;
      Object.assign(t, { P: Math.round(num(P) * 100) / 100, Q: Math.round(num(Q) * 1000) / 1000, dpEm: Math.round(dp * 10) / 10 });
      if (!String(t.nom || '').trim()) t.nom = src.type === 'cta' ? `${src.titre} (batterie ${froid ? 'froide' : 'chaude'})` : cle;
      ['P', 'Q', 'dpEm'].forEach(k => { verrous[`troncons.${i}.${k}`] = libelle(src); });
    });
  }

  /* ---------- CTA ↔ réseau aéraulique ---------- */
  // Les deux côtés lisent les entrées saisies de l'autre (pas de liens circulaires) : la CTA donne ses composants,
  // le réseau donne ses débits et ses pertes de charge hors CTA.
  const brut = n => ({ ...N.defauts(n.type), ...copie(n.entrees || {}) });
  const TYPE_AIR = { double: 'cta-df', melange: 'cta-melange', simple: 'cta-sf' }, RECUP_AIR = { plaques: 'plaques', roue: 'roue', glycol: 'boucle', aucun: 'aucun' };
  const reseauxDeCta = (notes, cta) => notes.filter(n => (n.type === 'aero' || n.type === 'aeraulique') && n.entrees && n.entrees.cta === cta.id);
  function lienAir(etude, note, e, verrous, alertes, libelle) {
    const notes = (etude && etude.notes) || [];
    const imposer = (vals, lib) => Object.entries(vals).forEach(([k, v]) => { e[k] = v; verrous[k] = lib; });
    if ((note.type === 'aero' || note.type === 'aeraulique') && e.cta) {
      const src = notes.find(n => n.id === e.cta && n.type === 'cta');
      if (!src) { alertes.push({ niveau: 'attention', texte: 'Le calcul de CTA relié a été supprimé : choisissez-en un autre ou « Saisie ».' }); return null; }
      const c = brut(src), lib = libelle(src), recup = c.type === 'double' ? c.recup : 'aucun', froid = !['non', 'aucune'].includes(c.froid), chaudeEau = !['froide', 'aucune'].includes(c.froid), dpBE = c.batElec ? num(c.dpBE, 30) : 0;
      if (note.type === 'aero') {
        imposer({ producteur: TYPE_AIR[c.type] || 'cta-df', recuperateur: RECUP_AIR[recup] || 'aucun', batChaude: chaudeEau || c.batElec === 'chaude' ? 'oui' : 'non', batFroide: froid ? 'oui' : 'non',
          dpFiltreS: num(c.dpFiltreAN), dpFiltreR: c.type === 'simple' ? 0 : num(c.dpFiltreR), dpRecup: recup !== 'aucun' ? num(c.dpRecup) : 0, dpBatC: (!chaudeEau || c.froid === 'co' ? 0 : num(c.dpBC)) + dpBE + (c.humid === 'vapeur' ? 30 : 0), dpBatF: froid ? num(c.dpBF) : 0,
          // Caissons, silencieux et volets de la CTA : moitié à la prise d'air, moitié au silencieux (la reprise en compte la moitié)
          dpPrise: num(c.dpDivers) / 2, dpSil: num(c.dpDivers) / 2, dpRejet: 0, rendement: num(c.rendement, 60) }, lib);
        if (!String(e.titreInstallation || '').trim() || e.titreInstallation === N.defauts('aero').titreInstallation) e.titreInstallation = src.titre;
      } else {
        const reprise = e.ctaFlux === 'reprise' && c.type !== 'simple';
        const dpCta = reprise ? num(c.dpFiltreR) + (recup !== 'aucun' ? num(c.dpRecup) : 0) + num(c.dpDivers) / 2
          : num(c.dpFiltreAN) + (recup !== 'aucun' ? num(c.dpRecup) : 0) + (!chaudeEau || c.froid === 'co' ? 0 : num(c.dpBC)) + (froid ? num(c.dpBF) : 0) + dpBE + (c.humid === 'vapeur' ? 30 : 0) + num(c.dpDivers);
        imposer({ dpCta: Math.round(dpCta) }, lib);
        const doublons = (e.composants || []).filter(x => /filtre|batterie|recup|récup|echangeur|échangeur|roue/i.test(x.nom || '') && num(x.dp) > 0);
        if (doublons.length) alertes.push({ niveau: 'attention', texte: `Composants déjà comptés dans la CTA (${doublons.map(x => x.nom).join(', ')}) : à retirer de la liste des composants du réseau.` });
        if (e.ctaFlux === 'reprise' && c.type === 'simple') alertes.push({ niveau: 'attention', texte: `${lib} est une centrale en soufflage seul : pas de ventilateur de reprise.` });
      }
      return { note: src, libelle: lib, texte: `Centrale reprise de ${lib} (type, récupérateur, batteries, pertes de charge des composants) ; les débits et les pertes de charge de ce réseau sont repris par la CTA. Mise à jour automatique.` };
    }
    if (note.type === 'cta') {
      const reseaux = reseauxDeCta(notes, note);
      if (!reseaux.length) return null;
      const libs = [], double = e.type !== 'simple';
      const aero = reseaux.find(n => n.type === 'aero');
      if (aero) {
        const v = N.calculer('aero', brut(aero)).valeurs || {}, lib = libelle(aero);
        if (v.Qs > 0) imposer({ Qs: Math.round(v.Qs), dpReseauS: Math.round(v.dpReseauS) }, lib);
        if (double && v.Qr > 0) imposer({ Qr: Math.round(v.Qr), dpReseauR: Math.round(v.dpReseauR) }, lib);
        libs.push(lib);
      }
      reseaux.filter(n => n.type === 'aeraulique').forEach(n => {
        const v = N.calculer('aeraulique', { ...brut(n), dpCta: 0 }).valeurs || {}, lib = libelle(n), reprise = n.entrees.ctaFlux === 'reprise';
        if (reprise && !double) return;
        if (aero && (reprise ? verrous.Qr : verrous.Qs)) { alertes.push({ niveau: 'attention', texte: `${lib} et ${libelle(aero)} décrivent tous deux le ${reprise ? 'réseau de reprise' : 'réseau de soufflage'} : le schéma aéraulique est retenu.` }); return; }
        imposer(reprise ? { Qr: Math.round(v.Qv), dpReseauR: Math.round(v.dpTotal) } : { Qs: Math.round(v.Qv), dpReseauS: Math.round(v.dpTotal) }, lib);
        libs.push(lib);
      });
      return libs.length ? { note: null, libelle: libs.join(', '), texte: `Débits et pertes de charge des réseaux repris de ${libs.join(' et ')} (les composants de la centrale y sont repris) : mise à jour automatique.` } : null;
    }
    return null;
  }

  /* ---------- Chaufferie / sous-station ↔ réseaux annexes ---------- */
  const ANNEXES = ['arbo', 'reseau', 'cta', 'pid'];
  // Schémas de principe en aval d'un schéma, sur tous les niveaux (circuits reliés à un autre schéma) : ensemble d'ids
  function schemasAval(notes, pid, vus = new Set()) {
    ((pid.entrees || {}).circuits || []).forEach(c => {
      const n = c && c.annexe && notes.find(x => x.id === c.annexe && x.type === 'pid');
      if (n && !vus.has(n.id)) { vus.add(n.id); schemasAval(notes, n, vus); }
    });
    return vus;
  }
  // Schéma pris dans une boucle de liens (A alimente B qui alimente A…)
  const cycleSchema = (notes, pid) => schemasAval(notes, pid).has(pid.id);
  // Chaîne des circuits amont d'un schéma, du plus proche à la production racine : [{ pid, i }] (arrêt sur une boucle)
  function chaineAmont(notes, pid) {
    const out = [], vus = new Set([pid.id]);
    for (let r = circuitDeAnnexe(notes, pid); r && !vus.has(r.pid.id); r = circuitDeAnnexe(notes, r.pid)) { out.push(r); vus.add(r.pid.id); }
    return out;
  }
  const libCycle = (notes, pid) => { const l = [pid.titre]; for (let r = circuitDeAnnexe(notes, pid), k = 0; r && k < 20; r = circuitDeAnnexe(notes, r.pid), k++) { l.unshift(r.pid.titre); if (r.pid.id === pid.id) break; } return l.join(' → '); };
  // Schéma alimenté par le circuit d'un autre schéma (sous-station, boucle secondaire, boucle d'eau tempérée) :
  // fluide et régime primaire (sous-station, source de PAC : régime primaire ; sinon régime du départ) repris du
  // circuit amont. Rend { ref, eu, lib } pour la pression disponible, calculée après les circuits du schéma.
  function lienAmont(etude, note, e, verrous, alertes, libelle, pile) {
    const notes = (etude && etude.notes) || [], ref = circuitDeAnnexe(notes, note);
    if (!ref) return null;
    if (cycleSchema(notes, note)) { alertes.push({ niveau: 'erreur', texte: `Liens circulaires entre schémas de principe (${libCycle(notes, note)}) : un schéma ne peut pas s'alimenter lui-même, raccordement amont ignoré.` }); return null; }
    let eu, cu;
    try { eu = resoudre(etude, ref.pid, pile).entrees; cu = Sc.dimensionner(eu).circuits[ref.i]; } catch (err) { return null; }
    if (!cu) return null;
    const lib = `${libelle(ref.pid)} (circuit ${cu.rep})`, imposer = vals => Object.entries(vals).forEach(([k, v]) => { e[k] = v; verrous[k] = lib; });
    const rc = cu.rcC || cu.rc;
    if (Sc.sousStation(e) || Sc.sourceBoucle(e)) imposer({ regimePrim: `${rc[0]}/${rc[1]}`, fluidePrim: eu.fluide || 'eau' });
    else if (cu.rcC) imposer({ reseau: 'co', TdepC: cu.rcC[0], TretC: cu.rcC[1], TdepF: cu.rcF[0], TretF: cu.rcF[1], fluide: eu.fluide });
    else imposer({ reseau: 'perso', Tdep: rc[0], Tret: rc[1], fluide: eu.fluide });
    return { ref, eu, lib, rep: cu.rep };
  }
  // Circuit du schéma qui alimente une note : { pid, i } (premier trouvé)
  function circuitDeAnnexe(notes, note) {
    for (const pid of notes.filter(n => n.type === 'pid')) {
      const i = ((pid.entrees || {}).circuits || []).findIndex(c => c && c.annexe === note.id);
      if (i >= 0) return { pid, i };
    }
    return null;
  }
  // Réseau (arborescent, réseau et pompe, CTA) placé dans le schéma de principe : relié à un circuit existant (i) ou à un
  // nouveau circuit qui prend le nom du réseau (i < 0). Rend { pid, i } ou null.
  const EMETTEUR_ANNEXE = n => (n.type === 'pid' ? 'sousstation' : n.type === 'cta' ? 'cta' : n.type === 'arbo' && (n.entrees || {}).saison === 'froid' ? 'ventilo' : 'radiateurs');
  function relierAuSchema(etude, note, pidId, i = -1) {
    const pid = ((etude && etude.notes) || []).find(n => n.id === pidId && n.type === 'pid');
    if (!pid || !ANNEXES.includes(note.type)) return null;
    // Schéma aval : ni lui-même, ni un schéma qu'il alimente déjà (boucle)
    if (note.type === 'pid' && (pid.id === note.id || schemasAval(etude.notes, note).has(pid.id))) return null;
    if (note.type === 'cta') {
      const nouv = couvertParCircuit(etude, pid);
      circuitsDeAnnexe(etude.notes, note).filter(r => [...couvertParCircuit(etude, r.pid)].some(b => nouv.has(b))).forEach(r => { delete r.pid.entrees.circuits[r.i].annexe; });
    } else { const anc = circuitDeAnnexe(etude.notes, note); if (anc) delete anc.pid.entrees.circuits[anc.i].annexe; }
    // Circuits par défaut du schéma (jamais modifiés, donc pas encore enregistrés) gardés : on ajoute à ce que l'on voit
    const cs = pid.entrees.circuits = pid.entrees.circuits || copie(N.defauts('pid').circuits || []);
    // CTA : la puissance du circuit est celle de ses batteries (plus celle d'un bilan)
    if (i >= 0 && cs[i]) { cs[i].annexe = note.id; if (note.type === 'cta') delete cs[i].bilan; return { pid, i }; }
    cs.push({ rep: repLibre(cs, String(note.titre || '').trim() || `C${cs.length + 1}`), emetteur: EMETTEUR_ANNEXE(note), P: '', regime: '', regulation: note.type === 'pid' ? 'direct' : '3v', L: 0, annexe: note.id });
    return { pid, i: cs.length - 1 };
  }
  // CTA (batteries à eau) raccordée en bout de branche d'un réseau arborescent : réseaux où elle est déjà un émetteur
  const Eqb = () => (typeof Equilibrage !== 'undefined' ? Equilibrage : require('./equilibrage'));
  const arbosDeCta = (etude, cta) => ((etude && etude.notes) || []).filter(n => n.type === 'arbo' && ((n.entrees || {}).troncons || []).some(t => String(t.emetteur || '').startsWith(`${cta.id}:`)));
  // Batteries de la CTA proposées à un réseau arborescent (selon la saison du réseau) et pas encore raccordées
  const batteriesLibres = (etude, cta, arbo) => {
    const pris = new Set(((etude && etude.notes) || []).filter(n => n.type === 'arbo').flatMap(n => ((n.entrees || {}).troncons || []).map(t => t.emetteur)).filter(Boolean));
    return Eqb().emetteursEtude(etude, (arbo.entrees || {}).saison || 'chaud').filter(x => x.cle.startsWith(`${cta.id}:`) && !pris.has(x.cle));
  };
  // Batteries à eau d'une CTA et leur raccordement : branche d'un réseau arborescent (chaud pour la batterie chaude,
  // froid pour la batterie froide ; change-over : les deux) ou circuit du schéma de principe dont le régime la dessert
  function batteriesCta(etude, cta) {
    const f = (cta.entrees || {}).froid || 'oui', co = f === 'co', notes = (etude && etude.notes) || [];
    const bats = [...(!['froide', 'aucune'].includes(f) ? [{ b: 'bc', saison: 'chaud', libelle: co ? 'Batterie change-over (eau chaude)' : 'Batterie chaude' }] : []),
      ...(!['non', 'aucune'].includes(f) ? [{ b: 'bf', saison: 'froid', libelle: co ? 'Batterie change-over (eau glacée)' : 'Batterie froide' }] : [])];
    const refs = circuitsDeAnnexe(notes, cta).map(r => ({ ...r, couvre: couvertParCircuit(etude, r.pid) }));
    return bats.map(x => {
      const a = notes.find(n => n.type === 'arbo' && ((n.entrees || {}).troncons || []).some(t => t.emetteur === `${cta.id}:${x.b}`));
      if (a) return { ...x, lien: { type: 'arbo', note: a, rep: a.entrees.troncons.find(t => t.emetteur === `${cta.id}:${x.b}`).rep } };
      const ref = refs.find(r => r.couvre.has(x.b));
      if (ref) return { ...x, lien: { type: 'pid', pid: ref.pid, i: ref.i } };
      return { ...x, lien: null };
    });
  }
  // Batteries desservies par un circuit du schéma de principe, selon son régime (change-over : chaude et froide)
  function couvertParCircuit(etude, pid) {
    let ep; try { ep = resoudre(etude, pid).entrees; } catch (err) { ep = pid.entrees || {}; }
    if (ep.reseau === 'co') return new Set(['bc', 'bf']);
    const R = Sc.REGIMES[ep.reseau], fr = ep.reseau === 'perso' ? num(ep.Tdep) < num(ep.Tret) : R && R[1] < R[2];
    return new Set(fr ? ['bf'] : ['bc']);
  }
  // Nouvelle branche du réseau arborescent pour la batterie (sous le tronçon de départ) : puissance, débit et pertes de
  // charge de la batterie repris et verrouillés ; il reste la longueur. Rend le repère de la branche.
  function brancherSurArbo(etude, cta, arbo, cle) {
    const x = batteriesLibres(etude, cta, arbo).find(y => y.cle === cle); if (!x) return null;
    const tr = arbo.entrees.troncons = arbo.entrees.troncons || copie(N.defauts('arbo').troncons || []), reps = new Set(tr.map(t => String(t.rep || '').trim()));
    const racine = tr.find(t => String(t.rep || '').trim() && !String(t.amont || '').trim() && !t.emetteur);
    let rep = x.rep, k = 2; while (reps.has(rep)) rep = `${x.rep}-${k++}`;
    tr.push({ rep, amont: racine ? racine.rep : '', nom: x.nom, L: '', zeta: 5, tube: '', P: '', dpEm: '', emetteur: x.cle });
    return rep;
  }
  const repLibre = (cs, r, sauf) => { let x = r, k = 2; while (cs.some((c, j) => j !== sauf && String(c.rep || '').trim() === x)) x = `${r} (${k++})`; return x; };
  // Renomme un circuit du schéma et suit partout : terminaux et notes reliés (« id|repère »), robinetterie et pompes du
  // schéma, lois d'eau de la régulation, registre des équipements. Rend le repère retenu (unique dans le schéma).
  function renommerCircuit(etude, pid, i, nouveau) {
    const cs = (pid.entrees || {}).circuits || [], c = cs[i];
    if (!c) return null;
    const ancien = String(c.rep || '').trim(), rep = repLibre(cs, String(nouveau || '').trim() || ancien, i);
    if (!rep || rep === ancien) return ancien;
    c.rep = rep;
    const cleA = `${pid.id}|${ancien}`, cleN = `${pid.id}|${rep}`;
    const suivre = o => { if (Array.isArray(o)) o.forEach((v, k) => { if (v === cleA) o[k] = cleN; else if (v && typeof v === 'object') suivre(v); });
      else if (o && typeof o === 'object') Object.keys(o).forEach(k => { if (o[k] === cleA) o[k] = cleN; else if (o[k] && typeof o[k] === 'object') suivre(o[k]); }); };
    (etude.notes || []).forEach(n => suivre(n.entrees));
    ['robinetterie', 'pompesFab'].forEach(k => (pid.entrees[k] || []).forEach(x => { if (String(x.circuit || '').trim() === ancien) x.circuit = rep; }));
    (pid.entrees.ballons || []).forEach(x => { if (x.position === `circuit:${ancien}`) x.position = `circuit:${rep}`; });
    (etude.notes || []).filter(n => n.type === 'elec').forEach(n => ((n.entrees || {}).loisEau || []).forEach(x => { if (x.circuit === ancien) x.circuit = rep; }));
    (etude.equipements || []).forEach(x => { if (x.circuit === ancien) x.circuit = rep; });
    return rep;
  }
  // Tous les circuits qui alimentent une note (une CTA peut avoir sa batterie chaude sur le schéma chaud et sa batterie
  // froide sur le schéma froid)
  function circuitsDeAnnexe(notes, note) {
    return notes.filter(n => n.type === 'pid').flatMap(pid => ((pid.entrees || {}).circuits || []).map((c, i) => [c, i]).filter(([c]) => c && c.annexe === note.id).map(([, i]) => ({ pid, i })));
  }
  function lienHydro(etude, note, e, verrous, alertes, libelle, pile, amont) {
    const notes = (etude && etude.notes) || [];
    const imposer = (vals, lib) => Object.entries(vals).forEach(([k, v]) => { e[k] = v; verrous[k] = lib; });
    // Schéma : chaque circuit relié prend la puissance et les pertes de charge de son réseau annexe
    if (note.type === 'pid') {
      // Régimes des circuits (indépendants des réseaux annexes) : le réseau annexe est calculé au régime de son circuit
      let d0 = null;
      if ((e.circuits || []).some(c => c && c.annexe)) { try { d0 = Sc.dimensionner(e); } catch (err) { d0 = null; } }
      (e.circuits || []).forEach((c, i) => {
        if (!c.annexe) return;
        const src = notes.find(n => n.id === c.annexe && ANNEXES.includes(n.type)), rep = c.rep || `Circuit ${i + 1}`;
        if (!src) { alertes.push({ niveau: 'attention', texte: `${rep} : le réseau annexe relié a été supprimé, valeurs saisies conservées.` }); delete c.annexe; return; }
        // Schéma aval (sous-station, boucle secondaire) : puissance appelée (simultanéité comprise) et pertes de charge
        // côté primaire (échangeur, bouteille, collecteur) reprises ; ses propres circuits remontent par lui
        if (src.type === 'pid') {
          if (src.id === note.id || schemasAval(notes, src).has(note.id)) { alertes.push({ niveau: 'erreur', texte: `${rep} : liens circulaires entre schémas de principe (${libCycle(notes, src)}) — schéma aval ignoré.` }); return; }
          if (pile.has(src.id)) return; // schéma aval en cours de résolution (il remonte vers ce circuit)
          let ed, pa;
          try { ed = resoudre(etude, src, pile).entrees; pa = Sc.primaireAmont(ed, Sc.dimensionner(ed)); } catch (err) { return; }
          const lib = libelle(src), lock = k => { verrous[`circuits.${i}.${k}`] = lib; };
          if (!c.bilan) { c.P = Math.round(pa.P * 10) / 10; lock('P'); }
          if (e.reseau === 'co' && Number.isFinite(pa.Pf)) { c.Pf = Math.round(pa.Pf * 10) / 10; lock('Pf'); }
          c.dpAnnexe = Math.round(pa.dp * 10) / 10;
          if (c.emetteur !== 'sousstation') { c.emetteur = 'sousstation'; lock('emetteur'); }
          return;
        }
        const dc = d0 && d0.circuits[i], rc = dc && (dc.rc || dc.rcC), regime = rc && src.type !== 'cta' ? { fluide: e.fluide, T: Math.round((rc[0] + rc[1]) / 2 * 10) / 10, serie: e.serie, ...(src.type === 'arbo' ? { dT: Math.abs(rc[0] - rc[1]) } : {}) } : {};
        const lib = libelle(src), tr = src.type === 'arbo' ? { troncons: resoudre(etude, src, pile).entrees.troncons } : {}, v = N.calculer(src.type, { ...brut(src), ...tr, ...regime }).valeurs || {}, lock = k => { verrous[`circuits.${i}.${k}`] = lib; };
        if (src.type === 'cta') {
          const co = e.reseau === 'co', froid = (() => { const r = Sc.REGIMES[e.reseau]; return e.reseau === 'perso' ? num(e.Tdep) < num(e.Tret) : r && r[1] < r[2]; })();
          if (!c.bilan) { c.P = Math.round((co || !froid ? v.Pchaud : v.Pfroid) * 10) / 10; lock('P'); }
          if (co) { c.Pf = Math.round(v.Pfroid * 10) / 10; lock('Pf'); }
          if (c.emetteur !== 'cta') { c.emetteur = 'cta'; lock('emetteur'); }
          return;
        }
        // Réseau arborescent ou réseau et pompe : il décrit la distribution depuis le collecteur (longueur du circuit à 0)
        c.L = 0; lock('L');
        if (src.type === 'arbo') {
          c.dpAnnexe = Math.round(v.Hres / 100) / 10;
          if (!c.bilan) { c.P = Math.round(v.Ptot * 10) / 10; lock('P'); }
        } else {
          c.dpAnnexe = Math.round(v.dpTotal / 100) / 10;
          if (!c.bilan && v.Qpompe > 0 && d0) {
            const f = d0.f;
            c.P = Math.round(v.Qpompe / 3600 * f.rho * f.cp * Math.abs(rc[0] - rc[1]) / 100) / 10; lock('P');
          }
        }
      });
      if (!amont) return null;
      // Pression disponible au raccordement : hauteur de la pompe retenue du circuit amont (courbe du fabricant) au débit
      // appelé, moins les pertes de charge propres au circuit amont ; sans pompe retenue, la pompe du circuit est
      // dimensionnée sur les pertes de charge côté primaire de ce schéma
      let dispo = null, pa = null;
      try {
        pa = Sc.primaireAmont(e, Sc.dimensionner(e));
        const k = amont.ref.i, eu2 = { ...amont.eu, circuits: (amont.eu.circuits || []).map((x, j) => (j === k ? { ...x, P: Math.round(pa.P * 10) / 10, ...(Number.isFinite(pa.Pf) ? { Pf: Math.round(pa.Pf * 10) / 10 } : {}), dpAnnexe: pa.dp, emetteur: 'sousstation' } : x)) };
        const d2 = Sc.dimensionner(eu2), c2 = d2.circuits[k], kPa = h => h * d2.f.rho * 9.81 / 1000;
        dispo = c2.pf && Number.isFinite(c2.pf.Hpompe) ? kPa(c2.pf.Hpompe) - (kPa(c2.hmt) - c2.dpEm) : pa.dp;
      } catch (err) { dispo = null; }
      if (Number.isFinite(dispo)) { e.dpDispo = Math.round(dispo * 10) / 10; verrous.dpDispo = amont.lib; }
      return { note: amont.ref.pid, libelle: libelle(amont.ref.pid), texte: `Alimenté par le circuit « ${amont.rep} » de ${libelle(amont.ref.pid)} (${Sc.sousStation(e) || Sc.sourceBoucle(e) ? 'fluide et régime primaire' : 'fluide et régime'}, pression disponible repris) ; puissance appelée${pa ? ` (${nf(pa.P, 0)} kW)` : ''} et pertes de charge côté primaire${pa ? ` (${pa.libelle}, ${nf(pa.dp, 0)} kPa)` : ''} renvoyées au circuit, dont la pompe est dimensionnée en conséquence. Mise à jour automatique.` };
    }
    if (!ANNEXES.includes(note.type)) return null;
    if (note.type === 'cta') {
      const refs = circuitsDeAnnexe(notes, note), vus = [];
      refs.forEach(ref => {
        let d2; try { d2 = Sc.dimensionner(resoudre(etude, ref.pid, pile).entrees); } catch (err) { return; }
        const c2 = d2.circuits[ref.i]; if (!c2) return;
        const lib2 = `${libelle(ref.pid)} (circuit ${c2.rep})`, r2 = c2.rc || c2.rcC;
        if (c2.rcC) imposer({ TcAller: c2.rcC[0], TcRetour: c2.rcC[1], TfAller: c2.rcF[0], TfRetour: c2.rcF[1] }, lib2);
        else if (r2[0] > r2[1]) imposer({ TcAller: r2[0], TcRetour: r2[1] }, lib2);
        else imposer({ TfAller: r2[0], TfRetour: r2[1] }, lib2);
        vus.push(lib2);
      });
      if (!vus.length) return null;
      return { note: refs[0].pid, libelle: libelle(refs[0].pid), texte: `Batteries alimentées par ${vus.join(' et ')} : régimes d'eau repris ; puissances des batteries renvoyées aux circuits, dont les pompes sont dimensionnées en conséquence. Mise à jour automatique.` };
    }
    const ref = circuitDeAnnexe(notes, note);
    if (!ref) return null;
    const lib = libelle(ref.pid), es = resoudre(etude, ref.pid, pile).entrees;
    let d;
    try { d = Sc.dimensionner(es); } catch (err) { return null; }
    const c = d.circuits[ref.i];
    if (!c) return null;
    const rc = c.rc || c.rcC, Tm = Math.round((rc[0] + rc[1]) / 2 * 10) / 10, rep = c.rep;
    if (note.type === 'arbo') imposer({ fluide: es.fluide, T: Tm, dT: Math.abs(rc[0] - rc[1]), serie: es.serie, dpGen: Math.round((c.dpL + c.dpV + 5) * 10) / 10 }, lib);
    if (note.type === 'reseau') {
      imposer({ fluide: es.fluide, T: Tm, serie: es.serie, circuit: 'ferme' }, lib);
      const doublons = (e.composants || []).filter(x => /vanne de r[ée]gulation|g[ée]n[ée]rateur|[ée]changeur|chaudi[eè]re/i.test(x.nom || '') && num(x.dp) > 0);
      if (doublons.length) alertes.push({ niveau: 'attention', texte: `Déjà comptés par le circuit « ${rep} » du schéma (vanne de régulation, production) : ${doublons.map(x => x.nom).join(', ')} — à retirer des équipements de ce réseau.` });
    }
    if (note.type === 'cta') {
      if (c.rcC) imposer({ TcAller: c.rcC[0], TcRetour: c.rcC[1], TfAller: c.rcF[0], TfRetour: c.rcF[1] }, lib);
      else if (d.chaud) imposer({ TcAller: rc[0], TcRetour: rc[1] }, lib);
      else imposer({ TfAller: rc[0], TfRetour: rc[1], froid: 'oui' }, lib);
    }
    const quoi = note.type === 'cta' ? 'régime d\'eau des batteries' : note.type === 'arbo' ? 'fluide, régime, série de tubes et pertes de charge côté production' : 'fluide, température et série de tubes';
    return { note: ref.pid, libelle: lib, texte: `Alimenté par le circuit « ${rep} » de ${lib} (${quoi} repris) ; ${note.type === 'cta' ? 'puissances des batteries' : 'puissance et pertes de charge de ce réseau'} renvoyées au circuit, dont la pompe est dimensionnée en conséquence. Mise à jour automatique.` };
  }

  // Résultat d'une note dans son étude (entrées effectives, alertes de lien en tête)
  function calculer(etude, note) {
    const r = resoudre(etude, note), res = N.calculer(note.type, r.entrees);
    return r.alertes.length ? { ...res, alertes: [...r.alertes, ...res.alertes] } : res;
  }

  // Notes à créer depuis un schéma : réseau et pompe et vanne de chaque circuit, vase d'expansion ; renvoie les nouvelles notes
  function notesDepuisSchema(etude, pid, uid) {
    const es = resoudre(etude, pid).entrees, d = Sc.dimensionner(es), existe = (role, circuit) => etude.notes.some(n => n.lien && n.lien.note === pid.id && n.lien.role === role && n.lien.circuit === circuit);
    const nouvelles = [], cree = (type, role, circuit, titre, entrees) => { if (!existe(role, circuit)) nouvelles.push({ id: uid(), type, titre, entrees: { ...N.defauts(type), ...entrees }, commentaire: '', lien: { note: pid.id, role, circuit } }); };
    d.circuits.forEach((c, i) => {
      if ((es.circuits[i] || {}).annexe) return; // circuit déjà relié à un réseau annexe
      cree('reseau', 'reseau', i, `Réseau et pompe — ${c.rep}`, {
        vmax: es.vmax, Rmax: es.Rmax, marge: 10, rendement: 50,
        troncons: [{ rep: `${c.rep} — aller + retour`, Q: c.Q, tube: c.t.cle, L: c.L, zeta: 10 }],
        composants: [{ nom: c.em[0], dp: c.em[1] }, ...(c.reg === 'direct' ? [] : [{ nom: Sc.REGULATIONS[c.reg], dp: c.dpV }]), { nom: 'Vanne d\'équilibrage', dp: 5 }],
      });
      if (c.reg !== 'direct') cree('vanne', 'vanne', i, `Vanne de régulation — ${c.rep}`, { methode: 'autorite', dpCircuit: c.em[1], beta: 0.5 });
    });
    cree('vase', 'vase', -1, `Vase d'expansion — ${es.titreInstallation || 'installation'}`, { Tmin: Math.min(10, d.Td), Hst: 10, Psv: 3 });
    return nouvelles;
  }

  // Détache une note de ses sources : les valeurs reprises deviennent des valeurs saisies
  function detacher(etude, note) {
    const r = resoudre(etude, note), aval = note.type === 'pid' && circuitsDeAnnexe(etude.notes || [], note).length > 0;
    note.entrees = r.entrees;
    delete note.lien;
    if (note.entrees.cta) note.entrees.cta = '';
    // Réseau annexe détaché de son circuit ; schéma détaché de ses réseaux annexes (valeurs conservées)
    if (ANNEXES.includes(note.type)) circuitsDeAnnexe(etude.notes || [], note).forEach(ref => { ref.pid.entrees.circuits[ref.i] = { ...resoudre(etude, ref.pid).entrees.circuits[ref.i], annexe: '' }; });
    // Schéma aval : détaché de son circuit amont seulement (ses propres réseaux annexes et bilans restent reliés)
    if (aval) return;
    if (note.type === 'pid') (note.entrees.circuits || []).forEach(c => { delete c.annexe; });
    if (note.type === 'cta') reseauxDeCta(etude.notes || [], note).forEach(n => { n.entrees = resoudre(etude, n).entrees; n.entrees.cta = ''; });
    if (note.type === 'pid') (note.entrees.circuits || []).forEach(c => { delete c.bilan; });
  }
  const description = (etude, note) => {
    const r = resoudre(etude, note);
    if (!r.source) return '';
    if (r.source.texte) return r.source.texte;
    return `Données reprises de ${r.source.libelle}${r.source.circuit ? ` (circuit « ${r.source.circuit} »)` : ''} pour ce ${ROLES[note.lien.role] || 'calcul'} : mises à jour automatiquement.`;
  };
  // Fiches techniques de l'installation, vues depuis le schéma de principe ou le réseau arborescent : production,
  // terminaux et pompes (rattachés au circuit ou à une branche), CTA ; chaque ligne dit où charger la fiche
  function fichesInstallation(etude, note) {
    const notes = (etude && etude.notes) || [], out = [], vus = new Set(), lib = n => `N${notes.indexOf(n) + 1} — ${n.titre}`;
    const ficheDe = f => (f && (f.fabricant || f.reference || f.nom) ? f : null);
    const ajTerm = (n, a) => { const k = `${n.id}:${a.rep}`; if (vus.has(k)) return; vus.add(k); out.push({ element: `${a.rep}${a.local ? ` — ${a.local}` : ''}`, nature: (typeof Terminaux !== 'undefined' ? Terminaux : require('./terminaux')).TYPES[a.type] ? (typeof Terminaux !== 'undefined' ? Terminaux : require('./terminaux')).TYPES[a.type][0] : 'Équipement', fiche: ficheDe(a.fiche) || (a.ref ? { reference: a.ref } : null), note: n.id, rep: a.rep, ou: lib(n) }); };
    const ajNote = (n, nature) => { if (vus.has(n.id)) return; vus.add(n.id); out.push({ element: n.titre, nature, fiche: ficheDe((n.entrees || {}).fiche), note: n.id, ou: lib(n) }); };
    const terms = notes.filter(n => n.type === 'terminaux');
    if (note.type === 'pid') {
      ajNote(note, 'Production (générateur)');
      ((note.entrees || {}).pompesFab || []).forEach((p, i) => { if (p && p.circuit) out.push({ element: `Pompe — ${p.circuit}`, nature: 'Pompe de circuit (courbe)', fiche: ficheDe(p.fiche) || (p.ref ? { reference: p.ref } : null), note: note.id, pompe: i, ou: lib(note) }); });
      // Robinetterie et accessoires des circuits : une fiche par organe
      const RB = (typeof Schema !== 'undefined' ? Schema : require('./schema')).ROBINETTERIE;
      ((note.entrees || {}).robinetterie || []).forEach((r, i) => { if (r && r.type) out.push({ element: `${r.rep || `Organe ${i + 1}`}${r.circuit ? ` — ${r.circuit}` : ''}`, nature: (RB[r.type] || RB.autre)[0], type: r.type, fiche: ficheDe(r.fiche) || (r.ref ? { reference: r.ref } : null), note: note.id, robinet: i, ou: lib(note) }); });
      const reps = new Set(((note.entrees || {}).circuits || []).map(c => `${note.id}|${c.rep}`));
      ((note.entrees || {}).circuits || []).forEach(c => { const an = c.annexe && notes.find(n => n.id === c.annexe); if (an && an.type === 'cta') ajNote(an, 'CTA (batteries)'); if (an && an.type === 'arbo') (an.entrees.troncons || []).forEach(t => { if (t.pompe) { const [id, r] = String(t.pompe).split(':'); const tn = notes.find(n => n.id === id), a = tn && (tn.entrees.appareils || []).find(x => x.rep === r); if (a) ajTerm(tn, a); } }); });
      terms.forEach(n => (n.entrees.appareils || []).forEach(a => { if (reps.has(a.circuit)) ajTerm(n, a); }));
    } else if (note.type === 'aero') {
      const cta = notes.find(n => n.id === (note.entrees || {}).cta && n.type === 'cta');
      if (cta) ajNote(cta, 'CTA'); else out.push({ element: (note.entrees || {}).titreInstallation || note.titre, nature: 'Producteur (CTA, caisson)', fiche: ficheDe((note.entrees || {}).fiche), note: note.id, ou: lib(note) });
      ((note.entrees || {}).bouchesL || []).forEach((b, i) => { if (b && (b.rep || b.salle)) out.push({ element: `${b.rep || 'Bouche'}${b.salle ? ` — ${b.salle}` : ''}${b.etage ? ` (${b.etage})` : ''}`, nature: 'Bouche', fiche: ficheDe(b.fiche) || (b.ref ? { reference: b.ref } : null), note: note.id, bouche: i, ou: lib(note) }); });
    } else if (note.type === 'arbo') {
      const RBa = (typeof Schema !== 'undefined' ? Schema : require('./schema')).ROBINETTERIE;
      out.push({ element: 'Pompe du réseau', nature: 'Pompe (courbe du fabricant)', fiche: ficheDe((note.entrees || {}).pompeFiche) || ((note.entrees || {}).pompeRef ? { reference: note.entrees.pompeRef } : null), note: note.id, pompe: 'reseau', ou: lib(note) });
      ((note.entrees || {}).robinetterie || []).forEach((r, i) => { if (r && r.type) out.push({ element: `${r.rep || `Organe ${i + 1}`}${r.troncon ? ` — ${r.troncon}` : ''}`, nature: (RBa[r.type] || RBa.autre)[0], type: r.type, fiche: ficheDe(r.fiche) || (r.ref ? { reference: r.ref } : null), note: note.id, robinet: i, ou: lib(note) }); });
      const pid = notes.find(n => n.type === 'pid' && ((n.entrees || {}).circuits || []).some(c => c.annexe === note.id));
      if (pid) ajNote(pid, 'Production (générateur)');
      ((note.entrees || {}).troncons || []).forEach(t => [t.emetteur, t.pompe].filter(Boolean).forEach(cl => {
        const [id, r] = String(cl).split(':'), n = notes.find(x => x.id === id); if (!n) return;
        if (n.type === 'cta') ajNote(n, 'CTA (batteries)'); else { const a = (n.entrees.appareils || []).find(x => x.rep === r); if (a) ajTerm(n, a); }
      }));
    } else if (note.type === 'sanitaire') {
      const ecs = notes.find(n => n.id === (note.entrees || {}).production && n.type === 'ecs');
      if (ecs) ajNote(ecs, 'Production d\'ECS (ballon)');
      const A = (typeof Sanitaire !== 'undefined' ? Sanitaire : require('./sanitaire')).APPAREILS;
      ((note.entrees || {}).points || []).forEach((p, i) => { if (p && (p.rep || p.salle)) out.push({ element: `${p.rep || 'Point'}${p.salle ? ` — ${p.salle}` : ''}${p.etage ? ` (${p.etage})` : ''}`, nature: (A[p.type] || ['Point de puisage'])[0], fiche: ficheDe(p.fiche) || (p.ref ? { reference: p.ref } : null), note: note.id, point: i, ou: lib(note) }); });
    }
    // Fiche qui change le calcul (production, terminaux, CTA, bouches, organes à perte de charge) ou utile au seul DOE
    const OC = (typeof Schema !== 'undefined' ? Schema : require('./schema')).ORGANES_CALCUL;
    out.forEach(x => { x.calcul = x.robinet === undefined || OC.includes(x.type); });
    return out;
  }
  // Ce que changerait, calcul par calcul, l'application de données d'étude (climat, type de bâtiment…) :
  // [{ noteId, note, champ, libelle, avant, apres }] — entrées résolues avant / après, champs simples seulement
  function changementsEtude(etude, modifs) {
    const apres = { ...etude, ...modifs }, out = [], val = v => (v === undefined || v === null ? '' : typeof v === 'object' ? null : String(v));
    (etude.notes || []).forEach(n => {
      let a, b;
      try { a = resoudre(etude, n).entrees; b = resoudre(apres, n).entrees; } catch (e) { return; }
      const champs = ((N.TYPES[n.type] || {}).champs || []).filter(c => c.k && c.t !== 'lignes');
      champs.forEach(c => { const x = val(a[c.k]), y = val(b[c.k]); if (x === null || y === null || x === y) return;
        const lib = o => { const opts = typeof c.o === 'function' ? (() => { try { return c.o(b, apres); } catch (e) { return []; } })() : c.o; const m = (opts || []).find(([k]) => String(k) === o); return m ? m[1] : o === '' ? '—' : `${o}${c.u ? ` ${c.u}` : ''}`; };
        out.push({ noteId: n.id, note: n.titre || n.type, champ: c.k, libelle: c.l, avant: lib(x), apres: lib(y) }); });
    });
    return out;
  }
  return { fichesInstallation, resoudre, calculer, changementsEtude, notesDepuisSchema, detacher, description, reseauxDeCta, circuitDeAnnexe, circuitsDeAnnexe, relierAuSchema, renommerCircuit, schemasAval, cycleSchema, chaineAmont, ANNEXES, arbosDeCta, batteriesLibres, brancherSurArbo, batteriesCta, couvertParCircuit, nf,
    climatEtude, climatDeVille, TYPES_BATIMENT, CHAMPS_ETUDE, champEtude, typeBatimentEtude, gtbPid, COMBUSTION, optPid, optCircuits, optTroncons };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'), typeof Schema !== 'undefined' ? Schema : require('./schema'));
if (typeof module !== 'undefined') module.exports = Liens;
