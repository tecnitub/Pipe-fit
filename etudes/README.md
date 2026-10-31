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
| Hydraulique | Réseau arborescent et équilibrage | Arborescence collecteur → antennes → émetteurs (chaque tronçon désigne son tronçon amont), débits cumulés depuis les puissances des émetteurs, diamètres automatiques ou imposés, circuit le plus défavorisé, HMT et pompe ; réglage des vannes d'équilibrage sur les émetteurs, ou aussi au pied des antennes (vannes partenaires) : ΔP à dissiper, Kv de réglage, DN et ouverture ; ΔP disponible à l'entrée de chaque tronçon pour la mise en service ; schéma unifilaire départ / retour (SVG, DXF, PDF) ; tubes, vannes et pompe repris dans le métré |
| Hydraulique | Vanne de régulation | Kv, Kvs normalisé, ΔP réelle, autorité (deux ou trois voies) |
| Hydraulique | Vase d'expansion (NF EN 12828) | Volume (saisi ou estimé selon les émetteurs), dilatation du fluide, réserve, p0, pe, volume nominal, vase du commerce, pression de remplissage |
| Industriel | Vapeur saturée et condensats | Écoulement compressible par tranches, vitesse entrée/sortie, ΔP, revaporisation et conduite de condensats |
| Industriel | Air comprimé | Débit d'air libre, pression de service, chute de pression et vitesse par diamètre |
| Industriel | Purgeurs et condensats | Type de purgeur conseillé selon l'application, capacité avec coefficient de sécurité, pression différentielle disponible (contre-pression et relevage), taux de revaporisation, retour diphasique ou pompé dimensionné, pompe de relevage |
| Industriel | Gaz basse et moyenne pression | Gaz naturel H/B ou propane, appareils et simultanéité, débit normalisé, perte de pression admissible, diamètre par écoulement compressible, prescriptions (NF DTU 61.1, NF EN 15001) |
| Industriel | NPSH d'une pompe | Pression de vapeur du liquide, altitude, pertes d'aspiration, NPSH disponible et température limite de cavitation |
| Industriel | Coup de bélier | Célérité de l'onde selon le tube, fermeture brusque (Joukowsky) ou lente (Michaud), pression maximale, temps de fermeture minimal pour rester sous la PN |
| Thermique | Ventilation de chaufferie | Air de combustion et de ventilation, sections basse et haute, sections usuelles indicatives selon la puissance (à vérifier dans le texte applicable) |
| Thermique | Production d'ECS par accumulation | Besoins par usage (logements, bureaux, douches, restauration, hôtellerie), pointe, volume de stockage, temps de réchauffage, échangeur à plaques |
| Aéraulique | Gaine | Gaine ronde (diamètres normalisés) ou rectangulaire (hauteur imposée), diamètre équivalent |
| Aéraulique | Réseau aéraulique et ventilateur | Tronçons (Ø ou a × b, ou automatique), Σζ, composants (filtres, batteries…), pression du ventilateur, puissance, SFP |
| Aéraulique | Centrale de traitement d'air | Double flux, mélange air neuf / recyclé ou soufflage seul ; récupérateur (plaques, roue, boucle glycolée), batteries chaude et froide, humidificateur vapeur : évolutions de l'air hiver et été (T, HR, x, h), puissances, débits d'eau, condensats, section frontale ; pertes de charge et puissance des ventilateurs, SFP (NF EN 16798-3) ; contrôles écoconception (UE 1253/2014), givre, antigel ; schéma de principe de la CTA |
| Aéraulique | Sélection des bouches | Diffuseurs plafond, hélicoïdaux, grilles murales, extraction (gammes génériques) : taille, vitesse au col, ΔP, portée du jet, puissance acoustique et niveau dans le local |
| Aéraulique | Bilan acoustique simple | Ventilateur (estimé ou fabricant), atténuations (silencieux, gaines, coudes, dérivations, plénums), bruit des bouches, niveau dans le local selon sa réverbération, comparé à l'objectif (logements, hôtels, valeurs usuelles) |
| Thermique | Bilan chauffage et climatisation d'un local | Local simple (L × l × H), site (température de base), murs, toiture, plancher, fenêtres, lanterneaux et portes au choix dans des listes de compositions courantes (ou U saisi), ponts thermiques, infiltrations, ventilation, extraction de process : déperditions et puissance de chauffage ; apports d'été (soleil, occupants, éclairage, air) et puissance frigorifique ; apports de process (machines, fours…) ajoutés en été et déduits ou non du chauffage |
| Thermique | Isolation des tuyauteries | Déperditions, température de surface, point de rosée (eau glacée), épaisseur commerciale retenue, énergie annuelle |
| Schémas | Schéma de principe hydraulique (P&ID) | Réseau d'eau chaude, d'eau glacée ou change-over 2 tubes (PAC réversible : puissances chaud et froid par circuit, diamètres au débit le plus fort) : générateur unique ou cascade (pompe et clapet par générateur, ou pompe commune et vannes motorisées, raccordement direct ou en Tichelmann), bouteille de découplage, échangeur à plaques (secondaire décalé du pincement, surface indicative, vase secondaire) ou raccordement direct, ballon tampon (volume minimal constructeur diminué du volume de l'installation), circuits vers les émetteurs (radiateurs, plancher, CTA, ventilo-convecteurs, ECS, process…) à vanne 3 voies, 2 voies ou en direct. Schéma dessiné automatiquement (téléchargeable en SVG et en DXF pour AutoCAD avec calques départ / retour / symboles / textes, repris dans la note de calcul sur une page A4 paysage), débits, diamètres, Kvs, pompes, collecteurs et bouteille dimensionnés, contrôles de cohérence. Onglet **Réglementation** : exigences selon la puissance, le générateur et l'usage du bâtiment (sécurités NF EN 12828, chaufferie au-delà de 70 kW, ICPE 2910, entretien et contrôles périodiques, inspection des systèmes, BACS, fluides frigorigènes, ECS, plancher chauffant) avec tableau des seuils. Onglet **Régulation** : analyse fonctionnelle (consignes, lois d'eau, cascade et permutation, pompes, programmation, hors gel, alarmes, GTB) et liste des points d'automate avec récapitulatif des entrées / sorties |
| Électricité et régulation | Alimentation électrique et régulation (armoires CVC) | Pour chaque émetteur, producteur ou auxiliaire : alimenté par une **attente du lot électricité** ou par une **armoire CVC** (à la charge du lot CVC), départ (disjoncteur, contacteur, variateur, démarreur, 24 V de l'armoire), longueur de câble, régulation (marche / arrêt, retour de marche, variateur, modulation, vanne 3 points ou 0-10 V, sonde, régulation propre, bus) et armoire qui le pilote. Intensité, protection et courbe, section et chute de tension de chaque départ ; bilan de chaque armoire (phases équilibrées, foisonnement, réserve, interrupteur général, câble d'alimentation) ; **demandes au lot électricité** (alimentation des armoires, attentes des équipements, liaisons de commande) ; liste des points et entrées / sorties par armoire, **analyse fonctionnelle** ; **cahier des charges du tableautier** et **schéma unifilaire** de chaque armoire (SVG, DXF, note PDF). « ⚡ Reprendre les équipements de l'étude » ajoute générateurs, pompes, vannes, sondes, émetteurs du schéma de principe, pompes des réseaux, ventilateurs des réseaux aérauliques et des CTA, en gardant les choix déjà faits |
| Électricité et régulation | Dimensionnement des câbles (liaisons à la charge du lot CVC) | Pour chaque liaison (TGBT → armoire CVC, armoire → pompe éloignée…) : puissance ou intensité, longueur, tension, mode de pose (B, C, D enterré, E chemin de câbles perforé), isolant PR ou PVC, cuivre ou aluminium, température, circuits jointifs, protection imposée et courbe, liaison amont : Ib, In, Iz corrigé (température, groupement), chute de tension **cumulée depuis l'origine** (limite réglable, 2 % par défaut pour l'alimentation d'une armoire), longueur maxi protégée en schéma TN ; section et câble (U1000 R2V…). « 🔌 Dimensionner les câbles à notre charge » (calcul d'alimentation électrique) reprend l'alimentation des armoires et les départs dont la longueur est saisie. Note PDF à soumettre au bureau d'études électricité |
| Mécanique | Dilatation | Allongement, bras flexible (L, Z), lyre, course des compensateurs ; règles fabricants pour les plastiques |
| Mécanique | Épaisseur sous pression (NF EN 13480-3) | P235GH, P265GH, 304L, 316L : épaisseur requise, vérification de la série, P maxi admissible, pression d'épreuve |
| Mécanique | Portée entre supports | Tube, fluide, isolant : portée limitée par la flèche et par la contrainte, tableau pour toute la série |

Fluides : eau (0–150 °C), eau + monoéthylène ou monopropylène glycol (20, 30, 40 %, valeurs moyennes), fiches des
fabricants importées en CSV dans les Réglages (propriétés interpolées en température), fluide aux propriétés saisies.
La synthèse réglementaire du schéma porte le visa de relecture de l'entreprise (relecteur, date, validité, exigences
complémentaires), saisi dans les Réglages et repris dans l'onglet et la note de calcul.
Séries de tubes : acier EN 10255 (noir et galvanisé), EN 10216/10217 et ASME B36.10 Sch 40 / Sch 80, inox ISO 1127, ASME B36.19 Sch 5S / 10S / 40S et à sertir, cuivre EN 1057,
PEHD SDR 11 / 17, multicouche. L'écran « Données de référence » affiche toutes les tables utilisées.

