const test = require('node:test');
const assert = require('node:assert');
const Stock = require('../public/js/stock');

test('QR : adresse de la fiche et lecture', () => {
  const l = Stock.lien('https://crm.tecnitub.fr/', 'a', 'a14');
  assert.strictEqual(l, 'https://crm.tecnitub.fr/#/scan/a/a14');
  assert.deepStrictEqual(Stock.lire(l), { type: 'a', id: 'a14' });
  assert.deepStrictEqual(Stock.lire('http://serveur:3000/#/scan/m/pm4'), { type: 'm', id: 'pm4' });
  assert.deepStrictEqual(Stock.lire('PF:A:a5'), { type: 'a', id: 'a5' });
  assert.strictEqual(Stock.lire('https://exemple.fr'), null);
});

test('Quantité en stock : inventaire, entrées, sorties et retours', () => {
  const a = { id: 'a1', designation: 'Coude DN50', unite: 'u', stockGere: 'Oui', stockMini: 10, stockReassort: 40, coutRevient: 20, prixVente: 26, fournisseurId: 'e5' };
  const mv = [{ articleId: 'a1', type: 'inventaire', qte: 30, date: '2026-10-01' }, { articleId: 'a1', type: 'entree', qte: 40, date: '2026-10-20' }];
  const cs = [Stock.sortie(a, { qte: 25, affaireId: 'af1', userId: 'o1', date: '2026-10-10' }), Stock.sortie(a, { qte: -3, affaireId: 'af1', userId: 'o1', date: '2026-10-11' }),
    { articleId: 'a1', qte: 5, affaireId: 'af2', date: '2026-09-01', stock: true }, { articleId: 'a1', qte: 99, affaireId: 'af2', date: '2026-10-12' }];
  assert.strictEqual(Stock.quantite('a1', cs, mv), 48); // 30 − 25 + 3 + 40 (sortie d'avant l'inventaire et consommation hors stock ignorées)
  assert.strictEqual(Stock.etat(a, 48), 'ok');
  assert.strictEqual(Stock.etat(a, 8), 'reassort');
  assert.strictEqual(Stock.etat(a, 0), 'rupture');
  assert.strictEqual(cs[0].cout, 20); assert.strictEqual(cs[0].stock, true);
  assert.throws(() => Stock.sortie(a, { qte: 2, affaireId: '' }), /Chantier/);
  const h = Stock.historique('a1', cs, mv);
  assert.deepStrictEqual(h.map(x => x.type), ['sortie', 'inventaire', 'sortie', 'retour', 'entree']);
  assert.deepStrictEqual(Stock.sortiesChantier('af1', cs, [a]), [{ articleId: 'a1', designation: 'Coude DN50', unite: 'u', qte: 22, cout: 440 }]);
});

test('Réassort : articles sous le minimum et demande de prix', () => {
  const arts = [{ id: 'a1', designation: 'Coude', unite: 'u', stockGere: true, stockMini: 10, stockReassort: 40, fournisseurId: 'e5' },
    { id: 'a2', designation: 'Bride', unite: 'u', stockGere: true, stockMini: 4, fournisseurId: 'e6' }, { id: 'a3', designation: 'Tube', stockGere: false }];
  const mv = [{ articleId: 'a1', type: 'inventaire', qte: 6, date: '2026-10-01' }, { articleId: 'a2', type: 'inventaire', qte: 20, date: '2026-10-01' }];
  const r = Stock.aReassortir(arts, [], mv);
  assert.deepStrictEqual(r.map(x => [x.a.id, x.q, x.commande]), [['a1', 6, 40]]);
  const d = Stock.demandeReassort(r);
  assert.deepStrictEqual(d.lignes, [{ articleId: 'a1', designation: 'Coude', unite: 'u', qte: 40 }]);
  assert.deepStrictEqual(d.fournisseurs, [{ entrepriseId: 'e5', statut: 'À consulter' }]);
  assert.strictEqual(Stock.aCommander({ stockMini: 5 }, 2), 8);
});

test('Outillage : pris et rendu en scannant', () => {
  const m = { id: 'pm4', designation: 'Poste TIG', affectation: { userId: '', affaireId: '' }, historique: [] };
  const pris = Stock.affecter(m, { action: 'prendre', userId: 'o1', affaireId: 'af1', date: '2026-11-02', par: 'Kevin' });
  assert.deepStrictEqual(pris.affectation, { userId: 'o1', affaireId: 'af1', depuis: '2026-11-02' });
  const rendu = Stock.affecter(pris, { action: 'rendre', date: '2026-11-05', par: 'Kevin' });
  assert.deepStrictEqual([rendu.affectation.userId, rendu.historique.length], ['', 2]);
  assert.throws(() => Stock.affecter(m, { action: 'voler' }));
});
