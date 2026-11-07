// Tests de l'interface d'Atelier PDF dans un vrai navigateur (Chromium, Playwright), sur le fichier compilé
// dist/AtelierPDF.html ouvert en local (file://), comme sur un poste Windows.
// Lancement : npm run test:ui   (Playwright requis : npm install --no-save playwright && npx playwright install chromium)
// Sans Playwright, les tests sont ignorés.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch { /* Playwright absent : tests ignorés */ }
const ignorer = chromium ? false : 'Playwright absent (npm install --no-save playwright)';

const racine = path.join(__dirname, '../..');
const PDFLib = require(path.join(racine, 'doe/public/vendor/pdf-lib-1.17.1.min.js'));
const APPLI = `file://${path.join(racine, 'dist/AtelierPDF.html')}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atelierpdf-ui-'));
const F = nom => path.join(dir, nom);
let navigateur;

// ---------- Documents d'essai ----------
async function pdf(nom, pages, dessin) {
  const d = await PDFLib.PDFDocument.create();
  const f = await d.embedFont(PDFLib.StandardFonts.Helvetica);
  for (let i = 0; i < pages.length; i++) { const p = d.addPage(pages[i].taille || [595, 842]); await dessin(p, f, i, d); if (pages[i].rotation) p.setRotation(PDFLib.degrees(pages[i].rotation)); }
  fs.writeFileSync(F(nom), await d.save());
}
before(async () => {
  if (!chromium) return;
  execFileSync(process.execPath, [path.join(racine, 'pdf/build.js')]);
  navigateur = await chromium.launch();
  await pdf('notice.pdf', [{}, {}, {}], (p, f, i) => { p.drawText(`Notice CTA page ${i + 1}`, { x: 60, y: 760, size: 24, font: f }); p.drawText('Prix : 100 euros', { x: 60, y: 700, size: 14, font: f }); });
  await pdf('biais.pdf', [{ taille: [842, 595] }], (p, f) => {
    p.drawText('Plan réseau', { x: 50, y: 540, size: 18, font: f });
    p.drawText('Tuyauterie DN80 pente 1%', { x: 200, y: 215, size: 12, font: f, rotate: PDFLib.degrees(30) });
  });
  await pdf('plan.pdf', [{ taille: [842, 595], rotation: 90 }, { taille: [842, 595] }], (p, f, i) => { p.drawText(`Plan RDC page ${i + 1}`, { x: 60, y: 540, size: 24, font: f }); });
  for (const [nom, ox, oy, ind] of [['plan-A.pdf', 0, 0, 'A'], ['plan-B.pdf', 4, -3, 'B']]) {
    await pdf(nom, [{ taille: [842, 595] }], (p, f) => {
      const l = (x1, y1, x2, y2) => p.drawLine({ start: { x: x1 + ox, y: y1 + oy }, end: { x: x2 + ox, y: y2 + oy }, thickness: 2 });
      l(60, 500, 780, 500); l(60, 500, 60, 100); l(780, 500, 780, 100); l(60, 100, 780, 100); l(300, 500, 300, 100);
      if (ind === 'A') l(540, 500, 540, 100);
      if (ind === 'B') p.drawRectangle({ x: 600 + ox, y: 250 + oy, width: 120, height: 80, borderWidth: 2, borderColor: PDFLib.rgb(0, 0, 0) });
      p.drawText(`Indice ${ind}`, { x: 680 + ox, y: 60 + oy, size: 12, font: f });
    });
  }
  // Formulaire
  const d = await PDFLib.PDFDocument.create(); const pg = d.addPage([595, 842]); const form = d.getForm();
  form.createTextField('client').addToPage(pg, { x: 120, y: 724, width: 300, height: 20 });
  form.createCheckBox('termine').addToPage(pg, { x: 50, y: 558, width: 16, height: 16 });
  const r = form.createRadioGroup('urgence'); r.addOptionToPage('normale', pg, { x: 260, y: 527, width: 14, height: 14 }); r.addOptionToPage('haute', pg, { x: 290, y: 527, width: 14, height: 14 });
  fs.writeFileSync(F('formulaire.pdf'), await d.save());
  // Devis produit par Chromium (polices intégrées) et scan (image)
  const page = await navigateur.newPage();
  await page.setContent('<div style="font:14px Arial;padding:40px"><p>Client : Laiterie des Alpes</p><p>Date de validité : 30/11/2026</p><p>Montant HT : 12 450,00 €</p></div>');
  fs.writeFileSync(F('devis.pdf'), await page.pdf({ format: 'A4' }));
  await page.setViewportSize({ width: 920, height: 1220 });
  await page.setContent('<div style="width:800px;height:1100px;background:#fdfdf8;padding:60px;font:28px Arial;color:#222"><h1>Rapport de visite</h1><p>Robinet de vidange DN 50 à remplacer.</p><p>Contact : M. Dupont 06 12 34 56 78</p></div>');
  await page.screenshot({ path: F('scan.png') });
  await page.close();
});
after(async () => { if (navigateur) await navigateur.close(); fs.rmSync(dir, { recursive: true, force: true }); });

// ---------- Aides ----------
async function appli(contexte = null) {
  const ctx = contexte || await navigateur.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await ctx.addInitScript(() => { window.showSaveFilePicker = undefined; window.showDirectoryPicker = undefined; try { if (!sessionStorage.getItem('visite-essai')) localStorage.setItem('atelierpdf.visite', 'vue'); } catch { /* rien */ } });
  const page = await ctx.newPage();
  page.erreurs = [];
  page.on('pageerror', e => page.erreurs.push(e.message));
  page.on('dialog', d => d.accept(page.reponse ?? ''));
  await page.goto(APPLI);
  await page.waitForFunction(() => window.AtelierPDF);
  return page;
}
async function ajouter(page, fichiers, total) {
  await page.setInputFiles('#fichiers', fichiers.map(F));
  await page.waitForFunction(n => window.AtelierPDF.etat.pages.length === n, total, { timeout: 20000 });
}
async function enregistrer(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#b-enregistrer')]);
  return fs.readFileSync(await dl.path());
}
// Texte de chaque page d'un PDF (pdf.js de l'application)
const texteDuPdf = (page, octets) => page.evaluate(async b64 => {
  const doc = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b64), c => c.charCodeAt(0)) }).promise;
  const res = [];
  for (let i = 1; i <= doc.numPages; i++) res.push((await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).join(' '));
  return res;
}, Buffer.from(octets).toString('base64'));
async function ouvrirPage(page, n) {
  await page.dblclick(`.carte:nth-child(${n}) .vignette`);
  await page.waitForSelector('#editeur:not([hidden])');
  await page.waitForTimeout(400);
}
const cadre = page => page.locator('#ed-calque').boundingBox();

// ---------- Scénarios ----------
test('compiler : ajout, rotation, déplacement, enregistrement', { skip: ignorer }, async () => {
  const page = await appli();
  await ajouter(page, ['notice.pdf', 'plan.pdf', 'scan.png'], 6);
  await page.click('.carte:nth-child(2) .vignette');
  await page.keyboard.press('r');
  await page.locator('.carte').nth(0).dragTo(page.locator('.carte').nth(3), { targetPosition: { x: 150, y: 80 } });
  const octets = await enregistrer(page);
  const doc = await PDFLib.PDFDocument.load(octets);
  assert.strictEqual(doc.getPageCount(), 6);
  // Ordre : notice p.2 (tournée), notice p.3, plan p.1 (déjà tourné dans son fichier), notice p.1 (déplacée)
  assert.deepStrictEqual(doc.getPages().slice(0, 4).map(p => p.getRotation().angle), [90, 0, 90, 0]);
  const textes = await texteDuPdf(page, octets);
  assert.deepStrictEqual(textes.slice(0, 4).map(t => (/(Notice CTA|Plan RDC) page \d/.exec(t) || [''])[0]), ['Notice CTA page 2', 'Notice CTA page 3', 'Plan RDC page 1', 'Notice CTA page 1']);
  assert.deepStrictEqual(page.erreurs, []);
  await page.context().close();
});

test('annoter : texte à la volée, position exacte dans le PDF', { skip: ignorer }, async () => {
  const page = await appli();
  await ajouter(page, ['notice.pdf'], 3);
  await ouvrirPage(page, 1);
  const b = await cadre(page);
  await page.click('[data-outil=texte]');
  await page.mouse.click(b.x + b.width * 0.1, b.y + b.height * 0.5);
  await page.keyboard.type('Ajouté é à');
  await page.keyboard.press('Escape');
  await page.click('#ed-fermer');
  const el = await page.evaluate(() => AtelierPDF.etat.pages[0].elements[0]);
  assert.strictEqual(el.texte, 'Ajouté é à');
  assert.ok(Math.abs(el.x - 0.1) < 0.01);
  const textes = await texteDuPdf(page, await enregistrer(page));
  assert.match(textes[0], /Ajouté é à/);
  assert.deepStrictEqual(page.erreurs, []);
  await page.context().close();
});

test('vue d\'une page : zoom, vignettes (navigation, déplacement)', { skip: ignorer }, async () => {
  const page = await appli();
  await ajouter(page, ['notice.pdf', 'plan.pdf'], 5);
  await ouvrirPage(page, 1);
  await page.selectOption('#ed-zoom', '3');
  await page.waitForTimeout(400);
  assert.strictEqual(await page.evaluate(() => document.querySelector('#ed-page').offsetWidth), Math.round(595 * 4));
  await page.keyboard.press('Control+0');
  await page.waitForSelector('.vg >> nth=4');
  await page.click('.vg >> nth=3');
  await page.waitForTimeout(300);
  assert.strictEqual(await page.textContent('#ed-num'), 'Page 4 / 5');
  const v3 = page.locator('.vg').nth(2);
  await page.locator('.vg').nth(0).dragTo(v3, { targetPosition: { x: 60, y: (await v3.boundingBox()).height - 10 } });
  await page.waitForTimeout(300);
  assert.match(await page.evaluate(() => AtelierPDF.etat.pages.map(p => p.index).join(',')), /^1,2,0/);
  assert.deepStrictEqual(page.erreurs, []);
  await page.context().close();
});

test('OCR d\'un scan, recherche (Ctrl+F) et caviardage par mot', { skip: ignorer, timeout: 120000 }, async () => {
  const page = await appli();
  await ajouter(page, ['notice.pdf', 'scan.png'], 4);
  await page.click('#b-ocr');
  await page.waitForFunction(() => AtelierPDF.etat.pages[3].ocr, null, { timeout: 90000 });
  await page.keyboard.press('Control+f');
  await page.fill('#rech-texte', 'vidange');
  await page.waitForFunction(() => /1 \/ 1/.test(document.querySelector('#rech-compte').textContent), null, { timeout: 10000 });
  assert.strictEqual(await page.textContent('#ed-num'), 'Page 4 / 4');
  await page.keyboard.press('Escape');
  page.reponse = '06 12 34 56 78';
  await page.click('#ed-caviarder');
  await page.waitForFunction(() => AtelierPDF.etat.pages[3].elements.filter(e => e.type === 'caviarde').length === 5, null, { timeout: 10000 });
  await page.click('#ed-fermer');
  const textes = await texteDuPdf(page, await enregistrer(page));
  assert.match(textes[3], /vidange/, 'scan interrogeable');
  assert.ok(!/06|78/.test(textes[3]), 'numéro caviardé absent du fichier');
  assert.deepStrictEqual(page.erreurs, []);
  await page.context().close();
});

test('modifier le texte d\'un PDF : ancien texte retiré, nouveau écrit', { skip: ignorer }, async () => {
  const page = await appli();
  await ajouter(page, ['devis.pdf'], 1);
  await ouvrirPage(page, 1);
  await page.click('[data-outil=editertexte]');
  await page.click('.ligne-texte[title^="Date de validité"]');
  for (let k = 0; k < 10; k++) await page.keyboard.press('Backspace');
  await page.keyboard.type('31/12/2026');
  await page.mouse.click(10, 900);
  await page.click('#ed-fermer');
  const [texte] = await texteDuPdf(page, await enregistrer(page));
  assert.match(texte, /31\/12\/2026/);
  assert.ok(!texte.includes('30/11/2026'), 'ancien texte retiré');
  assert.match(texte, /Montant HT : 12 450,00 €/, 'le reste intact');
  assert.deepStrictEqual(page.erreurs, []);
  await page.context().close();
});

test('formulaire : champs remplis puis écrits dans le PDF', { skip: ignorer }, async () => {
  const page = await appli();
  await ajouter(page, ['formulaire.pdf'], 1);
  await ouvrirPage(page, 1);
  await page.waitForSelector('.champ-form[data-nom=client]');
  await page.fill('.champ-form[data-nom=client]', 'Laiterie des Alpes');
  await page.check('.champ-form[data-nom=termine]');
  await page.locator('.champ-form[data-nom=urgence]').nth(1).check();
  await page.click('#ed-fermer');
  const octets = await enregistrer(page);
  const [texte] = await texteDuPdf(page, octets);
  assert.match(texte, /Laiterie des Alpes/);
  assert.strictEqual((await PDFLib.PDFDocument.load(octets)).getForm().getFields().length, 0, 'formulaire figé');
  assert.deepStrictEqual(page.erreurs, []);
  await page.context().close();
});

test('comparer deux indices : recalage automatique et différences', { skip: ignorer }, async () => {
  const page = await appli();
  await ajouter(page, ['plan-A.pdf', 'plan-B.pdf'], 2);
  await page.click('.carte:nth-child(1) .vignette');
  await page.click('.carte:nth-child(2) .vignette', { modifiers: ['Control'] });
  await page.click('#b-comparer');
  await page.waitForSelector('#comparaison:not([hidden])');
  await page.waitForFunction(() => document.querySelector('#occupe').hidden);
  assert.strictEqual(await page.textContent('#cmp-decalage'), 'Décalage -4 ; -3 pt');
  assert.match(await page.textContent('#cmp-info'), /supprimé \(rouge\) et ajouté \(vert\)/);
  assert.deepStrictEqual(page.erreurs, []);
  await page.context().close();
});

test('mesures : échelle, accroche aux traits, angle, zone de détail', { skip: ignorer }, async () => {
  const page = await appli();
  page.reponse = '1/20';
  await ajouter(page, ['plan-A.pdf'], 1);
  await ouvrirPage(page, 1);
  await page.selectOption('#ed-echelle', '1/50');
  await page.click('[data-outil=cote]');
  await page.waitForTimeout(400);
  const b = await page.locator('#ed-page').boundingBox();
  const P = (x, y) => [b.x + x / 842 * b.width, b.y + (595 - y) / 595 * b.height];
  await page.mouse.move(P(60, 500)[0] + 4, P(60, 500)[1] - 3); await page.mouse.down();
  await page.mouse.move(P(300, 500)[0] - 5, P(300, 500)[1] + 4, { steps: 5 }); await page.mouse.up();
  await page.click('[data-outil=angle]');
  for (const [x, y] of [[300, 300], [300, 500], [500, 500]]) await page.mouse.click(P(x, y)[0] + 3, P(x, y)[1] + 3);
  await page.selectOption('#ed-echelle', 'zone');
  await page.mouse.move(...P(530, 520)); await page.mouse.down(); await page.mouse.move(...P(800, 80), { steps: 4 }); await page.mouse.up();
  await page.click('[data-outil=cote]');
  await page.mouse.move(P(540, 500)[0] + 3, P(540, 500)[1]); await page.mouse.down(); await page.mouse.move(P(780, 500)[0] - 4, P(780, 500)[1] + 2, { steps: 4 }); await page.mouse.up();
  const etiquettes = await page.evaluate(() => [...document.querySelectorAll('.el-etiquette')].map(d => d.textContent));
  assert.deepStrictEqual(etiquettes, ['4,23 m', '90,0°', '1,69 m']);
  assert.deepStrictEqual(page.erreurs, []);
  await page.context().close();
});

test('sauvegarde : reprise du travail, fichier projet, PDF rouvert modifiable', { skip: ignorer }, async () => {
  const ctx = await navigateur.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  let page = await appli(ctx);
  await ajouter(page, ['notice.pdf'], 3);
  await page.evaluate(() => { AtelierPDF.etat.pages[0].elements.push({ type: 'cadre', x: 0.1, y: 0.1, w: 0.2, h: 0.1 }); });
  await page.click('#b-droite').catch(() => {}); // sans sélection : rien
  await page.evaluate(() => document.querySelector('#zoom').dispatchEvent(new Event('input')));
  await page.waitForTimeout(1600);
  const pdfModifiable = await enregistrer(page);
  const [dlProjet] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.querySelector('#m-enregistrer').click())]);
  const projet = fs.readFileSync(await dlProjet.path());
  await page.close();
  page = await appli(ctx);
  await page.waitForSelector('#reprise:not([hidden])', { timeout: 5000 });
  await page.click('#reprise-oui');
  await page.waitForFunction(() => AtelierPDF.etat.pages.length === 3);
  assert.strictEqual(await page.evaluate(() => AtelierPDF.etat.pages[0].elements.length), 1, 'travail repris');
  fs.writeFileSync(F('travail.atelierpdf'), projet);
  fs.writeFileSync(F('annote.pdf'), pdfModifiable);
  await ajouter(page, ['travail.atelierpdf', 'annote.pdf'], 9);
  assert.deepStrictEqual(await page.evaluate(() => AtelierPDF.etat.pages.map(p => p.elements.length).join(',')), '1,0,0,1,0,0,1,0,0', 'projet et PDF rouvert avec leurs annotations');
  assert.deepStrictEqual(page.erreurs, []);
  await ctx.close();
});

test('commentaires PDF : annotations exportées pour Acrobat', { skip: ignorer }, async () => {
  const page = await appli();
  await ajouter(page, ['plan.pdf'], 2);
  await page.evaluate(() => { AtelierPDF.etat.pages[0].elements.push({ type: 'fleche', x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.3 }, { type: 'texte', x: 0.5, y: 0.5, texte: 'À voir', taille: 12 }); });
  await page.check('#o-commentaires');
  const doc = await PDFLib.PDFDocument.load(await enregistrer(page));
  const annots = doc.getPage(0).node.lookup(PDFLib.PDFName.of('Annots')).asArray().map(r => doc.context.lookup(r).get(PDFLib.PDFName.of('Subtype')).asString());
  assert.deepStrictEqual(annots, ['/Line', '/FreeText']);
  assert.deepStrictEqual(page.erreurs, []);
  await page.context().close();
});

test('ouverture depuis l\'Explorateur : page de démarrage du lanceur (blocs de données, accents, plusieurs fichiers)', { skip: ignorer }, async () => {
  // Même forme que la page écrite par installer/lanceur/lanceur.c : blocs base64 juste après <meta charset>
  const html = fs.readFileSync(path.join(racine, 'dist/AtelierPDF.html'), 'utf8');
  const i = html.indexOf('<meta charset="utf-8">') + '<meta charset="utf-8">'.length;
  const bloc = (n, nom, f) => `\n<script type="application/octet-stream" id="atelier-fichier-${n}" data-nom="${nom}">${fs.readFileSync(F(f)).toString('base64')}</script>`;
  fs.writeFileSync(F('demarrage.html'), html.slice(0, i) + bloc(0, 'DOE Lot 14 &amp; annexes été (rév. B).pdf', 'notice.pdf') + bloc(1, 'Plan RDC.pdf', 'plan.pdf') + html.slice(i));
  const ctx = await navigateur.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', e => erreurs.push(e.message));
  await page.goto(`file://${F('demarrage.html')}`);
  await page.waitForFunction(() => window.AtelierPDF && AtelierPDF.etat.pages.length === 5);
  assert.deepStrictEqual(await page.evaluate(() => [...AtelierPDF.etat.sources.values()].map(s => s.nom)), ['DOE Lot 14 & annexes été (rév. B)', 'Plan RDC']);
  assert.strictEqual(await page.title(), '2 documents – Atelier PDF');
  assert.strictEqual(await page.evaluate(() => document.querySelectorAll('script[type="application/octet-stream"]').length), 0, 'données libérées');
  assert.ok(await page.isHidden('#reprise'), 'pas de proposition de reprise à l\'ouverture d\'un document');
  assert.deepStrictEqual(erreurs, []);
  await ctx.close();
});

