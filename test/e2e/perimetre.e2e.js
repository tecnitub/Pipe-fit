// Compagnon limité à ses chantiers et à ceux de son équipe (démo) : liste « Mes chantiers », lien vers un chantier hors
// périmètre (message clair, aucune donnée), réglage « accès à tous les chantiers » de l'administrateur.
// Usage : npm run test:e2e
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }

const racine = path.join(__dirname, '..', '..');
let dir, navigateur;
const sansPlaywright = !chromium && 'Playwright absent : npm i --no-save playwright && npx playwright install chromium';

before(() => {
  if (!chromium) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-e2e-perimetre-'));
  execFileSync(process.execPath, [path.join(racine, 'demo', 'build.js'), path.join(dir, 'pipefit-crm-demo.html')], { stdio: 'ignore' });
});
after(async () => { if (navigateur) await navigateur.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

async function compte(p, id, hash) {
  await p.evaluate(([c, h]) => { localStorage.setItem('pipefit-crm-demo-me', c); location.hash = h; location.reload(); }, [id, hash]);
  await p.waitForTimeout(2500);
}

test('CRM : compagnon hors périmètre — ses chantiers et ceux de son équipe seulement, message clair sur un autre chantier', { skip: sansPlaywright, timeout: 120000 }, async () => {
  navigateur = navigateur || await chromium.launch();
  const p = await (await navigateur.newContext({ viewport: { width: 390, height: 844 } })).newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`file://${path.join(dir, 'pipefit-crm-demo.html')}`); await p.waitForTimeout(1200);
  await p.evaluate(() => localStorage.clear());
  // Kevin (soudeur, sans équipe) : chantiers où il est prévu ou a travaillé ces jours-ci, pas les chantiers terminés des autres
  await compte(p, 'acc-kevin', '#/pointage/chantiers');
  const kevin = await p.evaluate(() => Store.all('affaires').map(a => a.id).sort());
  assert.ok(kevin.includes('af1') && kevin.includes('af4'), kevin.join(','));
  assert.ok(!kevin.includes('af2') && !kevin.includes('af3') && !kevin.includes('hd1'), `chantiers hors périmètre reçus : ${kevin.join(',')}`);
  const liste = await p.innerText('#app');
  assert.match(liste, /Mes chantiers/);
  assert.match(liste, /Vos chantiers et ceux de votre équipe/);
  // Aucune fiche d'un chantier hors périmètre dans ses données (bons, réserves, devis, commandes)
  assert.deepStrictEqual(await p.evaluate(() => ['rapports', 'reserves', 'devis', 'commandes', 'receptions'].flatMap(c => Store.all(c).filter(x => x.affaireId && !Store.get('affaires', x.affaireId)).map(x => `${c}:${x.id}`))), []);
  // Lien vers un chantier hors périmètre (ancienne notification, lien partagé) : message clair, rien du chantier
  await p.evaluate(() => { location.hash = '#/pointage/chantier/af2'; }); await p.waitForTimeout(1200);
  assert.ok(await p.$('#ch-hors-perimetre'), 'message hors périmètre');
  assert.match(await p.innerText('#ch-hors-perimetre'), /pas dans vos chantiers[\s\S]*demandez au bureau/);
  assert.ok(!/Remplacement collecteur vapeur/.test(await p.innerText('#app')), 'nom du chantier affiché');
  await p.click('#ch-hors-perimetre a'); await p.waitForTimeout(800);
  assert.match(p.url(), /#\/pointage\/chantiers$/);
  // Lucas (chef d'équipe) : ses chantiers et ceux de son équipe (Romain, intérimaires)
  await compte(p, 'acc-lucas', '#/pointage/chantiers');
  const lucas = await p.evaluate(() => Store.all('affaires').map(a => `${a.id}:${a.perimetre}`).sort());
  assert.ok(['af1', 'af4', 'hd2'].every(id => lucas.some(x => x.startsWith(`${id}:`))), lucas.join(','));
  assert.ok(!lucas.some(x => /^af[23]:/.test(x)), lucas.join(','));
  // Administrateur : « Accès à tous les chantiers » → Kevin retrouve tous les chantiers ; puis retour au périmètre
  await compte(p, 'acc-admin', '#/parametres');
  await p.check('#cp-tous'); await p.waitForTimeout(800);
  assert.strictEqual(await p.evaluate(() => Store.data.settings.compagnon.tousChantiers), true);
  assert.ok(await p.$eval('#cp-jours', e => e.disabled), 'période inutile quand tout est ouvert');
  await compte(p, 'acc-kevin', '#/pointage/chantier/af2');
  assert.ok(!(await p.$('#ch-hors-perimetre')), 'chantier ouvert avec l\'accès à tous les chantiers');
  await compte(p, 'acc-admin', '#/parametres');
  await p.uncheck('#cp-tous'); await p.waitForTimeout(800);
  await p.fill('#cp-jours', '10'); await p.dispatchEvent('#cp-jours', 'change'); await p.waitForTimeout(800);
  assert.strictEqual(await p.evaluate(() => Store.data.settings.compagnon.perimetreJours), 10);
  await compte(p, 'acc-kevin', '#/pointage/chantier/af2');
  assert.ok(await p.$('#ch-hors-perimetre'));
  assert.deepStrictEqual(erreurs, []);
});
