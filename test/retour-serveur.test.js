// Serveur Pipe-Fit : levée d'une réserve par le compagnon à qui elle est affectée, retour du chantier vers l'étude,
// retour d'expérience des modèles (interventions des contrats d'entretien). Données de démonstration (fictives).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-retour-'));
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

test('réserves : affectée par le bureau, levée par son compagnon seulement (champs de levée), lue par l\'étude', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'kev', password: 'motdepasse1', role: 'atelier', nom: 'Kevin', userId: 'o1' }, admin);
  await call('POST', '/api/accounts', { login: 'luc', password: 'motdepasse1', role: 'atelier', nom: 'Lucas', userId: 'o3' }, admin);
  const kev = (await call('POST', '/api/login', { login: 'kev', password: 'motdepasse1' })).cookie, luc = (await call('POST', '/api/login', { login: 'luc', password: 'motdepasse1' })).cookie;
  const rs = (await call('GET', '/api/records/reserves/rs1', null, admin)).body;
  const origine = { app: 'etudes', etudeId: 'et-fictive', cle: 'obl|n1|detection' };
  const aff = await call('PUT', '/api/records/reserves/rs1', { data: { ...rs, assigneA: 'o1', origine }, version: rs._v }, admin);
  assert.strictEqual(aff.status, 200);
  const r1 = aff.body;
  // Un compagnon ne crée pas de réserve, ne lève pas celle d'un autre, ne change rien d'autre que la levée
  assert.strictEqual((await call('PUT', '/api/records/reserves/rs-x', { data: { affaireId: 'af1', description: 'x', statut: 'Ouverte' } }, kev)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/reserves/rs1', { data: { ...r1, statut: 'Levée', commentaireLevee: 'fait' }, version: r1._v }, luc)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/reserves/rs1', { data: { ...r1, statut: 'Levée' }, version: r1._v }, kev)).status, 403, 'photo ou commentaire requis');
  const lv = await call('PUT', '/api/records/reserves/rs1', { data: { ...r1, statut: 'Levée', dateLevee: '2026-11-10', commentaireLevee: 'Calorifuge posé', description: 'modifiée', assigneA: 'o3' }, version: r1._v }, kev);
  assert.strictEqual(lv.status, 200);
  assert.deepStrictEqual([lv.body.statut, lv.body.commentaireLevee, lv.body.description, lv.body.assigneA, lv.body.leveeParId, lv.body.leveePar], ['Levée', 'Calorifuge posé', rs.description, 'o1', 'o1', 'Kevin']);
  assert.strictEqual((await call('DELETE', '/api/records/reserves/rs1', null, kev)).status, 403);
  // Retour vers l'étude (bureau) : réserve levée, relevés d'équilibrage du chantier
  assert.strictEqual((await call('GET', '/api/liens/retour?affaireId=af1&etudeId=et-fictive', null, kev)).status, 403);
  const rt = (await call('GET', '/api/liens/retour?affaireId=af1&etudeId=et-fictive', null, admin)).body;
  assert.deepStrictEqual(rt.reserves.levees.map(x => [x.cle, x.le]), [['obl|n1|detection', '2026-11-10']]);
  assert.ok(rt.equilibrages.some(e => e.lignes.some(l => l.repere === 'VE-CA-01')));
  // Retour d'expérience : intervention d'un contrat d'entretien
  const a = (await call('GET', '/api/records/affaires/af1', null, admin)).body;
  const contrat = { actif: true, debut: '2026-01-01', dureeMois: 12, carnet: [], visites: [], interventions: [{ id: 'iv1', date: '2026-03-01', type: 'Panne', fabricant: 'Pompix', reference: 'Circa 40-120 F', description: 'Pompe bloquée', pieces: [{ designation: 'Garniture', qte: 1 }] }] };
  assert.strictEqual((await call('PUT', '/api/records/affaires/af1', { data: { ...a, contrat }, version: a._v }, admin)).status, 200);
  const h = (await call('GET', '/api/liens/rex-modeles', null, admin)).body;
  const p = h.find(x => x.reference === 'Circa 40-120 F');
  assert.deepStrictEqual([p.pannes, p.interventions, p.pieces[0].designation], [1, 1, 'Garniture']);
});
