// Assistant : on lui confie une tâche en langage courant (« commande chez Téréva pour le chantier de Rumilly : 20 coudes
// 3D inox DN50, livraison jeudi sur le chantier »), il retrouve le chantier, le fournisseur, les articles et les derniers prix,
// puis PRÉPARE la commande (brouillon) ou la demande de prix. Rien ne part sans validation : l'envoi reste le bouton
// « Envoyer » habituel. Il agit avec les droits de la personne connectée ; les compagnons n'ont que les actions cochées dans
// les Paramètres (demande de matériel au bureau, planning, infos du chantier, signalement, recherche d'articles).
// Modèle : Claude (API Anthropic) avec des outils métier exécutés ici ; la conversation est conservée telle quelle.
const crypto = require('node:crypto');

const MODELE_DEFAUT = 'claude-opus-5-5';
const MODELES = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
// Actions que l'administrateur peut ouvrir aux compagnons (Paramètres → Assistant)
const DROITS_COMPAGNON = [
  ['materiel', 'Demander du matériel (demande de commande transmise au bureau, à valider)'],
  ['planning', 'Consulter son planning'],
  ['chantier', 'Consulter les informations du chantier (adresse, contact, consignes)'],
  ['signaler', 'Signaler un problème ou une réserve au bureau'],
  ['articles', 'Rechercher un article dans la bibliothèque (sans les prix)'],
];
const ITERATIONS_MAX = 10;

