// Bibliothèque de modèles partagée entre les études (bibliotheque-modeles.js) : partage d'un modèle du registre, doublons
// (même fabricant + référence), versions de valeurs et de fiche, prix fournisseurs, recherche, reprise dans une autre
// étude sans relire la fiche — données fictives (marque « ACME »).
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Notes = N;
['schema', 'cta', 'terminaux', 'pieces'].forEach(m => require(`../etudes/public/js/${m}`));
const R = require('../etudes/public/js/registre');
const B = require('../etudes/public/js/bibliotheque-modeles');

const etude = () => ({ id: 'eA', objet: 'Bureaux ACME', notes: [], equipements: [] });

test('partage : seul un modèle lu et choisi (fabricant, référence, valeurs) entre dans la bibliothèque', () => {
  const et = etude();
  const cta = R.ajouter(et, { type: 'cta', fabricant: 'ACME Air', reference: 'DF-4500', valeurs: { Qs: 4500, Qr: 4200, PchBC: 24.5 }, nom: 'Fiche ACME DF' });
  const gamme = R.ajouter(et, { type: 'pompe', fabricant: 'ACME Pompes', reference: '', valeurs: {}, nom: 'Gamme CIRCU', gamme: { titre: 'CIRCU', modeles: [{ ref: 'CIRCU 25-40', Q: 2 }] } });
  const sansRef = R.ajouter(et, { type: 'vase', fabricant: 'ACME', reference: '', valeurs: { V: 50 }, nom: 'Vase' });
  assert.strictEqual(B.raisonRefus(cta), '');
  assert.match(B.raisonRefus(gamme), /gamme/);
  assert.match(B.raisonRefus(sansRef), /référence/);
  assert.strictEqual(B.depuisRegistre(gamme), null);
  const e = B.depuisRegistre(cta, { fiche: { id: 'ft1', fichierId: 'f1', nom: 'ACME_DF.pdf', date: '2026-03-01' }, prix: [{ fournisseur: 'Négoce Exemple', prix: '8 950', date: '2026-09-15' }], par: 'Jacky' });
  assert.deepStrictEqual([e.cle, e.valeurs.Qs, e.fiche.fichierId, e.prix[0].prix, e.validePar], ['cta|acmeair|DF4500', 4500, 'f1', 8950, 'Jacky']);
  const etat = B.etatRegistre(et, []);
  assert.deepStrictEqual(etat.map(y => y.etat), ['nouveau', 'refuse', 'refuse']);
});

test('doublons et versions : même fabricant + référence ; valeurs ou fiche changées → nouvelle version, l\'ancienne gardée', () => {
  const e = { type: 'generateur', fabricant: 'ACME Thermique', reference: 'PAC 40 HT', valeurs: { P: 40, Pfr: 36 }, fiche: { id: 'ft2', nom: 'PAC_40.pdf', date: '2025-01-10' }, prix: [{ fournisseur: 'Négoce A', prix: 21000, date: '2026-01-05' }] };
  let r = B.integrer([], e, { par: 'Claire', etudeId: 'e1' });
  assert.deepStrictEqual([r.statut, r.liste.length, r.entree.version, r.entree.etudes], ['ajoute', 1, 1, ['e1']]);
  r = B.integrer(r.liste, { ...e, fabricant: 'ACME THERMIQUE', reference: 'PAC-40-HT', prix: [] }, { etudeId: 'e2' });
  assert.deepStrictEqual([r.statut, r.liste.length, r.entree.etudes], ['identique', 1, ['e1', 'e2']]);
  r = B.integrer(r.liste, { ...e, prix: [{ fournisseur: 'Négoce B', prix: 20500, date: '2026-06-01' }] });
  assert.deepStrictEqual([r.statut, r.entree.prix.length], ['prix', 2]);
  // Nouvelle édition de la fiche (même valeurs) : nouvelle version
  r = B.integrer(r.liste, { ...e, fiche: { id: 'ft3', nom: 'PAC_40_2026.pdf', date: '2026-02-01' } }, { par: 'Jacky' });
  assert.deepStrictEqual([r.statut, r.entree.version, r.entree.fiche.id, r.entree.versions[0].fiche.id, r.entree.validePar], ['version', 2, 'ft3', 'ft2', 'Jacky']);
  r = B.integrer(r.liste, { ...e, valeurs: { P: 41, Pfr: 36 }, fiche: null });
  assert.deepStrictEqual([r.statut, r.entree.version, r.entree.valeurs.P, r.entree.fiche.id, r.entree.versions.length], ['version', 3, 41, 'ft3', 2], 'sans nouvelle fiche, la fiche reste');
  // Autre type, même référence : modèle distinct
  assert.strictEqual(B.integrer(r.liste, { ...e, type: 'groupeFroid' }).liste.length, 2);
  // Prix : le plus récent par fournisseur
  const p = B.prixRecents({ prix: [{ fournisseur: 'Négoce A', prix: 10, date: '2025-01-01' }, { fournisseur: 'négoce a', prix: 12, date: '2026-01-01' }, { fournisseur: 'Négoce B', prix: 11, date: '2025-06-01' }] });
  assert.deepStrictEqual(p.map(x => [x.prix, x.date]), [[12, '2026-01-01'], [11, '2025-06-01']]);
  assert.strictEqual(B.integrer([], { type: 'pompe', fabricant: 'ACME' }).statut, 'refuse');
});

