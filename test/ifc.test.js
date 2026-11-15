// Lecture des maquettes IFC (ifc.js) : espaces vers le bilan pièce par pièce, éléments de réseau vers les longueurs des
// tronçons — maquette synthétique écrite à la main (test/donnees/maquette-fictive.ifc, données fictives « ACME »).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Ifc = require('../etudes/public/js/ifc');
const Longueurs = require('../etudes/public/js/longueurs');

const texte = fs.readFileSync(path.join(__dirname, 'donnees', 'maquette-fictive.ifc'), 'utf8');

test('fichier STEP : chaînes encodées, listes, valeurs typées, instructions sur plusieurs lignes, « ; » dans une chaîne', () => {
  assert.strictEqual(Ifc.decoder('Salle de r\\X2\\00E9\\X0\\union'), 'Salle de réunion');
  assert.strictEqual(Ifc.decoder('caf\\X\\E9'), 'café');
  assert.deepStrictEqual(Ifc.lireArgs("'a''b',#12,(1.5,2.),$,*,.T.,IFCLABEL('x'),()"), ['a\'b', { r: 12 }, [1.5, 2], null, null, { e: 'T' }, { t: 'IFCLABEL', v: 'x' }, []]);
  const { schema, ents, erreurs } = Ifc.entites(texte);
  assert.strictEqual(schema, 'IFC2X3');
  assert.deepStrictEqual(erreurs, []);
  assert.strictEqual(ents.get(42).a[2], 'Pset_ACME; dimensions');
  assert.strictEqual(ents.get(10).a[2], 'Bâtiment A');
  assert.throws(() => Ifc.lire('bonjour'), /STEP/);
  assert.deepStrictEqual(Ifc.lire('<ifcXML/>').espaces, [], 'IFC XML accepté');
});

test('espaces : numéro, nom, étage, surface (quantités ou propriétés), hauteur en mm convertie, hauteur déduite du volume', () => {
  const lu = Ifc.lire(texte);
  assert.deepStrictEqual(lu.unites, { L: 0.001, S: 1, V: 1, nomL: 'mm' });
  assert.deepStrictEqual(lu.etages.map(e => [e.nom, e.elevation]), [['RDC', 0], ['R+1', 3.2]]);
  const s = Object.fromEntries(lu.espaces.map(x => [x.numero, x]));
  assert.deepStrictEqual([s['001'].nom, s['001'].etage, s['001'].S, s['001'].H], ['Accueil', 'RDC', 42.5, 3]);
  assert.deepStrictEqual([s['101'].libelle, s['101'].etage, s['101'].S, s['101'].H], ['101 Bureau direction', 'R+1', 18, 2.7], 'hauteur = volume / surface');
  assert.deepStrictEqual([s['102'].nom, s['102'].S, s['102'].H], ['Salle de réunion', 30.25, 2.7], 'jeu de propriétés (IfcAreaMeasure, IfcLengthMeasure)');
  assert.deepStrictEqual([s['103'].S, s['103'].H], [4.2, null], 'surface brute à défaut de surface nette');
});

test('bilan pièce par pièce : aperçu (ajout, mise à jour d\'une pièce de même nom), usage déduit du nom, application', () => {
  const lu = Ifc.lire(texte), avant = [{ nom: 'Bureau direction', etage: '', usage: 'bureau', S: 10, H: 2.5, vitrage: 3, orient: 'S', occ: '', Qair: '' }];
  const p = Ifc.versPieces(lu, avant);
  assert.deepStrictEqual(p.map(x => [x.action, x.piece.nom, x.piece.usage]), [['ajout', '001 Accueil', 'accueil'], ['maj', 'Bureau direction', 'bureau'], ['ajout', '102 Salle de réunion', 'reunion'], ['ajout', '103 WC hommes', 'sanitaires']]);
  const maj = p[1].piece;
  assert.deepStrictEqual([maj.S, maj.H, maj.etage, maj.vitrage, maj.orient], [18, 2.7, 'R+1', 3, 'S'], 'surface, hauteur et étage repris ; vitrage et orientation gardés');
  assert.strictEqual(p[3].piece.H, 2.7, 'hauteur par défaut');
  const l = Ifc.appliquerPieces(avant, p, { retenues: new Set([0, 1]) });
  assert.deepStrictEqual(l.map(x => [x.nom, x.S]), [['Bureau direction', 18], ['001 Accueil', 42.5]]);
  assert.strictEqual(Ifc.appliquerPieces(avant, Ifc.versPieces(lu, avant, { remplacer: true }), { remplacer: true }).length, 4);
  // Le bilan accepte les pièces importées
  const N = require('../etudes/public/js/notes'); global.Notes = N; require('../etudes/public/js/pieces');
  const r = N.calculer('pieces', { ...N.defauts('pieces'), pieces: l });
  assert.ok(r.valeurs.Pch > 0 && r.valeurs.S === 60.5);
  assert.strictEqual(Ifc.usageDe('Couloir R+1'), 'circulation');
});

test('longueurs des tronçons : par repère (propriété, Tag, nom) ou par système, mm convertis, reportées comme le DXF', () => {
  const lu = Ifc.lire(texte);
  assert.deepStrictEqual(lu.segments.map(s => [s.type, s.genre, s.rep, s.L]).sort(), [['IFCDUCTSEGMENT', 'gaine', 'S1', 9], ['IFCFLOWSEGMENT', 'tuyauterie', 'A1', 12.5], ['IFCFLOWSEGMENT', 'tuyauterie', 'A1', 7.5], ['IFCPIPESEGMENT', 'tuyauterie', 'B2', 4]]);
  const g = Ifc.longueurs(lu);
  assert.deepStrictEqual([...g.parRep].sort(), [['A1', 20], ['B2', 4], ['S1', 9]], 'longueurs d\'un même repère additionnées, Tag GUID ignoré');
  assert.deepStrictEqual([...Ifc.longueurs(lu, { cle: 'systeme' }).parRep], [['Chauffage RDC', 24]]);
  const p = Longueurs.proposer([{ rep: 'A1', L: 5 }, { rep: 'B2', L: 3 }, { rep: 'C3', L: 2 }], g.parRep, { diviser: true });
  assert.deepStrictEqual(p.lignes.map(x => [x.rep, x.avant, x.apres]), [['A1', 5, 10], ['B2', 3, 2]]);
  assert.deepStrictEqual(p.nonUtilisees, ['S1']);
  assert.match(Ifc.longueurs({ segments: [] }).erreur, /Aucun élément de réseau/);
  assert.match(Ifc.resume(lu), /2 étage\(s\), 4 espace\(s\), 4 élément\(s\) de réseau.*mm/);
});
