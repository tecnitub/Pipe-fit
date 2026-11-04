// Contrôle d'un pack de déploiement avant envoi au service informatique :
//  1. contenu : version, installateur Windows, serveurs, dépendances, tous les scripts des pages, pas de données ni de secrets ;
//  2. installation à blanc : le pack est décompressé dans un dossier temporaire et les trois serveurs (CRM, DOE, Études)
//     y sont démarrés sur des ports libres avec des bases neuves ; chaque page d'accueil et chaque script doit répondre ;
//  3. mise à jour : une base d'Études d'une version précédente (calculs incomplets, liens rompus) est relue.
// Usage : node deploy/verifier-pack.js [dist/PipeFit-Pack-x.y.z.zip] [--sans-demarrage]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { execFileSync, spawn } = require('node:child_process');

const racine = path.join(__dirname, '..');
const version = require(path.join(racine, 'package.json')).version;
const args = process.argv.slice(2), zip = path.resolve(args.find(a => !a.startsWith('--')) || path.join(racine, 'dist', `PipeFit-Pack-${version}.zip`));
const erreurs = [], ok = m => console.log(`  ✓ ${m}`), ko = m => { erreurs.push(m); console.log(`  ✗ ${m}`); };

if (!fs.existsSync(zip)) { console.error(`Pack introuvable : ${zip} (bash installer/build.sh && bash deploy/pack.sh)`); process.exit(1); }
console.log(`Pack ${path.basename(zip)}`);
const nom = path.basename(zip, '.zip');
if (nom !== `PipeFit-Pack-${version}`) ko(`nom du pack (${nom}) différent de la version du package.json (${version})`); else ok(`version ${version}`);

// 1. Contenu
const fichiers = new Set(execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter(Boolean).map(f => f.replace(`${nom}/`, '')));
const doit = f => (fichiers.has(f) ? true : (ko(`fichier manquant : ${f}`), false));
['LISEZ-MOI.txt', `PipeFitCRM-Setup-${version}.exe`, 'package.json', 'server/server.js', 'doe/server.js', 'etudes/server.js', 'docs/guide-installation.html',
  'deploy/windows/mettre-a-jour.ps1', 'deploy/linux/installer.sh', 'node_modules/@anthropic-ai/sdk/package.json'].forEach(doit);
