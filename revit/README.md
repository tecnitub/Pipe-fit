# Pipe-Fit Isométries – complément Revit

Complément Revit (2023 à 2027) qui produit **une isométrie de fabrication par numéro de spool** depuis la maquette 3D
(onglet **Pipe-Fit → Isométries → Isométries spools**) et le **quantitatif pour le chiffrage automatique** dans Pipe-Fit
(**Quantités Excel** : classeur Excel ou CSV du chiffrage).

Le numéro de spool est attribué avec le bouton **Numéroter spools** (ci-dessous), ou renseigné à la main dans un paramètre texte des canalisations, raccords et accessoires
(paramètre partagé « Numéro de spool », « Spool »… : la fenêtre propose tous les paramètres texte trouvés et choisit
d'office celui qui est renseigné), ou dans la propriété *Spool* des pièces de fabrication MEP.


## Le ruban Pipe-Fit

| Groupe | Commandes |
|---|---|
| **Spools** | Numéroter (bouton partagé : Numéroter spools / Générer un spool), Soudure chantier, Ensembles de spools |
| **Isométries** | Isométries spools, Ajouter une cote, Repérage de montage, Quantités Excel |
| **Schémas** | Schéma de principe (P&ID) |
| **Calculs** | Hydraulique (perte de charge, équilibrage), Aéraulique (perte de charge du réseau, débit et vitesse) |
| **Réglages** | Paramètres spools, Paramètres calculs, Diagnostic |

Les fenêtres sont dessinées pour 96 ppp et mises à l'échelle par Windows (125 %, 150 %…) : positions et textes suivent
ensemble ; un libellé trop long est raccourci (« … ») avec une info-bulle. Un contrôle automatique sous Windows
(`revit/ergonomie`, workflow « Ergonomie Revit ») ouvre chaque fenêtre et signale chevauchements et textes coupés.

## Générer un spool (le plus simple)

Bouton **Générer un spool** : sélectionner dans Revit, avec Ctrl (ou une fenêtre de sélection), toute une partie de
tuyauterie (tubes, raccords, brides, robinetterie), puis cliquer. Une petite fenêtre propose le prochain numéro libre
(modifiable ; si les éléments portent déjà tous le même numéro, l'isométrie est régénérée) et signale ce qui mérite un
coup d'œil (morceaux non raccordés, plusieurs systèmes, plus de 6 m de tube). « Générer l'isométrie » : le numéro est
écrit sur les éléments (paramètre « Numéro de spool » créé s'il manque) et l'isométrie est générée et ouverte, avec les
réglages de la fenêtre des isométries (cartouche, cotes, symboles, exports). Sans sélection préalable, cliquer les
éléments puis Terminer.

## Dépannage

Toute erreur d'un bouton Pipe-Fit est affichée en clair (détail dépliable) et écrite dans
`%AppData%\PipeFit\journal.txt` : envoyer ce fichier pour le dépannage. Les traits trop courts pour Revit (moins de
1,2 mm sur la feuille) ne sont jamais tracés tels quels : les cercles sont de vrais arcs et les petits segments des
symboles sont redécoupés ; chaque étape d'annotation (cotes, symboles, repères, légende…) est non bloquante.

## Paramètres du projet

Bouton **Paramètres spools** (groupe Réglages) : crée d'avance, dans le projet ou le gabarit, les paramètres partagés d'occurrence du
complément (canalisations, raccords, accessoires, canalisations souples, pièces de fabrication), à ajouter aux
nomenclatures et étiquettes Revit. Les autres boutons les créent aussi d'eux-mêmes au besoin.

| Paramètre | Type | Rempli par |
|---|---|---|
| Numéro de spool | Texte | Numéroter spools (ou à la main) |
| Ensemble de spools | Texte | Ensembles spools : ensemble de montage (zone géographique) |
| Soudures chantier (Pipe-Fit) | Texte | Soudure chantier : joints marqués (n° de connecteur:surlongueur), ne pas modifier à la main |
| Perte de charge bouche (Pa) | Nombre | Paramètres perte de charge : perte fabricant des bouches d'air, lue par la perte de charge aéraulique |
| Perte de charge équipement hydraulique (kPa) | Nombre | Paramètres perte de charge : perte côté eau des équipements et accessoires de canalisation (batterie, échangeur, vanne…), lue par la perte de charge hydraulique |
| Perte de charge équipement aéraulique (Pa) | Nombre | Paramètres perte de charge : perte côté air des équipements et accessoires de gaine (CTA, filtre, registre, silencieux…), lue par la perte de charge aéraulique |
| Débit hydraulique (m³/h) | Nombre | Paramètres calculs : débit d'eau des équipements (ventilo-convecteur, batterie, émetteur…) ; la perte de charge hydraulique en déduit les débits du réseau quand Revit n'en calcule pas |
| Débit aéraulique (m³/h) | Nombre | Paramètres calculs : débit d'air des bouches et équipements, lu par les calculs aérauliques quand Revit ne le donne pas |
| Cotes ajoutées (Pipe-Fit) | Texte | Ajouter une cote : points d'attache des cotes ajoutées à la main, ne pas modifier à la main |
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

## Liste de débit

- La longueur d'un tube est celle de l'élément dans Revit (paramètre « Longueur » de la canalisation ; longueur d'axe
  pour une pièce de fabrication), arrondie au mm. La **coupe** y ajoute la surlongueur à recouper sur place.
- Tableau **LISTE DE DÉBIT** de chaque isométrie : repère, DN, longueur Revit, surlongueur, coupe, **système de
  canalisation** (type de système Revit : « Eau glacée départ »…, à défaut nom du système).
- Fichier **Liste de débit.csv** (exports CSV) pour l'atelier, tous spools générés : classé par système de canalisation,
  DN et matière, du plus long au plus court, avec la **barre du commerce** où couper chaque tube (barres de la longueur
  réglée pour la numérotation, 6 m par défaut, trait de scie 3 mm ; « hors barre » pour un tube plus long).

## Légende des symboles

- Sur chaque isométrie, bande **LÉGENDE** sous le dessin (à gauche du cartouche, deux symboles par ligne) : les
  symboles présents sur la feuille, dessinés comme sur le dessin (repère de tube, repère de nomenclature, soudure
  atelier, soudure chantier et surlongueur, cote, renvoi, nord, et chaque type de robinetterie présent).
- Feuille **ISO-LÉGENDE** (option « Feuille de légende de tous les symboles », cochée) créée avec les isométries :
  tous les symboles, en deux tableaux (repères, soudures, cotes ; robinetterie et accessoires), à joindre au dossier.

## Cotes toujours à l'axe

- **Té, croix, piquage : une seule cote par branche**, du bout de la branche à l'axe de la conduite principale ; la
  conduite principale est cotée **d'un seul tenant** (d'un point d'épure ou d'une bride à l'autre), et une **cote de
  position** situe la branche : d'une extrémité de la conduite (point d'épure de préférence, sinon la plus proche) à
  l'axe de la branche.

- Toutes les cotes vont **d'axe en axe ou au point d'épure** (intersection des axes) : sommet des coudes, centre des tés,
  axe du collecteur sous un piquage, axe des vannes ; face de bride et bout de tube sont sur l'axe.
- Les raccords sont reconnus d'abord par leur **type de pièce Revit** (coude, té, croix, réduction, bouchon, piquage),
  puis par le nom de la famille : un coude nommé « Courbe » ou « Raccord soudé 90° » est coté à son point d'épure.
- Garde-fou géométrique : toute pièce à deux raccordements qui **change de direction** est un nœud coté à son point
  d'épure, jamais traversée par une cote ; l'angle du coude est lu sur les directions des raccordements.
- **Réduction excentrée** (axe décalé) : la cote s'arrête à sa face d'entrée et repart de sa face de sortie, pour ne
  jamais relier deux axes différents.

## Cotation des vannes et brides

- **Bride** : la cote s'arrête au bout de la bride (face de bride).
- **Vanne et robinetterie en ligne** (vanne, clapet, filtre, compensateur / dilatoflex…) : la cote s'arrête à l'**axe** de
  la vanne (milieu entre ses deux faces) ; la chaîne donne face de bride → axe → face de bride.
- **Nomenclature** : colonne « Encombrement » = face à face (mm) de chaque vanne ou accessoire en ligne ; même valeur dans le CSV
  de nomenclature (colonne « Face à face (mm) »). Deux vannes de même désignation mais de face à face différent sont sur
  deux lignes.
- **Textes des tableaux** : 2 mm (hauteur des majuscules, police Arial) ; la largeur de chaque texte est estimée
  caractère par caractère et le texte est raccourci (« … ») pour ne jamais déborder sur la colonne voisine ; les titres
  de colonnes tiennent toujours entiers (la nomenclature passe à 150 mm de large avec la colonne Encombrement).

## Ajouter une cote

- Bouton **« Ajouter une cote »**, dans une **vue en plan (vue de dessus) ou une coupe** — pas en 3D — avec la précision
  d'une **cote alignée** :
  1. **convertir des cotes alignées Revit** (recommandé) : dessinez la cote avec l'outil Revit « Cote alignée », qui
     s'accroche précisément aux axes et extrémités des tuyauteries, sélectionnez-la, cliquez. Chaque ligne d'attache est
     rattachée au point d'attache de la pièce visée le plus proche le long de la cote (axe d'un coude / té, axe d'une
     vanne, face de bride, bout de tube) ; une cote à plusieurs segments donne plusieurs cotes ;
  2. **cliquer deux points** avec accrochage (extrémités, milieux, intersections, perpendiculaire) : la pièce la plus
     proche de chaque point, dans le plan de la vue, est retenue.
- La cote garde **sa direction de mesure** : la valeur reportée sur l'isométrie est la projection sur cette direction
  (comme une cote alignée), **recalculée sur la géométrie à chaque génération** ; elle est tracée sur l'isométrie suivant
  cette direction.
- Enregistrée sur le 1er élément (paramètre « Cotes ajoutées (Pipe-Fit) ») ; reprendre la même cote la retire ; une cote
  déjà générée automatiquement n'est pas doublée.

## Piquages

- **Piquage Revit = branche piquée directement sur le collecteur.** Revit dessine un raccord à piquage avec une longueur ;
  en atelier, c'est le tube de branche qui est piqué sur le collecteur. Le complément :
  - garde **une seule soudure, côté collecteur** (celle côté tube de branche est ignorée, même si la branche est dans
    un autre spool : pas de soudure chantier sur le piquage) ;
  - **ne tient pas compte du piquage ni de sa longueur** : la branche est cotée **de l'axe du collecteur** (connecteur
    Revit projeté sur l'axe du tube collecteur) **à la bride** (ou au bout de la branche, ou à l'axe du raccord suivant),
    y compris quand le piquage est dans le spool du collecteur et la branche dans un autre spool ; aucune cote sur la
    longueur du piquage ; **une seule cote par piquage**, du bout de la branche à l'axe du collecteur ; le collecteur est coté d'un seul tenant, avec une cote de position du piquage ;
  - la liste de débit et le quantitatif prennent **la longueur Revit du tube de branche**, sans ajouter le piquage ;
  - ne compte **pas de pièce** pour le piquage (ni nomenclature, ni quantitatif, ni bulle).
