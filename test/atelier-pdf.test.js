// Atelier PDF : moteur d'assemblage (pdf/src/moteur.js) avec pdf-lib
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

globalThis.PDFLib = require(path.join(__dirname, '../doe/public/vendor/pdf-lib-1.17.1.min.js'));
const { PDFDocument, PDFName, StandardFonts } = globalThis.PDFLib;
const Moteur = require('../pdf/src/moteur.js');

// Texte de tous les flux de contenu des pages (décompressés)
async function contenuPages(octets) {
  const doc = await PDFDocument.load(octets);
  let texte = '';
  for (const p of doc.getPages()) {
    for (const ref of p.node.Contents().asArray()) {
      texte += Buffer.from(globalThis.PDFLib.decodePDFRawStream(doc.context.lookup(ref)).decode()).toString('latin1');
    }
  }
  return texte;
}

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

test('tampon, cotes, longueur et surface avec étiquettes ; texte OCR invisible hors zones caviardées', async () => {
  const sources = { a: { octets: await pdfDe(1) } };
  const elements = [
    { type: 'tampon', x: 0.5, y: 0.1, w: 0.35, h: 0.1, texte: 'BON POUR EXÉCUTION', ligne2: 'Tecnitub – le 04/11/2026' },
    { type: 'cote', x1: 0.1, y1: 0.5, x2: 0.6, y2: 0.5, etiquette: '5,00 m' },
    { type: 'longueur', points: [[0.1, 0.6], [0.3, 0.6], [0.3, 0.7]], etiquette: '3,25 m' },
    { type: 'surface', points: [[0.5, 0.6], [0.8, 0.6], [0.8, 0.8], [0.5, 0.8]], etiquette: '12,40 m²' },
    { type: 'caviarde', x: 0.1, y: 0.9, w: 0.2, h: 0.03 },
  ];
  const ocr = [{ t: 'Visible', x: 0.5, y: 0.9, w: 0.1, h: 0.02 }, { t: 'Secret', x: 0.15, y: 0.905, w: 0.1, h: 0.02 }];
  for (const rotation of [0, 90]) {
    const octets = await Moteur.compiler({ sources, pages: [{ source: 'a', index: 0, rotation, elements, ocr }] });
    const contenu = await contenuPages(octets);
    const hex = t => Buffer.from(t, 'latin1').toString('hex').toUpperCase();
    assert.ok(contenu.includes(`<${hex('Visible')}>`), 'mot reconnu écrit (invisible)');
    assert.ok(!contenu.includes(`<${hex('Secret')}>`), 'mot sous le caviardage jamais écrit');
  }
  const l = Moteur.lignesTampon(elements[0], 600, 800, 1, (t, g, s) => t.length * s * 0.6);
  assert.strictEqual(l.length, 2);
  assert.ok(l[0].x >= 300 && l[0].x + l[0].texte.length * l[0].taille * 0.6 <= 300 + 210 + 0.01, 'titre centré dans le cadre');
  assert.strictEqual(Moteur.etiquettes(elements[1], 600, 800)[0].cx, 210);
});

