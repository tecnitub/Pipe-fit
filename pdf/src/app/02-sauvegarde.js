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
      sources.push({ id: s.id, nom: s.nom, type: s.type, mime: s.mime, couleur: s.couleur, nbPages: s.nbPages, rasteriser: !!s.rasteriser, alerte: s.alerte || '', l: s.l, h: s.h, fichier: cle, champs: s.champs || null, pipefit: s.pipefit || null });
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
      if (m.champs) { s.champs = m.champs; s.champsV = 1; }
      if (m.pipefit) s.pipefit = m.pipefit;
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
