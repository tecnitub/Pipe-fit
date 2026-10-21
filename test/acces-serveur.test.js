// Affichage par accès contrôlé par le serveur : données retirées, lecture seule, champs et réglages retirés, flux temps réel.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const A = require('../public/js/acces');

test('restrictions : collections cachées, en lecture seule, champs et réglages', () => {
  const r = A.restrictions(['factures', 'rh', 'articles', 'direction']);
  assert.deepStrictEqual([[...r.cacher].sort(), [...r.lecture].sort(), r.champs, [...r.reglages].sort()],
    [['factures', 'habilitations'], ['articles', 'familles', 'frais', 'mainoeuvre', 'ouvrages', 'users', 'zones'], { users: ['salaireHoraire'] }, ['compta', 'tresorerie']]);
  assert.strictEqual(A.restrictions(['direction', 'analyse']).vide, true, 'écrans de synthèse : affichage seulement');
  const d = A.filtrerTout(r, { settings: { tva: 20, compta: { x: 1 } }, factures: [{ id: 'f' }], users: [{ id: 'u', salaireHoraire: 15, nom: 'A' }], articles: [{ id: 'a' }] });
  assert.deepStrictEqual(d, { settings: { tva: 20 }, factures: [], users: [{ id: 'u', nom: 'A' }], articles: [{ id: 'a' }] });
  assert.deepStrictEqual([A.ecritureRefusee(r, 'factures'), A.ecritureRefusee(r, 'articles'), A.ecritureRefusee(r, 'devis')], [true, true, false]);
  assert.strictEqual(A.restrictions(['commandes', 'comptoir']).lecture.has('enlevements'), false, 'caché l\'emporte sur lecture seule');
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-acces-'));
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

test('serveur : chargé d\'affaires et compagnon limités, compte personnalisé, administrateur complet, temps réel filtré', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  for (const [login, role, userId] of [['claire', 'charge', 'u1'], ['julien', 'charge', 'u2'], ['kevin', 'atelier', 'o1']]) await call('POST', '/api/accounts', { login, password: 'motdepasse1', role, nom: login, userId }, admin);
  const comptes = (await call('GET', '/api/accounts', null, admin)).body, julienId = comptes.find(c => c.login === 'julien').id;
  const settings = (await call('GET', '/api/data', null, admin)).body.settings;
  await call('PUT', '/api/settings', { ...settings, acces: { roles: { charge: { masques: ['factures', 'rh', 'articles'] }, atelier: { masques: ['pointage/frais'] } }, comptes: { [julienId]: { masques: [] } } } }, admin);
  const [claire, julien, kevin] = await Promise.all(['claire', 'julien', 'kevin'].map(async l => (await call('POST', '/api/login', { login: l, password: 'motdepasse1' })).cookie));
  // Chargée d'affaires : factures et habilitations absentes, salaires retirés, réglages compta et trésorerie retirés
  const d = (await call('GET', '/api/data', null, claire)).body;
  assert.deepStrictEqual([d.factures.length, d.habilitations.length, d.users.some(u => 'salaireHoraire' in u), 'compta' in d.settings, 'tresorerie' in d.settings, d.articles.length > 0], [0, 0, false, false, false, true]);
  assert.strictEqual((await call('GET', '/api/records/factures', null, claire)).status, 403);
  assert.strictEqual((await call('GET', '/api/records/factures/fa0001', null, claire)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/factures/x1', { data: { affaireId: 'af1' } }, claire)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/articles/x2', { data: { designation: 'Test' } }, claire)).status, 403, 'bibliothèque en lecture seule');
  assert.strictEqual((await call('DELETE', '/api/records/articles/a1', null, claire)).status, 403);
  assert.strictEqual((await call('GET', '/api/records/articles/a1', null, claire)).status, 200);
  assert.strictEqual((await call('PUT', '/api/records/devis/x3', { data: { affaireId: 'af1', lignes: [] } }, claire)).status, 200, 'le reste est inchangé');
  assert.strictEqual((await call('POST', '/api/efacture/emettre', { nom: 'x', xml: '<?xml version="1.0"?><x/>' }, claire)).status, 403);
  // Compte personnalisé sans restriction ; administrateur complet
  assert.ok((await call('GET', '/api/data', null, julien)).body.factures.length > 0);
  assert.ok((await call('GET', '/api/data', null, admin)).body.factures.length > 0);
  // Compagnon : notes de frais retirées et refusées
  const k = (await call('GET', '/api/data', null, kevin)).body;
  assert.strictEqual(k.frais.length, 0);
  assert.strictEqual((await call('PUT', '/api/records/frais/nf-k', { data: { userId: 'o1', date: '2026-10-21', montant: 12 } }, kevin)).status, 403);
  // Temps réel : une facture modifiée n'est pas envoyée à Claire, un devis si
  const ctrl = new AbortController(), flux = await fetch(`${base}/api/events`, { headers: { Cookie: claire }, signal: ctrl.signal });
  let recu = '';
  const lecteur = (async () => { const dec = new TextDecoder(); for await (const c of flux.body) recu += dec.decode(c); })().catch(() => {});
  await new Promise(r => setTimeout(r, 200));
  const fa = (await call('GET', '/api/records/factures/fa0001', null, admin)).body;
  await call('PUT', '/api/records/factures/fa0001', { data: { ...fa, relances: [{ niveau: 'note', date: '2026-10-21', libelle: 'appel' }] }, version: fa._v }, admin);
  await call('PUT', '/api/records/devis/x3', { data: { affaireId: 'af1', lignes: [], objet: 'modifié' }, version: 1 }, admin);
  await new Promise(r => setTimeout(r, 300));
  ctrl.abort(); await lecteur;
  assert.doesNotMatch(recu, /"col":"factures"/);
  assert.match(recu, /"col":"devis"/);
});
