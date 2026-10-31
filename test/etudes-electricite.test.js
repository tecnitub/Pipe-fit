// Alimentation électrique et régulation des équipements (application Études) : départs, armoires, demandes au lot
// électricité, points automate, analyse fonctionnelle, schéma unifilaire, reprise des équipements de l'étude.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta'); require('../etudes/public/js/equilibrage'); require('../etudes/public/js/industriel');
const E = require('../etudes/public/js/electricite');
const Liens = require('../etudes/public/js/liens');

const proche = (v, ref, tol, msg) => assert.ok(Math.abs(v - ref) <= tol, `${msg || ''} ${v} ≠ ${ref} ± ${tol}`);

test('départ : intensité, protection, courbe, section et chute de tension', () => {
  // Pompe 1,1 kW mono, cos φ 0,85 : Ib = 1100 / (230 × 0,85) = 5,63 A ; démarrage direct → ≥ 1,25 Ib = 7,0 A → 10 A courbe D
  const p = E.depart({ P: 1.1, tension: 'mono', moteur: true, depart: 'direct', L: 20 });
  proche(p.Ib, 5.63, 0.01); assert.deepStrictEqual([p.cal, p.courbe, p.cable], [10, 'D', '3G1,5']);
  // Moteur 15 kW tri sur variateur, cos φ 0,85 : Ib = 15000 / (√3 × 400 × 0,85) = 25,5 A → 32 A courbe C, 6 mm²
  const v = E.depart({ P: 15, tension: 'tri', moteur: true, depart: 'variateur', L: 30 });
  proche(v.Ib, 25.47, 0.02); assert.deepStrictEqual([v.cal, v.courbe, v.cable], [32, 'C', '4G6']);
  // Résistance 9 kW tri à 120 m : section augmentée pour rester sous 3 % de chute de tension
  const r = E.depart({ P: 9, tension: 'tri', moteur: false, depart: 'contacteur', L: 120 });
  assert.ok(r.du <= 3 && r.S > 2.5, `section ${r.S}, ΔU ${r.du}`);
});

