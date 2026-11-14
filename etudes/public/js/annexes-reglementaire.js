// Calculs annexes — Réglementation et contrôle : classement de chaufferie, calorifugeage économique, traitement d'eau et désembouage.
// Rangés à part dans l'étude (famille « Calculs annexes », thème « Réglementation et contrôle ») ; chaque type déclare annexe: true, theme,
// et sa fonction lier(ctx) qui reprend les données des autres notes de l'étude (voir Liens.resoudreLiens).
// Module pur (navigateur, node, tests).
const AnnexesReglementaire = ((N) => {
  return {};
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = AnnexesReglementaire;
