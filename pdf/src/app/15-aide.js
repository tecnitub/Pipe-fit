  // ---------- Aide : « Comment faire ? » (F1) et visite guidée ----------
  // Fiches courtes et recherchables ; « montrer » met en évidence l'élément concerné ou ouvre le bon outil.
  const FICHES = [
    { titre: 'Ajouter des PDF, photos et scans', mots: 'importer ouvrir fichier glisser déposer photo image scan', texte: 'Bouton « ＋ Ajouter des fichiers » (Ctrl+O), ou glissez des fichiers depuis l\'Explorateur dans la fenêtre. Déposés entre deux pages, ils sont insérés à cet endroit.', montrer: '#b-ouvrir' },
    { titre: 'Ouvrir les PDF de l\'ordinateur avec Atelier PDF', mots: 'double-clic ouvrir avec défaut lecteur explorateur', texte: 'Clic droit sur un PDF › Ouvrir avec › Atelier PDF. Pour le double-clic : Ouvrir avec › Choisir une autre application › Atelier PDF › « Toujours ». Plusieurs PDF sélectionnés arrivent dans une seule fenêtre.' },
    { titre: 'Réorganiser, pivoter, supprimer des pages', mots: 'ordre déplacer tourner rotation supprimer dupliquer page blanche intercalaire', texte: 'Glissez les pages pour les déplacer. Sélection : clic, Ctrl+clic, Maj+clic. R / Maj+R : pivoter ; Suppr : supprimer ; Ctrl+D : dupliquer. « Page blanche » et « Intercalaire » s\'insèrent après la sélection. Ctrl+Z annule.', montrer: '#grille' },
    { titre: 'Compiler et enregistrer le PDF', mots: 'enregistrer compiler sommaire signets titre auteur sauver', texte: 'Réglez à gauche le titre, le sommaire, les signets, la numérotation, le filigrane… puis « ⬇ Enregistrer le PDF » (Ctrl+S). Le fichier d\'origine n\'est jamais modifié.', montrer: '#b-enregistrer' },
    { titre: 'Modifier le texte d\'un PDF', mots: 'corriger texte remplacer date prix ligne paragraphe police', texte: 'Double-clic sur la page, outil « ✏️ Modifier le texte », clic sur une ligne et corrigez-la (Maj+clic : tout le paragraphe). L\'ancien texte est retiré du fichier à l\'enregistrement. Scans : OCR d\'abord.', outil: 'editertexte' },
    { titre: 'Annoter : texte, bulle, flèche, carré, surligner', mots: 'annotation commentaire bulle flèche trait cadre cercle crayon surligner texte', texte: 'Double-clic sur la page, puis un outil de la barre. Glissez pour tracer ; double-clic sur un texte pour le corriger ; Échap revient à la sélection. Couleur, épaisseur et taille dans la barre.', outil: 'texte' },
    { titre: 'Tampon (BON POUR EXÉCUTION, VISA…) et signature', mots: 'tampon visa signature signer bon pour exécution approuvé image logo', texte: 'Dans la page : « 🔖 Tampon », choisissez-le puis cliquez sur la page. Signature : insérez-la une fois (outil Image), sélectionnez-la puis « ☆ Mémoriser » ; elle se retrouve ensuite dans « Tampon ».' },
    { titre: 'Caviarder une information confidentielle', mots: 'caviarder masquer noircir confidentiel nom téléphone supprimer rgpd', texte: 'Outil « ■ Caviarder » : la zone noire supprime réellement le contenu dessous. « Caviarder un mot… » le cherche dans tout le document, scans compris. « Masquer », lui, ne fait que cacher.', outil: 'caviarde' },
    { titre: 'Mesurer sur un plan', mots: 'mesure cote longueur surface angle échelle étalonner plan tuyauterie m² détail', texte: 'Dans la page : choisissez l\'échelle (liste « Échelle » ou « Étalonner »), puis Cote, Longueur (un clic par point, double-clic pour finir), Surface ou Angle. Les points s\'accrochent aux traits (Alt : sans). Export : « Mesures (CSV) ».', outil: 'cote' },
    { titre: 'Lire le texte des scans (OCR)', mots: 'ocr scan reconnaissance texte photo interrogeable', texte: 'Bouton « 🔍 OCR » : lit le texte des pages scannées (sélectionnées, ou toutes). Le PDF devient interrogeable et le texte sélectionnable. « Arrêter » garde les pages déjà lues.', montrer: '#b-ocr' },
    { titre: 'Rechercher un mot', mots: 'rechercher chercher trouver ctrl+f', texte: 'Ctrl+F : tapez le mot ; Entrée ou F3 pour le résultat suivant, Maj+Entrée pour le précédent. Les scans sont inclus après l\'OCR.', action: () => ouvrirRecherche() },
    { titre: 'Imprimer', mots: 'imprimer impression imprimante ctrl+p', texte: 'Ctrl+P ou « 🖨 Imprimer » : le document compilé s\'ouvre dans la fenêtre d\'impression de Windows.', montrer: '#b-imprimer' },
    { titre: 'Remplir un formulaire PDF (Cerfa)', mots: 'formulaire cerfa champ remplir cocher', texte: 'Double-clic sur la page : les champs sont encadrés en bleu, cliquez dedans pour écrire ou cocher. À l\'enregistrement, les valeurs sont écrites et le formulaire est figé.' },
    { titre: 'Comparer deux indices d\'un plan', mots: 'comparer comparaison indice différence plan révision superposer', texte: 'Sélectionnez les deux pages (Ctrl+clic), l\'ancienne puis la nouvelle, puis « ⇆ Comparer » : rouge = supprimé, vert = ajouté. Recalage automatique (décalage, rotation, échelle).', montrer: '#b-comparer' },
    { titre: 'Extraire ou diviser', mots: 'extraire diviser découper séparer pages fichiers', texte: '« Extraire » enregistre les pages sélectionnées. « Diviser… » crée plusieurs PDF : par document, par page, toutes les N pages ou selon des plages.', montrer: '#b-diviser' },
    { titre: 'Numéroter, filigrane, sommaire', mots: 'numéro numérotation pagination filigrane copie provisoire sommaire signets', texte: 'Colonne de gauche : « Numéroter les pages », « Filigrane », « Page de sommaire » et « Signets ». Appliqués à l\'enregistrement.', montrer: '.cote' },
    { titre: 'Zoom et vignettes dans la page', mots: 'zoom agrandir loupe vignettes déplacer', texte: 'Dans la page : Ctrl + molette (ou −/+), Ctrl 0 : page entière. Barre d\'espace + glisser pour se déplacer. Vignettes à gauche : clic pour changer de page, glisser pour réordonner.' },
    { titre: 'Sauvegarde, reprise et projets', mots: 'sauvegarde automatique reprendre projet atelierpdf perdu', texte: 'Le travail est sauvegardé automatiquement sur ce PC et proposé à la réouverture. Menu « Projet » : enregistrer ou ouvrir un fichier .atelierpdf (tout le travail).', montrer: '#b-projet' },
    { titre: 'Documents des chantiers Pipe-Fit', mots: 'pipe-fit chantier serveur indice document doe', texte: 'Menu « Projet » › Connexion à Pipe-Fit (adresse, identifiant, mot de passe), puis « Ouvrir un document d\'un chantier » ou « Enregistrer dans un chantier » (nouveau document ou nouvel indice).', montrer: '#b-projet' },
    { titre: 'Annotations visibles dans Acrobat', mots: 'acrobat commentaires annotations collègues', texte: 'Cochez « Annotations en commentaires (Acrobat) » à gauche : vos annotations deviennent des commentaires PDF que vos collègues voient, déplacent ou suppriment.', montrer: '#o-commentaires' },
    { titre: 'Raccourcis clavier', mots: 'raccourci clavier touche', texte: 'Ctrl+O ajouter · Ctrl+S enregistrer · Ctrl+P imprimer · Ctrl+F rechercher · Ctrl+Z/Y annuler/rétablir · R pivoter · Suppr supprimer · Ctrl+D dupliquer · Entrée ouvrir la page · F1 aide. Dans la page : V T B L F R E C S M X I (outils), Échap, Page préc./suiv.' },
  ];
  function afficherAide(filtre = '') {
    const f = sansAccent(filtre.trim());
    const liste = FICHES.filter(x => !f || sansAccent(`${x.titre} ${x.mots} ${x.texte}`).includes(f));
    $('#aide-liste').replaceChildren(...(liste.length ? liste.map(x => {
      const d = document.createElement('details');
      d.className = 'fiche';
      if (f && liste.length <= 3) d.open = true;
      const s = document.createElement('summary'); s.textContent = x.titre;
      const p = document.createElement('p'); p.textContent = x.texte;
      d.append(s, p);
      if (x.montrer || x.outil || x.action) {
        const b = document.createElement('button');
        b.textContent = x.outil ? 'Ouvrir cet outil' : x.action ? 'Y aller' : 'Montrer';
        b.onclick = () => montrerFiche(x);
        d.appendChild(b);
      }
      return d;
    }) : [Object.assign(document.createElement('p'), { className: 'aide', textContent: 'Aucune fiche : essayez un autre mot (ex. « caviarder », « signature », « échelle »).' })]));
  }
  function ouvrirAide() {
    $('#aide').hidden = false;
    $('#aide-recherche').value = '';
    afficherAide();
    $('#aide-recherche').focus();
  }
  function montrerFiche(x) {
    $('#aide').hidden = true;
    if (x.action) { x.action(); return; }
    if (x.outil) {
      if (!etat.pages.length) { note('Ajoutez d\'abord un document, puis double-cliquez sur une page.', 'erreur'); return; }
      if ($('#editeur').hidden) ouvrirEditeur(etat.selection.size ? [...etat.selection][0] : etat.pages[0].id);
      choisirOutil(x.outil);
      surligner(`[data-outil="${x.outil}"]`);
      return;
    }
    if (!$('#editeur').hidden && !document.querySelector('#editeur').contains(document.querySelector(x.montrer))) $('#ed-fermer').click();
    surligner(x.montrer);
  }
  // Met un élément en évidence quelques secondes
  function surligner(selecteur) {
    const el = document.querySelector(selecteur);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
    el.classList.remove('surbrillance-aide'); void el.offsetWidth;
    el.classList.add('surbrillance-aide');
    setTimeout(() => el.classList.remove('surbrillance-aide'), 3200);
  }
  $('#aide-recherche').addEventListener('input', () => afficherAide($('#aide-recherche').value));
  $('#aide-fermer').onclick = () => { $('#aide').hidden = true; };
  $('#aide-visite').onclick = () => { $('#aide').hidden = true; lancerVisite(); };
  $('#b-aide').onclick = ouvrirAide;
  $('#ed-aide-bouton').onclick = ouvrirAide;

  // Visite guidée (premier lancement, puis à la demande)
  const ETAPES = [
    { cible: '#b-ouvrir', texte: 'Ajoutez vos PDF, photos et scans ici, ou glissez-les depuis l\'Explorateur dans la fenêtre.' },
    { cible: '#zone', texte: 'Les pages s\'affichent ici. Glissez-les pour les réordonner ; double-cliquez sur une page pour l\'annoter, corriger son texte, mesurer, tamponner…' },
    { cible: '.cote', texte: 'Réglages du PDF compilé : titre, sommaire, signets, numérotation, filigrane, commentaires pour Acrobat.' },
    { cible: '#b-enregistrer', texte: 'Enregistrez le PDF compilé (Ctrl+S). Le fichier d\'origine n\'est jamais modifié ; votre travail est aussi sauvegardé automatiquement.' },
    { cible: '#b-projet', texte: 'Menu Projet : enregistrer tout le travail pour le reprendre plus tard, et les documents des chantiers Pipe-Fit.' },
    { cible: '#b-aide', texte: 'Une question ? « Comment faire ? » (F1) explique chaque fonction et vous montre où cliquer.' },
  ];
  let etapeVisite = -1;
  function lancerVisite() { etapeVisite = 0; montrerEtape(); }
  function finirVisite() {
    etapeVisite = -1;
    $('#visite').hidden = true;
    try { localStorage.setItem('atelierpdf.visite', 'vue'); } catch { /* rien */ }
  }
  function montrerEtape() {
    const e = ETAPES[etapeVisite];
    if (!e) { finirVisite(); return; }
    const el = document.querySelector(e.cible);
    const r = el.getBoundingClientRect();
    const fen = $('#visite');
    fen.hidden = false;
    Object.assign($('#visite-cadre').style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
    $('#visite-texte').textContent = e.texte;
    $('#visite-etape').textContent = `${etapeVisite + 1} / ${ETAPES.length}`;
    $('#visite-suivant').textContent = etapeVisite === ETAPES.length - 1 ? 'Terminer' : 'Suivant';
    // Bulle sous la cible, ou au-dessus si la place manque ; dans la fenêtre
    const bulle = $('#visite-bulle');
    const hb = bulle.offsetHeight || 140, lb = bulle.offsetWidth || 340;
    const dessous = r.bottom + 14 + hb < innerHeight;
    bulle.style.top = `${dessous ? r.bottom + 14 : Math.max(10, r.top - hb - 14)}px`;
    bulle.style.left = `${Math.min(innerWidth - lb - 12, Math.max(12, r.left + r.width / 2 - lb / 2))}px`;
    if (r.height > innerHeight * 0.6) { bulle.style.top = `${Math.max(10, r.top + 40)}px`; bulle.style.left = `${Math.min(innerWidth - lb - 12, r.left + 40)}px`; }
    $('#visite-suivant').focus();
  }
  $('#visite-suivant').onclick = () => { etapeVisite++; montrerEtape(); };
  $('#visite-passer').onclick = finirVisite;
  window.addEventListener('resize', () => { if (etapeVisite >= 0) montrerEtape(); });
  // Premier lancement : visite, sauf si l'on ouvre directement un document
  function proposerVisite() {
    let vue = false;
    try { vue = localStorage.getItem('atelierpdf.visite') === 'vue'; } catch { vue = true; }
    if (!vue && $('#editeur').hidden && $('#reprise').hidden) lancerVisite();
  }
