// Automatisations de la régulation : profils de bâtiment, CCTP, EDE BACnet, analyse fonctionnelle, étiquettes, chiffrage,
// PV de réglage, essais des séquences, notice d'exploitation, analyse des relevés de la GTB.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta'); require('../etudes/public/js/equilibrage'); require('../etudes/public/js/industriel'); require('../etudes/public/js/aeraulique-schema');
const E = require('../etudes/public/js/electricite');
const G = require('../etudes/public/js/gtb');
const C = require('../etudes/public/js/consignes-projet');
const Liens = require('../etudes/public/js/liens');
const PM = require('../etudes/public/js/points-mes');
const RG = require('../etudes/public/js/regulation');
global.XLSX = require('../public/js/xlsx'); const Docx = require('../etudes/public/js/docx');

const etude = (x = {}) => {
  const pid = { id: 'p', type: 'pid', titre: 'Chaufferie', entrees: N.defauts('pid') };
  const eqs = E.fusionner([], E.equipementsEtude({ notes: [pid] }, Liens)).lignes;
  return { objet: 'Collège', date: '2026-11-06', notes: [pid, { id: 'e', type: 'elec', titre: 'Armoires', entrees: { ...N.defauts('elec'), equipements: eqs, marqueAutomate: 'wit', gtb: 'BACnet/IP', ...x } }] };
};

test('1-2. profils de bâtiment, code de l\'énergie, consignes du CCTP', () => {
  assert.ok(C.PROFILS.enseignement.zones.length === 3 && C.profil('ehpad').exempte);
  const z = [{ zone: 'Bureaux', confort: 21, clim: 24 }];
  assert.deepStrictEqual(C.controleReglementaire(z, 'bureaux').map(a => a.niveau), ['info', 'attention']);
  assert.deepStrictEqual(C.controleReglementaire([{ zone: 'Chambres', confort: 22, clim: 26 }], 'ehpad'), []);
  const cc = C.consignesCctp('Température intérieure en hiver : 19 °C. En été la climatisation maintiendra 26 °C. Régime d\'eau 70/50 °C. Occupation de 7h30 à 18h, du lundi au vendredi.');
  assert.deepStrictEqual(cc, { chauffage: [19], clim: [26], regimes: [[70, 50]], horaires: [[7.5, 18]] });
  const et = etude({ consignesZones: [{ zone: 'Toutes zones', confort: 20, clim: 26, inocc: 16, horsGel: 8, jours: 'lun-ven', debut: '7:00', fin: '19:00' }], profilBatiment: 'bureaux' });
  et.inventaire = [{ designation: 'Chauffage', texte: 'Température de confort en hiver 19 °C. Régime 80/60 °C.' }];
  const r = Liens.calculer(et, et.notes[1]), t = r.alertes.map(a => a.texte).join(' | ');
  assert.match(t, /CCTP : 19 °C en chauffage ; saisi 20 °C/); assert.match(t, /régime 80\/60 °C cité, absent de l'étude/); assert.match(t, /au-dessus des 19 °C en moyenne du code de l'énergie/);
});

