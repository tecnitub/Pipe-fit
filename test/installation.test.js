// Installation hydraulique : registre unique des consommateurs d'eau, raccordement et contrôles de cohérence.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/schema'); require('../etudes/public/js/cta'); require('../etudes/public/js/equilibrage'); require('../etudes/public/js/industriel');
require('../etudes/public/js/aeraulique-schema'); require('../etudes/public/js/terminaux'); require('../etudes/public/js/electricite');
global.Notes = N;
const L = require('../etudes/public/js/liens');
const I = require('../etudes/public/js/installation');

let k = 0;
const nn = (t, x = {}) => ({ id: `i${++k}`, type: t, titre: N.TYPES[t].titre, entrees: { ...N.defauts(t), ...x } });
const etude = () => {
  const pid = nn('pid', { circuits: [{ rep: 'Plancher', emetteur: 'plancher', P: 30, regulation: '3v', L: 20 }, { rep: 'Ventilos', emetteur: 'ventilo', P: 10, regulation: '3v', L: 20 }] });
  const term = nn('terminaux', { appareils: [{ rep: 'VC1', local: 'Bureau', type: 'cassette2', Pch: 3, Pfr: 4, batterie: '4t', vanne: '2v', dpEauC: 12 }, { rep: 'R1', local: 'Hall', type: 'radElec', batterie: 'elec', Pbe: 1 }] });
  const cta = nn('cta'), ecs = nn('ecs'), arbo = nn('arbo', { troncons: [{ rep: 'C', amont: '', nom: 'Départ', L: 10, zeta: 5 }] });
  pid.titre = 'Chaufferie'; cta.titre = 'CTA salle'; ecs.titre = 'ECS'; arbo.titre = 'Réseau bâtiment B';
  return { et: { notes: [pid, term, cta, ecs, arbo] }, pid, term, cta, ecs, arbo };
};

test('consommateurs : terminaux par batterie, batteries de CTA, ECS, réseaux annexes, circuits directs', () => {
  const { et, pid, term, cta, ecs, arbo } = etude();
  const cs = I.consommateurs(et), cle = c => cs.find(x => x.cle === c);
  assert.deepStrictEqual(cs.map(c => c.cle), [`${term.id}:VC1@chaud`, `${term.id}:VC1@froid`, `${cta.id}:bc`, `${cta.id}:bf`, `${ecs.id}:ecs`, `${arbo.id}:reseau`, `${pid.id}|0`, `${pid.id}|1`]);
  // Terminal 4 tubes : un consommateur chaud, un froid ; le radiateur électrique n'est pas un consommateur d'eau
  const vc = cle(`${term.id}:VC1@chaud`);
  assert.strictEqual(vc.P, 3); assert.strictEqual(vc.saison, 'chaud'); assert.ok(vc.Q > 0); assert.strictEqual(vc.dp, 27); assert.strictEqual(vc.raccordement, null);
  assert.strictEqual(cle(`${term.id}:VC1@froid`).P, 4);
  // Batteries de la CTA : puissances du calcul de la CTA
  const v = N.calculer('cta', cta.entrees).valeurs;
  assert.strictEqual(Math.round(cle(`${cta.id}:bc`).P), Math.round(v.Pchaud)); assert.strictEqual(cle(`${cta.id}:bf`).saison, 'froid');
  // ECS : primaire, eau chaude
  assert.strictEqual(cle(`${ecs.id}:ecs`).P, 40);
  // Circuits directs : raccordés à leur schéma par définition
  assert.deepStrictEqual(cle(`${pid.id}|0`).raccordement.note, pid.id);
  assert.strictEqual(cle(`${pid.id}|0`).P, 30);
});

