// Tests des écrans ajoutés avec le registre des équipements : matériel en vrac, registre, parcours guidé, repères et
// branches, bouches (duplication, CTA / extracteur, numérotation), réseau jumeau, longueurs depuis Revit, régulation et
// courbe de chauffe ; dans le CRM, relevé d'équilibrage ↔ PV de mise en service.
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
const doc = fs.readFileSync(path.join(racine, 'docs', 'MODELE-FICHE-TECHNIQUE.md'), 'utf8');
const fiche = t => new RegExp(`<!-- fiche: ${t} -->\\s*\`\`\`text\\n([\\s\\S]*?)\`\`\``).exec(doc)[1].trim();
let dir, navigateur;
const sansPlaywright = !chromium && 'Playwright absent : npm i --no-save playwright && npx playwright install chromium';

before(() => {
  if (!chromium) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-e2e-'));
  execFileSync(process.execPath, [path.join(racine, 'demo', 'build.js'), path.join(dir, 'pipefit-crm-demo.html')], { stdio: 'ignore' });
});
after(async () => { if (navigateur) await navigateur.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

async function ouvrir(fichier) {
  navigateur = navigateur || await chromium.launch();
  const p = await (await navigateur.newContext({ viewport: { width: 1500, height: 1100 } })).newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`file://${path.join(dir, fichier)}`);
  await p.waitForTimeout(1500);
  await p.evaluate(() => { localStorage.clear(); location.reload(); });
  await p.waitForTimeout(2200);
  if (await p.$('input[type=password]')) { await (await p.$$('input'))[0].fill('jacky'); await p.fill('input[type=password]', 'demo'); await p.keyboard.press('Enter'); await p.waitForTimeout(2000); }
  return { p, erreurs };
}
const aller = async (p, h) => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(1200); };
const etat = (p, id, fn) => p.evaluate(([i, f]) => (0, eval)(f)(S.etudes.find(e => e.id === i)), [id, fn.toString()]);

test('Études : matériel en vrac → registre → pièces et branches, valeur corrigée partout, verrous', { skip: sansPlaywright, timeout: 180000 }, async () => {
  const { p, erreurs } = await ouvrir('etudes.html');
  const id = await p.evaluate(() => S.etudes.find(x => !x.modele && x.notes.some(n => n.id === 'n11')).id);
  await aller(p, `#/etude/${id}`);
  await p.click('#vrac2'); await p.waitForTimeout(300);
  await p.click('summary:has-text("Coller des fiches")'); await p.fill('#vr-texte', [fiche('terminal'), fiche('bouche')].join('\n---\n')); await p.click('#vr-coller'); await p.waitForTimeout(400);
  await p.fill('[data-vr="0"][data-k="local"]', 'Bureau 5 ; Salle de formation ×2'); await p.dispatchEvent('[data-vr="0"][data-k="local"]', 'change');
  await p.selectOption('[data-vr="0"][data-k="branche"]', 'arbo:n11|A1');
  await p.selectOption('[data-vr="1"][data-k="cible"]', 'aero:n12'); await p.waitForTimeout(200);
  await p.fill('[data-vr="1"][data-k="local"]', 'Bureau 5 ; Open space ×2'); await p.dispatchEvent('[data-vr="1"][data-k="local"]', 'change');
  await p.selectOption('[data-vr="1"][data-k="branche"]', 'S1.2');
  await p.click('#vr-ok'); await p.waitForTimeout(800);
  assert.match(await p.innerText('#modal'), /3 terminal\(aux\).*3 branche\(s\) raccordée\(s\)/s);
  await p.click('#vr-reg'); await p.waitForTimeout(400);
  await p.click('.carte:has-text("CK-36") [data-rg-z$="|valeurs"]'); await p.waitForTimeout(300);
  await p.fill('[data-rg-v="Pch"]', '3,7'); await p.click('#rg-vok'); await p.waitForTimeout(600);
  const r = await etat(p, id, et => { const t = et.notes.find(n => n.type === 'terminaux'), x = et.equipements.find(e => e.reference === 'CK-36'); return { pch: t.entrees.appareils.filter(a => a.eq === x.id).map(a => a.Pch), branches: et.notes.find(n => n.id === 'n11').entrees.troncons.filter(t => t.emetteur).length, bouches: et.notes.find(n => n.id === 'n12').entrees.bouchesL.length }; });
  assert.ok(r.pch.length >= 5 && r.pch.every(x => x === 3.7), JSON.stringify(r.pch));
  assert.strictEqual(r.branches, 6);
  assert.strictEqual(r.bouches, 9);
  await p.click('#rg-x'); await aller(p, `#/etude/${id}/n8`);
  assert.ok(await p.$('[data-ouvrir-registre]'));
  assert.ok(await p.$eval('input[data-l="appareils.0.Pch"]', i => i.disabled));
  assert.deepStrictEqual(erreurs, []);
});

