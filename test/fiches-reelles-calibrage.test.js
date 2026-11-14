// Étalonnage de la lecture des fiches techniques sur des mises en page réelles (CTA présentées par composant, logiciels
// de sélection, pompes à chaleur et groupes froids en tableaux à deux colonnes, documentations de gamme, notes de calcul,
// devis, appareils et accessoires sanitaires). Lignes SYNTHÉTIQUES : la mise en page (tabulations, ordre des colonnes,
// libellés génériques, caractères perdus par l'extraction) est reproduite, les valeurs et le fabricant (« Exemplair ») sont inventés.
const { test } = require('node:test');
const assert = require('node:assert');
global.FichesTech = require('../public/js/fiches-tech');
const N = require('../etudes/public/js/notes');
global.Notes = N;
global.Terminaux = require('../etudes/public/js/terminaux');
global.Schema = require('../etudes/public/js/schema');
global.Pompes = require('../etudes/public/js/pompes');
require('../etudes/public/js/industriel');
global.Sanitaire = require('../etudes/public/js/sanitaire');
global.FicheCta = require('../etudes/public/js/fiche-cta');
global.FicheEquip = require('../etudes/public/js/fiche-equipement');
global.FicheAnnexes = require('../etudes/public/js/fiche-annexes');
require('../etudes/public/js/cta');
require('../etudes/public/js/annexes-energie');
global.SchemaAir = require('../etudes/public/js/aeraulique-schema');
global.Registre = require('../etudes/public/js/registre');
const V = require('../etudes/public/js/vrac');
const P = require('../public/js/pdf-lecture');
const FT = global.FichesTech, FC = global.FicheCta, FE = global.FicheEquip;

test('texte extrait réparé : ligatures sans code, accents détachés, exposants, espaces et glyphes décalés', () => {
  assert.strictEqual(P.reparer('Puissance frigori\u0000que\tkW\t500\t-'), 'Puissance frigorifique\tkW\t500\t-');
  assert.strictEqual(P.reparer('Type de \u0000uide\tE\u0000cacité\tValeur certi\u0000ée\tré\u0000échissante'), 'Type de fluide\tEfficacité\tValeur certifiée\tréfléchissante');
  assert.strictEqual(P.reparer('D \u0301ebit volumique:\t12 000 m /h'), 'Débit volumique:\t12 000 m³/h');
  assert.strictEqual(P.reparer('Pi`ece\tC\u02C6able\tFran \u0327cais\tBatterie  \u0301electrique\tFiltre `a poche'), 'Pièce\tCâble\tFrançais\tBatterie électrique\tFiltre à poche');
  assert.strictEqual(P.reparer('Débit\u2B8Esoufflage\t[m3/h]\t1\u2B8E200'), 'Débit soufflage\t[m3/h]\t1 200');
  assert.strictEqual(P.reparer('Valeur KVS:\t12.5 m§/h'), 'Valeur KVS:\t12.5 m³/h');
  // Police sous-ensemble : codes = numéros de glyphe (« 7HVW » = « Test »)
  assert.strictEqual(P.reparer('7HVW\u0003\u001d\u0003\u0018'), 'Test : 5');
  // Charabia (encodage de police personnalisé) : détecté, la page passe à l'OCR ; un texte normal ne l'est pas
  const bruit = Array.from({ length: 30 }, (_, i) => `\u0015!"#$%\t& '\u0010\u0012\u0003\u001b\u0010${i}\u0003\t\u0012(\u0007\u0010\u0003\u0006 \u0014`);
  assert.strictEqual(P.charabia(bruit), true);
  assert.strictEqual(P.charabia(['Fiche technique de la centrale', 'Débit d\'air\t4 000 m³/h', 'Pression disponible\t250 Pa', 'Batterie chaude\t35 kW', 'Filtre ePM1 55 %\t120 Pa']), false);
});

