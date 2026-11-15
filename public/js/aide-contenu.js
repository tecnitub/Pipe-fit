// Contenu de l'aide du CRM Pipe-Fit (moteur : aide.js) : une rubrique par écran principal, rédigée d'après les écrans
// réels, l'écran courant déduit de l'adresse (#/…), et les parcours de démarrage des profils conducteur de travaux /
// chargé d'affaires, compagnon et administrateur. Les parcours mémorisés « vus » sont aussi gardés dans les préférences
// du compte (PUT /api/me/preferences, comme les colonnes des tableaux) : retrouvés sur tous ses appareils.
const AideContenu = (() => {
  const R = [
    { id: 'accueil', titre: 'Tableau de bord', route: '#/dashboard', motsCles: 'accueil indicateurs carnet commandes chiffre affaires',
      but: 'Vue d\'ensemble de l\'activité : devis en attente, carnet de commandes (reste à facturer des chantiers en cours), chiffre d\'affaires facturé, heures pointées de la semaine, pointages à valider, échéances (habilitations, visites médicales, contrôles du parc) et chantiers en alerte.',
      actions: ['Filtrer tout le tableau de bord par client ou par chargé d\'affaires (barre de filtres en haut).',
        'Cliquer une carte (pointages à valider, échéances…) pour ouvrir l\'écran qui permet de traiter le point.',
        'Chargé d\'affaires : « Mon tableau de bord » ; administrateur : « Par chargé d\'affaires » et « Trésorerie ».',
        'Suivre les factures à relancer depuis le lien de la carte « CA facturé HT ».'],
      pieges: ['Les chantiers archivés sont exclus des indicateurs : un chantier archivé trop tôt disparaît du carnet de commandes.',
        'Les heures « à valider » ne partent pas en paie tant qu\'elles ne sont pas validées dans RH.'],
      liens: ['chantiers', 'planning', 'etapes', 'direction'] },
    { id: 'chantiers', titre: 'Chantiers', route: '#/chantiers', motsCles: 'liste affaires archiver hors devis intervention régie',
      but: 'Liste des chantiers. Un chantier est créé lorsqu\'un devis est accepté : le devis devient son budget (fournitures et main-d\'œuvre). Les interventions hors devis (régie, dépannage) y figurent aussi.',
      actions: ['« + Intervention hors devis » : intervention en régie ; « 📧 Depuis un mail » la crée à partir de l\'e-mail du client.',
        'Rechercher, filtrer par client, chargé d\'affaires ou statut ; « Archivés » pour retrouver les anciens chantiers.',
        'Cocher plusieurs chantiers pour les archiver d\'un coup ; « Archiver les chantiers clos » allège la liste.',
        '« 📊 Étapes des études » : avancement des études par phase et ce qui attend chaque personne.',
        'Cliquer une ligne pour ouvrir la fiche du chantier.'],
      pieges: ['On ne crée pas un chantier à la main : on fait accepter le devis (statut « Accepté »).',
        'Le filtre par défaut masque les chantiers clos : choisir « Tous (hors archivés) » pour les revoir.'],
      liens: ['fiche-chantier', 'etapes', 'devis'] },
    { id: 'fiche-chantier', titre: 'Fiche chantier', motsCles: 'pilotage budget marge heures rapports onglets documents réunions sécurité gantt doe études dérive avenant situation',
      but: 'Pilotage du chantier : montant du marché, heures prévues et pointées, marges prévue et à terminaison, budget du devis face au réel (fournitures, main-d\'œuvre, transport, frais), rapports d\'intervention, mises en service, contrat d\'entretien, réserves.',
      actions: ['Onglets : Vue d\'ensemble, 📎 Documents, 🗒️ Réunions, ⛑️ Sécurité, 📊 Gantt, Situations, 📘 DOE et 📐 Études (applications reliées).',
        '« + Commande fournisseur » et « + Consultation fournisseurs » : achats préremplis avec le chantier.',
        '« + Avenant » : devis prérempli rattaché au chantier une fois accepté ; « + Intervention » : régie sur le même site.',
        '« + Situation de travaux » quand un devis est accepté ; « Réserves et réception » pour le PV et les réserves.',
        'Bloc « Chantier en dérive » : alertes (budget dépassé, consommation en avance, marge en baisse).'],
      pieges: ['Une commande saisie hors du chantier ne compte pas dans le réel des fournitures : toujours choisir le chantier.',
        'La retenue de garantie se libère un an après la réception : penser à cliquer « Retenue libérée ».',
        'Sur téléphone, les actions secondaires sont repliées derrière « ⋯ Plus d\'actions ».'],
      liens: ['chantiers', 'achats', 'reserves', 'contrats', 'etapes', 'documents-chantier'] },
    { id: 'documents-chantier', titre: 'Documents, réunions, sécurité et Gantt du chantier', motsCles: 'plans fiches techniques compte rendu ppsps pgc planning phases',
      but: 'Onglets de la fiche chantier : documents (plans, fiches, avec ceux à transmettre aux compagnons), réunions et tâches, sécurité (PPSPS, plan de prévention) et planning Gantt des phases.',
      actions: ['Documents : déposer les fichiers et cocher ceux à transmettre aux compagnons (visibles sur leur téléphone).',
        'Réunions : comptes rendus et tâches à faire ; le compteur de l\'onglet indique les tâches ouvertes.',
        'Sécurité : l\'onglet affiche « à faire » tant qu\'aucun document « Sécurité / PPSPS » n\'est déposé.',
        'Gantt : phases du chantier, reprises dans le planning et le plan de charge.'],
      pieges: ['Un document non coché « à transmettre » ne part pas sur le téléphone des compagnons.'],
      liens: ['fiche-chantier', 'compagnon-chantiers'] },
    { id: 'achats', titre: 'Achats : consultations et commandes', route: '#/consultations', motsCles: 'consultation fournisseurs demande de prix offre comparatif mieux-disant commande bon livraison',
      but: 'Consulter plusieurs fournisseurs pour les mêmes fournitures puis commander. La demande de prix part avec un tableau Excel à compléter, les offres reviennent (saisie, import du tableau ou lecture du devis PDF), le comparatif désigne le mieux-disant global et ligne par ligne, puis les commandes sont créées en un clic.',
      actions: ['« + Nouvelle consultation » : fournitures, fournisseurs (« 🔍 Ajouter des fournisseurs… » ou ceux de la bibliothèque), puis « ✉ Envoyer ».',
        'Sur la ligne d\'un fournisseur : « Saisir l\'offre » ou « Lire l\'offre » (PDF, Excel) ; une offre reçue par e-mail peut être reprise.',
        'Comparatif : « Tout attribuer au mieux-disant » ou « Attribuer ligne par ligne au meilleur prix », puis « Créer les commandes ».',
        'Onglet Commandes : « + Nouvelle commande », filtres par chantier, fournisseur et statut ; « ✅ Valider et envoyer au fournisseur ».'],
      pieges: ['Une offre incomplète (lignes sans prix) n\'est pas retenue comme mieux-disant global : compléter ou attribuer ligne par ligne.',
        'Une commande sans chantier n\'est pas comptée dans le budget du chantier.'],
      liens: ['fiche-chantier', 'stock', 'devis'] },
    { id: 'stock', titre: 'Stock et QR codes', route: '#/stock', motsCles: 'qr étiquette scanner emplacement réassort rupture outillage inventaire',
      but: 'Articles gérés en stock (emplacement, quantité, minimum), étiquettes QR à coller sur les bacs et l\'outillage, réassort.',
      actions: ['« + Mettre des articles en stock » : emplacement et quantité minimale, puis « 🏷️ Étiquettes QR » pour imprimer les étiquettes.',
        '« 📷 Scanner » : lire l\'étiquette d\'un article ou d\'un outil (caméra ou photo de l\'étiquette).',
        'Filtrer « À réassortir » puis « 🛒 Demande de prix de réassort » : consultation préparée.',
        '« 🔧 Étiquettes de l\'outillage » et « 📒 Catalogue Tecnitub (PDF) ».'],
      pieges: ['Un article sans quantité minimale n\'apparaît jamais « à réassortir ».',
        'Sans accès à la caméra (navigateur, autorisation), utiliser « 🖼️ Photo de l\'étiquette » ou la recherche.'],
      liens: ['scan', 'achats'] },
    { id: 'scan', titre: 'Scanner : stock et outillage', route: '#/scan', motsCles: 'qr scanner étiquette caméra demande matériel',
      but: 'Lecture d\'une étiquette QR (article du stock ou outil) depuis le téléphone, recherche dans le catalogue, demande de matériel aux fournisseurs.',
      actions: ['« 📷 Scanner une étiquette » ou « 🖼️ Photo de l\'étiquette ».',
        'Pas d\'étiquette ? Rechercher (ex. : coude DN50, bride, poste TIG).',
        '« 🛒 Demande de matériel aux fournisseurs » : lignes envoyées au bureau ou aux fournisseurs selon les réglages.'],
      pieges: ['La caméra demande l\'autorisation du navigateur la première fois ; refusée, elle reste bloquée jusqu\'à un changement dans les réglages du téléphone.'],
      liens: ['stock', 'compagnon-heures'] },
    { id: 'planning', titre: 'Planning', route: '#/planning', motsCles: 'semaine équipe affectation charge gantt personne absence',
      but: 'Affectation des personnes aux chantiers : vue de la semaine par chantier, par personne, tableau jour par jour, charge par semaine, Gantt et plan de charge.',
      actions: ['Glisser un avatar d\'un chantier ou d\'un jour à l\'autre pour déplacer une affectation.',
        '« Copier la semaine précédente » pour repartir d\'une semaine type.',
        'Indicateurs : chantiers, journées planifiées, journées à pourvoir, absences ; anneaux d\'heures par personne.',
        'Les compagnons sont prévenus (cloche, téléphone) quand leur planning change.'],
      pieges: ['Une personne absente (congé, maladie) n\'apparaît pas dans les colonnes des chantiers du jour.',
        'Le planning prévisionnel n\'est pas un pointage : les heures réelles viennent du pointage des compagnons.'],
      liens: ['compagnon-planning', 'fiche-chantier', 'accueil'] },
    { id: 'etapes', titre: 'Étapes des études', route: '#/etapes', motsCles: 'avancement phases retard responsable échéance relance études bureau',
      but: 'Avancement des études par phase (étude, achats, chantier, mise en service, réception, DOE, exploitation), étapes en retard et ce qui attend chaque personne.',
      actions: ['Filtrer par responsable (dont « Non affectées »), par phase ou par chantier.',
        'Ouvrir le chantier depuis la ligne de son étude.'],
      pieges: ['Les responsables et échéances se fixent dans l\'application Études (guide « Reste à faire ») ; ici on les consulte.',
        'Les personnes sont relancées deux jours avant l\'échéance et quand elle est dépassée.'],
      liens: ['chantiers', 'fiche-chantier'] },
    { id: 'reserves', titre: 'Réserves et réception', motsCles: 'réserve pv réception levée photo compagnon okfacturation',
      but: 'Réception du chantier : réserves (localisation, responsable, date limite), affectation des réserves aux compagnons, PV de réception et PV de levée signés.',
      actions: ['Ajouter une réserve : localisation, responsable (Pipe-Fit ou autre lot), « À lever avant le ».',
        'Reprendre les réserves de conformité de l\'étude et des PV de mise en service, puis les affecter à un compagnon (il est notifié).',
        'Le compagnon lève la réserve sur son téléphone avec photo et commentaire, même hors connexion.',
        'Signer le PV de réception (décision autre que « Refusée ») : le chantier passe « Terminé » et « OK pour facturation » ; le PV de levée suit la levée des réserves.'],
      pieges: ['Tant que le PV de réception n\'est pas signé, le badge « Réception non signée » reste affiché et la date de réception (garanties, retenue) n\'est pas fixée.',
        'La levée faite sur le terrain remonte dans l\'étude et le DOE : ne pas la ressaisir.'],
      liens: ['fiche-chantier', 'contrats', 'compagnon-chantiers'] },
    { id: 'contrats', titre: 'Contrat d\'entretien', motsCles: 'maintenance visite entretien contrat facturation renouveler carnet doe',
      but: 'Après la réception : visites d\'entretien planifiées à partir du carnet de maintenance du DOE (ou des opérations usuelles des équipements du chantier), comptes rendus de visite et facturation périodique. Bloc « Contrat d\'entretien » de la fiche chantier.',
      actions: ['« 🔧 Créer le contrat d\'entretien » : début, durée, montant annuel, rythme de facturation.',
        '« ✓ Visite faite » sur la visite (bureau ou compagnon), puis « 🖨️ Compte rendu ».',
        '« 🧾 Facturer » sur une période échue ; « 🔁 Renouveler le contrat » deux mois avant la fin.'],
      pieges: ['Le carnet de maintenance du DOE doit être rempli (application DOE, section 7) pour être repris dans le contrat.'],
      liens: ['fiche-chantier', 'reserves'] },
    { id: 'devis', titre: 'Devis', route: '#/devis', motsCles: 'chiffrage offre client accepté avenant',
      but: 'Devis aux clients ; un devis accepté crée le chantier et devient son budget.',
      actions: ['Créer un devis, l\'envoyer, puis passer son statut à « Accepté » pour créer le chantier.',
        'Avenant : depuis la fiche chantier (« + Avenant »), il est rattaché au chantier une fois accepté.'],
      pieges: ['Le taux de transformation du tableau de bord compare les devis acceptés aux devis refusés : passer les devis perdus en « Refusé » (avec le motif).'],
      liens: ['chantiers', 'accueil'] },
    { id: 'direction', titre: 'Direction', route: '#/direction', motsCles: 'chiffre affaires marge carnet retard paiement',
      but: 'Synthèse de direction : chiffre d\'affaires du mois et de l\'année face à l\'année précédente, marge à terminaison des chantiers en cours, carnet, factures en retard, devis en attente. Réservé au bureau.',
      actions: ['Comparer le mois et l\'année en cours à la même période de l\'année précédente.', 'Ouvrir les factures en retard de paiement les plus importantes.'],
      pieges: ['Les montants viennent des factures numérotées : un brouillon n\'est pas compté.'],
      liens: ['accueil', 'fiche-chantier'] },
    { id: 'parametres', titre: 'Paramètres', route: '#/parametres', motsCles: 'compte mot de passe utilisateurs équipe rôle accès compagnon dérive numérotation administrateur',
      but: 'Mon compte (mot de passe, déconnexion des autres appareils), société, documents et e-mails, numérotation, affichage par accès, alertes de dérive, ce que voient les compagnons, comptes utilisateurs et équipe.',
      actions: ['« + Compte » : identifiant, rôle (administrateur, chargé d\'affaires, opérateur) et fiche de l\'équipe reliée.',
        '« + Personne » (Équipe) : coût horaire, capacité, chef d\'équipe ; relier chaque compte opérateur à sa fiche.',
        'Affichage par accès : écrans masqués pour les chargés d\'affaires ou les compagnons.',
        'Appli des compagnons : ce qu\'ils voient (client, matériel, quantités, commandes, documents, prix…).',
        'Alertes de dérive : seuils de prévenance des chargés d\'affaires.'],
      pieges: ['Un compte opérateur non relié à une fiche de l\'équipe ne peut pas pointer (« Votre compte n\'est relié à aucune fiche »).',
        'Les prix ne partent jamais sur le téléphone des compagnons sauf si l\'option « Prix et montants » est cochée.'],
      liens: ['compagnon-heures', 'accueil'] },
    { id: 'compagnon-heures', titre: 'Appli compagnon : mes heures', route: '#/pointage', motsCles: 'pointage commencer terminer journée panier collègue intérimaire téléphone hors connexion',
      but: 'Pointage du jour depuis le téléphone : chantier et tâche, « Commencer » et « Terminer » pour soi et les personnes avec soi, journée saisie d\'un coup, semaine en cours.',
      actions: ['Choisir le chantier (proposé d\'après le planning du jour) et la tâche, puis « Commencer » ; « Terminer » le soir (durée de la pause demandée).',
        '« + Collègue avec moi » / « + Intérimaire avec moi » : cocher les personnes pour pointer ensemble.',
        '« Saisir ma journée comme prévu » ou « 📝 Saisir ma journée » (plusieurs chantiers, journée différente du planning).',
        '« Changer de chantier » termine le pointage en cours et permet d\'en commencer un autre.',
        'Barre du bas : Heures, Chantiers, Planning, Stock ; « Menu » pour Rapports, Notes de frais, Comptoir, Calculs.'],
      pieges: ['Hors réseau, les saisies sont gardées sur le téléphone et partent au retour du réseau : ne pas se déconnecter avant.',
        'Rien de prévu aujourd\'hui ? Choisir l\'intervention hors devis ou en ouvrir une nouvelle.'],
      liens: ['compagnon-planning', 'compagnon-chantiers', 'compagnon-rapports', 'scan'] },
    { id: 'compagnon-planning', titre: 'Appli compagnon : mon planning', route: '#/pointage/planning', motsCles: 'planning semaine téléphone notification',
      but: 'Planning de la personne (et de son équipe pour un chef d\'équipe) : chantiers, tâches et horaires prévus.',
      actions: ['Parcourir les jours et semaines ; ouvrir le chantier prévu.', 'Notifications : être prévenu dès que le planning change (installer l\'appli téléphone).'],
      pieges: ['Les collègues affectés au même chantier ne sont visibles que si l\'administrateur l\'a autorisé.'],
      liens: ['compagnon-heures', 'planning'] },
    { id: 'compagnon-chantiers', titre: 'Appli compagnon : mes chantiers', route: '#/pointage/chantiers', motsCles: 'documents matériel réserves à lever étapes adresse site',
      but: 'Chantiers prévus pour la personne : adresse du site, documents transmis, matériel prévu et retenu, mes étapes, mes réserves à lever.',
      actions: ['Ouvrir un chantier : documents (badge « nouveau »), matériel à poser et sa validation, contact sur le site.',
        'Lever une réserve : photo et commentaire, même hors connexion.',
        'Marquer une étape de l\'étude faite sur le terrain (photo, commentaire) : elle remonte dans l\'étude.'],
      pieges: ['Les prix et montants ne sont pas affichés aux compagnons (réglage de l\'administrateur).'],
      liens: ['compagnon-heures', 'reserves'] },
    { id: 'compagnon-rapports', titre: 'Appli compagnon : rapports, frais, comptoir, calculs', route: '#/pointage/rapports', motsCles: 'rapport intervention photo signature client dictée note de frais ticket comptoir calculs',
      but: 'Rapport d\'intervention du jour (travaux, observations, besoins, matériel, photos, signature du client), notes de frais avec photo du ticket, enlèvements au comptoir, calculs de chantier.',
      actions: ['Rapport : « ↙ Reprendre ma journée » préremplit les travaux d\'après les tâches pointées ; 🎤 dicter le texte ou le matériel.',
        'Ajouter des photos (« 📷 Ajouter une photo ») et faire signer le client.',
        'Note de frais : photo du ticket, chantier, catégorie, invités.'],
      pieges: ['Le champ « Travaux réalisés » est obligatoire pour enregistrer le rapport.'],
      liens: ['compagnon-heures', 'fiche-chantier'] },
    { id: 'apps', titre: 'Applications Études et DOE', motsCles: 'études doe cadre application reliée bureau d\'études',
      but: 'Les notes de calcul (application Études) et le dossier des ouvrages exécutés (application DOE) s\'ouvrent depuis les onglets 📐 Études et 📘 DOE de la fiche chantier. Chacune a sa propre aide (bouton « ? Aide » de son en-tête).',
      actions: ['Ouvrir l\'onglet de la fiche chantier ; l\'étude ou le DOE du chantier s\'ouvre (ou se crée).'],
      pieges: ['Ces applications sont réservées au bureau (administrateur, chargé d\'affaires).'],
      liens: ['fiche-chantier', 'etapes'] },
    { id: 'general', titre: 'Pipe-Fit CRM : se repérer', motsCles: 'menu navigation recherche notifications raccourci',
      but: 'Le menu du haut (ou la barre du bas et « Menu » sur téléphone) mène aux écrans : tableau de bord, contacts, devis, chantiers, achats, situations, facturation, bibliothèque, planning, pointage, RH, parc, fluides, analyse, paramètres.',
      actions: ['🔍 Rechercher partout : Ctrl+K ou « / ».', '🔔 Notifications : planning modifié, relances, demandes.', '« ? Aide » (ou F1) : aide de l\'écran ouvert, recherche et parcours de démarrage.'],
      pieges: ['Si un collègue modifie les données pendant une saisie, un bandeau propose de rafraîchir : terminer la saisie avant.'],
      liens: ['accueil', 'chantiers'] },
  ];

  // Écran courant (adresse #/nom/paramètres ; mêmes alias que le routeur)
  const ALIAS = { affaires: 'chantiers', affaire: 'chantier', 'etudes-be': 'etudesBe', temps: 'rh' };
  function ecran(hash) {
    const [chemin] = String(hash || '').replace(/^#\/?/, '').split('?');
    let [nom, ...p] = chemin.split('/');
    nom = ALIAS[nom] || nom;
    const atelier = typeof Store !== 'undefined' && Store.me && Store.me.role === 'atelier';
    if (!nom) return atelier ? 'compagnon-heures' : 'accueil';
    if (nom === 'pointage') return { planning: 'compagnon-planning', chantiers: 'compagnon-chantiers', chantier: 'compagnon-chantiers', rapports: 'compagnon-rapports', frais: 'compagnon-rapports', comptoir: 'compagnon-rapports', calculs: 'compagnon-rapports' }[p[0]] || 'compagnon-heures';
    if (nom === 'planning') return atelier ? 'compagnon-planning' : 'planning';
    if (nom === 'chantier') return ['documents', 'reunions', 'securite', 'gantt'].includes(p[1]) ? 'documents-chantier' : 'fiche-chantier';
    return { dashboard: 'accueil', charges: 'accueil', chantiers: 'chantiers', consultations: 'achats', commandes: 'achats', achats: 'achats', comptoir: 'achats', prixAchats: 'achats', efactures: 'achats',
      stock: 'stock', scan: 'scan', etapes: 'etapes', reception: 'reserves', pv: 'reserves', devis: 'devis', chiffrages: 'devis', chiffrage: 'devis', direction: 'direction', parametres: 'parametres',
      etudes: 'apps', doe: 'apps', etudesBe: 'apps' }[nom] || 'general';
  }
  // Routes principales (contrôlées par les tests : chacune a sa rubrique)
  const ROUTES = ['#/dashboard', '#/chantiers', '#/chantier/x', '#/chantier/x/documents', '#/consultations', '#/commandes', '#/stock', '#/scan', '#/planning', '#/etapes', '#/reception/x',
    '#/pointage', '#/pointage/planning', '#/pointage/chantiers', '#/pointage/rapports', '#/parametres', '#/devis', '#/direction'];

  // Parcours de démarrage. Cibles : la première visible de la liste (menu du haut sur ordinateur, barre du bas sur
  // téléphone) ; absente, la bulle s'affiche au centre de l'écran.
  const premierChantier = () => {
    try { const a = Store.all('affaires').find(x => !x.archive && !(typeof estHorsDevis === 'function' && estHorsDevis(x))); return a ? `#/chantier/${a.id}` : '#/chantiers'; } catch (e) { return '#/chantiers'; }
  };
  const nav = h => [`#nav a[href="${h}"]`, `#navbas a[href="${h}"]`, '#navbas-menu'];
  const AIDE = { cible: '#aide-bouton', titre: 'L\'aide reste à portée de main', texte: 'Le bouton « ? Aide » (ou F1) ouvre l\'aide de l\'écran où vous êtes : actions principales, pièges fréquents, écrans liés et recherche. Ce parcours s\'y relance.' };
  const P = [
    { id: 'conducteur', titre: 'Piloter ses chantiers', profil: 'Conducteur de travaux / chargé d\'affaires', acces: u => u.role !== 'atelier', etapes: [
      { route: '#/dashboard', cible: '.cards', titre: 'Le tableau de bord', texte: 'Devis en attente, carnet de commandes, chiffre d\'affaires facturé, heures de la semaine, pointages à valider : filtrez-le sur vos chantiers avec la barre de filtres.' },
      { route: '#/chantiers', cible: nav('#/chantiers'), titre: 'Vos chantiers', texte: 'Un chantier naît de l\'acceptation d\'un devis : son devis devient le budget. Les interventions hors devis s\'ouvrent aussi d\'ici.' },
      { route: '#/chantiers', cible: 'a[href="#/etapes"]', titre: 'Étapes des études', texte: 'L\'avancement des études du bureau, phase par phase, et les étapes en retard ou qui vous attendent.' },
      { route: premierChantier, cible: '.tabs', titre: 'La fiche chantier', texte: 'Vue d\'ensemble (budget face au réel, marges, heures), documents, réunions, sécurité, Gantt, et les applications DOE et Études reliées.' },
      { route: premierChantier, cible: ['#ch-consultation', '.toolbar .tb-plus'], titre: 'Acheter pour le chantier', texte: 'Consultation de plusieurs fournisseurs ou commande directe, préremplies avec le chantier : le réel des fournitures se met à jour.' },
      { route: premierChantier, cible: 'a[href^="#/reception/"]', titre: 'Réserves et réception', texte: 'Réserves affectées aux compagnons (levées avec photo sur leur téléphone), PV de réception puis de levée.' },
      { route: '#/planning', cible: ['.pl-equipe', '.tabs'], titre: 'Le planning', texte: 'Affectez les équipes aux chantiers en glissant les avatars ; chacun est prévenu sur son téléphone quand son planning change.' },
      AIDE] },
    { id: 'compagnon', titre: 'Ma journée sur le chantier', profil: 'Compagnon (appli téléphone)', etapes: [
      { route: '#/pointage', cible: ['.punch', '#p-start'], titre: 'Commencer et terminer', texte: 'Choisissez le chantier et la tâche puis « Commencer » ; le soir, « Terminer ». Cochez les collègues ou intérimaires avec vous pour pointer ensemble.' },
      { route: '#/pointage', cible: '#p-journee2', titre: 'Saisir sa journée', texte: 'Journée sur plusieurs chantiers ou différente du planning : saisissez-la d\'un coup, heures modifiables.' },
      { route: '#/pointage/planning', cible: ['#navbas a[href="#/pointage/planning"]', '.tabs a[href^="#/pointage/planning"]'], titre: 'Mon planning', texte: 'Vos chantiers et horaires prévus. Une notification vous prévient dès qu\'il change.' },
      { route: '#/pointage/chantiers', cible: ['.ch-carte', '.tabs a[href^="#/pointage/chantiers"]'], titre: 'Mes chantiers', texte: 'Vos chantiers et ceux de votre équipe (prévus au planning en ce moment) : adresse du site, documents transmis, matériel à poser, réserves à lever et étapes à faire, même hors connexion.' },
      { route: '#/pointage/rapports', cible: ['#r-travaux', '.tabs a[href^="#/pointage/rapports"]'], titre: 'Le rapport d\'intervention', texte: 'Travaux réalisés (« ↙ Reprendre ma journée » ou dictée 🎤), observations, besoins, matériel, photos et signature du client.' },
      { route: '#/scan', cible: ['#sc-go', '#sc-q'], titre: 'Stock et outillage', texte: 'Scannez l\'étiquette QR d\'un article ou d\'un outil, ou demandez du matériel aux fournisseurs.' },
      AIDE] },
    { id: 'admin', titre: 'Mettre en place Pipe-Fit', profil: 'Administrateur', acces: u => u.role === 'admin', etapes: [
      { route: '#/parametres', cible: '#acc-add', titre: 'Les comptes', texte: 'Un compte par personne : administrateur, chargé d\'affaires ou opérateur (compagnon). Reliez chaque compte opérateur à sa fiche de l\'équipe.' },
      { route: '#/parametres', cible: '#u-add', titre: 'L\'équipe', texte: 'Fiche de chaque personne : coût horaire (pilotage des marges), capacité, chef d\'équipe, intérimaires.' },
      { route: '#/parametres', cible: '#cp-carte', titre: 'Ce que voient les compagnons', texte: 'Client, matériel, quantités, commandes, documents… Les prix et montants restent masqués sauf choix contraire.' },
      { route: '#/parametres', cible: '#acc-carte', titre: 'Affichage par accès', texte: 'Masquez des écrans pour les chargés d\'affaires ou les compagnons : le menu et la barre du téléphone s\'allègent.' },
      { route: '#/parametres', cible: '[data-dv]', titre: 'Alertes de dérive', texte: 'Seuils au-delà desquels le chargé d\'affaires est prévenu : budget consommé, consommation en avance, marge en baisse.' },
      { route: '#/parametres', cible: '#num-carte', titre: 'Numérotation', texte: 'Format des numéros de factures, avoirs et situations (suite continue).' },
      { route: '#/direction', cible: ['.cards', 'h1'], titre: 'Direction', texte: 'Chiffre d\'affaires comparé à l\'an passé, marge à terminaison, carnet et retards de paiement.' },
      AIDE] },
  ];

  const contenu = {
    app: 'crm', nom: 'Pipe-Fit CRM', rubriques: R, parcours: P, ROUTES, ecran,
    utilisateur: () => (typeof Store !== 'undefined' && Store.me && Store.me.role ? Store.me : null),
    profil: u => ({ admin: 'admin', charge: 'conducteur', atelier: 'compagnon' }[u.role] || 'conducteur'),
    // Préférences du compte (tous ses appareils) : même enregistrement que les colonnes des tableaux
    prefs: {
      lire: () => (typeof Store !== 'undefined' && Store.me && Store.me.prefs && Store.me.prefs.aide) || null,
      ecrire: etat => {
        if (typeof Store === 'undefined' || !Store.me || typeof api !== 'function' || Store.horsLigne) return;
        Store.me.prefs = { ...(Store.me.prefs || {}), aide: { vus: etat.vus, propose: etat.propose } };
        api('PUT', '/api/me/preferences', Store.me.prefs).catch(() => { /* hors connexion : gardé sur cet appareil */ });
      },
    },
  };
  if (typeof Aide !== 'undefined') Aide.configurer(contenu);
  return contenu;
})();
if (typeof module !== 'undefined') module.exports = AideContenu;
