// Plan de classement type d'un DOE TECNITUB (CVC / Plomberie / Tuyauterie) : sections, gabarits et valeurs par défaut.
// Les numéros de section suivent la convention TECNITUB (pas de section 4).
const A_COMPLETER = 'À compléter';
const TRAME = {
  sections: [
    ['garde', 'Page de garde et intervenants'], ['s1', '1. Documents administratifs'], ['s2', '2. Plans de recollement'],
    ['s3', '3. Fiches techniques des équipements'], ['s5', '5. Rapports de mise en service'], ['s6', '6. Essais, contrôles et mesures'],
    ['s7', '7. Maintenance et exploitation'], ['s8', '8. Formation des exploitants'], ['s9', '9. Garanties et assurances'],
    ['s10', '10. Annexes'], ['signatures', 'Signatures de remise'],
  ],
  intervenants: [['mo', 'Maître d\'ouvrage'], ['moe', 'Architecte / Maître d\'œuvre'], ['bet', 'BET Fluides'], ['controle', 'Organisme de contrôle'], ['acoustique', 'BET Acoustique']],
  sousPlans: [['2.1', 'Plans CVC — Chauffage / Rafraîchissement'], ['2.2', 'Plans ventilation / traitement d\'air'], ['2.3', 'Plans plomberie sanitaire'],
    ['2.4', 'Régulation / GTB'], ['2.5', 'Plans de tuyauterie / réseaux process']],
  // Familles d'équipements : champs de la fiche ; fiche = une fiche par équipement (sinon un tableau)
  familles: [
    { id: '3.1', titre: 'Production chaud / froid — Thermofrigopompe (TFP) / PAC', fiche: true,
      champs: ['Type', 'Référence CCTP', 'Fluide frigorigène (+ GWP)', 'Puissance chaud', 'Puissance froid', 'SCOP / SEER', 'Alimentation électrique', 'Implantation', 'Support', 'Prise d\'air', 'Rejet d\'air', 'Communication GTB', 'Date de pose / mise en service'] },
    { id: '3.2', titre: 'Émission de chaleur / froid', champs: ['Type', 'Modèle', 'Puissance', 'Robinetterie / régulation', 'Localisation'] },
    { id: '3.3', titre: 'Installations à détente directe (splits)', champs: ['Local', 'Référence UE / UI', 'Puissance froid', 'Fluide', 'UE positionnée'] },
    { id: '3.4', titre: 'Ventilation / Traitement d\'air — CTA double flux', fiche: true,
      champs: ['Zones desservies', 'Débit soufflage / reprise', 'Récupération (type + rendement)', 'Moteurs', 'Filtration AN', 'Batteries EC / EG', 'GMV soufflage / rejet', 'Régulation (BACnet / GTC)', 'Implantation', 'Dimensions / poids / manutention'] },
    { id: '3.5', titre: 'Ventilation simple flux (VMC)', champs: ['Zones desservies', 'Débit (m³/h)', 'Implantation', 'Régime'] },
    { id: '3.6', titre: 'Désenfumage mécanique', fiche: true, champs: ['Principe (IT263)', 'Extracteur (modèle, classe F400, moteur)', 'Débit retenu / mesuré', 'Pression', 'Amenée d\'air'] },
    { id: '3.7', titre: 'Robinetterie et organes hydrauliques', champs: ['Type', 'Circuit', 'DN / caractéristiques', 'Localisation'] },
    { id: '3.8', titre: 'Tuyauteries et réseaux process', champs: ['Réseau / fluide', 'Matériau / nuance', 'DN', 'Longueur', 'Assemblage', 'Localisation'] },
    { id: '3.9', titre: 'Plomberie sanitaire', champs: ['Désignation', 'Localisation'] },
  ],
  // Listes de contrôle : N° · Document / Pièce · Présent (annexe de rattachement)
  controles: {
    '5.1': { titre: 'Production (TFP / PAC)', annexe: 'F', items: ['PV de mise en service TFP / PAC (constructeur)', 'Attestation de charge en fluide frigorigène (CERFA)', 'Relevé des paramètres de fonctionnement'], familles: ['3.1', '3.3'] },
    '5.2': { titre: 'Mise en service hydraulique', annexe: 'F', items: ['PV de remplissage et mise en pression des réseaux', 'PV d\'équilibrage des radiateurs', 'PV d\'équilibrage VC / CTA', 'Relevés de températures départ / retour', 'Rapport de chasse, rinçage et analyse d\'eau'], familles: ['3.1', '3.2', '3.7'] },
    '5.3': { titre: 'Mise en service aéraulique', annexe: 'F', items: ['PV d\'équilibrage aéraulique par CTA', 'PV d\'équilibrage VMC', 'PV de mise en service du désenfumage', 'Test d\'étanchéité des réseaux aérauliques'], familles: ['3.4', '3.5', '3.6'] },
    '5.4': { titre: 'Régulation / GTB', annexe: 'F', items: ['Courbes de chauffe par circuit', 'Programmations horaires', 'Test BP relance confort', 'Remontée des alarmes (SMS / mail)', 'Paramétrage du comptage', 'Export / sauvegarde de la configuration'], familles: ['3.1', '3.4'] },
    '6.1': { titre: 'Essais d\'étanchéité', annexe: 'G', items: ['PV d\'essai de pression des réseaux hydrauliques (1,5 × Ps, 30 min)', 'PV d\'étanchéité des circuits frigorigènes (EN 378)'], familles: [] },
    '6.2': { titre: 'Mesures aérauliques', annexe: 'G', items: ['Relevé d\'équilibrage aéraulique (débits bouche par bouche)'], familles: ['3.4', '3.5'] },
    '6.3': { titre: 'Tuyauteries process', annexe: 'G', items: ['PV d\'épreuve hydraulique des tuyauteries', 'Rapports de contrôle des soudures (RX, ressuage)', 'Certificats matière EN 10204 3.1', 'Cahier de soudage (DMOS / QMOS)'], familles: ['3.8'] },
    '6.4': { titre: 'Contrôles réglementaires', annexe: 'G', items: ['Rapport de vérification du désenfumage', 'Contrôle des clapets coupe-feu', 'Attestation de rebouchage coupe-feu et PV feu du produit', 'Contrôle de l\'électricité associée'], familles: [] },
    '8.2': { titre: 'Attestations et émargements', annexe: 'H', items: ['Livret de formation', 'Feuilles d\'émargement par module', 'Coordonnées SAV post-livraison'], familles: [] },
  },
  maintenance: {
    '3.1': [['TFP / PAC', 'Contrôle d\'étanchéité du circuit frigorigène', 'Annuelle', 'Frigoriste certifié'], ['TFP / PAC', 'Nettoyage des échangeurs et contrôle des sécurités', 'Semestrielle', 'Mainteneur CVC']],
    '3.2': [['Ventilo-convecteurs', 'Remplacement des filtres', 'Semestrielle', 'Mainteneur CVC'], ['Radiateurs', 'Purge, contrôle des robinets thermostatiques', 'Annuelle', 'Mainteneur CVC']],
    '3.3': [['Splits', 'Nettoyage des filtres et contrôle d\'étanchéité', 'Annuelle', 'Frigoriste certifié']],
    '3.4': [['CTA', 'Remplacement des filtres (M5 + F7)', 'Trimestrielle', 'Mainteneur CVC'], ['CTA', 'Contrôle moteurs, courroies et récupérateur', 'Semestrielle', 'Mainteneur CVC']],
    '3.5': [['VMC', 'Nettoyage des bouches et contrôle des débits', 'Annuelle', 'Mainteneur CVC']],
    '3.6': [['Désenfumage', 'Essai réglementaire (IT263)', 'Annuelle', 'Vérificateur agréé']],
    '3.7': [['Réseaux hydrauliques', 'Analyse d\'eau et contrôle de l\'inhibiteur', 'Annuelle', 'Mainteneur CVC'], ['Filtres à boues / pots de décantation', 'Nettoyage', 'Semestrielle', 'Mainteneur CVC'], ['Vannes et organes de sectionnement', 'Manœuvre et contrôle d\'étanchéité', 'Annuelle', 'Mainteneur']],
    '3.8': [['Tuyauteries process', 'Inspection visuelle : supportage, calorifuge, fuites, corrosion', 'Annuelle', 'Exploitant / TECNITUB'], ['Robinetterie process', 'Manœuvre et contrôle des garnitures', 'Semestrielle', 'Exploitant']],
    '3.9': [['Production ECS', 'Détartrage, désinfection, suivi légionelles', 'Annuelle', 'Mainteneur plomberie']],
  },
  formation: [['Présentation des installations', 'Principes, schémas, repérage des équipements', '1 h', ''], ['Conduite et réglages', 'Mise en marche, arrêt, consignes, programmations', '1 h 30', ''],
    ['Maintenance de premier niveau', 'Filtres, purges, contrôles visuels, carnet d\'entretien', '1 h', ''], ['Procédures d\'urgence', 'Arrêt d\'urgence, alarmes, appel SAV', '30 min', '']],
  garanties: [['Garantie de parfait achèvement (GPA)', 1], ['Garantie biennale de bon fonctionnement', 2], ['Garantie décennale', 10]],
  annexes: [['A', 'Plans de recollement'], ['B', 'Fiches techniques constructeurs et notices'], ['F', 'Rapports de mise en service'], ['G', 'Essais, contrôles et mesures'],
    ['H', 'Formation des exploitants'], ['O', 'Attestation de rebouchage coupe-feu'], ['R', 'PV de réception et levée des réserves']],
};

// Nouveau dossier vide (pré-rempli ensuite depuis Pipe-Fit)
function doeVide(affaireId, config) {
  return {
    affaireId, statut: 'En cours', lot: config.lotDefaut || '', discipline: config.disciplineDefaut || 'GÉNIE CLIMATIQUE / PLOMBERIE', operation: '', adresse: '', phase: 'Phase unique',
    phasage: 'Travaux réalisés en une phase unique.', intervenants: {}, affaireBet: '', cctp: { indice: '', date: '', dossier: '', bet: '' },
    dates: { debut: '', fin: '', reception: '', gpa: '' }, indice: 'A', indiceLib: 'Version initiale', historique: [],
    familles: [], plans: [], equipements: [], fiches: [], controles: {}, maintenance: [], notices: [], pieces: [], formation: TRAME.formation.map(f => [...f]),
    garantiesConstructeurs: [], signatures: { date: '' }, pf: {},
  };
}
