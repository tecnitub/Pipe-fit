// Dérive des chantiers (alertes, envoi unique au chargé d'affaires) et comptes de charges des achats par famille.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const D = require('../public/js/derive');
const C = require('../public/js/comptes-charges');

const S = (o = {}) => ({ heuresPassees: 0, heuresPrevues: 100, achats: 0, budgetF: 1000, caDevis: 10000, pctFacture: 50, margeFin: 2000, margeFinPct: 20, margePrevPct: 20, ...o });
const A = { id: 'a', code: 'CH-1', statut: 'En cours' };

test('dérive : seuils heures et achats, avance sur le facturé, marge, chantiers exclus', () => {
  assert.deepStrictEqual(D.alertes(A, S({ heuresPassees: 70 })), []);
  assert.deepStrictEqual(D.alertes(A, S({ heuresPassees: 85 })).map(x => [x.cle, x.niveau, x.pct]), [['heures', 'attention', 85]]);
  assert.deepStrictEqual(D.alertes(A, S({ heuresPassees: 105, achats: 1200 })).map(x => [x.cle, x.niveau]), [['heures', 'depassement'], ['achats', 'depassement']]);
  assert.deepStrictEqual(D.alertes(A, S({ heuresPassees: 70, pctFacture: 30 })).map(x => [x.cle, x.niveau]), [['heures', 'avance']], '70 % consommé pour 30 % facturé');
  assert.match(D.alertes(A, S({ heuresPassees: 105 }))[0].texte, /105 h sur 100 h prévues \(105 %\) : budget dépassé · facturé 50 %/);
  assert.deepStrictEqual(D.alertes(A, S({ margeFinPct: 14 })).map(x => [x.cle, x.niveau]), [['marge', 'attention']]);
  assert.deepStrictEqual(D.alertes(A, S({ margeFin: -500, margeFinPct: -5 })).map(x => [x.cle, x.niveau]), [['marge', 'depassement']]);
  assert.deepStrictEqual(D.alertes(A, S({ heuresPassees: 85, pctFacture: 70 }), { heures: 90 }), [], 'seuil réglé');
  assert.deepStrictEqual(D.alertes(A, S({ heuresPassees: 200 }), { actif: false }), []);
  assert.deepStrictEqual(D.alertes({ ...A, statut: 'Terminé' }, S({ heuresPassees: 200 })), []);
  assert.deepStrictEqual(D.alertes({ ...A, type: 'horsDevis' }, S({ heuresPassees: 200 })), []);
  assert.strictEqual(D.pire(D.alertes(A, S({ heuresPassees: 85, achats: 1100 }))), 'depassement');
});

test('comptes de charges : familles de la commande, compte proposé, fournisseur, arrondi au centime', () => {
  const articles = [{ id: 't', ref: 'TUB-1', famille: 'Tubes' }, { id: 'l', ref: 'ECH', famille: 'Location' }, { id: 'r', ref: 'RX', famille: 'Contrôles' }];
  const commande = { lignes: [{ articleId: 't', qte: 10, pu: 70 }, { articleId: 'l', qte: 1, pu: 300 }] };
  const ctx = { articles, comptesFamilles: {}, compteFournisseur: '', compteAchats: '601000' };
  assert.deepStrictEqual(C.comptes(1100, { affaireId: 'a' }, { ...ctx, commande, achat: {} }), [{ compte: '601000', montant: 770 }, { compte: '613500', montant: 330 }]);
  assert.deepStrictEqual(C.comptes(1100, null, { ...ctx, commande, achat: {}, comptesFamilles: { Tubes: '602100' } }).map(x => x.compte), ['602100', '613500']);
  // Lignes de la facture (référence fournisseur) ; aucune famille : compte du fournisseur
  const achat = { lignes: [{ reference: 'rx', montantHT: 100, affaireId: 'a' }, { designation: 'Divers', montantHT: 50, affaireId: 'b' }] };
  assert.deepStrictEqual(C.comptes(100, { affaireId: 'a' }, { ...ctx, achat }), [{ compte: '611000', montant: 100 }]);
  assert.deepStrictEqual(C.comptes(80, { affaireId: 'z' }, { ...ctx, achat: {}, compteFournisseur: '621100' }), [{ compte: '621100', montant: 80 }]);
  const r = C.comptes(100, null, { ...ctx, achat: {}, commande: { lignes: [{ articleId: 't', qte: 1, pu: 1 }, { articleId: 'l', qte: 1, pu: 1 }, { articleId: 'r', qte: 1, pu: 1 }] } });
  assert.strictEqual(Math.round(r.reduce((t, x) => t + x.montant, 0) * 100), 10000, 'somme exacte');
  assert.strictEqual(C.libelle('613500'), 'Locations');
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-derive-'));
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

test('serveur : dérive calculée sur les données, signalée une seule fois au chargé d\'affaires', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', userId: 'u1' }, admin);
  await call('POST', '/api/accounts', { login: 'kevin', password: 'motdepasse1', role: 'atelier', nom: 'Kevin', userId: 'o1' }, admin);
  const claire = (await call('POST', '/api/login', { login: 'claire', password: 'motdepasse1' })).cookie;
  const kevin = (await call('POST', '/api/login', { login: 'kevin', password: 'motdepasse1' })).cookie;
  assert.strictEqual((await call('POST', '/api/derives/verifier', {}, kevin)).status, 403);
  assert.ok((await call('POST', '/api/derives/verifier', {}, claire)).body.alertes >= 1);
  const n = (await call('GET', '/api/data', null, claire)).body.notifications.filter(x => x.type === 'derive');
  assert.ok(n.length >= 1 && n.every(x => x.userId === 'u1'));
  assert.match(n[0].texte, /CH-\d{4}-001[\s\S]*Achats : .* budget dépassé/);
  assert.strictEqual((await call('POST', '/api/derives/verifier', {}, claire)).body.alertes, 0, 'pas deux fois la même alerte');
});
