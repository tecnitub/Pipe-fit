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
  assert.ok(dk.materiels.length && dk.materiels.every(m => (m.affectation.userId === 'o1' || /mesure/i.test(m.categorie) || m.scan) && m.valeur === undefined)); // les siens, les appareils de mesure (manomètre des épreuves) et l'outillage étiqueté QR
  assert.strictEqual((await call('PUT', '/api/records/habilitations/hbx', { data: { userId: 'o1', cle: 'sst', expire: '2030-01-01' } }, k)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/materiels/pm2', { data: { designation: 'x' } }, k)).status, 403);
  // Le bureau renouvelle : nouvelle alerte seulement à la prochaine échéance
  assert.strictEqual((await call('PUT', '/api/records/habilitations/hb4', { data: { userId: 'o1', cle: 'sst', obtenue: '2026-10-18', expire: '2028-10-18' }, version: 1 }, c)).status, 200);
  assert.strictEqual(await NOTIFS.echeances(), 0);
});

test('stock et outillage étiqueté QR : sortie vers un chantier et outil pris par un compagnon', async () => {
  const k = (await call('POST', '/api/login', { login: 'kevin', password: 'motdepasse1' })).cookie;
  // Outil étiqueté : pris puis rendu ; véhicule non étiqueté : refusé
  const pris = await call('POST', '/api/parc/scan', { materielId: 'pm4', action: 'prendre', affaireId: 'af1' }, k);
  assert.strictEqual(pris.status, 200);
  assert.deepStrictEqual([pris.body.affectation.userId, pris.body.affectation.affaireId, pris.body.valeur], ['o1', 'af1', undefined]);
  assert.strictEqual((await call('POST', '/api/parc/scan', { materielId: 'pm2', action: 'prendre' }, k)).status, 404);
  assert.strictEqual((await call('POST', '/api/parc/scan', { materielId: 'pm4', action: 'rendre' }, k)).body.affectation.userId, '');
  // Sortie du stock par le compagnon : prix de la bibliothèque repris par le serveur
  const r = await call('PUT', '/api/records/consommations/cs-test', { data: { articleId: 'a14', designation: 'Té', unite: 'u', qte: 2, affaireId: 'af1', userId: 'o1', date: '2026-11-02', stock: true } }, k);
  assert.strictEqual(r.status, 200);
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  const d = (await call('GET', '/api/data', null, admin)).body;
  assert.strictEqual(d.consommations.find(c => c.id === 'cs-test').cout, 30);
  assert.ok(d.mouvementsStock.length >= 5);
  // Entrées et inventaires : réservés au bureau
  assert.strictEqual((await call('PUT', '/api/records/mouvementsStock/msx', { data: { articleId: 'a14', type: 'entree', qte: 10, userId: 'o1' } }, k)).status, 403);
});

test('demande de matériel du terrain : consultations par fournisseurs, sans Microsoft 365 rien ne part', async () => {
  const k = (await call('POST', '/api/login', { login: 'kevin', password: 'motdepasse1' })).cookie;
  const r = await call('POST', '/api/consultations/terrain', { affaireId: 'af1', lignes: [{ articleId: 'a4', qte: 3 }, { designation: 'Joint spécial', famille: 'Divers', qte: 2 }] }, k);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.envoyes, 0);
  assert.ok(r.body.consultations[0].fournisseurs.length >= 1 && r.body.consultations[0].fournisseurs.every(f => !f.envoye && /non configurés/.test(f.raison)));
  assert.strictEqual(r.body.aChoisir.lignes, 1);
  assert.strictEqual((await call('POST', '/api/consultations/terrain', { affaireId: 'af1', lignes: [] }, k)).status, 400);
  // Le compagnon ne voit pas les consultations ; le bureau oui, avec le n° et l'origine « terrain »
  assert.strictEqual(((await call('GET', '/api/data', null, k)).body.consultations || []).length, 0);
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  const cs = (await call('GET', '/api/data', null, admin)).body.consultations.filter(c => c.terrain);
  assert.strictEqual(cs.length, 2); assert.ok(cs.every(c => /^CS-/.test(c.ref)));
  // Fournisseurs par famille : bureau seulement
  assert.strictEqual((await call('PUT', '/api/achats/familles-fournisseurs', { Divers: { prefere: 'e5', autres: ['e6', 'e5', 'e11', 'e12', 'e7', 'e9'] } }, admin)).body.Divers.autres.length, 3);
  assert.strictEqual((await call('GET', '/api/achats/familles-fournisseurs', null, k)).status, 403);
});

