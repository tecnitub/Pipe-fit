// Comptes de charges des achats : chaque montant imputé est réparti selon la famille des articles achetés (lignes de la
// commande rapprochée, sinon lignes de la facture), avec le compte choisi pour la famille, sinon le compte proposé par
// le plan comptable (location, sous-traitance, outillage, transport…), sinon le compte de charge du fournisseur, sinon le
// compte d'achats. Module commun navigateur / tests.
const ComptesCharges = (() => {
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const n = v => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, '')) || 0);
  // Compte proposé d'après le nom de la famille
  const PROPOSES = [[/locat/, '613500'], [/sous trait|controle|radiograph|essai/, '611000'], [/outillage|consommable|epi\b/, '606300'], [/transport|livraison|port\b/, '624100'], [/interim|personnel/, '621100']];
  const propose = famille => (PROPOSES.find(([re]) => re.test(norm(famille))) || [])[1] || '';
  // Libellés du plan comptable général (FEC : CompteLib)
  const PCG = { 601: 'Achats stockés - matières et fournitures', 602: 'Achats stockés - autres approvisionnements', 604: 'Achats d\'études et prestations de services', 606: 'Achats non stockés de matières et fournitures',
    607: 'Achats de marchandises', 611: 'Sous-traitance générale', 613: 'Locations', 615: 'Entretien et réparations', 621: 'Personnel extérieur à l\'entreprise', 622: 'Rémunérations d\'intermédiaires et honoraires', 624: 'Transports de biens', 625: 'Déplacements, missions et réceptions' };
  const libelle = compte => PCG[String(compte).slice(0, 3)] || '';

  // Famille d'une ligne : article de la bibliothèque (id, référence), sinon aucune
  function familleLigne(l, articles) {
    const a = (l.articleId && articles.find(x => x.id === l.articleId)) || (l.reference || l.ref || l.refFournisseur ? articles.find(x => [x.ref, x.refFournisseur].filter(Boolean).some(r => norm(r) === norm(l.reference || l.ref || l.refFournisseur))) : null);
    return a ? a.famille || '' : '';
  }
  // compteDe(famille) : compte d'une famille ; lignes : [{ famille, poids }] -> [{ compte, part }]
  function parts(lignes, compteDe, defaut) {
    const par = new Map();
    lignes.forEach(l => { if (l.poids > 0) { const c = compteDe(l.famille) || defaut; par.set(c, (par.get(c) || 0) + l.poids); } });
    const tot = [...par.values()].reduce((t, v) => t + v, 0);
    return tot > 0 ? [...par].map(([compte, p]) => ({ compte, part: p / tot })) : [{ compte: defaut, part: 1 }];
  }
  // Répartition d'un montant au centime : la dernière part prend l'arrondi
  function repartir(montant, ps) {
    let reste = Math.round(montant * 100);
    return ps.map((p, i) => { const c = i === ps.length - 1 ? reste : Math.round(montant * p.part * 100); reste -= c; return { compte: p.compte, montant: c / 100 }; }).filter(x => x.montant);
  }
  // Comptes d'une imputation (ou du reste non ventilé si imputation = null)
  // ctx : { achat, commande (rapprochée), articles, comptesFamilles: { famille: compte }, compteFournisseur, compteAchats }
  function comptes(montant, imputation, ctx) {
    const defaut = ctx.compteFournisseur || ctx.compteAchats, explicite = ctx.comptesFamilles || {};
    const compteDe = f => (f ? explicite[f] || propose(f) : '');
    let lignes;
    if (ctx.commande) lignes = (ctx.commande.lignes || []).map(l => ({ famille: familleLigne(l, ctx.articles), poids: n(l.qte) * n(l.pu) }));
    else {
      const ls = (ctx.achat.lignes || []).filter(l => !imputation || !l.affaireId || l.affaireId === imputation.affaireId);
      lignes = ls.map(l => ({ famille: familleLigne(l, ctx.articles), poids: n(l.montantHT) || n(l.qte) * n(l.pu) }));
    }
    return repartir(montant, parts(lignes, compteDe, defaut));
  }
  return { comptes, propose, libelle, familleLigne };
})();
if (typeof module !== 'undefined') module.exports = ComptesCharges;
