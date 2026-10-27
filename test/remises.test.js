// Devis : remise commerciale par ligne, remise globale en % ou en €, majoration masquée au client ; facture : retenue de
// garantie cochée sur la facture tant qu'elle n'est ni transmise, ni déposée, ni payée.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Retenue = require('../public/js/retenue');

const Store = { data: { settings: { tva: 20 } }, get: () => null, all: () => [] };
const ctx = vm.createContext({ Store });
vm.runInContext(`${fs.readFileSync(path.join(__dirname, '../public/js/calc.js'), 'utf8')}\nthis.Calc = Calc;`, ctx);
const { Calc } = ctx;
const proche = (a, b) => Math.abs(a - b) < 0.005;
const devis = (ajustements = [], remise = 0) => ({ lignes: [{ designation: 'Tuyauterie', qte: 2, pu: 1000, remise }, { designation: 'Pose', qte: 1, pu: 500 }], ajustements });

test('remise commerciale par ligne : total avant remise, remise, nouveau montant', () => {
  const t = Calc.doc(devis([], 10));
  assert.ok(proche(t.brutAvantRemise, 2500) && proche(t.remiseLignes, 200) && proche(t.net, 2300) && proche(t.totalTTC, 2760));
});

test('remise globale en % ou en € sur le total des lignes', () => {
  assert.ok(proche(Calc.doc(devis([{ libelle: 'Remise', mode: 'pct', pct: -10 }])).net, 2250));
  const e = Calc.doc(devis([{ libelle: 'Geste commercial', mode: 'eur', montant: -300 }]));
  assert.ok(proche(e.net, 2200) && proche(e.ajust[0].montant, -300));
  assert.ok(proche(Calc.doc(devis([{ mode: 'eur', montant: -300 }], 10)).net, 2000), 'remise de ligne puis remise globale');
});

test('majoration masquée : répartie dans les prix des lignes, absente des remises listées', () => {
  const t = Calc.doc(devis([{ libelle: 'Majoration', mode: 'pct', pct: 8, masque: true }]));
  assert.ok(proche(t.k, 1.08) && proche(t.net, 2700) && proche(t.majorationMasquee, 200));
  assert.deepStrictEqual(t.ajust.length, 0, 'rien sur le document du client');
  const e = Calc.doc(devis([{ mode: 'eur', montant: 250, masque: true }, { libelle: 'Remise', mode: 'pct', pct: -10 }]));
  // 2500 + 250 masqués = 2750 au prix du client, puis 10 % de remise visible
  assert.ok(proche(e.brut, 2750) && proche(e.net, 2475) && proche(Calc.pu(devis().lignes[0]) * e.k, 1100));
  const visible = Calc.doc(devis([{ libelle: 'Majoration', pct: 5 }]));
  assert.ok(proche(visible.k, 1) && visible.ajust.length === 1 && proche(visible.net, 2625), 'ancienne majoration visible : inchangée');
  // TVA au prorata et marge sur le montant réellement vendu
  assert.ok(proche(t.tva, 540) && proche(t.margePrev, 2700));
});

test('retenue de garantie : déduite du net à payer ; modifiable tant que la facture n\'est ni transmise, ni déposée, ni payée', () => {
  const t = Calc.doc({ lignes: [{ qte: 1, pu: 1000 }], retenuePct: 5 });
  assert.ok(proche(t.totalTTC, 1200) && proche(t.retenue, 60) && proche(t.netAPayer, 1140));
  assert.deepStrictEqual([Retenue.modifiable({ statut: 'Émise' }), Retenue.modifiable({ statut: 'Émise', exportCompta: { date: 'x' } }), Retenue.modifiable({ statut: 'Payée' }),
    Retenue.modifiable({ statut: 'Émise', efacture: {} }), Retenue.modifiable({ statut: 'Émise', type: 'avoir' })], [true, false, false, false, false]);
  assert.deepStrictEqual([Retenue.taux('5'), Retenue.taux('2,5'), Retenue.taux(''), Retenue.taux(-1), Retenue.taux(30)], [5, 2.5, 0, 0, 10]);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-remises-'));
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

test('serveur : la retenue se coche sur une facture émise, plus après sa transmission au comptable ; les lignes restent figées', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', userId: 'u1' }, admin);
  const claire = (await call('POST', '/api/login', { login: 'claire', password: 'motdepasse1' })).cookie;
  let f = (await call('PUT', '/api/records/factures/f-rg', { data: { clientId: 'e1', statut: 'Émise', date: '2026-10-27', lignes: [{ designation: 'Travaux', qte: 1, pu: 1000 }] } }, claire)).body;
  f = (await call('PUT', '/api/records/factures/f-rg', { data: { ...f, retenuePct: 5, lignes: [{ designation: 'Travaux', qte: 1, pu: 1 }] }, version: f._v }, claire)).body;
  assert.deepStrictEqual([f.retenuePct, f.lignes[0].pu], [5, 1000], 'retenue enregistrée, lignes inchangées');
  f = (await call('PUT', '/api/records/factures/f-rg', { data: { ...f, exportCompta: { date: '2026-10-27' } }, version: f._v }, claire)).body;
  f = (await call('PUT', '/api/records/factures/f-rg', { data: { ...f, retenuePct: 0 }, version: f._v }, claire)).body;
  assert.strictEqual(f.retenuePct, 5, 'facture transmise : retenue figée');
});
