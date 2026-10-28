// Pièces jointes recopiées dans l'arborescence du serveur (sens unique) et sauvegarde quotidienne de la base.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-reseau-'));
process.env.DB_FILE = path.join(dir, 'data', 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
fs.mkdirSync(path.dirname(process.env.DB_FILE), { recursive: true });
const { server } = require('../server/server');
let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};
const pdf = t => `data:application/pdf;base64,${Buffer.from(`%PDF-1.4\n% ${t}\n%%EOF`).toString('base64')}`;
const arbre = d => (fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).filter(x => fs.statSync(path.join(d, x)).isFile()).map(x => x.split(path.sep).join('/')).sort() : []);

test('pièces jointes : arborescence par chantier et par rubrique, signatures et documents de chantier exclus, rien d\'effacé', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  const charge = await call('POST', '/api/accounts', { login: 'paul', password: 'motdepasse1', role: 'charge', nom: 'Paul' }, admin);
  assert.strictEqual(charge.status, 200);
  const paul = (await call('POST', '/api/login', { login: 'paul', password: 'motdepasse1' })).cookie;
  assert.strictEqual((await call('GET', '/api/reseau', null, paul)).status, 403, 'réservé à l\'administrateur');
  const racine = path.join(dir, 'NAS', 'Pièces jointes');
  assert.strictEqual((await call('PUT', '/api/reseau', { pj: { actif: true, chemin: 'relatif' } }, admin)).status, 400);
  await call('PUT', '/api/reseau', { pj: { actif: true, chemin: racine } }, admin);
  const offre = (await call('POST', '/api/files', { dataUrl: pdf('offre') }, admin)).body.id;
  const facture = (await call('POST', '/api/files', { dataUrl: pdf('facture') }, admin)).body.id;
  const signature = (await call('POST', '/api/files', { dataUrl: pdf('signature') }, admin)).body.id;
  const aff = (await call('PUT', '/api/records/affaires/a-res', { data: { nom: 'Chaufferie Lycée', statut: 'En cours', documents: [{ id: 'd1', nom: 'plan.pdf', fichierId: facture, categorie: 'Plan' }] } }, admin)).body;
  const cs = (await call('PUT', '/api/records/consultations/cs-res', { data: { affaireId: 'a-res', statut: 'En cours', fournisseurs: [{ entrepriseId: 'e1', statut: 'Offre reçue', offre: { pieceId: offre, pieceNom: 'Offre Téréva 4471.pdf' } }] } }, admin)).body;
  await call('PUT', '/api/records/achats/ac-res', { data: { date: '2025-03-04', numero: 'F-778', pieceId: facture, signatureClientId: signature } }, admin);
  const r = (await call('POST', '/api/reseau/pj', {}, admin)).body;
  assert.strictEqual(r.pj.erreur, '');
  const chantier = `Chantiers/${aff.code} - Chaufferie Lycée`;
  assert.deepStrictEqual(arbre(racine).filter(x => x.includes(aff.code) || x.includes('F-778')), [`${chantier}/Offres fournisseurs/${cs.ref} - Offre Téréva 4471.pdf`, 'Hors chantier/Factures fournisseurs/2025/F-778 - Pièce jointe.pdf']);
  assert.strictEqual(fs.readFileSync(path.join(racine, chantier, 'Offres fournisseurs', `${cs.ref} - Offre Téréva 4471.pdf`), 'utf8'), '%PDF-1.4\n% offre\n%%EOF');
  // Fichier effacé à la main : réécrit ; enregistrement supprimé dans l'appli : la copie reste
  fs.rmSync(path.join(racine, 'Hors chantier'), { recursive: true });
  await call('DELETE', '/api/records/achats/ac-res', null, admin);
  await call('POST', '/api/reseau/pj', {}, admin);
  assert.ok(arbre(racine).includes('Hors chantier/Factures fournisseurs/2025/F-778 - Pièce jointe.pdf'));
  assert.ok(arbre(racine).includes(`${chantier}/Offres fournisseurs/${cs.ref} - Offre Téréva 4471.pdf`));
});

test('sauvegarde : copie vérifiée de la base, heure du jour, rotation des anciennes', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  const dossier = path.join(dir, 'NAS', 'Sauvegardes');
  fs.mkdirSync(dossier, { recursive: true });
  const vieille = path.join(dossier, 'pipefit-2020-01-01_2100.db');
  fs.writeFileSync(vieille, 'ancienne');
  fs.writeFileSync(path.join(dossier, 'autre-fichier.db'), 'à garder');
  let e = (await call('PUT', '/api/reseau', { sauvegarde: { actif: true, chemin: dossier, heure: 22, conserver: 10 } }, admin)).body;
  assert.deepStrictEqual([e.sauvegarde.config.heure, e.sauvegarde.config.conserver, e.sauvegarde.config.dernier], [22, 10, null]);
  e = (await call('POST', '/api/reseau/sauvegarde', {}, admin)).body;
  assert.strictEqual(e.sauvegarde.erreur, '');
  assert.ok(!fs.existsSync(vieille), 'sauvegarde de plus de 10 jours supprimée');
  assert.ok(fs.existsSync(path.join(dossier, 'autre-fichier.db')), 'autres fichiers jamais touchés');
  assert.strictEqual(e.sauvegarde.fichiers.length, 1);
  const copie = new DatabaseSync(path.join(dossier, e.sauvegarde.fichiers[0].nom), { readOnly: true });
  assert.ok(copie.prepare("SELECT COUNT(*) n FROM records WHERE col = 'consultations' AND id = 'cs-res'").get().n === 1);
  assert.ok(copie.prepare('SELECT COUNT(*) n FROM accounts').get().n >= 2);
  copie.close();
  assert.ok(e.sauvegarde.config.dernier);
  // Heure : due après 22 h si la dernière date d'avant 22 h
  const S = require('../server/sauvegarde').creer({
    DB: { getConfig: () => ({ heure: 22, dernier: '2026-10-28T08:00:00' }), setConfig() {}, audit() {} }, db: null, dossierDefaut: dossier });
  assert.deepStrictEqual([S.due(new Date('2026-10-28T21:30:00')), S.due(new Date('2026-10-28T22:05:00'))], [false, true]);
});
