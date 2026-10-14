// PDF sans dépendance : le document HTML est mis en page par le navigateur au format A4,
// puis chaque texte, fond, bordure et image est reporté à sa position dans un PDF vectoriel
// (polices standard Helvetica / Times / Courier, texte sélectionnable).
const PDF = (() => {
  const PAGE_W = 794, PAGE_H = 1123, MARGE = 42, K = 0.75; // px (96 dpi) -> points
  // Largeurs des caractères 32..255 (WinAnsi) des polices standard, en millièmes de cadratin
  const LARGEURS = {
    'Helvetica': [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
    'Helvetica-Bold': [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556],
    'Times-Roman': [250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541,350,500,350,333,500,444,1000,500,500,333,1000,556,333,889,350,611,350,350,333,333,444,444,350,500,1000,333,980,389,333,722,350,444,722,250,333,500,500,500,500,200,500,333,760,276,500,564,333,760,333,400,564,300,300,333,500,453,250,333,300,310,500,750,750,750,444,722,722,722,722,722,722,889,667,611,611,611,611,333,333,333,333,722,722,722,722,722,722,722,564,722,722,722,722,722,722,556,500,444,444,444,444,444,444,667,444,444,444,444,444,278,278,278,278,500,500,500,500,500,500,500,564,500,500,500,500,500,500,500,500],
    'Times-Bold': [250,333,555,500,500,1000,833,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,930,722,667,722,722,667,611,778,778,389,500,778,667,944,722,778,611,778,722,556,667,722,722,1000,722,722,667,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,444,389,333,556,500,722,500,500,444,394,220,394,520,350,500,350,333,500,500,1000,500,500,333,1000,556,333,1000,350,667,350,350,333,333,500,500,350,500,1000,333,1000,389,333,722,350,444,722,250,333,500,500,500,500,220,500,333,747,300,500,570,333,747,333,400,570,300,300,333,556,540,250,333,300,330,500,750,750,750,500,722,722,722,722,722,722,1000,722,667,667,667,667,389,389,389,389,722,722,778,778,778,778,778,570,778,722,722,722,722,722,611,556,500,500,500,500,500,500,722,444,444,444,444,444,278,278,278,278,500,556,500,500,500,500,500,570,500,556,556,556,556,500,556,500],
  };
  const WIN = { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e,
    0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f };
  const SUBST = { '\u202f': '\u00a0', '\u2009': ' ', '\u2011': '-', '\u2212': '-', '→': '->', '☒': '[X]', '☐': '[ ]', '✕': 'x', '≥': '>=', '≤': '<=', '✓': 'v' };
  const POLICES = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique', 'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
    'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'];
  const PILES = { sans: "Arial, 'Liberation Sans', Arimo, Helvetica, sans-serif", serif: "'Times New Roman', 'Liberation Serif', Tinos, Times, serif", mono: "'Courier New', 'Liberation Mono', Cousine, Courier, monospace" };

  // Texte Unicode -> octets WinAnsi (chaîne latin-1)
  function octets(str) {
    let out = '';
    for (const ch of String(str)) {
      if (SUBST[ch]) { out += octets(SUBST[ch]); continue; }
      const c = ch.codePointAt(0);
      let b = c < 0x80 || (c >= 0xa0 && c <= 0xff) ? c : WIN[c];
      if (b === undefined) b = 0x3f;
      out += String.fromCharCode(b < 0x20 ? 0x20 : b);
    }
    return out;
  }
  const echapper = s => s.replace(/[\\()]/g, m => '\\' + m);
  const largeur = (bytes, police) => {
    if (police >= 8) return bytes.length * 600;
    const t = LARGEURS[police >= 4 ? (police % 2 ? 'Times-Bold' : 'Times-Roman') : (police % 2 ? 'Helvetica-Bold' : 'Helvetica')];
    let w = 0;
    for (let i = 0; i < bytes.length; i++) w += t[bytes.charCodeAt(i) - 32] || 0;
    return w;
  };
  function couleur(css) {
    const m = /rgba?\(([^)]+)\)/.exec(css || ''), srgb = /color\(srgb ([^)]+)\)/.exec(css || '');
    if (!m && !srgb) return null;
    let [r, g, b, a = 1] = (m || srgb)[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    if (srgb) { r *= 255; g *= 255; b *= 255; }
    if (a === 0) return null;
    const mix = v => (v * a + 255 * (1 - a)) / 255;
    return [mix(r), mix(g), mix(b)];
  }
  const famille = ff => { ff = ff.toLowerCase(); return /courier|mono/.test(ff) ? 8 : /times|georgia|serif/.test(ff.replace('sans-serif', '')) ? 4 : 0; };
  const n = v => (Math.round(v * 100) / 100).toString();
  const rgb = c => c.map(n).join(' ');

  async function imageJPEG(img) {
    const w = Math.min(img.naturalWidth, 1400), h = Math.round(img.naturalHeight * w / img.naturalWidth);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
    return { w, h, data: atob(cv.toDataURL('image/jpeg', 0.85).split(',')[1]) };
  }

  // Mise en page dans le navigateur puis relevé des éléments à dessiner
  async function relever(html) {
    const police = (Doc.cfg().police) || 'sans';
    const box = document.createElement('div');
    box.className = 'doc-print pdf-render';
    box.style.cssText = `position:absolute;left:-12000px;top:0;width:${PAGE_W - 2 * MARGE}px;padding:0;border:0;--doc-font:${PILES[police] || PILES.sans};${Doc.style().replace(/--doc-font:[^;]*;?/, '')}`;
    box.innerHTML = html;
    document.body.appendChild(box);
    try {
      await Promise.all([...box.querySelectorAll('img')].map(i => (i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))));
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const R = box.getBoundingClientRect(), ox = R.left, oy = R.top;
      const ops = [], atomes = [], images = new Map();
      for (const el of box.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        const x = r.left - ox, y = r.top - oy, w = r.width, h = r.height;
        if (el.matches('tr, p, h1, h2, h3, li, img, .signatures, .doc-head, .doc-parties > div, .doc-pied, .doc-rib, .totals')) atomes.push([y, y + h]);
        const bg = couleur(cs.backgroundColor);
        if (bg && !(bg[0] === 1 && bg[1] === 1 && bg[2] === 1)) ops.push({ t: 'rect', x, y, w, h, c: bg });
        [['Top', x, y, w, 0], ['Bottom', x, y + h, w, 0], ['Left', x, y, 0, h], ['Right', x + w, y, 0, h]].forEach(([side, bx, by, bw, bh]) => {
          const ep = parseFloat(cs[`border${side}Width`]);
          const c = couleur(cs[`border${side}Color`]);
          if (!ep || !c || cs[`border${side}Style`] === 'none') return;
          ops.push({ t: 'rect', x: bw ? bx : (side === 'Left' ? bx : bx - ep), y: bh ? by : (side === 'Top' ? by : by - ep), w: bw || ep, h: bh || ep, c });
        });
        if (el.tagName === 'IMG' && el.naturalWidth) {
          if (!images.has(el.src)) images.set(el.src, await imageJPEG(el).catch(() => null));
          const im = images.get(el.src);
          if (im) {
            const k = Math.min(w / el.naturalWidth, h / el.naturalHeight);
            const iw = el.naturalWidth * k, ih = el.naturalHeight * k;
            const px = cs.objectFit === 'contain' ? x + (w - iw) / 2 : x, py = cs.objectFit === 'contain' ? y + (h - ih) / 2 : y;
            ops.push({ t: 'img', src: el.src, x: px, y: py, w: cs.objectFit === 'contain' ? iw : w, h: cs.objectFit === 'contain' ? ih : h });
          }
        }
      }
      // Textes : mots regroupés par ligne affichée
      const tw = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let node = tw.nextNode(); node; node = tw.nextNode()) {
        if (!/\S/.test(node.data)) continue;
        const cs = getComputedStyle(node.parentElement);
        if (cs.visibility === 'hidden') continue;
        const fs = parseFloat(cs.fontSize), gras = parseInt(cs.fontWeight, 10) >= 600, ital = cs.fontStyle === 'italic';
        const fonte = famille(cs.fontFamily) + (gras ? 1 : 0) + (ital ? 2 : 0), c = couleur(cs.color) || [0, 0, 0];
        const maj = cs.textTransform === 'uppercase';
        let ligne = null;
        const fin = () => {
          if (!ligne) return;
          let txt = node.data.slice(ligne.a, ligne.b).replace(/\s+/g, ' ');
          if (maj) txt = txt.toUpperCase();
          const base = ligne.top + (ligne.bottom - ligne.top - 1.117 * fs) / 2 + 0.905 * fs;
          ops.push({ t: 'txt', x: ligne.left - ox, y: base - oy, top: ligne.top - oy, w: ligne.right - ligne.left, fs, fonte, c, txt });
          ligne = null;
        };
        const re = /\S+/g; let m;
        while ((m = re.exec(node.data))) {
          range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
          const rs = range.getClientRects(); if (!rs.length) continue;
          const r = rs[0];
          if (ligne && Math.abs(r.top - ligne.top) > fs * 0.5) fin();
          if (!ligne) ligne = { a: m.index, b: m.index + m[0].length, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          else { ligne.b = m.index + m[0].length; ligne.right = Math.max(ligne.right, r.right); }
        }
        fin();
      }
      return { ops, atomes, images, hauteur: R.height };
    } finally { box.remove(); }
  }

  // Coupures de page entre les lignes de tableau / paragraphes
  function paginer(atomes, total) {
    const H = PAGE_H - 2 * MARGE, pages = [];
    let debut = 0;
    while (debut < total - 1) {
      let fin = debut + H;
      if (fin < total) {
        for (let i = 0; i < 20; i++) {
          const coupes = atomes.filter(([t, b]) => t < fin - 0.5 && b > fin + 0.5 && b - t < H && t > debut + 1);
          if (!coupes.length) break;
          fin = Math.min(...coupes.map(a => a[0]));
        }
        if (fin <= debut + 40) fin = debut + H;
      }
      pages.push([debut, Math.min(fin, total)]);
      debut = fin;
    }
    return pages.length ? pages : [[0, total]];
  }

  function assembler({ ops, atomes, images, hauteur }, titre, pj) {
    const pages = paginer(atomes, hauteur);
    const objets = [];
    const ajouter = corps => { objets.push(corps); return objets.length; };
    ajouter(''); ajouter(''); // 1 catalogue, 2 arbre des pages
    const fontes = POLICES.map(p => ajouter(`<< /Type /Font /Subtype /Type1 /BaseFont /${p} /Encoding /WinAnsiEncoding >>`));
    const imgIds = new Map();
    let k = 0;
    images.forEach((im, src) => {
      if (!im) return;
      const id = ajouter(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n${im.data}\nendstream`);
      imgIds.set(src, { id, nom: 'Im' + k++ });
    });
    const ressources = `<< /Font << ${fontes.map((id, i) => `/F${i} ${id} 0 R`).join(' ')} >> /XObject << ${[...imgIds.values()].map(v => `/${v.nom} ${v.id} 0 R`).join(' ')} >> >>`;
    const kids = [];
    pages.forEach(([s, e], ip) => {
      const X = x => n((MARGE + x) * K), Y = y => n((PAGE_H - MARGE - (y - s)) * K);
      const cmd = [`q 0 ${n((PAGE_H - MARGE - (e - s)) * K)} ${n(PAGE_W * K)} ${n((e - s) * K)} re W n`];
      ops.forEach(o => {
        if (o.t === 'txt') {
          if (o.top < s - 1 || o.top >= e - 1) return;
          const b = octets(o.txt), pt = o.fs * K, lw = largeur(b, o.fonte) * pt / 1000;
          const tz = lw ? Math.max(50, Math.min(200, (o.w * K) / lw * 100)) : 100;
          cmd.push(`BT /F${o.fonte} ${n(pt)} Tf ${n(tz)} Tz ${rgb(o.c)} rg 1 0 0 1 ${X(o.x)} ${Y(o.y)} Tm (${echapper(b)}) Tj ET`);
        } else if (o.y < e && o.y + o.h > s) {
          if (o.t === 'rect') cmd.push(`${rgb(o.c)} rg ${X(o.x)} ${Y(o.y + o.h)} ${n(o.w * K)} ${n(o.h * K)} re f`);
          else if (imgIds.has(o.src)) cmd.push(`q ${n(o.w * K)} 0 0 ${n(o.h * K)} ${X(o.x)} ${Y(o.y + o.h)} cm /${imgIds.get(o.src).nom} Do Q`);
        }
      });
      cmd.push('Q');
      if (pages.length > 1) {
        const t = octets(`Page ${ip + 1} / ${pages.length}`), pt = 7.5;
        cmd.push(`BT /F0 ${pt} Tf 100 Tz 0.45 0.45 0.45 rg 1 0 0 1 ${n((PAGE_W - MARGE) * K - largeur(t, 0) * pt / 1000)} ${n(MARGE * K / 2)} Tm (${echapper(t)}) Tj ET`);
      }
      const flux = cmd.join('\n');
      const c = ajouter(`<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`);
      kids.push(ajouter(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(PAGE_W * K)} ${n(PAGE_H * K)}] /Resources ${ressources} /Contents ${c} 0 R >>`));
    });
    // Pièce jointe XML (Factur-X : données structurées de la facture jointes au PDF)
    let fichiers = '';
    if (pj) {
      const data = Array.from(new TextEncoder().encode(pj.xml), b => String.fromCharCode(b)).join('');
      const ef = ajouter(`<< /Type /EmbeddedFile /Subtype /text#2Fxml /Params << /Size ${data.length} >> /Length ${data.length} >>\nstream\n${data}\nendstream`);
      const fsp = ajouter(`<< /Type /Filespec /F (${pj.nom}) /UF (${pj.nom}) /Desc (Factur-X) /AFRelationship /Data /EF << /F ${ef} 0 R /UF ${ef} 0 R >> >>`);
      fichiers = ` /Names << /EmbeddedFiles << /Names [(${pj.nom}) ${fsp} 0 R] >> >> /AF [${fsp} 0 R]`;
    }
    objets[0] = `<< /Type /Catalog /Pages 2 0 R${fichiers} >>`;
    objets[1] = `<< /Type /Pages /Kids [${kids.map(i => `${i} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    const info = ajouter(`<< /Title (${echapper(octets(titre || 'Document'))}) /Producer (Pipe-Fit CRM) >>`);
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets = objets.map((corps, i) => { const o = out.length; out += `${i + 1} 0 obj\n${corps}\nendobj\n`; return o; });
    const xref = out.length;
    out += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
    out += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }

  return {
    async depuisHTML(html, titre, pj) { return assembler(await relever(html), titre, pj); },
    async telecharger(html, nom) { download(nom, await this.depuisHTML(html, nom.replace(/\.pdf$/i, '')), 'application/pdf'); },
  };
})();
