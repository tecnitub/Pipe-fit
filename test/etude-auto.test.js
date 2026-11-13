// Toute l'étude en un clic depuis l'inventaire (etude-auto.js) et estimation des puissances et débits manquants
// (estimations.js) — jeux d'essai fictifs (marque « ACME », valeurs inventées).
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Notes = N;
['schema', 'cta', 'equilibrage', 'industriel', 'aeraulique-schema', 'terminaux', 'electricite', 'sanitaire', 'pieces'].forEach(m => require(`../etudes/public/js/${m}`));
const L = require('../etudes/public/js/liens');
const Ins = require('../etudes/public/js/installation');
const E = require('../etudes/public/js/estimations');
const EA = require('../etudes/public/js/etude-auto');
const G = require('../etudes/public/js/guide-etude');

const it = (id, genre, categorie, designation, x = {}) => ({ id, genre, categorie, designation, qte: 1, inclus: true, sources: [`DPGF ${id}`], ...x });
const uid = () => { let k = 0; return () => `n${++k}`; };
// Chaufferie gaz, radiateurs et ventilo-convecteurs + CTA sur deux réseaux, ballon d'ECS, lavabos
const etudeChaufferie = () => ({ id: 'e1', objet: 'Groupe scolaire ACME', typeBatiment: 'bureaux', neuf: 'non', notes: [],
  inventaireReseaux: [{ id: 'r1', nom: 'Réseau radiateurs', nature: 'chauffage', hydro: true, sources: [] }, { id: 'r2', nom: 'Réseau CTA et ventilo-convecteurs', nature: 'chauffage', hydro: true, sources: [] }],
  inventaire: [
    it('c1', 'chaudiere-cond', 'producteur', 'Chaudière gaz à condensation ACME', { qte: 2, regime: '70/50' }),
    it('c2', 'radiateurs', 'emetteur', 'Radiateurs acier ACME', { qte: 8, reseau: 'r1' }),
    it('c3', 'ventilo', 'emetteur', 'Ventilo-convecteurs ACME bureaux', { qte: 4, reseau: 'r2' }),
    it('c4', 'cta', 'emetteur', 'CTA double flux ACME réfectoire', { reseau: 'r2', principal: true, alim: 'chauffage', details: { batteries: { chaude: true } }, local: 'Réfectoire' }),
    it('c5', 'ecs', 'emetteur', 'Ballon ECS ACME 500 L', { P: 30, principal: true }),
    it('c6', 'pompe', 'auxiliaire', 'Circulateur ACME'),
    it('c7', 'sanitaire', 'sanitaire', 'Lavabo ACME', { qte: 3 }),
    it('c8', 'radiateurs', 'emetteur', 'Radiateurs variante ACME', { qte: 5, variante: true }),
  ] });
const types = et => et.notes.map(n => n.type).sort();

