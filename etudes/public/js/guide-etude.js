// Guide pas à pas de l'étude : « Reste à faire » de l'import du dossier de consultation (CCTP / DPGF) jusqu'à
// l'exploitation, rangé en phases — Étude (données, dossier, calculs, bilans, valeurs à confirmer, raccordements,
// cohérence, fiches, régulation, électricité, calculs annexes suggérés par le dossier, réserves, émission, envoi au
// chantier), Achats (gammes, validation du matériel, consultations et devis, commandes et livraisons), Chantier (pose,
// plaques signalétiques, réserves), Mise en service (fiches, écarts mesurés et réglages), Réception, DOE, Exploitation
// (contrat d'entretien, relevés de compteurs, dérives et fuites). Chaque étape a un identifiant stable, une phase, une
// action qui mène au bon écran, d'éventuelles dépendances (bloquePar / dependDe) et un motif de blocage ; les étapes
// restantes sont triées par impact (étapes et calculs qui en dépendent, gravité) puis par ordre logique ; l'étape
// suivante est la plus impactante non bloquée. Les étapes simples se corrigent sur place (éditeur en ligne).
// restesAFaire(et, { chantier, aujourdhui }) est une fonction pure (testée sous Node) ; les données du chantier
// (Pipe-Fit : mises en service, équilibrages, réserves, suivi du matériel et des achats) sont lues côté navigateur de
// façon asynchrone (cache), sans bloquer l'affichage. Suivi des étapes (responsable, échéance, sans objet,
// historique) : module facultatif SuiviEtapes (suivi-etapes.js), appelé s'il est chargé.
const GuideEtude = (() => {
  const essai = f => { try { return f(); } catch (e) { return null; } };
  const M = (g, chemin) => () => essai(g) || essai(() => require(chemin));
  const Nt = M(() => Notes, './notes'), Ln = M(() => Liens, './liens'), In = M(() => Installation, './installation'), Rg = M(() => Registre, './registre');
  const Cp = M(() => ConsignesProjet, './consignes-projet'), Ic = M(() => InventaireCVC, '../../../public/js/inventaire-cvc'), Es = M(() => Estimations, './estimations');
  const Ax = M(() => AnnexesExploitation, './annexes-exploitation'), Ct = M(() => ControleEtude, './controle-etude'), Mt = M(() => Metre, './metre');
  const Mr = M(() => MaterielRetenu, '../../../public/js/materiel-retenu'), Rp = M(() => Reperes, './reperes'), Rv = M(() => Revisions, './revisions');
  const Fm = M(() => FichesMes, './fiches-mes'), Mres = M(() => MesuresRetour, './mesures-retour'), Pq = M(() => PlaqueRegistre, '../../../public/js/plaque-registre');
  const Cg = M(() => Comptages, './comptages'), Ess = M(() => Essais, '../../../public/js/essais'), Pl = M(() => PlanningEtude, '../../../public/js/planning-etude');
  const Sv = () => (typeof SuiviEtapes !== 'undefined' ? SuiviEtapes : null);
  const num = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const vide = v => v === '' || v === undefined || v === null;
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, '\'');
  const libNote = (et, n) => `N${(et.notes || []).indexOf(n) + 1} — ${n.titre || n.type}`;
  const liste = (l, k = 3) => `${l.slice(0, k).join(', ')}${l.length > k ? ` et ${l.length - k} autre(s)` : ''}`;
  const plusMois = (iso, n) => { if (!iso) return ''; const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`); if (Number.isNaN(d.getTime())) return ''; const j = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(Math.min(j, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.toISOString().slice(0, 10); };
  const dateFrG = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

  // Phases, dans l'ordre d'une affaire
  const PHASES = [['etude', '📐', 'Étude'], ['achats', '🛒', 'Achats'], ['chantier', '🏗️', 'Chantier'], ['mes', '🔧', 'Mise en service'], ['reception', '🤝', 'Réception'], ['doe', '📚', 'DOE'], ['exploitation', '♻️', 'Exploitation']];
  // Groupes : [clé, icône, libellé, phase, impact de base], dans l'ordre logique
  const GROUPES = [['donnees', '🏢', 'Données de l\'étude', 'etude', 8], ['dossier', '📑', 'Dossier de consultation', 'etude', 4], ['calculs', '🧮', 'Calculs à créer', 'etude', 7], ['bilans', '🌡️', 'Bilans', 'etude', 4],
    ['valeurs', '✏️', 'Valeurs à confirmer', 'etude', 3], ['estimees', '📐', 'Valeurs estimées à confirmer', 'etude', 3], ['verifier', '🔎', 'Valeurs reprises à vérifier', 'etude', 2], ['raccordement', '🌀', 'Raccordements', 'etude', 4],
    ['coherence', '🔀', 'Cohérence de l\'étude', 'etude', 4], ['fiches', '📄', 'Fiches techniques', 'etude', 2], ['regulation', '🎛️', 'Régulation', 'etude', 3], ['electricite', '⚡', 'Électricité', 'etude', 2],
    ['annexes', '🗂️', 'Calculs annexes suggérés par le dossier', 'etude', 3], ['conformite', '🛡️', 'Réserves de conformité', 'etude', 2], ['emission', '📨', 'Émission des notes', 'etude', 2], ['chantier', '🏗️', 'Envoi au chantier', 'etude', 1],
    ['gammes', '📚', 'Gammes : modèle à choisir', 'achats', 4], ['validation', '🏷️', 'Validation du matériel', 'achats', 4], ['consultation', '🛒', 'Consultations et devis', 'achats', 3], ['commandes', '🧾', 'Commandes et livraisons', 'achats', 3],
    ['pose', '🔧', 'Pose du matériel', 'chantier', 2], ['plaques', '🏷️', 'Plaques signalétiques', 'chantier', 3], ['reserves', '🛡️', 'Réserves sur le chantier', 'chantier', 3],
    ['fichesMes', '📋', 'Fiches de mise en service', 'mes', 3], ['reglages', '📏', 'Mesures et réglages', 'mes', 4],
    ['reception', '🤝', 'Réception des travaux', 'reception', 3], ['doe', '📚', 'Dossier des ouvrages exécutés', 'doe', 2],
    ['contrat', '🔧', 'Contrat d\'entretien', 'exploitation', 3], ['comptages', '📈', 'Comptages et consommations', 'exploitation', 3]];
  const GROUPE = Object.fromEntries(GROUPES.map(([k, i, l, p, b], r) => [k, { ico: i, libelle: l, phase: p, base: b, rang: r }]));
  const PHASE = Object.fromEntries(PHASES.map(([k, i, l], r) => [k, { ico: i, libelle: l, rang: r }]));

  // Lignes « à saisir » d'un calcul (liste, colonne de puissance ou de débit vide) : circuits, terminaux, zones, générateurs
  const COLONNES_CLES = { pid: [['circuits', ['P'], 'Puissance du circuit'], ['generateurs', ['P'], 'Puissance du générateur']], terminaux: [['appareils', ['Pch', 'Pfr'], 'Puissance du terminal']],
    aero: [['zones', ['Q'], 'Débit de la zone']], elec: [['equipements', ['P'], 'Puissance électrique']] };
  // Valeurs vides (un champ qui a une valeur par défaut mais qu'on a vidé) et valeurs restées par défaut d'un calcul ;
  // avec l'étude : valeurs reprises d'un autre calcul (terminaux reliés, réseau annexe, bilan…) ni vides ni à confirmer.
  // champs : de quoi corriger sur place — { chemin, libelle, unite, valeur, defaut, vide }
  function valeursNote(n, et) {
    const N = Nt(), T = N && N.TYPES[n.type];
    if (!T) return { vides: [], defauts: [], champs: [] };
    const L = et ? Ln() : null, r = L ? essai(() => L.resoudre(et, n)) : null, v = (r && r.verrous) || {};
    const e = (r && r.entrees) || n.entrees || {}, vides = [], defauts = [], champs = [];
    (T.champs || []).forEach(c => {
      if (!c.k || c.t === 'lignes' || c.t === 'cases' || !c.u || v[c.k]) return;
      if (c.si && !essai(() => c.si(e))) return;
      if (c.d === undefined || vide(c.d)) return;
      if (vide(e[c.k])) { vides.push(c.l); champs.push({ chemin: c.k, libelle: c.l, unite: c.u, valeur: '', defaut: c.d, vide: true }); }
      else if (num(e[c.k]) === num(c.d)) { defauts.push(c.l); champs.push({ chemin: c.k, libelle: c.l, unite: c.u, valeur: e[c.k], defaut: c.d, vide: false }); }
    });
    (COLONNES_CLES[n.type] || []).forEach(([k, cols, lib]) => (e[k] || []).forEach((l, i) => {
      if (l && cols.every(c => vide(l[c]) && !v[`${k}.${i}.${c}`])) {
        const nom = `${lib} « ${l.rep || l.designation || i + 1} »`;
        vides.push(nom);
        cols.forEach(c => champs.push({ chemin: `${k}.${i}.${c}`, libelle: cols.length > 1 ? `${nom} (${c})` : nom, unite: '', valeur: '', defaut: '', vide: true }));
      }
    }));
    return { vides, defauts, champs };
  }

  // Calculs annexes suggérés par le dossier de consultation : [type, libellé, expression cherchée dans le texte]
  const SUGGESTIONS = [
    ['hotte', 'Hotte de cuisine professionnelle', /hottes? (de |d')?(cuisine|professionnelle|extraction cuisine)|cuisine (professionnelle|collective|centrale)|plafond filtrant|hotte a induction/],
    ['parking', 'Ventilation de parking', /\bparkings?\b|parc de stationnement|garage (collectif|souterrain)/],
    ['piscine', 'Piscine : évaporation et déshumidification', /piscine|bassin (de natation|ludique)|centre aquatique|halle aquatique/],
    ['chambreFroide', 'Bilan d\'une chambre froide', /chambres? froides?|chambres? (positive|negative)s?\b|cellule de refroidissement/],
    ['legionelle', 'Anti-légionelle et bouclage d\'ECS', /bouclage|legionell|ecs collective|production (collective|centralisee) d'(eau chaude sanitaire|ecs)|retour de boucle|boucle d'ecs/],
    ['drv', 'Détente directe DRV / VRF', /\bdrv\b|\bvrv\b|\bvrf\b|debit de refrigerant variable|volume de refrigerant variable/],
    ['geothermie', 'PAC sur sondes géothermiques', /geotherm|sondes? (geothermiques?|verticales?)|champ de sondes|pac sur nappe/],
    ['solaireEcs', 'Solaire thermique ECS', /solaire thermique|capteurs? solaires?|chauffe-eau solaire|\bcesi\b|\bcesc\b|panneaux solaires thermiques/],
    ['eauxDePluie', 'Récupération des eaux de pluie', /recuperation (des )?eaux? (de pluie|pluviales)|cuve de recuperation|reutilisation des eaux de pluie/],
    ['eauxPluviales', 'Eaux pluviales (descentes, collecteurs)', /descentes? (d'eaux pluviales|ep)\b|evacuation des eaux pluviales|gouttieres?/],
    ['chaufferie', 'Classement de chaufferie', /chaufferie|local chaudieres?/],
    ['conduitFumee', 'Conduit de fumée', /conduits? de fumees?|evacuation des produits de combustion|ventouse|tubage/],
    ['plancher', 'Plancher chauffant / rafraîchissant', /plancher (chauffant|rafraichissant|rayonnant|chauffant-rafraichissant)/],
    ['plafonds', 'Plafonds rayonnants / poutres froides', /plafonds? (rafraichissants?|rayonnants?|froids?|climatiques?)|poutres? (froides?|climatiques?)/],
    ['puitsCanadien', 'Puits canadien / géocooling', /puits (canadien|provencal|climatique)|geocooling/],
    ['traitementEau', 'Traitement d\'eau et désembouage', /traitement (d'eau|de l'eau)|desembouage|desemboueur|adoucisseur|pot a boues|inhibiteur de corrosion/],
    ['echangeurPlaques', 'Échangeur à plaques', /echangeurs? a plaques/],
    ['radiateurs', 'Sélection de radiateurs', /\bradiateurs?\b/],
    ['airNeuf', 'Débits d\'air neuf réglementaires', /\bair neuf\b/],
  ];
  // Genres de l'inventaire qui appellent le calcul annexe, sans mot-clé
  const PAR_GENRE = { plancher: ['plancher'], plafonds: ['plafond'], radiateurs: ['radiateurs'], echangeurPlaques: ['echangeur'], airNeuf: ['cta'], conduitFumee: ['chaudiere-gaz', 'chaudiere-fioul', 'chaudiere-bois'] };
  // Potentiel de réchauffement global (GWP, AR4) des fluides usuels, pour le seuil de 5 t éq. CO₂ (F-gaz)
  const GWP = { r32: 675, r410a: 2088, r407c: 1774, r134a: 1430, r404a: 3922, r513a: 631, r454b: 466, r454c: 148, r290: 3, r744: 1, r1234ze: 7, r1234yf: 4, r449a: 1397, r452a: 2140, r22: 1810, r407f: 1825, r448a: 1387 };
  const SEUIL_FGAZ = 5;
  function suggestionsAnnexes(et) {
    const inv = ((et && et.inventaire) || []).filter(x => x && x.inclus !== false && !x.variante);
    const textes = [...inv.map(x => ({ t: norm([x.designation, x.prescrit, x.chapitre, x._texte, x.repere].filter(Boolean).join(' ')), lib: x.designation || x.repere || '', src: (x.sources || [])[0] || 'inventaire', x })),
      ...((et && et.inventaireReseaux) || []).map(r => ({ t: norm(r.nom), lib: r.nom, src: (r.sources || [])[0] || 'réseaux du dossier' })),
      ...[et && et.objet, et && et.description].filter(Boolean).map(t => ({ t: norm(t), lib: String(t).slice(0, 80), src: 'fiche de l\'étude' }))];
    const out = [];
    SUGGESTIONS.forEach(([type, lib, re]) => {
      const g = PAR_GENRE[type] || [], t = textes.find(y => re.test(y.t)) || textes.find(y => y.x && g.includes(y.x.genre));
      if (type === 'chaufferie') {
        const P = inv.filter(x => /^chaudiere/.test(x.genre || '')).reduce((s, x) => s + (num(x.P) || 0) * Math.max(1, num(x.qte) || 1), 0);
        if (!t && P < 70) return;
        if (t || P >= 70) out.push({ type, libelle: lib, detail: t ? `« ${t.lib.slice(0, 80)} » (${t.src})` : `chaudières : ${Math.round(P)} kW au total (≥ 70 kW)` });
        return;
      }
      if (t) out.push({ type, libelle: lib, detail: `« ${t.lib.slice(0, 80)} » (${t.src})` });
    });
    // Fluides frigorigènes : charge lue au dossier au-dessus du seuil F-gaz, ou machines frigorifiques sans charge connue
    let charge = null;
    textes.forEach(y => {
      const re = /(\d+(?:[.,]\d+)?)\s*kg\b[^.;]{0,40}?\b(r\s?-?\d{2,4}[a-z]?)\b|\b(r\s?-?\d{2,4}[a-z]?)\b[^.;]{0,40}?(\d+(?:[.,]\d+)?)\s*kg\b/g;
      let m; while ((m = re.exec(y.t))) {
        const kg = num(m[1] || m[4]), f = String(m[2] || m[3]).replace(/[\s-]/g, ''), gwp = GWP[f];
        if (kg > 0 && gwp) { const t = kg * gwp / 1000; if (!charge || t > charge.t) charge = { kg, f: f.toUpperCase(), t, lib: y.lib, src: y.src }; }
      }
    });
    const frigo = inv.filter(x => ['split', 'gf-air', 'pac-air', 'pac-rev', 'pac-eau', 'gf-eau'].includes(x.genre));
    if (charge && charge.t >= SEUIL_FGAZ) out.push({ type: 'fluides', libelle: 'Fluides frigorigènes (F-gaz)', detail: `${String(charge.kg).replace('.', ',')} kg de ${charge.f} ≈ ${String(Math.round(charge.t * 10) / 10).replace('.', ',')} t éq. CO₂ (seuil ${SEUIL_FGAZ} t) — ${charge.src}` });
    else if (!charge && frigo.length) out.push({ type: 'fluides', libelle: 'Fluides frigorigènes (F-gaz)', detail: `${frigo.length} machine(s) frigorifique(s) au dossier (${liste(frigo.map(x => x.designation || x.genre), 2)}) : charge à comparer au seuil de ${SEUIL_FGAZ} t éq. CO₂` });
    return out;
  }

  // Fiche de mise en service remplie : PV du chantier signé pour le même équipement (repère, sinon titre)
  const memeEquipement = (m, f) => {
    const r = norm(f.repere).replace(/[^a-z0-9]/g, ''), rm = norm(m.repere).replace(/[^a-z0-9]/g, '');
    if (r && rm) return r === rm;
    const a = norm(m.equipement).replace(/[^a-z0-9]+/g, ' ').trim(), b = norm(f.titre).replace(/[^a-z0-9]+/g, ' ').trim();
    return !!(a && b && (a.includes(b) || b.includes(a)));
  };
  // Ordre de mise en service : production, distribution, puis émetteurs, régulation
  const AVANT_MES = { terminal: ['pac', 'chaudiere', 'pompes'], reseau: ['pac', 'chaudiere', 'pompes'], bouche: ['cta', 'vmc'], gtb: ['pac', 'chaudiere', 'pompes', 'cta', 'vmc'] };

  // Contrôle global (controle-etude.js) : points bloquants, mémorisés par étude ; le contrôle relit le guide
  // (appel réentrant : seule la phase Étude est alors construite)
  let enControle = false;
  const memoControle = new Map();
  function bloquantsControle(et) {
    const C = Ct(); if (!C || !C.controler) return [];
    const sig = essai(() => JSON.stringify([et.notes, et.materiel, et.equipements, et.inventaire, et.reservesConformite, et.climat, et.typeBatiment, et.consequences]));
    const m = memoControle.get(et.id);
    if (sig && m && m.sig === sig) return m.points;
    enControle = true;
    let points = [];
    try { points = (essai(() => C.controler(et)) || []).filter(p => p.gravite === 'erreur'); } finally { enControle = false; }
    if (sig) memoControle.set(et.id, { sig, points });
    return points;
  }

  // Étapes : { id, phase, groupe, titre, info, fait, action: [code, libellé], confirmer?, libConfirmer?, signature?,
  //   bloquePar?: [id], bloque?: { motif, action }, dependDe?: [id], poids?, gravite?, editeur? }
  function construire(et, opts = {}) {
    const notes = (et && et.notes) || [], inv = ((et && et.inventaire) || []).filter(x => x.inclus !== false && !x.variante), out = [];
    const a = (groupe, id, titre, fait, info, action, extra = {}) => { const s = { id, phase: GROUPE[groupe].phase, groupe, titre, fait: !!fait, info: info || '', action: action || null, ...extra }; out.push(s); return s; };
    const aType = t => notes.some(n => n.type === t);
    const N0 = Nt(), auj = opts.aujourdhui || new Date().toISOString().slice(0, 10), reentrant = enControle;
    // Confirmations à la main (« C'est fait ») : et.guideFaits[id] = { le, sig } ; une nouvelle signature rouvre l'étape
    const confirme = (id, sig = '') => { const f = ((et && et.guideFaits) || {})[id]; return !!(f && String(f.sig || '') === String(sig)); };
    const manuel = (id, sig, lib = '✓ C\'est fait') => ({ confirmer: `fait:${id}`, libConfirmer: lib, signature: String(sig || '') });

    // 1. Données de l'étude
    a('donnees', 'climat', 'Climat du site', et.climat, et.climat ? 'Températures de base reprises dans les calculs' : 'Températures extérieures de base des bilans, CTA et lois d\'eau', ['champ:climat', '🌡️ Choisir le climat'], { poids: notes.length, editeur: { type: 'climat' } });
    a('donnees', 'typeBatiment', 'Type de bâtiment', et.typeBatiment, et.typeBatiment ? 'Usage repris par les calculs et la régulation' : 'Usage, consignes et horaires types, réglementation', ['champ:typeBatiment', '🏢 Choisir le type'], { poids: notes.length, editeur: { type: 'typeBatiment' } });

    // 2. Dossier de consultation : import, écarts entre le CCTP et le DPGF
    if (inv.length || !notes.length) a('dossier', 'import', 'Lire le CCTP et le DPGF', inv.length, inv.length ? `${inv.length} équipement(s) à l'inventaire` : 'Équipements, réseaux et caractéristiques repris du dossier', ['inventaire', '📑 Lire le dossier']);
    const ecarts = (et.inventaireEcarts || []).length;
    if (ecarts) a('dossier', 'ecarts', 'Lever les écarts CCTP / DPGF', et.inventaireEcartsTraites, `${ecarts} écart(s) : questions à poser pendant la consultation`, ['inventaire-revoir', '❓ Voir les écarts']);
    // Questions au maître d'œuvre (écarts et caractéristiques manquantes) : faites quand toutes sont posées
    const qm = typeof Dce !== 'undefined' && inv.length ? Dce.avecSuivi(Dce.questions(et.inventaireEcarts || [], et.inventaire || []), et.questionsMoe) : [];
    if (qm.length) { const p = qm.filter(q => q.posee || q.recue).length, r = qm.filter(q => q.recue).length; a('dossier', 'questions-moe', 'Questions au maître d\'œuvre', p === qm.length, `${qm.length} question(s) : ${p} posée(s), ${r} réponse(s) reçue(s)`, ['questions-moe', '❓ Préparer les questions']); }

    // 3. Calculs à créer d'après l'inventaire
    const creer = [];
    if (inv.length) {
      const G = g => inv.some(x => g.includes(x.genre));
      // Émetteurs à eau (un tube radiant gaz, un radiateur électrique ne demandent pas de schéma hydraulique)
      const eau = inv.some(x => ['radiateurs', 'plancher', 'radiant', 'plafond'].includes(x.genre) && !x.horsSchema);
      // Tout en un clic : calculs, réseaux, raccordements et estimations (etude-auto.js)
      const attendus = [inv.some(x => x.categorie === 'producteur') || eau ? 'pid' : '', G(['cta', 'bouche-soufflage', 'bouche-extraction', 'ventilateur']) ? (aType('aero') ? 'aero' : 'cta') : '',
        G(['ventilo', 'split', 'aerotherme']) ? 'terminaux' : '', G(['sanitaire']) ? 'sanitaire' : ''].filter(Boolean), manquants = attendus.filter(t => !aType(t));
      // (bouton « ⚡ Créer toute l'étude » sur chaque calcul à créer)
      const tout = manquants.length ? { tout: ['creer-tout', '⚡ Créer toute l\'étude'] } : {};
      if (inv.some(x => x.categorie === 'producteur') || eau) creer.push(a('calculs', 'creer-pid', 'Schéma de principe', aType('pid'), aType('pid') ? 'Créé' : 'Production, circuits, ballons et montages repris du dossier', ['creer:pid', '🗺️ Créer le schéma'], tout));
      if (G(['cta', 'bouche-soufflage', 'bouche-extraction', 'ventilateur'])) creer.push(a('calculs', 'creer-aero', 'Schéma aéraulique et CTA', aType('aero') || aType('cta'), aType('aero') || aType('cta') ? 'Créé' : 'Batteries, récupérateur, débits et bouches repris du dossier', ['creer:aero', '🌬️ Créer'], tout));
      if (G(['ventilo', 'split', 'aerotherme'])) creer.push(a('calculs', 'creer-terminaux', 'Terminaux', aType('terminaux'), aType('terminaux') ? 'Créés' : 'Type, puissances, batterie et vanne de chaque terminal', ['creer:terminaux', '🌀 Créer les terminaux'], tout));
    }

    // 4. Bilans : les puissances des circuits et des terminaux doivent être justifiées (températures de base du climat)
    if (notes.some(n => ['pid', 'terminaux', 'cta', 'arbo'].includes(n.type)) || inv.length) {
      const bil = notes.filter(n => ['bilan', 'batiment', 'pieces'].includes(n.type));
      a('bilans', 'bilans', 'Bilans thermiques', bil.length, bil.length ? `${bil.length} bilan(s)` : 'Puissances reprises du dossier à justifier (déperditions, apports)', ['ajout:pieces', '🌡️ Faire le bilan pièce par pièce'], { dependDe: ['climat'] });
    }

    // 5. Valeurs vides ou restées par défaut dans chaque calcul (corrigées sur place)
    notes.forEach(n => {
      const { vides, defauts, champs } = valeursNote(n, et);
      if (!vides.length && !defauts.length) return;
      const l = [...vides.map(x => `${x} (vide)`), ...defauts].slice(0, 4).join(', '), reste = vides.length + defauts.length - 4;
      a('valeurs', `valeurs:${n.id}`, `Confirmer les valeurs de ${libNote(et, n)}`, !vides.length && (!defauts.length || n.defautsConfirmes),
        `${vides.length ? `${vides.length} vide(s)` : ''}${vides.length && defauts.length ? ', ' : ''}${defauts.length ? `${defauts.length} par défaut` : ''} : ${l}${reste > 0 ? ` et ${reste} autre(s)` : ''}`,
        [`note:${n.id}`, '✏️ Ouvrir le calcul'], { ...(vides.length ? {} : { confirmer: `confirmer:${n.id}` }), editeur: { type: 'valeurs', note: n.id, champs: champs.slice(0, 8), autres: Math.max(0, champs.length - 8) } });
    });

    // 5 bis. Valeurs estimées (ratios, surfaces) : à confirmer ou à remplacer par une valeur réelle ; zones sans surface
    const E = Es();
    if (E) {
      const parNote = new Map();
      (essai(() => E.enPlace(et)) || []).forEach(x => { const l = parNote.get(x.note) || []; l.push(x); parNote.set(x.note, l); });
      parNote.forEach((l, id) => {
        const n = notes.find(y => y.id === id); if (!n) return;
        a('estimees', `estimees:${id}`, `Confirmer les valeurs estimées de ${libNote(et, n)}`, false, `${l.length} valeur(s) estimée(s) — à confirmer : ${l.slice(0, 3).map(x => `${x.libelle} = ${x.v} (${x.origine})`).join(' ; ')}${l.length > 3 ? ` et ${l.length - 3} autre(s)` : ''}`,
          [`note:${id}`, '✏️ Ouvrir le calcul'], { confirmer: `confirmer-estimes:${id}`, editeur: { type: 'estimees', note: id, champs: l.slice(0, 8).map(x => ({ chemin: x.cle, libelle: x.libelle, valeur: x.v, origine: x.origine })), autres: Math.max(0, l.length - 8) } });
      });
      const m = notes.length ? (essai(() => E.appliquer(et, { simulation: true })) || {}).manquantes || [] : [];
      if (m.length) a('estimees', 'surfaces', 'Surfaces des zones', false, `${m.length} zone(s) sans surface : ${m.slice(0, 3).map(z => z.nom).join(', ')}${m.length > 3 ? '…' : ''} — puissances ou débits manquants à estimer`, ['surfaces', '📐 Saisir les surfaces'], { poids: m.length });
    }

    // 6. Valeurs reprises du dossier avec une faible confiance (conflit CCTP / DPGF, valeur déduite) : à vérifier, source citée
    const I = Ic();
    if (I && I.aVerifier) {
      const lots = (et.inventaire || []).filter(x => x.inclus !== false && !x.variante).map(x => [x, I.aVerifier(x)]).filter(([, v]) => v.length);
      lots.forEach(([x, v], k) => {
        if (k >= 8) return;
        a('verifier', `verifier:${x.id || k}`, `Vérifier ${x.repere ? `${x.repere} ` : ''}${x.designation}`, x.verifie, v.slice(0, 3).map(y => `${y.libelle} : ${y.texte}`).join(' ; ') + (v.length > 3 ? ` (+${v.length - 3})` : ''),
          ['inventaire-revoir', '🔎 Vérifier dans l\'inventaire'], { source: v.map(y => y.texte).join(' ; ') });
      });
      if (lots.length > 8) a('verifier', 'verifier:autres', `Vérifier ${lots.length - 8} autre(s) équipement(s)`, lots.slice(8).every(([x]) => x.verifie), 'Valeurs reprises avec une faible confiance', ['inventaire-revoir', '🔎 Ouvrir l\'inventaire']);
    }

    // 7. Raccordements : consommateurs d'eau non raccordés, incohérences de l'installation, erreurs des calculs
    const Ins = In();
    if (Ins && notes.some(n => ['pid', 'arbo', 'terminaux', 'cta', 'ecs'].includes(n.type))) {
      const cs = essai(() => Ins.consommateurs(et)) || [], libres = cs.filter(c => !(c.raccordements || []).length);
      a('raccordement', 'raccordes', 'Raccorder chaque consommateur', !libres.length, libres.length ? `${libres.length} non raccordé(s) : ${libres.slice(0, 3).map(c => c.libelle).join(', ')}${libres.length > 3 ? '…' : ''}` : `${cs.length} consommateur(s), tous raccordés`, ['installation', '💧 Installation hydraulique'], { poids: libres.length });
      const err = (essai(() => Ins.controles(et, cs)) || []).filter(c => c.niveau === 'erreur');
      if (err.length) a('raccordement', 'installation-erreurs', 'Corriger l\'installation', false, err.slice(0, 2).map(c => c.texte).join(' ; '), ['installation', '💧 Voir les contrôles'], { gravite: 2 });
    }
    const L = Ln();
    if (L && notes.length) {
      let erreurs = 0, premiere = null;
      notes.forEach(n => { const k = (essai(() => L.calculer(et, n).alertes) || []).filter(x => x.niveau === 'erreur').length; erreurs += k; if (k && !premiere) premiere = n; });
      a('raccordement', 'erreurs', 'Calculs sans erreur', !erreurs, erreurs ? `${erreurs} erreur(s), d'abord dans ${libNote(et, premiere)}` : 'Tous les calculs sont cohérents', premiere ? [`note:${premiere.id}`, '➡️ Voir l\'erreur'] : null, { poids: erreurs });
    }

    // 7 bis. Cohérence : conflits de repères (même repère pour deux équipements…), conséquences d'un changement depuis l'état émis
    const RP = reentrant ? null : Rp();
    if (RP && notes.length) {
      const conf = (essai(() => RP.table(et, { gtb: false, mes: false, metre: false })) || {}).conflits || [], vus = new Set();
      conf.forEach(c => {
        let id = `coherence:repere:${c.nature}:${c.rep}`, k = 2; while (vus.has(id)) id = `coherence:repere:${c.nature}:${c.rep}#${k++}`; vus.add(id);
        a('coherence', id, `Conflit de repère ${c.rep}`, false, c.texte, [`reperes:${c.rep}`, '🔢 Table des repères'], { gravite: c.nature === 'doublon' ? 2 : 1 });
      });
    }
    const cons = ((et && et.consequences) || []).filter(x => x && x.statut === 'ouvert');
    if (cons.length) {
      const CAT = (Rv() || {}).CATEGORIES || {};
      [...new Set(cons.map(x => x.categorie))].forEach(cat => {
        const l = cons.filter(x => x.categorie === cat);
        a('coherence', `coherence:consequences:${cat}`, `Conséquences du changement : ${(CAT[cat] || cat || 'à traiter').replace(/^./, c => c.toLowerCase())}`, false, `${l.length} à traiter depuis l'état émis : ${liste(l.map(x => x.titre))}`, ['consequences', '🔁 Conséquences du changement'], { poids: l.length, gravite: ['materiel', 'commande', 'mes'].includes(cat) ? 2 : 1 });
      });
    }

    // 8. Fiches techniques : registre des équipements, gros équipements de l'inventaire sans fiche
    const R = Rg();
    if (R && notes.length) {
      const b = essai(() => R.bilan(et)) || [], libres = b.filter(y => !y.emplacements.length).length;
      const gros = inv.filter(x => x.categorie === 'producteur' || x.genre === 'cta').reduce((s, x) => s + Math.max(1, Math.round(num(x.qte) || 1)), 0);
      const fichesGros = b.filter(y => ['generateur', 'cta'].includes(y.x.type)).length, manque = Math.max(0, gros - fichesGros);
      a('fiches', 'fiches', 'Fiches techniques du matériel', b.length && !manque, b.length ? `${b.length} modèle(s) au registre${manque ? ` ; ${manque} producteur(s) / CTA du dossier sans fiche` : ''}` : `Aucune fiche${gros ? ` (${gros} producteur(s) / CTA au dossier)` : ''}`, ['vrac', '📥 Charger les fiches']);
      if (b.length) a('fiches', 'placer', 'Placer les fiches dans les calculs', !libres, libres ? `${libres} modèle(s) à placer` : 'Toutes placées', ['registre', '📍 Ouvrir le registre']);
    }

    // 9. Régulation (zones, consignes) et 10. électricité
    const elec = notes.find(n => n.type === 'elec');
    if (notes.length || inv.length) {
      if (!elec) a('regulation', 'creer-elec', 'Régulation et alimentation électrique', false, 'Équipements, armoires, points de régulation, GTB', inv.length ? ['creer:elec', '⚡ Créer d\'après le dossier'] : ['ajout:elec', '⚡ Créer le calcul']);
      else {
        const C = Cp(), e = elec.entrees || {}, defaut = C ? essai(() => C.estDefaut(e.consignesZones)) : false;
        a('regulation', 'zones', 'Zones, consignes et horaires', !defaut, defaut ? 'Consignes types : à préciser par zone (préremplir depuis l\'étude)' : `${(e.consignesZones || []).length} zone(s) définie(s)`, [`note:${elec.id}`, '🎛️ Préciser les zones'], { dependDe: ['typeBatiment'] });
        const I2 = Ic(), reg = I2 && I2.versRegulation ? I2.versRegulation(et.inventaire || []).entrees : {};
        if (reg.marqueAutomate || reg.gtb) a('regulation', 'marque', 'Régulation prescrite au CCTP', (!reg.marqueAutomate || e.marqueAutomate === reg.marqueAutomate) && (!reg.gtb || e.gtb === reg.gtb), `CCTP : ${[reg.marqueAutomate, reg.gtb, reg.busEquip].filter(Boolean).join(', ')}`, [`note:${elec.id}`, '🎛️ Vérifier']);
        const eq = (e.equipements || []).filter(l => l && (l.rep || l.designation)), sansP = eq.filter(l => vide(l.P));
        a('electricite', 'elec-puissances', 'Puissances électriques', eq.length && !sansP.length, !eq.length ? 'Aucun équipement : « Mettre à jour depuis l\'étude »' : sansP.length ? `${sansP.length} équipement(s) sans puissance : ${sansP.slice(0, 3).map(l => l.rep || l.designation).join(', ')}` : `${eq.length} équipement(s) renseigné(s)`, [`note:${elec.id}`, '⚡ Compléter']);
      }
    }

    // 10 bis. Calculs annexes suggérés par le dossier (hotte, parking, piscine, bouclage, DRV, fluides…) : à créer
    if (!reentrant) suggestionsAnnexes(et).forEach(s => a('annexes', `annexe:${s.type}`, `Créer le calcul « ${s.libelle} »`, aType(s.type), aType(s.type) ? 'Calcul présent dans l\'étude' : `Détecté au dossier : ${s.detail}`, [`annexe:${s.type}`, '➕ Créer le calcul']));

    // 10 ter. Réserves de conformité des calculs annexes (paramètres à valider, valeurs réglementaires modifiées,
    // obligations détectées) : levées une à une avec le bureau de contrôle (liste cochée dans l'étude)
    const AX = Ax();
    let reservesEtude = [];
    if (AX && L && notes.some(n => ((N0 || {}).TYPES || {})[n.type] && N0.TYPES[n.type].annexe)) {
      const l = essai(() => AX.reserves(et, L)) || [], d = AX.etat(et, l), cochees = (et && et.reservesConformite) || {};
      reservesEtude = l.filter(x => !(cochees[x.cle] || {}).le);
      if (l.length) a('conformite', 'reserves-conformite', 'Lever les réserves de conformité', !d.restent, d.restent ? `${d.restent} point(s) à lever avec le bureau de contrôle sur ${d.total} : ${reservesEtude.slice(0, 3).map(x => x.texte.slice(0, 60)).join(' ; ')}${d.restent > 3 ? '…' : ''}` : `${d.total} point(s), tous levés`, ['reserves-conformite', '🛡️ Récapitulatif des réserves']);
    }

    // 11. Émission des notes (bloquée par les erreurs et les points bloquants du contrôle global), 12. envoi au chantier
    if (notes.length) {
      // Contrôle global avant l'envoi (controle-etude.js) : rapport émis au moins une fois (PDF)
      const ctl = (et.controles || []).slice(-1)[0];
      a('emission', 'controle', 'Contrôler l\'étude avant l\'envoi', ctl, ctl ? `Dernier contrôle le ${ctl.le.split('-').reverse().join('/')} (${ctl.erreur} bloquant(s), ${ctl.attention} à traiter)` : 'Erreurs, valeurs estimées, réserves, matériel, incohérences et fiches manquantes passés en revue', ['controle', '🔎 Contrôler l\'étude'], { dependDe: creer.map(x => x.id) });
      const nonEmises = notes.filter(n => !(n.emissions || []).length), bq = reentrant || opts.controle === false ? [] : bloquantsControle(et);
      a('emission', 'emission', 'Émettre les notes de calcul', !nonEmises.length, nonEmises.length ? `${nonEmises.length} note(s) jamais émise(s)` : 'Toutes émises', ['pdf', '📄 Note de calcul PDF'],
        { bloquePar: ['erreurs', 'installation-erreurs'], dependDe: ['controle'], ...(bq.length ? { bloque: { motif: `${bq.length} point(s) bloquant(s) au contrôle de l'étude : ${liste(bq.map(p => String(p.texte).slice(0, 70)), 2)}`, action: ['controle', '🔎 Voir le contrôle'] } } : {}) });
      a('chantier', 'chantier', 'Relier l\'étude au chantier', et.affaireId, et.affaireId ? 'Étude reliée au chantier Pipe-Fit' : 'Matériel, mises en service et devis suivent le chantier', ['champ:affaireId', '🔗 Choisir le chantier']);
      a('chantier', 'diffusion', 'Diffuser au chantier', (et.diffusions || []).length, (et.diffusions || []).length ? `${et.diffusions.length} envoi(s)` : 'Bordereau de transmission et documents émis', ['diffuser', '📨 Diffuser'], { bloquePar: ['emission'] });
    }

    // Phases qui s'appliquent : l'étude toujours ; les achats dès qu'un matériel est choisi ou que l'étude est reliée à
    // un chantier ; chantier, mise en service, réception, DOE et exploitation une fois l'étude reliée au chantier
    const actives = new Set(['etude']);
    if (reentrant) return { etapes: trier(out), actives };
    const c = opts.chantier || null, aff = !!(et && et.affaireId);
    const suivis = c && Array.isArray(c.suivis) ? c.suivis : null, suiviDe = new Map((suivis || []).map(s => [s.cle, s]));

    /* ---------- Achats ---------- */
    const MR = Mr(), MT = Mt();
    let ls = [];
    if (MR && (notes.length || Object.keys((et && et.materiel) || {}).length)) {
      const tmp = { ...et, materiel: essai(() => JSON.parse(JSON.stringify(et.materiel || {}))) || {} };
      const postes = MT ? essai(() => MT.metre(tmp).filter(MT.estEquipement)) || [] : [];
      if (R && R.versMateriel && postes.length) essai(() => R.versMateriel(tmp, postes));
      ls = essai(() => MR.lignes(postes, tmp.materiel)) || [];
    }
    const gammes = ((et && et.equipements) || []).filter(x => x && x.gamme), devis = (et && et.devisFournisseurs) || [];
    if (aff || gammes.length || devis.length || ls.some(l => l.reference)) actives.add('achats');
    const empl = R && gammes.length ? essai(() => R.emplacements(et)) || [] : [];
    gammes.forEach(x => a('gammes', `achats:gamme:${x.id}`, `Choisir le modèle de ${(R && essai(() => R.nomEq(x))) || x.nom || 'l\'équipement'}`, false,
      `Documentation de gamme « ${x.gamme.titre || ''} » : ${(x.gamme.modeles || []).length} modèle(s) — valeurs reprises dans les calculs une fois le modèle choisi`, ['registre', '🗂️ Choisir dans le registre'],
      { poids: empl.filter(p => p.eq === x.id).length, ...((x.gamme.modeles || []).length ? { editeur: { type: 'gamme', eq: x.id } } : {}) }));
    const lib = l => `${l.designation}${l.qte ? ` (${String(l.qte).replace('.', ',')} u)` : ''}`, matAct = ['materiel', '🏷️ Matériel retenu'];
    const parStatut = st => ls.filter(l => l.statut === st && !l.orphelin);
    const aChoisir = parStatut('À choisir'), aSoumettre = parStatut('À soumettre'), soumis = parStatut('Soumis au client'), refuses = parStatut('Refusé'), orphelins = ls.filter(l => l.orphelin);
    const refuseIds = refuses.map(l => `achats:refuse:${l.cle}`);
    if (ls.length) a('validation', 'achats:choisir', 'Choisir le fabricant et la référence du matériel', !aChoisir.length, aChoisir.length ? `${aChoisir.length} équipement(s) : ${liste(aChoisir.map(lib))}` : `${ls.length} équipement(s), références choisies`, matAct, { poids: aChoisir.length });
    if (ls.some(l => l.reference)) a('validation', 'achats:soumettre', 'Soumettre le matériel à la validation du client', !aSoumettre.length, aSoumettre.length ? `${aSoumettre.length} référence(s) à soumettre : ${liste(aSoumettre.map(lib))}` : 'Toutes les références choisies sont soumises', matAct, { dependDe: ['achats:choisir'], poids: aSoumettre.length });
    if (soumis.length) {
      const rel = MR ? soumis.filter(l => MR.aRelancer({ ...l, soumisLe: (suiviDe.get(l.cle) || {}).soumisLe }, auj)) : [];
      a('validation', 'achats:attente', 'Obtenir la validation du client', false, `${soumis.length} référence(s) en attente${rel.length ? ` — ${rel.length} sans réponse depuis plus de 15 jours : relancer le client` : ''} : ${liste(soumis.map(lib))}`, matAct, { gravite: rel.length ? 2 : 0, poids: soumis.length });
    }
    refuses.forEach(l => a('validation', `achats:refuse:${l.cle}`, `${l.designation} : référence refusée`, false, `${MR.libelleRef(l)} refusé par le client${l.obs ? ` (${l.obs})` : ''} — autre modèle à proposer`, matAct, { gravite: 3 }));
    if (orphelins.length) a('validation', 'achats:orphelins', 'Reprendre le matériel dont la dimension a changé', false, `${orphelins.length} choix sans équipement correspondant dans l'étude : ${liste(orphelins.map(l => `${l.designation} — ${MR.libelleRef(l)}`))}`, matAct, { gravite: 1 });
    // Devis fournisseurs : à comparer dès deux devis lus (confirmé à la main, rouvert par un nouveau devis)
    if (devis.length >= 2) { const sig = devis.map(d => d.id || `${d.fournisseur}|${d.numero}`).sort().join(','); a('consultation', 'achats:devis-comparer', 'Comparer les devis fournisseurs', confirme('achats:devis-comparer', sig), `${devis.length} devis lus : ${liste(devis.map(d => [d.fournisseur, d.numero].filter(Boolean).join(' ')))} — moins-disant, lignes manquantes, prix retenus`, ['devis-comparer', '💶 Comparer les devis'], manuel('achats:devis-comparer', sig, '✓ Comparés')); }
    // Suivi des achats du chantier (Pipe-Fit) : consultations, offres, commandes, livraisons
    if (suivis) {
      const achat = l => (suiviDe.get(l.cle) || {}).achat || {}, choisis = ls.filter(l => l.reference && !l.orphelin && l.statut !== 'Refusé');
      const nonConsultes = choisis.filter(l => !achat(l).etat), sansOffre = choisis.filter(l => achat(l).etat === 'consulte'), offresSansPrix = choisis.filter(l => achat(l).etat === 'offre' && !l.prix);
      if (choisis.length) a('consultation', 'achats:consulter', 'Consulter les fournisseurs', !nonConsultes.length, nonConsultes.length ? `${nonConsultes.length} ligne(s) non consultée(s) (consultation dans Pipe-Fit) : ${liste(nonConsultes.map(lib))}` : `${choisis.length} ligne(s) consultée(s)`, matAct, { poids: nonConsultes.length });
      if (sansOffre.length) a('consultation', 'achats:offres', 'Relancer les consultations sans offre', false, `${sansOffre.length} ligne(s) consultée(s) sans offre reçue : ${liste(sansOffre.map(l => `${lib(l)}${achat(l).consultation ? ` (${achat(l).consultation})` : ''}`))}`, matAct, { poids: sansOffre.length });
      if (offresSansPrix.length) a('consultation', 'achats:devis-lire', 'Lire les devis reçus', false, `${offresSansPrix.length} ligne(s) avec offre sans prix repris : ${liste(offresSansPrix.map(lib))} — « 📄 Lire un devis fournisseur »`, matAct, { poids: offresSansPrix.length });
      const aCommander = choisis.filter(l => ['', 'consulte', 'offre'].includes(achat(l).etat || '')), prets = aCommander.filter(l => MR.estValide(l));
      if (choisis.length) {
        const bloqueurs = ['achats:choisir', 'achats:soumettre', 'achats:attente', ...refuseIds];
        a('commandes', 'achats:commander', 'Commander le matériel', !aCommander.length, aCommander.length ? `${aCommander.length} ligne(s) à commander : ${prets.length} validée(s) prête(s)${aCommander.length - prets.length ? `, ${aCommander.length - prets.length} non validée(s) par le client (commande bloquée)` : ''}` : 'Tout le matériel est commandé',
          matAct, { poids: aCommander.length, dependDe: ['achats:consulter', 'achats:devis-lire'], ...(aCommander.length && !prets.length ? { bloquePar: bloqueurs, bloque: { motif: 'matériel non validé par le client', action: matAct } } : {}) });
      }
      const sansDate = choisis.filter(l => ['commande', 'partiel'].includes(achat(l).etat) && !achat(l).prevue);
      if (sansDate.length) a('commandes', 'achats:livraison', 'Obtenir les dates de livraison', false, `${sansDate.length} commande(s) sans date de livraison : ${liste(sansDate.map(l => `${lib(l)}${achat(l).commande ? ` (${achat(l).commande})` : ''}`))}`, matAct, { poids: sansDate.length });
      // Retards sur le planning du chantier (alertes d'approvisionnement : livraison prévue après le début de la tâche)
      let alertes = (c.alertesAppro || []).slice();
      if (Array.isArray(c.phases) && Pl()) alertes = alertes.concat((essai(() => Pl().alertes(c.phases, suivis.map(s => ({ ...s, etudeId: s.etudeId || et.id, designation: ((ls.find(l => l.cle === s.cle)) || {}).designation || s.cle })), { aujourdhui: auj, etatAchat: m => m.achat || {} })) || {}).alertes || []);
      const vusR = new Set();
      alertes.filter(x => x && x.niveau === 'erreur').forEach(x => {
        const k = String(x.cle || ''), cle = k.startsWith(`${et.id}|`) ? k.slice(String(et.id).length + 1) : k || String(x.texte).slice(0, 60);
        if (vusR.has(cle)) return; vusR.add(cle);
        a('commandes', `achats:retard:${cle}`, 'Livraison en retard sur le planning', false, `${x.texte}${x.phase ? ` (tâche « ${x.phase} »)` : ''}`, matAct, { gravite: 3 });
      });
    }

    /* ---------- Chantier, mise en service, réception, DOE, exploitation (étude reliée au chantier) ---------- */
    if (aff) ['chantier', 'mes', 'reception', 'doe', 'exploitation'].forEach(p => actives.add(p));
    const releves = ((et && et.comptages) || {}).releves || [];
    if (releves.length) actives.add('exploitation');
    const mises = (c && c.mises) || [], signes = mises.filter(m => m.statut === 'Signé');
    if (c && suivis) {
      const valides = ls.filter(l => MR && MR.estValide(l) && !l.orphelin), poses = valides.filter(l => (suiviDe.get(l.cle) || {}).poseLe);
      if (valides.length) a('pose', 'chantier:pose', 'Poser le matériel validé', poses.length === valides.length, `${poses.length}/${valides.length} équipement(s) posé(s) (appli des compagnons)${poses.length < valides.length ? ` — reste : ${liste(valides.filter(l => !poses.includes(l)).map(lib))}` : ''}`, matAct, { dependDe: ['achats:commander'] });
      const sansPlaque = poses.filter(l => !(suiviDe.get(l.cle) || {}).plaque);
      if (poses.length) a('plaques', 'chantier:plaques', 'Contrôler les plaques signalétiques', !sansPlaque.length, sansPlaque.length ? `${sansPlaque.length} équipement(s) posé(s) sans plaque lue : ${liste(sansPlaque.map(lib))}` : `${poses.length} plaque(s) contrôlée(s)`, ['plaques', '🏷️ Plaques et registre']);
      ls.forEach(l => {
        const s = suiviDe.get(l.cle); if (!s) return;
        const cmp = s.plaque && Pq() ? essai(() => Pq().comparer(l, s.plaque)) : null;
        if ((cmp && cmp.etat === 'substitution') || s.substitution) a('plaques', `chantier:substitution:${l.cle}`, `${l.designation} : substitution à faire valider`, false, cmp && cmp.etat === 'substitution' ? cmp.texte : `Référence ${(s.substitution || {}).reference || ''} à la place de ${MR.libelleRef(l)} : à soumettre au client`, ['plaques', '🏷️ Plaques et registre'], { gravite: 3 });
      });
    }
    if (c && c.reserves) {
      const aff_ = c.reserves.affectees || [], lev = c.reserves.levees || [], coch = (et && et.reservesConformite) || {};
      const nonAffectees = aff_.filter(r => !r.assigneA), aCocher = lev.filter(r => !(coch[r.cle] || {}).le), surChantier = new Set([...aff_, ...lev].map(r => r.cle));
      if (aff_.length || lev.length) a('reserves', 'chantier:reserves', 'Lever les réserves sur le chantier', !aff_.length, aff_.length ? `${aff_.length} réserve(s) ouverte(s)${aff_.some(r => r.echeance && r.echeance < auj) ? ` dont ${aff_.filter(r => r.echeance && r.echeance < auj).length} en retard` : ''}, ${lev.length} levée(s)` : `${lev.length} réserve(s) levée(s)`, ['reserves-levees', '🛡️ Réserves levées'], { poids: aff_.length });
      if (nonAffectees.length) a('reserves', 'chantier:reserves-affecter', 'Affecter les réserves aux compagnons', false, `${nonAffectees.length} réserve(s) sans compagnon (Pipe-Fit → Réserves et réception) : n° ${liste(nonAffectees.map(r => r.numero || r.cle))}`, ['reserves-levees', '🛡️ Réserves du chantier'], { gravite: 1 });
      if (aCocher.length) a('reserves', 'chantier:reserves-cocher', 'Cocher dans l\'étude les réserves levées', false, `${aCocher.length} réserve(s) levée(s) sur le chantier à reporter dans le récapitulatif de conformité`, ['reserves-levees', '🛡️ Cocher les réserves levées']);
      const nonTransmises = reservesEtude.filter(x => !surChantier.has(x.cle));
      if (aff && nonTransmises.length) a('reserves', 'chantier:reserves-transmettre', 'Reprendre les réserves de l\'étude sur le chantier', false, `${nonTransmises.length} réserve(s) de conformité ouverte(s) non reprise(s) dans Pipe-Fit (« Réserves à lever par les compagnons ») : ${liste(nonTransmises.map(x => x.texte.slice(0, 50)), 2)}`, ['reserves-conformite', '🛡️ Récapitulatif des réserves']);
    }
    // Mise en service : une fiche par équipement, remplie quand le PV du chantier est signé ; réglages de base d'abord
    const mesIds = [];
    if (aff && c && notes.length) {
      const fiches = (Fm() && essai(() => Fm().fiches(et))) || [], types = [...new Set(fiches.map(f => f.type))];
      const base = ['creer-elec', 'zones', 'emission'];
      types.forEach(t => {
        const l = fiches.filter(f => f.type === t), rest = l.filter(f => !signes.some(m => memeEquipement(m, f))), enCours = rest.filter(f => mises.some(m => memeEquipement(m, f)));
        const id = `mes:fiches:${t}`; mesIds.push(id);
        a('fichesMes', id, `Mettre en service : ${String(l[0].libType || t).replace(/^./, x => x.toLowerCase())}`, !rest.length, rest.length ? `${l.length - rest.length}/${l.length} fiche(s) remplie(s) et signée(s)${enCours.length ? `, ${enCours.length} en cours` : ''} — à faire : ${liste(rest.map(f => f.repere || f.titre))}` : `${l.length} fiche(s) signée(s)`,
          ['fiches-mes', '📋 Fiches de mise en service'], { poids: rest.length, bloquePar: [...base, ...(AVANT_MES[t] || []).filter(x => types.includes(x)).map(x => `mes:fiches:${x}`)] });
      });
    }
    if (c && ((c.equilibrages || []).length || mises.length) && Mres() && L) {
      const tol = Number(((et && et.retourChantier) || {}).tolerance) || 10;
      const r = essai(() => { if (typeof contexteEtude !== 'undefined') contexteEtude = et; return Mres().comparer({ et, L, equilibrages: c.equilibrages || [], mises, tolerance: tol }); });
      if (r && r.bilan.comparees) {
        a('reglages', 'mes:ecarts', 'Mesures dans la tolérance', !r.bilan.horsTolerance, r.bilan.horsTolerance ? `${r.bilan.horsTolerance} mesure(s) sur ${r.bilan.comparees} hors tolérance (± ${tol} %) : ${liste(r.lignes.filter(x => x.conforme === false).map(x => `${x.repere || x.libelle} ${x.ecart > 0 ? '+' : ''}${String(x.ecart).replace('.', ',')} %`))}` : `${r.bilan.comparees} mesure(s) dans la tolérance (± ${tol} %)`, ['mesures', '📏 Mesures et réglages'], { dependDe: [], poids: r.bilan.horsTolerance, gravite: r.bilan.horsTolerance ? 1 : 0 });
        mesIds.push('mes:ecarts');
      }
      if (r && r.reglages.length) {
        const sig = r.reglages.map(x => `${x.organe}=${x.propose}`).join('|').slice(0, 400);
        a('reglages', 'mes:reglages', 'Appliquer les réglages proposés', confirme('mes:reglages', sig), `${r.reglages.length} réglage(s) : ${liste(r.reglages.map(x => `${x.organe} → ${x.propose}`), 2)}`, ['mesures', '📏 Réglages proposés'], { ...manuel('mes:reglages', sig, '✓ Réglages appliqués'), gravite: 2, poids: r.reglages.length });
        mesIds.push('mes:reglages');
        const ec = out.find(x => x.id === 'mes:ecarts'); if (ec) ec.dependDe = ['mes:reglages'];
      }
    }
    // Réception : après les mises en service et les PV de régulation signés (Essais.bloquantsReception)
    const statut = String((c && c.statut) || '');
    if (aff) {
      const pvReg = Ess() && Ess().bloquantsReception ? essai(() => Ess().bloquantsReception(mises)) || [] : [];
      const faite = !!(c && c.reception) || /^(termin|r[eé]ceptionn|clos|cl[oô]tur|sold)/i.test(statut) || confirme('reception:pv');
      a('reception', 'reception:pv', 'Prononcer la réception des travaux', faite, faite ? `Réception${c && c.reception && c.reception.date ? ` du ${dateFrG(c.reception.date)}` : statut ? ` (chantier ${statut.toLowerCase()})` : ' prononcée'}` : 'PV de réception avec le client, réserves éventuelles listées',
        null, { ...manuel('reception:pv', '', '✓ Réception prononcée'), bloquePar: mesIds.slice(), dependDe: ['chantier:reserves'], ...(pvReg.length ? { bloque: { motif: `${pvReg.length} PV de régulation non signé(s) : ${liste(pvReg.map(p => `${p.numero ? `${p.numero} ` : ''}${p.equipement}`), 2)}`, action: ['fiches-mes', '📋 Fiches de mise en service'] } } : {}) });
    }
    // DOE : pièces manquantes (si le chantier les donne), sinon pièces de l'étude transmises (confirmé à la main)
    if (aff) {
      const d = c && c.doe;
      const manq = d ? (Array.isArray(d.manquantes) ? d.manquantes : (d.pieces || []).filter(p => !p.present).map(p => p.libelle || p.titre || p)) : null;
      if (manq) a('doe', 'doe:pieces', 'Compléter le DOE', !manq.length, manq.length ? `${manq.length} pièce(s) manquante(s) : ${liste(manq.map(String))}` : 'Toutes les pièces du DOE sont présentes', ['diffuser', '📨 Diffuser au chantier'], { poids: manq.length });
      else a('doe', 'doe:dossier', 'Transmettre les pièces de l\'étude au DOE', confirme('doe:dossier'), 'Notes de calcul émises, fiches techniques, carnet d\'entretien, réglages : diffusées au chantier pour le DOE', ['diffuser', '📨 Diffuser'], { ...manuel('doe:dossier', '', '✓ Transmises'), bloquePar: ['emission', 'diffusion'], dependDe: ['fiches'] });
    }
    // Exploitation : contrat d'entretien, relevés de compteurs la première année, dérives et fuites
    if (aff || releves.length) {
      const ops = AX && L ? essai(() => AX.entretien(et, L)) || [] : [];
      if (aff) a('contrat', 'exploitation:contrat', 'Créer le contrat d\'entretien', !!(c && c.contrat) || confirme('exploitation:contrat'), c && c.contrat ? 'Contrat d\'entretien créé sur le chantier' : `${ops.length ? `${ops.length} visite(s) ou contrôle(s) induit(s) par les calculs (F-gaz, chaudière, légionelles…) à reprendre` : 'Visites et contrôles du matériel en service'} — fiche du chantier dans Pipe-Fit`,
        ops.length ? ['entretien', '🔧 Visites d\'entretien'] : null, { ...manuel('exploitation:contrat', '', '✓ Contrat créé'), dependDe: ['reception:pv'] });
      const dates = [c && c.reception && c.reception.date, ...((suivis || []).map(s => s.mesLe)), ...signes.map(m => m.date)].filter(x => /^\d{4}-\d{2}-\d{2}/.test(String(x || ''))).sort();
      const dMes = dates[0] || '';
      if (dMes && plusMois(dMes, 12) <= auj) {
        const ok = releves.some(r => String(r.date || '') >= plusMois(dMes, 11));
        a('comptages', 'exploitation:releves', 'Importer les relevés de compteurs de la première année', ok, ok ? `${releves.length} relevé(s) importé(s)` : `Mise en service le ${dateFrG(dMes)} : relevés de la GTC (CSV, Excel) à importer pour le bilan réel face au calcul « Énergie annuelle »`, ['comptages', '📈 Comptages'], { gravite: 1 });
      }
      if (releves.length && Cg() && L) {
        const g = { toleranceComptage: 15, djuReel: '', ...((et && et.retourChantier) || {}) };
        const bl = essai(() => { if (typeof contexteEtude !== 'undefined') contexteEtude = et; return Cg().bilan({ releves, prevus: Cg().prevus(et, L), ctx: Cg().contexte(et, L), tolerance: g.toleranceComptage, djuReel: g.djuReel }); });
        ((bl && bl.derives) || []).forEach(d => { const sig = `${d.du}|${d.au}|${d.hausse}`; a('comptages', `exploitation:derive:${d.compteur}`, `Dérive au compteur ${d.compteur}`, confirme(`exploitation:derive:${d.compteur}`, sig), `+${d.hausse} % par jour du ${dateFrG(d.du)} au ${dateFrG(d.au)} par rapport aux périodes précédentes (réglages, horaires, encrassement ?)`, ['comptages', '📈 Comptages'], { ...manuel(`exploitation:derive:${d.compteur}`, sig, '✓ Traitée'), gravite: 2 }); });
        const vusF = new Set();
        ((bl && bl.fuites) || []).forEach(f => { if (vusF.has(f.compteur)) return; vusF.add(f.compteur); const sig = `${f.du || ''}|${f.au || ''}|${f.litresJour || f.annuel || ''}`; a('comptages', `exploitation:fuite:${f.compteur}`, `Fuite d'eau probable au compteur ${f.compteur}`, confirme(`exploitation:fuite:${f.compteur}`, sig), f.litresJour ? `Appoint de ${f.litresJour} L/j du ${dateFrG(f.du)} au ${dateFrG(f.au)} (seuil ${f.seuil} L/j) : soupape, vase d'expansion, purgeurs, fuite` : `Appoint annualisé de ${f.annuel} L (seuil ${f.seuilAnnuel} L) : rechercher une fuite`, ['comptages', '📈 Comptages'], { ...manuel(`exploitation:fuite:${f.compteur}`, sig, '✓ Traitée'), gravite: 4 }); });
      }
    }
    return { etapes: trier(out), actives };
  }
  // Étapes rangées dans l'ordre logique des groupes (phases, puis groupes), ordre d'ajout gardé dans un groupe
  const trier = l => l.map((x, i) => [x, i]).sort((p, q) => GROUPE[p[0].groupe].rang - GROUPE[q[0].groupe].rang || p[1] - q[1]).map(([x]) => x);

  // Dépendances, blocages, impact, progression par phase et globale, étape suivante (par phase et globale)
  function synthese(etapes, actives) {
    const act = actives instanceof Set ? actives : new Set(actives || PHASES.map(p => p[0]));
    const parId = new Map(etapes.map(x => [x.id, x])), inverse = new Map();
    etapes.forEach(x => [...(x.bloquePar || []), ...(x.dependDe || [])].forEach(id => { if (!inverse.has(id)) inverse.set(id, new Set()); inverse.get(id).add(x.id); }));
    // Nombre d'étapes restantes qui dépendent (directement ou non) d'une étape
    const dependants = id => { const vus = new Set(), pile = [...(inverse.get(id) || [])]; while (pile.length) { const k = pile.pop(); if (vus.has(k) || k === id) continue; const y = parId.get(k); if (!y || y.fait) continue; vus.add(k); pile.push(...(inverse.get(k) || [])); } return vus.size; };
    etapes.forEach((x, i) => {
      const bl = (x.bloquePar || []).map(id => parId.get(id)).filter(y => y && y !== x && !y.fait);
      x.ordre = i;
      x.bloqueurs = bl.map(y => y.id);
      x.bloquee = !x.fait && (bl.length > 0 || !!(x.bloque && x.bloque.motif));
      x.motifBlocage = x.bloquee ? [x.bloque && x.bloque.motif, ...bl.map(y => y.titre.replace(/^./, c => c.toLowerCase()))].filter(Boolean).join(' ; ') : '';
      x.dependants = x.fait ? 0 : dependants(x.id);
      x.impact = x.fait ? 0 : ((GROUPE[x.groupe] || {}).base || 1) + (x.gravite || 0) + Math.min(10, x.poids || 0) + 2 * x.dependants;
    });
    const restes = etapes.filter(x => !x.fait).sort((p, q) => q.impact - p.impact || p.ordre - q.ordre);
    const choisir = l => l.find(x => !x.bloquee) || l[0] || null;
    const phases = PHASES.map(([id, ico, libelle]) => {
      const l = etapes.filter(x => x.phase === id), f = l.filter(x => x.fait).length;
      return { id, ico, libelle, active: act.has(id), total: l.length, faits: f, pct: l.length ? Math.round(f / l.length * 100) : 100, suivante: choisir(restes.filter(x => x.phase === id)) };
    });
    const comptees = etapes.filter(x => act.has(x.phase)), faits = comptees.filter(x => x.fait).length, total = comptees.length;
    return { etapes, faits, total, pct: total ? Math.round(faits / total * 100) : 100, suivante: choisir(restes.filter(x => act.has(x.phase))), restes, phases, actives: [...act] };
  }

  // opts : { chantier (données du chantier : mises, equilibrages, reserves, suivis, statut, reception, doe, contrat,
  //   alertesAppro, phases), aujourdhui, controle (false : sans contrôle global), suivi (false : sans SuiviEtapes) }
  function restesAFaire(et, opts = {}) {
    const { etapes, actives } = construire(et || {}, opts);
    let l = etapes;
    const S = Sv();
    if (opts.suivi !== false && S && S.decorer) { const d = essai(() => S.decorer(et, l)); if (Array.isArray(d)) l = d; }
    return synthese(l, actives);
  }

  // Correction sur place d'une étape simple : saisies { champ ou chemin: valeur } ; modifie l'étude
  // (climat, type de bâtiment, valeurs vides ou par défaut, valeurs estimées, modèle d'une gamme)
  const versValeur = v => { const t = String(v ?? '').trim(); return /^-?\d+(?:[.,]\d+)?$/.test(t) ? Number(t.replace(',', '.')) : t; };
  const parent = (o, chemin) => { const p = String(chemin).split('.'), k = p.pop(); let x = o; for (const s of p) { if (x == null) return [null, k]; x = x[/^\d+$/.test(s) ? Number(s) : s]; } return [x, k]; };
  function corriger(et, etape, saisies = {}) {
    const ed = etape && etape.editeur;
    if (!et || !ed) return { ok: false, erreur: 'Rien à corriger sur place' };
    if (ed.type === 'climat' || ed.type === 'typeBatiment') {
      const v = String(saisies[ed.type] ?? '').trim();
      if (!v) return { ok: false, erreur: 'Choisissez une valeur' };
      et[ed.type] = v; return { ok: true, donnees: { [ed.type]: v } };
    }
    const n = (et.notes || []).find(y => y.id === ed.note);
    if (ed.type === 'valeurs' || ed.type === 'estimees') {
      if (!n) return { ok: false, erreur: 'Calcul introuvable' };
      n.entrees = n.entrees || {};
      const E = Es(); let k = 0;
      (ed.champs || []).forEach(c => {
        const [o, cle] = parent(n.entrees, c.chemin); if (!o) return;
        const s = saisies[c.chemin], v = s === undefined ? (ed.type === 'estimees' ? o[cle] : c.vide ? '' : c.valeur) : versValeur(s);
        if (ed.type === 'valeurs' && vide(v)) return;
        if (!vide(v)) { o[cle] = v; k++; }
        if (ed.type === 'estimees' && E && E.demarquer) E.demarquer(o, cle);
      });
      const reste = valeursNote(n, et);
      if (ed.type === 'valeurs' && !reste.vides.length && !ed.autres) n.defautsConfirmes = true;
      return { ok: true, valeurs: k, reste };
    }
    if (ed.type === 'gamme') {
      const R = Rg(), x = R && R.parId(et, ed.eq), m = Number(saisies.modele);
      if (!x || !x.gamme) return { ok: false, erreur: 'Équipement introuvable ou modèle déjà choisi' };
      if (!(m >= 0) || !R.choisirModele(x, m)) return { ok: false, erreur: 'Choisissez le modèle de la gamme' };
      return { ok: true, maj: essai(() => R.propager(et)) || 0, nom: essai(() => R.nomEq(x)) || '' };
    }
    return { ok: false, erreur: 'Éditeur inconnu' };
  }

  /* ---------- Affichage (navigateur) ---------- */
  // Liste détaillée et phases ouvertes ou fermées par l'utilisateur : gardées d'un affichage à l'autre
  let ouvert = null;
  const phasesOuvertes = new Map();
  let etapeOuverte = null; // étape dont le détail est ouvert (une seule à la fois), gardée au rafraîchissement du guide
  const derniers = new Map(); // étude → dernières étapes affichées (confirmations, éditeurs)
  const restantes = new Map(); // étude → identifiants des étapes restantes au dernier affichage (historique « fait »)
  const observees = new Set(); // études dont les changements entre deux sessions ont été notés (SuiviEtapes.observer)
  // Données du chantier lues dans Pipe-Fit (retour du chantier, suivi du matériel et des achats) : cache par étude
  const chantierCache = new Map(), DUREE_CACHE = 2 * 60e3;
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function donneesChantier(et) {
    const c = chantierCache.get(et.id);
    const a = typeof affaireDe === 'function' && et.affaireId ? essai(() => affaireDe(et.affaireId)) : null;
    if (!c || !c.data) return null;
    return { ...c.data, statut: c.data.statut || (a && a.statut) || '' };
  }
  async function chargerChantier(et, forcer) {
    if (!et || !et.affaireId || typeof api !== 'function') return false;
    const c = chantierCache.get(et.id);
    if (!forcer && c && (c.encours || (c.affaireId === et.affaireId && Date.now() - c.t < DUREE_CACHE))) return false;
    chantierCache.set(et.id, { ...(c || {}), encours: true });
    const lire = u => api('GET', u).catch(() => null);
    const [ret, sv] = await Promise.all([lire(`/api/pf/retour?affaireId=${encodeURIComponent(et.affaireId)}&etudeId=${encodeURIComponent(et.id)}`), lire(`/api/pf/materiel-suivi?etudeId=${encodeURIComponent(et.id)}`)]);
    let data = null;
    if (ret || sv) {
      const parCle = new Map();
      [...((ret && ret.suivis) || []), ...(Array.isArray(sv) ? sv : [])].forEach(s => { if (s && s.cle) parCle.set(s.cle, { ...(parCle.get(s.cle) || {}), ...s }); });
      data = { ...(ret || {}), suivis: [...parCle.values()] };
    }
    const avant = c && c.data ? JSON.stringify(c.data) : '';
    chantierCache.set(et.id, { t: Date.now(), affaireId: et.affaireId, data: data || (c && c.data) || null });
    return JSON.stringify(data || (c && c.data) || null) !== (avant || 'null');
  }
  // Étapes à afficher : chantier en cache, suivi des étapes, historique des étapes devenues faites.
  // Résultat gardé tant que l'étude, les données du chantier, les réglages et le jour sont les mêmes : un nouvel
  // affichage de la page (filtre, retour d'un dialogue, données du chantier inchangées) ne refait pas tout le guide.
  const memo = new Map();
  const globaux = () => (typeof S !== 'undefined' && S ? [S.config, S.pf] : []);
  const cleDe = (et, c) => { try { return JSON.stringify([et, c && c.data, new Date().toDateString()]); } catch (e) { return ''; } };
  function calculer(et) {
    const c = chantierCache.get(et.id), g = globaux(), cle = cleDe(et, c), m = memo.get(et.id);
    if (cle && m && m.cle === cle && m.g.length === g.length && m.g.every((x, i) => x === g[i])) return m.r;
    const r = restesAFaire(et, { chantier: donneesChantier(et) });
    r.etapes.actives = r.actives; // phases en cours : même pourcentage dans l'état d'avancement (PDF)
    derniers.set(et.id, r.etapes);
    const Sx = Sv(), avant = restantes.get(et.id);
    if (avant && Sx && Sx.noterFait) r.etapes.filter(x => x.fait && avant.has(x.id)).forEach(x => essai(() => Sx.noterFait(et, x)));
    // Première vue de l'étude dans la session, données du chantier lues : étapes faites ou rouvertes depuis le dernier
    // enregistrement notées (date d'observation, source), état gardé dans l'étude pour la session suivante
    if (!observees.has(et.id) && !et.modele && Sx && Sx.observer && (!et.affaireId || (c && c.data))) {
      observees.add(et.id);
      const vus = essai(() => Sx.observer(et, r.etapes)) || [];
      if (vus.length && typeof enregistrer === 'function') setTimeout(() => essai(() => enregistrer(et)), 0);
    }
    restantes.set(et.id, new Set(r.etapes.filter(x => !x.fait).map(x => x.id)));
    // Résumé d'avancement de l'étude (portefeuille, CRM) aligné sur ce que montre le guide, données du chantier comprises ;
    // envoyé au CRM au prochain enregistrement
    if (!et.modele && Sx && Sx.avancement) { const av = essai(() => Sx.avancement(et, r.etapes)); if (av) et.avancement = av; }
    // Clé reprise après coup : l'historique « fait » vient peut-être de compléter l'étude
    const apres = cle && cleDe(et, c);
    if (apres) memo.set(et.id, { cle: apres, g, r }); else memo.delete(et.id);
    return r;
  }
  const lienBlocage = (x, parId) => {
    const l = [...x.bloqueurs.map(id => parId.get(id)).filter(y => y && y.action).map(y => y.action), ...(x.bloque && x.bloque.action ? [x.bloque.action] : [])];
    const vus = new Set(), u = l.filter(a => !vus.has(a[0]) && vus.add(a[0])).slice(0, 2);
    return `<span class="petit guide-bloque">🔒 bloquée : ${esc(x.motifBlocage)}${u.length ? ` — débloquer : ${u.map(a => `<button type="button" class="lien petit" data-guide="${esc(a[0])}">${esc(a[1])}</button>`).join(' ')}` : ''}</span>`;
  };
  function editeurHtml(et, x, deplie) {
    const ed = x.editeur; if (!ed) return '';
    let corps = '';
    if (ed.type === 'climat' && typeof optionsClimat === 'function') corps = `<label>Climat du site <select data-ed-champ="climat">${essai(() => optionsClimat(et, typeof affaireDe === 'function' ? affaireDe(et.affaireId) : null)) || ''}</select></label>`;
    else if (ed.type === 'typeBatiment' && typeof optionsTypeBatiment === 'function') corps = `<label>Type de bâtiment <select data-ed-champ="typeBatiment">${essai(() => optionsTypeBatiment(et)) || ''}</select></label>`;
    else if ((ed.type === 'valeurs' || ed.type === 'estimees') && (ed.champs || []).length) {
      corps = ed.champs.map(c => `<label>${esc(c.libelle)}${c.unite ? ` <span class="unite">(${esc(c.unite)})</span>` : ''}<input data-ed-champ="${esc(c.chemin)}" inputmode="decimal" value="${esc(String(c.valeur ?? '').replace(/^(-?\d+)\.(\d+)$/, '$1,$2'))}" placeholder="${esc(String(c.defaut ?? '').replace('.', ','))}">${c.origine ? `<span class="petit muted">estimée : ${esc(c.origine)}</span>` : c.vide ? '<span class="petit muted">vide</span>' : '<span class="petit muted">valeur par défaut</span>'}</label>`).join('')
        + (ed.autres ? `<span class="petit muted">et ${ed.autres} autre(s) : ouvrir le calcul</span>` : '');
    } else if (ed.type === 'gamme') {
      const R = Rg(), eq = R && R.parId(et, ed.eq), mods = (eq && eq.gamme && eq.gamme.modeles) || [];
      if (mods.length) {
        const p = essai(() => R.emplacements(et).find(y => y.eq === eq.id)), k = typeof Vrac !== 'undefined' ? essai(() => Vrac.modeleConseille(et, eq.type, eq.gamme, p ? Vrac.cibleEmplacement(p) : '')) : -1;
        corps = `<label>Modèle de la gamme <select data-ed-champ="modele"><option value="">— à choisir —</option>${mods.map((m, j) => `<option value="${j}" ${j === k ? 'selected' : ''}>${esc(typeof Vrac !== 'undefined' ? essai(() => Vrac.libelleModele(m)) || m.ref : m.ref || `Modèle ${j + 1}`)}${j === k ? ' (conseillé)' : ''}</option>`).join('')}</select></label>`;
      }
    }
    if (!corps) return '';
    // Dans le détail d'une étape (déjà ouvert à la demande) : éditeur affiché directement
    if (deplie) return `<div class="guide-editeur deplie" data-ed="${esc(x.id)}"><span class="petit muted">✏️ Corriger ici</span><div class="guide-ed-corps">${corps}<span class="guide-ed-actions"><button type="button" class="petit" data-ed-ok="${esc(x.id)}">✓ Confirmer</button></span></div></div>`;
    return `<details class="guide-editeur" data-ed="${esc(x.id)}"><summary class="petit">✏️ Corriger ici</summary><div class="guide-ed-corps">${corps}<span class="guide-ed-actions"><button type="button" class="petit" data-ed-ok="${esc(x.id)}">✓ Confirmer</button></span></div></details>`;
  }
  function html(et) {
    if (!et || et.modele) return '';
    if (typeof contexteEtude !== 'undefined') essai(() => { contexteEtude = et; });
    const r = essai(() => (typeof avecCalculsMemorises === 'function' ? avecCalculsMemorises(() => calculer(et)) : calculer(et)));
    if (!r || !r.total) return '';
    const S = Sv(), parId = new Map(r.etapes.map(x => [x.id, x]));
    const s = r.suivante, restes = r.restes, actives = new Set(r.actives);
    // Données du chantier pas encore lues (premier affichage de l'étude) : signalé, le guide se complète à leur arrivée
    const cc = chantierCache.get(et.id), lecture = !!et.affaireId && typeof api === 'function' && (!cc || cc.encours);
    // Suivi des étapes (responsable, échéance, sans objet) : filtres « Mes étapes / En retard / Sans objet » et PDF
    const V = S && S.vue ? essai(() => S.vue(et, r.etapes)) : null;
    const suivi = x => (S && S.htmlEtape ? essai(() => S.htmlEtape(et, x)) || '' : '');
    const bouton = (x, principal) => (x.fait ? '' : `${x.tout ? `<button class="petit" data-guide="${esc(x.tout[0])}" title="Tous les calculs d'après l'inventaire, raccordés, puissances manquantes estimées">${esc(x.tout[1])}</button>` : ''}${x.action ? `<button class="${principal && !x.bloquee ? '' : 'secondaire '}petit" data-guide="${esc(x.action[0])}">${esc(x.action[1])}</button>` : ''}${x.confirmer ? `<button class="secondaire petit" data-guide="${esc(x.confirmer)}" title="${x.libConfirmer ? 'Marquer l\'étape comme faite' : 'Les valeurs par défaut conviennent'}">${esc(x.libConfirmer || '✓ C\'est bon')}</button>` : ''}`);
    // Étape de la liste : une ligne compacte (titre, info tronquée, badges responsable / échéance, bouton d'action
    // principal) ; le reste (info complète, blocage, autres boutons, suivi, correction sur place) dans un détail ouvert
    // au clic sur l'étape, une seule étape ouverte à la fois
    const badges = x => (S && S.badgesEtape ? essai(() => S.badgesEtape(et, x)) || '' : '');
    const actionsSuivi = x => (S && S.actionsEtape ? essai(() => S.actionsEtape(et, x)) || '' : '');
    const boutons = x => (x.fait ? [] : [
      x.action && [1, `<button class="secondaire petit" data-guide="${esc(x.action[0])}">${esc(x.action[1])}</button>`],
      x.confirmer && [2, `<button class="secondaire petit" data-guide="${esc(x.confirmer)}" title="${x.libConfirmer ? 'Marquer l\'étape comme faite' : 'Les valeurs par défaut conviennent'}">${esc(x.libConfirmer || '✓ C\'est bon')}</button>`],
      x.tout && [3, `<button class="secondaire petit" data-guide="${esc(x.tout[0])}" title="Tous les calculs d'après l'inventaire, raccordés, puissances manquantes estimées">${esc(x.tout[1])}</button>`],
    ].filter(Boolean));
    let nLigne = 0;
    const ligne = (x, phase) => {
      const k = `guide-detail-${nLigne++}`, ouv = etapeOuverte === x.id, b = boutons(x), info = x.sansObjet ? `Motif : ${x.motif}${x.sansObjetPar ? ` (${x.sansObjetPar})` : ''}` : x.info || '';
      return `<li class="guide-etape${ouv ? ' ouverte' : ''}${x.bloquee ? ' bloquee' : ''}${x.etatEcheance === 'retard' ? ' suivi-retard' : ''}" data-etape="${esc(x.id)}">
        <div class="guide-ligne"><button type="button" class="guide-tete" aria-expanded="${ouv}" aria-controls="${k}" title="${esc(info)}"><span class="guide-chevron" aria-hidden="true"></span><strong class="guide-titre">${phase ? `${PHASE[x.phase].ico} ` : ''}${x.bloquee ? '🔒 ' : ''}${esc(x.titre)}</strong><span class="guide-resume petit muted">${esc(info)}</span></button>
        <span class="guide-badges">${badges(x)}</span><span class="guide-actions">${b.length ? b[0][1] : ''}</span></div>
        <div class="guide-detail" id="${k}"${ouv ? '' : ' hidden'}>${phase ? `<span class="petit muted">${PHASE[x.phase].ico} ${esc(PHASE[x.phase].libelle)} · ${esc(GROUPE[x.groupe].libelle)}</span>` : ''}${info ? `<p class="petit">${esc(info)}</p>` : ''}${x.bloquee ? lienBlocage(x, parId) : ''}
          ${b.length > 1 ? `<span class="guide-actions">${b.slice(1).map(y => y[1]).join('')}</span>` : ''}${actionsSuivi(x)}${x.fait ? '' : editeurHtml(et, x, true)}</div></li>`;
    };
    const puces = r.phases.filter(p => p.total || !p.active).map(p => `<span class="guide-puce${p.active ? '' : ' a-venir'}${p.active && p.pct === 100 ? ' faite' : ''}" title="${esc(p.active ? `${p.faits} / ${p.total} étape(s) faite(s)` : 'Phase à venir : l\'étude n\'est pas encore reliée à un chantier')}">${p.ico} ${esc(p.libelle)} <b>${p.active ? `${p.pct} %` : 'à venir'}</b></span>`).join('');
    let corps;
    if (V && V.liste) corps = V.liste.length ? `<ul class="guide-filtree">${V.liste.map(x => ligne(x, true)).join('')}</ul>` : `<p class="muted petit guide-vide">${esc(V.vide)}</p>`;
    else {
      const phasesHtml = r.phases.filter(p => p.total || !p.active).map(p => {
        const l = restes.filter(x => x.phase === p.id && x !== s);
        if (p.active && !l.length) return '';
        const groupes = GROUPES.filter(g => g[3] === p.id).map(([g]) => [g, l.filter(x => x.groupe === g)]).filter(([, y]) => y.length);
        const ouv = phasesOuvertes.has(p.id) ? phasesOuvertes.get(p.id) : p.active && (p.id === (s && s.phase) || l.length <= 6);
        return `<details class="guide-phase${p.active ? '' : ' a-venir'}" data-phase="${p.id}"${ouv ? ' open' : ''}><summary>${p.ico} <strong>${esc(p.libelle)}</strong> <span class="petit muted">${p.active ? `${p.pct} % · ${p.faits} / ${p.total} · ${l.length} à faire` : `à venir${l.length ? ` · ${l.length} étape(s) prévue(s)` : ''}`}</span></summary>
          ${!p.active ? `<p class="petit muted">${p.id === 'achats' ? 'S\'ouvre dès qu\'un matériel est choisi ou que l\'étude est reliée au chantier.' : 'S\'applique une fois l\'étude reliée au chantier Pipe-Fit (fiche de l\'étude, « Affaire Pipe-Fit »).'}</p>` : p.suivante && p.suivante !== s ? `<p class="petit guide-suivante-phase">➡️ Étape suivante de la phase : <strong>${esc(p.suivante.titre)}</strong></p>` : ''}
          ${groupes.map(([g, y]) => `<h4>${GROUPE[g].ico} ${esc(GROUPE[g].libelle)}</h4><ul>${y.map(x => ligne(x)).join('')}</ul>`).join('')}</details>`;
      }).join('');
      const autres = restes.filter(x => x !== s).length;
      corps = `${s ? `<div class="guide-suivante${s.bloquee ? ' bloquee' : ''}" data-etape="${esc(s.id)}"><span class="guide-ico" aria-hidden="true">${GROUPE[s.groupe].ico}</span><span class="guide-txt"><span class="petit muted">Étape suivante · ${esc(PHASE[s.phase].libelle)} · ${esc(GROUPE[s.groupe].libelle)}${s.dependants ? ` · ${s.dependants} étape(s) en dépendent` : ''}</span><strong>${esc(s.titre)}</strong><span class="petit">${esc(s.info)}</span>${s.bloquee ? lienBlocage(s, parId) : ''}${suivi(s)}</span><span class="guide-actions">${bouton(s, true)}</span>${editeurHtml(et, s)}</div>` : ''}
      ${autres ? `<details class="guide-liste"${ouvert ?? autres <= 6 ? ' open' : ''}><summary>${autres} autre(s) étape(s) à faire, par phase et par impact</summary>${phasesHtml}</details>` : ''}`;
    }
    return `<div class="carte guide-etude" id="guide-etude"><div class="parcours-tete"><strong>${!restes.filter(x => actives.has(x.phase)).length ? '✅ Reste à faire : rien pour les phases en cours' : `📝 Reste à faire — ${r.pct} %`}</strong>
        <div class="parcours-barre" role="progressbar" aria-label="Avancement des phases en cours" aria-valuenow="${r.pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${r.pct}%"></span></div><span class="petit muted">${r.faits} / ${r.total} étape(s)${V && V.resume ? ` · ${V.resume}` : ''}${lecture ? ' · <span class="guide-lecture" role="status">⏳ lecture du chantier dans Pipe-Fit…</span>' : ''}</span></div>
      <div class="guide-phases">${puces}</div>
      ${V ? V.barre : ''}
      ${corps}</div>`;
  }
  // Actions des boutons : dialogues et vues de l'application (globales du navigateur)
  function lier(root, et) {
    const guide = root && (root.id === 'guide-etude' ? root : root.querySelector('#guide-etude'));
    const dl = root.querySelector('.guide-liste');
    if (dl) dl.addEventListener('toggle', () => { ouvert = dl.open; });
    root.querySelectorAll('.guide-phase').forEach(d => d.addEventListener('toggle', () => { phasesOuvertes.set(d.dataset.phase, d.open); }));
    // Détail d'une étape : ouvert au clic (ou Entrée / Espace) sur sa ligne, l'étape ouverte avant se referme
    root.querySelectorAll('.guide-tete').forEach(t => t.onclick = () => {
      const li = t.closest('.guide-etape'), ouvrir = t.getAttribute('aria-expanded') !== 'true';
      root.querySelectorAll('.guide-tete[aria-expanded="true"]').forEach(o => {
        o.setAttribute('aria-expanded', 'false'); o.closest('.guide-etape').classList.remove('ouverte');
        const d = document.getElementById(o.getAttribute('aria-controls')); if (d) d.hidden = true;
      });
      if (ouvrir) { t.setAttribute('aria-expanded', 'true'); li.classList.add('ouverte'); const d = document.getElementById(t.getAttribute('aria-controls')); if (d) d.hidden = false; }
      etapeOuverte = ouvrir ? li.dataset.etape : null;
    });
    const recharger = () => { if (typeof App !== 'undefined' && App.render) App.render(); };
    const sauver = () => { if (typeof enregistrer === 'function') enregistrer(et); };
    root.querySelectorAll('[data-guide]').forEach(b => b.onclick = () => {
      const a = b.dataset.guide, [code, arg] = [a.split(':')[0], a.slice(a.indexOf(':') + 1)];
      if (code === 'champ') {
        const el = document.querySelector(`[data-e="${arg}"]`);
        if (el) { const f = el.closest('details'); if (f && !f.open) f.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); el.classList.add('guide-cible'); setTimeout(() => el.classList.remove('guide-cible'), 2500); }
        return;
      }
      if (code === 'inventaire') return dialogueInventaire(et);
      if (code === 'inventaire-revoir') return tableauInventaire(et, (et.inventaire || []).map(x => ({ ...x })), [], (et.inventaireReseaux || []).map(r => ({ ...r })), { ecarts: et.inventaireEcarts || [] });
      if (code === 'questions-moe') return dialogueQuestionsMoe(et);
      if (code === 'creer') return creerCalculInventaire(et, arg);
      if (code === 'creer-tout') return EtudeAuto.lancer(et);
      if (code === 'surfaces') return EtudeAuto.dialogueSurfaces(et);
      if (code === 'confirmer-estimes') { const n = et.notes.find(x => x.id === arg); if (n) { Estimations.confirmer(n); sauver(); recharger(); } return; }
      if (code === 'ajout') { const n = nouvelleNote(arg); et.notes.push(n); sauver(); location.hash = `#/etude/${et.id}/${n.id}`; return; }
      // Calcul annexe suggéré par le dossier : créé s'il est absent, sinon ouvert
      if (code === 'annexe') {
        const ex = (et.notes || []).find(x => x.type === arg);
        if (ex) { location.hash = `#/etude/${et.id}/${ex.id}`; return; }
        if (typeof Notes === 'undefined' || !Notes.TYPES[arg]) { if (typeof toast === 'function') toast('Calcul annexe indisponible dans cette version.', 4000); return; }
        const n = nouvelleNote(arg); et.notes.push(n); sauver(); if (typeof toast === 'function') toast(`Calcul « ${Notes.TYPES[arg].titre} » créé d'après le dossier de consultation.`, 4000); location.hash = `#/etude/${et.id}/${n.id}`; return;
      }
      if (code === 'note') { location.hash = `#/etude/${et.id}/${arg}`; return; }
      if (code === 'confirmer') { const n = et.notes.find(x => x.id === arg); if (n) { n.defautsConfirmes = true; sauver(); recharger(); } return; }
      // Étape confirmée à la main (devis comparés, réglages appliqués, réception, contrat…) : signature gardée
      if (code === 'fait') {
        const x = (derniers.get(et.id) || []).find(y => y.id === arg);
        et.guideFaits = { ...(et.guideFaits || {}), [arg]: { le: typeof aujourdhui === 'function' ? aujourdhui() : new Date().toISOString().slice(0, 10), sig: (x && x.signature) || '' } };
        sauver(); recharger(); return;
      }
      if (code === 'installation') { location.hash = `#/etude/${et.id}/installation`; return; }
      if (code === 'vrac') return dialogueVrac(et);
      if (code === 'registre') return dialogueRegistre(et);
      if (code === 'reserves-conformite') return dialogueReservesConformite(et);
      if (code === 'materiel') return dialogueMateriel(et);
      if (code === 'devis-comparer') return typeof comparatifDevis === 'function' ? comparatifDevis(et) : dialogueMateriel(et);
      if (code === 'reperes') return dialogueReperes(et, arg === 'reperes' ? '' : arg);
      if (code === 'consequences') return dialogueConsequences(et);
      if (code === 'plaques') return dialoguePlaques(et);
      if (code === 'reserves-levees') return dialogueReservesLevees(et);
      if (code === 'mesures') return dialogueMesures(et);
      if (code === 'comptages') return dialogueComptages(et);
      if (code === 'entretien') return dialogueEntretien(et);
      if (code === 'fiches-mes') return dialogueFichesMes(et);
      if (code === 'controle') return ControleEtude.dialogue(et);
      if (code === 'pdf') return genererNoteCalcul(et);
      if (code === 'diffuser') { const d = document.querySelector('#doc-diffuser'); if (d && !d.disabled) { d.scrollIntoView({ behavior: 'smooth', block: 'center' }); d.click(); } else { const c = document.querySelector('#doc-liste') || d; if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Émettez d\'abord une note de calcul (PDF), puis diffusez-la.', 5000); } }
    });
    if (!guide) return;
    // Correction sur place : la saisie est écrite dans la note ou le registre, puis l'étude est recalculée
    guide.querySelectorAll('[data-ed-ok]').forEach(b => b.onclick = () => {
      const id = b.dataset.edOk, x = (derniers.get(et.id) || []).find(y => y.id === id), zone = b.closest('[data-ed]');
      if (!x || !zone) return;
      const saisies = {};
      zone.querySelectorAll('[data-ed-champ]').forEach(el => { saisies[el.dataset.edChamp] = el.value; });
      const ed = x.editeur;
      if ((ed.type === 'climat' || ed.type === 'typeBatiment') && typeof appliquerDonneesEtude === 'function') {
        if (!saisies[ed.type]) { if (typeof toast === 'function') toast('Choisissez une valeur.', 3000); return; }
        return appliquerDonneesEtude(et, { [ed.type]: saisies[ed.type] });
      }
      const r = corriger(et, x, saisies);
      if (!r.ok) { if (typeof toast === 'function') toast(r.erreur, 4000); return; }
      sauver();
      if (typeof toast === 'function') toast(ed.type === 'gamme' ? `Modèle retenu : ${r.nom}${r.maj ? ` — ${r.maj} valeur(s) mise(s) à jour dans les calculs` : ''}` : `${r.valeurs || 0} valeur(s) enregistrée(s) dans le calcul, étude recalculée.`, 4000);
      recharger();
    });
    // Rafraîchir le guide sur place (données du chantier arrivées, suivi des étapes modifié)
    const rafraichir = () => {
      const g = document.querySelector('#guide-etude');
      if (!g) return recharger();
      const t = document.createElement('div'); t.innerHTML = html(et);
      const nv = t.firstElementChild;
      if (!nv) { g.remove(); return; }
      g.replaceWith(nv); lier(nv, et);
    };
    const S = Sv();
    if (S && S.lier) essai(() => S.lier(guide, et, rafraichir, () => derniers.get(et.id)));
    if (et.affaireId) chargerChantier(et).then(change => { const g = document.querySelector('#guide-etude'); if (g && (change || g.querySelector('.guide-lecture'))) rafraichir(); }).catch(() => {});
  }
  // Liste détaillée ouverte au prochain affichage (après « Créer toute l'étude »)
  const ouvrir = () => { ouvert = true; };
  return { restesAFaire, construire, synthese, valeursNote, suggestionsAnnexes, corriger, html, lier, ouvrir, chargerChantier, donneesChantier, GROUPES, PHASES };
})();
if (typeof module !== 'undefined') module.exports = GuideEtude;
