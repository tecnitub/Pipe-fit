// Calculs annexes → analyse fonctionnelle (séquences démarrage / marche / arrêt / défaut / réarmement, paramètres par
// défaut à valider), métré (chiffrage, matériel retenu) et matériel retenu cité dans la régulation et la table d'échange.
// Données fictives (fabricants « Exemplair », « ACME »).
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Notes = N;
['schema', 'cta', 'equilibrage', 'industriel', 'aeraulique-schema', 'terminaux', 'sanitaire'].forEach(m => require(`../etudes/public/js/${m}`));
const AE = require('../etudes/public/js/annexes-elec');
const E = require('../etudes/public/js/electricite'), L = require('../etudes/public/js/liens'), Rg = require('../etudes/public/js/regulation');
const G = require('../etudes/public/js/gtb'), M = require('../etudes/public/js/metre');

let k = 0;
const nn = (type, x = {}) => ({ id: `n${++k}`, type, titre: N.TYPES[type].titre, entrees: { ...N.defauts(type), ...x } });
const EXTRA = { fluides: { equipements: [{ rep: 'GF1', fluide: 'R410A', charge: 300 }] }, eauxDePluie: { S: 500, besoins: [{ usage: 'wc', q: 20 }] },
  plancher: { locaux: [{ local: 'Hall', S: 60, P: 3, rev: 'carrelage' }] } };
const AVEC_MATERIEL = ['hotte', 'parking', 'piscine', 'geothermie', 'solaireEcs', 'legionelle', 'plancher', 'plafonds', 'echangeurPlaques', 'drv', 'chambreFroide', 'fluides', 'puitsCanadien', 'eauxDePluie', 'traitementEau'];
const instDe = (et, n) => Rg.contexte(et, L).installations.find(x => x.noteId === n.id);
const phases = s => s.map(l => l[0]);
const txt = s => s.map(l => l.join(' ')).join(' \n ');

test('chaque calcul annexe qui pose du matériel a son installation : analyse fonctionnelle, cinq phases, paramètres', () => {
  AVEC_MATERIEL.forEach(t => {
    const n = nn(t, EXTRA[t]), et = { notes: [n] }, x = instDe(et, n);
    assert.ok(x, `${t} : installation absente`);
    assert.strictEqual(x.annexe, t);
    assert.ok(x.af.length >= 1, t);
    const s = G.sequences(x, t);
    assert.deepStrictEqual(phases(s), ['Démarrage', 'Marche normale', 'Arrêt', 'Défaut', 'Réarmement'], t);
    assert.ok(s.every(l => l.length === 3 && l[1]), t);
    assert.ok(x.params.length >= 1 && x.params.every(p => p.libelle && Number.isFinite(p.valeur)), t);
  });
});

test('seulement les annexes présentes ; calculs sans matériel : aucune installation', () => {
  assert.strictEqual(Rg.contexte({ notes: [] }, L).installations.length, 0);
  ['radiateurs', 'conduitFumee', 'energieAnnuelle', 'aidesCee', 'airNeuf', 'confort', 'eauxPluviales', 'calorifugeEco', 'chaufferie'].forEach(t => {
    const n = nn(t); assert.strictEqual(instDe({ notes: [n] }, n), undefined, t);
  });
  // Détection de fuite : seulement si un équipement l'exige
  const f = nn('fluides', { equipements: [{ rep: 'GF2', fluide: 'R410A', charge: 2 }] });
  assert.strictEqual(instDe({ notes: [f] }, f), undefined);
});

