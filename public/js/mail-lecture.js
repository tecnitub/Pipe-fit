// Lecture d'un e-mail enregistré : .eml (format standard, Outlook « Enregistrer sous », Thunderbird, Gmail) ou .msg
// (glisser-déposer depuis Outlook). Renvoie { de, deEmail, a, date (ISO), objet, texte, pieces: [noms] }.
// Tout se fait dans le navigateur ; le fichier d'origine est conservé tel quel à côté. Module commun navigateur / tests.
const MailLecture = (() => {
  const dec = (bytes, charset = 'utf-8') => { try { return new TextDecoder(charset.toLowerCase().replace(/^(us-ascii|ascii)$/, 'utf-8'), { fatal: false }).decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); } };
  const latin1 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return s; };
  const versOctets = s => Uint8Array.from(s, c => c.charCodeAt(0) & 255);
  const b64 = s => { const t = s.replace(/[^A-Za-z0-9+/=]/g, ''); return typeof atob === 'function' ? versOctets(atob(t)) : new Uint8Array(Buffer.from(t, 'base64')); };
  const qp = s => versOctets(s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))));
  // Texte d'un HTML d'e-mail : sauts de ligne gardés, balises et styles retirés
  const deHTML = h => String(h).replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, '\'')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const propre = t => String(t || '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const adresse = v => { const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(v || ''); return m ? { nom: m[1].trim() || m[2], email: m[2].trim() } : { nom: String(v || '').trim(), email: /@/.test(v || '') ? String(v).trim() : '' }; };

  /* ---------- .eml (MIME) ---------- */
  // En-têtes encodés « =?UTF-8?B?…?= » / « =?iso-8859-1?Q?…?= »
  const motsEncodes = s => String(s || '').replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (m, cs, enc, t) => dec(enc.toUpperCase() === 'B' ? b64(t) : qp(t.replace(/_/g, ' ')), cs));
  function entetes(bloc) {
    const h = {};
    bloc.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach(l => { const i = l.indexOf(':'); if (i > 0) { const k = l.slice(0, i).trim().toLowerCase(); if (!(k in h)) h[k] = l.slice(i + 1).trim(); } });
    return h;
  }
  const param = (v, nom) => { const m = new RegExp(`${nom}\\*?=\\s*(?:"([^"]*)"|([^;\\s]*))`, 'i').exec(v || ''); return m ? motsEncodes((m[1] ?? m[2] ?? '').replace(/^utf-8''/i, '').replace(/%([0-9A-F]{2})/gi, (x, c) => String.fromCharCode(parseInt(c, 16)))) : ''; };
  // Partie MIME (chaîne « binaire » latin1) -> { h, corps }
  function partie(brut) {
    const i = brut.search(/\r?\n\r?\n/);
    return i < 0 ? { h: entetes(brut), corps: '' } : { h: entetes(brut.slice(0, i)), corps: brut.slice(i).replace(/^\r?\n\r?\n/, '') };
  }
  function contenu(p) {
    const enc = (p.h['content-transfer-encoding'] || '').toLowerCase(), cs = param(p.h['content-type'], 'charset') || 'utf-8';
    const octets = enc === 'base64' ? b64(p.corps) : enc === 'quoted-printable' ? qp(p.corps) : versOctets(p.corps);
    return dec(octets, cs);
  }
  function parcourir(p, acc) {
    const type = (p.h['content-type'] || 'text/plain').toLowerCase(), disp = (p.h['content-disposition'] || '').toLowerCase();
    const nom = param(p.h['content-disposition'], 'filename') || param(p.h['content-type'], 'name');
    if (type.startsWith('multipart/')) {
      const bord = param(p.h['content-type'], 'boundary');
      if (!bord) return;
      p.corps.split(`--${bord}`).slice(1).filter(x => !/^--/.test(x)).forEach(x => parcourir(partie(x.replace(/^\r?\n/, '')), acc));
    } else if (nom || disp.startsWith('attachment')) acc.pieces.push(nom || 'pièce jointe');
    else if (type.startsWith('text/plain') && !acc.texte) acc.texte = contenu(p);
    else if (type.startsWith('text/html') && !acc.html) acc.html = contenu(p);
  }
  function lireEML(bytes) {
    const brut = latin1(bytes), p = partie(brut), acc = { texte: '', html: '', pieces: [] };
    parcourir(p, acc);
    const de = adresse(motsEncodes(p.h.from));
    const d = p.h.date ? new Date(p.h.date) : null;
    return { de: de.nom, deEmail: de.email, a: motsEncodes(p.h.to || ''), date: d && !isNaN(d) ? d.toISOString() : '', objet: motsEncodes(p.h.subject || ''),
      texte: propre(acc.texte || deHTML(acc.html)), pieces: acc.pieces };
  }

  /* ---------- .msg (Outlook : fichier composé OLE / CFB, propriétés MAPI) ---------- */
  function cfb(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = o => v.getUint16(o, true), u32 = o => v.getUint32(o, true);
    if (u32(0) !== 0xE011CFD0 || u32(4) !== 0xE11AB1A1) throw new Error('Ce fichier .msg n\'est pas un message Outlook');
    const tS = 1 << u16(30), tMini = 1 << u16(32), nbFat = u32(44), dir0 = u32(48), coupure = u32(56), miniFat0 = u32(60), difat0 = u32(68);
    const secteur = n => bytes.subarray(tS * (n + 1), tS * (n + 2));
    const difat = []; for (let i = 0; i < 109; i++) difat.push(u32(76 + 4 * i));
    for (let s = difat0, n = 0; s < 0xFFFFFFFA && n < 10000; n++) { const sv = new DataView(secteur(s).buffer, secteur(s).byteOffset, tS); for (let i = 0; i < tS / 4 - 1; i++) difat.push(sv.getUint32(4 * i, true)); s = sv.getUint32(tS - 4, true); }
    const fat = [];
    difat.slice(0, nbFat).forEach(s => { if (s >= 0xFFFFFFFA) return; const sv = new DataView(secteur(s).buffer, secteur(s).byteOffset, tS); for (let i = 0; i < tS / 4; i++) fat.push(sv.getUint32(4 * i, true)); });
    const chaine = (debut, table, lire, taille) => { const parts = []; for (let s = debut, n = 0; s < 0xFFFFFFFA && n < 1e6; n++) { parts.push(lire(s)); s = table[s]; } const out = new Uint8Array(parts.length * taille); parts.forEach((p, i) => out.set(p, i * taille)); return out; };
    const dirBytes = chaine(dir0, fat, secteur, tS);
    const entrees = [];
    for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
      const dv = new DataView(dirBytes.buffer, dirBytes.byteOffset + o, 128), lg = dv.getUint16(64, true);
      entrees.push({ nom: dec(dirBytes.subarray(o, o + Math.max(0, lg - 2)), 'utf-16le'), type: dirBytes[o + 66], g: dv.getUint32(68, true), d: dv.getUint32(72, true), enfant: dv.getUint32(76, true), debut: dv.getUint32(116, true), taille: dv.getUint32(120, true) });
    }
    const racine = entrees[0], miniFlux = chaine(racine.debut, fat, secteur, tS);
    const miniFat = []; if (miniFat0 < 0xFFFFFFFA) { const mf = chaine(miniFat0, fat, secteur, tS), mv = new DataView(mf.buffer, mf.byteOffset, mf.length); for (let i = 0; i < mf.length / 4; i++) miniFat.push(mv.getUint32(4 * i, true)); }
    const flux = e => (e.taille < coupure ? chaine(e.debut, miniFat, n => miniFlux.subarray(n * tMini, (n + 1) * tMini), tMini) : chaine(e.debut, fat, secteur, tS)).subarray(0, e.taille);
    // Enfants directs d'un stockage (arbre rouge-noir des frères)
    const enfants = e => { const out = [], pile = [e.enfant]; while (pile.length) { const i = pile.pop(); if (i >= entrees.length || i === 0xFFFFFFFF) continue; const x = entrees[i]; out.push(x); pile.push(x.g, x.d); } return out; };
    return { racine, enfants, flux };
  }
  function lireMSG(bytes) {
    const f = cfb(bytes);
    const props = stock => { const m = new Map(); f.enfants(stock).filter(e => e.type === 2).forEach(e => m.set(e.nom, e)); return m; };
    const chaineProp = (m, id) => { const u = m.get(`__substg1.0_${id}001F`), a = m.get(`__substg1.0_${id}001E`); return u ? dec(f.flux(u), 'utf-16le').replace(/\0+$/, '') : a ? dec(f.flux(a), 'windows-1252').replace(/\0+$/, '') : ''; };
    const top = props(f.racine);
    // Date : propriété fixe PR_CLIENT_SUBMIT_TIME (0x0039) ou PR_MESSAGE_DELIVERY_TIME (0x0E06) dans __properties_version1.0
    let date = '';
    const pv = top.get('__properties_version1.0');
    if (pv) {
      const b = f.flux(pv), dv = new DataView(b.buffer, b.byteOffset, b.length), dates = {};
      for (let o = 32; o + 16 <= b.length; o += 16) { const tag = dv.getUint32(o, true); if ((tag & 0xFFFF) === 0x0040) dates[tag >>> 16] = dv.getUint32(o + 8, true) + dv.getUint32(o + 12, true) * 4294967296; }
      const ft = dates[0x0039] || dates[0x0E06];
      if (ft) date = new Date(ft / 10000 - 11644473600000).toISOString();
    }
    const entetesInternet = chaineProp(top, '007D');
    if (!date && entetesInternet) { const d = new Date((entetes(entetesInternet).date) || ''); if (!isNaN(d)) date = d.toISOString(); }
    let texte = chaineProp(top, '1000');
    if (!texte) { const h = top.get('__substg1.0_10130102') || top.get('__substg1.0_1013001F'); if (h) texte = deHTML(dec(f.flux(h), h.nom.endsWith('001F') ? 'utf-16le' : 'utf-8')); }
    const pieces = f.enfants(f.racine).filter(e => e.type === 1 && e.nom.startsWith('__attach_version1.0_')).map(a => { const m = props(a); return chaineProp(m, '3707') || chaineProp(m, '3704') || chaineProp(m, '3001'); }).filter(Boolean);
    const email = chaineProp(top, '5D01') || chaineProp(top, '0C1F') || chaineProp(top, '0065');
    return { de: chaineProp(top, '0C1A') || chaineProp(top, '0042') || email, deEmail: /@/.test(email) ? email : '', a: chaineProp(top, '0E04'), date, objet: chaineProp(top, '0037'), texte: propre(texte), pieces };
  }
  // Selon le nom du fichier (.msg, .eml)
  const lire = (nom, bytes) => (/\.msg$/i.test(nom) ? lireMSG(bytes) : lireEML(bytes));
  return { lire, lireEML, lireMSG, deHTML };
})();
if (typeof module !== 'undefined') module.exports = MailLecture;
