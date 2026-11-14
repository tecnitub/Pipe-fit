// Liaisons effectives d'une étude fictive (ACME) : liaison automatique CTA ↔ schéma vue partout (circuits d'une note,
// fiches et consommateurs de l'installation, régulation, vannes du bilan électrique), matériel retenu des calculs annexes
// repris du registre, repères des unités extérieures DRV cohérents, schéma alimenté par un autre schéma (sous-station).
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Schema = require('../etudes/public/js/schema');
['cta', 'equilibrage', 'industriel', 'aeraulique-schema', 'sanitaire'].forEach(m => require(`../etudes/public/js/${m}`));
global.Terminaux = require('../etudes/public/js/terminaux');
global.Pieces = require('../etudes/public/js/pieces');
global.FicheCta = require('../etudes/public/js/fiche-cta');
global.FicheEquip = require('../etudes/public/js/fiche-equipement');
global.FicheAnnexes = require('../etudes/public/js/fiche-annexes');
require('../etudes/public/js/annexes-emetteurs');
require('../etudes/public/js/annexes-froid');
require('../etudes/public/js/annexes-air');
global.Registre = require('../etudes/public/js/registre');
const R = global.Registre;
const L = require('../etudes/public/js/liens');
const I = require('../etudes/public/js/installation');
const Rg = require('../etudes/public/js/regulation');
const E = require('../etudes/public/js/electricite');
const M = require('../etudes/public/js/metre');

let k = 0;
const note = (type, entrees = {}, titre = `${type} ACME`) => ({ id: `y${++k}`, type, titre, entrees: { ...N.defauts(type), ...entrees }, commentaire: '' });
const circ = (rep, emetteur = 'cta', x = {}) => ({ rep, emetteur, P: 10, regime: '', regulation: '3v', L: 30, ...x });

/* ---------- 1. Liaison automatique CTA ↔ schéma vue partout ---------- */
test('liaison automatique : circuits de la CTA, fiches et consommateurs de l\'installation, sans doublon', () => {
  const pc = note('pid', { reseau: 'ch-70-50', circuits: [circ('Radiateurs', 'radiateurs'), circ('CTA Exemplair')] }, 'Chaufferie ACME');
  const cta = note('cta', { froid: 'non' }, 'CTA Exemplair');
  const et = { notes: [pc, cta] };
  // Liaisons effectives : la liaison automatique, marquée ; aucune liaison saisie
  assert.deepStrictEqual(L.circuitsDeAnnexe(et.notes, cta).map(r => [r.pid.id, r.i, r.auto]), [[pc.id, 1, true]]);
  assert.deepStrictEqual(L.circuitsSaisis(et.notes, cta), []);
  assert.deepStrictEqual(L.annexesSchema(et, pc), ['', cta.id]);
  // Liaison saisie sur le même circuit : une seule liaison (pas de doublon)
  const etM = { notes: [{ ...pc, entrees: { ...pc.entrees, circuits: [pc.entrees.circuits[0], { ...pc.entrees.circuits[1], annexe: cta.id }] } }, cta] };
  assert.deepStrictEqual(L.circuitsDeAnnexe(etM.notes, cta).map(r => [r.i, !!r.auto]), [[1, false]]);
  // Fiches de l'installation vues depuis le schéma : la CTA reliée automatiquement y figure
  assert.ok(L.fichesInstallation(et, pc).some(x => x.note === cta.id && /CTA/.test(x.nature)));
  // Installation : batterie chaude raccordée une fois au circuit, pas de circuit « direct » en double
  const cs = I.consommateurs(et), bc = cs.find(c => c.cle === `${cta.id}:bc`);
  assert.strictEqual(bc.raccordements.filter(r => !r.incompatible).length, 1);
  assert.strictEqual(bc.raccordement.rep, 'CTA Exemplair');
  assert.ok(!cs.some(c => c.cle === `${pc.id}|1`), 'circuit de la CTA non compté comme circuit direct');
  assert.ok(!I.controles(et, cs).some(c => c.cle === `${cta.id}:bc` && /non raccordé|2 fois/.test(c.texte)));
});

