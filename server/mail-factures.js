// Factures fournisseurs reçues par e-mail : une boîte dédiée (ex. factures@entreprise.fr) relevée par Microsoft Graph.
// Chaque pièce jointe PDF ou XML devient une facture « Reçue » (Factur-X lue directement, PDF simple lu par le
// navigateur) ; le message est marqué lu et rangé dans un sous-dossier de la boîte de réception.
const M365 = require('./m365');
const EF = require('./efacture');

const PIECE = /\.(pdf|xml)$/i;
const etat = { dernier: null, resultat: null, erreur: '' };
let enCours = false;

const config = (DB, db) => { const c = EF.config(DB, db).mail || {}; return { actif: !!c.actif, adresse: c.adresse || '', dossier: c.dossier || 'Factures traitées' }; };

// Dossier de rangement (sous-dossier de la boîte de réception), créé au besoin
async function dossierRangement(cfg, adresse, nom) {
  const filtre = encodeURIComponent(`displayName eq '${nom.replace(/'/g, "''")}'`);
  const r = await M365.boite(cfg, adresse, 'GET', `/mailFolders/inbox/childFolders?$filter=${filtre}&$select=id,displayName`);
  if (r.value && r.value[0]) return r.value[0].id;
  return (await M365.boite(cfg, adresse, 'POST', '/mailFolders/inbox/childFolders', { displayName: nom })).id;
}

async function relever(DB, db, broadcast) {
  const m = DB.getConfig(db, 'm365') || {}, c = config(DB, db);
  if (enCours || !c.actif || !c.adresse) return { messages: 0, factures: 0 };
  if (!(m.actif && m.tenantId && m.clientId && m.clientSecret)) throw new Error('Connexion Microsoft 365 non configurée (Paramètres → E-mails).');
  enCours = true;
  const res = { messages: 0, factures: 0, doublons: 0, sansPiece: 0, erreurs: [] };
  try {
    const liste = await M365.boite(m, c.adresse, 'GET', '/mailFolders/inbox/messages?$filter=isRead%20eq%20false&$top=25&$select=id,subject,from,receivedDateTime,hasAttachments&$orderby=receivedDateTime');
    let dossierId = null;
    for (const msg of liste.value || []) {
      res.messages++;
      const from = (msg.from && msg.from.emailAddress) || {};
      const mail = { de: from.name || from.address || '', deEmail: from.address || '', objet: msg.subject || '', recuLe: msg.receivedDateTime || '' };
      // Offre transférée par erreur dans la boîte des factures (n° de consultation dans l'objet) : rangée dans la consultation
      const MAILO = require('./mail-offres');
      if (msg.hasAttachments && /\bCS[-\s]?\d/i.test(mail.objet)) {
        try {
          const r = MAILO.recevoir(DB, db, MAILO.mailDe(msg), await MAILO.piecesDe(m, c.adresse, msg), broadcast);
          if (r) { res.offres = (res.offres || 0) + 1; await M365.boite(m, c.adresse, 'PATCH', `/messages/${encodeURIComponent(msg.id)}`, { isRead: true }); continue; }
        } catch (e) { res.erreurs.push(`${mail.objet} : ${e.message}`); continue; }
      }
      let pieces = 0, echec = false;
      if (msg.hasAttachments) {
        const pj = await M365.boite(m, c.adresse, 'GET', `/messages/${encodeURIComponent(msg.id)}/attachments`);
        for (const a of pj.value || []) {
          if (a['@odata.type'] !== '#microsoft.graph.fileAttachment' || a.isInline || !PIECE.test(a.name || '') || !a.contentBytes) continue;
          pieces++;
          try {
            const r = await EF.recevoir(DB, db, Buffer.from(a.contentBytes, 'base64'), a.name, 'e-mail', broadcast, mail);
            if (r.doublon) res.doublons++; else res.factures++;
          } catch (e) { echec = true; res.erreurs.push(`${a.name} (${mail.deEmail}) : ${e.message}`); }
        }
      }
      if (!pieces) res.sansPiece++;
      // Message traité : lu et rangé (laissé dans la boîte de réception, non lu, si une pièce n'a pas pu être lue)
      if (echec) continue;
      await M365.boite(m, c.adresse, 'PATCH', `/messages/${encodeURIComponent(msg.id)}`, { isRead: true });
      if (pieces) {
        dossierId = dossierId || await dossierRangement(m, c.adresse, c.dossier);
        await M365.boite(m, c.adresse, 'POST', `/messages/${encodeURIComponent(msg.id)}/move`, { destinationId: dossierId });
      }
    }
    Object.assign(etat, { dernier: new Date().toISOString(), resultat: res, erreur: '' });
    return res;
  } catch (e) {
    Object.assign(etat, { dernier: new Date().toISOString(), erreur: e.message });
    throw e;
  } finally { enCours = false; }
}

// Refus d'une facture reçue par e-mail : réponse à l'expéditeur, depuis la boîte des factures
async function prevenirRefus(DB, db, x, motif, societe) {
  const m = DB.getConfig(db, 'm365') || {}, c = config(DB, db);
  if (!(m.actif && m.tenantId && m.clientId && m.clientSecret) || !c.adresse) throw new Error('Boîte des factures ou Microsoft 365 non configurée.');
  if (!x.mail || !x.mail.deEmail) throw new Error('Cette facture n\'a pas été reçue par e-mail.');
  const esc = s => String(s || '').replace(/[<>&"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
  const ref = x.numero ? `n° ${x.numero}` : `« ${x.nomFichier} »`;
  await M365.envoyer(m, c.adresse, { to: [x.mail.deEmail], subject: `Facture ${x.numero || x.nomFichier} refusée`,
    html: `<p>Bonjour,</p><p>Nous ne pouvons pas accepter votre facture ${esc(ref)}${x.date ? ` du ${esc(x.date.split('-').reverse().join('/'))}` : ''} pour le motif suivant :</p><p><strong>${esc(motif)}</strong></p><p>Merci de nous faire parvenir une facture rectifiée ou un avoir.</p><p>Cordialement,<br>${esc(societe)} – service comptabilité fournisseurs</p>` });
}

module.exports = { relever, prevenirRefus, config, etat };
