// Paie et relevés d'heures sur une période libre (du … au …) : heures VALIDÉES découpées en normales / supplémentaires
// semaine par semaine (durée hebdomadaire du contrat de la personne, sinon celle de l'entreprise), paniers, notes de frais,
// absences du planning. Colonnes du tableau envoyé au comptable choisies dans les réglages.
// Module commun navigateur / tests.
const Paie = (() => {
  const n = v => Number(String(v ?? '').replace(',', '.')) || 0;
  const jourIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Semaine ISO « 2026-W42 » d'une date « AAAA-MM-JJ »
  function semaine(date) {
    const [a, m, j] = String(date).split('-').map(Number), d = new Date(Date.UTC(a, m - 1, j)), w = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - w);
    return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, '0')}`;
  }
  // Période : « AAAA-MM » (un mois) ou { du, au }
  function periode(p) {
    if (typeof p === 'string' && /^\d{4}-\d{2}$/.test(p)) { const [a, m] = p.split('-').map(Number); return { du: `${p}-01`, au: jourIso(new Date(a, m, 0)) }; }
    return { du: (p && p.du) || '0000-01-01', au: (p && p.au) || '9999-12-31' };
  }
  const dans = (d, p) => !!d && d >= p.du && d <= p.au;
  // Raccourcis de période autour d'une date
  function raccourcis(auj) {
    const d = new Date(`${auj}T12:00:00`), lundi = new Date(d); lundi.setDate(d.getDate() - ((d.getDay() || 7) - 1));
    const plus = (x, j) => { const y = new Date(x); y.setDate(y.getDate() + j); return jourIso(y); };
    const mois = (k) => { const x = new Date(d.getFullYear(), d.getMonth() + k, 1); return periode(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`); };
    return [['Ce mois', mois(0)], ['Mois dernier', mois(-1)], ['Cette semaine', { du: jourIso(lundi), au: plus(lundi, 6) }], ['Semaine dernière', { du: plus(lundi, -7), au: plus(lundi, -1) }]];
  }
  const dureeHebdo = (user, settings) => n(user && user.dureeHebdo) || n(settings && settings.dureeHebdo) || 35;

  // { temps, frais, planning } de toute l'entreprise ; renvoie la paie d'une personne sur la période
  function calculer({ user, temps = [], frais = [], planning = [], settings = {}, periode: per }) {
    const p = periode(per), base = dureeHebdo(user, settings), seuil50 = Math.max(base, n(settings.seuil50 || settings.seuilHS50) || 43);
    const parJour = {}, paniers = new Set();
    let attente = 0;
    temps.filter(t => t.userId === user.id && n(t.heures)).forEach(t => {
      if (t.statut === 'Validé') {
        parJour[t.date] = (parJour[t.date] || 0) + n(t.heures);
        if (t.panier && dans(t.date, p)) paniers.add(t.date);
      } else if (t.statut !== 'Refusé' && dans(t.date, p)) attente += n(t.heures);
    });
    const cumul = {}, semaines = {};
    const res = { jours: 0, total: 0, normales: 0, hs25: 0, hs50: 0, attente, semaines, base };
    // Les jours d'avant la période dans la même semaine comptent pour le seuil des heures supplémentaires
    Object.keys(parJour).sort().forEach(date => {
      const wk = semaine(date), h = parJour[date], avant = cumul[wk] || 0, apres = avant + h;
      cumul[wk] = apres;
      if (!dans(date, p)) return;
      const nn = Math.max(0, Math.min(apres, base) - avant), h25 = Math.max(0, Math.min(apres, seuil50) - Math.max(avant, base)), h50 = Math.max(0, apres - Math.max(avant, seuil50));
      res.jours++; res.total += h; res.normales += nn; res.hs25 += h25; res.hs50 += h50;
      const w = semaines[wk] = semaines[wk] || { total: 0, normales: 0, hs25: 0, hs50: 0 };
      w.total += h; w.normales += nn; w.hs25 += h25; w.hs50 += h50;
    });
    for (const wk in semaines) semaines[wk].semaineComplete = cumul[wk];
    res.paniers = paniers.size;
    res.montantPaniers = paniers.size * n(settings.montantPanier);
    res.frais = frais.filter(f => f.userId === user.id && ['Validée', 'Remboursée'].includes(f.statut) && dans(f.date, p)).reduce((s, f) => s + n(f.montantTTC), 0);
    res.brut = n(user.salaireHoraire) * (res.normales + res.hs25 * 1.25 + res.hs50 * 1.5);
    // Absences posées au planning (congés, maladie…) : nombre de jours par motif
    const abs = {};
    planning.filter(x => x.userId === user.id && x.absence && dans(x.date, p)).forEach(x => { abs[x.absence] = (abs[x.absence] || new Set()).add(x.date); });
    res.absences = Object.fromEntries(Object.entries(abs).map(([k, s]) => [k, s.size]));
    return res;
  }

  // Colonnes possibles du tableau de paie (comptable) ; « defaut » : cochées tant que rien n'est réglé
  const COLONNES = [
    ['matricule', 'Matricule', false], ['nom', 'Nom', true], ['statut', 'Salarié / intérimaire', true], ['agence', 'Agence d\'intérim', true], ['categorie', 'Catégorie', true],
    ['contrat', 'Durée hebdo du contrat', false], ['jours', 'Jours travaillés', true], ['total', 'Heures validées', true], ['normales', 'Heures normales', true],
    ['hs25', 'Heures sup. 25 %', true], ['hs50', 'Heures sup. 50 %', true], ['paniers', 'Nombre de paniers', true], ['montantPaniers', 'Montant des paniers', true],
    ['frais', 'Notes de frais', true], ['absences', 'Absences (planning)', true], ['brut', 'Brut estimé', false], ['attente', 'Heures à valider', true],
    ['deplacements', 'Déplacements (à compléter)', false], ['primes', 'Primes (à compléter)', false], ['observations', 'Observations', true],
  ];
  const OPTIONS = [['interimaires', 'Inclure les intérimaires', true], ['detail', 'Une feuille de détail par personne', true], ['notesFrais', 'Feuille des notes de frais', true], ['totaux', 'Ligne de totaux', true]];
  // Réglage enregistré { colonnes: {cle: bool}, options: {cle: bool} } complété des valeurs par défaut
  function reglage(r = {}) {
    const c = r.colonnes || {}, o = r.options || {};
    return { colonnes: COLONNES.filter(([k, , d]) => (c[k] === undefined ? d : !!c[k])).map(([k]) => k), options: Object.fromEntries(OPTIONS.map(([k, , d]) => [k, o[k] === undefined ? d : !!o[k]])) };
  }
  const libelleAbsences = a => Object.entries(a || {}).map(([k, j]) => `${k} ${j} j`).join(', ');
  return { semaine, periode, dans, raccourcis, dureeHebdo, calculer, COLONNES, OPTIONS, reglage, libelleAbsences };
})();
if (typeof module !== 'undefined') module.exports = Paie;
