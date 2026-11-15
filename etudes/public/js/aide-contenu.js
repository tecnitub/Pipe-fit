// Contenu de l'aide de l'application Études (moteur commun : /shared/aide.js) : une rubrique par écran principal
// (accueil et portefeuille, page de l'étude et guide « Reste à faire », calculs, schéma de principe, CTA, armoire /
// GTC / régulation, matériel retenu, devis fournisseurs, registre, vrac, contrôle, retour du chantier, réglages et
// valeurs réglementaires), rédigées d'après les écrans réels ; l'écran courant est déduit de l'adresse (#/…), du type
// du calcul ouvert et du dialogue ouvert. Parcours de démarrage du bureau d'études. « Vu » : mémorisé dans le navigateur.
const AideContenu = (() => {
  const R = [
    { id: 'accueil', titre: 'Accueil : études et portefeuille', route: '#/', motsCles: 'liste portefeuille avancement phases retard modèles calcul rapide nouvelle étude',
      but: 'Liste des études enregistrées, portefeuille d\'avancement (par phase, retards, étapes par personne), modèles d\'études et calculs rapides sans enregistrement.',
      actions: ['« + Nouvelle étude » : objet, affaire Pipe-Fit (ou client sans chantier), modèle de départ éventuel.',
        'Rechercher une étude par objet, client ou affaire.',
        'Portefeuille : filtrer par phase, responsable, « En retard » ou « Mes étapes » ; ouvrir l\'étude depuis sa ligne.',
        'Modèles : partir d\'un modèle intégré ou d\'une étude enregistrée comme modèle (⭐).',
        'Calcul rapide : calcul sans enregistrement, à verser ensuite dans une étude (« Enregistrer dans une étude… »).'],
      pieges: ['Une étude non reliée à une affaire Pipe-Fit n\'a ni phases chantier, ni retour du chantier, ni DOE.',
        'Le portefeuille n\'affiche que les études qui ont un guide (pas les modèles).'],
      liens: ['etude', 'guide', 'reglages'] },
    { id: 'etude', titre: 'Page de l\'étude', motsCles: 'fiche étude indice climat type bâtiment cctp dpgf calculs tableau de bord note de calcul pdf dupliquer modèle',
      but: 'Tout ce qui concerne une étude : fiche (objet, affaire, climat, type de bâtiment, rédacteur, vérificateur, indice), guide « Reste à faire », calculs, équipements et matériel, documents émis, tableau de bord, chantier et exploitation.',
      actions: ['Fiche de l\'étude : le climat et le type de bâtiment sont repris dans les calculs (aperçu des changements avant d\'appliquer).',
        '« 📑 CCTP / DPGF » : lecture du dossier de consultation, inventaire des producteurs, émetteurs et auxiliaires, calculs préremplis.',
        '« + Ajouter un calcul » ; « 💧 Installation hydraulique » pour les raccordements et contrôles de cohérence.',
        '« 🏷️ Matériel retenu », « 💶 Métré et chiffrage » (devis brouillon dans Pipe-Fit), « 🔎 Contrôler l\'étude », « 📄 Note de calcul PDF ».',
        '« Nouvel indice » avec motif de révision ; « Dupliquer l\'étude », « ⭐ Enregistrer comme modèle ».',
        'Cocher deux calculs puis « ⚖️ Comparer la sélection ».'],
      pieges: ['Changer le climat ou le type de bâtiment modifie les calculs déjà faits : relire l\'aperçu ; les calculs émis devront être réémis.',
        'L\'état d\'enregistrement s\'affiche en haut de la page : attendre « Enregistré » avant de fermer ; « Non enregistré » signale un échec.'],
      liens: ['guide', 'calcul', 'materiel', 'controle', 'retour', 'cctp'] },
    { id: 'guide', titre: 'Guide « Reste à faire »', motsCles: 'étapes phases responsable échéance sans objet suivante bloquée mes étapes retard état avancement pdf',
      but: 'Étapes de l\'étude rangées en phases (étude, achats, chantier, mise en service, réception, DOE, exploitation), triées par impact ; l\'étape suivante conseillée est la plus impactante non bloquée.',
      actions: ['Cliquer une étape pour l\'ouvrir : détail, blocage, autres actions ; le bouton d\'action mène au bon écran ou corrige sur place.',
        '« ✓ C\'est bon » quand les valeurs par défaut conviennent.',
        'Affecter un responsable et une échéance, ou déclarer l\'étape « Sans objet » avec un motif.',
        'Filtres « Par phase », « Mes étapes », « En retard », « Sans objet » ; PDF « État d\'avancement ».'],
      pieges: ['Une étape 🔒 est bloquée par une autre : traiter d\'abord celle indiquée dans son détail.',
        'Les phases chantier restent « à venir » tant que l\'étude n\'est pas reliée à un chantier de Pipe-Fit.',
        'Les étapes faites sur le terrain (appli des compagnons) sont reprises à l\'ouverture de l\'étude.'],
      liens: ['etude', 'controle', 'accueil'] },
    { id: 'calcul', titre: 'Écran d\'un calcul', motsCles: 'note saisie résultats schéma fiches techniques émettre indice cartouche brouillon valeurs par défaut lien détacher',
      but: 'Saisie et résultats d\'un calcul de l\'étude, avec ses liens aux autres calculs (valeurs reprises et verrouillées), son schéma et les fiches techniques.',
      actions: ['Vues : Tout, ✏️ Saisie, 📊 Résultats, 📐 Schéma, 📄 Fiches techniques.',
        '« 📄 Fiche technique » : la fiche du fabricant remplit le calcul et contrôle le matériel choisi.',
        '« 🖋️ Émettre l\'indice » (PDF avec cartouche) ou « 📄 Brouillon PDF » ; commentaire repris dans la note.',
        '« Valeurs par défaut », « Dupliquer », « Supprimer ce calcul ».',
        'Tableaux de lignes : coller un tableau copié d\'Excel à partir d\'une cellule remplit plusieurs lignes d\'un coup.'],
      pieges: ['Une valeur verrouillée vient d\'un autre calcul ou du registre : la corriger à sa source (bandeau 🔗 ou « Ouvrir le registre »), ou « Détacher ».',
        'Les badges d\'erreur et d\'attention de la page de l\'étude viennent des alertes du calcul : les lire avant d\'émettre.'],
      liens: ['etude', 'schema', 'cta', 'armoire', 'registre'] },
    { id: 'schema', titre: 'Schéma de principe hydraulique', motsCles: 'pid p&id production cascade bouteille découplage collecteur circuits pompes vannes robinetterie nomenclature réglementation',
      but: 'Production (générateur ou cascade), bouteille de découplage ou non, collecteurs et circuits vers les émetteurs : schéma dessiné automatiquement, débits, diamètres, pompes, vannes et bouteille dimensionnés.',
      actions: ['« ⚙️ Pompes retenues » : pompe et courbe de chaque circuit (ou lues sur la fiche du fabricant).',
        'Vannes d\'autorité insuffisante : Kvs cible, Kvs normalisé et vanne du catalogue proposés, appliqués après confirmation.',
        '« 🔩 Robinetterie type par circuit » puis « 📦 Nomenclature et liste d\'achat (Excel) ».',
        '« 🔗 Créer les notes liées » : réseaux et pompes, vannes, vase, reliés au schéma.'],
      pieges: ['La synthèse réglementaire du schéma reste indicative tant qu\'elle n\'est pas visée (Réglages, « Réglementation »).',
        'La loi d\'eau reprend la température de base du climat de l\'étude : renseigner le climat dans la fiche de l\'étude.'],
      liens: ['calcul', 'armoire', 'reglages'] },
    { id: 'cta', titre: 'Centrale de traitement d\'air (CTA)', motsCles: 'cta air neuf batteries récupérateur humidification ventilateurs sfp psychrométrie gaines bouches',
      but: 'Schéma de principe de la CTA, évolutions de l\'air hiver et été, puissances et débits d\'eau des batteries, récupérateur, humidification, ventilateurs et SFP.',
      actions: ['Choisir le type de centrale (double flux, mélange, soufflage seul) et les débits.',
        '« 📄 Fiche technique de la CTA » : caractéristiques du constructeur reprises et contrôlées.',
        '« 🌬️ Créer le schéma aéraulique relié (gaines, bouches) » ou l\'ouvrir s\'il existe.'],
      pieges: ['Les températures extérieures viennent du climat de l\'étude (verrouillées) : les changer dans la fiche de l\'étude.',
        'Le contrôle de l\'étude compare le débit de la CTA à l\'air neuf réglementaire : vérifier la cohérence avant l\'envoi.'],
      liens: ['calcul', 'armoire', 'controle'] },
    { id: 'armoire', titre: 'Armoire électrique, GTC et régulation', motsCles: 'électricité armoire cvc attente lot électricité câble protection automate points gtb gtc bacnet modbus analyse fonctionnelle unifilaire régulation',
      but: 'Pour chaque équipement : alimenté par une attente du lot électricité ou par une armoire CVC, départ, protection, câble et régulation ; bilan des armoires, demandes au lot électricité, points automate, analyse fonctionnelle, cahier des charges et schéma unifilaire.',
      actions: ['« ⚡ Mettre à jour depuis l\'étude » : équipements repris des calculs (terminaux, CTA, production, réseaux) ; les lignes ajoutées à la main restent.',
        '« 🔌 Dimensionner les câbles à notre charge ».',
        '« 📊 Classeur Excel » (bilan, attentes, points, adressage, nomenclature) et « 🔗 Table d\'échange GTB (CSV) ».',
        'Analyse fonctionnelle (Word) : consignes, plannings, fonctionnement, alarmes et conduite à tenir.'],
      pieges: ['La marque d\'automate et le protocole GTB sont repris une fois du CCTP : vérifier après une relecture du dossier.',
        'Les paramètres « à valider » des séquences de régulation apparaissent dans le contrôle de l\'étude et les réserves de conformité.'],
      liens: ['calcul', 'schema', 'controle'] },
    { id: 'cctp', titre: 'CCTP et DPGF (dossier de consultation)', motsCles: 'cctp dpgf inventaire lecture pdf excel producteurs émetteurs auxiliaires dce',
      but: 'Lecture du CCTP (PDF, même scanné) et du DPGF (Excel) : inventaire des producteurs, émetteurs et auxiliaires, utilisé pour préremplir les calculs et contrôler le matériel retenu.',
      actions: ['Charger le CCTP et le DPGF, relire l\'inventaire (décocher ce qui n\'est pas du lot), puis préremplir les calculs.',
        '« Voir / préremplir » depuis la carte d\'inventaire de la page de l\'étude.'],
      pieges: ['Un CCTP scanné passe par la lecture des caractères : plus long, et à relire.'],
      liens: ['etude', 'materiel'] },
    { id: 'materiel', titre: 'Matériel retenu et devis fournisseurs', motsCles: 'matériel retenu fabricant référence validation client soumis validé refusé devis fournisseur comparatif prix liste pdf csv',
      but: 'Fabricant et référence exacte de chaque équipement dimensionné, statut de validation par le client ou la maîtrise d\'œuvre, liste à faire valider (PDF) ; lecture des devis fournisseurs et comparatif.',
      actions: ['Choisir fabricant et « Référence exacte » (catalogue proposé quand il existe) ; le statut suit : à soumettre, soumis, validé, refusé.',
        '« Marquer « soumis au client » » puis « 📄 Liste à faire valider (PDF) » ou « CSV ».',
        '« 📄 Lire un devis fournisseur » (PDF) : lignes rapprochées du matériel, prix repris au chiffrage ; « Comparer les devis ».',
        '« + Ajouter un matériel » pour une ligne libre.'],
      pieges: ['Une ligne « à relancer » est soumise depuis plus de 15 jours sans réponse du client.',
        'Une ligne « plus dans l\'étude » (dimension changée) : reprendre la référence sur la nouvelle ligne puis supprimer l\'ancienne.',
        '⛔ non conforme au CCTP : la référence choisie contredit une exigence du dossier.'],
      liens: ['etude', 'registre', 'cctp', 'controle'] },
    { id: 'registre', titre: 'Registre des équipements', motsCles: 'registre modèle fiche emplacement placer propager terminal cta pompe bouche robinetterie',
      but: 'Un modèle par fiche technique, placé dans les calculs (terminaux, CTA, production, pompes, robinetterie, bouches, points de puisage…). Corriger une valeur ou remplacer la fiche met à jour tous les emplacements.',
      actions: ['« Ouvrir le registre » (carte « 🗂️ Registre des équipements » de l\'étude ou bandeau d\'un calcul).',
        'Corriger les valeurs d\'un modèle, remplacer sa fiche, choisir le modèle de la gamme, le placer dans d\'autres calculs.'],
      pieges: ['Les valeurs reprises du registre sont verrouillées dans les calculs : les corriger dans le registre, pas dans le calcul.',
        '« à placer » : modèle inscrit mais utilisé par aucun calcul.'],
      liens: ['vrac', 'materiel', 'calcul'] },
    { id: 'vrac', titre: 'Matériel en vrac', motsCles: 'vrac fiches techniques chargement pdf répartition reconnaissance',
      but: 'Charger toutes les fiches techniques du chantier en une fois (PDF, fiches texte au format Pipe-Fit, ou plusieurs fiches collées séparées par ---) : chaque fiche est reconnue et répartie dans l\'étude, sans ressaisie.',
      actions: ['« 📥 Matériel en vrac » (barre des calculs ou carte du registre) puis choisir les fichiers.',
        'Relire le compte rendu « Matériel réparti » ; compléter dans le registre ce qui n\'a pas trouvé sa place.'],
      pieges: ['Une fiche de gamme (plusieurs modèles) demande de choisir le modèle dans le registre.'],
      liens: ['registre', 'materiel'] },
    { id: 'controle', titre: 'Contrôle de l\'étude avant envoi', motsCles: 'contrôle vérification destinataire bureau de contrôle client interne rapport pdf incohérences erreurs',
      but: 'Passe toute l\'étude en revue avant l\'envoi : erreurs des calculs, valeurs estimées, paramètres à valider, réserves, matériel, incohérences entre calculs, fiches manquantes, reste à faire du guide.',
      actions: ['« 🔎 Contrôler l\'étude » ; choisir le destinataire du rapport (interne, bureau de contrôle, client) : le contenu est filtré.',
        'Bouton de chaque point : mène à l\'écran qui le corrige (la fenêtre se ferme).',
        '« 🖨️ Imprimer » ou « 📄 Rapport PDF ».'],
      pieges: ['Le verdict compte les points bloquants : les traiter avant d\'émettre la note de calcul.'],
      liens: ['guide', 'etude', 'materiel'] },
    { id: 'retour', titre: 'Retour du chantier', motsCles: 'mesures réglages plaques signalétiques série réserves levées fiabilité pannes comptages gtc consommation dérive fuite',
      but: 'Ce qui revient du chantier dans l\'étude : mesures de mise en service et réglages proposés, plaques signalétiques (n° de série au registre), réserves levées par les compagnons, fiabilité des modèles, comptages de la GTC face au calcul énergétique.',
      actions: ['« 📏 Mesures et réglages », « 🏷️ Plaques et registre », « 🛡️ Réserves levées ».',
        '« ⚠️ Fiabilité des modèles » : taux de pannes des modèles retenus sur les autres affaires.',
        '« 📈 Comptages » : relevés CSV ou Excel de la GTC, bilan réel, dérives et fuites.'],
      pieges: ['Ces boutons sont grisés tant que l\'étude n\'est pas reliée à un chantier (fiche de l\'étude, « Affaire Pipe-Fit »).'],
      liens: ['etude', 'registre'] },
    { id: 'chiffrage', titre: 'Métré et chiffrage', motsCles: 'métré chiffrage devis heures ratios csv brouillon',
      but: 'Métré de l\'étude (équipements, tubes, calorifuge, heures de pose) et création du devis brouillon dans Pipe-Fit.',
      actions: ['« Télécharger le métré (CSV) ».', '« Créer le devis brouillon dans Pipe-Fit » (pour l\'affaire ou le client).'],
      pieges: ['Les heures viennent des ratios des Réglages, calés sur le retour d\'expérience des chantiers terminés.'],
      liens: ['reglages', 'materiel'] },
    { id: 'reglages', titre: 'Réglages et valeurs réglementaires', route: '#/reglages', motsCles: 'réglages entreprise fluides réglementation visa valeurs réglementaires ratios métré catalogue administrateur',
      but: 'Entreprise (en-tête des notes de calcul), fluides caloporteurs des fabricants, visa de la réglementation, valeurs réglementaires des calculs annexes, ratios du métré, catalogues. Modifiables par l\'administrateur, en consultation pour les autres.',
      actions: ['Valeurs réglementaires : modifier une valeur (s\'applique à tous les calculs concernés, signalé dans les notes), « Revenir aux valeurs par défaut ».',
        'Mettre à jour les anciennes études figées sur l\'ancien défaut.',
        'Réglementation : relecteur, date, validité, exigences complémentaires, « Enregistrer le visa ».',
        'Ratios du métré : heures par mètre (a + b × DN), calage sur le retour d\'expérience Pipe-Fit.'],
      pieges: ['Les valeurs réglementaires par défaut sont des références à confirmer dans l\'édition en vigueur des textes.'],
      liens: ['reference', 'schema', 'chiffrage'] },
    { id: 'reference', titre: 'Données de référence', route: '#/reference', motsCles: 'séries tubes rugosité singularités zeta fluides',
      but: 'Valeurs de pré-dimensionnement utilisées par les calculs : séries de tubes, coefficients de pertes de charge singulières, fluides caloporteurs. Les fiches des fabricants et les normes font foi pour l\'exécution.',
      actions: ['Déplier une série de tubes pour voir diamètres, épaisseurs, sections et volumes d\'eau.'],
      pieges: [],
      liens: ['reglages', 'calcul'] },
    { id: 'rapide', titre: 'Calcul rapide', motsCles: 'calcul rapide sans enregistrement verser',
      but: 'Un calcul sans étude, pour un pré-dimensionnement : rien n\'est enregistré tant qu\'il n\'est pas versé dans une étude.',
      actions: ['« Enregistrer dans une étude… » : étude existante ou nouvelle.', '« 📄 PDF » du calcul.'],
      pieges: ['Quitter la page sans « Enregistrer dans une étude… » perd la saisie.'],
      liens: ['accueil', 'calcul'] },
  ];

  // Écran courant : adresse, type du calcul ouvert, dialogue ouvert (titre)
  const PAR_TYPE = { pid: 'schema', cta: 'cta', aero: 'cta', elec: 'armoire', cable: 'armoire' };
  const PAR_DIALOGUE = [[/Matériel retenu|Devis fournisseur|Comparatif des devis|Liste du matériel/i, 'materiel'], [/Registre des équipements/i, 'registre'], [/vrac|Matériel réparti/i, 'vrac'],
    [/Contrôle de l.étude|Contrôler l.étude/i, 'controle'], [/CCTP et DPGF/i, 'cctp'], [/Métré et chiffrage/i, 'chiffrage'],
    [/Mesures de mise en service|Plaques signalétiques|Réserves levées|Fiabilité des modèles|Comptages de la GTC/i, 'retour']];
  function typeNote(etudeId, noteId) {
    try { const et = S.etudes.find(x => x.id === etudeId), n = et && et.notes.find(x => x.id === noteId); return n ? n.type : ''; } catch (e) { return ''; }
  }
  function ecran(hash, ctx = {}) {
    const d = ctx.modale && PAR_DIALOGUE.find(([re]) => re.test(ctx.modale));
    if (d) return d[1];
    const [chemin] = String(hash || '').replace(/^#\/?/, '').split('?');
    const [nom, id, noteId] = chemin.split('/').map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } });
    if (nom === 'etude') {
      if (!noteId || noteId === 'comparer' || noteId === 'installation') return 'etude';
      const t = ctx.typeNote !== undefined ? ctx.typeNote : typeNote(id, noteId);
      return PAR_TYPE[t] || 'calcul';
    }
    return { reglages: 'reglages', reference: 'reference', rapide: 'rapide', chantier: 'accueil', nouvelle: 'accueil' }[nom] || 'accueil';
  }
  const ROUTES = ['#/', '#/etude/x', '#/etude/x/n', '#/reglages', '#/reference', '#/rapide/tuyauterie'];

  const premiereEtude = suite => () => {
    try { const et = S.etudes.find(x => !x.modele && (x.notes || []).length) || S.etudes.find(x => !x.modele); return et ? `#/etude/${et.id}${suite || ''}` : '#/'; } catch (e) { return '#/'; }
  };
  const P = [
    { id: 'be', titre: 'Mener une étude de bout en bout', profil: 'Bureau d\'études', etapes: [
      { route: '#/', cible: '#nouvelle', titre: 'Créer une étude', texte: 'Reliez-la à l\'affaire Pipe-Fit (ou au client) et partez au besoin d\'un modèle : climat, type de bâtiment et documents du chantier sont repris.' },
      { route: '#/', cible: ['.portefeuille', '#q'], titre: 'Le portefeuille', texte: 'Avancement de toutes les études par phase, retards et étapes par personne ; « Mes étapes » pour ce qui vous attend.' },
      { route: premiereEtude(), cible: '#guide-etude', titre: 'Le guide « Reste à faire »', texte: 'Les étapes de l\'étude, de la lecture du CCTP à l\'exploitation, triées par impact. Chaque étape mène au bon écran ; affectez responsables et échéances.' },
      { route: premiereEtude(), cible: '#inventaire', titre: 'Le dossier de consultation', texte: 'Lisez le CCTP et le DPGF : l\'inventaire des producteurs et émetteurs préremplit les calculs.' },
      { route: premiereEtude(), cible: '#ajout', titre: 'Les calculs', texte: 'Ajoutez les calculs (schéma de principe, CTA, réseaux, armoire…) : ils se relient entre eux et reprennent les valeurs des autres.' },
      { route: premiereEtude(), cible: ['#groupe-equipements', '#materiel'], titre: 'Équipements et matériel', texte: 'Registre des équipements (une fiche, tous les calculs à jour), matériel en vrac, matériel retenu à faire valider par le client.' },
      { route: premiereEtude(), cible: ['#controle-etude', '#pdf'], titre: 'Contrôler puis émettre', texte: 'Le contrôle passe l\'étude en revue selon le destinataire ; émettez ensuite la note de calcul PDF.' },
      { cible: '#aide-bouton', titre: 'L\'aide reste à portée de main', texte: 'Le bouton « ? Aide » (ou F1) ouvre l\'aide de l\'écran ou du dialogue ouvert, avec recherche. Ce parcours s\'y relance.' }] },
  ];

  const contenu = {
    app: 'etudes', nom: 'Pipe-Fit Études', rubriques: R, parcours: P, ROUTES, ecran,
    utilisateur: () => (typeof S !== 'undefined' && S.me ? S.me : null),
    profil: () => 'be',
  };
  if (typeof Aide !== 'undefined') Aide.configurer(contenu);
  return contenu;
})();
if (typeof module !== 'undefined') module.exports = AideContenu;
