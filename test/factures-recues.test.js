// Factures fournisseurs reçues : lecture d'une facture PDF simple, boîte aux lettres des factures (Microsoft Graph
// simulé), PDF simples acceptés, doublons, refus envoyé au fournisseur.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const F = require('../public/js/facture-lecture');

const NOUS = { siret: '000 000 000 00000', tva: 'FR00000000000', commandes: ['CF-2026-0002'], chantiers: ['CH-2026-001'] };

test('facture PDF : n°, dates, totaux, identifiants du fournisseur (pas les nôtres), commande citée, lignes', () => {
  const r = F.analyser(['INOX DISTRIBUTION RHÔNE-ALPES', 'Client : Pipe-Fit – SIRET 000 000 000 00000 – TVA FR00000000000', 'SIRET 334 222 999 00044 – TVA FR90334222999', 'FACTURE N° IDRA-2026-09112', 'Date : 14/10/2026',
    'Votre commande : CF-2026-0002', 'Réf.\tDésignation\tQté\tPU HT\tMontant HT', 'TUB-316-050\tTube inox 316L DN50 sch10S\t120\t43,20\t5 184,00', 'COU-316-050\tCoude 90° 3D inox 316L DN50\t40\t20,10\t804,00',
    'Frais de port\t45,00', 'Total HT\t6 033,00', 'TVA 20 %\t1 206,60', 'Total TTC\t7 239,60', 'Échéance : 30/11/2026', 'IBAN FR76 3000 4000 0500 0012 3456 789'], NOUS);
  assert.deepStrictEqual([r.numero, r.type, r.date, r.echeance, r.totalHT, r.totalTVA, r.totalTTC, r.coherent], ['IDRA-2026-09112', 'facture', '2026-10-14', '2026-11-30', 6033, 1206.6, 7239.6, true]);
  assert.deepStrictEqual([r.siret, r.siren, r.tva, r.iban, r.refCommande], ['33422299900044', '334222999', 'FR90334222999', 'FR7630004000050000123456789', 'CF-2026-0002']);
  assert.deepStrictEqual(r.lignes.map(l => [l.reference, l.qte, l.pu]), [['TUB-316-050', 120, 43.2], ['COU-316-050', 40, 20.1], ['', 1, 45]]);
  assert.deepStrictEqual(r.manques, []);
});

test('avoir, TVA sur deux taux, HT déduit, date en lettres, chantier cité, champs manquants', () => {
  const r = F.analyser(['AVOIR N° AV-77120', 'Grenoble, le 3 octobre 2026', 'Chantier CH-2026-001', 'TVA 20 % 100,00', 'TVA 5,5 % 5,50', 'Net à payer 705,50 €', 'À payer avant le 02/11/2026'], NOUS);
  assert.deepStrictEqual([r.numero, r.type, r.date, r.echeance, r.totalTVA, r.totalTTC, r.totalHT, r.refAcheteur], ['AV-77120', 'avoir', '2026-10-03', '2026-11-02', 105.5, 705.5, 600, 'CH-2026-001']);
  assert.deepStrictEqual(F.analyser(['Merci de votre confiance'], NOUS).manques, ['n° de facture', 'date', 'total HT', 'total TTC']);
});

// Faux Microsoft 365 : boîte « factures@ » avec trois messages non lus
const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% facture simple\n%%EOF');
const b64 = b => Buffer.from(b).toString('base64');
const appels = [], lus = new Set(), dossiers = [];
const MESSAGES = [
  { id: 'm1', subject: 'Facture IDRA-2026-09112', from: { emailAddress: { name: 'Inox Distribution', address: 'compta@inoxdistri.example' } }, receivedDateTime: '2026-10-21T07:12:00Z', hasAttachments: true,
    pj: [{ '@odata.type': '#microsoft.graph.fileAttachment', name: 'logo.png', isInline: true, contentBytes: b64('png') }, { '@odata.type': '#microsoft.graph.fileAttachment', name: 'IDRA-09112.pdf', contentBytes: b64(pdf) }] },
  { id: 'm2', subject: 'Bonjour', from: { emailAddress: { name: 'Quelqu\'un', address: 'x@exemple.fr' } }, receivedDateTime: '2026-10-21T08:00:00Z', hasAttachments: false, pj: [] },
  { id: 'm3', subject: 'Re: facture', from: { emailAddress: { name: 'Inox Distribution', address: 'compta@inoxdistri.example' } }, receivedDateTime: '2026-10-21T09:00:00Z', hasAttachments: true,
    pj: [{ '@odata.type': '#microsoft.graph.fileAttachment', name: 'copie.PDF', contentBytes: b64(pdf) }] }];
