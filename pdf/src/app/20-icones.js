  // ---------- Icônes des barres d'outils ----------
  // Dessins vectoriels simples (24 × 24, trait de 1,8) : nets à toutes les tailles d'écran, même style partout.
  // Un bouton porte data-ico="nom" ; l'icône est insérée devant son libellé.
  const ICONES = {
    projet: '<path d="M3 6.5h6l2 2h10V19H3z"/>',
    ajouter: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M12 11v6M9 14h6"/>',
    blanche: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/>',
    intercalaire: '<path d="M4 5h11v16H4z"/><path d="M15 8h4v5h-4"/><path d="M7 10h5M7 13h3"/>',
    doe: '<path d="M5 4h11a3 3 0 0 1 3 3v14H8a3 3 0 0 1-3-3z"/><path d="M5 18a3 3 0 0 1 3-3h11"/><path d="M9 8h6"/>',
    annuler: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    retablir: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    'pivoter-g': '<path d="M3 4v5h5"/><path d="M3.6 9a9 9 0 1 1 2.6 9"/>',
    'pivoter-d': '<path d="M21 4v5h-5"/><path d="M20.4 9a9 9 0 1 0-2.6 9"/>',
    dupliquer: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V4H4v12h4"/>',
    modifier: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    comparer: '<path d="M8 4 4 8l4 4"/><path d="M4 8h12"/><path d="m16 12 4 4-4 4"/><path d="M20 16H8"/>',
    ocr: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M8 10h8M8 14h5"/>',
    supprimer: '<path d="M4 7h16"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/><path d="M10 11v6M14 11v6"/>',
    extraire: '<path d="M14 4h6v6"/><path d="m20 4-8 8"/><path d="M18 14v6H4V6h6"/>',
    diviser: '<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M8.6 8.6 20 19M8.6 15.4 20 5"/>',
    rechercher: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
    imprimer: '<path d="M6 9V3h12v6"/><path d="M6 18H4v-8h16v8h-2"/><path d="M6 14h12v7H6z"/>',
    plans: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
    aide: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1.9-1.1 1.7v.4"/><path d="M12 17h.01"/>',
    enregistrer: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    // Éditeur de page
    selection: '<path d="M5 3l13 7.5-5.5 1.5L10 18z"/><path d="m13 12 5 6"/>',
    editertexte: '<path d="M3 5h11M8.5 5v12"/><path d="m13 21 .8-3.5 6-6 2.7 2.7-6 6z"/>',
    texte: '<path d="M5 5h14M12 5v14M9 19h6"/>',
    bulle: '<path d="M4 4h16v11H10l-5 4.5V15H4z"/>',
    ligne: '<path d="M5 19 19 5"/>',
    fleche: '<path d="M5 19 19 5"/><path d="M10 5h9v9"/>',
    cadre: '<rect x="4" y="5" width="16" height="14" rx="1"/>',
    ellipse: '<circle cx="12" cy="12" r="8"/>',
    crayon: '<path d="M3 17c2.5-5 4.5-6 6-3s3 3 5-1 4-5 7-3"/>',
    surligne: '<path d="m9 15-3 3H3l2-3"/><path d="m8 13 7-9 4 3-7 9z"/><path d="M12 21h9" stroke-width="3"/>',
    masque: '<path d="M7 20h13"/><path d="m4 15 9-11 7 6-8 10H8z"/><path d="m9 9 6 5"/>',
    zone: '<rect x="3" y="3" width="11" height="9" rx="1" stroke-dasharray="2.5 2"/><path d="M17 12v9M12.5 16.5h9"/><path d="m15 14 2-2 2 2M15 19l2 2 2-2M14.5 14.5l-2 2 2 2M19.5 14.5l2 2-2 2"/>',
    caviarde: '<path d="M3 4.5h12M3 19.5h8"/><rect x="3" y="8.5" width="18" height="7" rx="1" fill="currentColor"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m21 16-5-5-9 9"/>',
    tampon: '<path d="M9 13 8.5 9.5a3.5 3.5 0 1 1 7 0L15 13"/><path d="M5 13h14v4H5z"/><path d="M7 20h10"/>',
    cote: '<path d="M4 12h16M4 7v10M20 7v10"/><path d="m7 9.5-3 2.5 3 2.5M17 9.5l3 2.5-3 2.5"/>',
    longueur: '<path d="m3 17 6-6 4 4 8-8"/><circle cx="3" cy="17" r="1.3" fill="currentColor"/><circle cx="9" cy="11" r="1.3" fill="currentColor"/><circle cx="13" cy="15" r="1.3" fill="currentColor"/><circle cx="21" cy="7" r="1.3" fill="currentColor"/>',
    surface: '<path d="m5 18 2-12 10-2 3 10-8 6z" fill="currentColor" fill-opacity=".2"/>',
    angle: '<path d="M4 20h16M4 20 15 5"/><path d="M10 20a6.5 6.5 0 0 0-2.3-5"/>',
    compte: '<path d="M6 5v14M10 5v14M14 5v14M18 5v14"/><path d="m3.5 15 17-6"/>',
    echelle: '<path d="m3 17 14-14 4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
    legende: '<path d="M10 7h10M10 12h10M10 17h10"/><circle cx="5.5" cy="7" r="1.6" fill="currentColor"/><circle cx="5.5" cy="12" r="1.6" fill="currentColor"/><circle cx="5.5" cy="17" r="1.6" fill="currentColor"/>',
    memoriser: '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>',
    'caviarder-mot': '<circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 6 6"/><rect x="6.5" y="8.5" width="7" height="3" fill="currentColor"/>',
    excel: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9.5h18M3 14.5h18M9 4v16"/>',
    'zoom-moins': '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5M8 11h6"/>',
    'zoom-plus': '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5M8 11h6M11 8v6"/>',
    vignettes: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16M5 8h2M5 12h2M5 16h2"/>',
    prec: '<path d="m15 5-7 7 7 7"/>',
    suiv: '<path d="m9 5 7 7-7 7"/>',
    termine: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    choisir: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="m8 12 3 3 5-6"/>',
    retirer: '<path d="M6 6l12 12M18 6 6 18"/>',
  };
  function poserIcones(racine = document) {
    racine.querySelectorAll('[data-ico]').forEach(b => {
      if (b.querySelector(':scope > svg.ico')) return;
      b.insertAdjacentHTML('afterbegin', `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONES[b.dataset.ico] || ''}</svg>`);
    });
  }
  poserIcones();
