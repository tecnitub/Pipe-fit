// Atelier PDF : interface (vignettes, réorganisation, éditeur de page, enregistrement).
// Tout est traité dans le navigateur : pdf.js affiche les pages, pdf-lib (via MoteurPDF) produit le PDF final.
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const A4 = MoteurPDF.A4;
  const COULEURS = ['#2f80ed', '#eb5757', '#27ae60', '#f2994a', '#9b51e0', '#00a3a3', '#d4a017', '#e056a0'];

  // ---------- pdf.js ----------
  const pdfjs = window.pdfjsLib;
  (function configurerPdfjs() {
    if (window.PDFJS_WORKER_SRC) {
      // Version compilée (un seul fichier) : le module de lecture tourne dans un « worker » créé à partir du texte embarqué
      try {
        const url = URL.createObjectURL(new Blob([window.PDFJS_WORKER_SRC], { type: 'text/javascript' }));
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(url);
        return;
      } catch { /* worker interdit : lecture dans la page */ }
      // eslint-disable-next-line no-new-func
      (0, eval)(window.PDFJS_WORKER_SRC);
    }
    // Sinon, si pdf.worker.min.js est chargé dans la page, pdf.js l'utilise directement (globalThis.pdfjsWorker)
  })();

  // ---------- État ----------
  const etat = {
    sources: new Map(),   // id -> { id, nom, type: 'pdf'|'image', octets, mime, couleur, doc (promesse pdf.js), nbPages, rasteriser, alerte, img }
    pages: [],            // { id, type: 'pdf'|'image'|'blanche', source, index, rotBase, rot, boite: {x,y,width,height}, elements: [], titre }
    images: new Map(),    // id -> { octets, mime, url, l, h }
    selection: new Set(),
    ancre: null,
    historique: [],
    futur: [],
  };
  let compteur = 0;
  const nouvelId = p => `${p}${Date.now().toString(36)}${(compteur++).toString(36)}`;

  // ---------- Petites aides ----------
  function note(texte, type = '') {
    const n = document.createElement('div');
    n.className = `note ${type}`;
    n.textContent = texte;
    $('#notes').appendChild(n);
    setTimeout(() => n.remove(), type === 'erreur' ? 8000 : 4000);
  }
  async function occupe(texte, travail) {
    const fen = $('#occupe');
    $('#occupe-texte').textContent = texte;
    $('#occupe-barre').value = 0;
    fen.hidden = false;
    try { return await travail(v => { $('#occupe-barre').value = v; }); }
    finally { fen.hidden = true; }
  }
  const sansExtension = n => n.replace(/\.[^.]+$/, '');
  const nomFichier = n => (n || 'Document').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Document';
  const pause = ms => new Promise(r => setTimeout(r, ms));

  // ---------- Historique (annuler / rétablir) ----------
  const instantane = () => ({ pages: structuredClone(etat.pages), selection: [...etat.selection] });
  function memoriser() {
    etat.historique.push(instantane());
    if (etat.historique.length > 100) etat.historique.shift();
    etat.futur = [];
  }
  function restaurer(i) {
    etat.pages = i.pages;
    etat.selection = new Set(i.selection.filter(id => etat.pages.some(p => p.id === id)));
    rafraichir();
  }
  function annuler() { if (!etat.historique.length) return; etat.futur.push(instantane()); restaurer(etat.historique.pop()); }
  function retablir() { if (!etat.futur.length) return; etat.historique.push(instantane()); restaurer(etat.futur.pop()); }

  // ---------- Import des fichiers ----------
  async function importer(fichiers, position = null) {
    const liste = [...fichiers].filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) || /^image\//.test(f.type));
    const refuses = fichiers.length - liste.length;
    if (refuses) note(`${refuses} fichier(s) ignoré(s) : seuls les PDF et les images sont acceptés.`, 'erreur');
    if (!liste.length) return;
    memoriser();
    const nouvelles = [];
    await occupe('Ouverture des fichiers…', async avance => {
      for (let i = 0; i < liste.length; i++) {
        const f = liste[i];
        try {
          const pages = /^image\//.test(f.type) && !/\.pdf$/i.test(f.name) ? await importerImage(f) : await importerPdf(f);
          nouvelles.push(...pages);
        } catch (e) {
          console.error(e);
          note(`« ${f.name} » n'a pas pu être ouvert : ${e.message || e}`, 'erreur');
        }
        avance((i + 1) / liste.length);
      }
    });
    if (!nouvelles.length) { etat.historique.pop(); return; }
    const pos = position ?? positionInsertion();
    etat.pages.splice(pos, 0, ...nouvelles);
    rafraichir();
    note(`${nouvelles.length} page(s) ajoutée(s).`, 'ok');
  }

  function nouvelleSource(nom, type) {
    const id = nouvelId('s');
    const s = { id, nom: sansExtension(nom), type, couleur: COULEURS[etat.sources.size % COULEURS.length] };
    etat.sources.set(id, s);
    return s;
  }

  async function importerPdf(f) {
    const octets = new Uint8Array(await f.arrayBuffer());
    const s = nouvelleSource(f.name, 'pdf');
    s.octets = octets;
    // pdf-lib doit pouvoir relire le fichier pour en copier les pages sans perte ; sinon les pages seront converties en images
    try {
      await PDFLib.PDFDocument.load(octets, { updateMetadata: false });
    } catch (e) {
      s.rasteriser = true;
      s.alerte = /encrypt/i.test(e.message) ? 'PDF protégé : pages copiées en images' : 'PDF abîmé : pages copiées en images';
    }
    // pdf.js modifie le tableau qu'on lui donne : copie
    const tache = pdfjs.getDocument({ data: octets.slice(), isEvalSupported: false });
    tache.onPassword = (rappel, raison) => {
      const mdp = prompt(`${raison === 2 ? 'Mot de passe incorrect. ' : ''}« ${f.name} » est protégé par un mot de passe :`);
      if (mdp === null) tache.destroy(); else rappel(mdp);
    };
    s.doc = tache.promise;
    let doc;
    try { doc = await s.doc; } catch (e) {
      etat.sources.delete(s.id);
      throw new Error(e && e.name === 'PasswordException' ? 'mot de passe requis' : 'fichier PDF illisible');
    }
    s.nbPages = doc.numPages;
    const pages = [];
    for (let i = 0; i < doc.numPages; i++) {
      const p = await doc.getPage(i + 1);
      const [x1, y1, x2, y2] = p.view;
      pages.push({ id: nouvelId('p'), type: 'pdf', source: s.id, index: i, rotBase: p.rotate || 0, rot: 0, boite: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }, elements: [] });
    }
    return pages;
  }

  // Image -> JPEG ou PNG redressé (orientation de l'appareil photo appliquée), 3000 px maximum
  async function normaliserImage(blob) {
    const bmp = await createImageBitmap(blob);
    const max = 3000;
    const e = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * e); c.height = Math.round(bmp.height * e);
    const g = c.getContext('2d');
    const png = /png|gif|webp|svg/i.test(blob.type);
    if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    const mime = png ? 'image/png' : 'image/jpeg';
    const sortie = await new Promise(r => c.toBlob(r, mime, 0.9));
    return { octets: new Uint8Array(await sortie.arrayBuffer()), mime, l: c.width, h: c.height, url: URL.createObjectURL(sortie) };
  }

  async function importerImage(f) {
    const img = await normaliserImage(f);
    const s = nouvelleSource(f.name, 'image');
    Object.assign(s, img, { nbPages: 1 });
    const paysage = img.l > img.h;
    const boite = { x: 0, y: 0, width: paysage ? A4[1] : A4[0], height: paysage ? A4[0] : A4[1] };
    return [{ id: nouvelId('p'), type: 'image', source: s.id, index: 0, rotBase: 0, rot: 0, boite, elements: [] }];
  }

  function positionInsertion() {
    if (!etat.selection.size) return etat.pages.length;
    let max = -1;
    etat.pages.forEach((p, i) => { if (etat.selection.has(p.id)) max = i; });
    return max + 1;
  }

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
  async function rendrePage(p, canvas, largeurPx) {
    const d = dims(p);
    const ech = largeurPx / d.l;
    const dpr = window.devicePixelRatio || 1;
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
      await page.render({ canvasContext: g, viewport: vp }).promise;
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
  async function dessinerElements(p, canvas, ech, dpr) {
    if (!p.elements.length) return;
    const g = canvas.getContext('2d');
    const L = canvas.width, H = canvas.height;
    for (const e of p.elements) {
      const x = e.x * L, y = e.y * H, w = (e.w || 0) * L, h = (e.h || 0) * H;
      if (e.type === 'masque') { g.fillStyle = e.couleur || '#fff'; g.fillRect(x, y, w, h); }
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
  function chargerImageCache(i) { if (!i.img) i.img = chargerImage(i.url); return i.img; }

  // ---------- Grille des vignettes ----------
  const grille = $('#grille');
  const cartes = new Map(); // id page -> élément
  let largeurVignette = 170;
  try { largeurVignette = Number(localStorage.getItem('atelierpdf.zoom')) || 170; } catch { /* stockage indisponible */ }
  $('#zoom').value = largeurVignette;

  const cle = p => `${largeurVignette}|${p.type}|${p.source}|${p.index}|${rotTotale(p)}|${JSON.stringify(p.elements)}`;

  const observateur = new IntersectionObserver(entrees => {
    entrees.forEach(en => { if (en.isIntersecting) en.target.visible = true; else en.target.visible = false; });
    entrees.forEach(en => { if (en.isIntersecting && en.target.sale) demanderRendu(en.target); });
  }, { root: $('#zone'), rootMargin: '400px' });

  const fileRendu = new Set();
  let rendusActifs = 0;
  function demanderRendu(carte) { fileRendu.add(carte); pomper(); }
  function pomper() {
    while (rendusActifs < 2 && fileRendu.size) {
      const c = fileRendu.values().next().value;
      fileRendu.delete(c);
      if (!c.isConnected || !c.sale) continue;
      rendusActifs++;
      rendreCarte(c).catch(e => console.error(e)).finally(() => { rendusActifs--; pomper(); });
    }
  }
  async function rendreCarte(carte) {
    const p = etat.pages.find(x => x.id === carte.dataset.id);
    if (!p) return;
    const k = cle(p);
    carte.sale = false;
    const canvas = document.createElement('canvas');
    const d = dims(p);
    // Vignette inscrite dans un carré : largeur adaptée pour les pages en hauteur
    const largeur = d.h > d.l ? largeurVignette * d.l / d.h : largeurVignette;
    const { ech, dpr } = await rendrePage(p, canvas, largeur);
    await dessinerElements(p, canvas, ech, dpr);
    if (cle(p) !== k) { carte.sale = true; demanderRendu(carte); return; }
    const v = carte.querySelector('.vignette');
    v.replaceChildren(canvas);
  }

  function creerCarte(p) {
    const c = document.createElement('div');
    c.className = 'carte';
    c.dataset.id = p.id;
    c.draggable = true;
    c.innerHTML = `<div class="vignette"></div>
      <div class="pied"><span class="marqueur"></span><span class="num"></span><span class="nom"></span></div>
      <div class="actions-carte">
        <button data-a="gauche" title="Pivoter à gauche">⟲</button><button data-a="droite" title="Pivoter à droite">⟳</button>
        <button data-a="modifier" title="Modifier la page">✎</button><button data-a="supprimer" title="Supprimer">✕</button>
      </div>`;
    observateur.observe(c);
    return c;
  }

  function rafraichir() {
    const vide = !etat.pages.length;
    $('#vide').hidden = !vide;
    const presents = new Set(etat.pages.map(p => p.id));
    for (const [id, c] of cartes) if (!presents.has(id)) { observateur.unobserve(c); c.remove(); cartes.delete(id); }
    etat.pages.forEach((p, i) => {
      let c = cartes.get(p.id);
      if (!c) { c = creerCarte(p); cartes.set(p.id, c); }
      const s = etat.sources.get(p.source);
      c.querySelector('.num').textContent = i + 1;
      c.querySelector('.nom').textContent = p.type === 'blanche' ? (p.titre ? `Intercalaire « ${p.titre} »` : 'Page blanche') : `${s.nom}${s.nbPages > 1 ? ` · p. ${p.index + 1}` : ''}`;
      c.querySelector('.nom').title = c.querySelector('.nom').textContent;
      c.querySelector('.marqueur').style.background = s ? s.couleur : '#c5ced8';
      c.classList.toggle('choisie', etat.selection.has(p.id));
      let badge = c.querySelector('.badge-modif');
      if (p.elements.length && !badge) { badge = document.createElement('span'); badge.className = 'badge-modif'; badge.textContent = 'modifiée'; c.appendChild(badge); }
      else if (!p.elements.length && badge) badge.remove();
      const k = cle(p);
      if (c.dataset.cle !== k) {
        c.dataset.cle = k;
        c.sale = true;
        // Place réservée à la bonne taille avant le rendu
        const v = c.querySelector('.vignette');
        const d = dims(p);
        const l = d.h > d.l ? largeurVignette * d.l / d.h : largeurVignette;
        v.style.width = `${largeurVignette}px`;
        v.style.height = `${largeurVignette}px`;
        if (!v.firstChild) { const ph = document.createElement('div'); ph.style.cssText = `width:${l}px;height:${l * d.h / d.l}px;background:#f4f6f9;box-shadow:0 0 0 1px #dfe4ea`; v.appendChild(ph); }
        if (c.visible) demanderRendu(c);
      }
      if (grille.children[i] !== c) grille.insertBefore(c, grille.children[i] || null);
    });
    majSources();
    majBoutons();
  }

  function majBoutons() {
    const n = etat.selection.size;
    document.querySelectorAll('.barre button.sel').forEach(b => { b.disabled = !n; });
    $('#b-modifier').disabled = n !== 1 && !(n === 0 && etat.pages.length === 1);
    $('#b-enregistrer').disabled = $('#b-diviser').disabled = !etat.pages.length;
    $('#b-annuler').disabled = !etat.historique.length;
    $('#b-retablir').disabled = !etat.futur.length;
    const total = etat.pages.length;
    $('#etat-texte').textContent = total ? `${total} page${total > 1 ? 's' : ''}${n ? ` · ${n} sélectionnée${n > 1 ? 's' : ''}` : ''} — clic : sélectionner · Ctrl/Maj+clic : plusieurs · glisser : déplacer · double-clic : modifier` : 'Aucune page';
  }

  function majSources() {
    const ul = $('#sources');
    const utilisees = new Map();
    etat.pages.forEach(p => { if (p.source) utilisees.set(p.source, (utilisees.get(p.source) || 0) + 1); });
    const liste = [...etat.sources.values()].filter(s => utilisees.has(s.id));
    $('#aide-docs').hidden = liste.length > 0;
    // Ne pas reconstruire pendant la saisie d'un nom
    if (ul.contains(document.activeElement)) return;
    ul.replaceChildren(...liste.map(s => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="pastille"></span><div class="nomzone"><input title="Titre dans le sommaire et les signets"><span class="infos"></span><span class="alerte"></span></div>
        <button data-a="choisir" title="Sélectionner ses pages">☐</button><button data-a="retirer" title="Retirer ce document">✕</button>`;
      li.querySelector('.pastille').style.background = s.couleur;
      const inp = li.querySelector('input');
      inp.value = s.nom;
      inp.addEventListener('change', () => { s.nom = inp.value.trim() || s.nom; rafraichir(); });
      li.querySelector('.infos').textContent = `${utilisees.get(s.id)} page${utilisees.get(s.id) > 1 ? 's' : ''}${s.type === 'image' ? ' · image' : ''}`;
      li.querySelector('.alerte').textContent = s.alerte || '';
      li.querySelector('[data-a=choisir]').onclick = () => { etat.selection = new Set(etat.pages.filter(p => p.source === s.id).map(p => p.id)); rafraichir(); };
      li.querySelector('[data-a=retirer]').onclick = () => { memoriser(); etat.pages = etat.pages.filter(p => p.source !== s.id); rafraichir(); };
      return li;
    }));
  }

  // ---------- Sélection et actions sur les pages ----------
  function cliquerCarte(id, ev) {
    const idx = etat.pages.findIndex(p => p.id === id);
    if (ev.shiftKey && etat.ancre) {
      const a = etat.pages.findIndex(p => p.id === etat.ancre);
      const [d, f] = a < idx ? [a, idx] : [idx, a];
      if (!ev.ctrlKey) etat.selection.clear();
      for (let i = d; i <= f; i++) etat.selection.add(etat.pages[i].id);
    } else if (ev.ctrlKey || ev.metaKey) {
      if (etat.selection.has(id)) etat.selection.delete(id); else etat.selection.add(id);
      etat.ancre = id;
    } else {
      etat.selection = new Set([id]);
      etat.ancre = id;
    }
    rafraichir();
  }
  const pagesChoisies = () => etat.pages.filter(p => etat.selection.has(p.id));

  function pivoter(sens, ids = etat.selection) {
    if (!ids.size) return;
    memoriser();
    etat.pages.forEach(p => { if (ids.has(p.id)) p.rot = ((p.rot + sens) % 360 + 360) % 360; });
    rafraichir();
  }
  function supprimer(ids = etat.selection) {
    if (!ids.size) return;
    memoriser();
    etat.pages = etat.pages.filter(p => !ids.has(p.id));
    etat.selection = new Set([...etat.selection].filter(id => !ids.has(id)));
    rafraichir();
  }
  function dupliquer() {
    if (!etat.selection.size) return;
    memoriser();
    const pos = positionInsertion();
    const copies = pagesChoisies().map(p => ({ ...structuredClone(p), id: nouvelId('p') }));
    etat.pages.splice(pos, 0, ...copies);
    etat.selection = new Set(copies.map(p => p.id));
    rafraichir();
  }
  function insererBlanche(titre = null) {
    memoriser();
    const pos = positionInsertion();
    // Même format que la page qui précède, A4 sinon
    const avant = etat.pages[pos - 1];
    const boite = avant ? { x: 0, y: 0, width: avant.boite.width, height: avant.boite.height } : { x: 0, y: 0, width: A4[0], height: A4[1] };
    const rot = avant ? rotTotale(avant) : 0;
    const p = { id: nouvelId('p'), type: 'blanche', source: null, index: 0, rotBase: 0, rot, boite, elements: [] };
    if (titre) {
      p.titre = titre;
      const d = dims(p);
      const taille = 28;
      const largeurTexte = titre.length * taille * 0.55 / d.l;
      p.elements.push({ type: 'texte', x: Math.max(0.05, 0.5 - largeurTexte / 2), y: 0.42, texte: titre, taille, gras: true, couleur: '#17324f' });
    }
    etat.pages.splice(pos, 0, p);
    etat.selection = new Set([p.id]);
    rafraichir();
  }
  function deplacer(ids, versIndex) {
    const bloc = etat.pages.filter(p => ids.has(p.id));
    if (!bloc.length) return;
    memoriser();
    const avant = etat.pages.slice(0, versIndex).filter(p => !ids.has(p.id)).length;
    const reste = etat.pages.filter(p => !ids.has(p.id));
    reste.splice(avant, 0, ...bloc);
    etat.pages = reste;
    rafraichir();
  }

  // ---------- Glisser-déposer ----------
  let glisse = null;   // ids des pages déplacées
  let marque = null;   // { carte, apres }
  function effacerMarque() { if (marque) marque.carte.classList.remove('avant', 'apres'); marque = null; }
  function indexDepot(ev) {
    const cs = [...grille.children];
    if (!cs.length) return { index: 0 };
    let meilleure = null, dist = Infinity;
    for (const c of cs) {
      const r = c.getBoundingClientRect();
      const dx = ev.clientX < r.left ? r.left - ev.clientX : ev.clientX > r.right ? ev.clientX - r.right : 0;
      const dy = ev.clientY < r.top ? r.top - ev.clientY : ev.clientY > r.bottom ? ev.clientY - r.bottom : 0;
      const d = dy * 3 + dx;
      if (d < dist) { dist = d; meilleure = c; }
    }
    const r = meilleure.getBoundingClientRect();
    const apres = ev.clientX > r.left + r.width / 2;
    const i = cs.indexOf(meilleure);
    return { index: i + (apres ? 1 : 0), carte: meilleure, apres };
  }
  grille.addEventListener('dragstart', ev => {
    const c = ev.target.closest('.carte');
    if (!c) return;
    if (!etat.selection.has(c.dataset.id)) { etat.selection = new Set([c.dataset.id]); etat.ancre = c.dataset.id; rafraichir(); }
    glisse = new Set(etat.selection);
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', 'pages');
    requestAnimationFrame(() => glisse && glisse.forEach(id => cartes.get(id)?.classList.add('glisse')));
  });
  grille.addEventListener('dragend', () => {
    document.querySelectorAll('.carte.glisse').forEach(c => c.classList.remove('glisse'));
    glisse = null; effacerMarque();
  });
  const zone = $('#zone');
  zone.addEventListener('dragover', ev => {
    const fichiers = ev.dataTransfer.types.includes('Files');
    if (!glisse && !fichiers) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = fichiers ? 'copy' : 'move';
    if (fichiers && !etat.pages.length) { zone.classList.add('survol'); return; }
    const d = indexDepot(ev);
    if (!d.carte) return;
    if (!marque || marque.carte !== d.carte || marque.apres !== d.apres) {
      effacerMarque();
      marque = { carte: d.carte, apres: d.apres };
      d.carte.classList.add(d.apres ? 'apres' : 'avant');
    }
  });
  zone.addEventListener('dragleave', ev => { if (!zone.contains(ev.relatedTarget)) { zone.classList.remove('survol'); effacerMarque(); } });
  zone.addEventListener('drop', ev => {
    ev.preventDefault();
    zone.classList.remove('survol');
    const d = etat.pages.length ? indexDepot(ev) : { index: 0 };
    effacerMarque();
    if (ev.dataTransfer.files && ev.dataTransfer.files.length) importer(ev.dataTransfer.files, d.index);
    else if (glisse) deplacer(glisse, d.index);
  });
  // Fichiers lâchés ailleurs dans la fenêtre : ajoutés à la fin (et le navigateur ne les ouvre pas)
  window.addEventListener('dragover', ev => { if (ev.dataTransfer.types.includes('Files')) ev.preventDefault(); });
  window.addEventListener('drop', ev => {
    if (zone.contains(ev.target)) return;
    ev.preventDefault();
    if (ev.dataTransfer.files.length && $('#editeur').hidden) importer(ev.dataTransfer.files);
  });

  grille.addEventListener('click', ev => {
    const c = ev.target.closest('.carte');
    if (!c) return;
    const b = ev.target.closest('button[data-a]');
    const id = c.dataset.id;
    if (b) {
      const ids = new Set([id]);
      if (b.dataset.a === 'gauche') pivoter(-90, ids);
      else if (b.dataset.a === 'droite') pivoter(90, ids);
      else if (b.dataset.a === 'supprimer') supprimer(ids);
      else if (b.dataset.a === 'modifier') ouvrirEditeur(id);
      return;
    }
    cliquerCarte(id, ev);
  });
  grille.addEventListener('dblclick', ev => { const c = ev.target.closest('.carte'); if (c && !ev.target.closest('button')) ouvrirEditeur(c.dataset.id); });
  zone.addEventListener('click', ev => { if (ev.target === zone || ev.target === grille) { etat.selection.clear(); rafraichir(); } });

  // ---------- Options ----------
  const champsOptions = ['o-titre', 'o-auteur', 'o-sommaire', 'o-signets', 'o-aplatir', 'o-num', 'o-num-format', 'o-num-position', 'o-num-taille', 'o-num-debut', 'o-num-ignorer',
    'o-fil', 'o-fil-texte', 'o-fil-opacite', 'o-fil-couleur', 'o-compresser', 'o-dpi'];
  function chargerOptions() {
    let o = {};
    try { o = JSON.parse(localStorage.getItem('atelierpdf.options') || '{}'); } catch { /* rien */ }
    champsOptions.forEach(id => {
      const el = document.getElementById(id);
      if (!(id in o)) return;
      if (el.type === 'checkbox') el.checked = !!o[id]; else el.value = o[id];
    });
    // Le titre et l'auteur ne sont pas repris d'une fois sur l'autre pour le titre (propre à chaque dossier)
    $('#o-titre').value = '';
  }
  function sauverOptions() {
    const o = {};
    champsOptions.forEach(id => { const el = document.getElementById(id); o[id] = el.type === 'checkbox' ? el.checked : el.value; });
    try { localStorage.setItem('atelierpdf.options', JSON.stringify(o)); } catch { /* rien */ }
    $('#sous-num').classList.toggle('ouvert', $('#o-num').checked);
    $('#sous-fil').classList.toggle('ouvert', $('#o-fil').checked);
    $('#sous-compresser').classList.toggle('ouvert', $('#o-compresser').checked);
  }
  function options() {
    return {
      titre: $('#o-titre').value.trim(),
      auteur: $('#o-auteur').value.trim(),
      sommaire: $('#o-sommaire').checked,
      signets: $('#o-signets').checked,
      aplatir: $('#o-aplatir').checked,
      numerotation: { actif: $('#o-num').checked, format: $('#o-num-format').value, position: $('#o-num-position').value, taille: Number($('#o-num-taille').value), debut: Number($('#o-num-debut').value), ignorer: Number($('#o-num-ignorer').value) },
      filigrane: { actif: $('#o-fil').checked, texte: $('#o-fil-texte').value, opacite: Number($('#o-fil-opacite').value), couleur: $('#o-fil-couleur').value },
      compresser: $('#o-compresser').checked,
      dpi: Number($('#o-dpi').value) || 150,
    };
  }
  document.querySelector('.cote').addEventListener('input', ev => { if (ev.target.id && ev.target.id.startsWith('o-')) sauverOptions(); });
  document.querySelector('.cote').addEventListener('change', ev => { if (ev.target.id && ev.target.id.startsWith('o-')) sauverOptions(); });

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
    await page.render({ canvasContext: g, viewport: vp, intent: 'print' }).promise;
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
    const d = MoteurPDF.tailleAffichee(p.boite, p.rotBase || 0);
    c.width = c.height = 0;
    return { type: 'image', plein: true, octets: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg', largeur: d.l, hauteur: d.h };
  }

  async function produire(pages, opts, avance = () => {}) {
    const sources = {};
    const liste = [];
    const images = {};
    for (const p of pages) for (const e of p.elements) if (e.type === 'image' && etat.images.has(e.image)) images[e.image] = etat.images.get(e.image);
    let k = 0;
    for (const p of pages) {
      const s = etat.sources.get(p.source);
      const commun = { elements: p.elements, groupe: s ? s.nom : p.titre, source: s ? s.id : (p.titre ? p.id : null) };
      if (p.type === 'pdf') {
        if (s.rasteriser || opts.compresser) {
          liste.push({ ...await pageEnImage(p, s.rasteriser && !opts.compresser ? 200 : opts.dpi), ...commun, rotation: p.rot });
        } else {
          sources[s.id] = sources[s.id] || { octets: s.octets };
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

  // ---------- Diviser ----------
  function ouvrirDiviser() {
    const premier = etat.sources.get(etat.pages[0]?.source);
    $('#div-nom').value = $('#o-titre').value.trim() || (premier ? premier.nom : 'Document');
    $('#dlg-diviser').hidden = false;
  }
  async function diviser() {
    const mode = document.querySelector('input[name=mode]:checked').value;
    const base = nomFichier($('#div-nom').value);
    let lots = [];
    try {
      if (mode === 'page') lots = etat.pages.map(p => [p]);
      else if (mode === 'n') {
        const n = Math.max(1, Number($('#div-n').value) || 1);
        for (let i = 0; i < etat.pages.length; i += n) lots.push(etat.pages.slice(i, i + n));
      } else if (mode === 'plages') {
        lots = MoteurPDF.lirePlages($('#div-plages').value, etat.pages.length).map(g => g.map(i => etat.pages[i]));
      } else {
        etat.pages.forEach((p, i) => {
          const prec = etat.pages[i - 1];
          if (prec && prec.source && prec.source === p.source) lots[lots.length - 1].push(p); else lots.push([p]);
        });
      }
    } catch (e) { note(e.message, 'erreur'); return; }
    $('#dlg-diviser').hidden = true;
    const largeurNum = String(lots.length).length;
    const noms = lots.map((lot, i) => {
      if (mode === 'document') {
        const s = etat.sources.get(lot[0].source);
        return `${String(i + 1).padStart(largeurNum, '0')} - ${nomFichier(s ? s.nom : (lot[0].titre || 'Page blanche'))}.pdf`;
      }
      return `${base}-${String(i + 1).padStart(largeurNum, '0')}.pdf`;
    });
    // Dossier de destination si le navigateur le permet (Edge, Chrome), sinon téléchargements successifs
    let dossier = null;
    if (window.showDirectoryPicker) {
      try { dossier = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e) { if (e.name === 'AbortError') return; }
    }
    const opts = { ...options(), titre: '' };
    try {
      await occupe(`Création de ${lots.length} fichiers…`, async avance => {
        for (let i = 0; i < lots.length; i++) {
          const octets = await produire(lots[i], { ...opts, sommaire: false });
          const blob = new Blob([octets], { type: 'application/pdf' });
          if (dossier) {
            const h = await dossier.getFileHandle(noms[i], { create: true });
            const w = await h.createWritable(); await w.write(blob); await w.close();
          } else { telecharger(blob, noms[i]); await pause(350); }
          avance((i + 1) / lots.length);
        }
      });
      note(`${lots.length} fichier(s) PDF créé(s)${dossier ? ` dans « ${dossier.name} »` : ' (dossier Téléchargements)'}.`, 'ok');
    } catch (e) {
      console.error(e);
      note(`Division interrompue : ${e.message || e}`, 'erreur');
    }
  }

  // ---------- Éditeur de page ----------
  const ed = { page: null, elements: [], outil: 'selection', choisi: null, ech: 1, L: 0, H: 0 };
  const calque = $('#ed-calque');

  function ouvrirEditeur(id) {
    if (!id && etat.selection.size === 1) id = [...etat.selection][0];
    if (!id && etat.pages.length === 1) id = etat.pages[0].id;
    const p = etat.pages.find(x => x.id === id);
    if (!p) return;
    $('#editeur').hidden = false;
    chargerDansEditeur(p);
  }
  async function chargerDansEditeur(p) {
    ed.page = p;
    ed.elements = structuredClone(p.elements);
    ed.choisi = null;
    const i = etat.pages.indexOf(p);
    $('#ed-num').textContent = `Page ${i + 1} / ${etat.pages.length}`;
    $('#ed-prec').disabled = i <= 0;
    $('#ed-suiv').disabled = i >= etat.pages.length - 1;
    const scene = $('#ed-scene');
    const d = dims(p);
    const largeur = Math.min(scene.clientWidth - 40, (scene.clientHeight - 40) * d.l / d.h, 1400);
    const canvas = $('#ed-canvas');
    const r = await rendrePage(p, canvas, Math.max(200, largeur));
    ed.ech = r.ech; // pixels CSS par point
    ed.L = parseFloat(canvas.style.width); ed.H = parseFloat(canvas.style.height);
    $('#ed-page').style.width = `${ed.L}px`;
    $('#ed-page').style.height = `${ed.H}px`;
    dessinerCalque();
  }
  function validerEditeur() {
    if (!ed.page) return;
    finirSaisie();
    if (JSON.stringify(ed.page.elements) !== JSON.stringify(ed.elements)) {
      memoriser();
      ed.page.elements = structuredClone(ed.elements);
      rafraichir();
    }
  }
  function fermerEditeur() { validerEditeur(); $('#editeur').hidden = true; ed.page = null; }
  function changerPage(sens) {
    validerEditeur();
    const i = etat.pages.indexOf(ed.page) + sens;
    if (etat.pages[i]) { etat.selection = new Set([etat.pages[i].id]); rafraichir(); chargerDansEditeur(etat.pages[i]); }
  }

  function choisirOutil(o) {
    ed.outil = o;
    document.querySelectorAll('#ed-outils button').forEach(b => b.classList.toggle('actif', b.dataset.outil === o));
    calque.classList.toggle('trace', ['masque', 'surligne', 'cadre'].includes(o));
    calque.classList.toggle('ecrit', o === 'texte');
    if (o === 'image') $('#fichier-image').click();
  }

  function dessinerCalque() {
    calque.replaceChildren(...ed.elements.map((e, i) => {
      const d = document.createElement('div');
      d.className = `el el-${e.type}${ed.choisi === i ? ' choisi' : ''}`;
      d.dataset.i = i;
      d.style.left = `${e.x * ed.L}px`;
      d.style.top = `${e.y * ed.H}px`;
      if (e.type === 'texte') {
        d.textContent = e.texte;
        d.style.fontSize = `${(e.taille || 12) * ed.ech}px`;
        d.style.color = e.couleur || '#000';
        d.style.fontWeight = e.gras ? 'bold' : 'normal';
      } else {
        d.style.width = `${e.w * ed.L}px`;
        d.style.height = `${e.h * ed.H}px`;
        if (e.type === 'masque') d.style.background = e.couleur || '#fff';
        if (e.type === 'surligne') d.style.background = e.couleur || '#ffeb3b';
        if (e.type === 'cadre') { d.style.borderColor = e.couleur || '#d32f2f'; d.style.borderWidth = `${(e.epaisseur || 2) * ed.ech}px`; }
        if (e.type === 'image') { const im = document.createElement('img'); im.src = etat.images.get(e.image)?.url || ''; d.appendChild(im); }
        const poignee = document.createElement('div');
        poignee.className = 'poignee';
        d.appendChild(poignee);
      }
      return d;
    }));
    majProprietes();
  }
  function majProprietes() {
    const e = ed.elements[ed.choisi];
    $('#ed-suppr').disabled = !e;
    if (!e) return;
    // La couleur blanche d'un masque ou jaune d'un surlignage ne devient pas celle du prochain texte
    if (e.couleur && (e.type === 'texte' || e.type === 'cadre')) $('#ed-couleur').value = e.couleur;
    if (e.type === 'texte') { $('#ed-taille').value = e.taille || 12; $('#ed-gras').checked = !!e.gras; }
  }
  function choisirElement(i) {
    ed.choisi = i;
    calque.querySelectorAll('.el').forEach(el => el.classList.toggle('choisi', Number(el.dataset.i) === i));
    majProprietes();
  }

  // Saisie d'un texte directement sur la page
  function editerTexte(i) {
    const el = calque.querySelector(`.el[data-i="${i}"]`);
    if (!el) return;
    choisirElement(i);
    el.contentEditable = 'true';
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    el.addEventListener('input', () => { ed.elements[i].texte = el.innerText.replace(/\n$/, ''); });
    el.addEventListener('blur', () => finirSaisie(), { once: true });
  }
  function finirSaisie() {
    const el = calque.querySelector('.el[contenteditable=true]');
    if (!el) return;
    const i = Number(el.dataset.i);
    el.contentEditable = 'false';
    const e = ed.elements[i];
    if (e) e.texte = el.innerText.replace(/\n$/, '');
    if (e && !e.texte.trim()) { ed.elements.splice(i, 1); ed.choisi = null; dessinerCalque(); }
  }

  const posFraction = ev => {
    const r = calque.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) };
  };

  calque.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    const elDom = ev.target.closest('.el');
    if (elDom && elDom.isContentEditable) return;
    finirSaisie();
    const depart = posFraction(ev);
    // Avec l'outil Texte, un clic sur un texte existant le modifie
    if (elDom && ed.outil === 'texte' && elDom.classList.contains('el-texte')) { ev.preventDefault(); choisirOutil('selection'); editerTexte(Number(elDom.dataset.i)); return; }
    if (elDom && ed.outil === 'selection') {
      // Déplacer ou redimensionner
      const i = Number(elDom.dataset.i);
      choisirElement(i);
      const e = ed.elements[i];
      const origine = { ...e };
      const redim = ev.target.classList.contains('poignee');
      calque.setPointerCapture(ev.pointerId);
      const bouger = m => {
        const p = posFraction(m);
        const dx = p.x - depart.x, dy = p.y - depart.y;
        if (redim) {
          if (e.type === 'image' && !m.shiftKey) {
            // Proportions conservées (Maj pour les libérer)
            const w = Math.max(0.01, origine.w + dx);
            e.w = w; e.h = w * (origine.h / origine.w);
          } else { e.w = Math.max(0.005, origine.w + dx); e.h = Math.max(0.005, origine.h + dy); }
          elDom.style.width = `${e.w * ed.L}px`; elDom.style.height = `${e.h * ed.H}px`;
        } else {
          e.x = origine.x + dx; e.y = origine.y + dy;
          elDom.style.left = `${e.x * ed.L}px`; elDom.style.top = `${e.y * ed.H}px`;
        }
      };
      const fin = () => { calque.removeEventListener('pointermove', bouger); calque.removeEventListener('pointerup', fin); };
      calque.addEventListener('pointermove', bouger);
      calque.addEventListener('pointerup', fin);
      return;
    }
    if (ed.outil === 'texte') {
      ev.preventDefault();
      const taillePt = Number($('#ed-taille').value) || 12;
      ed.elements.push({ type: 'texte', x: depart.x, y: Math.max(0, depart.y - (taillePt * 0.6 * ed.ech) / ed.H), texte: 'Texte', taille: taillePt, couleur: $('#ed-couleur').value, gras: $('#ed-gras').checked });
      const i = ed.elements.length - 1;
      dessinerCalque();
      choisirOutil('selection');
      editerTexte(i);
      return;
    }
    if (['masque', 'surligne', 'cadre'].includes(ed.outil)) {
      const coul = ed.outil === 'masque' ? '#ffffff' : ed.outil === 'surligne' ? '#ffeb3b' : ($('#ed-couleur').value === '#000000' ? '#d32f2f' : $('#ed-couleur').value);
      const e = { type: ed.outil, x: depart.x, y: depart.y, w: 0, h: 0, couleur: coul };
      ed.elements.push(e);
      const i = ed.elements.length - 1;
      dessinerCalque();
      choisirElement(i);
      const elDom2 = calque.querySelector(`.el[data-i="${i}"]`);
      calque.setPointerCapture(ev.pointerId);
      const bouger = m => {
        const p = posFraction(m);
        e.x = Math.min(depart.x, p.x); e.y = Math.min(depart.y, p.y);
        e.w = Math.abs(p.x - depart.x); e.h = Math.abs(p.y - depart.y);
        Object.assign(elDom2.style, { left: `${e.x * ed.L}px`, top: `${e.y * ed.H}px`, width: `${e.w * ed.L}px`, height: `${e.h * ed.H}px` });
      };
      const fin = () => {
        calque.removeEventListener('pointermove', bouger); calque.removeEventListener('pointerup', fin);
        if (e.w * ed.L < 4 || e.h * ed.H < 4) { ed.elements.splice(i, 1); ed.choisi = null; dessinerCalque(); }
      };
      calque.addEventListener('pointermove', bouger);
      calque.addEventListener('pointerup', fin);
      return;
    }
    choisirElement(null);
  });
  calque.addEventListener('dblclick', ev => {
    const elDom = ev.target.closest('.el-texte');
    if (elDom) editerTexte(Number(elDom.dataset.i));
  });

  $('#fichier-image').addEventListener('change', async ev => {
    const f = ev.target.files[0];
    ev.target.value = '';
    choisirOutil('selection');
    if (!f || !ed.page) return;
    try {
      const img = await normaliserImage(f);
      const id = nouvelId('i');
      etat.images.set(id, img);
      const w = 0.3, h = w * (img.h / img.l) * (ed.L / ed.H);
      ed.elements.push({ type: 'image', image: id, x: 0.35, y: Math.max(0, 0.5 - h / 2), w, h });
      ed.choisi = ed.elements.length - 1;
      dessinerCalque();
      note('Image ajoutée : déplacez-la, et tirez le coin bleu pour la redimensionner. Astuce : une signature en PNG sur fond transparent rend mieux.');
    } catch (e) { note(`Image illisible : ${e.message || e}`, 'erreur'); }
  });

  function supprimerElement() {
    if (ed.choisi == null) return;
    ed.elements.splice(ed.choisi, 1);
    ed.choisi = null;
    dessinerCalque();
  }
  $('#ed-outils').addEventListener('click', ev => { const b = ev.target.closest('button[data-outil]'); if (b) choisirOutil(b.dataset.outil); });
  $('#ed-couleur').addEventListener('input', () => { const e = ed.elements[ed.choisi]; if (e && e.type !== 'image') { e.couleur = $('#ed-couleur').value; dessinerCalque(); } });
  $('#ed-taille').addEventListener('input', () => { const e = ed.elements[ed.choisi]; if (e && e.type === 'texte') { e.taille = Number($('#ed-taille').value) || 12; dessinerCalque(); } });
  $('#ed-gras').addEventListener('change', () => { const e = ed.elements[ed.choisi]; if (e && e.type === 'texte') { e.gras = $('#ed-gras').checked; dessinerCalque(); } });
  $('#ed-suppr').addEventListener('click', supprimerElement);
  $('#ed-fermer').addEventListener('click', fermerEditeur);
  $('#ed-prec').addEventListener('click', () => changerPage(-1));
  $('#ed-suiv').addEventListener('click', () => changerPage(1));
  window.addEventListener('resize', () => { if (ed.page) { finirSaisie(); const els = ed.elements, c = ed.choisi; chargerDansEditeur(ed.page).then(() => { ed.elements = els; ed.choisi = c; dessinerCalque(); }); } });

  // ---------- Boutons et raccourcis ----------
  const ouvrirFichiers = () => $('#fichiers').click();
  $('#fichiers').addEventListener('change', ev => { const f = [...ev.target.files]; ev.target.value = ''; importer(f); });
  $('#b-ouvrir').onclick = $('#b-ouvrir2').onclick = ouvrirFichiers;
  $('#b-blanche').onclick = () => insererBlanche();
  $('#b-intercalaire').onclick = () => { const t = prompt('Titre de l\'intercalaire (ex. « Fiches techniques ») :'); if (t && t.trim()) insererBlanche(t.trim()); };
  $('#b-annuler').onclick = annuler;
  $('#b-retablir').onclick = retablir;
  $('#b-gauche').onclick = () => pivoter(-90);
  $('#b-droite').onclick = () => pivoter(90);
  $('#b-dupliquer').onclick = dupliquer;
  $('#b-supprimer').onclick = () => supprimer();
  $('#b-modifier').onclick = () => ouvrirEditeur();
  $('#b-enregistrer').onclick = () => enregistrerPages(etat.pages, etat.sources.get(etat.pages[0]?.source)?.nom || 'Compilation');
  $('#b-extraire').onclick = () => enregistrerPages(pagesChoisies(), 'Extrait');
  $('#b-diviser').onclick = ouvrirDiviser;
  $('#div-annuler').onclick = () => { $('#dlg-diviser').hidden = true; };
  $('#div-ok').onclick = diviser;
  $('#div-plages').addEventListener('focus', () => { document.querySelector('input[name=mode][value=plages]').checked = true; });
  $('#div-n').addEventListener('focus', () => { document.querySelector('input[name=mode][value=n]').checked = true; });
  $('#zoom').addEventListener('input', () => {
    largeurVignette = Number($('#zoom').value);
    try { localStorage.setItem('atelierpdf.zoom', largeurVignette); } catch { /* rien */ }
    rafraichir();
  });

  document.addEventListener('keydown', ev => {
    const saisie = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    const ctrl = ev.ctrlKey || ev.metaKey;
    const touche = ev.key.toLowerCase();
    if (!$('#editeur').hidden) {
      if (saisie) { if (ev.key === 'Escape') document.activeElement.blur(); return; }
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); supprimerElement(); }
      else if (ev.key === 'Escape') fermerEditeur();
      else if (ev.key === 'PageDown') changerPage(1);
      else if (ev.key === 'PageUp') changerPage(-1);
      return;
    }
    if (!$('#dlg-diviser').hidden) { if (ev.key === 'Escape') $('#dlg-diviser').hidden = true; return; }
    if (ctrl && touche === 'o') { ev.preventDefault(); ouvrirFichiers(); return; }
    if (ctrl && touche === 's') { ev.preventDefault(); if (etat.pages.length) $('#b-enregistrer').click(); return; }
    if (saisie) return;
    if (ctrl && touche === 'z') { ev.preventDefault(); if (ev.shiftKey) retablir(); else annuler(); }
    else if (ctrl && touche === 'y') { ev.preventDefault(); retablir(); }
    else if (ctrl && touche === 'a') { ev.preventDefault(); etat.selection = new Set(etat.pages.map(p => p.id)); rafraichir(); }
    else if (ctrl && touche === 'd') { ev.preventDefault(); dupliquer(); }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') supprimer();
    else if (touche === 'r' && !ctrl) pivoter(ev.shiftKey ? -90 : 90);
    else if (ev.key === 'Enter' && etat.selection.size === 1) ouvrirEditeur();
    else if (ev.key === 'Escape') { etat.selection.clear(); rafraichir(); }
  });

  window.addEventListener('beforeunload', ev => { if (etat.pages.length) { ev.preventDefault(); ev.returnValue = ''; } });

  chargerOptions();
  sauverOptions();
  rafraichir();
  // Accès pour les tests automatisés
  window.AtelierPDF = { etat, importer, produire, options };
})();
