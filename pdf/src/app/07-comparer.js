  // ---------- Comparer deux pages (indices d'un plan) ----------
  // Recalage du nouveau sur l'ancien : décalage (dx, dy en pixels de calcul), rotation (degrés) et échelle autour du centre
  const cmp = { a: null, b: null, dx: 0, dy: 0, rot: 0, ech: 1, imgA: null, imgB: null, L: 0, H: 0, k: 1, zoom: 'ajuster', resultat: null };
  const PX_CMP = 3000; // largeur de calcul (pixels) de la plus grande des deux pages
  async function rendreGris(p, k) {
    const c = document.createElement('canvas');
    const d = dims(p);
    await rendrePage(p, c, d.l * k, 1);
    const g = c.getContext('2d', { willReadFrequently: true });
    const px = g.getImageData(0, 0, c.width, c.height).data;
    // « Encre » : 0 (blanc) à 255 (noir)
    const encre = new Uint8Array(c.width * c.height);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) encre[j] = 255 - ((px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 | 0);
    const res = { l: c.width, h: c.height, encre };
    c.width = c.height = 0;
    return res;
  }
  async function ouvrirComparaison() {
    const choisies = etat.pages.filter(p => etat.selection.has(p.id));
    if (choisies.length !== 2) { note('Sélectionnez exactement 2 pages (Ctrl+clic) : l\'ancien indice puis le nouveau.', 'erreur'); return; }
    [cmp.a, cmp.b] = choisies;
    cmp.dx = cmp.dy = cmp.rot = 0; cmp.ech = 1;
    $('#comparaison').hidden = false;
    await preparerComparaison(true);
  }
  async function preparerComparaison(recaler) {
    const dA = dims(cmp.a), dB = dims(cmp.b);
    cmp.k = PX_CMP / Math.max(dA.l, dB.l);
    const nom = p => { const s = etat.sources.get(p.source); return `${s ? s.nom : p.titre || 'page'} p. ${etat.pages.indexOf(p) + 1}`; };
    $('#cmp-nom-a').textContent = nom(cmp.a);
    $('#cmp-nom-b').textContent = nom(cmp.b);
    await occupe('Comparaison des pages…', async avance => {
      cmp.imgA = await rendreGris(cmp.a, cmp.k); avance(0.4);
      cmp.imgB = await rendreGris(cmp.b, cmp.k); avance(0.8);
      cmp.L = Math.max(cmp.imgA.l, cmp.imgB.l); cmp.H = Math.max(cmp.imgA.h, cmp.imgB.h);
      if (recaler) recalerAuto();
      calculerDifferences();
      avance(1);
    });
    afficherComparaison();
  }
  // Point du nouveau (x, y) -> position sur l'ancien, selon le recalage t = { dx, dy, rot, ech } (centre de B : cx, cy)
  const transformer = (t, cx, cy) => {
    const a = t.rot * Math.PI / 180, c = Math.cos(a) * t.ech, s = Math.sin(a) * t.ech;
    return (x, y) => [c * (x - cx) - s * (y - cy) + cx + t.dx, s * (x - cx) + c * (y - cy) + cy + t.dy];
  };
  // Recalage automatique : rotation, échelle et décalage qui superposent le mieux les traits des deux pages.
  // Estimation (répartition des traits), recherche grossière sur des images réduites, puis affinage.
  function recalerAuto() {
    const reduire = (img, f) => {
      const l = Math.ceil(img.l / f), h = Math.ceil(img.h / f), o = new Uint8Array(l * h);
      for (let y = 0; y < img.h; y++) for (let x = 0; x < img.l; x++) if (img.encre[y * img.l + x] > 80) o[((y / f) | 0) * l + ((x / f) | 0)] = 1;
      return { l, h, o };
    };
    const dilater1 = m => {
      const o = new Uint8Array(m.o.length);
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.l; x++) {
        if (!m.o[y * m.l + x]) continue;
        for (let j = Math.max(0, y - 1); j <= Math.min(m.h - 1, y + 1); j++) for (let i = Math.max(0, x - 1); i <= Math.min(m.l - 1, x + 1); i++) o[j * m.l + i] = 1;
      }
      return { ...m, o };
    };
    const points = (m, max) => {
      const pts = [];
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.l; x++) if (m.o[y * m.l + x]) pts.push(x, y);
      if (pts.length / 2 <= max) return pts;
      const pas = pts.length / 2 / max, ech = [];
      for (let k = 0; k < max; k++) { const i = Math.floor(k * pas) * 2; ech.push(pts[i], pts[i + 1]); }
      return ech;
    };
    // Cadre englobant des traits, sans 1 % des points de chaque côté (taches, annotations isolées) : sur un plan,
    // c'est le cadre de la feuille et du cartouche, stable d'un indice à l'autre (le centre de gravité, lui, bouge
    // dès qu'un équipement est ajouté)
    const stats = pts => {
      const xs = [], ys = [];
      for (let i = 0; i < pts.length; i += 2) { xs.push(pts[i]); ys.push(pts[i + 1]); }
      xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
      const q = (t, f) => t[Math.min(t.length - 1, Math.max(0, Math.round(f * (t.length - 1))))] ?? 0;
      const x0 = q(xs, 0.01), x1 = q(xs, 0.99), y0 = q(ys, 0.01), y1 = q(ys, 0.99);
      return { mx: (x0 + x1) / 2, my: (y0 + y1) / 2, taille: Math.hypot(x1 - x0, y1 - y0) || 1 };
    };
    // Nombre de points du nouveau qui tombent sur un trait de l'ancien
    const score = (A, pts, t, cx, cy) => {
      const f = transformer(t, cx, cy);
      let n = 0;
      for (let i = 0; i < pts.length; i += 2) {
        const [x, y] = f(pts[i], pts[i + 1]);
        const xi = Math.round(x), yi = Math.round(y);
        if (xi >= 0 && yi >= 0 && xi < A.l && yi < A.h && A.o[yi * A.l + xi]) n++;
      }
      return n;
    };
    // 1. Grossier (≈ 250 px de large)
    const f1 = Math.max(4, Math.round(cmp.imgA.l / 250));
    const A1 = dilater1(reduire(cmp.imgA, f1)), B1 = reduire(cmp.imgB, f1);
    const pA = points(reduire(cmp.imgA, f1), 6000), pB = points(B1, 3000);
    const sA = stats(pA), sB = stats(pB);
    const cx1 = B1.l / 2, cy1 = B1.h / 2;
    const ech0 = Math.min(1.6, Math.max(0.6, sA.taille / sB.taille));
    const echelles = [...new Set([...Array(17)].map((_, i) => +(1 + (i - 8) * 0.01).toFixed(3)).concat([...Array(9)].map((_, i) => +(ech0 * (1 + (i - 4) * 0.01)).toFixed(3))))];
    let best = { s: -1 };
    for (let rot = -6; rot <= 6; rot += 0.5) {
      for (const ech of echelles) {
        // Décalage qui superpose les centres de gravité des traits, puis petit voisinage
        const f = transformer({ dx: 0, dy: 0, rot, ech }, cx1, cy1);
        const [gx, gy] = f(sB.mx, sB.my);
        const bx = Math.round(sA.mx - gx), by = Math.round(sA.my - gy);
        for (let dy = by - 4; dy <= by + 4; dy++) for (let dx = bx - 4; dx <= bx + 4; dx++) {
          const sc = score(A1, pB, { dx, dy, rot, ech }, cx1, cy1);
          if (sc > best.s) best = { dx, dy, rot, ech, s: sc };
        }
      }
    }
    // 2. Affinage (≈ 1000 px de large)
    const f2 = Math.max(1, Math.round(f1 / 4));
    const A2 = dilater1(reduire(cmp.imgA, f2)), B2 = reduire(cmp.imgB, f2);
    const pB2 = points(B2, 6000);
    const cx2 = B2.l / 2, cy2 = B2.h / 2;
    // Le décalage grossier se rapporte au centre de B1 : converti pour le centre de B2
    let fin = { dx: Math.round(best.dx * f1 / f2), dy: Math.round(best.dy * f1 / f2), rot: best.rot, ech: best.ech, s: -1 };
    const depart = { ...fin };
    for (let rot = depart.rot - 0.5; rot <= depart.rot + 0.501; rot += 0.1) {
      for (let ech = depart.ech - 0.012; ech <= depart.ech + 0.0121; ech += 0.003) {
        for (let dy = depart.dy - 4; dy <= depart.dy + 4; dy++) for (let dx = depart.dx - 4; dx <= depart.dx + 4; dx++) {
          const sc = score(A2, pB2, { dx, dy, rot, ech }, cx2, cy2);
          if (sc > fin.s) fin = { dx, dy, rot: +rot.toFixed(2), ech: +ech.toFixed(4), s: sc };
        }
      }
    }
    // 3. Décalage au pixel près (pleine résolution, rotation et échelle fixées) : l'étape 2 avance par pas de f2 pixels
    let dxF = fin.dx * f2, dyF = fin.dy * f2;
    if (f2 > 1) {
      const A3 = dilater1(reduire(cmp.imgA, 1)), pB3 = points(reduire(cmp.imgB, 1), 12000);
      const cx3 = cmp.imgB.l / 2, cy3 = cmp.imgB.h / 2, d0x = dxF, d0y = dyF;
      let s3 = -1;
      for (let dy = d0y - f2; dy <= d0y + f2; dy++) for (let dx = d0x - f2; dx <= d0x + f2; dx++) {
        const sc = score(A3, pB3, { dx, dy, rot: fin.rot, ech: fin.ech }, cx3, cy3);
        if (sc > s3) { s3 = sc; dxF = dx; dyF = dy; }
      }
    }
    Object.assign(cmp, { dx: dxF, dy: dyF, rot: fin.rot, ech: fin.ech });
  }
  // Rouge : seulement dans l'ancien ; vert : seulement dans le nouveau ; gris : dans les deux (à la tolérance près)
  function calculerDifferences() {
    const { imgA: A, imgB: B, L, H, dx, dy } = cmp;
    const seuil = 70;
    const tol = Number($('#cmp-tolerance').value);
    const encreA = new Uint8Array(L * H), encreB = new Uint8Array(L * H);
    for (let y = 0; y < A.h; y++) for (let x = 0; x < A.l; x++) if (A.encre[y * A.l + x] > seuil) encreA[y * L + x] = 1;
    if (!cmp.rot && cmp.ech === 1) {
      for (let y = 0; y < B.h; y++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let x = 0; x < B.l; x++) { const xx = x + dx; if (xx >= 0 && xx < L && B.encre[y * B.l + x] > seuil) encreB[yy * L + xx] = 1; } }
    } else {
      // Pour chaque point de l'ancien : point correspondant du nouveau (transformation inverse)
      const a = -cmp.rot * Math.PI / 180, c = Math.cos(a) / cmp.ech, sn = Math.sin(a) / cmp.ech, cx = B.l / 2, cy = B.h / 2;
      for (let y = 0; y < H; y++) {
        const vy = y - cy - dy;
        for (let x = 0; x < L; x++) {
          const vx = x - cx - dx;
          const xb = Math.round(c * vx - sn * vy + cx), yb = Math.round(sn * vx + c * vy + cy);
          if (xb >= 0 && yb >= 0 && xb < B.l && yb < B.h && B.encre[yb * B.l + xb] > seuil) encreB[y * L + x] = 1;
        }
      }
    }
    // Dilatation (tolérance en pixels) : un trait déplacé d'un pixel n'est pas une modification
    const dilater = (m, r) => {
      if (!r) return m;
      const t = new Uint8Array(L * H), o = new Uint8Array(L * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) { if (!m[y * L + x]) continue; for (let k = Math.max(0, x - r); k <= Math.min(L - 1, x + r); k++) t[y * L + k] = 1; }
      for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) { if (!t[y * L + x]) continue; for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r); k++) o[k * L + x] = 1; }
      return o;
    };
    const aD = dilater(encreA, tol), bD = dilater(encreB, tol);
    const img = new ImageData(L, H);
    const d = img.data;
    let rouges = 0, verts = 0;
    for (let i = 0; i < L * H; i++) {
      const a = encreA[i], b = encreB[i];
      let r = 255, g = 255, bl = 255;
      if (a && !bD[i]) { r = 220; g = 30; bl = 30; rouges++; }
      else if (b && !aD[i]) { r = 0; g = 150; bl = 60; verts++; }
      else if (a || b) { r = g = bl = 150; }
      const o = i * 4; d[o] = r; d[o + 1] = g; d[o + 2] = bl; d[o + 3] = 255;
    }
    cmp.resultat = img;
    const part = (rouges + verts) / (L * H);
    $('#cmp-info').textContent = (rouges + verts) < 20
      ? 'Aucune différence visible entre les deux pages.'
      : `Différences : ${rouges ? 'supprimé (rouge)' : ''}${rouges && verts ? ' et ' : ''}${verts ? 'ajouté (vert)' : ''} — ${(part * 100).toFixed(2).replace('.', ',')} % de la surface. Flèches : décaler · Alt + flèches : tourner, échelle · Ctrl + molette : zoom · glisser : déplacer.`;
    $('#cmp-decalage').textContent = `Décalage ${Math.round(dx / cmp.k)} ; ${Math.round(dy / cmp.k)} pt`
      + (cmp.rot ? ` · rotation ${cmp.rot.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}°` : '')
      + (cmp.ech !== 1 ? ` · échelle ${(cmp.ech * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : '');
  }
  function afficherComparaison() {
    const c = $('#cmp-canvas');
    c.width = cmp.L; c.height = cmp.H;
    c.getContext('2d').putImageData(cmp.resultat, 0, 0);
    zoomComparaison();
  }
  function zoomComparaison() {
    const c = $('#cmp-canvas'), scene = $('#cmp-scene');
    const z = cmp.zoom;
    const largeur = z === 'ajuster' ? Math.min(scene.clientWidth - 40, (scene.clientHeight - 40) * cmp.L / cmp.H) : cmp.L / cmp.k * PX_PAR_PT_CMP * z;
    c.style.width = `${largeur}px`;
    c.style.height = `${largeur * cmp.H / cmp.L}px`;
  }
  const PX_PAR_PT_CMP = 96 / 72;
  let minuterieCmp = null;
  function decalerComparaison(dx, dy, rot = 0, ech = 0) {
    cmp.dx += dx; cmp.dy += dy;
    cmp.rot = +(cmp.rot + rot).toFixed(2); cmp.ech = +(cmp.ech + ech).toFixed(4);
    clearTimeout(minuterieCmp);
    minuterieCmp = setTimeout(() => { calculerDifferences(); afficherComparaison(); }, 60);
  }
  $('#b-comparer').onclick = ouvrirComparaison;
  $('#cmp-fermer').onclick = () => { $('#comparaison').hidden = true; cmp.imgA = cmp.imgB = cmp.resultat = null; };
  $('#cmp-inverser').onclick = () => { [cmp.a, cmp.b] = [cmp.b, cmp.a]; preparerComparaison(true); };
  $('#cmp-recaler').onclick = () => { recalerAuto(); calculerDifferences(); afficherComparaison(); };
  $('#cmp-tolerance').oninput = () => { calculerDifferences(); afficherComparaison(); };
  $('#cmp-zoom').onchange = () => { const v = $('#cmp-zoom').value; cmp.zoom = v === 'ajuster' ? v : Number(v); zoomComparaison(); };
  $('#cmp-scene').addEventListener('wheel', ev => {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    const c = $('#cmp-canvas');
    const actuel = parseFloat(c.style.width) / (cmp.L / cmp.k * PX_PAR_PT_CMP);
    cmp.zoom = Math.min(8, Math.max(0.1, actuel * Math.exp(-ev.deltaY * 0.0025)));
    $('#cmp-zoom').value = 'ajuster';
    zoomComparaison();
  }, { passive: false });
  $('#cmp-scene').addEventListener('pointerdown', ev => {
    const scene = $('#cmp-scene');
    const x0 = ev.clientX, y0 = ev.clientY, sl = scene.scrollLeft, st = scene.scrollTop;
    scene.setPointerCapture(ev.pointerId); scene.classList.add('glisse');
    const bouger = m => { scene.scrollLeft = sl - (m.clientX - x0); scene.scrollTop = st - (m.clientY - y0); };
    const fin = () => { scene.removeEventListener('pointermove', bouger); scene.removeEventListener('pointerup', fin); scene.classList.remove('glisse'); };
    scene.addEventListener('pointermove', bouger); scene.addEventListener('pointerup', fin);
  });
  // Image de la comparaison ajoutée au document, juste après la page la plus récente
  $('#cmp-ajouter').onclick = async () => {
    const c = $('#cmp-canvas');
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const img = await normaliserImage(blob);
    const s = nouvelleSource(`Comparaison ${$('#cmp-nom-a').textContent} - ${$('#cmp-nom-b').textContent}.png`, 'image');
    Object.assign(s, img, { nbPages: 1 });
    const dB = dims(cmp.b);
    const p = { id: nouvelId('p'), type: 'image', source: s.id, index: 0, rotBase: 0, rot: 0, boite: { x: 0, y: 0, width: Math.max(dB.l, dims(cmp.a).l), height: Math.max(dB.h, dims(cmp.a).h) }, elements: [] };
    memoriser();
    etat.pages.splice(Math.max(etat.pages.indexOf(cmp.a), etat.pages.indexOf(cmp.b)) + 1, 0, p);
    rafraichir();
    note('Comparaison ajoutée au document.', 'ok');
  };
