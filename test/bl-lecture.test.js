// BL chiffré photographié au comptoir : lecture, et coût compté dans la rentabilité du chantier jusqu'à la facture.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const B = require('../public/js/bl-lecture');

test('lecture du bon : n°, date, référence chantier, lignes, total HT', () => {
  const r = B.analyser(['DESCOURS & CABOT', 'BON DE LIVRAISON N° 4719', 'Date : 18/10/2026', 'Votre réf. : CH-2026-003', 'Réf.\tDésignation\tQté\tPU net\tMontant',
    'TUB-316-050\tTUBE INOX 316L DN50 SCH10S\t6\t47,30\t283,80', 'TEE-316-050\tTE EGAL INOX 316L DN50\t2\t32,60\t65,20', 'Total HT\t349,00', 'TVA 20 %\t69,80', 'Total TTC\t418,80']);
  assert.deepStrictEqual([r.bl, r.date, r.refChantier, r.montant, r.lignes.length, r.coherent], ['4719', '2026-10-18', 'CH-2026-003', 349, 2, true]);
  const s = B.analyser(['Ticket 88213 18.10.26', 'Joint graphite DN50 10 3,20 32,00', 'Boulon inox M16x70 24 1,10 26,40']);
  assert.deepStrictEqual([s.bl, s.montant], ['88213', 58.4], 'sans total : somme des lignes');
  assert.strictEqual(B.analyser(['photo floue']).montant, null);
});

test('rentabilité : BL déclaré compté tout de suite, plus après la facture, pas sans montant', () => {
  const data = { settings: { tva: 20 }, achats: [{ id: 'ff', imputations: [{ affaireId: 'a', commandeId: '', montantHT: 120 }] }], commandes: [],
    enlevements: [{ id: 'e1', affaireId: 'a', statut: 'Déclaré', montant: 349 }, { id: 'e2', affaireId: 'a', statut: 'Facturé', achatId: 'ff', montant: 120 }, { id: 'e3', affaireId: 'a', statut: 'Déclaré', montant: '' }, { id: 'e4', affaireId: 'b', statut: 'Déclaré', montant: 50 }] };
  const Store = { data: { settings: data.settings }, all: c => data[c] || [], get: (c, id) => (data[c] || []).find(x => x.id === id) };
  const ctx = vm.createContext({ Store });
  vm.runInContext(`${fs.readFileSync(path.join(__dirname, '../public/js/calc.js'), 'utf8')}\nthis.Calc = Calc;`, ctx);
  const d = ctx.Calc.achatsChantier('a');
  assert.deepStrictEqual([d.comptoir.map(e => e.id).join(), d.totalComptoir, d.totalHorsCommande], ['e1', 349, 120], 'e2 compté par sa facture, e3 sans montant');
});
