// Du CCTP / DPGF à la commande sans ressaisie : un identifiant stable par équipement (clé du métré, ou « cctp|… » pour
// un équipement du CCTP qu'aucun calcul ne couvre) suit l'équipement de l'inventaire au matériel retenu, à la
// consultation, à la commande, à la réception et au suivi du chantier ; état d'achat renvoyé à l'étude.
const { test } = require('node:test');
const assert = require('node:assert');
const M = require('../public/js/materiel-retenu');
const I = require('../public/js/installe');
const OC = require('../public/js/offre-choix');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta');
require('../etudes/public/js/aeraulique-schema');
const Me = require('../etudes/public/js/metre');

const inventaire = [
  { id: 'c0', categorie: 'emetteur', genre: 'cta', designation: 'Centrale de traitement d\'air double flux', qte: 1, repere: 'CTA01' },
  { id: 'c1', categorie: 'auxiliaire', genre: 'desenfumage', designation: 'Ventilateur de désenfumage 4000 m³/h', qte: 1, repere: 'VD1' },
  { id: 'c2', categorie: 'emetteur', genre: 'split', designation: 'Unité intérieure murale', qte: 3, repere: '' },
  { id: 'c3', categorie: 'emetteur', genre: 'split', designation: 'Unité intérieure murale', qte: 2, repere: '', variante: true },
  { id: 'c4', categorie: 'auxiliaire', genre: 'pompe', designation: 'Pompe', qte: 1, inclus: false },
];
const etude = (inv, materiel = {}) => ({ id: 'e1', notes: [{ id: 'a1', type: 'aero', titre: 'CTA bureaux', entrees: N.defauts('aero') }], inventaire: inv, materiel });

test('inventaire sans poste de métré : équipements ajoutés au métré et au matériel retenu avec une clé stable', () => {
  const et = etude(inventaire), postes = Me.metre(et), eq = postes.filter(Me.estEquipement);
  const cles = eq.map(p => p.cle);
  // La CTA est calculée (poste aero|cta…) : pas de doublon ; ventilateur de désenfumage (CCTP seul) ajouté
  assert.ok(cles.some(c => /^aero\|cta/.test(c)));
  assert.ok(!cles.some(c => /^cctp\|cta/.test(c)), cles.join(' | '));
  const vd = eq.find(p => p.cle === 'cctp|desenfumage|vd1');
  assert.ok(vd, cles.join(' | '));
  assert.deepStrictEqual([vd.chapitre, vd.qte, vd.heures, vd.designation], ['Aéraulique', 1, 6, 'VD1 — Ventilateur de désenfumage 4000 m³/h']);
  const ui = eq.find(p => p.cle === 'cctp|split|unite-interieure-murale');
  assert.deepStrictEqual([ui.chapitre, ui.qte], ['Émetteurs', 3], 'variante et ligne exclue écartées');
  // Clé stable : même équipement relu dans un autre ordre (identifiants d'inventaire différents) → même clé
  const relu = Me.metre(etude([...inventaire].reverse().map((x, i) => ({ ...x, id: `d${i}` })))).filter(Me.estEquipement).map(p => p.cle);
  assert.deepStrictEqual(relu.filter(c => /^cctp/.test(c)).sort(), cles.filter(c => /^cctp/.test(c)).sort());
  // Matériel retenu : la ligne se choisit et passe au CRM comme les autres
  const ls = M.lignes(eq, et.materiel), l = ls.find(x => x.cle === vd.cle);
  M.saisir(et.materiel, l, 'fabricant', 'Exemplair', '2026-11-02');
  M.saisir(et.materiel, l, 'reference', 'VDX-40', '2026-11-02');
  assert.ok(M.pourCrm(M.lignes(Me.metre(et).filter(Me.estEquipement), et.materiel)).some(x => x.cle === vd.cle && x.reference === 'VDX-40'));
  // Dédoublonnage de deux équipements de même désignation
  const deux = M.avecInventaire([], [{ genre: 'pompe', designation: 'Pompe double' }, { genre: 'pompe', designation: 'Pompe double' }]);
  assert.deepStrictEqual(deux.map(p => p.cle), ['cctp|pompe|pompe-double', 'cctp|pompe|pompe-double#2']);
});

test('prix d\'achat lu dans un devis : repris au chiffrage (métré, devis) avec sa source, sans passer au résumé du CRM', () => {
  const et = etude([]), cle = M.lignes(Me.metre(et).filter(Me.estEquipement), {}).find(l => /^aero\|cta/.test(l.cle)).cle;
  et.materiel[cle] = { fabricant: 'Exemplair', reference: 'Duo 30', statut: 'Validé', prix: { pu: 8450, fournisseur: 'ACME Distribution', numero: 'AC-1', date: '2026-03-03', source: 'Devis ACME Distribution n° AC-1 du 03/03/2026' } };
  const p = Me.metre(et).find(x => x.cle === cle);
  assert.deepStrictEqual(p.prixAchat, { pu: 8450, source: 'Devis ACME Distribution n° AC-1 du 03/03/2026', date: '2026-03-03' });
  const art = { id: 'art1', designation: 'CTA', unite: 'u', prixVente: 130, coutRevient: 100 };
  const ouv = Me.lignesDevis([{ ...p, articleId: 'art1', accessoires: [] }], [art]).find(l => l.type === 'ouvrage');
  const f = ouv.composants.find(c => c.type === 'f');
  assert.deepStrictEqual([f.cout, f.pu, f.source], [8450, 10985, 'Devis ACME Distribution n° AC-1 du 03/03/2026']);
  // Sans article : coefficient par défaut
  assert.strictEqual(Me.lignesDevis([{ ...p, articleId: '', accessoires: [] }], []).find(l => l.type === 'ouvrage').composants[0].pu, 10985);
  const ligne = M.lignes(Me.metre(et).filter(Me.estEquipement), et.materiel).find(l => l.cle === cle);
  assert.strictEqual(ligne.prix.pu, 8450);
  assert.ok(!('prix' in M.pourCrm([ligne])[0]), 'pas de prix dans le résumé envoyé au CRM');
});

