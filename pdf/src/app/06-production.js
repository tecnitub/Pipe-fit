  // ---------- Production du PDF ----------
  // Page convertie en image (PDF protégé/abîmé ou réduction de taille) à la rotation d'origine du fichier
  async function pageEnImage(p, dpi) {
    const s = etat.sources.get(p.source);
    const doc = await s.doc;
    const page = await doc.getPage(p.index + 1);
    const vp = page.getViewport({ scale: dpi / 72, rotation: p.rotBase || 0 });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp, intent: 'print', annotationMode: pdfjs.AnnotationMode.ENABLE }).promise;
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
    const d = MoteurPDF.tailleAffichee(p.boite, p.rotBase || 0);
    c.width = c.height = 0;
    return { type: 'image', plein: true, octets: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg', largeur: d.l, hauteur: d.h };
  }

  async function pageCaviardee(p, dpi) {
    const d = dims(p);
    const dpr = window.devicePixelRatio || 1;
    const c = document.createElement('canvas');
    const { ech } = await rendrePage(p, c, d.l * dpi / 72 / dpr);
    // Seules les zones noires sont incrustées dans l'image ; les autres annotations restent vectorielles
    await dessinerElements(p, c, ech, dpr, 'caviarde');
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    c.width = c.height = 0;
    return { type: 'image', plein: true, octets: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg', largeur: d.l, hauteur: d.h };
  }

  // Mots sous une zone caviardée : jamais recopiés (ni texte invisible, ni données de réédition)
  const sousCaviardage = (m, caches) => caches.some(c => m.x < c.x + c.w && m.x + m.w > c.x && m.y < c.y + c.h && m.y + m.h > c.y);

  // Texte d'une page PDF (pdf.js) en « mots » positionnés sur la page affichée : sert à garder le texte
  // interrogeable quand la page est recopiée en image, et à la recherche pour caviarder
  // Texte d'une page, gardé en mémoire (recherche, caviardage, modification) : même document, page et rotation
  const cacheTexte = new Map();
  function texteNatif(p) {
    if (p.type !== 'pdf') return Promise.resolve([]);
    const cle = `${p.source}|${p.index}|${rotTotale(p)}`;
    if (!cacheTexte.has(cle)) cacheTexte.set(cle, texteNatifBrut(p).catch(e => { cacheTexte.delete(cle); throw e; }));
    return cacheTexte.get(cle);
  }
  async function texteNatifBrut(p) {
    const doc = await etat.sources.get(p.source).doc;
    const page = await doc.getPage(p.index + 1);
    const vp = page.getViewport({ scale: 1, rotation: rotTotale(p) });
    const contenu = await page.getTextContent();
    const res = [];
    for (const it of contenu.items) {
      if (!it.str || !it.str.trim()) continue;
      const [a, b, c, d, tx, ty] = it.transform;
      const lgDir = Math.hypot(a, b) || 1, haut = it.height || Math.hypot(c, d) || 10;
      const ux = a / lgDir, uy = b / lgDir, nx = -uy, ny = ux;
      const lg = it.width || lgDir * it.str.length * 0.5;
      // Origine, sens d'écriture et hauteur dans le repère de la page affichée (fractions)
      const pt = (dd, hh) => { const q = vp.convertToViewportPoint(tx + ux * dd + nx * hh * haut, ty + uy * dd + ny * hh * haut); return [q[0] / vp.width, q[1] / vp.height]; };
      const o = pt(0, -0.25), fin = pt(lg, -0.25), hautO = pt(0, 1.0);
      const coins = [o, fin, pt(lg, 1.0), hautO];
      const xs = coins.map(q => q[0]), ys = coins.map(q => q[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      res.push({ t: it.str, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, o, u: [fin[0] - o[0], fin[1] - o[1]], v: [hautO[0] - o[0], hautO[1] - o[1]],
        b: pt(0, 0), taille: haut, police: it.fontName, famille: contenu.styles[it.fontName]?.fontFamily || '' });
    }
    return res;
  }
  async function aDuTexte(p) {
    if (p.ocr && p.ocr.length) return true;
    if (p.type !== 'pdf') return false;
    if (p.texteNatif == null) p.texteNatif = (await texteNatif(p)).reduce((n, m) => n + m.t.trim().length, 0) > 15;
    return p.texteNatif;
  }

  async function produire(pages, opts, avance = () => {}) {
    const sources = {};
    const liste = [];
    const images = {};
    for (const p of pages) for (const e of p.elements) if (e.type === 'image' && etat.images.has(e.image)) images[e.image] = etat.images.get(e.image);
    let k = 0;
    for (const p of pages) {
      const s = etat.sources.get(p.source);
      const caches = p.elements.filter(e => e.type === 'caviarde');
      const enImage = caches.length > 0 || (p.type === 'pdf' && (s.rasteriser || opts.compresser));
      // Texte à garder interrogeable : reconnu (OCR), ou celui du PDF quand la page devient une image
      let mots = p.ocr || null;
      if (!mots && enImage && p.type === 'pdf') mots = (await texteNatif(p)).map(({ t, x, y, w, h }) => ({ t, x, y, w, h }));
      const anciens = p.elements.filter(e => e.type === 'texteModifie').map(e => e.zone);
      if (mots && (caches.length || anciens.length)) mots = mots.filter(m => !sousCaviardage(m, [...caches, ...anciens]));
      // Données pour rouvrir le PDF et modifier à nouveau : le caviardage, lui, est définitif
      const donnees = { elements: p.elements.filter(e => e.type !== 'caviarde'), groupe: s ? s.nom : (p.titre || null) };
      if (p.ocr) donnees.ocr = caches.length ? p.ocr.filter(m => !sousCaviardage(m, caches)) : p.ocr;
      if (p.echelle) donnees.echelle = p.echelle;
      if (p.titre) donnees.intercalaire = p.titre;
      const commun = { elements: p.elements, groupe: s ? s.nom : p.titre, source: s ? s.id : (p.titre ? p.id : null), ocr: mots, donnees };
      if (caches.length) {
        // Caviardage : la page est recopiée en image avec les zones noircies, le texte et les images dessous disparaissent
        liste.push({ ...await pageCaviardee(p, opts.compresser ? opts.dpi : 200), ...commun, rotation: 0 });
      } else if (p.type === 'pdf') {
        if (s.rasteriser || opts.compresser) {
          liste.push({ ...await pageEnImage(p, s.rasteriser && !opts.compresser ? 200 : opts.dpi), ...commun, rotation: p.rot });
        } else {
          sources[s.id] = sources[s.id] || { octets: s.octets, champs: s.champs || null };
          liste.push({ ...commun, index: p.index, rotation: rotTotale(p) });
        }
      } else if (p.type === 'image') {
        liste.push({ ...commun, type: 'image', octets: s.octets, mime: s.mime, rotation: p.rot });
      } else {
        liste.push({ ...commun, type: 'blanche', largeur: p.boite.width, hauteur: p.boite.height, rotation: p.rot });
      }
      avance(0.5 * ++k / pages.length);
    }
    return MoteurPDF.compiler({ sources, pages: liste, options: opts, images, progression: v => avance(0.5 + v * 0.5) });
  }

  async function enregistrer(octets, nom) {
    const blob = new Blob([octets], { type: 'application/pdf' });
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: nom, types: [{ description: 'Document PDF', accept: { 'application/pdf': ['.pdf'] } }] });
        const w = await h.createWritable();
        await w.write(blob);
        await w.close();
        return h.name;
      } catch (e) {
        if (e.name === 'AbortError') return null;
        console.warn('Enregistrement direct impossible, téléchargement', e);
      }
    }
    telecharger(blob, nom);
    return nom;
  }
  function telecharger(blob, nom) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  const taille = n => n > 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`;

  async function enregistrerPages(pages, nomParDefaut) {
    if (!pages.length) return;
    const opts = options();
    try {
      const octets = await occupe('Création du PDF…', avance => produire(pages, opts, avance));
      const nom = await enregistrer(octets, `${nomFichier(opts.titre || nomParDefaut)}.pdf`);
      if (nom) note(`« ${nom} » enregistré (${pages.length} page${pages.length > 1 ? 's' : ''}, ${taille(octets.length)}).`, 'ok');
    } catch (e) {
      console.error(e);
      note(`Le PDF n'a pas pu être créé : ${e.message || e}`, 'erreur');
    }
  }

  // ---------- Reconnaissance du texte (OCR) ----------
  async function reconnaitre() {
    const cibles = etat.selection.size ? pagesChoisies() : etat.pages.slice();
    if (!cibles.length) return;
    const aTraiter = [];
    let dejaTexte = 0;
    await occupe('Recherche des pages sans texte…', async avance => {
      for (let i = 0; i < cibles.length; i++) {
        const p = cibles[i];
        if (p.type === 'blanche') { avance((i + 1) / cibles.length); continue; }
        if (await aDuTexte(p)) dejaTexte++; else aTraiter.push(p);
        avance((i + 1) / cibles.length);
      }
    });
    if (!aTraiter.length) { note(`Rien à reconnaître : ${dejaTexte ? 'les pages contiennent déjà du texte.' : 'aucune page scannée ou photo.'}`); return; }
    return lancerOcr(aTraiter, dejaTexte);
  }
  async function lancerOcr(aTraiter, dejaTexte = 0) {
    const resultats = new Map();
    let nbMots = 0;
    try {
      await occupe(`Reconnaissance du texte (OCR) : ${aTraiter.length} page(s)…`, async avance => {
        for (let i = 0; i < aTraiter.length; i++) {
          const p = aTraiter[i];
          $('#occupe-texte').textContent = `Reconnaissance du texte : page ${i + 1} / ${aTraiter.length}…`;
          const d = dims(p);
          const dpr = window.devicePixelRatio || 1;
          // ≈ 300 ppp, 3500 pixels au plus
          const largeur = Math.min(3500, d.l * 300 / 72) / dpr;
          const c = document.createElement('canvas');
          await rendrePage(p, c, largeur);
          const mots = await OcrAtelier.lire(c, v => avance((i + v) / aTraiter.length));
          c.width = c.height = 0;
          resultats.set(p, mots);
          nbMots += mots.length;
          avance((i + 1) / aTraiter.length);
        }
      });
    } catch (e) {
      console.error(e);
      note(`Reconnaissance interrompue : ${e.message || e}`, 'erreur');
    }
    if (!resultats.size) return 0;
    memoriser();
    for (const [p, mots] of resultats) { p.ocr = mots; p.texteNatif = null; }
    rafraichir();
    note(`Texte reconnu sur ${resultats.size} page(s) (${nbMots} mots)${dejaTexte ? ` ; ${dejaTexte} page(s) avaient déjà du texte` : ''}. Le PDF enregistré sera interrogeable (Ctrl+F) et le texte sélectionnable.`, 'ok');
    return resultats.size;
  }

  // ---------- Imprimer (Ctrl+P) : le PDF compilé, dans la fenêtre d'impression de Windows ----------
  async function imprimer() {
    if (!etat.pages.length) return;
    if (!$('#editeur').hidden) validerEditeur();
    let octets;
    try { octets = await occupe('Préparation de l\'impression…', avance => produire(etat.pages, { ...options(), editable: false }, avance)); }
    catch (e) { note(`Impression impossible : ${e.message || e}`, 'erreur'); return; }
    const url = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }));
    document.querySelectorAll('iframe.impression').forEach(f => f.remove());
    const cadre = document.createElement('iframe');
    cadre.className = 'impression';
    cadre.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
    cadre.onload = () => {
      // Lecteur PDF du navigateur dans un cadre invisible : sa fenêtre d'impression s'ouvre directement
      setTimeout(() => {
        try { cadre.contentWindow.focus(); cadre.contentWindow.print(); }
        catch { window.open(url, '_blank'); note('Le PDF est ouvert dans une nouvelle fenêtre : imprimez-le avec Ctrl+P.'); }
      }, 300);
    };
    cadre.src = url;
    document.body.appendChild(cadre);
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60000);
  }
