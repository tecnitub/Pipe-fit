# Pipe-Fit CRM

CRM **multi-utilisateurs** pour une entreprise de tuyauterie industrielle : contacts (entreprises clientes et
fournisseurs, sites, chargés de travaux), affaires, devis
avec bibliothèque de prix, facturation avec livraison, planning de charge, heures passées,
analyse de rentabilité et retour d'expérience (REX) par affaire et par chargé d'affaires.

Plusieurs personnes travaillent en même temps sur les mêmes données, depuis leur navigateur.

## Installation en un clic (Windows)

1. Sur le PC qui servira de serveur (allumé en permanence, Windows 10/11 64 bits),
   double-cliquer sur **`PipeFitCRM-Setup-x.y.z.exe`** et suivre l'assistant.
2. Le navigateur s'ouvre : créer le compte administrateur (avec ou sans données de démonstration).
3. Les collègues ouvrent `http://NOM-DU-SERVEUR:3000` dans leur navigateur : rien à installer sur leurs postes.

L'installateur embarque Node.js, crée le démarrage automatique avec Windows (tâche planifiée
`PipeFitCRM`, sans session ouverte), ouvre le pare-feu (port 3000, réseaux Domaine/Privé) et place
une icône sur le bureau. Données : `C:\ProgramData\PipeFitCRM\data` (à sauvegarder).
**Mise à jour** : relancer un Setup plus récent, les données sont conservées.

Obtenir l'installateur : onglet **Actions** du dépôt GitHub → dernière exécution « Installateur Windows »
→ *Artifacts*, ou le construire avec `bash installer/build.sh` (Linux/macOS, paquet `nsis` requis).

## Démonstration en ligne (sans serveur)

