// Calculs annexes — Production et énergie : conduit de fumée, PAC géothermique sur sondes, solaire thermique ECS, consommation annuelle et coût global, aides CEE.
// Rangés à part dans l'étude (famille « Calculs annexes », thème « Production et énergie ») ; chaque type déclare annexe: true, theme,
// et sa fonction lier(ctx) qui reprend les données des autres notes de l'étude (voir Liens.resoudreLiens).
// Module pur (navigateur, node, tests).
const AnnexesEnergie = ((N) => {
  return {};
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = AnnexesEnergie;
