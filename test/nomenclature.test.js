// Schéma de principe : robinetterie (pertes de charge, fiches), nomenclature et liste d'achat
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Terminaux = require('../etudes/public/js/terminaux');
const Sc = require('../etudes/public/js/schema');
global.Schema = Sc;
const L = require('../etudes/public/js/liens');
const Nm = require('../etudes/public/js/nomenclature');
const M = require('../etudes/public/js/metre');

const pid = rob => ({ id: 'p', type: 'pid', titre: 'Chaufferie', entrees: { ...N.defauts('pid'), robinetterie: rob } });

test('robinetterie : ΔP de la fiche, (Q/Kv)², ζ ; HMT du circuit sans le forfait de 5 kPa', () => {
  const sans = N.calculer('pid', pid([]).entrees).valeurs.circuits[0];
  const rob = [{ rep: 'F1', circuit: 'Radiateurs bureaux', type: 'filtre', dp: 6 }, { rep: 'VE1', circuit: 'Radiateurs bureaux', type: 'equilibrage', kv: 10 }];
  const r = N.calculer('pid', pid(rob).entrees), c = r.valeurs.circuits[0];
  const dpKv = (c.Q / 10) ** 2 * 100 * (c.rob[1].dpTot / ((c.Q / 10) ** 2 * 100));
  assert.ok(Math.abs(c.rob[0].dpTot - 6) < 1e-9);
  assert.ok(Math.abs(c.rob[1].dpTot - dpKv) < 1e-9 && c.rob[1].dpTot > 14 && c.rob[1].dpTot < 16);
  // HMT : robinetterie (≈ 21 kPa) au lieu du forfait de 5 kPa
  assert.ok(Math.abs((c.hmt - sans.hmt) * 9.81 * 0.98 - (6 + c.rob[1].dpTot - 5)) < 0.6);
  assert.ok(r.tableaux.some(t => /Robinetterie et accessoires/.test(t.titre)));
  assert.strictEqual(N.calculer('pid', pid(rob).entrees).valeurs.circuits[1].rob.length, 0);
});

test('fiche technique d\'un organe : Kvs, DN, perte de charge', () => {
  const f = Sc.lireFicheRobinet(['Vanne d\'équilibrage STAD', 'DN 40', 'Kvs = 25,9', 'Perte de charge : 12 kPa']);
  assert.deepStrictEqual([f.valeurs.kv, f.valeurs.dn, f.valeurs.dp], [25.9, 40, 12]);
  assert.strictEqual(Sc.lireFicheRobinet(['Filtre Y', 'Delta P 150 mbar']).valeurs.dp, 15);
});

