// Liste de matériel dictée : quantités, unités, diamètres, nombres en lettres, rapprochement avec la bibliothèque.
const { test } = require('node:test');
const assert = require('node:assert');
const D = require('../public/js/dictee');
const { demoData } = require('../server/demo');
const articles = demoData().articles;
const lu = t => D.analyser(t).map(l => [l.qte, l.unite, l.recherche]);
const ref = t => D.analyser(t).map(l => { const r = D.rapprocher(l, articles); return `${l.qte}${l.unite ? ' ' + l.unite : ''} ${r.statut === 'absent' ? '?' : r.article.ref}`; });

test('quantités, unités et diamètres dictés de plusieurs façons', () => {
  assert.deepStrictEqual(lu('3 coudes DN50, 2 brides DN100 et 12 mètres de tube inox DN50'), [[3, '', 'coude dn50'], [2, '', 'bride dn100'], [12, 'ml', 'tube inox dn50']]);
  // Sans ponctuation, nombres en lettres, « de 50 » = DN50
  assert.deepStrictEqual(lu('trois coudes de 50 deux brides de 100 et douze mètres de tube inox 50'), [[3, '', 'coude dn50'], [2, '', 'bride dn100'], [12, 'ml', 'tube inox dn50']]);
  assert.deepStrictEqual(lu('une vanne papillon 2 pouces'), [[1, '', 'vanne papillon dn50']]);
  assert.deepStrictEqual(lu('il me faut 4 tés égaux de 100 et une réduction 100 50'), [[4, '', 'te egal dn100'], [1, '', 'reduction dn100 x50']]);
  assert.deepStrictEqual(lu('tube acier 150 six mètres'), [[6, 'ml', 'tube acier dn150']]); // quantité en fin
  assert.deepStrictEqual(lu('vingt-deux colliers et un mètre cinquante de tube inox de 50'), [[22, '', 'collier'], [1.5, 'ml', 'tube inox dn50']]);
  assert.deepStrictEqual(lu('quatre-vingt-dix coudes 50'), [[90, '', 'coude dn50']]);
  assert.deepStrictEqual(lu('2 raccords union laiton 3/4\n1,5 m de tube cuivre 22 mm'), [[2, '', 'raccord union laiton dn20'], [1.5, 'ml', 'tube cuivre 22mm']]);
});

test('rapprochement avec la bibliothèque', () => {
  assert.deepStrictEqual(ref('3 coudes de 50, 2 brides de 100, 12 mètres de tube inox 50, une réduction 100 50'), ['3 COU-316-050', '2 BRI-316-100', '12 ml TUB-316-050', '1 RED-316-100']);
  const coude = D.rapprocher(D.analyser('2 coudes')[0], articles);
  assert.strictEqual(coude.statut, 'choix'); // plusieurs coudes : à choisir
  assert.strictEqual(coude.candidats.length, 3);
  assert.strictEqual(D.rapprocher(D.analyser('2 raccords union laiton')[0], articles).statut, 'absent');
  // Mot en trop (« soudé ») : trouvé quand même, mais à vérifier
  const r = D.rapprocher(D.analyser('coude soudé inox 50')[0], articles);
  assert.deepStrictEqual([r.statut, r.article.ref], ['choix', 'COU-316-050']);
});
