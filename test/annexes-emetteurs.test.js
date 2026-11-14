// Calculs annexes « Émetteurs et terminaux » : plancher chauffant (NF EN 1264), radiateurs (NF EN 442), plafonds
// rayonnants / poutres froides, échangeur à plaques. Valeurs de référence calculées à la main ; liens à une étude fictive
// (bilans pièce par pièce, terminaux, schémas de principe).
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Terminaux = require('../etudes/public/js/terminaux');
global.Schema = require('../etudes/public/js/schema');
global.Pieces = require('../etudes/public/js/pieces');
require('../etudes/public/js/industriel');
const L = require('../etudes/public/js/liens');
const A = require('../etudes/public/js/annexes-emetteurs');

const proche = (v, ref, tol, msg) => assert.ok(Math.abs(v - ref) <= tol, `${msg || ''} ${v} ≠ ${ref} ± ${tol}`);
const note = (id, type, entrees = {}, titre = type) => ({ id, type, titre, entrees: { ...N.defauts(type), ...entrees } });
const TYPES = ['plancher', 'radiateurs', 'plafonds', 'echangeurPlaques'];

test('émetteurs : types déclarés comme calculs annexes, calcul par défaut sans erreur', () => {
  TYPES.forEach(k => {
    const t = N.TYPES[k], r = N.calculer(k, {});
    assert.ok(t && t.annexe && t.famille === 'Calculs annexes' && t.theme === 'Émetteurs et terminaux', k);
    assert.ok(typeof t.lier === 'function', `${k} : lier`);
    assert.ok(r.synthese && r.resume.length && r.hypotheses.length, k);
    assert.deepStrictEqual(r.alertes.filter(a => a.niveau === 'erreur'), [], k);
    r.tableaux.forEach(x => x.lignes.forEach(l => assert.strictEqual(l.length, x.entetes.length, `${k} : ${x.titre}`)));
  });
});

test('plancher : coefficient K_H de la NF EN 1264-2, courbe limite, écart logarithmique', () => {
  // T = 15 cm, R = 0,10, tube 16 mm, chape 45 mm (λ 1,2) : aB = 0,1376/0,2301 ; aT^mT = 1,156^−1 ; aD^mD = 1,04^−1
  proche(A.kH(0.15, 0.10, 0.016), 6.7 * (0.1375926 / 0.2300926) / 1.156 / 1.04, 1e-4);
  proche(A.kH(0.15, 0.10, 0.016), 3.3326, 1e-3);
  proche(A.qLimite(29, 20), 100.0, 0.1, '29 °C en surface ↔ 100 W/m²');
  proche(A.qLimite(33, 20), 8.92 * 13 ** 1.1, 1e-9);
  proche(A.tSurface(100, 20), 29, 0.01);
  proche(A.dtlmAmbiance(35, 30, 20), 5 / Math.log(1.5), 1e-9);
  proche(A.dtlmAmbiance(A.retourPour(10, 35, 20), 35, 20) || A.dtlmAmbiance(35, A.retourPour(10, 35, 20), 20), 10, 1e-6);
});