`node demo/build.js` produit `dist/pipefit-crm-demo.html` : l'application complète en un seul fichier,
avec un serveur simulé dans le navigateur (données sur l'appareil, sélecteur de profil
admin / chargé d'affaires / atelier). Utile pour tester sur téléphone et itérer sur la conception.

## Installation manuelle (Linux, Windows, macOS)

Prérequis : **Node.js 22.13 ou plus récent** (aucune autre dépendance, la base SQLite est intégrée à Node.js).

```bash
npm start                  # ou : ADMIN_PASSWORD=MonMotDePasse PORT=3000 npm start
```

Puis ouvrir `http://<adresse-du-serveur>:3000` depuis n'importe quel poste du réseau.

Au **premier démarrage**, ouvrir `http://localhost:3000` **sur le serveur lui-même** : un écran
permet de créer le compte administrateur et de choisir base vide ou données de démonstration.
(Alternative sans écran : définir `ADMIN_PASSWORD`, un compte `admin` est alors créé automatiquement.)

Avec Docker :

```bash
docker build -t pipefit-crm .
docker run -d -p 3000:3000 -v pipefit-data:/data -e ADMIN_PASSWORD=MonMotDePasse pipefit-crm
```

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port d'écoute |
| `HOST` | `0.0.0.0` | Interface d'écoute |
| `DB_FILE` | `data/pipefit.db` | Fichier de base de données |
| `ADMIN_PASSWORD` | — | Crée directement le compte `admin` (sinon : écran de première configuration) |
| `SEED_DEMO` | `1` | Données de démo initiales (l'écran de première configuration permet de partir d'une base vide) |

**Accès depuis l'extérieur de l'entreprise** : placer le serveur derrière un reverse proxy HTTPS
(Nginx, Caddy, IIS…) qui transmet l'en-tête `X-Forwarded-Proto` ; les cookies passent alors en `Secure`.
Ne pas exposer le port 3000 en HTTP simple sur Internet.

**Sauvegarde** : copier régulièrement le dossier `data/` (ou le volume Docker), ou utiliser
**Paramètres → Exporter (JSON)**.

## Utilisation à plusieurs

- **Comptes et rôles** (Paramètres, administrateur) :

  | Rôle | Droits |
  |---|---|
  | Administrateur | Tout, dont comptes, paramètres société, ressources, import, suppression de factures |
  | Chargé d'affaires | Clients, affaires, devis, factures (statut uniquement une fois émise), bibliothèque de prix, livraison, planning, heures, analyses |
  | Atelier | Saisie des heures et consultation du planning |

  Chaque compte peut être lié à une ressource du planning : ses heures sont alors pré-sélectionnées.
- **Temps réel** : une modification faite par un utilisateur apparaît immédiatement chez les autres.
  Si quelqu'un est en train de saisir, un bandeau « Rafraîchir » s'affiche au lieu d'effacer sa saisie.
- **Conflits** : si deux personnes modifient le même élément en même temps, la seconde est prévenue
  et la version à jour est rechargée (aucune modification n'est écrasée silencieusement).
- **Numérotation** des devis (`DV-AAAA-0001`) et factures (`FA-AAAA-0001`) attribuée par le serveur :
  pas de doublon, même si deux devis sont créés au même instant.
- **Historique** : connexions, créations, modifications et suppressions (Paramètres, administrateur).

## Processus métier

1. **Devis** : client, contact client (chargé de travaux), site d'intervention et chargé d'affaires interne.
   Les lignes sont des **ouvrages** regroupés en **chapitres** (sous-total par chapitre). Un ouvrage =
   fournitures de la bibliothèque (quantité par unité) + main-d'œuvre (catégorie × heures par unité) :
   prix unitaire = fournitures + main-d'œuvre. **Remises et majorations** en % sur l'ensemble des lignes.
   Le pilotage prévisionnel sépare la part fournitures et la part main-d'œuvre (heures par catégorie, coûts, marge).
2. **Devis accepté → chantier** (numéro `CH-AAAA-001`) : le devis devient le budget du chantier.
3. **Commandes fournisseurs** (`CF-AAAA-0001`) affectées à un chantier ; elles peuvent reprendre
   automatiquement les fournitures prévues au devis et pas encore commandées. Leur montant est le coût
   réel des fournitures.
4. **Pointage mobile** des opérateurs (arrivée / départ par chantier et tâche, pause, panier repas, saisie d'oubli).
   Un **chef d'équipe** pointe en une fois les compagnons et **intérimaires** sous ses ordres (filtre « intérimaires »).
   Le coût réel de main-d'œuvre = heures pointées × coût horaire de chaque personne (taux agence pour les intérimaires).
   **Notes de frais** : photo du justificatif prise avec le téléphone, imputée au chantier, validée puis remboursée.
   **Validation** des pointages par le chargé d'affaires (ses chantiers) avant la paie ; un pointage validé est verrouillé.
5. **Pilotage du chantier** : budget du devis face au réel (fournitures, main-d'œuvre, heures par catégorie),
   marge prévue et **marge à terminaison** (projection du reste à faire).
6. **RH** : synthèse mensuelle des heures **validées** (heures normales, supplémentaires à 25 % / 50 % calculées
   par semaine, paniers, notes de frais, salaire brut indicatif), intérimaires à part (rapprochement de la facture
   d'agence). **Récap Excel** du mois : une feuille de synthèse, une feuille par personne (détail jour par jour,
   total de chaque semaine et découpage des heures supplémentaires), une feuille des notes de frais.
7. **Situations de travaux** : proposition d'avancement par ligne du devis à la maîtrise d'œuvre sous forme de
   **BL numéroté** (`BL-AAAA-0001`, numérotation indépendante) ; BL accepté → facture de situation générée
   (montant = cumul − situations précédentes). **Analyse** par chantier et par chargé d'affaires, REX.

| Module | Contenu |
|---|---|
| **Contacts** | Entreprises client / fournisseur (SIRET, TVA, coordonnées) avec plusieurs sites ; personnes rattachées (chargé de travaux, acheteur…). |
| **Bibliothèque** | Fournitures (prix d'achat, prix de vente, poids, fournisseur habituel), catégories de main-d'œuvre (taux de vente, coût moyen), zones de livraison. |
| **Import / export Excel** | Fournitures, taux de main-d'œuvre, entreprises (feuille « Sites » pour les adresses multiples) et contacts : import d'un fichier .xlsx ou .csv existant (colonnes reconnues automatiquement, ajustables, aperçu), mise à jour des fiches existantes (par ID, référence, SIRET, nom ou e-mail) et ajout des nouvelles, puis export Excel modifiable et réimportable. Une cellule vide ne remplace pas la valeur existante. |
| **Planning** | Charge hebdomadaire par personne face à sa capacité, heures pointées, reste à planifier par chantier. |
| **Rôles** | Administrateur ; chargé d'affaires ; opérateur (pointe uniquement ses propres heures). |

## Structure

```
server/server.js   API REST, connexion, droits, temps réel (SSE), fichiers statiques
server/db.js       base SQLite, mots de passe (scrypt), numérotation
server/demo.js     données de démonstration
public/            interface web (HTML/CSS/JS sans framework)
test/              tests de l'API (npm test)
public/js/devis.js, commandes.js, pointage.js, biblio.js, contacts.js : écrans métier
installer/         installateur Windows (NSIS) : build.sh, PipeFitCRM.nsi, lanceur et service
```

## Évolutions possibles

Export comptable (FEC), envoi des devis par e-mail, import des temps depuis une badgeuse ou l'ERP
de production, pièces jointes (plans, photos), application mobile pour la saisie atelier.