// Scripts et feuilles de style de chaque page
[['public/index.html', 'public'], ['doe/public/index.html', 'doe/public'], ['etudes/public/index.html', 'etudes/public']].forEach(([page, base]) => {
  const html = fs.readFileSync(path.join(racine, page), 'utf8'), refs = [...html.matchAll(/(?:src|href)="([^"#?]+\.(?:js|css))"/g)].map(m => m[1]).filter(r => !/^https?:/.test(r));
  // « shared/… » : fichiers communs servis depuis le CRM ou le DOE par le serveur des Études (contrôlés au démarrage)
  // « js/etudes/… » du CRM : modules de calcul des Études, servis depuis etudes/public/js
  const enPack = r => fichiers.has(r.replace(/^js\/etudes\//, 'etudes/public/js/'));
  const manquants = refs.filter(r => !/^\/?shared\//.test(r)).filter(r => !enPack(r)).filter(r => !fichiers.has(r.startsWith('/') ? r.slice(1) : path.posix.join(base, r)) && !fichiers.has(path.posix.join('public', r.replace(/^\//, ''))));
  if (manquants.length) ko(`${page} : ${manquants.length} script(s) absent(s) du pack (${manquants.slice(0, 5).join(', ')})`); else ok(`${page} : ${refs.length} script(s) et styles présents`);
});
const interdits = [...fichiers].filter(f => /(^|\/)data\/.+/.test(f) && !/node_modules\//.test(f) || /(^|\/)\.env$|\.pem$|\.key$|db\.json$/.test(f) && !/node_modules\//.test(f));
if (interdits.length) ko(`données ou secrets dans le pack : ${interdits.slice(0, 5).join(', ')}`); else ok('aucune donnée de chantier ni secret');

// 2. Installation à blanc
const portLibre = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const attendre = async (url, ms = 20000) => { const fin = Date.now() + ms; while (Date.now() < fin) { try { const r = await fetch(url); return r; } catch (e) { await new Promise(x => setTimeout(x, 300)); } } return null; };
(async () => {
  if (!args.includes('--sans-demarrage')) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-pack-'));
    const procs = [];
    try {
      execFileSync('unzip', ['-q', zip, '-d', tmp]);
      const app = path.join(tmp, nom), data = path.join(tmp, 'data');
      fs.mkdirSync(data);
      const [pCrm, pDoe, pEt] = [await portLibre(), await portLibre(), await portLibre()];
      // Base d'Études d'une version précédente : calcul sans entrées, lien vers une note supprimée
      const ancienne = { etudes: [{ id: 'ancienne', objet: 'Étude 1.2.3', indice: 'A', notes: [{ id: 'n1', type: 'sanitaire', titre: 'Plomberie', entrees: { production: 'supprimee' } }, { id: 'n2', type: 'terminaux', titre: 'Terminaux', entrees: {} }] }] };
      const { DatabaseSync } = require('node:sqlite'), bd = new DatabaseSync(path.join(data, 'etudes.db'));
      bd.exec('CREATE TABLE IF NOT EXISTS etudes (id TEXT PRIMARY KEY, affaire_id TEXT, data TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT, updated_by TEXT)');
      bd.prepare('INSERT INTO etudes (id, affaire_id, data, version, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)').run('ancienne', '', JSON.stringify(ancienne.etudes[0]), '2026-01-01T00:00:00Z', 'v1.2.3');
      bd.close();
      const env = { ...process.env, HOST: '127.0.0.1', PORT: String(pCrm), DOE_PORT: String(pDoe), ETUDES_PORT: String(pEt), DB_FILE: path.join(data, 'pipefit.db'), DOE_DB_FILE: path.join(data, 'doe.db'),
        ETUDES_DB_FILE: path.join(data, 'etudes.db'), PIPEFIT_URL: `http://127.0.0.1:${pCrm}`, ADMIN_PASSWORD: 'Verif-Pack-2026!', HTTP_REDIRECT_PORT: '' };
      [['server/server.js', pCrm, 'CRM'], ['doe/server.js', pDoe, 'DOE'], ['etudes/server.js', pEt, 'Études']].forEach(([s, p, l]) => {
        const c = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', s], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let journal = ''; c.stdout.on('data', d => { journal += d; }); c.stderr.on('data', d => { journal += d; });
        procs.push({ c, p, l, journal: () => journal });
      });
      for (const { p, l, journal } of procs) {
        const r = await attendre(`http://127.0.0.1:${p}/`);
        if (!r || !r.ok) { ko(`${l} : le serveur ne répond pas sur le port ${p}${journal() ? ` — ${journal().slice(-300)}` : ''}`); continue; }
        const html = await r.text(), refs = [...html.matchAll(/(?:src|href)="([^"#?]+\.(?:js|css))"/g)].map(m => m[1]).filter(x => !/^https?:/.test(x));
        const echecs = [];
        for (const ref of refs) { const x = await fetch(new URL(ref, `http://127.0.0.1:${p}/`)); if (!x.ok) echecs.push(`${ref} (${x.status})`); }
        if (echecs.length) ko(`${l} : ${echecs.length} script(s) non servi(s) : ${echecs.slice(0, 5).join(', ')}`); else ok(`${l} : démarré, page et ${refs.length} script(s) servis`);
      }
      // Base d'une version précédente toujours lisible (fichier conservé, étude présente)
      const { DatabaseSync: Db } = require('node:sqlite'), bd2 = new Db(path.join(data, 'etudes.db'), { readOnly: true });
      const relue = bd2.prepare("SELECT data FROM etudes WHERE id = 'ancienne'").get(); bd2.close();
      if (relue && JSON.parse(relue.data).notes.length === 2) ok('base d\'Études d\'une version précédente conservée à la mise à jour'); else ko('base d\'Études précédente perdue au démarrage');
      // Calculs de l'ancienne étude avec les modules du pack
      const req = m => require(path.join(app, 'etudes/public/js', m));
      const N = req('notes'); ['industriel', 'terminaux', 'sanitaire', 'evacuation', 'desenfumage', 'pieces', 'gaz-reseau'].filter(m => fs.existsSync(path.join(app, 'etudes/public/js', `${m}.js`))).forEach(m => { const x = req(m); if (m === 'terminaux') global.Terminaux = x; if (m === 'sanitaire') global.Sanitaire = x; });
      const L = req('liens'), et = ancienne.etudes[0];
      try { et.notes.forEach(n => L.calculer(et, n)); ok('calculs de l\'étude précédente relus sans erreur'); } catch (e) { ko(`calcul de l'étude précédente : ${e.message}`); }
      void N;
    } catch (e) { ko(`installation à blanc : ${e.message}`); }
    finally { procs.forEach(({ c }) => c.kill()); await new Promise(r => setTimeout(r, 300)); fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(erreurs.length ? `\n${erreurs.length} problème(s) : ne pas envoyer ce pack.` : '\nPack vérifié : prêt à être envoyé.');
  process.exit(erreurs.length ? 1 : 0);
})();
