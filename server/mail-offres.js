// Offres fournisseurs reçues par e-mail : une boîte dédiée (ex. offres@entreprise.fr) relevée par Microsoft Graph.
// Le fournisseur y répond directement (adresse de réponse des demandes de prix) ou un collègue y transfère l'offre reçue :
// la consultation est reconnue (n° dans l'objet ou le message, sinon code du chantier), les pièces jointes (PDF, photo,
// Excel) sont rangées dans l'offre du fournisseur, « reçue, à lire » ; le message est marqué lu et rangé.
const crypto = require('node:crypto');
const M365 = require('./m365');
const EF = require('./efacture');
const OffreMail = require('../public/js/offre-mail');

const MIMES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel' };
const etat = { dernier: null, resultat: null, erreur: '', nonReconnues: [] };
let enCours = false;

const config = (DB, db) => { const c = EF.config(DB, db).offres || {}; return { actif: !!c.actif, adresse: c.adresse || '', dossier: c.dossier || 'Offres traitées' }; };
const tous = (DB, db, col) => db.prepare('SELECT id FROM records WHERE col = ?').all(col).map(r => DB.getRecord(db, col, r.id));

// Adresses et domaines de l'entreprise : un collègue qui transfère l'offre n'est pas le fournisseur
function internes(DB, db) {
  const l = db.prepare('SELECT email FROM accounts').all().map(a => a.email).filter(Boolean);
  const s = DB.getSettings(db) || {}, doc = s.doc || {};
  return [...l, doc.email, config(DB, db).adresse, (EF.config(DB, db).mail || {}).adresse].filter(Boolean);
}

