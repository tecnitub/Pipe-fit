# Mode d'emploi d'installation Pipe-Fit

Ce guide met en service, pas à pas, tout l'ensemble Pipe-Fit pour l'entreprise : le serveur (CRM et application DOE),
l'appli des compagnons sur téléphone, les e-mails Microsoft 365 (devis, factures, commandes, demandes de prix, boîtes
des factures et des offres), le répertoire réseau des documents et des pièces jointes, et les sauvegardes.

Comptez une demi-journée avec le prestataire informatique. Chaque étape se termine par une vérification ✅.

## 0. Avant de commencer

### Ce qu'il faut réunir

| Élément | Exemple | Qui |
|---|---|---|
| Un serveur allumé en permanence | PC ou serveur Windows 10/11/Server 2019+ 64 bits, ou Linux (Debian 12, Ubuntu 22.04+), 8 Go de RAM, 100 Go libres, onduleur | Informatique |
| Un nom de domaine et un nom pour le CRM | `crm.tecnitub.fr` (et `doe.tecnitub.fr`) | Gérant / registrar |
| L'accès à la box ou au pare-feu | redirection des ports 80 et 443 vers le serveur | Informatique |
| Un compte administrateur Microsoft 365 | administrateur global du locataire | Informatique |
| Un NAS ou un second disque | `\\NAS\PipeFit` pour les documents et les sauvegardes | Informatique |
| La liste des utilisateurs | nom, rôle, adresse e-mail, téléphone des compagnons | Gérant |

### Le pack de déploiement

Le pack `PipeFit-Pack-x.y.z.zip` contient :

```
PipeFitCRM-Setup-x.y.z.exe       installateur Windows (CRM + DOE + Node.js, démarrage automatique)
deploy/windows/                   configurer-serveur.ps1 : dossiers, partage réseau, HTTPS, compte de service
deploy/microsoft365/              configurer-microsoft365.ps1 : application Entra ID, boîtes partagées, stratégie d'accès
deploy/linux/                     installer.sh, services systemd, réglages, exemple Caddy (HTTPS)
deploy/docker/                    docker-compose.yml (CRM + DOE + Caddy), Caddyfile, .env.exemple
docs/                             ce guide (Markdown et page HTML)
server/  public/  doe/            l'application (installations Linux et Docker)
```

Il se télécharge dans l'onglet **Actions** du dépôt GitHub (dernière exécution « Installateur Windows » →
*Artifacts* → `PipeFit-Pack`), ou se construit avec `bash deploy/pack.sh`.

### Choisir l'installation

- **Windows** (le plus simple) : un PC ou serveur Windows du bureau. Section 1A.
- **Linux** : serveur ou machine virtuelle Linux. Section 1B.
- **Docker** : hôte Docker existant (NAS Synology / QNAP compatible, VPS). Section 1C.

## 1A. Installer le serveur sous Windows

1. Copier le pack sur le serveur et le décompresser (ex. `C:\Installation\PipeFit`).
2. Double-cliquer sur **`PipeFitCRM-Setup-x.y.z.exe`**, accepter les droits administrateur, suivre l'assistant.
   L'installateur :
   - copie l'application dans `C:\Program Files\PipeFitCRM` (Node.js inclus, rien d'autre à installer) ;
   - crée deux tâches planifiées qui démarrent avec Windows, même sans session ouverte : **PipeFitCRM** (port 3000)
     et **PipeFitDOE** (port 3100) ;
   - ouvre le pare-feu Windows sur ces ports (réseaux Domaine et Privé) ;
   - place les icônes « Pipe-Fit CRM » (bureau) et « Pipe-Fit DOE » (menu Démarrer).
3. Le navigateur s'ouvre sur `http://localhost:3000` : **créer le compte administrateur** et choisir **base vide**
   (les données de démonstration servent seulement à essayer).
