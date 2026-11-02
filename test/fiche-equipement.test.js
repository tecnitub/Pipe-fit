const test = require('node:test');
const assert = require('node:assert');
const Notes = require('../etudes/public/js/notes');
require('../etudes/public/js/schema');
require('../etudes/public/js/industriel');
const FE = require('../etudes/public/js/fiche-equipement');

test('Fiche de pompe : point de fonctionnement, P1, rendement calculé et contrôle', () => {
  const r = FE.lire(['HYDROPOMP - Circulateur électronique HX 50-120', 'Point de fonctionnement : 12,5 m³/h - 9,0 mCE', 'Débit maxi 28 m³/h  Hauteur maxi 12 m', 'Puissance absorbée P1 : 520 W', 'PN 10']);
  assert.deepStrictEqual([r.valeurs.Q, r.valeurs.H, r.valeurs.Qmax, r.valeurs.Hmax, r.valeurs.P1, r.valeurs.pmax], [12.5, 9, 28, 12, 520, 10]);
  const ch = FE.champs('reseau', r.valeurs);
  assert.deepStrictEqual(ch.map(c => [c.k, c.val]), [['rendement', 59]]);
  const res = Notes.calculer('reseau', { fiche: FE.fiche(r, 'pompe.pdf') });
  assert.ok(res.alertes.some(a => a.niveau === 'ok' && /point de fonctionnement 12,5 m³\/h à 9 mCE/.test(a.texte)), res.alertes.map(a => a.texte).join('\n'));
  assert.ok(res.resume.some(([k]) => k === 'Matériel (fiche technique)'));
  const petite = Notes.calculer('reseau', { fiche: { Q: 8, H: 6 } });
  assert.ok(petite.alertes.some(a => a.niveau === 'erreur' && /insuffisant/.test(a.texte)));
});

test('Fiche de vase, de ballon et de générateur', () => {
  const v = FE.lire(['Vase d\'expansion à membrane 300 litres', 'Pression de gonflage 1,5 bar', 'Pression maximale de service 6 bar']);
  assert.deepStrictEqual([v.valeurs.V, v.valeurs.p0, v.valeurs.pmax], [300, 1.5, 6]);
  const rv = Notes.calculer('vase', { fiche: FE.fiche(v) });
  assert.ok(rv.alertes.some(a => a.niveau === 'erreur' && /300 L pour 304 L/.test(a.texte)));
  const b = FE.lire(['Ballon ECS 1000 L', 'Échangeur à plaques puissance 45 kW']);
  assert.deepStrictEqual(FE.champs('ecs', b.valeurs).map(c => [c.k, c.val]), [['P', 45]]);
  assert.ok(Notes.calculer('ecs', { fiche: FE.fiche(b) }).alertes.some(a => a.niveau === 'ok' && /1\s000 L pour 820 L/.test(a.texte)));
  const g = FE.lire(['Chaudière gaz à condensation', 'Puissance utile nominale 160 kW', 'Rendement utile 108 %']);
  assert.deepStrictEqual(FE.champs('pid', g.valeurs).map(c => [c.k, c.val]), [['Pgen', 160]]);
  const rg = Notes.calculer('pid', { nGen: 2, fiche: FE.fiche(g) });
  assert.ok(rg.alertes.some(a => a.niveau === 'ok' && /160 kW × 2 = 320 kW pour 240 kW/.test(a.texte)), rg.alertes.map(a => a.texte).join('\n'));
  assert.strictEqual(FE.gere('cta'), false);
});
