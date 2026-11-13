// Import du dossier de consultation (DCE) : décompression d'une archive zip (noms CP437 / UTF-8, sous-dossiers, zip dans
// le zip, entrées compressées), tri des pièces par nature et par lot, questions au maître d'œuvre tirées des écarts.
// Jeux d'essai fictifs.
const { test } = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
global.XLSX = require('../public/js/xlsx');
const D = require('../public/js/dce');
const I = require('../public/js/inventaire-cvc');
const Docx = require('../etudes/public/js/docx');
const GuideEtude = require('../etudes/public/js/guide-etude');

const enc = s => new TextEncoder().encode(s);
// « N°04 » en CP437 (° = F8), comme dans les archives faites par l'explorateur de Windows
const cp437 = s => Uint8Array.from([...s].map(c => (c === '°' ? 0xf8 : c === 'é' ? 0x82 : c.charCodeAt(0))));

// Archive à entrées compressées (« deflate »), comme la plupart des zip reçus : en-têtes écrits à la main
function zipDeflate(entrees) {
  const parts = [], central = [];
  let offset = 0;
  const crc32 = b => { let c = ~0; for (const o of b) { c ^= o; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; } return ~c >>> 0; };
  for (const e of entrees) {
    const nom = enc(e.name), data = e.data instanceof Uint8Array ? e.data : enc(e.data), comp = zlib.deflateRawSync(data), crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nom.length, 26);
    parts.push(h, nom, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nom.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nom);
    offset += 30 + nom.length + comp.length;
  }
  const taille = central.reduce((t, p) => t + p.length, 0), fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entrees.length, 8); fin.writeUInt16LE(entrees.length, 10); fin.writeUInt32LE(taille, 12); fin.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, ...central, fin]));
}

test('décompression : noms CP437 et UTF-8, sous-dossiers, zip dans le zip, entrées compressées, fichiers système ignorés', async () => {
  const interne = XLSX.zip([{ name: 'Lot 02 Gros oeuvre/CCTP lot 02.pdf', data: '%PDF-1.4 fictif' }, { name: 'DPGF lot 02.xls', data: enc('xls fictif') }]);
  const dce = XLSX.zip([
    { name: 'CCTP N°04.pdf', nomOctets: cp437('CCTP N°04.pdf'), data: '%PDF-1.4 cctp' },
    { name: 'Pièces écrites/DPGF lot 04.xlsx', data: enc('classeur') },
    { name: 'Autres lots.zip', data: interne },
    { name: '__MACOSX/._CCTP.pdf', data: 'x' },
    { name: 'Plans/', data: '' },
    { name: 'Plans/Thumbs.db', data: 'x' }]);
  const p = await D.decompresser(dce);
  assert.deepStrictEqual(p.map(x => x.chemin), ['CCTP N°04.pdf', 'Pièces écrites/DPGF lot 04.xlsx', 'Autres lots/Lot 02 Gros oeuvre/CCTP lot 02.pdf', 'Autres lots/DPGF lot 02.xls']);
  assert.deepStrictEqual(p.map(x => x.nom), ['CCTP N°04.pdf', 'DPGF lot 04.xlsx', 'CCTP lot 02.pdf', 'DPGF lot 02.xls']);
  assert.strictEqual(p[1].dossier, 'Pièces écrites');
  assert.strictEqual(new TextDecoder().decode(p[0].data), '%PDF-1.4 cctp');
  assert.strictEqual(p[3].taille, 10);
  // Entrées « deflate » (DecompressionStream)
  const z = zipDeflate([{ name: 'DCE/CCTP CVC.pdf', data: 'texte '.repeat(500) }, { name: 'DCE/DQE.csv', data: 'Désignation;Qté;P.U.\nChaudière;1;\n' }]);
  const q = await D.decompresser(z);
  assert.deepStrictEqual(q.map(x => [x.nom, x.taille]), [['CCTP CVC.pdf', 3000], ['DQE.csv', 37]]);
  assert.match(new TextDecoder().decode(q[1].data), /^Désignation;Qté/);
  await assert.rejects(D.decompresser(enc('pas une archive')), /archive zip/);
});