// Une offre reçue : reconnaissance, pièces enregistrées, consultation mise à jour. Renvoie null si rien n'est reconnu.
function recevoir(DB, db, mail, fichiers, broadcast, origine = 'e-mail') {
  const rec = OffreMail.reconnaitre(mail, { consultations: tous(DB, db, 'consultations'), entreprises: tous(DB, db, 'entreprises'), contacts: tous(DB, db, 'contacts'),
    affaires: tous(DB, db, 'affaires'), internes: internes(DB, db) });
  if (!rec) return null;
  const now = new Date().toISOString();
  const pieces = fichiers.filter(f => OffreMail.PIECE.test(f.nom)).map(f => {
    const id = crypto.randomBytes(12).toString('hex');
    db.prepare('INSERT INTO files (id, mime, data, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(id, MIMES[f.nom.split('.').pop().toLowerCase()] || 'application/octet-stream', f.data, origine, now);
    return { id, nom: f.nom.slice(0, 150) };
  });
  const c = DB.getRecord(db, 'consultations', rec.consultation.id);
  const { classee } = OffreMail.appliquer(c, rec.fournisseurId, pieces, mail);
  const data = Object.fromEntries(Object.entries(c).filter(([k]) => !k.startsWith('_')));
  db.prepare('UPDATE records SET data = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE col = ? AND id = ?').run(JSON.stringify(data), now, 'Boîte des offres', 'consultations', c.id);
  const nomF = rec.fournisseurId ? ((DB.getRecord(db, 'entreprises', rec.fournisseurId) || {}).nom || '') : '';
  DB.audit(db, origine, 'offre fournisseur reçue', 'consultations', c.id, `${c.ref || ''} ${nomF || 'fournisseur à identifier'} (${rec.raison}) – ${pieces.map(p => p.nom).join(', ')}`);
  const record = DB.getRecord(db, 'consultations', c.id);
  if (broadcast) broadcast('change', { col: 'consultations', record, client: null });
  return { consultation: c.ref || c.id, fournisseur: nomF, classee, pieces: pieces.length, raison: rec.raison };
}

// Pièces jointes d'un message Graph (fichiers seulement, hors images intégrées à la signature)
async function piecesDe(cfg, adresse, msg) {
  if (!msg.hasAttachments) return [];
  const pj = await M365.boite(cfg, adresse, 'GET', `/messages/${encodeURIComponent(msg.id)}/attachments`);
  return (pj.value || []).filter(a => a['@odata.type'] === '#microsoft.graph.fileAttachment' && !a.isInline && a.contentBytes && OffreMail.PIECE.test(a.name || ''))
    .map(a => ({ nom: a.name, data: Buffer.from(a.contentBytes, 'base64') }));
}
const mailDe = msg => { const from = (msg.from && msg.from.emailAddress) || {}; return { de: from.name || from.address || '', deEmail: from.address || '', objet: msg.subject || '', recuLe: msg.receivedDateTime || '', texte: OffreMail.texteDe(msg.body && msg.body.content) }; };

async function dossierRangement(cfg, adresse, nom) {
  const filtre = encodeURIComponent(`displayName eq '${nom.replace(/'/g, "''")}'`);
  const r = await M365.boite(cfg, adresse, 'GET', `/mailFolders/inbox/childFolders?$filter=${filtre}&$select=id,displayName`);
  if (r.value && r.value[0]) return r.value[0].id;
  return (await M365.boite(cfg, adresse, 'POST', '/mailFolders/inbox/childFolders', { displayName: nom })).id;
}

async function relever(DB, db, broadcast) {
  const m = DB.getConfig(db, 'm365') || {}, c = config(DB, db);
  if (enCours || !c.actif || !c.adresse) return { messages: 0, offres: 0 };
  if (!(m.actif && m.tenantId && m.clientId && m.clientSecret)) throw new Error('Connexion Microsoft 365 non configurée (Paramètres → E-mails).');
  enCours = true;
  const res = { messages: 0, offres: 0, aClasser: 0, nonReconnues: 0, sansPiece: 0, erreurs: [] };
  const nonReconnues = [];
  try {
    const liste = await M365.boite(m, c.adresse, 'GET', '/mailFolders/inbox/messages?$filter=isRead%20eq%20false&$top=25&$select=id,subject,from,receivedDateTime,hasAttachments,body&$orderby=receivedDateTime');
    let dossierId = null;
    for (const msg of liste.value || []) {
      res.messages++;
      const mail = mailDe(msg);
      try {
        const fichiers = await piecesDe(m, c.adresse, msg);
        if (!fichiers.length) { res.sansPiece++; nonReconnues.push({ objet: mail.objet, de: mail.deEmail, recuLe: mail.recuLe, motif: 'aucune pièce jointe (PDF, photo ou Excel)' }); continue; }
        const r = recevoir(DB, db, mail, fichiers, broadcast);
        // Non reconnu : laissé non lu dans la boîte, signalé aux bureaux
        if (!r) { res.nonReconnues++; nonReconnues.push({ objet: mail.objet, de: mail.deEmail, recuLe: mail.recuLe, motif: 'ni n° de consultation ni code de chantier dans l\'objet ou le message' }); continue; }
        if (r.classee) res.offres++; else res.aClasser++;
        await M365.boite(m, c.adresse, 'PATCH', `/messages/${encodeURIComponent(msg.id)}`, { isRead: true });
        dossierId = dossierId || await dossierRangement(m, c.adresse, c.dossier);
        await M365.boite(m, c.adresse, 'POST', `/messages/${encodeURIComponent(msg.id)}/move`, { destinationId: dossierId });
      } catch (e) { res.erreurs.push(`${mail.objet} (${mail.deEmail}) : ${e.message}`); }
    }
    Object.assign(etat, { dernier: new Date().toISOString(), resultat: res, erreur: '', nonReconnues: nonReconnues.slice(0, 20) });
    return res;
  } catch (e) {
    Object.assign(etat, { dernier: new Date().toISOString(), erreur: e.message });
    throw e;
  } finally { enCours = false; }
}

module.exports = { relever, recevoir, config, etat, piecesDe, mailDe };
