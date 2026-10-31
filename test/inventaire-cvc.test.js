// Inventaire CVC d'un dossier de consultation (CCTP + DPGF) : producteurs, émetteurs, auxiliaires ; rapprochement ;
// préremplissage du schéma de principe et de l'alimentation électrique d'une étude.
const { test } = require('node:test');
const assert = require('node:assert');
const CL = require('../public/js/cctp-lecture');
const I = require('../public/js/inventaire-cvc');
const Sc = require('../etudes/public/js/schema');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/electricite');

const CCTP = [
  'GROUPE SCOLAIRE – RÉNOVATION', 'CAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES', 'LOT N° 12 – CHAUFFAGE VENTILATION',
  '3.1 Chaudières gaz à condensation', 'Deux chaudières repères CH-01 et CH-02 de marque Viessmann type Vitocrossal 200 ou équivalent.', 'Puissance unitaire : 150 kW. Régime 70/50 °C.',
  '3.2 Centrales de traitement d\'air', 'La centrale CTA-01 assure le traitement du réfectoire.', 'Batterie chaude : 40 kW, débit 6 000 m3/h.',
  '3.3 Circulateurs', 'Circulateurs à vitesse variable, quantité : 3.',
  '3.4 Radiateurs', 'Radiateurs acier, 45 unités, robinets thermostatiques.',
  '3.5 Aérothermes', 'Aérothermes de 12 kW pour le préau, quantité : 2.',
  '4.2 Essais et mise en service', 'Essais de pression des réseaux, équilibrage.',
];
const DPGF = [
  ['DPGF – Lot 12'], [],
  ['N°', 'Désignation', 'U', 'Qté', 'PU HT', 'Montant HT'],
  ['3.1', 'Chaudière gaz à condensation 150 kW', 'u', '2', '', ''],
  ['3.2', 'CTA double flux réfectoire', 'u', '1', '', ''],
  ['3.4', 'Radiateurs acier', 'u', '48', '', ''],
  ['3.6', 'Ventilo-convecteurs bureaux 2 kW', 'u', '6', '', ''],
  ['3.7', 'Vanne 3 voies motorisée DN40', 'u', '2', '', ''],
  ['5.1', 'Tuyauteries acier noir DN50', 'ml', '120', '', ''],
  ['', 'Sous-total', '', '', '', ''],
];

test('classement : producteurs, émetteurs, auxiliaires ; lignes de travaux écartées', () => {
  assert.deepStrictEqual(I.classer('Pompe à chaleur air/eau réversible 80 kW'), { categorie: 'producteur', genre: 'pac-rev' });
  assert.deepStrictEqual(I.classer('Pompe à chaleur air / eau'), { categorie: 'producteur', genre: 'pac-air' });
  assert.deepStrictEqual(I.classer('Circulateur double'), { categorie: 'auxiliaire', genre: 'pompe' });
  assert.deepStrictEqual(I.classer('Chaudière fioul'), { categorie: 'producteur', genre: 'chaudiere-fioul' });
  assert.deepStrictEqual(I.classer('Ballon d\'eau chaude sanitaire 500 L'), { categorie: 'emetteur', genre: 'ecs' });
  assert.strictEqual(I.classer('Tuyauteries de raccordement des radiateurs'), null);
  assert.strictEqual(I.classer('Essais de la pompe à chaleur'), null);
  assert.strictEqual(I.puissance('Batterie chaude : 40 kW'), 40);
  assert.strictEqual(I.regime('Régime 45/35 °C'), '45/35');
});

