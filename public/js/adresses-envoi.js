// Adresses d'envoi des e-mails par type de document (Microsoft 365) : chaque famille de documents peut partir d'une boîte
// partagée (ex. commercial@ pour les devis, comptabilite@ pour les factures, achats@ pour les commandes) au lieu de la
// boîte de l'utilisateur ; le message est alors enregistré dans les « Éléments envoyés » de cette boîte, visibles dans
// Outlook par tous ceux qui y ont accès. Adresse de réponse et copie cachée d'archive au choix. Module commun serveur / navigateur.
const AdressesEnvoi = (() => {
  const GROUPES = [
    { id: 'devis', label: 'Devis', exemple: 'commercial@votre-domaine.fr', types: ['devis'] },
    { id: 'factures', label: 'Factures, situations, avoirs et relances', exemple: 'comptabilite@votre-domaine.fr',
      types: ['facture', 'avoir', 'situation', 'relance1', 'relance2', 'relance3', 'demeure', 'liberationRG', 'compta'] },
    { id: 'commandes', label: 'Commandes fournisseurs', exemple: 'achats@votre-domaine.fr', types: ['commande', 'demandePrix'] },
    { id: 'consultations', label: 'Demandes de prix (consultations)', exemple: 'achats@votre-domaine.fr', types: ['consultation'] },
    { id: 'chantier', label: 'Attachements, bons d\'intervention et PV', exemple: 'travaux@votre-domaine.fr', types: ['attachement', 'bon', 'pv'] },
  ];
  const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
  const groupe = type => GROUPES.find(g => g.types.includes(type)) || null;
  const propre = v => String(v || '').trim().toLowerCase().slice(0, 200);

  // Réglage enregistré : seulement les familles connues, adresses vérifiées (message d'erreur sinon)
  function normaliser(b) {
    const out = {};
    for (const g of GROUPES) {
      const c = (b && b[g.id]) || {};
      const r = { expediteur: propre(c.expediteur), repondreA: propre(c.repondreA), cci: propre(c.cci), copieMoi: !!c.copieMoi };
      for (const k of ['expediteur', 'repondreA', 'cci']) if (r[k] && !EMAIL.test(r[k])) throw new Error(`${g.label} : adresse invalide (${r[k]})`);
      if (r.expediteur || r.repondreA || r.cci || r.copieMoi) out[g.id] = r;
    }
    return out;
  }

  // Envoi d'un document de ce type par ce compte : expéditeur, adresse de réponse, copies cachées
  function pour(cfg, type, emailCompte) {
    const g = groupe(type), c = (g && (cfg || {})[g.id]) || {}, moi = propre(emailCompte);
    const expediteur = c.expediteur || moi;
    const partage = !!c.expediteur && c.expediteur !== moi;
    return { groupe: g ? g.id : '', expediteur, partage, repondreA: c.repondreA || '', bcc: [...new Set([c.cci, partage && c.copieMoi && moi].filter(Boolean))] };
  }

  return { GROUPES, groupe, normaliser, pour };
})();
if (typeof module !== 'undefined') module.exports = AdressesEnvoi;
