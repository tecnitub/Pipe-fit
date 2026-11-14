// Liens automatiques entre calculs d'une étude fictive (ACME) : CTA ↔ circuit « batterie de CTA » du schéma de principe,
// production créée depuis la puissance d'un bâtiment, lignes reprises (méthode commune), listes de choix dépendant de
// l'étude, plusieurs unités extérieures DRV.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta'); require('../etudes/public/js/equilibrage'); require('../etudes/public/js/aeraulique-schema');
global.Terminaux = require('../etudes/public/js/terminaux');
global.Pieces = require('../etudes/public/js/pieces');
require('../etudes/public/js/annexes-froid');
const L = require('../etudes/public/js/liens');

let k = 0;
const note = (type, entrees = {}, titre = `${type} ACME`) => ({ id: `x${++k}`, type, titre, entrees: { ...N.defauts(type), ...entrees } });
const pidChaud = (circuits, extra = {}) => note('pid', { reseau: 'ch-70-50', circuits, ...extra }, 'Chaufferie ACME');
const pidFroid = circuits => note('pid', { reseau: 'eg-7-12', generateur: 'gf-air', circuits }, 'Production froid ACME');
const circ = (rep, emetteur = 'cta', x = {}) => ({ rep, emetteur, P: 10, regime: '', regulation: '3v', L: 30, ...x });

test('CTA reliée automatiquement au seul circuit « batterie de CTA » libre (chaud et froid), alertes « ok »', () => {
  const pc = pidChaud([circ('Radiateurs', 'radiateurs'), circ('CTA Exemplair')]), pf = pidFroid([circ('CTA froid')]);
  const cta = note('cta', { froid: 'oui' }, 'CTA Exemplair');
  const et = { notes: [pc, pf, cta] };
  const A = L.liaisonsAutoCta(et);
  assert.deepStrictEqual(A.liens.map(l => [l.pid.id, l.i, l.bats.join('+')]).sort(), [[pc.id, 1, 'bc'], [pf.id, 0, 'bf']].sort());
  assert.strictEqual(A.ambigus.length, 0);
  const v = L.calculer(et, cta).valeurs;
  // Schéma chaud : puissance de la batterie chaude reprise, verrouillée, libellé « CTA … (liaison automatique) »
  const r = L.resoudre(et, pc), c = r.entrees.circuits[1];
  assert.strictEqual(c.P, Math.round(v.Pchaud * 10) / 10);
  assert.strictEqual(c.annexe, cta.id);
  assert.match(r.verrous['circuits.1.P'], /^CTA N3 — CTA Exemplair \(liaison automatique\)$/);
  assert.ok(r.alertes.some(a => a.niveau === 'ok' && /relié automatiquement à la CTA N3/.test(a.texte)));
  assert.strictEqual(r.verrous['circuits.0.P'], undefined, 'radiateurs non touchés');
  // Schéma froid : batterie froide
  const rf = L.resoudre(et, pf);
  assert.strictEqual(rf.entrees.circuits[0].P, Math.round(v.Pfroid * 10) / 10);
  // Côté CTA : régimes d'eau repris des deux circuits, alerte « ok »
  const rc = L.resoudre(et, cta);
  assert.strictEqual(rc.entrees.TcAller, 70); assert.strictEqual(rc.entrees.TfAller, 7);
  assert.match(rc.verrous.TcAller, /liaison automatique/);
  assert.ok(rc.alertes.some(a => a.niveau === 'ok' && /reliée\(s\) automatiquement/.test(a.texte)));
  // Saisie non modifiée
  assert.strictEqual(pc.entrees.circuits[1].annexe, undefined);
  // Raccordement des batteries (bandeau de la CTA) : liaison automatique donnée à part
  assert.deepStrictEqual(L.batteriesCta(et, cta).map(x => [x.b, x.lien, x.auto && x.auto.rep]), [['bc', null, 'CTA Exemplair'], ['bf', null, 'CTA froid']]);
});