test('Études : parcours guidé (tout numéroter, raccorder) jusqu\'à 100 %', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('etudes.html');
  const id = await p.evaluate(() => { const et = S.etudes.find(x => !x.modele && x.notes.some(n => n.id === 'n11')), t = et.notes.find(n => n.type === 'terminaux'); t.entrees.appareils.push({ ...t.entrees.appareils[0], rep: 'CA-01', local: 'Bureau 4' }); enregistrer(et); return et.id; });
  await aller(p, `#/etude/${id}`);
  assert.match(await p.innerText('.parcours'), /repère\(s\) manquant\(s\) ou en double/);
  await p.click('[data-parcours="reperes"]'); await p.waitForTimeout(600);
  await p.click('[data-parcours^="note:"]'); await p.waitForTimeout(1500);
  await p.click('#ae-ok'); await p.waitForTimeout(800);
  await aller(p, `#/etude/${id}`);
  const t = await p.innerText('.parcours');
  assert.match(t, /Étude prête|Parcours de l'étude — (83|100) %/);
  assert.doesNotMatch(t, /repère\(s\) manquant/);
  assert.deepStrictEqual(erreurs, []);
});

test('Études : bouches (dupliquer, CTA / extracteur, numérotation complète), réseau jumeau, longueurs Revit', { skip: sansPlaywright, timeout: 150000 }, async () => {
  const { p, erreurs } = await ouvrir('etudes.html');
  const ids = await p.evaluate(() => { const et = S.etudes.find(x => !x.modele && x.notes.some(n => n.id === 'n12')), s = nouvelleNote('aero'); Object.assign(s.entrees, { structure: 'arborescence', producteur: 'extraction', titreInstallation: 'Sanitaires', bouchesL: [] }); s.titre = 'Extraction sanitaires'; et.notes.push(s); enregistrer(et); return { id: et.id, s: s.id }; });
  await aller(p, `#/etude/${ids.id}/n12`);
  await p.click('[data-dup-ligne="bouchesL.0"]'); await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => document.activeElement.dataset.l), 'bouchesL.1.salle');
  await p.keyboard.type('Bureau 9'); await p.waitForTimeout(300);
  await p.selectOption('[data-l="bouchesL.1.installation"]', ids.s); await p.waitForTimeout(800);
  let r = await etat(p, ids.id, et => et.notes.filter(n => n.type === 'aero').map(n => n.entrees.bouchesL.map(b => `${b.rep}:${b.salle}:${b.reseau}`).join(',')));
  assert.ok(r.some(x => /:Bureau 9:extraction/.test(x)), r.join(' | '));
  await p.click('#num-bouches'); await p.waitForTimeout(300);
  await p.check('[name="nb-mode"][value="tout"]'); await p.selectOption('#nb-prefixe', 'reseau'); await p.selectOption('#nb-portee', 'tous'); await p.click('#nb-ok'); await p.waitForTimeout(600);
  r = await etat(p, ids.id, et => et.notes.filter(n => n.type === 'aero').flatMap(n => n.entrees.bouchesL.map(b => b.rep)));
  assert.ok(r.includes('S-01') && r.includes('E-01') && new Set(r).size === r.length, r.join(','));
  // Réseau jumeau froid
  await aller(p, `#/etude/${ids.id}/n11`);
  await p.click('#arbo-jumeau'); await p.waitForTimeout(300); await p.click('#jm-ok'); await p.waitForTimeout(1200);
  assert.ok(await p.$('#arbo-recopier'));
  r = await etat(p, ids.id, et => et.notes.filter(n => n.type === 'arbo').map(n => [n.entrees.saison, n.entrees.troncons.filter(t => t.emetteur).length]));
  assert.deepStrictEqual(r, [['chaud', 3], ['froid', 3]]);
  // Longueurs depuis une nomenclature Revit (CSV)
  await aller(p, `#/etude/${ids.id}/n11`);
  await p.click('#longueurs-plan'); await p.waitForTimeout(300);
  await p.setInputFiles('#lg-f', { name: 'nomenclature.csv', mimeType: 'text/csv', buffer: Buffer.from('Repère;Longueur (mm)\nA1;9000\nA1;3000\nCA-02;7500\n') });
  await p.waitForTimeout(500);
  assert.match(await p.innerText('#lg-res'), /2 tronçon\(s\) trouvé\(s\)/);
  await p.click('#lg-ok'); await p.waitForTimeout(600);
  r = await etat(p, ids.id, et => et.notes.find(n => n.id === 'n11').entrees.troncons.filter(t => ['A1', 'CA-02'].includes(t.rep)).map(t => t.L));
  assert.deepStrictEqual(r, [12, 7.5]);
  assert.deepStrictEqual(erreurs, []);
});

