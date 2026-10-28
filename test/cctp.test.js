// Lecture d'un CCTP : références du lot, articles (sommaire puis corps), équipements avec repères, numérotation.
const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../public/js/cctp-lecture');

const CCTP = [
  'CONSERVATOIRE DE MUSIQUE – RESTRUCTURATION', 'CAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES', 'LOT N° 14 – CHAUFFAGE VENTILATION PLOMBERIE',
  'Indice B du 12/03/2025', 'Affaire n° 23-045', 'Maître d\'ouvrage : Ville de Grenoble', 'BET Fluides : Ingérop Conseil',
  'SOMMAIRE', '1 Généralités ........ 3', '1.1 Objet du présent CCTP ........ 3', '3.1 Pompe à chaleur air / eau ........ 12', '3.2 Centrales de traitement d\'air ........ 15', '3.3 Circulateurs ........ 18', '3.4 Radiateurs ........ 19', '4.2 Essais et mise en service ........ 25',
  '1.1 Objet du présent CCTP', 'Le présent document définit les travaux de chauffage.',
  '3.1 Pompe à chaleur air / eau', 'Fourniture et pose d\'une pompe à chaleur repère PAC-01 de marque Daikin type EWYT 045 ou équivalent.', 'Puissance calorifique : 45 kW.',
  '3.2 Centrales de traitement d\'air', 'Les centrales CTA 1 et CTA 2 assurent le traitement des salles.', 'Débit soufflage : 3 200 m3/h.',
  '3.3 Circulateurs', 'Circulateurs à vitesse variable, quantité : 4.',
  '3.4 Radiateurs', 'Radiateurs acier, 18 unités, robinets thermostatiques.',
  '4.2 Essais et mise en service', 'Essais de pression des réseaux, équilibrage.',
];

test('références du lot : n°, intitulé, indice et date, affaire, maître d\'ouvrage, BET, opération', () => {
  const r = C.analyser(CCTP);
  assert.deepStrictEqual([r.lot, r.lotLibelle, r.indice, r.date, r.dossier, r.moa, r.bet],
    ['14', 'CHAUFFAGE VENTILATION PLOMBERIE', 'B', '2025-03-12', '23-045', 'Ville de Grenoble', 'Ingérop Conseil']);
  assert.strictEqual(r.operation, 'CONSERVATOIRE DE MUSIQUE – RESTRUCTURATION');
  assert.strictEqual(C.analyser(['CCTP', 'Opération : Collège Jean Moulin – extension', 'Lot 7 – Plomberie']).operation, 'Collège Jean Moulin – extension');
});

test('articles : sommaire et corps réunis (un article par numéro, titre sans points de conduite)', () => {
  const r = C.analyser(CCTP);
  assert.deepStrictEqual(r.articles.map(a => a.num), ['1.1', '3.1', '3.2', '3.3', '3.4', '4.2']);
  assert.strictEqual(r.articles.find(a => a.num === '3.2').titre, 'Centrales de traitement d\'air');
});

test('équipements : un par repère du CCTP, sinon une ligne avec quantité ; prescription et caractéristiques', () => {
  const eq = C.analyser(CCTP).equipements;
  assert.deepStrictEqual(eq.map(e => [e.article, e.famille, e.repere, e.quantite]),
    [['3.1', '3.1', 'PAC-01', 1], ['3.2', '3.4', 'CTA-1', 1], ['3.2', '3.4', 'CTA-2', 1], ['3.3', '3.7', '', 4], ['3.4', '3.2', '', 18]]);
  assert.strictEqual(eq[0].prescrit, 'marque Daikin, type EWYT 045 ou équivalent');
  assert.strictEqual(eq[0].caract, '45 kW');
  assert.strictEqual(eq[1].caract, '3 200 m³/h');
});

test('numérotation : suite par préfixe après les repères existants', () => {
  const eqs = [{ designation: 'Pompe à chaleur', famille: '3.1', repere: 'PAC-01' }, { designation: 'Pompe à chaleur air/eau', famille: '3.1', repere: '' },
    { designation: 'Circulateur double', famille: '3.7', repere: '' }, { designation: 'Ventilo-convecteur gainable', famille: '3.2', repere: '' }, { designation: 'Bidule', famille: '', repere: '' }];
  assert.strictEqual(C.numeroter(eqs), 4);
  assert.deepStrictEqual(eqs.map(e => e.repere), ['PAC-01', 'PAC-02', 'P-01', 'VC-01', 'EQ-01']);
  assert.deepStrictEqual(C.reperes('Pompes P1, P-02 et page p 12 ; UE 3'), ['P-1', 'P-02', 'UE-3']);
  assert.strictEqual(C.dateIso('édition du 3 février 2026'), '2026-02-03');
  // « contrôlée » n'est pas un article de contrôle ; « Contrôles et essais » n'est pas un équipement
  assert.deepStrictEqual([C.typeDe('Ventilation mécanique contrôlée')[2], C.typeDe('Contrôles des réseaux')], ['VMC', null]);
});
