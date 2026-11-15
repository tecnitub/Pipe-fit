// Ergonomie Études et DOE sur la version de démonstration :
// - téléphone (390 px) : pas de défilement horizontal de la page ni de cible tactile de moins de 40 px sur les écrans
//   principaux (liste des études, étude, notes de calcul, installation hydraulique, dialogue CCTP / DPGF, DOE) ;
// - ordinateur : en-tête collant des tableaux de lignes, Entrée pour passer à la ligne suivante, groupes repliables,
//   schéma zoomable, boutons d'un grand dialogue toujours visibles.
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-ergo-'));
  execFileSync(process.execPath, [path.join(racine, 'demo', 'build.js'), path.join(dir, 'pipefit-crm-demo.html')], { stdio: 'ignore' });
});
after(async () => { if (navigateur) await navigateur.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

async function ouvrir(fichier, taille, mobile) {
  navigateur = navigateur || await chromium.launch();
  const p = await (await navigateur.newContext({ viewport: taille, isMobile: mobile, hasTouch: mobile })).newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`file://${path.join(dir, fichier)}`);
  await p.waitForTimeout(1200);
  await p.evaluate(() => { localStorage.clear(); location.reload(); });
  await p.waitForTimeout(1500);
  if (await p.$('input[type=password]')) { await (await p.$$('input'))[0].fill('jacky'); await p.fill('input[type=password]', 'demo'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500); }
  return { p, erreurs };
}

// Défilement horizontal de la page et cibles tactiles trop petites (boutons, liens-boutons, champs, listes, résumés)
const mesurer = () => {
  const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden]'); };
  const modal = document.querySelector('#modal:not([hidden])'), zones = modal ? ['#modal'] : ['#app', 'header'];
  const petits = [];
  document.querySelectorAll(zones.map(z => ['button', 'a', 'input:not([type=hidden])', 'select', 'summary'].map(x => `${z} ${x}`).join(',')).join(',')).forEach(el => {
    if (!vis(el)) return;
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && !el.classList.contains('btn')) return; // lien dans le texte
    const r = el.getBoundingClientRect();
    if (el.type === 'checkbox' || el.type === 'radio') { const l = el.closest('label'), rr = l ? l.getBoundingClientRect() : r; if (rr.height < 32) petits.push(`case ${Math.round(rr.height)} px`); return; }
    if (r.height < 40 || r.width < 40) petits.push(`${el.tagName.toLowerCase()} « ${(el.innerText || el.value || el.title || '').trim().slice(0, 30)} » ${Math.round(r.width)}×${Math.round(r.height)}`);
  });
  return { hscroll: document.documentElement.scrollWidth - innerWidth, petits };
};

test('Ergonomie Études : téléphone 390 px sans défilement horizontal ni cible tactile trop petite', { skip: sansPlaywright, timeout: 240000 }, async () => {
  const { p, erreurs } = await ouvrir('etudes.html', { width: 390, height: 844 }, true);
  const r = await p.evaluate(() => {
    const et = S.etudes.filter(x => !x.modele).sort((a, b) => b.notes.length - a.notes.length)[0], ids = {};
    ['pid', 'arbo', 'terminaux', 'sanitaire', 'elec', 'cta'].forEach(t => { let n = et.notes.find(x => x.type === t); if (!n) { n = nouvelleNote(t); et.notes.push(n); } ids[t] = n.id; });
    enregistrer(et); return { id: et.id, ids };
  });
  const ecrans = [['liste des études', '#/'], ['étude', `#/etude/${r.id}`], ...Object.entries(r.ids).map(([t, n]) => [`note ${t}`, `#/etude/${r.id}/${n}`]), ['installation hydraulique', `#/etude/${r.id}/installation`]];
  for (const [nom, hash] of ecrans) {
    await p.evaluate(h => { location.hash = h; }, hash); await p.waitForTimeout(400);
    const m = await p.evaluate(mesurer);
    assert.ok(m.hscroll <= 0, `${nom} : défilement horizontal de ${m.hscroll} px`);
    assert.deepStrictEqual(m.petits, [], `${nom} : cibles tactiles < 40 px`);
  }
  // Note de calcul : actions nombreuses regroupées, carte par ligne dans les tableaux de saisie
  await p.evaluate(h => { location.hash = h; }, `#/etude/${r.id}/${r.ids.elec}`); await p.waitForTimeout(500);
  assert.ok(await p.$('.actions-note details.plus-actions'), 'menu « Plus d\'actions » absent');
  assert.strictEqual(await p.$eval('table.edit.lignes:not(.vide) thead', x => getComputedStyle(x).display), 'none');
  // Dialogue CCTP / DPGF en feuille plein largeur, boutons visibles
  await p.evaluate(h => { location.hash = h; }, `#/etude/${r.id}`); await p.waitForTimeout(400);
  await p.evaluate(id => dialogueInventaire(S.etudes.find(x => x.id === id)), r.id); await p.waitForTimeout(400);
  const d = await p.evaluate(mesurer);
  assert.deepStrictEqual(d.petits, [], 'dialogue CCTP / DPGF : cibles tactiles < 40 px');
  assert.ok(await p.$eval('#modal .modal-box', b => b.getBoundingClientRect().width >= innerWidth - 1), 'dialogue pas en pleine largeur');
  assert.deepStrictEqual(erreurs, []);
});

