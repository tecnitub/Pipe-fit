// Pipe-Fit Études : application du bureau d'études fluides (CVC, tuyauterie industrielle).
// Sa propre base (études et notes de calcul versionnées), son propre port ; elle lit la liste des affaires dans Pipe-Fit
// avec le compte de l'utilisateur (même identifiant et mot de passe ; réservée au bureau).
// Aucune dépendance externe : Node.js >= 22.13 (node:sqlite).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const HS = require('../server/http-securite');
const RexPF = require('./rex');
const PF = require('../server/pf-client');

const PORT = +process.env.ETUDES_PORT || 3200;
const HOST = process.env.HOST || '0.0.0.0';
const PIPEFIT = String(process.env.PIPEFIT_URL || 'http://localhost:3000').replace(/\/+$/, '');
const DB_FILE = process.env.ETUDES_DB_FILE || path.join(__dirname, 'data', 'etudes.db');
const PUBLIC_DIR = path.join(__dirname, 'public');
// Modules de Pipe-Fit et de l'application DOE servis tels quels : moteur PDF, feuille de style commune, logo
const PARTAGES = { '/shared/pdf.js': path.join(__dirname, '..', 'public', 'js', 'pdf.js'), '/shared/doe.css': path.join(__dirname, '..', 'doe', 'public', 'css', 'doe.css'),
  '/shared/pdf-lib.min.js': path.join(__dirname, '..', 'doe', 'public', 'vendor', 'pdf-lib-1.17.1.min.js'),
  '/logo-tecnitub.png': path.join(__dirname, '..', 'doe', 'public', 'logo-tecnitub.png') };
