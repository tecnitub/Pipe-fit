// Échéances à surveiller : habilitations et visites médicales des compagnons, contrôles du parc (véhicules, outillage).
// Module commun navigateur / serveur (notifications) / démo / tests. Les durées sont des valeurs proposées à la saisie,
// la date d'expiration enregistrée fait foi.
const Echeances = (() => {
  const SEUIL = 60; // jours avant l'expiration : « à renouveler »
  // [clé, libellé, validité proposée en mois]
  const HABILITATIONS = [
    ['visite', 'Visite médicale (suivi de santé au travail)', 24],
    ['qmos', 'Qualification soudeur (QMOS, NF EN ISO 9606)', 24],
    ['fluides', 'Attestation d\'aptitude fluides frigorigènes', 60],
    ['elec', 'Habilitation électrique (B0, BR, BC, H0…)', 36],
    ['caces_nacelle', 'CACES R486 nacelle (PEMP)', 60],
    ['caces_chariot', 'CACES R489 chariot élévateur', 60],
    ['hauteur', 'Travail en hauteur, port du harnais', 36],
    ['sst', 'Sauveteur secouriste du travail (SST)', 24],
    ['aipr', 'AIPR (travaux à proximité des réseaux)', 60],
    ['amiante', 'Amiante sous-section 4', 36],
    ['atex', 'ATEX (atmosphères explosives)', 36],
  ];
  const COURT = { visite: 'Visite méd.', qmos: 'Soudeur', fluides: 'Fluides', elec: 'Électrique', caces_nacelle: 'Nacelle', caces_chariot: 'Chariot', hauteur: 'Hauteur', sst: 'SST', aipr: 'AIPR', amiante: 'Amiante SS4', atex: 'ATEX' };
  // Parc : catégories et contrôles proposés [clé, libellé, périodicité en mois]
  const PARC = {
    'Véhicule utilitaire': [['ct', 'Contrôle technique', 24], ['entretien', 'Entretien / vidange', 12], ['assurance', 'Échéance assurance', 12]],
    'Véhicule léger': [['ct', 'Contrôle technique', 24], ['entretien', 'Entretien / vidange', 12], ['assurance', 'Échéance assurance', 12]],
    'Nacelle / PEMP': [['vgp', 'VGP (vérification générale périodique)', 6]],
    'Appareil de levage': [['vgp', 'VGP (vérification générale périodique)', 6]],
    'Échafaudage': [['verif', 'Vérification avant mise en service / trimestrielle', 3]],
    'Poste à souder': [['elec', 'Vérification électrique', 12]],
    'Groupe électrogène / compresseur': [['entretien', 'Entretien', 12], ['elec', 'Vérification électrique', 12]],
    'Appareil de mesure': [['etalonnage', 'Étalonnage', 12]],
    'Outillage électroportatif': [['elec', 'Vérification électrique', 12]],
    'Récupération fluides frigorigènes': [['etalonnage', 'Contrôle / étalonnage (détecteur, balance)', 12]],
    'Autre': [],
  };
  const VEHICULES = ['Véhicule utilitaire', 'Véhicule léger'];

  const d12 = s => new Date(`${String(s).slice(0, 10)}T12:00:00`);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ajouterMois = (s, n) => { if (!s) return ''; const d = d12(s), j = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + Number(n)); d.setDate(Math.min(j, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return iso(d); };
  const jours = (de, a) => Math.round((d12(a) - d12(de)) / 86400000);
  // État d'une échéance : ok, bientôt (moins de SEUIL jours), expirée, ou non renseignée
  function etat(expire, auj, seuil = SEUIL) {
    if (!expire) return { etat: 'absent', jours: null };
    const j = jours(auj, expire);
    return { etat: j < 0 ? 'expire' : j <= seuil ? 'bientot' : 'ok', jours: j };
  }
  const libelleHab = cle => (HABILITATIONS.find(h => h[0] === cle) || [cle, cle])[1];

  // Alertes (expirées ou bientôt) d'une personne à partir de ses habilitations enregistrées
  function alertesPersonne(habs, auj) {
    return habs.map(h => ({ h, ...etat(h.expire, auj) })).filter(x => x.etat === 'expire' || x.etat === 'bientot')
      .map(x => ({ cle: x.h.cle, libelle: libelleHab(x.h.cle), expire: x.h.expire, etat: x.etat, jours: x.jours, userId: x.h.userId, id: x.h.id }));
  }
  // Alertes d'un matériel du parc
  function alertesMateriel(m, auj) {
    return (m.echeances || []).filter(e => e.prochaine).map(e => ({ e, ...etat(e.prochaine, auj, 30) })).filter(x => x.etat === 'expire' || x.etat === 'bientot')
      .map(x => ({ cle: x.e.cle, libelle: x.e.libelle, expire: x.e.prochaine, etat: x.etat, jours: x.jours, materielId: m.id }));
  }
  // Message lisible : « expirée depuis 12 j » / « expire dans 20 j (le 03/11/2026) »
  const dateFrS = s => { const [a, m, j] = String(s).split('-'); return `${j}/${m}/${a}`; };
  const texte = a => (a.etat === 'expire' ? `expirée depuis ${-a.jours} j (${dateFrS(a.expire)})` : a.jours === 0 ? 'expire aujourd\'hui' : `expire dans ${a.jours} j (le ${dateFrS(a.expire)})`);

  return { SEUIL, HABILITATIONS, COURT, PARC, VEHICULES, ajouterMois, jours, etat, libelleHab, alertesPersonne, alertesMateriel, texte, iso };
})();
if (typeof module !== 'undefined') module.exports = Echeances;
