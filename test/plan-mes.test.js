const test = require('node:test');
const assert = require('node:assert');
const Notes = require('../etudes/public/js/notes');
require('../etudes/public/js/cta');
require('../etudes/public/js/industriel');
const PointsMes = require('../etudes/public/js/points-mes');
const PlanMes = require('../public/js/plan-mes');

const etude = { notes: [
  { id: 'n1', type: 'reseau', titre: 'Boucle eau chaude — pompe P1', entrees: {} },
  { id: 'n2', type: 'vase', titre: 'Vase boucle eau chaude', entrees: {} },
  { id: 'n3', type: 'desp', titre: 'Réseau eau surchauffée', entrees: {} },
  { id: 'n4', type: 'cta', titre: 'CTA bureaux', entrees: {} },
  { id: 'n5', type: 'gaz', titre: 'Alimentation gaz chaufferie', entrees: {} },
  { id: 'n6', type: 'isolation', titre: 'Isolation', entrees: {} },
] };
const calc = n => Notes.calculer(n.type, n.entrees);

test('Points de mise en service tirés des calculs', () => {
  const pts = PointsMes.extraire(etude, calc);
  const pompe = pts.find(p => p.nature === 'mes' && p.type === 'pompes');
  assert.ok(pompe && /^pompe\|/.test(pompe.cle));
  assert.ok(pompe.attendus.some(a => a.libelle === 'Débit' && a.valeur > 0));
  assert.ok(pompe.attendus.some(a => a.libelle === 'Hauteur manométrique'));
  const vase = pts.find(p => p.type === 'vase');
  assert.ok(vase.attendus.some(a => /gonflage/.test(a.libelle)));
  const desp = pts.find(p => p.nature === 'epreuve' && p.noteId === 'n3');
  assert.ok(desp.PT > 14 && desp.categorie === 2);
  assert.ok(pts.some(p => p.nature === 'controle' && /DESP catégorie II/.test(p.titre)));
  assert.ok(pts.some(p => p.nature === 'epreuve' && p.natureReseau === 'Gaz'));
  assert.ok(pts.some(p => p.type === 'cta' && /^cta\|/.test(p.cle)));
  assert.ok(!pts.some(p => p.noteId === 'n6'));
});

test('Liste des mises en service du chantier et état par les PV', () => {
  const liens = [{ app: 'etudes', id: 'e1', affaireId: 'a1', resume: { objet: 'Étude', mes: PointsMes.extraire(etude, calc) } }];
  const points = PlanMes.pointsChantier(liens);
  const cleP = points.find(p => p.type === 'pompes').cle;
  const materiel = [{ etudeId: 'e1', cle: cleP, designation: 'Circulateur P1', qte: 1, fabricant: 'Exemple', reference: 'P-50', valide: true, poseLe: '2026-10-01' },
    { etudeId: 'e1', cle: 'bouche|DF|160', designation: 'Diffuseur', qte: 12, valide: true }];
  const debits = [{ etude: 'Étude', installation: 'CTA 1 bureaux', type: 'Aéraulique', unite: 'm³/h', lignes: [{ repere: 'B1', theorique: 120 }] }];
  let ts = PlanMes.plan({ affaireId: 'a1', materiel, points, debits });
  const p1 = ts.find(t => t.libelle === 'Circulateur P1');
  assert.ok(p1 && p1.etat === 'aFaire' && p1.attendus.length >= 2 && /att=/.test(p1.lien));
  assert.ok(!ts.some(t => t.libelle === 'Diffuseur'));
  assert.ok(!ts.some(t => t.cle.startsWith('pt|') && t.type === 'pompes'), 'valeurs de la pompe rattachées au matériel');
  const ep = ts.find(t => t.nature === 'epreuve' && /surchauff/.test(t.libelle));
  assert.ok(/pt=1[45]/.test(ep.lien));
  const eq = ts.find(t => t.nature === 'equilibrage');
  assert.ok(/installation=CTA/.test(eq.lien));
  assert.strictEqual(ts[0].groupe, PlanMes.GROUPES[0]);
  // PV signés : mise en service, épreuve non conforme, équilibrage en brouillon
  const pv = { mises: [{ id: 'm1', affaireId: 'a1', materiel: `e1|${cleP}`, statut: 'Signé', resultat: 'Mis en service', numero: 'MES-1', date: '2026-10-02' }],
    epreuves: [{ id: 'p1', affaireId: 'a1', reseau: 'Réseau eau surchauffée', statut: 'Signé', resultat: 'Non conforme' }],
    equilibrages: [{ id: 'q1', affaireId: 'a1', installation: 'CTA 1 bureaux', statut: 'Brouillon' }] };
  let suivi = PlanMes.marquer({}, 'fin|0', 'fait', true, 'Jacky', '2026-10-03');
  suivi = PlanMes.marquer(suivi, 'fin|1', 'sansObjet', true, 'Jacky', '2026-10-03');
  ts = PlanMes.plan({ affaireId: 'a1', materiel, points, debits, pv, suivi: { ...suivi, manuelles: [{ id: 'x', libelle: 'Essai groupe électrogène' }] } });
  const et = c => ts.find(t => t.cle === c || t.libelle === c).etat;
  assert.strictEqual(et('Circulateur P1'), 'fait');
  assert.strictEqual(ts.find(t => t.nature === 'epreuve' && /surchauff/.test(t.libelle)).etat, 'ko');
  assert.strictEqual(ts.find(t => t.nature === 'equilibrage').etat, 'enCours');
  assert.strictEqual(et('fin|0'), 'fait');
  assert.strictEqual(et('fin|1'), 'sansObjet');
  assert.strictEqual(et('Essai groupe électrogène'), 'aFaire');
  const b = PlanMes.bilan(ts);
  assert.ok(b.faits >= 2 && b.ko === 1 && b.sansObjet === 1 && b.utiles === b.total - 1);
});

test('Valeurs attendues dans le PV de mise en service', () => {
  const a = PlanMes.lireAttendus(JSON.stringify([['Débit', 12, 'm³/h'], ['Hauteur manométrique', 8.3, 'mCE'], ['x', 'abc', '']]));
  assert.strictEqual(a.length, 2);
  const m = PlanMes.avecAttendus([{ libelle: 'Débit', unite: 'm³/h', valeur: '' }, { libelle: 'Intensité', unite: 'A', valeur: '' }], a);
  assert.strictEqual(m[0].attendu, 12);
  assert.strictEqual(m.length, 3);
  assert.strictEqual(PlanMes.ecart({ valeur: '13,2', attendu: 12 }), 10);
  assert.strictEqual(PlanMes.ecart({ valeur: '', attendu: 12 }), null);
  assert.strictEqual(PlanMes.propre({ nature: 'autre' }), null);
});

test('plan : liste de points GTB reprise de l\'étude (tests point à point)', () => {
  const PM = require('../public/js/plan-mes');
  const pts = PM.pointsChantier([{ app: 'etudes', id: 'e1', resume: { objet: 'Étude', mes: [{ nature: 'mes', noteId: 'n1', type: 'gtb', titre: 'Tests point à point GTB — 2 points', controles: ['CA-01.01 — Marche (TC)', 'CA-01.02 — Défaut (TA)'] }] } }]);
  const t = PM.plan({ affaireId: 'a1', points: pts }).find(x => x.type === 'gtb');
  assert.deepStrictEqual(t.controles, ['CA-01.01 — Marche (TC)', 'CA-01.02 — Défaut (TA)']);
  assert.match(t.detail, /2 point/);
});