test('PDF rouvert : annotations, numérotation, filigrane et sommaire retirés, données retrouvées', async () => {
  const sources = { a: { octets: await pdfDe(2) }, b: { octets: await pdfDe(1) } };
  const elA = [{ type: 'texte', x: 0.1, y: 0.1, texte: 'Note' }, { type: 'image', image: 'sig', x: 0.5, y: 0.5, w: 0.2, h: 0.1 }];
  const pages = [
    { source: 'a', index: 0, groupe: 'Notice', elements: elA, donnees: { elements: elA, groupe: 'Notice' } },
    { source: 'a', index: 1, groupe: 'Notice', elements: [], donnees: { elements: [], groupe: 'Notice' } },
    { source: 'b', index: 0, rotation: 90, groupe: 'Plan', elements: [], donnees: { elements: [], groupe: 'Plan', echelle: { mmParPt: 17.6 } } },
  ];
  const octets = await Moteur.compiler({
    sources, pages, images: { sig: { octets: PNG, mime: 'image/png' } },
    options: { sommaire: true, signets: true, numerotation: { actif: true }, filigrane: { actif: true, texte: 'COPIE' }, donneesDocument: { titre: 'DOE' } },
  });
  assert.strictEqual((await PDFDocument.load(octets)).getPageCount(), 4);
  const r = await Moteur.relire(octets);
  assert.ok(r, 'reconnu comme PDF Atelier');
  const doc = await PDFDocument.load(r.octets);
  assert.strictEqual(doc.getPageCount(), 3, 'page de sommaire retirée');
  // Il ne reste que le contenu d'origine (encadré par pdf-lib : q, contenu, Q)
  doc.getPages().forEach(p => assert.strictEqual(p.node.Contents().size(), 3));
  assert.strictEqual(doc.getPage(2).getRotation().angle, 90);
  assert.deepStrictEqual(r.pages.map(p => p.groupe), ['Notice', 'Notice', 'Plan']);
  assert.strictEqual(r.pages[0].elements[0].texte, 'Note');
  assert.strictEqual(r.pages[2].echelle.mmParPt, 17.6);
  assert.strictEqual(r.images.sig.mime, 'image/png');
  assert.deepStrictEqual([...r.images.sig.octets], [...PNG]);
  assert.strictEqual(r.options.titre, 'DOE');
  assert.strictEqual(await Moteur.relire(await pdfDe(1)), null, 'PDF ordinaire non concerné');
});

test('fichier projet .atelierpdf : aller-retour', () => {
  const Stockage = require('../pdf/src/stockage.js');
  const meta = { version: 1, pages: [{ id: 'p1', elements: [{ type: 'texte', texte: 'é' }] }] };
  const fichiers = new Map([['s1', { octets: new Uint8Array([1, 2, 3]), mime: 'application/pdf' }], ['i1', { octets: PNG, mime: 'image/png' }]]);
  const octets = Stockage.versProjet(meta, fichiers);
  assert.ok(Stockage.estProjet(octets));
  const r = Stockage.depuisProjet(octets);
  assert.deepStrictEqual(r.meta, meta);
  assert.deepStrictEqual([...r.fichiers.get('s1').octets], [1, 2, 3]);
  assert.strictEqual(r.fichiers.get('i1').mime, 'image/png');
  assert.deepStrictEqual([...r.fichiers.get('i1').octets], [...PNG]);
  assert.throws(() => Stockage.depuisProjet(PNG));
});

test('modifier le texte : caractères d\'origine retirés du contenu, le reste intact, nouveau texte écrit', async () => {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const pg = d.addPage([595, 842]);
  pg.drawText('Ligne une à garder', { x: 50, y: 750, size: 14, font: f });
  pg.drawText('Prix : 100 euros', { x: 50, y: 720, size: 14, font: f });
  pg.drawText('Fin du document', { x: 50, y: 690, size: 14, font: f });
  const sources = { a: { octets: await d.save() } };
  const hex = t => Buffer.from(t, 'latin1').toString('hex').toUpperCase();
  // Zone de « Prix : 100 euros » (repère de la page affichée, origine en haut à gauche)
  const zone = { x: 48 / 595, y: (842 - 734) / 842, w: 130 / 595, h: 18 / 842 };
  for (const rotation of [0, 90]) {
    const el = { type: 'texteModifie', zone: rotation ? { x: 716 / 842, y: 48 / 595, w: 18 / 842, h: 130 / 595 } : zone,
      x: zone.x, base: (842 - 720) / 842, texte: 'Prix : 95 euros', taille: 14, police: 'helvetica', couleur: '#000000', fond: '#ffffff' };
    const octets = await Moteur.compiler({ sources, pages: [{ source: 'a', index: 0, rotation, elements: [el] }], options: { editable: false } });
    const contenu = await contenuPages(octets);
    assert.ok(!contenu.includes(hex('Prix : 100 euros')), 'ancien texte retiré');
    assert.ok(contenu.includes(hex('Ligne une à garder')) && contenu.includes(hex('Fin du document')), 'autres lignes intactes');
    assert.ok(contenu.includes(hex('Prix : 95 euros')), 'nouveau texte écrit');
    assert.ok(!contenu.includes('1 1 1 rg'), 'pas de rectangle blanc de masquage : le texte a vraiment été retiré');
  }
});

