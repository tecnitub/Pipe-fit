// Fiches fabricant du matériel des calculs annexes (DRV, radiateur, échangeur à plaques, déshumidificateur, groupe de
// chambre froide, extracteur) : reconnaissance, lecture, destinations, proposition, report verrouillé dans le calcul
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
global.FichesTech = require('../public/js/fiches-tech');
const N = require('../etudes/public/js/notes');
global.Notes = N;
global.Terminaux = require('../etudes/public/js/terminaux');
global.Schema = require('../etudes/public/js/schema');
global.Pompes = require('../etudes/public/js/pompes');
global.Sanitaire = require('../etudes/public/js/sanitaire');
global.FicheCta = require('../etudes/public/js/fiche-cta');
global.FicheEquip = require('../etudes/public/js/fiche-equipement');
global.FicheAnnexes = require('../etudes/public/js/fiche-annexes');
require('../etudes/public/js/cta');
global.SchemaAir = require('../etudes/public/js/aeraulique-schema');
require('../etudes/public/js/annexes-emetteurs');
require('../etudes/public/js/annexes-froid');
require('../etudes/public/js/annexes-air');
global.Registre = require('../etudes/public/js/registre');
const R = global.Registre;
const L = require('../etudes/public/js/liens');
const V = require('../etudes/public/js/vrac');
const FA = global.FicheAnnexes;

const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'MODELE-FICHE-TECHNIQUE.md'), 'utf8');
const fiche = t => new RegExp(`<!-- fiche: ${t} -->\\s*\`\`\`text\\n([\\s\\S]*?)\`\`\``).exec(doc)[1].trim().split('\n');
const TYPES = ['drvUE', 'radiateur', 'echangeur', 'deshu', 'groupeFroid', 'extracteur'];
let k = 0;
const note = (type, extra = {}) => ({ id: `n${++k}`, type, titre: N.TYPES[type].titre, entrees: { ...N.defauts(type), ...extra }, commentaire: '' });
const item = (t, o = {}) => { const lignes = fiche(t), type = V.classer(lignes); return { nom: `${t}.txt`, lignes, type, lu: V.lire(type, lignes), qte: 1, ...o }; };

test('chaque modèle de fiche annexe est reconnu, avec ou sans la ligne « Type : », et lu', () => {
  TYPES.forEach(t => {
    assert.strictEqual(V.classer(fiche(t)), t, t);
    assert.strictEqual(V.classer(fiche(t).filter(l => !/^Type/.test(l))), t, `${t} sans Type`);
    const lu = V.lire(t, fiche(t));
    assert.strictEqual(lu.fabricant, 'Exemplair', t);
    assert.ok(lu.nb >= 3 && lu.resume, t);
  });
  // Les fiches existantes restent reconnues comme avant (radiateur d'une ligne de terminaux, générateur, CTA)
  assert.strictEqual(V.classer(['Type : Terminal (radiateur)', 'Puissance chaud : 1,2 kW']), 'terminal');
  ['cta', 'pompe', 'terminal', 'generateur', 'vase', 'ecs', 'bouche', 'robinet', 'sanitaire'].forEach(t => assert.strictEqual(V.classer(fiche(t)), t, t));
  assert.strictEqual(V.classer(['Notice'], 'Tourelle extraction TX.pdf'), 'extracteur');
  assert.strictEqual(V.classer(['Type : Unité extérieure VRF']), 'drvUE');
  assert.strictEqual(V.classer(['Type : Groupe de condensation pour chambre froide']), 'groupeFroid');
});

test('lecture : valeurs, unités converties, fluide normalisé', () => {
  assert.deepStrictEqual(V.lire('drvUE', fiche('drvUE')).valeurs, { Pfr: 28, Pch: 31.5, EER: 3.9, COP: 4.2, Pel: 7.2, fluide: 'R32', charge: 9.5, Lpre: 30, nUImax: 32 });
  assert.deepStrictEqual(V.lire('radiateur', fiche('radiateur')).valeurs, { P50: 1900, nExp: 1.32, Hmm: 600, Lmm: 1200, Veau: 6.8 });
  assert.deepStrictEqual(V.lire('echangeur', fiche('echangeur')).valeurs, { P: 250, dp1: 18, dp2: 22, Sech: 4.6, nPlaques: 45 });
  assert.deepStrictEqual(V.lire('deshu', fiche('deshu')).valeurs, { mDeshu: 32, Qair: 9000, Pel: 11 });
  assert.deepStrictEqual(V.lire('groupeFroid', fiche('groupeFroid')).valeurs, { Tevap: -10, Pfr: 5.2, Pabs: 2.4, fluide: 'R449A', charge: 3.2 });
  assert.deepStrictEqual(V.lire('extracteur', fiche('extracteur')).valeurs, { Qair: 2500, pDispo: 250, Pel: 0.75, tension: 'tri' });
  const x = FA.lire('extracteur', ['Fabricant : Exemplair', 'Débit : 500 l/s', 'Puissance absorbée : 750 W', 'Alimentation : 230 V mono']).valeurs;
  assert.deepStrictEqual(x, { Qair: 1800, Pel: 0.75, tension: 'mono' });
  assert.deepStrictEqual(['R-410A', 'R1234ze(E)', 'propane', 'R999'].map(FA.fluide), ['R410A', 'R1234ze', 'R290', undefined]);
  assert.deepStrictEqual(FA.lire('echangeur', ['Perte de charge primaire : 1,5 mCE']).valeurs, { dp1: 14.715 });
});

