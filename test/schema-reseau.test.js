// Réseau arborescent placé dans le schéma de principe : circuit au nom du réseau, renommage suivi partout.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta'); require('../etudes/public/js/equilibrage'); require('../etudes/public/js/industriel'); require('../etudes/public/js/aeraulique-schema'); require('../etudes/public/js/electricite'); require('../etudes/public/js/terminaux');
const L = require('../etudes/public/js/liens');

test('le réseau nommé devient un circuit du schéma, son renommage suit', () => {
  const pid = { id: 'p', type: 'pid', titre: 'Chaufferie', entrees: { ...N.defauts('pid'), circuits: [{ rep: 'Radiateurs', emetteur: 'radiateurs', P: 50, regulation: '3v', L: 40 }], robinetterie: [] } };
  const arbo = { id: 'a', type: 'arbo', titre: 'Réseau bâtiment B', entrees: N.defauts('arbo') };
  const term = { id: 't', type: 'terminaux', titre: 'Terminaux', entrees: { appareils: [{ rep: 'R1', circuit: '' }] } };
  const elec = { id: 'e', type: 'elec', titre: 'Élec', entrees: { loisEau: [] } };
  const et = { notes: [pid, arbo, term, elec] };
  const r = L.relierAuSchema(et, arbo, 'p');
  assert.strictEqual(r.i, 1);
  assert.strictEqual(pid.entrees.circuits[1].rep, 'Réseau bâtiment B');
  assert.strictEqual(pid.entrees.circuits[1].annexe, 'a');
  assert.deepStrictEqual(L.circuitDeAnnexe(et.notes, arbo), { pid, i: 1 });
  // Puissance remontée du réseau dans le circuit
  const c = L.resoudre(et, pid).entrees.circuits[1];
  assert.ok(c.P > 0);
  // Références au circuit, puis renommage
  term.entrees.appareils[0].circuit = 'p|Réseau bâtiment B';
  pid.entrees.robinetterie.push({ rep: 'V1', circuit: 'Réseau bâtiment B' });
  elec.entrees.loisEau.push({ circuit: 'Réseau bâtiment B', base: 70 });
  assert.strictEqual(L.renommerCircuit(et, pid, 1, 'Bâtiment B'), 'Bâtiment B');
  assert.strictEqual(term.entrees.appareils[0].circuit, 'p|Bâtiment B');
  assert.strictEqual(pid.entrees.robinetterie[0].circuit, 'Bâtiment B');
  assert.strictEqual(elec.entrees.loisEau[0].circuit, 'Bâtiment B');
  // Nom déjà pris dans le schéma : rendu unique
  assert.strictEqual(L.renommerCircuit(et, pid, 1, 'Radiateurs'), 'Radiateurs (2)');
  // Relié à un circuit existant : l'ancien lien est retiré
  L.relierAuSchema(et, arbo, 'p', 0);
  assert.strictEqual(pid.entrees.circuits[0].annexe, 'a');
  assert.strictEqual(pid.entrees.circuits[1].annexe, undefined);
});

test('registre : un même équipement se place plusieurs fois (CTA, vase, ECS, générateurs)', () => {
  require('../etudes/public/js/schema'); global.Notes = N;
  const R = require('../etudes/public/js/registre');
  let k = 0; const nn = t => ({ id: `n${++k}`, type: t, titre: N.TYPES[t].titre, entrees: N.defauts(t) });
  const et = { notes: [nn('pid'), nn('cta')], equipements: [] };
  const cta = R.ajouter(et, { type: 'cta', fabricant: 'F', reference: 'C1', valeurs: {} });
  R.placer(et, cta, 'cta:n2', { qte: 1 }, nn); R.placer(et, cta, 'cta:n2', { qte: 2 }, nn);
  const ctas = et.notes.filter(n => n.type === 'cta');
  assert.strictEqual(ctas.length, 3);
  assert.ok(ctas.every(n => n.entrees.eq === cta.id));
  assert.strictEqual(new Set(ctas.map(n => n.titre)).size, 3);
  assert.strictEqual(new Set(ctas.map(n => n.id)).size, 3);
  const g = R.ajouter(et, { type: 'generateur', fabricant: 'F', reference: 'G1', valeurs: {} });
  R.placer(et, g, 'pid:n1', { qte: 1 }, nn); R.placer(et, g, 'pid:n1', { qte: 1 }, nn);
  assert.strictEqual(et.notes[0].entrees.nGen, '2');
  // Électricité et régulation : deux générateurs, deux CTA, une sonde par ballon ECS
  const E = require('../etudes/public/js/electricite');
  et.notes.push(nn('ecs'), nn('ecs'));
  const eqs = E.equipementsEtude(et, L);
  assert.strictEqual(eqs.filter(x => x.type === 'generateur').length, 2);
  assert.strictEqual(eqs.filter(x => /^VS-/.test(x.rep)).length, 3);
  assert.strictEqual(eqs.filter(x => /^TB-/.test(x.rep)).length, 2);
});