test('armoire CVC : phases équilibrées, foisonnement, réserve, demandes au lot électricité, points et analyse fonctionnelle', () => {
  const r = N.calculer('elec', {
    armoires: [{ rep: 'AR1', local: 'Chaufferie', L: 25, ks: 80, reserve: 20 }],
    equipements: [
      { rep: 'P1', designation: 'Pompe radiateurs', type: 'pompe', P: 0.5, alim: 'AR1', regulation: 'tor' },
      { rep: 'P2', designation: 'Pompe plancher', type: 'pompe', P: 0.5, alim: 'AR1', regulation: 'torRetour' },
      { rep: 'P3', designation: 'Pompe ECS', type: 'pompe', P: 0.5, alim: 'AR1' },
      { rep: 'V1', designation: 'Vanne radiateurs', type: 'vanne', alim: 'AR1', regulation: 'v3p' },
      { rep: 'PAC1', designation: 'PAC', type: 'pac', P: 30, alim: 'elec', pilote: 'AR1', fonctionnement: 'Relève de la chaudière sous -5 °C' },
      { rep: 'VC', designation: 'Ventilo bureaux', type: 'ventilo', P: 0.8, alim: 'elec', pilote: 'autonome' },
    ],
    lotElec: 'Lot 13 Électricité', gtb: 'BACnet/IP',
  });
  const v = r.valeurs, a = v.armoires[0];
  proche(v.Ptot, 32.6, 0.001, 'équipements + 0,3 kW de commande de l\'armoire'); proche(v.Pelec, 30.8, 0.001);
  proche(a.P, 1.8, 0.001, 'trois pompes + 0,3 kW de commande');
  // Une pompe par phase : 0,5 / (230 × 0,85) = 2,56 A, + commande 1,3 A sur une phase ; × 0,8 × 1,2
  proche(a.Ib, (2.557 + 1.304) * 0.8 * 1.2, 0.05); assert.strictEqual(a.cal, 4);
  const eq = r.tableaux[0].lignes;
  assert.deepStrictEqual(eq.map(l => l[4]), ['Armoire AR1 (L1)', 'Armoire AR1 (L2)', 'Armoire AR1 (L3)', 'Armoire AR1', 'Attente Lot 13 Électricité', 'Attente Lot 13 Électricité']);
  const dem = r.tableaux[2];
  assert.strictEqual(dem.titre, 'Demandes au Lot 13 Électricité');
  assert.deepStrictEqual(dem.lignes.map(l => l[0]), ['Armoire AR1', 'PAC1 — PAC', 'VC — Ventilo bureaux']);
  assert.match(dem.lignes[1][7], /liaisons de commande et de défaut vers l'armoire AR1/);
  assert.match(dem.lignes[1][5], /^80 A courbe D$/); // 30 kW tri : 50,9 A × 1,25 = 63,7 A → 80 A
  // Points : P1 tor (2), P2 tor + retour (3), P3 tor par défaut (2), V1 3 points (2), PAC bus (1) ; ventilo autonome hors armoire
  const reg = r.onglets.find(o => o.titre === 'Régulation');
  const pts = reg.blocs[1].tableau.lignes;
  assert.strictEqual(pts.filter(p => p[3] === 'AR1').length, 10);
  assert.ok(pts.some(p => p[0] === 'VC' && p[3] === 'autonome'));
  const io = reg.blocs[2].tableau.lignes[0];
  assert.deepStrictEqual(io.slice(0, 6), ['AR1', '0', '0', '4', '5', '1']); // EA, SA, ETOR, STOR, Bus
  assert.ok(reg.blocs[0].liste.some(t => /PAC1 — PAC : piloté par bus.*Relève de la chaudière sous -5 °C.*AR1/.test(t)));
  assert.ok(reg.blocs[0].liste.some(t => /BACnet\/IP/.test(t)));
  // Cahier des charges et schéma unifilaire
  const cc = r.onglets.find(o => o.titre === 'Cahier des charges armoires');
  assert.ok(cc.blocs.some(b => b.titre === 'Départs de l\'armoire AR1' && b.tableau.lignes.length === 4));
  assert.match(r.schema, /^<svg/); assert.match(r.schema, /QG 4 A/); assert.match(r.schema, />P1</); assert.match(r.schema, /Automate/);
  assert.strictEqual(r.titreSchema, 'Schéma unifilaire des armoires CVC');
});

test('alertes : armoire inconnue, puissance manquante, 24 V hors armoire, phases déséquilibrées', () => {
  const r = N.calculer('elec', { armoires: [{ rep: 'AR1' }], equipements: [
    { rep: 'X', type: 'pompe', P: '', alim: 'AR9' }, { rep: 'S1', type: 'sonde', alim: 'elec' },
    { rep: 'R1', type: 'resistance', P: 6, tension: 'mono', alim: 'AR1' }, { rep: 'R2', type: 'resistance', P: 0.2, tension: 'mono', alim: 'AR1' }] });
  const t = r.alertes.map(a => a.texte).join(' | ');
  assert.match(t, /AR9.*inconnue/); assert.match(t, /X : puissance électrique à renseigner/); assert.match(t, /S1 : un équipement en 24 V/); assert.match(t, /déséquilibrées/);
});

test('reprise des équipements d\'une étude : schéma de principe, réseau, CTA ; les choix déjà faits sont gardés', () => {
  const pid = { id: 'n1', type: 'pid', titre: 'Chaufferie', entrees: N.defauts('pid') };
  const cta = { id: 'n2', type: 'cta', titre: 'CTA bureaux', entrees: N.defauts('cta') };
  const etude = { notes: [pid, cta, { id: 'n3', type: 'elec', entrees: N.defauts('elec') }] };
  const l = E.equipementsEtude(etude, Liens);
  const reps = l.map(x => x.rep);
  assert.ok(reps.includes('G1') && reps.includes('PC1') && reps.includes('V1') && reps.includes('TE'), reps.join(','));
  assert.ok(l.some(x => x.type === 'ventilateur' && /soufflage/.test(x.designation) && x.depart === 'variateur'));
  assert.ok(l.filter(x => x.type === 'pompe').every(x => x.P > 0));
  // Fusion : alimentation et régulation choisies conservées, puissance mise à jour
  const premiere = E.fusionner([], l);
  assert.strictEqual(premiere.ajoutees, l.length);
  const pc1 = premiere.lignes.find(x => x.rep === 'PC1');
  Object.assign(pc1, { alim: 'elec', regulation: 'var', P: 9 });
  const deux = E.fusionner(premiere.lignes, l);
  assert.deepStrictEqual([deux.ajoutees, deux.majs], [0, 1]);
  const pc1b = deux.lignes.find(x => x.rep === 'PC1');
  assert.deepStrictEqual([pc1b.alim, pc1b.regulation], ['elec', 'var']);
  assert.notStrictEqual(pc1b.P, 9);
  // Le calcul accepte les lignes reprises telles quelles
  const r = N.calculer('elec', { ...N.defauts('elec'), equipements: deux.lignes });
  assert.ok(!r.alertes.some(a => a.niveau === 'erreur'), r.alertes.map(a => a.texte).join(' | '));
});
