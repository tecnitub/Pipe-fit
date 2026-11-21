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
  $('#b-imprimer').onclick = () => imprimer();
  $('#b-rechercher').onclick = () => ouvrirRecherche();
  $('#ed-imprimer').onclick = () => imprimer();
  $('#ed-rechercher').onclick = () => ouvrirRecherche();
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
  $('#zone').addEventListener('wheel', ev => {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    const z = $('#zoom');
    z.value = Math.min(Number(z.max), Math.max(Number(z.min), Number(z.value) - Math.sign(ev.deltaY) * 20));
    z.dispatchEvent(new Event('input'));
  }, { passive: false });
  $('#zoom').addEventListener('input', () => {
    largeurVignette = Number($('#zoom').value);
    try { localStorage.setItem('atelierpdf.zoom', largeurVignette); } catch { /* rien */ }
    rafraichir();
  });

  document.addEventListener('keydown', ev => {
    const saisie = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    const ctrl = ev.ctrlKey || ev.metaKey;
    const touche = ev.key.toLowerCase();
    // Rechercher et imprimer : partout (sinon le navigateur imprimerait l'écran au lieu du document)
    if (ev.key === 'F1') { ev.preventDefault(); ouvrirAide(); return; }
    if (!$('#aide').hidden) { if (ev.key === 'Escape') $('#aide').hidden = true; return; }
    if (!$('#visite').hidden) { if (ev.key === 'Escape') finirVisite(); return; }
    if (ctrl && touche === 'f' && !ev.shiftKey) { ev.preventDefault(); ouvrirRecherche(); return; }
    if (ctrl && touche === 'p') { ev.preventDefault(); imprimer(); return; }
    if (ev.key === 'F3') { ev.preventDefault(); if ($('#recherche').hidden) ouvrirRecherche(); else resultatSuivant(ev.shiftKey ? -1 : 1); return; }
    if (!$('#editeur').hidden) {
      if (saisie) { if (ev.key === 'Escape') { document.activeElement.blur(); choisirOutil('selection'); } return; }
      toucheEditeur(ev, ctrl, touche);
      return;
    }
    if (!$('#comparaison').hidden) {
      const fl = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
      // Flèches : décaler ; Alt + ←/→ : tourner (0,1°, Maj : 1°) ; Alt + ↑/↓ : échelle (0,1 %, Maj : 1 %)
      if (fl && ev.altKey) { ev.preventDefault(); const pas = ev.shiftKey ? 10 : 1; decalerComparaison(0, 0, fl[0] * 0.1 * pas, -fl[1] * 0.001 * pas); }
      else if (fl) { ev.preventDefault(); const pas = ev.shiftKey ? 10 : 1; decalerComparaison(fl[0] * pas, fl[1] * pas); }
      else if (ev.key === 'Escape') $('#cmp-fermer').click();
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
  ouvrirFichiersTransmis().then(async ouverts => { if (!ouverts) { await proposerReprise(); proposerVisite(); } });
  // Accès pour les tests automatisés
  window.AtelierPDF = { etat, importer, produire, options, ed, choisirElement };
