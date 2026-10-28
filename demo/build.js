// Construit la version de démonstration en un seul fichier HTML (sans serveur).
// Usage : node demo/build.js [fichier-de-sortie] [--lien <adresse de la page publiée>]   (défaut : dist/pipefit-crm-demo.html)
// L'application DOE est construite à côté (doe.html), reliée à cette démo : mêmes chantiers, même compte.
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
  ...scripts.map(s => inlineScript(read(path.join('public', s)))),
].join('\n');

// Le faux serveur doit être chargé avant l'application (après ui.js pour les dialogues).
const withBackend = (inlineScript("window.OCR_MODELE_JS = 'fra-traineddata.js';") + '\n' + page).replace(inlineScript(read('public/js/store.js')),
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
fs.writeFileSync(out, withBackend);
// Application DOE de démonstration, ouverte par l'onglet « DOE » des chantiers
const cle = /const KEY = '([^']+)'/.exec(read('demo/backend.js'))[1];
require('node:child_process').execFileSync(process.execPath, [path.join(root, 'doe/build-demo.js'), path.join(path.dirname(out), 'doe.html'), '--crm', cle, `${lienCrm}#/chantiers`], { stdio: 'inherit' });
console.log(`Démo : ${out} (${Math.round(withBackend.length / 1024)} Ko)`);
