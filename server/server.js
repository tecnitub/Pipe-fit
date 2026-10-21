// Serveur multi-utilisateurs : API REST + temps réel (SSE) + fichiers statiques.
// Aucune dépendance externe : Node.js >= 22.13 (module node:sqlite).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DB = require('./db');
const { demoData, uid } = require('./demo');
const M365 = require('./m365');
const EF = require('./efacture');
const MAILF = require('./mail-factures');
const DossierDocuments = require('./dossier-documents');
const AgendaSync = require('./agenda');
const HS = require('./http-securite');
const API = require('./api');
const Push = require('./push');
const Notifs = require('./notifs');
const Compagnon = require('../public/js/compagnon');
const NoteFrais = require('../public/js/frais');
const ReglesPointage = require('../public/js/pointage-regles');
const Epreuve = require('../public/js/epreuve');
const Essais = require('../public/js/essais');
const Acces = require('../public/js/acces');
const Fluides = require('../public/js/fluides');

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'pipefit.db');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SESSION_DAYS = 30;
const MAX_BODY = 10 * 1024 * 1024;
const MAX_DOCUMENT = 40 * 1024 * 1024;
const TYPES_DOCUMENTS = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', dwg: 'image/vnd.dwg', dxf: 'image/vnd.dxf',
  ifc: 'application/x-step', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zip: 'application/zip', txt: 'text/plain',
  eml: 'message/rfc822', msg: 'application/vnd.ms-outlook', // e-mails de demande du client
  doc: 'application/msword', xls: 'application/vnd.ms-excel', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', csv: 'text/csv',
  dwf: 'model/vnd.dwf', stp: 'model/step', step: 'model/step' }; // hors PDF et images : toujours téléchargés, jamais affichés

const db = DB.open(DB_FILE);
API.initTables(db);
Push.initTables(db);

/* ---------- Initialisation ---------- */
if (!db.prepare('SELECT 1 FROM settings WHERE id = 1').get()) {
  if (process.env.SEED_DEMO === '0') DB.setSettings(db, demoData().settings);
  else { DB.replaceAll(db, demoData(), 'système'); console.log('Base initialisée avec les données de démonstration.'); }
}
// Sessions ouvertes avant le chiffrement des jetons : remplacées une fois par leur empreinte (personne n'est déconnecté)
if (!DB.getConfig(db, 'sessions-empreintes')) {
  DB.tx(db, () => {
    const maj = db.prepare('UPDATE sessions SET token = ? WHERE token = ?');
    db.prepare('SELECT token FROM sessions').all().forEach(x => maj.run(crypto.createHash('sha256').update(x.token).digest('hex'), x.token));
    DB.setConfig(db, 'sessions-empreintes', { depuis: new Date().toISOString() });
  });
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
// Sur le serveur lui-même (pas au travers d'un reverse proxy installé sur la même machine)
const isLocal = HS.estLocal;

/* ---------- Droits ---------- */
// admin : tout. charge : données métier (hors ressources/paramètres). atelier : saisie des heures uniquement.
function canWrite(acc, col) {
  if (acc.role === 'admin') return true;
  if (acc.role === 'charge') return col !== 'users';
  if (acc.role === 'atelier') return ['temps', 'frais', 'rapports', 'consommations', 'notifications', 'fichesFluides', 'equipementsFrigo', 'enlevements', 'epreuves', 'misesEnService', 'equilibrages'].includes(col);
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
  if (col === 'temps') { const r = ReglesPointage.refusTemps(obj, existing, ReglesPointage.jourIso(new Date())); if (r) return r; }
  const allowed = col === 'temps' ? pointablePour(acc) : [acc.user_id];
  if (!allowed.includes(obj ? obj.userId : null) && obj) return 'Vous ne pouvez saisir que pour vous ou votre équipe';
  if (existing && !allowed.includes(existing.userId)) return 'Vous ne pouvez modifier que vos saisies ou celles de votre équipe';
  if (existing && (existing.verrouille || (col === 'rapports' && existing.signatureClientId))) return 'Ce bon d\'intervention est signé par le client : il ne peut plus être modifié';
  if (existing && ['Validé', 'Validée', 'Remboursée'].includes(existing.statut)) return 'Cette saisie est déjà validée : demandez une correction à votre chargé d\'affaires';
  if (obj && ['Validé', 'Validée', 'Remboursée', 'Refusé', 'Refusée'].includes(obj.statut) && (!existing || existing.statut !== obj.statut)) return 'La validation est réservée aux chargés d\'affaires';
  return null;
}

/* ---------- Vue des compagnons : données filtrées selon les réglages ---------- */
const recordsDe = col => db.prepare('SELECT data FROM records WHERE col = ?').all(col).map(r => JSON.parse(r.data));
const estCompagnon = acc => acc && acc.role === 'atelier';
const reglesCompagnon = () => Compagnon.regles(DB.getSettings(db));
const contexteCompagnon = acc => Compagnon.contexte(acc.user_id, recordsDe('users'), recordsDe('affaires'));
// Affichage par accès (Paramètres) : données des écrans masqués à ce compte, retirées ou en lecture seule
const restrictionsDe = (acc, settings) => Acces.restrictions(Acces.masques(acc && { id: acc.id, role: acc.role }, (settings || DB.getSettings(db)).acces));
const REFUS_ACCES = 'Accès non autorisé pour votre compte (Paramètres → Affichage par accès)';
const pourCompagnon = (acc, col, rec) => Acces.filtrer(restrictionsDe(acc), col, estCompagnon(acc) ? Compagnon.filtrer(col, rec, reglesCompagnon(), contexteCompagnon(acc)) : rec);

/* ---------- Temps réel (Server-Sent Events) ---------- */
const clients = new Map(); // flux -> compte connecté
function broadcast(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  let regles = null, ctx = null, settings = null;
  for (const [res, acc] of clients) {
    // Compte dont des écrans sont masqués : données de ces écrans retirées du flux
    settings = settings || DB.getSettings(db);
    const r = restrictionsDe(acc, settings);
    if (!estCompagnon(acc) && r.vide) { res.write(msg); continue; }
    if (!estCompagnon(acc)) {
      if (event === 'settings') { res.write(`event: settings\ndata: ${JSON.stringify({ ...payload, settings: Acces.filtrerReglages(r, payload.settings) })}\n\n`); continue; }
      if ((event === 'change' || event === 'delete') && payload && r.cacher.has(payload.col)) continue;
      if (event === 'change' && payload && payload.col) { res.write(`event: change\ndata: ${JSON.stringify({ ...payload, record: Acces.filtrer(r, payload.col, payload.record) })}\n\n`); continue; }
      res.write(msg); continue;
    }
    // Compagnon : chaque modification est filtrée ; un réglage modifié recharge ses données filtrées
    if (event === 'settings') { res.write(`event: reload\ndata: ${JSON.stringify({ client: null })}\n\n`); continue; }
    if (event !== 'change' || !payload || !payload.col) { res.write(msg); continue; }
    regles = regles || reglesCompagnon();
    if (!ctx || ctx.userId !== acc.user_id) ctx = Compagnon.contexte(acc.user_id, recordsDe('users'), recordsDe('affaires'));
    const rec = Acces.filtrer(r, payload.col, Compagnon.filtrer(payload.col, payload.record, regles, ctx));
    res.write(rec ? `event: change\ndata: ${JSON.stringify({ ...payload, record: rec })}\n\n`
      : `event: delete\ndata: ${JSON.stringify({ col: payload.col, id: payload.record && payload.record.id, client: payload.client })}\n\n`);
  }
  // Webhooks sortants (automatisations) : chaque création / modification / suppression
  try { API.emettre(DB, db, event, payload); } catch (e) { console.error('Webhook :', e.message); }
}
setInterval(() => { for (const res of clients.keys()) res.write(': ping\n\n'); }, 25000).unref();
const NOTIFS = Notifs.creer({ DB, db, broadcast });
// Répertoire des documents sur le serveur, synchronisé avec les documents des chantiers
const DOSSIER = DossierDocuments.creer({ DB, db, broadcast, uid, TYPES: TYPES_DOCUMENTS, MAX: MAX_DOCUMENT, dossierDefaut: path.join(path.dirname(DB_FILE), 'Documents'),
  notifier: (avant, apres) => NOTIFS.documentsModifies({ login: 'Répertoire serveur', nom: 'Répertoire serveur' }, avant, apres) });

// Planning dans les agendas (Outlook via Microsoft 365, lien d'abonnement iCal)
const AGENDA = AgendaSync.creer({ DB, db, M365 });

/* ---------- Utilitaires HTTP ---------- */
function send(res, status, body, headers = {}) {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}
const fail = (res, status, message, extra = {}) => send(res, status, { error: message, ...extra });

// Corps brut (dépôt de factures électroniques par la plateforme)
function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > max) { reject(Object.assign(new Error('Fichier trop volumineux'), { status: 413 })); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

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
const isHttps = HS.estHttps;
function sessionCookie(req, token, maxAge) {
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
}

// Jeton de session : seule son empreinte est enregistrée (une copie de la base ne permet pas de reprendre une session)
const empreinte = t => crypto.createHash('sha256').update(String(t)).digest('hex');
function ouvrirSession(req, accountId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, account_id, expires) VALUES (?, ?, ?)').run(empreinte(token), accountId, Date.now() + SESSION_DAYS * 86400000);
  return sessionCookie(req, token, SESSION_DAYS * 86400);
}
function currentAccount(req) {
  const token = cookies(req).sid;
  // Clé d'API (automatisations) : les droits sont ceux du compte propriétaire de la clé
  if (!token) { const a = API.compteDeCle(db, req.headers.authorization); return a ? { ...a, token: null, cleApi: true } : null; }
  const h = empreinte(token);
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(h);
  if (!s || s.expires < Date.now()) return null;
  const a = db.prepare('SELECT id, login, nom, role, user_id, email FROM accounts WHERE id = ?').get(s.account_id);
  return a ? { ...a, token: h } : null;
}
// Mot de passe : 10 caractères au moins, ni l'identifiant, ni un mot de passe courant
const COURANTS = new Set(['123456789', '1234567890', '12345678910', 'azertyuiop', 'qwertyuiop', 'motdepasse', 'password', 'password1', 'password123', 'administrateur', 'administrator',
  'azerty1234', 'azerty12345', 'soleil1234', 'bonjour123', '0123456789', '1111111111', 'aaaaaaaaaa', 'pipefit123', 'pipe-fit123', 'tecnitub123', 'changeme123', 'motdepasse123']);
