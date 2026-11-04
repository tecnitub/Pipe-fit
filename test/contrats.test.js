// Contrat d'entretien : visites planifiées depuis le carnet du DOE, rappels, facturation, renouvellement
const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../public/js/contrats');

const carnet = [['CTA', 'Remplacement des filtres', 'Trimestrielle', 'Mainteneur CVC'], ['PAC', 'Contrôle d\'étanchéité', 'Annuelle', 'Frigoriste certifié'], ['Radiateurs', 'Purge', 'Semestrielle', 'Mainteneur CVC']];

test('fréquences du carnet en mois', () => {
  assert.deepStrictEqual(['Annuelle', 'Semestrielle', 'Trimestrielle', 'Mensuelle', '6 mois', '24', 'tous les 2 ans'].map(C.frequenceMois), [12, 6, 3, 1, 6, 24, 24]);
});

test('visites regroupées par date sur la durée du contrat', () => {
  const c = C.creer({ carnet, debut: '2026-11-01', dureeMois: 12, montantAnnuel: 2400, facturation: 'semestrielle', origine: 'carnet du DOE' });
  assert.deepStrictEqual(c.visites.map(v => [v.prevue, v.operations.length]), [['2027-02-01', 1], ['2027-05-01', 2], ['2027-08-01', 1], ['2027-11-01', 3]]);
  assert.strictEqual(C.bilan(c, '2026-12-01').prochaine.prevue, '2027-02-01');
});

test('rappels : visite à planifier dans le mois, puis en retard ; visite faite', () => {
  const c = C.creer({ carnet, debut: '2026-11-01', dureeMois: 12 });
  assert.deepStrictEqual(C.rappels(c, '2026-12-01'), []);
  assert.strictEqual(C.rappels(c, '2027-01-20')[0].etat, 'bientot');
  assert.strictEqual(C.rappels(c, '2027-02-10')[0].etat, 'retard');
  C.marquerFaite(c, c.visites[0].id, { date: '2027-02-08', par: 'Paul', observations: 'Filtres F7 remplacés', operations: [true] });
  assert.strictEqual(C.rappels(c, '2027-02-10').length, 0);
  assert.strictEqual(C.bilan(c, '2027-02-10').faites, 1);
});

test('facturation par période et renouvellement', () => {
  const c = C.creer({ carnet, debut: '2026-11-01', dureeMois: 12, montantAnnuel: 2400, facturation: 'trimestrielle' });
  const e = C.echeances(c);
  assert.deepStrictEqual(e.map(x => [x.du, x.montant]), [['2026-11-01', 600], ['2027-02-01', 600], ['2027-05-01', 600], ['2027-08-01', 600]]);
  assert.match(C.lignesFacture(c, e[0], 'CH-001')[0].designation, /01\/11\/2026 au 01\/02\/2027/);
  const r = C.renouveler(c);
  assert.strictEqual(r.debut, '2027-11-01');
  assert.strictEqual(r.precedent.fin, '2027-11-01');
  assert.strictEqual(r.visites.length, c.visites.length);
});
