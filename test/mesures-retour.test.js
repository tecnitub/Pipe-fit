// Mesures de mise en service reprises dans l'étude : mesuré / calculé, tolérance, réglages proposés (vannes, pompes,
// ventilateurs, bouches), tableau imprimable
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Schema = require('../etudes/public/js/schema');
require('../etudes/public/js/cta'); require('../etudes/public/js/equilibrage'); require('../etudes/public/js/industriel');
require('../etudes/public/js/aeraulique-schema');
global.Terminaux = require('../etudes/public/js/terminaux');
global.Sanitaire = require('../etudes/public/js/sanitaire');
global.Pompes = require('../etudes/public/js/pompes');
const L = require('../etudes/public/js/liens');
const MR = require('../etudes/public/js/mesures-retour');

// Réseau arborescent par défaut, une vanne de fabricant (abaque) sur l'aérotherme A1.1 et une courbe de pompe
const etude = () => {
  const e = N.defauts('arbo');
  e.robinetterie = [{ rep: 'VE-A1.1', troncon: 'A1.1', type: 'equilibrage', dn: 25, qte: 1, kv: '', dp: '', tours: '', abaque: '1:0,9 ; 2:2,1 ; 3:3,6 ; 4:5,2', ref: 'Exemple VE 25' }];
  e.pompeCourbe = '0:9 ; 4:8,6 ; 8:7,4 ; 12:5,4 ; 16:2,6';
  return { id: 'e1', objet: 'Atelier fictif', notes: [{ id: 'a', type: 'arbo', titre: 'Réseau ateliers', entrees: e }] };
};
const releve = (et, facteurs, extra = {}) => {
  const C = MR.calcules(et, L), vs = [...C.vannes.values()];
  return { numero: 'EQ-T-01', date: '2026-11-02', type: 'Hydraulique', installation: 'Réseau ateliers', unite: 'm³/h', ...extra,
    lignes: vs.map((v, i) => ({ repere: v.repVanne, local: v.nom, theorique: v.Q, mesure: Math.round(v.Q * facteurs[i] * 1000) / 1000, reglage: i === 0 ? 'préréglage 3,5 tours' : '' })) };
};

test('abaque d\'une vanne : Kv aux tours, tours pour un Kv, linéaire sans abaque', () => {
  const v = { abaque: '1:0,9 ; 2:2,1 ; 3:3,6 ; 4:5,2', Kvs: 5.2, toursMax: 4 };
  assert.strictEqual(MR.kvAuxTours(v, 3.5), 4.4);
  assert.strictEqual(Math.round(MR.toursPourKv(v, 2.85).tours * 100) / 100, 2.5);
  assert.strictEqual(MR.toursPourKv(v, 8).borne, 'maxi');
  const lin = { Kvs: 4, toursMax: 4 };
  assert.strictEqual(MR.kvAuxTours(lin, 2), 2);
  assert.deepStrictEqual(MR.toursPourKv(lin, 3), { tours: 3, borne: '', abaque: false });
  assert.strictEqual(MR.toursDe('préréglage 2,5 tours (Exemple)'), 2.5);
  assert.strictEqual(MR.toursDe('3 t'), 3);
});

