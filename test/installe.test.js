// Matériel installé : équipements du DOE rapprochés des commandes fournisseurs du chantier.
const { test } = require('node:test');
const assert = require('node:assert');
const I = require('../public/js/installe');

const commandes = [
  { id: 'c1', affaireId: 'af1', numero: 'CF-001', date: '2026-10-02', fournisseurId: 'f1', statut: 'Réceptionnée', receptions: [{ date: '2026-10-09' }], lignes: [
    { designation: 'Centrale double flux Ventilia CTA-DF 4500', qte: 1, qteRecue: 1 }, { designation: 'Diffuseur plafond DF4-160', qte: 8, qteRecue: 8 }, { designation: 'Tube acier DN 50', qte: 30 }] },
  { id: 'c2', affaireId: 'af1', numero: 'CF-002', date: '2026-10-05', fournisseurId: 'f2', statut: 'Envoyée', lignes: [{ designation: 'Pompe Wilo Stratos 40/1-8', articleId: 'a9', qte: 1 }, { designation: 'Vase d\'expansion 200 L', qte: 1 }] },
  { id: 'c3', affaireId: 'af1', statut: 'Annulée', lignes: [{ designation: 'Pompe Grundfos Magna3', qte: 1 }] },
  { id: 'c4', affaireId: 'autre', statut: 'Réceptionnée', lignes: [{ designation: 'Diffuseur plafond DF4-160', qte: 8 }] },
];
const lignes = I.lignesCommandes(commandes, 'af1', id => ({ f1: 'Clim Distribution', f2: 'Hydro Négoce' }[id]), id => (id === 'a9' ? { ref: 'STRATOS-40-18', designation: 'Circulateur' } : null));

test('lignes des commandes du chantier : annulées et autres chantiers écartées, livraison', () => {
  assert.deepStrictEqual(lignes.map(l => [l.numero, l.livraison]), [['CF-001', 'livrée'], ['CF-001', 'livrée'], ['CF-001', 'livrée'], ['CF-002', 'non livrée'], ['CF-002', 'non livrée']]);
  assert.strictEqual(lignes[0].dateLivraison, '2026-10-09'); assert.strictEqual(lignes[3].ref, 'STRATOS-40-18');
});

test('rapprochement : référence retrouvée, référence différente (la commande fait foi), non commandé, commandé absent du DOE', () => {
  const eqs = [
    { id: 'e1', designation: 'Centrale de traitement d\'air double flux', marque: 'Ventilia', reference: 'CTA-DF 3000' },
    { id: 'e2', designation: 'Diffuseur plafond carré 4 directions col Ø 160', marque: 'Exemplair', reference: 'DF4-160' },
    { id: 'e3', designation: 'Pompe radiateurs', reference: 'STRATOS-40-18' },
    { id: 'e4', designation: 'Ballon tampon 500 L', reference: '' },
  ];
  const r = I.rapprocher(eqs, lignes), etat = id => r.resultats.find(x => x.id === id);
  assert.strictEqual(etat('e2').etat, 'conforme');
  assert.strictEqual(etat('e3').etat, 'conforme'); assert.strictEqual(etat('e3').livraison, 'non livrée');
  // Étude : CTA-DF 3000 ; commandée et livrée : CTA-DF 4500
  assert.strictEqual(etat('e1').etat, 'reference-differente'); assert.match(etat('e1').texte, /CTA-DF 4500.*installé/);
  assert.strictEqual(I.referenceCommandee(etat('e1').ligne, 'Ventilia'), 'CTA-DF 4500');
  assert.strictEqual(I.referenceCommandee(etat('e1').ligne, ''), 'Centrale double flux Ventilia CTA-DF 4500');
  assert.strictEqual(etat('e4').etat, 'non-commande');
  // Commandé et absent du DOE : le vase (le tube est un consommable)
  assert.deepStrictEqual(r.nonDecrites.map(l => l.designation), ['Vase d\'expansion 200 L']);
  assert.deepStrictEqual(r.bilan, { conformes: 2, differentes: 1, aCompleter: 0, nonCommandes: 1, nonLivres: 1, nonDecrites: 1 });
});

test('une ligne de commande ne sert qu\'à un équipement ; les dimensions doivent concorder', () => {
  const r = I.rapprocher([{ id: 'a', designation: 'Diffuseur plafond col Ø 160' }, { id: 'b', designation: 'Diffuseur plafond col Ø 160' }], [lignes[1]]);
  assert.deepStrictEqual(r.resultats.map(x => x.etat).sort(), ['a-completer', 'non-commande']);
  assert.strictEqual(I.rapprocher([{ id: 'v', designation: 'Vase d\'expansion 300 L' }], [lignes[4]]).resultats[0].etat, 'non-commande');
});