test('création complète : schéma, réseaux arborescents, CTA, terminaux, ECS, sanitaire, électricité ; tout raccordé', () => {
  const et = etudeChaufferie(), r = EA.creerTout(et, { uid: uid() });
  assert.deepStrictEqual(types(et), ['arbo', 'arbo', 'cta', 'ecs', 'elec', 'pid', 'sanitaire', 'terminaux']);
  assert.ok(r.calculs.every(c => c.etat === 'cree'));
  assert.ok(et.notes.every(n => n.origine === 'inventaire' && n.origineCle), 'origine du dossier sur chaque calcul');
  const pid = et.notes.find(n => n.type === 'pid'), term = et.notes.find(n => n.type === 'terminaux'), cta = et.notes.find(n => n.type === 'cta'), ecs = et.notes.find(n => n.type === 'ecs');
  // Variante écartée ; un terminal par appareil, chacun avec la ligne de l'inventaire dont il vient
  assert.strictEqual(term.entrees.appareils.length, 12);
  assert.ok(term.entrees.appareils.every(a => ['c2', 'c3'].includes(a._inv)));
  assert.strictEqual(term.entrees.prodChaud, pid.id, 'régimes des terminaux repris du schéma');
  // Un réseau arborescent par circuit de distribution, réseau annexe de son circuit, une branche par terminal / batterie
  const [aR, aV] = ['Réseau radiateurs', 'Réseau CTA et ventilo-convecteurs'].map(t => et.notes.find(n => n.type === 'arbo' && n.titre === t));
  assert.ok(aR && aV);
  const cs = pid.entrees.circuits;
  assert.strictEqual(cs.find(c => c.rep === 'Réseau radiateurs').annexe, aR.id);
  assert.strictEqual(cs.find(c => c.rep === 'Réseau CTA et ventilo-convecteurs').annexe, aV.id);
  assert.strictEqual(aR.entrees.troncons.filter(t => t.emetteur).length, 8);
  assert.deepStrictEqual(aV.entrees.troncons.filter(t => t.emetteur).map(t => t.emetteur), [...['VC-01', 'VC-02', 'VC-03', 'VC-04'].map(x => `${term.id}:${x}`), `${cta.id}:bc`]);
  assert.deepStrictEqual([aR.entrees.saison, aR.entrees.T, aR.entrees.dT], ['chaud', 60, 20], 'régime du circuit 70/50');
  // ECS sur son circuit primaire ; sanitaire relié à la production d'ECS
  assert.match(ecs.entrees.circuitPrim, new RegExp(`^${pid.id}\\|`));
  assert.strictEqual(et.notes.find(n => n.type === 'sanitaire').entrees.production, ecs.id);
  // Tous les consommateurs raccordés une fois ; aucun « non raccordé » dans les contrôles
  const cons = Ins.consommateurs(et);
  assert.ok(cons.length >= 15);
  assert.ok(cons.every(c => c.raccordements.filter(x => !x.incompatible).length === 1), cons.filter(c => c.raccordements.length !== 1).map(c => c.libelle).join(', '));
  assert.ok(!Ins.controles(et).some(c => /non raccordé|raccordé \d+ fois|incompatible/.test(c.texte)));
  assert.deepStrictEqual(r.nonRaccordes, []);
  assert.ok(r.raccordements.length >= 15);
  // Électricité et régulation créées ; guide : plus de calcul à créer ni de raccordement à faire
  const g = G.restesAFaire(et), e = id => g.etapes.find(x => x.id === id);
  assert.ok(['creer-pid', 'creer-aero', 'creer-terminaux', 'raccordes'].every(id => e(id).fait), g.etapes.filter(x => !x.fait).map(x => x.id).join(', '));
  assert.ok(!e('creer-elec'), 'alimentation électrique créée');
  // Les puissances des circuits reliés (terminaux, réseau annexe) ne sont plus demandées comme « vides »
  assert.ok(!/Puissance du circuit/.test((e(`valeurs:${pid.id}`) || { info: '' }).info));
});

test('pas de doublon au deuxième clic : calculs gardés ou mis à jour sans rien écraser', () => {
  const et = etudeChaufferie(), u = uid();
  EA.creerTout(et, { uid: u });
  const n0 = et.notes.length, troncons = et.notes.filter(n => n.type === 'arbo').map(n => n.entrees.troncons.length);
  assert.deepStrictEqual(EA.existants(et).length, 6);
  const r2 = EA.creerTout(et, { uid: u, existants: 'garder' });
  assert.strictEqual(et.notes.length, n0);
  assert.ok(r2.calculs.every(c => c.etat === 'garde'));
  assert.deepStrictEqual(r2.raccordements, []);
  assert.deepStrictEqual(et.notes.filter(n => n.type === 'arbo').map(n => n.entrees.troncons.length), troncons, 'aucune branche ajoutée deux fois');
  // Mise à jour : valeur saisie gardée, valeur restée vide complétée d'après l'inventaire, ligne nouvelle ajoutée
  const cta = et.notes.find(n => n.type === 'cta'), term = et.notes.find(n => n.type === 'terminaux');
  cta.entrees.Qs = 4200; cta.entrees.dpFiltreAN = 77;
  term.entrees.appareils[0].Pch = 1.8;
  et.inventaire.find(x => x.id === 'c4').Q = 5000;
  et.inventaire.find(x => x.id === 'c3').P = 2.5;
  const r3 = EA.creerTout(et, { uid: u, existants: 'maj' });
  assert.strictEqual(et.notes.length, n0);
  assert.ok(r3.calculs.some(c => c.etat === 'maj'));
  assert.strictEqual(cta.entrees.Qs, 4200, 'débit saisi gardé');
  assert.strictEqual(cta.entrees.Qr, 5000, 'débit repris resté vide : complété');
  assert.strictEqual(cta.entrees.dpFiltreAN, 77);
  assert.strictEqual(term.entrees.appareils[0].Pch, 1.8);
  assert.strictEqual(term.entrees.appareils.length, 12, 'pas de terminal en double');
  // completer : liste restée par défaut remplacée, champ par défaut repris, champ saisi gardé
  const n = { type: 'pid', entrees: { ...N.defauts('pid'), Pgen: 150, vmax: 1.2 } };
  EA.completer(n, { Pgen: 90, vmax: 2, circuits: [{ rep: 'X', P: 10 }] });
  assert.deepStrictEqual([n.entrees.Pgen, n.entrees.vmax, n.entrees.circuits.map(c => c.rep)], [90, 1.2, ['X']]);
});