test('références : ni norme, ni code postal, ni bus, ni numéro de document ou d\'identification', () => {
  ['EN 13384-1', 'NF EN 14037-1', 'D-12345', 'RS 485', 'DN50', 'TARIFS PAGE 1029', 'ABC1234-56789', 'TVA FR12 345 678', 'EORI FR12345', 'NT00012345-EXA', 'C 52', 'de 1 150', 'verticaux de 75', '12345 ou']
    .forEach(r => assert.strictEqual(FT.estReference(r), false, r));
  ['XC-450', 'EX4-F 12x14', 'EXA 310 B', 'XP 12 G3'].forEach(r => assert.strictEqual(FT.estReference(r), true, r));
});

// CTA simple flux présentée par composant (préchauffage + post-chauffage, humidificateur de contact, batterie électrique)
const SECTIONS = ['Fiche technique', 'Centrale\tCTA', 'Gamme\tEX-30', 'Air soufflé', 'Débit d\'air\t12000 m3/h\t3,33m3/s', 'Perte de charge externe\t380 Pa\t-190 Pa / +190 Pa',
  'Puissance électrique ventilateur\t6,20 kW', 'Valeur SFPv (EN 16798-3)\t1.850 W/m3/s', 'Poids total\tenv. 1450,0 kg', 'www.exemplair.com\tRepère',
  'Caractéristiques ErP de la CTA', 'Configuration de centrale\tUnité de ventilation simple flux (UVU)', 'Puissance acoustique du caisson\t58 dB(A)',
  'Puissance spécifique du ventilateur\tvaleur réelle\t140 W/m3/s', 'Valeur de consigne (si présence d’un SRC)\tÉchangeur à plaques', 'roue de récupération\tenv. 5,0 %',
  'Filtre', 'Débit d\'air\t12000 m3/h\tPerte de charge - I/F/D\t90 / 190 / 140 Pa', 'Classe\tISO ePM 1 - 70%',
  'Batterie chaude', 'Débit d\'air\t12000 m3/h\tPerte de charge\t120 Pa', 'Entrée d\'air\t2,0 °C\tPuissance chaude\t130,50 kW', 'Entrée fluide / sortie\t45,0 °C / 40,0 °C\tPerte de charge fluide\t11,20 kPa',
  'Fonctionnement alternatif avec régime d\'eau chaude 35°C/30°C', 'Puissance : 40.10 kW', 'PdC Fluide : 8.1 kPa',
  'Humidificateur de contact', 'Débit d\'air\t12000 m3/h\tPerte de charge\t0 Pa', 'Charge d\'humidification : 5.1 g/kgas et 90.5 kg/h',
  'Batterie chaude', 'Débit d\'air\t12000 m3/h\tPerte de charge\t40 Pa', 'Entrée d\'air\t15,0 °C\tPuissance chaude\t20,00 kW', 'Entrée fluide / sortie\t45,0 °C / 40,0 °C\tPerte de charge fluide\t9,50 kPa',
  'Ventilateur', 'Débit d\'air\t12000 m3/h\tPerte de charge externe\t380 Pa', 'Exécution\tRoue libre\tPerte de charge interne\t410 Pa', 'Fabrication\tExemplair\tPuissance sur arbre\t5,4 kW',
  'Puissance acoustique f H\t63 125 250 500 1 k 2 k 4 k 8 k', 'Aspiration CTA\t70 dB(A)\t55 60 62 64 62 60 57 52 dB(A)', 'Soufflage CTA\t82 dB(A)\t57 65 75 78 76 74 69 63 dB(A)', 'À côté de la CTA\t60 dB(A)\t57 51 55 49 47 42 35 35 dB(A)',
  'Moteur', 'Puissance\t7,5 kW\tCourant absorbé\t14,9 A', 'Tension\t400 V\tDiamètre d\'arbre\t38 mm',
  'Batterie électrique', 'Débit d\'air\t12000 m3/h\tPerte de charge\t15 Pa', 'Entrée d\'air / sortie\t30,0 °C / 38,0 °C\tPuissance chaude nécessai 32,0 kW', 'Puissance épingle 1/épingle 0,0 kW / 2,1 kW\tPuissance chaude installée 33,6 kW',
  'Vérification de la conformité ErP', 'Puissance chaude nominale [kW]\t32,0 kW'];

