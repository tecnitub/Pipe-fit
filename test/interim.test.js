// Intérim : registre du personnel (mentions obligatoires, ordre des entrées), alertes, droits.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const I = require('../public/js/interim');

const complet = { nom: 'Yanis Morel', nationalite: 'Française', dateNaissance: '1996-04-12', sexe: 'M', qualification: 'Tuyauteur', dateEntree: '2026-07-01', agenceId: 'e8', numeroContrat: 'MAD-1', motif: 'accroissement' };

test('mentions obligatoires et titre de travail', () => {
  assert.deepStrictEqual(I.manquants(complet), []);
  assert.deepStrictEqual(I.manquants({ ...complet, numeroContrat: '', sexe: '' }), ['Sexe', 'N° du contrat de mise à disposition']);
  assert.ok(!I.titreRequis('Portugaise') && !I.titreRequis('francaise') && !I.titreRequis('Suisse'));
  assert.ok(I.titreRequis('Marocaine'));
  assert.deepStrictEqual(I.manquants({ ...complet, nationalite: 'Marocaine' }), ['Titre autorisant à travailler (type et n°)']);
});

test('alertes : fin prévue dépassée, durée maximale, titre expiré', () => {
  const auj = '2026-10-18';
  assert.deepStrictEqual(I.alertes({ ...complet, finPrevue: '2026-12-31' }, auj), []);
  assert.match(I.alertes({ ...complet, finPrevue: '2026-10-10' }, auj)[0].texte, /dépassée/);
  assert.match(I.alertes({ ...complet, dateEntree: '2025-01-01', finPrevue: '2026-11-30', motif: 'urgence' }, auj)[0].texte, /plus de 9 mois/);
  const t = I.alertes({ ...complet, nationalite: 'Turque', titreType: 'Carte de séjour', titreNumero: 'X1', titreExpire: '2026-10-01' }, auj);
  assert.match(t[0].texte, /expiré depuis 17 j/);
  assert.ok(I.present({ dateEntree: '2026-10-01', dateSortie: '' }, auj) && !I.present({ dateEntree: '2026-10-01', dateSortie: '2026-10-17' }, auj));
});

test('registre numéroté dans l\'ordre des entrées', () => {
  const r = I.registre([{ nom: 'B', dateEntree: '2026-05-02' }, { nom: 'A', dateEntree: '2026-01-10' }, { nom: 'C', dateEntree: '' }]);
  assert.deepStrictEqual(r.map(m => `${m.ordre} ${m.nom}`), ['1 A', '2 B']);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-interim-'));
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
test('un chargé d\'affaires enregistre les intérimaires ; les compagnons ne voient pas le registre', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', userId: 'u1' }, admin);
  await call('POST', '/api/accounts', { login: 'kevin', password: 'motdepasse1', role: 'atelier', nom: 'Kevin', userId: 'o1' }, admin);
  const c = (await call('POST', '/api/login', { login: 'claire', password: 'motdepasse1' })).cookie;
  const k = (await call('POST', '/api/login', { login: 'kevin', password: 'motdepasse1' })).cookie;
  assert.strictEqual((await call('PUT', '/api/records/users/i9', { data: { nom: 'Nouvel Intérimaire', role: 'atelier', type: 'interimaire', agenceId: 'e8' } }, c)).status, 200);
  assert.strictEqual((await call('PUT', '/api/records/missions/mx', { data: { ...complet, userId: 'i9' } }, c)).status, 200);
  // Pas de fiche de salarié, ni de transformation d'un salarié en intérimaire
  assert.strictEqual((await call('PUT', '/api/records/users/s9', { data: { nom: 'Salarié', role: 'atelier', type: 'salarie' } }, c)).status, 403);
  const o1 = (await call('GET', '/api/data', null, admin)).body.users.find(u => u.id === 'o1');
  assert.strictEqual((await call('PUT', '/api/records/users/o1', { data: { ...o1, type: 'interimaire' }, version: o1._v }, c)).status, 403);
  const dk = (await call('GET', '/api/data', null, k)).body;
  assert.deepStrictEqual(dk.missions, []);
  assert.strictEqual((await call('PUT', '/api/records/missions/my', { data: complet }, k)).status, 403);
});
