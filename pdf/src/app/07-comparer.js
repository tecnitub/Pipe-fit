  // ---------- Comparer deux pages (indices d'un plan) ----------
  const cmp = { a: null, b: null, dx: 0, dy: 0, imgA: null, imgB: null, L: 0, H: 0, k: 1, zoom: 'ajuster', resultat: null };
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
    cmp.dx = cmp.dy = 0;
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
  // Recalage : décalage qui superpose le mieux les traits des deux pages (grossier puis fin)
  function recalerAuto() {
    const reduire = (img, f) => {
      const l = Math.ceil(img.l / f), h = Math.ceil(img.h / f), o = new Uint8Array(l * h);
      for (let y = 0; y < img.h; y++) for (let x = 0; x < img.l; x++) { const v = img.encre[y * img.l + x]; if (v > 80) o[((y / f) | 0) * l + ((x / f) | 0)] = 1; }
      return { l, h, o };
    };
    const score = (A, B, dx, dy) => {
      let n = 0;
      for (let y = 0; y < A.h; y++) {
        const yb = y - dy;
        if (yb < 0 || yb >= B.h) continue;
        for (let x = 0; x < A.l; x++) { const xb = x - dx; if (xb >= 0 && xb < B.l && A.o[y * A.l + x] && B.o[yb * B.l + xb]) n++; }
      }
      return n;
    };
    const f1 = 12, A1 = reduire(cmp.imgA, f1), B1 = reduire(cmp.imgB, f1);
    let best = { dx: 0, dy: 0, s: score(A1, B1, 0, 0) };
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) { const sc = score(A1, B1, dx, dy); if (sc > best.s * 1.02) best = { dx, dy, s: sc }; }
    const f2 = 3, A2 = reduire(cmp.imgA, f2), B2 = reduire(cmp.imgB, f2);
    const cx = best.dx * f1 / f2, cy = best.dy * f1 / f2;
    let fin = { dx: Math.round(cx), dy: Math.round(cy), s: -1 };
    for (let dy = Math.round(cy) - 5; dy <= Math.round(cy) + 5; dy++) for (let dx = Math.round(cx) - 5; dx <= Math.round(cx) + 5; dx++) { const sc = score(A2, B2, dx, dy); if (sc > fin.s) fin = { dx, dy, s: sc }; }
    cmp.dx = fin.dx * f2; cmp.dy = fin.dy * f2;
  }
  // Rouge : seulement dans l'ancien ; vert : seulement dans le nouveau ; gris : dans les deux (à la tolérance près)
  function calculerDifferences() {
    const { imgA: A, imgB: B, L, H, dx, dy } = cmp;
    const seuil = 70;
    const tol = Number($('#cmp-tolerance').value);
    const encreA = new Uint8Array(L * H), encreB = new Uint8Array(L * H);
    for (let y = 0; y < A.h; y++) for (let x = 0; x < A.l; x++) if (A.encre[y * A.l + x] > seuil) encreA[y * L + x] = 1;
    for (let y = 0; y < B.h; y++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let x = 0; x < B.l; x++) { const xx = x + dx; if (xx >= 0 && xx < L && B.encre[y * B.l + x] > seuil) encreB[yy * L + xx] = 1; } }
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
      : `Différences : ${rouges ? 'supprimé (rouge)' : ''}${rouges && verts ? ' et ' : ''}${verts ? 'ajouté (vert)' : ''} — ${(part * 100).toFixed(2).replace('.', ',')} % de la surface. Flèches : décaler · Ctrl + molette : zoom · glisser : déplacer.`;
    $('#cmp-decalage').textContent = `Décalage ${Math.round(dx / cmp.k)} ; ${Math.round(dy / cmp.k)} pt`;
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
  function decalerComparaison(dx, dy) {
    cmp.dx += dx; cmp.dy += dy;
    clearTimeout(minuterieCmp);
    minuterieCmp = setTimeout(() => { calculerDifferences(); afficherComparaison(); }, 60);
  }
  $('#b-comparer').onclick = ouvrirComparaison;
  $('#cmp-fermer').onclick = () => { $('#comparaison').hidden = true; cmp.imgA = cmp.imgB = cmp.resultat = null; };
  $('#cmp-inverser').onclick = () => { [cmp.a, cmp.b] = [cmp.b, cmp.a]; cmp.dx = -cmp.dx; cmp.dy = -cmp.dy; preparerComparaison(false); };
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