- Les olets et selles (weldolet, sockolet, threadolet, selle, bossage) restent des pièces en nomenclature ; comme pour
  tout piquage, seule leur soudure sur le collecteur est comptée.

## Symbole des brides

- Chaque bride en ligne est dessinée sur la feuille par le symbole **collet + bride tournante** : lèvre du collet à la
  face de joint (côté vanne, autre bride ou équipement), épaulement, et bride libre derrière la lèvre (deux rectangles
  qui ne touchent pas le tube). La famille Revit de la bride est masquée dans la vue (option « symboles normalisés »).
- Le symbole figure dans la légende de l'isométrie et dans la feuille de légende.

## Robinetterie

- **Genre reconnu d'après le seul nom de la FAMILLE de l'accessoire** (« Vanne papillon », « Clapet à battant », « IMI STAF »,
  « Dilatoflex »…) ; le nom du type n'est jamais lu. Famille sans mot reconnu : vanne par défaut. Genres : vanne (opercule), vanne papillon, vanne de
  réglage / d'équilibrage (STAD, TBV, MSV…), clapet anti-retour, vanne à boisseau, filtre, compensateur de dilatation
  (Dilatoflex, manchette antivibratile, soufflet). Mots-clés français et anglais.
- **Brides dessinées dans une famille de vanne** (catégorie accessoire de canalisation) : si le nom de la famille dit
  « bride », « collerette », « flange » (ou coude, réduction, té, bouchon, manchon) sans nommer de robinetterie, la pièce
  est traitée comme une bride : pas de symbole de vanne, cotes axe à bride, soudure au tube, matière du tube.
  « Vanne à brides » ou « VPI 4648 entre brides » restent des vannes.
