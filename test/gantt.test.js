// Gantt des chantiers : enchaînement des phases, recalage sur le planning, glissement des phases en retard, charge.
const { test } = require('node:test');
const assert = require('node:assert');
const G = require('../public/js/gantt-calc');

const AUJ = '2026-10-28'; // mercredi
const ch = (phases, extra = {}) => ({ id: 'a1', phases, ...extra });
const resume = r => r.phases.map(p => [p.id, p.debut, p.fin, p.etat]);

test('jours ouvrés : week-ends sautés', () => {
  assert.strictEqual(G.ajouterOuvres('2026-10-30', 1), '2026-11-02');
  assert.strictEqual(G.ajouterOuvres('2026-10-31', 0), '2026-11-02');
  assert.strictEqual(G.ouvresEntre('2026-10-26', '2026-11-08'), 10);
  assert.strictEqual(G.semaineIso('2026-12-31'), '2026-W53');
});

test('phases enchaînées : la suivante démarre le jour ouvré après la fin de la précédente, plus le décalage', () => {
  const r = G.calculer(ch([
    { id: 'p', libelle: 'Préfabrication', debut: '2026-11-02', duree: 5 },
    { id: 'm', libelle: 'Montage', duree: 3, apres: ['p'] },
    { id: 'e', libelle: 'Essais', duree: 1, apres: ['m'], decalage: 2 },
  ]), { aujourdhui: AUJ });
  assert.deepStrictEqual(resume(r), [['p', '2026-11-02', '2026-11-06', 'à venir'], ['m', '2026-11-09', '2026-11-11', 'à venir'], ['e', '2026-11-16', '2026-11-16', 'à venir']]);
  assert.strictEqual(r.phases[1].contrainte, 'Préfabrication');
  assert.deepStrictEqual([r.debut, r.fin], ['2026-11-02', '2026-11-16']);
});

test('recalage sur le planning : la phase suit les affectations, les suivantes se décalent', () => {
  const phases = [{ id: 'p', libelle: 'Préfabrication', tache: 'Préfabrication', debut: '2026-11-02', duree: 3, heures: 60 }, { id: 'm', libelle: 'Montage', tache: 'Montage', duree: 2, apres: ['p'] }];
  const planning = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09'].map(date => ({ affaireId: 'a1', date, tache: 'Préfabrication', heuresPrevues: 7 }));
  const r = G.calculer(ch(phases), { aujourdhui: AUJ, planning, temps: [{ affaireId: 'a1', date: '2026-10-27', tache: 'Préfabrication', heures: 8 }] });
  // Pointé dès le 27/10 : la phase a commencé, elle va jusqu'au dernier jour planifié
  assert.deepStrictEqual(resume(r), [['p', '2026-10-27', '2026-11-09', 'en cours'], ['m', '2026-11-10', '2026-11-11', 'à venir']]);
  assert.deepStrictEqual([r.phases[0].source, r.phases[0].pointees, r.phases[0].reste, r.phases[0].planifieesAVenir], ['planning', 8, 52, 28]);
  // Sans recalage : dates prévues seules
  assert.deepStrictEqual(resume(G.calculer(ch(phases, { ganttRecaler: false }), { aujourdhui: AUJ, planning }))[0], ['p', '2026-11-02', '2026-11-04', 'à venir']);
});

test('phase non commencée dont la date est passée : elle glisse à aujourd\'hui avec les suivantes', () => {
  const r = G.calculer(ch([{ id: 'p', libelle: 'Préfa', debut: '2026-10-19', duree: 2 }, { id: 'm', libelle: 'Montage', duree: 1, apres: ['p'] }, { id: 'x', libelle: 'Fait', debut: '2026-10-01', duree: 1, termine: true }]), { aujourdhui: AUJ });
  assert.deepStrictEqual(resume(r), [['p', '2026-10-28', '2026-10-29', 'en cours'], ['m', '2026-10-30', '2026-10-30', 'à venir'], ['x', '2026-10-01', '2026-10-01', 'terminée']]);
  assert.strictEqual(r.retard, 7);
});

test('boucle de dépendances signalée sans planter ; charge à venir répartie par semaine', () => {
  const b = G.calculer(ch([{ id: 'a', libelle: 'A', apres: ['b'] }, { id: 'b', libelle: 'B', apres: ['a'] }]), { aujourdhui: AUJ });
  assert.ok(b.alertes.length >= 1);
  const r = G.calculer(ch([{ id: 'p', libelle: 'P', debut: '2026-10-29', duree: 4, heures: 40 }]), { aujourdhui: AUJ });
  assert.deepStrictEqual(G.chargeParSemaine(r.phases, AUJ), { '2026-W44': 20, '2026-W45': 20 });
  const types = G.phasesTypes(400, '2026-11-02', (() => { let i = 0; return () => `ph${++i}`; })());
  assert.deepStrictEqual(types.map(p => [p.heures, p.duree, p.apres[0] || '']), [[20, 10, ''], [140, 10, 'ph1'], [180, 13, 'ph2'], [40, 3, 'ph3'], [20, 2, 'ph4']]);
});

test('phase terminée : une affectation future sur la même tâche ne la rouvre pas', () => {
  const r = G.calculer(ch([{ id: 'e', libelle: 'Études', tache: 'Études', debut: '2026-10-05', duree: 5, termine: true }]),
    { aujourdhui: AUJ, planning: [{ affaireId: 'a1', date: '2026-11-05', tache: 'Études', heuresPrevues: 7 }], temps: [{ affaireId: 'a1', date: '2026-10-06', tache: 'Études', heures: 8 }] });
  assert.deepStrictEqual(resume(r), [['e', '2026-10-06', '2026-10-06', 'terminée']]);
  assert.strictEqual(r.phases[0].reste, 0);
});
