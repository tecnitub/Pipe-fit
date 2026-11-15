// Planning du chantier relié à l'étude : lots et durées tirés des heures du métré selon l'effectif, enchaînements,
// matériel à avoir reçu avant chaque tâche et alertes d'approvisionnement (commande, livraison prévue, réception).
const { test } = require('node:test');
const assert = require('node:assert');
const P = require('../public/js/planning-etude');
const G = require('../public/js/gantt-calc');
const M = require('../public/js/materiel-retenu');

const postes = [
  { cle: 'be', chapitre: 'Études', designation: 'Études d\'exécution', unite: 'forfait', qte: 1, heures: 35 },
  { cle: 'tube|acier|50', chapitre: 'Tuyauteries', designation: 'Tuyauterie acier DN 50', unite: 'ml', qte: 200, heures: 0.7 },
  { cle: 'iso|laine|30|50', chapitre: 'Calorifuge', designation: 'Calorifuge', unite: 'ml', qte: 200, heures: 0.21 },
  { cle: 'gen|pac-air|120', chapitre: 'Production', designation: 'PAC air/eau 120 kW', unite: 'u', qte: 1, heures: 16 },
  { cle: 'pompe|c1', chapitre: 'Équipements hydrauliques', designation: 'Pompe double DN 40', unite: 'u', qte: 2, heures: 3 },
  { cle: 'aero|cta-df|3000', chapitre: 'Aéraulique', designation: 'CTA double flux 3000 m³/h', unite: 'u', qte: 1, heures: 16 },
  { cle: 'gaine|400x200', chapitre: 'Aéraulique', designation: 'Gaine 400x200', unite: 'm²', qte: 100, heures: 0.6 },
  { cle: 'bouche|soufflage|600', chapitre: 'Aéraulique', designation: 'Diffuseur plafond 600x600', unite: 'u', qte: 40, heures: 0.75 },
  { cle: 'annexe|terminaux|VC1', chapitre: 'Émetteurs', designation: 'Ventilo-convecteur', unite: 'u', qte: 10, heures: 3 },
  { cle: 'cctp|regulation|armoire', chapitre: 'Régulation et sécurités', designation: 'Armoire de régulation', unite: 'u', qte: 1, heures: 8 },
];

test('heures du métré par lot, avec les équipements de chaque lot', () => {
  const h = P.heuresMetre(postes), lot = k => h.find(x => x.lot === k);
  assert.deepStrictEqual(h.map(x => x.lot), ['preparation', 'reseaux', 'production', 'cta', 'terminaux', 'regulation']);
  assert.strictEqual(lot('reseaux').heures, 140 + 42 + 6 + 60);
  assert.deepStrictEqual(lot('reseaux').cles, ['pompe|c1']);
  assert.deepStrictEqual(lot('cta').cles, ['aero|cta-df|3000']);
  assert.deepStrictEqual(lot('terminaux').cles, ['bouche|soufflage|600', 'annexe|terminaux|VC1']);
  assert.strictEqual(lot('terminaux').heures, 60);
});