test('nomenclature et liste d\'achat : articles regroupés, fiches, terminaux du circuit, métré', () => {
  const p = pid([{ rep: 'VI1', circuit: 'Radiateurs bureaux', type: 'isolement', qte: 4, ref: 'Comap 2000', fiche: { fabricant: 'Comap', reference: '2000', nom: 'comap.pdf' } },
    { rep: 'VI2', circuit: 'CTA atelier', type: 'isolement', qte: 4, ref: 'Comap 2000', fiche: { fabricant: 'Comap', reference: '2000', nom: 'comap.pdf' } }]);
  const t = { id: 't', type: 'terminaux', titre: 'T', entrees: { ...N.defauts('terminaux'), appareils: [{ rep: 'CA-01', type: 'cassette4', Pch: 3, circuit: 'p|Radiateurs bureaux', fiche: { fabricant: 'Daikin', reference: 'FXZQ' } }] } };
  const et = { id: 'x', notes: [p, t] }, calc = n => L.calculer(et, n); calc.entrees = n => L.resoudre(et, n).entrees;
  const [nom, achat] = Nm.feuilles(et, p, calc);
  assert.ok(nom.lignes.some(l => l[0] === 'VI1' && l[7] === 'Comap' && l[9] === 'comap.pdf'));
  assert.ok(nom.lignes.some(l => l[0] === 'CA-01' && l[2] === 'Terminaux' && l[7] === 'Daikin'));
  // Sans terminal (le terminal relié change la puissance, donc le DN, du premier circuit) : mêmes articles regroupés
  const et2 = { id: 'y', notes: [p] }, calc2 = n => L.calculer(et2, n); calc2.entrees = n => L.resoudre(et2, n).entrees;
  const vi = Nm.feuilles(et2, p, calc2)[1].lignes.find(l => /Vanne d'isolement/.test(l[1]));
  assert.strictEqual(vi[5], 8);
  assert.match(vi[7], /VI1, VI2/);
  assert.ok(achat.lignes.some(l => l[0] === 'Tuyauterie' && l[6] === 'ml'));
  // Métré : la robinetterie saisie remplace l'équipement usuel du circuit
  const postes = M.metre({ id: 'x', notes: [p] });
  assert.ok(postes.some(x => /Vanne d'isolement.*Comap 2000/.test(x.designation) && x.qte === 8));
});

test('réseau arborescent : robinetterie par tronçon, vanne d\'équilibrage de la fiche, préréglage en tours', () => {
  const E = require('../etudes/public/js/equilibrage');
  void E;
  const base = N.defauts('arbo');
  const sans = N.calculer('arbo', base).valeurs;
  const e = { ...base, robinetterie: [{ rep: 'F1', troncon: 'C', type: 'filtre', dp: 8 }, { rep: 'STAD-1', troncon: 'A3', type: 'equilibrage', kv: 25, tours: 4, ref: 'TA STAD' }] };
  const r = N.calculer('arbo', e), v = r.valeurs;
  // Filtre de 8 kPa sur le départ commun : le réseau (circuit le plus défavorisé) prend 8 kPa de plus
  assert.ok(Math.abs((v.Hres - sans.Hres) / 1000 - 8) < 0.05);
  const a3 = v.vannes.find(x => x.rep === 'A3');
  assert.strictEqual(a3.Kvs, 25);
  assert.strictEqual(a3.ref, 'TA STAD');
  assert.ok(Math.abs(a3.tours - Math.max(0.5, 4 * a3.Kv / 25)) < 1e-9 && a3.tours < 4);
  assert.ok(N.calculer('arbo', { ...e, robinetterie: [{ rep: 'S', troncon: 'A3', type: 'equilibrage', kv: 5, tours: 4 }] }).alertes.some(a => a.niveau === 'erreur' && /trop petite/.test(a.texte)));
  assert.ok(v.vannes.filter(x => x.rep !== 'A3').every(x => x.toursMax === 4 && x.tours > 0));
  assert.ok(r.tableaux.some(t => /Robinetterie et accessoires des tronçons/.test(t.titre)));
  assert.strictEqual(Sc.lireFicheRobinet(['STAD DN 25', 'Kvs 8,8', 'Préréglage 0 à 4 tours']).valeurs.tours, 4);
  const n = { id: 'a', type: 'arbo', titre: 'Réseau', entrees: e }, et = { id: 'x', notes: [n] }, calc = x => L.calculer(et, x); calc.entrees = x => L.resoudre(et, x).entrees;
  const nom = Nm.feuilles(et, n, calc)[0].lignes;
  assert.ok(nom.some(l => /préréglage ≈/.test(l[3]) && l[7] === 'TA'));
  assert.ok(nom.some(l => l[0] === 'F1' && l[2] === 'Robinetterie'));
  // Fiches : organes du calcul et organes « DOE seulement »
  const f = L.fichesInstallation({ notes: [{ ...n, entrees: { ...e, robinetterie: [...e.robinetterie, { rep: 'TH1', troncon: 'C', type: 'thermometre' }] } }] }, { ...n, entrees: { ...e, robinetterie: [...e.robinetterie, { rep: 'TH1', troncon: 'C', type: 'thermometre' }] } });
  assert.strictEqual(f.find(x => /TH1/.test(x.element)).calcul, false);
  assert.strictEqual(f.find(x => /F1/.test(x.element)).calcul, true);
});
