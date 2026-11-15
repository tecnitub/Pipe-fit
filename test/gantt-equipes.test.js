// Gantt des chantiers : plusieurs équipes (une équipe ne fait qu'une phase à la fois), dépendances multiples fin → début
// avec un décalage propre à chaque dépendance, chemin critique ; proposition du planning depuis l'étude par équipes.
// Dates calculées à la main sur le calendrier (jours ouvrés, week-ends sautés).
const { test } = require('node:test');
const assert = require('node:assert');
const G = require('../public/js/gantt-calc');
const P = require('../public/js/planning-etude');

const AUJ = '2026-10-28';
const dates = r => Object.fromEntries(r.phases.map(p => [p.id, [p.debut, p.fin]]));

// Réseaux (E1, 5 j) le lundi 2 novembre ; production (E2, 3 j), CTA (E1, 2 j) et terminaux (E1, 4 j) après les réseaux ;
// régulation après la production (+ 2 j), la CTA et les terminaux ; essais après la régulation
const PHASES = [
  { id: 'a', libelle: 'Réseaux', debut: '2026-11-02', duree: 5, equipeId: 'E1' },
  { id: 'b', libelle: 'Production', duree: 3, apres: ['a'], equipeId: 'E2' },
  { id: 'c', libelle: 'CTA', duree: 2, apres: ['a'], equipeId: 'E1' },
  { id: 'd', libelle: 'Terminaux', duree: 4, apres: ['a'], equipeId: 'E1' },
  { id: 'e', libelle: 'Régulation', duree: 1, apres: ['b', 'c', 'd'], decalages: { b: 2 } },
  { id: 'f', libelle: 'Essais', duree: 2, apres: ['e'] },
];
const EQUIPES = [{ id: 'E1', nom: 'Équipe tuyauterie', effectif: 3 }, { id: 'E2', nom: 'Équipe chaufferie', effectif: 2 }];

test('équipes : deux phases de la même équipe ne se chevauchent pas, la suivante attend', () => {
  const r = G.calculer({ id: 'x', phases: PHASES, equipes: EQUIPES, ganttRecaler: false }, { aujourdhui: AUJ });
  // a : 2 → 6 nov. ; b (E2) : 9 → 11 ; c (E1) : 9 → 10 ; d (E1, même début au plus tôt, après c dans la liste) : 11 → 16 nov.
  // e : max(11 nov. + 1 j + 2 j = 16 nov., 11 nov., 17 nov.) = 17 nov. ; f : 18 → 19 nov.
  assert.deepStrictEqual(dates(r), { a: ['2026-11-02', '2026-11-06'], b: ['2026-11-09', '2026-11-11'], c: ['2026-11-09', '2026-11-10'], d: ['2026-11-11', '2026-11-16'], e: ['2026-11-17', '2026-11-17'], f: ['2026-11-18', '2026-11-19'] });
  const d = r.phases.find(p => p.id === 'd');
  assert.deepStrictEqual([d.auPlusTot, d.bloqueePar, d.contrainte, d.equipeNom], ['2026-11-09', 'c', 'CTA (même équipe)', 'Équipe tuyauterie']);
  // Sans équipes : les terminaux démarrent avec la CTA, la régulation le 16 novembre (production + 2 j)
  const s = G.calculer({ id: 'x', phases: PHASES.map(({ equipeId, ...p }) => p), ganttRecaler: false }, { aujourdhui: AUJ });
  assert.deepStrictEqual([dates(s).d, dates(s).e], [['2026-11-09', '2026-11-12'], ['2026-11-16', '2026-11-16']]);
  assert.strictEqual(s.phases.find(p => p.id === 'e').contrainte, 'Production', 'décalage propre à la dépendance');
});

