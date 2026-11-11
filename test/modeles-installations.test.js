// Modèles d'installations prêts à l'emploi : chaque modèle s'instancie, toutes ses notes se calculent avec leurs liens
// sans erreur, et les valeurs reprises d'une note à l'autre (récupération, ECS, CTA, réseaux arborescents) sont justes.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/schema'); global.Notes = N;
require('../etudes/public/js/cta'); require('../etudes/public/js/equilibrage'); require('../etudes/public/js/industriel'); require('../etudes/public/js/aeraulique-schema');
require('../etudes/public/js/terminaux'); require('../etudes/public/js/sanitaire'); require('../etudes/public/js/electricite');
const L = require('../etudes/public/js/liens');
const M = require('../etudes/public/js/modeles');

const NOUVEAUX = ['chaufferie-cascade-ecs', 'pac-appoint-chaudiere', 'thermofrigopompe', 'boucle-eau-temperee', 'sous-station', 'eau-glacee-vc4t'];
const instancier = id => { let k = 0; const notes = M.instancier(M.INTEGRES.find(m => m.id === id), () => `${id}-n${++k}`); return { objet: id, notes }; };
const note = (et, f) => et.notes.find(f);
const calc = (et, n) => L.calculer(et, n);
// Toutes les chaînes des entrées (pour vérifier les références reportées)
const chaines = o => (Array.isArray(o) ? o.flatMap(chaines) : o && typeof o === 'object' ? Object.values(o).flatMap(chaines) : typeof o === 'string' ? [o] : []);

test('les nouveaux modèles sont intégrés avec un titre et une description', () => {
  NOUVEAUX.forEach(id => {
    const m = M.INTEGRES.find(x => x.id === id);
    assert.ok(m, id);
    assert.ok(m.nom && m.objet && m.description, id);
  });
  assert.strictEqual(new Set(M.INTEGRES.map(m => m.id)).size, M.INTEGRES.length, 'identifiants uniques');
});

test('chaque modèle se calcule sans erreur, références reportées', () => {
  M.INTEGRES.forEach(m => {
    const et = instancier(m.id), ids = new Set(et.notes.map(n => n.id));
    assert.ok(et.notes.length >= m.notes.length, m.id);
    et.notes.forEach(n => {
      chaines(n.entrees).forEach(s => assert.ok(!s.startsWith('@'), `${m.id} : référence non reportée ${s}`));
      ['recupDe', 'prodChaud', 'prodFroid'].forEach(k => { if (n.entrees[k]) assert.ok(ids.has(n.entrees[k]), `${m.id} : ${k}`); });
      (n.entrees.circuits || []).forEach(c => { if (c.annexe) assert.ok(ids.has(c.annexe), `${m.id} : annexe ${c.rep}`); });
      const r = calc(et, n), err = (r.alertes || []).filter(a => a.niveau === 'erreur');
      assert.deepStrictEqual(err.map(a => a.texte), [], `${m.id} — ${n.titre}`);
    });
  });
});

test('chaufferie en cascade : CTA et ECS reliées au schéma', () => {
  const et = instancier('chaufferie-cascade-ecs'), pid = note(et, n => n.type === 'pid'), cta = note(et, n => n.type === 'cta'), ecs = note(et, n => n.type === 'ecs');
  const r = L.resoudre(et, pid), cCta = r.entrees.circuits.find(c => c.rep === 'CTA');
  const Pcta = N.calculer('cta', L.resoudre(et, cta).entrees).valeurs.Pchaud;
  assert.ok(Pcta > 0);
  assert.strictEqual(cCta.P, Math.round(Pcta * 10) / 10);
  // ECS : puissance et régime du primaire repris du circuit
  const re = L.resoudre(et, ecs);
  assert.strictEqual(re.entrees.P, 60);
  assert.strictEqual(re.entrees.Tp1, 80);
  assert.ok(re.verrous.P);
  const v = calc(et, pid).valeurs;
  assert.strictEqual(v.Pprod, 320);
  assert.ok(v.ballons.some(b => b.fonction === 'ecs' && b.circuit === 'Préparation ECS'));
  // Réseaux, vannes et vase créés depuis le schéma ; pas de réseau pour le circuit relié à la CTA
  assert.ok(et.notes.some(n => n.lien && n.lien.role === 'vase'));
  assert.ok(!et.notes.some(n => n.lien && n.lien.role === 'reseau' && /CTA/.test(n.titre)));
});