4. Ouvrir une console **PowerShell en administrateur** dans le dossier du pack et lancer :

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\deploy\windows\configurer-serveur.ps1
   ```

   Le script pose les questions une par une (valeur proposée entre crochets, Entrée pour l'accepter) :
   - **Dossier des documents** : ex. `D:\PipeFit\Documents` ou `\\NAS\PipeFit\Documents` ;
   - **Dossier des pièces jointes** : par défaut `…\Documents\Pièces jointes` ;
   - **Dossier des sauvegardes** : de préférence sur le NAS, ex. `\\NAS\PipeFit\Sauvegardes` ;
   - **Partage réseau** des documents pour le bureau (`\\SERVEUR\PipeFit`) et le groupe autorisé ;
   - **Certificat HTTPS** `.pfx` de l'entreprise (facultatif ici, voir section 2) ;
   - **Compte de service** : obligatoire dès qu'un dossier est sur un NAS (le compte SYSTEM ne peut pas y écrire).
     Créer avant un compte dédié (ex. `TECNITUB\svc-pipefit`) avec les droits d'écriture sur le partage du NAS.

   Les réglages sont écrits dans `C:\ProgramData\PipeFitCRM\config.cmd` et Pipe-Fit redémarre.

✅ Depuis un autre poste du bureau, `http://NOM-DU-SERVEUR:3000` affiche l'écran de connexion. Dans
**Paramètres**, les cartes « Répertoire des documents » et « Pièces jointes et sauvegardes sur le réseau » montrent les
bons chemins, sans message rouge.

**Données sous Windows** : `C:\ProgramData\PipeFitCRM\data` (base `pipefit.db`, base DOE `doe\doe.db`, certificat
`tls\`). Journaux : `C:\ProgramData\PipeFitCRM\logs\serveur.log` et `doe.log`.

## 1B. Installer le serveur sous Linux

1. Copier le pack sur le serveur, le décompresser, puis :

   ```bash
   cd PipeFit-Pack-x.y.z
   sudo bash deploy/linux/installer.sh --domaine crm.tecnitub.fr --domaine-doe doe.tecnitub.fr
   ```

   Le script installe Node.js 22 si besoin (binaire officiel vérifié), crée le compte système `pipefit`, copie
   l'application dans `/opt/pipefit`, crée `/etc/pipefit/pipefit.env`, démarre les services **pipefit** et
   **pipefit-doe**, et avec `--domaine` installe **Caddy** qui obtient le certificat HTTPS tout seul.
2. Relire `/etc/pipefit/pipefit.env` (dossiers des documents, pièces jointes, sauvegardes), puis
   `sudo systemctl restart pipefit pipefit-doe`.
3. **NAS** : le monter avant, par exemple dans `/etc/fstab` :

   ```
   //NAS/PipeFit  /mnt/nas/pipefit  cifs  credentials=/etc/pipefit/nas.cred,uid=pipefit,gid=pipefit,iocharset=utf8,_netdev  0  0
   ```

   puis indiquer `/mnt/nas/pipefit/…` dans `pipefit.env`.
4. **Compte administrateur** : la page de première configuration ne s'ouvre que depuis le serveur lui-même. Sur un
   serveur sans écran, mettre `ADMIN_PASSWORD=…` dans `pipefit.env`, redémarrer, se connecter avec `admin`, changer
   le mot de passe (Paramètres), puis retirer la ligne.

✅ `systemctl status pipefit pipefit-doe` affiche *active (running)* ; `https://crm.tecnitub.fr` répond.
Journal : `journalctl -u pipefit -f`. **Mise à jour** : relancer `installer.sh` depuis un pack plus récent
(la base est copiée avant, les réglages sont conservés).

## 1C. Installer avec Docker

```bash
cd PipeFit-Pack-x.y.z/deploy/docker
cp .env.exemple .env      # domaine, dossiers de l'hôte, mot de passe admin
docker compose up -d --build
```

Trois conteneurs : **pipefit** (CRM), **doe** (même image) et **caddy** (HTTPS automatique). Les données sont dans
le volume `pipefit-data` ; documents et sauvegardes dans les dossiers de l'hôte indiqués dans `.env`.

✅ `docker compose ps` montre trois services *running* ; `https://crm.votre-domaine.fr` répond. Se connecter avec
`admin` et le mot de passe de `.env`, puis le changer.

## 2. HTTPS et accès depuis l'extérieur

Le HTTPS est **obligatoire** pour l'appli des compagnons (installation sur l'écran d'accueil, photos, notifications)
et pour tout accès hors du bureau. Trois façons, de la plus simple à la plus manuelle :

1. **Caddy** (Linux `--domaine`, Docker) : certificat Let's Encrypt obtenu et renouvelé automatiquement.
2. **Certificat de l'entreprise dans Pipe-Fit** (Windows) : `configurer-serveur.ps1` copie le `.pfx` dans
   `data\tls` et passe Pipe-Fit sur le port 443 (le port 80 renvoie vers HTTPS). Un certificat renouvelé est rechargé
   sans redémarrer.
3. **Reverse proxy existant** (IIS, Nginx, pare-feu) : le faire pointer vers `http://serveur:3000` et `:3100`, avec
   `X-Forwarded-Proto` ; `TRUST_PROXY=1` s'il est sur une autre machine.

Côté réseau :

- **DNS** : enregistrement `A` de `crm.tecnitub.fr` (et `doe.tecnitub.fr`) vers l'adresse IP publique du bureau.
- **Box / pare-feu** : rediriger les ports **443** (et **80** pour Let's Encrypt) vers le serveur. Ne jamais
  exposer le port 3000 en HTTP simple sur Internet.
- **Au bureau** : si la box ne gère pas le « NAT loopback », ajouter `crm.tecnitub.fr` dans le DNS interne
  (ou le serveur DHCP) vers l'adresse locale du serveur.
- **Sans ouverture de ports** : VPN de l'entreprise sur les téléphones, ou tunnel (Cloudflare Tunnel, Tailscale).

✅ **Paramètres → Sécurité** : certificat valide, échéance affichée, HTTPS actif. Depuis un téléphone en 4G,
`https://crm.tecnitub.fr` s'ouvre avec le cadenas.

**Lien CRM ↔ DOE** : Paramètres → Société → « Adresse de l'application DOE » = `https://doe.tecnitub.fr` (vide :
même serveur, port 3100).

## 3. Comptes et premiers réglages

1. **Paramètres → Société** : raison sociale, SIRET, TVA, adresse, logo, couleurs, mentions des devis et factures,
   e-mail et téléphone de l'en-tête.
2. **Paramètres → Comptes** : un compte par personne.

   | Rôle | Pour qui |
   |---|---|
   | Administrateur | gérant, responsable informatique |
   | Chargé d'affaires | bureau : devis, achats, facturation, planning |
   | Opérateur | compagnons : pointages, rapports, photos, frais (appli téléphone) |

   Renseigner pour chacun son **adresse Microsoft 365** (expéditeur de ses e-mails) et, pour les compagnons, la
   **personne du planning** reliée au compte.
3. Mots de passe : 10 caractères au moins ; chacun le change dans Paramètres → Mon compte.

✅ Chaque utilisateur se connecte depuis son poste ; un compagnon ne voit que ses chantiers et ses saisies.

## 4. Appli des compagnons (téléphone)

C'est la même application que le bureau, installée comme une appli sur l'écran d'accueil : aucune boutique
d'applications, aucune mise à jour à faire sur les téléphones.

### Installer sur chaque téléphone

- **Android** : ouvrir `https://crm.tecnitub.fr` dans **Chrome**, se connecter, menu ⋮ → **Installer l'application**.
- **iPhone** (iOS 16.4 ou plus) : ouvrir l'adresse dans **Safari**, se connecter, bouton Partager →
  **Sur l'écran d'accueil**, puis ouvrir Pipe-Fit depuis la nouvelle icône.
- Accepter les **notifications** au premier lancement (planning modifié, documents transmis, réserves).
- Paramètres → bouton **Appli téléphone** rappelle ces étapes.

### Ce que fait le compagnon

Pointage des heures, rapports d'intervention avec photos et signature du client, matériel demandé (repris dans les
demandes de prix), notes de frais avec justificatif, fiches fluides, réserves, prises de cotes, plans et fiches
techniques du chantier. **Sans réseau**, tout est gardé sur le téléphone et envoyé au retour du réseau (bandeau
« Hors ligne · n saisie(s) en attente »).