test('Pipe-Fit : connexion personnelle, ouverture d\'un document de chantier, enregistrement en nouvel indice', { skip: ignorer }, async () => {
  // Serveur Pipe-Fit de démonstration, dans ce processus
  process.env.DB_FILE = F('pipefit.db');
  process.env.ADMIN_PASSWORD = 'admin-essai-ui';
  const { server } = require(path.join(racine, 'server/server.js'));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const adresse = `127.0.0.1:${server.address().port}`;
  try {
    const page = await appli();
    await page.click('#b-projet'); await page.click('#m-pf-ouvrir');
    await page.fill('#pf-url', adresse); await page.fill('#pf-login', 'admin'); await page.fill('#pf-mdp', 'mauvais');
    await page.click('#pf-ok');
    await page.waitForFunction(() => /incorrect/.test(document.querySelector('#pf-message').textContent));
    await page.fill('#pf-mdp', 'admin-essai-ui'); await page.click('#pf-ok');
    await page.waitForSelector('#pf-chantiers li');
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('atelierpdf.pipefit.cle')), null, 'aucune clé permanente gardée');
    assert.ok(!(await page.evaluate(() => localStorage.getItem('atelierpdf.pipefit.jeton'))).includes('admin-essai-ui'), 'mot de passe non gardé');
    await page.fill('#pf-filtre', 'ch-2026-001');
    await page.click('#pf-chantiers li >> nth=0');
    await page.click('#pf-docs li >> nth=0');
    await page.waitForFunction(() => AtelierPDF.etat.pages.length > 0, null, { timeout: 15000 });
    await page.evaluate(() => { AtelierPDF.etat.pages[0].elements.push({ type: 'texte', x: 0.1, y: 0.05, texte: 'Vu sur site', taille: 12 }); });
    await page.click('#b-projet'); await page.click('#m-pf-enregistrer');
    await page.waitForSelector('input[name=pf-mode]:checked');
    assert.strictEqual(await page.evaluate(() => document.querySelector('input[name=pf-mode]:checked').value), 'indice', 'nouvel indice proposé');
    await page.click('#pf-ok');
    await page.waitForSelector('#dlg-pf', { state: 'hidden', timeout: 20000 });
    const r = await page.evaluate(async a => {
      const j = JSON.parse(localStorage.getItem('atelierpdf.pipefit.jeton'));
      const l = await (await fetch(`http://${a}/api/records/affaires?limite=50`, { headers: { Authorization: `Bearer ${j.jeton}` } })).json();
      const d = l.find(x => x.code === 'CH-2026-001').documents[0];
      return { indice: d.indice, anciens: d.anciens.map(x => x.indice), par: /\(Atelier PDF\)$/.test(d.par) };
    }, adresse);
    assert.deepStrictEqual(r, { indice: 'C', anciens: ['A', 'B'], par: true }, 'auteur : « Nom (Atelier PDF) »');
    await page.click('#b-projet'); await page.click('#m-pf-deconnexion');
    await page.waitForFunction(() => !localStorage.getItem('atelierpdf.pipefit.jeton'));
    assert.deepStrictEqual(page.erreurs, []);
    await page.context().close();
  } finally {
    server.close(); server.closeAllConnections();
  }
});

