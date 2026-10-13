// Serveur multi-utilisateurs : API REST + temps réel (SSE) + fichiers statiques.
// Aucune dépendance externe : Node.js >= 22.13 (module node:sqlite).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DB = require('./db');
const { demoData, uid } = require('./demo');

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
  if (acc.role === 'atelier') return col === 'temps';
  return false;
}
function canDelete(acc, col) {
  if (col === 'factures') return acc.role === 'admin';
  return canWrite(acc, col);
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
  const a = db.prepare('SELECT id, login, nom, role, user_id FROM accounts WHERE id = ?').get(s.account_id);
  return a ? { ...a, token } : null;
}
const publicAccount = a => ({ id: a.id, login: a.login, nom: a.nom, role: a.role, userId: a.user_id });
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
  if (p[0] === 'me' && !p[1] && method === 'GET') return send(res, 200, publicAccount(acc));
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
        if (col === 'factures' && existing && acc.role !== 'admin') obj = { ...DB.clean(existing), statut: obj.statut };
        // Opérateur atelier : uniquement ses propres pointages
        if (acc.role === 'atelier' && (obj.userId !== acc.user_id || (existing && existing.userId !== acc.user_id))) return { forbidden: true };
        const numbering = DB.NUMBERING[col];
        if (numbering) {
          const field = numbering[0];
          obj[field] = existing ? existing[field] : DB.nextNumber(db, col);
        }
        const now = new Date().toISOString();
        const v = existing ? existing._v + 1 : 1;
        db.prepare(`INSERT INTO records (col, id, data, version, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, version = excluded.version, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
          .run(col, id, JSON.stringify(obj), v, now, acc.nom || acc.login);
        DB.audit(db, acc.login, existing ? 'modification' : 'création', col, id, labelOf(obj));
        return { record: DB.getRecord(db, col, id) };
      });
      if (result.forbidden) return fail(res, 403, 'Vous ne pouvez saisir que vos propres heures');
      if (result.conflict) {
        return fail(res, 409, `Modifié entre-temps par ${result.conflict._by || 'un autre utilisateur'}`, { record: result.conflict });
      }
      broadcast('change', { col, record: result.record, client: req.headers['x-client-id'] || null });
      return send(res, 200, result.record);
    }

    if (method === 'DELETE') {
      if (!canDelete(acc, col)) return fail(res, 403, 'Droits insuffisants');
      const existing = DB.getRecord(db, col, id);
      if (!existing) return send(res, 200, { ok: true });
      if (acc.role === 'atelier' && existing.userId !== acc.user_id) return fail(res, 403, 'Vous ne pouvez supprimer que vos propres heures');
      db.prepare('DELETE FROM records WHERE col = ? AND id = ?').run(col, id);
      DB.audit(db, acc.login, 'suppression', col, id, labelOf(existing));
      broadcast('delete', { col, id, client: req.headers['x-client-id'] || null });
      return send(res, 200, { ok: true });
    }
  }

  /* --- Administration --- */
  if (acc.role !== 'admin') return fail(res, 403, 'Réservé aux administrateurs');

  if (p[0] === 'settings' && method === 'PUT') {
    const s = await readBody(req);
    DB.setSettings(db, s);
    DB.audit(db, acc.login, 'paramètres');
    broadcast('settings', { settings: s, by: acc.id });
    return send(res, 200, s);
  }

  if (p[0] === 'accounts') {
    if (method === 'GET') {
      return send(res, 200, db.prepare('SELECT id, login, nom, role, user_id, created_at FROM accounts ORDER BY login').all()
        .map(a => ({ ...publicAccount(a), createdAt: a.created_at })));
    }
    const body = method === 'DELETE' ? {} : await readBody(req);
    if (body.role && !DB.ROLES.includes(body.role)) return fail(res, 400, 'Rôle invalide');
    if (body.password && String(body.password).length < 8) return fail(res, 400, 'Mot de passe : 8 caractères minimum');

    if (method === 'POST') {
      if (!body.login || !body.password) return fail(res, 400, 'Identifiant et mot de passe requis');
      if (db.prepare('SELECT 1 FROM accounts WHERE login = ?').get(body.login)) return fail(res, 400, 'Identifiant déjà utilisé');
      const id = createAccount(body.login, body.nom, body.role || 'charge', body.userId, body.password);
      DB.audit(db, acc.login, 'création compte', null, id, body.login);
      return send(res, 200, { id });
    }
    const target = p[1] && db.prepare('SELECT * FROM accounts WHERE id = ?').get(p[1]);
    if (!target) return fail(res, 404, 'Compte introuvable');
    const admins = db.prepare("SELECT COUNT(*) n FROM accounts WHERE role = 'admin'").get().n;
    if (method === 'PUT') {
      if (target.role === 'admin' && body.role && body.role !== 'admin' && admins <= 1) return fail(res, 400, 'Il doit rester au moins un administrateur');
      db.prepare('UPDATE accounts SET nom = ?, role = ?, user_id = ? WHERE id = ?')
        .run(body.nom ?? target.nom, body.role ?? target.role, body.userId === undefined ? target.user_id : (body.userId || null), target.id);
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
