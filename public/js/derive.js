// Dérive des chantiers : heures et achats consommés par rapport au budget du devis et à l'avancement facturé, marge à
// terminaison par rapport à la marge prévue. s = Calc.affaire(a). Module commun navigateur / serveur / tests.
const Derive = (() => {
  // heures, achats : seuil d'alerte en % du budget ; avance : points d'écart avec l'avancement facturé ; marge : points
  const DEFAUT = { actif: true, heures: 80, achats: 80, avance: 25, marge: 5 };
  const cfg = r => ({ ...DEFAUT, ...(r || {}) });
  const GRAVITE = { depassement: 3, attention: 2, avance: 1 };
  const r1 = v => Math.round(v * 10) / 10;
  const nb = (v, d = 0) => Number(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const EN_COURS = ['En préparation', 'En cours'];

  function alertes(a, s, reglages) {
    const r = cfg(reglages);
    if (!r.actif || !a || a.archive || a.type === 'horsDevis' || !EN_COURS.includes(a.statut) || !s) return [];
    const out = [], av = Math.max(0, Math.min(100, Number(s.pctFacture) || 0));
    const poste = (cle, conso, budget, texte) => {
      if (!(budget > 0) || !(conso > 0)) return;
      const pct = conso / budget * 100;
      const niveau = pct >= 100 ? 'depassement' : pct >= r[cle] ? 'attention' : pct >= 50 && pct - av >= r.avance ? 'avance' : '';
      if (niveau) out.push({ cle, niveau, pct: r1(pct), avancement: r1(av), texte: `${texte(pct)}${niveau === 'depassement' ? ' : budget dépassé' : ''} · facturé ${nb(av)} %` });
    };
    poste('heures', s.heuresPassees, s.heuresPrevues, p => `Heures : ${nb(s.heuresPassees)} h sur ${nb(s.heuresPrevues)} h prévues (${nb(p)} %)`);
    poste('achats', s.achats, s.budgetF, p => `Achats : ${nb(s.achats)} € sur ${nb(s.budgetF)} € de budget fournitures (${nb(p)} %)`);
    if (s.caDevis > 0 && (s.margeFin < 0 || s.margeFinPct < s.margePrevPct - r.marge)) {
      out.push({ cle: 'marge', niveau: s.margeFin < 0 ? 'depassement' : 'attention', pct: r1(s.margeFinPct), avancement: r1(av),
        texte: `Marge à terminaison ${nb(s.margeFinPct, 1)} % (${nb(s.margeFin)} €) au lieu de ${nb(s.margePrevPct, 1)} % prévus${s.margeFin < 0 ? ' : chantier à perte' : ''}` });
    }
    return out.sort((x, y) => GRAVITE[y.niveau] - GRAVITE[x.niveau]);
  }
  // Niveau le plus grave d'une liste d'alertes
  const pire = l => l.reduce((m, x) => (GRAVITE[x.niveau] > GRAVITE[m] ? x.niveau : m), l.length ? 'avance' : '');
  const LIBELLES = { depassement: 'Dépassement', attention: 'Attention', avance: 'En avance sur l\'avancement' };
  return { DEFAUT, cfg, alertes, pire, GRAVITE, LIBELLES };
})();
if (typeof module !== 'undefined') module.exports = Derive;
