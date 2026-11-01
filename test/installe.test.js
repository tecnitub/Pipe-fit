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
