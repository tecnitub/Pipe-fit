// Contrôle global de l'étude avant envoi (controle-etude.js) : erreurs des calculs, valeurs estimées, paramètres à valider,
// réserves, gammes, matériel, incohérences entre calculs, fiches manquantes ; filtrage par destinataire, rapport
// imprimable, étape du guide. Données fictives (marque « ACME »).
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Notes = N;
['schema', 'cta', 'equilibrage', 'industriel', 'aeraulique-schema', 'terminaux', 'electricite', 'sanitaire', 'pieces'].forEach(m => require(`../etudes/public/js/${m}`));
const EA = require('../etudes/public/js/etude-auto');
const Es = require('../etudes/public/js/estimations');
const AX = require('../etudes/public/js/annexes-exploitation');
const Metre = require('../etudes/public/js/metre');
const L = require('../etudes/public/js/liens');
const G = require('../etudes/public/js/guide-etude');
const C = require('../etudes/public/js/controle-etude');

const it = (id, genre, categorie, designation, x = {}) => ({ id, genre, categorie, designation, qte: 1, inclus: true, sources: [`DPGF ${id}`], ...x });
let k = 0;
const uid = () => `n${++k}`;
const nn = (type, x = {}) => ({ id: uid(), type, titre: N.TYPES[type].titre, entrees: { ...N.defauts(type), ...x } });
// Chaufferie, radiateurs et CTA d'après le dossier, bilan pièce par pièce, hotte de cuisine (réserves), gamme au registre
function etude() {
  const et = { id: 'e1', objet: 'Groupe scolaire ACME', typeBatiment: 'bureaux', neuf: 'non', notes: [],
    inventaireReseaux: [{ id: 'r1', nom: 'Réseau radiateurs', nature: 'chauffage', hydro: true, sources: [] }, { id: 'r2', nom: 'Réseau CTA', nature: 'chauffage', hydro: true, sources: [] }],
    inventaire: [it('c1', 'chaudiere-cond', 'producteur', 'Chaudière gaz ACME', { qte: 2, regime: '70/50' }), it('c2', 'radiateurs', 'emetteur', 'Radiateurs ACME', { qte: 8, reseau: 'r1' }),
      it('c4', 'cta', 'emetteur', 'CTA double flux ACME', { reseau: 'r2', principal: true, alim: 'chauffage', details: { batteries: { chaude: true } }, local: 'Réfectoire' })] };
  EA.creerTout(et, { uid });
  et.notes.push(nn('pieces', { pieces: [{ nom: 'Classe 1', etage: 'R+1', usage: 'classe', S: 60, H: 3, vitrage: 8, orient: 'S', occ: '', Qair: '' }, { nom: 'Classe 2', etage: 'R+1', usage: 'classe', S: 60, H: 3, vitrage: 8, orient: 'O', occ: '', Qair: '' }] }));
  et.notes.push(nn('hotte'));
  et.notes.find(n => n.type === 'cta').entrees.Qs = 200;
  et.equipements = [{ id: 'g1', type: 'pompe', fabricant: 'ACME Pompes', reference: '', nom: 'Gamme CIRCU', valeurs: {}, gamme: { titre: 'CIRCU', modeles: [{ ref: 'CIRCU 25-40' }, { ref: 'CIRCU 25-60' }] } }];
  return et;
}
const de = (pts, cat) => pts.filter(p => p.categorie === cat);

