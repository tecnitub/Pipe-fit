// Version de démonstration en ligne : remplace le serveur par une simulation dans le navigateur.
// Les données restent sur l'appareil (localStorage). Mêmes règles que server/server.js :
// droits par rôle, contrôle de version, numérotation, factures verrouillées.
(function () {
  const KEY = 'pipefit-crm-demo-v42';
  const ME_KEY = 'pipefit-crm-demo-me';
  const COLLECTIONS = ['users', 'entreprises', 'contacts', 'articles', 'mainoeuvre', 'zones', 'affaires', 'devis', 'situations', 'commandes', 'factures', 'planning', 'temps', 'frais', 'rapports', 'reserves', 'receptions', 'consommations', 'envois', 'achats', 'efactures', 'familles', 'chiffrages', 'consultations', 'ouvrages', 'notifications', 'habilitations', 'materiels', 'missions', 'produits', 'equipementsFrigo', 'fichesFluides', 'bouteilles', 'enlevements', 'epreuves', 'misesEnService', 'equilibrages', 'releves'];
  const NUMBERING = { devis: ['numero', 'DV', 4], factures: ['numero', 'FA', 4], commandes: ['numero', 'CF', 4], affaires: ['code', 'CH', 3], situations: ['numero', 'BL', 4], frais: ['numero', 'NF', 4], rapports: ['numero', 'RI', 4], receptions: ['numero', 'PV', 4], achats: ['ref', 'FF', 4], consultations: ['ref', 'CS', 4], fichesFluides: ['numero', 'FI', 4], epreuves: ['numero', 'EP', 4], misesEnService: ['numero', 'MS', 4], equilibrages: ['numero', 'EQ', 4], releves: ['numero', 'RC', 4] };
  const ACCOUNTS = [
    { id: 'acc-admin', login: 'admin', nom: 'Administrateur', role: 'admin', userId: null, email: 'admin@pipefit.example' },
    { id: 'acc-claire', login: 'claire', nom: 'Claire Martin', role: 'charge', userId: 'u1', email: 'c.martin@pipefit.example' },
    { id: 'acc-julien', login: 'julien', nom: 'Julien Bernard', role: 'charge', userId: 'u2', email: 'j.bernard@pipefit.example' },
    { id: 'acc-kevin', login: 'kevin', nom: 'Kevin Roux (soudeur)', role: 'atelier', userId: 'o1' },
    { id: 'acc-lucas', login: 'lucas', nom: "Lucas Petit (chef d'équipe)", role: 'atelier', userId: 'o3' },
  ];

  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible : données en mémoire */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* idem */ } },
  };

  function fresh() {
    const seed = DemoSeed.demoData();
    const now = new Date().toISOString();
    const db = { settings: seed.settings, accounts: ACCOUNTS.map(a => ({ ...a, createdAt: now })), audit: [], counters: {}, files: { ...(seed.files || {}) },
      m365: { tenantId: '00000000-demo-0000-0000-000000000000', clientId: '11111111-demo-1111-1111-111111111111', clientSecret: 'demo', actif: true } };
    COLLECTIONS.forEach(c => { db[c] = (seed[c] || []).map(o => ({ ...o, _v: 1, _at: now, _by: 'Démo' })); });
    return db;
  }
  let db;
  try { db = JSON.parse(storage.get(KEY)); } catch (e) { db = null; }
  if (!db || !db.settings) db = fresh();
  const save = () => storage.set(KEY, JSON.stringify(db));
  save();

  const me = () => db.accounts.find(a => a.id === storage.get(ME_KEY)) || db.accounts[0];
  const clean = o => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));
  const labelOf = o => o.numero || o.code || o.ref || o.nom || o.designation || o.tache || '';
  const audit = (action, col, label) => {
    db.audit.unshift({ id: Date.now(), at: new Date().toISOString(), login: me().login, action, col, label });
    db.audit.length = Math.min(db.audit.length, 200);
  };
  function canWrite(acc, col) {
    if (acc.role === 'admin') return true;
    if (acc.role === 'charge') return col !== 'users';
    return acc.role === 'atelier' && ['temps', 'frais', 'rapports', 'consommations', 'notifications', 'fichesFluides', 'equipementsFrigo', 'enlevements', 'epreuves', 'misesEnService', 'equilibrages', 'releves'].includes(col);
  }
  // Mêmes règles que le serveur : un opérateur saisit pour lui (et son équipe pour les pointages), rien de validé ne se modifie
  function atelierRefus(acc, col, obj, existing) {
    if (acc.role !== 'atelier') return null;
    if (col === 'temps') { const r = ReglesPointage.refusTemps(obj, existing, ReglesPointage.jourIso(new Date())); if (r) return r; }
    const allowed = col !== 'temps' ? [acc.userId] : [acc.userId, ...db.users.filter(u => u.chefId === acc.userId).map(u => u.id)];
    if (obj && !allowed.includes(obj.userId)) return 'Vous ne pouvez saisir que pour vous ou votre équipe';
    if (existing && !allowed.includes(existing.userId)) return 'Vous ne pouvez modifier que vos saisies ou celles de votre équipe';
    if (existing && (existing.verrouille || (col === 'rapports' && existing.signatureClientId))) return 'Ce bon d\'intervention est signé par le client : il ne peut plus être modifié';
    if (existing && ['Validé', 'Validée', 'Remboursée'].includes(existing.statut)) return 'Cette saisie est déjà validée : demandez une correction à votre chargé d\'affaires';
    if (obj && ['Validé', 'Validée', 'Remboursée', 'Refusé', 'Refusée'].includes(obj.statut) && (!existing || existing.statut !== obj.statut)) return 'La validation est réservée aux chargés d\'affaires';
    return null;
  }
  // Notifications de planning, comme le serveur (server/notifs.js) : changements regroupés, puis cloche du compagnon
  // (ou de son chef d'équipe s'il n'a pas de compte). Pas de téléphone dans la démonstration.
  const attenteNotif = new Map();
  const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function envoyerNotif(userId) {
    const a = attenteNotif.get(userId);
    attenteNotif.delete(userId);
    const user = db.users.find(u => u.id === userId);
    if (!a || !user) return;
    clearTimeout(a.timer);
    let dest = db.accounts.filter(x => x.userId === userId), pourChef = false;
    if (!dest.length && user.chefId) { dest = db.accounts.filter(x => x.userId === user.chefId); pourChef = true; }
    if (!dest.length) return;
    const m = NotifPlanning.message({ user, jours: [...a.jours], planning: db.planning.filter(p => p.userId === userId), affaire: id => db.affaires.find(x => x.id === id), pourChef });
    const rec = { id: 'nt' + DemoSeed.uid(), type: 'planning', userId: dest[0].userId, pour: userId, titre: m.titre, texte: m.texte, lien: m.lien, jours: m.jours,
      date: new Date().toISOString(), lu: false, _v: 1, _at: new Date().toISOString(), _by: 'Pipe-Fit' };
    db.notifications = db.notifications || [];
    db.notifications.push(rec); save();
    if (typeof Store !== 'undefined' && Store.data && Store.data.notifications) { Store._put('notifications', JSON.parse(JSON.stringify(rec))); if (typeof Notifs !== 'undefined') Notifs.recu(rec); }
  }
  function planningModifie(acc, avant, apres) {
    if (typeof NotifPlanning === 'undefined' || !NotifPlanning.change(avant, apres)) return;
    const auj = isoLocal(new Date());
    [avant, apres].filter(Boolean).forEach(p => {
      if (!p.userId || !p.date || p.date < auj || p.userId === acc.userId) return;
      const a = attenteNotif.get(p.userId) || { jours: new Set() };
      a.jours.add(p.date); clearTimeout(a.timer);
      a.timer = setTimeout(() => envoyerNotif(p.userId), 1500);
      attenteNotif.set(p.userId, a);
    });
  }
  // Documents transmis aux compagnons : prévenir ceux qui sont planifiés sur le chantier
  function documentsModifies(avant, apres) {
    const cle = d => `${d.nom}|${d.indice || ''}|${d.fichierId}`, deja = new Set(((avant && avant.documents) || []).filter(d => d.visible).map(cle));
    const nouveaux = (apres.documents || []).filter(d => d.visible && !deja.has(cle(d)));
    if (!nouveaux.length || !Compagnon.regles(db.settings).documents) return;
    const auj = isoLocal(new Date()), users = [...new Set(db.planning.filter(p => p.affaireId === apres.id && p.date >= auj).map(p => p.userId))];
    const dest = new Set();
    users.forEach(uid => { let c = db.accounts.filter(x => x.userId === uid); if (!c.length) { const u = db.users.find(x => x.id === uid); if (u && u.chefId) c = db.accounts.filter(x => x.userId === u.chefId); } c.forEach(x => dest.add(x.userId)); });
    const n = nouveaux.length, titre = `📎 ${n > 1 ? `${n} nouveaux documents` : 'Nouveau document'} : ${apres.code || apres.nom}`;
    const texte = nouveaux.map(d => `${d.categorie || 'Document'} : ${d.nom}${d.indice ? ` (indice ${d.indice})` : ''}`).join('\n');
    db.notifications = db.notifications || [];
    dest.forEach(uid => db.notifications.push({ id: 'nt' + DemoSeed.uid(), type: 'document', userId: uid, affaireId: apres.id, titre, texte, lien: `#/pointage/chantier/${apres.id}`, date: new Date().toISOString(), lu: false, _v: 1, _at: new Date().toISOString(), _by: 'Pipe-Fit' }));
    save();
  }
  const viderNotifs = () => [...attenteNotif.keys()].forEach(envoyerNotif);
  window.addEventListener('pagehide', viderNotifs);

  // Même numérotation que le serveur : factures et avoirs au format paramétré, suite continue
  const FORMATS = { facture: { prefixe: 'FA', separateur: '-', annee: 'AAAA', chiffres: 4 }, avoir: { prefixe: 'AV', separateur: '-', annee: 'AAAA', chiffres: 4 }, situation: { prefixe: 'BL', separateur: '-', annee: 'AAAA', chiffres: 4 } };
  const PARAMETRABLES = { facture: ['factures', { type: '' }], avoir: ['factures', { type: 'avoir' }], situation: ['situations', {}] };
  function racine(col, obj) {
    const [, base, digits] = NUMBERING[col], Y = String(new Date().getFullYear());
    if (col === 'factures' || col === 'situations') {
      const cle = col === 'situations' ? 'situation' : obj && obj.type === 'avoir' ? 'avoir' : 'facture';
      const f = { ...FORMATS[cle], ...(((db.settings || {}).numerotation || {})[cle] || {}) };
      const an = f.annee === 'AAAA' ? Y : f.annee === 'AA' ? Y.slice(2) : '';
      return { prefix: [f.prefixe, an].filter(Boolean).map(x => x + f.separateur).join(''), digits: Math.min(8, Math.max(3, +f.chiffres || 4)), format: f };
    }
    return { prefix: `${col === 'affaires' && obj && obj.type === 'horsDevis' ? 'HD' : base}-${Y}-`, digits };
  }
  const maxUtilise = (col, prefix) => db[col].reduce((m, o) => { const n = String(o[NUMBERING[col][0]] || ''); return n.startsWith(prefix) && /^\d+$/.test(n.slice(prefix.length)) ? Math.max(m, +n.slice(prefix.length)) : m; }, 0);
  const compteur = (col, prefix) => Math.max(db.counters[`${col}:${prefix}`] || 0, maxUtilise(col, prefix));
  function nextNumber(col, obj) {
    const { prefix, digits } = racine(col, obj), v = compteur(col, prefix) + 1;
    db.counters[`${col}:${prefix}`] = v;
    return prefix + String(v).padStart(digits, '0');
  }
  function etatNumerotation() {
    const e = cle => { const [col, obj] = PARAMETRABLES[cle], r = racine(col, obj), prochain = compteur(col, r.prefix) + 1;
      return { format: r.format, racine: r.prefix, prochain, exemple: r.prefix + String(prochain).padStart(r.digits, '0'), dernier: maxUtilise(col, r.prefix) }; };
    return Object.fromEntries(Object.keys(PARAMETRABLES).map(cle => [cle, e(cle)]));
  }

  function handle(method, path, body) {
    const p = path.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    const acc = me();
    if (p[0] === 'setup') return [200, { needed: false, local: true }];
    if (p[0] === 'me' && !p[1]) return [200, { ...acc, m365: !!(db.m365 || {}).actif }];
    if (p[0] === 'me' && p[1] === 'password') return [200, { ok: true }];
    if (p[0] === 'logout' || p[0] === 'login') return [200, acc];
    if (p[0] === 'bulk' && method === 'POST') {
      const col = p[1];
      if (!['articles', 'mainoeuvre', 'entreprises', 'contacts'].includes(col)) return [400, { error: 'Import non disponible pour cette liste' }];
      if (!canWrite(acc, col)) return [403, { error: 'Droits insuffisants' }];
      const now = new Date().toISOString();
      const recs = (body.items || []).map(it => {
        const id = String(it.id || DemoSeed.uid());
        const i = db[col].findIndex(o => o.id === id);
        const rec = { ...clean(it), id, _v: i >= 0 ? db[col][i]._v + 1 : 1, _at: now, _by: acc.nom };
        if (i >= 0) db[col][i] = rec; else db[col].push(rec);
        return rec;
      });
      audit('import', col, `${recs.length} ligne(s)`); save();
      return [200, JSON.parse(JSON.stringify(recs))];
    }
    // Facturation électronique : pas de serveur dans la démonstration, l'import manuel est traité dans le navigateur
    // Dérive des chantiers : les alertes sont envoyées par le serveur (pas dans la démonstration)
    if (p[0] === 'derives') return [200, { alertes: 0 }];
    if (p[0] === 'efacture') {
      db.efconfig = db.efconfig || { plateforme: '', dossierEntree: '', dossierSortie: '', webhook: false };
      if (p[1] === 'etat') return [200, { plateforme: db.efconfig.plateforme, entree: false, sortie: false, webhook: false, mail: { actif: false, adresse: '', m365: false } }];
      if (p[1] === 'mail') return [400, { error: 'Démonstration : la boîte des factures est relevée sur l\'installation serveur (Microsoft 365). Essayez « Recevoir un e-mail de facture d\'exemple ».' }];
      if (p[1] === 'prevenir') return [400, { error: 'Démonstration : pas d\'envoi d\'e-mail.' }];
      if (p[1] === 'scruter') return [200, { traites: 0, erreur: 'Démonstration : le dossier de la plateforme est relevé sur l\'installation serveur.' }];
      if (p[1] === 'emettre') return [400, { error: 'Démonstration : le dépôt vers la plateforme se fait sur l\'installation serveur. Téléchargez le XML ou le PDF Factur-X.' }];
      if (p[1] === 'config') {
        if (acc.role !== 'admin') return [403, { error: 'Réservé aux administrateurs' }];
        if (method === 'PUT') { Object.assign(db.efconfig, { plateforme: body.plateforme || '', dossierEntree: body.dossierEntree || '', dossierSortie: body.dossierSortie || '', webhook: !!body.webhook }); save(); }
        if (method === 'PUT' && body.mail) db.efconfig.mail = { actif: !!body.mail.actif, adresse: String(body.mail.adresse || ''), dossier: String(body.mail.dossier || 'Factures traitées') };
        return [200, { ...db.efconfig, jeton: db.efconfig.webhook ? 'demo-jeton-non-fonctionnel' : '', mail: db.efconfig.mail || { actif: false, adresse: '', dossier: 'Factures traitées' }, m365: false }];
      }
      if (p[1] === 'import') return (async () => {
        try {
          const bin = atob(body.base64 || ''), bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
          const inflate = async b => new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
          // PDF simple (reçu par e-mail) : enregistré « à lire » ; e-mail simulé par la démonstration
          const simple = bytes[0] === 0x25 && bytes[1] === 0x50 && !(await FacturX.xmlDuPDF(bytes, inflate).catch(() => ''));
          const mail = body.mail ? { de: String(body.mail.de || ''), deEmail: String(body.mail.deEmail || ''), objet: String(body.mail.objet || ''), recuLe: body.mail.recuLe || new Date().toISOString() } : null;
          if (simple) {
            const cle = `pdf|${body.base64.length}|${body.base64.slice(-64)}`, ex = db.efactures.find(r => r.cle === cle);
            if (ex) return [200, { ...ex, doublon: true }];
            const id = 'ef' + DemoSeed.uid(), pdfId = 'f' + DemoSeed.uid();
            db.files[pdfId] = 'data:application/pdf;base64,' + body.base64;
            const rec = { id, cle, statut: 'Reçue', recueLe: new Date().toISOString(), origine: mail ? 'e-mail' : acc.login, nomFichier: body.nom || '', format: 'PDF', type: 'facture', numero: '', date: '', echeance: '',
              vendeur: { nom: mail ? mail.de : '', email: mail ? mail.deEmail : '' }, lignes: [], notes: [], totalHT: 0, totalTVA: 0, totalTTC: 0, xmlId: '', pdfId, aLire: true, ...(mail ? { mail } : {}), _v: 1, _at: new Date().toISOString(), _by: acc.nom };
            db.efactures.push(rec); save();
            return [200, JSON.parse(JSON.stringify(rec))];
          }
          const { facture, xml, pdf } = await FacturX.lireFichier(bytes, inflate);
          const cle = `${facture.vendeur.siren || facture.vendeur.tva || facture.vendeur.nom}|${facture.numero}`;
          const ex = db.efactures.find(r => r.cle === cle);
          if (ex) return [200, { ...ex, doublon: true }];
          const id = 'ef' + DemoSeed.uid(), xmlId = 'f' + DemoSeed.uid();
          db.files[xmlId] = 'data:application/xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
          let pdfId = '';
          if (pdf) { pdfId = 'f' + DemoSeed.uid(); db.files[pdfId] = 'data:application/pdf;base64,' + body.base64; }
          const rec = { id, cle, statut: 'Reçue', recueLe: new Date().toISOString(), origine: acc.login, nomFichier: body.nom || '', ...facture, xmlId, pdfId, _v: 1, _at: new Date().toISOString(), _by: acc.nom };
          db.efactures.push(rec); save();
          return [200, JSON.parse(JSON.stringify(rec))];
        } catch (e) { return [422, { error: e.message }]; }
      })();
    }
    // API : clés et webhooks simulés (pas de serveur dans la démonstration)
    if (p[0] === 'cles') {
      db.cles = db.cles || [];
      if (method === 'GET') return [200, db.cles];
      if (method === 'POST') { const id = 'k' + DemoSeed.uid(), cle = 'pf_demo_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); db.cles.unshift({ id, nom: body.nom || 'Clé API', prefixe: cle.slice(0, 10), creeLe: new Date().toISOString(), utiliseeLe: '', login: acc.login }); save(); return [200, { id, cle }]; }
      if (method === 'DELETE') { db.cles = db.cles.filter(k => k.id !== p[1]); save(); return [200, { ok: true }]; }
    }
    if (p[0] === 'webhooks') {
      if (acc.role !== 'admin') return [403, { error: 'Réservé aux administrateurs' }];
      db.webhooks = db.webhooks || [];
      if (method === 'GET') return [200, db.webhooks];
      if (method === 'PUT') { db.webhooks = (body.liste || []).map(w => ({ ...w, id: w.id || 'w' + DemoSeed.uid(), secret: w.secret || Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2) })); save(); return [200, db.webhooks]; }
      if (p[2] === 'test') return [200, { statut: 'démonstration : aucun envoi (disponible sur l\'installation serveur)' }];
    }
    // Microsoft 365 simulé : l'envoi est enregistré dans l'historique, aucun e-mail ne part
    if (p[0] === 'mail' && method === 'POST') {
      if (!['admin', 'charge'].includes(acc.role)) return [403, { error: 'Droits insuffisants' }];
      if (!(db.m365 || {}).actif) return [400, { error: "L'envoi par Microsoft 365 n'est pas configuré (Paramètres → E-mails)." }];
      if (!acc.email) return [400, { error: "Votre compte n'a pas d'adresse Microsoft 365." }];
      if (!(body.to || []).length) return [400, { error: 'Aucun destinataire' }];
      const rec = { id: 'env' + DemoSeed.uid(), date: new Date().toISOString(), type: body.type, col: body.ref && body.ref.col, docId: body.ref && body.ref.id, numero: body.numero || '',
        to: body.to, cc: body.cc || [], objet: body.subject, pieces: (body.attachments || []).map(a => a.name), mode: 'Microsoft 365', expediteur: acc.email, par: acc.nom, _v: 1, _at: new Date().toISOString(), _by: acc.nom };
      db.envois.push(rec); audit('envoi e-mail', 'envois', `${rec.numero} → ${rec.to.join(', ')} (démo : non envoyé)`); save();
      return [200, JSON.parse(JSON.stringify(rec))];
    }
    if (p[0] === 'files' && method === 'POST') {
      const id = /^[a-f0-9]{24}$/.test(String(body.id || '')) ? body.id : 'f' + DemoSeed.uid();
      db.files = db.files || {};
      db.files[id] = body.dataUrl; save();
      return [200, { id }];
    }
    if (p[0] === 'data') {
      const out = { settings: db.settings };
      COLLECTIONS.forEach(c => { out[c] = JSON.parse(JSON.stringify(db[c])); });
      // Compagnon : mêmes données filtrées que sur le serveur (prix, montants, budgets d'heures…)
      const r = Acces.restrictions(Acces.masques(acc, db.settings.acces)); // affichage par accès : même contrôle que le serveur
      return [200, Acces.filtrerTout(r, acc.role === 'atelier' ? Compagnon.filtrerTout(out, Compagnon.regles(db.settings), Compagnon.contexte(acc.userId, db.users, db.affaires)) : out)];
    }
    if (p[0] === 'records') {
      const [, col, id] = p;
      if (!COLLECTIONS.includes(col)) return [404, { error: 'Collection inconnue' }];
      if (['PUT', 'DELETE'].includes(method) && Acces.ecritureRefusee(Acces.restrictions(Acces.masques(acc, db.settings.acces)), col)) return [403, { error: 'Accès non autorisé pour votre compte (Paramètres → Affichage par accès)' }];
      const i = db[col].findIndex(o => o.id === id);
      const existing = i >= 0 ? db[col][i] : null;
      if (method === 'PUT') {
        const fiche = col === 'users' && existing, interimaire = acc.role === 'charge' && col === 'users' && body.data && body.data.type === 'interimaire' && (!fiche || fiche.type === 'interimaire');
        if (!canWrite(acc, col) && !(acc.role === 'atelier' && col === 'affaires') && !interimaire) return [403, { error: 'Droits insuffisants' }];
        if (existing && body.version !== existing._v) return [409, { error: `Modifié entre-temps par ${existing._by}`, record: existing }];
        let obj = { ...clean(body.data || {}), id };
        if (col === 'factures' && existing && acc.role !== 'admin') obj = { ...clean(existing), statut: obj.statut, exportCompta: obj.exportCompta, datePaiement: obj.datePaiement, relances: obj.relances };
        if (col === 'factures') { obj.type = existing ? existing.type : (obj.type === 'avoir' ? 'avoir' : undefined); if (!obj.type) delete obj.type; }
        if (col === 'affaires' && acc.role === 'atelier') {
          const hd = ReglesPointage.horsDevisCompagnon(obj, existing, acc.userId, ReglesPointage.jourIso(new Date()));
          if (hd.refus) return [403, { error: hd.refus }];
          obj = hd.obj;
        }
        const refus = col === 'affaires' ? null : atelierRefus(acc, col, obj, existing);
        if (refus) return [403, { error: refus }];
        if (col === 'fichesFluides' && obj.statut !== 'Brouillon') { const e = Fluides.erreur(obj, db.equipementsFrigo.find(x => x.id === obj.equipementId)); if (e) return [400, { error: e }]; }
        if (col === 'frais' && obj.statut === 'Soumise' && NoteFrais.erreur(obj)) return [400, { error: NoteFrais.erreur(obj) }];
        if (col === 'rapports' && existing && existing.signatureClientId && acc.role !== 'admin') return [403, { error: 'Ce bon d\'intervention est signé par le client : il ne peut plus être modifié.' }];
        if (col === 'enlevements' && acc.role === 'atelier') { if (existing && existing.statut !== 'Déclaré') return [403, { error: 'Cet enlèvement est déjà rapproché du relevé du fournisseur : voyez le bureau.' }]; obj.statut = 'Déclaré'; delete obj.achatId; }
        if (col === 'fichesFluides' && existing && existing.statut === 'Signée' && acc.role !== 'admin') return [403, { error: 'Cette fiche d\'intervention est signée : elle ne peut plus être modifiée.' }];
        if (col === 'epreuves' && existing && existing.statut === 'Signé' && acc.role !== 'admin') return [403, { error: 'Ce PV d\'épreuve est signé : il ne peut plus être modifié.' }];
        if (col === 'epreuves' && obj.statut === 'Signé') { const m = Epreuve.manques(obj); if (m.length) return [400, { error: `PV d'épreuve incomplet : ${m.join(', ')}` }]; }
        if (col === 'releves' && obj.statut && obj.statut !== 'Brouillon') { const m = Tuyauterie.manques(obj); if (m.length) return [400, { error: `Relevé incomplet : ${m.join(', ')}` }]; }
        if (['misesEnService', 'equilibrages'].includes(col) && existing && existing.statut === 'Signé' && acc.role !== 'admin') return [403, { error: 'Ce procès-verbal est signé : il ne peut plus être modifié.' }];
        if (['misesEnService', 'equilibrages'].includes(col) && obj.statut === 'Signé') { const m = col === 'misesEnService' ? Essais.manquesMES(obj) : Essais.manquesEQ(obj); if (m.length) return [400, { error: `Procès-verbal incomplet : ${m.join(', ')}` }]; }
        if (col === 'receptions' && existing && existing.statut === 'Signé' && acc.role !== 'admin') return [403, { error: 'Ce procès-verbal est signé : il ne peut plus être modifié.' }];
        if (col === 'reserves' && existing && existing.pvId && acc.role !== 'admin') obj = { ...clean(existing), statut: obj.statut, dateLevee: obj.dateLevee, photoLeveeId: obj.photoLeveeId, commentaireLevee: obj.commentaireLevee, pvLeveeId: obj.pvLeveeId };
        if (NUMBERING[col]) { const f = NUMBERING[col][0]; obj[f] = existing ? existing[f] : nextNumber(col, obj); }
        if (col === 'consommations' && acc.role === 'atelier') {
          const art = obj.articleId && db.articles.find(x => x.id === obj.articleId);
          if (art) Object.assign(obj, { pu: Number(art.prixVente) || 0, cout: Number(art.coutRevient) || 0 });
          else if (!Compagnon.regles(db.settings).prix || existing) Object.assign(obj, { pu: existing ? existing.pu || 0 : 0, cout: existing ? existing.cout || 0 : 0 });
        }
        const rec = { ...obj, _v: existing ? existing._v + 1 : 1, _at: new Date().toISOString(), _by: acc.nom };
        if (existing) db[col][i] = rec; else db[col].push(rec);
        audit(existing ? 'modification' : 'création', col, labelOf(rec));
        save();
        if (col === 'planning') planningModifie(acc, existing, rec);
        if (col === 'affaires') documentsModifies(existing, rec);
        // Intervention ouverte par un compagnon : cloche des chargés d'affaires
        if (col === 'affaires' && acc.role === 'atelier' && !existing) db.accounts.filter(a => ['admin', 'charge'].includes(a.role) && a.userId).forEach(a => db.notifications.push({ id: 'nt' + DemoSeed.uid(), type: 'horsDevis', userId: a.userId, affaireId: rec.id,
          titre: `🛠️ Intervention hors devis ouverte : ${rec.code}`, texte: `${acc.nom} — ${rec.nom}. À compléter (client, site, chargé d'affaires).`, lien: `#/chantier/${rec.id}`, date: new Date().toISOString(), lu: false, _v: 1, _at: new Date().toISOString(), _by: 'Pipe-Fit' }));
        if (col === 'affaires' && acc.role === 'atelier' && !existing) save();
        const rendu = acc.role === 'atelier' ? Compagnon.filtrer(col, JSON.parse(JSON.stringify(rec)), Compagnon.regles(db.settings), Compagnon.contexte(acc.userId, db.users, db.affaires)) : JSON.parse(JSON.stringify(rec));
        return [200, rendu || { id: rec.id, _v: rec._v }];
      }
      if (method === 'DELETE') {
        if (col === 'factures') return [403, { error: 'Une facture numérotée ne peut pas être supprimée (numérotation continue obligatoire) : établissez un avoir.' }];
        const fige = existing && acc.role !== 'admin' && ((col === 'receptions' && existing.statut === 'Signé') || (col === 'reserves' && existing.pvId));
        const allowed = (col === 'factures' ? acc.role === 'admin' : canWrite(acc, col)) && !atelierRefus(acc, col, null, existing) && !fige;
        if (!allowed) return [403, { error: 'Droits insuffisants' }];
        if (existing) { db[col].splice(i, 1); audit('suppression', col, labelOf(existing)); save(); if (col === 'planning') planningModifie(acc, existing, null); }
        return [200, { ok: true }];
      }
    }
    if (acc.role !== 'admin') return [403, { error: 'Réservé aux administrateurs' }];
    if (p[0] === 'settings') { db.settings = body; audit('paramètres'); save(); return [200, body]; }
    if (p[0] === 'audit') return [200, db.audit];
    if (p[0] === 'numerotation') {
      if (method === 'GET') return [200, etatNumerotation()];
      const cible = PARAMETRABLES[body.cle];
      if (!cible) return [400, { error: 'Numéro invalide' }];
      const { prefix } = racine(cible[0], cible[1]), max = maxUtilise(cible[0], prefix), n = parseInt(body.prochain, 10);
      if (!(n > max)) return [400, { error: `Le numéro ${prefix}${max} est déjà attribué : le prochain numéro doit être supérieur à ${max}.` }];
      db.counters[`${cible[0]}:${prefix}`] = n - 1; save();
      return [200, etatNumerotation()];
    }
    if (p[0] === 'm365') {
      db.m365 = db.m365 || { tenantId: '', clientId: '', actif: false };
      const pub = () => ({ tenantId: db.m365.tenantId, clientId: db.m365.clientId, actif: db.m365.actif, secretDefini: !!db.m365.clientSecret });
      if (method === 'GET') return [200, pub()];
      if (method === 'PUT') { Object.assign(db.m365, { tenantId: body.tenantId, clientId: body.clientId, actif: !!body.actif }); if (body.clientSecret) db.m365.clientSecret = body.clientSecret; save(); return [200, pub()]; }
      if (p[1] === 'test') return [200, { message: 'Démonstration : la connexion n\'est pas réellement testée. Sur votre serveur, un e-mail de test sera envoyé à votre adresse.' }];
    }
    if (p[0] === 'accounts') {
      if (method === 'GET') return [200, db.accounts];
      if (method === 'POST') {
        if (db.accounts.some(a => a.login.toLowerCase() === String(body.login || '').toLowerCase())) return [400, { error: 'Identifiant déjà utilisé' }];
        const a = { id: 'acc-' + DemoSeed.uid(), login: body.login, nom: body.nom || body.login, role: body.role || 'charge', userId: body.userId || null, email: body.email || '', createdAt: new Date().toISOString() };
        db.accounts.push(a); audit('création compte', null, a.login); save();
        return [200, { id: a.id }];
      }
      const a = db.accounts.find(x => x.id === p[1]);
      if (!a) return [404, { error: 'Compte introuvable' }];
      if (method === 'PUT') { Object.assign(a, { nom: body.nom ?? a.nom, role: body.role ?? a.role, userId: body.userId || null, email: body.email ?? a.email }); save(); return [200, { ok: true }]; }
      if (method === 'DELETE') {
        if (a.id === acc.id) return [400, { error: 'Impossible de supprimer son propre compte' }];
        db.accounts = db.accounts.filter(x => x !== a); save(); return [200, { ok: true }];
      }
    }
    if (p[0] === 'import') {
      COLLECTIONS.forEach(c => { db[c] = (body[c] || []).map(o => ({ ...clean(o), _v: 1, _at: new Date().toISOString(), _by: acc.nom })); });
      db.settings = body.settings; db.counters = {}; save();
      return [200, { ok: true }];
    }
    if (p[0] === 'reset-demo') { resetAll(false); return [200, { ok: true }]; }
    return [404, { error: 'Route inconnue' }];
  }

  function resetAll(reload = true) {
    const accounts = db.accounts;
    db = fresh();
    db.accounts = accounts;
    save();
    if (reload) location.reload();
  }

  // Interception des appels à l'API
  const realFetch = window.fetch.bind(window);
