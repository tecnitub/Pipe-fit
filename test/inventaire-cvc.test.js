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

// Dossier type « bureau d'études » : chapitres romains, numéro d'article seul sur sa ligne, en-têtes de page répétés,
// ligatures « ti » perdues par la police du PDF, chapitre de variante ; DPGF à la même numérotation
test('gros équipements d\'abord : CCTP à chapitres romains rapproché du DPGF par la numérotation', () => {
  const CL = require('../public/js/cctp-lecture');
  const page = n => ['Atelier X – CCTP lot 11', 'DCE - Edition du 01/01/2026', `Page ${n}/9`];
  const lignes = ['CCTP', 'Sommaire', 'I DISPOSITIONS GENERALES..........', 'I.2 OBJET DU PRESENT LOT..........', 'I.2.1 CHAUFFAGE / CLIMATISATION :..........', 'II PRESCRIPTIONS PARTICULIERES..........', 'III DESCRIPTION DES OUVRAGES..........',
    'III.1.5 Chauffage/Clima sa on du local déchets..........', ...page(1),
    'I.2.1 CHAUFFAGE / CLIMATISATION :', 'Une pompe à chaleur alimentera les CTA.', ...page(2),
    'III.1', 'CHAUFFAGE CLIMATISATION DES LOCAUX', 'III.1.1', 'Pompe à chaleur EAU / EAU', 'Celle-ci sera de marque MARQUEA ou techniquement équivalent. Régime 7/12 °C.', ...page(3),
    'III.1.1.1', 'Fourniture et pose de la pompe à chaleur eau/eau', 'Compris accessoires.',
    'III.1.1.9', 'Circuit Pompe REJET PAC nappe phréatique', 'Pompe simple 12 m3/h.', 'III.1.1.13', 'Distribution tuyauterie', 'Réseaux du primaire (nappe) et du secondaire.',
    'III.1.3', 'CTA salle de restaura on', 'Centrale de marque MARQUEB.', 'III.1.3.1', 'Centrale de traitement d\'air', 'Débit 3500 m3/h, marque MARQUEC type CTX.',
    'III.1.5', ...page(4), 'Chauffage/Clima sa on du local déchets', 'Mono-split de marque MARQUED.',
    'III.2', 'VENTILATION HYGIENIQUE PARTIES COMMUNES', 'III.2.1', 'Centrale double flux', 'Marque MARQUEE type DF.', 'III.2.2', 'Réseau de souﬄage / air neuf', 'Gaines galvanisées.',
    'III.3', 'VENTILATION HYGIENIQUE CUISINE', 'III.3.1', 'Centrale double flux', 'Marque MARQUEE type DF.', 'III.3.2', 'Réseau de souﬄage / air neuf', 'Gaines galvanisées.',
    'III.4', 'VENTILATION PROCESS CUISINE', 'III.4.4', 'Compensa on Cuisine', 'Mise en place d\'une CTA SF de compensation de marque MARQUEF.', ...page(5),
    'III.4.6', 'Électricité / asservissement', 'Asservissement de la CTA à la hotte.', ...page(6), ...page(7), ...page(8),
    'III.7', 'VARIANTE CHAUFFAGE / CLIMATISATION', 'III.7.1', 'PAC AIR / EAU', 'Pompe à chaleur air/eau.', 'III.7.1.5', 'Moins value : Fourniture et pose de la PAC eau/eau', ''];
  const a = CL.analyser(lignes);
  assert.strictEqual(a.chapitres.III, 'DESCRIPTION DES OUVRAGES');
  assert.ok(a.articles.some(x => x.num === 'III.1.3' && x.titre === 'CTA salle de restauration'), 'ligature « ti » rétablie');
  assert.strictEqual(a.articles.find(x => x.num === 'III.1.5').titre, 'Chauffage/Climatisation du local déchets', 'titre du sommaire, en-tête de page écarté');
  assert.ok(!a.equipements.some(e => /^I\./.test(e.article)), 'chapitre de dispositions générales : pas d\'équipement');
  const rc = I.reseauxCctp(a), ic = I.depuisCctp(a.equipements, rc, a.articles);
  // Sous-article réuni à son équipement ; deux « Centrale double flux » nommées par leur chapitre ; titre muet reconnu au texte
  assert.strictEqual(ic.filter(x => x.genre === 'pac-eau' && !x.variante).length, 1);
  assert.match(ic.find(x => x.genre === 'cta' && /restauration/.test(x.designation)).prescrit, /MARQUEB.*MARQUEC/);
  assert.deepStrictEqual(ic.filter(x => /^Centrale double flux/.test(x.designation)).map(x => x.designation), ['Centrale double flux — VENTILATION HYGIENIQUE PARTIES COMMUNES', 'Centrale double flux — VENTILATION HYGIENIQUE CUISINE']);
  assert.ok(ic.some(x => x.genre === 'cta' && x.designation === 'Compensation Cuisine'));
  assert.ok(!ic.some(x => /asservissement/i.test(x.designation)));
  assert.ok(ic.filter(x => /PAC AIR|Moins value/.test(x.designation)).every(x => x.variante && !x.principal), 'chapitre de variante');
  // Réseaux : même identifiant que le DPGF (« réseau @ chapitre »), texte qui ne tranche pas (primaire et secondaire) écarté
  assert.deepStrictEqual(rc.map(r => [r.id, r.nature]), [['circuit pompe rejet pac nappe phreatique @ pompe a chaleur eau eau', 'captage'],
    ['reseau de soufflage air neuf @ ventilation hygienique parties communes', 'soufflage'], ['reseau de soufflage air neuf @ ventilation hygienique cuisine', 'soufflage']]);
  // DPGF à la même numérotation : une ligne par article = le même équipement ; deux lignes (unités extérieure et
  // intérieure) détaillent l'article, qui est remplacé par elles avec sa prescription
  const d = I.depuisDpgf([['NIV', 'Code', 'Désignation', 'U', 'Qté'], ['3', 'III.1.1', 'Pompe à chaleur EAU / EAU', '', ''], ['5', 'III.1.1.1.1', 'Fourniture et pose de la pompe à chaleur eau/eau', 'U', '1'],
    ['3', 'III.1.3', 'CTA salle de restauration', '', ''], ['5', 'III.1.3.1.30', 'Centrale de traitement d\'air salle de restauration', 'U', '2'],
    ['3', 'III.1.5', 'Chauffage/Climatisation du local déchets', '', ''], ['5', 'III.1.5.1.50', 'Unité extérieure : type UE20', 'U', '1'], ['5', 'III.1.5.1.52', 'Unité intérieure : murale type UI20', 'U', '1'],
    ['3', 'III.2.1', 'Centrale double flux', '', ''], ['5', 'III.2.1.61', 'Centrale double flux parties communes', 'U', '1'],
    ['3', 'III.3.1', 'Centrale double flux', '', ''], ['5', 'III.3.1.99', 'Centrale double flux cuisine', 'U', '1'],
    ['3', 'III.2.3', 'Réseau d\'extraction / rejet', '', ''], ['5', 'III.2.3.91', 'Bouches d\'extraction', 'U', '18']]);
  const inv = I.fusionner(ic, d.items);
  assert.strictEqual(inv.filter(x => x.genre === 'pac-eau' && x.inclus).length, 1, 'PAC non dupliquée');
  assert.strictEqual(inv.find(x => x.genre === 'cta' && /restauration/.test(x.designation)).qte, 2, 'quantité du DPGF');
  assert.strictEqual(inv.filter(x => /^Centrale double flux/.test(x.designation)).length, 2);
  const sp = inv.filter(x => x.genre === 'split');
  assert.deepStrictEqual(sp.map(x => x.designation), ['Unité extérieure : type UE20', 'Unité intérieure : murale type UI20']);
  assert.ok(sp.every(x => /MARQUED/.test(x.prescrit)));
  // Ordre : production, gros équipements, émetteurs, auxiliaires ; variantes à la fin, non retenues
  const rangs = inv.map(x => (x.variante ? 9 : x.categorie === 'producteur' ? 0 : x.principal ? 1 : 2));
  assert.deepStrictEqual(rangs, [...rangs].sort((p, q) => p - q));
  assert.strictEqual(inv[0].genre, 'pac-eau');
  assert.ok(inv.filter(x => x.variante).every(x => x.inclus === false));
});

