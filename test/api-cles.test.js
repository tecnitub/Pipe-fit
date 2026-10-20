// API d'automatisation : clés personnelles, lectures filtrées, webhooks signés, description OpenAPI.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-api-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const { server } = require('../server/server');

let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });

async function call(method, url, body, { cookie, cle } = {}) {
  const res = await fetch(base + url, { method, headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(cle ? { Authorization: `Bearer ${cle}` } : {}) },
    body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function login(l, p) { const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: l, password: p }) }); return (r.headers.get('set-cookie') || '').split(';')[0]; }

test('clés d\'API, lectures filtrées, webhooks signés', async () => {
  const admin = await login('admin', 'admin-test-pw');
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire' }, { cookie: admin });
  await call('POST', '/api/accounts', { login: 'op', password: 'motdepasse2', role: 'atelier', nom: 'Op', userId: 'o1' }, { cookie: admin });
  const claire = await login('claire', 'motdepasse1'), op = await login('op', 'motdepasse2');

  // Description OpenAPI publique (import d'un connecteur)
  const spec = await call('GET', '/api/openapi.json');
  assert.strictEqual(spec.status, 200); assert.strictEqual(spec.body.openapi, '3.0.3'); assert.ok(spec.body.paths['/api/records/{collection}']);

  // Clé personnelle : affichée une fois, utilisable en Bearer, jamais stockée en clair
  const k = (await call('POST', '/api/cles', { nom: 'Power Automate' }, { cookie: claire })).body;
  assert.match(k.cle, /^pf_[A-Za-z0-9_-]{32}$/);
  assert.strictEqual((await call('GET', '/api/me', null, { cle: 'pf_' + 'x'.repeat(32) })).status, 401);
  const me = await call('GET', '/api/me', null, { cle: k.cle });
  assert.strictEqual(me.status, 200); assert.strictEqual(me.body.login, 'claire');
  const liste = (await call('GET', '/api/cles', null, { cookie: claire })).body;
  assert.strictEqual(liste.length, 1); assert.ok(!JSON.stringify(liste).includes(k.cle)); assert.ok(liste[0].utiliseeLe);
  assert.strictEqual((await call('POST', '/api/cles', { nom: 'x' }, { cle: k.cle })).status, 403);

  // Lectures : liste filtrée, élément, modifiés depuis une date
  const emises = (await call('GET', '/api/records/factures?filtre=statut:Émise', null, { cle: k.cle })).body;
  assert.ok(emises.length >= 1 && emises.every(f => f.statut === 'Émise'));
  assert.strictEqual((await call('GET', '/api/records/affaires/af1', null, { cle: k.cle })).body.id, 'af1');
  assert.strictEqual((await call('GET', '/api/records/inconnue', null, { cle: k.cle })).status, 404);
  const avant = new Date().toISOString();
  assert.strictEqual((await call('GET', `/api/records/contacts?modifieDepuis=${avant}`, null, { cle: k.cle })).body.length, 0);

  // Webhook : réception signée à chaque création de contact
  const recus = [];
  const cible = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { recus.push({ corps: b, sig: req.headers['x-pipefit-signature'] }); res.writeHead(204); res.end(); }); });
  await new Promise(r => cible.listen(0, '127.0.0.1', r));
  try {
    assert.strictEqual((await call('PUT', '/api/webhooks', { liste: [] }, { cookie: claire })).status, 403);
    assert.strictEqual((await call('PUT', '/api/webhooks', { liste: [{ nom: 'x', url: 'ftp://x', collections: ['*'], actif: true }] }, { cookie: admin })).status, 400);
    const hooks = (await call('PUT', '/api/webhooks', { liste: [{ nom: 'Automate', url: `http://127.0.0.1:${cible.address().port}/flux`, collections: ['contacts'], actif: true }] }, { cookie: admin })).body;
    assert.match(hooks[0].secret, /^[0-9a-f]{40}$/);
    // Création par l'API avec la clé (droits du chargé d'affaires)
    const c = await call('PUT', '/api/records/contacts/k-api', { data: { prenom: 'Léa', nom: 'Martin', entrepriseId: 'e1' } }, { cle: k.cle });
    assert.strictEqual(c.status, 200);
    await call('PUT', '/api/records/articles/a1', { data: { ref: 'X' } }, { cle: k.cle }).catch(() => {}); // autre liste : pas de webhook
    for (let i = 0; i < 50 && !recus.length; i++) await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(recus.length, 1);
    const evt = JSON.parse(recus[0].corps);
    assert.strictEqual(evt.evenement, 'contacts.creation'); assert.strictEqual(evt.donnees.nom, 'Martin');
    assert.strictEqual(recus[0].sig, 'sha256=' + crypto.createHmac('sha256', hooks[0].secret).update(recus[0].corps).digest('hex'));
    assert.strictEqual((await call('GET', `/api/records/contacts?modifieDepuis=${avant}`, null, { cle: k.cle })).body.length, 1);
    const t = await call('POST', `/api/webhooks/${hooks[0].id}/test`, {}, { cookie: admin });
    assert.strictEqual(t.body.statut, 204);
  } finally { cible.close(); }

  // La clé d'un opérateur garde ses droits limités ; révocation immédiate
  const ko = (await call('POST', '/api/cles', { nom: 'badgeuse' }, { cookie: op })).body;
  assert.strictEqual((await call('PUT', '/api/records/entreprises/e-x', { data: { nom: 'X' } }, { cle: ko.cle })).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/temps/t-badge', { data: { userId: 'o1', affaireId: 'af1', date: new Date().toISOString().slice(0, 10), heures: 8 } }, { cle: ko.cle })).status, 200);
  assert.strictEqual((await call('GET', '/api/cles', null, { cookie: admin })).body.length, 2);
  assert.strictEqual((await call('DELETE', `/api/cles/${ko.id}`, {}, { cookie: claire })).status, 404);
  assert.strictEqual((await call('DELETE', `/api/cles/${k.id}`, {}, { cookie: claire })).status, 200);
  assert.strictEqual((await call('GET', '/api/me', null, { cle: k.cle })).status, 401);
});