test('destinations : calculs annexes de l\'étude et nouveau calcul', () => {
  const drv = note('drv'), hotte = note('hotte'), parking = note('parking'), et = { notes: [drv, hotte, parking] };
  assert.deepStrictEqual(V.destinations(et, 'drvUE').map(d => d[0]), [`drv:${drv.id}`, 'drv:nouveau']);
  assert.deepStrictEqual(V.destinations(et, 'extracteur').map(d => d[0]), [`hotte:${hotte.id}`, 'hotte:nouveau', `parking:${parking.id}`, 'parking:nouveau']);
  assert.deepStrictEqual(V.destinations({ notes: [] }, 'radiateur').map(d => d[0]), ['radiateurs:nouveau']);
  ['echangeur', 'deshu', 'groupeFroid'].forEach(t => assert.strictEqual(V.destinations({ notes: [] }, t).length, 1, t));
});

test('proposition : puissance ou débit le plus proche, calcul encore libre', () => {
  const d1 = note('drv', { PfrUE: 56 }), d2 = note('drv', { PfrUE: 28 }), et = { notes: [d1, d2] };
  assert.strictEqual(V.proposer(et, 'drvUE', V.lire('drvUE', fiche('drvUE'))), `drv:${d2.id}`);
  assert.strictEqual(V.proposer(et, 'drvUE', V.lire('drvUE', fiche('drvUE')), new Set([`drv:${d2.id}`])), `drv:${d1.id}`);
  // Extracteur : hotte (1 900 m³/h extraits) plutôt que parking (30 000 m³/h par extracteur)
  const h = note('hotte'), p = note('parking'), et2 = { notes: [p, h] };
  assert.strictEqual(V.proposer(et2, 'extracteur', V.lire('extracteur', fiche('extracteur'))), `hotte:${h.id}`);
  assert.strictEqual(V.proposer(et2, 'extracteur', { valeurs: { Qair: 28000 } }), `parking:${p.id}`);
  assert.strictEqual(V.proposer({ notes: [] }, 'deshu', V.lire('deshu', fiche('deshu'))), 'piscine:nouveau');
});