test('Ergonomie DOE : téléphone 390 px sans défilement horizontal ni cible tactile trop petite', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('doe.html', { width: 390, height: 844 }, true);
  let m = await p.evaluate(mesurer);
  assert.ok(m.hscroll <= 0); assert.deepStrictEqual(m.petits, [], 'liste des dossiers');
  if (!(await p.evaluate(() => S.does.length))) { await p.click('[data-creer]'); await p.waitForTimeout(1200); }
  const id = await p.evaluate(() => S.does[0].id);
  for (const s of ['garde', 's3', 'manques']) {
    await p.evaluate(h => { location.hash = h; }, `#/doe/${id}/${s}`); await p.waitForTimeout(400);
    m = await p.evaluate(mesurer);
    assert.ok(m.hscroll <= 0, `${s} : défilement horizontal`);
    assert.deepStrictEqual(m.petits, [], `${s} : cibles tactiles < 40 px`);
  }
  assert.deepStrictEqual(erreurs, []);
});

test('Ergonomie Études : ordinateur (tableaux collants, Entrée, groupes repliables, zoom, dialogue)', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('etudes.html', { width: 1400, height: 900 }, false);
  const r = await p.evaluate(() => { const et = S.etudes.filter(x => !x.modele).sort((a, b) => b.notes.length - a.notes.length)[0]; return { id: et.id, arbo: et.notes.find(n => n.type === 'arbo').id, pid: et.notes.find(n => n.type === 'pid').id }; });
  await p.evaluate(x => { location.hash = `#/etude/${x.id}/${x.arbo}`; }, r); await p.waitForTimeout(600);
  // En-tête collant, champs étiquetés par leur colonne
  assert.strictEqual(await p.$eval('table.edit.lignes:not(.vide) thead th', x => getComputedStyle(x).position), 'sticky');
  assert.match(await p.$eval('[data-l="troncons.0.L"]', x => x.getAttribute('aria-label')), /Longueur/);
  // Entrée : même colonne, ligne suivante
  await p.focus('[data-l="troncons.0.L"]'); await p.keyboard.press('Enter');
  assert.strictEqual(await p.evaluate(() => document.activeElement.dataset.l), 'troncons.1.L');
  // Groupe replié puis déplié (mémorisé)
  await p.click('fieldset button.replier');
  assert.ok(await p.$eval('fieldset button.replier', b => b.closest('fieldset').classList.contains('replie')));
  await p.click('fieldset button.replier');
  // Schéma zoomable
  await p.evaluate(x => { location.hash = `#/etude/${x.id}/${x.pid}`; }, r); await p.waitForTimeout(600);
  const avant = await p.$eval('#schema .schema svg', s => s.getBoundingClientRect().width);
  await p.click('#schema .zoom-barre [data-zoom="+"]'); await p.waitForTimeout(100);
  assert.ok(await p.$eval('#schema .schema svg', s => s.getBoundingClientRect().width) > avant * 1.1, 'zoom sans effet');
  // Grand dialogue : barre de boutons visible sans faire défiler
  await p.evaluate(id => dialogueAjoutCalcul(S.etudes.find(x => x.id === id)), r.id); await p.waitForTimeout(300);
  const vis = await p.evaluate(() => { const b = document.querySelector('#modal .modal-box'), a = b.querySelector(':scope > .actions:last-child'); if (!a) return true; return a.getBoundingClientRect().bottom <= Math.min(b.getBoundingClientRect().bottom, innerHeight) + 1; });
  assert.ok(vis, 'boutons du dialogue hors de vue');
  assert.deepStrictEqual(erreurs, []);
});

