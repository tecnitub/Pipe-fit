// Guide « Reste à faire » complet (guide-etude.js) : phases Étude → Exploitation, étapes d'achats, de cohérence, de
// chantier, de mise en service, de réception, de DOE et d'exploitation (données du chantier passées en paramètre),
// calculs annexes suggérés par le dossier, étapes bloquées et dépendances, tri par impact, correction sur place,
// suivi des étapes (SuiviEtapes facultatif). Données fictives (« ACME », « Exemplair »).
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Notes = N;
['schema', 'cta', 'equilibrage', 'industriel', 'aeraulique-schema', 'terminaux', 'electricite', 'sanitaire', 'pieces'].forEach(m => require(`../etudes/public/js/${m}`));
const EA = require('../etudes/public/js/etude-auto');
const G = require('../etudes/public/js/guide-etude');

const it = (id, genre, categorie, designation, x = {}) => ({ id, genre, categorie, designation, qte: 1, inclus: true, sources: [`DPGF ${id}`], ...x });
let k = 0;
const uid = () => `n${++k}`;
function etude(x = {}) {
  const et = { id: 'e1', objet: 'Groupe scolaire ACME', typeBatiment: 'bureaux', neuf: 'non', notes: [],
    inventaireReseaux: [{ id: 'r1', nom: 'Réseau radiateurs', nature: 'chauffage', hydro: true, sources: [] }],
    inventaire: [it('c1', 'chaudiere-cond', 'producteur', 'Chaudière gaz ACME', { qte: 2, regime: '70/50', P: 60 }), it('c2', 'radiateurs', 'emetteur', 'Radiateurs ACME', { qte: 8, reseau: 'r1' }),
      it('c3', 'ecs', 'producteur', 'Production ECS collective avec bouclage'), it('c5', 'split', 'emetteur', 'Système DRV 3 tubes, charge 12 kg de R410A'),
      it('c6', 'ventilateur', 'auxiliaire', 'Extracteur de hotte de cuisine professionnelle'), it('c4', 'cta', 'emetteur', 'CTA double flux ACME', { principal: true, alim: 'chauffage', details: { batteries: { chaude: true } }, local: 'Réfectoire' })], ...x };
  EA.creerTout(et, { uid });
  return et;
}
const par = (r, id) => r.etapes.find(x => x.id === id);

test('phases : identifiants uniques, champ phase, phases à venir tant que l\'étude n\'est pas reliée au chantier', () => {
  const et = etude();
  let r = G.restesAFaire(et, { controle: false });
  assert.strictEqual(new Set(r.etapes.map(x => x.id)).size, r.etapes.length);
  assert.ok(r.etapes.every(x => G.PHASES.some(p => p[0] === x.phase)));
  assert.deepStrictEqual(G.PHASES.map(p => p[0]), ['etude', 'achats', 'chantier', 'mes', 'reception', 'doe', 'exploitation']);
  // Les groupes existants sont dans la phase Étude ; ordre logique des phases et des groupes gardé
  ['climat', 'creer-pid', 'erreurs', 'emission', 'chantier'].forEach(id => assert.strictEqual(par(r, id).phase, 'etude', id));
  const rang = r.etapes.map(x => G.GROUPES.findIndex(g => g[0] === x.groupe));
  assert.deepStrictEqual(rang, rang.slice().sort((a, b) => a - b));
  assert.deepStrictEqual(r.phases.filter(p => p.active).map(p => p.id), ['etude']);
  // Progression globale = phases en cours ; progression et étape suivante par phase
  const etu = r.phases.find(p => p.id === 'etude');
  assert.deepStrictEqual([r.total, r.faits], [etu.total, etu.faits]);
  assert.ok(etu.suivante && etu.suivante.phase === 'etude' && r.suivante === etu.suivante);
  // Étude reliée au chantier : toutes les phases s'appliquent, réception / DOE / contrat apparaissent
  et.affaireId = 'af1';
  r = G.restesAFaire(et, { controle: false });
  assert.deepStrictEqual(r.phases.filter(p => p.active).map(p => p.id), G.PHASES.map(p => p[0]));
  ['reception:pv', 'doe:dossier', 'exploitation:contrat'].forEach(id => assert.ok(par(r, id), id));
  assert.ok(r.total > etu.total);
});

