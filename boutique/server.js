// Boutique en ligne TECNITUB : vente de tuyauterie inox préfabriquée (spools sur mesure, tubes coupés, raccords).
// Commandes professionnelles (paiement par virement ou sur compte client), demandes de devis sur plan, suivi de commande,
// administration des commandes. Les prix sont toujours recalculés ici à partir du catalogue (boutique/catalogue.js).
// Aucune dépendance externe : Node.js >= 22.13 (node:sqlite).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const HS = require('../server/http-securite');
const C = require('./catalogue');

const PORT = +process.env.BOUTIQUE_PORT || 3200;
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = process.env.BOUTIQUE_DB_FILE || path.join(__dirname, 'data', 'boutique.db');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PARTAGES = { '/catalogue.js': path.join(__dirname, 'catalogue.js'), '/logo-tecnitub.png': path.join(__dirname, '..', 'doe', 'public', 'logo-tecnitub.png') };
const MAX_JSON = 25 * 1024 * 1024, MAX_FICHIER = 15 * 1024 * 1024, SESSION_HEURES = 12;
const TYPES_FICHIERS = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', dwg: 'image/vnd.dwg', dxf: 'image/vnd.dxf',
  step: 'application/step', stp: 'application/step', ifc: 'application/x-step', pcf: 'text/plain', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip: 'application/zip' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const STATUTS = ['recue', 'confirmee', 'fabrication', 'expediee', 'livree', 'annulee'];

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS commandes (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT UNIQUE, email TEXT, statut TEXT, data TEXT NOT NULL, created_at TEXT, updated_at TEXT);
  CREATE TABLE IF NOT EXISTS devis (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT UNIQUE, email TEXT, statut TEXT, data TEXT NOT NULL, created_at TEXT, updated_at TEXT);
  CREATE TABLE IF NOT EXISTS fichiers (id TEXT PRIMARY KEY, devis_id INTEGER, nom TEXT, mime TEXT, data BLOB, taille INTEGER);
  CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, created_at TEXT);
  CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);`);

/* ---------- Mot de passe d'administration ---------- */
// BOUTIQUE_ADMIN_PASSWORD s'il est défini ; sinon un mot de passe tiré au hasard au premier démarrage, affiché une fois dans la console
const hacher = (mdp, sel = crypto.randomBytes(16).toString('hex')) => `${sel}:${crypto.scryptSync(String(mdp), sel, 32).toString('hex')}`;
function verifierMdp(mdp, h) {
  const [sel, attendu] = String(h).split(':');
  const calc = crypto.scryptSync(String(mdp), sel, 32);
  return calc.length === Buffer.from(attendu, 'hex').length && crypto.timingSafeEqual(calc, Buffer.from(attendu, 'hex'));
}
const lireConf = k => (db.prepare('SELECT value FROM config WHERE key = ?').get(k) || {}).value;
const ecrireConf = (k, v) => db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);
let mdpInitial = null;
if (process.env.BOUTIQUE_ADMIN_PASSWORD) ecrireConf('admin', hacher(process.env.BOUTIQUE_ADMIN_PASSWORD));
else if (!lireConf('admin')) { mdpInitial = crypto.randomBytes(9).toString('base64url'); ecrireConf('admin', hacher(mdpInitial)); }

/* ---------- Outils HTTP ---------- */
function send(res, status, obj, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}
const fail = (res, status, error) => send(res, status, { error });
function lire(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > max) { reject(Object.assign(new Error('Requête trop volumineuse'), { status: 413 })); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function lireJSON(req) {
  if (!String(req.headers['content-type'] || '').includes('application/json')) throw Object.assign(new Error('JSON attendu'), { status: 415 });
  const b = await lire(req, MAX_JSON);
  try { return b.length ? JSON.parse(b.toString('utf8')) : {}; } catch (e) { throw Object.assign(new Error('JSON invalide'), { status: 400 }); }
}
const cookies = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, v.join('=')]));
const empreinte = sid => crypto.createHash('sha256').update(String(sid)).digest('hex');
function estAdmin(req) {
  const sid = cookies(req).bq_sid;
  if (!sid) return false;
  const s = db.prepare('SELECT * FROM sessions WHERE sid = ?').get(empreinte(sid));
  if (!s) return false;
  if (Date.now() - new Date(s.created_at) > SESSION_HEURES * 3600000) { db.prepare('DELETE FROM sessions WHERE sid = ?').run(s.sid); return false; }
  return true;
}

// Limitation des envois par adresse IP (connexion admin, commandes, devis)
const compteurs = new Map();
function tropDeTentatives(req, cle, max, minutes) {
  const k = `${cle}:${HS.ipClient(req)}`, now = Date.now();
  const l = (compteurs.get(k) || []).filter(t => now - t < minutes * 60000);
  l.push(now); compteurs.set(k, l);
  if (compteurs.size > 10000) compteurs.clear();
  return l.length > max;
}

/* ---------- Validation des formulaires ---------- */
const texte = (v, max = 200) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const emailValide = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
function client(c = {}) {
  const r = { societe: texte(c.societe, 120), siret: texte(c.siret, 20).replace(/\s/g, ''), nom: texte(c.nom, 100), email: texte(c.email, 160).toLowerCase(),
    tel: texte(c.tel, 30), adresse: texte(c.adresse, 200), cp: texte(c.cp, 10), ville: texte(c.ville, 80), tva: texte(c.tva, 20) };
  if (!r.societe) throw Object.assign(new Error('Raison sociale obligatoire'), { status: 400 });
  if (!r.nom) throw Object.assign(new Error('Nom du contact obligatoire'), { status: 400 });
  if (!emailValide(r.email)) throw Object.assign(new Error('Adresse e-mail invalide'), { status: 400 });
  if (r.siret && !/^\d{14}$/.test(r.siret)) throw Object.assign(new Error('Le SIRET comporte 14 chiffres'), { status: 400 });
  return r;
}
function adresseLivraison(a = {}, c) {
  const r = { adresse: texte(a.adresse, 200) || c.adresse, cp: texte(a.cp, 10) || c.cp, ville: texte(a.ville, 80) || c.ville, contact: texte(a.contact, 100), creneau: texte(a.creneau, 100) };
  if (!r.adresse || !/^\d{5}$/.test(r.cp) || !r.ville) throw Object.assign(new Error('Adresse de livraison incomplète (code postal à 5 chiffres)'), { status: 400 });
  return r;
}
// Ligne de panier réduite aux champs connus (aucune donnée libre du navigateur n'est reprise telle quelle)
function ligne(l = {}) {
  const c = l.config || {};
  const config = { serie: texte(c.serie, 10), dn: texte(c.dn, 10), ep: +c.ep, nuance: texte(c.nuance, 10), finition: texte(c.finition, 20), repere: texte(c.repere, 40) };
  if (c.longueur != null) config.longueur = Math.round(+c.longueur);
  if (Array.isArray(c.troncons)) config.troncons = c.troncons.slice(0, 31).map(t => ({ dir: texte(t.dir, 1), l: Math.round(+t.l) }));
  if (c.ext) config.ext = { a: texte(c.ext.a, 20) || 'chanfrein', b: texte(c.ext.b, 20) || 'chanfrein' };
  return { produit: texte(l.produit, 40), qte: +l.qte, config, options: Array.isArray(l.options) ? l.options.slice(0, 10).map(o => texte(o, 20)) : [] };
}
function numero(table, prefixe) {
  const an = new Date().getFullYear();
  const n = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE numero LIKE ?`).get(`${prefixe}-${an}-%`).n + 1;
  return `${prefixe}-${an}-${String(n).padStart(4, '0')}`;
}
const resumeCommande = r => { const d = JSON.parse(r.data); return { numero: r.numero, statut: r.statut, created_at: r.created_at, updated_at: r.updated_at, ...d }; };

