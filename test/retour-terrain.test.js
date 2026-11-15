// Retour du terrain vers l'étude : plaque signalétique → registre, réserves levées par les compagnons, retour
// d'expérience des modèles (entretien), comptages de la GTC → bilan réel. Données fictives.
const { test } = require('node:test');
const assert = require('node:assert');
const PR = require('../public/js/plaque-registre');
const RT = require('../public/js/reserves-terrain');
const RC = require('../public/js/retour-chantier');
const RX = require('../public/js/rex-equipements');
const MR = require('../public/js/materiel-retenu');
const N = require('../etudes/public/js/notes');
const AE = require('../etudes/public/js/annexes-energie');
const CP = require('../etudes/public/js/comptages');
const AX = require('../etudes/public/js/annexes-exploitation');

/* ---------- 7. Plaque → registre ---------- */
test('plaque : même modèle (casse, ponctuation, marque en tête) → conforme ; autre modèle → substitution', () => {
  const retenu = { fabricant: 'Pompix', reference: 'Circa 40-120 F' };
  assert.strictEqual(PR.comparer(retenu, { marque: 'POMPIX', modele: 'CIRCA 40/120F' }).etat, 'conforme');
  assert.strictEqual(PR.comparer(retenu, { marque: 'Pompix SA', modele: 'Pompix Circa 40-120 F 230V' }).etat, 'conforme');
  const s = PR.comparer(retenu, { marque: 'Aquaflux', modele: 'AF 40-12' });
  assert.strictEqual(s.etat, 'substitution');
  assert.match(s.texte, /« Aquaflux AF 40-12 » au lieu du modèle retenu « Pompix Circa 40-120 F » \(fabricant et référence différents\)/);
  assert.strictEqual(PR.comparer(retenu, { marque: 'Pompix', modele: 'Circa 50-80' }).etat, 'substitution');
  assert.strictEqual(PR.comparer(retenu, { marque: 'Pompix' }).etat, 'partiel');
  assert.strictEqual(PR.comparer(retenu, {}).etat, 'nonLu');
});

test('suivi Pipe-Fit : la photo garde marque et modèle lus, le chantier les expose avec le n° de série', () => {
  const d = MR.appliquerSuivi({}, 'photo', 'Kevin', '2026-11-03', { fichierId: 'abc123', ...PR.extraPhoto({ numeroSerie: 'SN-0042', marque: 'Aquaflux', modele: 'AF 40-12' }) });
  assert.deepStrictEqual([d.serie, d.plaque.marque, d.plaque.modele], ['SN-0042', 'Aquaflux', 'AF 40-12']);
  const liens = [{ app: 'etudes', id: 'e1', affaireId: 'af1', resume: { objet: 'Étude', materiel: [{ cle: 'pompe|P1', designation: 'Pompe P1', qte: 1, fabricant: 'Pompix', reference: 'Circa 40-120 F', statut: 'Validé' }] } }];
  const [m] = MR.pourChantier(liens, [{ etudeId: 'e1', cle: 'pompe|P1', ...d, poseLe: '2026-11-02' }]);
  assert.strictEqual(m.serie, 'SN-0042');
  assert.strictEqual(PR.comparer(m, m.plaque).etat, 'substitution');
});

