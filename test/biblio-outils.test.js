const test = require('node:test');
const assert = require('node:assert');
const B = require('../public/js/biblio-outils.js');

const art = () => ({ id: 'a1', ref: 'CO-50', designation: 'Coude DN50', unite: 'u', famille: 'Raccords', sousFamille: 'Acier', gamme: 'Coudes 90', coutRevient: 10, marge: 50, prixVente: 15, delai: 5,
  fournisseurId: 'f1', fournisseursConsult: ['f2', 'f3'], prixFournisseurs: { f2: { coutRevient: 8, delai: 10 }, f3: { coutRevient: 12, delai: 1 } } });

test('offres : défaut + variantes, moins cher, plus rapide, conseil', () => {
  const a = art();
  assert.deepStrictEqual(B.offres(a).map(o => [o.fid, o.coutRevient, o.delai]), [['f1', 10, 5], ['f2', 8, 10], ['f3', 12, 1]]);
  assert.strictEqual(B.moinsCher(a).fid, 'f2');
  assert.strictEqual(B.plusRapide(a).fid, 'f3');
  assert.deepStrictEqual(B.conseil(a, 'f1'), { fid: 'f2', prix: 8, ecart: 2, pct: 20 });
  assert.strictEqual(B.conseil(a, 'f2'), null);
  const c = B.comparerCommande([{ articleId: 'a1', qte: 10 }, { articleId: 'a2', qte: 2 }, { designation: 'libre', qte: 1 }], id => (id === 'a1' ? a : id === 'a2' ? { id: 'a2', fournisseurId: 'f1', coutRevient: 5 } : null));
  assert.strictEqual(c.nb, 2);
  assert.deepStrictEqual(c.fournisseurs.map(f => [f.fid, f.total, f.complet]), [['f1', 110, true], ['f2', 80, false], ['f3', 120, false]]);
});

test('prix : nouveau prix avec historique, tarif fournisseur, écart de facture', () => {
  const a = art();
  B.appliquerPrix(a, 'f1', 11, { date: '2026-11-07', source: 'tarif' });
  assert.strictEqual(a.coutRevient, 11); assert.strictEqual(a.prixVente, 16.5);
  B.appliquerPrix(a, 'f2', '8,5', { date: '2026-11-07', source: 'facture F1' });
  assert.strictEqual(a.prixFournisseurs.f2.coutRevient, 8.5); assert.strictEqual(a.prixFournisseurs.f2.delai, 10);
  assert.deepStrictEqual(a.historiquePrix.map(h => [h.fid, h.ancien, h.nouveau]), [['f1', 10, 11], ['f2', 8, 8.5]]);
  B.appliquerPrix(a, 'f1', 11); assert.strictEqual(a.historiquePrix.length, 2);
  const autres = [{ id: 'a2', ref: 'VA 20', designation: 'Vanne DN20', fournisseurId: 'f2', coutRevient: 20 }, { id: 'a3', ref: 'X', designation: 'Autre', fournisseurId: 'f9', coutRevient: 1 }];
  const t = B.comparerTarif([a, ...autres], 'f2', [['Code article', 'Libellé', 'Prix net HT'], ['co50', 'Coude', '9,00'], ['VA-20', '', 18], ['ZZ', 'Inconnu', 3], ['X', '', 2]]);
  assert.deepStrictEqual(t.lignes.map(l => [l.id, l.role, l.ancien, l.nouveau, l.pct]), [['a1', 'variante', 8.5, 9, 5.88], ['a2', 'défaut', 20, 18, -10]]);
  assert.strictEqual(t.nonTrouves.length, 2); assert.strictEqual(t.hausses, 1); assert.strictEqual(t.baisses, 1);
  assert.strictEqual(B.comparerTarif([], 'f2', [['a', 'b']]), null);
  assert.deepStrictEqual(B.ecartFacture(art(), 'f1', 10.6), { ancien: 10, nouveau: 10.6, pct: 6, alerte: true });
  assert.strictEqual(B.ecartFacture(art(), 'f2', 8.2).alerte, false);
  assert.strictEqual(B.ecartFacture(art(), 'f1', 10), null);
});

