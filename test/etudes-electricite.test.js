// Alimentation électrique et régulation des équipements (application Études) : départs, armoires, demandes au lot
// électricité, points automate, analyse fonctionnelle, schéma unifilaire, reprise des équipements de l'étude.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta'); require('../etudes/public/js/equilibrage'); require('../etudes/public/js/industriel'); require('../etudes/public/js/aeraulique-schema');
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
    lotElec: 'Lot 13 Électricité', gtb: 'BACnet/IP', options: E.OPTIONS_DEFAUT.filter(k => k !== 'comptageUsages'),
  });
  const v = r.valeurs, a = v.armoires[0];
  proche(v.Ptot, 32.6, 0.001, 'équipements + 0,3 kW de commande de l\'armoire'); proche(v.Pelec, 30.8, 0.001);
  proche(a.P, 1.8, 0.001, 'trois pompes + 0,3 kW de commande');
  // Une pompe par phase : 0,5 / (230 × 0,85) = 2,56 A, + commande 1,3 A sur une phase ; × 0,8 × 1,2
  proche(a.Ib, (2.557 + 1.304) * 0.8 * 1.2, 0.05);
  // 4 A suffiraient, mais sélectivité avec les départs de 4 A (rapport 1,6) : 10 A en tête
  assert.strictEqual(a.cal, 10); assert.ok(r.alertes.some(x => /sélectivité ampèremétrique non assurée.*portée à 10 A/.test(x.texte)));
  const eq = r.tableaux[0].lignes;
  assert.deepStrictEqual(eq.map(l => l[4]), ['Armoire AR1 (L1)', 'Armoire AR1 (L2)', 'Armoire AR1 (L3)', 'Armoire AR1', 'Attente Lot 13 Électricité', 'Attente Lot 13 Électricité']);
  const dem = r.tableaux[2];
  assert.strictEqual(dem.titre, 'Demandes au Lot 13 Électricité');
  assert.deepStrictEqual(dem.lignes.map(l => l[0]), ['Armoire AR1', 'PAC1 — PAC', 'VC — Ventilo bureaux']);
  assert.match(dem.lignes[1][7], /liaisons de commande et de défaut vers l'armoire AR1/);
  assert.match(dem.lignes[1][5], /^80 A courbe D$/); // 30 kW tri : 50,9 A × 1,25 = 63,7 A → 80 A
  // Points : P1 tor (2), P2 tor + retour (3), P3 tor par défaut (2), V1 3 points (2), PAC communicante (9 points par bus),
  // 3 points logiciels de l'armoire ; ventilo autonome hors armoire
  const reg = r.onglets.find(o => o.titre === 'Régulation');
  const pts = r.valeurs.listePoints;
  assert.strictEqual(pts.filter(p => p[3] === 'AR1' && p[2] !== 'LOG').length, 18);
  assert.strictEqual(pts.filter(p => p[3] === 'AR1' && p[2] === 'LOG').length, 3);
  assert.ok(pts.some(p => p[0] === 'VC' && p[3] === 'autonome'));
  const bloc = d => reg.blocs.find(b => d.test(b.titre || ''));
  const io = bloc(/^Entrées \/ sorties par armoire/).tableau.lignes[0];
  assert.deepStrictEqual(io.slice(0, 6), ['AR1', '0', '0', '4', '5', '9']); // EA, SA, ETOR, STOR, Bus
  // Liste de points au format GTB : classes TA / TS / TM / TC / TR, point communiqué, totaux
  const gtb = bloc(/^Liste des points GTB/).tableau;
  assert.deepStrictEqual(gtb.entetes.slice(2, 10), ['TA', 'TS', 'TCP', 'TM', 'TC', 'TR', 'COM (bus)', 'LOG']);
  assert.ok(gtb.lignes.some(l => l[0] === 'Armoire AR1'));
  const tDep = gtb.lignes.find(l => l[1] === 'Température de départ');
  assert.ok(tDep && tDep[5] === 'x' && tDep[8] === 'Modbus RTU', JSON.stringify(tDep));
  assert.ok(gtb.lignes.some(l => /^Défaut/.test(l[1]) && l[2] === 'x'));
  assert.strictEqual(gtb.lignes[gtb.lignes.length - 1][0], 'Totaux');
  assert.ok(bloc(/^(Analyse fonctionnelle|Fonctionnement de chaque)/).liste.some(t => /PAC1 — PAC : piloté par bus.*Relève de la chaudière sous -5 °C.*AR1/.test(t)));
  assert.ok(bloc(/^(Analyse fonctionnelle|Fonctionnement de chaque)/).liste.some(t => /BACnet\/IP/.test(t)));
  // Cahier des charges et schéma unifilaire
  const cc = r.onglets.find(o => o.titre === 'Cahier des charges armoires');
  assert.ok(cc.blocs.some(b => b.titre === 'Départs de l\'armoire AR1' && b.tableau.lignes.length === 4));
  assert.match(r.schema, /^<svg/); assert.match(r.schema, /QG 10 A/); assert.match(r.schema, />P1</); assert.match(r.schema, /Automate/);
  assert.strictEqual(r.titreSchema.replace(/^F\d+ — /, ""), 'Schéma unifilaire des armoires CVC');
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

test('chaufferie : sécurités reprises, bilan de puissance au TGBT, plan d\'adressage, nomenclature, classeur', () => {
  const pid = { id: 'p', type: 'pid', titre: 'Chaufferie', entrees: { ...N.defauts('pid'), compteurs: 'oui' } };
  const eqs = E.fusionner([], E.equipementsEtude({ notes: [pid] }, Liens)).lignes, reps = eqs.map(q => q.rep);
  ['TE', 'TDG', 'PR', 'PMQ', 'AU', 'DG', 'EVG', 'CE1'].forEach(r => assert.ok(reps.includes(r), r));
  const r = N.calculer('elec', { ...N.defauts('elec'), equipements: eqs, ksTgbt: 90 });
  const ar = r.valeurs.armoires[0];
  // Points : électrovanne gaz (commande + fin de course), sécurités en ETOR, compteurs par impulsions
  const pts = r.valeurs.listePoints;
  assert.ok(pts.some(p => p[0] === 'EVG' && p[2] === 'STOR') && pts.some(p => p[0] === 'EVG' && p[2] === 'ETOR'));
  assert.ok(['AU', 'DG', 'PMQ', 'CE1'].every(x => pts.some(p => p[0] === x && p[2] === 'ETOR')));
  // Cartes avec 20 % de réserve, adresses uniques et bornes X2 deux par deux
  const n = t => pts.filter(p => p[2] === t).length;
  Object.entries(E.CARTES).forEach(([t, [cap]]) => assert.strictEqual(ar.cartes[t], n(t) ? Math.ceil(Math.ceil(n(t) * 1.2) / cap) : 0, t));
  const adr = r.onglets.find(o => o.titre === 'Régulation').blocs.find(b => /Plan d'adressage/.test(b.titre)).tableau.lignes.filter(l => l[2] !== '—' && !/^Bus/.test(l[0]));
  assert.strictEqual(new Set(adr.map(l => l[0])).size, adr.length);
  assert.deepStrictEqual(adr.slice(0, 2).map(l => l[1]), ['X2:1-2', 'X2:3-4']);
  // Nomenclature : interrupteur général au calibre, contacteurs des pompes commandées, cartes, enveloppe
  const cc = r.onglets.find(o => o.titre === 'Cahier des charges armoires').blocs.find(b => /Nomenclature/.test(b.titre)).tableau.lignes;
  assert.ok(cc.some(l => /Interrupteur-sectionneur/.test(l[1]) && l[2] === `${ar.cal} A`));
  assert.ok(cc.some(l => /Contacteur/.test(l[1])) && cc.some(l => /Carte 16 ETOR/.test(l[1])) && cc.some(l => /Armoire métallique IP 54/.test(l[1])));
  // Bilan : puissance appelée = Σ foisonnée × simultanéité
  const bil = r.onglets.find(o => o.titre === 'Bilan de puissance').blocs[0].tableau.lignes;
  assert.match(bil[bil.length - 1][0], /Total CVC au TGBT/);
  assert.ok(Math.abs(r.valeurs.Pappel - (ar.P * 0.8 + r.valeurs.Pelec) * 0.9) < 0.01);
  assert.match(r.schema, />KM</, 'contacteur des pompes commandées en marche / arrêt');
  assert.deepStrictEqual(r.valeurs.feuilles.map(f => f.name), ['Bilan de puissance', 'Attentes lot élec', 'Équipements', 'Liste des points', "Table d'échange GTB", 'Essais point à point', 'E-S AR-CVC-01', 'Nomenclature AR-CVC-01']);
  // Le classeur se construit
  const X = require('../public/js/xlsx');
  assert.ok(X.build(r.valeurs.feuilles.map(f => ({ name: f.name, rows: [f.entetes, ...f.lignes] }))).length > 1000);
});

test('courts-circuits, sélectivité et puissance électrique reprise du catalogue', () => {
  const r = N.calculer('elec', { armoires: [{ rep: 'AR1', L: 30, ks: 100, reserve: 0 }], iccTgbt: 10, equipements: [
    { rep: 'P1', type: 'pompe', P: 2, alim: 'AR1', L: 20 }, { rep: 'P2', type: 'pompe', P: 0.3, alim: 'AR1', L: 400 }] });
  const cc = r.onglets.find(o => o.titre === 'Bilan de puissance').blocs.find(b => b.titre === 'Courts-circuits et sélectivité').tableau.lignes[0];
  const a = r.valeurs.armoires[0];
  // Icc au jeu de barres < Icc du TGBT ; pouvoir de coupure normalisé au-dessus
  const icc = Number(cc[1].replace(',', '.'));
  assert.ok(icc > 0.5 && icc < 10, `Icc ${icc} kA`); assert.match(cc[2], /^(6|10) kA$/);
  assert.ok(a.cal >= 1.6 * 16, 'tête sélective avec le départ de 16 A');
  // Pompe de 2 kW en 16 A courbe D à 40 m : Icc mini ≈ 225 A sous le seuil magnétique de 320 A (20 In)
  const loin = N.calculer('elec', { armoires: [{ rep: 'AR1', L: 30, ks: 100, reserve: 0 }], iccTgbt: 10, equipements: [{ rep: 'P1', type: 'pompe', P: 2, alim: 'AR1', L: 40 }] });
  assert.ok(loin.alertes.some(x => x.niveau === 'erreur' && /P1 : Icc mini en bout de ligne .* < seuil magnétique 320 A/.test(x.texte)));
  // À 20 m la même pompe est protégée
  assert.ok(!r.alertes.some(x => /P1 : Icc mini/.test(x.texte)));
  // Puissance électrique du modèle choisi au catalogue : remplace l'estimation, partagée entre les ventilateurs de la CTA
  const aero = { id: 'a', type: 'aero', titre: 'CTA', entrees: N.defauts('aero') };
  const et = { notes: [aero], materiel: {} };
  const v = N.calculer('aero', aero.entrees).valeurs, cle = `aero|${v.producteur}|${Math.round(Math.max(v.Qs, v.Qr))}`;
  et.materiel[cle] = { fabricant: 'Ventilia', reference: 'CTA-DF 3000', pElec: 2.4 };
  const ls = E.equipementsEtude(et, Liens).filter(x => x.type === 'ventilateur');
  assert.strictEqual(ls.length, 2);
  proche(ls.reduce((s, x) => s + x.P, 0), 2.4, 0.011);
  assert.ok(ls.every(x => /Ventilia CTA-DF 3000/.test(x.designation)));
});

test('folios : commande (contacteurs, variateurs, chaîne de sécurité), cartes de l\'automate, bornier X1', () => {
  const pid = { id: 'p', type: 'pid', titre: 'Chaufferie', entrees: N.defauts('pid') };
  const eqs = E.fusionner([], E.equipementsEtude({ notes: [pid] }, Liens)).lignes;
  const r = N.calculer('elec', { ...N.defauts('elec'), equipements: eqs });
  assert.deepStrictEqual(r.schemas.map(s => s.titre.replace(/^F\d+ — /, "")), ['Alimentations et circuits auxiliaires — armoire AR-CVC-01', 'Folio de commande — armoire AR-CVC-01', 'Implantation de l\'automate — armoire AR-CVC-01 (1 châssis)', 'Cartes d\'entrées / sorties — armoire AR-CVC-01']);
  const [aux, cmd, implantation, cartes] = r.schemas.map(s => s.svg);
  assert.match(aux, /QG /); assert.match(aux, /Parafoudre/); assert.match(aux, /KA-AU/);
  assert.match(implantation, />UC</); assert.match(implantation, /utilisées</);
  assert.match(cmd, /Chaîne de sécurité/); assert.match(cmd, />KA1</); assert.match(cmd, />KM-PC1</); assert.match(cmd, />EVG</);
  // Une carte dessinée par carte prévue (réserve comprise), voies libres marquées
  const nb = Object.values(r.valeurs.armoires[0].cartes).reduce((s, n) => s + n, 0);
  assert.strictEqual((cartes.match(/ — \d+ (EA|SA|ETOR|STOR)</g) || []).length, nb);
  assert.match(cartes, />réserve</);
  const x1 = r.onglets.find(o => /Cahier/.test(o.titre)).blocs.find(b => /Bornier X1/.test(b.titre)).tableau.lignes;
  assert.deepStrictEqual(x1.slice(0, 2).map(l => l[0]), ['X1:1-3', 'X1:4-6']);
});

test('chantier réparti : armoire divisionnaire alimentée depuis une autre armoire, équipements affectés par local', () => {
  const ent = { ...N.defauts('elec'), options: E.OPTIONS_DEFAUT.filter(k => k !== 'comptageUsages'),
    armoires: [{ rep: 'AR-01', local: 'Chaufferie', L: 30, ks: 100, reserve: 0 }, { rep: 'AR-02', local: 'Toiture', amont: 'AR-01', L: 60, ks: 100, reserve: 0 }],
    equipements: [
      { rep: 'P1', type: 'pompe', P: 1.5, tension: 'tri', local: 'Chaufferie' },
      { rep: 'V1', type: 'ventilateur', P: 4, tension: 'tri', local: 'toiture terrasse' },
      { rep: 'V2', type: 'ventilateur', P: 2.2, tension: 'tri', local: 'Toiture', alim: 'AR-01' }] };
  const r = N.calculer('elec', ent), [a1, a2] = r.valeurs.armoires;
  // V1 (local « toiture terrasse ») rejoint AR-02 ; V2 reste sur l'armoire choisie
  const dep = rep => r.onglets.find(o => /Cahier/.test(o.titre)).blocs.find(b => b.titre === `Départs de l'armoire ${rep}`).tableau.lignes.map(l => l[0]);
  assert.deepStrictEqual(dep('AR-02'), ['V1']);
  assert.deepStrictEqual(dep('AR-01'), ['P1', 'V2', 'AR-02']);
  // La puissance de la divisionnaire est comptée dans son armoire amont, une seule fois au TGBT
  proche(a1.P, 1.5 + 2.2 + 0.3 + a2.P, 1e-9); proche(r.valeurs.PCvc, a1.P, 1e-9);
  const att = r.onglets.flatMap(o => o.blocs || []).find(b => /Attentes à demander/.test(b.titre)).tableau.lignes.map(l => l[0]);
  assert.ok(att.includes('Armoire AR-01') && !att.includes('Armoire AR-02'));
  assert.ok(a1.Ib > a2.Ib);
  // Icc plus faible en aval ; départ divisionnaire à la nomenclature et au schéma
  const cc = r.onglets.flatMap(o => o.blocs || []).find(b => b.tableau && b.tableau.lignes.some(l => /jeu de barres/.test(l[0]))).tableau.lignes;
  assert.ok(Number(cc[1][1].replace(',', '.')) < Number(cc[0][1].replace(',', '.')));
  assert.match(cc[1][0], /depuis AR-01/);
  assert.match(r.schema, /Depuis AR-01/); assert.match(r.schema, />Armoire</);
  // Boucle d'alimentation signalée
  const b = N.calculer('elec', { ...ent, armoires: [{ ...ent.armoires[0], amont: 'AR-02' }, ent.armoires[1]] });
  assert.ok(b.alertes.some(x => /en boucle/.test(x.texte || x.message || x[1] || JSON.stringify(x))));
});
