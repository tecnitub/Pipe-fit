// Matériel retenu d'une étude : fabricant et référence exacte de chaque équipement, validation par le client,
// références reprises dans le métré (devis) et transmises au chantier.
const { test } = require('node:test');
const assert = require('node:assert');
const M = require('../public/js/materiel-retenu');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta');
require('../etudes/public/js/aeraulique-schema');
const Me = require('../etudes/public/js/metre');

const etude = materiel => ({ notes: [{ id: 'a1', type: 'aero', titre: 'CTA bureaux', entrees: N.defauts('aero') }], materiel });
const equipements = et => Me.metre(et).filter(p => p.unite === 'u' && p.chapitre !== 'Études');

test('liste : un équipement par poste du métré, statut selon la référence, saisie et validation', () => {
  const et = etude({}), ls = M.lignes(equipements(et), et.materiel);
  const cta = ls.find(l => /^aero\|cta-df/.test(l.cle)), bouche = ls.find(l => /^bouche\|/.test(l.cle) && l.qte === 8);
  assert.ok(cta && bouche, ls.map(l => l.cle).join(' | '));
  assert.ok(ls.every(l => l.statut === 'À choisir'));
  M.saisir(et.materiel, cta, 'fabricant', 'France Air', '2026-10-31');
  assert.strictEqual(M.statutDe(et.materiel[cta.cle]), 'À choisir', 'fabricant seul : pas de référence');
  M.saisir(et.materiel, cta, 'reference', 'CTA-X 3000 DF', '2026-10-31');
  assert.strictEqual(M.statutDe(et.materiel[cta.cle]), 'À soumettre');
  M.saisir(et.materiel, cta, 'statut', 'Soumis au client', '2026-10-31');
  assert.strictEqual(et.materiel[cta.cle].dateSoumission, '2026-10-31');
  M.saisir(et.materiel, cta, 'statut', 'Validé', '2026-11-04');
  assert.strictEqual(et.materiel[cta.cle].dateValidation, '2026-11-04');
  // Autre référence après validation : à soumettre de nouveau
  M.saisir(et.materiel, cta, 'reference', 'CTA-X 3500 DF', '2026-11-05');
  assert.deepStrictEqual([M.statutDe(et.materiel[cta.cle]), et.materiel[cta.cle].dateValidation], ['À soumettre', '']);
  const b = M.bilan(M.lignes(equipements(et), et.materiel));
  assert.strictEqual(b.aSoumettre, 1); assert.strictEqual(b.aChoisir, b.total - 1);
});

test('métré et devis : la référence choisie complète la désignation ; équipement changé de dimension signalé', () => {
  const et = etude({}), cle = M.lignes(equipements(et), {}).find(l => l.qte === 8).cle;
  et.materiel[cle] = { fabricant: 'Aldes', reference: 'DFC 160', statut: 'Validé' };
  const p = Me.metre(et).find(x => x.cle === cle);
  assert.match(p.designation, / — Aldes DFC 160$/);
  assert.deepStrictEqual([p.fabricant, p.reference], ['Aldes', 'DFC 160']);
  assert.ok(Me.lignesDevis(Me.rapprocher([p])).some(l => /Aldes DFC 160/.test(l.designation || '')));
  // Le débit de la zone augmente : la bouche change de taille, l'ancienne saisie reste à reprendre
  et.notes[0].entrees.zones[0].Q = 4000;
  et.materiel[cle].designation = 'Diffuseur plafond carré 4 directions col Ø 160';
  const ls = M.lignes(equipements(et), et.materiel), vieux = ls.find(l => l.cle === cle);
  assert.ok(vieux && vieux.orphelin, 'ancienne taille à reprendre');
  // Matériel ajouté à la main
  et.materiel['libre|1'] = { libre: true, designation: 'Régulateur CTA', qte: 1, fabricant: 'Siemens', reference: 'POL638', statut: 'À soumettre' };
  assert.ok(M.lignes(equipements(et), et.materiel).some(l => l.libre && l.reference === 'POL638'));
});

test('vers le CRM et le chantier : références seulement, refusés écartés, validés d\'abord', () => {
  const ls = [
    { cle: 'a', chapitre: 'Aéraulique', designation: 'Bouche', qte: 8, fabricant: 'Aldes', reference: 'DFC 160', statut: 'Soumis au client', fiche: 'javascript:alert(1)' },
    { cle: 'b', chapitre: 'Aéraulique', designation: 'CTA', qte: 1, fabricant: 'France Air', reference: 'X', statut: 'Validé', fiche: 'https://exemple.fr/fiche.pdf' },
    { cle: 'c', chapitre: 'Production', designation: 'PAC', qte: 1, fabricant: '', reference: '', statut: 'À choisir' },
    { cle: 'd', chapitre: 'Production', designation: 'Pompe', qte: 1, fabricant: 'Wilo', reference: 'Y', statut: 'Refusé' },
  ];
  const crm = M.pourCrm(ls);
  assert.deepStrictEqual(crm.map(x => x.cle), ['a', 'b', 'd']);
  assert.strictEqual(crm[0].fiche, '', 'lien non http écarté');
  const ch = M.pourChantier([{ app: 'etudes', id: 'e1', resume: { objet: 'Étude', materiel: crm } }, { app: 'doe', resume: { materiel: crm } }]);
  assert.deepStrictEqual(ch.map(x => [x.reference, x.valide]), [['X', true], ['DFC 160', false]]);
  assert.match(M.csv(ls).split('\r\n')[2], /"France Air";"X";"Validé"/);
});