test('matériel retenu face aux commandes : lien exact, substitution à la commande ou à la livraison, avancement', () => {
  const ms = [
    { etudeId: 'et1', cle: 'aero|cta', designation: 'Centrale de traitement d\'air double flux', fabricant: 'Ventilia', reference: 'CTA-DF 3000', valide: true, poseLe: '2026-10-30' },
    { etudeId: 'et1', cle: 'bouche|160', designation: 'Diffuseur plafond col Ø 160', fabricant: 'Exemplair', reference: 'DF4-160', valide: true },
    { etudeId: 'et1', cle: 'pompe|x', designation: 'Pompe radiateurs', fabricant: 'Wilo', reference: 'Stratos 40/1-8', valide: false },
  ];
  const cmd = [{ id: 'k1', affaireId: 'af', numero: 'CF-10', statut: 'Réceptionnée', lignes: [
    // Commandée depuis le matériel retenu, mais la désignation a été changée pour un autre modèle
    { designation: 'Centrale Ventilia CTA-DF 4500', qte: 1, qteRecue: 1, materiel: { etudeId: 'et1', cle: 'aero|cta', reference: 'CTA-DF 3000' } },
    // Bouches : commandées conformes, mais le BL porte une autre référence
    { designation: 'Diffuseur plafond — Exemplair DF4-160', qte: 8, qteRecue: 8, refRecue: 'DF4-200', materiel: { etudeId: 'et1', cle: 'bouche|160', reference: 'DF4-160' } }] }];
  const s = I.suiviCommandes(ms, I.lignesCommandes(cmd, 'af'));
  const cta = s[0], bouche = s[1], pompe = s[2];
  assert.ok(cta.lienExact && cta.substitution && cta.livraison === 'livrée');
  assert.ok(bouche.lienExact && bouche.substitution, 'référence relevée sur le bon de livraison');
  assert.strictEqual(pompe.commande, null);
  assert.deepStrictEqual(I.avancement(s), { total: 3, valides: 2, commandes: 2, livres: 2, poses: 1, enService: 0, substitutions: 2 });
  // Conforme quand la commande porte la référence validée
  cmd[0].lignes[0].designation = 'Centrale Ventilia CTA-DF 3000';
  assert.ok(!I.suiviCommandes(ms, I.lignesCommandes(cmd, 'af'))[0].substitution);
  // DOE : l'équipement repris de l'étude retrouve sa ligne par le lien, même sans ressemblance de texte
  const r = I.rapprocher([{ id: 'e', designation: 'CTA bureaux', reference: 'CTA-DF 3000', origines: ['be:et1:aero|cta'] }], I.lignesCommandes(cmd, 'af'));
  assert.ok(r.resultats[0].exact); assert.strictEqual(r.resultats[0].etat, 'conforme');
});

test('substitution signalée reprise par l\'étude, n° de série lu, garanties et base d\'entretien', () => {
  const M = require('../public/js/materiel-retenu');
  let d = M.appliquerSuivi({}, 'substitution', 'Jacky', '2026-11-01', { reference: 'CTA-DF 4500', commande: 'CF-10' });
  d = M.appliquerSuivi(d, 'photo', 'Kevin', '2026-11-02', { fichierId: 'abc', serie: 'SN-778' });
  assert.deepStrictEqual([d.substitution.reference, d.serie], ['CTA-DF 4500', 'SN-778']);
  assert.throws(() => M.appliquerSuivi({}, 'substitution', 'J', '2026-11-01', {}));
  const saisies = { k: { reference: 'CTA-DF 3000', fabricant: 'Ventilia', statut: 'Validé', dateValidation: '2026-10-01' } };
  const ls = M.lignes([{ cle: 'k', designation: 'CTA', qte: 1 }], saisies);
  assert.strictEqual(M.reprendreSuivi(saisies, ls, [{ cle: 'k', substitution: d.substitution }], '2026-11-03'), 1);
  assert.deepStrictEqual([saisies.k.reference, M.statutDe(saisies.k)], ['CTA-DF 4500', 'À soumettre']);
  assert.match(saisies.k.obs, /Substitution \(commande CF-10\) : CTA-DF 3000 remplacé par CTA-DF 4500/);
  assert.strictEqual(M.reprendreSuivi(saisies, M.lignes([{ cle: 'k', designation: 'CTA', qte: 1 }], saisies), [{ cle: 'k', substitution: d.substitution }], '2026-11-04'), 0, 'une seule fois');
  // Garanties : 24 mois après la mise en service
  const g = M.garanties([{ cle: 'aero|cta-df|3000', designation: 'CTA', mesLe: '2024-12-15' }, { cle: 'pompe|x', designation: 'Pompe', mesLe: '2026-10-01' }, { cle: 'x', designation: 'Non en service' }], '2026-11-01');
  assert.deepStrictEqual(g.map(x => [x.fin, x.etat]), [['2026-12-15', 'se termine bientôt'], ['2028-10-01', 'en cours']]);
  const csv = M.csvEntretien([{ cle: 'aero|cta-df|3000', designation: 'CTA', fabricant: 'Ventilia', reference: 'CTA-DF 3000', mesLe: '2026-10-01' }], 'CH-1');
  assert.match(csv, /"Filtres";"remplacement ou nettoyage selon encrassement";"6";"2027-04-01"/);
});