### Réseau nécessaire

Le serveur doit pouvoir joindre en HTTPS `fcm.googleapis.com` (Android), `web.push.apple.com` (iPhone) et
`updates.push.services.mozilla.com` pour les notifications. **Mon planning dans mon agenda** (Paramètres) ajoute le
planning personnel à l'agenda du téléphone.

✅ Un compagnon test installe l'appli, pointe une heure en mode avion, réactive le réseau : le pointage arrive au
bureau. Une modification de son planning lui envoie une notification.

## 5. E-mails Microsoft 365

### 5.1 Préparer Microsoft 365 (une fois)

**Avec le script** (administrateur global, PowerShell) :

```powershell
Install-Module Microsoft.Graph.Applications, Microsoft.Graph.Authentication, ExchangeOnlineManagement -Scope CurrentUser
.\deploy\microsoft365\configurer-microsoft365.ps1 -Domaine tecnitub.fr -Utilisateurs claire@tecnitub.fr, paul@tecnitub.fr
```

Il crée l'application **Pipe-Fit CRM** dans Entra ID avec les autorisations **Mail.Send**, **Mail.ReadWrite**,
**Calendars.ReadWrite** (consentement accordé), un secret valable 24 mois, les boîtes partagées **offres@,
factures@, commercial@, comptabilite@, achats@** (visibles dans Outlook des utilisateurs indiqués), et limite
l'application aux boîtes du groupe **Pipe-Fit CRM** (stratégie d'accès d'application). Il affiche à la fin les trois
valeurs à saisir dans Pipe-Fit.

