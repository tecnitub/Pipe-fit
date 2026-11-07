const test = require('node:test');
const assert = require('node:assert');
const C = require('../public/js/consult-terrain');

const articles = [
  { id: 'a1', ref: 'COU-50', designation: 'Coude DN50', famille: 'Raccords', unite: 'u', fournisseurId: 'e5', fournisseursConsult: ['e6', 'e7', 'e5', 'e8', 'e9', 'e10'] },
  { id: 'a2', ref: 'BRI-100', designation: 'Bride DN100', famille: 'Raccords', unite: 'u', fournisseurId: 'e5', fournisseursConsult: ['e6', 'e7'] },
  { id: 'a3', ref: 'VAN-50', designation: 'Vanne DN50', famille: 'Robinetterie', unite: 'u', fournisseurId: 'e6', fournisseursConsult: [] },
  { id: 'a4', ref: 'TUB', designation: 'Tube', famille: 'Tubes', unite: 'ml' },
];
const parFamille = { Robinetterie: { prefere: 'e6', autres: ['e9'] }, Tubes: { prefere: 'e11', autres: ['e12', 'e13'] } };

test('fournisseurs : préféré et 3 autres au plus, famille pour les lignes libres', () => {
  assert.deepStrictEqual(C.fournisseursArticle(articles[0]), ['e5', 'e6', 'e7', 'e8']);
  assert.deepStrictEqual(C.fournisseursLigne({ articleId: 'a4' }, articles, parFamille), ['e11', 'e12', 'e13']);
  assert.deepStrictEqual(C.fournisseursLigne({ designation: 'Robinet à boisseau', famille: 'robinetterie' }, articles, parFamille), ['e6', 'e9']);
  assert.deepStrictEqual(C.fournisseursLigne({ designation: 'Bidule', famille: 'Divers' }, articles, parFamille), []);
});

test('demande du terrain : lignes regroupées par fournisseurs, sans fournisseur au bureau', () => {
  const ls = C.lignes([{ articleId: 'a1', qte: '10' }, { articleId: 'a2', qte: 2 }, { articleId: 'a3', qte: 1 }, { designation: 'Robinet 1/4 tour DN20', famille: 'Robinetterie', qte: 4 },
    { designation: 'Joint spécial', famille: 'Divers', qte: 3 }, { designation: '', qte: 2 }, { articleId: 'a4', qte: 0 }], articles);
  assert.strictEqual(ls.length, 5);
  assert.deepStrictEqual(ls[0], { articleId: 'a1', designation: 'Coude DN50', ref: 'COU-50', famille: 'Raccords', unite: 'u', qte: 10, note: '' });
  const g = C.grouper(ls, articles, parFamille);
  assert.deepStrictEqual(g.groupes.map(x => [x.fournisseurs.join(','), x.lignes.map(l => l.designation)]), [
    ['e5,e6,e7,e8', ['Coude DN50']], ['e5,e6,e7', ['Bride DN100']], ['e6', ['Vanne DN50']], ['e6,e9', ['Robinet 1/4 tour DN20']]]);
  assert.deepStrictEqual(g.sansFournisseur.map(l => l.designation), ['Joint spécial']);
});

test('adresse des demandes de prix et message', () => {
  const ent = { id: 'e5', email: 'contact@four.fr' }, contacts = [{ entrepriseId: 'e5', email: 'paul@four.fr', fonction: 'Magasinier' }, { entrepriseId: 'e5', email: 'adv@four.fr', fonction: 'Commercial sédentaire' }];
  assert.strictEqual(C.adresse({ ...ent, emailConsultation: 'devis@four.fr' }, contacts), 'devis@four.fr');
  assert.strictEqual(C.adresse(ent, contacts), 'adv@four.fr');
  assert.strictEqual(C.adresse(ent, []), 'contact@four.fr');
  assert.strictEqual(C.adresse({ id: 'x' }, []), '');
  const m = C.message({ ref: 'CS-2026-0012', chantier: { code: 'CH-2026-001', nom: 'Ligne NEP' }, date: '2026-11-10', lignes: [{ designation: 'Coude <DN50>', ref: 'COU-50', qte: 10, unite: 'u' }], demandeur: 'Kevin Roux' });
  assert.strictEqual(m.sujet, 'Demande de prix CS-2026-0012 – chantier CH-2026-001');
  assert.ok(m.html.includes('Coude &lt;DN50&gt;') && m.html.includes('10/11/2026') && m.html.includes('CS-2026-0012'));
});
