// Tests de l'application Études : connexion par Pipe-Fit, droits, affaires, études versionnées, réglages.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-etudes-'));
process.env.DB_FILE = path.join(dir, 'pf.db');
process.env.ETUDES_DB_FILE = path.join(dir, 'etudes.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const pf = require('../server/server').server;
let etudes, base, pfBase;

before(async () => {
  await new Promise(r => pf.listen(0, '127.0.0.1', r));
  pfBase = `http://127.0.0.1:${pf.address().port}`;
  process.env.PIPEFIT_URL = pfBase; // lu au chargement du serveur Études
  etudes = require('../etudes/server').server;
  await new Promise(r => etudes.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${etudes.address().port}`;
});
after(() => { for (const s of [etudes, pf]) { s.close(); s.closeAllConnections(); } fs.rmSync(dir, { recursive: true, force: true }); });

async function call(b, method, url, body, cookie, headers = {}) {
  const res = await fetch(b + url, {
    method,
    headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, type, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
const connexion = async login => (await call(base, 'POST', '/api/login', { login, password: 'motdepasse1' })).cookie;

test('connexion avec le compte Pipe-Fit, réservée au bureau', async () => {
  const admin = (await call(pfBase, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  for (const [login, role] of [['jacky', 'charge'], ['marc', 'atelier']])
    assert.strictEqual((await call(pfBase, 'POST', '/api/accounts', { login, password: 'motdepasse1', role, nom: login }, admin)).status, 200);
  assert.strictEqual((await call(base, 'GET', '/api/etudes')).status, 401);
  assert.strictEqual((await call(base, 'POST', '/api/login', { login: 'jacky', password: 'faux' })).status, 401);
  assert.strictEqual((await call(base, 'POST', '/api/login', { login: 'marc', password: 'motdepasse1' })).status, 403);
  const c = await connexion('jacky');
  assert.match(c, /^etudes_sid=/);
  assert.strictEqual((await call(base, 'GET', '/api/me', null, c)).body.role, 'charge');
});

test('affaires de Pipe-Fit : seules les informations utiles sont transmises', async () => {
  const c = await connexion('jacky');
  const d = (await call(base, 'GET', '/api/pf/affaires', null, c)).body;
  assert.ok(d.affaires.length && d.entreprises.length);
  assert.ok(Object.keys(d.affaires[0]).every(k => ['clientId', 'contactId', 'siteId', 'chargeId', 'code', 'id', 'nom', 'statut', 'type', 'documents'].includes(k)) && d.affaires[0].id);
  // Documents du chantier : seulement CCTP et DPGF (préremplissage de l'étude)
  assert.ok(d.affaires.every(a => a.documents.every(x => x.categorie === 'CCTP' || /cctp|dpgf|dqe|bpu/i.test(x.nom))));
  assert.ok(Object.keys(d.entreprises[0]).every(k => ['id', 'nom', 'regimeTVA', 'categorie'].includes(k)));
  // Devis : de quoi relier une étude faite avant la commande, sans les montants
  assert.ok(d.devis.length && Object.keys(d.devis[0]).every(k => ['id', 'numero', 'objet', 'clientId', 'statut', 'affaireId'].includes(k)));
  assert.ok(d.articles.every(a => !('fournisseurId' in a)), 'pas de données fournisseurs inutiles');
  // Fichier d'un document du chantier lu au travers de l'application (CCTP, DPGF)
  const admin = (await call(pfBase, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  const doc = (await call(pfBase, 'GET', '/api/data', null, admin)).body.affaires.flatMap(a => a.documents || []).find(x => /pdf/.test(x.mime || ''));
  const f = await call(base, 'GET', `/api/pf/fichier/${doc.fichierId}`, null, c);
  assert.strictEqual(f.status, 200);
  assert.strictEqual(f.body.subarray(0, 4).toString(), '%PDF');
  assert.strictEqual((await call(base, 'GET', '/api/pf/fichier/inconnu', null, c)).status, 404);
});

test('études versionnées : création, conflit, suppression', async () => {
  const c = await connexion('jacky');
  const etude = { objet: 'Réseau eau glacée CTA', affaireId: 'af1', indice: 'A', notes: [{ id: 'n1', type: 'tuyauterie', titre: 'Antenne CTA', entrees: { Q: 12 } }] };
  assert.strictEqual((await call(base, 'PUT', '/api/etudes/e1', { data: { ...etude, objet: ' ' } }, c)).status, 400);
  assert.strictEqual((await call(base, 'PUT', '/api/etudes/e1', { data: { objet: 'x' } }, c)).status, 400);
  assert.strictEqual((await call(base, 'PUT', '/api/etudes/../x', { data: etude }, c)).status, 404);
  const r1 = await call(base, 'PUT', '/api/etudes/e1', { data: { ...etude, _v: 99, id: 'autre' } }, c);
  assert.strictEqual(r1.status, 200);
  assert.deepStrictEqual([r1.body.id, r1.body._v, r1.body._by], ['e1', 1, 'jacky']);
  const r2 = await call(base, 'PUT', '/api/etudes/e1', { data: { ...etude, indice: 'B' }, version: 1 }, c);
  assert.strictEqual(r2.body._v, 2);
  const conflit = await call(base, 'PUT', '/api/etudes/e1', { data: { ...etude, indice: 'C' }, version: 1 }, c);
  assert.strictEqual(conflit.status, 409);
  assert.strictEqual(conflit.body.record.indice, 'B');
  const liste = (await call(base, 'GET', '/api/etudes', null, c)).body;
  assert.strictEqual(liste.length, 1);
  assert.strictEqual(liste[0].notes[0].entrees.Q, 12);
  assert.strictEqual((await call(base, 'DELETE', '/api/etudes/e1', null, c)).status, 200);
  assert.strictEqual((await call(base, 'GET', '/api/etudes/e1', null, c)).status, 404);
});

test('protections : JSON obligatoire, origine contrôlée, réglages réservés à l\'administrateur', async () => {
  const c = await connexion('jacky');
  const r = await fetch(`${base}/api/etudes/e2`, { method: 'PUT', headers: { Cookie: c, 'Content-Type': 'text/plain' }, body: '{}' });
  assert.strictEqual(r.status, 415);
  assert.strictEqual((await call(base, 'PUT', '/api/etudes/e2', { data: {} }, c, { Origin: 'https://malveillant.example' })).status, 403);
  assert.strictEqual((await call(base, 'PUT', '/api/config', { couleur: '#000000' }, c)).status, 403);
  const admin = (await call(base, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  const cfg = await call(base, 'PUT', '/api/config', { societe: { raison: 'TECNITUB BE' } }, admin);
  assert.strictEqual(cfg.body.societe.raison, 'TECNITUB BE');
  assert.ok(cfg.body.societe.adresse, 'les autres champs sont conservés');
  assert.strictEqual((await call(base, 'POST', '/api/logout', {}, c)).status, 200);
  assert.strictEqual((await call(base, 'GET', '/api/etudes', null, c)).status, 401);
});

test('fichiers statiques et modules partagés', async () => {
  for (const [u, type] of [['/', 'text/html'], ['/js/calculs.js', 'javascript'], ['/shared/pdf.js', 'javascript'], ['/shared/pdf-lib.min.js', 'javascript'], ['/shared/doe.css', 'text/css'], ['/logo-tecnitub.png', 'image/png']]) {
    const r = await fetch(base + u);
    assert.strictEqual(r.status, 200, u);
    assert.ok((r.headers.get('content-type') || '').includes(type), u);
  }
  assert.strictEqual((await fetch(`${base}/..%2fserver.js`)).status, 403);
});

test('retour d\'expérience Pipe-Fit pour le calage du métré', async () => {
  const c = await connexion('jacky');
  const r = await call(base, 'GET', '/api/pf/rex', null, c);
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.affaires.length && r.body.affaires.every(a => ['Terminé', 'Facturé', 'Clos'].includes(a.statut) && a.prevues > 0 && a.passees > 0));
  assert.ok(r.body.mainoeuvre.length && Object.keys(r.body.mainoeuvre[0]).every(k => ['id', 'code', 'libelle'].includes(k)));
});

test('lien avec Pipe-Fit : devis brouillon et note de calcul dans les documents du chantier', async () => {
  const c = await connexion('jacky');
  const d = (await call(base, 'GET', '/api/pf/affaires', null, c)).body;
  assert.ok(d.articles.length && d.mainoeuvre.length && d.affaires[0].contactId !== undefined);
  const af = d.affaires.find(a => a.id === 'af1');
  // Devis brouillon : client et site de l'affaire, lignes du métré, numérotation par Pipe-Fit
  const lignes = [{ type: 'chapitre', titre: 'Tuyauteries' }, { type: 'ouvrage', designation: 'Tuyauterie inox DN 50', unite: 'ml', qte: 120, composants: [{ type: 'f', articleId: 'a1', designation: 'Tube', unite: 'ml', qte: 1.05, pu: 51, cout: 41 }, { type: 'mo', moId: 'mo2', libelle: 'Monteur', heures: 0.8, taux: 48, cout: 34 }] }];
  assert.strictEqual((await call(base, 'POST', '/api/pf/devis', { affaireId: 'af1', lignes: [] }, c)).status, 400);
  const r = await call(base, 'POST', '/api/pf/devis', { affaireId: 'af1', etudeId: 'e9', objet: 'Chiffrage BE', lignes }, c);
  assert.strictEqual(r.status, 200); assert.match(r.body.numero, /^DV-/);
  const pfc = (await call(pfBase, 'POST', '/api/login', { login: 'jacky', password: 'motdepasse1' })).cookie;
  const dv = (await call(pfBase, 'GET', `/api/records/devis/${r.body.id}`, null, pfc)).body;
  assert.deepStrictEqual([dv.statut, dv.affaireId, dv.clientId, dv.siteId, dv.lignes.length], ['Brouillon', 'af1', af.clientId, af.siteId, 2]);
  // Note de calcul : dépôt, puis nouvel indice pour la même étude (ancien fichier conservé)
  const pdf = Buffer.from('%PDF-1.4\n%test\n').toString('base64');
  assert.strictEqual((await call(base, 'POST', '/api/pf/document', { affaireId: 'af1', nom: 'note.pdf', base64: Buffer.from('pas un pdf').toString('base64') }, c)).status, 400);
  const n1 = await call(base, 'POST', '/api/pf/document', { affaireId: 'af1', etudeId: 'e9', nom: 'NDC_CH_e9_IndA.pdf', indice: 'A', base64: pdf }, c);
  assert.strictEqual(n1.status, 200);
  const n2 = await call(base, 'POST', '/api/pf/document', { affaireId: 'af1', etudeId: 'e9', nom: 'NDC_CH_e9_IndB.pdf', indice: 'B', base64: pdf }, c);
  assert.deepStrictEqual([n2.body.docId, n2.body.indice], [n1.body.docId, 'B']);
  const docs = (await call(pfBase, 'GET', '/api/records/affaires/af1', null, pfc)).body.documents.filter(x => x.categorie === 'Note de calcul');
  assert.strictEqual(docs.length, 1); assert.strictEqual(docs[0].anciens.length, 1); assert.strictEqual(docs[0].visible, false);
  const f = await call(pfBase, 'GET', `/api/files/${docs[0].fichierId}`, null, pfc);
  assert.strictEqual(f.body.subarray(0, 4).toString(), '%PDF');
});