test('registre de l\'étude : unités posées ajoutées au modèle (n° de série, pose), substitution signalée sans changer le modèle', () => {
  const et = { equipements: [{ id: 'q1', type: 'pompe', fabricant: 'Pompix', reference: 'Circa 40-120 F' }, { id: 'q2', type: 'cta', fabricant: 'Aerotec', reference: 'CT 3000' }] };
  const lignes = [{ cle: 'pompe|P1', designation: 'Pompe P1', fabricant: 'Pompix', reference: 'Circa 40-120 F' }, { cle: 'cta|C1', designation: 'CTA bureaux', fabricant: 'Aerotec', reference: 'CT 3000' }];
  const suivis = [{ cle: 'pompe|P1', serie: 'SN-0042', poseLe: '2026-11-02', mesLe: '2026-11-05', plaque: { marque: 'Pompix', modele: 'CIRCA 40-120F' } },
    { cle: 'cta|C1', poseLe: '2026-11-01', plaque: { marque: 'Ventimax', modele: 'VX 3000' } }];
  const r = PR.versRegistre(et, lignes, suivis);
  assert.strictEqual(r.maj, 2);
  assert.deepStrictEqual(et.equipements[0].installes, [{ cle: 'pompe|P1', designation: 'Pompe P1', serie: 'SN-0042', poseLe: '2026-11-02', mesLe: '2026-11-05', plaque: 'Pompix CIRCA 40-120F', etat: 'conforme' }]);
  assert.strictEqual(et.equipements[1].reference, 'CT 3000', 'le modèle du registre reste celui retenu');
  assert.deepStrictEqual(r.alertes.map(a => [a.cle, a.etat]), [['cta|C1', 'substitution']]);
  assert.deepStrictEqual(r.confirmations.map(a => a.cle), ['pompe|P1']);
  assert.strictEqual(PR.versRegistre(et, lignes, suivis).maj, 0, 'déjà repris');
  // Fiche équipement du DOE
  const e = {}; PR.ficheDoe(e, { ...lignes[1], ...suivis[1], serie: 'VX-77' });
  assert.deepStrictEqual([e.serie, e.pose, e.plaqueLue, e.plaqueEtat], ['VX-77', '2026-11-01', 'Ventimax VX 3000', 'substitution']);
});

/* ---------- 8. Réserves et levées ---------- */
const liensEtude = [{ app: 'etudes', id: 'e1', affaireId: 'af1', resume: { objet: 'Chaufferie fictive', reserves: RT.pourCrm([
  { cle: 'obl|n1|detection', categorie: 'Obligation réglementaire', texte: 'Détection de fuite obligatoire — GF1', valeur: '620 tCO₂e', origine: 'N3 — Fluides' },
  { cle: 'param|n2|consigne', categorie: 'Paramètre à valider', texte: 'Consigne de départ', valeur: '45 °C', origine: 'N2' }], { 'param|n2|consigne': { le: '2026-10-01' } }) } }];

test('réserves : candidats de l\'étude (non levées) et des PV, création affectée, pas de doublon', () => {
  assert.strictEqual(liensEtude[0].resume.reserves.length, 1, 'réserve déjà cochée dans l\'étude non transmise');
  const mes = [{ cle: 'ms1|Sens de rotation', localisation: 'Pompe P1', description: 'Sens de rotation (automate)', source: 'MS-0001' }];
  const c = RT.candidats({ liens: liensEtude, mesReserves: mes, reserves: [] });
  assert.deepStrictEqual(c.map(x => x.source), ['etude', 'mes']);
  const r = RT.creer(c[0], { numero: 3, assigneA: 'o2', echeance: '2026-12-01' });
  assert.deepStrictEqual([r.statut, r.assigneA, r.origine.etudeId, r.origine.cle], ['Ouverte', 'o2', 'e1', 'obl|n1|detection']);
  assert.deepStrictEqual(RT.candidats({ liens: liensEtude, mesReserves: mes, reserves: [{ ...r, affaireId: 'af1' }, { cleMes: 'ms1|Sens de rotation' }] }), []);
});

