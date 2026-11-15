// Travail à plusieurs sur une même étude, sur la version de démonstration : deux onglets, deux personnes (Jacky et
// Claire) modifient la même étude ; changements sur des parties différentes réunis sans question, même donnée changée
// des deux côtés tranchée dans le dialogue de conflit, présence affichée, versions et corbeille des calculs.
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-collab-'));
  execFileSync(process.execPath, [path.join(racine, 'demo', 'build.js'), path.join(dir, 'pipefit-crm-demo.html')], { stdio: 'ignore' });
});
after(async () => { if (navigateur) await navigateur.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

async function onglet(ctx, login, vider) {
  const p = await ctx.newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`file://${path.join(dir, 'etudes.html')}`);
  await p.waitForTimeout(1000);
  if (vider) { await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); location.reload(); }); await p.waitForTimeout(1200); }
  // Nouvel onglet : connecté avec le dernier compte choisi ; il se déconnecte pour prendre le sien
  else if (await p.evaluate(l => !!S.me && S.me.login !== l, login)) { await p.evaluate(async () => { await api('POST', '/api/logout', {}); location.reload(); }); await p.waitForTimeout(1200); }
  if (await p.$('input[type=password]')) { await (await p.$$('input'))[0].fill(login); await p.fill('input[type=password]', 'demo'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500); }
  return { p, erreurs };
}
// Attend la fin des enregistrements de l'étude dans l'onglet
const enregistre = (p, id) => p.waitForFunction(i => { const st = S.enCours.get(i) || {}; return !st.vol && !st.attente; }, id, { timeout: 15000 });