- **Références des fabricants installés par TECNITUB** (fiche technique robinetterie) reconnues d'office dans le nom de la famille, même sans mot
  descriptif : ASTORI 304 / 304AB (boisseau), TECOFI VPI 4648 / VPE 4508 (papillon), F 3240 (filtre),
  CB 3448 (clapet double battant), DI 7240 (manchon anti-vibratile), IMI STAD / STAF et CGR 165 (réglage), SIEMENS V2V
  (vanne 2 voies motorisée), FLAMCO FLEXVENT (purgeur), WIKA 818 (manomètre), CGR 293CB / 294CB (thermomètre), CGR 369
  (compensateur).
- **Appareils sur piquage** (un seul raccordement) : purgeur d'air, manomètre, thermomètre ont leur symbole, dessiné
  depuis le piquage vers l'appareil ; leur raccordement vissé compte comme joint démontable, pas comme soudure.
- **Correspondances par famille** : bouton « Symboles… » de la fenêtre des isométries ; il liste les familles
  d'accessoires du projet (avec leurs types pour information) et le symbole trouvé, et permet de le corriger famille par
  famille (ex. « KSB BOA-H » → vanne de réglage). Choix mémorisés dans `%AppData%\PipeFit\Symboles robinetterie par famille.ini`, valables
  pour toutes les commandes et tous les projets.
