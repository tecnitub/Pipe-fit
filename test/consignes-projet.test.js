const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../etudes/public/js/consignes-projet');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta'); require('../etudes/public/js/equilibrage'); require('../etudes/public/js/industriel'); require('../etudes/public/js/aeraulique-schema');
const E = require('../etudes/public/js/electricite');
const Liens = require('../etudes/public/js/liens');

const inst = [
  { noteId: 'p', titre: 'Chaufferie', app: 'production', donnees: { Tbase: -7, Td: 45, Tr: 40, chaud: true, changeOver: true, froid: { Td: 7, Tr: 12 }, generateurs: 2,
    circuits: [{ rep: 'Radiateurs', emetteur: 'radiateurs', dep: 45, ret: 40, loi: true, d18: 30 }, { rep: 'Plancher', emetteur: 'plancher', dep: 40, ret: 35, loi: true, d18: 25 }, { rep: 'Ballon ECS', emetteur: 'ecs', dep: 70, ret: 50, loi: false, d18: null }] } },
  { noteId: 'c', titre: 'CTA salle', app: 'ventilation', donnees: { cta: true, TsH: 20, TsE: 16, froid: 'co', changeOver: true } },
  { noteId: 'e', titre: 'ECS', app: 'chauffage', donnees: { ecs: true, Tc: 60 } },
  { noteId: 't', titre: 'Cassettes', app: 'terminaux', donnees: { terminaux: 2, froid: true, changeOver: true, zones: ['Salle'] } }];

test('consignes du projet : production, seuils, change-over, relance, plannings, fériés, PID, pressions, vitesses, cohérence', () => {
  const r = C.calculer({ installations: inst, annee: 2026,
    zones: [{ zone: 'Salle', confort: 21, clim: 24, inocc: 17, horsGel: 8, jours: 'lun-ven', debut: '8:00', fin: '18:30', diff: 0.5, decalage: 2, emetteur: 'cassette' }],
    lois: [{ circuit: 'plancher', base: 38, d18: '' }], pressions: [{ cta: 'salle', soufflage: 180, reprise: 150, source: 'PV MS-0012' }],
    eqs: [{ rep: 'V1', designation: 'Vanne de régulation Radiateurs', regulation: 'v3p', course: 90 }, { rep: 'V9', designation: 'Vanne échangeur ECS', regulation: 'v010' }, { rep: 'VS', designation: 'Ventilateur soufflage', type: 'ventilateur', depart: 'variateur' }, { rep: 'TD1', type: 'sonde', regulation: 'sonde', designation: 'Sonde de départ Radiateurs' }] });
  // 1. Saisie : la loi d'eau imposée remplace celle de l'étude
  assert.deepStrictEqual(r.circuits.find(c => c.rep === 'Plancher').base, 38); assert.strictEqual(r.circuits.find(c => c.rep === 'Plancher').source, 'saisie');
  assert.ok(r.saisie.some(l => l[0] === 'Zone' && l[1] === 'Salle' && /8 h – 18 h30/.test(l[3])));
  // 2. Production : plus haute demande (45) + 5, plafonnée à 45 ; priorité ECS 70 °C
  assert.deepStrictEqual([r.production.consigneBase, r.production.ecsMin], [45, 70]);
  // 3. Seuils
  assert.deepStrictEqual(r.seuils.find(s => s.cible === 'circuit' && s.circuit === 'Radiateurs'), { cible: 'circuit', circuit: 'Radiateurs', libelle: 'Départ Radiateurs trop bas / trop haut', bas: 20, haut: 50, tempo: '30 min', prio: 'P2 (défaut)' });
  assert.deepStrictEqual([r.seuils.find(s => s.cible === 'ambiance').bas, r.seuils.find(s => s.cible === 'ambiance').haut], [17, 26]);
  assert.strictEqual(r.seuils.find(s => s.cible === 'ecs').bas, 55);
  // 4. Change-over : 45/40 → 30 °C ; 7/12 → 18 °C
  assert.deepStrictEqual([r.changeOver.chaud, r.changeOver.froid], [30, 18]);
  // 5. Réduit, relance
  const z = r.regimes.find(x => x.quoi === 'Zone Salle'); assert.deepStrictEqual([z.reduit, z.relance], [4, 0.5]);
  assert.strictEqual(r.regimes.find(x => x.quoi === 'Circuit Plancher').relance, 3);
  assert.ok(!r.regimes.some(x => /Ballon ECS/.test(x.quoi)));
  // 6. Plannings et jours fériés 2026 (Pâques le 5 avril)
  assert.ok(r.plannings.some(p => p.agit === 'Circuit Plancher' && /5 h – 18 h30/.test(p.occupation)));
  assert.deepStrictEqual(r.feries.find(f => f[1] === 'Lundi de Pâques')[0], '2026-04-06'); assert.deepStrictEqual(r.feries.find(f => f[1] === 'Ascension')[0], '2026-05-14');
  // 7. PID selon l'organe, temps de course de la fiche
  assert.deepStrictEqual(r.pid.find(x => x[0] === 'V1').slice(2), ['Vanne de circuit (température de départ)', '20 K', '240 s', '90 s']);
  assert.deepStrictEqual(r.pid.find(x => x[0] === 'V9').slice(2, 5), ['Échangeur ECS', '15 K', '120 s']);
  assert.deepStrictEqual(r.pid.find(x => x[0] === 'VS').slice(2, 5), ['Ventilateur (pression de gaine)', '100 Pa', '60 s']);
  // 8. Pressions des CTA
  assert.deepStrictEqual(r.pressionsCta, [{ cta: 'CTA salle', soufflage: 180, reprise: 150, source: 'PV MS-0012' }]);
  // 9. Vitesses
  assert.deepStrictEqual(r.vitesses[0], { zone: 'Salle', chaud: 21, froid: 24, decalage: 2, ouverture: 0.5, pv: 1, mv: 2 });
  // 10. Cohérence
  assert.deepStrictEqual(r.alertes.filter(a => a.niveau === 'attention').map(a => a.texte), ['Priorité ECS : 70 °C demandés, au-dessus du départ de la production (45 °C).', 'Zone Salle : climatisation à 24 °C ; le code de l\'énergie (art. R.241-30) interdit de refroidir en dessous de 26 °C (hors locaux à exigences particulières).']);
  const k = C.calculer({ installations: inst, zones: [{ zone: 'Hall', confort: 22, clim: 21, inocc: 23, horsGel: 8 }], lois: [{ circuit: 'Plancher', base: 55 }] });
  const t = k.alertes.map(a => a.texte).join(' ');
  assert.match(t, /rafraîchissement .* ≤ consigne de chauffage/); assert.match(t, /inoccupation ≥ consigne de confort/); assert.match(t, /plancher Plancher : départ 55 °C > 50 °C/); assert.match(t, /au-dessus du départ de la production/);
  // Réglages des points : seuils sur la sonde de départ du circuit
  assert.deepStrictEqual(C.reglagesPoints(r, [{ rep: 'TD1', type: 'sonde', designation: 'Sonde de départ Radiateurs' }]), [{ rep: 'TD1', libelle: '', bas: 20, haut: 50, priorite: 'P2 (défaut)' }]);
});

