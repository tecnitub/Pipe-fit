// Lecture d'un devis fournisseur (données inventées : ACME Distribution, fabricant Exemplair) : en-tête, lignes en
// colonnes ou en texte continu, désignations sur plusieurs lignes, sous-totaux, frais de port ; rapprochement avec le
// matériel retenu ; comparatif de plusieurs devis ; prix retenus avec leur source.
const { test } = require('node:test');
const assert = require('node:assert');
const D = require('../public/js/devis-lecture');

// Mise en page en colonnes (tabulations, comme PdfLecture les rend), en-tête de colonnes répété à chaque page
const DEVIS_COLONNES = [
  'DEVIS',
  'ACME Distribution\tAgence Est',
  '12 rue des Essais\tContact : service devis',
  'Tél : 01 02 03 04 05\tE-mail : devis@acme-distribution.example',
  'Client : TUYAUTERIES DUPONT',
  'Date :\t03/03/2026\tPage : 1/2',
  'Notre référence de devis : AC-2026-0042',
  'Référence de l\'affaire : Groupe scolaire Les Tilleuls',
  'Durée de validité de l\'offre :\t30 jours',
  'Délai de livraison en jours ouvrés :',
  '15 JOURS',
  'Code\tDésignation\tQté\tPrix unitaire HT\tTotal HT',
  'VENTILATION',
  'Soufflage',
  'EX-GS625\tGrille de soufflage double déflexion 625x225 Exemplair\t6\t41,20\t247,20',
  'EX-RG625\tRegistre de réglage pour grille 625x225\t6\t18,00\t108,00',
  'Sous-total\t355,20',
  'Centrale 3000 m3/h',
  'EX-CTA30\tCentrale double flux Exemplair Duo 30\t1\t8 450,00\t8 450,00',
  'Échangeur à contre-courant certifié, batterie eau chaude intégrée',
  'Régulation communicante intégrée',
  'Page : 2/2',
  'Code\tDésignation\tQté\tPrix unitaire HT\tTotal HT',
  'EX-MS315\tManchette souple Ø 315\t4\t12,50\t10 %\t45,00',
  'Sous-total\t8 495,00',
  'Prestations',
  'MES-01\tMise en service centrale\t1\t650,00\t650,00',
  'Frais de port\t85,00',
  'Éco-participation DEEE\t4,50',
  'Total frais annexes\t89,50 EUR',
  'Total général net HT\t9 589,70 EUR',
  'TVA 20 %\t1 917,94',
  'Total TTC\t11 507,64',
];

test('devis en colonnes : en-tête, lignes, sections, sous-totaux, frais et total HT cohérent', () => {
  const d = D.lire(DEVIS_COLONNES, { societe: 'Tuyauteries Dupont' });
  assert.strictEqual(d.fournisseur, 'ACME Distribution');
  assert.strictEqual(d.numero, 'AC-2026-0042');
  assert.strictEqual(d.date, '2026-03-03');
  assert.strictEqual(d.validiteJours, 30);
  assert.strictEqual(d.validite, '2026-04-02');
  assert.strictEqual(d.delai, '15');
  assert.strictEqual(d.affaire, 'Groupe scolaire Les Tilleuls');
  assert.strictEqual(d.lignes.length, 5, d.lignes.map(l => l.designation).join(' | '));
  const [g, , cta, ms, mes] = d.lignes;
  assert.deepStrictEqual([g.reference, g.qte, g.pu, g.total], ['EX-GS625', 6, 41.2, 247.2]);
  assert.strictEqual(g.section, 'VENTILATION › Soufflage');
  // Milliers dans une cellule ; description de l'article sur les lignes suivantes (détails)
  assert.deepStrictEqual([cta.reference, cta.pu, cta.total], ['EX-CTA30', 8450, 8450]);
  assert.match(cta.details, /contre-courant/);
  assert.strictEqual(cta.section, 'Centrale 3000 m3/h');
  // Remise en pourcentage : prix net
  assert.deepStrictEqual([ms.puBrut, ms.remise, ms.pu, ms.total], [12.5, 10, 11.25, 45]);
  assert.strictEqual(mes.section, 'Prestations');
  assert.deepStrictEqual(d.sousTotaux.map(s => s.montant), [355.2, 8495]);
  assert.deepStrictEqual(d.frais.map(f => f.montant), [85, 4.5]);
  assert.strictEqual(d.totalHT, 9589.7);
  assert.strictEqual(d.coherent, true);
  assert.deepStrictEqual(d.alertes, []);
});

