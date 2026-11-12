// Hydraulique au réel : pertes de charge saisies ou reprises des fiches (générateurs, échangeurs, bouteille, vanne
// primaire) à la place des forfaits, pompes de production retenues (courbe du fabricant), évacuation de la chaleur
// (aéroréfrigérant, tour), change-over à puissance froid par générateur et redimensionnement des vannes (autorité).
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Notes = N;
const Sc = require('../etudes/public/js/schema');
global.Schema = Sc;
require('../etudes/public/js/cta'); require('../etudes/public/js/equilibrage'); require('../etudes/public/js/industriel');
require('../etudes/public/js/aeraulique-schema'); require('../etudes/public/js/terminaux'); require('../etudes/public/js/sanitaire');
const E = require('../etudes/public/js/electricite');
const L = require('../etudes/public/js/liens');
const I = require('../etudes/public/js/installation');
const M = require('../etudes/public/js/modeles');
const Nm = require('../etudes/public/js/nomenclature');
const R = require('../etudes/public/js/registre');
const FE = require('../etudes/public/js/fiche-equipement');

let k = 0;
const nn = (t, titre, x = {}) => ({ id: `h${++k}`, type: t, titre, entrees: { ...N.defauts(t), ...x } });
const pid = x => ({ ...N.defauts('pid'), ...x });
const proche = (a, b, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
// Courbe Q:H passant largement au-dessus d'un point (Q m³/h, H mCE) : pompe suffisante
const courbe = (Qmax, H0) => [0, 0.25, 0.5, 0.75, 1].map(f => `${(Qmax * f).toFixed(2)}:${(H0 * (1 - 0.6 * f * f)).toFixed(2)}`).join(' ; ');

test('A1 — forfaits par défaut inchangés, ΔP saisies et reprises de la fiche utilisées dans la production et le calcul global', () => {
  // Sans saisie : chaudière 10 + liaisons 5 + bouteille 1 = 16 kPa, tout en « forfait »
  const d0 = Sc.dimensionner(pid({}));
  assert.strictEqual(d0.prod.dp, 16);
  assert.ok(d0.prod.postes.every(p => p[2] === 'forfait'));
  // ΔP du générateur et de la bouteille saisies
  const d1 = Sc.dimensionner(pid({ dpGen: 25, dpBouteille: 3 }));
  assert.strictEqual(d1.prod.dp, 33);
  assert.deepStrictEqual(d1.prod.postes.map(p => p[2]), ['saisie', 'forfait', 'saisie']);
  // Production détaillée : colonne « dp » par générateur, le plus résistant fixe la boucle commune
  const dm = Sc.dimensionner(pid({ generateurs: [{ rep: 'CH1', type: 'chaudiere-cond', P: 100, role: 'base' }, { rep: 'PAC1', type: 'pac-air', P: 80, role: 'releve', dp: 55 }] }));
  assert.deepStrictEqual(dm.multi.map(x => [x.dpEau, x.dpSrc]), [[10, 'forfait'], [55, 'saisie']]);
  assert.strictEqual(dm.prod.dpGen, 55);
  // Calcul global : la boucle de production reprend la valeur saisie et l'indique
  const ch = nn('pid', 'Chaufferie', { dpGen: 25 });
  const b = I.hydrauliqueGlobal({ notes: [ch] }).boucles.find(x => x.type === 'production');
  assert.strictEqual(b.dp, 31);
  assert.match(b.detail, /25,0 kPa \(saisie\)/);
  assert.match(b.detail, /bouteille 1,0 kPa \(forfait\)/);
  // Tableau des pertes de charge avec la colonne « Origine »
  const t = N.calculer('pid', ch.entrees).tableaux.find(x => /Pertes de charge de la production/.test(x.titre));
  assert.ok(t.lignes.some(l => l[1] === 'Générateur côté eau' && l[3] === 'saisie'));
});

test('A1 — échangeurs (sous-station, découplage, circuit), vanne primaire par Kvs et reprise de la fiche du registre', () => {
  // Sous-station : 20 + 20 + 5 = 45 kPa par défaut ; ΔP primaire saisie et Kvs de la vanne primaire
  const ss = { generateur: 'echangeur', nGen: '1', Pgen: 300, reseau: 'ch-70-50', bouteille: 'oui', regimePrim: '90/70', circuits: [{ rep: 'R', emetteur: 'radiateurs', P: 200, regulation: '3v', L: 50 }] };
  assert.strictEqual(Sc.primaireAmont(pid(ss), Sc.dimensionner(pid(ss))).dp, 45);
  const e2 = pid({ ...ss, dpEchPrim: 30, kvsVannePrim: 10 }), pa = Sc.primaireAmont(e2, Sc.dimensionner(e2));
  const Q = 200 / (1.163 * 20);
  proche(pa.postes[1][1], (Q / 10) ** 2 * 100, 0.01);
  assert.deepStrictEqual(pa.postes.map(p => p[2]), ['saisie', 'saisie', 'forfait']);
  proche(pa.dp, 30 + (Q / 10) ** 2 * 100 + 5, 0.01);
  // Le circuit amont reprend ces pertes de charge (réseau annexe = schéma aval)
  const sst = nn('pid', 'Sous-station', { ...ss, dpEchPrim: 30, kvsVannePrim: 10 }), chf = nn('pid', 'Chaufferie', { reseau: 'ch-90-70', generateur: 'chaudiere-cond', nGen: '1', Pgen: 400,
    circuits: [{ rep: 'SST', emetteur: 'radiateurs', P: 1, regulation: 'direct', L: 80, annexe: sst.id }] });
  chf.entrees.reseau = 'perso'; chf.entrees.Tdep = 90; chf.entrees.Tret = 70;
  const et = { notes: [chf, sst] };
  proche(L.resoudre(et, chf).entrees.circuits[0].dpAnnexe, Math.round(pa.dp * 10) / 10, 0.01);
  // Échangeur de découplage : côté secondaire saisi pour la pompe PECH2
  const dE = pid({ bouteille: 'echangeur', pompeEchSec: 'ajouter', dpEchSec: 12 });
  const pe = Sc.pompesProduction(dE, Sc.dimensionner(dE)).find(p => p.cle === 'PECH2');
  assert.strictEqual(pe.dp, 17);
  // Échangeur de circuit « 30/15 » : primaire dans la pompe primaire, secondaire dans la HMT du circuit
  const base = { circuits: [{ rep: 'E', emetteur: 'radiateurs', P: 80, regime: '60/45', regulation: 'echangeur', L: 30 }] };
  const c0 = Sc.dimensionner(pid(base)).circuits[0], c1 = Sc.dimensionner(pid({ circuits: [{ ...base.circuits[0], dpEch: '30/15' }] })).circuits[0];
  assert.strictEqual(c1.prim.dp - c0.prim.dp, 10 + (c1.dpV - c0.dpV));
  assert.ok(c1.hmt < c0.hmt, 'secondaire 15 kPa < forfait 20 kPa');
  assert.deepStrictEqual([c1.dpEchC.p, c1.dpEchC.s, c1.dpEchC.src], [30, 15, 'saisie']);
  // Fiche du générateur : ΔP côté eau lue, reportée dans « dpGen » au placement, origine « fiche »
  const f = FE.lire(['ACME Chaudière CX 200', 'Puissance utile 200 kW', 'Perte de charge côté eau : 18 kPa']);
  assert.strictEqual(f.valeurs.dpEau, 18);
  assert.ok(FE.champs('pid', f.valeurs).some(c => c.k === 'dpGen' && c.val === 18));
  const p = nn('pid', 'Chaufferie'), et2 = { notes: [p], equipements: [] };
  const x = R.ajouter(et2, { type: 'generateur', fabricant: 'ACME', reference: 'CX 200', valeurs: f.valeurs });
  R.placer(et2, x, `pid:${p.id}`);
  assert.strictEqual(p.entrees.dpGen, 18);
  const dF = Sc.dimensionner(p.entrees);
  assert.deepStrictEqual([dF.prod.gens[0].dp.v, dF.prod.gens[0].dp.src], [18, 'fiche']);
  // Générateur d'une production détaillée relié au registre : puissance et ΔP reprises sur la ligne
  p.entrees.generateurs = [{ rep: 'G1', type: 'chaudiere-cond', P: 100, role: 'base', eq: x.id }];
  R.propager(et2);
  assert.deepStrictEqual([p.entrees.generateurs[0].P, p.entrees.generateurs[0].dp], [200, 18]);
  assert.strictEqual(Sc.dimensionner(p.entrees).multi[0].dpSrc, 'fiche');
});

test('A2 — pompes primaires, d\'échangeur et de récupération retenues : point sur la courbe, état dans le calcul global', () => {
  const e = pid({ nGen: '2', Pgen: 150, bouteille: 'oui' }), d = Sc.dimensionner(e);
  const pp = Sc.pompesProduction(e, d).find(p => p.cle === 'PP');
  assert.strictEqual(pp.etat, 'choisir');
  proche(pp.Q, d.Qg, 1e-9);
  // Pompe suffisante, puis insuffisante (courbe trop basse)
  const ok = pid({ ...e, pompesFab: [{ circuit: 'PP', ref: 'ACME P1', courbe: courbe(pp.Q * 1.6, pp.hmt * 1.3) }] });
  const r = N.calculer('pid', ok);
  const t = r.tableaux.find(x => /Pompes de production/.test(x.titre));
  assert.ok(t.lignes.some(l => l[0] === 'PP' && /OK|surdimensionnée/.test(l[7])));
  assert.ok(r.alertes.some(a => /^PP \(/.test(a.texte) && a.niveau !== 'erreur'));
  const ko = pid({ ...e, pompesFab: [{ circuit: 'PP', ref: 'ACME P0', courbe: courbe(pp.Q * 1.2, pp.hmt * 0.5) }] });
  assert.ok(N.calculer('pid', ko).alertes.some(a => a.niveau === 'erreur' && /PP .*insuffisante/.test(a.texte)));
  // Calcul global : la boucle de production prend l'état de la pompe retenue
  const ch = nn('pid', 'Chaufferie', ok), chKo = nn('pid', 'Chaufferie', ko);
  assert.ok(['ok', 'sur'].includes(I.hydrauliqueGlobal({ notes: [ch] }).boucles.find(b => b.type === 'production').etat));
  const hk = I.hydrauliqueGlobal({ notes: [chKo] });
  assert.strictEqual(hk.boucles.find(b => b.type === 'production').etat, 'ko');
  assert.ok(I.controles({ notes: [chKo] }).some(a => a.niveau === 'erreur' && /insuffisante/.test(a.texte)));
  // Production détaillée : PP1, PP2 ; repli sur la ligne « PP » commune
  const em = pid({ generateurs: [{ rep: 'G1', type: 'chaudiere-cond', P: 100 }, { rep: 'G2', type: 'chaudiere-cond', P: 100, role: 'releve' }] });
  const lm = Sc.pompesProduction(em, Sc.dimensionner(em));
  assert.deepStrictEqual(lm.map(p => p.cle), ['PP1', 'PP2']);
  const em2 = pid({ ...em, pompesFab: [{ circuit: 'PP', courbe: courbe(10, 8) }] });
  assert.ok(Sc.pompesProduction(em2, Sc.dimensionner(em2)).every(p => p.pf));
  // Sous-station : PECH1 et PECH2 ajoutées, contrôlées dans le calcul global
  const ss = nn('pid', 'SST', { generateur: 'echangeur', nGen: '1', Pgen: 200, reseau: 'ch-70-50', bouteille: 'oui', pompeEchPrim: 'ajouter', pompeEchSec: 'ajouter',
    pompesFab: [{ circuit: 'PECH2', ref: 'ACME S', courbe: courbe(20, 6) }], circuits: [{ rep: 'R', emetteur: 'radiateurs', P: 150, regulation: '3v', L: 40 }] });
  const ch2 = nn('pid', 'Chaufferie', { reseau: 'ch-80-60', generateur: 'chaudiere-cond', nGen: '1', Pgen: 300, circuits: [{ rep: 'SST', emetteur: 'radiateurs', P: 1, regulation: 'direct', L: 60, annexe: ss.id }] });
  const hg = I.hydrauliqueGlobal({ notes: [ch2, ss] });
  const sec = hg.boucles.find(b => b.type === 'secondaire'), prim = hg.boucles.find(b => b.type === 'primaire' && /sous-station/.test(b.pompe));
  assert.ok(['ok', 'sur'].includes(sec.etat), sec.etatLibelle);
  assert.strictEqual(prim.etat, 'choisir');
  // Récupération sur groupe froid : PREC dans le tableau des pompes
  const gf = pid({ reseau: 'eg-7-12', generateur: 'gf-air', nGen: '1', Pgen: 200, recupGf: 'totale', circuits: [{ rep: 'VC', emetteur: 'ventilo', P: 150, regulation: '2v', L: 100 }] });
  const prec = Sc.pompesProduction(gf, Sc.dimensionner(gf)).find(p => p.cle === 'PREC');
  proche(prec.Q, Sc.recuperation(gf, Sc.dimensionner(gf)).P / (1.163 * 5), 1e-6);
  // Les clés proposées dans le tableau des pompes retenues
  assert.ok(N.TYPES.pid.champs.find(c => c.k === 'pompesFab').colonnes[0].o(gf).some(([k]) => k === 'PREC'));
});

test('A3 — aéroréfrigérant d\'un groupe froid eau/eau : puissance, pompe, électricité, points GTB, analyse fonctionnelle, nomenclature', () => {
  const e = pid({ reseau: 'eg-7-12', generateur: 'gf-eau', nGen: '1', Pgen: 300, evacuation: 'aero', eerEvac: 4, bouteille: 'oui',
    circuits: [{ rep: 'CTA', emetteur: 'cta', P: 250, regulation: '3v', L: 60 }] });
  const d = Sc.dimensionner(e);
  assert.ok(!d.forage, 'pas de forage quand le condenseur est refroidi par aéroréfrigérant');
  assert.strictEqual(d.evac.mode, 'condenseur');
  proche(d.evac.P, 300 * 1.25, 1e-9);
  proche(d.evac.Pvent, 300 * 1.25 * 0.025, 1e-9);
  assert.deepStrictEqual([d.evac.Tc, d.evac.Tf], [45, 40]);
  assert.match(d.evac.fluideLib, /glycol/);
  assert.ok(Sc.pompesProduction(e, d).some(p => p.cle === 'PEV' && Math.abs(p.Q - d.evac.Q) < 1e-9));
  const r = N.calculer('pid', e);
  assert.ok(r.tableaux.some(t => /Évacuation de la chaleur/.test(t.titre)));
  assert.ok(r.hypotheses.some(h => /2,5 %/.test(h)));
  const blocs = r.onglets.find(o => o.titre === 'Régulation').blocs, af = blocs.find(b => b.titre === 'Analyse fonctionnelle').liste.join('\n');
  assert.match(af, /température de condensation/); assert.match(af, /By-pass hivernal/); assert.match(af, /Antigel/);
  const pts = blocs.find(b => /Liste des points/.test(b.titre)).tableau.lignes.map(l => `${l[0]}:${l[2]}`);
  ['AR:SA', 'AR:STOR', 'PEV:STOR', 'TEV:EA', 'VBP:SA'].forEach(p => assert.ok(pts.includes(p), p));
  // Lignes électriques : ventilateurs à variateur, pompe, sonde, vanne de by-pass
  const n = nn('pid', 'Eau glacée', e), lignes = E.equipementsEtude({ notes: [n] }, L);
  const ar = lignes.find(x => x.rep === 'AR');
  assert.ok(ar && ar.type === 'ventilateur' && ar.depart === 'variateur' && ar.regulation === 'var');
  ['PEV', 'TEV', 'VBP'].forEach(rp => assert.ok(lignes.some(x => x.rep === rp), rp));
  // Nomenclature
  const calc = x => L.calculer({ notes: [n] }, x);
  const nm = Nm.lignes({ notes: [n] }, n, calc).map(x => x.rep);
  ['AR', 'PEV', 'VBP', 'TEV'].forEach(rp => assert.ok(nm.includes(rp), rp));
  // Tour : appoint d'eau, traitement, approche sur le bulbe humide
  const dt = Sc.dimensionner(pid({ ...e, evacuation: 'tour' }));
  assert.ok(dt.alertes.some(a => /légionellose/.test(a.texte)));
  assert.deepStrictEqual([dt.evac.Tc, dt.evac.Tf, dt.evac.Text], [35, 30, 24]);
  // Sans le champ : rien ne change (forage conservé pour un groupe eau/eau sur nappe)
  assert.ok(Sc.dimensionner(pid({ ...e, evacuation: '' })).forage);
});

test('A3 — modèle « boucle d\'eau tempérée » avec aéroréfrigérant', () => {
  const m = M.INTEGRES.find(x => x.id === 'boucle-eau-temperee');
  assert.ok(!JSON.stringify(m).includes('reste à ajouter'));
  let j = 0; const notes = M.instancier(m, () => `b${++j}`), et = { notes }, boucle = notes[0];
  const r = L.calculer(et, boucle);
  assert.ok(!r.alertes.some(a => a.niveau === 'erreur'), r.alertes.filter(a => a.niveau === 'erreur').map(a => a.texte).join(' ; '));
  const d = Sc.dimensionner(L.resoudre(et, boucle).entrees);
  assert.strictEqual(d.evac.mode, 'boucle'); assert.strictEqual(d.evac.P, 150);
  assert.ok(I.hydrauliqueGlobal(et).boucles.some(b => b.type === 'refroidissement' && b.pompe === 'PEV'));
});

test('A4 — change-over : puissance froid par générateur et circuit direct compté en chaud et en froid', () => {
  const gens = [{ rep: 'PAC1', type: 'pac-rev', P: 100, Pf: 80, role: 'base' }, { rep: 'PAC2', type: 'pac-rev', P: 100, role: 'base' }];
  const e = pid({ reseau: 'co', generateurs: gens, bouteille: 'oui', circuits: [{ rep: 'VC', emetteur: 'ventilo', P: 150, Pf: 170, regulation: '2v', L: 80 }] });
  const d = Sc.dimensionner(e);
  assert.strictEqual(d.co.dC.Pprod, 200);
  assert.strictEqual(d.co.dF.Pprod, 180);
  // Sans « Pf » : la puissance froid reste P (comme avant)
  assert.strictEqual(Sc.dimensionner(pid({ ...e, generateurs: gens.map(({ Pf, ...x }) => x) })).co.dF.Pprod, 200);
  // Chaudière + groupe froid : chacun dans sa saison, pas d'erreur de compatibilité
  const mix = pid({ ...e, generateurs: [{ rep: 'CH', type: 'chaudiere-cond', P: 200 }, { rep: 'GF', type: 'gf-air', P: 200, Pf: 190 }] });
  const dm = Sc.dimensionner(mix);
  assert.deepStrictEqual([dm.co.dC.Pprod, dm.co.dF.Pprod], [200, 190]);
  assert.ok(!dm.alertes.some(a => a.niveau === 'erreur' && /incompatible|Change-over : choisir/.test(a.texte)));
  // Installation : deux consommateurs (chaud et froid) pour le circuit change-over direct
  const n = nn('pid', 'PAC change-over', e), cs = I.consommateurs({ notes: [n] });
  const c = cs.filter(x => x.source.id === n.id);
  assert.deepStrictEqual(c.map(x => [x.saison, x.P]), [['chaud', 150], ['froid', 170]]);
  assert.ok(c.every(x => x.raccordements.length === 1 && !x.raccordements[0].incompatible));
  // Puissance froid absente : signalée
  const n2 = nn('pid', 'PAC sans froid', { ...e, circuits: [{ rep: 'VC', emetteur: 'ventilo', P: 150, regulation: '2v', L: 80 }] });
  assert.ok(I.controles({ notes: [n2] }).some(a => /puissance froid non renseignée/.test(a.texte)));
});

test('A5 — redimensionnement des vannes pour une autorité ≥ 0,5', () => {
  const e = pid({ circuits: [{ rep: 'VC', emetteur: 'ventilo', P: 120, regulation: '2v', L: 200 }, { rep: 'Rad', emetteur: 'radiateurs', P: 60, regulation: '3v', L: 50 }] });
  const d0 = Sc.dimensionner(e);
  assert.ok(d0.circuits[0].autorite < 0.5);
  const mods = Sc.redimensionnerVannes(e);
  assert.deepStrictEqual(mods.map(m => m.rep), ['VC']);
  const m = mods[0];
  assert.ok(m.kvs <= m.kvCible && m.autoriteApres >= 0.5 && m.dpApres > m.dpAvant);
  assert.ok(m.vanne, 'vanne du catalogue proposée');
  // Rien n'est modifié tant qu'on n'applique pas ; appliqué : Kvs retenu, autorité ≥ 0,5, pompe recalculée
  assert.strictEqual(e.circuits[0].kvsVanne, undefined);
  assert.strictEqual(Sc.appliquerVannes(e, mods), 1);
  const d1 = Sc.dimensionner(e), c1 = d1.circuits[0];
  assert.strictEqual(c1.kvs, m.kvs);
  assert.ok(c1.autorite >= 0.5);
  assert.ok(c1.hmt > d0.circuits[0].hmt);
  proche(d1.circuits[1].hmt, d0.circuits[1].hmt, 1e-9);
  assert.deepStrictEqual(Sc.redimensionnerVannes(e), []);
  assert.match(N.calculer('pid', e).tableaux[0].lignes[0][8], /retenu/);
});
