// Guide d'utilisation intégré (navigateur, démo) : pas de parcours proposé sous un navigateur piloté (tests), panneau
// d'aide de l'écran courant (clavier : F1, Échap, focus rendu), recherche, proposition forcée ; les éléments visés par
// chaque étape des parcours existent sur leurs écrans (CRM par profil, Études, DOE) ; téléphone 390 px : panneau plein
// écran, pas de défilement horizontal, parcours du compagnon. Aucune erreur de page.
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-e2e-aide-'));
  execFileSync(process.execPath, [path.join(racine, 'demo', 'build.js'), path.join(dir, 'pipefit-crm-demo.html')], { stdio: 'ignore' });
});
after(async () => { if (navigateur) await navigateur.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

// Page ouverte avec le compte de démo voulu (CRM), connexion si demandée (Études, DOE), erreurs collectées
async function ouvrir(fichier, { compte = '', taille = { width: 1400, height: 950 } } = {}) {
  navigateur = navigateur || await chromium.launch();
  const p = await (await navigateur.newContext({ viewport: taille })).newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_FILE_NOT_FOUND|net::/.test(m.text())) erreurs.push(m.text()); });
  await p.goto(`file://${path.join(dir, fichier)}`);
  await p.waitForTimeout(1200);
  await p.evaluate(c => { localStorage.clear(); if (c) localStorage.setItem('pipefit-crm-demo-me', c); location.reload(); }, compte);
  await p.waitForTimeout(2200);
  if (await p.$('input[type=password]')) { await (await p.$$('input'))[0].fill('jacky'); await p.fill('input[type=password]', 'demo'); await p.keyboard.press('Enter'); await p.waitForTimeout(2200); }
  return { p, erreurs };
}
// Chaque étape d'un parcours : écran de l'étape ouvert, puis l'un des éléments visés présent dans la page
async function ciblesPresentes(p, id) {
  const n = await p.evaluate(i => AideContenu.parcours.find(x => x.id === i).etapes.length, id), manquantes = [];
  for (let k = 0; k < n; k++) {
    await p.evaluate(([i, j]) => { const e = AideContenu.parcours.find(x => x.id === i).etapes[j], r = typeof e.route === 'function' ? e.route() : e.route; if (r && location.hash !== r) location.hash = r; }, [id, k]);
    const ok = await p.waitForFunction(([i, j]) => [].concat(AideContenu.parcours.find(x => x.id === i).etapes[j].cible).some(s => document.querySelector(s)), [id, k], { timeout: 4000 }).then(() => true, () => false);
    if (!ok) manquantes.push(`${k + 1}. ${await p.evaluate(([i, j]) => AideContenu.parcours.find(x => x.id === i).etapes[j].titre, [id, k])}`);
  }
  return manquantes;
}
// Parcours suivi à l'écran jusqu'au bout : étapes dont la bulle est centrée (élément absent ou masqué)
async function suivre(p, id) {
  await p.evaluate(i => Aide.lancerParcours(i), id);
  const n = await p.evaluate(i => AideContenu.parcours.find(x => x.id === i).etapes.length, id), centrees = [];
  for (let k = 0; k < n; k++) {
    await p.waitForFunction(j => { const b = document.querySelector('.aide-bulle'); return b && b.textContent.includes(`Étape ${j + 1} /`) && document.querySelector('#aide-suiv'); }, k, { timeout: 6000 });
    await p.waitForTimeout(150);
    if (await p.evaluate(() => document.querySelector('.aide-bulle').classList.contains('aide-centre'))) centrees.push(k + 1);
    await p.click('#aide-suiv');
  }
  assert.strictEqual(await p.$('.aide-bulle'), null, 'bulle retirée à la fin');
  return centrees;
}

