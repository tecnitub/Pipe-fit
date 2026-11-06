// Tests des écrans de terrain et de mise en service (navigateur, démo) : PV point à point de la GTB, reprise d'une fiche
// de relevés Excel rattachée à sa tâche, prise de cotes avec robinetterie du fabricant et isométrique DXF, paramètres de
// la robinetterie et des brides, onglet « Programmation automate » des Études.
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-e2e-terrain-'));
  execFileSync(process.execPath, [path.join(racine, 'demo', 'build.js'), path.join(dir, 'pipefit-crm-demo.html')], { stdio: 'ignore' });
});
after(async () => { if (navigateur) await navigateur.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

async function ouvrir(fichier) {
  navigateur = navigateur || await chromium.launch();
  const p = await (await navigateur.newContext({ viewport: { width: 1400, height: 1000 } })).newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`file://${path.join(dir, fichier)}`);
  await p.waitForTimeout(1500);
  await p.evaluate(() => { localStorage.clear(); location.reload(); });
  await p.waitForTimeout(2000);
  if (await p.$('input[type=password]')) { await (await p.$$('input'))[0].fill('jacky'); await p.fill('input[type=password]', 'demo'); await p.keyboard.press('Enter'); await p.waitForTimeout(2000); }
  return { p, erreurs };
}

test('CRM : PV point à point de la GTB (automate / GTB, avancement, réserve, signature de l\'intégrateur)', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('pipefit-crm-demo.html');
  await p.evaluate(() => { sessionStorage.setItem('pf-plan-controles:e2e', JSON.stringify(['P1 — Commande de marche (TC) : Forcer la sortie', 'TD1 — Mesure (TM) : Comparer la mesure'])); location.hash = '#/mes/new?type=gtb&plan=e2e&equipement=Tests%20GTB'; });
  await p.waitForTimeout(1500);
  assert.strictEqual(await p.$$eval('[data-pap-a]', l => l.length), 2);
  await p.click('#es-pap-a'); await p.waitForTimeout(400);
  await p.selectOption('[data-pap-g="0"]', 'Non conforme'); await p.waitForTimeout(300);
  assert.match(await p.textContent('#es-pap-n'), /1\/2 testé\(s\), 1 non conforme/);
  assert.strictEqual(await p.$eval('#es-res', s => s.value), 'Mis en service avec réserves');
  assert.ok(await p.$('#es-sig-i'));
  assert.deepStrictEqual(erreurs, []);
});

test('CRM : fiche de relevés Excel reprise en PV brouillon et rattachée à sa tâche ; fiche Excel au format du modèle', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('pipefit-crm-demo.html');
  const X = require(path.join(racine, 'public/js/xlsx'));
  const rows = [['FICHE DE RELEVES DE FONCTIONNEMENT'], ['VENTILATEUR D\'EXTRACTION'], ['CHANTIER :', '', 'Essai', '', '', 'DATE :', '', 46000], ['LOCALISATION :', '', 'Toiture', '', 'DESIGNATION :', 'Extracteur e2e'],
    ['MARQUE :', '', 'Marque X', '', 'REFERENCES :', 'Caisson 1'], ['DEBIT PREVU :', '', '', 900], ['MESURES ELECTRIQUES ET AERAULIQUES'], ['', 'DEBIT EXTRACTION', '', '', '', '880m3/h'], ['EQUILIBRAGE AERAULIQUE'],
    ['ANTENNE / LOCAL / DIFFUSEUR', '', '', 'SECTION / DIAMETRE', 'REGLAGE', 'DEBIT PREVU', '', 'DEBIT MESURE'], ['WC', '', '', 125, 'MR', 30, '', 31]];
  const fichier = path.join(dir, 'fiche.xlsx');
  fs.writeFileSync(fichier, Buffer.from(X.build([{ name: 'Rév.0', rows }])));
  const id = await p.evaluate(() => { const a = Store.all('affaires')[0]; location.hash = `#/chantier/${a.id}`; return a.id; });
  await p.waitForTimeout(2500);
  const avant = await p.evaluate(x => Store.all('misesEnService').filter(m => m.affaireId === x).length, id);
  await p.setInputFiles('#pm-import', fichier); await p.waitForTimeout(2000);
  const pv = await p.evaluate(x => Store.all('misesEnService').filter(m => m.affaireId === x).find(m => m.equipement === 'Extracteur e2e'), id);
  assert.ok(pv && pv.statut === 'Brouillon' && pv.type === 'vmc', 'PV brouillon créé');
  assert.strictEqual(await p.evaluate(x => Store.all('misesEnService').filter(m => m.affaireId === x).length, id), avant + 1);
  // Export au format du modèle : titres fusionnés, cellules encadrées
  const f = await p.evaluate(x => EssaisDoc.ficheExcel(x, { chantier: 'Essai' }), pv);
  assert.ok(f.merges.includes('A1:H1') && f.ajuster);
  assert.deepStrictEqual(erreurs, []);
});

