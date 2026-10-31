// Liaison des applications DOE et Études avec la fiche chantier de Pipe-Fit (version installée) : état transmis par leurs
// serveurs à chaque enregistrement, fiches techniques visées ajoutées aux documents du chantier, droits.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-liens-'));
process.env.DB_FILE = path.join(dir, 'pf.db');
process.env.DOE_DB_FILE = path.join(dir, 'doe.db');
process.env.ETUDES_DB_FILE = path.join(dir, 'etudes.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const pf = require('../server/server').server;
let doe, etudes, pfBase, doeBase, etBase;

before(async () => {
  await new Promise(r => pf.listen(0, '127.0.0.1', r));
  pfBase = `http://127.0.0.1:${pf.address().port}`;
  process.env.PIPEFIT_URL = pfBase; // lu au chargement des serveurs DOE et Études
  doe = require('../doe/server').server;
  etudes = require('../etudes/server').server;
  await new Promise(r => doe.listen(0, '127.0.0.1', r));
  await new Promise(r => etudes.listen(0, '127.0.0.1', r));
  doeBase = `http://127.0.0.1:${doe.address().port}`;
  etBase = `http://127.0.0.1:${etudes.address().port}`;
});
after(() => { for (const s of [doe, etudes, pf]) { s.close(); s.closeAllConnections(); } fs.rmSync(dir, { recursive: true, force: true }); });

async function call(b, method, url, body, cookie, headers = {}) {
  const brut = !!headers['X-Doe-Upload'];
  const res = await fetch(b + url, {
    method,
    headers: { ...(method !== 'GET' && !brut ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: method === 'GET' ? undefined : brut ? body : JSON.stringify(body || {}),
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
// Envois en arrière-plan : on attend que la condition soit remplie (3 s au plus)
async function attendre(f) {
  for (let i = 0; i < 60; i++) { const v = await f(); if (v) return v; await new Promise(r => setTimeout(r, 50)); }
  return f();
}
let pfJacky, pfMarc;

test('API des liens : bureau uniquement, application connue, résumé retiré avec le chantier', async () => {
  const admin = (await call(pfBase, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  for (const [login, role] of [['jacky', 'charge'], ['marc', 'atelier']])
    assert.strictEqual((await call(pfBase, 'POST', '/api/accounts', { login, password: 'motdepasse1', role, nom: login }, admin)).status, 200);
  pfJacky = (await call(pfBase, 'POST', '/api/login', { login: 'jacky', password: 'motdepasse1' })).cookie;
  pfMarc = (await call(pfBase, 'POST', '/api/login', { login: 'marc', password: 'motdepasse1' })).cookie;
  assert.strictEqual((await call(pfBase, 'GET', '/api/liens?affaireId=af1', null, pfMarc)).status, 403);
  assert.strictEqual((await call(pfBase, 'PUT', '/api/liens/autre/x1', { affaireId: 'af1', resume: {} }, pfJacky)).status, 404);
  assert.strictEqual((await call(pfBase, 'PUT', '/api/liens/etudes/x1', { affaireId: 'af1' }, pfJacky)).status, 400);
  assert.strictEqual((await call(pfBase, 'PUT', '/api/liens/etudes/x1', { affaireId: 'af1', resume: { objet: 'Test' } }, pfJacky)).status, 200);
  const l = (await call(pfBase, 'GET', '/api/liens?affaireId=af1', null, pfJacky)).body;
  assert.deepStrictEqual(l.map(x => [x.app, x.id, x.resume.objet, x.par]), [['etudes', 'x1', 'Test', 'jacky']]);
  // Plus rattachée à un chantier : retirée
  await call(pfBase, 'PUT', '/api/liens/etudes/x1', { affaireId: '', resume: { objet: 'Test' } }, pfJacky);
  assert.deepStrictEqual((await call(pfBase, 'GET', '/api/liens?affaireId=af1', null, pfJacky)).body, []);
});

test('Études : état de l\'étude sur la fiche chantier, retiré à la suppression ou au changement de chantier', async () => {
  const c = (await call(etBase, 'POST', '/api/login', { login: 'jacky', password: 'motdepasse1' })).cookie;
  const resume = { objet: 'Réseau eau glacée', indice: 'A', notes: [{ titre: 'Pompe P1', erreurs: 0, attention: 1 }], erreurs: 0, attention: 1, equipements: [{ designation: 'Vase d\'expansion 200 L', qte: 1 }] };
  assert.strictEqual((await call(etBase, 'PUT', '/api/etudes/et-l1', { data: { objet: 'Réseau eau glacée', affaireId: 'af2', notes: [] }, resume }, c)).status, 200);
  const lu = await attendre(async () => (await call(pfBase, 'GET', '/api/liens?affaireId=af2', null, pfJacky)).body.find(x => x.id === 'et-l1'));
  assert.ok(lu, 'état transmis à Pipe-Fit');
  assert.strictEqual(lu.app, 'etudes');
  assert.strictEqual(lu.resume.equipements[0].designation, 'Vase d\'expansion 200 L');
  // Rattachée à un autre chantier : déplacée
  await call(etBase, 'PUT', '/api/etudes/et-l1', { data: { objet: 'Réseau eau glacée', affaireId: 'af3', notes: [] }, version: 1, resume }, c);
  assert.ok(await attendre(async () => (await call(pfBase, 'GET', '/api/liens?affaireId=af3', null, pfJacky)).body.some(x => x.id === 'et-l1')));
  assert.ok(!(await call(pfBase, 'GET', '/api/liens?affaireId=af2', null, pfJacky)).body.some(x => x.id === 'et-l1'));
  // Supprimée : retirée
  await call(etBase, 'DELETE', '/api/etudes/et-l1', {}, c);
  assert.ok(await attendre(async () => !(await call(pfBase, 'GET', '/api/liens?affaireId=af3', null, pfJacky)).body.some(x => x.id === 'et-l1')));
});

test('DOE : état du dossier transmis, fiche visée ajoutée aux documents du chantier, refusée retirée des compagnons', async () => {
  const c = (await call(doeBase, 'POST', '/api/login', { login: 'jacky', password: 'motdepasse1' })).cookie;
  const pdf = Buffer.from('%PDF-1.4\n%fiche PAC\n%%EOF\n');
  const up = (await call(doeBase, 'POST', '/api/fichiers', pdf, c, { 'X-Doe-Upload': '1', 'X-Filename': 'Fiche PAC.pdf' })).body;
  const fiche = { id: 'fi1', designation: 'PAC-01 Daikin', visa: 'Soumise', indice: 'A', fichier: { src: 'doe', id: up.id, nom: 'Fiche PAC.pdf', mime: 'application/pdf' } };
  const data = { affaireId: 'af4', statut: 'Étude', etude: true, fiches: [fiche], equipements: [] };
  const r1 = await call(doeBase, 'PUT', '/api/does/dl1', { data, resume: { doeId: 'dl1', statut: 'Étude', pct: 20, fiches: [{ id: 'fi1', visa: 'Soumise' }] } }, c);
  assert.strictEqual(r1.status, 200);
  const etat = await attendre(async () => (await call(pfBase, 'GET', '/api/liens?affaireId=af4', null, pfJacky)).body.find(x => x.app === 'doe'));
  assert.strictEqual(etat.resume.pct, 20);
  const docsFiche = async () => ((await call(pfBase, 'GET', '/api/records/affaires/af4', null, pfJacky)).body.documents || []).filter(d => d.etudeFicheId === 'fi1');
  assert.deepStrictEqual(await docsFiche(), [], 'pas encore visée : pas dans les documents');

  // Visée : fichier envoyé à Pipe-Fit, document transmis aux compagnons
  fiche.visa = 'Visée'; fiche.dateVisa = '2026-10-27';
  await call(doeBase, 'PUT', '/api/does/dl1', { data, version: 1, resume: { doeId: 'dl1', statut: 'Étude', pct: 40, fiches: [{ id: 'fi1', visa: 'Visée' }] } }, c);
  const [d] = await attendre(async () => { const x = await docsFiche(); return x.length ? x : null; });
  assert.strictEqual(d.categorie, 'Fiche technique');
  assert.strictEqual(d.visible, true);
  assert.strictEqual(d.note, 'Étude d\'exécution : visée le 27/10/2026');
  const fichier = await call(pfBase, 'GET', `/api/files/${d.fichierId}`, null, pfJacky);
  assert.deepStrictEqual(fichier.body, pdf);

  // Enregistré de nouveau : pas de doublon ; refusée : plus transmise aux compagnons
  fiche.visa = 'Refusée';
  await call(doeBase, 'PUT', '/api/does/dl1', { data, version: 2, resume: { doeId: 'dl1', statut: 'Étude', pct: 40, fiches: [{ id: 'fi1', visa: 'Refusée' }] } }, c);
  const apres = await attendre(async () => { const x = await docsFiche(); return x.length && x[0].visa === 'Refusée' ? x : null; });
  assert.strictEqual(apres.length, 1);
  assert.strictEqual(apres[0].visible, false);

  // Lu par l'application DOE (équipements du bureau d'études)
  assert.ok((await call(doeBase, 'GET', '/api/pf/liens?affaireId=af4', null, c)).body.some(x => x.app === 'doe'));
  // Dossier supprimé : état retiré
  await call(doeBase, 'DELETE', '/api/does/dl1', {}, c);
  assert.ok(await attendre(async () => !(await call(pfBase, 'GET', '/api/liens?affaireId=af4', null, pfJacky)).body.some(x => x.app === 'doe')));
});

test('Visas reportés sur les documents (module commun)', () => {
  const L = require('../public/js/lien-etude');
  const docs = [{ id: 'd1', fichierId: 'pf1', nom: 'FT vanne.pdf', visible: true }, { id: 'd2', etudeFicheId: 'f3', visa: 'Visée', note: '', visible: true }];
  const r = L.appliquer(docs, [
    { id: 'f1', visa: 'Visée', fichier: { src: 'pf', id: 'pf1' } }, // fichier déjà dans le chantier : visa noté, rien à envoyer
    { id: 'f2', visa: 'Visée avec observations', fichier: { src: 'doe', id: 'x' } }, // à envoyer
    { id: 'f3', visa: 'Refusée', obs: 'débit insuffisant' }, // document lié : plus transmis
    { id: 'f4', visa: 'Soumise', fichier: { src: 'doe', id: 'y' } }, // pas encore visée
  ]);
  assert.strictEqual(r.change, true);
  assert.deepStrictEqual(r.aEnvoyer.map(f => f.id), ['f2']);
  assert.strictEqual(docs[0].visa, 'Visée');
  assert.strictEqual(docs[0].visible, true);
  assert.deepStrictEqual([docs[1].visible, docs[1].note], [false, 'Étude d\'exécution : refusée — débit insuffisant']);
  assert.strictEqual(L.appliquer(docs, [{ id: 'f3', visa: 'Refusée', obs: 'débit insuffisant' }]).change, false);
});

test('étude sans chantier : visible dans le CRM, reliée au chantier ou au devis, reprise par l\'application Études', async () => {
  const c = (await call(etBase, 'POST', '/api/login', { login: 'jacky', password: 'motdepasse1' })).cookie;
  // Étude faite avant la commande, pour un client
  const r = await call(etBase, 'PUT', '/api/etudes/et-av1', { data: { objet: 'Avant-projet chaufferie', affaireId: '', clientId: 'e1', notes: [] }, resume: { objet: 'Avant-projet chaufferie', clientId: 'e1' } }, c);
  assert.strictEqual(r.status, 200);
  const sans = await attendre(async () => (await call(pfBase, 'GET', '/api/liens?app=etudes&sansChantier=1', null, pfJacky)).body.find(x => x.id === 'et-av1'));
  assert.ok(sans, 'étude sans chantier visible dans Pipe-Fit');
  assert.strictEqual(sans.clientId, 'e1');
  // Reliée au chantier dans le CRM (commande reçue) : un nouvel enregistrement sans chantier ne la délie pas
  assert.strictEqual((await call(pfBase, 'POST', '/api/liens/etudes/et-av1/relier', { affaireId: 'inconnu' }, pfJacky)).status, 400);
  const rel = await call(pfBase, 'POST', '/api/liens/etudes/et-av1/relier', { affaireId: 'af2' }, pfJacky);
  assert.deepStrictEqual([rel.status, rel.body.affaireId, rel.body.relie.par], [200, 'af2', 'jacky']);
  // L'application Études reprend le chantier : à l'enregistrement…
  const r2 = await call(etBase, 'PUT', '/api/etudes/et-av1', { data: { objet: 'Avant-projet chaufferie', affaireId: '', clientId: 'e1', notes: [] }, version: 1, resume: { objet: 'Avant-projet chaufferie' } }, c);
  assert.strictEqual(r2.body.affaireId, 'af2');
  // … et à l'ouverture de la liste
  await call(etBase, 'PUT', '/api/etudes/et-av2', { data: { objet: 'Étude réseau', affaireId: '', notes: [] }, resume: { objet: 'Étude réseau' } }, c);
  await attendre(async () => (await call(pfBase, 'GET', '/api/liens?app=etudes', null, pfJacky)).body.find(x => x.id === 'et-av2'));
  await call(pfBase, 'POST', '/api/liens/etudes/et-av2/relier', { affaireId: 'af4' }, pfJacky);
  assert.strictEqual((await call(etBase, 'GET', '/api/etudes', null, c)).body.find(x => x.id === 'et-av2').affaireId, 'af4');

  // Reliée à un devis : le chantier créé à son acceptation la reprend tout seul
  await call(etBase, 'PUT', '/api/etudes/et-av3', { data: { objet: 'Étude devis', affaireId: '', clientId: 'e1', devisId: 'dv-et', notes: [] }, resume: { objet: 'Étude devis' } }, c);
  const admin = (await call(pfBase, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call(pfBase, 'PUT', '/api/records/devis/dv-et', { data: { clientId: 'e1', objet: 'Chaufferie', statut: 'Envoyé', lignes: [] } }, admin);
  assert.strictEqual((await attendre(async () => (await call(pfBase, 'GET', '/api/liens?devisId=dv-et', null, pfJacky)).body[0])).affaireId, '');
  await call(pfBase, 'PUT', '/api/records/affaires/af-et', { data: { nom: 'Chaufferie', clientId: 'e1', devisId: 'dv-et', statut: 'En préparation' } }, admin);
  const l = (await call(pfBase, 'GET', '/api/liens?devisId=dv-et', null, pfJacky)).body[0];
  assert.deepStrictEqual([l.id, l.affaireId], ['et-av3', 'af-et']);
  // Supprimée dans l'application : retirée
  await call(etBase, 'DELETE', '/api/etudes/et-av3', {}, c);
  assert.ok(await attendre(async () => !(await call(pfBase, 'GET', '/api/liens?app=etudes', null, pfJacky)).body.some(x => x.id === 'et-av3')));
});

test('matériel retenu des études : visible sur le chantier par les compagnons, refusés écartés, réglage respecté', async () => {
  const materiel = [
    { cle: 'aero|cta-df|3000', chapitre: 'Aéraulique', designation: 'Centrale de traitement d\'air 3 000 m³/h double flux', qte: 1, fabricant: 'France Air', reference: 'CTA-X 3000 DF', statut: 'Validé', dateValidation: '2026-10-30' },
    { cle: 'bouche|plafond|160', chapitre: 'Aéraulique', designation: 'Diffuseur plafond col Ø 160', qte: 8, fabricant: 'Aldes', reference: 'DFC 160', statut: 'Soumis au client' },
    { cle: 'pompe|x', chapitre: 'Équipements hydrauliques', designation: 'Pompe', qte: 1, fabricant: 'Wilo', reference: 'Stratos 40/1-8', statut: 'Refusé' },
  ];
  assert.strictEqual((await call(pfBase, 'PUT', '/api/liens/etudes/et-mat', { affaireId: 'af-mat', resume: { objet: 'CTA bureaux', materiel } }, pfJacky)).status, 200);
  const r = await call(pfBase, 'GET', '/api/liens/materiel?affaireId=af-mat', null, pfMarc);
  assert.strictEqual(r.status, 200, 'compagnon autorisé');
  assert.deepStrictEqual(r.body.map(m => [m.reference, m.valide]), [['CTA-X 3000 DF', true], ['DFC 160', false]]);
  assert.strictEqual(r.body[0].etude, 'CTA bureaux');
  // Réglage « matériel » décoché pour les compagnons : rien ; le bureau voit toujours
  const admin = (await call(pfBase, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  const s = (await call(pfBase, 'GET', '/api/data', null, admin)).body.settings || {};
  await call(pfBase, 'PUT', '/api/settings', { ...s, compagnon: { ...(s.compagnon || {}), materiel: false } }, admin);
  assert.deepStrictEqual((await call(pfBase, 'GET', '/api/liens/materiel?affaireId=af-mat', null, pfMarc)).body, []);
  assert.strictEqual((await call(pfBase, 'GET', '/api/liens/materiel?affaireId=af-mat', null, pfJacky)).body.length, 2);
  await call(pfBase, 'PUT', '/api/settings', s, admin);
});