**Calculs reliés** : dans une étude, la puissance d'un circuit du schéma de principe peut être reprise d'un bilan chauffage
et climatisation ; le bouton « Créer les notes liées » du schéma crée pour chaque circuit une note réseau et pompe et une
note vanne de régulation, et une note vase d'expansion (volume d'eau estimé d'après les tubes, émetteurs, générateurs et
bouteille). Les valeurs reprises sont recalculées à chaque modification de la note d'origine et affichées verrouillées ;
« Détacher » les transforme en valeurs saisies.

**Catalogues de pompes et de vannes** : les calculs de réseau, de vanne et le schéma proposent un modèle d'après le point
de fonctionnement (pompe couvrant le point avec 10 % de réserve, vitesse réduite estimée ; vanne au Kvs normalisé).
Sans catalogue, une gamme générique d'exemple est utilisée ; les catalogues fournisseurs s'importent en CSV dans les
Réglages (modèle de fichier téléchargeable).

**Modèles d'études** : six installations types (chaufferie en cascade, eau glacée, atelier avec bilan et aérothermes,
sous-station, PAC en change-over, distribution vapeur) et toute étude enregistrée comme modèle (« ⭐ Enregistrer comme
modèle ») servent de point de départ dans « Nouvelle étude », calculs et liens compris.

