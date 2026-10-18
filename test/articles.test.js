// Bibliothèque : recherche tolérante et rangement par famille / sous-famille.
const { test } = require('node:test');
const assert = require('node:assert');
const R = require('../public/js/articles-recherche');

const A = [
  { id: 'a1', ref: 'TUB-316-050', designation: 'Tube inox 316L DN50 sch10S', famille: 'Tubes', sousFamille: 'Inox 316L' },
  { id: 'a2', ref: 'COU-316-050', designation: 'Coude 90° 3D inox 316L DN50', famille: 'Raccords', sousFamille: 'Coudes' },
  { id: 'a3', ref: 'COU-P235-150', designation: 'Coude 90° acier P235GH DN150', famille: 'Raccords', sousFamille: 'Coudes', fournisseurId: 'f1' },
  { id: 'a4', ref: 'TEE-316-100', designation: 'Té égal inox 316L DN100 à souder', famille: 'Raccords', sousFamille: 'Tés' },
  { id: 'a5', ref: 'VAN-PAP-050', designation: 'Vanne papillon DN50 PN16', famille: 'Robinetterie' },
  { id: 'a6', ref: 'DIV-1', designation: 'Ruban téflon' },
];
const refs = l => l.map(a => a.ref);

test('recherche : mots dans le désordre, sans accents, DN écrit de plusieurs façons', () => {
  assert.deepStrictEqual(refs(R.filtrer(A, { q: 'dn 50 coude' })), ['COU-316-050']);
  assert.deepStrictEqual(refs(R.filtrer(A, { q: 'te egal' })), ['TEE-316-100']);
  assert.deepStrictEqual(refs(R.filtrer(A, { q: 'DN50' })).sort(), ['COU-316-050', 'TUB-316-050', 'VAN-PAP-050']);
  assert.deepStrictEqual(refs(R.filtrer(A, { q: 'coudes' })).sort(), ['COU-316-050', 'COU-P235-150']); // par la sous-famille
  assert.deepStrictEqual(refs(R.filtrer(A, { q: 'tuyauterie dupont', fournisseurDe: a => (a.fournisseurId === 'f1' ? 'Tuyauterie Dupont' : '') })), ['COU-P235-150']);
  // La référence exacte passe en premier
  assert.strictEqual(R.filtrer(A, { q: 'cou-316' })[0].ref, 'COU-316-050');
});

test('fautes de frappe tolérées seulement si rien d\'exact', () => {
  assert.deepStrictEqual(refs(R.filtrer(A, { q: 'vane' })), ['VAN-PAP-050']);
  assert.deepStrictEqual(refs(R.filtrer(A, { q: 'coude inox 100' })), []); // « coude » ne devient pas « souder »
  assert.deepStrictEqual(refs(R.filtrer(A, { q: 'zzzz' })), []);
});

test('familles et sous-familles : filtre et arbre', () => {
  assert.deepStrictEqual(refs(R.filtrer(A, { famille: 'Raccords', sousFamille: 'Coudes' })), ['COU-316-050', 'COU-P235-150']);
  assert.deepStrictEqual(refs(R.filtrer(A, { famille: R.SANS })), ['DIV-1']);
  assert.deepStrictEqual(R.arbre(A).map(f => [f.nom, f.n, f.sous.map(s => `${s.nom}:${s.n}`).join(',')]), [
    ['Raccords', 3, 'Coudes:2,Tés:1'], ['Robinetterie', 1, ''], ['Tubes', 1, 'Inox 316L:1'], [R.SANS, 1, ''],
  ]);
});

test('un nombre se cherche depuis son début', () => {
  assert.deepStrictEqual(refs(R.filtrer(A, { q: 'coude 50' })), ['COU-316-050']);
  assert.deepStrictEqual(refs(R.filtrer(A, { q: '150' })), ['COU-P235-150']);
  assert.strictEqual(R.filtrer(A, { q: '316 tube' })[0].ref, 'TUB-316-050');
});
