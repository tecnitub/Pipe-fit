// Valeurs réglementaires des Réglages : libellés des listes de fluides (PRP retenu, surcharge marquée) et mise à jour
// des anciennes études (champs « vide : Réglages » restés sur l'ancien défaut). Données fictives (ACME, Exemplair).
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Notes = N;
const VR = require('../etudes/public/js/valeurs-regl');
const F = require('../etudes/public/js/annexes-froid');
require('../etudes/public/js/annexes-air');
require('../etudes/public/js/annexes-plomberie');
require('../etudes/public/js/annexes-reglementaire');
const MV = require('../etudes/public/js/maj-valeurs');

afterEach(() => VR.utiliser({}));
const optionsFluide = (type, e = {}, col) => {
  const T = N.TYPES[type];
  const c = col ? T.champs.find(x => x.k === col).colonnes.find(x => x.k === 'fluide') : T.champs.find(x => x.k === 'fluide');
  return typeof c.o === 'function' ? c.o(e) : c.o;
};
const lib = (o, k) => o.find(([x]) => x === k)[1];

test('listes des fluides : PRP par défaut sans surcharge, libellés inchangés', () => {
  ['drv', 'chambreFroide'].forEach(t => {
    const o = optionsFluide(t);
    assert.strictEqual(o.length, Object.keys(F.FLUIDES).length, t);
    assert.strictEqual(lib(o, 'R32'), 'R32 — A2L, PRP 675');
    assert.strictEqual(lib(o, 'R410A'), 'R410A — A1, PRP 2088');
    assert.ok(o.every(([, l]) => !/Réglages/.test(l)), t);
  });
  assert.strictEqual(lib(optionsFluide('fluides', {}, 'equipements'), 'R744'), 'R744 (CO₂) — A1, PRP 1');
});

test('listes des fluides : PRP surchargé dans les Réglages affiché et marqué, AR5 quand la note le retient', () => {
  VR.utiliser({ 'fluide.R32.ar4': 700, 'fluide.R410A.ar5': 2000 });
  ['drv', 'chambreFroide'].forEach(t => {
    const o = optionsFluide(t);
    assert.strictEqual(lib(o, 'R32'), 'R32 — A2L, PRP 700 ✱ Réglages (défaut 675)', t);
    assert.strictEqual(lib(o, 'R410A'), 'R410A — A1, PRP 2088', t); // AR5 surchargé, AR4 affiché : pas de marque
  });
  const o5 = optionsFluide('drv', { refPrp: 'AR5' });
  assert.strictEqual(lib(o5, 'R410A'), 'R410A — A1, PRP AR5 2000 ✱ Réglages (défaut 1924)');
  assert.strictEqual(lib(o5, 'R32'), 'R32 — A2L, PRP AR5 677');
  assert.strictEqual(lib(optionsFluide('fluides', { refPrp: 'AR4' }, 'equipements'), 'R32'), 'R32 — A2L, PRP 700 ✱ Réglages (défaut 675)');
  // Le choix de fluide reste valide pour le calcul (liste en fonction)
  const r = N.calculer('drv', { ...N.defauts('drv'), fluide: 'R32', chargeUsine: 10, liquide: [] });
  assert.strictEqual(r.valeurs.tCO2e, 7);
  VR.utiliser({});
  assert.strictEqual(lib(optionsFluide('drv'), 'R32'), 'R32 — A2L, PRP 675');
});

const etudesFictives = () => [
  { id: 'e1', objet: 'ACME — parking R-1', notes: [
    { id: 'n1', type: 'parking', titre: 'Parking ACME', entrees: { ...N.defauts('parking'), qPlace: 600, coAl: '100', coPV: 18, noPV: '0,5' } },
    { id: 'n2', type: 'piscine', titre: 'Piscine', entrees: { ...N.defauts('piscine'), qBaigneur: 25 } },
    { id: 'n3', type: 'drv', titre: 'DRV', entrees: { qPlace: 600 } }] },
  { id: 'e2', objet: 'Exemplair — chaufferie', notes: [
    { id: 'n4', type: 'chaufferie', titre: 'Chaufferie Exemplair', entrees: { ...N.defauts('chaufferie'), sChauff: 70, sIcpeDC: '' } },
    { id: 'n5', type: 'confort', titre: 'Confort', entrees: { ...N.defauts('confort'), cKoestel: 0.42 } }] },
  { id: 'e3', objet: 'Modèle', modele: true, notes: [{ id: 'n6', type: 'parking', titre: 'Parking type', entrees: { qPlace: '600' } }] },
];