test('CRM : aucun parcours proposé aux tests, panneau d\'aide de l\'écran (clavier, recherche), proposition forcée', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('pipefit-crm-demo.html', { compte: 'acc-claire' });
  await p.waitForTimeout(2000);
  assert.strictEqual(await p.$('#aide-propose'), null, 'navigateur piloté : rien de proposé');
  assert.strictEqual(await p.evaluate(() => Aide.etat().propose), false);
  await p.evaluate(() => { location.hash = '#/chantiers'; }); await p.waitForTimeout(600);
  await p.click('#aide-bouton');
  assert.strictEqual(await p.getAttribute('#aide-bouton', 'aria-expanded'), 'true');
  assert.match(await p.innerText('#aide-panneau'), /Chantiers[\s\S]*Actions principales[\s\S]*Pièges fréquents[\s\S]*Écrans liés[\s\S]*Parcours de démarrage/i);
  assert.match(await p.innerText('.aide-parcours'), /Piloter ses chantiers[\s\S]*conseillé pour vous/);
  assert.doesNotMatch(await p.innerText('.aide-parcours'), /Mettre en place/, 'parcours administrateur masqué au chargé d\'affaires');
  // L'aide suit l'écran ; écran lié ouvert depuis l'aide
  await p.evaluate(() => { location.hash = '#/stock'; }); await p.waitForTimeout(500);
  assert.match(await p.innerText('#aide-rub-titre'), /Stock et QR codes/);
  await p.click('[data-aide-rub="scan"]');
  assert.match(await p.innerText('#aide-rub-titre'), /Scanner/);
  // Recherche
  await p.fill('#aide-q', 'réserve levée');
  assert.match(await p.innerText('#aide-nb'), /rubrique/);
  assert.match(await p.innerText('.aide-resultats'), /Réserves et réception/);
  await p.fill('#aide-q', 'xqzw');
  assert.match(await p.innerText('#aide-nb'), /Aucune rubrique/);
  // Échap : fermé, focus rendu au bouton ; F1 rouvre
  await p.keyboard.press('Escape');
  assert.ok(await p.$eval('#aide-panneau', x => x.hidden));
  assert.strictEqual(await p.evaluate(() => document.activeElement.id), 'aide-bouton');
  await p.keyboard.press('F1');
  assert.ok(!(await p.$eval('#aide-panneau', x => x.hidden)));
  await p.click('#aide-fermer');
  // Proposition forcée (première connexion hors tests) : « Plus tard » la retire, « vu » une seule fois
  assert.ok(await p.evaluate(() => Aide.proposer({ forcer: true })));
  assert.match(await p.innerText('#aide-propose'), /Bienvenue[\s\S]*Piloter ses chantiers/);
  await p.click('#aide-propose-non');
  assert.strictEqual(await p.$('#aide-propose'), null);
  assert.strictEqual(await p.evaluate(() => Aide.proposer()), false, 'déjà proposé');
  // Parcours : Échap passe, mémorisé « vu » (navigateur et préférences du compte)
  await p.evaluate(() => Aide.lancerParcours('conducteur'));
  await p.waitForSelector('#aide-suiv'); await p.waitForTimeout(200);
  assert.strictEqual(await p.evaluate(() => document.activeElement.id), 'aide-suiv');
  await p.keyboard.press('Escape');
  assert.strictEqual(await p.$('.aide-bulle'), null);
  assert.deepStrictEqual(await p.evaluate(() => Store.me.prefs.aide.vus), ['conducteur']);
  assert.deepStrictEqual(erreurs, []);
});

test('CRM : les éléments visés par les parcours existent sur leurs écrans (chargé d\'affaires, compagnon, administrateur)', { skip: sansPlaywright, timeout: 240000 }, async () => {
  for (const [compte, id] of [['acc-claire', 'conducteur'], ['acc-kevin', 'compagnon'], ['acc-admin', 'admin']]) {
    const { p, erreurs } = await ouvrir('pipefit-crm-demo.html', { compte });
    assert.deepStrictEqual(await ciblesPresentes(p, id), [], `${id} : éléments absents`);
    assert.deepStrictEqual(await suivre(p, id), [], `${id} : bulles sans élément mis en évidence`);
    assert.ok((await p.evaluate(() => Aide.etat().vus)).includes(id));
    assert.deepStrictEqual(erreurs, [], id);
    await p.context().close();
  }
});

