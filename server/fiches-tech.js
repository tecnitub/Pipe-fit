// Bibliothèque des fiches techniques sur le serveur :
// - un dossier (par défaut <documents>/Fiches techniques, un sous-dossier par fabricant) est lu régulièrement : chaque PDF
//   nouveau ou modifié est gardé dans la base et rangé par fabricant et références (lus dans le nom et le texte du PDF) ;
//   un fichier retiré du dossier reste dans la bibliothèque, marqué « absent du dossier » ;
// - les fiches déposées dans l'appli ou téléchargées depuis les liens d'un catalogue fournisseur sont écrites dans ce dossier ;
// - les versions d'une même référence sont suivies (la plus récente en vigueur, les autres « remplacées ») ;
// - la recherche par fabricant + référence sert aux études, au DOE et à l'appli des compagnons.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const FT = require('../public/js/fiches-tech');

const COL = 'fichesTech', PAR = 'Bibliothèque des fiches';
const MAX = 40 * 1024 * 1024;
const uid = () => crypto.randomBytes(8).toString('hex');

// Texte des premières pages d'un PDF (pdf.js, sans navigateur) ; vide si illisible (scan)
let pdfjs = null;
async function textePdf(buf, pages = 3) {
  try {
    if (!pdfjs) { pdfjs = require('../public/vendor/pdfjs/pdf.min.js'); pdfjs.GlobalWorkerOptions.workerSrc = path.join(__dirname, '..', 'public', 'vendor', 'pdfjs', 'pdf.worker.min.js'); }
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
    const out = [];
    for (let p = 1; p <= Math.min(pages, doc.numPages); p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      let y = null, l = '';
      tc.items.forEach(i => { const yy = Math.round(i.transform[5]); if (y !== null && Math.abs(yy - y) > 2) { out.push(l); l = ''; } l += (l && !/\s$/.test(l) ? ' ' : '') + i.str; y = yy; });
      out.push(l);
    }
    await doc.destroy();
    return out.map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').normalize('NFKC').replace(/Ɵ/g, 'ti').replace(/Ʃ/g, 'tt');
  } catch (e) { return ''; }
}

