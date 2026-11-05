// Lien Atelier PDF ↔ Pipe-Fit : page locale (origine « null ») avec une clé d'API, documents des chantiers
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-atelier-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const { server } = require('../server/server');

let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });

test('page locale : préflight, accès par clé seulement, envoi d\'un document et nouvel indice', async () => {
  const r0 = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', password: 'admin-test-pw' }) });
  const admin = (r0.headers.get('set-cookie') || '').split(';')[0];
  const cle = (await (await fetch(base + '/api/cles', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: admin }, body: JSON.stringify({ nom: 'Atelier PDF' }) })).json()).cle;
  const H = { Origin: 'null', Authorization: `Bearer ${cle}` };

  // Préflight du navigateur
  const pre = await fetch(base + '/api/records/affaires', { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  assert.strictEqual(pre.status, 204);
  assert.strictEqual(pre.headers.get('access-control-allow-origin'), 'null');
  assert.match(pre.headers.get('access-control-allow-headers'), /X-Filename/);

  // Sans clé (même avec le cookie de session) : refusé ; avec la clé : réponse lisible
  assert.strictEqual((await fetch(base + '/api/records/affaires', { headers: { Origin: 'null', Cookie: admin } })).status, 403);
  assert.strictEqual((await fetch(base + '/api/records/affaires', { method: 'PUT', headers: { Origin: 'null', Cookie: admin, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  const liste = await fetch(base + '/api/records/affaires?limite=5', { headers: H });
  assert.strictEqual(liste.status, 200);
  assert.strictEqual(liste.headers.get('access-control-allow-origin'), 'null');
  const affaire = (await liste.json())[0];
  assert.ok(affaire && affaire.id);

  // Envoi du PDF, ajout au chantier, puis nouvel indice
  const pdf = Buffer.from('%PDF-1.4\n%test\n');
  const envoi = await (await fetch(base + '/api/documents/fichier', { method: 'POST', headers: { ...H, 'X-PipeFit-Upload': '1', 'X-Filename': encodeURIComponent('Plan annoté.pdf') }, body: pdf })).json();
  assert.ok(envoi.id);
  const doc = { id: 'docatelier1', fichierId: envoi.id, nom: 'Plan annoté.pdf', categorie: 'Plan', indice: 'A', mime: envoi.mime, taille: envoi.taille, date: '2026-11-05', par: 'Atelier PDF', visible: false };
  const put = await fetch(base + `/api/records/affaires/${affaire.id}`, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { ...affaire, documents: [...(affaire.documents || []), doc] }, version: affaire._v }) });
  assert.strictEqual(put.status, 200);
  const relu = await (await fetch(base + `/api/records/affaires/${affaire.id}`, { headers: H })).json();
  assert.ok(relu.documents.some(d => d.id === 'docatelier1'));
  const fichier = await fetch(base + `/api/files/${envoi.id}`, { headers: H });
  assert.strictEqual(fichier.status, 200);
  assert.deepStrictEqual(Buffer.from(await fichier.arrayBuffer()), pdf);
});
