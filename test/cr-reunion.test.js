const test = require('node:test');
const assert = require('node:assert');
const CR = require('../public/js/cr-reunion');

// Compte rendu fictif : en-tête, tableau d'actions (colonne « Qui »), rubriques par lot
const lignes = [
  'EXTENSION DE L\'ATELIER – COMPTE RENDU DE CHANTIER N° 7', 'Réunion du 12/03/2026 sur site',
  'Prochaine réunion : jeudi 19/03/2026 à 9 h',
  'N°\tSujet\tQui\tPour le',
  '7.1\tTransmettre les plans de réservations des gaines et des trémies\tCVC\t18/03',
  '7.2\tFournir le planning de pose des menuiseries\tMEX\t20/03',
  '7.3\tNettoyage des zones de travail et évacuation des déchets\tTous\tS13',
  '7.4\tFiches techniques de la CTA à transmettre au maître d\'œuvre\tCVC\tFait',
  'LOT 05 – CVC PLOMBERIE CHAUFFAGE',
  'Le lot doit reprendre le calorifuge du réseau eau glacée en chaufferie avant',
  'la visite du contrôleur technique.',
  'Prévoir l\'essai de pression des réseaux de chauffage pour le 25/03/2026.',
  'RAS',
  'LOT 06 – ÉLECTRICITÉ',
  'Raccordement de l\'armoire divisionnaire à prévoir.',
  'Le GO attend les réservations de plomberie au niveau du R+1.',
];

test('CR de réunion : date, n°, prochaine réunion', () => {
  const r = CR.analyser(lignes);
  assert.strictEqual(r.date, '2026-03-12'); assert.strictEqual(r.numero, 7); assert.strictEqual(r.prochaine, '2026-03-19');
});

test('CR de réunion : tâches du lot CVC plomberie, points pour tous, sans les points soldés ni des autres lots', () => {
  const r = CR.analyser(lignes), t = r.taches.map(x => x.texte);
  assert.ok(t.some(x => /plans de réservations/.test(x)), 'colonne Qui = CVC');
  assert.strictEqual(r.taches.find(x => /plans de réservations/.test(x.texte)).echeance, '2026-03-18');
  assert.ok(t.some(x => /calorifuge/.test(x) && /contrôleur technique/.test(x)), 'rubrique du lot, ligne recollée');
  assert.strictEqual(r.taches.find(x => /essai de pression/.test(x.texte)).echeance, '2026-03-25');
  const tous = r.taches.find(x => /Nettoyage/.test(x.texte));
  assert.ok(tous && tous.tous); assert.strictEqual(tous.echeance, CR.semaine(13, 2026));
  assert.ok(t.some(x => /réservations de plomberie/.test(x)), 'mention du lot dans une autre rubrique');
  assert.ok(!t.some(x => /menuiseries/.test(x)) && !t.some(x => /armoire divisionnaire/.test(x)) && !t.some(x => /Fiches techniques de la CTA/.test(x)) && !t.includes('RAS'));
  assert.ok(!t.some(x => /\bCVC\b/.test(x)), 'colonne Qui retirée du texte');
});

test('CR de réunion : mots du lot et nom de l\'entreprise réglables, clé de rapprochement', () => {
  const r = CR.analyser(['CR n° 3 du 02/04/2026', 'Point 1\tReprendre les supports\tTECNITUB'], { mots: ['zzz'], societe: 'Tecnitub' });
  assert.deepStrictEqual(r.taches.map(x => x.texte), ['Point 1 – Reprendre les supports']);
  assert.strictEqual(CR.cle('Transmettre les plans pour le 18/03'), CR.cle('Transmettre les plans pour le 25/03'));
});