test('ligatures : réparées seulement quand le PDF en a perdu', () => {
  const CL = require('../public/js/cctp-lecture');
  assert.deepStrictEqual(CL.reparer(['ainsi que la hotte', 'si on veut']), ['ainsi que la hotte', 'si on veut']);
  const r = CL.reparer(['Extrac on', 'restaura on', 'Disposi f', 'acous que', 'casse es', 'Clima sa on', 'ainsi que', 'ho e']);
  assert.deepStrictEqual(CL.reparer(['restauraƟon', 'hoƩe']), ['restauration', 'hotte']);
  assert.deepStrictEqual(r, ['Extraction', 'restauration', 'Dispositif', 'acoustique', 'cassettes', 'Climatisation', 'ainsi que', 'hotte']);
});

test('caractéristiques du CCTP : puissances chaud / froid / électrique, débit, pression, fluide, acoustique', () => {
  const c = I.caracteristiques('Centrale de marque X. Débit d\'air : 3500 m3/h. Pression disponible : 250 Pa. Puissance absorbée : 0.82 kW. Batterie chaude 24 kW, batterie froide 18 kW. Régime 7/12 °C en été et 45/40°C en hiver. Fluide R454B. Puissance sonore min/max : 66/70 dB(A). Efficacité du récupérateur 85 %. Filtre F7 (ePM1 55%). Alimentation tri 400 V.');
  assert.deepStrictEqual([c.Q, c.Pdispo, c.Pel, c.Pch, c.Pfr, c.regimeFroid, c.regimeChaud, c.frigorigene, c.Lw, c.rendement, c.tension], [3500, 250, 0.82, 24, 18, '7/12', '45/40', 'R454B', 70, 85, '400 V']);
  assert.match(c.filtres, /F7/);
  assert.deepStrictEqual(I.puissances('batterie électrique de 15 kW ; Puissance froid : 1 à 1.6 kW ; Puissance 2200W'), { Pel: 15, Pfr: 1.6, P: 2.2 });
  // « inox 304L » n'est pas un volume ; « ballon 150L » en est un
  assert.strictEqual(I.caracteristiques('caisson inox 304L').volume, undefined);
  assert.strictEqual(I.caracteristiques('Ballon ECS - 150L').volume, 150);
  assert.match(I.caracTexte(c), /3 500 m³\/h · 250 Pa dispo/);
});

