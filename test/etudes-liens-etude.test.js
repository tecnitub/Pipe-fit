// Données saisies une fois pour l'étude (climat, type de bâtiment, neuf / existant) et choix reliés entre calculs :
// circuit primaire de l'ECS, chaufferie du gaz et de la ventilation, tronçon de l'isolation, pièces des bouches,
// colonnes « amont » en liste, propositions de pièces et d'étages (datalist), intervenants du chantier.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta');
global.Terminaux = require('../etudes/public/js/terminaux');
global.Schema = require('../etudes/public/js/schema');
require('../etudes/public/js/industriel');
require('../etudes/public/js/gaz-reseau');
require('../etudes/public/js/equilibrage');
global.Sanitaire = require('../etudes/public/js/sanitaire');
require('../etudes/public/js/evacuation');
require('../etudes/public/js/desenfumage');
require('../etudes/public/js/cables');
global.Pieces = require('../etudes/public/js/pieces');
require('../etudes/public/js/aeraulique-schema');
const E = require('../etudes/public/js/electricite');
const L = require('../etudes/public/js/liens');
const D = require('../etudes/public/js/donnees');

const note = (id, type, entrees = {}, titre = type) => ({ id, type, titre, entrees: { ...N.defauts(type), ...entrees } });

test('climat de l\'étude : températures de base imposées et verrouillées dans les bilans, CTA et schémas', () => {
  const et = { climat: 'strasbourg', notes: [note('b', 'bilan'), note('p', 'pieces'), note('c', 'cta'), note('s', 'pid'), note('cs', 'cta', { modeP: 'saisie' })] };
  const r = id => L.resoudre(et, et.notes.find(n => n.id === id));
  assert.strictEqual(r('b').entrees.climat, 'strasbourg');
  assert.match(r('b').verrous.climat, /climat de l'étude \(Strasbourg\)/);
  assert.deepStrictEqual([r('p').entrees.Tbase, r('p').entrees.Tete], [-15, 31]);
  assert.ok(r('p').verrous.Tbase && r('p').verrous.Tete);
  assert.deepStrictEqual([r('c').entrees.TeH, r('c').entrees.TeE, r('c').entrees.HReE], [-15, 31, 40]);
  assert.strictEqual(r('cs').verrous.TeH, undefined, 'puissances saisies : conditions non imposées');
  assert.strictEqual(r('s').entrees.Tbase, -15);
  // Bilans pièce par pièce repris par les terminaux : au climat de l'étude
  const avant = Pieces.besoinsEtude({ notes: [note('p', 'pieces')] }), apres = Pieces.besoinsEtude(et);
  assert.ok(apres['bureau 1'].Pch > avant['bureau 1'].Pch);
  // Températures saisies pour l'étude ; sans climat d'étude, rien n'est imposé
  const et2 = { climat: 'perso', Tbase: '-12', Tete: '35', HRete: '30', notes: [note('b', 'bilan')] };
  assert.deepStrictEqual(['climat', 'Te', 'TeEte', 'HRete'].map(k => L.resoudre(et2, et2.notes[0]).entrees[k]), ['perso', -12, 35, 30]);
  const et3 = { notes: [note('p', 'pieces', { Tbase: -3 })] };
  assert.strictEqual(L.resoudre(et3, et3.notes[0]).entrees.Tbase, -3);
  assert.deepStrictEqual(L.resoudre(et3, et3.notes[0]).verrous, {});
  // Climat proposé d'après la ville ou le code postal du site du chantier
  assert.strictEqual(L.climatDeVille('Lyon'), 'lyon');
  assert.strictEqual(L.climatDeVille('Annecy', '74000'), 'chambery');
  assert.strictEqual(L.climatDeVille('Davézieux', '07430'), 'annonay');
  assert.strictEqual(L.climatDeVille('Fos-sur-Mer', '13270'), 'marseille');
  assert.strictEqual(L.climatDeVille('', ''), '');
  assert.ok(Object.keys(D.CLIMATS).every(k => L.climatDeVille(D.CLIMATS[k][0].split(',')[0]) === k));
});

test('type de bâtiment et neuf / existant : valeur par défaut des calculs, un choix fait dans le calcul reste', () => {
  const et = { typeBatiment: 'enseignement', neuf: 'oui', notes: [note('s', 'pid'), note('san', 'sanitaire'), note('ev', 'evacuation'), note('a', 'aero'), note('e', 'elec')] };
  const r = id => L.resoudre(et, et.notes.find(n => n.id === id)).entrees;
  assert.deepStrictEqual([r('s').usage, r('san').usage, r('ev').usage, r('a').usageAcous, r('e').profilBatiment, r('e').batimentNeuf], ['erp', 'creche', 'collectif', 'classe', 'enseignement', 'oui']);
  // Non verrouillé : le choix fait dans le calcul (marqué « saisi ») est gardé
  assert.strictEqual(L.resoudre(et, et.notes[0]).verrous.usage, undefined);
  et.notes[0].entrees.usage = 'industrie'; et.notes[0].entrees._saisis = { usage: true };
  assert.strictEqual(r('s').usage, 'industrie');
  assert.ok(L.champEtude('pid', 'usage') && !L.champEtude('pid', 'gtb'));
  // Étude sans type de bâtiment : rien ne change
  const et2 = { notes: [note('s', 'pid', { usage: 'habitation' })] };
  assert.strictEqual(L.resoudre(et2, et2.notes[0]).entrees.usage, 'habitation');
});

test('protocole de GTB du schéma de principe repris des armoires électriques (libellés harmonisés)', () => {
  assert.strictEqual(L.gtbPid('BACnet/IP'), 'BACnet IP');
  const et = { notes: [note('s', 'pid', { gtb: 'KNX' }, 'Chaufferie'), note('e', 'elec', { gtb: 'BACnet/IP' }, 'Armoires')] };
  const r = L.resoudre(et, et.notes[0]);
  assert.strictEqual(r.entrees.gtb, 'BACnet IP');
  assert.match(r.verrous.gtb, /N2 — Armoires/);
  et.notes[1].entrees.gtb = 'Modbus TCP';
  assert.strictEqual(L.resoudre(et, et.notes[0]).entrees.gtb, 'Modbus TCP');
  // Sans armoire électrique : choix du schéma
  assert.strictEqual(L.resoudre({ notes: [et.notes[0]] }, et.notes[0]).entrees.gtb, 'KNX');
});

test('ECS : puissance et régime du primaire repris du circuit du schéma de principe', () => {
  const pid = note('s', 'pid', {}, 'Chaufferie'), ecs = note('b', 'ecs', { circuitPrim: 's|Ballon ECS' }), et = { notes: [pid, ecs] };
  const r = L.resoudre(et, ecs);
  assert.deepStrictEqual([r.entrees.P, r.entrees.Tp1, r.entrees.Tp2], [40, 70, 50]);
  assert.ok(['P', 'Tp1', 'Tp2'].every(k => /N1 — Chaufferie \(circuit Ballon ECS\)/.test(r.verrous[k])));
  // Liste : circuits des schémas de l'étude
  const o = N.TYPES.ecs.champs.find(c => c.k === 'circuitPrim').o(ecs.entrees, et);
  assert.ok(o.some(([k, l]) => k === 's|Ballon ECS' && l === 'N1 — Ballon ECS'));
  // Circuit supprimé : valeurs saisies conservées, alerte
  ecs.entrees.circuitPrim = 's|Inconnu';
  const r2 = L.resoudre(et, ecs);
  assert.strictEqual(r2.entrees.P, 40); assert.strictEqual(r2.verrous.P, undefined);
  assert.ok(r2.alertes.some(a => /introuvable/.test(a.texte)));
});

test('gaz et ventilation de chaufferie : générateurs de la chaufferie de l\'étude', () => {
  const pid = note('s', 'pid', { generateur: 'chaudiere-cond', nGen: '2', Pgen: 150 }, 'Chaufferie');
  const gaz = note('g', 'gaz', { chaufferie: 's', appareils: [{ nom: 'Cuisine', P: 40 }] });
  const res = note('r', 'gazReseau', { chaufferie: 's', troncChaufferie: 'G1', appareils: [{ nom: 'Fourneau', P: 40, troncon: 'G2' }] });
  const ven = note('v', 'ventilation', { chaufferie: 's' }), et = { notes: [pid, gaz, res, ven] };
  const rg = L.resoudre(et, gaz);
  assert.strictEqual(rg.entrees.appareils.length, 3);
  assert.deepStrictEqual(rg.entrees.appareils.slice(1).map(a => a.P), [154.6, 154.6]);
  assert.match(rg.entrees.appareils[1].nom, /Chaufferie bâtiment A — chaudière gaz à condensation 1/);
  assert.ok(rg.verrous['appareils.1.P'] && rg.verrous['appareils.2.nom'] && !rg.verrous['appareils.0.P']);
  assert.ok(rg.entrees.appareils[1]._auto);
  assert.strictEqual(gaz.entrees.appareils.length, 1, 'les lignes reprises ne sont pas enregistrées dans la saisie');
  assert.ok(Math.abs(N.calculer('gaz', rg.entrees).valeurs.Ptot - (40 + 2 * 154.6)) < 1e-9);
  const rr = L.resoudre(et, res);
  assert.deepStrictEqual(rr.entrees.appareils.slice(1).map(a => a.troncon), ['G1', 'G1']);
  const rv = L.resoudre(et, ven);
  assert.deepStrictEqual([rv.entrees.P, rv.entrees.combustible, rv.entrees.rendement], [300, 'gaz', 97]);
  assert.ok(rv.verrous.P && rv.verrous.combustible);
  // Chaudière fioul : ventilation au fioul, pas d'appareil gaz ; PAC : rien de repris
  pid.entrees.generateur = 'chaudiere-fioul';
  assert.strictEqual(L.resoudre(et, ven).entrees.combustible, 'fioul');
  assert.strictEqual(L.resoudre(et, gaz).entrees.appareils.length, 1);
  pid.entrees.generateur = 'pac-air';
  assert.ok(L.resoudre(et, ven).alertes.some(a => /sans combustion/.test(a.texte)));
  assert.strictEqual(L.resoudre(et, ven).verrous.P, undefined);
  // Doublon signalé : chaudières déjà saisies à la main
  pid.entrees.generateur = 'chaudiere-gaz'; gaz.entrees.appareils.push({ nom: 'Chaudière 1', P: 150 });
  assert.ok(L.resoudre(et, gaz).alertes.some(a => /comptés deux fois/.test(a.texte)));
});

test('isolation, dilatation, supportage : tube et températures d\'un circuit ou d\'un tronçon de l\'étude', () => {
  const pid = note('s', 'pid', {}, 'Chaufferie'), iso = note('i', 'isolation', { source: 's|c|0' }), dil = note('d', 'dilatation', { source: 's|c|0' }), sup = note('u', 'supportage', { source: 's|c|0' });
  const reseau = note('r', 'reseau', { T: 7, fluide: 'eau' }, 'Eau glacée'), iso2 = note('i2', 'isolation', { source: 'r|t|0' });
  const et = { notes: [pid, iso, dil, sup, reseau, iso2] }, c = Schema.dimensionner(L.resoudre(et, pid).entrees).circuits[0];
  const ri = L.resoudre(et, iso);
  assert.deepStrictEqual([ri.entrees.serie, ri.entrees.tube, ri.entrees.L, ri.entrees.Tf], ['acier-10216', c.t.cle, 120, 70]);
  assert.ok(['serie', 'tube', 'L', 'Tf'].every(k => /Radiateurs bureaux/.test(ri.verrous[k])));
  const rd = L.resoudre(et, dil);
  assert.deepStrictEqual([rd.entrees.tube, rd.entrees.Tmax, rd.verrous.L], [c.t.cle, 70, undefined]);
  const ru = L.resoudre(et, sup);
  assert.deepStrictEqual([ru.entrees.tube, ru.entrees.T, ru.entrees.contenu], [c.t.cle, 70, '1000']);
  // Tronçon d'un réseau et pompe en eau glacée : température froide (condensation)
  const v = N.calculer('reseau', L.resoudre(et, reseau).entrees).valeurs.troncons[0], r2 = L.resoudre(et, iso2);
  assert.deepStrictEqual([r2.entrees.tube, r2.entrees.L, r2.entrees.Tf], [v.tube, v.L, 7]);
  assert.ok(N.calculer('isolation', r2.entrees).alertes.length);
  // Liste des tronçons et circuits
  const o = N.TYPES.isolation.champs.find(x => x.k === 'source').o(iso.entrees, et);
  assert.ok(o.some(([k, l]) => k === 's|c|0' && /circuit Radiateurs bureaux/.test(l)) && o.some(([k]) => k === 'r|t|0'));
  // Champ ajouté sans valeur par défaut : les calculs émis avant ne sont pas « modifiés »
  assert.ok(!('source' in N.defauts('isolation')) && !('circuitPrim' in N.defauts('ecs')) && !('chaufferie' in N.defauts('gaz')));
});

test('bouches : surface et débit des locaux repris des pièces de l\'étude', () => {
  const pcs = note('p', 'pieces', { pieces: [{ nom: 'Bureau 1', etage: 'R+1', usage: 'bureau', S: 18, H: 2.7, vitrage: 4, orient: 'S', occ: '', Qair: '' }, { nom: 'Salle de réunion', etage: 'R+1', usage: 'reunion', S: 30, H: 2.7, vitrage: 6, orient: 'E', occ: '', Qair: 300 }] });
  const aero = note('a', 'aero', { structure: 'arborescence', bouchesL: [{ rep: 'B1', salle: 'Bureau 1', reseau: 'soufflage', Q: 60 }, { rep: 'B2', salle: 'bureau 1', reseau: 'soufflage', Q: 70 }, { rep: 'B3', salle: 'Bureau 1', reseau: 'extraction', type: 'extraction', Q: 90 }] });
  const b = note('bo', 'bouches', { reprise: 'pieces', locaux: [{ local: 'Bureau 1', S: 5, Q: 10, n: 1, type: 'plafond' }, { local: 'Bureau 1', S: 5, Q: 10, n: 1, type: 'extraction' }, { local: 'Salle de réunion', S: 5, Q: 10, n: 2, type: 'plafond' }, { local: 'Atelier', S: 300, Q: 3000, n: 4, type: 'grille' }] });
  const et = { notes: [pcs, aero, b] }, r = L.resoudre(et, b);
  assert.deepStrictEqual(r.entrees.locaux.map(l => [l.S, l.Q]), [[18, 130], [18, 90], [30, 300], [300, 3000]]);
  assert.ok(r.verrous['locaux.0.S'] && r.verrous['locaux.0.Q'] && r.verrous['locaux.2.Q'] && !r.verrous['locaux.3.S']);
  assert.ok(r.alertes.some(a => /Atelier/.test(a.texte)));
  b.entrees.reprise = '';
  assert.deepStrictEqual(L.resoudre(et, b).verrous, {});
});

test('colonnes « amont » : les autres repères de la liste, la ligne elle-même exclue, valeur saisie gardée', () => {
  const cols = [['arbo', 'troncons'], ['aero', 'troncons'], ['sanitaire', 'troncons'], ['evacuation', 'troncons'], ['gazReseau', 'troncons'], ['cable', 'liaisons']];
  cols.forEach(([type, liste]) => {
    const c = N.TYPES[type].champs.find(x => x.k === liste), col = c.colonnes.find(x => x.k === 'amont');
    assert.strictEqual(col.t, 's', `${type} : liste`);
    assert.ok(col.libre);
  });
  const col = N.TYPES.arbo.champs.find(x => x.k === 'troncons').colonnes.find(x => x.k === 'amont');
  const e = { troncons: [{ rep: 'C' }, { rep: 'A1', amont: 'C' }, { rep: 'A2', amont: 'Z9' }, { rep: '' }] };
  assert.deepStrictEqual(col.o(e, null, e.troncons[1]), [['', '— (départ)'], ['C', 'C'], ['A2', 'A2']]);
  assert.deepStrictEqual(col.o(e, null, e.troncons[2]).map(x => x[0]), ['', 'C', 'A1', 'Z9']);
  // Valeurs déjà saisies : le calcul est inchangé
  const d = N.defauts('arbo'), r = N.calculer('arbo', d);
  assert.ok(r.valeurs && !r.alertes.some(a => a.niveau === 'erreur' && /amont/i.test(a.texte)));
});

test('pièces, étages et zones de l\'étude proposés en saisie (datalist)', () => {
  const et = { notes: [note('p', 'pieces'), note('t', 'terminaux', { appareils: [{ rep: 'CA-01', local: 'Accueil', zone: 'RDC' }] }), note('s', 'sanitaire'), note('d', 'desenfumage')] };
  const lx = N.lieuxEtude(et);
  assert.ok(['Bureau 1', 'Salle de réunion', 'Accueil', 'Sanitaires H', 'Plateau bureaux'].every(x => lx.salles.includes(x)));
  assert.deepStrictEqual(lx.etages, ['R+1']);
  assert.ok(lx.zones.includes('RDC') && lx.zones.includes('R+1'));
  const avecLst = [['terminaux', 'appareils', ['local', 'zone']], ['aero', 'bouchesL', ['salle', 'zone', 'etage']], ['sanitaire', 'points', ['salle', 'etage']], ['evacuation', 'appareils', ['salle', 'etage']], ['desenfumage', 'cantons', ['nom', 'etage']], ['bouches', 'locaux', ['local']]];
  avecLst.forEach(([type, liste, ks]) => ks.forEach(k => { const col = N.TYPES[type].champs.find(x => x.k === liste).colonnes.find(x => x.k === k); assert.strictEqual(typeof col.lst, 'function', `${type}.${liste}.${k}`); assert.ok(Array.isArray(col.lst({}, et))); }));
  // Rendu du formulaire : attribut list= et datalist de la colonne, lignes reprises sans boutons
  const doc = { getElementById: () => ({ addEventListener() {}, classList: { add() {}, remove() {} }, appendChild() {} }), body: { classList: { add() {}, remove() {} } }, querySelectorAll: () => [], addEventListener() {} };
  const ctx = vm.createContext({ document: doc, window: { addEventListener() {} }, location: { hash: '' }, fetch: () => new Promise(() => {}), crypto: { getRandomValues: a => a }, Notes: N, Liens: L, Registre: {}, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../etudes/public/js/app.js'), 'utf8'), ctx);
  vm.runInContext('contexteEtude = et0', Object.assign(ctx, { et0: et }));
  const html = vm.runInContext('formulaireHtml', ctx)('terminaux', L.resoudre(et, et.notes[1]).entrees, {});
  assert.match(html, /<input data-l="appareils\.0\.local" value="Accueil" list="dl-appareils-local"/);
  assert.match(html, /<datalist id="dl-appareils-local">[^]*<option value="Bureau 1">[^]*<\/datalist>/);
  assert.match(html, /<datalist id="dl-appareils-zone">[^]*<option value="RDC">/);
  const g = { notes: [note('s', 'pid', {}, 'Chaufferie'), note('g', 'gaz', { chaufferie: 's', appareils: [{ nom: 'Cuisine', P: 40 }] })] }, r = L.resoudre(g, g.notes[1]);
  const h2 = vm.runInContext('formulaireHtml', ctx)('gaz', r.entrees, r.verrous);
  assert.strictEqual((h2.match(/data-suppr-ligne=/g) || []).length, 1, 'seule la ligne saisie se supprime');
  assert.match(h2, /<input data-l="appareils\.1\.P" value="154,6" inputmode="decimal" class="nombre" disabled data-verrou/);
  // Colonne amont : liste déroulante avec la valeur saisie
  const h3 = vm.runInContext('formulaireHtml', ctx)('arbo', N.defauts('arbo'), {});
  assert.match(h3, /<select data-l="troncons\.1\.amont"><option value="" >— \(départ\)<\/option><option value="C" selected>C<\/option>/);
});

test('liste de diffusion : intervenants du chantier repris (client, maîtrise d\'œuvre et leurs contacts)', () => {
  const ctx = vm.createContext({ uidE: (() => { let i = 0; return () => `u${++i}`; })(), normTxt: s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../etudes/public/js/diffusion.js'), 'utf8'), ctx);
  const f = vm.runInContext('reprendreIntervenants', ctx);
  const pf = { entreprises: [{ id: 'c1', nom: 'Mairie' }, { id: 'm1', nom: 'Archi & Co' }], contacts: [{ id: 'k1', entrepriseId: 'c1', prenom: 'Anne', nom: 'Martin', email: 'a@mairie.fr' }, { id: 'k2', entrepriseId: 'm1', prenom: 'Paul', nom: 'Durand', email: 'p@archi.fr' }, { id: 'k3', entrepriseId: 'm1', nom: 'Secrétariat', email: '' }] };
  const et = { diffusion: [{ nom: 'Anne Martin', societe: 'Mairie', email: 'A@mairie.fr' }] };
  assert.strictEqual(f(et, { clientId: 'c1', contactId: 'k1', moeId: 'm1', moeContactId: 'k2' }, pf), 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(et.diffusion[1])), { id: 'u1', nom: 'Paul Durand', societe: 'Archi & Co', role: 'Maîtrise d\'œuvre', email: 'p@archi.fr', copie: false });
  assert.strictEqual(f(et, { clientId: 'c1', contactId: 'k1', moeId: 'm1', moeContactId: 'k2' }, pf), 0);
});

test('DOE : références du CCTP (opération, maître d\'ouvrage, maîtrise d\'œuvre) et coordonnées du BET et du contrôleur', () => {
  const ctx = vm.createContext({ SECTIONS: {}, vide: v => v === undefined || v === null || String(v).trim() === '',
    intervenantDe: id => ({ e1: { raison: 'BET Fluides Conseil', adresse: '1 rue A, 69000 Lyon', interlocuteur: '', tel: '04 00 00 00 00', mail: 'bet@x.fr' }, e2: { raison: 'SOCOTEC', adresse: '2 rue B', interlocuteur: 'M. X', tel: '05', mail: 'ct@socotec.fr' } }[id]) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../doe/public/js/etude.js'), 'utf8'), ctx);
  const ap = vm.runInContext('appliquerRefsCctp', ctx), ctl = vm.runInContext('controleCctp', ctx);
  assert.strictEqual(ctl(['Lot 14 — CVC', 'Bureau de contrôle : Socotec Lyon']), 'Socotec Lyon');
  const doe = { operation: '', intervenants: { mo: { raison: 'Déjà saisi' } }, cctp: {} };
  const n = ap(doe, { operation: 'Collège des Tilleuls', moa: 'Département', moe: 'Atelier Archi', bet: 'Fluides Conseil SARL', controle: 'Socotec Lyon' }, [{ id: 'e1', nom: 'BET Fluides Conseil' }, { id: 'e2', nom: 'SOCOTEC' }, { id: 'e3', nom: 'Lyon' }]);
  assert.ok(n >= 6);
  assert.strictEqual(doe.operation, 'Collège des Tilleuls');
  assert.strictEqual(doe.intervenants.mo.raison, 'Déjà saisi');
  assert.strictEqual(doe.intervenants.moe.raison, 'Atelier Archi');
  assert.deepStrictEqual([doe.intervenants.bet.raison, doe.intervenants.bet.mail, doe.intervenants.bet.tel], ['Fluides Conseil SARL', 'bet@x.fr', '04 00 00 00 00']);
  assert.deepStrictEqual([doe.intervenants.controle.raison, doe.intervenants.controle.interlocuteur], ['Socotec Lyon', 'M. X']);
  assert.strictEqual(vm.runInContext('entrepriseParNom', ctx)([{ id: 'e3', nom: 'Lyon' }], 'Socotec'), null);
});
