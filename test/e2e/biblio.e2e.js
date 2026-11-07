// Tests des outils de la bibliothèque (navigateur, démo) : tarif d'un fournisseur, marges par catégorie, catégories,
// doublons, comparatif fournisseurs d'une commande et d'un devis, prix facturés, contrôle d'un import, sélecteur du terrain.
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
const X = require(path.join(racine, 'public/js/xlsx'));

before(() => {
  if (!chromium) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-e2e-biblio-'));
  execFileSync(process.execPath, [path.join(racine, 'demo', 'build.js'), path.join(dir, 'pipefit-crm-demo.html')], { stdio: 'ignore' });
});
after(async () => { if (navigateur) await navigateur.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

async function ouvrir() {
  navigateur = navigateur || await chromium.launch();
  const p = await (await navigateur.newContext({ viewport: { width: 1400, height: 1000 } })).newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`file://${path.join(dir, 'pipefit-crm-demo.html')}`);
  await p.waitForTimeout(1500);
  await p.evaluate(() => { localStorage.clear(); location.reload(); });
  await p.waitForTimeout(2000);
  if (await p.$('input[type=password]')) { await (await p.$$('input'))[0].fill('jacky'); await p.fill('input[type=password]', 'demo'); await p.keyboard.press('Enter'); await p.waitForTimeout(2000); }
  // Deux fournisseurs et des articles d'essai
  await p.evaluate(async () => {
    await Store.bulk('entreprises', [{ id: 'fe1', nom: 'Négoce E2E Un', categorie: 'Fournisseur', adresses: [] }, { id: 'fe2', nom: 'Négoce E2E Deux', categorie: 'Fournisseur', adresses: [] }]);
    await Store.bulk('articles', [
      { id: 'ae1', ref: 'E2E-CO50', designation: 'Coude e2e DN50', unite: 'u', famille: 'E2E', sousFamille: 'Acier', gamme: 'Coudes', coutRevient: 10, prixVente: 0, fournisseurId: 'fe1', fournisseursConsult: ['fe2'], prixFournisseurs: { fe2: { coutRevient: 8, delai: 2 } } },
      { id: 'ae2', ref: 'E2E-T50', designation: 'Tube e2e DN50', unite: 'ml', famille: 'E2E', sousFamille: 'Acier', coutRevient: 5, marge: 20, prixVente: 6, fournisseurId: 'fe1' },
      { id: 'ae3', ref: 'e2e t50', designation: 'Tube e2e acier DN50', unite: 'ml', famille: 'E2E', coutRevient: 4.5, fournisseurId: 'fe2' }]);
  });
  return { p, erreurs };
}
const fichier = (nom, rows) => { const f = path.join(dir, nom); fs.writeFileSync(f, Buffer.from(X.build([{ name: 'Feuille', rows }]))); return f; };
const art = (p, id) => p.evaluate(x => Store.get('articles', x), id);

test('Bibliothèque : tarif fournisseur, marges par catégorie, catégories, doublons', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir();
  await p.evaluate(() => { location.hash = '#/articles'; }); await p.waitForTimeout(1200);
  // 2. Tarif du fournisseur 2 : hausse sur la variante du coude
  await p.click('#bo-tarif'); await p.waitForTimeout(300);
  await p.selectOption('#tf-f', 'fe2');
  await p.setInputFiles('#tf-file', fichier('tarif.xlsx', [['Code article', 'Libellé', 'Prix net'], ['E2E-CO50', 'Coude', '8,80'], ['INCONNU', 'x', 3]]));
  await p.waitForTimeout(800);
  assert.match(await p.textContent('#tf-res'), /1 hausse/);
  await p.click('#tf-ok'); await p.waitForTimeout(800);
  let a = await art(p, 'ae1');
  assert.strictEqual(a.prixFournisseurs.fe2.coutRevient, 8.8);
  assert.deepStrictEqual(a.historiquePrix.map(h => [h.fid, h.ancien, h.nouveau]), [['fe2', 8, 8.8]]);
  // 4. Marge de la famille E2E : prix de vente des articles sans marge propre
  await p.click('#bo-marges'); await p.waitForTimeout(300);
  await p.fill('[data-mc="E2E"]', '40');
  await p.click('#mc-app'); await p.waitForTimeout(800);
  assert.strictEqual((await art(p, 'ae1')).prixVente, 14);
  assert.strictEqual((await art(p, 'ae2')).prixVente, 6);
  // 5. Renommer « Acier » en « Acier noir » (gamme gardée)
  await p.click('#bo-cat'); await p.waitForTimeout(300);
  await p.click('[data-cat-ren="E2E|Acier"]'); await p.waitForTimeout(200);
  await p.fill('#dlg-value', 'Acier noir'); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
  a = await art(p, 'ae1');
  assert.deepStrictEqual([a.famille, a.sousFamille, a.gamme], ['E2E', 'Acier noir', 'Coudes']);
  await p.click('#cat-x'); await p.waitForTimeout(500);
  // 6. Doublons : E2E-T50 / e2e t50 → fusion, le fournisseur 2 devient une variante
  await p.click('#bo-dbl'); await p.waitForTimeout(300);
  const k = await p.$$eval('[data-grp]', l => l.findIndex(g => /E2E-T50/.test(g.textContent)));
  assert.ok(k >= 0);
  await p.check(`[data-grp-ok="${k}"]`);
  await p.click('#dg-ok'); await p.waitForTimeout(1200);
  a = await art(p, 'ae2');
  assert.ok(!(await art(p, 'ae3')));
  assert.deepStrictEqual([a.fournisseursConsult, a.prixFournisseurs], [['fe2'], { fe2: { coutRevient: 4.5 } }]);
  // Fiche : comparatif et historique
  await p.evaluate(() => editArticle({ ...Store.get('articles', 'ae1') })); await p.waitForTimeout(400);
  const fiche = await p.textContent('#modal');
  assert.match(fiche, /Comparatif des fournisseurs/); assert.match(fiche, /moins cher/); assert.match(fiche, /Historique des prix/);
  assert.deepStrictEqual(erreurs, []);
});