test('Études : régulation (armoire en régulateurs préprogrammés) et courbe de chauffe', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('etudes.html');
  const id = await p.evaluate(() => S.etudes.find(x => !x.modele && x.notes.some(n => n.id === 'n13')).id);
  await aller(p, `#/etude/${id}/n13`); await p.waitForTimeout(800);
  await p.click('[data-onglet="Régulation"]'); await p.waitForTimeout(500);
  const t = await p.innerText('#resultats');
  assert.match(t, /Analyse fonctionnelle — Chaufferie bâtiment A/);
  assert.match(t, /Paramètres à régler et vérifier/);
  assert.match(t, /Régulateurs préprogrammés — armoire AR-CVC-01/);
  await aller(p, `#/etude/${id}/n7`);
  await p.click('[data-onglet="Régulation"]'); await p.waitForTimeout(500);
  assert.ok(await p.$('#resultats .schema svg'));
  assert.match(await p.innerText('#resultats'), /pente ≈/);
  assert.deepStrictEqual(erreurs, []);
});

test('CRM : relevé d\'équilibrage repris de l\'étude ↔ PV de mise en service, sans ressaisie', { skip: sansPlaywright, timeout: 150000 }, async () => {
  const { p, erreurs } = await ouvrir('pipefit-crm-demo.html');
  const ts = await p.evaluate(() => { const l = window.DEMO_LIEN_ETUDE; return PlanMes.plan({ affaireId: l.affaireId, materiel: [], points: PlanMes.pointsChantier([l]), debits: MaterielRetenu.debitsChantier([l]).map(d => ({ ...d, etude: 'Étude' })), pv: { mises: [], epreuves: [], equilibrages: [] }, suivi: {} }).map(t => ({ libelle: t.libelle, nature: t.nature, lien: t.lien })); });
  const eq = ts.find(t => t.nature === 'equilibrage' && /aéraulique : Bureaux/.test(t.libelle)), mes = ts.find(t => t.nature === 'mes' && /Ventilation des bureaux/.test(t.libelle));
  assert.ok(eq && mes);
  await aller(p, eq.lien); await p.waitForTimeout(1500);
  assert.strictEqual(await p.inputValue('[data-l="0|repere"]'), 'S-01');
  await p.fill('[data-l="0|mesure"]', '210'); await p.dispatchEvent('[data-l="0|mesure"]', 'input');
  await p.fill('[data-l="0|reglage"]', 'cône 3'); await p.dispatchEvent('[data-l="0|reglage"]', 'input');
  await p.click('button:has-text("Enregistrer le brouillon")'); await p.waitForTimeout(1200);
  await aller(p, mes.lien); await p.waitForTimeout(1500);
  await p.click('#es-reprendre-releve'); await p.waitForTimeout(800);
  const v = await p.evaluate(() => { const i = document.querySelector('td input[data-mes]'); return [i.value, i.closest('tr').querySelector('[data-mesreg]').value]; });
  assert.deepStrictEqual(v, ['210', 'cône 3']);
  assert.ok(await p.$('#es-renum'));
  assert.deepStrictEqual(erreurs, []);
});
