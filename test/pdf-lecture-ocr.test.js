// Lecture d'un PDF ou d'une image : OCR indisponible (démo ouverte depuis un fichier, module absent) -> la lecture se
// termine sans OCR, le résultat est marqué et l'interface prévenue, sans jamais échouer.
const { test } = require('node:test');
const assert = require('node:assert');
const PdfLecture = require('../public/js/pdf-lecture');

// Lecteur de fichier minimal (le navigateur fournit FileReader)
class LecteurFictif { readAsDataURL() { setTimeout(() => { this.result = 'data:image/png;base64,AAAA'; this.onload(); }, 0); } }
const image = { name: 'ticket-fictif.png', type: 'image/png', arrayBuffer: async () => new ArrayBuffer(4) };

test('image : OCR indisponible en fichier local -> lignes vides, résultat marqué, message affiché', async () => {
  const messages = [];
  global.FileReader = LecteurFictif;
  global.location = { protocol: 'file:' };
  global.toast = m => messages.push(m);
  global.OCR = { MESSAGE_FICHIER: 'OCR indisponible dans la démo ouverte depuis un fichier : ouvrez l\'application installée ou servez la démo en HTTP',
    lire: async () => { throw new Error('NetworkError: worker.min.js failed to load'); } };
  try {
    const r = await PdfLecture.lire(image);
    assert.deepStrictEqual(r.lignes, []);
    assert.strictEqual(r.ocrIndisponible, true);
    assert.strictEqual(r.ocr, false);
    assert.match(r.message, /démo ouverte depuis un fichier/);
    assert.deepStrictEqual(messages, [r.message]);
    // Servie en HTTP, module absent : message générique, toujours sans échec
    global.location = { protocol: 'http:' };
    const h = await PdfLecture.lire(image);
    assert.strictEqual(h.ocrIndisponible, true);
    assert.match(h.message, /OCR\) indisponible : NetworkError/);
    // OCR disponible : texte lu, pas de marque
    global.OCR = { lire: async () => 'Ligne 1\nLigne 2' };
    const ok = await PdfLecture.lire(image);
    assert.deepStrictEqual([ok.lignes, ok.ocr, ok.ocrIndisponible], [['Ligne 1', 'Ligne 2'], true, undefined]);
  } finally { ['FileReader', 'location', 'toast', 'OCR'].forEach(k => delete global[k]); }
});
