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
  assert.match(boucle[2], /^TD1 EA/); assert.match(boucle[3], /^V1 SA/); assert.match(boucle[4], /départ à -10 °C extérieur 70 °C/); assert.match(boucle[4], /PI : bande 20 K/);
  assert.ok(t(/Commandes des moteurs/).some(l => l[0] === 'PP1' && /STOR/.test(l[3]) && /retour de marche/.test(l[4])));
  assert.ok(t(/Horloges/).length >= 1 && t(/Sécurités et asservissements/).some(l => l[0] === 'HG') && t(/Sécurités et asservissements/).some(l => l[0] === 'KA1'));
  assert.ok(t(/Alarmes/).some(l => /P1 \(sécurité\), temporisation 0 s/.test(l[4])));
  assert.ok(t(/Entrées \/ sorties/).every(l => l[2] || l[3]));
  const f = r.valeurs.feuilles.find(x => x.name === 'Programmation AR-CVC-01');
  assert.ok(f && f.lignes.length > 30 && f.entetes[0] === 'Rubrique');
});