test('levée par le compagnon : seulement sa réserve, seulement les champs de levée, photo ou commentaire requis', () => {
  const ex = { id: 'r1', affaireId: 'af1', numero: 3, description: 'Détection de fuite', assigneA: 'o2', statut: 'Ouverte', origine: { app: 'etudes', etudeId: 'e1', cle: 'obl|n1|detection' } };
  assert.match(RT.ecritureCompagnon(ex, { ...ex, statut: 'Levée' }, 'o3').refus, /autre intervenant/);
  assert.match(RT.ecritureCompagnon(null, ex, 'o2').refus, /bureau/);
  assert.match(RT.ecritureCompagnon(ex, { ...ex, statut: 'Levée' }, 'o2').refus, /Photo ou commentaire/);
  const lev = RT.lever(ex, { date: '2026-11-10', commentaire: 'Détecteur posé et testé', photoId: 'ph1', par: 'Ahmed', parId: 'o2' });
  const ok = RT.ecritureCompagnon(ex, { ...lev, description: 'modifiée', assigneA: 'o9' }, 'o2').obj;
  assert.deepStrictEqual([ok.statut, ok.dateLevee, ok.photoLeveeId, ok.description, ok.assigneA], ['Levée', '2026-11-10', 'ph1', 'Détection de fuite', 'o2']);
  assert.deepStrictEqual(RT.duCompagnon([ok, { ...ex, id: 'r2', assigneA: 'o3' }], 'o2').map(x => x.id), ['r1']);
  // Retour dans l'étude : réserve de conformité cochée, observation et photo
  const lv = RT.leveesEtude([{ ...ok }], 'e1');
  assert.deepStrictEqual([lv[0].cle, lv[0].le, lv[0].photo], ['obl|n1|detection', '2026-11-10', 'ph1']);
  const et = { reservesConformite: {} };
  assert.strictEqual(RT.appliquerEtude(et, lv, AX.cocher), 1);
  assert.deepStrictEqual([et.reservesConformite['obl|n1|detection'].le, et.reservesConformite['obl|n1|detection'].photo], ['2026-11-10', 'ph1']);
  assert.match(et.reservesConformite['obl|n1|detection'].obs, /Levée sur le chantier \(réserve n° 3\) : Détecteur posé/);
  assert.strictEqual(RT.appliquerEtude(et, lv, AX.cocher), 0, 'déjà cochée');
});

test('retour du chantier pour une étude : mesures, réserves, suivi (sans autre chantier)', () => {
  const data = { misesEnService: [{ id: 'm1', affaireId: 'af1', type: 'pompes', numero: 'MS-1', mesures: [{ libelle: 'Débit mesuré', unite: 'm³/h', valeur: '3', attendu: 3.5 }] }, { id: 'm2', affaireId: 'af2', mesures: [] }],
    equilibrages: [{ id: 'q1', affaireId: 'af1', type: 'Hydraulique', lignes: [{ repere: 'VE-1', theorique: 1, mesure: 1.2 }] }],
    reserves: [{ affaireId: 'af1', statut: 'Levée', dateLevee: '2026-11-10', origine: { app: 'etudes', etudeId: 'e1', cle: 'k' } }, { affaireId: 'af1', statut: 'Ouverte', numero: 4, assigneA: 'o2', origine: { app: 'etudes', etudeId: 'e1', cle: 'k2' } }],
    suivis: [{ etudeId: 'e1', cle: 'pompe|P1', serie: 'S1', plaque: { marque: 'X' } }, { etudeId: 'e2', cle: 'z' }] };
  const r = RC.collecter(data, 'af1', 'e1');
  assert.deepStrictEqual([r.mises.length, r.equilibrages.length, r.reserves.levees.length, r.reserves.affectees.length, r.suivis.length], [1, 1, 1, 1, 1]);
  assert.strictEqual(r.mises[0].mesures[0].attendu, 3.5);
});

