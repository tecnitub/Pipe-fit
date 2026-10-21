// Historique des achats et des prix : chaque achat ligne à ligne (commandes envoyées, lignes des factures fournisseurs,
// relevés du comptoir), regroupé par article (bibliothèque, sinon référence fournisseur, sinon désignation) avec prix
// mini, maxi, moyen (pondéré par les quantités), dernier prix et meilleur fournisseur. Une commande dont la facture a été
// saisie ligne à ligne n'est comptée qu'une fois, au prix facturé.
// Module commun navigateur / tests.
const HistoriqueAchats = (() => {
  const num = v => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, '')) || 0);
  const r2 = v => Math.round(v * 100) / 100, r4 = v => Math.round(v * 10000) / 10000;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\bdn (\d+)/g, 'dn$1').trim();
  const FRAIS = /\b(port|transport|emballage|frais|participation|eco ?participation|consigne|palette)\b/;

  // Lignes d'achat de toutes les sources ; articles : bibliothèque (pour retrouver l'article d'une ligne facturée)
  function lignes({ commandes = [], achats = [], articles = [] }, ressemblance) {
    const parRef = new Map();
    articles.forEach(a => [a.ref, a.refFournisseur].filter(Boolean).forEach(r => parRef.set(norm(r), a)));
    const cache = new Map();
    // Article d'une ligne : même référence, sinon désignation très proche (mêmes dimensions)
    const article = l => {
      if (l.articleId) return articles.find(a => a.id === l.articleId) || null;
      if (l.ref && parRef.has(norm(l.ref))) return parRef.get(norm(l.ref));
      if (!ressemblance || !l.designation) return null;
      const k = norm(l.designation);
      if (!cache.has(k)) { let best = null, s = 0; articles.forEach(a => { const x = ressemblance(a.designation, l.designation); if (x > s) { s = x; best = a; } }); cache.set(k, s >= 0.75 ? best : null); }
      return cache.get(k);
    };
    const out = [];
    const ajouter = (l, base) => {
      const qte = num(l.qte), pu = num(l.pu) || (qte ? num(l.montantHT) / qte : 0);
      if (!(qte > 0) || !(pu > 0) || FRAIS.test(norm(l.designation))) return;
      const a = article({ articleId: l.articleId, ref: l.refFournisseur || l.reference || l.ref, designation: l.designation });
      const ref = l.refFournisseur || l.reference || l.ref || '';
      out.push({ ...base, articleId: a ? a.id : '', designation: a ? a.designation : String(l.designation || '').trim(), ref: a ? a.ref || ref : ref, refFournisseur: ref, unite: (a && a.unite) || l.unite || '',
        famille: (a && a.famille) || '', qte, pu: r4(pu), montant: r2(qte * pu), cle: a ? `a:${a.id}` : ref ? `r:${norm(ref)}` : `d:${norm(l.designation)}|${norm(l.unite)}`,
        affaireId: l.affaireId || base.affaireId || '' });
    };
    // Factures saisies ligne à ligne : prix réellement payés ; leurs commandes ne sont pas recomptées
    const commandesFacturees = new Set();
    achats.forEach(f => {
      if (!(f.lignes || []).length) return;
      (f.imputations || []).forEach(i => { if (i.commandeId) commandesFacturees.add(i.commandeId); });
      const chantierUnique = [...new Set((f.imputations || []).map(i => i.affaireId).filter(Boolean))];
      const sens = num(f.montantHT) < 0 ? -1 : 1;
      if (sens < 0) return; // avoirs : hors analyse des prix
      f.lignes.forEach(l => ajouter(l, { date: l.dateBl || f.date || '', fournisseurId: f.fournisseurId, source: l.bl ? 'comptoir' : 'facture', docId: f.id, doc: f.numeroFournisseur || f.ref || '', bl: l.bl || '',
        affaireId: l.affaireId || (chantierUnique.length === 1 ? chantierUnique[0] : '') }));
    });
    commandes.filter(c => !['Brouillon', 'Annulée'].includes(c.statut) && !commandesFacturees.has(c.id))
      .forEach(c => (c.lignes || []).forEach(l => ajouter(l, { date: c.date || '', fournisseurId: c.fournisseurId, source: 'commande', docId: c.id, doc: c.numero || '', affaireId: c.affaireId || '' })));
    return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  // Synthèse par article selon les filtres { annee, fournisseurId, q }
  function synthese(toutes, { annee = '', fournisseurId = '', q = '' } = {}) {
    const n = norm(q);
    const l = toutes.filter(x => (!annee || String(x.date).startsWith(annee)) && (!fournisseurId || x.fournisseurId === fournisseurId)
      && (!n || norm(`${x.designation} ${x.ref} ${x.refFournisseur} ${x.famille}`).includes(n)));
    const par = new Map();
    l.forEach(x => { const g = par.get(x.cle) || { cle: x.cle, articleId: x.articleId, designation: x.designation, ref: x.ref, unite: x.unite, famille: x.famille, achats: [] }; g.achats.push(x); par.set(x.cle, g); });
    const articles = [...par.values()].map(g => {
      const qte = g.achats.reduce((t, x) => t + x.qte, 0), montant = g.achats.reduce((t, x) => t + x.montant, 0);
      const pus = g.achats.map(x => x.pu), dernier = g.achats[g.achats.length - 1], premier = g.achats[0];
      const fourn = new Map();
      g.achats.forEach(x => { const f = fourn.get(x.fournisseurId) || { fournisseurId: x.fournisseurId, qte: 0, montant: 0, nb: 0 }; f.qte += x.qte; f.montant += x.montant; f.nb++; fourn.set(x.fournisseurId, f); });
      const parFournisseur = [...fourn.values()].map(f => ({ ...f, montant: r2(f.montant), moyen: r4(f.montant / f.qte) })).sort((a, b) => a.moyen - b.moyen);
      const moyen = qte ? montant / qte : 0;
      return { ...g, nb: g.achats.length, qte: r2(qte), montant: r2(montant), min: Math.min(...pus), max: Math.max(...pus), moyen: r4(moyen), dernier: dernier.pu, dateDernier: dernier.date,
        fournisseurDernier: dernier.fournisseurId, evolution: premier.pu ? r2((dernier.pu / premier.pu - 1) * 100) : 0, ecart: Math.min(...pus) ? r2((Math.max(...pus) / Math.min(...pus) - 1) * 100) : 0,
        parFournisseur, meilleur: parFournisseur[0], economie: r2(g.achats.reduce((t, x) => t + Math.max(0, x.pu - parFournisseur[0].moyen) * x.qte, 0)) };
    });
    const fournisseurs = new Map();
    l.forEach(x => { const f = fournisseurs.get(x.fournisseurId) || { fournisseurId: x.fournisseurId, montant: 0, nb: 0 }; f.montant += x.montant; f.nb++; fournisseurs.set(x.fournisseurId, f); });
    return { articles, lignes: l, total: r2(l.reduce((t, x) => t + x.montant, 0)), fournisseurs: [...fournisseurs.values()].map(f => ({ ...f, montant: r2(f.montant) })).sort((a, b) => b.montant - a.montant),
      annees: [...new Set(toutes.map(x => String(x.date).slice(0, 4)).filter(Boolean))].sort().reverse() };
  }
  return { lignes, synthese };
})();
if (typeof module !== 'undefined') module.exports = HistoriqueAchats;