test('CTA : liaisons manuelles conservées, refus explicite (« — ») et détachement respectés', () => {
  const pc = pidChaud([circ('CTA 1'), circ('CTA 2')]), c1 = note('cta', { froid: 'non' }, 'CTA un'), c2 = note('cta', { froid: 'non' }, 'CTA deux');
  const et = { notes: [pc, c1, c2] };
  // Liaison manuelle de c1 sur « CTA 2 » : c2 n'a plus qu'un circuit possible, « CTA 1 »
  L.relierAuSchema(et, c1, pc.id, 1);
  const A = L.liaisonsAutoCta(et);
  assert.deepStrictEqual(A.liens.map(l => [l.cta.id, l.i]), [[c2.id, 0]]);
  const r = L.resoudre(et, pc);
  assert.strictEqual(r.entrees.circuits[1].annexe, c1.id);
  assert.ok(!/automatique/.test(r.verrous['circuits.1.P']), 'liaison manuelle : libellé inchangé');
  assert.match(r.verrous['circuits.0.P'], /liaison automatique/);
  // Refus explicite sur le circuit : plus de liaison automatique
  pc.entrees.circuits[0].annexe = '';
  assert.strictEqual(L.liaisonsAutoCta(et).liens.length, 0);
  delete pc.entrees.circuits[0].annexe;
  // Détacher la CTA : valeurs gardées, plus de liaison automatique pour elle
  L.detacher(et, c2);
  assert.strictEqual(c2.entrees.lienAuto, false);
  assert.strictEqual(L.liaisonsAutoCta(et).liens.length, 0);
});

