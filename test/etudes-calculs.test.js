// Tests du moteur de calcul du bureau d'études : valeurs de référence (propriétés de l'eau, Moody, tables vapeur,
// NF EN 12828, NF EN 13480-3) et cohérence de chaque type de note de calcul.
const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../etudes/public/js/calculs');
const N = require('../etudes/public/js/notes');
const D = require('../etudes/public/js/donnees');
const Schema = require('../etudes/public/js/schema');
const I = require('../etudes/public/js/industriel');

const proche = (v, ref, tol, msg) => assert.ok(Math.abs(v - ref) <= tol, `${msg || ''} ${v} ≠ ${ref} ± ${tol}`);

test('propriétés de l\'eau et des mélanges glycolés', () => {
  proche(C.eau(20).rho, 998.2, 0.1); proche(C.eau(80).rho, 971.8, 0.1); proche(C.eau(4).rho, 1000.0, 0.05);
  proche(C.eau(20).mu * 1000, 1.002, 0.01); proche(C.eau(80).mu * 1000, 0.355, 0.01);
  const g = C.liquide('meg30', 0);
  assert.ok(g.rho > 1040 && g.cp < 3800 && g.mu > C.eau(0).mu * 2, 'glycol plus dense, moins capacitif, plus visqueux');
  assert.strictEqual(C.liquide('meg30', 20).gel, -15.6);
  const p = C.liquide('perso', 50, { rho: 870, cp: 2.1, mu: 12 });
  assert.deepStrictEqual([p.rho, p.cp, p.mu], [870, 2100, 0.012]);
});

test('coefficient de frottement : laminaire, Colebrook (diagramme de Moody)', () => {
  proche(C.frottement(1000, 1e-4), 0.064, 1e-9);
  proche(C.frottement(1e5, 1e-4), 0.0185, 0.0005);
  proche(C.frottement(1e6, 1e-3), 0.0199, 0.0005);
  proche(C.frottement(1e5, 0), 0.0180, 0.0005);
  const z = C.frottement(3000, 1e-4), [a, b] = [64 / 2300, C.frottement(4000, 1e-4)];
  assert.ok(z > Math.min(a, b) && z < Math.max(a, b), 'zone critique interpolée entre laminaire et turbulent');
});

test('perte de charge d\'un tube acier DN 50 en eau chaude', () => {
  const t = C.tube('acier-10216', '60.3x2.9'), w = C.eau(80), r = C.ecoulement(10 / 3600, t.di / 1000, w.rho, w.mu, 0.045);
  assert.strictEqual(t.di, 54.5); proche(r.v, 1.19, 0.01); proche(r.R, 259, 15); assert.strictEqual(r.regime, 'turbulent');
});

test('vapeur saturée et point de rosée', () => {
  const v = C.vapeurSat(8);
  assert.deepStrictEqual([v.T, v.vg, v.r], [170.4, 0.2403, 2046.5]);
  const v2 = C.vapeurSat(9);
  assert.ok(C.vapeurSat(8.5).T > v.T && C.vapeurSat(8.5).T < v2.T);
  proche(C.pointRosee(20, 50), 9.3, 0.2); proche(C.pointRosee(26, 65), 18.9, 0.2);
});

test('vase d\'expansion selon NF EN 12828', () => {
  const r = C.vaseExpansion({ Vinst: 1000, Tmin: 10, Tmax: 80, Hst: 10, Psv: 3 });
  proche(r.e, 999.70 / 971.80 - 1, 1e-4); proche(r.Ve, 28.7, 0.1); assert.strictEqual(r.Vwr, 5);
  proche(r.p0, 1.18, 0.01); assert.strictEqual(r.pe, 2.5); proche(r.Vn, 89.4, 0.3); assert.strictEqual(r.choisi, 100);
  assert.strictEqual(C.vaseExpansion({ Vinst: 1000, Tmin: 10, Tmax: 80, Hst: 30, Psv: 3 }).Vn, Infinity, 'p0 ≥ pe : impossible');
  assert.ok(C.vaseExpansion({ Vinst: 1000, Tmin: 10, Tmax: 120, Hst: 10, Psv: 6 }).pD > 0.9, 'pression de vapeur au-delà de 100 °C');
});

