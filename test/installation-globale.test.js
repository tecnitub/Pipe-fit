// Installation hydraulique globale : imbrication des schémas de principe (chaufferie → circuit → sous-station → circuit
// → réseau arborescent), puissance qui remonte, régime et pression qui redescendent, boucles de liens, calcul global
// des pompes boucle par boucle.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/schema'); require('../etudes/public/js/cta'); require('../etudes/public/js/equilibrage'); require('../etudes/public/js/industriel');
require('../etudes/public/js/aeraulique-schema'); require('../etudes/public/js/terminaux'); require('../etudes/public/js/electricite');
global.Notes = N;
const Sc = require('../etudes/public/js/schema');
const L = require('../etudes/public/js/liens');
const I = require('../etudes/public/js/installation');

let k = 0;
const nn = (t, titre, x = {}) => ({ id: `g${++k}`, type: t, titre, entrees: { ...N.defauts(t), ...x } });
// Chaufferie 80/60 → circuit « SST B » → sous-station B (échangeur, secondaire 70/50) → circuit « Réseau B » → réseau
// arborescent (émetteurs par défaut, 175 kW) ; la sous-station a aussi un circuit CTA de 40 kW
const installation = () => {
  const arbo = nn('arbo', 'Réseau B');
  const sst = nn('pid', 'Sous-station B', { generateur: 'echangeur', nGen: '1', Pgen: 300, reseau: 'ch-70-50', bouteille: 'oui',
    circuits: [{ rep: 'Réseau B', emetteur: 'radiateurs', P: 1, regulation: '3v', L: 0, annexe: arbo.id }, { rep: 'CTA', emetteur: 'cta', P: 40, regulation: '3v', L: 30 }] });
  const ch = nn('pid', 'Chaufferie', { reseau: 'ch-80-60', generateur: 'chaudiere-cond', nGen: '2', Pgen: 200, bouteille: 'oui',
    circuits: [{ rep: 'SST B', emetteur: 'radiateurs', P: 5, regulation: 'direct', L: 100, annexe: sst.id }, { rep: 'Radiateurs', emetteur: 'radiateurs', P: 50, regulation: '3v', L: 40 }] });
  return { et: { notes: [ch, sst, arbo] }, ch, sst, arbo };
};

test('imbrication sur 3 niveaux : la puissance remonte jusqu\'à la chaufferie, régime et pression redescendent', () => {
  const { et, ch, sst, arbo } = installation();
  const Ptot = N.calculer('arbo', L.resoudre(et, arbo).entrees).valeurs.Ptot;
  assert.strictEqual(Math.round(Ptot), 175);
  // Sous-station : régime primaire et fluide repris du circuit amont, pression disponible calculée
  const rs = L.resoudre(et, sst);
  assert.strictEqual(rs.entrees.regimePrim, '80/60');
  assert.strictEqual(rs.entrees.fluidePrim, 'eau');
  assert.match(rs.verrous.regimePrim, /Chaufferie \(circuit SST B\)/);
  assert.strictEqual(rs.entrees.dpDispo, 45);
  assert.match(L.description(et, sst), /Alimenté par le circuit « SST B »/);
  // Réseau arborescent : régime du circuit de la sous-station (70/50 → 60 °C, ΔT 20 K)
  const ra = L.resoudre(et, arbo).entrees;
  assert.strictEqual(ra.T, 60); assert.strictEqual(ra.dT, 20);
  // Chaufferie : le circuit reprend la puissance appelée par la sous-station (réseau 175 + CTA 40) et ses pertes de charge
  const rc = L.resoudre(et, ch), c0 = rc.entrees.circuits[0];
  assert.strictEqual(c0.P, 215); assert.strictEqual(c0.emetteur, 'sousstation');
  assert.strictEqual(c0.dpAnnexe, 45);
  assert.ok(rc.verrous['circuits.0.P']);
  const v = N.calculer('pid', rc.entrees).valeurs;
  assert.strictEqual(Math.round(v.Pdem), 265);
  // Simultanéité de la sous-station : la puissance appelée au circuit amont en tient compte
  sst.entrees.foisonnement = 80;
  assert.strictEqual(L.resoudre(et, ch).entrees.circuits[0].P, 172);
  // Pompe retenue sur le circuit amont : pression disponible = hauteur au débit − pertes de charge propres du circuit
  ch.entrees.pompesFab = [{ circuit: 'SST B', ref: 'P-petite', courbe: '0:4 ; 10:3 ; 20:1' }];
  const dispo = L.resoudre(et, sst).entrees.dpDispo;
  assert.ok(dispo < 45, `disponible ${dispo}`);
  assert.ok(L.calculer(et, sst).alertes.some(a => a.niveau === 'erreur' && /Pression disponible au raccordement/.test(a.texte)));
  // Raccordement direct (sans échangeur) : le schéma aval prend le régime du départ
  const boucle = nn('pid', 'Boucle secondaire', { generateur: 'chaudiere-cond', reseau: 'ch-45-35', bouteille: 'oui', circuits: [{ rep: 'Plancher', emetteur: 'plancher', P: 20, regime: '35/30', regulation: '3v', L: 20 }] });
  et.notes.push(boucle);
  ch.entrees.circuits.push({ rep: 'Boucle', emetteur: 'radiateurs', P: '', regulation: 'direct', L: 10, annexe: boucle.id });
  const rb = L.resoudre(et, boucle).entrees;
  assert.strictEqual(rb.reseau, 'perso'); assert.strictEqual(rb.Tdep, 80); assert.strictEqual(rb.Tret, 60);
});

