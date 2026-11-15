// Chaîne CCTP / DPGF → calculs → métré sur un dossier réel (cas rencontrés, reproduits sur des jeux fictifs « ACME »,
// « Exemplair », valeurs inventées) : couverture du CCTP équipement par équipement (une seconde CTA prévue mais non
// calculée est ajoutée et signalée), composition de CTA écrite par sections, valeur renvoyée à la ligne prise pour un
// article, split en deux lignes (unité extérieure + intérieure), schéma aéraulique relié à sa CTA, thermofrigopompe
// comptée une fois.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Notes = N;
['schema', 'cta', 'equilibrage', 'industriel', 'aeraulique-schema', 'terminaux', 'electricite', 'sanitaire', 'pieces'].forEach(m => require(`../etudes/public/js/${m}`));
const C = require('../public/js/cctp-lecture');
const I = require('../public/js/inventaire-cvc');
const MR = require('../public/js/materiel-retenu');
const Me = require('../etudes/public/js/metre');
const EA = require('../etudes/public/js/etude-auto');
const G = require('../etudes/public/js/guide-etude');
const Ct = require('../etudes/public/js/controle-etude');

const uid = () => { let k = 0; return () => `n${++k}`; };
const it = (id, genre, categorie, designation, x = {}) => ({ id, genre, categorie, designation, qte: 1, inclus: true, sources: [`CCTP art. ${id}`], ...x });

test('couverture équipement par équipement : deux CTA au CCTP, une seule calculée — la seconde est ajoutée au métré, sans doublon', () => {
  const inv = [
    it('a', 'cta', 'emetteur', 'Centrale double flux ACME bureaux', { repere: 'CTA-1', Q: 3500 }),
    it('b', 'cta', 'emetteur', 'Centrale double flux ACME salle', { repere: 'CTA-2', Q: 1600 }),
  ];
  const postes = [{ cle: 'cta|3500', designation: 'Centrale de traitement d\'air 3 500 m³/h', qte: 1, grandeurs: { Q: 3500 } }];
  const r = MR.couverture(postes, inv);
  assert.deepStrictEqual(r.couverts.map(c => [c.x.id, c.cle, c.par]), [['a', 'cta|3500', 'grandeur']]);
  assert.deepStrictEqual(r.restes.map(y => [y.x.id, y.qte]), [['b', 1]]);
  const tout = MR.avecInventaire(postes, inv);
  assert.deepStrictEqual(tout.map(p => p.cle), ['cta|3500', 'cctp|cta|cta-2']);
  // Une seconde fois : même clé (stable), pas de doublon
  assert.deepStrictEqual(MR.avecInventaire(postes, inv).map(p => p.cle), tout.map(p => p.cle));
  // Ancienne règle (par famille) : la seconde CTA était perdue ; deux grandeurs différentes ne se couvrent pas
  assert.strictEqual(MR.couverture([{ ...postes[0], grandeurs: { Q: 3900 } }], [inv[1]]).restes.length, 1);
});

