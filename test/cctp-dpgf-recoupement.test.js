// Recoupement CCTP ↔ DPGF (rapprochement par numéro, désignation, chapitre ; source et confiance de chaque valeur ; conflits),
// remplissage des calculs depuis l'inventaire (générateurs hétérogènes et rôles, montages, ballons, pompes intégrées,
// récupération, sous-station, CTA, terminaux, régulation) et guide « Reste à faire » de l'étude.
// Jeux d'essai fictifs construits ici (aucun document réel).
const { test } = require('node:test');
const assert = require('node:assert');
global.FichesTech = require('../public/js/fiches-tech');
const N = require('../etudes/public/js/notes');
global.Notes = N;
global.Terminaux = require('../etudes/public/js/terminaux');
const Sc = require('../etudes/public/js/schema');
global.Schema = Sc;
global.Pompes = require('../etudes/public/js/pompes');
require('../etudes/public/js/industriel');
require('../etudes/public/js/equilibrage');
global.Sanitaire = require('../etudes/public/js/sanitaire');
global.FicheCta = require('../etudes/public/js/fiche-cta');
global.FicheEquip = require('../etudes/public/js/fiche-equipement');
require('../etudes/public/js/cta');
global.SchemaAir = require('../etudes/public/js/aeraulique-schema');
global.Registre = require('../etudes/public/js/registre');
require('../etudes/public/js/electricite');
const CL = require('../public/js/cctp-lecture');
const I = require('../public/js/inventaire-cvc');
const G = require('../etudes/public/js/guide-etude');

// CCTP fictif : PAC en base + chaudière d'appoint, ballon tampon de découplage, groupe froid à désurchauffeur, circuits
// (vanne 3 voies, injection), ECS, CTA à batteries eau chaude / eau glacée / électrique de préchauffage, cassettes 4 tubes, GTB
const CCTP = [
  'MAISON DE SANTÉ DES TILLEULS (opération fictive)', 'CAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES', 'LOT 05 – CHAUFFAGE VENTILATION CLIMATISATION',
  '2 PRODUCTION DE CHALEUR ET DE FROID',
  '2.1 Pompe à chaleur air / eau',
  'La pompe à chaleur PAC-01 assure la production de chauffage en base. Marque Aerotherm type HP 90 ou équivalent.',
  'Puissance calorifique : 90 kW, COP 3,4. Puissance électrique absorbée : 26 kW. Régime 45/35 °C.',
  'Module hydraulique intégré (circulateur à vitesse variable). Alimentation 400 V triphasé. Implantation : toiture terrasse.',
  '2.2 Chaudière gaz à condensation d\'appoint',
  'Chaudière CH-01 en appoint de la pompe à chaleur, puissance utile 60 kW, rendement 98 %. Kit hydraulique du fabricant.',
  '2.3 Ballon tampon',
  'Ballon tampon de découplage de 800 litres, 4 piquages.',
  '2.4 Groupe de production d\'eau glacée',
  'Groupe froid GF-01, puissance frigorifique 70 kW, EER 3,1, régime 7/12 °C, équipé d\'un désurchauffeur pour la récupération de chaleur sur le groupe.',
  '3 DISTRIBUTION',
  '3.1 Circuit radiateurs',
  'Le circuit radiateurs est régulé par vanne 3 voies mélangeuse.',
  '3.1.1 Radiateurs',
  'Radiateurs acier, puissance 1,2 kW, quantité : 30.',
  '3.2 Circuit plancher chauffant',
  'Plancher chauffant monté en injection, régime 35/30 °C, puissance 25 kW.',
  '3.3 Production d\'eau chaude sanitaire',
  'Ballon d\'eau chaude sanitaire de 300 litres raccordé à la PAC par serpentin, puissance 20 kW.',
  '4 TRAITEMENT D\'AIR',
  '4.1 Centrale de traitement d\'air',
  'CTA-01 double flux, débit 4 000 m3/h, récupérateur rotatif efficacité 80 %, batterie eau chaude 30 kW, batterie froide eau glacée 25 kW, batterie électrique de préchauffage 6 kW. Marque Aircalo ou équivalent.',
  '4.2 Ventilo-convecteurs',
  'Cassettes 4 tubes, puissance froid 3,5 kW, puissance chaud 3 kW, vanne 2 voies, quantité : 8. Local : bureaux de consultation.',
  '5 RÉGULATION',
  '5.1 Régulation et GTB',
  'Automate de marque Siemens, supervision GTB en BACnet/IP, bus Modbus RTU pour les équipements.',
];
// DPGF fictif, même numérotation : puissance de la PAC et quantité de radiateurs différentes, aérothermes non décrits
const DPGF = [
  ['N°', 'Désignation', 'U', 'Qté'],
  ['2', 'PRODUCTION', '', ''],
  ['2.1', 'Pompe à chaleur air/eau 95 kW', 'u', 1],
  ['2.2', 'Chaudière gaz condensation 60 kW', 'u', 1],
  ['2.3', 'Ballon tampon 800 L', 'u', 1],
  ['2.4', 'Groupe froid eau glacée 70 kW', 'u', 1],
  ['3', 'DISTRIBUTION', '', ''],
  ['3.1.1', 'Radiateurs acier 1,2 kW', 'u', 32],
  ['3.2', 'Plancher chauffant', 'ens', 1],
  ['3.3', 'Ballon ECS 300 L', 'u', 1],
  ['4', 'TRAITEMENT D\'AIR', '', ''],
  ['4.1', 'CTA double flux 4000 m3/h', 'u', 1],
  ['4.2', 'Cassettes 4 tubes', 'u', 8],
  ['4.3', 'Aérothermes atelier 10 kW', 'u', 2],
];
// Lecture complète, comme l'écran d'import : CCTP, DPGF, réseaux réunis, rattachement
function lire(cctp = CCTP, dpgf = DPGF) {
  const a = CL.analyser(cctp), rc = I.reseauxCctp(a), d = I.depuisDpgf(dpgf);
  const inv = I.fusionner(I.depuisCctp(a.equipements, rc, a.articlesDetail), d.items);
  const reseaux = I.fusionnerReseaux(rc, d.reseaux, inv);
  I.rattacher(inv, reseaux);
  return { inv, reseaux };
}
const par = (inv, g) => inv.find(x => x.genre === g);