test('deux onglets, deux personnes sur la même étude : fusion, conflit, présence, versions et corbeille', { skip: sansPlaywright, timeout: 240000 }, async () => {
  navigateur = await chromium.launch();
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
  const A = await onglet(ctx, 'jacky', true), B = await onglet(ctx, 'claire', false);
  assert.strictEqual(await A.p.evaluate(() => S.me.login), 'jacky');
  assert.strictEqual(await B.p.evaluate(() => S.me.login), 'claire');
  // Jacky enregistre l'étude d'exemple (version connue des deux onglets)
  const id = await A.p.evaluate(() => { const et = S.etudes.find(x => !x.modele && x.notes.length >= 2); enregistrer(et); return et.id; });
  await enregistre(A.p, id);
  await B.p.evaluate(() => location.reload()); await B.p.waitForTimeout(1500);
  for (const o of [A, B]) { await o.p.evaluate(i => { location.hash = `#/etude/${i}`; }, id); await o.p.waitForTimeout(500); }
  // Les deux onglets peuvent réenregistrer seuls (suivi des étapes une fois le chantier lu) : on attend qu'ils soient
  // stables puis qu'ils convergent vers la même version par le signalement de présence
  let v1 = 0, v2 = -1;
  for (let k = 0; k < 15 && v1 !== v2; k++) {
    await A.p.waitForTimeout(600); await enregistre(A.p, id); await enregistre(B.p, id);
    await A.p.evaluate(() => Collaboration.battre()); await B.p.evaluate(() => Collaboration.battre());
    await enregistre(A.p, id); await enregistre(B.p, id);
    v1 = await A.p.evaluate(i => etudeDe(i)._v, id); v2 = await B.p.evaluate(i => etudeDe(i)._v, id);
  }
  assert.strictEqual(v2, v1, 'les deux onglets ont la même version de l\'étude');
  const v0 = v1;

  // Présence : chacun voit l'autre sur l'étude
  await A.p.evaluate(() => Collaboration.battre());
  await B.p.evaluate(() => Collaboration.battre());
  await B.p.waitForSelector('.presence-etude');
  assert.match(await B.p.textContent('.presence-etude'), /Jacky/);

  // 1. Parties différentes : Jacky change l'objet détaillé, Claire (version dépassée) commente le premier calcul
  await A.p.evaluate(i => { const et = etudeDe(i); et.description = 'Description de Jacky'; enregistrer(et); }, id);
  await enregistre(A.p, id);
  await B.p.evaluate(i => { const et = etudeDe(i); et.notes[0].commentaire = 'Commentaire de Claire'; enregistrer(et); }, id);
  await B.p.waitForFunction(i => etudeDe(i).description === 'Description de Jacky', id, { timeout: 15000 });
  await enregistre(B.p, id);
  assert.ok(await B.p.evaluate(() => document.getElementById('modal').hidden), 'pas de dialogue pour des parties différentes');
  assert.strictEqual(await B.p.evaluate(i => etudeDe(i).notes[0].commentaire, id), 'Commentaire de Claire');
  // Jacky reçoit la version fusionnée de Claire au prochain signalement (rien en cours chez lui)
  await A.p.evaluate(() => Collaboration.battre());
  await A.p.waitForFunction(i => etudeDe(i).notes[0].commentaire === 'Commentaire de Claire', id, { timeout: 15000 });
  assert.strictEqual(await A.p.evaluate(i => etudeDe(i).description, id), 'Description de Jacky');

  // 2. Même donnée des deux côtés : dialogue « mes changements / ceux de Jacky », choix par élément
  const vA = await A.p.evaluate(i => etudeDe(i)._v, id), vB = await B.p.evaluate(i => etudeDe(i)._v, id);
  assert.strictEqual(vA, vB);
  await A.p.evaluate(i => { const et = etudeDe(i); et.verificateur = 'Vérifié par Jacky'; et.notes[1].commentaire = 'Note de Jacky'; enregistrer(et); }, id);
  await enregistre(A.p, id);
  await B.p.evaluate(i => { const et = etudeDe(i); et.verificateur = 'Vérifié par Claire'; et.notes[1].commentaire = 'Note de Claire'; et.approbateur = 'Claire'; enregistrer(et); }, id);
  await B.p.waitForSelector('#modal:not([hidden]) .conflits-fusion', { timeout: 15000 });
  const lignes = await B.p.$$eval('.conflits-fusion tbody tr', t => t.map(x => x.innerText));
  assert.strictEqual(lignes.length, 2, lignes.join('\n'));
  assert.match(await B.p.textContent('#modal'), /Ceux de Jacky/);
  // Vérificateur : celui de Jacky ; commentaire du calcul : le mien
  await B.p.check('.conflits-fusion tr[data-conflit] input[value=distant] >> nth=0');
  await B.p.click('#cf-ok');
  await enregistre(B.p, id);
  const et = await B.p.evaluate(i => { const e = etudeDe(i); return { v: e.verificateur, c: e.notes[1].commentaire, a: e.approbateur, ver: e._v }; }, id);
  const choixVerif = lignes[0].includes('Vérificateur');
  assert.deepStrictEqual([et.v, et.c, et.a], choixVerif ? ['Vérifié par Jacky', 'Note de Claire', 'Claire'] : ['Vérifié par Claire', 'Note de Jacky', 'Claire']);
  assert.ok(et.ver > vA);

  // 3. Versions et corbeille : Claire supprime un calcul puis le restaure seul
  const titre = await B.p.evaluate(i => { const e = etudeDe(i), n = e.notes.pop(); enregistrer(e); return n.titre; }, id);
  await enregistre(B.p, id);
  await B.p.evaluate(i => { location.hash = `#/etude/${i}`; }, id); await B.p.waitForTimeout(400);
  await B.p.click('#versions-etude');
  await B.p.waitForSelector('#modal:not([hidden]) table.versions-etude');
  const nbVersions = await B.p.$$eval('table.versions-etude tbody tr', t => t.length);
  assert.ok(nbVersions >= 3, `${nbVersions} version(s)`);
  assert.match(await B.p.textContent('table.versions-etude'), /Fusion avec les modifications de Jacky/);
  assert.match(await B.p.textContent('table.corbeille-etude'), new RegExp(titre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const nNotes = await B.p.evaluate(i => etudeDe(i).notes.length, id);
  await B.p.click('table.corbeille-etude [data-corbeille]');
  await B.p.waitForFunction(([i, n]) => etudeDe(i).notes.length === n, [id, nNotes + 1], { timeout: 15000 });
  await enregistre(B.p, id);
  assert.strictEqual(await B.p.evaluate(i => etudeDe(i).notes[etudeDe(i).notes.length - 1].titre, id), titre);
  // Aperçu puis restauration de la première version : nouvelle version, l'état précédent reste dans l'historique
  await B.p.evaluate(i => { location.hash = `#/etude/${i}`; }, id); await B.p.waitForTimeout(400);
  await B.p.click('#versions-etude');
  await B.p.waitForSelector('#modal:not([hidden]) table.versions-etude');
  await B.p.click('table.versions-etude tbody tr:last-child [data-restaurer]');
  await B.p.waitForSelector('#modal:not([hidden]) [data-ok]');
  await B.p.click('[data-ok]');
  await B.p.waitForFunction(i => etudeDe(i).description !== 'Description de Jacky', id, { timeout: 15000 });
  await enregistre(B.p, id);
  assert.notStrictEqual(await B.p.evaluate(i => etudeDe(i).description, id), 'Description de Jacky');
  await B.p.click('#versions-etude');
  await B.p.waitForSelector('#modal:not([hidden]) table.versions-etude');
  assert.match(await B.p.textContent('table.versions-etude tbody tr:first-child'), /Restauration de la version/);
  assert.deepStrictEqual([...A.erreurs, ...B.erreurs], []);
});
