// Plomberie sanitaire : foisonnement, diamètres, point le plus défavorisé, bouclage d'ECS, pompe de bouclage, fiches
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/industriel');
const T = require('../etudes/public/js/terminaux');
global.Terminaux = T;
const San = require('../etudes/public/js/sanitaire');
global.Sanitaire = San;
const E = require('../etudes/public/js/electricite');
const Liens = require('../etudes/public/js/liens');

const base = () => ({ ...N.defauts('sanitaire') });

test('sanitaire : foisonnement DTU, saisi, aucun', () => {
  const e = base();
  const dtu = N.calculer('sanitaire', e).valeurs, brut = N.calculer('sanitaire', { ...e, foisonnement: 'aucun' }).valeurs, sai = N.calculer('sanitaire', { ...e, foisonnement: 'saisi', coefSaisi: 50 }).valeurs;
  // 4 appareils en EF : 0,2 + 0,12 + 0,2 + 0,2 = 0,72 L/s ; y = 0,8/√3
  assert.ok(Math.abs(brut.totEF - 0.72) < 1e-9);
  assert.ok(Math.abs(dtu.totEF - 0.72 * 0.8 / Math.sqrt(3)) < 1e-9);
  assert.ok(Math.abs(sai.totEF - 0.36) < 1e-9);
  // ECS : lavabo, douche, évier (le WC n'a pas d'ECS)
  assert.ok(Math.abs(brut.totC - 0.6) < 1e-9);
  assert.doesNotThrow(() => JSON.stringify(dtu));
});

test('sanitaire : diamètres sous la vitesse maxi, point le plus défavorisé à l\'étage le plus haut', () => {
  const e = base();
  e.points = [...e.points, { rep: 'LV-RDC', salle: 'Accueil', etage: 'RDC', type: 'lavabo', troncon: 'C' }, { rep: 'DO-R3', salle: 'Logement', etage: 'R+3', type: 'douche', troncon: 'R1.1' }];
  const r = N.calculer('sanitaire', e);
  assert.strictEqual(r.valeurs.pireEF, 'DO-R3');
  r.tableaux[1].lignes.forEach(l => assert.ok(Number(l[7].replace(',', '.')) <= 1.5, l.join(' | ')));
  assert.match(r.tableaux[0].lignes.find(l => /DO-R3/.test(l[0]))[0], /★/);
  // Pression insuffisante → alerte surpresseur
  const r2 = N.calculer('sanitaire', { ...e, pDispo: 1 });
  assert.ok(r2.alertes.some(a => a.niveau === 'erreur' && /surpresseur/.test(a.texte)));
});

test('sanitaire : bouclage d\'ECS, pompe et températures', () => {
  const r = N.calculer('sanitaire', base()), B = r.valeurs.bouclage;
  assert.ok(B && B.Pperte > 0 && B.Qb > 0 && B.H > 0 && B.Pel > 0);
  // Tronçons avec aval bouclés : C et R1 ; R1.1 terminal non bouclé
  const ecs = r.tableaux[2].lignes;
  assert.match(ecs.find(l => l[0] === 'C')[10], /^oui/);
  assert.strictEqual(ecs.find(l => l[0] === 'R1.1')[10], 'non');
  const froid = N.calculer('sanitaire', { ...base(), TdepB: 50, TretB: 45 });
  assert.ok(froid.alertes.filter(a => a.niveau === 'erreur' && /Bouclage/.test(a.texte)).length === 2);
  assert.strictEqual(N.calculer('sanitaire', { ...base(), bouclage: 'non' }).valeurs.bouclage, null);
});

test('sanitaire : débit de fiche prioritaire, lecture de fiche', () => {
  const e = base(); e.points[0].qEF = 0.1; e.points[0].qECS = 0.1;
  const v = N.calculer('sanitaire', { ...e, foisonnement: 'aucun' }).valeurs;
  assert.ok(Math.abs(v.totEF - 0.62) < 1e-9);
  const f = San.lireFichePoint(['Mitigeur lavabo', 'Débit : 6 l/min à 3 bar', 'Pression minimale : 1,5 bar']);
  assert.strictEqual(f.valeurs.q, 0.1);
  assert.strictEqual(f.valeurs.pMin, 1.5);
});

test('sanitaire : pompe de bouclage au bilan électrique, fiches de l\'installation', () => {
  const ecs = { id: 'e1', type: 'ecs', titre: 'Ballon', entrees: N.defauts('ecs') };
  const s = { id: 's1', type: 'sanitaire', titre: 'Plomberie', entrees: { ...base(), production: 'e1', alimBouclage: 'cvc' } };
  const et = { id: 'x', notes: [ecs, s] };
  const lignes = E.equipementsEtude(et, Liens);
  const pb = lignes.find(l => l.rep === 'PB-ECS');
  assert.ok(pb && pb.type === 'pompe' && pb.P > 0 && pb.alim === 'cvc');
  assert.ok(lignes.some(l => l.rep === 'TRB'));
  const f = Liens.fichesInstallation(et, s);
  assert.strictEqual(f[0].nature, 'Production d\'ECS (ballon)');
  assert.strictEqual(f.filter(x => x.point !== undefined).length, 4);
});
