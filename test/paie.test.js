// Paie sur une période libre : heures validées, heures sup. par semaine (contrat de la personne), paniers, absences ;
// réglage des colonnes du tableau envoyé au comptable.
const { test } = require('node:test');
const assert = require('node:assert');
const P = require('../public/js/paie');

const t = (date, heures, extra = {}) => ({ userId: 'o1', date, heures, statut: 'Validé', ...extra });
const settings = { dureeHebdo: 35, seuilHS50: 43, montantPanier: 10.5 };

test('période : un mois, du … au …, raccourcis', () => {
  assert.deepStrictEqual(P.periode('2026-02'), { du: '2026-02-01', au: '2026-02-28' });
  assert.deepStrictEqual(P.periode({ du: '2026-10-05', au: '2026-10-18' }), { du: '2026-10-05', au: '2026-10-18' });
  const r = Object.fromEntries(P.raccourcis('2026-10-31'));
  assert.deepStrictEqual(r['Mois dernier'], { du: '2026-09-01', au: '2026-09-30' });
  assert.deepStrictEqual(r['Cette semaine'], { du: '2026-10-26', au: '2026-11-01' });
  assert.deepStrictEqual(r['Semaine dernière'], { du: '2026-10-19', au: '2026-10-25' });
});

test('heures sup. par semaine, jours d\'avant la période comptés pour le seuil, contrat de la personne', () => {
  // Semaine du 19 au 25 octobre : 5 × 9 h = 45 h ; période à partir du jeudi 22
  const temps = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].map(d => t(d, 9, { panier: true }));
  temps.push(t('2026-10-23', 2, { statut: '' }), t('2026-10-24', 3, { statut: 'Refusé' }));
  const r = P.calculer({ user: { id: 'o1', salaireHoraire: 20 }, temps, settings, periode: { du: '2026-10-22', au: '2026-10-31' } });
  assert.deepStrictEqual([r.jours, r.total, r.normales, r.hs25, r.hs50, r.attente, r.paniers, r.montantPaniers], [2, 18, 8, 8, 2, 2, 2, 21]);
  // Contrat 39 h : HS à 25 % au-delà de 39 h
  const r39 = P.calculer({ user: { id: 'o1', dureeHebdo: 39 }, temps, settings, periode: '2026-10' });
  assert.deepStrictEqual([r39.base, r39.normales, r39.hs25, r39.hs50], [39, 39, 4, 2]);
});

test('notes de frais validées et absences du planning sur la période', () => {
  const frais = [{ userId: 'o1', date: '2026-10-10', statut: 'Validée', montantTTC: 25 }, { userId: 'o1', date: '2026-10-11', statut: 'Soumise', montantTTC: 99 }, { userId: 'o1', date: '2026-11-02', statut: 'Validée', montantTTC: 7 }];
  const planning = [{ userId: 'o1', date: '2026-10-12', absence: 'Congés payés' }, { userId: 'o1', date: '2026-10-13', absence: 'Congés payés' }, { userId: 'o1', date: '2026-10-14', absence: 'Maladie' }];
  const r = P.calculer({ user: { id: 'o1' }, temps: [], frais, planning, settings, periode: '2026-10' });
  assert.strictEqual(r.frais, 25);
  assert.strictEqual(P.libelleAbsences(r.absences), 'Congés payés 2 j, Maladie 1 j');
});

test('colonnes du tableau du comptable : défauts, puis réglage enregistré', () => {
  const d = P.reglage();
  assert.ok(d.colonnes.includes('hs25') && !d.colonnes.includes('brut') && d.options.detail);
  const r = P.reglage({ colonnes: { brut: true, observations: false, matricule: true }, options: { detail: false } });
  assert.ok(r.colonnes.includes('brut') && r.colonnes.includes('matricule') && !r.colonnes.includes('observations'));
  assert.strictEqual(r.colonnes[0], 'matricule'); // ordre fixe
  assert.deepStrictEqual([r.options.detail, r.options.totaux], [false, true]);
});
