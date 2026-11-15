// Jeton de service Pipe-Fit des applications Études et DOE : plus de cookie de session Pipe-Fit en clair dans leurs
// bases (jeton chiffré, clé hors de la base), portée réduite, durée limitée, révocation, migration des anciennes sessions.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const SL = require('../server/secret-local');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-jetons-'));
process.env.DB_FILE = path.join(dir, 'pf.db');
process.env.ETUDES_DB_FILE = path.join(dir, 'etudes.db');
process.env.DOE_DB_FILE = path.join(dir, 'doe.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const PF = require('../server/server');
let etudes, doe, base, doeBase, pfBase, edb, ancienCookie;

async function call(b, method, url, body, cookie, headers = {}) {
  const res = await fetch(b + url, { method, headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : null, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
const octets = f => Buffer.concat([f, `${f}-wal`].filter(x => fs.existsSync(x)).map(x => fs.readFileSync(x)));
const empreinte = t => crypto.createHash('sha256').update(String(t)).digest('hex');
// Jeton d'une session de l'application, déchiffré avec la clé du serveur (comme le ferait quelqu'un qui a la base ET la clé)
const jetonSession = (db, fichierCle) => { const s = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1').get(); return SL.dechiffrer(SL.cleServeur({ fichier: fichierCle }).cle, s.pf_jeton, s.sid); };

before(async () => {
  await new Promise(r => PF.server.listen(0, '127.0.0.1', r));
  pfBase = `http://127.0.0.1:${PF.server.address().port}`;
  process.env.PIPEFIT_URL = pfBase;
  const admin = (await call(pfBase, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  for (const [login, role] of [['jacky', 'charge'], ['marc', 'atelier']]) await call(pfBase, 'POST', '/api/accounts', { login, password: 'motdepasse1', role, nom: login }, admin);
  // Base Études d'avant les jetons : session dont le cookie Pipe-Fit est en clair
  ancienCookie = (await call(pfBase, 'POST', '/api/login', { login: 'jacky', password: 'motdepasse1' })).cookie;
  const v = new DatabaseSync(process.env.ETUDES_DB_FILE);
  v.exec('CREATE TABLE sessions (sid TEXT PRIMARY KEY, login TEXT, nom TEXT, role TEXT, pf_cookie TEXT, created_at TEXT, user_id TEXT)');
  v.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, NULL)').run(empreinte('ancienne'), 'jacky', 'jacky', 'charge', ancienCookie, new Date().toISOString());
  v.close();
  ({ server: etudes, db: edb } = require('../etudes/server'));
  doe = require('../doe/server').server;
  for (const s of [etudes, doe]) await new Promise(r => s.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${etudes.address().port}`;
  doeBase = `http://127.0.0.1:${doe.address().port}`;
});
after(() => { for (const s of [etudes, doe, PF.server]) { s.close(); s.closeAllConnections(); } fs.rmSync(dir, { recursive: true, force: true }); });

test('chiffrement local : clé hors de la base (fichier 600 ou variable d\'environnement), contenu lié à la session', () => {
  const f = path.join(dir, 'essai.key'), { cle } = SL.cleServeur({ fichier: f });
  assert.strictEqual(SL.cleServeur({ fichier: f }).cle.toString('hex'), cle.toString('hex'), 'même clé au redémarrage');
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600);
  const c = SL.chiffrer(cle, 'pfapp_secret', 'sid1');
  assert.ok(SL.estChiffre(c) && !c.includes('secret'));
  assert.strictEqual(SL.dechiffrer(cle, c, 'sid1'), 'pfapp_secret');
  assert.strictEqual(SL.dechiffrer(cle, c, 'sid2'), null, 'déplacé sur une autre session');
  assert.strictEqual(SL.dechiffrer(crypto.randomBytes(32), c, 'sid1'), null, 'autre clé');
  assert.strictEqual(SL.dechiffrer(cle, c.slice(0, -2) + 'AA', 'sid1'), null, 'modifié');
  assert.strictEqual(SL.dechiffrer(cle, 'sid=abc', 'sid1'), null, 'ancien format en clair');
  assert.strictEqual(SL.cleServeur({ env: 'ab'.repeat(32), fichier: f }).source, 'variable d\'environnement');
  assert.throws(() => SL.cleServeur({ env: 'trop-courte', fichier: f }), /invalide/);
});

test('migration : anciennes sessions en clair effacées au démarrage, leur session Pipe-Fit fermée', async () => {
  assert.strictEqual(edb.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  assert.ok(!octets(process.env.ETUDES_DB_FILE).includes(ancienCookie.split('=')[1]), 'cookie encore lisible dans le fichier de la base');
  // Fermée dans Pipe-Fit peu après le démarrage
  let st = 200;
  for (let i = 0; i < 60 && st === 200; i++) { await new Promise(r => setTimeout(r, 100)); st = (await call(pfBase, 'GET', '/api/me', null, ancienCookie)).status; }
  assert.strictEqual(st, 401);
});

test('connexion à Études : jeton chiffré, aucune session Pipe-Fit conservée, fonctionnement inchangé', async () => {
  const sessionsPF = () => PF.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE account_id = (SELECT id FROM accounts WHERE login = 'jacky')").get().n;
  const avant = sessionsPF();
  const r = await call(base, 'POST', '/api/login', { login: 'jacky', password: 'motdepasse1' });
  assert.strictEqual(r.status, 200);
  assert.ok(!JSON.stringify(r.body).includes('pfapp_'), 'jeton renvoyé au navigateur');
  assert.strictEqual(sessionsPF(), avant, 'session Pipe-Fit de la connexion fermée');
  const s = edb.prepare('SELECT * FROM sessions').get();
  assert.strictEqual(s.pf_cookie, null);
  assert.ok(SL.estChiffre(s.pf_jeton));
  const jeton = jetonSession(edb, path.join(dir, 'etudes-sessions.key'));
  assert.match(jeton, /^pfapp_/);
  const brut = octets(process.env.ETUDES_DB_FILE);
  assert.ok(!brut.includes(jeton) && !brut.includes('pfapp_') && !brut.includes('sid='), 'secret en clair dans la base Études');
  assert.ok(!octets(process.env.DB_FILE).includes(jeton), 'Pipe-Fit ne garde que l\'empreinte du jeton');
  // Fonctionnement : données Pipe-Fit, étude enregistrée et transmise à Pipe-Fit
  assert.strictEqual((await call(base, 'GET', '/api/pf/affaires', null, r.cookie)).status, 200);
  assert.strictEqual((await call(base, 'PUT', '/api/etudes/j1', { data: { objet: 'Jeton', affaireId: 'af1', notes: [] }, resume: { objet: 'Jeton' } }, r.cookie)).status, 200);
  const pfJ = (await call(pfBase, 'POST', '/api/login', { login: 'jacky', password: 'motdepasse1' })).cookie;
  let lien = null;
  for (let i = 0; i < 60 && !lien; i++) { await new Promise(x => setTimeout(x, 50)); lien = (await call(pfBase, 'GET', '/api/liens?app=etudes', null, pfJ)).body.find(l => l.id === 'j1'); }
  assert.ok(lien && lien.par === 'jacky');
  // Compagnon : refusé comme avant
  assert.strictEqual((await call(base, 'POST', '/api/login', { login: 'marc', password: 'motdepasse1' })).status, 403);
});

test('portée du jeton : routes de l\'application seulement, même pour un administrateur ; durée limitée', async () => {
  const r = await call(base, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' });
  assert.strictEqual(r.status, 200);
  const jeton = jetonSession(edb, path.join(dir, 'etudes-sessions.key')), auth = { Authorization: `Bearer ${jeton}` };
  const j = PF.db.prepare('SELECT * FROM jetons_apps WHERE empreinte = ?').get(empreinte(jeton));
  assert.strictEqual(j.app, 'etudes');
  assert.ok(j.expires > Date.now() + 13 * 86400000 && j.expires <= Date.now() + 14 * 86400000 + 1000, '14 jours');
  for (const [m, u] of [['GET', '/api/data'], ['GET', '/api/liens?app=etudes'], ['GET', '/api/me'], ['GET', '/api/records/affaires/af1']])
    assert.strictEqual((await call(pfBase, m, u, null, null, auth)).status, 200, u);
  for (const [m, u] of [['GET', '/api/accounts'], ['GET', '/api/audit'], ['GET', '/api/records/factures'], ['GET', '/api/events'], ['PUT', '/api/settings'], ['POST', '/api/jetons-apps'], ['POST', '/api/cles'], ['PUT', '/api/records/factures/x']]) {
    const x = await call(pfBase, m, u, m === 'GET' ? null : {}, null, auth);
    assert.strictEqual(x.status, 403, u);
    assert.match(x.body.error, /Route non autorisée/);
  }
  // Un jeton ne s'obtient qu'avec une session Pipe-Fit du bureau (pas avec une clé d'API, ni pour un compagnon)
  const marc = (await call(pfBase, 'POST', '/api/login', { login: 'marc', password: 'motdepasse1' })).cookie;
  assert.strictEqual((await call(pfBase, 'POST', '/api/jetons-apps', { app: 'etudes' }, marc)).status, 403);
  const pfAdmin = (await call(pfBase, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  assert.strictEqual((await call(pfBase, 'POST', '/api/jetons-apps', { app: 'autre' }, pfAdmin)).status, 400);
  // Jeton expiré : refusé
  PF.db.prepare('UPDATE jetons_apps SET expires = ? WHERE empreinte = ?').run(Date.now() - 1000, empreinte(jeton));
  assert.strictEqual((await call(pfBase, 'GET', '/api/data', null, null, auth)).status, 401);
  assert.strictEqual((await call(base, 'GET', '/api/pf/affaires?frais=1', null, r.cookie)).status, 401);
  assert.strictEqual((await call(base, 'GET', '/api/me', null, r.cookie)).status, 401, 'session de l\'application fermée');
});

test('révocation : déconnexion de l\'application, changement de mot de passe, déconnexion des autres appareils', async () => {
  const fichierCle = path.join(dir, 'etudes-sessions.key');
  let c = (await call(base, 'POST', '/api/login', { login: 'jacky', password: 'motdepasse1' })).cookie, jeton = jetonSession(edb, fichierCle);
  assert.strictEqual((await call(base, 'POST', '/api/logout', {}, c)).status, 200);
  assert.strictEqual((await call(pfBase, 'GET', '/api/data', null, null, { Authorization: `Bearer ${jeton}` })).status, 401, 'jeton révoqué à la déconnexion');
  // Mot de passe changé dans Pipe-Fit : les applications redemandent la connexion
  c = (await call(base, 'POST', '/api/login', { login: 'jacky', password: 'motdepasse1' })).cookie; jeton = jetonSession(edb, fichierCle);
  const pfJ = (await call(pfBase, 'POST', '/api/login', { login: 'jacky', password: 'motdepasse1' })).cookie;
  assert.strictEqual((await call(pfBase, 'POST', '/api/me/password', { current: 'motdepasse1', next: 'nouveau-mot-2' }, pfJ)).status, 200);
  assert.strictEqual((await call(base, 'GET', '/api/pf/affaires?frais=1', null, c)).status, 401);
  // « Déconnecter mes autres appareils » : jetons des applications compris
  c = (await call(base, 'POST', '/api/login', { login: 'jacky', password: 'nouveau-mot-2' })).cookie; jeton = jetonSession(edb, fichierCle);
  const pfJ2 = (await call(pfBase, 'POST', '/api/login', { login: 'jacky', password: 'nouveau-mot-2' })).cookie;
  assert.strictEqual((await call(pfBase, 'GET', '/api/me/sessions', null, pfJ2)).body.applications, 1);
  assert.ok((await call(pfBase, 'DELETE', '/api/me/sessions', {}, pfJ2)).body.deconnectes >= 1);
  assert.strictEqual((await call(pfBase, 'GET', '/api/data', null, null, { Authorization: `Bearer ${jeton}` })).status, 401);
});

test('application DOE : même jeton de service chiffré, portée DOE', async () => {
  const r = await call(doeBase, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' });
  assert.strictEqual(r.status, 200);
  const ddb = new DatabaseSync(process.env.DOE_DB_FILE), s = ddb.prepare('SELECT * FROM sessions').get();
  assert.strictEqual(s.pf_cookie, null);
  const jeton = SL.dechiffrer(SL.cleServeur({ fichier: path.join(dir, 'doe-sessions.key') }).cle, s.pf_jeton, s.sid);
  ddb.close();
  assert.ok(!octets(process.env.DOE_DB_FILE).includes(jeton));
  assert.strictEqual((await call(doeBase, 'GET', '/api/pf/donnees', null, r.cookie)).status, 200);
  const auth = { Authorization: `Bearer ${jeton}` };
  assert.strictEqual((await call(pfBase, 'GET', '/api/liens/materiel?affaireId=af1', null, null, auth)).status, 200);
  assert.strictEqual((await call(pfBase, 'POST', '/api/mail', {}, null, auth)).status, 403, 'envoi d\'e-mails : propre à Études');
  assert.strictEqual((await call(pfBase, 'PUT', '/api/liens/etudes/x', { affaireId: 'af1', resume: {} }, null, auth)).status, 403, 'état d\'une étude : propre à Études');
});
