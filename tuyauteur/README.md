# Pipe-Fit Tuyauteur

Logiciel de calcul et de traçage pour la tuyauterie industrielle et la chaudronnerie. C'est une page HTML unique qui
fonctionne hors ligne : on l'ouvre par un double-clic sur un PC, ou sur une tablette ou un téléphone à l'atelier.

```bash
node tuyauteur/build.js      # produit dist/Tuyauteur.html
```

Le fichier `dist/Tuyauteur.html` est aussi produit par l'intégration continue : onglet **Actions** → dernière
exécution → *Artifacts* → `Tuyauteur`. Les saisies sont mémorisées dans le navigateur.

## Accueil et navigation
L'écran d'accueil présente les outils en grosses touches, faciles à viser sur un smartphone, rangées en deux groupes :
- **Pratique, atelier et chantier** : Piquages, Coudes, Baïonnette, Brides, Poids, Tubes et coudes ;
- **Étude, bureau d'études** : Développés, Platines, Escaliers, Supportage.

Chaque outil s'ouvre en plein écran. Le bouton « ‹ Menu », ou la touche retour du téléphone, ramène à l'accueil.
L'adresse de la page indique l'outil ouvert (ex. `#coudes`), ce qui permet d'en garder un en favori.

## Modules

### Coudes (encombrement)
Encombrement (centre à face, du sommet à la face) d'un coude : R × tan(angle / 2). Le coude 90° vaut le rayon,
le 45° vaut R × tan 22,5° (DN 100 3D : 152 et 63 mm). On peut ajouter un angle quelconque. Le logiciel donne aussi
les arcs d'extrados, d'axe et d'intrados, le dessin coté de chaque coude, et la table des encombrements 90° / 45°
des coudes 3D et 5D pour tous les DN. La table « Tubes et coudes » affiche aussi les encombrements à 45°.


### Piquages
Traçage d'un piquage perpendiculaire, oblique (15° à 90°) ou excentré (tangentiel), posé ou pénétrant.
- **Gabarit de coupe** à enrouler sur l'extérieur du piquage : sa largeur vaut π × Ø ext. du piquage, et le gabarit
  est numéroté par génératrice.
- **Gabarit du trou** développé sur l'extérieur du collecteur, avec l'axe du piquage et la génératrice supérieure.
- **Table de traçage** (8 à 48 divisions) : hauteur de coupe pour chaque génératrice, longueur à couper si la hauteur du
  piquage est donnée, coordonnées du trou.
- Fibres utilisées : *posé* = alésage du piquage sur l'extérieur du collecteur (le trou fait l'alésage du
  piquage) ; *pénétrant* = extérieur du piquage arrêté sur l'intérieur du collecteur (le trou fait le Ø extérieur du piquage).
- Génératrices : 0° = latérale côté excentration, 90° = côté angle obtus, 180° = latérale opposée, 270° = côté angle aigu.

### Baïonnette à coudes orientés
Renvoi parallèle réalisé avec deux coudes identiques. Le décalage peut être vertical, horizontal, ou les deux à la fois
(baïonnette orientée, aussi appelée renvoi roulé). Trois façons de calculer :
- par **l'angle** des coudes (45°, 30°, 60°, 90°, 22,5°, 15° ou un angle libre) : l'avance est calculée ;
- par **la distance** (avance le long de la ligne) : l'angle est calculé ;
- par **l'entraxe** des coudes (longueur inclinée entre sommets) : l'angle est calculé.

Résultats : décalage réel √(V² + H²), orientation des coudes par rapport à l'horizontale, entraxe, avance,
réduction par coude R·tan(α/2), longueur du tube droit à couper (moins les jeux de soudure) et encombrement.
Pour recouper les coudes, le logiciel donne les arcs d'extrados, d'axe et d'intrados. Il refuse le calcul si les
coudes se chevauchent et indique alors l'angle maximal possible.

### Développés de tôlerie (triangulation)
Un **schéma coté** au-dessus des champs montre ce qu'on saisit : vue de face (A ou Ø du bas, côté ou Ø du haut,
hauteur H, excentration ex) et vue de dessus (A × B, haut en tirets rouges, excentration ey), dessinées avec les
valeurs saisies et redessinées à chaque frappe. Le schéma est aussi repris dans le PDF.
- **Rond-carré** (rectangle A × B vers rond Ø D) ;
- **Trémie carré-carré** (rectangle bas vers rectangle haut) ;
- **Cône / réduction** (rond vers rond).

