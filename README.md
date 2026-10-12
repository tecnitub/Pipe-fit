# Tuilerie CRM

CRM **multi-utilisateurs** pour une tuilerie industrielle (terre cuite) : clients, affaires, devis
avec bibliothèque de prix, facturation avec livraison, planning de charge, heures passées,
analyse de rentabilité et retour d'expérience (REX) par affaire et par chargé d'affaires.

Plusieurs personnes travaillent en même temps sur les mêmes données, depuis leur navigateur.

## Installation sur un serveur de l'entreprise

Prérequis : **Node.js 22.13 ou plus récent** (aucune autre dépendance, la base SQLite est intégrée à Node.js).

```bash
npm start                  # ou : ADMIN_PASSWORD=MonMotDePasse PORT=3000 npm start
```

Puis ouvrir `http://<adresse-du-serveur>:3000` depuis n'importe quel poste du réseau.

Au **premier démarrage** :
- la base `data/tuilerie.db` est créée avec des données de démonstration (`SEED_DEMO=0` pour démarrer vide) ;
- un compte `admin` est créé ; son mot de passe est affiché dans la console (ou fixé par `ADMIN_PASSWORD`).
  Changez-le dans **Paramètres**, puis créez les comptes des collaborateurs.

Avec Docker :

```bash
docker build -t tuilerie-crm .
docker run -d -p 3000:3000 -v tuilerie-data:/data -e ADMIN_PASSWORD=MonMotDePasse tuilerie-crm
```

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port d'écoute |
| `HOST` | `0.0.0.0` | Interface d'écoute |
| `DB_FILE` | `data/tuilerie.db` | Fichier de base de données |
| `ADMIN_PASSWORD` | aléatoire | Mot de passe du compte `admin` créé au premier démarrage |
| `SEED_DEMO` | `1` | `0` = base vide au premier démarrage |

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
| **Bibliothèque de prix** | Articles (tuiles, faîtières, rives, sur‑mesure, prestations) : prix de vente, coût matière/énergie, heures de fabrication/unité, poids/unité. Révision tarifaire en % par famille, export CSV. |
| **Livraison** | Zones : forfait + prix à la tonne (facturé) et coût transporteur (réel). Poids du devis calculé depuis la bibliothèque. |
| **Devis** | Lignes depuis la bibliothèque, remises ligne et globale, livraison auto ou forcée, TVA, impression/PDF, duplication. Analyse interne : coût matière, heures estimées, coût transport, marge prévisionnelle. |
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
```

## Évolutions possibles

Export comptable (FEC), envoi des devis par e-mail, import des temps depuis une badgeuse ou l'ERP
de production, pièces jointes (plans, photos), application mobile pour la saisie atelier.
