// Lecture d'une offre (devis) fournisseur : à partir des lignes de texte du PDF (ou de l'OCR d'un scan), reconnaît les
// lignes d'articles (référence, désignation, quantité, unité, prix unitaire, remise, montant) en vérifiant que
// quantité × prix (− remise) = montant, ainsi que le port, la remise globale, le total HT, la validité et le délai.
// Puis rapproche ces lignes des fournitures demandées (consultation, commande, bibliothèque).
// Module commun navigateur / tests.
const OffreLecture = (() => {
  const UNITES = /^(u|un|unit[ée]s?|pce?s?|pi[eè]ces?|p|ml|m|m2|m²|m3|mm|kg|g|t|l|lot|ens|ensemble|forf(ait)?|fft|jeu|bte|boite|bo[iî]te|rouleau|rlx?|paire|sac|bar(re)?s?|h|j)\.?$/i;
  // Nombre au format français ou anglais : « 1 234,56 », « 1.234,56 », « 1234.5 », « 12,50€ »
  const NOMBRE = /^-?\d{1,3}(?:[   .]\d{3})*(?:,\d+)?$|^-?\d+(?:[.,]\d+)?$/;
  function nombre(t) {
    let s = String(t).replace(/[€  ]/g, ' ').trim().replace(/\s+/g, ' ');
    if (!NOMBRE.test(s)) return null;
    if (/,\d+$/.test(s)) s = s.replace(/[ .]/g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 1.234 (milliers)
    else s = s.replace(/ /g, '');
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : null;
  }
  // Découpe d'une ligne en éléments. Les colonnes repérées dans le PDF sont séparées par des tabulations : un nombre
  // à milliers (« 1 234,56 ») y reste entier. Sans colonnes (texte lu sur un scan), « fusion » regroupe les milliers.
  function elements(ligne, fusion = true) {
    const cellules = String(ligne).split('\t'), out = [];
    cellules.forEach(c => {
      const s = c.replace(/\s*€/g, ' €').replace(/(\d)\s*%/g, '$1 %').trim();
      if (!s) return;
      const sansEuro = s.replace(/ €$/, '');
      if (cellules.length > 1 && nombre(sansEuro) !== null) { out.push(sansEuro); if (sansEuro !== s) out.push('€'); return; }
      const brut = s.split(/\s+/);
      for (let i = 0; i < brut.length; i++) {
        let t = brut[i];
        if (fusion && cellules.length === 1) while (/^-?\d{1,3}( \d{3})*$/.test(t) && i + 1 < brut.length && /^\d{3}(,\d+)?$/.test(brut[i + 1])) { t += ` ${brut[++i]}`; if (t.includes(',')) break; }
        out.push(t);
      }
    });
    return out;
  }
  const r2 = v => Math.round(v * 100) / 100;
  const proche = (a, b) => Math.abs(a - b) <= Math.max(0.021, Math.abs(b) * 0.006);
  const EXCLUES = /\b(total|sous-total|tva|t\.v\.a|net a payer|net à payer|acompte|escompte|reglement|règlement|iban|bic|siret|capital|page \d|report|montant ttc|base ht)\b/i;
  const ENTETE = /(d[ée]signation|libell[ée]|article).*(qt[ée]|quantit[ée])|(qt[ée]|quantit[ée]).*(prix|p\.?u)/i;
  const REF = /^(?=.*\d)[A-Z0-9][A-Z0-9./_-]{2,24}$/i;

  // Une ligne d'article : les colonnes chiffrées sont à droite de la désignation
  // ordre : 'pu-q' si l'en-tête du tableau place le prix unitaire avant la quantité
  function analyserLigne(texte, ordre = '', seulementPrix = false) {
    // « 12U 36,50 » (quantité et unité collées, fréquent en lecture de scan) -> « 12 U 36,50 »
    const el = elements(texte, false).flatMap((t, i, all) => { const m = /^(\d+(?:[.,]\d+)?)(U|ML|M|KG|PCE?S?|ENS)$/i.exec(t); return m && i + 1 < all.length && nombre(all[i + 1]) !== null ? [m[1], m[2]] : [t]; });
    // Queue chiffrée : nombres, pourcentages, unités, symboles monétaires
    let k = el.length - 1;
    const estQueue = t => t === '€' || t === 'EUR' || t === 'HT' || t === '%' || nombre(t.replace(/%$/, '')) !== null || UNITES.test(t);
    while (k >= 0 && estQueue(el[k])) k--;
    const queue = el.slice(k + 1).map((t, n) => ({ t, pos: k + 1 + n }));
    // Regroupements possibles des milliers écrits avec des espaces (« 3 792,00 ») quand le PDF ne donne pas les colonnes
    const variantes = [];
    const fusionnable = (a, b) => /^-?\d{1,3}( \d{3})*$/.test(a) && /^\d{3}(,\d+)?$/.test(b);
    (function gen(i, acc) {
      if (variantes.length > 64) return;
      if (i >= queue.length) { variantes.push(acc); return; }
      gen(i + 1, [...acc, { ...queue[i] }]);
      const der = acc[acc.length - 1];
      if (der && der.pos + (der.n || 0) + 1 === queue[i].pos && fusionnable(der.t, queue[i].t) && !/\t/.test(texte)) gen(i + 1, [...acc.slice(0, -1), { t: `${der.t} ${queue[i].t}`, pos: der.pos, n: (der.n || 0) + 1 }]);
    })(0, []);
    for (const v of variantes) { const r = equation(v, ordre); if (r) return seulementPrix ? r : finir(r, el, texte); }
    return null;
  }
  // Ligne qui porte des prix (quantité × prix = montant), même sans désignation (désignation écrite au-dessus)
  const estLignePrix = texte => !!analyserLigne(texte, '', true);
  // Quantité × prix (× (1 − remise)) = montant, le montant étant le dernier nombre
  function equation(toks, ordre) {
    const items = [];
    toks.forEach(x => {
      if (x.t === '%') { if (items.length) items[items.length - 1].pct = true; return; }
      if (x.t === '€' || x.t === 'EUR' || x.t === 'HT') return;
      const v = nombre(x.t.replace(/%$/, ''));
      if (v !== null) items.push({ v, pct: /%$/.test(x.t), pos: x.pos }); else if (UNITES.test(x.t)) items.push({ unite: x.t.replace(/\.$/, ''), pos: x.pos });
    });
    const nums = items.filter(x => x.v !== undefined);
    if (nums.length < 2) return null;
    const m = nums[nums.length - 1];
    if (m.pct || m.v <= 0) return null;
    const unite = (items.find(x => x.unite) || {}).unite || '';
    const cands = [];
    for (let a = 0; a < nums.length - 1; a++) for (let b = a + 1; b < nums.length - 1; b++) {
      const x = nums[a], y = nums[b];
      if (x.pct || y.pct || x.v <= 0 || y.v <= 0) continue;
      const restants = nums.slice(b + 1, nums.length - 1);
      // Dans l'ordre de lecture : (quantité, prix) ou (prix, quantité)
      [[x, y, false], [y, x, true]].forEach(([q, p, inverse]) => {
        const base = { q: q.v, debut: Math.min(x.pos, y.pos), montant: m.v, unite, inverse };
        if (proche(q.v * p.v, m.v)) cands.push({ ...base, pu: p.v, remise: 0 });
        else if (!inverse) {
          const remise = restants.find(r => r.v > 0 && r.v < 100 && proche(q.v * p.v * (1 - r.v / 100), m.v));
          if (remise) cands.push({ ...base, pu: Math.round(p.v * (1 - remise.v / 100) * 10000) / 10000, puBrut: p.v, remise: remise.v });
          else { const pnet = restants.find(r => !r.pct && proche(q.v * r.v, m.v)); if (pnet) cands.push({ ...base, pu: pnet.v, puBrut: p.v, remise: r2((1 - pnet.v / p.v) * 100) }); }
        }
      });
      if (cands.length) break;
    }
    if (!cands.length) {
      // Lecture de scan abîmée : prix brut × (1 − remise) = prix net permet de retrouver la quantité ou le montant illisible
      for (let b = 0; b < nums.length - 1; b++) {
        const pb = nums[b], r = nums[b + 1], pn = nums[b + 2];
        if (!r || !r.pct || pb.pct || pb.v <= 0) continue;
        const net = pn && !pn.pct && pn !== m && proche(pb.v * (1 - r.v / 100), pn.v) ? pn.v : Math.round(pb.v * (1 - r.v / 100) * 10000) / 10000;
        const avant = nums.slice(0, b).filter(x => !x.pct && Number.isInteger(x.v) && x.v > 0);
        const q = avant.find(x => proche(x.v * net, m.v));
        if (q) return { q: q.v, pu: net, puBrut: pb.v, remise: r.v, montant: m.v, debut: q.pos, unite, verifier: true };
        const k = m.v / net;
        if (k >= 1 && k < 100000 && Math.abs(k - Math.round(k)) < 0.001) return { q: Math.round(k), pu: net, puBrut: pb.v, remise: r.v, montant: m.v, debut: avant.length ? avant[0].pos : pb.pos, unite, verifier: true };
        if (pn && pn !== m && proche(pb.v * (1 - r.v / 100), pn.v) && avant.length) {
          const qq = avant[avant.length - 1];
          return { q: qq.v, pu: net, puBrut: pb.v, remise: r.v, montant: r2(qq.v * net), debut: qq.pos, unite, verifier: true };
        }
      }
      return null;
    }
    // Plusieurs lectures possibles : ordre des colonnes de l'en-tête, sinon quantité entière et prix à centimes
    const note = c => (ordre ? (c.inverse === (ordre === 'pu-q') ? 4 : 0) : 0) + (Number.isInteger(c.q) ? 2 : 0) + (c.inverse ? 0 : 1);
    return cands.sort((a, b) => note(b) - note(a))[0];
  }
  // Référence et désignation : ce qui précède la quantité (les nombres de la désignation, « DN 50 », y restent)
  function finir(r, el, texte) {
    let tete = String(texte).split('\t').length > 1 ? elements(texte, false).slice(0, r.debut) : el.slice(0, r.debut);
    tete = tete.filter(t => !UNITES.test(t) || tete.length < 2);
    if (tete.length > 1 && /^\d{1,3}$/.test(tete[0])) tete = tete.slice(1); // n° de ligne
    let ref = '';
    if (tete.length > 1 && REF.test(tete[0]) && !/^\d{1,3}$/.test(tete[0])) { ref = tete[0]; tete = tete.slice(1); }
    const designation = tete.join(' ').replace(/\s+-\s*$/, '').trim();
    if (!designation && !ref) return null;
    return { ref, designation, qte: r.q, unite: r.unite, pu: r.pu, puBrut: r.puBrut, remise: r.remise || 0, montant: r2(r.montant), ...(r.verifier ? { verifier: true } : {}) };
  }

  // Analyse d'une offre complète : lignes de texte dans l'ordre de lecture
  function analyser(lignes) {
    const out = { lignes: [], port: 0, remiseGlobale: 0, totalHT: null, validite: '', delai: '', reference: '', date: '' };
    let derniere = null, ordre = '', validiteJours = 0;
    lignes.map(l => String(l || '').replace(/[ \u00a0\u202f]+/g, ' ').replace(/ *\t[\t ]*/g, '\t').trim()).filter(Boolean).forEach(l => {
      const bas = l.toLowerCase();
      const date = /(\d{2})[/.-](\d{2})[/.-](\d{2,4})/.exec(l);
      const dl = /d[ée]lai[^0-9]{0,30}(\d{1,3})\s*(j|jours?|sem|semaines?)/i.exec(l);
      if (dl && !out.delai) out.delai = String(/sem/i.test(dl[2]) ? Number(dl[1]) * 7 : Number(dl[1]));
      if (/validit|valable/.test(bas) && date) { out.validite = `${date[3].length === 2 ? `20${date[3]}` : date[3]}-${date[2]}-${date[1]}`; return; }
      const vj = /validit[ée][^0-9]{0,20}(\d{1,3})\s*(j|jours?)\b/i.exec(l) || /valable[^0-9]{0,20}(\d{1,3})\s*(j|jours?)\b/i.exec(l);
      if (vj) validiteJours = Number(vj[1]);
      if (date && !out.date && !/validit|valable|livraison/.test(bas)) out.date = `${date[3].length === 2 ? `20${date[3]}` : date[3]}-${date[2]}-${date[1]}`;
      const refO = /(devis|offre|proposition)\s*(n°|no|num[ée]ro|:)\s*([A-Z0-9/_-]{3,})/i.exec(l);
      if (refO && !out.reference) out.reference = refO[3];
      if (ENTETE.test(l) || /(qt[ée]|quantit[ée]).*(prix|p\.?\s?u)|(prix|p\.?\s?u).*(qt[ée]|quantit[ée])/i.test(l) && !/\d+[.,]\d{2}/.test(l)) {
        const iq = bas.search(/qt[ée]|quantit[ée]/), ip = bas.search(/p\.?\s?u\b|prix/);
        if (iq >= 0 && ip >= 0) ordre = ip < iq ? 'pu-q' : 'q-pu';
        derniere = null; return;
      }
      const fin = elements(l), dernierNombre = fin.length ? nombre(fin[fin.length - 1]) ?? nombre(fin[fin.length - 2] || '') : null;
      if (/\b(port|transport|frais de livraison|frais d'exp[ée]dition|participation)\b/i.test(l) && !/franco|d[ée]lai/i.test(l) && dernierNombre !== null && !analyserLigne(l)) { out.port = r2(out.port + dernierNombre); derniere = null; return; }
      if (/total\s*(net\s*)?h\.?\s*t/i.test(l) && dernierNombre !== null) { out.totalHT = dernierNombre; derniere = null; return; }
      if (/^remise/i.test(l) && dernierNombre !== null) { if (/%/.test(l)) out.remiseGlobale = dernierNombre; derniere = null; return; }
      if (EXCLUES.test(l)) { derniere = null; return; }
      const a = analyserLigne(l, ordre);
      if (a) {
        // Frais de port écrit comme une ligne d'article
        if (/^(frais de )?(port|transport)\b/i.test(a.designation)) { out.port = r2(out.port + a.montant); derniere = null; return; }
        out.lignes.push(a); derniere = a; return;
      }
      // Suite de la désignation sur la ligne suivante (sans chiffres de colonnes)
      if (derniere && l.length < 90 && !/\d+[.,]\d{2}\s*€?$/.test(l) && derniere.designation.length < 160) derniere.designation = `${derniere.designation} ${l}`.trim();
    });
    // Validité exprimée en jours : à compter de la date du document (ou d'aujourd'hui)
    if (!out.validite && validiteJours) { const d = new Date(`${out.date || new Date().toISOString().slice(0, 10)}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + validiteJours); out.validite = d.toISOString().slice(0, 10); }
    const somme = r2(out.lignes.reduce((t, l) => t + l.montant, 0));
    out.sommeLignes = somme;
    out.coherent = out.totalHT === null || proche(somme + out.port, out.totalHT) || proche(somme, out.totalHT) || proche(somme * (1 - out.remiseGlobale / 100) + out.port, out.totalHT);
    return out;
  }

  // Ressemblance de deux désignations (mêmes règles que le rapprochement des factures)
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\bdn (\d+)/g, 'dn$1').trim();
  const ressemble = (a, b) => (typeof Rapprochement !== 'undefined' ? Rapprochement : require('./rapprochement')).ressemblance(a, b);

  // Associe les lignes lues aux lignes demandées : même référence (fournisseur ou bibliothèque), sinon désignation proche
  // demandes : [{ designation, qte, articleId, refFournisseur }] ; renvoie { parDemande: {i: indexLu}, nonAssociees: [indexLu] }
  function associer(lues, demandes, articles = []) {
    const paires = [];
    demandes.forEach((d, i) => {
      const art = d.articleId ? articles.find(a => a.id === d.articleId) : null;
      const refs = [d.refFournisseur, art && art.ref, art && art.refFournisseur].filter(Boolean).map(norm);
      lues.forEach((l, j) => {
        let s = l.ref && refs.includes(norm(l.ref)) ? 1 : ressemble(l.designation, d.designation);
        if (s > 0 && Math.abs(Number(l.qte) - Number(d.qte)) < 1e-9) s += 0.1; // même quantité : indice supplémentaire
        if (s >= 0.45) paires.push({ i, j, s });
      });
    });
    paires.sort((a, b) => b.s - a.s);
    const parDemande = {}, prises = new Set();
    paires.forEach(p => { if (parDemande[p.i] === undefined && !prises.has(p.j)) { parDemande[p.i] = p.j; prises.add(p.j); } });
    return { parDemande, nonAssociees: lues.map((_, j) => j).filter(j => !prises.has(j)) };
  }

  return { nombre, elements, analyserLigne, estLignePrix, analyser, associer };
})();
if (typeof module !== 'undefined') module.exports = OffreLecture;
