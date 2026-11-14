// Calculs annexes — Plomberie : eaux pluviales, récupération des eaux de pluie, anti-légionelle et bouclage d'ECS
// (références calculées à la main, liens avec une étude fictive : sanitaire, production d'ECS, eaux pluviales).
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/industriel');
global.Terminaux = require('../etudes/public/js/terminaux');
global.Schema = require('../etudes/public/js/schema');
global.Sanitaire = require('../etudes/public/js/sanitaire');
global.Evacuation = require('../etudes/public/js/evacuation');
const A = require('../etudes/public/js/annexes-plomberie');
const L = require('../etudes/public/js/liens');
const E = require('../etudes/public/js/electricite');

const proche = (a, b, tol = 1e-6, m = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${m} ${a} ≠ ${b}`);
const note = (id, type, entrees = {}, titre = type) => ({ id, type, titre, entrees: { ...N.defauts(type), ...entrees } });
const erreurs = r => r.alertes.filter(a => a.niveau === 'erreur');

test('annexes plomberie : types enregistrés, rangés à part, calculables avec leurs valeurs par défaut', () => {
  ['eauxPluviales', 'eauxDePluie', 'legionelle'].forEach(k => {
    const t = N.TYPES[k];
    assert.ok(t && t.annexe && t.famille === 'Calculs annexes' && t.theme === 'Plomberie', k);
    const r = N.calculer(k, N.defauts(k));
    assert.ok(r.synthese && r.resume.length && r.hypotheses.length, k);
    assert.deepStrictEqual(erreurs(r), [], k);
    r.tableaux.forEach(x => x.lignes.forEach(l => assert.strictEqual(l.length, x.entetes.length, `${k} : ${x.titre}`)));
    assert.doesNotThrow(() => JSON.stringify(r.valeurs));
  });
});

test('eaux pluviales : débit, section et diamètre de descente, façade déversante, intensité majorée', () => {
  const toit = { rep: 'T', S: 100, mur: 0, pente: 30, nature: 'inclinee', evac: 'gouttiere', moignon: 'cyl', nDesc: 1, collecteur: '' };
  const r = N.calculer('eauxPluviales', { toitures: [toit], collecteurs: [] }), t = r.valeurs.toitures[0];
  // Q = 3 l/min·m² × 100 m² = 300 l/min = 5 l/s ; section 100 cm² → Ø mini √(4·100/π) = 11,28 cm → Ø 125
  proche(r.valeurs.Q, 5); assert.strictEqual(t.d, 125);
  // Façade de 40 m² comptée pour moitié : 120 m² efficaces ; intensité majorée 4,5 : Q = 4,5 × 120 / 60 = 9 l/s
  const m = N.calculer('eauxPluviales', { intensite: 'majoree', toitures: [{ ...toit, mur: 40 }], collecteurs: [] });
  proche(m.valeurs.Seff, 120); proche(m.valeurs.Q, 9);
  // Moignon tronconique (0,7 cm²/m²) : 70 cm² → Ø 94,4 → Ø 100 ; deux descentes : 50 cm² → Ø 79,8 → Ø 80
  assert.strictEqual(N.calculer('eauxPluviales', { toitures: [{ ...toit, moignon: 'tron' }], collecteurs: [] }).valeurs.toitures[0].d, 100);
  assert.strictEqual(N.calculer('eauxPluviales', { toitures: [{ ...toit, nDesc: 2 }], collecteurs: [] }).valeurs.toitures[0].d, 80);
  // Wyly-Eaton : Ø 100, f = 0,33 : 2,5e-4 × 0,25^(-1/6) × 100^(8/3) × 0,33^(5/3)
  proche(A.capaciteDescente(100, 0.33), 2.5e-4 * 0.25 ** (-1 / 6) * 100 ** (8 / 3) * 0.33 ** (5 / 3));
  proche(A.capaciteDescente(100, 0.33), 10.7, 0.03, 'Ø 100 à 33 % ≈ 10,7 l/s');
  // Gouttière : section inverse de la capacité
  proche(A.sectionGouttiere(A.capaciteGouttiere(15000)), 15000);
  assert.ok(r.tableaux[0].lignes[0][10] !== '—', 'gouttière dimensionnée');
});

test('eaux pluviales : trop-plein des terrasses, collecteurs cumulés vers l\'aval, Ø jamais réduit', () => {
  const r = N.calculer('eauxPluviales', N.defauts('eauxPluviales')), v = r.valeurs;
  // T1 terrasse 400 m² (20 l/s) sur CE1, T2 150 m² (7,5 l/s) sur CE2 qui se rejette dans CE1
  const ce1 = v.collecteurs.find(c => c.rep === 'CE1'), ce2 = v.collecteurs.find(c => c.rep === 'CE2');
  proche(ce2.Q, 7.5); proche(ce1.Q, 27.5);
  assert.ok(ce1.d >= ce2.d && ce2.d >= 110);
  assert.strictEqual(v.trops, 1);
  assert.ok(r.alertes.some(a => /trop-plein obligatoire/.test(a.texte)));
  // Collecteur trop peu pentu : alerte
  const p = N.calculer('eauxPluviales', { ...N.defauts('eauxPluviales'), pente: 0.3 });
  assert.ok(p.alertes.some(a => /0,5 % minimum/.test(a.texte)));
});

test('eaux de pluie : ressource, besoins, cuve aux jours d\'autonomie, couverture, pompe', () => {
  const e = { S: 200, nature: 'inclinee', zone: 'saisie', pSaisie: 700, besoins: [{ usage: 'wc', q: 4, ratio: '', jours: '' }] };
  const r = N.calculer('eauxDePluie', e), v = r.valeurs;
  // R = 200 × 700 × 0,9 × 0,9 = 113 400 L ; B = 4 WC × 60 L/j × 365 = 87 600 L
  proche(v.Ra, 113400, 1e-9); proche(v.Ba, 87600, 1e-9);
  // V = 87 600 × 21 / 365 = 5 040 L → cuve de 6 000 L ; ressource mensuelle toujours supérieure au besoin : 100 %
  proche(v.Vjours, 5040, 1e-9); assert.strictEqual(v.V, 6000); proche(v.couverture, 1, 1e-9);
  // Pompe : 1000 × 9,81 × 2/3600 × 35 / 0,40 = 476,9 W
  proche(v.Pel, 0.4769, 1e-3);
  const el = N.TYPES.eauxDePluie.versElec(v);
  assert.strictEqual(el.length, 1); assert.strictEqual(el[0].type, 'pompe'); proche(el[0].P, 0.48, 1e-9);
  // Bilan mensuel : méthode « mensuel » cohérente (plus petit volume à 95 % de la couverture maximale)
  const m = N.calculer('eauxDePluie', { ...e, methode: 'mensuel' });
  assert.ok(m.valeurs.V > 0 && m.valeurs.couverture >= 0.95 * m.valeurs.couvMax - 1e-9);
  assert.ok(r.onglets[0].blocs[0].items.some(i => /21\/08\/2008/.test(i.ref)));
});

test('eaux de pluie : bilan mensuel calculé à la main, usages interdits', () => {
  // Pluie de 60 L en janvier seulement, besoin de 10 L par mois, cuve de 30 L : janvier 10 fourni, 20 déversés, cuve pleine ;
  // février, mars, avril : 10 L chacun ; mai à décembre : rien → 40 L fournis sur 120 L
  const R = [60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], B = Array(12).fill(10), b = A.bilanMensuel(30, R, B);
  proche(b.fourni, 40); proche(b.trop, 20); proche(b.couverture, 1 / 3);
  const e = { S: 300, zone: 'idf', besoins: [{ usage: 'wc', q: 6 }, { usage: 'arrosage', q: 100 }] };
  assert.deepStrictEqual(erreurs(N.calculer('eauxDePluie', e)), []);
  assert.ok(erreurs(N.calculer('eauxDePluie', { ...e, etablissement: 'sensible' })).some(a => /interdit/.test(a.texte)));
  assert.ok(erreurs(N.calculer('eauxDePluie', { ...e, amiante: 'oui' })).length);
  // Arrosage seul : usage extérieur, admis partout
  assert.deepStrictEqual(erreurs(N.calculer('eauxDePluie', { ...e, etablissement: 'sensible', besoins: [{ usage: 'arrosage', q: 100 }] })), []);
});

test('légionelle : débit de bouclage, températures, antennes de plus de 3 L, choc thermique, prélèvements', () => {
  const r = N.calculer('legionelle', {}), v = r.valeurs;
  // Forfait 100 m × 10 W/m = 1 000 W ; ΔT 5 K ; ρ·cp ≈ 1,145 Wh/L·K à 57,5 °C : ≈ 175 L/h ; 50 °C au retour : ≈ 87 L/h
  proche(v.Pboucle, 1000); proche(v.Qb * 1000, 1000 / (1.145 * 5), 0.01); proche(v.Qmin50 * 1000, 1000 / (1.145 * 10), 0.01);
  // Pompe : ≈ 6 W calculés, 15 W minimum
  proche(v.Pel, 15);
  // Choc : 500 L de 60 à 70 °C (≈ 5,8 kWh) + 1 000 × 50 / 37,5 W pendant 30 min (≈ 0,67 kWh)
  proche(v.Echoc, 500 * 4.183 * 10 / 3600 + 1000 * 50 / 37.5 * 0.5 / 1000, 0.01);
  // Antenne Ø 13 × 25 m : π × 0,0065² × 25 = 3,32 L > 3 L ; Ø 10 × 10 m : 0,79 L
  proche(A.volume(13, 25), Math.PI * 0.0065 ** 2 * 25 * 1000);
  const a = N.calculer('legionelle', { antennes: [{ rep: 'A1', di: 13, L: 25 }, { rep: 'A2', di: 10, L: 10 }] });
  assert.strictEqual(a.valeurs.antennesHors, 1);
  assert.ok(erreurs(a).some(x => /A1 : 3,32 L/.test(x.texte)));
  // Températures réglementaires
  assert.ok(erreurs(N.calculer('legionelle', { Tret: 48 })).some(x => /50 °C/.test(x.texte)));
  assert.ok(erreurs(N.calculer('legionelle', { Tprod: 52, Vstock: 500 })).some(x => /400 L/.test(x.texte)));
  assert.deepStrictEqual(erreurs(N.calculer('legionelle', { Tprod: 52, Vstock: 300, Tdep: 52, Tret: 50 })), []);
  // Prélèvements : 1 sortie + 2 fonds de ballon + 3 retours + ⌈120 / 50⌉ = 3 points d'usage = 9
  assert.strictEqual(N.calculer('legionelle', { etablissement: 'erp', nPoints: 120, nBallons: 2, nBoucles: 3 }).valeurs.nPrel, 9);
  // Tronçon de boucle saisi : pertes isolées inférieures aux pertes nues
  const b = N.calculer('legionelle', { boucle: [{ rep: 'B1', sens: 'aller', de: 28, di: 26, L: 50, ep: 19 }] });
  const l = b.tableaux[0].lignes[0];
  assert.ok(N.num(l[7]) < N.num(l[6]));
  assert.ok(b.valeurs.Pboucle > 0 && b.valeurs.Pboucle < 50 * 20);
});

test('liens : eaux de pluie et légionelle reprises du sanitaire, de l\'ECS et des eaux pluviales ; saisie conservée ; pompes au bilan électrique', () => {
  // Stockage à 62 °C saisi dans le sanitaire : repris (verrouillé) par la production d'ECS, puis par l'anti-légionelle
  const ecs = note('ecs', 'ecs'), san = note('san', 'sanitaire', { production: 'ecs', Tstock: 62 });
  const et = { id: 'e', typeBatiment: 'ehpad', notes: [ecs, san, note('ep', 'eauxPluviales'), note('edp', 'eauxDePluie'), note('leg', 'legionelle'), note('leg2', 'legionelle', { Tdep: 65 })] };
  const r = id => L.resoudre(et, et.notes.find(n => n.id === id)).entrees;
  // Eaux de pluie : 550 m² des toitures, nature dominante (terrasse 400 m²), WC du sanitaire, établissement sensible
  const edp = r('edp');
  assert.strictEqual(edp.S, 550); assert.strictEqual(edp.nature, 'terrasse');
  assert.ok(edp.besoins.some(b => b.usage === 'wc' && b.q === 1));
  assert.strictEqual(edp.etablissement, 'sensible');
  assert.ok(edp._repris && edp._repris.S);
  // Légionelle : production de l'ECS reliée (62 °C, ballon retenu), boucle et antennes du sanitaire, HMT de la pompe de bouclage
  const leg = r('leg'), vs = N.calculer('sanitaire', L.resoudre(et, san).entrees).valeurs, ve = N.calculer('ecs', L.resoudre(et, ecs).entrees).valeurs;
  assert.strictEqual(leg.Tprod, 62); assert.strictEqual(leg.Vstock, ve.choisi);
  assert.strictEqual(leg.Tdep, 60); assert.strictEqual(leg.Tret, 55);
  assert.ok(leg.boucle.length >= 2 && leg.boucle.some(b => b.sens === 'retour'));
  proche(leg.Hpompe, Math.round(vs.bouclage.H * 100) / 100);
  assert.strictEqual(leg.etablissement, 'sante');
  // Valeur saisie : jamais remplacée
  assert.strictEqual(r('leg2').Tdep, 65);
  const c = L.calculer(et, et.notes.find(n => n.id === 'leg'));
  assert.ok(c.valeurs.Pboucle > 0 && c.valeurs.lignes >= 2);
  // Bilan électrique : pompes de bouclage et d'eau de pluie
  const eq = E.equipementsEtude(et, L);
  assert.ok(eq.some(x => x.rep === 'PB-ECS' && x.type === 'pompe'));
  assert.ok(eq.some(x => x.rep === 'P-EDP' && x.type === 'pompe'));
  // Étude sans autre note : rien n'est repris, aucune exception
  const seul = { id: 's', notes: [note('x', 'legionelle'), note('y', 'eauxDePluie')] };
  seul.notes.forEach(n => assert.doesNotThrow(() => L.calculer(seul, n)));
});