test('recoupement : rapprochement par numéro d\'article, valeurs complétées des deux documents avec leur source', () => {
  const { inv } = lire(), pac = par(inv, 'pac-air'), ch = par(inv, 'chaudiere-cond'), cta = par(inv, 'cta');
  assert.strictEqual(pac.rapprochement, 'numero');
  assert.deepStrictEqual(pac.sources, ['CCTP art. 2.1', 'DPGF 2.1']);
  // Valeurs du CCTP seul : source citée, confiance moyenne
  assert.deepStrictEqual(pac.champs.Pel, { v: 26, source: 'CCTP art. 2.1', confiance: 'moyenne' });
  assert.deepStrictEqual([pac.champs.COP.v, pac.champs.regime.v, pac.champs.tension.v, pac.champs.reference.v, pac.champs.local.v, pac.champs.pompe.v, pac.champs.role.v], [3.4, '45/35', '400 V', 'HP 90', 'toiture terrasse', 'integree', 'base']);
  assert.strictEqual(pac.local, 'toiture terrasse');
  assert.ok(pac.details.equivalent, '« ou équivalent » relevé');
  // Même valeur dans les deux documents : confiance haute, deux sources
  assert.deepStrictEqual(ch.champs.P, { v: 60, source: 'CCTP art. 2.2 · DPGF ligne 2.2', confiance: 'haute' });
  assert.deepStrictEqual([cta.champs.Q.v, cta.champs.Q.confiance], [4000, 'haute']);
  // CTA : batteries, batterie électrique, récupérateur, efficacité, marque
  assert.deepStrictEqual(cta.details.batteries, { chaude: true, froide: true, elec: 'prechauffage' });
  assert.deepStrictEqual([cta.details.PelBe, cta.details.recuperateur, cta.champs.rendement.v, cta.champs.marque.v, cta.repere], [6, 'roue', 80, 'Aircalo', 'CTA-01']);
  // Ballon tampon : « tampon » au DPGF et « tampon de découplage » au CCTP ne se contredisent pas ; volume dans les deux
  const bt = par(inv, 'tampon');
  assert.deepStrictEqual([bt.champs.ballon.v, bt.champs.ballon.confiance, bt.champs.volume.confiance], ['decouplage', 'haute', 'haute']);
  // Ligne du DPGF sans article : gardée, source DPGF seule
  const at = par(inv, 'aerotherme');
  assert.deepStrictEqual([at.rapprochement, at.qte, at.champs.P.source], ['dpgf', 2, 'DPGF ligne 4.3']);
  // Régulation : article du CCTP sans équipement, marque et protocoles lus
  assert.deepStrictEqual(par(inv, 'regulation').details.regulation, { marque: 'siemens', gtb: 'BACnet/IP', bus: 'Modbus RTU', techno: 'automate' });
  // Cassettes : 4 tubes, vanne 2 voies, local
  const vc = par(inv, 'ventilo');
  assert.deepStrictEqual([vc.details.tubes, vc.details.montage, vc.local, vc.champs.qte.confiance], ['4t', '2v', 'bureaux de consultation', 'haute']);
});

test('recoupement : conflits signalés (valeur, quantité) avec les deux sources, confiance faible, écarts enrichis', () => {
  const { inv } = lire(), pac = par(inv, 'pac-air'), rad = par(inv, 'radiateurs');
  // Puissance : le CCTP (prescription) est gardé, la valeur du DPGF est notée
  assert.deepStrictEqual(pac.champs.P, { v: 90, source: 'CCTP art. 2.1', confiance: 'faible', autre: { v: 95, source: 'DPGF ligne 2.1' } });
  assert.deepStrictEqual(pac.conflits.map(c => [c.champ, c.cctp, c.dpgf]), [['P', 90, 95]]);
  // Quantité : le DPGF (chiffré) est gardé
  assert.deepStrictEqual([rad.qte, rad.champs.qte.v, rad.champs.qte.autre.v], [32, 32, 30]);
  const e = I.ecarts(inv);
  assert.deepStrictEqual(e.map(x => [x.type, x.designation]), [['valeur', 'Pompe à chaleur air / eau'], ['quantite', 'Radiateurs']]);
  assert.strictEqual(e[0].texte, 'Puissance chaud : 90 kW au CCTP (art. 2.1), 95 kW au DPGF (ligne 2.1).');
  assert.strictEqual(I.LIB_ECART.valeur, 'Valeur différente');
  // Valeurs à vérifier : conflits et valeurs d'un seul document peu sûres (puissance sans qualificatif)
  assert.deepStrictEqual(I.aVerifier(pac).map(v => v.texte), ['90 kW (CCTP art. 2.1) ≠ 95 kW (DPGF ligne 2.1)']);
  assert.deepStrictEqual(I.aVerifier(par(inv, 'aerotherme')).map(v => [v.libelle, v.texte]), [['Puissance chaud', '10 kW (DPGF ligne 4.3)']]);
});

