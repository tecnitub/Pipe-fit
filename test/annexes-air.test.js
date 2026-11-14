// Calculs annexes « Ventilation et traitement d'air » : air neuf réglementaire, hotte (VDI 2052), parking, piscine,
// confort (ISO 7730) et jets, puits canadien. Références calculées à la main, PMV de l'ISO 7730 annexe D ; liens avec une étude fictive.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Cta = require('../etudes/public/js/cta');
global.Terminaux = require('../etudes/public/js/terminaux');
global.Pieces = require('../etudes/public/js/pieces');
const A = require('../etudes/public/js/annexes-air');
const L = require('../etudes/public/js/liens');
const E = require('../etudes/public/js/electricite');

const proche = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (± ${tol})`);
const note = (id, type, entrees = {}, titre = type) => ({ id, type, titre, entrees: { ...N.defauts(type), ...entrees } });
const TYPES = ['airNeuf', 'hotte', 'parking', 'piscine', 'confort', 'puitsCanadien'];

test('types déclarés dans le thème « Ventilation et traitement d\'air » (calculs annexes)', () => {
  TYPES.forEach(k => {
    const t = N.TYPES[k];
    assert.ok(t && t.annexe === true && t.famille === 'Calculs annexes' && t.theme === 'Ventilation et traitement d\'air', k);
    const r = N.calculer(k, N.defauts(k));
    assert.ok(r.synthese && Array.isArray(r.resume) && !r.alertes.some(a => /Calcul impossible/.test(a.texte)), k);
  });
});

test('air neuf : code du travail, RSDT, pollution spécifique, logements (arrêté de 1982)', () => {
  assert.strictEqual(A.debitLocal({ usage: 'bureau', occ: 4 }).souffle, 100); // max(25 CT, 18 RSDT) × 4
  assert.strictEqual(A.debitLocal({ usage: 'bureau', occ: 4, regle: 'rsdt' }).souffle, 72);
  assert.strictEqual(A.debitLocal({ usage: 'restauration', occ: 10, regle: 'ct' }).souffle, 300);
  assert.strictEqual(A.debitLocal({ usage: 'atelierLeger', occ: 2 }).souffle, 90);
  assert.strictEqual(A.debitLocal({ usage: 'atelier', occ: 2 }).souffle, 120);
  assert.strictEqual(A.debitLocal({ usage: 'classe1', occ: 30 }).souffle, 450);
  assert.strictEqual(A.debitLocal({ usage: 'vente', occ: 10, regle: 'rsdt' }).souffle, 220);
  assert.strictEqual(A.debitLocal({ usage: 'bureau', S: 50 }).occ, 5); // densité indicative 0,1 occ/m²
  assert.strictEqual(A.debitLocal({ usage: 'wc', N: 1 }).extrait, 30);
  assert.strictEqual(A.debitLocal({ usage: 'wc', N: 3 }).extrait, 75); // 30 + 15 × 3
  const t3 = A.debitLocal({ usage: 'logement', N: 3 });
  assert.strictEqual(t3.extrait, 150); assert.strictEqual(t3.Qmin, 75); // cuisine 105 + SdB 30 + WC 15, total minimal 75
  assert.strictEqual(A.debitLocal({ usage: 'logement', N: 5 }).extrait, 195); // 135 + 30 + 30
  assert.ok(A.debitLocal({ usage: 'classe1', occ: 30, regle: 'ct' }).sansRegle);
  // Comparaison aux CTA : 4 × 25 + 10 × 30 = 400 m³/h pour 300 m³/h soufflés
  const r = N.calculer('airNeuf', { _ctas: [{ id: 'c', lib: 'CTA 1', Qs: 300 }], locaux: [{ nom: 'B1', usage: 'bureau', occ: 4, cta: 'c' }, { nom: 'R1', usage: 'reunion', occ: 10, cta: 'c' }, { nom: 'WC', usage: 'wc', N: 2 }] });
  assert.strictEqual(r.valeurs.Qs, 400); assert.strictEqual(r.valeurs.Qe, 60);
  assert.ok(r.alertes.some(a => a.niveau === 'erreur' && /CTA 1 : 300 m³\/h soufflés pour 400/.test(a.texte)));
  assert.ok(!N.calculer('airNeuf', { _ctas: [{ id: 'c', lib: 'CTA 1', Qs: 450 }], locaux: [{ nom: 'B1', usage: 'bureau', occ: 4 }] }).alertes.some(a => a.niveau === 'erreur'));
});

test('hotte : panache VDI 2052, compensation, filtres, ventilateurs', () => {
  // Q_conv 2 000 W, z 1,1 m, plan 0,8 × 0,7 m (d_h 0,7467 m), contre un mur (r 0,63) :
  // 18 × 2000^(1/3) × (1,1 + 1,7 × 0,7467)^(5/3) × 0,63 = 18 × 12,599 × 4,2108 × 0,63 = 601,6 m³/h
  proche(A.vdi2052(2000, 1.1, 0.8, 0.7, 0.63), 601.6, 0.5);
  // Fourneau 20 kW × 0,5 × 300 W/kW = 3 000 W de chaleur convective
  const e = { position: 'mur', z: 1.1, majoration: 20, appareils: [{ nom: 'F', type: 'fourneau', P: 20, a: 0.8, b: 0.7 }], compensation: 90, lf: 0.5, hf: 0.5, nFiltres: 2 };
  const r = N.calculer('hotte', e), V = A.vdi2052(3000, 1.1, 0.8, 0.7, 0.63);
  proche(r.valeurs.Vth, V, 1e-6);
  assert.strictEqual(r.valeurs.Q, Math.ceil(V * 1.2 / 10) * 10);
  proche(r.valeurs.Qc, r.valeurs.Q * 0.9, 1e-6);
  proche(r.valeurs.vF, r.valeurs.Q / 3600 / 0.5, 1e-6); // 2 filtres de 0,25 m²
  proche(r.valeurs.PeE, r.valeurs.Q / 3600 * 500 / 0.5 / 1000, 1e-6);
  assert.ok(N.calculer('hotte', { ...e, compensation: 70 }).alertes.some(a => a.niveau === 'erreur' && /compensation/.test(a.texte)));
  const el = N.TYPES.hotte.versElec(r.valeurs, e);
  assert.deepStrictEqual(el.map(x => x.type), ['ventilateur', 'ventilateur']);
  assert.strictEqual(N.TYPES.hotte.versElec(N.calculer('hotte', { ...e, compType: 'transfert' }).valeurs, e).length, 1);
});

test('parking : débits par véhicule, deux vitesses, extracteurs et détection', () => {
  const r = N.calculer('parking', { places: 100, niveaux: 1, qPlace: 600, pv: 50, nExt: 2, dp: 300, eta: 0.5, sPlace: 25, sDet: 400 }), v = r.valeurs;
  assert.strictEqual(v.QGV, 60000); assert.strictEqual(v.QPV, 30000); assert.strictEqual(v.Qext, 30000);
  proche(v.Pext, 5); // 30 000 / 3 600 × 300 / 0,5 = 5 000 W
  proche(v.PPV, 10 * 0.125); // puissance ∝ débit³
  assert.strictEqual(v.nDet, 7); // 2 500 m² / 400 m²
  const el = N.TYPES.parking.versElec(N.calculer('parking', { places: 200, niveaux: 2, nExt: 2 }).valeurs, { repExt: 'EXT' });
  assert.deepStrictEqual(el.map(x => x.rep), ['EXT-N1-1', 'EXT-N1-2', 'EXT-N2-1', 'EXT-N2-2', 'EXT-DET']);
  assert.ok(N.calculer('parking', { places: 100, nExt: 1 }).alertes.some(a => /Un seul extracteur/.test(a.texte)));
});

test('piscine : évaporation VDI 2089 et Bernier, air de déshumidification', () => {
  // VDI 2089 : β 28 m/h, eau 28 °C (p_sat 3 773,8 Pa), air 30 °C / 60 % (p_v 2 542,0 Pa), T moyenne 302,15 K :
  // 28 / (461,5 × 302,15) × 1 231,8 × 100 m² = 24,73 kg/h
  const e = { S: 100, Tw: 28, Ta: 30, HR: 60, N: 20, usage: 'public' };
  proche(A.evaporation(e).m, 24.73, 0.05);
  // Bernier : 100 × (16 + 133 × 0,2) × (0,024063 − 0,6 × 0,027143) + 0,1 × 20 = 35,13 kg/h
  proche(A.evaporation({ ...e, methode: 'bernier' }).m, 35.13, 0.1);
  const r = N.calculer('piscine', { ...e, TeE: 28, HReE: 40, TeH: -5 }), v = r.valeurs;
  proche(v.Plat, v.m * 2450 / 3600, 1e-9);
  const xi = A.xDe(30, 60), xe = A.xDe(28, 40);
  proche(v.QdilE, v.m / (1.293 * 273.15 / 303.15 * (xi - xe)), 1e-6);
  assert.strictEqual(v.Qhyg, 440); // 22 m³/h × 20 baigneurs
  // Air extérieur plus humide que le hall : déshumidification thermodynamique
  assert.ok(N.calculer('piscine', { ...e, TeE: 32, HReE: 70 }).alertes.some(a => /thermodynamique/.test(a.texte)));
  assert.ok(N.calculer('piscine', { ...e, Ta: 26 }).alertes.some(a => a.niveau === 'erreur'));
});

test('confort : PMV / PPD de l\'ISO 7730 (annexe D), opérative, courants d\'air, jet', () => {
  // ISO 7730 tableau D.1 : ta = tr = 22 °C, vr 0,1 m/s, HR 60 %, 1,2 met, 0,5 clo → PMV −0,75, PPD 17 %
  const a = A.pmvPpd(22, 22, 0.1, 60, 1.2, 0.5);
  proche(a.pmv, -0.75, 0.01); proche(a.ppd, 17, 0.5);
  // ta = tr = 27 °C, mêmes conditions → PMV 0,77, PPD 17 %
  const b = A.pmvPpd(27, 27, 0.1, 60, 1.2, 0.5);
  proche(b.pmv, 0.77, 0.01); proche(b.ppd, 17, 0.5);
  // ta 23,5 °C, tr 25,5 °C → PMV −0,01, PPD 5 %
  proche(A.pmvPpd(23.5, 25.5, 0.1, 60, 1.2, 0.5).pmv, -0.01, 0.01);
  proche(A.operative(22, 26, 0.1), 24); proche(A.operative(22, 26, 0.3), 23.6);
  // DR = (34 − 23)(0,2 − 0,05)^0,62 (0,37 × 0,2 × 40 + 3,14) = 20,7 %
  proche(A.draught(23, 0.2, 40), 20.7, 0.1);
  assert.strictEqual(A.categorie(0.1, 5.2, 8), 'A'); assert.strictEqual(A.categorie(-0.4, 8, 15), 'B'); assert.strictEqual(A.categorie(0.9, 22, 10), 'hors catégorie');
  // Jet : K 1,4, A 0,03 m², 150 m³/h : v(2 m) = 1,4 × 0,04167 / (0,1732 × 2) = 0,168 m/s ; portée à 0,25 m/s = 1,347 m
  const j = A.jet({ K: 1.4, A: 0.03, q: 150, dT: -8, x: 2, vt: 0.25 });
  proche(j.vx, 0.1684, 0.001); proche(j.portee, 1.347, 0.002); assert.ok(j.chute > 0);
  assert.strictEqual(A.jet({ K: 1.4, A: 0.03, q: 150, dT: 0, x: 2, vt: 0.25 }).chute, 0);
});

test('puits canadien : sol amorti, efficacité NUT, gains et pertes de charge', () => {
  // d = √(2a/ω) = √(2 × 0,6e-6 / 1,9924e-7) = 2,454 m ; à 2 m : e^(−2/2,454) = 0,4427
  const am = A.amortissement(2, 0.6e-6);
  proche(am.d, 2.454, 0.002); proche(am.f, 0.4427, 0.001);
  const r = N.calculer('puitsCanadien', { Q: 1000, nTubes: 3, L: 40, D: 0.2, z: 2, Tm: 12, As: 9, TeH: -7, TeE: 32, HReE: 40 }), v = r.valeurs;
  proche(v.v, 1000 / 3 / 3600 / (Math.PI * 0.01), 1e-9); proche(v.Re, v.v * 0.2 / 1.5e-5, 1e-6);
  proche(v.TsH, 12 - 9 * 0.4427, 0.01); proche(v.TsE, 12 + 9 * 0.4427, 0.01);
  proche(v.eff, 1 - Math.exp(-v.NUT), 1e-12);
  proche(v.ToH, -7 + v.eff * (v.TsH + 7), 1e-9);
  proche(v.gainH, 1.2 * 1000 / 3600 * 1.006 * (v.ToH + 7), 1e-9);
  assert.ok(v.eff > 0.3 && v.eff < 1 && v.dP > 50);
  // Plus long : meilleure efficacité ; condensation d'été signalée quand la paroi est sous le point de rosée
  assert.ok(N.calculer('puitsCanadien', { Q: 1000, nTubes: 3, L: 80, D: 0.2, z: 2 }).valeurs.eff > v.eff);
  assert.strictEqual(v.cond, A.rosee(32, 40) > v.TsE);
});

test('lier : locaux repris des pièces, CTA de l\'étude, bouche, climat, bilan électrique', () => {
  const et = { climat: 'lyon', notes: [note('p', 'pieces'), note('c', 'cta', { Qs: 500 }), note('b', 'bouches'),
    note('a', 'airNeuf', { locaux: [{ nom: 'Salle de réunion', occ: 20 }] }), note('co', 'confort'), note('co2', 'confort', { bouche: 'b|2' }), note('pc', 'puitsCanadien'), note('pi', 'piscine'), note('pk', 'parking')] };
  const get = id => et.notes.find(n => n.id === id);
  // Air neuf : Bureau 1, Bureau 2 repris (verrouillés) ; salle de réunion saisie (20 occupants) complétée par la pièce (usage, surface)
  const ra = L.resoudre(et, get('a'));
  assert.deepStrictEqual(ra.entrees.locaux.map(l => l.nom), ['Salle de réunion', 'Bureau 1', 'Bureau 2']);
  assert.strictEqual(ra.entrees.locaux[0].usage, 'reunion'); assert.strictEqual(ra.entrees.locaux[0].occ, 20);
  assert.ok(ra.verrous['locaux.1.nom'] && !ra.verrous['locaux.0.nom']);
  const va = L.calculer(et, get('a'));
  // 20 × 30 + 1,8 × 25 + 1,5 × 25 = 682,5 m³/h pour 500 m³/h soufflés par la CTA
  proche(va.valeurs.Qs, 682.5);
  assert.ok(va.alertes.some(a => a.niveau === 'erreur' && /500 m³\/h soufflés pour 683/.test(a.texte)));
  // Confort : première bouche de soufflage proposée ; bouche choisie imposée (salle de réunion : 600 m³/h sur 2 bouches)
  const rc = L.resoudre(et, get('co'));
  assert.strictEqual(rc.entrees.q, 120); assert.strictEqual(rc.entrees.K, 1.4); assert.match(rc.entrees._repris.q, /Bureau 1/);
  const rc2 = L.resoudre(et, get('co2'));
  assert.strictEqual(rc2.entrees.q, 300); assert.match(rc2.verrous.q, /Salle de réunion/);
  // Puits canadien et piscine : climat de Lyon (−10 / 33 °C, 40 %), débit de la CTA
  const rp = L.resoudre(et, get('pc')).entrees;
  assert.deepStrictEqual([rp.TeH, rp.TeE, rp.HReE, rp.Tm, rp.Q], [-10, 33, 40, 12.5, 500]);
  const rpi = L.resoudre(et, get('pi'));
  assert.deepStrictEqual([rpi.entrees.TeE, rpi.entrees.TeH], [33, -10]); assert.ok(rpi.verrous.TeE);
  // Bilan électrique : extracteurs du parking et centrale de la piscine
  const eqs = E.equipementsEtude(et, L);
  assert.ok(eqs.some(x => x.rep === 'EXT-PK-1' && x.type === 'ventilateur' && x.P > 0));
  assert.ok(eqs.some(x => x.rep === 'CTA-PISC'));
});

test('choix reliés à l\'étude conservés quand le calcul est fait sans l\'étude (CTA par défaut, bouche)', () => {
  const r = N.calculer('airNeuf', { ctaDefaut: 'c', _ctas: [{ id: 'c', lib: 'CTA 1', Qs: 100 }], locaux: [{ nom: 'B1', usage: 'bureau', occ: 4 }, { nom: 'B2', usage: 'bureau', occ: 4 }] });
  assert.strictEqual(r.valeurs.ctas[0].id, 'c'); assert.strictEqual(r.valeurs.ctas[0].besoin, 200);
  assert.deepStrictEqual(N.TYPES.confort.champs.find(c => c.k === 'bouche').o({ bouche: 'x|1' }).map(o => o[0]), ['', 'x|1']);
});
