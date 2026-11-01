// Chiffrage d'un DPGF importé dans un devis : prix proposés depuis la bibliothèque d'articles (prix de vente) et
// l'historique des achats (dernier prix payé × coefficient de vente), lignes de variante / option / moins-value repérées
// (hors total de base), puis DPGF rempli au format d'origine (mêmes lignes, mêmes colonnes, prix unitaires et montants
// dans les colonnes du fichier, sous-totaux du fichier recalculés).
// Module commun navigateur / tests.
const DpgfPrix = (() => {
  const num = v => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')) || 0);
  const r2 = v => Math.round(v * 100) / 100;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  // Chapitre ou ligne de variante, d'option, de moins-value, de PSE : chiffré à part, hors total de base
  const VARIANTE = /\b(?:variantes?|options?|moins[- ]?values?|plus[- ]?values?|pse|prestations? supplementaires? eventuelles?)\b/;
  const estVariante = t => VARIANTE.test(norm(t));
  // Lignes « Sous-total », « Total » du fichier
  const TOTAL = /^(sous[\s-]*total|total|montant total|t\s*\.?\s*v\s*\.?\s*a|net a payer|report|a reporter|recapitulatif)/;

  // Prix proposé pour une ligne du DPGF :
  // - article de la bibliothèque le plus ressemblant (prix de vente, coût de revient) ;
  // - sinon article de l'historique des achats (dernier prix payé, prix de vente = coût × coefficient).
  // synthese : HistoriqueAchats.synthese(...).articles ; ressemblance : Rapprochement.ressemblance
  function proposer(designation, { articles = [], achats = [], ressemblance, coef = 1.3, seuil = 0.5 } = {}) {
    if (!ressemblance || !String(designation || '').trim()) return null;
    let best = null;
    articles.forEach(a => {
      if (!(num(a.prixVente) > 0 || num(a.coutRevient) > 0)) return;
      const s = ressemblance(a.designation, designation);
      if (s >= seuil && (!best || s > best.score)) best = { source: 'bibliothèque', score: s, articleId: a.id, designation: a.designation, unite: a.unite || '', pu: num(a.prixVente) || r2(num(a.coutRevient) * coef), cout: num(a.coutRevient), poids: num(a.poidsUnitaire) };
    });
    if (best) return { ...best, score: r2(best.score) };
    achats.forEach(g => {
      const cout = num(g.dernier) || num(g.moyen);
      if (!(cout > 0)) return;
      const s = ressemblance(g.designation, designation);
      if (s >= seuil && (!best || s > best.score)) best = { source: 'achats', score: s, articleId: g.articleId || '', designation: g.designation, unite: g.unite || '', pu: r2(cout * coef), cout, poids: 0 };
    });
    return best ? { ...best, score: r2(best.score) } : null;
  }

  // DPGF au format d'origine : lignes du fichier recopiées ; prix unitaire et montant écrits dans leurs colonnes (ajoutées
  // en bout de ligne si le fichier n'en a pas) ; lignes « Sous-total » / « Total » du fichier recalculées
  // source : { rows, entete, map } ; prix : Map(index de ligne du fichier → { pu, montant, option })
  function remplirOrigine(source, prix) {
    const rows = (source.rows || []).map(r => (r || []).slice()), map = { ...(source.map || {}) }, h = source.entete || 0;
    const largeur = Math.max(...rows.map(r => r.length), 1);
    if (map.pu === undefined) { map.pu = largeur; (rows[h] = rows[h] || [])[map.pu] = 'Prix unitaire HT'; }
    if (map.montant === undefined) { map.montant = Math.max(largeur, map.pu + 1); rows[h][map.montant] = 'Montant HT'; }
    let depuisSousTotal = 0, base = 0, variantes = 0;
    rows.forEach((r, i) => {
      if (i <= h) return;
      const p = prix.get(i), des = norm(r[map.designation]);
      if (p) {
        r[map.pu] = { v: r2(p.pu), s: 'eur' };
        r[map.montant] = { v: r2(p.montant), s: p.option ? 'muted' : 'eur' };
        if (p.option) variantes += p.montant; else { base += p.montant; depuisSousTotal += p.montant; }
        return;
      }
      if (TOTAL.test(des)) {
        const total = /^sous/.test(des) ? depuisSousTotal : base;
        r[map.montant] = { v: r2(total), s: 'boldeur' };
        if (/^sous/.test(des)) depuisSousTotal = 0;
      }
    });
    return { rows, base: r2(base), variantes: r2(variantes), cols: map };
  }
  return { proposer, remplirOrigine, estVariante, VARIANTE };
})();
if (typeof module !== 'undefined') module.exports = DpgfPrix;
