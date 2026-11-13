// Construit la démonstration de la boutique sans serveur : deux pages autonomes (boutique + administration) qui partagent
// le stockage de l'appareil. Commandes et devis simulés par boutique/demo-backend.js : rien n'est envoyé.
// Usage : node boutique/build-demo.js [dossier-de-sortie]   (défaut : dist/boutique-demo)
const fs = require('node:fs');
const path = require('node:path');

const ici = __dirname;
const sortie = path.resolve(process.argv[2] || path.join(ici, '..', 'dist', 'boutique-demo'));
const lire = f => fs.readFileSync(path.join(ici, f), 'utf8');
const script = code => `<script>\n${code.replace(/<\/script/gi, '<\\/script')}\n</script>`;
const logo = `data:image/png;base64,${fs.readFileSync(path.join(ici, '..', 'doe', 'public', 'logo-tecnitub.png')).toString('base64')}`;
const avecLogo = s => s.replace(/(["'])logo-tecnitub\.png\1/g, `$1${logo}$1`);
const corps = html => html.slice(html.indexOf('>', html.indexOf('<body')) + 1, html.indexOf('</body>')).replace(/<script src="[^"]+"><\/script>\s*/g, '').trim();

// Bandeau de démonstration et ajustements pour l'affichage dans claude.ai (encoches de téléphone)
const styleDemo = `
.bandeau-demo { background: #fde68a; color: #713f12; font-size: .82rem; padding: 7px 16px; display: flex; gap: 8px 14px; flex-wrap: wrap; justify-content: center; align-items: center; text-align: center; }
.bandeau-demo a, .bandeau-demo button { color: #713f12; font: inherit; font-weight: 700; background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; }
.entete { top: env(safe-area-inset-top, 0px); }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 30; background: #fff; }
.toast { bottom: calc(24px + env(safe-area-inset-bottom, 0px)); }`;
const bandeau = lien => `<div class="bandeau-demo"><span>Démonstration : commandes et devis restent sur cet appareil, rien n'est envoyé.</span>${lien}<button type="button" data-demo="reinitialiser">Remettre à zéro</button></div>`;
const reinit = `document.addEventListener('click', e => { if (e.target.closest('[data-demo="reinitialiser"]')) { window.DemoBoutique.reinitialiser(); try { localStorage.removeItem('tecnitub-panier'); localStorage.removeItem('tecnitub-derniere'); } catch (er) {} location.reload(); } });`;

// Page boutique (contenu seul : la page d'accueil de l'artefact reçoit son squelette HTML à la publication)
const boutique = [
  '<title>Boutique TECNITUB démo</title>',
  `<link rel="icon" href="${logo}">`,
  `<style>\n${lire('public/css/boutique.css')}\n${styleDemo}\n</style>`,
  bandeau('<a href="admin.html">Ouvrir l\'administration</a>'),
  avecLogo(corps(lire('public/index.html'))),
  script(lire('catalogue.js')),
  script(lire('demo-backend.js')),
  script(reinit),
  script(lire('public/js/dessins.js')),
  script(lire('public/js/boutique.js')),
].join('\n');

// Page d'administration : document complet (servi tel quel à côté de la page boutique)
const admin = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Administration TECNITUB démo</title>
<link rel="icon" href="${logo}">
<style>\n${lire('public/css/boutique.css')}\n${lire('public/css/admin.css')}\n${styleDemo}\nbody { margin: 0; }\n</style>
</head>
<body class="admin">
${bandeau('<a href="#" data-retour>Retour à la boutique</a><span>Mot de passe : au choix.</span>')}
${avecLogo(corps(lire('public/admin.html'))).replace('<a href="./" class="marque">', '<a href="#" class="marque" data-retour>')}
${script(lire('catalogue.js'))}
${script(lire('demo-backend.js'))}
${script(reinit + "\ndocument.addEventListener('click', e => { if (e.target.closest('[data-retour]')) { e.preventDefault(); history.length > 1 ? history.back() : (location.href = './'); } });")}
${script(lire('public/js/admin.js').replace(/<a href="api\/admin\/fichiers\/\$\{esc\(f\.id\)\}" download>\$\{esc\(f\.nom\)\}<\/a>/, '${esc(f.nom)}'))}
</body>
</html>`;

fs.mkdirSync(sortie, { recursive: true });
fs.writeFileSync(path.join(sortie, 'index.html'), boutique);
fs.writeFileSync(path.join(sortie, 'admin.html'), admin);
for (const f of ['index.html', 'admin.html']) console.log(`Démo boutique : ${path.join(sortie, f)} (${Math.round(fs.statSync(path.join(sortie, f)).size / 1024)} Ko)`);
