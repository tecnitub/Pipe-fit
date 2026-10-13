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
  assert.strictEqual((await call('PUT', '/api/records/temps/t-test', { data: { affaireId: 'af1', userId: 'o1', date: '2026-10-01', heures: 4 } }, atelier)).status, 200);
  // ... mais pas pour un collègue
  assert.strictEqual((await call('PUT', '/api/records/temps/t-autre', { data: { affaireId: 'af1', userId: 'o2', date: '2026-10-01', heures: 4 } }, atelier)).status, 403);
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
  assert.deepStrictEqual(nums, [`DV-${year}-0006`, `DV-${year}-0007`]);

  // Facture : un chargé ne peut changer que le statut, ni la supprimer
  const fa = (await call('PUT', '/api/records/factures/fa-x', { data: { affaireId: 'af1', statut: 'Émise', lignes: [{ qte: 1, pu: 100 }] } }, claire)).body;
  assert.strictEqual(fa.numero, `FA-${year}-0004`);
  const upd = await call('PUT', '/api/records/factures/fa-x', { data: { ...fa, statut: 'Payée', lignes: [], numero: 'FA-HACK' }, version: fa._v }, claire);
  assert.strictEqual(upd.body.statut, 'Payée');
  assert.strictEqual(upd.body.lignes.length, 1);
  assert.strictEqual(upd.body.numero, fa.numero);
  assert.strictEqual((await call('DELETE', '/api/records/factures/fa-x', {}, claire)).status, 403);
  assert.strictEqual((await call('DELETE', '/api/records/factures/fa-x', {}, admin)).status, 200);

  // Chef d'équipe : pointe pour ses intérimaires, pas pour les autres ; un pointage validé est verrouillé
  assert.strictEqual((await call('POST', '/api/accounts', { login: 'lucas', password: 'motdepasse3', role: 'atelier', userId: 'o3' }, admin)).status, 200);
  const lucas = await login('lucas', 'motdepasse3');
  assert.strictEqual((await call('PUT', '/api/records/temps/t-i1', { data: { affaireId: 'af1', userId: 'i1', date: '2026-10-02', heures: 8 } }, lucas)).status, 200);
  assert.strictEqual((await call('PUT', '/api/records/temps/t-o1', { data: { affaireId: 'af1', userId: 'o1', date: '2026-10-02', heures: 8 } }, lucas)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/temps/t-i1b', { data: { affaireId: 'af1', userId: 'i1', date: '2026-10-02', heures: 8, statut: 'Validé' } }, lucas)).status, 403);
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

  // Historique
  const audit = (await call('GET', '/api/audit', null, admin)).body;
  assert.ok(audit.some(a => a.login === 'claire' && a.action === 'modification'));
});

test('déconnexion invalide la session', async () => {
  const c = await login('admin', 'admin-test-pw');
  await call('POST', '/api/logout', {}, c);
  assert.strictEqual((await call('GET', '/api/me', null, c)).status, 401);
});
