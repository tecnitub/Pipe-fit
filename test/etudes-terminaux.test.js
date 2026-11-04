// Terminaux (cassettes, ventilo-convecteurs…) : vannes, données électriques, alimentation, bilan, points automate
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta');
const T = require('../etudes/public/js/terminaux');
global.Terminaux = T;
const E = require('../etudes/public/js/electricite');
const Liens = require('../etudes/public/js/liens');

const app = { rep: 'CA-01', local: 'Bureaux', type: 'cassette4', n: 3, Pch: 3, Pfr: 4, batterie: '4t', vanne: '2v', Pvent: 60, Pbe: '', tension: '', alim: 'cvc', regul: 'automate', ref: 'Marque X C4' };

test('terminaux : débits, Kvs, vannes, puissance électrique', () => {
  const r = N.calculer('terminaux', { TcAller: 45, TcRetour: 40, TfAller: 7, TfRetour: 12, dpVanne: 15, appareils: [app, { rep: 'VC-02', type: 'vc2', n: 1, Pch: 2, batterie: 'froide+elec', vanne: '3v', Pfr: 2.5, Pvent: 40, Pbe: 1.5, alim: 'elec' }] });
  const [a, b] = r.valeurs.lignes;
  assert.strictEqual(a.nbV, 2);
  assert.ok(Math.abs(a.qc - 3 / (1.163 * 5)) < 1e-9);
  assert.ok(a.kvs >= a.qf / Math.sqrt(0.15));
  assert.ok(Math.abs(a.P - 0.18) < 1e-9);
  assert.ok(Math.abs(b.P - 1.54) < 1e-9);
  assert.strictEqual(r.valeurs.tot.vannes, 7);
  assert.ok(r.alertes.some(x => /4 tubes/.test(x.texte)));
});

test('fiche technique d\'un terminal : puissances, ventilateur, batterie électrique, tension', () => {
  const r = T.lireFiche(['Cassette 4 voies modèle C4-35', 'Puissance frigorifique totale : 3,6 kW', 'Puissance calorifique : 4,1 kW', 'Puissance absorbée (PV / MV / GV) : 22 / 35 / 58 W',
    'Batterie électrique : 1,5 kW', 'Alimentation : 230 V / 1~ / 50 Hz', 'Débit d\'air : 450 / 560 / 680 m³/h']);
  assert.deepStrictEqual([r.valeurs.Pfr, r.valeurs.Pch, r.valeurs.Pvent, r.valeurs.Pbe, r.valeurs.tension, r.valeurs.Qair], [3.6, 4.1, 58, 1.5, 'mono', 680]);
});

test('bilan électrique : terminaux, CTA (fiche technique) repris avec leur alimentation, points automate par appareil', () => {
  const et = { notes: [
    { id: 'n1', type: 'terminaux', titre: 'Terminaux', entrees: N.TYPES.terminaux.champs.filter(c => c.k).reduce((o, c) => ({ ...o, [c.k]: c.d }), {}) },
    { id: 'n2', type: 'cta', titre: 'CTA bureaux', entrees: { ...N.TYPES.cta.champs.filter(c => c.k).reduce((o, c) => ({ ...o, [c.k]: c.d }), {}), alim: 'elec', PelBe: 6, fiche: { PelS: 1.8, PelR: 1.5, fabricant: 'Fab' } } },
    { id: 'n3', type: 'elec', titre: 'Électricité', entrees: { armoires: [{ rep: 'AR-CVC-01', local: 'Local CVC', L: 30, ks: 80, reserve: 20 }] } }] };
  et.notes[0].entrees.appareils = [app];
  const l = E.equipementsEtude(et, Liens);
  const ca = l.find(x => x.rep === 'CA-01'), vs = l.find(x => /^VS-/.test(x.rep)), be = l.find(x => /^BE-/.test(x.rep));
  assert.ok(ca && ca.alim === 'cvc' && ca.nb === 1 && ca.regulation === 'terminal');
  assert.deepStrictEqual(l.filter(x => /^CA-0/.test(x.rep)).map(x => x.rep), ['CA-01', 'CA-02', 'CA-03'], 'une ligne par appareil');
  assert.strictEqual(vs.P, 1.8); assert.strictEqual(vs.alim, 'elec');
  assert.ok(be && be.P === 6 && be.type === 'resistance');
  // Fusion : ligne ajoutée à la main gardée ; ligne d'un calcul supprimé retirée ; alimentation de l'appareil imposée
  const f = E.fusionner([{ rep: 'EXT-01', designation: 'Extracteur oublié', type: 'ventilateur', P: 0.4, alim: '' }, { src: 'zz:1', rep: 'OLD', P: 1 }], l, new Set(et.notes.map(x => x.id)));
  assert.ok(f.lignes.some(x => x.rep === 'EXT-01')); assert.ok(!f.lignes.some(x => x.rep === 'OLD')); assert.strictEqual(f.retirees, 1);
  const r = N.calculer('elec', { ...N.TYPES.elec.champs.filter(c => c.k).reduce((o, c) => ({ ...o, [c.k]: c.d }), {}), armoires: et.notes[2].entrees.armoires, equipements: f.lignes });
  const pts = r.tableaux ? null : null; // calcul effectué sans erreur
  assert.ok(r.valeurs.points >= 3 * 7, `points : ${r.valeurs.points}`);
  const af = JSON.stringify(r);
  assert.match(af, /CA-03/);
  assert.match(af, /deux vannes \(chaud et froid\)/);
  assert.match(af, /Extracteur oublié/);
});

