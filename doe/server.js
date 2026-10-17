// Pipe-Fit DOE : application séparée pour constituer les Dossiers des Ouvrages Exécutés.
// Sa propre base (dossiers DOE, pièces jointes), son propre port ; elle lit les données des chantiers dans Pipe-Fit
// avec le compte de l'utilisateur (même identifiant et mot de passe, mêmes droits ; réservée au bureau).
// Aucune dépendance externe : Node.js >= 22.13 (node:sqlite).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = +process.env.DOE_PORT || 3100;
const HOST = process.env.HOST || '0.0.0.0';
const PIPEFIT = String(process.env.PIPEFIT_URL || 'http://localhost:3000').replace(/\/+$/, '');
const DB_FILE = process.env.DOE_DB_FILE || path.join(__dirname, 'data', 'doe.db');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PDF_MOTEUR = path.join(__dirname, '..', 'public', 'js', 'pdf.js');
const MAX_JSON = 5 * 1024 * 1024, MAX_FICHIER = 60 * 1024 * 1024, SESSION_JOURS = 14;
const TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', dwg: 'image/vnd.dwg', dxf: 'image/vnd.dxf',
  ifc: 'application/x-step', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zip: 'application/zip' };
const ROLES_DOE = ['admin', 'charge'];

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, login TEXT, nom TEXT, role TEXT, pf_cookie TEXT, created_at TEXT);
  CREATE TABLE IF NOT EXISTS does (id TEXT PRIMARY KEY, affaire_id TEXT, data TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT, updated_by TEXT);
  CREATE TABLE IF NOT EXISTS fichiers (id TEXT PRIMARY KEY, nom TEXT, mime TEXT, data BLOB, taille INTEGER, created_by TEXT, created_at TEXT);
  CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);`);

// Identité de l'entreprise sur les pièces du DOE (charte TECNITUB), modifiable dans Réglages
const CONFIG_DEFAUT = require('./config-defaut');
const lireConfig = () => { const r = db.prepare("SELECT value FROM config WHERE key = 'doe'").get(); const c = r ? JSON.parse(r.value) : {}; return { ...CONFIG_DEFAUT, ...c, societe: { ...CONFIG_DEFAUT.societe, ...(c.societe || {}) } }; };

/* ---------- Outils HTTP ---------- */
function send(res, status, obj, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}
const fail = (res, status, error, extra = {}) => send(res, status, { error, ...extra });
function lire(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > max) { reject(Object.assign(new Error('Fichier ou requête trop volumineux'), { status: 413 })); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function lireJSON(req) {
  const b = await lire(req, MAX_JSON);
  if (!b.length) return {};
  try { return JSON.parse(b.toString('utf8')); } catch (e) { throw Object.assign(new Error('JSON invalide'), { status: 400 }); }
}
const cookies = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, v.join('=')]));
const estHttps = req => req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
const cookieSession = (req, sid, age) => `doe_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${estHttps(req) ? '; Secure' : ''}`;
function session(req) {
  const sid = cookies(req).doe_sid;
  if (!sid) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE sid = ?').get(sid);
  if (!s) return null;
  if (Date.now() - new Date(s.created_at) > SESSION_JOURS * 86400000) { db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid); return null; }
  return s;
}

/* ---------- Lien avec Pipe-Fit ---------- */
// Appel à Pipe-Fit avec la session Pipe-Fit de l'utilisateur ; session expirée côté Pipe-Fit = déconnexion ici
async function pipefit(s, chemin, opts = {}) {
  const r = await fetch(PIPEFIT + chemin, { ...opts, headers: { ...(opts.headers || {}), Cookie: s.pf_cookie }, signal: AbortSignal.timeout(30000) });
  if (r.status === 401) { db.prepare('DELETE FROM sessions WHERE sid = ?').run(s.sid); throw Object.assign(new Error('Session Pipe-Fit expirée : reconnectez-vous.'), { status: 401 }); }
  return r;
}
const cacheDonnees = new Map(); // sid -> { t, data }

async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean), method = req.method;
  // Protection CSRF : écritures en JSON, ou envoi de fichier avec l'en-tête X-Doe-Upload (impossible depuis un autre site)
  const envoiFichier = p[0] === 'fichiers' && !p[1] && method === 'POST' && req.headers['x-doe-upload'] === '1';
  if (method !== 'GET' && !envoiFichier && !(req.headers['content-type'] || '').startsWith('application/json')) return fail(res, 415, 'Content-Type application/json requis');

  if (p[0] === 'login' && method === 'POST') {
    const { login, password } = await lireJSON(req);
    let r;
    try { r = await fetch(`${PIPEFIT}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, password }), signal: AbortSignal.timeout(15000) }); }
    catch (e) { return fail(res, 502, `Pipe-Fit est injoignable (${PIPEFIT}) : vérifiez l'adresse PIPEFIT_URL.`); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return fail(res, r.status === 401 ? 401 : 502, j.error || 'Identifiant ou mot de passe incorrect');
    const pf = String(r.headers.get('set-cookie') || '').split(';')[0];
    const me = await (await fetch(`${PIPEFIT}/api/me`, { headers: { Cookie: pf } })).json().catch(() => ({}));
    if (!ROLES_DOE.includes(me.role)) return fail(res, 403, 'L\'application DOE est réservée au bureau (administrateur ou chargé d\'affaires).');
    const sid = crypto.randomBytes(24).toString('base64url');
    db.prepare('INSERT INTO sessions (sid, login, nom, role, pf_cookie, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(sid, me.login, me.nom, me.role, pf, new Date().toISOString());
    return send(res, 200, { login: me.login, nom: me.nom, role: me.role }, { 'Set-Cookie': cookieSession(req, sid, SESSION_JOURS * 86400) });
  }
  const s = session(req);
  if (!s) return fail(res, 401, 'Non connecté');
  if (p[0] === 'logout' && method === 'POST') {
    await pipefit(s, '/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    db.prepare('DELETE FROM sessions WHERE sid = ?').run(s.sid); cacheDonnees.delete(s.sid);
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookieSession(req, '', 0) });
  }
  if (p[0] === 'me' && method === 'GET') return send(res, 200, { login: s.login, nom: s.nom, role: s.role, pipefit: process.env.PIPEFIT_PUBLIC_URL || '' });

  // Données des chantiers dans Pipe-Fit (lecture seule, droits de l'utilisateur)
  if (p[0] === 'pf' && p[1] === 'donnees' && method === 'GET') {
    const c = cacheDonnees.get(s.sid);
    if (c && Date.now() - c.t < 15000 && !url.searchParams.has('frais')) return send(res, 200, c.data);
    const r = await pipefit(s, '/api/data');
    if (!r.ok) return fail(res, 502, 'Lecture des données Pipe-Fit impossible');
    const data = await r.json();
    cacheDonnees.set(s.sid, { t: Date.now(), data });
    return send(res, 200, data);
  }
  if (p[0] === 'pf' && p[1] === 'fichier' && p[2] && method === 'GET') {
    const r = await pipefit(s, `/api/files/${encodeURIComponent(p[2])}`);
    if (!r.ok) return fail(res, 404, 'Fichier Pipe-Fit introuvable');
    const buf = Buffer.from(await r.arrayBuffer()), mime = r.headers.get('content-type') || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', ...(/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(mime) ? {} : { 'Content-Disposition': 'attachment', 'Content-Security-Policy': 'sandbox' }) });
    return res.end(buf);
  }

  // Dossiers DOE
  const ligne = r => ({ ...JSON.parse(r.data), id: r.id, _v: r.version, _at: r.updated_at, _by: r.updated_by });
  if (p[0] === 'does' && !p[1] && method === 'GET') return send(res, 200, db.prepare('SELECT * FROM does ORDER BY updated_at DESC').all().map(ligne));
  if (p[0] === 'does' && p[1]) {
    const exist = db.prepare('SELECT * FROM does WHERE id = ?').get(p[1]);
    if (method === 'GET') return exist ? send(res, 200, ligne(exist)) : fail(res, 404, 'Dossier introuvable');
    if (method === 'PUT') {
      const { data, version } = await lireJSON(req);
      if (!data || typeof data !== 'object' || !data.affaireId) return fail(res, 400, 'Données manquantes');
      if (exist && version !== exist.version) return fail(res, 409, `Modifié entre-temps par ${exist.updated_by}`, { record: ligne(exist) });
      if (!exist && db.prepare('SELECT 1 FROM does WHERE affaire_id = ?').get(data.affaireId)) return fail(res, 409, 'Ce chantier a déjà un DOE');
      const propre = Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith('_') && k !== 'id'));
      const v = exist ? exist.version + 1 : 1, now = new Date().toISOString();
      db.prepare(`INSERT INTO does (id, affaire_id, data, version, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data, version = excluded.version, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
        .run(p[1], data.affaireId, JSON.stringify(propre), v, now, s.nom || s.login);
      return send(res, 200, ligne(db.prepare('SELECT * FROM does WHERE id = ?').get(p[1])));
    }
    if (method === 'DELETE') { db.prepare('DELETE FROM does WHERE id = ?').run(p[1]); return send(res, 200, { ok: true }); }
  }

  // Pièces jointes du DOE (plans, fiches techniques, PV, notices, attestations…)
  if (envoiFichier) {
    const nom = (() => { try { return decodeURIComponent(String(req.headers['x-filename'] || '')); } catch (e) { return ''; } })().slice(0, 200);
    const mime = TYPES[String((/\.([a-z0-9]+)$/i.exec(nom) || [])[1] || '').toLowerCase()];
    if (!mime) return fail(res, 415, `Type de fichier non accepté (${Object.keys(TYPES).join(', ')})`);
    const buf = await lire(req, MAX_FICHIER);
    if (!buf.length) return fail(res, 400, 'Fichier vide');
    const magie = { 'application/pdf': [0x25, 0x50, 0x44, 0x46], 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff] }[mime];
    if (magie && !magie.every((b, i) => buf[i] === b)) return fail(res, 415, 'Le contenu du fichier ne correspond pas à son extension');
    const id = crypto.randomBytes(12).toString('hex');
    db.prepare('INSERT INTO fichiers (id, nom, mime, data, taille, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, nom, mime, buf, buf.length, s.login, new Date().toISOString());
    return send(res, 200, { id, nom, mime, taille: buf.length });
  }
  if (p[0] === 'fichiers' && p[1] && method === 'GET') {
    const f = db.prepare('SELECT nom, mime, data FROM fichiers WHERE id = ?').get(p[1]);
    if (!f) return fail(res, 404, 'Fichier introuvable');
    const affiche = /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.mime), nom = String(f.nom || 'document').replace(/[^\w .()-]+/g, '_');
    res.writeHead(200, { 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${affiche ? 'inline' : 'attachment'}; filename="${nom}"`, ...(affiche ? {} : { 'Content-Security-Policy': 'sandbox' }) });
    return res.end(Buffer.from(f.data));
  }

  // Réglages : identité de l'entreprise, lieu de signature, logo
  if (p[0] === 'config') {
    if (method === 'GET') return send(res, 200, lireConfig());
    if (method === 'PUT') {
      if (s.role !== 'admin') return fail(res, 403, 'Réservé à l\'administrateur');
      const b = await lireJSON(req), c = { ...lireConfig(), ...b, societe: { ...lireConfig().societe, ...(b.societe || {}) } };
      db.prepare("INSERT INTO config (key, value) VALUES ('doe', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(c));
      return send(res, 200, c);
    }
  }
  return fail(res, 404, 'Route inconnue');
}

/* ---------- Fichiers statiques ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };
function statique(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  const file = rel === '/shared/pdf.js' ? PDF_MOTEUR : path.normalize(path.join(PUBLIC_DIR, rel === '/' ? '/index.html' : rel));
  if (file !== PDF_MOTEUR && !file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
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
    else statique(req, res, url);
  } catch (e) {
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Erreur serveur');
    if (!e.status) console.error(e);
  }
});

if (require.main === module) server.listen(PORT, HOST, () => console.log(`Pipe-Fit DOE : http://localhost:${PORT}  (Pipe-Fit : ${PIPEFIT}, base : ${DB_FILE})`));
module.exports = { server, db };