test('recherche par famille, fabricant, référence, texte et grandeur (± 25 %)', () => {
  let l = [];
  [['cta', 'ACME Air', 'DF-3000', { Qs: 3000 }], ['cta', 'ACME Air', 'DF-4500', { Qs: 4500 }], ['pompe', 'ACME Pompes', 'CIRCU 25-60', { Q: 2.5, H: 6 }], ['vase', 'Exemplor', 'VX 80', { V: 80 }], ['generateur', 'ACME Thermique', 'PAC 40', { P: 40 }]]
    .forEach(([type, fabricant, reference, valeurs]) => { l = B.integrer(l, { type, fabricant, reference, valeurs }).liste; });
  assert.deepStrictEqual(B.chercher(l, { type: 'cta' }).map(e => e.reference), ['DF-3000', 'DF-4500']);
  assert.deepStrictEqual(B.chercher(l, { q: 'df4500' }).map(e => e.reference), ['DF-4500']);
  assert.deepStrictEqual(B.chercher(l, { q: 'acme circu' }).map(e => e.reference), ['CIRCU 25-60']);
  assert.deepStrictEqual(B.chercher(l, { fabricant: 'exemplor' }).map(e => e.reference), ['VX 80']);
  assert.deepStrictEqual(B.chercher(l, { grandeur: { cle: 'Qs', valeur: '4 200' } }).map(e => e.reference), ['DF-4500']);
  assert.deepStrictEqual(B.chercher(l, { q: 'vase 80' }).map(e => e.reference), ['VX 80'], 'nombre cherché aussi dans les valeurs');
  assert.deepStrictEqual(B.chercher(l, { q: 'inconnu' }), []);
  // Prix relevés dans les consultations du CRM (désignation citant la référence)
  const pc = B.prixDepuisConsultations([{ designation: 'Circulateur ACME CIRCU 25/60', fournisseur: 'Négoce A', prix: 380, date: '2026-05-01', consultation: 'CS-1' }, { designation: 'Circulateur CIRCU 25-60', fournisseur: 'Négoce B', prix: 365, date: '2026-08-01' }, { designation: 'Vanne DN 25', fournisseur: 'Négoce A', prix: 50, date: '2026-08-01' }], l[2]);
  assert.deepStrictEqual(pc.map(x => [x.fournisseur, x.prix]), [['Négoce B', 365], ['Négoce A', 380]]);
});

test('reprise dans une autre étude : le modèle entre au registre sans relire la fiche, puis se place dans les calculs', () => {
  const src = etude();
  const x = R.ajouter(src, { type: 'cta', fabricant: 'ACME Air', reference: 'DF-4500', valeurs: { Qs: 4500, Qr: 4200, PchBC: 24.5 }, nom: 'Fiche ACME DF' });
  const lib = B.integrer([], B.depuisRegistre(x, { fiche: { id: 'ft1', fichierId: 'f1', nom: 'ACME_DF.pdf', date: '2026-03-01' } })).liste;
  const et = { id: 'eB', objet: 'Collège ACME', notes: [], equipements: [] };
  const [trouve] = B.chercher(lib, { q: 'DF-4500' });
  const y = B.versRegistre(et, trouve);
  assert.deepStrictEqual([et.equipements.length, y.fabricant, y.reference, y.valeurs.Qs, y.biblio.version, y.ficheBiblio.fichierId], [1, 'ACME Air', 'DF-4500', 4500, 1, 'f1']);
  assert.strictEqual(B.etatRegistre(et, lib)[0].etat, 'a-jour');
  // Reprise répétée : pas de doublon au registre
  B.versRegistre(et, trouve);
  assert.strictEqual(et.equipements.length, 1);
  // Placé dans une nouvelle note de CTA comme un modèle lu sur sa fiche
  let k = 0;
  const msg = R.placer(et, y, 'cta:nouveau', {}, t => ({ id: `n${++k}`, type: t, titre: N.TYPES[t].titre, entrees: N.defauts(t) }));
  assert.match(msg, /ACME Air DF-4500/);
  assert.strictEqual(et.notes[0].entrees.eq, y.id);
  assert.match(B.resume(trouve), /4500/);
});
