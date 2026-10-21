// Achats au comptoir (relevé mensuel des BL, ventilation par chantier, enlèvements déclarés) et historique des prix d'achat.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const R = require('../public/js/releve-lecture');
const H = require('../public/js/historique-achats');

const affaires = [{ id: 'af1', code: 'CH-2026-001', nom: 'Ligne NEP inox – Usine de Rumilly', statut: 'En cours' }, { id: 'af3', code: 'CH-2026-003', nom: 'Skid de dosage', statut: 'En cours' },
  { id: 'hd2', code: 'HD-2026-002', nom: 'Fuite vapeur PM2', statut: 'Ouvert' }, { id: 'old', code: 'CH-2025-001', nom: 'Ancien chantier', statut: 'Clos' }];

test('chantier de la référence donnée au comptoir : code, fin du code, année du BL, nom', () => {
  const t = (ref, date) => (R.trouverAffaire(ref, affaires, date) || {}).id || '';
  assert.deepStrictEqual([t('CH-2026-001'), t('001', '2026-10-03'), t('001', '2025-04-10'), t('2026-003'), t('HD-2026-002'), t('PM2 fuite vapeur'), t('Rumilly'), t('DEPOT'), t('')],
    ['af1', 'af1', 'old', 'af3', 'hd2', 'hd2', 'af1', '', '']);
});

test('relevé détaillé : un BL par en-tête, ses articles, total vérifié', () => {
  const r = R.analyser(['RELEVÉ DE FACTURATION – Octobre 2026', 'BL N° 4512 du 03/10/2026\tVotre réf. : CH-2026-001',
    'RAC-316-050\tRaccord union inox 316L DN50\t4\tU\t38,50\t154,00', 'JNT-GR-050\tJoint graphite DN50\t10\tU\t3,20\t32,00',
    'Total BL 4512\t186,00', 'BL N° 4538 du 09/10/2026\tChantier : 001', 'COL-INOX-60\tCollier inox 60 mm\t50\tU\t6,00\t300,00',
    'BL N° 4590 du 24/10/2026\tRéf : DEPOT', 'GANTS\tGants de manutention\t12\tPAIRE\t4,50\t54,00',
    'Total HT du relevé\t540,00', 'TVA 20 %\t108,00'], affaires);
  assert.deepStrictEqual(r.bls.map(b => [b.bl, b.date, b.affaireId, b.montant, b.lignes.length]),
    [['4512', '2026-10-03', 'af1', 186, 2], ['4538', '2026-10-09', 'af1', 300, 1], ['4590', '2026-10-24', '', 54, 1]]);
  assert.deepStrictEqual([r.totalHT, r.somme, r.coherent], [540, 540, true]);
  assert.strictEqual(r.bls[0].lignes[0].pu, 38.5);
  // Ventilation : une imputation par chantier avec ses BL ; le BL sans chantier est à part
  const v = R.ventilation(r.bls);
  assert.deepStrictEqual(v.imputations, [{ affaireId: 'af1', commandeId: '', libelle: 'Comptoir : BL 4512, 4538', montantHT: 486 }]);
  assert.deepStrictEqual(v.sansChantier.map(b => b.bl), ['4590']);
});

test('relevé résumé (une ligne par BL) et total incohérent signalé', () => {
  const r = R.analyser(['Date\tN° BL\tVotre référence\tMontant HT', '03/10/2026\tBL 4512\tCH-2026-001\t186,00', '15/10/2026\tBL 4561\tHD-2026-002\t124,80', 'Total HT\t320,00'], affaires);
  assert.deepStrictEqual(r.bls.map(b => [b.bl, b.affaireId, b.montant]), [['4512', 'af1', 186], ['4561', 'hd2', 124.8]]);
  assert.strictEqual(r.coherent, false);
});

test('rapprochement avec les enlèvements déclarés : n° de BL, sinon chantier + date + montant', () => {
  const bls = [{ bl: '4512', date: '2026-10-03', affaireId: 'af1', montant: 186 }, { bl: '4600', date: '2026-10-20', affaireId: 'af3', montant: 389 }, { bl: '4700', date: '2026-10-21', affaireId: 'af1', montant: 50 }];
  const r = R.rapprocher(bls, [{ id: 'e1', bl: 'BL-04512', affaireId: 'af3', date: '2026-10-01' }, { id: 'e2', bl: '', affaireId: 'af3', date: '2026-10-18', montant: 390 },
    { id: 'e3', bl: '', affaireId: 'af1', date: '2026-10-02', montant: 50 }, { id: 'e4', bl: '9999', affaireId: 'af1', date: '2026-10-28' }]);
  assert.deepStrictEqual(r.parBl.map(e => e && e.id), ['e1', 'e2', null]);
  // BL dont la référence n'a pas donné de chantier : celui de la déclaration
  const sans = [{ bl: '4724', date: '2026-10-20', affaireId: '', montant: 46.25 }];
  assert.strictEqual(R.rapprocher(sans, [{ id: 'k', bl: '4724', affaireId: 'af1' }]).parBl[0].id, 'k');
  assert.deepStrictEqual([sans[0].affaireId, sans[0].chantierDeclare, R.ventilation(sans).imputations[0].montantHT], ['af1', true, 46.25]);
  assert.deepStrictEqual(r.nonFactures.map(e => e.id), ['e3', 'e4']);
});