test('une ligne par appareil, maître / esclave', () => {
  const x = T.eclater([{ rep: 'CA-07', local: 'Salle A', n: 3, type: 'cassette2' }, { rep: 'VC-01', type: 'vc2' }]);
  assert.strictEqual(x.nb, 1);
  assert.deepStrictEqual(x.lignes.map(l => [l.rep, l.local, l.n]), [['CA-07', 'Salle A', undefined], ['CA-08', 'Salle A', undefined], ['CA-09', 'Salle A', undefined], ['VC-01', undefined, undefined]]);
  const base = { type: 'cassette2', Pch: 3, Pfr: 3.5, batterie: '2t', vanne: '2v', Pvent: 50, alim: 'cvc' };
  const r = N.calculer('terminaux', { TcAller: 45, TcRetour: 40, TfAller: 7, TfRetour: 12, dpVanne: 15, appareils: [
    { ...base, rep: 'CA-01', local: 'Réunion', regul: 'maitre' }, { ...base, rep: 'CA-02', local: 'Réunion', regul: 'esclave', maitre: 'CA-01' }, { ...base, rep: 'CA-03', local: 'Bureau', regul: 'esclave', maitre: '' }] });
  const [m, e] = r.valeurs.lignes;
  assert.deepStrictEqual(m.esclaves, ['CA-02']);
  assert.ok(r.alertes.some(a => a.niveau === 'erreur' && /CA-03 : esclave sans maître/.test(a.texte)));
  const l = T.versElec({ id: 'n' }, r);
  assert.strictEqual(l.find(q => q.rep === 'CA-02').regulation, 'esclave');
  assert.match(l.find(q => q.rep === 'CA-01').afAuto, /maître de CA-02/);
  assert.match(l.find(q => q.rep === 'CA-02').afAuto, /esclave de CA-01/);
  assert.strictEqual(r.tableaux[0].entetes[1], 'Pièce');
});

test('réseau arborescent : branches reliées aux terminaux (débit au régime de la production, ΔP de la fiche + vanne)', () => {
  require('../etudes/public/js/equilibrage');
  const Eq = require('../etudes/public/js/equilibrage');
  const pid = { id: 'p1', type: 'pid', titre: 'Production', entrees: { ...N.defauts('pid'), reseau: 'ch-55-45' } };
  const term = { id: 't1', type: 'terminaux', titre: 'Terminaux', entrees: { ...N.defauts('terminaux'), prodChaud: 'p1', dpVanne: 12, appareils: [
    { rep: 'CA-01', local: 'Bureau 1', type: 'cassette2', Pch: 3, Pfr: 3.5, batterie: '2t', vanne: '2v', dpEauC: 18, dpEauF: 22, Pvent: 50 },
    { rep: 'CA-02', local: 'Bureau 2', type: 'cassette2', Pch: 2, Pfr: 2.5, batterie: '2t', vanne: '2v', Pvent: 50 }] } };
  const arbo = { id: 'a1', type: 'arbo', titre: 'Réseau', entrees: { ...N.defauts('arbo'), troncons: [{ rep: 'C', amont: '', nom: 'Collecteur', L: 10, zeta: 4 },
    { rep: 'B1', amont: 'C', L: 8, zeta: 5, emetteur: 't1:CA-01' }, { rep: 'B2', amont: 'C', L: 12, zeta: 5, emetteur: 't1:CA-02' }] } };
  const et = { notes: [pid, term, arbo] };
  assert.deepStrictEqual(Eq.emetteursEtude(et, 'chaud').map(x => x.cle), ['t1:CA-01', 't1:CA-02']);
  const rt = Liens.resoudre(et, term);
  assert.strictEqual(rt.entrees.TcAller, 55); assert.ok(rt.verrous.TcAller);
  const ra = Liens.resoudre(et, arbo), b1 = ra.entrees.troncons[1];
  assert.strictEqual(b1.P, 3); assert.strictEqual(b1.dpEm, 30); assert.ok(Math.abs(b1.Q - 3 / (1.163 * 10)) < 0.001);
  assert.ok(ra.verrous['troncons.1.Q'] && ra.verrous['troncons.2.dpEm']);
  assert.strictEqual(ra.entrees.troncons[2].dpEm, 12);
  const r = N.calculer('arbo', ra.entrees);
  assert.ok(Number.isFinite(r.valeurs.Qp || r.valeurs.Q || 0));
});
