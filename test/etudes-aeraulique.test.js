// Schéma de principe aéraulique (application Études) : CTA / caisson producteur, bouches de soufflage, reprise et
// extraction émettrices ; gaines, ventilateurs, schéma ; reprise par l'inventaire, le métré et l'alimentation électrique.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta');
const S = require('../etudes/public/js/aeraulique-schema');
const E = require('../etudes/public/js/electricite');
const Me = require('../etudes/public/js/metre');
const Liens = require('../etudes/public/js/liens');
const I = require('../public/js/inventaire-cvc');

test('CTA double flux par défaut : débits, pressions, puissances, SFP, schéma', () => {
  const r = N.calculer('aero', N.defauts('aero')), v = r.valeurs;
  assert.deepStrictEqual([v.Qs, v.Qr, v.producteur], [3000, 2900, 'cta-df']);
  assert.ok(v.pS > 400 && v.pS < 800, `pS ${v.pS}`);
  assert.ok(v.pR > 300 && v.pR < v.pS, `pR ${v.pR}`);
  assert.ok(v.sfp > 1 && v.sfp < 2.5, `SFP ${v.sfp}`);
  assert.ok(v.troncons.length > 0 && v.troncons.every(t => /^Ø \d+/.test(t.nom) && t.L > 0));
  assert.ok(v.bouches.some(b => b.n === 8 && /plafond/i.test(b.type)));
  assert.ok(/<svg/.test(r.schema) && /Schéma de principe aéraulique/.test(r.titreSchema));
  assert.ok(!r.alertes.some(a => a.niveau === 'erreur'));
});

test('caisson d\'extraction seul : pas de soufflage, alerte si la bouche est trop petite', () => {
  const e = { ...N.defauts('aero'), producteur: 'extraction', zones: [{ rep: 'Sanitaires', reseau: 'extraction', type: 'extraction', n: 1, Q: 600, distance: 10, L: 5, zeta: 3 }] };
  const v = N.calculer('aero', e).valeurs;
  assert.strictEqual(v.Qs, 0); assert.strictEqual(v.Qr, 600);
  const b = S.choisirBouche('extraction', 50000, 1.2);
  assert.ok(b.v > b.b.vmax, 'plus grande taille de la gamme dépassée');
  // Gaine : vitesse et perte de charge linéique respectées
  const g = S.choisirGaine(3000, { T: 20, materiau: 'galva', Rmax: 1 }, 6);
  assert.ok(g.v <= 6 && g.R <= 1, `${g.nom} ${g.v} ${g.R}`);
  const gr = S.choisirGaine(3000, { T: 20, materiau: 'galva', Rmax: 1, forme: 'rect', h: 300 }, 6);
  assert.match(gr.nom, /× 300$/);
});

test('inventaire CCTP / DPGF : bouches classées en émetteurs, schéma aéraulique prérempli', () => {
  assert.deepStrictEqual(I.classer('Bouche de soufflage plafond 4 directions'), { categorie: 'emetteur', genre: 'bouche-soufflage' });
  assert.deepStrictEqual(I.classer('Grille d\'extraction murale'), { categorie: 'emetteur', genre: 'bouche-extraction' });
  assert.strictEqual(I.debitAir('Diffuseur plafond 250 m3/h'), 250);
  const inv = [
    { id: 'a', genre: 'cta', designation: 'CTA double flux 3000 m³/h', qte: 1 },
    { id: 'b', genre: 'bouche-soufflage', designation: 'Diffuseur à jet hélicoïdal', qte: 4, Q: 250 },
    { id: 'c', genre: 'bouche-extraction', designation: 'Bouche d\'extraction sanitaires', qte: 6 },
  ];
  const { entrees, alertes } = I.versSchemaAir(inv);
  assert.strictEqual(entrees.producteur, 'cta-df');
  assert.deepStrictEqual(entrees.zones.map(z => [z.reseau, z.type, z.n, z.Q]), [['soufflage', 'helico', 4, 1000], ['reprise', 'extraction', 6, 600]]);
  assert.ok(alertes.some(a => /débit non trouvé/.test(a)));
  assert.strictEqual(I.versSchemaAir([{ genre: 'ventilateur', designation: 'Caisson d\'extraction', qte: 1 }, inv[2]]).entrees.zones[0].reseau, 'extraction');
  assert.ok(!I.versElec(inv).some(x => /Bouche|Diffuseur/.test(x.designation)), 'les bouches ne sont pas alimentées');
});

test('métré et alimentation électrique reprennent la CTA, les bouches, les gaines et les ventilateurs', () => {
  const et = { notes: [{ id: 'a1', type: 'aero', titre: 'CTA bureaux', entrees: N.defauts('aero') }] };
  const postes = Me.metre(et);
  assert.ok(postes.some(p => /Centrale de traitement d'air 3 000 m³\/h double flux/.test(p.designation.replace(/ | /g, ' '))), postes.map(p => p.designation).join(' | '));
  assert.ok(postes.some(p => /Ø \d+/.test(p.designation) && p.unite === 'ml'));
  assert.ok(postes.some(p => /plafond/i.test(p.designation) && p.qte === 8));
  const eq = E.equipementsEtude(et, Liens);
  const vs = eq.find(x => x.rep === 'VS-N1'), vr = eq.find(x => x.rep === 'VR-N1');
  assert.ok(vs && vr, eq.map(x => x.rep).join(','));
  assert.deepStrictEqual([vs.type, vs.depart, vs.regulation], ['ventilateur', 'variateur', 'var']);
  assert.ok(vs.P >= 0.9 && vs.P <= 1, `P ${vs.P}`);
});
