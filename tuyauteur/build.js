// Construit dist/Tuyauteur.html : le logiciel complet en un seul fichier, utilisable hors ligne
// (double-clic sur un PC, ou ouverture sur une tablette / un téléphone). Usage : node tuyauteur/build.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const racine = path.join(__dirname, '..');
const src = path.join(__dirname, 'src');
const lire = f => fs.readFileSync(f, 'utf8');
const sur = js => js.replace(/<\/script/gi, '<\\/script');
const version = lire(path.join(__dirname, 'VERSION')).trim();

let html = lire(path.join(src, 'index.html'));
html = html.replace('<link rel="stylesheet" href="app.css">', () => `<style>\n${lire(path.join(src, 'app.css'))}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => `<script>\n${sur(lire(path.resolve(src, f)))}\n</script>`);
html = html.replace('<title>Pipe-Fit Tuyauteur</title>', `<title>Pipe-Fit Tuyauteur</title>\n<meta name="generator" content="Pipe-Fit Tuyauteur ${version}">`);
html = html.replace('<span>Pipe-Fit Tuyauteur</span>', `<span>Pipe-Fit Tuyauteur</span><small style="font-weight:400;font-size:11px;opacity:.6">${version}</small>`);
if (/<script src=|<link rel="stylesheet"/.test(html)) throw new Error('Ressource externe restante dans la page');

const dist = path.join(racine, 'dist');
fs.mkdirSync(dist, { recursive: true });
const sortie = path.join(dist, 'Tuyauteur.html');
fs.writeFileSync(sortie, html);
console.log(`${path.relative(racine, sortie)} (${(html.length / 1024).toFixed(0)} ko, version ${version})`);