// Texte continu (lecture d'un scan) : milliers séparés par une espace, désignation au-dessus de la ligne chiffrée,
// suite de désignation à la ligne suivante, total incohérent signalé
test('devis en texte continu : milliers, désignation au-dessus, suite de désignation, écart au total', () => {
  const d = D.lire([
    'ACME DISTRIBUTION',
    'Offre de prix n° 2026/118 du 12.02.2026',
    'Offre valable jusqu\'au 31/03/2026',
    'Réf Désignation Qté Unité PU HT Montant HT',
    '1 EXP-40-6 Circulateur double Exemplair 2 U 1 234,50 2 469,00',
    'Pompe Exemplair DN 40',
    'Vase d\'expansion 80 L',
    'EXV80 1 U 152,00 152,00',
    'Total HT 2 700,00',
  ], { connus: ['Autre Négoce', 'Acme Distribution'] });
  assert.strictEqual(d.fournisseur, 'Acme Distribution', 'nom connu de Pipe-Fit');
  assert.strictEqual(d.numero, '2026/118');
  assert.strictEqual(d.validite, '2026-03-31');
  assert.strictEqual(d.lignes.length, 2);
  assert.deepStrictEqual([d.lignes[0].reference, d.lignes[0].qte, d.lignes[0].unite, d.lignes[0].pu, d.lignes[0].total], ['EXP-40-6', 2, 'U', 1234.5, 2469]);
  assert.match(d.lignes[0].designation, /Circulateur double Exemplair Pompe Exemplair DN 40/);
  assert.deepStrictEqual([d.lignes[1].reference, d.lignes[1].designation, d.lignes[1].total], ['EXV80', 'Vase d\'expansion 80 L', 152]);
  assert.strictEqual(d.coherent, false);
  assert.strictEqual(d.ecart, 79);
  assert.match(d.alertes[0], /somme des lignes/);
});

test('fournisseur : notre société (client) jamais retenue, domaine de l\'adresse e-mail', () => {
  const l = ['DEVIS', 'TUYAUTERIES DUPONT', 'Client : TUYAUTERIES DUPONT', 'ACME', 'contact@acme.example', 'Désignation\tQté\tPU\tTotal', 'Grille\t1\t10,00\t10,00'];
  assert.strictEqual(D.lire(l, { societe: 'Tuyauteries Dupont' }).fournisseur, 'ACME');
  assert.strictEqual(D.lire(['Devis', 'Désignation\tQté\tPU\tTotal', 'Grille\t1\t10,00\t10,00']).fournisseur, '');
});

const MATERIEL = [
  { cle: 'aero|cta-df|3000', designation: 'CTA double flux 3000 m³/h · 250 Pa', qte: 1, fabricant: 'Exemplair', reference: 'Duo 30' },
  { cle: 'bouche|soufflage|625x225', designation: 'Grille de soufflage 625x225', qte: 6, fabricant: '', reference: '' },
  { cle: 'bouche|reprise|400x200', designation: 'Grille de reprise 400x200', qte: 4, fabricant: '', reference: '' },
  { cle: 'manchette|315', designation: 'Manchette souple Ø 315', qte: 4, fabricant: '', reference: '' },
  { cle: 'pompe|c1', designation: 'Pompe double DN 40 — circuit radiateurs', qte: 2, fabricant: 'Exemplair', reference: 'EXP-40-6' },
];