test('CTA simple flux par composant : batteries additionnées, filtre de dimensionnement, ni reprise ni récupérateur inventés', () => {
  assert.strictEqual(V.classer(SECTIONS, 'fiche.pdf'), 'cta');
  const r = FC.lire(SECTIONS), v = r.valeurs;
  assert.deepStrictEqual([v.Qs, v.Qr, v.recup, v.dpRecup, v.eta], [12000, undefined, undefined, undefined, undefined]);
  assert.deepStrictEqual([v.PchBC, v.dpBC, v.dpEauBC, v.TcAller, v.TcRetour], [150.5, 160, 11.2, 45, 40]);
  assert.ok(/2 composants/.test(r.sources.PchBC));
  assert.deepStrictEqual([v.dpFiltreAN, v.PdispoS, v.Pbe, v.humid, v.froid], [140, 380, 33.6, 'adiabatique', undefined]);
  assert.deepStrictEqual([v.LwS, v.SFP, v.PelS, v.Pmot, v.Imot, v.poids], [82, 1850, 6.2, 7.5, 14.9, 1450]);
  assert.strictEqual(r.fabricant, 'Exemplair');
  // L'humidificateur adiabatique reste un contrôle : le calcul de CTA ne connaît que la vapeur
  assert.ok(!FC.champs('cta', v).some(c => c.k === 'humid'));
  assert.ok(FC.fiche(r).Imot === 14.9);
});

// Logiciel de sélection : colonnes consigne / réel, change-over, plug fan avec variateur, accents détachés réparés
const SELECTION = ['Succursale :\tFabricant', 'Distributeur France SAS', '1 rue des Essais\tEXEMPLAIR GMBH', '00000 Ville\tRue 1', 'Fiche technique\tPage: 1 of 4',
  'Centrale:\tCTA 9000 sans régulation', 'Type:\tEX4-F 12x14 - Intérieur\tTraité par :\tX', 'Données des centrales\tAir pulsé\tAir extrait', 'Consigne\tRéel\tConsigne\tRéel',
  'Flux d’air\t9 000\t9 000 m /h\t0\tm /h', 'Pression disponible\t320\t320 Pa\t0\tPa', 'AN - Filtre\tG 1\tUF 2\tAccessoire(s)', 'Classe:\tePM1-60 % / F7', 'Pression de dimensionnement:\t150 Pa',
  'Perte de charge initiale:\t100 Pa', 'Pression finale:\t200 Pa', 'AN - Change over\tG 1\tUF 3\tAccessoire(s)', 'Type:\tBatt. froide - Cu/Alu', 'Puissance totale:\t62,40 kW', 'Perte de charge (sec):\t95 Pa',
  'Perte de charge séparateur:\t20 Pa', 'Temp. entrée fluide:\t7,0 C', 'Temp. sortie fluide:\t12,0 C', 'Perte de charge fluide:\t30,5 kPa', 'Change over:', 'Medium temp in:\t45,0 C', 'Medium temp out:\t38,0 C',
  'Required heat output:\t70,0 kW', 'AN - Ventilateur - Plug fan (direct driven)\tG 2\tUF 4', 'Pression statique:\t610 Pa', 'Puissance à l’arbre:\t3,10 kW', 'Rendement stat.:\t71 %', 'Vitesse de rotation nom.:\t1450 /min',
  '- Moteur:', 'Mode de régulation:\tVariateur', 'Puissance abs.:\t3,60 kW', 'Puissance abs. Variateur:\t3,85 kW', 'Valeur SFP (GEG 2020):\t1 540 W/(m /s)', 'SFPv (EN 16798-3):\t1 540 W/(m /s)',
  'Puissance abs. max.:\t4,9 kW', 'Puissance(s) nominale(s):\t4 kW', 'Intensité nominale:\t7,90/4,60 A', 'Puissance sonore en entrée:\t74,0 dB(A)', 'Puissance sonore en sortie:\t80,5 dB(A)',
  'AN - Batterie  \u0301electrique\tG 2\tUF 5', 'Perte de charge:\t25 Pa', 'Puissance chaude tot.:\t60,0 kW', 'Courant  \u0301elec. tot.:\t86,6 A', 'ERP information', 'Type\tNRVU-UVU', 'SFP Interne\t160 W/(m /s)',
  'Longueur :\t3 200 mm\tLargeur:\t1 300 mm\tHauteur:\t1 400 mm\t980 kg'].map(P.reparer);