test('couverture : poste issu de la ligne de l\'inventaire, repère, désignation, nombre ; quantité couverte en partie', () => {
  const inv = [
    it('p1', 'pompe', 'auxiliaire', 'Pompe double P1 ACME', { repere: 'P1', reseau: 'r1' }),
    it('p2', 'pompe', 'auxiliaire', 'Surpresseur Exemplair eau froide'),
    it('t', 'tampon', 'auxiliaire', 'Ballon tampon ACME', { qte: 3, carac: { volume: 500 } }),
    it('c', 'cta', 'emetteur', 'CTA ACME', { repere: 'CTA-07', Q: 1800 }),
    it('r', 'regulation', 'auxiliaire', 'Armoire de régulation'),
  ];
  const postes = [
    { cle: 'pompe|x', designation: 'Pompe Circulateur 25-60', qte: 1 },
    { cle: 'tampon|500', designation: 'Ballon tampon 500 L', qte: 2, grandeurs: { V: 500 } },
    { cle: 'cta|1800', designation: 'Centrale de traitement d\'air 1 800 m³/h', qte: 1, titre: 'CTA — CTA 7 ACME', grandeurs: { Q: 1750 } },
  ];
  const r = MR.couverture(postes, inv);
  const par = Object.fromEntries(r.couverts.map(c => [c.x.id, c.par]));
  assert.strictEqual(par.c, 'repere', 'repère « CTA-07 » lu dans le titre « CTA 7 »');
  assert.strictEqual(par.t, 'grandeur');
  assert.strictEqual(par.p1, 'famille', 'pompe rattachée à un réseau couverte la première');
  // Restes : surpresseur (la seule pompe calculée est prise), un ballon sur trois, armoire de régulation
  assert.deepStrictEqual(r.restes.map(y => [y.x.id, y.qte, y.partiel]), [['p2', 1, false], ['t', 1, true], ['r', 1, false]]);
  assert.deepStrictEqual(MR.grosNonCouverts(r).map(y => y.x.id), ['p2', 't'], 'gros équipements signalés (la régulation non)');
  assert.match(MR.libelleReste(r.restes[1]), /\(1 u non couverte\)/);
  const ajout = MR.avecInventaire(postes, inv).filter(p => p.inventaire);
  assert.deepStrictEqual(ajout.map(p => [p.cle, p.qte]), [['cctp|pompe|surpresseur-exemplair-eau-froide', 1], ['cctp|tampon|ballon-tampon-acme', 1], ['cctp|regulation|armoire-de-regulation', 1]]);
  assert.ok(/reste est compté/.test(ajout[1].partiel));
  // Poste issu de la ligne même de l'inventaire : prioritaire sur le repère d'une autre
  const r2 = MR.couverture([{ cle: 'cta|9', designation: 'Centrale', qte: 1, inv: ['c'] }], inv);
  assert.deepStrictEqual(r2.couverts.map(c => [c.x.id, c.par]), [['c', 'inventaire']]);
});

test('étude complète : deux CTA au dossier, schéma aéraulique d\'après la première (centrale comptée une fois) ; seconde CTA supprimée → signalée au guide et au contrôle', () => {
  const inv = [
    it('c1', 'cta', 'emetteur', 'CTA double flux ACME hall', { repere: 'CTA-1', Q: 3500, principal: true, details: { batteries: { chaude: true } } }),
    it('c2', 'cta', 'emetteur', 'CTA double flux ACME salle', { repere: 'CTA-2', Q: 1600, principal: true, details: { batteries: { chaude: true } } }),
    it('b1', 'bouche-soufflage', 'emetteur', 'Diffuseur ACME', { qte: 4, Q: 250 }),
    it('b2', 'bouche-extraction', 'emetteur', 'Grille de reprise ACME', { qte: 4, Q: 250 }),
  ];
  const et = { id: 'e1', typeBatiment: 'bureaux', notes: [], inventaire: inv };
  EA.creerTout(et, { uid: uid() });
  const ctas = et.notes.filter(n => n.type === 'cta'), aero = et.notes.find(n => n.type === 'aero');
  assert.strictEqual(ctas.length, 2);
  assert.ok(!aero.entrees.cta && aero.origineInv === 'c1', 'schéma aéraulique d\'après la première CTA, sans lui imposer les débits de toutes les bouches');
  // Chaque CTA comptée une fois, aucun équipement du dossier ajouté en plus
  const cta = Me.metre(et).filter(p => /^(cta|aero\|cta|cctp\|cta)/.test(p.cle));
  assert.strictEqual(cta.reduce((s, p) => s + p.qte, 0), 2);
  assert.ok(!cta.some(p => /^cctp/.test(p.cle)));
  const g = G.restesAFaire(et).etapes.find(x => x.id === 'couverture-cctp');
  assert.ok(g && g.fait, 'tout est couvert');
  // La seconde CTA n'est plus calculée : ajoutée au métré, signalée (guide, contrôle)
  et.notes = et.notes.filter(n => n.origineInv !== 'c2');
  const p = Me.metre(et).filter(x => /^cctp\|cta/.test(x.cle));
  assert.deepStrictEqual(p.map(x => [x.cle, x.qte]), [['cctp|cta|cta-2', 1]]);
  const g2 = G.restesAFaire(et).etapes.find(x => x.id === 'couverture-cctp');
  assert.ok(g2 && !g2.fait && /CTA-2/.test(g2.info) && g2.confirmer === 'fait:couverture-cctp');
  const pts = Ct.controler(et).filter(x => /compté par aucun calcul/.test(x.texte));
  assert.strictEqual(pts.length, 1);
  assert.strictEqual(pts[0].gravite, 'attention');
  assert.ok(!Ct.controler(et).some(x => x.categorie === 'guide' && /couverts par les calculs/.test(x.texte)), 'pas en double dans le reste à faire');
  // « Garder tels quels » : l'étape est faite tant que la liste ne change pas
  et.guideFaits = { 'couverture-cctp': { le: '2026-11-15', sig: g2.signature } };
  assert.ok(G.restesAFaire(et).etapes.find(x => x.id === 'couverture-cctp').fait);
});

