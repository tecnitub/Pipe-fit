// Calculs complémentaires du bureau d'études industriel : purgeurs et condensats, réseau de gaz, ventilation de chaufferie,
// NPSH des pompes, coup de bélier, production d'eau chaude sanitaire (ballon et échangeur).
const Industriel = ((D, C, N) => {
  const { nf, num } = N;
  const alerte = (niveau, texte) => ({ niveau, texte });
  const optSeries = f => Object.entries(D.SERIES).filter(([k]) => f(k)).map(([k, s]) => [k, s.libelle]);
  const optTubes = e => C.tubes(e.serie || 'acier-10216').map(t => [t.cle, t.nom]);
  // Pression de vapeur saturante de l'eau (Pa), équation d'Antoine (deux plages)
  const psat = T => { const [A, B, Cc] = T <= 100 ? [8.07131, 1730.63, 233.426] : [8.14019, 1810.94, 244.485]; return 10 ** (A - B / (Cc + T)) * 133.322; };
  const patmAltitude = h => 101325 * (1 - 2.25577e-5 * h) ** 5.25588; // Pa

  /* ---------- Purgeurs et conduites de condensats ---------- */
  N.TYPES.condensats = {
    titre: 'Purgeurs et conduites de condensats', icone: '💧', famille: 'Industriel',
    description: 'Type et capacité du purgeur, revaporisation, diamètre de la conduite de retour (diphasique ou pompée), pompe de relevage.',
    champs: [{ g: 'Vapeur et application' }, { k: 'p1', l: 'Pression de vapeur à l\'utilisateur', u: 'bar rel.', d: 6 }, { k: 'm', l: 'Débit de condensats (= débit de vapeur)', u: 'kg/h', d: 800 },
      { k: 'application', l: 'Application', t: 's', o: [['ligne', 'Purge de ligne vapeur'], ['echangeur', 'Échangeur, batterie à vanne de régulation'], ['tracage', 'Traçage vapeur'], ['process', 'Process sans régulation (cuve, autoclave)']], d: 'echangeur' },
      { g: 'Retour des condensats' }, { k: 'p2', l: 'Pression du réseau de retour', u: 'bar rel.', d: 0.2 }, { k: 'Hrel', l: 'Hauteur de relevage après le purgeur', u: 'm', d: 3 },
      { k: 'retour', l: 'Retour', t: 's', o: [['diphasique', 'Diphasique après purgeur (revaporisation)'], ['pompe', 'Pompé (bâche et pompe de relevage)']], d: 'diphasique' },
      { k: 'serie', l: 'Série de tubes', t: 's', o: optSeries(k => /acier|inox/.test(k)), d: 'acier-10216' }, { k: 'L', l: 'Longueur de la conduite de retour', u: 'm', d: 60 },
      { k: 'vmax', l: 'Vitesse maximale (vapeur de revaporisation / liquide pompé)', u: 'm/s', d: 15 }],
    calcul(e) {
      const p1 = num(e.p1) + 1.013, p2 = num(e.p2) + 1.013, m = num(e.m), s1 = C.vapeurSat(p1), s2 = C.vapeurSat(p2), alertes = [];
      const coef = { ligne: 3, echangeur: 2, tracage: 2, process: 2 }[e.application] || 2, dpRel = num(e.Hrel) * 958 * C.G / 1e5;
      const dpPurgeur = p1 - p2 - dpRel, capacite = m * coef;
      const types = { ligne: 'Thermodynamique ou à flotteur (purge de ligne, démarrage)', echangeur: 'À flotteur fermé (évacuation continue, suit la charge)', tracage: 'Thermostatique (bilame ou capsule)', process: 'À flotteur ou à seau inversé' };
      const x = Math.max(0, (s1.hl - s2.hl) / s2.r), flash = x * m, tubes = C.tubes(e.serie), vmax = num(e.vmax, 15);
      const pompe = e.retour === 'pompe', rhoL = C.eau(Math.min(s2.T, 99)).rho;
      // Diphasique : volume de la vapeur de revaporisation ; pompé : liquide (vitesse ≤ 1,5 m/s retenue au plus)
      const lignes = tubes.map(t => { const A = Math.PI * (t.di / 1000) ** 2 / 4, v = pompe ? m / 3600 / rhoL / A : flash / 3600 * s2.vg / A; return { t, v, ok: v <= (pompe ? Math.min(vmax, 1.5) : vmax) }; });
      const choix = lignes.find(l => l.ok);
      if (dpPurgeur <= 0.05) alertes.push(alerte('erreur', `Pression différentielle au purgeur insuffisante (${nf(dpPurgeur, 2)} bar après relevage de ${nf(num(e.Hrel), 1)} m) : purgeur-pompe ou pompe à condensats indispensable.`));
      else if (e.application === 'echangeur') alertes.push(alerte('attention', `Échangeur régulé : à charge partielle, la pression dans l'échangeur peut descendre sous ${nf(num(e.p2) + dpRel, 2)} bar rel. (retour + relevage) et noyer l'échangeur (décrochage) ; prévoir un purgeur-pompe si la vapeur est régulée en dessous de cette valeur.`));
      if (!choix) alertes.push(alerte('erreur', 'Aucun diamètre de la série ne respecte la vitesse maximale.'));
      else alertes.push(alerte('ok', `Purgeur ${types[e.application].split(' (')[0].toLowerCase()} de ${nf(capacite, 0)} kg/h sous ${nf(dpPurgeur, 2)} bar ; retour ${pompe ? 'pompé' : 'diphasique'} ${choix.t.nom}.`));
      const tbl = [{ titre: pompe ? 'Conduite de condensats pompés (liquide)' : 'Conduite de retour diphasique (vapeur de revaporisation)', entetes: ['Tube', 'v (m/s)'], lignes: lignes.slice(0, 14).map(l => [l.t.nom, nf(l.v, 2)]), surligne: choix ? lignes.indexOf(choix) : -1 }];
      return {
        valeurs: { x, flash, capacite, dpPurgeur, choix: choix ? choix.t.cle : null },
        resume: [['Température de saturation amont / retour', `${nf(s1.T, 1)} / ${nf(s2.T, 1)} °C`], ['Purgeur conseillé', types[e.application]], ['Coefficient de sécurité', `× ${coef} (${e.application === 'ligne' ? 'démarrage à froid' : 'pointes et démarrage'})`],
          ['Capacité du purgeur à retenir', `${nf(capacite, 0)} kg/h`], ['Pression différentielle disponible', `${nf(dpPurgeur, 2)} bar (relevage ${nf(dpRel, 2)} bar déduit)`],
          ['Revaporisation', `${nf(x * 100, 1)} % — ${nf(flash, 0)} kg/h de vapeur de flash`], ['Conduite de retour', choix ? choix.t.nom : '—'],
          ...(pompe ? [['Pompe de relevage', `${nf(m * 2 / rhoL, 2)} m³/h (× 2 pour les pointes) sous ≈ ${nf(num(e.Hrel) + num(e.p2) * 10.2 + 5, 1)} mCE`]] : [])],
        tableaux: tbl, alertes,
        hypotheses: ['Revaporisation : x = (h\'(p amont) − h\'(p retour)) / r(p retour).', 'Retour diphasique dimensionné sur le débit volumique de la vapeur de revaporisation (le liquide est négligeable en volume).',
          'Pression différentielle au purgeur : p amont − p retour − ρ · g · hauteur de relevage.', 'Coefficients de sécurité usuels des fabricants de purgeurs (×3 purge de ligne, ×2 autres applications).',
          'Pente des retours gravitaires ≥ 0,5 %, pas de point bas avant le purgeur, filtre et clapet en amont, purgeur accessible et isolable.'],
        synthese: `Purgeur ${nf(capacite, 0)} kg/h · ΔP ${nf(dpPurgeur, 2)} bar · flash ${nf(x * 100, 1)} % · ${choix ? choix.t.nom : '—'}`,
      };
    },
  };

  /* ---------- Réseau de gaz ---------- */
  const GAZ = { g20: ['Gaz naturel H (G20)', 9.45, 0.718, 1.1e-5], g25: ['Gaz naturel B (G25)', 8.13, 0.791, 1.1e-5], propane: ['Propane (phase gazeuse)', 25.9, 2.01, 0.8e-5] };
  N.TYPES.gaz = {
    titre: 'Canalisation de gaz (basse et moyenne pression)', icone: '🔥', famille: 'Industriel',
    description: 'Débit appelé par les appareils (simultanéité), diamètre selon la perte de pression admissible et la vitesse, en écoulement compressible.',
    champs: [{ g: 'Gaz' }, { k: 'gaz', l: 'Gaz distribué', t: 's', o: Object.entries(GAZ).map(([k, g]) => [k, g[0]]), d: 'g20' },
      { k: 'p', l: 'Pression de distribution', u: 'mbar rel.', d: 21 }, { k: 'dpmax', l: 'Perte de pression admissible (vide : 5 % en basse pression, 10 % au-delà de 100 mbar)', u: 'mbar', d: '' },
      { k: 'vmax', l: 'Vitesse maximale', u: 'm/s', d: 10 },
      { g: 'Appareils' }, { k: 'appareils', l: 'Appareils raccordés', t: 'lignes', d: [{ nom: 'Chaudière 1', P: 150 }, { nom: 'Chaudière 2', P: 150 }, { nom: 'Cuisine', P: 40 }], colonnes: [{ k: 'nom', l: 'Appareil', t: 't' }, { k: 'P', l: 'Débit calorifique (kW PCI)' }] },
      { k: 'simult', l: 'Coefficient de simultanéité', u: '%', d: 100 },
      { g: 'Canalisation' }, { k: 'serie', l: 'Série de tubes', t: 's', o: optSeries(k => /acier-10255|acier-10216|acier-sch40|cuivre|pehd/.test(k)), d: 'acier-10255' },
      { k: 'L', l: 'Longueur développée', u: 'm', d: 40 }, { k: 'zeta', l: 'Somme des coefficients singuliers Σζ', d: 8 }],
    calcul(e) {
      const g = GAZ[e.gaz] || GAZ.g20, Ptot = (e.appareils || []).reduce((s, a) => s + num(a.P), 0) * num(e.simult, 100) / 100, Qn = Ptot / g[1];
      const prel = num(e.p, 21), pAbs = 1.01325 + prel / 1000, dpAuto = prel <= 100 ? 0.05 * prel : 0.1 * prel, dpmax = e.dpmax === '' || e.dpmax === undefined ? dpAuto : num(e.dpmax);
      const s = D.SERIES[e.serie], vmax = num(e.vmax, 10), T = 15, rhoDe = p => g[2] * p / 1.01325 * 273.15 / (T + 273.15), alertes = [];
      const lignes = C.tubes(e.serie).map(t => { const r = C.compressible({ m: Qn * g[2] / 3600, Di: t.di / 1000, L: num(e.L), zeta: num(e.zeta), rug: s.rugosite, pEntree: pAbs, rhoDe, mu: g[3] }); return { t, ...r, dpm: r.dp * 1000, ok: r.ok && r.dp * 1000 <= dpmax && r.vmax <= vmax }; });
      const choix = lignes.find(l => l.ok);
      if (!(Ptot > 0)) alertes.push(alerte('erreur', 'Ajouter les appareils et leur débit calorifique.'));
      else if (!choix) alertes.push(alerte('erreur', 'Aucun diamètre de la série ne respecte la perte de pression et la vitesse admissibles.'));
      else alertes.push(alerte('ok', `${choix.t.nom} : ${nf(choix.dpm, 2)} mbar de perte de pression pour ${nf(dpmax, 2)} mbar admissibles, ${nf(choix.v, 1)} m/s.`));
      if (prel > 400) alertes.push(alerte('attention', 'Au-delà de 400 mbar : détente obligatoire avant les appareils et règles des réseaux moyenne pression (NF EN 15001).'));
      alertes.push(alerte('attention', 'Organe de coupure générale accessible à l\'extérieur des locaux, robinet de commande par appareil, essais d\'étanchéité et certificat de conformité (NF DTU 61.1, NF EN 15001).'));
      return {
        valeurs: { Ptot, Qn, dpmax, choix: choix ? choix.t.cle : null, dp: choix ? choix.dpm : NaN, v: choix ? choix.v : NaN },
        resume: [['Débit calorifique simultané', `${nf(Ptot, 0)} kW PCI`], ['Débit de gaz', `${nf(Qn, 2)} m³(n)/h`], ['Pression de distribution', `${nf(prel, 0)} mbar`],
          ['Perte de pression admissible', `${nf(dpmax, 2)} mbar`], ['Diamètre retenu', choix ? choix.t.nom : '—'], ['Perte de pression', choix ? `${nf(choix.dpm, 2)} mbar` : '—'], ['Vitesse', choix ? `${nf(choix.v, 1)} m/s` : '—']],
        tableaux: [{ titre: 'Comparaison des diamètres', entetes: ['Tube', 'Di (mm)', 'v (m/s)', 'ΔP (mbar)', 'Critères'],
          lignes: lignes.map(l => [l.t.nom, nf(l.t.di, 1), nf(l.v, 1), l.ok || l.dpm < 1e5 ? nf(l.dpm, 2) : '—', l.ok ? 'OK' : l.vmax > vmax ? 'vitesse' : 'perte de pression']), surligne: choix ? lignes.indexOf(choix) : -1 }],
        alertes,
        hypotheses: [`${g[0]} : PCI ${nf(g[1], 2)} kWh/m³(n), masse volumique ${nf(g[2], 3)} kg/m³(n), gaz à 15 °C.`, 'Débit Qn = Σ débits calorifiques × simultanéité / PCI.',
          'Écoulement compressible isotherme calculé par tranches (Darcy-Weisbach / Colebrook), singularités en longueur équivalente.', `${s.libelle}, rugosité ${nf(s.rugosite, 3)} mm.`],
        synthese: choix ? `${choix.t.nom} · ${nf(Qn, 1)} m³(n)/h · ΔP ${nf(choix.dpm, 2)} mbar` : 'Aucun diamètre conforme',
      };
    },
  };

  /* ---------- Ventilation de chaufferie ---------- */
  N.TYPES.ventilation = {
    titre: 'Ventilation de chaufferie (amenée d\'air, évacuation)', icone: '🪟', famille: 'Thermique',
    description: 'Débit d\'air de combustion et de ventilation, sections des amenées d\'air basse et évacuations haute.',
    champs: [{ g: 'Chaufferie' }, { k: 'P', l: 'Puissance utile totale des générateurs', u: 'kW', d: 300 }, { k: 'rendement', l: 'Rendement (PCI)', u: '%', d: 95 },
      { k: 'combustible', l: 'Combustible', t: 's', o: [['gaz', 'Gaz naturel'], ['fioul', 'Fioul domestique'], ['bois', 'Bois']], d: 'gaz' },
      { k: 'type', l: 'Générateurs', t: 's', o: [['B', 'Type B (air de combustion pris dans le local)'], ['C', 'Type C (étanches, air pris à l\'extérieur par ventouse)']], d: 'B' },
      { k: 'pertes', l: 'Pertes au local (jaquettes, tuyauteries)', u: '% de P', d: 1.5 }, { k: 'dT', l: 'Échauffement admis de l\'air du local', u: 'K', d: 10 },
      { k: 'vitesse', l: 'Vitesse de l\'air dans les grilles (tirage naturel)', u: 'm/s', d: 1 }],
    calcul(e) {
      const P = num(e.P), Pc = P / (num(e.rendement, 95) / 100), typeB = e.type !== 'C', alertes = [];
      // Air de combustion : ≈ 0,95 m³(n)/kWh PCI au stœchiométrique (gaz), 1,0 (fioul), 1,1 (bois), excès d'air de 30 %
      const air0 = { gaz: 0.95, fioul: 1.0, bois: 1.1 }[e.combustible] || 0.95, qComb = typeB ? Pc * air0 * 1.3 : 0, qTherm = P * num(e.pertes, 1.5) / 100 * 1000 / (0.34 * Math.max(num(e.dT, 10), 1));
      const qBas = qComb + qTherm, v = Math.max(num(e.vitesse, 1), 0.2), Sbas = qBas / 3600 / v * 100, Shaut = qTherm / 3600 / v * 100; // dm²
      const usage = P > 70 ? Math.max(P / 23.2, 1.5) : null; // règle constructeur citée d'après l'arrêté du 23 juin 1978 (S = P/23,2 dm²)
      const petit = P <= 70 ? [[25, 50], [35, 70], [50, 100], [70, 150]].find(([p]) => P <= p) : null;
      alertes.push(alerte('ok', `Amenée d'air basse ≥ ${nf(Math.max(Sbas, usage || 0, petit ? petit[1] / 100 : 0), 1)} dm² et évacuation haute ≥ ${nf(Math.max(Shaut, P > 70 ? usage / 2 : 1), 1)} dm² (sections libres).`));
      alertes.push(alerte('attention', 'Sections réglementaires à vérifier dans le texte applicable (arrêté du 23 juin 1978 et NF DTU 65.4 au-delà de 70 kW, arrêté du 23 février 2009 en dessous ; ERP : articles CH) ; valeurs ci-dessous données à titre indicatif.'));
      if (!typeB) alertes.push(alerte('attention', 'Générateurs étanches (type C) : l\'air de combustion n\'est pas pris dans le local, la ventilation n\'évacue que la chaleur perdue ; les sections réglementaires minimales restent dues.'));
      return {
        valeurs: { Pc, qComb, qTherm, Sbas, Shaut, usage },
        resume: [['Débit calorifique (PCI)', `${nf(Pc, 0)} kW`], ['Air de combustion (excès 30 %)', `${nf(qComb, 0)} m³/h`], ['Air de ventilation (évacuation des pertes)', `${nf(qTherm, 0)} m³/h`],
          ['Section basse d\'après les débits', `${nf(Sbas, 2)} dm² à ${nf(v, 1)} m/s`], ['Section haute d\'après les débits', `${nf(Shaut, 2)} dm²`],
          ...(usage ? [['Section basse usuelle (S = P / 23,2)', `${nf(usage, 1)} dm²`], ['Section haute usuelle (moitié de la basse)', `${nf(usage / 2, 1)} dm²`]] : []),
          ...(petit ? [['Section basse indicative ≤ 70 kW', `${petit[1]} cm²`], ['Évacuation haute indicative ≤ 70 kW', '100 cm²']] : [])],
        tableaux: [], alertes,
        hypotheses: ['Air de combustion : volume stœchiométrique par kWh PCI × 1,3 (excès d\'air) pour les générateurs de type B.', 'Ventilation thermique : pertes au local / (0,34 · ΔT admis).',
          'Sections libres (déduction faite des lames des grilles) pour la vitesse indiquée en tirage naturel.', 'S = P / 23,2 dm² : valeur usuelle publiée par les constructeurs pour les chaufferies de plus de 85 kW d\'après l\'arrêté du 23 juin 1978, à confirmer dans le texte.'],
        synthese: `Basse ≥ ${nf(Math.max(Sbas, usage || 0), 1)} dm² · haute ≥ ${nf(Math.max(Shaut, usage ? usage / 2 : 1), 1)} dm² · ${nf(qBas, 0)} m³/h`,
      };
    },
  };

  /* ---------- NPSH ---------- */
  N.TYPES.npsh = {
    titre: 'NPSH disponible d\'une pompe (cavitation)', icone: '🫧', famille: 'Hydraulique',
    description: 'Charge nette à l\'aspiration disponible, comparée au NPSH requis de la pompe, température limite de cavitation.',
    champs: [{ g: 'Aspiration' }, { k: 'circuit', l: 'Bâche ou réservoir d\'aspiration', t: 's', o: [['ouvert', 'À l\'air libre'], ['ferme', 'Fermé sous pression (vase, bâche pressurisée)']], d: 'ouvert' },
      { k: 'altitude', l: 'Altitude du site', u: 'm', d: 400, si: e => e.circuit !== 'ferme' }, { k: 'pRes', l: 'Pression relative sur le plan d\'eau', u: 'bar', d: 1.5, si: e => e.circuit === 'ferme' },
      { k: 'T', l: 'Température de l\'eau pompée', u: '°C', d: 80 }, { k: 'Hz', l: 'Hauteur du plan d\'eau au-dessus de l\'axe de la pompe (négative en aspiration)', u: 'm', d: 2 },
      { g: 'Conduite d\'aspiration' }, { k: 'Q', l: 'Débit', u: 'm³/h', d: 20 }, { k: 'serie', l: 'Série de tubes', t: 's', o: optSeries(() => true), d: 'acier-10216' }, { k: 'tube', l: 'Tube', t: 's', o: optTubes, d: '88.9x3.2' },
      { k: 'L', l: 'Longueur d\'aspiration', u: 'm', d: 8 }, { k: 'zeta', l: 'Σζ (crépine, clapet, coudes, filtre)', d: 6 },
      { g: 'Pompe' }, { k: 'npshr', l: 'NPSH requis au débit (courbe du fabricant)', u: 'm', d: 3 }, { k: 'marge', l: 'Marge de sécurité', u: 'm', d: 0.5 }],
    calcul(e) {
      const T = num(e.T, 20), w = C.eau(T), t = C.tube(e.serie, e.tube) || C.tubes(e.serie)[0], s = D.SERIES[e.serie], x = C.ecoulement(num(e.Q) / 3600, t.di / 1000, w.rho, w.mu, s.rugosite);
      const p0 = e.circuit === 'ferme' ? 101325 + num(e.pRes) * 1e5 : patmAltitude(num(e.altitude)), Hpc = (x.R * num(e.L) + num(e.zeta) * x.pd) / (w.rho * C.G);
      const npshd = p0 / (w.rho * C.G) + num(e.Hz) - Hpc - psat(T) / (w.rho * C.G), npshr = num(e.npshr), marge = num(e.marge, 0.5), ok = npshd >= npshr + marge;
      // Température maximale avant cavitation (mêmes conditions)
      let Tlim = null;
      for (let Tt = 0; Tt <= 150; Tt += 0.5) { const ww = C.eau(Tt); if (p0 / (ww.rho * C.G) + num(e.Hz) - Hpc - psat(Tt) / (ww.rho * C.G) < npshr + marge) { Tlim = Tt - 0.5; break; } }
      const alertes = [ok ? alerte('ok', `NPSH disponible ${nf(npshd, 2)} m ≥ requis ${nf(npshr, 2)} m + marge ${nf(marge, 1)} m.`) : alerte('erreur', `Risque de cavitation : NPSH disponible ${nf(npshd, 2)} m < requis ${nf(npshr, 2)} m + marge ${nf(marge, 1)} m.`)];
      if (!ok) alertes.push(alerte('attention', 'Remèdes : remonter le plan d\'eau ou abaisser la pompe, augmenter le diamètre et réduire les singularités d\'aspiration, pressuriser la bâche, abaisser la température, choisir une pompe à plus faible NPSH requis.'));
      if (x.v > 1.5) alertes.push(alerte('attention', `Vitesse d'aspiration ${nf(x.v, 2)} m/s : viser 1 m/s au plus à l'aspiration.`));
      return {
        valeurs: { npshd, ok, Hpc, Tlim },
        resume: [['Pression sur le plan d\'eau', `${nf(p0 / 1e5, 3)} bar abs (${nf(p0 / (w.rho * C.G), 2)} m)`], ['Hauteur géométrique', `${nf(num(e.Hz), 2)} m`], ['Pertes de charge d\'aspiration', `${nf(Hpc, 2)} m (v = ${nf(x.v, 2)} m/s)`],
          ['Pression de vapeur à ' + nf(T, 0) + ' °C', `${nf(psat(T) / 1000, 2)} kPa (${nf(psat(T) / (w.rho * C.G), 2)} m)`], ['NPSH disponible', `${nf(npshd, 2)} m`], ['NPSH requis + marge', `${nf(npshr + marge, 2)} m`],
          ['Température limite de cavitation', Tlim === null ? '> 150 °C' : `${nf(Tlim, 1)} °C`]],
        tableaux: [], alertes,
        hypotheses: ['NPSHd = p / (ρg) + Hz − pertes d\'aspiration − pv / (ρg).', 'Pression atmosphérique corrigée de l\'altitude ; pression de vapeur par l\'équation d\'Antoine.', 'Le NPSH requis est lu sur la courbe du fabricant au débit de fonctionnement (NPSH3).'],
        synthese: `NPSHd ${nf(npshd, 2)} m · requis ${nf(npshr, 2)} m · ${ok ? 'conforme' : 'cavitation'}`,
      };
    },
  };

  /* ---------- Coup de bélier ---------- */
  N.TYPES.belier = {
    titre: 'Coup de bélier (fermeture de vanne, arrêt de pompe)', icone: '🔨', famille: 'Hydraulique',
    description: 'Célérité de l\'onde, surpression à la fermeture (Joukowsky ou Michaud), temps de fermeture à respecter.',
    champs: [{ g: 'Conduite' }, { k: 'serie', l: 'Série de tubes', t: 's', o: optSeries(() => true), d: 'acier-10216' }, { k: 'tube', l: 'Tube', t: 's', o: optTubes, d: '114.3x3.6' },
      { k: 'L', l: 'Longueur entre la vanne et le réservoir / la pompe', u: 'm', d: 300 }, { k: 'T', l: 'Température de l\'eau', u: '°C', d: 20 },
      { g: 'Manœuvre' }, { k: 'Q', l: 'Débit avant fermeture', u: 'm³/h', d: 40 }, { k: 'tf', l: 'Temps de fermeture', u: 's', d: 2 },
      { k: 'PS', l: 'Pression de service', u: 'bar', d: 6 }, { k: 'PN', l: 'Pression nominale de la conduite et des équipements', u: 'bar', d: 16 }],
    calcul(e) {
      const t = C.tube(e.serie, e.tube) || C.tubes(e.serie)[0], w = C.eau(num(e.T, 20)), mat = D.MATERIAUX[D.SERIES[e.serie].materiau], K = 2.2e9, E = mat.E * 1e6;
      const a = Math.sqrt(K / w.rho / (1 + K * t.di / (E * t.ep))), v = num(e.Q) / 3600 / (Math.PI * (t.di / 1000) ** 2 / 4), L = num(e.L), tc = 2 * L / a, tf = Math.max(num(e.tf), 0.01);
      const brusque = tf <= tc, dP = (brusque ? w.rho * a * v : 2 * w.rho * L * v / tf) / 1e5, pmax = num(e.PS) + dP, PN = num(e.PN, 16);
      const tfMin = 2 * w.rho * L * v / (Math.max(PN - num(e.PS), 0.1) * 1e5); // Michaud : temps pour rester sous PN
      const alertes = [pmax <= PN ? alerte('ok', `Pression maximale ${nf(pmax, 1)} bar ≤ PN ${nf(PN, 0)}.`) : alerte('erreur', `Pression maximale ${nf(pmax, 1)} bar > PN ${nf(PN, 0)} : fermeture à ralentir (≥ ${nf(Math.max(tfMin, tc), 1)} s) ou anti-bélier.`)];
      if (brusque) alertes.push(alerte('attention', `Fermeture brusque (${nf(tf, 1)} s ≤ 2L/a = ${nf(tc, 2)} s) : surpression maximale de Joukowsky.`));
      if (num(e.PS) - dP < -0.8) alertes.push(alerte('attention', 'La dépression qui suit la surpression peut atteindre la pression de vapeur (rupture de veine) : ventouses ou réservoir anti-bélier.'));
      return {
        valeurs: { a, v, tc, dP, pmax, brusque, tfMin },
        resume: [['Célérité de l\'onde', `${nf(a, 0)} m/s`], ['Vitesse de l\'eau', `${nf(v, 2)} m/s`], ['Temps d\'aller-retour de l\'onde 2L/a', `${nf(tc, 2)} s`],
          ['Régime de fermeture', brusque ? 'brusque (Joukowsky)' : 'lente (Michaud)'], ['Surpression', `${nf(dP, 2)} bar`], ['Pression maximale', `${nf(pmax, 2)} bar`],
          ['Temps de fermeture pour rester sous PN', `${nf(Math.max(tfMin, tc), 1)} s`]],
        tableaux: [{ titre: 'Surpression selon le temps de fermeture', entetes: ['Fermeture (s)', 'Surpression (bar)', 'P maxi (bar)'],
          lignes: [0.5, 1, 2, 5, 10, 20, 30, 60].map(x => { const d = (x <= tc ? w.rho * a * v : 2 * w.rho * L * v / x) / 1e5; return [nf(x, 1), nf(d, 2), nf(num(e.PS) + d, 2)]; }) }],
        alertes,
        hypotheses: [`Célérité a = √((K/ρ) / (1 + K·Di / (E·e))), K = 2,2 GPa, E = ${nf(mat.E / 1000, 1)} GPa (${mat.libelle.toLowerCase()}).`, 'Fermeture brusque (t ≤ 2L/a) : ΔP = ρ · a · v (Joukowsky) ; lente : ΔP = 2 ρ L v / t (Michaud).',
          'Arrêt brusque d\'une pompe : même ordre de grandeur que la fermeture brusque, en dépression d\'abord côté refoulement.'],
        synthese: `a ${nf(a, 0)} m/s · ΔP ${nf(dP, 1)} bar · P maxi ${nf(pmax, 1)} bar`,
      };
    },
  };

  /* ---------- Eau chaude sanitaire : ballon et échangeur ---------- */
  // Besoins journaliers à 60 °C, part et durée de la pointe
  const BESOINS_ECS = { logement: ['Logements (par personne)', 35, 0.3, 1], bureau: ['Bureaux (par personne)', 5, 0.5, 2], douche: ['Vestiaires industriels (par douche)', 25, 1, 0.5], restaurant: ['Restauration (par repas)', 8, 0.5, 2], hotel: ['Hôtel (par chambre)', 100, 0.35, 1.5], perso: ['Besoins saisis', 0, 0.3, 1] };
  N.TYPES.ecs = {
    titre: 'Production d\'eau chaude sanitaire : ballon et échangeur', icone: '🚿', famille: 'Thermique',
    description: 'Besoins et pointe, couple puissance / volume de stockage, temps de réchauffage, échangeur à plaques, prévention des légionelles.',
    champs: [{ g: 'Besoins' }, { k: 'usage', l: 'Usage', t: 's', o: Object.entries(BESOINS_ECS).map(([k, b]) => [k, b[0]]), d: 'douche' },
      { k: 'n', l: 'Nombre (personnes, douches, repas, chambres)', d: 40, si: e => e.usage !== 'perso' }, { k: 'Vj', l: 'Besoin journalier à 60 °C', u: 'L/j', d: 1000, si: e => e.usage === 'perso' },
      { k: 'pointe', l: 'Part du besoin journalier dans la pointe (vide : usuelle)', u: '%', d: '' }, { k: 'tp', l: 'Durée de la pointe (vide : usuelle)', u: 'h', d: '' },
      { g: 'Production' }, { k: 'Tf', l: 'Température de l\'eau froide', u: '°C', d: 10 }, { k: 'Tc', l: 'Température de stockage', u: '°C', d: 60 },
      { k: 'P', l: 'Puissance de réchauffage disponible', u: 'kW', d: 40 }, { k: 'entre', l: 'Temps entre deux pointes (réchauffage)', u: 'h', d: 8 },
      { g: 'Échangeur' }, { k: 'Tp1', l: 'Primaire : entrée', u: '°C', d: 75 }, { k: 'Tp2', l: 'Primaire : sortie', u: '°C', d: 55 }],
    calcul(e) {
      const b = BESOINS_ECS[e.usage] || BESOINS_ECS.douche, Vj = e.usage === 'perso' ? num(e.Vj) : b[1] * num(e.n), part = e.pointe === '' || e.pointe === undefined ? b[2] : num(e.pointe) / 100;
      const tp = e.tp === '' || e.tp === undefined ? b[3] : num(e.tp), Tf = num(e.Tf, 10), Tc = num(e.Tc, 60), dT = Tc - Tf, P = num(e.P), alertes = [];
      const Vp = Vj * part, Vprod = P * tp * 1000 / (1.163 * dT), Vutile = Math.max(0, Vp - Vprod), Vb = Vutile / 0.8;
      const BALLONS = [0, 200, 300, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000], choisi = BALLONS.find(v => v >= Vb) || Math.ceil(Vb / 1000) * 1000;
      const treach = choisi > 0 && P > 0 ? choisi * 0.8 * 1.163 * dT / (P * 1000) : 0;
      const Tp1 = num(e.Tp1, 75), Tp2 = num(e.Tp2, 55), d1 = Tp1 - Tc, d2 = Tp2 - Tf, dtlm = d1 > 0 && d2 > 0 ? (Math.abs(d1 - d2) < 0.01 ? d1 : (d1 - d2) / Math.log(d1 / d2)) : NaN;
      const A = P * 1000 / (2500 * dtlm), Qp = P / (1.163 * (Tp1 - Tp2)), Qs = P / (1.163 * dT);
      if (!(Vj > 0)) alertes.push(alerte('erreur', 'Besoin journalier nul.'));
      else alertes.push(alerte('ok', `${choisi ? `Ballon de ${choisi} L` : 'Production instantanée (sans stockage)'} avec ${nf(P, 0)} kW de réchauffage pour une pointe de ${nf(Vp, 0)} L à ${nf(Tc, 0)} °C en ${nf(tp, 1)} h.`));
      if (treach > num(e.entre, 8)) alertes.push(alerte('erreur', `Réchauffage du ballon en ${nf(treach, 1)} h, plus long que le temps entre deux pointes : augmenter la puissance.`));
      if (Tc < 55) alertes.push(alerte('erreur', 'Stockage sous 55 °C : risque de légionelles (arrêté du 30 novembre 2005).'));
      if (!(dtlm > 0)) alertes.push(alerte('erreur', 'Températures de l\'échangeur incompatibles : le primaire doit entrer au-dessus de la température de stockage.'));
      if (Tp1 < Tc + 10) alertes.push(alerte('attention', 'Primaire à moins de 10 K au-dessus du stockage : échangeur très grand, choc thermique à 70 °C impossible.'));
      alertes.push(alerte('attention', 'Bouclage maintenu à 50 °C au moins, mitigeurs thermostatiques (50 °C) aux points de puisage des pièces de toilette, choc thermique hebdomadaire à 70 °C possible.'));
      return {
        valeurs: { Vj, Vp, Vprod, Vb, choisi, treach, A, Qp, Qs },
        resume: [['Besoin journalier à ' + nf(Tc, 0) + ' °C', `${nf(Vj, 0)} L`], ['Pointe', `${nf(Vp, 0)} L en ${nf(tp, 1)} h (${nf(part * 100, 0)} % du jour)`], ['Produit pendant la pointe', `${nf(Vprod, 0)} L avec ${nf(P, 0)} kW`],
          ['Volume de stockage nécessaire', `${nf(Vb, 0)} L (80 % utile)`], ['Ballon retenu', choisi ? `${choisi} L` : 'aucun (instantané)'], ['Temps de réchauffage du ballon', `${nf(treach, 1)} h`],
          ['Échangeur à plaques', `${nf(P, 0)} kW · ΔTLM ${nf(dtlm, 1)} K · surface ≈ ${nf(A, 1)} m²`], ['Débits primaire / secondaire', `${nf(Qp, 2)} / ${nf(Qs, 2)} m³/h`]],
        tableaux: [{ titre: 'Couples puissance / volume de stockage pour la même pointe', entetes: ['Puissance (kW)', 'Volume nécessaire (L)', 'Ballon (L)', 'Réchauffage (h)'],
          lignes: [0.25, 0.5, 0.75, 1, 1.5, 2, 3].map(k => P * k).map(Pk => { const v = Math.max(0, Vp - Pk * tp * 1000 / (1.163 * dT)) / 0.8, c = BALLONS.find(x => x >= v) || Math.ceil(v / 1000) * 1000;
            return [nf(Pk, 0), nf(v, 0), c ? String(c) : 'instantané', c && Pk ? nf(c * 0.8 * 1.163 * dT / (Pk * 1000), 1) : '—']; }) }],
        alertes,
        hypotheses: [`Besoins usuels à 60 °C : ${b[0].toLowerCase()} ${b[1] ? `${b[1]} L/j` : ''} ; pointe de ${nf(b[2] * 100, 0)} % en ${b[3]} h (valeurs modifiables).`,
          'Volume de stockage = (volume de la pointe − production pendant la pointe) / 0,8 (part utile du ballon, stratification).', 'Énergie : 1,163 Wh/L·K.',
          'Échangeur à plaques à contre-courant, U ≈ 2 500 W/m²·K (à confirmer par le fabricant).'],
        synthese: `${choisi ? `Ballon ${choisi} L` : 'Instantané'} · ${nf(P, 0)} kW · pointe ${nf(Vp, 0)} L · échangeur ${nf(A, 1)} m²`,
      };
    },
  };

  return { psat, patmAltitude, GAZ, BESOINS_ECS };
})(typeof Donnees !== 'undefined' ? Donnees : require('./donnees'), typeof Calculs !== 'undefined' ? Calculs : require('./calculs'), typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = Industriel;