test('liens circulaires : détectés, alertés, sans récursion infinie', () => {
  const { et, ch, sst } = installation();
  sst.entrees.circuits[1].annexe = ch.id; // la sous-station « alimente » la chaufferie
  const r = L.resoudre(et, ch);
  assert.ok(r.alertes.some(a => a.niveau === 'erreur' && /Liens circulaires/.test(a.texte)));
  assert.ok(L.resoudre(et, sst).alertes.some(a => /circulaires/.test(a.texte)));
  assert.ok(L.cycleSchema(et.notes, ch));
  assert.ok(I.controles(et).some(x => x.niveau === 'erreur' && /Liens circulaires entre schémas de principe/.test(x.texte)));
  // Raccordement en boucle refusé, schéma lui-même jamais proposé
  sst.entrees.circuits[1].annexe = '';
  assert.strictEqual(L.relierAuSchema(et, ch, sst.id, -1), null);
  assert.strictEqual(L.relierAuSchema(et, sst, sst.id, -1), null);
  const opts = N.TYPES.pid.champs.find(c => c.k === 'circuits').colonnes.find(c => c.k === 'annexe').o;
  const proposes = opts(sst.entrees, et, sst.entrees.circuits[1]).map(([v]) => v);
  assert.ok(!proposes.includes(sst.id)); assert.ok(!proposes.includes(ch.id));
  // L'arbre et le calcul global se construisent malgré tout
  sst.entrees.circuits[1].annexe = ch.id;
  assert.ok(I.arbre(et).schemas.length >= 1);
  assert.ok(I.hydrauliqueGlobal(et).boucles.length > 0);
});

test('installation : schéma aval sous le circuit amont, consommateur à raccorder, raccordement', () => {
  const { et, ch, sst, arbo } = installation();
  const A = I.arbre(et);
  assert.strictEqual(A.schemas.length, 1);
  const s0 = A.schemas[0], aval = s0.circuits[0].schema;
  assert.strictEqual(s0.note, ch.id);
  assert.strictEqual(aval.note, sst.id); assert.strictEqual(aval.niveau, 1);
  assert.strictEqual(aval.primaire.dp, 45); assert.strictEqual(aval.amont.rep, 'SST B');
  assert.strictEqual(aval.circuits[0].reseau.note, arbo.id);
  const cs = I.consommateurs(et), c = cs.find(x => x.cle === `${sst.id}:schema`);
  assert.strictEqual(c.type, 'schema'); assert.strictEqual(c.P, 215); assert.strictEqual(c.raccordement.note, ch.id);
  // Sous-station non reliée : à raccorder, cibles sans boucle
  const sst2 = nn('pid', 'Sous-station C', { generateur: 'echangeur', nGen: '1', Pgen: 100, reseau: 'ch-70-50', circuits: [{ rep: 'Radiateurs C', emetteur: 'radiateurs', P: 60, regulation: '3v', L: 20 }] });
  et.notes.push(sst2);
  assert.ok(I.controles(et).some(x => x.niveau === 'attention' && /Sous-station C.*non raccordé/.test(x.texte)));
  const cib = I.cibles(et, `${sst2.id}:schema`).map(x => x.valeur);
  assert.ok(cib.includes(`pid|${ch.id}|-1`)); assert.ok(!cib.some(v => v.includes(sst2.id)));
  const r = I.raccorder(et, `${sst2.id}:schema`, `pid|${sst.id}|-1`);
  assert.ok(r.ok, r.texte); assert.strictEqual(r.rep, 'Sous-station C');
  // 4 niveaux : chaufferie → sous-station B → sous-station C ; la puissance de C remonte jusqu'à la chaufferie
  assert.strictEqual(L.resoudre(et, sst).entrees.circuits[2].P, 60);
  assert.strictEqual(L.resoudre(et, ch).entrees.circuits[0].P, 275);
  assert.strictEqual(I.arbre(et).schemas[0].circuits[0].schema.circuits[2].schema.niveau, 2);
  // Boucle refusée
  assert.strictEqual(I.raccorder(et, `${sst.id}:schema`, `pid|${sst2.id}|-1`).ok, false);
});

