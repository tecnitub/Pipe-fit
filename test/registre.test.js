// Registre unique des équipements : un modèle par fiche, placé dans les calculs, valeurs propagées et verrouillées
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
const R = require('../etudes/public/js/registre');
global.Registre = R;
const V = require('../etudes/public/js/vrac');
const Liens = require('../etudes/public/js/liens');

const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'MODELE-FICHE-TECHNIQUE.md'), 'utf8');
const fiche = t => new RegExp(`<!-- fiche: ${t} -->\\s*\`\`\`text\\n([\\s\\S]*?)\`\`\``).exec(doc)[1].trim().split('\n');
let k = 0;
const note = (type, extra = {}) => ({ id: `n${++k}`, type, titre: N.TYPES[type].titre, entrees: { ...N.defauts(type), ...extra }, commentaire: '' });
const item = (t, o = {}) => { const lignes = fiche(t), type = V.classer(lignes); return { nom: `${t}.txt`, lignes, type, lu: V.lire(type, lignes), qte: 1, ...o }; };

test('un modèle placé trois fois : une seule entrée, valeurs corrigées partout, champs verrouillés', () => {
  const term = note('terminaux', { appareils: [] }), et = { notes: [term] };
  V.appliquer(et, item('terminal', { qte: 2, local: 'Bureaux' }), `term:${term.id}`, note);
  V.appliquer(et, item('terminal', { local: 'Salle' }), `term:${term.id}`, note);
  assert.strictEqual(et.equipements.length, 1);
  const x = et.equipements[0], a = term.entrees.appareils;
  assert.deepStrictEqual(a.map(y => [y.rep, y.eq === x.id, y.Pch]), [['CA-01', true, 3.2], ['CA-02', true, 3.2], ['CA-03', true, 3.2]]);
  // Correction dans le registre : reportée sur les trois terminaux
  x.valeurs.Pch = 3.5;
  assert.strictEqual(R.propager(et), 3);
  assert.deepStrictEqual(a.map(y => y.Pch), [3.5, 3.5, 3.5]);
  // Verrous : dans le registre et dans les liens de l'étude (formulaire)
  const v = Liens.resoudre(et, term).verrous;
  assert.match(v['appareils.0.Pch'], /Registre des équipements — Exemplair CK-36/);
  assert.ok(v['appareils.2.Pfr'] && v['appareils.1.ref']);
  assert.ok(!v['appareils.0.local'] && !v['appareils.0.rep']);
  // Bilan : un modèle, trois emplacements lisibles
  const b = R.bilan(et);
  assert.strictEqual(b[0].emplacements.length, 3);
  assert.match(b[0].emplacements[2].libelle, /CA-03 \(Salle\)/);
});

test('fiche remplacée dans le registre : nouveau modèle sur tous les emplacements (circuits, pompe, robinetterie)', () => {
  const pid = note('pid', { robinetterie: [] }), et = { notes: [pid] }, circ = pid.entrees.circuits.find(c => c.rep).rep;
  V.appliquer(et, item('robinet', { qte: 2 }), `pidc:${pid.id}|${circ}`, note);
  V.appliquer(et, item('pompe'), `pidc:${pid.id}|${circ}`, note);
  const vanne = et.equipements.find(x => x.type === 'robinet');
  Object.assign(vanne, { reference: 'EQ-50', valeurs: { ...vanne.valeurs, dn: 50, kv: 40 } });
  R.propager(et);
  assert.deepStrictEqual(pid.entrees.robinetterie.map(r => [r.dn, r.kv, r.ref, r.fiche.reference]), [[50, 40, 'Exemplair EQ-50', 'EQ-50'], [50, 40, 'Exemplair EQ-50', 'EQ-50']]);
  assert.ok(pid.entrees.pompesFab[0].courbe);
  assert.ok(Liens.resoudre(et, pid).verrous['robinetterie.1.kv']);
  assert.ok(N.calculer('pid', Liens.resoudre(et, pid).entrees));
});

test('CTA : débits du réseau non écrasés après le placement, puissances saisies propagées', () => {
  const et = { notes: [] };
  V.appliquer(et, item('cta'), 'cta:nouveau', note);
  const cta = et.notes[0], x = et.equipements[0];
  assert.deepStrictEqual([cta.entrees.eq, cta.entrees.Qs, cta.entrees.modeP, cta.entrees.PchaudS], [x.id, 4500, 'saisie', 32]);
  cta.entrees.Qs = 5000; x.valeurs.PchBC = 35;
  R.propager(et);
  assert.deepStrictEqual([cta.entrees.Qs, cta.entrees.PchaudS], [5000, 35]);
  assert.ok(!Liens.resoudre(et, cta).verrous.Qs);
});

