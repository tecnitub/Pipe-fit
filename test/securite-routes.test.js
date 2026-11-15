// Revue de sécurité (routes des serveurs CRM et Études) : limites de débit des routes coûteuses, droits des comptes,
// en-têtes des fichiers servis. Chaque correction est d'abord reproduite ici.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-secu-'));
process.env.DB_FILE = path.join(dir, 'pf.db');
process.env.ETUDES_DB_FILE = path.join(dir, 'etudes.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const pf = require('../server/server').server;
let etudes, base, pfBase, admin;

async function call(b, method, url, body, cookie) {
  const res = await fetch(b + url, { method, headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : null, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
before(async () => {
  await new Promise(r => pf.listen(0, '127.0.0.1', r));
  pfBase = `http://127.0.0.1:${pf.address().port}`;
  process.env.PIPEFIT_URL = pfBase;
  etudes = require('../etudes/server').server;
  await new Promise(r => etudes.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${etudes.address().port}`;
  admin = (await call(pfBase, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  for (const [login, role] of [['jacky', 'charge'], ['marc', 'atelier']]) await call(pfBase, 'POST', '/api/accounts', { login, password: 'motdepasse1', role, nom: login }, admin);
});
after(() => { for (const s of [etudes, pf]) { s.close(); s.closeAllConnections(); } fs.rmSync(dir, { recursive: true, force: true }); });

test('lecture d\'un PDF par le serveur (fiches techniques) : débit limité par compte', async () => {
  const j = (await call(pfBase, 'POST', '/api/login', { login: 'jacky', password: 'motdepasse1' })).cookie;
  const statuts = [];
  for (let i = 0; i < 32; i++) statuts.push((await call(pfBase, 'POST', '/api/fiches/analyser', { fichierId: 'inconnu' }, j)).status);
  assert.ok(statuts.slice(0, 30).every(s => s === 400), statuts.join(','));
  assert.strictEqual(statuts[31], 429);
  // Un autre compte n'est pas bloqué
  assert.strictEqual((await call(pfBase, 'POST', '/api/fiches/analyser', { fichierId: 'inconnu' }, admin)).status, 400);
});

test('Études : dépôt de fichiers et lecture des fichiers du chantier limités en débit', async () => {
  const c = (await call(base, 'POST', '/api/login', { login: 'jacky', password: 'motdepasse1' })).cookie;
  const pdf = Buffer.from('%PDF-1.4\n%%EOF').toString('base64');
  let dernier;
  for (let i = 0; i < 61; i++) dernier = (await call(base, 'POST', '/api/fichiers', { nom: `visa-${i}.pdf`, base64: pdf }, c)).status;
  assert.strictEqual(dernier, 429);
  const statuts = [];
  for (let i = 0; i < 121; i++) statuts.push((await call(base, 'GET', '/api/pf/fichier/inconnu', null, c)).status);
  assert.strictEqual(statuts[119], 404);
  assert.strictEqual(statuts[120], 429);
});
