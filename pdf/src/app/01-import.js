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
    // Document venu d'un chantier Pipe-Fit : on s'en souvient pour y enregistrer le résultat (nouvel indice)
    if (etat.origineImport) s.pipefit = etat.origineImport;
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
