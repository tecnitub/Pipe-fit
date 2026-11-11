// Réseau de gaz arborescent : appareils rattachés aux tronçons, débits cumulés avec simultanéité, diamètre de chaque
// tronçon (vitesse maximale et perte de pression répartie au prorata de la longueur sur le chemin le plus long), perte de
// pression jusqu'à l'appareil le plus défavorisé. Écoulement compressible (Calculs.compressible). Module pur.
const GazReseau = ((D, C, N, I) => {
  const { nf, num } = N;
  const alerte = (niveau, texte) => ({ niveau, texte });
  function calculer(e) {
    const alertes = [], g = I.GAZ[e.gaz] || I.GAZ.g20, prel = num(e.p, 21), pAbs = 1.01325 + prel / 1000, simult = num(e.simult, 100) / 100;
    const dpmax = e.dpmax === '' || e.dpmax === undefined ? (prel <= 100 ? 0.05 * prel : 0.1 * prel) : num(e.dpmax);
    const s = D.SERIES[e.serie] || D.SERIES['acier-10255'], tubes = C.tubes(e.serie || 'acier-10255'), vmax = num(e.vmax, 10), rhoDe = p => g[2] * p / 1.01325 * 273.15 / 288.15;
    const tr = (e.troncons || []).filter(x => x && x.rep).map(x => ({ rep: String(x.rep).trim(), amont: String(x.amont || '').trim(), nom: x.nom || '', L: num(x.L), zeta: num(x.zeta, 2), enfants: [], app: [] }));
    const parRep = new Map(); tr.forEach(t => parRep.set(t.rep, t));
    const racines = []; tr.forEach(t => { const p = t.amont && parRep.get(t.amont); if (t.amont && !p) alertes.push(alerte('erreur', `${t.rep} : tronçon amont « ${t.amont} » introuvable.`)); if (p && p !== t) p.enfants.push(t); else racines.push(t); });
    const apps = (e.appareils || []).filter(a => a && (a.nom || num(a.P) > 0)).map(a => { const o = { nom: a.nom || 'Appareil', P: num(a.P), t: parRep.get(String(a.troncon || '').trim()) }; if (!o.t) alertes.push(alerte('erreur', `${o.nom} : rattachez l'appareil à un tronçon.`)); else o.t.app.push(o); return o; });
    const cumul = t => { t.enfants.forEach(cumul); t.P = t.app.reduce((a, o) => a + o.P, 0) + t.enfants.reduce((a, c) => a + c.P, 0); t.nb = t.app.length + t.enfants.reduce((a, c) => a + c.nb, 0); };
    racines.forEach(cumul);
    const chemin = t => { const c = []; for (let x = t; x; x = x.amont ? parRep.get(x.amont) : null) { c.unshift(x); if (c.length > tr.length) break; } return c; };
    const feuilles = tr.filter(t => !t.enfants.length), Lch = t => chemin(t).reduce((a, x) => a + x.L, 0);
    // Longueur du plus long chemin passant par chaque tronçon : part de la perte admissible au prorata de la longueur
    tr.forEach(t => { t.Lmax = Math.max(...feuilles.filter(f => chemin(f).includes(t)).map(Lch), t.L) || t.L; });
    tr.forEach(t => {
      t.Pc = t.P * (t.nb > 1 ? simult : 1); t.Qn = t.Pc / g[1];
      const part = dpmax * (t.L / Math.max(t.Lmax, 0.01));
      const essai = tb => C.compressible({ m: t.Qn * g[2] / 3600, Di: tb.di / 1000, L: t.L, zeta: t.zeta, rug: s.rugosite, pEntree: pAbs, rhoDe, mu: g[3] });
      let choix = null;
      for (const tb of tubes) { const r = essai(tb); if (r.ok && r.dp * 1000 <= part + 1e-9 && r.vmax <= vmax) { choix = { tb, r }; break; } }
      if (!choix) { const tb = tubes[tubes.length - 1]; choix = { tb, r: essai(tb) }; alertes.push(alerte('erreur', `${t.rep} : aucun diamètre ne respecte la perte de pression répartie et la vitesse.`)); }
      t.tb = choix.tb; t.dp = choix.r.dp * 1000; t.v = choix.r.v;
    });
    const pire = feuilles.map(f => ({ f, dp: chemin(f).reduce((a, x) => a + x.dp, 0) })).reduce((a, b) => (!a || b.dp > a.dp ? b : a), null);
    if (pire) alertes.push(alerte(pire.dp <= dpmax + 1e-9 ? 'ok' : 'erreur', `Appareil le plus défavorisé (${pire.f.rep}) : ${nf(pire.dp, 2)} mbar de perte de pression pour ${nf(dpmax, 2)} mbar admissibles.`));
    alertes.push(alerte('attention', 'Organe de coupure générale à l\'extérieur, robinet de commande par appareil, essais d\'étanchéité et certificat de conformité (NF DTU 61.1, NF EN 15001).'));
    const Ptot = racines.reduce((a, t) => a + t.Pc, 0), Qn = Ptot / g[1];
    return {
      valeurs: { Ptot, Qn, dpmax, dpPire: pire ? pire.dp : 0, troncons: tr.map(t => ({ rep: t.rep, tube: t.tb.cle, L: t.L })), serie: e.serie || 'acier-10255' },
      resume: [['Débit calorifique simultané', `${nf(Ptot, 0)} kW PCI`], ['Débit de gaz', `${nf(Qn, 2)} m³(n)/h`], ['Pression de distribution', `${nf(prel, 0)} mbar`], ['Perte de pression admissible', `${nf(dpmax, 2)} mbar`],
        ...(pire ? [['Appareil le plus défavorisé', `${pire.f.rep} : ${nf(pire.dp, 2)} mbar`]] : [])],
      tableaux: [{ titre: 'Tronçons', entetes: ['Tronçon', 'Amont', 'Appareils', 'Puissance (kW)', 'Qn (m³(n)/h)', 'Tube', 'v (m/s)', 'L (m)', 'ΔP (mbar)'],
        lignes: tr.map(t => [t.rep, t.amont || 'compteur / détente', String(t.nb), nf(t.Pc, 0), nf(t.Qn, 2), t.tb.nom, nf(t.v, 1), nf(t.L, 1), nf(t.dp, 2)]) }],
      alertes,
      hypotheses: [`${g[0]} : PCI ${nf(g[1], 2)} kWh/m³(n). Simultanéité appliquée aux tronçons desservant plusieurs appareils.`, 'Perte de pression admissible répartie au prorata de la longueur sur le chemin le plus long ; écoulement compressible isotherme.'],
      synthese: `${apps.length} appareils · ${nf(Qn, 1)} m³(n)/h · ${pire ? `${nf(pire.dp, 2)} mbar au plus défavorisé` : ''}`,
    };
  }
  N.TYPES.gazReseau = {
    titre: 'Réseau de gaz arborescent (plusieurs appareils)', icone: '🔥', famille: 'Industriel',
    description: 'Tronçons et appareils, débits cumulés avec simultanéité, diamètre de chaque tronçon, perte de pression jusqu\'à l\'appareil le plus défavorisé.',
    champs: [{ g: 'Gaz' }, { k: 'gaz', l: 'Gaz distribué', t: 's', o: Object.entries(I.GAZ).map(([k, x]) => [k, x[0]]), d: 'g20' }, { k: 'p', l: 'Pression de distribution', u: 'mbar rel.', d: 21 },
      { k: 'dpmax', l: 'Perte de pression admissible (vide : 5 % en basse pression, 10 % au-delà de 100 mbar)', u: 'mbar', d: '' }, { k: 'vmax', l: 'Vitesse maximale', u: 'm/s', d: 10 },
      { k: 'simult', l: 'Coefficient de simultanéité', u: '%', d: 100 }, { k: 'serie', l: 'Série de tubes', t: 's', o: Object.entries(D.SERIES).filter(([k]) => /acier-10255|acier-10216|cuivre|pehd/.test(k)).map(([k, x]) => [k, x.libelle]), d: 'acier-10255' },
      { g: 'Réseau' },
      { k: 'chaufferie', l: 'Chaufferie de l\'étude (générateurs du schéma de principe ajoutés aux appareils)', t: 's', o: (e, et) => (typeof Liens !== 'undefined' ? Liens : require('./liens')).optPid(et, e && e.chaufferie) },
      { k: 'troncChaufferie', l: 'Tronçon qui dessert la chaufferie', t: 's', o: e => [['', '—'], ...((e && e.troncons) || []).filter(t => t && t.rep).map(t => [t.rep, `${t.rep}${t.nom ? ` — ${t.nom}` : ''}`])], si: e => !!e.chaufferie },
      { k: 'troncons', l: 'Tronçons (amont vide = compteur ou poste de détente)', t: 'lignes', d: [{ rep: 'G', amont: '', nom: 'Conduite principale', L: 25, zeta: 4 }, { rep: 'G1', amont: 'G', nom: 'Chaufferie', L: 8, zeta: 3 }, { rep: 'G2', amont: 'G', nom: 'Cuisine', L: 30, zeta: 5 }],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'amont', l: 'Amont', t: 's', o: N.optAmont('troncons', '— (compteur, détente)'), libre: true }, { k: 'nom', l: 'Désignation', t: 't' }, { k: 'L', l: 'Longueur (m)' }, { k: 'zeta', l: 'Σζ' }] },
      { k: 'appareils', l: 'Appareils', t: 'lignes', d: [{ nom: 'Chaudière 1', P: 150, troncon: 'G1' }, { nom: 'Chaudière 2', P: 150, troncon: 'G1' }, { nom: 'Fourneau', P: 40, troncon: 'G2' }],
        colonnes: [{ k: 'nom', l: 'Appareil', t: 't' }, { k: 'P', l: 'Débit calorifique (kW PCI)' }, { k: 'troncon', l: 'Tronçon', t: 's', o: e => [['', '—'], ...(e.troncons || []).filter(t => t.rep).map(t => [t.rep, `${t.rep}${t.nom ? ` — ${t.nom}` : ''}`])] }] }],
    calcul: calculer,
  };
  return { calculer };
})(typeof Donnees !== 'undefined' ? Donnees : require('./donnees'), typeof Calculs !== 'undefined' ? Calculs : require('./calculs'), typeof Notes !== 'undefined' ? Notes : require('./notes'), typeof Industriel !== 'undefined' ? Industriel : require('./industriel'));
if (typeof module !== 'undefined') module.exports = GazReseau;
