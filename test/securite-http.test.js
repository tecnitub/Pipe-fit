// Sécurité HTTP : en-têtes, origine des écritures, mots de passe, sessions, limitation des tentatives, identifiants, HTTPS natif.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-sechttp-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const { server, db } = require('../server/server');
const HS = require('../server/http-securite');
let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });
const call = async (method, url, body, cookie, headers = {}) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};

test('en-têtes de sécurité, origine des écritures', async () => {
  const page = await fetch(base + '/');
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.doesNotMatch(page.headers.get('content-security-policy'), /script-src[^;]*unsafe-inline/);
  assert.strictEqual(page.headers.get('x-frame-options'), 'DENY');
  assert.strictEqual(page.headers.get('strict-transport-security'), null, 'pas de HSTS en HTTP');
  assert.strictEqual((await fetch(base + '/%E0%A4%A')).status, 400);
  assert.strictEqual((await fetch(base + '/../server/server.js')).status, 404);
  const etranger = await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' }, null, { Origin: 'https://site-malveillant.example' });
  assert.strictEqual(etranger.status, 403);
  const meme = await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' }, null, { Origin: base });
  assert.strictEqual(meme.status, 200);
  // Jeton de session : seule son empreinte est en base
  const jeton = meme.cookie.split('=')[1];
  assert.ok(db.prepare('SELECT 1 FROM sessions WHERE token = ?').get(crypto.createHash('sha256').update(jeton).digest('hex')));
  assert.ok(!db.prepare('SELECT 1 FROM sessions WHERE token = ?').get(jeton));
  const s = await call('GET', '/api/securite', null, meme.cookie);
  assert.strictEqual(s.body.https.natif, false); assert.ok(s.body.sessions >= 1);
});

test('mots de passe, sessions, identifiants', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  for (const [pw, raison] of [['court-123', /10 caractères/], ['azertyuiop', /courant/], ['xx-kevin-2026', /identifiant/]]) {
    const r = await call('POST', '/api/accounts', { login: 'kevin', password: pw, role: 'atelier', userId: 'o1' }, admin);
    assert.strictEqual(r.status, 400, pw); assert.match(r.body.error, raison);
  }
  assert.strictEqual((await call('POST', '/api/accounts', { login: 'kevin', password: 'tuyau-inox-316L', role: 'atelier', userId: 'o1' }, admin)).status, 200);
  const k1 = (await call('POST', '/api/login', { login: 'kevin', password: 'tuyau-inox-316L' })).cookie;
  const k2 = (await call('POST', '/api/login', { login: 'kevin', password: 'tuyau-inox-316L' })).cookie;
  assert.strictEqual((await call('GET', '/api/me/sessions', null, k1)).body.autres, 1);
  assert.strictEqual((await call('DELETE', '/api/me/sessions', {}, k1)).body.deconnectes, 1);
  assert.strictEqual((await call('GET', '/api/me', null, k2)).status, 401, 'autre appareil déconnecté');
  assert.strictEqual((await call('GET', '/api/me', null, k1)).status, 200);
  // Identifiants : ni guillemet, ni apostrophe, ni chevron (id de l'enregistrement et références)
  assert.strictEqual((await call('PUT', "/api/records/contacts/x'y", { data: { nom: 'X' } }, admin)).status, 400);
  assert.strictEqual((await call('PUT', '/api/records/contacts/c-ok', { data: { nom: 'X', entrepriseId: 'e1"><img src=x>' } }, admin)).status, 400);
  assert.strictEqual((await call('PUT', '/api/records/frais/nf-x', { data: { userId: 'o1', photoId: "a' onmouseover='x", statut: 'Brouillon' } }, k1)).status, 400);
  assert.strictEqual((await call('POST', '/api/bulk/articles', { items: [{ id: 'a"b', ref: 'X' }] }, admin)).status, 400);
  assert.strictEqual((await call('PUT', '/api/records/contacts/c-ok', { data: { nom: 'X', entrepriseId: 'e1' } }, admin)).status, 200);
});

test('limitation des tentatives : par adresse (derrière le proxy local) et par identifiant', async () => {
  const essai = (login, ip) => call('POST', '/api/login', { login, password: 'mauvais-mot-de-passe' }, null, { 'X-Forwarded-For': ip });
  for (let i = 0; i < 10; i++) assert.strictEqual((await essai(`inconnu${i}`, '203.0.113.7')).status, 401);
  assert.strictEqual((await essai('autre', '203.0.113.7')).status, 429, 'adresse bloquée');
  assert.strictEqual((await essai('autre', '203.0.113.8')).status, 401, 'les autres adresses ne sont pas bloquées');
  // Attaque répartie sur un même compte
  for (let i = 0; i < 20; i++) await essai('admin', `198.51.100.${i + 1}`);
  assert.strictEqual((await essai('admin', '198.51.100.99')).status, 429);
  assert.ok(db.prepare("SELECT COUNT(*) n FROM audit WHERE action = 'échec de connexion'").get().n >= 30);
  // Première configuration : jamais au travers d'un proxy, même installé sur le serveur
  assert.strictEqual((await call('GET', '/api/setup', null, null, { 'X-Forwarded-For': '203.0.113.9' })).body.local, false);
  assert.strictEqual((await call('GET', '/api/setup')).body.local, true);
});

test('HTTPS natif : certificat chargé, HTTP local servi, HTTP réseau redirigé', { skip: spawnSync('openssl', ['version']).status !== 0 && 'openssl absent' }, async () => {
  const tls = path.join(dir, 'tls-test', 'tls'); fs.mkdirSync(tls, { recursive: true });
  spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(tls, 'key.pem'), '-out', path.join(tls, 'cert.pem'), '-days', '30', '-subj', '/CN=crm.test', '-addext', 'subjectAltName=DNS:localhost']);
  const S = HS.creerServeur((req, res) => { res.end(`ok ${req.socket.encrypted ? 'tls' : 'clair'}`); }, { dossierDonnees: path.dirname(tls), nom: 'test' });
  assert.ok(S.etat.https); assert.strictEqual(S.etat.certificat.autoSigne, true); assert.match(S.etat.certificat.sujet, /crm\.test/);
  await new Promise(r => S.server.listen(0, '127.0.0.1', r));
  const port = S.server.address().port;
  try {
    const https = require('node:https');
    const corps = await new Promise((ok, ko) => https.get({ host: '127.0.0.1', port, path: '/', rejectUnauthorized: false }, r => { let d = ''; r.on('data', c => { d += c; }); r.on('end', () => ok([r.headers['strict-transport-security'], d])); }).on('error', ko));
    assert.deepStrictEqual(corps, ['max-age=31536000', 'ok tls']);
    assert.strictEqual(await (await fetch(`http://127.0.0.1:${port}/`)).text(), 'ok clair'); // depuis le serveur lui-même
  } finally { S.server.close(); S.server.closeAllConnections(); }
  // Certificat illisible : refus de démarrer en HTTP
  fs.writeFileSync(path.join(tls, 'key.pem'), 'abîmé');
  assert.throws(() => HS.creerServeur(() => {}, { dossierDonnees: path.dirname(tls) }), /certificat HTTPS illisible/);
});
