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

test('documents émis, diffusion (indice reçu, périmé), retours du maître d\'œuvre et observations levées, schémas comparés', () => {
  let k = 0; const uid = () => `u${++k}`;
  const n1 = { id: 'n1', titre: 'Réseau', emissions: [{ indice: 'A', date: '2026-09-01', statut: 'Pour avis' }, { indice: 'B', date: '2026-10-01', statut: 'Bon pour exécution' }] };
  const n2 = { id: 'n2', titre: 'Vase', emissions: [] };
  const et = { objet: 'Chaufferie', indice: 'B', date: '2026-10-01', notes: [n1, n2], diffusion: [{ id: 'moe', nom: 'MOE' }, { id: 'bc', nom: 'BC' }],
    diffusions: [{ date: '2026-09-02', destinataires: ['moe', 'bc'], documents: [{ cle: 'n1', indice: 'A' }] }, { date: '2026-10-02', destinataires: ['moe'], documents: [{ cle: 'n1', indice: 'B' }, { cle: 'etude', indice: 'B' }] }] };
  const docs = R.documentsEtude(et, 'CH-1');
  assert.deepStrictEqual(docs.map(d => [d.cle, d.numero, d.indice]), [['etude', 'CH-1-NDC', 'B'], ['n1', 'CH-1-NDC-N01', 'B']], 'calcul non émis absent');
  const e = R.etatDiffusion(et, docs);
  assert.deepStrictEqual(e.map(x => x.documents.map(d => (d.jamais ? '—' : `${d.recu.indice}${d.perime ? '!' : ''}`))), [['B', 'B'], ['—', 'A!']]);
  // Retour VAO avec deux observations sur B, levées à l'indice C
  const r = R.ajouterRetour(n1, 'B', { date: '2026-10-10', de: 'MOE', avis: 'VAO', observations: 'Ajouter le clapet\nVérifier la pente' }, uid);
  assert.deepStrictEqual([r.avis, r.observations.length, R.observationsOuvertes(n1).length], ['VAO', 2, 2]);
  assert.strictEqual(R.documentsEtude(et, 'CH-1')[1].avis, 'VAO');
  assert.strictEqual(R.lever(n1, [r.observations[0].id], 'C'), 1);
  assert.deepStrictEqual(R.observationsOuvertes(n1).map(o => o.texte), ['Vérifier la pente']);
  assert.throws(() => R.ajouterRetour(n1, 'Z', { avis: 'VSO' }, uid), /non émis/);
  const c = R.comparerSchemas('<svg><text>P1</text><text>CH1</text></svg>', '<svg><text>P2</text><text>CH1</text></svg>');
  assert.deepStrictEqual([c.listeRetires, c.listeAjoutes, /fill="#2e7d32"[^>]*>P2/.test(c.apres)], [['P1'], ['P2'], true]);
});