test('équipes : phases calées sur le planning qui se chevauchent pour une même équipe signalées', () => {
  const planning = ['2026-11-02', '2026-11-03'].flatMap(date => [{ affaireId: 'x', date, tache: 'Préfabrication', heuresPrevues: 7 }, { affaireId: 'x', date, tache: 'Soudure', heuresPrevues: 7 }]);
  const r = G.calculer({ id: 'x', equipes: EQUIPES, phases: [{ id: 'p', libelle: 'Préfa', tache: 'Préfabrication', duree: 2, equipeId: 'E1' }, { id: 's', libelle: 'Soudure', tache: 'Soudure', duree: 2, equipeId: 'E1' }] }, { aujourdhui: AUJ, planning });
  assert.deepStrictEqual(dates(r), { p: ['2026-11-02', '2026-11-03'], s: ['2026-11-02', '2026-11-03'] }, 'dates du planning gardées');
  assert.deepStrictEqual(r.alertes, ['Équipe tuyauterie : « Préfa » et « Soudure » en même temps (dates du planning des équipes)']);
});

test('dépendances multiples fin → début, décalage par dépendance ou commun', () => {
  assert.strictEqual(G.decalageDe({ decalage: 3, decalages: { b: 1 } }, 'b'), 1);
  assert.strictEqual(G.decalageDe({ decalage: 3, decalages: { b: 1 } }, 'c'), 3);
  assert.strictEqual(G.decalageDe({}, 'c'), 0);
  // Toutes les dépendances comptent (pas seulement la première) : la plus tardive l'emporte
  const r = G.calculer({ id: 'x', ganttRecaler: false, phases: [{ id: 'p', libelle: 'P', debut: '2026-11-02', duree: 1 }, { id: 'q', libelle: 'Q', debut: '2026-11-02', duree: 8 }, { id: 'z', libelle: 'Z', duree: 1, apres: ['p', 'q'] }] }, { aujourdhui: AUJ });
  assert.deepStrictEqual(dates(r).z, ['2026-11-12', '2026-11-12']);
  assert.strictEqual(r.phases[2].contrainte, 'Q');
});

test('chemin critique : marges totales, phases et liens critiques (enchaînement d\'équipe compris)', () => {
  const r = G.calculer({ id: 'x', phases: PHASES, equipes: EQUIPES, ganttRecaler: false }, { aujourdhui: AUJ });
  const m = Object.fromEntries(r.phases.map(p => [p.id, p.marge]));
  // b : 3 jours ouvrés libres (12, 13, 16 nov.) avant la régulation, moins son décalage de 2 j : marge 1
  // c : enchaîné avec d par l'équipe E1 (aucun jour libre) : critique
  assert.deepStrictEqual(m, { a: 0, b: 1, c: 0, d: 0, e: 0, f: 0 });
  assert.deepStrictEqual(r.critique, ['a', 'c', 'd', 'e', 'f']);
  assert.strictEqual(r.liens.length, 8, '7 dépendances + 1 enchaînement d\'équipe');
  const l = k => r.liens.find(x => `${x.de}>${x.vers}` === k);
  assert.deepStrictEqual([l('c>d').equipe, l('c>d').critique, l('b>e').critique, l('b>e').decalage, l('d>e').critique], [true, true, false, 2, true]);
  // Phase terminée : jamais critique ; chantier sans dépendance : la phase la plus longue seule est critique
  const t = G.calculer({ id: 'y', ganttRecaler: false, phases: [{ id: 'u', libelle: 'U', debut: '2026-11-02', duree: 2 }, { id: 'v', libelle: 'V', debut: '2026-11-02', duree: 5 }] }, { aujourdhui: AUJ });
  assert.deepStrictEqual(t.phases.map(p => [p.id, p.marge, p.critique]), [['u', 3, false], ['v', 0, true]]);
});

