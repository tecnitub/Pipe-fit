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

**DOE automatique** : les procès-verbaux signés dans Pipe-Fit pour le chantier sont repris tout seuls dans le DOE, avec
la même mise en page : PV de mise en service, fiches fluides de mise en service (Cerfa) et relevés d'équilibrage
hydraulique en annexe F ; PV d'épreuve hydraulique, relevés d'équilibrage aéraulique et autres fiches fluides en annexe G.
Les pièces correspondantes des listes de contrôle des sections 5 et 6 sont cochées (« Pipe-Fit »). Avec les plans,
fiches techniques, notices et le PV de réception déjà repris, « Générer le DOE » produit le dossier complet en un clic.

## Prise de cotes tuyauterie (photos avant / après, isométrique 3D)

Depuis un chantier (« + Prise de cotes ») ou sur le téléphone du compagnon (Pointage › Rapports › 📐 Prise de cotes) :

- **Photos avant travaux** et **après travaux**, légendées, avec un comparatif avant / après côte à côte ;
- **cotes relevées** (repère, désignation, cote en mm, remarque) ;
- **ligne en 3D** construite pièce par pièce depuis le départ : tubes, coudes 90° / 45° (3D), tés avec dérivation (elle-même
  construite pièce par pièce), réductions concentriques ou excentriques, robinetterie (tournant sphérique, papillon, opercule,
  soupape, clapet anti-retour, filtre en Y ; à brides, à souder ou taraudée), paires de brides, raccords union et manchons, fonds
  bombés. Vue isométrique, de dessus, de face, de côté ; rotation au doigt, zoom par pincement ; toucher une pièce la retrouve
  dans la liste ;
- **longueurs de coupe calculées** : on saisit la cote axe à axe relevée entre deux coudes ou tés, l'appli retire les cotes
  axe-face et l'encombrement des accessoires du tronçon ;
- **nomenclature** (tubes au mètre par DN, raccords, robinetterie, brides, joints et boulonnerie) et **fiche imprimable / PDF**
  avec l'isométrique.

Dimensions des accessoires : ISO 4200 / EN 10220 (tubes), ISO 3419 / EN 10253 (raccords à souder), EN 1092-1 / ISO 7005-1
(brides PN16), EN 558 / ISO 5752 (face à face de la robinetterie), ISO 49 (raccords filetés). Ce sont des valeurs nominales
indicatives : une longueur saisie sur l'élément remplace la valeur de la norme (à confirmer avec la fiche technique du fabricant).
Calculs dans `public/js/tuyauterie.js` (commun navigateur / serveur / tests), vue 3D sans bibliothèque dans `public/js/vue3d.js`.

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

## Factures fournisseurs reçues : plateforme agréée et boîte e-mail

