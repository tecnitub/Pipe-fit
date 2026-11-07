# Atelier PDF

Logiciel Windows de **compilation et de modification de PDF**, indépendant de Pipe-Fit CRM.
Tout est traité sur le poste (aucun envoi sur Internet), sans connexion nécessaire.

## Installation (Windows 10/11)

Double-cliquer sur **`AtelierPDF-Setup-x.y.z.exe`** : installation pour l'utilisateur courant, **sans droits
administrateur**, dans `%LOCALAPPDATA%\Programs\AtelierPDF`. Icônes « Atelier PDF » sur le bureau et dans le
menu Démarrer ; l'application s'ouvre dans sa propre fenêtre Microsoft Edge (mode application).
Désinstallation : Paramètres Windows > Applications.

**Ouvrir les PDF de l'ordinateur** : l'installateur inscrit Atelier PDF pour les PDF (pour l'utilisateur) :
« Ouvrir avec › Atelier PDF », clic droit « Ouvrir avec Atelier PDF » (plusieurs fichiers : une seule fenêtre), et
Atelier PDF proposé dans Paramètres › Applications par défaut (case à la fin de l'installation ; Windows exige que
l'utilisateur confirme lui-même le lecteur par défaut). Le lanceur `AtelierPDF.exe` (`installer/lanceur/lanceur.c`)
reçoit les fichiers, écrit une page de démarrage (l'application et le contenu des fichiers) dans
`%LOCALAPPDATA%\AtelierPDF\ouverture` et l'ouvre dans Edge ; une sauvegarde automatique par fenêtre.

Sans installation : `AtelierPDF.html` s'ouvre aussi par simple double-clic (Edge ou Chrome conseillés).

Obtenir les fichiers : onglet **Actions** du dépôt GitHub → dernière exécution « Installateur Windows »
→ *Artifacts* → `AtelierPDF-Setup`, ou les construire avec `bash installer/build-pdf.sh` (paquet `nsis` requis).

## Fonctions

- **Aide intégrée** : visite guidée au premier lancement ; « Comment faire ? » (F1 ou « ? ») avec des fiches
  recherchables qui ouvrent directement l'outil concerné ou mettent le bouton en évidence.
- **Compiler** plusieurs PDF, photos et scans (JPG, PNG, WebP…) en un seul PDF : glisser-déposer depuis
  l'Explorateur, réorganiser les pages à la souris, pivoter, dupliquer, supprimer, pages blanches et intercalaires.
- **Sommaire** en tête avec liens cliquables et **signets** (un par document, titre modifiable).
- **Vue d'une page** : zoom (10 à 800 %, Ctrl + molette autour du pointeur, page entière, pleine largeur), déplacement
  (Espace + glisser, bouton du milieu), vignettes de toutes les pages à gauche (navigation, glisser-déposer, dépôt de fichiers).
- **Modifier le texte** du PDF sur place : clic sur une ligne, correction ; police, gras, italique, taille et couleurs
  repris ; à l'enregistrement les caractères d'origine sont retirés du contenu de la page (les suivants gardent leur
  place), scans après OCR : texte recouvert par la couleur du fond.
- **Annoter une page** : texte à la volée, bulles de commentaire, traits, flèches, carrés, cercles, crayon,
  surlignage, masque (blanc correcteur), images et signatures (bouton ou Ctrl+V).
- **Caviarder** : zones noires dont le contenu est réellement supprimé (page recopiée en image à l'enregistrement),
  à la main ou en recherchant un mot dans tous les PDF.
- **Tampons** (BON POUR EXÉCUTION, VISA, VU… avec nom et date) et **signatures mémorisées** sur le poste.
- **Mesures sur plan** à l'échelle (1/50, 1/100… ou étalonnage sur une cote) : cotes, longueurs cumulées, surfaces ;
  total par page et export CSV de toutes les mesures.
- **OCR** (Tesseract, français, sur le poste) : scans et photos interrogeables, caviardage par recherche dans les scans.
- **Sauvegarde automatique** du travail en cours (reprise à la réouverture) et **fichier projet** `.atelierpdf`.
- **Réédition** : un PDF enregistré par Atelier PDF, rouvert dans Atelier PDF, retrouve ses annotations modifiables
  (données intégrées au PDF, invisibles pour les autres logiciels ; numéros, filigrane et sommaire retirés puis refaits).
- **Rechercher** (Ctrl+F, texte du PDF et OCR) et **imprimer** (Ctrl+P) le document compilé.
- **Formulaires PDF** remplis sur la page (texte, cases, boutons radio, listes), valeurs écrites puis figées.
- **Comparer deux indices** d'un plan : superposition rouge (supprimé) / vert (ajouté), recalage automatique.
- **Mesures** : accroche aux extrémités et aux traits du plan (géométrie lue dans le PDF), angles, zones de détail à
  une autre échelle.
- **Texte modifié dans la police d'origine** quand elle contient les caractères, **paragraphes** (Maj+clic) recoupés
  à la largeur d'origine.
- **Commentaires PDF** (option) : annotations exportées comme commentaires Acrobat avec leur apparence, retirées et
  redevenues modifiables à la réouverture dans Atelier PDF.
- **Pipe-Fit** : ouvrir un document d'un chantier, enregistrer le résultat comme nouveau document ou nouvel indice.
  Connexion personnelle (identifiant et mot de passe) : `POST /api/atelier/connexion` délivre un jeton `pfj_…` de 12 h,
  révocable (`/api/atelier/deconnexion`) ; aucun secret permanent sur le poste. Le serveur accepte la page locale
  d'Atelier PDF (origine « null ») uniquement avec un jeton ou une clé d'API, cookies ignorés.
- **Mises à jour** : le lanceur cherche un Setup plus récent dans le dossier réseau d'installation.
- **Numérotation** des pages, **filigrane**, titre et auteur du document, aplatissement des formulaires.
- **Extraire** des pages, **diviser** (par document, par page, toutes les N pages, par plages).
- **Réduire la taille** (pages converties en images 100–200 ppp).
- PDF protégés contre la modification : acceptés, pages recopiées en images.

Mode d'emploi détaillé : [installer/files/AtelierPDF-LISEZMOI.txt](../installer/files/AtelierPDF-LISEZMOI.txt).

## Développement

- `pdf/src/` : `index.html`, `app.css`, `app/` (interface en modules numérotés, assemblés en une seule portée par
  `pdf/assembler-app.js`), `moteur.js` (assemblage avec pdf-lib, testé sous Node),
  `stockage.js` (sauvegarde, projets, bibliothèque), `ocr.js` (Tesseract : moteur, worker et modèle inclus dans la page).
  Pour essayer une modification : `node pdf/build.js` puis ouvrir `dist/AtelierPDF.html`.
- `node pdf/build.js` → `dist/AtelierPDF.html` (un seul fichier : pdf.js et pdf-lib inclus).
- `bash installer/build-pdf.sh` → `dist/AtelierPDF-Setup-<version>.exe` (version dans `pdf/VERSION`).
- Tests : `node --test test/atelier-pdf.test.js` (inclus dans `npm test`) ; interface dans Chromium :
  `npm run test:ui` (Playwright ; aussi sur GitHub Actions).
- Signature de code : `installer/build-pdf.sh` signe le lanceur, l'installateur et le désinstallateur si
  `ATELIERPDF_CERT_PFX` (ou `ATELIERPDF_CERT_PFX_BASE64`) et `ATELIERPDF_CERT_PASSWORD` sont fournis
  (secrets GitHub du même nom en `_BASE64`) ; `osslsigncode` requis.
- Vérification sur de vrais PC : `installer/files/AtelierPDF-VERIFICATION.txt` (aussi dans le pack).
- Bibliothèques (déjà présentes dans le dépôt) : pdf.js 3.11.174 (Apache 2.0), pdf-lib 1.17.1 (MIT),
  tesseract.js 7 et modèle français (Apache 2.0).
