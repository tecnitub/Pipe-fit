// Planches d'étiquettes autocollantes : modèles A4 du commerce (dimensions en mm), positions exactes, décalage
// d'impression réglable, première étiquette libre d'une planche entamée, et PDF écrit directement (sans marge ajoutée)
// pour tomber pile sur les étiquettes. QR code dessiné en vectoriel (net à toute taille), photo en JPEG.
// Module pur (navigateur, tests) : la mesure du texte est fournie par l'appelant.
const Planches = (() => {
  // [id, nom, colonnes, lignes, largeur, hauteur, marge gauche, marge haute, pas horizontal, pas vertical, traits de coupe]
  const MODELES = [
    ['libre-20', 'Papier A4 à découper — 26 étiquettes de 95 × 20 mm (casiers)', 2, 13, 95, 20, 10, 18.5, 95, 20, true],
    ['L4732', 'Avery L4732 — 80 étiquettes de 35,6 × 16,9 mm', 5, 16, 35.6, 16.9, 11, 13, 38.1, 16.9],
    ['L7651', 'Avery L7651 — 65 étiquettes de 38,1 × 21,2 mm', 5, 13, 38.1, 21.2, 4.75, 10.7, 40.6, 21.2],
    ['3474', 'Avery 3474 — 24 étiquettes de 70 × 37 mm', 3, 8, 70, 37, 0, 0.5, 70, 37],
    ['L7160', 'Avery L7160 — 21 étiquettes de 63,5 × 38,1 mm (outillage)', 3, 7, 63.5, 38.1, 7.25, 15.15, 66, 38.1],
    ['L7173', 'Avery L7173 — 10 étiquettes de 99,1 × 57 mm', 2, 5, 99.1, 57, 4.65, 6, 101.6, 57],
  ].map(([id, nom, cols, lignes, w, h, gauche, haut, pasX, pasY, traits]) => ({ id, nom, cols, lignes, w, h, gauche, haut, pasX, pasY, traits: !!traits }));
  const modele = id => MODELES.find(m => m.id === id) || MODELES[0];
  const PT = 72 / 25.4, A4 = [210, 297];

  // Emplacements (mm, origine en haut à gauche) des n étiquettes à partir de la case « depart » (1 = première case)
  function positions(m, n, depart = 1, decal = { x: 0, y: 0 }) {
    const parPage = m.cols * m.lignes, out = [];
    for (let k = 0; k < n; k++) {
      const i = k + Math.max(1, Math.min(parPage, Math.round(depart) || 1)) - 1, page = Math.floor(i / parPage), j = i % parPage;
      out.push({ page, x: m.gauche + (j % m.cols) * m.pasX + (Number(decal.x) || 0), y: m.haut + Math.floor(j / m.cols) * m.pasY + (Number(decal.y) || 0), w: m.w, h: m.h });
    }
    return out;
  }
  // Disposition d'une étiquette : QR à droite (au plus 18 mm, ou plus sur une grande étiquette), photo devant si la
  // place le permet, texte à gauche
  function disposition(w, h, avecPhoto) {
    const pad = Math.min(1.5, h * 0.08), q = Math.min(h - 2 * pad, h <= 25 ? 18 : Math.min(30, h * 0.7), w * 0.48);
    const photo = avecPhoto && w - q - 3 * pad >= q + 18 ? q * 0.9 : 0;
    return { pad, q, photo, texteW: w - q - 2 * pad - (photo ? photo + pad : 0) - pad, texteH: h - 2 * pad };
  }
  // Coupure du texte en lignes dans la largeur (pt) ; taille réduite jusqu'à tenir dans la hauteur
  function couper(texte, largeur, taille, mesure, gras) {
    const mots = String(texte || '').split(/\s+/).filter(Boolean), lignes = [];
    let l = '';
    mots.forEach(mt => { const t = l ? `${l} ${mt}` : mt; if (mesure(t, taille, gras) <= largeur || !l) l = t; else { lignes.push(l); l = mt; } });
    if (l) lignes.push(l);
    return lignes;
  }
  function ajuster(titre, sous, largeurPt, hauteurPt, mesure) {
    for (let t = 10; t >= 5; t -= 0.5) {
      const lt = couper(titre, largeurPt, t, mesure, true), ts = Math.max(4.5, t * 0.72), ls = sous ? couper(sous, largeurPt, ts, mesure, false) : [];
      // Tient en hauteur et chaque ligne en largeur (un mot trop long fait réduire la taille)
      const large = lt.every(l => mesure(l, t, true) <= largeurPt) && ls.every(l => mesure(l, ts, false) <= largeurPt);
      if (((lt.length * t + ls.length * ts) * 1.18 <= hauteurPt && large) || t === 5) return { t, ts, lt: lt.slice(0, Math.max(1, Math.floor(hauteurPt / (t * 1.18)))), ls: ls.slice(0, Math.max(0, Math.floor((hauteurPt - lt.length * t * 1.18) / (ts * 1.18)))) };
    }
    return null;
  }

  /* ---------- PDF ---------- */
  // Texte en WinAnsi (accents français, €, guillemets, tirets)
  const SPECIAUX = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, 'Œ': 0x8c, 'œ': 0x9c, 'Š': 0x8a, 'š': 0x9a, 'Ÿ': 0x9f, '™': 0x99 };
  const winAnsi = s => [...String(s).normalize('NFC')].map(c => { const k = c.codePointAt(0); return SPECIAUX[c] !== undefined ? String.fromCharCode(SPECIAUX[c]) : k < 256 ? c : (c === ' ' || c === ' ' ? ' ' : '?'); }).join('');
  const echapper = s => winAnsi(s).replace(/[\\()]/g, m => `\\${m}`);
  const nf = v => (Math.round(v * 100) / 100).toString();

  // items : [{ titre, sous, qr: { n, sombre(y, x) }, photo: { jpeg (chaîne binaire), w, h } | null }]
  // opts : { modele, depart, decal, cadres (feuille de test), mesure(texte, taille, gras) -> largeur en pt }
  function pdf(items, { modele: mid, depart = 1, decal = { x: 0, y: 0 }, cadres = false, mesure }) {
    const m = modele(mid), pos = positions(m, items.length, depart, decal), pages = [];
    const images = [];
    items.forEach((it, i) => {
      const p = pos[i]; (pages[p.page] = pages[p.page] || []);
      const d = disposition(p.w, p.h, !!it.photo), X = mm => nf(mm * PT), Y = mm => nf((A4[1] - mm) * PT), ops = pages[p.page];
      if (cadres || m.traits) ops.push(`q ${cadres ? '0.6 0.6 0.6' : '0.75 0.75 0.75'} RG 0.3 w ${cadres ? '' : '[2 2] 0 d '}${X(p.x)} ${Y(p.y + p.h)} ${nf(p.w * PT)} ${nf(p.h * PT)} re S Q`);
      // QR code : un rectangle par module sombre, zone blanche d'un module autour (feuille de test : sans QR)
      if (it.qr) {
        const n = it.qr.n, cote = d.q / (n + 2), x0 = p.x + p.w - d.pad - d.q + cote, y0 = p.y + (p.h - d.q) / 2 + cote;
        let r = '';
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (it.qr.sombre(y, x)) r += `${X(x0 + x * cote)} ${Y(y0 + (y + 1) * cote)} ${nf(cote * PT + 0.05)} ${nf(cote * PT + 0.05)} re `;
        ops.push(`0 g ${r}f`);
      }
      if (it.photo) {
        const k = images.push(it.photo), ph = d.photo, pr = Math.min(ph / it.photo.w, ph / it.photo.h), pw = it.photo.w * pr, phh = it.photo.h * pr;
        const px = p.x + p.w - d.pad - d.q - d.pad - ph + (ph - pw) / 2, py = p.y + (p.h - phh) / 2;
        ops.push(`q ${nf(pw * PT)} 0 0 ${nf(phh * PT)} ${X(px)} ${Y(py + phh)} cm /Im${k} Do Q`);
      }
      const a = ajuster(it.titre, it.sous, d.texteW * PT, d.texteH * PT, mesure);
      if (a) {
        const lignes = [...a.lt.map(t => [t, a.t, true]), ...a.ls.map(t => [t, a.ts, false])], hTot = lignes.reduce((s, l) => s + l[1] * 1.18, 0);
        let yPt = (A4[1] - p.y - p.h / 2) * PT + hTot / 2;
        lignes.forEach(([t, taille, gras]) => { yPt -= taille * 1.18; ops.push(`BT /${gras ? 'F2' : 'F1'} ${nf(taille)} Tf ${gras ? '0 g' : '0.3 g'} ${X(p.x + d.pad)} ${nf(yPt + taille * 0.22)} Td (${echapper(t)}) Tj ET`); });
      }
    });
    if (!pages.length) pages.push([]);
    // Assemblage : catalogue, pages, polices, images, contenus
    const objs = [], add = s => { objs.push(s); return objs.length; };
    const cat = add(''), racine = add(''), f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const imgIds = images.map(im => add(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n${im.jpeg}\nendstream`));
    const res = `<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /XObject << ${imgIds.map((id, i) => `/Im${i + 1} ${id} 0 R`).join(' ')} >> >>`;
    const kids = pages.map(ops => { const c = (ops || []).join('\n'); const cid = add(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`); return add(`<< /Type /Page /Parent ${racine} 0 R /MediaBox [0 0 ${nf(A4[0] * PT)} ${nf(A4[1] * PT)}] /Resources ${res} /Contents ${cid} 0 R >>`); });
    objs[cat - 1] = `<< /Type /Catalog /Pages ${racine} 0 R >>`;
    objs[racine - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const off = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const b = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) b[i] = out.charCodeAt(i) & 0xff;
    return { octets: b, pages: pages.length, parPage: m.cols * m.lignes };
  }
  return { MODELES, modele, positions, disposition, couper, pdf, winAnsi };
})();
if (typeof module !== 'undefined') module.exports = Planches;