test('comparer un plan et son scan tourné et réduit : rotation et échelle retrouvées', { skip: ignorer, timeout: 120000 }, async () => {
  const page = await appli();
  // « Scan » du plan A : tourné de 2°, réduit à 96 %, décalé, avec un équipement ajouté
  const b64 = await page.evaluate(async d => {
    const doc = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(d), c => c.charCodeAt(0)) }).promise;
    const pg = await doc.getPage(1); const vp = pg.getViewport({ scale: 2 });
    const c1 = document.createElement('canvas'); c1.width = vp.width; c1.height = vp.height;
    await pg.render({ canvasContext: c1.getContext('2d'), viewport: vp }).promise;
    const c2 = document.createElement('canvas'); c2.width = vp.width; c2.height = vp.height; const g = c2.getContext('2d');
    g.fillStyle = '#f7f5ef'; g.fillRect(0, 0, c2.width, c2.height);
    g.translate(c2.width / 2 + 25, c2.height / 2 - 15); g.rotate(2 * Math.PI / 180); g.scale(0.96, 0.96); g.translate(-c1.width / 2, -c1.height / 2);
    g.drawImage(c1, 0, 0);
    g.lineWidth = 4; g.strokeStyle = '#111'; g.strokeRect(1200, 500, 240, 160);
    return c2.toDataURL('image/png').split(',')[1];
  }, fs.readFileSync(F('plan-A.pdf')).toString('base64'));
  fs.writeFileSync(F('scan-plan-B.png'), Buffer.from(b64, 'base64'));
  await ajouter(page, ['plan-A.pdf', 'scan-plan-B.png'], 2);
  await page.click('.carte:nth-child(1) .vignette');
  await page.click('.carte:nth-child(2) .vignette', { modifiers: ['Control'] });
  await page.click('#b-comparer');
  await page.waitForSelector('#comparaison:not([hidden])');
  await page.waitForFunction(() => document.querySelector('#occupe').hidden, null, { timeout: 60000 });
  assert.match(await page.textContent('#cmp-decalage'), /rotation -2° · échelle 11\d,\d %/);
  const part = Number((/— ([\d,]+) %/.exec(await page.textContent('#cmp-info')) || [])[1]?.replace(',', '.'));
  assert.ok(part < 0.8, `peu de différences une fois recalé (${part} %) : seulement l'équipement ajouté`);
  assert.deepStrictEqual(page.erreurs, []);
  await page.context().close();
});

