// Schéma de principe : ballon tampon de découplage, bouteille 3 piquages, ballon tampon sur le départ ou le retour
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/terminaux');
const Sc = require('../etudes/public/js/schema');

const pid = o => ({ ...N.defauts('pid'), generateur: 'pac-air', nGen: '2', ...o });

test('ballon tampon de découplage à la place de la bouteille', () => {
  const r = N.calculer('pid', pid({ bouteille: 'ballon', ratioTampon: 15 })), d = Sc.dimensionner(pid({ bouteille: 'ballon', ratioTampon: 15 }));
  assert.strictEqual(d.decouplage, 'ballon');
  assert.ok(d.bouteille && !d.tb && d.Db > 0);
  assert.strictEqual(d.tampon.position, 'decouplage');
  assert.ok(d.tampon.V >= 200);
  assert.ok(r.resume.some(l => l[0] === 'Ballon tampon de découplage'));
  assert.match(r.schema, /Ballon tampon/);
  assert.match(r.schema, /de découplage/);
  assert.ok(!r.resume.some(l => l[0] === 'Bouteille de découplage'));
});

test('bouteille de découplage 3 piquages (retour commun)', () => {
  const r = N.calculer('pid', pid({ bouteille: 'bouteille3' }));
  assert.ok(r.resume.some(l => l[0] === 'Bouteille de découplage 3 piquages'));
  assert.ok(r.alertes.some(a => /Bouteille 3 piquages/.test(a.texte)));
  assert.match(r.schema, /3 piquages/);
});

test('ballon tampon en série sur le départ ou sur le retour', () => {
  const dep = N.calculer('pid', pid({ tampon: 'depart', ratioTampon: 20 })), ret = N.calculer('pid', pid({ tampon: 'oui', ratioTampon: 20 }));
  assert.match(dep.resume.find(l => l[0] === 'Ballon tampon')[1], /sur le départ/);
  assert.match(ret.resume.find(l => l[0] === 'Ballon tampon')[1], /sur le retour/);
  assert.match(dep.schema, /L · départ/);
  assert.match(ret.schema, /L · retour/);
  // Pas d'alerte « volume d'eau minimal à vérifier » quand un ballon tampon est prévu
  assert.ok(!dep.alertes.some(a => /Vérifier le volume d'eau minimal/.test(a.texte)));
});
