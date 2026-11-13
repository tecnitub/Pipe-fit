// Libellés courts des formulaires de calcul (Études) : précision passée en aide, unité gardée, libellés courts inchangés
const { test } = require('node:test');
const assert = require('node:assert');
const E = require('../etudes/public/js/ergonomie.js');

test('libellé court : précision entre parenthèses passée en aide, unité gardée', () => {
  assert.deepStrictEqual(E.libelleCourt('Vitesse maximale'), { court: 'Vitesse maximale', aide: '' });
  assert.strictEqual(E.libelleCourt('ΔP côté eau (kPa ; vide : forfait chaudière 10, PAC/GF 40, échangeur 20)').court, 'ΔP côté eau (kPa)');
  assert.strictEqual(E.libelleCourt('Puissance unitaire (chauffage en change-over)').court, 'Puissance unitaire');
  const r = E.libelleCourt('Générateurs détaillés (production hétérogène : base, relève, appoint, secours, récupération) — vide : générateur × nombre ci-dessus');
  assert.strictEqual(r.court, 'Générateurs détaillés');
  assert.match(r.aide, /récupération/);
  // « vide : … » n'est pas une unité
  assert.strictEqual(E.libelleCourt('Repère du générateur principal (vide : G1, PAC2…)').court, 'Repère du générateur principal');
});

test('libellé court : texte sans précision gardé entier s\'il reste raisonnable', () => {
  assert.strictEqual(E.libelleCourt('Découplage production / distribution des circuits').court, 'Découplage production / distribution des circuits');
  const long = 'Un libellé très long sans aucune précision qui continue encore et encore bien au-delà de soixante-dix caractères';
  assert.ok(E.libelleCourt(long).court.endsWith('…'));
  assert.strictEqual(E.libelleCourt(long).aide, long);
});