test('modifier un texte en biais : repéré, réécrit dans son orientation, ancien texte retiré', { skip: ignorer }, async () => {
  const page = await appli();
  await ajouter(page, ['biais.pdf'], 1);
  await ouvrirPage(page, 1);
  await page.click('[data-outil=editertexte]');
  await page.waitForSelector('.ligne-texte.biais');
  await page.click('.ligne-texte[title^="Tuyauterie"]');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Tuyauterie DN100 pente 1%');
  await page.mouse.click(10, 900);
  await page.click('#ed-fermer');
  assert.strictEqual(await page.evaluate(() => AtelierPDF.etat.pages[0].elements[0].angle), 30);
  const [texte] = await texteDuPdf(page, await enregistrer(page));
  assert.match(texte, /Tuyauterie DN100 pente 1%/);
  assert.ok(!texte.includes('DN80'), 'ancien texte retiré');
  assert.deepStrictEqual(page.erreurs, []);
  await page.context().close();
});

test('aide : visite guidée au premier lancement, « Comment faire ? » (F1) et ses raccourcis', { skip: ignorer }, async () => {
  const ctx = await navigateur.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('visite-essai', '1'); } catch { /* rien */ } });
  const page = await appli(ctx);
  // Premier lancement : la visite démarre, 6 étapes, puis ne revient plus
  await page.waitForSelector('#visite:not([hidden])');
  assert.strictEqual(await page.textContent('#visite-etape'), '1 / 6');
  for (let i = 0; i < 5; i++) await page.click('#visite-suivant');
  assert.strictEqual(await page.textContent('#visite-suivant'), 'Terminer');
  await page.click('#visite-suivant');
  assert.ok(await page.isHidden('#visite'));
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('atelierpdf.visite')), 'vue');
  await page.reload();
  await page.waitForFunction(() => window.AtelierPDF);
  await page.waitForTimeout(400);
  assert.ok(await page.isHidden('#visite'), 'la visite ne revient pas');

  // F1 : recherche dans les fiches, puis « Me montrer » ouvre le bon outil
  await ajouter(page, ['notice.pdf'], 3);
  await page.keyboard.press('F1');
  await page.waitForSelector('#aide:not([hidden])');
  await page.fill('#aide-recherche', 'caviarder');
  const fiches = await page.locator('#aide-liste .fiche summary').allTextContents();
  assert.ok(fiches.some(t => /Caviarder/.test(t)), fiches.join(' | '));
  await page.locator('#aide-liste .fiche', { hasText: 'Caviarder une information' }).locator('button').click();
  await page.waitForSelector('#editeur:not([hidden])');
  assert.ok(await page.locator('[data-outil="caviarde"]').evaluate(b => b.classList.contains('actif')));
  // Recherche sans résultat, puis Échap ferme l'aide
  await page.keyboard.press('Escape');
  await page.click('#ed-aide-bouton');
  await page.fill('#aide-recherche', 'zzzz');
  assert.match(await page.textContent('#aide-liste'), /Aucune fiche/);
  await page.keyboard.press('Escape');
  assert.ok(await page.isHidden('#aide'));
  // La visite peut être relancée depuis l'aide, et passée
  await page.click('#ed-fermer');
  await page.click('#b-aide');
  await page.click('#aide-visite');
  await page.waitForSelector('#visite:not([hidden])');
  await page.click('#visite-passer');
  assert.ok(await page.isHidden('#visite'));
  assert.deepStrictEqual(page.erreurs, []);
  await ctx.close();
});