test('recoupement sans numérotation commune : par la désignation, sinon par le chapitre du DPGF', () => {
  const cctp = ['CAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES', 'LOT 12 CVC',
    '6.1 Ventilo-convecteurs du bâtiment administratif', 'Cassettes 2 tubes, puissance chaud 2,5 kW, vanne 2 voies, quantité : 6.',
    '6.2 Ventilo-convecteurs de la salle polyvalente', 'Cassettes 2 tubes, puissance chaud 4 kW, vanne 3 voies, quantité : 4.',
    '6.3 Aérothermes', 'Aérothermes eau chaude 12 kW, quantité : 2.'];
  const dpgf = [['N°', 'Désignation', 'U', 'Qté'],
    ['B1', 'BÂTIMENT ADMINISTRATIF', '', ''], ['B1.1', 'Cassettes 2 tubes 2,5 kW', 'u', 6],
    ['B2', 'SALLE POLYVALENTE', '', ''], ['B2.1', 'Cassettes 2 tubes 4 kW', 'u', 5],
    ['C1', 'Aérothermes atelier', 'u', 2]];
  const { inv } = lire(cctp, dpgf), vc = inv.filter(x => x.genre === 'ventilo');
  assert.deepStrictEqual(vc.map(x => [x.rapprochement, x.sources.join(' + '), x.qte]), [
    ['chapitre', 'CCTP art. 6.1 + DPGF B1.1', 6], ['chapitre', 'CCTP art. 6.2 + DPGF B2.1', 5]]);
  // Rapprochement par le chapitre : une valeur d'un seul document y est moins sûre ; quantités différentes signalées
  assert.strictEqual(vc[1].champs.qte.confiance, 'faible');
  assert.deepStrictEqual(vc.map(x => x.details.montage), ['2v', '3v']);
  const at = par(inv, 'aerotherme');
  assert.deepStrictEqual([at.rapprochement, at.sources], ['designation', ['CCTP art. 6.3', 'DPGF C1']]);
  assert.deepStrictEqual(I.ecarts(inv).map(x => x.type), ['quantite']);
});

test('détails lus dans le texte : montages, pompe intégrée, récupération, découplage, sous-station, rôle', () => {
  const D = I.details;
  assert.strictEqual(D('Circuit monté en injection par vanne 2 voies avec by-pass').montage, 'injection2');
  assert.strictEqual(D('Circuit en injection, pompe primaire et secondaire').montage, 'injection3');
  assert.strictEqual(D('Montage en décharge sur le collecteur').montage, 'decharge');
  assert.strictEqual(D('Bouteille de découplage du circuit').montage, 'bouteille');
  assert.strictEqual(D('Échangeur de circuit à plaques').montage, 'echangeur');
  assert.strictEqual(D('Régulation par vanne deux voies motorisée').montage, '2v');
  assert.strictEqual(D('Vanne 3 voies mélangeuse').montage, '3v');
  assert.strictEqual(D('Groupe livré avec kit hydraulique').pompe, 'integree');
  assert.strictEqual(D('PAC sans module hydraulique, pompes déportées').pompe, 'deportee');
  assert.strictEqual(D('Thermofrigopompe eau/eau').recup, 'totale');
  assert.strictEqual(D('Désurchauffeur sur le groupe froid').recup, 'desurchauffeur');
  assert.strictEqual(D('Bouteille de découplage entre production et distribution').decouplage, 'oui');
  assert.strictEqual(D('Échangeur à plaques de séparation').decouplage, 'echangeur');
  assert.deepStrictEqual([D('Sous-station du réseau de chaleur, primaire 90/70 °C').sousStation, D('Sous-station, primaire 90/70 °C').regimePrim], [true, '90/70']);
  assert.strictEqual(D('Une chaudière assure le secours.', 'Chaudière de secours').role, 'secours');
  assert.strictEqual(D('La PAC est complétée par une chaudière d\'appoint.', 'Pompe à chaleur').role, undefined, 'l\'appoint d\'un autre équipement n\'est pas le rôle de la PAC');
  assert.deepStrictEqual(D('Batterie change-over et batterie électrique d\'appoint 9 kW').batteries, { co: true, elec: 'appoint' });
  assert.strictEqual(D('batterie électrique d\'appoint 9 kW').PelBe, 9);
  assert.strictEqual(D('Stockage d\'énergie de 2000 litres').ballon, 'stockage');
  assert.deepStrictEqual(I.classer('Thermofrigopompe 120 kW'), { categorie: 'producteur', genre: 'pac-eau' });
});

test('schéma de principe : générateurs hétérogènes et rôles, pompes intégrées, découplage par ballon, montages, ECS', () => {
  const { inv, reseaux } = lire(), { entrees, alertes } = I.versSchema(inv, Sc, reseaux);
  assert.deepStrictEqual(entrees.generateurs.map(g => [g.rep, g.type, g.P, g.role, g.pompe]), [
    ['PAC-01', 'pac-air', 90, 'base', 'integree'], ['CH-01', 'chaudiere-cond', 60, 'appoint', 'integree'],
    // Groupe froid à désurchauffeur : 15 % de la chaleur rejetée (70 × (1 + 1/3,1))
    ['GF-01', 'gf-air', 13.9, 'recuperation', '']]);
  assert.deepStrictEqual([entrees.generateur, entrees.reseau, entrees.bouteille, entrees.Vtampon], ['pac-air', 'ch-45-35', 'ballon', 800]);
  assert.ok(alertes.some(a => /^Production hétérogène : 3 générateur/.test(a)));
  assert.ok(!alertes.some(a => /Plusieurs types de producteurs/.test(a)));
  const c = Object.fromEntries(entrees.circuits.map(x => [x.emetteur, x]));
  assert.deepStrictEqual([c.radiateurs.regulation, c.radiateurs.P], ['3v', 38.4], 'radiateurs : vanne 3 voies du circuit, 32 × 1,2 kW');
  assert.deepStrictEqual([c.plancher.regulation, c.plancher.P, c.plancher.regime], ['injection3', 25, '35/30'], 'plancher : injection, puissance de l\'article du circuit');
  assert.deepStrictEqual([c.ecs.regulation, c.cta.P, c.ventilo.regulation, c.ventilo.P], ['direct', 30, '2v', 24]);
  // Ballon d'ECS sur son circuit
  assert.deepStrictEqual(entrees.ballons, [{ rep: '', fonction: 'ecs', V: 300, position: `circuit:${c.ecs.rep}`, piquages: '', sondes: '' }]);
  const r = N.calculer('pid', { ...N.defauts('pid'), ...entrees });
  assert.ok(!r.alertes.some(a => a.niveau === 'erreur'), r.alertes.map(a => a.texte).join(' | '));
  assert.match(r.schema, /^<svg/);
});