// Chantier : matériel validé → consultation → commande (offre retenue) → réception, la clé suit chaque étape
test('consultation, commande et réception gardent la clé ; état d\'achat renvoyé à l\'étude', () => {
  const liens = [{ app: 'etudes', id: 'e1', affaireId: 'A1', resume: { objet: 'Étude', materiel: [
    { cle: 'aero|cta-df|3000', chapitre: 'Aéraulique', designation: 'CTA double flux 3000 m³/h', qte: 1, fabricant: 'Exemplair', reference: 'Duo 30', statut: 'Validé' },
    { cle: 'cctp|desenfumage|vd1', chapitre: 'Aéraulique', designation: 'VD1 — Ventilateur de désenfumage', qte: 1, fabricant: 'Exemplair', reference: 'VDX-40', statut: 'Validé' },
    { cle: 'pompe|c1', chapitre: 'Production', designation: 'Pompe double DN 40', qte: 2, fabricant: 'Exemplair', reference: 'EXP-40', statut: 'Validé' }] } }];
  const ms = M.pourChantier(liens, []);
  const lien = m => ({ etudeId: m.etudeId, cle: m.cle, fabricant: m.fabricant, reference: m.reference });
  const consultation = { id: 'cs1', ref: 'CF-12', date: '2026-11-03', affaireId: 'A1', statut: 'En cours', dateLivraison: '2026-12-01',
    lignes: ms.map(m => ({ designation: m.designation, unite: 'u', qte: m.qte, materiel: lien(m) })),
    fournisseurs: [{ entrepriseId: 'f1', statut: 'Offre reçue', offre: { prix: { 0: 8000, 1: 2100, 2: 600 }, refs: {} } }, { entrepriseId: 'f2', statut: 'Consulté' }] };
  // Offre retenue → commande : chaque ligne garde le lien avec le matériel retenu
  const cmd = OC.commande(consultation, 'f1', '2026-11-10');
  assert.deepStrictEqual(cmd.lignes.map(l => l.materiel && l.materiel.cle), ms.map(m => m.cle));
  const commandes = [{ id: 'k1', ...cmd, numero: 'CMD-7', statut: 'Envoyée', dateLivraison: '2026-11-28', lignes: cmd.lignes.map((l, i) => (i === 2 ? { ...l, qteRecue: 2 } : l)), receptions: [{ date: '2026-11-20' }] }];
  const nom = id => ({ f1: 'ACME Distribution', f2: 'ACME Négoce' }[id] || '');
  // Avant la commande : consulté (offres reçues)
  const avant = I.suiviCommandes(ms, [], [consultation], nom);
  assert.deepStrictEqual(M.etatAchat(avant[0]), { etat: 'offre', libelle: 'Consulté — 1 offre(s)', date: '2026-11-03', consultation: 'CF-12', prevue: '2026-12-01' });
  assert.deepStrictEqual(avant[0].consultation.fournisseurs, ['ACME Distribution', 'ACME Négoce']);
  // Après : commandé (livraison prévue), reçu
  const apres = I.suiviCommandes(ms, I.lignesCommandes(commandes, 'A1', nom), [consultation], nom);
  const e = apres.map(M.etatAchat);
  assert.deepStrictEqual(e.map(x => x.etat), ['commande', 'commande', 'recu']);
  assert.deepStrictEqual([e[0].commande, e[0].prevue, e[0].fournisseur], ['CMD-7', '2026-11-28', 'ACME Distribution']);
  assert.strictEqual(e[2].date, '2026-11-20');
  assert.ok(apres.every(m => m.lienExact));
  const av = I.avancement(apres);
  assert.deepStrictEqual([av.consultes, av.commandes, av.livres], [3, 3, 1]);
  // Renvoyé à l'étude : suivi du chantier (pose) complété de l'état d'achat, ligne par ligne
  const suivis = [{ etudeId: 'e1', cle: 'pompe|c1', poseLe: '2026-11-25' }];
  const r = M.suiviAvecAchats('e1', suivis, apres);
  assert.strictEqual(r.length, 3);
  assert.deepStrictEqual([r[0].cle, r[0].poseLe, r[0].achat.etat], ['pompe|c1', '2026-11-25', 'recu']);
  assert.strictEqual(r.find(x => x.cle === 'aero|cta-df|3000').achat.consultationRef, 'CF-12');
  // La reprise du suivi par l'étude ignore les lignes qui ne portent que l'état d'achat
  const saisies = {};
  assert.strictEqual(M.reprendreSuivi(saisies, [{ cle: 'aero|cta-df|3000', statut: 'Validé', designation: 'x', qte: 1 }], r, '2026-11-26'), 0);
});
