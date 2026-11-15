// Contenu de l'aide de l'application DOE (moteur commun : /shared/aide.js) : liste des dossiers, sections du dossier
// (CCTP, étude et visas, page de garde, sections 1 à 10, signatures, liste « À compléter »), génération du PDF et
// réglages, rédigés d'après les écrans réels ; l'écran courant est déduit de l'adresse (#/doe/<id>/<section>).
// Parcours de démarrage du chargé d'affaires / conducteur de travaux. « Vu » : mémorisé dans le navigateur.
const AideContenu = (() => {
  const R = [
    { id: 'accueil', titre: 'Dossiers des ouvrages exécutés', route: '#/', motsCles: 'liste dossiers chantiers sans dossier créer démarrer étude progression',
      but: 'Les DOE en cours et remis, avec leur taux de complétude, et les chantiers Pipe-Fit qui n\'ont pas encore de dossier.',
      actions: ['Ouvrir un dossier (anneau : part des éléments complétés, nombre « à compléter »).',
        '« Démarrer l\'étude » : étude d\'exécution (CCTP lu, équipements repérés, fiches techniques visées) qui deviendra le DOE.',
        '« Créer le DOE » : dossier créé directement, avec les informations reprises du chantier.',
        'Rechercher un chantier par code ou nom.'],
      pieges: ['Un chantier n\'a qu\'un dossier : depuis la fiche chantier du CRM, l\'onglet 📘 DOE ouvre celui qui existe.'],
      liens: ['sections', 'generation'] },
    { id: 'sections', titre: 'Éditeur du dossier : sections', motsCles: 'navigation sections pastille à compléter reprendre pipe-fit indice remis',
      but: 'Le dossier est rangé selon le plan de classement : CCTP, étude, page de garde, sections 1 à 10 et signatures. La pastille de chaque section compte ce qui reste à compléter ; ✓ quand elle est complète.',
      actions: ['Passer d\'une section à l\'autre par la navigation de gauche (en haut sur téléphone).',
        '« 🔄 Reprendre depuis Pipe-Fit » : informations du chantier reprises sans écraser les champs déjà saisis.',
        '« Voir la liste » sous l\'anneau : tout ce qui manque, section par section, avec un lien.',
        'Les champs s\'enregistrent à la saisie ; l\'état s\'affiche sous le titre du dossier.'],
      pieges: ['La section 4 est « sans objet » dans le plan de classement TECNITUB : rien à y mettre.',
        'Un champ vide affiche « À compléter » : la mention figure aussi dans le PDF tant qu\'il reste vide.'],
      liens: ['garde', 'materiel', 'essais', 'maintenance', 'generation', 'manques'] },
    { id: 'cctp', titre: 'CCTP : lecture et contrôle', motsCles: 'cctp lecture pdf articles équipements repères liste de contrôle',
      but: 'Le CCTP du chantier remplit une partie du dossier (lot, indice, BET, n° d\'affaire), donne la liste des équipements à mettre en place avec leurs repères et sert de liste de contrôle.',
      actions: ['« Charger le CCTP (PDF) » puis « 📖 Lire le CCTP » ; « 🔄 Relire le CCTP » après un nouvel indice.',
        'Cocher « Pas de CCTP pour ce chantier » s\'il n\'y en a pas.'],
      pieges: ['Un équipement du CCTP absent du dossier est signalé : l\'ajouter en section 3 ou le justifier.'],
      liens: ['etude', 'materiel'] },
    { id: 'etude', titre: 'Étude : fiches techniques et visas', motsCles: 'visa fiche technique maître d\'œuvre bet soumettre visée refusée passer en doe',
      but: 'Étude d\'exécution : chaque équipement repéré reçoit sa fiche technique, soumise au visa du maître d\'œuvre / BET. Une fois les fiches visées, le DOE est rempli ; il ne reste que les attestations, PV et essais.',
      actions: ['Suivre le visa de chaque fiche (à soumettre, visée, refusée…).',
        'Le matériel retenu par le bureau d\'études (application Études) et le suivi du chantier sont reportés automatiquement.',
        '« Travaux terminés : passer en DOE » à la fin des travaux.'],
      pieges: ['Une fiche refusée n\'est pas jointe en annexe B : la remplacer.'],
      liens: ['cctp', 'materiel', 'sections'] },
    { id: 'garde', titre: 'Page de garde, intervenants et documents administratifs', motsCles: 'lot discipline opération adresse intervenants maître d\'ouvrage moe bet contrôle indice cctp dates réception gpa phasage',
      but: 'Identification de l\'opération (lot, discipline, adresse), intervenants (maître d\'ouvrage, maîtrise d\'œuvre, BET fluides, contrôle, acoustique), références, indice du DOE ; section 1 : dates et phasage.',
      actions: ['Renseigner raison sociale, interlocuteur, téléphone et e-mail de chaque intervenant.',
        '« Nouvel indice » : l\'indice précédent est gardé dans l\'historique.',
        'Cocher « Dossier remis au maître d\'ouvrage » à la remise.',
        'Section 1 : dates de début, fin et réception reprises de Pipe-Fit (premier et dernier pointage, PV de réception signé).'],
      pieges: ['La date de réception calcule la fin de GPA et les échéances des garanties (section 9) : la renseigner.',
        'L\'entreprise CVC (raison sociale, SIRET) se modifie dans Réglages, pas dans le dossier.'],
      liens: ['sections', 'garanties', 'reglages'] },
    { id: 'plans', titre: '2. Plans de recollement', motsCles: 'plans recollement pdf dwg ifc numéro échelle indice',
      but: 'Plans des ouvrages tels qu\'exécutés (PDF, DWG, IFC). Les plans déposés sur le chantier dans Pipe-Fit sont repris ; on ajoute ici les plans définitifs.',
      actions: ['« + Ajouter des plans » ; renseigner n° de plan, échelle, indice et sous-section (2.1 à 2.5).'],
      pieges: ['Les fichiers DWG et IFC sont listés et fournis en fichiers numériques : seuls les PDF et images sont intégrés au PDF.'],
      liens: ['annexes', 'sections'] },
    { id: 'materiel', titre: '3. Fiches techniques des équipements', motsCles: 'familles équipements repère marque référence série garantie sav import matériel fiches bibliothèque installé',
      but: 'Familles d\'équipements présentes sur le chantier, équipements (repère, marque, référence, n° de série, caractéristiques, garantie, SAV) et fiches techniques jointes (annexe B).',
      actions: ['Cocher les familles réellement présentes (seules celles-ci figurent dans le DOE).',
        '« Importer le matériel du chantier (Pipe-Fit) » : équipements repris des commandes.',
        'Comparer la référence commandée à celle de l\'étude et reprendre « ce qui est installé ».',
        '« + Joindre des fiches techniques » ou fiches de la bibliothèque Pipe-Fit (marque + référence).'],
      pieges: ['Un équipement sans n° de série ou sans repère reste ouvert et compté « à compléter ».',
        'Marque / référence « à confirmer » : attendre la validation du client ou la commande.'],
      liens: ['etude', 'garanties', 'annexes'] },
    { id: 'essais', titre: '5. Mises en service et 6. essais, contrôles, mesures', motsCles: 'pv mise en service essais pression étanchéité équilibrage désenfumage contrôles pièce jointe présent',
      but: 'Listes de contrôle des rapports de mise en service et des essais, selon les familles d\'équipements. Une pièce jointe coche « Présent » ; un PV signé dans Pipe-Fit couvre la pièce.',
      actions: ['Joindre les PV signés par le technicien et le responsable de chantier, ou cocher « Présent ».',
        'Ajouter une pièce à la liste si le chantier en demande une autre.'],
      pieges: ['Une pièce couverte seulement par Pipe-Fit est remplacée dans le PDF par le PV généré depuis Pipe-Fit.'],
      liens: ['annexes', 'sections'] },
    { id: 'maintenance', titre: '7. Maintenance et exploitation', motsCles: 'carnet maintenance préventive notice exploitation pièces de rechange entretien études',
      but: 'Carnet de maintenance préventive, notices d\'exploitation et pièces de rechange recommandées.',
      actions: ['« Proposer selon les familles d\'équipements » ; reprendre l\'entretien calculé par les études du chantier.',
        '« 📘 Générer la notice d\'exploitation » : équipements posés, consignes, réglages des PV signés, carnet d\'entretien, contacts ; PDF joint en 7.2.',
        '« + Joindre des notices » du fabricant.'],
      pieges: ['Le carnet de maintenance alimente le contrat d\'entretien du CRM : le remplir avant de créer le contrat.',
        'Fréquences et références reprises des études : à vérifier.'],
      liens: ['formation', 'sections'] },
    { id: 'formation', titre: '8. Formation des exploitants', motsCles: 'formation module contenu durée formateur attestation',
      but: 'Programme de formation (module, contenu, durée, formateur) et pièces justificatives (8.2).',
      actions: ['Compléter le formateur de chaque module ; joindre l\'attestation de formation.'],
      pieges: ['Un module sans formateur reste « à compléter ».'],
      liens: ['maintenance', 'garanties'] },
    { id: 'garanties', titre: '9. Garanties et assurances', motsCles: 'garanties parfait achèvement biennale décennale constructeur sav durée',
      but: 'Garanties contractuelles calculées depuis la date de réception, et garanties constructeurs reprises des équipements (durée, contact SAV).',
      actions: ['Renseigner la durée de garantie et le contact SAV de chaque équipement.'],
      pieges: ['Sans date de réception (section 1), les échéances restent « à compléter ».'],
      liens: ['garde', 'materiel'] },
    { id: 'annexes', titre: '10. Annexes et signatures', motsCles: 'annexes intégré pdf pv réception réserves signatures fait à',
      but: 'Annexes calculées d\'après les pièces jointes (plans, fiches, notes de calcul, PV, essais, formation, coupe-feu, PV de réception et réserves) et page de signatures de remise.',
      actions: ['Vérifier la colonne « Intégré au PDF » : les autres formats sont listés et fournis en fichiers numériques.',
        'Décocher le PV de réception et la levée des réserves (annexe R) si on ne veut pas les joindre.',
        'Signatures : date « Fait à …, le … ».'],
      pieges: ['La signature se fait sur le document imprimé : le DOE ne la recueille pas.'],
      liens: ['generation', 'essais'] },
    { id: 'manques', titre: 'À compléter', motsCles: 'manques liste reste à faire',
      but: 'Tout ce qui manque au dossier, rangé par section, avec un lien vers la section concernée.',
      actions: ['Cliquer une section pour y aller ; le compteur diminue à chaque élément complété.'],
      pieges: [],
      liens: ['sections', 'generation'] },
    { id: 'generation', titre: 'Génération du DOE (PDF)', motsCles: 'générer pdf assemblage sommaire annexes intégrées',
      but: '« 📄 Générer le DOE (PDF) » assemble la page de garde, les sections, le sommaire, puis les annexes : PDF fusionnés et images mises en page.',
      actions: ['Lancer la génération depuis l\'en-tête du dossier ; la progression s\'affiche étape par étape.',
        'Relire la liste « À compléter » avant de générer la version remise.'],
      pieges: ['Une pièce jointe illisible est signalée à la fin (« Pièces non intégrées ») : la remplacer et régénérer.',
        'Le PDF reprend l\'indice du DOE : créer un nouvel indice pour une mise à jour après remise.'],
      liens: ['annexes', 'manques', 'reglages'] },
    { id: 'reglages', titre: 'Réglages', route: '#/reglages', motsCles: 'entreprise logo couleur charte lieu signature lot discipline administrateur',
      but: 'Entreprise (pièces du DOE), lieu de signature, couleur de la charte, lot et discipline par défaut, logo. Réservé à l\'administrateur.',
      actions: ['Modifier un champ : enregistré aussitôt.', '« Changer le logo » (PNG, JPG).'],
      pieges: ['Les autres comptes voient les réglages en lecture seule.'],
      liens: ['generation', 'garde'] },
  ];

  const PAR_SECTION = { cctp: 'cctp', etude: 'etude', garde: 'garde', s1: 'garde', s2: 'plans', s3: 'materiel', s4: 'sections', s5: 'essais', s6: 'essais', s7: 'maintenance', s8: 'formation', s9: 'garanties', s10: 'annexes', signatures: 'annexes', manques: 'manques' };
  function ecran(hash, ctx = {}) {
    if (ctx.modale && /Génération du DOE/i.test(ctx.modale)) return 'generation';
    const [chemin] = String(hash || '').replace(/^#\/?/, '').split('?');
    const [nom, , section] = chemin.split('/');
    if (nom === 'doe') return PAR_SECTION[section] || 'garde';
    return { reglages: 'reglages' }[nom] || 'accueil';
  }
  const ROUTES = ['#/', '#/reglages', ...Object.keys(PAR_SECTION).map(s => `#/doe/x/${s}`)];

  const premierDoe = section => () => {
    try { const d = S.does[0]; return d ? `#/doe/${d.id}/${section}` : '#/'; } catch (e) { return '#/'; }
  };
  const P = [
    { id: 'doe', titre: 'Constituer un DOE', profil: 'Conducteur de travaux / chargé d\'affaires', etapes: [
      { route: '#/', cible: ['.carte.dossier', 'section h2'], titre: 'Vos dossiers', texte: 'Chaque dossier affiche sa complétude ; les chantiers de Pipe-Fit sans dossier sont listés dessous.' },
      { route: '#/', cible: ['[data-etude]', '[data-creer]', '#q'], titre: 'Démarrer', texte: '« Démarrer l\'étude » pour suivre les visas des fiches pendant les travaux, ou « Créer le DOE » directement : les informations du chantier sont reprises.' },
      { route: premierDoe('garde'), cible: '.sections', titre: 'Les sections', texte: 'Le plan de classement, section par section ; la pastille compte ce qui reste à compléter.' },
      { route: premierDoe('garde'), cible: '.progression', titre: 'Ce qui manque', texte: 'L\'anneau donne la complétude ; « Voir la liste » détaille tout ce qui manque, avec un lien vers la section.' },
      { route: premierDoe('garde'), cible: '#maj-pf', titre: 'Reprendre depuis Pipe-Fit', texte: 'Dates, intervenants, plans et PV du chantier sont repris, sans écraser ce que vous avez saisi.' },
      { route: premierDoe('s3'), cible: ['#import-pf', '.familles'], titre: 'Les équipements', texte: 'Familles présentes, matériel importé des commandes du chantier, n° de série et fiches techniques jointes.' },
      { route: premierDoe('garde'), cible: '#generer', titre: 'Générer le PDF', texte: 'Page de garde, sections, sommaire et annexes assemblés en un seul PDF.' },
      { cible: '#aide-bouton', titre: 'L\'aide reste à portée de main', texte: 'Le bouton « ? Aide » (ou F1) ouvre l\'aide de la section ouverte, avec recherche. Ce parcours s\'y relance.' }] },
  ];

  const contenu = {
    app: 'doe', nom: 'Pipe-Fit DOE', rubriques: R, parcours: P, ROUTES, ecran,
    utilisateur: () => (typeof S !== 'undefined' && S.me ? S.me : null),
    profil: () => 'doe',
  };
  if (typeof Aide !== 'undefined') Aide.configurer(contenu);
  return contenu;
})();
if (typeof module !== 'undefined') module.exports = AideContenu;
