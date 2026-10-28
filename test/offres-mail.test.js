// Offres fournisseurs reçues par e-mail : reconnaissance de la consultation (n° ou code du chantier dans l'objet) et du
// fournisseur (adresse, domaine, nom), e-mail transféré par un collègue, boîte des offres relevée (Microsoft Graph simulé).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const OffreMail = require('../public/js/offre-mail');

const D = {
  affaires: [{ id: 'a1', code: 'CH-2026-014' }, { id: 'a2', code: 'CH-2026-015' }],
  entreprises: [{ id: 'e1', nom: 'Téréva', email: 'voiron@tereva.example' }, { id: 'e2', nom: 'Inox Distribution', email: 'devis@inoxdistri.example' }, { id: 'e3', nom: 'Cédéo', email: 'cedeo38@gmail.com' }],
  contacts: [{ id: 'k1', entrepriseId: 'e2', email: 'paul.martin@inoxdistri.example' }],
  consultations: [
    { id: 'c1', ref: 'CS-2026-0007', affaireId: 'a1', statut: 'En cours', fournisseurs: [{ entrepriseId: 'e1', statut: 'Envoyée' }, { entrepriseId: 'e2', statut: 'Envoyée' }, { entrepriseId: 'e3', statut: 'Envoyée' }] },
    { id: 'c2', ref: 'CS-2026-0008', affaireId: 'a2', statut: 'En cours', fournisseurs: [{ entrepriseId: 'e2', statut: 'Offre reçue' }, { entrepriseId: 'e1', statut: 'Envoyée' }] },
    { id: 'c3', ref: 'CS-2026-0001', affaireId: 'a2', statut: 'Close', fournisseurs: [{ entrepriseId: 'e1', statut: 'Offre reçue' }] }],
  internes: ['achats@tecnitub.example', 'tecnitub.example'],
};
const rec = mail => { const r = OffreMail.reconnaitre(mail, D); return r && [r.consultation.id, r.fournisseurId, r.raison]; };

test('consultation reconnue par son n° dans l\'objet, fournisseur par son adresse ou son domaine', () => {
  assert.deepStrictEqual(rec({ objet: 'RE: Demande de prix CS-2026-0007', deEmail: 'voiron@tereva.example' }), ['c1', 'e1', 'n° CS-2026-0007']);
  assert.deepStrictEqual(rec({ objet: 'Offre CS-2026-0007', deEmail: 'p.durand@inoxdistri.example' }), ['c1', 'e2', 'n° CS-2026-0007']);
  // Un n° plus long ne se confond pas avec un autre
  assert.strictEqual(rec({ objet: 'Offre CS-2026-00071', deEmail: 'voiron@tereva.example' }), null);
});

test('e-mail transféré par un collègue : l\'expéditeur interne est ignoré, l\'adresse ou le nom du fournisseur cité dans le message compte', () => {
  const texte = '---------- Message transféré ----------\nDe : Inox Distribution <paul.martin@inoxdistri.example>\nObjet : votre demande';
  assert.deepStrictEqual(rec({ objet: 'TR: offre CS-2026-0007', deEmail: 'achats@tecnitub.example', texte }), ['c1', 'e2', 'n° CS-2026-0007']);
  assert.deepStrictEqual(rec({ objet: 'TR: offre CS-2026-0007', deEmail: 'jean@tecnitub.example', texte: 'Voici le prix de Téréva' }), ['c1', 'e1', 'n° CS-2026-0007']);
  // Messagerie grand public : l'adresse exacte reconnaît Cédéo, pas le domaine gmail.com
  assert.deepStrictEqual(rec({ objet: 'CS-2026-0007', deEmail: 'cedeo38@gmail.com' }), ['c1', 'e3', 'n° CS-2026-0007']);
  assert.deepStrictEqual(rec({ objet: 'CS-2026-0007', deEmail: 'autre@gmail.com' }), ['c1', '', 'n° CS-2026-0007']);
});

test('sans n° : code du chantier, consultations en cours seulement ; seul fournisseur attendu ; rien de reconnu', () => {
  assert.deepStrictEqual(rec({ objet: 'Prix chantier CH-2026-015', deEmail: 'voiron@tereva.example' }), ['c2', 'e1', 'chantier CH-2026-015']);
  assert.deepStrictEqual(rec({ objet: 'TR: prix chantier CH-2026-015', deEmail: 'jean@tecnitub.example' }), ['c2', 'e1', 'chantier CH-2026-015, seul fournisseur attendu']);
  assert.strictEqual(rec({ objet: 'Tarifs 2027', deEmail: 'voiron@tereva.example' }), null);
});

