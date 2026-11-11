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
  // Isométrique avec cartouche (numéro ISO-xx du chantier, indice) sur une page A3 paysage
  const pdf = await p.evaluate(async () => { const r = { affaireId: Store.all('affaires')[0].id, ligne: 'EG-e2e', indice: 'C', date: '2026-11-06', matiere: 'Acier P235GH', dn: 50, elements: [{ t: 'tube', dn: 50, auto: true, cote: 1200 }, { t: 'coude', dn: 50, vers: 'N' }, { t: 'tube', dn: 50, l: 800 }] };
    const svg = svgIsoReleve(r), b = PDF.imagesA3([await PDF.svgEnJpeg(svg, 1200)], 'e2e'); return { svg: /N° d'isométrique/.test(svg) && /ISO-\d\d \/ \d\d/.test(svg) && />C</.test(svg), entete: String.fromCharCode(...b.slice(0, 8)), a3: new TextDecoder('latin1').decode(b).includes('/MediaBox [0 0 1190.55 841.89]') }; });
  assert.deepStrictEqual(pdf, { svg: true, entete: '%PDF-1.4', a3: true });
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
  assert.match(t, /Synthèse des entrées \/ sorties/); assert.match(t, /Logique de fonctionnement pas à pas/); assert.match(t, /À valider avant la saisie/);
  // Cahier de paramétrage : Word (document modifiable) et Excel (un onglet par rubrique)
  for (const [btn, ext] of [['#elec-cahier-docx', 'docx'], ['#elec-cahier-xlsx', 'xlsx']]) {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.click(btn)]);
    assert.ok(dl.suggestedFilename().endsWith(`.${ext}`), dl.suggestedFilename());
    const b = fs.readFileSync(await dl.path()); assert.strictEqual(b.slice(0, 2).toString(), 'PK');
    if (ext === 'docx') assert.ok(b.includes(Buffer.from('word/document.xml')));
  }
  assert.deepStrictEqual(erreurs, []);
});