**Comparaison de variantes** : cocher deux calculs ou plus d'une étude (par exemple un calcul et sa copie modifiée)
puis « Comparer la sélection » : résultats et données d'entrée côte à côte, différences surlignées, export PDF.

Les résultats sont recalculés à chaque frappe. Chaque calcul affiche ses hypothèses, ses formules et des alertes
(non-conformité, point d'attention). Les **calculs rapides** (page d'accueil) se font sans rien enregistrer, puis se versent
dans une étude. Les valeurs sont des données de pré-dimensionnement : les documents des fabricants et les normes font foi.

**CCTP et DPGF** (« 📑 CCTP / DPGF » sur une étude) : le CCTP (PDF) et le DPGF (Excel, CSV ou PDF), chargés ici ou pris dans
les documents du chantier Pipe-Fit (catégorie CCTP, ou « DPGF » dans le nom), sont lus sur le poste. Producteurs
(chaudières, PAC, groupes froids, sous-stations), émetteurs (radiateurs, planchers, ventilo-convecteurs, aérothermes, CTA,
ECS, splits) et auxiliaires (pompes, vannes, ventilation, régulation) sont reconnus et rapprochés : quantités du DPGF,
repères, prescriptions et régime du CCTP, puissance de l'un ou de l'autre. L'inventaire se vérifie dans un tableau, puis
« 🗺️ Créer le schéma de principe » (générateurs en cascade, régime, un circuit par émetteur) et « ⚡ Créer l'alimentation
électrique » (un équipement par unité) préremplissent l'étude ; l'inventaire enregistré est aussi repris par « ⚡ Reprendre
les équipements de l'étude ». Un CCTP scanné (sans texte) ne se lit pas : demander le PDF d'origine.

## Lien avec Pipe-Fit