test('thermofrigopompe sans appoint : un seul générateur au métré (schéma froid), couvert par la ligne du dossier', () => {
  const inv = [
    it('t', 'pac-eau', 'producteur', 'Thermofrigopompe ACME', { P: 120, Pfr: 90, details: { recup: 'totale' }, carac: { regimeFroid: '7/12', regimeChaud: '45/40' } }),
    it('r', 'radiateurs', 'emetteur', 'Radiateurs ACME', { qte: 4, P: 2 }),
    it('v', 'ventilo', 'emetteur', 'Ventilo-convecteurs ACME', { qte: 4, P: 2, Pfr: 2, alim: 'change-over' }),
  ];
  const et = { id: 'e1', typeBatiment: 'bureaux', notes: [], inventaire: inv };
  EA.creerTout(et, { uid: uid() });
  const pids = et.notes.filter(n => n.type === 'pid');
  assert.strictEqual(pids.length, 2);
  assert.ok(pids.some(n => n.entrees.machineRecup === 'oui'));
  const gens = Me.metre(et).filter(p => /^gen\|/.test(p.cle));
  assert.strictEqual(gens.length, 1, 'la machine n\'est pas comptée deux fois');
  assert.ok(!Me.metre(et).some(p => /^cctp\|pac/.test(p.cle)), 'couverte par le schéma froid (puissance frigorifique)');
});

test('CCTP : valeur et unité renvoyées à la ligne (« 32.5 kW dont … ») ne font pas un article ; composition de CTA par sections', () => {
  const lignes = [
    '6.2 CTA ACME SALLE',
    'L\'entreprise installera une centrale double flux de 2000 m3/h de marque ACME ou équivalent.',
    '6.2.1 Composition',
    'Récupérateur rotatif - Rendement 81 %',
    'Filtres à poches ePM1 55%',
    'Groupe moto-ventilateur (Soufflage)',
    '- Débit : 2000 m3/h',
    '- Puissance électrique absorbée au point de fonctionnement nominal : 1.2 KW',
    '- Puissance nominale : 2,2 KW',
    'Section Batterie Eau Glacée',
    '- Batterie eau glacée 8 rangs, régime d’eau 7/12 °C, puissance',
    '32.5 kW dont 20.1 kW sensible, débit = 5.6 m3/h eau.',
    'Section Batterie Eau Chaude',
    '- Batterie eau chaude 1 rang, régime 45/40 °C, puissance',
    '7 KW, débit eau = 1.2 m3/h',
    'Groupe moto-ventilateur (Rejet)',
    '- Puissance électrique absorbée au point de fonctionnement nominal : 800 W',
    '6.3 VENTILATION SIMPLE FLUX',
  ];
  const an = C.analyser(lignes);
  assert.ok(!an.articlesDetail.some(a => /^32/.test(a.num)), 'pas d\'article « 32.5 »');
  assert.match(an.articlesDetail.find(a => a.num === '6.2.1').texte, /32\.5 kW dont/);
  const c = I.compositionCta(an.articlesDetail.find(a => a.num === '6.2.1').texte);
  assert.deepStrictEqual(c, { rendement: 81, Pfr: 32.5, Pch: 7, Pel: 2 });
  const x = I.depuisCctp(an.equipements, [], an.articlesDetail).find(e => e.genre === 'cta');
  assert.deepStrictEqual([x.P, x.Pfr, x.Pel, x.Q, x.carac.rendement], [7, 32.5, 2, 2000, 81]);
  assert.ok(x.details.batteries.chaude && x.details.batteries.froide);
});

test('split en deux lignes (unité extérieure + unité intérieure) : un terminal par unité intérieure', () => {
  const inv = [
    it('e', 'split', 'emetteur', 'Unité extérieure ACME RX-25', { qte: 2 }),
    it('i', 'split', 'emetteur', 'Unité intérieure murale ACME FX-25', { qte: 2 }),
  ];
  assert.strictEqual(I.versTerminaux(inv).appareils.length, 2);
  // Unité extérieure seule (multi-split décrit par son groupe) : gardée
  assert.strictEqual(I.versTerminaux([inv[0]]).appareils.length, 2);
});