test('plancher : pas de pose, surface, boucles, débit et réglage (cas de référence)', () => {
  // 20 m², 1 kW, carrelage (R 0,01), 35/30 °C, ambiance 20 °C : q = 50 W/m² ; K_H(30 cm) = 3,47, K_H(25) = 3,97, K_H(20) = 4,53
  // → pas de 20 cm (50 / 4,53 = 11,0 K ≤ ΔθH nominal 12,3 K) ; surface 20 + (50/8,92)^(1/1,1) = 24,8 °C ; boucle 100 m + 2 × 5 m
  const r = N.calculer('plancher', { couverture: 100, locaux: [{ local: 'Séjour', S: 20, P: 1, zone: 'sejour', rev: 'carrelage', Lc: 5 }] });
  const l = r.valeurs.locaux[0];
  proche(l.pas, 0.20, 1e-9, 'pas');
  proche(l.TF, 24.79, 0.02, 'surface');
  proche(l.q, 50, 1e-9);
  assert.strictEqual(l.nb, 1); proche(l.Lb, 110, 1e-9);
  // Débit : m = A q (1 + R0/Ru) / (σ cp), σ tel que ΔθH(35, 35 − σ, 20) = 50 / K_H
  const K = A.kH(0.20, 0.01, 0.016), Tr = A.retourPour(50 / K, 35, 20), fact = 1 + (1 / 10.8 + 0.01 + 0.045 / 1.2) / 2;
  const w = require('../etudes/public/js/calculs').eau(32.5), Q = 20 * 50 * fact / ((35 - Tr) * 4186) * 3600 / w.rho * 1000;
  proche(l.Q, Q, 1e-6, 'débit');
  assert.ok(35 - Tr > 5, 'local moins exigeant que le nominal : écart plus grand');
  assert.deepStrictEqual(r.alertes.filter(a => a.niveau === 'erreur'), []);
  // Grande pièce : boucles ≤ 120 m ; réglage : la boucle la plus défavorisée en grande ouverture
  const g = N.calculer('plancher', { locaux: [{ local: 'Hall', S: 60, P: 3, rev: 'carrelage' }, { local: 'Bureau', S: 12, P: 0.5, rev: 'carrelage', Lc: 15 }] });
  const h = g.valeurs.locaux.find(x => x.local === 'Hall');
  assert.ok(h.nb >= 2 && h.Lb <= 120, `${h.nb} boucles de ${h.Lb} m`);
  const reg = g.tableaux[1].lignes;
  assert.ok(reg.some(x => x[7] === 'grande ouverture') && reg.some(x => x[7] !== 'grande ouverture'));
  // Besoin au-delà de la courbe limite : appoint signalé ; départ insuffisant : erreur
  const lim = N.calculer('plancher', { locaux: [{ local: 'Véranda', S: 10, P: 1.5, rev: 'carrelage' }] });
  assert.ok(lim.alertes.some(a => /courbe limite/.test(a.texte)));
  assert.ok(lim.alertes.some(a => a.niveau === 'erreur' && /insuffisant/.test(a.texte)));
});

test('plancher rafraîchissant : point de rosée et température de surface ≥ 19 °C', () => {
  const ok = N.calculer('plancher', { rafraich: 'oui', TdF: 18, dTF: 3, TiF: 26, HR: 50, locaux: [{ local: 'Séjour', S: 30, P: 1.2, Pfr: 2, rev: 'carrelage' }] });
  proche(ok.valeurs.Tros, 14.77, 0.02, 'rosée 26 °C / 50 %');
  const t = ok.tableaux[0].lignes[0];
  assert.ok(parseFloat(t[t.length - 2].replace(',', '.')) >= 19, 'surface ≥ 19 °C');
  assert.ok(ok.alertes.some(a => /couvre/.test(a.texte)), 'froid partiellement couvert (≈ 7 W/m²·K)');
  const ko = N.calculer('plancher', { rafraich: 'oui', TdF: 12, HR: 60, locaux: [{ local: 'Séjour', S: 30, P: 1.2, Pfr: 1 }] });
  assert.ok(ko.alertes.some(a => a.niveau === 'erreur' && /rosée/.test(a.texte)));
});

