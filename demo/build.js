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
  inlineScript(`window.DemoSeed = (function (module) {\n${read('server/demo.js')}\nreturn module.exports;\n})({});`),
  ...scripts.map(s => inlineScript(read(path.join('public', s)))),
].join('\n');

// Le faux serveur doit être chargé avant l'application (après ui.js pour les dialogues).
const withBackend = page.replace(inlineScript(read('public/js/store.js')),
  inlineScript(read('demo/backend.js')) + '\n' + inlineScript(read('public/js/store.js')));

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, withBackend);
console.log(`Démo : ${out} (${Math.round(withBackend.length / 1024)} Ko)`);