test('CCTP et DPGF rapprochés : quantité du DPGF, repère et prescription du CCTP', () => {
  const cctp = I.depuisCctp(CL.analyser(CCTP).equipements), dpgf = I.depuisDpgf(DPGF);
  assert.ok(!dpgf.erreur);
  assert.deepStrictEqual(dpgf.items.map(x => x.genre), ['chaudiere-cond', 'cta', 'radiateurs', 'ventilo', 'vanne3v']); // tuyauteries et sous-total écartés
  const inv = I.fusionner(cctp, dpgf.items);
  const rad = inv.filter(x => x.genre === 'radiateurs');
  assert.strictEqual(rad.length, 1);
  assert.strictEqual(rad[0].qte, 48, 'quantité du DPGF');
  assert.deepStrictEqual(rad[0].sources, ['CCTP art. 3.4', 'DPGF 3.4']);
  const ch = inv.filter(x => x.genre === 'chaudiere-cond');
  assert.deepStrictEqual(ch.map(x => x.repere), ['CH-01', 'CH-02']);
  assert.ok(ch.every(x => x.P === 150 && /Viessmann/.test(x.prescrit)));
  assert.ok(inv.some(x => x.genre === 'ventilo' && x.qte === 6 && x.sources[0] === 'DPGF 3.6'), 'ligne du DPGF seule gardée');
  assert.ok(inv.some(x => x.genre === 'aerotherme' && x.qte === 2 && x.P === 12));
});

test('schéma de principe prérempli : générateurs en cascade, régime, un circuit par émetteur', () => {
  const inv = I.fusionner(I.depuisCctp(CL.analyser(CCTP).equipements), I.depuisDpgf(DPGF).items);
  const { entrees, alertes } = I.versSchema(inv, Sc);
  assert.deepStrictEqual([entrees.generateur, entrees.nGen, entrees.Pgen, entrees.reseau], ['chaudiere-cond', '2', 150, 'ch-70-50']);
  assert.deepStrictEqual(entrees.circuits.map(c => [c.emetteur, c.P]), [['cta', 40], ['radiateurs', ''], ['aerotherme', 24], ['ventilo', 12]]);
  assert.ok(alertes.some(a => /^Radiateurs : puissance non trouvée/.test(a)));
  // Le schéma se calcule avec ces entrées (puissance des radiateurs à saisir : valeur par défaut)
  const r = N.calculer('pid', { ...N.defauts('pid'), ...entrees, circuits: entrees.circuits.map(c => ({ ...c, P: c.P || 50 })) });
  assert.ok(!r.alertes.some(a => a.niveau === 'erreur'), r.alertes.map(a => a.texte).join(' | '));
  assert.match(r.schema, /^<svg/);
});

test('alimentation électrique préremplie : producteurs, CTA, ventilo-convecteurs, pompes, vannes', () => {
  const inv = I.fusionner(I.depuisCctp(CL.analyser(CCTP).equipements), I.depuisDpgf(DPGF).items);
  const l = I.versElec(inv);
  assert.deepStrictEqual(l.filter(x => x.type === 'generateur').map(x => x.rep), ['CH-01', 'CH-02']);
  assert.strictEqual(l.filter(x => x.type === 'ventilo').length, 6);
  assert.strictEqual(l.filter(x => x.type === 'pompe').length, 3);
  assert.ok(l.filter(x => x.type === 'vanne').every(x => x.tension === '24V'));
  assert.ok(!l.some(x => /radiateur/i.test(x.designation)), 'pas d\'alimentation pour les radiateurs');
  const r = N.calculer('elec', { ...N.defauts('elec'), equipements: l });
  assert.ok(!r.alertes.some(a => a.niveau === 'erreur'), r.alertes.map(a => a.texte).join(' | '));
});

test('DPGF en PDF : lignes « n° désignation unité quantité »', () => {
  const r = I.depuisDpgfTexte(['3.1 Chaudière gaz à condensation 150 kW u 2 0,00', '3.4 Radiateurs acier U 48', '5.1 Tuyauteries acier noir DN50 ml 120', 'Sous-total']);
  assert.deepStrictEqual(r.items.map(x => [x.genre, x.qte, x.sources[0]]), [['chaudiere-cond', 2, 'DPGF 3.1'], ['radiateurs', 48, 'DPGF 3.4']]);
});