test('étude complète : consignes saisies une fois, reprises dans la table d\'échange, les alertes et le cahier', () => {
  const pid = { id: 'p', type: 'pid', titre: 'Chaufferie', entrees: N.defauts('pid') };
  const eqs = E.fusionner([], E.equipementsEtude({ notes: [pid] }, Liens)).lignes;
  const et = { objet: 'Collège', date: '2026-11-06', notes: [pid, { id: 'e', type: 'elec', titre: 'Armoires', entrees: { ...N.defauts('elec'), equipements: eqs, marqueAutomate: 'wit',
    consignesZones: [{ zone: 'Toutes zones', confort: 19, clim: 26, inocc: 15, horsGel: 7, jours: 'lun-sam', debut: '6:30', fin: '20:00' }], loisEau: [{ circuit: 'Radiateurs bureaux', base: 65, d18: 28 }] } }] };
  const r = Liens.calculer(et, et.notes[1]), pj = r.valeurs.consignesProjet;
  assert.strictEqual(pj.circuits.find(c => c.rep === 'Radiateurs bureaux').base, 65);
  // Loi d'eau imposée reprise dans les paramètres et la boucle
  const c = r.valeurs.cahierProg[0], s = re => c.sections.find(x => re.test(x.titre));
  assert.match(s(/^Boucles/).lignes.find(l => l[0] === 'R-V1')[4], /extérieur 65 °C/);
  assert.ok(s(/^Consignes du projet/).lignes.some(l => l[1] === 'Radiateurs bureaux' && l[4] === 'saisie'));
  assert.ok(s(/^Plannings/).lignes.some(l => l[1] === 'Zone Toutes zones' && l[2] === 'lun-sam 6 h30 – 20 h'));
  assert.match(s(/^Plannings/).intro, /Jours fériés 2026/);
  assert.ok(s(/^Réglages déduits/).lignes.some(l => /Seuil d'alarme — Départ Radiateurs bureaux/.test(l[0]) && /< 18 °C ou > 75 °C/.test(l[1])));
  // Seuils déduits dans la table d'échange (sonde de départ du circuit)
  const ech = r.valeurs.feuilles.find(x => /^Table/.test(x.name)).lignes.find(l => l[2] === 'TD1');
  assert.deepStrictEqual([ech[13], ech[14]], ['18', '75']);
  assert.ok(s(/^Alarmes$/).lignes.some(l => /^ALM_AMB_/.test(l[0]) && /< 15 °C ou > 28 °C/.test(l[2])));
});

test('pressions des CTA reprises des PV de mise en service (la plus récente par CTA)', () => {
  const Es = require('../public/js/essais');
  const l = Es.pressionsCta([
    { equipement: 'CTA salle', numero: 'MS-0003', date: '2026-10-01', mesures: [{ libelle: 'Pression de soufflage', valeur: '170' }, { libelle: 'Pression d\'extraction', valeur: '' }] },
    { equipement: 'CTA salle', numero: 'MS-0009', date: '2026-10-20', mesures: [{ libelle: 'Pression de soufflage', valeur: '185' }, { libelle: 'Pression d\'extraction', valeur: '140,5' }] },
    { equipement: 'Pompe P1', numero: 'MS-0004', date: '2026-10-02', mesures: [{ libelle: 'HMT mesurée', valeur: '8' }] }]);
  assert.deepStrictEqual(l, [{ cta: 'CTA salle', soufflage: 185, reprise: 140.5, source: 'PV MS-0009 du 2026-10-20' }]);
});
