// Vue des compagnons : données filtrées par le serveur selon les réglages, documents de chantier, notification.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-comp-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
process.env.NOTIF_DELAI_MS = '50';
const { server } = require('../server/server');

let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });
async function call(method, url, body, cookie, headers = {}) {
  const raw = Buffer.isBuffer(body);
  const res = await fetch(base + url, { method, headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), Cookie: cookie, ...headers }, body: method !== 'GET' ? (raw ? body : JSON.stringify(body || {})) : undefined });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
}
async function login(l, p) { const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: l, password: p }) }); return (r.headers.get('set-cookie') || '').split(';')[0]; }
const attendre = ms => new Promise(r => setTimeout(r, ms));

test('compagnon : données filtrées, réglages, documents et notification', async () => {
  const admin = await login('admin', 'admin-test-pw');
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', userId: 'u1' }, admin);
  await call('POST', '/api/accounts', { login: 'kevin', password: 'motdepasse2', role: 'atelier', nom: 'Kevin', userId: 'o1' }, admin);
  const claire = await login('claire', 'motdepasse1'), kevin = await login('kevin', 'motdepasse2');
  const json = JSON.stringify;

  // Réglages par défaut : chantier, matériel en détail, pas de prix, pas de budget d'heures
  let d = (await call('GET', '/api/data', null, kevin)).body;
  for (const col of ['factures', 'situations', 'achats', 'envois', 'consultations']) assert.strictEqual(d[col].length, 0, col);
  assert.ok(d.devis.length > 0 && d.devis.every(x => x.statut === 'Accepté' && x.affaireId));
  const dv1 = d.devis.find(x => x.id === 'dv1');
  assert.ok(!/"pu"|"cout"|"taux"|ajustements/.test(json(dv1)), 'aucun prix dans le devis');
  assert.ok(dv1.lignes.some(l => (l.composants || []).some(c => c.type === 'f' && c.qte > 0)), 'fournitures avec quantités');
  assert.ok(!dv1.lignes.some(l => (l.composants || []).some(c => c.type === 'mo')), 'pas d\'heures prévues');
  assert.ok(!json(d.users).includes('salaireHoraire') && !json(d.users).includes('tauxHoraire'));
  assert.ok(!json(d.articles).includes('prixVente') && !json(d.articles).includes('coutRevient'));
  assert.ok(!json(d.mainoeuvre).includes('tauxVente'));
  assert.ok(!d.settings.compta);
  const af1 = d.affaires.find(a => a.id === 'af1');
  assert.strictEqual(af1.retenueGarantie, undefined);
  assert.deepStrictEqual(af1.documents.map(x => x.id), ['dc1', 'dc2', 'dc3', 'dc4'], 'seuls les documents transmis');
  assert.ok(d.commandes.length > 0 && !json(d.commandes).includes('"pu"'));
  assert.strictEqual((await call('GET', '/api/records/factures', null, kevin)).body.length, 0);
  assert.strictEqual((await call('GET', '/api/records/devis/dv4', null, kevin)).status, 404, 'devis non accepté invisible');

  // Réglage « chantier seul » : sans matériel, sans client, sans commandes
  const settings = (await call('GET', '/api/data', null, admin)).body.settings;
  assert.strictEqual((await call('PUT', '/api/settings', { ...settings, compagnon: { materiel: false, client: false, commandes: false } }, admin)).status, 200);
  d = (await call('GET', '/api/data', null, kevin)).body;
  assert.strictEqual(d.devis.length, 0); assert.strictEqual(d.commandes.length, 0);
  assert.strictEqual(d.entreprises.find(e => e.id === 'e2').nom, '');
  assert.ok(d.entreprises.find(e => e.id === 'e2').adresses.length, 'adresse du site conservée');
  // Prix et budget d'heures autorisés
  await call('PUT', '/api/settings', { ...settings, compagnon: { prix: true, heuresBudget: true } }, admin);
  d = (await call('GET', '/api/data', null, kevin)).body;
  assert.ok(json(d.articles).includes('prixVente'));
  assert.ok(d.devis.find(x => x.id === 'dv1').lignes.some(l => (l.composants || []).some(c => c.type === 'mo' && c.heures > 0)));
  await call('PUT', '/api/settings', { ...settings, compagnon: {} }, admin);

  // Matériel saisi par un compagnon : prix de la bibliothèque, jamais le sien ; réponse sans prix
  const c = await call('PUT', '/api/records/consommations/cs-k', { data: { affaireId: 'hd2', userId: 'o1', date: '2026-10-16', articleId: 'a4', designation: 'Coude', qte: 2, pu: 1, cout: 1 } }, kevin);
  assert.strictEqual(c.status, 200); assert.strictEqual(c.body.pu, undefined);
  const vu = (await call('GET', '/api/records/consommations/cs-k', null, claire)).body;
  assert.strictEqual(vu.pu, 26); assert.strictEqual(vu.cout, 21);

  // Documents : envoi brut avec en-tête dédié, contrôle du type et du contenu
  const pdf = Buffer.from('%PDF-1.4\n% plan\n');
  const hdr = n => ({ 'X-PipeFit-Upload': '1', 'X-Filename': encodeURIComponent(n), 'Content-Type': 'application/pdf' });
  assert.strictEqual((await call('POST', '/api/documents/fichier', pdf, claire, { 'X-Filename': 'plan.pdf', 'Content-Type': 'application/pdf' })).status, 415, 'sans en-tête : refusé');
  assert.strictEqual((await call('POST', '/api/documents/fichier', pdf, claire, hdr('virus.exe'))).status, 415);
  assert.strictEqual((await call('POST', '/api/documents/fichier', Buffer.from('pas un pdf'), claire, hdr('faux.pdf'))).status, 415);
  assert.strictEqual((await call('POST', '/api/documents/fichier', pdf, kevin, hdr('plan.pdf'))).status, 403);
  const up = await call('POST', '/api/documents/fichier', pdf, claire, hdr('Plan chaufferie indice B.pdf'));
  assert.strictEqual(up.status, 200); assert.strictEqual(up.body.mime, 'application/pdf');
  const dwg = await call('POST', '/api/documents/fichier', Buffer.from('AC1027'), claire, { ...hdr('implantation.dwg'), 'Content-Type': 'application/octet-stream' });
  const f1 = await fetch(`${base}/api/files/${up.body.id}?nom=${encodeURIComponent('Plan chaufferie indice B.pdf')}`, { headers: { Cookie: kevin } });
  assert.match(f1.headers.get('content-disposition'), /^inline; filename="Plan chaufferie indice B.pdf"/);
  const f2 = await fetch(`${base}/api/files/${dwg.body.id}?nom=implantation.dwg`, { headers: { Cookie: kevin } });
  assert.match(f2.headers.get('content-disposition'), /^attachment/); assert.strictEqual(f2.headers.get('content-security-policy'), 'sandbox');

  // Document transmis sur CH-004 : Kevin, planifié dessus la semaine prochaine, est prévenu
  const debut = new Date().toISOString();
  const af4 = (await call('GET', '/api/records/affaires/af4', null, claire)).body;
  const docs = [...af4.documents, { id: 'dc9', fichierId: up.body.id, nom: 'Plan chaufferie indice B.pdf', categorie: 'Plan', indice: 'B', visible: true, date: '2026-10-17' },
    { id: 'dc10', fichierId: dwg.body.id, nom: 'implantation.dwg', categorie: 'Plan', visible: false }];
  assert.strictEqual((await call('PUT', '/api/records/affaires/af4', { data: { ...af4, documents: docs }, version: af4._v }, claire)).status, 200);
  await attendre(250);
  const n = (await call('GET', '/api/records/notifications?filtre=userId:o1', null, claire)).body.filter(x => x.date >= debut);
  assert.strictEqual(n.length, 1); assert.strictEqual(n[0].type, 'document');
  assert.match(n[0].texte, /Plan : Plan chaufferie indice B\.pdf \(indice B\)/); assert.ok(!n[0].texte.includes('implantation'));
  // Le document non transmis n'arrive pas chez le compagnon
  assert.deepStrictEqual((await call('GET', '/api/records/affaires/af4', null, kevin)).body.documents.map(x => x.id), ['dc6', 'dc9']);
});
