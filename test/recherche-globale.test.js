// Recherche globale : index des données, tous les mots, n° exact en tête, accents et majuscules ignorés.
const { test } = require('node:test');
const assert = require('node:assert');
const R = require('../public/js/recherche-globale');
const d = require('../server/demo').demoData();

const ents = Object.fromEntries(d.entreprises.map(e => [e.id, e.nom]));
const index = R.indexer(d, { nomDe: id => ents[id] || '', affaire: id => d.affaires.find(a => a.id === id) || {} });
const premier = (q, o) => (R.chercher(index, q, o)[0] || {});

test('n° et codes : exact, partiel, sans tirets', () => {
  assert.deepStrictEqual([premier('CH-2026-001').type, premier('CH-2026-001').lien], ['affaires', '#/chantier/af1']);
  assert.strictEqual(premier('dv-2026-0001').type, 'devis');
  assert.strictEqual(premier('FA20260002').lien, '#/facture/fa0002', 'sans tirets');
  assert.strictEqual(premier('TUB-316-050').type, 'articles');
  assert.strictEqual(premier('MS-2026-0001').lien, '#/mes/ms1');
  assert.strictEqual(premier('dv-0007').lien, '#/devis/dv7', 'année omise');
  assert.strictEqual(premier('0002', { types: ['factures'] }).lien, '#/facture/fa0002', 'fin du n°');
});

test('mots : tous présents, accents et majuscules ignorés, sous-titre utile', () => {
  const l = R.chercher(index, 'laiterie rumilly');
  assert.ok(l.length && l.every(x => /laiterie/.test(x.texte) && /rumilly/.test(x.texte)));
  assert.strictEqual(premier('pétrochimie').type, 'entreprises');
  assert.strictEqual(premier('PETROCHIMIE').titre, 'Pétrochimie du Sud');
  assert.ok(R.chercher(index, 'inox dn50').some(x => x.type === 'articles' && /DN50/.test(x.titre)));
  assert.strictEqual(premier('kevin').type, 'users');
  assert.match(premier('CH-2026-001').sous, /Laiterie des Alpes/);
  assert.deepStrictEqual(R.chercher(index, 'zzzz introuvable'), []);
  assert.deepStrictEqual(R.chercher(index, '   '), []);
});

test('types limités (affichage par accès) et nombre de résultats', () => {
  assert.ok(R.chercher(index, 'inox', { types: ['affaires'] }).every(x => x.type === 'affaires'));
  assert.strictEqual(R.chercher(index, 'e', { max: 5 }).length, 5);
});
