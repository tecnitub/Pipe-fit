// Schéma de principe avancé : productions multiples et hétérogènes, montages hydrauliques par circuit, ballons comme
// éléments ; repères uniques entre plusieurs schémas, libellés de la production de froid, batterie électrique modulée
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta'); require('../etudes/public/js/equilibrage'); require('../etudes/public/js/industriel'); require('../etudes/public/js/aeraulique-schema'); require('../etudes/public/js/terminaux');
const Sc = require('../etudes/public/js/schema');
global.Notes = N; global.Schema = Sc;
const E = require('../etudes/public/js/electricite');
const L = require('../etudes/public/js/liens');
const Nm = require('../etudes/public/js/nomenclature');
const M = require('../etudes/public/js/metre');
const R = require('../etudes/public/js/regulation');
const Gtb = require('../etudes/public/js/gtb');

let k = 0;
const note = (type, entrees = {}, titre) => ({ id: `a${++k}`, type, titre: titre || N.TYPES[type].titre, entrees: { ...N.defauts(type), ...entrees } });
const af = r => r.onglets.find(o => o.titre === 'Régulation').blocs.find(b => b.titre === 'Analyse fonctionnelle').liste.join('\n');
const points = r => r.onglets.find(o => o.titre === 'Régulation').blocs.find(b => /Liste des points/.test(b.titre)).tableau.lignes;
const feuille = (et, n) => { const calc = x => L.calculer(et, x); calc.entrees = x => L.resoudre(et, x).entrees; return Nm.feuilles(et, n, calc)[0].lignes; };
const HETERO = [{ type: 'pac-air', P: 120, role: 'base' }, { type: 'chaudiere-cond', P: 150, role: 'appoint' }, { type: 'chaudiere-cond', P: 150, role: 'secours', pompe: 'integree' }];

test('rétro-compatibilité : listes vides = résultats identiques à une étude sans les nouveaux champs', () => {
  const base = N.defauts('pid'); delete base.generateurs; delete base.ballons;
  ['oui', 'echangeur', 'ballon', 'non'].forEach(bouteille => {
    const a = N.calculer('pid', { ...base, bouteille }), b = N.calculer('pid', { ...base, bouteille, generateurs: [], ballons: [] });
    assert.deepStrictEqual(b.valeurs, a.valeurs); assert.deepStrictEqual(b.resume, a.resume); assert.strictEqual(b.schema, a.schema);
    assert.ok(!a.valeurs.generateurs && !a.valeurs.ballons);
  });
  // Montages historiques : HMT, Kvs et débit au collecteur inchangés (vanne 3 voies : autorité ≥ 0,5, sans alerte)
  const d = Sc.dimensionner(N.defauts('pid'));
  assert.deepStrictEqual(d.circuits.map(c => c.reg), ['3v', '3v', '3v', 'direct']);
  assert.ok(d.circuits[0].autorite >= 0.5 && d.circuits[3].autorite === null);
  assert.ok(!d.alertes.some(a => /autorité/.test(a.texte)));
});

