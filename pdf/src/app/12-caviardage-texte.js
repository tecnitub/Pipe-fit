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
    } else note('Cliquez sur une ligne pour la corriger (Maj+clic : tout le paragraphe). À l\'enregistrement, l\'ancien texte est retiré du fichier.');
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
    if (e.paragraphe) {
      // Paragraphe : retour à la ligne automatique, interligne d'origine (ligne de base de la 1re ligne conservée)
      const il = e.paragraphe.interligne * ed.ech;
      Object.assign(t.style, { width: `${e.paragraphe.largeur * ed.L}px`, whiteSpace: 'pre-wrap', lineHeight: `${il}px`, top: `${e.base * ed.H - taille * 0.94 - (il - taille * 1.2) / 2}px` });
    }
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
      // Les pixels les plus éloignés du fond (cœur des lettres, sans le lissage des bords)
      const sel = dist.slice(0, Math.max(3, Math.floor(dist.length * 0.005)));
      if (sel[0] && sel[0][0] > 60) {
        const moy = [0, 1, 2].map(o => sel.reduce((a, [, k]) => a + px[k + o], 0) / sel.length);
        // Gris très foncé et neutre : c'est du noir adouci par l'affichage
        couleur = Math.max(...moy) < 60 && Math.max(...moy) - Math.min(...moy) < 12 ? '#000000' : rvb(...moy);
      }
    } catch { /* lecture impossible : noir sur blanc */ }
    return { police, gras, italique: ital, couleur, fond };
  }
  const rvb = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  // Paragraphe : lignes voisines de même police et taille, alignées à gauche, à interligne régulier
  function paragrapheDe(n) {
    const d = dims(ed.page);
    const L = ed.lignes;
    const ref = L[n];
    const proches = (a, b) => a.police === b.police && Math.abs(a.taille - b.taille) < 0.12 * a.taille && Math.abs(a.zone.x - b.zone.x) * d.l < 3;
    const ordre = L.map((l, i) => i).filter(i => proches(L[i], ref)).sort((a, b) => L[a].base - L[b].base);
    let k = ordre.indexOf(n);
    let haut = k, bas = k, pas = null;
    const ok = (i, j) => {
      const e = (L[ordre[j]].base - L[ordre[i]].base) * d.h;
      if (e < ref.taille * 0.95 || e > ref.taille * 1.9) return false;
      if (pas && Math.abs(e - pas) > pas * 0.15) return false;
      pas = pas || e;
      return true;
    };
    while (bas + 1 < ordre.length && ok(bas, bas + 1)) bas++;
    while (haut - 1 >= 0 && ok(haut - 1, haut)) haut--;
    return { lignes: ordre.slice(haut, bas + 1).map(i => L[i]), interligne: pas || ref.taille * 1.2 };
  }
  function modifierParagraphe(n) {
    const { lignes, interligne } = paragrapheDe(n);
    if (lignes.length < 2) { modifierLigne(ed.lignes[n]); return; }
    const x0 = Math.min(...lignes.map(l => l.zone.x)), y0 = Math.min(...lignes.map(l => l.zone.y));
    const x1 = Math.max(...lignes.map(l => l.zone.x + l.zone.w)), y1 = Math.max(...lignes.map(l => l.zone.y + l.zone.h));
    // Mot coupé en fin de ligne (trait d'union) : recollé
    const texte = lignes.map(l => l.t).reduce((a, t) => (/[a-zà-ÿ]-$/i.test(a) ? a.slice(0, -1) + t : `${a} ${t}`));
    const premiere = lignes[0];
    const st = styleDeLigne({ ...premiere, zone: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
    const e = nouvelElement('texteModifie', { zone: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, x: premiere.x, base: premiere.base, texte, origine: texte,
      taille: Math.round(premiere.taille * 10) / 10, ...st, nouveau: true, paragraphe: { largeur: (x1 - premiere.x) * 1.01, interligne: Math.round(interligne * 100) / 100 } });
    dessinerCalque();
    editerTexte(ed.elements.indexOf(e));
    ed.hist.pop();
    note(`Paragraphe de ${lignes.length} lignes : le texte revient à la ligne tout seul à la largeur d'origine.`);
  }
  async function modifierLigne(l) {
    const st = styleDeLigne(l);
    const e = nouvelElement('texteModifie', { zone: { ...l.zone }, x: l.x, base: l.base, texte: l.t, origine: l.t, taille: Math.round(l.taille * 10) / 10, ...st, nouveau: true });
    dessinerCalque();
    editerTexte(ed.elements.indexOf(e));
    ed.hist.pop();
  }
