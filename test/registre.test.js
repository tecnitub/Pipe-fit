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

test('une fiche, plusieurs pièces : repères uniques, une branche par terminal dans le réseau arborescent', () => {
  assert.deepStrictEqual(R.unites('Bureau 1 ; Salle de réunion ×2', 5), ['Bureau 1', 'Salle de réunion', 'Salle de réunion']);
  assert.deepStrictEqual(R.unites('Bureau', 2), ['Bureau', 'Bureau']);
  assert.deepStrictEqual(R.unites('', 1), ['']);
  const term = note('terminaux', { appareils: [] }), arbo = note('arbo'), et = { notes: [term, arbo] };
  const amont = arbo.entrees.troncons.find(t => t.rep === 'A2').rep;
  assert.ok(R.branches(et, `term:${term.id}`).some(([k]) => k === `arbo:${arbo.id}|A2`));
  const m = V.appliquer(et, item('terminal', { local: 'Bureau 1 ; Salle de réunion ×2', branche: `arbo:${arbo.id}|${amont}` }), `term:${term.id}`, note);
  assert.match(m, /3 terminal\(aux\).*CA-01 \(Bureau 1\), CA-02 \(Salle de réunion\), CA-03 \(Salle de réunion\).*3 branche\(s\)/);
  const br = arbo.entrees.troncons.filter(t => t.emetteur);
  assert.deepStrictEqual(br.map(t => [t.rep, t.amont, t.emetteur, t.nom]), [['CA-01', 'A2', `${term.id}:CA-01`, 'Bureau 1'], ['CA-02', 'A2', `${term.id}:CA-02`, 'Salle de réunion'], ['CA-03', 'A2', `${term.id}:CA-03`, 'Salle de réunion']]);
  // Puissance de chaque branche reprise de son terminal ; débits cumulés sur l'antenne
  const res = Liens.calculer(et, arbo), ent = Liens.resoudre(et, arbo).entrees;
  assert.deepStrictEqual(ent.troncons.filter(t => t.emetteur).map(t => t.P), [3.2, 3.2, 3.2]);
  assert.ok(!res.alertes.some(a => /déjà raccordé/.test(a.texte)));
  // Un émetteur sur deux branches : erreur ; repère de terminal en double : erreur
  arbo.entrees.troncons.push({ rep: 'X', amont: 'A2', L: 5, emetteur: `${term.id}:CA-01` });
  assert.ok(Liens.calculer(et, arbo).alertes.some(a => a.niveau === 'erreur' && /CA-01 déjà raccordé sur la branche CA-01/.test(a.texte)));
  term.entrees.appareils[2].rep = 'CA-02';
  assert.ok(Liens.calculer(et, term).alertes.some(a => a.niveau === 'erreur' && /Repère CA-02 en double/.test(a.texte)));
  assert.strictEqual(R.numeroter(term.entrees.appareils, 'CA'), 1);
  assert.deepStrictEqual(term.entrees.appareils.map(a => a.rep), ['CA-01', 'CA-02', 'CA-03']);
});