test('points relevés : calculs, incohérences, estimations, valeurs vides, paramètres à valider, réserves, gammes, matériel, guide', () => {
  const et = etude(), pts = C.controler(et);
  assert.ok(pts.every(p => ['erreur', 'attention', 'info'].includes(p.gravite) && C.CATEGORIES.some(c => c[0] === p.categorie) && p.texte && p.origine));
  assert.strictEqual(new Set(pts.map(p => p.id)).size, pts.length, 'pas de doublon');
  // Erreurs des calculs, avec la note d'origine et le lien pour y aller
  const err = de(pts, 'calculs').filter(p => p.gravite === 'erreur');
  assert.ok(err.length && err.every(p => /^N\d+ — /.test(p.origine) && p.action[0] === `note:${p.noteId}`));
  // Incohérences : circuits sans puissance face au bilan, CTA sous l'air neuf des pièces, armoire incomplète
  const inc = de(pts, 'incoherences').map(p => p.texte).join('\n');
  assert.match(inc, /Puissance appelée par les circuits \([\d,]+ kW.*inférieure de \d+ % à la puissance de chauffage du bâtiment \(17,7 kW, bilan pièce par pièce\)/);
  assert.match(inc, /Débit soufflé des CTA \(200 m³\/h\) inférieur à l'air neuf des pièces du bilan/);
  assert.match(inc, /équipement\(s\) de l'étude absent\(s\) de N\d+ — Alimentation/);
  // Valeurs vides ; paramètres « à valider » et réserves de la hotte (récapitulatif de conformité)
  assert.ok(de(pts, 'valeurs').some(p => /Débit d'air soufflé|valeur vide/.test(p.texte)));
  assert.ok(de(pts, 'parametres').some(p => /temporisation de coupure du gaz \(5 s\)/.test(p.texte) && p.action[0] === 'reserves-conformite'));
  assert.ok(de(pts, 'reserves').some(p => /Asservissement de l'alimentation gaz/.test(p.texte)));
  // Gamme au modèle non choisi ; matériel à choisir ; reste à faire du guide
  assert.ok(de(pts, 'gammes').some(p => /CIRCU.*modèle à choisir \(2 modèle/.test(p.texte) && p.action[0] === 'registre'));
  assert.ok(de(pts, 'materiel').some(p => /fabricant et référence à choisir/.test(p.texte) && p.action[0] === 'materiel'));
  assert.ok(de(pts, 'guide').some(p => /Émettre les notes/.test(p.texte)));
  // Ordre : par catégorie, erreurs d'abord
  const rang = pts.map(p => C.CATEGORIES.findIndex(c => c[0] === p.categorie) * 10 + ['erreur', 'attention', 'info'].indexOf(p.gravite));
  assert.deepStrictEqual(rang, rang.slice().sort((a, b) => a - b));
});

test('réserves levées, estimations confirmées : sortent du contrôle ; estimation en place : signalée', () => {
  const et = etude(), cta = et.notes.find(n => n.type === 'cta');
  Es.marquer(cta.entrees, 'Qr', 1800, 'ratio 6 m³/h·m²');
  let pts = C.controler(et);
  assert.ok(de(pts, 'estimees').some(p => /= 1800 — estimée \(ratio 6/.test(p.texte) && p.action[0] === `confirmer-estimes:${cta.id}`));
  Es.confirmer(cta);
  AX.reserves(et, L).forEach(x => AX.cocher(et, x.cle, true, { le: '2026-11-15', par: 'Bureau de contrôle ACME' }));
  pts = C.controler(et);
  assert.ok(!de(pts, 'estimees').length && !de(pts, 'parametres').length && !de(pts, 'reserves').length);
});

test('matériel retenu : refusé, soumis, fiche technique manquante (sauf trouvée dans la bibliothèque des fiches)', () => {
  const et = etude(), postes = Metre.metre(et).filter(Metre.estEquipement), [a, b] = postes;
  et.materiel = { [a.cle]: { fabricant: 'ACME', reference: 'REF-REFUSEE', statut: 'Refusé', obs: 'Autre gamme demandée' }, [b.cle]: { fabricant: 'ACME', reference: 'REF-SOUMISE', statut: 'Soumis au client', dateSoumission: '2026-11-01' } };
  let pts = C.controler(et);
  assert.ok(de(pts, 'materiel').some(p => p.gravite === 'erreur' && /ACME REF-REFUSEE refusé par le client \(Autre gamme demandée\)/.test(p.texte)));
  assert.ok(de(pts, 'materiel').some(p => p.gravite === 'info' && /REF-SOUMISE soumis le 2026-11-01/.test(p.texte)));
  assert.ok(de(pts, 'fiches').some(p => /REF-SOUMISE : fiche technique à joindre/.test(p.texte)));
  assert.ok(!de(pts, 'fiches').some(p => /REF-REFUSEE/.test(p.texte)), 'matériel refusé : pas de fiche demandée');
  pts = C.controler(et, { fiches: new Map([[b.cle, { id: 'ft1', nom: 'ACME.pdf' }]]) });
  assert.ok(!de(pts, 'fiches').length);
});

test('liaisons CTA ambiguës : signalées une fois dans les incohérences (pas en double dans les calculs)', () => {
  const pid = nn('pid'), c1 = nn('cta'), c2 = nn('cta');
  pid.entrees.circuits = [{ rep: 'Batteries CTA', emetteur: 'cta', P: 30, regime: '', regulation: '3v', L: 40 }];
  const et = { id: 'e2', objet: 'Ateliers ACME', notes: [pid, c1, c2] };
  assert.ok(L.liaisonsAutoCta(et).ambigus.length);
  const pts = C.controler(et);
  assert.ok(de(pts, 'incoherences').some(p => /liaison à choisir/.test(p.texte)));
  assert.ok(!de(pts, 'calculs').some(p => /rien n'est relié automatiquement/.test(p.texte)));
});

test('destinataires : interne (tout), bureau de contrôle (technique, sans matériel ni guide), client (bloquants, matériel)', () => {
  const et = etude(), tous = C.controler(et);
  const r = d => C.rapport(et, { destinataire: d, tous, date: '2026-11-15' });
  const [ri, rc, rk] = ['interne', 'controle', 'client'].map(r);
  assert.strictEqual(ri.total, tous.length);
  assert.ok(rc.points.every(p => p.gravite !== 'info' && !['materiel', 'guide', 'gammes', 'valeurs'].includes(p.categorie)));
  assert.ok(rc.points.some(p => p.categorie === 'parametres') && rc.points.some(p => p.categorie === 'reserves'));
  assert.ok(rk.points.every(p => ['calculs', 'incoherences', 'gammes', 'materiel', 'fiches'].includes(p.categorie) && !(p.categorie === 'calculs' && p.gravite !== 'erreur')));
  assert.ok(rk.points.some(p => p.categorie === 'materiel') && !rk.points.some(p => p.categorie === 'estimees'));
  assert.strictEqual(ri.verdict, 'bloquant');
  assert.deepStrictEqual(Object.values(ri.parGravite).reduce((a, b) => a + b, 0), ri.total);
  // Rapport imprimable : destinataire, verdict, colonne d'avis pour le bureau de contrôle
  const h = C.html(et, rc, { societe: { nom: 'ACME Études' } });
  assert.match(h, /CONTRÔLE DE L'ÉTUDE AVANT ENVOI/);
  assert.match(h, /Bureau de contrôle/);
  assert.match(h, /<th style="width:18%">Avis<\/th>/);
  assert.match(h, /Paramètres « à valider »/);
  assert.ok(!/Matériel non choisi/.test(h));
  assert.ok(!/<script/i.test(h));
  // Étude sans calcul : rien de bloquant
  assert.strictEqual(C.rapport({ id: 'e0', objet: 'Vide', notes: [] }).parGravite.erreur, 0);
});

test('guide « Reste à faire » : étape « Contrôler l\'étude avant l\'envoi », faite après un rapport', () => {
  const et = etude();
  let s = G.restesAFaire(et).etapes.find(x => x.id === 'controle');
  assert.ok(s && !s.fait && s.groupe === 'emission' && s.action[0] === 'controle');
  et.controles = [{ le: '2026-11-15', par: 'Jacky', destinataire: 'controle', erreur: 2, attention: 5 }];
  s = G.restesAFaire(et).etapes.find(x => x.id === 'controle');
  assert.ok(s.fait && /15\/11\/2026 \(2 bloquant/.test(s.info));
  assert.ok(!C.controler(et).some(p => p.categorie === 'guide' && /Contrôler l'étude/.test(p.texte)));
});

test('étape du guide déclarée « sans objet » (suivi des étapes, motif tracé) : plus signalée par le contrôle', () => {
  const SE = require('../etudes/public/js/suivi-etapes');
  const et = etude(), guide = () => de(C.controler(et), 'guide');
  const x = G.restesAFaire(et).etapes.find(e => !e.fait && guide().some(p => p.texte.startsWith(e.titre)));
  assert.ok(x, 'une étape du guide relevée');
  SE.marquerSansObjet(et, x.id, 'Hors marché (essai)', { nom: 'Essai' });
  assert.ok(!guide().some(p => p.texte.startsWith(x.titre)));
});
