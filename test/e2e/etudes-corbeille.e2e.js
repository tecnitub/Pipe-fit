// Études supprimées (démo de l'application Études) : suppression par l'auteur, vue « Études supprimées », restauration ;
// une autre personne du bureau ne peut pas supprimer l'étude.
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-e2e-corbeille-'));
  execFileSync(process.execPath, [path.join(racine, 'etudes', 'build-demo.js'), path.join(dir, 'etudes.html')], { stdio: 'ignore' });
});
after(async () => { if (navigateur) await navigateur.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

async function connexion(p, login) {
  if (await p.evaluate(() => typeof S !== 'undefined' && !!S.me)) { await p.evaluate(async () => { await api('POST', '/api/logout', {}); location.reload(); }); await p.waitForTimeout(1200); }
  await (await p.$$('input'))[0].fill(login); await p.fill('input[type=password]', 'demo'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
}

test('Études : suppression par l\'auteur, « Études supprimées », restauration ; refus pour une autre personne', { skip: sansPlaywright, timeout: 120000 }, async () => {
  navigateur = await chromium.launch();
  const p = await (await navigateur.newContext({ viewport: { width: 1280, height: 900 } })).newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`file://${path.join(dir, 'etudes.html')}`); await p.waitForTimeout(1000);
  await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); location.reload(); }); await p.waitForTimeout(1200);
  await connexion(p, 'jacky');
  await p.evaluate(async () => { const et = await api('PUT', '/api/etudes/e2e-sup', { data: { objet: 'Étude à supprimer', affaireId: '', indice: 'A', notes: [], historique: [] } }); S.etudes.push(et); location.hash = '#/etude/e2e-sup'; });
  await p.waitForTimeout(1000);
  assert.strictEqual(await p.$eval('#supprimer', b => b.disabled), false);
  await p.evaluate(() => { document.querySelector('#supprimer').click(); }); await p.waitForTimeout(400);
  assert.match(await p.innerText('.modal-box'), /Études supprimées[\s\S]*restaurer pendant 30 jours/);
  await p.click('.modal-box [data-r="1"]'); await p.waitForTimeout(800);
  assert.ok(!(await p.evaluate(() => S.etudes.some(e => e.id === 'e2e-sup'))));
  // Vue des études supprimées (lien de l'accueil)
  await p.click('#lien-supprimees'); await p.waitForTimeout(800);
  assert.match(await p.innerText('#sup-liste'), /Étude à supprimer[\s\S]*Jacky/);
  await p.click('[data-restaurer="e2e-sup"]'); await p.waitForTimeout(1000);
  assert.match(p.url(), /#\/etude\/e2e-sup$/);
  assert.ok(await p.evaluate(() => S.etudes.some(e => e.id === 'e2e-sup')));
  // Claire n'en est pas l'auteure : bouton désactivé, refus du serveur de la démo
  await connexion(p, 'claire');
  await p.evaluate(() => { location.hash = '#/etude/e2e-sup'; }); await p.waitForTimeout(1000);
  assert.strictEqual(await p.$eval('#supprimer', b => b.disabled), true);
  assert.strictEqual(await p.evaluate(async () => { try { await api('DELETE', '/api/etudes/e2e-sup'); return 200; } catch (e) { return e.status; } }), 403);
  assert.deepStrictEqual(erreurs, []);
});