test('bouches : numéro unique, branche choisie, débits cumulés, une fiche de mise en service par bouche', () => {
  const PM = require('../etudes/public/js/points-mes');
  const aero = note('aero', { structure: 'arborescence', bouchesL: [] }), et = { notes: [aero] };
  const terminal = aero.entrees.troncons.find(t => !aero.entrees.troncons.some(u => u.amont === t.rep) && (t.reseau || 'soufflage') === 'soufflage').rep;
  assert.ok(R.branches(et, `aero:${aero.id}`).some(([k]) => k === terminal));
  V.appliquer(et, item('bouche', { local: 'Bureau 1 ; Open space ×2', branche: terminal }), `aero:${aero.id}`, note);
  const bs = aero.entrees.bouchesL;
  assert.deepStrictEqual(bs.map(b => [b.rep, b.salle, b.troncon, b.Q]), [['B-01', 'Bureau 1', terminal, 300], ['B-02', 'Open space', terminal, 300], ['B-03', 'Open space', terminal, 300]]);
  let r = Liens.calculer(et, aero);
  assert.strictEqual(r.valeurs.bouchesDetail.filter(b => b.troncon === terminal).length, 3);
  assert.ok(r.valeurs.Qs >= 900);
  // Fiche de mise en service de chaque bouche : débit attendu, repère, pièce
  // Une seule fiche de mise en service pour la CTA ; une ligne par bouche (repère, pièce, branche), débit attendu
  const pts = PM.extraire(et, n => Liens.calculer(et, n)).filter(p => p.nature === 'mes');
  assert.strictEqual(pts.length, 1);
  const lignes = pts[0].attendus.filter(a => /^Débit B-/.test(a.libelle));
  assert.deepStrictEqual(lignes.map(a => [a.libelle, a.valeur, a.unite]), [[`Débit B-01 — Bureau 1 · soufflage · branche ${terminal}`, 300, 'm³/h'], [`Débit B-02 — Open space · soufflage · branche ${terminal}`, 300, 'm³/h'], [`Débit B-03 — Open space · soufflage · branche ${terminal}`, 300, 'm³/h']]);
  assert.match(pts[0].detail, /3 bouche\(s\)/);
  // Repère en double, bouche sans repère ou sans tronçon : signalés ; numérotation
  bs[2].rep = 'B-02'; bs.push({ salle: 'Couloir', Q: 100 });
  r = Liens.calculer(et, aero);
  assert.ok(r.alertes.some(a => a.niveau === 'erreur' && /B-02 en double/.test(a.texte)));
  assert.ok(r.alertes.some(a => /Couloir.*sans repère/.test(a.texte)) && r.alertes.some(a => /aucun tronçon/.test(a.texte)));
  assert.strictEqual(R.numeroter(bs, 'B'), 2);
  assert.deepStrictEqual(bs.map(b => b.rep), ['B-01', 'B-02', 'B-03', 'B-04']);
});

