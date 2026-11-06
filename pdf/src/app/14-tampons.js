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
  window.addEventListener('resize', () => { if (ed.page && !$('#editeur').hidden) afficherPage(); });

  // Raccourcis de l'éditeur
  function toucheEditeur(ev, ctrl, touche) {
    if (ctrl && (ev.key === '+' || ev.key === '=' || ev.code === 'NumpadAdd')) { ev.preventDefault(); zoomPalier(1); return; }
    if (ctrl && (ev.key === '-' || ev.code === 'NumpadSubtract')) { ev.preventDefault(); zoomPalier(-1); return; }
    if (ctrl && (ev.key === '0' || ev.code === 'Numpad0')) { ev.preventDefault(); zoomer('page'); return; }
    if (ctrl && ev.key === '1') { ev.preventDefault(); zoomer(1); return; }
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
