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
