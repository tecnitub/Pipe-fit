// Calculs annexes — Production et énergie : conduit de fumée, PAC géothermique sur sondes, solaire thermique ECS, consommation annuelle et coût global, aides CEE.
// Rangés à part dans l'étude (famille « Calculs annexes », thème « Production et énergie ») ; chaque type déclare annexe: true, theme,
// et sa fonction lier(ctx) qui reprend les données des autres notes de l'étude (voir Liens.resoudreLiens).
// Normes et textes cités comme repères ; méthodes simplifiées documentées dans chaque calcul ; tables climatiques (DJU,
// irradiation) indicatives par site, à remplacer par les données de la station retenue ; aucune donnée de fabricant.
// Module pur (navigateur, node, tests).
const AnnexesEnergie = ((N) => {
  const { nf, num } = N;
  const C = typeof Calculs !== 'undefined' ? Calculs : require('./calculs');
  const Ln = () => (typeof Liens !== 'undefined' ? Liens : require('./liens'));
  const Sc = () => (typeof Schema !== 'undefined' ? Schema : require('./schema'));
  const Pc = () => (typeof Pieces !== 'undefined' ? Pieces : require('./pieces'));
  const alerte = (niveau, texte) => ({ niveau, texte });
  const THEME = 'Production et énergie', FAMILLE = 'Calculs annexes';
  const vide = v => v === undefined || v === null || String(v).trim() === '';
  const val = (v, d) => (vide(v) ? d : num(v, d));
  const G = 9.81;
  const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;

  /* ---------- Sites : DJU, irradiation, zone climatique ---------- */
  // [DJU base 18 °C (ordre de grandeur des normales), irradiation globale horizontale (kWh/m²·an), zone climatique (H1, H2, H3)]
  // Clés = sites des Données de référence (climat de l'étude) ; valeurs indicatives à remplacer par celles de la station météo.
  const SITES = {
    annonay: [2600, 1350, 'H2'], lyon: [2500, 1300, 'H1'], 'st-etienne': [2800, 1300, 'H1'], valence: [2200, 1450, 'H2'], grenoble: [2600, 1350, 'H1'], chambery: [2700, 1300, 'H1'],
    clermont: [2600, 1300, 'H1'], dijon: [2700, 1250, 'H1'], paris: [2400, 1150, 'H1'], lille: [2700, 1050, 'H1'], strasbourg: [2900, 1150, 'H1'], nancy: [2900, 1150, 'H1'],
    limoges: [2600, 1250, 'H1'], nantes: [2200, 1250, 'H2'], rennes: [2300, 1200, 'H2'], brest: [2300, 1150, 'H2'], bordeaux: [2000, 1350, 'H2'], toulouse: [2000, 1400, 'H2'],
    montpellier: [1500, 1600, 'H3'], marseille: [1500, 1650, 'H3'], nice: [1200, 1600, 'H3'],
    H1: [2600, 1200, 'H1'], H2: [2100, 1350, 'H2'], H3: [1400, 1600, 'H3'],
  };
  const libSite = k => { if (/^H\d$/.test(k)) return `Zone ${k} (valeurs moyennes)`; let c = null; try { c = (typeof Donnees !== 'undefined' ? Donnees : require('./donnees')).CLIMATS[k]; } catch (err) { c = null; } return c ? c[0] : k; };
  const optSites = () => Object.keys(SITES).map(k => [k, libSite(k)]);
  const site = k => SITES[k] || SITES.H1;
  // Site de l'étude (climat) imposé, s'il est dans la table
  const climat = ctx => { let cl = null; try { cl = Ln().climatEtude(ctx.etude); } catch (err) { cl = null; } return cl; };
  function lierSite(ctx, champ = 'site') { const cl = climat(ctx); if (cl && SITES[cl.cle]) ctx.imposer({ [champ]: cl.cle }, `climat de l'étude (${cl.libelle})`); return cl; }
  // Schémas de principe de l'étude dimensionnés : [{ note, es, d }]
  const pidsEtude = ctx => (ctx.notes || []).filter(n => n.type === 'pid').map(n => { try { const es = ctx.resoudre(n); return { note: n, es, d: Sc().dimensionner(es) }; } catch (err) { return null; } }).filter(Boolean);
  // Générateurs d'un schéma : lignes détaillées, sinon générateur × nombre
  const generateurs = es => { const l = (es.generateurs || []).filter(x => x && x.type && num(x.P) > 0).map(x => ({ type: x.type, P: num(x.P), n: 1 })); return l.length ? l : [{ type: es.generateur || '', P: num(es.Pgen), n: Math.max(1, Math.min(6, Math.round(num(es.nGen, 1)))) }]; };
  // Besoins totaux des bilans pièce par pièce de l'étude
  function besoinsPieces(ctx) {
    let b = {}; try { b = Pc().besoinsEtude(ctx.etude); } catch (err) { b = {}; }
    const l = Object.values(b), n = l.length ? ((ctx.etude && ctx.etude.notes) || []).find(x => x.id === l[0].note) : null;
    return l.length ? { Pch: l.reduce((a, p) => a + p.Pch, 0), Pfr: l.reduce((a, p) => a + p.Pfr, 0), S: l.reduce((a, p) => a + p.S, 0), src: n ? ctx.libelle(n) : 'bilans pièce par pièce' } : null;
  }
  // Besoin journalier d'ECS de l'étude : production d'ECS (ballon), sinon réseau sanitaire
  function besoinEcs(ctx) {
    const ecs = (ctx.notes || []).find(n => n.type === 'ecs');
    if (ecs) { const r = ctx.calculer(ecs), es = ctx.resoudre(ecs), v = r.valeurs || {}; if (v.Vj > 0) return { Vj: Math.round(v.Vj), Tc: num(es.Tc, 60), Tf: num(es.Tf, 10), P: num(es.P), src: ctx.libelle(ecs) }; }
    const san = (ctx.notes || []).find(n => n.type === 'sanitaire');
    if (san) { const v = (ctx.calculer(san).valeurs || {}).besoinECS; if (v && v.Vj > 0) return { Vj: Math.round(v.Vj), Tc: num(v.Tst, 60), src: ctx.libelle(san) }; }
    return null;
  }

  /* =====================================================================================================
     5. Conduit de fumée (NF EN 13384-1, méthode simplifiée)
     ===================================================================================================== */
  // Combustibles, par kWh PCI : [libellé, air stœchiométrique (kg/kWh), combustible (kg/kWh), CO₂ maxi sur fumées sèches (%), vapeur d'eau formée (kg/kWh), CO₂ usuel (%)]
  // (bilans de combustion : CH₄ 17,2 kg d'air/kg et 13,9 kWh/kg ; propane 15,7 et 12,9 ; fioul 14,3 et 11,8 ; granulés à 8 % d'humidité 5,5 et 4,7)
  const COMBUSTIBLES = { gaz: ['Gaz naturel', 1.24, 0.072, 11.7, 0.162, 9], propane: ['Propane', 1.22, 0.0775, 13.7, 0.127, 10.5], fioul: ['Fioul domestique', 1.21, 0.084, 15.3, 0.10, 12.5], bois: ['Bois (granulés)', 1.17, 0.213, 20.3, 0.123, 11] };
  // Conduits : [libellé, coefficient global de transmission U (W/m²·K, fumées → ambiance), rugosité (mm)]
  const CONDUITS = { double: ['Conduit métallique double paroi isolé', 1.5, 0.1], maconne: ['Boisseaux maçonnés isolés', 2.5, 1.5], tubage: ['Tubage (flexible ou rigide) dans conduit existant', 3, 0.5], plastique: ['Conduit plastique (PPs), chaudière à condensation', 5, 0.1], simple: ['Conduit métallique simple paroi', 6, 0.1] };
  const DIAMETRES = [60, 80, 100, 110, 125, 130, 150, 160, 180, 200, 230, 250, 300, 350, 400, 450, 500, 600];
  const MF = 0.0285; // masse molaire des fumées humides (kg/mol)
  const pAtm = h => 101325 * (1 - 2.25577e-5 * h) ** 5.2559;
  const rhoGaz = (p, M, T) => p * M / (8.314 * (T + 273.15));
  const roseePv = pv => { const a = Math.log(pv / 610.94); return 243.04 * a / (17.625 - a); };
  // Écoulement des fumées pour un diamètre donné (D en m)
  function tirage(o, D) {
    const { m, Te, Ta, U, cpF, H, Lr, zeta, rug, p, rhoA } = o, A = Math.PI * D * D / 4;
    const K = U * Math.PI * D * (H + Lr) / (m * cpF), Ts = Ta + (Te - Ta) * Math.exp(-K), Tm = Ta + (Te - Ta) * (1 - Math.exp(-K)) / K;
    const rhoM = rhoGaz(p, MF, Tm), w = m / (rhoM * A), mu = 1.7e-5 + 4.2e-8 * Tm, Re = rhoM * w * D / mu;
    const lam = Re > 2300 ? 0.25 / Math.log10(rug / 1000 / (3.7 * D) + 5.74 / Re ** 0.9) ** 2 : 64 / Math.max(Re, 1);
    const PH = H * G * (rhoA - rhoM), PR = 1.5 * (lam * (H + Lr) / D + zeta) * rhoM * w * w / 2, Tparoi = Ts - (Ts - Ta) * U / 20;
    return { D, A, K, Ts, Tm, rhoM, w, Re, lam, PH, PR, Tparoi };
  }
  function calculerConduit(e) {
    const alertes = [], cb = COMBUSTIBLES[e.combustible] ? e.combustible : 'gaz', F = COMBUSTIBLES[cb], cd = CONDUITS[e.conduit] ? e.conduit : 'double', CD = CONDUITS[cd];
    const config = ['individuel', 'ventouse', 'collectif'].includes(e.config) ? e.config : 'individuel', nA = config === 'collectif' ? Math.max(1, Math.round(val(e.nAppareils, 2))) : 1;
    const P = val(e.P, 30), eta = val(e.rendement, 92) / 100, QF = P / Math.max(eta, 0.3), CO2 = Math.min(F[3] - 0.1, Math.max(2, val(e.CO2, F[5]))), lam = F[3] / CO2;
    const Te = val(e.Tf, 140), Ta = val(e.Ta, 15), H = val(e.H, 8), Lr = val(e.Lr, 1.5), zeta = val(e.zeta, 2.5), p = pAtm(val(e.altitude, 200)), rhoA = rhoGaz(p, 0.02896, Ta);
    const pression = config === 'ventouse' || e.mode === 'pression', PW = val(e.PW, pression ? 50 : 5);
    const mkWh = lam * F[1] + F[2], m1 = QF * mkWh / 3600, m = m1 * nA; // kg/s
    const pv = p * (F[4] / 0.018) / (mkWh / MF), Trf = roseePv(pv);
    const o = { m, Te, Ta, U: CD[1], cpF: 1080, H, Lr, zeta, rug: CD[2], p, rhoA };
    const ok = t => (pression ? t.PR - t.PH <= PW : t.PH - t.PR >= PW) && t.w <= (pression ? 15 : 10);
    const Dimp = num(e.D) > 0 ? num(e.D) / 1000 : null;
    const essais = DIAMETRES.map(d => tirage(o, d / 1000)), choix = Dimp ? tirage(o, Dimp) : essais.find(ok) || null;
    if (!(P > 0)) alertes.push(alerte('erreur', 'Puissance nulle.'));
    if (!choix) alertes.push(alerte('erreur', `Aucun diamètre jusqu'à ${DIAMETRES[DIAMETRES.length - 1]} mm ne convient : hauteur, pertes de charge ou ${pression ? 'pression disponible' : 'tirage requis'} à revoir.`));
    const t = choix || essais[essais.length - 1], Pz = t.PH - t.PR;
    if (choix) {
      if (pression) {
        const PZe = t.PR - t.PH;
        alertes.push(PZe <= PW ? alerte('ok', `Ø ${nf(t.D * 1000, 0)} mm en pression : pression requise à la buse ${nf(PZe, 1)} Pa ≤ ${nf(PW, 0)} Pa disponibles.`) : alerte('erreur', `Ø ${nf(t.D * 1000, 0)} mm : ${nf(PZe, 1)} Pa requis à la buse > ${nf(PW, 0)} Pa disponibles : augmenter le diamètre.`));
        if (PZe > 200) alertes.push(alerte('attention', 'Surpression supérieure à 200 Pa : conduit de classe de pression H1 (au lieu de P1).'));
      } else alertes.push(Pz >= PW ? alerte('ok', `Ø ${nf(t.D * 1000, 0)} mm : tirage disponible ${nf(t.PH, 1)} Pa − pertes ${nf(t.PR, 1)} Pa = ${nf(Pz, 1)} Pa ≥ ${nf(PW, 0)} Pa requis.`) : alerte('erreur', `Ø ${nf(t.D * 1000, 0)} mm : tirage net ${nf(Pz, 1)} Pa < ${nf(PW, 0)} Pa requis par l'appareil : augmenter le diamètre ou la hauteur.`));
      if (!pression && Pz > PW + 20) alertes.push(alerte('attention', `Tirage excédentaire (${nf(Pz - PW, 0)} Pa au-delà du besoin) : modérateur de tirage à prévoir.`));
      if (t.w < 0.5) alertes.push(alerte('attention', `Vitesse des fumées ${nf(t.w, 2)} m/s : conduit surdimensionné (refroidissement, condensation, refoulement).`));
    }
    const humide = t.Tparoi < Trf;
    if (humide) alertes.push(alerte(e.mode === 'pression' || cb === 'gaz' ? 'attention' : 'attention', `Condensation : paroi à ${nf(t.Tparoi, 1)} °C en sortie sous le point de rosée des fumées (${nf(Trf, 1)} °C) : conduit humide (classe W) étanche, résistant aux condensats, évacuation et neutralisation des condensats en pied${Te > 100 ? ' — ou isoler / réduire le diamètre pour rester sec' : ''}.`));
    else alertes.push(alerte('ok', `Conduit sec : paroi à ${nf(t.Tparoi, 1)} °C en sortie, au-dessus du point de rosée des fumées (${nf(Trf, 1)} °C).`));
    if (config === 'ventouse') alertes.push(alerte('attention', 'Ventouse (appareil étanche, type C) : longueur équivalente maximale, diamètre et terminal imposés par la notice du fabricant ; débouché selon l\'arrêté du 2 août 1977 et le NF DTU 61.1 (distances aux ouvrants et entrées d\'air).'));
    if (config === 'collectif') alertes.push(alerte('attention', `Conduit collectif (${nA} appareils, fonctionnement simultané) : vérification à faire selon la NF EN 13384-2 (appareils à l'arrêt, conduits de raccordement) ; appareils et conduit certifiés pour ce montage (3CEp, conduit collectif pour chaudières étanches).`));
    alertes.push(alerte('attention', 'Méthode simplifiée : vérification complète (NF EN 13384-1, températures et pressions de l\'appareil fournies par le fabricant) à faire pour l\'exécution ; débouché à 0,40 m au moins au-dessus de toute partie de toiture à moins de 8 m (NF DTU 24.1).'));
    return {
      valeurs: { QF, m, m1, lam, Trf, D: t.D * 1000, w: t.w, PH: t.PH, PR: t.PR, Pz, Ts: t.Ts, Tm: t.Tm, Tparoi: t.Tparoi, humide, ok: !!choix },
      resume: [['Appareil', `${nf(P, 1)} kW utiles, rendement ${nf(eta * 100, 0)} % → ${nf(QF, 1)} kW de débit calorifique${nA > 1 ? ` × ${nA} appareils` : ''}`], ['Combustible', `${F[0]}, CO₂ ${nf(CO2, 1)} % (excès d'air λ ${nf(lam, 2)})`],
        ['Débit de fumées', `${nf(m * 1000, 1)} g/s (${nf(m * 3600, 0)} kg/h)`], ['Diamètre', choix ? `${nf(t.D * 1000, 0)} mm${Dimp ? ' (imposé)' : ''}` : '—'], ['Vitesse moyenne', `${nf(t.w, 2)} m/s`],
        ['Températures', `entrée ${nf(Te, 0)} °C · moyenne ${nf(t.Tm, 0)} °C · sortie ${nf(t.Ts, 0)} °C`], ['Tirage disponible / pertes de charge', `${nf(t.PH, 1)} Pa / ${nf(t.PR, 1)} Pa`],
        [pression ? 'Pression requise à la buse' : 'Tirage net à la buse', `${nf(pression ? -Pz : Pz, 1)} Pa (${pression ? 'disponible' : 'requis'} ${nf(PW, 0)} Pa)`], ['Point de rosée des fumées', `${nf(Trf, 1)} °C · ${humide ? 'conduit humide (W)' : 'conduit sec (D)'}`]],
      tableaux: [{ titre: 'Diamètres', entetes: ['Ø (mm)', 'Vitesse (m/s)', 'T moyenne (°C)', 'T sortie (°C)', 'Tirage (Pa)', 'Pertes (Pa)', pression ? 'Pression requise (Pa)' : 'Tirage net (Pa)', 'Convient'],
        lignes: essais.filter(x => x.w < 30 && x.D * 1000 <= Math.max(600, (choix ? choix.D * 1000 : 0))).slice(0, 12).map(x => [nf(x.D * 1000, 0), nf(x.w, 2), nf(x.Tm, 0), nf(x.Ts, 0), nf(x.PH, 1), nf(x.PR, 1), nf(pression ? x.PR - x.PH : x.PH - x.PR, 1), ok(x) ? 'oui' : 'non']),
        surligne: choix && !Dimp ? essais.filter(x => x.w < 30).slice(0, 12).indexOf(choix) : -1 }],
      alertes,
      hypotheses: ['Débit de fumées par bilan de combustion : ṁ = Q_F × (λ × air stœchiométrique + combustible), λ = CO₂ maxi / CO₂ mesuré (fumées sèches).',
        'Refroidissement le long du conduit (NF EN 13384-1, simplifié) : θ sortie = θa + (θe − θa)·e^(−K), K = U·π·D·L / (ṁ·cp), cp = 1,08 kJ/kg·K ; θ paroi ≈ θ fumées − (θ fumées − θa)·U/αi (αi = 20 W/m²·K).',
        `Tirage PH = H·g·(ρ air − ρ fumées) ; pertes PR = SE·(λ·L/D + Σζ)·ρ·w²/2 avec SE = 1,5, λ de Swamee-Jain (rugosité ${CD[2]} mm) ; air à ${nf(Ta, 0)} °C, altitude ${nf(val(e.altitude, 200), 0)} m.`,
        `Point de rosée des fumées d'après la pression partielle de la vapeur d'eau formée (${nf(F[4], 3)} kg/kWh) et la formule de Magnus.`,
        pression ? 'Conduit en pression : la pression requise à la buse (pertes − tirage) doit rester sous la pression disponible de l\'appareil (notice du fabricant).' : 'Conduit en dépression : tirage net (tirage − pertes) ≥ tirage requis par l\'appareil (notice du fabricant).'],
      synthese: choix ? `Ø ${nf(t.D * 1000, 0)} mm · ${nf(t.w, 1)} m/s · ${pression ? `${nf(-Pz, 0)} Pa à la buse` : `tirage net ${nf(Pz, 0)} Pa`} · ${humide ? 'humide' : 'sec'}` : 'Aucun diamètre conforme',
    };
  }
  // Générateurs à combustion du schéma de principe : combustible, rendement, température de fumées et mode usuels
  const FUMEES = { 'chaudiere-cond': [60, 'pression'], 'chaudiere-gaz': [140, 'depression'], 'chaudiere-fioul': [170, 'depression'], 'chaudiere-bois': [160, 'depression'] };
  N.TYPES.conduitFumee = {
    titre: 'Conduit de fumée (NF EN 13384-1, simplifié)', icone: '🏭', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Débit de fumées, diamètre, vitesse, tirage disponible et requis (ou pression à la buse), températures, condensation ; ventouse et conduit collectif.',
    champs: [{ g: 'Appareil' }, { k: 'source', l: 'Générateur du schéma de principe (repris)', t: 's', o: [['auto', 'Automatique (chaudière de l\'étude)'], ['', 'Saisie']], d: 'auto' },
      { k: 'P', l: 'Puissance utile d\'un appareil (vide : 30 kW)', u: 'kW', d: '' }, { k: 'rendement', l: 'Rendement PCI (vide : 92 %)', u: '%', d: '' },
      { k: 'combustible', l: 'Combustible', t: 's', o: Object.entries(COMBUSTIBLES).map(([k, x]) => [k, x[0]]), d: 'gaz' }, { k: 'CO2', l: 'Teneur en CO₂ des fumées (vide : usuelle)', u: '%', d: '' },
      { k: 'Tf', l: 'Température des fumées à la buse (vide : 140 °C)', u: '°C', d: '' }, { k: 'mode', l: 'Fonctionnement du conduit', t: 's', o: [['depression', 'En dépression (tirage)'], ['pression', 'En pression (chaudière à condensation, brûleur pressurisé)']], d: 'depression' },
      { k: 'PW', l: 'Tirage requis / pression disponible à la buse (notice ; vide : 5 Pa / 50 Pa)', u: 'Pa', d: '' },
      { g: 'Conduit' }, { k: 'config', l: 'Configuration', t: 's', o: [['individuel', 'Conduit individuel'], ['ventouse', 'Ventouse (appareil étanche, type C)'], ['collectif', 'Conduit collectif (plusieurs appareils)']], d: 'individuel' },
      { k: 'nAppareils', l: 'Nombre d\'appareils raccordés (vide : 2)', d: '', si: e => e.config === 'collectif' },
      { k: 'conduit', l: 'Type de conduit', t: 's', o: Object.entries(CONDUITS).map(([k, x]) => [k, x[0]]), d: 'double' }, { k: 'H', l: 'Hauteur utile du conduit', u: 'm', d: 8 },
      { k: 'Lr', l: 'Longueur du conduit de raccordement', u: 'm', d: 1.5 }, { k: 'zeta', l: 'Σζ (coudes, té, sortie)', d: 2.5 }, { k: 'D', l: 'Diamètre imposé (vide : calculé)', u: 'mm', d: '' },
      { k: 'Ta', l: 'Température de l\'air extérieur', u: '°C', d: 15 }, { k: 'altitude', l: 'Altitude', u: 'm', d: 200 }],
    calcul: calculerConduit,
    lier(ctx) {
      const { e } = ctx;
      if (e.source !== 'auto') return;
      const COMB = (Ln().COMBUSTION) || {};
      for (const x of pidsEtude(ctx)) {
        const g = generateurs(x.es).find(y => COMB[y.type]); if (!g) continue;
        const cb = COMB[g.type], f = FUMEES[g.type] || [140, 'depression'], lib = ctx.libelle(x.note);
        ctx.imposer({ P: r1(g.P), combustible: cb[0], rendement: Math.round(cb[1] * 100), Tf: f[0], mode: f[1], ...(g.n > 1 ? { nAppareils: g.n } : {}) }, lib);
        if (g.n > 1 && e.config !== 'collectif') ctx.alertes.push(alerte('info', `${lib} : ${g.n} générateurs, un conduit chacun (ou choisir « conduit collectif »).`));
        return;
      }
    },
  };

  /* =====================================================================================================
     6. PAC sur sondes géothermiques verticales
     ===================================================================================================== */
  // Puissance d'extraction spécifique (W/m de sonde) selon le terrain, pour 1 800 h et 2 400 h de fonctionnement par an
  // (VDI 4640-2, petites installations ; valeurs basses des plages, à confirmer par un test de réponse thermique au-delà de 30 kW)
  const TERRAINS = { sec: ['Graviers, sables secs', 20, 15], argile: ['Argiles, limons humides', 35, 30], calcaire: ['Calcaire massif', 55, 45], sature: ['Graviers, sables saturés d\'eau', 65, 55],
    gres: ['Grès', 65, 55], granite: ['Granite, gneiss', 65, 55], basalte: ['Basalte', 40, 35], mauvais: ['Sous-sol médiocre (λ < 1,5 W/m·K)', 25, 20], normal: ['Roche et sédiments saturés courants (λ 1,5 à 3)', 60, 50], bon: ['Roche consolidée très conductrice (λ > 3)', 84, 70] };
  const SONDES = { du32: ['Double U PE 32 × 2,9', 0.0262, 2], su40: ['Simple U PE 40 × 3,7', 0.0326, 1], du40: ['Double U PE 40 × 3,7', 0.0326, 2] };
  const qSpecifique = (terrain, h) => { const t = TERRAINS[terrain] || TERRAINS.normal, x = Math.min(1.25, Math.max(-0.5, (h - 1800) / 600)); return t[1] + (t[2] - t[1]) * x; };
  function calculerGeothermie(e) {
    const alertes = [], P = val(e.P, 20), COP = Math.max(1.5, val(e.COP, 4.5)), h = val(e.heures, 1800), Hmax = val(e.Hmax, 100), esp = val(e.espacement, 8);
    const q = vide(e.q) ? qSpecifique(e.terrain, h) : num(e.q), Pext = P * (1 - 1 / COP), L = q > 0 ? Pext * 1000 / q : NaN, n = Math.max(1, Math.ceil(L / Hmax - 1e-9)), H = L / n;
    const so = SONDES[e.sonde] || SONDES.du32, fl = e.fluide || 'mpg30', dT = Math.max(1, val(e.dT, 3)), Tm = val(e.Tmoy, 2), f = C.liquide(fl, Tm);
    const Q = Pext / (f.rho * f.cp / 1000 * dT) * 3600, Qb = Q / (n * so[2]), x = C.ecoulement(Qb / 3600, so[1], f.rho, f.mu, 0.007);
    const dpS = x.R * 2 * H * 1.1 / 1000, dpT = dpS + val(e.dpPac, 40) + val(e.dpReseau, 20), Pel = Q / 3600 * dpT * 1000 / 0.35 / 1000;
    const Eext = Pext * h, Esp = Eext / L, modeF = e.froid || 'aucun', Pfr = val(e.Pfr, 0), hF = val(e.heuresFroid, 400), EER = val(e.EER, 4);
    const Pinj = modeF === 'geocooling' ? Pfr : modeF === 'reversible' ? Pfr * (1 + 1 / EER) : 0, Einj = Pinj * hF;
    if (!(P > 0)) alertes.push(alerte('erreur', 'Puissance de chauffage nulle.'));
    alertes.push(alerte('ok', `${n} sonde(s) de ${nf(H, 0)} m (${nf(L, 0)} m au total) pour ${nf(Pext, 1)} kW extraits du sol à ${nf(q, 0)} W/m (${nf(h, 0)} h/an).`));
    if (H > 100.5) alertes.push(alerte('attention', `Sondes de plus de 100 m : vérifier le régime applicable (géothermie de minime importance jusqu'à 200 m et 500 kW selon la carte réglementaire, sinon code minier), foreur qualifié, déclaration préalable.`));
    if (esp < 6) alertes.push(alerte('attention', `Espacement de ${nf(esp, 1)} m entre sondes : 6 m au moins conseillés (VDI 4640), interaction thermique sinon.`));
    if (Esp > 100) alertes.push(alerte('attention', `Énergie extraite ${nf(Esp, 0)} kWh/m·an (> 100) : risque de dérive de la température du sol ; allonger les sondes ou simuler le champ sur 25 ans.`));
    if (P > 30 || n > 5) alertes.push(alerte('attention', 'Au-delà de 30 kW ou de 5 sondes : test de réponse thermique (TRT) et simulation du champ de sondes (EED, NF X10-970) recommandés.'));
    if (x.regime !== 'turbulent') alertes.push(alerte('attention', `Écoulement ${x.regime} dans les sondes (Re ${nf(x.Re, 0)}) : échange réduit ; augmenter le débit par boucle (moins de sondes en parallèle) ou passer au simple U.`));
    if (f.gel !== null && f.gel !== undefined && Tm - dT / 2 < f.gel + 3) alertes.push(alerte('erreur', `Fluide trop proche de son point de congélation (${nf(f.gel, 1)} °C) : glycol plus concentré.`));
    if (Pinj > 0) alertes.push(alerte(Einj > Eext * 1.2 ? 'attention' : 'ok', `Rafraîchissement : ${nf(Einj, 0)} kWh/an réinjectés pour ${nf(Eext, 0)} kWh/an extraits (${nf(Einj / Math.max(Eext, 1) * 100, 0)} %)${Einj > Eext * 1.2 ? ' : sol réchauffé, vérifier par simulation' : ' : recharge favorable du sol'}.`));
    return {
      valeurs: { Pext, q, L, n, H, Q, Qb, dpT, Pel, Eext, Esp, Einj, Pac: P / COP },
      resume: [['Puissance de chauffage', `${nf(P, 1)} kW, COP ${nf(COP, 1)} → ${nf(P / COP, 1)} kW électriques`], ['Puissance extraite du sol', `${nf(Pext, 1)} kW`], ['Extraction spécifique', `${nf(q, 0)} W/m (${(TERRAINS[e.terrain] || TERRAINS.normal)[0]}, ${nf(h, 0)} h/an)`],
        ['Longueur de sonde', `${nf(L, 0)} m : ${n} sonde(s) de ${nf(H, 0)} m, espacées de ${nf(esp, 0)} m`], ['Fluide', `${f.libelle}, ${nf(Q, 2)} m³/h (ΔT ${nf(dT, 0)} K), ${nf(Qb * 1000 / 3600, 2)} L/s par boucle`],
        ['Pompe des sondes', `${nf(dpT, 0)} kPa (sondes ${nf(dpS, 0)} kPa) · ≈ ${nf(Pel * 1000, 0)} W`], ['Énergie extraite', `${nf(Eext, 0)} kWh/an (${nf(Esp, 0)} kWh/m·an)`]],
      tableaux: [{ titre: 'Sondes selon la profondeur', entetes: ['Profondeur maxi (m)', 'Sondes', 'Profondeur (m)', 'Longueur totale (m)', 'Débit par boucle (L/s)', 'ΔP sondes (kPa)'],
        lignes: [50, 80, 100, 150, 200].map(hm => { const nn = Math.max(1, Math.ceil(L / hm - 1e-9)), hh = L / nn, qb = Q / (nn * so[2]), y = C.ecoulement(qb / 3600, so[1], f.rho, f.mu, 0.007); return [String(hm), String(nn), nf(hh, 0), nf(L, 0), nf(qb * 1000 / 3600, 3), nf(y.R * 2 * hh * 1.1 / 1000, 1)]; }) }],
      alertes,
      hypotheses: ['Puissance extraite du sol = P chauffage × (1 − 1/COP) ; longueur = puissance extraite / extraction spécifique.', 'Extraction spécifique : VDI 4640-2 (valeurs basses), interpolée entre 1 800 et 2 400 h/an ; à confirmer par TRT pour les grandes installations.',
        `Sondes ${so[0]}, ${so[2]} boucle(s) par sonde en parallèle ; ΔP = Darcy-Weisbach sur 2 × profondeur + 10 %, PAC ${nf(val(e.dpPac, 40), 0)} kPa, collecteurs et liaisons ${nf(val(e.dpReseau, 20), 0)} kPa ; pompe à 35 % de rendement global.`,
        `Fluide à ${nf(Tm, 0)} °C moyen ; énergie extraite ≤ 100 kWh/m·an conseillé (VDI 4640).`],
      synthese: `${n} sonde(s) × ${nf(H, 0)} m · ${nf(Pext, 1)} kW extraits · ${nf(q, 0)} W/m`,
    };
  }
  N.TYPES.geothermie = {
    titre: 'PAC sur sondes géothermiques verticales', icone: '🌍', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Besoins, COP, puissance extraite du sol, longueur et nombre de sondes selon le terrain et les heures de fonctionnement, espacement, débit du fluide, pompe ; contrôle réglementaire au-delà de 100 m.',
    champs: [{ g: 'Besoins' }, { k: 'source', l: 'Puissance reprise de l\'étude', t: 's', o: [['auto', 'Automatique (PAC eau/eau du schéma, sinon bilans pièce par pièce)'], ['', 'Saisie']], d: 'auto' },
      { k: 'P', l: 'Puissance de chauffage de la PAC (vide : 20 kW)', u: 'kW', d: '' }, { k: 'COP', l: 'COP de la PAC (sol 0 °C / eau 35 °C)', d: 4.5 }, { k: 'heures', l: 'Heures de fonctionnement en chauffage', u: 'h/an', d: 1800 },
      { k: 'froid', l: 'Rafraîchissement', t: 's', o: [['aucun', 'Aucun'], ['geocooling', 'Géocooling (échangeur, sans compresseur)'], ['reversible', 'PAC réversible (froid actif)']], d: 'aucun' },
      { k: 'Pfr', l: 'Puissance de froid', u: 'kW', d: '', si: e => e.froid && e.froid !== 'aucun' }, { k: 'heuresFroid', l: 'Heures de rafraîchissement', u: 'h/an', d: 400, si: e => e.froid && e.froid !== 'aucun' },
      { k: 'EER', l: 'EER de la PAC en froid', d: 4, si: e => e.froid === 'reversible' },
      { g: 'Terrain et sondes' }, { k: 'terrain', l: 'Terrain', t: 's', o: Object.entries(TERRAINS).map(([k, x]) => [k, `${x[0]} — ${x[1]} W/m (1 800 h)`]), d: 'normal' },
      { k: 'q', l: 'Extraction spécifique (vide : selon le terrain ; TRT)', u: 'W/m', d: '' }, { k: 'Hmax', l: 'Profondeur maximale d\'une sonde', u: 'm', d: 100 }, { k: 'espacement', l: 'Espacement des sondes', u: 'm', d: 8 },
      { k: 'sonde', l: 'Sonde', t: 's', o: Object.entries(SONDES).map(([k, x]) => [k, x[0]]), d: 'du32' },
      { g: 'Fluide et pompe' }, { k: 'fluide', l: 'Fluide', t: 's', o: [['mpg20', 'Eau + monopropylène glycol 20 %'], ['mpg30', 'Eau + monopropylène glycol 30 %'], ['meg20', 'Eau + monoéthylène glycol 20 %'], ['meg30', 'Eau + monoéthylène glycol 30 %']], d: 'mpg30' },
      { k: 'Tmoy', l: 'Température moyenne du fluide', u: '°C', d: 2 }, { k: 'dT', l: 'Écart de température du fluide', u: 'K', d: 3 },
      { k: 'dpPac', l: 'ΔP de l\'évaporateur de la PAC', u: 'kPa', d: 40 }, { k: 'dpReseau', l: 'ΔP des collecteurs et liaisons', u: 'kPa', d: 20 },
      { k: 'alim', l: 'Pompe alimentée par', t: 's', o: (e, et) => (typeof Terminaux !== 'undefined' ? Terminaux : require('./terminaux')).optAlim(e, et, e.alim), d: '' }],
    calcul: calculerGeothermie,
    lier(ctx) {
      const { e } = ctx;
      if (e.source !== 'auto') return;
      for (const x of pidsEtude(ctx)) {
        const l = generateurs(x.es).filter(g => g.type === 'pac-eau');
        if (l.length) { ctx.imposer({ P: r1(l.reduce((a, g) => a + g.P * g.n, 0)) }, `${ctx.libelle(x.note)} (PAC eau/eau)`); return; }
      }
      const b = besoinsPieces(ctx);
      if (b) { ctx.imposer({ P: r1(b.Pch) }, b.src); if (e.froid && e.froid !== 'aucun') ctx.imposer({ Pfr: r1(b.Pfr) }, b.src); }
    },
    versElec: (v, e) => (v.Pel > 0 ? [{ rep: 'PG', designation: 'Pompe des sondes géothermiques', type: 'pompe', P: Math.max(0.05, r2(v.Pel)), tension: v.Pel > 1.5 ? 'tri' : 'mono', regulation: 'var', ...(e && e.alim ? { alim: e.alim } : {}) }] : []),
  };

  /* =====================================================================================================
     7. Solaire thermique ECS
     ===================================================================================================== */
  // Orientation et inclinaison : facteur sur l'irradiation horizontale (ordre de grandeur, latitudes françaises)
  const ORIENTATIONS = { s45: ['Sud, inclinaison 30 à 45°', 1.12], se: ['Sud-Est / Sud-Ouest, 30 à 45°', 1.06], eo: ['Est / Ouest, 30°', 0.92], horizontal: ['Horizontal (toiture-terrasse)', 1.0], facade: ['Façade sud (90°)', 0.75] };
  // Capteurs : [libellé, rendement de l'installation à faible taux de couverture]
  const CAPTEURS = { plan: ['Capteurs plans vitrés', 0.45], tubes: ['Capteurs à tubes sous vide', 0.55] };
  const couverture = X => 1 - Math.exp(-X);
  function calculerSolaire(e) {
    const alertes = [], s = site(e.site), Hh = vide(e.irradiation) ? s[1] : num(e.irradiation), fo = (ORIENTATIONS[e.orientation] || ORIENTATIONS.s45)[1], Hp = Hh * fo, ca = CAPTEURS[e.capteur] || CAPTEURS.plan;
    const Vj = val(e.Vj, 1000), Tc = val(e.Tc, 60), Tf = val(e.Tf, 10), jours = val(e.jours, 365), Eb = Vj * jours * 1.163 * (Tc - Tf) / 1000, k = Hp * ca[1] / Math.max(Eb, 1);
    const S = e.mode === 'surface' ? val(e.S, 20) : -Math.log(1 - Math.min(0.9, Math.max(0.05, val(e.objectif, 50) / 100))) / k, X = S * k, f = couverture(X), Es = f * Eb, prod = S > 0 ? Es / S : 0;
    const ratio = val(e.ratio, 60), V = S * ratio, Eapp = Eb - Es, Pel = Math.max(0.04, 0.03 + 0.0015 * S);
    if (!(Vj > 0)) alertes.push(alerte('erreur', 'Besoin journalier nul.'));
    alertes.push(alerte('ok', `${nf(S, 1)} m² de ${ca[0].toLowerCase()} : ${nf(Es, 0)} kWh/an solaires, taux de couverture ≈ ${nf(f * 100, 0)} % (${nf(prod, 0)} kWh/m²·an).`));
    if (ratio < 50 || ratio > 70) alertes.push(alerte('attention', `Stockage de ${nf(ratio, 0)} L/m² de capteurs, hors de la plage usuelle 50 à 70 L/m².`));
    if (V > 1.5 * Vj) alertes.push(alerte('attention', `Stockage solaire (${nf(V, 0)} L) supérieur à 1,5 fois le besoin journalier : eau peu renouvelée (légionelles), stagnation l'été.`));
    if (f > 0.6) alertes.push(alerte('attention', `Couverture de ${nf(f * 100, 0)} % : surproduction l'été et stagnation (vidange automatique ou dissipateur, fermetures prolongées) ; 40 à 60 % usuels en collectif.`));
    if (prod < 350 && S > 0) alertes.push(alerte('attention', `Productivité de ${nf(prod, 0)} kWh/m²·an : installation peu rentable (orientation, surdimensionnement).`));
    alertes.push(alerte('attention', 'Estimation simplifiée : à confirmer par une simulation (SOLO, SIMSOL, TRNSYS) avec la météo du site et les courbes des capteurs retenus ; le bouclage et les pertes de stockage restent couverts par l\'appoint.'));
    return {
      valeurs: { Eb, S, f, Es, prod, V, Eapp, Hp, Pel },
      resume: [['Besoin d\'ECS', `${nf(Vj, 0)} L/j à ${nf(Tc, 0)} °C → ${nf(Eb, 0)} kWh/an`], ['Irradiation dans le plan des capteurs', `${nf(Hp, 0)} kWh/m²·an (${nf(Hh, 0)} horizontal × ${nf(fo, 2)})`], ['Surface de capteurs', `${nf(S, 1)} m² (${ca[0].toLowerCase()})`],
        ['Taux de couverture estimé', `${nf(f * 100, 0)} %`], ['Production solaire', `${nf(Es, 0)} kWh/an (${nf(prod, 0)} kWh/m²)`], ['Stockage solaire', `${nf(V, 0)} L (${nf(ratio, 0)} L/m²)`],
        ['Appoint', `${nf(Eapp, 0)} kWh/an${num(e.Pappoint) > 0 ? ` · ${nf(num(e.Pappoint), 0)} kW (dimensionné sans soleil)` : ' · dimensionné comme sans solaire'}`], ['Pompe du circuit solaire', `≈ ${nf(Pel * 1000, 0)} W`]],
      tableaux: [{ titre: 'Surface et couverture', entetes: ['Surface (m²)', 'Couverture (%)', 'Production (kWh/an)', 'Productivité (kWh/m²·an)', 'Stockage (L)'],
        lignes: [0.25, 0.5, 0.75, 1, 1.5, 2].map(c => S * c).map(Sx => { const fx = couverture(Sx * k); return [nf(Sx, 1), nf(fx * 100, 0), nf(fx * Eb, 0), nf(Sx > 0 ? fx * Eb / Sx : 0, 0), nf(Sx * ratio, 0)]; }) }],
      alertes,
      hypotheses: ['Besoin = V × jours × 1,163 × (θ stockage − θ eau froide) (Wh/L·K) ; irradiation annuelle indicative du site × facteur d\'orientation et d\'inclinaison.',
        `Couverture f = 1 − exp(−X), X = S × H × η / besoin (loi de saturation simplifiée), η = ${nf(ca[1], 2)} à faible couverture ; ≈ ± 10 points.`, 'Stockage solaire 50 à 70 L par m² de capteur ; circuit primaire glycolé, vase d\'expansion dimensionné pour la stagnation.'],
      synthese: `${nf(S, 1)} m² · couverture ${nf(f * 100, 0)} % · ${nf(V, 0)} L`,
    };
  }
  N.TYPES.solaireEcs = {
    titre: 'Solaire thermique ECS', icone: '☀️', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Besoin journalier (repris de l\'ECS ou du sanitaire), irradiation du site, surface de capteurs, taux de couverture estimé, stockage (50 à 70 L/m²), appoint.',
    champs: [{ g: 'Besoins' }, { k: 'source', l: 'Besoin repris de l\'étude', t: 's', o: [['auto', 'Automatique (production d\'ECS, sinon réseau sanitaire)'], ['', 'Saisie']], d: 'auto' },
      { k: 'Vj', l: 'Besoin journalier (vide : 1 000 L/j)', u: 'L/j', d: '' }, { k: 'Tc', l: 'Température de stockage', u: '°C', d: 60 }, { k: 'Tf', l: 'Température de l\'eau froide', u: '°C', d: 10 },
      { k: 'jours', l: 'Jours d\'utilisation par an', u: 'j', d: 365 }, { k: 'Pappoint', l: 'Puissance de l\'appoint (reprise de l\'ECS)', u: 'kW', d: '' },
      { g: 'Site et capteurs' }, { k: 'site', l: 'Site (climat de l\'étude)', t: 's', o: optSites, d: 'H1' }, { k: 'irradiation', l: 'Irradiation horizontale (vide : selon le site)', u: 'kWh/m²·an', d: '' },
      { k: 'orientation', l: 'Orientation et inclinaison', t: 's', o: Object.entries(ORIENTATIONS).map(([k, x]) => [k, x[0]]), d: 's45' }, { k: 'capteur', l: 'Capteurs', t: 's', o: Object.entries(CAPTEURS).map(([k, x]) => [k, x[0]]), d: 'plan' },
      { k: 'mode', l: 'Dimensionnement', t: 's', o: [['couverture', 'Selon le taux de couverture visé'], ['surface', 'Surface de capteurs imposée']], d: 'couverture' },
      { k: 'objectif', l: 'Taux de couverture visé', u: '%', d: 50, si: e => e.mode !== 'surface' }, { k: 'S', l: 'Surface de capteurs', u: 'm²', d: 20, si: e => e.mode === 'surface' },
      { k: 'ratio', l: 'Stockage par m² de capteur', u: 'L/m²', d: 60 },
      { k: 'alim', l: 'Pompe alimentée par', t: 's', o: (e, et) => (typeof Terminaux !== 'undefined' ? Terminaux : require('./terminaux')).optAlim(e, et, e.alim), d: '' }],
    calcul: calculerSolaire,
    lier(ctx) {
      lierSite(ctx);
      if (ctx.e.source !== 'auto') return;
      const b = besoinEcs(ctx);
      if (b) ctx.imposer({ Vj: b.Vj, Tc: b.Tc, ...(b.Tf !== undefined ? { Tf: b.Tf } : {}), ...(b.P > 0 ? { Pappoint: b.P } : {}) }, b.src);
    },
    versElec: (v, e) => (v.S > 0 ? [{ rep: 'PSOL', designation: 'Pompe du circuit solaire (station solaire)', type: 'pompe', P: r2(v.Pel), tension: 'mono', regulation: 'tor', ...(e && e.alim ? { alim: e.alim } : {}) }] : []),
  };

  /* =====================================================================================================
     8. Consommation annuelle et coût global
     ===================================================================================================== */
  // Énergies : [libellé, kg CO₂/kWh (chauffage), kg CO₂/kWh (ECS), coefficient d'énergie primaire, prix indicatif (€/kWh TTC, à remplacer)]
  // Facteurs d'émission usuels ADEME (Base Empreinte) / méthode DPE 2021 ; réseau de chaleur : facteur propre à chaque réseau (arrêté annuel), valeur moyenne indicative
  const ENERGIES = { gaz: ['Gaz naturel', 0.227, 0.227, 1, 0.11], fioul: ['Fioul domestique', 0.324, 0.324, 1, 0.12], propane: ['Propane', 0.272, 0.272, 1, 0.16], bois: ['Bois (granulés)', 0.030, 0.030, 1, 0.09],
    elec: ['Électricité', 0.079, 0.065, null, 0.20], reseau: ['Réseau de chaleur', 0.15, 0.15, 1, 0.10] };
  const CO2_FROID = 0.064; // kg CO₂/kWh électrique, usage refroidissement
  function coutGlobal(I, E1, M, ans, a, g) { let s = I; for (let t = 1; t <= ans; t++) s += (E1 * (1 + g) ** (t - 1) + M) / (1 + a) ** t; return s; }
  function calculerEnergie(e) {
    const alertes = [], s = site(e.site), DJU = vide(e.DJU) ? s[0] : num(e.DJU), Ti = val(e.Ti, 19), Tb = val(e.Tbase, -7), i = val(e.intermittence, 85) / 100;
    const Pch = val(e.Pch, 0), Pfr = val(e.Pfr, 0), hF = val(e.heuresFroid, 500), Vj = val(e.Vj, 0), Tecs = val(e.Tecs, 60), Tf = val(e.Tf, 10), pertes = val(e.pertesEcs, 30) / 100;
    const ans = Math.max(1, Math.round(val(e.duree, 20))), a = val(e.actualisation, 3) / 100, g = val(e.hausse, 2) / 100, pE = val(e.prixElec, ENERGIES.elec[4]), cep = val(e.cepElec, 1.9);
    const Bch = Ti > Tb ? Pch * 24 * DJU * i / (Ti - Tb) : 0, Bfr = Pfr * hF, Becs = Vj * 365 * 1.163 * (Tecs - Tf) / 1000 * (1 + pertes);
    if (!(Ti > Tb)) alertes.push(alerte('erreur', 'Température intérieure inférieure à la température de base.'));
    const sol = (e.solutions || []).filter(x => x && (x.nom || x.energie)).map((x, k) => {
      const en = ENERGIES[x.energie] ? x.energie : 'gaz', E = ENERGIES[en], rch = val(x.rendCh, en === 'elec' ? 3 : 0.92), recs = val(x.rendEcs, rch), seer = num(x.seer);
      const prix = val(x.prix, en === 'elec' ? pE : E[4]), Cch = rch > 0 ? Bch / rch : 0, Cecs = recs > 0 ? Becs / recs : 0, Cfr = Bfr > 0 && seer > 0 ? Bfr / seer : 0;
      const co2 = vide(x.co2) ? null : num(x.co2), CO2 = (Cch * (co2 ?? E[1]) + Cecs * (co2 ?? E[2]) + Cfr * CO2_FROID) / 1000;
      const Eexp = (Cch + Cecs) * prix + Cfr * pE + val(x.abonnement, 0), M = val(x.maintenance, 0), I = val(x.invest, 0), CG = coutGlobal(I, Eexp, M, ans, a, g);
      const EP = (Cch + Cecs) * (E[3] ?? cep) + Cfr * cep;
      if (Bfr > 0 && !(seer > 0)) alertes.push(alerte('attention', `${x.nom || `Solution ${k + 1}`} : besoins de froid sans SEER : froid non compté.`));
      return { nom: x.nom || `Solution ${k + 1}`, en, rch, recs, seer, prix, Cch, Cecs, Cfr, CO2, Eexp, M, I, CG, EP, Cfin: Cch + Cecs + Cfr };
    });
    if (!sol.length) alertes.push(alerte('attention', 'Ajoutez 2 ou 3 solutions à comparer.'));
    const best = sol.reduce((b, x) => (!b || x.CG < b.CG ? x : b), null);
    if (best && sol.length > 1) {
      alertes.push(alerte('ok', `Coût global le plus bas sur ${ans} ans : ${best.nom} (${nf(best.CG, 0)} € actualisés).`));
      const ref = sol[0]; sol.slice(1).forEach(x => { const dI = x.I - ref.I, dE = ref.Eexp + ref.M - x.Eexp - x.M; if (dI > 0 && dE > 0) alertes.push(alerte('ok', `${x.nom} : surcoût de ${nf(dI, 0)} € amorti en ≈ ${nf(dI / dE, 1)} ans (temps de retour simple, face à ${ref.nom}).`)); });
    }
    if (!(Pch > 0) && !(Vj > 0) && !(Pfr > 0)) alertes.push(alerte('attention', 'Saisir la puissance de chauffage (ou relier l\'étude), les besoins de froid et d\'ECS.'));
    alertes.push(alerte('attention', 'Prix des énergies et facteurs d\'émission indicatifs : à remplacer par les tarifs du contrat et les facteurs en vigueur (Base Empreinte ADEME, arrêté du réseau de chaleur). Méthode des DJU : ordre de grandeur, pas un calcul réglementaire (RE 2020, DPE).'));
    return {
      valeurs: { DJU, Bch, Bfr, Becs, solutions: sol.map(x => ({ nom: x.nom, Cfin: x.Cfin, Eexp: x.Eexp, CO2: x.CO2, CG: x.CG })), meilleure: best ? best.nom : '' },
      resume: [['Site', `${libSite(e.site || 'H1')} : ${nf(DJU, 0)} DJU (base 18 °C)`], ['Besoin de chauffage', `${nf(Bch, 0)} kWh/an (${nf(Pch, 1)} kW, ${nf(Ti, 0)} / ${nf(Tb, 0)} °C, intermittence ${nf(i * 100, 0)} %)`],
        ['Besoin de froid', `${nf(Bfr, 0)} kWh/an (${nf(Pfr, 1)} kW × ${nf(hF, 0)} h)`], ['Besoin d\'ECS', `${nf(Becs, 0)} kWh/an (${nf(Vj, 0)} L/j, pertes ${nf(pertes * 100, 0)} %)`],
        ['Durée de l\'analyse', `${ans} ans, actualisation ${nf(a * 100, 1)} %, hausse des énergies ${nf(g * 100, 1)} %/an`], ['Solution au coût global le plus bas', best ? `${best.nom} — ${nf(best.CG, 0)} €` : '—']],
      tableaux: [{ titre: 'Comparaison des solutions', entetes: ['Solution', 'Énergie', 'Rendement / SCOP chauffage', 'Chauffage (kWh)', 'ECS (kWh)', 'Froid (kWh élec.)', 'Énergie primaire (kWh EP)', 'CO₂ (t/an)', 'Exploitation an 1 (€)', 'Maintenance (€/an)', 'Investissement (€)', `Coût global ${ans} ans (€)`],
        lignes: sol.map(x => [x.nom, ENERGIES[x.en][0], nf(x.rch, 2), nf(x.Cch, 0), nf(x.Cecs, 0), nf(x.Cfr, 0), nf(x.EP, 0), nf(x.CO2, 2), nf(x.Eexp, 0), nf(x.M, 0), nf(x.I, 0), nf(x.CG, 0)]), surligne: best ? sol.indexOf(best) : -1 }],
      alertes,
      hypotheses: ['Chauffage : B = P × 24 × DJU × i / (θi − θbase) (méthode des degrés-jours, DJU base 18 °C indicatifs du site) ; consommation = B / rendement saisonnier (ou SCOP).',
        'Froid : P × heures équivalentes à pleine charge / SEER (électricité) ; ECS : V × 365 × 1,163 × ΔT × (1 + pertes de stockage et de bouclage) / rendement.',
        `CO₂ : facteurs usuels ADEME / méthode DPE 2021 (gaz 0,227 ; fioul 0,324 ; propane 0,272 ; granulés 0,030 ; électricité 0,079 en chauffage, 0,065 en ECS, 0,064 en froid kg/kWh ; réseau de chaleur selon son arrêté) ; énergie primaire de l'électricité × ${nf(cep, 1)}.`,
        'Coût global actualisé : CG = I + Σ (E₁ (1 + g)^(t−1) + M) / (1 + a)^t sur la durée de l\'analyse (exploitation = énergies + abonnement).'],
      synthese: best ? `${nf(Bch + Becs, 0)} kWh/an · meilleur coût global : ${best.nom}` : `${nf(Bch + Becs, 0)} kWh/an`,
    };
  }
  N.TYPES.energieAnnuelle = {
    titre: 'Consommation annuelle et coût global', icone: '📊', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Besoins annuels (DJU du site, intermittence, heures de froid, ECS), consommations, coûts, CO₂ et coût global actualisé de 2 à 3 solutions sur 15 à 20 ans.',
    champs: [{ g: 'Climat' }, { k: 'site', l: 'Site (climat de l\'étude)', t: 's', o: optSites, d: 'H1' }, { k: 'DJU', l: 'DJU base 18 °C (vide : selon le site)', d: '' },
      { k: 'Ti', l: 'Température intérieure', u: '°C', d: 19 }, { k: 'Tbase', l: 'Température extérieure de base (vide : −7 °C)', u: '°C', d: '' },
      { g: 'Besoins' }, { k: 'source', l: 'Besoins repris de l\'étude', t: 's', o: [['auto', 'Automatique (schémas de principe, sinon bilans ; ECS)'], ['', 'Saisie']], d: 'auto' },
      { k: 'Pch', l: 'Puissance de chauffage', u: 'kW', d: 100 }, { k: 'intermittence', l: 'Coefficient d\'intermittence et d\'usage', u: '%', d: 85 },
      { k: 'Pfr', l: 'Puissance de froid', u: 'kW', d: 50 }, { k: 'heuresFroid', l: 'Heures équivalentes de froid à pleine charge', u: 'h/an', d: 500 },
      { k: 'Vj', l: 'Besoin d\'ECS', u: 'L/j', d: 500 }, { k: 'Tecs', l: 'Température de l\'ECS', u: '°C', d: 60 }, { k: 'Tf', l: 'Température de l\'eau froide', u: '°C', d: 10 }, { k: 'pertesEcs', l: 'Pertes de stockage et de bouclage de l\'ECS', u: '%', d: 30 },
      { g: 'Analyse économique' }, { k: 'duree', l: 'Durée de l\'analyse', u: 'ans', d: 20 }, { k: 'actualisation', l: 'Taux d\'actualisation', u: '%', d: 3 }, { k: 'hausse', l: 'Hausse annuelle des énergies', u: '%', d: 2 },
      { k: 'prixElec', l: 'Prix de l\'électricité (indicatif, à remplacer)', u: '€/kWh', d: 0.20 }, { k: 'cepElec', l: 'Coefficient d\'énergie primaire de l\'électricité', d: 1.9 },
      { k: 'solutions', l: 'Solutions comparées (rendement saisonnier ou SCOP ; prix vide : indicatif)', t: 'lignes', d: [
        { nom: 'Chaudière gaz à condensation + groupe froid', energie: 'gaz', rendCh: 0.95, rendEcs: 0.9, seer: 3.5, prix: '', co2: '', abonnement: 300, invest: 60000, maintenance: 1500 },
        { nom: 'PAC air/eau réversible', energie: 'elec', rendCh: 3.2, rendEcs: 2.5, seer: 4, prix: '', co2: '', abonnement: 300, invest: 85000, maintenance: 1800 }],
        colonnes: [{ k: 'nom', l: 'Solution', t: 't' }, { k: 'energie', l: 'Énergie (chauffage, ECS)', t: 's', o: Object.entries(ENERGIES).map(([k, x]) => [k, x[0]]) }, { k: 'rendCh', l: 'Rendement saisonnier / SCOP chauffage' },
          { k: 'rendEcs', l: 'Rendement / COP ECS' }, { k: 'seer', l: 'SEER froid (vide : pas de froid)' }, { k: 'prix', l: 'Prix (€/kWh, vide : indicatif)' }, { k: 'co2', l: 'CO₂ (kg/kWh, vide : usuel)' },
          { k: 'abonnement', l: 'Abonnement (€/an)' }, { k: 'invest', l: 'Investissement (€)' }, { k: 'maintenance', l: 'Maintenance (€/an)' }] }],
    calcul: calculerEnergie,
    lier(ctx) {
      const { e } = ctx, cl = lierSite(ctx);
      if (cl) ctx.imposer({ Tbase: cl.Tbase }, `climat de l'étude (${cl.libelle})`);
      if (e.source !== 'auto') return;
      let ch = 0, fr = 0; const libs = [];
      pidsEtude(ctx).forEach(x => { const P = num(x.d.Pdem); if (!(P > 0)) return; if (x.d.chaud) ch += P; else fr += P; libs.push(ctx.libelle(x.note)); });
      const b = besoinsPieces(ctx);
      if (ch > 0) ctx.imposer({ Pch: r1(ch) }, libs.join(', ')); else if (b) ctx.imposer({ Pch: r1(b.Pch) }, b.src);
      if (fr > 0) ctx.imposer({ Pfr: r1(fr) }, libs.join(', ')); else if (b) ctx.imposer({ Pfr: r1(b.Pfr) }, b.src);
      const w = besoinEcs(ctx);
      if (w) ctx.imposer({ Vj: w.Vj, Tecs: w.Tc }, w.src);
    },
  };

  /* =====================================================================================================
     9. Aides CEE (certificats d'économies d'énergie)
     ===================================================================================================== */
  // Opérations standardisées usuelles en CVC : [libellé générique, unité de la quantité, paramètres principaux de la fiche]
  // Références usuelles des fiches (arrêté du 22 décembre 2014 modifié) données à titre de repère : version, conditions et forfaits à vérifier sur le texte en vigueur.
  const FICHES = {
    'BAT-TH-102': ['Chaudière collective haute performance énergétique (tertiaire)', 'kW', 'puissance nominale, efficacité énergétique saisonnière, secteur d\'activité, zone climatique'],
    'BAR-TH-107': ['Chaudière collective haute performance énergétique (résidentiel collectif)', 'logements', 'nombre de logements, efficacité saisonnière, zone climatique'],
    'BAT-TH-113': ['Pompe à chaleur de type air/eau ou eau/eau (tertiaire)', 'kW', 'puissance thermique, efficacité énergétique saisonnière (ETAS), secteur, zone climatique'],
    'BAT-TH-146': ['Isolation d\'un réseau hydraulique de chauffage ou d\'ECS', 'm', 'longueur isolée, diamètre, température du fluide, classe d\'isolation'],
    'BAT-TH-155': ['Isolation de points singuliers d\'un réseau (housses isolantes)', 'unités', 'nombre et diamètre des points singuliers, température du fluide'],
    'BAT-TH-104': ['Robinets thermostatiques sur radiateurs', 'unités', 'nombre de robinets, secteur, zone climatique'],
    'BAT-TH-116': ['Système de gestion technique du bâtiment (GTB)', 'm²', 'surface chauffée, classe de la GTB (NF EN ISO 52120-1), usages gérés, secteur'],
    'BAT-TH-142': ['Système de déstratification d\'air', 'kW', 'puissance de chauffage du local, hauteur sous plafond, zone climatique'],
    autre: ['Autre opération standardisée (référence et forfait saisis)', 'unités', 'selon la fiche'],
  };
  const ZONES_CEE = { H1: 'H1', H2: 'H2', H3: 'H3' };
  function calculerCee(e) {
    const alertes = [], prix = num(e.prix), bonif = Math.max(0, val(e.bonification, 1)), zone = ZONES_CEE[e.zone] || 'H1';
    const l = (e.operations || []).filter(x => x && (x.fiche || x.libelle)).map((x, k) => {
      const F = FICHES[x.fiche] || FICHES.autre, q = num(x.quantite), forf = num(x.forfait), coef = val(x.coef, 1), saisi = !vide(x.forfait) && forf > 0;
      const kwh = saisi ? q * forf * coef : 0, eur = kwh / 1000 * prix * bonif;
      return { ref: x.fiche === 'autre' ? (x.ref || 'Autre') : x.fiche || 'Autre', lib: x.libelle || F[0], unite: F[1], params: F[2], q, forf, coef, saisi, kwh, eur };
    });
    const manquants = l.filter(x => !x.saisi), kwh = l.reduce((a, x) => a + x.kwh, 0), eur = l.reduce((a, x) => a + x.eur, 0);
    if (!l.length) alertes.push(alerte('attention', 'Ajoutez les opérations envisagées.'));
    if (manquants.length) alertes.push(alerte('attention', `Forfait à saisir pour ${manquants.map(x => x.ref).join(', ')} : lire le montant en kWh cumac par unité sur la fiche en vigueur (zone ${zone}, secteur, puissance…).`));
    if (!(prix > 0)) alertes.push(alerte('attention', 'Prix du MWh cumac à saisir (prix de marché, ou offre de l\'obligé ou du délégataire).'));
    if (kwh > 0) alertes.push(alerte('ok', `${nf(kwh / 1e6, 3)} GWh cumac${prix > 0 ? ` : ≈ ${nf(eur, 0)} € d'aide indicative` : ''}.`));
    alertes.push(alerte('attention', 'Montants indicatifs : références des fiches données comme repères ; conditions d\'éligibilité, forfaits, bonifications (« coup de pouce ») et pièces justificatives à vérifier sur le texte en vigueur à la date d\'engagement de l\'opération (avant signature du devis).'));
    return {
      valeurs: { kwh, eur, nb: l.length, manquants: manquants.length },
      resume: [['Zone climatique', zone], ['Opérations', String(l.length)], ['Volume', `${nf(kwh / 1000, 0)} MWh cumac`], ['Prix du MWh cumac', prix > 0 ? `${nf(prix, 2)} €` : 'à saisir'], ['Bonification', `× ${nf(bonif, 2)}`], ['Aide indicative', prix > 0 ? `${nf(eur, 0)} €` : '—']],
      tableaux: [{ titre: 'Opérations', entetes: ['Fiche (repère)', 'Opération', 'Paramètres principaux', 'Quantité', 'Unité', 'Forfait (kWh cumac / unité)', 'Coefficient', 'kWh cumac', 'Aide (€)'],
        lignes: l.map(x => [x.ref, x.lib, x.params, nf(x.q, 1), x.unite, x.saisi ? nf(x.forf, 0) : 'à saisir', nf(x.coef, 2), x.saisi ? nf(x.kwh, 0) : '—', x.saisi && prix > 0 ? nf(x.eur, 0) : '—']) }],
      alertes,
      hypotheses: ['kWh cumac = quantité × forfait par unité (lu sur la fiche pour la zone, le secteur et les caractéristiques de l\'équipement) × coefficient (secteur, bonification propre à la fiche).',
        'Aide = MWh cumac × prix du MWh cumac × bonification ; aucun forfait officiel n\'est fourni ici : valeurs à saisir d\'après le texte en vigueur.'],
      synthese: kwh > 0 ? `${nf(kwh / 1000, 0)} MWh cumac${prix > 0 ? ` · ≈ ${nf(eur, 0)} €` : ''}` : 'Forfaits à saisir',
    };
  }
  N.TYPES.aidesCee = {
    titre: 'Aides CEE (certificats d\'économies d\'énergie)', icone: '💶', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Opérations standardisées usuelles (chaudière, PAC, calorifugeage, régulation, GTB, déstratification…) : kWh cumac × prix du MWh cumac saisi, montants indicatifs à vérifier sur les fiches en vigueur.',
    champs: [{ g: 'Contexte' }, { k: 'zone', l: 'Zone climatique (climat de l\'étude)', t: 's', o: [['H1', 'H1'], ['H2', 'H2'], ['H3', 'H3']], d: 'H1' },
      { k: 'prix', l: 'Prix du MWh cumac (à saisir)', u: '€/MWhc', d: '' }, { k: 'bonification', l: 'Bonification (« coup de pouce », vide : aucune)', d: '' },
      { g: 'Opérations' }, { k: 'operations', l: 'Opérations (quantité vide : reprise de l\'étude quand c\'est possible)', t: 'lignes', d: [
        { fiche: 'BAT-TH-102', ref: '', libelle: '', quantite: '', forfait: '', coef: '' }, { fiche: 'BAT-TH-146', ref: '', libelle: '', quantite: '', forfait: '', coef: '' }],
        colonnes: [{ k: 'fiche', l: 'Fiche (repère)', t: 's', o: Object.entries(FICHES).map(([k, x]) => [k, k === 'autre' ? x[0] : `${k} — ${x[0]}`]) }, { k: 'ref', l: 'Référence (autre fiche)', t: 't' }, { k: 'libelle', l: 'Libellé (vide : celui de la fiche)', t: 't' },
          { k: 'quantite', l: 'Quantité' }, { k: 'forfait', l: 'Forfait (kWh cumac / unité, à saisir)' }, { k: 'coef', l: 'Coefficient (vide : 1)' }] }],
    calcul: calculerCee,
    lier(ctx) {
      const { e, imposer } = ctx, cl = climat(ctx);
      if (cl && SITES[cl.cle]) imposer({ zone: SITES[cl.cle][2] }, `climat de l'étude (${cl.libelle})`);
      // Quantités vides reprises de l'étude : puissance des chaudières ou des PAC (schémas), robinets (terminaux « radiateur »), surface (bilans)
      const pids = pidsEtude(ctx), COMB = Ln().COMBUSTION || {};
      const somme = f => { let P = 0; const libs = []; pids.forEach(x => { const s = generateurs(x.es).filter(g => f(g.type)).reduce((a, g) => a + g.P * g.n, 0); if (s > 0) { P += s; libs.push(ctx.libelle(x.note)); } }); return P > 0 ? { v: r1(P), src: libs.join(', ') } : null; };
      let rad = null; (ctx.notes || []).filter(n => n.type === 'terminaux').forEach(n => { const c = (((ctx.calculer(n).valeurs || {}).lignes) || []).filter(l => l.type === 'radiateur').reduce((a, l) => a + (l.n || 1), 0); if (c) rad = { v: (rad ? rad.v : 0) + c, src: ctx.libelle(n) }; });
      const b = besoinsPieces(ctx);
      const sources = { 'BAT-TH-102': somme(t => !!COMB[t]), 'BAT-TH-113': somme(t => t === 'pac-air' || t === 'pac-eau' || t === 'pac-rev'), 'BAT-TH-104': rad, 'BAT-TH-116': b ? { v: Math.round(b.S), src: b.src } : null };
      (e.operations || []).forEach((x, i) => {
        const s = x && vide(x.quantite) ? sources[x.fiche] : null; if (!s) return;
        x.quantite = s.v; const k = `operations.${i}.quantite`; imposer({ [k]: s.v }, s.src); delete e[k];
      });
    },
  };

  return { SITES, COMBUSTIBLES, CONDUITS, TERRAINS, SONDES, ORIENTATIONS, CAPTEURS, ENERGIES, FICHES, pAtm, tirage, qSpecifique, couverture, coutGlobal,
    calculerConduit, calculerGeothermie, calculerSolaire, calculerEnergie, calculerCee };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = AnnexesEnergie;