test('Études : profil de bâtiment, EDE BACnet, analyse fonctionnelle, étiquettes, relevés de la GTB', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('etudes.html');
  await p.evaluate(() => { const et = S.etudes.find(x => !x.modele && x.notes.some(n => n.type === 'elec')); const n = et.notes.find(x => x.type === 'elec'); n.entrees.marqueAutomate = 'wit'; n.entrees.profilBatiment = 'enseignement'; n.entrees.armoires.forEach(a => { a.techno = 'automate'; }); enregistrer(et); location.hash = `#/etude/${et.id}/${n.id}`; });
  await p.waitForTimeout(2000);
  await p.click('#elec-profil'); await p.waitForTimeout(800);
  const zp = await p.evaluate(() => { const et = S.etudes.find(x => !x.modele && x.notes.some(n => n.type === 'elec')), zs = ConsignesProjet.zonesEtude(et).map(z => z.zone); return { saisies: et.notes.find(x => x.type === 'elec').entrees.consignesZones.map(z => z.zone), attendues: zs.length ? zs : ['Salles de cours', 'Restauration', 'Gymnase'] }; });
  assert.deepStrictEqual(zp.saisies, zp.attendues);
  const recus = []; p.on('download', d => recus.push(d));
  const dl = async (sel, n = 1) => { const avant = recus.length; await p.click(sel); for (let k = 0; k < 60 && recus.length < avant + n; k++) await p.waitForTimeout(250); const out = []; for (const d of recus.slice(avant, avant + n)) out.push([d.suggestedFilename(), fs.readFileSync(await d.path())]); return out; };
  const ede = await dl('#elec-ede', 2);
  assert.ok(ede.some(([nom, b]) => /^EDE_.*\.csv$/.test(nom) && /VERSION_OF_LAYOUT;2\.3/.test(b.toString())) && ede.some(([nom]) => /_StateTexts\.csv$/.test(nom)));
  const [[nomAf, af]] = await dl('#elec-af'); assert.ok(/^Analyse_fonctionnelle_.*\.docx$/.test(nomAf) && af.slice(0, 2).toString() === 'PK');
  await p.click('#elec-etiq'); await p.waitForTimeout(400);
  const [[nomEt, pdf]] = await dl('#et-pdf'); assert.ok(/\.pdf$/.test(nomEt) && pdf.slice(0, 5).toString() === '%PDF-');
  await p.click('#et-fermer');
  const csv = ['Date;T ext;Départ Radiateurs;Ambiance', ...Array.from({ length: 8 }, (_, i) => `2026-01-0${i + 1} 08:00;${-4 + i};55;18`)].join('\n');
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#elec-releves')]);
  await fc.setFiles({ name: 'releves.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }); await p.waitForTimeout(1000);
  assert.match(await p.textContent('.modal, #modal, body'), /Relevés de la GTB : 8 mesure/);
  assert.deepStrictEqual(erreurs, []);
});

test('CRM : réception pilotée par les PV (réserves reprises, PV de régulation bloquant) ; Études : demande de prix du matériel de régulation', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('pipefit-crm-demo.html');
  const id = await p.evaluate(() => {
    const a = Store.all('affaires').find(x => !Store.all('receptions').some(r => r.affaireId === x.id && r.statut === 'Signé'));
    Store.upsert('misesEnService', { affaireId: a.id, numero: 'MS-E2E', equipement: 'Réglages de la régulation — valeurs du cahier (e2e)', statut: 'Brouillon', date: '2026-11-10', controles: [{ libelle: 'Planning PL_Z1 saisi', etat: 'Non conforme', obs: 'samedi oublié' }], mesures: [] });
    location.hash = `#/reception/${a.id}`; return a.id; });
  await p.waitForTimeout(1500);
  const t = await p.textContent('main, #app, body');
  assert.match(t, /PV de régulation à signer avant la réception/); assert.match(t, /point\(s\) non conforme\(s\) dans les PV/);
  await p.click('#mes-res'); await p.waitForTimeout(600);
  assert.ok(await p.evaluate(x => Store.all('reserves').some(r => r.affaireId === x && /samedi oublié/.test(r.description) && r.cleMes), id));
  assert.ok(!(await p.$('#mes-res')));
  assert.match(await p.textContent('main, #app, body'), /la réception attend les PV de réglage et d'essais/);
  assert.deepStrictEqual(erreurs, []);
  // Études : demande de prix du matériel de régulation
  const e2 = await ouvrir('etudes.html');
  await e2.p.evaluate(() => { const et = S.etudes.find(x => !x.modele && x.notes.some(n => n.type === 'elec')); const n = et.notes.find(x => x.type === 'elec'); n.entrees.marqueAutomate = 'wit'; n.entrees.armoires.forEach(a => { a.techno = 'automate'; }); enregistrer(et); location.hash = `#/etude/${et.id}/${n.id}`; });
  await e2.p.waitForTimeout(2000);
  await e2.p.click('#elec-achat-reg'); await e2.p.waitForTimeout(500);
  const m = await e2.p.textContent('#ar-c');
  assert.match(m, /Matériel de régulation — demande de prix/); assert.match(m, /PLUG/);
  assert.deepStrictEqual(e2.erreurs, []);
});

test('CRM : bibliothèque au format du modèle d\'export (marge, catégories, unités, variantes fournisseur)', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('pipefit-crm-demo.html');
  const X = require(path.join(racine, 'public/js/xlsx'));
  const rows = [['Référence', 'Description', 'Fournisseur', 'Unité', "Prix d'achat", 'Marge', 'Catégories'],
    ['E2E-1', 'Coude e2e', 'Fournisseur E2E', 'Pièce', '4,83000', '100,00', 'Raccords|Acier|Coudes 90'],
    ['E2E-1', 'Coude e2e', 'Fournisseurs E2E Bis', 'Pièce', '4,50000', '100,00', 'Raccords|Acier|Coudes 90'],
    ['E2E-2', 'Pose e2e', 'Fournisseur E2E', 'Heure(s)', '40,00000', '25,00', 'Main d\'oeuvre'],
    ['E2E-3', 'Tube e2e', 'fournisseur e2e', 'Ml', '2,00000', '50,00', '']];
  const fichier = path.join(dir, 'export_modele.xlsx');
  fs.writeFileSync(fichier, Buffer.from(X.build([{ name: 'Worksheet', rows }])));
  await p.evaluate(() => { location.hash = '#/articles'; }); await p.waitForTimeout(1500);
  await p.click('[data-import="articles"]'); await p.waitForTimeout(400);
  await p.setInputFiles('#imp-file', fichier); await p.waitForTimeout(1200);
  await p.click('#imp-go'); await p.waitForTimeout(2000);
  const txt = await p.textContent('#modal');
  assert.match(txt, /1<\/strong>|variante\(s\) fournisseur/);
  const a = await p.evaluate(() => { const l = Store.all('articles').filter(x => /^E2E-/.test(x.ref)).sort((x, y) => x.ref.localeCompare(y.ref)); return l.map(x => ({ ref: x.ref, u: x.unite, pa: x.coutRevient, pv: x.prixVente, f: [x.famille, x.sousFamille, x.gamme], d: clientName(x.fournisseurId), v: (x.fournisseursConsult || []).map(clientName), pf: Object.values(x.prixFournisseurs || {}) })); });
  assert.strictEqual(a.length, 3);
  assert.deepStrictEqual(a[0], { ref: 'E2E-1', u: 'u', pa: 4.83, pv: 9.66, f: ['Raccords', 'Acier', 'Coudes 90'], d: 'Fournisseur E2E', v: ['Fournisseurs E2E Bis'], pf: [{ coutRevient: 4.5, marge: 100 }] });
  assert.strictEqual(a[1].u, 'h'); assert.strictEqual(a[1].pv, 50); assert.strictEqual(a[2].u, 'ml');
  assert.strictEqual(a[2].d, 'Fournisseur E2E');
  assert.ok(await p.evaluate(() => { const l = Store.all('articles').find(x => x.ref === 'E2E-1'); return ArticlesModele.lignesVariantes(l, clientName).length === 2; }));
  await p.evaluate(() => Modal.close()); await p.waitForTimeout(500);
  assert.ok(await p.$('[data-export-modele]'));
  assert.deepStrictEqual(erreurs, []);
});
