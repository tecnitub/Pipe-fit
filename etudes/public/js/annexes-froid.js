// Calculs annexes — Froid et climatisation : détente directe DRV/VRF, fluides frigorigènes (F-gaz, EN 378), bilan de chambre froide.
// Rangés à part dans l'étude (famille « Calculs annexes », thème « Froid et climatisation ») ; chaque type déclare annexe: true, theme,
// et sa fonction lier(ctx) qui reprend les données des autres notes de l'étude (voir Liens.resoudreLiens).
// Module pur (navigateur, node, tests).
const AnnexesFroid = ((N) => {
  return {};
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = AnnexesFroid;
