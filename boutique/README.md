# Boutique TECNITUB — tuyauterie inox préfabriquée

Site de vente en ligne aux professionnels : spools inox soudés en atelier, tubes coupés à longueur, coudes, tés,
réductions, brides, raccords hygiéniques et supports, en 304L et 316L.

## Démarrer

```bash
npm run start:boutique        # http://localhost:3200 — administration : http://localhost:3200/admin
BOUTIQUE_ADMIN_PASSWORD=MonMotDePasse BOUTIQUE_PORT=3200 npm run start:boutique
```

Sans `BOUTIQUE_ADMIN_PASSWORD`, un mot de passe d'administration est tiré au hasard au premier démarrage et affiché
une seule fois dans la console.

| Variable | Défaut | Rôle |
|---|---|---|
| `BOUTIQUE_PORT` | `3200` | Port d'écoute |
| `BOUTIQUE_DB_FILE` | `boutique/data/boutique.db` | Base SQLite (commandes, devis, plans joints) |
| `BOUTIQUE_ADMIN_PASSWORD` | — | Mot de passe de l'administration |
| `TLS_DIR`, `TLS_CERT`/`TLS_KEY`, `TLS_PFX` | — | HTTPS, comme pour Pipe-Fit |

## Pages

- **Accueil** : présentation, familles de produits, déroulé d'une commande, secteurs.
- **Catalogue** et **fiches produits** : choix de la série (ISO 1127 industrie / DIN 11850 agroalimentaire), du diamètre,
  de l'épaisseur, de la nuance et de l'état de surface (décapé-passivé, poli, électropoli) ; prix calculé en direct,
  remises par quantité (−5 % dès 10 pièces, −8 % dès 20, −12 % dès 50).
- **Spool sur mesure** : tracé tronçon par tronçon (6 directions, cotes entre axes), extrémités (chanfrein, collerette +
  bride tournante, bride plate, clamp, DIN 11851), vue isométrique cotée en direct et prix détaillé (tube net des coudes,
  coudes 3D, soudures orbitales, extrémités, décapage).
- **Collecteur sur mesure** : corps droit et 1 à 5 piquages perpendiculaires (diamètre au plus celui du corps, orientation
  dessus / dessous / arrière / avant, position de l'axe depuis l'extrémité A, hauteur, raccordement), extrémités du corps
  avec fond bombé possible ; vue isométrique cotée et prix détaillé (corps, tube des piquages, perçage et soudure des
  piquages, raccordements). Modèles : de 1 à 5 piquages en un clic sur le corps choisi, nourrice chaufferie 4 départs +
  vidange, collecteur air comprimé 3 descentes, collecteur NEP 5 vannes (DIN, poli), manchette d'instrumentation,
  collecteur eau glacée 2 départs. Contrôles : écartement entre piquages, distance aux extrémités, hauteur minimale.
- **Options qualité** : certificats 3.1, épreuve hydraulique avec PV, radiographie, bouchonnage.
- **Panier** et **commande** : coordonnées de la société, livraison sur chantier, paiement par virement ou sur compte
  (30 jours fin de mois, SIRET obligatoire), franco de port à 800 € HT.
- **Devis sur plan** : envoi d'isométriques (PDF, DWG, DXF, STEP, IFC, PCF, images, XLSX, ZIP ; 15 Mo par fichier).
- **Suivi de commande** : numéro + e-mail, frise des étapes, numéro de suivi transporteur.
- **Administration** (`/admin`) : commandes (statut, suivi transporteur, note interne), demandes de devis et plans joints.

## Prix

Tout le calcul est dans `catalogue.js`, partagé par le navigateur (affichage) et le serveur (qui recalcule chaque
commande : un prix envoyé par le navigateur n'est jamais repris). Les tarifs se règlent en tête du fichier :
prix matière au kg par nuance (`NUANCES`), coefficients des finitions (`FINITIONS`), prix des options (`OPTIONS`),
prix de base des raccords (`PRODUITS[].base`, donnés pour un DN50), franco et frais de port (`FRANCO`, `PORT`).
Les valeurs livrées sont indicatives : à ajuster sur vos prix d'achat et vos temps de fabrication.

## Mise en ligne

Pour un site public, placer le serveur derrière un reverse proxy HTTPS (Caddy, Nginx) avec `TRUST_PROXY=1`, et
sauvegarder régulièrement le fichier de base. Non inclus pour l'instant : paiement par carte, envoi automatique des
e-mails d'accusé de réception, comptes clients avec tarifs négociés.
