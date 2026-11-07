  // ---------- Éditeur de page (annotations) ----------
  // Éléments (coordonnées en fractions de la page affichée) :
  //  texte {x,y,texte,taille,couleur,gras} · bulle {x,y,w,h,px,py,texte,taille,couleur}
  //  ligne / fleche {x1,y1,x2,y2,couleur,epaisseur} · crayon {points,couleur,epaisseur}
  //  cadre / ellipse {x,y,w,h,couleur,epaisseur} · surligne / masque / caviarde {x,y,w,h} · image {x,y,w,h,image}
  //  tampon {x,y,w,h,texte,ligne2,couleur} · cote {x1,y1,x2,y2} · longueur / surface {points} (+ etiquette calculée)
  //  compte {points, symbole, reseau} · legende {x,y,w,h,titre,lignes (calculées)} ; mesures et comptages : reseau, dn
  const BOITES = ['masque', 'surligne', 'cadre', 'caviarde', 'ellipse', 'bulle', 'image', 'tampon', 'zoneEchelle', 'legende'];
  const EN_SVG = ['ligne', 'fleche', 'crayon', 'ellipse', 'bulle', 'tampon', 'cote', 'longueur', 'surface', 'angle', 'compte', 'legende'];
  const SANS_DIV = ['ligne', 'fleche', 'crayon', 'ellipse', 'cote', 'longueur', 'surface', 'angle', 'texteModifie', 'compte'];
  const MESURES = ['cote', 'longueur', 'surface', 'angle'];
  // Outils qui s'accrochent aux traits du plan (extrémités, puis traits)
  const ACCROCHE = ['cote', 'longueur', 'surface', 'angle', 'etalonner', 'ligne', 'fleche'];
  const A_TRACER = ['masque', 'surligne', 'cadre', 'caviarde', 'ellipse', 'bulle', 'zoneEchelle'];
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ed = { page: null, elements: [], outil: 'selection', choisi: null, ech: 1, L: 0, H: 0, hist: [], point: null, trace: null, tampon: null, lignes: null };
  const reglages = {
    texte: { couleur: '#000000', taille: 12 }, bulle: { couleur: '#1565c0', taille: 11 },
    ligne: { couleur: '#d32f2f', epaisseur: 2 }, fleche: { couleur: '#d32f2f', epaisseur: 2 }, crayon: { couleur: '#1565c0', epaisseur: 2 },
    cadre: { couleur: '#d32f2f', epaisseur: 2 }, ellipse: { couleur: '#d32f2f', epaisseur: 2 }, surligne: { couleur: '#ffeb3b' },
    cote: { couleur: '#e65100', epaisseur: 1.5 }, longueur: { couleur: '#e65100', epaisseur: 2 }, surface: { couleur: '#6a1b9a', epaisseur: 1.5 }, angle: { couleur: '#00838f', epaisseur: 1.5 },
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
    majVignettesEditeur();
    $('#ed-scene').scrollTo(0, 0);
    await afficherPage();
    afficherChamps();
    // Page pdf.js (polices chargées par l'affichage : nom, gras, italique pour « Modifier le texte »)
    ed.pagePdfjs = p.type === 'pdf' ? await (await etat.sources.get(p.source).doc).getPage(p.index + 1) : null;
    if (ed.outil === 'editertexte') preparerLignes();
  }

  // ----- Zoom de la page -----
  // ed.zoom : 'page' (page entière), 'largeur' (pleine largeur) ou un facteur (1 = taille réelle : 1 pt = 96/72 pixel)
  const ZOOM_MIN = 0.1, ZOOM_MAX = 8, PX_PAR_PT = 96 / 72;
  const PIXELS_MAX = 36e6; // au-delà, la page est dessinée moins finement (mémoire, rapidité)
  ed.zoom = 'page';
  function largeurVoulue() {
    const scene = $('#ed-scene');
    const d = dims(ed.page);
    if (ed.zoom === 'largeur') return Math.max(200, scene.clientWidth - 40);
    if (ed.zoom === 'page') return Math.max(200, Math.min(scene.clientWidth - 40, (scene.clientHeight - 40) * d.l / d.h));
    return d.l * PX_PAR_PT * ed.zoom;
  }
  const zoomEffectif = () => ed.L / (dims(ed.page).l * PX_PAR_PT);
  // Taille et calque mis à jour tout de suite ; dessin net de la page un instant après (zoom à la molette fluide)
  let minuterieRendu = null, numeroRendu = 0;
  function appliquerTaille(largeur) {
    const d = dims(ed.page);
    ed.ech = largeur / d.l;
    ed.L = Math.round(d.l * ed.ech); ed.H = Math.round(d.h * ed.ech);
    const c = $('#ed-canvas');
    c.style.width = `${ed.L}px`; c.style.height = `${ed.H}px`;
    $('#ed-page').style.width = `${ed.L}px`;
    $('#ed-page').style.height = `${ed.H}px`;
    $('#ed-page').style.setProperty('--ech', ed.ech);
    dessinerCalque();
    majAffichageZoom();
  }
  async function dessinerNet() {
    const p = ed.page, n = ++numeroRendu;
    const d = dims(p);
    const dpr = window.devicePixelRatio || 1;
    const resolution = Math.min(dpr, Math.sqrt(PIXELS_MAX / (d.l * ed.ech * d.h * ed.ech)));
    // Dessin dans un canvas à part, recopié à la fin : un nouveau zoom pendant le dessin ne le perturbe pas
    const tmp = document.createElement('canvas');
    await rendrePage(p, tmp, ed.L, resolution);
    if (n !== numeroRendu || ed.page !== p) return;
    const c = $('#ed-canvas');
    c.width = tmp.width; c.height = tmp.height;
    c.getContext('2d').drawImage(tmp, 0, 0);
    tmp.width = tmp.height = 0;
    c.style.width = `${ed.L}px`; c.style.height = `${ed.H}px`;
  }
  async function afficherPage() {
    finirSaisie();
    clearTimeout(minuterieRendu);
    appliquerTaille(largeurVoulue());
    await dessinerNet();
  }
  // Zoom autour d'un point de l'écran (souris) ou du centre de la vue
  function zoomer(nouveau, ecranX = null, ecranY = null) {
    if (!ed.page) return;
    finirSaisie();
    const scene = $('#ed-scene');
    const rs = scene.getBoundingClientRect();
    const ex = ecranX ?? rs.left + scene.clientWidth / 2, ey = ecranY ?? rs.top + scene.clientHeight / 2;
    const rp = $('#ed-page').getBoundingClientRect();
    const fx = (ex - rp.left) / rp.width, fy = (ey - rp.top) / rp.height;
    ed.zoom = typeof nouveau === 'number' ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nouveau)) : nouveau;
    appliquerTaille(largeurVoulue());
    // Le point visé reste sous la souris
    const rp2 = $('#ed-page').getBoundingClientRect();
    scene.scrollLeft += rp2.left + fx * rp2.width - ex;
    scene.scrollTop += rp2.top + fy * rp2.height - ey;
    clearTimeout(minuterieRendu);
    minuterieRendu = setTimeout(dessinerNet, 180);
  }
  const PALIERS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
  function zoomPalier(sens, x, y) {
    const z = zoomEffectif();
    const suivant = sens > 0 ? PALIERS.find(v => v > z * 1.01) ?? ZOOM_MAX : [...PALIERS].reverse().find(v => v < z * 0.99) ?? ZOOM_MIN;
    zoomer(suivant, x, y);
  }
  function majAffichageZoom() {
    const sel = $('#ed-zoom');
    const pct = Math.round(zoomEffectif() * 100);
    sel.querySelector('option[value=actuel]').textContent = `${pct} %`;
    sel.value = typeof ed.zoom === 'number' && PALIERS.some(v => Math.abs(v - ed.zoom) < 1e-6) ? String(ed.zoom) : (typeof ed.zoom === 'string' ? ed.zoom : 'actuel');
  }
  $('#ed-zoom').addEventListener('change', () => {
    const v = $('#ed-zoom').value;
    if (v !== 'actuel') zoomer(v === 'page' || v === 'largeur' ? v : Number(v));
  });
  $('#ed-zoom-moins').addEventListener('click', () => zoomPalier(-1));
  $('#ed-zoom-plus').addEventListener('click', () => zoomPalier(1));
  // Ctrl + molette (ou pincement du pavé tactile) : zoom autour de la souris, sans zoomer toute la fenêtre
  $('#ed-scene').addEventListener('wheel', ev => {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    const facteur = Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0025));
    zoomer(zoomEffectif() * facteur, ev.clientX, ev.clientY);
  }, { passive: false });
  // Déplacer la page agrandie : glisser avec le bouton du milieu, ou en maintenant la barre d'espace
  let espace = false;
  document.addEventListener('keydown', ev => {
    if (ev.code === 'Space' && !$('#editeur').hidden && !document.activeElement?.isContentEditable && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) {
      ev.preventDefault();
      if (!espace) { espace = true; $('#ed-scene').classList.add('main'); }
    }
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') { espace = false; $('#ed-scene').classList.remove('main'); } });
  $('#ed-scene').addEventListener('pointerdown', ev => {
    if (!(ev.button === 1 || (ev.button === 0 && espace))) return;
    ev.preventDefault();
    ev.stopPropagation();
    const scene = $('#ed-scene');
    const x0 = ev.clientX, y0 = ev.clientY, sl = scene.scrollLeft, st = scene.scrollTop;
    scene.setPointerCapture(ev.pointerId);
    scene.classList.add('glisse');
    const bouger = m => { scene.scrollLeft = sl - (m.clientX - x0); scene.scrollTop = st - (m.clientY - y0); };
    const fin = () => { scene.removeEventListener('pointermove', bouger); scene.removeEventListener('pointerup', fin); scene.classList.remove('glisse'); };
    scene.addEventListener('pointermove', bouger);
    scene.addEventListener('pointerup', fin);
  }, true);
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
    const i = etat.pages.indexOf(ed.page) + sens;
    if (etat.pages[i]) allerA(etat.pages[i]);
  }
  function allerA(p) {
    if (p === ed.page) return Promise.resolve();
    validerEditeur();
    etat.selection = new Set([p.id]);
    rafraichir();
    return chargerDansEditeur(p);
  }
  // Numéro de page et flèches (la page courante peut avoir changé de place)
  function majNavigation() {
    if (!ed.page) return;
    const i = etat.pages.indexOf(ed.page);
    $('#ed-num').textContent = `Page ${i + 1} / ${etat.pages.length}`;
    $('#ed-prec').disabled = i <= 0;
    $('#ed-suiv').disabled = i >= etat.pages.length - 1;
  }

  // ----- Vignettes des pages, à gauche de la vue d'une page -----
  const colonne = $('#ed-vignettes');
  const vgCartes = new Map();
  const TAILLE_VG = 128;
  try { colonne.hidden = localStorage.getItem('atelierpdf.vignettes') === '0'; } catch { /* rien */ }
  const cleVg = p => `${p.type}|${p.source}|${p.index}|${rotTotale(p)}|${JSON.stringify(p.elements)}|${etat.sources.get(p.source)?.champsV || 0}`;
  const obsVg = new IntersectionObserver(entrees => entrees.forEach(en => {
    en.target.visible = en.isIntersecting;
    if (en.isIntersecting && en.target.sale) demanderVg(en.target);
  }), { root: colonne, rootMargin: '300px' });
  const fileVg = new Set();
  let vgActif = false;
  function demanderVg(div) { fileVg.add(div); if (!vgActif) pomperVg(); }
  async function pomperVg() {
    vgActif = true;
    while (fileVg.size) {
      const div = fileVg.values().next().value;
      fileVg.delete(div);
      if (!div.isConnected || !div.sale) continue;
      const p = etat.pages.find(x => x.id === div.dataset.id);
      if (!p) continue;
      const k = cleVg(p);
      div.sale = false;
      try {
        const c = document.createElement('canvas');
        const d = dims(p);
        const { ech, dpr } = await rendrePage(p, c, d.h > d.l ? TAILLE_VG * d.l / d.h : TAILLE_VG);
        await dessinerElements(p, c, ech, dpr);
        if (cleVg(p) !== k) { div.sale = true; fileVg.add(div); continue; }
        div.querySelector('.boite-vg').replaceChildren(c);
      } catch (e) { console.error(e); }
    }
    vgActif = false;
  }
  function majVignettesEditeur() {
    if ($('#editeur').hidden || !ed.page) return;
    majNavigation();
    if (colonne.hidden) return;
    const presents = new Set(etat.pages.map(p => p.id));
    for (const [id, div] of vgCartes) if (!presents.has(id)) { obsVg.unobserve(div); div.remove(); vgCartes.delete(id); }
    etat.pages.forEach((p, i) => {
      let div = vgCartes.get(p.id);
      if (!div) {
        div = document.createElement('div');
        div.className = 'vg';
        div.dataset.id = p.id;
        div.draggable = true;
        div.innerHTML = '<div class="boite-vg"></div><div class="nom-vg"></div>';
        vgCartes.set(p.id, div);
        obsVg.observe(div);
      }
      const s = etat.sources.get(p.source);
      div.querySelector('.nom-vg').textContent = `${i + 1}${s ? ` · ${s.nom}` : p.titre ? ` · ${p.titre}` : ''}`;
      div.title = div.querySelector('.nom-vg').textContent;
      div.classList.toggle('courante', p === ed.page);
      const k = cleVg(p);
      if (div.dataset.cle !== k) {
        div.dataset.cle = k;
        div.sale = true;
        const boite = div.querySelector('.boite-vg');
        if (!boite.firstChild) {
          const d = dims(p);
          const l = d.h > d.l ? TAILLE_VG * d.l / d.h : TAILLE_VG;
          const att = document.createElement('div');
          att.className = 'attente';
          att.style.cssText = `width:${l}px;height:${l * d.h / d.l}px`;
          boite.appendChild(att);
        }
        if (div.visible) demanderVg(div);
      }
      if (colonne.children[i] !== div) colonne.insertBefore(div, colonne.children[i] || null);
    });
    const courante = vgCartes.get(ed.page.id);
    if (courante) {
      const r = courante.getBoundingClientRect(), rc = colonne.getBoundingClientRect();
      if (r.top < rc.top || r.bottom > rc.bottom) courante.scrollIntoView({ block: 'nearest' });
    }
  }
  colonne.addEventListener('click', ev => {
    const div = ev.target.closest('.vg');
    const p = div && etat.pages.find(x => x.id === div.dataset.id);
    if (p) allerA(p);
  });
  $('#ed-vignettes-bascule').addEventListener('click', () => {
    colonne.hidden = !colonne.hidden;
    try { localStorage.setItem('atelierpdf.vignettes', colonne.hidden ? '0' : '1'); } catch { /* rien */ }
    majVignettesEditeur();
    afficherPage();
  });
  // Glisser-déposer : déplacer une page, ou insérer des fichiers venus de l'Explorateur
  let vgGlissee = null, vgMarque = null;
  const effacerVgMarque = () => { if (vgMarque) vgMarque.classList.remove('avant', 'apres'); vgMarque = null; };
  function indexDepotVg(ev) {
    const divs = [...colonne.querySelectorAll('.vg')];
    if (!divs.length) return { index: 0 };
    let cible = divs[divs.length - 1];
    for (const d of divs) { const r = d.getBoundingClientRect(); if (ev.clientY < r.bottom) { cible = d; break; } }
    const r = cible.getBoundingClientRect();
    const apres = ev.clientY > r.top + r.height / 2;
    return { index: divs.indexOf(cible) + (apres ? 1 : 0), cible, apres };
  }
  colonne.addEventListener('dragstart', ev => {
    const div = ev.target.closest('.vg');
    if (!div) return;
    vgGlissee = div.dataset.id;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', 'page');
    requestAnimationFrame(() => div.classList.add('glisse'));
  });
  colonne.addEventListener('dragend', () => { colonne.querySelectorAll('.glisse').forEach(d => d.classList.remove('glisse')); vgGlissee = null; effacerVgMarque(); colonne.classList.remove('survol'); });
  colonne.addEventListener('dragover', ev => {
    const fichiers = ev.dataTransfer.types.includes('Files');
    if (!vgGlissee && !fichiers) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = fichiers ? 'copy' : 'move';
    colonne.classList.toggle('survol', fichiers);
    const d = indexDepotVg(ev);
    if (d.cible && (vgMarque !== d.cible || vgMarque.classList.contains('apres') !== d.apres)) {
      effacerVgMarque();
      vgMarque = d.cible;
      vgMarque.classList.add(d.apres ? 'apres' : 'avant');
    }
  });
  colonne.addEventListener('dragleave', ev => { if (!colonne.contains(ev.relatedTarget)) { effacerVgMarque(); colonne.classList.remove('survol'); } });
  colonne.addEventListener('drop', ev => {
    ev.preventDefault();
    const d = indexDepotVg(ev);
    effacerVgMarque();
    colonne.classList.remove('survol');
    validerEditeur();
    if (ev.dataTransfer.files && ev.dataTransfer.files.length) importer(ev.dataTransfer.files, d.index);
    else if (vgGlissee) deplacer(new Set([vgGlissee]), d.index);
  });
  // Fichiers déposés sur la page affichée : insérés juste après elle
  $('#ed-scene').addEventListener('dragover', ev => { if (ev.dataTransfer.types.includes('Files')) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; } });
  $('#ed-scene').addEventListener('drop', ev => {
    if (!ev.dataTransfer.files || !ev.dataTransfer.files.length) return;
    ev.preventDefault();
    validerEditeur();
    importer(ev.dataTransfer.files, etat.pages.indexOf(ed.page) + 1);
  });

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
    $('#ed-page').classList.toggle('outil-actif', o !== 'selection');
    calque.classList.toggle('ecrit', o === 'texte');
    if (reglages[o]) majReglagesAffiches(reglages[o]);
    majZoneMetre();
    if (o === 'image') { $('#fichier-image').click(); }
    if (o === 'editertexte') preparerLignes();
    else if (ed.lignes) dessinerCalque();
    if (ACCROCHE.includes(o)) preparerAccroche();
    else $('#ed-accroche').hidden = true;
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
    if (e.type === 'legende') {
      for (const lg of MoteurPDF.lignesLegende(e, ed.L, ed.H, ed.ech)) {
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', lg.x);
        t.setAttribute('y', lg.y + lg.taille * 0.94);
        t.setAttribute('font-size', lg.taille);
        t.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
        t.setAttribute('font-weight', lg.gras ? 'bold' : 'normal');
        t.setAttribute('fill', '#212121');
        t.textContent = lg.texte;
        svg.appendChild(t);
      }
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
      d.className = et.sansCadre ? 'el-etiquette el-numero' : 'el-etiquette';
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
      if (MESURES.includes(e.type) || e.type === 'compte') noeuds.push(...noeudsEtiquettes(e, i));
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
          if (e.type === 'zoneEchelle') d.dataset.libelle = `Zone ${e.echelle ? (e.echelle.libelle || 'étalonnée') : 'sans échelle'}`;
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
        if ((e.type === 'longueur' || e.type === 'surface' || (e.type === 'compte' && ed.outil === 'selection')) && ed.trace !== e) e.points.forEach(([x, y], k) => noeuds.push(poignee(`v${k}`, x, y)));
        if (e.type === 'bulle') { const p = poignee('pointe', e.px, e.py); p.classList.add('pointe'); noeuds.push(p); }
      }
    });
    if (ed.outil === 'editertexte' && ed.lignes) noeuds.push(...noeudsLignes());
    noeuds.push(...noeudsResultats());
    calque.replaceChildren(...noeuds);
    calque.querySelectorAll('.el-texte, .el-texteModifie').forEach(d => d.classList.toggle('choisi', Number(d.dataset.i) === ed.choisi));
    majProprietes();
    majRecapMesures();
  }
  function majProprietes() {
    const e = ed.elements[ed.choisi];
    $('#ed-suppr').disabled = $('#ed-dupl').disabled = !e;
    $('#ed-memoriser').hidden = !(e && e.type === 'image');
    majZoneMetre();
    if (!e) return;
    majReglagesAffiches(e);
  }
  function choisirElement(i) { ed.choisi = i; dessinerCalque(); }
