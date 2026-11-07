  // ----- Rechercher dans le document (Ctrl+F) -----
  const rech = { texte: '', resultats: [], actuel: -1, numero: 0 };
  function noeudsResultats() {
    if (!rech.resultats.length || $('#recherche').hidden) return [];
    return rech.resultats.map((r, k) => ({ r, k })).filter(x => x.r.page === ed.page).map(({ r, k }) => {
      const d = document.createElement('div');
      d.className = `resultat${k === rech.actuel ? ' actuel' : ''}`;
      Object.assign(d.style, { left: `${r.zone.x * ed.L}px`, top: `${r.zone.y * ed.H}px`, width: `${r.zone.w * ed.L}px`, height: `${r.zone.h * ed.H}px` });
      return d;
    });
  }
  function ouvrirRecherche() {
    if (!etat.pages.length) return;
    if ($('#editeur').hidden) ouvrirEditeur(etat.selection.size ? [...etat.selection][0] : etat.pages[0].id);
    $('#recherche').hidden = false;
    const champ = $('#rech-texte');
    champ.focus();
    champ.select();
  }
  function fermerRecherche() {
    $('#recherche').hidden = true;
    rech.resultats = []; rech.actuel = -1; rech.texte = '';
    $('#rech-compte').textContent = '';
    if (ed.page) dessinerCalque();
  }
  async function lancerRecherche() {
    const brut = $('#rech-texte').value.trim().replace(/\s+/g, ' ');
    const cherche = sansAccent(brut);
    if (cherche === rech.texte && rech.resultats.length) return;
    const n = ++rech.numero;
    rech.texte = cherche; rech.resultats = []; rech.actuel = -1;
    if (!cherche) { $('#rech-compte').textContent = ''; dessinerCalque(); return; }
    $('#rech-compte').textContent = 'Recherche…';
    let sansTexte = 0;
    for (const p of etat.pages) {
      const mots = await motsPourRecherche(p);
      if (n !== rech.numero) return; // une autre recherche a été lancée entre-temps
      if (!mots.length && p.type !== 'blanche') sansTexte++;
      for (const z of chercher(mots, cherche)) rech.resultats.push({ page: p, zone: { x: z.x, y: z.y, w: z.w, h: z.h } });
    }
    // Premier résultat à partir de la page affichée
    const depuis = etat.pages.indexOf(ed.page);
    rech.actuel = rech.resultats.length ? Math.max(0, rech.resultats.findIndex(r => etat.pages.indexOf(r.page) >= depuis)) : -1;
    $('#rech-compte').textContent = rech.resultats.length ? '' : `Aucun résultat${sansTexte ? ` (${sansTexte} page(s) scannée(s) sans texte : 🔍 OCR)` : ''}`;
    await montrerResultat();
  }
  async function montrerResultat() {
    const r = rech.resultats[rech.actuel];
    if (!r) { dessinerCalque(); return; }
    $('#rech-compte').textContent = `${rech.actuel + 1} / ${rech.resultats.length}`;
    if (r.page !== ed.page) await allerA(r.page);
    dessinerCalque();
    // Résultat amené au centre de la vue
    const scene = $('#ed-scene'), rp = $('#ed-page').getBoundingClientRect(), rs = scene.getBoundingClientRect();
    const x = rp.left + (r.zone.x + r.zone.w / 2) * rp.width, y = rp.top + (r.zone.y + r.zone.h / 2) * rp.height;
    scene.scrollLeft += x - (rs.left + scene.clientWidth / 2);
    scene.scrollTop += y - (rs.top + scene.clientHeight / 2);
  }
  async function resultatSuivant(sens) {
    if (!rech.resultats.length || rech.texte !== sansAccent($('#rech-texte').value.trim().replace(/\s+/g, ' '))) return lancerRecherche();
    rech.actuel = (rech.actuel + sens + rech.resultats.length) % rech.resultats.length;
    await montrerResultat();
  }
  let minuterieRecherche = null;
  $('#rech-texte').addEventListener('input', () => { clearTimeout(minuterieRecherche); minuterieRecherche = setTimeout(lancerRecherche, 350); });
  $('#rech-texte').addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); clearTimeout(minuterieRecherche); resultatSuivant(ev.shiftKey ? -1 : 1); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fermerRecherche(); }
  });
  $('#rech-suiv').addEventListener('click', () => resultatSuivant(1));
  $('#rech-prec').addEventListener('click', () => resultatSuivant(-1));
  $('#rech-fermer').addEventListener('click', fermerRecherche);
  // Le texte change quand des pages sont ajoutées, retirées ou tournées : recherche refaite à la demande
  let signaturePages = '';
  function invaliderRecherche() {
    const sig = etat.pages.map(p => `${p.id}:${rotTotale(p)}:${p.ocr ? 1 : 0}`).join(',');
    if (sig !== signaturePages) { signaturePages = sig; rech.texte = ''; }
  }

  // ----- Accroche aux traits du plan (mesures) -----
  // Géométrie vectorielle de la page lue dans les opérations de dessin de pdf.js : extrémités et segments,
  // rangés dans une grille pour une recherche rapide. Alt enfoncé : pas d'accroche.
  const cacheGeometrie = new Map();
  const GRILLE = 64;
  function geometriePage(p) {
    if (p.type !== 'pdf') return Promise.resolve(null);
    const cle = `${p.source}|${p.index}|${rotTotale(p)}`;
    if (!cacheGeometrie.has(cle)) cacheGeometrie.set(cle, (async () => {
      const page = await (await etat.sources.get(p.source).doc).getPage(p.index + 1);
      const vp = page.getViewport({ scale: 1, rotation: rotTotale(p) });
      const liste = await page.getOperatorList();
      const O = pdfjs.OPS;
      const mult = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
      let ctm = [1, 0, 0, 1, 0, 0];
      const pile = [];
      const points = [], segments = [];
      const versPage = (x, y) => { const u = x * ctm[0] + y * ctm[2] + ctm[4], v = x * ctm[1] + y * ctm[3] + ctm[5]; const q = vp.convertToViewportPoint(u, v); return [q[0] / vp.width, q[1] / vp.height]; };
      const MAXSEG = 150000;
      for (let i = 0; i < liste.fnArray.length && segments.length < MAXSEG; i++) {
        const fn = liste.fnArray[i], a = liste.argsArray[i];
        if (fn === O.save) pile.push(ctm);
        else if (fn === O.restore) ctm = pile.pop() || ctm;
        else if (fn === O.transform) ctm = mult(a, ctm);
        else if (fn === O.paintFormXObjectBegin) { pile.push(ctm); if (Array.isArray(a[0]) && a[0].length === 6) ctm = mult(a[0], ctm); }
        else if (fn === O.paintFormXObjectEnd) ctm = pile.pop() || ctm;
        else if (fn === O.constructPath) {
          const ops = a[0], c = a[1];
          let k = 0, cour = null, debut = null;
          for (const op of ops) {
            if (op === O.moveTo) { cour = debut = versPage(c[k], c[k + 1]); k += 2; points.push(cour); }
            else if (op === O.lineTo) { const q = versPage(c[k], c[k + 1]); k += 2; if (cour) segments.push([cour[0], cour[1], q[0], q[1]]); points.push(q); cour = q; }
            else if (op === O.curveTo) { const q = versPage(c[k + 4], c[k + 5]); k += 6; points.push(q); cour = q; }
            else if (op === O.curveTo2 || op === O.curveTo3) { const q = versPage(c[k + 2], c[k + 3]); k += 4; points.push(q); cour = q; }
            else if (op === O.closePath) { if (cour && debut) segments.push([cour[0], cour[1], debut[0], debut[1]]); cour = debut; }
            else if (op === O.rectangle) {
              const [x, y, w, h] = [c[k], c[k + 1], c[k + 2], c[k + 3]]; k += 4;
              const r = [versPage(x, y), versPage(x + w, y), versPage(x + w, y + h), versPage(x, y + h)];
              r.forEach((q, j) => { points.push(q); segments.push([q[0], q[1], r[(j + 1) % 4][0], r[(j + 1) % 4][1]]); });
              cour = debut = r[0];
            }
          }
        }
      }
      // Grille : points et segments par case
      const casesP = new Map(), casesS = new Map();
      const caseDe = (x, y) => `${Math.floor(Math.min(0.9999, Math.max(0, x)) * GRILLE)},${Math.floor(Math.min(0.9999, Math.max(0, y)) * GRILLE)}`;
      points.forEach((q, i) => { if (q[0] < 0 || q[0] > 1 || q[1] < 0 || q[1] > 1) return; const c = caseDe(q[0], q[1]); if (!casesP.has(c)) casesP.set(c, []); casesP.get(c).push(i); });
      segments.forEach((sg, i) => {
        const x0 = Math.floor(Math.max(0, Math.min(sg[0], sg[2])) * GRILLE), x1 = Math.floor(Math.min(0.9999, Math.max(sg[0], sg[2])) * GRILLE);
        const y0 = Math.floor(Math.max(0, Math.min(sg[1], sg[3])) * GRILLE), y1 = Math.floor(Math.min(0.9999, Math.max(sg[1], sg[3])) * GRILLE);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > 300) return; // très longs traits obliques : ignorés pour l'accroche « sur le trait »
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const c = `${x},${y}`; if (!casesS.has(c)) casesS.set(c, []); casesS.get(c).push(i); }
      });
      return { points, segments, casesP, casesS };
    })().catch(e => { console.warn('Géométrie illisible', e); return null; }));
    return cacheGeometrie.get(cle);
  }
  async function preparerAccroche() {
    const p = ed.page;
    if (!p || p.type !== 'pdf') return;
    ed.geometrie = null;
    const g = await geometriePage(p);
    if (ed.page === p) ed.geometrie = g;
  }
  // Point accroché le plus proche (en pixels d'écran) : extrémité, sinon point du trait ; marqueur affiché
  function accrocher(pt, ev) {
    const m = $('#ed-accroche');
    const g = ed.geometrie;
    if (!g || (ev && ev.altKey) || !ACCROCHE.includes(ed.outil)) { m.hidden = true; return pt; }
    const tol = 9; // pixels
    const tx = tol / ed.L, ty = tol / ed.H;
    const cx0 = Math.floor((pt.x - tx) * GRILLE), cx1 = Math.floor((pt.x + tx) * GRILLE), cy0 = Math.floor((pt.y - ty) * GRILLE), cy1 = Math.floor((pt.y + ty) * GRILLE);
    let best = null, dmin = tol;
    for (let x = cx0; x <= cx1; x++) for (let y = cy0; y <= cy1; y++) {
      for (const i of g.casesP.get(`${x},${y}`) || []) {
        const q = g.points[i];
        const d = Math.hypot((q[0] - pt.x) * ed.L, (q[1] - pt.y) * ed.H);
        if (d < dmin) { dmin = d; best = { x: q[0], y: q[1], type: 'extremite' }; }
      }
    }
    if (!best) {
      dmin = tol * 0.7;
      for (let x = cx0; x <= cx1; x++) for (let y = cy0; y <= cy1; y++) {
        for (const i of g.casesS.get(`${x},${y}`) || []) {
          const [x1, y1, x2, y2] = g.segments[i];
          const ax = (x2 - x1) * ed.L, ay = (y2 - y1) * ed.H, lg2 = ax * ax + ay * ay;
          if (!lg2) continue;
          let t = (((pt.x - x1) * ed.L) * ax + ((pt.y - y1) * ed.H) * ay) / lg2;
          t = Math.max(0, Math.min(1, t));
          const px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t;
          const d = Math.hypot((px - pt.x) * ed.L, (py - pt.y) * ed.H);
          if (d < dmin) { dmin = d; best = { x: px, y: py, type: 'trait' }; }
        }
      }
    }
    if (!best) { m.hidden = true; return pt; }
    m.hidden = false;
    m.className = `accroche ${best.type}`;
    m.style.left = `${best.x * ed.L}px`;
    m.style.top = `${best.y * ed.H}px`;
    m.title = best.type === 'extremite' ? 'Extrémité' : 'Sur le trait';
    return { x: best.x, y: best.y };
  }
  calque.addEventListener('pointerleave', () => { $('#ed-accroche').hidden = true; });

  // ----- Mesures sur plan -----
  // Échelle de la page : millimètres réels par point PDF (1 pt = 25,4/72 mm sur le papier)
  const MM_PAR_PT = 25.4 / 72;
  const nombre = (v, dec) => v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const formatLongueur = mm => (mm < 1000 ? `${nombre(mm, 0)} mm` : `${nombre(mm / 1000, 2)} m`);
  const formatSurface = mm2 => `${nombre(mm2 / 1e6, 2)} m²`;
  // Zone d'échelle contenant le premier point de la mesure (détail à une autre échelle sur la même feuille)
  function zoneDe(e, elements) {
    const pt = e.type === 'cote' ? [e.x1, e.y1] : (e.points || [])[e.type === 'angle' ? 1 : 0];
    if (!pt) return null;
    return (elements || []).find(z => z.type === 'zoneEchelle' && z.echelle && pt[0] >= z.x && pt[0] <= z.x + z.w && pt[1] >= z.y && pt[1] <= z.y + z.h) || null;
  }
  function valeurMesure(e, p, elements = p.elements) {
    const d = dims(p);
    if (e.type === 'angle') {
      const [a, o, b] = (e.points || []).map(([x, y]) => [x * d.l, y * d.h]);
      if (!b) return { type: 'angle', deg: 0 };
      let t = Math.abs(Math.atan2(a[1] - o[1], a[0] - o[0]) - Math.atan2(b[1] - o[1], b[0] - o[0])) * 180 / Math.PI;
      if (t > 180) t = 360 - t;
      return { type: 'angle', deg: t };
    }
    const zone = zoneDe(e, elements);
    const echelle = zone ? zone.echelle : p.echelle;
    const mmPt = echelle ? echelle.mmParPt : MM_PAR_PT;
    const pts = e.type === 'cote' ? [[e.x1, e.y1], [e.x2, e.y2]] : (e.points || []);
    if (e.type === 'surface') {
      let a = 0;
      pts.forEach(([x1, y1], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * d.l * y2 * d.h - x2 * d.l * y1 * d.h; });
      return { type: 'surface', mm2: Math.abs(a) / 2 * mmPt * mmPt };
    }
    let lg = 0;
    for (let i = 1; i < pts.length; i++) lg += Math.hypot((pts[i][0] - pts[i - 1][0]) * d.l, (pts[i][1] - pts[i - 1][1]) * d.h);
    return { type: 'longueur', mm: lg * mmPt };
  }
  function majMesures(elements, p) {
    if (!p) return;
    for (const e of elements) {
      if (!MESURES.includes(e.type)) continue;
      const v = valeurMesure(e, p, elements);
      if (v.type === 'angle') { e.etiquette = `${nombre(v.deg, 1)}°`; continue; }
      const aEchelle = p.echelle || zoneDe(e, elements);
      e.etiquette = (v.type === 'surface' ? formatSurface(v.mm2) : formatLongueur(v.mm)) + (aEchelle ? '' : ' (papier)') + (e.dn && v.type !== 'surface' ? ` · ${e.dn}` : '');
    }
    majLegendes(elements, p);
  }
  function majRecapMesures() {
    const zone = $('#ed-recap');
    if (!ed.page) return;
    const ech = ed.page.echelle;
    $('#ed-echelle').value = ech ? (ech.libelle || 'etalonnee') : '';
    const opt = $('#ed-echelle').querySelector('option[value=etalonnee]');
    opt.hidden = !(ech && !ech.libelle);
    if (ech && !ech.libelle) opt.textContent = `Étalonnée (1 cm papier = ${formatLongueur(ech.mmParPt * 72 / 2.54)})`;
    let lg = 0, surf = 0, n = 0;
    for (const e of ed.elements) {
      if (!MESURES.includes(e.type)) continue;
      const v = valeurMesure(e, ed.page, ed.elements);
      if (v.type === 'angle') continue;
      n++;
      if (v.type === 'surface') surf += v.mm2; else lg += v.mm;
    }
    const comptes = new Map();
    for (const e of ed.elements) if (e.type === 'compte') comptes.set(e.symbole, (comptes.get(e.symbole) || 0) + e.points.length);
    const txtComptes = [...comptes].map(([s, k]) => `${s} ${k}`).join(' · ');
    zone.textContent = [n ? `Mesures de la page : ${n} · longueurs ${formatLongueur(lg)}${surf ? ` · surfaces ${formatSurface(surf)}` : ''}${ech ? '' : ' — échelle non définie'}` : '', txtComptes ? `Comptés : ${txtComptes}` : ''].filter(Boolean).join(' — ');
  }
  // Échelle appliquée à toutes les pages du même document
  function appliquerEchelle(echelle) {
    const src = ed.page.source;
    memoriser();
    etat.pages.forEach(p => { if (p === ed.page || (src && p.source === src)) { if (echelle) p.echelle = echelle; else delete p.echelle; } });
    $('#ed-echelle').classList.remove('alerte');
    dessinerCalque();
    rafraichir();
  }
  $('#ed-echelle').addEventListener('change', () => {
    const v = $('#ed-echelle').value;
    if (v === 'etalonner') { choisirOutil('etalonner'); note('Tracez un trait sur une cote connue du plan, puis indiquez sa longueur réelle.'); majRecapMesures(); return; }
    if (v === 'zone') { choisirOutil('zoneEchelle'); note('Tracez le cadre du détail qui est à une autre échelle, puis indiquez son échelle.'); majRecapMesures(); return; }
    if (v === 'etalonnee') return;
    if (!v) { appliquerEchelle(null); return; }
    const n = Number(v.split('/')[1]);
    appliquerEchelle({ mmParPt: MM_PAR_PT * n, libelle: v });
  });
  function lireLongueur(texte) {
    const m = /^\s*([\d\s]+(?:[.,]\d+)?)\s*(mm|cm|m)?\s*$/i.exec(texte || '');
    if (!m) return null;
    const v = Number(m[1].replace(/\s/g, '').replace(',', '.'));
    const u = (m[2] || 'm').toLowerCase();
    return v * (u === 'mm' ? 1 : u === 'cm' ? 10 : 1000);
  }
  function etalonner(e) {
    const d = dims(ed.page);
    const lgPt = Math.hypot((e.x2 - e.x1) * d.l, (e.y2 - e.y1) * d.h);
    const rep = prompt('Longueur réelle de ce trait (ex. 2,50 m · 2500 mm · 250 cm) :');
    choisirOutil('selection');
    if (rep === null) { majRecapMesures(); return; }
    const mm = lireLongueur(rep);
    if (!mm || mm <= 0) { note('Longueur non comprise : écrivez par exemple « 2,5 m » ou « 2500 mm ».', 'erreur'); majRecapMesures(); return; }
    appliquerEchelle({ mmParPt: mm / lgPt });
    note(`Échelle étalonnée pour toutes les pages de ce document.`, 'ok');
  }
  function terminerTrace() {
    const e = ed.trace;
    if (!e) return;
    ed.trace = null;
    // Points en double laissés par le double-clic
    while (e.points.length > 1) {
      const [a, b] = e.points.slice(-2);
      if (Math.hypot((a[0] - b[0]) * ed.L, (a[1] - b[1]) * ed.H) < 4) e.points.pop(); else break;
    }
    if (e.type === 'angle' && e.points.length > 3) e.points.length = 3;
    if (e.points.length < (e.type === 'surface' || e.type === 'angle' ? 3 : 2)) { ed.elements.splice(ed.elements.indexOf(e), 1); ed.choisi = null; }
    dessinerCalque();
  }
  calque.addEventListener('pointermove', ev => {
    if (ACCROCHE.includes(ed.outil) && !ev.buttons) accrocher(posFraction(ev), ev);
    if (!ed.trace) return;
    let p = posFraction(ev);
    const pts = ed.trace.points;
    if (ev.shiftKey && pts.length > 1) p = aimanter({ x: pts[pts.length - 2][0], y: pts[pts.length - 2][1] }, p);
    else p = accrocher(p, ev);
    pts[pts.length - 1] = [p.x, p.y];
    dessinerCalque();
  });
  calque.addEventListener('dblclick', () => { if (ed.trace) terminerTrace(); });

