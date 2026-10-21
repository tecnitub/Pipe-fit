// Lecture des offres et devis fournisseurs : lignes d'articles, remises, port, total, validité, délai, scans, association.
const { test } = require('node:test');
const assert = require('node:assert');
const O = require('../public/js/offre-lecture');

test('nombres au format français', () => {
  assert.deepStrictEqual(['1 234,56', '1.234,56', '12,50', '1234.5', '1.234', '-3,2'].map(O.nombre), [1234.56, 1234.56, 12.5, 1234.5, 1234, -3.2]);
  assert.strictEqual(O.nombre('DN50'), null);
});

test('devis en colonnes (PDF) : référence, remise, désignation sur deux lignes, port, total, validité, délai', () => {
  const r = O.analyser(['DEVIS N° TRV-26-04512', 'Date : 19/10/2026', 'Réf.\tDésignation\tQté\tU\tPrix brut\tRemise\tPrix net\tMontant HT',
    'CO3D316-50\tCOUDE 90° 3D INOX 316L DN50\t40\tU\t24,00\t20 %\t19,20\t768,00', 'A SOUDER',
    'TE316-50\tTE EGAL INOX 316L DN50\t12\tU\t36,50\t20 %\t29,20\t350,40',
    'Participation port\t35,00', 'Total HT\t1 153,40', 'TVA 20 %\t230,68', 'Délai de livraison : 2 semaines', 'Offre valable jusqu\'au 18/11/2026.']);
  assert.deepStrictEqual(r.lignes.map(l => [l.ref, l.designation, l.qte, l.unite, l.pu, l.puBrut, l.remise, l.montant]), [
    ['CO3D316-50', 'COUDE 90° 3D INOX 316L DN50 A SOUDER', 40, 'U', 19.2, 24, 20, 768], ['TE316-50', 'TE EGAL INOX 316L DN50', 12, 'U', 29.2, 36.5, 20, 350.4]]);
  assert.deepStrictEqual([r.port, r.totalHT, r.coherent, r.validite, r.delai, r.reference], [35, 1153.4, true, '2026-11-18', '14', 'TRV-26-04512']);
});

test('texte sans colonnes : milliers avec espaces, n° de ligne, « DN 50 » gardé dans la désignation', () => {
  const r = O.analyser(['1 VPB-050 Vanne papillon DN 50 PN16 24 158,00 3 792,00', '2 Joint graphite DN 50 2 100,00 200,00', '3 TUB-316-050 Tube inox 316L DN50 1 300 ml 43,46 56 498,00']);
  assert.deepStrictEqual(r.lignes.map(l => [l.ref, l.designation, l.qte, l.pu, l.montant]), [
    ['VPB-050', 'Vanne papillon DN 50 PN16', 24, 158, 3792], ['', 'Joint graphite DN 50', 2, 100, 200], ['TUB-316-050', 'Tube inox 316L DN50', 1300, 43.46, 56498]]);
});

test('prix unitaire avant la quantité (ordre de l\'en-tête), validité en jours', () => {
  const r = O.analyser(['PROPOSITION COMMERCIALE N° 2026-1043 — le 20/10/2026', 'Article\tP.U. HT\tQuantité\tTotal HT',
    'Coude 3D 90° 316L DN 50\t18,95 €\t40\t758,00 €', 'Coude 3D 90° 316L DN 100\t63,40 €\t16\t1 014,40 €', 'Frais de port : 60,00 €', 'Délai : 3 semaines — Validité : 30 jours']);
  assert.deepStrictEqual(r.lignes.map(l => [l.qte, l.pu]), [[40, 18.95], [16, 63.4]]);
  assert.deepStrictEqual([r.port, r.delai, r.validite], [60, '21', '2026-11-19']);
});

test('lecture de scan abîmée : quantité ou montant retrouvés par prix brut × remise = prix net, marqués à vérifier', () => {
  const l = ['CO3D216-50 COUDE 90° 3D INOX 316L DN5D À SOUDER ou 24,00 20% 19,20 768,00', 'TEs1s-50 TE EGAL INOX 316L DN50 12U 36,50 20% 29,20 350,40',
    'COsDs16-100 COUDE 90° 3D INOX 316L DN100 16U 74.00 20% 59.20 047,20', 'BC316-S0PN16 BRIDE COLLERETTE DNSO PN16 104 39,00 20% 3120 312,00'].map(x => O.analyserLigne(x));
  assert.deepStrictEqual(l.map(x => [x.qte, x.pu, x.montant, !!x.verifier]), [[40, 19.2, 768, true], [12, 29.2, 350.4, false], [16, 59.2, 947.2, true], [10, 31.2, 312, true]]);
  // Les lignes de totaux, de TVA ou d'en-tête ne sont jamais prises pour des articles
  assert.strictEqual(O.analyser(['Total HT 2 x 1 200,00 2 400,00', 'TVA 20 % 480,00', 'Désignation Qté PU Montant']).lignes.length, 0);
});

test('association aux lignes demandées : référence, puis désignation la plus proche, dimensions respectées', () => {
  const lues = [{ ref: 'X1', designation: 'COUDE 3D 316L DN100', qte: 16 }, { ref: 'TEE-316-050', designation: 'Té égal', qte: 12 }, { ref: '', designation: 'Coude 90° 3D inox DN50', qte: 40 }, { ref: '', designation: 'Frais divers', qte: 1 }];
  const dem = [{ designation: 'Coude 90° 3D inox 316L DN50', qte: 40 }, { designation: 'Té égal inox 316L DN50 à souder', qte: 12, articleId: 'a14' }, { designation: 'Coude 90° 3D inox 316L DN100', qte: 16 }];
  const r = O.associer(lues, dem, [{ id: 'a14', ref: 'TEE-316-050' }]);
  assert.deepStrictEqual(r.parDemande, { 0: 2, 1: 1, 2: 0 });
  assert.deepStrictEqual(r.nonAssociees, [3]);
});
