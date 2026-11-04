// Désenfumage mécanique : cantons (locaux, circulations), débits d'extraction et d'amenée d'air, ventilateur dimensionné
// sur le canton le plus exigeant (un seul canton désenfumé à la fois), sections de gaines et de bouches, volets, commandes
// et alimentation de sécurité ; équipements repris au bilan électrique. Valeurs usuelles de l'IT 246 (ERP) et du code
// du travail, à confirmer avec le bureau de contrôle et le SSI. Module pur (navigateur, node, tests).
const Desenfumage = ((N) => {
  const { nf, num } = N;
  const alerte = (niveau, texte) => ({ niveau, texte });
  const NATURES = { local: ['Local (> 300 m² ou aveugle > 100 m²)'], circulation: ['Circulation horizontale encloisonnée'], atrium: ['Volume de grande hauteur (atrium, hall)'] };
  // Débit d'extraction d'un canton (m³/s) et part d'amenée d'air
  function debit(z) {
    const S = num(z.S), H = num(z.H, 3);
    if (z.nature === 'circulation') { const up = Math.max(1, Math.round(num(z.largeur, 1.4) / 0.6)); return { Qe: Math.max(0.5 * up, 0.5), regle: `0,5 m³/s par unité de passage (${up} UP)`, amenee: 0.6 }; }
    if (z.nature === 'atrium') return { Qe: Math.max(1.5, S / 100 * Math.max(1, H / 6)), regle: '1 m³/s par 100 m², majoré avec la hauteur', amenee: 0.6 };
    return { Qe: Math.max(1.5, S / 100), regle: '1 m³/s par 100 m², au moins 1,5 m³/s', amenee: 0.6 };
  }
  function calculer(e) {
    const alertes = [], vG = num(e.vGaine, 10), vB = num(e.vBouche, 5), fuites = 1 + num(e.fuites, 20) / 100, dp = num(e.dp, 400);
    const zones = (e.cantons || []).filter(z => z && (z.rep || num(z.S) > 0)).map(z => { const d = debit(z), amenee = z.amenee || 'mecanique', Qe = num(z.Qimpose) > 0 ? num(z.Qimpose) : d.Qe, Qa = Qe * d.amenee;
      return { rep: z.rep || 'Canton', nom: z.nom || '', etage: z.etage || '', nature: z.nature || 'local', S: num(z.S), Qe, Qa, amenee, regle: num(z.Qimpose) > 0 ? 'débit imposé' : d.regle, nbBouches: Math.max(1, Math.ceil(Qe / (vB * 0.25))) }; });
    if (!zones.length) alertes.push(alerte('attention', 'Ajoutez les cantons à désenfumer.'));
    const maxi = zones.reduce((a, z) => (!a || z.Qe > a.Qe ? z : a), null);
    const Qv = maxi ? maxi.Qe * fuites : 0, Pel = Qv * dp / 0.55 / 1000, Sg = Qv / vG;
    const meca = zones.filter(z => z.amenee === 'mecanique'), QaMax = meca.reduce((a, z) => Math.max(a, z.Qa * fuites), 0), PelA = QaMax * dp * 0.7 / 0.55 / 1000;
    if (maxi) alertes.push(alerte('ok', `Ventilateur d'extraction : ${nf(Qv, 2)} m³/s (${nf(Qv * 3600, 0)} m³/h, canton ${maxi.rep} + ${nf((fuites - 1) * 100, 0)} % de fuites) sous ${nf(dp, 0)} Pa, ≈ ${nf(Pel, 1)} kW, classé F400 120.`));
    if (QaMax) alertes.push(alerte('ok', `Amenée d'air mécanique : ${nf(QaMax, 2)} m³/s, ≈ ${nf(PelA, 1)} kW.`));
    zones.filter(z => z.amenee === 'naturelle').forEach(z => alertes.push(alerte('attention', `${z.rep} : amenée d'air naturelle de ${nf(z.Qa / 5, 2)} m² libres au moins (vitesse ≤ 5 m/s), ouvrants en partie basse.`)));
    alertes.push(alerte('attention', 'Valeurs usuelles (IT 246, code du travail) : à valider avec le bureau de contrôle ; commande par le CMSI, alimentation électrique de sécurité (AES / groupe), câbles CR1, essais à la réception.'));
    const volets = zones.reduce((a, z) => a + z.nbBouches * (z.amenee === 'naturelle' ? 1 : 2), 0);
    return {
      valeurs: { Qv, Pel, QaMax, PelA, Sg, volets, cantons: zones.length, debits: zones.map(z => ({ repere: z.rep, local: [z.nom, z.etage].filter(Boolean).join(' '), type: 'Désenfumage (extraction)', theorique: Math.round(z.Qe * 3600) })) },
      resume: [['Cantons', String(zones.length)], ['Canton le plus exigeant', maxi ? `${maxi.rep} : ${nf(maxi.Qe, 2)} m³/s` : '—'], ['Ventilateur d\'extraction', `${nf(Qv * 3600, 0)} m³/h · ${nf(dp, 0)} Pa · ≈ ${nf(Pel, 1)} kW (F400 120)`],
        ['Amenée d\'air mécanique', QaMax ? `${nf(QaMax * 3600, 0)} m³/h · ≈ ${nf(PelA, 1)} kW` : 'naturelle'], ['Section du conduit principal', `${nf(Sg, 2)} m² à ${nf(vG, 0)} m/s (Ø ≈ ${nf(Math.sqrt(4 * Sg / Math.PI) * 1000, 0)} mm)`], ['Volets / bouches', String(volets)]],
      tableaux: [{ titre: 'Cantons de désenfumage', entetes: ['Canton', 'Désignation', 'Étage', 'Nature', 'Surface (m²)', 'Règle', 'Extraction (m³/s)', 'Extraction (m³/h)', 'Amenée (m³/s)', 'Amenée', 'Bouches d\'extraction'],
        lignes: zones.map(z => [`${z === maxi ? '★ ' : ''}${z.rep}`, z.nom, z.etage, NATURES[z.nature][0], nf(z.S, 0), z.regle, nf(z.Qe, 2), nf(z.Qe * 3600, 0), nf(z.Qa, 2), z.amenee === 'naturelle' ? 'naturelle' : 'mécanique', String(z.nbBouches)]) }],
      alertes,
      hypotheses: ['Un seul canton désenfumé à la fois : ventilateur dimensionné sur le canton le plus exigeant, majoré des fuites des conduits et des volets fermés.', 'Amenée d\'air ≈ 60 % de l\'extraction ; bouches à 5 m/s (0,25 m² par bouche).', `Puissance = débit × pression / rendement 0,55.`],
      synthese: `${zones.length} canton(s) · ventilateur ${nf(Qv * 3600, 0)} m³/h`,
    };
  }
  N.TYPES.desenfumage = {
    titre: 'Désenfumage mécanique (cantons, ventilateurs, volets)', icone: '🔥', famille: 'Aéraulique',
    description: 'Débits d\'extraction et d\'amenée d\'air par canton, ventilateur F400 sur le canton le plus exigeant, conduits, bouches et volets, commandes et alimentation de sécurité.',
    champs: [{ g: 'Hypothèses' }, { k: 'fuites', l: 'Fuites des conduits et volets fermés', u: '%', d: 20 }, { k: 'dp', l: 'Pression du ventilateur', u: 'Pa', d: 400 },
      { k: 'vGaine', l: 'Vitesse dans les conduits', u: 'm/s', d: 10 }, { k: 'vBouche', l: 'Vitesse aux bouches', u: 'm/s', d: 5 },
      { k: 'alim', l: 'Ventilateurs alimentés par', t: 's', o: (e, et) => (typeof Terminaux !== 'undefined' ? Terminaux : require('./terminaux')).optAlim(e, et, e.alim), d: '' },
      { g: 'Cantons' },
      { k: 'cantons', l: 'Cantons à désenfumer', t: 'lignes', d: [{ rep: 'C1', nom: 'Plateau bureaux', etage: 'R+1', nature: 'local', S: 450, H: 3, largeur: '', amenee: 'mecanique', Qimpose: '' }, { rep: 'C2', nom: 'Circulation', etage: 'R+1', nature: 'circulation', S: 120, H: 2.7, largeur: 1.4, amenee: 'naturelle', Qimpose: '' }],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'nom', l: 'Désignation', t: 't' }, { k: 'etage', l: 'Étage', t: 't' }, { k: 'nature', l: 'Nature', t: 's', o: Object.entries(NATURES).map(([k, x]) => [k, x[0]]) },
          { k: 'S', l: 'Surface (m²)' }, { k: 'H', l: 'Hauteur (m)' }, { k: 'largeur', l: 'Largeur circulation (m)' }, { k: 'amenee', l: 'Amenée d\'air', t: 's', o: [['mecanique', 'Mécanique'], ['naturelle', 'Naturelle']] }, { k: 'Qimpose', l: 'Débit imposé (m³/s)' }] }],
    calcul: calculer,
  };
  return { calculer, debit, NATURES };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = Desenfumage;
