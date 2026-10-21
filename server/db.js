// Base SQLite (module intégré à Node.js, aucune dépendance).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const COLLECTIONS = ['users', 'entreprises', 'contacts', 'articles', 'mainoeuvre', 'zones', 'affaires', 'devis', 'situations', 'commandes', 'factures', 'planning', 'temps', 'frais', 'rapports', 'reserves', 'receptions', 'consommations', 'envois', 'achats', 'efactures', 'familles', 'chiffrages', 'consultations', 'ouvrages', 'notifications', 'habilitations', 'materiels', 'missions', 'produits', 'equipementsFrigo', 'fichesFluides', 'bouteilles', 'enlevements'];
// Numérotation attribuée par le serveur : collection -> [champ, préfixe, chiffres]
const NUMBERING = { devis: ['numero', 'DV', 4], factures: ['numero', 'FA', 4], commandes: ['numero', 'CF', 4], affaires: ['code', 'CH', 3], situations: ['numero', 'BL', 4], frais: ['numero', 'NF', 4], rapports: ['numero', 'RI', 4], receptions: ['numero', 'PV', 4], achats: ['ref', 'FF', 4], consultations: ['ref', 'CS', 4], fichesFluides: ['numero', 'FI', 4] };
const ROLES = ['admin', 'charge', 'atelier'];