test('CTA à batterie à eau : alimentée par une branche du réseau arborescent (départ du schéma) ou par un circuit du schéma', () => {
  let k = 0; const nn = t => ({ id: `c${++k}`, type: t, titre: N.TYPES[t].titre, entrees: N.defauts(t) });
  const pid = nn('pid'), cta = nn('cta'), arbo = nn('arbo'); cta.titre = 'CTA salle';
  const et = { notes: [pid, cta, arbo] };
  const Pcta = L.calculer(et, cta).valeurs.Pchaud;
  // 1. Par l'arborescence, elle-même départ du schéma
  const libres = L.batteriesLibres(et, cta, arbo);
  assert.deepStrictEqual(libres.map(x => x.cle), [`${cta.id}:bc`]);
  const rep = L.brancherSurArbo(et, cta, arbo, libres[0].cle);
  const t = L.resoudre(et, arbo).entrees.troncons.find(x => x.rep === rep);
  assert.strictEqual(t.amont, 'C'); assert.strictEqual(Math.round(t.P), Math.round(Pcta));
  assert.deepStrictEqual(L.arbosDeCta(et, cta), [arbo]);
  assert.deepStrictEqual(L.batteriesLibres(et, cta, arbo), []);
  const P0 = L.calculer(et, arbo).valeurs.Ptot;
  const r = L.relierAuSchema(et, arbo, pid.id);
  assert.strictEqual(L.resoudre(et, pid).entrees.circuits[r.i].P, Math.round(P0 * 10) / 10);
  // Électricité : vannes des batteries à eau de la CTA (aucun circuit dédié ne les règle)
  const E = require('../etudes/public/js/electricite');
  assert.deepStrictEqual(E.equipementsEtude(et, L).filter(x => /^VB[CF]-/.test(x.rep)).map(x => x.rep).sort(), ['VBC-N2', 'VBF-N2']);
  // 2. Directement sur un circuit du schéma qui avait un bilan : la puissance est celle de la CTA
  const et2 = { notes: [nn('pid'), nn('cta'), nn('bilan')] }, p2 = et2.notes[0];
  p2.entrees.circuits[0].bilan = et2.notes[2].id;
  const r2 = L.relierAuSchema(et2, et2.notes[1], p2.id, 0);
  assert.strictEqual(L.resoudre(et2, p2).entrees.circuits[r2.i].P, Math.round(L.calculer(et2, et2.notes[1]).valeurs.Pchaud * 10) / 10);
});

test('CTA : batteries à eau (ou aucune) combinées à une batterie électrique', () => {
  require('../etudes/public/js/cta'); const E = require('../etudes/public/js/electricite'), Eq = require('../etudes/public/js/equilibrage');
  const cta = (froid, batElec, PelBe = '') => ({ id: 'k1', type: 'cta', titre: 'CTA', entrees: { ...N.defauts('cta'), froid, batElec, PelBe } });
  // Électrique seule : puissance de chauffe sur la batterie électrique, rien à raccorder au réseau d'eau
  const a = cta('aucune', 'chaude'), va = N.calculer('cta', a.entrees).valeurs, eta = { notes: [a] };
  assert.strictEqual(va.Pchaud, 0); assert.ok(va.Pbe > 0);
  assert.strictEqual(Eq.emetteursEtude(eta, 'chaud').length + Eq.emetteursEtude(eta, 'froid').length, 0);
  assert.deepStrictEqual(E.equipementsEtude(eta, L).filter(x => /^(BE|VB)/.test(x.rep)).map(x => [x.rep, x.P]), [['BE-N1', va.Pbe]]);
  // Chaude + froide à eau + préchauffage électrique : trois batteries
  const b = cta('oui', 'prechauffage', 6), etb = { notes: [b] };
  assert.deepStrictEqual(E.equipementsEtude(etb, L).filter(x => /^(BE|VB)/.test(x.rep)).map(x => x.rep).sort(), ['BE-N1', 'VBC-N1', 'VBF-N1']);
  assert.match(N.calculer('cta', b.entrees).synthese, /BC .* BF .* BE 6 kW/);
});

