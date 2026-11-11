// Réception pilotée par les PV de mise en service ; valeurs réglées sur site reprises dans l'étude.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Es = require('../public/js/essais');
const C = require('../etudes/public/js/consignes-projet');

const mises = [
  { id: 'm1', affaireId: 'af1', numero: 'MS-0001', equipement: 'Réglages de la régulation — valeurs du cahier de paramétrage (Armoires)', statut: 'Brouillon', date: '2026-11-10',
    controles: [{ libelle: 'Planning PL_Z1 (Zone Toutes zones) : lun-ven 7 h – 19 h saisi', etat: 'Non conforme', obs: 'horaires du samedi' }],
    mesures: [{ libelle: 'Consigne confort chauffage — Toutes zones', unite: '°C', valeur: '19,5', attendu: 20 }, { libelle: 'Loi d\'eau Radiateurs : départ par -10 °C ext.', unite: '°C', valeur: '65', attendu: 70 },
      { libelle: 'Loi d\'eau Radiateurs : départ à 18 °C ext.', unite: '°C', valeur: '30', attendu: 30 }, { libelle: 'Pression de soufflage — CTA salle', unite: 'Pa', valeur: '210', attendu: 180 },
      { libelle: 'Change-over : seuil chaud (eau)', unite: '°C', valeur: '28', attendu: 30 }] },
  { id: 'm2', affaireId: 'af1', numero: 'MS-0002', equipement: 'Pompe P1', statut: 'Signé', date: '2026-11-08', controles: [{ libelle: 'Sens de rotation', etat: 'OK' }],
    mesures: [{ libelle: 'Débit mesuré', unite: 'm³/h', valeur: '3', attendu: 4 }] }];

test('réserves tirées des PV, PV de régulation bloquants, valeurs réglées différentes de l\'étude', () => {
  const r = Es.reservesReception(mises);
  assert.deepStrictEqual(r.map(x => [x.source, x.description]), [['MS-0001', 'Planning PL_Z1 (Zone Toutes zones) : lun-ven 7 h – 19 h saisi (automate) : horaires du samedi'], ['MS-0002', 'Débit mesuré : 3 m³/h mesuré pour 4 m³/h attendu']]);
  assert.deepStrictEqual(Es.bloquantsReception(mises).map(b => b.numero), ['MS-0001']);
  const v = Es.valeursReglees(mises);
  assert.deepStrictEqual(v.map(x => [x.libelle, x.attendu, x.regle]), [['Consigne confort chauffage — Toutes zones', 20, 19.5], ['Loi d\'eau Radiateurs : départ par -10 °C ext.', 70, 65], ['Pression de soufflage — CTA salle', 180, 210], ['Change-over : seuil chaud (eau)', 30, 28]]);
  // Report dans la saisie de l'étude
  const pj = { zones: [{ zone: 'Toutes zones', confort: 20, clim: 26, inocc: 16, horsGel: 8, jours: 'lun-ven', debut: 7, fin: 19, diff: 0.5, decalage: 2 }] };
  const a = C.appliquerReglees({ consignesZones: [], loisEau: [], pressionsCta: [] }, v, pj);
  assert.deepStrictEqual(a.entrees.loisEau, [{ circuit: 'Radiateurs', base: 65, d18: '' }]);
  assert.strictEqual(a.entrees.consignesZones[0].confort, 19.5); assert.strictEqual(a.entrees.consignesZones[0].debut, '7:00');
  assert.deepStrictEqual(a.entrees.pressionsCta, [{ cta: 'CTA salle', soufflage: 210, reprise: '', source: 'PV MS-0001 du 2026-11-10' }]);
  assert.deepStrictEqual(a.ignores.map(x => x.libelle), ['Change-over : seuil chaud (eau)']);
  assert.deepStrictEqual([C.indiceSuivant('A'), C.indiceSuivant('c'), C.indiceSuivant('3'), C.indiceSuivant('')], ['B', 'D', '4', 'B']);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-reception-'));
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

test('serveur : réception bloquée tant que le PV de réglage n\'est pas signé ; valeurs réglées lues par les études', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', userId: 'u1' }, admin);
  const c = (await call('POST', '/api/login', { login: 'claire', password: 'motdepasse1' })).cookie;
  assert.strictEqual((await call('PUT', '/api/records/misesEnService/m1', { data: mises[0] }, c)).status, 200);
  const pv = { affaireId: 'af1', type: 'reception', decision: 'Sans réserve', date: '2026-11-12', statut: 'Signé' };
  const r1 = await call('PUT', '/api/records/receptions/r1', { data: pv }, c);
  assert.strictEqual(r1.status, 400); assert.match(r1.body.error, /Réception bloquée : 1 PV de régulation/);
  // Forçage : administrateur avec motif seulement
  assert.strictEqual((await call('PUT', '/api/records/receptions/r1', { data: { ...pv, receptionForcee: { motif: 'essais en saison de chauffe' } } }, c)).status, 400);
  assert.strictEqual((await call('PUT', '/api/records/receptions/r2', { data: { ...pv, receptionForcee: { motif: 'essais en saison de chauffe' } } }, admin)).status, 200);
  // Valeurs réglées (lecture par l'application Études)
  const v = await call('GET', '/api/liens/valeurs-reglees?affaireId=af1', null, c);
  assert.strictEqual(v.status, 200); assert.strictEqual(v.body.length, 4);
});
