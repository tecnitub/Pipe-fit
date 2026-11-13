// Lecture des CCTP et DPGF étalonnée sur des mises en page variées : DPGF « quantitatif » à n° en tête de désignation et
// caractéristiques sur des lignes séparées, DPGF en plusieurs feuilles (zones, PSE) à puces « * » / « - », CCTP Word à
// numérotation romaine (équipements énumérés au texte, blocs « Modèle … : »), CCTP reconnu par OCR à numérotation à
// tirets, CCTP à chapitres « CHAPITRE III – » et tableaux de caractéristiques en colonnes ; recoupement des deux.
// Jeux d'essai fictifs construits ici (marques et valeurs inventées, aucun document réel).
const { test } = require('node:test');
const assert = require('node:assert');
const CL = require('../public/js/cctp-lecture');
const I = require('../public/js/inventaire-cvc');
const XLSX = require('../public/js/xlsx');

// DPGF « quantitatif » : en-tête de désignation décalé d'une colonne, n° en tête des titres, ouvrages sur plusieurs lignes
const L = (des, u = '', q = '') => ['', des, '', u, q, '', 0];
const DPGF_Q = [
  ['', 'Opération fictive'], [],
  ['', '', 'QUANTITATIF DE REFERENCE', 'U', 'Qtés', 'PU', 'Total HT'], [],
  L('III. CHAUFFAGE VENTILATION'), L('III.1.CHAUFFAGE'), L('III.1.1. Production de chauffage'),
  L('Neutralisation et dépose du circulateur existant'), L('suivant CCTP', 'Ens', 1), [],
  L('Circuit Primaire'), L('Départ / retour en ø76,1x2,9'), [],
  L('Pompe de charge double autorégulée'), L('type MAXI D 50/1-10 - ACME ou techniquement équivalent'),
  L('Puissance = 700 W'), L('Tension = Mono 230 V'), L('Débit  10,0 m3/h'), L('Pression = 3,0 mCE', 'U', 1), [],
  L('Prise de pression amont-aval avec manomètre', 'U', 1), [],
  L('Circuit n°1 Salle Bleue'), L('Départ / retour en ø42,4x2,6'), [],
  L('Pompe de charge double autorégulée'), L('type MAXI D 40/1-8 - ACME ou techniquement équivalent'),
  L('Puissance = 300 W'), L('Débit  2,0 m3/h'), L('Pression = 4,0 mCE', 'U', 1), [],
  L('Circuit n°2 panneaux rayonnants'), L('Départ / retour en ø33,7x2,6'), [],
  L('Pompe de charge double autorégulée'), L('type MAXI D 30/1-6 - ACME ou techniquement équivalent'),
  L('Puissance = 150 W'), L('Débit  1,0 m3/h'), L('Pression = 2,5 mCE', 'U', 1), [],
  L('Vase d\'expansion sous pression d\'azote ACME type VX 80'), L('ou équivalent avec purge suivant CCTP', 'Ens', 1),
  L('Sous-Total Production de chauffage'),
  L('III.1.2. Emission de chauffage Salle Bleue'),
  L('Aérochauffeur Modèle en Recyclage'), L('Aérochauffeur montage plafonnier'), L('Marque ACME AéroMax type AX 8 ou techniquement équivalent'),
  L('Pcalo : 60 kW, y compris ensemble accessoires hydrauliques et régulation', 'Ens', 1),
  L('Vanne 3 voies et set de montage, suivant CCTP.', 'U', 1), [],
  L('Aérochauffeur Modèle Introduction Air Neuf'), L('Aérochauffeur montage plafonnier'), L('Marque ACME AéroMax type AN 8 ou techniquement équivalent'),
  L('Pcalo : 55 kW, y compris ensemble accessoires hydrauliques et régulation', 'Ens', 1), [],
  L('Coffret de régulation marque ACME type REG 1'), L('ou techniquement équivalent y compris bus de raccordement'),
  L('des aérochauffeurs et coffret, suivant CCTP.', 'Ens', 1),
  L('III.1.3. Emission de chauffage des locaux'),
  L('Panneaux rayonnants plafonniers encastrés'), L('Marque MARQUE ou techniquement équivalent,'),
  L('Type PRX Dim : 1,2x0,6m - P : 400W', 'U', 4), L('Type PRX Dim : 2,4x0,6m - P : 800W', 'U', 6), [],
  L('Flexibles d\'alimentation suivant CCTP', 'Ens', 1),
  L('III.2.CANALISATIONS'), L('La nature des canalisations sera laissée au choix de l\'entreprise, réseaux d\'eau chaude.'),
  L('Tube acier en tarif 1 ou 10'), L('Ø 42,4x2,9', 'ml', 20),
  L('III.3.2 Ventilation Double Flux'),
  L('Centrale de traitement d\'air double flux'), L('De fabrication ACME ou techniquement équivalent'), L('Type : DF 20 ou techniquement équivalent'),
  L('à rendement de 85 %,'), L('Point à valider avant toute commande.'), L('Débit d\'air soufflé = 2000 m3/h'), L('Batterie Electrique 10 kW'),
  L('Composition suivant CCTP', 'U', 1),
  L('Report des défauts du caisson & CTA', 'Ens', 1),
  L('IV. PLOMBERIE SANITAIRE'), L('IV.4. EAU CHAUDE SANITAIRE'),
  L('Robinets ¼ de tour à purge'), L('DN 14', 'U', 12), L('DN 16', 'U', 4),
  L('Mitigeur centralisé en sortie de ballon suivant CCTP', 'Ens', 1),
  L('Chauffe-eau électrique, marquage CE'), L('Capacité 200L vertical sur socle', 'U', 1),
  L('IV.5. BOUCLAGE'), L('Pompe de bouclage marque ACME'), L('type BX 20 ou techniquement équivalent'), L('Puissance = 100 W maxi'), L('Débit = 0,5 m3/h'), L('Pression = 2,0 mCE', 'Ens', 1),
];

test('DPGF « quantitatif » : en-tête décalé, n° en tête des titres, caractéristiques sur des lignes séparées, déclinaisons', () => {
  const d = I.depuisDpgf(DPGF_Q);
  assert.ok(!d.erreur, d.erreur);
  const de = g => d.items.filter(x => x.genre === g);
  // Pompes : puissance électrique, débit et HMT des lignes séparées ; primaire ; circuit nommé par son titre ; bouclage sanitaire
  const p = de('pompe');
  assert.deepStrictEqual(p.map(x => [x.Pel, x.Q, x.carac.HMT, x.sources[0]]), [[0.7, 10, 3, 'DPGF III.1.1'], [0.3, 2, 4, 'DPGF III.1.1'], [0.15, 1, 2.5, 'DPGF III.1.1'], [0.1, 0.5, 2, 'DPGF IV.5']]);
  assert.ok(p[0].details.primaire && !p[1].details.primaire);
  assert.deepStrictEqual(p.slice(1, 3).map(x => x.details.circuit), ['Circuit n°1 Salle Bleue', 'Circuit n°2 panneaux rayonnants']);
  assert.ok(!p.some(x => /neutralisation|prise de pression/i.test(x.designation)), 'dépose et accessoires écartés');
  assert.strictEqual(d.reseaux.find(r => r.nom === 'Circuit n°1 Salle Bleue').nature, 'chauffage', 'circuit d\'un chapitre de chauffage');
  // Aérochauffeurs : puissance « Pcalo » ; le coffret de régulation n'en est pas un
  assert.deepStrictEqual(de('aerotherme').map(x => x.P), [60, 55]);
  assert.ok(d.items.some(x => x.genre === 'regulation' && /^Coffret/.test(x.designation)));
  // Panneaux rayonnants : une ligne par taille ; « Flexibles … » après une ligne vide n'en est pas une
  assert.deepStrictEqual(de('radiant').map(x => [x.qte, x.P]), [[4, 0.4], [6, 0.8]]);
  // CTA décrite sur plusieurs lignes (remarque au milieu) ; batterie électrique ; report de défauts : de la régulation
  assert.deepStrictEqual(de('cta').map(x => [x.Q, x.details.reference]), [[2000, 'DF 20']]);
  assert.ok(d.items.some(x => x.genre === 'regulation' && /^Report/.test(x.designation)));
  // Plomberie : robinetterie et mitigeur d'un chapitre « eau chaude sanitaire » : pas des ballons
  assert.deepStrictEqual(de('ecs').map(x => [x.designation.slice(0, 20), x.carac.volume]), [['Chauffe-eau électriq', 200]]);
  // Phrase du descriptif : pas un réseau
  assert.ok(!d.reseaux.some(r => /nature des canalisations/.test(r.nom)));
});