test('CTA d\'un logiciel de sélection : reconnue malgré « Type : modèle », change-over, variateur, SFP sans l\'année', () => {
  assert.strictEqual(V.classer(SELECTION, 'offre.pdf'), 'cta');
  const lu = V.lire('cta', SELECTION), v = lu.valeurs;
  assert.deepStrictEqual([lu.fabricant, lu.reference], ['EXEMPLAIR', 'EX4-F 12x14']);
  assert.deepStrictEqual([v.Qs, v.Qr, v.PdispoS, v.PdispoR, v.recup, v.froid], [9000, undefined, 320, undefined, undefined, 'co']);
  assert.deepStrictEqual([v.PfrBF, v.TfAller, v.TfRetour, v.dpEauBF, v.dpBF, v.PchBC, v.TcAller, v.TcRetour], [62.4, 7, 12, 30.5, 115, 70, 45, 38]);
  assert.deepStrictEqual([v.dpFiltreAN, v.PelS, v.SFP, v.Pmot, v.Imot, v.LwS, v.Pbe, v.Ibe], [150, 3.85, 1540, 4, 7.9, 80.5, 60, 86.6]);
  assert.deepStrictEqual([v.longueur, v.largeur, v.hauteur], [3200, 1300, 1400]);
});

test('CTA double flux en colonnes [unité] : filtres additionnés par côté, récupérateur rotatif, SFPv en kW', () => {
  const L = ['Débit⮎soufflage\t[m3/h]\t1⮎850', 'Pression⮎statique⮎externe⮎au⮎débit⮎d\'air⮎soufflé\t[Pa]\t180', 'Débit⮎extraction\t[m3/h]\t1⮎900', 'Pression⮎statique⮎externe⮎au⮎débit⮎d\'air⮎extrait\t[Pa]\t160',
    'SFPv\t[kW/(m3/s)]\t1,25', 'Puissance⮎moteur⮎air⮎neuf⮎(filtre⮎propre)\t[kW]\t0,41', 'Puissance⮎moteur⮎air⮎extrait⮎(filtre⮎propre)\t[kW]\t0,47', 'Efficacité⮎thermique⮎de⮎l\'échangeur\t[%]\t84,5',
    'Pertes⮎de⮎charge⮎échangeur\t[Pa]\t90\t95', 'Type⮎de⮎SRC\tÉchangeur⮎de⮎chaleur⮎rotatif', 'Ventilateur de type roue libre', 'Pré-filtre', 'Classe⮎Filtre\tePM10⮎50%⮎(M5)', 'Pertes⮎de⮎charge⮎(Propre/Design/Final)\t[Pa]\t20⮎/⮎40⮎/⮎60',
    'Filtre', 'ID⮎filtre\tFIL_EX_ODA_ePM1', 'Pertes⮎de⮎charge⮎(Propre/Design/Final)\t[Pa]\t40⮎/⮎80⮎/⮎120', 'Filtre', 'ID⮎filtre\tFIL_EX_ETA_ePM1', 'Pertes⮎de⮎charge⮎(Propre/Design/Final)\t[Pa]\t90⮎/⮎130⮎/⮎170']
    .map(P.reparer);
  const v = FC.lire(L).valeurs;
  assert.deepStrictEqual([v.Qs, v.Qr, v.PdispoS, v.PdispoR, v.SFP, v.PelS, v.PelR, v.eta], [1850, 1900, 180, 160, 1250, 0.41, 0.47, 84.5]);
  assert.deepStrictEqual([v.dpRecup, v.recup, v.dpFiltreAN, v.dpFiltreR], [90, 'roue', 120, 130]);
});

