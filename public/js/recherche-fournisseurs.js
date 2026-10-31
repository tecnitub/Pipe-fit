// Recherche des fournisseurs à consulter (demande de prix) : mots cherchés dans le nom, le secteur, la ville, le
// département, les contacts et les familles d'articles qu'ils livrent ; filtres secteur, famille, département, « déjà
// commandé ». Les fournisseurs habituels des articles de la demande, puis les plus commandés, passent devant.
// Module commun navigateur / tests.
const RechercheFournisseurs = (() => {
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Fiche de recherche de chaque fournisseur (familles livrées d'après la bibliothèque, commandes depuis une date)
  function indexer({ fournisseurs = [], articles = [], commandes = [], contacts = [], depuis = '' }) {
    return fournisseurs.map(e => {
      const arts = articles.filter(a => a.fournisseurId === e.id), cdes = commandes.filter(c => c.fournisseurId === e.id && (c.date || '') >= depuis && c.statut !== 'Brouillon');
      const adr = e.adresses || [], deps = [...new Set(adr.map(s => String(s.cp || '').slice(0, 2)).filter(x => /^\d[\dAB]$/.test(x)))];
      return { e, familles: [...new Set(arts.map(a => a.famille).filter(Boolean))], articles: new Set(arts.map(a => a.id)), deps, villes: [...new Set(adr.map(s => s.ville).filter(Boolean))],
        nbCommandes: cdes.length, derniere: cdes.map(c => c.date).sort().pop() || '',
        texte: norm([e.nom, e.secteur, e.notes, e.email, ...adr.flatMap(s => [s.libelle, s.ville, s.cp]), ...contacts.filter(c => c.entrepriseId === e.id).map(c => `${c.prenom || ''} ${c.nom || ''} ${c.fonction || ''}`),
          ...arts.map(a => `${a.famille || ''} ${a.sousFamille || ''}`)].join(' ')) };
    });
  }

  // criteres : { q, secteur, famille, dep, dejaCommande } ; articlesDemande : articles des lignes de la demande de prix
  function filtrer(fiches, criteres = {}, articlesDemande = []) {
    const mots = norm(criteres.q).split(/\s+/).filter(Boolean);
    return fiches
      .filter(f => (!criteres.secteur || f.e.secteur === criteres.secteur) && (!criteres.famille || f.familles.includes(criteres.famille))
        && (!criteres.dep || f.deps.includes(criteres.dep)) && (!criteres.dejaCommande || f.nbCommandes > 0) && mots.every(m => f.texte.includes(m)))
      .map(f => ({ ...f, habituel: articlesDemande.filter(id => f.articles.has(id)).length, nomCommence: mots.length ? norm(f.e.nom).startsWith(mots[0]) : false }))
      .sort((x, y) => (y.habituel - x.habituel) || (y.nomCommence - x.nomCommence) || (y.nbCommandes - x.nbCommandes) || x.e.nom.localeCompare(y.e.nom));
  }
  return { indexer, filtrer, norm };
})();
if (typeof module !== 'undefined') module.exports = RechercheFournisseurs;
