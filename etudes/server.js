// Pipe-Fit Études : application du bureau d'études fluides (CVC, tuyauterie industrielle).
// Sa propre base (études et notes de calcul versionnées), son propre port ; elle lit la liste des affaires dans Pipe-Fit
// avec le compte de l'utilisateur (même identifiant et mot de passe ; réservée au bureau).
// Aucune dépendance externe : Node.js >= 22.13 (node:sqlite).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const HS = require('../server/http-securite');
const RexPF = require('./rex');
const PF = require('../server/pf-client');

const PORT = +process.env.ETUDES_PORT || 3200;
const HOST = process.env.HOST || '0.0.0.0';
const PIPEFIT = String(process.env.PIPEFIT_URL || 'http://localhost:3000').replace(/\/+$/, '');
const DB_FILE = process.env.ETUDES_DB_FILE || path.join(__dirname, 'data', 'etudes.db');
const PUBLIC_DIR = path.join(__dirname, 'public');
// Modules de Pipe-Fit et de l'application DOE servis tels quels : moteur PDF, feuille de style commune, logo
const PARTAGES = { '/shared/pdf.js': path.join(__dirname, '..', 'public', 'js', 'pdf.js'), '/shared/doe.css': path.join(__dirname, '..', 'doe', 'public', 'css', 'doe.css'),
  '/shared/pdf-lib.min.js': path.join(__dirname, '..', 'doe', 'public', 'vendor', 'pdf-lib-1.17.1.min.js'),
  '/logo-tecnitub.png': path.join(__dirname, '..', 'doe', 'public', 'logo-tecnitub.png'),
  // Lecture du CCTP et du DPGF (inventaire des producteurs et émetteurs) : texte des PDF, classeurs Excel
  ...Object.fromEntries(['ocr.js', 'pdf-lecture.js', 'cctp-lecture.js', 'xlsx.js', 'xls.js', 'inventaire-cvc.js', 'dce.js', 'materiel-retenu.js', 'fiches-tech.js', 'essais.js', 'planches.js', 'plaque-registre.js', 'reserves-terrain.js', 'retour-chantier.js', 'rex-equipements.js', 'installe.js', 'devis-lecture.js', 'planning-etude.js', 'aide.js', 'offre-etude.js', 'fusion-etude.js'].map(f => [`/shared/${f}`, path.join(__dirname, '..', 'public', 'js', f)])),
  ...Object.fromEntries(['pdf.min.js', 'pdf.worker.min.js'].map(f => [`/vendor/pdfjs/${f}`, path.join(__dirname, '..', 'public', 'vendor', 'pdfjs', f)])),
  // Lecture des caractères (CCTP scannés) : mêmes fichiers que le CRM
  ...Object.fromEntries(['tesseract.min.js', 'worker.min.js', 'tesseract-core-simd-lstm.wasm.js', 'fra.traineddata.gz'].map(f => [`/vendor/tesseract/${f}`, path.join(__dirname, '..', 'public', 'vendor', 'tesseract', f)])) };
const MAX_JSON = 25 * 1024 * 1024, SESSION_JOURS = 14; // note de calcul PDF transmise en JSON (base64)
const ROLES_ETUDES = ['admin', 'charge'];
// Limite des tentatives de connexion propre à l'application : par identifiant et par adresse du client réel,
// temporisation progressive (voir server/limite-connexion.js)
const TENTATIVES = require('../server/limite-connexion').creer();
// Routes coûteuses : dépôt de fichiers (60 par minute et par compte), fichiers du chantier lus au travers de Pipe-Fit
// (CCTP, DPGF lus et reconnus dans le navigateur : 120 par minute), données Pipe-Fit complètes (retour d'expérience)
const LIMITES = { depot: HS.limiteur({ max: 60, fenetreMs: 60000 }), lecture: HS.limiteur({ max: 120, fenetreMs: 60000 }), donnees: HS.limiteur({ max: 20, fenetreMs: 60000 }) };
const tropDeDemandes = (res, limite, cle) => { const att = LIMITES[limite](cle); if (att) { fail(res, 429, `Trop de demandes à la suite : réessayez dans ${att} s.`, {}); return true; } return false; };

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, login TEXT, nom TEXT, role TEXT, pf_cookie TEXT, created_at TEXT);
  CREATE TABLE IF NOT EXISTS etudes (id TEXT PRIMARY KEY, affaire_id TEXT, data TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT, updated_by TEXT);
  CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS fichiers (id TEXT PRIMARY KEY, nom TEXT, mime TEXT, data BLOB, taille INTEGER, created_by TEXT, created_at TEXT);
  CREATE TABLE IF NOT EXISTS modeles_biblio (id TEXT PRIMARY KEY, cle TEXT UNIQUE, data TEXT NOT NULL, updated_at TEXT, updated_by TEXT);`);
// Fiche de l'équipe Pipe-Fit du compte connecté (responsable des étapes : « Mes étapes »)
if (!db.prepare('PRAGMA table_info(sessions)').all().some(c => c.name === 'user_id')) db.exec('ALTER TABLE sessions ADD COLUMN user_id TEXT');
// Jeton de service Pipe-Fit de chaque session (jamais la session Pipe-Fit elle-même) : chiffré (AES-256-GCM, lié à la
// session) avec la clé propre à ce serveur, gardée hors de la base (variable ETUDES_CLE_SESSIONS, sinon fichier etudes-sessions.key)
const SecretLocal = require('../server/secret-local');
const CLE = SecretLocal.cleServeur({ env: process.env.ETUDES_CLE_SESSIONS, fichier: process.env.ETUDES_CLE_SESSIONS_FICHIER || path.join(path.dirname(DB_FILE), 'etudes-sessions.key') }).cle;
db.exec('PRAGMA secure_delete = ON');
{
  const cols = db.prepare('PRAGMA table_info(sessions)').all().map(c => c.name);
  if (!cols.includes('pf_jeton')) db.exec('ALTER TABLE sessions ADD COLUMN pf_jeton TEXT; ALTER TABLE sessions ADD COLUMN pf_expire TEXT;');
  // Migration : sessions d'avant les jetons (cookie de session Pipe-Fit en clair) effacées, octets compris (secure_delete,
  // journal vidé) ; ces sessions Pipe-Fit sont fermées dans Pipe-Fit dès qu'il répond. Les personnes se reconnectent.
  const anciennes = db.prepare("SELECT pf_cookie FROM sessions WHERE pf_cookie IS NOT NULL AND pf_cookie <> ''").all().map(r => r.pf_cookie);
  const n = db.prepare("DELETE FROM sessions WHERE pf_jeton IS NULL OR (pf_cookie IS NOT NULL AND pf_cookie <> '')").run().changes;
  if (n) {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    console.log(`Études : ${n} session(s) d'avant le chiffrement fermée(s) (reconnexion demandée)`);
    setTimeout(() => anciennes.forEach(c => fetch(`${PIPEFIT}/api/logout`, { method: 'POST', headers: { Cookie: c, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) }).catch(() => {})), 3000).unref();
  }
}
const jetonDe = s => SecretLocal.dechiffrer(CLE, s.pf_jeton, s.sid);