- **Connexion** : mêmes identifiants que Pipe-Fit, réservée au bureau (administrateur, chargé d'affaires).
- **Affaires** : la liste des affaires et des clients est lue dans Pipe-Fit (lecture seule, rien d'autre n'est transmis).
- **Bibliothèque de prix et main-d'œuvre** : lues dans Pipe-Fit pour le chiffrage.
- **Métré et chiffrage** (« 💶 Métré et chiffrage » sur une étude) : quantités tirées des calculs — tuyauteries par série
  et diamètre (raccords, supports et heures de pose compris), calorifuge, gaines, équipements du schéma (générateurs,
  pompes et vannes du catalogue, équilibrage, isolement, bouteille, vase, tampon…), heures d'études — rapprochées de la
  bibliothèque de prix ; article modifiable poste par poste, export CSV, puis **devis brouillon créé dans Pipe-Fit** pour
  l'affaire (client, contact, site, TVA du client, ouvrages fournitures + main-d'œuvre, postes sans article « hors
  bibliothèque » à prix nul).
- **Ratios du métré et calage sur le REX** (Réglages, administrateur) : heures de pose par mètre (a + b × DN) par
  matériau, calorifuge, gaines, heures par équipement, raccords et supports par mètre, chutes, forfait d'études ;
  « Caler sur le REX Pipe-Fit » lit les chantiers terminés (heures prévues aux devis acceptés et heures pointées, par
  catégorie de main-d'œuvre), laisse écarter les chantiers atypiques et applique un coefficient par main-d'œuvre
  (monteurs, calorifugeurs, bureau d'études).
- **Étude sans chantier** (avant la commande) : client et devis Pipe-Fit choisis sur l'étude ; elle figure dans le CRM
  (Devis → Études), qui la relie au chantier quand la commande arrive (ou tout seul à l'acceptation du devis) ; le
  chantier est repris ici à la prochaine ouverture. Le métré d'une étude sans chantier crée un devis brouillon pour le
  client. `#/nouvelle?client=…&devis=…&objet=…` ouvre « Nouvelle étude » préremplie (lien du CRM).
- **Note de calcul déposée dans le chantier** : depuis la fenêtre de la note PDF, « 📤 Déposer dans le chantier Pipe-Fit »
  (catégorie « Note de calcul », réservée au bureau ; un nouveau dépôt de la même étude crée un nouvel indice et garde
  l'ancien). L'application DOE la reprend en **annexe C — Notes de calcul**.
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
etudes/public/js/liens.js    liens entre calculs d'une étude (valeurs reprises, notes créées depuis un schéma)
etudes/public/js/dxf.js      export DXF (AutoCAD R12, Windows-1252) des schémas SVG
etudes/public/js/catalogue.js catalogues de pompes et de vannes (gamme générique, import CSV), choix au point de fonctionnement
etudes/public/js/modeles.js  modèles d'études intégrés et instanciation des modèles enregistrés
etudes/public/js/metre.js    métré, rapprochement avec la bibliothèque de prix Pipe-Fit, lignes de devis, ratios réglables et calage
etudes/public/js/industriel.js condensats, gaz, ventilation de chaufferie, NPSH, coup de bélier, ECS
etudes/public/js/equilibrage.js réseau arborescent, circuit le plus défavorisé, réglage des vannes d'équilibrage
etudes/public/js/inventaire.js  inventaire de l'étude d'après le CCTP et le DPGF (lecture, vérification, préremplissage) ; reconnaissance dans public/js/inventaire-cvc.js
etudes/public/js/cables.js     dimensionnement des câbles (courant admissible, chute de tension cumulée, longueur protégée)
etudes/public/js/electricite.js alimentation électrique (attentes, armoires CVC, départs, bilan), régulation (points, analyse fonctionnelle), schéma unifilaire
etudes/public/js/cta.js      centrale de traitement d'air (psychrométrie, schéma), bouches, bilan acoustique
etudes/rex.js                retour d'expérience Pipe-Fit (heures prévues / pointées) pour le calage du métré
etudes/public/js/app.js      écrans : études, calculateurs, calculs rapides, données de référence, réglages
etudes/public/js/note-pdf.js note de calcul PDF (moteur PDF de Pipe-Fit + pdf-lib de l'application DOE)
etudes/build-demo.js         démonstration en un fichier (etudes/demo-backend.js simule le serveur)
```