test('schéma de principe : groupe froid à récupération, sous-station de réseau de chaleur, ballon tampon et de stockage', () => {
  const gf = [{ categorie: 'producteur', genre: 'gf-air', designation: 'Groupe froid', qte: 1, P: '', Pfr: 200, regime: '7/12', carac: { EER: 3 }, details: { recup: 'totale', pompe: 'integree' }, sources: ['CCTP art. 1'], inclus: true },
    { categorie: 'emetteur', genre: 'ventilo', designation: 'Ventilo-convecteurs', qte: 20, P: '', Pfr: 4, details: { montage: '2v' }, sources: ['DPGF 2'], inclus: true },
    { categorie: 'auxiliaire', genre: 'tampon', designation: 'Ballon tampon', qte: 1, carac: { volume: 1000 }, details: { ballon: 'tampon' }, sources: ['DPGF 3'], inclus: true }];
  const a = I.versSchema(gf, Sc).entrees;
  assert.deepStrictEqual([a.generateur, a.reseau, a.recupGf, a.pompeGen, a.generateurs], ['gf-air', 'eg-7-12', 'totale', 'integree', undefined]);
  assert.deepStrictEqual(a.ballons, [{ rep: '', fonction: 'tampon', V: 1000, position: 'production', piquages: '', sondes: '' }]);
  assert.ok(!N.calculer('pid', { ...N.defauts('pid'), ...a }).alertes.some(x => x.niveau === 'erreur'));
  const ss = [{ categorie: 'producteur', genre: 'echangeur', designation: 'Sous-station réseau de chaleur', qte: 1, P: 200, regime: '70/50', details: I.details('Sous-station raccordée au réseau de chaleur urbain, primaire 90/70 °C, échangeur à plaques 200 kW'), sources: ['CCTP art. 2'], inclus: true },
    { categorie: 'emetteur', genre: 'radiateurs', designation: 'Radiateurs', qte: 50, P: 2, details: { montage: 'decharge' }, sources: ['DPGF 3'], inclus: true },
    { categorie: 'auxiliaire', genre: 'tampon', designation: 'Stockage', qte: 1, carac: { volume: 2000 }, details: { ballon: 'stockage' }, sources: ['DPGF 4'], inclus: true }];
  const b = I.versSchema(ss, Sc).entrees;
  assert.deepStrictEqual([b.generateur, b.regimePrim, b.reseau, b.circuits[0].regulation, b.ballons[0].fonction], ['echangeur', '90/70', 'ch-70-50', 'decharge', 'stockage']);
  assert.ok(!N.calculer('pid', { ...N.defauts('pid'), ...b }).alertes.some(x => x.niveau === 'erreur'));
});

test('CTA, terminaux, régulation et alimentation électrique remplis depuis l\'inventaire', () => {
  const { inv, reseaux } = lire();
  const { ctas } = I.versSchemaAir(inv, reseaux);
  assert.strictEqual(ctas.length, 1);
  assert.deepStrictEqual(ctas[0].entrees, { type: 'double', Qs: 4000, Qr: 4000, recup: 'roue', eta: 80, froid: 'oui', batElec: 'prechauffage', modeP: 'saisie', PchaudS: 30, PfroidS: 25, PelBe: 6 });
  assert.match(ctas[0].titre, /^CTA — CTA-01/);
  const rc = N.calculer('cta', { ...N.defauts('cta'), ...ctas[0].entrees });
  assert.ok(!rc.alertes.some(a => a.niveau === 'erreur'), rc.alertes.map(a => a.texte).join(' | '));
  // CTA change-over à batterie électrique d'appoint
  const co = I.versCta({ genre: 'cta', designation: 'CTA salle', Q: 3000, P: 20, Pfr: 15, details: I.details('Batterie change-over et batterie électrique d\'appoint 9 kW'), carac: { tension: '400 V', regimeChaud: '45/40' } });
  assert.deepStrictEqual([co.entrees.froid, co.entrees.batElec, co.entrees.PelBe, co.entrees.tensionCta, co.entrees.TcAller], ['co', 'appoint', 9, 'tri', 45]);
  // Terminaux : cassettes 4 tubes, une ligne par unité, local, puissances, vanne
  const t = I.versTerminaux(inv), cas = t.appareils.filter(x => x.type === 'cassette4');
  assert.strictEqual(cas.length, 8);
  assert.deepStrictEqual(cas[0], { rep: 'CA-01', local: 'bureaux de consultation', zone: '', type: 'cassette4', Pch: 3, Pfr: 3.5, batterie: '4t', vanne: '2v', ref: '' });
  assert.deepStrictEqual([...new Set(t.appareils.map(x => x.type))], ['radiateur', 'cassette4', 'aerotherme']);
  assert.ok(!N.calculer('terminaux', { ...N.defauts('terminaux'), appareils: t.appareils }).alertes.some(a => a.niveau === 'erreur'));
  // Régulation : marque de l'automate, GTB, bus, avec leur source
  assert.deepStrictEqual(I.versRegulation(inv), { entrees: { marqueAutomate: 'siemens', gtb: 'BACnet/IP', busEquip: 'Modbus RTU', techno: 'automate' },
    sources: { marqueAutomate: 'CCTP art. 5.1', gtb: 'CCTP art. 5.1', busEquip: 'CCTP art. 5.1', techno: 'CCTP art. 5.1' } });
  // Électricité : batterie électrique de la CTA sur sa propre ligne, groupe froid estimé d'après son EER
  const l = I.versElec(inv), p = rep => (l.find(x => x.rep === rep) || {}).P;
  assert.deepStrictEqual([p('PAC-01'), p('GF-01'), p('CTA-01'), p('CTA-01-BE')], [26, 22.6, '', 6]);
  assert.strictEqual(l.find(x => x.rep === 'CTA-01-BE').type, 'resistance');
  const re = N.calculer('elec', { ...N.defauts('elec'), equipements: l, ...I.versRegulation(inv).entrees });
  assert.ok(!re.alertes.some(a => a.niveau === 'erreur'), re.alertes.map(a => a.texte).join(' | '));
});