test('épaisseur sous pression NF EN 13480-3 et pression d\'épreuve', () => {
  const cn = C.contrainteNominale('P235GH', 20);
  assert.strictEqual(cn.f, 150); // min(235 / 1,5 ; 360 / 2,4)
  proche(C.epaisseurMini(16, 114.3, 150, 1), 1.6 * 114.3 / 301.6, 1e-9);
  proche(C.pressionMaxi(C.epaisseurMini(16, 114.3, 150, 1), 114.3, 150, 1), 16, 1e-9);
  const r = N.calculer('epaisseur', { PS: 40, TS: 250, nuance: 'P235GH', serie: 'acier-10216' });
  assert.ok(r.valeurs.lignes.some(l => !l.ok) && r.valeurs.lignes.some(l => l.ok), 'les gros diamètres minces ne tiennent pas 40 bar');
  proche(r.valeurs.PT, Math.max(1.25 * 40 * 150 / C.contrainteNominale('P235GH', 250).f, 1.43 * 40), 1e-6);
});

test('portée entre supports, dilatation, Kv', () => {
  const p = C.portee({ de: 114.3, ep: 3.6, rhoMat: 7850, E: 210000 });
  proche(p.mTube, 9.83, 0.02); proche(p.L, 4.5, 0.1); assert.strictEqual(p.critere, 'flèche');
  const d = N.calculer('dilatation', { serie: 'acier-10216', tube: '114.3x3.6', L: 100, Tpose: 10, Tmin: 10, Tmax: 110 });
  proche(d.valeurs.dLc, 120, 1e-6);
  proche(C.kv(10, 100), 10, 1e-9); proche(C.dpVanne(10, 10), 100, 1e-9);
});

test('isolation : déperdition décroissante, condensation détectée', () => {
  const nu = C.isolation({ De: 0.0603, e: 0, Tf: 80, Ta: 20, isolant: 'laine-roche', emissivite: 0.9 });
  const e40 = C.isolation({ De: 0.0603, e: 0.04, Tf: 80, Ta: 20, isolant: 'laine-roche', emissivite: 0.1 });
  assert.ok(nu.q > 130 && nu.q < 200, `tube nu DN 50 à 80 °C : ${nu.q} W/m`);
  assert.ok(e40.q < nu.q / 5 && e40.Ts > 20 && e40.Ts < 40);
  const r = N.calculer('isolation', { Tf: 6, Ta: 28, HR: 80, isolant: 'elastomere' });
  assert.ok(r.valeurs.Ts >= r.valeurs.Td + 1, 'épaisseur retenue au-dessus du point de rosée');
  assert.ok(r.alertes.some(a => /condensation/.test(a.texte)), 'tube nu en condensation');
});

test('aéraulique : gaine Ø 400 à 2 000 m³/h, diamètre équivalent', () => {
  const g = C.gaine(2000 / 3600, { a: 400, b: 0 }, 20, 0.09);
  proche(g.v, 4.42, 0.01); assert.ok(g.R > 0.4 && g.R < 0.8, `R = ${g.R}`);
  proche(C.diametreEquivalent(400, 400), 437, 1);
  assert.deepStrictEqual(C.lireDimension('600 x 300'), { a: 600, b: 300 });
  assert.deepStrictEqual(C.lireDimension('Ø315'), { a: 315, b: 0 });
  assert.strictEqual(C.lireDimension('abc'), null);
});

test('air comprimé et vapeur : écoulement compressible cohérent', () => {
  // Formule empirique usuelle : ΔP = 450 · Qc^1,85 · L / (d^5 · p), Qc en L/s d'air libre, d en mm, p en bar abs
  const t = C.tube('acier-galva', '60.3x3.6'), d = t.di, Qc = 300 / 3.6, pAbs = 8.013;
  const emp = 450 * Qc ** 1.85 * 120 / (d ** 5 * pAbs);
  const r = C.compressible({ m: 300 / 3600 * C.air(20).rho, Di: d / 1000, L: 120, rug: 0.15, pEntree: pAbs, rhoDe: p => C.air(25, p * 1e5).rho, mu: C.air(25).mu });
  assert.ok(r.ok && Math.abs(r.dp - emp) / emp < 0.4, `${r.dp} bar contre ${emp} bar`);
  const v = N.calculer('vapeur', { p: 7, m: 1500, L: 80, zeta: 8 });
  assert.strictEqual(v.valeurs.choix, '88.9x3.2');
  assert.ok(v.valeurs.flash > 0.1 && v.valeurs.flash < 0.16, 'revaporisation 7 bar → 0 bar ≈ 13 %');
});

