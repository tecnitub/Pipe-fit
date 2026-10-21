# Pipe-Fit DOE — dossiers des ouvrages exécutés

Application séparée de Pipe-Fit pour monter les DOE de fin de chantier (CVC, plomberie, tuyauterie)
selon le plan de classement TECNITUB, puis générer le dossier complet en un seul PDF.

## Lien avec Pipe-Fit

- **Connexion** : mêmes identifiants que Pipe-Fit (le serveur DOE vérifie le compte auprès de Pipe-Fit).
  Réservé au bureau : administrateur et chargé d'affaires. Les comptes atelier sont refusés.
- **Données reprises du chantier** (lecture seule, aucun champ déjà saisi n'est écrasé) :
  - opération, adresse du site, maître d'ouvrage et maître d'œuvre avec leurs interlocuteurs ;
  - date de début (premier pointage), de fin et de réception (PV signé), fin de GPA (réception + 1 an) ;
  - documents du chantier : plans → section 2 / annexe A, fiches techniques → annexe B, notices → 7.2 ;
  - matériel du devis accepté et des commandes → équipements de la section 3 (au choix, avec la famille proposée) ;
  - PV de réception et réserves → annexe R.
  - PV signés dans Pipe-Fit pour le chantier, mis en page comme dans Pipe-Fit : PV de mise en service, fiches
    fluides de mise en service (Cerfa) et équilibrages hydrauliques → annexe F ; PV d'épreuve hydraulique, équilibrages
    aérauliques et autres fiches fluides → annexe G. Les pièces des listes de contrôle 5.x et 6.x qu'ils couvrent sont
    cochées automatiquement (mention « Pipe-Fit ») et ne sont plus signalées comme manquantes.
- Le bouton « 🔄 Reprendre depuis Pipe-Fit » relit le chantier à tout moment.
- Dans Pipe-Fit, l'onglet « 📘 DOE » d'un chantier ouvre son dossier. L'adresse de l'application se règle dans
  Paramètres → Société (« Adresse de l'application DOE ») ; vide, c'est le même serveur sur le port 3100.

## Contenu du DOE généré

Page de garde, sommaire paginé, sections 1, 2, 3, 5, 6, 7, 8, 9, 10 (pas de section 4), signatures de remise,
puis les annexes A, B, F, G, H, O et R avec leurs intercalaires et les PDF / images joints.
En-tête TECNITUB sur chaque page du dossier, pied de page « Page X / Y » sur tout le document.
Nom du fichier : `DOE_LOT{n}_{DISCIPLINE}_{Operation}_Ind{X}.pdf`. Toute valeur absente est écrite « À compléter ».

## Démarrage

```
PIPEFIT_URL=http://localhost:3000 npm run start:doe
```

| Variable | Rôle | Défaut |
|---|---|---|
| `DOE_PORT` | port de l'application DOE | 3100 |
| `PIPEFIT_URL` | adresse de Pipe-Fit vue par le serveur DOE | http://localhost:3000 |
| `PIPEFIT_PUBLIC_URL` | adresse de Pipe-Fit pour le lien « Pipe-Fit ↗ » du navigateur | même machine, port 3000 |
| `DOE_DB_FILE` | base des dossiers et pièces jointes | doe/data/doe.db |

Les dossiers et leurs pièces jointes (60 Mo max par fichier) sont stockés dans la base DOE, séparée de celle de Pipe-Fit.
Sauvegardez `doe/data/` avec la base Pipe-Fit.

## Fichiers

```
doe/server.js          serveur : connexion via Pipe-Fit, lecture du chantier, dossiers versionnés, pièces jointes
doe/config-defaut.js   identité TECNITUB par défaut (modifiable dans Réglages)
doe/public/js/trame.js plan de classement : sections, familles d'équipements, listes de contrôle, maintenance
doe/public/js/lien.js  reprise des données du chantier Pipe-Fit
doe/public/js/app.js   écrans (tableau de bord, éditeur section par section, réglages)
doe/public/js/generer.js assemblage du PDF (moteur PDF de Pipe-Fit + pdf-lib 1.17.1, licence MIT)
doe/build-demo.js      démonstration en un fichier (doe/demo-backend.js simule le serveur)
```