// DPGF fictif au format « n° d'article sur les titres seulement » (« 4-3-1 ») : désignations sur deux lignes, variantes sous
// un parent (« Taille 200 », « DN 50 »), sous-totaux « … - Total €HT », abréviations EC / EG / EF / TFP, récapitulatif final
const DPGF_TFP = [
  ['LOT 14 – CVC PLOMBERIE (dossier fictif)'], [],
  ['Article', 'Désignation', 'U', 'Qté', 'PU', 'PT'],
  ['4', 'PRODUCTION DE CHAUD / FROID PAR THERMOFRIGOPOMPE', '', '', '', ''],
  ['4-3-1', 'TFP', '', '', '', ''],
  ['', 'Pompe à chaleur réversible type ZX90 de marque ACME ou équivalent', '', '', '', ''],
  ['', 'Pchaud 95,0 kW (55/45°C) Pfroid 70 kW (7/12 °C) - R32', 'u', 1, 52000, 52000],
  ['4-3-1', 'TFP - Total €HT', '', '', '', 52000],
  ['4-3-2', 'Circuit primaire chauffage', '', '', '', ''],
  ['', 'Collecteur primaire Ø70/76 départ EC', 'u', 1, 800, 800],
  ['', 'Ballon tampon primaire EC', '', '', '', ''],
  ['', 'Ballon tampon type T-500 4 bars de marque BALLOX', 'u', 1, 1500, 1500],
  ['', 'Vase d\'expansion type VX de marque BALLOX 200 L', 'u', 1, 600, 600],
  ['4-3-3', 'Circuit primaire eau glacée', '', '', '', ''],
  ['', 'Ballon tampon primaire EG', '', '', '', ''],
  ['', 'Ballon tampon type T-300 4 bars de marque BALLOX', 'u', 1, 1200, 1200],
  ['4-3-3', 'Circuit primaire eau glacée - Total € HT', '', '', '', 2700],
  ['5', 'DISTRIBUTION', '', '', '', ''],
  ['5-1', 'Pompes et vannes circuits secondaires', '', '', '', ''],
  ['', 'Pompe double P2 - 9,9 m3/h 14,3 mCE', 'u', 1, 2500, 2500],
  ['', 'Vanne d\'isolement', '', '', '', ''],
  ['', 'DN 50 (CTA / ventilo EC)', 'u', 3, 90, 270],
  ['', 'DN 40 (radiateurs EC)', 'u', 2, 70, 140],
  ['5-2', 'Émetteurs', '', '', '', ''],
  ['', 'Ventilo-convecteur 2 tubes 2 fils type VX de marque ACME ou équivalent y compris résistance électrique :', '', '', '', ''],
  ['', 'Taille 200', 'u', 3, 600, 1800],
  ['', 'Taille 300', 'u', 8, 700, 5600],
  ['', 'Radiateurs fonte tel que décrit', '', '', '', ''],
  ['', 'Type15 - l1400 - ht500 - ep200', 'u', 5, 400, 2000],
  ['', 'Radiateur sèche-serviettes électrique 1000W', 'u', 2, 200, 400],
  ['', 'Aérotherme électrique 3 kW', 'u', 1, 300, 300],
  ['6', 'VENTILATION DOUBLE FLUX [CTA 1]', '', '', '', ''],
  ['', 'Centrale double flux type DF-12 de MARQUE ou équivalent - AS/AR 3200 m3/h', '', '', '', ''],
  ['', '- avec tous ses accessoires y compris batterie chaude et froide', 'ens', 1, 18000, 18000],
  ['7', 'VENTILATIONS SIMPLE FLUX', '', '', '', ''],
  ['', 'Extracteur V1 type EX-04 de MARQUE ou équivalent', '', '', '', ''],
  ['', 'AR : 270 m3/h - avec tous ses accessoires', 'ens', 1, 900, 900],
  ['8', 'CLIMATISATION LOCAL INFORMATIQUE', '', '', '', ''],
  ['', 'Unité intérieure murale à détente directe 3,5 kW', 'u', 1, 900, 900],
  ['', 'Unité extérieure à détente directe 3,5 kW', 'u', 1, 1100, 1100],
  ['9', 'PLOMBERIE SANITAIRE', '', '', '', ''],
  ['', 'Réseau eau froide EF cuivre Ø 22', 'ml', 40, 30, 1200],
  ['10', 'GTB / GTC', '', '', '', ''],
  ['', 'Automate de régulation Siemens, supervision BACnet/IP', 'ens', 1, 9000, 9000],
  ['', 'RÉCAPITULATIF', '', '', '', ''],
  ['4', 'PRODUCTION DE CHAUD / FROID PAR THERMOFRIGOPOMPE', '', '', '', 54700],
  ['6', 'VENTILATION DOUBLE FLUX [CTA 1]', 'ens', 1, '', 18000],
  ['', 'Total général € HT', '', '', '', 100000],
];
test('DPGF à titres numérotés : désignations sur plusieurs lignes, variantes, totaux et récapitulatif ignorés', () => {
  const { items, reseaux } = I.depuisDpgf(DPGF_TFP), g = k => items.filter(x => x.genre === k);
  // Aucun double comptage : le récapitulatif ne crée rien, une seule production, une seule CTA
  assert.deepStrictEqual(items.map(x => x.genre), ['pac-rev', 'tampon', 'vase', 'tampon', 'pompe', 'ventilo', 'ventilo', 'radiateurs', 'radiateurs', 'aerotherme', 'cta', 'ventilateur', 'split', 'split', 'regulation']);
  // Production : thermofrigopompe (chapitre « TFP »), puissances et régimes chaud / froid, marque, n° à points
  const tfp = g('pac-rev')[0];
  assert.deepStrictEqual([tfp.P, tfp.Pfr, tfp.carac.regimeChaud, tfp.carac.regimeFroid, tfp.carac.frigorigene, tfp.details.recup, tfp.details.marque, tfp.details.reference, tfp.sources[0]],
    [95, 70, '55/45', '7/12', 'R32', 'totale', 'ACME', 'ZX90', 'DPGF 4.3.1']);
  assert.match(tfp.designation, /^Pompe à chaleur réversible type ZX90 .* Pfroid 70 kW/);
  // Ballons tampons : chaud (« … primaire EC ») et froid (« … primaire EG ») ; vase de 200 L
  assert.deepStrictEqual(g('tampon').map(x => [x.details.fluide, x.details.reference, x.designation]), [['chaud', 'T-500', 'Ballon tampon type T-500 4 bars de marque BALLOX'], ['froid', 'T-300', 'Ballon tampon type T-300 4 bars de marque BALLOX']]);
  assert.strictEqual(g('vase')[0].carac.volume, 200);
  // Pompe double P2 : débit et hauteur
  assert.deepStrictEqual([g('pompe')[0].repere, g('pompe')[0].Q, g('pompe')[0].carac.HMT, g('pompe')[0].details.double], ['P2', 9.9, 14.3, true]);
  // Vannes d'isolement « DN 50 (CTA / ventilo EC) » : pas des CTA
  assert.strictEqual(g('cta').length, 1);
  assert.ok(!items.some(x => /^Vanne/.test(x.designation)));
  assert.deepStrictEqual(I.classer('Vanne d\'isolement DN 50 (CTA / ventilo EC)'), null);
  // Ventilo-convecteurs par taille, 2 tubes 2 fils (résistance électrique), marque du parent
  assert.deepStrictEqual(g('ventilo').map(x => [x.designation.replace(/^.* (Taille \d+)$/, '$1'), x.qte, x.details.tubes, x.details.fils2, x.details.marque]), [['Taille 200', 3, '2t', true, 'ACME'], ['Taille 300', 8, '2t', true, 'ACME']]);
  // Radiateurs fonte (variante du parent « tel que décrit ») et radiateur électrique ; aérotherme électrique
  assert.deepStrictEqual(g('radiateurs').map(x => [x.qte, x.alim === 'electrique', x.Pel]), [[5, false, NaN], [2, true, 1]]);
  assert.deepStrictEqual([g('aerotherme')[0].alim, g('aerotherme')[0].Pel], ['electrique', 3]);
  // CTA du chapitre « [CTA 1] » : débit, batteries chaude et froide ; extracteur V1 et son débit ; splits
  const cta = g('cta')[0];
  assert.deepStrictEqual([cta.repere, cta.Q, cta.details.batteries, cta.details.reference], ['CTA-1', 3200, { chaude: true, froide: true }, 'DF-12']);
  assert.deepStrictEqual([g('ventilateur')[0].repere, g('ventilateur')[0].Q], ['V1', 270]);
  assert.strictEqual(g('split').length, 2);
  assert.deepStrictEqual(g('regulation')[0].details.regulation, { marque: 'siemens', gtb: 'BACnet/IP', techno: 'automate' });
  // Abréviations : EC = chauffage (pas ECS), EG = eau glacée (pas plomberie), EF = plomberie
  assert.deepStrictEqual([I.natureReseau('Collecteur primaire Ø70/76 départ EC'), I.natureReseau('Réseau EG'), I.natureReseau('Réseau ECS'), I.natureReseau('Réseau eau froide EF')], ['chauffage', 'eau-glacee', 'ecs', 'plomberie']);
  assert.deepStrictEqual(reseaux.filter(r => r.nature).map(r => [r.nom, r.nature]), [['Circuit primaire chauffage', 'chauffage'], ['Circuit primaire eau glacée', 'eau-glacee'], ['Réseau eau froide EF cuivre Ø 22', 'plomberie']]);
  // Calculs : production réversible à récupération, émetteurs électriques hors schéma, ballon froid laissé au schéma froid,
  // terminaux 2 tubes 2 fils (eau froide + résistance), radiateur électrique
  const inv = I.fusionner([], items);
  I.rattacher(inv, reseaux);
  const { entrees, alertes } = I.versSchema(inv, Sc, reseaux);
  assert.deepStrictEqual([entrees.generateur, entrees.recupGf, entrees.reseau], ['pac-rev', 'totale', 'co']);
  // Production réversible : les deux ballons tampons (EC et EG) restent dans le schéma ; dans un schéma chaud, le ballon EG irait au schéma froid
  assert.deepStrictEqual(entrees.ballons.map(x => x.fonction), ['tampon', 'tampon']);
  const chaud = I.versSchema(inv.map(x => (x.genre === 'pac-rev' ? { ...x, genre: 'pac-air' } : x)), Sc, reseaux);
  assert.ok(chaud.alertes.some(a => /Ballon tampon type T-300.*schéma froid/.test(a)));
  assert.ok(!entrees.circuits.some(c => /électrique/i.test(c.rep)), 'émetteurs électriques hors schéma hydraulique');
  const t = I.versTerminaux(inv).appareils;
  assert.deepStrictEqual([...new Set(t.filter(a => a.type === 'vc2').map(a => a.batterie))], ['froide+elec']);
  assert.deepStrictEqual(t.filter(a => a.type === 'radElec').map(a => [a.batterie, a.Pbe]), [['elec', 1], ['elec', 1]]);
  assert.deepStrictEqual(I.versElec(inv).filter(l => l.type === 'resistance').map(l => l.P), [1, 1, 3]);
});