test('change-over sur un seul schéma : terminaux sur le circuit (chaud et froid), CTA sur son circuit', () => {
  const et = { id: 'e2', objet: 'Bureaux ACME', typeBatiment: 'bureaux', neuf: 'oui', notes: [],
    inventaireReseaux: [{ id: 'r1', nom: 'Réseau change-over ventilo-convecteurs', nature: 'change-over', hydro: true, sources: [] }],
    inventaire: [it('p1', 'pac-rev', 'producteur', 'PAC réversible ACME', { P: 80, Pfr: 70, alim: 'change-over' }),
      it('v1', 'ventilo', 'emetteur', 'Ventilo-convecteurs 2 tubes ACME', { qte: 3, reseau: 'r1', P: 2, Pfr: 2.5, local: 'Open space', details: { tubes: '2t' } }),
      it('a1', 'cta', 'emetteur', 'CTA ACME bureaux', { principal: true, alim: 'change-over', Q: 3000, details: { batteries: { co: true } } })] };
  const r = EA.creerTout(et, { uid: uid() });
  const pid = et.notes.find(n => n.type === 'pid'), term = et.notes.find(n => n.type === 'terminaux'), cta = et.notes.find(n => n.type === 'cta');
  assert.strictEqual(pid.entrees.reseau, 'co');
  assert.ok(!et.notes.some(n => n.type === 'arbo'), 'pas de réseau arborescent en change-over sur un schéma');
  assert.ok(term.entrees.appareils.every(a => a.circuit === `${pid.id}|Réseau change-over ventilo-convecteurs`));
  assert.ok(L.circuitsDeAnnexe(et.notes, cta).length >= 1, 'CTA réseau annexe d\'un circuit');
  const cons = Ins.consommateurs(et).filter(c => c.type !== 'circuit');
  assert.ok(cons.every(c => c.raccordements.length === 1 && !c.raccordements[0].incompatible), cons.map(c => `${c.libelle}:${c.raccordements.length}`).join(', '));
  assert.deepStrictEqual(r.nonRaccordes, []);
  // Puissance de production connue : rien à estimer
  assert.strictEqual(pid.entrees.Pgen, 80);
  assert.ok(!E.estMarque(pid.entrees, 'Pgen'));
});

