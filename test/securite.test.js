// Sécurité des chantiers : risques du PPSPS, contrôle des habilitations, plans de prévention, FDS ; ce que reçoivent les compagnons.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const S = require('../public/js/securite');

test('risques détectés d\'après les contraintes du chantier', () => {
  const r = S.detecter('Permis de feu obligatoire pour les soudures. Travail dans le rack depuis la nacelle. Réseau vapeur consigné par l\'exploitant.');
  for (const k of ['feu', 'hauteur', 'pression']) assert.ok(r.includes(k), k);
  assert.ok(!r.includes('amiante'));
  assert.ok(S.detecter('Présence d\'AMIANTE dans les calorifuges').includes('amiante'));
  assert.ok(S.detecter('zone ATEX, explosimètre').includes('atex'));
  assert.ok(S.detecter('Remplacement du groupe froid R410A').includes('frigo'));
  assert.deepStrictEqual(S.detecter(''), []);
});

test('habilitations requises par les risques retenus', () => {
  const habs = [
    { userId: 'a', cle: 'visite', expire: '2027-01-01' }, { userId: 'a', cle: 'elec', expire: '2026-10-01' }, { userId: 'a', cle: 'caces_nacelle', expire: '2029-01-01' }, { userId: 'a', cle: 'sst', expire: '2027-05-01' },
    { userId: 'b', cle: 'visite', expire: '2026-09-01' }, { userId: 'b', cle: 'hauteur', expire: '2028-01-01' }, { userId: 'b', cle: 'elec', expire: '2028-01-01' },
  ];
  const [a, b, c] = S.controleIntervenants(['a', 'b', 'c'], habs, ['feu', 'hauteur', 'manutention', 'elec'], '2026-10-18');
  assert.deepStrictEqual([a.manque, a.expirees, a.visite, a.sst], [[], ['elec'], 'ok', true]); // nacelle suffit pour la hauteur
  assert.deepStrictEqual([b.manque, b.expirees, b.visite, b.sst], [[], [], 'expiree', false]);
  assert.deepStrictEqual([c.manque.sort(), c.visite], [['caces_nacelle', 'elec', 'hauteur'], 'absente']);
});

test('plans de prévention annuels, FDS, indices', () => {
  const plans = [{ id: '1', debut: '2025-01-01', fin: '2025-12-31' }, { id: '2', debut: '2026-01-01', fin: '2026-11-10', siteId: 's4' }, { id: '3', debut: '2027-01-01', fin: '2027-12-31' }];
  assert.strictEqual(S.etatPlan(plans[0], '2026-10-18'), 'echu');
  assert.strictEqual(S.etatPlan(plans[1], '2026-10-18'), 'bientot');
  assert.strictEqual(S.etatPlan(plans[2], '2026-10-18'), 'futur');
  assert.strictEqual(S.planApplicable(plans, 's4', '2026-10-18').id, '2');
  assert.strictEqual(S.planApplicable(plans, 's3', '2026-10-18'), null); // plan d'un autre site
  assert.strictEqual(S.planApplicable([{ id: 'x', debut: '2026-01-01', fin: '' }], 's3', '2026-10-18').id, 'x');
  assert.ok(S.fdsAncienne('2022-01-01', '2026-10-18') && S.fdsAncienne('', '2026-10-18') && !S.fdsAncienne('2025-06-01', '2026-10-18'));
  const m = [{ affectation: { userId: 'o1' }, produits: ['p1', 'p2'] }, { affectation: { userId: 'o2' }, produits: ['p2', 'p3'] }, { archive: true, affectation: { userId: 'o1' }, produits: ['p9'] }];
  assert.deepStrictEqual(S.produitsDesPersonnes(['o1'], m), ['p1', 'p2']);
  assert.deepStrictEqual([S.indiceSuivant(''), S.indiceSuivant('A'), S.indiceSuivant('c'), S.indiceSuivant('3')], ['A', 'B', 'D', '4']);
  assert.ok(S.estDocSecurite('PGC') && S.estDocSecurite('Plan de prévention') && !S.estDocSecurite('Plan'));
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-securite-'));
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

test('compagnon : documents de sécurité, plan annuel du client et FDS de son véhicule', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', userId: 'u1' }, admin);
  await call('POST', '/api/accounts', { login: 'kevin', password: 'motdepasse1', role: 'atelier', nom: 'Kevin', userId: 'o1' }, admin);
  const c = (await call('POST', '/api/login', { login: 'claire', password: 'motdepasse1' })).cookie;
  const k = (await call('POST', '/api/login', { login: 'kevin', password: 'motdepasse1' })).cookie;
  let d = (await call('GET', '/api/data', null, k)).body;
  assert.ok(d.produits.length >= 5, 'produits et FDS consultables');
  assert.deepStrictEqual(d.materiels.find(m => m.id === 'pm2').produits, ['pr3', 'pr4', 'pr6']);
  assert.strictEqual(d.entreprises.find(e => e.id === 'e2').plansPrevention.length, 1);
  assert.ok(d.affaires.find(a => a.id === 'af1').securite.risques.feu);
  // Documents masqués aux compagnons : les documents de sécurité cochés restent transmis
  const settings = (await call('GET', '/api/data', null, admin)).body.settings;
  assert.strictEqual((await call('PUT', '/api/settings', { ...settings, compagnon: { documents: false } }, admin)).status, 200);
  d = (await call('GET', '/api/data', null, k)).body;
  assert.deepStrictEqual(d.affaires.find(a => a.id === 'af1').documents.map(x => x.categorie), ['Sécurité / PPSPS']);
  // Le compagnon ne modifie ni les produits ni le PPSPS ; le bureau, si
  assert.strictEqual((await call('PUT', '/api/records/produits/prx', { data: { nom: 'x' } }, k)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/produits/pr7', { data: { nom: 'Mousse PU', pictos: ['GHS02'] } }, c)).status, 200);
  assert.ok((await call('GET', '/api/data', null, k)).body.produits.some(p => p.id === 'pr7'));
});