test('planning depuis l\'étude : équipes, affectation des lots, durées selon l\'effectif de l\'équipe, dates', () => {
  const lots = [{ etudeId: 'e1', lots: [{ lot: 'preparation', heures: 35, cles: [] }, { lot: 'reseaux', heures: 280, cles: ['tube'] }, { lot: 'production', heures: 56, cles: ['pac'] },
    { lot: 'cta', heures: 28, cles: [] }, { lot: 'terminaux', heures: 56, cles: [] }, { lot: 'regulation', heures: 14, cles: [] }] }];
  let n = 0; const uid = () => `p${++n}`;
  assert.deepStrictEqual(P.equipesDe({ nbEquipes: 2, effectifEquipe: 3 }), [{ id: 'E1', nom: 'Équipe 1', effectif: 3 }, { id: 'E2', nom: 'Équipe 2', effectif: 3 }]);
  assert.strictEqual(P.equipesDe({}), null, 'sans équipes : proposition historique');
  const ph = P.proposer(lots, { nbEquipes: 2, effectifEquipe: 2, heuresJour: 7, debut: '2026-11-16', uid }), de = k => ph.find(p => p.lot === k);
  // Durées : réseaux 280 / (2 × 7) = 20 j ; production 56 / 14 = 4 ; CTA 2 ; terminaux 4 ; régulation 1 ;
  // essais max(14, 8 % de 434 h = 35 h) / 14 = 3 j ; DOE 3 j au bureau
  assert.deepStrictEqual(ph.map(p => [p.lot, p.duree, p.equipeId || '']), [['preparation', 15, ''], ['reseaux', 20, 'E1'], ['production', 4, 'E2'], ['cta', 2, 'E1'], ['terminaux', 4, 'E1'], ['regulation', 1, 'E2'], ['essais', 3, 'E1'], ['doe', 3, '']]);
  // Dépendances techniques multiples (réduction transitive : essais après la régulation seule)
  assert.deepStrictEqual(de('regulation').apres, [de('production').id, de('cta').id, de('terminaux').id]);
  assert.deepStrictEqual(de('essais').apres, [de('regulation').id]);
  assert.deepStrictEqual(de('cta').apres, [de('reseaux').id]);
  const g = G.calculer({ id: 'c', phases: ph, equipes: P.equipesDe({ nbEquipes: 2, effectifEquipe: 2 }), ganttRecaler: false }, { aujourdhui: '2026-11-16' }), d = k => { const p = g.phases.find(x => x.lot === k); return [p.debut, p.fin]; };
  assert.deepStrictEqual(['preparation', 'reseaux', 'production', 'cta', 'terminaux', 'regulation', 'essais', 'doe'].map(d), [
    ['2026-11-16', '2026-12-04'], ['2026-12-07', '2027-01-01'], ['2027-01-04', '2027-01-07'], ['2027-01-04', '2027-01-05'], ['2027-01-06', '2027-01-11'], ['2027-01-12', '2027-01-12'], ['2027-01-13', '2027-01-15'], ['2027-01-18', '2027-01-20']]);
  assert.deepStrictEqual(g.phases.filter(p => !p.critique).map(p => p.lot), ['production'], 'production en parallèle, 2 j de marge');
  // Affectation choisie : CTA à l'équipe 2, après la production (même équipe) ; terminaux libérés pour l'équipe 1
  n = 0;
  const ph2 = P.proposer(lots, { nbEquipes: 2, effectifEquipe: 2, debut: '2026-11-16', uid, affectation: { cta: 'E2' } });
  const g2 = G.calculer({ id: 'c', phases: ph2, ganttRecaler: false }, { aujourdhui: '2026-11-16' }), d2 = k => { const p = g2.phases.find(x => x.lot === k); return [p.debut, p.fin]; };
  assert.deepStrictEqual([d2('production'), d2('cta'), d2('terminaux'), d2('regulation')], [['2027-01-04', '2027-01-07'], ['2027-01-08', '2027-01-11'], ['2027-01-04', '2027-01-07'], ['2027-01-12', '2027-01-12']]);
  // Trois équipes : la CTA à la troisième ; effectifs différents par équipe
  n = 0;
  const ph3 = P.proposer(lots, { equipes: [{ id: 'A', nom: 'A', effectif: 4 }, { id: 'B', nom: 'B', effectif: 2 }, { id: 'C', nom: 'C', effectif: 1 }], uid });
  assert.deepStrictEqual(ph3.filter(p => p.equipeId).map(p => [p.lot, p.equipeId, p.duree]), [['reseaux', 'A', 10], ['production', 'B', 4], ['cta', 'C', 4], ['terminaux', 'A', 2], ['regulation', 'B', 1], ['essais', 'A', 2]]);
});
