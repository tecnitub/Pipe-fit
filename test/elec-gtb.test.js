// Armoires CVC : câbles (pose, ΔU cumulée), différentiels, harmoniques, bilan thermique, options par armoire ;
// GTB : décret BACS, table d'échange BACnet / Modbus, comptage par usage, essais point à point, séquences, folios.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta'); require('../etudes/public/js/equilibrage'); require('../etudes/public/js/industriel'); require('../etudes/public/js/aeraulique-schema');
const E = require('../etudes/public/js/electricite');
const G = require('../etudes/public/js/gtb');
const Liens = require('../etudes/public/js/liens');

const nombre = s => Number(String(s).replace(',', '.').replace(/[^\d.-]/g, ''));
const bloc = (r, onglet, re) => r.onglets.find(o => o.titre === onglet).blocs.find(b => re.test(b.titre || ''));
const base = (x = {}) => ({ ...N.defauts('elec'), options: E.OPTIONS_DEFAUT.filter(k => k !== 'comptageUsages'), ...x });

test('câbles : courant admissible corrigé (pose, groupement) et chute de tension cumulée TGBT → armoire → divisionnaire → départ', () => {
  const ent = base({ armoires: [{ rep: 'A1', local: 'Chaufferie', L: 60, ks: 100, reserve: 0 }, { rep: 'A2', local: 'Toiture', amont: 'A1', L: 90, ks: 100, reserve: 0 }],
    equipements: [{ rep: 'V1', type: 'ventilateur', P: 7.5, tension: 'tri', depart: 'variateur', L: 120, alim: 'A2' }, { rep: 'P1', type: 'pompe', P: 0.4, alim: 'A1', L: 10, pose: 'B2' }],
    pose: 'E', groupes: 6, duTgbt: 1 });
  const r = N.calculer('elec', ent), t = bloc(r, 'Bilan de puissance', /^Câbles/).tableau.lignes, ligne = rep => t.find(l => l[0] === rep);
  const [a1, a2, v1] = [ligne('Armoire A1'), ligne('Armoire A2'), ligne('V1')];
  // ΔU amont de chaque tronçon = ΔU cumulée du précédent ; la limite de 5 % est tenue jusqu'au ventilateur
  assert.strictEqual(nombre(a1[7]), 1); assert.strictEqual(a2[7], a1[9]); assert.strictEqual(v1[7], a2[9]);
  assert.ok(nombre(v1[9]) <= 5 + 1e-9 && v1[11] === 'Oui');
  // Groupement de 6 circuits sur chemin perforé : k = 0,73 ; Iz corrigé ≥ protection
  assert.strictEqual(a1[3], '0,73'); assert.ok(nombre(v1[5]) >= nombre(v1[4]));
  assert.strictEqual(ligne('P1')[2], 'B2', 'pose propre au départ');
  assert.ok(r.alertes.some(a => /V1 : section portée/.test(a.texte)), 'section relevée pour la chute de tension');
  // Poste privé : limite portée à 8 %
  const r8 = N.calculer('elec', { ...ent, origine: 'prive' });
  assert.match(bloc(r8, 'Bilan de puissance', /^Câbles/).tableau.lignes.find(l => l[0] === 'V1')[10], /8 %/);
});

test('différentiels : sélectivité verticale, type B après un variateur triphasé, TN-C signalé', () => {
  const ent = base({ armoires: [{ rep: 'A1', L: 20, regime: 'TT' }, { rep: 'A2', amont: 'A1', L: 30, regime: 'TT' }],
    equipements: [{ rep: 'V1', type: 'ventilateur', P: 4, tension: 'tri', depart: 'variateur', alim: 'A2' }, { rep: 'P1', type: 'pompe', P: 0.4, alim: 'A1' }] });
  const r = N.calculer('elec', ent), cc = n => bloc(r, 'Cahier des charges armoires', new RegExp(`^Protection différentielle .* armoire ${n} `)).tableau.lignes;
  assert.match(cc('A1')[0][1], /^1 A retardé/); assert.match(cc('A2')[0][1], /^300 mA sélectif \(S\) type B/);
  assert.deepStrictEqual(cc('A2').find(l => l[0] === 'V1').slice(0, 2), ['V1', '300 mA type B']);
  const tnc = N.calculer('elec', { ...ent, armoires: [{ rep: 'A1', L: 20, regime: 'TN-C' }] });
  assert.ok(tnc.alertes.some(a => /TN-C/.test(a.texte)));
});

