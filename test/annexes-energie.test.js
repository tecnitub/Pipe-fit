// Calculs annexes « Production et énergie » : conduit de fumée (NF EN 13384-1 simplifiée), PAC sur sondes géothermiques,
// solaire thermique ECS, consommation annuelle et coût global, aides CEE. Valeurs de référence calculées à la main ;
// liens à une étude fictive (climat, schémas de principe, bilans, ECS) et lignes du bilan électrique.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Terminaux = require('../etudes/public/js/terminaux');
global.Schema = require('../etudes/public/js/schema');
global.Pieces = require('../etudes/public/js/pieces');
global.Sanitaire = require('../etudes/public/js/sanitaire');
require('../etudes/public/js/cta'); require('../etudes/public/js/equilibrage'); require('../etudes/public/js/industriel'); require('../etudes/public/js/aeraulique-schema');
const E = require('../etudes/public/js/electricite');
const L = require('../etudes/public/js/liens');
const A = require('../etudes/public/js/annexes-energie');

const proche = (v, ref, tol, msg) => assert.ok(Math.abs(v - ref) <= tol, `${msg || ''} ${v} ≠ ${ref} ± ${tol}`);
const note = (id, type, entrees = {}, titre = type) => ({ id, type, titre, entrees: { ...N.defauts(type), ...entrees } });
const TYPES = ['conduitFumee', 'geothermie', 'solaireEcs', 'energieAnnuelle', 'aidesCee'];

test('énergie : types déclarés comme calculs annexes, calcul par défaut sans erreur', () => {
  TYPES.forEach(k => {
    const t = N.TYPES[k], r = N.calculer(k, {});
    assert.ok(t && t.annexe && t.famille === 'Calculs annexes' && t.theme === 'Production et énergie', k);
    assert.ok(typeof t.lier === 'function', `${k} : lier`);
    assert.ok(r.synthese && r.resume.length && r.hypotheses.length, k);
    assert.deepStrictEqual(r.alertes.filter(a => a.niveau === 'erreur'), [], k);
    r.tableaux.forEach(x => x.lignes.forEach(l => assert.strictEqual(l.length, x.entetes.length, `${k} : ${x.titre}`)));
  });
});

test('conduit de fumée : débit de fumées, tirage, pertes de charge, point de rosée', () => {
  // Gaz naturel, 30 kW utiles à 92 % → 32,61 kW ; CO₂ 9 % → λ = 11,7/9 = 1,3 ; ṁ = 32,61 × (1,3 × 1,24 + 0,072) / 3600 = 15,25 g/s
  const r = N.calculer('conduitFumee', { P: 30, rendement: 92, combustible: 'gaz', CO2: 9, Tf: 140, H: 8, Lr: 1.5, zeta: 2.5, Ta: 15, altitude: 200, conduit: 'double', mode: 'depression', PW: 5 });
  const v = r.valeurs;
  proche(v.QF, 30 / 0.92, 1e-9); proche(v.lam, 1.3, 1e-9); proche(v.m * 1000, 32.6087 * 1.684 / 3.6, 0.01);
  // Tirage PH = H g (ρ air − ρ fumées) à la température moyenne ; pression à 200 m d'altitude
  const p = A.pAtm(200), ra = p * 0.02896 / (8.314 * 288.15), rm = p * 0.0285 / (8.314 * (v.Tm + 273.15));
  proche(v.PH, 8 * 9.81 * (ra - rm), 1e-6); proche(p, 98945, 30);
  assert.ok(v.Pz >= 5 && v.ok, 'diamètre retenu : tirage net ≥ requis');
  assert.ok(v.Tm < 140 && v.Ts < v.Tm, 'les fumées se refroidissent');
  assert.ok(v.Trf > 50 && v.Trf < 60, `rosée des fumées de gaz ≈ 54 °C (${v.Trf})`);
  assert.ok(!v.humide);
  // Le plus petit diamètre conforme : le diamètre inférieur ne convient pas
  const t = r.tableaux[0].lignes, i = t.findIndex(l => l[7] === 'oui');
  assert.strictEqual(t[i][0], String(v.D)); assert.ok(i === 0 || t[i - 1][7] === 'non');
  // Plus haut → plus de tirage ; fioul : rosée plus basse
  assert.ok(N.calculer('conduitFumee', { H: 16, D: v.D }).valeurs.PH > N.calculer('conduitFumee', { H: 8, D: v.D }).valeurs.PH);
  assert.ok(N.calculer('conduitFumee', { combustible: 'fioul' }).valeurs.Trf < v.Trf);
  // Chaudière à condensation : conduit en pression, humide
  const c = N.calculer('conduitFumee', { P: 50, rendement: 97, Tf: 60, mode: 'pression', PW: 80, conduit: 'plastique' });
  assert.ok(c.valeurs.humide && c.alertes.some(a => /classe W/.test(a.texte)));
  assert.ok(c.valeurs.PR - c.valeurs.PH <= 80);
  // Diamètre imposé trop petit : erreur
  assert.ok(N.calculer('conduitFumee', { D: 60, P: 60 }).alertes.some(a => a.niveau === 'erreur'));
  assert.ok(N.calculer('conduitFumee', { config: 'collectif', nAppareils: 3 }).valeurs.m > 2.9 * v.m);
});

