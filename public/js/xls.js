// Lecture des classeurs Excel 97-2003 (.xls) sans bibliothèque externe : conteneur OLE2 / CFB (secteurs, FAT, mini-FAT,
// répertoire), flux « Workbook » au format BIFF8, enregistrements des feuilles (BOUNDSHEET), table des chaînes (SST et ses
// CONTINUE), cellules LABELSST, LABEL, NUMBER, RK, MULRK, BOOLERR, FORMULA (+ STRING pour un résultat texte) ; BLANK et
// MULBLANK ignorés. Rend les feuilles comme le lecteur .xlsx : [{ name, rows: [[valeur]] }]. Module commun navigateur / tests.
const Xls = (() => {
  const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const FIN = 0xfffffffe, LIBRE = 0xffffffff;
  const vers8 = buf => (buf instanceof Uint8Array ? buf : new Uint8Array(buf));
  // Conteneur OLE2 (signature D0 CF 11 E0…) : un .xls, même renommé
  const estXls = buf => { const u = vers8(buf); return SIGNATURE.every((b, i) => u[i] === b); };

  /* ---------- Conteneur CFB ---------- */
  function cfb(buf) {
    const u = vers8(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    if (!SIGNATURE.every((b, i) => u[i] === b)) throw new Error('Ce n\'est pas un classeur Excel 97-2003 (.xls).');
    const tS = 1 << dv.getUint16(0x1e, true), tM = 1 << dv.getUint16(0x20, true);
    const nFat = dv.getUint32(0x2c, true), dir0 = dv.getUint32(0x30, true), coupure = dv.getUint32(0x38, true);
    const miniFat0 = dv.getUint32(0x3c, true), nMiniFat = dv.getUint32(0x40, true), difat0 = dv.getUint32(0x44, true), nDifat = dv.getUint32(0x48, true);
    const off = s => (s + 1) * tS, u32 = (o) => (o + 4 <= u.length ? dv.getUint32(o, true) : LIBRE);
    // DIFAT : 109 entrées dans l'en-tête, puis secteurs DIFAT chaînés
    const difat = [];
    for (let i = 0; i < 109; i++) difat.push(u32(0x4c + i * 4));
    let s = difat0;
    for (let k = 0; k < nDifat && s !== FIN && s !== LIBRE; k++) { const o = off(s), n = tS / 4 - 1; for (let i = 0; i < n; i++) difat.push(u32(o + i * 4)); s = u32(o + n * 4); }
    const fat = [];
    difat.filter(x => x !== LIBRE && x !== FIN).slice(0, nFat).forEach(fs => { const o = off(fs); for (let i = 0; i < tS / 4; i++) fat.push(u32(o + i * 4)); });
    const chaine = (debut, table) => { const l = [], vus = new Set(); for (let x = debut; x !== FIN && x !== LIBRE && x < table.length && !vus.has(x); x = table[x]) { vus.add(x); l.push(x); } return l; };
    const lire = (debut, taille) => { const out = new Uint8Array(chaine(debut, fat).length * tS); chaine(debut, fat).forEach((x, i) => out.set(u.subarray(off(x), off(x) + tS), i * tS)); return taille === undefined ? out : out.subarray(0, taille); };
    // Répertoire : entrées de 128 octets (nom UTF-16, type, secteur de départ, taille)
    const rep = lire(dir0), dvr = new DataView(rep.buffer, rep.byteOffset, rep.byteLength), entrees = [];
    for (let o = 0; o + 128 <= rep.length; o += 128) {
      const lg = dvr.getUint16(o + 0x40, true), type = rep[o + 0x42];
      if (!type) continue;
      let nom = ''; for (let i = 0; i + 1 < Math.min(lg, 64) - 1; i += 2) nom += String.fromCharCode(dvr.getUint16(o + i, true));
      entrees.push({ nom, type, debut: dvr.getUint32(o + 0x74, true), taille: dvr.getUint32(o + 0x78, true) });
    }
    const racine = entrees.find(e => e.type === 5);
    const miniFat = [];
    chaine(miniFat0, fat).slice(0, nMiniFat || Infinity).forEach(x => { const o = off(x); for (let i = 0; i < tS / 4; i++) miniFat.push(u32(o + i * 4)); });
    const mini = racine ? lire(racine.debut, racine.taille) : new Uint8Array(0);
    const flux = nom => {
      const e = entrees.find(x => x.type === 2 && x.nom.toLowerCase() === nom.toLowerCase());
      if (!e) return null;
      if (e.taille >= coupure) return lire(e.debut, e.taille);
      const l = chaine(e.debut, miniFat), out = new Uint8Array(l.length * tM);
      l.forEach((x, i) => out.set(mini.subarray(x * tM, x * tM + tM), i * tM));
      return out.subarray(0, e.taille);
    };
    return { entrees, flux };
  }

  /* ---------- BIFF8 ---------- */
  // Nombre RK : entier sur 30 bits ou double tronqué, divisé par 100 si le bit 0 est levé
  function rk(v) {
    let n;
    if (v & 2) n = v >> 2;
    else { const b = new DataView(new ArrayBuffer(8)); b.setUint32(4, v & 0xfffffffc, true); b.setUint32(0, 0, true); n = b.getFloat64(0, true); }
    return v & 1 ? n / 100 : n;
  }
  // Chaîne BIFF8 : nb de caractères, options (bit 0 : 2 octets par caractère, bit 2 : extension, bit 3 : mise en forme)
  function chaineCourte(d, o, long = true) {
    const cch = long ? d.getUint16(o, true) : d.getUint8(o); o += long ? 2 : 1;
    const fl = d.getUint8(o++), large = fl & 1;
    let rich = 0, ext = 0;
    if (fl & 8) { rich = d.getUint16(o, true); o += 2; }
    if (fl & 4) { ext = d.getUint32(o, true); o += 4; }
    let t = '';
    for (let i = 0; i < cch && o < d.byteLength; i++) { t += String.fromCharCode(large ? d.getUint16(o, true) : d.getUint8(o)); o += large ? 2 : 1; }
    return { t, o: o + rich * 4 + ext };
  }
  // Table des chaînes : l'enregistrement SST et ses CONTINUE ; une chaîne coupée reprend dans le segment suivant par un
  // octet d'options (largeur des caractères restants)
  function sst(segments) {
    const out = [];
    let si = 0, seg = segments[0], o = 8;
    const dv = () => new DataView(seg.buffer, seg.byteOffset, seg.byteLength);
    const suivant = () => { si++; seg = segments[si]; o = 0; return !!seg; };
    // Une chaîne commence toujours entière dans un segment : au bout du segment, on passe au suivant (sans octet d'options)
    const debutChaine = () => (seg && o < seg.length ? true : suivant());
    const total = seg ? new DataView(seg.buffer, seg.byteOffset, seg.byteLength).getUint32(4, true) : 0;
    const sauter = n => { while (n > 0 && seg) { const k = Math.min(n, seg.length - o); o += k; n -= k; if (n > 0 && !suivant()) return; } };
    for (let i = 0; i < total; i++) {
      if (!debutChaine()) break;
      let d = dv();
      const cch = d.getUint16(o, true); o += 2;
      let fl = d.getUint8(o++), rich = 0, ext = 0;
      if (fl & 8) { rich = d.getUint16(o, true); o += 2; }
      if (fl & 4) { ext = d.getUint32(o, true); o += 4; }
      let t = '', reste = cch;
      while (reste > 0) {
        if (o >= seg.length) { if (!suivant()) break; d = dv(); fl = d.getUint8(o++); }
        const large = fl & 1, dispo = Math.floor((seg.length - o) / (large ? 2 : 1)), n = Math.min(reste, dispo);
        for (let k = 0; k < n; k++) { t += String.fromCharCode(large ? d.getUint16(o, true) : d.getUint8(o)); o += large ? 2 : 1; }
        reste -= n;
      }
      out.push(t);
      sauter(rich * 4 + ext);
    }
    return out;
  }
  function enregistrements(w, debut = 0) {
    const d = new DataView(w.buffer, w.byteOffset, w.byteLength), out = [];
    for (let o = debut; o + 4 <= w.length;) {
      const type = d.getUint16(o, true), lg = d.getUint16(o + 2, true);
      out.push({ type, o: o + 4, lg, data: w.subarray(o + 4, o + 4 + lg) });
      o += 4 + lg;
      if (type === 0x000a && debut) break; // EOF de la feuille
    }
    return out;
  }
  function lire(buf) {
    const c = cfb(buf), w = c.flux('Workbook');
    if (!w) throw new Error(c.flux('Book') ? 'Classeur Excel 5.0 / 95 (BIFF5) : enregistrez-le au format .xlsx.' : 'Classeur .xls sans feuille de calcul lisible.');
    const globaux = [];
    for (const r of enregistrements(w)) { globaux.push(r); if (r.type === 0x000a) break; }
    if (globaux.some(r => r.type === 0x002f)) throw new Error('Classeur .xls protégé par mot de passe : enregistrez-le sans protection.');
    // Feuilles (BOUNDSHEET : position du BOF de la feuille, type, nom) et table des chaînes
    const feuilles = globaux.filter(r => r.type === 0x0085).map(r => { const d = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength); return { pos: d.getUint32(0, true), type: r.data[5], name: chaineCourte(d, 6, false).t }; });
    const iSst = globaux.findIndex(r => r.type === 0x00fc);
    const segs = [];
    if (iSst >= 0) { segs.push(globaux[iSst].data); for (let k = iSst + 1; k < globaux.length && globaux[k].type === 0x003c; k++) segs.push(globaux[k].data); }
    const chaines = segs.length ? sst(segs) : [];
    return feuilles.filter(f => f.type === 0).map(f => {
      const rows = [], mettre = (r, col, v) => { (rows[r] = rows[r] || [])[col] = v; };
      let formuleTexte = null;
      for (const r of enregistrements(w, f.pos)) {
        const d = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength);
        if (r.lg < 4 && r.type !== 0x0207) continue;
        const ro = r.lg >= 4 ? d.getUint16(0, true) : 0, co = r.lg >= 4 ? d.getUint16(2, true) : 0;
        switch (r.type) {
          case 0x00fd: mettre(ro, co, chaines[d.getUint32(6, true)] ?? ''); break; // LABELSST
          case 0x0204: mettre(ro, co, chaineCourte(d, 6).t); break; // LABEL
          case 0x0203: mettre(ro, co, d.getFloat64(6, true)); break; // NUMBER
          case 0x027e: mettre(ro, co, rk(d.getUint32(6, true))); break; // RK
          case 0x00bd: { const n = (r.lg - 6) / 6; for (let k = 0; k < n; k++) mettre(ro, co + k, rk(d.getUint32(4 + k * 6 + 2, true))); break; } // MULRK
          case 0x0205: mettre(ro, co, r.data[7] ? '' : r.data[6] ? 'Oui' : 'Non'); break; // BOOLERR (erreur : vide)
          case 0x0006: { // FORMULA : résultat numérique, ou texte dans l'enregistrement STRING qui suit
            if (d.getUint16(12, true) === 0xffff) { const t = r.data[6]; if (t === 0) formuleTexte = [ro, co]; else if (t === 1) mettre(ro, co, r.data[8] ? 'Oui' : 'Non'); else mettre(ro, co, ''); }
            else mettre(ro, co, d.getFloat64(6, true));
            break;
          }
          case 0x0207: if (formuleTexte) { mettre(formuleTexte[0], formuleTexte[1], chaineCourte(d, 0).t); formuleTexte = null; } break; // STRING
          default: break; // BLANK, MULBLANK, mises en forme… ignorés
        }
      }
      for (let i = 0; i < rows.length; i++) rows[i] = rows[i] || [];
      return { name: f.name, rows };
    });
  }
  return { lire, estXls, cfb, rk };
})();
if (typeof module !== 'undefined') module.exports = Xls;
