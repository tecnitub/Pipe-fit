const { test } = require('node:test');
const assert = require('node:assert');
const B = require('../public/js/budget-heures');

test('budget d\'heures par poste : chiffré (devis), pointé, alerte à 80 % sans PV signé', () => {
  const mo = h => ({ type: 'mo', heures: h });
  const devis = [{ lignes: [{ type: 'chapitre', titre: 'Régulation' },
    { type: 'ouvrage', designation: 'Programmation de l\'automate (points, boucles, plannings, alarmes)', qte: 1, composants: [mo(20)] },
    { type: 'ouvrage', designation: 'Essais point à point (automate et GTB)', qte: 1, composants: [mo(8)] },
    { type: 'ouvrage', designation: 'Mise en service, réglages et essais des séquences', qte: 1, composants: [mo(10)] },
    { type: 'ouvrage', designation: 'Tube acier DN50', qte: 30, composants: [{ type: 'f' }, mo(0.5)] }] }];
  const temps = [{ tache: 'Programmation automate', heures: 17 }, { tache: 'Essais point à point', heures: 3 }, { tache: 'Mise en service / séquences', heures: 11 }, { tache: 'Soudure', heures: 12 }];
  const mises = [{ equipement: 'Réglages de la régulation — valeurs (A)', statut: 'Brouillon' }, { equipement: 'Essais des séquences de fonctionnement (A)', statut: 'Signé' }];
  const r = Object.fromEntries(B.calculer({ devis, temps, mises }).map(x => [x.cle, x]));
  assert.deepStrictEqual([r.prog.chiffre, r.prog.pointe, r.prog.alerte, r.prog.pv], [20, 17, true, '0/1 PV signé(s)']);
  assert.deepStrictEqual([r.pap.chiffre, r.pap.pointe, r.pap.alerte, r.pap.pv], [8, 3, false, 'PV pas encore créé']);
  assert.deepStrictEqual([r.mes.chiffre, r.mes.pointe, r.mes.alerte, r.mes.depasse], [10, 11, false, true]); // PV signé : pas d'alerte, mais dépassé
  assert.deepStrictEqual([r.autres.chiffre, r.autres.pointe, r.autres.alerte], [15, 12, false]);
  assert.strictEqual(B.posteDe('Essais point à point (automate et GTB)'), 'pap');
});