test('bouches : CTA ou extracteur choisi, numérotation automatique, duplication, renumérotation complète', () => {
  const cta = note('cta'), a1 = note('aero', { structure: 'arborescence', cta: cta.id, titreInstallation: 'Bureaux', bouchesL: [] });
  const a2 = note('aero', { structure: 'arborescence', producteur: 'extraction', titreInstallation: 'Sanitaires', bouchesL: [] }), et = { notes: [cta, a1, a2] };
  const I = global.SchemaAir.installationsAir(et);
  assert.deepStrictEqual(I.map(x => x[0]), [a1.id, a2.id]);
  assert.match(I[0][1], /^Centrale.*— Bureaux \(N2\)$/);
  assert.match(I[1][1], /^Caisson \/ tourelle d'extraction — Sanitaires \(N3\)$/);
  assert.match(V.destinations(et, 'bouche')[1][1], /Bouches de Caisson/);
  // Repère suivant libre (duplication) ; bouches sans repère numérotées dans toute l'étude
  assert.strictEqual(R.repSuivant('B-03', new Set(['B-03', 'B-07'])), 'B-08');
  assert.strictEqual(R.repSuivant('', new Set()), 'B-01');
  a1.entrees.bouchesL.push({ rep: 'B-01', salle: 'Bureau 1', zone: 'Zone A', Q: 200, troncon: 'S1.1' }, { salle: 'Bureau 2', zone: 'Zone A', Q: 200, troncon: 'S1.1' });
  a2.entrees.bouchesL.push({ salle: 'WC', Q: 30 });
  let r = R.completerBouches(et);
  assert.deepStrictEqual([r.numerotees, a1.entrees.bouchesL[1].rep, a2.entrees.bouchesL[0].rep, a1.entrees.bouchesL[0].installation], [2, 'B-02', 'B-03', a1.id]);
  // Bouche rattachée à l'extracteur : déplacée dans son schéma (tronçon à choisir)
  a1.entrees.bouchesL[1].installation = a2.id;
  r = R.completerBouches(et);
  assert.deepStrictEqual([r.deplacees.length, a1.entrees.bouchesL.length, a2.entrees.bouchesL.map(b => [b.rep, b.installation])], [1, 1, [['B-03', a2.id], ['B-02', a2.id]]]);
  // Tout renuméroter : par zone puis pièce, préfixe par réseau, numérotation continue sur l'étude
  a1.entrees.bouchesL.push({ salle: 'Bureau 10', zone: 'Zone A', Q: 100, troncon: 'S1.1' }, { salle: 'Accueil', zone: 'Zone 0', Q: 100, troncon: 'S1.2' }, { salle: 'Bureau 2', zone: 'Zone A', reseau: 'reprise', Q: 100, troncon: 'R1' });
  const n = R.renumeroterBouches(et, { ordre: 'zone', prefixe: 'reseau' });
  assert.strictEqual(n, 6);
  assert.deepStrictEqual(a1.entrees.bouchesL.map(b => [b.salle, b.rep]), [['Bureau 1', 'S-02'], ['Bureau 10', 'S-03'], ['Accueil', 'S-01'], ['Bureau 2', 'R-01']]);
  assert.deepStrictEqual(a2.entrees.bouchesL.map(b => [b.rep, b.reseau || 'soufflage']), [['E-01', 'extraction'], ['E-02', 'extraction']]);
  R.renumeroterBouches(et, { notes: [a2.id], prefixe: 'BE', debut: 1 });
  assert.deepStrictEqual(a2.entrees.bouchesL.map(b => b.rep), ['BE-01', 'BE-02']);
  // Fiche de mise en service : pièce, zone et CTA dans le titre
  const PM = require('../etudes/public/js/points-mes');
  const fiches = PM.extraire(et, x => Liens.calculer(et, x)).filter(x => x.nature === 'mes' && x.noteId !== cta.id);
  assert.strictEqual(fiches.length, 2); // une fiche par CTA / extracteur
  const l = fiches.flatMap(f => f.attendus.map(a => a.libelle));
  assert.ok(l.includes('Débit S-02 — Bureau 1 (Zone A) · soufflage · branche S1.1'), l.join(' | '));
  assert.ok(fiches[1].attendus.some(a => /^Débit BE-01 — WC · extraction · branche à rattacher/.test(a.libelle)), fiches[1].attendus.map(a => a.libelle).join(' | '));
});

test('mise en service : une fiche par réseau hydraulique, une ligne par émetteur (repère, pièce, branche, préréglage)', () => {
  const PM = require('../etudes/public/js/points-mes');
  const term = note('terminaux', { appareils: [] }), arbo = note('arbo'), et = { notes: [term, arbo] };
  V.appliquer(et, item('terminal', { local: 'Bureau 1 ; Salle de réunion ×2', branche: `arbo:${arbo.id}|A2` }), `term:${term.id}`, note);
  V.appliquer(et, item('terminal', { local: 'Hall' }), `term:${term.id}`, note); // terminal hors réseau : sa propre fiche
  const pts = PM.extraire(et, n => Liens.calculer(et, n)).filter(p => p.nature === 'mes');
  const reseau = pts.find(p => p.type === 'reseau');
  assert.ok(reseau && /^Réseau hydraulique — /.test(reseau.titre));
  const l = reseau.attendus.filter(a => /^Débit CA-/.test(a.libelle));
  assert.strictEqual(l.length, 3);
  assert.match(l[0].libelle, /^Débit CA-01 — Bureau 1 · branche C → A2 → CA-01 · préréglage \d+(,\d)? tours$/);
  assert.ok(l.every(a => a.unite === 'm³/h' && a.valeur > 0));
  assert.ok(reseau.attendus.some(a => a.libelle === 'Débit de la pompe'));
  // Terminaux du réseau : pas de fiche à part ; le terminal hors réseau garde la sienne
  assert.deepStrictEqual(pts.filter(p => p.type === 'terminal').map(p => p.repere), ['CA-04']);
  // Le CRM garde toutes les lignes (plus de limite à 12 valeurs)
  const PlanMes = require('../public/js/plan-mes');
  assert.strictEqual(PlanMes.propre(reseau).attendus.length, reseau.attendus.length);
});

test('PV : lignes du relevé reconnues (repère, pièce, réseau et branche)', () => {
  const Es = require('../public/js/essais');
  assert.deepStrictEqual(Es.releve({ libelle: 'Débit S-02 — Bureau 2 (Zone A, R+1) · soufflage · branche S1.1' }), { grandeur: 'Débit', repere: 'S-02', piece: 'Bureau 2 (Zone A, R+1)', detail: 'soufflage, branche S1.1' });
  assert.deepStrictEqual(Es.releve({ libelle: 'Débit CA-01 — Bureau 1 · branche C → A1 → CA-01 · préréglage 1,9 tours' }).detail, 'branche C → A1 → CA-01, préréglage 1,9 tours');
  assert.strictEqual(Es.releve({ libelle: 'Débit de soufflage' }), null);
  assert.ok(Es.TYPES.reseau && Es.TYPES.reseau.controles.length);
});

test('sans ressaisie : matériel retenu rempli depuis le registre, tout numéroter en un clic', () => {
  const term = note('terminaux', { appareils: [] }), aero = note('aero', { structure: 'arborescence', bouchesL: [] }), vase = note('vase'), et = { notes: [term, aero, vase] };
  V.appliquer(et, item('terminal', { local: 'Bureau 1 ; Salle ×2' }), `term:${term.id}`, note);
  V.appliquer(et, item('bouche', { qte: 2, branche: 'S1.1' }), `aero:${aero.id}`, note);
  V.appliquer(et, item('vase'), `vase:${vase.id}`, note);
  // Postes du métré (unités) : vase et bouches de la note ; terminaux absents du métré
  const postes = [{ cle: 'vase|80', unite: 'u', sources: ['N3'] }, { cle: 'bouche|Diffuseur plafond|Exemplair DF4-200', unite: 'u', sources: ['N2'] }, { cle: 'bouche|Grille|400 × 150', unite: 'u', sources: ['N2'] }, { cle: 'tube|x', unite: 'ml', sources: ['N1'] }];
  et.materiel = { 'vase|80': { fabricant: 'Autre', reference: 'Déjà choisi' } };
  assert.ok(R.versMateriel(et, postes) >= 2);
  assert.deepStrictEqual(et.materiel['vase|80'].reference, 'Déjà choisi'); // jamais un choix écrasé
  assert.deepStrictEqual([et.materiel['bouche|Diffuseur plafond|Exemplair DF4-200'].fabricant, et.materiel['bouche|Diffuseur plafond|Exemplair DF4-200'].reference], ['Exemplair', 'DF4-200']);
  assert.strictEqual(et.materiel['bouche|Grille|400 × 150'], undefined); // bouche générique : reste à choisir
  const lt = Object.entries(et.materiel).find(([k]) => /^reg\|/.test(k))[1];
  assert.deepStrictEqual([lt.libre, lt.chapitre, lt.qte, lt.reference], [true, 'Terminaux', 3, 'CK-36']);
  assert.strictEqual(R.versMateriel(et, postes), 0); // stable
  // Repères manquants ou en double : comptés puis tous attribués d'un clic
  term.entrees.appareils[1].rep = 'CA-01'; aero.entrees.bouchesL[1].rep = ''; aero.entrees.bouchesL.push({ salle: 'Couloir', Q: 50 });
  assert.strictEqual(R.reperesAReprendre(et), 3);
  assert.strictEqual(R.numeroterTout(et), 3);
  assert.strictEqual(R.reperesAReprendre(et), 0);
  assert.strictEqual(new Set(term.entrees.appareils.map(a => a.rep)).size, 3);
});
