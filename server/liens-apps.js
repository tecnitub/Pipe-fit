// État des applications Études et DOE sur la fiche chantier : chaque enregistrement d'une étude (application Études) ou
// d'un dossier (étude d'exécution / DOE) envoie un résumé, rangé ici par application, identifiant et chantier.
// Lu par la vue d'ensemble du chantier (bureau). Les fiches elles-mêmes restent dans la base de chaque application.
const APPS = ['etudes', 'doe'];
const TAILLE_MAX = 300 * 1024;

function creer({ db, broadcast }) {
  db.exec(`CREATE TABLE IF NOT EXISTS liens_apps (app TEXT NOT NULL, id TEXT NOT NULL, affaire_id TEXT NOT NULL, resume TEXT NOT NULL,
    updated_at TEXT NOT NULL, updated_by TEXT, PRIMARY KEY (app, id));
    CREATE INDEX IF NOT EXISTS liens_apps_affaire ON liens_apps (affaire_id);`);
  // Étude faite avant la commande : rattachée à un client et éventuellement à un devis, puis reliée au chantier
  const cols = db.prepare('PRAGMA table_info(liens_apps)').all().map(c => c.name);
  [['devis_id', "TEXT NOT NULL DEFAULT ''"], ['client_id', "TEXT NOT NULL DEFAULT ''"], ['relie_par', 'TEXT'], ['relie_le', 'TEXT']]
    .forEach(([c, t]) => { if (!cols.includes(c)) db.exec(`ALTER TABLE liens_apps ADD COLUMN ${c} ${t}`); });
  const ligne = r => ({ app: r.app, id: r.id, affaireId: r.affaire_id, devisId: r.devis_id || '', clientId: r.client_id || '', resume: JSON.parse(r.resume), maj: r.updated_at, par: r.updated_by || '',
    relie: r.relie_le ? { par: r.relie_par || '', le: r.relie_le } : null });
  const lire = (app, id) => db.prepare('SELECT * FROM liens_apps WHERE app = ? AND id = ?').get(app, id);
  const verifier = (app, id) => {
    if (!APPS.includes(app)) throw Object.assign(new Error('Application inconnue'), { status: 404 });
    if (!/^[\w-]{1,64}$/.test(String(id))) throw Object.assign(new Error('Identifiant invalide'), { status: 400 });
  };
  const signaler = (app, ...affaires) => [...new Set(affaires.filter(x => x !== undefined))].forEach(affaireId => broadcast('liens', { app, affaireId }));

  // Filtres : affaireId, app, sansChantier (études pas encore reliées), devisId, clientId
  function liste(f = {}) {
    if (typeof f === 'string') f = { affaireId: f };
    const w = [], v = [];
    if (f.affaireId) { w.push('affaire_id = ?'); v.push(String(f.affaireId)); }
    if (f.app) { w.push('app = ?'); v.push(String(f.app)); }
    if (f.sansChantier) w.push("affaire_id = ''");
    if (f.devisId) { w.push('devis_id = ?'); v.push(String(f.devisId)); }
    if (f.clientId) { w.push('client_id = ?'); v.push(String(f.clientId)); }
    return db.prepare(`SELECT * FROM liens_apps${w.length ? ` WHERE ${w.join(' AND ')}` : ''} ORDER BY updated_at DESC`).all(...v).map(ligne);
  }
  const un = (app, id) => { const r = lire(app, id); return r ? ligne(r) : null; };
  // État envoyé par l'application à chaque enregistrement. Une étude peut être sans chantier (affaireId vide) ;
  // un rattachement fait dans le CRM (chantier, devis) reste tant que l'application ne l'a pas repris.
  function enregistrer(app, id, b, par) {
    verifier(app, id);
    let affaireId = String((b && b.affaireId) || '');
    const avant = lire(app, id);
    if (!affaireId && app !== 'etudes') { supprimer(app, id); return null; }
    if (!b.resume || typeof b.resume !== 'object' || Array.isArray(b.resume)) throw Object.assign(new Error('Résumé manquant'), { status: 400 });
    const resume = JSON.stringify(b.resume);
    if (resume.length > TAILLE_MAX) throw Object.assign(new Error('Résumé trop volumineux'), { status: 413 });
    if (!affaireId && avant && avant.affaire_id && avant.relie_le) affaireId = avant.affaire_id;
    const devisId = String(b.devisId || (avant && avant.devis_id) || ''), clientId = String(b.clientId || (avant && avant.client_id) || '');
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO liens_apps (app, id, affaire_id, resume, updated_at, updated_by, devis_id, client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(app, id) DO UPDATE SET affaire_id = excluded.affaire_id, resume = excluded.resume, updated_at = excluded.updated_at, updated_by = excluded.updated_by,
        devis_id = excluded.devis_id, client_id = excluded.client_id`)
      .run(app, id, affaireId, resume, now, String(par || ''), devisId, clientId);
    signaler(app, avant ? avant.affaire_id : undefined, affaireId);
    return un(app, id);
  }
  // Rattachement fait dans le CRM : à un chantier (commande reçue) et / ou à un devis (chantier relié à son acceptation)
  function relier(app, id, b, par) {
    verifier(app, id);
    const avant = lire(app, id);
    if (!avant) throw Object.assign(new Error('Étude inconnue de Pipe-Fit : enregistrez-la une fois dans l\'application Études'), { status: 404 });
    const affaireId = b.affaireId !== undefined ? String(b.affaireId || '') : avant.affaire_id, devisId = b.devisId !== undefined ? String(b.devisId || '') : avant.devis_id;
    db.prepare('UPDATE liens_apps SET affaire_id = ?, devis_id = ?, client_id = COALESCE(NULLIF(?, \'\'), client_id), relie_par = ?, relie_le = ? WHERE app = ? AND id = ?')
      .run(affaireId, devisId, String(b.clientId || ''), String(par || ''), new Date().toISOString(), app, id);
    signaler(app, avant.affaire_id, affaireId);
    return un(app, id);
  }
  // Devis accepté devenu chantier : ses études pas encore reliées le suivent
  function relierDevis(devisId, affaireId, par) {
    if (!devisId || !affaireId) return 0;
    const rows = db.prepare("SELECT app, id FROM liens_apps WHERE devis_id = ? AND affaire_id = ''").all(String(devisId));
    rows.forEach(r => relier(r.app, r.id, { affaireId }, par));
    return rows.length;
  }
  function supprimer(app, id) {
    const r = lire(app, id);
    if (!r) return;
    db.prepare('DELETE FROM liens_apps WHERE app = ? AND id = ?').run(app, id);
    signaler(app, r.affaire_id);
  }
  return { APPS, liste, un, enregistrer, relier, relierDevis, supprimer };
}

module.exports = { creer, APPS };