test('documentation de gamme de caissons double flux : tailles à choisir, échangeur à plaques (pas la roue libre)', () => {
  const L = ['NOTICE TECHNIQUE', 'Centrales double flux', 'Échangeur à contre-courant', ' 4 tailles : 05 (500 m /h) / 10 (1 000 m /h) /', '3\t3', '20 (2 000 m /h) / 40 (4 000 m /h).', '• Ventilateur de type roue libre à réaction.', 'Efficacité thermique jusqu’à 90%'].map(P.reparer);
  assert.strictEqual(V.classer(L, 'notice.pdf'), 'cta');
  const lu = V.lire('cta', L);
  assert.deepStrictEqual(lu.modeles.map(m => [m.ref, m.Qs]), [['05', 500], ['10', 1000], ['20', 2000], ['40', 4000]]);
  assert.deepStrictEqual(lu.valeurs, { recup: 'plaques' });
  assert.deepStrictEqual([lu.fabricant, lu.reference], ['', '']);
  assert.ok(/choisir le modèle/.test(lu.resume));
  assert.strictEqual(V.choisirModele(lu, 2).valeurs.Qs, 2000);
});

// PAC air / eau : tableau Froid | Chauffage, unité puis valeurs, valeurs décalées d'une ligne, ligatures perdues
const PAC = ['Rapport\tProjet', 'EXA 600', 'Pompe à chaleur air / eau R32', 'Valeur certi\u0000ée', 'Niveau de puissance acoustique EN12102-1\tdB(A)\t90.0',
  'Élément du système\tFroid\tChauffage\tMode\tFroid\tChauffage', 'Puissance frigori\u0000que\tkW\t600\t-', 'Puissance calori\u0000que « instantanée »', 'Taux d\'encrassement (sqm-K)/kW\t0.000\t0.000\tkW\t-\t450',
  'Température de sortie\t°C\t7.0\t45.0\t(2)\tkW\t-\t450', 'Puissance calori\u0000que', 'FluideTempérature à l\'entrée\t°C\t12.0\t40.0\tE\u0000cacité de refroidissement (EER)', 'Débit de \u0000uide\tl/s\t28.6\t21.5\tkW/kW\t2.90\t-',
  'Perte de charge totale\tkPa\t60.0\t35.0\tE\u0000cacité thermique (COP) (2)\tkW/kW\t-\t2.40', 'Puissance absorbée de l\'unité\tkW\t207\t188', 'Puissance maximale\tkW\t600\t450', 'Type de réfrigérant\tR32',
  'Masse de réfrigérant\tkg\t80.0', 'Tonnes équivalent CO2\tTonnes\t54.00', 'Poids\tkg\t4100', 'Longueur\tmm\t6000', 'Largeur\tmm\t2250', 'Hauteur\tmm\t2300', '* Conforme au règlement (UE) N° 2016/2281 L\'application',
  'Tension\tV-Ph-Hz\t400-3-50', 'Intensité maximale\tA\t250\t250', 'Intensité de démarrage\tA\t380\t380'].map(P.reparer);

test('PAC air / eau en deux colonnes : puissances, EER, COP, fluide, charge, électricité ; ni volume ni fabricant inventés', () => {
  assert.strictEqual(V.classer(PAC, 'pac.pdf'), 'generateur');
  const lu = V.lire('generateur', PAC), v = lu.valeurs;
  assert.deepStrictEqual([v.Pfr, v.P, v.EER, v.COP, v.P1, v.P1ch], [600, 450, 2.9, 2.4, 207000, 188000]);
  assert.deepStrictEqual([v.fluide, v.charge, v.teqCO2, v.tension, v.Imax, v.Idem, v.Lw, v.poids], ['R32', 80, 54, 'tri', 250, 380, 90, 4100]);
  assert.strictEqual(v.V, undefined);
  assert.strictEqual(lu.fabricant, '');
  assert.deepStrictEqual(FE.champs('pid', v).map(c => c.k), ['Pgen', 'PgenF', 'dpGen', 'PelecGen']);
});

