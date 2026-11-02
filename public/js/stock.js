// Stock de Tecnitub et QR codes : chaque article stocké (bibliothèque) et chaque outil du parc porte une étiquette QR.
// Scanner l'étiquette ouvre sa fiche dans Pipe-Fit : sortie vers un chantier (consommation du chantier au prix de la
// bibliothèque), retour au stock, prise ou retour d'un outil ; au bureau : entrée en stock, inventaire, demande de prix
// de réassort. Quantité en stock = dernier inventaire + entrées − sorties depuis. Module pur (navigateur, serveur, tests).
const Stock = (() => {
  const n = v => { const x = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
  const r2 = v => Math.round(v * 1000) / 1000;

  /* ---------- QR codes ---------- */
  // Contenu du QR : adresse de Pipe-Fit (l'appareil photo du téléphone ouvre directement la fiche), lue aussi par le
  // scanner de l'appli ; « PF:A:<id> » (article) et « PF:M:<id> » (outil) acceptés pour des étiquettes déjà imprimées
  const lien = (origine, type, id) => `${String(origine || '').replace(/[#?].*$/, '').replace(/\/+$/, '')}/#/scan/${type}/${id}`;
  function lire(texte) {
    const t = String(texte || '').trim();
    const m = /#\/scan\/([am])\/([\w-]{1,64})/i.exec(t) || /^PF[:-]([AM])[:-]([\w-]{1,64})$/i.exec(t);
    return m ? { type: m[1].toLowerCase(), id: m[2] } : null;
  }

  /* ---------- Quantités ---------- */
  const gere = a => !!(a && (a.stockGere === true || /^oui$/i.test(String(a.stockGere || ''))));
  // Ordre des mouvements : date du mouvement, puis heure d'enregistrement
  const cle = r => `${String(r.date || '').slice(0, 10)} ${r._at || r.cree || ''}`;
  // Mouvements d'un article : sorties / retours (consommations « stock »), entrées et inventaires (mouvementsStock)
  function historique(articleId, consommations, mouvements) {
    const out = [
      ...(consommations || []).filter(c => c.stock && c.articleId === articleId).map(c => ({ type: n(c.qte) >= 0 ? 'sortie' : 'retour', qte: -n(c.qte), date: c.date, affaireId: c.affaireId || '', userId: c.userId || '', note: c.note || '', _at: c._at, id: c.id, col: 'consommations' })),
      ...(mouvements || []).filter(m => m.articleId === articleId).map(m => ({ type: m.type === 'inventaire' ? 'inventaire' : 'entree', qte: n(m.qte), date: m.date, affaireId: '', userId: m.userId || '', note: m.note || '', _at: m._at, id: m.id, col: 'mouvementsStock', commandeId: m.commandeId || '' })),
    ];
    return out.sort((a, b) => cle(a).localeCompare(cle(b)));
  }
  // Quantité : le dernier inventaire fixe la quantité, les mouvements suivants s'y ajoutent
  function quantite(articleId, consommations, mouvements) {
    let q = 0;
    historique(articleId, consommations, mouvements).forEach(m => { q = m.type === 'inventaire' ? m.qte : q + m.qte; });
    return r2(q);
  }
  // État : rupture, à réassortir (sous le minimum), en stock
  const etat = (a, q) => (q <= 0 ? 'rupture' : n(a.stockMini) > 0 && q <= n(a.stockMini) ? 'reassort' : 'ok');
  const ETATS = { rupture: ['b-bad', 'Rupture'], reassort: ['b-warn', 'À réassortir'], ok: ['b-ok', 'En stock'] };
  // Quantité à commander : la quantité de réassort saisie, sinon de quoi revenir à deux fois le minimum
  const aCommander = (a, q) => Math.max(1, n(a.stockReassort) || Math.ceil(Math.max(n(a.stockMini) * 2 - q, n(a.stockMini) || 1)));
  // Articles gérés en stock avec leur quantité et leur état
  function etatStock(articles, consommations, mouvements) {
    return (articles || []).filter(gere).map(a => { const q = quantite(a.id, consommations, mouvements); return { a, q, etat: etat(a, q), valeur: r2(Math.max(0, q) * n(a.coutRevient)) }; });
  }
  const aReassortir = (articles, consommations, mouvements) => etatStock(articles, consommations, mouvements).filter(x => x.etat !== 'ok').map(x => ({ ...x, commande: aCommander(x.a, x.q) }));
  // Lignes et fournisseurs habituels d'une demande de prix de réassort
  function demandeReassort(liste) {
    return { lignes: liste.map(x => ({ articleId: x.a.id, designation: x.a.designation, unite: x.a.unite || 'u', qte: x.commande || aCommander(x.a, x.q) })),
      fournisseurs: [...new Set(liste.map(x => x.a.fournisseurId).filter(Boolean))].map(entrepriseId => ({ entrepriseId, statut: 'À consulter' })) };
  }
  // Sorties du stock d'un chantier : quantité nette et valeur au prix d'achat
  function sortiesChantier(affaireId, consommations, articles) {
    const parArt = new Map();
    (consommations || []).filter(c => c.stock && c.affaireId === affaireId).forEach(c => {
      const a = (articles || []).find(x => x.id === c.articleId) || {}, x = parArt.get(c.articleId) || { articleId: c.articleId, designation: c.designation || a.designation, unite: c.unite || a.unite, qte: 0, cout: 0 };
      x.qte = r2(x.qte + n(c.qte)); x.cout = r2(x.cout + n(c.qte) * n(c.cout || a.coutRevient)); parArt.set(c.articleId, x);
    });
    return [...parArt.values()].filter(x => x.qte);
  }
  // Sortie (ou retour, quantité négative) vers un chantier : enregistrement « consommations »
  function sortie(article, { qte, affaireId, userId, date, note = '' }) {
    const q = n(qte);
    if (!q) throw new Error('Quantité à indiquer');
    if (!affaireId) throw new Error('Chantier à choisir');
    return { articleId: article.id, designation: article.designation, unite: article.unite || 'u', qte: q, pu: n(article.prixVente), cout: n(article.coutRevient), affaireId, userId: userId || '', date, stock: true, note: String(note).slice(0, 200) };
  }

  /* ---------- Panier de sortie ---------- */
  // Plusieurs articles scannés à la suite (chargement de la camionnette), sortis ensemble pour un chantier
  function panierAjouter(panier, articleId, qte) {
    const p = { affaireId: (panier && panier.affaireId) || '', lignes: [...((panier && panier.lignes) || [])].map(l => ({ ...l })) };
    const q = n(qte), l = p.lignes.find(x => x.articleId === articleId);
    if (l) l.qte = r2(l.qte + q); else if (q) p.lignes.push({ articleId, qte: r2(q) });
    p.lignes = p.lignes.filter(x => x.qte > 0);
    return p;
  }
  // Enregistrements « consommations » du panier ; articles introuvables ignorés
  function panierSorties(panier, articles, { affaireId, userId, date }) {
    const ls = ((panier && panier.lignes) || []).filter(l => n(l.qte) > 0);
    if (!ls.length) throw new Error('Panier vide');
    return ls.map(l => { const a = (articles || []).find(x => x.id === l.articleId); return a ? sortie(a, { qte: l.qte, affaireId, userId, date, note: 'Panier de sortie' }) : null; }).filter(Boolean);
  }

  /* ---------- Outillage du parc ---------- */
  // Prise d'un outil (pour soi, sur un chantier) ou retour au dépôt : nouvelle affectation et ligne d'historique
  function affecter(materiel, { action, userId = '', affaireId = '', date, par = '' }) {
    if (!['prendre', 'rendre'].includes(action)) throw new Error('Action inconnue');
    const affectation = action === 'rendre' ? { userId: '', affaireId: '', depuis: date } : { userId, affaireId, depuis: date };
    return { ...materiel, affectation, historique: [...(materiel.historique || []), { date, userId: affectation.userId, affaireId: affectation.affaireId, par, scan: true }] };
  }
  return { panierAjouter, panierSorties, lien, lire, gere, historique, quantite, etat, ETATS, aCommander, etatStock, aReassortir, demandeReassort, sortiesChantier, sortie, affecter };
})();
if (typeof module !== 'undefined') module.exports = Stock;