test('géothermie : puissance extraite, longueur et nombre de sondes, alerte au-delà de 100 m', () => {
  // 20 kW, COP 4,5 → 15,56 kW extraits ; roche courante 60 W/m à 1 800 h → 259 m → 3 sondes de 86 m
  const r = N.calculer('geothermie', { P: 20, COP: 4.5, heures: 1800, terrain: 'normal', Hmax: 100 });
  proche(r.valeurs.Pext, 20 * (1 - 1 / 4.5), 1e-9); proche(r.valeurs.L, 15555.6 / 60, 0.01); assert.strictEqual(r.valeurs.n, 3); proche(r.valeurs.H, 259.26 / 3, 0.01);
  proche(r.valeurs.Esp, 60 * 1800 / 1000, 1e-6, 'kWh/m·an = W/m × h / 1000');
  proche(A.qSpecifique('normal', 2400), 50, 1e-9); proche(A.qSpecifique('normal', 2100), 55, 1e-9);
  assert.ok(!r.alertes.some(a => /100 m/.test(a.texte)));
  const p = N.calculer('geothermie', { P: 20, Hmax: 150 });
  assert.strictEqual(p.valeurs.n, 2); assert.ok(p.alertes.some(a => /plus de 100 m/.test(a.texte)));
  // Débit du fluide : Q = P extraite / (ρ cp ΔT)
  const f = require('../etudes/public/js/calculs').liquide('mpg30', 2);
  proche(r.valeurs.Q, 15.5556 / (f.rho * f.cp / 1000 * 3) * 3600, 1e-3);
  assert.ok(N.calculer('geothermie', { espacement: 4 }).alertes.some(a => /Espacement/.test(a.texte)));
  // Bilan électrique : pompe des sondes
  const el = N.TYPES.geothermie.versElec(r.valeurs, {});
  assert.strictEqual(el.length, 1); assert.strictEqual(el[0].type, 'pompe'); assert.ok(el[0].P > 0);
});

test('solaire ECS : besoin, surface pour la couverture visée, stockage, appoint', () => {
  // 1 000 L/j à 60 °C (eau à 10 °C) : 1 000 × 365 × 1,163 × 50 = 21 225 kWh/an ; Lyon 1 300 kWh/m² × 1,12, η 0,45
  const r = N.calculer('solaireEcs', { Vj: 1000, Tc: 60, Tf: 10, site: 'lyon', orientation: 's45', capteur: 'plan', objectif: 50, ratio: 60 });
  proche(r.valeurs.Eb, 21224.75, 1e-6); proche(r.valeurs.Hp, 1456, 1e-9);
  proche(r.valeurs.S, Math.log(2) * 21224.75 / (1456 * 0.45), 1e-6); proche(r.valeurs.f, 0.5, 1e-9);
  proche(r.valeurs.V, r.valeurs.S * 60, 1e-9); proche(r.valeurs.Eapp, 21224.75 / 2, 1e-6);
  const s = N.calculer('solaireEcs', { Vj: 1000, site: 'lyon', mode: 'surface', S: 20 });
  proche(s.valeurs.f, 1 - Math.exp(-20 * 1456 * 0.45 / 21224.75), 1e-9);
  assert.ok(N.calculer('solaireEcs', { Vj: 1000, objectif: 80 }).alertes.some(a => /stagnation/.test(a.texte)));
  assert.ok(N.calculer('solaireEcs', { ratio: 90 }).alertes.some(a => /50 à 70 L/.test(a.texte)));
  assert.strictEqual(N.TYPES.solaireEcs.versElec(r.valeurs, {})[0].type, 'pompe');
});

