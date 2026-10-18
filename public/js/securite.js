// Sécurité des chantiers : PPSPS (plan particulier de sécurité et de protection de la santé, art. R4532-63 et suivants
// du Code du travail), PGC du coordonnateur SPS, plans de prévention (annuel du client ou spécifique au chantier,
// art. R4512-6 et suivants) et fiches de données de sécurité (FDS) des produits transportés dans les véhicules.
// Module commun navigateur / serveur / démo / tests.
const Securite = (() => {
  // Catégories de documents de sécurité : transmises aux compagnons même si les autres documents ne le sont pas
  const CATEGORIES = ['Sécurité / PPSPS', 'PGC', 'Plan de prévention'];
  const estDocSecurite = c => CATEGORIES.includes(c);

  // Bibliothèque des risques du métier : [clé, libellé, mesures proposées, EPI, habilitations requises, mots-clés de détection]
  const RISQUES = [
    ['feu', 'Points chauds : soudure, meulage, brasage, oxycoupage', 'Permis de feu délivré par l\'exploitant avant toute intervention. Zone dégagée des matières combustibles ou protégée par bâches ignifugées. Extincteur à portée de main. Surveillance de la zone pendant 2 h après la fin des travaux. Bouteilles de gaz arrimées, chalumeau équipé de clapets anti-retour. Aspiration ou ventilation des fumées de soudage.',
      'Masque de soudeur, gants et tablier cuir, vêtements ignifugés', [], /soud|meul|brasa|oxycoup|chalumeau|point.? chaud|permis de feu|disqu/],
    ['hauteur', 'Travail en hauteur', 'Travail depuis une nacelle (PEMP), un échafaudage roulant vérifié ou une PIRL. Garde-corps sur les plateformes. Harnais antichute amarré à un point d\'ancrage en nacelle à bras articulé. Balisage de la zone au sol.',
      'Harnais antichute, casque à jugulaire', ['hauteur', 'caces_nacelle'], /hauteur|nacelle|[ée]chafaud|rack|toiture|pemp|chute|passerelle|plateforme/],
    ['manutention', 'Manutention de tubes, vannes et charges', 'Aides à la manutention (diable, palonnier, chariot). Port à deux au-delà de 25 kg. Préfabrication en atelier pour limiter les ports sur site.',
      'Gants de manutention, chaussures de sécurité', [], /manutention|charge lourde|port de charge|tube|vanne/],
    ['levage', 'Levage et engins', 'Appareils de levage et accessoires (élingues, manilles) vérifiés (VGP à jour). Plan d\'élingage pour les charges lourdes. Zone de levage balisée, personne sous la charge interdite. Conduite d\'engins réservée aux titulaires du CACES et de l\'autorisation de conduite.',
      'Casque, gants', ['caces_chariot'], /levage|grue|palan|chariot|[ée]lingu|engin|manuscopique/],
    ['pression', 'Réseaux en service : vapeur, fluides chauds ou sous pression', 'Consignation des réseaux par l\'exploitant (attestation de consignation remise avant intervention). Vidange, purge et décompression avant ouverture. Épreuves hydrauliques ou pneumatiques en zone balisée, montée en pression progressive, manomètre étalonné.',
      'Lunettes ou écran facial, gants', [], /vapeur|pression|consign|[ée]preuve|hydraulique|purge|chaud|condensat|eau surchauff/],
    ['chimique', 'Produits chimiques (décapage, colles, gaz)', 'Fiches de données de sécurité (FDS) disponibles dans le véhicule et consultées avant emploi. Produits stockés dans leur emballage d\'origine, quantités limitées au besoin du jour. Ventilation des locaux. Ne pas manger ni fumer pendant l\'utilisation.',
      'Gants nitrile, lunettes étanches, masque à cartouche si nécessaire', [], /chimi|d[ée]cap|passiv|acide|soude|colle|solvant|fds|produit dangereux|nep|nettoyage en place/],
    ['confine', 'Espace confiné (cuve, fosse, galerie)', 'Permis de pénétrer délivré par l\'exploitant. Ventilation et mesure de l\'atmosphère (détecteur 4 gaz) avant et pendant l\'intervention. Surveillant à l\'extérieur en liaison permanente, moyens d\'évacuation prévus. Intervenants formés CATEC.',
      'Détecteur 4 gaz, harnais d\'évacuation', [], /confin|cuve|fosse|galerie|regard|catec|citerne|silo/],
    ['atex', 'Zone ATEX (atmosphère explosive)', 'Permis de travail ATEX. Contrôle d\'atmosphère à l\'explosimètre avant et pendant les travaux. Matériel électrique certifié ATEX, outillage anti-étincelles. Aucun point chaud sans autorisation écrite.',
      'Vêtements antistatiques, explosimètre', ['atex'], /atex|explosi|hydrocarbure|gaz naturel|inflammable|p[ée]trochim|solvant/],
    ['amiante', 'Amiante (calorifuges, joints anciens)', 'Repérage amiante avant travaux (RAT) remis par le donneur d\'ordre. En présence d\'amiante : mode opératoire sous-section 4 transmis à l\'inspection du travail, intervenants formés. Arrêt immédiat en cas de découverte imprévue.',
      'Masque P3 ou à ventilation assistée, combinaison jetable type 5/6', ['amiante'], /amiante|flocage|fibrociment|\bdta\b|rep[ée]rage avant travaux/],
    ['elec', 'Risque électrique', 'Consignation électrique des équipements par l\'exploitant avant intervention. Vérification d\'absence de tension (VAT). Interventions électriques réservées aux personnes habilitées.',
      'Gants isolants, outillage isolé', ['elec'], /[ée]lectri|armoire|tension|c[âa]bl|moteur|pompe/],
    ['frigo', 'Fluides frigorigènes', 'Manipulation réservée aux titulaires de l\'attestation d\'aptitude. Récupération des fluides avec une station contrôlée, bouteilles de transfert identifiées. Contrôle d\'étanchéité au détecteur.',
      'Gants et lunettes de protection (brûlure par le froid)', ['fluides'], /frigori|fluide frig|climati|r32|r410|r134|groupe froid|pac\b|pompe [àa] chaleur/],
    ['reseaux', 'Travaux à proximité des réseaux enterrés', 'DT-DICT et réponses des exploitants obtenues avant travaux. Marquage-piquetage des réseaux. Terrassement manuel à proximité.',
      'Gilet haute visibilité', ['aipr'], /enterr|tranch|terrass|dict|fouille|r[ée]seau/],
    ['coactivite', 'Coactivité avec d\'autres entreprises', 'Coordination avec le coordonnateur SPS ou l\'exploitant : planning des interventions, zones de travail balisées, information des autres entreprises sur les travaux par points chauds et les levages.',
      '', [], /coactivit|autres entreprises|corps d.[ée]tat|coordonnat|sps|pgc/],
    ['bruit', 'Bruit (meulage, découpe, compresseur)', 'Choix d\'outillage moins bruyant. Information des personnes à proximité.',
      'Bouchons d\'oreille ou casque antibruit', [], /bruit|meul|d[ée]coup|compresseur|chaufferie|sonore/],
    ['circulation', 'Circulation sur le site', 'Respect du plan de circulation et des limitations de vitesse du site. Stationnement sur les emplacements prévus. Approvisionnements aux heures convenues.',
      'Gilet haute visibilité', [], /circulation|engins|quai|parking|usine|site industriel|livraison/],
  ];
  const risque = cle => RISQUES.find(r => r[0] === cle);
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Risques détectés dans un texte (contraintes du PGC, objet du chantier, lignes du devis)
  const detecter = texte => { const t = String(texte || '').toLowerCase(), n = norm(texte); return RISQUES.filter(r => r[5].test(t) || r[5].test(n)).map(r => r[0]); };

  // Numéros d'urgence proposés
  const URGENCES = [['samu', 'SAMU', '15'], ['pompiers', 'Pompiers', '18'], ['europe', 'Numéro d\'urgence européen', '112'], ['antipoison', 'Centre antipoison', '']];

  // Contrôle des intervenants : habilitations requises par les risques retenus, absentes ou expirées à la date des travaux
  function controleIntervenants(userIds, habilitations, risques, date) {
    const requises = [...new Set(risques.flatMap(k => (risque(k) || [])[4] || []))];
    return userIds.map(userId => {
      const siennes = habilitations.filter(h => h.userId === userId);
      const valide = cle => siennes.some(h => h.cle === cle && (!h.expire || h.expire >= date));
      const visite = siennes.find(h => h.cle === 'visite');
      // Travail en hauteur : la formation « hauteur » ou le CACES nacelle suffisent
      const manque = requises.filter(cle => !valide(cle) && !(['hauteur', 'caces_nacelle'].includes(cle) && (valide('hauteur') || valide('caces_nacelle'))));
      const expirees = manque.filter(cle => siennes.some(h => h.cle === cle));
      return { userId, manque: manque.filter(c => !expirees.includes(c)), expirees, visite: !visite ? 'absente' : visite.expire && visite.expire < date ? 'expiree' : 'ok',
        sst: valide('sst') };
    });
  }

  // Plans de prévention annuels d'un client : état à une date (valide, bientôt échu sous 30 j, échu, à venir)
  function etatPlan(p, date) {
    if (p.debut && p.debut > date) return 'futur';
    if (!p.fin) return 'valide';
    if (p.fin < date) return 'echu';
    const j = Math.round((new Date(`${p.fin}T12:00:00`) - new Date(`${date}T12:00:00`)) / 86400000);
    return j <= 30 ? 'bientot' : 'valide';
  }
  // Plan applicable à un chantier : valide à la date, pour tous les sites ou pour le site du chantier
  const planApplicable = (plans, siteId, date) => (plans || []).filter(p => (!p.siteId || p.siteId === siteId) && ['valide', 'bientot'].includes(etatPlan(p, date)))
    .sort((a, b) => (b.debut || '').localeCompare(a.debut || ''))[0] || null;

  // Pictogrammes de danger (règlement CLP)
  const PICTOS = [['GHS01', 'Explosif', '💥'], ['GHS02', 'Inflammable', '🔥'], ['GHS03', 'Comburant', '⭕'], ['GHS04', 'Gaz sous pression', '🧯'], ['GHS05', 'Corrosif', '🧪'],
    ['GHS06', 'Toxique', '☠️'], ['GHS07', 'Nocif, irritant', '❗'], ['GHS08', 'Danger pour la santé', '🫁'], ['GHS09', 'Dangereux pour l\'environnement', '🐟']];
  // FDS à revoir : plus de 3 ans (le fournisseur la met à jour à chaque nouvelle information)
  const fdsAncienne = (dateFds, date) => !dateFds || Math.round((new Date(`${date}T12:00:00`) - new Date(`${dateFds}T12:00:00`)) / 86400000) > 3 * 365;
  // Produits à bord des véhicules confiés à des personnes
  const produitsDesPersonnes = (userIds, materiels) => [...new Set(materiels.filter(m => !m.archive && m.affectation && userIds.includes(m.affectation.userId)).flatMap(m => m.produits || []))];

  // Indice suivant d'un document (A → B, 1 → 2)
  const indiceSuivant = i => (!i ? 'A' : /^[A-Y]$/i.test(i) ? String.fromCharCode(i.toUpperCase().charCodeAt(0) + 1) : /^\d+$/.test(i) ? String(+i + 1) : `${i}+`);

  return { CATEGORIES, estDocSecurite, RISQUES, risque, detecter, URGENCES, controleIntervenants, etatPlan, planApplicable, PICTOS, fdsAncienne, produitsDesPersonnes, indiceSuivant };
})();
if (typeof module !== 'undefined') module.exports = Securite;