function open(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS records (
      col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, updated_by TEXT,
      PRIMARY KEY (col, id));
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE COLLATE NOCASE, nom TEXT, role TEXT NOT NULL,
      user_id TEXT, pass TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL, created_by TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, login TEXT, action TEXT, col TEXT, rid TEXT, label TEXT);
  `);
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  // Adresse e-mail (Microsoft 365) de chaque compte, ajoutée après coup
  if (!db.prepare('PRAGMA table_info(accounts)').all().some(c => c.name === 'email')) db.exec('ALTER TABLE accounts ADD COLUMN email TEXT');
  migrateClients(db);
  return db;
}

// Migration : ancienne fiche « client » unique -> entreprise (avec adresse) + contact.
function migrateClients(db) {
  const old = db.prepare("SELECT * FROM records WHERE col = 'clients'").all();
  if (!old.length) return;
  const ins = db.prepare('INSERT OR IGNORE INTO records (col, id, data, version, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)');
  const now = new Date().toISOString();
  tx(db, () => {
    for (const r of old) {
      const c = JSON.parse(r.data);
      const siteId = 'site-' + c.id;
      ins.run('entreprises', c.id, JSON.stringify({
        id: c.id, nom: c.nom, categorie: 'Client', secteur: c.type || '', tel: c.tel || '', email: c.email || '', zoneId: c.zoneId || '', notes: c.notes || '',
        adresses: (c.ville || c.cp) ? [{ id: siteId, libelle: 'Adresse principale', adresse: '', cp: c.cp || '', ville: c.ville || '', facturation: true }] : [],
      }), now, 'migration');
      if (c.contact) {
        ins.run('contacts', 'ct-' + c.id, JSON.stringify({ id: 'ct-' + c.id, prenom: '', nom: c.contact, fonction: '', entrepriseId: c.id, tel: c.tel || '', email: c.email || '' }), now, 'migration');
      }
    }
    db.prepare("DELETE FROM records WHERE col = 'clients'").run();
  });
}

function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return salt.toString('hex') + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === h.length && crypto.timingSafeEqual(h, expected);
}

const rowToRecord = r => ({ ...JSON.parse(r.data), _v: r.version, _at: r.updated_at, _by: r.updated_by });
const clean = obj => Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith('_')));

function getRecord(db, col, id) {
  const r = db.prepare('SELECT * FROM records WHERE col = ? AND id = ?').get(col, id);
  return r ? rowToRecord(r) : null;
}

function allData(db) {
  const out = { settings: getSettings(db) };
  COLLECTIONS.forEach(c => { out[c] = []; });
  for (const r of db.prepare('SELECT * FROM records').all()) if (out[r.col]) out[r.col].push(rowToRecord(r));
  return out;
}

function getSettings(db) {
  const r = db.prepare('SELECT data FROM settings WHERE id = 1').get();
  return r ? JSON.parse(r.data) : {};
}
function setSettings(db, s) {
  db.prepare('INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(JSON.stringify(s));
}

// Configuration confidentielle (jamais renvoyée avec les données) : connexion Microsoft 365
function getConfig(db, key) { const r = db.prepare('SELECT value FROM config WHERE key = ?').get(key); return r ? JSON.parse(r.value) : null; }
function setConfig(db, key, value) { db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value)); }

// Numérotation séquentielle par année (DV-2026-0001, CH-2026-001…), attribuée dans la transaction d'écriture.
// Les interventions hors devis ont leur propre numérotation (HD-AAAA-001) dans la liste des chantiers.
// Factures et avoirs : format paramétrable (Paramètres → Numérotation), suite continue sans trou.
const FORMATS_DEFAUT = { facture: { prefixe: 'FA', separateur: '-', annee: 'AAAA', chiffres: 4 }, avoir: { prefixe: 'AV', separateur: '-', annee: 'AAAA', chiffres: 4 },
  situation: { prefixe: 'BL', separateur: '-', annee: 'AAAA', chiffres: 4 } };
// Pièces à numérotation paramétrable : clé du format -> [liste, objet type]
const NUMEROS_PARAMETRABLES = { facture: ['factures', { type: '' }], avoir: ['factures', { type: 'avoir' }], situation: ['situations', {}] };
function formatNumero(db, cle) {
  const f = { ...FORMATS_DEFAUT[cle], ...(((getSettings(db) || {}).numerotation || {})[cle] || {}) };
  f.prefixe = String(f.prefixe ?? '').replace(/[^\w/.-]/g, '').slice(0, 12);
  f.separateur = ['-', '/', '_', '.', ''].includes(f.separateur) ? f.separateur : '-';
  f.annee = ['AAAA', 'AA', ''].includes(f.annee) ? f.annee : 'AAAA';
  f.chiffres = Math.min(8, Math.max(3, parseInt(f.chiffres, 10) || 4));
  return f;
}
// Racine du numéro (tout sauf le compteur) et nombre de chiffres
function racineNumero(db, col, obj, date = new Date()) {
  const [, base, digits] = NUMBERING[col];
  if (col === 'factures' || col === 'situations') {
    const f = formatNumero(db, col === 'situations' ? 'situation' : obj && obj.type === 'avoir' ? 'avoir' : 'facture');
    const an = f.annee === 'AAAA' ? String(date.getFullYear()) : f.annee === 'AA' ? String(date.getFullYear()).slice(2) : '';
    return { prefix: [f.prefixe, an].filter(Boolean).map(x => x + f.separateur).join(''), digits: f.chiffres };
  }
  const code = col === 'affaires' && obj && obj.type === 'horsDevis' ? 'HD' : base;
  return { prefix: `${code}-${date.getFullYear()}-`, digits };
}
// Plus grand numéro déjà attribué pour cette racine
function maxUtilise(db, col, prefix) {
  const field = NUMBERING[col][0];
  let max = 0;
  for (const r of db.prepare('SELECT data FROM records WHERE col = ?').all(col)) {
    const n = String(JSON.parse(r.data)[field] || '');
    if (n.startsWith(prefix) && /^\d+$/.test(n.slice(prefix.length))) max = Math.max(max, parseInt(n.slice(prefix.length), 10));
  }
  return max;
}
function compteur(db, col, prefix) {
  const lire = nom => (db.prepare('SELECT value FROM counters WHERE name = ?').get(nom) || { value: 0 }).value;
  // (ancien nom de compteur : la racine seule)
  return Math.max(lire(`${col}:${prefix}`), lire(prefix), maxUtilise(db, col, prefix));
}
function nextNumber(db, col, obj) {
  const { prefix, digits } = racineNumero(db, col, obj);
  const value = compteur(db, col, prefix) + 1;
  db.prepare('INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').run(`${col}:${prefix}`, value);
  return prefix + String(value).padStart(digits, '0');
}
// Reprise d'une numérotation existante : prochain numéro imposé (jamais en dessous d'un numéro déjà attribué)
function fixerProchain(db, col, obj, prochain) {
  const { prefix } = racineNumero(db, col, obj);
  const max = maxUtilise(db, col, prefix);
  if (!(prochain > max)) return { erreur: `Le numéro ${prefix}${max} est déjà attribué : le prochain numéro doit être supérieur à ${max}.` };
  db.prepare('INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').run(`${col}:${prefix}`, prochain - 1);
  return { ok: true };
}
function etatNumerotation(db) {
  const etat = cle => {
    const [col, obj] = NUMEROS_PARAMETRABLES[cle], { prefix, digits } = racineNumero(db, col, obj);
    const prochain = compteur(db, col, prefix) + 1;
    return { format: formatNumero(db, cle), racine: prefix, prochain, exemple: prefix + String(prochain).padStart(digits, '0'), dernier: maxUtilise(db, col, prefix) };
  };
  return Object.fromEntries(Object.keys(NUMEROS_PARAMETRABLES).map(cle => [cle, etat(cle)]));
}

function replaceAll(db, data, login) {
  tx(db, () => {
    db.exec('DELETE FROM records; DELETE FROM counters;');
    const ins = db.prepare('INSERT INTO records (col, id, data, version, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)');
    const now = new Date().toISOString();
    for (const c of COLLECTIONS) for (const obj of data[c] || []) {
      if (!obj.id) continue;
      ins.run(c, String(obj.id), JSON.stringify(clean(obj)), now, login);
    }
    setSettings(db, data.settings || {});
    const insFile = db.prepare('INSERT OR REPLACE INTO files (id, mime, data, created_by, created_at) VALUES (?, ?, ?, ?, ?)');
    for (const [id, url] of Object.entries(data.files || {})) {
      const m = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,(.+)$/.exec(url);
      if (m) insFile.run(id, m[1], Buffer.from(m[2], 'base64'), login, now);
    }
  });
}

function audit(db, login, action, col, rid, label) {
  db.prepare('INSERT INTO audit (at, login, action, col, rid, label) VALUES (?, ?, ?, ?, ?, ?)')
    .run(new Date().toISOString(), login, action, col || null, rid || null, label || null);
}

module.exports = {
  COLLECTIONS, NUMBERING, NUMEROS_PARAMETRABLES, ROLES, open, tx, hashPassword, checkPassword, clean,
  getRecord, allData, getSettings, setSettings, nextNumber, replaceAll, audit, getConfig, setConfig, fixerProchain, etatNumerotation,
};
