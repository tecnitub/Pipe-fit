// Épreuve d'un réseau hydraulique (essai de résistance et d'étanchéité sous pression) : valeurs conseillées, durée,
// chute de pression et résultat, contrôle avant signature, état du manomètre. Module commun navigateur / serveur / tests.
const Epreuve = (() => {
  const NATURES = ['Chauffage (eau chaude)', 'Eau glacée', 'Eau froide sanitaire', 'Eau chaude sanitaire', 'Eau industrielle / process', 'Vapeur / condensats', 'Incendie (RIA, sprinkler)', 'Air comprimé', 'Gaz', 'Autre'];
  const FLUIDES = ['Eau', 'Air', 'Azote'];
  const n = v => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));
  const r2 = v => Math.round(v * 100) / 100;

  // Pression d'épreuve proposée : 1,5 fois la pression de service (modifiable selon le CCTP ou la norme du réseau)
  const pressionConseillee = ps => (n(ps) > 0 ? Math.round(n(ps) * 1.5 * 10) / 10 : null);
  // Durée en minutes entre deux heures « HH:MM » (passage de minuit compris)
  function duree(debut, fin) {
    const m = h => { const x = /^(\d{1,2}):(\d{2})$/.exec(String(h || '')); return x ? +x[1] * 60 + +x[2] : null; };
    const a = m(debut), b = m(fin);
    return a === null || b === null ? null : (b - a + 1440) % 1440;
  }
  const chute = e => (n(e.pressionDebut) === null || n(e.pressionFin) === null ? null : r2(n(e.pressionDebut) - n(e.pressionFin)));
  // Conforme : pression d'épreuve atteinte, maintenue la durée prévue, chute dans la tolérance
  function resultat(e) {
    const c = chute(e), pe = n(e.pressionEpreuve), d = duree(e.heureDebut, e.heureFin);
    if (c === null || !pe) return '';
    if (n(e.pressionDebut) < pe - 0.05) return 'Non conforme';
    if (n(e.dureePrevue) && d !== null && d < n(e.dureePrevue)) return 'Non conforme';
    return c <= (n(e.chuteAdmissible) || 0) + 1e-9 ? 'Conforme' : 'Non conforme';
  }
  // Ce qui manque pour signer le procès-verbal
  function manques(e) {
    return [!e.affaireId && 'chantier', !String(e.reseau || '').trim() && 'nom du réseau', !e.userId && 'technicien', !e.date && 'date',
      !(n(e.pressionEpreuve) > 0) && 'pression d\'épreuve', !(duree(e.heureDebut, e.heureFin) > 0) && 'heures de début et de fin',
      n(e.pressionDebut) === null && 'pression en début d\'épreuve', n(e.pressionFin) === null && 'pression en fin d\'épreuve'].filter(Boolean);
  }
  // Manomètre (matériel du parc) : étalonnage à jour à la date de l'épreuve ?
  function etalonnage(materiel, date) {
    const e = ((materiel && materiel.echeances) || []).find(x => /talonn/i.test(`${x.cle} ${x.libelle}`));
    if (!e || !e.prochaine) return { connu: false };
    return { connu: true, valableJusquau: e.prochaine, aJour: !date || e.prochaine >= date };
  }
  return { NATURES, FLUIDES, pressionConseillee, duree, chute, resultat, manques, etalonnage };
})();
if (typeof module !== 'undefined') module.exports = Epreuve;