test('lot lu dans le nom : numéro, intitulé, CVC ou non', () => {
  assert.deepStrictEqual(D.lotDe('LOT_N_05._PLOMBERIE_-_SANITAIRES.zip'), { numero: '5', intitule: 'plomberie - sanitaires', cvc: true });
  assert.strictEqual(D.lotDe('DPGFLOT N°21. CVC.xls').numero, '21');
  assert.strictEqual(D.lotDe('Lot 07 - Génie climatique/CCTP.pdf').cvc, true);
  assert.strictEqual(D.lotDe('LOT 02 GROS OEUVRE - CCTP.pdf').cvc, false);
  assert.strictEqual(D.lotDe('lot12 électricité courants forts').cvc, false);
  assert.strictEqual(D.lotDe('CCTP chauffage.pdf'), null);
});

test('tri des pièces par nom et par contenu ; lots hors CVC décochés ; DPGF Excel préféré au PDF', () => {
  const pieces = ['CCTP4 CHAUFFAGE VENTILATION.pdf', 'DPGF4 CHAUFFAGE VENTILATION.pdf', 'DPGFLOT N°04. CHAUFFAGE.xls', 'RC.pdf', 'CCAP.pdf', 'AE lot 04.pdf',
    'PPSPS entreprise.pdf', 'Plans/RDC chaufferie.dwg', 'Plans/PLAN R+1 VENTILATION.pdf', 'Liste des équipements.xlsx', 'Lot 03 Electricité/CCTP lot 03.pdf',
    'Lot 03 Electricité/DPGF lot 03.xls', 'Document 7.pdf', 'Tableau 2.xls', 'Classeur sans signe.xlsx', 'photo.jpg']
    .map(c => ({ chemin: c, nom: c.split('/').pop(), dossier: c.includes('/') ? c.slice(0, c.lastIndexOf('/')) : '', taille: 10 }));
  const textes = { 'Document 7.pdf': 'MAIRIE FICTIVE\nCAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES\nLot chauffage', 'Tableau 2.xls': 'N° Désignation U Qté P.U. HT Montant HT\n1.1 Chaudière gaz ens 1' };
  const t = D.trier(pieces, { textes, archive: 'LOT N°04 CHAUFFAGE VENTILATION.zip' });
  const v = nom => t.find(p => p.chemin === nom);
  const resume = nom => [v(nom).nature, v(nom).retenu];
  assert.deepStrictEqual(resume('CCTP4 CHAUFFAGE VENTILATION.pdf'), ['cctp', true]);
  assert.deepStrictEqual(resume('DPGFLOT N°04. CHAUFFAGE.xls'), ['dpgf', true]);
  assert.deepStrictEqual(resume('DPGF4 CHAUFFAGE VENTILATION.pdf'), ['dpgf', false]);
  assert.match(v('DPGF4 CHAUFFAGE VENTILATION.pdf').raison, /DPGF Excel retenu/);
  ['RC.pdf', 'CCAP.pdf', 'AE lot 04.pdf', 'PPSPS entreprise.pdf'].forEach(n => assert.deepStrictEqual(resume(n), ['admin', false], n));
  assert.deepStrictEqual(resume('Plans/RDC chaufferie.dwg'), ['plan', false]);
  assert.deepStrictEqual(resume('Plans/PLAN R+1 VENTILATION.pdf'), ['plan', false]);
  assert.deepStrictEqual(resume('Liste des équipements.xlsx'), ['annexe', true]);
  assert.deepStrictEqual(resume('Lot 03 Electricité/CCTP lot 03.pdf'), ['cctp', false]);
  assert.match(v('Lot 03 Electricité/DPGF lot 03.xls').raison, /lot 3 .*hors CVC/);
  assert.deepStrictEqual([v('Document 7.pdf').nature, v('Document 7.pdf').source], ['cctp', 'contenu']);
  assert.deepStrictEqual([v('Tableau 2.xls').nature, v('Tableau 2.xls').source], ['dpgf', 'contenu']);
  assert.deepStrictEqual(resume('Classeur sans signe.xlsx'), ['annexe', true]);
  assert.deepStrictEqual(resume('photo.jpg'), ['autre', false]);
  // Lot de l'archive hérité par les pièces sans lot ; retenues d'abord, CCTP puis DPGF puis annexes
  assert.strictEqual(v('CCTP4 CHAUFFAGE VENTILATION.pdf').lot.numero, '4');
  assert.deepStrictEqual(t.filter(p => p.retenu).map(p => p.nature), ['cctp', 'cctp', 'dpgf', 'dpgf', 'annexe', 'annexe']);
  // Deux DPGF Excel du même lot : les deux gardés ; DPGF PDF d'un autre lot que l'Excel : gardé
  const u = D.trier([{ nom: 'DPGF lot 04.pdf' }, { nom: 'DPGF lot 06 ventilation.xls' }]);
  assert.ok(u.every(p => p.retenu));
  // Le contenu corrige un classeur nommé « annexe » qui est un DPGF chiffré
  assert.strictEqual(D.classer({ nom: 'Annexe 2.xlsx' }, 'Désignation Quantité Prix unitaire Total HT').nature, 'dpgf');
  assert.strictEqual(D.classer({ nom: 'CCTP.docx' }).nature, 'cctp');
  assert.strictEqual(D.classer({ nom: 'DPGF.docx' }).nature, 'autre');
});