test('métré : réseaux et diamètres, comptage de symboles, légende, export Excel', { skip: ignorer }, async () => {
  const page = await appli();
  await ajouter(page, ['plan-A.pdf'], 1);
  await ouvrirPage(page, 1);
  await page.selectOption('#ed-echelle', '1/50');
  const b = await page.locator('#ed-page').boundingBox();
  const P = (x, y) => [b.x + x / 842 * b.width, b.y + (595 - y) / 595 * b.height];
  // Longueur d'eau froide DN20 (240 pt au 1/50 = 4,23 m), puis d'eau chaude
  await page.click('[data-outil=longueur]');
  assert.ok(await page.isVisible('#ed-metre'));
  await page.selectOption('#ed-reseau', 'EF');
  await page.fill('#ed-dn', 'DN20'); await page.press('#ed-dn', 'Enter');
  await page.mouse.click(...P(60, 500)); await page.mouse.dblclick(...P(300, 500));
  await page.selectOption('#ed-reseau', 'ECS');
  await page.fill('#ed-dn', ''); await page.press('#ed-dn', 'Enter');
  await page.mouse.click(...P(60, 100)); await page.mouse.dblclick(...P(60, 400));
  // Comptage : 3 radiateurs, un retiré, puis 2 vannes
  await page.click('[data-outil=compte]');
  assert.ok(await page.isVisible('#ed-symbole'));
  await page.selectOption('#ed-reseau', '');
  await page.fill('#ed-symbole', 'Radiateur'); await page.press('#ed-symbole', 'Enter');
  for (const x of [120, 180, 240]) await page.mouse.click(...P(x, 200));
  await page.mouse.click(...P(180, 200));
  await page.fill('#ed-symbole', 'Vanne d\'arrêt'); await page.press('#ed-symbole', 'Enter');
  for (const x of [400, 450]) await page.mouse.click(...P(x, 150));
  const comptes = await page.evaluate(() => window.AtelierPDF.ed.elements.filter(e => e.type === 'compte').map(e => [e.symbole, e.points.length]));
  assert.deepStrictEqual(comptes, [['Radiateur', 2], ['Vanne d\'arrêt', 2]]);
  const couleurs = await page.evaluate(() => window.AtelierPDF.ed.elements.filter(e => e.type === 'longueur').map(e => [e.reseau, e.dn || '', e.couleur]));
  assert.deepStrictEqual(couleurs, [['EF', 'DN20', '#1e88e5'], ['ECS', '', '#e53935']]);
  assert.ok((await page.evaluate(() => [...document.querySelectorAll('.el-etiquette')].map(d => d.textContent))).includes('4,23 m · DN20'));
  // Légende automatique
  await page.click('#ed-legende');
  const lignes = await page.evaluate(() => window.AtelierPDF.ed.elements.find(e => e.type === 'legende').lignes.map(l => l.texte));
  assert.deepStrictEqual(lignes, ['ECS Eau chaude sanitaire : 5,29 m', 'EF Eau froide · DN20 : 4,23 m', 'Radiateur : 2', 'Vanne d\'arrêt : 2']);
  // Réseau changé sur une mesure choisie : couleur et légende suivent
  await page.click('[data-outil=selection]');
  await page.evaluate(() => { const ed = window.AtelierPDF.ed; window.AtelierPDF.choisirElement(ed.elements.findIndex(e => e.type === 'longueur' && e.reseau === 'ECS')); });
  await page.selectOption('#ed-reseau', 'CHD');
  assert.ok((await page.evaluate(() => window.AtelierPDF.ed.elements.find(e => e.type === 'legende').lignes.map(l => l.texte))).includes('CHD Chauffage départ : 5,29 m'));
  // Export Excel
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ed-excel')]);
  assert.match(dl.suggestedFilename(), /^Metre - .*\.xlsx$/);
  const xlsx = fs.readFileSync(await dl.path());
  assert.strictEqual(xlsx.subarray(0, 2).toString(), 'PK');
  const contenu = xlsx.toString('utf8');
  for (const t of ['EF – Eau froide', 'DN20', 'CHD – Chauffage départ', 'Radiateur', 'Vanne d&apos;arrêt'.replace('&apos;', '\'')]) assert.ok(contenu.includes(t), t);
  assert.match(contenu, /<v>4\.23\d*<\/v>/);
  // PDF : légende et numéros des symboles écrits dans la page
  await page.click('#ed-fermer');
  const [texte] = await texteDuPdf(page, await enregistrer(page));
  assert.match(texte, /Légende [-–] échelle 1:50/);
  assert.match(texte, /EF Eau froide · DN20 : 4,23 m/);
  assert.match(texte, /Radiateur : 2/);
  assert.deepStrictEqual(page.erreurs, []);
  await page.context().close();
});