- **Pente** : un tube en pente (0,05 à 25 %) porte « pente x % » dans son cadre de repère et une flèche vers son
  extrémité basse.
- **Désignation** de la nomenclature : nom de la famille puis du type, précédés du genre s'ils ne le disent pas
  (« Vanne de réglage IMI STAF DN100 »). La robinetterie garde sa propre matière (pas celle du tube).
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

Organisation : **système → spools → ensembles**. Chaque système de canalisation est découpé en spools, eux-mêmes
regroupés en ensembles de montage pour le repérage. Un ensemble est propre à son système (« Ensemble A » d'EGD et
« Ensemble A » d'EGR sont distincts ; le repérage les nomme « EGD – Ensemble A »).

- **Automatique à la numérotation** (case « Former les ensembles de montage par système », N spools par ensemble,
  10 par défaut) : après le découpage automatique, chaque système est découpé en ensembles de N spools qui se suivent
  dans l'ordre de montage (spools voisins sur la ligne) ; les lettres continuent après les ensembles déjà formés du système.
- **Bouton Ensembles spools** : « Former les ensembles » (automatique, par système, sur les spools cochés ou tous), ou
  à la main : cocher des spools (plage « du n° … au n° … », sélection Revit), nommer l'ensemble, « Affecter ».
- L'ensemble est écrit dans le paramètre partagé « Ensemble de spools » de tous les éléments du spool et figure dans le
  tableau SPOOL des isométries.

## Repérage des spools pour le montage

Bouton **Repérage spools** : vue de repérage pour le chantier.

- Vue de départ : copie de la vue active (plan d'étage, coupe, vue 3D) ou nouvelle vue 3D isométrique de toute la
  tuyauterie (et des équipements), nommée « REPÉRAGE SPOOLS ».
- Chaque spool dans sa couleur (lignes épaisses, surfaces pleines), étiquette encadrée « n° de spool · ordre de
  montage » avec ligne de rappel ; soudures de chantier marquées « × » ; tuyauterie sans numéro en gris.
- Feuille « REP-… » avec le tableau **ORDRE DE MONTAGE** (n°, spool, couleur, posé contre, longueur de tube, feuille
  d'isométrie) et la légende. L'ordre part du spool d'arrivée (écoulement connu par Revit, sinon spool raccordé à un
  équipement, sinon le plus bas) et avance de proche en proche ; une branche de té vient juste après le spool du té.
- **Une vue par système et ensemble** (proposé d'office quand des ensembles existent), par système, par ensemble, ou une seule vue : chaque vue montre ses spools
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

## Schéma de principe (P&ID)

Bouton **Schéma de principe (P&ID)** (groupe Schémas) : reprend en filaire les éléments dessinés en 3D.
- **P&ID du projet** (lancé sans sélection, ou choix « Les P&ID du projet ») : fenêtre avec la liste des P&ID (cochés =
  à générer) et, pour chacun, **les types de systèmes qui lui appartiennent** (un système peut être dans plusieurs P&ID).
  Proposition automatique d'après les noms : **PID chaud** (chauffage, eau chaude…), **PID froid** (eau glacée,
  refroidissement…), **PID aéraulique** (gaines), PID autres réseaux ; ajouter, renommer, supprimer. Les définitions sont
  enregistrées **dans le projet** (paramètre « P&ID Pipe-Fit (définitions) » des informations du projet). Chaque P&ID
  reprend les éléments de ses systèmes, les raccords et accessoires sans système et les équipements / bouches raccordés,
  et se dessine dans sa vue « PID – nom » (mise à jour au même endroit à chaque génération).
- **Réseau sélectionné** : sélectionnez un élément, cliquez, choisissez « tout le réseau relié » ou « la sélection seulement ».
- **symbole d'après le seul nom de la famille, comme les isométries** (le nom du type n'est pas lu ; correspondances
  « Symboles… » comprises) : accessoire → vanne du genre reconnu, ou raccord si la famille le dit (bride, réduction, té) ;
  raccord → vanne si sa famille nomme une robinetterie, sinon réduction / té d'après le nom puis le type de pièce Revit ;
  équipement → pompe, production / CTA (source) ou vanne (vanne 3 voies, filtre…) d'après le nom ;
- tubes, coudes, brides, manchons fondus en lignes ; restent les **tés** (point), **vannes** (symboles de la légende des
  isométries : papillon, réglage, clapet, filtre, motorisée…), **réductions**, **pompes**, **équipements** (cadre avec
  repère et famille), **bouches**, extrémités libres ;
- départ de la **source** (production, CTA, sinon le plus gros équipement) ; tronc horizontal, chaque dérivation sur sa
  propre ligne en dessous, **sans croisement** ; **l'aller avant le retour** (classification des systèmes Revit) : les
  équipements sont en aval de l'aller, le retour part d'eux et **est tracé jusqu'à son arrivée** (bas du cadre de la
  production, té du collecteur retour) : parmi plusieurs tracés orthogonaux, celui qui ne traverse ni symbole ni texte,
  croise le moins de lignes et reste le plus court ; **là où deux lignes se croisent, le tracé est interrompu** (espace de
  1,3 mm de part et d'autre) pour la lecture ; renvoi « vers … » seulement si aucune liaison n'est possible ;
- **départ et retour gardent la couleur, le motif de ligne et l'épaisseur du type de système Revit** (styles de ligne
  « Pipe-Fit schéma - système » créés et mis à jour à chaque schéma) ;
