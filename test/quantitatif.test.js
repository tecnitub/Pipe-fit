// Quantitatif du complément Revit « Pipe-Fit Isométries » : soudures et joints réels dans le chiffrage depuis plan.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Q = require('../public/js/quantitatif');

const pouces = dn => ({ 50: 2, 80: 3, 100: 4 })[dn] || dn / 25;
const P = { heuresJour: 7, cadenceAtelier: 70, cadenceChantier: 35, partAtelier: 70 };

test('nature des lignes : soudures et joints réels, en atelier, sur chantier ou à répartir', () => {
  assert.strictEqual(Q.nature('Soudure atelier', 'bout à bout'), 'soudureA');
  assert.strictEqual(Q.nature('Soudure chantier', 'bout à bout'), 'soudureC');
  assert.strictEqual(Q.nature('Soudures', ''), 'soudure');
  assert.strictEqual(Q.nature('Joint boulonné atelier', 'brides'), 'jointA');
  assert.strictEqual(Q.nature('Joint boulonne chantier', ''), 'jointC');
  assert.strictEqual(Q.nature('Joint boulonné', 'brides'), 'joint');
  assert.strictEqual(Q.nature('Coude - Soudé', '3D'), '', 'un raccord soudé reste une fourniture');
  assert.strictEqual(Q.nature('Bride à collerette', 'PN16'), '');
});

test('heures par unité : cadence en pouces-diamètre, barème des joints, part atelier pour ce qui est à répartir', () => {
  const a = Q.unitaire('soudureA', 50, P, 1, pouces);
  assert.deepStrictEqual([a.poucesA, a.poucesC, +a.hA.toFixed(4), a.hSoudC], [2, 0, 0.2, 0], 'DN50 atelier : 2" à 70 "/j de 7 h = 0,2 h');
  const c = Q.unitaire('soudureC', 100, P, 1.15, pouces);
  assert.deepStrictEqual([c.poucesC, c.souduresC, +c.hSoudC.toFixed(4), c.hA], [4, 1, 0.92, 0], 'DN100 chantier : 4" à 35 "/j, coef 1,15');
  const r = Q.unitaire('soudure', 50, P, 1, pouces);
  assert.deepStrictEqual([+r.poucesA.toFixed(2), +r.poucesC.toFixed(2), +r.souduresC.toFixed(2)], [1.4, 0.6, 0.3], 'à répartir : 70 % atelier');
  assert.strictEqual(Q.unitaire('jointC', 80, P, 1, pouces).hPose, 0.7);
  assert.strictEqual(Q.unitaire('jointA', 65, P, 1, pouces).hA, 0.7, 'DN65 : barème du DN supérieur');
  assert.strictEqual(+Q.unitaire('joint', 50, P, 1, pouces).hA.toFixed(2), 0.35);
});

// Le vrai module de chiffrage, chargé dans un contexte isolé avec une petite bibliothèque
function chiffrage() {
  const ctx = vm.createContext({ console, TextEncoder, TextDecoder });
  const run = (code, nom) => vm.runInContext(code, ctx, { filename: nom });
  // Résultats ramenés dans ce contexte (objets comparables)
  run.json = (code, nom) => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx, { filename: nom }));
  run(`const num = v => (v === '' || v == null || isNaN(+v)) ? 0 : +v; const sumBy = (a, f) => a.reduce((t, x) => t + f(x), 0);
    const normRecherche = s => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
    const fmt = (x, d = 2) => Number(x || 0).toFixed(d).replace('.', ','); const eur = x => fmt(x) + ' €'; const esc = s => String(s ?? '');
    const Views = {}; const App = {};
    const DB = {
      familles: [
        { id: 'fa1', nom: 'Tuyau', alias: 'Tube inox', categorie: 'tube', unite: 'ml', soudures: 0, declinaisons: [{ dn: 50, articleId: 'a1' }] },
        { id: 'fa2', nom: 'Coude - Soudé', alias: 'Coude', categorie: 'raccord', unite: 'u', soudures: 2, tempsPrefab: 0.1, declinaisons: [{ dn: 50, articleId: 'a4' }] },
        { id: 'fa3', nom: 'Té - Soudé', categorie: 'raccord', unite: 'u', soudures: 3, tempsPrefab: 0.15, declinaisons: [{ dn: 50, articleId: 'a14' }] },
        { id: 'fa4', nom: 'Bride à collerette', categorie: 'raccord', unite: 'u', soudures: 1, tempsPrefab: 0.1, tempsPose: 0.3, declinaisons: [{ dn: 50, articleId: 'a16' }] }],
      articles: [{ id: 'a1', ref: 'TUB50', designation: 'Tube inox DN50', unite: 'ml', coutRevient: 40 }, { id: 'a4', ref: 'COU50', designation: 'Coude DN50', coutRevient: 20 },
        { id: 'a14', ref: 'TE50', designation: 'Té DN50', coutRevient: 30 }, { id: 'a16', ref: 'BRI50', designation: 'Bride DN50', coutRevient: 25 }],
      mainoeuvre: [{ id: 'm1', code: 'PREF', libelle: 'Préfabrication', tauxVente: 60, tauxCout: 40 }, { id: 'm2', code: 'MONT', libelle: 'Montage', tauxVente: 55, tauxCout: 38 }],
      chiffrages: [] };
    const Store = { all: k => DB[k] || [], get: (k, id) => (DB[k] || []).find(x => x.id === id) };`, 'stubs.js');
  for (const f of ['xlsx.js', 'quantitatif.js', 'chiffrage.js']) run(fs.readFileSync(path.join(__dirname, '../public/js', f), 'utf8'), f);
  return run;
}

