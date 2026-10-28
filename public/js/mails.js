// Envoi des documents par e-mail : modèles paramétrables, destinataires pris dans les contacts, PDF joint.
// Deux modes : Microsoft 365 (envoi direct depuis la boîte de l'utilisateur, copie dans ses « Éléments envoyés »)
// ou brouillon Outlook (.eml avec le PDF joint, que l'utilisateur relit et envoie depuis Outlook).

const SIGNATURE_DEFAUT = '{expediteur}\n{fonction_expediteur}\n{societe}\n{tel_expediteur}';
const MAIL_TYPES = {
  devis: { label: 'Devis', objet: 'Devis {numero} – {objet}',
    corps: 'Bonjour {contact},\n\nVeuillez trouver ci-joint notre devis {numero} relatif à : {objet}.\nMontant : {montant_ht} HT, soit {montant_ttc} TTC. Offre valable {validite} jours.\n\nNous restons à votre disposition pour tout complément d\'information.\n\nCordialement,\n\n{signature}' },
  facture: { label: 'Facture', objet: 'Facture {numero} – {chantier}',
    corps: 'Bonjour {contact},\n\nVeuillez trouver ci-joint notre facture {numero} relative au chantier {chantier}{ref_commande}.\nNet à payer : {montant_ttc} TTC, à régler avant le {echeance}.\n\nNous vous remercions de votre confiance.\n\nCordialement,\n\n{signature}' },
  avoir: { label: 'Avoir', objet: 'Avoir {numero} sur facture {facture_origine}',
    corps: 'Bonjour {contact},\n\nVeuillez trouver ci-joint notre avoir {numero} d\'un montant de {montant_ttc} TTC, établi sur la facture {facture_origine}{motif_phrase}.\n\nCordialement,\n\n{signature}' },
  situation: { label: 'Situation de travaux', objet: 'Situation de travaux n° {rang} – {chantier}',
    corps: 'Bonjour {contact},\n\nVeuillez trouver ci-joint notre situation de travaux n° {rang} ({numero}) arrêtée au {date} pour le chantier {chantier}, d\'un montant de {montant_ht} HT{retenue_phrase}.\n\nMerci de nous retourner votre validation : la facture correspondante vous sera adressée dès réception.\n\nCordialement,\n\n{signature}' },
  consultation: { label: 'Consultation fournisseurs (appel d\'offres)', objet: 'Demande de prix {numero} – {objet}',
    corps: 'Bonjour {contact},\n\nNous vous consultons pour les fournitures listées dans la demande ci-jointe (réf. {numero}, chantier {chantier}){date_livraison_phrase}.\nMerci de nous retourner votre meilleure offre avant le {date_limite}, de préférence en complétant le tableau Excel joint (prix unitaires HT, délais, frais de port).\n\nCordialement,\n\n{signature}' },
  demandePrix: { label: 'Demande de prix fournisseur', objet: 'Demande de prix – {chantier}',
    corps: 'Bonjour {contact},\n\nPourriez-vous nous faire parvenir votre meilleure offre pour les fournitures listées dans la demande ci-jointe (réf. {numero}), avec vos délais de livraison{date_livraison_phrase} ?\n\nCordialement,\n\n{signature}' },
  commande: { label: 'Commande fournisseur', objet: 'Commande {numero} – {chantier}',
    corps: 'Bonjour {contact},\n\nVeuillez trouver ci-joint notre commande {numero} d\'un montant de {montant_ht} HT.\nLivraison{date_livraison_phrase} : {adresse_livraison}.\n\nMerci de nous confirmer la bonne réception de cette commande et le délai de livraison, et de rappeler notre numéro de commande sur vos documents.\n\nCordialement,\n\n{signature}' },
  attachement: { label: 'Attachement hors devis', objet: 'Intervention {numero} – demande de commande',
    corps: 'Bonjour {contact},\n\nSuite à votre demande, nous sommes intervenus pour : {objet}.\nVeuillez trouver ci-joint l\'attachement des travaux réalisés, d\'un montant de {montant_ht} HT.\n\nMerci de nous transmettre votre bon de commande afin que nous puissions établir la facture.\n\nCordialement,\n\n{signature}' },
  bon: { label: 'Bon d\'intervention', objet: 'Bon d\'intervention {numero} – {objet}',
    corps: 'Bonjour {contact},\n\nVeuillez trouver ci-joint le bon d\'intervention {numero} du {date}{signataire_phrase}.\n\nCordialement,\n\n{signature}' },
  relance1: { label: 'Relance 1 – rappel courtois', objet: 'Rappel : facture {numero} arrivée à échéance',
    corps: 'Bonjour {contact},\n\nSauf erreur de notre part, la facture {numero} du {date} ({chantier}{ref_commande}), d\'un montant restant dû de {reste_du} TTC, était payable le {echeance}.\n\nS\'il s\'agit d\'un oubli, nous vous remercions de bien vouloir procéder à son règlement. Si votre paiement est déjà parti, merci de ne pas tenir compte de ce message.\n\nVous trouverez ci-joint une copie de la facture.\n\nCordialement,\n\n{signature}' },
  relance2: { label: 'Relance 2', objet: '2e relance : facture {numero} impayée',
    corps: 'Bonjour {contact},\n\nMalgré notre précédent rappel, nous n\'avons pas reçu le règlement de la facture {numero} du {date} ({chantier}), échue depuis le {echeance} ({jours_retard} jours de retard). Le montant restant dû est de {reste_du} TTC.\n\nMerci de nous indiquer la date de paiement prévue, ou de nous signaler toute difficulté (contestation, pièce manquante) afin que nous puissions la traiter rapidement.\n\nCopie de la facture ci-jointe.\n\nCordialement,\n\n{signature}' },
  relance3: { label: 'Relance 3 – dernière relance', objet: 'Dernière relance avant mise en demeure : facture {numero}',
    corps: 'Bonjour {contact},\n\nLa facture {numero} du {date} ({chantier}) reste impayée {jours_retard} jours après son échéance du {echeance}, malgré nos relances. Montant restant dû : {reste_du} TTC.\n\nSans règlement de votre part sous 8 jours, nous serons contraints de vous adresser une mise en demeure. Nous vous rappelons que tout retard de paiement entraîne de plein droit des pénalités de retard et une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 du Code de commerce).\n\nCordialement,\n\n{signature}' },
  demeure: { label: 'Mise en demeure de payer', objet: 'Mise en demeure : facture {numero} – {reste_du} TTC',
    corps: 'Madame, Monsieur,\n\nVeuillez trouver ci-joint notre mise en demeure de payer la facture {numero} du {date} ({chantier}), échue depuis le {echeance}, pour un montant restant dû de {reste_du} TTC.\n\nCe courrier vous est également adressé par lettre recommandée avec accusé de réception.\n\n{signature}' },
  liberationRG: { label: 'Demande de libération de la retenue de garantie', objet: 'Libération de la retenue de garantie – {chantier}',
    corps: 'Bonjour {contact},\n\nLa réception des travaux du chantier {chantier} a été prononcée le {date_reception}. Le délai de garantie d\'un an étant écoulé, nous vous remercions de bien vouloir procéder à la libération de la retenue de garantie, soit {montant_ttc} TTC.\n\nVous trouverez ci-joint le récapitulatif des retenues pratiquées sur nos factures.\n\nCordialement,\n\n{signature}' },
  pv: { label: 'PV de réception', objet: 'Procès-verbal {numero} – {chantier}',
    corps: 'Bonjour {contact},\n\nVeuillez trouver ci-joint le procès-verbal {numero} du {date} relatif au chantier {chantier}.\n\nCordialement,\n\n{signature}' },
};
const MAIL_VARIABLES = [
  ['contact', 'Formule d\'appel du destinataire (Madame Durand)'], ['numero', 'Numéro du document'], ['objet', 'Objet'], ['chantier', 'Chantier (code – nom)'],
  ['client', 'Entreprise destinataire'], ['date', 'Date du document'], ['montant_ht', 'Montant HT'], ['montant_ttc', 'Montant TTC / net à payer'],
  ['echeance', 'Échéance (facture)'], ['validite', 'Validité (devis)'], ['rang', 'N° de situation'], ['retenue_phrase', '« , soit … TTC (retenue de garantie…, net à payer …) » (situation)'], ['ref_commande', '« , votre commande n° … »'],
  ['date_livraison_phrase', '« pour le … » (date de livraison)'], ['facture_origine', 'Facture d\'origine (avoir)'], ['date_limite', 'Date limite de remise des offres'], ['motif_phrase', '« (motif) » de l\'avoir'], ['adresse_livraison', 'Adresse de livraison'], ['signataire_phrase', '« , signé par … »'],
  ['reste_du', 'Montant restant dû TTC (relances)'], ['jours_retard', 'Nombre de jours de retard (relances)'], ['date_reception', 'Date de réception des travaux (retenue de garantie)'],
  ['societe', 'Votre société'], ['expediteur', 'Votre nom'], ['signature', 'Signature'],
];

