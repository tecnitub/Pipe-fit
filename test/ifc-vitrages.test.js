// IFC : vitrages par pièce et orientation (fenêtres, ouvertures, murs, limites d'espace, placements, nord géographique) et
// lecture de l'IFC XML — petites maquettes fictives écrites à la main (test/donnees/vitrages-fictifs.ifc et .ifcxml : même
// modèle en STEP IFC2x3 et en ifcXML IFC4).
//
// Calcul à la main : nord géographique TrueNorth = (−0,7071 ; 0,7071) (nord tourné de 45° vers l'ouest de l'axe Y),
// est = (0,7071 ; 0,7071).
//  - façade sud du projet, normale (0 ; −1) : cos = −0,7071 (vers le nord), sin = −0,7071 (vers l'est) → azimut 225° = SO
//  - façade est du projet, normale (1 ; 0) : cos = −0,7071, sin = 0,7071 → azimut 135° = SE
//  - F1 : 2,00 × 1,50 = 3 m² (OverallWidth × OverallHeight en mm) ; F2 : 4,5 m² (IfcQuantityArea) ; F3 : 1,0 × 1,2 = 1,2 m²
//  - F1 et F2 sont dans le même mur sud, qui borde les deux bureaux : chaque fenêtre va au bureau dont la limite d'espace la
//    contient (F1 à x = 2 m dans la limite du bureau 001 [0 ; 5 m], F2 à x = 7 m dans celle du bureau 002 [5 ; 10 m])
//  - Bureau 002 : 4,5 m² SO + 1,2 m² SE = 5,7 m² ; apports solaires 4,5 × 180 + 1,2 × 170 = 1 014 W
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Ifc = require('../etudes/public/js/ifc');
const N = require('../etudes/public/js/notes'); global.Notes = N;
const Pieces = require('../etudes/public/js/pieces');

const lireF = f => Ifc.lire(fs.readFileSync(path.join(__dirname, 'donnees', f), 'utf8'));

