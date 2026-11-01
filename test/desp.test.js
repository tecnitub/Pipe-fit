const test = require('node:test');
const assert = require('node:assert');
const Desp = require('../etudes/public/js/desp');
const Notes = require('../etudes/public/js/notes');

test('DESP : nature du fluide (eau liquide ou gaz selon la pression de vapeur)', () => {
  assert.ok(Math.abs(Desp.pvapEau(100) - 1.013) < 0.01);
  assert.ok(Desp.T_EAU_GAZ > 110 && Desp.T_EAU_GAZ < 113);
  assert.strictEqual(Desp.nature('eau', 90).etat, 'liquide');
  assert.strictEqual(Desp.nature('eau-surchauffee', 140).etat, 'gaz');
  assert.strictEqual(Desp.nature('fioul', 70).groupe, 1);
  assert.strictEqual(Desp.nature('fioul', 20).groupe, 2);
  assert.deepStrictEqual([Desp.nature('perso', 20, { etat: 'gaz', groupe: '1' }).etat, Desp.nature('perso', 20, { etat: 'gaz', groupe: '1' }).groupe], ['gaz', 1]);
});

test('DESP : tuyauteries (tableaux 6 à 9)', () => {
  const c = (fluide, PS, TS, DN) => Desp.classer('tuyauterie', { fluide, PS, TS, DN }).categorie;
  assert.strictEqual(c('eau', 6, 90, 100), 0); // eau chaude : article 4.3
  assert.strictEqual(c('eau', 16, 90, 250), 0); // PS·DN = 4000 ≤ 5000
  assert.strictEqual(c('eau', 25, 90, 250), 1); // PS·DN = 6250
  assert.strictEqual(c('vapeur', 7, 170, 65), 0); // PS·DN = 455 ≤ 1000
  assert.strictEqual(c('vapeur', 12, 190, 100), 1);
  assert.strictEqual(c('eau-surchauffee', 10, 140, 150), 2);
  assert.strictEqual(c('vapeur', 20, 400, 200), 3); // cat. II portée en III au-delà de 350 °C
  assert.strictEqual(c('gaz-naturel', 4, 20, 50), 1);
  assert.strictEqual(c('gaz-naturel', 4, 20, 25), 0);
  assert.strictEqual(c('gaz-naturel', 0.3, 20, 200), -1); // hors champ
  assert.strictEqual(c('gaz-naturel', 20, 20, 150), 2);
  assert.strictEqual(c('r32', 42, 60, 28), 2); // PS·DN = 1176 > 1000
  assert.strictEqual(c('r32', 42, 60, 22), 0); // DN ≤ 25
  assert.strictEqual(c('solvant', 16, 20, 200), 2);
});

test('DESP : récipients et générateurs', () => {
  const r = (fluide, PS, TS, V) => Desp.classer('recipient', { fluide, PS, TS, V }).categorie;
  assert.strictEqual(r('air', 11, 20, 500), 4); // réservoir d'air : PS·V = 5500 > 3000
  assert.strictEqual(r('air', 11, 20, 4), 0); // PS·V = 44 ≤ 50
  assert.strictEqual(r('azote', 6, 110, 300), 3); // vase d'expansion (coussin d'azote) : PS·V = 1800
  assert.strictEqual(r('eau', 7, 60, 500), 0); // ballon ECS : article 4.3
  assert.strictEqual(r('eau', 7, 140, 500), 4); // eau à 140 °C : traitée comme un gaz, PS·V = 3500
  const g = (PS, TS, V) => Desp.classer('generateur', { fluide: 'vapeur', PS, TS, V }).categorie;
  assert.strictEqual(g(10, 184, 2000), 4);
  assert.strictEqual(g(1, 120, 30), 1);
  assert.strictEqual(g(10, 184, 2), 0);
  assert.strictEqual(Desp.exigences(3).filter(x => /organisme notifié|tierce/.test(x)).length >= 3, true);
  assert.ok(Math.abs(Desp.epreuve(10) - 14.3) < 1e-9);
});

test('DESP : note de calcul', () => {
  const res = Notes.calculer('desp', {});
  assert.strictEqual(res.valeurs.categorieMax, 2);
  assert.ok(res.valeurs.soumis);
  assert.ok(res.tableaux[0].lignes.length === 4);
  assert.ok(res.valeurs.PT >= 14.3);
  const eau = Notes.calculer('desp', { fluide: 'eau', PS: 6, TS: 90, DN: 100, troncons: [] });
  assert.strictEqual(eau.valeurs.soumis, false);
  assert.ok(eau.alertes.some(a => /article 4\.3/.test(a.texte)));
});
