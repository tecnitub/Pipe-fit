// Tuyauteur : calculs (contrôlés par des formules indépendantes), DXF et PDF
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

globalThis.PDFLib = require(path.join(__dirname, '../doe/public/vendor/pdf-lib-1.17.1.min.js'));
const G = require('../tuyauteur/src/geometrie.js');
const Dessin = require('../tuyauteur/src/dessin.js');
const ExportPDF = require('../tuyauteur/src/pdf.js');
const Normes = require('../tuyauteur/src/normes.js');

const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} : ${a} au lieu de ${b} (± ${tol})`);

test('normes : diamètres ISO et rayons de coudes 3D', () => {
  assert.strictEqual(Normes.tube(100).de, 114.3);
  assert.strictEqual(Normes.tube(150).de, 168.3);
  assert.strictEqual(Normes.rayonCoude(100, '3D'), 152);
  assert.strictEqual(Normes.rayonCoude(50, '2D'), 51);
  assert.strictEqual(Normes.rayonCoude(100, '5D'), 286);
  assert.strictEqual(Normes.dnDepuisDiametre(219.1), 200);
});

test('piquage perpendiculaire : flèche, développé et trou', () => {
  const r = G.piquage({ D: 168.3, eD: 4.5, d: 114.3, ed: 3.6, angle: 90, divisions: 8, type: 'pose' });
  const R = 168.3 / 2, ri = 114.3 / 2 - 3.6;
  proche(r.resultats.profondeur, R - Math.sqrt(R * R - ri * ri), 0.05, 'flèche');
  proche(r.resultats.developpe, Math.PI * 114.3, 0.05, 'développé');
  // Génératrice à 90° : hauteur = flèche ; trou : demi-largeur = R·asin(r/R) sur la génératrice latérale
  proche(r.table[2].hauteur, r.resultats.profondeur, 0.05, 'génératrice 90°');
  proche(r.table[0].trouS, R * Math.asin(ri / R), 0.05, 'arc du trou');
  proche(r.resultats.trouLongueur, 2 * ri, 0.1, 'longueur du trou');
  // Symétrie du gabarit
  for (let i = 0; i <= 8; i++) proche(r.table[i].hauteur, r.table[8 - i].hauteur, 0.05, `symétrie ${i}`);
});

test('piquage égal (Ø identiques) et pénétrant : la flèche vaut le rayon', () => {
  const r = G.piquage({ D: 114.3, eD: 0, d: 114.3, ed: 0, angle: 90, type: 'penetrant' });
  proche(r.resultats.profondeur, 114.3 / 2, 0.06);
});

test('piquage oblique : hauteurs aux génératrices du plan des axes', () => {
  const D = 219.1, d = 114.3, a = 60 * Math.PI / 180;
  const r = G.piquage({ D, eD: 0, d, ed: 0, angle: 60, divisions: 4, type: 'penetrant', hauteur: 500 });
  const R = D / 2, rr = d / 2;
  // θ = 90° et 270° : y = 0, z = R → t = (R ∓ r cos α)/sin α
  const t90 = (R - rr * Math.cos(a)) / Math.sin(a), t270 = (R + rr * Math.cos(a)) / Math.sin(a);
  proche(r.table[1].longueur, 500 - t90, 0.1, 'côté obtus');
  proche(r.table[3].longueur, 500 - t270, 0.1, 'côté aigu');
});

test('piquage : refus quand le piquage dépasse du collecteur', () => {
  assert.throws(() => G.piquage({ D: 114.3, d: 114.3, ed: 0, excentration: 10, type: 'penetrant' }), G.ErreurSaisie);
  assert.throws(() => G.piquage({ D: 60.3, d: 114.3 }), /dépasse/);
});

test('baïonnette : formules du renvoi et coudes orientés', () => {
  const r = G.baionnette({ de: 114.3, rayon: 152, decalageV: 300, decalageH: 400, mode: 'angle', angle: 45 });
  const R = r.resultats, E = 152 * Math.tan(22.5 * Math.PI / 180);
  proche(R.decalageReel, 500, 0.01);
  proche(R.roulis, Math.atan2(300, 400) * 180 / Math.PI, 0.01, 'orientation');
  proche(R.entraxe, 500 * Math.SQRT2, 0.05);
  proche(R.avance, 500, 0.05);
  proche(R.reduction, E, 0.05);
  proche(R.tubeDroit, 500 * Math.SQRT2 - 2 * E, 0.1);
  proche(r.coude.extrados, (152 + 57.15) * Math.PI / 4, 0.1);
  // Par la distance et par l'entraxe : on retrouve 45°
  proche(G.baionnette({ de: 114.3, rayon: 152, decalageV: 500, mode: 'avance', avance: 500 }).resultats.angle, 45, 0.01);
  proche(G.baionnette({ de: 114.3, rayon: 152, decalageH: 500, mode: 'longueur', longueur: 500 * Math.SQRT2 }).resultats.angle, 45, 0.01);
  // Décalage trop petit pour des coudes à 90° : refus avec l'angle maximal
  assert.throws(() => G.baionnette({ de: 114.3, rayon: 152, decalageV: 200, mode: 'angle', angle: 90 }), /chevauchent.*Angle maximal/);
});

test('renvoi 3D : angles, rotations et longueurs de coupe', () => {
  const r = G.renvoi3D({ de: 114.3, rayon: 152, jeu: 2, points: [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0], [1000, 1000, 1000], [1000, 2000, 1000]] });
  assert.deepStrictEqual(r.coudes.map(c => c.angle), [90, 90, 90]);
  assert.strictEqual(r.coudes[1].rotation, 90);
  // x → y → z → y : les deux derniers coudes forment un « S » dans le même plan, rotation 180°
  proche(Math.abs(r.coudes[2].rotation), 180, 0.01);
  // Premier tronçon : 1000 − réduction 152 − 1 soudure ; tronçon central : 1000 − 2×152 − 2 soudures
  assert.strictEqual(r.segments[0].coupe, 846);
  assert.strictEqual(r.segments[1].coupe, 692);
  assert.strictEqual(r.segments[2].pente, 90);
  // Longueur développée de l'axe : droites + 3 quarts de cercle
  proche(r.resultats.longueurAxe, 4000 - 6 * 152 + 3 * 152 * Math.PI / 2, 0.5);
  assert.throws(() => G.renvoi3D({ de: 60.3, rayon: 76, points: [[0, 0, 0], [0, 0, 0], [1, 0, 0]] }), /confondus/);
});

test('développé cône : surface égale à celle du tronc de cône', () => {
  const d = G.developpe({ forme: 'rond-rond', D: 600, D2: 300, hauteur: 400, divisions: 24, parties: 1, epaisseur: 0 });
  const aire = Math.PI * (300 + 150) * Math.hypot(400, 150) / 1e6;
  proche(d.resultats.aireTotale, aire, aire * 0.002, 'surface');
  // Les génératrices développées gardent leur longueur vraie
  for (const l of d.lignesVraies.filter(x => !x.haut.includes("'") || x.bas === x.haut.replace("'", ''))) proche(l.vraie, Math.hypot(400, 150), 0.5);
});

test('développé trémie : surfaces des quatre trapèzes, découpe en 4 pièces', () => {
  const d = G.developpe({ forme: 'carre-carre', A: 800, B: 600, A2: 300, B2: 200, hauteur: 600, parties: 4, epaisseur: 0 });
  const aire = (2 * (800 + 300) / 2 * Math.hypot(600, 200) + 2 * (600 + 200) / 2 * Math.hypot(600, 250)) / 1e6;
  assert.strictEqual(d.pieces.length, 4);
  proche(d.resultats.aireTotale, aire, 1e-3);
});

test('développé rond-carré : contour fermé, périmètres conservés, fibre neutre', () => {
  const d = G.developpe({ forme: 'rond-carre', A: 600, B: 400, D: 300, hauteur: 500, divisions: 12, parties: 1, epaisseur: 0 });
  const piece = d.pieces[0];
  const contour = piece.dessin.entites.find(e => e.calque === 'DECOUPE');
  assert.ok(contour.ferme);
  // Périmètre = 2 (couture) + périmètre du rectangle + périmètre (polygonal) du rond
  let per = 0;
  for (let i = 0; i < contour.pts.length; i++) { const a = contour.pts[i], b = contour.pts[(i + 1) % contour.pts.length]; per += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const couture = d.lignesVraies[0].vraie, polyRond = 48 * 300 * Math.sin(Math.PI / 48);
  proche(per, 2 * couture + 2000 + polyRond, 0.5, 'périmètre');
  // Cotes intérieures + épaisseur 2 : calcul sur la fibre neutre
  const n = G.developpe({ forme: 'rond-carre', A: 600, B: 400, D: 300, hauteur: 500, epaisseur: 2, cotes: 'int' });
  assert.deepStrictEqual(n.fibreNeutre, { A: 602, B: 402, D: 302 });
  assert.ok(n.resultats.masseTotale > 0);
});

test('DXF R12 : sections, calques et polyligne fermée', () => {
  const d = G.developpe({ forme: 'rond-carre', A: 600, B: 400, D: 300, hauteur: 500, parties: 2 });
  const dxf = Dessin.versDXF(d.pieces[0].dessin);
  assert.match(dxf, /\$ACADVER\r\n {2}1\r\nAC1009/);
  for (const c of ['DECOUPE', 'PLIAGE', 'TEXTE']) assert.ok(dxf.includes(`\r\n${c}\r\n`), c);
  assert.ok(dxf.trim().endsWith('EOF'));
  assert.ok(/[\x00-\x09\x0b\x0c\x0e-\x1f\x7f-￿]/.test(dxf) === false, 'ASCII uniquement');
  // Codes de groupe et valeurs en paires
  assert.strictEqual(dxf.trim().split('\r\n').length % 2, 0);
  const d3 = Dessin.versDXF(Dessin.creer(), { polylignes3d: [{ pts: [[0, 0, 0], [1, 2, 3]] }] });
  assert.match(d3, / 70\r\n8\r\n/);
});

test('PDF : fiche et feuilles 1:1 assemblables', async () => {
  const r = G.piquage({ D: 323.9, eD: 7.1, d: 219.1, ed: 6.3, angle: 90 });
  const etude = {
    titre: 'Piquage Ø219,1 sur Ø323,9', infos: [['Collecteur', 'Ø 323,9 × 7,1']], resultats: [['Développé', '688,3 mm']], avertissements: ['Essai α ≥ π'],
    tableaux: [{ titre: 'Table', colonnes: ['N°', 'Hauteur'], lignes: r.table.map(t => [t.n, t.hauteur]) }],
    dessins: [{ titre: 'Gabarit', dessin: r.dessins.gabarit, gabarit: true }],
  };
  const sans = await PDFLib.PDFDocument.load(await ExportPDF.creer(etude));
  const avec = await PDFLib.PDFDocument.load(await ExportPDF.creer({ ...etude, echelle1: true }));
  assert.ok(avec.getPageCount() > sans.getPageCount());
  // Gabarit de 688 mm de développé : au moins 3 feuilles A4 de large
  assert.ok(avec.getPageCount() - sans.getPageCount() >= 3);
  const a3 = await PDFLib.PDFDocument.load(await ExportPDF.creer({ ...etude, echelle1: true, format: 'A3' }));
  assert.ok(a3.getPageCount() < avec.getPageCount());
  assert.strictEqual(ExportPDF.winAnsi('α ≥ 1 €'), 'a >= 1 €');
});
