// Reconnaissance de texte (OCR) sur l'appareil : Tesseract, modèle français. Rien n'est envoyé sur Internet.
// Version compilée : le moteur, son « worker » et le modèle sont inclus dans la page (window.TESS_SRC).
// Développement : lus depuis public/vendor/tesseract (page servie en http).
const OcrAtelier = (() => {
  'use strict';
  let worker = null;
  let suivi = null;

  async function fichiers() {
    if (window.TESS_SRC) {
      const s = window.TESS_SRC;
      return { coeur: s.coeur, worker: s.worker, fra: Uint8Array.from(atob(s.fra), c => c.charCodeAt(0)) };
    }
    const base = new URL('../../public/vendor/tesseract/', location.href).href;
    const [coeur, w, fra] = await Promise.all([
      fetch(`${base}tesseract-core-simd-lstm.wasm.js`).then(r => r.text()),
      fetch(`${base}worker.min.js`).then(r => r.text()),
      fetch(`${base}fra.traineddata.gz`).then(r => r.arrayBuffer()),
    ]);
    return { coeur, worker: w, fra: new Uint8Array(fra) };
  }

  // Le modèle est déposé dans le cache de Tesseract (IndexedDB « keyval-store ») où le worker le lit
  const mettreEnCache = (cle, valeur) => new Promise((ok, ko) => {
    const r = indexedDB.open('keyval-store');
    r.onupgradeneeded = () => r.result.createObjectStore('keyval');
    r.onerror = () => ko(new Error('Stockage du navigateur indisponible'));
    r.onsuccess = () => {
      const t = r.result.transaction('keyval', 'readwrite');
      t.objectStore('keyval').put(valeur, cle);
      t.oncomplete = () => { r.result.close(); ok(); };
      t.onerror = () => ko(t.error);
    };
  });

  async function preparer() {
    if (worker) return worker;
    worker = (async () => {
      const f = await fichiers();
      await mettreEnCache('./fra.traineddata', f.fra);
      // Moteur et worker réunis dans un seul script : le worker trouve le moteur déjà chargé
      const script = `${f.coeur};self.TesseractCore = self.TesseractCore || self.TesseractCoreWASM;\n${f.worker}`;
      const url = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
      return Tesseract.createWorker('fra', 1, {
        workerPath: url, corePath: 'tesseract-core.wasm.js', workerBlobURL: false, cacheMethod: 'readOnly',
        logger: m => { if (suivi && m.status === 'recognizing text') suivi(m.progress); },
      });
    })().catch(e => { worker = null; throw e; });
    return worker;
  }

  return {
    // Mots reconnus dans un canvas : [{ t, x, y, w, h }] en fractions de l'image (origine en haut à gauche)
    async lire(canvas, progression) {
      suivi = progression || null;
      try {
        const w = await preparer();
        const { data } = await w.recognize(canvas, {}, { blocks: true });
        const L = canvas.width, H = canvas.height;
        const mots = [];
        (data.blocks || []).forEach(b => b.paragraphs.forEach(p => p.lines.forEach(l => l.words.forEach(m => {
          const t = (m.text || '').trim();
          if (!t || m.confidence < 35) return;
          const { x0, y0, x1, y1 } = m.bbox;
          mots.push({ t, x: x0 / L, y: y0 / H, w: (x1 - x0) / L, h: (y1 - y0) / H });
        }))));
        return mots;
      } finally { suivi = null; }
    },
  };
})();
