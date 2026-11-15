// Lecture d'un devis (offre de prix) fournisseur à partir des lignes de texte du PDF (ou de l'OCR) : en-tête (fournisseur,
// n° et date du devis, validité, délai, affaire), lignes d'articles (référence, désignation sur une ou plusieurs lignes,
// quantité, unité, prix unitaire, remise, total), sections et sous-totaux, frais de port et frais annexes, total HT avec
// contrôle de cohérence. Puis rapprochement de chaque ligne avec le matériel retenu de l'étude ou les lignes d'une
// consultation (référence exacte, sinon désignation + famille + grandeur), comparatif de plusieurs devis (par ligne et au
// total, moins-disant, lignes manquantes) et prix retenus avec leur source (devis, fournisseur, date).
// Module pur commun navigateur (Pipe-Fit, Études) / tests.
const DevisLecture = (() => {
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9%]+/g, ' ').trim();
  const compact = s => norm(s).replace(/[^a-z0-9]/g, '');
  const r2 = v => Math.round(v * 100) / 100;
  const proche = (a, b) => Math.abs(a - b) <= Math.max(0.021, Math.abs(b) * 0.006);
  const iso = (j, m, a) => `${String(a).length === 2 ? `20${a}` : a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
  const plusJours = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

  /* ---------- Nombres et éléments d'une ligne ---------- */
  // « 1 234,56 », « 1.234,56 », « 8 450,00 € », « 1234.5 », « 41,20 EUR »
  function nombre(t) {
    let s = String(t ?? '').replace(/[€\u00a0\u202f]/g, ' ').replace(/\s*(?:eur|euros?|ht|h\.t\.)\s*$/i, '').trim().replace(/\s+/g, ' ');
    if (!/^-?\d{1,3}(?:[ .]\d{3})*(?:,\d+)?$|^-?\d+(?:[.,]\d+)?$/.test(s)) return null;
    if (/,\d+$/.test(s)) s = s.replace(/[ .]/g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    else s = s.replace(/ /g, '');
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : null;
  }
  const UNITE = /^(u|un|unit[ée]s?|pce?s?|pi[eè]ces?|p|ml|m|m2|m²|m3|kg|l|lot|ens|ensemble|forf(ait)?|fft|ft|jeu|bte|bo[iî]te|rouleau|rlx?|paire|sac|barres?|h|j)\.?$/i;
  const MONNAIE = /^(€|eur|euros?|ht|h\.t\.?)$/i;
  // Éléments : cellules (séparées par des tabulations) ; une cellule chiffrée reste un nombre (« 8 450,00 ») ; dans une
  // cellule de texte, les mots, les milliers écrits avec une espace étant regroupés plus tard (variantes)
  function elements(ligne) {
    const cellules = String(ligne).split('\t').map(c => c.trim()).filter(Boolean), out = [];
    cellules.forEach((c, ci) => {
      const s = c.replace(/(\d)\s*%/g, '$1 %').replace(/(\d)\s*€/g, '$1 €');
      const sans = s.replace(/\s*(€|eur|euros?)$/i, '').replace(/\s*%$/, '');
      if (cellules.length > 1 && nombre(sans) !== null) { out.push({ t: sans, v: nombre(sans), pct: /%$/.test(s), cellule: ci, entier: true }); return; }
      s.split(/\s+/).forEach(t => {
        if (t === '%') { const d = out[out.length - 1]; if (d && d.v !== undefined) d.pct = true; return; }
        const v = nombre(t.replace(/%$/, ''));
        out.push(v !== null ? { t, v, pct: /%$/.test(t), cellule: ci } : { t, cellule: ci });
      });
    });
    return { el: out, colonnes: cellules.length > 1 };
  }

  /* ---------- Ligne d'article : quantité × prix (− remise) = total ---------- */
  function equation(nums, ordre) {
    if (nums.length < 2) return null;
    const m = nums[nums.length - 1];
    if (m.pct || !(m.v > 0)) return null;
    const cands = [];
    for (let a = 0; a < nums.length - 1; a++) for (let b = a + 1; b < nums.length - 1; b++) {
      const x = nums[a], y = nums[b];
      if (x.pct || y.pct || !(x.v > 0) || !(y.v > 0)) continue;
      const restants = nums.slice(b + 1, nums.length - 1);
      [[x, y, false], [y, x, true]].forEach(([q, p, inverse]) => {
        const base = { q: q.v, debut: Math.min(x.i, y.i), total: m.v, inverse };
        if (proche(q.v * p.v, m.v)) cands.push({ ...base, pu: p.v, remise: 0 });
        else if (!inverse) {
          const r = restants.find(z => z.v > 0 && z.v < 100 && proche(q.v * p.v * (1 - z.v / 100), m.v));
          if (r) cands.push({ ...base, pu: Math.round(p.v * (1 - r.v / 100) * 10000) / 10000, puBrut: p.v, remise: r.v });
          else { const pn = restants.find(z => !z.pct && proche(q.v * z.v, m.v)); if (pn) cands.push({ ...base, pu: pn.v, puBrut: p.v, remise: r2((1 - pn.v / p.v) * 100) }); }
        }
      });
    }
    if (!cands.length) return null;
    // Plusieurs lectures : ordre des colonnes de l'en-tête, quantité entière, quantité avant le prix, remise lue
    const note = c => (ordre ? (c.inverse === (ordre === 'pu-q') ? 4 : 0) : 0) + (Number.isInteger(c.q) ? 2 : 0) + (c.inverse ? 0 : 1) + (c.remise ? 0.75 : 0); // la lecture qui explique le prix brut et la remise d'abord
    return cands.sort((a, b) => note(b) - note(a))[0];
  }
  const REF = /^(?=.*\d)[A-Z0-9][A-Z0-9./_-]{2,24}$/i;
  function ligneArticle(texte, ordre = '') {
    const { el, colonnes } = elements(texte);
    let k = el.length - 1;
    const queue = t => t.v !== undefined || MONNAIE.test(t.t) || UNITE.test(t.t);
    while (k >= 0 && queue(el[k])) k--;
    const tete = el.slice(0, k + 1), q = el.slice(k + 1).map((t, n) => ({ ...t, i: k + 1 + n }));
    // Milliers séparés par une espace (texte sans colonnes) : regroupements possibles essayés un à un
    const variantes = [];
    const fusionnable = (a, b) => !a.entier && !b.entier && /^-?\d{1,3}( \d{3})*$/.test(a.t) && /^\d{3}(,\d+)?$/.test(b.t);
    (function gen(i, acc) {
      if (variantes.length > 64) return;
      if (i >= q.length) { variantes.push(acc); return; }
      gen(i + 1, [...acc, q[i]]);
      const d = acc[acc.length - 1];
      if (d && d.v !== undefined && q[i].v !== undefined && !colonnes && fusionnable(d, q[i])) { const t = `${d.t} ${q[i].t}`; gen(i + 1, [...acc.slice(0, -1), { ...d, t, v: nombre(t) }]); }
    })(0, []);
    // Lectures possibles : celle qui laisse le moins de nombres inexpliqués (« 2 U 1 234,50 2 469,00 » : 1 234,50 et non 234,50)
    const lues = variantes.map(v => ({ v, r: equation(v.filter(x => x.v !== undefined), ordre) })).filter(x => x.r)
      .map(x => ({ ...x, reste: x.v.filter(t => t.v !== undefined && t.i >= x.r.debut).length })).sort((a, b) => a.reste - b.reste);
    for (const { v, r } of lues.slice(0, 1)) {
      const unite = (v.find(x => x.v === undefined && UNITE.test(x.t)) || {}).t || '';
      let mots = [...tete, ...q.filter(x => x.i < r.debut)].map(x => x.t).filter(t => !MONNAIE.test(t));
      if (mots.length > 1 && /^\d{1,3}$/.test(mots[0])) mots = mots.slice(1); // n° de ligne
      // Référence : première cellule (colonne « Code ») ou premier mot en forme de code
      let reference = '';
      const premiere = colonnes ? String(texte).split('\t')[0].trim() : '';
      if (premiere && (REF.test(premiere) || /^(?=.*[-./_\d])[A-Z0-9][A-Z0-9./_-]{2,24}$/.test(premiere)) && mots.length > 1 && mots[0] === premiere) { reference = premiere; mots = mots.slice(1); }
      else if (mots.length > 1 && REF.test(mots[0]) && !/^\d{1,3}$/.test(mots[0])) { reference = mots[0]; mots = mots.slice(1); }
      else if (mots.length === 1 && REF.test(mots[0]) && !/\s/.test(mots[0])) { reference = mots[0]; mots = []; }
      return { reference, designation: mots.join(' ').replace(/\s+-\s*$/, '').trim(), qte: r.q, unite: unite.replace(/\.$/, ''), pu: r.pu, puBrut: r.puBrut || r.pu, remise: r.remise || 0, total: r2(r.total) };
    }
    return null;
  }

  /* ---------- Lecture du devis ---------- */
  const ENTETE = /(d[ée]signation|libell[ée]|article|description).*(qt[ée]|quantit[ée]|qte)|(qt[ée]|quantit[ée]).*(prix|p\.?\s?u)/i;
  const FRAGMENT_ENTETE = /^(prix( unitaire)?( (net|brut))?( ht)?|p\.?\s?u\.?( n(et)?)?( ht)?|ht|ttc|qt[ée]s?|quantit[ée]s?|montants?( (net )?ht)?|total( ht)?|code|r[ée]f[ée]rences?|r[ée]f\.?|d[ée]signations?|unit[ée]s?|remises?( %)?|net|brut|€)$/i;
  const COORDONNEES = /@|https?:|www\.|\b(t[ée]l|t[ée]l[ée]phone|fax|portable|mobile|siret|siren|iban|bic|capital|rcs|ape|naf|tva intra\w*)\b/i;
  const PAGE = /^page\s*:?\s*\d|\bpage\s*:?\s*\d+\s*\/\s*\d+|^\d+\s*\/\s*\d+$/i;
  const TOTAL = /^(sous[- ]?totale?s?|total|totaux|montant|net a payer|net à payer|base|tva|t\.v\.a|reste|acompte|report)\b/i;
  const FRAIS = /^(frais|transport|port\b|livraison|emballage|conditionnement|[ée]co[- ]?participation|[ée]co[- ]?contribution|deee|participation|contribution|forfait (de )?(livraison|transport|port))/i;
  const TITRE_DOC = /^(devis|offre( de prix)?|proposition( commerciale| de prix)?|cotation|estimation|bon de commande)\b/i;
  const intitule = l => (/^\d+(\.\d+)*[.)]?\s+\S/.test(l) || (l.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 4 && l.replace(/[^A-ZÀ-Þ]/g, '').length / l.replace(/[^A-Za-zÀ-ÿ]/g, '').length > 0.7));
  // Montant en fin de ligne (dernière cellule ; milliers séparés par une espace regroupés)
  const libelleDe = l => l.split('\t')[0].replace(/\s*:?\s*-?\d[\d .]*(?:,\d+)?\s*(?:€|eur\w*)?\s*$/i, '').replace(/\s*:\s*$/, '').trim() || l.split('\t')[0].trim();
  const dernierNombre = l => {
    const c = String(l).split('\t').map(x => x.trim()).filter(Boolean), der = c[c.length - 1] || '';
    const m = /(-?\d{1,3}(?:[ .]\d{3})+(?:,\d+)?|-?\d+(?:[.,]\d+)?)\s*(?:€|eur\w*|h\.?t\.?)?\s*$/i.exec(der);
    if (!m || /%\s*$/.test(der)) return null;
    const v = nombre(m[1]);
    return v !== null ? v : null;
  };

  // Fournisseur : nom connu (Pipe-Fit) cité en tête, sinon libellé « Fournisseur : », sinon première ligne de l'en-tête
  // (confirmée par le domaine de l'adresse e-mail ou du site) ; jamais le client (notre société)
  function fournisseurDe(lignes, { connus = [], societe = '' } = {}) {
    const tete = lignes.slice(0, 60), texte = ` ${norm(tete.join(' '))} `, nous = norm(societe);
    const clients = tete.map(l => /\bclient\s*:\s*([^\t]+)/i.exec(l)).filter(Boolean).map(m => norm(m[1]));
    const exclu = n => !n || (nous && (n === nous || n.includes(nous) || nous.includes(n))) || clients.some(c => c && (c === n || c.includes(n)));
    const k = (connus || []).map(n => ({ nom: String(n || '').trim(), n: norm(n) })).filter(x => x.n.length >= 2 && !exclu(x.n) && texte.includes(` ${x.n} `)).sort((a, b) => b.n.length - a.n.length)[0];
    if (k) return { nom: k.nom, source: 'connu' };
    for (const l of tete) { const m = /\b(?:fournisseur|soci[ée]t[ée]|[ée]metteur|vendeur)\s*:\s*([^\t]{2,60})/i.exec(l); if (m && !exclu(norm(m[1]))) return { nom: m[1].trim(), source: 'libellé' }; }
    const domaines = tete.flatMap(l => [...l.matchAll(/@([a-z0-9-]+)\.[a-z.]{2,6}\b|www\.([a-z0-9-]+)\./gi)].map(m => (m[1] || m[2]).toLowerCase())).filter(d => !/^(gmail|orange|wanadoo|free|hotmail|outlook|yahoo|laposte|sfr)$/.test(d));
    for (const l of tete) {
      if (ENTETE.test(l)) break;
      const c = l.split('\t')[0].trim(), n = norm(c);
      if (!n || TITRE_DOC.test(c) || /:/.test(c) || /\d{2}[/.-]\d{2}/.test(c) || c.length > 40 || (c.match(/\d/g) || []).length > 2 || PAGE.test(c) || exclu(n) || COORDONNEES.test(c)) continue;
      if (domaines.length && !domaines.some(d => compact(c).includes(d) || d.includes(compact(c)))) continue;
      return { nom: c, source: domaines.length ? 'en-tête et domaine' : 'en-tête' };
    }
    return domaines.length ? { nom: domaines[0].toUpperCase(), source: 'domaine' } : { nom: '', source: '' };
  }

  // lignes : texte du document dans l'ordre de lecture ; o : { connus: noms des fournisseurs, societe: notre nom }
  function lire(lignesBrutes, o = {}) {
    const L = (lignesBrutes || []).map(l => String(l ?? '').replace(/[\u00a0\u202f]+/g, ' ').replace(/ *\t[\t ]*/g, '\t').replace(/ {2,}/g, ' ').trim()).filter(Boolean);
    const out = { fournisseur: '', fournisseurSource: '', numero: '', date: '', validite: '', validiteJours: 0, delai: '', affaire: '', lignes: [], sousTotaux: [], frais: [], remiseGlobale: 0, remiseMontant: 0, totalHT: null, autresTotaux: [], alertes: [] };
    const f = fournisseurDe(L, o);
    out.fournisseur = f.nom; out.fournisseurSource = f.source;
    // En-tête : n°, date, validité, délai, affaire (la valeur peut être sur la ligne suivante)
    L.forEach((l, i) => {
      const suite = L[i + 1] || '', duree = t => /^(\d{1,3})\s*(jours?|j\b|semaines?|sem\b|mois)/i.exec(String(t).replace(/^[\t :]+/, ''));
      const enJours = (n, u) => (/sem/i.test(u) ? n * 7 : /mois/i.test(u) ? n * 30 : n);
      if (!out.numero) {
        const m = /(?:notre\s+)?r[ée]f[ée]rence\s+(?:de\s+|du\s+)?(?:devis|l'offre|offre|cotation)\s*:?\s*([A-Z0-9][\w/.-]{2,})/i.exec(l)
          || /\b(?:devis|offre|proposition|cotation)\s*(?:de prix\s*)?(?:n[°o]\.?|num[ée]ro|no\.?|#)\s*:?\s*([A-Z0-9][\w/.-]{2,})/i.exec(l)
          || /^(?:devis|offre)\s+([A-Z]{0,4}\d[\w/.-]{2,})\b/i.exec(l);
        if (m) out.numero = m[1];
      }
      const dd = /date(?:\s+d[ue]\s+(?:devis|l'offre|offre|document))?\s*:?\s*\t?\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/i.exec(l);
      if (dd && !out.date) out.date = iso(dd[1], dd[2], dd[3]);
      if (/valable|validit[ée]/i.test(l)) {
        const vd = /(?:jusqu'?au|au|avant le)\s*:?\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/i.exec(l), vj = /(\d{1,3})\s*(jours?|j\b|semaines?|mois)/i.exec(l) || ((/:\s*$/.test(l) || !/\d/.test(l.replace(/^.*valid\w*/i, ''))) && duree(suite));
        if (vd && !out.validite) out.validite = iso(vd[1], vd[2], vd[3]);
        else if (vj && !out.validiteJours) out.validiteJours = enJours(Number(vj[1]), vj[2]);
      }
      if (/d[ée]lai/i.test(l) && !out.delai) {
        const dj = /d[ée]lai[^0-9]{0,80}?(\d{1,3})\s*(jours?|j\b|semaines?|sem\b)/i.exec(l) || ((/:\s*$/.test(l) || !/\d/.test(l.replace(/^.*d[ée]lai/i, ''))) && duree(suite));
        if (dj) out.delai = String(enJours(Number(dj[1]), dj[2]));
      }
      const af = /(?:r[ée]f[ée]rence de l'affaire|affaire|chantier|projet)\s*:\s*\t?\s*([^\t]{3,80})/i.exec(l);
      if (af && !out.affaire) out.affaire = af[1].trim();
    });
    if (!out.date) { const d = L.slice(0, 60).map(l => !/validit|valable|livraison|naissance/i.test(l) && /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(l)).find(Boolean); if (d) out.date = iso(d[1], d[2], d[3]); }
    if (!out.validite && out.validiteJours && out.date) out.validite = plusJours(out.date, out.validiteJours);

    // Tableau : à partir de la première ligne d'en-tête des colonnes (tout le document s'il n'y en a pas)
    const debut = Math.max(0, L.findIndex(l => ENTETE.test(l) && !/\d+[.,]\d{2}/.test(l)));
    let ordre = '', dernier = null, attente = [], section = '', n = 0;
    L.slice(debut).forEach((l, k) => {
      const bas = norm(l), suivante = L[debut + k + 1] || '';
      if (ENTETE.test(l) && !/\d+[.,]\d{2}/.test(l)) {
        const iq = bas.search(/\bqt|quantit/), ip = bas.search(/\bp ?u\b|prix/);
        if (iq >= 0 && ip >= 0) ordre = ip < iq ? 'pu-q' : 'q-pu';
        dernier = null; attente = []; return;
      }
      if (FRAGMENT_ENTETE.test(l.replace(/\t/g, ' ').trim()) || PAGE.test(l)) return;
      if (COORDONNEES.test(l)) { dernier = null; return; }
      const v = dernierNombre(l);
      if (TOTAL.test(l.trim()) && v !== null) {
        if (/^sous[- ]?total/i.test(l)) out.sousTotaux.push({ libelle: libelleDe(l), montant: v, section });
        else if (/ttc|tva|t\.v\.a|acompte|net [àa] payer|reste/i.test(l)) out.autresTotaux.push({ libelle: l.split('\t')[0].trim(), montant: v });
        else if (/total\s+(g[ée]n[ée]ral\s+)?(net\s+)?h\.?\s?t|total\s+net\s+h|montant\s+(total\s+)?(net\s+)?h\.?\s?t|total\s+g[ée]n[ée]ral/i.test(l) && !/frais|options?\b/i.test(l)) {
          if (out.totalHT === null || /g[ée]n[ée]ral/i.test(l) || !out.totalGeneral) { out.totalHT = v; out.totalGeneral = out.totalGeneral || /g[ée]n[ée]ral/i.test(l); }
        } else out.autresTotaux.push({ libelle: l.split('\t')[0].trim(), montant: v });
        dernier = null; attente = []; return;
      }
      if (/^remise/i.test(l) && v !== null) { if (/%/.test(l)) out.remiseGlobale = v; else out.remiseMontant = Math.abs(v); dernier = null; return; }
      if (FRAIS.test(l.trim()) && v !== null && !/franco/i.test(l)) { out.frais.push({ libelle: libelleDe(l).slice(0, 80), montant: v }); dernier = null; attente = []; return; }
      const a = ligneArticle(l, ordre);
      if (a) {
        // Désignation écrite au-dessus de la ligne chiffrée (la ligne ne porte que la référence et les prix)
        if (!a.designation && attente.length) { a.designation = attente.join(' ').slice(0, 200); attente = []; }
        if (!a.designation && !a.reference) return;
        if (FRAIS.test(a.designation)) { out.frais.push({ libelle: a.designation.slice(0, 80), montant: a.total }); dernier = null; return; }
        if (attente.length) { section = attente.filter(x => x.length <= 80).slice(-2).join(' › '); attente = []; }
        dernier = { n: ++n, ...a, section, details: [] };
        out.lignes.push(dernier);
        return;
      }
      // Ligne de texte : suite de l'article précédent, sinon intitulé de section (ou désignation de l'article suivant)
      const libelleValeur = /\s:\s|:\s*$|\t:/.test(l) && !dernier;
      if (libelleValeur || TITRE_DOC.test(l) && !dernier) return;
      const prochaine = ligneArticle(suivante, ordre);
      if (dernier && !(prochaine && (intitule(l) || !prochaine.designation))) {
        if (!dernier.details.length && dernier.designation.length < 40 && l.length < 60 && !/:/.test(l)) dernier.designation = `${dernier.designation} ${l}`.trim();
        else if (dernier.details.length < 15) dernier.details.push(l.slice(0, 160));
        return;
      }
      dernier = null;
      attente = [...attente, l].slice(-3);
    });
    out.lignes.forEach(l => { l.details = l.details.join(' ').slice(0, 600); });
    // Contrôle : somme des lignes (remise globale, frais) face au total HT du document
    const somme = r2(out.lignes.reduce((t, l) => t + l.total, 0)), frais = r2(out.frais.reduce((t, x) => t + x.montant, 0));
    out.sommeLignes = somme; out.totalFrais = frais;
    out.totalCalcule = r2(somme * (1 - out.remiseGlobale / 100) - out.remiseMontant + frais);
    out.coherent = out.totalHT === null ? null : [out.totalCalcule, somme, r2(somme + frais), r2(somme * (1 - out.remiseGlobale / 100) - out.remiseMontant)].some(x => proche(x, out.totalHT));
    out.ecart = out.totalHT === null ? 0 : r2(out.totalHT - out.totalCalcule);
    // Sous-totaux : chaque sous-total doit égaler la somme des lignes de sa section depuis le sous-total précédent
    if (out.totalHT !== null && !out.coherent) out.alertes.push(`Total HT du document ${out.totalHT} : la somme des lignes lues (frais compris) fait ${out.totalCalcule} — ligne manquée ou mal lue.`);
    if (!out.lignes.length) out.alertes.push('Aucune ligne de prix reconnue (quantité × prix unitaire = total).');
    if (!out.fournisseur) out.alertes.push('Fournisseur non reconnu : à choisir.');
    delete out.totalGeneral;
    return out;
  }

  /* ---------- Rapprochement avec le matériel retenu / les lignes demandées ---------- */
  const FAMILLES = [['prestation', /^(?:mise en service|prestations?|main d ?oeuvre|deplacement|formation|essais?)\b/], ['pac', /pompes? a chaleur|\bpac\b|groupes? (?:froid|d eau glacee|de production)|refroidisseur|thermofrigo/], ['cta', /\bcta\b|centrale|traitement d ?air|double flux/],
    ['bouche', /bouche|grille|diffuseur|anemostat|buse/], ['registre', /registre|volet/], ['silencieux', /silencieux|piege a son/], ['manchette', /manchette|raccord souple|anti ?vibrat/],
    ['caisson', /caisson|extracteur|ventilateur|tourelle/], ['pompe', /pompe|circulateur|accelerateur/], ['vanne', /vanne|robinet|clapet/],
    ['regulation', /regulat|sonde|automate|thermostat|servomoteur|moteur|actionneur|gtb|gtc/], ['vase', /vase/], ['generateur', /chaudiere|generateur|bruleur/],
    ['ballon', /ballon|preparateur|tampon|chauffe ?eau/], ['echangeur', /echangeur/], ['terminal', /ventilo|cassette|radiateur|aerotherme|split|unite interieure/],
    ['prestation', /mise en service|prestation|main d ?oeuvre|deplacement|formation|essais?/]];
  const FAMILLE_CLE = { bouche: 'bouche', pompe: 'pompe', vanne: 'vanne', equil: 'vanne', isol: 'vanne', vase: 'vase', tampon: 'ballon', ballon: 'ballon', echangeur: 'echangeur', registre: 'registre', manchette: 'manchette', cta: 'cta', soupape: 'vanne', desemboueur: 'vanne' };
  function famille(texte, cle = '') {
    const [k, a] = String(cle || '').split('|');
    if (k === 'aero') return /^cta/.test(a || '') ? 'cta' : 'caisson';
    if (k === 'gen') return /^(pac|gf)/.test(a || '') ? 'pac' : 'generateur';
    if (FAMILLE_CLE[k]) return FAMILLE_CLE[k];
    // Famille dont le mot-clé vient le plus tôt dans le texte (« Registre … grille de conduit » : un registre)
    const t = norm(texte), f = FAMILLES.map(([nom, re]) => [nom, t.search(re)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1])[0];
    return f ? f[0] : '';
  }
  // Grandeurs : DN, diamètre, dimensions L×H, débit, puissance, volume
  function grandeurs(texte) {
    const t = String(texte || '').toLowerCase().replace(/(\d)\s+(\d{3})\b/g, '$1$2').replace(/,/g, '.'), out = new Set();
    let m;
    const re = [/\bdn\s*(\d{2,4})\b/g, /(?:ø|⌀|diam(?:etre|ètre)?\.?)\s*(\d{2,4})\b/g, /\b(\d{2,4})\s*[x×]\s*(\d{2,4})\b/g, /(\d+(?:\.\d+)?)\s*m3\s*\/\s*h|(\d+(?:\.\d+)?)\s*m³\s*\/\s*h/g, /(\d+(?:\.\d+)?)\s*kw\b/g, /(\d{2,5})\s*(?:l|litres?)\b/g];
    re.forEach((r, i) => { while ((m = r.exec(t))) out.add(i === 2 ? `${m[1]}x${m[2]}` : `${['dn', 'd', '', 'q', 'p', 'v'][i]}${Number(m[1] || m[2])}`); });
    t.replace(/(\d{3,5})\s*m3\s*h\b/g, (x, q) => out.add(`q${Number(q)}`));
    // Diamètre de gaine écrit seul après la famille (« Registre 315 », « Ø 315 »)
    (t.match(/\b(100|125|160|200|250|315|355|400|450|500|630)\b/g) || []).forEach(d => out.add(`d${d}`));
    return out;
  }
  const VIDES = new Set(['pour', 'avec', 'sans', 'type', 'des', 'les', 'une', 'aux', 'compris', 'fourniture', 'pose', 'et', 'de', 'du', 'la', 'le', 'en', 'sur', 'par', 'ref', 'reference', 'marque', 'modele', 'ou', 'equivalent']);
  const mots = t => new Set(norm(t).split(' ').filter(m => (m.length >= 3 || /\d/.test(m)) && !VIDES.has(m)));
  // Score d'une ligne lue pour une cible { cle, designation, reference, fabricant, qte } : 0 à 1, avec le motif
  function score(l, c) {
    const refC = compact(c.reference), refL = compact(l.reference), texteL = `${l.reference || ''} ${l.designation || ''}`;
    if (refC.length >= 3 && (refL === refC || compact(texteL).includes(refC))) return { s: 1, motif: 'référence' };
    if (refL.length >= 4 && compact(`${c.reference || ''} ${c.designation || ''}`).includes(refL)) return { s: 0.95, motif: 'référence' };
    const fl = famille(l.designation) || famille(l.details || ''), fc = famille(c.designation, c.cle);
    if (fl && fc && fl !== fc) return { s: 0, motif: 'famille différente' };
    const a = mots(`${l.designation} ${String(l.details || '').slice(0, 200)}`), b = mots(`${c.designation} ${c.fabricant || ''}`);
    let communs = 0; a.forEach(m => { if (b.has(m)) communs++; });
    let s = a.size && b.size ? 0.55 * communs / Math.min(a.size, b.size) : 0;
    const motifs = [];
    if (fl && fl === fc) { s += 0.3; motifs.push(`famille ${fl}`); }
    // Grandeurs de même nature des deux côtés (DN, Ø, L×H, débit, puissance, volume) : concordance ou écart
    const ga = grandeurs(`${l.designation} ${l.details || ''} ${l.section || ''}`), gb = grandeurs(c.designation), nature = g => g.replace(/[\d.]+.*$/, '') || 'x';
    const natures = [...new Set([...gb].map(nature))].filter(n => [...ga].some(g => nature(g) === n));
    if (natures.length) {
      const g = [...gb].filter(x => ga.has(x));
      if (g.length) { s += 0.2; motifs.push(`grandeur ${g[0].replace(/^d(?=\d)/, 'Ø').replace(/^q/, '').replace(/^dn/, 'DN')}`); } else { s *= 0.4; motifs.push('grandeur différente'); }
    }
    if (Number(l.qte) > 0 && Math.abs(Number(l.qte) - Number(c.qte)) < 1e-9) { s += 0.05; motifs.push('même quantité'); }
    if (communs) motifs.unshift(`${communs} mot(s) commun(s)`);
    return { s: Math.min(0.94, Math.round(s * 100) / 100), motif: motifs.join(', ') };
  }
  const SEUIL = 0.45;
  // Associe chaque ligne lue à une cible (une cible au plus par ligne et inversement), du meilleur score au moins bon ;
  // manuel : { [indexLigne]: cle | '' } (choix fait à la main, prioritaire ; '' = ligne laissée sans cible)
  function associer(lignes, cibles, manuel = {}) {
    const paires = [], cands = {};
    (lignes || []).forEach((l, i) => (cibles || []).forEach(c => { const r = score(l, c); if (r.s > 0) { (cands[i] = cands[i] || []).push({ cle: c.cle, s: r.s, motif: r.motif }); if (r.s >= SEUIL) paires.push({ i, cle: c.cle, s: r.s, motif: r.motif }); } }));
    Object.values(cands).forEach(x => x.sort((a, b) => b.s - a.s).splice(5));
    const parLigne = {}, prises = new Set();
    Object.entries(manuel || {}).forEach(([i, cle]) => { parLigne[i] = cle ? { cle, s: 1, motif: 'choix manuel', manuel: true } : { cle: '', s: 0, motif: 'écartée', manuel: true }; if (cle) prises.add(cle); });
    paires.sort((a, b) => b.s - a.s).forEach(p => { if (!parLigne[p.i] && !prises.has(p.cle)) { parLigne[p.i] = { cle: p.cle, s: p.s, motif: p.motif }; prises.add(p.cle); } });
    (lignes || []).forEach((_, i) => { if (parLigne[i]) parLigne[i].candidats = cands[i] || []; else parLigne[i] = { cle: '', s: 0, motif: '', candidats: cands[i] || [] }; });
    return { parLigne, nonAssociees: (lignes || []).map((_, i) => i).filter(i => !parLigne[i].cle), manquantes: (cibles || []).filter(c => !prises.has(c.cle)).map(c => c.cle) };
  }
  // Cibles tirées des lignes d'une consultation Pipe-Fit (index de ligne comme clé ; référence validée de l'étude)
  const ciblesConsultation = (lignes, articles = []) => (lignes || []).map((l, i) => {
    const art = l.articleId ? (articles || []).find(a => a.id === l.articleId) : null;
    return { cle: String(i), designation: l.designation, qte: Number(l.qte) || 0, reference: (l.materiel && l.materiel.reference) || l.refFournisseur || (art && (art.refFournisseur || art.ref)) || '', fabricant: (l.materiel && l.materiel.fabricant) || '', etude: l.materiel ? `${l.materiel.etudeId}|${l.materiel.cle}` : '' };
  });

  /* ---------- Prix retenus et comparatif ---------- */
  // Source d'un prix : « Devis ACME Distribution n° D-123 du 12/03/2026 »
  const dateFr = d => (d ? d.split('-').reverse().join('/') : '');
  const source = d => ['Devis', d.fournisseur, d.numero ? `n° ${d.numero}` : '', d.date ? `du ${dateFr(d.date)}` : ''].filter(Boolean).join(' ');
  // Prix par cible d'après un devis lu et ses associations : { cle: { pu, puBrut, remise, unite, qteDevis, fournisseur, numero, date, validite, fichier, ligne, source } }
  function prixRetenus(devis, parLigne) {
    const out = {};
    (devis.lignes || []).forEach((l, i) => {
      const a = (parLigne || {})[i];
      if (!a || !a.cle || out[a.cle]) return;
      out[a.cle] = { pu: l.pu, puBrut: l.puBrut, remise: l.remise, unite: l.unite || '', qteDevis: l.qte, reference: l.reference || '', ligne: String(l.designation || '').slice(0, 160),
        fournisseur: devis.fournisseur || '', numero: devis.numero || '', date: devis.date || '', validite: devis.validite || '', fichier: devis.fichier || '', devisId: devis.id || '', source: source(devis) };
    });
    return out;
  }
  // Plusieurs devis pour une même consultation : prix de chaque cible chez chacun (à la quantité demandée), moins-disant
  // par ligne et au total, lignes manquantes (non chiffrées) et lignes en plus (lues, sans cible)
  // devis : [{ id, fournisseur, numero, date, lignes, frais, totalFrais, totalHT, parLigne? }] ; cibles : [{ cle, designation, qte }]
  function comparer(devis, cibles) {
    const cs = cibles || [];
    const cols = (devis || []).map((d, k) => {
      const parLigne = d.parLigne || associer(d.lignes, cs).parLigne, prix = prixRetenus(d, parLigne);
      const chiffrees = cs.filter(c => prix[c.cle]), frais = d.totalFrais !== undefined ? d.totalFrais : (d.frais || []).reduce((t, x) => t + x.montant, 0);
      const total = r2(chiffrees.reduce((t, c) => t + prix[c.cle].pu * (Number(c.qte) || 0), 0) + frais);
      return { id: d.id || String(k), fournisseur: d.fournisseur || `Devis ${k + 1}`, numero: d.numero || '', date: d.date || '', validite: d.validite || '', totalHT: d.totalHT ?? null, frais: r2(frais), total, prix,
        nbChiffrees: chiffrees.length, complet: cs.length > 0 && chiffrees.length === cs.length, manquantes: cs.filter(c => !prix[c.cle]).map(c => c.cle),
        enPlus: (d.lignes || []).map((l, i) => i).filter(i => !(parLigne[i] && parLigne[i].cle)) };
    });
    const lignes = cs.map(c => {
      const offres = cols.filter(x => x.prix[c.cle]).map(x => ({ id: x.id, pu: x.prix[c.cle].pu, total: r2(x.prix[c.cle].pu * (Number(c.qte) || 0)) })).sort((a, b) => a.pu - b.pu);
      return { cle: c.cle, designation: c.designation, qte: Number(c.qte) || 0, prix: Object.fromEntries(offres.map(o => [o.id, o])), moinsDisant: offres[0] ? offres[0].id : '',
        ecart: offres.length > 1 ? r2(offres[offres.length - 1].total - offres[0].total) : 0, nbOffres: offres.length };
    });
    const complets = cols.filter(x => x.complet).sort((a, b) => a.total - b.total);
    const parties = [...new Set(lignes.map(l => l.moinsDisant).filter(Boolean))];
    const optimum = r2(lignes.reduce((t, l) => t + (l.moinsDisant ? l.prix[l.moinsDisant].total : 0), 0) + parties.reduce((t, id) => t + (cols.find(x => x.id === id) || {}).frais, 0));
    return { colonnes: cols, lignes, moinsDisant: complets[0] ? complets[0].id : '', ecartTotal: complets.length > 1 ? r2(complets[1].total - complets[0].total) : 0, optimum, fournisseursOptimum: parties,
      sansOffre: lignes.filter(l => !l.nbOffres).map(l => l.cle) };
  }
  // Résumé gardé avec l'étude ou la consultation (sans le texte du document)
  const resume = (d, extra = {}) => ({ fournisseur: d.fournisseur, numero: d.numero, date: d.date, validite: d.validite, delai: d.delai, totalHT: d.totalHT, totalFrais: d.totalFrais, sommeLignes: d.sommeLignes, coherent: d.coherent,
    frais: (d.frais || []).slice(0, 10), lignes: (d.lignes || []).slice(0, 300).map(l => ({ reference: l.reference, designation: String(l.designation || '').slice(0, 200), qte: l.qte, unite: l.unite, pu: l.pu, puBrut: l.puBrut, remise: l.remise, total: l.total, section: String(l.section || '').slice(0, 120) })), ...extra });

  return { nombre, elements, ligneArticle, lire, fournisseurDe, famille, grandeurs, score, associer, SEUIL, ciblesConsultation, prixRetenus, comparer, source, resume };
})();
if (typeof module !== 'undefined') module.exports = DevisLecture;