test('CTA : batterie chaude sur le réseau chaud, batterie froide sur le réseau froid', () => {
  const cta = { id: 'q1', type: 'cta', titre: 'CTA', entrees: N.defauts('cta') };
  const ch = { id: 'q2', type: 'arbo', titre: 'Chaud', entrees: N.defauts('arbo') }, fr = { id: 'q3', type: 'arbo', titre: 'Froid', entrees: { ...N.defauts('arbo'), saison: 'froid', T: 9.5, dT: 5 } };
  const et = { notes: [cta, ch, fr] };
  assert.deepStrictEqual(L.batteriesCta(et, cta).map(x => [x.b, x.lien]), [['bc', null], ['bf', null]]);
  assert.deepStrictEqual(L.batteriesLibres(et, cta, ch).map(x => x.cle), ['q1:bc']);
  assert.deepStrictEqual(L.batteriesLibres(et, cta, fr).map(x => x.cle), ['q1:bf']);
  L.brancherSurArbo(et, cta, ch, 'q1:bc'); L.brancherSurArbo(et, cta, fr, 'q1:bf');
  const v = N.calculer('cta', cta.entrees).valeurs;
  const P = a => L.resoudre(et, a).entrees.troncons.find(t => String(t.emetteur).startsWith('q1:')).P;
  assert.strictEqual(Math.round(P(ch)), Math.round(v.Pchaud)); assert.strictEqual(Math.round(P(fr)), Math.round(v.Pfroid));
  assert.deepStrictEqual(L.batteriesCta(et, cta).map(x => x.lien.note.id), ['q2', 'q3']);
});

test('schéma chaud + schéma froid : CTA sur les deux, récupération d\'énergie du groupe froid', () => {
  const Rg = require('../etudes/public/js/regulation'), E = require('../etudes/public/js/electricite');
  const fr = { id: 'sf', type: 'pid', titre: 'Production froid', entrees: { ...N.defauts('pid'), generateur: 'gf-air', reseau: 'eg-7-12', nGen: '1', Pgen: 300, recupGf: 'totale', eerRecup: 3.5, circuits: [{ rep: 'Ventilos', emetteur: 'ventilo', P: 150, regulation: '3v', L: 50 }] } };
  const ch = { id: 'sc', type: 'pid', titre: 'Production chaud', entrees: { ...N.defauts('pid'), reseau: 'ch-45-35', recupDe: 'sf', circuits: [{ rep: 'Radiateurs', emetteur: 'radiateurs', P: 80, regulation: '3v', L: 50 }] } };
  const cta = { id: 'ct', type: 'cta', titre: 'CTA', entrees: N.defauts('cta') };
  const et = { notes: [fr, ch, cta] };
  // A. Batterie chaude sur le schéma chaud, batterie froide sur le schéma froid
  L.relierAuSchema(et, cta, 'sc'); L.relierAuSchema(et, cta, 'sf');
  assert.strictEqual(L.circuitsDeAnnexe(et.notes, cta).length, 2);
  assert.deepStrictEqual(L.batteriesCta(et, cta).map(x => x.lien.pid.id), ['sc', 'sf']);
  const v = N.calculer('cta', cta.entrees).valeurs, rc = L.resoudre(et, ch).entrees.circuits[1], rf = L.resoudre(et, fr).entrees.circuits[1];
  assert.strictEqual(rc.P, Math.round(v.Pchaud * 10) / 10); assert.strictEqual(rf.P, Math.round(v.Pfroid * 10) / 10);
  const ec = L.resoudre(et, cta).entrees; assert.deepStrictEqual([ec.TcAller, ec.TcRetour, ec.TfAller, ec.TfRetour], [45, 35, 7, 12]);
  // Vannes : chaque batterie est réglée par la vanne de son circuit
  assert.deepStrictEqual(E.equipementsEtude(et, L).filter(x => /^VB[CF]-/.test(x.rep)), []);
  // B. Récupération : chaleur rejetée = froid × (1 + 1/EER), reprise par le schéma chaud
  const Pf = L.calculer(et, fr).valeurs.Pdem, Pr = L.calculer(et, fr).valeurs.Precup;
  assert.strictEqual(Pr, Math.round(Pf * (1 + 1 / 3.5) * 10) / 10);
  assert.strictEqual(L.resoudre(et, ch).entrees.Precup, Pr);
  assert.ok(L.calculer(et, ch).alertes.some(a => /Récupération sur groupe froid/.test(a.texte)));
  const inst = Rg.contexte(et, L).installations.find(i => i.noteId === 'sc');
  assert.ok(inst.af.some(t => /Priorité à la récupération/.test(t)));
  // Électricité : pompe, vanne de basculement, sondes et compteur de la récupération (côté groupe froid)
  assert.deepStrictEqual(E.equipementsEtude(et, L).filter(x => /REC$/.test(x.rep)).map(x => x.rep), ['PREC', 'VREC', 'TDREC', 'TRREC', 'CEREC']);
});
