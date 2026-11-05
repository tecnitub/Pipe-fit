// CTA : puissances des batteries saisies (fiche du fabricant) au lieu du calcul depuis les conditions extérieures
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta');
const FC = require('../etudes/public/js/fiche-cta');

test('CTA : mode saisie des puissances (débits d\'eau, pas d\'évolution de l\'air)', () => {
  const e = { ...N.defauts('cta'), modeP: 'saisie', PchaudS: 42, PfroidS: 55 };
  const r = N.calculer('cta', e);
  assert.strictEqual(r.valeurs.Pchaud, 42);
  assert.strictEqual(r.valeurs.Pfroid, 55);
  // Débit d'eau chaude au régime 70/50 : 42 kW / (1,163 × 20) ≈ 1,8 m³/h
  assert.ok(Math.abs(r.valeurs.QwC - 42 / (1.163 * 20)) < 0.05);
  assert.ok(!r.tableaux.some(t => /Évolution de l'air/.test(t.titre)));
  assert.ok(r.resume.some(l => /saisies/.test(l[1])));
  // Conditions extérieures masquées dans la saisie
  const champ = k => N.TYPES.cta.champs.find(c => c.k === k);
  assert.strictEqual(champ('TeH').si(e), false);
  assert.strictEqual(champ('PchaudS').si(e), true);
  // Sans puissance saisie : à compléter
  assert.ok(N.calculer('cta', { ...e, PchaudS: '' }).alertes.some(a => /batterie chaude à saisir/.test(a.texte)));
  // Mode calcul : inchangé
  assert.ok(N.calculer('cta', N.defauts('cta')).tableaux.some(t => /Évolution de l'air en hiver/.test(t.titre)));
});

test('fiche technique de la CTA : puissances lues reprises en saisie directe', () => {
  const ch = FC.champs('cta', { Qs: 6000, PchBC: 38.5, PfrBF: 51 });
  assert.deepStrictEqual(ch.filter(c => ['PchaudS', 'PfroidS', 'modeP'].includes(c.k)).map(c => [c.k, c.val]), [['PchaudS', 38.5], ['PfroidS', 51], ['modeP', 'saisie']]);
});

test('CTA : batterie change-over, batterie chaude seule, batterie froide seule', () => {
  const base = N.defauts('cta');
  const co = N.calculer('cta', { ...base, froid: 'co' }), cf = N.calculer('cta', base);
  // Change-over : mêmes puissances que chaude + froide, une seule batterie (pas de perte de charge de batterie chaude)
  assert.ok(Math.abs(co.valeurs.Pchaud - cf.valeurs.Pchaud) < 1e-9 && Math.abs(co.valeurs.Pfroid - cf.valeurs.Pfroid) < 1e-9);
  assert.ok(Math.abs(cf.valeurs.dpS - co.valeurs.dpS - Number(base.dpBC)) < 1e-9);
  assert.ok(co.resume.some(l => /Batterie change-over \(hiver\)/.test(l[0])) && co.resume.some(l => /Batterie change-over \(été\)/.test(l[0])));
  assert.ok(co.alertes.some(a => /change-over/.test(a.texte)));
  assert.match(co.schema, /Batterie change-over/);
  const ch = N.calculer('cta', { ...base, froid: 'non' });
  assert.ok(ch.valeurs.Pchaud > 0 && !ch.resume.some(l => /Batterie froide/.test(l[0])));
  const fr = N.calculer('cta', { ...base, froid: 'froide' });
  assert.strictEqual(fr.valeurs.Pchaud, 0);
  assert.ok(fr.valeurs.Pfroid > 0);
  assert.ok(fr.alertes.some(a => /Sans batterie chaude/.test(a.texte)));
  assert.ok(!fr.resume.some(l => l[0] === 'Batterie chaude'));
  // Saisie directe en change-over
  const s = N.calculer('cta', { ...base, froid: 'co', modeP: 'saisie', PchaudS: 30, PfroidS: 45 });
  assert.deepStrictEqual([s.valeurs.Pchaud, s.valeurs.Pfroid], [30, 45]);
});
