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

## Fonctionnalités métier

| Module | Contenu |
|---|---|
| **Contacts** | Entreprises classées client / fournisseur (SIRET, TVA, téléphone, e-mail) avec plusieurs sites/adresses (siège de facturation, usines, sites d'intervention) ; personnes rattachées à une entreprise et à un site (chargé de travaux, acheteur…). |
| **Bibliothèque de prix** | Articles (tubes, raccords, robinetterie, supportage, heures de soudure et de montage, contrôles, prestations) : prix de vente, coût matière, heures de fabrication/unité, poids/unité. Révision tarifaire en % par famille, export CSV. |
| **Livraison** | Zones : forfait + prix à la tonne (facturé) et coût transporteur (réel). Poids du devis calculé depuis la bibliothèque. |
| **Devis** | Choix du client, du contact (chargé de travaux) et du site d'intervention, repris sur le devis et la facture. Lignes depuis la bibliothèque, remises ligne et globale, livraison auto ou forcée, TVA, impression/PDF, duplication. Analyse interne : coût matière, heures estimées, coût transport, marge prévisionnelle. |
| **Factures** | Générées depuis un devis accepté (livraison reprise), échéance, suivi payé / en retard, impression. |
| **Planning** | Charge hebdomadaire par ressource vs capacité, heures réellement saisies ; par affaire : budget, planifié, passé, reste à faire, reste à planifier. |
| **Heures passées** | Saisie par date / ressource / affaire / tâche, filtres. |
| **Analyse & REX** | Rentabilité par affaire (CA − matière − MO réelle − transport), marge prévue vs réelle ; synthèse par chargé d'affaires (CA, marge, transformation des devis, écart d'heures, note REX) ; fiches REX ; export CSV. |

### Règles de calcul

- **Livraison facturée** = forfait de zone + prix/t × poids total, sauf montant forcé.
- **Marge prévisionnelle** (devis) = total HT − coût matière − heures estimées × taux horaire standard − coût transport.
- **Marge réelle** (affaire) = CA facturé (ou devis acceptés) − coût matière − Σ(heures saisies × taux de la ressource) − coût transport.
- **Écart d'heures** = (heures passées − heures budgétées) / heures budgétées.

## Structure

```
server/server.js   API REST, connexion, droits, temps réel (SSE), fichiers statiques
server/db.js       base SQLite, mots de passe (scrypt), numérotation
server/demo.js     données de démonstration
public/            interface web (HTML/CSS/JS sans framework)
test/              tests de l'API (npm test)
installer/         installateur Windows (NSIS) : build.sh, PipeFitCRM.nsi, lanceur et service
```

## Évolutions possibles

Export comptable (FEC), envoi des devis par e-mail, import des temps depuis une badgeuse ou l'ERP
de production, pièces jointes (plans, photos), application mobile pour la saisie atelier.