Toutes les factures des fournisseurs arrivent dans **Achats → Factures reçues** : factures électroniques de la
plateforme agréée (Factur-X, CII, UBL) et factures PDF envoyées par e-mail à une adresse dédiée. Chaque PDF est lu
dès son arrivée (texte, ou reconnaissance du scan) : fournisseur (SIRET / TVA, sinon adresse de l'expéditeur), n°,
date, échéance, totaux HT / TVA / TTC, IBAN, commande (CF-…) ou chantier (CH-… / HD-…) cité, lignes d'articles. Les
champs restent modifiables. La même facture reçue deux fois (par e-mail et par la plateforme, ou déjà saisie) est
signalée « doublon ? ». Ensuite :

- **Accepter** : la facture fournisseur est créée avec le PDF, rapprochée de la commande citée (ou imputée au chantier
  cité, sinon « à ventiler ») ; le contrôle prix / quantités de la commande s'y fait comme d'habitude.
- **Refuser** : motif obligatoire (liste de motifs courants). Facture reçue par e-mail : le fournisseur peut être
  prévenu automatiquement, depuis la boîte des factures, avec le motif. Facture de la plateforme : signaler le refus
  sur la plateforme, qui en informe le fournisseur.

**Boîte des factures** (administrateur, **Achats → Factures reçues → Configuration**) : adresse Microsoft 365
dédiée (ex. `factures@votre-domaine.fr`), relevée toutes les 2 minutes (bouton « Relever » pour le faire tout de
suite). Chaque pièce jointe PDF ou XML devient une facture à traiter ; l'e-mail est marqué lu et rangé dans un
sous-dossier (« Factures traitées » par défaut). Un e-mail dont une pièce n'a pas pu être lue reste non lu dans la
boîte de réception. Prérequis : la connexion Microsoft 365 de **Paramètres → E-mails**, avec en plus l'autorisation
d'application **`Mail.ReadWrite`** (consentement administrateur) ; limitez-la à cette boîte par une stratégie d'accès
d'application Exchange. Autre messagerie : une règle de transfert vers une boîte Microsoft 365, ou un outil qui enregistre
les pièces jointes dans le dossier de réception ci-dessous (les PDF simples y sont acceptés aussi).

### Plateforme agréée

- **Dossier de réception** : dossier du serveur où la plateforme (ou son outil de synchronisation : SFTP, OneDrive,
  connecteur fourni par la plateforme) dépose les factures reçues (.xml, .pdf Factur-X ou PDF simple). Les fichiers
  traités sont rangés dans `traites`, ceux qui ne sont pas lisibles dans `erreurs` (avec la raison).
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

### Affichage par accès

**Paramètres → Affichage par accès** (administrateur) : cases à cocher, par accès, des menus du bureau (Direction,
Facturation, RH, Analyse…), des écrans et onglets (Trésorerie, Comptabilité, Factures reçues, Historique des prix…) et
des onglets de l'appli des compagnons (Notes de frais, Comptoir, Fluides, PV d'épreuve, mise en service, équilibrage…).
Un compte peut recevoir son propre réglage (« Personnaliser un compte… », ✕ pour revenir à celui de son rôle).
L'administrateur voit toujours tout ; Paramètres et notifications restent accessibles. Un écran masqué disparaît des
menus et des onglets, et son adresse ramène au premier écran affiché.

**Contrôle par le serveur** : les données d'un écran masqué ne partent plus vers ce compte (chargement, lecture par
l'API, flux temps réel) et toute modification est refusée (403). Selon l'écran :

- données retirées : Facturation (factures, réglages comptables et de trésorerie), Achats (factures fournisseurs, factures
  reçues, comptoir, consultations), Parc, Fluides, habilitations (RH), Factures reçues, Comptoir… ; côté compagnons :
  notes de frais, rapports, planning, PV d'essais, fluides, comptoir, documents des chantiers ;
- lecture seule, quand d'autres écrans en ont besoin : contacts, devis, chantiers, bibliothèque, planning, situations,
  commandes, fiches du personnel et notes de frais (RH, sans les salaires horaires) ;
- affichage seulement pour les écrans de synthèse sans données propres (Tableau de bord, Direction, Analyse, Pointage
  du bureau, Historique des prix), signalés « (affichage) » dans le tableau.

Les pièces jointes restent accessibles par leur lien (identifiant aléatoire non devinable) à qui l'a déjà reçu.

### Recherche globale