**À la main** (portail Azure) : Microsoft Entra ID → Inscriptions d'applications → Nouvelle inscription « Pipe-Fit
CRM » → Autorisations d'API → Microsoft Graph → *Autorisations d'application* : Mail.Send, Mail.ReadWrite,
Calendars.ReadWrite → **Accorder un consentement d'administrateur** → Certificats et secrets → Nouveau secret.
Créer les boîtes partagées dans le centre d'administration Exchange.

### 5.2 Connecter Pipe-Fit

**Paramètres → E-mails et Microsoft 365 → Connexion Microsoft 365** : ID de l'annuaire, ID d'application, secret,
cocher « Activer », **Tester** (un e-mail arrive dans votre boîte).

### 5.3 Adresses d'envoi par type de document

Même écran, carte **Adresses d'envoi par type de document**. Expéditeur vide = boîte de l'utilisateur qui envoie.

| Documents | Expéditeur conseillé | Répondre à | Copie cachée d'archive |
|---|---|---|---|
| Devis | `commercial@` ou vide (chargé d'affaires) | vide | facultatif |
| Factures, situations, avoirs, relances | `comptabilite@` | `comptabilite@` | facultatif |
| Commandes fournisseurs | `achats@` | `achats@` | facultatif |
| Demandes de prix (consultations) | `achats@` | vide = **boîte des offres** | facultatif |
| Attachements, bons d'intervention, PV | vide | vide | facultatif |

Avec une boîte partagée, le message s'enregistre dans **ses Éléments envoyés** : toute l'équipe qui a accès à la boîte
le retrouve dans Outlook (envois synchronisés). Cocher « Copie cachée à l'utilisateur » pour qu'il en garde aussi une
copie. Chaque envoi est aussi tracé dans l'historique du document dans Pipe-Fit.

### 5.4 Boîtes de réception : factures et offres des fournisseurs

**Achats → Factures reçues → Configuration** :

- **Boîte des factures** `factures@` : relevée toutes les 2 minutes ; chaque PDF ou XML joint devient une facture à
  traiter (lue, rapprochée de la commande), l'e-mail est rangé dans « Factures traitées ».
- **Boîte des offres** `offres@` : les fournisseurs y répondent directement (adresse de réponse des demandes de prix)
  et l'équipe y **transfère** les offres reçues ailleurs. La consultation est reconnue par son **n° CS-…** dans
  l'objet, sinon par le **code chantier** ; l'offre se range chez le bon fournisseur, « à lire ».

Communiquer `factures@tecnitub.fr` aux fournisseurs (en-tête des commandes, courrier).

### 5.5 Planning dans Outlook

**Paramètres → Planning dans Outlook (Microsoft 365)** : activer, chaque journée planifiée apparaît dans le
calendrier Outlook de la personne.

✅ Envoyer un devis test (depuis la boîte prévue), une commande test (depuis `achats@`), transférer un e-mail
d'offre à `offres@` avec le n° de consultation dans l'objet : il apparaît dans la consultation sous 2 minutes.

### 5.6 Assistant (IA)

L'assistant prépare le travail à partir d'une demande écrite ou dictée (« commande chez Téréva pour Rumilly : 20 coudes
3D inox DN50, livraison jeudi »). Il retrouve le chantier, le fournisseur, les articles et les derniers prix, puis crée la
commande ou la demande de prix **en brouillon** : rien ne part sans validation.

1. Créer un compte sur la console Anthropic (console.anthropic.com), ajouter un moyen de paiement et créer une **clé API**.
2. **Paramètres → Assistant** : coller la clé, choisir le modèle (Claude Opus 5.5 recommandé), cocher « Activer ».
   Variante : variable d'environnement `ANTHROPIC_API_KEY` sur le serveur.
3. **Compagnons** : cocher « Ouvrir l'assistant aux compagnons » puis les actions permises (demande de matériel au bureau,
   planning, infos du chantier, signalement, recherche d'articles). Une demande de matériel arrive au chargé d'affaires
   du chantier, qui choisit le fournisseur, valide et envoie.
4. Le serveur doit joindre `api.anthropic.com` en HTTPS. Chaque demande est facturée par Anthropic (selon le modèle et
   la longueur de l'échange) ; les éléments utiles à la demande (chantier, articles, prix) sont transmis au service.

✅ Bouton ✨ en bas à droite : « Commande chez … pour … : 10 … » prépare un brouillon ; « Valider et envoyer » ouvre l'envoi
habituel. Un compagnon test obtient son planning et transmet une demande de matériel.

## 6. Répertoire réseau : documents et pièces jointes

Pipe-Fit écrit tout dans une arborescence lisible depuis l'explorateur Windows :

```
\\SERVEUR\PipeFit\                                (ou \\NAS\PipeFit\Documents)
├── Chantiers\                                    synchronisé dans les DEUX sens avec l'appli
│   └── CH-2026-001 - Ligne NEP inox – Usine de Rumilly\
│       ├── Plan\  Fiche technique\  Notice\  Sécurité - PPSPS\  PGC\  Plan de prévention\  Photo\  Demande client\  Autre\
│       └── _Indices précédents\
├── _Corbeille\
└── Pièces jointes\                               copie de sécurité en SENS UNIQUE (appli → réseau)
    ├── Chantiers\CH-2026-001 - Ligne NEP inox – Usine de Rumilly\
    │   ├── Offres fournisseurs\      CS-2026-0007 - Offre Téréva 4471.pdf
    │   ├── Commandes fournisseurs\   CF-2026-0012 - Offre du fournisseur.pdf
    │   ├── Factures fournisseurs\    F-778 - Pièce jointe.pdf
    │   ├── Rapports d'intervention\  RI-2026-0002 - Photo 1.jpg
    │   ├── Prise de cotes\  Réserves\  Notes de frais\  PV et essais\  Fluides\  Achats comptoir\
    ├── Hors chantier\<rubrique>\<année>\
    ├── Entreprises\<nom>\            plans de prévention…
    └── Bibliothèque\FDS\             fiches de données de sécurité
```

- **Chantiers** : un plan déposé dans l'appli apparaît dans le dossier du chantier ; un fichier copié dans le dossier
  apparaît dans l'appli (et chez les compagnons, si l'option est cochée). Un fichier remplacé devient un nouvel indice.
- **Pièces jointes** : toutes les pièces jointes des enregistrements (offres, factures fournisseurs, commandes,
  photos, prises de cotes, justificatifs…) y sont recopiées toutes les 2 minutes. Rien n'y est effacé ni relu ; une
  copie effacée à la main est réécrite dans l'heure. Ne pas y ranger d'autres fichiers.

Réglages : **Paramètres → Répertoire des documents sur le serveur** et **Pièces jointes et sauvegardes sur le
réseau** (ou variables `DOCUMENTS_DIR`, `PJ_DIR`). Droits : le compte qui fait tourner Pipe-Fit en écriture ; le
groupe du bureau en modification sur `Chantiers`, en **lecture seule** sur `Pièces jointes`.

✅ Déposer un plan dans un chantier : il apparaît dans `Chantiers\…\Plan`. Joindre une offre à une consultation :
elle apparaît dans `Pièces jointes\Chantiers\…\Offres fournisseurs` (bouton « 📎 Recopier les pièces jointes » pour
ne pas attendre).

## 7. Sauvegardes

Trois niveaux, à mettre en place tous les trois :

1. **Sauvegarde quotidienne de la base** (automatique, intégrée) : **Paramètres → Pièces jointes et sauvegardes sur
   le réseau**. Chaque jour à l'heure choisie (21 h par défaut), copie complète et vérifiée de la base (données,
   comptes, pièces jointes, réglages) et de la base DOE, dans le dossier choisi (`BACKUP_DIR`), gardée 30 jours.
   Bouton « 💾 Sauvegarder maintenant ».
