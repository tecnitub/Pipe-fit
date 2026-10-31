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

test('CTA reliée au réseau aéraulique : composants vers le réseau, débits et pertes de charge vers la CTA', () => {
  const cta = { id: 'c', type: 'cta', titre: 'CTA bureaux', entrees: { ...N.defauts('cta'), froid: 'non', recup: 'roue', dpRecup: 130 } };
  const aero = { id: 'a', type: 'aero', titre: 'Réseau aéraulique', entrees: { ...N.defauts('aero'), cta: 'c', batFroide: 'oui', recuperateur: 'plaques' } };
  const et = { notes: [cta, aero] };
  const ra = Liens.resoudre(et, aero);
  assert.deepStrictEqual([ra.entrees.producteur, ra.entrees.recuperateur, ra.entrees.batFroide, ra.entrees.dpRecup], ['cta-df', 'roue', 'non', 130]);
  assert.strictEqual(ra.verrous.dpFiltreS, 'N1 — CTA bureaux');
  const rc = Liens.resoudre(et, cta), va = N.calculer('aero', ra.entrees).valeurs;
  assert.deepStrictEqual([rc.entrees.Qs, rc.entrees.Qr], [3000, 2900], 'débits des bouches');
  assert.strictEqual(rc.entrees.dpReseauS, Math.round(va.dpReseauS));
  assert.ok(rc.verrous.Qs && rc.verrous.dpReseauR);
  // Même pression au ventilateur de soufflage des deux côtés, à la marge du réseau près
  const vc = Liens.calculer(et, cta).valeurs;
  assert.ok(Math.abs(va.pS - vc.dpS * 1.1) < 2, `${va.pS} ≠ ${vc.dpS} × 1,1`);
  // Une seule CTA au métré et à l'alimentation électrique
  assert.strictEqual(Me.metre(et).filter(p => /Centrale de traitement/.test(p.designation)).length, 1);
  assert.strictEqual(E.equipementsEtude(et, Liens).filter(x => x.type === 'ventilateur').length, 2);
  // Détacher la CTA : valeurs conservées, réseau délié
  Liens.detacher(et, cta);
  assert.strictEqual(cta.entrees.Qs, 3000); assert.strictEqual(aero.entrees.cta, '');
  assert.strictEqual(Liens.resoudre(et, cta).source, null);
});

test('réseau et ventilateur relié à la CTA : pertes de charge de la centrale ajoutées, débit renvoyé', () => {
  const cta = { id: 'c', type: 'cta', titre: 'CTA', entrees: N.defauts('cta') };
  const s = { id: 's', type: 'aeraulique', titre: 'Soufflage', entrees: { ...N.defauts('aeraulique'), cta: 'c', ctaFlux: 'soufflage' } };
  const r = { id: 'r', type: 'aeraulique', titre: 'Reprise', entrees: { ...N.defauts('aeraulique'), cta: 'c', ctaFlux: 'reprise', composants: [{ nom: 'Grille de reprise', dp: 25 }] } };
  const et = { notes: [cta, s, r] }, c = N.defauts('cta');
  const rs = Liens.resoudre(et, s);
  assert.strictEqual(rs.entrees.dpCta, c.dpFiltreAN + c.dpRecup + c.dpBC + c.dpBF + c.dpDivers);
  assert.ok(rs.alertes.some(a => /déjà comptés dans la CTA/.test(a.texte)), 'filtre et batteries en double signalés');
  assert.ok(!Liens.resoudre(et, r).alertes.length);
  const vs = Liens.calculer(et, s).valeurs, vr = Liens.calculer(et, r).valeurs, ec = Liens.resoudre(et, cta).entrees;
  assert.strictEqual(ec.Qs, 6000); assert.strictEqual(ec.Qr, 6000);
  assert.strictEqual(ec.dpReseauS, Math.round(vs.dpTotal - rs.entrees.dpCta));
  assert.strictEqual(ec.dpReseauR, Math.round(vr.dpReseau + 25));
  assert.ok(!E.equipementsEtude(et, Liens).some(x => /^V-N/.test(x.rep)), 'ventilateurs comptés par la CTA');
});