test('harmoniques, neutre et bilan thermique de l\'enveloppe ; options propres à une armoire divisionnaire', () => {
  const ent = base({ armoires: [{ rep: 'A1', local: 'Chaufferie', L: 20 }, { rep: 'A2', amont: 'A1', L: 30, tLocal: 38, options: ['auArmoire', 'onduleur'] }],
    equipements: [{ rep: 'V1', type: 'ventilateur', P: 15, tension: 'tri', depart: 'variateur', alim: 'A2' }, { rep: 'V2', type: 'ventilateur', P: 11, tension: 'tri', depart: 'variateur', alim: 'A2' },
      ...[1, 2, 3, 4, 5, 6].map(i => ({ rep: `VC${i}`, type: 'ventilo', P: 0.3, tension: 'mono', alim: 'A1' }))] });
  const r = N.calculer('elec', ent), cdc = r.onglets.find(o => o.titre === 'Cahier des charges armoires').blocs;
  // A2 : 26 kW de variateurs → THDi 40 %, filtre actif ; selfs sur les variateurs ≥ 7,5 kW
  assert.ok(r.alertes.some(a => /A2 : THDi estimé 40 %/.test(a.texte)));
  // A1 : ventilo-convecteurs électroniques seuls → rang 3 au-delà de 33 %, neutre dimensionné
  const r3 = N.calculer("elec", { ...ent, armoires: [ent.armoires[0]], equipements: ent.equipements.filter(q => q.type === "ventilo") });
  assert.ok(r3.alertes.some(a => /A1 : taux d.harmonique 3/.test(a.texte)));
  // A2 : 26 kW de variateurs dissipent ≈ 780 W, local à 38 °C (ΔT 2 K) → climatiseur d'armoire
  const th = cdc.find(b => /Bilan thermique .* A2/.test(b.titre || '')).tableau.lignes;
  assert.strictEqual(th.find(l => /Variateurs/.test(l[0]))[1], '780');
  const nomA2 = cdc.find(b => /^Nomenclature .* A2/.test(b.titre)).tableau.lignes.map(l => l[1]);
  assert.ok(nomA2.some(x => /Climatiseur d'armoire/.test(x)) && nomA2.some(x => /Self de ligne/.test(x)));
  // Options de A2 : arrêt d'urgence et onduleur, sans prise ni parafoudre
  assert.ok(nomA2.some(x => /Onduleur/.test(x)) && !nomA2.some(x => /Prise de courant/.test(x)) && !nomA2.some(x => /Parafoudre/.test(x)));
  const nomA1 = cdc.find(b => /^Nomenclature .* A1/.test(b.titre)).tableau.lignes.map(l => l[1]);
  assert.ok(nomA1.some(x => /Prise de courant/.test(x)) && nomA1.some(x => /Parafoudre/.test(x)));
  // Une option « équipement » cochée sur la divisionnaire ajoute son repère suffixé
  const r2 = N.calculer('elec', { ...ent, armoires: [ent.armoires[0], { ...ent.armoires[1], options: ['compteurElec'] }] });
  assert.ok(r2.valeurs.listePoints.some(p => p[0] === 'CPT-E-A2' && p[3] === 'A2'));
});

test('décret BACS : assujettissement, classe NF EN ISO 52120-1, exigences', () => {
  const eqs = [{ type: 'generateur', regulation: 'mod' }, { type: 'pompe', depart: 'variateur', regulation: 'var' }, { type: 'cta', regulation: 'bus', designation: 'CTA avec sonde CO2' }, { type: 'ventilo', regulation: 'terminal' }];
  const ok = G.bacs({ P: 350, eqs, REG: { installations: [] }, opt: new Set(['comptageUsages']), gtb: 'BACnet/IP', pts: [] });
  assert.ok(ok.assujetti && /2025/.test(ok.echeance)); assert.strictEqual(ok.classe, 'A'); assert.ok(ok.conforme);
  const moyen = G.bacs({ P: 120, eqs: [{ type: 'generateur', regulation: 'tor' }, { type: 'pompe', regulation: 'aucune' }], REG: { installations: [] }, opt: new Set(), gtb: 'aucune', pts: [] });
  assert.ok(/2027/.test(moyen.echeance)); assert.strictEqual(moyen.classe, 'D'); assert.ok(!moyen.conforme);
  assert.ok(!G.bacs({ P: 50, eqs: [], REG: { installations: [] } }).assujetti);
  assert.ok(G.bacs({ P: 50, neuf: true, eqs: [], REG: { installations: [] } }).assujetti, 'bâtiment neuf : dès la livraison');
});

test('table d\'échange : objets BACnet, instances et registres Modbus par armoire, unités, alarmes ; CSV', () => {
  const pts = [['P1', 'Commande de marche — Pompe', 'STOR', 'A1', 'TC', '', 'P1 — Pompe', 'Commande de marche'], ['TD', 'Mesure — Sonde de départ', 'EA', 'A1', 'TM', '', 'TD — Sonde', 'Température de départ'],
    ['TR', 'Mesure — Sonde retour', 'EA', 'A1', 'TM', '', 'TR — Sonde', 'Température de retour'], ['AU', 'Alarme — Arrêt d\'urgence', 'ETOR', 'A1', 'TA', '', 'AU — Arrêt d\'urgence', 'Alarme / déclenchement'],
    ['V1', 'Consigne de vitesse', 'SA', 'A2', 'TR', '', 'V1 — Ventilateur', 'Consigne de vitesse']];
  const t = G.echange(pts, ['A1', 'A2']);
  assert.deepStrictEqual(t.map(l => [l[1], l[6], l[7], l[8], l[9]]), [['1001', 'BO', '1', 'Coil 0x0000', 'état'], ['1001', 'AI', '1', 'IR 3x0000', '°C'], ['1001', 'AI', '2', 'IR 3x0002', '°C'], ['1001', 'BI', '1', 'DI 1x0000', 'état'], ['1002', 'AO', '1', 'HR 4x0000', '%']]);
  assert.strictEqual(t[3][10], 'P1 (sécurité)'); assert.strictEqual(t[1][11], '15 min'); assert.strictEqual(t[0][12], 'CVC_P1_CMD'); assert.strictEqual(G.echange(pts, ['A1', 'A2'], [], { nommage: 'armoire' })[0][12], 'A1_P1_CMD');
  const csv = G.csv(G.ENTETES_ECHANGE, t).split('\r\n');
  assert.strictEqual(csv.length, 6); assert.match(csv[0], /^Armoire;Device BACnet;/);
});

test('étude complète : comptage par usage, séquences, essais point à point, onglet GTB, folios numérotés avec cartouche', () => {
  const pid = { id: 'p', type: 'pid', titre: 'Chaufferie', entrees: N.defauts('pid') };
  const eqs = E.fusionner([], E.equipementsEtude({ notes: [pid] }, Liens)).lignes;
  const et = { objet: 'Collège des Tilleuls', client: 'Département', indice: 'B', date: '2026-11-06', auteur: 'JB', notes: [pid, { id: 'e', type: 'elec', titre: 'Armoires', entrees: { ...N.defauts('elec'), equipements: eqs, gtb: 'BACnet/IP' } }] };
  const r = Liens.calculer(et, et.notes[1]);
  // Comptage par usage (coché par défaut) : compteur thermique chauffage, gaz (électrovanne), sous-compteurs électriques
  const pts = r.valeurs.listePoints;
  ['CET-CH', 'CPT-GAZ', 'CPT-E-PROD', 'CPT-E-AUX'].forEach(rep => assert.ok(pts.some(p => p[0] === rep), rep));
  assert.ok(pts.some(p => p[0] === 'CET-CH' && p[2] === 'Bus' && p[4] === 'TCP'), 'index d\'énergie en télécomptage');
  // BACS : puissance reprise du schéma de principe
  assert.ok(r.valeurs.bacs.P > 0 && ['A', 'B', 'C', 'D'].includes(r.valeurs.bacs.classe));
  const gtb = r.onglets.find(o => o.titre === 'GTB et BACS').blocs;
  const seq = gtb.find(b => /^Séquences — Chaufferie/.test(b.titre || '')).tableau.lignes;
  assert.deepStrictEqual(seq.map(l => l[0]), ['Démarrage', 'Marche normale', 'Arrêt', 'Défaut', 'Réarmement']);
  const ess = gtb.find(b => /^Essais point à point/.test(b.titre || '')).tableau.lignes;
  assert.ok(ess.length > 10 && ess.every(l => l[5] && l[7] === '☐'));
  assert.ok(r.valeurs.feuilles.some(f => f.name === 'Table d\'échange GTB') && /;Objet BACnet;/.test(r.valeurs.echangeCsv));
  // Folios : F01 unifilaire puis F02… ; cartouche (affaire, indice, date, n° / total, renvois)
  const n = r.schemas.length + 1;
  assert.match(r.titreSchema, /^F01 — /); assert.match(r.schemas[0].titre, /^F02 — /);
  assert.match(r.schema, /Collège des Tilleuls/); assert.match(r.schema, />06\/11\/2026</); assert.match(r.schema, new RegExp(`F01 / ${String(n).padStart(2, '0')}`));
  assert.match(r.schemas[0].svg, /Renvois : Armoire AR-CVC-01 : unifilaire F01, auxiliaires F02, commande F03/);
  // Fiche de mise en service du CRM : tests point à point avec l'essai à réaliser
  const PM = require('../etudes/public/js/points-mes');
  const f = PM.extraire({ ...et, notes: [et.notes[1]] }, n => Liens.calculer(et, n)).find(x => /Tests point à point GTB/.test(x.titre));
  assert.ok(f && f.controles.some(c => / : (Forcer|Comparer|Provoquer|Imposer|Lire)/.test(c)));
});