// CCTP du même dossier (PDF Word) : chapitres romains, « III.1.1.Titre » sans espace, équipements énumérés, blocs « Modèle … : »
const CCTP_W = [
  'Opération fictive', 'CCTP Lot n°9 CVP',
  'I.\tGENERALITES ......................................... 3', 'II.\tBASE DE L\'ETUDE ..................................... 10', 'III.\tDESCRIPTIF DES OUVRAGES CHAUFFAGE VENTILATION ........ 12',
  'I.1. OBJET DU DEVIS', 'Le présent document décrit les travaux.',
  'II.1.2. Ventilation mécanique à simple flux d\'extraction', 'Caisson d\'extraction de 6000 m3/h prévu en hypothèse.',
  'III.1. CHAUFFAGE',
  'III.1.1.Production de chauffage',
  'L\'origine de la production est la chaufferie existante.',
  'Le circuit primaire sera équipé',
  '1 pompe double de circulation à haut rendement, classe énergétique A, moteur E.C.M.',
  'équipé d\'un rotor à aimants permanents type MAXI', 'D 50/1-10 de fabrication ACME ou techniquement équivalent :',
  'Puissance absorbée : 700 W', 'Tension = Mono 230 V', 'Débit = 10,0 m3/h', 'Pression = 3,0 Mce',
  '1 jeu de vannes d\'isolement 1/4 de tour, amont et aval',
  'Le circuit alimentant le chauffage de la salle polyvalente sera équipé',
  '1 pompe double de circulation à haut rendement', 'Puissance absorbée : 300 W', 'Débit = 2,0 m3/h', 'Pression = 4,0 Mce',
  '1 jeu de vannes d\'isolement 1/4 de tour, amont et aval',
  'Le circuit alimentant les panneaux rayonnants sera équipé',
  '1 pompe double de circulation à haut rendement', 'Puissance absorbée : 150 W', 'Débit = 1,0 m3/h', 'Pression = 2,5 Mce',
  '1 vanne 3 voies motorisée DN 25 avec servo moteur.',
  'En local technique : 1 vase d\'expansion sous pression d\'azote, marque ACME type VX 80.',
  'Février 2026', 'CCTP Lot n°9 CVP\tPage: 27',
  'III.1.2.Emission de chauffage de la salle polyvalente',
  'Le chauffage de la salle est assuré par des aérochauffeurs plafonniers à eau chaude.',
  'Modèle en recyclage :',
  '•\tMarque et type :\t1 x ACME AéroMax® AX 8 ou techniquement équivalent', '•\tDébit d\'air nominal:\t8000 m3/h', '•\tPuissance électrique:\t1,2 kW', '•\tPuissance calorifique: 60 kW', '•\tRégime d\'eau 70/50°C',
  'Modèle avec introduction d\'air neuf :',
  '•\tMarque et type :\t1 x ACME AéroMax® AN 8 ou techniquement équivalent', '•\tDébit d\'air nominal:\t8000 m3/h', '•\tPuissance électrique:\t1,5 kW', '•\tPuissance calorifique: 55 kW',
  'III.1.3.Emission de chauffage des locaux',
  'Pour l\'ensemble des locaux, les corps de chauffe sont des panneaux rayonnants encastrés en plafond (régime 70/50°C).',
  'Fabrication MARQUE ou techniquement équivalent modèle PRX.',
  'III.3.2. Ventilation Double flux des locaux',
  'Centrale double flux de fabrication ACME type DF 20, débit 2000 m3/h.', 'Batterie électrique de post-chauffe : puissance absorbée maxi = 3 100 W.',
  'Diffuseurs : Nombre : 3 sur chaque gaine.',
];

test('CCTP Word : chapitres de généralités et de base de l\'étude écartés, équipements énumérés au texte, blocs de caractéristiques', () => {
  const a = CL.analyser(CCTP_W);
  assert.ok(a.articles.some(x => x.num === 'III.1.1' && x.titre === 'Production de chauffage'), '« III.1.1.Titre » sans espace');
  assert.ok(!a.equipements.some(e => /^(?:I|II)\./.test(e.article)), 'généralités et base de l\'étude');
  const ic = I.depuisCctp(a.equipements, I.reseauxCctp(a), a.articlesDetail);
  const p = ic.filter(x => x.genre === 'pompe');
  assert.deepStrictEqual(p.map(x => [x.Pel, x.Q, x.carac.HMT]), [[0.7, 10, 3], [0.3, 2, 4], [0.15, 1, 2.5]]);
  assert.match(p[0].designation, /^Pompe double de circulation à haut rendement — circuit primaire$/);
  assert.deepStrictEqual(p.slice(1).map(x => x.details.circuit), ['circuit alimentant le chauffage de la salle polyvalente', 'circuit alimentant les panneaux rayonnants']);
  assert.match(p[0].prescrit, /ACME/);
  // Deux aérochauffeurs (un par bloc « Modèle … : ») avec leur puissance, leur débit et leur modèle
  const ae = ic.filter(x => x.genre === 'aerotherme');
  assert.deepStrictEqual(ae.map(x => [x.P, x.Q, x.details.reference]), [[60, 8000, 'AX 8'], [55, 8000, 'AN 8']]);
  // Panneaux rayonnants reconnus au texte d'un titre « Émission de chauffage des locaux »
  assert.ok(ic.some(x => x.genre === 'radiant' && x.regime === '70/50'));
  // CTA : « 3 100 W » ; « Nombre : 3 sur chaque gaine » n'est pas sa quantité
  const cta = ic.find(x => x.genre === 'cta');
  assert.strictEqual(cta.qte, 1);
  assert.ok(!ic.some(x => x.genre === 'ventilateur'), 'caisson de la base de l\'étude écarté');
});

test('recoupement CCTP Word / DPGF « quantitatif » : pompes appariées une à une, aérochauffeurs, panneaux détaillés', () => {
  const a = CL.analyser(CCTP_W), d = I.depuisDpgf(DPGF_Q);
  const c = I.depuisCctp(a.equipements, I.reseauxCctp(a), a.articlesDetail);
  const inv = I.fusionner(c, d.items);
  const deux = x => x.sources.some(s => /^CCTP/.test(s)) && x.sources.some(s => /^DPGF/.test(s));
  const p = inv.filter(x => x.genre === 'pompe' && deux(x));
  assert.strictEqual(p.length, 3, 'trois pompes du CCTP, trois lignes du DPGF');
  assert.deepStrictEqual(p.map(x => x.Q).sort((x, y) => x - y), [1, 2, 10], 'chaque ligne sur la pompe de même débit');
  assert.ok(inv.filter(x => x.genre === 'aerotherme').every(deux));
  assert.ok(inv.filter(x => x.genre === 'radiant').length === 2 && inv.filter(x => x.genre === 'radiant').every(deux));
  const ec = I.ecarts(inv);
  assert.ok(!ec.some(e => e.type === 'marque'), 'marque écrite plus ou moins longue : pas un écart');
  assert.ok(!ec.some(e => e.champ === 'circuit'), 'circuit (déduit) : pas un écart');
  // Schéma : pompes sur les circuits du DPGF
  I.rattacher(inv, I.fusionnerReseaux(I.reseauxCctp(a), d.reseaux, inv));
  assert.ok(inv.filter(x => x.genre === 'aerotherme').every(x => /circuit n 1 salle bleue/.test(x.reseau)));
});

