# Pipe-Fit Isométries – complément Revit

Complément Revit (2023 à 2027) qui produit **une isométrie de fabrication par numéro de spool** depuis la maquette 3D
(onglet **Pipe-Fit → Fabrication → Isométries spools**) et le **quantitatif pour le chiffrage automatique** dans Pipe-Fit
(**Quantitatif chiffrage**).

Le numéro de spool est attribué avec le bouton **Numéroter spools** (ci-dessous), ou renseigné à la main dans un paramètre texte des canalisations, raccords et accessoires
(paramètre partagé « Numéro de spool », « Spool »… : la fenêtre propose tous les paramètres texte trouvés et choisit
d'office celui qui est renseigné), ou dans la propriété *Spool* des pièces de fabrication MEP.

## Paramètres du projet

Bouton **Paramètres Pipe-Fit** : crée d'avance, dans le projet ou le gabarit, les paramètres partagés d'occurrence du
complément (canalisations, raccords, accessoires, canalisations souples, pièces de fabrication), à ajouter aux
nomenclatures et étiquettes Revit. Les autres boutons les créent aussi d'eux-mêmes au besoin.

| Paramètre | Type | Rempli par |
|---|---|---|
| Numéro de spool | Texte | Numéroter spools (ou à la main) |
| Ensemble de spools | Texte | Ensembles spools : ensemble de montage (zone géographique) |
| Soudures chantier (Pipe-Fit) | Texte | Soudure chantier : joints marqués (n° de connecteur:surlongueur), ne pas modifier à la main |
| Pouces soudures (Pipe-Fit) | Nombre | Isométries spools : pouces-diamètre des soudures portées par l'élément, chaque soudure comptée une fois (le raccord plutôt que le tube) ; total par spool dans une nomenclature Revit regroupée par « Numéro de spool » |

Fichier de paramètres partagés : `%AppData%\PipeFit\Parametres partages Pipe-Fit.txt` (GUID fixes : mêmes paramètres
d'un projet à l'autre).

## Numéroter les spools

Bouton **Numéroter spools** du ruban. Le paramètre « Numéro de spool » (paramètre partagé, texte, lié aux
canalisations, raccords, accessoires et pièces de fabrication) est créé dans le projet s'il n'existe pas.

- **À la main** : sélectionner un élément du spool dans Revit (un tube suffit), cliquer : tout ce qui lui est soudé,
  jusqu'aux brides, reçoit le prochain numéro libre (`SP-008` après `SP-007`), modifiable avant de valider.
- **Entièrement à la main** : choisir « Choisir moi-même tous les éléments du spool », puis cliquer dans la vue chacun
  des éléments (recliquer retire), et « Terminer » dans la barre d'options. Rien n'est ajouté ni retiré. Avant d'écrire,
  le complément signale ce qui mérite un coup d'œil : morceaux non raccordés entre eux, plusieurs systèmes, tube au-delà
  de 6 m, éléments déjà numérotés (renumérotés), numéro déjà porté par d'autres éléments ; « Non » permet de reprendre
  le choix. On enchaîne ensuite sur le spool suivant (numéro suivant) jusqu'à Échap. Sans numéro tapé dans la fenêtre,
  chaque spool prend le prochain numéro libre de son système (EGD-SP-004, puis EGR-SP-002…).
- **Automatique** : sans sélection (ou en choisissant le découpage automatique), toute la tuyauterie sans numéro est
  découpée en spools et numérotée à la suite, système par système, du plus bas au plus haut. On coupe :
  - aux joints boulonnés (bride contre bride, bride contre vanne) ; une vanne prise entre deux brides n'est dans aucun
    spool (pièce livrée à part) ;
  - au changement de système : un système Revit par fluide et par sens (départ, retour), jamais deux dans un spool ;
  - à la longueur de tube maximale (6 m par défaut, une barre du commerce) : en suivant la ligne depuis son extrémité
    basse, un nouveau spool commence dès que le tube suivant ferait dépasser 6 m ; la coupe tombe sur une soudure, qui
    devient une soudure de chantier sur les isométries et dans le quantitatif. Un tube Revit de plus de 6 m d'un seul
    tenant est signalé (à diviser dans Revit : Modifier → Diviser l'élément).
- Numérotation par système : l'abréviation du système devant le numéro (`EGD-SP-001`, `EGR-SP-001`…), ou son nom, ou
  rien (`SP-001`) ; préfixe et nombre de chiffres réglables. Chaque système a sa propre suite de numéros. Les éléments déjà
  numérotés sont conservés, sauf demande de renumérotation ; l'aperçu indique avant validation les numéros attribués.
- À la main, la sélection complétée jusqu'aux brides s'arrête aussi au changement de système, et l'aperçu prévient si
  le spool dépasse 6 m de tube.
- Les éléments numérotés restent sélectionnés : contrôle visuel, puis **Isométries spools**.

## Étiquettes sans chevauchement

Par défaut (option « Repères et n° de soudure placés sans chevauchement »), les bulles de repère, les cadres des tubes
(T1…), les numéros de soudure (S1, R1 +100…) et les cartouches de renvoi sont dessinés sur la feuille par un placeur :
chaque étiquette essaie 16 directions à des distances croissantes autour de son point (et plusieurs points le long d'un
tube) et ne retient jamais une position qui recouvre une autre étiquette, un texte de cote, un symbole, la flèche du
nord, l'échelle ou le cartouche ; elle évite aussi de couvrir la tuyauterie et les lignes de cote, et les lignes de
rappel évitent de traverser les étiquettes. Le texte d'une cote glisse le long de sa ligne s'il tomberait sur un autre.
Si une vue est trop chargée pour tout placer, un avertissement le signale (agrandir l'échelle ou la feuille).
Option décochée : étiquettes Revit (familles d'étiquettes choisies), placées par Revit.

## Robinetterie

- **Genre reconnu d'après le nom du TYPE de l'accessoire** (« Vanne papillon DN100 », « Clapet à battant », « STAD-F »,
  « Dilatoflex »…), puis d'après le nom de la famille si le type ne dit rien : vanne (opercule), vanne papillon, vanne de
  réglage / d'équilibrage (STAD, TBV, MSV…), clapet anti-retour, vanne à boisseau, filtre, compensateur de dilatation
  (Dilatoflex, manchette antivibratile, soufflet). Mots-clés français et anglais.
- **Correspondances par type** : bouton « Symboles… » de la fenêtre des isométries ; il liste les types d'accessoires
  du projet avec le symbole trouvé (et s'il vient du type ou de la famille), et permet de le corriger type par type
  (ex. « BOA-H DN80 » → vanne de réglage). Choix mémorisés dans `%AppData%\PipeFit\Symboles robinetterie.ini`, valables
  pour toutes les commandes et tous les projets.
- **Désignation** de la nomenclature : le nom du type, précédé du genre s'il ne le dit pas (« Vanne de réglage STAD-F
  DN100 »). La robinetterie garde sa propre matière (pas celle du tube).
- **Symboles d'isométrie normalisés** (option cochée par défaut) : les familles de robinetterie sont masquées dans la
  vue et le symbole de leur genre est dessiné sur la feuille, orienté sur le tube, avec sa bulle de repère : papillon
  (disque), réglage (cercle, tige, flèche de réglage), clapet (moitié aval hachurée et flèche d'écoulement), boisseau,
  filtre en Y, compensateur (soufflet).
- **Sens d'écoulement** propagé dans le spool depuis son arrivée : il oriente le clapet et l'ordre des points du PCF.
- **PCF** : VALVE avec SKEY par genre (VTFL opercule, VYFL papillon, VGFL réglage, CKFL clapet, VBFL boisseau),
  FILTER, compensateur en MISC-COMPONENT ; codes Isogen usuels, à adapter à votre configuration.
- Une vanne ou un compensateur entre deux brides est un composant boulonné : livré à part, il n'est dans aucun spool en
  numérotation automatique. Dans le CRM, le compensateur est chiffré comme la robinetterie (pose à l'unité selon le DN).

## Soudures chantier et surlongueurs

- Toute limite entre deux spools est une **soudure chantier** (R1, R2… sur l'isométrie, « Soudure chantier » dans le
  quantitatif) : coupes à 6 m, changements de système, raccordements entre spools ou vers un équipement.
- Bouton **Soudure chantier** : pour ajouter une soudure de chantier là où on veut (transport, incertitude de cote),
  cliquer près du joint dans la vue (ou l'élément puis celui d'en face) ; cliquer à nouveau un joint marqué retire la
  marque ; Échap pour terminer. Le joint est mémorisé dans le paramètre « Soudures chantier (Pipe-Fit) » (créé dans le
  projet) ; la numérotation et le découpage automatique coupent toujours le spool à cet endroit, et si les deux côtés
  avaient le même numéro, la plus petite partie prend tout de suite le numéro suivant. Pour une soudure au milieu d'un
  tube, diviser d'abord le tube dans Revit (Modifier → Diviser l'élément).
- **Surlongueur à recouper sur place** : réglage général dans la fenêtre des isométries (toutes les soudures chantier),
  et valeur propre aux joints marqués avec le bouton (100 mm proposés). Elle s'ajoute à la longueur de coupe du tube côté
  soudure chantier (liste de débit : colonne « dont surl. »), apparaît sur l'isométrie (« R1 +100 ») et dans le
  quantitatif (tube acheté surlongueurs comprises). Entre deux tubes, un seul côté la porte. La longueur maximale de tube
  d'un spool (6 m) tient compte de deux surlongueurs possibles, pour que le débit tienne dans la barre.

## Ensembles de spools (zones de montage)

Bouton **Ensembles spools** : regroupe les spools en ensembles de montage, par exemple « Ensemble A » = spools 1 à 10
d'une zone du bâtiment. Cocher des spools (ou une plage « du n° … au n° … », ou ceux de la sélection Revit), nommer
l'ensemble (« Ensemble A, B, C… » proposés), « Affecter » ; on enchaîne les ensembles sans fermer la fenêtre.
L'ensemble est écrit dans le paramètre partagé « Ensemble de spools » de tous les éléments du spool (créé au besoin,
aussi par « Paramètres Pipe-Fit ») et figure dans le tableau SPOOL des isométries.

## Repérage des spools pour le montage

Bouton **Repérage spools** : vue de repérage pour le chantier.

- Vue de départ : copie de la vue active (plan d'étage, coupe, vue 3D) ou nouvelle vue 3D isométrique de toute la
  tuyauterie (et des équipements), nommée « REPÉRAGE SPOOLS ».
- Chaque spool dans sa couleur (lignes épaisses, surfaces pleines), étiquette encadrée « n° de spool · ordre de
  montage » avec ligne de rappel ; soudures de chantier marquées « × » ; tuyauterie sans numéro en gris.
- Feuille « REP-… » avec le tableau **ORDRE DE MONTAGE** (n°, spool, couleur, posé contre, longueur de tube, feuille
  d'isométrie) et la légende. L'ordre part du spool d'arrivée (écoulement connu par Revit, sinon spool raccordé à un
  équipement, sinon le plus bas) et avance de proche en proche ; une branche de té vient juste après le spool du té.
- **Une vue par système, par ensemble, ou par système et ensemble** (ou une seule vue) : chaque vue montre ses spools
  en couleur et les autres en gris, cadrée sur leur zone (zone de coupe en 3D, cadrage en plan ou en coupe), avec sa
  feuille et son ordre de montage. Dans un ensemble, on prolonge ce qui est déjà monté : le premier spool se pose contre
  le spool de l'ensemble voisin.
- Relancer la commande remplace la vue et la feuille de repérage du même nom.

## Ce que fait la commande

Pour chaque spool coché :

| Élément | Contenu |
|---|---|
| Vue 3D `ISO <spool>` | Isométrique (sud-est, sud-ouest, nord-est ou nord-ouest), zone de coupe ajustée au spool, autres éléments masqués (isolement permanent), niveau de détail Faible (unifilaire) ou Élevé, lignes cachées, vue verrouillée |
| Repères | Écrits dans les éléments (paramètre *Marque* ou paramètre texte choisi) : `T1`, `T2`… pour les tubes dans l'ordre de la ligne, `1`, `2`… pour les raccords et accessoires (n° de nomenclature) ; étiquetés avec les familles d'étiquettes choisies |
| Soudures | `S1`, `S2`… (soudures atelier) et `R1`, `R2`… (raccordements chantier) posés sur la vue |
| Provenance / destination | À chaque extrémité du spool, flèche dans le sens de l'écoulement et cartouche **« VIENT DE … »** / **« VA VERS … »** : numéro du spool raccordé (renvoi vers son isométrie), sinon repère (*Marque*) de l'équipement (pompe, CTA, bac…), sinon nom du réseau ; « extrémité libre » si rien n'est raccordé dans la maquette. Tableau **PROVENANCE / DESTINATION** sur la feuille. Le sens est celui de l'écoulement calculé par Revit ; à défaut, la première extrémité de la ligne est l'arrivée |
| Cotes | Chaîne de cotes sur chaque tronçon droit : **d'axe en axe** entre coudes, tés, croix et piquages, **d'axe à face de bride** en bout de spool, de face à face aux joints boulonnés intermédiaires (vanne entre brides), d'axe à bout de tube quand le spool se termine sans bride. Dessinées sur la feuille, exactement superposées à la vue, valeur en mm alignée sur la ligne |
| Feuille `<préfixe><spool>` | Cartouche du projet ou cadre A3 fourni ; vue à l'échelle normalisée la plus grande qui tient (1:1 … 1:250) ; flèche du nord ; tableaux **SPOOL**, **NOMENCLATURE** (avec les pouces de soudure par ligne et leur total), **LISTE DE DÉBIT**, **ASSEMBLAGES** (soudures atelier et chantier en pouces-diamètre, joints boulonnés, extrémités libres) |
| Exports | `ISO <spool>.pdf`, `ISO <spool>.pcf` (Piping Component File pour Isogen, Spoolgen, M4 ISO, Plant 3D…), `Nomenclature spools.csv` (importable dans Pipe-Fit : *Devis → Chiffrage depuis plan*), `Soudures spools.csv`, `Cotes spools.csv`, `Liaisons spools.csv` ; dans le PCF, renvois `END-CONNECTION-PIPELINE` / `END-CONNECTION-EQUIPMENT` |

La génération complète est une seule opération Revit (annulable par Ctrl+Z). Relancer avec l'option *Remplacer*
met à jour les feuilles et vues déjà générées. Les éléments de tuyauterie sans numéro de spool sont signalés et
peuvent être sélectionnés dans le modèle depuis la fenêtre.

## Quantitatif pour le chiffrage Pipe-Fit

Bouton **Quantitatif chiffrage** du ruban (et fichier `Quantitatif chiffrage Pipe-Fit.csv` écrit avec les exports des
isométries) : le quantitatif de tout le projet, importé tel quel dans Pipe-Fit (*Devis → Chiffrage depuis plan →
Importer la nomenclature*).

| Lignes | Contenu |
|---|---|
| Fournitures | Par réseau : tubes en longueur totale (mm), raccords et robinetterie en nombre, par famille, type, DN (`DN80 x DN50` pour une réduction) et matériau |
| Soudures réelles | `Soudure atelier` (dans un spool) et `Soudure chantier` (entre deux spools ou vers un équipement), par réseau et DN |
| Joints boulonnés | `Joint boulonné atelier` (vanne entre brides dans un spool) et `Joint boulonné chantier` (bride en bout de spool) |
| Hors spool | Tuyauterie pas encore numérotée, regroupée par réseau : `Soudure` et `Joint boulonné` sans lieu, répartis par la part atelier du chiffrage |

Un raccordement entre deux spools n'est compté qu'une fois. Dans Pipe-Fit, dès que le fichier contient des soudures
réelles, elles remplacent l'estimation par famille (soudures par raccord × part atelier) : heures de préfabrication à la
cadence atelier, soudures de raccordement à la cadence chantier, montage des joints selon le barème « Montage des joints
boulonnés » (h / joint par DN) des paramètres du chiffrage. Les fournitures restent reliées aux familles CAO et aux
articles de la bibliothèque comme avant.

## Règles de calcul

- **Type de composant** : type de pièce de la famille Revit (coude, té, réduction, bride, bouchon…), sinon nom de la
  famille (« coude », « elbow », « bride », « vanne »…), sinon géométrie des connecteurs (1 = bouchon, 3 = té,
  2 de DN différents = réduction, 2 non alignés = coude).
- **Assemblages** : chaque raccordement entre deux éléments du même spool est une soudure atelier, sauf entre
  deux éléments boulonnables (bride, vanne, accessoire) : joint boulonné. Un raccordement vers un élément d'un autre
  spool (ou sans spool) est un raccordement chantier ; un connecteur libre, une extrémité libre.
- **Points de cote** : le point d'axe d'un coude ou d'un té est l'intersection des axes de ses connecteurs (sommet du
  coude), indépendamment du point d'insertion de la famille ; la face de bride est le connecteur de la bride côté
  extérieur du spool. Les réductions concentriques et les manchons ne coupent pas la chaîne.
- **Pouces-diamètre** : DN50 = 2", DN65 = 2,5", DN100 = 4"… (même base que le chiffrage Pipe-Fit).
- **Ordre** : la ligne est parcourue depuis son extrémité la plus basse ; les tubes sont repérés dans cet ordre.
- Les raccords sans matériau prennent celui du tube auquel ils sont raccordés.

## Installation sur un poste

Télécharger `PipeFit-Revit-Isometries-x.y.z.zip` (onglet **Actions** du dépôt → dernière exécution →
*Artifacts*), le décompresser, fermer Revit et lancer **`Installer.bat`** : le complément est copié dans
`%AppData%\Autodesk\Revit\Addins\<version>` pour chaque version de Revit installée, sans droits administrateur.
`Installer.bat -Desinstaller` le retire.

## Développement

```
revit/
  src/Core/        calculs sans Revit : analyse du spool, nomenclature, débit, assemblages, PCF, CSV, mise en page
  src/Revit/       lecture du modèle, génération des vues et feuilles, commande, ruban
  src/UI/          fenêtre de réglages (WinForms)
  test/            tests du cœur de calcul : dotnet run --project revit/test
  demo/            démonstration web (3 spools d'exemple calculés par le cœur) : bash revit/demo/build.sh
  installer/       manifeste .addin et installeur PowerShell
  build.sh         compile pour Revit 2023 → 2027 et produit dist/PipeFit-Revit-Isometries-x.y.z.zip
```

Compilation d'une version : `dotnet build revit/src -c Release -p:RevitVersion=2025`
(Revit 2023-2024 : .NET Framework 4.8 ; 2025-2026 : .NET 8 ; 2027 : .NET 10). Les références de l'API Revit
viennent des paquets NuGet `Nice3point.Revit.Api.*` : pas besoin de Revit pour compiler, y compris sous Linux.
