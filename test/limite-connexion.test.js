// Limite des tentatives de connexion des applications Études et DOE : par identifiant et par adresse du client réel
// (proxy de confiance seulement), temporisation progressive, message clair ; une connexion réussie n'est pas gênée.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const L = require('../server/limite-connexion');
const HS = require('../server/http-securite');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-tentatives-'));
process.env.DB_FILE = path.join(dir, 'pf.db');
process.env.ETUDES_DB_FILE = path.join(dir, 'etudes.db');
process.env.DOE_DB_FILE = path.join(dir, 'doe.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
delete process.env.TRUST_PROXY;
const pf = require('../server/server').server;
let etudes, doe, base, doeBase;

async function login(b, login, password, ip) {
  const res = await fetch(`${b}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(ip ? { 'X-Forwarded-For': ip } : {}) }, body: JSON.stringify({ login, password }) });
  return { status: res.status, body: await res.json().catch(() => ({})), retry: res.headers.get('retry-after') };
}
before(async () => {
  await new Promise(r => pf.listen(0, '127.0.0.1', r));
  const pfBase = `http://127.0.0.1:${pf.address().port}`;
  process.env.PIPEFIT_URL = pfBase;
  etudes = require('../etudes/server').server;
  doe = require('../doe/server').server;
  for (const s of [etudes, doe]) await new Promise(r => s.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${etudes.address().port}`;
  doeBase = `http://127.0.0.1:${doe.address().port}`;
  const admin = await fetch(`${pfBase}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', password: 'admin-test-pw' }) });
  const c = (admin.headers.get('set-cookie') || '').split(';')[0];
  for (const l of ['jacky', 'claire', 'paul']) await fetch(`${pfBase}/api/accounts`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: c }, body: JSON.stringify({ login: l, password: 'motdepasse1', role: 'charge', nom: l }) });
});
after(() => { for (const s of [etudes, doe, pf]) { s.close(); s.closeAllConnections(); } fs.rmSync(dir, { recursive: true, force: true }); });

test('temporisation progressive : premiers échecs libres, attente doublée, remise à zéro, oubli', () => {
  let t = 0;
  const T = L.creer({ maintenant: () => t }), j = { login: 'Jacky', ip: '198.51.100.1' };
  for (let i = 0; i < 5; i++) assert.strictEqual(T.echec(j), 0, `échec ${i + 1} libre`);
  assert.strictEqual(T.echec(j), 2);
  assert.strictEqual(T.attente({ login: 'jacky', ip: '198.51.100.2' }), 2, 'identifiant sans tenir compte de la casse, depuis une autre adresse');
  t += 2000; assert.strictEqual(T.attente(j), 0);
  assert.strictEqual(T.echec(j), 4);
  t += 4000; assert.strictEqual(T.echec(j), 8);
  for (let i = 0; i < 20; i++) { t += 900000; T.echec(j); }
  assert.strictEqual(T.attente(j), 900, 'au plus 15 minutes');
  assert.match(T.message(900), /réessayez dans 15 min/);
  assert.match(T.message(8), /réessayez dans 8 s/);
  // Réussite : l'identifiant repart de zéro, l'adresse garde ses échecs
  T.succes(j);
  assert.strictEqual(T.attente({ login: 'jacky', ip: '198.51.100.9' }), 0);
  assert.ok(T.attente({ login: 'autre', ip: '198.51.100.1' }) > 0, 'adresse toujours temporisée');
  // Par adresse : 8 échecs libres sur des identifiants différents, puis attente
  const U = L.creer({ maintenant: () => t }), ip = '198.51.100.7';
  for (let i = 0; i < 8; i++) assert.strictEqual(U.echec({ login: `c${i}`, ip }), 0);
  assert.strictEqual(U.echec({ login: 'c8', ip }), 2);
  assert.ok(U.attente({ login: 'jacky', ip }) > 0);
  // Oubli une heure après le dernier échec
  t += 3600001; assert.strictEqual(U.attente({ login: 'jacky', ip }), 0);
});

test('adresse du client réel : X-Forwarded-For lu derrière un proxy de confiance seulement', () => {
  const req = (remoteAddress, xff) => ({ socket: { remoteAddress }, headers: xff ? { 'x-forwarded-for': xff } : {} });
  const avec = (v, f) => { const a = process.env.TRUST_PROXY; if (v === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = v; try { return f(); } finally { if (a === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = a; } };
  avec(undefined, () => {
    assert.strictEqual(HS.ipClient(req('203.0.113.4', '10.9.9.9')), '203.0.113.4', 'client direct : en-tête ignoré');
    assert.strictEqual(HS.ipClient(req('::ffff:127.0.0.1', '6.6.6.6, 203.0.113.4')), '203.0.113.4', 'proxy local : adresse ajoutée par lui');
    assert.strictEqual(HS.ipClient(req('::ffff:203.0.113.4')), '203.0.113.4');
  });
  avec('10.0.0.2, 10.0.0.3', () => {
    assert.strictEqual(HS.ipClient(req('10.0.0.2', '6.6.6.6, 203.0.113.4, 10.0.0.3')), '203.0.113.4', 'chaîne de proxys de l\'entreprise');
    assert.strictEqual(HS.ipClient(req('10.0.0.9', '6.6.6.6')), '10.0.0.9', 'proxy non listé');
  });
  avec('0', () => assert.strictEqual(HS.ipClient(req('127.0.0.1', '6.6.6.6')), '127.0.0.1', 'aucun proxy de confiance'));
  avec('1', () => assert.strictEqual(HS.ipClient(req('10.9.9.9', '6.6.6.6, 203.0.113.4')), '203.0.113.4'));
});

test('Études : par identifiant — échecs temporisés, message clair, puis connexion permise ; les autres comptes ne sont pas gênés', async () => {
  const ip = '203.0.113.20';
  for (let i = 0; i < 5; i++) { const r = await login(base, 'jacky', 'faux-mot-de-passe', ip); assert.strictEqual(r.status, 401); assert.ok(!r.body.attente); }
  const sixieme = await login(base, 'jacky', 'faux-mot-de-passe', ip);
  assert.strictEqual(sixieme.status, 401);
  assert.match(sixieme.body.error, /incorrect\. Trop de tentatives de connexion : réessayez dans 2 s/);
  // Même avec le bon mot de passe, depuis une autre adresse : attendre
  const bloque = await login(base, 'jacky', 'motdepasse1', '203.0.113.21');
  assert.strictEqual(bloque.status, 429);
  assert.match(bloque.body.error, /Trop de tentatives de connexion : réessayez dans \d s/);
  assert.ok(+bloque.retry >= 1);
  assert.strictEqual((await login(base, 'claire', 'motdepasse1', ip)).status, 200, 'autre compte, même adresse');
  await new Promise(r => setTimeout(r, 2100));
  assert.strictEqual((await login(base, 'jacky', 'motdepasse1', ip)).status, 200);
  // Réussite : remise à zéro de l'identifiant
  assert.strictEqual((await login(base, 'jacky', 'faux-mot-de-passe', ip)).status, 401);
  assert.ok(!(await login(base, 'jacky', 'faux-mot-de-passe', ip)).body.attente);
});

test('Études : par adresse — essais sur plusieurs comptes temporisés pour cette adresse seulement', async () => {
  const ip = '203.0.113.30';
  for (let i = 0; i < 8; i++) assert.strictEqual((await login(base, `inconnu${i}`, 'x', ip)).status, 401);
  const r = await login(base, 'inconnu8', 'x', ip);
  assert.ok(r.body.attente >= 1, JSON.stringify(r.body));
  assert.strictEqual((await login(base, 'paul', 'motdepasse1', ip)).status, 429, 'adresse temporisée, même pour un compte valide');
  assert.strictEqual((await login(base, 'paul', 'motdepasse1', '203.0.113.31')).status, 200, 'autre adresse');
});

test('DOE : même limite', async () => {
  const ip = '203.0.113.40';
  for (let i = 0; i < 5; i++) assert.strictEqual((await login(doeBase, 'claire', 'faux', ip)).status, 401);
  assert.match((await login(doeBase, 'claire', 'faux', ip)).body.error, /réessayez dans 2 s/);
  assert.strictEqual((await login(doeBase, 'claire', 'motdepasse1', ip)).status, 429);
});