test('marges par catégorie, arbre et déplacement de catégories', () => {
  const marges = { Raccords: 40, 'Raccords|Acier|Coudes 90': 60 };
  const l = [{ id: '1', famille: 'Raccords', sousFamille: 'Acier', gamme: 'Coudes 90', coutRevient: 10 }, { id: '2', famille: 'Raccords', sousFamille: 'Inox', coutRevient: 10 },
    { id: '3', famille: 'Raccords', coutRevient: 10, marge: 10, prixVente: 11 }, { id: '4', designation: 'sans', coutRevient: 1 }];
  assert.deepStrictEqual(B.margeCategorie(l[0], marges), { chemin: 'Raccords|Acier|Coudes 90', marge: 60 });
  assert.strictEqual(B.margeEffective(l[2], marges), 10);
  assert.deepStrictEqual(B.appliquerMarges(l, marges).map(a => [a.id, a.prixVente]), [['1', 16], ['2', 14]]);
  const ar = B.arbre(l);
  assert.strictEqual(ar.sans, 1);
  assert.deepStrictEqual(ar.noeuds.map(x => [x.nom, x.n, x.enfants.map(e => [e.nom, e.n, e.enfants.length])]), [['Raccords', 3, [['Acier', 1, 1], ['Inox', 1, 0]]]]);
  // Renommer « Acier » en « Acier noir », fusionner « Inox » dans « Acier noir », déplacer vers une autre famille
  assert.deepStrictEqual(B.deplacer(l, 'Raccords|Acier', 'Raccords|Acier noir').map(a => [a.id, a.sousFamille, a.gamme]), [['1', 'Acier noir', 'Coudes 90']]);
  assert.deepStrictEqual(B.deplacer(l, 'Raccords|Inox', 'Tubes|Inox').map(a => [a.id, a.famille, a.sousFamille]), [['2', 'Tubes', 'Inox']]);
  assert.deepStrictEqual(B.deplacer(l, 'Raccords', 'Raccords'), []);
});

test('doublons fusionnés en variantes, références remplacées', () => {
  const l = [{ id: '1', ref: 'CO-50', designation: 'Coude DN50', unite: 'u', fournisseurId: 'f1', coutRevient: 10 },
    { id: '2', ref: 'co50', designation: 'Coude 90 DN50', unite: 'u', fournisseurId: 'f2', coutRevient: 9, famille: 'Raccords' },
    { id: '3', ref: 'T1', designation: 'Tube acier DN50', unite: 'ml', fournisseurId: 'f1' }, { id: '4', ref: 'T2', designation: 'DN50 tube acier', unite: 'ml', fournisseurId: 'f3', coutRevient: 4 },
    { id: '5', ref: 'T3', designation: 'Tube acier DN50', unite: 'u' }];
  const g = B.doublons(l);
  assert.deepStrictEqual(g.map(x => [x.motif, x.articles.map(a => a.id)]), [['même référence', ['1', '2']], ['même désignation', ['3', '4']]]);
  const f = B.fusionner(l[0], [l[1]]);
  assert.deepStrictEqual([f.article.fournisseurId, f.article.fournisseursConsult, f.article.prixFournisseurs, f.article.famille], ['f1', ['f2'], { f2: { coutRevient: 9 } }, 'Raccords']);
  assert.deepStrictEqual(f.article.alias, ['Coude 90 DN50', 'co50']);
  const devis = { lignes: [{ composants: [{ articleId: '2' }, { articleId: '9' }] }] };
  assert.ok(B.remplacerReferences(devis, { 2: '1' }));
  assert.strictEqual(devis.lignes[0].composants[0].articleId, '1');
  assert.ok(!B.remplacerReferences(devis, { 2: '1' }));
});

test('contrôle d\'un import : lignes douteuses', () => {
  const c = B.controlerImport([
    { ref: 'A', designation: 'ok', unite: 'u', coutRevient: 5, marge: 30 },
    { ref: '', designation: 'x', unite: 'Pièce', coutRevient: 0 },
    { ref: 'B', designation: 'y', unite: 'zz', coutRevient: 5, marge: 400, prixVente: 4 },
    { ref: 'A', designation: 'ok bis', unite: 'u', coutRevient: 5, marge: -5 }], { uniteConnue: u => ['u', 'Pièce'].includes(u) });
  assert.deepStrictEqual(c.map(x => [x.ligne, x.motifs]), [[3, ['référence vide', 'prix d\'achat à 0']], [4, ['marge de 400 %', 'vendu moins cher qu\'acheté', 'unité inconnue « zz »']], [5, ['marge négative (-5 %)', 'même référence et même fournisseur que la ligne 2']]]);
});