test('modifier le texte : scan (pas de texte dans le contenu) -> fond posé par-dessus', async () => {
  const sources = { a: { octets: await pdfDe(1) } };
  const el = { type: 'texteModifie', zone: { x: 0.5, y: 0.5, w: 0.2, h: 0.02 }, x: 0.5, base: 0.515, texte: 'Nouveau', taille: 12, police: 'times', gras: true, italique: true, fond: '#fdf6e3' };
  const octets = await Moteur.compiler({ sources, pages: [{ source: 'a', index: 0, elements: [el] }], options: { editable: false } });
  const contenu = await contenuPages(octets);
  assert.match(contenu, /0\.99\d* 0\.96\d* 0\.89\d* rg/, 'rectangle de la couleur du fond posé sur le texte du scan');
  assert.strictEqual(Moteur.nomPoliceStandard(el), 'Times-BoldItalic');
});

test('formulaire : champs texte, case, boutons radio et liste remplis puis figés', async () => {
  const d = await PDFDocument.create();
  const pg = d.addPage([595, 842]);
  const form = d.getForm();
  form.createTextField('client').addToPage(pg, { x: 100, y: 700, width: 300, height: 20 });
  const obs = form.createTextField('obs'); obs.enableMultiline(); obs.addToPage(pg, { x: 100, y: 600, width: 300, height: 60 });
  form.createCheckBox('termine').addToPage(pg, { x: 100, y: 560, width: 15, height: 15 });
  const r = form.createRadioGroup('urgence');
  r.addOptionToPage('normale', pg, { x: 100, y: 520, width: 15, height: 15 });
  r.addOptionToPage('haute', pg, { x: 130, y: 520, width: 15, height: 15 });
  const dd = form.createDropdown('tech'); dd.addOptions(['Kevin', 'Thomas']); dd.addToPage(pg, { x: 100, y: 480, width: 150, height: 20 });
  const sources = { a: { octets: await d.save(), champs: { client: 'Laiterie – Rumilly', obs: 'Ligne 1\nLigne 2 €', termine: true, urgence: '1', tech: 'Thomas' } } };
  const octets = await Moteur.compiler({ sources, pages: [{ source: 'a', index: 0 }], options: { editable: false } });
  const out = await PDFDocument.load(octets);
  assert.strictEqual(out.getForm().getFields().length, 0, 'formulaire figé');
  // Formulaire figé : les valeurs sont dans les dessins des champs (sous-dessins de la page)
  let tout = '';
  for (const [, obj] of out.context.enumerateIndirectObjects()) {
    if (obj instanceof globalThis.PDFLib.PDFRawStream) { try { tout += Buffer.from(globalThis.PDFLib.decodePDFRawStream(obj).decode()).toString('latin1'); } catch { /* image */ } }
  }
  const hex = t => Buffer.from(t, 'latin1').toString('hex').toUpperCase();
  for (const t of ['Ligne 1', 'Ligne 2 \x80', 'Thomas', 'Laiterie \x96 Rumilly']) assert.ok(tout.includes(hex(t)) || tout.includes(`(${t})`), `valeur « ${t} » écrite`);
});

test('fichiers de l\'application : syntaxe JavaScript valide (modules de l\'interface assemblés)', () => {
  const { execFileSync } = require('node:child_process');
  for (const f of ['moteur.js', 'stockage.js', 'ocr.js']) {
    execFileSync(process.execPath, ['--check', path.join(__dirname, '../pdf/src', f)]);
  }
  // Interface : modules assemblés (une seule portée) ; une erreur indique le module en cause
  const { assemblerApp } = require('../pdf/assembler-app.js');
  const vm = require('node:vm');
  assert.doesNotThrow(() => new vm.Script(assemblerApp(), { filename: 'app (assemblé)' }));
});