test('productions multiples : puissance hors secours, débit par générateur, plus gros à l\'arrêt, compatibilité', () => {
  const e = { ...N.defauts('pid'), generateurs: HETERO };
  const d = Sc.dimensionner(e), r = N.calculer('pid', e);
  assert.strictEqual(d.multi.length, 3);
  assert.strictEqual(d.Pprod, 270);
  assert.deepStrictEqual(d.multi.map(x => x.rep), ['PAC1', 'G2', 'G3']);
  assert.ok(Math.abs(d.multi[0].Q - 120 * 1000 / (d.f.rho * d.f.cp * 20) * 3600) < 1e-9);
  assert.ok(Math.abs(d.Qp - d.multi[0].Q - d.multi[1].Q) < 1e-9);
  assert.strictEqual(d.multi[2].pp, false); assert.ok(d.multi[0].pp && d.multi[1].pp);
  assert.ok(r.alertes.some(a => /Plus gros générateur \(G2/.test(a.texte)));
  assert.match(r.resume.find(l => l[0] === 'Production')[1], /PAC1 .*\(base\) \+ G2 .*\(appoint\) \+ G3 .*\(secours\) = 270 kW hors secours/);
  assert.ok(r.tableaux.find(t => t.titre === 'Production').entetes.includes('Rôle'));
  assert.match(r.schema, /PAC1 · Base/); assert.match(r.schema, /G3 · Secours/); assert.match(r.schema, /stroke-dasharray="6 3"/);
  // Production insuffisante (hors secours)
  assert.ok(N.calculer('pid', { ...e, generateurs: [{ type: 'chaudiere-cond', P: 100 }, { type: 'chaudiere-cond', P: 300, role: 'secours' }] }).alertes.some(a => a.niveau === 'erreur' && /Production insuffisante/.test(a.texte)));
  // Groupe froid dans un schéma chaud : erreur, sauf en récupération de chaleur
  const gf = N.calculer('pid', { ...e, generateurs: [...HETERO, { type: 'gf-air', P: 40, role: 'base' }] });
  assert.ok(gf.alertes.some(a => a.niveau === 'erreur' && /GF4 : groupe froid air\/eau incompatible/.test(a.texte)));
  const rec = N.calculer('pid', { ...e, generateurs: [...HETERO, { type: 'gf-air', P: 40, role: 'recuperation' }] });
  assert.ok(!rec.alertes.some(a => a.niveau === 'erreur') && rec.alertes.some(a => /récupération de chaleur/.test(a.texte)));
  // Chaudière dans un schéma d'eau glacée : erreur
  assert.ok(N.calculer('pid', { ...e, reseau: 'eg-7-12', generateurs: [{ type: 'gf-air', P: 300 }, { type: 'chaudiere-gaz', P: 100, role: 'appoint' }] }).alertes.some(a => a.niveau === 'erreur' && /chaudière gaz basse température incompatible/.test(a.texte)));
});

test('productions multiples : électricité, régulation (priorité, bivalence), GTB, nomenclature, métré', () => {
  const p = note('pid', { generateurs: HETERO }, 'Chaufferie'), et = { notes: [p] };
  const eqs = E.equipementsEtude(et, L);
  const pac = eqs.find(x => x.rep === 'PAC1'), g2 = eqs.find(x => x.rep === 'G2');
  assert.strictEqual(pac.P, 40); assert.strictEqual(pac.type, 'pac'); assert.strictEqual(g2.P, 0.5); assert.strictEqual(g2.role, 'appoint');
  assert.ok(eqs.some(x => x.rep === 'G3'));
  assert.deepStrictEqual(eqs.filter(x => /^PP\d/.test(x.rep)).map(x => x.rep), ['PP1', 'PP2']);
  const r = L.calculer(et, p), txt = af(r);
  assert.match(txt, /ordre de priorité base \(PAC1\) → appoint \(G2\) ; secours \(G3\)/);
  assert.match(txt, /Bivalence parallèle : au-dessous de -3 °C extérieur/);
  assert.ok(points(r).some(l => l[0] === 'G2' && /Autorisation/.test(l[1])));
  const ctx = R.contexte(et, L).installations[0];
  assert.ok(ctx.params.some(x => /Température extérieure de bivalence/.test(x.libelle) && x.valeur === -3));
  assert.ok(ctx.params.some(x => /Relève \/ appoint : enclenchement/.test(x.libelle) && x.valeur === 3));
  const lg = Gtb.logique(eqs.filter(x => ['pac', 'generateur'].includes(x.type)), { installations: [] });
  assert.ok(lg.some(l => /Ordre de priorité : base \(PAC1\) → appoint \(G2\) ; secours \(G3\)/.test(l[2])));
  const nom = feuille(et, p);
  assert.ok(nom.some(l => l[0] === 'PAC1' && /120 kW \(base\)/.test(l[3])) && nom.some(l => l[0] === 'G3' && /secours/.test(l[3])));
  const mt = M.metre(et);
  assert.ok(mt.some(x => x.cle === 'gen|pac-air|120') && mt.find(x => x.cle === 'gen|chaudiere-cond|150').qte === 2);
  // Réglementation : la chaufferie porte sur les chaudières (300 kW), les fluides frigorigènes sur la PAC
  const regl = r.onglets.find(o => o.titre === 'Réglementation').blocs;
  assert.ok(regl.some(b => b.titre === 'Local et combustible') && regl.some(b => b.titre === 'Fluides frigorigènes'));
});

test('montages hydrauliques par circuit : pompes, vanne et autorité, by-pass, dessin, analyse fonctionnelle', () => {
  const circuits = [
    { rep: 'Inj3', emetteur: 'radiateurs', P: 60, regime: '60/45', regulation: 'injection3', L: 50 },
    { rep: 'Inj2', emetteur: 'radiateurs', P: 40, regime: '55/40', regulation: 'injection2', L: 40 },
    { rep: 'Dech', emetteur: 'cta', P: 50, regime: '', regulation: 'decharge', L: 30 },
    { rep: 'Bout', emetteur: 'aerotherme', P: 30, regime: '', regulation: 'bouteille', L: 30 },
    { rep: 'Ech', emetteur: 'plancher', P: 30, regime: '35/30', regulation: 'echangeur', L: 30 },
    { rep: 'V2', emetteur: 'ventilo', P: 40, regime: '', regulation: '2v', L: 60 }];
  const p = note('pid', { nGen: '2', Pgen: 200, circuits }, 'Chaufferie'), et = { notes: [p] };
  const d = Sc.dimensionner(p.entrees), r = N.calculer('pid', p.entrees), c = Object.fromEntries(d.circuits.map(x => [x.rep, x]));
  // Pompe primaire de circuit pour l'injection 3 voies, la bouteille et l'échangeur
  assert.deepStrictEqual(d.circuits.filter(x => x.prim).map(x => x.rep), ['Inj3', 'Bout', 'Ech']);
  // Débit au collecteur : injection = mélange ; échangeur = écart réseau / retour secondaire + pincement
  assert.ok(c.Inj3.Qcoll < c.Inj3.Q && c.Inj2.Qcoll < c.Inj2.Q && c.Ech.Qcoll < c.Ech.Q);
  assert.ok(Math.abs(c.Dech.Qcoll - c.Dech.Q) < 1e-9);
  // Vannes : autorité ≥ 0,5 pour les nouveaux montages ; aucune vanne sur la bouteille
  ['Inj3', 'Inj2', 'Dech', 'Ech'].forEach(rep => assert.ok(c[rep].autorite >= 0.5 && c[rep].kvs > 0, rep));
  assert.strictEqual(c.Bout.autorite, null); assert.strictEqual(c.Bout.kvs, null);
  assert.ok(c.V2.autorite < 0.5 && r.alertes.some(a => /V2 : autorité de la vanne/.test(a.texte)));
  assert.ok(c.V2.bypass && r.alertes.some(a => /V2 : vanne 2 voies — by-pass différentiel/.test(a.texte)));
  // Régime différent sans mélange : alerte pour la décharge seulement si le régime diffère (ici non) ; l'échangeur accepte 35/30
  assert.ok(!r.alertes.some(a => /^(Ech|Inj3|Inj2) : régime/.test(a.texte)));
  assert.ok(r.tableaux[0].entetes.includes('Autorité'));
  assert.ok(r.tableaux.some(t => t.titre === 'Montages hydrauliques des circuits'));
  ['Injection V3V', 'Injection V2V', 'Décharge V3V', 'Bouteille de circuit', 'Échangeur de circuit', 'V2V débit variable', 'PCP1', 'by-pass neutre', 'BP diff.'].forEach(t => assert.ok(r.schema.includes(t), t));
  const txt = af(r);
  assert.match(txt, /injection par vanne 3 voies : la pompe primaire PCP/); assert.match(txt, /montage en décharge/); assert.match(txt, /échangeur de circuit : la vanne 2 voies du primaire/);
  assert.ok(points(r).some(l => l[0] === 'PCP4') && !points(r).some(l => l[0] === 'V4'));
  // Électricité : pompes primaires de circuit, pas de vanne sur la bouteille
  const eqs = E.equipementsEtude(et, L);
  assert.deepStrictEqual(eqs.filter(x => /^PCP/.test(x.rep)).map(x => x.rep), ['PCP1', 'PCP4', 'PCP5']);
  assert.ok(!eqs.some(x => x.rep === 'V4') && eqs.some(x => x.rep === 'V5'));
  assert.strictEqual(R.application(eqs.find(x => x.rep === 'PCP1'), { [p.id]: 'pid' }), 'chauffage');
  // Nomenclature : by-pass différentiel, bouteille et échangeur de circuit, pompes primaires
  const nom = feuille(et, p);
  ['BP6', 'BD4', 'EP5', 'PCP1'].forEach(rep => assert.ok(nom.some(l => l[0] === rep), rep));
  // Injection 2 voies derrière la bouteille de la production : alerte
  assert.ok(r.alertes.some(a => /Inj2 : injection 2 voies derrière une bouteille/.test(a.texte)));
  // Échangeur de circuit trop chaud : erreur
  assert.ok(N.calculer('pid', { ...p.entrees, circuits: [{ rep: 'X', emetteur: 'radiateurs', P: 30, regime: '69/50', regulation: 'echangeur', L: 10 }] }).alertes.some(a => a.niveau === 'erreur' && /X : départ secondaire/.test(a.texte)));
});

test('ballons comme éléments : volume calculé, dessin, sondes, nomenclature, analyse fonctionnelle', () => {
  const ballons = [{ rep: 'BT1', fonction: 'tampon' }, { rep: 'BS1', fonction: 'stockage', duree: 1, position: 'circuit:CTA atelier' },
    { rep: 'BE1', fonction: 'ecs', V: 500, position: 'circuit:Ballon ECS' }, { rep: 'BD1', fonction: 'decouplage', piquages: '2' }];
  const p = note('pid', { ballons, bouteille: 'non' }, 'Chaufferie'), et = { notes: [p] };
  const d = Sc.dimensionner(p.entrees), b = Object.fromEntries(d.ballons.map(x => [x.rep, x]));
  assert.strictEqual(b.BT1.Vcalc, 10 * d.Pprod); assert.ok(b.BT1.V >= b.BT1.Vcalc && !b.BT1.saisi);
  assert.ok(Math.abs(b.BS1.Vcalc - 80 * 3600 / (4.186 * 20)) < 1e-6); assert.strictEqual(b.BS1.circuit, 'CTA atelier');
  assert.deepStrictEqual(b.BS1.sondes, ['haut', 'milieu', 'bas']);
  assert.strictEqual(b.BE1.V, 500); assert.deepStrictEqual(b.BT1.sondes, ['haut', 'bas']);
  const r = N.calculer('pid', p.entrees);
  assert.ok(r.alertes.some(a => /BD1 : un ballon de découplage demande 4 piquages/.test(a.texte)));
  assert.ok(r.tableaux.some(t => t.titre === 'Ballons') && r.resume.some(l => l[0] === 'Ballon BS1'));
  assert.match(r.schema, />Ballons</); assert.match(r.schema, />BS1</);
  assert.ok(r.valeurs.volume > N.calculer('pid', { ...p.entrees, ballons: [] }).valeurs.volume);
  const txt = af(r);
  assert.match(txt, /Ballon BS1 .*stratification préservée/); assert.match(txt, /Ballon BE1 .*choc thermique/);
  assert.ok(points(r).some(l => l[0] === 'BS1-TM'));
  const eqs = E.equipementsEtude(et, L);
  assert.deepStrictEqual(eqs.filter(x => /^BS1-T/.test(x.rep)).map(x => x.rep), ['BS1-TH', 'BS1-TM', 'BS1-TB']);
  assert.strictEqual(eqs.filter(x => /^BT1-T/.test(x.rep)).length, 2);
  const nom = feuille(et, p);
  assert.ok(nom.some(l => l[0] === 'BS1' && /stockage/.test(l[3])));
  assert.ok(M.metre(et).some(x => /^ballon\|stockage\|/.test(x.cle)));
  // Les champs historiques restent indépendants : ballon tampon en série + ballon élément
  const d2 = Sc.dimensionner({ ...p.entrees, tampon: 'oui', ballons: [{ fonction: 'stockage', V: 1000 }] });
  assert.ok(d2.tampon && d2.tampon.position === 'retour' && d2.ballons[0].V === 1000);
  // Renommer un circuit suit la position des ballons
  L.renommerCircuit(et, p, 1, 'CTA nord');
  assert.strictEqual(p.entrees.ballons[1].position, 'circuit:CTA nord');
});

test('plusieurs schémas : repères uniques par schéma, sonde extérieure unique', () => {
  const ch = note('pid', {}, 'Chaufferie'), ss = note('pid', { generateur: 'echangeur', nGen: '1', Pgen: 300 }, 'Sous-station');
  const seul = E.equipementsEtude({ notes: [ch] }, L).map(x => x.rep);
  const eqs = E.equipementsEtude({ notes: [ch, ss] }, L), reps = eqs.map(x => x.rep);
  assert.deepStrictEqual(reps.slice(0, seul.length), seul);
  assert.strictEqual(new Set(reps).size, reps.length);
  assert.strictEqual(reps.filter(x => x === 'TE').length, 1);
  ['PC1-N2', 'V1-N2', 'TD1-N2', 'TDG-N2', 'PR-N2', 'PMQ-N2'].forEach(x => assert.ok(reps.includes(x), x));
});

test('analyse fonctionnelle : sous-station et échangeur, libellés de découplage', () => {
  const ss = N.calculer('pid', { ...N.defauts('pid'), generateur: 'echangeur', nGen: '2' }), t = af(ss);
  assert.ok(!/Pompes primaires asservies à leur générateur/.test(t));
  const ech = af(N.calculer('pid', { ...N.defauts('pid'), bouteille: 'echangeur' }));
  assert.ok(!/bouteille de découplage/.test(ech)); assert.match(ech, /en aval de l'échangeur/);
  const non = af(N.calculer('pid', { ...N.defauts('pid'), bouteille: 'non', reseau: 'eg-7-12', generateur: 'gf-air' }));
  assert.ok(!/bouteille/.test(non.split('\n')[0])); assert.match(non, /sur le collecteur \(départ commun\)/);
  assert.match(af(N.calculer('pid', N.defauts('pid'))), /mesurée en aval de la bouteille de découplage/);
});

test('groupe froid repéré GF, sondes générales rattachées à la production de froid (préfixe FR_)', () => {
  const fr = note('pid', { reseau: 'eg-7-12', generateur: 'gf-air', nGen: '2', Pgen: 150 }, 'Production de froid');
  const eqs = E.equipementsEtude({ notes: [fr] }, L);
  assert.deepStrictEqual(eqs.filter(x => x.type === 'pac').map(x => x.rep), ['GF1', 'GF2']);
  const tdg = eqs.find(x => x.rep === 'TDG');
  assert.match(tdg.designation, /\(production de froid\)/);
  assert.strictEqual(Gtb.installationPoint(['TDG', 'Mesure', 'EA', '', 'TM', '', `TDG — ${tdg.designation}`, 'Mesure', '', 'production']).prefixe, 'FR');
  // PAC : repère PAC inchangé
  assert.ok(E.equipementsEtude({ notes: [note('pid', { generateur: 'pac-air', nGen: '1' })] }, L).some(x => x.rep === 'PAC1'));
});

test('CTA : batterie chaude électrique principale modulée, préchauffage et appoint en tout-ou-rien', () => {
  const reg = batElec => E.equipementsEtude({ notes: [note('cta', { froid: 'aucune', batElec, PelBe: 12 })] }, L).find(x => /^BE-/.test(x.rep)).regulation;
  assert.strictEqual(reg('chaude'), 'mod');
  assert.strictEqual(reg('prechauffage'), 'tor');
  assert.strictEqual(reg('appoint'), 'tor');
});
