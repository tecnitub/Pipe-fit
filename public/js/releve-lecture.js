// Relevé mensuel d'un fournisseur (achats au comptoir) : bons de livraison (BL) avec la référence chantier donnée lors de
// l'enlèvement, leur montant ou le détail des articles. Retrouve le chantier de chaque BL, rapproche les BL des enlèvements
// déclarés par les compagnons, prépare la ventilation de la facture par chantier.
// Module commun navigateur / tests (utilise OffreLecture pour les lignes d'articles).
const ReleveLecture = (() => {
  const OL = () => (typeof OffreLecture !== 'undefined' ? OffreLecture : require('./offre-lecture'));
  const r2 = v => Math.round(v * 100) / 100;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const chiffres = s => String(s || '').replace(/\D/g, '').replace(/^0+/, '');
  const BL = /\b(?:BL|B\.L\.?|bon(?:\s+de)?\s+livraison|ticket|enl[eè]vement|bon)\s*(?:n[°o]\.?|num[ée]ro|:|#)?\s*([A-Z]{0,4}[-/]?\d[\w/-]{2,})/i;
  const REF = /(?:chantier|affaire|r[ée]f(?:[ée]rence)?\.?\s*(?:client|chantier|affaire|commande)?|votre\s+r[ée]f(?:[ée]rence)?\.?|v\/r[ée]f\.?|n°\s*affaire)\s*[:#]?\s*([A-Z0-9][\w/.-]*(?: +[A-Z0-9][\w/.-]*){0,3})/i;
  const DATE = /(\d{2})[/.-](\d{2})[/.-](\d{2,4})/;
  const iso = m => `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2]}-${m[1]}`;

  // Chantier d'une référence donnée au comptoir : code complet (CH-2026-001), fin du code (« 001 », « 26-001 »), ou nom
  function trouverAffaire(ref, affaires, date = '') {
    const t = String(ref || '').trim();
    if (!t) return null;
    const actifs = affaires.filter(a => a.code);
    const exact = actifs.find(a => norm(a.code) === norm(t) || norm(t).includes(norm(a.code)));
    if (exact) return exact;
    const c = chiffres(t);
    if (c.length >= 1 && c.length <= 8) {
      const cands = actifs.filter(a => { const ca = chiffres(a.code.split('-').slice(1).join('')), fin = chiffres(a.code.split('-').pop()); return fin === c || ca === c || (c.length >= 4 && ca.endsWith(c)); });
      if (cands.length === 1) return cands[0];
      // Même numéro sur plusieurs années : le chantier ouvert à la date du BL, sinon le plus récent
      const an = String(date || '').slice(0, 4), ouverts = cands.filter(a => !a.archive && !['Clos', 'Facturé'].includes(a.statut));
      return cands.find(a => an && a.code.includes(`-${an}-`)) || ouverts[0] || cands.sort((x, y) => String(y.code).localeCompare(String(x.code)))[0] || null;
    }
    // Nom du chantier ou du site (« RUMILLY », « NEP »)
    const mots = norm(t).split(' ').filter(m => m.length >= 4);
    if (!mots.length) return null;
    const notes = actifs.map(a => ({ a, n: mots.filter(m => norm(`${a.nom} ${a.lieu || ''}`).includes(m)).length })).filter(x => x.n).sort((x, y) => y.n - x.n);
    return notes.length && (notes.length === 1 || notes[0].n > notes[1].n) ? notes[0].a : null;
  }

  // lignes : texte du relevé dans l'ordre de lecture (colonnes séparées par des tabulations)
  function analyser(lignes, affaires = []) {
    const bls = [];
    let cur = null, totalHT = null;
    const codeDans = l => affaires.find(a => a.code && norm(l).includes(norm(a.code)));
    lignes.map(l => String(l || '').replace(/[   ]+/g, ' ').replace(/ *\t[\t ]*/g, '\t').trim()).filter(Boolean).forEach(l => {
      const bas = l.toLowerCase();
      if (/total\s*(g[ée]n[ée]ral\s*)?(du\s+relev[ée]\s*)?h\.?\s*t/i.test(l) && !BL.test(l)) { const n = OL().nombre(OL().elements(l).pop() || ''); if (n !== null) totalHT = n; return; }
      if (/\b(tva|ttc|net [àa] payer|[ée]ch[ée]ance|iban)\b/.test(bas) && !BL.test(l)) return;
      // « Total BL 4512 » : montant du BL en cours, pas un nouveau BL
      if (cur && /^total\s*(bl|b\.l\.?|bon|ticket)\b/i.test(l)) { const n = OL().nombre(OL().elements(l).pop() || ''); if (n !== null) cur.montant = n; return; }
      const b = BL.exec(l);
      const article = OL().analyserLigne(l.replace(BL, ' '));
      if (b && !/^(de|du|livraison)$/i.test(b[1])) {
        // Nouveau BL ; sur la même ligne : date, référence chantier, montant éventuels (relevé résumé, une ligne par BL)
        const d = DATE.exec(l), ref = REF.exec(l.replace(BL, ' ')), code = codeDans(l);
        const fin = OL().elements(l), dernier = fin.length ? OL().nombre(fin[fin.length - 1]) : null;
        cur = { bl: b[1], date: d ? iso(d) : '', refLue: code ? code.code : ref ? ref[1].trim() : '', montant: !article && dernier !== null && /[.,]\d{2}$/.test(fin[fin.length - 1]) ? dernier : null, lignes: [] };
        bls.push(cur);
        if (article && cur) cur.lignes.push(article);
        return;
      }
      if (!cur) return;
      // Référence chantier ou date sur une ligne à part, sous l'en-tête du BL
      const ref = REF.exec(l), code = codeDans(l);
      if (!article && (ref || code) && !cur.refLue) { cur.refLue = code ? code.code : ref[1].trim(); return; }
      if (!cur.date && !article) { const d = DATE.exec(l); if (d) cur.date = iso(d); }
      if (/total\s*(bl|bon|ticket)?/i.test(l) && !article) { const n = OL().nombre(OL().elements(l).pop() || ''); if (n !== null) cur.montant = n; return; }
      if (article) cur.lignes.push(article);
    });
    bls.forEach(x => {
      if (x.lignes.length) x.montant = r2(x.lignes.reduce((t, l) => t + l.montant, 0));
      const a = trouverAffaire(x.refLue, affaires, x.date);
      x.affaireId = a ? a.id : '';
    });
    const somme = r2(bls.reduce((t, x) => t + (x.montant || 0), 0));
    return { bls: bls.filter(x => x.montant !== null || x.lignes.length), totalHT, somme, coherent: totalHT === null || Math.abs(totalHT - somme) <= Math.max(0.05, totalHT * 0.002) };
  }

  // Enlèvement déclaré correspondant à un BL : même n° (chiffres), sinon même chantier, date proche et montant proche ;
// un BL sans chantier reconnu prend celui de la déclaration
  function rapprocher(bls, enlevements) {
    const pris = new Set();
    const parBl = bls.map(x => {
      const n = chiffres(x.bl);
      let e = enlevements.find(y => !pris.has(y.id) && n && chiffres(y.bl) === n);
      if (!e) e = enlevements.find(y => !pris.has(y.id) && y.affaireId && y.affaireId === x.affaireId && x.date && y.date && Math.abs(new Date(y.date) - new Date(x.date)) <= 3 * 86400000
        && (!y.montant || !x.montant || Math.abs(y.montant - x.montant) <= Math.max(2, x.montant * 0.05)));
      if (e) pris.add(e.id);
      // Référence du relevé illisible ou absente : chantier déclaré par le compagnon
      if (e && !x.affaireId && e.affaireId) { x.affaireId = e.affaireId; x.chantierDeclare = true; }
      return e || null;
    });
    return { parBl, nonFactures: enlevements.filter(y => !pris.has(y.id)) };
  }

  // Ventilation de la facture : une imputation par chantier (libellé avec les n° de BL) ; BL sans chantier à part
  function ventilation(bls) {
    const par = new Map();
    bls.filter(x => x.affaireId).forEach(x => { const v = par.get(x.affaireId) || { affaireId: x.affaireId, bls: [], montantHT: 0 }; v.bls.push(x.bl); v.montantHT = r2(v.montantHT + (x.montant || 0)); par.set(x.affaireId, v); });
    return { imputations: [...par.values()].map(v => ({ affaireId: v.affaireId, commandeId: '', libelle: `Comptoir : BL ${v.bls.join(', ')}`, montantHT: v.montantHT })),
      sansChantier: bls.filter(x => !x.affaireId) };
  }

  return { analyser, trouverAffaire, rapprocher, ventilation };
})();
if (typeof module !== 'undefined') module.exports = ReleveLecture;
