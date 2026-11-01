// Chiffrage du DPGF : prix proposés (bibliothèque, historique des achats), variantes hors total, format d'origine
const { test } = require('node:test');
const assert = require('node:assert');
const D = require('../public/js/dpgf-prix');
const R = require('../public/js/rapprochement');

test('prix proposés : article de la bibliothèque, sinon dernier prix d\'achat × coefficient', () => {
  const articles = [{ id: 'a1', designation: 'Circulateur double DN40', prixVente: 1450, coutRevient: 1020, unite: 'u' }, { id: 'a2', designation: 'Vanne 3 voies DN50', prixVente: 0, coutRevient: 0 }];
  const achats = [{ designation: 'Bouche d\'extraction hygroréglable', dernier: 38, moyen: 40, unite: 'u' }];
  const o = { articles, achats, ressemblance: R.ressemblance, coef: 1.4 };
  const p1 = D.proposer('Circulateur double DN40 à vitesse variable', o);
  assert.deepStrictEqual([p1.source, p1.articleId, p1.pu, p1.cout], ['bibliothèque', 'a1', 1450, 1020]);
  const p2 = D.proposer('Bouche d\'extraction hygroréglable', o);
  assert.deepStrictEqual([p2.source, p2.pu, p2.cout], ['achats', 53.2, 38]);
  assert.strictEqual(D.proposer('Circulateur double DN65', o), null, 'autre DN : pas le même article');
  assert.ok(D.estVariante('III.7 VARIANTE CHAUFFAGE') && D.estVariante('Moins value : PAC eau/eau') && !D.estVariante('Pompe à chaleur'));
});

test('DPGF au format d\'origine : prix dans les colonnes du fichier, sous-totaux recalculés, variantes à part', () => {
  const source = { entete: 1, map: { num: 0, designation: 1, unite: 2, qte: 3 }, rows: [['DPGF lot 11'], ['N°', 'Désignation', 'U', 'Qté'],
    ['1', 'CHAUFFAGE'], ['1.1', 'PAC', 'u', '1'], ['1.2', 'Cassettes', 'u', '6'], ['', 'Sous-total chauffage'], ['9', 'VARIANTE'], ['9.1', 'PAC air/eau', 'u', '1'], ['', 'Total HT']] };
  const prix = new Map([[3, { pu: 50000, montant: 50000 }], [4, { pu: 1200, montant: 7200 }], [7, { pu: 42000, montant: 42000, option: true }]]);
  const o = D.remplirOrigine(source, prix);
  assert.deepStrictEqual(o.rows[1].slice(4), ['Prix unitaire HT', 'Montant HT'], 'colonnes ajoutées en bout de ligne');
  assert.deepStrictEqual([o.rows[4][4].v, o.rows[4][5].v, o.rows[5][5].v, o.rows[8][5].v], [1200, 7200, 57200, 57200]);
  assert.deepStrictEqual([o.base, o.variantes], [57200, 42000]);
  assert.strictEqual(o.rows[3][1], 'PAC', 'cellules d\'origine conservées');
});
