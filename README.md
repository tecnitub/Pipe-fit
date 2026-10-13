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

## Envoi des e-mails par Microsoft 365

1. Dans le portail Azure (**Microsoft Entra ID → Inscriptions d'applications → Nouvelle inscription**), créer une
   application « Pipe-Fit CRM » (comptes de cet annuaire uniquement).
2. **Autorisations d'API → Ajouter → Microsoft Graph → Autorisations d'application → `Mail.Send`**, puis
   « Accorder un consentement d'administrateur ».
3. **Certificats et secrets → Nouveau secret client** : copier la *valeur* (affichée une seule fois).
4. Dans le CRM (administrateur) : **Paramètres → E-mails et Microsoft 365** : ID de l'annuaire (locataire),
   ID d'application, secret, cocher « Activer », puis « Tester » (un e-mail de test est envoyé à votre adresse).
5. **Paramètres → Comptes** : renseigner l'adresse Microsoft 365 de chaque utilisateur (c'est l'expéditeur de ses envois).

Le secret est stocké sur le serveur uniquement (jamais renvoyé aux navigateurs ni inclus dans l'export JSON).
L'autorisation `Mail.Send` d'application permet d'envoyer depuis n'importe quelle boîte du locataire : il est
recommandé de la limiter aux boîtes des utilisateurs du CRM par une *stratégie d'accès d'application* Exchange
(`New-ApplicationAccessPolicy -AccessRight RestrictAccess -PolicyScopeGroupId <groupe>`). Le serveur doit pouvoir
joindre `login.microsoftonline.com` et `graph.microsoft.com` en HTTPS. Sans Microsoft 365, l'envoi prépare un
brouillon Outlook (.eml) avec le PDF joint : une fois envoyé depuis Outlook, il apparaît aussi dans les éléments envoyés.

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
| **DPGF (marchés publics)** | Import du DPGF du dossier de consultation (.xlsx / .csv) dans un devis : N° de prix, chapitres et sous-chapitres, ouvrages avec unité et quantité, lignes descriptives rattachées à l'ouvrage, totaux ignorés, lignes « PM » conservées ; aperçu avec correction du type de chaque ligne. Repère « à chiffrer » sur chaque ouvrage, fourniture libre possible. Export du DPGF chiffré au même format avec sous-totaux hiérarchiques. |
| **Rapports d'intervention** | Rédigés sur le téléphone par l'ouvrier ou le chef d'équipe : chantier, intervenants, travaux réalisés, observations, besoins, photos. Journal du chantier pour le chargé d'affaires. |
| **Bon d'intervention signé** | Depuis le téléphone, le rapport d'intervention peut être signé au doigt par le client (nom, fonction, « intervention terminée ») avec le récapitulatif des heures et du matériel : il devient un bon d'intervention numéroté, imprimable, et n'est plus modifiable. |
| **Hors devis (régie)** | Intervention `HD-AAAA-001` ouverte sans devis sur une demande du client (client, site, demandeur). L'atelier (préfabrication) puis l'équipe de chantier pointent leurs heures dessus et saisissent le matériel utilisé (bibliothèque ou libre) dans leur rapport ; le client signe le bon en fin de travaux. Le bureau complète les prix, imprime l'attachement, demande ou enregistre la commande du client, facture (chapitres main-d'œuvre et matériel, n° de commande repris) puis clôt l'intervention. |
| **Réserves et réception** | Page de réunion (tablette) : liste des réserves (localisation, description, responsable, échéance, photo), PV de réception signé à l'écran par le client et l'entreprise (sans réserve / avec réserves / refus). Le PV fige les réserves, passe le chantier en « Terminé » et donne le feu vert pour la facturation. Levée des réserves (photo après travaux) puis PV de levée signé. |
| **Retenue de garantie** | Au choix par chantier (taux, ou caution bancaire) : déduite du TTC des factures de situation (net à payer), cumul suivi sur le chantier, libération après la réception. |
| **Import / export Excel** | Fournitures, taux de main-d'œuvre, entreprises (feuille « Sites » pour les adresses multiples) et contacts : import d'un fichier .xlsx ou .csv existant (colonnes reconnues automatiquement, ajustables, aperçu), mise à jour des fiches existantes (par ID, référence, SIRET, nom ou e-mail) et ajout des nouvelles, puis export Excel modifiable et réimportable. Une cellule vide ne remplace pas la valeur existante. |
| **Mise en page des documents** | Paramètres → Documents (administrateur) : logo (PNG transparent), position et taille, couleur, police, coordonnées (téléphone, e-mail, site, TVA, forme juridique, capital, RCS, APE), RIB et pied de page légal communs à toute la liasse. Pour chaque document (devis, facture, situation/BL, bon de commande, attachement, bon d'intervention, PV) : titre, texte d'introduction, conditions, et éléments affichés ou masqués (N° de prix, quantités, prix unitaires ou prix par chapitre, descriptifs, sous-totaux, remises, contact, lieu, chargé d'affaires, RIB, pénalités de retard, horaires, photos…). Aperçu en direct sur un document réel. |
| **E-mails et PDF** | Bouton « PDF » et « ✉ Envoyer par e-mail » sur les devis, factures, situations (BL), commandes, demandes de prix fournisseur, attachements, bons d'intervention et PV. Le PDF est généré dans le navigateur (mise en page des documents, texte sélectionnable). Destinataires choisis parmi les contacts de l'entreprise (À / Cc, adresse générale, adresses libres, copie au chargé d'affaires), objet et message pré-remplis par un **modèle paramétrable** par type de document (variables {contact}, {numero}, {montant_ttc}, {echeance}…, signature commune). Envoi par **Microsoft 365** (le message part de la boîte de l'utilisateur et se retrouve dans ses « Éléments envoyés ») ou **brouillon Outlook** (.eml avec le PDF joint). Chaque envoi est historisé sur le document ; un devis envoyé passe en « Envoyé », un BL en « Proposée », une commande en « Envoyée ». |
| **Planning des équipes** | Bureau : grille personnes × jours (chef d'équipe et son équipe regroupés) ; affectation d'une journée à un ou plusieurs chantiers (tâche, horaires, heures, consigne), copiable sur d'autres jours et sur toute l'équipe ; copie de la semaine précédente. Chaque case confronte le prévu au pointé : conforme, écart d'heures, autre chantier, non pointé. Téléphone (onglet Planning du pointage) : planning de la semaine et de la suivante avec adresse du site (lien GPS), consignes d'accès, collègues présents ; le chef d'équipe voit celui de son équipe. « Saisir ma journée » / « Saisir la journée de l'équipe » reprend le chantier et les horaires prévus, que chacun corrige avec ses heures réelles. Le chantier prévu est aussi présélectionné au démarrage du pointage. |
| **Charge par semaine** | Charge hebdomadaire par personne face à sa capacité (planning jour par jour inclus), heures pointées, reste à planifier par chantier. |
| **Avoirs** | Depuis une facture : avoir total (la facture passe « Annulée »), partiel par lignes et quantités, ou montant libre (geste commercial, réfaction), avec motif. Numérotation propre (`AV-AAAA-0001`), PDF, envoi par e-mail ; l'avoir est déduit du chiffre d'affaires, du reste dû de la facture et des analyses. Une facture numérotée n'est jamais supprimée. |
| **Numérotation** | Factures et avoirs : préfixe, séparateur, année (4 ou 2 chiffres, remise à 1 chaque année, ou suite continue sans année) et nombre de chiffres paramétrables (Paramètres). Numéros attribués par le serveur dans l'ordre, sans trou ; reprise d'une numérotation existante en indiquant le prochain numéro (jamais en dessous d'un numéro déjà attribué). |
| **Comptabilité** | Journal des ventes (Facturation → Comptabilité) : écritures équilibrées par pièce (client 411 avec compte auxiliaire de la fiche entreprise, retenue de garantie, travaux 704, livraison 7085, TVA 44571 ; avoirs en sens inverse), comptes paramétrables. Export Excel, CSV (Sage, Cegid, EBP, Quadra, Pennylane…) et FEC ; suivi des pièces transmises (seules les nouvelles sont exportées la fois suivante) ; envoi au cabinet comptable par e-mail avec le journal et les PDF des factures. |
| **Filtres et archives** | Devis, chantiers, factures, situations et tableau de bord filtrables par client, chargé d'affaires, statut et recherche (n°, objet, client) ; filtres mémorisés par écran sur chaque poste. Par défaut, seuls les devis en cours (brouillons, envoyés) et les chantiers non clos s'affichent. Devis « Refusé » en un clic avec motif (prix, délai, concurrent…) et archivage ; chantiers et devis archivables à l'unité, par sélection multiple ou en lot (clos, refusés) : masqués des listes, du tableau de bord, du pointage et du planning, toujours consultables (filtre « Archivés ») et comptés dans les analyses (motifs de refus). |
| **Rôles** | Administrateur ; chargé d'affaires ; opérateur (pointe uniquement ses propres heures). |

## Structure

```
server/server.js   API REST, connexion, droits, temps réel (SSE), fichiers statiques
server/db.js       base SQLite, mots de passe (scrypt), numérotation
server/demo.js     données de démonstration
server/m365.js     envoi des e-mails par Microsoft Graph
public/            interface web (HTML/CSS/JS sans framework)
test/              tests de l'API (npm test)
public/js/devis.js, commandes.js, pointage.js, suivi.js, horsdevis.js, documents.js, pdf.js, mails.js, equipes.js, filtres.js, compta.js, biblio.js, contacts.js : écrans métier
installer/         installateur Windows (NSIS) : build.sh, PipeFitCRM.nsi, lanceur et service
```

## Évolutions possibles

Import des temps depuis une badgeuse ou l'ERP
de production, pièces jointes (plans, photos), application mobile pour la saisie atelier.
