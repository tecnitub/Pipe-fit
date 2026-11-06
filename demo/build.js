// Construit la version de démonstration en un seul fichier HTML (sans serveur).
// Usage : node demo/build.js [fichier-de-sortie] [--lien <adresse de la page publiée>]   (défaut : dist/pipefit-crm-demo.html)
// Les applications DOE et Études sont construites à côté (doe.html, etudes.html), reliées à cette démo : mêmes chantiers, même compte.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2), iLien = args.indexOf('--lien');
const out = path.resolve((iLien === 0 ? null : args[0]) || path.join(root, 'dist', 'pipefit-crm-demo.html'));
const lienCrm = iLien >= 0 ? args[iLien + 1] : path.basename(out);
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const inlineScript = code => `<script>\n${code.replace(/<\/script/gi, '<\\/script')}\n</script>`;

const html = read('public/index.html');
const body = html.slice(html.indexOf('>', html.indexOf('<body')) + 1, html.indexOf('</body>'));
const scripts = [...body.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const markup = body.replace(/<script src="[^"]+"><\/script>\s*/g, '').trim();

const page = [
  '<title>Pipe-Fit CRM</title>',
  // Téléphone : largeur réelle de l'écran (sinon la page s'affiche comme sur un ordinateur, en tout petit)
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  `<style>\n${read('public/css/style.css')}\n</style>`,
  markup,
  inlineScript("document.body.classList.add('logged-out');"),
  // Données de démo isolées dans leur propre portée (mêmes noms de fonctions que l'application)
  inlineScript(read('server/demo-images.js')),
  inlineScript(`window.DemoSeed = (function (module) {\n${read('server/demo.js')}\nreturn module.exports;\n})({});`),
  ...scripts.map(s => inlineScript(read(s.startsWith('js/etudes/') ? path.join('etudes/public/js', s.slice(10)) : path.join('public', s)))),
].join('\n');

// Étude d'exemple reliée au premier chantier : ses points de mise en service (équipements, épreuves, contrôles) sont
// calculés ici et placés dans la démonstration, pour que la liste des mises en service du chantier soit remplie d'emblée
const lienEtudeDemo = (() => {
  try {
    const J = m => require(path.join(root, 'etudes/public/js', m));
    const N = J('notes'); void N;
    [['cta'], ['industriel'], ['terminaux', 'Terminaux'], ['schema', 'Schema'], ['equilibrage'], ['aeraulique-schema'], ['sanitaire', 'Sanitaire'], ['evacuation'], ['desenfumage'], ['pieces', 'Pieces'], ['gaz-reseau'], ['regulation', 'Regulation'], ['electricite']]
      .forEach(([m, g]) => { const x = J(m); if (g) global[g] = x; });
    const L = J('liens'), PM = J('points-mes'), seed = require(path.join(root, 'server/demo.js')).demoData();
    const af = (seed.affaires || []).find(a => a.type !== 'horsDevis') || {}, client = ((seed.entreprises || []).find(e => e.id === af.clientId) || {}).nom || '';
    const et = require(path.join(root, 'etudes/demo-exemple.js'))({ affaireId: af.id, client });
    // Armoire de l'étude : équipements repris des calculs (comme à l'ouverture du calcul dans l'application)
    const E = J('electricite'); et.notes.filter(n => n.type === 'elec').forEach(n => { n.entrees.equipements = E.fusionner([], E.equipementsEtude(et, L), new Set(et.notes.map(x => x.id))).lignes; });
    const mes = PM.extraire(et, n => L.calculer(et, n));
    return { app: 'etudes', id: et.id, affaireId: af.id || '', devisId: '', clientId: af.clientId || '', par: et.auteur, relie: null,
      resume: { objet: et.objet, client, indice: et.indice, date: et.date, auteur: et.auteur, notes: [], erreurs: 0, attention: 0, equipements: [], materiel: [], debits: PM.debits(et, L), mes, regulation: J('regulation').pourDoe(et, L), devis: [] } };
  } catch (e) { console.warn(`Étude d'exemple non reliée à la démonstration : ${e.message}`); return null; }
})();
// Le faux serveur doit être chargé avant l'application (après ui.js pour les dialogues).
const withBackend = (inlineScript(`window.OCR_MODELE_JS = 'fra-traineddata.js'; window.DEMO_LIEN_ETUDE = ${JSON.stringify(lienEtudeDemo).replace(/</g, '\\u003c')};`) + '\n' + page).replace(inlineScript(read('public/js/store.js')),
  inlineScript(read('demo/assistant-simule.js')) + '\n' + inlineScript(read('demo/backend.js')) + '\n' + inlineScript(read('public/js/store.js')));

// Lecture des tickets (OCR) : fichiers publiés à côté de la page dans vendor/tesseract/ ; le modèle .gz, que l'hébergement
// de la démo ne sert pas, devient un script (window.OCR_MODELE_B64)
const ocrDir = path.join(path.dirname(out), 'vendor', 'tesseract');
fs.mkdirSync(ocrDir, { recursive: true });
['tesseract.min.js', 'worker.min.js', 'tesseract-core-simd-lstm.wasm.js'].forEach(f => fs.copyFileSync(path.join(root, 'public/vendor/tesseract', f), path.join(ocrDir, f)));
fs.writeFileSync(path.join(ocrDir, 'fra-traineddata.js'), `window.OCR_MODELE_B64 = '${fs.readFileSync(path.join(root, 'public/vendor/tesseract/fra.traineddata.gz')).toString('base64')}';\n`);

// Lecture des offres et devis fournisseurs (pdf.js) : publiés à côté de la page dans vendor/pdfjs/
const pdfDir = path.join(path.dirname(out), 'vendor', 'pdfjs');
fs.mkdirSync(pdfDir, { recursive: true });
['pdf.min.js', 'pdf.worker.min.js'].forEach(f => fs.copyFileSync(path.join(root, 'public/vendor/pdfjs', f), path.join(pdfDir, f)));

fs.mkdirSync(path.dirname(out), { recursive: true });
// Encodage déclaré en tête : la page ouverte en fichier local (ou servie sans en-tête) reste lue en UTF-8
fs.writeFileSync(out, `<meta charset="utf-8">\n${withBackend}`);
// Application DOE de démonstration, ouverte par l'onglet « DOE » des chantiers
const cle = /const KEY = '([^']+)'/.exec(read('demo/backend.js'))[1];
require('node:child_process').execFileSync(process.execPath, [path.join(root, 'doe/build-demo.js'), path.join(path.dirname(out), 'doe.html'), '--crm', cle, `${lienCrm}#/chantiers`], { stdio: 'inherit' });
// Application Études de démonstration, ouverte par l'onglet « Études » des chantiers
require('node:child_process').execFileSync(process.execPath, [path.join(root, 'etudes/build-demo.js'), path.join(path.dirname(out), 'etudes.html'), '--crm', cle], { stdio: 'inherit' });
console.log(`Démo : ${out} (${Math.round(withBackend.length / 1024)} Ko)`);
