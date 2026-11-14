// Valeurs réglementaires des calculs annexes : défauts identiques aux tables des calculs, surcharges des Réglages
// utilisées seulement pour les champs laissés vides et signalées dans la note de calcul
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Notes = N;
const VR = require('../etudes/public/js/valeurs-regl');
const F = require('../etudes/public/js/annexes-froid');
const A = require('../etudes/public/js/annexes-air');
require('../etudes/public/js/annexes-plomberie');
require('../etudes/public/js/annexes-reglementaire');

afterEach(() => VR.utiliser({}));
const signale = r => r.hypotheses.some(h => /modifiée dans les Réglages/.test(h)) && r.alertes.some(a => /Réglages/.test(a.texte));

test('chaque valeur a un défaut, un libellé, une source et une date ; défauts égaux aux tables des calculs', () => {
  VR.liste().forEach(x => {
    assert.ok(Number.isFinite(x.defaut), x.cle);
    assert.ok(x.libelle && x.source && x.date && x.groupe, x.cle);
    assert.strictEqual(x.surchargee, false);
  });
  Object.entries(F.FLUIDES).forEach(([k, f]) => assert.deepStrictEqual([VR.v(`fluide.${k}.ar4`), VR.v(`fluide.${k}.ar5`), VR.v(`fluide.${k}.lp`), VR.v(`fluide.${k}.lfl`)], [f[1], f[2], f[4], f[5]], k));
  assert.deepStrictEqual(F.SEUILS_FGAZ, [[VR.v('fgaz.seuil3'), VR.v('fgaz.mois3'), VR.v('fgaz.mois3d')], [VR.v('fgaz.seuil2'), VR.v('fgaz.mois2'), VR.v('fgaz.mois2d')], [VR.v('fgaz.seuil1'), VR.v('fgaz.mois1'), VR.v('fgaz.mois1d')]]);
  Object.entries(A.TMOY).forEach(([k, t]) => assert.strictEqual(VR.v(`sol.${k}`), t, k));
  Object.entries(A.USAGES).forEach(([k, u]) => {
    if (u[1] !== null && u[4] === 'occ') assert.strictEqual(VR.v(`airNeuf.ct.${k}`), u[1], k);
    if (u[2] !== null && u[4] === 'occ') assert.strictEqual(VR.v(`airNeuf.rsdt.${k}`), u[2], k);
  });
  assert.deepStrictEqual([A.POLLUTION.wc(1), A.POLLUTION.wc(3), A.POLLUTION.sdb(), A.POLLUTION.sdbwc(), A.POLLUTION.groupes(4)], [30, 75, 45, 60, 90]);
  assert.strictEqual(VR.v('cle.inconnue', 7), 7);
});

