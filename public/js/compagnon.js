// Ce que voient les compagnons (comptes « Opérateur ») : réglé par l'administrateur (Paramètres → Appli des compagnons).
// Le filtrage est fait par le serveur avant l'envoi : prix, montants, budgets d'heures, factures, taux et salaires
// ne partent jamais sur leur téléphone. Module partagé serveur / navigateur (démonstration).
const Compagnon = (() => {
  // [clé, libellé, valeur par défaut, précision]
  const OPTIONS = [
    ['client', 'Nom du client', true, 'Sinon, seuls le chantier et l\'adresse du site sont affichés.'],
    ['contactSite', 'Contact du client sur le site (nom, téléphone)', true, ''],
    ['materiel', 'Matériel prévu au devis, en détail', true, 'Liste des fournitures du chantier, par ouvrage et en total par article.'],
    ['quantites', 'Quantités du matériel prévu', true, ''],
    ['commandes', 'Commandes fournisseurs et livraisons attendues', true, 'Fournisseur, date de livraison, état ; jamais les prix.'],
    ['documents', 'Documents du chantier (plans, fiches techniques…)', true, 'Seuls les documents cochés « à transmettre aux compagnons ».'],
    ['collegues', 'Collègues affectés au même chantier', true, 'Sinon, chacun ne voit que son planning (et celui de son équipe pour un chef d\'équipe).'],
    ['heuresBudget', 'Heures prévues au devis (budget d\'heures du chantier)', false, ''],
    ['prix', 'Prix et montants (matériel, devis, commandes)', false, ''],
  ];
  const DEFAUT = Object.fromEntries(OPTIONS.map(o => [o[0], o[2]]));
  const regles = settings => ({ ...DEFAUT, ...((settings && settings.compagnon) || {}) });
  // Listes jamais envoyées aux compagnons
  const MASQUEES = ['factures', 'situations', 'achats', 'efactures', 'consultations', 'chiffrages', 'envois', 'ouvrages', 'familles', 'zones', 'missions'];
  const sans = (o, cles) => { const r = { ...o }; cles.forEach(k => delete r[k]); return r; };

  // Devis accepté d'un chantier : désignations, quantités et fournitures, sans prix (ni heures sauf réglage)
  function devis(r, R) {
    if (r.statut !== 'Accepté' || !r.affaireId || !R.materiel) return null;
    const lignes = (r.lignes || []).map(l => {
      if (l.type === 'chapitre') return { type: 'chapitre', titre: l.titre, niveau: l.niveau, num: l.num };
      if (l.type === 'texte' || l.type === 'image') return l;
      const comp = (l.composants || []).filter(c => c.type !== 'mo' || R.heuresBudget).map(c => (c.type === 'mo'
        ? { type: 'mo', moId: c.moId, libelle: c.libelle, heures: c.heures, ...(R.prix ? { taux: c.taux } : {}) }
        : { type: 'f', articleId: c.articleId || '', designation: c.designation, unite: c.unite, ...(R.quantites ? { qte: c.qte } : {}), ...(R.prix ? { pu: c.pu } : {}) }));
      return { type: l.type || 'ouvrage', num: l.num, designation: l.designation, detail: l.detail, unite: l.unite, ...(R.quantites ? { qte: l.qte } : {}), ...(l.tva !== undefined && R.prix ? { tva: l.tva } : {}), composants: comp };
    });
    return { id: r.id, numero: r.numero, objet: r.objet, affaireId: r.affaireId, statut: r.statut, numAuto: r.numAuto, lignes, _v: r._v, _at: r._at, _by: r._by };
  }

  // ctx : { userId, equipe (ids visibles pour le planning), contacts (ids des contacts de chantier) }
  function filtrer(col, r, R, ctx) {
    if (!r) return r;
    if (MASQUEES.includes(col)) return null;
    switch (col) {
      case 'notifications': return r.userId === ctx.userId ? r : null;
      case 'users': return sans(r, ['tauxHoraire', 'salaireHoraire', 'email']);
      case 'mainoeuvre': return sans(r, ['tauxVente', 'tauxCout']);
      case 'articles': return R.prix ? sans(r, ['coutRevient']) : sans(r, ['prixVente', 'coutRevient']);
      case 'devis': return devis(r, R);
      case 'affaires': return { ...sans(r, ['retenueGarantie', 'caution', 'rex', 'okFacturation', 'factureId', 'retenueLiberee', ...(R.heuresBudget ? [] : ['heuresPrevues'])]),
        clientId: r.clientId, documents: R.documents ? (r.documents || []).filter(d => d.visible) : [] };
      case 'entreprises': return { id: r.id, nom: R.client || r.categorie !== 'Client' ? r.nom : '', categorie: r.categorie, adresses: r.adresses || [], _v: r._v, _at: r._at, _by: r._by };
      case 'contacts': return R.contactSite && ctx.contacts.has(r.id) ? sans(r, ['email']) : null;
      case 'commandes': return R.commandes ? { ...sans(r, ['frais', 'port', 'conditions', 'pieceId', 'factureId']), lignes: (r.lignes || []).map(l => (R.prix ? l : sans(l, ['pu', 'cout', 'remise']))) } : null;
      case 'consommations': return R.prix ? r : sans(r, ['pu', 'cout']);
      case 'planning': return R.collegues || ctx.equipe.includes(r.userId) ? r : null;
      // Habilitations et visites médicales : les siennes (et celles de son équipe pour un chef d'équipe)
      case 'habilitations': return ctx.equipe.includes(r.userId) ? r : null;
      // Véhicule et outillage confiés à soi ou à son équipe, sans valeur d'achat
      case 'materiels': return r.affectation && ctx.equipe.includes(r.affectation.userId) ? sans(r, ['valeur', 'historique']) : null;
      default: return r;
    }
  }
  function filtrerSettings(s) { return sans(s || {}, ['compta', 'tauxHoraireDefaut']); }
  // Contexte d'un compagnon : son équipe et les contacts des chantiers
  function contexte(userId, users, affaires) {
    return { userId, equipe: [userId, ...users.filter(u => u.chefId === userId).map(u => u.id)], contacts: new Set(affaires.flatMap(a => [a.contactId, a.moeContactId]).filter(Boolean)) };
  }
  function filtrerTout(data, R, ctx) {
    const out = { settings: filtrerSettings(data.settings) };
    Object.keys(data).filter(k => k !== 'settings').forEach(col => { out[col] = (data[col] || []).map(r => filtrer(col, r, R, ctx)).filter(Boolean); });
    return out;
  }
  return { OPTIONS, DEFAUT, regles, filtrer, filtrerSettings, filtrerTout, contexte, MASQUEES };
})();
if (typeof module !== 'undefined') module.exports = Compagnon;
