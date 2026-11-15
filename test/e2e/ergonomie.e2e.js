// Ergonomie du CRM sur téléphone (390 px, iPhone 13) : sur les écrans principaux du bureau et du terrain, pas de
// défilement horizontal de la page ni de cible tactile de moins de 40 px ; navigation au pouce (barre du bas, menu
// complet en volet) ; dialogue d'édition avec ses boutons visibles en bas de l'écran. Sur ordinateur : en-tête de
// tableau collant.
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-e2e-ergo-'));
  execFileSync(process.execPath, [path.join(racine, 'demo', 'build.js'), path.join(dir, 'pipefit-crm-demo.html')], { stdio: 'ignore' });
});
after(async () => { if (navigateur) await navigateur.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

// Démo ouverte sous le compte demandé (administrateur ou compagnon), données de départ
async function ouvrir(compte, viewport = { width: 390, height: 844 }) {
  navigateur = navigateur || await chromium.launch();
  const tel = viewport.width <= 720;
  const p = await (await navigateur.newContext({ viewport, isMobile: tel, hasTouch: tel })).newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`file://${path.join(dir, 'pipefit-crm-demo.html')}`);
  await p.waitForTimeout(1200);
  await p.evaluate(c => { localStorage.clear(); localStorage.setItem('pipefit-crm-demo-me', c); location.hash = ''; location.reload(); }, compte);
  await p.waitForTimeout(2000);
  return { p, erreurs };
}
async function aller(p, hash) {
  await p.evaluate(h => { location.hash = h; }, hash);
  await p.waitForTimeout(450);
  await p.evaluate(() => scrollTo(0, 0));
}

// Mesures dans la page : défilement horizontal, cibles tactiles visibles de moins de 40 px
// (liens au fil d'une phrase ou d'une cellule de tableau exceptés, comme le prévoient les règles d'accessibilité)
const MESURER = () => {
  const W = innerWidth, petites = [];
  const modal = [...document.querySelectorAll('.modal:not(.hidden)')].pop();
  for (const el of (modal || document.body).querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary')) {
    const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (!b.width || !b.height || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
    if (el.matches('input[type=checkbox], input[type=radio]')) { const l = el.closest('label'); if (l) { const r = l.getBoundingClientRect(); if (r.width >= 40 && r.height >= 40) continue; } }
    if (el.tagName === 'A' && !el.classList.contains('btn') && cs.display === 'inline' && !el.closest('nav, .tabs, .navbas')
      && ([...el.parentElement.childNodes].some(x => x.nodeType === 3 && x.textContent.trim()) || el.parentElement.closest('p, td, li, dd, span, small, .muted'))) continue;
    if (b.width < 40 || b.height < 40) petites.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} «${(el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 30)}» ${Math.round(b.width)}×${Math.round(b.height)}`);
  }
  return { defilement: document.documentElement.scrollWidth - W, petites };
};

const BUREAU = ['#/dashboard', '#/contacts', '#/devis', '#/devis/{devis}', '#/chantiers', '#/chantier/{chantier}', '#/chantier/{chantier}/documents', '#/chantier/{chantier}/gantt',
  '#/commandes', '#/factures', '#/articles', '#/stock', '#/planning', '#/pointage', '#/rh', '#/parametres', '#/notifications'];
const TERRAIN = ['#/pointage', '#/pointage/planning', '#/pointage/chantiers', '#/pointage/chantier/{chantier}', '#/pointage/rapports', '#/pointage/frais', '#/scan', '#/mes/new?type=vmc'];

for (const [compte, ecrans, titre] of [['acc-admin', BUREAU, 'bureau'], ['acc-kevin', TERRAIN, 'terrain']]) {
  test(`Ergonomie CRM (390 px, ${titre}) : ni défilement horizontal ni cible tactile < 40 px sur les écrans principaux`, { skip: sansPlaywright, timeout: 180000 }, async () => {
    const { p, erreurs } = await ouvrir(compte);
    const ids = await p.evaluate(() => ({ chantier: Store.all('affaires').find(a => a.type !== 'horsDevis' && !a.archive).id, devis: Store.all('devis')[0].id }));
    const defauts = [];
    for (const e of ecrans) {
      const hash = e.replace('{chantier}', ids.chantier).replace('{devis}', ids.devis);
      await aller(p, hash);
      const m = await p.evaluate(MESURER);
      if (m.defilement > 0) defauts.push(`${hash} : défilement horizontal de ${m.defilement} px`);
      if (m.petites.length) defauts.push(`${hash} : ${m.petites.length} cible(s) < 40 px (${m.petites.slice(0, 4).join(' ; ')})`);
    }
    assert.deepStrictEqual(defauts, []);
    assert.deepStrictEqual(erreurs, []);
  });
}

test('Ergonomie CRM (390 px) : Étapes des études et chantiers en cartes, sans tableau qui défile ; tableau sur ordinateur', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const etat = () => [...document.querySelectorAll('#app table.cartes-tel')].map(t => {
    const lignes = [...t.querySelectorAll('tr')].filter(tr => tr.querySelector('td') && getComputedStyle(tr).display !== 'none');
    return { n: lignes.length, affichage: lignes.length ? getComputedStyle(lignes[0]).display : '', defile: t.closest('.table-wrap').scrollWidth > t.closest('.table-wrap').clientWidth + 1,
      intitules: lignes.length ? [...lignes[0].children].filter(td => !td.classList.contains('ct-titre') && !td.classList.contains('sel-cell')).every(td => td.dataset.l) : false };
  });
  for (const [viewport, tel] of [[{ width: 390, height: 844 }, true], [{ width: 1400, height: 900 }, false]]) {
    const { p, erreurs } = await ouvrir('acc-claire', viewport);
    for (const hash of ['#/etapes', '#/chantiers']) {
      await aller(p, hash); await p.waitForTimeout(400);
      const t = await p.evaluate(etat);
      assert.ok(t.length && t.every(x => x.n), `${hash} : tableau en cartes absent`);
      if (tel) {
        assert.ok(t.every(x => x.affichage === 'grid' && !x.defile && x.intitules), `${hash} (390 px) : ${JSON.stringify(t)}`);
        const m = await p.evaluate(MESURER);
        assert.strictEqual(m.defilement, 0, `${hash} : défilement horizontal`);
        assert.deepStrictEqual(m.petites, [], `${hash} : cibles < 40 px`);
      } else assert.ok(t.every(x => x.affichage === 'table-row'), `${hash} (ordinateur) : ${JSON.stringify(t)}`);
    }
    // Carte d'un chantier : un toucher ouvre sa fiche
    if (tel) { await aller(p, '#/chantiers'); await p.click('table.cartes-tel tr[data-go] td.ct-titre'); await p.waitForTimeout(400); assert.match(await p.evaluate(() => location.hash), /^#\/chantier\//); }
    assert.deepStrictEqual(erreurs, []);
  }
});

test('Consultation (390 px) : offre saisie, comparatif à colonnes figées, fournisseurs en cartes, actions ≥ 40 px', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('acc-claire');
  // Consultation de démonstration : 3 lignes, 2 fournisseurs (une offre complète, une offre reçue par e-mail pas encore lue)
  await p.evaluate(async () => {
    const arts = Store.all('articles').slice(0, 3), fours = Store.all('entreprises').filter(e => /fournisseur/i.test(e.categorie || '')).slice(0, 2);
    await Store.upsert('consultations', { id: 'cs-e2e', ref: 'CF-E2E', date: '2026-11-15', objet: 'Consultation e2e', statut: 'En cours', affaireId: Store.all('affaires')[0].id,
      lignes: arts.map((a, i) => ({ articleId: a.id, designation: a.designation, unite: a.unite || 'u', qte: i + 2 })),
      fournisseurs: fours.map((f, k) => ({ entrepriseId: f.id, statut: k ? 'Consulté' : 'Offre reçue', envoyeLe: '2026-11-14', offre: k ? { aLire: true } : { prix: { 0: 10, 1: 20, 2: 30 }, delai: 5, port: 25 } })) });
  });
  await aller(p, '#/consultations/cs-e2e');
  // Offre du 2e fournisseur saisie au dialogue (l'offre reçue par e-mail n'a pas encore de prix)
  await (await p.$$('[data-offre]'))[1].click(); await p.waitForTimeout(300);
  for (const [k, el] of (await p.$$('#modal-box [data-pi]')).entries()) await el.fill(String(9 + k));
  await p.click('#of-ok'); await p.waitForTimeout(500);
  assert.deepStrictEqual(await p.evaluate(() => Store.get('consultations', 'cs-e2e').fournisseurs.map(f => f.statut)), ['Offre reçue', 'Offre reçue']);
  await p.evaluate(() => scrollTo(0, 0));
  const m = await p.evaluate(MESURER);
  assert.strictEqual(m.defilement, 0, 'défilement horizontal de la page');
  assert.deepStrictEqual(m.petites, [], 'cibles < 40 px');
  // Fournitures et fournisseurs en cartes ; « Retenir et commander » visible dans la carte de chaque offre complète
  const cartes = await p.evaluate(() => ['.cs-lignes', '.cs-fourn'].map(s => { const t = document.querySelector(`table${s}`), w = t.closest('.table-wrap'); return { grille: getComputedStyle(t.querySelector('tr[data-i], tr:nth-child(2)')).display, defile: w.scrollWidth > w.clientWidth + 1 }; }));
  assert.deepStrictEqual(cartes, [{ grille: 'grid', defile: false }, { grille: 'grid', defile: false }]);
  const retenir = await p.$$eval('.cs-fourn [data-retenir]', bs => bs.map(b => { const r = b.getBoundingClientRect(); return r.width > 300 && r.height >= 40; }));
  assert.deepStrictEqual(retenir, [true, true]);
  // Comparatif : tableau qui défile, N° et désignation figés à gauche, totaux libellés
  const fige = await p.evaluate(() => {
    const w = document.querySelector('.cs-comparatif').closest('.table-wrap'), d = document.querySelector('.cs-comparatif td.cs-d'), tot = document.querySelector('.cs-comparatif td.cs-fige');
    const x0 = d.getBoundingClientRect().left; w.scrollLeft = w.scrollWidth;
    return { defile: w.scrollWidth > w.clientWidth, deplace: Math.abs(d.getBoundingClientRect().left - x0), totalVisible: tot.getBoundingClientRect().left >= w.getBoundingClientRect().left - 1 };
  });
  assert.ok(fige.defile && fige.deplace < 1 && fige.totalVisible, JSON.stringify(fige));
  // Retenir et commander : dialogue aux actions visibles
  await p.click('.cs-fourn [data-retenir]'); await p.waitForTimeout(400);
  const dlg = await p.evaluate(MESURER);
  assert.deepStrictEqual(dlg.petites, [], 'dialogue « Retenir » : cibles < 40 px');
  assert.deepStrictEqual(erreurs, []);
});

test('Ergonomie CRM (390 px) : navigation au pouce, menu complet en volet, dialogue aux actions visibles', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('acc-admin');
  await aller(p, '#/dashboard');
  // Barre du bas : dans la zone du pouce, raccourcis + Menu
  const barre = await p.evaluate(() => { const b = document.getElementById('navbas').getBoundingClientRect(); return { haut: b.top, bas: b.bottom, liens: [...document.querySelectorAll('#navbas a')].map(a => a.textContent.trim()) }; });
  assert.ok(barre.bas <= 844 && barre.haut > 844 - 90, JSON.stringify(barre));
  assert.ok(barre.liens.length >= 3, barre.liens.join(', '));
  assert.ok(await p.isHidden('#nav'), 'menu du haut remplacé par la barre du bas');
  // Menu complet : toutes les entrées du menu, Déconnexion ; fermé par Échap
  await p.click('#navbas-menu');
  const liens = await p.$$eval('#menu-mobile .mm-liens a', l => l.map(a => a.textContent.trim()));
  assert.ok(liens.includes('Facturation') && liens.includes('Paramètres'), liens.join(', '));
  assert.ok(await p.isVisible('#mm-logout'));
  await p.keyboard.press('Escape');
  assert.ok(await p.isHidden('#menu-mobile'));
  // Une entrée du menu ouvre son écran et referme le volet
  await p.click('#navbas-menu'); await p.click('#menu-mobile a[href="#/factures"]'); await p.waitForTimeout(400);
  assert.match(await p.evaluate(() => location.hash), /factures/);
  assert.ok(await p.isHidden('#menu-mobile'));
  // Dialogue d'édition plus haut que l'écran : Enregistrer reste visible en bas
  await aller(p, '#/contacts'); await p.click('#add'); await p.waitForTimeout(400);
  const dlg = await p.evaluate(() => { const box = document.getElementById('modal-box'), a = box.querySelector('.modal-actions').getBoundingClientRect(); return { haut: box.scrollHeight, actions: [a.top, a.bottom] }; });
  assert.ok(dlg.haut > 844, `dialogue de ${dlg.haut} px`);
  assert.ok(dlg.actions[1] <= 844 && dlg.actions[0] > 600, JSON.stringify(dlg));
  // Champ numérique : clavier numérique du téléphone ; champs de formulaire reliés à leur libellé
  await p.keyboard.press('Escape'); await p.evaluate(() => Modal.close());
  await aller(p, '#/parametres');
  const champs = await p.evaluate(() => [...document.querySelectorAll('#app input[type=number]')].map(i => i.getAttribute('inputmode')));
  assert.ok(champs.length && champs.every(Boolean), champs.join(','));
  const sansLibelle = await p.evaluate(() => [...document.querySelectorAll('#app input:not([type=hidden]):not([type=file]), #app select, #app textarea')].filter(i => i.offsetParent && !(i.labels && i.labels.length) && !i.getAttribute('aria-label') && !i.title).length);
  assert.strictEqual(sansLibelle, 0);
  assert.deepStrictEqual(erreurs, []);
});

test('Ergonomie CRM (ordinateur) : en-tête de tableau collant, barre du bas absente, menu en haut', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('acc-admin', { width: 1400, height: 900 });
  await aller(p, '#/articles'); await p.waitForTimeout(300);
  assert.ok(await p.isVisible('#nav') && await p.isHidden('#navbas'));
  const r = await p.evaluate(() => {
    const th = [...document.querySelectorAll('#app .tw-plein th')].find(x => x.offsetParent);
    if (!th) return null;
    const t = th.closest('table'); scrollTo(0, t.getBoundingClientRect().top + scrollY + 300);
    return { haut: Math.round(th.getBoundingClientRect().top), position: getComputedStyle(th).position };
  });
  assert.ok(r && r.position === 'sticky' && r.haut === 0, JSON.stringify(r));
  assert.deepStrictEqual(erreurs, []);
});