/* ---------- API ---------- */
async function api(req, res, url) {
  const p = url.pathname, m = req.method;

  if (p === '/api/commandes' && m === 'POST') {
    if (tropDeTentatives(req, 'cmd', 20, 60)) return fail(res, 429, 'Trop de commandes envoyées : réessayez dans une heure ou appelez-nous.');
    const b = await lireJSON(req);
    const cl = client(b.client), liv = adresseLivraison(b.livraison, cl);
    if (!b.cgv) return fail(res, 400, 'Acceptez les conditions générales de vente');
    const paiement = ['virement', 'compte'].includes(b.paiement) ? b.paiement : null;
    if (!paiement) return fail(res, 400, 'Mode de paiement inconnu');
    if (paiement === 'compte' && !cl.siret) return fail(res, 400, 'Le paiement sur compte client (30 jours fin de mois) demande le SIRET');
    let total;
    try { total = C.totaliser((b.lignes || []).map(ligne)); } catch (e) { return fail(res, 400, e.message); }
    total.lignes.forEach(l => { l.designation = C.designation(l); });
    const now = new Date().toISOString();
    const data = { client: cl, livraison: liv, paiement, reference: texte(b.reference, 60), message: texte(b.message, 2000), ...total, historique: [{ statut: 'recue', date: now }] };
    // Numéro attribué dans une transaction : deux commandes simultanées n'obtiennent pas le même
    db.exec('BEGIN IMMEDIATE');
    let num;
    try {
      num = numero('commandes', 'CMD');
      db.prepare('INSERT INTO commandes (numero, email, statut, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(num, cl.email, 'recue', JSON.stringify(data), now, now);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return send(res, 201, { numero: num, ht: total.ht, ttc: total.ttc, delai: total.delai });
  }

  if (p === '/api/devis' && m === 'POST') {
    if (tropDeTentatives(req, 'devis', 15, 60)) return fail(res, 429, 'Trop de demandes envoyées : réessayez dans une heure ou appelez-nous.');
    const b = await lireJSON(req);
    const cl = client(b.client);
    const message = texte(b.message, 5000);
    if (message.length < 10) return fail(res, 400, 'Décrivez votre besoin (au moins quelques mots)');
    const fichiers = (Array.isArray(b.fichiers) ? b.fichiers : []).slice(0, 10).map(f => {
      const nom = texte(f.nom, 120).replace(/[\\/]/g, '_'), ext = nom.split('.').pop().toLowerCase();
      if (!TYPES_FICHIERS[ext]) throw Object.assign(new Error(`Type de fichier refusé : ${nom} (PDF, DWG, DXF, STEP, IFC, PCF, images, XLSX, ZIP)`), { status: 400 });
      const data = Buffer.from(String(f.base64 || ''), 'base64');
      if (!data.length || data.length > MAX_FICHIER) throw Object.assign(new Error(`${nom} : fichier vide ou de plus de 15 Mo`), { status: 400 });
      return { id: crypto.randomUUID(), nom, mime: TYPES_FICHIERS[ext], data, taille: data.length };
    });
    const now = new Date().toISOString();
    const data = { client: cl, message, fluide: texte(b.fluide, 80), pression: texte(b.pression, 40), echeance: texte(b.echeance, 20), chantier: texte(b.chantier, 120),
      fichiers: fichiers.map(f => ({ id: f.id, nom: f.nom, taille: f.taille })) };
    db.exec('BEGIN IMMEDIATE');
    let num;
    try {
      num = numero('devis', 'DEV');
      const id = db.prepare('INSERT INTO devis (numero, email, statut, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(num, cl.email, 'nouvelle', JSON.stringify(data), now, now).lastInsertRowid;
      const ins = db.prepare('INSERT INTO fichiers (id, devis_id, nom, mime, data, taille) VALUES (?, ?, ?, ?, ?, ?)');
      fichiers.forEach(f => ins.run(f.id, id, f.nom, f.mime, f.data, f.taille));
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return send(res, 201, { numero: num });
  }

  // Suivi : numéro de commande + e-mail de la commande (sans compte client)
  if (p === '/api/suivi' && m === 'POST') {
    if (tropDeTentatives(req, 'suivi', 30, 15)) return fail(res, 429, 'Trop de recherches : réessayez dans quelques minutes.');
    const b = await lireJSON(req);
    const r = db.prepare('SELECT * FROM commandes WHERE numero = ? AND email = ?').get(texte(b.numero, 20).toUpperCase(), texte(b.email, 160).toLowerCase());
    if (!r) return fail(res, 404, 'Aucune commande avec ce numéro et cette adresse e-mail');
    const d = resumeCommande(r);
    return send(res, 200, { numero: d.numero, statut: d.statut, created_at: d.created_at, historique: d.historique, lignes: d.lignes.map(l => ({ designation: l.designation, qte: l.qte, montant: l.montant })), ht: d.ht, ttc: d.ttc, delai: d.delai, suiviTransport: d.suiviTransport || '' });
  }

  /* --- Administration --- */
  if (p === '/api/admin/login' && m === 'POST') {
    if (tropDeTentatives(req, 'login', 10, 15)) return fail(res, 429, 'Trop de tentatives : réessayez dans 15 minutes.');
    const b = await lireJSON(req);
    if (!verifierMdp(b.password || '', lireConf('admin'))) return fail(res, 401, 'Mot de passe incorrect');
    const sid = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (sid, created_at) VALUES (?, ?)').run(empreinte(sid), new Date().toISOString());
    return send(res, 200, { ok: true }, { 'Set-Cookie': `bq_sid=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HEURES * 3600}${HS.estHttps(req) ? '; Secure' : ''}` });
  }
  if (!p.startsWith('/api/admin/')) return fail(res, 404, 'Introuvable');
  if (!estAdmin(req)) return fail(res, 401, 'Connexion requise');

  if (p === '/api/admin/logout' && m === 'POST') {
    db.prepare('DELETE FROM sessions WHERE sid = ?').run(empreinte(cookies(req).bq_sid));
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'bq_sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
  }
  if (p === '/api/admin/commandes' && m === 'GET')
    return send(res, 200, db.prepare('SELECT * FROM commandes ORDER BY id DESC LIMIT 500').all().map(resumeCommande));
  if (p === '/api/admin/devis' && m === 'GET')
    return send(res, 200, db.prepare('SELECT * FROM devis ORDER BY id DESC LIMIT 500').all().map(r => ({ numero: r.numero, statut: r.statut, created_at: r.created_at, ...JSON.parse(r.data) })));
  let mm;
  if ((mm = p.match(/^\/api\/admin\/commandes\/(CMD-\d{4}-\d{4,})$/)) && m === 'PUT') {
    const b = await lireJSON(req);
    const r = db.prepare('SELECT * FROM commandes WHERE numero = ?').get(mm[1]);
    if (!r) return fail(res, 404, 'Commande introuvable');
    if (!STATUTS.includes(b.statut)) return fail(res, 400, 'Statut inconnu');
    const d = JSON.parse(r.data), now = new Date().toISOString();
    if (b.statut !== r.statut) d.historique.push({ statut: b.statut, date: now });
    if (b.suiviTransport != null) d.suiviTransport = texte(b.suiviTransport, 120);
    if (b.note != null) d.note = texte(b.note, 2000);
    db.prepare('UPDATE commandes SET statut = ?, data = ?, updated_at = ? WHERE numero = ?').run(b.statut, JSON.stringify(d), now, mm[1]);
    return send(res, 200, resumeCommande(db.prepare('SELECT * FROM commandes WHERE numero = ?').get(mm[1])));
  }
  if ((mm = p.match(/^\/api\/admin\/devis\/(DEV-\d{4}-\d{4,})$/)) && m === 'PUT') {
    const b = await lireJSON(req);
    if (!['nouvelle', 'en-cours', 'envoye', 'gagne', 'perdu'].includes(b.statut)) return fail(res, 400, 'Statut inconnu');
    const r = db.prepare('UPDATE devis SET statut = ?, updated_at = ? WHERE numero = ?').run(b.statut, new Date().toISOString(), mm[1]);
    return r.changes ? send(res, 200, { ok: true }) : fail(res, 404, 'Demande introuvable');
  }
  if ((mm = p.match(/^\/api\/admin\/fichiers\/([0-9a-f-]{36})$/)) && m === 'GET') {
    const f = db.prepare('SELECT * FROM fichiers WHERE id = ?').get(mm[1]);
    if (!f) return fail(res, 404, 'Fichier introuvable');
    res.writeHead(200, { 'Content-Type': f.mime, 'Content-Length': f.taille, 'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${f.nom.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(f.nom)}` });
    return res.end(Buffer.from(f.data));
  }
  return fail(res, 404, 'Introuvable');
}

/* ---------- Fichiers statiques ---------- */
function statique(req, res, url) {
  let f = PARTAGES[url.pathname];
  if (!f) {
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname === '/admin' ? '/admin.html' : url.pathname);
    f = path.join(PUBLIC_DIR, path.normalize(rel));
    if (!f.startsWith(PUBLIC_DIR + path.sep)) return fail(res, 403, 'Interdit');
  }
  fs.readFile(f, (err, buf) => {
    // Adresse inconnue : page d'accueil (navigation de l'application par #)
    if (err) return url.pathname.includes('.') ? fail(res, 404, 'Introuvable') : statique(req, res, new URL('/', url));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

const SERVEUR = HS.creerServeur(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) {
      if (HS.origineRefusee(req)) return fail(res, 403, 'Origine refusée');
      return await api(req, res, url);
    }
    if (!['GET', 'HEAD'].includes(req.method)) return fail(res, 405, 'Méthode non permise');
    return statique(req, res, url);
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Erreur interne');
  }
}, { dossierDonnees: path.dirname(DB_FILE), nom: 'Boutique TECNITUB' });
const server = SERVEUR.server;

if (require.main === module) {
  SERVEUR.surveiller();
  server.listen(PORT, HOST, () => {
    console.log(`Boutique TECNITUB : ${SERVEUR.etat.https ? 'https' : 'http'}://localhost:${PORT}  (administration : /admin, base : ${DB_FILE})`);
    if (mdpInitial) console.log(`Mot de passe d'administration créé : ${mdpInitial}  (à changer avec BOUTIQUE_ADMIN_PASSWORD)`);
  });
}
module.exports = { server, db };
