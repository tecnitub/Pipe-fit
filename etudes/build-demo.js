// Construit la démonstration de l'application Études en un seul fichier HTML (sans serveur), avec les affaires de démo de Pipe-Fit.
// Usage : node etudes/build-demo.js [fichier-de-sortie] [--crm <clé localStorage de la démo CRM>]
//   (défaut : dist/pipefit-etudes-demo.html ; avec --crm, elle reprend les affaires et le compte de la démo du CRM, ouverte
//   dans un cadre de sa page : devis, notes de calcul et état des études y sont enregistrés)
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2), iCrm = args.indexOf('--crm'), cleCrm = iCrm >= 0 ? args[iCrm + 1] : '';
const out = path.resolve((iCrm === 0 ? null : args[0]) || path.join(root, 'dist', 'pipefit-etudes-demo.html'));
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
// U+FFFD (présent dans pdf-lib, toujours dans des chaînes) est écrit en séquence d'échappement
const inlineScript = code => `<script>\n${code.replace(/<\/script/gi, '<\\/script').replace(/\uFFFD/g, '\\uFFFD')}\n</script>`;
const logo = `data:image/png;base64,${fs.readFileSync(path.join(root, 'doe', 'public', 'logo-tecnitub.png')).toString('base64')}`;
const avecLogo = s => s.replace(/(["'])logo-tecnitub\.png\1/g, `$1${logo}$1`);
// Fichiers partagés servis par le serveur Études (voir PARTAGES dans etudes/server.js)
const PARTAGES = { 'shared/pdf.js': 'public/js/pdf.js', 'shared/pdf-lib.min.js': 'doe/public/vendor/pdf-lib-1.17.1.min.js',
  ...Object.fromEntries(['pdf-lecture.js', 'cctp-lecture.js', 'xlsx.js', 'inventaire-cvc.js', 'materiel-retenu.js'].map(f => [`shared/${f}`, `public/js/${f}`])) };

const html = read('etudes/public/index.html');
const body = html.slice(html.indexOf('>', html.indexOf('<body')) + 1, html.indexOf('</body>'));
const scripts = [...body.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const markup = body.replace(/<script src="[^"]+"><\/script>\s*/g, '').trim()
  .replace('<div class="session">', `<div class="bandeau-demo">${cleCrm ? 'Démo reliée à la démo du CRM : mêmes affaires, même compte' : 'Démo — comptes : jacky, claire ou admin (mot de passe libre)'}</div><div class="session">`);

const page = [
  '<title>Pipe-Fit Études</title>',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  `<link rel="icon" href="${logo}">`,
  `<style>\n${read('doe/public/css/doe.css')}\n${read('etudes/public/css/etudes.css')}\n.bandeau-demo { font-size: 12px; background: #fde68a; color: #713f12; padding: 3px 10px; border-radius: 6px; }\n</style>`,
  avecLogo(markup),
  inlineScript("document.body.classList.add('deconnecte');"),
  ...(cleCrm ? [inlineScript(`window.PIPEFIT_CRM_KEY = ${JSON.stringify(cleCrm)};`)] : []),
  inlineScript(read('server/demo-images.js')),
  inlineScript(`window.DemoSeed = (function (module) {\n${read('server/demo.js')}\nreturn module.exports;\n})({});`),
  inlineScript(read('doe/config-defaut.js')),
  inlineScript(read('etudes/rex.js')),
  inlineScript(read('etudes/demo-backend.js')),
  ...scripts.map(s => inlineScript(avecLogo(read(PARTAGES[s] || path.join('etudes/public', s))))),
].join('\n');

fs.mkdirSync(path.dirname(out), { recursive: true });
// Lecteur de PDF (lecture du CCTP et du DPGF) : publié à côté de la page, dans vendor/pdfjs/
const pdfDir = path.join(path.dirname(out), 'vendor', 'pdfjs');
fs.mkdirSync(pdfDir, { recursive: true });
['pdf.min.js', 'pdf.worker.min.js'].forEach(f => fs.copyFileSync(path.join(root, 'public/vendor/pdfjs', f), path.join(pdfDir, f)));
// Reliée au CRM, elle est publiée à côté de sa page comme fichier servi tel quel : document HTML complet
fs.writeFileSync(out, cleCrm ? `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n</head>\n<body>\n${page}\n</body>\n</html>\n` : page);
console.log(`Démo Études : ${out} (${Math.round(fs.statSync(out).size / 1024)} Ko)`);
