// Tests de la boutique en ligne : calcul des prix, commandes (prix recalculés par le serveur), devis sur plan, suivi, administration.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boutique-'));
process.env.BOUTIQUE_DB_FILE = path.join(dir, 'boutique.db');
process.env.BOUTIQUE_ADMIN_PASSWORD = 'admin-boutique-pw';
const C = require('../boutique/catalogue');
const { server } = require('../boutique/server');
let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });

async function call(method, url, body, cookie) {
  const res = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
const cfg = { serie: 'iso', dn: 'DN50', ep: 2, nuance: '316L', finition: 'decape' };
const client = { societe: 'Laiterie du Test', nom: 'Jeanne Essai', email: 'Jeanne@Example.com', adresse: '1 rue du Lait', cp: '07100', ville: 'Annonay' };

test('calculs du catalogue', () => {
  // Masse d'un tube 60,3 × 2 : ≈ 2,90 kg/m
  assert.ok(Math.abs(C.masseM(60.3, 2) - 2.905) < 0.01);
  assert.ok(C.prixTubeM({ ...cfg, nuance: '316L' }) > C.prixTubeM({ ...cfg, nuance: '304L' }));
  assert.ok(C.prixTubeM({ ...cfg, finition: 'electropoli' }) > C.prixTubeM({ ...cfg, finition: 'poli' }));
  // Spool en Z : 2 coudes, 4 soudures de coudes + 1 pour la collerette
  const s = C.prixSpool({ ...cfg, troncons: [{ dir: 'E', l: 800 }, { dir: 'N', l: 600 }, { dir: 'E', l: 800 }], ext: { a: 'collerette', b: 'chanfrein' } });
  assert.strictEqual(s.coudes, 2);
  assert.strictEqual(s.soudures, 5);
  assert.ok(Math.abs(s.longueurTube - (2.2 - 4 * 1.5 * 60.3 / 1000)) < 1e-9);
  assert.throws(() => C.prixSpool({ ...cfg, troncons: [{ dir: 'E', l: 800 }, { dir: 'O', l: 600 }] }), /demi-tour/);
  assert.throws(() => C.prixLigne({ produit: 'tube', qte: 1, config: { ...cfg, ep: 9, longueur: 3000 } }), /Épaisseur/);
  assert.throws(() => C.prixLigne({ produit: 'union-din', qte: 1, config: cfg }), /Série/);
  // Collecteur : 1 à 5 piquages, diamètre au plus celui du corps, écartement et marges contrôlés
  const co = { ...cfg, dn: 'DN100', longueur: 1500, ext: { a: 'fond', b: 'collerette' },
    piquages: [{ dn: 'DN50', orient: 'H', pos: 400, h: 300, ext: 'collerette' }, { dn: 'DN25', orient: 'B', pos: 1100, h: 200, ext: 'chanfrein' }] };
  const pc = C.prixCollecteur(co);
  assert.strictEqual(pc.soudures, 2 + 1 + 2); // 2 piquages + collerette du piquage 1 + fond bombé et collerette du corps
  assert.ok(pc.total > 0);
  assert.ok(C.prixLigne({ produit: 'collecteur-sur-mesure', qte: 1, config: co, options: [] }) === pc.total);
  const cinq = { ...co, longueur: 2000, piquages: [300, 650, 1000, 1350, 1700].map(pos => ({ dn: 'DN40', orient: 'H', pos, h: 250 })) };
  assert.strictEqual(C.analyserCollecteur(cinq).piquages.length, 5);
  assert.throws(() => C.prixCollecteur({ ...cinq, piquages: [...cinq.piquages, { dn: 'DN40', orient: 'H', pos: 1900, h: 250 }] }), /1 à 5/);
  assert.throws(() => C.prixCollecteur({ ...co, piquages: [] }), /1 à 5/);
  assert.throws(() => C.prixCollecteur({ ...co, piquages: [{ dn: 'DN150', orient: 'H', pos: 700, h: 300 }] }), /supérieur/);
  assert.throws(() => C.prixCollecteur({ ...co, piquages: [{ dn: 'DN50', orient: 'H', pos: 400, h: 300 }, { dn: 'DN50', orient: 'H', pos: 450, h: 300 }] }), /trop proches/);
  assert.throws(() => C.prixCollecteur({ ...co, piquages: [{ dn: 'DN50', orient: 'H', pos: 20, h: 300 }] }), /extrémité/);
  assert.throws(() => C.prixCollecteur({ ...co, piquages: [{ dn: 'DN50', orient: 'H', pos: 400, h: 60 }] }), /hauteur/);
  assert.throws(() => C.prixSpool({ ...cfg, troncons: [{ dir: 'E', l: 800 }], ext: { a: 'fond' } }), /Extrémité/); // pas de fond bombé sur un spool

  // Franco de port et remise quantité
  const t = C.totaliser([{ produit: 'coude90', qte: 20, config: cfg, options: [] }]);
  assert.strictEqual(t.lignes[0].remise, 0.08);
  assert.strictEqual(t.port, C.PORT);
  assert.strictEqual(C.totaliser([{ produit: 'tube', qte: 50, config: { ...cfg, longueur: 6000 }, options: [] }]).port, 0);
});

test('commande : prix recalculés par le serveur, contrôles du formulaire', async () => {
  const lignes = [{ produit: 'coude90', qte: 12, config: cfg, options: ['cert31'], pu: 0.01, montant: 0.01 },
    { produit: 'collecteur-sur-mesure', qte: 1, config: { ...cfg, dn: 'DN80', longueur: 1200, ext: { a: 'collerette', b: 'fond' }, piquages: [{ dn: 'DN40', orient: 'H', pos: 400, h: 250, ext: 'clamp' }, { dn: 'DN40', orient: 'H', pos: 800, h: 250, ext: 'clamp' }] }, options: [] },
    { produit: 'spool-sur-mesure', qte: 2, config: { ...cfg, troncons: [{ dir: 'E', l: 1000 }, { dir: 'H', l: 500 }], ext: { a: 'bride', b: 'chanfrein' } }, options: ['epreuve'] }];
  const attendu = C.totaliser(lignes.map(({ produit, qte, config, options }) => ({ produit, qte, config, options })));
  let r = await call('POST', '/api/commandes', { client, paiement: 'virement', cgv: true, lignes });
  assert.strictEqual(r.status, 201);
  assert.match(r.body.numero, /^CMD-\d{4}-0001$/);
  assert.strictEqual(r.body.ht, attendu.ht);
  const numero = r.body.numero;

  assert.strictEqual((await call('POST', '/api/commandes', { client, paiement: 'virement', cgv: false, lignes })).status, 400);
  assert.strictEqual((await call('POST', '/api/commandes', { client, paiement: 'compte', cgv: true, lignes })).status, 400); // SIRET obligatoire
  assert.strictEqual((await call('POST', '/api/commandes', { client: { ...client, email: 'pas-un-mail' }, paiement: 'virement', cgv: true, lignes })).status, 400);
  assert.strictEqual((await call('POST', '/api/commandes', { client, paiement: 'virement', cgv: true, lignes: [{ produit: 'inconnu', qte: 1, config: cfg }] })).status, 400);
  assert.strictEqual((await call('POST', '/api/commandes', { client, paiement: 'virement', cgv: true, lignes: [] })).status, 400);

  // Suivi : numéro + e-mail (insensible à la casse)
  r = await call('POST', '/api/suivi', { numero: numero.toLowerCase(), email: 'jeanne@example.com' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.statut, 'recue');
  assert.strictEqual((await call('POST', '/api/suivi', { numero, email: 'autre@example.com' })).status, 404);
});

test('devis sur plan avec fichier joint, administration', async () => {
  const pdf = Buffer.from('%PDF-1.4 plan isométrique');
  let r = await call('POST', '/api/devis', { client, message: 'Collecteur DN100 avec 6 piquages DN50', fichiers: [{ nom: 'iso-01.pdf', base64: pdf.toString('base64') }] });
  assert.strictEqual(r.status, 201);
  const numDevis = r.body.numero;
  assert.strictEqual((await call('POST', '/api/devis', { client, message: 'Plan joint', fichiers: [{ nom: 'virus.exe', base64: 'AAAA' }] })).status, 400);

  // Administration protégée
  assert.strictEqual((await call('GET', '/api/admin/commandes')).status, 401);
  assert.strictEqual((await call('POST', '/api/admin/login', { password: 'faux' })).status, 401);
  r = await call('POST', '/api/admin/login', { password: 'admin-boutique-pw' });
  assert.strictEqual(r.status, 200);
  const admin = r.cookie;

  const commandes = (await call('GET', '/api/admin/commandes', null, admin)).body;
  assert.strictEqual(commandes.length, 1);
  const num = commandes[0].numero;
  r = await call('PUT', `/api/admin/commandes/${num}`, { statut: 'expediee', suiviTransport: 'GEO 123456' }, admin);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.historique.map(h => h.statut), ['recue', 'expediee']);
  assert.strictEqual((await call('PUT', `/api/admin/commandes/${num}`, { statut: 'volee' }, admin)).status, 400);
  r = await call('POST', '/api/suivi', { numero: num, email: client.email });
  assert.strictEqual(r.body.suiviTransport, 'GEO 123456');

  const devis = (await call('GET', '/api/admin/devis', null, admin)).body;
  assert.strictEqual(devis[0].numero, numDevis);
  r = await call('GET', `/api/admin/fichiers/${devis[0].fichiers[0].id}`, null, admin);
  assert.deepStrictEqual(r.body, pdf);
  assert.strictEqual((await call('GET', `/api/admin/fichiers/${devis[0].fichiers[0].id}`)).status, 401);
  assert.strictEqual((await call('PUT', `/api/admin/devis/${numDevis}`, { statut: 'envoye' }, admin)).status, 200);
});

test('pages servies, origine étrangère refusée', async () => {
  for (const u of ['/', '/admin', '/catalogue.js', '/logo-tecnitub.png', '/js/boutique.js']) assert.strictEqual((await call('GET', u)).status, 200, u);
  const r = await fetch(base + '/api/devis', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://pirate.example' }, body: '{}' });
  assert.strictEqual(r.status, 403);
});
