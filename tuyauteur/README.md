# Pipe-Fit Tuyauteur

Logiciel de calcul et de traçage pour la tuyauterie industrielle et la chaudronnerie. C'est une page HTML unique qui
fonctionne hors ligne : on l'ouvre par un double-clic sur un PC, ou sur une tablette ou un téléphone à l'atelier.

```bash
node tuyauteur/build.js      # produit dist/Tuyauteur.html
```

Le fichier `dist/Tuyauteur.html` est aussi produit par l'intégration continue : onglet **Actions** → dernière
exécution → *Artifacts* → `Tuyauteur`. Les saisies sont mémorisées dans le navigateur.

## Modules

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

### Renvoi 3D (ligne par points)
On saisit les sommets d'une isométrique, en coordonnées absolues ou en ΔX ΔY ΔZ (X = Est, Y = Nord, Z = haut). Pour
chaque coude, le logiciel donne l'angle, la **rotation par rapport au coude précédent**, la réduction et les arcs de
recoupe. Pour chaque tronçon, il donne la longueur entre sommets, la pente et la **longueur de coupe** (moins les
réductions et les jeux de soudure). Il dessine aussi la vue isométrique. Le DXF contient l'axe réel de la ligne en 3D.

### Développés de tôlerie (triangulation)
- **Rond-carré** (rectangle A × B vers rond Ø D) ;
- **Trémie carré-carré** (rectangle bas vers rectangle haut) ;
- **Cône / réduction** (rond vers rond).

Le haut peut être excentré en X et en Y. Le calcul se fait sur la fibre neutre : les cotes intérieures sont augmentées
de l'épaisseur, les cotes extérieures diminuées. Le développé sort en 1, 2 ou 4 pièces, avec les coutures au milieu des
côtés. Chaque flan est tourné pour occuper le plus petit rectangle sur la tôle. Le logiciel donne la surface, la masse
(acier, inox ou aluminium) et le tableau des longueurs vraies pour tracer à la main.

### Tubes et coudes
Table des diamètres extérieurs ISO 4200 / EN 10220 (série 1, identiques à ISO 1127 en inox), des épaisseurs usuelles
et des rayons de coudes EN 10253-2 / ISO 3419 : 2D, 3D (R ≈ 1,5 × DN) et 5D (R = 2,5 × Ø). Les épaisseurs sont
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
tuyauteur/src/geometrie.js  calculs : piquage, baïonnette, renvoi 3D, développés
tuyauteur/src/dessin.js     modèle de dessin commun, aperçu SVG, export DXF
tuyauteur/src/pdf.js        PDF (pdf-lib) : fiche et feuilles 1:1
tuyauteur/src/app.js        interface
tuyauteur/build.js          assemble dist/Tuyauteur.html
test/tuyauteur.test.js      tests : résultats comparés aux formules (npm test)
```