test('liaison automatique : régulation et vannes des batteries du bilan électrique (pas de vanne en double)', () => {
  const pc = note('pid', { reseau: 'ch-70-50', circuits: [circ('CTA Exemplair')] }, 'Chaufferie ACME');
  const cta = note('cta', { froid: 'oui' }, 'CTA Exemplair');
  const et = { notes: [pc, cta] };
  const ctx = Rg.contexte(et, L), ic = ctx.installations.find(x => x.noteId === cta.id), ip = ctx.installations.find(x => x.noteId === pc.id);
  assert.ok(ic.af.some(t => /circuit « CTA Exemplair » de Chaufferie ACME \(liaison automatique\)/.test(t)));
  assert.deepStrictEqual(ic.donnees.alimentation, [{ rep: 'CTA Exemplair', schema: 'Chaufferie ACME', auto: true }]);
  assert.ok(ip.af.some(t => /Circuit « CTA Exemplair » : alimente les batteries de la CTA CTA Exemplair \(liaison automatique\)/.test(t)));
  // Contexte de régulation des armoires (résolution d'une note « elec ») : liaison vue aussi
  const el = note('elec');
  const r = L.resoudre({ notes: [pc, cta, el] }, el).entrees._regulation;
  assert.ok(r.installations.find(x => x.noteId === cta.id).af.some(t => /liaison automatique/.test(t)));
  // Bilan électrique : la batterie chaude est réglée par la vanne du circuit (V1), pas de VBC ; la froide garde sa vanne
  const eqs = E.equipementsEtude(et, L);
  assert.ok(eqs.some(q => q.rep === 'V1' && /CTA Exemplair/.test(q.designation)));
  assert.ok(!eqs.some(q => /^VBC-/.test(q.rep)), 'pas de vanne de batterie chaude en double');
  assert.strictEqual(eqs.filter(q => /^VBF-/.test(q.rep)).length, 1);
  // Sans schéma : les deux vannes de batterie
  const seul = E.equipementsEtude({ notes: [cta] }, L);
  assert.deepStrictEqual(seul.filter(q => /^VB[CF]-/.test(q.rep)).map(q => q.rep.slice(0, 3)), ['VBC', 'VBF']);
});

/* ---------- 2. Matériel retenu des calculs annexes depuis le registre ---------- */
test('registre : matériel retenu des lignes « annexe|<type>|<repère> » et ligne par modèle de radiateur', () => {
  const drv = note('drv', { repUE: 'UE1', uis: [{ rep: 'A', Pfr: 10 }] }, 'DRV ACME');
  const pk = note('parking', {}, 'Parking ACME');
  const rad = note('radiateurs', { locaux: [{ local: 'Bureau', P: 1.5, nb: 1 }, { local: 'Salle', P: 2.5, nb: 1 }] }, 'Radiateurs ACME');
  const et = { notes: [drv, pk, rad], equipements: [] };
  const ue = R.ajouter(et, { type: 'drvUE', fabricant: 'Exemplair', reference: 'UE-28', valeurs: { Pfr: 28, Pch: 31.5, Pel: 7 } });
  const ex = R.ajouter(et, { type: 'extracteur', fabricant: 'ACME', reference: 'EXT-3000', valeurs: { Qair: 3000 } });
  const rd = R.ajouter(et, { type: 'radiateur', fabricant: 'Exemplair', reference: 'R22-600', valeurs: { P50: 1900, Hmm: 600 } });
  drv.entrees.eq = ue.id; pk.entrees.eq = ex.id; rad.entrees.eq = rd.id;
  R.propager(et);
  et.materiel = { 'annexe|parking|EXT-PK': { fabricant: 'Autre', reference: 'Déjà choisi' } };
  const postes = M.metre(et);
  const pUE = postes.find(p => p.cle === 'annexe|drv|UE1');
  assert.ok(pUE && pUE.modele, 'poste de l\'unité extérieure marqué « modele »');
  assert.ok(!postes.find(p => p.cle === 'annexe|drv|UI-UE1').modele);
  assert.ok(R.versMateriel(et, postes) >= 2);
  assert.deepStrictEqual([et.materiel['annexe|drv|UE1'].fabricant, et.materiel['annexe|drv|UE1'].reference], ['Exemplair', 'UE-28']);
  assert.strictEqual(et.materiel['annexe|drv|UI-UE1'], undefined, 'unités intérieures : pas le modèle de l\'UE');
  assert.strictEqual(et.materiel['annexe|parking|EXT-PK'].reference, 'Déjà choisi', 'choix déjà fait jamais écrasé');
  // Radiateurs : une ligne par modèle, quantité = radiateurs du modèle calculés
  const nbFab = N.calculer('radiateurs', L.resoudre(et, rad).entrees).valeurs.nbFab, lr = et.materiel[`reg|${rd.id}`];
  assert.ok(nbFab >= 2);
  assert.deepStrictEqual([lr.libre, lr.chapitre, lr.qte, lr.fabricant, lr.reference], [true, 'Émetteurs', nbFab, 'Exemplair', 'R22-600']);
  assert.strictEqual(R.versMateriel(et, postes), 0, 'stable');
  // Ligne validée sans référence : jamais remplie
  const et2 = { notes: [drv], equipements: et.equipements, materiel: { 'annexe|drv|UE1': { statut: 'Validé' } } };
  R.versMateriel(et2, M.metre(et2));
  assert.strictEqual(et2.materiel['annexe|drv|UE1'].reference, undefined);
  // La désignation du métré cite le matériel retenu
  assert.match(M.metre(et).find(p => p.cle === 'annexe|drv|UE1').designation, /— Exemplair UE-28$/);
});

