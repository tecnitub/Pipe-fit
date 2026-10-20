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

## Application DOE (dossier des ouvrages exécutés)

Application séparée dans `doe/`, reliée à Pipe-Fit : voir [doe/README.md](doe/README.md).
`npm run start:doe` la démarre sur le port 3100 ; `node doe/build-demo.js` produit sa démonstration
`dist/pipefit-doe-demo.html`. Dans Pipe-Fit, l'onglet « 📘 DOE » de chaque chantier ouvre son dossier.

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
| `DOCUMENTS_DIR` | `<dossier de la base>/Documents` | Répertoire des documents synchronisé avec l'appli (sinon : Paramètres) |
| `TLS_DIR` | `<dossier de la base>/tls` | Dossier du certificat HTTPS : `cert.pem` + `key.pem`, ou `certificat.pfx` |
| `TLS_CERT`, `TLS_KEY` / `TLS_PFX`, `TLS_PASSPHRASE` | — | Certificat HTTPS ailleurs que dans `TLS_DIR` |
| `HTTP_REDIRECT_PORT` | — | Port HTTP (ex. `80`) renvoyé vers HTTPS |
| `TRUST_PROXY` | — | `1` : reverse proxy installé sur une autre machine (adresse réelle des clients) |
| `SEED_DEMO` | `1` | Données de démo initiales (l'écran de première configuration permet de partir d'une base vide) |

**HTTPS** (indispensable avant tout accès depuis l'extérieur et pour l'appli des compagnons) — deux façons :

1. *Certificat dans Pipe-Fit* : déposer le certificat de l'entreprise dans `data/tls` (`cert.pem` + `key.pem`
   avec la chaîne complète, ou `certificat.pfx` et `TLS_PASSPHRASE`), puis redémarrer. Le même port sert alors
   en HTTPS (TLS 1.2 minimum) ; les adresses `http://` venant du réseau sont renvoyées vers `https://`, et celles
   venant du serveur lui-même restent servies (raccourci du poste serveur, application DOE). Un certificat
   renouvelé est rechargé sans redémarrer ; un certificat illisible empêche le démarrage (jamais de repli
   silencieux en HTTP). Le certificat doit être émis par une autorité reconnue (Let's Encrypt, autorité de
   l'entreprise) : un certificat auto-signé est refusé par les téléphones.
2. *Reverse proxy* (Caddy, Nginx, IIS…) qui obtient le certificat et transmet `X-Forwarded-Proto` et
   `X-Forwarded-For` ; s'il est sur une autre machine, définir `TRUST_PROXY=1`. Exemple Caddy (certificat
   Let's Encrypt automatique) : `crm.tecnitub.fr { reverse_proxy localhost:3000 }`.

Ne jamais exposer le port 3000 en HTTP simple sur Internet. L'état (certificat, échéance, proxy, tentatives
refusées) est affiché dans **Paramètres → Sécurité**.

