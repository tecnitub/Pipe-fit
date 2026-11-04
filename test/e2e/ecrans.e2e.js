// Tests des écrans (navigateur) sur la version de démonstration : chaque calcul des Études s'ouvre sans erreur, les
// boutons principaux fonctionnent (foisonnement, vues, collage Excel, tableau de bord), le CRM et le DOE s'ouvrent.
// Usage : npm run test:e2e   (construit la démo dans un dossier temporaire ; Chromium via Playwright)
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-e2e-'));
  execFileSync(process.execPath, [path.join(racine, 'demo', 'build.js'), path.join(dir, 'pipefit-crm-demo.html')], { stdio: 'ignore' });
});
after(async () => { if (navigateur) await navigateur.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

// Page ouverte, erreurs JavaScript collectées
async function ouvrir(fichier, taille = { width: 1400, height: 1000 }) {
  navigateur = navigateur || await chromium.launch();
  const p = await (await navigateur.newContext({ viewport: taille })).newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_FILE_NOT_FOUND|net::/.test(m.text())) erreurs.push(m.text()); });
  await p.goto(`file://${path.join(dir, fichier)}`);
  await p.waitForTimeout(1500);
  return { p, erreurs };
}
async function etudes() {
  const o = await ouvrir('etudes.html');
  await o.p.evaluate(() => { localStorage.clear(); location.reload(); });
  await o.p.waitForTimeout(2000);
  if (await o.p.$('input[type=password]')) { await (await o.p.$$('input'))[0].fill('jacky'); await o.p.fill('input[type=password]', 'demo'); await o.p.keyboard.press('Enter'); await o.p.waitForTimeout(2000); }
  return o;
}

test('Études : chaque type de calcul s\'ouvre et calcule sans erreur', { skip: sansPlaywright, timeout: 240000 }, async () => {
  const { p, erreurs } = await etudes();
  const r = await p.evaluate(() => { const et = S.etudes.find(x => !x.modele); const types = Object.keys(Notes.TYPES); types.forEach(t => et.notes.push(nouvelleNote(t))); enregistrer(et); return { id: et.id, notes: et.notes.slice(-types.length).map(n => [n.id, n.type]) }; });
  for (const [id, type] of r.notes) {
    await p.evaluate(([e, n]) => { location.hash = `#/etude/${e}/${n}`; }, [r.id, id]);
    await p.waitForTimeout(250);
    const ok = await p.evaluate(() => !!document.querySelector('#resultats') && document.querySelector('#resultats').innerText.length > 20);
    assert.ok(ok, `${type} : résultats absents`);
    assert.deepStrictEqual(erreurs, [], `${type} : erreurs JavaScript`);
  }
  // Tableau de bord de l'étude
  await p.evaluate(e => { location.hash = `#/etude/${e}`; }, r.id); await p.waitForTimeout(1500);
  assert.match(await p.innerText('.tableau-bord'), /Tableau de bord/);
  assert.deepStrictEqual(erreurs, []);
});

test('Études : sanitaire (foisonnement, fiches, vues, collage Excel)', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await etudes();
  const ids = await p.evaluate(() => { const et = S.etudes.find(x => !x.modele), e = nouvelleNote('ecs'), s = nouvelleNote('sanitaire'); s.entrees.production = e.id; et.notes.push(e, s); enregistrer(et); return { e: et.id, s: s.id, ballon: e.id }; });
  await p.evaluate(x => { location.hash = `#/etude/${x.e}/${x.s}`; }, ids); await p.waitForTimeout(1200);
  assert.match(await p.innerText('.fiches-install'), /Production d'ECS/);
  await p.click('#san-foison'); await p.waitForTimeout(300); await p.click('[data-sf="aucun"]'); await p.waitForTimeout(800);
  assert.match(await p.innerText('#san-foison'), /aucun/);
  // Vues : résultats seuls puis saisie seule
  await p.click('[data-vue-note="resultats"]');
  assert.strictEqual(await p.$eval('.calc-saisie', x => getComputedStyle(x).display), 'none');
  await p.click('[data-vue-note="saisie"]');
  assert.strictEqual(await p.$eval('.calc-resultats', x => getComputedStyle(x).display), 'none');
  await p.click('[data-vue-note="tout"]');
  // Collage d'un tableau Excel à partir du repère du premier point : deux lignes, appareil reconnu par son libellé
  await p.evaluate(() => {
    const el = document.querySelector('[data-l="points.0.rep"]'), dt = new DataTransfer();
    dt.setData('text/plain', 'LV-10\tSanitaires F\tR+2\tLavabo\nDO-11\tVestiaire F\tR+2\tDouche\n');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await p.waitForTimeout(800);
  const pts = await p.evaluate(x => S.etudes.find(e => e.id === x.e).notes.find(n => n.id === x.s).entrees.points.slice(0, 2).map(q => [q.rep, q.salle, q.etage, q.type]), ids);
  assert.deepStrictEqual(pts, [['LV-10', 'Sanitaires F', 'R+2', 'lavabo'], ['DO-11', 'Vestiaire F', 'R+2', 'douche']]);
  // Le ballon reprend les besoins des points de puisage
  await p.evaluate(x => { location.hash = `#/etude/${x.e}/${x.ballon}`; }, ids); await p.waitForTimeout(1000);
  assert.ok(await p.$eval('[data-k="Vj"]', x => x.disabled));
  assert.deepStrictEqual(erreurs, []);
});

test('Études : bilan pièce par pièce → terminaux créés', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await etudes();
  const ids = await p.evaluate(() => { const et = S.etudes.find(x => !x.modele), b = nouvelleNote('pieces'), t = nouvelleNote('terminaux'); t.entrees.appareils = []; et.notes.push(b, t); enregistrer(et); return { e: et.id, t: t.id }; });
  await p.evaluate(x => { location.hash = `#/etude/${x.e}/${x.t}`; }, ids); await p.waitForTimeout(1200);
  await p.click('#term-pieces'); await p.waitForTimeout(1000);
  const locaux = await p.evaluate(x => S.etudes.find(e => e.id === x.e).notes.find(n => n.id === x.t).entrees.appareils.map(a => a.local), ids);
  assert.deepStrictEqual(locaux, ['Bureau 1', 'Bureau 2', 'Salle de réunion']);
  assert.match(await p.innerText('#resultats'), /Besoins des pièces/);
  assert.deepStrictEqual(erreurs, []);
});

test('CRM et DOE de démonstration s\'ouvrent sans erreur', { skip: sansPlaywright, timeout: 120000 }, async () => {
  for (const f of ['pipefit-crm-demo.html', 'doe.html']) {
    const { p, erreurs } = await ouvrir(f);
    assert.ok((await p.evaluate(() => document.body.innerText.length)) > 50, `${f} vide`);
    assert.deepStrictEqual(erreurs, [], f);
  }
});
