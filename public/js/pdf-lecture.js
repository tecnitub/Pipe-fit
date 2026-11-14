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
    // Gras simulé par surimpression (même texte répété au même endroit, à un point près) : gardé une fois
    const el = [], vus = new Map();
    items.filter(i => i && i.str && i.str.trim() && i.transform).forEach(i => {
      const e = { s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.transform[3]) || i.height || 8 }, memes = vus.get(e.s) || [];
      if (memes.some(d => Math.abs(d.x - e.x) < 1.5 && Math.abs(d.y - e.y) < 1.5)) return;
      memes.push(e); vus.set(e.s, memes); el.push(e);
    });
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

  // ---- Réparations du texte extrait (pdf.js) -------------------------------------------------------------------------
  // Ligatures sans correspondance Unicode dans la police : pdf.js rend « fi », « fl », « ffi » par un caractère nul (ou
  // U+FFFD) : « frigori\0que », « \0uide », « E\0cacité ». La ligature est devinée d'après les lettres voisines.
  function ligatures(s) {
    if (!/[\u0000\uFFFD]/.test(s)) return s;
    return s.replace(/[\u0000\uFFFD]/g, (c, i, t) => {
      const av = t.slice(Math.max(0, i - 4), i).toLowerCase(), ap = t.slice(i + 1, i + 6).toLowerCase();
      if (/^(?:cac|cien|san|cul)/.test(ap) && /[a-z]$/.test(av)) return 'ffi';
      if (/(?:sou|insu|bou)$/.test(av) && /^(?:a|e|é)/.test(ap)) return 'ffl';
      if (/^(?:oul|ab|n|l|x|g|c|ch|e[lr]|ss|t)/.test(ap)) return 'fi';
      if (/^[éè]/.test(ap)) return /r[ée]$/.test(av) ? 'fl' : 'fi';
      if (/^(?:u|o|a[mnc]|e[xu])/.test(ap)) return 'fl';
      return 'fi';
    });
  }
  // Accents posés à côté de la lettre (polices TeX, logiciels de sélection) : « d ́ebit », « Pi`ece », « Cˆable », « Fran ̧cais »
  const MARQUES = { '´': '́', '`': '̀', 'ˆ': '̂', '¨': '̈' };
  function accents(s) {
    if (!/[̀-̧´`ˆ¨¸]/.test(s)) return s;
    return s
      // Marque combinante portée par une espace (la marque précède la lettre) : l'espace est retirée
      .replace(/ ?([́̀̂̈])([A-Za-z])/g, (m, a, l) => l + a).replace(/ ?̧([cC])/g, '$1̧')
      // Marque d'espacement collée devant une voyelle (ou une cédille devant c)
      .replace(/([´`ˆ¨])([aeiouyAEIOUY])/g, (m, a, l) => l + MARQUES[a]).replace(/¸([cC])/g, '$1̧')
      .normalize('NFC');
  }
  // Exposants perdus : « m /h » (m³/h, le « 3 » est passé sur la ligne au-dessus), « m§/h » (police symbole)
  const unites = s => s.replace(/\bm(?: |§|\*)\/(h|s)\b/gi, (m, u) => `m³/${u.toLowerCase()}`);
  // Espace rendue par un glyphe de symbole (« Débit⮎soufflage ») : un même symbole répété entre les mots d'une ligne
  const espaces = s => { const m = s.match(/(?<=\S)[←-⯿-](?=\S)/g); if (!m || m.length < 2) return s; const c = m.sort((a, b) => m.filter(x => x === b).length - m.filter(x => x === a).length)[0]; return s.split(c).join(' '); };
  // Polices sous-ensemble dont les codes sont les numéros de glyphe (ordre Macintosh standard) : « 7HVW » = « Test » ;
  // une cellule qui contient des caractères de contrôle est décalée de 29 (espace = 3)
  const MAC = { 98: 'Ä', 99: 'Å', 100: 'Ç', 101: 'É', 102: 'Ñ', 103: 'Ö', 104: 'Ü', 105: 'á', 106: 'à', 107: 'â', 108: 'ä', 109: 'ã', 110: 'å', 111: 'ç', 112: 'é', 113: 'è', 114: 'ê', 115: 'ë', 116: 'í', 117: 'ì', 118: 'î', 119: 'ï', 120: 'ñ', 121: 'ó', 122: 'ò', 123: 'ô', 124: 'ö', 125: 'õ', 126: 'ú', 127: 'ù', 128: 'û', 129: 'ü', 182: '’', 191: 'fi', 192: 'fl' };
  const decaler = t => [...t].map(c => { const k = c.codePointAt(0); return k >= 3 && k <= 97 && k !== 32 ? String.fromCharCode(k + 29) : MAC[k] || c; }).join('');
  const CTRL = /[\u0001-\u0008\u000B-\u001F]/, CTRLG = /[\u0001-\u0008\u000B-\u001F]/g;
  const cellules = l => String(l).split('\t').map(c => (CTRL.test(c) ? decaler(c) : c)).join('\t');
  // Part des mots « lisibles » (lettres avec une voyelle, sans suite de consonnes improbable) parmi les mots d'une page
  function lisible(lignes) {
    const mots = lignes.join(' ').split(/\s+/).filter(m => /[A-Za-zÀ-ÿ]/.test(m));
    if (mots.length < 15) return 1;
    const ok = mots.filter(m => {
      const x = m.replace(/^[("'«“‘\-–•·]+|[)"'»”’.,;:!?%]+$/g, '');
      return /^[A-Za-zÀ-ÿ0-9'’./°²³+\-–]+$/.test(x) && (/[aeiouyàâéèêëîïôöûü]/i.test(x) || /\d/.test(x)) && !/[bcdfghjklmnpqrstvwxz]{5}/i.test(x);
    }).length;
    return ok / mots.length;
  }
  // Charabia : police à encodage personnalisé (« !"#$% & ' ( ) ») ; caractères de contrôle nombreux, peu de mots lisibles
  // même une fois les glyphes décalés
  function charabia(lignes) {
    const t = lignes.join(''), n = t.replace(/\s/g, '').length;
    if (n < 40) return false;
    return (t.match(CTRLG) || []).length / n > 0.03 && lisible(lignes.map(cellules)) < 0.6;
  }
  // Ligne réparée : glyphes décalés, ligatures (sans code, de compatibilité NFKC, « Ɵ » pour « ti », « Ʃ » pour « tt »),
  // accents détachés, exposants perdus
  const reparer = l => unites(espaces(accents(ligatures(CTRL.test(l) ? cellules(l) : String(l)).normalize('NFKC').replace(/Ɵ/g, 'ti').replace(/Ʃ/g, 'tt'))));

  async function ocrImage(dataUrl, progression) {
    if (typeof OCR === 'undefined') throw new Error('Lecture des scans indisponible');
    return String(await OCR.lire(dataUrl, progression)).split(/\r?\n/);
  }
  // OCR indisponible (démo ouverte depuis un fichier, module non publié, worker refusé) : la lecture continue sans OCR,
  // le résultat est marqué (ocrIndisponible, message) et l'interface prévenue (message affiché, événement « ocr-indisponible »)
  function messageOcr(e) {
    if (typeof location !== 'undefined' && location.protocol === 'file:' && typeof OCR !== 'undefined' && OCR.MESSAGE_FICHIER) return OCR.MESSAGE_FICHIER;
    const m = String((e && e.message) || e || '');
    return /^OCR indisponible|^Lecture des caractères \(OCR\) indisponible/.test(m) ? m : `Lecture des caractères (OCR) indisponible${m ? ` : ${m}` : ''} ; texte des pages scannées non lu.`;
  }
  function signaler(message) {
    try {
      if (typeof toast === 'function') toast(message, 8000);
      else if (typeof App !== 'undefined' && App && typeof App.toast === 'function') App.toast(message, 8000);
      if (typeof window !== 'undefined' && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent('ocr-indisponible', { detail: { message } }));
    } catch (err) { /* sans interface */ }
  }

  // Fichier (PDF ou image) -> { lignes, ocr, pages } ; opts : pagesMax (12 par défaut), ocr (false : pages scannées ignorées)
  // OCR indisponible : { …, ocrIndisponible: true, message } (pages scannées laissées sans texte, jamais d'échec de la lecture)
  async function lire(fichier, progression = () => {}, opts = {}) {
    if (!fichier || typeof fichier.arrayBuffer !== 'function') throw new Error('Aucun fichier à lire');
    let indispo = null;
    const parOcr = async (dataUrl, prog) => {
      if (indispo) return [];
      try { return await ocrImage(dataUrl, prog); } catch (e) { indispo = messageOcr(e); signaler(indispo); return []; }
    };
    const marque = () => (indispo ? { ocrIndisponible: true, message: indispo } : {});
    if (/^image\//.test(fichier.type) || /\.(jpe?g|png|webp)$/i.test(fichier.name || '')) {
      const dataUrl = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(fichier); });
      const lignes = await parOcr(dataUrl, progression);
      return { lignes, ocr: !indispo, pages: 1, ...marque() };
    }
    const lib = await charger();
    const doc = await lib.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()), isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
    const n = Math.min(doc.numPages, opts.pagesMax || 12), lignes = [];
    let ocr = false, charabias = 0;
    for (let p = 1; p <= n; p++) {
      progression((p - 1) / n);
      const page = await doc.getPage(p);
      // Texte réparé (ligatures, accents, exposants) ; texte illisible (police à encodage personnalisé) : lu par OCR
      const brut = enLignes((await page.getTextContent()).items), illisible = charabia(brut);
      const l = illisible ? [] : brut.map(reparer);
      if (illisible) charabias++;
      if (l.join('').replace(/\s/g, '').length > 40) { lignes.push(...l); continue; }
      if (opts.ocr === false) continue;
      // Page sans texte (scan) : rendue en image puis lue (OCR indisponible : page laissée sans texte)
      if (indispo) continue;
      const vue = page.getViewport({ scale: 2 }), c = document.createElement('canvas');
      c.width = vue.width; c.height = vue.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vue }).promise;
      const lu = await parOcr(c.toDataURL('image/png'), x => progression((p - 1 + x) / n));
      if (!indispo) { ocr = true; lignes.push(...lu); }
    }
    progression(1);
    return { lignes, ocr, pages: doc.numPages, ...(charabias ? { illisible: charabias } : {}), ...marque() };
  }
  return { lire, enLignes, reparer, ligatures, accents, charabia };
})();
if (typeof module !== 'undefined') module.exports = PdfLecture;
