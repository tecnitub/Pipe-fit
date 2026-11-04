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

test('liste d\'achat : prix de la bibliothèque (référence, désignation + DN), lignes de consultation', () => {
  const arts = [{ id: 'a1', ref: 'VS-40', designation: 'Vanne d\'isolement 1/4 tour DN40', coutRevient: 44, prixVente: 62 }, { id: 'a2', ref: 'TUB-40', designation: 'Tube acier noir T10 DN40', coutRevient: 10.4 },
    { id: 'a3', ref: 'TUB-50', designation: 'Tube acier noir T10 DN50', coutRevient: 13 }];
  const l = Nm.prixAchats([{ famille: 'Robinetterie', designation: 'Vanne d\'isolement 1/4 tour (papillon, sphérique)', dn: 40, fabricant: 'Exemplair', reference: 'VS-40', unite: 'u', qte: 8, reps: [] },
    { famille: 'Tuyauterie', designation: 'Tube DN 40 (48,3 × 2,6) (aller + retour)', dn: 40, fabricant: '', reference: '', unite: 'ml', qte: 120, reps: [] },
    { famille: 'Pompes', designation: 'Pompe Circulateur 32-80', dn: '', fabricant: '', reference: '', unite: 'u', qte: 1, reps: [] }], arts);
  assert.deepStrictEqual(l.map(x => x.articleId), ['a1', 'a2', '']);
  assert.strictEqual(l[0].total, 352);
  assert.ok(l[0].certain && !l[1].certain);
  const c = Nm.lignesConsultation(l);
  assert.deepStrictEqual(c.map(x => [x.articleId, x.unite, x.qte]), [['a1', 'u', 8], ['a2', 'ml', 120], ['', 'u', 1]]);
  assert.match(c[0].designation, /DN 40 — Exemplair VS-40/);
});

test('abaque tours / Kv : lecture de la fiche, interpolation du préréglage dans le réseau arborescent', () => {
  const f = Sc.lireFicheRobinet(['Vanne STAD DN 25', 'Préréglage (tours) 0,5 1 1,5 2 2,5 3 3,5 4', 'Kv 0,36 0,66 1,02 1,47 2,08 2,85 3,72 4,54']);
  assert.strictEqual(f.valeurs.kv, 4.54);
  assert.strictEqual(f.valeurs.tours, 4);
  assert.deepStrictEqual(Sc.lireAbaque(f.valeurs.abaque)[2], [1.5, 1.02]);
  const ab = Sc.lireAbaque('1:0,9 ; 2:2,1 ; 3:3,6 ; 4:5,2');
  assert.strictEqual(Sc.toursAbaque(ab, 3).tours, 2.6);
  assert.strictEqual(Sc.toursAbaque(ab, 9).borne, 'maxi');
  // Réseau arborescent : vanne avec abaque sur A3
  require('../etudes/public/js/equilibrage');
  const e = { ...N.defauts('arbo'), robinetterie: [{ rep: 'STAD-1', troncon: 'A3', type: 'equilibrage', abaque: '0,5:2 ; 1:4 ; 2:9 ; 3:16 ; 4:25' }] };
  const r = N.calculer('arbo', e), a3 = r.valeurs.vannes.find(x => x.rep === 'A3');
  assert.strictEqual(a3.Kvs, 25);
  assert.ok(a3.abaque);
  assert.ok(Math.abs(a3.tours - Sc.toursAbaque(Sc.lireAbaque(e.robinetterie[0].abaque), a3.Kv).tours) < 1e-9);
  assert.ok(r.tableaux.some(t => t.lignes.some(l => /\(abaque\)/.test(l[8]))));
});

test('pompes sur la courbe du fabricant : point de fonctionnement, vitesse de réglage, insuffisance, fiche', () => {
  const P = require('../etudes/public/js/pompes');
  global.Pompes = P;
  const c = '0:9 ; 2:8,6 ; 4:7,6 ; 6:6 ; 8:3,8';
  const ok = P.point(c, 4, 5);
  assert.ok(ok.ok && ok.Q > 4 && Math.abs(ok.H - 5 * (ok.Q / 4) ** 2) < 0.01);
  assert.ok(ok.vitesse > 50 && ok.vitesse < 100);
  // À la vitesse de réglage, la pompe donne la hauteur demandée au débit demandé (similitude)
  const s = ok.vitesse / 100;
  assert.ok(Math.abs(s * s * P.interp(P.lireCourbe(c), 4 / s) - 5) < 0.05);
  assert.strictEqual(P.point(c, 6, 8).ok, false);
  assert.strictEqual(P.lireFiche(['Débit Q (m³/h) 0 2 4 6 8', 'Hauteur H (m) 9 8,6 7,6 6 3,8', 'P1 (W) 120 160 200 230 250']), '0:9:120 ; 2:8,6:160 ; 4:7,6:200 ; 6:6:230 ; 8:3,8:250');
  // Schéma de principe : pompe retenue sur le circuit, contrôle et tableau
  const e = { ...N.defauts('pid'), pompesFab: [{ circuit: 'Radiateurs bureaux', ref: 'Exemplair CX 40-8', courbe: '0:9 ; 2:8,6 ; 4:7,6 ; 6:6 ; 8:3,8' }, { circuit: 'CTA atelier', ref: 'Petite', courbe: '0:3 ; 2:2,5 ; 4:1' }] };
  const r = N.calculer('pid', e);
  assert.ok(r.tableaux.some(t => /courbe du fabricant/.test(t.titre)));
  assert.ok(r.alertes.some(a => a.niveau === 'erreur' && /Petite insuffisante/.test(a.texte)));
  assert.match(r.valeurs.circuits[0].pompe, /Exemplair CX 40-8/);
  // Réseau arborescent
  require('../etudes/public/js/equilibrage');
  const v = N.calculer('arbo', { ...N.defauts('arbo'), pompeRef: 'Exemplair CX 65-12', pompeCourbe: '0:16 ; 5:15 ; 10:13 ; 15:9 ; 20:3' }).valeurs;
  assert.ok(v.pompeRetenue && v.pompeRetenue.ref === 'Exemplair CX 65-12');
});
