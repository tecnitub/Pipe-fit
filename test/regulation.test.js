// Régulation : automate, régulateurs préprogrammés type Synco, régulation intégrée ; analyse fonctionnelle par
// installation reliée aux calculs, paramètres de mise en service
const { test } = require('node:test');
const assert = require('node:assert');
global.FichesTech = require('../public/js/fiches-tech');
const N = require('../etudes/public/js/notes');
global.Notes = N;
global.Terminaux = require('../etudes/public/js/terminaux');
global.Schema = require('../etudes/public/js/schema');
global.Pompes = require('../etudes/public/js/pompes');
require('../etudes/public/js/industriel');
require('../etudes/public/js/equilibrage');
global.Sanitaire = require('../etudes/public/js/sanitaire');
global.FicheCta = require('../etudes/public/js/fiche-cta');
global.FicheEquip = require('../etudes/public/js/fiche-equipement');
require('../etudes/public/js/cta');
require('../etudes/public/js/desenfumage');
global.SchemaAir = require('../etudes/public/js/aeraulique-schema');
const Rg = require('../etudes/public/js/regulation');
global.Regulation = Rg;
const E = require('../etudes/public/js/electricite');
const L = require('../etudes/public/js/liens');
const PM = require('../etudes/public/js/points-mes');

// Étude d'exemple + une CTA + le calcul des armoires (équipements repris de l'étude)
function etude(techno) {
  const et = require('../etudes/demo-exemple')({ affaireId: 'a', client: 'c' });
  et.notes.push({ id: 'cta1', type: 'cta', titre: 'CTA bureaux', entrees: { ...N.defauts('cta'), Qs: 4500, Qr: 4300, froid: 'oui', recup: 'roue', TsH: 21, TsE: 17 }, commentaire: '' });
  const elec = { id: 'el', type: 'elec', titre: 'Armoires', entrees: { ...N.defauts('elec'), armoires: [{ rep: 'AR1', local: 'Chaufferie', L: 20, ks: 80, reserve: 20, regime: 'TT', techno }] }, commentaire: '' };
  elec.entrees.equipements = E.fusionner([], E.equipementsEtude(et, L), new Set(et.notes.map(n => n.id))).lignes;
  et.notes.push(elec);
  return { et, elec };
}
const bloc = (r, d) => r.onglets.find(o => o.titre === 'Régulation').blocs.find(b => d.test(b.titre || ''));

