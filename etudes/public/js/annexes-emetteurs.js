// Calculs annexes — Émetteurs et terminaux : plancher chauffant/rafraîchissant, radiateurs, plafonds rayonnants / poutres froides, échangeur à plaques.
// Rangés à part dans l'étude (famille « Calculs annexes », thème « Émetteurs et terminaux ») ; chaque type déclare annexe: true, theme,
// et sa fonction lier(ctx) qui reprend les données des autres notes de l'étude (voir Liens.resoudreLiens).
// Module pur (navigateur, node, tests).
const AnnexesEmetteurs = ((N) => {
  return {};
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = AnnexesEmetteurs;