const verifier = (lu, nom) => {
  assert.deepStrictEqual(lu.erreurs, [], nom);
  assert.strictEqual(lu.unites.nomL, 'mm', nom);
  assert.strictEqual(lu.nord.source, 'IfcGeometricRepresentationContext.TrueNorth', nom);
  assert.strictEqual(lu.nord.rotation, 45, nom);
  const w = Object.fromEntries(lu.vitrages.map(x => [x.nom.slice(0, 2), x]));
  assert.deepStrictEqual([w.F1.S, w.F1.orient, w.F1.az, w.F1.surfaceSource], [3, 'SO', 225, 'OverallWidth × OverallHeight'], `${nom} F1`);
  assert.deepStrictEqual([w.F2.S, w.F2.orient, w.F2.surfaceSource], [4.5, 'SO', 'quantité (IfcQuantityArea)'], `${nom} F2`);
  assert.deepStrictEqual([w.F3.S, w.F3.orient, w.F3.az], [1.2, 'SE', 135], `${nom} F3`);
  assert.match(w.F1.source, /limite d'espace/); assert.ok(!w.F1.aVerifier);
  assert.match(w.F3.source, /axe du mur/); assert.ok(w.F3.aVerifier, 'orientation par l\'axe du mur : à vérifier');
  const s = Object.fromEntries(lu.espaces.map(x => [x.numero, x]));
  assert.deepStrictEqual([s['001'].S, s['001'].etage, s['001'].vitrages, s['001'].Svitrage], [20, 'RDC', [{ orient: 'SO', S: 3 }], 3], `${nom} bureau 001`);
  assert.deepStrictEqual([s['002'].S, s['002'].vitrages, s['002'].Svitrage, s['002'].aVerifier], [25, [{ orient: 'SO', S: 4.5 }, { orient: 'SE', S: 1.2 }], 5.7, true], `${nom} bureau 002`);
};

test('IFC STEP : vitrages par pièce, orientation ramenée au nord géographique', () => {
  const lu = lireF('vitrages-fictifs.ifc');
  assert.strictEqual(lu.format, 'STEP');
  verifier(lu, 'STEP');
  assert.match(Ifc.resume(lu), /2 espace\(s\).*3 fenêtre\(s\)/);
});

test('IFC XML (IFC4) : même modèle, mêmes résultats', () => {
  const lu = lireF('vitrages-fictifs.ifcxml');
  assert.deepStrictEqual([lu.schema, lu.format], ['IFC4', 'ifcXML']);
  verifier(lu, 'ifcXML');
  assert.deepStrictEqual(lu.segments.map(x => [x.rep, x.L]), [['A1', 12.5]], 'tronçons lus aussi');
  assert.match(Ifc.resume(lu), /IFC XML/);
});

test('IFC XML : arbre, entités, styles IFC2x3 (attributs en éléments) et IFC4 (attributs XML, -wrapper)', () => {
  const a = Ifc.xmlArbre('<?xml version="1.0"?><!-- c --><r a="1 &amp; 2"><x:b>t&#233;<![CDATA[<z>]]></x:b><c/></r>');
  assert.deepStrictEqual([a.enf[0].nom, a.enf[0].at.a, a.enf[0].enf[0].nom, a.enf[0].enf[0].txt, a.enf[0].enf[1].nom], ['r', '1 & 2', 'b', 'té<z>', 'c']);
  const x2 = `<?xml version="1.0"?><ex:iso_10303_28 xmlns:ex="urn:oid:1.0.10303.28.2.1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><uos id="u1" description="IFC2X3">
    <IfcSIUnit id="i2"><UnitType>lengthunit</UnitType><Prefix>centi</Prefix><Name>metre</Name></IfcSIUnit>
    <IfcUnitAssignment id="i1"><Units ex:cType="set"><IfcSIUnit xsi:nil="true" ref="i2"/></Units></IfcUnitAssignment>
    <IfcSpace id="i3"><GlobalId>1zJkLhK4f0kQ$5mZ5Gc8xE</GlobalId><Name>007</Name><LongName>Salle de r&#233;union</LongName></IfcSpace>
    <IfcPropertySingleValue id="i4"><Name>Area</Name><NominalValue><IfcAreaMeasure>12.5</IfcAreaMeasure></NominalValue></IfcPropertySingleValue>
    <IfcPropertySingleValue id="i7"><Name>Height</Name><NominalValue><IfcLengthMeasure>280</IfcLengthMeasure></NominalValue></IfcPropertySingleValue>
    <IfcPropertySet id="i5"><Name>Pset</Name><HasProperties ex:cType="set"><IfcPropertySingleValue xsi:nil="true" ref="i4"/><IfcPropertySingleValue xsi:nil="true" ref="i7"/></HasProperties></IfcPropertySet>
    <IfcRelDefinesByProperties id="i6"><RelatedObjects ex:cType="set"><IfcSpace xsi:nil="true" ref="i3"/></RelatedObjects><RelatingPropertyDefinition><IfcPropertySet xsi:nil="true" ref="i5"/></RelatingPropertyDefinition></IfcRelDefinesByProperties>
  </uos></ex:iso_10303_28>`;
  const lu = Ifc.lire(x2);
  assert.strictEqual(lu.schema, 'IFC2X3');
  assert.deepStrictEqual(lu.unites.nomL, 'cm');
  assert.deepStrictEqual(lu.espaces.map(s => [s.numero, s.nom, s.S, s.H]), [['007', 'Salle de réunion', 12.5, 2.8]], 'numéro « 007 » gardé en texte, hauteur en cm convertie');
  assert.strictEqual(lu.vitrages.length, 0);
  assert.throws(() => Ifc.lire('ISO ? non'), /STEP/);
});

test('bilan pièce par pièce : vitrages et orientation appliqués, détail par façade, aperçu modifiable', () => {
  const lu = lireF('vitrages-fictifs.ifc'), avant = [{ nom: 'Bureau angle', etage: '', usage: 'bureau', S: 10, H: 2.5, vitrage: 1, orient: 'N', occ: '', Qair: '' }];
  const p = Ifc.versPieces(lu, avant);
  assert.deepStrictEqual(p.map(x => [x.action, x.piece.nom, x.piece.vitrage, x.piece.orient, x.piece.vitragesDetail]),
    [['ajout', '001 Bureau sud-ouest', 3, 'SO', ''], ['maj', 'Bureau angle', 5.7, 'SO', 'SO 4,5 ; SE 1,2']]);
  // Calcul du bilan : apports solaires par façade (4,5 × 180 + 1,2 × 170 = 1 014 W)
  const r = Pieces.calculer({ ...N.defauts('pieces'), pieces: Ifc.appliquerPieces(avant, p) });
  assert.deepStrictEqual(r.tableaux[0].lignes.map(l => Number(String(l[9]).replace(/\s/g, ''))), [4.5 * 180 + 1.2 * 170, 3 * 180], 'apports solaires (W) : 1 014 et 540');
  const pc = Pieces.calculer({ ...N.defauts('pieces'), pieces: [p[1].piece] });
  const S0 = Pieces.calculer({ ...N.defauts('pieces'), pieces: [{ ...p[1].piece, vitragesDetail: '', vitrage: 0 }] }).valeurs.Pfr;
  assert.ok(Math.abs((pc.valeurs.Pfr - S0) * 1000 - 1014 * 1.1) < 1e-6, 'apports solaires par façade, majorés de 10 %');
  // Détail incohérent avec la surface saisie : la surface et l'orientation saisies font foi
  assert.deepStrictEqual(Pieces.detailVitrages('SO 4,5 ; SE 1,2', 5.7), [{ orient: 'SO', S: 4.5 }, { orient: 'SE', S: 1.2 }]);
  assert.strictEqual(Pieces.detailVitrages('SO 4,5 ; SE 1,2', 8), null);
  // Orientation changée dans l'aperçu : une seule orientation pour la pièce
  Ifc.changerOrientation(p[1], 'S');
  assert.deepStrictEqual([p[1].piece.orient, p[1].piece.vitragesDetail, p[1].piece.vitrage], ['S', '', 5.7]);
  // Espace sans fenêtre : vitrage et orientation de la pièce gardés
  const sans = Ifc.versPieces({ espaces: [{ nom: 'Bureau angle', S: 12, vitrages: [] }] }, avant);
  assert.deepStrictEqual([sans[0].piece.vitrage, sans[0].piece.orient], [1, 'N']);
});

test('orientation : azimut et secteurs, nord par défaut sur l\'axe Y, fenêtre portée par la limite d\'espace', () => {
  assert.strictEqual(Ifc.azimut([0, 1, 0], [0, 1]), 0);
  assert.strictEqual(Ifc.azimut([1, 0, 0], [0, 1]), 90);
  assert.strictEqual(Ifc.orientDe(Ifc.azimut([0, -1, 0], [0, 1])), 'S');
  assert.strictEqual(Ifc.orientDe(Ifc.azimut([-1, 0, 0], [0, 1])), 'O');
  assert.strictEqual(Ifc.azimut([0, 0, 1], [0, 1]), null, 'vitrage horizontal');
  assert.deepStrictEqual([0, 22, 23, 67, 68, 180, 337, 338].map(Ifc.orientDe), ['N', 'N', 'NE', 'NE', 'E', 'S', 'NO', 'N']);
  // Maquette sans TrueNorth, fenêtre limite d'espace directe (plan de normale +X dans le repère de l'espace) : est
  const t = `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;
#1=IFCSPACE('a',$,'1',$,$,#10,$,'Bureau',.ELEMENT.,.SPACE.,$);
#10=IFCLOCALPLACEMENT($,#11);#11=IFCAXIS2PLACEMENT3D(#12,$,$);#12=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCWINDOW('b',$,'F',$,$,#10,$,$,1.,2.,$,$,$);
#3=IFCRELSPACEBOUNDARY('c',$,$,$,#1,#2,#4,.PHYSICAL.,.EXTERNAL.);
#4=IFCCONNECTIONSURFACEGEOMETRY(#5,$);#5=IFCPLANE(#6);#6=IFCAXIS2PLACEMENT3D(#12,#7,$);#7=IFCDIRECTION((1.,0.,0.));
ENDSEC;END-ISO-10303-21;`;
  const lu = Ifc.lire(t);
  assert.match(lu.nord.source, /axe Y/);
  assert.deepStrictEqual(lu.vitrages.map(w => [w.S, w.orient, w.espaces]), [[2, 'E', [1]]]);
  assert.deepStrictEqual(Ifc.versPieces(lu, [])[0].piece.orient, 'E');
});