test('CRM : prise de cotes avec robinetterie du fabricant, plan de débit, tronçons, isométrique DXF ; paramètres', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('pipefit-crm-demo.html');
  await p.evaluate(() => { location.hash = '#/releve/new'; }); await p.waitForTimeout(1500);
  for (const t of ['tube', 'vanne']) { await p.click(`[data-add="${t}"]`); await p.waitForTimeout(500); }
  await p.selectOption('select[data-k="type"]', 'equilibrage'); await p.waitForTimeout(500);
  await p.selectOption('select[data-k="rac"]', 'taraude'); await p.waitForTimeout(500);
  const opts = await p.$$eval('select[data-k="modele"] option', l => l.map(o => o.value));
  assert.ok(opts.includes('IMI Hydronic STAD / STADV'), opts.join(', '));
  await p.selectOption('select[data-k="modele"]', 'IMI Hydronic STAD / STADV'); await p.waitForTimeout(600);
  assert.ok(await p.$('#rl-joint') && await p.$('#rl-barre'));
  // Isométrique vectoriel et DXF
  const n = await p.evaluate(() => { const r = { matiere: 'Acier P235GH', dn: 50, elements: [{ t: 'tube', dn: 50, auto: true, cote: 1200 }, { t: 'coude', dn: 50, vers: 'N' }, { t: 'tube', dn: 50, l: 800 }] }; return Dxf.depuisSvg(Vue3D.svgIso(Tuyauterie.placer(r), 'e2e')).entites; });
  assert.ok(n > 5);
  // Paramètres : robinetterie et brides
  await p.evaluate(() => { location.hash = '#/parametres'; }); await p.waitForTimeout(1500);
  assert.ok(await p.$('#robi-table') && await p.$('#brides-save'));
  await p.click('#robi-ajout'); await p.waitForTimeout(400);
  assert.strictEqual(await p.$$eval('[data-robi-sup]', l => l.length), 1);
  assert.deepStrictEqual(erreurs, []);
});

test('Études : onglet « Programmation automate » (cahier Wit) du calcul des armoires', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('etudes.html');
  const id = await p.evaluate(() => { const et = S.etudes.find(x => !x.modele && x.notes.some(n => n.type === 'elec')); const n = et.notes.find(x => x.type === 'elec'); n.entrees.marqueAutomate = 'wit'; n.entrees.armoires.forEach(a => { a.techno = 'automate'; }); enregistrer(et); location.hash = `#/etude/${et.id}/${n.id}`; return et.id; });
  await p.waitForTimeout(2000);
  assert.ok(id);
  await p.click('[data-onglet="Programmation automate"]'); await p.waitForTimeout(800);
  const t = await p.innerText('#resultats');
  assert.match(t, /Cahier de programmation — Automate Wit/); assert.match(t, /Boucles de régulation|Entrées \/ sorties/);
  assert.deepStrictEqual(erreurs, []);
});