/* ---------- 3. Repères des unités extérieures DRV ---------- */
test('DRV : même repère d\'UE → mêmes repères numérotés dans l\'armoire, le métré et les fluides', () => {
  const d1 = note('drv', { repUE: 'UE1', chargeUsine: 8, PelUE: 7, uis: [{ rep: 'A', Pfr: 10 }] }, 'DRV ACME A');
  const d2 = note('drv', { repUE: 'UE1', chargeUsine: 6, PelUE: 6, uis: [{ rep: 'B', Pfr: 8 }] }, 'DRV ACME B');
  const d3 = note('drv', { repUE: 'UE2', chargeUsine: 5, PelUE: 5, uis: [{ rep: 'C', Pfr: 8 }] }, 'DRV ACME C');
  const f = note('fluides');
  const et = { notes: [d1, d2, d3, f] };
  const AF = require('../etudes/public/js/annexes-froid');
  assert.deepStrictEqual([d1, d2, d3].map(n => AF.repereUE(et, n)), ['UE1-N1', 'UE1-N2', 'UE2']);
  const attendu = ['UE1-N1', 'UE1-N2', 'UE2'];
  // Fluides
  assert.deepStrictEqual(L.resoudre(et, f).entrees.equipements.map(x => x.rep), attendu);
  // Armoire (bilan électrique) : lignes des unités extérieures et passerelles
  const eqs = E.equipementsEtude(et, L), ues = eqs.filter(q => q.type === 'split').map(q => q.rep);
  assert.deepStrictEqual(ues, attendu);
  assert.deepStrictEqual(eqs.filter(q => /^GW-/.test(q.rep)).map(q => q.rep), attendu.map(r => `GW-${r}`));
  // Métré : une ligne par unité extérieure, sans suffixe supplémentaire
  const cles = M.metre(et).map(p => p.cle).filter(c => /^annexe\|drv\|UE/.test(c));
  assert.deepStrictEqual(cles.sort(), attendu.map(r => `annexe|drv|${r}`).sort());
  // Régulation : analyse fonctionnelle au même repère
  const ctx = Rg.contexte(et, L);
  assert.ok(ctx.installations.find(x => x.noteId === d2.id).af.some(t => /DRV UE1-N2/.test(t)));
  // Résumé du calcul et alerte
  const r2 = L.resoudre(et, d2);
  assert.strictEqual(N.calculer('drv', r2.entrees).valeurs.repUE, 'UE1-N2');
  assert.ok(r2.alertes.some(a => /UE1-N1, UE1-N2/.test(a.texte) && /celle-ci : UE1-N2/.test(a.texte)));
  // Repères distincts : inchangés partout
  d2.entrees.repUE = 'UE3';
  assert.deepStrictEqual(E.equipementsEtude(et, L).filter(q => q.type === 'split').map(q => q.rep), ['UE1', 'UE3', 'UE2']);
  assert.deepStrictEqual(M.metre(et).map(p => p.cle).filter(c => /^annexe\|drv\|UE/.test(c)).sort(), ['annexe|drv|UE1', 'annexe|drv|UE2', 'annexe|drv|UE3']);
  assert.deepStrictEqual(L.resoudre(et, f).entrees.equipements.map(x => x.rep), ['UE1', 'UE3', 'UE2']);
});