2. **Copie hors site** : le NAS réplique le dossier des sauvegardes vers un cloud ou un second NAS (Synology Hyper
   Backup, QNAP HBS, ou une copie hebdomadaire sur disque externe emporté).
3. **Export lisible** : Paramètres → Exporter (JSON), une fois par mois, archivé.

**Restaurer** :

1. Arrêter Pipe-Fit (Windows : Gestionnaire des tâches → Services / `Stop-ScheduledTask PipeFitCRM, PipeFitDOE` ;
   Linux : `sudo systemctl stop pipefit pipefit-doe` ; Docker : `docker compose stop`).
2. Copier la sauvegarde voulue à la place de `pipefit.db` (et `doe-….db` à la place de `doe\doe.db`).
3. Redémarrer.

✅ Une fois par trimestre : restaurer la dernière sauvegarde sur un poste de test (installation Windows à part) et
ouvrir quelques devis et factures.

## 8. Recette : la liste de mise en service

- [ ] Le CRM s'ouvre depuis tous les postes du bureau et en 4G sur `https://…` (cadenas valide)
- [ ] L'application DOE s'ouvre et retrouve un chantier du CRM
- [ ] Comptes créés pour tout le monde, adresses Microsoft 365 renseignées
- [ ] Un compagnon a installé l'appli, pointé hors ligne, reçu une notification
- [ ] Test Microsoft 365 réussi ; devis, facture, commande envoyés depuis les bonnes boîtes ; copies dans Outlook
- [ ] Une facture fournisseur envoyée à `factures@` arrive dans Factures reçues
- [ ] Une offre transférée à `offres@` se range dans sa consultation
- [ ] Le planning apparaît dans Outlook et dans l'agenda du téléphone
- [ ] L'assistant prépare une commande en brouillon ; un compagnon transmet une demande de matériel
- [ ] Un plan déposé dans l'appli apparaît dans le partage réseau, et inversement
- [ ] Les pièces jointes sont recopiées dans `Pièces jointes`
- [ ] Une sauvegarde a été faite et restaurée sur un poste de test
- [ ] La copie hors site des sauvegardes est en place