test('hotte : gaz ouvert seulement avec l\'extraction en marche et le pressostat établi, réarmement manuel', () => {
  const n = nn('hotte'), x = instDe({ notes: [n] }, n), s = G.sequences(x, 'hotte');
  assert.match(s[0][1], /ouverture de EVG-EXT-CUI quand DP-EXT-CUI est établi/);
  assert.match(x.af.join(' '), /ouverte seulement si l'extraction tourne.*pressostat DP-EXT-CUI/);
  assert.match(s[3][1], /fermeture de EVG-EXT-CUI, alarme P1/);
  assert.match(s[4][1], /Réarmement manuel/);
  assert.ok(x.params.some(p => /Seuil du pressostat.*\(à valider\)/.test(p.libelle) && p.valeur === 50));
});

test('parking : petite / grande vitesse et alarme aux seuils de CO (20 / 50 / 100 ppm par défaut, valeurs du calcul sinon)', () => {
  const n = nn('parking', { gaz: 'co' }), x = instDe({ notes: [n] }, n), s = txt(G.sequences(x, 'parking'));
  assert.match(s, /Petite vitesse .* CO > 20 ppm/); assert.match(s, /Grande vitesse .* CO > 50 ppm/); assert.match(s, /CO > 100 ppm : alarme P1/);
  assert.ok(x.params.some(p => p.libelle === 'CO : seuil de petite vitesse (à valider)' && p.valeur === 20));
  assert.ok(!x.params.some(p => /NO₂/.test(p.libelle)));
  const m = nn('parking', { gaz: 'co', coPV: 25, coGV: 60 }), y = instDe({ notes: [m] }, m);
  assert.ok(y.params.some(p => p.libelle === 'CO : seuil de petite vitesse' && p.valeur === 25), 'valeur du calcul sans « à valider »');
  assert.match(txt(G.sequences(y, 'parking')), /CO > 60 ppm/);
});

test('bouclage : alarme retour < 50 °C ; plancher : coupure du circulateur ; plafonds : vanne fermée sur condensation, départ ≥ rosée + 2 K', () => {
  const b = nn('legionelle'), xb = instDe({ notes: [b] }, b);
  assert.match(G.sequences(xb, 'legionelle')[3][1], /Retour d'une boucle < 50 °C/);
  assert.ok(xb.params.some(p => /retour de bouclage/.test(p.libelle) && p.valeur === 50));
  const pl = nn('plancher'), xp = instDe({ notes: [pl] }, pl);
  assert.match(xp.af[0], /Thermostat de sécurité TS-PL .* circulateur/);
  assert.match(G.sequences(xp, 'plancher')[3][1], /TS-PL coupe le circulateur/);
  const pf = nn('plafonds'), xf = instDe({ notes: [pf] }, pf), Tros = N.calculer('plafonds', pf.entrees).valeurs.Tros;
  assert.match(G.sequences(xf, 'plafonds')[3][1], /Condensation détectée \(DC-PF\) : vanne de la zone fermée/);
  const mini = xf.params.find(p => /Départ mini \(rosée \+ 2 K\)/.test(p.libelle));
  assert.ok(Math.abs(mini.valeur - (Tros + 2)) < 0.01);
});

test('solaire : écarts de marche / arrêt et surchauffe ; géothermie : arrêt de la PAC sur défaut de débit ou de pression', () => {
  const s = nn('solaireEcs'), xs = instDe({ notes: [s] }, s);
  assert.ok(xs.params.some(p => /Écart de marche/.test(p.libelle) && p.valeur === 7) && xs.params.some(p => /Écart d'arrêt/.test(p.libelle) && p.valeur === 3));
  assert.ok(xs.params.some(p => /surchauffe/.test(p.libelle) && p.aValider));
  const g = nn('geothermie'), xg = instDe({ notes: [g] }, g);
  assert.match(G.sequences(xg, 'geothermie')[3][1], /Défaut de débit \(CD-GEO\) ou manque de pression \(PS-GEO\) : arrêt immédiat de la PAC/);
  assert.strictEqual(xg.app, 'production');
});

test('application de régulation des équipements annexes ; séquences et paramètres au calcul des armoires', () => {
  const g = nn('geothermie'), h = nn('hotte'), el = nn('elec'), et = { notes: [g, h, el] };
  assert.strictEqual(Rg.application({ src: `${g.id}:ann0`, type: 'pompe' }, { [g.id]: 'geothermie' }), 'production');
  assert.strictEqual(Rg.application({ src: `${h.id}:ann0`, type: 'ventilateur' }, { [h.id]: 'hotte' }), 'ventilation');
  el.entrees.equipements = E.fusionner(el.entrees.equipements, E.equipementsEtude(et, L), new Set(et.notes.map(n => n.id))).lignes;
  const r = L.calculer(et, el), gtb = r.onglets.find(o => o.titre === 'GTB et BACS').blocs, reg = r.onglets.find(o => o.titre === 'Régulation').blocs;
  assert.ok(gtb.some(b => b.titre === `Séquences — ${h.titre}`));
  assert.ok(reg.some(b => (b.titre || '').startsWith(`Analyse fonctionnelle — ${g.titre}`)));
  const params = reg.find(b => /^Paramètres à régler/.test(b.titre || ''));
  assert.ok(params.tableau.lignes.some(l => l[0] === h.titre && /\(à valider\)/.test(l[1])));
  // Cahier de programmation (automate) : consignes des annexes reprises
  const cah = r.valeurs.cahierProg[0], csg = cah.sections.find(x => x.titre === 'Consignes et paramètres');
  assert.ok(csg.lignes.some(l => l[1].startsWith(`${g.titre} — `)));
});

test('métré : équipements des annexes avec clés stables, chapitres connus du devis, heures de main-d\'œuvre', () => {
  const notes = AVEC_MATERIEL.map(t => nn(t, EXTRA[t])), et = { notes };
  const p = M.metre(et), ann = p.filter(x => /^annexe\|/.test(x.cle));
  const cle = c => ann.find(x => x.cle === c);
  ['annexe|geothermie|PG', 'annexe|geothermie|SGV', 'annexe|solaireEcs|CAPT-SOL', 'annexe|solaireEcs|PSOL', 'annexe|legionelle|PB-ECS', 'annexe|eauxDePluie|CUVE-EDP', 'annexe|eauxDePluie|P-EDP',
    'annexe|hotte|EXT-CUI', 'annexe|hotte|EVG-EXT-CUI', 'annexe|parking|EXT-PK', 'annexe|parking|EXT-PK-CO', 'annexe|piscine|CTA-PISC', 'annexe|chambreFroide|GF-CF', 'annexe|drv|UE1',
    'annexe|echangeurPlaques|ECH', 'annexe|fluides|DF-GF1', 'annexe|plancher|COLL-PL', 'annexe|puitsCanadien|TUBE-PC', 'annexe|traitementEau|CPT-APP'].forEach(c => assert.ok(cle(c), c));
  assert.strictEqual(cle('annexe|parking|EXT-PK').qte, 2);
  assert.strictEqual(cle('annexe|geothermie|SGV').qte, N.calculer('geothermie', notes[3].entrees).valeurs.n);
  assert.strictEqual(cle('annexe|puitsCanadien|TUBE-PC').unite, 'ml');
  ann.forEach(x => { assert.ok(M.CHAPITRES.includes(x.chapitre), `${x.cle} : ${x.chapitre}`); assert.ok(x.heures > 0, x.cle); assert.ok(x.qte > 0, x.cle); });
  // Matériel retenu : équipements proposés, lignes de devis dans les chapitres
  assert.ok(M.estEquipement(cle('annexe|geothermie|PG')) && M.estEquipement(cle('annexe|hotte|EVG-EXT-CUI')));
  const devis = M.lignesDevis(M.rapprocher(p, [], []), [], []);
  assert.ok(devis.some(l => l.type === 'chapitre' && l.titre === 'Énergies renouvelables') && devis.some(l => l.type === 'ouvrage' && /Groupe frigorifique de la chambre froide/.test(l.designation)));
  // Recherche dans la bibliothèque : mots-clés
  assert.ok(M.score({ designation: 'Capteur solaire plan vitré 2,3 m²' }, cle('annexe|solaireEcs|CAPT-SOL').recherche) > 0);
});

test('métré : pas de doublon avec la plomberie sanitaire (bouclage) ni le schéma (échangeur, désemboueur) ; 2e calcul suffixé', () => {
  const san = nn('sanitaire'), leg = nn('legionelle'), et = { notes: [san, leg] };
  assert.ok(N.calculer('sanitaire', san.entrees).valeurs.bouclage, 'sanitaire avec bouclage');
  const p = M.metre(et);
  assert.ok(p.some(x => x.cle === 'pompe|bouclage-ecs'));
  assert.ok(!p.some(x => x.cle === 'annexe|legionelle|PB-ECS'));
  assert.ok(p.some(x => x.cle === 'annexe|legionelle|SONDES-ECS'));
  const pid = nn('pid', { reseau: 'ch-55-45', generateur: 'chaudiere-cond', nGen: '1', Pgen: 60, bouteille: 'echangeur', pincement: 3, generateurs: [], circuits: [{ rep: 'RAD', emetteur: 'radiateurs', P: 15, regime: '50/40', regulation: '3v', L: 50 }] });
  const ech = nn('echangeurPlaques'), te = nn('traitementEau'), p2 = M.metre({ notes: [pid, ech, te] });
  assert.ok(!p2.some(x => x.cle === 'annexe|echangeurPlaques|ECH') && !p2.some(x => x.cle === 'annexe|traitementEau|DESEMB'));
  assert.ok(M.metre({ notes: [nn('echangeurPlaques', { source: '' })] }).some(x => x.cle === 'annexe|echangeurPlaques|ECH'));
  const a = nn('legionelle'), b = nn('legionelle'), p3 = M.metre({ notes: [a, b] });
  assert.ok(p3.some(x => x.cle === 'annexe|legionelle|PB-ECS') && p3.some(x => x.cle === 'annexe|legionelle|PB-ECS-N2'));
});

test('matériel retenu cité : métré, analyse fonctionnelle, fonctionnement des équipements et table d\'échange GTB', () => {
  const g = nn('geothermie'), pk = nn('parking'), el = nn('elec');
  const et = { notes: [g, pk, el], materiel: { 'annexe|geothermie|PG': { fabricant: 'Exemplair', reference: 'GX 25-6' }, 'annexe|parking|EXT-PK': { fabricant: 'ACME', reference: 'PK-30' } } };
  assert.match(M.metre(et).find(x => x.cle === 'annexe|geothermie|PG').designation, /— Exemplair GX 25-6$/);
  const ctx = Rg.contexte(et, L);
  assert.match(ctx.installations.find(x => x.noteId === g.id).af[0], /Pompe PG — Exemplair GX 25-6/);
  assert.match(ctx.installations.find(x => x.noteId === pk.id).af[0], /EXT-PK-1 et EXT-PK-2 — ACME PK-30/);
  el.entrees.equipements = E.fusionner(el.entrees.equipements, E.equipementsEtude(et, L), new Set(et.notes.map(n => n.id))).lignes;
  const r = L.calculer(et, el), reg = r.onglets.find(o => o.titre === 'Régulation').blocs, gtb = r.onglets.find(o => o.titre === 'GTB et BACS').blocs;
  const fonct = reg.find(b => b.titre === 'Fonctionnement de chaque équipement').liste;
  assert.ok(fonct.some(l => /^PG — Pompe des sondes géothermiques — Exemplair GX 25-6 :/.test(l)));
  const ech = gtb.find(b => /^Table d'échange GTB/.test(b.titre || '')).tableau;
  assert.strictEqual(ech.entetes[15], 'Matériel retenu');
  assert.ok(ech.lignes.filter(l => l[2] === 'PG').every(l => l[15] === 'Exemplair GX 25-6'));
  assert.ok(ech.lignes.some(l => l[2] === 'EXT-PK-2' && l[15] === 'ACME PK-30'));
  assert.ok(ech.lignes.filter(l => l[2] === 'TE-GEO').every(l => l[15] === ''));
  const cmd = r.valeurs.cahierProg[0].sections.find(x => x.titre === 'Commandes des moteurs');
  assert.ok(cmd.lignes.some(l => l[0] === 'PG' && /Exemplair GX 25-6/.test(l[1])));
});

test('matériel du registre : CTA reliée à un modèle, désignation portant déjà la référence', () => {
  const et = { equipements: [{ id: 'eqA', type: 'cta', fabricant: 'Exemplair', reference: 'CTA-4000', valeurs: {} }, { id: 'eqB', type: 'pompe', fabricant: 'Exemplair', reference: 'CX 40-8', valeurs: {} }],
    notes: [{ id: 'c1', type: 'cta', titre: 'CTA bureaux', entrees: { eq: 'eqA' } }] };
  const Mt = Rg.materiel(et, L);
  assert.strictEqual(Rg.materielDe(Mt, { src: 'c1:vs', type: 'ventilateur', rep: 'VS-N1', designation: 'Ventilateur de soufflage — CTA bureaux' }), 'Exemplair CTA-4000');
  assert.strictEqual(Rg.materielDe(Mt, { src: 'c1:tr', type: 'sonde', rep: 'TR', designation: 'Sonde de reprise' }), '');
  assert.strictEqual(Rg.materielDe(Mt, { src: 'p1:pc1', type: 'pompe', rep: 'PC1', designation: 'Pompe Radiateurs — Exemplair CX 40-8' }), 'Exemplair CX 40-8');
  assert.strictEqual(Rg.avecMateriel('Pompe Radiateurs', 'Exemplair CX 40-8'), 'Pompe Radiateurs — Exemplair CX 40-8');
  assert.strictEqual(Rg.avecMateriel('Pompe Radiateurs — Exemplair CX 40-8', 'Exemplair CX 40-8'), 'Pompe Radiateurs — Exemplair CX 40-8');
  // Table d'échange : colonne vide sans matériel, repère d'un groupe d'appareils (.01) rattaché au repère de base
  const t = G.echange([['P1', 'Commande de marche — P1', 'STOR', 'A1', 'TC', '', 'P1 — Pompe', 'Commande de marche'], ['T1.01', 'Mesure — T1', 'EA', 'A1', 'TM', '', 'T1 — Sonde', 'Mesure']], ['A1'], [], { materiel: { T1: 'ACME S-1' } });
  assert.strictEqual(t[0][15], ''); assert.strictEqual(t[1][15], 'ACME S-1');
});

test('branchement idempotent : un type qui a déjà ses propres crochets les garde', () => {
  AE.brancher(); AE.brancher();
  const T = N.TYPES.hotte;
  assert.strictEqual(typeof T.versRegulation, 'function'); assert.strictEqual(typeof T.versMetre, 'function'); assert.strictEqual(T.appRegulation, 'ventilation');
  assert.strictEqual(AE.cleMetre('hotte', 'EXT-CUI'), 'annexe|hotte|EXT-CUI');
});