// Inventaire fictif : quatre écarts relevés par InventaireCVC.ecarts, une puissance en conflit, des caractéristiques manquantes
const inventaire = () => [
  { categorie: 'producteur', genre: 'chaudiere-gaz', designation: 'Chaudière gaz', principal: true, chapitre: 'Production de chaleur', qte: 1, P: 30, prescrit: 'marque FICTIVA type X', prescritDpgf: 'marque prévue au DPGF : AUTRA', sources: ['CCTP art. 3.1', 'DPGF 1.1'],
    conflits: [{ champ: 'P', libelle: 'Puissance chaud', unite: 'kW', cctp: 30, dpgf: 33, sourceCctp: 'CCTP art. 3.1', sourceDpgf: 'DPGF 1.1' }] },
  { categorie: 'emetteur', genre: 'cta', designation: 'CTA salle', principal: true, chapitre: 'Traitement d\'air', qte: 2, qteCctp: 3, sources: ['CCTP art. 4.2', 'DPGF 2.1'] },
  { categorie: 'emetteur', genre: 'radiateurs', designation: 'Radiateurs acier', chapitre: 'Production de chaleur', qte: 12, sources: ['CCTP art. 3.4'] },
  { categorie: 'producteur', genre: 'pac-air', designation: 'PAC air / eau', principal: true, chapitre: 'Production de chaleur', qte: 1, prescrit: 'marque FICTIVA', sources: ['DPGF 1.3'] },
  { categorie: 'auxiliaire', genre: 'pompe', designation: 'Circulateur', qte: 2, sources: ['CCTP art. 3.6', 'DPGF 1.6'] },
  { categorie: 'producteur', genre: 'pac-air', designation: 'Variante PAC', variante: true, qte: 1, sources: ['DPGF 9.1'] }];