const graph = http.createServer((req, res) => {
  let corps = ''; req.on('data', c => { corps += c; });
  req.on('end', () => {
    const u = decodeURIComponent(req.url);
    appels.push({ m: req.method, u, b: corps.startsWith('{') ? JSON.parse(corps) : null });
    res.setHeader('Content-Type', 'application/json');
    if (u.includes('/oauth2/v2.0/token')) return res.end(JSON.stringify({ access_token: 'jeton', expires_in: 3600 }));
    if (u.includes('/mailFolders/inbox/messages')) return res.end(JSON.stringify({ value: MESSAGES.filter(m => !lus.has(m.id)).map(({ pj, ...m }) => m) }));
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-factures-'));
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

test('PDF simple importé : enregistré « à lire », même fichier = doublon', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  const autre = Buffer.from('%PDF-1.4\n% autre facture\n%%EOF');
  const r = await call('POST', '/api/efacture/import', { nom: 'scan.pdf', base64: b64(autre) }, admin);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual([r.body.format, r.body.aLire, r.body.statut, !!r.body.pdfId, r.body.xmlId, r.body.doublon], ['PDF', true, 'Reçue', true, '', false]);
  assert.strictEqual((await call('POST', '/api/efacture/import', { nom: 'scan (2).pdf', base64: b64(autre) }, admin)).body.doublon, true);
  assert.strictEqual((await call('POST', '/api/efacture/import', { nom: 'x.txt', base64: b64('bonjour') }, admin)).status, 422);
});

test('boîte des factures : pièces jointes relevées, e-mails lus et rangés, refus envoyé au fournisseur', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  assert.strictEqual((await call('PUT', '/api/efacture/config', { mail: { actif: true, adresse: 'pas une adresse' } }, admin)).status, 400);
  const cfg = await call('PUT', '/api/efacture/config', { mail: { actif: true, adresse: 'Factures@Tecnitub.example', dossier: 'Traitées' } }, admin);
  assert.deepStrictEqual(cfg.body.mail, { actif: true, adresse: 'factures@tecnitub.example', dossier: 'Traitées' });
  // Sans connexion Microsoft 365 : erreur explicite
  assert.match((await call('POST', '/api/efacture/mail', {}, admin)).body.error, /Microsoft 365 non configurée/);
  await call('PUT', '/api/m365', { tenantId: 't', clientId: 'c', clientSecret: 's', actif: true }, admin);
  const r = (await call('POST', '/api/efacture/mail', {}, admin)).body;
  assert.deepStrictEqual([r.messages, r.factures, r.doublons, r.sansPiece, r.erreurs.length], [3, 1, 1, 1, 0]);
  assert.deepStrictEqual([...lus].sort(), ['m1', 'm2', 'm3']);
  assert.deepStrictEqual(appels.filter(a => /\/move$/.test(a.u)).map(a => [a.u.split('/messages/')[1], a.b.destinationId]), [['m1/move', 'dos1'], ['m3/move', 'dos1']]);
  assert.ok(appels.every(a => !/users\//.test(a.u) || a.u.includes('/users/factures@tecnitub.example/')));
  const ef = Object.values((await call('GET', '/api/data', null, admin)).body.efactures).find(x => x.origine === 'e-mail');
  assert.deepStrictEqual([ef.format, ef.nomFichier, ef.mail.deEmail, ef.mail.objet, ef.aLire], ['PDF', 'IDRA-09112.pdf', 'compta@inoxdistri.example', 'Facture IDRA-2026-09112', true]);
  // Rien de nouveau au relevé suivant
  assert.strictEqual((await call('POST', '/api/efacture/mail', {}, admin)).body.messages, 0);
  // État affiché aux bureaux
  const etat = (await call('GET', '/api/efacture/etat', null, admin)).body.mail;
  assert.deepStrictEqual([etat.actif, etat.adresse, etat.m365, !!etat.dernier, etat.erreur], [true, 'factures@tecnitub.example', true, true, '']);
  // Refus : motif requis, e-mail à l'expéditeur depuis la boîte des factures
  assert.strictEqual((await call('POST', '/api/efacture/prevenir', { id: ef.id, motif: '' }, admin)).status, 400);
  const p = await call('POST', '/api/efacture/prevenir', { id: ef.id, motif: 'Prix différent de la commande <b>CF-2026-0002</b>' }, admin);
  assert.deepStrictEqual(p.body, { ok: true, a: 'compta@inoxdistri.example' });
  const envoi = appels.find(a => /\/sendMail$/.test(a.u));
  assert.ok(envoi.u.includes('/users/factures@tecnitub.example/sendMail'));
  assert.deepStrictEqual(envoi.b.message.toRecipients, [{ emailAddress: { address: 'compta@inoxdistri.example' } }]);
  assert.match(envoi.b.message.body.content, /&lt;b&gt;CF-2026-0002/);
});
