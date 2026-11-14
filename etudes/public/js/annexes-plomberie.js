// Calculs annexes — Plomberie : eaux pluviales, récupération des eaux de pluie, anti-légionelle et bouclage d'ECS.
// Rangés à part dans l'étude (famille « Calculs annexes », thème « Plomberie ») ; chaque type déclare annexe: true, theme,
// et sa fonction lier(ctx) qui reprend les données des autres notes de l'étude (voir Liens.resoudreLiens).
// Module pur (navigateur, node, tests).
const AnnexesPlomberie = ((N) => {
  return {};
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = AnnexesPlomberie;