test('questions au maître d\'œuvre : écarts, marque imposée, caractéristiques manquantes, regroupées par chapitre et numérotées', () => {
  const inv = inventaire(), e = I.ecarts(inv);
  assert.deepStrictEqual(e.map(x => x.type).sort(), ['absent-cctp', 'absent-dpgf', 'marque', 'quantite', 'valeur']);
  const qs = D.questions(e, inv);
  assert.deepStrictEqual(qs.map(q => q.n), qs.map((_, i) => i + 1));
  assert.deepStrictEqual([...new Set(qs.map(q => q.chapitre))], ['Production de chaleur', 'Traitement d\'air']);
  const t = qs.map(q => q.texte).join('\n');
  assert.match(t, /« Radiateurs acier » est décrit au CCTP \(art\. 3\.4\) mais n'est pas chiffré au DPGF : faut-il l'ajouter au DPGF, ou est-il fourni par un autre lot \?/);
  assert.match(t, /Puissance chaud de « Chaudière gaz » : 30 kW au CCTP \(art\. 3\.1\), 33 kW au DPGF \(1\.1\) : laquelle retenir \?/);
  assert.match(t, /Quantité de « CTA salle » : 3 au CCTP \(art\. 4\.2\), 2 au DPGF \(ligne 2\.1\)/);
  assert.match(t, /Marque de « Chaudière gaz » différente .* « ou équivalent »/);
  assert.match(t, /« PAC air \/ eau » est chiffré au DPGF \(ligne 1\.3\) mais n'est pas décrit au CCTP/);
  // Caractéristiques manquantes : régime de la chaudière, débit et puissance de la CTA ; pas de doublon pour la PAC non décrite
  assert.match(t, /« Chaudière gaz » : régime de température à préciser \(absent du dossier, nécessaire au dimensionnement\)/);
  assert.match(t, /« CTA salle » : débit d'air, puissance des batteries à préciser/);
  assert.ok(!/Variante/.test(t));
  assert.strictEqual(qs.filter(q => q.designation === 'PAC air / eau').length, 1);
  // Références des articles et lignes, choix proposés pour trancher
  const p = qs.find(q => q.type === 'valeur');
  assert.deepStrictEqual(p.refs, ['CCTP art. 3.1', 'DPGF 1.1']);
  assert.deepStrictEqual(p.choix.map(c => c.v), [30, 33]);
  // Marque imposée sans « ou équivalent »
  const m = D.questions([], [{ categorie: 'producteur', genre: 'chaudiere-gaz', designation: 'Chaudière', principal: true, P: 50, regime: '70/50', prescrit: 'marque FICTIVA type Z', sources: ['CCTP art. 2'] }]);
  assert.deepStrictEqual(m.map(q => q.type), ['marque-imposee']);
  assert.strictEqual(D.questions([], [{ categorie: 'producteur', genre: 'chaudiere-gaz', designation: 'Chaudière', P: 50, regime: '70/50', prescrit: 'marque FICTIVA ou équivalent' }]).length, 0);
  // Émetteurs sans puissance : une seule question
  const r = D.questions([], [1, 2, 3].map(i => ({ categorie: 'emetteur', genre: 'ventilo', designation: `Ventilo ${i}`, sources: [`CCTP art. 5.${i}`, `DPGF 5.${i}`] })));
  assert.strictEqual(r.length, 1);
  assert.match(r[0].texte, /Puissances unitaires non indiquées pour les émetteurs « Ventilo 1 », « Ventilo 2 », « Ventilo 3 »/);
});

test('questions : suivi mémorisé, réponse reportée dans l\'inventaire, texte pour un mail, document Word', () => {
  const inv = inventaire(), e = I.ecarts(inv);
  let qs = D.questions(e, inv);
  const p = qs.find(q => q.type === 'valeur'), q2 = qs.find(q => q.type === 'quantite');
  Object.assign(p, { posee: true, recue: true, reponse: 'Retenir 33 kW.', retenu: 33 });
  q2.posee = true;
  const ancien = [{ cle: 'absent-dpgf|ancienne|', texte: 'Écart levé depuis', posee: true, recue: true, reponse: 'Fourni par le lot 03' }];
  const suivi = D.suiviDe(qs, ancien);
  assert.deepStrictEqual(suivi.map(s => s.cle), [p.cle, q2.cle, 'absent-dpgf|ancienne|']);
  // Rechargé : le suivi revient sur les mêmes questions (clé stable)
  qs = D.avecSuivi(D.questions(e, inventaire()), JSON.parse(JSON.stringify(suivi)));
  assert.deepStrictEqual(qs.filter(q => q.posee).map(q => q.type), ['valeur', 'quantite']);
  assert.strictEqual(qs.find(q => q.type === 'valeur').reponse, 'Retenir 33 kW.');
  // Réponse qui tranche : puissance de la chaudière corrigée, conflit levé, plus de question de valeur
  assert.strictEqual(D.appliquerReponse(inv, p, 33), 1);
  assert.strictEqual(inv[0].P, 33);
  assert.strictEqual(inv[0].champs.P.source, 'Réponse du maître d\'œuvre');
  assert.ok(!I.ecarts(inv).some(x => x.type === 'valeur'));
  assert.strictEqual(D.appliquerReponse(inv, qs.find(q => q.type === 'absent-dpgf'), 1), 0, 'pas de valeur à reporter');
  D.appliquerReponse(inv, q2, 3);
  assert.deepStrictEqual([inv[1].qte, inv[1].qteCctp], [3, 3]);
  // Texte du mail : objet, chapitres, numéros, références
  const txt = D.questionsTexte(qs, { objet: 'Groupe scolaire fictif' });
  assert.match(txt, /^Objet : questions en période de consultation — Groupe scolaire fictif/);
  assert.match(txt, /PRODUCTION DE CHALEUR\n1\. /);
  assert.match(txt, /\[CCTP art\. 3\.1 ; DPGF 1\.1\]/);
  // Word : un tableau par chapitre, réponse reprise
  const blocs = D.questionsBlocs(qs, { affaire: 'Groupe scolaire fictif', date: '13/11/2026' });
  assert.deepStrictEqual(blocs.filter(b => b.h2).map(b => b.h2), ['Production de chaleur', 'Traitement d\'air']);
  assert.ok(blocs.some(b => b.table && b.table.lignes.some(l => l[3] === 'Retenir 33 kW.')));
  const docx = Docx.build(blocs);
  assert.ok(docx instanceof Uint8Array && docx.length > 1000);
  assert.ok(Buffer.from(docx).toString('utf8').includes('Groupe scolaire fictif'));
});

test('guide de l\'étude : étape « Questions au maître d\'œuvre » quand le module est chargé', () => {
  global.Dce = D;
  try {
    const et = { notes: [], inventaire: inventaire(), inventaireEcarts: I.ecarts(inventaire()) };
    const s = GuideEtude.restesAFaire(et).etapes.find(x => x.id === 'questions-moe');
    assert.ok(s && !s.fait);
    assert.deepStrictEqual(s.action, ['questions-moe', '❓ Préparer les questions']);
    et.questionsMoe = D.suiviDe(D.questions(et.inventaireEcarts, et.inventaire).map(q => ({ ...q, posee: true })));
    assert.ok(GuideEtude.restesAFaire(et).etapes.find(x => x.id === 'questions-moe').fait);
  } finally { delete global.Dce; }
});

test('documents du chantier (CRM) : catégorie DPGF, sigle collé au numéro de lot', () => {
  const C = require('../public/js/classement');
  assert.deepStrictEqual(['CCTP4 CHAUFFAGE.pdf', 'DPGF4 CHAUFFAGE.pdf', 'DQE lot 3.xlsx', 'Bordereau des prix.xls', 'Plan RDC.pdf'].map(C.categorieDevinee), ['CCTP', 'DPGF', 'DPGF', 'DPGF', 'Plan']);
  assert.ok(C.CATEGORIES.includes('DPGF'));
  assert.strictEqual(C.categorieDuDossier('dpgf'), 'DPGF');
});