// DPGF fictif : trois CTA (titre « [CTA n] », désignation sur deux lignes, unité « ens » suivie d'espaces, quantité « 1.0 »,
// débit « AS/AR … m3 »), régulation de la CTA, ventilos par taille sous un parent écrit sur deux lignes, prestations et
// accessoires sous des parents d'équipement, réseaux d'eau chaude / froide d'un chapitre de plomberie sanitaire
const ctaFictive = k => [
  [`6-${k + 2}`, `VENTILATION DOUBLE FLUX - GENERALE [CTA ${k}]`, '', '', '', ''],
  [`6-${k + 2}-1`, 'Centrale de ventilation double flux', '', '', '', ''],
  ['', `Centrale type DF-${k + 7} de MARQUE ou équivalent - AS/AR ${3000 + k * 190} m3`, '', '', '', ''],
  ['', '- avec tous ses accessoires telle que décrite y compris batterie chaude et froide', 'ens  ', '1.0', 15000, 15000],
  [`6-${k + 2}-2`, 'Régulation de la CTA', '', '', '', ''],
  ['', 'Configuration des points CTA telle que décrite', 'ens', 1, 800, 800],
  ['', 'Analyse fonctionnelle de la CTA', 'Ens.', 1, 400, 400],
  [`6-${k + 2}`, `VENTILATION DOUBLE FLUX - GENERALE [CTA ${k}] - Total €HT`, '', '', '', 16200],
];
const DPGF_CTA = [
  ['Article', 'Désignation', 'U', 'Qté', 'PU', 'PT'],
  ['4', 'CHAUFFAGE', '', '', '', ''],
  ['4-5-2-2', 'Ventilo convecteur 2 tubes / 2 fils', '', '', '', ''],
  ['', 'Ventilo convecteur 2 tubes type VX P de marque ACME avec tous ses', '', '', '', ''],
  ['', 'accessoires tel que décrit y compris résistance électrique :', '', '', '', ''],
  ['', 'Taille 200', 'u', 3, 600, 1800], ['', 'Taille 300', 'u', 8, 600, 4800], ['', 'Taille 350', 'u', 6, 600, 3600],
  ['', 'Taille 400', 'U', 2, 600, 1200], ['', 'Taille 450', 'u ', 14, 600, 8400],
  ['4-5-2-2', 'Ventilo convecteurs 2 tubes / 2 fils- Total €HT', '', '', '', 19800],
  ['4-5-2-3', 'Régulation', '', '', '', ''],
  ['', 'Bouton de "relance confort" pour chaque ventilo-convecteur et aérotherme', 'ens', 20, 50, 1000],
  ['4-6', 'Radiateurs', '', '', '', ''],
  ['', 'Radiateurs fonte tel que décrit', '', '', '', ''],
  ['', 'Type15 - l1400 - ht500 - ep200', 'u', 5, 400, 2000],
  ['', 'Équilibrage et relevé de débits tel que décrit', 'ens', 1, 500, 500],
  ['4-7', 'Accessoires hydrauliques', '', '', '', ''],
  ['', 'Filtre à boue magnétique y compris vanne de chasse, pompe, vanne de réglage', 'u', 1, 900, 900],
  ...ctaFictive(1), ...ctaFictive(2), ...ctaFictive(3),
  ['9', 'PLOMBERIE SANITAIRE', '', '', '', ''],
  ['9-1', 'RESEAU D\'ALIMENTATION EAU CHAUDE, EAU FROIDE', '', '', '', ''],
  ['', 'Distribution d\'eau froide / eau chaude', 'ens', 1, 3000, 3000],
  ['', 'Tube cuivre calorifugé ECS tel que décrit', '', '', '', ''],
  ['', 'Ø 22', 'ml', 40, 30, 1200],
  ['', 'Repérage du réseau par étiquette', 'ens', 1, 200, 200],
  ['', 'Vanne d\'isolement et de vidange', 'u', 4, 40, 160],
  ['9-2', 'Production d\'eau chaude sanitaire', '', '', '', ''],
  ['', 'Ballon d\'eau chaude sanitaire électrique 200 L', 'u', 1, 900, 900],
];

