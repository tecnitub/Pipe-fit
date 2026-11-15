// Retour du chantier vers l'étude (démo) : réserve affectée à un compagnon et levée dans son appli (photo / commentaire,
// hors connexion), plaque signalétique comparée au modèle retenu, contrat d'entretien (interventions), carte
// « Retour du chantier » des Études (mesures et réglages, plaques, réserves, fiabilité des modèles, comptages de la GTC).
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-e2e-retour-'));
  execFileSync(process.execPath, [path.join(racine, 'demo', 'build.js'), path.join(dir, 'pipefit-crm-demo.html')], { stdio: 'ignore' });
});
after(async () => { if (navigateur) await navigateur.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
const attendre = ms => new Promise(r => setTimeout(r, ms));

test('CRM : réserve affectée à un compagnon, levée hors connexion dans son appli, reprise au retour du réseau', { skip: sansPlaywright, timeout: 120000 }, async () => {
  navigateur = navigateur || await chromium.launch();
  const ctx = await navigateur.newContext({ viewport: { width: 1300, height: 950 } }), p = await ctx.newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`file://${path.join(dir, 'pipefit-crm-demo.html')}`); await p.waitForTimeout(1200);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('pipefit-crm-demo-me', 'acc-claire'); location.hash = '#/reception/af1'; location.reload(); });
  await p.waitForTimeout(2500);
  assert.ok(await p.$('#rt-carte'), 'carte des réserves à lever par les compagnons');
  await p.selectOption('select[data-rt-aff="rs1"]', 'o1'); await p.waitForTimeout(500);
  assert.strictEqual(await p.evaluate(() => Store.get('reserves', 'rs1').assigneA), 'o1');
  assert.ok(await p.evaluate(() => Store.all('notifications').some(n => n.type === 'reserve' && n.userId === 'o1')), 'compagnon notifié');
  // Contrat d'entretien : intervention rattachée (fiche du chantier)
  await p.evaluate(() => { location.hash = '#/chantier/af1'; }); await p.waitForTimeout(1500);
  if (await p.$('#ct-creer')) { await p.click('#ct-creer'); await p.waitForTimeout(300); await p.click('#ct-ok'); await p.waitForTimeout(800); }
  await p.click('#ct-interv'); await p.waitForTimeout(300);
  await p.fill('#iv-rep', 'P1'); await p.fill('#iv-fab', 'Pompix'); await p.fill('#iv-ref', 'Circa 40-120 F'); await p.fill('#iv-desc', 'Pompe bloquée'); await p.fill('#iv-pieces', 'Garniture mécanique');
  await p.click('#iv-ok'); await p.waitForTimeout(800);
  const iv = await p.evaluate(() => (Store.get('affaires', 'af1').contrat.interventions || [])[0]);
  assert.deepStrictEqual([iv.type, iv.reference, iv.pieces[0].designation], ['Panne', 'Circa 40-120 F', 'Garniture mécanique']);
  assert.match(await p.innerText('#contrat-entretien'), /Interventions[\s\S]*Pompe bloquée/);
  // Appli du compagnon : « Mes réserves à lever », levée sans réseau
  await p.evaluate(() => { localStorage.setItem('pipefit-crm-demo-me', 'acc-kevin'); location.hash = '#/pointage/chantier/af1'; location.reload(); });
  await p.waitForTimeout(2500);
  assert.match(await p.innerText('#mes-reserves'), /Calorifuge manquant/);
  await ctx.setOffline(true);
  await p.click('[data-lever-terrain="rs1"]'); await p.waitForTimeout(300);
  await p.fill('#lt-com', 'Calorifuge posé'); await p.click('#lt-ok'); await p.waitForTimeout(800);
  assert.strictEqual(await p.evaluate(() => Store.get('reserves', 'rs1').statut), 'Levée');
  assert.match(await p.innerText('#mes-reserves'), /Levée le[\s\S]*Calorifuge posé/);
  await ctx.setOffline(false); await p.evaluate(() => HorsLigne.envoyer && HorsLigne.envoyer()); await p.waitForTimeout(1500);
  // Le bureau voit la levée (auteur, commentaire)
  await p.evaluate(() => { localStorage.setItem('pipefit-crm-demo-me', 'acc-claire'); location.hash = '#/reception/af1'; location.reload(); });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => Store.get('reserves', 'rs1'));
  assert.deepStrictEqual([r.statut, r.commentaireLevee, r.leveeParId], ['Levée', 'Calorifuge posé', 'o1']);
  assert.match(await p.innerText('main, body'), /Levée par Kevin Roux/);
  assert.deepStrictEqual(erreurs, []);
  await ctx.close();
});

test('Études : carte « Retour du chantier » — mesures et réglages, plaques, réserves, fiabilité, comptages importés', { skip: sansPlaywright, timeout: 120000 }, async () => {
  navigateur = navigateur || await chromium.launch();
  const ctx = await navigateur.newContext({ viewport: { width: 1400, height: 1000 } }), p = await ctx.newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`file://${path.join(dir, 'etudes.html')}`); await p.waitForTimeout(1500);
  if (await p.$('input[type=password]')) { await (await p.$$('input'))[0].fill('jacky'); await p.fill('input[type=password]', 'demo'); await p.keyboard.press('Enter'); await p.waitForTimeout(2000); }
  const id = await p.evaluate(() => { const et = S.etudes.find(x => !x.modele && x.affaireId) || S.etudes.find(x => !x.modele); location.hash = `#/etude/${et.id}`; return et.id; });
  await p.waitForTimeout(1500);
  assert.ok(id && await p.$('#carte-retour'), 'carte du retour du chantier');
  for (const [btn, titre] of [['#rc-mesures', /Mesures de mise en service et réglages[\s\S]*Tolérance/], ['#rc-plaques', /Plaques signalétiques et registre/], ['#rc-reserves', /Réserves levées sur le chantier/], ['#rc-fiabilite', /Fiabilité des modèles[\s\S]*Seuil/]]) {
    if (await p.$eval(btn, b => b.disabled)) continue;
    await p.click(btn); await p.waitForTimeout(900);
    assert.match(await p.innerText('.modal-box'), titre);
    await p.evaluate(() => { document.getElementById('modal').hidden = true; });
  }
  // Comptages : import d'un CSV de relevés (compteur d'appoint en fuite)
  await p.click('#rc-comptages'); await p.waitForTimeout(500);
  const csv = 'Date;Compteur;Index;Unité\n01/01/2026;CPT-APP;10;m³\n01/02/2026;CPT-APP;10,2;m³\n01/03/2026;CPT-APP;14;m³\n01/01/2026;CET-CH;1000;kWh\n01/03/2026;CET-CH;30000;kWh\n';
  await p.setInputFiles('#cp-f', { name: 'releves.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }); await p.waitForTimeout(1200);
  const t = await p.innerText('.modal-box');
  assert.match(t, /5 relevé\(s\)/); assert.match(t, /CPT-APP/); assert.match(t, /Eau d'appoint du réseau/);
  assert.strictEqual(await p.evaluate(i => S.etudes.find(x => x.id === i).comptages.releves.length, id), 5);
  assert.deepStrictEqual(erreurs, []);
  await ctx.close();
});