// DPGF en plusieurs feuilles : page de garde, deux zones, PSE, récapitulatif ; « * Fourniture … » puis « - … »
const ENT = ['DESIGNATION DES TRAVAUX', 'Q', 'UNITE', 'PRIX UNITAIRE', 'MONTANT HT'];
const zone = (nom, nCta, cassettes) => ({ name: nom, rows: [['RÉNOVATION FICTIVE'], ['D.P.G.F. LOT N°8'], ENT, [nom], [],
  ['CHAPITRE II - DESCRIPTION DES TRAVAUX DE NEUTRALISATION'], ['II-01 - NEUTRALISATION / DEPOSE / REPOSE'],
  ['* Dépose et évacuation : zone'], ['  - appareils et accessoires correspondants', 3, 'ens'], ['  - ballon ECS électrique (provision)', 1, 'ens'],
  ['TOTAL HT ARTICLE II-01', '', '', '', 0],
  ['CHAPITRE III - DESCRIPTION DES INSTALLATIONS DE VENTILATION'], ['III-02 - VENTILATION DOUBLE FLUX'], ['III-02.2 - Centrale double flux'],
  ...Array.from({ length: nCta }, () => [['* Fourniture et mise en œuvre de l\'ensemble de l\'installation comprenant :'], [' - centrale double flux entièrement équipée avec filtres, batterie électrique', 1, 'ens'], ['- piège à son rectangulaire', 2, 'ens']]).flat(),
  ['III-02.3 - Bouches de soufflage et d\'extraction'], ['Soufflage'], ['* Bouches de soufflage montage plafond série ACME 300'], ['- débit 30 m3/h Ø125 + MR', 8, 'U'], ['- débit 50 m3/h Ø125 + MR', 4, 'U'],
  ['Reprise'], ['* Grille de diffusion murale à ailettes mobiles, registre de régulation'], ['- débit 100 m3/h', 2, 'U'],
  ['CHAPITRE IV - DESCRIPTION DES INSTALLATIONS DE CLIMATISATION'], ['IV-02 - CHAUFFAGE/CLIMATISATION A VOLUME DE REFRIGERANT VARIABLE'],
  ['IV-02.3 - Unités intérieures'], ['* Fourniture et mise en œuvre des unités intérieures y compris pompe de relevage'],
  ...cassettes.map(([m, q]) => [`- cassette 4 voies MOD ${m}`, q, 'ens']),
  ['TOTAL HT ARTICLE IV-02', '', '', '', 0], ['RECAPITULATION'], ['III-02 - VENTILATION DOUBLE FLUX', '', '', '', 0]] });
const FEUILLES = [{ name: 'PDG', rows: [['DÉCOMPOSITION DU PRIX GLOBAL ET FORFAITAIRE'], ['Lot 13']] },
  zone('TF - Zone A', 2, [['07', 6], ['12', 2]]), zone('TF - Zone B', 1, [['07', 4]]),
  { name: 'PSE', rows: [['RÉNOVATION FICTIVE'], ENT, ['PRESTATION(S) SUPPLEMENTAIRE(S) EVENTUELLE(S)'], ['PSE 13.1 - POMPE D\'ARROSAGE'], ['* Fourniture et mise en œuvre du système'], ['   - pompe d\'arrosage y compris accessoires', 1, 'ens']] },
  { name: 'Recap', rows: [['RÉNOVATION FICTIVE'], ENT, ['RECAPITULATIF'], ['TF - Zone A', '', '', '', 0], ['TF - Zone B', '', '', '', 0]] }];

test('DPGF en plusieurs feuilles : zones réunies, PSE en variante, page de garde et récapitulatif écartés ; puces et dépose', () => {
  const d = I.depuisFeuilles(FEUILLES);
  assert.deepStrictEqual(d.feuilles, ['TF - Zone A', 'TF - Zone B', 'PSE']);
  const de = g => d.items.filter(x => x.genre === g && !x.variante);
  assert.deepStrictEqual(de('cta').map(x => [x.zone, x.sources[0]]), [['TF - Zone A', 'DPGF III.2.2'], ['TF - Zone A', 'DPGF III.2.2'], ['TF - Zone B', 'DPGF III.2.2']]);
  assert.deepStrictEqual(de('bouche-soufflage').map(x => [x.Q, x.qte]), [[30, 8], [50, 4], [30, 8], [50, 4]]);
  assert.deepStrictEqual(de('bouche-extraction').map(x => x.Q), [100, 100], 'grille de reprise, pas de la régulation');
  assert.deepStrictEqual(de('split').map(x => x.qte), [6, 2, 4], 'cassettes d\'un chapitre à débit de réfrigérant variable : unités intérieures');
  assert.ok(!d.items.some(x => x.genre === 'ecs'), 'ballon déposé : pas un équipement');
  assert.ok(!d.items.some(x => x.genre === 'pompe' && !x.variante), 'pompe de relevage citée : pas une pompe');
  assert.ok(d.items.some(x => x.genre === 'pompe' && x.variante && x.inclus !== true), 'PSE : variante');
  // Une seule feuille d'ouvrages : lue telle quelle
  assert.strictEqual(I.depuisFeuilles([FEUILLES[0], FEUILLES[1]]).items.every(x => !x.zone), true);
});

// CCTP à chapitres « CHAPITRE III – … », articles « III – 02.2 », sommaire à traits, tableaux en colonnes (lignes à tabulations)
const CCTP_T = [
  'RÉNOVATION FICTIVE', 'C.C.T.P. LOT N°8', 'SOMMAIRE',
  'CHAPITRE I – GENERALITES _______________________ 4', '   I – 01     OBJET ___________________________ 4',
  'CHAPITRE III – DESCRIPTION DES INSTALLATIONS DE VENTILATION _____ 18', '   III – 02 VENTILATION DOUBLE FLUX ______ 20',
  'CHAPITRE IV – DESCRIPTION DES INSTALLATIONS DE CLIMATISATION _____ 30',
  'I – 01 OBJET', 'Le présent descriptif a pour objet la centrale de traitement d\'air et les unités extérieures.',
  'III – 02 VENTILATION DOUBLE FLUX',
  'III – 02.1 Généralités', 'Les centrales double flux CTA seront raccordées aux gaines.',
  'III – 02.2 Centrales de VMC double flux',
  'L\'équipement comprendra :', '• centrale d\'air double flux, moteurs EC basse consommation,',
  '• batterie électrique :', '− anti-givre,', '− post chauffage afin d\'insuffler l\'air à 20°C en hiver,',
  '• équipements de détection de fumée (débit sup. à 10 000 m3/h) → sans objet,',
  '• Caractéristiques des centrales :',
  'Zone Nord\tZone Sud', 'CTA n°1\tCTA n°2', 'Marque :\tACME\tACME', 'Type :\tDF 300\tDF 500',
  '3\t3', 'Débit max./max foisonné\t2 000 / 1 500 m /h\t3 000 / 3 000 m /h', 'soufflage :',
  'Pression nominale :\t300 Pa\t400 Pa', 'Puissance antigivre\t6 kW\t9 kW',
  'Dossier n° X\tPage 21',
  'IV – 02 CHAUFFAGE/CLIMATISATION A VOLUME DE REFRIGERANT VARIABLE',
  'IV – 02.2 Unités extérieures',
  'Unités extérieures réversibles à condensation par air, marque ACME ou équivalent.',
  'Groupe extérieur\tGroupe extérieur', 'Locaux desservis\tZone A\tZone B', 'Référence\tACME 072\tACME 108',
  '- Puissance frigorifique nominale\tkW\t18\t27', '- Puissance calorifique nominale\tkW\t25\t37,5', '- Débit d’air max\tm3/h\t8 000\t12 000',
];

