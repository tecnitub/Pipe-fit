// Calculs annexes « Froid et climatisation » : DRV / VRF, fluides frigorigènes (F-gaz, EN 378), chambre froide.
// Références calculées à la main ; liens avec une étude fictive (terminaux, pièces, climat) ; lignes du bilan électrique.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta');
global.Terminaux = require('../etudes/public/js/terminaux');
global.Pieces = require('../etudes/public/js/pieces');
const F = require('../etudes/public/js/annexes-froid');
const L = require('../etudes/public/js/liens');
const E = require('../etudes/public/js/electricite');

const proche = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (± ${tol})`);
const note = (id, type, entrees = {}, titre = type) => ({ id, type, titre, entrees: { ...N.defauts(type), ...entrees } });

test('types déclarés dans le thème « Froid et climatisation » (calculs annexes)', () => {
  ['drv', 'fluides', 'chambreFroide'].forEach(k => {
    const t = N.TYPES[k];
    assert.ok(t && t.annexe === true && t.famille === 'Calculs annexes' && t.theme === 'Froid et climatisation', k);
    assert.ok(typeof t.calcul === 'function' && typeof t.lier === 'function', k);
    const r = N.calculer(k, N.defauts(k));
    assert.ok(r.synthese && Array.isArray(r.resume) && Array.isArray(r.alertes) && !r.alertes.some(a => /Calcul impossible/.test(a.texte)), k);
  });
});

test('fluides : PRP AR4 / AR5, tCO₂e et périodicité des contrôles F-gaz', () => {
  assert.deepStrictEqual([F.FLUIDES.R32[1], F.FLUIDES.R32[2], F.FLUIDES.R410A[1], F.FLUIDES.R410A[2]], [675, 677, 2088, 1924]);
  const f = F.FLUIDES.R410A;
  assert.strictEqual(F.controleFgaz(4.9, f).mois, 0);
  assert.strictEqual(F.controleFgaz(20.88, f).mois, 12);
  assert.strictEqual(F.controleFgaz(20.88, f, { detection: true }).mois, 24);
  assert.strictEqual(F.controleFgaz(60, f).mois, 6);
  assert.strictEqual(F.controleFgaz(60, f, { detection: true }).mois, 12);
  const g = F.controleFgaz(600, f);
  assert.strictEqual(g.mois, 3); assert.strictEqual(g.detObl, true);
  assert.strictEqual(F.controleFgaz(8, f, { hermetique: true }).mois, 0);
  assert.match(F.controleFgaz(100, F.FLUIDES.R744).texte, /Hors règlement F-gaz/);
  // 10 kg de R410A : 10 × 2088 / 1000 = 20,88 tCO₂e ; en AR5 : 19,24
  const r = N.calculer('fluides', { equipements: [{ rep: 'PAC1', fluide: 'R410A', charge: 10 }] });
  proche(r.valeurs.tCO2e, 20.88);
  proche(N.calculer('fluides', { refPrp: 'AR5', equipements: [{ rep: 'PAC1', fluide: 'R410A', charge: 10 }] }).valeurs.tCO2e, 19.24);
  assert.strictEqual(r.valeurs.equipements[0].mois, 12);
  // 250 kg de R404A = 980 tCO₂e : détection obligatoire
  const d = N.calculer('fluides', { equipements: [{ rep: 'CF', fluide: 'R404A', charge: 250, detection: 'non' }] });
  assert.ok(d.alertes.some(a => a.niveau === 'erreur' && /détection de fuite obligatoire/.test(a.texte)));
});

test('fluides : limite de charge par local EN 378 (limite pratique × volume, formule A2L)', () => {
  // R32, local 20 m² × 2,5 m, unité murale : PL × V = 0,061 × 50 = 3,05 kg ; 2,5 × 0,307^1,25 × 1,8 × √20 = 4,60 kg
  const c = F.chargeMaxLocal(F.FLUIDES.R32, 20, 2.5, 'mur');
  proche(c.mPL, 3.05); proche(c.mConf, 4.60, 0.01); proche(c.mMax, 3.05);
  const ok = N.calculer('fluides', { equipements: [{ rep: 'S1', fluide: 'R32', charge: 2.9, S: 20, H: 2.5, pos: 'mur' }] });
  assert.ok(ok.alertes.some(a => a.niveau === 'ok' && /sous la limite/.test(a.texte)));
  const ko = N.calculer('fluides', { equipements: [{ rep: 'S1', fluide: 'R32', charge: 3.2, S: 20, H: 2.5, pos: 'mur' }] });
  assert.ok(ko.alertes.some(a => a.niveau === 'erreur' && /S1 : 3,2 kg/.test(a.texte)));
  // Sans local : alerte pour un fluide inflammable
  assert.ok(N.calculer('fluides', { equipements: [{ rep: 'S1', fluide: 'R290', charge: 0.3 }] }).alertes.some(a => /A3/.test(a.texte)));
});

test('DRV : taux de connexion, longueurs et dénivelés contrôlés, charge complémentaire', () => {
  // Ligne liquide 9,52 × 0,8 mm : d_i = 7,92 mm, section 4,9265e-5 m² × 1 062 kg/m³ = 52,3 g/m
  proche(F.gParM('9.52', 1062), 52.32, 0.05);
  const e = { PfrUE: 28, chargeUsine: 10, fluide: 'R410A', dHui: 10, uis: [{ rep: 'A', Pfr: 10, n: 2, L: 60, H: -5 }, { rep: 'B', Pfr: 14, L: 80, H: 10 }], liquide: [{ d: '9.52', L: 50 }] };
  const r = N.calculer('drv', e), v = r.valeurs;
  proche(v.Pui, 34); proche(v.tc, 121.43); assert.strictEqual(v.nUI, 3);
  proche(v.Lloin, 80); proche(v.Leq, 86.5); // 80 + 10 coudes × 0,5 + 3 raccords × 0,5
  proche(v.dHui, 15);
  proche(v.chargeComp, 2.616, 0.003); proche(v.chargeTot, 12.616, 0.003); proche(v.tCO2e, 12.616 * 2.088, 0.01);
  assert.ok(r.alertes.some(a => a.niveau === 'ok' && /Taux de connexion 121 %/.test(a.texte)));
  assert.ok(r.alertes.some(a => a.niveau === 'erreur' && /Dénivelé entre unités intérieures/.test(a.texte)), 'ΔH UI/UI 15 m > 10 m admis');
  assert.ok(!r.alertes.some(a => a.niveau === 'erreur' && /Longueur réelle/.test(a.texte)));
  // Hors plage : 40 kW intérieurs sur 28 kW = 143 %
  const h = N.calculer('drv', { ...e, uis: [{ rep: 'A', Pfr: 20, n: 2 }] });
  assert.ok(h.alertes.some(a => a.niveau === 'erreur' && /143 %.*hors de la plage/.test(a.texte)));
  // Limite de longueur saisissable
  assert.ok(N.calculer('drv', { ...e, LmaxReel: 70 }).alertes.some(a => a.niveau === 'erreur' && /Longueur réelle de l'UI la plus éloignée \(B\)/.test(a.texte)));
  // g/m de la notice prioritaire
  proche(N.calculer('drv', { ...e, liquide: [{ d: '9.52', L: 50, gpm: 60 }] }).valeurs.chargeComp, 3);
  // Diamètres indicatifs
  assert.deepStrictEqual(F.DIAM_PRINC.find(([p]) => 28 <= p).slice(1), ['9,52', '22,22']);
});

test('chambre froide : parois, denrées (refroidissement, congélation), évaporateur et groupe', () => {
  // Table de renouvellement d'air (ASHRAE) et chaleur des personnes (272 − 6 T)
  proche(F.renouvellement(28.3, false), 17.5); proche(F.renouvellement(28.3, true), 13.5);
  assert.strictEqual(F.chaleurPersonne(-20), 392);
  // Parois 5 × 4 × 3 m à 0 °C : murs 54 m² × 0,25 × 30 = 405 W, plafond 20 × 0,25 × 30 = 150 W, sol 20 × 0,3 × 10 = 60 W → 615 W
  const base = { Ti: 0, L: 5, l: 4, H: 3, Tamb: 30, Upan: 0.25, Tplaf: 30, Usol: 0.3, Tsol: 10, denrees: [] };
  const r = N.calculer('chambreFroide', base);
  proche(r.valeurs.Wparois, 615);
  // 1 000 kg/j de viande de 10 à 0 °C : 3,2 × 10 = 32 kJ/kg → 8,889 kWh/j
  proche(N.calculer('chambreFroide', { ...base, denrees: [{ produit: 'viande', m: 1000, Te: 10, Tf: 0 }] }).valeurs.Eden, 8.889, 0.002);
  // Congélation de 100 kg de 5 à −18 °C : 3,2 × 6,7 + 230 + 1,7 × 16,3 = 279,15 kJ/kg → 7,754 kWh/j
  const c = N.calculer('chambreFroide', { ...base, Ti: -20, denrees: [{ produit: 'viande', m: 100, Te: 5, Tf: -18 }] });
  proche(c.valeurs.Eden, 7.754, 0.002);
  // Évaporateur = besoin journalier / temps de fonctionnement (16 h positive, 18 h négative)
  assert.strictEqual(r.valeurs.tFonct, 16); assert.strictEqual(c.valeurs.tFonct, 18);
  proche(r.valeurs.Pevap * 16, r.valeurs.Etot, 1e-9);
  assert.ok(c.alertes.some(a => /dégivrage à saisir/.test(a.texte)));
  // Bilan électrique : groupe, ventilateurs, dégivrage
  const el = N.TYPES.chambreFroide.versElec(N.calculer('chambreFroide', { ...base, Pdeg: 2, Pvent: 0.2 }).valeurs, { tension: 'tri' });
  assert.deepStrictEqual(el.map(x => x.type), ['pac', 'ventilateur', 'resistance']);
  assert.ok(el.every(x => x.P > 0 && x.rep && x.designation));
});

test('lier : DRV repris des terminaux à détente directe, plus petit local des pièces, fluides repris, climat de l\'étude', () => {
  const et = { climat: 'lyon', notes: [
    note('p', 'pieces'),
    note('t', 'terminaux', { appareils: [{ rep: 'SP1', local: 'Bureau 1', type: 'split', batterie: 'aucune', Pfr: 2.5, Pch: 3.2 }, { rep: 'K2', local: 'Salle de réunion', type: 'cassette4', batterie: 'aucune', Pfr: 7.1, Pch: 8, n: 2 },
      { rep: 'VC3', local: 'Bureau 2', type: 'vc2', batterie: '2t', Pfr: 2, Pch: 2 }] }),
    note('d', 'drv', { uis: [{ rep: 'SP1', L: 45, H: 3 }], chargeUsine: 9 }),
    note('f', 'fluides'), note('cf', 'chambreFroide', { charge: 6 }),
  ] };
  const nd = et.notes.find(n => n.id === 'd'), rd = L.resoudre(et, nd);
  // SP1 saisi (longueur, altitude) complété par le terminal ; K2 repris et verrouillé ; VC3 (eau) ignoré
  assert.deepStrictEqual(rd.entrees.uis.map(u => u.rep), ['SP1', 'K2']);
  assert.strictEqual(rd.entrees.uis[0].Pfr, 2.5); assert.strictEqual(rd.entrees.uis[0].L, 45);
  assert.strictEqual(rd.entrees.uis[1]._auto, 'N2 — terminaux'); assert.strictEqual(rd.verrous['uis.1.Pfr'], 'N2 — terminaux');
  assert.strictEqual(rd.entrees['uis.1.Pfr'], undefined, 'pas de clé parasite dans les entrées');
  assert.strictEqual(nd.entrees.uis.length, 1, 'la saisie n\'est pas modifiée');
  const vd = L.calculer(et, nd).valeurs;
  proche(vd.Pui, 2.5 + 2 * 7.1); proche(vd.Smin, 18); // Bureau 1 : 18 m² (pièce la plus petite desservie)
  assert.match(rd.entrees._repris.Smin, /Bureau 1/);
  // Saisies seulement : aucune reprise
  assert.strictEqual(L.resoudre(et, { ...nd, entrees: { ...nd.entrees, reprise: 'saisie' } }).entrees.uis.length, 1);
  // Fluides : charges reprises du DRV et de la chambre froide
  const rf = L.calculer(et, et.notes.find(n => n.id === 'f'));
  assert.deepStrictEqual(rf.valeurs.equipements.map(x => x.rep), ['UE1', 'GF-CF']);
  proche(rf.valeurs.equipements[0].charge, Math.round(vd.chargeTot * 100) / 100);
  proche(rf.valeurs.equipements[1].tCO2e, 6 * 1397 / 1000);
  // Chambre froide : air au condenseur proposé d'après l'été du climat (Lyon 33 °C)
  assert.strictEqual(L.resoudre(et, et.notes.find(n => n.id === 'cf')).entrees.Tcond, 33);
  // Bilan électrique de l'étude : unité extérieure et groupe repris
  const eqs = E.equipementsEtude(et, L);
  assert.ok(eqs.some(x => x.rep === 'UE1' && x.type === 'split' && x.P > 0));
  assert.ok(eqs.some(x => x.rep === 'GF-CF' && x.type === 'pac'));
});
