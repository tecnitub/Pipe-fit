// PV de mise en service, relevés d'équilibrage (calculs, documents, règles du serveur) et reprise dans le DOE.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../public/js/essais');
const D = require('../public/js/essais-doc');

test('mise en service : modèle par type, conclusion proposée, champs manquants', () => {
  const m = E.modele('cta');
  assert.ok(m.controles.length >= 5 && m.mesures.some(x => x.libelle === 'Débit de soufflage' && x.unite === 'm³/h'));
  assert.strictEqual(E.conclusion(m), '');
  m.controles.forEach(c => { c.etat = 'OK'; });
  assert.strictEqual(E.conclusion(m), 'Mis en service');
  m.controles[1].etat = 'Non conforme';
  assert.strictEqual(E.conclusion(m), 'Mis en service avec réserves');
  assert.deepStrictEqual(E.manquesMES({ affaireId: 'af1', userId: 'o1', date: '2026-10-21', equipement: '', controles: [{ etat: '' }] }), ['équipement', 'points de contrôle non renseignés', 'conclusion']);
});

test('équilibrage : écarts, tolérance, synthèse, import des débits théoriques', () => {
  const q = { tolerance: 10, lignes: [{ repere: 'B1', theorique: 100, mesure: 108 }, { repere: 'B2', theorique: 200, mesure: 170 }, { repere: 'B3', theorique: 150, mesure: '' }] };
  assert.deepStrictEqual([E.ecart(q.lignes[0]), E.ecart(q.lignes[1]), E.ecart(q.lignes[2])], [8, -15, null]);
  assert.deepStrictEqual([E.conforme(q.lignes[0], 10), E.conforme(q.lignes[1], 10), E.conforme(q.lignes[1], 15)], [true, false, true]);
  const s = E.synthese(q);
  assert.deepStrictEqual([s.nb, s.mesurees, s.conformes, s.horsTolerance, s.totalTheorique, s.totalMesure, s.ecartGlobal, s.resultat], [3, 2, 1, 1, 450, 278, -7.3, '']);
  q.lignes[2].mesure = 150; q.lignes[1].mesure = 195;
  assert.strictEqual(E.synthese(q).resultat, 'Conforme');
  assert.deepStrictEqual(E.importerLignes([['Repère', 'Local', 'Débit théorique (m³/h)'], ['B1', 'Bureau 101', '120'], ['B2', 'Bureau 102', '90,5'], ['', '', '']]).map(l => [l.repere, l.local, l.theorique]),
    [['B1', 'Bureau 101', 120], ['B2', 'Bureau 102', 90.5]]);
  assert.deepStrictEqual(E.importerLignes([['S1', 'Salle', '300']]).map(l => l.theorique), [300], 'sans en-tête : 3 premières colonnes');
});

test('documents : attestation, mesures, écarts, échappement du texte saisi', () => {
  const x = { img: id => `/f/${id}`, societe: 'TECNITUB', chantier: { code: 'CH-1' }, technicien: 'Kevin <b>' };
  const mes = D.miseEnService({ type: 'pac', equipement: 'PAC 1', date: '2026-10-21', controles: [{ libelle: 'Vide', etat: 'OK' }], mesures: [{ libelle: 'HP', unite: 'bar', valeur: '24.5' }, { libelle: 'BP', unite: 'bar', valeur: '' }], resultat: 'Mis en service', signatureTechId: 's1' }, x);
  assert.match(mes, /24,5 bar/); assert.doesNotMatch(mes, /BP/); assert.match(mes, /☒ Équipement <strong>mis en service<\/strong>/); assert.match(mes, /Kevin &lt;b&gt;/); assert.match(mes, /src="\/f\/s1"/);
  const eq = D.equilibrage({ installation: 'CTA 1', tolerance: 10, unite: 'm³/h', date: '2026-10-21', lignes: [{ repere: 'B1', theorique: 100, mesure: 115 }], resultat: 'Non conforme' }, x);
  assert.match(eq, /\+15,0 %/); assert.match(eq, /hors tolérance/); assert.match(eq, /☒ Équilibrage <strong>non conforme/);
});