test('consommation annuelle : DJU, consommations, CO₂, coût global actualisé', () => {
  proche(A.coutGlobal(1000, 100, 0, 2, 0, 0), 1200, 1e-9);
  proche(A.coutGlobal(1000, 100, 10, 2, 0.1, 0.05), 1000 + 110 / 1.1 + 115 / 1.21, 1e-9);
  const r = N.calculer('energieAnnuelle', { site: 'paris', DJU: '', Ti: 19, Tbase: -7, Pch: 100, intermittence: 85, Pfr: 0, Vj: 0, duree: 20, actualisation: 3, hausse: 2,
    solutions: [{ nom: 'Gaz', energie: 'gaz', rendCh: 0.95, rendEcs: 0.9, seer: '', prix: 0.1, abonnement: 0, invest: 50000, maintenance: 1000 },
      { nom: 'PAC', energie: 'elec', rendCh: 3, rendEcs: 2.5, seer: '', prix: 0.2, abonnement: 0, invest: 80000, maintenance: 1500 }] });
  const Bch = 100 * 24 * 2400 * 0.85 / 26, s = r.valeurs.solutions;
  proche(r.valeurs.Bch, Bch, 1e-6);
  proche(s[0].Cfin, Bch / 0.95, 1e-6); proche(s[1].Cfin, Bch / 3, 1e-6);
  proche(s[0].CO2, Bch / 0.95 * 0.227 / 1000, 1e-9); proche(s[1].CO2, Bch / 3 * 0.079 / 1000, 1e-9);
  proche(s[0].Eexp, Bch / 0.95 * 0.1, 1e-6);
  proche(s[0].CG, A.coutGlobal(50000, Bch / 0.95 * 0.1, 1000, 20, 0.03, 0.02), 1e-6);
  assert.strictEqual(r.valeurs.meilleure, s[0].CG < s[1].CG ? 'Gaz' : 'PAC');
  // Froid et ECS : froid électrique / SEER, ECS avec pertes
  const f = N.calculer('energieAnnuelle', { Pch: 0, Pfr: 40, heuresFroid: 500, Vj: 200, Tecs: 60, Tf: 10, pertesEcs: 30, solutions: [{ nom: 'A', energie: 'gaz', rendCh: 0.9, rendEcs: 0.8, seer: 4, prix: 0.1 }] });
  proche(f.valeurs.Bfr, 20000, 1e-9); proche(f.valeurs.Becs, 200 * 365 * 1.163 * 50 / 1000 * 1.3, 1e-6);
  proche(f.valeurs.solutions[0].Cfin, 20000 / 4 + f.valeurs.Becs / 0.8, 1e-6);
});

test('aides CEE : kWh cumac × prix, forfaits à saisir signalés', () => {
  const r = N.calculer('aidesCee', { prix: 8, bonification: '', operations: [{ fiche: 'BAT-TH-102', quantite: 100, forfait: 1000, coef: '' }, { fiche: 'BAT-TH-146', quantite: 50, forfait: '', coef: '' }] });
  proche(r.valeurs.kwh, 100000, 1e-9); proche(r.valeurs.eur, 800, 1e-9); assert.strictEqual(r.valeurs.manquants, 1);
  assert.ok(r.alertes.some(a => /Forfait à saisir pour BAT-TH-146/.test(a.texte)));
  assert.ok(r.alertes.some(a => /texte en vigueur/.test(a.texte)), 'montants à vérifier sur le texte en vigueur');
  proche(N.calculer('aidesCee', { prix: 8, bonification: 2, operations: [{ fiche: 'BAT-TH-102', quantite: 100, forfait: 1000, coef: 1.5 }] }).valeurs.eur, 2400, 1e-9);
  assert.ok(N.calculer('aidesCee', {}).alertes.some(a => /Prix du MWh cumac à saisir/.test(a.texte)));
});

/* ---------- Liens à une étude fictive ---------- */
const etude = () => ({ id: 'e2', climat: 'lyon', notes: [
  note('p', 'pieces', {}, 'Bilan'),
  note('c', 'pid', { titreInstallation: 'Chaufferie', reseau: 'ch-70-50', generateur: 'chaudiere-cond', nGen: '2', Pgen: 150, bouteille: 'oui', generateurs: [] }, 'Chaufferie gaz'),
  note('g', 'pid', { titreInstallation: 'Géothermie', reseau: 'ch-45-35', generateur: 'pac-eau', nGen: '1', Pgen: 30, bouteille: 'oui', generateurs: [], circuits: [{ rep: 'PL', emetteur: 'plancher', P: 25, regime: '', regulation: '3v', L: 30 }] }, 'PAC eau/eau'),
  note('w', 'ecs', { usage: 'douche', n: 40 }, 'ECS vestiaires'),
  note('t', 'terminaux', { appareils: [{ rep: 'R1', local: 'Bureau 1', type: 'radiateur', Pch: 1, batterie: 'chaude', vanne: 'aucune' }, { rep: 'R2', local: 'Bureau 2', type: 'radiateur', Pch: 1, batterie: 'chaude', vanne: 'aucune' }] }, 'Terminaux'),
] });

