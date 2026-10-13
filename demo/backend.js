// Version de démonstration en ligne : remplace le serveur par une simulation dans le navigateur.
// Les données restent sur l'appareil (localStorage). Mêmes règles que server/server.js :
// droits par rôle, contrôle de version, numérotation, factures verrouillées.
(function () {
  const KEY = 'pipefit-crm-demo-v8';
  const ME_KEY = 'pipefit-crm-demo-me';
  const COLLECTIONS = ['users', 'entreprises', 'contacts', 'articles', 'mainoeuvre', 'zones', 'affaires', 'devis', 'situations', 'commandes', 'factures', 'planning', 'temps', 'frais', 'rapports', 'reserves', 'receptions', 'consommations', 'envois'];
  const NUMBERING = { devis: ['numero', 'DV', 4], factures: ['numero', 'FA', 4], commandes: ['numero', 'CF', 4], affaires: ['code', 'CH', 3], situations: ['numero', 'BL', 4], frais: ['numero', 'NF', 4], rapports: ['numero', 'RI', 4], receptions: ['numero', 'PV', 4] };
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
    return acc.role === 'atelier' && ['temps', 'frais', 'rapports', 'consommations'].includes(col);
  }
  // Mêmes règles que le serveur : un opérateur saisit pour lui (et son équipe pour les pointages), rien de validé ne se modifie
  function atelierRefus(acc, col, obj, existing) {
    if (acc.role !== 'atelier') return null;
    const allowed = col !== 'temps' ? [acc.userId] : [acc.userId, ...db.users.filter(u => u.chefId === acc.userId).map(u => u.id)];
    if (obj && !allowed.includes(obj.userId)) return 'Vous ne pouvez saisir que pour vous ou votre équipe';
    if (existing && !allowed.includes(existing.userId)) return 'Vous ne pouvez modifier que vos saisies ou celles de votre équipe';
    if (existing && (existing.verrouille || (col === 'rapports' && existing.signatureClientId))) return 'Ce bon d\'intervention est signé par le client : il ne peut plus être modifié';
    if (existing && ['Validé', 'Validée', 'Remboursée'].includes(existing.statut)) return 'Cette saisie est déjà validée : demandez une correction à votre chargé d\'affaires';
    if (obj && ['Validé', 'Validée', 'Remboursée', 'Refusé', 'Refusée'].includes(obj.statut) && (!existing || existing.statut !== obj.statut)) return 'La validation est réservée aux chargés d\'affaires';
    return null;
  }
  function nextNumber(col, obj) {
    const [field, base, digits] = NUMBERING[col];
    const code = col === 'affaires' && obj && obj.type === 'horsDevis' ? 'HD' : base;
    const prefix = `${code}-${new Date().getFullYear()}-`;
    if (db.counters[prefix] === undefined) {
      db.counters[prefix] = db[col].reduce((m, o) => String(o[field] || '').startsWith(prefix) ? Math.max(m, parseInt(o[field].slice(prefix.length), 10) || 0) : m, 0);
    }
    return prefix + String(++db.counters[prefix]).padStart(digits, '0');
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
      const id = 'f' + DemoSeed.uid();
      db.files = db.files || {};
      db.files[id] = body.dataUrl; save();
      return [200, { id }];
    }
    if (p[0] === 'data') {
      const out = { settings: db.settings };
      COLLECTIONS.forEach(c => { out[c] = JSON.parse(JSON.stringify(db[c])); });
      return [200, out];
    }
    if (p[0] === 'records') {
      const [, col, id] = p;
      if (!COLLECTIONS.includes(col)) return [404, { error: 'Collection inconnue' }];
      const i = db[col].findIndex(o => o.id === id);
      const existing = i >= 0 ? db[col][i] : null;
      if (method === 'PUT') {
        if (!canWrite(acc, col)) return [403, { error: 'Droits insuffisants' }];
        if (existing && body.version !== existing._v) return [409, { error: `Modifié entre-temps par ${existing._by}`, record: existing }];
        let obj = { ...clean(body.data || {}), id };
        if (col === 'factures' && existing && acc.role !== 'admin') obj = { ...clean(existing), statut: obj.statut };
        const refus = atelierRefus(acc, col, obj, existing);
        if (refus) return [403, { error: refus }];
        if (col === 'rapports' && existing && existing.signatureClientId && acc.role !== 'admin') return [403, { error: 'Ce bon d\'intervention est signé par le client : il ne peut plus être modifié.' }];
        if (col === 'receptions' && existing && existing.statut === 'Signé' && acc.role !== 'admin') return [403, { error: 'Ce procès-verbal est signé : il ne peut plus être modifié.' }];
        if (col === 'reserves' && existing && existing.pvId && acc.role !== 'admin') obj = { ...clean(existing), statut: obj.statut, dateLevee: obj.dateLevee, photoLeveeId: obj.photoLeveeId, commentaireLevee: obj.commentaireLevee, pvLeveeId: obj.pvLeveeId };
        if (NUMBERING[col]) { const f = NUMBERING[col][0]; obj[f] = existing ? existing[f] : nextNumber(col, obj); }
        const rec = { ...obj, _v: existing ? existing._v + 1 : 1, _at: new Date().toISOString(), _by: acc.nom };
        if (existing) db[col][i] = rec; else db[col].push(rec);
        audit(existing ? 'modification' : 'création', col, labelOf(rec));
        save();
        return [200, JSON.parse(JSON.stringify(rec))];
      }
      if (method === 'DELETE') {
        const fige = existing && acc.role !== 'admin' && ((col === 'receptions' && existing.statut === 'Signé') || (col === 'reserves' && existing.pvId));
        const allowed = (col === 'factures' ? acc.role === 'admin' : canWrite(acc, col)) && !atelierRefus(acc, col, null, existing) && !fige;
        if (!allowed) return [403, { error: 'Droits insuffisants' }];
        if (existing) { db[col].splice(i, 1); audit('suppression', col, labelOf(existing)); save(); }
        return [200, { ok: true }];
      }
    }
    if (acc.role !== 'admin') return [403, { error: 'Réservé aux administrateurs' }];
    if (p[0] === 'settings') { db.settings = body; audit('paramètres'); save(); return [200, body]; }
    if (p[0] === 'audit') return [200, db.audit];
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
  window.fetch = async (url, opts = {}) => {
    const u = typeof url === 'string' ? url : url.url;
    if (!u.startsWith('/api/')) return realFetch(url, opts);
    const method = (opts.method || 'GET').toUpperCase();
    let body = {};
    try { body = opts.body ? JSON.parse(opts.body) : {}; } catch (e) { body = {}; }
    const [status, data] = handle(method, u.split('?')[0], body);
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  };
  // Photos des justificatifs conservées sur l'appareil
  window.FILE_URL = id => (db.files && db.files[id]) || '';
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
  banner.querySelector('#demo-as').onchange = e => { storage.set(ME_KEY, e.target.value); location.hash = ''; location.reload(); };
  banner.querySelector('#demo-reset').onclick = async () => {
    if (await ask('Effacer vos essais et revenir aux données de départ ?', 'Réinitialiser')) resetAll();
  };
})();
