// Construit la démonstration de l'application DOE en un seul fichier HTML (sans serveur), avec les chantiers de démo de Pipe-Fit.
// Usage : node doe/build-demo.js [fichier-de-sortie] [--crm <clé localStorage de la démo CRM> <lien vers la démo CRM>]
//   (défaut : dist/pipefit-doe-demo.html ; avec --crm, elle reprend les chantiers et le compte de la démo du CRM)
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2), iCrm = args.indexOf('--crm');
const crm = iCrm >= 0 ? { cle: args[iCrm + 1], lien: args[iCrm + 2] } : null;
const out = path.resolve((iCrm === 0 ? null : args[0]) || path.join(root, 'dist', 'pipefit-doe-demo.html'));
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
// U+FFFD (présent dans pdf-lib, toujours dans des chaînes) est écrit en séquence d'échappement
const inlineScript = code => `<script>\n${code.replace(/<\/script/gi, '<\\/script').replace(/\uFFFD/g, '\\uFFFD')}\n</script>`;
const logo = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'public', 'logo-tecnitub.png')).toString('base64')}`;
const avecLogo = s => s.replace(/(["'])logo-tecnitub\.png\1/g, `$1${logo}$1`);

const html = read('doe/public/index.html');
const body = html.slice(html.indexOf('>', html.indexOf('<body')) + 1, html.indexOf('</body>'));
const scripts = [...body.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const fichier = s => (s.startsWith('shared/') ? `public/js/${s.slice(7)}` : path.join('doe/public', s));
const markup = body.replace(/<script src="[^"]+"><\/script>\s*/g, '').trim()
  .replace('<div class="session">', `<div class="bandeau-demo">${crm ? 'Démo reliée à la démo du CRM : mêmes chantiers, même compte' : 'Démo — comptes : jacky, claire ou admin (mot de passe libre)'}</div><div class="session">`);

const page = [
  '<title>Pipe-Fit DOE</title>',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  `<link rel="icon" href="${logo}">`,
  `<style>\n${read('doe/public/css/doe.css')}\n.bandeau-demo { font-size: 12px; background: #fde68a; color: #713f12; padding: 3px 10px; border-radius: 6px; }\n</style>`,
  avecLogo(markup),
  inlineScript("document.body.classList.add('deconnecte');"),
  ...(crm ? [inlineScript(`window.PIPEFIT_CRM_KEY = ${JSON.stringify(crm.cle)}; window.PIPEFIT_CRM_URL = ${JSON.stringify(crm.lien)};`)] : []),
  inlineScript(read('server/demo-images.js')),
  inlineScript(`window.DemoSeed = (function (module) {\n${read('server/demo.js')}\nreturn module.exports;\n})({});`),
  inlineScript(read('doe/config-defaut.js')),
  inlineScript(read('doe/demo-backend.js')),
  ...scripts.map(s => inlineScript(avecLogo(read(fichier(s))))),
].join('\n');

fs.mkdirSync(path.dirname(out), { recursive: true });
// Reliée au CRM, elle est publiée à côté de sa page comme fichier servi tel quel : document HTML complet
fs.writeFileSync(out, crm ? `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n</head>\n<body>\n${page}\n</body>\n</html>\n` : page);
console.log(`Démo DOE : ${out} (${Math.round(fs.statSync(out).size / 1024)} Ko)`);