test('ratios documentés : chaud / froid par type de bâtiment, neuf ou existant, climat ; débits d\'air réglementaires', () => {
  assert.deepStrictEqual(E.ratio({ typeBatiment: 'bureaux', neuf: 'oui' }, 'chaud').v, 45);
  assert.deepStrictEqual(E.ratio({ typeBatiment: 'bureaux', neuf: 'non' }, 'chaud').v, 90);
  assert.deepStrictEqual(E.ratio({ typeBatiment: 'enseignement' }, 'chaud').v, 100, 'non précisé : existant (prudent)');
  assert.deepStrictEqual(E.ratio({ typeBatiment: 'restauration', neuf: 'oui' }, 'froid').v, 120);
  assert.match(E.ratio({}, 'chaud').origine, /type de bâtiment non précisé/);
  // Climat plus froid que la base de référence (−7 °C) : ratio de chauffage relevé
  assert.ok(E.ratio({ typeBatiment: 'bureaux', neuf: 'oui', climat: 'perso', Tbase: -15 }, 'chaud').v > 45);
  // Tous les types de bâtiment de l'étude ont leurs ratios et leur débit d'air
  Object.keys(L.TYPES_BATIMENT || E.CHAUD).forEach(t => assert.ok(E.CHAUD[t] && E.FROID[t] && E.AIR[t], t));
  assert.deepStrictEqual(E.debitAir({ typeBatiment: 'bureaux' }, 100), { v: 250, origine: E.AIR.bureaux.source });
  assert.strictEqual(E.debitAir({ typeBatiment: 'enseignement' }, 50).v, 360, '20 élèves × 18 m³/h');
  assert.strictEqual(E.debitAir({ typeBatiment: 'logement' }, 100).v, 140);
  assert.match(E.AIR.bureaux.source, /R\. 4222-6/);
  assert.match(E.AIR.enseignement.source, /RSDT/);
});

test('estimations : surface demandée une fois par zone, terminaux, CTA et production estimés et marqués', () => {
  const et = etudeChaufferie();
  const r = EA.creerTout(et, { uid: uid() });
  // Sans surface : zones demandées (une par zone), rien d'inventé
  assert.deepStrictEqual(r.surfaces.map(z => z.nom).sort(), ['Radiateurs acier ACME', 'Réfectoire', 'Ventilo-convecteurs ACME bureaux']);
  assert.strictEqual(r.surfaces.find(z => z.nom === 'Radiateurs acier ACME').pour.length, 8);
  assert.deepStrictEqual(r.estimations, []);
  const g0 = G.restesAFaire(et);
  assert.ok(g0.etapes.find(x => x.id === 'surfaces' && !x.fait && x.action[0] === 'surfaces'));
  // Surfaces saisies : puissances des terminaux (partagées dans la zone), débit de la CTA, puissance de production
  E.saisirSurface(et, 'Radiateurs acier ACME', 200); E.saisirSurface(et, 'Ventilo-convecteurs ACME bureaux', 120); E.saisirSurface(et, 'Réfectoire', 150);
  const a = E.appliquer(et);
  assert.deepStrictEqual(a.manquantes, []);
  const term = et.notes.find(n => n.type === 'terminaux'), cta = et.notes.find(n => n.type === 'cta'), pid = et.notes.find(n => n.type === 'pid');
  const r01 = term.entrees.appareils.find(x => x.rep === 'R-01');
  assert.strictEqual(r01.Pch, 2.3, '200 m² × 90 W/m² / 8 radiateurs');
  assert.deepStrictEqual(Object.keys(r01._estimes), ['Pch']);
  assert.strictEqual(r01._estimes.Pch.estime, true);
  assert.match(r01._estimes.Pch.origine, /200 m² \(surface saisie, partagés entre 8 terminaux\) × 90 W\/m² en chaud \(bureaux, existant\)/);
  assert.strictEqual(cta.entrees.Qs, 380, '150 m² / 10 m² × 25 m³/h');
  assert.ok(E.estMarque(cta.entrees, 'Qs') && E.estMarque(cta.entrees, 'Qr'));
  // Production : somme des circuits (réseaux arborescents, ECS) × simultanéité 1 en chaud, sur 2 chaudières
  const P = L.resoudre(et, pid).entrees.circuits.reduce((s, c) => s + N.num(c.P), 0);
  assert.strictEqual(pid.entrees.Pgen, Math.ceil(P / 2 - 1e-9));
  assert.match(pid.entrees._estimes.Pgen.origine, /simultanéité 1 \(chaud\) \/ 2 générateurs/);
  // Guide : valeurs estimées listées, à confirmer
  const g = G.restesAFaire(et), est = g.etapes.filter(x => x.groupe === 'estimees');
  assert.ok(est.some(x => x.id === `estimees:${term.id}` && /estimée/.test(x.info) && x.confirmer === `confirmer-estimes:${term.id}`));
  assert.ok(!est.some(x => x.id === 'surfaces'));
  assert.ok(E.enPlace(et).length >= 15);
});