test('calcul hydraulique global : une boucle par pompe, HMT, chemin le plus défavorisé, pompes en série', () => {
  const { et, ch, sst, arbo } = installation();
  const H = I.hydrauliqueGlobal(et);
  // Production de la chaufferie, circuits SST B et Radiateurs, circuits Réseau B et CTA de la sous-station
  assert.strictEqual(H.boucles.length, 5);
  assert.deepStrictEqual(H.boucles.map(b => b.type), ['production', 'circuit', 'circuit', 'circuit', 'circuit']);
  const dCh = Sc.dimensionner(L.resoudre(et, ch).entrees), bSst = H.boucles.find(b => /circuit SST B/.test(b.boucle));
  assert.strictEqual(bSst.hmt, Math.round(dCh.circuits[0].hmt * 100) / 100);
  assert.strictEqual(bSst.Q, Math.round(dCh.circuits[0].Q * 100) / 100);
  assert.ok(bSst.dp > 45); // échangeur et vanne primaires + liaison
  assert.strictEqual(bSst.etat, 'choisir');
  // Le réseau arborescent est vu par la pompe du circuit de la sous-station (Hres compris)
  const bRes = H.boucles.find(b => /circuit Réseau B/.test(b.boucle)), Hres = N.calculer('arbo', L.resoudre(et, arbo).entrees).valeurs.Hres / 1000;
  assert.ok(bRes.dp > Hres); assert.strictEqual(bRes.niveau, 1);
  // Chemin le plus défavorisé : chaufferie → SST B → réseau B → branche défavorisée
  assert.match(H.defavorise.terminal, /^Réseau B — /);
  assert.strictEqual(H.defavorise.etapes.filter(x => x.boucle !== undefined).length, 3);
  assert.ok(H.chemins.every(c => c.dp <= H.defavorise.dp));
  assert.deepStrictEqual(H.debits.map(x => x.etat), ['OK', 'OK']);
  // Pompe retenue au réseau arborescent et au circuit, sans découplage : pompes en série
  arbo.entrees.pompeRef = 'Réseau-P'; arbo.entrees.pompeCourbe = '0:15 ; 10:12 ; 20:6';
  sst.entrees.pompesFab = [{ circuit: 'Réseau B', ref: 'Circuit-P', courbe: '0:15 ; 10:12 ; 20:6' }];
  assert.ok(I.hydrauliqueGlobal(et).alertes.some(a => a.niveau === 'erreur' && /en série sans découplage/.test(a.texte)));
  assert.ok(I.controles(et).some(x => /en série sans découplage/.test(x.texte)));
  // Sans pompe au circuit : la pompe du réseau devient celle de la boucle
  sst.entrees.pompesFab = [];
  const b2 = I.hydrauliqueGlobal(et).boucles.find(b => /circuit Réseau B/.test(b.boucle));
  assert.match(b2.pompe, /Pompe du réseau Réseau B/); assert.strictEqual(b2.retenue.ref, 'Réseau-P');
  // Pompe primaire ajoutée à la sous-station : boucle de plus, en série avec la pompe du circuit amont
  sst.entrees.pompeEchPrim = 'ajouter';
  const H3 = I.hydrauliqueGlobal(et);
  assert.strictEqual(H3.boucles.length, 6);
  assert.ok(H3.alertes.some(a => /pompe primaire de la sous-station en série/.test(a.texte)));
});
