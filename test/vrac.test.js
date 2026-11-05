// Matériel en vrac : reconnaissance des fiches, lecture et répartition dans les calculs de l'étude
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
global.FichesTech = require('../public/js/fiches-tech');
const N = require('../etudes/public/js/notes');
global.Notes = N;
global.Terminaux = require('../etudes/public/js/terminaux');
global.Schema = require('../etudes/public/js/schema');
global.Pompes = require('../etudes/public/js/pompes');
require('../etudes/public/js/industriel');
require('../etudes/public/js/equilibrage');
global.Sanitaire = require('../etudes/public/js/sanitaire');
global.FicheCta = require('../etudes/public/js/fiche-cta');
global.FicheEquip = require('../etudes/public/js/fiche-equipement');
require('../etudes/public/js/cta');
global.SchemaAir = require('../etudes/public/js/aeraulique-schema');
const V = require('../etudes/public/js/vrac');

const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'MODELE-FICHE-TECHNIQUE.md'), 'utf8');
const fiche = t => new RegExp(`<!-- fiche: ${t} -->\\s*\`\`\`text\\n([\\s\\S]*?)\`\`\``).exec(doc)[1].trim().split('\n');
const TYPES = ['cta', 'pompe', 'terminal', 'generateur', 'vase', 'ecs', 'bouche', 'robinet', 'sanitaire'];
let k = 0;
const note = (type, extra = {}) => ({ id: `n${++k}`, type, titre: N.TYPES[type].titre, entrees: { ...N.defauts(type), ...extra }, commentaire: '' });
const item = (t, o = {}) => { const lignes = fiche(t), type = V.classer(lignes); return { nom: `${t}.txt`, lignes, type, lu: V.lire(type, lignes), qte: 1, ...o }; };

test('chaque modèle de fiche est reconnu, avec ou sans la ligne « Type : »', () => {
  TYPES.forEach(t => {
    assert.strictEqual(V.classer(fiche(t)), t, t);
    assert.strictEqual(V.classer(fiche(t).filter(l => !/^Type/.test(l))), t, `${t} sans Type`);
    const lu = V.lire(t, fiche(t));
    assert.strictEqual(lu.fabricant, 'Exemplair', t);
    assert.ok(lu.nb > 0 && lu.resume, t);
  });
  assert.strictEqual(V.classer(['Notice de pose'], 'Circulateur Wilo.pdf'), 'pompe');
  assert.strictEqual(V.classer(['Type : truc inconnu']), 'inconnu');
});

test('découpage de fiches collées les unes à la suite', () => {
  const b = V.decouper([...fiche('vase'), '---', ...fiche('pompe'), '', '---', ''].join('\n'));
  assert.strictEqual(b.length, 2);
  assert.deepStrictEqual(b.map(l => V.classer(l)), ['vase', 'pompe']);
});

test('destinations proposées selon les calculs de l\'étude', () => {
  const pid = note('pid'), term = note('terminaux'), arbo = note('arbo', { troncons: [{ rep: 'T1' }] }), et = { notes: [pid, term, arbo] };
  const circ = pid.entrees.circuits.find(c => c.rep).rep;
  assert.deepStrictEqual(V.destinations(et, 'terminal').map(d => d[0]), [`term:${term.id}`, 'term:nouveau']);
  assert.ok(V.destinations(et, 'pompe').some(d => d[0] === `pidc:${pid.id}|${circ}`));
  assert.ok(V.destinations(et, 'pompe').some(d => d[0] === `arbo:${arbo.id}`));
  assert.ok(V.destinations(et, 'robinet').some(d => d[0] === `arbot:${arbo.id}|T1`));
  assert.deepStrictEqual(V.destinations(et, 'generateur').map(d => d[0]), [`pid:${pid.id}`]);
  assert.deepStrictEqual(V.destinations(et, 'vase').map(d => d[0]), ['vase:nouveau']);
});

test('répartition : terminaux, CTA, production, pompe, robinetterie, vase, ballon', () => {
  const pid = note('pid', { robinetterie: [] }), term = note('terminaux', { appareils: [] }), et = { notes: [pid, term] };
  const circ = pid.entrees.circuits.find(c => c.rep).rep, nn = t => note(t);

  assert.match(V.appliquer(et, item('terminal', { qte: 3, local: 'Bureaux', circuit: circ }), `term:${term.id}`, nn), /3 terminal/);
  const a = term.entrees.appareils;
  assert.deepStrictEqual(a.map(x => x.rep), ['CA-01', 'CA-02', 'CA-03']);
  assert.deepStrictEqual([a[0].type, a[0].batterie, a[0].Pch, a[0].Pfr, a[0].local, a[0].circuit, a[0].ref], ['cassette2', '2t', 3.2, 3.6, 'Bureaux', circ, 'Exemplair CK-36']);

  V.appliquer(et, item('cta'), 'cta:nouveau', nn);
  const cta = et.notes.find(n => n.type === 'cta');
  assert.strictEqual(cta.titre, 'CTA Exemplair CTA-DF 4500');
  assert.deepStrictEqual([cta.entrees.Qs, cta.entrees.modeP, cta.entrees.PchaudS, cta.entrees.fiche.reference], [4500, 'saisie', 32, 'CTA-DF 4500']);

  V.appliquer(et, item('generateur'), `pid:${pid.id}`, nn);
  assert.strictEqual(pid.entrees.fiche.reference, 'PAC-AE 150');

  V.appliquer(et, item('pompe'), `pidc:${pid.id}|${circ}`, nn);
  assert.deepStrictEqual(pid.entrees.pompesFab.map(p => [p.circuit, p.ref, !!p.courbe]), [[circ, 'Exemplair CX 40-8', true]]);

  V.appliquer(et, item('robinet'), `pidc:${pid.id}|${circ}`, nn);
  const r = pid.entrees.robinetterie.at(-1);
  assert.deepStrictEqual([r.circuit, r.type, r.dn, r.kv, r.ref], [circ, 'equilibrage', 40, 25.9, 'Exemplair EQ-40']);
  assert.ok(r.abaque);

  V.appliquer(et, item('vase'), 'vase:nouveau', nn);
  V.appliquer(et, item('ecs'), 'ecs:nouveau', nn);
  assert.strictEqual(et.notes.find(n => n.type === 'vase').entrees.fiche.reference, 'VX 80');
  assert.strictEqual(et.notes.find(n => n.type === 'ecs').entrees.fiche.reference, 'BS 500');

  // Les calculs tournent avec le matériel réparti
  et.notes.forEach(n => assert.ok(N.calculer(n.type, n.entrees), n.type));
});

test('répartition : bouches et points de puisage', () => {
  const aero = note('aero', { structure: 'arborescence', bouchesL: [] }), san = note('sanitaire', { points: [] }), et = { notes: [aero, san] };
  V.appliquer(et, item('bouche', { qte: 2, local: 'Salle 1' }), `aero:${aero.id}`, note);
  assert.deepStrictEqual(aero.entrees.bouchesL.map(b => [b.rep, b.Q, b.dp, b.salle]), [['B-01', 300, 25, 'Salle 1'], ['B-02', 300, 25, 'Salle 1']]);
  V.appliquer(et, item('sanitaire'), `san:${san.id}`, note);
  assert.deepStrictEqual(san.entrees.points.map(p => [p.type, p.qEF, p.pMin]), [['lavabo', 0.15, 1.5]]);
});