test('estimation remplacée par une valeur réelle ; jamais d\'écrasement d\'une valeur saisie ou lue', () => {
  const et = etudeChaufferie();
  et.inventaire.find(x => x.id === 'c3').P = 3.2; // puissance des ventilos lue au dossier
  EA.creerTout(et, { uid: uid() });
  E.saisirSurface(et, 'Radiateurs acier ACME', 200); E.saisirSurface(et, 'Ventilo-convecteurs ACME bureaux', 120); E.saisirSurface(et, 'Réfectoire', 150);
  E.appliquer(et);
  const term = et.notes.find(n => n.type === 'terminaux'), cta = et.notes.find(n => n.type === 'cta'), ap = term.entrees.appareils;
  // Valeur lue au dossier : jamais estimée
  assert.ok(ap.filter(a => a._inv === 'c3').every(a => a.Pch === 3.2 && !a._estimes));
  // Saisie : la marque tombe, la valeur saisie reste (même après une nouvelle estimation, un rafraîchissement)
  ap[0].Pch = 4;
  E.appliquer(et); E.appliquer(et, { rafraichir: true });
  assert.strictEqual(ap[0].Pch, 4); assert.ok(!ap[0]._estimes);
  // Valeur vidée volontairement : pas ré-estimée par le simple rafraîchissement (à l'enregistrement)
  ap[1].Pch = '';
  E.appliquer(et, { rafraichir: true });
  assert.strictEqual(ap[1].Pch, '');
  // Bilan pièce par pièce du local : sa puissance remplace l'estimation (valeur réelle, plus de marque)
  ap[2].local = 'Salle ACME 2';
  assert.ok(E.estMarque(ap[2], 'Pch'));
  et.notes.push({ id: 'b1', type: 'pieces', titre: 'Bilan', entrees: { ...N.defauts('pieces'), pieces: [{ nom: 'Salle ACME 2', etage: 'RDC', usage: 'bureau', S: 20, H: 2.7, vitrage: 3, orient: 'S', occ: '', Qair: '' }] } });
  const besoin = require('../etudes/public/js/pieces').besoinsEtude(et)['salle acme 2'].Pch;
  const a = E.appliquer(et, { rafraichir: true });
  assert.ok(a.reelles.some(x => x.cle === 'appareils.2.Pch'));
  assert.strictEqual(ap[2].Pch, Math.ceil(besoin * 10 - 1e-9) / 10);
  assert.ok(!ap[2]._estimes);
  // Débit de la CTA repris d'un schéma aéraulique relié : la marque tombe (valeur réelle du réseau)
  assert.ok(E.estMarque(cta.entrees, 'Qs'));
  et.notes.push({ id: 'ae', type: 'aero', titre: 'Réseau ACME', entrees: { ...N.defauts('aero'), cta: cta.id } });
  const b = E.appliquer(et, { rafraichir: true });
  assert.ok(b.retirees >= 1);
  assert.ok(!E.estMarque(cta.entrees, 'Qs'));
  // Confirmer : les estimations deviennent des valeurs saisies
  const pid = et.notes.find(n => n.type === 'pid');
  if (pid.entrees._estimes) { E.confirmer(pid); assert.ok(!pid.entrees._estimes); }
  // Valeur saisie : jamais remplacée par une estimation
  const x = { id: 'x', type: 'cta', titre: 'CTA ACME saisie', entrees: { ...N.defauts('cta'), Qs: 1234, Qr: '' } };
  const et2 = { notes: [x], surfaces: { 'cta acme saisie': { nom: 'CTA ACME saisie', S: 100 } }, typeBatiment: 'bureaux' };
  E.appliquer(et2);
  assert.strictEqual(x.entrees.Qs, 1234); assert.ok(!E.estMarque(x.entrees, 'Qs'));
  assert.strictEqual(x.entrees.Qr, 250); assert.ok(E.estMarque(x.entrees, 'Qr'));
});