**Mesures de sécurité en place** : mots de passe chiffrés (scrypt), 10 caractères au moins, refus des mots de passe
courants ou contenant l'identifiant ; jetons de session enregistrés sous forme d'empreinte (SHA-256) ; cookies
`HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS ; blocage 15 min après 10 échecs de connexion par adresse ou 20 par
identifiant, échecs inscrits au journal ; « Déconnecter mes autres appareils » (Paramètres) ; écritures refusées si
elles viennent d'une page d'un autre site (en-tête `Origin`) et uniquement en JSON ; politique de sécurité du contenu
(CSP) sans script externe ni script inline, HSTS en HTTPS, anti-cadre, permissions du navigateur limitées
(caméra, micro, position) ; identifiants d'enregistrements et références contrôlés ; documents hors PDF et images
toujours téléchargés, jamais affichés ; répertoire des documents protégé contre les chemins `..` et les liens
symboliques ; première configuration possible uniquement sur le serveur lui-même (pas au travers d'un proxy) ;
droits par rôle vérifiés par le serveur, données filtrées avant l'envoi aux compagnons.

**Appli téléphone des compagnons** : c'est la même application, ouverte à l'adresse du serveur sur le
téléphone puis ajoutée à l'écran d'accueil (Android : Chrome → « Installer l'application » ; iPhone, iOS 16.4
ou plus : Safari → Partager → « Sur l'écran d'accueil »). Elle demande une adresse **HTTPS** (reverse proxy
ci-dessus) accessible depuis les chantiers (Internet ou VPN). Les notifications passent par les services des
téléphones : le serveur doit pouvoir joindre en HTTPS `fcm.googleapis.com` (Android, Chrome),
`web.push.apple.com` (iPhone) et `updates.push.services.mozilla.com` (Firefox). Clés VAPID générées au premier
démarrage ; `NOTIF_DELAI_MS` (défaut 20000) règle le regroupement des changements avant l'envoi.
Paramètres → « Appli téléphone » rappelle les étapes ; chaque compagnon a un compte « Opérateur » relié à sa personne.

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

## Facturation électronique (plateforme agréée)

Dans **Achats → Factures électroniques → Configuration** (administrateur) :

- **Dossier de réception** : dossier du serveur où la plateforme (ou son outil de synchronisation : SFTP, OneDrive,
  connecteur fourni par la plateforme) dépose les factures reçues (.xml ou .pdf Factur-X). Les fichiers traités sont
  rangés dans `traites`, ceux qui ne sont pas des factures électroniques dans `erreurs` (avec la raison).
- **Adresse de dépôt sécurisée** : URL à jeton (`/api/efacture/depot/<jeton>`) à laquelle la plateforme envoie
  directement chaque facture (corps XML ou PDF, ou JSON `{ nom, base64 }`). Le serveur doit alors être joignable
  par la plateforme (reverse proxy HTTPS). Le jeton se change en un clic.
- **Dossier d'envoi** : le CRM y dépose nos factures (XML CII + PDF Factur-X) pour transmission par la plateforme.

Le XML CII produit suit la structure du profil EN 16931 ; faites valider un premier envoi par votre plateforme.
Le PDF Factur-X contient le XML joint mais n'est pas certifié PDF/A-3 : si votre plateforme l'exige, transmettez le XML.

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
   Les lignes sont des **ouvrages** rangés en **chapitres, sous-chapitres et sous-sous-chapitres** (sous-total à
   chaque niveau). Un ouvrage = fournitures de la bibliothèque (quantité par unité) + main-d'œuvre (catégorie ×
   heures par unité) : prix unitaire = fournitures + main-d'œuvre. Numérotation automatique (1, 1.1, 1.1.1…) :
   taper un autre N° déplace la ligne, ou le chapitre avec son contenu, à cette place ; en numérotation manuelle
   (N° de prix d'un DPGF), les lignes se rangent sous le chapitre et dans l'ordre de leurs numéros.
   Lignes de **texte** (précisions, exclusions) et d'**image** (photo, schéma, avec légende et largeur) non chiffrées.
   **Poste libre** : fournitures et main-d'œuvre saisies pour ce seul devis, sans rien enregistrer en bibliothèque ;
   les ouvrages récurrents s'enregistrent en **ouvrages types** (Bibliothèque → Ouvrages types) et s'insèrent aux
   prix à jour. **Remises et majorations** en % sur l'ensemble des lignes.
   **TVA** : 20 %, 10 %, 5,5 % ou 0 % par devis (reprise sur ses factures), taux propre à une ligne si besoin
   (ex. calorifuge à 5,5 % dans un devis à 10 %), ou **autoliquidation** (sous-traitance BTP, art. 283-2 nonies du CGI) ;
   régime par défaut sur la fiche du client. Ventilation de la TVA par taux sur les documents, mentions légales
   automatiques, écritures comptables par taux (comptes de TVA 10 % / 5,5 % et de travaux autoliquidés paramétrables),
   catégories S / AE / E dans la facture électronique Factur-X.
   Documents au **format A4** (PDF A4 exact, impression A4 avec en-tête de tableau répété sur chaque page).
   Le pilotage prévisionnel sépare la part fournitures et la part main-d'œuvre (heures par catégorie, coûts, marge).
2. **Devis accepté → chantier** (numéro `CH-AAAA-001`) : le devis devient le budget du chantier.
3. **Commandes fournisseurs** (`CF-AAAA-0001`) affectées à un chantier ; elles peuvent reprendre
   automatiquement les fournitures prévues au devis et pas encore commandées. Leur montant est le coût
   réel des fournitures.
4. **Pointage mobile** des opérateurs (arrivée / départ par chantier et tâche, pause, panier repas).
   « Ma semaine » montre chaque jour de la semaine en cours (prévu, pointé, oubli signalé) : le compagnon pointe un jour
   oublié ou corrige un pointage non validé ; les semaines passées ne se corrigent qu'au bureau (règle du serveur).
   Sans planning, il pointe sur une intervention hors devis ou en ouvre une depuis son téléphone : objet, client,
   contact client (choisi parmi les contacts connus ou saisi avec son téléphone), nom du site (sites du client ou saisi),
   précision du lieu, demande. Le bureau est prévenu ; un client, un contact ou un site saisi à la main se crée en un clic
   dans les contacts depuis la fiche de l'intervention, puis le bureau désigne le chargé d'affaires et facture.
   **Demande du client par e-mail** : sur la fiche de l'intervention, l'espace « 📧 Demande du client » reçoit l'e-mail
   glissé depuis Outlook (.msg), un .eml, un PDF ou une capture, ou le texte collé. L'e-mail est lu dans le navigateur
   (expéditeur, date, objet, texte, noms des pièces jointes), l'original est gardé dans les documents (non transmis aux
   compagnons) et pré-remplit ce qui est vide : client et contact reconnus par l'adresse de l'expéditeur, site habituel du
   contact, objet, demande. « 📧 Depuis un mail » (Chantiers) crée directement l'intervention à partir de l'e-mail.
   L'attachement envoyé au client rappelle « suite à votre demande du … ».
   Le matériel d'une intervention hors devis se choisit en plein écran : recherche, familles et sous-familles en
   pastilles, « déjà utilisé ici », quantités + / −, matériel hors bibliothèque (même écran au bureau, avec les prix).
   **Dictée d'une liste de matériel** (« 🎤 Dicter », dans le devis, le rapport d'intervention et la fiche hors devis) :
   « 3 coudes de 50, 2 brides DN100 et 12 mètres de tube inox 50 » donne une ligne par article, rapprochée de la
   bibliothèque (trouvé / à choisir / hors bibliothèque), à vérifier avant l'ajout. Quantités en chiffres ou en lettres,
   unités (mètres, pièces, kg…), DN dit « de 50 » ou « DN 50 », pouces convertis en DN. Reconnaissance vocale du
   navigateur (Chrome, Edge, Safari) ou micro du clavier du téléphone.
   La même dictée remplit les bons de commande fournisseurs (au prix d'achat) et les demandes de prix ; dans le rapport
   d'intervention, « 🎤 Dicter » sous chaque champ (travaux, observations, besoins) écrit le texte dicté, ponctuation
   dite comprise (« virgule », « point », « à la ligne »).
   Un **chef d'équipe** pointe en une fois les compagnons et **intérimaires** sous ses ordres (filtre « intérimaires »).
   Le coût réel de main-d'œuvre = heures pointées × coût horaire de chaque personne (taux agence pour les intérimaires).
   **Notes de frais** : photo du ticket prise avec le téléphone (raccourci « Note de frais » de l'appli),
   lue sur l'appareil (montant TTC, date, TVA, enseigne, catégorie, couverts : Tesseract, rien n'est envoyé à
   l'extérieur), imputée au chantier, validée puis remboursée. Au restaurant, les noms des personnes présentes
   sont obligatoires (collègues du chantier proposés, invités avec leur société) ; le bureau voit les écarts
   avec le ticket (montant ou date corrigés, nombre de couverts).
   **Validation** des pointages par le chargé d'affaires (ses chantiers) avant la paie ; un pointage validé est verrouillé.
5. **Pilotage du chantier** : budget du devis face au réel : heures prévues au devis face aux heures pointées par les compagnons
   (coût de chaque personne), fournitures au prix d'achat des commandes (au montant facturé une fois rapprochées) et des
   factures fournisseurs imputées hors commande, notes de frais,
   marge prévue et **marge à terminaison** (projection du reste à faire).
6. **RH** : synthèse mensuelle des heures **validées** (heures normales, supplémentaires à 25 % / 50 % calculées
   par semaine, paniers, notes de frais, salaire brut indicatif), intérimaires à part (rapprochement de la facture
   d'agence). **Récap Excel** du mois : une feuille de synthèse, une feuille par personne (détail jour par jour,
   total de chaque semaine et découpage des heures supplémentaires), une feuille des notes de frais.
7. **Situations de travaux** (menu Situations) : vue par chantier (marché, facturé, reste, retenues) et liste de
   toutes les situations. Avancement saisi ligne par ligne en **% cumulé, en quantités réalisées ou en montant** ;
   lignes ou chapitres **cochés** pour leur appliquer un pourcentage (« mettre à 50 % », « ajouter 20 % »,
   « solder », « rien cette fois »). **Retenue de garantie cochable** sur chaque situation (taux du chantier par
   défaut, modifiable). Envoi par **e-mail pré-paramétré** (modèle « Situation de travaux ») → situation « envoyée » ;
   dès qu'elle est **validée**, la facture est créée (montant = cumul − situations précédentes, retenue déduite)
   et son e-mail est préparé. **Numérotation par année paramétrable comme les factures** (`BL-AAAA-0001` par
   défaut, préfixe, année, chiffres, reprise du prochain numéro). **Analyse** par chantier et par chargé d'affaires, REX.

| Module | Contenu |
|---|---|
| **Contacts** | Entreprises client / fournisseur (SIRET, TVA, coordonnées) avec plusieurs sites ; personnes rattachées (chargé de travaux, acheteur…). |
| **Bibliothèque** | Fournitures (prix d'achat, prix de vente, poids, fournisseur habituel) rangées par famille et sous-famille : arbre cliquable avec les effectifs, rangement de plusieurs fournitures d'un coup, renommage d'une famille ou d'une sous-famille, révision des prix sur la famille affichée, colonne « Sous-famille » à l'import / export Excel. Recherche au fil de la frappe sur la référence, la désignation, la famille, la sous-famille et le fournisseur (mots dans le désordre, sans accents, « dn 50 » = « DN50 », « 50 » ne trouve pas DN150, une faute de frappe tolérée si rien d'exact) ; la même recherche filtre les listes de fournitures des devis, commandes et consultations. Catégories de main-d'œuvre (taux de vente, coût moyen), zones de livraison. |
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
| **Planning visuel** | **Semaine** : une colonne par jour, une carte colorée par chantier avec les pastilles des compagnons affectés (tâches, heures, consignes), les « Disponibles » et les absents ; on glisse une pastille d'un chantier à l'autre, depuis « Disponibles » vers un chantier (horaires repris des collègues) ou vers « Disponibles » pour libérer la journée. Anneaux de charge de chaque personne (heures prévues / capacité : 🔥 surchargé, 💪 complet, 💤 rien de prévu), compteurs de la semaine. **Par personne** : calendrier de cinq semaines (chantier, tâche, heures, conforme / écart / non pointé), jauge hebdomadaire, chantiers de la période. **Absences** (congés, RTT, maladie, formation…) posées sur un ou plusieurs jours. Téléphone du compagnon : « Bonjour Kevin, aujourd'hui… », bulles de la semaine, jours modifiés mis en évidence. |
| **Ce que voient les compagnons** | Paramètres → « Appli des compagnons : ce qu'ils voient » (administrateur) : nom du client, contact sur site, matériel prévu en détail, quantités, commandes et livraisons, documents, collègues, heures prévues au devis, prix. Réglage « chantier seul, sans prix » en un clic. Le **serveur filtre les données avant l'envoi** (au chargement, dans l'API et en temps réel) : factures, situations, achats, consultations, taux horaires et salaires ne partent jamais vers un compte Opérateur, ni ce qui est décoché. Le matériel saisi par un compagnon prend toujours le prix de la bibliothèque. Sur le téléphone, onglet **Chantiers** : adresse (GPS), accès, contact, jours prévus, documents, **matériel prévu** (total par article avec référence, ou détail par ouvrage ; commandé / livré) et livraisons attendues, sans prix ni heures. |
| **Documents du chantier** | Onglet **📎 Documents** de chaque chantier : plans, fiches techniques, notices, PPSPS, photos (PDF, images, DWG/DXF, IFC, Excel, Word, ZIP ; 40 Mo par fichier), déposés par glisser-déposer, catégorie devinée d'après le nom, **indices** (le nouvel indice remplace le fichier, les précédents restent consultables). Case « transmis aux compagnons » : le document apparaît sur leur téléphone et les compagnons planifiés sur le chantier reçoivent une notification (« 📎 Nouveau document : CH-… »). Les PDF et images s'ouvrent dans le navigateur ; les autres formats se téléchargent sous leur nom. |
| **Notifications et appli téléphone** | Dès que le planning d'un compagnon change (aujourd'hui ou plus tard), il est prévenu : cloche 🔔 dans l'appli (temps réel) et notification sur son téléphone même appli fermée (Web Push : Android, iPhone iOS 16.4+, ordinateur). Les changements faits d'un coup sont regroupés (une notification par personne : « Votre planning a changé : 3 jours » avec chantier et horaires de chaque jour) ; un intérimaire sans compte : son chef d'équipe est prévenu. L'appli s'installe sur l'écran d'accueil (PWA, même adresse que le bureau, reliée en temps réel, ouverture possible sans réseau). |
| **Charge par semaine** | Charge hebdomadaire par personne face à sa capacité (planning jour par jour inclus), heures pointées, reste à planifier par chantier. |
| **Factures fournisseurs** | Achats → Factures fournisseurs : saisie (fournisseur, n° de facture, montants, échéance, photo ou PDF de la facture) et ventilation sur un ou plusieurs chantiers. Une ligne rapprochée d'une commande remplace le montant commandé par le montant facturé (écart affiché) ; une ligne hors commande ajoute l'achat au chantier (raccords pris au comptoir chez Descours & Cabot ou Téréva avec le n° de chantier). Le reste non imputé est signalé « à ventiler » ou classé en frais généraux / stock. Sur la fiche chantier : commandes, factures rapprochées et achats hors commande, total retenu pour la rentabilité. |
| **Avoirs** | Depuis une facture : avoir total (la facture passe « Annulée »), partiel par lignes et quantités, ou montant libre (geste commercial, réfaction), avec motif. Numérotation propre (`AV-AAAA-0001`), PDF, envoi par e-mail ; l'avoir est déduit du chiffre d'affaires, du reste dû de la facture et des analyses. Une facture numérotée n'est jamais supprimée. |
| **Numérotation** | Factures et avoirs : préfixe, séparateur, année (4 ou 2 chiffres, remise à 1 chaque année, ou suite continue sans année) et nombre de chiffres paramétrables (Paramètres). Numéros attribués par le serveur dans l'ordre, sans trou ; reprise d'une numérotation existante en indiquant le prochain numéro (jamais en dessous d'un numéro déjà attribué). |
| **Comptabilité** | Journaux des ventes et des achats (Facturation → Comptabilité) : écritures équilibrées par pièce. Ventes : client 411 avec compte auxiliaire de la fiche entreprise, retenue de garantie, travaux 704, livraison 7085, TVA 44571 ; avoirs en sens inverse. Achats : achats 601 ventilés par chantier (section analytique = n° de chantier), reste non ventilé, TVA déductible 44566, fournisseur 401 avec compte auxiliaire. Comptes paramétrables. Export Excel, CSV (Sage, Cegid, EBP, Quadra, Pennylane…) et FEC ; suivi des pièces transmises (seules les nouvelles sont exportées la fois suivante) ; envoi au cabinet comptable par e-mail avec le journal et les PDF des factures. |
| **Facturation électronique** | Réforme 2026. Réception : les factures des fournisseurs (Factur-X / ZUGFeRD, XML CII ou UBL) arrivent de la plateforme agréée par un dossier surveillé sur le serveur (relevé toutes les 2 minutes), par une adresse de dépôt sécurisée (jeton) ou par import manuel ; le fournisseur est reconnu par son SIREN ou son n° de TVA (fiche créée sinon), la commande (n° CF…) ou le chantier (n° CH… / HD…) par les références de la facture ; « Intégrer » crée la facture fournisseur ventilée, « Rejeter » garde le motif. Émission : chaque facture et avoir au format CII (profil EN 16931) et en PDF avec le XML joint (Factur-X), déposés dans le dossier d'envoi de la plateforme ou téléchargés. Mentions obligatoires 2026 (SIREN du client, catégorie de l'opération) sur les factures. |
| **Chiffrage depuis plan** | Devis → Chiffrage depuis plan : import de la nomenclature exportée du logiciel de dessin (Revit : Exporter → Rapports → Nomenclature, .txt ; ou .csv / .xlsx), colonnes reconnues (système, famille, type, taille, longueur, nombre). Chaque élément est relié à une **famille CAO** (Bibliothèque → Familles CAO : catégorie tube / raccord / robinetterie / autre, article et nombre de soudures par diamètre, ex. coude DN50 = 2 soudures de 2"). **Préfabrication atelier** : fournitures du plan (le tube en fourniture seule) et soudures en pouces-diamètre (cadence atelier, part réalisée en atelier). **Pose sur site** : main-d'œuvre et taux horaire propres, barèmes de temps de pose par diamètre pour les tubes (h/ml) et la robinetterie (h/u), soudures de raccordement restantes à la cadence chantier ; le devis est généré en sous-chapitres « Préfabrication atelier » et « Pose sur site » par réseau ; niveaux de complexité (coefficient sur les heures, marge sur les achats du plan) ; chapitres hors plan (container, levage, manutention, nacelle, échafaudage, études, essais…). Le devis est généré par réseau et peut être régénéré sans doublon ; les fournitures du plan peuvent partir en consultation. |
| **Consultations fournisseurs** | Achats → Consultations : demande de prix à plusieurs fournisseurs (lignes reprises du chantier, d'un chiffrage ou de la bibliothèque), envoyée par e-mail avec le PDF et un tableau Excel à compléter. Offre saisie ou importée depuis le tableau rempli (prix, remise, port, délai, validité, offre jointe). Comparatif : mieux-disant global, optimum ligne par ligne, écart au prix de la bibliothèque ; attribution puis création des commandes en un clic, avec mise à jour des prix d'achat. |
| **API et automatisations** | Paramètres → API et automatisations : clés personnelles (`Authorization: Bearer pf_…`, droits du compte, révocables), lecture filtrée (`/api/records/{liste}?modifieDepuis=…&filtre=champ:valeur`), création / modification, import groupé, dépôt de factures électroniques, envoi d'e-mails. Webhooks sortants signés (HMAC SHA-256) à chaque création / modification / suppression dans les listes choisies, pour Power Automate, Make, Zapier, n8n… Description OpenAPI sur `/api/openapi.json` pour créer un connecteur. |
| **Filtres et archives** | Devis, chantiers, factures, situations et tableau de bord filtrables par client, chargé d'affaires, statut et recherche (n°, objet, client) ; filtres mémorisés par écran sur chaque poste. Par défaut, seuls les devis en cours (brouillons, envoyés) et les chantiers non clos s'affichent. Devis « Refusé » en un clic avec motif (prix, délai, concurrent…) et archivage ; chantiers et devis archivables à l'unité, par sélection multiple ou en lot (clos, refusés) : masqués des listes, du tableau de bord, du pointage et du planning, toujours consultables (filtre « Archivés ») et comptés dans les analyses (motifs de refus). |
| **Rôles** | Administrateur ; chargé d'affaires ; opérateur (pointe uniquement ses propres heures). |

## Relances des factures impayées

Facturation → **Relances** (et rappel sur le tableau de bord) : factures en retard avec leur nombre de jours, montant
restant dû, dernière action et prochaine étape. Quatre niveaux, envoyés par e-mail avec la copie de la facture
(Microsoft 365 ou brouillon Outlook) : rappel courtois à J+1 après l'échéance, 2e relance à J+15, dernière relance à J+30,
mise en demeure à J+45 (lettre PDF à envoyer aussi en recommandé). Délais réglables sur l'écran, textes dans
Paramètres → E-mails ; deux relances sont toujours espacées d'au moins 7 jours. Les appels et promesses de paiement
se notent (📞) ; tout l'historique apparaît sur la facture et sur la fiche client (« Factures et relances »).
Retenues de garantie : date de libération (réception + 1 an), demande de libération par e-mail avec le récapitulatif
des retenues, puis « Libérée ».

## Habilitations, visites médicales, parc

**RH → Habilitations** : tableau personne × habilitation (visite médicale, QMOS soudeur, fluides frigorigènes,
électrique, CACES nacelle et chariot, travail en hauteur, SST, AIPR, amiante SS4, ATEX) avec date d'obtention, date
d'expiration (proposée selon la validité usuelle), niveau et justificatif photo ou PDF. Vert / orange (moins de 60 jours) /
rouge (expirée). Le planning signale ⚠ / ⛔ les personnes concernées.

**Parc** : véhicules et outillage (nacelles, postes à souder, appareils de mesure, échafaudages, station fluides…),
affectation à une personne ou à un chantier avec historique, kilométrage, contrôles périodiques proposés selon la
catégorie (contrôle technique, entretien, assurance, VGP, étalonnage, vérification électrique), bouton « ✓ Fait ».
Les compagnons voient leurs habilitations et le matériel qui leur est confié dans l'appli (onglet Chantiers).

Le serveur vérifie les échéances toutes les 6 heures : un résumé au bureau, un message à la personne concernée (ou à
son chef d'équipe), une fois 60 jours avant (30 jours pour le parc) puis une fois à l'expiration. Rappel sur le tableau de bord.

## Intérim : entrées, sorties et registre du personnel

**RH → Intérim** : intérimaires présents (agence, entrée, fin prévue, chantier, heures pointées), « + Entrée d'un
intérimaire » (fiche de l'équipe créée à la première mission, reprise des informations d'une mission précédente),
« Prolonger » (avenant de renouvellement gardé en historique) et « Sortie » (date et motif). Registre du personnel
intérimaire dans l'ordre des entrées avec les mentions obligatoires (nom, nationalité, date de naissance, sexe, emploi
et qualification, dates d'entrée et de sortie, mention « salarié temporaire », nom et adresse de l'entreprise de travail
temporaire, plus le n° du contrat de mise à disposition et le motif de recours ; type et n° du titre autorisant à
travailler pour les nationalités hors UE / EEE / Suisse), filtre par année et agence, export Excel et PDF A4.
Alertes : registre incomplet, fin de mission prévue dépassée sans sortie, durée maximale du motif dépassée, titre de
séjour expiré ou expirant sous 60 jours. Un chargé d'affaires peut créer et modifier les fiches des intérimaires
(pas celles des salariés) ; les compagnons n'ont pas accès au registre.

## Trésorerie prévisionnelle et tableau de bord par chargé d'affaires

**Facturation → Trésorerie** : solde de fin de semaine sur 13 semaines à partir du solde bancaire saisi. Encaissements :
factures clients non soldées (retards supposés encaissés sous 2 semaines, désactivable), situations proposées ou
acceptées non facturées, retenues de garantie libérables. Décaissements : factures fournisseurs à payer, commandes pas
encore facturées (délai fournisseurs réglable), salaires chargés (estimés depuis l'équipe ou saisis), notes de frais
validées, charges fixes mensuelles. Courbe avec les semaines négatives, détail de chaque semaine avec lien vers la pièce.

**Tableau de bord → Par chargé d'affaires** (« Mon tableau de bord » pour un chargé) : comparatif (chantiers en cours,
carnet, facturé de l'année, marge à terminaison, devis en attente, transformation sur 12 mois, retards de paiement),
puis pour chacun : ce qu'il a à faire (relances, devis à relancer après 15 jours, situations en attente, interventions
à facturer ou à compléter, pointages et notes de frais à valider, commandes en brouillon, réserves) et ses chantiers qui
dérapent (heures, fournitures, marge à terminaison inférieure de 3 points à la marge prévue).

## Sécurité des chantiers : PPSPS, PGC, plans de prévention, FDS

**Chantier → ⛑️ Sécurité** : le PGC du coordonnateur SPS et le plan de prévention spécifique au chantier se joignent en
un clic ; le plan de prévention annuel du client (fiche client → Plans de prévention annuels, pour tous les sites ou un
site, avec dates de validité) est repris automatiquement tant qu'il est valide. Le PPSPS se rédige sur la même page :
renseignements généraux (dates et effectif tirés du planning), contraintes du PGC et du site, analyse des risques
(bibliothèque du métier : points chauds, hauteur, levage, réseaux en service, produits chimiques, espace confiné, ATEX,
amiante, électricité, fluides frigorigènes, réseaux enterrés, coactivité, bruit, circulation ; le bouton « Proposer les
risques » les coche d'après les contraintes, l'objet du chantier et le devis), mesures et EPI modifiables, secours
(numéros d'urgence, hôpital, point de rassemblement, SST planifiés), base vie. Les intervenants planifiés sont contrôlés :
habilitations requises par les risques retenus, visite médicale. Le matériel du parc et les produits dangereux de
l'équipe sont listés. « Générer le PPSPS » crée le PDF (indice A, B, C…) dans les documents du chantier.

**Parc → Produits et FDS** : produits transportés dans les véhicules (gaz, décapants, colles…) avec pictogrammes CLP,
mentions H, EPI, premiers secours et fiche de données de sécurité ; alerte si la FDS manque ou a plus de 3 ans.

**Appli des compagnons** : la fiche du chantier affiche un bloc Sécurité (numéros d'urgence à composer d'un geste, point
de rassemblement, SST, risques et EPI, PPSPS, PGC, plan de prévention annuel ou spécifique) et les FDS des produits de
leur véhicule, aussi visibles dans « Mon véhicule ». Les documents de sécurité sont transmis même si l'affichage des
autres documents est désactivé.

## Répertoire des documents sur le serveur

Les documents des chantiers sont aussi enregistrés dans un répertoire du serveur, synchronisé avec l'appli dans les deux
sens (par défaut `Documents` à côté de la base, sous Windows `C:\ProgramData\PipeFitCRM\data\Documents` ; chemin,
activation et fréquence dans **Paramètres → Répertoire des documents sur le serveur**, ou variable `DOCUMENTS_DIR`) :

```
Documents\Chantiers\CH-2026-001 - Ligne NEP inox – Usine de Rumilly\
    Plan\  Fiche technique\  Notice\  Sécurité - PPSPS\  PGC\  Plan de prévention\  Photo\  Demande client\  Autre\
    _Indices précédents\
