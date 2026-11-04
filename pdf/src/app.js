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
    const projets = [...fichiers].filter(f => /\.atelierpdf$/i.test(f.name));
    for (const f of projets) await ouvrirProjet(f, position);
    fichiers = [...fichiers].filter(f => !/\.atelierpdf$/i.test(f.name));
    if (projets.length && !fichiers.length) return;
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
    let octets = new Uint8Array(await f.arrayBuffer());
    // PDF déjà produit par Atelier PDF : on retrouve le document d'origine et ses annotations, modifiables
    let relu = null;
    try { relu = await MoteurPDF.relire(octets); } catch (e) { console.warn('Relecture impossible', e); }
    if (relu) octets = relu.octets;
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
    if (relu) appliquerRelecture(s, pages, relu);
    return pages;
  }

  // Une source par document d'origine (même fichier), annotations, texte reconnu et échelles restaurés
  function appliquerRelecture(s, pages, relu) {
    const parGroupe = new Map();
    for (const [id, img] of Object.entries(relu.images || {})) {
      if (!etat.images.has(id)) etat.images.set(id, { octets: img.octets, mime: img.mime, url: URL.createObjectURL(new Blob([img.octets], { type: img.mime })) });
    }
    pages.forEach((p, i) => {
      const d = relu.pages[i] || {};
      p.elements = d.elements || [];
      if (d.ocr) p.ocr = d.ocr;
      if (d.echelle) p.echelle = d.echelle;
      if (d.intercalaire) p.titre = d.intercalaire;
      const nom = d.groupe || s.nom;
      if (!parGroupe.size) { s.nom = nom; parGroupe.set(nom, s); }
      if (!parGroupe.has(nom)) {
        const autre = nouvelleSource(`${nom}.pdf`, 'pdf');
        Object.assign(autre, { octets: s.octets, doc: s.doc, nbPages: s.nbPages, fichier: s.id, rasteriser: s.rasteriser, alerte: s.alerte });
        parGroupe.set(nom, autre);
      }
      p.source = parGroupe.get(nom).id;
    });
    if (relu.options && !etat.pages.length) appliquerOptions(relu.options);
    const n = pages.reduce((a, p) => a + p.elements.length, 0);
    note(`PDF créé avec Atelier PDF : ${parGroupe.size} document(s) retrouvé(s)${n ? `, ${n} annotation(s) de nouveau modifiable(s)` : ''}. Numéros, filigrane et sommaire seront refaits à l'enregistrement.`, 'ok');
  }

  // ---------- Sauvegarde : travail en cours, fichier projet ----------
  // L'état est décrit en JSON ; les fichiers (PDF, images) sont à part, repérés par un identifiant
  function exporterEtat() {
    const fichiers = new Map();
    const utilisees = new Set(etat.pages.map(p => p.source).filter(Boolean));
    const sources = [];
    for (const s of etat.sources.values()) {
      if (!utilisees.has(s.id)) continue;
      const cle = `f_${s.fichier || s.id}`;
      if (!fichiers.has(cle)) fichiers.set(cle, { octets: s.octets, mime: s.type === 'pdf' ? 'application/pdf' : s.mime });
      sources.push({ id: s.id, nom: s.nom, type: s.type, mime: s.mime, couleur: s.couleur, nbPages: s.nbPages, rasteriser: !!s.rasteriser, alerte: s.alerte || '', l: s.l, h: s.h, fichier: cle });
    }
    const images = [];
    for (const p of etat.pages) for (const e of p.elements) {
      if (e.type !== 'image' || fichiers.has(`i_${e.image}`)) continue;
      const img = etat.images.get(e.image);
      if (!img) continue;
      fichiers.set(`i_${e.image}`, { octets: img.octets, mime: img.mime });
      images.push({ id: e.image, mime: img.mime, l: img.l, h: img.h });
    }
    return { meta: { version: 1, date: Date.now(), pages: etat.pages, sources, images, options: lireOptionsBrutes() }, fichiers };
  }

  // Restaure un état (session ou projet) ; ajouté au travail en cours, avec de nouveaux identifiants
  async function importerEtat(meta, fichier, position = null) {
    const idsSources = new Map();
    const docs = new Map();
    for (const m of meta.sources || []) {
      const f = await fichier(m.fichier);
      if (!f) continue;
      const s = nouvelleSource(`${m.nom}.x`, m.type);
      Object.assign(s, { nom: m.nom, mime: m.mime, couleur: m.couleur, nbPages: m.nbPages, rasteriser: m.rasteriser, alerte: m.alerte, l: m.l, h: m.h, octets: f.octets });
      if (m.type === 'pdf') {
        if (!docs.has(m.fichier)) docs.set(m.fichier, { doc: pdfjs.getDocument({ data: f.octets.slice(), isEvalSupported: false }).promise, id: s.id });
        s.doc = docs.get(m.fichier).doc;
        if (docs.get(m.fichier).id !== s.id) s.fichier = docs.get(m.fichier).id;
      } else {
        s.url = URL.createObjectURL(new Blob([f.octets], { type: m.mime }));
      }
      idsSources.set(m.id, s.id);
    }
    for (const m of meta.images || []) {
      if (etat.images.has(m.id)) continue;
      const f = await fichier(`i_${m.id}`);
      if (f) etat.images.set(m.id, { octets: f.octets, mime: m.mime, l: m.l, h: m.h, url: URL.createObjectURL(new Blob([f.octets], { type: m.mime })) });
    }
    const pages = (meta.pages || []).filter(p => !p.source || idsSources.has(p.source))
      .map(p => ({ ...p, id: nouvelId('p'), source: p.source ? idsSources.get(p.source) : null }));
    if (!pages.length) return 0;
    if (!etat.pages.length && meta.options) appliquerOptions(meta.options);
    memoriser();
    etat.pages.splice(position ?? etat.pages.length, 0, ...pages);
    rafraichir();
    return pages.length;
  }

  async function ouvrirProjet(f, position = null) {
    try {
      const { meta, fichiers } = Stockage.depuisProjet(new Uint8Array(await f.arrayBuffer()));
      const n = await occupe('Ouverture du projet…', () => importerEtat(meta, async id => fichiers.get(id), position));
      if (!$('#o-titre').value && meta.options && meta.options['o-titre']) $('#o-titre').value = meta.options['o-titre'];
      note(`Projet « ${f.name} » ouvert : ${n} page(s).`, 'ok');
    } catch (e) {
      console.error(e);
      note(`Projet « ${f.name} » illisible : ${e.message || e}`, 'erreur');
    }
  }

  async function enregistrerProjet() {
    if (!etat.pages.length) return;
    const { meta, fichiers } = exporterEtat();
    const octets = Stockage.versProjet(meta, fichiers);
    const nom = `${nomFichier($('#o-titre').value.trim() || etat.sources.get(etat.pages[0].source)?.nom || 'Projet')}.atelierpdf`;
    const blob = new Blob([octets], { type: 'application/octet-stream' });
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: nom, types: [{ description: 'Projet Atelier PDF', accept: { 'application/octet-stream': ['.atelierpdf'] } }] });
        const w = await h.createWritable(); await w.write(blob); await w.close();
        note(`Projet « ${h.name} » enregistré : rouvrez-le avec « Projet › Ouvrir » pour continuer.`, 'ok');
        return;
      } catch (e) { if (e.name === 'AbortError') return; }
    }
    telecharger(blob, nom);
    note(`Projet « ${nom} » enregistré dans Téléchargements.`, 'ok');
  }

  function nouveauTravail() {
    if (etat.pages.length && !confirm('Fermer le travail en cours et repartir de zéro ?\nPensez à enregistrer le PDF ou le projet avant.')) return;
    etat.pages = []; etat.selection.clear(); etat.historique = []; etat.futur = [];
    etat.sources.clear();
    $('#o-titre').value = '';
    rafraichir();
  }

  // Sauvegarde automatique, une seconde après la dernière modification. Chaque fenêtre a sa propre session :
  // plusieurs PDF peuvent être ouverts en même temps (double-clic dans l'Explorateur) sans se gêner.
  const ID_SESSION = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const CLE_VIVANT = 'atelierpdf.vivant.';
  let minuterieSauvegarde = null, sauvegardeEnAttente = false;
  function planifierSauvegarde() {
    sauvegardeEnAttente = true;
    clearTimeout(minuterieSauvegarde);
    minuterieSauvegarde = setTimeout(async () => {
      try {
        if (etat.pages.length) { const { meta, fichiers } = exporterEtat(); await Stockage.sauverSession(ID_SESSION, meta, fichiers); }
        else await Stockage.effacerSession(`session:${ID_SESSION}`);
        sauvegardeEnAttente = false;
        const h = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        $('#etat-sauvegarde').textContent = etat.pages.length ? `✓ Travail sauvegardé sur ce PC à ${h}` : '';
      } catch (e) {
        console.warn('Sauvegarde automatique impossible', e);
        $('#etat-sauvegarde').textContent = '⚠ Sauvegarde automatique indisponible : enregistrez le projet';
      }
    }, 1000);
  }
  // Signe de vie de la fenêtre : une session encore ouverte ailleurs n'est pas proposée à la reprise
  function signalerVie() { try { localStorage.setItem(CLE_VIVANT + ID_SESSION, String(Date.now())); } catch { /* rien */ } }
  signalerVie();
  setInterval(signalerVie, 15000);
  window.addEventListener('pagehide', () => { try { localStorage.removeItem(CLE_VIVANT + ID_SESSION); } catch { /* rien */ } });
  const fenetreOuverte = cle => {
    try { const t = Number(localStorage.getItem(CLE_VIVANT + String(cle).replace(/^session:/, ''))); return t && Date.now() - t < 45000; } catch { return false; }
  };

  async function proposerReprise() {
    let liste = [];
    try { liste = (await Stockage.lireSessions(ID_SESSION)).filter(x => !fenetreOuverte(x.cle)); } catch { /* stockage indisponible */ }
    const bandeau = $('#reprise');
    if (!liste.length) { bandeau.hidden = true; return; }
    const session = liste[0];
    const m = session.meta;
    const quand = new Date(m.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    $('#reprise-texte').textContent = `Travail non terminé du ${quand} : ${m.pages.length} page${m.pages.length > 1 ? 's' : ''} (${m.sources.map(x => x.nom).slice(0, 3).join(', ')}${m.sources.length > 3 ? '…' : ''})${liste.length > 1 ? ` — et ${liste.length - 1} autre(s)` : ''}.`;
    bandeau.hidden = false;
    $('#reprise-oui').onclick = async () => {
      bandeau.hidden = true;
      try {
        const n = await occupe('Reprise du travail…', () => importerEtat(m, id => session.fichier(id)));
        etat.historique = [];
        note(`${n} page(s) retrouvée(s).`, 'ok');
        planifierSauvegarde();
        await Stockage.effacerSession(session.cle);
      } catch (e) { note(`Reprise impossible : ${e.message || e}`, 'erreur'); }
      proposerReprise();
    };
    $('#reprise-non').onclick = async () => {
      bandeau.hidden = true;
      try { await Stockage.effacerSession(session.cle); } catch { /* rien */ }
      proposerReprise();
    };
  }

  // Fichiers transmis par le lanceur Windows (double-clic sur un PDF, « Ouvrir avec Atelier PDF »)
  const TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
  async function ouvrirFichiersTransmis() {
    const liste = window.FICHIERS_A_OUVRIR;
    if (!Array.isArray(liste) || !liste.length) return false;
    delete window.FICHIERS_A_OUVRIR;
    const fichiers = [];
    for (const f of liste) {
      try {
        const octets = await (await fetch(`data:application/octet-stream;base64,${f.donnees}`)).arrayBuffer();
        const ext = (/\.([^.]+)$/.exec(f.nom || '') || [])[1]?.toLowerCase() || '';
        fichiers.push(new File([octets], f.nom || 'document.pdf', { type: TYPES[ext] || '' }));
      } catch (e) { note(`« ${f.nom} » n'a pas pu être lu.`, 'erreur'); }
    }
    if (!fichiers.length) return false;
    document.title = `${fichiers.length === 1 ? sansExtension(fichiers[0].name) : `${fichiers.length} documents`} – Atelier PDF`;
    await importer(fichiers);
    etat.historique = [];
    rafraichir();
    return true;
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
        if (!e.applique) { g.fillStyle = e.fond || '#fff'; g.fillRect(e.zone.x * L - k, e.zone.y * H - k, e.zone.w * L + 2 * k, e.zone.h * H + 2 * k); }
        const t = e.taille * k;
        g.fillStyle = e.couleur || '#000';
        g.font = `${e.italique ? 'italic ' : ''}${e.gras ? 'bold ' : ''}${t}px ${FAMILLES[e.police] || FAMILLES.helvetica}`;
        String(e.texte || '').split('\n').forEach((l, i) => g.fillText(l, e.x * L, e.base * H + i * t * 1.2));
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
      let badgeOcr = c.querySelector('.badge-ocr');
      if (p.ocr && !badgeOcr) { badgeOcr = document.createElement('span'); badgeOcr.className = 'badge-ocr'; badgeOcr.textContent = 'texte reconnu'; badgeOcr.title = 'Texte reconnu (OCR) : interrogeable dans le PDF'; c.appendChild(badgeOcr); }
      else if (!p.ocr && badgeOcr) badgeOcr.remove();
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
    planifierSauvegarde();
  }

  function majBoutons() {
    const n = etat.selection.size;
    document.querySelectorAll('.barre button.sel').forEach(b => { b.disabled = !n; });
    $('#b-modifier').disabled = n !== 1 && !(n === 0 && etat.pages.length === 1);
    $('#b-enregistrer').disabled = $('#b-diviser').disabled = $('#b-ocr').disabled = $('#m-enregistrer').disabled = !etat.pages.length;
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
  const champsOptions = ['o-titre', 'o-auteur', 'o-sommaire', 'o-signets', 'o-aplatir', 'o-editable', 'o-num', 'o-num-format', 'o-num-position', 'o-num-taille', 'o-num-debut', 'o-num-ignorer',
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
  function lireOptionsBrutes() {
    const o = {};
    champsOptions.forEach(id => { const el = document.getElementById(id); o[id] = el.type === 'checkbox' ? el.checked : el.value; });
    return o;
  }
  function appliquerOptions(o) {
    champsOptions.forEach(id => {
      const el = document.getElementById(id);
      if (!o || !(id in o)) return;
      if (el.type === 'checkbox') el.checked = !!o[id]; else el.value = o[id];
    });
    sauverOptions();
  }
  function sauverOptions() {
    const o = {};
    champsOptions.forEach(id => { const el = document.getElementById(id); o[id] = el.type === 'checkbox' ? el.checked : el.value; });
    try { localStorage.setItem('atelierpdf.options', JSON.stringify(o)); } catch { /* rien */ }
    $('#sous-num').classList.toggle('ouvert', $('#o-num').checked);
    $('#sous-fil').classList.toggle('ouvert', $('#o-fil').checked);
    $('#sous-compresser').classList.toggle('ouvert', $('#o-compresser').checked);
    planifierSauvegarde();
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
      editable: $('#o-editable').checked,
      donneesDocument: lireOptionsBrutes(),
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
  async function texteNatif(p) {
    if (p.type !== 'pdf') return [];
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

  // ---------- Éditeur de page (annotations) ----------
  // Éléments (coordonnées en fractions de la page affichée) :
  //  texte {x,y,texte,taille,couleur,gras} · bulle {x,y,w,h,px,py,texte,taille,couleur}
  //  ligne / fleche {x1,y1,x2,y2,couleur,epaisseur} · crayon {points,couleur,epaisseur}
  //  cadre / ellipse {x,y,w,h,couleur,epaisseur} · surligne / masque / caviarde {x,y,w,h} · image {x,y,w,h,image}
  //  tampon {x,y,w,h,texte,ligne2,couleur} · cote {x1,y1,x2,y2} · longueur / surface {points} (+ etiquette calculée)
  const BOITES = ['masque', 'surligne', 'cadre', 'caviarde', 'ellipse', 'bulle', 'image', 'tampon'];
  const EN_SVG = ['ligne', 'fleche', 'crayon', 'ellipse', 'bulle', 'tampon', 'cote', 'longueur', 'surface'];
  const SANS_DIV = ['ligne', 'fleche', 'crayon', 'ellipse', 'cote', 'longueur', 'surface', 'texteModifie'];
  const MESURES = ['cote', 'longueur', 'surface'];
  const A_TRACER = ['masque', 'surligne', 'cadre', 'caviarde', 'ellipse', 'bulle'];
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ed = { page: null, elements: [], outil: 'selection', choisi: null, ech: 1, L: 0, H: 0, hist: [], point: null, trace: null, tampon: null, lignes: null };
  const reglages = {
    texte: { couleur: '#000000', taille: 12 }, bulle: { couleur: '#1565c0', taille: 11 },
    ligne: { couleur: '#d32f2f', epaisseur: 2 }, fleche: { couleur: '#d32f2f', epaisseur: 2 }, crayon: { couleur: '#1565c0', epaisseur: 2 },
    cadre: { couleur: '#d32f2f', epaisseur: 2 }, ellipse: { couleur: '#d32f2f', epaisseur: 2 }, surligne: { couleur: '#ffeb3b' },
    cote: { couleur: '#e65100', epaisseur: 1.5 }, longueur: { couleur: '#e65100', epaisseur: 2 }, surface: { couleur: '#6a1b9a', epaisseur: 1.5 },
  };
  try { Object.assign(reglages, JSON.parse(localStorage.getItem('atelierpdf.reglages') || '{}')); } catch { /* rien */ }
  const sauverReglages = () => { try { localStorage.setItem('atelierpdf.reglages', JSON.stringify(reglages)); } catch { /* rien */ } };
  const calque = $('#ed-calque');

  function ouvrirEditeur(id) {
    if (!id && etat.selection.size === 1) id = [...etat.selection][0];
    if (!id && etat.pages.length === 1) id = etat.pages[0].id;
    const p = etat.pages.find(x => x.id === id);
    if (!p) return;
    $('#editeur').hidden = false;
    choisirOutil('selection');
    chargerDansEditeur(p);
  }
  async function chargerDansEditeur(p) {
    ed.trace = null;
    ed.lignes = null;
    ed.page = p;
    ed.elements = structuredClone(p.elements);
    ed.choisi = null;
    ed.hist = [];
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
    // Page pdf.js (polices chargées par l'affichage : nom, gras, italique pour « Modifier le texte »)
    ed.pagePdfjs = p.type === 'pdf' ? await (await etat.sources.get(p.source).doc).getPage(p.index + 1) : null;
    if (ed.outil === 'editertexte') preparerLignes();
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

  // Annuler dans l'éditeur (Ctrl+Z)
  function edMemo() { ed.hist.push(JSON.stringify(ed.elements)); if (ed.hist.length > 200) ed.hist.shift(); }
  function edAnnuler() { if (!ed.hist.length) return; finirSaisie(); ed.elements = JSON.parse(ed.hist.pop()); ed.choisi = null; dessinerCalque(); }

  function choisirOutil(o) {
    finirSaisie();
    terminerTrace();
    if (o !== 'tampon') $('#ed-tampons').hidden = true;
    if (MESURES.includes(o) && ed.page && !ed.page.echelle) {
      note('Choisissez d\'abord l\'échelle du plan (liste « Échelle »), ou « Étalonner » sur une cote connue.');
      $('#ed-echelle').classList.add('alerte');
    }
    ed.outil = o;
    document.querySelectorAll('#ed-outils button').forEach(b => b.classList.toggle('actif', b.dataset.outil === o || b.dataset.outilMenu === o));
    calque.classList.toggle('trace', o !== 'selection' && o !== 'texte');
    calque.classList.toggle('ecrit', o === 'texte');
    if (reglages[o]) majReglagesAffiches(reglages[o]);
    if (o === 'image') { $('#fichier-image').click(); }
    if (o === 'editertexte') preparerLignes();
    else if (ed.lignes) dessinerCalque();
  }
  function majReglagesAffiches(r) {
    if (r.couleur) $('#ed-couleur').value = r.couleur;
    if (r.epaisseur) $('#ed-epaisseur').value = r.epaisseur;
    if (r.taille) $('#ed-taille').value = r.taille;
    if ('gras' in r) $('#ed-gras').checked = !!r.gras;
    $('#ed-police-zone').hidden = r.type !== 'texteModifie';
    if (r.type === 'texteModifie') { $('#ed-police').value = r.police || 'helvetica'; $('#ed-italique').checked = !!r.italique; }
  }

  // ----- Dessin du calque : un élément = un nœud (l'ordre d'empilement est celui du PDF) -----
  const px = (v, axe) => `${v * (axe === 'x' ? ed.L : ed.H)}px`;
  function poignee(type, x, y) {
    const d = document.createElement('div');
    d.className = 'poignee';
    d.dataset.poignee = type;
    d.style.left = `${x * ed.L - 6}px`;
    d.style.top = `${y * ed.H - 6}px`;
    return d;
  }
  function boiteDe(e) {
    if (BOITES.includes(e.type)) return { x: e.x, y: e.y, w: e.w, h: e.h };
    if (e.type === 'texteModifie') return e.zone;
    const pts = e.points ? e.points : [[e.x1, e.y1], [e.x2, e.y2]];
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  function noeudForme(e, i) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'forme');
    svg.setAttribute('width', ed.L);
    svg.setAttribute('height', ed.H);
    for (const f of MoteurPDF.formes(e, ed.L, ed.H, ed.ech)) {
      const d = MoteurPDF.chemin(f.cmds);
      // Zone de prise large (traits fins faciles à attraper)
      if (f.trait) {
        const prise = document.createElementNS(SVG_NS, 'path');
        prise.setAttribute('d', d);
        prise.setAttribute('class', 'prise');
        prise.dataset.i = i;
        svg.appendChild(prise);
      }
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', f.fond || 'none');
      if (f.opaciteFond != null) p.setAttribute('fill-opacity', f.opaciteFond);
      p.setAttribute('stroke', f.trait || 'none');
      p.setAttribute('stroke-width', f.epaisseur || 0);
      p.setAttribute('stroke-linecap', f.rond ? 'round' : 'butt');
      p.setAttribute('stroke-linejoin', 'round');
      p.dataset.i = i;
      svg.appendChild(p);
    }
    if (e.type === 'tampon') {
      for (const lg of MoteurPDF.lignesTampon(e, ed.L, ed.H, ed.ech, mesureTexte)) {
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', lg.x);
        t.setAttribute('y', lg.y + lg.taille * 0.94);
        t.setAttribute('font-size', lg.taille);
        t.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
        t.setAttribute('font-weight', lg.gras ? 'bold' : 'normal');
        t.setAttribute('fill', e.couleur || MoteurPDF.DEFAUTS.tampon);
        t.textContent = lg.texte;
        svg.appendChild(t);
      }
    }
    return svg;
  }
  function noeudsEtiquettes(e, i) {
    return MoteurPDF.etiquettes(e, ed.L, ed.H, ed.ech).map(et => {
      const d = document.createElement('div');
      d.className = 'el-etiquette';
      d.dataset.i = i;
      Object.assign(d.style, { left: `${et.cx}px`, top: `${et.cy}px`, fontSize: `${et.taille}px`, color: et.couleur, borderColor: et.couleur });
      d.textContent = et.texte;
      return d;
    });
  }
  function dessinerCalque() {
    const noeuds = [];
    majMesures(ed.elements, ed.page);
    ed.elements.forEach((e, i) => {
      const choisi = ed.choisi === i;
      if (EN_SVG.includes(e.type)) noeuds.push(noeudForme(e, i));
      if (e.type === 'texteModifie') noeuds.push(...noeudsTexteModifie(e, i));
      if (MESURES.includes(e.type)) noeuds.push(...noeudsEtiquettes(e, i));
      if (e.type === 'bulle') {
        const t = document.createElement('div');
        t.className = 'el el-bulle';
        t.dataset.i = i;
        const m = MoteurPDF.MARGE_BULLE * ed.ech;
        Object.assign(t.style, { left: px(e.x, 'x'), top: px(e.y, 'y'), width: px(e.w, 'x'), height: px(e.h, 'y'), padding: `${m}px`,
          fontSize: `${(e.taille || 11) * ed.ech}px`, fontWeight: e.gras ? 'bold' : 'normal', color: e.couleurTexte || '#000' });
        t.textContent = e.texte || '';
        noeuds.push(t);
      } else if (!SANS_DIV.includes(e.type)) {
        const d = document.createElement('div');
        d.className = `el el-${e.type}`;
        d.dataset.i = i;
        d.style.left = px(e.x, 'x');
        d.style.top = px(e.y, 'y');
        if (e.type === 'texte') {
          d.textContent = e.texte;
          d.style.fontSize = `${(e.taille || 12) * ed.ech}px`;
          d.style.color = e.couleur || '#000';
          d.style.fontWeight = e.gras ? 'bold' : 'normal';
        } else {
          d.style.width = px(e.w, 'x');
          d.style.height = px(e.h, 'y');
          if (e.type === 'masque') d.style.background = e.couleur || '#fff';
          if (e.type === 'surligne') d.style.background = e.couleur || '#ffeb3b';
          if (e.type === 'cadre') { d.style.borderColor = e.couleur || '#d32f2f'; d.style.borderWidth = `${(e.epaisseur || 2) * ed.ech}px`; }
          if (e.type === 'image') { const im = document.createElement('img'); im.src = etat.images.get(e.image)?.url || ''; d.appendChild(im); }
        }
        noeuds.push(d);
      }
      if (choisi) {
        if (e.type !== 'texte') {
          const b = boiteDe(e);
          const cadre = document.createElement('div');
          cadre.className = 'contour';
          Object.assign(cadre.style, { left: `${b.x * ed.L - 4}px`, top: `${b.y * ed.H - 4}px`, width: `${b.w * ed.L + 8}px`, height: `${b.h * ed.H + 8}px` });
          noeuds.push(cadre);
        }
        if (BOITES.includes(e.type)) noeuds.push(poignee('redim', e.x + e.w, e.y + e.h));
        if (e.type === 'ligne' || e.type === 'fleche' || e.type === 'cote') noeuds.push(poignee('p1', e.x1, e.y1), poignee('p2', e.x2, e.y2));
        if ((e.type === 'longueur' || e.type === 'surface') && ed.trace !== e) e.points.forEach(([x, y], k) => noeuds.push(poignee(`v${k}`, x, y)));
        if (e.type === 'bulle') { const p = poignee('pointe', e.px, e.py); p.classList.add('pointe'); noeuds.push(p); }
      }
    });
    if (ed.outil === 'editertexte' && ed.lignes) noeuds.push(...noeudsLignes());
    calque.replaceChildren(...noeuds);
    calque.querySelectorAll('.el-texte, .el-texteModifie').forEach(d => d.classList.toggle('choisi', Number(d.dataset.i) === ed.choisi));
    majProprietes();
    majRecapMesures();
  }
  function majProprietes() {
    const e = ed.elements[ed.choisi];
    $('#ed-suppr').disabled = $('#ed-dupl').disabled = !e;
    $('#ed-memoriser').hidden = !(e && e.type === 'image');
    if (!e) return;
    majReglagesAffiches(e);
  }
  function choisirElement(i) { ed.choisi = i; dessinerCalque(); }

  // ----- Saisie de texte directement sur la page (texte et bulle) -----
  function editerTexte(i) {
    const e = ed.elements[i];
    if (!e) return;
    if (ed.choisi !== i) choisirElement(i);
    const el = calque.querySelector(`.el-texte[data-i="${i}"], .el-bulle[data-i="${i}"], .el-texteModifie[data-i="${i}"]`);
    if (!el) return;
    edMemo();
    el.contentEditable = 'true';
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    // Texte du PDF : curseur à la fin (on corrige un mot, on ne retape pas tout)
    if (e.type === 'texteModifie') r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    el.addEventListener('input', () => { e.texte = el.innerText.replace(/\n$/, ''); });
    el.addEventListener('blur', () => finirSaisie(), { once: true });
  }
  function finirSaisie() {
    const el = calque.querySelector('[contenteditable=true]');
    if (!el) return;
    const i = Number(el.dataset.i);
    el.contentEditable = 'false';
    const e = ed.elements[i];
    if (!e) return;
    e.texte = el.innerText.replace(/\n$/, '');
    // Bulle : hauteur agrandie si le texte déborde
    if (e.type === 'bulle' && el.scrollHeight > el.clientHeight + 1) e.h = el.scrollHeight / ed.H;
    if (e.type === 'texte' && !e.texte.trim()) { ed.elements.splice(i, 1); ed.choisi = null; ed.hist.pop(); }
    // Ligne du PDF ouverte puis laissée telle quelle : rien à modifier
    else if (e.type === 'texteModifie' && e.texte === e.origine && e.nouveau && !e.applique) { ed.elements.splice(i, 1); ed.choisi = null; ed.hist.pop(); }
    if (e.type === 'texteModifie') delete e.nouveau;
    dessinerCalque();
  }

  const posFraction = ev => {
    const r = calque.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) };
  };
  // Maj : trait horizontal, vertical ou à 45°
  function aimanter(a, b) {
    const dx = (b.x - a.x) * ed.L, dy = (b.y - a.y) * ed.H;
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const lg = Math.hypot(dx, dy);
    return { x: a.x + Math.cos(ang) * lg / ed.L, y: a.y + Math.sin(ang) * lg / ed.H };
  }
  function deplacerElement(e, o, dx, dy) {
    // Texte modifié : seul le nouveau texte bouge, la zone d'origine (retirée) reste en place
    if (o.type === 'texteModifie') { e.x = o.x + dx; e.base = o.base + dy; return; }
    if ('x' in o) { e.x = o.x + dx; e.y = o.y + dy; }
    if ('x1' in o) { e.x1 = o.x1 + dx; e.y1 = o.y1 + dy; e.x2 = o.x2 + dx; e.y2 = o.y2 + dy; }
    if (o.points) e.points = o.points.map(([x, y]) => [x + dx, y + dy]);
    if ('px' in o) { e.px = o.px + dx; e.py = o.py + dy; }
  }
  // Suivi d'un glisser sur le calque
  function suivre(ev, bouger, fin = () => {}) {
    calque.setPointerCapture(ev.pointerId);
    const mv = m => bouger(posFraction(m), m);
    const up = m => { calque.removeEventListener('pointermove', mv); calque.removeEventListener('pointerup', up); calque.removeEventListener('pointercancel', up); fin(posFraction(m), m); };
    calque.addEventListener('pointermove', mv);
    calque.addEventListener('pointerup', up);
    calque.addEventListener('pointercancel', up);
  }
  function nouvelElement(type, valeurs) {
    const r = reglages[type] || {};
    const e = { type, ...valeurs };
    if (r.couleur && !['masque', 'caviarde'].includes(type)) e.couleur = r.couleur;
    if (r.epaisseur && ['ligne', 'fleche', 'crayon', 'cadre', 'ellipse', 'bulle'].includes(type)) e.epaisseur = r.epaisseur;
    if (type === 'texte' || type === 'bulle') { e.taille = r.taille || (type === 'bulle' ? 11 : 12); e.gras = !!r.gras; }
    edMemo();
    ed.elements.push(e);
    ed.choisi = ed.elements.length - 1;
    return e;
  }

  calque.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    const cible = ev.target;
    if (cible.isContentEditable) return;
    finirSaisie();
    const depart = posFraction(ev);
    ed.point = depart;
    const elDom = cible.closest('[data-i]');
    const i = elDom ? Number(elDom.dataset.i) : null;

    // Poignées de l'élément choisi
    if (cible.dataset.poignee && ed.choisi != null) {
      ev.preventDefault();
      const e = ed.elements[ed.choisi];
      const o = structuredClone(e);
      edMemo();
      suivre(ev, (p, m) => {
        const t = cible.dataset.poignee;
        if (t === 'redim') {
          let w = Math.max(0.005, p.x - o.x), h = Math.max(0.005, p.y - o.y);
          if (e.type === 'image' && !m.shiftKey) h = w * (o.h / o.w);   // proportions conservées (Maj pour les libérer)
          e.w = w; e.h = h;
        } else if (t === 'p1' || t === 'p2') {
          const fixe = t === 'p1' ? { x: o.x2, y: o.y2 } : { x: o.x1, y: o.y1 };
          const q = m.shiftKey ? aimanter(fixe, p) : p;
          if (t === 'p1') { e.x1 = q.x; e.y1 = q.y; } else { e.x2 = q.x; e.y2 = q.y; }
        } else if (t === 'pointe') { e.px = p.x; e.py = p.y; }
        else if (t[0] === 'v') { e.points[Number(t.slice(1))] = [p.x, p.y]; }
        dessinerCalque();
      });
      return;
    }

    // Outil Sélection : choisir et déplacer
    if (ed.outil === 'selection') {
      if (i == null) { if (ed.choisi != null) choisirElement(null); return; }
      ev.preventDefault();
      if (ed.choisi !== i) choisirElement(i);
      const e = ed.elements[i];
      const o = structuredClone(e);
      let bouge = false;
      suivre(ev, p => {
        if (!bouge) { edMemo(); bouge = true; }
        deplacerElement(e, o, p.x - depart.x, p.y - depart.y);
        dessinerCalque();
      });
      return;
    }

    ev.preventDefault();
    // Modifier le texte du PDF : clic sur une ligne repérée
    if (ed.outil === 'editertexte') {
      const e0 = i != null ? ed.elements[i] : null;
      if (e0 && e0.type === 'texteModifie') { editerTexte(i); return; }
      const n = cible.dataset.ligne != null ? Number(cible.dataset.ligne) : ligneSous(depart);
      if (n >= 0 && ed.lignes[n]) modifierLigne(ed.lignes[n]);
      return;
    }
    // Texte à la volée : clic puis frappe ; clic sur un texte ou une bulle existants = le corriger
    if (ed.outil === 'texte') {
      const e0 = i != null ? ed.elements[i] : null;
      if (e0 && (e0.type === 'texte' || e0.type === 'bulle')) { editerTexte(i); return; }
      const t = reglages.texte.taille || 12;
      nouvelElement('texte', { x: depart.x, y: Math.max(0, depart.y - (t * 0.6 * ed.ech) / ed.H), texte: '' });
      dessinerCalque();
      editerTexte(ed.choisi);
      ed.hist.pop(); // la création compte pour une seule étape
      return;
    }

    // Longueur (polyligne) et surface (polygone) : un clic par point, double-clic ou Entrée pour finir
    if (ed.outil === 'longueur' || ed.outil === 'surface') {
      if (!ed.trace) {
        ed.trace = nouvelElement(ed.outil, { points: [[depart.x, depart.y], [depart.x, depart.y]] });
        note('Cliquez les points suivants ; double-clic (ou Entrée) pour terminer, Échap pour arrêter.');
      } else ed.trace.points.push([depart.x, depart.y]);
      dessinerCalque();
      return;
    }

    // Tampon choisi dans la liste : clic = taille standard, glisser = taille voulue
    if (ed.outil === 'tampon' && ed.tampon) {
      if (ed.tampon.image) { poserImageBibliotheque(ed.tampon, depart); return; }
      const d = dims(ed.page);
      const e = nouvelElement('tampon', { texte: ed.tampon.texte, ligne2: ligneTampon(), couleur: ed.tampon.couleur, x: depart.x, y: depart.y, w: 0, h: 0 });
      dessinerCalque();
      suivre(ev, p => {
        e.x = Math.min(depart.x, p.x); e.y = Math.min(depart.y, p.y);
        e.w = Math.abs(p.x - depart.x); e.h = Math.abs(p.y - depart.y);
        dessinerCalque();
      }, () => {
        if (e.w * ed.L < 20 || e.h * ed.H < 10) {
          e.w = Math.min(0.9, 200 / d.l); e.h = Math.min(0.5, (e.ligne2 ? 66 : 48) / d.h);
          e.x = Math.max(0, Math.min(1 - e.w, depart.x - e.w / 2)); e.y = Math.max(0, Math.min(1 - e.h, depart.y - e.h / 2));
        }
        choisirOutil('selection');
        choisirElement(ed.elements.indexOf(e));
      });
      return;
    }

    if (ed.outil === 'ligne' || ed.outil === 'fleche' || ed.outil === 'cote' || ed.outil === 'etalonner') {
      const e = nouvelElement(ed.outil === 'etalonner' ? 'ligne' : ed.outil, { x1: depart.x, y1: depart.y, x2: depart.x, y2: depart.y });
      if (ed.outil === 'etalonner') { e.couleur = '#00897b'; e.epaisseur = 2; }
      const etalonnage = ed.outil === 'etalonner';
      suivre(ev, (p, m) => { const q = m.shiftKey ? aimanter(depart, p) : p; e.x2 = q.x; e.y2 = q.y; dessinerCalque(); },
        () => {
          const court = Math.hypot((e.x2 - e.x1) * ed.L, (e.y2 - e.y1) * ed.H) < 5;
          if (court || etalonnage) { ed.elements.pop(); ed.choisi = null; ed.hist.pop(); }
          dessinerCalque();
          if (etalonnage && !court) etalonner(e);
        });
      dessinerCalque();
      return;
    }

    if (ed.outil === 'crayon') {
      const e = nouvelElement('crayon', { points: [[depart.x, depart.y]] });
      dessinerCalque();
      suivre(ev, p => {
        const [dx, dy] = e.points[e.points.length - 1];
        if (Math.hypot((p.x - dx) * ed.L, (p.y - dy) * ed.H) < 2) return;
        e.points.push([p.x, p.y]);
        dessinerCalque();
      }, () => { ed.choisi = null; dessinerCalque(); });
      return;
    }

    if (A_TRACER.includes(ed.outil)) {
      const type = ed.outil;
      const e = nouvelElement(type, { x: depart.x, y: depart.y, w: 0, h: 0 });
      if (type === 'bulle') { e.texte = ''; e.px = depart.x; e.py = depart.y; }
      dessinerCalque();
      suivre(ev, p => {
        e.x = Math.min(depart.x, p.x); e.y = Math.min(depart.y, p.y);
        e.w = Math.abs(p.x - depart.x); e.h = Math.abs(p.y - depart.y);
        if (type === 'bulle') { e.px = Math.max(0, e.x - 0.04); e.py = Math.min(1, e.y + e.h + 0.06); }
        dessinerCalque();
      }, () => {
        const petit = e.w * ed.L < 6 || e.h * ed.H < 6;
        if (petit && type === 'bulle') {
          // Simple clic : bulle de taille standard, pointe vers le point cliqué
          e.w = 180 / ed.L; e.h = 50 / ed.H;
          e.px = depart.x; e.py = depart.y;
          e.x = Math.min(1 - e.w, depart.x + 30 / ed.L); e.y = Math.max(0, depart.y - e.h - 30 / ed.H);
        } else if (petit) { ed.elements.pop(); ed.choisi = null; ed.hist.pop(); dessinerCalque(); return; }
        dessinerCalque();
        if (type === 'bulle') { editerTexte(ed.choisi); ed.hist.pop(); }
      });
    }
  });
  calque.addEventListener('dblclick', ev => {
    const elDom = ev.target.closest('.el-texte, .el-bulle');
    if (elDom) editerTexte(Number(elDom.dataset.i));
  });

  // ----- Images : bouton, ou collage (Ctrl+V) d'une image ou d'un texte copiés -----
  async function ajouterImage(blob, lieu = null) {
    try {
      const img = await normaliserImage(blob);
      const id = nouvelId('i');
      etat.images.set(id, img);
      const w = Math.min(0.3, img.l * 0.75 / ed.L), h = w * (img.h / img.l) * (ed.L / ed.H);
      const x = lieu ? Math.min(1 - w, lieu.x) : 0.5 - w / 2, y = lieu ? Math.min(1 - h, lieu.y) : Math.max(0, 0.5 - h / 2);
      nouvelElement('image', { image: id, x, y, w, h });
      choisirOutil('selection');
      dessinerCalque();
      note('Image ajoutée : déplacez-la, et tirez le coin bleu pour la redimensionner. Une signature en PNG sur fond transparent rend mieux.');
    } catch (e) { note(`Image illisible : ${e.message || e}`, 'erreur'); }
  }
  $('#fichier-image').addEventListener('change', ev => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (ed.outil === 'image') choisirOutil('selection');
    if (f && ed.page) ajouterImage(f, ed.point);
  });
  document.addEventListener('paste', ev => {
    if ($('#editeur').hidden || document.activeElement?.isContentEditable || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    const items = [...(ev.clipboardData?.items || [])];
    const image = items.find(it => it.type.startsWith('image/'));
    if (image) { ev.preventDefault(); ajouterImage(image.getAsFile(), ed.point); return; }
    const texte = ev.clipboardData?.getData('text/plain');
    if (texte) {
      ev.preventDefault();
      const p = ed.point || { x: 0.1, y: 0.1 };
      nouvelElement('texte', { x: p.x, y: p.y, texte: texte.replace(/\r/g, '') });
      dessinerCalque();
    }
  });

  // ----- Caviarder un texte sur toutes les pages : texte des PDF et texte reconnu (OCR) -----
  const sansAccent = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Mots d'une page avec leur géométrie : origine o, sens d'écriture u (toute la longueur), hauteur v
  async function motsPourRecherche(p) {
    if (p.ocr && p.ocr.length) return p.ocr.map(m => ({ t: m.t, o: [m.x, m.y + m.h], u: [m.w, 0], v: [0, -m.h] }));
    return texteNatif(p);
  }
  // Zone (fractions) d'une partie [a, b] (0..1) d'un mot
  function zoneMot(m, a, b) {
    const pts = [[a, 0], [b, 0], [b, 1], [a, 1]].map(([s, t]) => [m.o[0] + m.u[0] * s + m.v[0] * t, m.o[1] + m.u[1] * s + m.v[1] * t]);
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { type: 'caviarde', x: x - 0.002, y: y - 0.002, w: Math.max(...xs) - x + 0.004, h: Math.max(...ys) - y + 0.004 };
  }
  // Recherche d'une expression (plusieurs mots possibles) : les mots sont mis bout à bout, séparés par une espace
  function chercher(mots, cherche) {
    let texte = '';
    const debuts = [];
    mots.forEach(m => { debuts.push(texte.length); texte += sansAccent(m.t) + ' '; });
    const zones = [];
    const motDe = pos => { let i = debuts.length - 1; while (i > 0 && debuts[i] > pos) i--; return i; };
    let pos = texte.indexOf(cherche);
    while (pos >= 0) {
      const fin = pos + cherche.length;
      for (let i = motDe(pos); i <= motDe(fin - 1); i++) {
        const lg = sansAccent(mots[i].t).length || 1;
        const a = Math.max(0, pos - debuts[i]) / lg, b = Math.min(lg, fin - debuts[i]) / lg;
        if (b > a) zones.push(zoneMot(mots[i], a, b));
      }
      pos = texte.indexOf(cherche, pos + 1);
    }
    return zones;
  }
  async function caviarderRecherche() {
    const mot = prompt('Texte à caviarder sur toutes les pages (nom, adresse, n° de téléphone…) :\nLes zones trouvées seront recouvertes de noir et le texte supprimé à l\'enregistrement.');
    if (!mot || !mot.trim()) return;
    const cherche = sansAccent(mot.trim().replace(/\s+/g, ' '));
    if (ed.page) validerEditeur();
    // Pages scannées sans texte : proposer de les lire d'abord
    const sansTexte = [];
    await occupe('Recherche des pages sans texte…', async avance => {
      for (let k = 0; k < etat.pages.length; k++) {
        const p = etat.pages[k];
        if (p.type !== 'blanche' && !(await aDuTexte(p))) sansTexte.push(p);
        avance((k + 1) / etat.pages.length);
      }
    });
    if (sansTexte.length && confirm(`${sansTexte.length} page(s) scannée(s) ou photo(s) n'ont pas encore de texte lisible.\nLancer la reconnaissance du texte (OCR) pour y chercher aussi « ${mot.trim()} » ?`)) {
      await lancerOcr(sansTexte);
    }
    let total = 0, pagesTouchees = 0;
    const ajouts = new Map();
    await occupe('Recherche du texte…', async avance => {
      for (let k = 0; k < etat.pages.length; k++) {
        const p = etat.pages[k];
        const zones = chercher(await motsPourRecherche(p), cherche);
        if (zones.length) { ajouts.set(p, zones); total += zones.length; pagesTouchees++; }
        avance((k + 1) / etat.pages.length);
      }
    });
    if (!total) { note(`« ${mot} » n'a pas été trouvé dans le texte des pages.`, 'erreur'); return; }
    memoriser();
    for (const [p, zones] of ajouts) p.elements.push(...zones);
    rafraichir();
    if (ed.page) chargerDansEditeur(ed.page);
    note(`${total} occurrence(s) caviardée(s) sur ${pagesTouchees} page(s). Vérifiez les pages avant d'enregistrer.`, 'ok');
  }

  // ----- Modifier le texte du PDF -----
  // Lignes de texte de la page affichée : éléments de texte du PDF (pdf.js) ou mots reconnus (OCR) regroupés par ligne
  async function lignesTexte(p) {
    const d = dims(p);
    let mots;
    const natif = p.type === 'pdf' ? await texteNatif(p) : [];
    if (natif.some(m => m.t.trim())) {
      mots = natif.filter(m => Math.abs(m.u[1] * d.h) < 0.5 && m.u[0] > 0 && m.t.trim())
        .map(m => ({ t: m.t, x: m.x, y: m.y, w: m.w, h: m.h, gauche: m.b[0], base: m.b[1], taille: m.taille, police: m.police, famille: m.famille }));
    } else if (p.ocr && p.ocr.length) {
      // Texte reconnu : lignes données par l'OCR ; sinon (anciennes reconnaissances) regroupement par position
      const parLigne = new Map();
      p.ocr.forEach(m => { const k = m.ligne ?? `${Math.round((m.y + m.h) * 200)}`; if (!parLigne.has(k)) parLigne.set(k, []); parLigne.get(k).push(m); });
      mots = [];
      for (const groupe of parLigne.values()) {
        const hMax = Math.max(...groupe.map(m => m.h));
        const taille = (groupe[0].rang ? groupe[0].rang * 1.05 : hMax / 0.9) * d.h;
        const base = groupe[0].base ?? Math.max(...groupe.map(m => m.y + m.h)) - hMax * 0.2;
        groupe.forEach(m => mots.push({ t: m.t, x: m.x, y: m.y, w: m.w, h: m.h, gauche: m.x, base, taille, ocr: true, police: `ocr${m.ligne ?? ''}` }));
      }
      // Même ligne de l'OCR : même base et même taille, les mots se suivent
    } else return [];
    mots.sort((a, b) => a.base - b.base || a.gauche - b.gauche);
    const lignes = [];
    for (const m of mots) {
      // Une ligne = même ligne de base, même taille et même police (un libellé en gras et sa valeur sont séparés)
      const l = lignes.find(x => Math.abs(x.base - m.base) * d.h < 0.35 * Math.max(x.taille, m.taille)
        && Math.abs(x.taille - m.taille) < 0.3 * x.taille && x.police === m.police
        && (m.x - (x.zone.x + x.zone.w)) * d.l < 1.2 * x.taille && m.x + 1e-6 >= x.zone.x);
      if (!l) {
        lignes.push({ t: m.t, zone: { x: m.x, y: m.y, w: m.w, h: m.h }, x: m.gauche, base: m.base, taille: m.taille, police: m.police, famille: m.famille, ocr: !!m.ocr });
        continue;
      }
      const ecart = (m.x - (l.zone.x + l.zone.w)) * d.l;
      if (ecart > 0.18 * l.taille && !/\s$/.test(l.t) && !/^\s/.test(m.t)) l.t += ' ';
      l.t += m.t;
      const x2 = Math.max(l.zone.x + l.zone.w, m.x + m.w), y2 = Math.max(l.zone.y + l.zone.h, m.y + m.h);
      l.zone.x = Math.min(l.zone.x, m.x); l.zone.y = Math.min(l.zone.y, m.y);
      l.zone.w = x2 - l.zone.x; l.zone.h = y2 - l.zone.y;
    }
    lignes.forEach(l => { l.t = l.t.replace(/\s+$/, ''); });
    return lignes;
  }
  async function preparerLignes() {
    const p = ed.page;
    if (!p) return;
    try { ed.lignes = await lignesTexte(p); } catch (e) { console.error(e); ed.lignes = []; }
    if (ed.page !== p) return;
    if (!ed.lignes.length) {
      note(p.type === 'pdf' || p.type === 'image'
        ? 'Aucun texte lisible sur cette page (scan ou photo) : lancez d\'abord « 🔍 OCR », ou utilisez « Masquer » puis « Texte ».'
        : 'Aucun texte sur cette page.', 'erreur');
    } else note('Cliquez sur une ligne pour la corriger. À l\'enregistrement, l\'ancien texte est retiré du fichier.');
    dessinerCalque();
  }
  function noeudsLignes() {
    const deja = ed.elements.filter(e => e.type === 'texteModifie').map(e => e.zone);
    return ed.lignes.map((l, n) => {
      if (deja.some(z => Math.abs(z.x - l.zone.x) < 1e-4 && Math.abs(z.y - l.zone.y) < 1e-4)) return null;
      const d = document.createElement('div');
      d.className = 'ligne-texte';
      d.dataset.ligne = n;
      d.title = l.t;
      Object.assign(d.style, { left: `${l.zone.x * ed.L - 2}px`, top: `${l.zone.y * ed.H - 2}px`, width: `${l.zone.w * ed.L + 4}px`, height: `${l.zone.h * ed.H + 4}px` });
      return d;
    }).filter(Boolean);
  }
  const ligneSous = pt => (ed.lignes || []).findIndex(l => pt.x >= l.zone.x && pt.x <= l.zone.x + l.zone.w && pt.y >= l.zone.y && pt.y <= l.zone.y + l.zone.h);
  function noeudsTexteModifie(e, i) {
    const res = [];
    if (!e.applique) {
      const fond = document.createElement('div');
      fond.className = 'el-fondtexte';
      fond.dataset.i = i;
      const m = 1.2 * ed.ech;
      Object.assign(fond.style, { left: `${e.zone.x * ed.L - m}px`, top: `${e.zone.y * ed.H - m}px`, width: `${e.zone.w * ed.L + 2 * m}px`, height: `${e.zone.h * ed.H + 2 * m}px`, background: e.fond || '#fff' });
      res.push(fond);
    }
    const t = document.createElement('div');
    t.className = 'el el-texteModifie';
    t.dataset.i = i;
    const taille = e.taille * ed.ech;
    Object.assign(t.style, { left: px(e.x, 'x'), top: `${e.base * ed.H - taille * 0.94}px`, fontSize: `${taille}px`, color: e.couleur || '#000',
      fontFamily: FAMILLES[e.police] || FAMILLES.helvetica, fontWeight: e.gras ? 'bold' : 'normal', fontStyle: e.italique ? 'italic' : 'normal' });
    t.textContent = e.texte;
    res.push(t);
    return res;
  }
  // Police, couleur du texte et du fond de la ligne d'origine
  function styleDeLigne(l) {
    let nom = '', serif = /serif/i.test(l.famille || '') && !/sans/i.test(l.famille || ''), mono = /mono/i.test(l.famille || ''), gras = false, ital = false;
    try {
      const f = l.police && ed.pagePdfjs && ed.pagePdfjs.commonObjs.has(l.police) ? ed.pagePdfjs.commonObjs.get(l.police) : null;
      if (f) {
        nom = f.name || '';
        gras = !!(f.bold || f.black); ital = !!f.italic;
        if (f.isMonospace) mono = true;
        if (f.isSerifFont) serif = true;
      }
    } catch { /* police non chargée */ }
    if (/bold|black|heavy|semibold|demi/i.test(nom)) gras = true;
    if (/italic|oblique/i.test(nom)) ital = true;
    if (/courier|mono|consol/i.test(nom)) mono = true;
    else if (/times|roman|serif|garamond|georgia|cambria|book/i.test(nom) && !/sans/i.test(nom)) serif = true;
    else if (/arial|helvetica|sans|calibri|verdana|tahoma|segoe/i.test(nom)) serif = false;
    const police = mono ? 'courier' : serif ? 'times' : 'helvetica';
    // Couleurs : fond = couleur la plus fréquente sur le bord de la zone, texte = pixels les plus éloignés du fond
    const c = $('#ed-canvas');
    const kx = c.width / ed.L, ky = c.height / ed.H;
    const x0 = Math.max(0, Math.floor(l.zone.x * ed.L * kx)), y0 = Math.max(0, Math.floor(l.zone.y * ed.H * ky));
    const w = Math.min(c.width - x0, Math.ceil(l.zone.w * ed.L * kx)), h = Math.min(c.height - y0, Math.ceil(l.zone.h * ed.H * ky));
    let fond = '#ffffff', couleur = '#000000';
    try {
      const px = c.getContext('2d').getImageData(x0, y0, Math.max(1, w), Math.max(1, h)).data;
      const freq = new Map();
      const bord = (x, y) => x < 2 || y < 2 || x >= w - 2 || y >= h - 2;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!bord(x, y)) continue;
        const k = (y * w + x) * 4;
        const cle = ((px[k] >> 3) << 10) | ((px[k + 1] >> 3) << 5) | (px[k + 2] >> 3);
        freq.set(cle, (freq.get(cle) || 0) + 1);
      }
      const [cf] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0] || [0x7fff];
      const fr = ((cf >> 10) & 31) * 8 + 4, fg = ((cf >> 5) & 31) * 8 + 4, fb = (cf & 31) * 8 + 4;
      fond = rvb(fr, fg, fb);
      const dist = [];
      for (let k = 0; k < px.length; k += 4) dist.push([Math.abs(px[k] - fr) + Math.abs(px[k + 1] - fg) + Math.abs(px[k + 2] - fb), k]);
      dist.sort((a, b) => b[0] - a[0]);
      const sel = dist.slice(0, Math.max(1, Math.floor(dist.length * 0.06)));
      if (sel[0] && sel[0][0] > 60) {
        const moy = [0, 1, 2].map(o => sel.reduce((a, [, k]) => a + px[k + o], 0) / sel.length);
        couleur = rvb(...moy);
      }
    } catch { /* lecture impossible : noir sur blanc */ }
    return { police, gras, italique: ital, couleur, fond };
  }
  const rvb = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  async function modifierLigne(l) {
    const st = styleDeLigne(l);
    const e = nouvelElement('texteModifie', { zone: { ...l.zone }, x: l.x, base: l.base, texte: l.t, origine: l.t, taille: Math.round(l.taille * 10) / 10, ...st, nouveau: true });
    dessinerCalque();
    editerTexte(ed.elements.indexOf(e));
    ed.hist.pop();
  }

  // ----- Mesures sur plan -----
  // Échelle de la page : millimètres réels par point PDF (1 pt = 25,4/72 mm sur le papier)
  const MM_PAR_PT = 25.4 / 72;
  const nombre = (v, dec) => v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const formatLongueur = mm => (mm < 1000 ? `${nombre(mm, 0)} mm` : `${nombre(mm / 1000, 2)} m`);
  const formatSurface = mm2 => `${nombre(mm2 / 1e6, 2)} m²`;
  function valeurMesure(e, p) {
    const d = dims(p);
    const mmPt = p.echelle ? p.echelle.mmParPt : MM_PAR_PT;
    const pts = e.type === 'cote' ? [[e.x1, e.y1], [e.x2, e.y2]] : (e.points || []);
    if (e.type === 'surface') {
      let a = 0;
      pts.forEach(([x1, y1], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * d.l * y2 * d.h - x2 * d.l * y1 * d.h; });
      return { type: 'surface', mm2: Math.abs(a) / 2 * mmPt * mmPt };
    }
    let lg = 0;
    for (let i = 1; i < pts.length; i++) lg += Math.hypot((pts[i][0] - pts[i - 1][0]) * d.l, (pts[i][1] - pts[i - 1][1]) * d.h);
    return { type: 'longueur', mm: lg * mmPt };
  }
  function majMesures(elements, p) {
    if (!p) return;
    for (const e of elements) {
      if (!MESURES.includes(e.type)) continue;
      const v = valeurMesure(e, p);
      e.etiquette = (v.type === 'surface' ? formatSurface(v.mm2) : formatLongueur(v.mm)) + (p.echelle ? '' : ' (papier)');
    }
  }
  function majRecapMesures() {
    const zone = $('#ed-recap');
    if (!ed.page) return;
    const ech = ed.page.echelle;
    $('#ed-echelle').value = ech ? (ech.libelle || 'etalonnee') : '';
    const opt = $('#ed-echelle').querySelector('option[value=etalonnee]');
    opt.hidden = !(ech && !ech.libelle);
    if (ech && !ech.libelle) opt.textContent = `Étalonnée (1 cm papier = ${formatLongueur(ech.mmParPt * 72 / 2.54)})`;
    let lg = 0, surf = 0, n = 0;
    for (const e of ed.elements) {
      if (!MESURES.includes(e.type)) continue;
      const v = valeurMesure(e, ed.page);
      n++;
      if (v.type === 'surface') surf += v.mm2; else lg += v.mm;
    }
    zone.textContent = n ? `Mesures de la page : ${n} · longueurs ${formatLongueur(lg)} · surfaces ${formatSurface(surf)}${ech ? '' : ' — échelle non définie'}` : '';
  }
  // Échelle appliquée à toutes les pages du même document
  function appliquerEchelle(echelle) {
    const src = ed.page.source;
    memoriser();
    etat.pages.forEach(p => { if (p === ed.page || (src && p.source === src)) { if (echelle) p.echelle = echelle; else delete p.echelle; } });
    $('#ed-echelle').classList.remove('alerte');
    dessinerCalque();
    rafraichir();
  }
  $('#ed-echelle').addEventListener('change', () => {
    const v = $('#ed-echelle').value;
    if (v === 'etalonner') { choisirOutil('etalonner'); note('Tracez un trait sur une cote connue du plan, puis indiquez sa longueur réelle.'); majRecapMesures(); return; }
    if (v === 'etalonnee') return;
    if (!v) { appliquerEchelle(null); return; }
    const n = Number(v.split('/')[1]);
    appliquerEchelle({ mmParPt: MM_PAR_PT * n, libelle: v });
  });
  function lireLongueur(texte) {
    const m = /^\s*([\d\s]+(?:[.,]\d+)?)\s*(mm|cm|m)?\s*$/i.exec(texte || '');
    if (!m) return null;
    const v = Number(m[1].replace(/\s/g, '').replace(',', '.'));
    const u = (m[2] || 'm').toLowerCase();
    return v * (u === 'mm' ? 1 : u === 'cm' ? 10 : 1000);
  }
  function etalonner(e) {
    const d = dims(ed.page);
    const lgPt = Math.hypot((e.x2 - e.x1) * d.l, (e.y2 - e.y1) * d.h);
    const rep = prompt('Longueur réelle de ce trait (ex. 2,50 m · 2500 mm · 250 cm) :');
    choisirOutil('selection');
    if (rep === null) { majRecapMesures(); return; }
    const mm = lireLongueur(rep);
    if (!mm || mm <= 0) { note('Longueur non comprise : écrivez par exemple « 2,5 m » ou « 2500 mm ».', 'erreur'); majRecapMesures(); return; }
    appliquerEchelle({ mmParPt: mm / lgPt });
    note(`Échelle étalonnée pour toutes les pages de ce document.`, 'ok');
  }
  function terminerTrace() {
    const e = ed.trace;
    if (!e) return;
    ed.trace = null;
    // Points en double laissés par le double-clic
    while (e.points.length > 1) {
      const [a, b] = e.points.slice(-2);
      if (Math.hypot((a[0] - b[0]) * ed.L, (a[1] - b[1]) * ed.H) < 4) e.points.pop(); else break;
    }
    if (e.points.length < (e.type === 'surface' ? 3 : 2)) { ed.elements.splice(ed.elements.indexOf(e), 1); ed.choisi = null; }
    dessinerCalque();
  }
  calque.addEventListener('pointermove', ev => {
    if (!ed.trace) return;
    let p = posFraction(ev);
    const pts = ed.trace.points;
    if (ev.shiftKey && pts.length > 1) p = aimanter({ x: pts[pts.length - 2][0], y: pts[pts.length - 2][1] }, p);
    pts[pts.length - 1] = [p.x, p.y];
    dessinerCalque();
  });
  calque.addEventListener('dblclick', () => { if (ed.trace) terminerTrace(); });

  // Relevé de toutes les mesures du dossier (tableur, séparateur « ; »)
  function exporterMesures() {
    validerEditeur();
    const lignes = [['Page', 'Document', 'Type', 'Valeur', 'Unité', 'Échelle']];
    let n = 0;
    etat.pages.forEach((p, i) => {
      const els = p.elements.filter(e => MESURES.includes(e.type));
      els.forEach(e => {
        const v = valeurMesure(e, p);
        const type = { cote: 'Cote', longueur: 'Longueur', surface: 'Surface' }[e.type];
        const val = v.type === 'surface' ? nombre(v.mm2 / 1e6, 3) : nombre(v.mm / 1000, 3);
        lignes.push([i + 1, etat.sources.get(p.source)?.nom || p.titre || '', type, val, v.type === 'surface' ? 'm²' : 'm', p.echelle ? (p.echelle.libelle || 'étalonnée') : 'aucune']);
        n++;
      });
    });
    if (!n) { note('Aucune mesure dans le dossier.', 'erreur'); return; }
    const csv = '﻿' + lignes.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    telecharger(new Blob([csv], { type: 'text/csv' }), `Mesures - ${nomFichier($('#o-titre').value.trim() || 'dossier')}.csv`);
    note(`${n} mesure(s) exportée(s) (fichier CSV, s'ouvre dans Excel).`, 'ok');
  }

  // ----- Tampons et images mémorisées (signatures) -----
  const TAMPONS = [
    { texte: 'BON POUR EXÉCUTION', couleur: '#2e7d32' }, { texte: 'APPROUVÉ', couleur: '#2e7d32' }, { texte: 'CONFORME', couleur: '#2e7d32' },
    { texte: 'VISA', couleur: '#1565c0' }, { texte: 'VU', couleur: '#1565c0' }, { texte: 'REÇU', couleur: '#1565c0' },
    { texte: 'À REPRENDRE', couleur: '#e65100' }, { texte: 'REFUSÉ', couleur: '#c62828' }, { texte: 'NON CONFORME', couleur: '#c62828' },
    { texte: 'PROVISOIRE', couleur: '#6a1b9a' }, { texte: 'COPIE CONFORME', couleur: '#455a64' }, { texte: 'ANNULÉ', couleur: '#c62828' },
  ];
  function ligneTampon() {
    const nom = $('#tp-nom').value.trim();
    const date = $('#tp-date').checked ? `le ${new Date().toLocaleDateString('fr-FR')}` : '';
    return [nom, date].filter(Boolean).join(' – ');
  }
  try { $('#tp-nom').value = localStorage.getItem('atelierpdf.tampon.nom') || ''; $('#tp-date').checked = localStorage.getItem('atelierpdf.tampon.date') !== '0'; } catch { /* rien */ }
  $('#tp-nom').addEventListener('input', () => { try { localStorage.setItem('atelierpdf.tampon.nom', $('#tp-nom').value); } catch { /* rien */ } });
  $('#tp-date').addEventListener('change', () => { try { localStorage.setItem('atelierpdf.tampon.date', $('#tp-date').checked ? '1' : '0'); } catch { /* rien */ } });

  function armerTampon(t) {
    ed.tampon = t;
    $('#ed-tampons').hidden = true;
    choisirOutil('tampon');
    note(t.image ? 'Cliquez sur la page pour poser l\'image.' : 'Cliquez sur la page pour poser le tampon (ou glissez pour choisir sa taille).');
  }
  async function ouvrirTampons() {
    const zone = $('#ed-tampons');
    if (!zone.hidden) { zone.hidden = true; return; }
    $('#tp-liste').replaceChildren(...TAMPONS.map(t => {
      const b = document.createElement('button');
      b.className = 'tp-tampon';
      b.textContent = t.texte;
      b.style.color = b.style.borderColor = t.couleur;
      b.onclick = () => armerTampon(t);
      return b;
    }));
    let biblio = [];
    try { biblio = await Stockage.listerBibliotheque(); } catch { /* stockage indisponible */ }
    $('#tp-biblio').replaceChildren(...(biblio.length ? biblio.sort((a, b) => a.date - b.date).map(item => {
      const d = document.createElement('div');
      d.className = 'tp-image';
      const im = document.createElement('img');
      im.src = URL.createObjectURL(new Blob([item.octets], { type: item.mime }));
      im.title = item.nom;
      const n = document.createElement('span'); n.textContent = item.nom;
      const x = document.createElement('button'); x.textContent = '✕'; x.title = 'Retirer de la bibliothèque';
      x.onclick = async ev => { ev.stopPropagation(); if (!confirm(`Retirer « ${item.nom} » de la bibliothèque ?`)) return; await Stockage.retirerBibliotheque(item.id); d.remove(); };
      d.append(im, n, x);
      d.onclick = () => armerTampon({ image: item });
      return d;
    }) : [Object.assign(document.createElement('p'), { className: 'aide', textContent: 'Aucune image : insérez votre signature (outil Image), sélectionnez-la puis « ☆ Mémoriser ».' })]));
    zone.hidden = false;
  }
  $('#tp-perso').addEventListener('click', () => {
    const t = prompt('Texte du tampon :');
    if (t && t.trim()) armerTampon({ texte: t.trim().toUpperCase(), couleur: $('#ed-couleur').value === '#000000' ? '#1565c0' : $('#ed-couleur').value });
  });
  function poserImageBibliotheque(t, lieu) {
    const item = t.image;
    const id = `b${item.id}`;
    if (!etat.images.has(id)) etat.images.set(id, { octets: item.octets, mime: item.mime, l: item.l, h: item.h, url: URL.createObjectURL(new Blob([item.octets], { type: item.mime })) });
    const w = Math.min(0.3, (item.largeurPage || 0.25)), h = w * (item.h / item.l) * (ed.L / ed.H);
    nouvelElement('image', { image: id, x: Math.max(0, Math.min(1 - w, lieu.x - w / 2)), y: Math.max(0, Math.min(1 - h, lieu.y - h / 2)), w, h });
    choisirOutil('selection');
    dessinerCalque();
  }
  async function memoriserImage() {
    const e = ed.elements[ed.choisi];
    if (!e || e.type !== 'image') return;
    const img = etat.images.get(e.image);
    if (!img) return;
    const nom = prompt('Nom de cette image dans la bibliothèque (ex. « Signature C. Vert », « Tampon société ») :', 'Signature');
    if (!nom) return;
    try {
      await Stockage.ajouterBibliotheque({ id: nouvelId('b'), nom: nom.trim(), octets: img.octets, mime: img.mime, l: img.l, h: img.h, largeurPage: e.w, date: Date.now() });
      note(`« ${nom} » mémorisée : retrouvez-la dans « Tampon ».`, 'ok');
    } catch (err) { note(`Mémorisation impossible : ${err.message || err}`, 'erreur'); }
  }

  function supprimerElement() {
    if (ed.choisi == null) return;
    edMemo();
    ed.elements.splice(ed.choisi, 1);
    ed.choisi = null;
    dessinerCalque();
  }
  function dupliquerElement() {
    const e = ed.elements[ed.choisi];
    if (!e) return;
    edMemo();
    const c = structuredClone(e);
    deplacerElement(c, structuredClone(e), 15 / ed.L, 15 / ed.H);
    ed.elements.push(c);
    ed.choisi = ed.elements.length - 1;
    dessinerCalque();
  }
  // Réglage modifié : appliqué à l'élément choisi et retenu pour l'outil
  function regler(cle, valeur) {
    const e = ed.elements[ed.choisi];
    const type = e ? e.type : ed.outil;
    if (reglages[type]) { reglages[type][cle] = valeur; sauverReglages(); }
    if (!e) return;
    if (cle === 'couleur' && ['masque', 'caviarde', 'image'].includes(e.type)) return;
    if (cle === 'taille' && !['texte', 'bulle', 'texteModifie'].includes(e.type)) return;
    if (cle === 'gras' && !['texte', 'bulle', 'texteModifie'].includes(e.type)) return;
    if ((cle === 'police' || cle === 'italique') && e.type !== 'texteModifie') return;
    if (cle === 'epaisseur' && !['ligne', 'fleche', 'crayon', 'cadre', 'ellipse', 'bulle'].includes(e.type)) return;
    if (!ed.reglageEnCours) { edMemo(); ed.reglageEnCours = true; }
    e[cle] = valeur;
    dessinerCalque();
  }
  ['ed-couleur', 'ed-epaisseur', 'ed-taille'].forEach(id => $(`#${id}`).addEventListener('change', () => { ed.reglageEnCours = false; }));
  $('#ed-outils').addEventListener('click', ev => { const b = ev.target.closest('button[data-outil]'); if (b) choisirOutil(b.dataset.outil); });
  $('#ed-couleur').addEventListener('input', () => regler('couleur', $('#ed-couleur').value));
  $('#ed-epaisseur').addEventListener('input', () => regler('epaisseur', Number($('#ed-epaisseur').value) || 2));
  $('#ed-taille').addEventListener('input', () => regler('taille', Number($('#ed-taille').value) || 12));
  $('#ed-gras').addEventListener('change', () => { ed.reglageEnCours = false; regler('gras', $('#ed-gras').checked); });
  $('#ed-police').addEventListener('change', () => { ed.reglageEnCours = false; regler('police', $('#ed-police').value); });
  $('#ed-italique').addEventListener('change', () => { ed.reglageEnCours = false; regler('italique', $('#ed-italique').checked); });
  $('#ed-suppr').addEventListener('click', supprimerElement);
  $('#ed-dupl').addEventListener('click', dupliquerElement);
  $('#ed-caviarder').addEventListener('click', caviarderRecherche);
  $('#ed-tampon').addEventListener('click', ouvrirTampons);
  $('#ed-memoriser').addEventListener('click', memoriserImage);
  $('#ed-csv').addEventListener('click', exporterMesures);
  $('#ed-fermer').addEventListener('click', fermerEditeur);
  $('#ed-prec').addEventListener('click', () => changerPage(-1));
  $('#ed-suiv').addEventListener('click', () => changerPage(1));
  window.addEventListener('resize', () => { if (ed.page) { finirSaisie(); const els = ed.elements, c = ed.choisi, h = ed.hist; chargerDansEditeur(ed.page).then(() => { ed.elements = els; ed.choisi = c; ed.hist = h; dessinerCalque(); }); } });

  // Raccourcis de l'éditeur
  function toucheEditeur(ev, ctrl, touche) {
    if (ctrl && touche === 'z') { ev.preventDefault(); edAnnuler(); return; }
    if (ctrl && touche === 'd') { ev.preventDefault(); dupliquerElement(); return; }
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); supprimerElement(); return; }
    if (ev.key === 'Enter' && ed.trace) { terminerTrace(); return; }
    if (ev.key === 'Escape' && ed.trace) { terminerTrace(); return; }
    if (ev.key === 'Escape' && !$('#ed-tampons').hidden) { $('#ed-tampons').hidden = true; return; }
    if (ev.key === 'Escape') { if (ed.outil !== 'selection') choisirOutil('selection'); else if (ed.choisi != null) choisirElement(null); else fermerEditeur(); return; }
    if (ev.key === 'PageDown') { changerPage(1); return; }
    if (ev.key === 'PageUp') { changerPage(-1); return; }
    const fleches = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (fleches[ev.key] && ed.choisi != null) {
      ev.preventDefault();
      const pas = ev.shiftKey ? 10 : 1;
      const e = ed.elements[ed.choisi];
      edMemo();
      deplacerElement(e, structuredClone(e), fleches[ev.key][0] * pas / ed.L, fleches[ev.key][1] * pas / ed.H);
      dessinerCalque();
      return;
    }
    if (ctrl || ev.altKey) return;
    const outils = { v: 'selection', t: 'texte', b: 'bulle', l: 'ligne', f: 'fleche', r: 'cadre', e: 'ellipse', c: 'crayon', s: 'surligne', m: 'masque', x: 'caviarde', i: 'image' };
    if (outils[touche]) choisirOutil(outils[touche]);
  }

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
  $('#b-ocr').onclick = () => reconnaitre();
  $('#b-projet').onclick = ev => { ev.stopPropagation(); $('#menu-projet').hidden = !$('#menu-projet').hidden; };
  document.addEventListener('click', ev => { if (!ev.target.closest('.menu')) $('#menu-projet').hidden = true; });
  $('#m-nouveau').onclick = () => { $('#menu-projet').hidden = true; nouveauTravail(); };
  $('#m-ouvrir').onclick = () => { $('#menu-projet').hidden = true; ouvrirFichiers(); };
  $('#m-enregistrer').onclick = () => { $('#menu-projet').hidden = true; enregistrerProjet(); };
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
      if (saisie) { if (ev.key === 'Escape') { document.activeElement.blur(); choisirOutil('selection'); } return; }
      toucheEditeur(ev, ctrl, touche);
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

  window.addEventListener('beforeunload', ev => { if (etat.pages.length && sauvegardeEnAttente) { ev.preventDefault(); ev.returnValue = ''; } });

  chargerOptions();
  sauverOptions();
  rafraichir();
  // Ouvert avec des fichiers : on les affiche ; sinon, proposition de reprendre le travail laissé
  ouvrirFichiersTransmis().then(ouverts => { if (!ouverts) proposerReprise(); });
  // Accès pour les tests automatisés
  window.AtelierPDF = { etat, importer, produire, options };
})();