test('DOE : page de garde, sections, documents classés, sommaire à deux niveaux et signets', { skip: ignorer }, async () => {
  await pdf('Fiche technique radiateur.pdf', [{}], (p, f) => p.drawText('Radiateur acier type 22', { x: 60, y: 760, size: 18, font: f }));
  await pdf('PV essai etancheite reseau EF.pdf', [{}], (p, f) => p.drawText('Essai à 10 bar pendant 2 h', { x: 60, y: 760, size: 18, font: f }));
  const page = await appli();
  await ajouter(page, ['notice.pdf', 'plan.pdf', 'devis.pdf', 'Fiche technique radiateur.pdf', 'PV essai etancheite reseau EF.pdf'], 8);
  await page.click('#b-doe');
  await page.fill('#doe-chantier', 'Collège Jean Moulin');
  await page.fill('#doe-moa', 'Département de la Savoie');
  await page.click('#doe-ok');
  const ordre = await page.evaluate(() => { const e = window.AtelierPDF.etat; return e.pages.map(p => p.doe === 'garde' ? 'garde' : p.doe ? p.titre : e.sources.get(p.source).nom); });
  assert.deepStrictEqual(ordre, ['garde', '1. Pièces administratives et attestations', '2. Notices d\'exploitation et de maintenance', 'notice', 'notice', 'notice',
    '3. Fiches techniques des matériels', 'Fiche technique radiateur', '4. Procès-verbaux d\'essais et de mise en service', 'PV essai etancheite reseau EF',
    '5. Relevés d\'équilibrage et de mesures', '6. Plans de recollement', 'plan', 'plan', '7. Garanties et contrats d\'entretien', '8. Autres documents', 'devis']);
  assert.strictEqual(await page.inputValue('#o-titre'), 'DOE – Collège Jean Moulin – Lot CVC – Plomberie');
  const octets = await enregistrer(page);
  const textes = await texteDuPdf(page, octets);
  assert.strictEqual(textes.length, 18);
  assert.match(textes[0], /TECNITUB.*DOSSIER DES OUVRAGES EX[ÉE]CUT[ÉE]S.*Collège Jean Moulin.*Département de la Savoie/);
  assert.doesNotMatch(textes[0], /Page \d/);
  assert.match(textes[1], /Sommaire.*1\. Pièces administratives.*2\. Notices d'exploitation.*notice.*3\. Fiches techniques.*Fiche technique radiateur/);
  assert.match(textes[2], /Collège Jean Moulin .* 1  Pièces administratives et attestations  Page 2 \/ 17/);
  // Signets : une entrée par section, les documents dessous
  const signets = await page.evaluate(async b64 => {
    const doc = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b64), c => c.charCodeAt(0)) }).promise;
    return (await doc.getOutline()).map(o => [o.title, o.items.map(x => x.title)]);
  }, Buffer.from(octets).toString('base64'));
  assert.deepStrictEqual(signets.slice(0, 4), [['Sommaire', []], ['1. Pièces administratives et attestations', []], ['2. Notices d\'exploitation et de maintenance', ['notice']], ['3. Fiches techniques des matériels', ['Fiche technique radiateur']]]);
  // Refaire le DOE après ajout d'un document : structure remplacée, pas dupliquée
  await pdf('Attestation coupe-feu.pdf', [{}], (p, f) => p.drawText('Attestation de rebouchage coupe-feu', { x: 60, y: 760, size: 18, font: f }));
  await ajouter(page, ['Attestation coupe-feu.pdf'], 18);
  await page.click('#b-doe');
  assert.strictEqual(await page.inputValue('#doe-chantier'), 'Collège Jean Moulin');
  await page.click('#doe-ok');
  const ordre2 = await page.evaluate(() => { const e = window.AtelierPDF.etat; return e.pages.map(p => p.doe === 'garde' ? 'garde' : p.doe ? p.titre : e.sources.get(p.source).nom); });
  assert.strictEqual(ordre2.length, 18);
  assert.deepStrictEqual(ordre2.slice(0, 3), ['garde', '1. Pièces administratives et attestations', 'Attestation coupe-feu']);
  assert.deepStrictEqual(page.erreurs, []);
  await page.context().close();
});