test('radiateurs : facteur (ΔT/50)^1,3, puissance au catalogue, dimensions et débits', () => {
  // 70/50/20 : ΔT = 20 / ln(50/30) = 39,15 K ; facteur 0,7276 ; 1 200 W → 1 649 W à ΔT 50 ; type 11 en 2 m (> 1,6 m) → type 21, 1 400 mm
  proche(A.facteurRad(A.dtlmAmbiance(70, 50, 20), 1.3), 0.7276, 1e-4);
  const r = N.calculer('radiateurs', { Td: 70, Tr: 50, locaux: [{ local: 'Bureau', P: 1.2, nb: 1, type: '', H: '600' }, { local: 'Hall', P: 3, nb: 2, type: '22', H: '600' }] });
  const b = r.valeurs.locaux[0];
  proche(b.P50, 1200 / 0.727605, 0.5); assert.strictEqual(b.type, '21'); assert.strictEqual(b.L, 1400);
  proche(b.Q, 1200 / (4185 * 983.2 * 20) * 3600 * 1000, 0.3, 'débit L/h');
  proche(b.kv, b.Q / 1000 / Math.sqrt(0.1), 1e-9, 'Kv à 10 kPa');
  const h = r.valeurs.locaux[1];
  assert.strictEqual(h.nb, 2); proche(h.P50, 1500 / 0.727605, 0.5); assert.strictEqual(h.type, '22');
  assert.strictEqual(r.valeurs.nb, 3);
  // Basse température : radiateurs plus de deux fois plus grands
  const bt = N.calculer('radiateurs', { Td: 45, Tr: 35, locaux: [{ local: 'Bureau', P: 1.2 }] });
  assert.ok(bt.valeurs.F < 0.5 && bt.alertes.some(a => /Basse température/.test(a.texte)));
  assert.ok(N.calculer('radiateurs', { Td: 50, Tr: 60, locaux: [{ local: 'X', P: 1 }] }).alertes.some(a => a.niveau === 'erreur'));
});

test('plafonds rayonnants : point de rosée (Magnus), marge, air primaire et surface active', () => {
  // 26 °C / 50 % : rosée 14,77 °C ; eau 16/19 → moyenne 17,5, ΔT 8,5 K, 8 W/m²·K → 68 W/m²
  const r = N.calculer('plafonds', { Td: 16, Tr: 19, Ti: 26, HR: 50, Tsouf: 17, locaux: [{ local: 'B1', S: 20, Pfr: 1.2, Qair: 50 }] });
  proche(r.valeurs.Tros, 14.77, 0.02); proche(r.valeurs.marge, 16 - 14.77, 0.02); proche(r.valeurs.qU, 68, 1e-9);
  proche(r.valeurs.Pair, 0.34 * 50 * 9 / 1000, 1e-9, 'air primaire sensible');
  proche(r.valeurs.besoin, (1.2 - 0.153) * 1000 / 68, 1e-6, 'surface active');
  assert.ok(r.alertes.some(a => /disponibles/.test(a.texte)), '15,4 m² actifs > 70 % de 20 m²');
  assert.ok(r.alertes.some(a => a.niveau === 'attention' && /Marge/.test(a.texte)));
  const c = N.calculer('plafonds', { Td: 14, Tr: 17, Ti: 26, HR: 50 });
  assert.ok(c.alertes.some(a => a.niveau === 'erreur' && /Condensation/.test(a.texte)));
  const p = N.calculer('plafonds', { systeme: 'active', Td: 16, Tr: 19, locaux: [{ local: 'B1', S: 20, Pfr: 1.2, Qair: 50 }] });
  proche(p.valeurs.besoin, (1.2 - 0.153) * 1000 / (45 * 8.5), 1e-6, 'mètres de poutre active');
});

