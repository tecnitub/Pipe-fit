// Construit dist/AtelierPDF.html : Atelier PDF en un seul fichier, utilisable hors ligne
// (double-clic, ou fenêtre d'application Edge installée par installer/build-pdf.sh).
// Usage : node pdf/build.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const racine = path.join(__dirname, '..');
const src = path.join(__dirname, 'src');
const tess = path.join(racine, 'public/vendor/tesseract');
const lire = f => fs.readFileSync(f, 'utf8');
// Un « </script » dans du code inséré fermerait la balise : neutralisé
const sur = js => js.replace(/<\/script/gi, '<\\/script');

const version = lire(path.join(__dirname, 'VERSION')).trim();
let html = lire(path.join(src, 'index.html'));

html = html.replace('<link rel="stylesheet" href="app.css">', () => `<style>\n${lire(path.join(src, 'app.css'))}</style>`);
html = html.replace(/<script src="([^"]+)"( data-worker)?><\/script>/g, (_, fichier, worker) => {
  const contenu = lire(path.resolve(src, fichier));
  if (worker) return `<script>window.PDFJS_WORKER_SRC = ${sur(JSON.stringify(contenu))};</script>`;
  // Lecture de texte (OCR) : moteur Tesseract, son worker et le modèle français inclus dans la page
  const ocr = path.basename(fichier) === 'ocr.js' ? `<script>window.TESS_SRC = ${sur(JSON.stringify({
    coeur: lire(path.join(tess, 'tesseract-core-simd-lstm.wasm.js')),
    worker: lire(path.join(tess, 'worker.min.js')),
    fra: fs.readFileSync(path.join(tess, 'fra.traineddata.gz')).toString('base64'),
  }))};</script>\n` : '';
  return `${ocr}<script>\n${sur(contenu)}\n</script>`;
});
const icone = fs.readFileSync(path.join(racine, 'installer/files/atelier-pdf.ico')).toString('base64');
html = html.replace('<title>Atelier PDF</title>', `<title>Atelier PDF</title>\n<meta name="generator" content="Atelier PDF ${version}">\n<link rel="icon" href="data:image/x-icon;base64,${icone}">`);
html = html.replace('<span>Atelier PDF</span>', `<span>Atelier PDF</span><small class="version">${version}</small>`);
html = html.replace('</style>', '.version { font-weight: 400; font-size: 11px; opacity: .6; }\n</style>');

if (/<script src=|<link rel="stylesheet"/.test(html)) throw new Error('Ressource externe restante dans la page');

const dist = path.join(racine, 'dist');
fs.mkdirSync(dist, { recursive: true });
const sortie = path.join(dist, 'AtelierPDF.html');
fs.writeFileSync(sortie, html);
console.log(`${path.relative(racine, sortie)} (${(html.length / 1048576).toFixed(1)} Mo, version ${version})`);