test('PAC air/eau et appoint chaudière : bivalence et ballon tampon', () => {
  const et = instancier('pac-appoint-chaudiere'), pid = note(et, n => n.type === 'pid'), r = calc(et, pid);
  assert.strictEqual(r.valeurs.Pprod, 130);
  assert.strictEqual(r.valeurs.Pdem, 110);
  assert.deepStrictEqual(pid.entrees.generateurs.map(g => g.role), ['base', 'appoint']);
  assert.ok(r.valeurs.ballons.some(b => b.fonction === 'tampon' && !b.circuit && b.V > 0));
  const Sc = require('../etudes/public/js/schema');
  const e = L.resoudre(et, pid).entrees, af = Sc.regulation(Sc.dimensionner(e), e)[0].liste;
  assert.ok(af.some(t => /Bivalence parallèle/.test(t)));
});

test('thermofrigopompe : chaleur récupérée sur le groupe froid reprise côté chaud, CTA sur les deux schémas', () => {
  const et = instancier('thermofrigopompe'), froid = note(et, n => n.type === 'pid' && n.entrees.recupGf), chaud = note(et, n => n.type === 'pid' && n.entrees.recupDe), cta = note(et, n => n.type === 'cta');
  assert.strictEqual(chaud.entrees.recupDe, froid.id);
  const vf = calc(et, froid).valeurs, rc = L.resoudre(et, chaud), vc = calc(et, chaud).valeurs;
  assert.ok(vf.Precup > 0);
  assert.strictEqual(rc.entrees.Precup, vf.Precup);
  assert.ok(rc.verrous.Precup);
  assert.strictEqual(vc.Precupe, vf.Precup);
  // Batterie froide sur le schéma froid, batterie chaude sur le schéma chaud
  const v = N.calculer('cta', L.resoudre(et, cta).entrees).valeurs;
  assert.strictEqual(L.resoudre(et, froid).entrees.circuits.find(c => c.annexe === cta.id).P, Math.round(v.Pfroid * 10) / 10);
  assert.strictEqual(rc.entrees.circuits.find(c => c.annexe === cta.id).P, Math.round(v.Pchaud * 10) / 10);
  const bats = L.batteriesCta(et, cta);
  assert.deepStrictEqual(bats.map(b => b.lien && b.lien.pid.id), [chaud.id, froid.id]);
});

test('boucle d\'eau tempérée : circuits « process » et PAC de zone sur la boucle', () => {
  const et = instancier('boucle-eau-temperee'), boucle = note(et, n => n.type === 'pid' && n.entrees.reseau === 'perso'), zone = note(et, n => n.type === 'pid' && n.entrees.generateur === 'pac-eau');
  assert.ok(boucle.commentaire.length > 50);
  assert.ok(boucle.entrees.circuits.every(c => c.emetteur === 'process' && c.annexe));
  // Chaque PAC de zone est un schéma aval : la boucle fournit ses besoins × (1 − 1/COP)
  const zones = et.notes.filter(n => n.type === 'pid' && n.entrees.generateur === 'pac-eau');
  assert.strictEqual(zones.length, 3);
  const attendu = zones.reduce((s, z) => s + calc(et, z).valeurs.Pdem * (1 - 1 / 4.5), 0);
  assert.ok(Math.abs(calc(et, boucle).valeurs.Pdem - attendu) < 1, `${calc(et, boucle).valeurs.Pdem} ≈ ${attendu}`);
  assert.strictEqual(zone.entrees.sourceEau, 'boucle');
  assert.ok(calc(et, zone).valeurs.Pdem > 0);
});

