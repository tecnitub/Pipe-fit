const test = require('node:test');
const assert = require('node:assert');
global.Securite = require('../public/js/securite');
const Pgc = require('../public/js/pgc');

// PGC fictif, mis en page comme un export PDF (colonnes séparées par des tabulations)
const lignes = [
  'Agence SPS Exemple', '12 rue des Lilas', '26000 VALENCE', 'Tel 04 75 00 00 00', 'sps@exemple-controles.fr',
  'Référence\t: X12 PGC - PGC 1', 'Date d\'édition\t: 15/02/2026', 'OPERATION', 'CONSTRUCTION D\'UN ATELIER', '10 rue de la Gare', '26100 ROMANS',
  'Le coordonnateur SPS', 'Jean MARTIN',
  '2.1 Description succincte', 'Nom de l\'opération :\tCONSTRUCTION D\'UN ATELIER', 'Adresse :\t10 rue de la Gare', '\t26100 - ROMANS',
  'L\'opération est classée par le Maître d\'ouvrage en catégorie 2.',
  'L\'effectif moyen prévisionnel pour les travaux est de : 8 personnes', 'L\'effectif de pointe prévisionnel est de : 15 personnes',
  'La durée d\'exécution des travaux est de : 12 mois de travaux',
  '3 PRESENTATION DES INTERVENANTS', '3.1 Intervenants Maîtrise d\'ouvrage - Maîtrise d\'Oeuvre', 'Désignation\tRaison sociale / Responsable\tAdresse/Téléphone/Fax/Mail',
  'Maître d\'ouvrage\tSOCIETE EXEMPLE\t1 place du Marché', '\t\t75001 PARIS', '\t\tTel : 01-00-00-00-00', '\tMonsieur DUPONT Paul\tp.dupont@exemple.fr',
  'Architecte\tATELIER ARCHI\t5 rue Haute', '\t\t69000 LYON', '\t\tTel : 04.00.00.00.01',
  '3.2 Organismes de prévention',
  'Locaux communs à toutes les entreprises – Base vie\tGO\tGO',
  'Tout stockage ou entreposage, devra être correctement calé ou stabilisé avec des\tEC\tEC', 'moyens adaptés aux équipements.',
  'Les installations électriques de chantier doivent être vérifiées par un organisme agréé\tGO', 'avant toute mise en service.',
  'Extincteur conservé à proximité des travaux par points chauds et surveillance pendant\tEC\tEC', '2 heures après la fin de ces travaux.',
  'Lorsque les trémies seront débouchées pour le passage des réseaux, l\'entreprise\tEL-PB-CVC\tEC', 'concernée replacera un platelage fixé au sol.',
  'CHAR\tCVC\tLevage de charges\tAvant couverture',
];

test('PGC : opération, intervenants, coordonnateur, effectifs', () => {
  const r = Pgc.analyser(lignes);
  assert.strictEqual(r.operation, 'CONSTRUCTION D\'UN ATELIER');
  assert.match(r.adresse, /10 rue de la Gare, 26100 ROMANS/);
  assert.strictEqual(r.moa, 'SOCIETE EXEMPLE');
  assert.deepStrictEqual(r.intervenants.map(x => x.role), ['Maître d\'ouvrage', 'Architecte']);
  assert.strictEqual(r.intervenants[0].contact, 'Monsieur DUPONT Paul');
  assert.strictEqual(r.intervenants[0].email, 'p.dupont@exemple.fr');
  assert.strictEqual(r.intervenants[1].tel, '04 00 00 00 01');
  assert.match(r.coordonnateur, /^Jean MARTIN/);
  assert.strictEqual(r.coordTel, '04 75 00 00 00');
  assert.strictEqual(r.coordEmail, 'sps@exemple-controles.fr');
  assert.strictEqual(r.categorie, 2);
  assert.strictEqual(r.effectif, 8); assert.strictEqual(r.effectifMax, 15);
  assert.strictEqual(r.duree, '12 mois');
  assert.match(r.baseVie, /Gros œuvre/);
  assert.deepStrictEqual(r.moyensCommuns.length, 1);
});

test('PGC : exigences à la charge de l\'entreprise ou du lot CVC, pas celles du gros œuvre', () => {
  const r = Pgc.analyser(lignes);
  const t = r.exigences.map(e => e.texte);
  assert.ok(t.some(x => /correctement calé/.test(x)));
  assert.ok(t.some(x => /points chauds/.test(x) && /2 heures/.test(x)));
  assert.ok(t.some(x => /trémies/.test(x)));
  assert.ok(!t.some(x => /organisme agréé/.test(x)));
  assert.ok(r.risques.includes('feu'));
  assert.strictEqual(Pgc.lireDate('le 3 mars 2027'), '2027-03-03');
});
