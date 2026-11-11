// Bilan thermique simplifié pièce par pièce : déperditions (coefficient volumique G selon l'isolation, renouvellement
// d'air) et apports d'été (vitrages selon l'orientation, occupants, éclairage et équipements). Les besoins de chaque
// pièce sont comparés aux terminaux installés dans la même pièce (calcul « Terminaux ») qui peuvent en être créés.
// Module pur (navigateur, node, tests).
const Pieces = ((N) => {
  const { nf, num } = N;
  const alerte = (niveau, texte) => ({ niveau, texte });
  // Coefficient G (W/m³·K, parois seules) selon l'isolation
  const ISOLATION = { re2020: ['Neuf RE 2020 / RT 2012', 0.35], bbc: ['Rénové performant (BBC rénovation)', 0.5], rt2000: ['RT 2000 / RT 2005', 0.7], annees80: ['Années 1975-2000', 1.0], ancien: ['Avant 1975, peu isolé', 1.5] };
  // Usages : [libellé, occupants par m², débit d'air neuf par occupant (m³/h), éclairage + équipements (W/m²)]
  const USAGES = { bureau: ['Bureau', 0.1, 25, 20], reunion: ['Salle de réunion', 0.5, 25, 15], open: ['Open space', 0.12, 25, 25], accueil: ['Accueil, hall', 0.1, 25, 10], classe: ['Salle de classe', 0.5, 18, 10],
    chambre: ['Chambre', 0.05, 25, 5], sejour: ['Séjour', 0.05, 25, 8], restaurant: ['Restaurant', 0.6, 22, 15], commerce: ['Commerce', 0.2, 22, 30], informatique: ['Local informatique', 0.02, 25, 300], sanitaires: ['Sanitaires', 0, 30, 5], circulation: ['Circulation', 0, 0, 5] };
  // Apport solaire par m² de vitrage (W/m², vitrage avec protection) selon l'orientation
  const SOLAIRE = { N: 40, NE: 90, E: 160, SE: 170, S: 140, SO: 180, O: 190, NO: 100, aucune: 0 };
  function calculer(e) {
    const alertes = [], Tb = num(e.Tbase, -7), Ti = num(e.Tint, 19), Te = num(e.Tete, 32), Tc = num(e.Tclim, 26), dTh = Ti - Tb, dTe = Te - Tc, G = (ISOLATION[e.isolation] || ISOLATION.rt2000)[1], rec = num(e.recup, 0) / 100;
    const pcs = (e.pieces || []).filter(p => p && (p.nom || num(p.S) > 0)).map(p => {
      const U = USAGES[p.usage] || USAGES.bureau, S = num(p.S), H = num(p.H, 2.7), V = S * H, occ = num(p.occ) > 0 ? num(p.occ) : Math.round(S * U[1] * 10) / 10, Qair = num(p.Qair) > 0 ? num(p.Qair) : occ * U[2];
      const parois = G * V * dTh, air = 0.34 * Qair * dTh * (1 - rec), Pch = (parois + air) * 1.1 / 1000;
      const vit = num(p.vitrage), sol = vit * (SOLAIRE[p.orient] ?? 0), occW = occ * 75, int = S * U[3], airE = 0.34 * Qair * dTe * (1 - rec), cond = G * V * dTe * 0.5;
      const Pfr = (sol + occW + int + airE + cond) * 1.1 / 1000;
      return { nom: p.nom || 'Pièce', etage: p.etage || '', usage: U[0], S, V, occ, Qair, parois, air, Pch, sol, occW, int, Pfr };
    });
    if (!pcs.length) alertes.push(alerte('attention', 'Ajoutez les pièces (surface, usage, vitrage et orientation).'));
    const Pch = pcs.reduce((a, p) => a + p.Pch, 0), Pfr = pcs.reduce((a, p) => a + p.Pfr, 0), S = pcs.reduce((a, p) => a + p.S, 0);
    if (pcs.length) alertes.push(alerte('ok', `${pcs.length} pièce(s), ${nf(S, 0)} m² : ${nf(Pch, 1)} kW de chauffage (${nf(Pch * 1000 / Math.max(S, 1), 0)} W/m²), ${nf(Pfr, 1)} kW de froid (${nf(Pfr * 1000 / Math.max(S, 1), 0)} W/m²).`));
    alertes.push(alerte('attention', 'Bilan simplifié (méthode des coefficients G et des ratios) pour l\'avant-projet et le choix des terminaux ; un calcul réglementaire (NF EN 12831) reste à faire pour l\'exécution.'));
    return {
      valeurs: { Pch, Pfr, S, pieces: pcs.map(p => ({ nom: p.nom, etage: p.etage, Pch: p.Pch, Pfr: p.Pfr, S: p.S, Qair: p.Qair })) },
      resume: [['Surface', `${nf(S, 0)} m²`], ['Puissance de chauffage', `${nf(Pch, 2)} kW`], ['Puissance de froid', `${nf(Pfr, 2)} kW`], ['Températures', `hiver ${nf(Tb, 0)} / ${nf(Ti, 0)} °C · été ${nf(Te, 0)} / ${nf(Tc, 0)} °C`]],
      tableaux: [{ titre: 'Besoins par pièce', entetes: ['Pièce', 'Étage', 'Usage', 'Surface (m²)', 'Occupants', 'Air neuf (m³/h)', 'Parois (W)', 'Renouvellement d\'air (W)', 'Chauffage (kW)', 'Solaire (W)', 'Internes (W)', 'Froid (kW)'],
        lignes: pcs.map(p => [p.nom, p.etage, p.usage, nf(p.S, 1), nf(p.occ, 1), nf(p.Qair, 0), nf(p.parois, 0), nf(p.air, 0), nf(p.Pch, 2), nf(p.sol, 0), nf(p.occW + p.int, 0), nf(p.Pfr, 2)]) }],
      alertes,
      hypotheses: [`Déperditions = G × V × ΔT + 0,34 × débit d'air × ΔT${rec ? ` × (1 − ${nf(rec * 100, 0)} % de récupération)` : ''}, majorées de 10 % (relance).`, 'Apports d\'été : vitrages × apport selon l\'orientation (protection solaire comprise), 75 W sensibles par occupant, éclairage et équipements selon l\'usage, air neuf et parois ; majorés de 10 %.'],
      synthese: `${pcs.length} pièces · ${nf(Pch, 1)} kW chaud · ${nf(Pfr, 1)} kW froid`,
    };
  }
  N.TYPES.pieces = {
    titre: 'Bilan thermique pièce par pièce (chauffage et climatisation)', icone: '🏠', famille: 'Thermique',
    description: 'Déperditions et apports de chaque pièce (isolation, vitrages et orientation, occupants, équipements) ; besoins comparés aux terminaux installés dans la pièce, terminaux créés en un clic.',
    champs: [{ g: 'Conditions' }, { k: 'Tbase', l: 'Température extérieure de base (hiver)', u: '°C', d: -7 }, { k: 'Tint', l: 'Température intérieure (hiver)', u: '°C', d: 19 },
      { k: 'Tete', l: 'Température extérieure (été)', u: '°C', d: 32 }, { k: 'Tclim', l: 'Température intérieure (été)', u: '°C', d: 26 },
      { k: 'isolation', l: 'Isolation du bâtiment', t: 's', o: Object.entries(ISOLATION).map(([k, x]) => [k, x[0]]), d: 'rt2000' }, { k: 'recup', l: 'Récupération de chaleur sur l\'air neuf (double flux)', u: '%', d: 0 },
      { g: 'Pièces' },
      { k: 'pieces', l: 'Pièces (le nom sert à retrouver les terminaux de la pièce)', t: 'lignes', d: [
        { nom: 'Bureau 1', etage: 'R+1', usage: 'bureau', S: 18, H: 2.7, vitrage: 4, orient: 'S', occ: '', Qair: '' }, { nom: 'Bureau 2', etage: 'R+1', usage: 'bureau', S: 15, H: 2.7, vitrage: 3, orient: 'O', occ: '', Qair: '' },
        { nom: 'Salle de réunion', etage: 'R+1', usage: 'reunion', S: 30, H: 2.7, vitrage: 6, orient: 'E', occ: '', Qair: '' }],
        colonnes: [{ k: 'nom', l: 'Pièce', t: 't' }, { k: 'etage', l: 'Étage', t: 't', lst: (e, et) => N.lieuxEtude(et).etages }, { k: 'usage', l: 'Usage', t: 's', o: Object.entries(USAGES).map(([k, x]) => [k, x[0]]) }, { k: 'S', l: 'Surface (m²)' }, { k: 'H', l: 'Hauteur (m)' },
          { k: 'vitrage', l: 'Vitrages (m²)' }, { k: 'orient', l: 'Orientation', t: 's', o: Object.keys(SOLAIRE).map(k => [k, k === 'aucune' ? 'Sans vitrage' : k]) }, { k: 'occ', l: 'Occupants (vide : selon l\'usage)' }, { k: 'Qair', l: 'Air neuf (m³/h) (vide : selon l\'usage)' }] }],
    calcul: calculer,
  };
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  // Besoins des pièces de l'étude (tous les bilans par pièce), indexés par nom de pièce normalisé
  function besoinsEtude(et) {
    const out = {};
    // Climat de l'étude : températures extérieures imposées à tous les bilans (comme dans le calcul affiché)
    let cl = null; try { cl = (typeof Liens !== 'undefined' ? Liens : require('./liens')).climatEtude(et); } catch (err) { cl = null; }
    ((et && et.notes) || []).filter(n => n.type === 'pieces').forEach(n => {
      let v; try { v = N.calculer('pieces', { ...N.defauts('pieces'), ...(n.entrees || {}), ...(cl ? { Tbase: cl.Tbase, Tete: cl.Tete } : {}) }).valeurs; } catch (err) { return; }
      v.pieces.forEach(p => { out[norm(p.nom)] = { ...p, note: n.id }; });
    });
    return out;
  }
  // Terminaux à ajouter pour les pièces qui n'en ont pas (puissances arrondies au-dessus)
  function terminauxManquants(et, appareils, type = 'cassette4') {
    const b = besoinsEtude(et), deja = new Set((appareils || []).map(a => norm(a.local)));
    return Object.values(b).filter(p => !deja.has(norm(p.nom))).map(p => ({ local: p.nom, type, Pch: Math.ceil(p.Pch * 10) / 10, Pfr: Math.ceil(p.Pfr * 10) / 10 }));
  }
  return { ISOLATION, USAGES, SOLAIRE, calculer, besoinsEtude, terminauxManquants, norm };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = Pieces;