test('sous-station : échangeur, pompe secondaire, ECS au régime du secondaire', () => {
  const et = instancier('sous-station'), pid = note(et, n => n.type === 'pid'), ecs = note(et, n => n.type === 'ecs'), r = calc(et, pid);
  assert.strictEqual(pid.entrees.generateur, 'echangeur');
  assert.ok(r.alertes.some(a => /Pompe secondaire de l'échangeur à ajouter/.test(a.texte)));
  const re = L.resoudre(et, ecs);
  assert.strictEqual(re.entrees.Tp1, 85); // 90 °C primaire − pincement 5 K
  assert.strictEqual(re.entrees.P, 80);
});

test('groupe froid et ventilo-convecteurs 4 tubes : réseaux arborescents chaud et froid reliés aux terminaux', () => {
  const et = instancier('eau-glacee-vc4t'), term = note(et, n => n.type === 'terminaux');
  const arboF = note(et, n => n.type === 'arbo' && n.entrees.saison === 'froid'), arboC = note(et, n => n.type === 'arbo' && n.entrees.saison === 'chaud');
  const pidF = note(et, n => n.type === 'pid' && n.entrees.reseau === 'eg-7-12'), pidC = note(et, n => n.type === 'pid' && n.entrees.reseau === 'ch-55-45');
  const rt = L.resoudre(et, term);
  assert.strictEqual(rt.entrees.TfAller, 7); assert.strictEqual(rt.entrees.TcAller, 55);
  const vF = calc(et, arboF).valeurs, vC = calc(et, arboC).valeurs;
  assert.strictEqual(Math.round(vF.Ptot * 10) / 10, 20.4);
  assert.strictEqual(Math.round(vC.Ptot * 10) / 10, 17);
  assert.strictEqual(L.resoudre(et, pidF).entrees.circuits[0].P, 20.4);
  assert.strictEqual(L.resoudre(et, pidC).entrees.circuits[0].P, 17);
  // Régime de l'eau glacée imposé au réseau arborescent par son circuit
  assert.strictEqual(L.resoudre(et, arboF).entrees.dT, 5);
});

test('étude enregistrée comme modèle : liens entre notes reportés sur les nouveaux identifiants', () => {
  const et = instancier('thermofrigopompe');
  let k = 0;
  const copie = M.instancier({ modele: true, notes: et.notes }, () => `copie-${++k}`), ids = new Set(copie.map(n => n.id));
  const chaud = copie.find(n => n.entrees.recupDe), froid = copie.find(n => n.entrees.recupGf);
  assert.strictEqual(chaud.entrees.recupDe, froid.id);
  copie.forEach(n => (n.entrees.circuits || []).forEach(c => { if (c.annexe) assert.ok(ids.has(c.annexe)); }));
  const vc = copie.find(n => n.type === 'cta');
  assert.ok(L.resoudre({ notes: copie }, chaud).entrees.Precup > 0);
  assert.ok(vc);
});

test('boucle d\'eau tempérée : régulation enchaînée entre la boucle et les PAC de zone', () => {
  const Rg = require('../etudes/public/js/regulation');
  const et = instancier('boucle-eau-temperee'), inst = Rg.contexte(et, L).installations.filter(i => i.app === 'production');
  const boucle = inst.find(i => /boucle/i.test(i.titre) && !/zone/i.test(i.titre)), zones = inst.filter(i => /zone/i.test(i.titre));
  assert.strictEqual(zones.length, 3);
  assert.ok(zones.every(z => z.af.some(t => /Alimenté par le circuit .*entre 15 et 30 °C/.test(t))));
  assert.ok(zones.every(z => z.params.some(p => /Boucle d'eau tempérée/.test(p.libelle))));
  assert.strictEqual(boucle.af.filter(t => /alimente le schéma PAC de zone/.test(t)).length, 3);
});