test('historique des prix : mini, maxi, moyen pondéré, sans double compte facture / commande, filtres', () => {
  const articles = [{ id: 'a1', ref: 'TUB-316-050', designation: 'Tube inox 316L DN50 sch10S', unite: 'ml', famille: 'Tubes' }];
  const commandes = [
    { id: 'c1', fournisseurId: 'f1', date: '2025-03-01', statut: 'Réceptionnée', lignes: [{ articleId: 'a1', designation: 'Tube inox 316L DN50 sch10S', qte: 100, pu: 40 }] },
    { id: 'c2', fournisseurId: 'f2', date: '2026-02-01', statut: 'Réceptionnée', lignes: [{ articleId: 'a1', designation: 'Tube inox 316L DN50 sch10S', qte: 300, pu: 44 }, { designation: 'Frais de port', qte: 1, pu: 45 }] },
    { id: 'c3', fournisseurId: 'f1', date: '2026-05-01', statut: 'Réceptionnée', lignes: [{ articleId: 'a1', designation: 'Tube inox 316L DN50 sch10S', qte: 100, pu: 42 }] },
    { id: 'c4', fournisseurId: 'f1', date: '2026-06-01', statut: 'Brouillon', lignes: [{ articleId: 'a1', qte: 100, pu: 10 }] }];
  // La commande c3 est facturée ligne à ligne à 43 € : seul le prix facturé compte ; ligne de comptoir avec la référence
  const achats = [{ id: 'f', fournisseurId: 'f1', date: '2026-05-20', montantHT: 4300, imputations: [{ affaireId: 'af1', commandeId: 'c3', montantHT: 4300 }],
      lignes: [{ designation: 'TUBE 316L DN50', reference: 'TUB-316-050', qte: 100, pu: 43 }] },
    { id: 'g', fournisseurId: 'f3', date: '2026-10-31', montantHT: 94.6, lignes: [{ designation: 'Tube inox DN50', reference: 'tub-316-050', qte: 2, pu: 47.3, bl: '4719', dateBl: '2026-10-28', affaireId: 'af3' }] }];
  const l = H.lignes({ commandes, achats, articles });
  assert.deepStrictEqual(l.map(x => [x.date, x.source, x.pu]), [['2025-03-01', 'commande', 40], ['2026-02-01', 'commande', 44], ['2026-05-20', 'facture', 43], ['2026-10-28', 'comptoir', 47.3]]);
  assert.strictEqual(l[3].affaireId, 'af3');
  const s = H.synthese(l, { annee: '2026' });
  assert.strictEqual(s.articles.length, 1);
  const a = s.articles[0];
  assert.deepStrictEqual([a.nb, a.qte, a.min, a.max, a.dernier, a.meilleur.fournisseurId], [3, 402, 43, 47.3, 47.3, 'f1']);
  assert.strictEqual(a.moyen, Math.round((300 * 44 + 100 * 43 + 2 * 47.3) / 402 * 10000) / 10000);
  assert.deepStrictEqual(s.annees, ['2026', '2025']);
  assert.strictEqual(H.synthese(l, { fournisseurId: 'f1' }).articles[0].moyen, 41.5);
  assert.strictEqual(H.synthese(l, { q: 'vanne' }).articles.length, 0);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-comptoir-'));
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

test('serveur : le compagnon déclare ses enlèvements, le bureau seul les marque facturés', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'ahmed', password: 'motdepasse1', role: 'atelier', nom: 'Ahmed', userId: 'o2' }, admin);
  await call('POST', '/api/accounts', { login: 'hugo', password: 'motdepasse1', role: 'atelier', nom: 'Hugo', userId: 'o5' }, admin);
  const ahmed = (await call('POST', '/api/login', { login: 'ahmed', password: 'motdepasse1' })).cookie;
  const hugo = (await call('POST', '/api/login', { login: 'hugo', password: 'motdepasse1' })).cookie;
  // Le compagnon ne voit que ses enlèvements
  assert.deepStrictEqual((await call('GET', '/api/data', null, ahmed)).body.enlevements.map(e => e.id), ['en2']);
  // Déclaration : statut forcé à « Déclaré », pas de facture rattachée
  const e = { userId: 'o2', date: '2026-10-20', fournisseurId: 'e11', affaireId: 'af1', bl: '4801', montant: 40, statut: 'Facturé', achatId: 'ff2' };
  assert.strictEqual((await call('PUT', '/api/records/enlevements/en-t', { data: e }, ahmed)).status, 200);
  let rec = (await call('GET', '/api/records/enlevements/en-t', null, admin)).body;
  assert.deepStrictEqual([rec.statut, rec.achatId], ['Déclaré', undefined]);
  // Pour un autre : refusé ; invisible des autres compagnons
  assert.strictEqual((await call('PUT', '/api/records/enlevements/en-u', { data: { ...e, userId: 'o1' } }, ahmed)).status, 403);
  assert.ok(!(await call('GET', '/api/data', null, hugo)).body.enlevements.some(x => x.id === 'en-t'));
  // Rapproché par le bureau : le compagnon ne peut plus le modifier
  assert.strictEqual((await call('PUT', '/api/records/enlevements/en-t', { data: { ...rec, statut: 'Facturé', achatId: 'ff2' }, version: rec._v }, admin)).status, 200);
  rec = (await call('GET', '/api/records/enlevements/en-t', null, admin)).body;
  assert.strictEqual((await call('PUT', '/api/records/enlevements/en-t', { data: { ...rec, montant: 10 }, version: rec._v }, ahmed)).status, 403);
});
