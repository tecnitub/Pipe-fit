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
const IC = require('../public/js/inventaire-cvc');

const COL = 'fichesTech', PAR = 'Bibliothèque des fiches';
const MAX = 40 * 1024 * 1024;
const uid = () => crypto.randomBytes(8).toString('hex');

// Texte des pages d'un PDF (pdf.js, sans navigateur), une chaîne par page ; vide si illisible (scan)
let pdfjs = null;
async function textePages(buf, pages = 40) {
  try {
    if (!pdfjs) { pdfjs = require('../public/vendor/pdfjs/pdf.min.js'); pdfjs.GlobalWorkerOptions.workerSrc = path.join(__dirname, '..', 'public', 'vendor', 'pdfjs', 'pdf.worker.min.js'); }
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
    const out = [];
    for (let p = 1; p <= Math.min(pages, doc.numPages); p++) {
      const tc = await (await doc.getPage(p)).getTextContent(), lignes = [];
      let y = null, l = '';
      tc.items.forEach(i => { const yy = Math.round(i.transform[5]); if (y !== null && Math.abs(yy - y) > 2) { lignes.push(l); l = ''; } l += (l && !/\s$/.test(l) ? ' ' : '') + i.str; y = yy; });
      lignes.push(l);
      out.push(lignes.map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').normalize('NFKC').replace(/Ɵ/g, 'ti').replace(/Ʃ/g, 'tt'));
    }
    await doc.destroy();
    return out;
  } catch (e) { return []; }
}
const textePdf = async (buf, pages = 3) => (await textePages(buf, pages)).join('\n');
const sha1 = buf => crypto.createHash('sha1').update(buf).digest('hex');
// Caractéristiques lues dans le texte : de la fiche entière, et de chaque référence (fiche de gamme : tableau par modèle)
function caracDe(texte, references) {
  const vide = c => !Object.keys(c).length;
  const carac = IC.caracteristiques(texte), parRef = {};
  (references || []).slice(0, 30).forEach(r => { const x = FT.extraitPour(texte, r, 600); if (x !== texte) { const c = IC.caracteristiques(x); if (!vide(c)) parRef[FT.cle(r)] = c; } });
  return { carac: vide(carac) ? null : carac, caracParRef: Object.keys(parRef).length ? parRef : null };
}

function creer({ DB, db, broadcast, racineDocuments }) {
  db.exec(`CREATE TABLE IF NOT EXISTS fiches_sync (rel TEXT PRIMARY KEY, fiche_id TEXT NOT NULL, taille INTEGER NOT NULL, mtime REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS fiches_texte (fiche_id TEXT PRIMARY KEY, pages TEXT NOT NULL)`);
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
  // Fabricants écrits de plusieurs façons : nom retenu ({ cleFab: nom })
  const alias = () => DB.getConfig(db, 'fiches-alias') || {};
  function enregistrer(f, qui = PAR) {
    const ex = DB.getRecord(db, COL, f.id), now = new Date().toISOString(), obj = { ...(ex ? DB.clean(ex) : {}), ...f };
    if (f.fabricant) obj.fabricant = FT.fabricantRetenu(f.fabricant, alias());
    db.prepare(`INSERT INTO records (col, id, data, version, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, version = version + 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by`).run(COL, f.id, JSON.stringify(obj), now, qui);
    const rec = DB.getRecord(db, COL, f.id);
    broadcast('change', { col: COL, record: rec, client: null });
    return rec;
  }
  // Versions : la plus récente d'une même référence en vigueur, les autres « remplacées »
  function appliquerVersions() { FT.versions(fiches()).forEach(c => enregistrer({ id: c.id, remplaceePar: c.remplaceePar })); }
  // Texte de toutes les pages gardé à part (recherche dans le texte) ; caractéristiques et type tirés du texte
  function indexer(id, pages, references) {
    db.prepare('INSERT INTO fiches_texte (fiche_id, pages) VALUES (?, ?) ON CONFLICT(fiche_id) DO UPDATE SET pages = excluded.pages').run(id, JSON.stringify((pages || []).map(p => String(p).slice(0, 20000))));
    const t = (pages || []).join('\n');
    return { ...caracDe(t, references), scan: !t.replace(/\s/g, '').length };
  }
  const pagesDe = id => { const r = db.prepare('SELECT pages FROM fiches_texte WHERE fiche_id = ?').get(String(id)); return r ? JSON.parse(r.pages) : []; };

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
            const pages = await textePages(buf), texte = pages.slice(0, 3).join('\n');
            const a = FT.analyser({ nom: path.basename(rel), chemin: rel, texte, fabricants: fabs, dateFichier: new Date(st.mtimeMs).toISOString() });
            const ex = row && DB.getRecord(db, COL, row.fiche_id);
            const id = ex ? ex.id : uid(), fichierId = nouveauBlob('application/pdf', buf);
            // Fiche déjà vérifiée par quelqu'un : fabricant, références et désignation gardés ; nouveau fichier = nouvelle date
            const lu = ex && ex.verifiee ? { date: a.date || ex.date } : { ...a, type: FT.typeDocument(path.basename(rel), rel, texte), aVerifier: true };
            enregistrer({ id, ...lu, ...indexer(id, pages, (ex && ex.verifiee ? ex : a).references), hash: sha1(buf), fichierId, nom: path.basename(rel), chemin: rel, source: ex ? ex.source || 'dossier' : 'dossier', absente: false, taille: st.size, ...(ex ? { modifieeLe: new Date().toISOString() } : { creeLe: new Date().toISOString() }) });
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
  // Texte lu par reconnaissance de caractères dans le navigateur (fiche scannée) : « texte » fourni
  async function analyserFichier(fichierId, nom, texteOcr = '') {
    const b = blob(fichierId);
    if (!b || b.mime !== 'application/pdf') throw Object.assign(new Error('Fiche introuvable ou pas un PDF'), { status: 400 });
    const lu = await textePdf(b.data), texte = lu.replace(/\s/g, '').length > 40 || !texteOcr ? lu : String(texteOcr);
    const a = FT.analyser({ nom, chemin: nom, texte, fabricants: fabricantsConnus() });
    a.fabricant = FT.fabricantRetenu(a.fabricant, alias());
    const h = sha1(b.data), meme = fiches().find(f => f.hash === h && !f.absente);
    const existe = meme ? { fiche: meme } : a.references.map(r => FT.chercher(fiches(), { fabricant: a.fabricant, reference: r })).find(x => x && x.exacte);
    return { ...a, type: FT.typeDocument(nom, nom, texte), scan: !texte.replace(/\s/g, '').length, ocr: texte === texteOcr && !!texteOcr, memeFichier: !!meme, existe: existe ? { id: existe.fiche.id, nom: existe.fiche.nom, date: existe.fiche.date || '' } : null };
  }
  // Dépôt validé : fiche créée (fichier déjà dans la base) et écrite dans le dossier du fabricant
  function deposer(d, qui) {
    const b = blob(d.fichierId);
    if (!b || b.mime !== 'application/pdf') throw Object.assign(new Error(`${d.nom || 'Fichier'} : PDF introuvable`), { status: 400 });
    const id = uid(), refs = (Array.isArray(d.references) ? d.references : String(d.references || '').split(/[,;\n]/)).map(r => String(r).trim()).filter(Boolean).slice(0, 30);
    const rel = ecrireDansDossier(d.fabricant, d.nom || refs[0] || 'fiche', b.data, id);
    const pages = Array.isArray(d.pages) && d.pages.length ? d.pages : null;
    const ix = indexer(id, pages || [], refs);
    const rec = enregistrer({ id, type: FT.TYPES_DOC[d.type] ? d.type : 'fiche', fabricant: String(d.fabricant || '').trim().slice(0, 60), references: refs, designation: String(d.designation || '').slice(0, 160), famille: String(d.famille || '').slice(0, 30),
      date: String(d.date || '').slice(0, 10), fichierId: d.fichierId, nom: String(d.nom || '').slice(0, 160), chemin: rel, source: d.source || 'depot', url: d.url || '', hash: sha1(b.data), verifiee: d.verifiee !== false, aVerifier: d.verifiee === false, absente: false,
      ...(d.demandeId ? { demandeId: d.demandeId, recuDe: String(d.recuDe || '') } : {}), ...ix, creeLe: new Date().toISOString() }, qui);
    // Texte lu par le serveur quand il n'a pas été fourni (dépôt depuis l'appli) : indexé en arrière-plan
    if (!pages) textePages(b.data).then(pg => { const t = pg.join('').replace(/\s/g, ''); if (t || !d.texteOcr) enregistrer({ id, ...indexer(id, t ? pg : [String(d.texteOcr || '')], refs) }); else enregistrer({ id, ...indexer(id, [String(d.texteOcr)], refs) }); }).catch(() => {});
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
            const buf = await telecharger(url), pages = await textePages(buf), texte = pages.slice(0, 3).join('\n'), nom = decodeURIComponent((/([^/?#]+\.pdf)(?:[?#]|$)/i.exec(url) || [])[1] || `${refs[0] || 'fiche'}.pdf`);
            const a = FT.analyser({ nom, chemin: nom, texte, fabricants: fab ? [fab] : fabricantsConnus() });
            const fichierId = nouveauBlob('application/pdf', buf);
            deposer({ fichierId, nom, fabricant: fab || a.fabricant, references: [...refs, ...a.references.filter(r => !refs.some(x => FT.cle(x) === FT.cle(r)))], designation: (ls.find(l => l.designation) || {}).designation || a.designation, famille: a.famille, type: FT.typeDocument(nom, nom, texte), date: a.date, source: 'catalogue', url, pages, sansVersions: true }, qui);
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

  // Texte d'une fiche scannée, lu dans le navigateur : fabricant, références et date proposés si la fiche n'a pas été vérifiée
  function texteOcr(id, texte) {
    const f = DB.getRecord(db, COL, String(id || ''));
    if (!f) throw Object.assign(new Error('Fiche introuvable'), { status: 404 });
    const t = String(texte || '').slice(0, 200000);
    const a = FT.analyser({ nom: f.nom, chemin: f.chemin || f.nom, texte: t, fabricants: fabricantsConnus() });
    const lu = f.verifiee ? {} : { fabricant: f.fabricant || a.fabricant, references: [...new Set([...(f.references || []), ...a.references])].slice(0, 30), date: f.date || a.date, type: FT.typeDocument(f.nom, f.chemin, t) };
    return enregistrer({ id: f.id, ...lu, ...indexer(f.id, [t], lu.references || f.references), ocr: true });
  }

  // Recherche dans le texte : chaque mot cherché (sans accents) ; fiches en vigueur d'abord, page et extrait
  function rechercher(q, max = 50) {
    const n = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const mots = n(q).split(/\s+/).filter(m => m.length >= 2).slice(0, 8);
    if (!mots.length) return [];
    const parId = new Map(fiches().filter(f => !f.absente).map(f => [f.id, f])), out = [];
    for (const r of db.prepare('SELECT fiche_id, pages FROM fiches_texte').all()) {
      const f = parId.get(r.fiche_id);
      if (!f) continue;
      const pages = JSON.parse(r.pages), entete = n(`${f.fabricant} ${(f.references || []).join(' ')} ${f.designation}`);
      pages.forEach((p, i) => {
        const x = n(p);
        if (!mots.every(m => x.includes(m) || entete.includes(m))) return;
        const m0 = mots.find(m => x.includes(m)), j = m0 ? x.indexOf(m0) : 0;
        out.push({ id: f.id, fichierId: f.fichierId, type: f.type || 'fiche', fabricant: f.fabricant, references: f.references, designation: f.designation, nom: f.nom, date: f.date || '', remplacee: !!f.remplaceePar, page: i + 1, extrait: p.slice(Math.max(0, j - 80), j + 160).replace(/\s+/g, ' ') });
      });
      if (out.length > max * 4) break;
    }
    return out.sort((a, b) => a.remplacee - b.remplacee || String(b.date).localeCompare(String(a.date))).slice(0, max);
  }

  // Fabricants à uniformiser : le nom retenu remplace les autres partout et sert aux prochaines lectures
  function uniformiser(noms, nom, qui) {
    const a = alias(), cible = String(nom || '').trim().slice(0, 60);
    if (!cible) throw Object.assign(new Error('Nom du fabricant à retenir manquant'), { status: 400 });
    (noms || []).forEach(x => { a[FT.cleFab(x)] = cible; });
    DB.setConfig(db, 'fiches-alias', a);
    let n = 0;
    fiches().filter(f => (noms || []).includes(f.fabricant) && f.fabricant !== cible).forEach(f => { enregistrer({ id: f.id, fabricant: cible }, qui); n++; });
    appliquerVersions();
    return { modifiees: n };
  }

  /* ---------- Demandes de fiches aux fournisseurs ---------- */
  // { id, to, fournisseurId, fournisseur, lignes: [{ fabricant, reference, affaireId }], envoyeeLe, relances: [dates], expediteur, statut }
  const demandes = () => DB.getConfig(db, 'fiches-demandes') || [];
  const garderDemandes = l => DB.setConfig(db, 'fiches-demandes', l.slice(-300));
  function ajouterDemande(d) { const l = demandes(), id = crypto.randomBytes(4).toString('hex'); l.push({ ...d, id, statut: 'envoyée', relances: [] }); garderDemandes(l); return id; }
  function majDemande(id, maj) { const l = demandes(), d = l.find(x => x.id === id); if (d) Object.assign(d, maj); garderDemandes(l); return d; }
  // Références encore sans fiche d'une demande
  const manquantesDe = d => (d.lignes || []).filter((l, i) => !FT.trouver(fiches(), [{ cle: i, fabricant: l.fabricant, reference: l.reference }])[0].fiche);
  // Réponse reçue dans la boîte des offres (« [FT-xxxx] » dans l'objet) : les PDF joints deviennent des fiches « à vérifier »
  async function recevoirMail(mail, fichiers) {
    const id = FT.repereDemande(`${mail.objet} ${mail.texte}`), d = id && demandes().find(x => x.id === id);
    if (!d) return 0;
    const fabs = [...new Set((d.lignes || []).map(l => l.fabricant).filter(Boolean))];
    let n = 0;
    for (const f of fichiers.filter(x => /\.pdf$/i.test(x.nom) && x.data.slice(0, 4).toString() === '%PDF')) {
      const pages = await textePages(f.data), texte = pages.slice(0, 3).join('\n');
      const a = FT.analyser({ nom: f.nom, chemin: f.nom, texte, fabricants: fabs.length ? fabs : fabricantsConnus() });
      // Référence demandée citée dans le nom ou le texte : rattachée
      const refs = (d.lignes || []).filter(l => FT.extraitPour(`${f.nom} ${texte}`, l.reference) !== `${f.nom} ${texte}`).map(l => l.reference);
      deposer({ fichierId: nouveauBlob('application/pdf', f.data), nom: f.nom, fabricant: a.fabricant || (fabs.length === 1 ? fabs[0] : ''), references: [...new Set([...refs, ...a.references])], designation: a.designation, famille: a.famille,
        type: FT.typeDocument(f.nom, f.nom, texte), date: a.date, source: 'mail', pages, verifiee: false, demandeId: d.id, recuDe: mail.deEmail }, 'Boîte des offres');
      n++;
    }
    majDemande(d.id, { reponseLe: new Date().toISOString(), statut: manquantesDe(d).length ? 'réponse partielle' : 'reçue' });
    return n || -1; // -1 : réponse sans PDF, reconnue tout de même
  }

  function demarrer() {
    if (minuterie) clearInterval(minuterie);
    const c = config();
    if (!c.actif) return;
    setTimeout(() => synchroniser().catch(() => {}), 15000).unref();
    minuterie = setInterval(() => synchroniser().catch(() => {}), c.intervalle * 60000);
    minuterie.unref();
  }
  return { config, enregistrerConfig, etat: () => ({ ...etat, enCours: !!enCours, nombre: fiches().filter(f => !f.absente).length }), synchroniser, analyserFichier, deposer, catalogue, trouver, demarrer, textePdf,
    fiches, pagesDe, texteOcr, rechercher, uniformiser, alias, demandes, ajouterDemande, majDemande, manquantesDe, recevoirMail };
}
module.exports = { creer, textePdf, textePages };
