// Fiches de mise en service par équipement : contrôles et mesures du PV, valeurs attendues de l'étude, document
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/industriel');
require('../etudes/public/js/cta');
global.Terminaux = require('../etudes/public/js/terminaux');
global.Schema = require('../etudes/public/js/schema');
global.Sanitaire = require('../etudes/public/js/sanitaire');
const L = require('../etudes/public/js/liens');
const F = require('../etudes/public/js/fiches-mes');
const Es = require('../public/js/essais');
const PM = require('../public/js/plan-mes');

const etude = () => {
  const t = N.defauts('terminaux');
  t.appareils = [{ rep: 'CA-01', local: 'Bureau 1', type: 'cassette4', n: 2, Pch: 3, Pfr: 3.6, batterie: '4t', vanne: '2v', Pvent: 50, alim: 'cvc' }];
  return { id: 'x', objet: 'Bureaux', client: 'Client', indice: 'B', notes: [{ id: 'p', type: 'pid', titre: 'Chaufferie', entrees: N.defauts('pid') }, { id: 't', type: 'terminaux', titre: 'Terminaux', entrees: t }] };
};

test('fiches : une par équipement, unités multiples éclatées, attendus de l\'étude', () => {
  const et = etude(), l = F.fiches(et, n => L.calculer(et, n));
  const cas = l.filter(f => f.type === 'terminal');
  assert.deepStrictEqual(cas.map(f => f.repere), ['CA-01.1', 'CA-01.2']);
  const m = cas[0].mesures, att = lib => (m.find(x => x.libelle === lib) || {}).attendu;
  assert.strictEqual(att('Puissance chaud'), 3);
  assert.strictEqual(att('Puissance froid'), 3.6);
  assert.ok(att('Débit d\'eau') > 0);
  // Contrôles du PV « terminal » repris, mesures du PV sans valeur attendue conservées (à relever)
  assert.deepStrictEqual(cas[0].controles, Es.TYPES.terminal.controles);
  assert.ok(m.some(x => x.libelle === 'Température de soufflage' && x.attendu === null));
  const gen = l.filter(f => f.type === 'chaudiere');
  assert.ok(gen.length >= 1 && gen[0].mesures.some(x => x.libelle === 'Température départ eau' && x.attendu === 70));
  assert.ok(l.some(f => f.type === 'pompes' && /Pompe du circuit/.test(f.titre)));
});

test('fiches : document une page par fiche, cases à cocher, colonnes à remplir', () => {
  const et = etude(), l = F.fiches(et, n => L.calculer(et, n)), h = F.html(et, l, { societe: { nom: 'TECNITUB' } });
  assert.strictEqual((h.match(/FICHE DE MISE EN SERVICE/g) || []).length, l.length);
  assert.strictEqual((h.match(/pdf-saut/g) || []).length, l.length - 1);
  assert.match(h, /Attendu \(étude\)/);
  assert.match(h, /Mesuré/);
  assert.match(h, /indice B/);
  assert.strictEqual(F.tolerance('Température départ eau', '°C'), '± 2 K');
});

test('plan de mise en service : une tâche par terminal, repère et local dans le PV', () => {
  const et = etude(), PMe = require('../etudes/public/js/points-mes'), mes = PMe.extraire(et, n => L.calculer(et, n));
  const pts = PM.pointsChantier([{ app: 'etudes', id: 'e1', resume: { objet: 'Bureaux', mes } }]);
  const ts = PM.plan({ affaireId: 'a', points: pts }).filter(t => t.type === 'terminal');
  assert.strictEqual(ts.length, 2);
  assert.notStrictEqual(ts[0].cle, ts[1].cle);
  assert.match(ts[0].lien, /repere=CA-01\.1/);
  assert.match(ts[0].lien, /localisation=Bureau%201/);
});

test('chantier : fiche à remplir depuis une tâche de la liste, PV signé = fait', () => {
  const et = etude(), PMe = require('../etudes/public/js/points-mes'), mes = PMe.extraire(et, n => L.calculer(et, n));
  const pts = PM.pointsChantier([{ app: 'etudes', id: 'e1', resume: { objet: 'Bureaux', mes } }]);
  let ts = PM.plan({ affaireId: 'a', points: pts });
  const t = ts.find(x => x.repere === 'CA-01.1');
  const f = F.depuisPoint(t);
  assert.strictEqual(f.titre, t.libelle);
  assert.strictEqual(f.local, 'Bureau 1');
  assert.strictEqual(f.mesures.find(m => m.libelle === 'Puissance chaud').attendu, 3);
  // PV signé rattaché à la tâche : point fait (et repris dans le DOE, annexe F)
  ts = PM.plan({ affaireId: 'a', points: pts, pv: { mises: [{ id: 'pv1', affaireId: 'a', planCle: t.cle, statut: 'Signé', resultat: 'Mis en service', date: '2026-11-04' }] } });
  assert.strictEqual(ts.find(x => x.cle === t.cle).etat, 'fait');
  assert.strictEqual(ts.find(x => x.repere === 'CA-01.2').etat, 'aFaire');
});