const MAX_JSON = 25 * 1024 * 1024, SESSION_JOURS = 14; // note de calcul PDF transmise en JSON (base64)
const ROLES_ETUDES = ['admin', 'charge'];

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, login TEXT, nom TEXT, role TEXT, pf_cookie TEXT, created_at TEXT);
  CREATE TABLE IF NOT EXISTS etudes (id TEXT PRIMARY KEY, affaire_id TEXT, data TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT, updated_by TEXT);
  CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);`);

// Identité de l'entreprise sur les notes de calcul (la même que pour les DOE), modifiable dans Réglages
const CONFIG_DEFAUT = require('../doe/config-defaut');
const lireConfig = () => { const r = db.prepare("SELECT value FROM config WHERE key = 'etudes'").get(); const c = r ? JSON.parse(r.value) : {}; return { ...CONFIG_DEFAUT, ...c, societe: { ...CONFIG_DEFAUT.societe, ...(c.societe || {}) } }; };

/* ---------- Outils HTTP ---------- */
function send(res, status, obj, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}
const fail = (res, status, error, extra = {}) => send(res, status, { error, ...extra });
function lireJSON(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_JSON) { reject(Object.assign(new Error('Requête trop volumineuse'), { status: 413 })); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => {
      const b = Buffer.concat(chunks);
      if (!b.length) return resolve({});
      try { resolve(JSON.parse(b.toString('utf8'))); } catch (e) { reject(Object.assign(new Error('JSON invalide'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
const cookies = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, v.join('=')]));
// Seule l'empreinte de l'identifiant de session est enregistrée
const empreinte = sid => crypto.createHash('sha256').update(String(sid)).digest('hex');
const cookieSession = (req, sid, age) => `etudes_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${HS.estHttps(req) ? '; Secure' : ''}`;
function session(req) {
  const sid = cookies(req).etudes_sid;
  if (!sid) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE sid = ?').get(empreinte(sid));
  if (!s) return null;
  if (Date.now() - new Date(s.created_at) > SESSION_JOURS * 86400000) { db.prepare('DELETE FROM sessions WHERE sid = ?').run(s.sid); return null; }
  return s;
}

/* ---------- Lien avec Pipe-Fit ---------- */
async function pipefit(s, chemin, opts = {}) {
  const r = await fetch(PIPEFIT + chemin, { ...opts, headers: { ...(opts.headers || {}), Cookie: s.pf_cookie }, signal: AbortSignal.timeout(30000) });
  if (r.status === 401) { db.prepare('DELETE FROM sessions WHERE sid = ?').run(s.sid); throw Object.assign(new Error('Session Pipe-Fit expirée : reconnectez-vous.'), { status: 401 }); }
  return r;
}
// Seules les informations utiles aux études sont transmises au navigateur : affaires, clients, bibliothèque de prix, main-d'œuvre
const extraitPF = d => ({
  affaires: (d.affaires || []).map(a => ({ id: a.id, code: a.code, nom: a.nom, clientId: a.clientId, contactId: a.contactId, siteId: a.siteId, chargeId: a.chargeId, statut: a.statut, type: a.type })),
  entreprises: (d.entreprises || []).map(e => ({ id: e.id, nom: e.nom, regimeTVA: e.regimeTVA })),
  articles: (d.articles || []).map(a => ({ id: a.id, ref: a.ref, designation: a.designation, famille: a.famille, sousFamille: a.sousFamille, unite: a.unite, prixVente: a.prixVente, coutRevient: a.coutRevient, poidsUnitaire: a.poidsUnitaire })),
  mainoeuvre: (d.mainoeuvre || []).map(m => ({ id: m.id, code: m.code, libelle: m.libelle, tauxVente: m.tauxVente, tauxCout: m.tauxCout })),
});
const { idPF, envoyerFichierPF, publierEtat } = PF;
const modifierPF = (s, col, id, modifier) => PF.modifierPF((chemin, opts) => pipefit(s, chemin, opts), col, id, modifier);
const cacheDonnees = new Map(); // sid -> { t, data }

// Envoi en arrière-plan : une étude s'enregistre même si Pipe-Fit est momentanément injoignable
const signalerPF = (s, id, affaireId, resume) => publierEtat((chemin, opts) => pipefit(s, chemin, opts), 'etudes', id, affaireId, resume && typeof resume === 'object' ? resume : { objet: '' })
  .catch(e => console.warn(`Études → Pipe-Fit : ${e.message}`));

async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean), method = req.method;
  // Protection CSRF : écritures en JSON uniquement (impossible depuis un formulaire d'un autre site), origine contrôlée
  if (method !== 'GET' && !(req.headers['content-type'] || '').startsWith('application/json')) return fail(res, 415, 'Content-Type application/json requis');
  if (HS.origineRefusee(req)) return fail(res, 403, 'Origine de la requête refusée');

  if (p[0] === 'login' && method === 'POST') {
    const { login, password } = await lireJSON(req);
    let r;
    try { r = await fetch(`${PIPEFIT}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': HS.ipClient(req) }, body: JSON.stringify({ login, password }), signal: AbortSignal.timeout(15000) }); }
    catch (e) { return fail(res, 502, `Pipe-Fit est injoignable (${PIPEFIT}) : vérifiez l'adresse PIPEFIT_URL.`); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return fail(res, r.status === 401 ? 401 : 502, j.error || 'Identifiant ou mot de passe incorrect');
    const pf = String(r.headers.get('set-cookie') || '').split(';')[0];
    const me = await (await fetch(`${PIPEFIT}/api/me`, { headers: { Cookie: pf } })).json().catch(() => ({}));
    if (!ROLES_ETUDES.includes(me.role)) return fail(res, 403, 'L\'application Études est réservée au bureau (administrateur ou chargé d\'affaires).');
    const sid = crypto.randomBytes(24).toString('base64url');
    db.prepare('INSERT INTO sessions (sid, login, nom, role, pf_cookie, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(empreinte(sid), me.login, me.nom, me.role, pf, new Date().toISOString());
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

  // Affaires de Pipe-Fit (lecture seule, droits de l'utilisateur)
  if (p[0] === 'pf' && p[1] === 'affaires' && method === 'GET') {
    const c = cacheDonnees.get(s.sid);
    if (c && Date.now() - c.t < 15000 && !url.searchParams.has('frais')) return send(res, 200, c.data);
    const r = await pipefit(s, '/api/data');
    if (!r.ok) return fail(res, 502, 'Lecture des données Pipe-Fit impossible');
    const data = extraitPF(await r.json());
    cacheDonnees.set(s.sid, { t: Date.now(), data });
    return send(res, 200, data);
  }

  // Retour d'expérience pour caler le métré : chantiers terminés, heures prévues (devis acceptés) et heures pointées par main-d'œuvre
  if (p[0] === 'pf' && p[1] === 'rex' && method === 'GET') {
    const r = await pipefit(s, '/api/data');
    if (!r.ok) return fail(res, 502, 'Lecture des données Pipe-Fit impossible');
    return send(res, 200, RexPF(await r.json()));
  }

  // Note de calcul déposée dans les documents du chantier (catégorie « Note de calcul », nouvel indice si déjà déposée pour cette étude)
  if (p[0] === 'pf' && p[1] === 'document' && method === 'POST') {
    const b = await lireJSON(req), nom = String(b.nom || '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 150);
    if (!b.affaireId || !/\.pdf$/i.test(nom) || !b.base64) return fail(res, 400, 'Affaire, nom de fichier PDF et contenu requis');
    const buf = Buffer.from(String(b.base64), 'base64');
    if (buf.subarray(0, 4).toString() !== '%PDF') return fail(res, 400, 'Le contenu n\'est pas un PDF');
    const f = await envoyerFichierPF((chemin, opts) => pipefit(s, chemin, opts), nom, 'application/pdf', buf);
    let docId = '', indice = '';
    await modifierPF(s, 'affaires', b.affaireId, a => {
      const docs = a.documents || [], ex = b.etudeId && docs.find(d => d.categorie === 'Note de calcul' && d.etudeId === b.etudeId), date = new Date().toISOString().slice(0, 10);
      if (ex) {
        ex.anciens = [...(ex.anciens || []), { fichierId: ex.fichierId, indice: ex.indice || 'A', date: ex.date }];
        Object.assign(ex, { fichierId: f.id, nom, mime: f.mime, taille: f.taille, indice: String(b.indice || ex.indice || 'A'), date, par: s.nom || s.login, note: String(b.note || ex.note || '') });
        docId = ex.id; indice = ex.indice;
      } else {
        docId = idPF(); indice = String(b.indice || 'A');
        docs.push({ id: docId, fichierId: f.id, nom, categorie: 'Note de calcul', indice, note: String(b.note || ''), mime: f.mime, taille: f.taille, date, par: s.nom || s.login, visible: false, etudeId: String(b.etudeId || '') });
      }
      return { ...a, documents: docs };
    });
    return send(res, 200, { ok: true, docId, indice });
  }
  // Devis brouillon créé dans Pipe-Fit à partir du métré de l'étude (client, contact et site de l'affaire)
  if (p[0] === 'pf' && p[1] === 'devis' && method === 'POST') {
    const b = await lireJSON(req);
    if (!b.affaireId || !Array.isArray(b.lignes) || !b.lignes.length) return fail(res, 400, 'Affaire et lignes du devis requises');
    const ra = await pipefit(s, `/api/records/affaires/${encodeURIComponent(b.affaireId)}`);
    if (!ra.ok) return fail(res, ra.status === 404 ? 404 : 502, 'Affaire introuvable dans Pipe-Fit');
    const a = await ra.json(), rc = a.clientId ? await pipefit(s, `/api/records/entreprises/${encodeURIComponent(a.clientId)}`) : null, client = rc && rc.ok ? await rc.json() : {};
    const tva = client.regimeTVA === 'AL' ? { autoliquidation: true } : { autoliquidation: false, tauxTVA: client.regimeTVA ? Number(client.regimeTVA) : '' };
    const id = idPF(), data = { numero: '', objet: String(b.objet || a.nom || 'Chiffrage bureau d\'études').slice(0, 200), clientId: a.clientId || '', contactId: a.contactId || '', siteId: a.siteId || '', chargeId: a.chargeId || '',
      affaireId: a.id, date: new Date().toISOString().slice(0, 10), validite: 30, statut: 'Brouillon', zoneId: '', ajustements: [], lignes: b.lignes, numAuto: true, ...tva,
      notes: `Métré établi par le bureau d'études (application Études${b.etudeId ? `, étude ${b.etudeId}` : ''}) : quantités et prix à vérifier.` };
    const w = await pipefit(s, `/api/records/devis/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
    const j = await w.json().catch(() => ({}));
    if (!w.ok) return fail(res, w.status === 403 ? 403 : w.status === 400 ? 400 : 502, j.error || 'Création du devis refusée par Pipe-Fit');
    return send(res, 200, { id: j.id || id, numero: j.numero || '' });
  }

  // Études : en-tête (affaire, objet, indice) et notes de calcul ; contrôle de version à l'enregistrement
  const ligne = r => ({ ...JSON.parse(r.data), id: r.id, _v: r.version, _at: r.updated_at, _by: r.updated_by });
  if (p[0] === 'etudes' && !p[1] && method === 'GET') return send(res, 200, db.prepare('SELECT * FROM etudes ORDER BY updated_at DESC').all().map(ligne));
  if (p[0] === 'etudes' && p[1]) {
    if (!/^[\w-]{1,64}$/.test(p[1])) return fail(res, 400, 'Identifiant invalide');
    const exist = db.prepare('SELECT * FROM etudes WHERE id = ?').get(p[1]);
    if (method === 'GET') return exist ? send(res, 200, ligne(exist)) : fail(res, 404, 'Étude introuvable');
    if (method === 'PUT') {
      const { data, version, resume } = await lireJSON(req);
      if (!data || typeof data !== 'object' || !String(data.objet || '').trim() || !Array.isArray(data.notes)) return fail(res, 400, 'Données manquantes (objet de l\'étude, notes)');
      if (exist && version !== exist.version) return fail(res, 409, `Modifiée entre-temps par ${exist.updated_by}`, { record: ligne(exist) });
      const propre = Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith('_') && k !== 'id'));
      const v = exist ? exist.version + 1 : 1, now = new Date().toISOString();
      db.prepare(`INSERT INTO etudes (id, affaire_id, data, version, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET affaire_id = excluded.affaire_id, data = excluded.data, version = excluded.version, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
        .run(p[1], data.affaireId || '', JSON.stringify(propre), v, now, s.nom || s.login);
      // État de l'étude sur la fiche chantier de Pipe-Fit (rattachée à un chantier, modèles exclus) ; retiré d'un chantier quitté
      const affaireId = data.modele ? '' : String(data.affaireId || '');
      if (affaireId || (exist && exist.affaire_id)) signalerPF(s, p[1], affaireId, resume);
      return send(res, 200, ligne(db.prepare('SELECT * FROM etudes WHERE id = ?').get(p[1])));
    }
    if (method === 'DELETE') { db.prepare('DELETE FROM etudes WHERE id = ?').run(p[1]); if (exist && exist.affaire_id) signalerPF(s, p[1], '', null); return send(res, 200, { ok: true }); }
  }

  // Réglages : identité de l'entreprise sur les notes de calcul
  if (p[0] === 'config') {
    if (method === 'GET') return send(res, 200, lireConfig());
    if (method === 'PUT') {
      if (s.role !== 'admin') return fail(res, 403, 'Réservé à l\'administrateur');
      const b = await lireJSON(req), c = { ...lireConfig(), ...b, societe: { ...lireConfig().societe, ...(b.societe || {}) } };
      db.prepare("INSERT INTO config (key, value) VALUES ('etudes', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(c));
      return send(res, 200, c);
    }
  }
  return fail(res, 404, 'Route inconnue');
}

/* ---------- Fichiers statiques ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
function statique(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end(); }
  const file = PARTAGES[rel] || path.normalize(path.join(PUBLIC_DIR, rel === '/' ? '/index.html' : rel));
  if (!PARTAGES[rel] && !file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Introuvable'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

// HTTP, ou HTTPS avec le certificat de TLS_DIR / TLS_CERT… (le même que Pipe-Fit) ; en-têtes de sécurité
const SERVEUR = HS.creerServeur(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); return res.end(); }
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else statique(req, res, url);
  } catch (e) {
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Erreur serveur');
    if (!e.status) console.error(e);
  }
}, { dossierDonnees: path.dirname(DB_FILE), nom: 'Pipe-Fit Études' });
const server = SERVEUR.server;

if (require.main === module) {
  SERVEUR.surveiller();
  server.listen(PORT, HOST, () => console.log(`Pipe-Fit Études : ${SERVEUR.etat.https ? 'https' : 'http'}://localhost:${PORT}  (Pipe-Fit : ${PIPEFIT}, base : ${DB_FILE})`));
}
module.exports = { server, db };
