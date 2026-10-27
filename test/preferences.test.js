// Préférences d'affichage propres à chaque compte (colonnes des tableaux), retrouvées sur tous ses appareils.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-prefs-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const { server } = require('../server/server');
let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};

test('colonnes des tableaux : enregistrées pour le compte, propres à chacun, taille bornée', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', userId: 'u1' }, admin);
  const claire = (await call('POST', '/api/login', { login: 'claire', password: 'motdepasse1' })).cookie;
  assert.deepStrictEqual((await call('GET', '/api/me', null, claire)).body.prefs, {});
  const prefs = { colonnes: { devis: { cachees: ['pu-mo', 'marge'], largeurs: { objet: 320 } } } };
  assert.strictEqual((await call('PUT', '/api/me/preferences', prefs, claire)).status, 200);
  assert.deepStrictEqual((await call('GET', '/api/me', null, claire)).body.prefs, prefs, 'retrouvées à la connexion suivante');
  assert.deepStrictEqual((await call('GET', '/api/me', null, admin)).body.prefs, {}, 'les réglages de Claire ne touchent pas les autres comptes');
  assert.strictEqual((await call('PUT', '/api/me/preferences', { x: 'a'.repeat(60000) }, claire)).status, 400);
  assert.strictEqual((await call('PUT', '/api/me/preferences', prefs)).status, 401, 'connexion requise');
});
