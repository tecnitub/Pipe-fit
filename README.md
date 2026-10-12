# Tuilerie CRM

Prototype de CRM pour une tuilerie industrielle (terre cuite) : clients, affaires, devis,
facturation avec livraison, planning de charge, heures passées, analyse de rentabilité et REX.

## Lancer

Aucune installation : ouvrir `index.html` dans un navigateur (Chrome, Edge, Firefox).
Les données de démonstration sont chargées au premier lancement et stockées dans le navigateur
(`localStorage`). Sauvegarde / restauration : **Paramètres → Exporter / Importer (JSON)**.

## Fonctionnalités

| Module | Contenu |
|---|---|
| **Bibliothèque de prix** | Articles (tuiles, faîtières, rives, sur‑mesure, prestations) avec prix de vente, coût matière/énergie, heures de fabrication/unité, poids/unité. Révision tarifaire en % par famille, export CSV. |
| **Livraison** | Zones tarifaires : forfait + prix à la tonne (facturé) et coût transporteur (réel). Le poids du devis est calculé automatiquement depuis la bibliothèque. |
| **Devis** | Ajout de lignes depuis la bibliothèque, remises ligne et globale, livraison auto ou forcée, TVA, impression/PDF. Analyse interne : coût matière, heures estimées, coût transport, marge prévisionnelle. Duplication. |
| **Factures** | Générées depuis un devis accepté (livraison reprise), échéance, suivi payé / en retard, impression. |
| **Planning** | Charge hebdomadaire par ressource (chargés d'affaires, ateliers pressage / four / émaillage) vs capacité, avec heures réellement saisies. Par affaire : budget, planifié, passé, reste à faire, reste à planifier. |
| **Heures passées** | Saisie des temps par date / ressource / affaire / tâche, filtres. |
| **Analyse & REX** | Rentabilité par affaire (CA − matière − MO réelle − transport) et marge prévue vs réelle. Synthèse **par chargé d'affaires** : CA, marge, taux de transformation des devis, écart d'heures, note REX moyenne. Fiche REX par affaire (positif / négatif / actions). Export CSV. |

## Règles de calcul

- **Livraison facturée** = forfait de zone + prix/t × poids total (kg/1000), sauf montant forcé.
- **Marge prévisionnelle** (devis) = total HT − coût matière − heures estimées × taux horaire standard − coût transport.
- **Marge réelle** (affaire) = CA facturé (ou devis acceptés si pas encore facturé) − coût matière − Σ(heures saisies × taux horaire de la ressource) − coût transport.
- **Écart d'heures** = (heures passées − heures budgétées) / heures budgétées.

## Structure

```
index.html
css/style.css
js/store.js   persistance + données de démo
js/calc.js    calculs (devis, livraison, rentabilité affaire / chargé)
js/ui.js      formats, modales, formulaires
js/views.js   écrans
js/app.js     routeur
```

## Limites du prototype / évolutions

Mono-poste (données dans le navigateur). Pour un usage multi-utilisateurs : backend + base
de données (ex. PostgreSQL), authentification et droits par rôle, numérotation légale des
factures non modifiable, export comptable (FEC), envoi des devis par e-mail, import des
temps depuis la badgeuse / l'ERP de production.