Le haut peut être excentré en X et en Y. Le calcul se fait sur la fibre neutre : les cotes intérieures sont augmentées
de l'épaisseur, les cotes extérieures diminuées. Le développé sort en 1, 2 ou 4 pièces, avec les coutures au milieu des
côtés. Chaque flan est tourné pour occuper le plus petit rectangle sur la tôle. Le logiciel donne la surface, la masse
(acier, inox ou aluminium) et le tableau des longueurs vraies pour tracer à la main.

### Platines (découpe laser)
Platine rectangulaire (angles vifs, arrondis ou chanfreinés) ou ronde, éventuellement avec un trou central. Les trous
se placent de quatre façons : 4 trous aux coins (pinces en X et en Y), une grille (lignes × colonnes avec entraxes),
un cercle (perçage de bride, angle du premier trou), ou aucun trou. Le logiciel contrôle les pinces et les entraxes
(pince ≥ 1,2 × Ø, entraxe ≥ 2,2 × Ø) et signale les trous plus petits que l'épaisseur. Il donne la masse, la surface,
la longueur de découpe et la position de chaque trou. Dans le DXF, les trous sont de **vrais cercles** (entité `CIRCLE`).

### Brides
- **Reconnaissance d'une bride sans inscription** : on compte les trous et on prend une mesure, au choix centre à
  centre de deux trous voisins, bord à bord de deux trous voisins, ou centre à centre de deux trous opposés. Le Ø des
  trous et le Ø extérieur, s'ils sont saisis, aident à départager les brides proches. Le logiciel calcule le Ø de
  perçage (K = entraxe / sin(180°/n)) et propose les brides EN 1092-1 (PN 6 à 40) et ASME B16.5 (classes 150 et 300)
  les plus proches, avec un niveau de certitude. Quand plusieurs PN ont le même perçage, ils sont regroupés
  (ex. PN 10 / 16 jusqu'au DN 150). Un bouton crée directement la **bride pleine** dans l'onglet Platines.
- **Longueur des tiges** d'un montage :
  - bride / bride ;
  - bride / filtre à brides (épaisseur de la bride du filtre modifiable) ;
  - bride / vanne papillon à insérer / bride (tiges traversantes, face à face EN 558 série 20) ;
  - bride / vanne papillon **taraudée** (à oreilles) : vis de chaque côté, avec contrôle de l'engagement dans l'oreille.

  On choisit des tiges filetées + 2 écrous ou des vis + écrou, l'épaisseur du joint et les rondelles. La longueur
  vaut serrage + écrous + 2 filets de dépassement, arrondie aux 5 mm pour les tiges et à la longueur normalisée
  ISO 4017 pour les vis.
- **Abaque** : la boulonnerie de chaque DN (15 à 600) et de chaque PN (6 à 40) pour le montage choisi.

Les épaisseurs de brides (type 11 à collerette) et les face à face des vannes sont indicatifs et modifiables.

### Escaliers et passerelles
- **Escalier** d'une volée, avec ou sans palier d'arrivée, ou **passerelle** qui monte, suit une partie droite puis
  redescend (les hauteurs de montée et de descente peuvent être différentes).
- Calcul **par l'angle** ou **par la longueur de marche** (giron), à partir de la hauteur totale et d'une hauteur de
  marche visée. Le nombre de marches est arrondi pour tomber juste sur la hauteur totale.
- Résultats : hauteur de marche, giron, angle, g + 2h, reculement, rampant, et le traçage des nez de marche.
- **Limons à plat** (DXF ou gabarit 1:1) : contour de découpe, angles de coupe au sol et en tête, traits de chaque marche.
- **Garde-corps** d'un côté, des deux côtés ou sans. Main courante à 1 000 mm sur les volées et 1 100 mm sur la partie
  droite, lisse intermédiaire, poteaux répartis (espacement maxi réglable). La **plinthe** est optionnelle, sur la
  partie droite et, au choix, le long des volées.
- **Débit** : limons, marches, plancher, main courante, lisse, poteaux, plinthe.
- Contrôles (repères ISO 14122-3) : angle conseillé de 30° à 38°, 600 ≤ g + 2h ≤ 660 mm, volée de plus de 3 m,
  garde-corps requis au-delà de 500 mm de chute, plinthe sur les passerelles.

### Carnet de supportage
Supports de tuyauterie fabriqués sur mesure. On les règle un par un, on les ajoute au carnet (conservé dans le
navigateur), puis on peut les modifier, les copier ou les supprimer.
- **Au sol** : platine chevillée, scellée ou soudée, poteau, puis traverse (étrier) ou platine de tête (collier). La
  longueur du poteau est calculée à partir de la hauteur de l'axe du tube.
- **Contre poteau** :
  - **béton** : platine avec chevilles ou scellement chimique, ou ceinture ;
  - **bois** : platine avec tire-fonds ou boulons traversants, ou ceinture ;
  - **acier** : soudé, platine avec crapauds (sans soudure ni perçage), platine boulonnée ou ceinture.

  La console est calculée à partir du déport (face du poteau → axe du tube). Une jambe de force à 45° est ajoutée
  automatiquement au-delà de 500 mm de déport.
- **Maintien du tube** : étrier DIN 3570 (entraxe et Ø de perçage) ou collier 2 pièces à embase.
- Pour chaque support : croquis coté, débit des profilés (cornières, UPN, tubes carrés, HEA, IPE) avec les usinages,
  platines à découper et quincaillerie. Pour le carnet : **PDF** avec le récapitulatif des profilés (barres de 6 m,
  masse) et de la quincaillerie, et **DXF** de toutes les platines.

Les tailles d'étriers, de colliers et de chevilles sont indicatives. Les supports ne sont pas calculés en
résistance : il faut les valider selon les charges.

### Poids
Masse des tubes ronds (DN ISO ou Ø libre), tubes carrés et rectangulaires, cornières, IPE, HEA, HEB, UPN, fers plats,
ronds et carrés pleins, tôles, disques (brides pleines) et viroles. Matières : acier, inox, galvanisé, aluminium,
cuivre, laiton, fonte.
- Résultats : masse linéique (kg/m) ou surfacique (kg/m²), masse de la pièce, masse × quantité.
- Pour les tubes, masse **en service** pour le supportage : tube + contenu (eau ou fluide de densité donnée) +
  calorifuge.
- **Liste de pièces** : on ajoute les pièces une à une, le logiciel donne le total et le sous-total par matière, et
  le PDF de la liste.
- Sources : tables EN 10365 pour les poutrelles et les UPN ; sections EN 10056-1 (cornières) et EN 10219-2 (tubes
  carrés et rectangulaires) calculées avec les rayons d'angle. Masses théoriques, sans tolérances de laminage.

### Tubes et coudes
Table des diamètres extérieurs ISO 4200 / EN 10220 (série 1, identiques à ISO 1127 en inox), des épaisseurs usuelles
et des rayons de coudes EN 10253-2 / ISO 3419 : 3D (R ≈ 1,5 × DN) et 5D (R = 2,5 × Ø). Les épaisseurs sont
indicatives et la saisie reste libre. Les rayons doivent être vérifiés sur la fiche du fabricant.

## Exports
- **PDF imprimable** : une fiche avec les données, les résultats, les tableaux et les dessins à une échelle normalisée
  (1:1, 1:2, 1:5…). En option, le **gabarit en vraie grandeur** est découpé en feuilles A4 ou A3 à assembler bord à bord.
  Chaque feuille porte un nom (A1, A2, B1…), les feuilles voisines, des croix de repérage et une **mire de 100 mm** pour
  vérifier l'impression. Il faut imprimer en taille réelle (100 %).
- **DXF R12** en millimètres, pour la découpe laser ou plasma et pour les logiciels de CAO. Les tracés sont rangés par
  calques : `DECOUPE` (contour fermé), `PLIAGE` (lignes de pliage, en tirets), `TRACAGE`, `AXES`, `COTES` et `TEXTE`.
  Pour la découpe, il suffit de garder `DECOUPE` (et `PLIAGE` si la machine fait le marquage). Quand il y a
  plusieurs pièces, elles sont placées côte à côte avec 50 mm d'écart.

## Structure
```
tuyauteur/src/normes.js     tables ISO / EN des tubes et des coudes
tuyauteur/src/geometrie.js  calculs : piquage, baïonnette, développés
tuyauteur/src/dessin.js     modèle de dessin commun, aperçu SVG, export DXF
tuyauteur/src/pdf.js        PDF (pdf-lib) : fiche et feuilles 1:1
tuyauteur/src/platine.js    platines percées
tuyauteur/src/brides.js     brides EN 1092-1 / ASME B16.5 : reconnaissance, boulonnerie, abaque
tuyauteur/src/escalier.js   escaliers et passerelles
tuyauteur/src/supportage.js supports de tuyauterie
tuyauteur/src/poids.js      calculateur de poids
tuyauteur/src/app.js        interface
tuyauteur/build.js          assemble dist/Tuyauteur.html
test/tuyauteur*.test.js     tests : résultats comparés aux formules (npm test)
```
