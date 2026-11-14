// Puissance d'un bâtiment : surface, niveaux, hauteur, enveloppe, machines, extractions → chauffage et / ou climatisation
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Notes = N;
require('../etudes/public/js/schema');
const L = require('../etudes/public/js/liens');
const def = (x = {}) => ({ ...N.defauts('batiment'), ...x });
const calc = x => N.calculer('batiment', def(x));

test('même résultat que le bilan d\'un local équivalent (volume, parois, air)', () => {
  const r = calc({ S: 400, niveaux: 1, h: 4, forme: 1, saisieVitrage: 'm2', Svitrage: 20, protection: '1', orientation: 'sud', occupants: 10, activite: 'bureau', eclairage: 10, bureautique: 0, qv: 500, Ti: 19, TiEte: 26 });
  const b = N.calculer('bilan', { ...N.defauts('bilan'), L: 20, l: 20, H: 4, facades: '4', Ti: 19, TiEte: 26, climat: def().climat, mur: def().mur, toit: def().toit, plancher: def().plancher,
    vitrage: def().vitrage, Svitrage: 20, orientation: 'sud', protection: '1', Slanterneau: 0, porte: def().porte, Sporte: def().Sporte, ponts: def().ponts, infiltration: 'standard', qv: 500, recup: 0, qext: 0,
    occupants: 10, activite: 'bureau', eclairage: 10, process: [], processHiver: '0', relance: def().relance, marge: def().marge });
  assert.ok(Math.abs(r.valeurs.Pchauf - b.valeurs.Pchauf) < 1, `${r.valeurs.Pchauf} / ${b.valeurs.Pchauf}`);
  assert.ok(Math.abs(r.valeurs.Pfroid - b.valeurs.Pfroid) < 1, `${r.valeurs.Pfroid} / ${b.valeurs.Pfroid}`);
});

test('niveaux : surface totale, toiture sur un seul niveau, éclairage sur toute la surface', () => {
  const a = calc({ niveaux: 1 }), b = calc({ niveaux: 3 });
  assert.strictEqual(b.valeurs.Stot, 3 * a.valeurs.Stot);
  assert.ok(b.valeurs.Pchauf > a.valeurs.Pchauf && b.valeurs.Pchauf < 3 * a.valeurs.Pchauf, 'toiture et plancher non multipliés');
  assert.ok(!b.alertes.some(x => /Grande hauteur/.test(x.texte)), 'pas de stratification pour plusieurs niveaux');
});

test('valeurs de l\'usage quand les champs sont vides, saisies sinon', () => {
  const r = calc({ usage: 'bureaux', S: 600, niveaux: 2 });
  assert.strictEqual(r.valeurs.occupants, 100);
  assert.strictEqual(r.valeurs.qv, 2500);
  assert.strictEqual(calc({ occupants: 7, qv: 300 }).valeurs.qv, 300);
});

test('machines et extractions : apports d\'été, compensation de l\'air extrait', () => {
  const base = calc(), m = calc({ machines: [{ nom: 'Presse', qte: 2, P: 10, simult: 50, sensible: 100 }] });
  assert.ok(Math.abs(m.valeurs.Ss - base.valeurs.Ss - 10000) < 1, 'apport sensible de 2 × 10 kW à 50 %');
  assert.ok(Math.abs(m.valeurs.Pchauf - base.valeurs.Pchauf) < 1, 'machines non déduites par défaut');
  const ext = calc({ extractions: [{ nom: 'Hotte', Q: 2000, comp: 'exterieur', simult: 100 }] }), tr = calc({ extractions: [{ nom: 'Sanitaires', Q: 2000, comp: 'transfert', simult: 100 }] });
  const dT = 20 - (-10), maj = 1 + Number(def().relance) / 100;
  assert.ok(Math.abs(ext.valeurs.Pchauf - base.valeurs.Pchauf - 0.34 * 2000 * dT * maj) < 2);
  assert.ok(Math.abs(tr.valeurs.Pchauf - base.valeurs.Pchauf) < 1, 'air de transfert sans effet');
  assert.ok(ext.alertes.some(x => /compensés par de l'air extérieur/.test(x.texte)));
});

test('puissance recherchée : chauffage seul, climatisation seule', () => {
  const ch = calc({ mode: 'chaud' }), fr = calc({ mode: 'froid' });
  assert.match(ch.synthese, /^chaud/); assert.doesNotMatch(ch.synthese, /froid/);
  assert.match(fr.synthese, /^froid/);
  assert.strictEqual(ch.tableaux.length, 1); assert.strictEqual(fr.tableaux.length, 1);
});

test('lié à l\'étude : climat repris, puissance reprise par un circuit du schéma de principe', () => {
  const bat = { id: 'b', type: 'batiment', titre: 'Bâtiment', entrees: def({ climat: 'perso', Te: 0 }) };
  const pid = { id: 'p', type: 'pid', titre: 'Chaufferie', entrees: { ...N.defauts('pid'), circuits: [{ rep: 'Radiateurs', emetteur: 'radiateurs', P: 1, bilan: 'b', regulation: '3v', L: 40 }] } };
  const et = { objet: 'Test', climat: 'lyon', notes: [bat, pid] };
  const eb = L.resoudre(et, bat).entrees;
  assert.strictEqual(eb.climat, 'lyon');
  const P = N.calculer('batiment', eb).valeurs.Pchauf;
  assert.strictEqual(L.resoudre(et, pid).entrees.circuits[0].P, Math.round(P / 100) / 10);
});