test('chaque type de note se calcule avec ses valeurs par défaut, sans erreur', () => {
  for (const [k, t] of Object.entries(N.TYPES)) {
    const r = N.calculer(k, {});
    assert.ok(t.titre && t.famille && t.champs.length, k);
    assert.ok(r.synthese && r.resume.length && r.hypotheses.length, k);
    assert.deepStrictEqual(r.alertes.filter(a => a.niveau === 'erreur'), [], k);
    r.tableaux.forEach(x => x.lignes.forEach(l => assert.strictEqual(l.length, x.entetes.length, `${k} : ${x.titre}`)));
  }
});

test('réseau hydraulique : HMT = somme des pertes de charge avec marge', () => {
  const r = N.calculer('reseau', { troncons: [{ rep: 'A', Q: 5, tube: '60.3x2.9', L: 100, zeta: 0 }], composants: [{ nom: 'Échangeur', dp: 30 }], marge: 0, T: 20 });
  const w = C.eau(20), x = C.ecoulement(5 / 3600, 0.0545, w.rho, w.mu, 0.045);
  proche(r.valeurs.dpTotal, x.R * 100 + 30000, 1e-6);
  proche(r.valeurs.HMT, r.valeurs.dpTotal / (w.rho * 9.81), 1e-9);
  const auto = N.calculer('reseau', { troncons: [{ rep: 'B', Q: 30, tube: '', L: 10, zeta: 0 }], vmax: 1.5, Rmax: 150 });
  assert.match(auto.tableaux[0].lignes[0][2], /\(auto\)/);
  const o = N.calculer('reseau', { circuit: 'ouvert', Hgeo: 12 });
  assert.ok(o.valeurs.dpTotal > N.calculer('reseau', {}).valeurs.dpTotal + 12 * 9.81 * 970);
});

test('entrées invalides : messages d\'erreur et valeurs par défaut protégées', () => {
  assert.ok(N.calculer('tuyauterie', { mode: 'debit', Q: 0 }).alertes.some(a => a.niveau === 'erreur'));
  assert.ok(N.calculer('tuyauterie', { fluide: 'meg20', T: -12 }).alertes.some(a => /congélation/.test(a.texte)));
  assert.strictEqual(N.calculer('isolation', { serie: 'cuivre-1057', tube: 'inexistant' }).resume[0][1], C.tubes('cuivre-1057')[0].nom);
  const a = N.defauts('reseau'), b = N.defauts('reseau');
  a.troncons.push({}); assert.notStrictEqual(a.troncons.length, b.troncons.length, 'valeurs par défaut copiées');
  assert.ok(Object.values(D.SERIES).every(s => s.tubes.every(([, de, ep]) => de > 2 * ep)));
  assert.strictEqual(N.num('1,5'), 1.5); assert.strictEqual(N.num('', 7), 7);
});

test('bilan thermique d\'un local : déperditions, apports de process, été', () => {
  const base = { L: 20, l: 10, H: 5, facades: '4', Ti: 20, climat: 'perso', Te: -10, TeEte: 32, HRete: 40, mur: 'perso', Umur: 0.5, toit: 'perso', Utoit: 0.3,
    plancher: 'etage', Svitrage: 0, Slanterneau: 0, Sporte: 0, ponts: '0', infiltration: 'standard', qv: 0, qext: 0, relance: '0', process: [] };
  const r = N.calculer('bilan', base);
  // Murs 60 m × 5 m × 0,5 + toiture 200 m² × 0,3 = 210 W/K ; air 0,34 × 0,5 × 1 000 m³ = 170 W/K ; ΔT = 30 K
  proche(r.valeurs.Htr, 210, 1e-9); proche(r.valeurs.Hve, 170, 1e-9); proche(r.valeurs.Pchauf, 380 * 30, 1e-6);
  const avec = N.calculer('bilan', { ...base, process: [{ nom: 'Four', P: 10, simult: 50, sensible: 100 }], processHiver: '100' });
  proche(avec.valeurs.deduit, 5000, 1e-9); proche(avec.valeurs.Pchauf, 380 * 30 - 5000, 1e-6);
  assert.ok(avec.valeurs.Ss > r.valeurs.Ss + 4999, 'process ajouté aux apports d\'été');
  assert.strictEqual(N.calculer('bilan', { ...base, facades: '2' }).valeurs.Htr, 30 * 5 * 0.5 + 60, 'deux façades exposées');
  assert.strictEqual(N.calculer('bilan', { ...base, climat: 'strasbourg' }).valeurs.Te, -15);
  assert.ok(N.calculer('bilan', { ...base, Svitrage: 1000 }).alertes.some(a => a.niveau === 'erreur'));
});

