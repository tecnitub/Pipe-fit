// Situations de travaux : numérotation par année paramétrable comme les factures, reprise du prochain numéro.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-sit-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const { server } = require('../server/server');

let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });
async function call(method, url, body, cookie) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('numérotation des situations : format paramétrable, suite par année, reprise', async () => {
  const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', password: 'admin-test-pw' }) });
  const admin = (r.headers.get('set-cookie') || '').split(';')[0], an = new Date().getFullYear();
  const etat = (await call('GET', '/api/numerotation', null, admin)).body;
  assert.ok(etat.situation, 'les situations sont dans la numérotation');
  assert.strictEqual(etat.situation.racine, `BL-${an}-`);
  const nouvelle = async id => (await call('PUT', `/api/records/situations/${id}`, { data: { affaireId: 'af1', devisId: 'dv1', statut: 'Brouillon', avancements: {} } }, admin)).body.numero;
  assert.match(await nouvelle('s-a'), new RegExp(`^BL-${an}-\\d{4}$`));

  // Nouveau format « SIT-AAAA-NNN »
  const settings = (await call('GET', '/api/data', null, admin)).body.settings;
  await call('PUT', '/api/settings', { ...settings, numerotation: { ...(settings.numerotation || {}), situation: { prefixe: 'SIT', separateur: '-', annee: 'AAAA', chiffres: 3 } } }, admin);
  assert.strictEqual(await nouvelle('s-b'), `SIT-${an}-001`);
  assert.strictEqual(await nouvelle('s-c'), `SIT-${an}-002`);
  // Reprise : prochain numéro imposé, jamais sous un numéro attribué
  assert.strictEqual((await call('PUT', '/api/numerotation', { cle: 'situation', prochain: 2 }, admin)).status, 400);
  assert.strictEqual((await call('PUT', '/api/numerotation', { cle: 'situation', prochain: 40 }, admin)).body.situation.exemple, `SIT-${an}-040`);
  assert.strictEqual(await nouvelle('s-d'), `SIT-${an}-040`);
  // Les factures gardent leur propre suite
  assert.match((await call('GET', '/api/numerotation', null, admin)).body.facture.racine, new RegExp(`^FA-${an}-$`));
  assert.strictEqual((await call('PUT', '/api/numerotation', { cle: 'inconnue', prochain: 5 }, admin)).status, 400);
});