test('liste de points GTB prescrite au CCTP : lue par classe (PDF image mal lu), reprise par la régulation, signalée tant qu\'elle manque', () => {
  const texte = 'La liste des points sera la suivante : Téléalarmes (TA) : - Défaut ventilateurs 2TA - Thermostat antigel 1TA 3TA '
    + 'Télésignalisations (TS) : - Retour de marche CTA 1TS aTS Télémesure (TM) : - Température soufflage 1 TM - Température reprise 17TM - Pression reprise 17M 3TM '
    + 'Télécommande (TC) : - Autorisation de marche 1TC 1TC Téléréglage (TRU) : - Ventilateur soufflage (variateur) 1 TRU';
  const p = I.pointsPrescrits(texte);
  assert.deepStrictEqual([p.TA, p.TS, p.TM, p.TC, p.TR, p.total], [3, 1, 3, 1, 1, 9]);
  assert.deepStrictEqual(p.lignes.filter(l => l.classe === 'TM').map(l => [l.libelle, l.n]), [['Température soufflage', 1], ['Température reprise', 1], ['Pression reprise', 1]]);
  assert.strictEqual(I.pointsPrescrits('Voir liste de points en annexe'), null);
  // Article « Configuration des points » sous l'article de la CTA : rattaché à la CTA
  const lignes = ['7.1 CTA ACME HALL', 'Centrale double flux ACME de 1500 m3/h.', '7.1.4 Régulation', 'Analyse fonctionnelle.', '7.1.4.5 Configuration des points CTA', texte, '7.2 EXTRACTION'];
  const an = C.analyser(lignes), x = I.depuisCctp(an.equipements, [], an.articlesDetail).find(e => e.genre === 'cta');
  assert.strictEqual(x.details.pointsCctp.total, 9);
  assert.strictEqual(x.details.pointsCctp.source, 'CCTP art. 7.1.4.5');
  const l = I.versElec([{ ...x, id: 'c1', repere: 'CTA-1' }])[0];
  assert.deepStrictEqual(l.pointsCctp.slice(0, 3), [['Défaut ventilateurs (1)', 'ETOR'], ['Défaut ventilateurs (2)', 'ETOR'], ['Alarme thermostat antigel', 'ETOR']]);
  assert.strictEqual(l.pointsCctp.length, 9);
  // Étude : points de l'automate = liste du CCTP ; guide sans écart ; liste retirée → écart signalé
  const inv = [it('c1', 'cta', 'emetteur', 'CTA ACME hall', { repere: 'CTA-1', Q: 1500, principal: true, details: { batteries: { chaude: true }, pointsCctp: x.details.pointsCctp } })];
  const et = { id: 'e1', typeBatiment: 'bureaux', notes: [], inventaire: inv };
  EA.creerTout(et, { uid: uid() });
  const L = require('../etudes/public/js/liens'), elec = et.notes.find(n => n.type === 'elec');
  const pts = L.calculer(et, elec).valeurs.listePoints.filter(q => q[0] === 'CTA-1');
  assert.deepStrictEqual(['TA', 'TS', 'TM', 'TC', 'TR'].map(c => pts.filter(q => q[4] === c).length), [3, 1, 3, 1, 1]);
  assert.ok(G.restesAFaire(et).etapes.find(s => s.id === 'points-cctp').fait);
  elec.entrees.equipements.forEach(q => { delete q.pointsCctp; });
  const s = G.restesAFaire(et).etapes.find(y => y.id === 'points-cctp');
  assert.ok(!s.fait && /CTA-1 : 9 prescrits \(3 TA, 1 TS, 3 TM, 1 TC, 1 TR, CCTP art\. 7\.1\.4\.5\)/.test(s.info), s.info);
});

test('puissance bornée (« batterie de puissance mini < 3 kW ») : pas la puissance de l\'équipement', () => {
  assert.deepStrictEqual(I.puissances('Ventilo-convecteur ACME avec batterie électrique de puissance mini <3 KW) pour la mi-saison'), {});
  assert.deepStrictEqual(I.puissances('Ventilo-convecteur ACME, puissance calorifique 2,5 kW'), { Pch: 2.5 });
});
