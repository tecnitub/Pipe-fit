// Études supprimées : suppression réservée à l'auteur ou à l'administrateur, corbeille avec l'historique de versions,
// restauration, effacement définitif après la durée réglée, migration des études d'avant le suivi des auteurs.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const CE = require('../etudes/public/js/corbeille-etudes');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-corbeille-'));
process.env.DB_FILE = path.join(dir, 'pf.db');
process.env.ETUDES_DB_FILE = path.join(dir, 'etudes.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
// Base Études d'une version précédente : étude sans auteur, dont la première version est de Jacky
{
  const v = new DatabaseSync(process.env.ETUDES_DB_FILE);
  v.exec(`CREATE TABLE etudes (id TEXT PRIMARY KEY, affaire_id TEXT, data TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT, updated_by TEXT);
    CREATE TABLE etudes_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, etude_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, data BLOB NOT NULL, taille INTEGER NOT NULL DEFAULT 0,
      resume TEXT NOT NULL DEFAULT '{}', motif TEXT NOT NULL DEFAULT '', auteur TEXT NOT NULL DEFAULT '', created_at TEXT, updated_at TEXT);`);
  v.prepare('INSERT INTO etudes VALUES (?, ?, ?, 3, ?, ?)').run('vieille', '', JSON.stringify({ objet: 'Ancienne étude', notes: [] }), '2026-01-01T00:00:00Z', 'Claire');
  v.prepare("INSERT INTO etudes_versions (etude_id, version, data, auteur) VALUES ('vieille', 1, x'00', 'Jacky')").run();
  v.close();
}
const pf = require('../server/server').server;
let etudes, base, pfBase, edb;
const C = {};

async function call(b, method, url, body, cookie) {
  const res = await fetch(b + url, { method, headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : null, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
const attendre = async f => { for (let i = 0; i < 60; i++) { const v = await f(); if (v) return v; await new Promise(r => setTimeout(r, 50)); } return f(); };
const etude = (objet, extra = {}) => ({ objet, affaireId: 'af1', indice: 'A', notes: [{ id: 'n1', type: 'debit', titre: 'Débit', entrees: { Q: 1 } }], ...extra });

before(async () => {
  await new Promise(r => pf.listen(0, '127.0.0.1', r));
  pfBase = `http://127.0.0.1:${pf.address().port}`;
  process.env.PIPEFIT_URL = pfBase;
  ({ server: etudes, db: edb } = require('../etudes/server'));
  await new Promise(r => etudes.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${etudes.address().port}`;
  const admin = (await call(pfBase, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  for (const [login, nom] of [['jacky', 'Jacky'], ['claire', 'Claire']]) await call(pfBase, 'POST', '/api/accounts', { login, password: 'motdepasse1', role: 'charge', nom }, admin);
  for (const login of ['jacky', 'claire']) C[login] = (await call(base, 'POST', '/api/login', { login, password: 'motdepasse1' })).cookie;
  C.admin = (await call(base, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  C.pfJacky = (await call(pfBase, 'POST', '/api/login', { login: 'jacky', password: 'motdepasse1' })).cookie;
});
after(() => { for (const s of [etudes, pf]) { s.close(); s.closeAllConnections(); } fs.rmSync(dir, { recursive: true, force: true }); });

test('règles : auteur ou administrateur, durée de conservation, dates de purge', () => {
  assert.ok(CE.peutGerer({ login: 'jacky', nom: 'Jacky' }, { login: 'jacky', nom: 'Jacky', role: 'charge' }));
  assert.ok(!CE.peutGerer({ login: 'jacky', nom: 'Jacky' }, { login: 'claire', nom: 'Jacky', role: 'charge' }), 'même nom, autre compte');
  assert.ok(CE.peutGerer({ login: '', nom: 'Jacky' }, { login: 'x', nom: 'Jacky', role: 'charge' }), 'étude d\'avant : reconnue au nom');
  assert.ok(CE.peutGerer({ login: 'jacky' }, { login: 'admin', role: 'admin' }));
  assert.ok(!CE.peutGerer({}, { login: 'claire', nom: 'Claire', role: 'charge' }));
  assert.strictEqual(CE.jours(undefined), 30);
  assert.strictEqual(CE.jours(0), 30);
  assert.strictEqual(CE.jours(1000), 365);
  assert.deepStrictEqual(CE.aPurger([{ id: 'a', supprimeLe: '2026-01-01T00:00:00.000Z' }, { id: 'b', supprimeLe: '2026-01-25T00:00:00.000Z' }], 30, '2026-02-01T00:00:00.000Z'), ['a']);
});

test('migration : une étude d\'avant le suivi des auteurs reprend l\'auteur de sa première version', async () => {
  assert.strictEqual(edb.prepare("SELECT auteur_nom FROM etudes WHERE id = 'vieille'").get().auteur_nom, 'Jacky');
  assert.strictEqual((await call(base, 'DELETE', '/api/etudes/vieille', {}, C.claire)).status, 403);
  assert.strictEqual((await call(base, 'DELETE', '/api/etudes/vieille', {}, C.jacky)).status, 200);
  assert.strictEqual((await call(base, 'POST', '/api/etudes-supprimees/vieille/restaurer', {}, C.jacky)).status, 200);
});

test('suppression par l\'auteur : corbeille avec les versions, étude retirée de Pipe-Fit, restaurée avec son état', async () => {
  let v = (await call(base, 'PUT', '/api/etudes/e1', { data: etude('Chaufferie'), resume: { objet: 'Chaufferie', avancement: { pct: 40 } } }, C.jacky)).body._v;
  v = (await call(base, 'PUT', '/api/etudes/e1', { data: etude('Chaufferie', { indice: 'B' }), version: v, motif: 'Indice B', resume: { objet: 'Chaufferie', avancement: { pct: 60 } } }, C.jacky)).body._v;
  const liste = (await call(base, 'GET', '/api/etudes', null, C.claire)).body;
  assert.deepStrictEqual([liste.find(x => x.id === 'e1')._auteur, liste.find(x => x.id === 'e1')._auteurLogin], ['Jacky', 'jacky']);
  // Une autre personne du bureau la modifie, sans en devenir l'auteur
  v = (await call(base, 'PUT', '/api/etudes/e1', { data: etude('Chaufferie', { indice: 'C' }), version: v, resume: { objet: 'Chaufferie', avancement: { pct: 70 } } }, C.claire)).body._v;
  const nbVersions = (await call(base, 'GET', '/api/etudes/e1/versions', null, C.jacky)).body.length;
  assert.ok(nbVersions >= 1);
  await attendre(async () => ((await call(pfBase, 'GET', '/api/liens?app=etudes', null, C.pfJacky)).body.find(l => l.id === 'e1') || {}).resume);
  // Pas l'auteur : refusé
  const refus = await call(base, 'DELETE', '/api/etudes/e1', {}, C.claire);
  assert.strictEqual(refus.status, 403);
  assert.match(refus.body.error, /auteur de l'étude ou l'administrateur/);
  // Auteur : dans la corbeille
  const sup = await call(base, 'DELETE', '/api/etudes/e1', {}, C.jacky);
  assert.strictEqual(sup.status, 200);
  assert.ok(sup.body.corbeille && sup.body.purgeLe > new Date().toISOString());
  assert.ok(!(await call(base, 'GET', '/api/etudes', null, C.jacky)).body.some(x => x.id === 'e1'));
  assert.strictEqual((await call(base, 'GET', '/api/etudes/e1', null, C.jacky)).status, 410);
  // Un onglet resté ouvert ne la recrée pas
  assert.strictEqual((await call(base, 'PUT', '/api/etudes/e1', { data: etude('Chaufferie'), version: v }, C.claire)).status, 410);
  assert.strictEqual(edb.prepare("SELECT COUNT(*) AS n FROM etudes_versions WHERE etude_id = 'e1'").get().n, nbVersions, 'versions gardées');
  assert.ok(await attendre(async () => !(await call(pfBase, 'GET', '/api/liens?app=etudes', null, C.pfJacky)).body.some(l => l.id === 'e1')), 'retirée de Pipe-Fit');
  // Liste des études supprimées : tout le bureau la voit, seul l'auteur peut la restaurer
  const vueJ = (await call(base, 'GET', '/api/etudes-supprimees', null, C.jacky)).body, vueC = (await call(base, 'GET', '/api/etudes-supprimees', null, C.claire)).body;
  const x = vueJ.etudes.find(e => e.id === 'e1');
  assert.deepStrictEqual([x.objet, x.auteur, x.supprimePar, x.calculs, x.versions, x.peutRestaurer, vueJ.jours], ['Chaufferie', 'Jacky', 'Jacky', 1, nbVersions, true, 30]);
  assert.strictEqual(vueC.etudes.find(e => e.id === 'e1').peutRestaurer, false);
  assert.strictEqual((await call(base, 'POST', '/api/etudes-supprimees/e1/restaurer', {}, C.claire)).status, 403);
  assert.strictEqual((await call(base, 'DELETE', '/api/etudes-supprimees/e1', {}, C.claire)).status, 403);
  // Restauration : même contenu, version suivante, auteur conservé, versions intactes, de nouveau dans Pipe-Fit avec son état
  const r = await call(base, 'POST', '/api/etudes-supprimees/e1/restaurer', {}, C.jacky);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual([r.body.indice, r.body._v, r.body._auteurLogin], ['C', v + 1, 'jacky']);
  assert.strictEqual((await call(base, 'GET', '/api/etudes/e1/versions', null, C.jacky)).body.length, nbVersions);
  assert.ok(!(await call(base, 'GET', '/api/etudes-supprimees', null, C.jacky)).body.etudes.some(e => e.id === 'e1'));
  const lien = await attendre(async () => (await call(pfBase, 'GET', '/api/liens?app=etudes', null, C.pfJacky)).body.find(l => l.id === 'e1'));
  assert.strictEqual(lien.resume.avancement.pct, 70, 'dernier état transmis avant la suppression');
  assert.strictEqual(lien.affaireId, 'af1');
});

test('administrateur : supprime et restaure l\'étude d\'un autre ; effacement définitif', async () => {
  await call(base, 'PUT', '/api/etudes/e2', { data: etude('Ventilation'), resume: { objet: 'Ventilation' } }, C.claire);
  assert.strictEqual((await call(base, 'DELETE', '/api/etudes/e2', {}, C.jacky)).status, 403);
  assert.strictEqual((await call(base, 'DELETE', '/api/etudes/e2', {}, C.admin)).status, 200);
  assert.strictEqual((await call(base, 'GET', '/api/etudes-supprimees', null, C.admin)).body.etudes.find(e => e.id === 'e2').peutRestaurer, true);
  assert.strictEqual((await call(base, 'POST', '/api/etudes-supprimees/e2/restaurer', {}, C.admin)).status, 200);
  // Effacement définitif par l'auteure : plus rien, versions comprises
  assert.strictEqual((await call(base, 'DELETE', '/api/etudes/e2', {}, C.claire)).status, 200);
  assert.strictEqual((await call(base, 'DELETE', '/api/etudes-supprimees/e2', {}, C.claire)).status, 200);
  assert.strictEqual((await call(base, 'GET', '/api/etudes/e2', null, C.claire)).status, 404);
  assert.strictEqual(edb.prepare("SELECT COUNT(*) AS n FROM etudes_versions WHERE etude_id = 'e2'").get().n, 0);
  assert.strictEqual((await call(base, 'DELETE', '/api/etudes/inconnue', {}, C.admin)).status, 404);
});

test('purge automatique après la durée réglée (Réglages, administrateur)', async () => {
  const purger = require('../etudes/server').purgerCorbeille;
  await call(base, 'PUT', '/api/etudes/e3', { data: etude('Plomberie'), resume: { objet: 'Plomberie' } }, C.jacky);
  await call(base, 'DELETE', '/api/etudes/e3', {}, C.jacky);
  const cfg = (await call(base, 'GET', '/api/config', null, C.admin)).body;
  assert.strictEqual((await call(base, 'PUT', '/api/config', { ...cfg, corbeilleJours: 2 }, C.jacky)).status, 403);
  assert.strictEqual((await call(base, 'PUT', '/api/config', { ...cfg, corbeilleJours: 2 }, C.admin)).body.corbeilleJours, 2);
  assert.strictEqual((await call(base, 'PUT', '/api/config', { ...cfg, corbeilleJours: 5000 }, C.admin)).body.corbeilleJours, 365);
  await call(base, 'PUT', '/api/config', { ...cfg, corbeilleJours: 2 }, C.admin);
  // Supprimée il y a un jour : gardée ; il y a trois jours : effacée avec ses versions
  edb.prepare("UPDATE etudes_supprimees SET supprime_at = ? WHERE id = 'e3'").run(new Date(Date.now() - 86400000).toISOString());
  assert.strictEqual(purger(), 0);
  edb.prepare("UPDATE etudes_supprimees SET supprime_at = ? WHERE id = 'e3'").run(new Date(Date.now() - 3 * 86400000).toISOString());
  assert.strictEqual(purger(), 1);
  assert.strictEqual(edb.prepare("SELECT COUNT(*) AS n FROM etudes_versions WHERE etude_id = 'e3'").get().n, 0);
  assert.strictEqual((await call(base, 'GET', '/api/etudes/e3', null, C.jacky)).status, 404);
  await call(base, 'PUT', '/api/config', { ...cfg }, C.admin);
});