## 9. Mises à jour et dépannage

**Mettre à jour** : Windows, relancer un `PipeFitCRM-Setup` plus récent ; Linux, `installer.sh` d'un pack plus
récent ; Docker, `docker compose up -d --build`. Les données et les réglages sont conservés.

| Symptôme | À vérifier |
|---|---|
| Les postes n'accèdent pas au serveur | réseau Windows en « Privé », pare-feu « Pipe-Fit CRM », nom du serveur |
| Le téléphone refuse d'installer l'appli | adresse en `https://` avec un certificat reconnu (pas auto-signé) |
| Pas de notifications | serveur → Internet en HTTPS, notifications autorisées sur le téléphone |
| « Envoi refusé par Microsoft 365 » | autorisation Mail.Send accordée, boîte dans le groupe Pipe-Fit CRM (attendre 1 h) |
| « Boîte aux lettres introuvable » | adresse de la boîte partagée exacte, licence ou boîte partagée créée |
| Répertoire « inaccessible » | NAS monté, compte de service avec droits d'écriture, chemin complet |
| Sauvegarde « impossible » | même chose pour le dossier des sauvegardes ; place disponible |
| « Clé API Anthropic refusée » | clé recopiée en entier, compte Anthropic approvisionné, Paramètres → Assistant |
| Le secret Microsoft 365 a expiré | relancer `configurer-microsoft365.ps1` (nouveau secret), le saisir dans Paramètres |

Journaux : Windows `C:\ProgramData\PipeFitCRM\logs\` ; Linux `journalctl -u pipefit` ; Docker `docker compose logs`.
Les actions importantes (envois, sauvegardes, réglages) sont aussi dans l'**Historique des modifications** (Paramètres).

### Variables de réglage

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | port du CRM | 3000 |
| `DB_FILE` | base du CRM | `data/pipefit.db` |
| `DOCUMENTS_DIR` | répertoire des documents (synchronisé) | `<données>/Documents` |
| `PJ_DIR` | copie des pièces jointes | `<documents>/Pièces jointes` |
| `BACKUP_DIR` | sauvegardes quotidiennes | `<données>/Sauvegardes` |
| `TLS_DIR`, `TLS_PASSPHRASE` | certificat HTTPS intégré | `<données>/tls` |
| `HTTP_REDIRECT_PORT` | port HTTP renvoyé vers HTTPS | — |
| `TRUST_PROXY` | reverse proxy sur une autre machine | — |
| `ADMIN_PASSWORD` | crée le compte `admin` au premier démarrage | — |
| `SEED_DEMO` | `0` : base vide | `1` |
| `ANTHROPIC_API_KEY` | clé de l'assistant (sinon : Paramètres → Assistant) | — |
| `DOE_PORT`, `DOE_DB_FILE` | application DOE | 3100, `doe/data/doe.db` |
| `PIPEFIT_URL`, `PIPEFIT_PUBLIC_URL` | adresse du CRM vue par le DOE | `http://localhost:3000` |