Documents\_Corbeille\
```

- Déposé dans l'appli → écrit dans le dossier de sa catégorie (quelques secondes après). Nouvel indice : l'ancien
  fichier est rangé dans `_Indices précédents`.
- Copié dans le dossier d'un chantier → apparaît dans l'appli (vérification toutes les 30 s, ou « 🔄 Synchroniser »
  dans l'onglet Documents) : dans un dossier de catégorie, il en prend la catégorie ; à la racine du chantier, la
  catégorie est devinée d'après le nom et le fichier y est rangé ; dans un autre sous-dossier, il y reste. Les fichiers
  ajoutés ainsi sont transmis aux compagnons (réglable).
- Remplacé dans le répertoire (même nom), ou recopié à la racine avec le nom d'un document existant → nouvel indice ;
  copie identique → ignorée. Renommé ou déplacé → le document suit. Chantier renommé → son dossier aussi.
- Supprimé dans l'appli → fichier déplacé dans `_Corbeille`. Supprimé du répertoire → retiré de l'appli, sauf si plus de
  la moitié des fichiers d'un chantier disparaissent d'un coup (partage débranché, mauvaise manipulation) : rien n'est
  retiré et les fichiers sont réécrits ; une alerte s'affiche dans les Paramètres.
- Modifié des deux côtés en même temps : la version de l'appli l'emporte, celle du serveur est gardée dans
  `_Indices précédents`.
- Types acceptés : PDF, images, DWG/DXF/DWF, IFC/STEP, Word, Excel, PowerPoint, CSV, ZIP, texte, e-mails ; 40 Mo au plus.
  Les autres fichiers sont ignorés (listés dans les Paramètres), comme les fichiers temporaires d'Office (`~$…`).

Pour y accéder depuis les postes du bureau, partagez ce répertoire sur le réseau (Windows : clic droit → Propriétés →
Partage) avec les droits de lecture et d'écriture pour les personnes du bureau. Les fichiers restent aussi dans la base :
l'appli fonctionne même si le répertoire est indisponible, et la sauvegarde de la base suffit.

## Structure

```
server/server.js   API REST, connexion, droits, temps réel (SSE), fichiers statiques
server/db.js       base SQLite, mots de passe (scrypt), numérotation
server/demo.js     données de démonstration
server/m365.js     envoi des e-mails par Microsoft Graph
server/efacture.js réception (dossier, adresse de dépôt) et dépôt des factures électroniques
server/api.js      clés d'API, webhooks sortants, description OpenAPI
server/dossier-documents.js  répertoire des documents synchronisé avec l'appli
public/            interface web (HTML/CSS/JS sans framework)
test/              tests de l'API (npm test)
public/js/devis.js, commandes.js, pointage.js, suivi.js, horsdevis.js, documents.js, pdf.js, mails.js, equipes.js, filtres.js, compta.js, achats.js, facturx.js, efacture.js, chiffrage.js, consultations.js, automatisation.js, biblio.js, contacts.js, securite-ui.js, produits.js, dossier-documents.js : écrans métier
doe/               application DOE séparée (serveur, interface, génération du dossier PDF)
installer/         installateur Windows (NSIS) : build.sh, PipeFitCRM.nsi, lanceur et service
```

## Évolutions possibles

Import des temps depuis une badgeuse ou l'ERP
de production, pièces jointes (plans, photos), application mobile pour la saisie atelier.