Bouton 🔍 en haut de l'écran (ou Ctrl+K, ou « / ») : une seule barre pour retrouver un chantier, un client, un
fournisseur ou un contact, un devis, une facture, une situation, une commande, une facture fournisseur ou reçue, une
fourniture, un PV d'épreuve / de mise en service / d'équilibrage, une personne, un matériel du parc, un équipement
frigorifique. Tous les mots tapés doivent se retrouver (accents et majuscules ignorés) ; un n° ou un code passe en
tête, même incomplet (« dv-0007 » trouve DV-2026-0007, « 0002 » la fin d'un n°). Résultats groupés par type, flèches et
Entrée pour ouvrir. Seuls les écrans accessibles au compte sont proposés (affichage par accès) ; pas sur l'appli des
compagnons.

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
| **Comptabilité** | Journaux des ventes et des achats (Facturation → Comptabilité) : écritures équilibrées par pièce. Ventes : client 411 avec compte auxiliaire de la fiche entreprise, retenue de garantie, travaux 704, livraison 7085, TVA 44571 ; avoirs en sens inverse. Achats : ventilés par chantier (section analytique = n° de chantier) et par compte de charge selon la famille des articles achetés (lignes de la commande rapprochée ou de la facture : compte choisi par famille, sinon proposé — location 613, sous-traitance et contrôles 611, outillage 606, transport 624 —, sinon compte de charge de la fiche fournisseur, ex. intérim 6211, sinon achats 601), reste non ventilé, TVA déductible 44566, fournisseur 401 avec compte auxiliaire. Comptes paramétrables. Export Excel, CSV (Sage, Cegid, EBP, Quadra, Pennylane…) et FEC ; suivi des pièces transmises (seules les nouvelles sont exportées la fois suivante) ; envoi au cabinet comptable par e-mail avec le journal et les PDF des factures. |
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

## Tableau de bord du dirigeant et alertes de dérive

**Direction** (menu, pensé pour le téléphone) : CA facturé du mois et de l'année à date (comparés à l'an dernier), marge
à terminaison des chantiers en cours face à la marge prévue, trésorerie dans 30 jours et point bas, factures en retard,
fournisseurs à payer sous 30 jours, carnet de commandes, devis en attente ; puis la liste des chantiers en dérive, des
factures en retard et des devis en attente. Chaque tuile ouvre l'écran détaillé.

**Alertes de dérive** : toutes les 2 heures, le serveur compare chaque chantier en cours au budget de son devis (heures
pointées, achats, marge à terminaison) : alerte à 80 % du budget (réglable), dépassement à 100 %, consommation en avance
de 25 points sur l'avancement facturé, marge à terminaison inférieure de 5 points à la prévue ou négative. Le chargé
d'affaires du chantier (à défaut l'administrateur) est prévenu une fois par poste et par niveau, dans la cloche et sur son
téléphone. Bandeau sur la fiche chantier. Seuils dans Paramètres → Alertes de dérive (bouton « Vérifier maintenant »).

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

## Registre des fluides frigorigènes

**Fluides** : équipements des clients (fluide, charge, tonnes équivalent CO2 calculées avec le PRG, détection
permanente, équipement hermétique), périodicité du contrôle d'étanchéité (règlement F-Gas : 12, 6 ou 3 mois selon les
seuils de 5, 50 et 500 t éq. CO2, doublée avec un système de détection ; seuils en kg pour les HCFC), contrôle de suivi
sous un mois après une fuite réparée, alertes (notifications du bureau). Fiches d'intervention reprenant les rubriques du
Cerfa n° 15497 (opérateur et attestation de capacité, intervenant et attestation d'aptitude, détenteur, nature, détecteur,
fuites, fluide chargé vierge / recyclé / régénéré, récupéré, bouteilles), saisies au bureau ou sur le téléphone du
frigoriste avec la signature du client, numérotées (FI-AAAA-0001), figées une fois signées, PDF. Bouteilles (fluide
dedans = départ + récupérations − charges). Bilan annuel par fluide (Excel, PDF) pour la déclaration à l'organisme agréé.
Recharge en HCFC refusée. Les valeurs proposées sont à vérifier par l'opérateur : la fiche signée fait foi.

**Plaque signalétique et mise en service** : sur chaque équipement, photo de la plaque signalétique, lue automatiquement
(fluide, charge, marque, modèle, n° de série remplis dans les champs vides, à vérifier) ; la photo figure en annexe de la
fiche d'intervention. Sur le téléphone : **Fluides → Mise en service d'un équipement** enchaîne la création de
l'équipement (photo de la plaque d'abord) et la fiche Cerfa de mise en service, signée par le client.