test('analyse fonctionnelle par installation, reliée aux calculs (loi d\'eau, consignes de soufflage, ECS, terminaux)', () => {
  const { et, elec } = etude('automate');
  const r = L.calculer(et, elec);
  const af = r.onglets.find(o => o.titre === 'Régulation').blocs.filter(b => /^Analyse fonctionnelle — /.test(b.titre || ''));
  assert.ok(af.some(b => /Chaufferie bâtiment A.*automate programmable/.test(b.titre) && b.liste.some(t => /loi d'eau/.test(t))));
  const cta = af.find(b => /CTA bureaux/.test(b.titre));
  assert.ok(cta.liste.some(t => /consigne 21 °C l'hiver et 17 °C l'été/.test(t)) && cta.liste.some(t => /Antigel/.test(t)) && cta.liste.some(t => /roue/.test(t)));
  assert.ok(af.some(b => /Ballon d'eau chaude/.test(b.titre) && /anti-légionelle/.test(b.liste[0])));
  assert.ok(af.some(b => /Cassettes des bureaux/.test(b.titre)));
  // Paramètres à régler : valeurs reprises des calculs
  const p = bloc(r, /^Paramètres à régler/).tableau.lignes;
  assert.ok(p.some(l => l[0] === 'CTA bureaux' && l[1] === 'Consigne de soufflage hiver' && l[2] === '21' && l[4] === 'automate'));
  assert.ok(p.some(l => /Loi d'eau Radiateurs bureaux : départ à -10 °C extérieur/.test(l[1])));
  assert.ok(bloc(r, /^Technologie de régulation/).liste[0].startsWith('Armoire AR1 : Automate programmable'));
});

test('régulateurs préprogrammés type Synco : un par application, modules d\'extension, bornes N.X / N.Y / N.Q, pas d\'automate', () => {
  const { et, elec } = etude('synco');
  const r = L.calculer(et, elec), arm = r.onglets.find(o => o.titre === 'Cahier des charges armoires');
  const t = bloc(r, /^Régulateurs préprogrammés — armoire AR1/).tableau.lignes;
  const apps = t.map(l => l[1]);
  assert.ok(apps.includes('Production (chaufferie, PAC, groupe froid)') && apps.includes('Circuits de chauffage et ECS') && apps.includes('Centrale de traitement d\'air, ventilation'));
  t.forEach(l => { const [u, c] = l[4].split(' / ').map(Number); assert.ok(u <= c, l.join(' | ')); });
  // Plan d'adressage : bornes du régulateur et de ses modules
  const adr = r.onglets.find(o => o.titre === 'Régulation').blocs.find(b => /^Plan d'adressage — armoire AR1/.test(b.titre)).tableau.lignes;
  assert.ok(adr.some(l => /^AR1-RC1P\/N\.X1$/.test(l[0])) && adr.some(l => /\/N\.Y\d$/.test(l[0])) && adr.some(l => /\/N\.Q\d$/.test(l[0])));
  // Nomenclature : régulateurs, régulateurs d'ambiance des terminaux, interface ; pas d'automate ni de cartes
  const nom = arm.blocs.find(b => /^Nomenclature/.test(b.titre)).tableau.lignes.map(l => l[1]);
  assert.ok(nom.some(x => /^Régulateur préprogrammé production — type Synco 700 RMK/.test(x)));
  assert.ok(nom.some(x => /^Régulateur d'ambiance communicant/.test(x)));
  assert.ok(!nom.some(x => /Automate programmable|^Carte /.test(x)));
  assert.ok(arm.blocs.find(b => /^Armoire AR1/.test(b.titre)).liste.some(x => /régulateurs préprogrammés/.test(x)));
  // Capacité plus petite : modules d'extension ajoutés
  elec.entrees.capaSynco = [{ app: 'ventilation', ref: 'Petit régulateur', X: 2, Y: 1, Q: 1 }, { app: 'extension', ref: 'Module 4 E', X: 4, Y: 2, Q: 2 }];
  const t2 = bloc(L.calculer(et, elec), /^Régulateurs préprogrammés — armoire AR1/).tableau.lignes.find(l => /ventilation/.test(l[1]));
  assert.strictEqual(t2[2], 'Petit régulateur');
  assert.ok(Number(t2[3]) >= 1);
});

test('régulation intégrée : l\'armoire ne porte que les reports ; fiche de mise en service de régulation par installation', () => {
  const { et, elec } = etude('integree');
  const r = L.calculer(et, elec);
  const pts = r.valeurs.listePoints.filter(p => p[3] === 'AR1' && p[2] !== 'LOG');
  assert.ok(pts.length && pts.every(p => p[2] === 'ETOR' || p[2] === 'Bus'), pts.map(p => p[2]).join(','));
  const nom = r.onglets.find(o => o.titre === 'Cahier des charges armoires').blocs.find(b => /^Nomenclature/.test(b.titre)).tableau.lignes.map(l => l[1]);
  assert.ok(nom.some(x => /Relais d'interface des reports/.test(x)) && !nom.some(x => /Automate programmable/.test(x)));
  // Mise en service : une fiche « Régulation » par installation, contrôles selon la technologie, consignes attendues
  const mes = PM.extraire(et, n => L.calculer(et, n)).filter(p => p.noteId === 'el' && /^Régulation — /.test(p.titre || ''));
  const cta = mes.find(p => /CTA bureaux/.test(p.titre));
  assert.ok(cta && /régulation intégrée aux équipements/.test(cta.titre));
  assert.ok(cta.controles.some(c => /régulateur intégré/.test(c)));
  assert.deepStrictEqual(cta.attendus.find(a => a.libelle === 'Consigne de soufflage hiver'), { libelle: 'Consigne de soufflage hiver', valeur: 21, unite: '°C' });
  assert.ok(mes.some(p => /Chaufferie bâtiment A/.test(p.titre) && p.attendus.some(a => /Loi d'eau/.test(a.libelle))));
});

test('affectation sur régulateur préprogrammé : bornes et dépassement de capacité', () => {
  const pts = [...Array(11)].map((_, i) => [`S${i}`, `Sonde ${i}`, 'EA']).concat([['V1', 'Vanne', 'SA'], ['P1', 'Pompe', 'STOR']]);
  const r = Rg.allouer(pts, 'chauffage', { chauffage: [8, 4, 6], extension: [4, 2, 2] });
  assert.strictEqual(r.regulateurs.length, 1);
  assert.strictEqual(r.regulateurs[0].modules, 1);
  assert.deepStrictEqual(r.affectations.slice(7, 9).map(a => a[0]), ['RC1/N.X8', 'RC1/A1.X1']);
  assert.ok(r.affectations.some(a => a[0] === 'RC1/N.Y1') && r.affectations.some(a => a[0] === 'RC1/N.Q1'));
  const gros = Rg.allouer([...Array(40)].map((_, i) => [`S${i}`, 'Sonde', 'EA']), 'chauffage', { chauffage: [8, 4, 6], extension: [4, 2, 2] });
  assert.strictEqual(gros.regulateurs.length, 2); // 8 + 3 modules × 4 = 20 entrées par régulateur
});

test('courbe de chauffe (loi d\'eau) : départ et retour selon l\'extérieur, arrêt chauffage, pente et déplacement', () => {
  const Sc = require('../etudes/public/js/schema');
  const e = { ...N.defauts('pid'), Tbase: -10 }, d = Sc.dimensionner(e), c = Sc.courbeChauffe(d, e);
  const rad = c.circuits.find(x => x.emetteur === 'radiateurs'), pl = c.circuits.find(x => x.emetteur === 'plancher');
  assert.ok(rad && pl);
  assert.strictEqual(rad.dep(-10), rad.regime[0]);
  assert.strictEqual(rad.dep(18), 30);
  assert.ok(Math.abs(rad.dep(4) - (rad.regime[0] + 30) / 2) < 1e-9); // linéaire entre -10 et 18 °C
  assert.ok(Math.abs(rad.ret(-10) - rad.regime[1]) < 1e-9 && rad.ret(10) < rad.dep(10));
  assert.ok(Math.abs(rad.pente - (rad.regime[0] - 30) / 28) < 1e-9);
  assert.strictEqual(pl.dep(18), 25);
  assert.match(c.svg, /^<svg[\s\S]*arrêt chauffage 17 °C[\s\S]*<\/svg>$/);
  assert.strictEqual(c.tableau.lignes.length, c.circuits.length);
  assert.deepStrictEqual(c.tableau.entetes, ['Circuit', '-10 °C ext.', '-5 °C ext.', '0 °C ext.', '5 °C ext.', '10 °C ext.', '15 °C ext.', '17 °C ext.']);
  // Dans le calcul : onglet Régulation (graphique, tableau, réglage) et schéma téléchargeable
  const r = N.calculer('pid', e), reg = r.onglets.find(o => o.titre === 'Régulation').blocs;
  assert.ok(reg[0].svg && /tableau/.test(Object.keys(reg[1]).join()) && /pente ≈/.test(reg[2].liste[0]));
  assert.ok(r.schemas.some(s => /Courbe de chauffe/.test(s.titre)));
});

test('courbe de chauffe réglable : départ à 18 °C par circuit et seuil d\'arrêt du chauffage', () => {
  const Sc = require('../etudes/public/js/schema');
  const e = { ...N.defauts('pid'), Tbase: -7, nonChauffage: 15 };
  e.circuits = e.circuits.map(c => (c.emetteur === 'radiateurs' ? { ...c, depMini: 35 } : c));
  const d = Sc.dimensionner(e), c = Sc.courbeChauffe(d, e), rad = c.circuits.find(x => x.emetteur === 'radiateurs');
  assert.strictEqual(rad.dep(18), 35);
  assert.strictEqual(rad.dep(-7), rad.regime[0]);
  assert.strictEqual(c.arret, 15);
  assert.match(c.svg, /arrêt chauffage 15 °C/);
  assert.strictEqual(c.tableau.entetes[c.tableau.entetes.length - 1], '15 °C ext.');
  const af = N.calculer('pid', e).onglets.find(o => o.titre === 'Régulation').blocs.find(b => b.titre === 'Analyse fonctionnelle').liste.join(' ');
  assert.match(af, /35 °C pour 18 °C extérieur/);
  assert.match(af, /au-delà de 15 °C extérieur/);
});

test('compléments : points KNX des régulateurs d\'ambiance, consignes par zone, désenfumage, exigences du CCTP', () => {
  const { et, elec } = etude('synco');
  // Terminaux sur régulateurs préprogrammés : points communiqués en KNX, pas d'entrées / sorties câblées
  let r = L.calculer(et, elec);
  const ca = r.valeurs.listePoints.filter(p => /^CA-0/.test(p[0]));
  assert.ok(ca.length && ca.every(p => p[2] === 'Bus' && p[5] === 'KNX'), ca.map(p => p[2] + p[5]).join(','));
  // Consignes par zone : zone des terminaux
  elec.entrees.consignesZones = [{ zone: 'R+1 — Bâtiment A', confort: 21, clim: 25, inocc: 17, horsGel: 7 }];
  r = L.calculer(et, elec);
  const p = r.onglets.find(o => o.titre === 'Régulation').blocs.find(b => /^Paramètres à régler/.test(b.titre)).tableau.lignes;
  assert.ok(p.some(l => l[1] === 'Consigne de confort chauffage — R+1 — Bâtiment A' && l[2] === '21'), p.filter(l => /Consigne de confort/.test(l[1])).map(l => l.join('|')).join('\n'));
  // Désenfumage : hors régulation CVC, commandé par le CMSI
  et.notes.push({ id: 'df', type: 'desenfumage', titre: 'Désenfumage atelier', entrees: { ...N.defauts('desenfumage') }, commentaire: '' });
  r = L.calculer(et, elec);
  const df = r.onglets.find(o => o.titre === 'Régulation').blocs.find(b => /Désenfumage atelier/.test(b.titre || ''));
  assert.ok(df && /CMSI/.test(df.liste[0]));
  // CCTP : protocole, automate, comptage exigés
  et.inventaire = [{ designation: 'Régulation', prescrit: 'Automate programmable communiquant en Modbus TCP, comptage d\'énergie par circuit, décret BACS classe B', genre: 'regulation', categorie: 'auxiliaire' }];
  elec.entrees.gtb = 'BACnet/IP';
  r = L.calculer(et, elec);
  const ex = r.onglets.find(o => o.titre === 'Régulation').blocs.find(b => b.titre === 'Exigences de régulation du CCTP').liste.join(' | ');
  assert.match(ex, /Protocole exigé : Modbus — retenu : BACnet\/IP ✕/);
  assert.match(ex, /Automate programmable demandé ✕/);
  assert.match(ex, /BACS/);
  assert.ok(r.alertes.some(a => /CCTP : communication Modbus/.test(a.texte)) && r.alertes.some(a => /CCTP : régulation par automate/.test(a.texte)));
});

test('DOE : régulation de l\'étude dans la notice d\'exploitation (analyse, paramètres étude / réglés, courbe, points GTB)', () => {
  const { et } = etude('synco');
  const r = Rg.pourDoe(et, L);
  assert.ok(r.installations.some(x => /Chaufferie/.test(x.titre) && x.af.length && x.params.length && /préprogrammés/.test(x.techno)));
  assert.ok(r.courbes.length && /^<svg/.test(r.courbes[0].svg) && r.courbes[0].reglages.length);
  assert.ok(r.points && r.points.lignes.length > 10);
  const Notice = require('../doe/public/js/notice');
  const doe = { operation: 'Atelier', lot: 'CVC', equipements: [], maintenance: [], familles: [] };
  const ins = r.installations.find(x => /CTA bureaux/.test(x.titre));
  const pv = { statut: 'Signé', equipement: `Régulation — ${ins.titre} (x)`, date: '2026-11-06', mesures: [{ libelle: 'Consigne de soufflage hiver', valeur: '21,5', unite: '°C' }] };
  const h = Notice.html(doe, { trame: { familles: [], maintenance: {}, formation: [] }, essais: { mes: [pv] }, regulation: [r] });
  assert.match(h, /<h2>\d+\. Régulation<\/h2>/);
  assert.match(h, /Consigne de soufflage hiver<\/td><td>21 °C<\/td><td>21,5<\/td>/);
  assert.match(h, /<img alt="Courbe de chauffe — Chaufferie bâtiment A[^"]*" style="width:100%;max-width:640px" src="data:image\/svg\+xml/);
  assert.match(h, /Liste des points GTB/);
  // Sans régulation : pas de chapitre
  assert.doesNotMatch(Notice.html(doe, { trame: { familles: [], maintenance: {}, formation: [] } }), /Régulation<\/h2>/);
});
