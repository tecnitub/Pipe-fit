// Dimensionnement des câbles des liaisons à la charge du lot CVC (application Études).
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/electricite');
const K = require('../etudes/public/js/cables');

const proche = (v, ref, tol, msg) => assert.ok(Math.abs(v - ref) <= tol, `${msg || ''} ${v} ≠ ${ref} ± ${tol}`);

test('TGBT → armoire puis armoire → pompe éloignée : courant admissible, chute de tension cumulée', () => {
  const r = N.calculer('cable', N.defauts('cable'));
  const [l1, l2] = r.valeurs.liaisons;
  // L1 : 30 kW tri, cos 0,85 → Ib 50,9 A, In 63 A ; chemin perforé, 3 circuits (k 0,82) → Iz requis 76,8 A → 16 mm² (PR, E : 100 A)
  assert.deepStrictEqual([l1.In, l1.S, l1.cable], [63, 16, 'U1000 R2V 5G16']);
  // ΔU L1 = (0,0225·60/16·0,85 + 0,00008·60·0,527)·50,9 / 230 = 1,64 % + 0,5 % en amont
  proche(l1.du, 2.14, 0.02);
  // L2 : 4 kW tri, 120 m enterré ; 1,5 mm² suffit au courant mais ΔU cumulée 6,7 % > 5 % → 2,5 mm² (4,9 %)
  assert.deepStrictEqual([l2.In, l2.S], [10, 2.5]);
  proche(l2.du, 4.86, 0.05);
  assert.ok(r.alertes.some(a => /L2 : section portée de 1,5 à 2,5 mm² \(chute de tension\)/.test(a.texte)));
  assert.ok(!r.alertes.some(a => a.niveau === 'erreur'));
});

test('température, groupement, monophasé, aluminium, protection imposée', () => {
  const base = { rep: 'X', tension: 'mono', P: 3, cos: 1, L: 10, pose: 'C', isolant: 'PVC', mat: 'Cu', temp: 30, groupes: 1, courbe: 'C', duMax: 5 };
  const a = K.liaison(base);
  proche(a.Ib, 13.04, 0.01); assert.deepStrictEqual([a.In, a.S], [16, 1.5]); // C PVC 1,5 : 17,5 × 1,13 = 19,8 A ≥ 16 A
  const chaud = K.liaison({ ...base, temp: 50, groupes: 4 }); // k = 0,71 × 0,75
  assert.ok(chaud.S > a.S, `section ${chaud.S}`);
  assert.strictEqual(K.liaison({ ...base, mat: 'Al' }).S, 16, 'aluminium : 16 mm² au moins');
  assert.strictEqual(K.liaison({ ...base, In: 32 }).S, 4, 'protection imposée 32 A : Iz ≥ 32 A');
});

test('schéma TN : longueur maxi protégée contre les contacts indirects', () => {
  const x = { rep: 'P', tension: 'tri', P: 2, cos: 0.85, L: 150, pose: 'E', isolant: 'PR', mat: 'Cu', temp: 30, groupes: 1, courbe: 'D', duMax: 8 };
  const tt = K.liaison(x, 0, 'TT'), tn = K.liaison(x, 0, 'TN');
  // In 4 A courbe D : Ia = 80 A ; Lmax(1,5) = 0,8 × 230 × 1,5 / (0,027 × 2 × 80) = 64 m → section augmentée en TN
  proche(K.liaison({ ...x, L: 10 }, 0, 'TN').Lmax, 63.9, 0.2);
  assert.ok(tn.S > tt.S && tn.Lmax >= 150, `TN ${tn.S} mm², Lmax ${tn.Lmax}`);
});

test('liaisons reprises de l\'alimentation électrique : armoires depuis le TGBT, départs éloignés, amont relié', () => {
  const elec = { ...N.defauts('elec'), armoires: [{ rep: 'AR1', L: 40, ks: 80, reserve: 20 }], equipements: [
    { rep: 'P1', type: 'pompe', P: 1.5, alim: '', L: 80 }, { rep: 'P2', type: 'pompe', P: 0.3, alim: 'AR1' }, { rep: 'PAC', type: 'pac', P: 20, alim: 'elec', L: 30 }, { rep: 'V1', type: 'vanne', alim: 'AR1', L: 50 }] };
  const l = K.depuisElectricite(elec);
  assert.deepStrictEqual(l.map(x => [x.rep, x.de, x.amont || '']), [['TGBT-AR1', 'TGBT', ''], ['AR1-P1', 'Armoire AR1', 'TGBT-AR1']]); // P1 : première armoire par défaut
  assert.strictEqual(l[0].duMax, 2);
  // Les choix faits (mode de pose) sont gardés à la reprise suivante
  l[1].pose = 'D';
  assert.strictEqual(K.depuisElectricite(elec, l).find(x => x.rep === 'AR1-P1').pose, 'D');
  const r = N.calculer('cable', { ...N.defauts('cable'), liaisons: l });
  assert.ok(r.valeurs.liaisons.every(x => x.S >= 1.5));
  assert.ok(r.valeurs.liaisons[1].du > r.valeurs.liaisons[0].du, 'chute de tension cumulée');
});
