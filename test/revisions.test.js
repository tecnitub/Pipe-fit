// Émissions d'un calcul d'étude : indices, modifications relevées d'un indice à l'autre, objet proposé, n° de document
const { test } = require('node:test');
const assert = require('node:assert');
const R = require('../etudes/public/js/revisions');

const schema = [
  { k: 'Q', l: 'Débit soufflé', u: 'm³/h', rubrique: 'Aéraulique' },
  { k: 'fluide', l: 'Fluide', options: [['eau', 'Eau'], ['mpg30', 'Monopropylène glycol 30 %']], rubrique: 'Hydraulique' },
  { k: 'circuits', l: 'Circuits', t: 'lignes', rubrique: 'Hydraulique', colonnes: [{ k: 'rep', l: 'Repère' }, { k: 'P', l: 'Puissance', u: 'kW' }, { k: 'L', l: 'Longueur', u: 'm' }] },
];

test('modifications relevées : valeurs, listes de choix, lignes ajoutées, retirées, modifiées', () => {
  const a = { Q: 3000, fluide: 'eau', circuits: [{ rep: 'C1', P: 40, L: 50 }, { rep: 'C2', P: 20, L: 30 }] };
  const b = { Q: 3500, fluide: 'mpg30', circuits: [{ rep: 'C1', P: 45, L: 50 }, { rep: 'C3', P: 12, L: 20 }] };
  const m = R.comparer(schema, a, b);
  assert.deepStrictEqual(m.map(x => [x.libelle, x.avant, x.apres, x.nature]), [
    ['Débit soufflé', '3000 m³/h', '3500 m³/h', 'modifiée'], ['Fluide', 'Eau', 'Monopropylène glycol 30 %', 'modifiée'],
    ['Circuits : ligne « C1 », Puissance', '40 kW', '45 kW', 'modifiée'], ['Circuits : ligne « C3 »', '—', '12 kW · 20 m', 'ajoutée'], ['Circuits : ligne « C2 »', '20 kW · 30 m', '—', 'retirée']]);
  assert.deepStrictEqual(R.comparer(schema, a, JSON.parse(JSON.stringify(a))), []);
  assert.deepStrictEqual(R.comparerResultats([['Débit', '3 000 m³/h'], ['Perte', '120 Pa']], [['Débit', '3 500 m³/h'], ['Perte', '120 Pa'], ['Pompe', 'P1']]).map(x => [x.libelle, x.avant, x.apres]), [['Débit', '3 000 m³/h', '3 500 m³/h'], ['Pompe', '—', 'P1']]);
  assert.match(R.resume(m), /^Débit soufflé : 3000 m³\/h → 3500 m³\/h ; Fluide : Eau → Monopropylène glycol 30 % ; Circuits : ligne « C1 », Puissance : 40 kW → 45 kW ; et 2 autre\(s\) modification\(s\)$/);
});

test('émissions successives : indices A, B, données figées, modifié depuis, n° de document', () => {
  const n = { titre: 'Réseau', commentaire: '', emissions: [] };
  assert.strictEqual(R.prochainIndice(n), 'A');
  const e1 = { Q: 3000, fluide: 'eau', circuits: [] };
  const a = R.emission(n, { date: '2026-10-01', statut: 'Pour avis', redige: 'Jacky' }, e1, [['Débit', '3 000']], schema);
  assert.deepStrictEqual([a.indice, a.objet, a.depuis, a.modifs.length], ['A', 'Première émission', '', 0]);
  n.emissions.push(a);
  e1.Q = 9999; // la copie émise ne bouge pas avec les données
  assert.strictEqual(n.emissions[0].entrees.Q, 3000);
  assert.ok(R.modifieDepuis(n, e1));
  assert.ok(!R.modifieDepuis(n, { Q: 3000, fluide: 'eau', circuits: [] }));
  const b = R.emission(n, { date: '2026-10-15', statut: 'Bon pour exécution', verifie: 'Claire' }, e1, [['Débit', '9 999']], schema);
  assert.deepStrictEqual([b.indice, b.depuis, b.statut, b.modifs.map(x => x.libelle), b.modifsResultats.length], ['B', 'A', 'Bon pour exécution', ['Débit soufflé'], 1]);
  assert.strictEqual(R.suivant('Z'), "Z'");
  assert.strictEqual(R.numero('CH-2026-001', 3), 'CH-2026-001-NDC-N03');
});
