// Adresses d'envoi par type de document : boîte partagée comme expéditeur, adresse de réponse, copies cachées d'archive.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const A = require('../public/js/adresses-envoi');

test('famille du document, boîte partagée, copie à l\'utilisateur, adresses vérifiées', () => {
  const cfg = A.normaliser({ factures: { expediteur: ' Comptabilite@Tecnitub.fr ', cci: 'archives@tecnitub.fr', copieMoi: true }, commandes: { repondreA: 'achats@tecnitub.fr' }, inconnu: { expediteur: 'x@y.fr' } });
  assert.deepStrictEqual(Object.keys(cfg), ['factures', 'commandes']);
  assert.deepStrictEqual(A.pour(cfg, 'relance2', 'Claire@tecnitub.fr'), { groupe: 'factures', expediteur: 'comptabilite@tecnitub.fr', partage: true, repondreA: '', bcc: ['archives@tecnitub.fr', 'claire@tecnitub.fr'] });
  assert.deepStrictEqual(A.pour(cfg, 'commande', 'claire@tecnitub.fr'), { groupe: 'commandes', expediteur: 'claire@tecnitub.fr', partage: false, repondreA: 'achats@tecnitub.fr', bcc: [] });
  assert.deepStrictEqual(A.pour(cfg, 'devis', ''), { groupe: 'devis', expediteur: '', partage: false, repondreA: '', bcc: [] });
  assert.throws(() => A.normaliser({ devis: { expediteur: 'pas une adresse' } }), /Devis : adresse invalide/);
});

const appels = [];
const graph = http.createServer((req, res) => {
  let corps = ''; req.on('data', c => { corps += c; });
  req.on('end', () => {
    appels.push({ u: decodeURIComponent(req.url), b: corps.startsWith('{') ? JSON.parse(corps) : null });
    res.setHeader('Content-Type', 'application/json');
    if (req.url.includes('/oauth2/v2.0/token')) return res.end(JSON.stringify({ access_token: 'jeton', expires_in: 3600 }));
    if (/\/sendMail$/.test(req.url)) { res.statusCode = 202; return res.end('{}'); }
    res.statusCode = 404; return res.end('{}');
  });
});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-adresses-'));
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

test('serveur : facture envoyée depuis la boîte de la comptabilité, devis depuis la boîte de l\'utilisateur', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('PUT', '/api/m365', { tenantId: 't', clientId: 'c', clientSecret: 's', actif: true }, admin);
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', email: 'claire@tecnitub.fr' }, admin);
  const claire = (await call('POST', '/api/login', { login: 'claire', password: 'motdepasse1' })).cookie;
  assert.strictEqual((await call('PUT', '/api/mail/adresses', { factures: { expediteur: 'comptabilite@tecnitub.fr' } }, claire)).status, 403);
  assert.strictEqual((await call('PUT', '/api/mail/adresses', { factures: { expediteur: 'compta' } }, admin)).status, 400);
  const r = await call('PUT', '/api/mail/adresses', { factures: { expediteur: 'comptabilite@tecnitub.fr', repondreA: 'compta@tecnitub.fr', cci: 'archives@tecnitub.fr', copieMoi: true } }, admin);
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await call('GET', '/api/me', null, claire)).body.adressesEnvoi.factures.expediteur, 'comptabilite@tecnitub.fr');
  const f = await call('POST', '/api/mail', { type: 'facture', to: ['client@exemple.fr'], cc: ['archives@tecnitub.fr'], subject: 'Facture FA-1', html: '<p>Bonjour</p>' }, claire);
  assert.strictEqual(f.body.expediteur, 'comptabilite@tecnitub.fr');
  let e = appels.filter(a => /\/sendMail$/.test(a.u)).pop();
  assert.ok(e.u.includes('/users/comptabilite@tecnitub.fr/sendMail'));
  assert.deepStrictEqual([e.b.message.replyTo, e.b.message.bccRecipients, e.b.saveToSentItems],
    [[{ emailAddress: { address: 'compta@tecnitub.fr' } }], [{ emailAddress: { address: 'claire@tecnitub.fr' } }], true], 'archive déjà en copie : pas de Cci en double');
  await call('POST', '/api/mail', { type: 'devis', to: ['client@exemple.fr'], subject: 'Devis DV-1', html: '<p>Bonjour</p>' }, claire);
  e = appels.filter(a => /\/sendMail$/.test(a.u)).pop();
  assert.ok(e.u.includes('/users/claire@tecnitub.fr/sendMail'));
  assert.deepStrictEqual(e.b.message.bccRecipients, []);
});