- **réseau et DN** (ou Ø, l × h) écrits sous les lignes à chaque changement ;
- **instruments** en bulle normalisée : manomètre « PI », thermomètre « TI » ;
- **légende** sous le schéma : chaque symbole présent et le style de ligne de chaque réseau ;
- dessiné dans une vue de dessin (1:10) « PID – réseaux » : relancer après une modification de la maquette **redessine
  la même vue** (elle garde sa place sur la feuille) ; option « placer le schéma sur une feuille » (nouvelle feuille
  PID-01… avec le cartouche du projet).

## Diagnostic

Bouton **Diagnostic** (groupe Réglages) : rapport Excel de ce que Pipe-Fit reconnaît dans le projet, à envoyer pour la mise
au point : versions, éléments par catégorie, paramètres Pipe-Fit présents, robinetterie (genre et symbole d'après le
nom de famille), raccords (type déduit), systèmes (classification, aller / retour, couleur), équipements et bouches
(rôle, pertes de charge et débits trouvés et leur source), fin du journal des erreurs.

## Calculs : perte de charge hydraulique, débit et vitesse en ventilation

Groupe **Calculs** de l'onglet Pipe-Fit : menu **Hydraulique** (Perte de charge du chemin sélectionné, Équilibrage des
boucles et Kv) et menu **Aéraulique** (Perte de charge du réseau CTA → bouches, Débit, vitesse et dimensionnement) ;
« Paramètres calculs » est dans le groupe Réglages.

**Perte de charge** (tuyauterie dessinée) : sélectionnez le chemin à calculer (tubes, raccords, vannes ; Ctrl ou
fenêtre), cliquez. Pour chaque élément :
- diamètre intérieur et rugosité du **segment de tuyau Revit**, longueur ; débit du **calcul de débit Revit**, sinon le
  débit saisi (repéré *) ;