test('proposition : durées selon l\'effectif, enchaînements, essais et DOE ; deux équipes en parallèle', () => {
  let n = 0;
  const uid = () => `p${++n}`;
  const lots = [{ etudeId: 'e1', lots: P.heuresMetre(postes) }];
  const ph = P.proposer(lots, { effectif: 2, heuresJour: 7, debut: '2026-11-16', uid }), de = k => ph.find(p => p.lot === k);
  assert.deepStrictEqual(ph.map(p => p.lot), ['preparation', 'reseaux', 'production', 'cta', 'terminaux', 'regulation', 'essais', 'doe']);
  assert.strictEqual(de('reseaux').duree, Math.ceil(248 / 14));
  assert.strictEqual(de('preparation').duree, 15, 'approvisionnement : 15 jours ouvrés au moins');
  assert.strictEqual(de('preparation').debut, '2026-11-16');
  assert.deepStrictEqual(de('production').apres, [de('reseaux').id]);
  assert.deepStrictEqual(de('cta').apres, [de('production').id], 'une seule équipe : la CTA après la production');
  assert.deepStrictEqual(de('terminaux').apres, [de('cta').id, de('production').id]);
  assert.deepStrictEqual(de('doe').apres, [de('essais').id]);
  assert.deepStrictEqual(de('production').materiel, ['e1|gen|pac-air|120']);
  assert.strictEqual(de('essais').heures, Math.max(14, Math.round((248 + 16 + 16 + 60 + 8) * 0.08)));
  // Plus de compagnons : durées plus courtes, production et CTA en parallèle après les réseaux
  const ph4 = P.proposer(lots, { effectif: 4, uid });
  assert.strictEqual(ph4.find(p => p.lot === 'reseaux').duree, Math.ceil(248 / 28));
  assert.deepStrictEqual(ph4.find(p => p.lot === 'cta').apres, [ph4.find(p => p.lot === 'reseaux').id]);
  assert.strictEqual(ph4.find(p => p.lot === 'cta').equipe, 2);
  // Calcul des dates par le Gantt du chantier
  const g = G.calculer({ id: 'A1', phases: ph, ganttRecaler: false }, { aujourdhui: '2026-11-16' });
  assert.deepStrictEqual(g.alertes, []);
  const d = k => g.phases.find(p => p.lot === k);
  assert.ok(d('production').debut > d('reseaux').fin && d('terminaux').debut > d('cta').fin && d('doe').debut > d('essais').fin);
  assert.deepStrictEqual(P.proposer([{ etudeId: 'e1', lots: [] }]), []);
});

test('alertes : tâche qui démarre avant la réception prévue, matériel pas encore commandé, commande sans date', () => {
  const phases = [
    { id: 'x1', libelle: 'Production', debut: '2026-12-01', materiel: ['e1|gen|pac-air|120', 'e1|pompe|c1'] },
    { id: 'x2', libelle: 'CTA', debut: '2026-12-10', materiel: ['e1|aero|cta-df|3000'] },
    { id: 'x3', libelle: 'Terminaux', debut: '2027-03-01', materiel: ['e1|bouche|soufflage|600', 'e1|inconnue'] },
  ];
  const materiel = [
    { etudeId: 'e1', cle: 'gen|pac-air|120', designation: 'PAC air/eau 120 kW', fabricant: 'Exemplair', reference: 'PX-120', commande: { numero: 'CMD-1', datePrevue: '2026-12-05' }, livraison: 'non livrée' },
    { etudeId: 'e1', cle: 'pompe|c1', designation: 'Pompe double', commande: { numero: 'CMD-1' }, livraison: 'livrée' },
    { etudeId: 'e1', cle: 'aero|cta-df|3000', designation: 'CTA', consultation: { ref: 'CF-1', offres: 1 } },
    { etudeId: 'e1', cle: 'bouche|soufflage|600', designation: 'Diffuseur', commande: { numero: 'CMD-2' }, livraison: 'non livrée' },
  ];
  const r = P.alertes(phases, materiel, { aujourdhui: '2026-11-20', etatAchat: M.etatAchat });
  assert.deepStrictEqual(r.alertes.map(a => [a.phaseId, a.niveau]), [['x1', 'erreur'], ['x2', 'attention'], ['x3', 'attention']]);
  assert.match(r.alertes[0].texte, /PAC air\/eau 120 kW \(Exemplair PX-120\) : livraison prévue le 2026-12-05, après le début de « Production » \(2026-12-01\)/);
  assert.match(r.alertes[1].texte, /consulté, pas encore commandé .*dans 20 j/);
  assert.match(r.alertes[2].texte, /commandé sans date de livraison/);
  assert.deepStrictEqual(r.bilan.x1, { total: 2, recus: 1, commandes: 1, aCommander: 0, retards: 1, inconnus: 0 });
  assert.strictEqual(r.bilan.x3.inconnus, 1);
  // Délai d'approvisionnement : une tâche lointaine non commandée n'alerte pas encore
  assert.strictEqual(P.alertes([{ ...phases[1], debut: '2027-06-01' }], materiel, { aujourdhui: '2026-11-20', etatAchat: M.etatAchat }).alertes.length, 0);
});