## PV d'épreuve hydraulique

Sur le téléphone (**Pointage → Rapports → PV d'épreuve hydraulique**) ou sur la fiche chantier : formulaire pré-rempli
(chantier du jour, client, technicien, date et heure, manomètre du parc avec son étalonnage, alerte s'il est dépassé).
Le technicien indique le nom du réseau, la nature, la pression de service (la pression d'épreuve est proposée à 1,5 fois,
modifiable selon le CCTP), la durée de maintien, la chute admissible, les heures et pressions de début et de fin : le
résultat (conforme / non conforme) se calcule tout seul. Photos du manomètre, signature du technicien et du client.
Signé, le PV est numéroté (EP-AAAA-0001), figé, imprimable avec l'attestation du technicien, envoyé en PDF par e-mail ;
« Dupliquer pour un autre réseau » reprend les conditions pour le réseau suivant. Liste des épreuves sur la fiche chantier.

## PV de mise en service et relevés d'équilibrage

Sur le téléphone (**Pointage → Rapports**) ou sur la fiche chantier, à côté du PV d'épreuve :

- **PV de mise en service** : type d'équipement (PAC / groupe froid, climatisation, chaudière, CTA, VMC, pompes,
  désenfumage, ECS, régulation / GTB…) avec ses points de contrôle (OK, non conforme avec observation, sans objet ;
  « Tout OK ») et ses mesures (pressions HP / BP, surchauffe, températures, CO2, débits, intensités…). Photo de la
  plaque signalétique lue automatiquement (marque, modèle, n° de série, fluide et charge). Conclusion proposée :
  mis en service, avec réserves (point non conforme) ou non mis en service. Équipement frigorifique : lien vers la
  fiche fluides (Cerfa).
- **Relevé d'équilibrage** aéraulique (bouche par bouche) ou hydraulique (par organe) : débits théoriques (saisis ou
  importés d'Excel / CSV : repère, local, débit), débits mesurés, réglage, écart et conformité calculés selon la
  tolérance (± 10 % par défaut), totaux et résultat.

Signés par le technicien (et le client), ils sont numérotés (MS-AAAA-0001, EQ-AAAA-0001), figés, imprimables avec
l'attestation, envoyés en PDF, copiables pour l'équipement ou l'installation suivante, et repris dans le DOE.

**PV de réception** (Chantier → Réserves et réception) : réserves avec photo, signature du client et de l'entreprise sur
l'écran ; le PV imprimé reprend les photos des réserves (et après levée pour le PV de levée).

## Fournitures commandées hors bibliothèque

Sur une commande, chaque ligne qui n'est pas dans la bibliothèque (ligne libre, dictée, lue dans le devis PDF du
fournisseur) porte un lien « + bibliothèque », et le bouton « Les ajouter à la bibliothèque » les reprend toutes ; en
passant la commande en « Envoyée », l'appli le propose aussi. Les fiches sont pré-remplies : désignation, référence du
fournisseur, unité, prix d'achat, fournisseur habituel, famille devinée (article le plus ressemblant, sinon mots-clés :
tube, coude, vanne, collier, joint…), prix de vente au coefficient médian de la famille. Si un article très proche existe
déjà (même référence ou même désignation, mêmes dimensions), l'appli propose de relier la ligne à cet article plutôt que
de créer un doublon. La ligne de commande est ensuite rattachée à sa fiche (historique des prix, besoins du chantier).

## Offres fournisseurs : lecture des PDF et meilleure proposition

