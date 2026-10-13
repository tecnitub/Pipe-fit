// Base SQLite (module intégré à Node.js, aucune dépendance).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const COLLECTIONS = ['users', 'entreprises', 'contacts', 'articles', 'mainoeuvre', 'zones', 'affaires', 'devis', 'commandes', 'factures', 'planning', 'temps'];
// Numérotation attribuée par le serveur : collection -> [champ, préfixe, chiffres]
const NUMBERING = { devis: ['numero', 'DV', 4], factures: ['numero', 'FA', 4], commandes: ['numero', 'CF', 4], affaires: ['code', 'CH', 3] };
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
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, login TEXT, action TEXT, col TEXT, rid TEXT, label TEXT);
  `);
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
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

// Numérotation séquentielle par année (DV-2026-0001, CH-2026-001…), attribuée dans la transaction d'écriture.
function nextNumber(db, col) {
  const [field, code, digits] = NUMBERING[col];
  const prefix = `${code}-${new Date().getFullYear()}-`;
  let row = db.prepare('SELECT value FROM counters WHERE name = ?').get(prefix);
  if (!row) {
    let max = 0;
    for (const r of db.prepare('SELECT data FROM records WHERE col = ?').all(col)) {
      const n = JSON.parse(r.data)[field] || '';
      if (n.startsWith(prefix)) max = Math.max(max, parseInt(n.slice(prefix.length), 10) || 0);
    }
    db.prepare('INSERT INTO counters (name, value) VALUES (?, ?)').run(prefix, max);
    row = { value: max };
  }
  const value = row.value + 1;
  db.prepare('UPDATE counters SET value = ? WHERE name = ?').run(value, prefix);
  return prefix + String(value).padStart(digits, '0');
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
  });
}

function audit(db, login, action, col, rid, label) {
  db.prepare('INSERT INTO audit (at, login, action, col, rid, label) VALUES (?, ?, ?, ?, ?, ?)')
    .run(new Date().toISOString(), login, action, col || null, rid || null, label || null);
}

module.exports = {
  COLLECTIONS, NUMBERING, ROLES, open, tx, hashPassword, checkPassword, clean,
  getRecord, allData, getSettings, setSettings, nextNumber, replaceAll, audit,
};