test('report dans les calculs : valeurs du registre, champs verrouillés, contrôles', () => {
  const drv = note('drv', { liquide: [{ d: '9.52', L: 50, gpm: 60 }] }), ch = note('chambreFroide'), pk = note('parking'), et = { notes: [drv, ch, pk] }, nn = t => note(t);
  assert.match(V.appliquer(et, item('drvUE'), `drv:${drv.id}`, nn), /Exemplair VRX-280/);
  assert.deepStrictEqual([drv.entrees.PfrUE, drv.entrees.PchUE, drv.entrees.PelUE, drv.entrees.fluide, drv.entrees.chargeUsine, drv.entrees.Lprecharge, drv.entrees.nUImax], [28, 31.5, 7.2, 'R32', 9.5, 30, 32]);
  assert.strictEqual(drv.entrees.fiche.reference, 'VRX-280');
  const ver = L.resoudre(et, drv).verrous;
  ['PfrUE', 'fluide', 'chargeUsine', 'Lprecharge', 'nUImax'].forEach(c => assert.match(ver[c], /Registre des équipements — Exemplair VRX-280/, c));
  const r = N.calculer('drv', L.resoudre(et, drv).entrees);
  assert.strictEqual(Math.round(r.valeurs.chargeComp * 1000) / 1000, 1.2); // 20 m au-delà des 30 m préchargés × 60 g/m
  assert.ok(r.resume.some(([l, v]) => /Matériel/.test(l) && /VRX-280/.test(v)));

  V.appliquer(et, item('groupeFroid'), `chambreFroide:${ch.id}`, nn);
  assert.deepStrictEqual([ch.entrees.PfrGroupe, ch.entrees.TevapFab, ch.entrees.Pgroupe, ch.entrees.fluide, ch.entrees.charge], [5.2, -10, 2.4, 'R449A', 3.2]);
  const rc = N.calculer('chambreFroide', ch.entrees);
  assert.ok(rc.alertes.some(a => /Groupe retenu : 5,20 kW frigorifiques à -10 °C/.test(a.texte)));
  assert.strictEqual(rc.valeurs.Pcomp, 2.4);

  V.appliquer(et, item('extracteur'), `parking:${pk.id}`, nn);
  assert.deepStrictEqual([pk.entrees.QextFab, pk.entrees.dp, pk.entrees.PextFab, pk.entrees.tensionExt], [2500, 250, 0.75, 'tri']);
  const rp = N.calculer('parking', pk.entrees);
  assert.ok(rp.alertes.some(a => a.niveau === 'erreur' && /Extracteur retenu : 2\s?500 m³\/h/.test(a.texte)));
  assert.strictEqual(rp.valeurs.Pext, 0.75);
  assert.strictEqual(N.TYPES.parking.versElec(rp.valeurs, pk.entrees)[0].P, 0.75);

  // Nouveaux calculs : radiateurs, échangeur, piscine, hotte
  ['radiateur', 'echangeur', 'deshu'].forEach(t => V.appliquer(et, item(t), `${FA.CALCULS[t][0]}:nouveau`, nn));
  V.appliquer(et, item('extracteur'), 'hotte:nouveau', nn);
  const de = t => et.notes.find(n => n.type === t);
  assert.match(de('radiateurs').titre, /— Exemplair RP 22-600-1200$/);
  assert.deepStrictEqual([de('radiateurs').entrees.n, de('radiateurs').entrees.P50fab, de('radiateurs').entrees.Vfab], [1.32, 1900, 6.8]);
  assert.deepStrictEqual([de('echangeurPlaques').entrees.Pfab, de('echangeurPlaques').entrees.dp1, de('echangeurPlaques').entrees.dp2, de('echangeurPlaques').entrees.Afab, de('echangeurPlaques').entrees.nPlaques], [250, 18, 22, 4.6, 45]);
  assert.deepStrictEqual([de('piscine').entrees.mFab, de('piscine').entrees.Qfab, de('piscine').entrees.PelFab], [32, 9000, 11]);
  assert.deepStrictEqual([de('hotte').entrees.QextFab, de('hotte').entrees.dpE, de('hotte').entrees.PextFab], [2500, 250, 0.75]);
  const rr = N.calculer('radiateurs', { ...de('radiateurs').entrees, locaux: [{ local: 'Bureau', P: 2, nb: 1 }] });
  assert.strictEqual(rr.valeurs.nbFab, 2);
  assert.ok(rr.tableaux.some(t => /Modèle retenu/.test(t.titre)));
  assert.ok(N.calculer('piscine', de('piscine').entrees).alertes.some(a => /Centrale retenue : 32,0 kg\/h/.test(a.texte)));
  assert.ok(N.calculer('echangeurPlaques', de('echangeurPlaques').entrees).alertes.some(a => a.niveau === 'ok' && /Échangeur retenu : 250,0 kW/.test(a.texte)));
});

test('registre : correction propagée, études existantes reprises, détachement', () => {
  const drv = note('drv'), et = { notes: [drv] };
  V.appliquer(et, item('drvUE'), `drv:${drv.id}`, t => note(t));
  const x = et.equipements[0];
  assert.strictEqual(x.type, 'drvUE');
  x.valeurs.Pfr = 33.5;
  assert.ok(R.propager(et) > 0);
  assert.strictEqual(drv.entrees.PfrUE, 33.5);
  // Étude faite avant le registre : fiche gardée avec le calcul, modèle inscrit au registre
  const h = note('hotte', { QextFab: 2000, PextFab: 0.5, fiche: { nom: 'f', fabricant: 'Exemplair', reference: 'TX-2000' } }), et2 = { notes: [h] };
  assert.strictEqual(R.collecter(et2), 1);
  assert.deepStrictEqual([et2.equipements[0].type, et2.equipements[0].valeurs], ['extracteur', { Qair: 2000, pDispo: 500, Pel: 0.5 }]);
  const p = R.emplacements(et2)[0];
  R.detacher(p);
  assert.deepStrictEqual(R.verrous(et2, h), {});
  assert.ok(R.libelles().P50 && R.libelles().mDeshu);
});