**Consultation** (Achats → Consultations) : « Importer l'offre (PDF, Excel) » sur la ligne d'un fournisseur lit son devis
PDF (ou une photo, ou un PDF scanné) sur l'appareil, sans rien envoyer à l'extérieur (pdf.js dans `public/vendor/pdfjs`,
OCR pour les scans) : lignes d'articles retrouvées en vérifiant quantité × prix (− remise) = montant, référence
fournisseur, prix net, remise, désignation sur plusieurs lignes, port, total HT (contrôle de cohérence), validité et délai.
Chaque ligne est rattachée à la fourniture demandée (même référence, sinon désignation la plus proche, sans confondre les
diamètres) ; tout est vérifiable et corrigeable avant l'enregistrement, les valeurs déduites d'un scan sont signalées.
**Meilleure proposition** : toutes les solutions sont chiffrées port compris (tout chez un fournisseur, partagé entre deux,
ligne par ligne) ; sont écartées celles qui livrent après la date souhaitée ou dont la validité est dépassée ; à moins de
2 % (ou 150 €) d'écart, la solution avec le moins de fournisseurs est préférée (moins de commandes, de ports et de
réceptions). « Retenir cette proposition » puis « Créer les commandes » : lignes avec la référence du fournisseur, devis
joint, « Suivant votre devis n° … » sur le bon de commande.

**Commande** : « Charger le devis du fournisseur » remplit la commande depuis le PDF (référence, désignation, quantité,
unité, prix net, port) ; les lignes déjà présentes sont mises à jour, l'article de la bibliothèque est retrouvé, son prix
d'achat et la référence du fournisseur peuvent être mis à jour.

## Rapprochement des factures fournisseurs

Sur la commande : **Réceptionner une livraison** (quantités reçues par ligne, n° de BL, photo, remarque), statut
« réceptionnée partiellement » ou « réceptionnée ». Sur la facture fournisseur rapprochée d'une commande : lignes de la
facture (reprises automatiquement d'une facture électronique, ou de la commande puis corrigées), comparées ligne à ligne
(même article, même référence ou désignation proche, sans confondre DN50 / DN100 ni 90° / 45°) : prix différent de la
commande (tolérance 1 %), quantité au-delà de la livraison ou de la commande (en tenant compte des autres factures), ligne
non commandée (frais de port…), total des lignes différent du montant HT. Décision : **bon à payer** (avec le motif d'un
écart accepté) ou **litige fournisseur**. Colonne « Rapprochement » dans la liste des factures.

## Achats au comptoir et relevé mensuel du fournisseur

Matériel pris au magasin d'un négoce sans commande. Au comptoir, le compagnon donne le **n° de chantier** (affiché sur
son téléphone sous le chantier choisi) puis le déclare dans **Pointage → Comptoir** : fournisseur, chantier, n° du bon,
montant s'il est indiqué, ce qui a été pris, photo du bon (fonctionne aussi sans réseau). La photo d'un BL chiffré est lue :
n° du bon et montant HT remplis (articles gardés), à vérifier avant l'envoi. **Le montant compte tout de suite dans la
rentabilité du chantier** (« comptoir sur BL, facture à venir » dans ses achats, dans la Direction et les alertes de dérive) ;
quand le relevé du fournisseur est rapproché, c'est le montant de la facture qui le remplace (pas de double compte). Il ne voit que ses
déclarations ; une fois rapprochées par le bureau, il ne peut plus les modifier.