test('calculs annexes suggérés par le CCTP / DPGF : mots-clés, seuil des fluides frigorigènes, calcul déjà créé', () => {
  const et = etude();
  const s = G.suggestionsAnnexes(et), types = s.map(x => x.type);
  ['hotte', 'legionelle', 'drv', 'chaufferie', 'radiateurs', 'airNeuf', 'fluides'].forEach(t => assert.ok(types.includes(t), t));
  assert.ok(!types.includes('piscine') && !types.includes('parking'));
  assert.match(s.find(x => x.type === 'fluides').detail, /12 kg de R410A ≈ 25,1 t éq\. CO₂ \(seuil 5 t\)/);
  assert.match(s.find(x => x.type === 'chaufferie').detail, /120 kW/);
  const r = G.restesAFaire(et, { controle: false }), h = par(r, 'annexe:hotte');
  assert.deepStrictEqual([h.groupe, h.phase, h.fait, h.action[0]], ['annexes', 'etude', false, 'annexe:hotte']);
  assert.match(h.info, /Extracteur de hotte de cuisine professionnelle.*DPGF c6/);
  // Texte lu : piscine, parking, chambre froide, géothermie, solaire, eaux de pluie, puits canadien, traitement d'eau
  const t = G.suggestionsAnnexes({ inventaire: [it('x1', 'autre', 'auxiliaire', 'Divers', { _texte: 'Déshumidification de la piscine, ventilation du parking souterrain, chambre froide négative, champ de sondes géothermiques, capteurs solaires thermiques, cuve de récupération des eaux de pluie, puits canadien, pot à boues et désembouage. Groupe froid R32 charge 3 kg.' })] }).map(x => x.type);
  ['piscine', 'parking', 'chambreFroide', 'geothermie', 'solaireEcs', 'eauxDePluie', 'puitsCanadien', 'traitementEau'].forEach(x => assert.ok(t.includes(x), x));
  assert.ok(!t.includes('fluides'), '3 kg de R32 ≈ 2 t éq. CO₂ : sous le seuil');
  // Calcul créé : l'étape est faite
  et.notes.push({ id: 'h1', type: 'hotte', titre: 'Hotte', entrees: {} });
  assert.ok(par(G.restesAFaire(et, { controle: false }), 'annexe:hotte').fait);
});

