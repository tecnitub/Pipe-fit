// Tests de l'API : connexion, droits, conflits de version, numérotation, factures.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const { server } = require('../server/server');

let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });

async function call(method, url, body, cookie) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: method !== 'GET' ? JSON.stringify(body || {}) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
// Les compagnons ne pointent que sur la semaine en cours
const aujourdhui = require('../public/js/pointage-regles').jourIso(new Date());
async function login(l, p) { const r = await call('POST', '/api/login', { login: l, password: p }); assert.strictEqual(r.status, 200); return r.cookie; }

test('accès refusé sans connexion, mauvais mot de passe refusé', async () => {
  assert.strictEqual((await call('GET', '/api/data')).status, 401);
  assert.strictEqual((await call('POST', '/api/login', { login: 'admin', password: 'x' })).status, 401);
});

test('écriture refusée sans Content-Type JSON (protection CSRF)', async () => {
  const c = await login('admin', 'admin-test-pw');
  const res = await fetch(base + '/api/records/entreprises/x', { method: 'PUT', headers: { Cookie: c, 'Content-Type': 'text/plain' }, body: '{}' });
  assert.strictEqual(res.status, 415);
});

test('droits par rôle, conflits de version et numérotation', async () => {
  const admin = await login('admin', 'admin-test-pw');
  assert.strictEqual((await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire' }, admin)).status, 200);
  assert.strictEqual((await call('POST', '/api/accounts', { login: 'atelier', password: 'motdepasse2', role: 'atelier', userId: 'o1' }, admin)).status, 200);
  const claire = await login('claire', 'motdepasse1');
  const atelier = await login('atelier', 'motdepasse2');

  // Données de démo partagées
  const data = (await call('GET', '/api/data', null, claire)).body;
  assert.ok(data.affaires.length > 0);

  // Atelier : heures oui, entreprises non
  assert.strictEqual((await call('PUT', '/api/records/temps/t-test', { data: { affaireId: 'af1', userId: 'o1', date: aujourdhui, heures: 4 } }, atelier)).status, 200);
  // ... et pour un collègue qui a travaillé avec lui, mais pas pour le bureau
  assert.strictEqual((await call('PUT', '/api/records/temps/t-autre', { data: { affaireId: 'af1', userId: 'o2', date: aujourdhui, heures: 4 } }, atelier)).status, 200);
  assert.strictEqual((await call('PUT', '/api/records/temps/t-bureau', { data: { affaireId: 'af1', userId: 'u1', date: aujourdhui, heures: 4 } }, atelier)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/entreprises/c-test', { data: { nom: 'X' } }, atelier)).status, 403);
  // Chargé : pas les paramètres ni les comptes
  assert.strictEqual((await call('PUT', '/api/settings', { tva: 20 }, claire)).status, 403);
  assert.strictEqual((await call('GET', '/api/accounts', null, claire)).status, 403);

  // Conflit : deux utilisateurs modifient la même version
  const c1 = data.entreprises[0];
  const r1 = await call('PUT', `/api/records/entreprises/${c1.id}`, { data: { ...c1, ville: 'Albi' }, version: c1._v }, claire);
  assert.strictEqual(r1.status, 200);
  assert.strictEqual(r1.body._v, c1._v + 1);
  const r2 = await call('PUT', `/api/records/entreprises/${c1.id}`, { data: { ...c1, ville: 'Castres' }, version: c1._v }, admin);
  assert.strictEqual(r2.status, 409);
  assert.strictEqual(r2.body.record.ville, 'Albi');

  // Numéro de devis attribué par le serveur, à la suite des existants
  const year = new Date().getFullYear();
  const [d1, d2] = await Promise.all([
    call('PUT', '/api/records/devis/dv-a', { data: { affaireId: 'af1', lignes: [] } }, claire),
    call('PUT', '/api/records/devis/dv-b', { data: { affaireId: 'af1', lignes: [] } }, admin),
  ]);
  const nums = [d1.body.numero, d2.body.numero].sort();
  assert.deepStrictEqual(nums, [`DV-${year}-0008`, `DV-${year}-0009`]);

  // Facture : un chargé ne peut changer que le statut, ni la supprimer
  const fa = (await call('PUT', '/api/records/factures/fa-x', { data: { affaireId: 'af1', statut: 'Émise', lignes: [{ qte: 1, pu: 100 }] } }, claire)).body;
  assert.strictEqual(fa.numero, `FA-${year}-0004`);
  const upd = await call('PUT', '/api/records/factures/fa-x', { data: { ...fa, statut: 'Payée', lignes: [], numero: 'FA-HACK' }, version: fa._v }, claire);
  assert.strictEqual(upd.body.statut, 'Payée');
  assert.strictEqual(upd.body.lignes.length, 1);
  assert.strictEqual(upd.body.numero, fa.numero);
  assert.strictEqual((await call('DELETE', '/api/records/factures/fa-x', {}, claire)).status, 403);
  // Numérotation continue : même l'administrateur ne supprime pas une facture, il établit un avoir
  assert.strictEqual((await call('DELETE', '/api/records/factures/fa-x', {}, admin)).status, 403);
  const av = (await call('PUT', '/api/records/factures/av-x', { data: { type: 'avoir', factureId: 'fa-x', affaireId: 'af1', statut: 'Émis', lignes: [{ qte: 1, pu: 100 }] } }, claire)).body;
  assert.strictEqual(av.numero, `AV-${year}-0002`); // AV-0001 dans les données de démonstration
  assert.strictEqual(av.type, 'avoir');
  // Le type d'une pièce ne change pas après coup (un chargé ne modifie que le statut et la transmission comptable)
  const av2 = (await call('PUT', '/api/records/factures/av-x', { data: { ...av, type: '', statut: 'Imputé', exportCompta: { date: '2026-10-01' } }, version: av._v }, claire)).body;
  assert.strictEqual(av2.type, 'avoir'); assert.strictEqual(av2.statut, 'Imputé'); assert.strictEqual(av2.exportCompta.date, '2026-10-01');
  // Reprise d'une numérotation : prochain numéro imposé, jamais en dessous d'un numéro attribué
  assert.strictEqual((await call('GET', '/api/numerotation', null, claire)).status, 403);
  const etat = (await call('GET', '/api/numerotation', null, admin)).body;
  assert.strictEqual(etat.facture.exemple, `FA-${year}-0005`);
  assert.strictEqual((await call('PUT', '/api/numerotation', { cle: 'facture', prochain: 3 }, admin)).status, 400);
  assert.strictEqual((await call('PUT', '/api/numerotation', { cle: 'facture', prochain: 153 }, admin)).body.facture.exemple, `FA-${year}-0153`);
  assert.strictEqual((await call('PUT', '/api/records/factures/fa-y', { data: { affaireId: 'af1', statut: 'Émise', lignes: [] } }, claire)).body.numero, `FA-${year}-0153`);
  // Format paramétrable : F2026/00154…
  const st = (await call('GET', '/api/data', null, admin)).body.settings;
  await call('PUT', '/api/settings', { ...st, numerotation: { facture: { prefixe: 'F', separateur: '/', annee: 'AAAA', chiffres: 5 } } }, admin);
  assert.strictEqual((await call('PUT', '/api/records/factures/fa-z', { data: { affaireId: 'af1', statut: 'Émise', lignes: [] } }, claire)).body.numero, `F/${year}/00001`);
  await call('PUT', '/api/settings', st, admin);

  // Compagnon (chef d'équipe ou non) : pointe pour les intérimaires et ses collègues, pas pour le bureau ; un pointage validé est verrouillé
  assert.strictEqual((await call('POST', '/api/accounts', { login: 'lucas', password: 'motdepasse3', role: 'atelier', userId: 'o3' }, admin)).status, 200);
  const lucas = await login('lucas', 'motdepasse3');
  assert.strictEqual((await call('PUT', '/api/records/temps/t-i1', { data: { affaireId: 'af1', userId: 'i1', date: aujourdhui, heures: 8 } }, lucas)).status, 200);
  assert.strictEqual((await call('PUT', '/api/records/temps/t-o1', { data: { affaireId: 'af1', userId: 'o1', date: aujourdhui, heures: 8 } }, lucas)).status, 200);
  assert.strictEqual((await call('PUT', '/api/records/temps/t-u2', { data: { affaireId: 'af1', userId: 'u2', date: aujourdhui, heures: 8 } }, lucas)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/temps/t-i1b', { data: { affaireId: 'af1', userId: 'i1', date: aujourdhui, heures: 8, statut: 'Validé' } }, lucas)).status, 403);
  const ti = (await call('GET', '/api/data', null, claire)).body.temps.find(t => t.id === 't-i1');
  const val = await call('PUT', '/api/records/temps/t-i1', { data: { ...ti, statut: 'Validé' }, version: ti._v }, claire);
  assert.strictEqual(val.status, 200);
  assert.strictEqual((await call('PUT', '/api/records/temps/t-i1', { data: { ...val.body, heures: 12 }, version: val.body._v }, lucas)).status, 403);
  assert.strictEqual((await call('DELETE', '/api/records/temps/t-i1', {}, lucas)).status, 403);

  // Note de frais avec photo du justificatif
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const up = await call('POST', '/api/files', { dataUrl: png }, atelier);
  assert.strictEqual(up.status, 200);
  const img = await fetch(base + '/api/files/' + up.body.id, { headers: { Cookie: atelier } });
  assert.strictEqual(img.headers.get('content-type'), 'image/png');
  assert.strictEqual((await call('POST', '/api/files', { dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }, atelier)).status, 400);
  const nf = await call('PUT', '/api/records/frais/nf-x', { data: { userId: 'o1', affaireId: 'af1', montantTTC: 12, photoId: up.body.id, statut: 'Soumise' } }, atelier);
  assert.match(nf.body.numero, new RegExp(`^NF-${year}-\\d{4}$`));
  assert.strictEqual((await call('PUT', '/api/records/frais/nf-y', { data: { userId: 'o2', affaireId: 'af1', montantTTC: 12 } }, atelier)).status, 403);

  // Situation de travaux : numérotation BL indépendante
  const bl = (await call('PUT', '/api/records/situations/bl-x', { data: { affaireId: 'af1', devisId: 'dv1', avancements: {} } }, claire)).body;
  assert.match(bl.numero, new RegExp(`^BL-${year}-0005$`));

  // Commande fournisseur et chantier : numéros attribués par le serveur
  const cf = (await call('PUT', '/api/records/commandes/cf-x', { data: { affaireId: 'af1', lignes: [] } }, claire)).body;
  assert.match(cf.numero, new RegExp(`^CF-${year}-\\d{4}$`));
  const ch = (await call('PUT', '/api/records/affaires/ch-x', { data: { nom: 'Test', code: 'FAUX' } }, claire)).body;
  assert.match(ch.code, new RegExp(`^CH-${year}-\\d{3}$`));

  // Rapport d'intervention : l'opérateur rédige les siens ; PV signé figé ; réserve figée = seule la levée change
  const ri = await call('PUT', '/api/records/rapports/ri-x', { data: { affaireId: 'af1', userId: 'o1', date: '2026-10-02', travaux: 'Soudure', photos: [up.body.id] } }, atelier);
  assert.match(ri.body.numero, new RegExp(`^RI-${year}-0006$`));
  assert.strictEqual((await call('PUT', '/api/records/rapports/ri-y', { data: { affaireId: 'af1', userId: 'o2', travaux: 'x' } }, atelier)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/reserves/rs-x', { data: { affaireId: 'af1', description: 'x' } }, atelier)).status, 403);
  const pvs = (await call('GET', '/api/data', null, claire)).body;
  const pv = pvs.receptions.find(x => x.id === 'pv2');
  assert.strictEqual((await call('PUT', '/api/records/receptions/pv2', { data: { ...pv, decision: 'Sans réserve' }, version: pv._v }, claire)).status, 403);
  assert.strictEqual((await call('DELETE', '/api/records/receptions/pv2', {}, claire)).status, 403);
  const rs = pvs.reserves.find(x => x.id === 'rs4');
  const lev = await call('PUT', '/api/records/reserves/rs4', { data: { ...rs, description: 'modifiée', statut: 'Levée', dateLevee: '2026-10-01' }, version: rs._v }, claire);
  assert.strictEqual(lev.body.description, rs.description);
  assert.strictEqual(lev.body.statut, 'Levée');
  assert.strictEqual((await call('DELETE', '/api/records/reserves/rs4', {}, claire)).status, 403);
  // Hors devis : numéro HD, matériel saisi par l'opérateur, bon signé par le client figé
  const hd = (await call('PUT', '/api/records/affaires/hd-x', { data: { nom: 'Dépannage', type: 'horsDevis', statut: 'Ouvert' } }, claire)).body;
  assert.match(hd.code, new RegExp(`^HD-${year}-\\d{3}$`));
  assert.strictEqual((await call('PUT', '/api/records/consommations/cs-x', { data: { affaireId: 'hd-x', userId: 'o1', articleId: 'a1', qte: 2 } }, atelier)).status, 200);
  assert.strictEqual((await call('PUT', '/api/records/consommations/cs-y', { data: { affaireId: 'hd-x', userId: 'o2', articleId: 'a1', qte: 2 } }, atelier)).status, 403);
  const bon = (await call('PUT', '/api/records/rapports/ri-s', { data: { affaireId: 'hd-x', userId: 'o1', travaux: 'Pose', signatureClientId: up.body.id, signataireNom: 'Client' } }, atelier)).body;
  assert.strictEqual((await call('PUT', '/api/records/rapports/ri-s', { data: { ...bon, travaux: 'modifié' }, version: bon._v }, atelier)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/rapports/ri-s', { data: { ...bon, travaux: 'modifié' }, version: bon._v }, claire)).status, 403);
  assert.strictEqual((await call('DELETE', '/api/records/rapports/ri-s', {}, atelier)).status, 403);
  const csv = await call('PUT', '/api/records/consommations/cs-v', { data: { affaireId: 'hd-x', userId: 'o1', articleId: 'a1', qte: 1, verrouille: true } }, atelier);
  assert.strictEqual((await call('PUT', '/api/records/consommations/cs-v', { data: { ...csv.body, qte: 9 }, version: csv.body._v }, atelier)).status, 403);
  // Factures fournisseurs : référence FF attribuée par le serveur, saisie réservée aux bureaux, pièce jointe PDF acceptée
  const ff = (await call('PUT', '/api/records/achats/ff-x', { data: { fournisseurId: 'e11', montantHT: 100, imputations: [{ affaireId: 'af1', montantHT: 60 }] } }, claire)).body;
  assert.strictEqual(ff.ref, `FF-${year}-0004`);
  assert.strictEqual((await call('PUT', '/api/records/achats/ff-y', { data: { fournisseurId: 'e11' } }, atelier)).status, 403);
  const pdf = await call('POST', '/api/files', { dataUrl: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 test').toString('base64') }, claire);
  assert.strictEqual(pdf.status, 200);
  const pdfRes = await fetch(base + '/api/files/' + pdf.body.id, { headers: { Cookie: claire } });
  assert.strictEqual(pdfRes.headers.get('content-type'), 'application/pdf');
  assert.strictEqual(pdfRes.headers.get('x-content-type-options'), 'nosniff');
  // Images de démonstration servies par le serveur
  assert.strictEqual((await fetch(base + '/api/files/img-sig', { headers: { Cookie: claire } })).headers.get('content-type'), 'image/png');

  // Import groupé : réservé aux bureaux, une seule transaction
  const imp = await call('POST', '/api/bulk/articles', { items: [{ id: 'imp1', ref: 'X-1', designation: 'Test import', prixVente: 10 }, { ref: 'X-2', designation: 'Sans id' }] }, claire);
  assert.strictEqual(imp.status, 200);
  assert.strictEqual(imp.body.length, 2);
  assert.ok(imp.body[1].id);
  assert.strictEqual((await call('POST', '/api/bulk/articles', { items: [{ ref: 'X-3' }] }, atelier)).status, 403);
  assert.strictEqual((await call('POST', '/api/bulk/factures', { items: [{}] }, admin)).status, 400);

  // Historique
  const audit = (await call('GET', '/api/audit', null, admin)).body;
  assert.ok(audit.some(a => a.login === 'claire' && a.action === 'modification'));
});

test('envoi par e-mail via Microsoft 365 (Graph simulé)', async () => {
  const http = require('node:http');
  const recus = [];
  const graph = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      if (req.url.endsWith('/oauth2/v2.0/token')) {
        const p = new URLSearchParams(body);
        if (p.get('client_secret') !== 'secret-ok') { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'invalid_client', error_description: 'Secret invalide' })); }
        res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ access_token: 'jeton', expires_in: 3600 }));
      }
      recus.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
      res.writeHead(202); res.end();
    });
  });
  await new Promise(r => graph.listen(0, '127.0.0.1', r));
  const g = `http://127.0.0.1:${graph.address().port}`;
  process.env.M365_LOGIN_URL = g; process.env.M365_GRAPH_URL = g;
  try {
    const admin = await login('admin', 'admin-test-pw');
    await call('POST', '/api/accounts', { login: 'paul', password: 'motdepasse4', role: 'charge', nom: 'Paul' }, admin);
    await call('POST', '/api/accounts', { login: 'op', password: 'motdepasse5', role: 'atelier', nom: 'Op' }, admin);
    const paul = await login('paul', 'motdepasse4'), op = await login('op', 'motdepasse5');
    const mail = { to: ['t.girard@laiterie-alpes.example'], subject: 'Devis', html: '<p>Bonjour</p>', type: 'devis', numero: 'DV-1', ref: { col: 'devis', id: 'dv1' },
      attachments: [{ name: 'Devis DV-1.pdf', base64: Buffer.from('%PDF-1.4').toString('base64') }] };
    assert.strictEqual((await call('POST', '/api/mail', mail, op)).status, 403);
    assert.strictEqual((await call('POST', '/api/mail', mail, paul)).status, 400); // non configuré
    // Configuration : réservée à l'administrateur, secret jamais renvoyé
    assert.strictEqual((await call('PUT', '/api/m365', { tenantId: 't', clientId: 'c', actif: true }, paul)).status, 403);
    assert.strictEqual((await call('PUT', '/api/m365', { tenantId: 't', clientId: 'c', actif: true }, admin)).status, 400);
    const cfg = await call('PUT', '/api/m365', { tenantId: 'mon-tenant', clientId: 'c', clientSecret: 'secret-ok', actif: true }, admin);
    assert.deepStrictEqual(cfg.body, { tenantId: 'mon-tenant', clientId: 'c', actif: true, secretDefini: true });
    assert.ok(!JSON.stringify((await call('GET', '/api/data', null, admin)).body).includes('secret-ok'));
    assert.strictEqual((await call('GET', '/api/me', null, paul)).body.m365, true);
    // Adresse d'envoi obligatoire sur le compte
    assert.strictEqual((await call('POST', '/api/mail', mail, paul)).status, 400);
    const acc = (await call('GET', '/api/accounts', null, admin)).body.find(a => a.login === 'paul');
    assert.strictEqual((await call('PUT', `/api/accounts/${acc.id}`, { email: 'pas-une-adresse' }, admin)).status, 400);
    assert.strictEqual((await call('PUT', `/api/accounts/${acc.id}`, { email: 'p.dupont@pipefit.example' }, admin)).status, 200);
    assert.strictEqual((await call('POST', '/api/mail', { ...mail, to: ['x@y'] }, paul)).status, 400);
    assert.strictEqual((await call('POST', '/api/mail', { ...mail, attachments: [{ name: 'virus.exe', base64: 'AA==' }] }, paul)).status, 400);
    const ok = await call('POST', '/api/mail', mail, paul);
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(recus.length, 1);
    assert.strictEqual(recus[0].url, '/v1.0/users/p.dupont%40pipefit.example/sendMail');
    assert.strictEqual(recus[0].auth, 'Bearer jeton');
    assert.strictEqual(recus[0].body.saveToSentItems, true);
    assert.strictEqual(recus[0].body.message.attachments[0].name, 'Devis DV-1.pdf');
    assert.strictEqual(recus[0].body.message.toRecipients[0].emailAddress.address, 't.girard@laiterie-alpes.example');
    // Historique de l'envoi rattaché au document
    const envoi = (await call('GET', '/api/data', null, admin)).body.envois.find(e => e.id === ok.body.id);
    assert.strictEqual(envoi.docId, 'dv1');
    assert.strictEqual(envoi.expediteur, 'p.dupont@pipefit.example');
    // Mauvais secret : erreur explicite
    await call('PUT', '/api/m365', { tenantId: 'mon-tenant', clientId: 'c', clientSecret: 'mauvais', actif: true }, admin);
    const ko = await call('POST', '/api/mail', mail, paul);
    assert.strictEqual(ko.status, 502);
    assert.match(ko.body.error, /Secret invalide/);
  } finally { graph.close(); }
});

test('déconnexion invalide la session', async () => {
  const c = await login('admin', 'admin-test-pw');
  await call('POST', '/api/logout', {}, c);
  assert.strictEqual((await call('GET', '/api/me', null, c)).status, 401);
});