/* ---------- 9. Entretien → retour d'expérience ---------- */
test('interventions rattachées par n° de série puis repère ; historique par modèle ; alerte au seuil', () => {
  const mat = [{ etudeId: 'e1', cle: 'pompe|P1', designation: 'Pompe P1 — chaufferie', fabricant: 'Pompix', reference: 'Circa 40-120 F', serie: 'SN-1', mesLe: '2025-11-01', qte: 1 },
    { etudeId: 'e1', cle: 'pompe|P2', designation: 'Pompe P2', fabricant: 'Pompix', reference: 'Circa 40-120 F', serie: 'SN-2', mesLe: '2025-11-01', qte: 1 },
    { etudeId: 'e1', cle: 'cta|C1', designation: 'CTA C1', fabricant: 'Aerotec', reference: 'CT 3000', mesLe: '2025-11-01', qte: 1 }];
  const i1 = RX.intervention({ date: '2026-03-02', type: 'Panne', serie: 'sn-2', description: 'Pompe bloquée', pieces: 'Garniture mécanique ; Condensateur' }, mat, { id: 'i1' });
  assert.deepStrictEqual([i1.equipement, i1.rattachePar, i1.reference], ['e1|pompe|P2', 'série', 'Circa 40-120 F']);
  const i2 = RX.intervention({ date: '2026-06-02', type: 'Pièce changée', repere: 'P1', description: 'Bruit', pieces: ['Garniture mécanique'] }, mat, { id: 'i2' });
  assert.deepStrictEqual([i2.equipement, i2.rattachePar], ['e1|pompe|P1', 'repère']);
  const i3 = RX.intervention({ date: '2026-06-02', type: 'Visite préventive', repere: 'C1' }, mat, { id: 'i3' });
  // Deux affaires : 3 pompes du modèle en service, 2 défaillances
  const h = RX.historique([{ id: 'af1', code: 'CH-001', materiel: mat, interventions: [i1, i2, i3] },
    { id: 'af2', code: 'CH-002', materiel: [{ ...mat[0], etudeId: 'e2', serie: 'SN-9' }], interventions: [] }], '2026-11-01');
  const p = h.find(x => x.reference === 'Circa 40-120 F');
  assert.deepStrictEqual([p.installes, p.pannes, p.affaires, p.taux], [3, 2, 2, 0.67]);
  assert.deepStrictEqual(p.pieces[0], { designation: 'Garniture mécanique', qte: 2 });
  assert.strictEqual(h.find(x => x.reference === 'CT 3000').pannes, 0);
  const etude = [{ cle: 'pompe|PX', designation: 'Pompe de la nouvelle étude', fabricant: 'POMPIX', reference: 'circa 40-120F' }, { cle: 'cta|CX', designation: 'CTA', fabricant: 'Aerotec', reference: 'CT 3000' }];
  const a = RX.alertes(etude, h, { seuil: 0.5, minInstalles: 2 });
  assert.deepStrictEqual(a.map(x => x.cle), ['pompe|PX']);
  assert.match(a[0].texte, /2 panne\(s\) pour 3 équipement\(s\) en service sur 2 affaire\(s\) \(67 %/);
  assert.deepStrictEqual(RX.alertes(etude, h, { seuil: 0.7 }), [], 'seuil réglable');
});

/* ---------- 10. Comptages GTC → bilan réel ---------- */
test('lecture CSV : en-têtes, dates françaises et Excel, index', () => {
  const rows = CP.lireCsv('﻿Date;Compteur;Index;Unité\n01/01/2026;CET-CH;1000;kWh\n2026-02-01;CET-CH;9000;kWh\n46054;CET-CH;15000;kWh\n;;;\n');
  const l = CP.lire(rows);
  assert.deepStrictEqual(l.releves.map(x => [x.date, x.index]), [['2026-01-01', 1000], ['2026-02-01', 9000], ['2026-02-01', 15000]].map((x, i) => (i === 2 ? [CP.date(46054), 15000] : x)));
  assert.strictEqual(CP.date('15/03/26 08:00'), '2026-03-15');
  assert.strictEqual(CP.usageDe('CPT-APP'), 'appoint');
  assert.strictEqual(CP.usageDe('CPT-E-VENT'), 'ventilation');
});

// Étude fictive : énergie annuelle (gaz) et traitement d'eau ; L simplifié (calcul direct des notes)
const etudeEnergie = () => ({ notes: [
  { id: 'n1', type: 'energieAnnuelle', titre: 'Énergie annuelle', entrees: { ...N.defauts('energieAnnuelle'), source: '', site: 'H1', DJU: 2400, Pch: 100, Pfr: 0, Vj: 0, solutions: [{ nom: 'Chaudière gaz', energie: 'gaz', rendCh: 0.9, rendEcs: 0.9, seer: '' }] } },
  { id: 'n2', type: 'elec', titre: 'Armoire', entrees: {} }, { id: 'n3', type: 'traitementEau', titre: 'Traitement d\'eau', entrees: { appoint: 5 } }] });
const Lf = { calculer: (et, n) => (n.type === 'energieAnnuelle' ? N.calculer('energieAnnuelle', n.entrees) : n.type === 'traitementEau' ? { valeurs: { V: 2000 } }
  : { valeurs: { listePoints: [['CET-CH', 'Index d\'énergie — Compteur', 'Bus', 'AR1', 'TCP', '', 'CET-CH — Compteur d\'énergie thermique — chauffage', 'Index', 'comptage:CET-CH'], ['CPT-GAZ', 'Impulsions', 'ETOR', 'AR1', 'TCP', '', 'CPT-GAZ — Compteur de gaz', 'Index', 'comptage:CPT-GAZ'], ['P1', 'Marche', 'STOR', 'AR1', 'TC', '', 'P1 — Pompe', 'Marche', '']] } }),
  resoudre: (et, n) => ({ entrees: n.entrees }) };

test('compteurs prévus par la GTC et rapprochement des relevés', () => {
  const et = etudeEnergie(), p = CP.prevus(et, Lf);
  assert.deepStrictEqual(p.map(x => [x.rep, x.usage]), [['CET-CH', 'chauffage'], ['CPT-GAZ', 'gaz'], ['CPT-APP', 'appoint']]);
  const r = CP.rapprocher([{ compteur: 'CET-CH', date: '2026-01-01', index: 1 }, { compteur: 'CPT-XYZ', date: '2026-01-01', index: 1 }], p);
  assert.deepStrictEqual([r.lies.map(x => x.compteur), r.inconnus.map(x => x.compteur), r.absents.map(x => x.rep)], [['CET-CH'], ['CPT-XYZ'], ['CPT-GAZ', 'CPT-APP']]);
});

test('bilan réel : prévu / réel par usage (DJU réels), dérive, fuite d\'eau au compteur d\'appoint', () => {
  const et = etudeEnergie(), ctx = CP.contexte(et, Lf), prev = CP.prevus(et, Lf);
  assert.ok(ctx.energie.besoins.chauffage > 0); assert.strictEqual(ctx.volumeReseau, 2000);
  assert.strictEqual(AE.prevuParUsage(N.calculer('energieAnnuelle', et.notes[0].entrees).valeurs).solution, 'Chaudière gaz');
  const B = ctx.energie.besoins.chauffage;
  // Chauffage : 4 relevés mensuels, réel = 1,3 × prévu sur la saison (1 200 DJU réels), dernier mois en forte hausse
  const idx = [0, 0.25, 0.5, 1.3].map(f => Math.round(B * 0.5 * f)), dates = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'];
  const releves = [...dates.map((d, i) => ({ date: d, compteur: 'CET-CH', index: 100000 + idx[i], unite: 'kWh' })),
    // Appoint : 0,1 m³ en janvier puis 0,9 m³ en 28 jours (32 L/j > 20 L/j)
    { date: '2026-01-01', compteur: 'CPT-APP', index: 10, unite: 'm³' }, { date: '2026-02-01', compteur: 'CPT-APP', index: 10.1, unite: 'm³' }, { date: '2026-03-01', compteur: 'CPT-APP', index: 11, unite: 'm³' }];
  const b = CP.bilan({ releves, prevus: prev, ctx, tolerance: 15, djuReel: 1200 });
  const ch = b.parUsage.find(x => x.usage === 'chauffage');
  assert.strictEqual(ch.jours, 90);
  assert.strictEqual(ch.ecart, 30);
  assert.ok(ch.hors);
  assert.ok(b.derives.some(d => d.compteur === 'CET-CH'));
  assert.deepStrictEqual(b.fuites.map(f => [f.du, f.litresJour, f.seuil]), [['2026-02-01', 32, 20]]);
  assert.ok(b.alertes.some(a => a.type === 'fuite' && /Fuite d'eau probable/.test(a.texte)));
  assert.ok(b.alertes.some(a => a.type === 'absent' && a.compteur === 'CPT-GAZ'));
  // Tolérance réglable : ± 35 % → plus d'écart signalé au chauffage
  assert.ok(!CP.bilan({ releves, prevus: prev, ctx, tolerance: 35, djuReel: 1200 }).parUsage.find(x => x.usage === 'chauffage').hors);
  // Index en baisse : période ignorée et signalée
  const p = CP.periodes([{ date: '2026-01-01', compteur: 'X', index: 50 }, { date: '2026-02-01', compteur: 'X', index: 10 }, { date: '2026-03-01', compteur: 'X', index: 30 }]);
  assert.deepStrictEqual([p.periodes.length, p.anomalies.length], [1, 1]);
});
