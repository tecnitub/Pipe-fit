// Répertoire des documents sur le serveur, synchronisé avec l'appli dans les deux sens :
//   <racine>/Chantiers/<code> - <nom>/<catégorie>/<fichier>
// - un document déposé dans l'appli est écrit dans le répertoire (nouvel indice : l'ancien fichier part dans « _Indices précédents ») ;
// - un fichier copié dans le dossier d'un chantier apparaît dans l'appli (catégorie d'après le sous-dossier, ou devinée
//   d'après le nom s'il est posé à la racine du chantier, puis rangé dans le dossier de sa catégorie) ;
// - un fichier remplacé dans le répertoire devient un nouvel indice ; renommé ou déplacé, il est suivi ;
// - supprimé dans l'appli, le fichier part dans « _Corbeille » ; supprimé du répertoire, il est retiré de l'appli
//   (sauf suppression massive, signe d'un partage réseau débranché ou d'une erreur : rien n'est alors retiré).
// Les fichiers restent aussi dans la base : l'appli fonctionne même si le répertoire est indisponible.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Classement = require('../public/js/classement');

const PAR = 'Répertoire serveur';
const sha1 = buf => crypto.createHash('sha1').update(buf).digest('hex');
const relPosix = (...p) => p.filter(Boolean).join('/');