test('Commande, devis, facture : choix du fournisseur et prix facturés ; contrôle d\'un import ; sélecteur du terrain', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir();
  // 1. Commande chez le fournisseur 1 : moins cher chez le 2, passage chez lui avec reprise des prix
  const cid = await p.evaluate(() => Store.upsert('commandes', { numero: 'E2E', fournisseurId: 'fe1', affaireId: '', date: '2026-11-07', statut: 'Brouillon', lignes: [{ articleId: 'ae1', designation: 'Coude e2e DN50', unite: 'u', qte: 10, pu: 10 }] }).id);
  await p.evaluate(x => { location.hash = `#/commandes/${x}`; }, cid); await p.waitForTimeout(1200);
  assert.match(await p.textContent('.cmp-four'), /Négoce E2E Deux/);
  assert.match(await p.textContent('main, #app, body'), /moins cher chez Négoce E2E Deux/);
  await p.click('[data-passer="fe2"]'); await p.waitForTimeout(300);
  await p.click('.dialog [data-v="1"]'); await p.waitForTimeout(800);
  const c = await p.evaluate(x => Store.get('commandes', x), cid);
  assert.deepStrictEqual([c.fournisseurId, c.lignes[0].pu], ['fe2', 8]);
  // Devis : liste des fournisseurs d'une fourniture
  assert.match(await p.evaluate(() => choixFournisseurComposant({ articleId: 'ae1' }, 0)), /Négoce E2E Deux 8,00.*moins cher/);
  // 3. Facture du fournisseur 2 à 9 € : écart de plus de 5 % signalé, prix repris dans la bibliothèque
  await p.evaluate(x => Store.upsert('achats', { id: 'ach-e2e', ref: 'FA-E2E', fournisseurId: 'fe2', numeroFournisseur: 'F123', date: '2026-11-07', montantHT: 90, statut: 'À payer', imputations: [{ affaireId: '', commandeId: x, montantHT: 90 }], lignes: [{ designation: 'Coude e2e DN50', articleId: 'ae1', qte: 10, pu: 9, montantHT: 90 }] }), cid);
  await p.evaluate(() => { location.hash = '#/achats/ach-e2e'; }); await p.waitForTimeout(1200);
  assert.match(await p.textContent('.pf-facture'), /12,5 %.*⚠/);
  await p.click('#pf-maj'); await p.waitForTimeout(800);
  const a = await art(p, 'ae1');
  assert.strictEqual(a.prixFournisseurs.fe2.coutRevient, 9);
  assert.match(a.historiquePrix[a.historiquePrix.length - 1].source, /facture F123/);
  // 7. Import : lignes à vérifier
  await p.evaluate(() => { location.hash = '#/articles'; }); await p.waitForTimeout(1000);
  await p.click('[data-import="articles"]'); await p.waitForTimeout(300);
  await p.setInputFiles('#imp-file', fichier('import.xlsx', [['Référence', 'Description', 'Fournisseur', 'Unité', "Prix d'achat", 'Marge', 'Catégories'], ['E2E-Z', 'Zéro', 'Négoce E2E Un', 'Pièce', '0,00000', '10,00', 'E2E'], ['', 'Sans réf', 'Négoce E2E Un', 'Boîte', '2,00000', '500,00', 'E2E'], ['E2E-OK', 'Correct', 'Négoce E2E Un', 'Pièce', '2,00000', '30,00', 'E2E']]));
  await p.waitForTimeout(1000);
  const d = await p.textContent('.imp-douteux');
  assert.match(d, /2 ligne\(s\) à vérifier/); assert.match(d, /prix d'achat à 0/); assert.match(d, /unité inconnue « Boîte »/); assert.match(d, /marge de 500 %/);
  await p.check('#imp-sans-douteux'); await p.click('#imp-go'); await p.waitForTimeout(1200);
  assert.deepStrictEqual(await p.evaluate(() => Store.all('articles').filter(x => /^E2E-[ZO]/.test(x.ref)).map(x => x.ref)), ['E2E-OK']);
  await p.evaluate(() => Modal.close());
  // 8. Sélecteur du terrain : gammes, catégorie et vignette
  await p.evaluate(() => { window._sel = choisirMateriel({ titre: 'e2e' }); }); await p.waitForTimeout(400);
  await p.click('.selecteur [data-fam="E2E"]'); await p.click('.selecteur [data-sous="Acier"]'); await p.waitForTimeout(200);
  await p.click('.selecteur [data-gam="Coudes"]'); await p.waitForTimeout(200);
  assert.deepStrictEqual(await p.$$eval('.selecteur li[data-art] strong', l => l.map(x => x.textContent)), ['Coude e2e DN50']);
  assert.ok(await p.$('.selecteur .sel-photo'));
  await p.click('.selecteur .sel-fermer');
  assert.deepStrictEqual(erreurs, []);
});
