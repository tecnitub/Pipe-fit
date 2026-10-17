// Lecture du texte d'une photo de ticket sur l'appareil (Tesseract, modèle français) : rien n'est envoyé à un service extérieur.
// Les fichiers (≈ 4,7 Mo) ne sont chargés qu'à la première photo, puis gardés en cache par le navigateur.
const OCR = (() => {
  let worker = null, suivi = null;
  const dossier = () => new URL(window.OCR_DOSSIER || 'vendor/tesseract/', location.href).href;
  const chargerScript = src => new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Module de lecture indisponible')); document.head.appendChild(s);
  });
  async function preparer() {
    if (!window.Tesseract) await chargerScript(`${dossier()}tesseract.min.js`);
    if (!worker) {
      worker = Tesseract.createWorker('fra', 1, {
        workerPath: `${dossier()}worker.min.js`, corePath: `${dossier()}tesseract-core-simd-lstm.wasm.js`, langPath: dossier().replace(/\/$/, ''),
        logger: m => { if (suivi && m.status === 'recognizing text') suivi(m.progress); },
      }).catch(e => { worker = null; throw e; });
    }
    return worker;
  }
  // Niveaux de gris et contraste étiré : les tickets thermiques sont souvent pâles
  function ameliorer(dataUrl, max = 1800) {
    return new Promise((ok, ko) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
        const d = g.getImageData(0, 0, c.width, c.height), p = d.data, gris = new Uint8Array(p.length / 4), histo = new Uint32Array(256);
        for (let i = 0; i < gris.length; i++) { gris[i] = (p[i * 4] * 299 + p[i * 4 + 1] * 587 + p[i * 4 + 2] * 114) / 1000; histo[gris[i]]++; }
        let bas = 0, haut = 255, n = 0;
        while (bas < 255 && (n += histo[bas]) < gris.length * 0.02) bas++;
        n = 0; while (haut > 0 && (n += histo[haut]) < gris.length * 0.02) haut--;
        const e = 255 / Math.max(1, haut - bas);
        for (let i = 0; i < gris.length; i++) { const v = Math.max(0, Math.min(255, (gris[i] - bas) * e)); p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v; }
        g.putImageData(d, 0, 0); ok(c.toDataURL('image/png'));
      };
      img.onerror = () => ko(new Error('Image illisible'));
      img.src = dataUrl;
    });
  }
  return {
    // Texte du ticket ; progression(0..1) pendant la lecture
    async lire(dataUrl, progression) {
      suivi = progression || null;
      try { const w = await preparer(); const { data } = await w.recognize(await ameliorer(dataUrl)); return data.text || ''; }
      finally { suivi = null; }
    },
  };
})();