test('DOE : PV signés de Pipe-Fit cochés dans les listes de contrôle et joints aux annexes F et G', () => {
  const ctx = { console, vide: v => v === undefined || v === null || String(v).trim() === '', api: async () => ({}), uidD: () => 'x' };
  vm.createContext(ctx);
  ['doe/public/js/trame.js', 'doe/public/js/lien.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/^const /gm, 'var '), ctx));
  ctx.PF.data = { affaires: [{ id: 'af4', code: 'CH-4' }], epreuves: [{ id: 'e1', numero: 'EP-1', affaireId: 'af4', reseau: 'Chauffage', nature: 'Chauffage (eau chaude)', statut: 'Signé' }, { id: 'e2', affaireId: 'af4', reseau: 'Brouillon', statut: 'Brouillon' }],
    misesEnService: [{ id: 'm1', numero: 'MS-1', affaireId: 'af4', type: 'pac', equipement: 'PAC', mesures: [{ valeur: '24' }], statut: 'Signé' }],
    equilibrages: [{ id: 'q1', numero: 'EQ-1', affaireId: 'af4', type: 'Aéraulique', installation: 'CTA 1', statut: 'Signé' }],
    fichesFluides: [{ id: 'f1', numero: 'FI-1', affaireId: 'af4', nature: 'miseEnService', statut: 'Signée', equipementId: 'x' }], equipementsFrigo: [] };
  const doe = { affaireId: 'af4' };
  const c = (k, re) => ctx.couvertParPF(doe, k, ctx.TRAME.controles[k].items.find(i => re.test(i)));
  assert.deepStrictEqual([c('5.1', /mise en service TFP/), c('5.1', /CERFA/), c('5.1', /paramètres/), c('5.2', /remplissage/), c('5.3', /aéraulique par CTA/), c('5.3', /VMC/), c('6.1', /réseaux hydrauliques/), c('6.2', /aéraulique/), c('6.3', /tuyauteries/)],
    [true, true, true, true, true, false, true, true, false]);
  const p = JSON.parse(JSON.stringify(ctx.piecesPF(doe))); // tableaux d'un autre contexte vm
  assert.deepStrictEqual(p.F.map(x => [x.genere, x.ref.id]), [['mes', 'm1'], ['cerfa', 'f1']]);
  assert.deepStrictEqual(p.G.map(x => [x.genere, x.ref.id]), [['epreuve', 'e1'], ['equilibrage', 'q1']], 'brouillons exclus');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.piecesPF({ affaireId: 'af4', sansEssaisPF: true }))), { F: [], G: [] });
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-essais-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const { server } = require('../server/server');
let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};

test('serveur : PV de mise en service et relevé d\'équilibrage complets pour être signés, numérotés, figés', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'ahmed', password: 'motdepasse1', role: 'atelier', nom: 'Ahmed', userId: 'o2' }, admin);
  const ahmed = (await call('POST', '/api/login', { login: 'ahmed', password: 'motdepasse1' })).cookie;
  const d = (await call('GET', '/api/data', null, ahmed)).body;
  assert.deepStrictEqual([d.misesEnService.length, d.equilibrages.length], [1, 1]);
  const m = { affaireId: 'af4', userId: 'o2', date: '2026-10-21', type: 'pompes', equipement: 'Pompe double P1', ...E.modele('pompes'), statut: 'Signé' };
  assert.match((await call('PUT', '/api/records/misesEnService/ms-t', { data: m }, ahmed)).body.error, /incomplet : points de contrôle non renseignés, conclusion/);
  m.controles.forEach(c => { c.etat = 'OK'; }); m.resultat = 'Mis en service';
  assert.strictEqual((await call('PUT', '/api/records/misesEnService/ms-t', { data: m }, ahmed)).status, 200);
  const rec = (await call('GET', '/api/records/misesEnService/ms-t', null, admin)).body;
  assert.match(rec.numero, /^MS-\d{4}-\d{4}$/);
  assert.strictEqual((await call('PUT', '/api/records/misesEnService/ms-t', { data: { ...rec, resultat: 'Non mis en service' }, version: rec._v }, ahmed)).status, 403);
  const q = { affaireId: 'af4', userId: 'o2', date: '2026-10-21', installation: 'VMC bât. A', lignes: [{ repere: 'B1', theorique: 30, mesure: '' }], statut: 'Signé' };
  assert.match((await call('PUT', '/api/records/equilibrages/eq-t', { data: q }, ahmed)).body.error, /débits mesurés manquants/);
  q.lignes[0].mesure = 31;
  assert.strictEqual((await call('PUT', '/api/records/equilibrages/eq-t', { data: q }, ahmed)).status, 200);
  assert.match((await call('GET', '/api/records/equilibrages/eq-t', null, admin)).body.numero, /^EQ-\d{4}-\d{4}$/);
  assert.strictEqual((await call('PUT', '/api/records/equilibrages/eq-u', { data: { ...q, userId: 'o1' } }, ahmed)).status, 403, 'pour soi seulement');
});
