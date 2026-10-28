// Tests de l'application DOE : connexion par Pipe-Fit, droits, lecture des données du chantier, dossiers et fichiers.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-doe-'));
process.env.DB_FILE = path.join(dir, 'pf.db');
process.env.DOE_DB_FILE = path.join(dir, 'doe.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const pf = require('../server/server').server;
let doe, base, pfBase;

before(async () => {
  await new Promise(r => pf.listen(0, '127.0.0.1', r));
  pfBase = `http://127.0.0.1:${pf.address().port}`;
  process.env.PIPEFIT_URL = pfBase; // lu au chargement du serveur DOE
  doe = require('../doe/server').server;
  await new Promise(r => doe.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${doe.address().port}`;
});
after(() => { for (const s of [doe, pf]) { s.close(); s.closeAllConnections(); } fs.rmSync(dir, { recursive: true, force: true }); });

async function call(b, method, url, body, cookie, headers = {}) {
  const res = await fetch(b + url, {
    method,
    headers: { ...(method !== 'GET' && !headers['X-Doe-Upload'] ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: method === 'GET' ? undefined : headers['X-Doe-Upload'] ? body : JSON.stringify(body || {}),
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, type, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}

test('connexion avec le compte Pipe-Fit, réservée au bureau', async () => {
  const admin = (await call(pfBase, 'POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  for (const [login, role] of [['jacky', 'charge'], ['marc', 'atelier']])
    assert.strictEqual((await call(pfBase, 'POST', '/api/accounts', { login, password: 'motdepasse1', role, nom: login }, admin)).status, 200);
  assert.strictEqual((await call(base, 'GET', '/api/does')).status, 401);
  assert.strictEqual((await call(base, 'POST', '/api/login', { login: 'jacky', password: 'faux' })).status, 401);
  assert.strictEqual((await call(base, 'POST', '/api/login', { login: 'marc', password: 'motdepasse1' })).status, 403);
  const r = await call(base, 'POST', '/api/login', { login: 'jacky', password: 'motdepasse1' });
  assert.strictEqual(r.status, 200);
  assert.match(r.cookie, /^doe_sid=/);
  const me = await call(base, 'GET', '/api/me', null, r.cookie);
  assert.strictEqual(me.body.role, 'charge');
});

test('données du chantier, dossiers versionnés, un seul DOE par chantier, fichiers', async () => {
  const c = (await call(base, 'POST', '/api/login', { login: 'jacky', password: 'motdepasse1' })).cookie;
  const d = (await call(base, 'GET', '/api/pf/donnees', null, c)).body;
  const af1 = d.affaires.find(a => a.id === 'af1');
  assert.ok(af1 && af1.documents.length && d.receptions.length && d.devis.length);

  // Fichier du chantier lu dans Pipe-Fit
  const doc = af1.documents.find(x => /pdf/.test(x.mime));
  const f = await call(base, 'GET', `/api/pf/fichier/${doc.fichierId}`, null, c);
  assert.strictEqual(f.status, 200);
  assert.strictEqual(f.body.subarray(0, 4).toString(), '%PDF');

  // Dossier : création, conflit de version, doublon de chantier
  const r1 = await call(base, 'PUT', '/api/does/d1', { data: { affaireId: 'af1', operation: 'NEP' } }, c);
  assert.strictEqual(r1.status, 200);
  assert.strictEqual(r1.body._v, 1);
  assert.strictEqual((await call(base, 'PUT', '/api/does/d1', { data: { affaireId: 'af1', operation: 'NEP 2' }, version: 1 }, c)).body._v, 2);
  assert.strictEqual((await call(base, 'PUT', '/api/does/d1', { data: { affaireId: 'af1' }, version: 1 }, c)).status, 409);
  assert.strictEqual((await call(base, 'PUT', '/api/does/d2', { data: { affaireId: 'af1' } }, c)).status, 409);
  const liste = (await call(base, 'GET', '/api/does', null, c)).body;
  assert.deepStrictEqual(liste.map(x => [x.id, x.operation, x._by]), [['d1', 'NEP 2', 'jacky']]);

  // Pièce jointe : type contrôlé, protection CSRF (en-tête obligatoire)
  const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');
  assert.notStrictEqual((await fetch(`${base}/api/fichiers`, { method: 'POST', headers: { Cookie: c, 'X-Filename': 'pv.pdf' }, body: pdf })).status, 200);
  assert.strictEqual((await call(base, 'POST', '/api/fichiers', Buffer.from('<html>'), c, { 'X-Doe-Upload': '1', 'X-Filename': 'pv.pdf' })).status, 415);
  const up = await call(base, 'POST', '/api/fichiers', pdf, c, { 'X-Doe-Upload': '1', 'X-Filename': encodeURIComponent('PV d\'essai.pdf') });
  assert.strictEqual(up.status, 200);
  const back = await call(base, 'GET', `/api/fichiers/${up.body.id}`, null, c);
  assert.deepStrictEqual(back.body, pdf);

  assert.strictEqual((await call(base, 'DELETE', '/api/does/d1', {}, c)).status, 200);
  assert.strictEqual((await call(base, 'GET', '/api/does', null, c)).body.length, 0);
});

test('lecture du CCTP : scripts de lecture et lecteur PDF servis à l\'application DOE', async () => {
  for (const u of ['/shared/cctp-lecture.js', '/shared/pdf-lecture.js', '/vendor/pdfjs/pdf.min.js', '/vendor/pdfjs/pdf.worker.min.js', '/js/etude.js']) {
    const r = await fetch(base + u);
    assert.deepStrictEqual([u, r.status, r.headers.get('content-type')], [u, 200, 'text/javascript; charset=utf-8']);
  }
  const html = await (await fetch(`${base}/`)).text();
  assert.ok(['shared/cctp-lecture.js', 'shared/pdf-lecture.js', 'js/etude.js'].every(s => html.includes(s)));
});

// Démo : résumé de l'étude transmis à la fiche chantier du CRM
test('résumé de l\'étude pour le CRM : avancement, CCTP, équipements, visas', () => {
  const vm = require('node:vm');
  const ctx = vm.createContext({ SECTIONS: {}, manquesDOE: () => ({ pct: 40, manques: [{ libelle: 'Fiche « Vase » : refusée' }, { libelle: 'Date de réception' }] }) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../doe/public/js/etude.js'), 'utf8'), ctx);
  const doe = { id: 'd1', statut: 'Étude', indice: 'A', _at: '2026-10-28T10:00:00Z', _by: 'Jacky',
    cctpLu: { nom: 'CCTP.pdf', articles: [{ num: '3.1' }, { num: '3.2' }], equipements: [{ article: '3.1', repere: 'PAC-01' }, { article: '3.2', repere: 'VE-01' }] },
    equipements: [{ id: 'e1', repere: 'PAC-01', designation: 'Pompe à chaleur', refCctp: '3.1', quantite: '1' }],
    fiches: [{ id: 'f1', designation: 'PAC Daikin', visa: 'Visée', equipements: ['e1'], fichier: { src: 'doe', id: 'x', nom: 'pac.pdf' } }, { id: 'f2', designation: 'Vase', visa: 'Refusée' }, { id: 'f3', designation: 'Filtre' }] };
  const r = vm.runInContext('resumeEtude', ctx)(doe);
  assert.strictEqual(r.etude, true);
  assert.strictEqual(r.pct, 40);
  assert.strictEqual(r.aFaire, 2);
  assert.deepStrictEqual({ ...r.cctp }, { nom: 'CCTP.pdf', le: '', articles: 2, equipements: 2, manquants: 1 });
  assert.strictEqual(r.equipements[0].visa, 'Visée');
  assert.deepStrictEqual({ ...r.visas }, { 'Visée': 1, 'Refusée': 1, 'À soumettre': 1 });
  assert.strictEqual(r.fiches[0].fichier.src, 'doe');
  assert.strictEqual(r.fiches[1].fichier, null);
  assert.strictEqual(r.par, 'Jacky');
});