test('conduit de fumée et géothermie reliés aux générateurs des schémas de principe', () => {
  const et = etude(), cf = note('a', 'conduitFumee'), ge = note('b', 'geothermie');
  et.notes.push(cf, ge);
  const r = L.resoudre(et, cf);
  assert.deepStrictEqual([r.entrees.P, r.entrees.combustible, r.entrees.rendement, r.entrees.Tf, r.entrees.mode, r.entrees.nAppareils], [150, 'gaz', 97, 60, 'pression', 2]);
  assert.match(r.verrous.P, /Chaufferie gaz/);
  assert.ok(L.calculer(et, cf).valeurs.humide, 'chaudière à condensation : conduit humide');
  const g = L.resoudre(et, ge);
  assert.strictEqual(g.entrees.P, 30); assert.match(g.verrous.P, /PAC eau\/eau/);
  // Sans PAC eau/eau : besoins des bilans pièce par pièce
  const et2 = { id: 'e3', notes: [note('p', 'pieces', {}, 'Bilan'), note('b', 'geothermie')] };
  proche(L.resoudre(et2, et2.notes[1]).entrees.P, Object.values(Pieces.besoinsEtude(et2)).reduce((a, p) => a + p.Pch, 0), 0.06);
  // Saisie : rien d'imposé
  const s = note('s', 'geothermie', { source: '', P: 12 }); et.notes.push(s);
  assert.strictEqual(L.resoudre(et, s).entrees.P, 12);
  // Bilan électrique de l'étude : pompe des sondes reprise
  const eq = E.equipementsEtude(et, L);
  assert.ok(eq.some(x => x.designation === 'Pompe des sondes géothermiques' && x.type === 'pompe' && x.P > 0), JSON.stringify(eq.map(x => x.designation)));
});

test('solaire, énergie annuelle et CEE reliés : climat, ECS, puissances, quantités', () => {
  const et = etude(), so = note('s', 'solaireEcs'), en = note('e', 'energieAnnuelle'), ce = note('k', 'aidesCee', { operations: [{ fiche: 'BAT-TH-102', quantite: '', forfait: '' }, { fiche: 'BAT-TH-104', quantite: '', forfait: '' }, { fiche: 'BAT-TH-113', quantite: 7, forfait: '' }] });
  et.notes.push(so, en, ce);
  const r = L.resoudre(et, so);
  assert.strictEqual(r.entrees.site, 'lyon'); assert.match(r.verrous.site, /climat de l'étude/);
  assert.strictEqual(r.entrees.Vj, 1000); assert.match(r.verrous.Vj, /ECS vestiaires/);
  assert.strictEqual(r.entrees.Pappoint, 40);
  const e = L.resoudre(et, en);
  assert.strictEqual(e.entrees.site, 'lyon'); assert.strictEqual(e.entrees.Tbase, -10);
  const dem = ['c', 'g'].map(id => Schema.dimensionner(L.resoudre(et, et.notes.find(n => n.id === id)).entrees).Pdem).reduce((a, x) => a + x, 0);
  proche(e.entrees.Pch, dem, 0.06, 'demande des circuits des deux schémas'); assert.match(e.verrous.Pch, /Chaufferie gaz, N3 — PAC eau\/eau/);
  assert.strictEqual(e.entrees.Vj, 1000);
  const c = L.resoudre(et, ce);
  assert.strictEqual(c.entrees.zone, 'H1');
  assert.strictEqual(c.entrees.operations[0].quantite, 300); assert.ok(c.verrous['operations.0.quantite']);
  assert.strictEqual(c.entrees.operations[1].quantite, 2, 'robinets : radiateurs des terminaux');
  assert.strictEqual(c.entrees.operations[2].quantite, 7, 'quantité saisie conservée');
  assert.ok(!Object.keys(c.entrees).some(k => k.startsWith('operations.')));
  // Sanitaire seul : besoin d'ECS repris du réseau sanitaire
  const et2 = { id: 'e4', notes: [note('n', 'sanitaire', {}, 'Sanitaire'), note('s', 'solaireEcs')] }, v = N.calculer('sanitaire', L.resoudre(et2, et2.notes[0]).entrees).valeurs.besoinECS;
  if (v && v.Vj > 0) assert.strictEqual(L.resoudre(et2, et2.notes[1]).entrees.Vj, Math.round(v.Vj));
});

test('énergie : étude sans autres notes, liens tolérants', () => {
  const et = { id: 'v', climat: 'nice', notes: TYPES.map((t, i) => note(`n${i}`, t)) };
  et.notes.forEach(n => { assert.doesNotThrow(() => L.calculer(et, n), n.type); assert.deepStrictEqual(L.calculer(et, n).alertes.filter(a => a.niveau === 'erreur'), [], n.type); });
  assert.strictEqual(L.resoudre(et, et.notes[4]).entrees.zone, 'H3');
});
