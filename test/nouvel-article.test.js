// Fourniture commandée hors bibliothèque : fiche proposée (famille, coefficient, article déjà présent).
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../public/js/nouvel-article');
const R = require('../public/js/rapprochement');

const articles = [{ id: 'a1', ref: 'TUB-316-050', designation: 'Tube inox 316L DN50 sch10S', famille: 'Tubes', coutRevient: 40, prixVente: 60 },
  { id: 'a4', ref: 'COU-316-050', designation: 'Coude 90° 3D inox 316L DN50', famille: 'Raccords', sousFamille: 'Coudes', coutRevient: 20, prixVente: 30 },
  { id: 'a5', ref: 'BRI-316-100', designation: 'Bride à collerette inox DN100 PN16', famille: 'Raccords', coutRevient: 40, prixVente: 52 }];

test('fiche proposée : famille de l\'article ressemblant ou par mot-clé, prix de vente au coefficient de la famille', () => {
  const p = N.proposer({ designation: 'Coude 90° 3D inox 316L DN80', unite: 'u', pu: 34.5, refFournisseur: 'CO3D316-80' }, articles, R.ressemblance, 'e5');
  assert.deepStrictEqual([p.famille, p.ref, p.refFournisseur, p.coutRevient, p.fournisseurId, p.existant], ['Raccords', 'CO3D316-80', 'CO3D316-80', 34.5, 'e5', null], 'DN80 : pas le coude DN50');
  assert.strictEqual(p.prixVente, Math.round(34.5 * 1.5 * 100) / 100, 'coefficient médian des raccords (1,3 et 1,5)');
  assert.strictEqual(N.proposer({ designation: 'Vanne à boisseau DN25', pu: 38.9 }, articles, R.ressemblance).famille, 'Robinetterie');
  const q = N.proposer({ designation: 'Pièce spéciale', pu: 10 }, articles, R.ressemblance);
  assert.deepStrictEqual([q.famille, q.prixVente], ['', 15], 'sans famille : coefficient médian de la bibliothèque');
  assert.strictEqual(N.proposer({ designation: 'Pièce spéciale', pu: 10 }, [], R.ressemblance).prixVente, 13.5, 'bibliothèque vide : 1,35');
});

test('article déjà présent : même référence ou désignation très proche', () => {
  assert.strictEqual(N.proposer({ designation: 'TUBE 316L', refFournisseur: 'tub-316-050', pu: 42 }, articles, R.ressemblance).existant.id, 'a1');
  assert.strictEqual(N.proposer({ designation: 'Coude 90 3D inox 316L DN 50', pu: 21 }, articles, R.ressemblance).existant.id, 'a4');
});