test('alimentation et rattachement : CTA et cassettes au change-over de la PAC, ECS électrique et CTA à batterie électrique hors schéma', () => {
  assert.strictEqual(I.alimentation('batterie hydraulique change-over raccordée à la PAC', 'cta'), 'change-over');
  assert.strictEqual(I.alimentation('Régime : 7/12 °C en été et 45/40°C en hiver', 'ventilo'), 'change-over');
  assert.strictEqual(I.alimentation('équipée d\'une batterie électrique de 9 kW', 'cta'), 'electrique');
  assert.strictEqual(I.alimentation('Production ECS électrique Ballon 150L', 'ecs'), 'electrique');
  assert.strictEqual(I.alimentation('Préparateur solaire 900 litres serpentin', 'ecs'), 'solaire');
  const res = [{ id: 'co', nom: 'Circuit distribution chauffage/climatisation', nature: 'change-over', hydro: true, L: 160, regime: '' }];
  const inv = [
    { categorie: 'producteur', genre: 'pac-eau', designation: 'PAC eau/eau', qte: 1, P: 60, carac: { regimeChaud: '45/40', regimeFroid: '7/12' }, alim: 'change-over', sources: ['CCTP art. III.1.1'], inclus: true },
    { categorie: 'emetteur', genre: 'cta', designation: 'CTA restaurant', qte: 1, P: 20, Pfr: 15, alim: '', sources: ['CCTP art. III.1.3'], inclus: true },
    { categorie: 'emetteur', genre: 'ventilo', designation: 'Cassettes', qte: 4, P: '', Pfr: 2, alim: 'change-over', sources: ['DPGF III.1.4.2'], inclus: true },
    { categorie: 'emetteur', genre: 'cta', designation: 'CTA double flux bureaux', qte: 1, P: '', Pel: 9, alim: 'electrique', sources: ['CCTP art. III.2.1'], inclus: true },
    { categorie: 'emetteur', genre: 'ecs', designation: 'Ballon ECS 200L', qte: 1, alim: 'electrique', carac: { volume: 200 }, sources: ['DPGF III.6.4.1'], inclus: true }];
  I.rattacher(inv, res);
  assert.deepStrictEqual(inv.map(x => [x.reseau || '', x.rattache || '', x.horsSchema || '']), [['', '', ''], ['co', 'chapitre', ''], ['co', 'texte', ''], ['', '', 'CTA à batterie électrique'], ['', '', 'ECS électrique']]);
  const { entrees, alertes } = I.versSchema(inv, Sc, res);
  assert.strictEqual(entrees.reseau, 'co', 'PAC eau/eau réversible : change-over');
  assert.deepStrictEqual(entrees.circuits.map(c => [c.reseau, c.P]), [['co', 28]], 'un circuit : CTA 20 kW + 4 cassettes de 2 kW (froid à défaut de chaud)');
  assert.ok(alertes.some(a => /Ballon ECS 200L : ECS électrique/.test(a)));
  // Bilan électrique : puissance électrique lue (9 kW), ballon électrique en résistance, numérotation continue
  const l = I.versElec(inv);
  assert.deepStrictEqual(l.filter(x => x.type === 'cta').map(x => [x.rep, x.P]), [['CTA-01', ''], ['CTA-02', 9]]);
  assert.deepStrictEqual(l.filter(x => x.type === 'resistance').map(x => [x.P, x.tension]), [[2.4, 'mono']]);
});