test('relevé hydraulique : écarts par terminal, vanne hors tolérance → nouveau nombre de tours (abaque du fabricant)', () => {
  const et = etude(), r = MR.comparer({ et, L, equilibrages: [releve(et, [1.3, 0.95, 1.02, 0.8, 1])], tolerance: 10 });
  assert.strictEqual(r.bilan.comparees, 5);
  assert.strictEqual(r.bilan.horsTolerance, 2);
  const a = r.lignes.find(l => l.repere === 'VE-A1.1');
  assert.strictEqual(a.niveau, 'terminal'); assert.strictEqual(a.ecart, 30); assert.strictEqual(a.conforme, false);
  const g = r.reglages.find(x => x.repere === 'VE-A1.1');
  // Réglage relevé 3,5 tours → Kv 4,4 ; débit trop fort de 30 % → Kv 3,38 → 2,9 tours sur l'abaque
  assert.match(g.actuel, /^3,5 tours \(Kv 4,4/);
  assert.strictEqual(g.valeur, 2.9);
  assert.match(g.detail, /abaque du fabricant/);
  const b = r.reglages.find(x => x.repere === 'VE-A2.2');
  assert.ok(b.valeur > 2.4, 'débit trop faible : la vanne s\'ouvre');
  assert.match(b.detail, /linéaire/);
  // Total du circuit
  assert.ok(r.lignes.some(l => l.total && l.niveau === 'circuit'));
});

test('tolérance réglable : ± 35 % → plus aucun réglage', () => {
  const et = etude(), r = MR.comparer({ et, L, equilibrages: [releve(et, [1.3, 0.95, 1.02, 0.8, 1])], tolerance: 35 });
  assert.strictEqual(r.tolerance, 35);
  assert.strictEqual(r.bilan.horsTolerance, 0);
  assert.strictEqual(r.reglages.length, 0);
});

test('écart régulier sur tout le circuit : réglage de la pompe d\'abord (consigne et vitesse)', () => {
  const et = etude(), r = MR.comparer({ et, L, equilibrages: [releve(et, [0.8, 0.82, 0.79, 0.81, 0.8])], tolerance: 10 });
  const p = r.reglages[0];
  assert.strictEqual(p.niveau, 'pompe');
  assert.ok(p.global);
  assert.match(p.propose, /consigne Δp ≈ .* mCE · vitesse ≈ \d+ %/);
  assert.ok(p.valeur > MR.calcules(et, L).pompes[0].H, 'débit trop faible : consigne de hauteur relevée');
});

test('PV de pompe : point mesuré face au point calculé, consigne Δp et vitesse proposées', () => {
  const mise = { numero: 'MS-T-01', type: 'pompes', equipement: 'Pompe P1', repere: 'P1', courbePompe: [{ Q: 0, H: 9 }, { Q: 4, H: 8.6 }, { Q: 8, H: 7.4 }, { Q: 12, H: 5.4 }, { Q: 16, H: 2.6 }],
    mesures: [{ libelle: 'Débit mesuré', unite: 'm³/h', section: 'Pompe 1', valeur: '12', attendu: 10, alias: ['Débit'] }, { libelle: 'HMT mesurée', unite: 'mCE', section: 'Pompe 1', valeur: '5,4', attendu: 5 },
      { libelle: 'Vitesse lue maxi', unite: 'tr/min', section: 'Pompe 1', valeur: '2800' }] };
  const r = MR.comparer({ mises: [mise], tolerance: 10 });
  assert.deepStrictEqual(r.lignes.map(l => [l.niveau, l.ecart]), [['pompe', 20], ['pompe', 8]]);
  const g = r.reglages[0];
  assert.strictEqual(g.niveau, 'pompe');
  // Hc = 5,4 × (10/12)² = 3,75 mCE ; vitesse 2800 × 10/12 ≈ 2333 tr/min
  assert.strictEqual(g.valeur, 3.75);
  assert.match(g.propose, /3,75 mCE · vitesse ≈ 2\s?333 tr\/min/);
  assert.match(g.propose, /% de la vitesse maxi \(courbe du fabricant\)/);
});

test('PV de CTA : ventilateur de soufflage hors tolérance → fréquence et consigne de pression ; bouches du PV', () => {
  const mise = { numero: 'MS-T-02', type: 'cta', equipement: 'CTA bureaux', mesures: [
    { libelle: 'Débit mesuré', unite: 'm³/h', section: 'Soufflage', valeur: '1700', attendu: 2000 }, { libelle: 'Fréquence ventilateur', unite: 'Hz', section: 'Soufflage', valeur: '40' },
    { libelle: 'Signal ventilateur', unite: '%', section: 'Soufflage', valeur: '80' }, { libelle: 'Pression de soufflage', unite: 'Pa', section: 'Soufflage', valeur: '200' },
    { libelle: 'Débit mesuré', unite: 'm³/h', section: 'Extraction', valeur: '1950', attendu: 2000 },
    { libelle: 'Débit S-02 — Bureau 2 (Zone A) · soufflage · branche S1.1', unite: 'm³/h', valeur: '150', attendu: 200 }] };
  const r = MR.comparer({ mises: [mise], tolerance: 10 });
  const v = r.reglages.find(x => x.niveau === 'ventilateur');
  assert.match(v.organe, /soufflage/);
  assert.match(v.propose, /47,1 Hz · signal 94 % · consigne de pression 277 Pa/);
  assert.ok(!r.reglages.some(x => /extraction/.test(x.organe)), 'extraction dans la tolérance');
  const b = r.lignes.find(l => l.repere === 'S-02');
  assert.deepStrictEqual([b.niveau, b.ecart, b.libelle], ['bouche', -25, 'Bureau 2 (Zone A)']);
});

test('relevé aéraulique : bouche à ouvrir, ΔP au plénum', () => {
  const r = MR.comparer({ equilibrages: [{ numero: 'EQ-T-02', type: 'Aéraulique', installation: 'Bureaux R+1', lignes: [{ repere: 'S-01', local: 'Bureau 1', theorique: 200, mesure: 160, reglage: 'cône 2' }, { repere: 'S-02', local: 'Bureau 2', theorique: 200, mesure: 205 }] }] });
  const g = r.reglages.find(x => x.repere === 'S-01');
  assert.strictEqual(g.niveau, 'bouche');
  assert.match(g.propose, /^Ouvrir le réglage : débit \+25 %/);
  assert.match(g.detail, /× 1,56/);
});

test('tableau « Réglages proposés » imprimable', () => {
  const et = etude(), r = MR.comparer({ et, L, equilibrages: [releve(et, [1.3, 0.95, 1.02, 0.8, 1])] }), h = MR.html(et, r, { societe: { nom: 'Société fictive' }, date: '15/11/2026' });
  assert.match(h, /RÉGLAGES PROPOSÉS APRÈS MISE EN SERVICE/);
  assert.match(h, /Vanne d'équilibrage VE-A1\.1/);
  assert.match(h, /2,9 tours/);
  assert.match(h, /Réglé \(date, visa\)/);
});
