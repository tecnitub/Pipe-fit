// Sauvegarde automatique de la base : chaque jour à l'heure choisie (et à la demande), copie complète et cohérente de la
// base (données, comptes, pièces jointes, réglages) dans un dossier local ou réseau, vérifiée puis gardée N jours.
// Copie faite par SQLite (VACUUM INTO) : sûre même pendant que des utilisateurs travaillent.
// Restauration : arrêter Pipe-Fit, remplacer le fichier de la base (pipefit.db) par la copie choisie, redémarrer.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const MOTIF = /^(?:pipefit|doe|etudes)-(\d{4}-\d{2}-\d{2})_(\d{4})\.db$/;

// autres : bases sauvegardées avec celle de Pipe-Fit (applications DOE et Études), [{ prefixe, fichier }]
function creer({ DB, db, dossierDefaut, autres = [] }) {
  const etat = { dernier: null, fichier: '', taille: 0, duree: 0, erreur: '', enCours: false };
  let enCours = null;

  function config() {
    const c = DB.getConfig(db, 'sauvegarde') || {}, impose = process.env.BACKUP_DIR || '';
    return { actif: impose ? true : c.actif !== false, chemin: path.resolve(impose || c.chemin || dossierDefaut), impose: !!impose,
      heure: Number.isInteger(c.heure) ? c.heure : 21, conserver: Math.max(1, Math.min(365, Number(c.conserver) || 30)), dernier: c.dernier || null };
  }
  function enregistrerConfig(b) {
    const c = DB.getConfig(db, 'sauvegarde') || {};
    Object.assign(c, { actif: !!b.actif, heure: Math.max(0, Math.min(23, parseInt(b.heure, 10) || 0)), conserver: Math.max(1, Math.min(365, parseInt(b.conserver, 10) || 30)) });
    if (b.chemin !== undefined) c.chemin = String(b.chemin || '').trim().slice(0, 400);
    DB.setConfig(db, 'sauvegarde', c);
    return config();
  }

  function liste(chemin = config().chemin) {
    try {
      return fs.readdirSync(chemin).filter(n => MOTIF.test(n)).sort().reverse()
        .map(nom => { const st = fs.statSync(path.join(chemin, nom)); return { nom, taille: st.size, date: st.mtime.toISOString() }; });
    } catch (e) { return []; }
  }

  async function sauvegarder(motif = 'automatique') {
    if (enCours) return enCours;
    enCours = (async () => {
      const c = config(), t0 = Date.now();
      const d = new Date(), z = n => String(n).padStart(2, '0');
      const nom = `pipefit-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}.db`;
      const f = path.join(c.chemin, nom), tmp = `${f}.part`;
      try {
        fs.mkdirSync(c.chemin, { recursive: true });
        fs.rmSync(tmp, { force: true });
        db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
        // Vérification : la copie s'ouvre et sa structure est intacte
        const v = new DatabaseSync(tmp, { readOnly: true });
        try {
          const ok = v.prepare('PRAGMA quick_check').get();
          if (Object.values(ok)[0] !== 'ok') throw new Error(`copie endommagée (${Object.values(ok)[0]})`);
          v.prepare('SELECT COUNT(*) n FROM records').get();
        } finally { v.close(); }
        fs.renameSync(tmp, f);
        // Bases associées (applications DOE et Études) : même copie vérifiée, si elles existent sur ce serveur
        for (const a of autres) {
          if (!fs.existsSync(a.fichier)) continue;
          const fa = path.join(c.chemin, nom.replace(/^pipefit-/, `${a.prefixe}-`)), ta = `${fa}.part`;
          fs.rmSync(ta, { force: true });
          const src = new DatabaseSync(a.fichier);
          try { src.exec(`VACUUM INTO '${ta.replace(/'/g, "''")}'`); } finally { src.close(); }
          fs.renameSync(ta, fa);
        }
        // Rotation : les sauvegardes les plus anciennes au-delà du nombre de jours gardés
        const limite = Date.now() - c.conserver * 86400000;
        liste(c.chemin).slice(1).forEach(x => { const m = MOTIF.exec(x.nom); if (m && new Date(`${m[1]}T00:00:00`).getTime() < limite) fs.rmSync(path.join(c.chemin, x.nom), { force: true }); });
        const taille = fs.statSync(f).size;
        Object.assign(etat, { dernier: new Date().toISOString(), fichier: f, taille, duree: Date.now() - t0, erreur: '' });
        DB.setConfig(db, 'sauvegarde', { ...(DB.getConfig(db, 'sauvegarde') || {}), dernier: etat.dernier });
        DB.audit(db, 'Sauvegarde', `sauvegarde ${motif}`, null, null, `${f} (${Math.round(taille / 1024)} Ko)`);
      } catch (e) {
        fs.rmSync(tmp, { force: true });
        Object.assign(etat, { dernier: new Date().toISOString(), erreur: `Sauvegarde impossible dans ${c.chemin} : ${e.message}` });
        DB.audit(db, 'Sauvegarde', 'échec de la sauvegarde', null, null, etat.erreur);
      }
      return { ...etat };
    })();
    try { return await enCours; } finally { enCours = null; }
  }

  // Sauvegarde due : pas encore faite aujourd'hui après l'heure choisie
  function due(maintenant = new Date()) {
    const c = config();
    if (!c.actif || maintenant.getHours() < c.heure) return false;
    const seuil = new Date(maintenant); seuil.setHours(c.heure, 0, 0, 0);
    return !c.dernier || new Date(c.dernier) < seuil;
  }
  function demarrer() {
    const verifier = () => { if (due()) sauvegarder().catch(e => console.error('Sauvegarde :', e.message)); };
    setTimeout(verifier, 60000).unref();
    setInterval(verifier, 10 * 60000).unref();
  }
  return { config, enregistrerConfig, sauvegarder, liste, due, demarrer, etat: () => ({ ...etat }) };
}

module.exports = { creer };