// Bibliothèque de modèles partagée entre les études (même module que le navigateur : doublons, versions, prix)
const BiblioModeles = require('./public/js/bibliotheque-modeles');
// Versions des études, corbeille des calculs supprimés, présence (qui a l'étude ouverte)
const Historique = require('./historique')(db, { reglages: () => ({ max: process.env.ETUDES_VERSIONS_MAX, jours: process.env.ETUDES_VERSIONS_JOURS, intervalleMin: process.env.ETUDES_VERSIONS_INTERVALLE, ...(lireConfig().versions || {}) }) });

/* ---------- Auteur des études et corbeille des études supprimées ---------- */
const CorbeilleEtudes = require('./public/js/corbeille-etudes');
// Auteur (compte qui a créé l'étude) : colonnes ajoutées ; une étude d'avant reprend le nom de l'auteur de sa première
// version (ou du dernier enregistrement), sans identifiant : ce nom suffit à la reconnaître
{
  const cols = db.prepare('PRAGMA table_info(etudes)').all().map(c => c.name);
  if (!cols.includes('auteur_login')) {
    db.exec('ALTER TABLE etudes ADD COLUMN auteur_login TEXT; ALTER TABLE etudes ADD COLUMN auteur_nom TEXT;');
    const premiere = db.prepare("SELECT auteur FROM etudes_versions WHERE etude_id = ? AND auteur <> '' ORDER BY id LIMIT 1");
    db.prepare('SELECT id, updated_by FROM etudes').all().forEach(r => db.prepare('UPDATE etudes SET auteur_nom = ? WHERE id = ?').run(((premiere.get(r.id) || {}).auteur) || r.updated_by || '', r.id));
  }
}
// Étude supprimée : la ligne entière, son auteur, le dernier état transmis à Pipe-Fit (resume) pour la restauration ;
// ses versions et sa corbeille de calculs restent dans leurs tables jusqu'à l'effacement définitif
db.exec(`CREATE TABLE IF NOT EXISTS etudes_supprimees (id TEXT PRIMARY KEY, affaire_id TEXT, data TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT, updated_by TEXT,
  auteur_login TEXT, auteur_nom TEXT, resume TEXT, supprime_at TEXT NOT NULL, supprime_par TEXT, supprime_par_login TEXT)`);
const auteurDe = r => ({ login: r.auteur_login || '', nom: r.auteur_nom || '' });
const joursCorbeille = () => CorbeilleEtudes.jours(lireConfig().corbeilleJours || process.env.ETUDES_CORBEILLE_JOURS);
// Effacement définitif des études restées plus longtemps que la durée réglée (au démarrage, puis toutes les 6 heures)
function purgerCorbeille(maintenant = new Date().toISOString()) {
  const ids = CorbeilleEtudes.aPurger(db.prepare('SELECT id, supprime_at AS supprimeLe FROM etudes_supprimees').all(), joursCorbeille(), maintenant);
  ids.forEach(id => { db.prepare('DELETE FROM etudes_supprimees WHERE id = ?').run(id); Historique.supprimer(id); });
  return ids.length;
}

// Identité de l'entreprise sur les notes de calcul (la même que pour les DOE), modifiable dans Réglages
const CONFIG_DEFAUT = require('../doe/config-defaut');
const lireConfig = () => { const r = db.prepare("SELECT value FROM config WHERE key = 'etudes'").get(); const c = r ? JSON.parse(r.value) : {}; return { ...CONFIG_DEFAUT, ...c, societe: { ...CONFIG_DEFAUT.societe, ...(c.societe || {}) } }; };