test('groupe froid à condensation par eau (évaporateur | condenseur) : valeurs nettes, organismes et entreprise exclus', () => {
  const L = ['Job Name: TECNITUB - ESSAI\tUnit Tag: EXA 300', 'Gamme à condensation par eau', 'Modèle EXA 300 R513A', 'Charge usine complète (R513A)', 'Alimentation électrique 400V 3 Ph 50Hz',
    'Evap.\tCond.', 'Temp. entrée fluide 12,0 C\t30,0 C', 'Temp. sortie fluide 7,0 C\t35,0 C', 'Puissance brute 410,0 kW\t520,0 kW', 'Puissance nette 405,0 kW\t525,0 kW', 'P. abs. Nette totale 118,0 kW\t118,0 kW',
    'EER/COP brut 3,500 EER (kW/kW)\t4,400 COP (kW/kW)', 'EER/COP net (2) 3,430 EER (kW/kW)\t4,450 COP (kW/kW)', 'Débit d\'eau 19,50 L/s\t25,00 L/s', 'Pertes de charges fluide 55,0 kPa\t40,0 kPa',
    'Niveau de puissnace sonore (lW)\t95 dBA', 'Charge réfrigérant (circuit 1/2) 60 kg\t60 kg', 'Intensité maximale 400,00 A', 'Exemplair® Select Version: 1 www.eurovent-certification.com', 'Exemplair® Select Page 2'];
  assert.strictEqual(V.classer(L, 'groupe.pdf'), 'generateur');
  const lu = V.lire('generateur', L), v = lu.valeurs;
  assert.strictEqual(lu.fabricant, 'Exemplair');
  assert.deepStrictEqual([v.Pfr, v.P, v.Pcond, v.P1, v.EER, v.COP], [405, undefined, 525, 118000, 3.43, 4.45]);
  assert.deepStrictEqual([v.TfDep, v.TfRet, v.TcondE, v.TcondS, v.Qeau, v.Qcond, v.dpEau, v.dpCond], [7, 12, 30, 35, 70.2, 90, 55, 40]);
  assert.deepStrictEqual([v.fluide, v.charge, v.Lw, v.Imax, v.tension], ['R513A', 120, 95, 400, 'tri']);
});

test('documentation de gamme de chaudières : modèles et puissances, aucune valeur « première venue »', () => {
  const L = ['EXA', 'Chaudière triple parcours', '5 modèles de 500 à 2 500 kW', 'Vue de face\tVue de 3/4', 'PERFORMANCES', 'UNITÉS\t10\t11\t12\t13\t14', 'PUISSANCES',
    'max\tkW\t500\t800\t1200\t1800\t2500', 'Puissance utile nominale •', 'min\tkW\t150\t240\t360\t540\t750', 'Pression de service 6 bar', 'EXA 10 et EXA 11 : foyer court'];
  assert.strictEqual(V.classer(L, 'chaudiere.pdf'), 'generateur');
  const lu = V.lire('generateur', L);
  assert.deepStrictEqual(lu.modeles.map(m => [m.ref, m.P]), [['EXA 10', 500], ['EXA 11', 800], ['EXA 12', 1200], ['EXA 13', 1800], ['EXA 14', 2500]]);
  assert.deepStrictEqual([lu.valeurs.P, lu.valeurs.TcAller, lu.reference], [undefined, undefined, '']);
  const x = V.choisirModele(lu, 3);
  assert.deepStrictEqual([x.reference, x.valeurs.P], ['EXA 13', 1800]);
});

test('ballon tampon : type plus précis que le nom du fichier, capacités de la gamme', () => {
  const L = ['BALLON TAMPON D’EAU GLACÉE', 'GAMME ACIER - 300 À 2 000', 'DIMENSIONS', 'Capacité', '(litres)', '300\t500\t90\t400\t700', '500\t650\t90\t430\t910', '1 000\t800\t90\t460\t940', '2 000\t1 100\t90\t530\t1 010', 'PS maxi\t10 bar'];
  assert.strictEqual(V.classer(L, 'ballon.pdf'), 'tampon');
  const lu = V.lire('tampon', L);
  assert.deepStrictEqual(lu.modeles.map(m => m.V), [300, 500, 1000, 2000]);
  assert.strictEqual(lu.valeurs.V, undefined);
});