test('CCTP à chapitres « CHAPITRE III – » : articles « III – 02.2 », généralités écartées, un équipement par colonne de tableau', () => {
  const a = CL.analyser(CCTP_T);
  assert.strictEqual(a.chapitres.I, 'GENERALITES');
  assert.ok(a.articles.some(x => x.num === 'III.2.2' && x.titre === 'Centrales de VMC double flux'));
  assert.ok(!a.equipements.some(e => e.article === 'III.2.1' || e.article === 'I.1'), '« Généralités » : pas un équipement');
  const ic = I.depuisCctp(a.equipements, I.reseauxCctp(a), a.articlesDetail);
  const cta = ic.filter(x => x.genre === 'cta');
  assert.deepStrictEqual(cta.map(x => [x.repere, x.local, x.Q, x.details.reference]), [['CTA-1', 'Zone Nord', 2000, 'DF 300'], ['CTA-2', 'Zone Sud', 3000, 'DF 500']]);
  assert.deepStrictEqual(cta.map(x => [Number.isFinite(x.P), x.details.PelBe]), [[false, 6], [false, 9]], 'batterie électrique seule : puissance de la batterie');
  assert.ok(cta.every(x => x.alim === 'electrique'), 'moteurs EC : pas de l\'eau chaude');
  const ue = ic.filter(x => x.genre === 'split');
  assert.deepStrictEqual(ue.map(x => [x.designation, x.local, x.Pfr, x.P]), [['Unités extérieures — ACME 072', 'Zone A', 18, 25], ['Unités extérieures — ACME 108', 'Zone B', 27, 37.5]]);
});

test('recoupement : équipements d\'un même article chiffrés dans plusieurs zones, tous rattachés à l\'article', () => {
  const a = CL.analyser(CCTP_T), d = I.depuisFeuilles(FEUILLES);
  const inv = I.fusionner(I.depuisCctp(a.equipements, I.reseauxCctp(a), a.articlesDetail), d.items);
  const cta = inv.filter(x => x.genre === 'cta');
  assert.strictEqual(cta.length, 3);
  assert.ok(cta.every(x => x.sources.some(s => s === 'CCTP art. III.2.2') && x.sources.some(s => s === 'DPGF III.2.2')));
  assert.ok(!I.ecarts(inv).some(e => e.type === 'absent-cctp' && /centrale/.test(e.designation)));
});

// CCTP reconnu par OCR : numérotation à tirets, sommaire à points, « kKW », qualificatif après la valeur
const CCTP_OCR = [
  '1 - GENERALITES', '1-1 OBJET ET ETENDUE DES TRAVAUX .. 3', '3 - PRINCIPE GENERAL DES TRAVAUX', '4 - CHAUFFAGE/ RAFRAICHISSEMENT', '6 - VENTILATION/ TRAITEMENT D\'AIR',
  '1-1 OBJET ET ETENDUE DES TRAVAUX', 'Le présent lot comprend la thermofrigopompe et les CTA.',
  '3-3 DESENFUMAGE', 'Extraction mécanique par un extracteur de désenfumage en toiture.',
  '4-3 PRODUCTION DE CHAUD/ FROID PAR THERMOFRIGOPOMPE AIR/ EAU',
  '4-3-1 Thermofrigopompe air/eau', 'La production sera assurée par thermofrigopompe (TFP) air/ eau de type ACME TX90 ou similaire.',
  '- Une puissance en chaud de 90,5kKW (60/40) et 60 KW froid (7/12).',
  '4-4-4 Remplissage', 'Remplissage du circuit de la PAC depuis le réseau d\'eau.',
  '4-5-3 Batteries CTA', 'Les batteries à eau des CTA sont raccordées au réseau.',
  '4-5-4 Aérotherme électrique : local atelier', 'Aérotherme électrique de 3 kW.',
  '6-7 VENTILATION LOCAL TECHNIQUE CTA / SOUS-STATION', 'Extracteur de 500 m3/h en façade.',
];

test('CCTP reconnu par OCR : numérotation à tirets, chapitre de principes écarté, prestations et accessoires écartés', () => {
  const a = CL.analyser(CCTP_OCR);
  assert.ok(a.articles.some(x => x.num === '4.3.1' && x.titre === 'Thermofrigopompe air/eau'));
  assert.strictEqual(a.articles.find(x => x.num === '1.1').titre, 'OBJET ET ETENDUE DES TRAVAUX', 'sommaire « .. 3 »');
  const ic = I.depuisCctp(a.equipements, I.reseauxCctp(a), a.articlesDetail);
  const tfp = ic.find(x => x.genre === 'pac-eau');
  assert.deepStrictEqual([tfp.P, tfp.Pfr], [90.5, 60], '« 90,5kKW » et « 60 KW froid »');
  assert.ok(!ic.some(x => x.genre === 'desenfumage'), 'chapitre « Principe général » : pas d\'équipement');
  assert.ok(!ic.some(x => /Remplissage|Batteries/.test(x.designation)));
  assert.strictEqual(ic.find(x => x.genre === 'aerotherme').alim, 'electrique');
  assert.strictEqual(ic.find(x => /LOCAL TECHNIQUE/.test(x.designation)).genre, 'ventilateur', 'ventilation d\'un local : ni une CTA ni une sous-station');
  // DPGF à n° à tirets : rapproché par la numérotation commune
  const d = I.depuisDpgf([['Article', 'Désignation des ouvrages', 'U', 'Qté'], ['4-3-1', 'Thermofrigopompe (TFP) Air/ eau', '', ''], ['', 'Thermofrigopompe type TX90 de marque ACME ou équivalent', 'u', 1]]);
  const inv = I.fusionner(ic, d.items);
  assert.ok(inv.find(x => x.genre === 'pac-eau').sources.includes('DPGF 4.3.1'));
});

test('n° en tête de désignation, puissances écrites autrement, cellules fusionnées d\'un .xlsx', () => {
  assert.deepStrictEqual(['III.1.1. Production', 'III-02.2 - Centrale', 'CHAPITRE IV - CLIMATISATION', 'I – 03.1   Branchement', 'IV. PLOMBERIE', '1 pompe double', '2 fils', 'Vi sur place'].map(t => (I.numeroEnTete(t) || {}).num || ''),
    ['III.1.1', 'III.2.2', 'IV', 'I.3.1', 'IV', '', '', '']);
  assert.deepStrictEqual(I.puissances('Puissance absorbée maxi = 3 100 W'), { Pel: 3.1 });
  assert.deepStrictEqual(I.puissances('Pcalo : 62,5 kW'), { Pch: 62.5 });
  assert.deepStrictEqual(I.puissances('12 kW électrique'), { Pel: 12 });
  const rows = [['A', 'B', 'C'], ['visible', 'caché', 'x']];
  XLSX.masquerFusion(rows, 1, 1, 0, 1);
  assert.deepStrictEqual(rows[1], ['visible', '', 'x']);
});

// CCTP de plomberie : un article « Production d'ECS » qui regroupe trois modèles de ballons ; DPGF par zone, une ligne par capacité
const CCTP_ECS = [
  'C.C.T.P. LOT N°7 – PLOMBERIE', 'CHAPITRE I – PLOMBERIE SANITAIRE',
  'I – 04 PRODUCTION D\'EAU CHAUDE SANITAIRE',
  'I – 04.1 Généralités', 'Les ballons seront positionnés au plus près des points de puisage.',
  'I – 04.2 Ballons à semi-accumulation', 'Les ballons seront de type MINI 40 litres de ACME ou équivalent :', 'Puissance 2000 W',
  'I – 04.3 Chauffe-eau de petite capacité', 'Ballon ECS type PETIT 15 litres de ACME ou équivalent :', '- Puissance absorbée : 2000W,',
  'I – 04.4 Ballons électriques à accumulation', 'Les besoins d\'ECS sont estimés à 30 litres d\'ECS à 60 °C / douche.', 'Ballon ECS type GRAND 300 litres de ACME ou équivalent.',
];
const zoneEcs = (nom, lignes) => ({ name: nom, rows: [['DPGF FICTIF'], ['DESIGNATION DES TRAVAUX', 'Q', 'UNITE', 'PRIX UNITAIRE', 'MONTANT HT'], [nom],
  ['CHAPITRE I - PLOMBERIE'], ['I-04 - PRODUCTION D\'EAU CHAUDE SANITAIRE'], ['* Fourniture et mise en œuvre de ballon ECS électrique y compris raccordements :'], ...lignes.map(([v, q]) => [`   - capacité ${v} litres`, q, 'ens'])] });

