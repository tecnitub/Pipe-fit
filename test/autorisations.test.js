const test = require('node:test');
const assert = require('node:assert');
const A = require('../public/js/autorisations');
const E = require('../public/js/echeances');

const auj = '2026-11-04';
const habs = [
  { id: 'v1', userId: 'u1', cle: 'visite', obtenue: '2025-06-01', expire: '2027-06-01', niveau: 'SIR, apte' },
  { id: 'n1', userId: 'u1', cle: 'caces_nacelle', obtenue: '2023-01-10', expire: '2027-01-10', niveau: 'B' },
  { id: 'c1', userId: 'u1', cle: 'caces_chariot', obtenue: '2020-01-10', expire: '2025-01-10' },
  { id: 'v2', userId: 'u2', cle: 'visite', obtenue: '2024-01-01', expire: '2026-10-01' },
  { id: 'h2', userId: 'u2', cle: 'hauteur', obtenue: '2025-01-01', expire: '2028-01-01' },
];

test('conditions : titre et visite à jour, validité = échéance la plus proche', () => {
  const c = A.conditions('u1', 'caces_nacelle', habs, auj);
  assert.ok(c.ok); assert.strictEqual(c.jusqua, '2027-01-10');
  const ch = A.conditions('u1', 'caces_chariot', habs, auj);
  assert.ok(!ch.ok); assert.match(ch.motifs[0], /expiré/);
  const h = A.conditions('u2', 'hauteur', habs, auj);
  assert.ok(!h.ok); assert.match(h.motifs.join(), /visite médicale échue/);
  assert.deepStrictEqual(A.pourPersonne('u1', habs, auj).map(x => x.cle), ['caces_nacelle', 'caces_chariot']);
  assert.ok(!A.conditions('u1', 'pont', habs, auj).ok);
});

test('visite médicale : rendez-vous à prendre ou pris', () => {
  assert.strictEqual(A.rendezVousVisite(habs[3], auj).etat, 'a-prendre');
  assert.strictEqual(A.rendezVousVisite({ ...habs[3], rdv: '2026-11-20' }, auj).etat, 'pris');
  assert.strictEqual(A.rendezVousVisite(habs[0], auj), null);
  const a = E.alertesPersonne([habs[3]], auj)[0];
  assert.match(E.texte(a), /prendre rendez-vous/);
  assert.match(E.texte(E.alertesPersonne([{ ...habs[3], rdv: '2026-11-20' }], auj)[0]), /rendez-vous le 20\/11\/2026/);
  assert.ok(E.HABILITATIONS.some(h => h[0] === 'pont'));
});

test('fiche récapitulative : seulement les habilitations à jour', () => {
  const r = A.recap([{ id: 'u1' }, { id: 'u2' }], habs, auj);
  assert.deepStrictEqual(Object.keys(r.lignes[0].cells).sort(), ['caces_nacelle', 'visite']);
  assert.deepStrictEqual(Object.keys(r.lignes[1].cells), ['hauteur']);
  assert.ok(!r.cles.includes('caces_chariot'));
});

test('plans de prévention annuels : à charger, à renouveler, échu', () => {
  const ents = [
    { id: 'e1', nom: 'Gros client', pdpAnnuel: true },
    { id: 'e2', nom: 'Laiterie', plansPrevention: [{ id: 'p', debut: '2025-12-01', fin: '2026-11-30' }] },
    { id: 'e3', nom: 'Usine', plansPrevention: [{ id: 'p', debut: '2025-01-01', fin: '2025-12-31' }, { id: 'q', debut: '2026-01-01', fin: '2026-12-31' }] },
    { id: 'e4', nom: 'Ancien', plansPrevention: [{ id: 'p', fin: '2026-01-31' }] },
    { id: 'e5', nom: 'Retiré', pdpAnnuel: false, plansPrevention: [{ id: 'p', fin: '2026-01-31' }] },
    { id: 'e6', nom: 'Petit client' },
  ];
  const a = A.alertesPlans(ents, auj);
  assert.deepStrictEqual(a.map(x => [x.entrepriseId, x.etat]), [['e1', 'absent'], ['e2', 'bientot'], ['e4', 'echu']]);
  assert.match(a[2].texte, /charger le nouveau plan/);
});

test('aptitude médicale : seule condition indispensable (CACES non obligatoire)', () => {
  assert.ok(A.aptitude('u1', habs, auj).ok);
  assert.match(A.aptitude('u2', habs, auj).motif, /échue/);
  assert.match(A.aptitude('u3', habs, auj).motif, /aucune visite/);
  // Formation interne enregistrée comme habilitation : autorisation possible
  const avec = [...habs, { id: 'i1', userId: 'u1', cle: 'pont', interne: true, obtenue: '2026-11-04', expire: '2029-11-04' }];
  const c = A.conditions('u1', 'pont', avec, auj);
  assert.ok(c.ok); assert.strictEqual(c.jusqua, '2027-06-01');
});
