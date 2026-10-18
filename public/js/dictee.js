// Liste de matériel dictée (ou tapée) : « 3 coudes de 50, deux brides DN100 et 12 mètres de tube inox 50 »
// -> lignes { qte, unite, texte, recherche } puis rapprochement avec la bibliothèque (RechercheArticles).
// Module commun navigateur / Node (tests).
const DicteeMateriel = (() => {
  const R = typeof RechercheArticles !== 'undefined' ? RechercheArticles : require('./articles-recherche');
  const sansAccents = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

  /* ---------- Nombres écrits en lettres ---------- */
  const UNITES_N = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16 };
  const DIZAINES = { vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };
  const estMotNombre = w => w.split('-').every(p => p === 'et' || p in UNITES_N || p in DIZAINES || /^(cents?|quatre|vingts?)$/.test(p)) || w in UNITES_N || w in DIZAINES || ['cent', 'cents', 'mille', 'demi', 'quatre-vingt', 'quatre-vingts'].includes(w);
  // Suite de mots-nombres à partir de i -> { n, fin } (fin : indice après le nombre), ou null
  function lireNombre(t, i) {
    const w = t[i];
    if (/^\d+([.,]\d+)?$/.test(w)) return { n: Number(w.replace(',', '.')), fin: i + 1 };
    if (/^\d+\/\d+$/.test(w)) { const [a, b] = w.split('/').map(Number); return { n: a / b, fin: i + 1 }; }
    if (!estMotNombre(w) || w === 'demi') return null;
    let total = 0, courant = 0, j = i, lu = false;
    while (j < t.length) {
      let x = t[j];
      if (x === 'et' && lu && (UNITES_N[t[j + 1]] === 1 || t[j + 1] === 'onze')) { j++; continue; } // vingt et un
      if (x === 'quatre' && /^vingts?$/.test(t[j + 1] || '')) { courant += 80; j += 2; lu = true; continue; }
      const parts = x.split('-');
      if (parts.length > 1 && parts.every(p => p in UNITES_N || p in DIZAINES || p === 'et' || p === 'quatre' || /^vingts?$/.test(p))) {
        parts.filter(p => p !== 'et').forEach((p, k, a) => { if (p === 'quatre' && /^vingts?$/.test(a[k + 1] || '')) return; courant += p === 'vingt' && a[k - 1] === 'quatre' ? 80 : (UNITES_N[p] ?? DIZAINES[p]); });
        j++; lu = true; continue;
      }
      if (x in DIZAINES) { courant += DIZAINES[x]; } else if (x in UNITES_N) { if (lu && UNITES_N[x] >= 10 && courant % 10 === 0 && courant >= 60) courant += UNITES_N[x]; else if (lu && courant % 10 !== 0) break; else courant += UNITES_N[x]; } else if (x === 'cent' || x === 'cents') { courant = (courant || 1) * 100; } else if (x === 'mille') { total += (courant || 1) * 1000; courant = 0; } else break;
      j++; lu = true;
    }
    return lu ? { n: total + courant, fin: j } : null;
  }

  /* ---------- Unités, diamètres, mots vides ---------- */
  const UNITES = [
    [/^(metres?|m|ml|metres? lineaires?)$/, 'ml'], [/^(m2|metres? carres?)$/, 'm²'], [/^(pieces?|pcs?|unites?|u)$/, 'u'], [/^(kilos?|kg|kilogrammes?)$/, 'kg'],
    [/^(litres?|l)$/, 'l'], [/^(barres?|longueurs?)$/, 'barre'], [/^(boites?)$/, 'boîte'], [/^(sacs?)$/, 'sac'], [/^(rouleaux?)$/, 'rouleau'], [/^(cartons?)$/, 'carton'], [/^(heures?|h)$/, 'h'],
  ];
  const uniteDe = w => (UNITES.find(([re]) => re.test(w)) || [])[1];
  const DN = [8, 10, 15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500];
  const POUCES = { '1/4': 8, '3/8': 10, '1/2': 15, '3/4': 20, 1: 25, 1.25: 32, 1.5: 40, 2: 50, 2.5: 65, 3: 80, 4: 100, 5: 125, 6: 150, 8: 200, 10: 250, 12: 300 };
  const VIDES = new Set(['le', 'la', 'les', 'l', 'des', 'du', 'de', 'd', 'en', 'avec', 'pour', 'a', 'au', 'aux', 'il', 'me', 'faut', 'j', 'ai', 'on', 'a', 'mis', 'pose', 'posee', 'poses', 'utilise', 'utilises', 'aussi', 'encore', 'alors', 'euh', 'voila', 'ensuite', 'puis', 'plus', 'type', 'modele', 'environ', 'genre', 'sur', 'dans', 'qui', 'que', 'ca', 'cela', 'ce', 'cette', 'ces', 'mon', 'ma', 'mes', 'notre']);
  const SEPARATEURS = new Set(['et', 'puis', 'plus', 'ensuite', 'avec', 'virgule', 'point']);
  // Après ces mots, un nombre est une caractéristique (« DN 50 », « coude de 50 »), pas une quantité
  const AVANT_CARACT = new Set(['dn', 'pn', 'de', 'd', 'diametre', 'o', 'x', 'sur', 'en', 'ep', 'epaisseur', 'sch', 'numero', 'n', 'no', 'a', 'type', 'serie', 'classe', 'taille', 'calibre']);
  const singulier = w => (/^\d/.test(w) || w.length < 3 ? w : /eaux$/.test(w) ? w.slice(0, -1) : /aux$/.test(w) ? `${w.slice(0, -3)}al` : /eux$/.test(w) ? w.slice(0, -1) : /[^su]s$/.test(w) ? w.slice(0, -1) : w);

  // Découpe le texte en mots ; les séparateurs explicites (retour à la ligne, ; , .) deviennent « | »
  function mots(texte) {
    return String(texte || '').toLowerCase()
      .replace(/[\n;]+|,(?!\d)|\.(?!\d)/g, ' | ')
      .replace(/(\d)\s*(?:"|''|pouces?)/g, '$1 pouce').replace(/mètres?/g, 'metre').replace(/[’']/g, ' ').replace(/[^a-z0-9à-ÿœæ|/.,×x-]+/g, ' ')
      .replace(/(\d)(mm|ml|m|kg|l|u)\b/g, '$1 $2').replace(/\b(dn|pn)(\d)/g, '$1 $2')
      .split(/\s+/).filter(Boolean);
  }

  // Texte -> lignes { qte, unite, texte (tel que dicté), recherche (pour la bibliothèque) }
  function analyser(texte) {
    const t0 = mots(texte), t = t0.map(sansAccents), lignes = [];
    let cur = null;
    const fermer = () => { if (cur && cur.m.length) lignes.push(cur); cur = null; };
    for (let i = 0; i < t.length; i++) {
      const w = t[i];
      if (w === '|') { fermer(); continue; }
      const nb = lireNombre(t, i);
      if (nb) {
        const suite = t[nb.fin], prec = t[i - 1];
        // Nombre suivi de « pouce » ou d'une demi : caractéristique (2 pouces, 1 pouce 1/2)
        if (suite === 'pouce') {
          let p = nb.n; let fin = nb.fin + 1;
          if (/^\d\/\d$/.test(t[fin] || '')) { const [a, b] = t[fin].split('/').map(Number); p += a / b; fin++; } else if (t[fin] === 'et' && t[fin + 1] === 'demi') { p += 0.5; fin += 2; }
          const dn = POUCES[p] || POUCES[String(t[i])];
          if (!cur) cur = { qte: 1, unite: '', m: [], implicite: true };
          cur.m.push(dn ? `dn${dn}` : `${p} pouce`); i = fin - 1; continue;
        }
        if (['mm', 'bar', 'bars', 'degres', 'kw', 'w', 'v', 'mbar'].includes(suite)) { if (!cur) cur = { qte: 1, unite: '', m: [], implicite: true }; cur.m.push(`${nb.n}${suite === 'mm' ? 'mm' : ` ${suite}`}`); i = nb.fin; continue; }
        const u = uniteDe(suite || '');
        const dernier = cur && cur.m[cur.m.length - 1];
        // Deuxième diamètre (« réduction 100 50 ») ou fraction de pouce après la désignation (« union 3/4 »)
        if (!u && dernier && /^dn\d+$/.test(dernier) && DN.includes(nb.n) && nb.n < Number(dernier.slice(2)) && /^\d/.test(prec)) { cur.m.push(`x${nb.n}`); i = nb.fin - 1; continue; }
        if (!u && cur && cur.m.length && /^\d+\/\d+$/.test(w) && POUCES[w]) { cur.m.push(`dn${POUCES[w]}`); i = nb.fin - 1; continue; }
        // Quantité en fin d'article (« tube inox 50 douze mètres ») : rattachée à l'article en cours
        if (u && cur && cur.m.length && cur.implicite) { Object.assign(cur, { qte: nb.n, unite: u, implicite: false }); i = nb.fin; continue; }
        // Caractéristique : après DN, PN, « de », « x »… ou un diamètre nominal juste après la désignation (« coude 50 »)
        const motAvant = prec && /[a-z]/.test(prec) && !SEPARATEURS.has(prec);
        if (!u && cur && cur.m.length && (AVANT_CARACT.has(prec) || (DN.includes(nb.n) && motAvant))) {
          if (prec === 'de' || prec === 'd' || prec === 'dn' || prec === 'pn' || prec === 'o' || prec === 'diametre') cur.m.pop();
          cur.m.push(prec === 'pn' ? `pn${nb.n}` : ['x', 'ep', 'epaisseur', 'sch', 'numero', 'n', 'no', 'serie', 'classe', 'type'].includes(prec) || !DN.includes(nb.n) ? String(nb.n).replace('.', ',') : `dn${nb.n}`);
          i = nb.fin - 1; continue;
        }
        // Sinon : quantité au début d'un nouvel article (« un mètre cinquante » = 1,5 m)
        fermer();
        cur = { qte: nb.n, unite: '', m: [], implicite: false };
        i = nb.fin - 1;
        if (u) {
          cur.unite = u; i++;
          const reste = lireNombre(t, i + 1);
          if (u === 'ml' && reste && reste.n < 100 && ['de', 'd', '|', undefined].includes(t[reste.fin])) { cur.qte += reste.n / 100; i = reste.fin - 1; }
          if (t[i + 1] === 'de' || t[i + 1] === 'd') i++;
        }
        continue;
      }
      if (SEPARATEURS.has(w) && cur && cur.m.length && (lireNombre(t, i + 1) || estDebutArticle(t, i + 1))) { fermer(); continue; }
      if (w === 'demi' && cur && !cur.m.length) { cur.qte += 0.5; continue; }
      if (!cur) cur = { qte: 1, unite: '', m: [], implicite: true };
      cur.m.push(t0[i]);
    }
    fermer();
    return lignes.map(l => {
      const texteL = l.m.join(' ').replace(/\bdn(\d+)/g, 'DN$1').replace(/\bpn(\d+)/g, 'PN$1');
      return { qte: Math.round(l.qte * 1000) / 1000, unite: l.unite, texte: texteL, recherche: l.m.map(sansAccents).filter(x => !VIDES.has(x) && !SEPARATEURS.has(x)).map(singulier).join(' ') };
    }).filter(l => l.recherche);
  }
  // « un coude », « une vanne » après « et » : le mot suivant commence un nouvel article
  function estDebutArticle(t, i) { return ['un', 'une'].includes(t[i]); }

  /* ---------- Rapprochement avec la bibliothèque ---------- */
  // -> { statut: 'trouve' | 'choix' | 'absent', candidats: [articles], article }
  function rapprocher(ligne, articles, fournisseurDe = () => '') {
    const q = ligne.recherche;
    let liste = R.filtrer(articles, { q, fournisseurDe });
    let partiel = false;
    if (!liste.length) {
      // Recherche partielle : le plus de mots possible, le diamètre (DN) et les nombres obligatoires
      const ws = q.split(' ').filter(Boolean), obligatoires = ws.filter(w => /\d/.test(w));
      const notes = articles.map(a => ({ a, n: ws.filter(w => R.score(a, w, fournisseurDe(a), true) > 0).length, ok: obligatoires.every(w => R.score(a, w, fournisseurDe(a)) > 0) }))
        .filter(x => x.ok && x.n > 0);
      const max = Math.max(0, ...notes.map(x => x.n));
      if (max >= Math.max(1, Math.ceil(ws.length / 2))) { liste = notes.filter(x => x.n === max).map(x => x.a); partiel = true; }
    }
    if (!liste.length) return { statut: 'absent', candidats: [], article: null };
    const s = liste.slice(0, 2).map(a => R.score(a, q, fournisseurDe(a), true));
    const net = liste.length === 1 || s[0] > s[1];
    return { statut: net && !partiel ? 'trouve' : 'choix', candidats: liste.slice(0, 8), article: liste[0] };
  }
  // Texte libre dicté : ponctuation dite (« virgule », « point », « à la ligne », « point d'interrogation ») et majuscules
  function ponctuer(t) {
    return String(t || '')
      .replace(/\s*(?:^|\s)(?:point à la ligne|à la ligne|nouvelle ligne|nouveau paragraphe)(?=\s|$)\s*/gi, '.\n')
      .replace(/\s+point d'interrogation(?=\s|$)/gi, ' ?').replace(/\s+point d'exclamation(?=\s|$)/gi, ' !')
      .replace(/\s+virgule(?=\s|$)/gi, ',').replace(/\s+deux points(?=\s|$)/gi, ' :')
      .replace(/\s+point(?=\s+(?!de\s|d')|$)/gi, '.')
      .replace(/\.{2,}/g, '.').replace(/ +\n/g, '\n')
      .replace(/(^|[.?!]\s+|\n)(\p{Ll})/gu, (m, a, l) => a + l.toUpperCase()).trim();
  }
  return { analyser, rapprocher, ponctuer, lireNombre: (s, i = 0) => lireNombre(mots(s), i), mots };
})();
if (typeof module !== 'undefined') module.exports = DicteeMateriel;
