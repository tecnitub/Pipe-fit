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

test('réseaux du DPGF : chapitres reconnus, nature, longueurs, équipements rattachés, un circuit par réseau', () => {
  const rows = [['N°', 'Désignation', 'U', 'Qté'],
    ['3', 'PRODUCTION DE CHALEUR', '', ''], ['3.1', 'Chaudière gaz à condensation 150 kW', 'u', 2],
    ['4', 'DISTRIBUTION', '', ''],
    ['4.1', 'Réseau radiateurs bâtiment A (70/50 °C)', '', ''], ['4.1.1', 'Tube acier noir DN 40', 'ml', 120], ['4.1.2', 'Tube acier noir DN 25', 'ml', 80],
    ['4.1.3', 'Robinetterie', '', ''], ['4.1.4', 'Radiateurs acier 1,2 kW', 'u', 24], ['4.1.5', 'Circulateur double', 'u', 1],
    ['4.2', 'Circuit plancher chauffant vestiaires', '', ''], ['4.2.1', 'Tube PER 16', 'ml', 300], ['4.2.2', 'Plancher chauffant 30 kW', 'ens', 1],
    ['4.3', 'Réseau eau glacée CTA', '', ''], ['4.3.1', 'Tube acier DN 50', 'ml', 60], ['4.3.2', 'Centrale de traitement d\'air 6000 m3/h', 'u', 1],
    ['5', 'VENTILATION', '', ''], ['5.1', 'Gaines de soufflage', '', ''], ['5.1.1', 'Gaine galvanisée Ø 400', 'ml', 40], ['5.1.2', 'Diffuseurs plafond 300 m3/h', 'u', 10],
    ['5.2', 'Réseau de reprise', '', ''], ['5.2.1', 'Grilles 250 m3/h', 'u', 8],
    ['6', 'PLOMBERIE', '', ''], ['6.1', 'Réseau eau froide sanitaire', '', ''], ['6.1.1', 'Tube cuivre 22', 'ml', 50], ['6.1.2', 'Ballon d\'eau chaude 300 L', 'u', 1]];
  const { items, reseaux } = I.depuisDpgf(rows);
  const r = n => reseaux.find(x => x.nom.startsWith(n));
  assert.deepStrictEqual(reseaux.map(x => [x.nom.slice(0, 22), x.nature, x.L]), [
    ['Réseau radiateurs bâti', 'chauffage', 200], ['Circuit plancher chauf', 'chauffage', 300], ['Réseau eau glacée CTA', 'eau-glacee', 60],
    ['Gaines de soufflage', 'soufflage', 40], ['Réseau de reprise', 'reprise', 0], ['Réseau eau froide sani', 'plomberie', 50]]);
  assert.strictEqual(r('Réseau radiateurs').dnMax, 40); assert.strictEqual(r('Réseau radiateurs').regime, '70/50');
  // « Robinetterie » (sous-titre) ne referme pas le réseau : radiateurs et circulateur y restent
  const rad = items.find(x => x.genre === 'radiateurs'), pompe = items.find(x => x.genre === 'pompe');
  assert.strictEqual(rad.reseau, r('Réseau radiateurs').id); assert.strictEqual(pompe.reseau, r('Réseau radiateurs').id);
  assert.strictEqual(items.find(x => x.genre === 'chaudiere-cond').reseau, '', 'production : hors réseau');
  // Grilles sans précision sous le réseau de reprise : bouches de reprise
  assert.strictEqual(items.find(x => /^Grilles/.test(x.designation)).genre, 'bouche-extraction');
  // Schéma : un circuit par réseau du fluide de la production (chauffage), puissance cumulée, longueur du DPGF
  const Sc = require('../etudes/public/js/schema');
  const inv = I.fusionner([], items), { entrees, alertes } = I.versSchema(inv, Sc, reseaux);
  const circ = entrees.circuits.map(c => [c.rep.slice(0, 22), c.emetteur, c.P, c.L]);
  assert.deepStrictEqual(circ.slice(0, 2), [['Réseau radiateurs bâti', 'radiateurs', 28.8, 200], ['Circuit plancher chauf', 'plancher', 30, 300]]);
  assert.ok(!circ.some(c => /eau glacée/i.test(c[0])), 'réseau d\'eau glacée : autre fluide');
  assert.ok(alertes.some(a => /Réseau eau glacée CTA.*second schéma/.test(a)));
  assert.ok(circ.some(c => c[1] === 'ecs'), 'ballon d\'ECS de la plomberie : circuit à part');
  // Schéma aéraulique : diffuseurs au soufflage, grilles à la reprise
  const air = I.versSchemaAir(inv, reseaux).entrees;
  assert.deepStrictEqual(air.zones.map(z => [z.reseau, z.n]), [['soufflage', 10], ['reprise', 8]]);
});

test('réseaux du CCTP : article de réseau, équipements des articles enfants, réunis avec le DPGF', () => {
  const CL = require('../public/js/cctp-lecture');
  const lignes = ['CAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES', 'LOT 12 CHAUFFAGE',
    '4.2 Réseau de chauffage radiateurs', 'Le réseau distribue l\'eau chaude au régime 70/50 °C vers les radiateurs du bâtiment A.',
    '4.2.1 Radiateurs', 'Radiateurs acier panneaux, marque X ou équivalent, 24 unités.',
    '4.3 Réseau eau glacée', 'Distribution d\'eau glacée 7/12 °C vers la CTA.', '4.3.1 Centrale de traitement d\'air', 'CTA double flux 6000 m3/h.'];
  const a = CL.analyser(lignes), rc = I.reseauxCctp(a), eq = I.depuisCctp(a.equipements, rc);
  assert.deepStrictEqual(rc.map(r => [r.article, r.nature, r.regime]), [['4.2', 'chauffage', '70/50'], ['4.3', 'eau-glacee', '7/12']]);
  assert.strictEqual(eq.find(x => x.genre === 'radiateurs').reseau, rc[0].id);
  assert.strictEqual(eq.find(x => x.genre === 'cta').reseau, rc[1].id);
  // Même réseau au DPGF (nom ressemblant) : réuni, la longueur vient du DPGF
  const d = I.depuisDpgf([['Désignation', 'Qté', 'U'], ['Réseau de chauffage radiateurs bât. A', '', ''], ['Tube acier DN 32', 90, 'ml'], ['Radiateurs acier 1 kW', 24, 'u']]);
  const inv = I.fusionner(eq, d.items), res = I.fusionnerReseaux(rc, d.reseaux, inv);
  assert.strictEqual(res.length, 2);
  assert.strictEqual(res[0].L, 90);
  assert.ok(inv.filter(x => x.genre === 'radiateurs').every(x => x.reseau === rc[0].id));
});