test('ECS : modèles distincts sous un même article, besoin par douche pas une capacité, lignes du DPGF par capacité et par zone', () => {
  const a = CL.analyser(CCTP_ECS);
  const ic = I.depuisCctp(a.equipements, I.reseauxCctp(a), a.articlesDetail);
  assert.deepStrictEqual(ic.map(x => [x.genre, x.carac.volume, x.sources[0]]), [['ecs', 40, 'CCTP art. I.4.2'], ['ecs', 15, 'CCTP art. I.4.3'], ['ecs', 300, 'CCTP art. I.4.4']]);
  const d = I.depuisFeuilles([zoneEcs('Zone A', [[15, 1], [40, 1], [300, 1]]), zoneEcs('Zone B', [[15, 9], [40, 1]])]);
  const inv = I.fusionner(ic, d.items);
  assert.strictEqual(inv.length, 5);
  inv.forEach(x => assert.ok(x.sources.some(s => /^CCTP/.test(s)) && x.sources.some(s => /^DPGF/.test(s)), x.designation));
  const art = v => inv.filter(x => x.carac.volume === v).map(x => x.sources.find(s => /^CCTP/.test(s)));
  assert.deepStrictEqual([art(15), art(40), art(300)], [['CCTP art. I.4.3', 'CCTP art. I.4.3'], ['CCTP art. I.4.2', 'CCTP art. I.4.2'], ['CCTP art. I.4.4']]);
  assert.ok(!I.ecarts(inv).some(e => e.type === 'valeur' || e.type === 'absent-cctp'));
});

test('référence : libellé « Type = » avant un « de type » du texte, marque en tête retirée, en-tête « Marque/Type » ; pompes de bouclage énumérées', () => {
  const det = t => I.details(t, '').reference;
  assert.strictEqual(det('Un registre motorisé sur l\'air neuf de type CLAP étanche. Type = ACME Modèle DF 100-R ou équivalent, de fabrication ACME.'), 'DF 100-R');
  assert.strictEqual(det('Caisson de fabrication ACME. Type = ACME EasyFan Micro + 8000 ou équivalent.'), 'EasyFan Micro');
  assert.strictEqual(det('Ballon ECS type GRAND 300 litres ; console pour le modèle 100 litres.'), 'GRAND 300');
  assert.strictEqual(det('N° Zone Débit Marque/Type Alimentation V1 Sanitaires'), undefined);
  const r = I.provenance({ details: { reference: 'ACME EasyFan Micro' }, sources: ['CCTP art. 1'] }, [{ details: { reference: 'EasyFAN Compact Micro+' }, sources: ['DPGF 1'] }]);
  assert.ok(!(r.conflits || []).some(k => k.champ === 'reference'), 'même gamme écrite autrement');
  const a = CL.analyser(['CHAPITRE IV – PLOMBERIE', 'IV – 05 BOUCLAGE', 'Un réseau de bouclage sera réalisé.', 'Il sera prévu :',
    '2 pompes de circulation à haut rendement, moteur E.C.M. équipé d\'un rotor', 'type MAXI D 32 de fabrication ACME ou équivalent :', 'Puissance = 310 W maxi', 'Débit = 0,9 m3/h']);
  const p = I.depuisCctp(a.equipements, I.reseauxCctp(a), a.articlesDetail).filter(x => x.genre === 'pompe');
  assert.deepStrictEqual(p.map(x => [x.qte, x.Pel, x.Q, x.details.circuit]), [[2, 0.31, 0.9, 'BOUCLAGE']]);
});

test('CCTP : tableau à une ligne par équipement (repère, zone, débit, marque / type), ligne coupée recollée ; DPGF apparié par repère', () => {
  const a = CL.analyser(['6 - VENTILATION', '6-6 VENTILATION SIMPLE FLUX', '6-6-4 Extracteurs ventilations simple flux',
    'N° Zone Débit Marque/Type Alimentation', 'V1 Sanitaires 300 m3/h ACME / FX 04 TRI | Lot ELEC', 'Entretien /', 'V2 Stock / Archive 1400 m3/h ACME / FX 12 | Lot ELEC',
    'LE Local ménage', '50 m3/h ACME / FX 01 | Lot ELEC', 'Les extracteurs présenteront les caractéristiques suivantes :', '- caisson en tôle galvanisée.']);
  const ic = I.depuisCctp(a.equipements, I.reseauxCctp(a), a.articlesDetail);
  assert.deepStrictEqual(ic.map(x => [x.genre, x.repere, x.Q, x.details.reference, x.details.marque]), [['ventilateur', 'V1', 300, 'FX 04 TRI', 'ACME'], ['ventilateur', 'V2', 1400, 'FX 12', 'ACME'], ['ventilateur', 'LE', 50, 'FX 01', 'ACME']]);
  const d = I.depuisDpgf([['Article', 'Désignation', 'U', 'Qté'], ['6-6-4', 'Extracteurs ventilations simple flux', '', ''],
    ['', 'Extracteur V2 type FX 12 de ACME ou équivalent', 'u', 1], ['', 'Extracteur V1 type FX 04 de ACME ou équivalent', 'u', 1], ['', 'Extracteur LE type FX 01 de ACME ou équivalent', 'u', 1]]);
  const inv = I.fusionner(ic, d.items).filter(x => x.genre === 'ventilateur');
  assert.strictEqual(inv.length, 3);
  assert.deepStrictEqual(inv.map(x => [x.repere, x.Q, x.sources.length]), [['V1', 300, 2], ['V2', 1400, 2], ['LE', 50, 2]]);
});

test('note de dimensionnement : charges du local pas des puissances, sous-article qui nomme l\'équipement prioritaire', () => {
  assert.deepStrictEqual(I.puissances('Hiver : Déperditions statiques = 3.1 KW. 20 p en représentation = 250 W dont 140 W latent. Puissance rafraichissement de la CTA : o Total: 38.2 kW'), { Pfr: 38.2 });
  const a = CL.analyser(['6 - VENTILATION', '6-4 VENTILATION DOUBLE FLUX — SALLE FICTIVE [CTA 2]',
    'Il sera installé une centrale de traitement d\'air dédiée à la salle.', 'Evaporation maximale à traiter : soit 3900 m3/h d\'air recyclé.',
    '6-4-1 Centrale de ventilation double flux', 'L\'entreprise installera une centrale de ventilation double flux de 3000 m3/h type ACME DF ou équivalent.']);
  const cta = I.depuisCctp(a.equipements, I.reseauxCctp(a), a.articlesDetail).filter(x => x.genre === 'cta');
  assert.deepStrictEqual(cta.map(x => [x.Q, x.sources.length]), [[3000, 2]]);
});

test('CCTP : ventilation naturelle ou raccordée à un autre extracteur, article d\'émetteurs détaillé par ses sous-articles', () => {
  const a = CL.analyser(['4 - CHAUFFAGE', '4-5 EMISSION', '4-5-2 Ventilo-convecteurs', 'Les ventilo-convecteurs seront de marque ACME, régime 7/12 °C.',
    '4-5-2-2 Ventilo-convecteur 2 tubes / 2 fils', 'Ventilo-convecteur gainable 2 tubes avec batterie électrique.',
    '6 - VENTILATION', '6-7 VENTILATION LOCAL TECHNIQUE CTA', 'Ce local technique sera ventilé naturellement par grilles.',
    '6-8 VENTILATION LOCAL ONDULEUR', 'Extraction par bouche de 30 m3/h, raccordement sur l\'extracteur V1.',
    '6-9 VENTILATION LOCAL POUBELLES', 'Un extracteur de 200 m3/h en façade.']);
  const ic = I.depuisCctp(a.equipements, I.reseauxCctp(a), a.articlesDetail);
  assert.deepStrictEqual(ic.filter(x => x.genre === 'ventilateur').map(x => x.sources[0]), ['CCTP art. 6.9']);
  const vc = ic.filter(x => x.genre === 'ventilo');
  assert.deepStrictEqual(vc.map(x => [x.sources[0], x.regime]), [['CCTP art. 4.5.2.2', '7/12']]);
  assert.match(vc[0].prescrit, /ACME/);
});