test('Études et DOE : aide de l\'écran et du dialogue ouvert, éléments des parcours présents', { skip: sansPlaywright, timeout: 240000 }, async () => {
  const e = await ouvrir('etudes.html');
  await e.p.click('#aide-bouton');
  assert.match(await e.p.innerText('#aide-rub-titre'), /Accueil : études et portefeuille/);
  await e.p.click('#aide-fermer');
  assert.deepStrictEqual(await ciblesPresentes(e.p, 'be'), []);
  assert.deepStrictEqual(await suivre(e.p, 'be'), []);
  // Calcul de CTA ouvert, puis dialogue du matériel retenu : l'aide suit
  const n = await e.p.evaluate(() => { const et = S.etudes.find(x => !x.modele && x.notes.some(n => n.type === 'cta')); return et ? `#/etude/${et.id}/${et.notes.find(n => n.type === 'cta').id}` : ''; });
  if (n) { await e.p.evaluate(h => { location.hash = h; }, n); await e.p.waitForTimeout(1200); assert.strictEqual(await e.p.evaluate(() => Aide.rubriqueCourante()), 'cta'); }
  await e.p.evaluate(() => { location.hash = `#/etude/${S.etudes.find(x => !x.modele).id}`; }); await e.p.waitForTimeout(1500);
  await e.p.click('#materiel'); await e.p.waitForTimeout(1200);
  await e.p.keyboard.press('F1');
  assert.match(await e.p.innerText('#aide-rub-titre'), /Matériel retenu/);
  await e.p.keyboard.press('Escape');
  assert.ok(await e.p.$eval('#aide-panneau', x => x.hidden), 'Échap ferme l\'aide d\'abord');
  assert.deepStrictEqual(e.erreurs, []);

  const d = await ouvrir('doe.html');
  // Un dossier pour les étapes de l'éditeur
  if (!(await d.p.$('.carte.dossier'))) { await d.p.click('[data-creer]'); await d.p.waitForTimeout(1500); await d.p.evaluate(() => { location.hash = '#/'; }); await d.p.waitForTimeout(800); }
  assert.deepStrictEqual(await ciblesPresentes(d.p, 'doe'), []);
  assert.deepStrictEqual(await suivre(d.p, 'doe'), []);
  await d.p.evaluate(() => { location.hash = `#/doe/${S.does[0].id}/s7`; }); await d.p.waitForTimeout(800);
  await d.p.click('#aide-bouton');
  assert.match(await d.p.innerText('#aide-rub-titre'), /Maintenance et exploitation/);
  assert.deepStrictEqual(d.erreurs, []);
});

test('Téléphone (390 px) : aide en plein écran, pas de défilement horizontal, parcours du compagnon', { skip: sansPlaywright, timeout: 180000 }, async () => {
  const taille = { width: 390, height: 844 };
  for (const [fichier, compte] of [['pipefit-crm-demo.html', 'acc-kevin'], ['etudes.html', ''], ['doe.html', '']]) {
    const { p, erreurs } = await ouvrir(fichier, { compte, taille });
    assert.ok(await p.isVisible('#aide-bouton'), `${fichier} : bouton visible`);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${fichier} : pas de défilement horizontal`);
    await p.click('#aide-bouton');
    const r = await p.$eval('#aide-panneau', x => { const b = x.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.width), x.getAttribute('aria-modal')]; });
    assert.deepStrictEqual(r, [0, 390, 'true'], `${fichier} : plein écran`);
    await p.click('#aide-fermer');
    if (compte) assert.deepStrictEqual(await suivre(p, 'compagnon'), [], 'compagnon : éléments mis en évidence sur téléphone');
    assert.deepStrictEqual(erreurs, [], fichier);
    await p.context().close();
  }
});
