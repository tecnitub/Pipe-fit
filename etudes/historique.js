// Historique des études (serveur Études) : versions compressées (gzip) à chaque enregistrement significatif, limitées
// en nombre et en âge (Réglages → versions, ou ETUDES_VERSIONS_MAX / ETUDES_VERSIONS_JOURS / ETUDES_VERSIONS_INTERVALLE),
// corbeille des calculs supprimés (un calcul se restaure seul), présence légère (dernier accès de chaque personne à
// une étude ouverte, relevé par le navigateur toutes les 30 s ; pas de websocket).
// Tables ajoutées sans toucher aux existantes : une base d'avant les versions garde toutes ses études ; la première
// version d'une étude existante est son état au premier enregistrement qui suit la mise à jour.
const zlib = require('node:zlib');
const VE = require('./public/js/versions-etude');

const PRESENCE_S = 90; // une personne est « sur l'étude » si son navigateur s'est signalé dans les 90 dernières secondes

module.exports = function Historique(db, { reglages }) {
  db.exec(`CREATE TABLE IF NOT EXISTS etudes_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, etude_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0,
      data BLOB NOT NULL, taille INTEGER NOT NULL DEFAULT 0, resume TEXT NOT NULL DEFAULT '{}', motif TEXT NOT NULL DEFAULT '', auteur TEXT NOT NULL DEFAULT '', created_at TEXT, updated_at TEXT);
    CREATE INDEX IF NOT EXISTS etudes_versions_etude ON etudes_versions (etude_id, id);
    CREATE TABLE IF NOT EXISTS etudes_corbeille (id INTEGER PRIMARY KEY AUTOINCREMENT, etude_id TEXT NOT NULL, note_id TEXT NOT NULL, titre TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT '',
      data BLOB NOT NULL, supprime_at TEXT, supprime_par TEXT NOT NULL DEFAULT '');
    CREATE INDEX IF NOT EXISTS etudes_corbeille_etude ON etudes_corbeille (etude_id, id);
    CREATE TABLE IF NOT EXISTS etudes_presence (etude_id TEXT NOT NULL, login TEXT NOT NULL, nom TEXT NOT NULL DEFAULT '', vu_at TEXT, modifie_at TEXT NOT NULL DEFAULT '', PRIMARY KEY (etude_id, login));`);
  const comp = o => zlib.gzipSync(Buffer.from(JSON.stringify(o)));
  // Données décompressées limitées (protection contre un contenu anormal)
  const decomp = b => JSON.parse(zlib.gunzipSync(Buffer.from(b), { maxOutputLength: 200 * 1024 * 1024 }).toString('utf8'));
  const resumeDe = t => { try { return JSON.parse(t || '{}'); } catch (e) { return {}; } };
  const meta = r => { const resume = resumeDe(r.resume); return { id: r.id, version: r.version, date: r.updated_at, debut: r.created_at, auteur: r.auteur, motif: r.motif, taille: r.taille, resume, texte: VE.texte(resume.notesAjoutees ? resume : null) }; };

  function ajouter(etudeId, data, o) {
    const z = comp(data);
    db.prepare('INSERT INTO etudes_versions (etude_id, version, data, taille, resume, motif, auteur, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(etudeId, o.version, z, z.length, JSON.stringify(o.resume), String(o.motif || '').slice(0, 200), String(o.auteur || '').slice(0, 120), o.maintenant, o.maintenant);
  }
  // Après l'enregistrement d'une étude (avant : données précédentes ou null ; apres : données enregistrées)
  function apresEnregistrement(etudeId, avant, apres, { version, auteur, motif = '', maintenant = new Date().toISOString() }) {
    const reg = VE.reglages(reglages());
    const dernieres = () => db.prepare('SELECT id, version, auteur, motif, created_at, updated_at FROM etudes_versions WHERE etude_id = ? ORDER BY id DESC LIMIT 2').all(etudeId);
    let vs = dernieres();
    // Étude enregistrée avant le suivi des versions : son état précédent devient la première version
    if (!vs.length && avant) { ajouter(etudeId, avant, { version: version - 1, resume: VE.resumer(null, avant), motif: 'État avant le suivi des versions', auteur: '', maintenant }); vs = dernieres(); }
    const der = vs[0], dataDer = der ? decomp(db.prepare('SELECT data FROM etudes_versions WHERE id = ?').get(der.id).data) : null;
    const decision = VE.politique(der || null, VE.resumer(dataDer, apres), { auteur, maintenant, motif, reglages: reg });
    if (decision === 'ajouter') ajouter(etudeId, apres, { version, resume: VE.resumer(dataDer, apres), motif, auteur, maintenant });
    else if (decision === 'remplacer') {
      // Même séance de travail : la dernière version est mise à jour, son résumé compare à la version précédente
      const prec = vs[1] ? decomp(db.prepare('SELECT data FROM etudes_versions WHERE id = ?').get(vs[1].id).data) : null, z = comp(apres);
      db.prepare('UPDATE etudes_versions SET data = ?, taille = ?, resume = ?, version = ?, updated_at = ? WHERE id = ?').run(z, z.length, JSON.stringify(VE.resumer(prec, apres)), version, maintenant, der.id);
    }
    // Limites en nombre et en âge (la plus récente reste)
    const toutes = db.prepare('SELECT id, updated_at AS date FROM etudes_versions WHERE etude_id = ? ORDER BY id').all(etudeId);
    const del = db.prepare('DELETE FROM etudes_versions WHERE id = ?');
    VE.aPurger(toutes, { reglages: reg, maintenant }).forEach(id => del.run(id));
    // Corbeille : calculs supprimés gardés seuls ; un calcul revenu dans l'étude en sort
    VE.notesSupprimees(avant, apres).forEach(n => db.prepare('INSERT INTO etudes_corbeille (etude_id, note_id, titre, type, data, supprime_at, supprime_par) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(etudeId, String(n.id).slice(0, 64), String(n.titre || '').slice(0, 200), String(n.type || '').slice(0, 40), comp(n), maintenant, String(auteur || '').slice(0, 120)));
    const presents = new Set((apres.notes || []).map(n => String(n && n.id)));
    db.prepare('SELECT id, note_id FROM etudes_corbeille WHERE etude_id = ?').all(etudeId).filter(r => presents.has(r.note_id)).forEach(r => db.prepare('DELETE FROM etudes_corbeille WHERE id = ?').run(r.id));
    const cb = db.prepare('SELECT id, supprime_at AS date FROM etudes_corbeille WHERE etude_id = ? ORDER BY id').all(etudeId), delC = db.prepare('DELETE FROM etudes_corbeille WHERE id = ?');
    VE.aPurger(cb, { reglages: { ...reg, max: reg.corbeilleMax, jours: reg.corbeilleJours }, maintenant }).forEach(id => delC.run(id));
  }
  const versions = etudeId => db.prepare('SELECT id, version, taille, resume, motif, auteur, created_at, updated_at FROM etudes_versions WHERE etude_id = ? ORDER BY id DESC').all(etudeId).map(meta);
  function version(etudeId, id) {
    const r = db.prepare('SELECT * FROM etudes_versions WHERE etude_id = ? AND id = ?').get(etudeId, Number(id) || 0);
    return r ? { ...meta(r), data: decomp(r.data) } : null;
  }
  const corbeille = etudeId => db.prepare('SELECT id, note_id, titre, type, supprime_at, supprime_par FROM etudes_corbeille WHERE etude_id = ? ORDER BY id DESC').all(etudeId)
    .map(r => ({ id: r.id, noteId: r.note_id, titre: r.titre, type: r.type, date: r.supprime_at, par: r.supprime_par }));
  function elementCorbeille(etudeId, id) {
    const r = db.prepare('SELECT * FROM etudes_corbeille WHERE etude_id = ? AND id = ?').get(etudeId, Number(id) || 0);
    return r ? { id: r.id, noteId: r.note_id, titre: r.titre, type: r.type, date: r.supprime_at, par: r.supprime_par, note: decomp(r.data) } : null;
  }
  // Présence : la personne se signale (ou quitte l'étude) ; les autres personnes vues récemment sont renvoyées
  function presence(etudeId, s, { quitte = false, modifie = false } = {}) {
    const now = new Date().toISOString();
    if (quitte) db.prepare('DELETE FROM etudes_presence WHERE etude_id = ? AND login = ?').run(etudeId, s.login);
    else db.prepare(`INSERT INTO etudes_presence (etude_id, login, nom, vu_at, modifie_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(etude_id, login) DO UPDATE SET nom = excluded.nom, vu_at = excluded.vu_at, modifie_at = CASE WHEN ? THEN excluded.vu_at ELSE etudes_presence.modifie_at END`)
      .run(etudeId, s.login, s.nom || s.login, now, modifie ? now : '', modifie ? 1 : 0);
    db.prepare('DELETE FROM etudes_presence WHERE vu_at < ?').run(new Date(Date.now() - 86400000).toISOString());
    const depuis = new Date(Date.now() - PRESENCE_S * 1000).toISOString();
    return db.prepare('SELECT login, nom, vu_at, modifie_at FROM etudes_presence WHERE etude_id = ? AND login <> ? AND vu_at >= ? ORDER BY vu_at DESC').all(etudeId, s.login, depuis)
      .map(r => ({ login: r.login, nom: r.nom, vu: r.vu_at, modifie: r.modifie_at || '' }));
  }
  function supprimer(etudeId) {
    ['etudes_versions', 'etudes_corbeille', 'etudes_presence'].forEach(t => db.prepare(`DELETE FROM ${t} WHERE etude_id = ?`).run(etudeId));
  }
  return { apresEnregistrement, versions, version, corbeille, elementCorbeille, presence, supprimer };
};
