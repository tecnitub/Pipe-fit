// Mode d'emploi d'installation en page HTML autonome (lisible hors ligne, imprimable) à partir de docs/INSTALLATION.md.
//   node deploy/guide-html.js [source.md] [sortie.html] [--fragment]
// --fragment : sans <!doctype>/<html>/<head> (page publiée comme artifact, enveloppée à la publication).
// Markdown pris en charge : titres, paragraphes, listes (imbriquées, cases à cocher), blocs de code, tableaux,
// `code`, **gras**, *italique*, [liens](url).
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const fragment = process.argv.includes('--fragment');
const source = args[0] || path.join(__dirname, '..', 'docs', 'INSTALLATION.md');
const sortie = args[1] || path.join(__dirname, '..', 'docs', 'guide-installation.html');
const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ancre = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
function enLigne(t) {
  const codes = [];
  let s = esc(t).replace(/`([^`]+)`/g, (m, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codes[i]}</code>`);
}

const titres = [];
function blocs(lignes) {
  const out = [];
  let i = 0;
  const indent = l => l.match(/^ */)[0].length;
  while (i < lignes.length) {
    const l = lignes[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = /^```(\w*)/.exec(l.trim()))) {
      const base = indent(l), code = [];
      i++;
      while (i < lignes.length && !lignes[i].trim().startsWith('```')) { code.push(lignes[i].slice(Math.min(base, indent(lignes[i]) || base))); i++; }
      i++;
      out.push(`<div class="code"><pre><code${m[1] ? ` data-lang="${esc(m[1])}"` : ''}>${esc(code.join('\n'))}</code></pre></div>`);
      continue;
    }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) {
      const n = m[1].length, txt = m[2], id = ancre(txt);
      if (n === 2) titres.push({ id, txt });
      out.push(`<h${n} id="${id}">${enLigne(txt)}</h${n}>`);
      i++; continue;
    }
    if (/^\|/.test(l.trim())) {
      const rangs = [];
      while (i < lignes.length && /^\|/.test(lignes[i].trim())) { rangs.push(lignes[i].trim()); i++; }
      const cellules = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const tete = cellules(rangs[0]), corps = rangs.slice(2).map(cellules);
      out.push(`<div class="table"><table><thead><tr>${tete.map(c => `<th>${enLigne(c)}</th>`).join('')}</tr></thead><tbody>${corps.map(r => `<tr>${r.map(c => `<td>${enLigne(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if ((m = /^(\s*)([-*]|\d+\.)\s+/.exec(l))) {
      const ordonnee = /\d/.test(m[2]), base = indent(l), items = [];
      while (i < lignes.length) {
        const li = lignes[i], mm = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(li);
        if (!mm || indent(li) !== base || /\d/.test(mm[2]) !== ordonnee) break;
        const contenu = [mm[3]], retrait = mm[1].length + mm[2].length + 1;
        i++;
        while (i < lignes.length) {
          const s = lignes[i];
          if (!s.trim()) { const suite = lignes.slice(i + 1).find(x => x.trim()); if (suite && indent(suite) >= retrait) { contenu.push(''); i++; continue; } break; }
          if (indent(s) >= retrait) { contenu.push(s.slice(retrait)); i++; continue; }
          if (/^\s*([-*]|\d+\.)\s+/.test(s) || /^#|^\||^```/.test(s.trim())) break;
          contenu.push(s.trim()); i++;
        }
        items.push(contenu);
      }
      const html = items.map(c => {
        const coche = /^\[( |x)\]\s+/i.exec(c[0]);
        if (coche) {
          const id = `c-${ancre(c[0].slice(4)).slice(0, 40)}`;
          return `<li class="tache"><input type="checkbox" id="${id}" ${coche[1] !== ' ' ? 'checked' : ''}><label for="${id}">${enLigne(c[0].slice(4))}</label></li>`;
        }
        const premier = [], reste = [];
        let k = 0;
        while (k < c.length && c[k].trim() && !/^([-*]|\d+\.)\s+|^```/.test(c[k].trim())) premier.push(c[k++]);
        reste.push(...c.slice(k));
        return `<li>${enLigne(premier.join(' '))}${reste.length ? blocs(reste) : ''}</li>`;
      }).join('');
      out.push(ordonnee ? `<ol>${html}</ol>` : `<ul${/^\[/.test(items[0][0]) ? ' class="recette"' : ''}>${html}</ul>`);
      continue;
    }
    const para = [];
    while (i < lignes.length && lignes[i].trim() && !/^(#{1,3}\s|```|\||\s*([-*]|\d+\.)\s+)/.test(lignes[i].trim() === lignes[i] ? lignes[i] : lignes[i].trim())) { para.push(lignes[i].trim()); i++; }
    if (!para.length) { para.push(lignes[i].trim()); i++; }
    const txt = para.join(' ');
    out.push(txt.startsWith('✅') ? `<p class="verif"><span class="verif-mark" aria-hidden="true">✓</span><span><strong>Vérification</strong> ${enLigne(txt.replace(/^✅\s*/, ''))}</span></p>` : `<p>${enLigne(txt)}</p>`);
  }
  return out.join('\n');
}

const md = fs.readFileSync(source, 'utf8').replace(/\r/g, '');
const [premiere, ...suite] = md.split('\n');
const titre = premiere.replace(/^#\s+/, '');
const corps = blocs(suite);

const style = `
/* Guide d'atelier : sommaire fixe à gauche sur grand écran, colonne de lecture unique ; repères d'étapes et vérifications en marge */
:root {
  --bg: #f6f7f8; --surface: #ffffff; --fg: #1d2329; --muted: #5b6670; --line: #d9dee3; --accent: #9a3412; --accent-soft: #fbeee6; --ok: #166534; --ok-soft: #e8f5ec; --code-bg: #eef1f4;
  --f-titre: "Barlow Condensed", "Arial Narrow", system-ui, sans-serif; --f-texte: "Source Sans 3", "Segoe UI", system-ui, sans-serif; --f-code: "JetBrains Mono", Consolas, "Courier New", monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #12161a; --surface: #1a2026; --fg: #e4e8ec; --muted: #9aa5af; --line: #2c343c; --accent: #f08a5d; --accent-soft: #2a1d17; --ok: #6fcf8f; --ok-soft: #14261b; --code-bg: #20272e; color-scheme: dark } }
:root[data-theme="dark"] { --bg: #12161a; --surface: #1a2026; --fg: #e4e8ec; --muted: #9aa5af; --line: #2c343c; --accent: #f08a5d; --accent-soft: #2a1d17; --ok: #6fcf8f; --ok-soft: #14261b; --code-bg: #20272e; color-scheme: dark }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 var(--f-texte); }
.page { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 40px; max-width: 1180px; margin: 0 auto;
  padding-block: 32px 64px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
nav.sommaire { position: sticky; top: calc(16px + env(safe-area-inset-top, 0px)); align-self: start; font-size: 14px; }
nav.sommaire .marque { font: 600 13px/1 var(--f-titre); letter-spacing: .12em; text-transform: uppercase; color: var(--accent); margin-bottom: 12px; }
nav.sommaire ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
nav.sommaire a { display: block; padding: 5px 10px; border-radius: 4px; color: var(--muted); text-decoration: none; border-left: 2px solid transparent; }
nav.sommaire a:hover, nav.sommaire a:focus-visible { color: var(--fg); background: var(--surface); border-left-color: var(--accent); outline: none; }
main { min-width: 0; max-width: 760px; }
header.titre { border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 8px; }
header.titre .surtitre { font: 600 13px/1 var(--f-titre); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
h1 { font: 700 clamp(30px, 5vw, 44px)/1.05 var(--f-titre); margin: 8px 0 0; text-wrap: balance; letter-spacing: -.01em; }
h2 { font: 700 28px/1.15 var(--f-titre); margin: 56px 0 12px; padding-top: 16px; border-top: 3px solid var(--fg); text-wrap: balance; scroll-margin-top: 16px; }
h3 { font: 600 19px/1.3 var(--f-texte); margin: 28px 0 8px; }
p, li { max-width: 68ch; }
a { color: var(--accent); }
ul, ol { padding-left: 1.4em; margin: 8px 0 14px; }
li { margin: 4px 0; }
li > ul, li > ol { margin: 6px 0; }
main > ol > li::marker { font: 700 16px var(--f-titre); color: var(--accent); }
code { font: .86em var(--f-code); background: var(--code-bg); padding: .1em .35em; border-radius: 3px; overflow-wrap: anywhere; }
.code { overflow-x: auto; margin: 10px 0 16px; background: var(--code-bg); border: 1px solid var(--line); border-radius: 6px; }
.code pre { margin: 0; padding: 12px 14px; }
.code code { background: none; padding: 0; font-size: 13.5px; line-height: 1.5; overflow-wrap: normal; white-space: pre; }
.table { overflow-x: auto; margin: 12px 0 18px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
table { border-collapse: collapse; width: 100%; font-size: 14.5px; }
th, td { text-align: left; vertical-align: top; padding: 8px 12px; border-bottom: 1px solid var(--line); }
th { font: 600 12.5px/1.3 var(--f-texte); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); background: var(--bg); }
tr:last-child td { border-bottom: 0; }
.verif { display: flex; gap: 10px; align-items: flex-start; background: var(--ok-soft); border: 1px solid color-mix(in srgb, var(--ok) 35%, transparent); border-radius: 6px; padding: 10px 14px; max-width: 68ch; }
.verif-mark { flex: none; width: 22px; height: 22px; border-radius: 50%; background: var(--ok); color: var(--surface); display: grid; place-items: center; font-weight: 700; font-size: 13px; margin-top: 2px; }
.verif > span > strong:first-child { color: var(--ok); margin-right: 4px; }
ul.recette { list-style: none; padding: 0; display: grid; gap: 6px; }
li.tache { display: flex; gap: 10px; align-items: flex-start; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 8px 12px; margin: 0; }
li.tache input { width: 18px; height: 18px; margin-top: 3px; accent-color: var(--accent); flex: none; }
li.tache input:checked + label { color: var(--muted); text-decoration: line-through; }
.progression { font-size: 14px; color: var(--muted); margin: 0 0 8px; }
footer { margin-top: 56px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
@media (max-width: 860px) {
  .page { grid-template-columns: minmax(0, 1fr); gap: 16px; padding-block: 20px 48px; }
  nav.sommaire { position: static; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 12px; }
  nav.sommaire ol { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
}
@media print { nav.sommaire { display: none; } .page { display: block; } h2 { break-before: page; } .code, .table, .verif { break-inside: avoid; } }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
`;
const script = `
// Liste de recette : cases cochées gardées sur ce navigateur, avancement affiché
(() => {
  const cases = [...document.querySelectorAll('li.tache input')], liste = document.querySelector('ul.recette');
  if (!cases.length || !liste) return;
  const cle = 'pipefit-guide-recette';
  let etat = {};
  try { etat = JSON.parse(localStorage.getItem(cle) || '{}') || {}; } catch (e) { etat = {}; }
  const prog = document.createElement('p'); prog.className = 'progression'; liste.before(prog);
  const maj = () => { prog.textContent = cases.filter(c => c.checked).length + ' / ' + cases.length + ' points validés'; };
  cases.forEach(c => { if (etat[c.id]) c.checked = true; c.addEventListener('change', () => { etat[c.id] = c.checked; try { localStorage.setItem(cle, JSON.stringify(etat)); } catch (e) {} maj(); }); });
  maj();
})();
`;
const tete = `<title>Installation Pipe-Fit</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Mode d'emploi pas à pas : serveur, appli des compagnons, e-mails Microsoft 365, répertoire réseau et sauvegardes.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=JetBrains+Mono:wght@400&family=Source+Sans+3:wght@400;600&display=swap">
<style>${style}</style>`;
const contenu = `<div class="page">
<nav class="sommaire" aria-label="Sommaire"><div class="marque">Pipe-Fit · installation</div><ol>${titres.map(t => `<li><a href="#${t.id}">${enLigne(t.txt)}</a></li>`).join('')}</ol></nav>
<main>
<header class="titre"><div class="surtitre">Pack de déploiement · version ${esc(version)}</div><h1>${enLigne(titre)}</h1></header>
${corps}
<footer>Pipe-Fit CRM ${esc(version)} · généré depuis docs/INSTALLATION.md</footer>
</main></div>
<script>${script}</script>`;
const html = fragment ? `${tete}\n${contenu}\n`
  : `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${tete}\n</head>\n<body>\n${contenu}\n</body>\n</html>\n`;
fs.mkdirSync(path.dirname(sortie), { recursive: true });
fs.writeFileSync(sortie, html);
console.log(`Guide : ${sortie} (${Math.round(html.length / 1024)} Ko)`);
