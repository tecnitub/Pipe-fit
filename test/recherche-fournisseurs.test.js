// Fournisseurs à consulter : recherche par mots (nom, secteur, ville, contact, familles livrées), filtres, ordre.
const { test } = require('node:test');
const assert = require('node:assert');
const RF = require('../public/js/recherche-fournisseurs');

const fournisseurs = [
  { id: 'f1', nom: 'Inox Distribution', secteur: 'Négoce tubes et raccords', adresses: [{ cp: '69007', ville: 'Lyon' }] },
  { id: 'f2', nom: 'Robinetterie Alpes', secteur: 'Robinetterie', adresses: [{ cp: '38000', ville: 'Grenoble' }], email: 'v@ria.example' },
  { id: 'f3', nom: 'Téréva Annecy', secteur: 'Négoce chauffage sanitaire', adresses: [{ cp: '74000', ville: 'Annecy' }] },
];
const articles = [{ id: 'a1', famille: 'Tubes', fournisseurId: 'f1' }, { id: 'a2', famille: 'Robinetterie', fournisseurId: 'f2' }, { id: 'a3', famille: 'Robinetterie', fournisseurId: 'f3' }];
const commandes = [{ fournisseurId: 'f3', date: '2026-09-01', statut: 'Envoyée' }, { fournisseurId: 'f3', date: '2026-10-01', statut: 'Reçue' }, { fournisseurId: 'f2', date: '2026-10-02', statut: 'Brouillon' }];
const contacts = [{ entrepriseId: 'f2', prenom: 'Marc', nom: 'Vial', fonction: 'Technico-commercial' }];
const fiches = RF.indexer({ fournisseurs, articles, commandes, contacts, depuis: '2025-10-31' });
const ids = r => r.map(f => f.e.id);

test('mots : nom, secteur, ville, contact, famille livrée ; sans accents', () => {
  assert.deepStrictEqual(ids(RF.filtrer(fiches, { q: 'tereva' })), ['f3']);
  assert.deepStrictEqual(ids(RF.filtrer(fiches, { q: 'grenoble' })), ['f2']);
  assert.deepStrictEqual(ids(RF.filtrer(fiches, { q: 'marc vial' })), ['f2']);
  assert.deepStrictEqual(ids(RF.filtrer(fiches, { q: 'negoce' })), ['f3', 'f1']); // plus commandé d'abord
  assert.deepStrictEqual(ids(RF.filtrer(fiches, { q: 'robinetterie' })).sort(), ['f2', 'f3']);
});

test('filtres et ordre : habituels des articles de la demande, puis les plus commandés', () => {
  assert.deepStrictEqual(ids(RF.filtrer(fiches, { famille: 'Robinetterie' })), ['f3', 'f2']);
  assert.deepStrictEqual(ids(RF.filtrer(fiches, { famille: 'Robinetterie' }, ['a2'])), ['f2', 'f3']);
  assert.deepStrictEqual(ids(RF.filtrer(fiches, { dep: '69' })), ['f1']);
  assert.deepStrictEqual(ids(RF.filtrer(fiches, { secteur: 'Robinetterie' })), ['f2']);
  assert.deepStrictEqual(ids(RF.filtrer(fiches, { dejaCommande: true })), ['f3']); // un brouillon ne compte pas
  assert.strictEqual(RF.filtrer(fiches, {}, ['a1', 'a2'])[0].habituel, 1);
});
