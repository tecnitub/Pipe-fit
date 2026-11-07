// Photos et fiches techniques des articles depuis les liens d'un export fournisseur (Excel) :
// chaque article garde ses liens (photoUrl, ficheUrl) ; le serveur télécharge les photos une fois (JPEG, PNG, WebP,
// 5 Mo au plus) et les range sur l'article (photoId), et confie les fiches PDF au catalogue des fiches techniques
// (rangées par référence, retrouvées depuis l'article). Liens vers le réseau interne refusés ; erreurs listées.
const dns = require('node:dns').promises;
const net = require('node:net');
const crypto = require('node:crypto');

const MAX_PHOTO = 5 * 1024 * 1024;
// Adresses non publiques : boucle locale, réseau privé, lien local, CGNAT, multicast, IPv6 locales
function adressePrivee(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = String(ip).toLowerCase();
  if (x.startsWith('::ffff:')) return adressePrivee(x.slice(7));
  return x === '::' || x === '::1' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('ff');
}
async function verifierUrl(u) {
  let url; try { url = new URL(String(u || '').trim()); } catch (e) { throw new Error('lien invalide'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('lien http(s) attendu');
  const hote = url.hostname.replace(/^\[|\]$/g, '');
  const ips = net.isIP(hote) ? [hote] : (await dns.lookup(hote, { all: true }).catch(() => { throw new Error('serveur introuvable'); })).map(x => x.address);
  if (!ips.length || ips.some(adressePrivee)) throw new Error('adresse du réseau interne refusée');
  return url.href;
}
// Type d'une image d'après ses premiers octets
function typeImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return '';
}
const lienValide = u => /^https?:\/\/\S+$/i.test(String(u || '').trim());
// Photo principale d'une page produit : og:image, sinon twitter:image, sinon image « produit » de la page ; adresse complète
function imageDansPage(html, base) {
  const h = String(html || '').slice(0, 3e6), attr = (tag, nom) => { const m = new RegExp(`${nom}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag); return m ? m[1] : ''; };
  const metas = h.match(/<meta\b[^>]*>/gi) || [];
  const meta = cle => { const t = metas.find(m => new RegExp(`(?:property|name)\\s*=\\s*["']${cle}["']`, 'i').test(m)); return t ? attr(t, 'content') : ''; };
  let u = meta('og:image') || meta('og:image:url') || meta('twitter:image');
  if (!u) { const img = (h.match(/<img\b[^>]*>/gi) || []).find(t => /product|produit|main|zoom/i.test(t) && !/logo|picto|icon|pixel/i.test(t)); u = img ? attr(img, 'data-src') || attr(img, 'src') : ''; }
  if (!u) return '';
  try { const x = new URL(u.replace(/&amp;/g, '&'), base); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; }
}

function creer({ DB, db, broadcast, FICHES, fetchFn = (...a) => fetch(...a), verifier = verifierUrl, delai = 150 }) {
  const COL = 'articles', PAR = 'photos-fiches';
  let etat = null;
  const articles = () => db.prepare('SELECT data FROM records WHERE col = ?').all(COL).map(r => JSON.parse(r.data));
  const nouveauBlob = (mime, buf) => { const id = crypto.randomBytes(12).toString('hex'); db.prepare('INSERT INTO files (id, mime, data, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(id, mime, buf, PAR, new Date().toISOString()); return id; };
  function majArticle(id, champs, qui) {
    const ex = DB.getRecord(db, COL, id); if (!ex) return;
    const obj = { ...DB.clean(ex), ...champs }, now = new Date().toISOString();
    db.prepare(`INSERT INTO records (col, id, data, version, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, version = version + 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by`).run(COL, id, JSON.stringify(obj), now, qui);
    broadcast('change', { col: COL, record: DB.getRecord(db, COL, id), client: null });
  }
  async function telechargerPage(u) {
    const href = await verifier(u), ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetchFn(href, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Pipe-Fit (photos des articles)', Accept: 'text/html' } });
      if (!r.ok) throw new Error(`page produit : réponse ${r.status}`);
      const fin = r.url || href; if (fin !== href) await verifier(fin);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 3e6) throw new Error('page produit trop lourde');
      const img = imageDansPage(buf.toString('utf8'), fin);
      if (!img) throw new Error('pas de photo trouvée dans la page produit');
      return img;
    } catch (e) { throw new Error(e.name === 'AbortError' ? 'délai dépassé' : e.message); } finally { clearTimeout(t); }
  }
  async function telechargerPhoto(u) {
    const href = await verifier(u), ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetchFn(href, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Pipe-Fit (photos des articles)' } });
      if (!r.ok) throw new Error(`réponse ${r.status}`);
      if (r.url && r.url !== href) await verifier(r.url); // redirection : même contrôle
      if (Number(r.headers.get('content-length') || 0) > MAX_PHOTO) throw new Error('image trop lourde (5 Mo au plus)');
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_PHOTO) throw new Error('image trop lourde (5 Mo au plus)');
      const mime = typeImage(buf);
      if (!mime) throw new Error('le lien ne donne pas une image JPEG, PNG ou WebP');
      return { mime, buf };
    } catch (e) { throw new Error(e.name === 'AbortError' ? 'délai dépassé' : e.message); } finally { clearTimeout(t); }
  }
  // Ce qui reste à récupérer
  function aFaire(ids) {
    const l = articles().filter(a => !ids || ids.includes(a.id));
    return {
      photos: l.filter(a => (lienValide(a.photoUrl) && a.photoSource !== a.photoUrl.trim()) || (!lienValide(a.photoUrl) && lienValide(a.pageUrl) && a.photoSource !== a.pageUrl.trim())),
      fiches: l.filter(a => lienValide(a.ficheUrl) && a.ficheSource !== a.ficheUrl.trim()),
    };
  }
  const resume = () => { const f = aFaire(); return { photos: f.photos.length, fiches: f.fiches.length, avecPhoto: articles().filter(a => a.photoId).length, etat }; };
  function lancer(qui = PAR, ids = null) {
    if (etat && etat.enCours) return resume();
    const f = aFaire(Array.isArray(ids) ? ids.map(String) : null);
    etat = { enCours: true, total: f.photos.length, faits: 0, photos: 0, fiches: f.fiches.length, erreurs: [], debut: new Date().toISOString() };
    // Fiches : catalogue des fiches techniques (téléchargées une fois, rangées par référence)
    if (f.fiches.length && FICHES) {
      // Référence interne et références chez les fournisseurs (code produit) : la fiche se retrouve par l'une ou l'autre
      const nomEnt = id => { const e = id && DB.getRecord(db, 'entreprises', id); return e ? e.nom || '' : ''; };
      FICHES.catalogue(f.fiches.flatMap(a => [a.ref, ...Object.values(a.refsFournisseurs || {})].filter(Boolean).map(reference => ({ url: a.ficheUrl.trim(), reference: String(reference), designation: a.designation || '', fabricant: a.marque || nomEnt(a.ficheFournisseurId) }))), qui);
      f.fiches.forEach(a => majArticle(a.id, { ficheSource: a.ficheUrl.trim() }, qui));
    }
    const e = etat;
    (async () => {
      // Une même image pour plusieurs articles : téléchargée une fois
      // Une même page produit (plusieurs tailles d'un article) : lue une fois
      const deja = new Map(), pages = new Map(), pause = () => new Promise(r => setTimeout(r, delai));
      for (const a of f.photos) {
        const direct = lienValide(a.photoUrl), src = (direct ? a.photoUrl : a.pageUrl).trim();
        try {
          let u = src;
          if (!direct) { if (!pages.has(src)) { pages.set(src, telechargerPage(src).catch(err => ({ err }))); await pause(); } const p = await pages.get(src); if (p && p.err) throw p.err; u = p; }
          if (!deja.has(u)) { deja.set(u, telechargerPhoto(u).then(p => nouveauBlob(p.mime, p.buf)).catch(err => ({ err }))); await pause(); }
          const id = await deja.get(u); if (id && id.err) throw id.err;
          majArticle(a.id, { photoId: id, photoSource: src, ...(direct ? {} : { photoImage: u }) }, qui);
          e.photos++;
        } catch (err) { e.erreurs.push({ ref: a.ref || '', designation: a.designation || '', url: src, erreur: err.message }); }
        e.faits++;
      }
      e.enCours = false; e.fin = new Date().toISOString();
    })().catch(err => { e.enCours = false; e.erreurs.push({ url: '', erreur: err.message }); });
    return resume();
  }
  return { resume, lancer, aFaire };
}

module.exports = { creer, adressePrivee, verifierUrl, typeImage, lienValide, imageDansPage };
