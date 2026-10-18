// Pointage des compagnons : rattrapage des oublis sur la semaine en cours, intervention hors devis ouverte depuis le téléphone.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const R = require('../public/js/pointage-regles');

test('jours modifiables : semaine en cours, jusqu\'à aujourd\'hui', () => {
  const auj = '2026-10-17'; // samedi
  assert.deepStrictEqual(R.joursSemaine(auj), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  assert.ok(R.jourModifiable('2026-10-12', auj));
  assert.ok(!R.jourModifiable('2026-10-11', auj)); // dimanche précédent
  assert.ok(!R.jourModifiable('2026-10-18', auj)); // demain
  assert.strictEqual(R.semaine('2026-12-31'), '2026-W53');
  assert.strictEqual(R.refusTemps({ date: '2026-10-13' }, null, auj), null);
  assert.match(R.refusTemps({ date: '2026-10-09' }, null, auj), /semaine en cours/);
  assert.match(R.refusTemps({ date: '2026-10-18' }, null, auj), /à venir/);
  assert.match(R.refusTemps({ date: '2026-10-13' }, { date: '2026-10-09' }, auj), /plus dans la semaine/);
  // Terminer un pointage de nuit commencé dimanche dernier reste possible lundi
  assert.strictEqual(R.refusTemps({ date: '2026-10-11', fin: '06:00' }, { date: '2026-10-11', debut: '22:00', fin: '' }, '2026-10-12'), null);
});

test('intervention hors devis d\'un compagnon : champs limités, à compléter par le bureau', () => {
  const r = R.horsDevisCompagnon({ id: 'x', type: 'horsDevis', nom: ' Fuite ', clientLibre: 'Papeterie', statut: 'Facturé', chargeId: 'u1', heuresPrevues: 99 }, null, 'o1', '2026-10-17');
  assert.deepStrictEqual(r.obj, { id: 'x', type: 'horsDevis', code: '', statut: 'Ouvert', dateCreation: '2026-10-17', heuresPrevues: 0, rex: {}, ouvertePar: 'o1', aCompleter: true, nom: 'Fuite', clientLibre: 'Papeterie' });
  const c = R.horsDevisCompagnon({ type: 'horsDevis', nom: 'Fuite', clientId: 'e2', contactLibre: 'M. Durand', contactTel: '06 10 00 00 01', siteLibre: 'Site de Fos', lieu: 'Unité 3', chargeId: 'u9' }, null, 'o1', '2026-10-17').obj;
  assert.deepStrictEqual([c.contactLibre, c.contactTel, c.siteLibre, c.lieu, c.chargeId], ['M. Durand', '06 10 00 00 01', 'Site de Fos', 'Unité 3', undefined]);
  assert.ok(R.horsDevisCompagnon({ type: 'horsDevis', nom: 'Fuite' }, null, 'o1', '2026-10-17').refus); // sans client
  assert.ok(R.horsDevisCompagnon({ nom: 'Chantier', clientId: 'c1' }, null, 'o1', '2026-10-17').refus); // pas un hors devis
  assert.ok(R.horsDevisCompagnon({ type: 'horsDevis', nom: 'X', clientId: 'c1' }, { id: 'x' }, 'o1', '2026-10-17').refus); // modification
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-pointage-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
process.env.NOTIF_DELAI_MS = '0';
const { server } = require('../server/server');
let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};

test('serveur : oubli rattrapé dans la semaine, hors devis ouvert par le compagnon, bureau prévenu', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'kevin', password: 'motdepasse1', role: 'atelier', nom: 'Kevin', userId: 'o1' }, admin);
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', userId: 'u1' }, admin);
  const k = (await call('POST', '/api/login', { login: 'kevin', password: 'motdepasse1' })).cookie;
  const auj = R.jourIso(new Date()), lundi = R.joursSemaine(auj)[0], avant = R.jourIso(new Date(Date.now() - 8 * 86400000));
  assert.strictEqual((await call('PUT', '/api/records/temps/t1', { data: { userId: 'o1', affaireId: 'af1', date: lundi, debut: '07:30', fin: '16:30', pause: 60, heures: 8 } }, k)).status, 200);
  assert.strictEqual((await call('PUT', '/api/records/temps/t2', { data: { userId: 'o1', affaireId: 'af1', date: avant, heures: 8 } }, k)).status, 403);

  const hd = await call('PUT', '/api/records/affaires/hdk', { data: { type: 'horsDevis', nom: 'Fuite vapeur', clientLibre: 'Papeterie', statut: 'Facturé' } }, k);
  assert.strictEqual(hd.status, 200);
  assert.match(hd.body.code, /^HD-\d{4}-\d{3}$/);
  assert.strictEqual(hd.body.statut, 'Ouvert');
  assert.strictEqual((await call('PUT', '/api/records/affaires/hdk', { data: { ...hd.body, nom: 'Autre' }, version: hd.body._v }, k)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/affaires/ch-k', { data: { nom: 'Chantier', clientId: 'c1' } }, k)).status, 403);
  assert.strictEqual((await call('DELETE', '/api/records/affaires/hdk', {}, k)).status, 403);
  // Le compagnon pointe sur l'intervention qu'il vient d'ouvrir
  assert.strictEqual((await call('PUT', '/api/records/temps/t3', { data: { userId: 'o1', affaireId: 'hdk', date: auj, debut: '08:00', fin: '10:00', heures: 2 } }, k)).status, 200);

  const c = (await call('POST', '/api/login', { login: 'claire', password: 'motdepasse1' })).cookie;
  const notifs = (await call('GET', '/api/data', null, c)).body.notifications.filter(n => n.type === 'horsDevis' && n.userId === 'u1');
  assert.strictEqual(notifs.length, 1);
  assert.match(notifs[0].texte, /Kevin — Fuite vapeur chez Papeterie/);
});
