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
  // 2. Directement sur un circuit du schéma qui avait un bilan : la puissance est celle de la CTA
  const et2 = { notes: [nn('pid'), nn('cta'), nn('bilan')] }, p2 = et2.notes[0];
  p2.entrees.circuits[0].bilan = et2.notes[2].id;
  const r2 = L.relierAuSchema(et2, et2.notes[1], p2.id, 0);
  assert.strictEqual(L.resoudre(et2, p2).entrees.circuits[r2.i].P, Math.round(L.calculer(et2, et2.notes[1]).valeurs.Pchaud * 10) / 10);
});
