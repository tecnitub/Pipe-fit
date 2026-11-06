// Assemble l'interface d'Atelier PDF : les modules de pdf/src/app/ (dans l'ordre de leur numéro) partagent
// une même portée, comme un seul fichier (état, éditeur, aides communes).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DOSSIER = path.join(__dirname, 'src', 'app');
function assemblerApp() {
  const modules = fs.readdirSync(DOSSIER).filter(f => /^\d\d-.+\.js$/.test(f)).sort();
  const corps = modules.map(f => `  // ===== ${f} =====\n${fs.readFileSync(path.join(DOSSIER, f), 'utf8')}`).join('\n');
  return `// Atelier PDF : interface (vignettes, réorganisation, éditeur de page, enregistrement).
// Tout est traité dans le navigateur : pdf.js affiche les pages, pdf-lib (via MoteurPDF) produit le PDF final.
// Fichier assemblé depuis pdf/src/app/*.js par pdf/assembler-app.js.
(() => {
${corps}})();
`;
}
module.exports = { assemblerApp, DOSSIER };
