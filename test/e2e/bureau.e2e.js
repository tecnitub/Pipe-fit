// Tests des écrans du bureau (navigateur, démo) : moins de ressaisie. Avenant créé depuis le chantier et rattaché à
// son acceptation (n° de commande du client repris), situation sur l'avenant ; choix du client qui préremplit contact
// et site ; « + Nouveau contact… » qui crée la fiche et la choisit sans quitter la fenêtre.
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-e2e-bureau-'));
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
const aller = async (p, h) => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(1000); };

test('CRM : avenant créé depuis le chantier, rattaché à son acceptation, puis situation sur l\'avenant', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('pipefit-crm-demo.html');
  const a = await p.evaluate(() => {
    const af = Store.all('affaires').find(x => !estHorsDevis(x) && !x.archive && x.statut !== 'Clos' && devisAcceptes(x.id).length === 1);
    return { id: af.id, clientId: af.clientId, contactId: af.contactId || '', nb: Store.all('affaires').length, ca: Calc.affaire(af).caDevis, refCommande: af.refCommande || '' };
  });
  await aller(p, `#/chantier/${a.id}`);
  await p.click('#ch-avenant'); await p.waitForTimeout(800);
  const dv = await p.evaluate(() => Store.get('devis', location.hash.split('/')[2]));
  assert.strictEqual(dv.affaireId, a.id);
  assert.strictEqual(dv.clientId, a.clientId);
  if (a.contactId) assert.strictEqual(dv.contactId, a.contactId);
  assert.ok(dv.avenantDe, 'avenant du devis de base');
  assert.match(await p.innerText('#app'), /Avenant au chantier/);
  // Une ligne chiffrée, puis acceptation : rattachement proposé par défaut, n° de commande du client saisi
  await p.evaluate(id => { const d = Store.get('devis', id); d.lignes.push({ type: 'ouvrage', designation: 'Déplacement d\'un radiateur', unite: 'u', qte: 2, composants: [{ type: 'f', designation: 'Fournitures', unite: 'u', qte: 1, pu: 400, cout: 250 }] }); Store.upsert('devis', d); App.render(); }, dv.id);
  await p.waitForTimeout(500);
  await p.click('#accept'); await p.waitForTimeout(300);
  assert.ok(await p.$eval('.dialog [name="acc-mode"][value="rattacher"]', x => x.checked));
  await p.fill('.dialog #acc-cde', 'CDE-AV-42');
  await p.click('.dialog [data-v="1"]'); await p.waitForTimeout(800);
  const r = await p.evaluate(([id, af]) => ({ d: Store.get('devis', id), hash: location.hash, nb: Store.all('affaires').length, ca: Calc.affaire(Store.get('affaires', af)).caDevis, ref: Store.get('affaires', af).refCommande, n: devisAcceptes(af).length }), [dv.id, a.id]);
  assert.strictEqual(r.d.statut, 'Accepté');
  assert.strictEqual(r.d.affaireId, a.id);
  assert.strictEqual(r.d.refCommande, 'CDE-AV-42');
  assert.strictEqual(r.nb, a.nb, 'aucun nouveau chantier');
  assert.strictEqual(r.hash, `#/chantier/${a.id}`);
  assert.strictEqual(r.n, 2);
  assert.ok(r.ca > a.ca, 'le montant de l\'avenant s\'ajoute au budget');
  assert.strictEqual(r.ref, a.refCommande || 'CDE-AV-42');
  // Situation de travaux : choix du devis (marché de base ou avenant)
  await p.click('#situation'); await p.waitForTimeout(300);
  await p.click('.dialog button:has-text("(avenant)")'); await p.waitForTimeout(800);
  const sit = await p.evaluate(() => Store.get('situations', location.hash.split('/')[2]));
  assert.strictEqual(sit.devisId, dv.id);
  assert.deepStrictEqual(erreurs, []);
});