test('achats : gammes, matériel à choisir / soumettre / en attente / refusé, consultations, devis, commandes bloquées, livraisons', () => {
  const et = etude({ affaireId: 'af1' });
  et.equipements = [...(et.equipements || []), { id: 'g1', type: 'pompe', fabricant: 'ACME Pompes', reference: '', nom: 'Gamme CIRCU', valeurs: {}, gamme: { titre: 'CIRCU', modeles: [{ ref: 'CIRCU 25-40' }, { ref: 'CIRCU 25-60' }] } }];
  let r = G.restesAFaire(et, { controle: false });
  const g = par(r, 'achats:gamme:g1');
  assert.deepStrictEqual([g.phase, g.groupe, g.editeur.type], ['achats', 'gammes', 'gamme']);
  const ch = par(r, 'achats:choisir');
  assert.ok(ch && !ch.fait && /équipement\(s\)/.test(ch.info));
  // Lignes du matériel : une validée, une soumise (relance), une refusée, une à soumettre
  const MR = require('../public/js/materiel-retenu'), Mt = require('../etudes/public/js/metre');
  const cles = Mt.metre(et).filter(Mt.estEquipement).map(p => p.cle);
  assert.ok(cles.length >= 4);
  et.materiel = { [cles[0]]: { fabricant: 'ACME', reference: 'V-1', statut: 'Validé' }, [cles[1]]: { fabricant: 'ACME', reference: 'S-1', statut: 'Soumis au client', dateSoumission: '2026-10-01' },
    [cles[2]]: { fabricant: 'ACME', reference: 'R-1', statut: 'Refusé', obs: 'Marque imposée' }, [cles[3]]: { fabricant: 'ACME', reference: 'A-1' } };
  r = G.restesAFaire(et, { controle: false, aujourdhui: '2026-11-15' });
  assert.match(par(r, 'achats:attente').info, /sans réponse depuis plus de 15 jours/);
  assert.match(par(r, `achats:refuse:${cles[2]}`).info, /refusé par le client \(Marque imposée\)/);
  assert.ok(!par(r, 'achats:soumettre').fait);
  assert.ok(!par(r, 'achats:consulter'), 'sans données du chantier : pas d\'étape de consultation');
  // Données du chantier : consultation sans offre, offre reçue sans prix, commande sans date, retard sur le planning
  const suivis = [{ cle: cles[0], achat: { etat: 'commande', commande: 'CF-12', prevue: '' } }, { cle: cles[1], achat: { etat: 'consulte', consultation: 'CO-3' } }, { cle: cles[3], achat: { etat: 'offre' } }];
  const chantier = { suivis, mises: [], reserves: { levees: [], affectees: [] }, alertesAppro: [{ cle: `e1|${cles[0]}`, niveau: 'erreur', phase: 'Production', texte: 'Pompe : livraison prévue le 2026-12-10, après le début de « Production » (2026-12-01).' }] };
  r = G.restesAFaire(et, { controle: false, chantier, aujourdhui: '2026-11-15' });
  assert.match(par(r, 'achats:offres').info, /CO-3/);
  assert.ok(par(r, 'achats:devis-lire'));
  assert.match(par(r, 'achats:livraison').info, /CF-12/);
  assert.match(par(r, `achats:retard:${cles[0]}`).info, /après le début/);
  const cmd = par(r, 'achats:commander');
  assert.ok(!cmd.fait && cmd.bloquee, 'commande bloquée : aucune ligne à commander n\'est validée');
  assert.match(cmd.motifBlocage, /matériel non validé par le client/);
  assert.ok(cmd.bloqueurs.includes('achats:attente') && cmd.bloqueurs.includes(`achats:refuse:${cles[2]}`));
  // Ligne validée à commander : la commande n'est plus bloquée
  suivis[0].achat = { etat: 'offre' };
  et.materiel[cles[0]].prix = { pu: 100, fournisseur: 'ACME' };
  r = G.restesAFaire(et, { controle: false, chantier, aujourdhui: '2026-11-15' });
  assert.ok(!par(r, 'achats:commander').bloquee);
  assert.match(par(r, 'achats:commander').info, /1 validée\(s\) prête\(s\)/);
  // Deux devis lus : à comparer, confirmé à la main (signature), rouvert par un nouveau devis
  et.devisFournisseurs = [{ id: 'd1', fournisseur: 'ACME', numero: 'D1' }, { id: 'd2', fournisseur: 'Exemplair', numero: 'D2' }];
  r = G.restesAFaire(et, { controle: false });
  const dc = par(r, 'achats:devis-comparer');
  assert.deepStrictEqual([dc.fait, dc.confirmer], [false, 'fait:achats:devis-comparer']);
  et.guideFaits = { 'achats:devis-comparer': { le: '2026-11-15', sig: dc.signature } };
  assert.ok(par(G.restesAFaire(et, { controle: false }), 'achats:devis-comparer').fait);
  et.devisFournisseurs.push({ id: 'd3', fournisseur: 'ACME', numero: 'D3' });
  assert.ok(!par(G.restesAFaire(et, { controle: false }), 'achats:devis-comparer').fait);
});

