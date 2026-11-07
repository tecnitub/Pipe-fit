const test = require('node:test');
const assert = require('node:assert');
const M = require('../public/js/articles-modele.js');

test('lecture d\'une ligne du modèle : unités, prix, marge, catégories', () => {
  const a = M.lire(['R001', 'Tube cuivre 14', 'Fournisseur A', 'Ml', '4,83000', '100,00', 'Plomberie|Cuivre|Tubes']);
  assert.strictEqual(a.unite, 'ml');
  assert.strictEqual(a.coutRevient, 4.83);
  assert.strictEqual(a.marge, 100);
  assert.strictEqual(a.prixVente, 9.66);
  assert.deepStrictEqual([a.famille, a.sousFamille, a.gamme], ['Plomberie', 'Cuivre', 'Tubes']);
  assert.strictEqual(M.lire(['', 'x', '', 'P', '1', '', '']).unite, 'u');
  assert.strictEqual(M.lire(['', 'x', '', 'F', '1', '', '']).unite, 'forfait');
  assert.strictEqual(M.lire(['', 'x', '', 'Heure(s)', '1', '', '']).unite, 'h');
});

test('export au format du modèle (aller-retour)', () => {
  const l = ['R001', 'Tube cuivre 14', 'Fournisseur A', 'Ml', '4,83000', '100,00', 'Plomberie|Cuivre|Tubes'];
  const a = M.lire(l);
  assert.deepStrictEqual(M.ligne(a, 'Fournisseur A'), l);
  assert.strictEqual(M.ligne({ designation: 'x', unite: 'u', coutRevient: 10, prixVente: 15 })[5], '50,00');
  assert.strictEqual(M.cheminCategories({ famille: 'A' }), 'A');
});

test('feuille : en-têtes reconnus et modèle détecté', () => {
  const rows = [M.ENTETES, ['R1', 'Coude', 'X', 'Pièce', '2,50000', '20,00', 'A|B'], ['', '', '', '', '', '', '']];
  assert.ok(M.estModele(M.ENTETES));
  const l = M.lireFeuille(rows);
  assert.strictEqual(l.length, 1);
  assert.strictEqual(l[0].prixVente, 3);
});

test('rapprochement des fournisseurs', () => {
  const ents = [{ id: 1, nom: 'Descours' }, { id: 2, nom: 'PUM PLASTIQUES' }, { id: 3, nom: 'Arcus Inox' }];
  assert.strictEqual(M.fournisseurProche('Descour', ents).id, 1);
  assert.strictEqual(M.fournisseurProche('pum', ents).id, 2);
  assert.strictEqual(M.fournisseurProche('arcus', ents).id, 3);
  assert.strictEqual(M.fournisseurProche('Autre', ents), null);
});

test('variantes fournisseur : un par défaut et 3 autres, chacune avec son prix', () => {
  const a = { ref: 'R1', designation: 'Coude', unite: 'u', coutRevient: 10, marge: 50, prixVente: 15, fournisseurId: 'f1' };
  M.ajouterVariante(a, 'f2', { coutRevient: 9, marge: 50 });
  M.ajouterVariante(a, 'f3', { coutRevient: 11, marge: '' });
  M.ajouterVariante(a, 'f4', { coutRevient: 12 });
  M.ajouterVariante(a, 'f5', { coutRevient: 8 });
  M.ajouterVariante(a, 'f1', { coutRevient: 1 });
  assert.strictEqual(a.fournisseurId, 'f1');
  assert.deepStrictEqual(a.fournisseursConsult, ['f2', 'f3', 'f4']);
  assert.deepStrictEqual(a.prixFournisseurs.f2, { coutRevient: 9, marge: 50 });
  const l = M.lignesVariantes(a, id => id.toUpperCase());
  assert.deepStrictEqual(l.map(x => [x[0], x[2], x[4], x[5]]), [['R1', 'F1', '10,00000', '50,00'], ['R1', 'F2', '9,00000', '50,00'], ['R1', 'F3', '11,00000', '50,00'], ['R1', 'F4', '12,00000', '50,00']]);
  // Changement du défaut : l'ancien devient une variante avec le prix de l'article
  const b = { coutRevient: 10, fournisseurId: 'f1', fournisseursConsult: ['f2'], prixFournisseurs: { f2: { coutRevient: 9 } } };
  M.changerDefaut(b, 'f2');
  assert.strictEqual(b.fournisseurId, 'f2');
  assert.deepStrictEqual(b.fournisseursConsult, ['f1']);
  assert.deepStrictEqual(b.prixFournisseurs, { f1: { coutRevient: 10 } });
});