test('écarts CCTP / DPGF : non chiffré, non décrit, quantité, marque', () => {
  const inv = [
    { categorie: 'producteur', genre: 'pac-eau', designation: 'PAC', principal: true, prescrit: 'marque EMICON', prescritDpgf: 'marque EMICON, marque prévue au DPGF : AUTREMARQUE', qte: 1, sources: ['CCTP art. 1.1', 'DPGF 1.1.1'] },
    { categorie: 'emetteur', genre: 'cta', designation: 'CTA hall', principal: true, qte: 2, qteCctp: 3, sources: ['CCTP art. 1.2', 'DPGF 1.2.1'] },
    { categorie: 'emetteur', genre: 'ventilo', designation: 'Ventilo-convecteurs', qte: 1, sources: ['CCTP art. 1.4'] },
    { categorie: 'auxiliaire', genre: 'ventilateur', designation: 'Tourelle', principal: true, qte: 1, sources: ['DPGF 2.1.3'] },
    { categorie: 'producteur', genre: 'pac-air', designation: 'Variante PAC air', variante: true, qte: 1, sources: ['DPGF 9.1'] }];
  const e = I.ecarts(inv);
  assert.deepStrictEqual(e.map(x => [x.type, x.designation]), [['marque', 'PAC'], ['quantite', 'CTA hall'], ['absent-dpgf', 'Ventilo-convecteurs'], ['absent-cctp', 'Tourelle']]);
  assert.match(I.ecartsTexte(e), /^1\. PAC — Marque différente : .*AUTREMARQUE/);
});

test('corrections mémorisées : apprises du tableau, appliquées au dossier suivant', () => {
  const items = [{ designation: 'Tronçon de soufflage DBB-RR-Z DN500 (longueur : 2000mm)', genre: 'bouche-extraction', categorie: 'emetteur', inclus: true },
    { designation: 'Tourelle de désenfumage 4000 m3/h', genre: 'desenfumage', categorie: 'auxiliaire', inclus: true }];
  items.forEach(x => { x.auto = { designation: x.designation, genre: x.genre, inclus: x.inclus }; });
  const reseaux = [{ nom: 'Réseau de gaine d\'extraction', nature: 'extraction' }];
  reseaux.forEach(z => { z.auto = { nom: z.nom, nature: z.nature }; });
  items[0].genre = 'bouche-soufflage'; items[1].inclus = false; reseaux[0].nature = 'reprise';
  const regles = I.apprendre(items, reseaux, []);
  assert.strictEqual(regles.length, 3);
  // Dossier suivant : autre longueur, autre débit — même règle
  const suivant = [{ designation: 'Tronçon de soufflage DBB-RR-Z DN400 (longueur : 1000mm)', genre: 'bouche-extraction', categorie: 'emetteur', inclus: true }, { designation: 'Tourelle de désenfumage 6000 m3/h', genre: 'desenfumage', inclus: true }];
  const rs = [{ nom: 'Réseau de gaine d\'extraction', nature: 'extraction', hydro: false }];
  I.appliquerRegles(suivant, rs, regles);
  assert.deepStrictEqual([suivant[0].genre, suivant[0].appris, suivant[1].inclus, rs[0].nature], ['bouche-soufflage', true, false, 'reprise']);
});