test('annotations en commentaires PDF : types, apparence, retirées à la réouverture', async () => {
  const sources = { a: { octets: await pdfDe(1) } };
  const elements = [
    { type: 'texte', x: 0.1, y: 0.1, texte: 'Note', taille: 12 },
    { type: 'fleche', x1: 0.2, y1: 0.3, x2: 0.4, y2: 0.35 },
    { type: 'cadre', x: 0.5, y: 0.5, w: 0.2, h: 0.1 },
    { type: 'surligne', x: 0.1, y: 0.6, w: 0.3, h: 0.02 },
    { type: 'crayon', points: [[0.1, 0.8], [0.2, 0.82]] },
    { type: 'cote', x1: 0.1, y1: 0.9, x2: 0.5, y2: 0.9, etiquette: '4,00 m' },
    { type: 'caviarde', x: 0.6, y: 0.1, w: 0.1, h: 0.02 },
  ];
  for (const rotation of [0, 90]) {
    const octets = await Moteur.compiler({ sources, pages: [{ source: 'a', index: 0, rotation, elements, donnees: { elements } }], options: { commentaires: true, auteur: 'Tecnitub' } });
    const doc = await PDFDocument.load(octets);
    const annots = doc.getPage(0).node.lookup(PDFName.of('Annots')).asArray().map(r => doc.context.lookup(r));
    assert.deepStrictEqual(annots.map(a => a.get(PDFName.of('Subtype')).asString()), ['/FreeText', '/Line', '/Square', '/Square', '/Ink', '/Line'], 'un commentaire par annotation (pas le caviardage)');
    annots.forEach(a => assert.ok(a.lookup(PDFName.of('AP')).get(PDFName.of('N')), 'apparence fournie'));
    const relu = await Moteur.relire(octets);
    const doc2 = await PDFDocument.load(relu.octets);
    assert.ok(!doc2.getPage(0).node.lookup(PDFName.of('Annots')), 'commentaires retirés à la réouverture');
    assert.strictEqual(relu.pages[0].elements.length, elements.length, 'annotations retrouvées, modifiables');
  }
});

test('modifier le texte dans un sous-dessin (Form XObject) : seule l\'occurrence visée change', async () => {
  // Cartouche dessiné une fois (sous-dessin), posé deux fois en page 1 et une fois en page 2
  const modele = await PDFDocument.create();
  const fm = await modele.embedFont(StandardFonts.Helvetica);
  modele.addPage([200, 60]).drawText('Indice A', { x: 10, y: 20, size: 14, font: fm });
  const d = await PDFDocument.create();
  const [cartouche] = await d.embedPdf(await modele.save());
  const p1 = d.addPage([595, 842]), p2 = d.addPage([595, 842]);
  p1.drawPage(cartouche, { x: 50, y: 700 }); p1.drawPage(cartouche, { x: 50, y: 100 }); p2.drawPage(cartouche, { x: 50, y: 700 });
  const sources = { a: { octets: await d.save() } };
  // Zone du cartouche du haut de la page 1 (« Indice A » vers x 60-130, y 720-734)
  const el = { type: 'texteModifie', zone: { x: 55 / 595, y: (842 - 740) / 842, w: 90 / 595, h: 24 / 842 }, x: 60 / 595, base: (842 - 720) / 842, texte: 'Indice B', taille: 14, police: 'helvetica' };
  const octets = await Moteur.compiler({ sources, pages: [{ source: 'a', index: 0, elements: [el] }, { source: 'a', index: 1 }], options: { editable: false } });
  const doc = await PDFDocument.load(octets);
  const hex = t => Buffer.from(t, 'latin1').toString('hex').toUpperCase();
  const decode = ref => Buffer.from(globalThis.PDFLib.decodePDFRawStream(doc.context.lookup(ref)).decode()).toString('latin1');
  // Textes vus sur une page, sous-dessins compris
  const textes = page => {
    const xo = page.node.Resources().lookup(PDFName.of('XObject'));
    const contenu = page.node.Contents().asArray().map(decode).join('\n');
    const appels = [...contenu.matchAll(/\/([^\s/]+) Do/g)].map(m => m[1]);
    return { contenu, dessins: appels.map(n => decode(xo.get(PDFName.of(n)))) };
  };
  const t1 = textes(doc.getPage(0)), t2 = textes(doc.getPage(1));
  assert.strictEqual(t1.dessins.length, 2);
  assert.deepStrictEqual(t1.dessins.map(x => x.includes(hex('Indice A'))), [false, true], 'cartouche du haut modifié, celui du bas intact');
  assert.ok(t1.contenu.includes(hex('Indice B')), 'nouveau texte écrit');
  assert.ok(t2.dessins[0].includes(hex('Indice A')), 'page 2 intacte');
});