window.PIPEFIT_DEMO = true;
  window.fetch = async (url, opts = {}) => {
    const u = typeof url === 'string' ? url : url.url;
    if (!u.startsWith('/api/')) return realFetch(url, opts);
    const method = (opts.method || 'GET').toUpperCase();
    // Document de chantier envoyé en fichier brut : conservé sur l'appareil (taille limitée dans la démonstration)
    if (u === '/api/documents/fichier') {
      const f = opts.body;
      if (me().role === 'atelier') return new Response(JSON.stringify({ error: 'Droits insuffisants' }), { status: 403 });
      if (!f || f.size > 1.5 * 1024 * 1024) return new Response(JSON.stringify({ error: 'Démonstration : fichiers de 1,5 Mo au plus (40 Mo dans la version installée)' }), { status: 413 });
      const dataUrl = await new Promise((ok, ko) => { const rd = new FileReader(); rd.onload = () => ok(rd.result); rd.onerror = ko; rd.readAsDataURL(f); });
      const id = /^[a-f0-9]{24}$/.test(String(body.id || '')) ? body.id : 'f' + DemoSeed.uid();
      db.files = db.files || {}; db.files[id] = dataUrl;
      try { save(); } catch (e) { return new Response(JSON.stringify({ error: 'Espace de la démonstration plein' }), { status: 507 }); }
      return new Response(JSON.stringify({ id, mime: f.type || 'application/octet-stream', taille: f.size }), { status: 200 });
    }
    let body = {};
    try { body = opts.body ? JSON.parse(opts.body) : {}; } catch (e) { body = {}; }
    const [status, data] = await handle(method, u.split('?')[0], body);
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  };
  // Photos des justificatifs conservées sur l'appareil
  // Images en data URL ; PDF et autres documents en adresse blob (ouvrables dans un onglet)
  const blobs = new Map();
  window.FILE_URL = id => {
    const d = (db.files && db.files[id]) || '';
    if (!d || /^data:image\//.test(d)) return d;
    if (!blobs.has(id)) {
      const m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(d);
      if (!m) return d;
      const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      blobs.set(id, URL.createObjectURL(new Blob([u8], { type: m[1] || 'application/octet-stream' })));
    }
    return blobs.get(id);
  };
  // Téléchargements (récap Excel, CSV) : autorisation « downloads » de la page ; sinon les boutons sont masqués
  document.body.classList.add('no-dl');
  if (window.claude && window.claude.use) {
    window.claude.use('downloads').then(dl => {
      if (!dl) return;
      document.body.classList.remove('no-dl');
      window.SAVE_FILE = (filename, data) => dl.save({ filename, data: typeof data === 'string' ? data : new Blob([data]) })
        .then(() => App.toast('Fichier enregistré'))
        .catch(e => { if (e && e.code !== 'declined') notify('Téléchargement impossible : ' + (e.message || e.code)); });
    }).catch(() => {});
  }

  // Pas de temps réel dans la démo (un seul utilisateur par appareil)
  window.EventSource = class { constructor() {} addEventListener() {} close() {} };

  // Bandeau de démonstration : changement de profil et remise à zéro
  document.body.classList.add('demo');
  const banner = document.createElement('div');
  banner.className = 'demo-banner';
  banner.innerHTML = `<span>Démonstration · données enregistrées sur cet appareil uniquement</span>
    <label>Voir en tant que <select id="demo-as">${db.accounts.map(a => `<option value="${a.id}" ${a.id === me().id ? 'selected' : ''}>${a.nom} (${{ admin: 'admin', charge: "chargé d'affaires", atelier: 'opérateur' }[a.role]})</option>`).join('')}</select></label>
    <button class="small secondary" id="demo-reset">Remettre les données de départ</button>`;
  document.querySelector('header').after(banner);
  banner.querySelector('#demo-as').onchange = e => { viderNotifs(); storage.set(ME_KEY, e.target.value); location.hash = ''; location.reload(); };
  banner.querySelector('#demo-reset').onclick = async () => {
    if (await ask('Effacer vos essais et revenir aux données de départ ?', 'Réinitialiser')) resetAll();
  };
})();
