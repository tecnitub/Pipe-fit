// Serveur multi-utilisateurs : API REST + temps réel (SSE) + fichiers statiques.
// Aucune dépendance externe : Node.js >= 22.13 (module node:sqlite).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DB = require('./db');
const { demoData, uid } = require('./demo');
const M365 = require('./m365');

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'pipefit.db');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SESSION_DAYS = 30;
const MAX_BODY = 10 * 1024 * 1024;

const db = DB.open(DB_FILE);

/* ---------- Initialisation ---------- */
if (!db.prepare('SELECT 1 FROM settings WHERE id = 1').get()) {
  if (process.env.SEED_DEMO === '0') DB.setSettings(db, demoData().settings);
  else { DB.replaceAll(db, demoData(), 'système'); console.log('Base initialisée avec les données de démonstration.'); }
}
const hasAccounts = () => !!db.prepare('SELECT 1 FROM accounts LIMIT 1').get();
function createAccount(login, nom, role, userId, password) {
  const id = uid();
  db.prepare('INSERT INTO accounts (id, login, nom, role, user_id, pass, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, login, nom || login, role, userId || null, DB.hashPassword(password), new Date().toISOString());
  return id;
}
// Sans ADMIN_PASSWORD, le compte administrateur est créé depuis le navigateur du serveur (écran de première configuration).
if (!hasAccounts() && process.env.ADMIN_PASSWORD) {
  createAccount('admin', 'Administrateur', 'admin', null, process.env.ADMIN_PASSWORD);
  console.log("Compte administrateur 'admin' créé avec le mot de passe ADMIN_PASSWORD.");
}
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

/* ---------- Droits ---------- */
// admin : tout. charge : données métier (hors ressources/paramètres). atelier : saisie des heures uniquement.
function canWrite(acc, col) {
  if (acc.role === 'admin') return true;
  if (acc.role === 'charge') return col !== 'users';
  if (acc.role === 'atelier') return ['temps', 'frais', 'rapports', 'consommations'].includes(col);
  return false;
}
function canDelete(acc, col, existing) {
  // Facture ou avoir numéroté : jamais supprimé (numérotation continue) ; on établit un avoir
  if (col === 'factures') return false;
  // PV signé et réserves figées par un PV : seul l'administrateur peut les supprimer
  if (existing && acc.role !== 'admin' && ((col === 'receptions' && existing.statut === 'Signé') || (col === 'reserves' && existing.pvId))) return false;
  return canWrite(acc, col);
}

// Personnes pour lesquelles un opérateur peut pointer : lui-même et son équipe (chef d'équipe -> intérimaires, compagnons)
function pointablePour(acc) {
  if (!acc.user_id) return [];
  const team = db.prepare("SELECT id, data FROM records WHERE col = 'users'").all()
    .filter(r => JSON.parse(r.data).chefId === acc.user_id).map(r => r.id);
  return [acc.user_id, ...team];
}
// Règles opérateur : pointages pour soi ou son équipe, notes de frais pour soi, rien de validé ne se modifie
function atelierRefus(acc, col, obj, existing) {
  if (acc.role !== 'atelier') return null;
  const allowed = col === 'temps' ? pointablePour(acc) : [acc.user_id];
  if (!allowed.includes(obj ? obj.userId : null) && obj) return 'Vous ne pouvez saisir que pour vous ou votre équipe';
  if (existing && !allowed.includes(existing.userId)) return 'Vous ne pouvez modifier que vos saisies ou celles de votre équipe';
  if (existing && (existing.verrouille || (col === 'rapports' && existing.signatureClientId))) return 'Ce bon d\'intervention est signé par le client : il ne peut plus être modifié';
  if (existing && ['Validé', 'Validée', 'Remboursée'].includes(existing.statut)) return 'Cette saisie est déjà validée : demandez une correction à votre chargé d\'affaires';
  if (obj && ['Validé', 'Validée', 'Remboursée', 'Refusé', 'Refusée'].includes(obj.statut) && (!existing || existing.statut !== obj.statut)) return 'La validation est réservée aux chargés d\'affaires';
  return null;
}

/* ---------- Temps réel (Server-Sent Events) ---------- */
const clients = new Set();
function broadcast(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000).unref();

/* ---------- Utilitaires HTTP ---------- */
function send(res, status, body, headers = {}) {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}
const fail = (res, status, message, extra = {}) => send(res, status, { error: message, ...extra });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Requête trop volumineuse'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('JSON invalide'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
const isHttps = req => req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
function sessionCookie(req, token, maxAge) {
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
}

function currentAccount(req) {
  const token = cookies(req).sid;
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!s || s.expires < Date.now()) return null;
  const a = db.prepare('SELECT id, login, nom, role, user_id, email FROM accounts WHERE id = ?').get(s.account_id);
  return a ? { ...a, token } : null;
}
const publicAccount = a => ({ id: a.id, login: a.login, nom: a.nom, role: a.role, userId: a.user_id, email: a.email || '' });
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const m365Pret = () => { const c = DB.getConfig(db, 'm365'); return !!(c && c.actif && c.tenantId && c.clientId && c.clientSecret); };
const MAIL_COLS = ['devis', 'factures', 'situations', 'commandes', 'affaires', 'rapports', 'receptions'];
const labelOf = o => o.numero || o.code || o.ref || o.nom || o.designation || o.tache || '';

