// Factures fournisseurs reçues : électroniques (Factur-X, CII, UBL) déposées par la plateforme agréée (PA / PDP) dans un
// dossier surveillé, envoyées sur l'adresse de dépôt sécurisée, ou importées à la main ; PDF simples reçus par e-mail ou
// déposés dans le dossier ;
// dépôt des factures émises (XML CII + PDF) dans le dossier d'envoi de la plateforme.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const FacturX = require('../public/js/facturx');

const MAX_FICHIER = 10 * 1024 * 1024;
const config = (DB, db) => DB.getConfig(db, 'efacture') || {};

// Enregistre une facture reçue (doublon ignoré : même émetteur et même numéro, ou même fichier PDF).
// PDF sans données Factur-X (facture papier scannée ou PDF simple reçu par e-mail) : enregistré « à lire », le
// navigateur en extrait fournisseur, n°, dates et montants à l'ouverture. mail : { de, deEmail, objet, recuLe }.
async function recevoir(DB, db, buffer, nom, origine, broadcast, mail = null) {
  if (!buffer || !buffer.length) throw new Error('Fichier vide');
  if (buffer.length > MAX_FICHIER) throw new Error('Fichier trop volumineux (10 Mo maximum)');
  const bytes = new Uint8Array(buffer);
  let lu;
  try { lu = await FacturX.lireFichier(bytes, b => zlib.inflateSync(Buffer.from(b))); }
  catch (e) { if (!estPDF(bytes)) throw e; lu = null; }
  const facture = lu ? lu.facture : { format: 'PDF', type: 'facture', numero: '', date: '', echeance: '', vendeur: { nom: mail ? mail.de || '' : '', email: mail ? mail.deEmail || '' : '' }, lignes: [], notes: [], totalHT: 0, totalTVA: 0, totalTTC: 0 };
  const cle = lu ? `${facture.vendeur.siren || facture.vendeur.tva || facture.vendeur.nom}|${facture.numero}` : `pdf|${crypto.createHash('sha256').update(buffer).digest('hex')}`;
  const existant = db.prepare("SELECT id FROM records WHERE col = 'efactures'").all().map(r => DB.getRecord(db, 'efactures', r.id)).find(r => r.cle === cle);
  if (existant) return { doublon: true, record: existant };
  const fichier = (mime, data) => {
    const id = crypto.randomBytes(12).toString('hex');
    db.prepare('INSERT INTO files (id, mime, data, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(id, mime, Buffer.from(data), origine, new Date().toISOString());
    return id;
  };
  const id = crypto.randomBytes(8).toString('hex'), now = new Date().toISOString();
  const rec = { id, cle, statut: 'Reçue', recueLe: now, origine, nomFichier: String(nom || '').slice(0, 120), ...facture,
    xmlId: lu ? fichier('application/xml', Buffer.from(lu.xml, 'utf8')) : '', pdfId: !lu || lu.pdf ? fichier('application/pdf', buffer) : '', aLire: !lu,
    ...(mail ? { mail: { de: String(mail.de || '').slice(0, 120), deEmail: String(mail.deEmail || '').slice(0, 200), objet: String(mail.objet || '').slice(0, 200), recuLe: mail.recuLe || now } } : {}) };
  db.prepare('INSERT INTO records (col, id, data, version, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)').run('efactures', id, JSON.stringify(rec), now, origine);
  DB.audit(db, origine, lu ? 'facture électronique reçue' : 'facture PDF reçue', 'efactures', id, lu ? `${facture.vendeur.nom || ''} ${facture.numero}` : `${rec.nomFichier}${mail ? ` de ${rec.mail.deEmail}` : ''}`);
  const record = DB.getRecord(db, 'efactures', id);
  if (broadcast) broadcast('change', { col: 'efactures', record, client: null });
  return { record };
}
const estPDF = b => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

// Dossier surveillé : fichiers .xml / .pdf déposés par la plateforme (ou son logiciel de synchronisation)
let enCours = false;
async function scruterDossier(DB, db, broadcast) {
  const c = config(DB, db);
  if (enCours || !c.dossierEntree) return { traites: 0 };
  enCours = true;
  let traites = 0;
  try {
    const dir = path.resolve(c.dossierEntree);
    if (!fs.existsSync(dir)) return { traites, erreur: `Dossier introuvable : ${dir}` };
    for (const nom of fs.readdirSync(dir)) {
      const fichier = path.join(dir, nom);
      if (!/\.(xml|pdf)$/i.test(nom) || !fs.lstatSync(fichier).isFile()) continue;
      let dest = 'traites';
      try { await recevoir(DB, db, fs.readFileSync(fichier), nom, 'dossier', broadcast); traites++; }
      catch (e) { dest = 'erreurs'; fs.mkdirSync(path.join(dir, dest), { recursive: true }); fs.writeFileSync(path.join(dir, dest, nom + '.erreur.txt'), e.message); }
      fs.mkdirSync(path.join(dir, dest), { recursive: true });
      fs.renameSync(fichier, path.join(dir, dest, `${Date.now()}-${nom}`));
    }
    return { traites };
  } finally { enCours = false; }
}

// Dépôt d'une facture émise dans le dossier d'envoi de la plateforme
function deposer(DB, db, nom, xml, pdfBase64) {
  const c = config(DB, db);
  if (!c.dossierSortie) throw new Error('Aucun dossier d\'envoi vers la plateforme n\'est configuré.');
  const dir = path.resolve(c.dossierSortie);
  fs.mkdirSync(dir, { recursive: true });
  const base = String(nom || 'facture').replace(/[^\w.-]+/g, '_').slice(0, 80);
  fs.writeFileSync(path.join(dir, `${base}.xml`), String(xml));
  if (pdfBase64) fs.writeFileSync(path.join(dir, `${base}.pdf`), Buffer.from(pdfBase64, 'base64'));
  return { dossier: dir, fichiers: [`${base}.xml`, ...(pdfBase64 ? [`${base}.pdf`] : [])] };
}

const jetonValide = (c, jeton) => !!(c.jeton && jeton && c.jeton.length === jeton.length && crypto.timingSafeEqual(Buffer.from(c.jeton), Buffer.from(jeton)));

module.exports = { recevoir, scruterDossier, deposer, jetonValide, config, MAX_FICHIER };