test('3. fichier EDE BACnet : objets, types, unités, états, inscriptibles', () => {
  const et = etude(), r = Liens.calculer(et, et.notes[1]), ech = r.valeurs.feuilles.find(x => /^Table/.test(x.name)).lignes, d = G.ede(ech, { projet: 'Collège', date: '2026-11-11' });
  const l = d.ede.split('\r\n');
  assert.strictEqual(l[0], '# Proposal_Engineering-Data-Exchange - B.I.G.-EU'); assert.strictEqual(l[5], 'VERSION_OF_LAYOUT;2.3');
  assert.match(l[7], /^# keyname;device obj\.-instance;object-name;object-type;object-instance/);
  assert.match(l[8], /^DEV_AR-CVC-01;1001;AR-CVC-01;8;1001;/);
  const ligne = n => l.find(x => x.startsWith(`${n};`)).split(';');
  assert.deepStrictEqual(ligne('CH_G1_AUT').slice(3, 5).concat(ligne('CH_G1_AUT')[9]), ['4', '1', 'Y']);
  assert.deepStrictEqual([ligne('CH_TD1_T')[3], ligne('CH_TD1_T')[9], ligne('CH_TD1_T')[14]], ['0', 'N', '62']);
  assert.strictEqual(ligne('CH_V1_CSG')[14], '98');
  assert.strictEqual(d.objets, ech.length);
  assert.match(d.etats, /^#State Text Reference/); assert.match(d.etats, /\d;Normal;Défaut/);
  assert.ok(Number(ligne('CH_G1_DEF')[13]) >= 1);
});

test('4. analyse fonctionnelle (Word) : consignes, plannings, séquences, alarmes et conduite à tenir', () => {
  const et = etude(), r = Liens.calculer(et, et.notes[1]), v = r.valeurs;
  const blocs = Docx.analyseFonctionnelle({ cahier: v.cahierProg, projet: v.consignesProjet, afs: [{ titre: 'Chaufferie', liste: ['Production selon la demande'] }], queFaire: G.queFaire, affaire: 'Collège' });
  assert.ok(blocs.some(b => b.h2 === '1. Consignes et horaires') && blocs.some(b => b.h3 === 'Plannings') && blocs.some(b => b.p === 'Cascade des générateurs' && b.b));
  const al = blocs.find(b => b.table && b.table.entetes[4] === 'Que faire');
  assert.ok(al && al.table.lignes.some(l => /Ne pas réarmer avant d'avoir trouvé la cause/.test(l[4])));
  const z = Buffer.from(Docx.build(blocs)); assert.strictEqual(z.slice(0, 2).toString(), 'PK');
  assert.match(G.queFaire('Défaut — Pompe primaire 1', 'bascule sur la pompe de secours'), /disjoncteur moteur/);
});

test('5. étiquettes de repérage : points, bornier, câbles, façade ; planche PDF', () => {
  const et = etude(), r = Liens.calculer(et, et.notes[1]), e = G.etiquettes(r.valeurs.cahierProg, r.valeurs.feuilles);
  assert.ok(e.points.some(x => x.titre === 'CH_G1_AUT' && /^P\d\d\.\d\d · X\d+:\d+-\d+ · DO · G1$/.test(x.sous)));
  assert.ok(e.bornes.length && e.cables.some(x => /^W\d{3}$/.test(x.titre) && / → /.test(x.sous)) && e.facade.some(x => x.titre === 'G1'));
  const P = require('../public/js/planches'), p = P.pdf(e.points.map(x => ({ titre: x.titre, sous: x.sous })), { modele: 'L4732', mesure: (t, s) => t.length * s * 0.5 });
  assert.ok(p.pages >= 1 && Buffer.from(p.octets).slice(0, 5).toString() === '%PDF-');
});

test('6. chiffrage de la régulation : matériel automate et heures', () => {
  const et = etude(), r = Liens.calculer(et, et.notes[1]), v = r.valeurs, nom = v.feuilles.filter(x => /^Nomenclature /.test(x.name)).flatMap(x => x.lignes);
  const ch = C.chiffrage({ pts: v.listePoints, nomenclature: nom, boucles: 5, installations: 1 });
  assert.ok(ch.materiel.some(m => /PLUG/.test(m.designation)));
  const n = v.listePoints.filter(p => p[2] !== 'LOG').length;
  assert.deepStrictEqual(ch.heures.map(h => h[1]), [Math.round((n * 0.25 + 5 * 1.5 + 4) * 4) / 4, Math.round((n * 0.1 + 1) * 4) / 4, 8]);
});

test('7-8. points de mise en service : PV de réglage (valeurs attendues) et essais des séquences', () => {
  const et = etude(), pts = PM.extraire(et, n => Liens.calculer(et, n));
  const reg = pts.find(p => p.cle === 'reglages'), seq = pts.find(p => p.cle === 'sequences');
  assert.ok(reg && reg.attendus.some(a => /^Loi d'eau Radiateurs bureaux : départ par -10 °C ext\.$/.test(a.libelle) && a.valeur === 70 && a.unite === '°C'));
  assert.ok(reg.attendus.some(a => /^Consigne confort chauffage/.test(a.libelle)) && reg.controles.some(c => /^Planning PL_Z1/.test(c)));
  assert.ok(seq && seq.controles.some(c => /^Cascade des générateurs : couper le générateur pilote/.test(c)) && seq.controles.some(c => /^Alarme CH_AU_DEF/.test(c)));
});

test('9. notice d\'exploitation : consignes, plannings, jours fériés, que faire en cas d\'alarme', () => {
  const et = etude(), d = RG.pourDoe(et, Liens);
  assert.ok(d.consignes.some(l => l[0] === 'Zone') && d.plannings.some(l => /^PL_/.test(l[0])) && d.feries.length === 11);
  assert.ok(d.alarmes.some(l => /^CH_AU_DEF/.test(l[0]) && /Ne pas réarmer/.test(l[4])));
  const Notice = require('../doe/public/js/notice');
  const h = Notice.html({ operation: 'Collège', lot: 'CVC', equipements: [], maintenance: [], familles: [] }, { trame: { familles: [], maintenance: {}, formation: [] }, regulation: [d] });
  assert.match(h, /<h3>Consignes et horaires<\/h3>/); assert.match(h, /<h3>Plannings<\/h3>/); assert.match(h, /Jours fériés 2026/); assert.match(h, /<h3>Que faire en cas d'alarme<\/h3>/);
});

test('10. relevés de la GTB comparés aux lois d\'eau et aux consignes', () => {
  const et = etude(), pj = Liens.calculer(et, et.notes[1]).valeurs.consignesProjet;
  const rows = [['Date', 'T ext', 'Départ Radiateurs bureaux', 'Ambiance']];
  for (let i = 0; i < 10; i++) { const te = -5 + i * 2, loi = 70 + (te + 10) * (30 - 70) / 28; rows.push([`2026-01-0${(i % 5) + 1}T08:00`, te, Math.round((loi - 6) * 10) / 10, 17.5]); }
  const a = C.analyserReleves(rows, pj);
  assert.strictEqual(a.circuits[0].circuit, 'Radiateurs bureaux'); assert.strictEqual(a.circuits[0].ecartMoyen, -6); assert.match(a.circuits[0].proposition, /sous la loi d'eau/);
  assert.deepStrictEqual([a.zones[0].jours, a.zones[0].joursHors], [5, 5]); assert.match(a.zones[0].proposition, /trop froid/);
  assert.match(C.analyserReleves([['a', 'b']], pj).erreur, /température extérieure/);
});
