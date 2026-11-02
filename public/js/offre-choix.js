// Choix de l'offre d'une consultation et suite de la demande : totaux des offres, mieux-disant (offre complète), commande
// tirée de l'offre retenue, commande automatique d'une demande du terrain sous le seuil du compagnon, et état de la
// demande vu par le compagnon (sans prix). Module pur (navigateur, serveur, démo, tests).
const OffreChoix = (() => {
  const n = v => { const x = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
  const r2 = v => Math.round(v * 100) / 100;
  // Montants d'une offre : lignes chiffrées, remise, port (comme l'écran des consultations)
  function totaux(c, f) {
    const o = (f && f.offre) || {}, prix = o.prix || {};
    const pu = i => (prix[i] === '' || prix[i] === undefined || prix[i] === null ? null : n(prix[i]) * (1 - n(o.remise) / 100));
    const ls = (c.lignes || []).map((l, i) => ({ i, pu: pu(i), qte: n(l.qte) })), ch = ls.filter(l => l.pu !== null);
    const net = r2(ch.reduce((s, l) => s + l.pu * l.qte, 0) + n(o.port));
    return { net, nb: ch.length, complet: ls.length > 0 && ch.length === ls.length, pu, port: n(o.port), delai: o.delai || '' };
  }
  const recues = c => (c.fournisseurs || []).filter(f => f.statut === 'Offre reçue').map(f => ({ f, t: totaux(c, f) })).filter(o => o.t.nb);
  // Mieux-disant parmi les offres complètes (à prix égal, le délai le plus court)
  function meilleure(c) {
    const l = recues(c).filter(o => o.t.complet).sort((a, b) => a.t.net - b.t.net || n(a.t.delai || 99) - n(b.t.delai || 99));
    return l[0] ? { entrepriseId: l[0].f.entrepriseId, net: l[0].t.net, delai: l[0].t.delai, deuxieme: l[1] ? l[1].t.net : null } : null;
  }
  // Décision possible : tous les fournisseurs consultés ont répondu (ou décliné), ou le délai d'attente est passé
  function prete(c, maintenant, attenteH = 24) {
    const fs = (c.fournisseurs || []).filter(f => f.statut !== 'À consulter'), attendus = fs.filter(f => !['Offre reçue', 'Décline'].includes(f.statut));
    const depuis = Date.parse((c.terrain && c.terrain.le) || c.date || 0);
    return fs.length > 0 && (!attendus.length || (Number.isFinite(depuis) && Date.parse(maintenant) - depuis >= attenteH * 3600e3));
  }
  // Commande d'une demande du terrain préparée (jamais envoyée sans validation) : mieux-disant complet, au plus le
  // seuil du compagnon (€ HT) ; « commander » = préparer la commande à valider
  function decisionAuto(c, user, maintenant, attenteH = 24) {
    if (!c || c.statut !== 'En cours' || !c.terrain || c.retenu) return { commander: false, raison: 'hors champ' };
    const seuil = n(user && user.seuilCommande);
    if (!prete(c, maintenant, attenteH)) return { commander: false, raison: 'offres attendues' };
    const m = meilleure(c);
    if (!m) return { commander: false, raison: 'aucune offre complète' };
    if (!(seuil > 0)) return { commander: false, raison: 'validation du bureau', meilleure: m };
    if (m.net > seuil) return { commander: false, raison: `au-dessus du seuil (${seuil} € HT)`, meilleure: m };
    return { commander: true, raison: `meilleure offre ${m.net} € HT ≤ seuil ${seuil} € HT`, meilleure: m };
  }
  // Commande tirée de l'offre retenue (toutes les lignes chez ce fournisseur), port en ligne à part
  function commande(c, eid, date) {
    const f = (c.fournisseurs || []).find(x => x.entrepriseId === eid);
    if (!f || f.statut !== 'Offre reçue') throw new Error('Offre de ce fournisseur non reçue');
    const t = totaux(c, f), o = f.offre || {};
    const lignes = (c.lignes || []).map((l, i) => ({ articleId: l.articleId || '', refFournisseur: (o.refs || {})[i] || '', designation: l.designation, unite: l.unite, qte: n(l.qte), pu: r2(t.pu(i) || 0) }));
    if (t.port) lignes.push({ articleId: '', designation: 'Frais de port', unite: 'forfait', qte: 1, pu: t.port });
    return { numero: '', fournisseurId: eid, affaireId: c.affaireId || '', date, dateLivraison: c.dateLivraison || '', statut: 'Brouillon', lignes, consultationId: c.id,
      devisFournisseurId: o.pieceId || '', devisFournisseurRef: o.reference || '', devisFournisseurNom: o.pieceNom || '' };
  }
  // État de la demande pour le compagnon (aucun prix)
  function etatDemande(c, commandes, nomDe = () => '') {
    const fs = c.fournisseurs || [], nbOffres = fs.filter(f => f.statut === 'Offre reçue').length;
    const cmd = (commandes || []).find(x => x.consultationId === c.id && x.statut !== 'Annulée');
    const base = { id: c.id, ref: c.ref || '', date: c.date || '', affaireId: c.affaireId || '', lignes: (c.lignes || []).map(l => ({ designation: l.designation, qte: n(l.qte), unite: l.unite || '' })),
      consultes: fs.filter(f => f.statut !== 'À consulter').length, offres: nbOffres };
    if (cmd && cmd.aValider) return { ...base, etat: 'avalider', libelle: 'Commande préparée — à valider', commande: { numero: cmd.numero || '', fournisseur: nomDe(cmd.fournisseurId), dateLivraison: cmd.dateLivraison || '', auto: true } };
    if (cmd) {
      const livre = cmd.statut === 'Réceptionnée', partiel = cmd.statut === 'Réceptionnée partiellement';
      return { ...base, etat: livre ? 'livree' : partiel ? 'partielle' : 'commandee', libelle: livre ? 'Livrée' : partiel ? 'Livrée en partie' : 'Commandée',
        commande: { numero: cmd.numero || '', fournisseur: nomDe(cmd.fournisseurId), dateLivraison: cmd.dateLivraison || '', auto: !!(c.retenu && c.retenu.auto) } };
    }
    if (!fs.length) return { ...base, etat: 'bureau', libelle: 'Au bureau (fournisseurs à choisir)' };
    if (c.statut !== 'En cours') return { ...base, etat: 'close', libelle: 'Traitée par le bureau' };
    return { ...base, etat: nbOffres ? 'offres' : 'envoyee', libelle: nbOffres ? `${nbOffres} offre(s) reçue(s) sur ${base.consultes}` : `Envoyée à ${base.consultes} fournisseur(s)` };
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const eur = v => `${n(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  // E-mails : bon de commande au fournisseur retenu, information des fournisseurs non retenus
  function mailCommande({ numero, consultationRef, devisRef, lignes, chantier = {}, livraison = '', dateLivraison = '', signataire = '', societe = '' }) {
    const total = lignes.reduce((s, l) => s + n(l.qte) * n(l.pu), 0);
    return { sujet: `Commande ${numero}${consultationRef ? ` – votre offre ${devisRef || ''} (demande ${consultationRef})`.replace('  ', ' ') : ''}`,
      html: `<p>Bonjour,</p><p>Suite à votre offre${devisRef ? ` ${esc(devisRef)}` : ''}${consultationRef ? ` (demande de prix ${esc(consultationRef)})` : ''}, nous vous passons commande de :</p>
      <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><tr style="background:#eee"><th align="left">Désignation</th><th align="left">Réf.</th><th align="right">Qté</th><th>Unité</th><th align="right">PU net HT</th><th align="right">Total HT</th></tr>
      ${lignes.map(l => `<tr><td>${esc(l.designation)}</td><td>${esc(l.refFournisseur || '')}</td><td align="right">${String(n(l.qte)).replace('.', ',')}</td><td>${esc(l.unite || '')}</td><td align="right">${eur(l.pu)}</td><td align="right">${eur(n(l.qte) * n(l.pu))}</td></tr>`).join('')}
      <tr><td colspan="5" align="right"><strong>Total HT</strong></td><td align="right"><strong>${eur(total)}</strong></td></tr></table>
      <p>Commande n° <strong>${esc(numero)}</strong>${chantier.code ? ` — chantier ${esc([chantier.code, chantier.nom].filter(Boolean).join(' – '))}` : ''}${livraison ? `<br>Livraison : ${esc(livraison)}` : ''}${dateLivraison ? `<br>Livraison souhaitée le <strong>${esc(dateLivraison.split('-').reverse().join('/'))}</strong>` : ''}</p>
      <p>Merci de nous confirmer la commande et la date de livraison en rappelant le n° ${esc(numero)}.</p><p>Cordialement,<br>${esc(signataire)}${societe ? `<br>${esc(societe)}` : ''}</p>` };
  }
  const mailNonRetenu = ({ consultationRef, signataire = '', societe = '' }) => ({ sujet: `Demande de prix ${consultationRef || ''} – offre non retenue`.trim(),
    html: `<p>Bonjour,</p><p>Merci pour votre offre en réponse à notre demande de prix ${esc(consultationRef || '')}. Nous ne l'avons pas retenue cette fois-ci.</p><p>Cordialement,<br>${esc(signataire)}${societe ? `<br>${esc(societe)}` : ''}</p>` });
  return { totaux, meilleure, prete, decisionAuto, commande, etatDemande, mailCommande, mailNonRetenu };
})();
if (typeof module !== 'undefined') module.exports = OffreChoix;
