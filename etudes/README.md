# Pipe-Fit Études — bureau d'études fluides (CVC, tuyauterie industrielle)

Application séparée de Pipe-Fit pour les notes de calcul du bureau d'études : dimensionnement des réseaux hydrauliques,
vapeur, air comprimé et aérauliques, isolation, vases d'expansion, dilatation, épaisseur sous pression et supportage.
Une **étude** regroupe les calculs d'un même objet (réseau, chaufferie, sous-station…), rattachée à une affaire Pipe-Fit,
avec indice, rédacteur et vérificateur ; elle s'édite en **note de calcul PDF** à l'en-tête de l'entreprise.

## Calculs disponibles

| Famille | Calcul | Contenu |
|---|---|---|
| Hydraulique | Dimensionnement de tuyauterie | Débit (ou puissance et ΔT), comparaison de tous les diamètres de la série : vitesse, perte linéique, Reynolds, ΔP du tronçon ; diamètre retenu selon v max et R max |
| Hydraulique | Réseau hydraulique et pompe | Tronçons du circuit le plus défavorisé (tube imposé ou automatique), Σζ, équipements, circuit fermé ou ouvert (hauteur géométrique), HMT avec marge, puissance absorbée |
| Hydraulique | Vanne de régulation | Kv, Kvs normalisé, ΔP réelle, autorité (deux ou trois voies) |
| Hydraulique | Vase d'expansion (NF EN 12828) | Volume (saisi ou estimé selon les émetteurs), dilatation du fluide, réserve, p0, pe, volume nominal, vase du commerce, pression de remplissage |
| Industriel | Vapeur saturée et condensats | Écoulement compressible par tranches, vitesse entrée/sortie, ΔP, revaporisation et conduite de condensats |
| Industriel | Air comprimé | Débit d'air libre, pression de service, chute de pression et vitesse par diamètre |
| Aéraulique | Gaine | Gaine ronde (diamètres normalisés) ou rectangulaire (hauteur imposée), diamètre équivalent |
| Aéraulique | Réseau aéraulique et ventilateur | Tronçons (Ø ou a × b, ou automatique), Σζ, composants (filtres, batteries…), pression du ventilateur, puissance, SFP |
| Thermique | Bilan chauffage et climatisation d'un local | Local simple (L × l × H), site (température de base), murs, toiture, plancher, fenêtres, lanterneaux et portes au choix dans des listes de compositions courantes (ou U saisi), ponts thermiques, infiltrations, ventilation, extraction de process : déperditions et puissance de chauffage ; apports d'été (soleil, occupants, éclairage, air) et puissance frigorifique ; apports de process (machines, fours…) ajoutés en été et déduits ou non du chauffage |
| Thermique | Isolation des tuyauteries | Déperditions, température de surface, point de rosée (eau glacée), épaisseur commerciale retenue, énergie annuelle |
| Schémas | Schéma de principe hydraulique (P&ID) | Réseau d'eau chaude ou d'eau glacée : générateur unique ou cascade (pompe et clapet par générateur, ou pompe commune et vannes motorisées), avec ou sans bouteille de découplage, circuits vers les émetteurs (radiateurs, plancher, CTA, ventilo-convecteurs, ECS, process…) à vanne 3 voies, 2 voies ou en direct. Schéma dessiné automatiquement (SVG téléchargeable, repris dans la note de calcul), débits, diamètres, Kvs, pompes, collecteurs et bouteille dimensionnés, contrôles de cohérence. Onglet **Réglementation** : exigences selon la puissance, le générateur et l'usage du bâtiment (sécurités NF EN 12828, chaufferie au-delà de 70 kW, ICPE 2910, entretien et contrôles périodiques, inspection des systèmes, BACS, fluides frigorigènes, ECS, plancher chauffant) avec tableau des seuils. Onglet **Régulation** : analyse fonctionnelle (consignes, lois d'eau, cascade et permutation, pompes, programmation, hors gel, alarmes, GTB) et liste des points d'automate avec récapitulatif des entrées / sorties |
| Mécanique | Dilatation | Allongement, bras flexible (L, Z), lyre, course des compensateurs ; règles fabricants pour les plastiques |
| Mécanique | Épaisseur sous pression (NF EN 13480-3) | P235GH, P265GH, 304L, 316L : épaisseur requise, vérification de la série, P maxi admissible, pression d'épreuve |
| Mécanique | Portée entre supports | Tube, fluide, isolant : portée limitée par la flèche et par la contrainte, tableau pour toute la série |

Fluides : eau (0–150 °C), eau + monoéthylène ou monopropylène glycol (20, 30, 40 %), fluide aux propriétés saisies.
Séries de tubes : acier EN 10255 (noir et galvanisé) et EN 10216/10217, inox ISO 1127 et à sertir, cuivre EN 1057,
PEHD SDR 11 / 17, multicouche. L'écran « Données de référence » affiche toutes les tables utilisées.

Les résultats sont recalculés à chaque frappe. Chaque calcul affiche ses hypothèses, ses formules et des alertes
(non-conformité, point d'attention). Les **calculs rapides** (page d'accueil) se font sans rien enregistrer, puis se versent
dans une étude. Les valeurs sont des données de pré-dimensionnement : les documents des fabricants et les normes font foi.

## Lien avec Pipe-Fit

- **Connexion** : mêmes identifiants que Pipe-Fit, réservée au bureau (administrateur, chargé d'affaires).
- **Affaires** : la liste des affaires et des clients est lue dans Pipe-Fit (lecture seule, rien d'autre n'est transmis).
- Dans Pipe-Fit, l'onglet « 📐 Études » de chaque chantier ouvre ses études. L'adresse de l'application se règle dans
  Paramètres → Société (« Adresse de l'application Études ») ; vide, c'est le même serveur sur le port 3200.

## Démarrage

```
PIPEFIT_URL=http://localhost:3000 npm run start:etudes
```

| Variable | Rôle | Défaut |
|---|---|---|
| `ETUDES_PORT` | port de l'application | 3200 |
| `PIPEFIT_URL` | adresse de Pipe-Fit vue par le serveur Études | http://localhost:3000 |
| `PIPEFIT_PUBLIC_URL` | adresse de Pipe-Fit pour le lien « Pipe-Fit ↗ » du navigateur | même machine, port 3000 |
| `ETUDES_DB_FILE` | base des études | etudes/data/etudes.db |

`node etudes/build-demo.js` produit la démonstration `dist/pipefit-etudes-demo.html` (sans serveur, avec une étude d'exemple).

## Fichiers

```
etudes/server.js             serveur : connexion via Pipe-Fit, affaires, études versionnées, réglages
etudes/public/js/donnees.js  données de référence : tubes, matériaux, fluides, vapeur, ζ, isolants, aciers
etudes/public/js/calculs.js  moteur physique (Darcy-Weisbach/Colebrook, compressible, isolation, EN 12828, EN 13480-3…)
etudes/public/js/notes.js    types de calcul : champs de saisie, calcul, résultats, hypothèses, alertes
etudes/public/js/schema.js   schéma de principe hydraulique (P&ID) : dimensionnement et dessin SVG
etudes/public/js/app.js      écrans : études, calculateurs, calculs rapides, données de référence, réglages
etudes/public/js/note-pdf.js note de calcul PDF (moteur PDF de Pipe-Fit + pdf-lib de l'application DOE)
etudes/build-demo.js         démonstration en un fichier (etudes/demo-backend.js simule le serveur)
```