test('note de sélection d\'un système d\'expansion : vase retenu, ni numéro de document ni entreprise comme fabricant', () => {
  const L = ['ABC1234-56789\tESSAI 50/55°C 30m3\tTECNITUB', 'Note de sélection système expansion', 'Capacité en eau installation (L)\t30000', 'Volume d\'expansion calculé (L)\t320', 'Volume minimum du GMP\t410 Litres',
    'Exemplair EX vase principal 500L\tExemplair EX vase principal 500L', 'Groupe de maintien de pression 230V\t12345', 'Pression max. admissible\t10 bar'];
  assert.strictEqual(V.classer(L, 'pompe.pdf'), 'vase');
  const lu = V.lire('vase', L);
  assert.deepStrictEqual([lu.valeurs.V, lu.valeurs.Vmin, lu.valeurs.Ve, lu.valeurs.pmax], [500, 410, 320, 10]);
  assert.ok(!/ABC1234|TECNITUB/i.test(`${lu.fabricant} ${lu.reference}`));
});

test('note de calcul de conduit de fumée : reconnue, valeurs reportées dans le calcul annexe', () => {
  const L = ['EXEMPLE 01', 'Dimensionnement des conduits de fumées selon EN 13384-1', 'Environnement', 'Altitude\t250 m', 'Générateur', 'Fabricant, Type\tExemplair CX 20 80 / 60 °C', 'Combustible\tGaz naturel',
    'Pleine charge\tCharge partielle', 'Puissance therm. nominale\t900 kW\t300 kW', 'Contenu de CO2\t9,5 %\t9 %', 'Température de fumée\t160 °C\t110 °C', 'Buse de fumée\tCirculaire 350 mm',
    'Conduit du raccordement - Dimensions', 'Longeur développée\t6 m', 'Cheminée - Dimensions', 'Hauteur développée\t22 m', 'Longeur développée\t22 m'];
  assert.strictEqual(V.classer(L, 'note.pdf'), 'fumee');
  const lu = V.lire('fumee', L);
  assert.deepStrictEqual(lu.valeurs, { altitude: 250, generateur: 'Exemplair CX 20 80 / 60 °C', combustible: 'gaz', P: 900, CO2: 9.5, Tf: 160, D: 350, Lr: 6, H: 22 });
  assert.deepStrictEqual([lu.fabricant, lu.reference], ['', '']);
  const note = { id: 'n1', type: 'conduitFumee', titre: 'Conduit', entrees: { ...N.defauts('conduitFumee') } }, et = { notes: [note] };
  assert.deepStrictEqual(V.destinations(et, 'fumee').map(d => d[0]), ['fumee:n1', 'fumee:nouveau']);
  assert.ok(/8 valeur/.test(V.appliquer(et, { type: 'fumee', nom: 'note.pdf', lu }, 'fumee:n1')));
  assert.deepStrictEqual([note.entrees.P, note.entrees.D, note.entrees.H, note.entrees.source], [900, 350, 22, '']);
  assert.ok(N.calculer('conduitFumee', note.entrees).valeurs);
});

test('devis : document commercial, ni fabricant ni référence d\'équipement', () => {
  const L = ['DEVIS', 'Société Exemple', 'Contact commercial : M. Exemple', 'Suite à votre demande de devis du 01/01/2026', 'Prix nets hors taxes, selon nos conditions générales de vente', 'Article EX-100\t2\t120,00\t240,00'];
  assert.strictEqual(V.classer(L, 'selection.pdf'), 'document');
  const lu = V.lire('document', L);
  assert.deepStrictEqual([lu.fabricant, lu.reference, lu.nb], ['', '', 0]);
  assert.ok(/matériel retenu/.test(V.appliquer({ notes: [] }, { type: 'document', nom: 'selection.pdf', lu })));
});