test('CRM : le client choisi préremplit contact et site ; « + Nouveau contact… » crée et choisit la fiche', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('pipefit-crm-demo.html');
  const c = await p.evaluate(() => {
    const e = clientsList().find(x => contactsOf(x.id).length && (x.adresses || []).length === 1);
    return { id: e.id, contact: defaultContact(e.id), site: e.adresses[0].id };
  });
  await aller(p, '#/chantiers');
  await p.click('#add-hd'); await p.waitForTimeout(400);
  await p.selectOption('#modal-box [name="clientId"]', c.id); await p.waitForTimeout(200);
  assert.strictEqual(await p.$eval('#modal-box [name="contactId"]', x => x.value), c.contact);
  assert.strictEqual(await p.$eval('#modal-box [name="siteId"]', x => x.value), c.site);
  // Nouveau contact sans quitter la fenêtre de l'intervention
  await p.selectOption('#modal-box [name="contactId"]', '__nouveau'); await p.waitForTimeout(300);
  await p.fill('.dialog [name="prenom"]', 'Julie'); await p.fill('.dialog [name="nom"]', 'Essai');
  await p.click('.dialog [data-v="1"]'); await p.waitForTimeout(300);
  const nouv = await p.evaluate(id => (Store.all('contacts').find(x => x.nom === 'Essai' && x.entrepriseId === id) || {}).id, c.id);
  assert.ok(nouv, 'contact créé chez le client');
  assert.strictEqual(await p.$eval('#modal-box [name="contactId"]', x => x.value), nouv);
  assert.strictEqual(await p.$eval('#modal-box [name="siteId"]', x => x.value), c.site);
  await p.fill('#modal-box [name="nom"]', 'Intervention e2e');
  await p.click('#modal-box [data-act="save"]'); await p.waitForTimeout(800);
  const hd = await p.evaluate(() => Store.get('affaires', location.hash.split('/')[2]));
  assert.deepStrictEqual([hd.clientId, hd.contactId, hd.siteId], [c.id, nouv, c.site]);
  // Fiche client : « + Devis » prérempli (contact par défaut, site unique)
  await aller(p, `#/entreprise/${c.id}`);
  await p.click('#ent-devis'); await p.waitForTimeout(800);
  const d = await p.evaluate(() => Store.get('devis', location.hash.split('/')[2]));
  assert.deepStrictEqual([d.clientId, d.contactId, d.siteId], [c.id, c.contact, c.site]);
  assert.deepStrictEqual(erreurs, []);
});

test('CRM : commande depuis le chantier (fournisseur proposé, unité des lignes libres), échéances selon les conditions de paiement', { skip: sansPlaywright, timeout: 120000 }, async () => {
  const { p, erreurs } = await ouvrir('pipefit-crm-demo.html');
  const a = await p.evaluate(() => { const af = chantiersActifs().find(x => besoinsChantier(x.id).some(b => b.a.fournisseurId)); return af ? { id: af.id, f: fournisseurPrincipal(af.id) } : null; });
  assert.ok(a, 'chantier de démonstration avec des fournitures à commander');
  await aller(p, `#/commandes/new?chantier=${a.id}`); await p.waitForTimeout(500);
  const c = await p.evaluate(() => Store.get('commandes', location.hash.split('/')[2]));
  assert.deepStrictEqual([c.affaireId, c.fournisseurId], [a.id, a.f]);
  await p.click('#c-free'); await p.waitForTimeout(400);
  await p.selectOption('select[data-k="unite"]', 'ml'); await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(id => Store.get('commandes', id).lignes.slice(-1)[0].unite, c.id), 'ml');
  // Fournisseur payé à 30 jours fin de mois : échéance de la facture fournisseur recalculée avec la date
  const fid = await p.evaluate(() => { const f = fournisseursList()[0]; Object.assign(f, { delaiPaiement: 30, finDeMois: '1' }); Store.upsert('entreprises', f); return f.id; });
  await aller(p, '#/achats/new'); await p.waitForTimeout(500);
  await p.selectOption('#ac-four', fid); await p.waitForTimeout(400);
  await p.fill('#ac-date', '2027-01-15'); await p.dispatchEvent('#ac-date', 'change'); await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => Store.get('achats', location.hash.split('/')[2]).echeance), '2027-02-28');
  // Facture client : échéance modifiable
  const fa = await p.evaluate(() => (Store.all('factures').find(f => f.type !== 'avoir') || {}).id);
  await aller(p, `#/facture/${fa}`);
  await p.fill('#f-ech', '2027-03-31'); await p.dispatchEvent('#f-ech', 'change'); await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(id => Store.get('factures', id).echeance, fa), '2027-03-31');
  assert.deepStrictEqual(erreurs, []);
});