test('Études : page de l\'étude — suivi des étapes dans le guide « Reste à faire », calculs avant les outils', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('etudes.html', { width: 1400, height: 900 }, false);
  const id = await p.evaluate(() => { const et = S.etudes.filter(x => !x.modele).sort((a, b) => b.notes.length - a.notes.length)[0]; location.hash = `#/etude/${et.id}`; return et.id; });
  await p.waitForTimeout(1200);
  // Une seule présentation des étapes : plus de carte « Suivi des étapes » à part, filtres et PDF dans le guide
  assert.strictEqual(await p.$('#suivi-etapes'), null, 'carte de suivi en double');
  assert.ok(await p.$('#guide-etude [data-suivi-filtre="mes"]') && await p.$('#guide-etude [data-suivi-filtre="retard"]') && await p.$('#guide-etude [data-suivi-pdf]'), 'filtres ou PDF absents du guide');
  // Filtre « En retard » : liste des étapes en retard (ou état vide explicite), puis retour à la vue par phase
  await p.click('#guide-etude [data-suivi-filtre="retard"]'); await p.waitForTimeout(300);
  assert.strictEqual(await p.$eval('#guide-etude [data-suivi-filtre="retard"]', b => b.getAttribute('aria-pressed')), 'true');
  assert.ok(await p.$('#guide-etude .guide-filtree li, #guide-etude .guide-vide'), 'liste filtrée absente');
  assert.strictEqual(await p.$('#guide-etude .guide-liste'), null, 'vue par phase encore affichée');
  await p.click('#guide-etude [data-suivi-filtre="phases"]'); await p.waitForTimeout(300);
  assert.strictEqual(await p.$('#guide-etude .guide-filtree'), null);
  // Liste compacte : une ligne par étape, détail (suivi, correction sur place) ouvert au clic, une étape à la fois
  await p.evaluate(() => { const d = document.querySelector('#guide-etude .guide-liste'); if (d) d.open = true; document.querySelectorAll('#guide-etude .guide-phase').forEach(x => { x.open = true; }); });
  const lignes = await p.$$eval('#guide-etude .guide-liste li.guide-etape', ls => ls.map(l => ({ h: l.getBoundingClientRect().height, tete: !!l.querySelector('button.guide-tete[aria-expanded="false"]'), cache: l.querySelector('.guide-detail').hidden, suivi: !!l.querySelector('.guide-ligne [data-suivi-action], .guide-ligne .guide-editeur') })));
  assert.ok(lignes.length > 3, 'étapes de la liste absentes');
  assert.ok(lignes.every(l => l.tete && l.cache && !l.suivi), 'ligne d\'étape non compacte');
  assert.ok(lignes.every(l => l.h < 60), `ligne d'étape trop haute : ${Math.max(...lignes.map(l => l.h))} px`);
  const tetes = await p.$$('#guide-etude .guide-liste .guide-tete');
  await tetes[0].click();
  assert.strictEqual(await tetes[0].getAttribute('aria-expanded'), 'true');
  assert.ok(await p.$eval('#guide-etude .guide-liste .guide-tete[aria-expanded="true"]', t => !document.getElementById(t.getAttribute('aria-controls')).hidden && !!document.getElementById(t.getAttribute('aria-controls')).querySelector('[data-suivi-action]')), 'détail sans suivi');
  await tetes[1].focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  assert.deepStrictEqual(await p.$$eval('#guide-etude .guide-tete[aria-expanded="true"]', ts => ts.length), 1, 'une seule étape ouverte');
  assert.strictEqual(await tetes[1].getAttribute('aria-expanded'), 'true');
  // L'étape suivante mise en avant reste détaillée
  assert.ok(await p.$('#guide-etude .guide-suivante [data-suivi-action]'), 'étape suivante sans détail');
  // Ordre : guide, calculs, puis outils (équipements et matériel ; chantier et exploitation) ; fiche de l'étude repliée
  // quand l'étude a des calculs
  const ordre = await p.evaluate(() => ['#guide-etude', '#ajout', '#groupe-equipements', '#groupe-chantier'].map(s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().top + scrollY : -1; }));
  assert.ok(ordre.every(x => x >= 0) && ordre.every((x, i) => !i || x > ordre[i - 1]), `ordre des blocs : ${ordre}`);
  assert.strictEqual(await p.$eval('#fiche-etude', d => d.open), false);
  // Même pourcentage dans le guide et dans le résumé envoyé aux tableaux de bord (portefeuille, CRM)
  const pc = await p.evaluate(i => { const et = S.etudes.find(x => x.id === i), b = SuiviEtapes.etapesEtude(et); return [SuiviEtapes.avancement(et, SuiviEtapes.decorer(et, b)).pct, Number((/Reste à faire — (\d+) %/.exec(document.querySelector('#guide-etude').innerText) || [])[1])]; }, id);
  assert.strictEqual(pc[0], pc[1], `pourcentages différents : ${pc}`);
  assert.deepStrictEqual(erreurs, []);
});