test('chaufferie / sous-station reliée aux réseaux annexes : régime vers le réseau, puissance et pertes de charge vers le circuit', () => {
  require('../etudes/public/js/equilibrage');
  const pid = { id: 'p', type: 'pid', titre: 'Sous-station', entrees: N.defauts('pid') };
  pid.entrees.circuits[0].annexe = 'a'; pid.entrees.circuits[1].annexe = 'c'; pid.entrees.circuits[2].annexe = 'r';
  const arbo = { id: 'a', type: 'arbo', titre: 'Réseau bâtiment A', entrees: { ...N.defauts('arbo'), dT: 15 } };
  const cta = { id: 'c', type: 'cta', titre: 'CTA atelier', entrees: N.defauts('cta') };
  const res = { id: 'r', type: 'reseau', titre: 'Réseau plancher', entrees: N.defauts('reseau') };
  const et = { notes: [pid, arbo, cta, res] };
  const rp = Liens.resoudre(et, pid), c = rp.entrees.circuits;
  // Réseau arborescent : puissance des émetteurs, pertes de charge au régime du circuit (70/50 : ΔT 20 K)
  const ra = Liens.resoudre(et, arbo), va = N.calculer('arbo', ra.entrees).valeurs;
  assert.deepStrictEqual([ra.entrees.T, ra.entrees.dT, ra.entrees.serie], [60, 20, pid.entrees.serie]);
  assert.strictEqual(c[0].P, Math.round(va.Ptot * 10) / 10);
  assert.ok(Math.abs(c[0].dpAnnexe - va.Hres / 1000) < 0.06, `${c[0].dpAnnexe} ≠ ${va.Hres / 1000}`);
  assert.strictEqual(c[0].L, 0); assert.ok(rp.verrous['circuits.0.P'] && rp.verrous['circuits.0.L']);
  const vp = Liens.calculer(et, pid).valeurs;
  assert.ok(Math.abs(vp.circuits[0].Q - va.Qp) < 0.01, 'même débit des deux côtés');
  // Le côté production renvoyé au réseau : sa pompe a la même HMT que celle du circuit, à la marge près
  const dpProd = ra.entrees.dpGen;
  assert.ok(Math.abs((va.Hres / 1000 + dpProd) - vp.circuits[0].hmt * 9.81 * 0.983) < 1.5);
  // CTA : puissance de la batterie chaude vers le circuit, régime du circuit vers la CTA
  const vc = Liens.calculer(et, cta).valeurs;
  assert.strictEqual(c[1].P, Math.round(vc.Pchaud * 10) / 10);
  assert.deepStrictEqual([Liens.resoudre(et, cta).entrees.TcAller, Liens.resoudre(et, cta).entrees.TcRetour], [70, 50]);
  // Réseau et pompe : son débit donne la puissance du circuit (même débit), ses équipements de production signalés
  const rr = Liens.calculer(et, res);
  assert.ok(Math.abs(vp.circuits[2].Q - rr.valeurs.Qpompe) < 0.05);
  assert.ok(rr.alertes.some(a => /Déjà comptés par le circuit/.test(a.texte)));
  assert.match(Liens.description(et, arbo), /circuit « Radiateurs bureaux »/);
  // Une seule pompe par circuit (métré, électricité) ; pas de réseau créé en double depuis le schéma
  assert.ok(!E.equipementsEtude(et, Liens).some(x => /^P-N/.test(x.rep)));
  assert.ok(!Liens.notesDepuisSchema(et, pid, () => 'x').some(n => n.type === 'reseau' && /Radiateurs|CTA atelier|Plancher/.test(n.titre)));
  // Détacher le réseau : le circuit garde puissance et pertes de charge, sans lien
  Liens.detacher(et, arbo);
  assert.strictEqual(pid.entrees.circuits[0].annexe, ''); assert.strictEqual(pid.entrees.circuits[0].P, c[0].P);
  assert.strictEqual(Liens.circuitDeAnnexe(et.notes, arbo), null);
});

test('débits théoriques bouche par bouche (relevé d\'équilibrage) et type de PV de mise en service', () => {
  const v = N.calculer('aero', N.defauts('aero')).valeurs;
  const z1 = v.debits.filter(d => d.local === 'Bureaux R+1');
  assert.strictEqual(z1.length, 8); assert.ok(z1.every(d => d.theorique === 200 && d.type === 'Soufflage'));
  assert.strictEqual(v.debits.reduce((s, d) => s + d.theorique, 0), v.Qs + v.Qr);
  const M = require('../public/js/materiel-retenu');
  assert.deepStrictEqual(['aero|cta-df|3000', 'aero|extraction|900', 'gen|chaudiere-cond|150', 'gen|pac-air|80', 'pompe|x', 'vanne|2v|25|10'].map(M.typeMes), ['cta', 'vmc', 'chaudiere', 'pac', 'pompes', 'autre']);
});
