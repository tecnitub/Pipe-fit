// État des applications Études et DOE sur la fiche chantier : chaque enregistrement d'une étude (application Études) ou
// d'un dossier (étude d'exécution / DOE) envoie un résumé, rangé ici par application, identifiant et chantier.
// Lu par la vue d'ensemble du chantier (bureau). Les fiches elles-mêmes restent dans la base de chaque application.
const APPS = ['etudes', 'doe'];
const TAILLE_MAX = 300 * 1024;

function creer({ db, broadcast }) {
  db.exec(`CREATE TABLE IF NOT EXISTS liens_apps (app TEXT NOT NULL, id TEXT NOT NULL, affaire_id TEXT NOT NULL, resume TEXT NOT NULL,
    updated_at TEXT NOT NULL, updated_by TEXT, PRIMARY KEY (app, id));
    CREATE INDEX IF NOT EXISTS liens_apps_affaire ON liens_apps (affaire_id);`);
  const ligne = r => ({ app: r.app, id: r.id, affaireId: r.affaire_id, resume: JSON.parse(r.resume), maj: r.updated_at, par: r.updated_by || '' });

  function liste(affaireId) {
    const rows = affaireId ? db.prepare('SELECT * FROM liens_apps WHERE affaire_id = ? ORDER BY updated_at DESC').all(String(affaireId))
      : db.prepare('SELECT * FROM liens_apps ORDER BY updated_at DESC').all();
    return rows.map(ligne);
  }
  function enregistrer(app, id, b, par) {
    if (!APPS.includes(app)) throw Object.assign(new Error('Application inconnue'), { status: 404 });
    if (!/^[\w-]{1,64}$/.test(String(id))) throw Object.assign(new Error('Identifiant invalide'), { status: 400 });
    const affaireId = String((b && b.affaireId) || '');
    const avant = db.prepare('SELECT affaire_id FROM liens_apps WHERE app = ? AND id = ?').get(app, id);
    // Plus rattaché à un chantier : retiré
    if (!affaireId) { supprimer(app, id); return null; }
    if (!b.resume || typeof b.resume !== 'object' || Array.isArray(b.resume)) throw Object.assign(new Error('Résumé manquant'), { status: 400 });
    const resume = JSON.stringify(b.resume);
    if (resume.length > TAILLE_MAX) throw Object.assign(new Error('Résumé trop volumineux'), { status: 413 });
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO liens_apps (app, id, affaire_id, resume, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(app, id) DO UPDATE SET affaire_id = excluded.affaire_id, resume = excluded.resume, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .run(app, id, affaireId, resume, now, String(par || ''));
    if (avant && avant.affaire_id !== affaireId) broadcast('liens', { app, affaireId: avant.affaire_id });
    broadcast('liens', { app, affaireId });
    return ligne(db.prepare('SELECT * FROM liens_apps WHERE app = ? AND id = ?').get(app, id));
  }
  function supprimer(app, id) {
    const r = db.prepare('SELECT affaire_id FROM liens_apps WHERE app = ? AND id = ?').get(app, id);
    if (!r) return;
    db.prepare('DELETE FROM liens_apps WHERE app = ? AND id = ?').run(app, id);
    broadcast('liens', { app, affaireId: r.affaire_id });
  }
  return { APPS, liste, enregistrer, supprimer };
}

module.exports = { creer, APPS };
