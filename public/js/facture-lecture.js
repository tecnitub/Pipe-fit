// Lecture d'une facture fournisseur en PDF simple (reçue par e-mail, scannée) : n° de facture, avoir, dates, échéance,
// totaux HT / TVA / TTC, SIRET et TVA du fournisseur, IBAN, commande ou chantier cités, lignes d'articles.
// Les identifiants de notre propre société (client de la facture) sont ignorés. Module commun navigateur / tests.
const FactureLecture = (() => {
  const OL = () => (typeof OffreLecture !== 'undefined' ? OffreLecture : require('./offre-lecture'));
  const r2 = v => Math.round(v * 100) / 100;
  const DATE = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/;
  const iso = m => `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const chiffres = s => String(s || '').replace(/\D/g, '');
  const MOIS = { janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12 };
  const DATE_LETTRES = /(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})/i;
  const dateDe = l => { const d = DATE.exec(l); if (d && +d[2] >= 1 && +d[2] <= 12) return iso(d); const t = DATE_LETTRES.exec(l); return t ? `${t[3]}-${String(MOIS[t[2].toLowerCase()]).padStart(2, '0')}-${t[1].padStart(2, '0')}` : ''; };
  // Dernier montant d'une ligne (« Total TTC ....... 1 234,56 € »)
  const montant = l => { const el = OL().elements(l).filter(x => /\d/.test(x)); for (let i = el.length - 1; i >= 0; i--) { const n = OL().nombre(el[i].replace(/€|eur/gi, '')); if (n !== null && !/%/.test(el[i])) return n; } return null; };

  // lignes : texte dans l'ordre de lecture ; options : { siret, tva } de notre société, codes : n° de commande et de chantier connus
  function analyser(lignes, { siret = '', tva = '', commandes = [], chantiers = [] } = {}) {
    const t = lignes.map(l => String(l || '').replace(/[   ]+/g, ' ').replace(/ *\t[\t ]*/g, '\t').trim()).filter(Boolean);
    const tout = t.join('\n'), out = { numero: '', type: 'facture', date: '', echeance: '', totalHT: null, totalTVA: null, totalTTC: null, siret: '', siren: '', tva: '', iban: '', refCommande: '', refAcheteur: '' };
    const nousSiren = chiffres(siret).slice(0, 9), nousTva = String(tva).replace(/\s/g, '').toUpperCase();
    let tvaTotale = false;
    if (/\bavoir\b|note de cr[ée]dit/i.test(t.slice(0, 12).join(' '))) out.type = 'avoir';
    t.forEach(l => {
      const bas = l.toLowerCase();
      // N° de facture (pas « facture n° de commande »)
      if (!out.numero) {
        const n = /(?:facture|avoir|invoice)\s*(?:n[°o]\.?|num[ée]ro|no\.?|#)\s*:?\s*([A-Z0-9][\w/.-]{2,30})/i.exec(l) || /^n[°o]\s*(?:de\s+)?(?:facture|pi[eè]ce)\s*:?\s*([A-Z0-9][\w/.-]{2,30})/i.exec(l);
        if (n && /\d/.test(n[1])) out.numero = n[1].replace(/[.,]$/, '');
      }
      if (/[ée]ch[ée]ance|date limite|payable (le|avant)|[àa] payer avant|date de (r[èe]glement|paiement)/i.test(l)) { const d = dateDe(l); if (d && !out.echeance) { out.echeance = d; return; } }
      if (!out.date && /date/i.test(l) && !/livraison|commande|[ée]ch[ée]ance|limite|validit/i.test(l)) out.date = dateDe(l);
      if (/net\s*[àa]\s*payer|total\s*t\.?t\.?c|montant\s*t\.?t\.?c/i.test(l)) { const n = montant(l); if (n !== null) out.totalTTC = n; }
      else if (/(total|montant)\s*(de\s*la\s*)?t\.?v\.?a/i.test(l) && !/intra|n[°o]/i.test(bas)) { const n = montant(l); if (n !== null) { out.totalTVA = n; tvaTotale = true; } }
      else if (/^t\.?v\.?a\b/i.test(l) && !/intra|n[°o]/i.test(bas) && !tvaTotale) { const n = montant(l); if (n !== null) out.totalTVA = r2((out.totalTVA || 0) + n); } // une ligne par taux
      else if (/total\s*(net\s*)?h\.?t|montant\s*(net\s*)?h\.?t|base\s*h\.?t/i.test(l)) { const n = montant(l); if (n !== null) out.totalHT = n; }
      // Identifiants du fournisseur (les nôtres apparaissent aussi : ignorés)
      for (const m of l.matchAll(/siret\s*:?\s*((?:\d\s?){14})/gi)) { const s = chiffres(m[1]); if (s.slice(0, 9) !== nousSiren && !out.siret) out.siret = s; }
      for (const m of l.matchAll(/siren\s*:?\s*((?:\d\s?){9})\b/gi)) { const s = chiffres(m[1]); if (s !== nousSiren && !out.siren) out.siren = s; }
      for (const m of l.matchAll(/\b(FR\s?[0-9A-Z]{2}\s?\d{3}\s?\d{3}\s?\d{3})\b/g)) { const v = m[1].replace(/\s/g, ''); if (v !== nousTva && v.slice(4) !== nousSiren && !out.tva) out.tva = v; }
      const ib = /\bIBAN\s*:?\s*(FR\d{2}(?:\s?[0-9A-Z]{4}){5}\s?[0-9A-Z]{3})/i.exec(l);
      if (ib && !out.iban) out.iban = ib[1].replace(/\s/g, '');
      const vc = /(?:votre|v\/)\s*(?:commande|cde|r[ée]f(?:[ée]rence)?)\.?\s*(?:n[°o])?\s*:?\s*([A-Z0-9][\w/.-]{2,30})/i.exec(l);
      if (vc && !out.refAcheteur) out.refAcheteur = vc[1];
    });
    if (!out.date) { const l = t.find(x => dateDe(x) && !/livraison|commande|[ée]ch[ée]ance|validit|n[ée]e? le/i.test(x)); if (l) out.date = dateDe(l); }
    if (!out.siren) out.siren = (out.siret || '').slice(0, 9) || (out.tva ? out.tva.slice(4) : '');
    // Commande ou chantier connus cités n'importe où dans la facture
    const plat = tout.toUpperCase().replace(/\s/g, '');
    const cmd = commandes.find(c => c && plat.includes(String(c).toUpperCase().replace(/\s/g, '')));
    if (cmd) out.refCommande = cmd;
    const ch = chantiers.find(c => c && plat.includes(String(c).toUpperCase().replace(/\s/g, '')));
    if (ch && !out.refAcheteur) out.refAcheteur = ch;
    // Lignes d'articles et cohérence des totaux
    const a = OL().analyser(t);
    out.lignes = a.lignes.map(l => ({ designation: l.designation, reference: l.ref || '', qte: l.qte, unite: l.unite || '', pu: l.pu, montantHT: l.montant }));
    if (a.port) out.lignes.push({ designation: 'Frais de port', reference: '', qte: 1, unite: '', pu: a.port, montantHT: a.port });
    if (out.totalHT === null && a.totalHT !== null) out.totalHT = a.totalHT;
    if (out.totalHT === null && out.totalTTC !== null && out.totalTVA !== null) out.totalHT = r2(out.totalTTC - out.totalTVA);
    if (out.totalTVA === null && out.totalHT !== null && out.totalTTC !== null) out.totalTVA = r2(out.totalTTC - out.totalHT);
    if (out.totalTTC === null && out.totalHT !== null && out.totalTVA !== null) out.totalTTC = r2(out.totalHT + out.totalTVA);
    out.coherent = out.totalHT !== null && out.totalTVA !== null && out.totalTTC !== null && Math.abs(out.totalHT + out.totalTVA - out.totalTTC) <= 0.05;
    out.manques = [!out.numero && 'n° de facture', !out.date && 'date', out.totalHT === null && 'total HT', out.totalTTC === null && 'total TTC'].filter(Boolean);
    return out;
  }
  return { analyser };
})();
if (typeof module !== 'undefined') module.exports = FactureLecture;