test('DPGF à titres numérotés : CTA « [CTA n] », régulation, ventilos par taille, prestations, réseaux sanitaires', () => {
  const { items, reseaux } = I.depuisDpgf(DPGF_CTA), g = k => items.filter(x => x.genre === k);
  // Trois CTA, chacune avec son repère et son débit AS/AR ; leur régulation n'est pas une CTA
  assert.deepStrictEqual(g('cta').map(x => [x.repere, x.Q, x.qte, x.details.batteries]), [1, 2, 3].map(k => [`CTA-${k}`, 3000 + k * 190, 1, { chaude: true, froide: true }]));
  assert.ok(g('regulation').some(x => /^Configuration des points CTA/.test(x.designation)) && g('regulation').some(x => /^Analyse fonctionnelle/.test(x.designation)));
  // Ventilo-convecteurs par taille : parent sur deux lignes, 2 tubes 2 fils, marque et type du parent, 33 unités
  const vc = g('ventilo');
  assert.deepStrictEqual(vc.map(x => [x.designation.replace(/^.* (Taille \d+)$/, '$1'), x.qte]), [['Taille 200', 3], ['Taille 300', 8], ['Taille 350', 6], ['Taille 400', 2], ['Taille 450', 14]]);
  assert.strictEqual(vc.reduce((s, x) => s + x.qte, 0), 33);
  assert.ok(vc.every(x => x.details.tubes === '2t' && x.details.batteries.elec && x.details.marque === 'ACME' && x.details.reference === 'VX P'));
  assert.ok(!vc.some(x => /relance confort/.test(x.designation)), 'le bouton de relance confort est de la régulation');
  // Prestations et accessoires : ni pompe, ni radiateur, ni production d'ECS
  assert.deepStrictEqual(g('radiateurs').map(x => x.qte), [5]);
  assert.strictEqual(g('pompe').length, 0, 'filtre à boue : accessoire');
  assert.deepStrictEqual(g('ecs').map(x => x.designation), ['Ballon d\'eau chaude sanitaire électrique 200 L']);
  assert.deepStrictEqual(items.map(x => x.genre).sort(), ['cta', 'cta', 'cta', 'ecs', 'radiateurs', ...Array(7).fill('regulation'), ...Array(5).fill('ventilo')].sort());
  ['Équilibrage et relevé de débits', 'Filtre à boue magnétique', 'Repérage du réseau par étiquette', 'Vanne d\'isolement et de vidange'].forEach(t => assert.strictEqual(I.classer(t), null, t));
  // Plomberie sanitaire : eau chaude / eau froide = ECS et plomberie, jamais du chauffage
  assert.ok(reseaux.length && reseaux.every(r => ['plomberie', 'ecs'].includes(r.nature)), JSON.stringify(reseaux.map(r => [r.nom, r.nature])));
  assert.ok(!reseaux.some(r => r.nature === 'chauffage'));
  assert.strictEqual(I.natureReseau('Distribution d\'eau froide / eau chaude'), 'chauffage', 'hors chapitre de plomberie, la lecture reste celle du chauffage');
});