test('raccorder : branche de réseau arborescent, circuit du schéma, circuit primaire d\'ECS, réseau annexe', () => {
  const { et, pid, term, cta, ecs, arbo } = etude();
  // Cibles proposées : réseau de même saison et circuits dont le régime convient (pas de nouveau circuit pour un terminal)
  const cib = I.cibles(et, `${term.id}:VC1@chaud`).map(x => x.valeur);
  assert.deepStrictEqual(cib, [`arbo|${arbo.id}`, `pid|${pid.id}|0`, `pid|${pid.id}|1`]);
  assert.deepStrictEqual(I.cibles(et, `${term.id}:VC1@froid`), []);
  // Terminal en branche du réseau arborescent (mécanisme des émetteurs)
  let r = I.raccorder(et, `${term.id}:VC1@chaud`, `arbo|${arbo.id}`);
  assert.ok(r.ok, r.texte);
  const t = arbo.entrees.troncons.find(x => x.rep === r.rep);
  assert.strictEqual(t.emetteur, `${term.id}:VC1`); assert.strictEqual(t.amont, 'C');
  assert.strictEqual(I.consommateurs(et).find(c => c.cle === `${term.id}:VC1@chaud`).raccordement.type, 'arbo');
  // Déjà raccordé : refusé
  assert.strictEqual(I.raccorder(et, `${term.id}:VC1@chaud`, `pid|${pid.id}|1`).ok, false);
  // Batterie froide sur le réseau chaud : refusée
  assert.strictEqual(I.raccorder(et, `${cta.id}:bf`, `arbo|${arbo.id}`).ok, false);
  // Batterie chaude de la CTA : nouvelle branche
  assert.ok(I.raccorder(et, `${cta.id}:bc`, `arbo|${arbo.id}`).ok);
  assert.deepStrictEqual(L.batteriesCta(et, cta).map(x => x.lien && x.lien.type), ['arbo', null]);
  // Réseau arborescent en départ du schéma (nouveau circuit nommé comme le réseau)
  r = I.raccorder(et, `${arbo.id}:reseau`, `pid|${pid.id}|-1`);
  assert.ok(r.ok); assert.strictEqual(r.rep, 'Réseau bâtiment B');
  assert.deepStrictEqual(L.circuitDeAnnexe(et.notes, arbo), { pid, i: 2 });
  // ECS : nouveau circuit primaire, puissance reprise de la production d'ECS
  r = I.raccorder(et, `${ecs.id}:ecs`, `pid|${pid.id}|-1`);
  assert.ok(r.ok); assert.strictEqual(ecs.entrees.circuitPrim, `${pid.id}|ECS`);
  assert.strictEqual(pid.entrees.circuits[3].emetteur, 'ecs'); assert.strictEqual(pid.entrees.circuits[3].P, 40);
  // Terminal sur un circuit existant (circuit des terminaux) : le circuit n'est plus un consommateur direct
  const term2 = nn('terminaux', { appareils: [{ rep: 'VC9', type: 'cassette2', Pch: 2, batterie: 'chaude', vanne: '2v' }] }); et.notes.push(term2);
  assert.ok(I.raccorder(et, `${term2.id}:VC9@chaud`, `pid|${pid.id}|1`).ok);
  assert.strictEqual(term2.entrees.appareils[0].circuit, `${pid.id}|Ventilos`);
  const cs = I.consommateurs(et);
  assert.ok(!cs.some(c => c.cle === `${pid.id}|1`));
  assert.deepStrictEqual(cs.filter(c => !c.raccordement).map(c => c.cle), [`${term.id}:VC1@froid`, `${cta.id}:bf`]);
  // Arbre : le réseau sous son circuit, la branche du terminal y mène au consommateur
  const A = I.arbre(et), c2 = A.schemas[0].circuits[2];
  assert.strictEqual(c2.reseau.note, arbo.id);
  assert.ok(c2.reseau.branches.some(b => b.consommateur === `${term.id}:VC1@chaud`));
  assert.deepStrictEqual(A.schemas[0].circuits[1].consommateurs, [`${term2.id}:VC9@chaud`]);
  assert.deepStrictEqual(A.schemas[0].circuits[3].consommateurs, [`${ecs.id}:ecs`]);
  assert.deepStrictEqual(A.reseaux, []);
});

test('raccorder : schéma et réseau restés sur leurs valeurs par défaut (circuits et tronçons non saisis) conservés', () => {
  const pid = { id: 'dp', type: 'pid', titre: 'Chaufferie', entrees: {} }, ecs = nn('ecs'), term = nn('terminaux', { appareils: [{ rep: 'VC1', type: 'cassette2', Pch: 2, batterie: 'chaude', vanne: '2v' }] });
  const arbo = { id: 'da', type: 'arbo', titre: 'Réseau', entrees: {} }, et = { notes: [pid, ecs, term, arbo] };
  const n0 = N.defauts('pid').circuits.length, t0 = N.defauts('arbo').troncons.length;
  assert.ok(I.raccorder(et, `${ecs.id}:ecs`, 'pid|dp|-1').ok);
  assert.strictEqual(pid.entrees.circuits.length, n0 + 1);
  assert.ok(I.raccorder(et, `${term.id}:VC1@chaud`, 'arbo|da').ok);
  assert.strictEqual(arbo.entrees.troncons.length, t0 + 1);
});

test('contrôles : non raccordé, raccordé deux fois, régime incompatible, production insuffisante, réseau non relié', () => {
  const { et, pid, term, cta, arbo } = etude();
  let c = I.controles(et);
  assert.ok(c.some(x => x.niveau === 'attention' && /VC1 — Bureau \(chaud\).*non raccordé/.test(x.texte)));
  assert.ok(c.some(x => x.niveau === 'attention' && /Réseau arborescent « Réseau bâtiment B » non relié à un schéma de principe/.test(x.texte)));
  // Raccordé deux fois : branche du réseau arborescent et circuit du schéma
  term.entrees.appareils[0].circuit = `${pid.id}|Ventilos`;
  arbo.entrees.troncons.push({ rep: 'VC1', amont: 'C', L: 5, zeta: 5, emetteur: `${term.id}:VC1` });
  c = I.controles(et);
  assert.ok(c.some(x => x.niveau === 'erreur' && /VC1 — Bureau \(chaud\) : raccordé 2 fois/.test(x.texte)));
  assert.strictEqual(c[0].niveau, 'erreur');
  // Régime incompatible : batterie froide de la CTA sur le réseau d'eau chaude
  arbo.entrees.troncons.push({ rep: 'BF', amont: 'C', L: 5, zeta: 5, emetteur: `${cta.id}:bf` });
  c = I.controles(et);
  assert.ok(c.some(x => x.niveau === 'erreur' && /batterie froide \(eau glacée\) : régime incompatible avec branche BF/.test(x.texte)));
  // Production insuffisante
  pid.entrees.Pgen = 10; pid.entrees.nGen = '1';
  c = I.controles(et);
  assert.ok(c.some(x => x.niveau === 'erreur' && x.note === pid.id && /production insuffisante/.test(x.texte)));
  // Pompe retenue insuffisante (alerte du calcul reprise)
  pid.entrees.pompesFab = [{ circuit: 'Plancher', ref: 'P-mini', courbe: '0:0,5 ; 1:0,3 ; 2:0,1' }];
  assert.ok(I.controles(et).some(x => x.niveau === 'erreur' && /pompe P-mini insuffisante/i.test(x.texte)));
  // Tout raccordé, rien en double : installation cohérente
  const et2 = { notes: [nn('pid', { circuits: [{ rep: 'Radiateurs', emetteur: 'radiateurs', P: 50, regulation: '3v', L: 20 }] })] };
  assert.deepStrictEqual(I.controles(et2).map(x => x.niveau), ['ok']);
});