test('table des champs : clés connues, ancien défaut égal au défaut des Réglages, champs vides par défaut', () => {
  MV.CHAMPS.forEach(c => {
    assert.ok(VR.DEFS[c.cle], c.cle);
    assert.strictEqual(VR.defaut(c.cle), c.ancien, c.cle);
    assert.strictEqual(N.defauts(c.type)[c.champ], '', `${c.type}.${c.champ}`);
  });
});

test('détection : seulement les champs à l\'ancien défaut dont la valeur des Réglages diffère', () => {
  const et = etudesFictives();
  assert.deepStrictEqual(MV.detecter(et), []); // Réglages par défaut : rien à faire
  VR.utiliser({ 'parking.qPlace': 500, 'parking.coPV': 15, 'parking.noPV': 0.4, 'piscine.qBaigneur': 30, 'chaufferie.seuil': 85, 'icpe.dc': 900 });
  const l = MV.detecter(et);
  assert.deepStrictEqual(l.map(x => `${x.noteId}.${x.champ}:${x.ancienne}→${x.nouvelle}`), ['n1.qPlace:600→500', 'n1.noPV:0,5→0.4', 'n4.sChauff:70→85', 'n6.qPlace:600→500']);
  // Valeur réellement saisie (coPV 18, qBaigneur 25), champ vide (sIcpeDC), autre type de note : jamais proposés
  assert.ok(!l.some(x => ['coPV', 'qBaigneur', 'sIcpeDC'].includes(x.champ) || x.noteId === 'n3'));
  const q = l[0];
  assert.strictEqual(q.etude, 'ACME — parking R-1');
  assert.strictEqual(q.note, 'Parking ACME');
  assert.strictEqual(q.unite, 'm³/h');
  assert.ok(q.differe && l[3].modele);
  // « tous » : aussi les champs à l'ancien défaut quand les Réglages n'ont pas changé (coAl, cKoestel)
  const t = MV.detecter(et, { tous: true });
  assert.ok(t.some(x => x.champ === 'coAl' && !x.differe) && t.some(x => x.champ === 'cKoestel' && !x.differe));
  assert.strictEqual(t.length, l.length + 2);
});

test('application : vider (le calcul suit les Réglages) ou écrire la valeur des Réglages ; saisie entre-temps respectée', () => {
  VR.utiliser({ 'parking.qPlace': 500, 'chaufferie.seuil': 85 });
  const et = etudesFictives(), l = MV.detecter(et);
  assert.strictEqual(N.calculer('parking', et[0].notes[0].entrees).valeurs.QGV, 60000);
  // Saisie dans la note n6 après l'aperçu : la ligne n'est plus appliquée
  et[2].notes[0].entrees.qPlace = 550;
  const r = MV.appliquer(et, l, 'vider');
  assert.strictEqual(r.n, 2);
  assert.deepStrictEqual(r.etudes.map(x => x.id), ['e1', 'e2']);
  assert.strictEqual(et[0].notes[0].entrees.qPlace, '');
  assert.strictEqual(et[2].notes[0].entrees.qPlace, 550);
  assert.strictEqual(et[0].notes[0].entrees.coAl, '100'); // non coché (Réglages inchangés)
  const c = N.calculer('parking', et[0].notes[0].entrees);
  assert.strictEqual(c.valeurs.QGV, 50000);
  assert.ok(c.hypotheses.some(h => /modifiée dans les Réglages/.test(h)));
  assert.strictEqual(et[1].notes[0].entrees.sChauff, '');
  // Deuxième passage : plus rien
  assert.deepStrictEqual(MV.detecter(et), []);
  // Mode « valeur »
  const et2 = etudesFictives(), r2 = MV.appliquer(et2, MV.detecter(et2).filter(x => x.etudeId === 'e1'), 'valeur');
  assert.strictEqual(r2.n, 1);
  assert.strictEqual(et2[0].notes[0].entrees.qPlace, 500);
  assert.strictEqual(et2[2].notes[0].entrees.qPlace, '600');
  // Ligne inconnue ou incohérente : ignorée
  assert.strictEqual(MV.appliquer(et2, [{ etudeId: 'x', noteId: 'n1', champ: 'qPlace' }, { etudeId: 'e1', noteId: 'n2', champ: 'qPlace' }]).n, 0);
});