test('échangeur à plaques : ΔTLM, pincement, surface, débits, températures croisées', () => {
  const r = N.calculer('echangeurPlaques', { P: 100, Te1: 80, Ts1: 60, Te2: 50, Ts2: 70, encrassement: 10 });
  proche(r.valeurs.dtlm, 10, 1e-9); proche(r.valeurs.pinc, 10, 1e-9); proche(r.valeurs.A, 100000 / (4000 * 10) * 1.1, 1e-9);
  proche(r.valeurs.Q1, 100 / (990 * 4.18 * 20) * 3600, 1e-9);
  assert.ok(r.valeurs.croise && r.alertes.some(a => /croisées/.test(a.texte)));
  const s = N.calculer('echangeurPlaques', { P: 200, Te1: 80, Ts1: 60, Te2: 40, Ts2: 55 });
  proche(s.valeurs.dtlm, 5 / Math.log(25 / 20), 1e-9); proche(s.valeurs.pinc, 20, 1e-9); assert.ok(!s.valeurs.croise);
  proche(s.valeurs.eps, 200 / (Math.min(s.valeurs.Q1 * 990 * 4.18, s.valeurs.Q2 * 990 * 4.18) / 3600 * 40), 1e-9);
  // Eau glacée (primaire froid) : sens inversé géré
  const f = N.calculer('echangeurPlaques', { P: 50, Te1: 5, Ts1: 10, Te2: 13, Ts2: 8 });
  proche(f.valeurs.dtlm, 3, 1e-9);
  assert.ok(N.calculer('echangeurPlaques', { Te1: 60, Ts1: 50, Te2: 45, Ts2: 65 }).alertes.some(a => a.niveau === 'erreur'));
  assert.ok(N.calculer('echangeurPlaques', { P: 100, Te1: 80, Ts1: 60, Te2: 57, Ts2: 78.5 }).alertes.some(a => a.niveau === 'attention' && /Pincement/.test(a.texte)));
});

/* ---------- Liens à une étude fictive ---------- */
const etude = () => {
  const pieces = note('p', 'pieces', {}, 'Bilan R+1');
  const pid = note('s', 'pid', { titreInstallation: 'Chaufferie', reseau: 'ch-55-45', generateur: 'chaudiere-cond', nGen: '1', Pgen: 60, bouteille: 'echangeur', pincement: 3, generateurs: [], circuits: [
    { rep: 'PL', emetteur: 'plancher', P: 10, regime: '35/30', regulation: '3v', L: 30 }, { rep: 'RAD', emetteur: 'radiateurs', P: 15, regime: '50/40', regulation: '3v', L: 50 },
    { rep: 'PF', emetteur: 'plafond', P: 5, regime: '16/19', regulation: '3v', L: 20 }] }, 'Schéma chaufferie');
  const term = note('t', 'terminaux', { appareils: [{ rep: 'R1', local: 'Bureau 2', type: 'radiateur', Pch: 0.8, Pfr: 0, batterie: 'chaude', vanne: 'aucune' }, { rep: 'R2', local: 'Bureau 2', type: 'radiateur', Pch: 0.7, Pfr: 0, batterie: 'chaude', vanne: 'aucune' }] }, 'Terminaux');
  return { id: 'e1', climat: 'lyon', notes: [pieces, pid, term] };
};

test('plancher relié : pièces des bilans reprises (verrouillées), régime du circuit plancher du schéma', () => {
  const et = etude(), pl = note('a', 'plancher', { locaux: [{ local: 'Bureau 1', rev: 'parquet', Lc: 8 }] });
  et.notes.push(pl);
  const r = L.resoudre(et, pl), b = Pieces.besoinsEtude(et);
  assert.strictEqual(r.entrees.Td, 35); assert.strictEqual(r.entrees.dT, 5);
  assert.match(r.verrous.Td, /Schéma chaufferie \(circuit PL\)/);
  assert.strictEqual(r.entrees.locaux.length, 3, 'Bureau 1 saisi + 2 pièces reprises');
  const l0 = r.entrees.locaux[0];
  assert.strictEqual(l0.rev, 'parquet'); assert.strictEqual(l0.S, 18); proche(l0.P, b['bureau 1'].Pch, 0.006);
  assert.ok(r.verrous['locaux.0.S'] && r.verrous['locaux.0.P'] && !r.verrous['locaux.0.rev']);
  assert.ok(r.entrees.locaux[1]._auto && r.verrous['locaux.1.rev'], 'ligne reprise entièrement verrouillée');
  assert.ok(!Object.keys(r.entrees).some(k => k.startsWith('locaux.')), 'pas de clé parasite dans les entrées');
  const c = L.calculer(et, pl);
  assert.strictEqual(c.valeurs.locaux.length, 3);
  // Saisie seule : rien de repris ; circuit en saisie : régime saisi
  const s = note('b', 'plancher', { reprise: 'saisie', circuit: '', Td: 38, locaux: [{ local: 'Bureau 1', S: 10, P: 0.4 }] });
  et.notes.push(s);
  const rs = L.resoudre(et, s);
  assert.strictEqual(rs.entrees.locaux.length, 1); assert.strictEqual(rs.entrees.Td, 38); assert.ok(!rs.verrous.Td);
  // Seulement les locaux saisis
  const li = note('c', 'plancher', { reprise: 'listees', locaux: [{ local: 'Bureau 2' }] });
  et.notes.push(li);
  assert.strictEqual(L.resoudre(et, li).entrees.locaux.length, 1);
});

