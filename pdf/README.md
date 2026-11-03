# Atelier PDF

Logiciel Windows de **compilation et de modification de PDF**, indépendant de Pipe-Fit CRM.
Tout est traité sur le poste (aucun envoi sur Internet), sans connexion nécessaire.

## Installation (Windows 10/11)

Double-cliquer sur **`AtelierPDF-Setup-x.y.z.exe`** : installation pour l'utilisateur courant, **sans droits
administrateur**, dans `%LOCALAPPDATA%\Programs\AtelierPDF`. Icônes « Atelier PDF » sur le bureau et dans le
menu Démarrer ; l'application s'ouvre dans sa propre fenêtre Microsoft Edge (mode application).
Désinstallation : Paramètres Windows > Applications.

Sans installation : `AtelierPDF.html` s'ouvre aussi par simple double-clic (Edge ou Chrome conseillés).

Obtenir les fichiers : onglet **Actions** du dépôt GitHub → dernière exécution « Installateur Windows »
→ *Artifacts* → `AtelierPDF-Setup`, ou les construire avec `bash installer/build-pdf.sh` (paquet `nsis` requis).

## Fonctions

- **Compiler** plusieurs PDF, photos et scans (JPG, PNG, WebP…) en un seul PDF : glisser-déposer depuis
  l'Explorateur, réorganiser les pages à la souris, pivoter, dupliquer, supprimer, pages blanches et intercalaires.
- **Sommaire** en tête avec liens cliquables et **signets** (un par document, titre modifiable).
- **Annoter une page** : texte à la volée, bulles de commentaire, traits, flèches, carrés, cercles, crayon,
  surlignage, masque (blanc correcteur), images et signatures (bouton ou Ctrl+V).
- **Caviarder** : zones noires dont le contenu est réellement supprimé (page recopiée en image à l'enregistrement),
  à la main ou en recherchant un mot dans tous les PDF.
- **Numérotation** des pages, **filigrane**, titre et auteur du document, aplatissement des formulaires.
- **Extraire** des pages, **diviser** (par document, par page, toutes les N pages, par plages).
- **Réduire la taille** (pages converties en images 100–200 ppp).
- PDF protégés contre la modification : acceptés, pages recopiées en images.

Mode d'emploi détaillé : [installer/files/AtelierPDF-LISEZMOI.txt](../installer/files/AtelierPDF-LISEZMOI.txt).

## Développement

- `pdf/src/` : `index.html`, `app.css`, `app.js` (interface), `moteur.js` (assemblage avec pdf-lib, testé sous Node).
  `pdf/src/index.html` s'ouvre directement dans un navigateur pour le développement.
- `node pdf/build.js` → `dist/AtelierPDF.html` (un seul fichier : pdf.js et pdf-lib inclus).
- `bash installer/build-pdf.sh` → `dist/AtelierPDF-Setup-<version>.exe` (version dans `pdf/VERSION`).
- Tests : `node --test test/atelier-pdf.test.js` (inclus dans `npm test`).
- Bibliothèques (déjà présentes dans le dépôt) : pdf.js 3.11.174 (Apache 2.0), pdf-lib 1.17.1 (MIT).
