// Jetons de service des applications Études et DOE (côté Pipe-Fit) : à la connexion d'une personne dans l'application,
// son serveur échange la session Pipe-Fit (aussitôt fermée) contre un jeton propre à l'application :
// - durée de vie limitée (14 jours, comme la session de l'application), révocable (déconnexion de l'application,
//   changement de mot de passe, « déconnecter mes autres appareils », compte supprimé ou passé hors du bureau) ;
// - portée réduite aux routes dont l'application a besoin (/api/liens/*, lecture des données, documents du chantier…) ;
// - seule son empreinte est enregistrée ici ; l'application le garde chiffré dans sa base.
// Envoyé dans l'en-tête Authorization: Bearer pfapp_… (pas de cookie : rien d'exploitable depuis un navigateur).
const crypto = require('node:crypto');

const DUREE_JOURS = 14;
const PREFIXE = 'pfapp_';
const APPS = ['etudes', 'doe'];
const ROLES = ['admin', 'charge'];
// Routes ouvertes à chaque application : [méthode, chemin sous /api/ (expression régulière)]
const COMMUNES = [
  ['GET', /^me$/], ['POST', /^logout$/], ['GET', /^data$/], ['GET', /^files\/[^/]+$/], ['POST', /^fiches\/trouver$/],
  ['GET', /^records\/affaires\/[^/]+$/], ['PUT', /^records\/affaires\/[^/]+$/], ['POST', /^documents\/fichier$/],
];
const PORTEES = {
  etudes: [...COMMUNES, ['*', /^liens(\/.*)?$/], ['POST', /^mail$/], ['GET', /^fiches\/(catalogue-lignes|liste|pages)$/], ['POST', /^fiches\/catalogue$/],
    ['GET', /^records\/entreprises\/[^/]+$/], ['PUT', /^records\/(consultations|devis)\/[^/]+$/]],
  doe: [...COMMUNES, ['GET', /^liens$/], ['GET', /^liens\/materiel$/], ['PUT', /^liens\/doe\/[^/]+$/], ['DELETE', /^liens\/doe\/[^/]+$/]],
};
const empreinte = t => crypto.createHash('sha256').update(String(t)).digest('hex');

function creer({ db }) {
  db.exec(`CREATE TABLE IF NOT EXISTS jetons_apps (empreinte TEXT PRIMARY KEY, account_id TEXT NOT NULL, app TEXT NOT NULL, expires INTEGER NOT NULL, created_at TEXT NOT NULL, last_used INTEGER);
    CREATE INDEX IF NOT EXISTS jetons_apps_compte ON jetons_apps (account_id);`);
  db.prepare('DELETE FROM jetons_apps WHERE expires < ?').run(Date.now());
  // Nouveau jeton pour une personne du bureau connectée (session Pipe-Fit) → { jeton, expire, app }
  function emettre(acc, app) {
    if (!APPS.includes(app)) throw Object.assign(new Error('Application inconnue'), { status: 400 });
    if (!acc || !ROLES.includes(acc.role)) throw Object.assign(new Error('Réservé au bureau (administrateur ou chargé d\'affaires)'), { status: 403 });
    const jeton = PREFIXE + crypto.randomBytes(32).toString('base64url'), expire = Date.now() + DUREE_JOURS * 86400000;
    db.prepare('DELETE FROM jetons_apps WHERE expires < ?').run(Date.now());
    db.prepare('INSERT INTO jetons_apps (empreinte, account_id, app, expires, created_at) VALUES (?, ?, ?, ?, ?)').run(empreinte(jeton), acc.id, app, expire, new Date().toISOString());
    return { jeton, expire: new Date(expire).toISOString(), app };
  }
  // Compte d'un jeton valide (en-tête Authorization), ou null ; le compte doit toujours être du bureau
  function compte(entete) {
    const m = new RegExp(`^Bearer\\s+(${PREFIXE}[A-Za-z0-9_-]{30,})$`).exec(String(entete || ''));
    if (!m) return null;
    const h = empreinte(m[1]), j = db.prepare('SELECT * FROM jetons_apps WHERE empreinte = ?').get(h);
    if (!j || j.expires < Date.now()) return null;
    const a = db.prepare('SELECT id, login, nom, role, user_id, email FROM accounts WHERE id = ?').get(j.account_id);
    if (!a || !ROLES.includes(a.role)) { db.prepare('DELETE FROM jetons_apps WHERE empreinte = ?').run(h); return null; }
    if (!j.last_used || Date.now() - j.last_used > 60000) db.prepare('UPDATE jetons_apps SET last_used = ? WHERE empreinte = ?').run(Date.now(), h);
    return { ...a, jetonApp: j.app, jetonEmpreinte: h };
  }
  const routeAutorisee = (app, method, chemin) => (PORTEES[app] || []).some(([m, re]) => (m === '*' || m === method) && re.test(chemin));
  const revoquer = empreinteJeton => db.prepare('DELETE FROM jetons_apps WHERE empreinte = ?').run(empreinteJeton).changes;
  const revoquerCompte = accountId => db.prepare('DELETE FROM jetons_apps WHERE account_id = ?').run(accountId).changes;
  const nombre = accountId => db.prepare(`SELECT COUNT(*) AS n FROM jetons_apps WHERE expires > ?${accountId ? ' AND account_id = ?' : ''}`).get(...[Date.now(), ...(accountId ? [accountId] : [])]).n;
  return { emettre, compte, routeAutorisee, revoquer, revoquerCompte, nombre };
}

module.exports = { creer, PREFIXE, DUREE_JOURS, APPS, PORTEES };
