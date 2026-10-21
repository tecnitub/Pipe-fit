// Affichage par accès : éléments masqués par rôle ou par compte, adresses masquées, premier écran affiché.
const { test } = require('node:test');
const assert = require('node:assert');
const A = require('../public/js/acces');
const MENU_OF = { comptoir: 'commandes', efactures: 'commandes', compta: 'factures', chantier: 'chantiers', epreuve: 'chantiers' };

test('masques : rôle, réglage propre au compte, administrateur toujours complet', () => {
  const acces = { roles: { charge: { masques: ['direction'] }, atelier: { masques: ['pointage/frais'] } }, comptes: { k2: { masques: ['direction', 'compta'] } } };
  assert.deepStrictEqual(A.masques({ id: 'k1', role: 'charge' }, acces), ['direction']);
  assert.deepStrictEqual(A.masques({ id: 'k2', role: 'charge' }, acces), ['direction', 'compta']);
  assert.deepStrictEqual(A.masques({ id: 'k3', role: 'atelier' }, acces), ['pointage/frais']);
  assert.deepStrictEqual(A.masques({ id: 'k0', role: 'admin' }, acces), []);
  assert.deepStrictEqual(A.masques({ id: 'k1', role: 'charge' }, undefined), []);
});

test('adresses masquées : menu et ses sous-écrans, écran précis, onglets du téléphone', () => {
  const r = (n, p, m, role) => A.routeMasquee(n, p, m, MENU_OF, role);
  assert.deepStrictEqual([r('commandes', [], ['commandes'], 'charge'), r('comptoir', [], ['commandes'], 'charge'), r('comptoir', [], ['comptoir'], 'charge'), r('commandes', [], ['comptoir'], 'charge')], [true, true, true, false]);
  assert.deepStrictEqual([r('parametres', [], ['parametres'], 'charge'), r('notifications', [], ['dashboard'], 'charge')], [false, false], 'Paramètres et notifications restent accessibles');
  const m = ['pointage/heures', 'pointage/chantiers', 'pointage/planning', 'mes'];
  assert.deepStrictEqual([r('pointage', [], m, 'atelier'), r('pointage', ['chantier', 'af1'], m, 'atelier'), r('planning', [], m, 'atelier'), r('pointage', ['rapports'], m, 'atelier'), r('mes', ['new'], m, 'atelier'), r('epreuve', ['new'], m, 'atelier')],
    [true, true, true, false, true, false]);
  assert.strictEqual(A.accueil(m, 'atelier'), 'pointage/rapports');
  assert.strictEqual(A.accueil(['dashboard', 'direction'], 'charge'), 'contacts');
  assert.strictEqual(A.accueil(A.GROUPES[0].elements.map(e => e[0]), 'charge'), 'parametres');
});
