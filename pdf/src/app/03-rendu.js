  // ---------- Géométrie d'affichage ----------
  const rotTotale = p => ((p.rotBase || 0) + (p.rot || 0)) % 360;
  const dims = p => MoteurPDF.tailleAffichee(p.boite, rotTotale(p)); // { l, h } en points

  // ---------- Rendu d'une page dans un canvas ----------
  async function chargerImage(url) {
    const im = new Image();
    im.src = url;
    await im.decode();
    return im;
  }
  async function imageDe(s) {
    if (!s.img) s.img = chargerImage(s.url);
    return s.img;
  }
  // Rendu sans les éléments ajoutés. largeurPx : largeur CSS voulue
  async function rendrePage(p, canvas, largeurPx, resolution = null) {
    const d = dims(p);
    const ech = largeurPx / d.l;
    const dpr = resolution || window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(d.l * ech * dpr));
    canvas.height = Math.max(1, Math.round(d.h * ech * dpr));
    canvas.style.width = `${Math.round(d.l * ech)}px`;
    canvas.style.height = `${Math.round(d.h * ech)}px`;
    const g = canvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    const s = etat.sources.get(p.source);
    if (p.type === 'pdf') {
      const doc = await s.doc;
      const page = await doc.getPage(p.index + 1);
      const vp = page.getViewport({ scale: ech * dpr, rotation: rotTotale(p) });
      await page.render({ canvasContext: g, viewport: vp, annotationMode: pdfjs.AnnotationMode.ENABLE }).promise;
      await dessinerChamps(p, canvas);
    } else {
      // Page dessinée non tournée, puis rotation
      const W = p.boite.width * ech * dpr, H = p.boite.height * ech * dpr;
      g.save();
      g.translate(canvas.width / 2, canvas.height / 2);
      g.rotate(rotTotale(p) * Math.PI / 180);
      g.translate(-W / 2, -H / 2);
      if (p.type === 'image') {
        const im = await imageDe(s);
        const marge = (10 * 72 / 25.4) * ech * dpr;
        const e = Math.min((W - 2 * marge) / im.naturalWidth, (H - 2 * marge) / im.naturalHeight);
        g.drawImage(im, (W - im.naturalWidth * e) / 2, (H - im.naturalHeight * e) / 2, im.naturalWidth * e, im.naturalHeight * e);
      }
      g.restore();
    }
    return { ech, dpr };
  }

  // Éléments ajoutés dessinés sur un canvas (vignettes)
  async function dessinerElements(p, canvas, ech, dpr, seulement = null) {
    if (!p.elements.length) return;
    const g = canvas.getContext('2d');
    const L = canvas.width, H = canvas.height;
    const k = ech * dpr;
    for (const e of p.elements) {
      if (seulement && e.type !== seulement) continue;
      const x = e.x * L, y = e.y * H, w = (e.w || 0) * L, h = (e.h || 0) * H;
      for (const f of MoteurPDF.formes(e, L, H, k)) {
        const chemin = new Path2D(MoteurPDF.chemin(f.cmds));
        if (f.fond) { g.globalAlpha = f.opaciteFond ?? 1; g.fillStyle = f.fond; g.fill(chemin); g.globalAlpha = 1; }
        if (f.trait) { g.strokeStyle = f.trait; g.lineWidth = f.epaisseur; g.lineCap = f.rond ? 'round' : 'butt'; g.lineJoin = 'round'; g.stroke(chemin); }
      }
      for (const et of MoteurPDF.etiquettes(e, L, H, k)) {
        g.font = `${et.taille}px Helvetica, Arial, sans-serif`;
        const lt = g.measureText(et.texte).width, bw = lt + et.taille * 0.8, bh = et.taille * 1.35;
        g.fillStyle = '#fff'; g.fillRect(et.cx - bw / 2, et.cy - bh / 2, bw, bh);
        g.strokeStyle = et.couleur; g.lineWidth = 0.6 * k; g.strokeRect(et.cx - bw / 2, et.cy - bh / 2, bw, bh);
        g.fillStyle = et.couleur; g.fillText(et.texte, et.cx - lt / 2, et.cy - et.taille * 0.58 + et.taille * 0.94);
      }
      if (e.type === 'tampon') {
        g.fillStyle = e.couleur || MoteurPDF.DEFAUTS.tampon;
        for (const lg of MoteurPDF.lignesTampon(e, L, H, k, mesureTexte)) {
          g.font = `${lg.gras ? 'bold ' : ''}${lg.taille}px Helvetica, Arial, sans-serif`;
          g.fillText(lg.texte, lg.x, lg.y + lg.taille * 0.94);
        }
      }
      if (e.type === 'caviarde') { g.fillStyle = '#000'; g.fillRect(x, y, w, h); }
      else if (e.type === 'texteModifie') {
        if (!e.applique) {
          g.fillStyle = e.fond || '#fff';
          if (e.coins) { g.beginPath(); e.coins.forEach(([u, v], i) => (i ? g.lineTo(u * L, v * H) : g.moveTo(u * L, v * H))); g.closePath(); g.fill(); }
          else g.fillRect(e.zone.x * L - k, e.zone.y * H - k, e.zone.w * L + 2 * k, e.zone.h * H + 2 * k);
        }
        const t = e.taille * k;
        g.fillStyle = e.couleur || '#000';
        g.font = `${e.italique ? 'italic ' : ''}${e.gras ? 'bold ' : ''}${t}px ${FAMILLES[e.police] || FAMILLES.helvetica}`;
        const lignes = e.paragraphe ? MoteurPDF.couperLignes(x => g.measureText(x).width, e.texte, e.paragraphe.largeur * L) : String(e.texte || '').split('\n');
        const il = e.paragraphe ? e.paragraphe.interligne * k : t * 1.2;
        // Texte en biais : tourné autour de son point de départ
        g.save();
        g.translate(e.x * L, e.base * H);
        if (e.angle) g.rotate(-e.angle * Math.PI / 180);
        lignes.forEach((l, i) => g.fillText(l, 0, i * il));
        g.restore();
      }
      else if (e.type === 'bulle' && e.texte) {
        const t = (e.taille || 11) * k, m = MoteurPDF.MARGE_BULLE * k;
        g.fillStyle = e.couleurTexte || '#000';
        g.font = `${e.gras ? 'bold ' : ''}${t}px Helvetica, Arial, sans-serif`;
        MoteurPDF.couperLignes(s => g.measureText(s).width, e.texte, w - 2 * m).forEach((l, i) => g.fillText(l, x + m, y + m + t * 0.94 + i * t * 1.2));
      }
      else if (e.type === 'masque') { g.fillStyle = e.couleur || '#fff'; g.fillRect(x, y, w, h); }
      else if (e.type === 'surligne') { g.globalAlpha = .35; g.fillStyle = e.couleur || '#ffeb3b'; g.fillRect(x, y, w, h); g.globalAlpha = 1; }
      else if (e.type === 'cadre') { g.strokeStyle = e.couleur || '#d32f2f'; g.lineWidth = (e.epaisseur || 2) * ech * dpr; g.strokeRect(x, y, w, h); }
      else if (e.type === 'image') { const i = etat.images.get(e.image); if (i) g.drawImage(await chargerImageCache(i), x, y, w, h); }
      else if (e.type === 'texte') {
        const t = (e.taille || 12) * ech * dpr;
        g.fillStyle = e.couleur || '#000';
        g.font = `${e.gras ? 'bold ' : ''}${t}px Helvetica, Arial, sans-serif`;
        g.textBaseline = 'alphabetic';
        String(e.texte || '').split('\n').forEach((l, i) => g.fillText(l, x, y + t * 0.94 + i * t * 1.2));
      }
    }
  }
  // Polices d'écran équivalentes aux polices standard du PDF
  const FAMILLES = { helvetica: 'Helvetica, Arial, "Liberation Sans", sans-serif', times: '"Times New Roman", Times, "Liberation Serif", serif', courier: '"Courier New", Courier, "Liberation Mono", monospace' };
  // Largeur d'un texte (police Helvetica/Arial) pour centrer les tampons comme dans le PDF
  const ctxMesure = document.createElement('canvas').getContext('2d');
  function mesureTexte(t, gras, taille) {
    ctxMesure.font = `${gras ? 'bold ' : ''}${taille}px Helvetica, Arial, sans-serif`;
    return ctxMesure.measureText(t).width;
  }
  function chargerImageCache(i) { if (!i.img) i.img = chargerImage(i.url); return i.img; }
