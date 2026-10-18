// Habilitations, visites médicales et contrôles du parc : échéances, alertes, notifications, droits.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const E = require('../public/js/echeances');

test('états d\'une échéance et calcul des dates', () => {
  const auj = '2026-10-18';
  assert.deepStrictEqual(E.etat('2026-10-10', auj), { etat: 'expire', jours: -8 });
  assert.deepStrictEqual(E.etat('2026-11-12', auj), { etat: 'bientot', jours: 25 });
  assert.strictEqual(E.etat('2027-06-01', auj).etat, 'ok');
  assert.strictEqual(E.etat('', auj).etat, 'absent');
  assert.strictEqual(E.etat('2026-11-12', auj, 20).etat, 'ok'); // parc : seuil propre
  assert.strictEqual(E.ajouterMois('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(E.ajouterMois('2026-10-18', 24), '2028-10-18');
  const a = E.alertesPersonne([{ id: 'h1', userId: 'o1', cle: 'sst', expire: '2026-10-06' }, { id: 'h2', userId: 'o1', cle: 'visite', expire: '2028-01-01' }], auj);
  assert.deepStrictEqual(a.map(x => [x.cle, x.etat]), [['sst', 'expire']]);
  assert.match(E.texte(a[0]), /expirée depuis 12 j/);
  const m = E.alertesMateriel({ id: 'pm', echeances: [{ cle: 'ct', libelle: 'Contrôle technique', prochaine: '2026-11-05' }, { cle: 'vgp', libelle: 'VGP', prochaine: '2027-03-01' }] }, auj);
  assert.deepStrictEqual(m.map(x => [x.cle, x.etat]), [['ct', 'bientot']]);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-echeances-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const { server, NOTIFS } = require('../server/server');
let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};

test('alertes envoyées une seule fois au bureau et aux personnes concernées ; droits des compagnons', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', userId: 'u1' }, admin);
  await call('POST', '/api/accounts', { login: 'kevin', password: 'motdepasse1', role: 'atelier', nom: 'Kevin', userId: 'o1' }, admin);
  const n1 = await NOTIFS.echeances();
  assert.ok(n1 >= 4, `alertes : ${n1}`); // données de démo : habilitations expirées / bientôt + contrôles du parc
  assert.strictEqual(await NOTIFS.echeances(), 0); // déjà signalées
  const c = (await call('POST', '/api/login', { login: 'claire', password: 'motdepasse1' })).cookie;
  const k = (await call('POST', '/api/login', { login: 'kevin', password: 'motdepasse1' })).cookie;
  const nc = (await call('GET', '/api/data', null, c)).body.notifications.filter(n => n.type === 'echeance' && n.userId === 'u1');
  assert.strictEqual(nc.length, 1);
  assert.match(nc[0].texte, /Kevin Roux : Sauveteur secouriste/);
  const dk = (await call('GET', '/api/data', null, k)).body;
  const nk = dk.notifications.filter(n => n.type === 'echeance');
  assert.strictEqual(nk.length, 1);
  assert.match(nk[0].texte, /Qualification soudeur/);
  assert.match(nk[0].texte, /Peugeot Partner/); // son véhicule
  // Le compagnon ne voit que ses habilitations et son matériel, sans valeur d'achat ; il ne peut rien modifier
  assert.deepStrictEqual([...new Set(dk.habilitations.map(h => h.userId))], ['o1']);
  assert.ok(dk.materiels.length && dk.materiels.every(m => m.affectation.userId === 'o1' && m.valeur === undefined));
  assert.strictEqual((await call('PUT', '/api/records/habilitations/hbx', { data: { userId: 'o1', cle: 'sst', expire: '2030-01-01' } }, k)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/materiels/pm2', { data: { designation: 'x' } }, k)).status, 403);
  // Le bureau renouvelle : nouvelle alerte seulement à la prochaine échéance
  assert.strictEqual((await call('PUT', '/api/records/habilitations/hb4', { data: { userId: 'o1', cle: 'sst', obtenue: '2026-10-18', expire: '2028-10-18' }, version: 1 }, c)).status, 200);
  assert.strictEqual(await NOTIFS.echeances(), 0);
});
