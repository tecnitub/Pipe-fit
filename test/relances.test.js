// Relances des factures impayées et libération des retenues de garantie.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const R = require('../public/js/relances');
const F = (echeance, relances = []) => ({ echeance, relances });

test('prochaine relance selon le retard et les relances déjà faites', () => {
  const auj = '2026-10-18';
  assert.deepStrictEqual(R.etat(F('2026-10-18'), auj, {}).du, false); // échéance aujourd'hui
  let e = R.etat(F('2026-10-17'), auj, {});
  assert.deepStrictEqual([e.retard, e.prochaine.cle, e.le, e.du], [1, 'relance1', '2026-10-18', true]);
  // 1re relance faite il y a 3 jours : la 2e attend J+15
  e = R.etat(F('2026-10-01', [{ niveau: 'relance1', date: '2026-10-15' }, { niveau: 'note', date: '2026-10-16' }]), auj, {});
  assert.deepStrictEqual([e.retard, e.prochaine.cle, e.le, e.du], [17, 'relance2', '2026-10-22', false]); // 7 jours après la relance 1
  // Très en retard mais aucune relance : on commence par le rappel, pas par la mise en demeure
  assert.strictEqual(R.etat(F('2026-06-01'), auj, {}).prochaine.cle, 'relance1');
  e = R.etat(F('2026-06-01', [['relance1', '2026-07-01'], ['relance2', '2026-08-01'], ['relance3', '2026-09-01'], ['demeure', '2026-10-01']].map(([niveau, date]) => ({ niveau, date }))), auj, {});
  assert.deepStrictEqual([e.prochaine, e.epuise], [null, true]);
  // Délais réglés dans les paramètres
  assert.strictEqual(R.etat(F('2026-10-15'), auj, { relances: { relance1: 5 } }).du, false);
});

test('retenue de garantie libérable un an après la réception', () => {
  assert.deepStrictEqual(R.retenue({ dateReception: '2025-10-10' }, 500, '2026-10-18'), { etat: 'liberable', le: '2026-10-10', dans: -8 });
  assert.strictEqual(R.retenue({ dateReception: '2026-09-24' }, 500, '2026-10-18').etat, 'a-venir');
  assert.strictEqual(R.retenue({}, 500, '2026-10-18').etat, 'sans-reception');
  assert.strictEqual(R.retenue({ dateReception: '2025-01-01', retenueLiberee: '2026-02-01' }, 500, '2026-10-18'), null);
  assert.strictEqual(R.retenue({ caution: true }, 500, '2026-10-18'), null);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-relances-'));
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
test('un chargé d\'affaires note les relances sur une facture émise, sans pouvoir la modifier', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', userId: 'u1' }, admin);
  const c = (await call('POST', '/api/login', { login: 'claire', password: 'motdepasse1' })).cookie;
  const f = (await call('GET', '/api/data', null, c)).body.factures.find(x => x.id === 'fa0002');
  assert.ok(f.relances.length >= 1);
  const r = await call('PUT', '/api/records/factures/fa0002', { data: { ...f, relances: [...f.relances, { niveau: 'relance2', date: '2026-10-18', par: 'Claire' }], lignes: [], objet: 'modifié' }, version: f._v }, c);
  assert.strictEqual(r.status, 200);
  const apres = (await call('GET', '/api/data', null, c)).body.factures.find(x => x.id === 'fa0002');
  assert.strictEqual(apres.relances[apres.relances.length - 1].niveau, 'relance2');
  assert.strictEqual(apres.objet, f.objet); // le contenu de la facture reste figé
  assert.strictEqual(apres.lignes.length, f.lignes.length);
});