test('recoupement par niveau : la ligne d\'une feuille « Zone R+2 » va à la colonne « R+2 » du CCTP ; ligne en plus : détails du CCTP gardés', () => {
  const a = CL.analyser(CCTP_T.map(l => l.replace('Zone Nord\tZone Sud', 'R+2 Nord\tRDC Sud')));
  const ic = I.depuisCctp(a.equipements, I.reseauxCctp(a), a.articlesDetail).filter(x => x.genre === 'cta');
  assert.deepStrictEqual(ic.map(x => x.local), ['R+2 Nord', 'RDC Sud']);
  // Modèle écrit au DPGF : la ligne du RDC appariée à la colonne du R+2 donnerait un écart de référence
  const modele = (f, m) => ({ ...f, rows: f.rows.map(r => (/^ - centrale double flux/.test(r[0]) ? [`${r[0]}, type ${m}`, ...r.slice(1)] : r)) });
  const d = I.depuisFeuilles([modele(zone('TF - Zone RDC', 1, []), 'DF 500'), modele(zone('TF - Zone R+2', 1, []), 'DF 300'), zone('TC - Zone R+1', 1, [])]);
  const inv = I.fusionner(ic, d.items).filter(x => x.genre === 'cta');
  assert.deepStrictEqual(inv.map(x => [x.repere || '', x.zone || x.local]), [['CTA-1', 'R+2 Nord'], ['CTA-2', 'RDC Sud'], ['', 'TC - Zone R+1']]);
  assert.ok(!inv.some(x => (x.conflits || []).some(k => k.champ === 'reference')), 'chaque ligne sur la colonne de son niveau');
  assert.strictEqual(inv[2].details.batteries.elec, ic[0].details.batteries.elec, 'batterie électrique comme au CCTP');
});

test('CCTP : « Spécifications techniques particulières » d\'un chapitre de désenfumage, référence de l\'équipement et non de l\'accessoire', () => {
  const a = CL.analyser(['7 - DESENFUMAGE MECANIQUE DU HALL', '7-1 SPECIFICATIONS TECHNIQUES GENERALES', 'Les installations respecteront la réglementation.',
    '7-2 SPECIFICATIONS TECHNIQUES PARTICULIERES', 'Extraction mécanique avec caisson de désenfumage en toiture.',
    '- Volet tunnel, montage horizontal, dans local technique VTP de type ACME VT120 900 x 450 mm', '- conduit en eau glacée hors lot,',
    'Le caisson d\'extraction de désenfumage de type FUMEX F400 de ACME ou similaire avec :', '- Caisson tôle acier galvanisée']);
  const ic = I.depuisCctp(a.equipements, I.reseauxCctp(a), a.articlesDetail);
  assert.deepStrictEqual(ic.map(x => [x.genre, x.sources[0], x.details.reference, x.alim]), [['desenfumage', 'CCTP art. 7.2', 'FUMEX F400', '']]);
  assert.match(ic[0].designation, /^Desenfumage mecanique du hall$/);
});

test('CTA : « Batterie électrique 12,4 kW » du DPGF n\'est pas la puissance des ventilateurs', () => {
  const d = I.depuisDpgf([['N°', 'Désignation', 'U', 'Qté'], ['3.2', 'Centrale double flux de marque ACME type DF 100, débit 2800 m3/h, Batterie Electrique 12,4 kW', 'U', 1]]);
  const cta = d.items.find(x => x.genre === 'cta');
  assert.deepStrictEqual([Number.isFinite(cta.Pel), cta.details.PelBe], [false, 12.4]);
});

test('débit : un seuil réglementaire (« débit sup. à 10 000 m3/h ») n\'est pas celui de l\'appareil', () => {
  assert.strictEqual(I.caracteristiques('détection de fumée (débit sup. à 10 000 m3/h) sans objet ; débit nominal 1 850 m3/h').Q, 1850);
});

test('batteries : un document qui en nomme moins ne contredit pas l\'autre ; eau chaude contre électrique reste un écart', () => {
  const conflit = (bc, bd) => (I.provenance({ details: { batteries: bc }, sources: ['CCTP art. 1'] }, [{ details: { batteries: bd }, sources: ['DPGF 1'] }]).conflits || []).some(k => k.champ === 'batteries');
  assert.strictEqual(conflit({ co: true, elec: 'appoint' }, { elec: 'chaude' }), false);
  assert.strictEqual(conflit({ froide: true }, { chaude: true, froide: true }), false);
  assert.strictEqual(conflit({ chaude: true }, { elec: 'chaude' }), true);
  // Recoupées : la CTA garde toutes les batteries citées
  const inv = I.fusionner([{ categorie: 'emetteur', genre: 'cta', designation: 'Centrale salle', qte: 1, P: NaN, Pfr: NaN, Pel: NaN, Q: NaN, carac: {}, details: { batteries: { froide: true } }, sources: ['CCTP art. 6.4'] }],
    [{ categorie: 'emetteur', genre: 'cta', designation: 'Centrale salle', qte: 1, P: NaN, Pfr: NaN, Pel: NaN, Q: NaN, carac: {}, details: { batteries: { chaude: true, froide: true } }, sources: ['DPGF 6.4'] }]);
  assert.deepStrictEqual(inv[0].details.batteries, { chaude: true, froide: true });
});

test('DPGF sans libellé de désignation, codes « 2,1.1 », plafond réglementaire et titres de prestation du CCTP', () => {
  // En-tête « Code | (vide) | | | Unité | Quantité | P.U. HT | Montant HT » : désignation = colonne qui porte les textes
  const L = (code, des, u = '', q = '') => [code, des, '', '', u, q, '', ''];
  const rows = [['', '', '', 'D.P.G.F'], ['Dossier fictif'], [], ['Code', '', '', '', 'Unité', 'Quantité', 'P.U. HT', 'Montant HT'],
    L('2', 'DESCRIPTIF TECHNIQUE'), L('2.3', 'Mise en place d\'une nouvelle production de chauffage'),
    L('2,3.1', 'Chaudière murale gaz.'), L('', 'Chaudière gaz 30 kW suivant CCTP', 'Ens', 2), L('', 'Sonde extérieure', 'U', 1),
    L('2,3.2', 'Kit pour montage en cascade.'), L('', 'suivant CCTP', 'Ens', 1),
    L('2,3.5', 'Circulateur du réseau secondaire.'), L('', 'Double circulateurs suivant CCTP', 'U', 1),
    L('2,3.7', 'Autres accessoires'), L('', 'Vase d\'expansion', 'U', 1), L('', 'Soupape de sécurité', 'U', 2)];
  const d = I.depuisDpgf(rows);
  assert.ok(!d.erreur, d.erreur);
  const ch = d.items.find(x => x.genre === 'chaudiere-gaz');
  assert.deepStrictEqual([ch.qte, ch.P], [2, 30]);
  assert.ok(ch.sources[0].includes('2.3.1'), 'code « 2,3.1 » lu « 2.3.1 »');
  assert.ok(d.items.some(x => x.genre === 'pompe') && d.items.some(x => x.genre === 'vase'));
  // Plafond réglementaire : pas la puissance de la chaudière
  assert.deepStrictEqual(I.puissances('Puissance utile : 30 kW. Attention la somme des puissances utiles des deux chaudières devra être inférieure ou égale à 70 kW.'), { P: 30 });
  // CCTP : titres de prestation ou d'accessoire qui citent la chaudière
  const eq = (article, designation, texte) => ({ article, designation, texte, famille: 'production' });
  const items = I.depuisCctp([eq('2.2.1', 'Dépose des éléments de la chaufferie existante', 'Dépose de la chaudière fioul existante.'),
    eq('2.3.1', 'Chaudière murale gaz', 'Chaudière murale à condensation. Puissance utile : 30 kW'),
    eq('2.3.2', 'Kit pour montage en cascade', 'Les deux chaudières murales seront raccordées par un kit.'),
    eq('2.3.3', 'Station de neutralisation des condensats', 'Pour les condensats des chaudières.'),
    eq('2.6.3', 'Robinet avec bouton poussoir ECS', 'Robinet temporisé alimenté en eau chaude sanitaire.')]);
  assert.deepStrictEqual(items.map(x => x.designation), ['Chaudière murale gaz']);
});