test('sanitaire : accessoires sans calcul, appareils avec leur débit de base par défaut, grille de caniveau', () => {
  const t = n => V.classer([], n);
  ['barre d\'appui WC PMR.pdf', 'Distributeur de savon.pdf', 'Porte brosse WC.pdf', 'Miroir.pdf', 'siege de douche accrochable.pdf', 'Doc technique grille canniveau.pdf', 'Plan caniveau de douche.pdf']
    .forEach(n => assert.strictEqual(t(n), 'accessoireSan', n));
  ['Robinet mural.pdf', 'Lave main wc.pdf', 'Receveur de douche.pdf', 'Vidoir mural.pdf', 'WC suspendu.pdf', 'Evier double cuve.pdf'].forEach(n => assert.strictEqual(t(n), 'sanitaire', n));
  assert.deepStrictEqual(V.destinations({ notes: [] }, 'accessoireSan'), []);
  const lu = V.lire('sanitaire', ['Vidoir mural en céramique', 'Exemplair']);
  assert.strictEqual(lu.valeurs.appareil, 'videSeau');
  assert.ok(/0,33 L\/s par défaut/.test(lu.resume));
});

test('aérochauffeur : terminal (pas une pompe), puissance, débit d\'air, électricité', () => {
  const L = ['Descriptif technique', 'Principe de fonctionnement', 'Ventilation et chauffage par aérochauffeurs', '1) Aérochauffeur EX 6',
    'Débit d\'air:\t6000\tm3/h', 'Puissance électrique:\t0,95\tkW', 'Tension:\t3x400 +N\tV', 'Contenance en eau (Chauffage):\t9,1\tl', 'Chauffage', 'Aller:\t70\t°C', 'Retour:\t50\t°C', 'Puissance calorifique:\t55,0\tkW', 'Commande de pompe de circuit'];
  assert.strictEqual(V.classer(L, 'descriptif.pdf'), 'terminal');
  const v = V.lire('terminal', L).valeurs;
  assert.deepStrictEqual([v.Pch, v.Qair, v.Pvent, v.tension], [55, 6000, 950, 'tri']);
});

test('panneau rayonnant : exposant n et puissance à ΔT 50 tirés du tableau des émissions, modèles de la gamme', () => {
  const em = Array.from({ length: 6 }, (_, k) => { const dt = [80, 66, 52, 38, 24].map(d => d - k); return dt.map(d => `${d}\t${Math.round(6 * d ** 1.2)}`).join('\t'); });
  const L = ['Panneaux rayonnants', 'Modèle\tLongueur (A)\tPoids\tContenance en eau', 'mm\tkg\tlitres', 'EX 1\t1200\t14,0\t1,2', 'EX 2\t1800\t21,0\t1,9', 'Émissions calorifiques suivant la norme EN 14037-1',
    '∆tm\tPuissance\t∆tm\tPuissance\t∆tm\tPuissance\t∆tm\tPuissance\t∆tm\tPuissance', '°C\tW/ml\t°C\tW/ml\t°C\tW/ml\t°C\tW/ml\t°C\tW/ml', ...em, 'Émissions frigorifiques'];
  assert.strictEqual(V.classer(L, 'radiateur.pdf'), 'radiateur');
  const lu = V.lire('radiateur', L);
  assert.ok(Math.abs(lu.valeurs.nExp - 1.2) < 0.01, lu.valeurs.nExp);
  assert.strictEqual(lu.valeurs.P50ml, Math.round(6 * 50 ** 1.2));
  assert.deepStrictEqual(lu.modeles.map(m => [m.ref, m.Lmm, m.Veau]), [['EX 1', 1200, 1.2], ['EX 2', 1800, 1.9]]);
  assert.strictEqual(lu.reference, '');
  const x = V.choisirModele(lu, 1);
  assert.deepStrictEqual(global.FicheAnnexes.champs('radiateurs', x.valeurs).map(c => c.k).sort(), ['Lfab', 'P50fab', 'Vfab', 'n']);
});