test('rangement : offre « reçue, à lire » avec ses pièces, sinon parmi les offres à classer', () => {
  const c = JSON.parse(JSON.stringify(D.consultations[0]));
  c.fournisseurs[0].offre = { prix: { 0: 12 }, delai: '5' };
  const mail = { de: 'Téréva', deEmail: 'voiron@tereva.example', objet: 'Offre', recuLe: '2026-10-28T08:00:00Z' };
  assert.deepStrictEqual(OffreMail.appliquer(c, 'e1', [{ id: 'p1', nom: 'offre.pdf' }], mail), { classee: true });
  const o = c.fournisseurs[0].offre;
  assert.deepStrictEqual([c.fournisseurs[0].statut, o.aLire, o.pieceId, o.pieceNom, o.date, o.prix[0], o.delai, o.mail.deEmail], ['Offre reçue', true, 'p1', 'offre.pdf', '2026-10-28', 12, '5', 'voiron@tereva.example']);
  assert.deepStrictEqual(OffreMail.appliquer(c, '', [{ id: 'p2', nom: 'x.pdf' }], mail), { classee: false });
  assert.deepStrictEqual(c.offresAClasser.map(x => x.pieces[0].id), ['p2']);
  assert.match(OffreMail.texteDe('<p>De&nbsp;: A &lt;a@b.fr&gt;</p><style>p{}</style>'), /De : A <a@b\.fr>/);
});

// Faux Microsoft 365 : boîte « offres@ » avec trois messages non lus
const b64 = b => Buffer.from(b).toString('base64');
const pdf = '%PDF-1.4\n% offre\n%%EOF';
const appels = [], lus = new Set(), dossiers = [];
let ref = ''; // n° donné par le serveur à la consultation
const MESSAGES = [
  { id: 'm1', subject: 'TR: Votre demande de prix CS-REF', from: { emailAddress: { name: 'Claire', address: 'claire@tecnitub.example' } }, receivedDateTime: '2026-10-28T07:00:00Z', hasAttachments: true,
    body: { content: '<p>---------- Message transféré ---------<br>De : Inox Distribution &lt;devis@inoxdistri.example&gt;</p>' },
    pj: [{ '@odata.type': '#microsoft.graph.fileAttachment', name: 'signature.png', isInline: true, contentBytes: b64('png') }, { '@odata.type': '#microsoft.graph.fileAttachment', name: 'Offre 4471.pdf', contentBytes: b64(pdf) }] },
  { id: 'm2', subject: 'Nos tarifs', from: { emailAddress: { name: 'Téréva', address: 'voiron@tereva.example' } }, receivedDateTime: '2026-10-28T08:00:00Z', hasAttachments: true, body: { content: '' },
    pj: [{ '@odata.type': '#microsoft.graph.fileAttachment', name: 'tarifs.pdf', contentBytes: b64(pdf) }] },
  { id: 'm3', subject: 'RE: CS-REF', from: { emailAddress: { name: 'Téréva', address: 'voiron@tereva.example' } }, receivedDateTime: '2026-10-28T09:00:00Z', hasAttachments: false, body: { content: 'Je reviens vers vous' }, pj: [] }];
const graph = http.createServer((req, res) => {
  let corps = ''; req.on('data', c => { corps += c; });
  req.on('end', () => {
    const u = decodeURIComponent(req.url);
    appels.push({ m: req.method, u, b: corps.startsWith('{') ? JSON.parse(corps) : null });
    res.setHeader('Content-Type', 'application/json');
    if (u.includes('/oauth2/v2.0/token')) return res.end(JSON.stringify({ access_token: 'jeton', expires_in: 3600 }));
    if (u.includes('/mailFolders/inbox/messages')) return res.end(JSON.stringify({ value: MESSAGES.filter(m => !lus.has(m.id)).map(({ pj, ...m }) => m) }).replaceAll('CS-REF', ref));
    let m = /\/messages\/(\w+)\/attachments$/.exec(u);
    if (m) return res.end(JSON.stringify({ value: MESSAGES.find(x => x.id === m[1]).pj }));
    m = /\/messages\/(\w+)$/.exec(u);
    if (m && req.method === 'PATCH') { lus.add(m[1]); return res.end('{}'); }
    if (u.includes('/childFolders') && req.method === 'GET') return res.end(JSON.stringify({ value: dossiers }));
    if (u.includes('/childFolders') && req.method === 'POST') { dossiers.push({ id: 'dos1', displayName: JSON.parse(corps).displayName }); return res.end(JSON.stringify(dossiers[0])); }
    if (/\/move$/.test(u)) return res.end('{}');
    if (/\/sendMail$/.test(u)) { res.statusCode = 202; return res.end('{}'); }
    res.statusCode = 404; return res.end('{}');
  });
});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-offres-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
let base, server;
before(async () => {
  await new Promise(r => graph.listen(0, '127.0.0.1', r));
  process.env.M365_LOGIN_URL = process.env.M365_GRAPH_URL = `http://127.0.0.1:${graph.address().port}`;
  ({ server } = require('../server/server'));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); server.closeAllConnections(); graph.close(); fs.rmSync(dir, { recursive: true, force: true }); });
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};

