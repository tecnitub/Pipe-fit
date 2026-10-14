// API d'automatisation : clés personnelles (Authorization: Bearer pf_…), webhooks sortants signés
// (Power Automate, Make, Zapier, n8n, scripts…) et description OpenAPI pour créer un connecteur.
const crypto = require('node:crypto');

const hacher = cle => crypto.createHash('sha256').update(cle).digest('hex');

function initTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, nom TEXT, prefixe TEXT, hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, last_used TEXT)`);
}
// Nouvelle clé : renvoyée une seule fois en clair, seule son empreinte est conservée
function creerCle(db, accountId, nom) {
  const cle = 'pf_' + crypto.randomBytes(24).toString('base64url');
  const id = crypto.randomBytes(8).toString('hex');
  db.prepare('INSERT INTO api_keys (id, account_id, nom, prefixe, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, accountId, String(nom || 'Clé API').slice(0, 80), cle.slice(0, 10), hacher(cle), new Date().toISOString());
  return { id, cle };
}
function compteDeCle(db, entete) {
  const m = /^Bearer\s+(pf_[A-Za-z0-9_-]{20,})$/.exec(String(entete || ''));
  if (!m) return null;
  const k = db.prepare('SELECT id, account_id FROM api_keys WHERE hash = ?').get(hacher(m[1]));
  if (!k) return null;
  db.prepare('UPDATE api_keys SET last_used = ? WHERE id = ?').run(new Date().toISOString(), k.id);
  return db.prepare('SELECT id, login, nom, role, user_id, email FROM accounts WHERE id = ?').get(k.account_id) || null;
}
const listerCles = (db, accountId) => db.prepare(`SELECT k.id, k.nom, k.prefixe, k.created_at AS creeLe, k.last_used AS utiliseeLe, a.login FROM api_keys k JOIN accounts a ON a.id = k.account_id ${accountId ? 'WHERE k.account_id = ?' : ''} ORDER BY k.created_at DESC`).all(...(accountId ? [accountId] : []));

/* ---------- Webhooks sortants ---------- */
const webhooks = (DB, db) => DB.getConfig(db, 'webhooks') || [];
// Appelé à chaque modification : POST JSON signé (HMAC SHA-256 du corps avec le secret du webhook)
function emettre(DB, db, event, payload) {
  if (!['change', 'delete'].includes(event) || !payload || !payload.col) return;
  const liste = webhooks(DB, db).filter(w => w.actif && w.url && ((w.collections || []).includes('*') || (w.collections || []).includes(payload.col)));
  if (!liste.length) return;
  const type = event === 'delete' ? 'suppression' : payload.record && payload.record._v === 1 ? 'creation' : 'modification';
  const corps = JSON.stringify({ evenement: `${payload.col}.${type}`, collection: payload.col, id: payload.id || (payload.record && payload.record.id), date: new Date().toISOString(), donnees: payload.record || null });
  for (const w of liste) envoyer(DB, db, w, corps);
}
async function envoyer(DB, db, w, corps) {
  const sig = crypto.createHmac('sha256', w.secret || '').update(corps).digest('hex');
  let statut;
  try {
    const r = await fetch(w.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'PipeFit-CRM', 'X-PipeFit-Signature': `sha256=${sig}` }, body: corps, signal: AbortSignal.timeout(10000) });
    statut = r.status;
  } catch (e) { statut = e.name === 'TimeoutError' ? 'délai dépassé' : e.message; }
  const liste = webhooks(DB, db), x = liste.find(v => v.id === w.id);
  if (x) { x.dernier = { date: new Date().toISOString(), statut }; DB.setConfig(db, 'webhooks', liste); }
  return statut;
}

/* ---------- Description OpenAPI 3 ---------- */
function openapi(DB, base) {
  const cols = DB.COLLECTIONS;
  const rec = { type: 'object', additionalProperties: true, properties: { id: { type: 'string' }, _v: { type: 'integer', description: 'version (contrôle des modifications simultanées)' } } };
  const err = { description: 'Erreur', content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } } };
  return {
    openapi: '3.0.3',
    info: { title: 'Pipe-Fit CRM', version: '1.0', description: 'API de Pipe-Fit CRM. Authentification : en-tête « Authorization: Bearer <clé> » (Paramètres → API et automatisations). Les droits sont ceux du compte propriétaire de la clé.' },
    servers: [{ url: base }],
    components: { securitySchemes: { cle: { type: 'http', scheme: 'bearer' } }, schemas: { Enregistrement: rec } },
    security: [{ cle: [] }],
    paths: {
      '/api/me': { get: { summary: 'Compte associé à la clé', operationId: 'moi', responses: { 200: { description: 'Compte' } } } },
      '/api/records/{collection}': { get: { summary: 'Lister une collection', operationId: 'lister', parameters: [
        { name: 'collection', in: 'path', required: true, schema: { type: 'string', enum: cols } },
        { name: 'modifieDepuis', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'uniquement les éléments modifiés depuis cette date' },
        { name: 'filtre', in: 'query', schema: { type: 'string' }, description: 'égalités champ:valeur séparées par des virgules, ex. statut:Émise,affaireId:af1' },
        { name: 'limite', in: 'query', schema: { type: 'integer', maximum: 5000 } }],
        responses: { 200: { description: 'Liste', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Enregistrement' } } } } }, 404: err } } },
      '/api/records/{collection}/{id}': {
        parameters: [{ name: 'collection', in: 'path', required: true, schema: { type: 'string', enum: cols } }, { name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        get: { summary: 'Lire un élément', operationId: 'lire', responses: { 200: { description: 'Élément', content: { 'application/json': { schema: { $ref: '#/components/schemas/Enregistrement' } } } }, 404: err } },
        put: { summary: 'Créer ou modifier un élément', operationId: 'enregistrer', description: 'Corps { data: {…}, version: _v actuel (absent pour une création) }. Les numéros (devis, factures, commandes…) sont attribués par le serveur.',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/Enregistrement' }, version: { type: 'integer' } }, required: ['data'] } } } },
          responses: { 200: { description: 'Élément enregistré' }, 403: err, 409: err } },
        delete: { summary: 'Supprimer un élément', operationId: 'supprimer', responses: { 200: { description: 'Supprimé' }, 403: err } },
      },
      '/api/bulk/{collection}': { post: { summary: 'Import groupé (fournitures, main-d\'œuvre, entreprises, contacts)', operationId: 'importer', parameters: [{ name: 'collection', in: 'path', required: true, schema: { type: 'string', enum: ['articles', 'mainoeuvre', 'entreprises', 'contacts'] } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Enregistrement' } } } } } } }, responses: { 200: { description: 'Éléments enregistrés' } } } },
      '/api/efacture/import': { post: { summary: 'Déposer une facture électronique fournisseur (XML CII / UBL ou PDF Factur-X)', operationId: 'deposerEFacture',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { nom: { type: 'string' }, base64: { type: 'string' } } } } } }, responses: { 200: { description: 'Facture reçue' }, 422: err } } },
      '/api/mail': { post: { summary: 'Envoyer un e-mail par Microsoft 365', operationId: 'envoyerMail', responses: { 200: { description: 'Envoyé' } } } },
    },
  };
}

module.exports = { initTables, creerCle, compteDeCle, listerCles, webhooks, emettre, envoyer, openapi };
