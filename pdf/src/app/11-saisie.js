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
    appliquerMetre(e);
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
    let depart = posFraction(ev);
    if (ACCROCHE.includes(ed.outil) && !cible.dataset.poignee) depart = accrocher(depart, ev);
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
          const q = m.shiftKey ? aimanter(fixe, p) : accrocher(p, m);
          if (t === 'p1') { e.x1 = q.x; e.y1 = q.y; } else { e.x2 = q.x; e.y2 = q.y; }
        } else if (t === 'pointe') { e.px = p.x; e.py = p.y; }
        else if (t[0] === 'v') { const q = accrocher(p, m); e.points[Number(t.slice(1))] = [q.x, q.y]; }
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
      if (n >= 0 && ed.lignes[n]) { if (ev.shiftKey && !ed.lignes[n].coins) modifierParagraphe(n); else modifierLigne(ed.lignes[n]); }
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

    // Compter : un clic par symbole (clic sur un repère : le retirer)
    if (ed.outil === 'compte') { clicCompte(depart); return; }

    // Longueur (polyligne) et surface (polygone) : un clic par point, double-clic ou Entrée pour finir
    if (ed.outil === 'longueur' || ed.outil === 'surface' || ed.outil === 'angle') {
      // Double-clic : repéré ici, l'événement « dblclick » se perd quand le tracé est redessiné entre les deux clics
      const avant = ed.dernierClic;
      ed.dernierClic = { t: ev.timeStamp, x: ev.clientX, y: ev.clientY };
      if (ed.trace && avant && ev.timeStamp - avant.t < 450 && Math.hypot(ev.clientX - avant.x, ev.clientY - avant.y) < 6) {
        ed.dernierClic = null;
        terminerTrace();
        return;
      }
      if (!ed.trace) {
        ed.trace = nouvelElement(ed.outil, { points: [[depart.x, depart.y], [depart.x, depart.y]] });
        note(ed.outil === 'angle' ? 'Angle : cliquez le sommet, puis l\'extrémité du second côté.' : 'Cliquez les points suivants ; double-clic (ou Entrée) pour terminer, Échap pour arrêter.');
      } else {
        ed.trace.points[ed.trace.points.length - 1] = [depart.x, depart.y];
        ed.trace.points.push([depart.x, depart.y]);
        // Angle : trois points (côté, sommet, côté)
        if (ed.trace.type === 'angle' && ed.trace.points.length > 3) { ed.trace.points.length = 3; terminerTrace(); return; }
      }
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
      suivre(ev, (p, m) => { const q = m.shiftKey ? aimanter(depart, p) : accrocher(p, m); e.x2 = q.x; e.y2 = q.y; dessinerCalque(); },
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
        if (type === 'zoneEchelle') {
          const rep = prompt('Échelle de cette zone (ex. 1/20 pour un détail) :', '1/20');
          const m = /^\s*1\s*[/:]\s*(\d+(?:[.,]\d+)?)\s*$/.exec(rep || '');
          if (!m) { ed.elements.pop(); ed.choisi = null; ed.hist.pop(); dessinerCalque(); if (rep !== null) note('Échelle non comprise : écrivez par exemple « 1/20 ».', 'erreur'); return; }
          const n = Number(m[1].replace(',', '.'));
          e.echelle = { mmParPt: MM_PAR_PT * n, libelle: `1/${m[1]}` };
          choisirOutil('selection');
          dessinerCalque();
          note(`Zone au ${e.echelle.libelle} : les mesures commencées dans cette zone utilisent cette échelle (zone non imprimée).`, 'ok');
        }
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