/* ---------- Outils HTTP ---------- */
function send(res, status, obj, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}
const fail = (res, status, error, extra = {}, headers = {}) => send(res, status, { error, ...extra }, headers);
function lireJSON(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_JSON) { reject(Object.assign(new Error('Requête trop volumineuse'), { status: 413 })); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => {
      const b = Buffer.concat(chunks);
      if (!b.length) return resolve({});
      try { resolve(JSON.parse(b.toString('utf8'))); } catch (e) { reject(Object.assign(new Error('JSON invalide'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
const cookies = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, v.join('=')]));
// Seule l'empreinte de l'identifiant de session est enregistrée
const empreinte = sid => crypto.createHash('sha256').update(String(sid)).digest('hex');
const cookieSession = (req, sid, age) => `etudes_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${HS.estHttps(req) ? '; Secure' : ''}`;
function session(req) {
  const sid = cookies(req).etudes_sid;
  if (!sid) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE sid = ?').get(empreinte(sid));
  if (!s) return null;
  if (Date.now() - new Date(s.created_at) > SESSION_JOURS * 86400000 || (s.pf_expire && s.pf_expire < new Date().toISOString())) { db.prepare('DELETE FROM sessions WHERE sid = ?').run(s.sid); return null; }
  return s;
}

/* ---------- Lien avec Pipe-Fit ---------- */
async function pipefit(s, chemin, opts = {}) {
  const jeton = jetonDe(s);
  if (!jeton) { db.prepare('DELETE FROM sessions WHERE sid = ?').run(s.sid); throw Object.assign(new Error('Session expirée : reconnectez-vous.'), { status: 401 }); }
  const r = await PF.appelJeton(PIPEFIT, jeton, chemin, opts);
  if (r.status === 401) { db.prepare('DELETE FROM sessions WHERE sid = ?').run(s.sid); throw Object.assign(new Error('Session Pipe-Fit expirée : reconnectez-vous.'), { status: 401 }); }
  return r;
}
// Compte toujours du bureau dans Pipe-Fit : revérifié toutes les 5 minutes avec le jeton de la session (un compte
// supprimé ou passé hors du bureau perd l'accès à l'application, à ses données et à ses fichiers ; Pipe-Fit injoignable :
// la session continue)
const verifications = new Map();
async function verifierCompte(s) {
  const t = verifications.get(s.sid);
  if (t && Date.now() - t < 300000) return;
  try { await (await pipefit(s, '/api/me')).arrayBuffer(); } catch (e) { if (e.status === 401) throw e; }
  if (verifications.size > 5000) verifications.clear();
  verifications.set(s.sid, Date.now());
}
// Seules les informations utiles aux études sont transmises au navigateur : affaires, clients, bibliothèque de prix, main-d'œuvre
// Site du chantier (adresse du client) : la ville sert à proposer le climat de l'étude
const siteAffaire = (d, a) => (((d.entreprises || []).find(e => e.id === a.clientId) || {}).adresses || []).find(s => s.id === a.siteId) || {};
// Contacts du client et de la maîtrise d'œuvre des chantiers : liste de diffusion de l'étude
const contactsPF = d => {
  const ents = new Set((d.affaires || []).flatMap(a => [a.clientId, a.moeId]).filter(Boolean));
  return (d.contacts || []).filter(c => ents.has(c.entrepriseId)).map(c => ({ id: c.id, entrepriseId: c.entrepriseId, civilite: c.civilite || '', prenom: c.prenom || '', nom: c.nom || '', fonction: c.fonction || '', email: c.email || '' }));
};
const extraitPF = d => ({
  affaires: (d.affaires || []).map(a => ({ id: a.id, code: a.code, nom: a.nom, clientId: a.clientId, contactId: a.contactId, siteId: a.siteId, chargeId: a.chargeId, statut: a.statut, type: a.type,
    moeId: a.moeId || '', moeContactId: a.moeContactId || '', siteVille: siteAffaire(d, a).ville || '', siteCp: siteAffaire(d, a).cp || '',
    // CCTP et DPGF déposés dans les documents du chantier : lus pour préremplir l'étude
    documents: (a.documents || []).filter(x => x.categorie === 'CCTP' || x.categorie === 'DPGF' || /(?<![a-z])(cctp|dpgf|dqe|bpu)(?![a-z])/i.test(x.nom || '')).map(x => ({ id: x.id, nom: x.nom, fichierId: x.fichierId, mime: x.mime, categorie: x.categorie })),
    // Tous les documents du chantier (plans, fiches…) : joints aux documents émis de l'étude, indices suivis
    tousDocuments: (a.documents || []).filter(x => x.fichierId).map(x => ({ id: x.id, nom: x.nom, fichierId: x.fichierId, mime: x.mime, categorie: x.categorie, indice: x.indice || '', date: x.date || '', etudeId: x.etudeId || '' })) })),
  entreprises: (d.entreprises || []).map(e => ({ id: e.id, nom: e.nom, regimeTVA: e.regimeTVA, categorie: e.categorie })),
  contacts: contactsPF(d),
  // Devis (étude faite avant la commande, reliée à son devis)
  devis: (d.devis || []).map(x => ({ id: x.id, numero: x.numero, objet: x.objet, clientId: x.clientId, statut: x.statut, affaireId: x.affaireId || '' })),
  articles: (d.articles || []).map(a => ({ id: a.id, ref: a.ref, designation: a.designation, famille: a.famille, sousFamille: a.sousFamille, unite: a.unite, prixVente: a.prixVente, coutRevient: a.coutRevient, poidsUnitaire: a.poidsUnitaire })),
  mainoeuvre: (d.mainoeuvre || []).map(m => ({ id: m.id, code: m.code, libelle: m.libelle, tauxVente: m.tauxVente, tauxCout: m.tauxCout })),
  prixFournisseurs: prixFournisseurs(d),
  // Équipe (responsables des étapes de l'étude) : identifiant, nom et rôle seulement
  users: (d.users || []).filter(u => u && u.id && !u.archive && u.actif !== false).map(u => ({ id: u.id, nom: String(u.nom || ''), role: u.role || '' })),
});
// Prix fournisseurs des offres reçues dans les consultations (derniers prix connus de la bibliothèque de modèles) :
// désignation de la ligne, fournisseur, prix unitaire HT, date de l'offre
function prixFournisseurs(d) {
  const ents = new Map((d.entreprises || []).map(e => [e.id, e.nom])), out = [];
  (d.consultations || []).forEach(c => (c.fournisseurs || []).forEach(f => {
    const o = f && f.offre; if (!o || !o.prix) return;
    Object.entries(o.prix).forEach(([i, prix]) => { const l = (c.lignes || [])[+i]; if (l && Number(prix) > 0) out.push({ designation: String(l.designation || '').slice(0, 200), unite: l.unite || 'u', fournisseur: ents.get(f.entrepriseId) || '', prix: Number(prix), date: String(o.date || c.date || '').slice(0, 10), consultation: c.ref || '' }); });
  }));
  return out.filter(x => x.fournisseur).slice(-3000);
}
const { idPF, envoyerFichierPF, publierEtat } = PF;
const modifierPF = (s, col, id, modifier) => PF.modifierPF((chemin, opts) => pipefit(s, chemin, opts), col, id, modifier);
const cacheDonnees = new Map(); // sid -> { t, data }

// Envoi en arrière-plan : une étude s'enregistre même si Pipe-Fit est momentanément injoignable
// (affaireId vide : étude sans chantier, visible dans le CRM pour être reliée ; null : retirée)
const signalerPF = (s, id, affaireId, resume, extra) => publierEtat((chemin, opts) => pipefit(s, chemin, opts), 'etudes', id, affaireId, resume && typeof resume === 'object' ? resume : { objet: '' }, extra)
  .catch(e => console.warn(`Études → Pipe-Fit : ${e.message}`));
// Études sans chantier reliées depuis le CRM (commande reçue) : le chantier est repris dans l'étude
async function reprendreLiens(s) {
  const r = await pipefit(s, '/api/liens?app=etudes').catch(() => null);
  if (!r || !r.ok) return;
  const liens = await r.json().catch(() => []), now = new Date().toISOString();
  for (const l of liens.filter(x => x.affaireId)) {
    const e = db.prepare("SELECT * FROM etudes WHERE id = ? AND affaire_id = ''").get(l.id);
    if (!e) continue;
    const data = JSON.parse(e.data);
    if (data.modele) continue;
    data.affaireId = l.affaireId;
    db.prepare('UPDATE etudes SET affaire_id = ?, data = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE id = ?')
      .run(l.affaireId, JSON.stringify(data), now, `${(l.relie || {}).par || 'Pipe-Fit'} (relié dans Pipe-Fit)`, e.id);
  }
}

async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean), method = req.method;
  // Protection CSRF : écritures en JSON uniquement (impossible depuis un formulaire d'un autre site), origine contrôlée
  if (method !== 'GET' && !(req.headers['content-type'] || '').startsWith('application/json')) return fail(res, 415, 'Content-Type application/json requis');
  if (HS.origineRefusee(req)) return fail(res, 403, 'Origine de la requête refusée');

  if (p[0] === 'login' && method === 'POST') {
    const { login, password } = await lireJSON(req), qui = { login, ip: HS.ipClient(req) };
    const att = TENTATIVES.attente(qui);
    if (att) return fail(res, 429, TENTATIVES.message(att), { attente: att }, { 'Retry-After': String(att) });
    let c;
    try { c = await PF.connexionPF(PIPEFIT, { login, password, ip: HS.ipClient(req), app: 'etudes', roles: ROLES_ETUDES, refusRole: 'L\'application Études est réservée au bureau (administrateur ou chargé d\'affaires).' }); }
    catch (e) {
      // Mauvais identifiant ou mot de passe : compté (un refus pour le rôle n'est pas un mot de passe faux)
      if (e.status === 401) { const a = TENTATIVES.echec(qui); return fail(res, 401, a ? `${e.message}. ${TENTATIVES.message(a)}` : e.message, a ? { attente: a } : {}); }
      if (e.status === 429) return fail(res, 429, e.message);
      return fail(res, e.status || 502, e.message);
    }
    TENTATIVES.succes(qui);
    const { me } = c, sid = crypto.randomBytes(24).toString('base64url'), h = empreinte(sid);
    db.prepare('INSERT INTO sessions (sid, login, nom, role, pf_cookie, created_at, user_id, pf_jeton, pf_expire) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)')
      .run(h, me.login, me.nom, me.role, new Date().toISOString(), me.userId || null, SecretLocal.chiffrer(CLE, c.jeton, h), c.expire || null);
    verifications.set(h, Date.now());
    return send(res, 200, { login: me.login, nom: me.nom, role: me.role }, { 'Set-Cookie': cookieSession(req, sid, SESSION_JOURS * 86400) });
  }
  const s = session(req);
  if (!s) return fail(res, 401, 'Non connecté');
  if (!(p[0] === 'logout' && method === 'POST')) await verifierCompte(s);
  if (p[0] === 'logout' && method === 'POST') {
    await pipefit(s, '/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    db.prepare('DELETE FROM sessions WHERE sid = ?').run(s.sid); cacheDonnees.delete(s.sid);
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookieSession(req, '', 0) });
  }
  if (p[0] === 'me' && method === 'GET') return send(res, 200, { login: s.login, nom: s.nom, role: s.role, userId: s.user_id || '', pipefit: process.env.PIPEFIT_PUBLIC_URL || '' });

  // Affaires de Pipe-Fit (lecture seule, droits de l'utilisateur)
  if (p[0] === 'pf' && p[1] === 'affaires' && method === 'GET') {
    const c = cacheDonnees.get(s.sid);
    if (c && Date.now() - c.t < 15000 && !url.searchParams.has('frais')) return send(res, 200, c.data);
    const r = await pipefit(s, '/api/data');
    if (!r.ok) return fail(res, 502, 'Lecture des données Pipe-Fit impossible');
    const data = extraitPF(await r.json());
    cacheDonnees.set(s.sid, { t: Date.now(), data });
    return send(res, 200, data);
  }

  // Étapes de l'étude faites sur le terrain (appli des compagnons : photo, commentaire), reprises dans le suivi des étapes
  if (p[0] === 'pf' && p[1] === 'etapes-terrain' && method === 'GET') {
    const r = await pipefit(s, `/api/liens/etapes/terrain?etudeId=${encodeURIComponent(url.searchParams.get('etudeId') || '')}`);
    if (!r.ok) return fail(res, 502, 'Lecture des étapes du chantier impossible');
    return send(res, 200, await r.json());
  }

  // Fichier d'un document du chantier (CCTP, DPGF), lu par Pipe-Fit avec les droits de la personne
  if (p[0] === 'pf' && p[1] === 'fichier' && p[2] && method === 'GET') {
    if (tropDeDemandes(res, 'lecture', s.login)) return;
    const r = await pipefit(s, `/api/files/${encodeURIComponent(p[2])}`);
    if (!r.ok) return fail(res, 404, 'Fichier Pipe-Fit introuvable');
    const buf = Buffer.from(await r.arrayBuffer());
    // Téléchargé, jamais interprété par le navigateur (bac à sable si le type annoncé n'est pas une image ou un PDF)
    res.writeHead(200, { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'attachment', 'Content-Security-Policy': 'sandbox' });
    return res.end(buf);
  }

  // Retour d'expérience pour caler le métré : chantiers terminés, heures prévues (devis acceptés) et heures pointées par main-d'œuvre
  if (p[0] === 'pf' && p[1] === 'rex' && method === 'GET') {
    if (tropDeDemandes(res, 'donnees', s.login)) return;
    const r = await pipefit(s, '/api/data');
    if (!r.ok) return fail(res, 502, 'Lecture des données Pipe-Fit impossible');
    return send(res, 200, RexPF(await r.json()));
  }

  // Pièces jointes des études (PDF annoté retourné par le maître d'œuvre, visa) : envoyées en JSON (base64)
  if (p[0] === 'fichiers' && !p[1] && method === 'POST') {
    if (tropDeDemandes(res, 'depot', s.login)) return;
    const b = await lireJSON(req), nom = String(b.nom || '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 150), ext = (/\.([a-z0-9]+)$/i.exec(nom) || [])[1] || '';
    const mime = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }[ext.toLowerCase()];
    if (!mime) return fail(res, 415, 'PDF, JPG ou PNG attendu');
    const buf = Buffer.from(String(b.base64 || ''), 'base64');
    if (!buf.length || buf.length > 15 * 1024 * 1024) return fail(res, 400, 'Fichier vide ou de plus de 15 Mo');
    if (mime === 'application/pdf' && buf.subarray(0, 4).toString() !== '%PDF') return fail(res, 415, 'Le contenu n\'est pas un PDF');
    const id = crypto.randomBytes(12).toString('hex');
    db.prepare('INSERT INTO fichiers (id, nom, mime, data, taille, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, nom, mime, buf, buf.length, s.login, new Date().toISOString());
    return send(res, 200, { id, nom, mime, taille: buf.length });
  }
  if (p[0] === 'fichiers' && p[1] && method === 'GET') {
    const f = db.prepare('SELECT nom, mime, data, created_by FROM fichiers WHERE id = ?').get(p[1]);
    if (!f) return fail(res, 404, 'Fichier introuvable');
    // Application du bureau : fichier d'une étude ouverte à tout le bureau ; fichier rattaché seulement à une étude
    // supprimée : à son auteur, à l'administrateur ou au déposant (comme la restauration de l'étude)
    if (s.role !== 'admin' && f.created_by !== s.login && !db.prepare('SELECT 1 FROM etudes WHERE instr(data, ?) > 0 LIMIT 1').get(p[1])) {
      const sup = db.prepare('SELECT auteur_login, auteur_nom FROM etudes_supprimees WHERE instr(data, ?) > 0').all(p[1]);
      if (sup.length && !sup.some(r => CorbeilleEtudes.peutGerer(auteurDe(r), s))) return fail(res, 403, 'Fichier d\'une étude supprimée : réservé à son auteur ou à l\'administrateur');
    }
    res.writeHead(200, { 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `inline; filename="${encodeURIComponent(f.nom)}"` });
    return res.end(Buffer.from(f.data));
  }
  // Diffusion d'un document émis : e-mail envoyé par Pipe-Fit (Microsoft 365, adresse de la personne), PDF joints
  if (p[0] === 'pf' && p[1] === 'mail' && method === 'POST') {
    const b = await lireJSON(req);
    const r = await pipefit(s, '/api/mail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'etude', to: b.to, cc: b.cc || [], subject: b.subject, html: b.html, attachments: b.attachments || [] }) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? send(res, 200, { ok: true }) : fail(res, r.status, j.error || 'Envoi refusé par Pipe-Fit');
  }
  // Bibliothèque des fiches techniques de Pipe-Fit : recherche par fabricant + référence, liens d'un catalogue téléchargés
  if (p[0] === 'pf' && p[1] === 'fiches' && p[2] === 'catalogue-lignes' && method === 'GET') {
    const r = await pipefit(s, '/api/fiches/catalogue-lignes');
    return r.ok ? send(res, 200, await r.json()) : fail(res, r.status, 'Bibliothèque Pipe-Fit indisponible');
  }
  if (p[0] === 'pf' && p[1] === 'fiches' && ['trouver', 'catalogue'].includes(p[2]) && method === 'POST') {
    const b = await lireJSON(req);
    const r = await pipefit(s, `/api/fiches/${p[2]}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    if (!r.ok) return p[2] === 'trouver' ? send(res, 200, []) : fail(res, r.status, ((await r.json().catch(() => ({}))).error) || 'Bibliothèque Pipe-Fit indisponible');
    return send(res, 200, await r.json());
  }
  // Fiche de la bibliothèque choisie pour remplir un calcul : liste (recherche) et texte lu par Pipe-Fit
  if (p[0] === 'pf' && p[1] === 'fiches' && ['liste', 'pages'].includes(p[2]) && method === 'GET') {
    const r = await pipefit(s, p[2] === 'liste' ? `/api/fiches/liste?q=${encodeURIComponent(url.searchParams.get('q') || '')}` : `/api/fiches/pages?id=${encodeURIComponent(url.searchParams.get('id') || '')}`);
    if (!r.ok) return p[2] === 'liste' ? send(res, 200, []) : fail(res, r.status, 'Fiche indisponible');
    return send(res, 200, await r.json());
  }
  // Valeurs réglées sur site (PV de réglage du chantier) : reprises dans l'étude, nouvel indice du cahier
  if (p[0] === 'pf' && p[1] === 'valeurs-reglees' && method === 'GET') {
    const r = await pipefit(s, `/api/liens/valeurs-reglees?affaireId=${encodeURIComponent(url.searchParams.get('affaireId') || '')}`);
    return r.ok ? send(res, 200, await r.json()) : send(res, 200, []);
  }
  // Pressions des CTA relevées à la mise en service du chantier (Pipe-Fit) : consignes de pression de la régulation
  if (p[0] === 'pf' && p[1] === 'pressions-cta' && method === 'GET') {
    const r = await pipefit(s, `/api/liens/pressions-cta?affaireId=${encodeURIComponent(url.searchParams.get('affaireId') || '')}`);
    return r.ok ? send(res, 200, await r.json()) : send(res, 200, []);
  }
  // Retour du chantier (mesures de mise en service, réserves levées, suivi du matériel) et retour d'expérience des modèles
  if (p[0] === 'pf' && p[1] === 'retour' && method === 'GET') {
    const r = await pipefit(s, `/api/liens/retour?affaireId=${encodeURIComponent(url.searchParams.get('affaireId') || '')}&etudeId=${encodeURIComponent(url.searchParams.get('etudeId') || '')}`);
    return r.ok ? send(res, 200, await r.json()) : fail(res, r.status === 403 ? 403 : 502, 'Retour du chantier indisponible dans Pipe-Fit');
  }
  if (p[0] === 'pf' && p[1] === 'rex-modeles' && method === 'GET') {
    const r = await pipefit(s, '/api/liens/rex-modeles');
    return r.ok ? send(res, 200, await r.json()) : send(res, 200, []);
  }
  // Suivi du matériel retenu sur le chantier (soumission, pose, mise en service) : lu dans Pipe-Fit
  if (p[0] === 'pf' && p[1] === 'materiel-suivi' && method === 'GET') {
    const r = await pipefit(s, `/api/liens/materiel/suivi?etudeId=${encodeURIComponent(url.searchParams.get('etudeId') || '')}`);
    return r.ok ? send(res, 200, await r.json()) : send(res, 200, []);
  }
  // Note de calcul (ou liste du matériel à valider) déposée dans les documents du chantier, nouvel indice si déjà déposée pour cette étude
  if (p[0] === 'pf' && p[1] === 'document' && method === 'POST') {
    const b = await lireJSON(req), nom = String(b.nom || '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 150);
    const categorie = ['Note de calcul', 'Matériel à valider'].includes(b.categorie) ? b.categorie : 'Note de calcul';
    if (!b.affaireId || !/\.pdf$/i.test(nom) || !b.base64) return fail(res, 400, 'Affaire, nom de fichier PDF et contenu requis');
    const buf = Buffer.from(String(b.base64), 'base64');
    if (buf.subarray(0, 4).toString() !== '%PDF') return fail(res, 400, 'Le contenu n\'est pas un PDF');
    const f = await envoyerFichierPF((chemin, opts) => pipefit(s, chemin, opts), nom, 'application/pdf', buf);
    let docId = '', indice = '';
    await modifierPF(s, 'affaires', b.affaireId, a => {
      // Un document par étude et par calcul émis (noteId) : un nouvel indice remplace le précédent (gardé dans « anciens »)
      const docs = a.documents || [], ex = b.etudeId && docs.find(d => d.categorie === categorie && d.etudeId === b.etudeId && (d.noteId || '') === String(b.noteId || '')), date = new Date().toISOString().slice(0, 10);
      if (ex) {
        ex.anciens = [...(ex.anciens || []), { fichierId: ex.fichierId, indice: ex.indice || 'A', date: ex.date }];
        Object.assign(ex, { fichierId: f.id, nom, mime: f.mime, taille: f.taille, indice: String(b.indice || ex.indice || 'A'), date, par: s.nom || s.login, note: String(b.note || ex.note || '') });
        docId = ex.id; indice = ex.indice;
      } else {
        docId = idPF(); indice = String(b.indice || 'A');
        docs.push({ id: docId, fichierId: f.id, nom, categorie, indice, note: String(b.note || ''), mime: f.mime, taille: f.taille, date, par: s.nom || s.login, visible: false, etudeId: String(b.etudeId || ''), ...(b.noteId ? { noteId: String(b.noteId) } : {}) });
      }
      return { ...a, documents: docs };
    });
    return send(res, 200, { ok: true, docId, indice });
  }
  // Devis fournisseur lu dans l'étude → offre de la consultation du chantier dans Pipe-Fit (créée ou complétée) ; sens
  // inverse : offres saisies ou lues dans Pipe-Fit pour le matériel retenu de l'étude
  if (p[0] === 'pf' && p[1] === 'offre-consultation' && method === 'POST') {
    const b = await lireJSON(req);
    const r = await pipefit(s, '/api/liens/offre-etude', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? send(res, 200, j) : fail(res, [400, 403].includes(r.status) ? r.status : 502, j.error || 'Offre refusée par Pipe-Fit');
  }
  if (p[0] === 'pf' && p[1] === 'offres-etude' && method === 'GET') {
    const r = await pipefit(s, `/api/liens/offres-etude?etudeId=${encodeURIComponent(url.searchParams.get('etudeId') || '')}`);
    return r.ok ? send(res, 200, await r.json()) : send(res, 200, []);
  }
  // Devis brouillon créé dans Pipe-Fit à partir du métré de l'étude (client, contact et site de l'affaire)
  // Liste d'achat d'une étude : consultation fournisseurs « En cours » dans Pipe-Fit (offres, attribution, commandes)
  if (p[0] === 'pf' && p[1] === 'consultation' && method === 'POST') {
    const b = await lireJSON(req);
    if (!b.affaireId || !Array.isArray(b.lignes) || !b.lignes.length) return fail(res, 400, 'Chantier et lignes de la liste d\'achat requis');
    const lignes = b.lignes.slice(0, 400).map(l => ({ articleId: String(l.articleId || '').slice(0, 64), designation: String(l.designation || '').slice(0, 200), unite: String(l.unite || 'u').slice(0, 10), qte: Number(l.qte) > 0 ? Number(l.qte) : 1 }));
    const j7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), id = idPF();
    const data = { ref: '', objet: String(b.objet || 'Liste d\'achat du bureau d\'études').slice(0, 200), affaireId: String(b.affaireId), date: new Date().toISOString().slice(0, 10), dateLimite: j7, dateLivraison: '',
      statut: 'En cours', lignes, fournisseurs: [], origine: { app: 'etudes', etudeId: String(b.etudeId || '').slice(0, 64), noteId: String(b.noteId || '').slice(0, 64) } };
    const w = await pipefit(s, `/api/records/consultations/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
    const j = await w.json().catch(() => ({}));
    if (!w.ok) return fail(res, w.status === 403 ? 403 : w.status === 400 ? 400 : 502, j.error || 'Création de la consultation refusée par Pipe-Fit');
    return send(res, 200, { id: j.id || id, ref: j.ref || '' });
  }
  if (p[0] === 'pf' && p[1] === 'devis' && method === 'POST') {
    const b = await lireJSON(req);
    if ((!b.affaireId && !b.clientId) || !Array.isArray(b.lignes) || !b.lignes.length) return fail(res, 400, 'Affaire (ou client) et lignes du devis requises');
    // Étude sans chantier : devis pour le client (le chantier naîtra de son acceptation)
    let a = { id: '', clientId: String(b.clientId || ''), nom: '' };
    if (b.affaireId) {
      const ra = await pipefit(s, `/api/records/affaires/${encodeURIComponent(b.affaireId)}`);
      if (!ra.ok) return fail(res, ra.status === 404 ? 404 : 502, 'Affaire introuvable dans Pipe-Fit');
      a = await ra.json();
    }
    const rc = a.clientId ? await pipefit(s, `/api/records/entreprises/${encodeURIComponent(a.clientId)}`) : null, client = rc && rc.ok ? await rc.json() : {};
    const tva = client.regimeTVA === 'AL' ? { autoliquidation: true } : { autoliquidation: false, tauxTVA: client.regimeTVA ? Number(client.regimeTVA) : '' };
    const id = idPF(), data = { numero: '', objet: String(b.objet || a.nom || 'Chiffrage bureau d\'études').slice(0, 200), clientId: a.clientId || '', contactId: a.contactId || '', siteId: a.siteId || '', chargeId: a.chargeId || '',
      affaireId: a.id || '', date: new Date().toISOString().slice(0, 10), validite: 30, statut: 'Brouillon', zoneId: '', ajustements: [], lignes: b.lignes, numAuto: true, ...tva,
      notes: `Métré établi par le bureau d'études (application Études${b.etudeId ? `, étude ${b.etudeId}` : ''}) : quantités et prix à vérifier.` };
    const w = await pipefit(s, `/api/records/devis/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
    const j = await w.json().catch(() => ({}));
    if (!w.ok) return fail(res, w.status === 403 ? 403 : w.status === 400 ? 400 : 502, j.error || 'Création du devis refusée par Pipe-Fit');
    return send(res, 200, { id: j.id || id, numero: j.numero || '' });
  }

  // Études : en-tête (affaire, objet, indice) et notes de calcul ; contrôle de version à l'enregistrement
  const ligne = r => ({ ...JSON.parse(r.data), id: r.id, _v: r.version, _at: r.updated_at, _by: r.updated_by, _auteur: r.auteur_nom || '', _auteurLogin: r.auteur_login || '' });
  // Études supprimées : liste (toutes, pour le bureau), restauration et effacement définitif (auteur ou administrateur)
  if (p[0] === 'etudes-supprimees') {
    const jours = joursCorbeille();
    if (!p[1] && method === 'GET') {
      return send(res, 200, { jours, etudes: db.prepare('SELECT * FROM etudes_supprimees ORDER BY supprime_at DESC').all().map(r => {
        const d = JSON.parse(r.data);
        return { id: r.id, objet: d.objet || '', client: d.client || '', affaireId: r.affaire_id || '', indice: d.indice || '', calculs: (d.notes || []).length, modele: !!d.modele, version: r.version,
          auteur: r.auteur_nom || '', supprimeLe: r.supprime_at, supprimePar: r.supprime_par || '', purgeLe: CorbeilleEtudes.purgeLe(r.supprime_at, jours),
          versions: db.prepare('SELECT COUNT(*) AS n FROM etudes_versions WHERE etude_id = ?').get(r.id).n, peutRestaurer: CorbeilleEtudes.peutGerer(auteurDe(r), s) };
      }) });
    }
    if (!/^[\w-]{1,64}$/.test(String(p[1] || ''))) return fail(res, 400, 'Identifiant invalide');
    const r = db.prepare('SELECT * FROM etudes_supprimees WHERE id = ?').get(p[1]);
    if (!r) return fail(res, 404, 'Étude introuvable dans les études supprimées');
    if (!CorbeilleEtudes.peutGerer(auteurDe(r), s)) return fail(res, 403, CorbeilleEtudes.REFUS);
    if (p[2] === 'restaurer' && method === 'POST') {
      if (db.prepare('SELECT 1 FROM etudes WHERE id = ?').get(r.id)) return fail(res, 409, 'Une étude porte déjà cet identifiant');
      const now = new Date().toISOString(), v = r.version + 1;
      db.exec('BEGIN');
      try {
        db.prepare('INSERT INTO etudes (id, affaire_id, data, version, updated_at, updated_by, auteur_login, auteur_nom) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(r.id, r.affaire_id || '', r.data, v, now, `${s.nom || s.login} (restaurée)`, r.auteur_login, r.auteur_nom);
        db.prepare('DELETE FROM etudes_supprimees WHERE id = ?').run(r.id);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      // De nouveau visible dans Pipe-Fit (dernier état transmis avant la suppression)
      const d = JSON.parse(r.data);
      if (!d.modele) { let resume = null; try { resume = JSON.parse(r.resume || 'null'); } catch (e) { resume = null; } signalerPF(s, r.id, String(d.affaireId || r.affaire_id || ''), resume || { objet: d.objet || '' }, { clientId: String(d.clientId || ''), devisId: String(d.devisId || '') }); }
      return send(res, 200, ligne(db.prepare('SELECT * FROM etudes WHERE id = ?').get(r.id)));
    }
    if (!p[2] && method === 'DELETE') {
      db.prepare('DELETE FROM etudes_supprimees WHERE id = ?').run(r.id);
      Historique.supprimer(r.id);
      return send(res, 200, { ok: true });
    }
    return fail(res, 404, 'Route inconnue');
  }
  if (p[0] === 'etudes' && !p[1] && method === 'GET') await reprendreLiens(s);
  if (p[0] === 'etudes' && !p[1] && method === 'GET') return send(res, 200, db.prepare('SELECT * FROM etudes ORDER BY updated_at DESC').all().map(ligne));
  if (p[0] === 'etudes' && p[1]) {
    if (!/^[\w-]{1,64}$/.test(p[1])) return fail(res, 400, 'Identifiant invalide');
    const exist = db.prepare('SELECT * FROM etudes WHERE id = ?').get(p[1]);
    // Étude dans la corbeille : ni lue ni réécrite (un onglet resté ouvert ne la recrée pas) tant qu'elle n'est pas restaurée
    if (!exist && db.prepare('SELECT 1 FROM etudes_supprimees WHERE id = ?').get(p[1])) return fail(res, 410, 'Cette étude a été supprimée : restaurez-la depuis « Études supprimées ».', { supprimee: true });
    // Présence : qui d'autre a l'étude ouverte (signalé par le navigateur toutes les 30 s), version enregistrée
    if (p[2] === 'presence' && !p[3] && method === 'POST') {
      const b = await lireJSON(req), autres = Historique.presence(p[1], s, { quitte: b.quitte === true });
      return send(res, 200, { autres, ...(exist ? { _v: exist.version, _at: exist.updated_at, _by: exist.updated_by } : {}) });
    }
    // Versions (liste, aperçu d'une version) et corbeille des calculs supprimés ; la restauration est un enregistrement
    // ordinaire (PUT avec le motif) : contrôle de version, nouvelle version, rien n'est perdu
    if (['versions', 'corbeille'].includes(p[2]) && method === 'GET' && !p[4]) {
      if (!exist) return fail(res, 404, 'Étude introuvable');
      if (!p[3]) return send(res, 200, p[2] === 'versions' ? Historique.versions(p[1]) : Historique.corbeille(p[1]));
      const r = p[2] === 'versions' ? Historique.version(p[1], p[3]) : Historique.elementCorbeille(p[1], p[3]);
      return r ? send(res, 200, r) : fail(res, 404, p[2] === 'versions' ? 'Version introuvable' : 'Calcul introuvable dans la corbeille');
    }
    if (p[2]) return fail(res, 404, 'Route inconnue');
    if (method === 'GET') return exist ? send(res, 200, ligne(exist)) : fail(res, 404, 'Étude introuvable');
    if (method === 'PUT') {
      const { data, version, resume, motif } = await lireJSON(req);
      if (!data || typeof data !== 'object' || !String(data.objet || '').trim() || !Array.isArray(data.notes)) return fail(res, 400, 'Données manquantes (objet de l\'étude, notes)');
      if (exist && version !== exist.version) return fail(res, 409, `Modifiée entre-temps par ${exist.updated_by}`, { record: ligne(exist) });
      // Étude sans chantier déjà reliée dans le CRM : le chantier est repris
      if (!data.modele && !data.affaireId) {
        const l = await PF.lienEtude((chemin, opts) => pipefit(s, chemin, opts), p[1]).catch(() => null);
        if (l && l.affaireId) data.affaireId = l.affaireId;
      }
      // Contrôle refait après l'appel à Pipe-Fit : un autre enregistrement a pu passer pendant l'attente
      const actuel = db.prepare('SELECT * FROM etudes WHERE id = ?').get(p[1]);
      if (actuel && (!exist || actuel.version !== exist.version)) return fail(res, 409, `Modifiée entre-temps par ${actuel.updated_by}`, { record: ligne(actuel) });
      const propre = Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith('_') && k !== 'id'));
      const v = exist ? exist.version + 1 : 1, now = new Date().toISOString();
      // Auteur : le compte qui crée l'étude (jamais modifié ensuite)
      db.prepare(`INSERT INTO etudes (id, affaire_id, data, version, updated_at, updated_by, auteur_login, auteur_nom) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET affaire_id = excluded.affaire_id, data = excluded.data, version = excluded.version, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
        .run(p[1], data.affaireId || '', JSON.stringify(propre), v, now, s.nom || s.login, s.login, s.nom || s.login);
      // Historique : version (ou mise à jour de la version de la séance), calculs supprimés mis à la corbeille
      try { Historique.apresEnregistrement(p[1], exist ? JSON.parse(exist.data) : null, propre, { version: v, auteur: s.nom || s.login, motif: typeof motif === 'string' ? motif : '', maintenant: now }); }
      catch (e) { console.warn(`Études : historique de ${p[1]} non enregistré (${e.message})`); }
      Historique.presence(p[1], s, { modifie: true });
      // État de l'étude dans Pipe-Fit (avec ou sans chantier ; un modèle n'y figure pas)
      if (data.modele) { if (exist) signalerPF(s, p[1], null, null); }
      else signalerPF(s, p[1], String(data.affaireId || ''), resume, { clientId: String(data.clientId || ''), devisId: String(data.devisId || '') });
      return send(res, 200, ligne(db.prepare('SELECT * FROM etudes WHERE id = ?').get(p[1])));
    }
    // Suppression : réservée à l'auteur ou à l'administrateur ; l'étude va dans la corbeille avec ses versions
    if (method === 'DELETE') {
      if (!exist) return fail(res, 404, 'Étude introuvable');
      if (!CorbeilleEtudes.peutGerer(auteurDe(exist), s)) return fail(res, 403, CorbeilleEtudes.REFUS);
      // Dernier état transmis à Pipe-Fit (étapes, matériel retenu…) gardé pour le republier à la restauration
      const lien = JSON.parse(exist.data).modele ? null : await PF.lienEtude((chemin, opts) => pipefit(s, chemin, opts), p[1]).catch(() => null);
      const now = new Date().toISOString();
      db.exec('BEGIN');
      try {
        db.prepare(`INSERT OR REPLACE INTO etudes_supprimees (id, affaire_id, data, version, updated_at, updated_by, auteur_login, auteur_nom, resume, supprime_at, supprime_par, supprime_par_login)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(exist.id, exist.affaire_id || '', exist.data, exist.version, exist.updated_at, exist.updated_by, exist.auteur_login, exist.auteur_nom,
          lien && lien.resume ? JSON.stringify(lien.resume) : null, now, s.nom || s.login, s.login);
        db.prepare('DELETE FROM etudes WHERE id = ?').run(p[1]);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      Historique.presence(p[1], s, { quitte: true });
      signalerPF(s, p[1], null, null);
      return send(res, 200, { ok: true, corbeille: true, purgeLe: CorbeilleEtudes.purgeLe(now, joursCorbeille()) });
    }
  }

  // Corrections de l'inventaire CCTP / DPGF retenues (règles partagées par le bureau d'études, enregistrées par tous)
  if (p[0] === 'regles-inventaire') {
    const r = db.prepare("SELECT value FROM config WHERE key = 'regles-inventaire'").get();
    if (method === 'GET') return send(res, 200, r ? JSON.parse(r.value) : []);
    if (method === 'PUT') {
      const b = await lireJSON(req);
      if (!Array.isArray(b)) return fail(res, 400, 'Liste de règles attendue');
      const l = b.filter(x => x && typeof x.cle === 'string' && ['equipement', 'reseau'].includes(x.objet)).slice(-500)
        .map(x => ({ objet: x.objet, cle: x.cle.slice(0, 120), ...(x.genre ? { genre: String(x.genre).slice(0, 40) } : {}), ...(x.inclus === false ? { inclus: false } : {}), ...(x.nature ? { nature: String(x.nature).slice(0, 40) } : {}), exemple: String(x.exemple || '').slice(0, 120), date: String(x.date || '').slice(0, 10) }));
      db.prepare("INSERT INTO config (key, value) VALUES ('regles-inventaire', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(l));
      return send(res, 200, l);
    }
  }
  // Bibliothèque de modèles partagée entre les études : liste, enregistrement (doublon même fabricant + référence :
  // nouvelle version si les valeurs ou la fiche changent, prix ajoutés), retrait réservé à l'administrateur
  if (p[0] === 'bibliotheque-modeles') {
    const lire = () => db.prepare('SELECT data FROM modeles_biblio ORDER BY updated_at DESC').all().map(r => JSON.parse(r.data));
    if (!p[1] && method === 'GET') return send(res, 200, lire());
    if (!p[1] && method === 'POST') {
      const b = await lireJSON(req), e = BiblioModeles.nettoyer(b.entree || {});
      if (!e) return fail(res, 400, 'Type, fabricant et référence du modèle requis');
      const ex = db.prepare('SELECT data FROM modeles_biblio WHERE cle = ?').get(e.cle), base = ex ? [JSON.parse(ex.data)] : [];
      if (!ex && db.prepare('SELECT COUNT(*) AS n FROM modeles_biblio').get().n >= 5000) return fail(res, 507, 'Bibliothèque pleine (5 000 modèles)');
      const r = BiblioModeles.integrer(base, e, { par: s.nom || s.login, etudeId: /^[\w-]{1,64}$/.test(String(b.etudeId || '')) ? b.etudeId : '' });
      if (r.statut !== 'identique') db.prepare(`INSERT INTO modeles_biblio (id, cle, data, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(cle) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by`).run(r.entree.id, r.entree.cle, JSON.stringify(r.entree), new Date().toISOString(), s.nom || s.login);
      return send(res, 200, { statut: r.statut, entree: r.entree });
    }
    if (p[1] && method === 'DELETE') {
      if (s.role !== 'admin') return fail(res, 403, 'Réservé à l\'administrateur');
      db.prepare('DELETE FROM modeles_biblio WHERE id = ?').run(String(p[1]));
      return send(res, 200, { ok: true });
    }
  }
  // Réglages : identité de l'entreprise sur les notes de calcul
  if (p[0] === 'config') {
    if (method === 'GET') return send(res, 200, lireConfig());
    if (method === 'PUT') {
      if (s.role !== 'admin') return fail(res, 403, 'Réservé à l\'administrateur');
      const b = await lireJSON(req), c = { ...lireConfig(), ...b, societe: { ...lireConfig().societe, ...(b.societe || {}) } };
      if (b.corbeilleJours !== undefined) c.corbeilleJours = CorbeilleEtudes.jours(b.corbeilleJours);
      db.prepare("INSERT INTO config (key, value) VALUES ('etudes', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(c));
      return send(res, 200, c);
    }
  }
  return fail(res, 404, 'Route inconnue');
}

/* ---------- Fichiers statiques ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
function statique(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end(); }
  const file = PARTAGES[rel] || path.normalize(path.join(PUBLIC_DIR, rel === '/' ? '/index.html' : rel));
  if (!PARTAGES[rel] && !file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Introuvable'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

// HTTP, ou HTTPS avec le certificat de TLS_DIR / TLS_CERT… (le même que Pipe-Fit) ; en-têtes de sécurité
const SERVEUR = HS.creerServeur(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); return res.end(); }
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else statique(req, res, url);
  } catch (e) {
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Erreur serveur');
    if (!e.status) console.error(e);
  }
}, { dossierDonnees: path.dirname(DB_FILE), nom: 'Pipe-Fit Études' });
const server = SERVEUR.server;

if (require.main === module) {
  SERVEUR.surveiller();
  // Corbeille des études : effacement définitif après la durée réglée
  const purger = () => { try { const n = purgerCorbeille(); if (n) console.log(`Études : ${n} étude(s) supprimée(s) effacée(s) définitivement`); } catch (e) { console.error('Corbeille des études :', e.message); } };
  purger();
  setInterval(purger, 6 * 3600000).unref();
  server.listen(PORT, HOST, () => console.log(`Pipe-Fit Études : ${SERVEUR.etat.https ? 'https' : 'http'}://localhost:${PORT}  (Pipe-Fit : ${PIPEFIT}, base : ${DB_FILE})`));
}
module.exports = { server, db, purgerCorbeille };