test('schéma de principe hydraulique : débits, bouteille, cascade et dessin', () => {
  require('../etudes/public/js/schema');
  const base = { reseau: 'ch-70-50', generateur: 'chaudiere-cond', nGen: '2', Pgen: 100, bouteille: 'oui',
    circuits: [{ rep: 'Radiateurs', emetteur: 'radiateurs', P: 80, regime: '', regulation: '3v', L: 50 }, { rep: 'Plancher', emetteur: 'plancher', P: 40, regime: '40/30', regulation: '3v', L: 30 }] };
  const r = N.calculer('pid', base), w = C.eau(60), q = (P, dT) => P * 1000 / (w.rho * w.cp * dT) * 3600;
  proche(r.valeurs.Qg, q(100, 20), 1e-9); proche(r.valeurs.Qp, 2 * q(100, 20), 1e-9);
  proche(r.valeurs.circuits[1].Q, q(40, 10), 1e-9);
  proche(r.valeurs.circuits[1].Qcoll, q(40, 40), 1e-9, 'circuit mélangé : appel au collecteur sur 70 − 30 K');
  proche(r.valeurs.Qs, q(80, 20) + q(40, 40), 1e-9);
  assert.ok(r.valeurs.bouteille && r.schema.startsWith('<svg') && /Bouteille de/.test(r.schema) && (r.schema.match(/>G\d</g) || []).length === 2);
  const sans = N.calculer('pid', { ...base, bouteille: 'non', nGen: '1', Pgen: 150 });
  assert.ok(!/Bouteille de/.test(sans.schema) && sans.valeurs.bouteille === null);
  assert.ok(N.calculer('pid', { ...base, Pgen: 50 }).alertes.some(a => a.niveau === 'erreur' && /insuffisante/.test(a.texte)));
  assert.ok(N.calculer('pid', { ...base, reseau: 'eg-7-12' }).alertes.some(a => /incompatible/.test(a.texte)), 'chaudière sur eau glacée');
  assert.ok(N.calculer('pid', { ...base, circuits: [{ rep: 'X', emetteur: 'radiateurs', P: 50, regime: '90/70', regulation: '3v', L: 10 }] }).alertes.some(a => /plus chaud/.test(a.texte)));
  assert.ok(!/<script/i.test(N.calculer('pid', { ...base, titreInstallation: '<script>x</script>' }).schema), 'textes échappés dans le SVG');
});

