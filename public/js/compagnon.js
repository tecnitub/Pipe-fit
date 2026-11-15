// Ce que voient les compagnons (comptes « Opérateur ») : réglé par l'administrateur (Paramètres → Appli des compagnons).
// Le filtrage est fait par le serveur avant l'envoi : prix, montants, budgets d'heures, factures, taux et salaires
// ne partent jamais sur leur téléphone. Module partagé serveur / navigateur (démonstration).
const Compagnon = (() => {
  // [clé, libellé, valeur par défaut, précision]
  const OPTIONS = [
    ['client', 'Nom du client', true, 'Sinon, seuls le chantier et l\'adresse du site sont affichés.'],
    ['contactSite', 'Contact du client sur le site (nom, téléphone)', true, ''],
    ['materiel', 'Matériel prévu au devis, en détail', true, 'Liste des fournitures du chantier, par ouvrage et en total par article.'],
    ['quantites', 'Quantités du matériel prévu', true, ''],
    ['commandes', 'Commandes fournisseurs et livraisons attendues', true, 'Fournisseur, date de livraison, état ; jamais les prix.'],
    ['documents', 'Documents du chantier (plans, fiches techniques…)', true, 'Seuls les documents cochés « à transmettre aux compagnons ».'],
    ['collegues', 'Collègues affectés au même chantier', true, 'Sinon, chacun ne voit que son planning (et celui de son équipe pour un chef d\'équipe).'],
    ['heuresBudget', 'Heures prévues au devis (budget d\'heures du chantier)', false, ''],
    ['prix', 'Prix et montants (matériel, devis, commandes)', false, ''],
  ];
  // Chantiers visibles : ceux où le compagnon ou un membre de son équipe intervient sur la période (± perimetreJours
  // autour d'aujourd'hui) ; tousChantiers : ancien comportement (tous les chantiers, sans montants)
  const PERIMETRE_DEFAUT = 30, PERIMETRE_MAX = 365;
  const DEFAUT = { ...Object.fromEntries(OPTIONS.map(o => [o[0], o[2]])), perimetreJours: PERIMETRE_DEFAUT, tousChantiers: false };
  const joursPerimetre = R => { const n = Math.round(Number(R && R.perimetreJours)); return Number.isFinite(n) && n >= 0 ? Math.min(PERIMETRE_MAX, n) : PERIMETRE_DEFAUT; };
  const regles = settings => { const R = { ...DEFAUT, ...((settings && settings.compagnon) || {}) }; R.perimetreJours = joursPerimetre(R); R.tousChantiers = R.tousChantiers === true; return R; };
  // Listes jamais envoyées aux compagnons
  const MASQUEES = ['factures', 'situations', 'achats', 'efactures', 'consultations', 'chiffrages', 'envois', 'ouvrages', 'familles', 'zones', 'missions', 'fichesTech'];
  // Documents de sécurité (PPSPS, PGC, plan de prévention) : toujours transmis s'ils sont cochés, même sans les autres documents
  const SECURITE = ['Sécurité / PPSPS', 'PGC', 'Plan de prévention'];
  const sans = (o, cles) => { const r = { ...o }; cles.forEach(k => delete r[k]); return r; };

  // Devis accepté d'un chantier : désignations, quantités et fournitures, sans prix (ni heures sauf réglage)
  function devis(r, R) {
    if (r.statut !== 'Accepté' || !r.affaireId || !R.materiel) return null;
    const lignes = (r.lignes || []).map(l => {
      if (l.type === 'chapitre') return { type: 'chapitre', titre: l.titre, niveau: l.niveau, num: l.num };
      if (l.type === 'texte' || l.type === 'image') return l;
      const comp = (l.composants || []).filter(c => c.type !== 'mo' || R.heuresBudget).map(c => (c.type === 'mo'
        ? { type: 'mo', moId: c.moId, libelle: c.libelle, heures: c.heures, ...(R.prix ? { taux: c.taux } : {}) }
        : { type: 'f', articleId: c.articleId || '', designation: c.designation, unite: c.unite, ...(R.quantites ? { qte: c.qte } : {}), ...(R.prix ? { pu: c.pu } : {}) }));
      return { type: l.type || 'ouvrage', num: l.num, designation: l.designation, detail: l.detail, unite: l.unite, ...(R.quantites ? { qte: l.qte } : {}), ...(l.tva !== undefined && R.prix ? { tva: l.tva } : {}), composants: comp };
    });
    return { id: r.id, numero: r.numero, objet: r.objet, affaireId: r.affaireId, statut: r.statut, numAuto: r.numAuto, lignes, _v: r._v, _at: r._at, _by: r._by };
  }

  // ctx : { userId, equipe (ids visibles pour le planning), contacts (ids des contacts de chantier) }
  // Listes rattachées à un chantier (affaireId) : retirées hors du périmètre du compagnon
  const DU_CHANTIER = ['devis', 'commandes', 'rapports', 'reserves', 'receptions', 'consommations', 'epreuves', 'misesEnService', 'equilibrages', 'releves'];
  // Saisies personnelles (les siennes, celles de son équipe) : gardées même si leur chantier est sorti du périmètre
  const PERSONNELLES = ['temps', 'frais', 'enlevements', 'habilitations', 'notifications'];
  const horsPerimetre = (ctx, affaireId) => !!(ctx && ctx.chantiers && affaireId && !ctx.chantiers.has(affaireId));
  function filtrer(col, r, R, ctx) {
    if (!r) return r;
    if (MASQUEES.includes(col)) return null;
    if (col === 'affaires' && ctx && ctx.chantiers && !ctx.chantiers.has(r.id)) return null;
    if (DU_CHANTIER.includes(col) && horsPerimetre(ctx, r.affaireId)) {
      // Réserve qui lui est affectée : toujours visible ; sortie de stock d'un autre chantier : quantité seule (niveau du stock)
      if (col === 'reserves' && r.assigneA && r.assigneA === ctx.userId) return r;
      if (col === 'consommations' && r.stock) return { id: r.id, articleId: r.articleId || '', qte: r.qte, unite: r.unite, date: r.date, stock: true, _v: r._v, _at: r._at, _by: r._by };
      return null;
    }
    if (PERSONNELLES.includes(col) && horsPerimetre(ctx, r.affaireId) && !(ctx.equipeElargie || ctx.equipe || []).includes(r.userId)) return null;
    switch (col) {
      case 'notifications': return r.userId === ctx.userId ? r : null;
      case 'users': return sans(r, ['tauxHoraire', 'salaireHoraire', 'email', 'seuilCommande']);
      case 'mainoeuvre': return sans(r, ['tauxVente', 'tauxCout']);
      case 'articles': return R.prix ? sans(r, ['coutRevient']) : sans(r, ['prixVente', 'coutRevient']);
      case 'devis': return devis(r, R);
      case 'affaires': return { ...(ctx && ctx.chantiers ? { perimetre: ctx.chantiers.get(r.id) } : {}), ...sans(r, ['retenueGarantie', 'caution', 'rex', 'okFacturation', 'factureId', 'retenueLiberee', ...(R.heuresBudget ? [] : ['heuresPrevues'])]),
        clientId: r.clientId, documents: (r.documents || []).filter(d => d.visible && (R.documents || SECURITE.includes(d.categorie))) };
      // Plans de prévention annuels du client : consultables sur le chantier
      case 'entreprises': return { id: r.id, nom: R.client || r.categorie !== 'Client' ? r.nom : '', categorie: r.categorie, adresses: r.adresses || [], plansPrevention: r.plansPrevention || [], _v: r._v, _at: r._at, _by: r._by };
      case 'contacts': return R.contactSite && ctx.contacts.has(r.id) ? sans(r, ['email']) : null;
      case 'commandes': return R.commandes ? { ...sans(r, ['frais', 'port', 'conditions', 'pieceId', 'factureId']), lignes: (r.lignes || []).map(l => (R.prix ? l : sans(l, ['pu', 'cout', 'remise']))) } : null;
      case 'consommations': return R.prix ? r : sans(r, ['pu', 'cout']);
      // Son planning et celui de son équipe ; celui des collègues (réglage) sur les chantiers de son périmètre
      case 'planning': return ctx.equipe.includes(r.userId) || (R.collegues && !horsPerimetre(ctx, r.affaireId)) ? r : null;
      // Habilitations et visites médicales : les siennes (et celles de son équipe pour un chef d'équipe)
      case 'habilitations': return ctx.equipe.includes(r.userId) ? r : null;
      // Enlèvements au comptoir : les siens et ceux de son équipe
      case 'enlevements': return ctx.equipe.includes(r.userId) ? r : null;
      // Véhicule et outillage confiés à soi ou à son équipe, sans valeur d'achat
      // Appareils de mesure (manomètre étalon pour les épreuves) : visibles de tous, avec leur étalonnage
      // Outillage étiqueté QR (sorti en scannant l'étiquette) : visible de tous
      case 'materiels': return (r.affectation && ctx.equipe.includes(r.affectation.userId)) || r.scan || /mesure|manom/i.test(`${r.categorie} ${r.designation}`) ? sans(r, ['valeur', 'historique']) : null;
      default: return r;
    }
  }
  function filtrerSettings(s) { return sans(s || {}, ['compta', 'tauxHoraireDefaut']); }
  /* ---------- Périmètre : chantiers du compagnon et de son équipe ---------- */
  // Équipe (modèle du CRM : fiche « Équipe habituelle de », chefId) : le compagnon, son chef d'équipe, les membres de
  // l'équipe qu'il dirige et ceux de la même équipe que lui (même chef d'équipe)
  function equipeDe(userId, users) {
    const moi = (users || []).find(u => u && u.id === userId) || {}, chef = moi.chefId || '';
    return [...new Set([userId, chef, ...(users || []).filter(u => u && u.chefId && (u.chefId === userId || (chef && u.chefId === chef))).map(u => u.id)].filter(Boolean))];
  }
  const jourDecale = (jour, n) => { const d = new Date(`${jour}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  // Lundi d'une semaine ISO « 2026-W07 »
  function lundiSemaine(s) {
    const m = /^(\d{4})-W(\d{1,2})$/.exec(String(s || ''));
    if (!m) return '';
    const j4 = new Date(Date.UTC(+m[1], 0, 4)), lundi1 = new Date(j4.getTime() - ((j4.getUTCDay() + 6) % 7) * 86400000);
    return new Date(lundi1.getTime() + (+m[2] - 1) * 7 * 86400000).toISOString().slice(0, 10);
  }
  // Une saisie datée (jour, ou semaine du planning) tombe-t-elle dans la période [debut, fin] ?
  const dansPeriode = (x, debut, fin) => {
    if (x.date) return String(x.date).slice(0, 10) >= debut && String(x.date).slice(0, 10) <= fin;
    const l = lundiSemaine(x.semaine);
    return !!l && l <= fin && jourDecale(l, 6) >= debut;
  };
  // Travaux du terrain (bon d'intervention, épreuve, mise en service, équilibrage, prise de cotes) sur la période
  const SAISIES_TERRAIN = ['rapports', 'epreuves', 'misesEnService', 'equilibrages', 'releves'];
  // Données à fournir à contexte() / perimetre() (en plus des fiches de l'équipe et des chantiers)
  const SOURCES = ['planning', 'temps', 'reserves', ...SAISIES_TERRAIN];
  const TERMINES = ['Terminé', 'Facturé', 'Clos', 'Clôturé', 'Annulé', 'Archivé'];
  // Chantiers accessibles : Map affaireId -> 'moi' | 'equipe' (null : tous les chantiers, réglage « accès à tous »).
  // Sources (aucune n'est modifiable par le compagnon hors de son périmètre) : planning du bureau sur la période, heures
  // pointées et travaux du terrain (bons d'intervention, PV d'essais, relevés) sur la période, réserves qui lui sont affectées (ou à son équipe) non levées,
  // interventions hors devis ouvertes par lui ou son équipe (en cours, ou créées sur la période).
  // d : { users, affaires, ...SOURCES } ; jour : 'AAAA-MM-JJ' (aujourd'hui)
  function perimetre(userId, d, R, jour) {
    R = R || DEFAUT;
    if (R.tousChantiers) return null;
    const out = new Map();
    if (!userId) return out;
    const equipe = new Set(equipeDe(userId, d.users)), n = joursPerimetre(R), debut = jourDecale(jour, -n), fin = jourDecale(jour, n);
    const noter = (affaireId, uid) => { if (!affaireId || !equipe.has(uid)) return; if (uid === userId) out.set(affaireId, 'moi'); else if (!out.has(affaireId)) out.set(affaireId, 'equipe'); };
    (d.planning || []).forEach(p => { if (p && p.affaireId && dansPeriode(p, debut, fin)) noter(p.affaireId, p.userId); });
    (d.temps || []).forEach(t => { if (t && t.affaireId && dansPeriode(t, debut, fin)) noter(t.affaireId, t.userId); });
    SAISIES_TERRAIN.forEach(col => (d[col] || []).forEach(r => { if (r && r.affaireId && dansPeriode(r, debut, fin)) [r.userId, ...(r.intervenants || [])].forEach(u => noter(r.affaireId, u)); }));
    (d.reserves || []).forEach(r => { if (r && r.affaireId && r.assigneA && r.statut !== 'Levée') noter(r.affaireId, r.assigneA); });
    (d.affaires || []).forEach(a => {
      if (!a || a.type !== 'horsDevis') return;
      const cree = String(a.creeLe || a.dateCreation || '').slice(0, 10);
      if (!TERMINES.includes(a.statut) || (cree >= debut && cree <= fin)) [a.creeParId, a.ouvertePar].forEach(u => noter(a.id, u));
    });
    return out;
  }
  // Contexte d'un compagnon : son équipe (pour le planning, les habilitations… : lui et l'équipe qu'il dirige), les
  // contacts des chantiers et, si les données de la période sont fournies (d), son périmètre de chantiers
  function contexte(userId, users, affaires, d, R, jour) {
    const chantiers = d ? perimetre(userId, { users, affaires, ...d }, R, jour || new Date().toISOString().slice(0, 10)) : null;
    const visibles = chantiers ? affaires.filter(a => chantiers.has(a.id)) : affaires;
    return { userId, equipe: [userId, ...users.filter(u => u.chefId === userId).map(u => u.id)], equipeElargie: equipeDe(userId, users), chantiers,
      contacts: new Set(visibles.flatMap(a => [a.contactId, a.moeContactId]).filter(Boolean)) };
  }
  // Chantier autorisé pour ce contexte (aucun chantier : toujours autorisé)
  const autorise = (ctx, affaireId) => !horsPerimetre(ctx, affaireId);
  function filtrerTout(data, R, ctx) {
    const out = { settings: filtrerSettings(data.settings) };
    Object.keys(data).filter(k => k !== 'settings').forEach(col => { out[col] = (data[col] || []).map(r => filtrer(col, r, R, ctx)).filter(Boolean); });
    return out;
  }
  return { OPTIONS, DEFAUT, PERIMETRE_DEFAUT, regles, filtrer, filtrerSettings, filtrerTout, contexte, perimetre, equipeDe, SOURCES, autorise, lundiSemaine, MASQUEES, DU_CHANTIER, PERSONNELLES };
})();
if (typeof module !== 'undefined') module.exports = Compagnon;
