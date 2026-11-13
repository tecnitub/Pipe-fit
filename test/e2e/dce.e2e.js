// Import du dossier de consultation (zip) dans Études : archive fictive construite ici (CCTP PDF, DPGF Excel et PDF, pièces
// administratives, plan, zip d'un autre lot), tri des pièces, lecture, inventaire, questions au maître d'œuvre ; à 390 px.
// Usage : npm run test:e2e (démo construite dans un dossier temporaire ; Chromium via Playwright)
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }

const racine = path.join(__dirname, '..', '..');
const XLSX = require(path.join(racine, 'public', 'js', 'xlsx.js'));
const PDFLib = require(path.join(racine, 'doe', 'public', 'vendor', 'pdf-lib-1.17.1.min.js'));
let dir, navigateur;
const sansPlaywright = !chromium && 'Playwright absent : npm i --no-save playwright && npx playwright install chromium';

before(() => {
  if (!chromium) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-e2e-'));
  execFileSync(process.execPath, [path.join(racine, 'demo', 'build.js'), path.join(dir, 'pipefit-crm-demo.html')], { stdio: 'ignore' });
});
after(async () => { if (navigateur) await navigateur.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

// PDF texte d'une page (lignes fictives)
async function pdf(lignes) {
  const d = await PDFLib.PDFDocument.create(), f = await d.embedFont(PDFLib.StandardFonts.Helvetica), p = d.addPage([595, 842]);
  lignes.forEach((l, i) => p.drawText(l, { x: 40, y: 800 - i * 16, size: 10, font: f }));
  return d.save();
}
async function archiveFictive() {
  const cctp = await pdf(['CAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES', 'Groupe scolaire fictif - rénovation', 'LOT N° 05 - CHAUFFAGE VENTILATION',
    '1 Généralités', 'Le présent document décrit les travaux de chauffage et de ventilation du bâtiment fictif.', 'Les installations sont conformes aux normes en vigueur.',
    '3.1 Chaudières gaz à condensation', 'Deux chaudières repères CH-01 et CH-02 de marque Fictiva type Alpha ou équivalent.', 'Puissance unitaire : 150 kW. Régime 70/50 °C.',
    '3.2 Centrales de traitement d\'air', 'La centrale CTA-01 assure le traitement du réfectoire.', 'Batterie chaude : 40 kW, débit 6 000 m3/h.',
    '3.3 Circulateurs', 'Circulateurs à vitesse variable, quantité : 3.', '3.4 Radiateurs', 'Radiateurs acier à panneaux, quantité : 12.']);
  const dpgfPdf = await pdf(['DÉCOMPOSITION DU PRIX GLOBAL ET FORFAITAIRE', 'N° Désignation U Qté P.U. Montant', '3.1 Chaudière gaz à condensation 150 kW u 2']);
  const dpgf = XLSX.build([{ name: 'DPGF', rows: [['DÉCOMPOSITION DU PRIX GLOBAL ET FORFAITAIRE'], ['N°', 'Désignation', 'U', 'Qté', 'P.U. HT', 'Montant HT'],
    ['3.1', 'Chaudière gaz à condensation 150 kW', 'u', 2], ['3.2', 'Centrale de traitement d\'air CTA-01 débit 6000 m3/h', 'u', 1], ['3.3', 'Circulateurs à vitesse variable', 'u', 2]] }]);
  const autreLot = XLSX.zip([{ name: 'CCTP lot 02.pdf', data: await pdf(['CAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES', 'LOT 02 GROS OEUVRE']) }]);
  return Buffer.from(XLSX.zip([
    { name: 'DCE/Lot 05 Chauffage ventilation/CCTP lot 04.pdf', data: cctp },
    { name: 'DCE/Lot 05 Chauffage ventilation/DPGF lot 04.xlsx', data: dpgf },
    { name: 'DCE/Lot 05 Chauffage ventilation/DPGF lot 04.pdf', data: dpgfPdf },
    { name: 'DCE/Pièces administratives/RC.pdf', data: await pdf(['RÈGLEMENT DE LA CONSULTATION']) },
    { name: 'DCE/Plans/Plan RDC chaufferie.dwg', data: new Uint8Array([1, 2, 3]) },
    { name: 'DCE/Lot 02 Gros oeuvre.zip', data: autreLot }]));
}

test('Études : dossier de consultation en zip → tri des pièces → inventaire → questions au maître d\'œuvre (390 px)', { skip: sansPlaywright, timeout: 180000 }, async () => {
  navigateur = navigateur || await chromium.launch();
  const ctx = await navigateur.newContext({ viewport: { width: 1400, height: 1000 } }), p = await ctx.newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`file://${path.join(dir, 'etudes.html')}`); await p.waitForTimeout(1500);
  await p.evaluate(() => { localStorage.clear(); location.reload(); }); await p.waitForTimeout(2200);
  if (await p.$('input[type=password]')) { await (await p.$$('input'))[0].fill('jacky'); await p.fill('input[type=password]', 'demo'); await p.keyboard.press('Enter'); await p.waitForTimeout(2000); }
  const id = await p.evaluate(() => S.etudes.find(x => !x.modele).id);
  await p.evaluate(e => { location.hash = `#/etude/${e}`; }, id); await p.waitForTimeout(1200);
  await p.click('#inventaire'); await p.waitForTimeout(400);
  await p.setInputFiles('#inv-dce', { name: 'DCE lot 04.zip', mimeType: 'application/zip', buffer: await archiveFictive() });
  await p.waitForSelector('.dce-pieces', { timeout: 20000 }); await p.waitForTimeout(500);
  const lignes = await p.$$eval('.dce-pieces tbody tr', tr => tr.map(t => [t.querySelector('td:nth-child(2)').innerText.split('\n')[0], t.querySelector('[data-dce]').checked, t.querySelector('select').value]));
  assert.strictEqual(lignes.length, 6, JSON.stringify(lignes));
  assert.deepStrictEqual(lignes.filter(l => l[1]).map(l => [l[0], l[2]]), [['CCTP lot 04.pdf', 'cctp'], ['DPGF lot 04.xlsx', 'dpgf']]);
  const nature = n => lignes.find(l => l[0] === n)[2];
  assert.deepStrictEqual(['DPGF lot 04.pdf', 'RC.pdf', 'Plan RDC chaufferie.dwg', 'CCTP lot 02.pdf'].map(nature), ['dpgf', 'admin', 'plan', 'cctp']);
  assert.match(await p.innerText('.dce-pieces'), /DPGF Excel retenu/);
  assert.match(await p.innerText('.dce-pieces'), /hors CVC/);
  // Lisible sur téléphone : pas de défilement horizontal de la page
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'dialogue d\'import à 390 px');
  await p.setViewportSize({ width: 1400, height: 1000 });
  // Lecture puis inventaire
  await p.click('#inv-lire');
  await p.waitForSelector('#ti-questions', { timeout: 60000 });
  assert.match(await p.innerText('#modal'), /Inventaire du dossier de consultation/);
  assert.match(await p.innerText('#modal'), /Chaudière/i);
  await p.click('#ti-questions'); await p.waitForSelector('#qm-word', { timeout: 5000 });
  const t = await p.innerText('#modal');
  assert.match(t, /Questions au maître d'œuvre/);
  const nq = await p.$$eval('.question-moe', l => l.length);
  assert.ok(nq >= 1, t);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'questions à 390 px');
  await p.check('[data-q="0"][data-qk="posee"]'); await p.waitForTimeout(300);
  const suivi = await p.evaluate(e => S.etudes.find(x => x.id === e).questionsMoe, id);
  assert.strictEqual(suivi.length, 1);
  assert.ok(suivi[0].posee);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('#qm-word')]);
  assert.match(dl.suggestedFilename(), /^Questions_MOE_.*\.docx$/);
  assert.deepStrictEqual(erreurs, []);
  await ctx.close();
});
