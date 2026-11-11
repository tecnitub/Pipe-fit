// Suite : PV point à point (automate / GTB, réserves, intégrateur), notice d'exploitation (BACS, séquences, table
// d'échange, folios), folio de commande (lignes, fils, renvois), carnet de câbles, chiffrage de l'appareillage,
// réglages par point, profil d'export, synoptiques GTB.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta'); require('../etudes/public/js/equilibrage'); require('../etudes/public/js/industriel'); require('../etudes/public/js/aeraulique-schema');
const E = require('../etudes/public/js/electricite');
const G = require('../etudes/public/js/gtb');
const Liens = require('../etudes/public/js/liens');
const Es = require('../public/js/essais'), D = require('../public/js/essais-doc');

const etude = (x = {}) => {
  const pid = { id: 'p', type: 'pid', titre: 'Chaufferie', entrees: N.defauts('pid') };
  const eqs = E.fusionner([], E.equipementsEtude({ notes: [pid] }, Liens)).lignes;
  return { objet: 'Collège', client: 'Département', indice: 'A', date: '2026-11-06', notes: [pid, { id: 'e', type: 'elec', titre: 'Armoires', entrees: { ...N.defauts('elec'), equipements: eqs, gtb: 'BACnet/IP', ...x } }] };
};

test('PV point à point : états automate et GTB, avancement, réserves, conclusion, PV avec intégrateur', () => {
  const m = { type: 'gtb', controles: [{ libelle: 'P1 — Commande (TC) : Forcer', pap: true, etat: 'OK', etatGtb: '' }, { libelle: 'TD — Mesure (TM) : Comparer', pap: true, etat: 'OK', etatGtb: 'OK' }, { libelle: 'Configuration sauvegardée', etat: 'OK' }], mesures: [] };
  assert.deepStrictEqual(Es.avancementPap(m), { nb: 2, faits: 1, nc: 0 });
  assert.strictEqual(Es.conclusion(m), '', 'point non testé côté GTB');
  m.controles[0].etatGtb = 'Non conforme'; m.controles[0].obs = 'point absent de la supervision';
  assert.strictEqual(Es.conclusion(m), 'Mis en service avec réserves');
  assert.deepStrictEqual(Es.reserves(m), [{ libelle: 'P1 — Commande (TC) : Forcer', cote: 'GTB', obs: 'point absent de la supervision' }]);
  const h = D.miseEnService({ ...m, equipement: 'Tests point à point GTB', integrateur: 'Intégra SA', resultat: 'Mis en service avec réserves', signatureIntegrateurId: 'sig' }, { img: id => `/f/${id}`, technicien: 'T', societe: 'S', chantier: {} });
  assert.match(h, /Essais point à point — 2\/2 point\(s\) testé\(s\), 1 non conforme/);
  assert.match(h, /<th>Automate<\/th><th>GTB<\/th>/); assert.match(h, /Réserves/); assert.match(h, /Intégra SA/); assert.match(h, /Signature de l'intégrateur/);
});

test('notice d\'exploitation : BACS, comptages, séquences, table d\'échange et folios repris de l\'étude', () => {
  const Rg = require('../etudes/public/js/regulation'), et = etude();
  const r = Rg.pourDoe(et, Liens);
  assert.ok(r.bacs && r.bacs.classe && r.bacs.fonctions.length && r.bacs.exigences.length);
  assert.ok(r.comptages.lignes.some(l => l[0] === 'CET-CH'));
  assert.ok(r.sequences.some(s => s.titre === 'Chaufferie' && s.lignes.length === 5));
  assert.ok(r.echange.lignes.length > 10 && r.folios.some(f => /^F01 — /.test(f.titre)) && /<svg/.test(r.unifilaire));
  const Nx = require('../doe/public/js/notice');
  const h = Nx.html({ operation: 'Collège', lot: '14', equipements: [] }, { trame: { familles: [], maintenance: {}, formation: [] }, essais: { mes: [] }, regulation: [r] });
  ['Séquences de fonctionnement — Chaufferie', 'Table d\'échange GTB', 'Décret BACS et classe de la régulation', 'Comptage d\'énergie par usage', 'Schémas électriques des armoires'].forEach(t => assert.ok(h.includes(t), t));
});

test('folio de commande : numéros de ligne et de fils, renvois bobine ↔ contacts, folios des auxiliaires et de l\'unifilaire', () => {
  const r = Liens.calculer(etude(), etude().notes[1]), cmd = r.schemas.find(s => /Folio de commande/.test(s.titre)).svg;
  assert.ok(!/§(AUX|UNI)§/.test(cmd), 'repères de folio remplacés');
  assert.match(cmd, />→ F02</, 'KA-AU renvoie aux auxiliaires (F02)');
  assert.match(cmd, />→ F01</, 'disjoncteur moteur renvoie à l\'unifilaire');
  assert.match(cmd, />F\/2 · F\/4 · F\/11</, 'bobine KA1 : ses contacts à fermeture lignes 2, 4, 11');
  assert.match(cmd, />→ \/1</, 'contact KA1 renvoie à sa bobine ligne 1');
  assert.match(cmd, />puissance F01</); assert.match(cmd, />X2:\d+-\d+</);
});

test('carnet de câbles, chiffrage de l\'appareillage, réglages par point, profil d\'export, synoptiques', () => {
  const et = etude({ appareillage: [{ motif: 'Contacteur', marque: 'Marque A', reference: 'C-16', pu: 25 }, { motif: 'Disjoncteur moteur + 4 A', marque: 'Marque A', reference: 'DM-4', pu: 60 }],
    reglagesPoints: [{ rep: '*', libelle: 'Sonde de départ', bas: '20', haut: '85', historique: '5 min' }, { rep: 'PP1', libelle: 'Défaut', priorite: 'P1 (sécurité)' }],
    profilExport: [{ colonne: 'Name', source: 'Nom d\'objet' }, { colonne: 'Type', source: 'Objet BACnet' }, { colonne: 'Site', source: 'fixe', fixe: 'COLLEGE' }], sepExport: 'tab' });
  const r = Liens.calculer(et, et.notes[1]), cc = r.onglets.find(o => o.titre === 'Cahier des charges armoires').blocs;
  const carnet = cc.find(b => /^Carnet de câbles/.test(b.titre || '')).tableau.lignes;
  assert.ok(carnet.some(l => l[1] === 'Puissance') && carnet.some(l => l[1] === 'Commande (TOR)') && carnet.some(l => l[1] === 'Mesure / 0-10 V'));
  assert.strictEqual(new Set(carnet.map(l => l[0])).size, carnet.length, 'repères de câbles uniques');
  const nom = cc.find(b => /^Nomenclature/.test(b.titre)).tableau, tot = nom.lignes[nom.lignes.length - 1];
  assert.deepStrictEqual(nom.entetes.slice(-4), ['Marque', 'Référence', 'PU HT (€)', 'Montant HT (€)']);
  const ctr = nom.lignes.find(l => /^Contacteur/.test(l[1])); assert.strictEqual(ctr[5], 'C-16');
  const dm = nom.lignes.find(l => /Disjoncteur moteur/.test(l[1]) && /4 A/.test(l[2])); assert.strictEqual(dm[5], 'DM-4');
  assert.strictEqual(tot[0], 'Total matériel'); assert.ok(Number(tot[7].replace(/\s/g, '').replace(',', '.')) > 0);
  assert.ok(r.resume.some(x => /Chiffrage matériel/.test(x[0])));
  // Réglages par point
  const ech = r.onglets.find(o => o.titre === 'GTB et BACS').blocs.find(b => /^Table d'échange/.test(b.titre || '')).tableau.lignes;
  const td = ech.find(l => l[2] === 'TD1'); assert.deepStrictEqual([td[11], td[13], td[14]], ['5 min', '20', '85']);
  assert.strictEqual(ech.find(l => l[2] === 'PP1' && /Défaut/.test(l[3]))[10], 'P1 (sécurité)');
  // Profil d'export : colonnes choisies, valeur fixe, tabulation
  const csv = r.valeurs.echangeCsv.split('\r\n');
  assert.strictEqual(csv[0], 'Name\tType\tSite'); assert.match(csv[1], /^[A-Z0-9_-]+\t(AI|AO|BI|BO|AV|BV|SCHEDULE)\tCOLLEGE$/);
  // Synoptiques : un folio par installation, points et classes
  const syn = r.schemas.filter(s => /Synoptique GTB/.test(s.titre));
  assert.ok(syn.length >= 1 && /Synoptique GTB — Chaufferie/.test(syn[0].titre) && />TA</.test(syn[0].svg) && /N° de folio/.test(syn[0].svg));
  assert.strictEqual(G.exporter([['a', 'b']], [], ';').split('\r\n')[0], G.ENTETES_ECHANGE.join(';'));
});

test('cahier de programmation (automate Wit) : entrées / sorties, boucles, moteurs, horloges, sécurités, alarmes', () => {
  const et = etude({ marqueAutomate: 'wit' }), r = Liens.calculer(et, et.notes[1]);
  const o = r.onglets.find(x => x.titre === 'Programmation automate'), t = re => o.blocs.find(b => re.test(b.titre || '')).tableau.lignes;
  assert.match(o.blocs[0].titre, /Automate Wit/);
  const boucle = t(/Boucles de régulation/).find(l => l[0] === 'R-V1');
  assert.match(boucle[2], /^TD1 P\d\d\.\d\d/); assert.match(boucle[3], /^V1 P\d\d\.\d\d/); assert.match(boucle[4], /départ à -10 °C extérieur 70 °C/); assert.match(boucle[4], /PI : bande 20 K/);
  assert.ok(t(/Commandes des moteurs/).some(l => l[0] === 'PP1' && /P\d\d\.\d\d/.test(l[3]) && /retour de marche/.test(l[4])));
  assert.ok(t(/Plannings horaires/).length >= 1 && t(/Sécurités et asservissements/).some(l => l[0] === 'HG') && t(/Sécurités et asservissements/).some(l => l[0] === 'KA1'));
  assert.ok(t(/Alarmes/).some(l => l[4] === 'P1 (sécurité)' && l[3] === '0 s' && /coupure câblée/.test(l[5])));
  assert.ok(t(/^Armoire .* — Entrées \/ sorties$/).every(l => l[0] && l[2] && l[5]));
  const f = r.valeurs.feuilles.find(x => x.name === 'Programmation AR-CVC-01');
  assert.ok(f && f.lignes.length > 30 && f.entetes[0] === 'Rubrique');
});

test('automate Wit : ULI REDY dimensionnée d\'après le catalogue (PLUG, embases, ressources, Box Chaufferie)', () => {
  const r = Liens.calculer(etude({ marqueAutomate: 'wit' }), etude({ marqueAutomate: 'wit' }).notes[1]), a = r.valeurs.armoires[0];
  const cc = r.onglets.find(o => o.titre === 'Cahier des charges armoires').blocs, nom = cc.find(b => /^Nomenclature/.test(b.titre)).tableau.lignes.map(l => l[1]);
  const pts = t => r.valeurs.listePoints.filter(p => p[2] === t).length, plugs = n => nom.filter(x => x.startsWith(`PLUG I/O ${n}`)).length;
  // 20 % de réserve : 7 DI par 7.0.0.0, 4 DO par 0.4.0.0, 2 AO (+ 2 AI) par 0.0.2.2, 4 AI par 0.0.4.0
  assert.ok(nom.some(x => /PLUG UC REDY-PROCESS XS LAN \(PLUG801\)/.test(x)) && nom.some(x => /Connect-DIN UC REDY P6 \(PLUG310\)/.test(x)));
  const reg = r.onglets.find(o => o.titre === 'Régulation').blocs.find(b => /Automate Wit REDY/.test(b.titre || '')).liste.join(' ');
  const nb = re => Number((new RegExp(`(\\d+) × ${re}`).exec(reg) || [])[1] || 0);
  assert.strictEqual(nb('7\\.0\\.0\\.0'), Math.ceil(Math.ceil(pts('ETOR') * 1.2) / 7));
  assert.strictEqual(nb('0\\.4\\.0\\.0'), Math.ceil(Math.ceil(pts('STOR') * 1.2) / 4));
  assert.strictEqual(nb('0\\.0\\.2\\.2'), Math.ceil(Math.ceil(pts('SA') * 1.2) / 2));
  assert.ok(plugs('7.0.0.0') === 1 && plugs('0.0.2.2') === 1, 'une ligne de nomenclature par type de PLUG');
  assert.match(reg, /taille de ressources XS \(100\)/); assert.match(reg, /Connect-DIN P9/);
  assert.ok(a.extensions === 1);
  // Petite installation : la Box Chaufferie REDY suffit (variante proposée)
  const petit = Liens.calculer({ notes: [{ id: 'e', type: 'elec', titre: 'A', entrees: { ...N.defauts('elec'), marqueAutomate: 'wit', options: [], equipements: [{ rep: 'P1', type: 'pompe', P: 0.3, regulation: 'tor' }, { rep: 'V1', type: 'vanne', regulation: 'v010' }, { rep: 'TD', type: 'sonde', regulation: 'sonde' }] } }] }, { id: 'e', type: 'elec', titre: 'A', entrees: { ...N.defauts('elec'), marqueAutomate: 'wit', options: [], equipements: [{ rep: 'P1', type: 'pompe', P: 0.3, regulation: 'tor' }, { rep: 'V1', type: 'vanne', regulation: 'v010' }, { rep: 'TD', type: 'sonde', regulation: 'sonde' }] } });
  assert.ok(petit.onglets.find(o => o.titre === 'Régulation').blocs.find(b => /Automate Wit REDY/.test(b.titre || '')).liste.some(x => /Box Chaufferie REDY/.test(x)));
  // Une configuration saisie (autre automate) garde le calcul générique
  const autre = Liens.calculer(etude({ marqueAutomate: 'wit', automate: [{ type: 'UC', ref: 'Mon automate', voies: '', integrees: 0, chassis: 8 }, { type: 'EA', ref: 'Carte 8 EA perso', voies: 8 }] }), etude({ marqueAutomate: 'wit', automate: [{ type: 'UC', ref: 'Mon automate', voies: '', integrees: 0, chassis: 8 }, { type: 'EA', ref: 'Carte 8 EA perso', voies: 8 }] }).notes[1]);
  assert.ok(!autre.onglets.find(o => o.titre === 'Régulation').blocs.some(b => /Automate Wit REDY/.test(b.titre || '')));
});

test('cahier de paramétrage au format de l\'automaticien : noms par installation, états, synthèse, actions, logique, à valider, Word', () => {
  const et = etude({ marqueAutomate: 'wit' });
  et.notes[1].entrees.equipements.push({ rep: 'VC1', type: 'ventilo', designation: 'Cassette salle (maître)', P: 0.1, regulation: 'tor' }, { rep: 'VC2', type: 'ventilo', designation: 'Cassette salle (esclave)', P: 0.1, regulation: 'tor' });
  const r = Liens.calculer(et, et.notes[1]), c = r.valeurs.cahierProg[0], s = re => c.sections.find(x => re.test(x.titre));
  // 1. Noms par installation (table d'échange et cahier)
  const noms = r.valeurs.feuilles.find(x => /^Table/.test(x.name)).lignes.map(l => l[12]);
  ['CH_G1_AUT', 'CH_G1_CSG', 'CH_PP1_CMD', 'CH_V1_CSG', 'CH_TD1_T', 'ECS_PC4_CMD', 'CTA_V2_CSG', 'CAS_VC1_CMD', 'CH_AU_DEF'].forEach(n => assert.ok(noms.includes(n), n));
  assert.strictEqual(new Set(noms).size, noms.length, 'noms uniques');
  // 2. Unité / états
  const es = s(/^Entrées \/ sorties$/);
  assert.deepStrictEqual(es.entetes, ['Nom du point', 'Repère', 'Libellé', 'Type', 'Adresse · bornes', 'Unité / états', 'Signal / échelle', 'Remarque']);
  const ligne = n => es.lignes.find(l => l[0] === n);
  assert.deepStrictEqual([ligne('CH_G1_DEF')[3], ligne('CH_G1_DEF')[5]], ['DI', 'Normal / Défaut']);
  assert.strictEqual(ligne('CH_AU_DEF')[5], 'Normal / Alarme');
  assert.strictEqual(ligne('CH_PP1_CMD')[5], 'Arrêt / Marche');
  assert.strictEqual(ligne('CH_V1_CSG')[5], '0-100 %'); assert.strictEqual(ligne('CH_TD1_T')[5], '°C');
  // 3. Synthèse par installation avec 20 % de réserve
  const sy = s(/^Synthèse/), tot = sy.lignes.find(l => l[0] === 'Total'), res = sy.lignes.find(l => /réserve/.test(l[0]));
  assert.ok(sy.lignes.some(l => l[0] === 'Chaufferie / production') && sy.lignes.some(l => l[0] === 'Eau chaude sanitaire') && sy.lignes.some(l => l[0] === 'Cassettes'));
  assert.strictEqual(res[1], String(Math.ceil(Number(tot[1]) * 1.2)));
  // 4. Alarmes : action automatique
  const al = s(/^Alarmes$/).lignes;
  assert.match(al.find(l => l[0] === 'CH_G1_DEF')[5], /retiré de la cascade/);
  assert.match(al.find(l => l[0] === 'CH_AU_DEF')[5], /coupure câblée/);
  // 5. Logique pas à pas : cascade, ECS, CTA, cassettes maître / esclave
  const lg = s(/^Logique/).lignes, f = re => lg.filter(l => re.test(l[0])).map(l => l[2]).join(' ');
  assert.match(f(/^Cascade/), /moins d'heures/); assert.match(f(/^Cascade/), /CH_TDG reste sous la consigne .* de plus de 5 °C pendant 10 min/); assert.match(f(/^Cascade/), /plus haute demande des circuits \+ 5 K, plafonnée à 70 °C/);
  assert.match(f(/^ECS/), /anti-légionelle/); assert.match(f(/^CTA/), /reprise puis de soufflage/);
  assert.match(f(/^Terminaux/), /PV jusqu'à 1 °C d'écart, MV jusqu'à 2 °C, GV/); assert.match(f(/^Terminaux/), /maître \/ esclave/);
  // 6. À valider
  const av = s(/^À valider/);
  assert.ok(av.cases && av.lignes.every(l => l[0] === '☐') && av.lignes.some(l => /Wit/.test(l[1])) && av.lignes.some(l => /carnet sanitaire/.test(l[1])));
  // Nommage par armoire conservé en option
  const et2 = etude({ marqueAutomate: 'wit', nommagePoints: 'armoire' }), r2 = Liens.calculer(et2, et2.notes[1]);
  assert.ok(r2.valeurs.feuilles.find(x => /^Table/.test(x.name)).lignes.every(l => l[12].startsWith('AR-CVC-01_') || l[12].startsWith('ARCVC01_') || /^AR/.test(l[12])));
  // 7. Document Word : archive, une rubrique numérotée par section, tableaux et cases
  global.XLSX = require('../public/js/xlsx'); const Docx = require('../etudes/public/js/docx');
  const blocs = Docx.cahierBlocs(r.valeurs.cahierProg, { titre: 'Cahier de paramétrage — Wit REDY', affaire: 'Collège', indice: 'A', entetesDefaut: G.ENTETES_CAHIER });
  assert.ok(blocs.some(b => b.h3 === '2. Synthèse des entrées / sorties') && blocs.some(b => b.cases) && blocs.some(b => b.num) && blocs.some(b => b.table && b.table.entetes[0] === 'Nom du point'));
  const z = Buffer.from(Docx.build(blocs));
  assert.strictEqual(z.slice(0, 2).toString(), 'PK');
  assert.ok(z.includes(Buffer.from('word/document.xml')) && z.includes(Buffer.from('CH_G1_AUT')) && z.includes(Buffer.from('w:orient="landscape"')));
});
