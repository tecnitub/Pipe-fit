// Fichiers lus par identifiant (/api/files du CRM, /api/fichiers et /api/pf/fichier des Études) : droit au chantier ou à
// l'objet auquel le fichier est rattaché. Bureau et administrateur : accès ; compagnon : fichiers de ce qu'il voit (son
// périmètre de chantiers) ou qu'il a déposés ; fichier sans rattachement : bureau, administrateur ou déposant.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-fichiers-'));
process.env.DB_FILE = path.join(dir, 'pf.db');
process.env.ETUDES_DB_FILE = path.join(dir, 'etudes.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
process.env.SEED_DEMO = '0';
const pf = require('../server/server').server;
let etudes, base, pfBase;
const C = {}, F = {};
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function call(b, method, url, body, cookie, headers = {}) {
  const raw = Buffer.isBuffer(body);
  const res = await fetch(b + url, { method, headers: { ...(method !== 'GET' && !raw ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: method === 'GET' ? undefined : raw ? body : JSON.stringify(body || {}) });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : null, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
const jour = new Date().toISOString().slice(0, 10);
const ecrire = async (col, data) => {
  const ex = await call(pfBase, 'GET', `/api/records/${col}/${data.id}`, null, C.admin);
  const r = await call(pfBase, 'PUT', `/api/records/${col}/${data.id}`, { data, version: ex.status === 200 ? ex.body._v : undefined }, C.admin);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  return r.body;
};
const lire = (id, c) => call(pfBase, 'GET', `/api/files/${id}`, null, c).then(r => r.status);
const document = async nom => (await call(pfBase, 'POST', '/api/documents/fichier', Buffer.from('%PDF-1.4\n%%EOF'), C.jacky, { 'X-PipeFit-Upload': '1', 'X-Filename': encodeURIComponent(nom), 'Content-Type': 'application/pdf' })).body.id;
const photo = async c => (await call(pfBase, 'POST', '/api/files', { dataUrl: PNG }, c)).body.id;

before(async () => {
  await new Promise(r => pf.listen(0, '127.0.0.1', r));
  pfBase = `http://127.0.0.1:${pf.address().port}`;
  process.env.PIPEFIT_URL = pfBase;
  etudes = require('../etudes/server').server;
  await new Promise(r => etudes.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${etudes.address().port}`;
  C.admin = (await call(pfBase, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  for (const u of [{ id: 'k', nom: 'Kevin', role: 'atelier' }, { id: 'z', nom: 'Zoé', role: 'atelier' }, { id: 'c1', nom: 'Jacky', role: 'charge' }]) await ecrire('users', u);
  for (const [login, role, userId, nom] of [['kevin', 'atelier', 'k', 'Kevin'], ['zoe', 'atelier', 'z', 'Zoé'], ['jacky', 'charge', 'c1', 'Jacky'], ['claire', 'charge', '', 'Claire']]) {
    assert.strictEqual((await call(pfBase, 'POST', '/api/accounts', { login, password: 'motdepasse1', role, nom, userId }, C.admin)).status, 200);
    C[login] = (await call(pfBase, 'POST', '/api/login', { login, password: 'motdepasse1' })).cookie;
  }
  // Documents des chantiers : A1 (Kevin au planning), A3 (Zoé au planning)
  F.planA1 = await document('Plan A1.pdf'); F.noteA1 = await document('Note bureau A1.pdf'); F.planA3 = await document('Plan A3.pdf'); F.libre = await document('Sans rattachement.pdf');
  await ecrire('affaires', { id: 'A1', code: 'CH-1', nom: 'Chantier 1', statut: 'En cours', documents: [{ id: 'd1', fichierId: F.planA1, nom: 'Plan A1.pdf', categorie: 'Plan', visible: true }, { id: 'd2', fichierId: F.noteA1, nom: 'Note.pdf', categorie: 'Autre', visible: false }] });
  await ecrire('affaires', { id: 'A3', code: 'CH-3', nom: 'Chantier 3', statut: 'En cours', documents: [{ id: 'd3', fichierId: F.planA3, nom: 'Plan A3.pdf', categorie: 'Plan', visible: true }] });
  for (const [id, userId, affaireId] of [['p1', 'k', 'A1'], ['p3', 'z', 'A3']]) await ecrire('planning', { id, userId, affaireId, date: jour, heuresPrevues: 8 });
  // Photo du bon d'intervention de Zoé sur A3, photo de Kevin pas encore rattachée
  F.photoZoe = await photo(C.zoe); F.photoKevin = await photo(C.kevin);
  assert.strictEqual((await call(pfBase, 'PUT', '/api/records/rapports/r3', { data: { id: 'r3', affaireId: 'A3', userId: 'z', date: jour, intervenants: ['z'], photos: [F.photoZoe] } }, C.zoe)).status, 200);
  // Photo de la plaque d'un équipement d'une étude de A1 (suivi du matériel)
  F.plaque = await photo(C.jacky);
  await call(pfBase, 'PUT', '/api/liens/etudes/et1', { affaireId: 'A1', resume: { objet: 'Étude', materiel: [{ cle: 'pac', designation: 'PAC', qte: 1, fabricant: 'X', reference: 'Y', statut: 'Validé' }] } }, C.jacky);
  assert.strictEqual((await call(pfBase, 'POST', '/api/liens/materiel/suivi', { affaireId: 'A1', action: 'photo', etudeId: 'et1', cle: 'pac', fichierId: F.plaque }, C.jacky)).status, 200);
});
after(() => { for (const s of [etudes, pf]) { s.close(); s.closeAllConnections(); } fs.rmSync(dir, { recursive: true, force: true }); });

test('CRM : le bureau et l\'administrateur ouvrent tous les fichiers', async () => {
  for (const id of Object.values(F)) { assert.strictEqual(await lire(id, C.jacky), 200, id); assert.strictEqual(await lire(id, C.admin), 200, id); }
});

test('CRM : un compagnon n\'ouvre que les fichiers de son périmètre ou qu\'il a déposés', async () => {
  assert.strictEqual(await lire(F.planA1, C.kevin), 200, 'document transmis de son chantier');
  assert.strictEqual(await lire(F.plaque, C.kevin), 200, 'photo du suivi du matériel de son chantier');
  assert.strictEqual(await lire(F.photoKevin, C.kevin), 200, 'sa propre photo, pas encore rattachée');
  const refus = await call(pfBase, 'GET', `/api/files/${F.planA3}`, null, C.kevin);
  assert.strictEqual(refus.status, 403, 'document d\'un chantier hors périmètre');
  assert.match(refus.body.error, /ne peut pas ouvrir/);
  assert.strictEqual(await lire(F.noteA1, C.kevin), 403, 'document de son chantier non transmis aux compagnons');
  assert.strictEqual(await lire(F.libre, C.kevin), 403, 'fichier sans rattachement déposé par le bureau');
  assert.strictEqual(await lire(F.photoZoe, C.kevin), 403, 'photo du bon d\'une autre');
  assert.strictEqual(await lire(F.photoZoe, C.zoe), 200);
  assert.strictEqual(await lire(F.planA3, C.zoe), 200);
  assert.strictEqual(await lire(F.planA1, C.zoe), 403);
  assert.strictEqual(await lire(F.photoKevin, C.zoe), 403);
  assert.strictEqual(await lire('inconnu', C.kevin), 404);
});

test('CRM : affecté au chantier par le bureau, le compagnon en ouvre aussitôt les fichiers', async () => {
  assert.strictEqual(await lire(F.planA3, C.kevin), 403);
  await ecrire('planning', { id: 'p4', userId: 'k', affaireId: 'A3', date: jour, heuresPrevues: 4 });
  assert.strictEqual(await lire(F.planA3, C.kevin), 200);
  assert.strictEqual(await lire(F.photoZoe, C.kevin), 200, 'photos des bons du chantier');
});

test('Études : fichiers du chantier lus au travers de Pipe-Fit avec les droits du bureau ; fichiers d\'une étude supprimée', async () => {
  const E = {};
  for (const login of ['jacky', 'claire']) E[login] = (await call(base, 'POST', '/api/login', { login, password: 'motdepasse1' })).cookie;
  E.admin = (await call(base, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  assert.strictEqual((await call(base, 'GET', `/api/pf/fichier/${F.libre}`, null, E.claire)).status, 200);
  // Visa d'une étude de Jacky
  const f = (await call(base, 'POST', '/api/fichiers', { nom: 'visa.pdf', base64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64') }, E.jacky)).body.id;
  assert.strictEqual((await call(base, 'PUT', '/api/etudes/ev', { data: { objet: 'Étude visée', affaireId: 'A1', notes: [], visas: [{ fichierId: f }] }, resume: { objet: 'Étude visée' } }, E.jacky)).status, 200);
  const lireE = c => call(base, 'GET', `/api/fichiers/${f}`, null, c).then(r => r.status);
  assert.strictEqual(await lireE(E.claire), 200, 'étude ouverte : tout le bureau');
  assert.strictEqual((await call(base, 'DELETE', '/api/etudes/ev', {}, E.jacky)).status, 200);
  assert.strictEqual(await lireE(E.claire), 403, 'étude supprimée : ni auteure ni administratrice');
  assert.strictEqual(await lireE(E.jacky), 200, 'auteur et déposant');
  assert.strictEqual(await lireE(E.admin), 200);
  assert.strictEqual((await call(base, 'POST', '/api/etudes-supprimees/ev/restaurer', {}, E.jacky)).status, 200);
  assert.strictEqual(await lireE(E.claire), 200);
  // Compte sorti du bureau dans Pipe-Fit : son jeton est refusé, sa session Études tombe dès la requête suivante
  const acc = (await call(pfBase, 'GET', '/api/accounts', null, C.admin)).body.find(a => a.login === 'claire');
  assert.strictEqual((await call(pfBase, 'PUT', `/api/accounts/${acc.id}`, { role: 'atelier' }, C.admin)).status, 200);
  assert.strictEqual((await call(base, 'GET', `/api/pf/fichier/${F.libre}`, null, E.claire)).status, 401);
  assert.strictEqual((await call(base, 'GET', `/api/fichiers/${f}`, null, E.claire)).status, 401, 'session fermée');
});
