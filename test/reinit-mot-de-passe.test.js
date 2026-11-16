// Mot de passe oublié : réinitialisation sur le serveur (accès direct à la base), sessions et jetons des applications fermés
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const DB = require('../server/db');
const R = require('../server/reinit-mot-de-passe');

function base() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-reinit-')), db = DB.open(path.join(dir, 't.db'));
  db.exec('CREATE TABLE IF NOT EXISTS jetons_apps (empreinte TEXT PRIMARY KEY, account_id TEXT NOT NULL, app TEXT NOT NULL, expires INTEGER NOT NULL, created_at TEXT NOT NULL, last_used INTEGER)');
  const id = crypto.randomBytes(6).toString('hex');
  db.prepare('INSERT INTO accounts (id, login, nom, role, user_id, pass, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, 'claire', 'Claire', 'charge', null, DB.hashPassword('ancien-mot-de-passe'), new Date().toISOString());
  db.prepare('INSERT INTO sessions (token, account_id, expires) VALUES (?, ?, ?)').run('t1', id, Date.now() + 1e6);
  db.prepare('INSERT INTO jetons_apps (empreinte, account_id, app, expires, created_at) VALUES (?, ?, ?, ?, ?)').run('e1', id, 'etudes', Date.now() + 1e6, new Date().toISOString());
  return { db, id, dir };
}

test('réinitialisation : nouveau mot de passe, sessions et jetons d\'Études / DOE fermés, trace au journal', () => {
  const { db, id, dir } = base();
  R.reinitialiser(db, 'CLAIRE', 'nouvelle phrase secrète');
  const a = db.prepare('SELECT pass FROM accounts WHERE id = ?').get(id);
  assert.ok(DB.checkPassword('nouvelle phrase secrète', a.pass));
  assert.ok(!DB.checkPassword('ancien-mot-de-passe', a.pass));
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM sessions WHERE account_id = ?').get(id).n, 0);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM jetons_apps WHERE account_id = ?').get(id).n, 0);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('mot de passe trop court, contenant l\'identifiant, ou compte inconnu : refusé sans rien changer', () => {
  const { db, id, dir } = base();
  assert.throws(() => R.reinitialiser(db, 'claire', 'court'), /10 caractères/);
  assert.throws(() => R.reinitialiser(db, 'claire', 'claire-2026-xyz'), /identifiant/);
  assert.throws(() => R.reinitialiser(db, 'personne', 'une phrase assez longue'), /Aucun compte/);
  assert.ok(DB.checkPassword('ancien-mot-de-passe', db.prepare('SELECT pass FROM accounts WHERE id = ?').get(id).pass));
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 1);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('création d\'un administrateur seulement s\'il n\'en existe aucun', () => {
  const { db, dir } = base();
  R.creerAdmin(db, 'phrase du nouveau gérant');
  const a = db.prepare("SELECT role, pass FROM accounts WHERE login = 'admin'").get();
  assert.strictEqual(a.role, 'admin');
  assert.ok(DB.checkPassword('phrase du nouveau gérant', a.pass));
  assert.throws(() => R.creerAdmin(db, 'une autre phrase longue'), /existe déjà/);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('raccourci Windows installé et décrit dans le mode d\'emploi', () => {
  const racine = path.join(__dirname, '..');
  assert.match(fs.readFileSync(path.join(racine, 'installer', 'PipeFitCRM.nsi'), 'utf8'), /reinit-mot-de-passe\.cmd/);
  assert.match(fs.readFileSync(path.join(racine, 'installer', 'files', 'reinit-mot-de-passe.cmd'), 'utf8'), /reinit-mot-de-passe\.js/);
  assert.match(fs.readFileSync(path.join(racine, 'installer', 'files', 'LISEZMOI.txt'), 'utf8'), /MOT DE PASSE OUBLI/);
});