test('surcharges : clés inconnues et valeurs égales au défaut écartées, virgule décimale lue', () => {
  assert.deepStrictEqual(VR.nettoyer({ 'parking.qPlace': '500', 'parking.coPV': 20, 'x.y': 3, 'parking.noPV': '0,4', 'fgaz.seuil1': 'abc' }), { 'parking.qPlace': 500, 'parking.noPV': 0.4 });
  VR.utiliser({ 'parking.qPlace': 500 });
  assert.strictEqual(VR.v('parking.qPlace'), 500);
  assert.strictEqual(VR.defaut('parking.qPlace'), 600);
  assert.ok(VR.surchargee('parking.qPlace'));
  assert.match(VR.texte('parking.qPlace'), /500 m³\/h \(défaut 600 m³\/h : Arrêté du 31\/01\/1986/);
});

test('sans surcharge, aucun résultat ne change et rien n\'est signalé', () => {
  const r = N.calculer('parking', N.defauts('parking'));
  assert.strictEqual(r.valeurs.QGV, 60000);
  assert.deepStrictEqual(r.tableaux[0].lignes.map(l => l.slice(1)), [['20,0 ppm', '50,0 ppm', '100,0 ppm'], ['0,5 ppm', '1,0 ppm', '1,0 ppm']]);
  ['parking', 'piscine', 'confort', 'airNeuf', 'drv', 'fluides', 'legionelle', 'chaufferie'].forEach(t => assert.ok(!signale(N.calculer(t, N.defauts(t))), t));
  assert.strictEqual(N.calculer('confort', N.defauts('confort')).valeurs.chute, N.calculer('confort', { ...N.defauts('confort'), cKoestel: 0.42 }).valeurs.chute);
  assert.strictEqual(N.calculer('piscine', N.defauts('piscine')).valeurs.Qhyg, 60 * 22);
  assert.match(N.calculer('chaufferie', N.defauts('chaufferie')).synthese, /chaufferie · ICPE NC/);
});

test('parking : débit par véhicule et seuils des Réglages pour les champs vides, signalés dans la note', () => {
  VR.utiliser({ 'parking.qPlace': 500, 'parking.coAl': 90 });
  const r = N.calculer('parking', N.defauts('parking'));
  assert.strictEqual(r.valeurs.QGV, 50000);
  assert.strictEqual(r.tableaux[0].lignes[0][3], '90,0 ppm');
  assert.ok(signale(r));
  assert.ok(r.hypotheses.some(h => /Débit d'extraction par véhicule .*= 500 m³\/h \(défaut 600/.test(h)));
  // Valeur saisie dans le calcul : la surcharge ne sert pas et n'est pas signalée
  const r2 = N.calculer('parking', { ...N.defauts('parking'), qPlace: 600, coAl: 100 });
  assert.strictEqual(r2.valeurs.QGV, 60000);
  assert.ok(!signale(r2));
});

test('fluides : PRP et seuils F-gaz des Réglages, DRV et registre F-gaz', () => {
  const e = { equipements: [{ rep: 'UE1', fluide: 'R32', charge: 10, hermetique: 'non', detection: 'non' }] };
  assert.strictEqual(Math.round(N.calculer('fluides', e).valeurs.tCO2e * 100) / 100, 6.75);
  VR.utiliser({ 'fluide.R32.ar4': 700, 'fgaz.seuil1': 7 });
  const r = N.calculer('fluides', e);
  assert.strictEqual(r.valeurs.tCO2e, 7);
  assert.strictEqual(r.valeurs.equipements[0].mois, 12);
  assert.ok(signale(r));
  assert.ok(r.hypotheses.some(h => /R32 : PRP AR4 = 700/.test(h)));
  assert.strictEqual(F.controleFgaz(6.9, F.FLUIDES.R32).mois, 0);
  const d = N.calculer('drv', { ...N.defauts('drv'), fluide: 'R32', chargeUsine: 10, liquide: [] });
  assert.strictEqual(d.valeurs.tCO2e, 7);
  assert.ok(signale(d));
  // Autre fluide : la surcharge du R32 ne le concerne pas
  assert.ok(!signale(N.calculer('drv', { ...N.defauts('drv'), fluide: 'R410A' })));
});

test('légionelle, chaufferie, air neuf, puits canadien : valeurs des Réglages', () => {
  const base = { ...N.defauts('legionelle'), Tret: 52 };
  assert.ok(!N.calculer('legionelle', base).alertes.some(a => a.niveau === 'erreur' && /Retour de boucle/.test(a.texte)));
  VR.utiliser({ 'legionelle.Tret': 53 });
  const l = N.calculer('legionelle', base);
  assert.ok(l.alertes.some(a => a.niveau === 'erreur' && /au moins 53 °C/.test(a.texte)));
  assert.ok(signale(l));
  VR.utiliser({ 'chaufferie.seuil': 400 });
  assert.match(N.calculer('chaufferie', N.defauts('chaufferie')).synthese, /^300 kW · Gaz naturel · (?!chaufferie)/);
  VR.utiliser({ 'rsdt.wc': 35, 'airNeuf.ct.bureau': 30 });
  const a = N.calculer('airNeuf', { locaux: [{ nom: 'WC', usage: 'wc', N: 1 }, { nom: 'Bureau', usage: 'bureau', S: 20, occ: 2 }] });
  assert.deepStrictEqual([a.valeurs.Qe, a.valeurs.Qs], [35, 60]);
  assert.ok(signale(a));
  // Puits canadien : température du sol proposée depuis le climat de l'étude, valeur des Réglages signalée
  const L = require('../etudes/public/js/liens');
  VR.utiliser({ 'sol.lyon': 13 });
  const n = { id: 'p', type: 'puitsCanadien', titre: 'Puits', entrees: N.defauts('puitsCanadien') }, et = { notes: [n], climat: 'lyon' };
  const r = L.resoudre(et, n);
  assert.strictEqual(r.entrees.Tm, 13);
  assert.ok(r.alertes.some(x => /sol modifiée dans les Réglages/.test(x.texte)));
});