test('suivi : soumission (relance), pose, mise en service, photo ; à relancer après 15 jours ; repris dans l\'étude', () => {
  let d = M.appliquerSuivi({}, 'soumis', 'Jacky', '2026-10-01');
  d = M.appliquerSuivi(d, 'soumis', 'Jacky', '2026-10-20');
  assert.deepStrictEqual([d.soumisLe, d.relances], ['2026-10-20', ['2026-10-20']]);
  d = M.appliquerSuivi(d, 'mes', 'Kevin', '2026-11-02');
  assert.deepStrictEqual([d.poseLe, d.mesLe], ['2026-11-02', '2026-11-02'], 'mise en service : posé aussi');
  d = M.appliquerSuivi(d, 'annulerPose', 'Kevin', '2026-11-03');
  assert.ok(!d.poseLe && !d.mesLe);
  assert.throws(() => M.appliquerSuivi({}, 'photo', 'K', '2026-11-03', { fichierId: '../x' }));
  assert.throws(() => M.appliquerSuivi({}, 'supprimer', 'K', '2026-11-03'));
  assert.ok(M.aRelancer({ statut: 'Soumis au client', soumisLe: '2026-10-01' }, '2026-10-20'));
  assert.ok(!M.aRelancer({ statut: 'Soumis au client', soumisLe: '2026-10-10' }, '2026-10-20'));
  assert.ok(!M.aRelancer({ statut: 'Validé', soumisLe: '2026-01-01' }, '2026-10-20'));
  const saisies = { a: { reference: 'R1', statut: 'À soumettre' } }, ls = M.lignes([{ cle: 'a', designation: 'X', qte: 1 }], saisies);
  assert.strictEqual(M.reprendreSuivi(saisies, ls, [{ cle: 'a', soumisLe: '2026-10-05' }], '2026-10-06'), 1);
  assert.deepStrictEqual([M.statutDe(saisies.a), saisies.a.dateSoumission], ['Soumis au client', '2026-10-05']);
});

test('catalogue fabricants : import CSV / Excel par en-têtes, familles, modèles proposés au débit', () => {
  const CM = require('../etudes/public/js/catalogue-materiel');
  // En-têtes dans un ordre libre, famille déduite de la désignation, lignes sans référence écartées
  const { liste, rejets } = CM.lireLignes([
    ['Marque', 'Code article', 'Désignation', 'Débit mini (m3/h)', 'Débit maxi (m3/h)', 'Puissance absorbée (kW)', 'Fiche'],
    ['France Air', 'CTA-2500', 'Centrale de traitement d\'air double flux', '1500', '2800', '1,8', 'https://fa.fr/cta.pdf'],
    ['France Air', 'CTA-4000', 'Centrale de traitement d\'air double flux', '2500', '4500', '3,1', ''],
    ['Aldes', 'DFC 160', 'Diffuseur plafond carré 4 directions', '80', '250', '', ''],
    ['Aldes', '', 'Sans référence', '', '', '', ''],
  ]);
  assert.deepStrictEqual(liste.map(p => [p.reference, p.famille]), [['CTA-2500', 'cta'], ['CTA-4000', 'cta'], ['DFC 160', 'bouche']]);
  assert.deepStrictEqual([liste[0].Qmin, liste[0].Qmax, liste[0].Pelec, liste[0].fiche], [1500, 2800, 1.8, 'https://fa.fr/cta.pdf']);
  assert.deepStrictEqual(rejets, [5]);
  assert.strictEqual(CM.lireCsv(CM.modeleCsv()).liste.length, 3);
  // CTA de 3 000 m³/h : seule la CTA-4000 couvre le débit
  assert.deepStrictEqual(CM.candidats({ cle: 'aero|cta-df|3000', designation: 'Centrale' }, liste).map(p => p.reference), ['CTA-4000']);
  assert.strictEqual(CM.familleDe('bouche|Diffuseur plafond carré 4 directions|col Ø 160'), 'bouche');
  assert.deepStrictEqual(CM.candidats({ cle: 'bouche|Diffuseur plafond carré 4 directions|col Ø 160', designation: 'Diffuseur plafond carré 4 directions col Ø 160' }, liste).map(p => p.reference), ['DFC 160']);
  assert.strictEqual(CM.familleDe('gen|pac-air|80'), 'pac');
});