test('CTA : ambiguïté (plusieurs circuits ou plusieurs CTA) → rien n\'est relié, alerte « attention »', () => {
  // Deux circuits CTA libres pour une seule CTA
  const p1 = pidChaud([circ('CTA A'), circ('CTA B')]), cta = note('cta', { froid: 'non' }, 'CTA Exemplair');
  const et1 = { notes: [p1, cta] };
  const A1 = L.liaisonsAutoCta(et1);
  assert.strictEqual(A1.liens.length, 0);
  assert.deepStrictEqual(A1.ambigus.map(x => x.type), ['batterie']);
  const r1 = L.resoudre(et1, p1);
  assert.strictEqual(r1.entrees.circuits[0].annexe, undefined);
  assert.ok(r1.alertes.some(a => a.niveau === 'attention' && /2 circuits « batterie de CTA » possibles/.test(a.texte) && /Réseau annexe relié/.test(a.texte)));
  assert.ok(L.resoudre(et1, cta).alertes.some(a => a.niveau === 'attention' && /« CTA A » de N1/.test(a.texte)));
  // Deux CTA pour un seul circuit
  const p2 = pidChaud([circ('CTA commune')]), ca = note('cta', { froid: 'non' }, 'CTA nord'), cb = note('cta', { froid: 'non' }, 'CTA sud');
  const et2 = { notes: [p2, ca, cb] };
  assert.strictEqual(L.liaisonsAutoCta(et2).liens.length, 0);
  const r2 = L.resoudre(et2, p2);
  assert.ok(r2.alertes.some(a => a.niveau === 'attention' && /2 CTA peuvent s'y raccorder \(N2 — CTA nord, N3 — CTA sud\)/.test(a.texte)));
  assert.ok(L.resoudre(et2, cb).alertes.some(a => a.niveau === 'attention' && /raccordez chaque CTA/.test(a.texte)));
  // CTA sur une branche de réseau arborescent : pas candidate
  const arbo = note('arbo', { troncons: [{ rep: 'T1', amont: '', L: 10 }, { rep: 'B1', amont: 'T1', L: 5, emetteur: `${ca.id}:bc` }] });
  et2.notes.push(arbo);
  assert.deepStrictEqual(L.liaisonsAutoCta(et2).liens.map(l => l.cta.id), [cb.id]);
});

test('CTA change-over : un seul circuit change-over relie les deux batteries', () => {
  const pco = note('pid', { reseau: 'co', generateur: 'pac-rev', circuits: [circ('CTA CO')] }, 'PAC ACME'), cta = note('cta', { froid: 'co' }, 'CTA CO');
  const et = { notes: [pco, cta] };
  const A = L.liaisonsAutoCta(et);
  assert.deepStrictEqual(A.liens.map(l => l.bats), [['bc', 'bf']]);
  const c = L.resoudre(et, pco).entrees.circuits[0], v = L.calculer(et, cta).valeurs;
  assert.strictEqual(c.Pf, Math.round(v.Pfroid * 10) / 10);
});

test('Puissance d\'un bâtiment → production : générateur selon le mode, circuit repris du bâtiment', () => {
  const ids = (() => { let n = 0; return () => `prod${++n}`; })();
  // Chauffage seul, bâtiment existant : chaudière à condensation
  const bc = note('batiment', { mode: 'chaud', nom: 'Bâtiment ACME' });
  const et = { notes: [bc] };
  const r = L.productionDepuisBatiment(et, bc, ids);
  assert.strictEqual(r.nouvelles.length, 1);
  const p = r.nouvelles[0], Pch = L.calculer(et, bc).valeurs.Pchauf / 1000;
  assert.strictEqual(p.entrees.generateur, 'chaudiere-cond'); assert.strictEqual(p.entrees.reseau, 'ch-55-45');
  assert.strictEqual(p.entrees.nGen, Pch > 100 ? '2' : '1');
  assert.ok(p.entrees.Pgen * Number(p.entrees.nGen) >= Pch && p.entrees.Pgen % 1 === 0);
  assert.deepStrictEqual(p.entrees.circuits.map(c => [c.rep, c.bilan]), [['Bâtiment ACME — chauffage', bc.id]]);
  et.notes.push(p);
  const rp = L.resoudre(et, p);
  assert.strictEqual(rp.entrees.circuits[0].P, Math.round(Pch * 10) / 10);
  assert.ok(rp.verrous['circuits.0.P']);
  // Relancé sur ce schéma : rien n'est ajouté deux fois
  const r2 = L.productionDepuisBatiment(et, bc, ids, { pid: p.id });
  assert.strictEqual(r2.circuits.length + r2.nouvelles.length, 0);
  // Neuf : PAC air/eau
  const pn = L.productionDepuisBatiment({ neuf: 'oui', notes: [bc] }, bc, ids).nouvelles[0];
  assert.strictEqual(pn.entrees.generateur, 'pac-air'); assert.strictEqual(pn.entrees.reseau, 'ch-45-35');
  // Climatisation seule : groupe froid
  const bf = note('batiment', { mode: 'froid' });
  assert.strictEqual(L.productionDepuisBatiment({ notes: [bf] }, bf, ids).nouvelles[0].entrees.generateur, 'gf-air');
});

test('Puissance d\'un bâtiment → production : chaud et froid (PAC réversible ou PAC + groupe froid), schéma existant complété', () => {
  const ids = (() => { let n = 0; return () => `p${++n}`; })();
  assert.deepStrictEqual(L.choixProduction(['chaud', 'froid'], 80, 70, false).map(x => [x.generateur, x.reseau, x.Pgen, x.PgenF]), [['pac-rev', 'co', 80, 70]]);
  assert.deepStrictEqual(L.choixProduction(['chaud', 'froid'], 200, 60, false).map(x => [x.generateur, x.nGen, x.Pgen]), [['pac-air', 2, 100], ['gf-air', 1, 60]]);
  assert.deepStrictEqual([12.2, 43, 101].map(L.arrondiP), [13, 45, 110]);
  const b = note('batiment', { mode: 'les-deux' }), et = { notes: [b] };
  const r = L.productionDepuisBatiment(et, b, ids), v = L.calculer(et, b).valeurs, Pch = v.Pchauf / 1000, Pfr = v.Pfroid / 1000;
  const co = Math.max(Pch, Pfr) <= 1.5 * Math.min(Pch, Pfr);
  assert.strictEqual(r.nouvelles.length, co ? 1 : 2);
  if (co) {
    et.notes.push(...r.nouvelles);
    const c = L.resoudre(et, r.nouvelles[0]).entrees.circuits[0];
    assert.strictEqual(c.P, Math.round(Pch * 10) / 10); assert.strictEqual(c.Pf, Math.round(Pfr * 10) / 10);
  }
  // Schéma chaud existant : circuit de chauffage ajouté (ses circuits saisis gardés), production froide créée à part
  const pc = pidChaud([circ('Radiateurs', 'radiateurs')], { nGen: '1', Pgen: 20 }), et2 = { notes: [b, pc] };
  const r2 = L.productionDepuisBatiment(et2, b, ids, { pid: pc.id });
  assert.deepStrictEqual(pc.entrees.circuits.map(c => c.rep), ['Radiateurs', 'Bâtiment — chauffage']);
  assert.deepStrictEqual(r2.completees, [pc]);
  assert.deepStrictEqual(r2.nouvelles.map(n => n.entrees.generateur), ['gf-air']);
  assert.ok(r2.alertes.some(a => a.niveau === 'attention' && /générateur à revoir/.test(a.texte)), 'production existante trop petite signalée');
});

test('lignes reprises (méthode commune) : verrous de cellule sans clé parasite, ligne saisie de même clé complétée', () => {
  N.TYPES.testReprise = { titre: 'Test', famille: 'Test', champs: [{ k: 'lignes', t: 'lignes', d: [], colonnes: [{ k: 'rep' }, { k: 'P' }, { k: 'L' }] }],
    calcul: () => ({ valeurs: {}, alertes: [] }),
    lier(ctx) { ctx.reprendreLignes('lignes', [{ rep: 'A 1', P: 3, L: '' }, { rep: 'B', P: 4, L: 2, _auto: 'source B' }], { cle: 'rep', libelle: 'source A', colonnesVerrouillees: ['rep', 'P'] }); } };
  try {
    const n = note('testReprise', { lignes: [{ rep: 'a  1', P: '', L: 12 }] });
    const r = L.resoudre({ notes: [n] }, n);
    assert.deepStrictEqual(r.entrees.lignes, [{ rep: 'a  1', P: 3, L: 12 }, { rep: 'B', P: 4, L: 2, _auto: 'source B' }]);
    assert.deepStrictEqual(Object.keys(r.verrous).sort(), ['lignes.1.P', 'lignes.1.rep']);
    assert.strictEqual(r.verrous['lignes.1.P'], 'source B');
    assert.ok(!Object.keys(r.entrees).some(x => x.startsWith('lignes.')), 'pas de clé parasite');
    assert.strictEqual(n.entrees.lignes.length, 1, 'saisie non modifiée');
  } finally { delete N.TYPES.testReprise; }
});

test('Notes.calculer : valeur d\'une liste qui dépend de l\'étude gardée sans étude', () => {
  N.TYPES.testListe = { titre: 'Test', famille: 'Test',
    champs: [{ k: 'source', t: 's', o: (e, et) => [['', '—'], ...((et && et.notes) || []).map(n => [n.id, n.titre])], d: '' },
      { k: 'tube', t: 's', o: e => (e.serie === 'b' ? [['b1', 'B1']] : [['a1', 'A1'], ['a2', 'A2']]), d: 'a1' }, { k: 'serie', d: 'a' }],
    calcul: e => ({ valeurs: { source: e.source, tube: e.tube }, alertes: [] }) };
  try {
    // Sans étude : la source choisie reste ; liste qui ne dépend que des entrées : premier choix si absent
    assert.deepStrictEqual(N.calculer('testListe', { source: 'n9', tube: 'a2', serie: 'b' }).valeurs, { source: 'n9', tube: 'b1' });
    // Avec l'étude (3e paramètre) : valeur absente de la liste → premier choix
    assert.strictEqual(N.calculer('testListe', { source: 'n9' }, { notes: [{ id: 'n1', titre: 'X' }] }).valeurs.source, '');
    assert.strictEqual(N.calculer('testListe', { source: 'n1' }, { notes: [{ id: 'n1', titre: 'X' }] }).valeurs.source, 'n1');
  } finally { delete N.TYPES.testListe; }
});

test('DRV : deux unités extérieures de même repère → numérotées dans les fluides, alerte dans chaque DRV', () => {
  const d1 = note('drv', { repUE: 'UE1', chargeUsine: 8, uis: [{ rep: 'A', Pfr: 10 }] }, 'DRV ACME bât. A');
  const d2 = note('drv', { repUE: 'UE1', chargeUsine: 6, uis: [{ rep: 'B', Pfr: 8 }] }, 'DRV ACME bât. B');
  const d3 = note('drv', { repUE: 'UE3', chargeUsine: 5, uis: [{ rep: 'C', Pfr: 8 }] }, 'DRV ACME bât. C');
  const f = note('fluides');
  const et = { notes: [d1, d2, d3, f] };
  const rf = L.resoudre(et, f);
  assert.deepStrictEqual(rf.entrees.equipements.map(x => x.rep), ['UE1-N1', 'UE1-N2', 'UE3']);
  assert.strictEqual(rf.verrous['equipements.1.charge'], 'N2 — DRV ACME bât. B');
  assert.ok(rf.alertes.some(a => /UE1-N1 \(N1 — DRV ACME bât. A\)/.test(a.texte)));
  assert.ok(L.resoudre(et, d1).alertes.some(a => a.niveau === 'attention' && /Repère « UE1 ».*N2 — DRV ACME bât. B.*UE1-N1, UE1-N2/.test(a.texte)));
  assert.ok(!L.resoudre(et, d3).alertes.some(a => /Repère « UE3 »/.test(a.texte)));
  // Ligne saisie au repère numéroté : complète la ligne reprise (détection saisie)
  f.entrees.equipements = [{ rep: 'UE1-N2', detection: 'oui' }];
  const r2 = L.resoudre(et, f).entrees.equipements;
  assert.deepStrictEqual(r2.map(x => [x.rep, x.detection, x.charge > 0]), [['UE1-N2', 'oui', true], ['UE1-N1', 'non', true], ['UE3', 'non', true]]);
});