test('grands plans : mosaïque A3 à l\'échelle avec plan d\'assemblage, ou plan réduit', { skip: ignorer }, async () => {
  await pdf('grand-plan.pdf', [{ taille: [2384, 1684] }], (p, f) => {
    for (let x = 100; x < 2384; x += 400) p.drawLine({ start: { x, y: 50 }, end: { x, y: 1634 }, thickness: 2 });
    p.drawText('Plan A1 chaufferie', { x: 120, y: 1500, size: 60, font: f });
  });
  const page = await appli();
  await ajouter(page, ['grand-plan.pdf', 'devis.pdf'], 2);
  await page.click('.carte:nth-child(1) .vignette');
  await page.evaluate(() => { window.AtelierPDF.etat.pages[0].echelle = { mmParPt: 25.4 / 72 * 50, libelle: '1/50' }; });
  await page.click('#b-plans');
  assert.match(await page.textContent('#plans-info'), /1 page\(s\) sélectionnée\(s\), dont 1 grand\(s\) format\(s\) \(ex\. 841 × 594 mm\)/);
  await page.selectOption('#plans-format', 'A3');
  await page.check('input[name=plans-mode][value=mosaique]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#plans-enregistrer')]);
  const doc = await PDFLib.PDFDocument.load(fs.readFileSync(await dl.path()));
  // A1 sur A3 (marges et recouvrement compris) : 4 × 2 feuilles A3 à l'échelle réelle, plus le plan d'assemblage
  assert.strictEqual(doc.getPageCount(), 9);
  for (const p of doc.getPages()) { const { width, height } = p.getSize(); assert.deepStrictEqual([Math.round(Math.max(width, height)), Math.round(Math.min(width, height))], [1191, 842]); }
  const textes = await texteDuPdf(page, fs.readFileSync(await dl.path()));
  assert.match(textes[0], /Plan d'assemblage/);
  assert.match(textes[1], /feuille A1 .*1\/50/);
  // Réduit sur une feuille : nouvelle échelle indiquée
  await page.click('#b-plans');
  await page.check('input[name=plans-mode][value=reduire]');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#plans-enregistrer')]);
  const textes2 = await texteDuPdf(page, fs.readFileSync(await dl2.path()));
  assert.strictEqual(textes2.length, 1);
  assert.match(textes2[0], /réduite à \d+(,\d)? % [-–] échelle du plan 1\/50, imprimé au 1\/108 environ/);
  assert.deepStrictEqual(page.erreurs, []);
  await page.context().close();
});
