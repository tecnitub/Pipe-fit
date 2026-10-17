// Notes de frais : règles communes au navigateur, au serveur et à la démo, et lecture des tickets photographiés.
// - Restaurant : le nom des personnes présentes au repas est obligatoire (justification fiscale du repas).
// - analyserTicket : à partir du texte lu sur la photo (OCR), propose montant TTC, date, TVA, enseigne, catégorie, couverts.
const NoteFrais = (() => {
  const nomsConvives = f => (Array.isArray(f.convives) ? f.convives : []).map(c => String((c && c.nom) || '').trim()).filter(Boolean);
  const convivesRequis = f => f.categorie === 'Repas';
  // Erreur bloquante à l'envoi d'une note (null si tout va bien)
  function erreur(f) {
    if (convivesRequis(f) && !nomsConvives(f).length) return 'Restaurant : indiquez le nom des personnes présentes au repas (obligatoire).';
    return null;
  }
  // « Kevin Roux, Lucas Petit, M. Girard (Laiterie des Alpes) »
  const libelleConvives = f => (Array.isArray(f.convives) ? f.convives : []).filter(c => c && String(c.nom || '').trim())
    .map(c => `${String(c.nom).trim()}${c.societe ? ` (${String(c.societe).trim()})` : ''}`).join(', ');

  /* ---------- Lecture d'un ticket ---------- */
  const MOIS = { janv: 1, jan: 1, fevr: 2, fev: 2, mars: 3, mar: 3, avr: 4, mai: 5, juin: 6, juil: 7, aout: 8, sept: 9, sep: 9, oct: 10, nov: 11, dec: 12 };
  const sansAccents = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const iso = (a, m, j) => `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
  const CATEGORIES = [
    ['Péage', /p[ée]age|autoroute|\baprr\b|\barea\b|vinci|sanef|escota|\basf\b|cofiroute|\bclasse\s*[1-5]\b|gare de p/],
    ['Carburant', /carburant|gazole|gasoil|diesel|\bsp\s?9[58]\b|\be10\b|\be85\b|sans plomb|\blitres?\b|\bvolume\b|prix\s*\/?\s*l\b|station|esso|shell|total\s?energies|\bavia\b|\bbp\b|pompe\s*n?°?\s*\d|adblue/],
    ['Parking', /parking|stationnement|indigo|effia|saemes|horodateur|onepark|zenpark/],
    ['Hôtel', /h[ôo]tel|\bibis\b|campanile|kyriad|premi[eè]re classe|\bb\s?&\s?b\b|formule 1|nuit[ée]e|chambre|taxe de s[ée]jour|petit[- ]d[ée]jeuner/],
    ['Repas', /restaurant|brasserie|bistro|pizz|caf[ée]\b|traiteur|boulangerie|snack|kebab|burger|mcdonald|\bquick\b|couverts?|\bcvts?\b|\bmenu\b|plat du jour|dessert|boissons?|\btable\s*n?°?\s*\d|serveur|addition|resto|cr[eê]perie|routier|sandwich|formule midi|\bvin\b|caf[ée]s?\b/],
    ['Petites fournitures', /brico|leroy\s?merlin|castorama|point\s?p\b|cedeo|w[üu]rth|quincaillerie|outillage|fournitures?|manutan|rexel|mr\.? bricolage|bricomarch[ée]|tout faire/],
  ];
  // Montants d'une ligne (dates et heures retirées avant) : « 1 234,56 », « 45.80 », « 12,5 € »
  function montants(ligne) {
    const l = ligne.replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, ' ').replace(/\b\d{1,2}[:h]\d{2}(?::\d{2})?\b/g, ' ')
      .replace(/(\d)\s?[oO](?=\d|\b)/g, '$10').replace(/(\d)\s+([,.])\s*(\d{2})\b/g, '$1$2$3');
    const out = [];
    for (const m of l.matchAll(/(?<![\d,.])(\d{1,3}(?:[   .]\d{3})+|\d{1,5})[,.](\d{2})(?![\d%])/g)) {
      const v = Number(`${m[1].replace(/[   .]/g, '')}.${m[2]}`);
      if (v > 0 && v < 100000) out.push(v);
    }
    return out;
  }
  function dateDe(lignes, aujourdhui) {
    const auj = new Date(`${aujourdhui}T12:00:00`), min = new Date(auj); min.setDate(min.getDate() - 400);
    const ok = (a, m, j) => { if (m < 1 || m > 12 || j < 1 || j > 31) return null; const d = new Date(`${iso(a, m, j)}T12:00:00`); return d.getDate() === j && d >= min && d <= new Date(auj.getTime() + 86400000) ? iso(a, m, j) : null; };
    for (const l of lignes) {
      for (const m of l.matchAll(/\b(\d{1,2})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{4}|\d{2})\b/g)) {
        const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), r = ok(a, Number(m[2]), Number(m[1]));
        if (r) return r;
      }
      for (const m of sansAccents(l.toLowerCase()).matchAll(/\b(\d{1,2})\s+([a-z]{3,5})\.?\s+(\d{4})\b/g)) {
        const mo = MOIS[m[2]] || MOIS[m[2].slice(0, 4)] || MOIS[m[2].slice(0, 3)], r = mo && ok(Number(m[3]), mo, Number(m[1]));
        if (r) return r;
      }
    }
    return '';
  }
  function tvaDe(lignes, ttc) {
    const taux = [];
    lignes.forEach(l => {
      if (!/t\.?\s?v\.?\s?a/i.test(l)) return;
      const t = /(?<![\d,.])(20|10|5[,.]5|2[,.]1)\s*(?:[,.]0+)?\s*%/.exec(l) || /\b(?:tva|t\.v\.a\.?)\s*(20|10|5[,.]5|2[,.]1)\b/i.exec(l);
      const ms = montants(l.replace(/(?<![\d,.])(20|10|5[,.]5|2[,.]1)\s*(?:[,.]0+)?\s*%/, ' '));
      if (t) taux.push({ taux: Number(t[1].replace(',', '.')), montant: ms.length ? Math.min(...ms) : 0 });
    });
    if (taux.length) {
      const dominant = taux.slice().sort((a, b) => b.montant - a.montant)[0];
      return { tauxTVA: dominant.taux, montantTVA: taux.length === 1 ? dominant.montant : Math.round(taux.reduce((s, x) => s + x.montant, 0) * 100) / 100, multiTaux: new Set(taux.map(x => x.taux)).size > 1 };
    }
    // Sans taux écrit : déduit du montant de TVA (« TVA 4,16 » pour 45,80 TTC -> 10 %)
    const l = lignes.find(x => /\btva\b|t\.v\.a/i.test(x) && !/n°|intra|fr\s?\d{2}/i.test(x));
    const m = l && montants(l)[0];
    if (m && ttc > m) {
      const r = m / (ttc - m), proche = [20, 10, 5.5].find(t => Math.abs(r - t / 100) < 0.012);
      if (proche) return { tauxTVA: proche, montantTVA: m, multiTaux: false };
    }
    return { tauxTVA: null, montantTVA: null, multiTaux: false };
  }
  function enseigneDe(lignes) {
    const l = lignes.slice(0, 5).find(x => {
      const lettres = (x.match(/[a-zà-ÿ]/gi) || []).length;
      return lettres >= 3 && lettres / x.length > 0.5 && x.length <= 40 && !/ticket|bienvenue|facture|re[çc]u|\bt[ée]l\b|siret|siren|www|@|tva|caisse|date/i.test(x);
    });
    if (!l) return '';
    const n = l.replace(/[^\p{L}\d '&.-]+/gu, ' ').replace(/\s+/g, ' ').trim();
    // Sigle seul gardé en majuscules (APRR), sinon casse de titre
    return /^[\p{Lu}\d&]{2,5}$/u.test(n) ? n : n.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, c => c.toUpperCase());
  }

  function analyserTicket(texte, aujourdhui = new Date().toISOString().slice(0, 10)) {
    const lignes = String(texte || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const bas = sansAccents(lignes.join('\n').toLowerCase());
    // Montant TTC : ligne « total / net à payer / CB / montant », sinon le plus grand montant du ticket
    const MOTS = /net\s*[aà]\s*payer|total\s*t\.?t\.?c|montant\s*t\.?t\.?c|[aà]\s*payer|total\s*(?:eur|€)|\btotal\b|\bttc\b|montant|carte\s*bancaire|\bcb\b|\bvisa\b|mastercard|esp[eè]ces|r[eè]glement/i;
    const candidats = [];
    lignes.forEach((l, i) => {
      if (!MOTS.test(l) || (/\bh\.?t\.?\b|hors\s*taxe|sous[- ]?total|t\.?v\.?a|rendu|monnaie|remise/i.test(l) && !/t\.?t\.?c/i.test(l))) return;
      const ms = montants(l).length ? montants(l) : montants(lignes[i + 1] || '');
      const poids = /net\s*[aà]\s*payer|total\s*t\.?t\.?c|[aà]\s*payer/i.test(l) ? 3 : /\btotal\b|montant/i.test(l) ? 2 : 1;
      ms.forEach(v => candidats.push({ v, poids }));
    });
    let montantTTC = null;
    if (candidats.length) {
      const score = new Map();
      candidats.forEach(c => score.set(c.v, (score.get(c.v) || 0) + c.poids));
      montantTTC = [...score.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    } else {
      const tous = lignes.flatMap(montants).filter(v => v < 5000);
      if (tous.length) montantTTC = Math.max(...tous);
    }
    const scores = CATEGORIES.map(([c, re]) => [c, (bas.match(new RegExp(re.source, 'g')) || []).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
    const categorie = scores.length ? scores[0][0] : '';
    // Nombre de couverts (restaurant) : « Couverts : 3 », « 3 cvts », « Nb pers. 3 »
    const couverts = categorie === 'Repas' ? ((/(?:couverts?|cvts?|nb\s*(?:de\s*)?(?:couverts|pers(?:onnes)?\.?))\s*:?\s*(\d{1,2})\b/.exec(bas) || /\b(\d{1,2})\s*(?:couverts?|cvts?\b|pers(?:onnes)?\b)/.exec(bas) || [])[1]) : null;
    return {
      montantTTC, date: dateDe(lignes, aujourdhui), ...tvaDe(lignes, montantTTC || 0), enseigne: enseigneDe(lignes),
      categorie, couverts: couverts ? Number(couverts) : null,
    };
  }

  return { erreur, convivesRequis, nomsConvives, libelleConvives, analyserTicket };
})();
if (typeof module !== 'undefined') module.exports = NoteFrais;