test('chiffrage depuis le quantitatif Revit : soudures réelles à la place de l\'estimation, devis par réseau', () => {
  const run = chiffrage();
  const r = run.json(`(() => {
    const sheet = XLSX.readCSV(new TextEncoder().encode(QUANTITATIF_EXEMPLE).buffer)[0];
    const an = analyserNomenclature(sheet);
    const ch = { id: 'ch1', lignes: lignesPlan(sheet, an, 'auto'), params: { ...parametresDefaut(), moAtelier: 'm1', moChantier: 'm2' }, extras: [] };
    const c = calculerChiffrage(ch);
    return { colonnes: Object.keys(an.colonnes), lignes: ch.lignes, c, devis: lignesDevisDepuis(ch) };
  })()`, 'essai.js');

  assert.deepStrictEqual(r.colonnes.sort(), ['famille', 'longueur', 'quantite', 'systeme', 'taille', 'type'], 'colonnes reconnues');
  const tube = r.lignes.find(l => l.systeme === 'NEP-ALLER' && l.famille === 'Tube');
  assert.deepStrictEqual([tube.dn, tube.longueur, tube.qte, tube.nature], [50, 3.968, 1, ''], 'tube : 3,968 m (mm convertis)');
  assert.strictEqual(r.c.reelles, true);

  const nep = r.c.liste.filter(g => g.systeme === 'NEP-ALLER');
  const coude = nep.find(g => g.fam && g.fam.id === 'fa2');
  assert.deepStrictEqual([coude.sd, coude.poucesA, coude.statut], [0, 0, 'ok'], 'coude : plus de soudures estimées');
  const sa = nep.find(g => g.nature === 'soudureA');
  // Niveau « Standard » par défaut : coefficient 1,15 sur les heures
  assert.deepStrictEqual([sa.qte, sa.poucesA, +sa.hA.toFixed(3), sa.statut], [10, 20, 0.23, 'ok'], '10 soudures atelier DN50 = 20", 0,2 h × 1,15');
  const jc = nep.find(g => g.nature === 'jointC');
  assert.deepStrictEqual([jc.qte, +jc.hPose.toFixed(3)], [3, 0.575], '3 joints boulonnés chantier DN50 (0,5 h × 1,15)');
  // Pouces totaux : atelier 10×2 + 7×4 + 2×3 + 6×2 = 66 ; chantier : 1 soudure DN100 = 4"
  assert.strictEqual(r.c.tot.poucesA, 66);
  assert.strictEqual(r.c.tot.poucesC, 4);

  const d = r.devis;
  const titres = d.filter(l => l.type === 'chapitre').map(l => l.titre);
  assert.ok(titres.includes('Réseau NEP-ALLER') && titres.includes('Préfabrication atelier') && titres.includes('Pose sur site'));
  const soud = d.find(l => l.designation === 'Soudures atelier DN50 (2")');
  assert.ok(soud && soud.qte === 10 && soud.composants[0].moId === 'm1' && soud.unite === 'soudure', 'ouvrage soudures atelier');
  assert.ok(d.some(l => l.designation === 'Soudures de raccordement sur site DN100 (4")' && l.qte === 1), 'soudure chantier DN100');
  assert.ok(d.some(l => l.designation === 'Montage des joints boulonnés sur site DN50' && l.qte === 3), 'joints chantier');
  assert.ok(d.some(l => l.designation === 'Montage des joints boulonnés en atelier DN100' && l.qte === 2), 'joints atelier (vanne entre brides)');
  assert.ok(!d.some(l => /DN50.*soudure\(s\) de/.test(l.detail || '')), 'aucune soudure estimée par famille');
});

test('sans soudures réelles (ancienne nomenclature) : estimation par famille inchangée', () => {
  const run = chiffrage();
  const c = run.json(`calculerChiffrage({ lignes: [{ systeme: 'X', famille: 'Coude - Soudé', type: '', dn: 50, longueur: 0, qte: 4 }], params: { ...parametresDefaut() } })`, 'essai2.js');
  assert.strictEqual(c.reelles, false);
  assert.strictEqual(c.liste[0].sd, 2);
  assert.strictEqual(+c.tot.poucesA.toFixed(2), 4 * 2 * 2 * 0.7);
});