function motDePasseRefuse(pw, login) {
  const x = String(pw || '');
  if (x.length < 10) return 'Mot de passe : 10 caractères au moins';
  if (x.length > 200) return 'Mot de passe trop long';
  const n = x.toLowerCase();
  if (COURANTS.has(n) || /^(.)\1+$/.test(x)) return 'Mot de passe trop courant : choisissez-en un autre (une phrase courte, par exemple)';
  if (login && n.includes(String(login).toLowerCase()) && String(login).length >= 3) return 'Le mot de passe ne doit pas contenir l\'identifiant';
  return null;
}
// Identifiants : lettres, chiffres, « _ », « - », « . » (ceux de l'appli et des imports) ; tout autre caractère
// (guillemet, apostrophe, chevron…) est refusé, aussi dans les références (clientId, photoId…) et les sous-éléments
const ID = /^[A-Za-z0-9_.-]{1,64}$/;
function referenceInvalide(o, prof = 0) {
  if (!o || typeof o !== 'object' || prof > 8) return null;
  if (Array.isArray(o)) { for (const x of o) { const e = referenceInvalide(x, prof + 1); if (e) return e; } return null; }
  for (const [k, v] of Object.entries(o)) {
    if ((k === 'id' || /Id$/.test(k)) && typeof v === 'string' && v !== '' && !ID.test(v)) return k;
    if (/Ids$/.test(k) && Array.isArray(v) && v.some(x => typeof x === 'string' && x !== '' && !ID.test(x))) return k;
    if (v && typeof v === 'object') { const e = referenceInvalide(v, prof + 1); if (e) return e; }
  }
  return null;
}
const publicAccount = a => ({ id: a.id, login: a.login, nom: a.nom, role: a.role, userId: a.user_id, email: a.email || '' });
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const m365Pret = () => { const c = DB.getConfig(db, 'm365'); return !!(c && c.actif && c.tenantId && c.clientId && c.clientSecret); };
const MAIL_COLS = ['devis', 'factures', 'situations', 'commandes', 'affaires', 'rapports', 'receptions', 'consultations', 'epreuves', 'misesEnService', 'equilibrages'];
const labelOf = o => o.numero || o.code || o.ref || o.nom || o.designation || o.tache || '';

