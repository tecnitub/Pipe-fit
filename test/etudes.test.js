// Tests de l'application Études : connexion par Pipe-Fit, droits, affaires, études versionnées, réglages.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-etudes-'));
process.env.DB_FILE = path.join(dir, 'pf.db');
process.env.ETUDES_DB_FILE = path.join(dir, 'etudes.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const pf = require('../server/server').server;
let etudes, base, pfBase;

before(async () => {
  await new Promise(r => pf.listen(0, '127.0.0.1', r));
  pfBase = `http://127.0.0.1:${pf.address().port}`;
  process.env.PIPEFIT_URL = pfBase; // lu au chargement du serveur Études
  etudes = require('../etudes/server').server;
  await new Promise(r => etudes.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${etudes.address().port}`;
});
after(() => { for (const s of [etudes, pf]) { s.close(); s.closeAllConnections(); } fs.rmSync(dir, { recursive: true, force: true }); });

async function call(b, method, url, body, cookie, headers = {}) {
  const res = await fetch(b + url, {
    method,
    headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, type, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
const connexion = async login => (await call(base, 'POST', '/api/login', { login, password: 'motdepasse1' })).cookie;

test('connexion avec le compte Pipe-Fit, réservée au bureau', async () => {
  const admin = (await call(pfBase, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  for (const [login, role] of [['jacky', 'charge'], ['marc', 'atelier']])
    assert.strictEqual((await call(pfBase, 'POST', '/api/accounts', { login, password: 'motdepasse1', role, nom: login }, admin)).status, 200);
  assert.strictEqual((await call(base, 'GET', '/api/etudes')).status, 401);
  assert.strictEqual((await call(base, 'POST', '/api/login', { login: 'jacky', password: 'faux' })).status, 401);
  assert.strictEqual((await call(base, 'POST', '/api/login', { login: 'marc', password: 'motdepasse1' })).status, 403);
  const c = await connexion('jacky');
  assert.match(c, /^etudes_sid=/);
  assert.strictEqual((await call(base, 'GET', '/api/me', null, c)).body.role, 'charge');
});

test('affaires de Pipe-Fit : seules les informations utiles sont transmises', async () => {
  const c = await connexion('jacky');
  const d = (await call(base, 'GET', '/api/pf/affaires', null, c)).body;
  assert.ok(d.affaires.length && d.entreprises.length);
  assert.ok(Object.keys(d.affaires[0]).every(k => ['clientId', 'code', 'id', 'nom', 'statut', 'type'].includes(k)) && d.affaires[0].id);
  assert.deepStrictEqual(Object.keys(d.entreprises[0]).sort(), ['id', 'nom']);
});

test('études versionnées : création, conflit, suppression', async () => {
  const c = await connexion('jacky');
  const etude = { objet: 'Réseau eau glacée CTA', affaireId: 'af1', indice: 'A', notes: [{ id: 'n1', type: 'tuyauterie', titre: 'Antenne CTA', entrees: { Q: 12 } }] };
  assert.strictEqual((await call(base, 'PUT', '/api/etudes/e1', { data: { ...etude, objet: ' ' } }, c)).status, 400);
  assert.strictEqual((await call(base, 'PUT', '/api/etudes/e1', { data: { objet: 'x' } }, c)).status, 400);
  assert.strictEqual((await call(base, 'PUT', '/api/etudes/../x', { data: etude }, c)).status, 404);
  const r1 = await call(base, 'PUT', '/api/etudes/e1', { data: { ...etude, _v: 99, id: 'autre' } }, c);
  assert.strictEqual(r1.status, 200);
  assert.deepStrictEqual([r1.body.id, r1.body._v, r1.body._by], ['e1', 1, 'jacky']);
  const r2 = await call(base, 'PUT', '/api/etudes/e1', { data: { ...etude, indice: 'B' }, version: 1 }, c);
  assert.strictEqual(r2.body._v, 2);
  const conflit = await call(base, 'PUT', '/api/etudes/e1', { data: { ...etude, indice: 'C' }, version: 1 }, c);
  assert.strictEqual(conflit.status, 409);
  assert.strictEqual(conflit.body.record.indice, 'B');
  const liste = (await call(base, 'GET', '/api/etudes', null, c)).body;
  assert.strictEqual(liste.length, 1);
  assert.strictEqual(liste[0].notes[0].entrees.Q, 12);
  assert.strictEqual((await call(base, 'DELETE', '/api/etudes/e1', null, c)).status, 200);
  assert.strictEqual((await call(base, 'GET', '/api/etudes/e1', null, c)).status, 404);
});

test('protections : JSON obligatoire, origine contrôlée, réglages réservés à l\'administrateur', async () => {
  const c = await connexion('jacky');
  const r = await fetch(`${base}/api/etudes/e2`, { method: 'PUT', headers: { Cookie: c, 'Content-Type': 'text/plain' }, body: '{}' });
  assert.strictEqual(r.status, 415);
  assert.strictEqual((await call(base, 'PUT', '/api/etudes/e2', { data: {} }, c, { Origin: 'https://malveillant.example' })).status, 403);
  assert.strictEqual((await call(base, 'PUT', '/api/config', { couleur: '#000000' }, c)).status, 403);
  const admin = (await call(base, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  const cfg = await call(base, 'PUT', '/api/config', { societe: { raison: 'TECNITUB BE' } }, admin);
  assert.strictEqual(cfg.body.societe.raison, 'TECNITUB BE');
  assert.ok(cfg.body.societe.adresse, 'les autres champs sont conservés');
  assert.strictEqual((await call(base, 'POST', '/api/logout', {}, c)).status, 200);
  assert.strictEqual((await call(base, 'GET', '/api/etudes', null, c)).status, 401);
});

test('fichiers statiques et modules partagés', async () => {
  for (const [u, type] of [['/', 'text/html'], ['/js/calculs.js', 'javascript'], ['/shared/pdf.js', 'javascript'], ['/shared/pdf-lib.min.js', 'javascript'], ['/shared/doe.css', 'text/css'], ['/logo-tecnitub.png', 'image/png']]) {
    const r = await fetch(base + u);
    assert.strictEqual(r.status, 200, u);
    assert.ok((r.headers.get('content-type') || '').includes(type), u);
  }
  assert.strictEqual((await fetch(`${base}/..%2fserver.js`)).status, 403);
});