- fluide : eau, eau + MEG ou eau + MPG (pourcentage), à la température choisie (masse volumique et viscosité calculées) ;
- perte linéaire **Darcy-Weisbach**, λ de **Colebrook-White** (64/Re en laminaire) ; pertes singulières ζ·ρv²/2 avec ζ
  par défaut : coude 90° 0,3 (au prorata de l'angle), té selon la répartition des débits (ci-dessous),
  réduction 0,1, vanne 0,2, papillon 0,3, boisseau 0,1, vanne de réglage 6, clapet 2, filtre 2,5, vanne motorisée 4,
  compensateur 0,2 ;
- tableau : débit, ζ et **perte fixe** (valeur fabricant en Pa : batterie, échangeur…) modifiables, recalcul immédiat ;
  alertes (vitesse > maxi, < 0,3 m/s, > 250 Pa/m) ; **ΔP totale en kPa et mCE** ; note de calcul **Excel**.

**Paramètres calculs** : crée les trois paramètres de perte de charge fabricant et les deux paramètres de **débit**
(hydraulique et aéraulique, m³/h ; valeurs déjà présentes reconnues : paramètre Revit « Débit », « Airflow », « Débit (l/s) »,
cfm, l/h, débit des raccordements…). Débits hydrauliques : quand Revit n'en calcule pas, ceux des équipements
consommateurs sont additionnés en aval de la production ou de la pompe (le parcours s'arrête aux équipements, l'aller ne
passe pas au retour). Pertes de charge : il crée les trois paramètres de perte de charge fabricant (tableau des paramètres
ci-dessus) sur les bouches, équipements de génie climatique, accessoires de canalisation et de gaine, et **recopie les
valeurs déjà présentes dans les familles** mais inutilisables par le calcul : paramètre Revit « Perte de charge »,
paramètre de famille nommé « Pressure Drop », « ΔP (kPa) », « Chute de pression (mbar) », « Dp_mCE », texte « 25 Pa »…,
perte de charge des raccordements de la famille ; l'unité est lue dans le nom ou le texte (Pa, kPa, mbar, bar, mCE,
mmCE, psi, inWG) et convertie. Choix : récupérer sans écraser, tout remplacer, ou créer seulement ; bilan par paramètre
(déjà renseignés, récupérés, à saisir). Dans les calculs, une perte fabricant **remplace le ζ par défaut** de l'élément ;
sans paramètre renseigné, la valeur trouvée dans la famille est prise quand même. La perte côté air de la **CTA** est
ajoutée en tête de chaque chemin : le total devient la pression au ventilateur.