test('tableau d\'équipements en annexe : repères, locaux, débits, puissances ; inventaire détaillé repère par repère', () => {
  const rows = [['Liste des équipements'], ['Repère', 'Désignation', 'Local', 'Débit (m3/h)', 'P froid (kW)', 'P chaud (kW)'],
    ['VC-01', 'Ventilo-convecteur cassette', 'Bureau 1', '450', '2,1', '2,5'], ['VC-02', 'Ventilo-convecteur cassette', 'Bureau 2', '650', '3', '3,4'], ['CTA-1', 'Centrale de traitement d\'air', 'Toiture', '3 500', '', '']];
  const a = I.tableauEquipements(rows, 'Annexe');
  assert.deepStrictEqual(a.map(x => [x.repere, x.genre, x.local, x.Q, x.Pfr, x.P]), [['VC-01', 'ventilo', 'Bureau 1', 450, 2.1, 2.5], ['VC-02', 'ventilo', 'Bureau 2', 650, 3, 3.4], ['CTA-1', 'cta', 'Toiture', 3500, NaN, NaN]]);
  // PDF : cellules séparées par des tabulations
  assert.strictEqual(I.tableauEquipements(rows.map(r => r.join('\t').split('\t'))).length, 3);
  const inv = [{ id: 'c0', categorie: 'emetteur', genre: 'ventilo', designation: 'Ventilo-convecteurs cassettes', qte: 2, prescrit: 'marque X', reseau: 'co', carac: { regimeFroid: '7/12' }, sources: ['CCTP art. 3.2'], inclus: true },
    { id: 'c1', categorie: 'emetteur', genre: 'cta', designation: 'CTA', qte: 1, repere: 'CTA-01', sources: ['CCTP art. 3.1'], inclus: true }];
  const f = I.fusionnerAnnexe(inv, a);
  assert.deepStrictEqual(f.map(x => [x.repere, x.local || '', x.reseau || '', x.prescrit || '', x.qte]), [['VC-01', 'Bureau 1', 'co', 'marque X', 1], ['VC-02', 'Bureau 2', 'co', 'marque X', 1], ['CTA-01', 'Toiture', '', '', 1]]);
  assert.strictEqual(f[2].Q, 3500, 'repère déjà connu (CTA-1 = CTA-01) : débit complété');
});

test('matériel retenu contrôlé face au CCTP : marque imposée, débit, puissance', () => {
  const CM = require('../etudes/public/js/catalogue-materiel');
  const inv = [{ categorie: 'emetteur', genre: 'cta', designation: 'CTA salle de restauration', prescrit: 'marque FLAKTGROUP, type CAIR', Q: 3500, P: '', carac: { Lw: 70 }, inclus: true },
    { categorie: 'producteur', genre: 'pac-eau', designation: 'PAC eau/eau', prescrit: 'marque EMICON ou équivalent', P: 60, inclus: true }];
  const cat = [{ fabricant: 'VIM', reference: 'CTA-3000', famille: 'cta', Qmin: 1000, Qmax: 3000, Lw: 75 }, { fabricant: 'Autre', reference: 'PAC-50', famille: 'pac', P: 50 }];
  const r = CM.controleCctp({ cle: 'aero|cta-df|3500', designation: 'CTA double flux restauration', fabricant: 'VIM', reference: 'CTA-3000' }, inv, cat);
  assert.deepStrictEqual(r.alertes.map(a => a.niveau), ['erreur', 'erreur', 'alerte']);
  assert.match(r.alertes[1].texte, /3500 m³\/h demandés.*3000/);
  const p = CM.controleCctp({ cle: 'gen|pac-eau|60', designation: 'PAC', fabricant: 'Autre', reference: 'PAC-50' }, inv, cat);
  assert.deepStrictEqual(p.alertes.map(a => [a.niveau, /équivalence|Puissance/.exec(a.texte)[0]]), [['info', 'équivalence'], ['erreur', 'Puissance']]);
});