const Mails = {
  cfg() { return Store.data.settings.mails || {}; },
  modele(type) { const c = (this.cfg().types || {})[type] || {}; return { objet: c.objet || MAIL_TYPES[type].objet, corps: c.corps || MAIL_TYPES[type].corps }; },
  remplir(txt, vars) { return String(txt || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m)); },
  html(corps) {
    return `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222">${esc(corps).replace(/\r?\n/g, '<br>')}</div>`;
  },
};

const formuleContact = c => (c ? (c.civilite && c.nom ? `${c.civilite} ${c.nom}` : contactName(c)) : 'Madame, Monsieur');
const premierRendu = html => { const t = document.createElement('div'); t.innerHTML = html; const d = t.querySelector('.doc-print'); return d ? d.innerHTML : ''; };

// Tout ce qu'il faut pour envoyer un document : contenu PDF, destinataire par défaut, variables, suite donnée
function mailContexte(type, id) {
  const s = Store.data.settings;
  const chantier = a => (a && a.code ? `${a.code} – ${a.nom}` : (a && a.nom) || '');
  let x;
  switch (type) {
    case 'devis': {
      const d = Store.get('devis', id); if (!d) return null;
      const a = affaireOf(d.affaireId), t = Calc.doc(d);
      return { ref: { col: 'devis', id }, numero: d.numero, entrepriseId: docClientId(d), contactId: d.contactId, chargeId: docChargeId(d),
        fichier: `Devis ${d.numero || ''}`, html: () => devisDocument(d),
        vars: { objet: d.objet || a.nom || '', chantier: chantier(a), date: dateFr(d.date), montant_ht: eur(t.totalHT), montant_ttc: eur(t.totalTTC), validite: d.validite },
        apres: () => { if (d.statut === 'Brouillon') { d.statut = 'Envoyé'; Store.upsert('devis', d); } } };
    }
    case 'facture': {
      const f = Store.get('factures', id); if (!f) return null;
      const a = affaireOf(f.affaireId), t = Calc.doc(f);
      return { ref: { col: 'factures', id }, numero: f.numero, entrepriseId: docClientId(f), contactId: f.contactId, chargeId: docChargeId(f),
        fichier: `Facture ${f.numero || ''}`, html: () => factureDocument(f),
        vars: { objet: f.objet || a.nom || '', chantier: chantier(a), date: dateFr(f.date), montant_ht: eur(t.totalHT), montant_ttc: eur(t.retenue ? t.netAPayer : t.totalTTC),
          echeance: dateFr(f.echeance), ref_commande: f.refCommande ? ` (votre commande n° ${f.refCommande})` : '' } };
    }
    case 'avoir': {
      const f = Store.get('factures', id); if (!f) return null;
      const a = affaireOf(f.affaireId), t = Calc.doc(f), orig = Store.get('factures', f.factureId) || {};
      return { ref: { col: 'factures', id }, numero: f.numero, entrepriseId: docClientId(f), contactId: f.contactId, chargeId: docChargeId(f),
        fichier: `Avoir ${f.numero || ''}`, html: () => factureDocument(f),
        vars: { objet: f.objet || a.nom || '', chantier: chantier(a), date: dateFr(f.date), montant_ht: eur(t.totalHT), montant_ttc: eur(t.netAPayer),
          facture_origine: orig.numero || '', motif_phrase: f.motif ? ` (${f.motif})` : '' } };
    }
    case 'situation': {
      const sit = Store.get('situations', id); if (!sit) return null;
      const a = affaireOf(sit.affaireId), c = Calc.situation(sit);
      return { ref: { col: 'situations', id }, numero: sit.numero, entrepriseId: a.moeId || a.clientId, contactId: a.moeId ? a.moeContactId : a.contactId, chargeId: a.chargeId,
        fichier: `Situation ${situationRang(sit)} ${sit.numero || ''}`, html: () => premierRendu(Views.situations([id], new URLSearchParams())),
        vars: { chantier: chantier(a), objet: a.nom, date: dateFr(sit.date), rang: situationRang(sit), montant_ht: eur(c.montant), montant_ttc: eur(c.ttc),
          retenue_phrase: c.retenue ? `, soit ${eur(c.ttc)} TTC (retenue de garantie de ${fmt(c.retenuePct, 1)} % : ${eur(c.retenue)} ; net à payer ${eur(c.netAPayer)})` : `, soit ${eur(c.ttc)} TTC` },
        apres: () => { if (sit.statut === 'Brouillon') { Object.assign(sit, { statut: 'Proposée', dateEnvoi: isoDate(new Date()) }); Store.upsert('situations', sit); } } };
    }
    case 'commande': case 'demandePrix': {
      const c = Store.get('commandes', id); if (!c) return null;
      const a = affaireOf(c.affaireId), liv = siteOf(a.clientId, a.siteId);
      const contacts = contactsOf(c.fournisseurId);
      return { ref: { col: 'commandes', id }, numero: c.numero, entrepriseId: c.fournisseurId, choixEntreprise: type === 'demandePrix' ? fournisseursList() : null,
        contactId: (contacts.find(k => /commercial|vente|adv/i.test(k.fonction || '')) || contacts[0] || {}).id, chargeId: a.chargeId,
        fichier: `${type === 'commande' ? 'Commande' : 'Demande de prix'} ${c.numero || ''}`, html: () => commandeDocument(c, type),
        vars: { chantier: chantier(a) || 'stock atelier', objet: a.nom || '', date: dateFr(c.date), montant_ht: eur(Calc.commande(c).total),
          date_livraison_phrase: c.dateLivraison ? ` pour le ${dateFr(c.dateLivraison)}` : '', adresse_livraison: liv ? `${clientName(a.clientId)} – ${liv.libelle}, ${fullAddress(liv)}` : `notre atelier, ${s.adresse}` },
        // Commande : l'offre du fournisseur jointe d'office (décochable dans la fenêtre d'envoi)
        ...(type === 'commande' && c.devisFournisseurId ? { libellePiecesSup: `votre offre${c.devisFournisseurRef ? ` n° ${c.devisFournisseurRef}` : ''} (${c.devisFournisseurNom || 'offre du fournisseur'})`, piecesSupOption: true,
          piecesSup: async () => [await pieceDepuisFichier(c.devisFournisseurId, `Offre ${clientName(c.fournisseurId)}${c.devisFournisseurRef ? ` ${c.devisFournisseurRef}` : ''}`, c.devisFournisseurNom)] } : {}),
        apres: type === 'commande' ? () => { if (c.statut === 'Brouillon') { c.statut = 'Envoyée'; Store.upsert('commandes', c); } } : null };
    }
    case 'attachement': {
      const a = Store.get('affaires', id); if (!a) return null;
      const v = Calc.horsDevis(a);
      return { ref: { col: 'affaires', id }, numero: a.code, entrepriseId: a.clientId, contactId: a.contactId, chargeId: a.chargeId,
        fichier: `Attachement ${a.code || ''}`, html: () => attachementHD(a, v),
        vars: { chantier: chantier(a), objet: a.nom, date: dateFr(a.dateCreation), montant_ht: eur(v.total), montant_ttc: eur(v.total * (1 + Calc.tauxDoc(tvaDuClient(a.clientId)) / 100)) },
        apres: () => { if (!a.refCommande && ['Ouvert', 'Terminé'].includes(a.statut)) { a.statut = 'Commande demandée'; Store.upsert('affaires', a); } } };
    }
    case 'bon': {
      const r = Store.get('rapports', id); if (!r) return null;
      const a = affaireOf(r.affaireId);
      return { ref: { col: 'rapports', id }, numero: r.numero, entrepriseId: a.clientId, contactId: a.contactId, chargeId: a.chargeId,
        fichier: `Bon d'intervention ${r.numero || ''}`, html: () => premierRendu(Views.bon([id])),
        vars: { chantier: chantier(a), objet: a.nom, date: dateFr(r.date), signataire_phrase: r.signataireNom ? `, signé par ${r.signataireNom}` : '' } };
    }
    case 'consultation': {
      const [cid, eid] = String(id).split('~'), c = Store.get('consultations', cid); if (!c) return null;
      const a = affaireOf(c.affaireId), contacts = contactsOf(eid), four = entreprise(eid);
      return { ref: { col: 'consultations', id: cid }, numero: c.ref, entrepriseId: eid, chargeId: a.chargeId,
        contactId: (contacts.find(k => /commercial|vente|adv|devis/i.test(k.fonction || '')) || contacts[0] || {}).id,
        fichier: `Demande de prix ${c.ref || ''} ${four.nom || ''}`, html: () => consultationDocument(c, eid),
        libellePiecesSup: 'tableau Excel à compléter', piecesSup: async () => [{ nom: nomFichier(`Offre ${c.ref || ''} ${four.nom || ''}`).replace(/\.pdf$/, '.xlsx'), bytes: excelConsultation(c, eid), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
        vars: { objet: c.objet || a.nom || '', chantier: chantier(a) || 'notre atelier', date: dateFr(c.date), date_limite: dateFr(c.dateLimite) || 'dès que possible',
          date_livraison_phrase: c.dateLivraison ? ` pour le ${dateFr(c.dateLivraison)}` : '' },
        apres: () => { const f = (c.fournisseurs || []).find(x => x.entrepriseId === eid); if (f && f.statut === 'À consulter') { f.statut = 'Consulté'; f.envoyeLe = isoDate(new Date()); Store.upsert('consultations', c); } } };
    }
    case 'relance1': case 'relance2': case 'relance3': case 'demeure': {
      const f = Store.get('factures', id); if (!f) return null;
      const a = affaireOf(f.affaireId), t = Calc.doc(f), auj = isoDate(new Date()), n = Relances.NIVEAUX.find(x => x.cle === type);
      return { ref: { col: 'factures', id }, numero: f.numero, entrepriseId: docClientId(f), contactId: f.contactId, chargeId: docChargeId(f),
        fichier: type === 'demeure' ? `Mise en demeure ${f.numero || ''}` : `Facture ${f.numero || ''}`, html: () => (type === 'demeure' ? lettreDemeure(f) : factureDocument(f)),
        vars: { objet: f.objet || a.nom || '', chantier: chantier(a), date: dateFr(f.date), montant_ht: eur(t.totalHT), montant_ttc: eur(t.retenue ? t.netAPayer : t.totalTTC),
          echeance: dateFr(f.echeance), reste_du: eur(Calc.resteDu(f)), jours_retard: Relances.joursRetard(f, auj), ref_commande: f.refCommande ? `, votre commande n° ${f.refCommande}` : '' },
        apres: () => { f.relances = [...(f.relances || []), { niveau: type, date: auj, par: Store.me.nom || Store.me.login, libelle: n.lib }]; Store.upsert('factures', f); } };
    }
    case 'liberationRG': {
      const a = Store.get('affaires', id); if (!a) return null;
      const rg = retenuesChantier(a);
      return { ref: { col: 'affaires', id }, numero: a.code, entrepriseId: a.moeId || a.clientId, contactId: a.moeId ? a.moeContactId : a.contactId, chargeId: a.chargeId,
        fichier: `Retenue de garantie ${a.code || ''}`, html: () => lettreRetenue(a),
        vars: { chantier: chantier(a), objet: a.nom, date: dateFr(isoDate(new Date())), date_reception: dateFr(a.dateReception), montant_ttc: eur(rg.total) },
        apres: () => { a.rgDemandee = isoDate(new Date()); Store.upsert('affaires', a); } };
    }
    case 'mes': case 'equilibrage': {
      const conf = ESSAIS[type], r = Store.get(conf.col, id); if (!r) return null;
      const a = affaireOf(r.affaireId);
      x = { ref: { col: conf.col, id }, numero: r.numero, entrepriseId: a.moeId || a.clientId, contactId: a.moeId ? a.moeContactId : a.contactId, chargeId: a.chargeId,
        fichier: `${type === 'mes' ? 'PV mise en service' : 'Releve equilibrage'} ${r.numero || ''}`, html: () => premierRendu(Views[type]([id], new URLSearchParams())),
        vars: { chantier: chantier(a), objet: `${conf.court} – ${conf.nom(r)}`, date: dateFr(r.date) } };
      return x;
    }
    case 'epreuve': {
      const e = Store.get('epreuves', id); if (!e) return null;
      const a = affaireOf(e.affaireId);
      x = { ref: { col: 'epreuves', id }, numero: e.numero, entrepriseId: a.moeId || a.clientId, contactId: a.moeId ? a.moeContactId : a.contactId, chargeId: a.chargeId,
        fichier: `PV epreuve ${e.numero || ''}`, html: () => premierRendu(Views.epreuve([id], new URLSearchParams())),
        vars: { chantier: chantier(a), objet: `Épreuve du réseau ${e.reseau}`, date: dateFr(e.date) } };
      return x;
    }
    case 'pv': {
      const pv = Store.get('receptions', id); if (!pv) return null;
      const a = affaireOf(pv.affaireId);
      x = { ref: { col: 'receptions', id }, numero: pv.numero, entrepriseId: a.moeId || a.clientId, contactId: a.moeId ? a.moeContactId : a.contactId, chargeId: a.chargeId,
        fichier: `PV ${pv.numero || ''}`, html: () => premierRendu(Views.pv([id])),
        vars: { chantier: chantier(a), objet: a.nom, date: dateFr(pv.date) } };
      return x;
    }
  }
  return null;
}

function nomFichier(base) { return `${String(base).replace(/[\\/:*?"<>|]+/g, '-').trim()}.pdf`; }
function enBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const b64utf8 = s => enBase64(new TextEncoder().encode(s));

// Brouillon Outlook : fichier .eml « non envoyé » (X-Unsent) que Outlook ouvre en mode rédaction, PDF joint
function brouillonEML({ to, cc, subject, html, nom, pdf, pieces }) {
  const b = 'pipefit' + Date.now().toString(36);
  const ascii = n => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  const lignes = s => s.replace(/.{1,76}/g, '$&\r\n');
  const pj = (pieces || [{ nom, bytes: pdf, type: 'application/pdf' }]).flatMap(p => [`--${b}`, `Content-Type: ${p.type}; name="${ascii(p.nom)}"`, `Content-Disposition: attachment; filename="${ascii(p.nom)}"`,
    'Content-Transfer-Encoding: base64', '', lignes(enBase64(p.bytes))]);
  // Adresses venant de la base (fournisseur créé depuis une facture électronique reçue…) : aucun saut de ligne, donc aucun en-tête ajouté
  const adr = l => l.map(x => String(x).replace(/[\r\n]+/g, ' ').trim()).join(', ');
  return ['X-Unsent: 1', `To: ${adr(to)}`, cc.length ? `Cc: ${adr(cc)}` : '', `Subject: =?UTF-8?B?${b64utf8(subject)}?=`, 'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${b}"`, '', `--${b}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    lignes(b64utf8(`<html><body>${html}</body></html>`)), ...pj, `--${b}--`, ''].filter((l, i) => l !== '' || i > 4).join('\r\n');
}

async function telechargerPDF(type, id) {
  const ctx = mailContexte(type, id);
  if (!ctx) return;
  try { await PDF.telecharger(ctx.html(), nomFichier(ctx.fichier)); }
  catch (e) { notify('PDF impossible : ' + e.message); }
}

/* ---------- Fenêtre d'envoi ---------- */
async function envoyerParMail(type, id) {
  const ctx = mailContexte(type, id);
  if (!ctx) return;
  const me = await api('GET', '/api/me').catch(() => Store.me);
  const moi = Store.get('users', me.userId) || {};
  const charge = Store.get('users', ctx.chargeId) || {};
  // Expéditeur : boîte partagée réglée pour ce type de document, sinon la boîte de l'utilisateur
  const exp = AdressesEnvoi.pour(me.adressesEnvoi, type, me.email);
  const st = { entrepriseId: ctx.entrepriseId, roles: {}, modifie: false, mode: me.m365 && exp.expediteur ? 'm365' : 'outlook' };
  const contacts = () => contactsOf(st.entrepriseId).filter(c => c.email);
  const initRoles = () => {
    st.roles = {};
    const def = contacts().find(c => c.id === ctx.contactId) || contacts()[0];
    if (def) st.roles[def.id] = 'to';
    else if (entreprise(st.entrepriseId).email) st.roles.ent = 'to';
  };
  initRoles();
  const vars = () => {
    const premier = Store.get('contacts', Object.keys(st.roles).find(k => st.roles[k] === 'to' && k !== 'ent'));
    const v = { ...ctx.vars, numero: ctx.numero || '', societe: Store.data.settings.societe, client: clientName(st.entrepriseId), contact: formuleContact(premier),
      expediteur: me.nom || '', fonction_expediteur: moi.role === 'charge' ? 'Chargé(e) d\'affaires' : '', tel_expediteur: moi.tel || '', email_expediteur: me.email || '' };
    v.signature = Mails.remplir(Mails.cfg().signature || SIGNATURE_DEFAUT, v).replace(/\n{2,}/g, '\n').trim();
    return v;
  };
  const m = Mails.modele(type);
  const box = Modal.open(`<h2 style="margin-top:0">Envoyer : ${esc(MAIL_TYPES[type].label.toLowerCase())} ${esc(ctx.numero || '')}</h2>
    <div class="mail-form">
      ${ctx.choixEntreprise ? `<div class="field"><label for="ml-ent">Fournisseur consulté</label><select id="ml-ent">${options(ctx.choixEntreprise, st.entrepriseId)}</select></div>` : ''}
      <fieldset class="mail-dest"><legend>Destinataires · ${esc(clientName(st.entrepriseId))}</legend><div id="ml-contacts"></div>
        <div class="grid2"><div class="field"><label for="ml-to">Autres destinataires (séparés par des virgules)</label><input id="ml-to" type="email" multiple autocomplete="off"></div>
        <div class="field"><label for="ml-cc">Copie (Cc)</label><input id="ml-cc" type="email" multiple autocomplete="off"></div></div>
        ${charge.email && charge.id !== me.userId ? `<label class="check"><input type="checkbox" id="ml-charge" checked> Copie au chargé d'affaires : ${esc(charge.nom)} &lt;${esc(charge.email)}&gt;</label>` : ''}
      </fieldset>
      <div class="field"><label for="ml-objet">Objet</label><input id="ml-objet"></div>
      <div class="field"><label for="ml-corps">Message</label><textarea id="ml-corps" rows="12"></textarea></div>
      <p class="mail-piece">📎 <strong>${esc(nomFichier(ctx.fichier))}</strong>${ctx.piecesSup ? (ctx.piecesSupOption ? ` <label class="check"><input type="checkbox" id="ml-sup" checked> + <strong>${esc(ctx.libellePiecesSup)}</strong></label>` : ` + <strong>${esc(ctx.libellePiecesSup || 'pièces jointes')}</strong>`) : ''} <button class="small secondary" id="ml-pdf" type="button">Voir le PDF</button></p>
      <fieldset class="mail-mode"><legend>Envoi</legend>
        <label class="check"><input type="radio" name="ml-mode" value="m365" ${st.mode === 'm365' ? 'checked' : ''} ${me.m365 && exp.expediteur ? '' : 'disabled'}>
          <span>Microsoft 365, depuis ${exp.expediteur ? `<strong>${esc(exp.expediteur)}</strong>` : 'votre boîte'} : envoi immédiat, ${exp.partage ? 'enregistré dans les « Éléments envoyés » de cette boîte partagée (visibles dans Outlook par tous ceux qui y ont accès)' : 'le message est enregistré dans vos « Éléments envoyés »'}${exp.repondreA ? ` ; réponses vers ${esc(exp.repondreA)}` : ''}</span></label>
        ${!me.m365 ? '<p class="muted small">Microsoft 365 n\'est pas encore configuré (Paramètres → E-mails).</p>' : !exp.expediteur ? '<p class="muted small">Votre compte n\'a pas d\'adresse Microsoft 365 : l\'administrateur peut la renseigner dans Paramètres → Comptes.</p>' : ''}
        <label class="check"><input type="radio" name="ml-mode" value="outlook" ${st.mode === 'outlook' ? 'checked' : ''}>
          <span>Brouillon Outlook : un fichier s'ouvre dans Outlook avec le PDF joint, vous relisez et cliquez sur Envoyer</span></label>
      </fieldset>
    </div>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="ml-cancel">Annuler</button><button id="ml-send">Envoyer</button></div>`);
  const q = s => box.querySelector(s);
  const remplirTexte = () => { if (st.modifie) return; const v = vars(); q('#ml-objet').value = Mails.remplir(m.objet, v); q('#ml-corps').value = Mails.remplir(m.corps, v); };
  const dessinerContacts = () => {
    const ent = entreprise(st.entrepriseId);
    const lignes = contacts().map(c => [c.id, `${contactName(c)}${c.fonction ? ` · ${c.fonction}` : ''}`, c.email]);
    if (ent.email) lignes.push(['ent', `${ent.nom} (adresse générale)`, ent.email]);
    box.querySelector('.mail-dest legend').textContent = `Destinataires · ${ent.nom || '—'}`;
    q('#ml-contacts').innerHTML = lignes.length ? `<ul class="mail-contacts">${lignes.map(([k, l, e]) => `<li><span><strong>${esc(l)}</strong><br><span class="muted small">${esc(e)}</span></span>
      <span class="seg" role="group" aria-label="Destinataire ${esc(l)}">${[['', '—'], ['to', 'À'], ['cc', 'Cc']].map(([r, t]) => `<button type="button" class="${(st.roles[k] || '') === r ? 'on' : ''}" data-k="${esc(k)}" data-r="${r}">${t}</button>`).join('')}</span></li>`).join('')}</ul>`
      : `<p class="muted small">Aucun contact avec une adresse e-mail pour cette entreprise. <a href="#/entreprise/${esc(st.entrepriseId)}">Compléter la fiche</a> ou saisissez l'adresse ci-dessous.</p>`;
    q('#ml-contacts').querySelectorAll('[data-k]').forEach(btn => btn.onclick = () => { st.roles[btn.dataset.k] = btn.dataset.r; dessinerContacts(); remplirTexte(); });
  };
  dessinerContacts(); remplirTexte();
  q('#ml-objet').oninput = q('#ml-corps').oninput = () => { st.modifie = true; };
  if (q('#ml-ent')) q('#ml-ent').onchange = e => { st.entrepriseId = e.target.value; initRoles(); dessinerContacts(); remplirTexte(); };
  q('#ml-cancel').onclick = Modal.close;
  q('#ml-pdf').onclick = () => PDF.telecharger(ctx.html(), nomFichier(ctx.fichier)).catch(e => notify(e.message));
  box.querySelectorAll('[name="ml-mode"]').forEach(r => r.onchange = () => { st.mode = r.value; });
  q('#ml-send').onclick = async () => {
    const adresse = k => (k === 'ent' ? entreprise(st.entrepriseId).email : (Store.get('contacts', k) || {}).email);
    const libres = v => v.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
    const to = [...Object.keys(st.roles).filter(k => st.roles[k] === 'to').map(adresse), ...libres(q('#ml-to').value)].filter(Boolean);
    const cc = [...Object.keys(st.roles).filter(k => st.roles[k] === 'cc').map(adresse), ...libres(q('#ml-cc').value), ...(q('#ml-charge') && q('#ml-charge').checked ? [charge.email] : [])].filter(Boolean);
    const bad = [...to, ...cc].find(a => !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(a));
    if (!to.length) return notify('Choisissez au moins un destinataire (À).');
    if (bad) return notify(`Adresse e-mail invalide : ${bad}`);
    const subject = q('#ml-objet').value.trim(), corps = q('#ml-corps').value;
    if (!subject) return notify('L\'objet est vide.');
    const btn = q('#ml-send'); btn.disabled = true; btn.textContent = 'Préparation du PDF…';
    try {
      const nom = nomFichier(ctx.fichier), pdf = await PDF.depuisHTML(ctx.html(), nom.replace(/\.pdf$/, ''));
      const html = Mails.html(corps);
      const sup = ctx.piecesSup && !(q('#ml-sup') && !q('#ml-sup').checked) ? await ctx.piecesSup() : [];
      const uniques = l => [...new Set(l.map(a => a.toLowerCase()))];
      const dest = { to: uniques(to), cc: uniques(cc).filter(a => !uniques(to).includes(a)) };
      if (st.mode === 'm365') {
        btn.textContent = 'Envoi…';
        const rec = await api('POST', '/api/mail', { ...dest, subject, html, type, numero: ctx.numero, ref: ctx.ref, attachments: [{ name: nom, base64: enBase64(pdf) }, ...sup.map(p => ({ name: p.nom, base64: enBase64(p.bytes) }))] });
        Store._put('envois', rec);
        App.toast(`E-mail envoyé à ${dest.to.join(', ')}`, 3500);
      } else {
        download(nom.replace(/\.pdf$/, '.eml'), brouillonEML({ ...dest, subject, html, pieces: [{ nom, bytes: pdf, type: 'application/pdf' }, ...sup] }), 'message/rfc822');
        Store.upsert('envois', { date: new Date().toISOString(), type, col: ctx.ref.col, docId: ctx.ref.id, numero: ctx.numero || '', ...dest, objet: subject, pieces: [nom, ...sup.map(p => p.nom)], mode: 'Brouillon Outlook', expediteur: exp.expediteur || '', par: me.nom });
        App.toast('Brouillon téléchargé : ouvrez-le dans Outlook pour l\'envoyer.', 4500);
      }
      if (ctx.apres) ctx.apres();
      Modal.close(); App.render();
    } catch (e) { notify(e.message); btn.disabled = false; btn.textContent = 'Envoyer'; }
  };
}

// Boutons à placer dans la barre d'outils d'un document
function boutonsEnvoi(type, id, libelle = 'Envoyer par e-mail', pdf = true) {
  const peut = ['admin', 'charge'].includes(Store.me.role);
  return `${pdf ? `<button class="secondary" data-pdf="${type}|${esc(id)}" title="Télécharger le document au format A4">PDF A4</button>` : ''}${peut ? `<button data-mail="${type}|${esc(id)}">✉ ${esc(libelle)}</button>` : ''}`;
}
// Historique des envois d'un document
function envoisHtml(col, id) {
  const l = Store.all('envois').filter(e => e.col === col && e.docId === id).sort((a, b) => b.date.localeCompare(a.date));
  if (!l.length) return '';
  return `<details class="card envois no-print"><summary>✉ Envoyé ${l.length} fois · dernier envoi le ${new Date(l[0].date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} à ${esc(l[0].to.join(', '))}</summary>
    <div class="table-wrap"><table><tr><th>Date</th><th>Document</th><th>À</th><th>Cc</th><th>Objet</th><th>Envoi</th><th>Par</th></tr>
    ${l.map(e => `<tr><td>${new Date(e.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${esc((MAIL_TYPES[e.type] || {}).label || '')}</td><td>${esc(e.to.join(', '))}</td><td>${esc((e.cc || []).join(', '))}</td>
      <td>${esc(e.objet)}</td><td>${e.mode === 'Microsoft 365' ? '<span class="badge b-ok">Microsoft 365</span>' : `<span class="badge">${esc(e.mode)}</span>`}</td><td>${esc(e.par)}</td></tr>`).join('')}</table></div></details>`;
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-mail], [data-pdf]');
  if (!b) return;
  const [type, id] = (b.dataset.mail || b.dataset.pdf).split('|');
  if (b.dataset.mail) envoyerParMail(type, id).catch(err => notify(err.message));
  else telechargerPDF(type, id);
});

/* ---------- Paramétrage : modèles d'e-mails et connexion Microsoft 365 ---------- */
let mailEdit = { type: 'devis', draft: null };
Views.mails = () => {
  const admin = Store.can('admin'), dis = admin ? '' : 'disabled';
  if (!mailEdit.draft) mailEdit.draft = JSON.parse(JSON.stringify(Mails.cfg()));
  const c = mailEdit.draft, t = (c.types || {})[mailEdit.type] || {}, def = MAIL_TYPES[mailEdit.type];
  return `<div class="toolbar"><a href="#/parametres" class="btn secondary">← Paramètres</a><span class="spacer"></span>
    ${admin ? '<button class="secondary" id="mm-annuler">Annuler les modifications</button><button id="mm-save">Enregistrer les modèles</button>' : ''}</div>
  <h1>E-mails</h1>
  ${admin ? '' : '<p class="note">Seul un administrateur peut modifier les modèles et la connexion Microsoft 365.</p>'}
  <p class="muted">Depuis chaque devis, facture, BL, commande, demande de prix, attachement, bon d'intervention ou PV : bouton <strong>✉ Envoyer par e-mail</strong>.
    Le destinataire est proposé à partir des contacts de l'entreprise, le message est pré-rempli avec le modèle ci-dessous et le document est joint en PDF.</p>
  <div class="doc-config">
    <div class="doc-form">
      <div class="card" id="mm-365"><strong>Connexion Microsoft 365</strong><p class="muted small">Chargement…</p></div>
      <div class="card" id="mm-adr"><strong>Adresses d'envoi par type de document</strong><p class="muted small">Chargement…</p></div>
      <div class="card"><div class="field"><label for="mm-sign">Signature (commune à tous les modèles, variable {signature})</label>
        <textarea id="mm-sign" rows="5" ${dis}>${esc(c.signature || SIGNATURE_DEFAUT)}</textarea></div>
        <p class="muted small">Votre adresse d'envoi : <strong>${esc(Store.me.email || 'non renseignée')}</strong>.</p></div>
    </div>
    <div class="doc-form">
      <div class="card">
        <div class="field"><label for="mm-type">Modèle</label><select id="mm-type">${Object.entries(MAIL_TYPES).map(([k, d]) => `<option value="${k}" ${k === mailEdit.type ? 'selected' : ''}>${d.label}</option>`).join('')}</select></div>
        <div class="field"><label for="mm-objet">Objet</label><input id="mm-objet" value="${esc(t.objet || def.objet)}" ${dis}></div>
        <div class="field"><label for="mm-corps">Message</label><textarea id="mm-corps" rows="12" ${dis}>${esc(t.corps || def.corps)}</textarea></div>
        ${admin ? '<div class="toolbar"><button class="secondary small" id="mm-defaut">Revenir au modèle d\'origine</button></div>' : ''}
        <details><summary class="small">Variables disponibles (cliquer pour insérer)</summary><div class="chips-vars">${MAIL_VARIABLES.map(([k, l]) => `<button type="button" class="small secondary" data-var="${k}" title="${esc(l)}" ${dis}>{${k}}</button>`).join('')}</div>
          <ul class="muted small vars-list">${MAIL_VARIABLES.map(([k, l]) => `<li><code>{${k}}</code> ${esc(l)}</li>`).join('')}</ul></details>
      </div>
      <div class="card"><div class="label muted small">Aperçu sur un document réel</div><div id="mm-apercu" class="mail-apercu"></div></div>
    </div>
  </div>`;
};

function apercuMail(type, c) {
  const pick = { consultation: ['consultations', c => (c.fournisseurs || []).length], devis: ['devis'], facture: ['factures', f => f.type !== 'avoir'], avoir: ['factures', f => f.type === 'avoir'], situation: ['situations'], commande: ['commandes'], demandePrix: ['commandes'], attachement: ['affaires', estHorsDevis], bon: ['rapports', r => r.signatureClientId], pv: ['receptions'],
    relance1: ['factures', f => f.type !== 'avoir'], relance2: ['factures', f => f.type !== 'avoir'], relance3: ['factures', f => f.type !== 'avoir'], demeure: ['factures', f => f.type !== 'avoir'], liberationRG: ['affaires', a => num(a.retenueGarantie)] }[type];
  const doc = Store.all(pick[0]).filter(pick[1] || (() => true)).slice(-1)[0];
  if (!doc) return '<p class="muted">Aucun document de ce type pour l\'aperçu.</p>';
  const ctx = mailContexte(type, type === 'consultation' ? `${doc.id}~${doc.fournisseurs[0].entrepriseId}` : doc.id), contact = Store.get('contacts', ctx.contactId);
  const v = { ...ctx.vars, numero: ctx.numero || '', societe: Store.data.settings.societe, client: clientName(ctx.entrepriseId), contact: formuleContact(contact),
    expediteur: Store.me.nom, fonction_expediteur: 'Chargé(e) d\'affaires', tel_expediteur: (Store.get('users', Store.me.userId) || {}).tel || '', email_expediteur: Store.me.email || '' };
  v.signature = Mails.remplir(c.signature || SIGNATURE_DEFAUT, v).replace(/\n{2,}/g, '\n').trim();
  const t = (c.types || {})[type] || {};
  return `<p class="small"><strong>À :</strong> ${esc(contact && contact.email ? `${contactName(contact)} <${contact.email}>` : clientName(ctx.entrepriseId))}<br>
    <strong>Objet :</strong> ${esc(Mails.remplir(t.objet || MAIL_TYPES[type].objet, v))}<br><strong>Pièce jointe :</strong> ${esc(nomFichier(ctx.fichier))}</p>
    ${Mails.html(Mails.remplir(t.corps || MAIL_TYPES[type].corps, v))}`;
}

Views.mails.bind = root => {
  const c = mailEdit.draft, q = s => root.querySelector(s);
  const typeCfg = () => { c.types = c.types || {}; return (c.types[mailEdit.type] = c.types[mailEdit.type] || {}); };
  const apercu = () => { q('#mm-apercu').innerHTML = apercuMail(mailEdit.type, c); };
  apercu();
  q('#mm-type').onchange = e => { mailEdit.type = e.target.value; App.render(); };
  // Connexion Microsoft 365 (administrateur)
  const carte = q('#mm-365');
  if (!Store.can('admin')) carte.innerHTML = `<strong>Connexion Microsoft 365</strong><p class="small">${Store.me.m365 ? 'Active : les e-mails partent de votre boîte Microsoft 365 et apparaissent dans vos éléments envoyés.' : 'Non configurée : les e-mails sont préparés comme brouillons Outlook.'}</p>`;
  else api('GET', '/api/m365').then(m => {
    carte.innerHTML = `<strong>Connexion Microsoft 365</strong> ${m.actif ? '<span class="badge b-ok">Active</span>' : '<span class="badge">Inactive</span>'}
      <p class="muted small">Application enregistrée dans Microsoft Entra ID (portail Azure) avec l'autorisation d'application <strong>Mail.Send</strong> et le consentement administrateur.
      Chaque utilisateur envoie depuis l'adresse renseignée sur son compte (Paramètres → Comptes) ; le message est enregistré dans ses éléments envoyés.</p>
      <div class="field"><label for="m3-tenant">ID de l'annuaire (locataire)</label><input id="m3-tenant" value="${esc(m.tenantId)}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off"></div>
      <div class="field"><label for="m3-client">ID d'application (client)</label><input id="m3-client" value="${esc(m.clientId)}" autocomplete="off"></div>
      <div class="field"><label for="m3-secret">Secret client ${m.secretDefini ? '(déjà enregistré, laisser vide pour le conserver)' : ''}</label><input id="m3-secret" type="password" autocomplete="new-password" placeholder="${m.secretDefini ? '••••••••' : ''}"></div>
      <label class="check"><input type="checkbox" id="m3-actif" ${m.actif ? 'checked' : ''}> Activer l'envoi par Microsoft 365</label>
      <div class="toolbar" style="margin-top:8px"><button class="secondary" id="m3-save">Enregistrer la connexion</button><button class="secondary" id="m3-test">Tester (e-mail à moi-même)</button></div>`;
    const lire = () => ({ tenantId: q('#m3-tenant').value, clientId: q('#m3-client').value, clientSecret: q('#m3-secret').value, actif: q('#m3-actif').checked });
    q('#m3-save').onclick = () => api('PUT', '/api/m365', lire()).then(() => { App.toast('Connexion Microsoft 365 enregistrée'); App.render(); }).catch(e => notify(e.message));
    q('#m3-test').onclick = async () => {
      try { await api('PUT', '/api/m365', lire()); const r = await api('POST', '/api/m365/test', {}); notify(r.message); }
      catch (e) { notify(e.message); }
    };
  }).catch(e => { carte.innerHTML = `<p class="neg">${esc(e.message)}</p>`; });
  adressesEnvoiCarte(q('#mm-adr'));
  if (!Store.can('admin')) return;
  let dernier = q('#mm-corps');
  q('#mm-objet').onfocus = q('#mm-corps').onfocus = e => { dernier = e.target; };
  q('#mm-objet').oninput = () => { typeCfg().objet = q('#mm-objet').value; apercu(); };
  q('#mm-corps').oninput = () => { typeCfg().corps = q('#mm-corps').value; apercu(); };
  q('#mm-sign').oninput = () => { c.signature = q('#mm-sign').value; apercu(); };
  root.querySelectorAll('[data-var]').forEach(b => b.onclick = () => {
    const el = dernier, v = `{${b.dataset.var}}`, p = el.selectionStart ?? el.value.length;
    el.value = el.value.slice(0, p) + v + el.value.slice(el.selectionEnd ?? p);
    el.focus(); el.selectionStart = el.selectionEnd = p + v.length; el.dispatchEvent(new Event('input'));
  });
  q('#mm-defaut').onclick = () => { if (c.types) delete c.types[mailEdit.type]; App.render(); };
  q('#mm-annuler').onclick = () => { mailEdit.draft = null; App.render(); };
  q('#mm-save').onclick = async () => {
    try { await Store.saveSettings({ ...Store.data.settings, mails: c }); mailEdit.draft = null; App.render(); App.toast('Modèles enregistrés'); }
    catch (e) { notify(e.message); }
  };
};

// Pièce jointe depuis un fichier enregistré (offre d'un fournisseur…) : nom sans accents, extension d'après le type
async function pieceDepuisFichier(id, base, nomOrigine = '') {
  const r = await fetch(fileUrl(id), { credentials: 'same-origin' });
  if (!r.ok) throw new Error('Offre du fournisseur introuvable');
  const bytes = new Uint8Array(await r.arrayBuffer()), type = (r.headers.get('content-type') || '').split(';')[0];
  const ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'text/csv': 'csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx' }[type]
    || ((/\.(pdf|jpe?g|png|webp|csv|xlsx)$/i.exec(nomOrigine) || [])[1] || 'pdf').toLowerCase().replace('jpeg', 'jpg');
  const propre = String(base).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w .,()'&+-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Offre';
  return { nom: `${propre}.${ext}`, bytes, type: type || 'application/pdf' };
}

// Adresses d'envoi par famille de documents : boîte partagée (expéditeur), adresse de réponse, copie cachée d'archive
function adressesEnvoiCarte(carte) {
  if (!carte) return;
  const admin = Store.can('admin'), dis = admin ? '' : 'disabled';
  api('GET', '/api/mail/adresses').then(c => {
    if (!carte.isConnected) return;
    carte.innerHTML = `<strong>Adresses d'envoi par type de document</strong>
      <p class="muted small">Laissez « Expéditeur » vide pour envoyer depuis la boîte de l'utilisateur. Avec une boîte partagée (ex. achats@), le message part de cette boîte
      et s'enregistre dans ses « Éléments envoyés » : toute l'équipe le retrouve dans Outlook. La boîte doit exister dans Microsoft 365 et être autorisée pour l'application (Mail.Send).</p>
      ${AdressesEnvoi.GROUPES.map(g => { const v = c[g.id] || {}; return `<fieldset class="adr-groupe" data-g="${g.id}"><legend>${esc(g.label)}</legend>
        <div class="grid2"><div class="field"><label>Expéditeur</label><input type="email" data-k="expediteur" value="${esc(v.expediteur || '')}" placeholder="boîte de l'utilisateur (ex. ${esc(g.exemple)})" ${dis}></div>
        <div class="field"><label>Répondre à</label><input type="email" data-k="repondreA" value="${esc(v.repondreA || '')}" placeholder="${g.id === 'consultations' ? 'boîte des offres si elle est active' : 'l\'expéditeur'}" ${dis}></div>
        <div class="field"><label>Copie cachée d'archive (Cci)</label><input type="email" data-k="cci" value="${esc(v.cci || '')}" placeholder="aucune" ${dis}></div>
        <label class="check" style="align-self:end"><input type="checkbox" data-k="copieMoi" ${v.copieMoi ? 'checked' : ''} ${dis}> Copie cachée à l'utilisateur qui envoie (boîte partagée)</label></div></fieldset>`; }).join('')}
      ${admin ? '<div class="toolbar" style="margin:8px 0 0"><button class="secondary" id="adr-save">Enregistrer les adresses</button></div>' : ''}`;
    const b = carte.querySelector('#adr-save');
    if (b) b.onclick = () => {
      const corps = {};
      carte.querySelectorAll('.adr-groupe').forEach(f => { corps[f.dataset.g] = Object.fromEntries([...f.querySelectorAll('[data-k]')].map(i => [i.dataset.k, i.type === 'checkbox' ? i.checked : i.value.trim()])); });
      api('PUT', '/api/mail/adresses', corps).then(r => { Store.me.adressesEnvoi = r; App.toast('Adresses d\'envoi enregistrées'); }).catch(e => notify(e.message));
    };
  }).catch(e => { carte.innerHTML = `<p class="neg">${esc(e.message)}</p>`; });
}
