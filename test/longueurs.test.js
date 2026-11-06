// Longueurs des tronçons reprises d'un export Revit (CSV, Excel) ou d'un DXF
const { test } = require('node:test');
const assert = require('node:assert');
const Lg = require('../etudes/public/js/longueurs');

test('nomenclature Revit en CSV : repère, longueur en mm additionnée par repère', () => {
  const txt = '﻿"Nom du système";"Repère";"Taille";"Longueur (mm)"\n"EC";"A1";"DN 50";"12 500"\n"EC";"A1";"DN 50";"2500"\n"EC";"CA-01";"DN 20";"6200"\n"EC";"";"DN 20";"300"\n';
  const r = Lg.depuisTableau(Lg.csv(txt));
  assert.strictEqual(r.unite, 'mm');
  assert.deepStrictEqual([...r.parRep], [['A1', 15], ['CA-01', 6.2]]);
  const tr = [{ rep: 'C', L: 12 }, { rep: 'A1', L: 18 }, { rep: 'CA-01', L: 10 }];
  const p = Lg.proposer(tr, r.parRep);
  assert.deepStrictEqual(p.lignes.map(x => [x.rep, x.avant, x.apres]), [['A1', 18, 15], ['CA-01', 10, 6.2]]);
  assert.deepStrictEqual(Lg.proposer(tr, r.parRep, { diviser: true }).lignes.map(x => x.apres), [7.5, 3.1]);
});

test('commentaires comme repère, tabulations, mètres ; repère en fin de nom', () => {
  const r = Lg.depuisTableau(Lg.csv('Commentaires\tLongueur\nCVC-S1.1\t4,5\nCVC-S1.1\t1\nautre\t3\n'));
  assert.strictEqual(r.unite, 'm');
  const p = Lg.proposer([{ rep: 'S1.1', L: '' }, { rep: 'S2', L: 5 }], r.parRep);
  assert.deepStrictEqual(p.lignes.map(x => [x.rep, x.cle, x.apres]), [['S1.1', 'CVC-S1.1', 5.5]]);
  assert.deepStrictEqual(p.nonUtilisees, ['autre']);
  assert.ok(Lg.depuisTableau([['A', 'B'], ['1', '2']]).erreur);
});

test('DXF : longueur des lignes et polylignes par couche, unités en mm', () => {
  const ent = (...p) => p.join('\n');
  const dxf = ent('0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LINE', '8', 'A1', '10', '0', '20', '0', '11', '3000', '21', '4000',
    '0', 'LWPOLYLINE', '8', 'CA-01', '90', '3', '70', '0', '10', '0', '20', '0', '10', '1000', '20', '0', '10', '1000', '20', '2000',
    '0', 'LINE', '8', 'A1', '10', '0', '20', '0', '11', '1000', '21', '0', '0', 'ENDSEC', '0', 'EOF');
  const r = Lg.dxf(dxf);
  assert.deepStrictEqual([...r.parRep].sort(), [['A1', 6], ['CA-01', 3]]);
});