test('schéma : réglementation selon la puissance et liste des points de régulation', () => {
  require('../etudes/public/js/schema');
  const items = (r, titre) => r.onglets[0].blocs.flatMap(b => b.items || []).map(i => i.texte).join(' | ');
  const petit = N.calculer('pid', { nGen: '1', Pgen: 60, circuits: [{ rep: 'R', emetteur: 'radiateurs', P: 50, regime: '', regulation: '3v', L: 20 }] });
  assert.ok(!/chaufferie en local dédié/.test(items(petit)) && !/inspection périodique tous les 5 ans/.test(items(petit)));
  const moyen = N.calculer('pid', { nGen: '2', Pgen: 350 });
  assert.match(items(moyen), /chaufferie en local dédié/); assert.match(items(moyen), /manque d'eau/); assert.match(items(moyen), /BACS/);
  assert.doesNotMatch(items(moyen), /ICPE \(rubrique 2910\)|classée ICPE/);
  const gros = N.calculer('pid', { nGen: '3', Pgen: 450 });
  assert.match(items(gros), /efficacité énergétique tous les 2 ans/); assert.match(items(gros), /rubrique 2910/);
  const froid = N.calculer('pid', { reseau: 'eg-7-12', generateur: 'gf-air', nGen: '1', Pgen: 300, fluideFrigo: 'R410A', chargeFrigo: 120,
    circuits: [{ rep: 'V', emetteur: 'ventilo', P: 250, regime: '', regulation: '2v', L: 50 }] });
  assert.match(items(froid), /250,6 t éq\. CO₂/); assert.match(items(froid), /tous les 6 mois/); assert.doesNotMatch(items(froid), /rubrique 1185/);
  const reg = moyen.onglets[1].blocs, pts = reg[1].tableau.lignes, recap = reg[2].tableau.lignes;
  assert.strictEqual(recap[recap.length - 1][1], String(pts.length), 'récapitulatif = nombre de points');
  assert.ok(pts.some(p => p[0] === 'MDE') && pts.some(p => p[0] === 'PG2') && reg[0].liste.some(t => /Permutation/.test(t)));
});

test('liens entre calculs : bilan → schéma → réseaux, vannes, vase', () => {
  const L = require('../etudes/public/js/liens');
  let k = 0; const uid = () => `x${++k}`;
  const bilan = { id: 'b1', type: 'bilan', titre: 'Bilan atelier', entrees: {} };
  const pid = { id: 'p1', type: 'pid', titre: 'Schéma', entrees: { ...N.defauts('pid'), circuits: [
    { rep: 'Aérothermes atelier', emetteur: 'aerotherme', P: 1, bilan: 'b1', regime: '', regulation: '3v', L: 80 },
    { rep: 'Ballon ECS', emetteur: 'ecs', P: 40, regime: '', regulation: 'direct', L: 20 }] } };
  const et = { notes: [bilan, pid] };
  const Pch = N.calculer('bilan', {}).valeurs.Pchauf / 1000, r = L.resoudre(et, pid);
  proche(r.entrees.circuits[0].P, Pch, 0.05); assert.ok(r.verrous['circuits.0.P'] && !r.verrous['circuits.1.P']);
  assert.strictEqual(pid.entrees.circuits[0].P, 1, 'la saisie d\'origine n\'est pas modifiée');
  const nv = L.notesDepuisSchema(et, pid, uid);
  assert.deepStrictEqual(nv.map(n => n.type), ['reseau', 'vanne', 'reseau', 'vase']);
  et.notes.push(...nv);
  assert.strictEqual(L.notesDepuisSchema(et, pid, uid).length, 0, 'pas de doublon');
  const reseau = nv[0], d = Schema.dimensionner(r.entrees);
  proche(L.resoudre(et, reseau).entrees.troncons[0].Q, d.circuits[0].Q, 0.01);
  // Lien vivant : allonger le circuit dans le schéma met à jour la note réseau
  pid.entrees.circuits[0].L = 200;
  assert.strictEqual(L.resoudre(et, reseau).entrees.troncons[0].L, 200);
  const vase = L.resoudre(et, nv[3]);
  assert.ok(vase.entrees.Vinst > 100 && vase.verrous.Vinst && vase.entrees.Tmax === 70);
  assert.ok(N.calculer('pid', r.entrees).valeurs.volume > 0);
  // Détacher : valeurs figées, plus de verrou ; source supprimée : alerte
  L.detacher(et, reseau); assert.ok(!reseau.lien && reseau.entrees.troncons[0].L === 200);
  et.notes.splice(et.notes.indexOf(bilan), 1);
  assert.ok(L.calculer(et, pid).alertes.some(a => /supprimé/.test(a.texte)));
});

test('schéma : change-over, échangeur, ballon tampon, Tichelmann et export DXF', () => {
  const Dxf = require('../etudes/public/js/dxf');
  const co = N.calculer('pid', { reseau: 'co', generateur: 'pac-rev', nGen: '2', Pgen: 120, PgenF: 110, tampon: 'oui', ratioTampon: 15, tichelmann: 'oui', pompesPrim: 'commune',
    circuits: [{ rep: 'Ventilos', emetteur: 'ventilo', P: 120, Pf: 150, regime: '', regulation: '2v', L: 150 }] });
  const w = C.eau(42.5), wf = C.eau(9.5), qc = 120000 / (w.rho * w.cp * 5) * 3600, qf = 150000 / (wf.rho * wf.cp * 5) * 3600;
  proche(co.valeurs.circuits[0].Q, Math.max(qc, qf), 1e-6, 'débit retenu : le plus fort des deux saisons');
  assert.match(co.schema, /Ballon tampon/); assert.match(co.schema, /Tichelmann/); assert.match(co.synthese, /Change-over/);
  assert.ok(N.calculer('pid', { reseau: 'co', generateur: 'chaudiere-cond' }).alertes.some(a => a.niveau === 'erreur' && /Change-over/.test(a.texte)));
  const ech = N.calculer('pid', { bouteille: 'echangeur', pincement: 5, reseau: 'ch-80-60', nGen: '1', Pgen: 300 });
  assert.match(ech.schema, /Échangeur/); assert.match(ech.resume.find(r => /Échangeur/.test(r[0]))[1], /secondaire 75\/55/);
  assert.ok(ech.onglets[0].blocs.flatMap(b => b.items || []).some(i => /primaire et secondaire séparés/.test(i.texte)));
  const peu = N.calculer('pid', { tampon: 'oui', ratioTampon: 1 });
  assert.match(peu.resume.find(r => r[0] === 'Ballon tampon')[1], /Non nécessaire/);
  // DXF : calques, coordonnées retournées, textes accentués
  const dxf = Dxf.depuisSvg(ech.schema), t = dxf.texte;
  assert.ok(dxf.entites > 100 && /\r\nENTITIES\r\n/.test(t) && t.trim().endsWith('EOF'));
  assert.match(t, /\r\nLAYER\r\n {0}2\r\nDEPART/); assert.match(t, /Échangeur/); assert.ok(dxf.octets.includes(0xc9), 'É écrit en Windows-1252');
  const svg = '<svg width="100" height="50" data-depart="#c62828" data-retour="#1565c0"><line x1="10" y1="10" x2="90" y2="10" stroke="#c62828"/><g transform="translate(5 5)"><path d="M0 0 h10 v10 Z" fill="#fff" stroke="#222"/></g><text x="20" y="30" font-size="10" text-anchor="middle">Été</text></svg>';
  const p = Dxf.depuisSvg(svg).texte.split('\r\n');
  const i = p.indexOf('LINE');
  assert.deepStrictEqual([p[i + 2], p[i + 6], p[i + 8]], ['DEPART', '10', '40']);
  assert.strictEqual(p.filter(x => x === 'LINE').length, 1 + 3, 'ligne + triangle fermé');
  assert.ok(p.includes('Été') && p.includes('72'));
  assert.deepStrictEqual([...Dxf.octets('Été ≈ 3')], [0xc9, 0x74, 0xe9, 0x20, ...[...'\\U+2248'].map(c => c.charCodeAt(0)), 0x20, 0x33]);
});

test('catalogue de pompes et de vannes : choix au point de fonctionnement, import CSV', () => {
  const Cat = require('../etudes/public/js/catalogue');
  Cat.utiliser(null);
  const p = Cat.pompesPour(12, 8)[0];
  assert.ok(p && 0.9 * p.Qmax >= 12 && p.Hmax * (1 - (12 / p.Qmax) ** 2) >= 8.8, 'point couvert avec réserve');
  proche(p.Hmax * Cat.vitesse(p, 12, 8) ** 2 - p.Hmax * (12 / p.Qmax) ** 2, 8, 1e-9, 'vitesse réduite passant par le point');
  assert.deepStrictEqual(Cat.pompesPour(500, 50), []);
  assert.strictEqual(Cat.vannePour(19.4, '3v').Kvs, 25);
  const csv = 'fabricant;modele;type;DN;Hmax_m;Qmax_m3h;P1_W\nAcme;A-40;Circulateur;40;10;20;400\nAcme;mauvaise;;;;;\n';
  const { liste, rejets } = Cat.lireCsv(csv, 'pompes');
  assert.strictEqual(liste.length, 1); assert.deepStrictEqual(rejets, [3]);
  Cat.utiliser({ pompes: liste });
  assert.strictEqual(Cat.pompesPour(8, 5)[0].modele, 'A-40'); assert.ok(!Cat.generique().pompes && Cat.generique().vannes);
  assert.match(N.calculer('reseau', { troncons: [{ rep: 'A', Q: 8, tube: '', L: 10, zeta: 1 }], composants: [{ nom: 'X', dp: 20 }] }).resume.find(r => r[0] === 'Pompe proposée')[1], /Acme A-40/);
  const v = Cat.lireCsv('Acme;V3-50;3v;50;40', 'vannes'); assert.strictEqual(v.liste[0].type, '3v');
  Cat.utiliser(null);
});

test('modèles d\'études : instanciation, liens reportés, modèles enregistrés', () => {
  const M = require('../etudes/public/js/modeles'), L = require('../etudes/public/js/liens');
  let k = 0; const uid = () => `m${++k}`;
  for (const m of M.INTEGRES) {
    const notes = M.instancier(m, uid), et = { notes };
    assert.ok(notes.length >= m.notes.length && new Set(notes.map(n => n.id)).size === notes.length, m.id);
    notes.forEach(n => assert.deepStrictEqual(L.calculer(et, n).alertes.filter(a => a.niveau === 'erreur'), [], `${m.id} : ${n.titre}`));
  }
  const atelier = M.instancier(M.INTEGRES.find(m => m.id === 'atelier'), uid), bilan = atelier.find(n => n.type === 'bilan'), pid = atelier.find(n => n.type === 'pid');
  assert.strictEqual(pid.entrees.circuits[0].bilan, bilan.id, 'circuit relié au bilan de la nouvelle étude');
  // Étude enregistrée comme modèle : nouveaux identifiants, liens reportés
  const copie = M.instancier({ modele: true, notes: atelier }, uid), b2 = copie.find(n => n.type === 'bilan'), p2 = copie.find(n => n.type === 'pid');
  assert.ok(b2.id !== bilan.id && p2.entrees.circuits[0].bilan === b2.id && copie.filter(n => n.lien).every(n => n.lien.note === p2.id));
});

test('métré et chiffrage : quantités, rapprochement avec la bibliothèque, lignes de devis', () => {
  const Me = require('../etudes/public/js/metre');
  const articles = [{ id: 'a1', designation: 'Tube inox 316L DN50 sch10S', famille: 'Tubes', unite: 'ml', prixVente: 51, coutRevient: 41 },
    { id: 'a4', designation: 'Coude 90° 3D inox 316L DN50', famille: 'Raccords', unite: 'u', prixVente: 26, coutRevient: 21 },
    { id: 'a8', designation: 'Supportage et colliers', famille: 'Supportage', unite: 'ml', prixVente: 12, coutRevient: 9 },
    { id: 'a9', designation: 'Tube acier P235GH DN150 ép. 4,5', famille: 'Tubes', unite: 'ml', prixVente: 57, coutRevient: 46 }];
  const mo = [{ id: 'mo2', code: 'MONT', libelle: 'Tuyauteur monteur', tauxVente: 48, tauxCout: 34 }, { id: 'mo4', code: 'BE', libelle: 'Bureau d\'études', tauxVente: 62, tauxCout: 45 }];
  const et = { notes: [
    { id: 'r1', type: 'reseau', titre: 'R', entrees: { serie: 'inox-1127', troncons: [{ rep: 'A', Q: 6, tube: '60.3x2', L: 40, zeta: 2 }, { rep: 'B', Q: 6, tube: '60.3x2', L: 25, zeta: 2 }], composants: [] } },
    { id: 'i1', type: 'isolation', titre: 'I', entrees: { serie: 'inox-1127', tube: '60.3x2', Tf: 80, Ta: 20, L: 65, isolant: 'laine-roche' } }] };
  const postes = Me.rapprocher(Me.metre(et), articles, mo), tube = postes.find(p => /Tuyauterie inox DN 50/.test(p.designation));
  assert.strictEqual(tube.qte, 65, 'longueurs cumulées par diamètre');
  assert.strictEqual(tube.articleId, 'a1'); assert.deepStrictEqual(tube.accessoires.map(x => x.article && x.article.id), ['a4', 'a8']); assert.strictEqual(tube.moId, 'mo2');
  assert.ok(postes.some(p => p.chapitre === 'Calorifuge' && p.qte === 65 && !p.articleId));
  assert.strictEqual(postes.find(p => p.chapitre === 'Études').moId, 'mo4');
  const lignes = Me.lignesDevis(postes, articles, mo), ouv = lignes.find(l => l.designation === tube.designation);
  assert.deepStrictEqual(lignes.filter(l => l.type === 'chapitre').map(l => l.titre), ['Études', 'Tuyauteries', 'Calorifuge']);
  assert.deepStrictEqual(ouv.composants.map(c => c.articleId || c.moId), ['a1', 'a4', 'a8', 'mo2']);
  assert.ok(lignes.find(l => /Calorifuge/.test(l.designation || '')).libre, 'poste hors bibliothèque');
  proche(Me.prixPoste(tube, articles, mo).unitaire, 51 * 1.05 + 26 * 0.2 + 12 + 48 * tube.heures, 1e-9);
  assert.match(Me.csv(postes), /Tuyauterie inox DN 50/);
  // Notes créées depuis un schéma : comptées une seule fois (par le schéma)
  let k = 0; const pid = { id: 'p1', type: 'pid', titre: 'S', entrees: N.defauts('pid') }, et2 = { notes: [pid] };
  et2.notes.push(...require('../etudes/public/js/liens').notesDepuisSchema(et2, pid, () => `z${++k}`));
  const total = Me.metre(et2).filter(p => p.unite === 'ml' && p.chapitre === 'Tuyauteries').reduce((s, p) => s + p.qte, 0);
  const attendu = Schema.dimensionner(pid.entrees).circuits.reduce((s, c) => s + c.L, 0) + 2 * (4 * 1.5 + 2) + 2 * 6;
  proche(total, attendu, 1e-6);
});

test('données : séries ASME, fluides de fiches fabricants, visa de la réglementation', () => {
  const t = C.tube('acier-sch40', '60.3x3.91'); proche(t.di, 52.48, 0.01); assert.strictEqual(C.tubes('inox-sch10s').length, 14);
  assert.ok(N.TYPES.epaisseur.champs.find(c => c.k === 'serie').o.some(([k]) => k === 'acier-sch80'));
  const ep = N.calculer('epaisseur', { serie: 'acier-sch80', PS: 100, TS: 200 }); assert.ok(ep.valeurs.lignes.every(l => l.ok), 'Sch 80 tient 100 bar à 200 °C');
  const csv = 'fluide;c;T;rho;cp;mu;gel\nFluide A;30;0;1040;3,7;6;-15\nFluide A;30;60;1010;3,9;1,2;-15\nFluide B;;20;900;2;10;\n';
  const { liste, incomplets } = C.lireFluidesCsv(csv);
  assert.strictEqual(liste.length, 1); assert.deepStrictEqual(incomplets, ['Fluide B (fiche fabricant)']);
  C.utiliserFluides(liste);
  const f = C.liquide(liste[0].cle, 30); proche(f.rho, 1025, 1e-9); proche(f.cp, 3800, 1e-9); proche(f.mu * 1000, Math.sqrt(6 * 1.2), 1e-9);
  assert.ok(N.TYPES.tuyauterie.champs.find(c => c.k === 'fluide').o().some(([k]) => k === liste[0].cle));
  assert.ok(N.calculer('tuyauterie', { fluide: liste[0].cle, T: -2 }).alertes.some(a => /congélation|fiche fabricant/.test(a.texte)));
  C.utiliserFluides([]);
  assert.strictEqual(N.calculer('tuyauterie', { fluide: liste[0].cle }).resume[0][0], 'Débit volumique', 'fluide retiré : retour à l\'eau');
  const Sc = require('../etudes/public/js/schema'), regl = () => N.calculer('pid', {}).onglets[0].blocs;
  assert.match(regl()[0].items[0].texte, /non encore relue/);
  Sc.utiliserReglementation({ relecteur: 'J. Martin', date: '2026-01-10', validite: '2099-01-01', complements: 'Clapet anti-thermosiphon sur chaque générateur\n' });
  assert.match(regl()[0].items[0].texte, /relue le 10\/01\/2026 par J\. Martin/);
  assert.ok(regl().some(b => /complémentaires/.test(b.titre) && b.items[0].ref === 'Règle interne'));
  Sc.utiliserReglementation({ relecteur: 'J. Martin', date: '2020-01-10', validite: '2021-01-10' });
  assert.match(regl()[0].items[0].texte, /expirée/);
  Sc.utiliserReglementation(null);
});

test('calculs industriels : condensats, gaz, NPSH, coup de bélier, ECS', () => {
  assert.ok(Math.abs(I.psat(100) - 101325) < 500);
  assert.ok(Math.abs(I.patmAltitude(0) - 101325) < 10);
  // Flash : (h'(7 bar abs) − h'(1,2 bar abs)) / r ≈ 11 %
  const c = N.calculer('condensats', {}).valeurs;
  assert.ok(c.x > 0.09 && c.x < 0.13, String(c.x));
  assert.strictEqual(c.capacite, 1600);
  // Gaz naturel : Qn = ΣP / PCI
  const g = N.calculer('gaz', {}).valeurs;
  assert.ok(Math.abs(g.Qn - 340 / I.GAZ.g20[1]) < 1e-9);
  assert.ok(g.dp <= g.dpmax);
  // Coup de bélier : Joukowsky ρ·a·v en fermeture brusque, Michaud 2ρLv/tf sinon
  const b = N.calculer('belier', { tf: 0.1 }).valeurs, b2 = N.calculer('belier', {}).valeurs;
  assert.ok(b.brusque && b.a > 1100 && b.a < 1400);
  assert.ok(Math.abs(b.dP - 998 * b.a * b.v / 1e5) < 0.1);
  assert.ok(!b2.brusque && Math.abs(b2.dP - 2 * 998 * 300 * b2.v / 2 / 1e5) < 0.05);
  // NPSH : baisse quand la température monte
  assert.ok(N.calculer('npsh', { T: 90 }).valeurs.npshd < N.calculer('npsh', { T: 60 }).valeurs.npshd);
  // ECS : stock = (pointe − production pendant la pointe) / 80 %
  const e = N.calculer('ecs', {}).valeurs;
  assert.ok(Math.abs(e.Vb - (e.Vp - e.Vprod) / 0.8) < 1 && e.choisi >= e.Vb);
});