// CCTP en texte libre : intertitres en capitales dans un long article, puces de police à symboles (caractères de contrôle),
// groupes énumérés du type de l'article, renvoi et titre d'accessoire sans équipement
const CCTP_LIBRE = ['1 VENTILATION', '1.1 VENTILATION DES BUREAUX', 'Extraction dans les locaux humides.',
  '1.1.1 VENTILATEUR D\'EXTRACTION', '\x01 Caissons de ventilation en faux plafond.', '\x01 1 groupe pour accueil (archives, sanitaires) et étage (bureaux)',
  '\x01 Débit maxi : 450 m3/h', 'Marque ACME modèle CX 600 ou équivalent', '\x01 1 groupe pour salle de réunion et office', '\x01 Débit maxi : 380 m3/h',
  '1.1.2 REJET', 'VMC RDC :', 'Rejet en façade en sortie du caisson d\'extraction, grille pare-pluie.',
  '2 PLOMBERIE', '2.3 PRODUCTION EAU CHAUDE', '2.3.1 LOCAL ENTRETIEN', 'Production par le ballon de la PAC décrite plus loin (voir chapitre « CHAUFFAGE »)',
  '3 CHAUFFAGE', '3.1 ZONE ATELIERS', 'POMPE A CHALEUR', 'Fourniture et pose d\'une PAC air / eau de marque ACME.',
  'UNITE EXTERIEURE NON REVERSIBLE', 'Puissance calorifique nominale sans résistance = 14 kW. COP = 3,9', 'MODULE HYDRAULIQUE', 'Résistance électrique : 2 KW',
  'BALLON ECS DEPORTE', 'Ballon de marque ACME ou équivalent', '\x02 Capacité : 150 litres (environ trois douches quotidiennes)', 'ACCESSOIRES', 'Thermostat.',
  'PLANCHER CHAUFFANT BASSE TEMPERATURE', 'Tube PER 16/20 sous chape.', '3.2 CHAUFFAGE DES GARAGES', 'AEROTHERMES', 'Aérothermes hélicoïdes ACME, batterie électrique, résistance blindée.',
  'COMMANDES ET REGULATION', 'Commande par thermostat d\'ambiance pour :', '2 aérothermes (garage A)', '1 aérotherme (garage B)',
  '3.4 PSE : CLIMATISATION DU LOCAL SERVEUR', '3.4.1 UNITE EXTERIEURE REVERSIBLE', 'Pfroid= 2.2 KW', '3.4.2 UNITE MURALE', 'Unité murale ACME.'];
test('CCTP en texte libre : intertitres en capitales, puces à symboles, groupes énumérés, renvoi et rejet sans équipement', () => {
  const a = CL.analyser(CCTP_LIBRE), ic = I.depuisCctp(a.equipements, I.reseauxCctp(a), a.articlesDetail);
  assert.deepStrictEqual(ic.map(x => [x.genre, x.sources[0], x.qte]), [['ventilateur', 'CCTP art. 1.1.1', 1], ['ventilateur', 'CCTP art. 1.1.1', 1], ['pac-air', 'CCTP art. 3.1', 1],
    ['ecs', 'CCTP art. 3.1', 1], ['plancher', 'CCTP art. 3.1', 1], ['aerotherme', 'CCTP art. 3.2', 2], ['aerotherme', 'CCTP art. 3.2', 1], ['split', 'CCTP art. 3.4.1', 1], ['split', 'CCTP art. 3.4.2', 1]]);
  assert.deepStrictEqual(ic.filter(x => x.genre === 'ventilateur').map(x => x.Q), [450, 380]);
  assert.match(ic[0].designation, /^Groupe pour accueil \(archives, sanitaires\) et étage/);
  assert.strictEqual(ic[2].P, 14, 'puissance « sans résistance » : la machine');
  assert.strictEqual(ic[3].carac.volume, 150, 'capacité annoncée comme telle');
  assert.ok(ic.filter(x => x.genre === 'aerotherme').every(x => x.alim === 'electrique'));
  assert.strictEqual(ic[7].Pfr, 2.2);
});

// DPGF en feuilles par chapitre (n° sur les titres seulement), puces « – » et « → », désignation continuée après « avec »
const DPGF_FEUILLES = [
  { name: '1', rows: [['ITEM', 'DESIGNATION DU POSTE', 'Unité', 'Qté'], [], ['1', 'VENTILATION'], ['', ' - Rejet en toiture :'], ['', '     - Chapeau DN 200 + étanchéité', 'Nbr', 1], [],
    ['', ' - Groupe ACME compact 500, équivalent', 'Nbr', 2], ['', '    - Suspensions, manchettes souples'], [], ['', ' - Bouton poussoir temporisé', 'Ens', 2]] },
  { name: '3', rows: [['ITEM', 'DESIGNATION DU POSTE', 'Unité', 'Qté'], ['3', 'CHAUFFAGE'], ['3.1', 'ZONE ATELIERS'], ['', '– Unité extérieure chauffage seul ACME-12 + support', 'Nbr', 1],
    ['', '– Module hydraulique ACME-M', 'Nbr', 1], ['', '– Ballon déporté ACME-150 avec'], ['', '   Résistance électrique et sonde de température', 'Nbr', 1],
    ['', '– Aquastat de sécurité plancher chauffant', 'Nbr', 1], ['', '– Mise en route PAC par fabricant', 'Ens', 1],
    ['3.2', 'CHAUFFAGE DES GARAGES'], ['', '→ Aérotherme électrique :'], ['', '    - ACME série X, P=2-3 KW', 'Nbr', 3], ['', '    - Kit support mural', 'Nbr', 3], ['', '    - Contact à feuillure sur porte', 'Nbr', 4]] },
  { name: '4', rows: [['ITEM', 'DESIGNATION DU POSTE', 'Unité', 'Qté'], ['3.3', 'PSE : CLIMATISATION DU LOCAL SERVEUR'], ['', 'Ensemble des prestations suivant CCTP, comprenant :'],
    ['', '    - Unité extérieure réversible (Pf=2,2KW)', 'Nbr', 1], ['', '    - Unité intérieure murale', 'Nbr', 1]] },
];
test('DPGF par chapitres : unité extérieure « chauffage seul » de PAC, ballon continué après « avec », accessoires et mise en route écartés ; recoupement avec le CCTP', () => {
  const d = I.depuisFeuilles(DPGF_FEUILLES).items;
  assert.deepStrictEqual(d.map(x => [x.genre, x.qte]), [['ventilateur', 2], ['regulation', 2], ['pac-air', 1], ['ecs', 1], ['aerotherme', 3], ['split', 1], ['split', 1]]);
  assert.strictEqual(d[0].designation.replace(/\s*\(\d\)$/, ''), 'Groupe ACME compact 500, équivalent');
  assert.match(d[3].designation, /^Ballon déporté ACME-150 avec Résistance/);
  assert.strictEqual(d[5].Pfr, 2.2, '« Pf = » : puissance froid');
  assert.ok(d[5].variante && d[6].variante, 'PSE');
  const a = CL.analyser(CCTP_LIBRE), ic = I.depuisCctp(a.equipements, I.reseauxCctp(a), a.articlesDetail);
  const inv = I.fusionner(ic, d), deux = x => x.sources.some(s => /^CCTP/.test(s)) && x.sources.some(s => /^DPGF/.test(s));
  // Deux caissons au CCTP, une ligne « 2 » au DPGF ; 2 + 1 aérothermes, une ligne « 3 » : chacun reçoit la ligne
  assert.deepStrictEqual(inv.filter(x => ['ventilateur', 'aerotherme'].includes(x.genre)).map(x => [x.genre, x.qte, deux(x)]), [['ventilateur', 1, true], ['ventilateur', 1, true], ['aerotherme', 2, true], ['aerotherme', 1, true]]);
  // PSE numérotée 3.4 au CCTP, 3.3 au DPGF : rapprochée par l'intitulé
  assert.deepStrictEqual(inv.filter(x => x.genre === 'split').map(deux), [true, true]);
  assert.ok(inv.find(x => x.genre === 'pac-air' && deux(x)) && inv.find(x => x.genre === 'ecs' && deux(x)));
});