function creer({ DB, db, broadcast, racineDocuments }) {
  db.exec('CREATE TABLE IF NOT EXISTS fiches_sync (rel TEXT PRIMARY KEY, fiche_id TEXT NOT NULL, taille INTEGER NOT NULL, mtime REAL NOT NULL)');
  const etat = { dernier: null, duree: 0, ajoutees: 0, modifiees: 0, absentes: 0, erreur: '', erreurs: [], catalogue: null };
  let enCours = null, minuterie = null;

  function config() {
    const c = DB.getConfig(db, 'fiches-tech') || {}, impose = process.env.FICHES_DIR || '';
    return { actif: impose ? true : c.actif !== false, chemin: path.resolve(impose || c.chemin || path.join(racineDocuments(), 'Fiches techniques')), impose: !!impose, intervalle: Math.max(5, Number(c.intervalle) || 30) };
  }
  function enregistrerConfig(b) {
    const c = DB.getConfig(db, 'fiches-tech') || {};
    c.actif = !!b.actif;
    if (b.chemin !== undefined) c.chemin = String(b.chemin || '').trim().slice(0, 400);
    if (b.intervalle !== undefined) c.intervalle = Math.max(5, Math.min(1440, Number(b.intervalle) || 30));
    DB.setConfig(db, 'fiches-tech', c);
    demarrer();
    return config();
  }

  const fiches = () => db.prepare('SELECT data FROM records WHERE col = ?').all(COL).map(r => JSON.parse(r.data));
  const fabricantsConnus = () => [...new Set(fiches().map(f => f.fabricant).filter(Boolean))];
  const nouveauBlob = (mime, buf) => { const id = crypto.randomBytes(12).toString('hex'); db.prepare('INSERT INTO files (id, mime, data, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(id, mime, buf, PAR, new Date().toISOString()); return id; };
  const blob = id => { const r = db.prepare('SELECT mime, data FROM files WHERE id = ?').get(String(id || '')); return r ? { mime: r.mime, data: Buffer.from(r.data) } : null; };
  function enregistrer(f, qui = PAR) {
    const ex = DB.getRecord(db, COL, f.id), now = new Date().toISOString(), obj = { ...(ex ? DB.clean(ex) : {}), ...f };
    db.prepare(`INSERT INTO records (col, id, data, version, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, version = version + 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by`).run(COL, f.id, JSON.stringify(obj), now, qui);
    const rec = DB.getRecord(db, COL, f.id);
    broadcast('change', { col: COL, record: rec, client: null });
    return rec;
  }
  // Versions : la plus récente d'une même référence en vigueur, les autres « remplacées »
  function appliquerVersions() { FT.versions(fiches()).forEach(c => enregistrer({ id: c.id, remplaceePar: c.remplaceePar })); }

  function lister(dir, base = '') {
    let out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (/^[._~]/.test(e.name)) continue;
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) out = out.concat(lister(path.join(dir, e.name), rel));
      else if (/\.pdf$/i.test(e.name)) out.push(rel);
    }
    return out;
  }

  // Lecture du dossier : fiches nouvelles ou modifiées gardées dans la base, fiches retirées marquées absentes
  async function synchroniser() {
    if (enCours) return enCours;
    enCours = (async () => {
      const c = config(), t0 = Date.now();
      Object.assign(etat, { ajoutees: 0, modifiees: 0, absentes: 0, erreur: '', erreurs: [] });
      try {
        if (!c.actif) return etat;
        fs.mkdirSync(c.chemin, { recursive: true });
        const rels = lister(c.chemin), connus = new Map(db.prepare('SELECT * FROM fiches_sync').all().map(r => [r.rel, r])), fabs = fabricantsConnus();
        for (const rel of rels) {
          try {
            const abs = path.join(c.chemin, ...rel.split('/')), st = fs.statSync(abs), row = connus.get(rel);
            if (row && row.taille === st.size && Math.abs(row.mtime - st.mtimeMs) < 1) continue;
            if (st.size > MAX) { etat.erreurs.push(`${rel} : trop volumineux`); continue; }
            const buf = fs.readFileSync(abs);
            if (buf.slice(0, 4).toString() !== '%PDF') { etat.erreurs.push(`${rel} : pas un PDF`); continue; }
            const a = FT.analyser({ nom: path.basename(rel), chemin: rel, texte: await textePdf(buf), fabricants: fabs, dateFichier: new Date(st.mtimeMs).toISOString() });
            const ex = row && DB.getRecord(db, COL, row.fiche_id);
            const id = ex ? ex.id : uid(), fichierId = nouveauBlob('application/pdf', buf);
            // Fiche déjà vérifiée par quelqu'un : fabricant, références et désignation gardés ; nouveau fichier = nouvelle date
            const lu = ex && ex.verifiee ? { date: a.date || ex.date } : { ...a, aVerifier: true };
            enregistrer({ id, ...lu, fichierId, nom: path.basename(rel), chemin: rel, source: ex ? ex.source || 'dossier' : 'dossier', absente: false, taille: st.size, ...(ex ? { modifieeLe: new Date().toISOString() } : { creeLe: new Date().toISOString() }) });
            db.prepare('INSERT INTO fiches_sync (rel, fiche_id, taille, mtime) VALUES (?, ?, ?, ?) ON CONFLICT(rel) DO UPDATE SET fiche_id = excluded.fiche_id, taille = excluded.taille, mtime = excluded.mtime').run(rel, id, st.size, st.mtimeMs);
            if (ex) etat.modifiees++; else etat.ajoutees++;
          } catch (e) { etat.erreurs.push(`${rel} : ${e.message}`); }
        }
        // Retirés du dossier (sauf dossier vide d'un coup : partage débranché) : gardés, marqués absents
        const presents = new Set(rels);
        if (rels.length || connus.size < 5) {
          connus.forEach((row, rel) => {
            if (presents.has(rel)) return;
            const f = DB.getRecord(db, COL, row.fiche_id);
            if (f && !f.absente) { enregistrer({ id: f.id, absente: true }); etat.absentes++; }
            db.prepare('DELETE FROM fiches_sync WHERE rel = ?').run(rel);
          });
        }
        appliquerVersions();
      } catch (e) { etat.erreur = e.message; }
      etat.dernier = new Date().toISOString(); etat.duree = Date.now() - t0;
      return etat;
    })().finally(() => { enCours = null; });
    return enCours;
  }

  // Écrit une fiche dans le dossier (<chemin>/<Fabricant>/<nom>) sans écraser ; renvoie le chemin relatif, ou '' si indisponible
  function ecrireDansDossier(fabricant, nom, buf, fiche) {
    const c = config();
    if (!c.actif) return '';
    try {
      const dossier = FT.nomFichier(fabricant || 'À classer'), base = FT.nomFichier(String(nom).replace(/\.pdf$/i, ''));
      fs.mkdirSync(path.join(c.chemin, dossier), { recursive: true });
      let n = `${base}.pdf`, k = 2;
      while (fs.existsSync(path.join(c.chemin, dossier, n))) n = `${base} (${k++}).pdf`;
      const abs = path.join(c.chemin, dossier, n);
      fs.writeFileSync(abs, buf);
      const st = fs.statSync(abs), rel = `${dossier}/${n}`;
      db.prepare('INSERT INTO fiches_sync (rel, fiche_id, taille, mtime) VALUES (?, ?, ?, ?) ON CONFLICT(rel) DO UPDATE SET fiche_id = excluded.fiche_id, taille = excluded.taille, mtime = excluded.mtime').run(rel, fiche, st.size, st.mtimeMs);
      return rel;
    } catch (e) { return ''; }
  }

  // Fichier déposé dans l'appli : lecture proposée (fabricant, références, date) et fiche déjà connue éventuelle
  async function analyserFichier(fichierId, nom) {
    const b = blob(fichierId);
    if (!b || b.mime !== 'application/pdf') throw Object.assign(new Error('Fiche introuvable ou pas un PDF'), { status: 400 });
    const a = FT.analyser({ nom, chemin: nom, texte: await textePdf(b.data), fabricants: fabricantsConnus() });
    const existe = a.references.map(r => FT.chercher(fiches(), { fabricant: a.fabricant, reference: r })).find(x => x && x.exacte);
    return { ...a, existe: existe ? { id: existe.fiche.id, nom: existe.fiche.nom, date: existe.fiche.date || '' } : null };
  }
  // Dépôt validé : fiche créée (fichier déjà dans la base) et écrite dans le dossier du fabricant
  function deposer(d, qui) {
    const b = blob(d.fichierId);
    if (!b || b.mime !== 'application/pdf') throw Object.assign(new Error(`${d.nom || 'Fichier'} : PDF introuvable`), { status: 400 });
    const id = uid(), refs = (Array.isArray(d.references) ? d.references : String(d.references || '').split(/[,;\n]/)).map(r => String(r).trim()).filter(Boolean).slice(0, 30);
    const rel = ecrireDansDossier(d.fabricant, d.nom || refs[0] || 'fiche', b.data, id);
    const rec = enregistrer({ id, fabricant: String(d.fabricant || '').trim().slice(0, 60), references: refs, designation: String(d.designation || '').slice(0, 160), famille: String(d.famille || '').slice(0, 30),
      date: String(d.date || '').slice(0, 10), fichierId: d.fichierId, nom: String(d.nom || '').slice(0, 160), chemin: rel, source: d.source || 'depot', url: d.url || '', verifiee: true, aVerifier: false, absente: false, creeLe: new Date().toISOString() }, qui);
    if (!d.sansVersions) appliquerVersions();
    return DB.getRecord(db, COL, rec.id);
  }

  // Catalogue fournisseur : les PDF des liens sont téléchargés une fois et gardés (le DOE ne dépend plus d'un lien) ;
  // un lien déjà téléchargé reçoit les références supplémentaires ; liens cassés signalés
  async function telecharger(url) {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Pipe-Fit (fiches techniques)' } });
      if (!r.ok) throw new Error(`réponse ${r.status}`);
      if (Number(r.headers.get('content-length') || 0) > MAX) throw new Error('trop volumineux');
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.slice(0, 4).toString() !== '%PDF') throw new Error('le lien ne donne pas un PDF (page web ?)');
      if (buf.length > MAX) throw new Error('trop volumineux');
      return buf;
    } catch (e) { throw new Error(e.name === 'AbortError' ? 'délai dépassé' : e.message); } finally { clearTimeout(t); }
  }
  function catalogue(lignes, qui) {
    if (etat.catalogue && etat.catalogue.enCours) return etat.catalogue;
    const parUrl = new Map();
    (lignes || []).slice(0, 5000).forEach(l => { if (!/^https?:\/\//i.test(l.url || '')) return; const k = String(l.url).trim(); if (!parUrl.has(k)) parUrl.set(k, []); parUrl.get(k).push(l); });
    const c = etat.catalogue = { enCours: true, total: parUrl.size, faits: 0, telechargees: 0, deja: 0, erreurs: [], debut: new Date().toISOString() };
    (async () => {
      for (const [url, ls] of parUrl) {
        try {
          const refs = [...new Set(ls.map(l => String(l.reference || '').trim()).filter(Boolean))], fab = (ls.find(l => l.fabricant) || {}).fabricant || '';
          const ex = fiches().find(f => f.url === url && !f.absente);
          if (ex) {
            const plus = refs.filter(r => !(ex.references || []).some(x => FT.cle(x) === FT.cle(r)));
            if (plus.length) enregistrer({ id: ex.id, references: [...(ex.references || []), ...plus] }, qui);
            c.deja++;
          } else {
            const buf = await telecharger(url), texte = await textePdf(buf), nom = decodeURIComponent((/([^/?#]+\.pdf)(?:[?#]|$)/i.exec(url) || [])[1] || `${refs[0] || 'fiche'}.pdf`);
            const a = FT.analyser({ nom, chemin: nom, texte, fabricants: fab ? [fab] : fabricantsConnus() });
            const fichierId = nouveauBlob('application/pdf', buf);
            deposer({ fichierId, nom, fabricant: fab || a.fabricant, references: [...refs, ...a.references.filter(r => !refs.some(x => FT.cle(x) === FT.cle(r)))], designation: (ls.find(l => l.designation) || {}).designation || a.designation, famille: a.famille, date: a.date, source: 'catalogue', url, sansVersions: true }, qui);
            c.telechargees++;
          }
        } catch (e) { c.erreurs.push({ url, reference: (ls[0] || {}).reference || '', fabricant: (ls[0] || {}).fabricant || '', erreur: e.message }); }
        c.faits++;
      }
      appliquerVersions();
      c.enCours = false; c.fin = new Date().toISOString();
    })().catch(e => { c.enCours = false; c.erreurs.push({ url: '', erreur: e.message }); });
    return c;
  }

  // Recherche groupée : [{ cle, fabricant, reference, date }] → [{ cle, fiche | null }]
  const trouver = demandes => FT.trouver(fiches(), demandes);

  function demarrer() {
    if (minuterie) clearInterval(minuterie);
    const c = config();
    if (!c.actif) return;
    setTimeout(() => synchroniser().catch(() => {}), 15000).unref();
    minuterie = setInterval(() => synchroniser().catch(() => {}), c.intervalle * 60000);
    minuterie.unref();
  }
  return { config, enregistrerConfig, etat: () => ({ ...etat, enCours: !!enCours, nombre: fiches().filter(f => !f.absente).length }), synchroniser, analyserFichier, deposer, catalogue, trouver, demarrer, textePdf };
}
module.exports = { creer, textePdf };
