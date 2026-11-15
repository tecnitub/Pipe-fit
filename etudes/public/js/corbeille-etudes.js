// Études supprimées (corbeille des études) : règles communes au serveur Études, à sa démonstration et au navigateur.
// Une étude supprimée n'est pas effacée : elle va dans la corbeille avec son historique de versions, se restaure par son
// auteur ou l'administrateur, et n'est effacée définitivement qu'après la durée réglée (30 jours par défaut).
const CorbeilleEtudes = (() => {
  const JOURS_DEFAUT = 30, JOURS_MAX = 365;
  // Durée de conservation (Réglages → corbeilleJours, ou ETUDES_CORBEILLE_JOURS) : 1 à 365 jours
  const jours = v => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 ? Math.min(JOURS_MAX, n) : JOURS_DEFAUT; };
  // Auteur d'une étude : { login, nom } ; une étude créée avant le suivi des auteurs n'a que le nom (première version)
  const estAuteur = (auteur, s) => !!(s && auteur && ((auteur.login && auteur.login === s.login) || (!auteur.login && auteur.nom && auteur.nom === (s.nom || s.login))));
  // Suppression et restauration : l'auteur ou l'administrateur
  const peutGerer = (auteur, s) => !!s && (s.role === 'admin' || estAuteur(auteur, s));
  const REFUS = 'Seul l\'auteur de l\'étude ou l\'administrateur peut la supprimer ou la restaurer.';
  const ajouterJours = (iso, n) => new Date(new Date(iso).getTime() + n * 86400000).toISOString();
  const purgeLe = (supprimeLe, n) => ajouterJours(supprimeLe, jours(n));
  // Études de la corbeille à effacer définitivement : [{ id, supprimeLe }] → ids
  const aPurger = (liste, n, maintenant = new Date().toISOString()) => (liste || []).filter(x => x && x.supprimeLe && purgeLe(x.supprimeLe, n) <= maintenant).map(x => x.id);
  return { JOURS_DEFAUT, JOURS_MAX, jours, estAuteur, peutGerer, REFUS, purgeLe, aPurger };
})();
if (typeof module !== 'undefined') module.exports = CorbeilleEtudes;
