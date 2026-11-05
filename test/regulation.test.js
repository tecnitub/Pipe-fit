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
