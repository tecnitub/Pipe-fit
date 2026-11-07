  // ---------- Grille des vignettes ----------
  const grille = $('#grille');
  const cartes = new Map(); // id page -> élément
  let largeurVignette = 170;
  try { largeurVignette = Number(localStorage.getItem('atelierpdf.zoom')) || 170; } catch { /* stockage indisponible */ }
  $('#zoom').value = largeurVignette;

  const cle = p => `${largeurVignette}|${p.type}|${p.source}|${p.index}|${rotTotale(p)}|${JSON.stringify(p.elements)}|${etat.sources.get(p.source)?.champsV || 0}`;

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
    majVignettesEditeur();
    planifierSauvegarde();
  }

  function majBoutons() {
    const n = etat.selection.size;
    document.querySelectorAll('.barre button.sel').forEach(b => { b.disabled = !n; });
    $('#b-modifier').disabled = n !== 1 && !(n === 0 && etat.pages.length === 1);
    $('#b-enregistrer').disabled = $('#b-diviser').disabled = $('#b-ocr').disabled = $('#m-enregistrer').disabled = $('#b-imprimer').disabled = $('#b-rechercher').disabled = !etat.pages.length;
    invaliderRecherche();
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
  const champsOptions = ['o-titre', 'o-auteur', 'o-sommaire', 'o-signets', 'o-aplatir', 'o-editable', 'o-commentaires', 'o-num', 'o-num-format', 'o-num-position', 'o-num-taille', 'o-num-debut', 'o-num-ignorer',
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
      commentaires: $('#o-commentaires').checked,
      donneesDocument: lireOptionsBrutes(),
    };
  }
  document.querySelector('.cote').addEventListener('input', ev => { if (ev.target.id && ev.target.id.startsWith('o-')) sauverOptions(); });
  document.querySelector('.cote').addEventListener('change', ev => { if (ev.target.id && ev.target.id.startsWith('o-')) sauverOptions(); });