Bureau : **Achats → Comptoir** liste les enlèvements « en attente du relevé ». À réception du relevé mensuel, créer la
facture du fournisseur puis **Importer le relevé des BL** (PDF, scan, Excel ou CSV ; relevé détaillé avec les articles
ou une ligne par BL). Pour chaque BL : date, référence donnée au comptoir et chantier retrouvé (code complet, fin du code
« 001 » ou « 26-001 » en tenant compte de l'année du BL, nom du chantier ou du site), montant, et la déclaration du
compagnon correspondante (même n° de BL, sinon même chantier, date à ±3 jours et montant à ±5 %). Une référence
illisible prend le chantier de la déclaration ; un BL sans chantier part en frais généraux / stock. Le chantier reste
modifiable avant de **Ventiler la facture** : une imputation par chantier (« Comptoir : BL 4512, 4538 »), les lignes
d'articles enregistrées pour l'historique des prix, les déclarations passées « facturé ». Les déclarations absentes du
relevé sont signalées (relevé suivant ?) et la fiche chantier rappelle les enlèvements pas encore facturés.

## Historique des achats et des prix

**Achats → Historique des prix** : tout ce qui a été acheté, article par article (bibliothèque, sinon référence du
fournisseur, sinon désignation) : nombre d'achats, quantité, montant, **prix mini, moyen (pondéré par les quantités) et
maxi**, écart maxi / mini, dernier prix et son évolution depuis le premier achat de la période, meilleur fournisseur et
économie possible. Filtres par **année** et par **fournisseur**, recherche, tri sur chaque colonne ; le détail d'un
article montre les prix par fournisseur et chaque achat (date, pièce, chantier). Sources : commandes envoyées, lignes des
factures fournisseurs (prix réellement payés ; la commande n'est alors pas recomptée) et relevés du comptoir. Frais de
port exclus. Export Excel (articles, achats, fournisseurs).

## Planning dans les agendas

- **Mon lien d'agenda** (Paramètres, pour chacun, compagnons compris) : abonnement iCal personnel au planning (chantier,
  horaires, adresse du site, accès, contact, consigne, absences ; celui de l'équipe pour un chef d'équipe), dans
  l'agenda du téléphone, d'Outlook ou de Google Agenda. Lien secret, révocable.
- **Planning dans Outlook** (Paramètres, administrateur) : chaque journée planifiée (7 jours passés, 90 à venir) est créée
  dans le calendrier Microsoft 365 de la personne (adresse de son compte, sinon de sa fiche), mise à jour ou supprimée
  quand le planning change (quelques secondes après, et toutes les 15 minutes). L'application Entra ID doit avoir
  l'autorisation **Calendars.ReadWrite** (en plus de Mail.Send), avec consentement administrateur.

## Appli des compagnons sans réseau

Sur le téléphone, l'appli (installée ou ouverte une première fois avec du réseau) démarre et fonctionne hors connexion :
données du compagnon gardées sur le téléphone, pointages, rapports, notes de frais, fiches fluides, photos et signatures
mis en file d'attente (bandeau « Hors ligne · n saisie(s) en attente ») et envoyés dans l'ordre au retour du réseau ; les
numéros (NF-, RI-, FI-) sont attribués à l'envoi. Une saisie refusée par le serveur (modifiée entre-temps par le bureau,
semaine close…) est signalée. Les données gardées et la file sont effacées à la déconnexion (avec un avertissement s'il
reste des envois).

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
server/agenda.js   planning dans Outlook (Microsoft Graph) et lien iCal
server/mail-factures.js  boîte e-mail des factures fournisseurs (Microsoft Graph)
public/            interface web (HTML/CSS/JS sans framework)
test/              tests de l'API (npm test)
public/js/devis.js, commandes.js, pointage.js, suivi.js, horsdevis.js, documents.js, pdf.js, mails.js, equipes.js, filtres.js, compta.js, achats.js, facturx.js, efacture.js, chiffrage.js, consultations.js, automatisation.js, biblio.js, contacts.js, securite-ui.js, produits.js, dossier-documents.js, fluides-ui.js, rapprochement-ui.js, agenda-ui.js, hors-ligne.js, offres-pdf.js, comptoir.js, prix-achats.js, epreuves-ui.js, essais-ui.js : écrans métier
doe/               application DOE séparée (serveur, interface, génération du dossier PDF)
installer/         installateur Windows (NSIS) : build.sh, PipeFitCRM.nsi, lanceur et service
```

## Évolutions possibles

Import des temps depuis une badgeuse ou l'ERP
de production, pièces jointes (plans, photos), application mobile pour la saisie atelier.