/* ---------- 4. Schéma alimenté par un autre schéma ---------- */
test('sous-station et boucle secondaire : nature et régime imposés par l\'amont (liaison CTA, bâtiment, terminaux)', () => {
  // Production d'eau glacée → sous-station (échangeur, régime secondaire saisi par erreur en eau chaude) et boucle secondaire
  const gf = note('pid', { reseau: 'eg-7-12', generateur: 'gf-air', circuits: [] }, 'Production froid ACME');
  const ss = note('pid', { reseau: 'ch-70-50', generateur: 'echangeur', circuits: [circ('CTA froid')] }, 'Sous-station ACME');
  const bs = note('pid', { reseau: 'ch-70-50', circuits: [circ('Ventilos', 'ventilo')] }, 'Boucle ACME');
  gf.entrees.circuits = [circ('Départ SS', 'sousstation', { annexe: ss.id }), circ('Départ boucle', 'sousstation', { annexe: bs.id })];
  const cta = note('cta', { froid: 'froide' }, 'CTA froide ACME');
  const et = { notes: [gf, ss, bs, cta] };
  // Régime effectif
  assert.deepStrictEqual([...L.couvertParCircuit(et, ss)], ['bf']);
  assert.deepStrictEqual([...L.couvertParCircuit(et, bs)], ['bf']);
  const rb = L.regimeSchema(et.notes, bs).e;
  assert.deepStrictEqual([rb.reseau, rb.Tdep, rb.Tret], ['perso', 7, 12]);
  assert.strictEqual(L.regimeSchema(et.notes, ss).e.regimePrim, '7/12');
  // Liaison automatique : la batterie froide va sur le circuit de la sous-station (eau glacée par l'amont)
  assert.deepStrictEqual(L.liaisonsAutoCta(et).liens.map(l => [l.pid.id, l.bats.join('+')]), [[ss.id, 'bf']]);
  // Puissance du circuit : celle de la batterie froide
  const vC = L.calculer(et, cta).valeurs;
  assert.strictEqual(L.resoudre(et, ss).entrees.circuits[0].P, Math.round(vC.Pfroid * 10) / 10);
  // Bâtiment rattaché à la boucle : besoin de froid desservi, pas de chaud
  const bat = note('batiment', { mode: 'froid', nom: 'Bâtiment ACME' });
  et.notes.push(bat);
  const r = L.productionDepuisBatiment(et, bat, (() => { let n = 0; return () => `p${++n}`; })(), { pid: bs.id });
  assert.deepStrictEqual(r.completees.map(p => p.id), [bs.id]);
  assert.strictEqual(r.nouvelles.length, 0);
  assert.deepStrictEqual(r.circuits.map(c => c.rep), ['Bâtiment ACME — climatisation']);
  // Bâtiment en chauffage sur la même boucle : nouvelle production, régime effectif cité
  const batC = note('batiment', { mode: 'chaud', nom: 'Bâtiment chaud ACME' });
  et.notes.push(batC);
  const rC = L.productionDepuisBatiment(et, batC, () => 'pc1', { pid: bs.id });
  assert.strictEqual(rC.nouvelles.length, 1);
  assert.ok(rC.alertes.some(a => /régime « 7\/12 °C »/.test(a.texte)));
  // Terminaux reliés à la boucle : régime d'eau glacée imposé repris
  const t = note('terminaux', { prodFroid: bs.id, appareils: [] });
  et.notes.push(t);
  const rt = L.resoudre(et, t).entrees;
  assert.deepStrictEqual([rt.TfAller, rt.TfRetour], [7, 12]);
  // Installation : la sous-station est un consommateur d'eau glacée du circuit amont
  const cs = I.consommateurs(et).find(c => c.cle === `${ss.id}:schema`);
  assert.strictEqual(cs.saison, 'froid');
  assert.ok(!cs.raccordements[0].incompatible);
});
