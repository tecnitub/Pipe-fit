const test = require('node:test');
const assert = require('node:assert');
const O = require('../public/js/offre-choix');

const cons = () => ({ id: 'c1', ref: 'CS-2026-0010', statut: 'En cours', affaireId: 'af1', date: '2026-11-02', dateLivraison: '2026-11-06', terrain: { userId: 'o1', le: '2026-11-02T08:00:00Z' },
  lignes: [{ articleId: 'a1', designation: 'Coude DN50', unite: 'u', qte: 10 }, { designation: 'Robinet DN20', unite: 'u', qte: 4 }],
  fournisseurs: [
    { entrepriseId: 'e5', statut: 'Offre reçue', offre: { prix: { 0: 20, 1: 15 }, remise: 10, port: 12, delai: '2', reference: 'OF-55' } },
    { entrepriseId: 'e11', statut: 'Offre reçue', offre: { prix: { 0: 19, 1: 16 }, port: 0, delai: '3' } },
    { entrepriseId: 'e12', statut: 'Consulté' }] });

test('totaux, mieux-disant et commande tirée de l\'offre', () => {
  const c = cons();
  assert.deepStrictEqual([O.totaux(c, c.fournisseurs[0]).net, O.totaux(c, c.fournisseurs[1]).net], [246, 254]); // (200+60)×0,9 + 12 ; 190+64
  assert.deepStrictEqual(O.meilleure(c), { entrepriseId: 'e5', net: 246, delai: '2', deuxieme: 254 });
  const cmd = O.commande(c, 'e5', '2026-11-03');
  assert.deepStrictEqual(cmd.lignes.map(l => [l.designation, l.qte, l.pu]), [['Coude DN50', 10, 18], ['Robinet DN20', 4, 13.5], ['Frais de port', 1, 12]]);
  assert.deepStrictEqual([cmd.fournisseurId, cmd.consultationId, cmd.dateLivraison, cmd.devisFournisseurRef], ['e5', 'c1', '2026-11-06', 'OF-55']);
  assert.throws(() => O.commande(c, 'e12', '2026-11-03'));
});

test('commande automatique sous le seuil du compagnon', () => {
  const c = cons();
  // e12 n'a pas répondu : on attend, sauf après 24 h
  assert.strictEqual(O.decisionAuto(c, { seuilCommande: 300 }, '2026-11-02T12:00:00Z').raison, 'offres attendues');
  assert.strictEqual(O.decisionAuto(c, { seuilCommande: 300 }, '2026-11-03T09:00:00Z').commander, true);
  c.fournisseurs[2].statut = 'Décline';
  assert.strictEqual(O.decisionAuto(c, { seuilCommande: 300 }, '2026-11-02T12:00:00Z').commander, true);
  assert.match(O.decisionAuto(c, { seuilCommande: 200 }, '2026-11-02T12:00:00Z').raison, /au-dessus du seuil/);
  assert.strictEqual(O.decisionAuto(c, {}, '2026-11-02T12:00:00Z').raison, 'validation du bureau');
  assert.strictEqual(O.decisionAuto({ ...c, retenu: { entrepriseId: 'e5' } }, { seuilCommande: 300 }, '2026-11-02T12:00:00Z').commander, false);
  c.fournisseurs[0].offre.prix = { 0: 20 }; c.fournisseurs[1].offre.prix = { 1: 15 };
  assert.strictEqual(O.decisionAuto(c, { seuilCommande: 300 }, '2026-11-02T12:00:00Z').raison, 'aucune offre complète');
});

test('état de la demande vu par le compagnon, sans prix', () => {
  const c = cons(), nom = id => ({ e5: 'Inox Distribution' }[id] || '');
  assert.deepStrictEqual([O.etatDemande(c, []).etat, O.etatDemande(c, []).libelle], ['offres', '2 offre(s) reçue(s) sur 3']);
  const e = O.etatDemande(c, [{ id: 'k1', consultationId: 'c1', numero: 'CF-2026-0042', fournisseurId: 'e5', statut: 'Envoyée', dateLivraison: '2026-11-06' }], nom);
  assert.deepStrictEqual([e.etat, e.commande.numero, e.commande.fournisseur], ['commandee', 'CF-2026-0042', 'Inox Distribution']);
  assert.ok(!JSON.stringify(e).includes('"pu"') && !JSON.stringify(e).includes('"net"'));
  assert.strictEqual(O.etatDemande(c, [{ consultationId: 'c1', statut: 'Réceptionnée' }]).libelle, 'Livrée');
  assert.strictEqual(O.etatDemande({ ...c, fournisseurs: [] }, []).etat, 'bureau');
  const m = O.mailCommande({ numero: 'CF-2026-0042', consultationRef: 'CS-2026-0010', devisRef: 'OF-55', lignes: O.commande(c, 'e5', 'x').lignes, dateLivraison: '2026-11-06' });
  assert.ok(/Commande CF-2026-0042/.test(m.sujet) && /246,00/.test(m.html) && /06\/11\/2026/.test(m.html));
});
