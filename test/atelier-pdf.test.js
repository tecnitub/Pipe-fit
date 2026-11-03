// Atelier PDF : moteur d'assemblage (pdf/src/moteur.js) avec pdf-lib
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

globalThis.PDFLib = require(path.join(__dirname, '../doe/public/vendor/pdf-lib-1.17.1.min.js'));
const { PDFDocument, PDFName, StandardFonts } = globalThis.PDFLib;
const Moteur = require('../pdf/src/moteur.js');

// PNG 1×1 rouge
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'));

async function pdfDe(nbPages, taille = [595, 842], texte = 'Doc') {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < nbPages; i++) d.addPage(taille).drawText(`${texte} p${i + 1}`, { x: 50, y: 700, font: f, size: 20 });
  return d.save();
}

test('assemble, réordonne, tourne et duplique des pages de plusieurs PDF, images et pages blanches', async () => {
  const sources = { a: { octets: await pdfDe(3) }, b: { octets: await pdfDe(2, [842, 595], 'B') } };
  const pages = [
    { source: 'b', index: 1, rotation: 90, groupe: 'Document B' },
    { source: 'a', index: 0, rotation: 0, groupe: 'Document A' },
    { source: 'a', index: 2, rotation: 270, groupe: 'Document A' },
    { source: 'a', index: 0, rotation: 0, groupe: 'Document A' },
    { type: 'image', octets: PNG, mime: 'image/png', rotation: 0, groupe: 'Photo', source: 'img' },
    { type: 'blanche', largeur: 595, hauteur: 842, rotation: 0 },
  ];
  const octets = await Moteur.compiler({ sources, pages, options: { titre: 'Essai' } });
  const doc = await PDFDocument.load(octets);
  assert.strictEqual(doc.getPageCount(), 6);
  assert.deepStrictEqual(doc.getPages().map(p => p.getRotation().angle), [90, 0, 270, 0, 0, 0]);
  assert.strictEqual(Math.round(doc.getPage(0).getWidth()), 842);
  assert.strictEqual(doc.getTitle(), 'Essai');
});

test('sommaire, signets cliquables, numérotation et filigrane', async () => {
  const sources = { a: { octets: await pdfDe(2) }, b: { octets: await pdfDe(3) } };
  const pages = [0, 1].map(i => ({ source: 'a', index: i, groupe: 'Notice CTA' }))
    .concat([0, 1, 2].map(i => ({ source: 'b', index: i, groupe: 'Fiche technique — PAC « été »' })));
  const octets = await Moteur.compiler({
    sources, pages,
    options: { titre: 'DOE', sommaire: true, signets: true, numerotation: { actif: true, format: 'Page {n} / {total}', position: 'bas-droite' }, filigrane: { actif: true, texte: 'PROVISOIRE' } },
  });
  const doc = await PDFDocument.load(octets);
  assert.strictEqual(doc.getPageCount(), 6, '1 page de sommaire + 5 pages');
  const outlines = doc.catalog.lookup(PDFName.of('Outlines'));
  assert.ok(outlines, 'signets présents');
  assert.strictEqual(outlines.lookup(PDFName.of('Count')).asNumber(), 3, 'Sommaire + 2 documents');
  const annots = doc.getPage(0).node.lookup(PDFName.of('Annots'));
  assert.strictEqual(annots.size(), 2, 'deux liens dans le sommaire');
});