test('guide « Reste à faire » : ordre d\'une étude, étape suivante, sources des valeurs à vérifier, progression', () => {
  const { inv, reseaux } = lire();
  const et = { id: 'e1', objet: 'Maison de santé', notes: [], inventaire: inv, inventaireReseaux: reseaux, inventaireEcarts: I.ecarts(inv) };
  let r = G.restesAFaire(et);
  const ids = () => r.etapes.map(x => x.id);
  assert.strictEqual(r.suivante.id, 'climat', 'les données de l\'étude d\'abord');
  assert.deepStrictEqual(ids().slice(0, 8), ['climat', 'typeBatiment', 'import', 'ecarts', 'creer-pid', 'creer-aero', 'creer-terminaux', 'bilans']);
  assert.ok(r.etapes.find(x => x.id === 'import').fait);
  // Valeurs reprises avec une faible confiance : la source CCTP / DPGF est citée
  const v = r.etapes.find(x => x.id === `verifier:${par(inv, 'pac-air').id}`);
  assert.match(v.info, /90 kW \(CCTP art\. 2\.1\) ≠ 95 kW \(DPGF ligne 2\.1\)/);
  assert.deepStrictEqual(v.action, ['inventaire-revoir', '🔎 Vérifier dans l\'inventaire']);
  assert.deepStrictEqual(r.etapes.find(x => x.id === 'creer-elec').action[0], 'creer:elec');
  const pct0 = r.pct;
  // Données renseignées, écarts traités, schéma de principe créé : l'étape suivante avance, la progression monte
  et.climat = 'H1a'; et.typeBatiment = 'bureaux'; et.inventaireEcartsTraites = true;
  const pid = { id: 'n1', type: 'pid', titre: 'Schéma de principe', entrees: { ...N.defauts('pid'), ...I.versSchema(inv, Sc, reseaux).entrees } };
  et.notes.push(pid);
  r = G.restesAFaire(et);
  assert.ok(r.pct > pct0);
  assert.strictEqual(r.suivante.id, 'creer-aero');
  assert.ok(r.etapes.find(x => x.id === 'creer-pid').fait);
  // Ordre logique des groupes respecté
  const ordre = G.GROUPES.map(g => g[0]), rang = r.etapes.map(x => ordre.indexOf(x.groupe));
  assert.deepStrictEqual(rang, rang.slice().sort((a, b) => a - b));
  // Valeurs par défaut du calcul : à confirmer (bouton « C'est bon »), puis faites
  const val = r.etapes.find(x => x.id === 'valeurs:n1');
  assert.deepStrictEqual([val.fait, val.confirmer, val.action[0]], [false, 'confirmer:n1', 'note:n1']);
  pid.defautsConfirmes = true;
  assert.ok(G.restesAFaire(et).etapes.find(x => x.id === 'valeurs:n1').fait);
  // Valeur vide : à saisir (pas de confirmation possible)
  pid.entrees.circuits[0].P = '';
  const vv = G.restesAFaire(et).etapes.find(x => x.id === 'valeurs:n1');
  assert.ok(!vv.fait && !vv.confirmer && /Puissance du circuit « Circuit radiateurs » \(vide\)/.test(vv.info));
  pid.entrees.circuits[0].P = 38.4;
  // Raccordements (installation hydraulique), fiches, régulation, émission, envoi au chantier
  r = G.restesAFaire(et);
  assert.ok(['raccordes', 'erreurs', 'fiches', 'creer-elec', 'emission', 'chantier', 'diffusion'].every(k => ids().includes(k)), ids().join(', '));
  assert.match(r.etapes.find(x => x.id === 'fiches').info, /4 producteur\(s\) \/ CTA/);
  // Équipement vérifié dans l'inventaire : l'étape est faite
  par(inv, 'pac-air').verifie = true;
  assert.ok(G.restesAFaire(et).etapes.find(x => x.id === v.id).fait);
  // Régulation créée : zones types à préciser, régulation du CCTP à reprendre, puissances électriques
  const el = { id: 'n2', type: 'elec', titre: 'Électricité', entrees: { ...N.defauts('elec'), equipements: I.versElec(inv) } };
  et.notes.push(el);
  r = G.restesAFaire(et);
  assert.deepStrictEqual(['zones', 'marque', 'elec-puissances'].map(k => (r.etapes.find(x => x.id === k) || {}).fait), [false, false, false]);
  Object.assign(el.entrees, I.versRegulation(inv).entrees);
  assert.ok(G.restesAFaire(et).etapes.find(x => x.id === 'marque').fait);
  // Notes émises, étude reliée et diffusée
  et.notes.forEach(n => { n.emissions = [{ indice: 'A' }]; }); et.affaireId = 'af1'; et.diffusions = [{ numero: 'BT-1' }];
  r = G.restesAFaire(et);
  assert.ok(['emission', 'chantier', 'diffusion'].every(k => r.etapes.find(x => x.id === k).fait));
});

test('guide « Reste à faire » : étude vide, sans inventaire', () => {
  const r = G.restesAFaire({ id: 'e', notes: [] });
  assert.deepStrictEqual(r.etapes.map(x => x.id), ['climat', 'typeBatiment', 'import']);
  assert.deepStrictEqual([r.pct, r.suivante.action[0]], [0, 'champ:climat']);
  assert.strictEqual(G.restesAFaire({ id: 'e', notes: [], climat: 'H2b', typeBatiment: 'ecole' }).suivante.action[0], 'inventaire');
});