test('commande préparée sous le seuil du compagnon : rien ne part sans validation ; suivi « Mes demandes »', async () => {
  const k = (await call('POST', '/api/login', { login: 'kevin', password: 'motdepasse1' })).cookie;
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  const r = await call('POST', '/api/consultations/terrain', { affaireId: 'af1', lignes: [{ articleId: 'a14', qte: 4 }] }, k);
  const id = r.body.consultations[0].id;
  let c = (await call('GET', '/api/data', null, admin)).body.consultations.find(x => x.id === id);
  // Offres reçues : 120 € HT chez le premier (sous le seuil de 500 € de Kevin), les autres déclinent
  c.fournisseurs = c.fournisseurs.map((f, i) => (i === 0 ? { ...f, statut: 'Offre reçue', offre: { prix: { 0: 30 }, delai: '2' } } : { ...f, statut: 'Décline' }));
  assert.strictEqual((await call('PUT', `/api/records/consultations/${id}`, { data: c, version: c._v }, admin)).status, 200);
  await new Promise(res => setTimeout(res, 150));
  let d = (await call('GET', '/api/data', null, admin)).body;
  c = d.consultations.find(x => x.id === id);
  assert.ok(c.retenu && c.retenu.auto && c.retenu.net === 120, JSON.stringify(c.retenu));
  let cmd = d.commandes.find(x => x.consultationId === id);
  assert.ok(cmd && /^CF-/.test(cmd.numero) && cmd.statut === 'Brouillon' && cmd.aValider === true); // préparée, rien n'est parti
  assert.ok(!d.envois.some(e => e.docId === cmd.id));
  let e = (await call('GET', '/api/consultations/terrain/miennes', null, k)).body.find(x => x.id === id);
  assert.deepStrictEqual([e.etat, e.peutValider, e.commandeId], ['avalider', true, cmd.id]);
  assert.ok(!JSON.stringify(e).includes('"pu"'));
  // Validation par le compagnon (sous son seuil) : sans Microsoft 365, validée mais non envoyée
  const v = await call('POST', `/api/commandes/${cmd.id}/valider`, {}, k);
  assert.strictEqual(v.status, 200, JSON.stringify(v.body));
  assert.deepStrictEqual([v.body.envoye, /non configurés/.test(v.body.raison)], [false, true]);
  assert.strictEqual((await call('POST', `/api/commandes/${cmd.id}/valider`, {}, k)).status, 409);
  cmd = (await call('GET', '/api/data', null, admin)).body.commandes.find(x => x.id === cmd.id);
  assert.ok(!cmd.aValider && cmd.validee && cmd.validee.compagnon);
  e = (await call('GET', '/api/consultations/terrain/miennes', null, k)).body.find(x => x.id === id);
  assert.strictEqual(e.etat, 'commandee');
  // Retenir de nouveau : refusé ; compagnon : refusé
  assert.strictEqual((await call('POST', `/api/consultations/${id}/retenir`, { entrepriseId: cmd.fournisseurId }, admin)).status, 409);
  assert.strictEqual((await call('POST', `/api/consultations/${id}/retenir`, { entrepriseId: cmd.fournisseurId }, k)).status, 403);
  assert.ok((await call('GET', '/api/data', null, k)).body.notifications.some(n => n.type === 'demande-materiel' && n.texte.includes(cmd.numero)));
});