test('reprise d\'une étude existante : fiches inscrites, variantes sans rien écraser, détachement respecté', () => {
  const f = { nom: 'ck.pdf', fabricant: 'Exemplair', reference: 'CK-36' };
  const term = note('terminaux', { appareils: [
    { rep: 'T1', type: 'cassette2', Pch: 3.2, Pfr: 3.6, fiche: f }, { rep: 'T2', type: 'cassette2', Pch: '3,2', Pfr: 3.6, fiche: f },
    { rep: 'T3', type: 'cassette2', Pch: 2.8, Pfr: 3.6, fiche: f }, { rep: 'T4', type: 'cassette2', Pch: 9, fiche: f, eq: '' }, { rep: 'T5', type: 'cassette2', Pch: 1 }] });
  const vase = note('vase', { fiche: { nom: 'vx.pdf', fabricant: 'Exemplair', reference: 'VX 80', V: 80, p0: 1.5 } }), et = { notes: [term, vase] };
  assert.strictEqual(R.collecter(et), 4);
  const a = term.entrees.appareils, regs = et.equipements;
  assert.strictEqual(regs.length, 3);
  assert.strictEqual(a[0].eq, a[1].eq);
  assert.notStrictEqual(a[2].eq, a[0].eq);
  assert.strictEqual(regs.find(x => x.id === a[2].eq).variante, 2);
  assert.strictEqual(a[3].eq, '');
  assert.strictEqual(a[4].eq, undefined);
  R.propager(et);
  assert.deepStrictEqual(a.map(y => Number(String(y.Pch).replace(',', '.'))), [3.2, 3.2, 2.8, 9, 1]);
  assert.deepStrictEqual(regs.find(x => x.type === 'vase').valeurs, { V: 80, p0: 1.5 });
  assert.strictEqual(R.collecter(et), 0);
});

test('fiche chargée sur un élément : le modèle du registre est mis à jour et reporté sur ses autres emplacements', () => {
  const term = note('terminaux', { appareils: [] }), et = { notes: [term] };
  V.appliquer(et, item('terminal', { qte: 2 }), `term:${term.id}`, note);
  const [a1, a2] = term.entrees.appareils;
  a1.Pfr = 4.1; // nouvelle fiche du même modèle lue sur CA-01
  R.lier(et, term, a1, { Qair: 700 });
  R.propager(et);
  assert.deepStrictEqual([a2.Pfr, et.equipements.length, et.equipements[0].valeurs.Qair], [4.1, 1, 700]);
});

test('détacher, retirer un modèle, modèle supprimé : valeurs gardées, plus de verrou', () => {
  const san = note('sanitaire', { points: [] }), aero = note('aero', { structure: 'arborescence', bouchesL: [] }), et = { notes: [san, aero] };
  V.appliquer(et, item('sanitaire', { qte: 2 }), `san:${san.id}`, note);
  V.appliquer(et, item('bouche'), `aero:${aero.id}`, note);
  const [p1, p2] = san.entrees.points, b = aero.entrees.bouchesL[0];
  assert.deepStrictEqual([p1.qEF, p1.qECS, b.dp, b.Lw, b.Q], [0.15, 0.15, 25, 32, 300]);
  R.detacher(R.emplacements(et).find(p => p.el === p1));
  et.equipements.find(x => x.type === 'sanitaire').valeurs.q = 0.2;
  R.propager(et);
  assert.deepStrictEqual([p1.qEF, p2.qEF], [0.15, 0.2]);
  b.Q = 250; R.propager(et);
  assert.strictEqual(b.Q, 250); // débit de la bouche : celui du réseau
  R.supprimer(et, et.equipements.find(x => x.type === 'bouche').id);
  assert.deepStrictEqual([b.eq, b.dp], ['', 25]);
  assert.deepStrictEqual(Liens.resoudre(et, aero).verrous['bouchesL.0.dp'], undefined);
  p2.eq = 'disparu'; R.propager(et);
  assert.strictEqual(p2.eq, '');
});
