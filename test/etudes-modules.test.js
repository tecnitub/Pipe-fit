// Nouveaux modules : évacuations EU/EV, réseau de gaz arborescent, désenfumage, bilan pièce par pièce
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/industriel');
global.Terminaux = require('../etudes/public/js/terminaux');
global.Sanitaire = require('../etudes/public/js/sanitaire');
const Ev = require('../etudes/public/js/evacuation');
require('../etudes/public/js/gaz-reseau');
require('../etudes/public/js/desenfumage');
const P = require('../etudes/public/js/pieces');
global.Pieces = P;
const E = require('../etudes/public/js/electricite');
const Liens = require('../etudes/public/js/liens');
const M = require('../etudes/public/js/metre');
const PM = require('../etudes/public/js/points-mes');

test('évacuations : Qww = K √ΣDU, Ø 100 en aval d\'un WC, chute, remplissage', () => {
  const r = N.calculer('evacuation', N.defauts('evacuation')), t = r.valeurs.troncons;
  assert.ok(Math.abs(r.valeurs.Q - 2.0) < 1e-9); // WC 2,0 > 0,5 √3
  assert.strictEqual(t.find(x => x.rep === 'B1').d, 100);
  assert.ok(t.find(x => x.rep === 'COL').d >= t.find(x => x.rep === 'CH1').d);
  const beaucoup = { ...N.defauts('evacuation'), usage: 'public', appareils: Array.from({ length: 30 }, (_, i) => ({ rep: `WC${i}`, type: 'wc', troncon: 'B1' })) };
  assert.ok(N.calculer('evacuation', beaucoup).valeurs.troncons.find(x => x.rep === 'CH1').d > 100);
  // Débit à moitié plein = moitié du débit à pleine section
  assert.ok(Math.abs(Ev.partiel(0.5).q - 0.5) < 1e-9);
  assert.deepStrictEqual(Ev.depuisSanitaire([{ rep: 'WC-01', type: 'wc', salle: 'S', etage: 'R+1' }, { rep: 'X', type: 'puisage' }]).map(a => a.type), ['wc']);
});

test('gaz arborescent : perte de pression au plus défavorisé sous l\'admissible', () => {
  const r = N.calculer('gazReseau', N.defauts('gazReseau'));
  assert.ok(r.valeurs.dpPire <= r.valeurs.dpmax + 1e-9);
  assert.ok(Math.abs(r.valeurs.Qn - 340 / 9.45) < 1e-9);
  assert.ok(r.alertes.some(a => a.niveau === 'ok' && /défavorisé/.test(a.texte)));
});

test('désenfumage : 1 m³/s par 100 m², ventilateur sur le canton le plus exigeant, bilan électrique', () => {
  const r = N.calculer('desenfumage', N.defauts('desenfumage'));
  assert.ok(Math.abs(r.valeurs.Qv - 4.5 * 1.2) < 1e-9);
  assert.strictEqual(r.valeurs.debits[0].theorique, 16200);
  const et = { id: 'x', notes: [{ id: 'd', type: 'desenfumage', titre: 'Désenfumage', entrees: N.defauts('desenfumage') }] };
  const l = E.equipementsEtude(et, Liens);
  assert.ok(l.some(x => x.rep === 'VDE' && x.P > 3) && l.some(x => x.rep === 'VDA') && l.some(x => x.rep === 'VD'));
  assert.ok(M.metre(et).some(p => p.chapitre === 'Désenfumage'));
  assert.ok(PM.extraire(et, n => Liens.calculer(et, n)).some(p => p.type === 'desenfumage'));
});

test('bilan pièce par pièce : besoins comparés aux terminaux, terminaux manquants', () => {
  const r = N.calculer('pieces', N.defauts('pieces'));
  const b1 = r.valeurs.pieces[0];
  // Bureau 1 : G 0,7 × 48,6 m³ × 26 K + 0,34 × 45 m³/h × 26 K, + 10 %
  assert.ok(Math.abs(b1.Pch - (0.7 * 18 * 2.7 * 26 + 0.34 * 45 * 26) * 1.1 / 1000) < 1e-9);
  const pieces = { id: 'p', type: 'pieces', titre: 'Bilan', entrees: N.defauts('pieces') };
  const term = { id: 't', type: 'terminaux', titre: 'Terminaux', entrees: { ...N.defauts('terminaux'), appareils: [{ rep: 'CA-01', local: 'bureau 1', type: 'cassette4', n: 1, Pch: 0.5, Pfr: 0.5, batterie: '4t', vanne: '2v' }] } };
  const et = { id: 'x', notes: [pieces, term] };
  const rt = Liens.calculer(et, term);
  assert.ok(rt.alertes.some(a => a.niveau === 'erreur' && /Bureau 1 : terminaux insuffisants/.test(a.texte)));
  assert.ok(rt.tableaux.some(t => /Besoins des pièces/.test(t.titre)));
  assert.deepStrictEqual(P.terminauxManquants(et, term.entrees.appareils).map(x => x.local), ['Bureau 2', 'Salle de réunion']);
});