function creer({ DB, db, broadcast, notifier, TYPES, MAX, dossierDefaut, uid }) {
  db.exec(`CREATE TABLE IF NOT EXISTS doc_sync (affaire_id TEXT NOT NULL, rel TEXT NOT NULL, doc_id TEXT NOT NULL, fichier_id TEXT NOT NULL,
    taille INTEGER NOT NULL, mtime REAL NOT NULL, hash TEXT NOT NULL, categorie TEXT, PRIMARY KEY (affaire_id, rel))`);
  const etat = { dernier: null, duree: 0, exportes: 0, importes: 0, nouveauxIndices: 0, deplaces: 0, supprimes: 0, ignores: [], alertes: [], erreur: '' };
  let enCours = null, minuterie = null;

  function config() {
    const c = DB.getConfig(db, 'documents-dossier') || {};
    const impose = process.env.DOCUMENTS_DIR || '';
    return { actif: impose ? true : c.actif !== false, chemin: path.resolve(impose || c.chemin || dossierDefaut), impose: !!impose,
      transmettre: c.transmettre !== false, intervalle: Math.max(10, Number(c.intervalle) || 30) };
  }
  function enregistrerConfig(b) {
    const c = DB.getConfig(db, 'documents-dossier') || {};
    Object.assign(c, { actif: !!b.actif, transmettre: !!b.transmettre, intervalle: Math.max(10, Math.min(3600, Number(b.intervalle) || 30)) });
    if (b.chemin !== undefined) c.chemin = String(b.chemin || '').trim().slice(0, 400);
    DB.setConfig(db, 'documents-dossier', c);
    return config();
  }

  const blob = id => { const r = db.prepare('SELECT mime, data FROM files WHERE id = ?').get(id); return r ? { mime: r.mime, data: Buffer.from(r.data) } : null; };
  const nouveauBlob = (mime, buf) => { const id = crypto.randomBytes(12).toString('hex'); db.prepare('INSERT INTO files (id, mime, data, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(id, mime, buf, PAR, new Date().toISOString()); return id; };
  const mimeDe = nom => TYPES[String((/\.([a-z0-9]+)$/i.exec(nom) || [])[1] || '').toLowerCase()];

  // Fichiers du dossier d'un chantier (chemins relatifs « Plan/iso.pdf »), hors dossiers techniques
  function lister(dir, base = '') {
    const out = new Map();
    let entrees = [];
    try { entrees = fs.readdirSync(path.join(dir, base), { withFileTypes: true }); } catch (e) { return out; }
    for (const e of entrees) {
      if (Classement.ignore(e.name)) continue;
      const rel = relPosix(base, e.name);
      if (e.isDirectory()) { if (rel.split('/').length < 4) lister(dir, rel).forEach((v, k) => out.set(k, v)); continue; }
      if (!e.isFile()) continue;
      try { const st = fs.statSync(path.join(dir, rel)); out.set(rel, { taille: st.size, mtime: st.mtimeMs }); } catch (err) { /* fichier disparu entre-temps */ }
    }
    return out;
  }
  const ecrire = (dir, rel, buf) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); return fs.statSync(f).mtimeMs; };
  const deplacer = (de, vers) => { fs.mkdirSync(path.dirname(vers), { recursive: true }); fs.renameSync(de, vers); };
  const libre = (dir, rel, pris) => {
    // Nom unique dans le dossier : « plan.pdf », « plan (2).pdf »…
    const ext = path.posix.extname(rel), b = rel.slice(0, rel.length - ext.length);
    for (let i = 1; ; i++) { const r = i === 1 ? rel : `${b} (${i})${ext}`; if (!pris.has(r.toLowerCase())) return r; }
  };
  const horodatage = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  // Dossier du chantier : créé au besoin, renommé si le chantier a été renommé (repéré par son code)
  function dossierDe(racineCh, a, noms) {
    const attendu = Classement.dossierChantier(a), code = String(a.code || a.id).toLowerCase();
    const existant = noms.find(n => n === attendu) || noms.find(n => n.toLowerCase() === code || n.toLowerCase().startsWith(`${code} `));
    if (existant && existant !== attendu && !noms.includes(attendu)) {
      try { fs.renameSync(path.join(racineCh, existant), path.join(racineCh, attendu)); return { dir: path.join(racineCh, attendu), existait: true }; }
      catch (e) { return { dir: path.join(racineCh, existant), existait: true }; }
    }
    return { dir: path.join(racineCh, existant || attendu), existait: !!existant };
  }

  function synchroChantier(racine, racineCh, a, noms, bilan) {
    const docs = a.documents || [];
    const { dir, existait } = dossierDe(racineCh, a, noms);
    if (!existait && !docs.length) return;
    fs.mkdirSync(dir, { recursive: true });
    const lignes = db.prepare('SELECT * FROM doc_sync WHERE affaire_id = ?').all(a.id);
    const parDoc = new Map(lignes.map(l => [l.doc_id, l]));
    const fichiers = lister(dir), pris = new Set(), maintenant = Date.now();
    const sauver = (l) => db.prepare(`INSERT INTO doc_sync (affaire_id, rel, doc_id, fichier_id, taille, mtime, hash, categorie) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(affaire_id, rel) DO UPDATE SET doc_id = excluded.doc_id, fichier_id = excluded.fichier_id, taille = excluded.taille, mtime = excluded.mtime, hash = excluded.hash, categorie = excluded.categorie`)
      .run(a.id, l.rel, l.doc_id, l.fichier_id, l.taille, l.mtime, l.hash, l.categorie || '');
    const oublier = rel => db.prepare('DELETE FROM doc_sync WHERE affaire_id = ? AND rel = ?').run(a.id, rel);
    const ops = { ajouts: [], maj: new Map(), suppr: new Set() };
    const majDoc = (id, f) => { const prec = ops.maj.get(id); ops.maj.set(id, prec ? d => f(prec(d)) : f); };
    const suivis = new Set(lignes.map(l => l.rel));
    const disparus = [];

    // 1. Documents de l'appli
    for (const d of docs) {
      const l = parDoc.get(d.id);
      // Catégorie changée dans l'appli : le document quitte son sous-dossier libre pour celui de sa catégorie
      const sousDossier = d.dossier && (!l || l.categorie === d.categorie) ? d.dossier : Classement.dossierCategorie(d.categorie);
      const relAttendu = libre(dir, relPosix(sousDossier, Classement.propre(d.nom)), pris);
      if (l) {
        const f = fichiers.get(l.rel);
        if (!f) { disparus.push({ d, l }); pris.add(l.rel.toLowerCase()); continue; }
        let hashDisque = l.hash;
        const modifDisque = f.taille !== l.taille || Math.abs(f.mtime - l.mtime) > 1;
        if (modifDisque && maintenant - f.mtime < 3000) { pris.add(l.rel.toLowerCase()); continue; } // copie en cours
        if (modifDisque) hashDisque = sha1(fs.readFileSync(path.join(dir, l.rel)));
        const changeDisque = hashDisque !== l.hash, changeAppli = d.fichierId !== l.fichier_id;
        let rel = l.rel;
        if (changeAppli) {
          const b = blob(d.fichierId);
          if (!b) { pris.add(rel.toLowerCase()); continue; }
          // Ancienne version conservée : nouvel indice dans l'appli, ou copie de sauvegarde si le fichier a aussi changé sur le disque
          const ancien = (d.anciens || [])[d.anciens ? d.anciens.length - 1 : 0];
          const ext = path.posix.extname(rel), base = path.posix.basename(rel, ext);
          const nomAncien = changeDisque ? `${base} (modifié sur le serveur ${horodatage()})${ext}` : `${base} (ind. ${(ancien && ancien.indice) || 'précédent'})${ext}`;
          try { deplacer(path.join(dir, rel), path.join(dir, Classement.ANCIENS, path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel), nomAncien)); } catch (e) { /* déjà déplacé */ }
          if (changeDisque) bilan.alertes.push(`${a.code} : ${d.nom} modifié à la fois dans l'appli et sur le serveur ; la version du serveur est gardée dans « ${Classement.ANCIENS} »`);
          const mtime = ecrire(dir, rel, b.data);
          Object.assign(l, { fichier_id: d.fichierId, taille: b.data.length, mtime, hash: sha1(b.data) });
          bilan.exportes++;
        } else if (changeDisque) {
          // Fichier remplacé sur le serveur : nouvel indice dans l'appli
          const buf = fs.readFileSync(path.join(dir, rel));
          if (buf.length > MAX) { bilan.ignores.push(`${a.code}/${rel} (plus de ${Math.round(MAX / 1048576)} Mo)`); pris.add(rel.toLowerCase()); continue; }
          const id = nouveauBlob(d.mime || mimeDe(rel) || 'application/octet-stream', buf);
          const auj = new Date().toISOString().slice(0, 10);
          majDoc(d.id, x => ({ ...x, anciens: [...(x.anciens || []), { fichierId: x.fichierId, indice: x.indice || 'A', date: x.date }], fichierId: id, taille: buf.length,
            indice: suivant(x.indice || 'A'), date: auj, par: PAR }));
          Object.assign(l, { fichier_id: id, taille: f.taille, mtime: f.mtime, hash: hashDisque });
          bilan.nouveauxIndices++;
        } else if (modifDisque) Object.assign(l, { mtime: f.mtime, taille: f.taille });
        // Renommé ou recatégorisé dans l'appli : le fichier suit
        if (rel !== relAttendu && !fichiers.has(relAttendu)) {
          try { deplacer(path.join(dir, rel), path.join(dir, relAttendu)); oublier(rel); rel = relAttendu; bilan.deplaces++; } catch (e) { /* verrouillé (ouvert sur un poste) : réessai au prochain passage */ }
        }
        l.rel = rel; l.categorie = d.categorie; sauver(l); pris.add(rel.toLowerCase());
      } else {
        // Nouveau document de l'appli : écrit dans le répertoire (ou rattaché au fichier identique déjà copié)
        const b = blob(d.fichierId);
        if (!b) continue;
        const h = sha1(b.data);
        let rel = relAttendu;
        const f = fichiers.get(rel);
        if (f && !suivis.has(rel) && f.taille === b.data.length && sha1(fs.readFileSync(path.join(dir, rel))) === h) { /* déjà présent */ }
        else {
          if (f) rel = libre(dir, rel, new Set([...pris, ...[...fichiers.keys()].map(k => k.toLowerCase())]));
          ecrire(dir, rel, b.data); bilan.exportes++;
        }
        const st = fs.statSync(path.join(dir, rel));
        sauver({ rel, doc_id: d.id, fichier_id: d.fichierId, taille: st.size, mtime: st.mtimeMs, hash: h, categorie: d.categorie });
        pris.add(rel.toLowerCase()); suivis.add(rel);
      }
    }

    // 2. Fichiers copiés dans le répertoire (non suivis)
    const suivisMaintenant = new Set(db.prepare('SELECT rel FROM doc_sync WHERE affaire_id = ?').all(a.id).map(l => l.rel));
    const nouveaux = [...fichiers].filter(([rel]) => !suivisMaintenant.has(rel));
    const hashNouveaux = new Map();
    for (const [rel, f] of nouveaux) {
      if (maintenant - f.mtime < 3000) continue; // copie en cours : au prochain passage
      const nom = path.posix.basename(rel), mime = mimeDe(nom);
      if (!mime) { bilan.ignores.push(`${a.code}/${rel} (type non accepté)`); continue; }
      if (f.taille > MAX) { bilan.ignores.push(`${a.code}/${rel} (plus de ${Math.round(MAX / 1048576)} Mo)`); continue; }
      if (!f.taille) continue;
      const buf = fs.readFileSync(path.join(dir, rel)), h = sha1(buf);
      // Déplacé ou renommé dans le répertoire : même contenu qu'un document disparu de son emplacement
      const k = disparus.findIndex(x => x.l.hash === h);
      if (k >= 0) {
        const { d, l } = disparus.splice(k, 1)[0];
        const dirRel = path.posix.dirname(rel), cat = dirRel === '.' ? null : Classement.categorieDuDossier(dirRel.split('/')[0]);
        majDoc(d.id, x => ({ ...x, nom, ...(cat ? { categorie: cat, dossier: '' } : dirRel !== '.' ? { dossier: dirRel } : { dossier: '' }) }));
        oublier(l.rel);
        sauver({ rel, doc_id: d.id, fichier_id: l.fichier_id, taille: f.taille, mtime: f.mtime, hash: h, categorie: cat || d.categorie });
        bilan.deplaces++; continue;
      }
      const dirRel0 = path.posix.dirname(rel);
      // Posé à la racine alors qu'un document du même nom existe déjà dans le dossier de sa catégorie : c'est une nouvelle version
      if (dirRel0 === '.') {
        const cible = relPosix(Classement.dossierCategorie(Classement.categorieDevinee(nom)), Classement.propre(nom));
        const suivi = db.prepare('SELECT * FROM doc_sync WHERE affaire_id = ? AND lower(rel) = lower(?)').get(a.id, cible);
        if (suivi) {
          if (suivi.hash === h) fs.unlinkSync(path.join(dir, rel)); // copie identique : rien de nouveau
          else { fs.renameSync(path.join(dir, rel), path.join(dir, suivi.rel)); bilan.encore = true; } // remplacée : nouvel indice au passage suivant
          continue;
        }
      }
      hashNouveaux.set(rel, h);
      const dirRel = path.posix.dirname(rel), premier = dirRel === '.' ? '' : dirRel.split('/')[0];
      const cat = premier ? (Classement.categorieDuDossier(premier) || Classement.categorieDevinee(nom)) : Classement.categorieDevinee(nom);
      const dossier = premier && !Classement.categorieDuDossier(premier) ? dirRel : dirRel.split('/').length > 1 ? dirRel : '';
      const id = nouveauBlob(mime, buf), doc = { id: uid(), fichierId: id, nom, categorie: cat, indice: '', note: '', mime, taille: buf.length,
        date: new Date().toISOString().slice(0, 10), par: PAR, visible: config().transmettre, ...(dossier ? { dossier } : {}) };
      let relFinal = rel;
      // Posé à la racine du chantier : rangé dans le dossier de sa catégorie
      if (!premier) {
        const cible = libre(dir, relPosix(Classement.dossierCategorie(cat), Classement.propre(nom)), new Set([...pris, ...[...fichiers.keys()].map(x => x.toLowerCase())]));
        try { deplacer(path.join(dir, rel), path.join(dir, cible)); relFinal = cible; } catch (e) { /* reste à la racine */ }
      }
      const st = fs.statSync(path.join(dir, relFinal));
      sauver({ rel: relFinal, doc_id: doc.id, fichier_id: id, taille: st.size, mtime: st.mtimeMs, hash: h, categorie: cat });
      ops.ajouts.push(doc); pris.add(relFinal.toLowerCase()); bilan.importes++;
    }

    // 3. Fichiers supprimés du répertoire : retirés de l'appli, sauf disparition massive (partage débranché, erreur de manipulation)
    if (disparus.length) {
      const massif = disparus.length > 3 && disparus.length >= docs.length / 2;
      if (massif) {
        // Fichiers réécrits depuis l'appli : pour supprimer des documents en nombre, faites-le dans l'appli
        bilan.alertes.push(`${a.code} : ${disparus.length} fichiers absents du répertoire ; rien n'est retiré de l'appli, les fichiers sont réécrits (pour les supprimer, faites-le dans l'appli)`);
        disparus.forEach(({ l }) => {
          const b = blob(l.fichier_id);
          if (!b) return;
          try { Object.assign(l, { mtime: ecrire(dir, l.rel, b.data), taille: b.data.length }); sauver(l); bilan.exportes++; } catch (e) { /* répertoire en lecture seule */ }
        });
      }
      else disparus.forEach(({ d, l }) => { ops.suppr.add(d.id); oublier(l.rel); bilan.supprimes++; });
    }
    // 4. Documents supprimés dans l'appli : fichier mis à la corbeille du répertoire
    const ids = new Set(docs.map(d => d.id));
    for (const l of db.prepare('SELECT * FROM doc_sync WHERE affaire_id = ?').all(a.id)) {
      if (ids.has(l.doc_id) || ops.ajouts.some(x => x.id === l.doc_id)) continue;
      const src = path.join(dir, l.rel);
      if (fs.existsSync(src)) {
        try { deplacer(src, path.join(racine, Classement.CORBEILLE, path.basename(dir), `${horodatage()} ${path.posix.basename(l.rel)}`)); } catch (e) { continue; }
      }
      oublier(l.rel); bilan.supprimes++;
    }
    return ops.ajouts.length || ops.maj.size || ops.suppr.size ? ops : null;
  }

  const suivant = i => (/^[A-Y]$/i.test(i) ? String.fromCharCode(i.toUpperCase().charCodeAt(0) + 1) : /^\d+$/.test(i) ? String(+i + 1) : `${i}+`);

  // Écriture dans la base sur la dernière version du chantier (une modification faite entre-temps dans l'appli est conservée)
  function appliquer(id, ops) {
    const r = DB.tx(db, () => {
      const avant = DB.getRecord(db, 'affaires', id);
      if (!avant) return null;
      const obj = DB.clean(avant);
      obj.documents = (obj.documents || []).filter(d => !ops.suppr.has(d.id)).map(d => (ops.maj.has(d.id) ? ops.maj.get(d.id)(d) : d)).concat(ops.ajouts);
      db.prepare('UPDATE records SET data = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE col = ? AND id = ?').run(JSON.stringify(obj), new Date().toISOString(), PAR, 'affaires', id);
      DB.audit(db, PAR, 'synchronisation des documents', 'affaires', id, `${ops.ajouts.length} ajout(s), ${ops.maj.size} mise(s) à jour, ${ops.suppr.size} retrait(s)`);
      return { avant, apres: DB.getRecord(db, 'affaires', id) };
    });
    if (!r) return;
    broadcast('change', { col: 'affaires', record: r.apres, client: null });
    if (notifier) notifier(r.avant, r.apres);
  }

  async function synchroniser() {
    if (enCours) return enCours;
    enCours = (async () => {
      const c = config(), t0 = Date.now();
      const bilan = { exportes: 0, importes: 0, nouveauxIndices: 0, deplaces: 0, supprimes: 0, ignores: [], alertes: [] };
      try {
        if (!c.actif) return Object.assign(etat, { erreur: '', actif: false });
        const racineCh = path.join(c.chemin, 'Chantiers');
        fs.mkdirSync(racineCh, { recursive: true });
        const noms = fs.readdirSync(racineCh, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
        const affaires = db.prepare("SELECT id FROM records WHERE col = 'affaires'").all().map(r => DB.getRecord(db, 'affaires', r.id));
        for (const a of affaires) {
          try { const ops = synchroChantier(c.chemin, racineCh, a, noms, bilan); if (ops) appliquer(a.id, ops); }
          catch (e) { bilan.alertes.push(`${a.code || a.id} : ${e.message}`); }
        }
        // Fichier remplacé pendant ce passage : un second passage le prend en compte tout de suite
        if (bilan.encore) {
          const b2 = { ...bilan, encore: false };
          for (const a of db.prepare("SELECT id FROM records WHERE col = 'affaires'").all().map(r => DB.getRecord(db, 'affaires', r.id))) {
            try { const ops = synchroChantier(c.chemin, racineCh, a, fs.readdirSync(racineCh), b2); if (ops) appliquer(a.id, ops); } catch (e) { b2.alertes.push(`${a.code || a.id} : ${e.message}`); }
          }
          Object.assign(bilan, b2);
        }
        delete bilan.encore;
        Object.assign(etat, bilan, { erreur: '' });
      } catch (e) {
        Object.assign(etat, bilan, { erreur: `Répertoire inaccessible (${c.chemin}) : ${e.message}` });
      } finally {
        Object.assign(etat, { dernier: new Date().toISOString(), duree: Date.now() - t0, actif: c.actif, ignores: bilan.ignores.slice(0, 50), alertes: bilan.alertes.slice(0, 50) });
      }
      return etat;
    })();
    try { return await enCours; } finally { enCours = null; }
  }

  // Passage régulier et peu après chaque modification d'un chantier dans l'appli
  let auto = false, delai = null;
  function demarrer() {
    auto = true;
    const boucle = () => { minuterie = setTimeout(() => synchroniser().catch(e => console.error('Répertoire des documents :', e.message)).finally(boucle), config().intervalle * 1000); minuterie.unref(); };
    setTimeout(() => synchroniser().catch(e => console.error('Répertoire des documents :', e.message)), 3000).unref();
    boucle();
  }
  function signaler() {
    if (!auto) return;
    clearTimeout(delai);
    delai = setTimeout(() => synchroniser().catch(e => console.error('Répertoire des documents :', e.message)), 2000);
    delai.unref();
  }
  return { config, enregistrerConfig, synchroniser, demarrer, signaler, etat: () => ({ ...etat }) };
}

module.exports = { creer };
