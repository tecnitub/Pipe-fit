// Bon de livraison chiffré photographié au comptoir : n° du BL, date, référence chantier donnée au magasin, lignes
// d'articles et montant HT (total du bon, sinon somme des lignes et du port). Module commun navigateur / tests.
const BlLecture = (() => {
  const OL = () => (typeof OffreLecture !== 'undefined' ? OffreLecture : require('./offre-lecture'));
  const r2 = v => Math.round(v * 100) / 100;
  const NUM = /\b(?:BL|B\.L\.?|bon\s+de\s+livraison|bon\s+d'enl[eè]vement|ticket|bon)\s*(?:n[°o]\.?|num[ée]ro|:|#)?\s*([A-Z]{0,4}[-/]?\d[\w/-]{2,})/i;
  const DATE = /(\d{2})[/.-](\d{2})[/.-](\d{2,4})/;
  const REF = /(?:chantier|affaire|r[ée]f(?:[ée]rence)?\.?\s*(?:client|chantier|affaire)|votre\s+r[ée]f(?:[ée]rence)?\.?|v\/r[ée]f\.?)\s*[:#]?\s*([A-Z0-9][\w/.-]*(?: +[A-Z0-9][\w/.-]*){0,2})/i;

  function analyser(lignes) {
    const t = lignes.map(l => String(l || '').replace(/[   ]+/g, ' ').trim()).filter(Boolean);
    const out = { bl: '', date: '', refChantier: '', totalHT: null };
    t.forEach(l => {
      const n = !out.bl && NUM.exec(l); if (n && !/^(de|du|livraison)$/i.test(n[1])) out.bl = n[1];
      const d = !out.date && DATE.exec(l); if (d) out.date = `${d[3].length === 2 ? `20${d[3]}` : d[3]}-${d[2]}-${d[1]}`;
      const r = !out.refChantier && REF.exec(l); if (r) out.refChantier = r[1].trim();
      if (/total\s*(net\s*)?h\.?\s*t|montant\s*h\.?\s*t|net\s*h\.?\s*t/i.test(l)) { const el = OL().elements(l), v = OL().nombre((el.pop() || '').replace(/€/g, '')); if (v !== null) out.totalHT = v; }
    });
    const a = OL().analyser(t);
    out.lignes = a.lignes.map(l => ({ designation: l.designation, ref: l.ref || '', qte: l.qte, unite: l.unite || '', pu: l.pu, montant: l.montant }));
    out.port = a.port || 0;
    const somme = r2(out.lignes.reduce((s, l) => s + l.montant, 0) + out.port);
    out.montant = out.totalHT !== null ? out.totalHT : somme || null;
    out.coherent = out.totalHT === null || !out.lignes.length || Math.abs(out.totalHT - somme) <= Math.max(0.05, out.totalHT * 0.01);
    return out;
  }
  return { analyser };
})();
if (typeof module !== 'undefined') module.exports = BlLecture;
