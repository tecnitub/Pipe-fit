// Calculs annexes — Ventilation et traitement d'air : débits d'air neuf réglementaires, hotte de cuisine, parking, piscine / déshumidification, confort et diffusion, puits canadien.
// Rangés à part dans l'étude (famille « Calculs annexes », thème « Ventilation et traitement d'air ») ; chaque type déclare annexe: true, theme,
// et sa fonction lier(ctx) qui reprend les données des autres notes de l'étude (voir Liens.resoudreLiens).
// Module pur (navigateur, node, tests).
const AnnexesAir = ((N) => {
  return {};
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = AnnexesAir;
