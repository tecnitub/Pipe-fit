// Recherche dans la bibliothèque de fournitures et rangement par famille / sous-famille.
// Commun à la bibliothèque, au choix du matériel sur le téléphone et aux tests (module navigateur / Node).
// Recherche tolérante : sans accents ni majuscules, mots dans n'importe quel ordre, « dn50 » = « DN 50 » = « DN50 »,
// « 316 » trouve « 316L », et les mots peuvent viser la référence, la désignation, la famille, la sous-famille ou le fournisseur.
const RechercheArticles = (() => {
  const SANS = 'Non classé';
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/×/g, 'x').replace(/\b(dn|pn|ep|sch)\s+(?=\d)/g, '$1').replace(/[^a-z0-9.,/x]+/g, ' ').trim();
  const mots = q => norm(q).split(' ').filter(Boolean);
  const texte = (a, fournisseur) => norm([a.ref, a.designation, a.famille, a.sousFamille, fournisseur].filter(Boolean).join(' '));
  const familleDe = a => String(a.famille || '').trim() || SANS;
  const sousFamilleDe = a => String(a.sousFamille || '').trim();

  // Une faute de frappe (lettre en trop, en moins ou différente) entre deux mots
  function presque(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, e = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++e > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return e + (a.length - i) + (b.length - j) <= 1;
  }
  // Score d'un article pour une recherche (0 : ne correspond pas). Tous les mots doivent être trouvés.
  function score(a, q, fournisseur, flou = false) {
    const m = mots(q);
    if (!m.length) return 1;
    const t = texte(a, fournisseur), ref = norm(a.ref), des = norm(a.designation), debuts = ` ${t}`;
    let s = 0;
    for (const w of m) {
      // Un nombre se cherche depuis son début : « 50 » trouve DN50 mais pas DN150 ; « 316 » trouve 316L
      const trouve = /^\d/.test(w) ? new RegExp(`(^|[^0-9.,])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t) : t.includes(w);
      if (!trouve) {
        // Mot de 4 lettres ou plus avec une faute de frappe : « vane » trouve « vanne », « bridde » trouve « bride »
        if (flou && w.length >= 4 && t.split(' ').some(x => x[0] === w[0] && presque(w, x))) { s += 0.5; continue; }
        return 0;
      }
      s += 1 + (ref.startsWith(w) || ref === w ? 4 : 0) + (debuts.includes(` ${w}`) ? 2 : 0) + (new RegExp(`(^| )${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(des) ? 2 : 0);
    }
    return s;
  }
  // Articles correspondant à la recherche et aux filtres de rangement, les plus pertinents d'abord ;
  // les fautes de frappe ne sont tolérées que si la recherche exacte ne trouve rien
  function filtrer(articles, { q = '', famille = '', sousFamille = '', fournisseurDe = () => '' } = {}) {
    const rang = articles.filter(a => (!famille || familleDe(a) === famille) && (!sousFamille || sousFamilleDe(a) === sousFamille));
    let res = rang.map(a => ({ a, s: score(a, q, fournisseurDe(a)) })).filter(x => x.s > 0);
    if (!res.length) res = rang.map(a => ({ a, s: score(a, q, fournisseurDe(a), true) })).filter(x => x.s > 0);
    return res
      .sort((x, y) => (mots(q).length ? y.s - x.s : 0) || familleDe(x.a).localeCompare(familleDe(y.a)) || sousFamilleDe(x.a).localeCompare(sousFamilleDe(y.a)) || String(x.a.designation || '').localeCompare(String(y.a.designation || '')))
      .map(x => x.a);
  }
  // Arbre des familles et sous-familles avec le nombre d'articles (« Non classé » en dernier)
  function arbre(articles) {
    const f = new Map();
    articles.forEach(a => {
      const fa = familleDe(a), sf = sousFamilleDe(a);
      const n = f.get(fa) || { nom: fa, n: 0, sous: new Map() };
      n.n++;
      if (sf) n.sous.set(sf, (n.sous.get(sf) || 0) + 1);
      f.set(fa, n);
    });
    return [...f.values()].sort((x, y) => (x.nom === SANS) - (y.nom === SANS) || x.nom.localeCompare(y.nom))
      .map(x => ({ nom: x.nom, n: x.n, sous: [...x.sous.entries()].sort((p, q) => p[0].localeCompare(q[0])).map(([nom, n]) => ({ nom, n })) }));
  }
  return { SANS, norm, score, filtrer, arbre, familleDe, sousFamilleDe };
})();
if (typeof module !== 'undefined') module.exports = RechercheArticles;
