// Texte d'un PDF ou d'une photo d'offre fournisseur, sur l'appareil (rien n'est envoyé à l'extérieur) :
// - PDF avec texte : pdf.js (vendor/pdfjs), le texte est remis en lignes d'après sa position, les colonnes séparées
//   par des tabulations (quantité, prix, montant ne se mélangent pas) ;
// - PDF scanné ou photo : lecture des caractères (OCR, même module que les tickets de notes de frais).
// Les fichiers de pdf.js (≈ 1,4 Mo) ne sont chargés qu'à la première lecture.
const PdfLecture = (() => {
  const dossier = () => new URL(window.PDFJS_DOSSIER || 'vendor/pdfjs/', location.href).href;
  let pret = null;
  const charger = () => pret || (pret = new Promise((ok, ko) => {
    if (window.pdfjsLib) return ok(window.pdfjsLib);
    const s = document.createElement('script');
    s.src = `${dossier()}pdf.min.js`;
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${dossier()}pdf.worker.min.js`; ok(window.pdfjsLib); };
    s.onerror = () => { pret = null; ko(new Error('Lecteur de PDF indisponible')); };
    document.head.appendChild(s);
  }));

  // Éléments de texte d'une page -> lignes (même hauteur), cellules (écart horizontal important), puis lignes de tableau :
  // une désignation écrite sur plusieurs lignes dans sa case est rattachée à la ligne qui porte les prix.
  function enLignes(items) {
    const el = items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.transform[3]) || i.height || 8 }));
    el.sort((a, b) => b.y - a.y || a.x - b.x);
    const lignes = [];
    el.forEach(e => {
      const l = lignes.find(x => Math.abs(x.y - e.y) <= Math.max(2, Math.min(x.h, e.h) * 0.45));
      if (l) l.el.push(e); else lignes.push({ y: e.y, h: e.h, el: [e] });
    });
    lignes.sort((a, b) => b.y - a.y);
    lignes.forEach(l => {
      l.el.sort((a, b) => a.x - b.x);
      l.cellules = [];
      let c = null;
      l.el.forEach(e => {
        const ecart = c ? e.x - c.fin : 0;
        if (c && ecart <= Math.max(e.h * 1.1, 8)) { c.t += (ecart > Math.max(0.5, e.h * 0.12) && !/\s$/.test(c.t) && !/^\s/.test(e.s) ? ' ' : '') + e.s; c.fin = e.x + e.w; }
        else { c = { x: e.x, t: e.s, fin: e.x + e.w }; l.cellules.push(c); }
      });
      l.cellules.forEach(x => { x.t = x.t.replace(/\s+/g, ' ').trim(); });
      l.texte = l.cellules.map(x => x.t).join('\t');
    });
    return regrouper(lignes);
  }
  // Blocs de lignes rapprochées (une ligne du tableau avec son retrait) : séparés par un écart vertical plus grand
  function regrouper(lignes) {
    const blocs = [];
    lignes.forEach((l, k) => {
      const prec = lignes[k - 1];
      if (prec && prec.y - l.y <= Math.max(prec.h, l.h) * 1.45) blocs[blocs.length - 1].push(l); else blocs.push([l]);
    });
    const estArticle = l => typeof OffreLecture !== 'undefined' && OffreLecture.estLignePrix(l.texte);
    // Morceaux d'une même ligne de tableau -> une ligne, colonne par colonne (même abscisse de départ)
    const fusionner = groupe => {
      const colonnes = [];
      groupe.forEach(l => l.cellules.forEach(c => {
        const col = colonnes.find(x => Math.abs(x.x - c.x) <= 14);
        if (col) col.t.push(c.t); else colonnes.push({ x: c.x, t: [c.t] });
      }));
      // Mot coupé en fin de ligne (« CO3D316- » puis « 100 ») : recollé sans espace
      return colonnes.sort((a, b) => a.x - b.x).map(c => c.t.reduce((acc, t) => acc + (/[-/]$/.test(acc) && /^[A-Z0-9]/i.test(t) ? '' : ' ') + t)).join('\t');
    };
    const out = [];
    blocs.forEach(b => {
      const art = b.map(estArticle);
      if (!art.some(Boolean) || b.length === 1) { b.forEach(l => out.push(l.texte)); return; }
      const groupes = b.map(() => null), indices = b.map((_, k) => k).filter(k => art[k]);
      b.forEach((l, k) => {
        if (art[k]) { groupes[k] = k; return; }
        // Tableau aligné en haut (le bloc commence par une ligne de prix) : le retrait va à la ligne de prix au-dessus ;
        // tableau centré : à la ligne de prix la plus proche (à égalité, celle d'en dessous)
        const dessus = indices.filter(x => x < k).pop(), dessous = indices.find(x => x > k);
        if (art[0]) groupes[k] = dessus ?? dessous;
        else groupes[k] = dessus === undefined ? dessous : dessous === undefined ? dessus : (l.y - b[dessous].y <= b[dessus].y - l.y ? dessous : dessus);
      });
      indices.forEach(k => out.push(fusionner(b.filter((_, n) => groupes[n] === k))));
    });
    return out;
  }

  async function ocrImage(dataUrl, progression) {
    if (typeof OCR === 'undefined') throw new Error('Lecture des scans indisponible');
    return String(await OCR.lire(dataUrl, progression)).split(/\r?\n/);
  }

  // Fichier (PDF ou image) -> { lignes, ocr, pages }
  async function lire(fichier, progression = () => {}) {
    if (/^image\//.test(fichier.type) || /\.(jpe?g|png|webp)$/i.test(fichier.name || '')) {
      const dataUrl = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(fichier); });
      return { lignes: await ocrImage(dataUrl, progression), ocr: true, pages: 1 };
    }
    const lib = await charger();
    const doc = await lib.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()), isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
    const n = Math.min(doc.numPages, 12), lignes = [];
    let ocr = false;
    for (let p = 1; p <= n; p++) {
      progression((p - 1) / n);
      const page = await doc.getPage(p);
      const l = enLignes((await page.getTextContent()).items);
      if (l.join('').replace(/\s/g, '').length > 40) { lignes.push(...l); continue; }
      // Page sans texte (scan) : rendue en image puis lue
      ocr = true;
      const vue = page.getViewport({ scale: 2 }), c = document.createElement('canvas');
      c.width = vue.width; c.height = vue.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vue }).promise;
      lignes.push(...await ocrImage(c.toDataURL('image/png'), x => progression((p - 1 + x) / n)));
    }
    progression(1);
    return { lignes, ocr, pages: doc.numPages };
  }
  return { lire, enLignes };
})();