function creer({ DB, db, broadcast, notifier }) {
  db.exec('CREATE TABLE IF NOT EXISTS assistant_conv (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, titre TEXT, messages TEXT NOT NULL, fil TEXT NOT NULL, updated_at TEXT NOT NULL)');

  /* ---------- Réglages ---------- */
  function config() {
    const c = DB.getConfig(db, 'assistant') || {}, comp = c.compagnons || {};
    return { actif: !!c.actif, cleApi: c.cleApi || process.env.ANTHROPIC_API_KEY || '', modele: MODELES.includes(c.modele) ? c.modele : MODELE_DEFAUT,
      compagnons: { actif: !!comp.actif, droits: Object.fromEntries(DROITS_COMPAGNON.map(([k]) => [k, !!(comp.droits || {})[k]])) } };
  }
  const publique = () => { const c = config(); return { actif: c.actif, cleDefinie: !!c.cleApi, cleEnv: !(DB.getConfig(db, 'assistant') || {}).cleApi && !!process.env.ANTHROPIC_API_KEY, modele: c.modele, modeles: MODELES, compagnons: c.compagnons, droitsCompagnon: DROITS_COMPAGNON }; };
  function enregistrerConfig(b) {
    const c = DB.getConfig(db, 'assistant') || {};
    c.actif = !!b.actif;
    if (MODELES.includes(b.modele)) c.modele = b.modele;
    if (typeof b.cleApi === 'string' && b.cleApi.trim()) c.cleApi = b.cleApi.trim().slice(0, 300);
    if (b.effacerCle) delete c.cleApi;
    if (b.compagnons) c.compagnons = { actif: !!b.compagnons.actif, droits: Object.fromEntries(DROITS_COMPAGNON.map(([k]) => [k, !!(b.compagnons.droits || {})[k]])) };
    if (c.actif && !(c.cleApi || process.env.ANTHROPIC_API_KEY)) throw new Error('Renseignez la clé API Anthropic avant d\'activer l\'assistant.');
    DB.setConfig(db, 'assistant', c);
    return publique();
  }
  // Ce que ce compte peut faire avec l'assistant
  function acces(acc) {
    const c = config();
    if (!c.actif || !c.cleApi) return { actif: false, droits: [] };
    if (['admin', 'charge'].includes(acc.role)) return { actif: true, bureau: true, droits: ['bureau'] };
    if (acc.role === 'atelier' && c.compagnons.actif) { const d = Object.keys(c.compagnons.droits).filter(k => c.compagnons.droits[k]); return { actif: d.length > 0, bureau: false, droits: d }; }
    return { actif: false, droits: [] };
  }

  /* ---------- Données ---------- */
  const tous = col => db.prepare('SELECT id FROM records WHERE col = ?').all(col).map(r => DB.getRecord(db, col, r.id)).filter(Boolean);
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const correspond = (texte, ...champs) => { const mots = norm(texte).split(/[^a-z0-9]+/).filter(m => m.length > 1); const h = norm(champs.join(' ')); return mots.length ? mots.filter(m => h.includes(m)).length / mots.length : 0; };
  const meilleurs = (liste, texte, champs, n = 8) => liste.map(x => ({ x, s: correspond(texte, ...champs(x)) })).filter(y => y.s >= 0.5).sort((a, b) => b.s - a.s).slice(0, n).map(y => y.x);
  const nomEnt = id => (DB.getRecord(db, 'entreprises', id) || {}).nom || '';
  const nomUser = id => (DB.getRecord(db, 'users', id) || {}).nom || '';
  const actifs = () => tous('affaires').filter(a => !a.archive && ['En préparation', 'En cours', 'Ouvert'].includes(a.statut));
  const siteDe = a => ((DB.getRecord(db, 'entreprises', a.clientId) || {}).adresses || []).find(s => s.id === a.siteId);
  const adresse = s => (s ? [s.libelle, s.adresse, [s.cp, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '');
  const r2 = x => Math.round(x * 100) / 100;
  // Dernier prix payé : lignes des commandes (hors annulées), la plus récente
  function dernierPrix(articleId, designation, fournisseurId) {
    let best = null;
    for (const c of tous('commandes')) {
      if (c.statut === 'Annulée' || (fournisseurId && c.fournisseurId !== fournisseurId)) continue;
      for (const l of c.lignes || []) {
        if (!(articleId ? l.articleId === articleId : norm(l.designation) === norm(designation)) || !(Number(l.pu) > 0)) continue;
        if (!best || (c.date || '') > best.date) best = { pu: Number(l.pu), date: c.date || '', commande: c.numero || '', fournisseur: nomEnt(c.fournisseurId) };
      }
    }
    return best;
  }
  function creerRecord(col, obj, par) {
    const id = crypto.randomBytes(8).toString('hex'), now = new Date().toISOString();
    const n = DB.NUMBERING[col];
    if (n) obj[n[0]] = DB.nextNumber(db, col, obj);
    db.prepare('INSERT INTO records (col, id, data, version, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)').run(col, id, JSON.stringify({ ...obj, id }), now, par);
    DB.audit(db, par, 'création par l\'assistant', col, id, obj.numero || obj.ref || '');
    const record = DB.getRecord(db, col, id);
    broadcast('change', { col, record, client: null });
    return record;
  }
  const lignesPropres = (lignes, prix) => (Array.isArray(lignes) ? lignes : []).slice(0, 60).map(l => {
    const art = l.articleId && DB.getRecord(db, 'articles', String(l.articleId));
    return { articleId: art ? art.id : '', designation: String((art && art.designation) || l.designation || 'Fourniture').slice(0, 200), unite: String(l.unite || (art && art.unite) || 'u').slice(0, 10),
      qte: Math.max(0, Number(l.qte) || 0), ...(prix ? { pu: r2(Number(l.pu) > 0 ? Number(l.pu) : art ? Number(art.coutRevient) || 0 : 0) } : { pu: 0 }), ...(art && art.ref ? { refFournisseur: art.ref } : {}) };
  }).filter(l => l.qte > 0);
  const chantierOuErreur = id => { const a = id && DB.getRecord(db, 'affaires', String(id)); if (id && !a) throw new Error(`Chantier ${id} introuvable : utilisez chercher_chantiers.`); return a || null; };

  /* ---------- Outils ---------- */
  const S = (props, requis = []) => ({ type: 'object', properties: props, required: requis, additionalProperties: false });
  const LIGNES = { type: 'array', items: S({ articleId: { type: 'string', description: 'id de l\'article de la bibliothèque (chercher_articles), vide si hors bibliothèque' }, designation: { type: 'string' }, qte: { type: 'number' }, unite: { type: 'string' }, pu: { type: 'number', description: 'prix unitaire HT négocié, sinon omis (prix de la bibliothèque)' } }, ['designation', 'qte']) };
  const OUTILS = [
    { name: 'chercher_chantiers', droit: 'tous', description: 'Trouve les chantiers en cours d\'après un code (CH-2026-001), un nom, un client ou une ville. Renvoie id, code, nom, client, adresse du site, chargé d\'affaires.',
      input_schema: S({ texte: { type: 'string' } }, ['texte']),
      run: (i, acc, bureau) => meilleurs(actifs(), i.texte, a => [a.code, a.nom, nomEnt(a.clientId), adresse(siteDe(a))]).map(a => ({ id: a.id, code: a.code, nom: a.nom, client: nomEnt(a.clientId), site: adresse(siteDe(a)), chargeAffaires: nomUser(a.chargeId), ...(bureau ? { statut: a.statut } : {}) })) },
    { name: 'chercher_fournisseurs', droit: 'bureau', description: 'Trouve les fournisseurs d\'après leur nom ou leur secteur. Renvoie id, nom, e-mail, ville.',
      input_schema: S({ texte: { type: 'string' } }, ['texte']),
      run: i => meilleurs(tous('entreprises').filter(e => /fournisseur/i.test(e.categorie || '')), i.texte, e => [e.nom, e.secteur]).map(e => ({ id: e.id, nom: e.nom, email: e.email || '', secteur: e.secteur || '' })) },
    { name: 'chercher_articles', droit: 'articles', description: 'Cherche des articles dans la bibliothèque (désignation, référence, DN, matière). Au bureau : prix de la bibliothèque et dernier prix payé (fournisseur, date). Un appel par article demandé.',
      input_schema: S({ texte: { type: 'string', description: 'ex. « coude 3D inox 316L DN50 »' }, fournisseurId: { type: 'string', description: 'pour le dernier prix payé chez ce fournisseur' } }, ['texte']),
      run: (i, acc, bureau) => meilleurs(tous('articles'), i.texte, a => [a.ref, a.designation, a.famille, a.sousFamille]).map(a => ({ id: a.id, ref: a.ref || '', designation: a.designation, unite: a.unite || 'u', fournisseurHabituel: nomEnt(a.fournisseurId),
        ...(bureau ? { prixBibliotheque: Number(a.coutRevient) || 0, dernierPrixPaye: dernierPrix(a.id, a.designation, i.fournisseurId) } : {}) })) },
    { name: 'preparer_commande', droit: 'bureau', description: 'Prépare une commande fournisseur en BROUILLON (rien n\'est envoyé : la personne la valide et l\'envoie elle-même). Lignes avec articleId quand l\'article est dans la bibliothèque.',
      input_schema: S({ fournisseurId: { type: 'string' }, affaireId: { type: 'string', description: 'chantier ; vide pour le stock atelier' }, lignes: LIGNES, dateLivraison: { type: 'string', description: 'AAAA-MM-JJ' }, note: { type: 'string' } }, ['fournisseurId', 'lignes']),
      run: (i, acc) => {
        const f = DB.getRecord(db, 'entreprises', String(i.fournisseurId || ''));
        if (!f) throw new Error('Fournisseur introuvable : utilisez chercher_fournisseurs.');
        const a = chantierOuErreur(i.affaireId), lignes = lignesPropres(i.lignes, true);
        if (!lignes.length) throw new Error('Aucune ligne avec une quantité.');
        const c = creerRecord('commandes', { numero: '', fournisseurId: f.id, affaireId: a ? a.id : '', date: new Date().toISOString().slice(0, 10), dateLivraison: /^\d{4}-\d{2}-\d{2}$/.test(i.dateLivraison || '') ? i.dateLivraison : '',
          statut: 'Brouillon', lignes, note: String(i.note || '').slice(0, 500), origine: 'assistant', preparePar: acc.nom || acc.login }, `Assistant (${acc.login})`);
        const total = r2(lignes.reduce((t, l) => t + l.qte * l.pu, 0));
        return { action: { type: 'commande', id: c.id, numero: c.numero, fournisseur: f.nom, chantier: a ? `${a.code} ${a.nom}` : 'stock atelier', total, lignes: lignes.length },
          resultat: { id: c.id, numero: c.numero, statut: 'Brouillon', totalHT: total, livraison: a ? adresse(siteDe(a)) || 'chantier' : 'atelier', lignesSansPrix: lignes.filter(l => !l.pu).map(l => l.designation), horsBibliotheque: lignes.filter(l => !l.articleId).map(l => l.designation) } };
      } },
    { name: 'preparer_consultation', droit: 'bureau', description: 'Prépare une demande de prix (consultation) auprès de plusieurs fournisseurs, en brouillon : la personne l\'envoie elle-même.',
      input_schema: S({ objet: { type: 'string' }, affaireId: { type: 'string' }, fournisseurIds: { type: 'array', items: { type: 'string' } }, lignes: LIGNES, dateLimite: { type: 'string', description: 'AAAA-MM-JJ' } }, ['objet', 'fournisseurIds', 'lignes']),
      run: (i, acc) => {
        const a = chantierOuErreur(i.affaireId), lignes = lignesPropres(i.lignes, false).map(({ pu, refFournisseur, ...l }) => l);
        const fs = [...new Set(i.fournisseurIds || [])].filter(id => DB.getRecord(db, 'entreprises', id)).map(entrepriseId => ({ entrepriseId, statut: 'À consulter' }));
        if (!fs.length || !lignes.length) throw new Error('Il faut au moins un fournisseur (chercher_fournisseurs) et une ligne.');
        const c = creerRecord('consultations', { ref: '', objet: String(i.objet).slice(0, 200), affaireId: a ? a.id : '', date: new Date().toISOString().slice(0, 10), dateLimite: /^\d{4}-\d{2}-\d{2}$/.test(i.dateLimite || '') ? i.dateLimite : '',
          dateLivraison: '', statut: 'En cours', lignes, fournisseurs: fs, origine: 'assistant' }, `Assistant (${acc.login})`);
        return { action: { type: 'consultation', id: c.id, numero: c.ref, fournisseurs: fs.map(x => nomEnt(x.entrepriseId)), lignes: lignes.length }, resultat: { id: c.id, ref: c.ref, fournisseurs: fs.length, lignes: lignes.length } };
      } },
    { name: 'etat_chantier', droit: 'bureau', description: 'Point sur un chantier : statut, heures pointées, commandes (n°, fournisseur, statut, montant), demandes de prix en cours, prochaines affectations.',
      input_schema: S({ affaireId: { type: 'string' } }, ['affaireId']),
      run: i => {
        const a = chantierOuErreur(i.affaireId), auj = new Date().toISOString().slice(0, 10);
        return { code: a.code, nom: a.nom, statut: a.statut, client: nomEnt(a.clientId), chargeAffaires: nomUser(a.chargeId), heuresPointees: r2(tous('temps').filter(t => t.affaireId === a.id).reduce((s, t) => s + (Number(t.heures) || 0), 0)),
          commandes: tous('commandes').filter(c => c.affaireId === a.id).map(c => ({ numero: c.numero, fournisseur: nomEnt(c.fournisseurId), statut: c.statut, totalHT: r2((c.lignes || []).reduce((t, l) => t + (Number(l.qte) || 0) * (Number(l.pu) || 0), 0)), livraison: c.dateLivraison || '' })),
          demandesDePrix: tous('consultations').filter(c => c.affaireId === a.id && c.statut === 'En cours').map(c => ({ ref: c.ref, objet: c.objet })),
          prochainesAffectations: tous('planning').filter(p => p.affaireId === a.id && p.date >= auj && !p.absence).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 15).map(p => ({ date: p.date, compagnon: nomUser(p.userId), tache: p.tache || '' })) };
      } },
    { name: 'planning', droit: 'planning', description: 'Affectations du planning (compagnon : les siennes ; bureau : celles d\'une personne, d\'après son nom). Par défaut les 14 prochains jours.',
      input_schema: S({ personne: { type: 'string', description: 'nom (bureau uniquement)' }, du: { type: 'string' }, au: { type: 'string' } }),
      run: (i, acc, bureau) => {
        const du = i.du || new Date().toISOString().slice(0, 10), au = i.au || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
        const uid = bureau && i.personne ? (meilleurs(tous('users'), i.personne, u => [u.nom], 1)[0] || {}).id : acc.user_id;
        if (!uid) return { erreur: bureau ? 'Personne introuvable' : 'Compte non relié à une personne du planning' };
        return tous('planning').filter(p => p.userId === uid && p.date >= du && p.date <= au).sort((x, y) => x.date.localeCompare(y.date))
          .map(p => p.absence ? { date: p.date, absence: p.absence } : { date: p.date, chantier: (DB.getRecord(db, 'affaires', p.affaireId) || {}).code || '', tache: p.tache || '', debut: p.debut || '', fin: p.fin || '', note: p.note || '' });
      } },
    { name: 'infos_chantier', droit: 'chantier', description: 'Informations pratiques d\'un chantier : adresse du site, contact sur place, chargé d\'affaires, consignes.',
      input_schema: S({ affaireId: { type: 'string' } }, ['affaireId']),
      run: i => { const a = chantierOuErreur(i.affaireId), k = DB.getRecord(db, 'contacts', a.contactId) || {}; return { code: a.code, nom: a.nom, site: adresse(siteDe(a)), contact: [k.prenom, k.nom].filter(Boolean).join(' '), telContact: k.mobile || k.tel || '', chargeAffaires: nomUser(a.chargeId), consignes: a.consignes || a.acces || '' }; } },
    { name: 'demander_materiel', droit: 'materiel', description: 'Compagnon : transmet au bureau une demande de matériel pour un chantier (le bureau choisit le fournisseur, valide et commande).',
      input_schema: S({ affaireId: { type: 'string' }, lignes: LIGNES, pourLe: { type: 'string', description: 'AAAA-MM-JJ' }, note: { type: 'string' } }, ['affaireId', 'lignes']),
      run: (i, acc) => {
        const a = chantierOuErreur(i.affaireId), lignes = lignesPropres(i.lignes, true);
        if (!lignes.length) throw new Error('Aucune ligne avec une quantité.');
        const c = creerRecord('commandes', { numero: '', fournisseurId: '', affaireId: a.id, date: new Date().toISOString().slice(0, 10), dateLivraison: /^\d{4}-\d{2}-\d{2}$/.test(i.pourLe || '') ? i.pourLe : '', statut: 'Brouillon',
          lignes, note: String(i.note || '').slice(0, 500), origine: 'assistant', demandePar: acc.nom || acc.login }, `Assistant (${acc.login})`);
        if (notifier && a.chargeId) notifier({ type: 'assistant', userId: a.chargeId, affaireId: a.id, titre: `Demande de matériel — ${a.code}`, texte: `${acc.nom || acc.login} : ${lignes.map(l => `${l.qte} ${l.unite} ${l.designation}`).join(', ')}`.slice(0, 300), lien: `#/commandes/${c.id}`, date: new Date().toISOString(), lu: false });
        return { action: { type: 'demande', id: c.id, numero: c.numero, chantier: `${a.code} ${a.nom}`, lignes: lignes.length }, resultat: { transmise: true, numero: c.numero, a: nomUser(a.chargeId) || 'le bureau' } };
      } },
    { name: 'signaler', droit: 'signaler', description: 'Compagnon : signale un problème, un manque ou une réserve au bureau (chargé d\'affaires du chantier).',
      input_schema: S({ affaireId: { type: 'string' }, sujet: { type: 'string' }, details: { type: 'string' }, urgent: { type: 'boolean' } }, ['sujet', 'details']),
      run: (i, acc) => {
        const a = chantierOuErreur(i.affaireId);
        const dest = a && a.chargeId ? [a.chargeId] : tous('users').filter(u => u.role === 'charge').map(u => u.id);
        dest.forEach(uid => notifier && notifier({ type: 'assistant', userId: uid, affaireId: a ? a.id : '', titre: `${i.urgent ? '⚠️ URGENT — ' : ''}${String(i.sujet).slice(0, 80)}${a ? ` (${a.code})` : ''}`, texte: `${acc.nom || acc.login} : ${String(i.details).slice(0, 400)}`, lien: a ? `#/chantier/${a.id}` : '', date: new Date().toISOString(), lu: false }));
        DB.audit(db, acc.login, 'signalement via l\'assistant', 'affaires', a ? a.id : null, String(i.sujet).slice(0, 80));
        return { action: { type: 'signalement', chantier: a ? a.code : '', sujet: i.sujet }, resultat: { transmis: dest.length } };
      } },
  ];
  const outilsPour = acces => OUTILS.filter(o => (acces.bureau ? o.droit !== 'materiel' && o.droit !== 'signaler' && o.droit !== 'chantier' : o.droit !== 'bureau' && (o.droit === 'tous' || acces.droits.includes(o.droit))));

  function systeme(acces) {
    const s = DB.getSettings(db) || {};
    return [`Tu es l'assistant de ${s.societe || 'l\'entreprise'}, entreprise de tuyauterie industrielle et de génie climatique, intégré à son logiciel de gestion Pipe-Fit.`,
      acces.bureau ? 'Tu aides le bureau (chargés d\'affaires, achats) : préparer des commandes fournisseurs et des demandes de prix, faire le point sur un chantier, consulter le planning.'
        : 'Tu aides un compagnon sur chantier : uniquement les actions de tes outils. Tu ne passes jamais de commande toi-même : tu transmets des demandes au bureau.',
      'Règles :',
      '- Utilise les outils pour retrouver le chantier, le fournisseur et les articles avant de préparer quoi que ce soit ; ne devine jamais un identifiant.',
      '- Une commande ou une demande de prix est préparée en brouillon : rien n\'est envoyé, la personne valide et envoie elle-même. Dis-le clairement.',
      '- S\'il manque une information indispensable (fournisseur, chantier, quantité) ou si plusieurs articles correspondent sans qu\'on puisse trancher, pose une question courte au lieu de deviner.',
      '- Un article absent de la bibliothèque peut être commandé en ligne libre (désignation précise) : signale-le.',
      acces.bureau ? '- Prix HT. Utilise le dernier prix payé chez le fournisseur s\'il existe, sinon le prix de la bibliothèque ; signale un écart notable entre les deux.' : '- Ne parle jamais de prix ni de montants.',
      '- Réponds en français, brièvement, avec un récapitulatif clair (n° du brouillon, fournisseur, chantier, lignes, total HT au bureau).'].join('\n');
  }

  /* ---------- Conversation ---------- */
  function conversation(acc, id) {
    const r = id && db.prepare('SELECT * FROM assistant_conv WHERE id = ? AND account_id = ?').get(String(id), acc.id);
    return r ? { id: r.id, titre: r.titre, messages: JSON.parse(r.messages), fil: JSON.parse(r.fil) } : null;
  }
  const sauver = (acc, c) => db.prepare('INSERT INTO assistant_conv (id, account_id, titre, messages, fil, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET messages = excluded.messages, fil = excluded.fil, titre = excluded.titre, updated_at = excluded.updated_at')
    .run(c.id, acc.id, c.titre, JSON.stringify(c.messages), JSON.stringify(c.fil), new Date().toISOString());
  const liste = acc => db.prepare('SELECT id, titre, updated_at FROM assistant_conv WHERE account_id = ? ORDER BY updated_at DESC LIMIT 20').all(acc.id);

  async function message(acc, { conversationId, texte }) {
    const ac = acces(acc);
    if (!ac.actif) throw Object.assign(new Error('L\'assistant n\'est pas activé pour votre compte (Paramètres → Assistant).'), { status: 403 });
    const t = String(texte || '').trim().slice(0, 4000);
    if (!t) throw Object.assign(new Error('Message vide'), { status: 400 });
    let Anthropic;
    try { Anthropic = require('@anthropic-ai/sdk').Anthropic; } catch (e) { throw new Error('Module de l\'assistant absent du serveur : relancez l\'installation (npm ci).'); }
    const cfg = config(), client = new Anthropic({ apiKey: cfg.cleApi, ...(process.env.ASSISTANT_API_URL ? { baseURL: process.env.ASSISTANT_API_URL } : {}), maxRetries: 2, timeout: 120000 });
    const conv = conversation(acc, conversationId) || { id: crypto.randomBytes(8).toString('hex'), titre: t.slice(0, 80), messages: [], fil: [] };
    const outils = outilsPour(ac), defs = outils.map(({ name, description, input_schema }) => ({ name, description, input_schema, strict: true }));
    // Date du jour dans le message (pas dans le système, qui reste identique d'une demande à l'autre)
    conv.messages.push({ role: 'user', content: `[${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}] ${t}` });
    conv.fil.push({ role: 'user', texte: t, date: new Date().toISOString() });
    const actions = [];
    let reponse = '';
    try {
      for (let n = 0; n < ITERATIONS_MAX; n++) {
        const r = await client.beta.messages.create({
          model: cfg.modele, max_tokens: 16000, system: systeme(ac), tools: defs, messages: conv.messages,
          output_config: { effort: 'medium' }, cache_control: { type: 'ephemeral' },
          ...(cfg.modele === 'claude-haiku-5-5' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
        });
        // Conversation conservée telle quelle (blocs de réflexion compris), sans retouche
        conv.messages.push({ role: 'assistant', content: r.content });
        const textes = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        if (r.stop_reason === 'refusal') { reponse = 'Je ne peux pas traiter cette demande.'; break; }
        if (r.stop_reason === 'pause_turn') continue;
        const appels = r.content.filter(b => b.type === 'tool_use');
        if (r.stop_reason !== 'tool_use' || !appels.length) { reponse = textes || (r.stop_reason === 'max_tokens' ? 'Réponse trop longue, interrompue.' : ''); break; }
        const resultats = [];
        for (const b of appels) {
          const o = outils.find(x => x.name === b.name);
          try {
            if (!o) throw new Error('Action non autorisée pour ce compte');
            const sortie = o.run(b.input || {}, acc, ac.bureau);
            if (sortie && sortie.action) actions.push(sortie.action);
            resultats.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(sortie && sortie.resultat !== undefined ? sortie.resultat : sortie).slice(0, 20000) });
          } catch (e) { resultats.push({ type: 'tool_result', tool_use_id: b.id, content: e.message, is_error: true }); }
        }
        conv.messages.push({ role: 'user', content: resultats });
        if (n === ITERATIONS_MAX - 1) reponse = textes || 'Je n\'ai pas pu terminer : reformulez la demande plus simplement.';
      }
    } catch (e) {
      // Échec de l'appel : la question reste dans le fil, la conversation API repart sans elle
      conv.messages = conv.messages.slice(0, conv.messages.findLastIndex(m => m.role === 'user' && typeof m.content === 'string'));
      conv.fil.push({ role: 'assistant', texte: messageErreur(e, Anthropic), erreur: true, actions, date: new Date().toISOString() });
      sauver(acc, conv);
      return { conversationId: conv.id, fil: conv.fil, erreur: true };
    }
    conv.fil.push({ role: 'assistant', texte: reponse || 'C\'est fait.', actions, date: new Date().toISOString() });
    sauver(acc, conv);
    DB.audit(db, acc.login, 'assistant', null, null, `${t.slice(0, 120)}${actions.length ? ` → ${actions.map(a => `${a.type} ${a.numero || ''}`).join(', ')}` : ''}`);
    return { conversationId: conv.id, fil: conv.fil, actions };
  }
  function messageErreur(e, Anthropic) {
    if (Anthropic && e instanceof Anthropic.AuthenticationError) return 'Clé API Anthropic refusée : vérifiez-la dans Paramètres → Assistant.';
    if (Anthropic && e instanceof Anthropic.PermissionDeniedError) return 'Accès refusé par l\'API Anthropic (droits du compte API).';
    if (Anthropic && e instanceof Anthropic.RateLimitError) return 'Trop de demandes en même temps : réessayez dans une minute.';
    if (Anthropic && e instanceof Anthropic.APIConnectionError) return 'Service Anthropic injoignable : vérifiez l\'accès Internet du serveur.';
    if (Anthropic && e instanceof Anthropic.APIError) return `Erreur du service Anthropic (${e.status || '?'}) : réessayez.`;
    return `Erreur : ${e.message}`;
  }

  return { config: publique, enregistrerConfig, acces, message, conversation: (acc, id) => { const c = conversation(acc, id); return c && { id: c.id, titre: c.titre, fil: c.fil }; }, liste, DROITS_COMPAGNON, OUTILS };
}

module.exports = { creer, DROITS_COMPAGNON, MODELES };