**Perte de charge aéraulique** (réseau de ventilation) : sélectionnez une gaine du réseau (ou la CTA), cliquez.
- le réseau relié est parcouru de la **CTA** (sinon de l'élément de plus grande section) jusqu'à **chaque bouche** ;
- un **chemin par bouche** : gaines (Pa/m), coudes, tés **en passage ou en dérivation selon le chemin**, transitions,
  registres, clapets coupe-feu, silencieux, bouche (perte fabricant à saisir en Pa, signalée tant qu'elle manque) ;
- débits : calcul Revit, sinon somme des bouches en aval ;
- le **chemin le plus défavorisé** est en tête de liste : sa perte de charge est la **pression du réseau au
  ventilateur** (la perte propre de la CTA n'est pas comptée) ; chaque chemin peut être affiché, modifié (ζ, pertes
  fixes, débits) et **sélectionné dans Revit** ; note de calcul Excel du chemin affiché.

**Note de calcul** (bouton « Note de calcul (PDF, Excel)… » des fenêtres de calcul) : cartouche (titre, projet, n°
d'affaire, indice, date, société, rédacteur, vérificateur), objet, hypothèses (une par ligne ; fluide et méthode ajoutés
automatiquement) et conclusion pré-remplis d'après les résultats et **modifiables** ; société, rédacteur, vérificateur et
affaire mémorisés. Exports :
- **PDF** A4 paysage, sans logiciel tiers : cartouche, objet, hypothèses, tableau par élément (Re, λ, J, ζ, Pd, pertes
  linéaire / singulière / totale) paginé avec en-têtes répétés, remarques, chemins du réseau, résultat encadré
  (kPa / mCE, pression du réseau au ventilateur), conclusion, pied de page « page x / N » ;
- **Excel** : la même note dans un classeur (tableau filtrable, totaux en formules, remarques, conclusion).

**Équilibrage hydraulique** : cliquez un élément du circuit (aller et retour dessinés). Source : production (groupe froid,
chaudière, PAC, sous-station…) ou pompe ; consommateurs : équipements avec « Débit hydraulique (m³/h) ». Pour chaque
consommateur, sa **boucle** (aller depuis la source, l'équipement, retour vers la source : deux chemins sans élément
commun) ; débit de chaque élément = somme des boucles qui le traversent ; pertes des tubes, raccords, tés (selon les
débits), vannes et pertes fabricant ; **boucle critique** (sa vanne garde au moins 3 kPa) ; **pression à dissiper** et
**Kv requis** (Q / √ΔP en bar) de chaque vanne de réglage (STAD, STAF…) ; **point de fonctionnement de la pompe**
(débit total, hauteur réseau + production en kPa et mCE) ; note de calcul PDF / Excel.

**Écrire dans la maquette** (bouton des fenêtres de calcul) : paramètres « Vitesse calculée (m/s) », « Perte linéaire
calculée (Pa/m) », « Perte de charge calculée (Pa) » sur les éléments calculés, et filtre « Pipe-Fit – vitesse > x m/s »
ajouté à la vue active (éléments trop rapides en rouge).

**Tés et dérivations** (hydraulique et ventilation) : chaque voie du té prend le diamètre (ou la section) et le débit
de l'élément raccordé, même hors sélection ; la voie commune est celle du plus fort débit, la sortie celle du chemin.
Le tronçon du té a **la section et le débit de la sortie** (la branche en dérivation) et
ζ = ζc × (vc/vs)² avec, d'après Idelchik (té à 90°, écoulement divergent) : dérivation ζc = 0,9 × (1 + (vs/vc)²),
passage ζc = 0,4 × (1 − vs/vc)². Débits inconnus : ζ par défaut (eau 1,3 / 0,3 ; air 0,6 / 0,2). En réseau de retour
(écoulement convergent) la même formule est appliquée, du côté de la sécurité.

**Débit et vitesse ventilation** (gaines) : sélectionnez les gaines (réseau ou chemin), cliquez.
- section de chaque gaine (Ø ou largeur × hauteur, raccords : leur plus grand raccordement), rugosité du type de gaine ;
- **débit** : calcul Revit, sinon **somme des bouches en aval** de la CTA (ou de l'élément de plus grande section) dans le
  réseau relié à la sélection ;
- vitesse (alerte au-delà de la vitesse maxi, 6 m/s par défaut), Pa/m, pertes des coudes (0,25 rond / 0,3 rect.), tés
  (passage 0,2 / dérivation 0,6), transitions, registres, clapets coupe-feu, silencieux (reconnus par le nom de famille) ;
  perte des bouches à saisir (Pa, fabricant) ;
- **dimensionnement** : pour un débit et une vitesse visée, Ø normalisé et gaine rectangulaire de hauteur donnée ;
- note de calcul Excel.

## Export des quantités vers Excel

Bouton **Quantités Excel** du ruban, type « Classeur Excel (*.xlsx) » (proposé par défaut) : un classeur de 5 feuilles,
ouvert dans Excel à la fin de l'export.

| Feuille | Contenu |
|---|---|
| Synthèse | Par réseau : tube (m), raccords, brides, robinetterie, soudures atelier / chantier / hors spool (nombre et pouces-diamètre), joints boulonnés ; ligne de total en formules |
| Quantitatif | Mêmes lignes que le CSV du chiffrage, en nombres, avec les pouces-diamètre des soudures ; s'importe tel quel dans Pipe-Fit (la feuille « Quantitatif » est reconnue) |
| Soudures | Par spool : soudures atelier et chantier (nombre, pouces), joints boulonnés, longueur de tube ; total |
| Liste de débit | Tubes à couper : longueur Revit, piquage, surlongueur, coupe, barre de 6 m ; total |
| Nomenclatures | Nomenclature de chaque spool : repère, désignation, DN, encombrement, matière, quantité, longueur, pouces |

En-têtes en gras, volets figés, filtres automatiques, mise en page paysage A4. Écrit sans Excel ni bibliothèque
(Excel n'est nécessaire que pour l'ouvrir).

## Quantitatif pour le chiffrage Pipe-Fit

Bouton **Quantités Excel** du ruban, type « Fichier CSV pour le chiffrage » (et fichier `Quantitatif chiffrage Pipe-Fit.csv` écrit avec les exports des
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