// Limitation des tentatives de connexion (10 échecs / 15 min par adresse IP).
const failures = new Map();
function tooManyFailures(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.first > 15 * 60 * 1000) { failures.delete(ip); return false; }
  return f.count >= 10;
}
function recordFailure(ip) {
  const f = failures.get(ip) || { count: 0, first: Date.now() };
  f.count++; failures.set(ip, f);
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = req.method;

  // Protection CSRF : les écritures doivent être en JSON (impossible via un formulaire d'un autre site).
  if (method !== 'GET' && !(req.headers['content-type'] || '').startsWith('application/json')) {
    return fail(res, 415, 'Content-Type application/json requis');
  }

  // Première configuration : création du compte administrateur, uniquement depuis le serveur lui-même.
  if (p[0] === 'setup') {
    if (method === 'GET') return send(res, 200, { needed: !hasAccounts(), local: isLocal(req) });
    if (method === 'POST') {
      if (!isLocal(req)) return fail(res, 403, 'La première configuration doit être faite sur le serveur (http://localhost)');
      const { login, nom, password, demo } = await readBody(req);
      if (!login || String(password || '').length < 8) return fail(res, 400, 'Identifiant requis et mot de passe de 8 caractères minimum');
      const id = DB.tx(db, () => (hasAccounts() ? null : createAccount(String(login), nom, 'admin', null, String(password))));
      if (!id) return fail(res, 409, 'Le compte administrateur existe déjà');
      if (!demo) {
        const d = demoData();
        DB.replaceAll(db, { settings: d.settings, zones: d.zones }, 'système');
      }
      DB.audit(db, String(login), 'première configuration', null, null, demo ? 'avec démo' : 'base vide');
      const token = crypto.randomBytes(32).toString('hex');
      db.prepare('INSERT INTO sessions (token, account_id, expires) VALUES (?, ?, ?)').run(token, id, Date.now() + SESSION_DAYS * 86400000);
      return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, token, SESSION_DAYS * 86400) });
    }
  }

  if (p[0] === 'login' && method === 'POST') {
    const ip = req.socket.remoteAddress;
    if (tooManyFailures(ip)) return fail(res, 429, 'Trop de tentatives, réessayez dans 15 minutes.');
    const { login, password } = await readBody(req);
    const a = db.prepare('SELECT * FROM accounts WHERE login = ?').get(String(login || ''));
    if (!a || !DB.checkPassword(String(password || ''), a.pass)) { recordFailure(ip); return fail(res, 401, 'Identifiant ou mot de passe incorrect'); }
    failures.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, account_id, expires) VALUES (?, ?, ?)').run(token, a.id, Date.now() + SESSION_DAYS * 86400000);
    DB.audit(db, a.login, 'connexion');
    return send(res, 200, publicAccount(a), { 'Set-Cookie': sessionCookie(req, token, SESSION_DAYS * 86400) });
  }

  const acc = currentAccount(req);
  if (!acc) return fail(res, 401, 'Non connecté');

  if (p[0] === 'logout' && method === 'POST') {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(acc.token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }
  if (p[0] === 'me' && !p[1] && method === 'GET') return send(res, 200, { ...publicAccount(acc), m365: m365Pret() });
  if (p[0] === 'me' && p[1] === 'password' && method === 'POST') {
    const { current, next } = await readBody(req);
    const a = db.prepare('SELECT pass FROM accounts WHERE id = ?').get(acc.id);
    if (!DB.checkPassword(String(current || ''), a.pass)) return fail(res, 400, 'Mot de passe actuel incorrect');
    if (String(next || '').length < 8) return fail(res, 400, 'Le nouveau mot de passe doit faire au moins 8 caractères');
    db.prepare('UPDATE accounts SET pass = ? WHERE id = ?').run(DB.hashPassword(next), acc.id);
    db.prepare('DELETE FROM sessions WHERE account_id = ? AND token <> ?').run(acc.id, acc.token);
    return send(res, 200, { ok: true });
  }

  if (p[0] === 'events' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (p[0] === 'data' && method === 'GET') return send(res, 200, DB.allData(db));

  // Justificatifs (photos de notes de frais) : envoyés en data URL, servis en binaire
  if (p[0] === 'files' && method === 'POST' && !p[1]) {
    const { dataUrl } = await readBody(req);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) return fail(res, 400, 'Image invalide (JPEG, PNG ou WebP attendu)');
    const id = crypto.randomBytes(12).toString('hex');
    db.prepare('INSERT INTO files (id, mime, data, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(id, m[1], Buffer.from(m[2], 'base64'), acc.login, new Date().toISOString());
    return send(res, 200, { id });
  }
  if (p[0] === 'files' && method === 'GET' && p[1]) {
    const f = db.prepare('SELECT mime, data FROM files WHERE id = ?').get(p[1]);
    if (!f) return fail(res, 404, 'Fichier introuvable');
    res.writeHead(200, { 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=86400' });
    return res.end(Buffer.from(f.data));
  }

  // Import groupé (bibliothèque, entreprises, contacts depuis Excel) : une seule transaction
  if (p[0] === 'bulk' && p[1] && method === 'POST') {
    const col = p[1];
    if (!['articles', 'mainoeuvre', 'entreprises', 'contacts'].includes(col)) return fail(res, 400, 'Import non disponible pour cette liste');
    if (!canWrite(acc, col)) return fail(res, 403, 'Droits insuffisants');
    const { items } = await readBody(req);
    if (!Array.isArray(items) || items.length > 20000) return fail(res, 400, 'Liste invalide');
    const records = DB.tx(db, () => {
      const now = new Date().toISOString();
      const up = db.prepare(`INSERT INTO records (col, id, data, version, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)
        ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, version = records.version + 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by`);
      return items.map(it => {
        const id = String((it && it.id) || uid());
        up.run(col, id, JSON.stringify({ ...DB.clean(it || {}), id }), now, acc.nom || acc.login);
        return DB.getRecord(db, col, id);
      });
    });
    DB.audit(db, acc.login, 'import', col, null, `${records.length} ligne(s)`);
    broadcast('reload', { client: req.headers['x-client-id'] || null });
    return send(res, 200, records);
  }

  if (p[0] === 'records' && p[1] && p[2]) {
    const [, col, id] = p;
    if (!DB.COLLECTIONS.includes(col)) return fail(res, 404, 'Collection inconnue');

    if (method === 'PUT') {
      if (!canWrite(acc, col)) return fail(res, 403, 'Droits insuffisants');
      const { data, version } = await readBody(req);
      if (!data || typeof data !== 'object') return fail(res, 400, 'Données manquantes');
      const result = DB.tx(db, () => {
        const existing = DB.getRecord(db, col, id);
        if (existing && version !== existing._v) return { conflict: existing };
        let obj = { ...DB.clean(data), id };
        // Une facture émise n'est plus modifiable, sauf son statut de paiement (admin excepté).
        if (col === 'factures' && existing && acc.role !== 'admin') obj = { ...DB.clean(existing), statut: obj.statut, exportCompta: obj.exportCompta };
        if (col === 'factures') obj.type = existing ? existing.type : (obj.type === 'avoir' ? 'avoir' : undefined);
        // Bon d'intervention signé par le client : figé (sauf administrateur)
        if (col === 'rapports' && existing && existing.signatureClientId && acc.role !== 'admin') return { forbidden: 'Ce bon d\'intervention est signé par le client : il ne peut plus être modifié.' };
        // PV de réception signé : figé
        if (col === 'receptions' && existing && existing.statut === 'Signé' && acc.role !== 'admin') return { forbidden: 'Ce procès-verbal est signé : il ne peut plus être modifié.' };
        // Réserve figée par le PV : seule sa levée peut être renseignée
        if (col === 'reserves' && existing && existing.pvId && acc.role !== 'admin') {
          obj = { ...DB.clean(existing), statut: obj.statut, dateLevee: obj.dateLevee, photoLeveeId: obj.photoLeveeId, commentaireLevee: obj.commentaireLevee, pvLeveeId: obj.pvLeveeId };
        }
        const refus = atelierRefus(acc, col, obj, existing);
        if (refus) return { forbidden: refus };
        const numbering = DB.NUMBERING[col];
        if (numbering) {
          const field = numbering[0];
          obj[field] = existing ? existing[field] : DB.nextNumber(db, col, obj);
        }
        const now = new Date().toISOString();
        const v = existing ? existing._v + 1 : 1;
        db.prepare(`INSERT INTO records (col, id, data, version, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, version = excluded.version, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
          .run(col, id, JSON.stringify(obj), v, now, acc.nom || acc.login);
        DB.audit(db, acc.login, existing ? 'modification' : 'création', col, id, labelOf(obj));
        return { record: DB.getRecord(db, col, id) };
      });
      if (result.forbidden) return fail(res, 403, result.forbidden);
      if (result.conflict) {
        return fail(res, 409, `Modifié entre-temps par ${result.conflict._by || 'un autre utilisateur'}`, { record: result.conflict });
      }
      broadcast('change', { col, record: result.record, client: req.headers['x-client-id'] || null });
      return send(res, 200, result.record);
    }

    if (method === 'DELETE') {
      const existing = DB.getRecord(db, col, id);
      if (!canDelete(acc, col, existing)) return fail(res, 403, col === 'factures' ? 'Une facture numérotée ne peut pas être supprimée (numérotation continue obligatoire) : établissez un avoir.' : existing && (existing.pvId || existing.statut === 'Signé') ? 'Élément figé par un procès-verbal signé' : 'Droits insuffisants');
      if (!existing) return send(res, 200, { ok: true });
      const refus = atelierRefus(acc, col, null, existing);
      if (refus) return fail(res, 403, refus);
      db.prepare('DELETE FROM records WHERE col = ? AND id = ?').run(col, id);
      DB.audit(db, acc.login, 'suppression', col, id, labelOf(existing));
      broadcast('delete', { col, id, client: req.headers['x-client-id'] || null });
      return send(res, 200, { ok: true });
    }
  }

  // Envoi d'un document par e-mail via Microsoft 365 (copie dans les éléments envoyés de l'expéditeur)
  if (p[0] === 'mail' && method === 'POST') {
    if (!['admin', 'charge'].includes(acc.role)) return fail(res, 403, 'Droits insuffisants');
    const cfg = DB.getConfig(db, 'm365');
    if (!m365Pret()) return fail(res, 400, "L'envoi par Microsoft 365 n'est pas configuré (Paramètres → E-mails).");
    if (!acc.email) return fail(res, 400, "Votre compte n'a pas d'adresse Microsoft 365 : demandez à l'administrateur de la renseigner (Paramètres → Comptes).");
    const b = await readBody(req);
    const liste = l => (Array.isArray(l) ? l : []).map(x => String(x).trim()).filter(Boolean);
    const to = liste(b.to), cc = liste(b.cc), bcc = liste(b.bcc);
    if (!to.length) return fail(res, 400, 'Aucun destinataire');
    if (to.length + cc.length + bcc.length > 30 || [...to, ...cc, ...bcc].some(x => !EMAIL.test(x))) return fail(res, 400, 'Adresse e-mail invalide');
    const subject = String(b.subject || '').slice(0, 255);
    const html = String(b.html || '');
    if (!subject || html.length > 300000) return fail(res, 400, 'Objet manquant ou message trop long');
    const pieces = Array.isArray(b.attachments) ? b.attachments.slice(0, 20) : [];
    const TYPES_PJ = { pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    let poids = 0;
    for (const a of pieces) {
      if (!a || !/^[\w .,()'°&+-]{1,120}\.(pdf|csv|txt|xlsx)$/i.test(String(a.name || '')) || !/^[A-Za-z0-9+/=]+$/.test(String(a.base64 || ''))) return fail(res, 400, 'Pièce jointe invalide (PDF, CSV, TXT ou XLSX attendu)');
      poids += a.base64.length * 3 / 4;
    }
    if (poids > 3 * 1024 * 1024) return fail(res, 400, 'Pièces jointes trop volumineuses (3 Mo maximum)');
    const ref = b.ref && MAIL_COLS.includes(b.ref.col) ? { col: b.ref.col, id: String(b.ref.id || '') } : null;
    try {
      await M365.envoyer(cfg, acc.email, { to, cc, bcc, subject, html, attachments: pieces.map(a => ({ name: a.name, base64: a.base64, contentType: TYPES_PJ[a.name.split('.').pop().toLowerCase()] })) });
    } catch (e) { return fail(res, 502, e.message); }
    const id = uid(), now = new Date().toISOString();
    const envoi = { id, date: now, type: String(b.type || ''), col: ref && ref.col, docId: ref && ref.id, numero: String(b.numero || ''), to, cc, objet: subject,
      pieces: pieces.map(a => a.name), mode: 'Microsoft 365', expediteur: acc.email, par: acc.nom || acc.login };
    db.prepare('INSERT INTO records (col, id, data, version, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)').run('envois', id, JSON.stringify(envoi), now, acc.nom || acc.login);
    DB.audit(db, acc.login, 'envoi e-mail', 'envois', id, `${envoi.numero} → ${to.join(', ')}`);
    const record = DB.getRecord(db, 'envois', id);
    broadcast('change', { col: 'envois', record, client: req.headers['x-client-id'] || null });
    return send(res, 200, record);
  }

  /* --- Administration --- */
  if (acc.role !== 'admin') return fail(res, 403, 'Réservé aux administrateurs');

  // Numérotation des factures et avoirs : état et reprise d'une numérotation existante
  if (p[0] === 'numerotation') {
    if (method === 'GET') return send(res, 200, DB.etatNumerotation(db));
    if (method === 'PUT') {
      const b = await readBody(req);
      const prochain = parseInt(b.prochain, 10);
      if (!['facture', 'avoir'].includes(b.cle) || !(prochain >= 1)) return fail(res, 400, 'Numéro invalide');
      const r = DB.tx(db, () => DB.fixerProchain(db, 'factures', { type: b.cle === 'avoir' ? 'avoir' : '' }, prochain));
      if (r.erreur) return fail(res, 400, r.erreur);
      DB.audit(db, acc.login, 'numérotation', 'factures', null, `${b.cle} : prochain n° ${prochain}`);
      return send(res, 200, DB.etatNumerotation(db));
    }
  }

  if (p[0] === 'settings' && method === 'PUT') {
    const s = await readBody(req);
    DB.setSettings(db, s);
    DB.audit(db, acc.login, 'paramètres');
    broadcast('settings', { settings: s, by: acc.id });
    return send(res, 200, s);
  }

  // Connexion Microsoft 365 : le secret n'est jamais renvoyé au navigateur
  if (p[0] === 'm365') {
    const cfg = DB.getConfig(db, 'm365') || {};
    const pub = () => ({ tenantId: cfg.tenantId || '', clientId: cfg.clientId || '', actif: !!cfg.actif, secretDefini: !!cfg.clientSecret });
    if (!p[1] && method === 'GET') return send(res, 200, pub());
    if (!p[1] && method === 'PUT') {
      const b = await readBody(req);
      const champ = v => String(v || '').trim().slice(0, 200);
      Object.assign(cfg, { tenantId: champ(b.tenantId), clientId: champ(b.clientId), actif: !!b.actif });
      if (b.clientSecret) cfg.clientSecret = String(b.clientSecret).trim().slice(0, 500);
      if (b.effacerSecret) delete cfg.clientSecret;
      if (cfg.actif && !(cfg.tenantId && cfg.clientId && cfg.clientSecret)) return fail(res, 400, 'Renseignez l\'ID de locataire, l\'ID d\'application et le secret avant d\'activer l\'envoi.');
      DB.setConfig(db, 'm365', cfg);
      M365.oublier();
      DB.audit(db, acc.login, 'configuration Microsoft 365');
      return send(res, 200, pub());
    }
    if (p[1] === 'test' && method === 'POST') {
      if (!(cfg.tenantId && cfg.clientId && cfg.clientSecret)) return fail(res, 400, 'Configuration incomplète');
      try {
        await M365.jeton(cfg);
        if (!acc.email) return send(res, 200, { ok: true, message: 'Connexion à Microsoft 365 réussie. Renseignez votre adresse dans votre compte pour tester un envoi.' });
        await M365.envoyer(cfg, acc.email, { to: [acc.email], subject: 'Test Pipe-Fit CRM', html: '<p>Ce message de test a été envoyé par Pipe-Fit CRM via Microsoft 365.</p>' });
        return send(res, 200, { ok: true, message: `Connexion réussie : un e-mail de test a été envoyé à ${acc.email} (visible aussi dans ses éléments envoyés).` });
      } catch (e) { return fail(res, 502, e.message); }
    }
  }

  if (p[0] === 'accounts') {
    if (method === 'GET') {
      return send(res, 200, db.prepare('SELECT id, login, nom, role, user_id, email, created_at FROM accounts ORDER BY login').all()
        .map(a => ({ ...publicAccount(a), createdAt: a.created_at })));
    }
    const body = method === 'DELETE' ? {} : await readBody(req);
    if (body.role && !DB.ROLES.includes(body.role)) return fail(res, 400, 'Rôle invalide');
    if (body.password && String(body.password).length < 8) return fail(res, 400, 'Mot de passe : 8 caractères minimum');
    if (body.email && !EMAIL.test(String(body.email).trim())) return fail(res, 400, 'Adresse e-mail invalide');

    if (method === 'POST') {
      if (!body.login || !body.password) return fail(res, 400, 'Identifiant et mot de passe requis');
      if (db.prepare('SELECT 1 FROM accounts WHERE login = ?').get(body.login)) return fail(res, 400, 'Identifiant déjà utilisé');
      const id = createAccount(body.login, body.nom, body.role || 'charge', body.userId, body.password);
      if (body.email) db.prepare('UPDATE accounts SET email = ? WHERE id = ?').run(String(body.email).trim(), id);
      DB.audit(db, acc.login, 'création compte', null, id, body.login);
      return send(res, 200, { id });
    }
    const target = p[1] && db.prepare('SELECT * FROM accounts WHERE id = ?').get(p[1]);
    if (!target) return fail(res, 404, 'Compte introuvable');
    const admins = db.prepare("SELECT COUNT(*) n FROM accounts WHERE role = 'admin'").get().n;
    if (method === 'PUT') {
      if (target.role === 'admin' && body.role && body.role !== 'admin' && admins <= 1) return fail(res, 400, 'Il doit rester au moins un administrateur');
      db.prepare('UPDATE accounts SET nom = ?, role = ?, user_id = ?, email = ? WHERE id = ?')
        .run(body.nom ?? target.nom, body.role ?? target.role, body.userId === undefined ? target.user_id : (body.userId || null),
          body.email === undefined ? target.email : (String(body.email).trim() || null), target.id);
      if (body.password) {
        db.prepare('UPDATE accounts SET pass = ? WHERE id = ?').run(DB.hashPassword(body.password), target.id);
        db.prepare('DELETE FROM sessions WHERE account_id = ?').run(target.id);
      }
      DB.audit(db, acc.login, 'modification compte', null, target.id, target.login);
      return send(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      if (target.id === acc.id) return fail(res, 400, 'Impossible de supprimer son propre compte');
      db.prepare('DELETE FROM sessions WHERE account_id = ?').run(target.id);
      db.prepare('DELETE FROM accounts WHERE id = ?').run(target.id);
      DB.audit(db, acc.login, 'suppression compte', null, target.id, target.login);
      return send(res, 200, { ok: true });
    }
  }

  if (p[0] === 'audit' && method === 'GET') {
    return send(res, 200, db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 200').all());
  }

  if (p[0] === 'import' && method === 'POST') {
    const data = await readBody(req);
    if (!data.settings) return fail(res, 400, 'Fichier invalide');
    DB.replaceAll(db, data, acc.nom || acc.login);
    DB.audit(db, acc.login, 'import');
    broadcast('reload', { by: acc.id });
    return send(res, 200, { ok: true });
  }
  if (p[0] === 'reset-demo' && method === 'POST') {
    DB.replaceAll(db, demoData(), acc.nom || acc.login);
    DB.audit(db, acc.login, 'réinitialisation démo');
    broadcast('reload', { by: acc.id });
    return send(res, 200, { ok: true });
  }

  return fail(res, 404, 'Route inconnue');
}

/* ---------- Fichiers statiques ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Introuvable'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Erreur serveur');
    if (!e.status) console.error(e);
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Pipe-Fit CRM : http://localhost:${PORT}  (base : ${DB_FILE})`);
    if (!hasAccounts()) console.log(`Première utilisation : ouvrez http://localhost:${PORT} sur ce poste pour créer le compte administrateur.`);
  });
}
module.exports = { server, db };