test('chantier, réception, DOE, exploitation : pose, plaques, substitution, réserves, PV de régulation, relevés après 12 mois', () => {
  const et = etude({ affaireId: 'af1' });
  const Mt = require('../etudes/public/js/metre'), cles = Mt.metre(et).filter(Mt.estEquipement).map(p => p.cle);
  et.materiel = { [cles[0]]: { fabricant: 'ACME', reference: 'P-40', statut: 'Validé' }, [cles[1]]: { fabricant: 'ACME', reference: 'V-20', statut: 'Validé' } };
  const chantier = {
    suivis: [{ cle: cles[0], poseLe: '2025-09-01', mesLe: '2025-10-01', plaque: { marque: 'Exemplair', modele: 'XZ-9' } }, { cle: cles[1], poseLe: '2025-09-02' }],
    mises: [{ id: 'm1', type: 'gtb', equipement: 'Réglages de la régulation — armoire', statut: 'Brouillon' }],
    reserves: { affectees: [{ cle: 'x1', numero: 'R1', assigneA: '' }], levees: [{ cle: 'x2', le: '2025-10-05', numero: 'R2' }] },
  };
  const r = G.restesAFaire(et, { controle: false, chantier, aujourdhui: '2026-11-15' });
  assert.ok(par(r, 'chantier:pose').fait);
  assert.match(par(r, 'chantier:plaques').info, /1 équipement\(s\) posé\(s\) sans plaque lue/);
  assert.match(par(r, `chantier:substitution:${cles[0]}`).info, /substitution/);
  assert.ok(!par(r, 'chantier:reserves').fait);
  assert.match(par(r, 'chantier:reserves-affecter').info, /R1/);
  assert.ok(par(r, 'chantier:reserves-cocher'));
  // Réception bloquée : PV de régulation non signé
  const rec = par(r, 'reception:pv');
  assert.ok(rec.bloquee && /PV de régulation non signé/.test(rec.motifBlocage));
  assert.strictEqual(rec.phase, 'reception');
  // Relevés de compteurs : mise en service il y a plus de 12 mois, aucun relevé
  const rel = par(r, 'exploitation:releves');
  assert.ok(rel && !rel.fait && /01\/10\/2025/.test(rel.info));
  et.comptages = { releves: [{ compteur: 'CPT-GAZ', date: '2026-10-20', index: 1200 }] };
  assert.ok(par(G.restesAFaire(et, { controle: false, chantier, aujourdhui: '2026-11-15' }), 'exploitation:releves').fait);
  // DOE : pièces manquantes données par le chantier ; contrat d'entretien créé ; réception prononcée
  const r2 = G.restesAFaire(et, { controle: false, chantier: { ...chantier, doe: { pieces: [{ libelle: 'Plans de récolement', present: false }, { libelle: 'PV d\'essais', present: true }] }, contrat: { id: 'ct1' }, reception: { date: '2026-01-15' } }, aujourdhui: '2026-11-15' });
  assert.match(par(r2, 'doe:pieces').info, /1 pièce\(s\) manquante\(s\) : Plans de récolement/);
  assert.ok(!par(r2, 'doe:dossier'));
  assert.ok(par(r2, 'exploitation:contrat').fait && par(r2, 'reception:pv').fait);
});

test('cohérence et blocages : conséquences de révision, émission bloquée par le contrôle global, diffusion par l\'émission', () => {
  const et = etude({ affaireId: 'af1' });
  et.consequences = [{ cle: 'materiel|x', categorie: 'materiel', titre: 'Pompe P1 : débit 2 → 3 m³/h', statut: 'ouvert' }, { cle: 'armoire|y', categorie: 'armoire', titre: 'CTA-01 : puissance 2 → 3 kW', statut: 'vu' }];
  const r = G.restesAFaire(et);
  const c = par(r, 'coherence:consequences:materiel');
  assert.deepStrictEqual([c.groupe, c.phase, c.action[0]], ['coherence', 'etude', 'consequences']);
  assert.ok(!par(r, 'coherence:consequences:armoire'), 'conséquence déjà vue');
  // Le contrôle global relève des points bloquants (calculs incomplets) : émission bloquée, motif et lien
  const em = par(r, 'emission');
  assert.ok(em.bloquee && /point\(s\) bloquant\(s\) au contrôle/.test(em.motifBlocage));
  assert.deepStrictEqual(em.bloque.action[0], 'controle');
  const di = par(r, 'diffusion');
  assert.ok(di.bloquee && di.bloqueurs.includes('emission'));
  // L'étape suivante n'est jamais une étape bloquée tant qu'il en reste une libre ; tri par impact
  assert.ok(!r.suivante.bloquee);
  assert.deepStrictEqual(r.restes.map(x => x.impact), r.restes.map(x => x.impact).slice().sort((a, b) => b - a));
  assert.strictEqual(r.suivante, r.restes.find(x => !x.bloquee && r.actives.includes(x.phase)));
  assert.ok(r.phases.every(p => !p.suivante || !p.suivante.bloquee || r.restes.filter(x => x.phase === p.id).every(x => x.bloquee)));
});

test('impact : une étape dont d\'autres dépendent passe devant, à gravité égale l\'ordre logique', () => {
  const etapes = [
    { id: 'a', phase: 'etude', groupe: 'valeurs', titre: 'A', fait: false, info: '' },
    { id: 'b', phase: 'etude', groupe: 'valeurs', titre: 'B', fait: false, info: '' },
    { id: 'c', phase: 'etude', groupe: 'emission', titre: 'C', fait: false, info: '', bloquePar: ['b'] },
    { id: 'd', phase: 'etude', groupe: 'emission', titre: 'D', fait: false, info: '', bloquePar: ['c'] },
    { id: 'e', phase: 'achats', groupe: 'validation', titre: 'E', fait: false, info: '', gravite: 9 },
  ];
  const r = G.synthese(etapes, new Set(['etude']));
  assert.deepStrictEqual(r.restes.slice(0, 2).map(x => x.id), ['e', 'b']);
  assert.strictEqual(r.suivante.id, 'b', 'phase Achats à venir : pas d\'étape suivante globale');
  assert.strictEqual(etapes[1].dependants, 2);
  assert.deepStrictEqual([etapes[2].bloquee, etapes[3].bloquee, etapes[3].motifBlocage], [true, true, 'c']);
  assert.strictEqual(r.phases.find(p => p.id === 'achats').suivante.id, 'e');
  // Bloqueur fait : débloquée
  etapes[1].fait = true;
  const r2 = G.synthese(etapes, new Set(['etude']));
  assert.deepStrictEqual([etapes[2].bloquee, r2.suivante.id], [false, 'c']);
});