test('radiateurs reliés : terminaux « radiateur » (puissance et nombre), sinon pièces ; régime du circuit radiateurs', () => {
  const et = etude(), ra = note('r', 'radiateurs');
  et.notes.push(ra);
  const r = L.resoudre(et, ra);
  assert.deepStrictEqual([r.entrees.Td, r.entrees.Tr], [50, 40]);
  const b2 = r.entrees.locaux.find(l => l.local === 'Bureau 2'), b1 = r.entrees.locaux.find(l => l.local === 'Bureau 1');
  proche(b2.P, 1.5, 1e-9); assert.strictEqual(b2.nb, 2);
  proche(b1.P, Pieces.besoinsEtude(et)['bureau 1'].Pch, 0.006);
  const c = L.calculer(et, ra);
  assert.strictEqual(c.valeurs.locaux.find(l => l.local === 'Bureau 2').nb, 2);
  proche(c.valeurs.F, A.facteurRad(A.dtlmAmbiance(50, 40, 20), 1.3), 1e-9);
});

test('plafonds et échangeur reliés : régime du circuit plafond, échangeur de découplage du schéma', () => {
  const et = etude(), pf = note('f', 'plafonds'), ech = note('x', 'echangeurPlaques');
  et.notes.push(pf, ech);
  const r = L.resoudre(et, pf);
  assert.deepStrictEqual([r.entrees.Td, r.entrees.Tr], [16, 19]);
  assert.strictEqual(r.entrees.locaux.length, 3);
  assert.ok(r.entrees.locaux.every(l => l.Pfr > 0 && l.Qair > 0));
  const x = L.resoudre(et, ech), d = Schema.dimensionner(L.resoudre(et, et.notes[1]).entrees);
  assert.match(x.verrous.P, /découplage/);
  proche(x.entrees.P, d.Pdem, 0.06);
  assert.deepStrictEqual([x.entrees.Te1, x.entrees.Ts1, x.entrees.Te2, x.entrees.Ts2], [55, 45, 42, 52]);
  const c = L.calculer(et, ech);
  proche(c.valeurs.pinc, 3, 1e-9);
  // Échangeur choisi qui n'existe plus : alerte, valeurs saisies conservées
  const y = note('y', 'echangeurPlaques', { source: 'zz|dec', P: 40 });
  et.notes.push(y);
  const ry = L.resoudre(et, y);
  assert.strictEqual(ry.entrees.P, 40); assert.ok(ry.alertes.some(a => /n'existe plus/.test(a.texte)));
  // Liste des échangeurs proposés
  assert.ok(A.optEchangeurs(et).some(o => o[0] === 's|dec'));
});

test('émetteurs : étude sans autres notes, liens tolérants', () => {
  const et = { id: 'v', notes: TYPES.map((t, i) => note(`n${i}`, t)) };
  et.notes.forEach(n => { assert.doesNotThrow(() => L.calculer(et, n), n.type); assert.deepStrictEqual(L.calculer(et, n).alertes.filter(a => a.niveau === 'erreur'), [], n.type); });
});
