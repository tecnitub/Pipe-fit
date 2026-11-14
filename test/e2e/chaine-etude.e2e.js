// Chaîne complète d'une étude sur la version de démonstration (dist/etudes.html construit dans un dossier temporaire) :
// nouvelle étude → « Puissance d'un bâtiment » → bouton « 🏭 Production depuis ce bâtiment » (schéma de principe, puissance
// reprise au circuit) → CTA reliée automatiquement au circuit « batterie de CTA » → calculs annexes (hotte, parking,
// bouclage / légionelle) → armoire électrique (équipements repris à l'ouverture) → points GTC, séquences et analyse
// fonctionnelle, postes du métré « annexe|… ». Puis Réglages : PRP surchargé marqué dans la liste des fluides et
// « Mettre à jour les études » (ancien défaut qPlace = 600 vidé). Données fictives (ACME, Exemplair).
// Usage : npm run test:e2e   (Chromium via Playwright)
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-chaine-'));
  execFileSync(process.execPath, [path.join(racine, 'demo', 'build.js'), path.join(dir, 'pipefit-crm-demo.html')], { stdio: 'ignore' });
});
after(async () => { if (navigateur) await navigateur.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

async function ouvrir(login) {
  navigateur = navigateur || await chromium.launch();
  const p = await (await navigateur.newContext({ viewport: { width: 1400, height: 900 } })).newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`file://${path.join(dir, 'etudes.html')}`);
  await p.waitForTimeout(1000);
  await p.evaluate(() => { localStorage.clear(); location.reload(); });
  await p.waitForTimeout(1500);
  if (await p.$('input[type=password]')) { await (await p.$$('input'))[0].fill(login); await p.fill('input[type=password]', 'demo'); await p.keyboard.press('Enter'); }
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me && S.config);
  return { p, erreurs };
}
// Attend que l'adresse change (navigation de l'application) et que la vue soit dessinée
const attendreHash = async (p, re) => { await p.waitForFunction(s => new RegExp(s).test(location.hash), re.source); await p.waitForTimeout(300); };
const etude = (p, id) => p.evaluate(i => JSON.parse(JSON.stringify(etudeDe(i))), id);
// « + Ajouter un calcul » puis le type voulu (les calculs annexes sont dans un groupe repliable)
async function ajouterCalcul(p, type) {
  await p.click('#ajout');
  await p.waitForSelector('#modal:not([hidden]) [data-type]');
  const bouton = `#modal [data-type="${type}"]`;
  if (!await p.isVisible(bouton)) await p.click('#modal details.annexes-types > summary');
  await p.click(bouton);
  await attendreHash(p, /^#\/etude\/[^/]+\/[^/]+$/);
  return p.evaluate(() => location.hash.split('/')[3]);
}
const retourEtude = async (p, id) => { await p.evaluate(i => { location.hash = `#/etude/${i}`; }, id); await p.waitForSelector('#ajout'); };

test('Étude complète : bâtiment → production → CTA reliée → annexes → armoire, GTC, régulation, métré', { skip: sansPlaywright, timeout: 240000 }, async () => {
  const { p, erreurs } = await ouvrir('jacky');
  // 1. Nouvelle étude (dialogue)
  await p.click('#nouvelle');
  await p.fill('#f-etude [name="objet"]', 'ACME — siège Exemplair (essai de bout en bout)');
  await p.click('#f-etude .actions button:not(.secondaire)');
  await attendreHash(p, /^#\/etude\/[^/]+$/);
  const id = await p.evaluate(() => location.hash.split('/')[2]);

  // 2. Puissance d'un bâtiment, chauffage seulement
  const bat = await ajouterCalcul(p, 'batiment');
  await p.fill('[data-k="nom"]', 'Bâtiment ACME');
  await p.selectOption('select[data-k="mode"]', 'chaud');
  await p.waitForTimeout(600);
  // 3. Production depuis ce bâtiment : nouveau schéma de principe ouvert
  await p.click('#bat-production');
  await p.waitForFunction(b => location.hash.split('/')[3] && location.hash.split('/')[3] !== b, bat);
  await p.waitForTimeout(400);
  const pid = await p.evaluate(() => location.hash.split('/')[3]);
  let et = await etude(p, id);
  const notePid = et.notes.find(n => n.id === pid);
  assert.strictEqual(notePid.type, 'pid');
  assert.deepStrictEqual(notePid.entrees.circuits.map(c => [c.rep, c.bilan]), [['Bâtiment ACME — chauffage', bat]]);
  const puissance = await p.evaluate(([i, b, s]) => {
    const e = etudeDe(i), n = e.notes.find(x => x.id === b), v = Liens.calculer(e, n).valeurs, r = Liens.resoudre(e, e.notes.find(x => x.id === s));
    return { Pch: v.Pchauf / 1000, P: r.entrees.circuits[0].P, verrou: r.verrous['circuits.0.P'] || '' };
  }, [id, bat, pid]);
  assert.ok(puissance.Pch > 5, `puissance du bâtiment ${puissance.Pch} kW`);
  assert.strictEqual(puissance.P, Math.round(puissance.Pch * 10) / 10, 'puissance du bâtiment reprise au circuit');
  assert.ok(puissance.verrou, 'puissance du circuit verrouillée (reprise)');
  assert.strictEqual(await p.$eval('[data-l="circuits.0.P"]', x => x.value.replace(',', '.')), String(puissance.P));

  // 4. CTA : circuit « batterie de CTA » ajouté au schéma (données), CTA créée par le dialogue → liaison automatique
  await p.evaluate(([i, s]) => {
    const e = etudeDe(i), n = e.notes.find(x => x.id === s);
    n.entrees.circuits.push({ rep: 'CTA ACME', emetteur: 'cta', P: '', regime: '', regulation: '3v', L: 30 });
    enregistrer(e);
  }, [id, pid]);
  await retourEtude(p, id);
  const cta = await ajouterCalcul(p, 'cta');
  await p.fill('.titre-note', 'CTA Exemplair bureaux');
  await p.waitForTimeout(500);
  assert.match(await p.textContent('#app'), /reliée\(s\) automatiquement au circuit « CTA ACME »/);
  await p.evaluate(([i, s]) => { location.hash = `#/etude/${i}/${s}`; }, [id, pid]);
  await p.waitForTimeout(500);
  assert.match(await p.textContent('#app'), /Circuit « CTA ACME » relié automatiquement à la CTA/);
  const liaison = await p.evaluate(([i, s]) => {
    const e = etudeDe(i), A = Liens.liaisonsAutoCta(e), r = Liens.resoudre(e, e.notes.find(x => x.id === s)), v = Liens.calculer(e, e.notes.find(x => x.type === 'cta')).valeurs;
    return { liens: A.liens.map(l => [l.cta.id, l.pid.id, l.i, l.bats]), annexe: r.entrees.circuits[1].annexe, P: r.entrees.circuits[1].P, Pchaud: v.Pchaud };
  }, [id, pid]);
  assert.deepStrictEqual(liaison.liens, [[cta, pid, 1, ['bc']]]);
  assert.strictEqual(liaison.annexe, cta);
  assert.strictEqual(liaison.P, Math.round(liaison.Pchaud * 10) / 10, 'puissance de la batterie chaude renvoyée au circuit');

  // 5. Calculs annexes : hotte, parking, bouclage / légionelle
  const annexes = {};
  for (const t of ['hotte', 'parking', 'legionelle']) { await retourEtude(p, id); annexes[t] = await ajouterCalcul(p, t); assert.ok(await p.$('.titre-note')); }

  // 6. Armoire électrique : équipements de l'étude repris à l'ouverture du calcul
  await retourEtude(p, id);
  const elec = await ajouterCalcul(p, 'elec');
  await p.waitForTimeout(600);
  assert.match(await p.textContent('#app'), /Bilan mis à jour depuis l'étude/);
  et = await etude(p, id);
  const el = et.notes.find(n => n.id === elec), eqs = el.entrees.equipements || [], src = t => eqs.filter(q => String(q.src || '').startsWith(`${annexes[t]}:`)).map(q => q.rep);
  assert.ok(src('hotte').includes('EXT-CUI') && src('hotte').includes('EVG-EXT-CUI'), `hotte : ${src('hotte')}`);
  assert.ok(src('parking').includes('EXT-PK-1') && src('parking').includes('EXT-PK-CO'), `parking : ${src('parking')}`);
  assert.ok(src('legionelle').includes('PB-ECS') && src('legionelle').includes('TR-ECS'), `légionelle : ${src('legionelle')}`);
  assert.ok(eqs.some(q => String(q.src || '').startsWith(`${cta}:`)), 'équipements de la CTA dans l\'armoire');
  assert.ok(eqs.some(q => String(q.src || '').startsWith(`${pid}:`)), 'équipements de la production dans l\'armoire');
  // Lignes visibles dans le tableau de l'armoire
  const valeurs = await p.$$eval('#app input, #app textarea', xs => xs.map(x => x.value).join(' | '));
  ['EXT-CUI', 'EXT-PK-1', 'PB-ECS'].forEach(r => assert.ok(valeurs.includes(r), `ligne ${r} absente du tableau`));
  // « Mettre à jour depuis l'étude » : rien de nouveau, l'armoire est à jour
  await p.click('#elec-reprendre');
  await p.waitForTimeout(300);

  // 7. Points GTC, séquences (GTB), analyse fonctionnelle (régulation), métré
  const r = await p.evaluate(([i, e]) => {
    const et2 = etudeDe(i), n = et2.notes.find(x => x.id === e), c = Liens.calculer(et2, n), bl = t => (c.onglets.find(o => o.titre === t) || { blocs: [] }).blocs;
    const ech = bl('GTB et BACS').find(b => /^Table d'échange GTB/.test(b.titre || ''));
    return { gtb: bl('GTB et BACS').map(b => b.titre || ''), reg: bl('Régulation').map(b => b.titre || ''), points: ech ? ech.tableau.lignes.map(l => l[2]) : [],
      titres: Object.fromEntries(et2.notes.map(x => [x.id, x.titre])), metre: Metre.metre(et2).map(x => x.cle),
      erreurs: (c.alertes || []).filter(a => a.niveau === 'erreur' && /Calcul impossible/.test(a.texte)).length };
  }, [id, elec]);
  assert.strictEqual(r.erreurs, 0);
  ['EXT-CUI', 'EVG-EXT-CUI', 'EXT-PK-1', 'EXT-PK-CO', 'PB-ECS', 'TR-ECS'].forEach(x => assert.ok(r.points.includes(x), `point GTC ${x} absent`));
  ['hotte', 'parking', 'legionelle'].forEach(t => {
    assert.ok(r.gtb.includes(`Séquences — ${r.titres[annexes[t]]}`), `séquences ${t}`);
    assert.ok(r.reg.some(x => x.startsWith(`Analyse fonctionnelle — ${r.titres[annexes[t]]}`)), `analyse fonctionnelle ${t}`);
  });
  ['annexe|hotte|EXT-CUI', 'annexe|hotte|EVG-EXT-CUI', 'annexe|parking|EXT-PK', 'annexe|parking|EXT-PK-CO', 'annexe|legionelle|PB-ECS'].forEach(c => assert.ok(r.metre.includes(c), `poste du métré ${c}`));
  // Onglets de l'armoire affichés : GTB (séquences, table d'échange) et régulation (analyse fonctionnelle)
  await p.click('[data-onglet="GTB et BACS"]');
  await p.waitForTimeout(300);
  let texte = await p.textContent('#app');
  assert.match(texte, /Séquences — Hotte de cuisine/);
  assert.match(texte, /Table d'échange GTB/);
  await p.click('[data-onglet="Régulation"]');
  await p.waitForTimeout(300);
  texte = await p.textContent('#app');
  assert.match(texte, /Analyse fonctionnelle — Ventilation de parking/);
  assert.match(texte, /Analyse fonctionnelle — Anti-légionelle/);
  // Vue de l'étude : les annexes sont rangées à part
  await retourEtude(p, id);
  assert.match(await p.textContent('#app'), /Calculs annexes/);
  assert.deepStrictEqual(erreurs, []);
});

test('Réglages : PRP surchargé marqué dans la liste des fluides, mise à jour des anciennes études (qPlace = 600)', { skip: sansPlaywright, timeout: 240000 }, async () => {
  const { p, erreurs } = await ouvrir('admin');
  // Ancienne étude : parking enregistré avec le défaut explicite 600, un autre avec une valeur saisie (650)
  const id = await p.evaluate(() => {
    const et = nouvelleEtude(); et.objet = 'ACME — parking ancien';
    et.notes.push({ ...nouvelleNote('parking'), titre: 'Parking ACME niveau -1', entrees: { ...Notes.defauts('parking'), qPlace: 600, coAl: 100 } });
    et.notes.push({ ...nouvelleNote('parking'), titre: 'Parking ACME niveau -2', entrees: { ...Notes.defauts('parking'), qPlace: 650 } });
    et.notes.push({ ...nouvelleNote('drv'), titre: 'DRV Exemplair', entrees: { ...Notes.defauts('drv'), fluide: 'R32' } });
    enregistrer(et); return et.id;
  });
  await p.waitForTimeout(600);
  // Réglages : valeurs surchargées et enregistrées
  await p.evaluate(() => { location.hash = '#/reglages'; });
  await p.waitForSelector('#vr-enreg');
  await p.evaluate(() => document.querySelectorAll('#valeurs-regl details').forEach(d => { d.open = true; }));
  await p.fill('[data-vreg="parking.qPlace"]', '500');
  await p.fill('[data-vreg="fluide.R32.ar4"]', '700');
  await p.click('#vr-enreg');
  await p.waitForFunction(() => S.config.valeursRegl && S.config.valeursRegl['parking.qPlace'] === 500);
  await p.waitForSelector('#vr-maj');
  assert.match(await p.textContent('#vr-maj-nb'), /^\d+ champ\(s\)/);
  // Aperçu : seul le champ resté sur l'ancien défaut est proposé (la valeur saisie 650 n'y est pas)
  await p.click('#vr-maj');
  await p.waitForSelector('#modal:not([hidden]) #mv-ok');
  // (autres études de la démonstration éventuellement concernées : on ne regarde que celle de l'essai)
  const deLEssai = () => p.$$eval('#modal [data-mv-ligne]', xs => xs.map(x => x.innerText.replace(/\s+/g, ' ')).filter(t => t.includes('ACME — parking ancien')));
  const lignes = await deLEssai();
  assert.strictEqual(lignes.length, 1);
  assert.match(lignes[0], /ACME — parking ancien.*Parking ACME niveau -1.*qPlace.*600 → 500/);
  // Option « tous » : le seuil d'alarme CO (100, inchangé dans les Réglages) apparaît aussi
  await p.check('#mv-tous');
  assert.strictEqual((await deLEssai()).length, 2);
  await p.uncheck('#mv-tous');
  await p.click('#mv-ok');
  await p.waitForTimeout(700);
  const et = await etude(p, id);
  assert.deepStrictEqual(et.notes.filter(n => n.type === 'parking').map(n => n.entrees.qPlace), ['', 650]);
  assert.strictEqual(et.notes[0].entrees.coAl, 100);
  assert.deepStrictEqual(await p.evaluate(i => MajValeurs.detecter(S.etudes).filter(x => x.etudeId === i), id), []);
  const q = await p.evaluate(i => { const e = etudeDe(i); return e.notes.filter(n => n.type === 'parking').map(n => Liens.calculer(e, n).valeurs.QGV); }, id);
  // Parking mis à jour : débit des Réglages (500 m³/h par véhicule, 100 places) ; valeur saisie gardée (650)
  assert.deepStrictEqual(q, [50000, 65000]);
  // Liste des fluides du calcul DRV : PRP retenu et marque de surcharge
  const drv = et.notes.find(n => n.type === 'drv').id;
  await p.evaluate(([i, n]) => { location.hash = `#/etude/${i}/${n}`; }, [id, drv]);
  await p.waitForSelector('select[data-k="fluide"]');
  const opt = await p.$eval('select[data-k="fluide"] option[value="R32"]', o => o.textContent);
  assert.strictEqual(opt, 'R32 — A2L, PRP 700 ✱ Réglages (défaut 675)');
  assert.strictEqual(await p.$eval('select[data-k="fluide"] option[value="R410A"]', o => o.textContent), 'R410A — A1, PRP 2088');
  assert.strictEqual(await p.$eval('select[data-k="fluide"]', s => s.value), 'R32');
  assert.deepStrictEqual(erreurs, []);
});