test('rapprochement : référence exacte, puis désignation + famille + grandeur ; une cible par ligne ; choix manuel', () => {
  const d = D.lire(DEVIS_COLONNES), a = D.associer(d.lignes, MATERIEL);
  assert.strictEqual(a.parLigne[0].cle, 'bouche|soufflage|625x225');
  assert.match(a.parLigne[0].motif, /famille bouche, grandeur 625x225/);
  assert.strictEqual(a.parLigne[1].cle, '', 'un registre n\'est pas une grille');
  assert.strictEqual(a.parLigne[2].cle, 'aero|cta-df|3000');
  assert.strictEqual(a.parLigne[3].cle, 'manchette|315');
  assert.strictEqual(a.parLigne[4].cle, '', 'mise en service : prestation, pas un équipement');
  assert.deepStrictEqual(a.manquantes, ['bouche|reprise|400x200', 'pompe|c1']);
  // Référence exacte (même écrite dans la désignation)
  assert.strictEqual(D.score({ reference: '', designation: 'Circulateur EXP-40-6 Exemplair' }, MATERIEL[4]).s, 1);
  // Grandeur différente : la ligne n'est pas proposée automatiquement
  assert.ok(D.score({ designation: 'Grille de soufflage 400x200', qte: 6 }, MATERIEL[1]).s < D.SEUIL);
  // Choix manuel prioritaire
  const m = D.associer(d.lignes, MATERIEL, { 1: 'bouche|reprise|400x200', 0: '' });
  assert.deepStrictEqual([m.parLigne[0].cle, m.parLigne[1].cle, m.parLigne[1].manuel], ['', 'bouche|reprise|400x200', true]);
  assert.strictEqual(a.parLigne[0].candidats[0].cle, 'bouche|soufflage|625x225', 'candidats proposés pour le choix manuel');
});

test('prix retenus avec leur source, comparatif de deux devis (par ligne, total, moins-disant, manquantes)', () => {
  const d1 = { id: 'd1', ...D.lire(DEVIS_COLONNES) };
  const d2 = { id: 'd2', ...D.lire(['ACME Négoce Sud', 'Devis n° S-77 du 05/03/2026', 'Désignation\tQté\tPU\tTotal',
    'Grille de soufflage 625x225\t6\t39,00\t234,00', 'Manchette souple Ø 315\t4\t10,00\t40,00', 'Port\t120,00', 'Total HT\t394,00']) };
  const p = D.prixRetenus(d1, D.associer(d1.lignes, MATERIEL).parLigne);
  assert.strictEqual(p['aero|cta-df|3000'].pu, 8450);
  assert.strictEqual(p['aero|cta-df|3000'].source, 'Devis ACME Distribution n° AC-2026-0042 du 03/03/2026');
  const c = D.comparer([d1, d2], MATERIEL.slice(0, 4));
  const l = k => c.lignes.find(x => x.cle === k);
  assert.strictEqual(l('bouche|soufflage|625x225').moinsDisant, 'd2');
  assert.strictEqual(l('bouche|soufflage|625x225').ecart, 13.2);
  assert.strictEqual(l('aero|cta-df|3000').moinsDisant, 'd1');
  assert.deepStrictEqual(c.sansOffre, ['bouche|reprise|400x200']);
  const [c1, c2] = c.colonnes;
  assert.deepStrictEqual(c2.manquantes, ['aero|cta-df|3000', 'bouche|reprise|400x200']);
  assert.strictEqual(c2.total, 394);
  assert.strictEqual(c1.total, 247.2 + 8450 + 45 + 89.5);
  assert.strictEqual(c.moinsDisant, '', 'aucune offre complète');
  assert.deepStrictEqual(c.fournisseursOptimum.sort(), ['d1', 'd2']);
  // Cibles d'une consultation Pipe-Fit : la référence validée de l'étude sert au rapprochement
  const cs = D.ciblesConsultation([{ designation: 'Pompe double', qte: 2, materiel: { etudeId: 'e1', cle: 'pompe|c1', reference: 'EXP-40-6', fabricant: 'Exemplair' } }]);
  assert.deepStrictEqual([cs[0].cle, cs[0].reference, cs[0].etude], ['0', 'EXP-40-6', 'e1|pompe|c1']);
});