test('boîte des offres : offre transférée rangée chez le fournisseur, non reconnus laissés non lus, réponse des demandes de prix vers la boîte', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  assert.strictEqual((await call('GET', '/api/offres/etat', null, admin)).body.actif, false);
  assert.strictEqual((await call('POST', '/api/offres/relever', {}, admin)).status, 400);
  assert.strictEqual((await call('PUT', '/api/efacture/config', { offres: { actif: true, adresse: 'pas une adresse' } }, admin)).status, 400);
  const cfg = await call('PUT', '/api/efacture/config', { offres: { actif: true, adresse: 'Offres@Tecnitub.example' } }, admin);
  assert.deepStrictEqual(cfg.body.offres, { actif: true, adresse: 'offres@tecnitub.example', dossier: 'Offres traitées' });
  await call('PUT', '/api/records/entreprises/f-inox', { data: { nom: 'Inox Distribution', email: 'devis@inoxdistri.example', categorie: 'Fournisseur' } }, admin);
  await call('PUT', '/api/records/entreprises/f-tereva', { data: { nom: 'Téréva', email: 'voiron@tereva.example', categorie: 'Fournisseur' } }, admin);
  const c = (await call('PUT', '/api/records/consultations/cs-mail', { data: { statut: 'En cours', lignes: [{ designation: 'Coude DN50', qte: 10 }],
    fournisseurs: [{ entrepriseId: 'f-tereva', statut: 'Envoyée' }, { entrepriseId: 'f-inox', statut: 'Envoyée' }] } }, admin)).body;
  ref = c.ref;
  assert.match(ref, /^CS-\d{4}-\d+$/);
  await call('PUT', '/api/m365', { tenantId: 't', clientId: 'c', clientSecret: 's', actif: true }, admin);
  const r = (await call('POST', '/api/offres/relever', {}, admin)).body;
  assert.deepStrictEqual([r.messages, r.offres, r.aClasser, r.nonReconnues, r.sansPiece, r.erreurs.length], [3, 1, 0, 1, 1, 0]);
  assert.deepStrictEqual([...lus], ['m1'], 'non reconnus : restés non lus');
  assert.deepStrictEqual(appels.filter(a => /\/move$/.test(a.u)).map(a => [a.u.split('/messages/')[1], a.b.destinationId]), [['m1/move', 'dos1']]);
  assert.strictEqual(dossiers[0].displayName, 'Offres traitées');
  assert.ok(appels.every(a => !/users\//.test(a.u) || a.u.includes('/users/offres@tecnitub.example/')));
  const cs = (await call('GET', '/api/data', null, admin)).body.consultations.find(x => x.id === 'cs-mail'), f = cs.fournisseurs.find(x => x.entrepriseId === 'f-inox');
  assert.deepStrictEqual([f.statut, f.offre.aLire, f.offre.pieceNom, f.offre.mail.deEmail, cs.fournisseurs[0].statut], ['Offre reçue', true, 'Offre 4471.pdf', 'claire@tecnitub.example', 'Envoyée']);
  const piece = await fetch(`${base}/api/files/${f.offre.pieceId}`, { headers: { Cookie: admin } });
  assert.deepStrictEqual([piece.headers.get('content-type'), await piece.text()], ['application/pdf', pdf]);
  const etat = (await call('GET', '/api/offres/etat', null, admin)).body;
  assert.deepStrictEqual([etat.actif, etat.adresse, !!etat.dernier, etat.nonReconnues.map(x => x.objet)], [true, 'offres@tecnitub.example', true, ['Nos tarifs', `RE: ${ref}`]]);
  // Demande de prix envoyée depuis l'appli : le fournisseur répond dans la boîte des offres
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', email: 'claire@tecnitub.example' }, admin);
  const claire = (await call('POST', '/api/login', { login: 'claire', password: 'motdepasse1' })).cookie;
  const m = await call('POST', '/api/mail', { type: 'consultation', to: ['voiron@tereva.example'], subject: `Demande de prix ${ref}`, html: '<p>Bonjour</p>' }, claire);
  assert.strictEqual(m.status, 200, JSON.stringify(m.body));
  const envoi = appels.filter(a => /\/sendMail$/.test(a.u)).pop();
  assert.deepStrictEqual(envoi.b.message.replyTo, [{ emailAddress: { address: 'offres@tecnitub.example' } }]);
  await call('POST', '/api/mail', { type: 'devis', to: ['client@exemple.fr'], subject: 'Devis', html: '<p>Bonjour</p>' }, claire);
  assert.strictEqual(appels.filter(a => /\/sendMail$/.test(a.u)).pop().b.message.replyTo, undefined);
});