test('correction sur place : valeurs par défaut, valeurs estimées, modèle d\'une gamme, données de l\'étude', () => {
  const et = etude();
  let r = G.restesAFaire(et, { controle: false });
  const v = r.etapes.find(x => x.groupe === 'valeurs' && x.editeur && x.editeur.champs.length);
  const ch = v.editeur.champs[0], n = et.notes.find(x => x.id === v.editeur.note);
  const res = G.corriger(et, v, { [ch.chemin]: '42,5' });
  assert.ok(res.ok && res.valeurs >= 1);
  const [o, cle] = (() => { const p = ch.chemin.split('.'), c = p.pop(); return [p.reduce((x, s) => x[/^\d+$/.test(s) ? +s : s], n.entrees), c]; })();
  assert.strictEqual(o[cle], 42.5);
  // Valeurs estimées : confirmées une à une (marque retirée), valeur remplacée
  const Es = require('../etudes/public/js/estimations');
  const nt = et.notes[0];
  Es.marquer(nt.entrees, 'Tdep', 75, 'ratio usuel');
  r = G.restesAFaire(et, { controle: false });
  const e = par(r, `estimees:${nt.id}`);
  assert.strictEqual(e.editeur.type, 'estimees');
  assert.ok(G.corriger(et, e, { Tdep: '80' }).ok);
  assert.deepStrictEqual([nt.entrees.Tdep, Es.estMarque(nt.entrees, 'Tdep')], [80, false]);
  assert.ok(!par(G.restesAFaire(et, { controle: false }), `estimees:${nt.id}`));
  // Gamme : modèle retenu, gamme retirée, étape disparue
  et.equipements = [...(et.equipements || []), { id: 'g1', type: 'pompe', fabricant: 'ACME Pompes', reference: '', nom: 'Gamme CIRCU', valeurs: {}, gamme: { titre: 'CIRCU', modeles: [{ ref: 'CIRCU 25-40', H: 4 }, { ref: 'CIRCU 25-60', H: 6 }] } }];
  const g = par(G.restesAFaire(et, { controle: false }), 'achats:gamme:g1');
  assert.ok(!G.corriger(et, g, {}).ok);
  assert.ok(G.corriger(et, g, { modele: '1' }).ok);
  assert.strictEqual(et.equipements.find(x => x.id === 'g1').reference, 'CIRCU 25-60');
  assert.ok(!par(G.restesAFaire(et, { controle: false }), 'achats:gamme:g1'));
  // Climat : écrit dans l'étude
  delete et.climat;
  const cl = par(G.restesAFaire(et, { controle: false }), 'climat');
  assert.ok(G.corriger(et, cl, { climat: 'H1a' }).ok && et.climat === 'H1a');
});

test('suivi des étapes (SuiviEtapes) : décoration, « sans objet » compté fait, absent sans erreur', () => {
  const et = etude();
  const sans = G.restesAFaire(et, { controle: false });
  global.SuiviEtapes = { decorer: (e, l) => l.map(x => (x.id === 'bilans' ? { ...x, fait: true, sansObjet: true, motif: 'Bilan fourni par le BET' } : { ...x, responsable: 'Exemplair' })) };
  try {
    const r = G.restesAFaire(et, { controle: false });
    assert.ok(par(r, 'bilans').fait && par(r, 'bilans').sansObjet);
    assert.strictEqual(par(r, 'climat').responsable, 'Exemplair');
    assert.strictEqual(r.faits, sans.faits + 1);
    assert.ok(!G.restesAFaire(et, { controle: false, suivi: false }).etapes.find(x => x.id === 'bilans').fait);
  } finally { delete global.SuiviEtapes; }
});
