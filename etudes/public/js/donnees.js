// Données de référence du bureau d'études fluides : séries de tubes, matériaux, fluides caloporteurs, vapeur saturée,
// coefficients de pertes de charge singulières, isolants, gaines aérauliques. Valeurs usuelles de pré-dimensionnement :
// les fiches des fabricants et les normes matériaux font foi pour l'exécution.
const Donnees = (() => {
  // Séries de tubes : [DN, diamètre extérieur mm, épaisseur mm] ; rugosité absolue en mm
  const SERIES = {
    'acier-10255': { libelle: 'Acier NF EN 10255 série moyenne (tube fileté / soudé)', materiau: 'acier', rugosite: 0.045,
      tubes: [[8, 13.5, 2.3], [10, 17.2, 2.3], [15, 21.3, 2.6], [20, 26.9, 2.6], [25, 33.7, 3.2], [32, 42.4, 3.2], [40, 48.3, 3.2], [50, 60.3, 3.6], [65, 76.1, 3.6], [80, 88.9, 4.0], [100, 114.3, 4.5], [125, 139.7, 5.0], [150, 165.1, 5.0]] },
    'acier-galva': { libelle: 'Acier galvanisé NF EN 10255 série moyenne', materiau: 'acier', rugosite: 0.15,
      tubes: [[15, 21.3, 2.6], [20, 26.9, 2.6], [25, 33.7, 3.2], [32, 42.4, 3.2], [40, 48.3, 3.2], [50, 60.3, 3.6], [65, 76.1, 3.6], [80, 88.9, 4.0], [100, 114.3, 4.5], [125, 139.7, 5.0], [150, 165.1, 5.0]] },
    'acier-10216': { libelle: 'Acier NF EN 10216/10217 (P235GH / P265GH), épaisseurs courantes EN 10220', materiau: 'acier', rugosite: 0.045,
      tubes: [[15, 21.3, 2.0], [20, 26.9, 2.3], [25, 33.7, 2.6], [32, 42.4, 2.6], [40, 48.3, 2.6], [50, 60.3, 2.9], [65, 76.1, 2.9], [80, 88.9, 3.2], [100, 114.3, 3.6], [125, 139.7, 4.0], [150, 168.3, 4.5],
        [200, 219.1, 6.3], [250, 273.0, 6.3], [300, 323.9, 7.1], [350, 355.6, 8.0], [400, 406.4, 8.8], [450, 457.0, 10.0], [500, 508.0, 11.0], [600, 610.0, 12.5]] },
    // ASME B36.10M (acier) et B36.19M (inox) : diamètres extérieurs NPS, épaisseurs des schedules
    'acier-sch40': { libelle: 'Acier ASME B36.10 Sch 40 (standard)', materiau: 'acier', rugosite: 0.045,
      tubes: [[15, 21.3, 2.77], [20, 26.7, 2.87], [25, 33.4, 3.38], [32, 42.2, 3.56], [40, 48.3, 3.68], [50, 60.3, 3.91], [65, 73.0, 5.16], [80, 88.9, 5.49], [100, 114.3, 6.02], [125, 141.3, 6.55],
        [150, 168.3, 7.11], [200, 219.1, 8.18], [250, 273.0, 9.27], [300, 323.8, 10.31], [350, 355.6, 11.13], [400, 406.4, 12.70], [450, 457.0, 14.27], [500, 508.0, 15.09], [600, 610.0, 17.48]] },
    'acier-sch80': { libelle: 'Acier ASME B36.10 Sch 80 (forte épaisseur)', materiau: 'acier', rugosite: 0.045,
      tubes: [[15, 21.3, 3.73], [20, 26.7, 3.91], [25, 33.4, 4.55], [32, 42.2, 4.85], [40, 48.3, 5.08], [50, 60.3, 5.54], [65, 73.0, 7.01], [80, 88.9, 7.62], [100, 114.3, 8.56], [125, 141.3, 9.53],
        [150, 168.3, 10.97], [200, 219.1, 12.70], [250, 273.0, 15.09], [300, 323.8, 17.48], [350, 355.6, 19.05], [400, 406.4, 21.44], [450, 457.0, 23.83], [500, 508.0, 26.19], [600, 610.0, 30.96]] },
    'inox-sch5s': { libelle: 'Inox ASME B36.19 Sch 5S', materiau: 'inox', rugosite: 0.015,
      tubes: [[15, 21.3, 1.65], [20, 26.7, 1.65], [25, 33.4, 1.65], [32, 42.2, 1.65], [40, 48.3, 1.65], [50, 60.3, 1.65], [65, 73.0, 2.11], [80, 88.9, 2.11], [100, 114.3, 2.11], [125, 141.3, 2.77],
        [150, 168.3, 2.77], [200, 219.1, 2.77], [250, 273.0, 3.40], [300, 323.8, 3.96]] },
    'inox-sch10s': { libelle: 'Inox ASME B36.19 Sch 10S', materiau: 'inox', rugosite: 0.015,
      tubes: [[15, 21.3, 2.11], [20, 26.7, 2.11], [25, 33.4, 2.77], [32, 42.2, 2.77], [40, 48.3, 2.77], [50, 60.3, 2.77], [65, 73.0, 3.05], [80, 88.9, 3.05], [100, 114.3, 3.05], [125, 141.3, 3.40],
        [150, 168.3, 3.40], [200, 219.1, 3.76], [250, 273.0, 4.19], [300, 323.8, 4.57]] },
    'inox-sch40s': { libelle: 'Inox ASME B36.19 Sch 40S', materiau: 'inox', rugosite: 0.015,
      tubes: [[15, 21.3, 2.77], [20, 26.7, 2.87], [25, 33.4, 3.38], [32, 42.2, 3.56], [40, 48.3, 3.68], [50, 60.3, 3.91], [65, 73.0, 5.16], [80, 88.9, 5.49], [100, 114.3, 6.02], [125, 141.3, 6.55],
        [150, 168.3, 7.11], [200, 219.1, 8.18], [250, 273.0, 9.27], [300, 323.8, 9.53]] },
    'inox-1127': { libelle: 'Inox 304L / 316L ISO 1127 / EN 10217-7, série fine (≈ Sch 10S)', materiau: 'inox', rugosite: 0.015,
      tubes: [[15, 21.3, 1.6], [20, 26.9, 1.6], [25, 33.7, 2.0], [32, 42.4, 2.0], [40, 48.3, 2.0], [50, 60.3, 2.0], [65, 76.1, 2.0], [80, 88.9, 2.3], [100, 114.3, 2.3], [125, 139.7, 2.6], [150, 168.3, 2.6],
        [200, 219.1, 2.9], [250, 273.0, 3.6], [300, 323.9, 4.0]] },
    'inox-sertir': { libelle: 'Inox à sertir 1.4401 (EN 10312)', materiau: 'inox', rugosite: 0.015,
      tubes: [[12, 15, 1.0], [15, 18, 1.0], [20, 22, 1.2], [25, 28, 1.2], [32, 35, 1.5], [40, 42, 1.5], [50, 54, 1.5], [65, 76.1, 2.0], [80, 88.9, 2.0], [100, 108, 2.0]] },
    'cuivre-1057': { libelle: 'Cuivre NF EN 1057 écroui (R290)', materiau: 'cuivre', rugosite: 0.0015,
      tubes: [[8, 10, 1.0], [10, 12, 1.0], [12, 14, 1.0], [12, 16, 1.0], [15, 18, 1.0], [20, 22, 1.0], [25, 28, 1.0], [32, 35, 1.2], [40, 42, 1.2], [50, 54, 1.5], [65, 64, 2.0], [65, 76.1, 2.0], [80, 88.9, 2.0], [100, 108, 2.5]] },
    'pehd-sdr11': { libelle: 'PEHD PE100 SDR 11 (PN 16)', materiau: 'pehd', rugosite: 0.007,
      tubes: [[15, 20, 2.0], [20, 25, 2.3], [25, 32, 3.0], [32, 40, 3.7], [40, 50, 4.6], [50, 63, 5.8], [65, 75, 6.8], [80, 90, 8.2], [100, 110, 10.0], [100, 125, 11.4], [125, 160, 14.6], [150, 200, 18.2], [200, 250, 22.7], [250, 315, 28.6]] },
    'pehd-sdr17': { libelle: 'PEHD PE100 SDR 17 (PN 10)', materiau: 'pehd', rugosite: 0.007,
      tubes: [[40, 50, 3.0], [50, 63, 3.8], [65, 75, 4.5], [80, 90, 5.4], [100, 110, 6.6], [100, 125, 7.4], [125, 160, 9.5], [150, 200, 11.9], [200, 250, 14.8], [250, 315, 18.7], [300, 400, 23.7]] },
    'multicouche': { libelle: 'Multicouche PE-RT / Alu / PE-RT', materiau: 'multicouche', rugosite: 0.007,
      tubes: [[12, 16, 2.0], [15, 20, 2.0], [20, 26, 3.0], [25, 32, 3.0], [32, 40, 3.5], [40, 50, 4.0], [50, 63, 4.5]] },
  };
  // Matériaux : masse volumique kg/m³, module d'Young MPa, dilatation linéique 1/K, contrainte admissible de flexion par défaut (MPa)
  // C : constante du bras flexible des tubes plastiques (Lb = C·√(D·ΔL), valeurs fabricants usuelles)
  const MATERIAUX = {
    acier: { libelle: 'Acier carbone', rho: 7850, E: 210000, alpha: 12e-6, sigma: 100 },
    inox: { libelle: 'Acier inoxydable austénitique', rho: 7950, E: 195000, alpha: 16.5e-6, sigma: 100 },
    cuivre: { libelle: 'Cuivre', rho: 8930, E: 115000, alpha: 17e-6, sigma: 40 },
    pehd: { libelle: 'PEHD', rho: 960, E: 900, alpha: 200e-6, C: 26 },
    ppr: { libelle: 'PP-R', rho: 900, E: 800, alpha: 150e-6, C: 30 },
    pvc: { libelle: 'PVC-U', rho: 1400, E: 3000, alpha: 80e-6, C: 33.5 },
    multicouche: { libelle: 'Multicouche PE-RT/Alu', rho: 1200, E: 6000, alpha: 26e-6, C: 33 },
  };

  // Fluides caloporteurs. Eau : formules (Kell, Vogel) et table de cp. Mélanges glycolés (fraction massique) :
  // valeurs moyennes à 20 °C, pentes en température et viscosité tabulée (mPa·s) — fiche du fabricant de fluide à vérifier.
  const CP_EAU = [[0, 4.217], [10, 4.192], [20, 4.182], [30, 4.178], [40, 4.179], [50, 4.181], [60, 4.185], [70, 4.190], [80, 4.197], [90, 4.205], [100, 4.216], [120, 4.245], [150, 4.310], [180, 4.40], [200, 4.50]];
  const GLYCOLS = {
    meg20: { libelle: 'Eau + monoéthylène glycol 20 %', gel: -8.9, rho20: 1026, drho: -0.50, cp20: 3.87, dcp: 0.0025, mu: [[-5, 3.5], [0, 2.9], [10, 2.1], [20, 1.6], [40, 1.0], [60, 0.70], [80, 0.52], [100, 0.41]] },
    meg30: { libelle: 'Eau + monoéthylène glycol 30 %', gel: -15.6, rho20: 1040, drho: -0.55, cp20: 3.70, dcp: 0.0030, mu: [[-10, 5.6], [0, 3.8], [10, 2.7], [20, 2.0], [40, 1.25], [60, 0.85], [80, 0.63], [100, 0.49]] },
    meg40: { libelle: 'Eau + monoéthylène glycol 40 %', gel: -24.3, rho20: 1054, drho: -0.60, cp20: 3.53, dcp: 0.0035, mu: [[-20, 11], [-10, 7.3], [0, 5.0], [10, 3.5], [20, 2.6], [40, 1.6], [60, 1.07], [80, 0.78], [100, 0.60]] },
    mpg20: { libelle: 'Eau + monopropylène glycol 20 %', gel: -7.5, rho20: 1017, drho: -0.50, cp20: 3.93, dcp: 0.0025, mu: [[-5, 4.5], [0, 3.7], [10, 2.6], [20, 1.9], [40, 1.1], [60, 0.75], [80, 0.55], [100, 0.42]] },
    mpg30: { libelle: 'Eau + monopropylène glycol 30 %', gel: -13.0, rho20: 1026, drho: -0.55, cp20: 3.83, dcp: 0.0030, mu: [[-10, 8.5], [0, 5.5], [10, 3.7], [20, 2.7], [40, 1.5], [60, 0.95], [80, 0.68], [100, 0.51]] },
    mpg40: { libelle: 'Eau + monopropylène glycol 40 %', gel: -21.0, rho20: 1035, drho: -0.60, cp20: 3.68, dcp: 0.0035, mu: [[-20, 24], [-10, 14], [0, 8.5], [10, 5.5], [20, 3.8], [40, 2.0], [60, 1.2], [80, 0.85], [100, 0.62]] },
  };

  // Vapeur d'eau saturée : [pression bar absolus, température °C, volume massique vapeur m³/kg, enthalpie liquide h' kJ/kg, chaleur latente r kJ/kg]
  const VAPEUR = [[1.0, 99.6, 1.694, 417.5, 2257.9], [1.5, 111.4, 1.159, 467.1, 2226.0], [2, 120.2, 0.8857, 504.7, 2201.6], [3, 133.5, 0.6058, 561.4, 2163.4], [4, 143.6, 0.4624, 604.7, 2133.0],
    [5, 151.8, 0.3748, 640.2, 2107.4], [6, 158.8, 0.3156, 670.4, 2085.0], [7, 165.0, 0.2728, 697.0, 2064.9], [8, 170.4, 0.2403, 720.9, 2046.5], [9, 175.4, 0.2149, 742.6, 2029.5],
    [10, 179.9, 0.1944, 762.6, 2013.6], [12, 188.0, 0.1633, 798.4, 1984.3], [14, 195.0, 0.1408, 830.1, 1957.7], [16, 201.4, 0.1237, 858.6, 1933.2], [18, 207.1, 0.1104, 884.6, 1910.3],
    [20, 212.4, 0.0996, 908.6, 1888.6], [25, 223.9, 0.0799, 961.9, 1839.0]];

  // Coefficients de pertes de charge singulières ζ (valeurs usuelles, écoulement turbulent)
  const SINGULARITES = [
    ['coude90', 'Coude 90° à souder (R = 1,5 D)', 0.3], ['coude90f', 'Coude 90° fileté / raccord à sertir', 1.0], ['coude45', 'Coude 45°', 0.2], ['courbe', 'Courbe cintrée (R ≥ 3 D)', 0.15],
    ['te-dir', 'Té, passage direct', 0.4], ['te-der', 'Té, dérivation', 1.3], ['te-conf', 'Té, confluence / séparation', 1.5],
    ['reduc', 'Réduction / élargissement progressif', 0.3], ['elarg', 'Élargissement brusque', 1.0], ['entree', 'Entrée de réservoir (sortie de tuyau)', 1.0], ['sortie', 'Sortie de réservoir (entrée de tuyau)', 0.5],
    ['vanne-qt', 'Vanne à boisseau sphérique (passage intégral)', 0.1], ['papillon', 'Vanne papillon ouverte', 0.4], ['opercule', 'Robinet-vanne à opercule ouvert', 0.2], ['soupape', 'Robinet à soupape droit', 5.0],
    ['clapet', 'Clapet anti-retour à battant', 2.0], ['clapet-ressort', 'Clapet anti-retour à ressort', 4.0], ['filtre', 'Filtre à tamis en Y (propre)', 3.0], ['compensateur', 'Compensateur de dilatation', 0.5],
  ];

  // Isolants : conductivité à 10 °C (W/m·K), pente (W/m·K²), température maxi, épaisseurs commerciales (mm), masse volumique
  const ISOLANTS = {
    elastomere: { libelle: 'Mousse élastomère (type Armaflex)', lambda10: 0.033, dlambda: 0.0001, tmax: 105, tmin: -50, rho: 60, epaisseurs: [9, 13, 19, 25, 32, 40, 50] },
    'laine-roche': { libelle: 'Coquille laine de roche', lambda10: 0.034, dlambda: 0.00018, tmax: 600, tmin: 0, rho: 100, epaisseurs: [20, 25, 30, 40, 50, 60, 80, 100, 120] },
    'laine-verre': { libelle: 'Coquille laine de verre', lambda10: 0.032, dlambda: 0.00016, tmax: 250, tmin: 0, rho: 70, epaisseurs: [20, 25, 30, 40, 50, 60, 80, 100] },
    pir: { libelle: 'Coquille polyisocyanurate (PIR)', lambda10: 0.023, dlambda: 0.00008, tmax: 140, tmin: -180, rho: 35, epaisseurs: [20, 25, 30, 40, 50, 60, 80, 100] },
    pe: { libelle: 'Mousse polyéthylène', lambda10: 0.038, dlambda: 0.00015, tmax: 95, tmin: -40, rho: 30, epaisseurs: [6, 9, 13, 20, 25, 30] },
  };
  // Émissivité de la surface extérieure (revêtement)
  const REVETEMENTS = { alu: ['Tôle d\'aluminium', 0.10], 'alu-oxyde': ['Aluminium oxydé / galva', 0.25], pvc: ['PVC / revêtement peint / élastomère nu', 0.90], inox: ['Tôle inox', 0.15] };

  // Gaines aérauliques : diamètres normalisés (NF EN 1506) et dimensions de gaines rectangulaires (pas de 50 mm)
  const GAINES_RONDES = [80, 100, 125, 160, 200, 250, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000, 1120, 1250];
  const RUGOSITE_GAINE = { galva: ['Acier galvanisé spiralé', 0.09], galvaRect: ['Acier galvanisé agrafé', 0.15], souple: ['Conduit souple', 3.0], alu: ['Aluminium', 0.05], beton: ['Gaine maçonnée', 1.5] };

  // Coefficients ζ aérauliques usuels
  const SINGULARITES_AIR = [
    ['coude90r', 'Coude 90° rond à segments (R = 1,5 D)', 0.25], ['coude90q', 'Coude 90° rectangulaire avec aubes', 0.25], ['coude90s', 'Coude 90° rectangulaire sans aube', 1.2],
    ['coude45', 'Coude 45°', 0.15], ['te-der', 'Piquage / té en dérivation', 1.0], ['te-dir', 'Té passage direct', 0.3], ['reduc', 'Réduction progressive', 0.1],
    ['registre', 'Registre de réglage ouvert', 0.5], ['clapet-cf', 'Clapet coupe-feu', 0.6], ['grille', 'Grille de reprise / prise d\'air', 2.0], ['sortie', 'Sortie libre', 1.0],
  ];

  // Pression de vapeur saturante de l'eau (bar absolus), pour les vases d'expansion au-delà de 100 °C
  const PVAP = [[100, 1.013], [105, 1.208], [110, 1.433], [115, 1.691], [120, 1.985], [130, 2.701], [140, 3.613], [150, 4.758], [160, 6.178], [170, 7.917], [180, 10.02]];
  // Vases d'expansion : volumes nominaux du commerce (L)
  const VASES = [8, 12, 18, 25, 35, 50, 80, 100, 140, 200, 250, 300, 400, 500, 600, 800, 1000, 1500, 2000, 3000];
  // Kvs normalisés des vannes de régulation (série de Renard R10 arrondie)
  const KVS = [0.25, 0.4, 0.63, 1, 1.6, 2.5, 4, 6.3, 10, 16, 25, 40, 63, 100, 160, 250, 400, 630, 1000];

  // Aciers pour appareils à pression : Rm à 20 °C et limite d'élasticité à température (Rp0,2 ferritiques, Rp1,0 austénitiques), MPa
  const ACIERS_PRESSION = {
    P235GH: { libelle: 'P235GH (EN 10216-2 / 10217-2)', austenitique: false, Rm: 360, Rp: [[20, 235], [100, 198], [150, 187], [200, 170], [250, 150], [300, 132], [350, 120], [400, 112]] },
    P265GH: { libelle: 'P265GH (EN 10216-2 / 10217-2)', austenitique: false, Rm: 410, Rp: [[20, 265], [100, 226], [150, 213], [200, 192], [250, 171], [300, 154], [350, 141], [400, 134]] },
    '1.4307': { libelle: 'X2CrNi18-9 / 1.4307 (304L)', austenitique: true, Rm: 460, Rp: [[20, 215], [100, 181], [150, 162], [200, 147], [250, 137], [300, 127], [350, 121], [400, 116]] },
    '1.4404': { libelle: 'X2CrNiMo17-12-2 / 1.4404 (316L)', austenitique: true, Rm: 490, Rp: [[20, 225], [100, 199], [150, 181], [200, 167], [250, 157], [300, 145], [350, 139], [400, 135]] },
  };

  // Enveloppe de bâtiment : compositions courantes [libellé, U (W/m²·K), …]. Valeurs moyennes d'ordre de grandeur
  // (règles Th-U, bâtiments existants) : à remplacer par la valeur du DPE ou de l'étude thermique quand elle existe.
  const MURS = {
    'bardage-simple': ['Bardage simple peau acier, non isolé', 5.5], 'bardage-double-60': ['Bardage double peau, laine 60 mm', 0.6],
    'bardage-double-120': ['Bardage double peau, laine 120 mm', 0.33], 'sandwich-80': ['Panneau sandwich 80 mm', 0.30],
    'parpaing-nu': ['Parpaing 20 cm non isolé', 2.2], 'parpaing-iso': ['Parpaing 20 cm + isolant 10 cm', 0.35], 'beton-nu': ['Béton banché 18 cm non isolé', 3.0],
    'brique-nu': ['Brique creuse 20 cm non isolée', 1.5], pierre: ['Mur ancien en pierre 50 cm', 1.9], recent: ['Mur isolé performant (construction récente)', 0.20],
  };
  const TOITURES = {
    'bac-nu': ['Bac acier non isolé', 6.0], fibro: ['Plaques fibres-ciment non isolées', 5.0], 'bac-80': ['Bac acier + isolant 80 mm', 0.45],
    'bac-160': ['Bac acier + isolant 160 mm', 0.23], 'sandwich-100': ['Panneau sandwich de toiture 100 mm', 0.22], 'terrasse-nu': ['Toiture terrasse béton non isolée', 2.5],
    'terrasse-iso': ['Toiture terrasse béton + isolant 12 cm', 0.28], combles: ['Combles isolés 30 cm', 0.14], etage: ['Plafond sous local chauffé', 0],
  };
  // Planchers bas : [libellé, U équivalent, coefficient b de réduction de l'écart de température]
  const PLANCHERS = {
    'dallage-nu': ['Dallage sur terre-plein non isolé (grande surface)', 0.45, 1], 'dallage-iso': ['Dallage sur terre-plein isolé', 0.25, 1],
    vs: ['Plancher sur vide sanitaire non isolé', 1.0, 0.8], 'vs-iso': ['Plancher sur vide sanitaire isolé', 0.30, 0.8],
    'local-nc': ['Plancher sur local non chauffé (sous-sol, parking)', 1.5, 0.5], etage: ['Plancher sur local chauffé', 0, 0],
  };
  // Parois vitrées : [libellé, Uw, facteur solaire g]
  const VITRAGES = {
    simple: ['Simple vitrage, châssis métal', 5.8, 0.85], 'double-ancien': ['Double vitrage ancien, alu sans rupture', 3.5, 0.75],
    'double-recent': ['Double vitrage récent, rupture thermique', 1.6, 0.6], triple: ['Triple vitrage', 1.0, 0.5],
    polycarbonate: ['Polycarbonate alvéolaire 16 mm', 2.4, 0.6], translucide: ['Plaques translucides simples (polyester)', 5.5, 0.8],
  };
  const PORTES = {
    'sectionnelle-nu': ['Porte sectionnelle non isolée', 5.0], 'sectionnelle-40': ['Porte sectionnelle isolée 40 mm', 1.1], acier: ['Porte acier pleine', 3.5],
    rapide: ['Porte souple à enroulement rapide', 5.8], vitree: ['Porte vitrée aluminium', 3.0],
  };
  // Renouvellement d'air par infiltrations (vol/h)
  const INFILTRATIONS = { etanche: ['Bâtiment récent, étanche', 0.2], standard: ['Bâtiment courant', 0.5], ancien: ['Bâtiment ancien, peu étanche', 1.0], portes: ['Atelier avec portes souvent ouvertes', 2.0] };
  // Températures extérieures de base (hiver, NF EN 12831 / annexe nationale, altitude de la ville) et conditions d'été [libellé, Tbase hiver, T été, HR été %]
  const CLIMATS = {
    annonay: ['Annonay, Ardèche nord (Davezieux)', -10, 32, 40], lyon: ['Lyon', -10, 33, 40], 'st-etienne': ['Saint-Étienne', -10, 31, 40], valence: ['Valence', -6, 34, 35],
    grenoble: ['Grenoble', -10, 32, 40], chambery: ['Chambéry, Annecy', -10, 31, 40], clermont: ['Clermont-Ferrand', -8, 32, 40], dijon: ['Dijon', -10, 31, 40],
    paris: ['Paris', -7, 32, 40], lille: ['Lille', -9, 29, 45], strasbourg: ['Strasbourg', -15, 31, 40], nancy: ['Nancy', -15, 31, 40], limoges: ['Limoges', -8, 31, 40],
    nantes: ['Nantes', -5, 30, 45], rennes: ['Rennes', -5, 29, 45], brest: ['Brest', -4, 26, 55], bordeaux: ['Bordeaux', -5, 33, 40], toulouse: ['Toulouse', -5, 34, 35],
    montpellier: ['Montpellier', -5, 33, 45], marseille: ['Marseille', -5, 32, 45], nice: ['Nice', -2, 31, 55],
  };
  // Occupants : apports [sensible, latent] W par personne selon l'activité
  const ACTIVITES = { bureau: ['Bureau, travail assis', 75, 55], leger: ['Travail léger debout (montage, contrôle)', 90, 95], moyen: ['Travail moyen (atelier, manutention légère)', 105, 175], lourd: ['Travail lourd', 170, 255] };
  // Apports solaires de pointe à travers 1 m² de vitrage clair (W/m²), avant facteur solaire
  const SOLAIRE = { nord: ['Nord', 120], est: ['Est', 500], sud: ['Sud', 400], ouest: ['Ouest', 500], horizontal: ['Horizontal (lanterneaux)', 750] };

  return { MURS, TOITURES, PLANCHERS, VITRAGES, PORTES, INFILTRATIONS, CLIMATS, ACTIVITES, SOLAIRE, SERIES, MATERIAUX, CP_EAU, GLYCOLS, VAPEUR, SINGULARITES, ISOLANTS, REVETEMENTS, GAINES_RONDES, RUGOSITE_GAINE, SINGULARITES_AIR, PVAP, VASES, KVS, ACIERS_PRESSION };
})();
if (typeof module !== 'undefined') module.exports = Donnees;