test('DPGF à long préambule : en-tête lointaine, n° sans intitulé, sous-chapitres « A/ », rooftop sur plusieurs lignes, tubes radiants gaz, rideau d\'air, liaisons', () => {
  const rows = [...Array.from({ length: 55 }, (_, i) => ['', `Clause du préambule n° ${i + 1}`]), ['', 'Description', 'Unité', 'Qté', 'Prix unitaire', 'Prix partiel'], [],
    ['1', 'TRAITEMENT D\'AIR DU MAGASIN'], ['A/', 'ROOFTOP'], ['', 'Rooftop posé sur costière en toiture'], ['', 'de marque ACME modèle RT 40 (imposé)'], ['', ' - 5200 m³/h '],
    ['', ' - Pfroid : 31,5 KW'], ['', ' - Pchaud : 20,4 KW + 12 KW batterie électrique chaud'], ['', 'et options :'], ['', ' - sonde de CO2'], ['', ' - DAD'],
    ['', 'raccordements laissés en attente', 'Ens', 1], [], ['', 'Manutention par grutage'], ['', '(en deux temps)', 'Ens', 1], [],
    ['', 'Liaison électrique entre rooftop et sondes'], ['', ' - Sonde d\'ambiance / rooftop', 'Ens', 1],
    ['2', 'CHAUFFAGE DE L\'ATELIER'], ['A', 'TUBES RAYONNANTS GAZ'], ['', 'Tubes radiants gaz ACME'], ['', 'tel que défini au CCTP'], ['', ' - Modèle R 12 (8/11 KW)', 'Nb', 3],
    ['3', 'RIDEAU D\'AIR'], ['', 'Rideau d\'air chaud électrique ACME'], ['', 'de puissance 6 KW électrique'], ['', 'longueur 150 cm', 'Ens', 1],
    ['4', 'DIVERS'], ['', 'DN 50 (passage alimentation VMC)', 'u', 1], ['', ' - entre unité extérieure et unités intérieures', 'Ens', 1]];
  const d = I.depuisDpgf(rows);
  assert.ok(!d.erreur, d.erreur);
  assert.deepStrictEqual(d.items.map(x => [x.genre, x.qte, x.sources[0]]), [['cta', 1, 'DPGF 1.A'], ['radiant', 3, 'DPGF 2.A'], ['aerotherme', 1, 'DPGF 3']]);
  const [rt, tr, ra] = d.items;
  assert.deepStrictEqual([rt.Q, rt.Pfr, rt.P, rt.details.PelBe, !!rt.variante, rt.alim], [5200, 31.5, 20.4, 12, false, 'detente']);
  assert.deepStrictEqual([tr.P, tr.alim], [11, 'gaz']);
  assert.deepStrictEqual([ra.alim, ra.Pel], ['electrique', 6]);
});

test('petit lot : sigles à points, n° « 05.1 », extension de réseau, quantité d\'un accessoire, chauffe-eau sans tiret, appareils sanitaires et calcul sanitaire', () => {
  const a = CL.analyser(['7.4.2.1 APPAREIL DE V.M.C. HYGROREGLABLE', 'Groupe simple flux hygroréglable de marque ACME.', '• bouches d\'extraction dans pièces : 3 unités dans la salle',
    '7.5.3.1 MODIFICATION ET EXTENSION DU RESEAU VMC', 'Extension du réseau de VMC existant, 2 bouches.', '7.5.2.3 CUVETTE DE WC SUR BATI SUPPORT', 'Cuvette suspendue.',
    '7.5.2.4 VASQUE SUR MEUBLE', 'Vasque en céramique.', '7.5.2.6 BARRE ET ENSEMBLE DE DOUCHE', 'Barre de douche.', '6.4 CHAUFFE EAU de 50 LITRES', '1 chauffe eau de 50 litres 1,5 kW monophasé.']);
  const ic = I.depuisCctp(a.equipements, I.reseauxCctp(a), a.articlesDetail);
  assert.deepStrictEqual(ic.map(x => [x.genre, x.sources[0], x.qte]), [['ventilateur', 'CCTP art. 7.4.2.1', 1], ['sanitaire', 'CCTP art. 7.5.2.3', 1], ['sanitaire', 'CCTP art. 7.5.2.4', 1], ['ecs', 'CCTP art. 6.4', 1]]);
  const L = (n, des, u = '', q = '') => [n, '', des, u, '', q];
  const d = I.depuisDpgf([['N°', 'Ref.', 'Désignation', 'U', '', 'Qté'], L('07.4.2.1', 'APPAREIL DE V.M.C. HYGROREGLABLE', 'u', 1), L('07.5.3.1', 'MODIFICATION ET EXTENSION DU RESEAU VMC', 'u', 1),
    L('07.5.2.3', 'CUVETTE DE WC SUR BATI SUPPORT', 'u', 2), L('07.5.2.4', 'VASQUE SUR MEUBLE', 'u', 2), L('07.5.2.5', 'RECEVEUR DE DOUCHE', 'u', 1), L('07.5.2.6', 'BARRE ET ENSEMBLE DE DOUCHE', 'ens', 1)]).items;
  assert.deepStrictEqual(d.map(x => x.genre), ['ventilateur', 'sanitaire', 'sanitaire', 'sanitaire']);
  const inv = I.fusionner(ic, d);
  assert.ok(inv.filter(x => ['ventilateur', 'sanitaire'].includes(x.genre) && x.sources.some(s => /^CCTP/.test(s))).every(x => x.rapprochement === 'numero'), 'n° « 07.4.2.1 » = « 7.4.2.1 »');
  assert.strictEqual(inv.find(x => x.genre === 'ventilateur').qte, 1, '« 3 unités » : les bouches, pas le groupe');
  const s = I.versSanitaire(inv);
  assert.deepStrictEqual(s.points.map(p => [p.rep, p.type]), [['WC-01', 'wc'], ['WC-02', 'wc'], ['LV-01', 'lavabo'], ['LV-02', 'lavabo'], ['DO-01', 'douche']]);
  assert.deepStrictEqual(s.ecs.length, 1);
  assert.deepStrictEqual(['Attentes EF / EU lave linge', 'Distributeur de papier WC', 'Bouche d\'extraction WC', 'Robinet de puisage DN 15', 'Lave-mains PMR'].map(t => (I.classer(t) || {}).genre),
    ['sanitaire', undefined, 'bouche-extraction', 'sanitaire', 'sanitaire']);
  assert.deepStrictEqual(['Attentes EF / EU lave linge', 'Robinet de puisage DN 15', 'Lave-mains PMR', 'Vidoir porte-seau', 'Urinoir'].map(I.appareilSanitaire), ['lavelinge', 'puisage', 'laveMains', 'videSeau', 'urinoir']);
});

test('DPGF : ligne « suivant CCTP » sous un titre numéroté, prise du titre ; puissance au libellé le plus proche', () => {
  const L = (code, des, u = '', q = '') => [code, des, u, q];
  const d = I.depuisDpgf([['Code', 'Désignation', 'Unité', 'Quantité'], L('2.1', 'Installation'), L('2,1.3', 'Ventilation mécanique du local technique'), L('', 'suivant CCTP', 'Ens', 1),
    L('2.6', 'Production ECS'), L('2,6.3', 'Robinet avec bouton poussoir ECS'), L('', 'Suivant CCTP', 'U', 3)]).items;
  assert.deepStrictEqual(d.map(x => [x.genre, x.qte]), [['ventilateur', 1]]);
  assert.deepStrictEqual(I.puissances('Pfroid : 9,5 KW - Pchaud : 7,2 KW'), { Pfr: 9.5, Pch: 7.2 });
});
