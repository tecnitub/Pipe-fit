// Construit dist/StudioDiaporama.html : l'application avec ses polices intégrées (fonctionne sans connexion).
// Usage : node diaporama/build.js
'use strict';
const fs = require('fs');
const path = require('path');

const racine = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const version = fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf8').trim();
// Un navigateur récent reçoit des polices woff2
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function telecharger(url, binaire) {
  for (let essai = 1; ; essai++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return binaire ? Buffer.from(await r.arrayBuffer()) : await r.text();
    } catch (e) {
      if (essai >= 4) throw new Error(`Téléchargement impossible : ${url} (${e.message})`);
      await new Promise(f => setTimeout(f, 1000 * essai));
    }
  }
}

(async () => {
  const lien = source.match(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)">/);
  if (!lien) throw new Error('Lien Google Fonts introuvable dans index.html');
  const css = await telecharger(lien[1].replace(/&amp;/g, '&'));
  // On ne garde que les jeux de caractères latins (français compris)
  const blocs = css.split(/(?=\/\* [a-z-]+ \*\/)/).filter(b => /^\/\* (latin|latin-ext) \*\//.test(b));
  let sortie = '', octets = 0;
  for (const b of blocs) {
    let bloc = b;
    for (const [, url] of b.matchAll(/url\((https:[^)]+)\)/g)) {
      const donnees = await telecharger(url, true);
      octets += donnees.length;
      bloc = bloc.replace(url, 'data:font/woff2;base64,' + donnees.toString('base64'));
    }
    sortie += bloc;
  }
  let html = source
    .replace(/<link rel="preconnect"[^>]*>\n?/, '')
    .replace(lien[0], `<style>/* Polices intégrées (Google Fonts, licences libres SIL OFL / Apache) */\n${sortie}</style>`)
    .replace('<title>Studio Diaporama</title>', `<title>Studio Diaporama</title>\n<meta name="version" content="${version}">`);
  fs.mkdirSync(path.join(racine, 'dist'), { recursive: true });
  const cible = path.join(racine, 'dist', 'StudioDiaporama.html');
  fs.writeFileSync(cible, html);
  console.log(`dist/StudioDiaporama.html ${version} : ${blocs.length} polices (${(octets / 1048576).toFixed(1)} Mo), ${(html.length / 1048576).toFixed(1)} Mo au total`);
})().catch(e => { console.error(e.message); process.exit(1); });