test('éléments ajoutés sur pages tournées : texte, masque, surlignage, cadre, image', async () => {
  const sources = { a: { octets: await pdfDe(1) } };
  const elements = [
    { type: 'texte', x: 0.1, y: 0.1, texte: 'Réservé — œuvre\n2e ligne ✓', taille: 14, couleur: '#1565c0' },
    { type: 'masque', x: 0.05, y: 0.05, w: 0.3, h: 0.05 },
    { type: 'surligne', x: 0.2, y: 0.5, w: 0.3, h: 0.03 },
    { type: 'cadre', x: 0.6, y: 0.6, w: 0.2, h: 0.1 },
    { type: 'image', x: 0.6, y: 0.8, w: 0.2, h: 0.1, image: 'sig' },
  ];
  for (const rotation of [0, 90, 180, 270]) {
    const octets = await Moteur.compiler({ sources, pages: [{ source: 'a', index: 0, rotation, elements }], images: { sig: { octets: PNG, mime: 'image/png' } } });
    const doc = await PDFDocument.load(octets);
    assert.strictEqual(doc.getPage(0).getRotation().angle, rotation);
  }
});

test('conversion des coordonnées affichées vers la page PDF', () => {
  const b = { x: 0, y: 0, width: 600, height: 800 };
  assert.deepStrictEqual(Moteur.versPdf(b, 0, 0, 0), { x: 0, y: 800 });
  assert.deepStrictEqual(Moteur.versPdf(b, 90, 0, 0), { x: 0, y: 0 });
  assert.deepStrictEqual(Moteur.versPdf(b, 180, 0, 0), { x: 600, y: 0 });
  assert.deepStrictEqual(Moteur.versPdf(b, 270, 0, 0), { x: 600, y: 800 });
  assert.deepStrictEqual(Moteur.tailleAffichee(b, 90), { l: 800, h: 600 });
});

test('lecture des plages de pages', () => {
  assert.deepStrictEqual(Moteur.lirePlages('1-3, 5; 8-', 9), [[0, 1, 2], [4], [7, 8]]);
  assert.throws(() => Moteur.lirePlages('4-2', 9));
  assert.throws(() => Moteur.lirePlages('12', 9));
  assert.throws(() => Moteur.lirePlages('', 9));
});

test('annotations : trait, flèche, ellipse, crayon, bulle avec texte, caviardage, sur pages tournées', async () => {
  const sources = { a: { octets: await pdfDe(1) } };
  const elements = [
    { type: 'ligne', x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.2, epaisseur: 3 },
    { type: 'fleche', x1: 0.2, y1: 0.6, x2: 0.4, y2: 0.4, couleur: '#00aa00' },
    { type: 'ellipse', x: 0.5, y: 0.5, w: 0.2, h: 0.1 },
    { type: 'crayon', points: [[0.1, 0.8], [0.15, 0.82], [0.2, 0.79]] },
    { type: 'bulle', x: 0.55, y: 0.1, w: 0.3, h: 0.12, px: 0.4, py: 0.3, texte: 'Vanne à remplacer — voir plan indice B, repère 12', taille: 10 },
    { type: 'caviarde', x: 0.1, y: 0.05, w: 0.3, h: 0.04 },
  ];
  for (const rotation of [0, 90, 180, 270]) {
    const octets = await Moteur.compiler({ sources, pages: [{ source: 'a', index: 0, rotation, elements }] });
    const doc = await PDFDocument.load(octets);
    assert.strictEqual(doc.getPage(0).getRotation().angle, rotation);
  }
});

test('formes : pointe de bulle sur le bon côté, flèche à deux tracés, coupure des lignes', () => {
  const bulle = Moteur.formes({ type: 'bulle', x: 0.1, y: 0.1, w: 0.2, h: 0.1, px: 0.2, py: 0.5 }, 100, 100)[0];
  assert.ok(bulle.cmds.some(c => c[0] === 'L' && c[1] === 20 && c[2] === 50), 'la pointe atteint le point visé');
  assert.strictEqual(Moteur.formes({ type: 'fleche', x1: 0, y1: 0, x2: 1, y2: 1 }, 100, 100).length, 2);
  assert.match(Moteur.chemin([['M', 1, 2], ['L', 3, 4], ['Z']]), /^M 1 2 L 3 4 Z$/);
  const lignes = Moteur.couperLignes(t => t.length, 'un deux trois quatre', 9);
  assert.deepStrictEqual(lignes, ['un deux', 'trois', 'quatre']);
});
