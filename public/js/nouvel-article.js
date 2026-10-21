// Fourniture commandée hors bibliothèque : fiche article proposée à partir de la ligne de commande (désignation, réf.
// fournisseur, unité, prix d'achat), famille devinée (article le plus ressemblant, sinon mots-clés), prix de vente au
// coefficient habituel de la famille, et article déjà présent signalé (même référence ou désignation très proche).
// Module commun navigateur / tests ; ressemblance(a, b) -> 0..1 (règles du rapprochement des factures).
const NouvelArticle = (() => {
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const n = v => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')) || 0);
  const r2 = v => Math.round(v * 100) / 100;
  const MOTS = [[/\btubes?\b|tuyau/, 'Tubes'], [/coude|\bte\b|\btes\b|bride|reduction|raccord|manchon|mamelon|union|piquage|fond bombe|clamp/, 'Raccords'],
    [/vanne|robinet|clapet|purgeur|filtre|soupape|manometre|thermometre|detendeur|compteur/, 'Robinetterie'], [/collier|support|rail|console|tige filetee|equerre|patte/, 'Supportage'],
    [/joint|boulon|vis\b|ecrou|goujon|rondelle|cheville|teflon/, 'Visserie et joints'], [/calorifuge|isolant|armaflex|laine|coquille/, 'Calorifuge'], [/location/, 'Location']];
  const COEF_DEFAUT = 1.35;
  // Coefficient de vente médian des articles d'une famille
  function coefFamille(famille, articles) {
    const c = articles.filter(a => (!famille || a.famille === famille) && n(a.coutRevient) > 0 && n(a.prixVente) > 0).map(a => n(a.prixVente) / n(a.coutRevient)).sort((x, y) => x - y);
    return c.length ? c[Math.floor(c.length / 2)] : COEF_DEFAUT;
  }
  function proposer(l, articles, ressemblance, fournisseurId = '') {
    const ref = String(l.refFournisseur || l.reference || '').trim();
    let proche = null, score = 0;
    articles.forEach(a => {
      const s = ref && [a.ref, a.refFournisseur].filter(Boolean).some(r => norm(r) === norm(ref)) ? 1 : ressemblance ? ressemblance(a.designation, l.designation) : 0;
      if (s > score) { score = s; proche = a; }
    });
    const mot = MOTS.find(([re]) => re.test(norm(l.designation)));
    const famille = proche && score >= 0.5 ? proche.famille || '' : mot ? mot[1] : '';
    const pu = n(l.pu);
    return { designation: String(l.designation || '').trim(), ref, refFournisseur: ref, unite: l.unite || 'u', famille, sousFamille: proche && score >= 0.75 ? proche.sousFamille || '' : '',
      coutRevient: r2(pu), prixVente: pu ? r2(pu * coefFamille(famille, articles)) : 0, fournisseurId, existant: proche && score >= 0.8 ? { id: proche.id, designation: proche.designation, score: Math.round(score * 100) } : null };
  }
  return { proposer, coefFamille, COEF_DEFAUT };
})();
if (typeof module !== 'undefined') module.exports = NouvelArticle;