// Limitation des tentatives de connexion : 10 échecs / 15 min par adresse IP, 20 par identifiant (attaque répartie)
const failures = new Map();
const LIMITES = { ip: 10, login: 20 };
function tooManyFailures(cle, type = 'ip') {
  const f = failures.get(cle);
  if (!f) return false;
  if (Date.now() - f.first > 15 * 60 * 1000) { failures.delete(cle); return false; }
  return f.count >= LIMITES[type];
}
function recordFailure(cle) {
  const f = failures.get(cle) || { count: 0, first: Date.now() };
  f.count++; failures.set(cle, f);
  if (failures.size > 10000) for (const [k, v] of failures) if (Date.now() - v.first > 15 * 60 * 1000) failures.delete(k);
}
// Empreinte factice : un identifiant inconnu prend le même temps qu'un mauvais mot de passe (pas de devinette des comptes)
const FACTICE = DB.hashPassword(crypto.randomBytes(16).toString('hex'));

/* ---------- API ---------- */
async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = req.method;

  // Protection CSRF : les écritures doivent être en JSON (impossible via un formulaire d'un autre site).
  // Adresse de dépôt de la plateforme de facturation électronique : authentifiée par jeton (pas de session),
  // corps brut (XML ou PDF Factur-X) ou JSON { nom, base64 }
  if (p[0] === 'efacture' && p[1] === 'depot' && method === 'POST') {
    const c = EF.config(DB, db);
    if (!c.webhook || !EF.jetonValide(c, String(p[2] || ''))) return fail(res, 404, 'Adresse de dépôt inconnue');
    const brut = await readRaw(req, EF.MAX_FICHIER * 1.4);
    let buf = brut, nom = String(req.headers['x-filename'] || 'depot-plateforme');
    if ((req.headers['content-type'] || '').startsWith('application/json')) {
      try { const j = JSON.parse(brut.toString('utf8')); buf = Buffer.from(String(j.base64 || ''), 'base64'); nom = String(j.nom || nom); } catch (e) { return fail(res, 400, 'JSON invalide'); }
    }
    try { const r = await EF.recevoir(DB, db, buf, nom, 'plateforme', broadcast); return send(res, 200, { ok: true, id: r.record.id, doublon: !!r.doublon }); }
    catch (e) { return fail(res, 422, e.message); }
  }

  // Écriture depuis la page d'un autre site : refusée
  if (HS.origineRefusee(req)) return fail(res, 403, 'Origine de la requête refusée');

  // Exception : envoi d'un document de chantier en fichier brut, avec l'en-tête X-PipeFit-Upload qu'un formulaire d'un autre site ne peut pas poser
  const envoiDocument = p[0] === 'documents' && p[1] === 'fichier' && method === 'POST' && req.headers['x-pipefit-upload'] === '1';
  if (method !== 'GET' && !envoiDocument && !(req.headers['content-type'] || '').startsWith('application/json')) {
    return fail(res, 415, 'Content-Type application/json requis');
  }

  // Première configuration : création du compte administrateur, uniquement depuis le serveur lui-même.
  if (p[0] === 'setup') {
    if (method === 'GET') return send(res, 200, { needed: !hasAccounts(), local: isLocal(req) });
    if (method === 'POST') {
      if (!isLocal(req)) return fail(res, 403, 'La première configuration doit être faite sur le serveur (http://localhost)');
      const { login, nom, password, demo } = await readBody(req);
      if (!login) return fail(res, 400, 'Identifiant requis');
      const faible = motDePasseRefuse(password, login);
      if (faible) return fail(res, 400, faible);
      const id = DB.tx(db, () => (hasAccounts() ? null : createAccount(String(login), nom, 'admin', null, String(password))));
      if (!id) return fail(res, 409, 'Le compte administrateur existe déjà');
      if (!demo) {
        const d = demoData();
        DB.replaceAll(db, { settings: d.settings, zones: d.zones }, 'système');
      }
      DB.audit(db, String(login), 'première configuration', null, null, demo ? 'avec démo' : 'base vide');
      return send(res, 200, { ok: true }, { 'Set-Cookie': ouvrirSession(req, id) });
    }
  }

  if (p[0] === 'login' && method === 'POST') {
    const ip = HS.ipClient(req);
    const { login, password } = await readBody(req);
    const cleLogin = `login:${String(login || '').toLowerCase().slice(0, 100)}`;
    if (tooManyFailures(ip) || tooManyFailures(cleLogin, 'login')) return fail(res, 429, 'Trop de tentatives, réessayez dans 15 minutes.');
    const a = db.prepare('SELECT * FROM accounts WHERE login = ?').get(String(login || '').slice(0, 100));
    const ok = DB.checkPassword(String(password || '').slice(0, 200), a ? a.pass : FACTICE);
    if (!a || !ok) {
      recordFailure(ip); recordFailure(cleLogin);
      DB.audit(db, String(login || '').slice(0, 100), 'échec de connexion', null, null, ip);
      return fail(res, 401, 'Identifiant ou mot de passe incorrect');
    }
    failures.delete(ip); failures.delete(cleLogin);
    DB.audit(db, a.login, 'connexion', null, null, ip);
    return send(res, 200, publicAccount(a), { 'Set-Cookie': ouvrirSession(req, a.id) });
  }

  // Description OpenAPI (création d'un connecteur Power Automate / Make…)
  if (p[0] === 'openapi.json' && method === 'GET') return send(res, 200, API.openapi(DB, `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`));

  // Lien d'abonnement iCal : authentifié par son jeton secret (les applications d'agenda n'ont pas de session)
  if (p[0] === 'agenda' && /^[A-Za-z0-9_-]+\.ics$/.test(p[1] || '') && method === 'GET') {
    const c = AGENDA.calendrier(p[1].slice(0, -4));
    if (!c) return fail(res, 404, 'Lien d\'agenda inconnu ou révoqué');
    res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=900', 'Content-Disposition': 'inline; filename="planning.ics"' });
    return res.end(c.ics);
  }

  const acc = currentAccount(req);
  if (!acc) return fail(res, 401, 'Non connecté');

  // Mon lien d'agenda (iCal) et, pour l'administrateur, le planning dans Outlook
  if (p[0] === 'agenda' && p[1] === 'lien') {
    if (acc.cleApi) return fail(res, 403, 'Indisponible avec une clé d\'API');
    const base = `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`;
    if (method === 'GET') return send(res, 200, { actif: AGENDA.aUnLien(acc.id), relie: !!acc.user_id });
    if (method === 'POST') { const j = AGENDA.nouveauLien(acc.id); DB.audit(db, acc.login, 'lien d\'agenda créé'); return send(res, 200, { url: `${base}/api/agenda/${j}.ics`, webcal: `${base.replace(/^https?/, 'webcal')}/api/agenda/${j}.ics` }); }
    if (method === 'DELETE') { AGENDA.revoquer(acc.id); DB.audit(db, acc.login, 'lien d\'agenda révoqué'); return send(res, 200, { ok: true }); }
  }
  if (p[0] === 'agenda' && p[1] === 'outlook') {
    if (acc.role !== 'admin') return fail(res, 403, 'Réservé à l\'administrateur');
    if (p[2] === 'synchro' && method === 'POST') return send(res, 200, { ...(await AGENDA.synchroniser()), config: AGENDA.config(), m365: m365Pret() });
    if (method === 'PUT') {
      const b = await readBody(req), cfg = DB.getConfig(db, 'm365') || {};
      cfg.agenda = { actif: !!b.actif, categorie: String(b.categorie ?? 'Pipe-Fit').slice(0, 60), rappel: Math.max(0, Math.min(1440, parseInt(b.rappel, 10) || 0)) };
      DB.setConfig(db, 'm365', cfg);
      DB.audit(db, acc.login, 'configuration du planning dans Outlook', null, null, cfg.agenda.actif ? 'actif' : 'arrêté');
      AGENDA.synchroniser().catch(() => {});
    }
    return send(res, 200, { config: AGENDA.config(), m365: m365Pret(), ...AGENDA.etat() });
  }

  if (p[0] === 'logout' && method === 'POST') {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(acc.token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }
  if (p[0] === 'me' && !p[1] && method === 'GET') return send(res, 200, { ...publicAccount(acc), m365: m365Pret() });
  if (p[0] === 'me' && p[1] === 'password' && method === 'POST') {
    const { current, next } = await readBody(req);
    const a = db.prepare('SELECT pass FROM accounts WHERE id = ?').get(acc.id);
    if (!DB.checkPassword(String(current || ''), a.pass)) return fail(res, 400, 'Mot de passe actuel incorrect');
    const faible = motDePasseRefuse(next, acc.login);
    if (faible) return fail(res, 400, faible);
    db.prepare('UPDATE accounts SET pass = ? WHERE id = ?').run(DB.hashPassword(next), acc.id);
    db.prepare('DELETE FROM sessions WHERE account_id = ? AND token <> ?').run(acc.id, acc.token);
    DB.audit(db, acc.login, 'changement de mot de passe');
    return send(res, 200, { ok: true });
  }
  // Mes appareils connectés : nombre, et déconnexion de tous les autres (téléphone perdu…)
  if (p[0] === 'me' && p[1] === 'sessions') {
    if (method === 'GET') return send(res, 200, { autres: db.prepare('SELECT COUNT(*) n FROM sessions WHERE account_id = ? AND token <> ? AND expires > ?').get(acc.id, acc.token || '', Date.now()).n });
    if (method === 'DELETE') {
      const n = db.prepare('DELETE FROM sessions WHERE account_id = ? AND token <> ?').run(acc.id, acc.token || '').changes;
      DB.audit(db, acc.login, 'déconnexion des autres appareils', null, null, String(n));
      return send(res, 200, { deconnectes: n });
    }
  }

  if (p[0] === 'events' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    clients.set(res, acc);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (p[0] === 'data' && method === 'GET') return send(res, 200, Acces.filtrerTout(restrictionsDe(acc), estCompagnon(acc) ? Compagnon.filtrerTout(DB.allData(db), reglesCompagnon(), contexteCompagnon(acc)) : DB.allData(db)));

  // Lecture par l'API : liste filtrée d'une collection, ou un élément
  if (p[0] === 'records' && p[1] && method === 'GET') {
    if (!DB.COLLECTIONS.includes(p[1])) return fail(res, 404, 'Collection inconnue');
    if (restrictionsDe(acc).cacher.has(p[1])) return fail(res, 403, REFUS_ACCES);
    if (p[2]) { const r = pourCompagnon(acc, p[1], DB.getRecord(db, p[1], p[2])); return r ? send(res, 200, r) : fail(res, 404, 'Élément introuvable'); }
    const depuis = url.searchParams.get('modifieDepuis') || '';
    const filtres = String(url.searchParams.get('filtre') || '').split(',').map(x => x.split(':')).filter(x => x[0] && x.length > 1).map(([k, ...v]) => [k, v.join(':')]);
    const limite = Math.min(5000, parseInt(url.searchParams.get('limite'), 10) || 5000);
    const rows = db.prepare(`SELECT id FROM records WHERE col = ?${depuis ? ' AND updated_at > ?' : ''} ORDER BY updated_at DESC`).all(...[p[1], ...(depuis ? [depuis] : [])]);
    const out = [];
    for (const r of rows) {
      const rec = pourCompagnon(acc, p[1], DB.getRecord(db, p[1], r.id));
      if (rec && filtres.every(([k, v]) => String(rec[k] ?? '') === v)) out.push(rec);
      if (out.length >= limite) break;
    }
    return send(res, 200, out);
  }

  // Clés d'API personnelles
  if (p[0] === 'cles') {
    if (method === 'GET') return send(res, 200, API.listerCles(db, acc.role === 'admin' ? null : acc.id));
    if (method === 'POST') {
      if (acc.cleApi) return fail(res, 403, 'Une clé d\'API ne peut pas créer d\'autres clés');
      const b = await readBody(req);
      const r = API.creerCle(db, acc.id, b.nom);
      DB.audit(db, acc.login, 'création clé API', null, r.id, String(b.nom || ''));
      return send(res, 200, r);
    }
    if (method === 'DELETE' && p[1]) {
      const k = db.prepare('SELECT account_id FROM api_keys WHERE id = ?').get(p[1]);
      if (!k || (k.account_id !== acc.id && acc.role !== 'admin')) return fail(res, 404, 'Clé introuvable');
      db.prepare('DELETE FROM api_keys WHERE id = ?').run(p[1]);
      DB.audit(db, acc.login, 'révocation clé API', null, p[1]);
      return send(res, 200, { ok: true });
    }
  }

  // Justificatifs (photos de notes de frais) : envoyés en data URL, servis en binaire
  if (p[0] === 'files' && method === 'POST' && !p[1]) {
    const { dataUrl, id: choisi } = await readBody(req);
    const m = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) return fail(res, 400, 'Fichier invalide (JPEG, PNG, WebP ou PDF attendu)');
    const buf = Buffer.from(m[2], 'base64');
    // Photo prise hors connexion : identifiant choisi par le téléphone (24 caractères hexadécimaux) ; renvoi identique accepté
    if (choisi !== undefined) {
      if (!/^[a-f0-9]{24}$/.test(String(choisi))) return fail(res, 400, 'Identifiant de fichier invalide');
      const ex = db.prepare('SELECT data, created_by FROM files WHERE id = ?').get(choisi);
      if (ex) return Buffer.from(ex.data).equals(buf) && ex.created_by === acc.login ? send(res, 200, { id: choisi }) : fail(res, 409, 'Identifiant de fichier déjà utilisé');
    }
    const id = choisi || crypto.randomBytes(12).toString('hex');
    db.prepare('INSERT INTO files (id, mime, data, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(id, m[1], buf, acc.login, new Date().toISOString());
    return send(res, 200, { id });
  }
  if (p[0] === 'files' && method === 'GET' && p[1]) {
    const f = db.prepare('SELECT mime, data FROM files WHERE id = ?').get(p[1]);
    if (!f) return fail(res, 404, 'Fichier introuvable');
    // PDF et images affichés ; tout le reste (XML, DWG, Excel…) téléchargé, jamais interprété par le navigateur
    const affiche = /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.mime);
    const nom = String(url.searchParams.get('nom') || (/xml/.test(f.mime) ? 'facture.xml' : 'document')).replace(/[^\w .()-]+/g, '_').slice(0, 120) || 'document';
    res.writeHead(200, { 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff',
      ...(affiche ? (url.searchParams.get('nom') ? { 'Content-Disposition': `inline; filename="${nom}"` } : {}) : { 'Content-Disposition': `attachment; filename="${nom}"`, 'Content-Security-Policy': 'sandbox' }) });
    return res.end(Buffer.from(f.data));
  }

  // Répertoire des documents sur le serveur : réglage (administrateur), état et synchronisation immédiate (bureau)
  if (p[0] === 'documents' && p[1] === 'dossier') {
    if (!['admin', 'charge'].includes(acc.role)) return fail(res, 403, 'Droits insuffisants');
    if (p[2] === 'synchro' && method === 'POST') return send(res, 200, { ...(await DOSSIER.synchroniser()), config: DOSSIER.config() });
    if (method === 'PUT') {
      if (acc.role !== 'admin') return fail(res, 403, 'Réservé à l\'administrateur');
      const b = await readBody(req);
      if (b.chemin && !path.isAbsolute(String(b.chemin).trim())) return fail(res, 400, 'Indiquez un chemin complet (ex. D:\\PipeFit\\Documents ou /srv/pipefit/documents)');
      const c = DOSSIER.enregistrerConfig(b);
      DB.audit(db, acc.login, 'configuration du répertoire des documents', null, null, c.chemin);
      DOSSIER.synchroniser().catch(() => {});
      return send(res, 200, { config: c, ...DOSSIER.etat() });
    }
    return send(res, 200, { config: DOSSIER.config(), ...DOSSIER.etat(), sep: path.sep });
  }

  // Documents de chantier (plans, fiches techniques, notices…) : fichier brut jusqu'à 40 Mo
  if (envoiDocument) {
    if (!canWrite(acc, 'affaires')) return fail(res, 403, 'Droits insuffisants');
    const nom = (() => { try { return decodeURIComponent(String(req.headers['x-filename'] || '')); } catch (e) { return ''; } })();
    const ext = (/\.([a-z0-9]+)$/i.exec(nom) || [])[1];
    const mime = TYPES_DOCUMENTS[String(ext || '').toLowerCase()];
    if (!mime) return fail(res, 415, `Type de fichier non accepté (${Object.keys(TYPES_DOCUMENTS).join(', ')})`);
    const buf = await readRaw(req, MAX_DOCUMENT);
    if (!buf.length) return fail(res, 400, 'Fichier vide');
    const magie = { 'application/pdf': [0x25, 0x50, 0x44, 0x46], 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff] }[mime];
    if (magie && !magie.every((b, i) => buf[i] === b)) return fail(res, 415, 'Le contenu du fichier ne correspond pas à son extension');
    const id = crypto.randomBytes(12).toString('hex');
    db.prepare('INSERT INTO files (id, mime, data, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(id, mime, buf, acc.login, new Date().toISOString());
    return send(res, 200, { id, mime, taille: buf.length });
  }

  // Import groupé (bibliothèque, entreprises, contacts depuis Excel) : une seule transaction
  if (p[0] === 'bulk' && p[1] && method === 'POST') {
    const col = p[1];
    if (!['articles', 'mainoeuvre', 'entreprises', 'contacts'].includes(col)) return fail(res, 400, 'Import non disponible pour cette liste');
    if (!canWrite(acc, col)) return fail(res, 403, 'Droits insuffisants');
    const { items } = await readBody(req);
    if (!Array.isArray(items) || items.length > 20000) return fail(res, 400, 'Liste invalide');
    const inv = items.map(it => referenceInvalide(it)).find(Boolean);
    if (inv) return fail(res, 400, `Identifiant invalide (${inv})`);
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

  // Notifications sur les téléphones : clé publique VAPID, abonnement de l'appareil, essai
  if (p[0] === 'push') {
    if (p[1] === 'cle' && method === 'GET') return send(res, 200, { publicKey: Push.vapid(DB, db).publicKey, appareils: Push.abonnementsDe(db, [acc.id]).map(x => ({ appareil: x.appareil, depuis: x.created_at, dernier: x.last_ok })) });
    if (p[1] === 'abonnement' && method === 'POST') { const b = await readBody(req); Push.abonner(db, acc.id, b.subscription, b.appareil); return send(res, 200, { ok: true }); }
    if (p[1] === 'abonnement' && method === 'DELETE') { const b = await readBody(req); Push.desabonner(db, acc.id, b.endpoint); return send(res, 200, { ok: true }); }
    if (p[1] === 'test' && method === 'POST') {
      const r = await Push.envoyer(DB, db, [acc.id], { titre: 'Pipe-Fit', texte: 'Les notifications fonctionnent sur ce téléphone.', lien: '#/notifications', tag: 'test' });
      return send(res, 200, { envois: r });
    }
    return fail(res, 404, 'Route inconnue');
  }

  if (p[0] === 'records' && p[1] && p[2]) {
    const [, col, id] = p;
    if (!DB.COLLECTIONS.includes(col)) return fail(res, 404, 'Collection inconnue');
    if (!ID.test(id)) return fail(res, 400, 'Identifiant invalide');
    if (['PUT', 'DELETE'].includes(method) && Acces.ecritureRefusee(restrictionsDe(acc), col)) return fail(res, 403, REFUS_ACCES);

    if (method === 'PUT') {
      const { data, version } = await readBody(req);
      // Un compagnon peut seulement ouvrir une intervention hors devis (règle appliquée plus bas) ;
      // un chargé d'affaires crée et modifie les fiches des intérimaires (pas celles des salariés)
      const fiche = col === 'users' && DB.getRecord(db, 'users', id);
      const interimaire = acc.role === 'charge' && col === 'users' && data && data.type === 'interimaire' && (!fiche || fiche.type === 'interimaire');
      if (!canWrite(acc, col) && !(estCompagnon(acc) && col === 'affaires') && !interimaire) return fail(res, 403, 'Droits insuffisants');
      if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(res, 400, 'Données manquantes');
      const inv = referenceInvalide(data);
      if (inv) return fail(res, 400, `Identifiant invalide (${inv})`);
      const result = DB.tx(db, () => {
        const existing = DB.getRecord(db, col, id);
        if (existing && version !== existing._v) return { conflict: existing };
        let obj = { ...DB.clean(data), id };
        // Une facture émise n'est plus modifiable, sauf son paiement et son suivi (relances, notes d'appel) (admin excepté).
        if (col === 'factures' && existing && acc.role !== 'admin') obj = { ...DB.clean(existing), statut: obj.statut, exportCompta: obj.exportCompta, datePaiement: obj.datePaiement, relances: obj.relances };
        if (col === 'factures') obj.type = existing ? existing.type : (obj.type === 'avoir' ? 'avoir' : undefined);
        // Bon d'intervention signé par le client : figé (sauf administrateur)
        if (col === 'rapports' && existing && existing.signatureClientId && acc.role !== 'admin') return { forbidden: 'Ce bon d\'intervention est signé par le client : il ne peut plus être modifié.' };
        // Enlèvement au comptoir déclaré par un compagnon : modifiable tant que le relevé du fournisseur ne l'a pas rapproché
        if (col === 'enlevements' && estCompagnon(acc)) {
          if (existing && existing.statut !== 'Déclaré') return { forbidden: 'Cet enlèvement est déjà rapproché du relevé du fournisseur : voyez le bureau.' };
          obj.statut = 'Déclaré'; delete obj.achatId;
        }
        // Fiche d'intervention fluides signée : figée (registre réglementaire), sauf administrateur
        if (col === 'fichesFluides' && existing && existing.statut === 'Signée' && acc.role !== 'admin') return { forbidden: 'Cette fiche d\'intervention est signée : elle ne peut plus être modifiée.' };
        // PV d'épreuve signé : figé, sauf administrateur ; complet pour être signé
        if (col === 'epreuves' && existing && existing.statut === 'Signé' && acc.role !== 'admin') return { forbidden: 'Ce PV d\'épreuve est signé : il ne peut plus être modifié.' };
        if (col === 'epreuves' && obj.statut === 'Signé') { const m = Epreuve.manques(obj); if (m.length) return { invalide: `PV d'épreuve incomplet : ${m.join(', ')}` }; }
        // PV de mise en service et relevé d'équilibrage signés : figés, sauf administrateur ; complets pour être signés
        if (['misesEnService', 'equilibrages'].includes(col) && existing && existing.statut === 'Signé' && acc.role !== 'admin') return { forbidden: 'Ce procès-verbal est signé : il ne peut plus être modifié.' };
        if (['misesEnService', 'equilibrages'].includes(col) && obj.statut === 'Signé') { const m = col === 'misesEnService' ? Essais.manquesMES(obj) : Essais.manquesEQ(obj); if (m.length) return { invalide: `Procès-verbal incomplet : ${m.join(', ')}` }; }
        // PV de réception signé : figé
        if (col === 'receptions' && existing && existing.statut === 'Signé' && acc.role !== 'admin') return { forbidden: 'Ce procès-verbal est signé : il ne peut plus être modifié.' };
        // Réserve figée par le PV : seule sa levée peut être renseignée
        if (col === 'reserves' && existing && existing.pvId && acc.role !== 'admin') {
          obj = { ...DB.clean(existing), statut: obj.statut, dateLevee: obj.dateLevee, photoLeveeId: obj.photoLeveeId, commentaireLevee: obj.commentaireLevee, pvLeveeId: obj.pvLeveeId };
        }
        if (col === 'affaires' && estCompagnon(acc)) {
          const hd = ReglesPointage.horsDevisCompagnon(obj, existing, acc.user_id, ReglesPointage.jourIso(new Date()));
          if (hd.refus) return { forbidden: hd.refus };
          obj = hd.obj;
        }
        const refus = col === 'affaires' ? null : atelierRefus(acc, col, obj, existing);
        if (refus) return { forbidden: refus };
        // Fiche d'intervention fluides envoyée ou signée : rubriques réglementaires complètes
        if (col === 'fichesFluides' && obj.statut !== 'Brouillon') { const e = Fluides.erreur(obj, obj.equipementId && DB.getRecord(db, 'equipementsFrigo', obj.equipementId)); if (e) return { invalide: e }; }
        // Note de frais envoyée : restaurant -> noms des personnes présentes obligatoires
        if (col === 'frais' && obj.statut === 'Soumise' && NoteFrais.erreur(obj)) return { invalide: NoteFrais.erreur(obj) };
        // Matériel saisi par un compagnon (qui ne voit pas forcément les prix) : prix de la bibliothèque, ou ceux déjà fixés par le bureau
        if (col === 'consommations' && estCompagnon(acc)) {
          const art = obj.articleId && DB.getRecord(db, 'articles', obj.articleId);
          if (art) Object.assign(obj, { pu: Number(art.prixVente) || 0, cout: Number(art.coutRevient) || 0 });
          else if (!reglesCompagnon().prix || existing) Object.assign(obj, { pu: existing ? existing.pu || 0 : 0, cout: existing ? existing.cout || 0 : 0 });
        }
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
        return { record: DB.getRecord(db, col, id), avant: existing };
      });
      if (result.forbidden) return fail(res, 403, result.forbidden);
      if (result.invalide) return fail(res, 400, result.invalide);
      if (result.conflict) {
        return fail(res, 409, `Modifié entre-temps par ${result.conflict._by || 'un autre utilisateur'}`, { record: pourCompagnon(acc, col, result.conflict) });
      }
      broadcast('change', { col, record: result.record, client: req.headers['x-client-id'] || null });
      if (col === 'planning') { NOTIFS.planningModifie(acc, result.avant, result.record); AGENDA.signaler(); }
      if (col === 'affaires') { NOTIFS.documentsModifies(acc, result.avant, result.record); DOSSIER.signaler(); }
      if (col === 'affaires' && estCompagnon(acc) && !result.avant) NOTIFS.horsDevisOuvert(acc, result.record);
      return send(res, 200, pourCompagnon(acc, col, result.record) || { id: result.record.id, _v: result.record._v });
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
      if (col === 'planning') { NOTIFS.planningModifie(acc, existing, null); AGENDA.signaler(); }
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
    if (ref && restrictionsDe(acc).cacher.has(ref.col)) return fail(res, 403, REFUS_ACCES);
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

  // Facturation électronique (bureaux) : état, import manuel, relève du dossier, dépôt d'une facture émise
  if (p[0] === 'efacture' && ['etat', 'import', 'emettre', 'scruter', 'mail', 'prevenir'].includes(p[1])) {
    if (!['admin', 'charge'].includes(acc.role)) return fail(res, 403, 'Droits insuffisants');
    // Dépôt de nos factures : écran Facturation ; réception : écran Factures reçues
    const rEf = restrictionsDe(acc);
    if (p[1] === 'emettre' ? rEf.cacher.has('factures') : p[1] !== 'etat' && rEf.cacher.has('efactures')) return fail(res, 403, REFUS_ACCES);
    const c = EF.config(DB, db), mc = MAILF.config(DB, db);
    if (p[1] === 'etat' && method === 'GET') return send(res, 200, { plateforme: c.plateforme || '', entree: !!c.dossierEntree, sortie: !!c.dossierSortie, webhook: !!c.webhook,
      mail: { actif: mc.actif && !!mc.adresse, adresse: mc.adresse, m365: m365Pret(), dernier: MAILF.etat.dernier, erreur: MAILF.etat.erreur, resultat: MAILF.etat.resultat } });
    // Relève immédiate de la boîte des factures
    if (p[1] === 'mail' && method === 'POST') {
      if (!mc.actif || !mc.adresse) return fail(res, 400, 'Aucune boîte aux lettres de factures n\'est configurée.');
      try { return send(res, 200, await MAILF.relever(DB, db, broadcast)); } catch (e) { return fail(res, 502, e.message); }
    }
    // Refus d'une facture reçue par e-mail : le fournisseur est prévenu à l'adresse qui l'a envoyée
    if (p[1] === 'prevenir' && method === 'POST') {
      const b = await readBody(req), x = DB.getRecord(db, 'efactures', String(b.id || ''));
      if (!x) return fail(res, 404, 'Facture introuvable');
      const motif = String(b.motif || '').trim().slice(0, 500);
      if (!motif) return fail(res, 400, 'Motif du refus requis');
      try { await MAILF.prevenirRefus(DB, db, x, motif, (DB.getSettings(db) || {}).societe || ''); } catch (e) { return fail(res, 502, e.message); }
      DB.audit(db, acc.login, 'refus de facture envoyé au fournisseur', 'efactures', x.id, `${x.mail.deEmail} : ${motif}`);
      return send(res, 200, { ok: true, a: x.mail.deEmail });
    }
    if (p[1] === 'import' && method === 'POST') {
      const b = await readBody(req);
      try { const r = await EF.recevoir(DB, db, Buffer.from(String(b.base64 || ''), 'base64'), String(b.nom || 'import'), acc.login, broadcast); return send(res, 200, { ...r.record, doublon: !!r.doublon }); }
      catch (e) { return fail(res, 422, e.message); }
    }
    if (p[1] === 'scruter' && method === 'POST') {
      try { return send(res, 200, await EF.scruterDossier(DB, db, broadcast)); } catch (e) { return fail(res, 500, e.message); }
    }
    if (p[1] === 'emettre' && method === 'POST') {
      const b = await readBody(req);
      if (!/^<\?xml|^<rsm:CrossIndustryInvoice/.test(String(b.xml || '').trim())) return fail(res, 400, 'XML de facture attendu');
      try { const r = EF.deposer(DB, db, b.nom, b.xml, b.pdfBase64 && /^[A-Za-z0-9+/=]+$/.test(b.pdfBase64) ? b.pdfBase64 : ''); DB.audit(db, acc.login, 'dépôt facture électronique', 'factures', null, b.nom); return send(res, 200, r); }
      catch (e) { return fail(res, 400, e.message); }
    }
  }

  // Dérive des chantiers : contrôle immédiat (bureau)
  if (p[0] === 'derives' && p[1] === 'verifier' && method === 'POST') {
    if (!['admin', 'charge'].includes(acc.role)) return fail(res, 403, 'Droits insuffisants');
    return send(res, 200, { alertes: await NOTIFS.derives() });
  }

  /* --- Administration --- */
  if (acc.role !== 'admin') return fail(res, 403, 'Réservé aux administrateurs');

  // Webhooks sortants (automatisations)
  if (p[0] === 'webhooks') {
    if (method === 'GET' && !p[1]) return send(res, 200, API.webhooks(DB, db));
    if (method === 'PUT' && !p[1]) {
      const b = await readBody(req);
      const anciens = API.webhooks(DB, db);
      const liste = (Array.isArray(b.liste) ? b.liste : []).slice(0, 20).map(w => {
        const ex = anciens.find(x => x.id === w.id) || {};
        return { id: String(w.id || crypto.randomBytes(6).toString('hex')), nom: String(w.nom || '').slice(0, 80), url: String(w.url || '').trim().slice(0, 500), actif: !!w.actif,
          collections: (Array.isArray(w.collections) ? w.collections : ['*']).filter(c => c === '*' || DB.COLLECTIONS.includes(c)), secret: ex.secret || crypto.randomBytes(20).toString('hex'), dernier: ex.dernier };
      });
      if (liste.some(w => !/^https?:\/\/[^\s]+$/i.test(w.url))) return fail(res, 400, 'Adresse de webhook invalide (http:// ou https:// attendu)');
      DB.setConfig(db, 'webhooks', liste);
      DB.audit(db, acc.login, 'configuration webhooks');
      return send(res, 200, liste);
    }
    if (method === 'POST' && p[2] === 'test') {
      const w = API.webhooks(DB, db).find(x => x.id === p[1]);
      if (!w) return fail(res, 404, 'Webhook introuvable');
      const statut = await API.envoyer(DB, db, w, JSON.stringify({ evenement: 'test', date: new Date().toISOString(), donnees: { message: 'Test depuis Pipe-Fit CRM' } }));
      return send(res, 200, { statut });
    }
  }

  // Configuration de la facturation électronique (plateforme, dossiers, adresse de dépôt)
  if (p[0] === 'efacture' && p[1] === 'config') {
    const c = EF.config(DB, db);
    if (method === 'PUT') {
      const b = await readBody(req), champ = v => String(v || '').trim().slice(0, 300);
      Object.assign(c, { plateforme: champ(b.plateforme), dossierEntree: champ(b.dossierEntree), dossierSortie: champ(b.dossierSortie), webhook: !!b.webhook });
      if (b.mail) {
        const adresse = String(b.mail.adresse || '').trim().toLowerCase().slice(0, 200);
        if (adresse && !EMAIL.test(adresse)) return fail(res, 400, 'Adresse de la boîte des factures invalide');
        if (b.mail.actif && !adresse) return fail(res, 400, 'Indiquez l\'adresse de la boîte des factures.');
        c.mail = { actif: !!b.mail.actif, adresse, dossier: champ(b.mail.dossier).replace(/[\\/]/g, '-').slice(0, 80) || 'Factures traitées' };
      }
      if (b.nouveauJeton || (c.webhook && !c.jeton)) c.jeton = crypto.randomBytes(24).toString('hex');
      DB.setConfig(db, 'efacture', c);
      DB.audit(db, acc.login, 'configuration facturation électronique');
    }
    return send(res, 200, { plateforme: c.plateforme || '', dossierEntree: c.dossierEntree || '', dossierSortie: c.dossierSortie || '', webhook: !!c.webhook, jeton: c.webhook ? c.jeton : '', mail: MAILF.config(DB, db), m365: m365Pret() });
  }

  // Numérotation des factures, avoirs et situations : état et reprise d'une numérotation existante
  if (p[0] === 'numerotation') {
    if (method === 'GET') return send(res, 200, DB.etatNumerotation(db));
    if (method === 'PUT') {
      const b = await readBody(req);
      const prochain = parseInt(b.prochain, 10);
      const cible = DB.NUMEROS_PARAMETRABLES[b.cle];
      if (!cible || !(prochain >= 1)) return fail(res, 400, 'Numéro invalide');
      const r = DB.tx(db, () => DB.fixerProchain(db, cible[0], cible[1], prochain));
      if (r.erreur) return fail(res, 400, r.erreur);
      DB.audit(db, acc.login, 'numérotation', cible[0], null, `${b.cle} : prochain n° ${prochain}`);
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
    if (body.password) { const target0 = p[1] && db.prepare('SELECT login FROM accounts WHERE id = ?').get(p[1]); const faible = motDePasseRefuse(body.password, body.login || (target0 && target0.login)); if (faible) return fail(res, 400, faible); }
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

  // État de la sécurité (Paramètres → Sécurité)
  if (p[0] === 'securite' && method === 'GET') {
    const jour = new Date(Date.now() - 86400000).toISOString();
    const echecs = db.prepare("SELECT login, label AS ip, at FROM audit WHERE action = 'échec de connexion' AND at > ? ORDER BY id DESC LIMIT 50").all(jour);
    return send(res, 200, {
      https: { requete: isHttps(req), natif: SERVEUR.etat.https, certificat: SERVEUR.etat.certificat, recharge: SERVEUR.etat.recharge, redirection: +process.env.HTTP_REDIRECT_PORT || null },
      proxy: { detecte: !!req.headers['x-forwarded-for'], confiance: HS.proxyDeConfiance(req), ip: HS.ipClient(req) },
      sessions: db.prepare('SELECT COUNT(*) n FROM sessions WHERE expires > ?').get(Date.now()).n, dureeSessionJours: SESSION_DAYS,
      cles: db.prepare('SELECT COUNT(*) n FROM api_keys').get().n, webhooksHttp: API.webhooks(DB, db).filter(w => w.actif && /^http:/i.test(w.url)).length,
      admins: db.prepare("SELECT COUNT(*) n FROM accounts WHERE role = 'admin'").get().n,
      echecs24h: echecs.length, derniersEchecs: echecs.slice(0, 10), m365: m365Pret(),
    });
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
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json; charset=utf-8' };
function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Introuvable'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

// HTTP, ou HTTPS si un certificat est fourni (voir server/http-securite.js) ; en-têtes de sécurité sur toutes les réponses
const SERVEUR = HS.creerServeur(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); return res.end(); }
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Erreur serveur');
    if (!e.status) console.error(e);
  }
}, { dossierDonnees: path.dirname(DB_FILE), nom: 'Pipe-Fit CRM' });
const server = SERVEUR.server;

if (require.main === module) {
  // Relève du dossier de réception des factures électroniques toutes les 2 minutes
  setInterval(() => EF.scruterDossier(DB, db, broadcast).catch(e => console.error('Facturation électronique :', e.message)), 120000).unref();
  setInterval(() => MAILF.relever(DB, db, broadcast).catch(e => console.error('Boîte des factures :', e.message)), 120000).unref();
  // Échéances des habilitations, visites médicales et contrôles du parc : peu après le démarrage, puis toutes les 6 heures
  const verifierEcheances = () => NOTIFS.echeances().catch(e => console.error('Échéances :', e.message));
  setTimeout(verifierEcheances, 30000).unref();
  setInterval(verifierEcheances, 6 * 3600000).unref();
  // Dérive des chantiers : contrôlée toutes les 2 heures (heures pointées, achats, factures)
  const verifierDerives = () => NOTIFS.derives().catch(e => console.error('Dérive des chantiers :', e.message));
  setTimeout(verifierDerives, 60000).unref();
  setInterval(verifierDerives, 2 * 3600000).unref();
  DOSSIER.demarrer();
  AGENDA.demarrer();
  // Sessions expirées effacées toutes les heures
  setInterval(() => db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()), 3600000).unref();
  SERVEUR.surveiller();
  const schema = SERVEUR.etat.https ? 'https' : 'http';
  if (SERVEUR.etat.https && process.env.HTTP_REDIRECT_PORT) SERVEUR.redirection(+process.env.HTTP_REDIRECT_PORT, HOST, PORT);
  server.listen(PORT, HOST, () => {
    console.log(`Pipe-Fit CRM : ${schema}://localhost:${PORT}  (base : ${DB_FILE})`);
    const c = SERVEUR.etat.certificat;
    if (c) console.log(`HTTPS : certificat ${c.sujet}, expire le ${c.expire.slice(0, 10)} (${c.joursRestants} j)${c.autoSigne ? ' — auto-signé : les téléphones le refuseront' : ''}`);
    else console.log('HTTPS non configuré : ajoutez un certificat (data/tls) ou placez le serveur derrière un reverse proxy HTTPS avant tout accès depuis l\'extérieur.');
    if (!hasAccounts()) console.log(`Première utilisation : ouvrez ${schema}://localhost:${PORT} sur ce poste pour créer le compte administrateur.`);
  });
}
module.exports = { server, db, NOTIFS, DOSSIER, AGENDA };
