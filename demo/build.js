// Construit la version de démonstration en un seul fichier HTML (sans serveur).
// Usage : node demo/build.js [fichier-de-sortie]   (défaut : dist/pipefit-crm-demo.html)
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'dist', 'pipefit-crm-demo.html'));
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const inlineScript = code => `<script>\n${code.replace(/<\/script/gi, '<\\/script')}\n</script>`;

const html = read('public/index.html');
const body = html.slice(html.indexOf('>', html.indexOf('<body')) + 1, html.indexOf('</body>'));
const scripts = [...body.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const markup = body.replace(/<script src="[^"]+"><\/script>\s*/g, '').trim();

const page = [
  '<title>Pipe-Fit CRM</title>',
  `<style>\n${read('public/css/style.css')}\n</style>`,
  markup,
  inlineScript("document.body.classList.add('logged-out');"),
  // Données de démo isolées dans leur propre portée (mêmes noms de fonctions que l'application)
  inlineScript(read('server/demo-images.js')),
  inlineScript(`window.DemoSeed = (function (module) {\n${read('server/demo.js')}\nreturn module.exports;\n})({});`),
  ...scripts.map(s => inlineScript(read(s.startsWith('js/etudes/') ? path.join('etudes/public/js', s.slice(10)) : path.join('public', s)))),
].join('\n');

// Le faux serveur doit être chargé avant l'application (après ui.js pour les dialogues).
const withBackend = (inlineScript("window.OCR_MODELE_JS = 'fra-traineddata.js';") + '\n' + page).replace(inlineScript(read('public/js/store.js')),
  inlineScript(read('demo/backend.js')) + '\n' + inlineScript(read('public/js/store.js')));

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
console.log(`Démo : ${out} (${Math.round(withBackend.length / 1024)} Ko)`);
