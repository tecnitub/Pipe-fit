// Travail à plusieurs sur une étude (serveur Études) : contrôle de version optimiste (409), présence, versions
// compressées (séance de travail, limites réglables), corbeille des calculs supprimés, migration d'une base existante.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-etudes-v-'));
process.env.DB_FILE = path.join(dir, 'pf.db');
process.env.ETUDES_DB_FILE = path.join(dir, 'etudes.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const pf = require('../server/server').server;
let etudes, edb, base, pfBase;

before(async () => {
  await new Promise(r => pf.listen(0, '127.0.0.1', r));
  pfBase = `http://127.0.0.1:${pf.address().port}`;
  process.env.PIPEFIT_URL = pfBase;
  ({ server: etudes, db: edb } = require('../etudes/server'));
  await new Promise(r => etudes.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${etudes.address().port}`;
  const admin = (await call(pfBase, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  for (const login of ['jacky', 'claire']) await call(pfBase, 'POST', '/api/accounts', { login, password: 'motdepasse1', role: 'charge', nom: login === 'claire' ? 'Claire Martin' : 'Jacky' }, admin);
});
after(() => { for (const s of [etudes, pf]) { s.close(); s.closeAllConnections(); } fs.rmSync(dir, { recursive: true, force: true }); });

async function call(b, method, url, body, cookie) {
  const res = await fetch(b + url, { method, headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : null, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
const connexion = async (login, password = 'motdepasse1') => (await call(base, 'POST', '/api/login', { login, password })).cookie;
const etude = (titre = 'Antenne CTA') => ({ objet: 'Réseau eau glacée', affaireId: '', modele: true, indice: 'A', notes: [{ id: 'n1', type: 'tuyauterie', titre, entrees: { Q: 12 } }, { id: 'n2', type: 'bilan', titre: 'Bilan RDC', entrees: {} }] });

test('deux personnes sur la même étude : le second enregistrement sur une version dépassée est refusé (409) avec la version à jour', async () => {
  const j = await connexion('jacky'), c = await connexion('claire');
  const r1 = await call(base, 'PUT', '/api/etudes/co1', { data: etude() }, j);
  assert.strictEqual(r1.body._v, 1);
  const r2 = await call(base, 'PUT', '/api/etudes/co1', { data: { ...etude(), objet: 'Réseau eau glacée bâtiment B' }, version: 1 }, c);
  assert.deepStrictEqual([r2.status, r2.body._v, r2.body._by], [200, 2, 'Claire Martin']);
  const r3 = await call(base, 'PUT', '/api/etudes/co1', { data: { ...etude(), indice: 'B' }, version: 1 }, j);
  assert.strictEqual(r3.status, 409);
  assert.match(r3.body.error, /Claire Martin/);
  assert.deepStrictEqual([r3.body.record._v, r3.body.record.objet], [2, 'Réseau eau glacée bâtiment B']);
  // Sous-routes : jamais prises pour un enregistrement de l'étude
  assert.strictEqual((await call(base, 'PUT', '/api/etudes/co1/versions', { data: etude(), version: 2 }, j)).status, 404);
  assert.strictEqual((await call(base, 'GET', '/api/etudes/co1/inconnu', null, j)).status, 404);
  assert.strictEqual((await call(base, 'GET', '/api/etudes/co1/versions')).status, 401);
});

test('présence : qui d\'autre a l\'étude ouverte, version enregistrée, départ', async () => {
  const j = await connexion('jacky'), c = await connexion('claire');
  // Claire a enregistré l'étude (test précédent) : elle y est vue ; elle la quitte
  assert.strictEqual((await call(base, 'POST', '/api/etudes/co1/presence', {}, j)).body.autres[0].login, 'claire');
  await call(base, 'POST', '/api/etudes/co1/presence', { quitte: true }, c);
  assert.deepStrictEqual((await call(base, 'POST', '/api/etudes/co1/presence', {}, j)).body.autres, []);
  const r = (await call(base, 'POST', '/api/etudes/co1/presence', {}, c)).body;
  assert.deepStrictEqual(r.autres.map(a => a.nom), ['Jacky']);
  assert.strictEqual(r._v, 2);
  assert.strictEqual((await call(base, 'POST', '/api/etudes/co1/presence', {}, j)).body.autres[0].nom, 'Claire Martin');
  await call(base, 'POST', '/api/etudes/co1/presence', { quitte: true }, j);
  assert.deepStrictEqual((await call(base, 'POST', '/api/etudes/co1/presence', {}, c)).body.autres, []);
  assert.strictEqual((await call(base, 'POST', '/api/etudes/co1/presence', {}, null)).status, 401);
});

test('versions : séance de travail regroupée, autre personne, calcul supprimé à la corbeille, restaurations', async () => {
  const j = await connexion('jacky'), c = await connexion('claire');
  let v = (await call(base, 'PUT', '/api/etudes/co2', { data: etude() }, j)).body._v;
  for (const Q of [13, 14, 15]) { const d = etude(); d.notes[0].entrees.Q = Q; v = (await call(base, 'PUT', '/api/etudes/co2', { data: d, version: v }, j)).body._v; }
  let vs = (await call(base, 'GET', '/api/etudes/co2/versions', null, j)).body;
  assert.strictEqual(vs.length, 1, 'enregistrements rapprochés d\'une même personne : une seule version');
  assert.match(vs[0].texte, /création/);
  // Autre personne : nouvelle version, résumé des changements
  const d2 = etude('Antenne CTA modifiée'); d2.notes[0].entrees.Q = 15; d2.notes.push({ id: 'n3', type: 'ecs', titre: 'ECS', entrees: {} });
  v = (await call(base, 'PUT', '/api/etudes/co2', { data: d2, version: v }, c)).body._v;
  vs = (await call(base, 'GET', '/api/etudes/co2/versions', null, j)).body;
  assert.strictEqual(vs.length, 2);
  assert.deepStrictEqual([vs[0].auteur, vs[0].resume.notesAjoutees, vs[0].resume.notesModifiees], ['Claire Martin', ['ECS'], ['Antenne CTA modifiée']]);
  // Calcul supprimé (même personne, même séance) : nouvelle version et corbeille
  const d3 = JSON.parse(JSON.stringify(d2)); d3.notes = d3.notes.filter(n => n.id !== 'n2');
  v = (await call(base, 'PUT', '/api/etudes/co2', { data: d3, version: v }, c)).body._v;
  vs = (await call(base, 'GET', '/api/etudes/co2/versions', null, j)).body;
  assert.strictEqual(vs.length, 3);
  assert.deepStrictEqual(vs[0].resume.notesSupprimees, ['Bilan RDC']);
  const cb = (await call(base, 'GET', '/api/etudes/co2/corbeille', null, j)).body;
  assert.deepStrictEqual(cb.map(x => [x.noteId, x.titre, x.par]), [['n2', 'Bilan RDC', 'Claire Martin']]);
  const el = (await call(base, 'GET', `/api/etudes/co2/corbeille/${cb[0].id}`, null, j)).body;
  assert.strictEqual(el.note.type, 'bilan');
  // Aperçu d'une version : données complètes (décompressées) ; stockage compressé
  const premiere = (await call(base, 'GET', `/api/etudes/co2/versions/${vs[2].id}`, null, j)).body;
  assert.deepStrictEqual(premiere.data.notes.map(n => n.entrees.Q), [15, undefined]);
  const brut = edb.prepare('SELECT data FROM etudes_versions WHERE id = ?').get(vs[2].id).data;
  assert.deepStrictEqual([...Buffer.from(brut).subarray(0, 2)], [0x1f, 0x8b], 'version compressée (gzip)');
  assert.strictEqual((await call(base, 'GET', '/api/etudes/co2/versions/99999', null, j)).status, 404);
  assert.strictEqual((await call(base, 'GET', '/api/etudes/co1/versions/' + vs[2].id, null, j)).status, 404, 'version d\'une autre étude');
  // Restauration : enregistrement ordinaire avec un motif, nouvelle version, rien n'est perdu
  v = (await call(base, 'PUT', '/api/etudes/co2', { data: premiere.data, version: v, motif: 'Restauration de la version du 15/11/2026' }, j)).body._v;
  vs = (await call(base, 'GET', '/api/etudes/co2/versions', null, j)).body;
  assert.strictEqual(vs.length, 4);
  assert.strictEqual(vs[0].motif, 'Restauration de la version du 15/11/2026');
  assert.deepStrictEqual(vs[0].resume.notesSupprimees, ['ECS']);
  // Calcul revenu dans l'étude : sorti de la corbeille ; ECS y entre
  assert.deepStrictEqual((await call(base, 'GET', '/api/etudes/co2/corbeille', null, j)).body.map(x => x.noteId), ['n3']);
  // Suppression de l'étude : historique retiré
  await call(base, 'DELETE', '/api/etudes/co2', {}, j);
  assert.strictEqual(edb.prepare("SELECT COUNT(*) AS n FROM etudes_versions WHERE etude_id = 'co2'").get().n, 0);
});

test('limites réglables (Réglages, administrateur) et étude enregistrée avant le suivi des versions', async () => {
  const admin = await connexion('admin', 'admin-test-pw'), j = await connexion('jacky');
  const cfg = (await call(base, 'GET', '/api/config', null, admin)).body;
  assert.strictEqual((await call(base, 'PUT', '/api/config', { ...cfg, versions: { max: 2, intervalleMin: 0 } }, j)).status, 403);
  assert.strictEqual((await call(base, 'PUT', '/api/config', { ...cfg, versions: { max: 2, intervalleMin: 0 } }, admin)).status, 200);
  // Base d'une version précédente : étude sans historique
  edb.prepare('INSERT INTO etudes (id, affaire_id, data, version, updated_at, updated_by) VALUES (?, ?, ?, 7, ?, ?)').run('ancienne', '', JSON.stringify(etude('Ancien titre')), '2026-01-01T00:00:00Z', 'Ancien');
  let v = 7;
  for (const t of ['T1', 'T2', 'T3']) v = (await call(base, 'PUT', '/api/etudes/ancienne', { data: etude(t), version: v }, j)).body._v;
  const vs = (await call(base, 'GET', '/api/etudes/ancienne/versions', null, j)).body;
  assert.strictEqual(vs.length, 2, 'au plus 2 versions');
  assert.deepStrictEqual(vs.map(x => x.version), [10, 9]);
  await call(base, 'PUT', '/api/etudes/ancienne', { data: etude('T4'), version: v }, j);
  edb.prepare('DELETE FROM etudes_versions').run();
  // Premier enregistrement après la mise à jour : l'état précédent devient la première version
  await call(base, 'PUT', '/api/config', { ...cfg, versions: {} }, admin);
  const r = (await call(base, 'GET', '/api/etudes/ancienne', null, j)).body;
  await call(base, 'PUT', '/api/etudes/ancienne', { data: etude('T5'), version: r._v }, j);
  const vs2 = (await call(base, 'GET', '/api/etudes/ancienne/versions', null, j)).body;
  assert.deepStrictEqual(vs2.map(x => x.motif), ['', 'État avant le suivi des versions']);
});

test('modules du travail à plusieurs servis par les serveurs Études et DOE', async () => {
  for (const f of ['/js/collaboration.js', '/js/versions-etude.js', '/shared/fusion-etude.js']) {
    const r = await fetch(base + f);
    assert.strictEqual(r.status, 200, f);
    assert.match(r.headers.get('content-type'), /javascript/);
  }
  process.env.DOE_DB_FILE = path.join(dir, 'doe.db');
  const doe = require('../doe/server').server;
  await new Promise(r => doe.listen(0, '127.0.0.1', r));
  try { assert.strictEqual((await fetch(`http://127.0.0.1:${doe.address().port}/shared/fusion-etude.js`)).status, 200); }
  finally { doe.close(); doe.closeAllConnections(); }
});