test('création refusée sans inventaire ; circuit sans terminaux ni surface demandé par sa zone', () => {
  assert.match(EA.creerTout({ notes: [] }).erreur, /Inventaire vide/);
  const et = { notes: [], typeBatiment: 'logement', neuf: 'oui', inventaire: [it('h1', 'chaudiere-gaz', 'producteur', 'Chaudière ACME', { P: 40 }), it('h2', 'plancher', 'emetteur', 'Plancher chauffant ACME')] };
  const r = EA.creerTout(et, { uid: uid() });
  const pid = et.notes.find(n => n.type === 'pid'), c = pid.entrees.circuits.find(x => x.emetteur === 'plancher');
  assert.ok(r.surfaces.some(z => z.nom === c.rep));
  E.saisirSurface(et, c.rep, 100);
  E.appliquer(et);
  assert.strictEqual(c.P, 4, '100 m² × 35 W/m² (logement neuf), arrondi au kW');
  assert.ok(E.estMarque(c, 'P'));
  assert.strictEqual(pid.entrees.Pgen, 40, 'puissance lue gardée');
});

test('productions chaud et froid distinctes : deux schémas, réseau de chaque fluide, batteries de la CTA sur chacun', () => {
  const et = { id: 'e3', objet: 'Clinique ACME', typeBatiment: 'ehpad', neuf: 'non', notes: [],
    inventaireReseaux: [{ id: 'r1', nom: 'Réseau eau glacée ventilo-convecteurs', nature: 'eau-glacee', hydro: true, sources: [] }, { id: 'r2', nom: 'Réseau radiateurs', nature: 'chauffage', hydro: true, sources: [] }],
    inventaire: [it('g1', 'gf-air', 'producteur', 'Groupe froid ACME', { Pfr: 120, regime: '7/12' }), it('h1', 'chaudiere-cond', 'producteur', 'Chaudière ACME', { P: 200, regime: '70/50' }),
      it('v1', 'ventilo', 'emetteur', 'Ventilo-convecteurs ACME', { qte: 2, reseau: 'r1', Pfr: 3, details: { tubes: '2t', fils2: true } }),
      it('r1', 'radiateurs', 'emetteur', 'Radiateurs ACME', { qte: 3, reseau: 'r2', P: 1.5 }),
      it('a1', 'cta', 'emetteur', 'CTA ACME', { principal: true, P: 40, Pfr: 30, Q: 4000, details: { batteries: { chaude: true, froide: true } } })] };
  const r = EA.creerTout(et, { uid: uid() });
  const pids = et.notes.filter(n => n.type === 'pid'), cta = et.notes.find(n => n.type === 'cta');
  assert.strictEqual(pids.length, 2);
  const arbos = et.notes.filter(n => n.type === 'arbo');
  assert.deepStrictEqual(arbos.map(a => a.entrees.saison).sort(), ['chaud', 'froid']);
  // Batterie chaude sur le schéma chaud, froide sur le schéma froid
  assert.deepStrictEqual(L.batteriesCta(et, cta).map(b => [b.b, !!b.lien]), [['bc', true], ['bf', true]]);
  const cons = Ins.consommateurs(et).filter(c => c.type !== 'circuit');
  assert.ok(cons.every(c => c.raccordements.length === 1 && !c.raccordements[0].incompatible), cons.map(c => `${c.libelle}:${c.raccordements.length}`).join(', '));
  assert.deepStrictEqual(r.nonRaccordes, []);
  // Deuxième clic : rien de plus
  const n0 = et.notes.length;
  EA.creerTout(et, { uid: uid(), existants: 'maj' });
  assert.strictEqual(et.notes.length, n0);
  assert.ok(Ins.consommateurs(et).filter(c => c.type !== 'circuit').every(c => c.raccordements.length === 1));
});
