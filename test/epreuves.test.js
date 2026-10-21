// PV d'épreuve hydraulique (calculs, règles du serveur) et lecture de la plaque signalétique d'un équipement frigorifique.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const E = require('../public/js/epreuve');
const F = require('../public/js/fluides');

test('épreuve : pression conseillée, durée, chute, résultat, champs manquants, étalonnage', () => {
  assert.deepStrictEqual([E.pressionConseillee(6), E.pressionConseillee('4,5'), E.pressionConseillee('')], [9, 6.8, null]);
  assert.deepStrictEqual([E.duree('08:30', '10:30'), E.duree('23:30', '00:15'), E.duree('8h', '10:00')], [120, 45, null]);
  const base = { pressionEpreuve: 9, pressionDebut: 9.1, pressionFin: 9.1, heureDebut: '08:30', heureFin: '10:30', dureePrevue: 120, chuteAdmissible: 0 };
  assert.deepStrictEqual([E.resultat(base), E.chute(base)], ['Conforme', 0]);
  assert.strictEqual(E.resultat({ ...base, pressionFin: 8.9 }), 'Non conforme');
  assert.strictEqual(E.resultat({ ...base, pressionFin: 8.9, chuteAdmissible: 0.2 }), 'Conforme');
  assert.strictEqual(E.resultat({ ...base, heureFin: '09:30' }), 'Non conforme', 'maintien trop court');
  assert.strictEqual(E.resultat({ ...base, pressionDebut: 7, pressionFin: 7 }), 'Non conforme', 'pression d\'épreuve non atteinte');
  assert.strictEqual(E.resultat({ ...base, pressionFin: '' }), '');
  assert.deepStrictEqual(E.manques({ affaireId: 'af1', userId: 'o1', date: '2026-10-21', reseau: ' ', pressionEpreuve: 9, heureDebut: '08:00' }),
    ['nom du réseau', 'heures de début et de fin', 'pression en début d\'épreuve', 'pression en fin d\'épreuve']);
  const mano = { echeances: [{ cle: 'etalonnage', libelle: 'Étalonnage', prochaine: '2026-10-01' }] };
  assert.deepStrictEqual([E.etalonnage(mano, '2026-09-15').aJour, E.etalonnage(mano, '2026-10-21').aJour, E.etalonnage({}, '2026-10-21').connu], [true, false, false]);
});

test('plaque signalétique lue : fluide, charge, marque, modèle, n° de série', () => {
  assert.deepStrictEqual(F.lirePlaque(['DAIKIN INDUSTRIES', 'MODEL RXM35R5V1B', 'SERIAL NO. E012345', 'REFRIGERANT R32', '0,76 kg', 'GWP 675 0,51 tCO2eq']),
    { fluide: 'R32', charge: 0.76, marque: 'Daikin', modele: 'RXM35R5V1B', numeroSerie: 'E012345' });
  assert.deepStrictEqual(F.lirePlaque(['Mitsubishi Electric', 'Type: PUZ-ZM100YAA', 'S/N 1ZU04512', 'Fluide frigorigène R-410A  Charge 4,0 kg']),
    { fluide: 'R410A', charge: 4, marque: 'Mitsubishi Electric', modele: 'PUZ-ZM100YAA', numeroSerie: '1ZU04512' });
  assert.deepStrictEqual(F.lirePlaque(['CIAT', 'N° de série 21-0457-88', 'Réfrigérant: R454B', 'Charge circuit 1: 12.5 kg']).fluide, 'R454B');
  assert.deepStrictEqual(F.lirePlaque(['photo floue']), { fluide: '', charge: '', marque: '', modele: '', numeroSerie: '' });
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-epreuves-'));
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

test('serveur : le technicien saisit son PV d\'épreuve, complet pour être signé, figé une fois signé', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'kevin', password: 'motdepasse1', role: 'atelier', nom: 'Kevin', userId: 'o1' }, admin);
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', userId: 'u1' }, admin);
  const kevin = (await call('POST', '/api/login', { login: 'kevin', password: 'motdepasse1' })).cookie;
  const claire = (await call('POST', '/api/login', { login: 'claire', password: 'motdepasse1' })).cookie;
  assert.ok((await call('GET', '/api/data', null, kevin)).body.epreuves.some(e => e.id === 'ep1'), 'PV de démonstration visible');
  const e = { affaireId: 'af1', userId: 'o1', date: '2026-10-21', heureDebut: '08:00', reseau: 'Chauffage aller bât. B', pressionEpreuve: 9, statut: 'Brouillon' };
  assert.strictEqual((await call('PUT', '/api/records/epreuves/ep-t', { data: e }, kevin)).status, 200);
  assert.strictEqual((await call('PUT', '/api/records/epreuves/ep-u', { data: { ...e, userId: 'o2' } }, kevin)).status, 403, 'pour soi seulement');
  let rec = (await call('GET', '/api/records/epreuves/ep-t', null, claire)).body;
  const inc = await call('PUT', '/api/records/epreuves/ep-t', { data: { ...rec, statut: 'Signé' }, version: rec._v }, kevin);
  assert.match(inc.body.error, /incomplet : heures de début et de fin, pression en début/);
  const ok = await call('PUT', '/api/records/epreuves/ep-t', { data: { ...rec, heureFin: '10:00', pressionDebut: 9, pressionFin: 9, statut: 'Signé', resultat: 'Conforme' }, version: rec._v }, kevin);
  assert.strictEqual(ok.status, 200);
  rec = (await call('GET', '/api/records/epreuves/ep-t', null, claire)).body;
  assert.match(rec.numero, /^EP-\d{4}-\d{4}$/);
  assert.strictEqual((await call('PUT', '/api/records/epreuves/ep-t', { data: { ...rec, pressionFin: 8 }, version: rec._v }, claire)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/epreuves/ep-t', { data: { ...rec, observations: 'corrigé' }, version: rec._v }, admin)).status, 200);
});
