// Calculs annexes — Plomberie : eaux pluviales, récupération des eaux de pluie, anti-légionelle et bouclage d'ECS.
// Rangés à part dans l'étude (famille « Calculs annexes », thème « Plomberie ») ; chaque type déclare annexe: true, theme,
// et sa fonction lier(ctx) qui reprend les données des autres notes de l'étude (voir Liens.resoudreLiens).
// Module pur (navigateur, node, tests).
const AnnexesPlomberie = ((N) => {
  const { nf, num } = N;
  const alerte = (niveau, texte) => ({ niveau, texte });
  const Dn = () => (typeof Donnees !== 'undefined' ? Donnees : require('./donnees'));
  const Ca = () => (typeof Calculs !== 'undefined' ? Calculs : require('./calculs'));
  const Ev = () => (typeof Evacuation !== 'undefined' ? Evacuation : require('./evacuation'));
  const vide = v => v === undefined || v === null || String(v).trim() === '';
  // Valeur saisie, sinon valeur par défaut (indicative) ; « defaut » indique si la valeur par défaut a servi
  const ou = (v, d) => (vide(v) ? d : num(v, d));
  const THEME = 'Plomberie', FAMILLE = 'Calculs annexes';
  // Valeurs réglementaires (températures et volumes de l'arrêté du 30/11/2005) : surchargeables dans les Réglages
  const VR = () => (typeof ValeursRegl !== 'undefined' ? ValeursRegl : (() => { try { return require('./valeurs-regl'); } catch (e) { return null; } })());
  const vReg = (cle, d) => { const R = VR(); return R ? R.v(cle, d) : d; };
  const notesDe = (ctx, type) => (ctx.notes || []).filter(n => n.type === type);

  /* =====================================================================================================================
     19. Eaux pluviales (NF DTU 60.11 partie 3, NF EN 12056-3)
     ===================================================================================================================== */
  // Intensité de pluie de calcul (l/min·m²) : table indicative, saisissable
  const INTENSITES = {
    dtu: ['Cas général, NF DTU 60.11 P3 (3 l/min·m²)', 3],
    majoree: ['Valeur majorée indicative (orages violents, montagne, pourtour méditerranéen : 4,5 l/min·m², à justifier)', 4.5],
    en12056: ['NF EN 12056-3, r = 0,03 l/s·m² (1,8 l/min·m²)', 1.8],
    saisie: ['Intensité saisie', null],
  };
  // Natures de toiture : [libellé, coefficient de ruissellement indicatif (récupération, NF EN 16941-1 : ordres de grandeur), terrasse]
  const NATURES = {
    inclinee: ['Toiture inclinée (tuiles, ardoises, bac acier, zinc)', 0.9, false], terrasse: ['Toiture terrasse, étanchéité apparente', 0.8, true],
    gravillons: ['Toiture terrasse gravillonnée', 0.6, true], vegExt: ['Toiture végétalisée extensive', 0.5, true], vegInt: ['Toiture végétalisée intensive', 0.3, true],
  };
  const EVACS = { gouttiere: 'Gouttière pendante', cheneau: 'Chéneau (encaissé ou havraise)', naissance: 'Naissance de terrasse (EEP)' };
  const MOIGNONS = { cyl: 'Moignon cylindrique', tron: 'Moignon tronconique' };
  // Descentes : diamètres intérieurs usuels (mm)
  const DESCENTES = [50, 60, 70, 80, 90, 100, 110, 125, 140, 160, 200, 250];
  // Collecteurs enterrés PVC CR8 (NF EN 1401) : diamètre extérieur, épaisseur
  const PVC_ENTERRE = [[110, 3.2], [125, 3.2], [160, 4.0], [200, 4.9], [250, 6.2], [315, 7.7], [400, 9.8], [500, 12.3]];
  // Capacité d'une descente (Wyly-Eaton, NF EN 12056-3 § 6) : Q = 2,5·10⁻⁴ · kb^(-1/6) · d^(8/3) · f^(5/3) (l/s, d en mm, kb = 0,25 mm)
  const capaciteDescente = (d, f = 0.33, kb = 0.25) => 2.5e-4 * kb ** (-1 / 6) * d ** (8 / 3) * f ** (5 / 3);
  // Gouttière demi-ronde de faible pente (NF EN 12056-3 § 5.2) : QL = 0,9 · 2,78·10⁻⁵ · A^1,25 (l/s, A section utile en mm²)
  const capaciteGouttiere = A => 0.9 * 2.78e-5 * A ** 1.25;
  const sectionGouttiere = Q => (Q / (0.9 * 2.78e-5)) ** (1 / 1.25);

  function calculerEP(e) {
    const alertes = [], ki = e.intensite || 'dtu', r = ki === 'saisie' || !INTENSITES[ki] ? ou(e.iSaisie, 3) : INTENSITES[ki][1];
    const kCyl = ou(e.kCyl, 1), kTron = ou(e.kTron, 0.7), hdMax = Math.min(1, ou(e.hd, 70) / 100), penteDef = ou(e.pente, 1) / 100, f = ou(e.fDescente, 33) / 100;
    if (!(r > 0)) alertes.push(alerte('erreur', 'Intensité de pluie nulle : saisir une intensité.'));
    const cols = (e.collecteurs || []).filter(c => c && String(c.rep || '').trim()).map(c => ({ rep: String(c.rep).trim(), aval: String(c.aval || '').trim(), nom: c.nom || '', L: num(c.L), I: vide(c.pente) ? penteDef : num(c.pente) / 100, enfants: [], toits: [] }));
    const parRep = new Map(); cols.forEach(c => { if (parRep.has(c.rep)) alertes.push(alerte('erreur', `Collecteur ${c.rep} en double.`)); else parRep.set(c.rep, c); });
    const racines = []; cols.forEach(c => { const p = c.aval && parRep.get(c.aval); if (c.aval && !p) alertes.push(alerte('erreur', `${c.rep} : collecteur aval « ${c.aval} » introuvable.`)); if (p && p !== c) p.enfants.push(c); else racines.push(c); });
    const toits = (e.toitures || []).filter(t => t && (t.rep || num(t.S) > 0)).map((t, i) => {
      const nat = NATURES[t.nature] ? t.nature : 'inclinee', S = num(t.S), mur = num(t.mur), Seff = S + 0.5 * mur, nD = Math.max(1, Math.round(ou(t.nDesc, 1)));
      const evac = EVACS[t.evac] ? t.evac : NATURES[nat][2] ? 'naissance' : 'gouttiere', moig = MOIGNONS[t.moignon] ? t.moignon : 'cyl', pente = num(t.pente);
      const Q = r * Seff / 60, Qd = Q / nD, k = moig === 'tron' ? kTron : kCyl;
      // Section de descente : 1 cm² par m² de toiture desservi en plan (moignon cylindrique, r = 3 l/min·m²), proportionnelle à r
      const Sd = Seff / nD * k * r / 3, dMin = Math.sqrt(4 * Sd / Math.PI) * 10;
      const d = DESCENTES.find(x => x >= dMin - 1e-9) || DESCENTES[DESCENTES.length - 1], cap = capaciteDescente(d, f);
      const o = { rep: String(t.rep || `T${i + 1}`).trim(), nom: t.nom || '', S, mur, Seff, nat, evac, moig, nD, pente, Q, Qd, Sd, dMin, d, cap, col: parRep.get(String(t.collecteur || '').trim()) };
      if (o.Qd > cap) alertes.push(alerte('attention', `${o.rep} : ${nf(Qd, 2)} l/s par descente au-delà de la capacité d'une descente Ø ${d} à ${nf(f * 100, 0)} % de remplissage (${nf(cap, 2)} l/s, NF EN 12056-3) : ajouter une descente.`));
      if (dMin > DESCENTES[DESCENTES.length - 1]) alertes.push(alerte('erreur', `${o.rep} : section de descente de ${nf(Sd, 0)} cm² hors de la gamme : multiplier les descentes.`));
      if (evac !== 'naissance') { o.Ag = sectionGouttiere(Qd); o.wg = Math.sqrt(8 * o.Ag / Math.PI); }
      if (NATURES[nat][2] && pente >= 5) alertes.push(alerte('attention', `${o.rep} : toiture terrasse à ${nf(pente, 0)} % de pente : vérifier la nature (terrasse < 5 %).`));
      // Trop-plein : toitures terrasses (acrotère) et chéneaux encaissés
      o.tp = NATURES[nat][2] || evac === 'cheneau';
      if (String(t.collecteur || '').trim() && !o.col) alertes.push(alerte('erreur', `${o.rep} : collecteur « ${t.collecteur} » introuvable.`));
      if (o.col) o.col.toits.push(o);
      return o;
    });
    if (!toits.length) alertes.push(alerte('attention', 'Ajoutez les surfaces de toiture (surface en plan, pente, nature).'));
    // Collecteurs : débits cumulés de l'amont vers l'aval, écoulement à surface libre (Prandtl-Colebrook, evacuation.js)
    const E = Ev(), dim = c => {
      c.enfants.forEach(dim);
      c.Q = c.toits.reduce((a, t) => a + t.Q, 0) + c.enfants.reduce((a, x) => a + x.Q, 0);
      const base = Math.max(110, ...c.enfants.map(x => x.d || 0)), pr = E.partiel(Math.min(0.999, hdMax));
      const ok = PVC_ENTERRE.filter(([de]) => de >= base).map(([de, ep]) => { const di = de - 2 * ep, p = E.pleine(di, c.I); return { de, di, Qp: p.Q, vp: p.v, Qmax: hdMax >= 0.999 ? p.Q : p.Q * pr.q }; });
      const x = ok.find(o => o.Qmax >= c.Q) || ok[ok.length - 1] || { de: base, di: base, Qp: 1, vp: 0, Qmax: 0 };
      c.d = x.de; c.cap = x.Qmax;
      let lo = 0.01, hi = 0.99; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (x.Qp * E.partiel(m).q < c.Q) lo = m; else hi = m; }
      c.hd = c.Q > 0 ? Math.min(1, (lo + hi) / 2) : 0; c.v = c.Q > 0 ? x.vp * E.partiel(Math.min(0.99, c.hd)).v : 0;
      if (c.Q > x.Qmax) alertes.push(alerte('erreur', `${c.rep} : ${nf(c.Q, 1)} l/s au-delà de la capacité du plus grand collecteur à ${nf(c.I * 100, 1)} % : augmenter la pente ou dédoubler.`));
      if (c.Q > 0 && c.v < 0.6) alertes.push(alerte('attention', `${c.rep} : vitesse ${nf(c.v, 2)} m/s sous 0,6 m/s (autocurage) : augmenter la pente.`));
      if (c.I < 0.005) alertes.push(alerte('attention', `${c.rep} : pente de ${nf(c.I * 100, 1)} %, 0,5 % minimum (1 % conseillé) pour un collecteur enterré.`));
    };
    racines.forEach(dim);
    const Stot = toits.reduce((a, t) => a + t.S, 0), Seff = toits.reduce((a, t) => a + t.Seff, 0), Q = toits.reduce((a, t) => a + t.Q, 0);
    const nDesc = toits.reduce((a, t) => a + t.nD, 0), nTp = toits.filter(t => t.tp).length;
    const sansCol = toits.filter(t => !t.col);
    if (cols.length && sansCol.length) alertes.push(alerte('attention', `${sansCol.map(t => t.rep).join(', ')} : toiture(s) rattachée(s) à aucun collecteur.`));
    if (nTp) alertes.push(alerte('attention', `${nTp} toiture(s) terrasse ou à chéneau encaissé : trop-plein obligatoire (section au moins égale à celle de la plus grande descente desservie, à vérifier selon le NF DTU 43.1 / 60.11), débouchant en façade, visible.`));
    if (toits.length) alertes.push(alerte('ok', `${nf(Seff, 0)} m² efficaces · ${nf(Q, 2)} l/s à ${nf(r, 1)} l/min·m² · ${nDesc} descente(s)${racines.length ? ` · rejet ${racines.map(c => `${c.rep} PVC Ø ${c.d}`).join(', ')}` : ''}.`));
    alertes.push(alerte('attention', 'Rejet au réseau public ou à l\'ouvrage de gestion des eaux pluviales selon le règlement d\'assainissement (débit de fuite, rétention, infiltration) : à vérifier auprès de la collectivité.'));
    return {
      valeurs: { r, Stot, Seff, Q, nDesc, trops: nTp, toitures: toits.map(t => ({ rep: t.rep, S: t.S, Seff: t.Seff, nature: t.nat, Q: t.Q, d: t.d, nD: t.nD, coll: t.col ? t.col.rep : '' })), collecteurs: cols.map(c => ({ rep: c.rep, d: c.d, Q: c.Q, I: c.I, v: c.v })) },
      resume: [['Intensité de pluie', `${nf(r, 1)} l/min·m² (${nf(r / 60, 3)} l/s·m²)`], ['Surface en plan / efficace', `${nf(Stot, 0)} m² / ${nf(Seff, 0)} m²`],
        ['Débit d\'eaux pluviales', `${nf(Q, 2)} l/s (${nf(Q * 3.6, 1)} m³/h)`], ['Descentes', `${nDesc} descente(s)`], ['Trop-pleins', nTp ? `${nTp} toiture(s) concernée(s)` : 'sans objet'],
        ...racines.map(c => [`Rejet ${c.rep}`, `PVC Ø ${c.d} mm · pente ${nf(c.I * 100, 1)} % · ${nf(c.Q, 2)} l/s · ${nf(c.v, 2)} m/s · remplissage ${nf(c.hd * 100, 0)} %`])],
      tableaux: [{ titre: 'Toitures, descentes et gouttières', entetes: ['Toiture', 'Nature', 'S en plan (m²)', 'S efficace (m²)', 'Q (l/s)', 'Évacuation', 'Descentes', 'Section / descente (cm²)', 'Ø descente (mm)', 'Capacité Ø (l/s)', 'Gouttière : section utile (cm²)', 'Largeur ½ ronde équiv. (mm)', 'Trop-plein'],
        lignes: toits.map(t => [t.rep, NATURES[t.nat][0], nf(t.S, 0), nf(t.Seff, 0), nf(t.Q, 2), `${EVACS[t.evac]} (${MOIGNONS[t.moig].toLowerCase()})`, String(t.nD), nf(t.Sd, 0), String(t.d), nf(t.cap, 2), t.Ag ? nf(t.Ag / 100, 0) : '—', t.wg ? nf(t.wg, 0) : '—', t.tp ? 'oui' : 'non']) },
      ...(cols.length ? [{ titre: 'Collecteurs enterrés (PVC CR8, écoulement à surface libre)', entetes: ['Collecteur', 'Se rejette dans', 'Toitures', 'Q (l/s)', 'Ø PVC (mm)', 'Pente (%)', 'Remplissage', 'v (m/s)', 'Capacité (l/s)'],
        lignes: cols.map(c => [c.rep, c.aval || 'rejet', c.toits.map(t => t.rep).join(', ') || '—', nf(c.Q, 2), String(c.d), nf(c.I * 100, 1), `${nf(c.hd * 100, 0)} %`, nf(c.v, 2), nf(c.cap, 2)]) }] : [])],
      alertes,
      hypotheses: [`Débit Q = r · S · C avec r = ${nf(r, 1)} l/min·m² et C = 1 pour toutes les natures de toiture (dimensionnement des évacuations) ; S : surface en plan (projection horizontale) majorée de la moitié des façades déversant sur la toiture.`,
        `Descentes (méthode du NF DTU 60.11 P3) : section intérieure de ${nf(kCyl, 2)} cm² par m² desservi pour un moignon cylindrique et ${nf(kTron, 2)} cm²/m² pour un moignon tronconique (valeur indicative à vérifier dans le DTU), à r = 3 l/min·m², proportionnelle à r.`,
        `Contrôle de la capacité des descentes : formule de Wyly-Eaton (NF EN 12056-3), remplissage ${nf(f * 100, 0)} %, kb = 0,25 mm.`,
        'Gouttières et chéneaux : section utile d\'après NF EN 12056-3 (gouttière de faible pente, longueur ≤ 50 fois la largeur), QL = 0,9 · 2,78·10⁻⁵ · A^1,25 ; valeur indicative pour un chéneau, à confirmer selon NF DTU 40.5 et la forme réelle.',
        `Collecteurs enterrés : Prandtl-Colebrook (kb = 1 mm), remplissage maximal ${nf(hdMax * 100, 0)} %, PVC CR8 Ø 110 minimum, diamètre jamais réduit vers l'aval ; débits des toitures cumulés sans foisonnement.`],
      synthese: `${nf(Seff, 0)} m² · ${nf(Q, 2)} l/s · ${nDesc} descente(s)${racines.length ? ` · rejet Ø ${racines.map(c => c.d).join(' + ')}` : ''}`,
    };
  }

  N.TYPES.eauxPluviales = {
    titre: 'Eaux pluviales (descentes, gouttières, collecteurs)', icone: '🌧️', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Surfaces de toiture, intensité de pluie, débits, diamètres des descentes, sections des gouttières et chéneaux, trop-pleins et collecteurs enterrés (NF DTU 60.11 P3, NF EN 12056-3).',
    champs: [{ g: 'Pluie de calcul' }, { k: 'intensite', l: 'Intensité de pluie (table indicative)', t: 's', o: Object.entries(INTENSITES).map(([k, x]) => [k, x[0]]), d: 'dtu' },
      { k: 'iSaisie', l: 'Intensité saisie', u: 'l/min·m²', d: 3, si: e => e.intensite === 'saisie' },
      { g: 'Descentes et collecteurs' }, { k: 'kCyl', l: 'Section de descente, moignon cylindrique (NF DTU 60.11 P3)', u: 'cm²/m²', d: 1 },
      { k: 'kTron', l: 'Section de descente, moignon tronconique (indicatif, à vérifier dans le DTU)', u: 'cm²/m²', d: 0.7 },
      { k: 'fDescente', l: 'Remplissage admis des descentes (contrôle Wyly-Eaton)', u: '%', d: 33 },
      { k: 'pente', l: 'Pente par défaut des collecteurs', u: '%', d: 1 }, { k: 'hd', l: 'Remplissage maximal des collecteurs', u: '%', d: 70 },
      { g: 'Toitures et collecteurs' },
      { k: 'toitures', l: 'Toitures (surface en plan ; façade déversante comptée pour moitié)', t: 'lignes', d: [
        { rep: 'T1', nom: 'Terrasse bâtiment', S: 400, mur: 0, pente: 2, nature: 'terrasse', evac: 'naissance', moignon: 'cyl', nDesc: 2, collecteur: 'CE1' },
        { rep: 'T2', nom: 'Toiture tuiles', S: 150, mur: 0, pente: 35, nature: 'inclinee', evac: 'gouttiere', moignon: 'cyl', nDesc: 2, collecteur: 'CE2' }],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'nom', l: 'Désignation', t: 't' }, { k: 'S', l: 'Surface en plan (m²)' }, { k: 'mur', l: 'Façade déversante (m²)' }, { k: 'pente', l: 'Pente (%)' },
          { k: 'nature', l: 'Nature', t: 's', o: Object.entries(NATURES).map(([k, x]) => [k, x[0]]) }, { k: 'evac', l: 'Évacuation', t: 's', o: Object.entries(EVACS) },
          { k: 'moignon', l: 'Moignon', t: 's', o: Object.entries(MOIGNONS) }, { k: 'nDesc', l: 'Nombre de descentes' },
          { k: 'collecteur', l: 'Collecteur', t: 's', o: e => [['', '—'], ...(e.collecteurs || []).filter(c => c && c.rep).map(c => [c.rep, `${c.rep}${c.nom ? ` — ${c.nom}` : ''}`])] }] },
      { k: 'collecteurs', l: 'Collecteurs enterrés, décrits depuis le rejet (« se rejette dans » vide = rejet au réseau ou à l\'ouvrage)', t: 'lignes', d: [
        { rep: 'CE1', aval: '', nom: 'Collecteur principal', L: 30, pente: '' }, { rep: 'CE2', aval: 'CE1', nom: 'Collecteur façade nord', L: 12, pente: '' }],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'aval', l: 'Se rejette dans', t: 's', o: (e, et, l) => { const reps = (e.collecteurs || []).map(c => String((c && c.rep) || '').trim()).filter(r => r && (!l || r !== String(l.rep || '').trim())); return [['', '— (rejet)'], ...[...new Set(reps)].map(r => [r, r])]; }, libre: true },
          { k: 'nom', l: 'Désignation', t: 't' }, { k: 'L', l: 'Longueur (m)' }, { k: 'pente', l: 'Pente (%) (vide : par défaut)' }] }],
    calcul: calculerEP,
  };

  /* =====================================================================================================================
     20. Récupération des eaux de pluie (NF EN 16941-1, arrêté du 21 août 2008)
     ===================================================================================================================== */
  // Pluviométrie annuelle indicative (mm/an), ordre de grandeur par région : à remplacer par la normale de la station la plus proche
  const PLUVIO = {
    idf: ['Île-de-France (≈ 650 mm/an)', 650], nord: ['Hauts-de-France (≈ 700 mm/an)', 700], ouest: ['Bretagne, Normandie (≈ 850 mm/an)', 850],
    centre: ['Centre, Pays de la Loire (≈ 700 mm/an)', 700], est: ['Grand Est (≈ 750 mm/an)', 750], bourgogne: ['Bourgogne-Franche-Comté (≈ 850 mm/an)', 850],
    rhone: ['Rhône-Alpes, plaine (≈ 850 mm/an)', 850], massif: ['Auvergne, Limousin (≈ 900 mm/an)', 900], sudouest: ['Nouvelle-Aquitaine, Occitanie ouest (≈ 800 mm/an)', 800],
    med: ['Pourtour méditerranéen (≈ 600 mm/an, étés secs)', 600], montagne: ['Montagne (≈ 1 200 mm/an)', 1200], saisie: ['Pluviométrie saisie', null],
  };
  // Besoins : [libellé, unité de quantité, ratio indicatif (L par unité et par jour d'usage), jours d'usage par an, usage intérieur, saison (mois)]
  const BESOINS = {
    wc: ['WC (chasses d\'eau)', 'WC', 60, 365, true], urinoir: ['Urinoirs', 'urinoir', 20, 365, true],
    lavelinge: ['Lave-linge (sous réserve, arrêté du 21/08/2008)', 'lave-linge', 50, 250, true], sols: ['Lavage des sols', 'm²', 0.5, 250, true],
    arrosage: ['Arrosage des espaces verts', 'm²', 3, 120, false, [4, 5, 6, 7, 8, 9]], vehicules: ['Lavage de véhicules', 'véhicule', 100, 52, false],
    autre: ['Autre usage (saisi)', 'unité', 0, 365, false],
  };
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const JOURS_MOIS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const CUVES = [1000, 1500, 2000, 3000, 4000, 5000, 6000, 7500, 10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000, 60000, 75000, 100000];
  // Bilan mensuel d'une cuve de volume V : régime établi (2e année d'une simulation partant de la cuve vide)
  function bilanMensuel(V, Rm, Bm) {
    let S = 0; const mois = [];
    for (let k = 0; k < 24; k++) {
      const m = k % 12, dispo = S + Rm[m], fourni = Math.min(Bm[m], dispo), reste = dispo - fourni, deb = Math.max(0, reste - V);
      S = Math.min(V, reste);
      if (k >= 12) mois.push({ R: Rm[m], B: Bm[m], fourni, appoint: Bm[m] - fourni, trop: deb, S });
    }
    const B = Bm.reduce((a, x) => a + x, 0), F = mois.reduce((a, x) => a + x.fourni, 0);
    return { mois, couverture: B > 0 ? F / B : 0, fourni: F, appoint: B - F, trop: mois.reduce((a, x) => a + x.trop, 0) };
  }
  const ETAB_SENSIBLES = { '': 'Autre bâtiment', sensible: 'Établissement de santé, médico-social d\'hébergement, cabinet médical, crèche, école maternelle ou élémentaire' };

  function calculerREP(e) {
    const alertes = [], S = ou(e.S, 0), nat = NATURES[e.nature] ? e.nature : 'inclinee', Cr = ou(e.Cr, NATURES[nat][1]), eta = ou(e.filtre, 90) / 100;
    const kz = PLUVIO[e.zone] ? e.zone : 'idf', P = kz === 'saisie' ? ou(e.pSaisie, 700) : PLUVIO[kz][1];
    if (!(S > 0)) alertes.push(alerte('attention', 'Surface de captage à saisir (ou reprise d\'un calcul d\'eaux pluviales de l\'étude).'));
    // Pluies mensuelles saisies (12 valeurs) ou pluviométrie annuelle répartie au prorata des jours
    const saisies = String(e.mensuel || '').split(/[;\s]+/).map(x => num(x, NaN)).filter(Number.isFinite);
    const Pm = saisies.length === 12 ? saisies : JOURS_MOIS.map(j => P * j / 365), Pan = Pm.reduce((a, x) => a + x, 0);
    if (String(e.mensuel || '').trim() && saisies.length !== 12) alertes.push(alerte('attention', `Pluies mensuelles : ${saisies.length} valeur(s) lue(s) au lieu de 12 : répartition uniforme de la pluviométrie annuelle.`));
    const Rm = Pm.map(p => S * p * Cr * eta), Ra = Rm.reduce((a, x) => a + x, 0); // mm × m² = litres
    const bes = (e.besoins || []).filter(b => b && (b.usage || num(b.q) > 0)).map(b => {
      const U = BESOINS[b.usage] || BESOINS.autre, q = num(b.q), ratio = ou(b.ratio, U[2]), jours = Math.min(365, ou(b.jours, U[3])), an = q * ratio * jours;
      // Répartition mensuelle : saison d'arrosage ou au prorata des jours
      const saison = U[5], js = saison ? saison.reduce((a, m) => a + JOURS_MOIS[m - 1], 0) : 365;
      const mens = JOURS_MOIS.map((j, m) => (saison ? (saison.includes(m + 1) ? an * j / js : 0) : an * j / 365));
      return { usage: b.usage || 'autre', U, lib: b.nom || U[0], q, ratio, jours, an, mens, int: U[4] };
    });
    if (!bes.length) alertes.push(alerte('attention', 'Ajoutez les besoins (WC, urinoirs, arrosage, lavage…) ou reprenez les appareils du calcul sanitaire de l\'étude.'));
    const Bm = MOIS.map((_, m) => bes.reduce((a, b) => a + b.mens[m], 0)), Ba = Bm.reduce((a, x) => a + x, 0);
    // Volume de cuve : méthode des jours d'autonomie (≈ 6 % de min(R, B) pour 21 jours, NF EN 16941-1 simplifiée) ou bilan mensuel
    const methode = e.methode === 'mensuel' ? 'mensuel' : 'jours', Nj = ou(e.jours, 21), base = Math.min(Ra, Ba);
    const Vjours = base * Nj / 365, cuveSup = v => CUVES.find(x => x >= v - 1e-9) || Math.ceil(v / 10000) * 10000;
    const couvMax = Ba > 0 ? bilanMensuel(1e12, Rm, Bm).couverture : 0;
    let V;
    if (methode === 'mensuel') { const seuil = ou(e.seuilCouv, 95) / 100; V = Ba > 0 && Ra > 0 ? (CUVES.find(v => bilanMensuel(v, Rm, Bm).couverture >= seuil * couvMax - 1e-9) || CUVES[CUVES.length - 1]) : 0; }
    else V = base > 0 ? cuveSup(Vjours) : 0;
    if (!vide(e.Vimpose)) V = num(e.Vimpose);
    const b = bilanMensuel(V, Rm, Bm), couv = b.couverture;
    if (Ra > 0 && Ba > 0) alertes.push(alerte('ok', `Cuve de ${nf(V / 1000, 1)} m³ : ${nf(couv * 100, 0)} % des besoins couverts (${nf(b.fourni / 1000, 1)} m³/an d'eau de pluie, appoint ${nf(b.appoint / 1000, 1)} m³/an ; ${nf(couvMax * 100, 0)} % au plus avec une cuve infinie).`));
    if (Ra > 0 && Ba > 0 && Ra < 0.5 * Ba) alertes.push(alerte('attention', `Ressource (${nf(Ra / 1000, 1)} m³/an) inférieure à la moitié des besoins (${nf(Ba / 1000, 1)} m³/an) : couverture limitée par la surface de captage.`));
    // Pompe de distribution (surpresseur) : puissance hydraulique / rendement, ou puissance saisie
    const Qp = ou(e.Qp, 2), Hp = ou(e.Hp, 35), etaP = ou(e.rendPompe, 40) / 100, Pel = vide(e.Pel) ? Math.max(0.37, 1000 * 9.81 * Qp / 3600 * Hp / Math.max(0.05, etaP) / 1000) : num(e.Pel);
    // Usages et réglementation (arrêté du 21 août 2008)
    const interieur = bes.filter(x => x.int), sensible = e.etablissement === 'sensible';
    if (sensible && interieur.length) alertes.push(alerte('erreur', `Usage intérieur de l'eau de pluie interdit dans cet établissement (arrêté du 21/08/2008, art. 3) : ${interieur.map(x => x.lib).join(', ')}.`));
    if (e.amiante === 'oui' && interieur.length) alertes.push(alerte('erreur', 'Toiture en amiante-ciment ou en plomb : eau de pluie interdite à l\'intérieur des bâtiments (arrêté du 21/08/2008).'));
    if (bes.some(x => x.usage === 'lavelinge')) alertes.push(alerte('attention', 'Lave-linge : usage admis à titre expérimental sous réserve d\'un traitement adapté de l\'eau, déclaré par l\'installateur (arrêté du 21/08/2008, art. 2).'));
    if (interieur.length) alertes.push(alerte('attention', 'Usage intérieur : déclaration en mairie, aucune connexion avec le réseau d\'eau potable, appoint par disconnexion totale (surverse AA ou AB, NF EN 1717), repérage des canalisations et plaque « eau non potable » à chaque point de soutirage.'));
    const regl = [
      { niveau: 'obligatoire', texte: 'Usages extérieurs autorisés : arrosage, lavage des véhicules et des surfaces extérieures (eau de pluie de toiture).', ref: 'Arrêté du 21/08/2008, art. 2' },
      { niveau: 'obligatoire', texte: 'Usages intérieurs autorisés : évacuation des excrétas (WC, urinoirs), lavage des sols ; lavage du linge à titre expérimental sous réserve d\'un traitement adapté.', ref: 'Arrêté du 21/08/2008, art. 2' },
      { niveau: 'obligatoire', texte: 'Usage intérieur interdit dans les établissements de santé, médico-sociaux d\'hébergement de personnes âgées, cabinets médicaux et dentaires, laboratoires, crèches, écoles maternelles et élémentaires.', ref: 'Arrêté du 21/08/2008, art. 3' },
      { niveau: 'obligatoire', texte: 'Aucune connexion, même temporaire, entre le réseau d\'eau de pluie et le réseau d\'eau potable : appoint en eau potable par disconnexion totale (surverse, garde d\'air AA ou AB).', ref: 'Arrêté du 21/08/2008, art. 4 ; NF EN 1717' },
      { niveau: 'obligatoire', texte: 'Repérage des canalisations d\'eau de pluie à l\'intérieur, plaque « eau non potable » et pictogramme à chaque point de soutirage ; robinets de soutirage extérieurs verrouillables.', ref: 'Arrêté du 21/08/2008, art. 4 et 5' },
      { niveau: 'obligatoire', texte: 'Cuve à l\'abri de la lumière et du gel, trop-plein avec dispositif anti-retour vers le réseau, regard d\'accès verrouillable, ventilation munie d\'une grille anti-moustiques.', ref: 'Arrêté du 21/08/2008, art. 3' },
      { niveau: 'obligatoire', texte: 'Déclaration en mairie de l\'usage raccordé au réseau d\'assainissement (eaux usées rejetées comptées pour la redevance).', ref: 'Code général des collectivités territoriales, R. 2224-19-4' },
      { niveau: 'obligatoire', texte: 'Entretien : vérifications semestrielles (propreté, signalisation) et annuelles (nettoyage des filtres, vidange et nettoyage de la cuve, organes de disconnexion), carnet sanitaire tenu à jour.', ref: 'Arrêté du 21/08/2008, art. 3 et 4' },
      { niveau: 'conseil', texte: 'Filtration en amont de la cuve (filtre à débris), arrivée d\'eau calmée en fond de cuve, aspiration flottante de la pompe.', ref: 'NF EN 16941-1' }];
    return {
      valeurs: { S, Cr, P: Pan, Ra, Ba, V, Vjours, couverture: couv, couvMax, fourni: b.fourni, appoint: b.appoint, trop: b.trop, Qp, Hp, Pel, interieur: interieur.length },
      resume: [['Surface de captage', `${nf(S, 0)} m² · ${NATURES[nat][0].toLowerCase()} (C = ${nf(Cr, 2)}, filtre ${nf(eta * 100, 0)} %)`], ['Pluviométrie', `${nf(Pan, 0)} mm/an${saisies.length === 12 ? ' (mensuelle saisie)' : ''}`],
        ['Ressource récupérable', `${nf(Ra / 1000, 1)} m³/an`], ['Besoins', `${nf(Ba / 1000, 1)} m³/an (${nf(Ba / 365, 0)} L/j en moyenne)`],
        ['Volume de cuve', `${nf(V / 1000, 1)} m³ (${vide(e.Vimpose) ? methode === 'mensuel' ? `bilan mensuel, ${nf(ou(e.seuilCouv, 95), 0)} % de la couverture maximale` : `${nf(Nj, 0)} jours d'autonomie : ${nf(Vjours / 1000, 2)} m³ calculés` : 'imposé'})`],
        ['Taux de couverture', `${nf(couv * 100, 0)} % (maximum ${nf(couvMax * 100, 0)} %)`], ['Appoint en eau potable', `${nf(b.appoint / 1000, 1)} m³/an`], ['Trop-plein', `${nf(b.trop / 1000, 1)} m³/an`],
        ['Pompe de distribution', `${nf(Qp, 1)} m³/h sous ${nf(Hp, 0)} mCE · ${nf(Pel, 2)} kW`]],
      tableaux: [{ titre: 'Besoins en eau de pluie', entetes: ['Usage', 'Quantité', 'Ratio (L/unité/j)', 'Jours/an', 'Besoin (m³/an)', 'Intérieur'],
        lignes: bes.map(x => [x.lib, `${nf(x.q, 0)} ${x.U[1]}`, nf(x.ratio, 1), nf(x.jours, 0), nf(x.an / 1000, 2), x.int ? 'oui' : 'non']) },
      { titre: `Bilan mensuel (cuve de ${nf(V / 1000, 1)} m³, régime établi)`, entetes: ['Mois', 'Pluie (mm)', 'Ressource (m³)', 'Besoin (m³)', 'Fourni (m³)', 'Appoint (m³)', 'Trop-plein (m³)', 'Cuve en fin de mois (m³)'],
        lignes: [...b.mois.map((x, m) => [MOIS[m], nf(Pm[m], 0), nf(x.R / 1000, 2), nf(x.B / 1000, 2), nf(x.fourni / 1000, 2), nf(x.appoint / 1000, 2), nf(x.trop / 1000, 2), nf(x.S / 1000, 2)]),
          ['Année', nf(Pan, 0), nf(Ra / 1000, 1), nf(Ba / 1000, 1), nf(b.fourni / 1000, 1), nf(b.appoint / 1000, 1), nf(b.trop / 1000, 1), '—']], total: true },
      { titre: 'Taux de couverture selon le volume de cuve', entetes: ['Volume (m³)', 'Couverture', 'Appoint (m³/an)'],
        lignes: CUVES.filter(v => v <= Math.max(V * 3, 5000)).map(v => { const x = bilanMensuel(v, Rm, Bm); return [nf(v / 1000, 1), `${nf(x.couverture * 100, 0)} %`, nf(x.appoint / 1000, 1)]; }) }],
      onglets: [{ titre: 'Réglementation', blocs: [{ titre: 'Arrêté du 21 août 2008 (récupération des eaux de pluie)', items: regl }] }],
      alertes,
      hypotheses: [`Ressource R = S · P · C · η (mm × m² = litres) ; C = ${nf(Cr, 2)} (coefficient de ruissellement indicatif selon la nature de la toiture, NF EN 16941-1), η = ${nf(eta * 100, 0)} % (rendement du filtre).`,
        `Pluviométrie : ${saisies.length === 12 ? 'pluies mensuelles saisies' : `${PLUVIO[kz][0]}, répartie au prorata des jours (valeur indicative : prendre la normale de la station Météo-France la plus proche)`}.`,
        'Besoins : quantité × ratio × jours d\'usage (ratios indicatifs à adapter à l\'occupation) ; arrosage réparti d\'avril à septembre, autres usages au prorata des jours.',
        `Cuve : ${methode === 'mensuel' ? 'plus petit volume courant atteignant le seuil de couverture choisi, d\'après un bilan mensuel (régime établi)' : `V = min(R, B) × ${nf(Nj, 0)} / 365 (méthode simplifiée des jours d'autonomie, ≈ 6 % pour 21 jours, NF EN 16941-1), arrondi au volume courant supérieur`} ; volume utile ≈ volume nominal (réserve morte et trop-plein à déduire selon la cuve).`,
        'Bilan mensuel : cuve partant vide, deuxième année retenue ; le pas mensuel ne représente pas les épisodes secs de quelques jours (couverture légèrement surestimée).',
        `Pompe : P = ρ · g · Q · H / η (η = ${nf(etaP * 100, 0)} %), 0,37 kW minimum, sauf puissance saisie.`],
      synthese: `${nf(S, 0)} m² · cuve ${nf(V / 1000, 1)} m³ · couverture ${nf(couv * 100, 0)} %`,
    };
  }

  N.TYPES.eauxDePluie = {
    titre: 'Récupération des eaux de pluie (cuve, couverture des besoins)', icone: '💧', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Surface de captage, pluviométrie, coefficient de ruissellement, besoins (WC, arrosage, lavage), volume de cuve (jours d\'autonomie ou bilan mensuel), taux de couverture, pompe et rappels de l\'arrêté du 21 août 2008.',
    champs: [{ g: 'Captage' }, { k: 'S', l: 'Surface de captage (vide : reprise des toitures d\'un calcul d\'eaux pluviales)', u: 'm²', d: '' },
      { k: 'nature', l: 'Nature de la toiture', t: 's', o: Object.entries(NATURES).map(([k, x]) => [k, `${x[0]} (C ≈ ${String(x[1]).replace('.', ',')})`]), d: '' },
      { k: 'Cr', l: 'Coefficient de ruissellement (vide : selon la nature)', d: '' }, { k: 'filtre', l: 'Rendement du filtre', u: '%', d: 90 },
      { k: 'amiante', l: 'Toiture en amiante-ciment ou en plomb', t: 's', o: [['non', 'Non'], ['oui', 'Oui']], d: 'non' },
      { g: 'Pluviométrie' }, { k: 'zone', l: 'Pluviométrie annuelle (zone, valeur indicative)', t: 's', o: Object.entries(PLUVIO).map(([k, x]) => [k, x[0]]), d: 'idf' },
      { k: 'pSaisie', l: 'Pluviométrie annuelle saisie', u: 'mm/an', d: 700, si: e => e.zone === 'saisie' },
      { k: 'mensuel', l: 'Pluies mensuelles (12 valeurs en mm séparées par « ; », facultatif)', t: 't', d: '' },
      { g: 'Besoins' }, { k: 'etablissement', l: 'Établissement', t: 's', o: Object.entries(ETAB_SENSIBLES), d: '' },
      { k: 'besoins', l: 'Besoins (ratio et jours vides : valeurs indicatives de l\'usage)', t: 'lignes', d: [],
        colonnes: [{ k: 'usage', l: 'Usage', t: 's', o: Object.entries(BESOINS).map(([k, x]) => [k, x[0]]) }, { k: 'nom', l: 'Désignation', t: 't' }, { k: 'q', l: 'Quantité (WC, m², véhicules…)' },
          { k: 'ratio', l: 'Ratio (L par unité et par jour d\'usage)' }, { k: 'jours', l: 'Jours d\'usage par an' }] },
      { g: 'Cuve' }, { k: 'methode', l: 'Méthode de dimensionnement', t: 's', o: [['jours', 'Nombre de jours d\'autonomie'], ['mensuel', 'Bilan mensuel simple']], d: 'jours' },
      { k: 'jours', l: 'Jours d\'autonomie', u: 'j', d: 21, si: e => e.methode !== 'mensuel' }, { k: 'seuilCouv', l: 'Part de la couverture maximale à atteindre', u: '%', d: 95, si: e => e.methode === 'mensuel' },
      { k: 'Vimpose', l: 'Volume de cuve imposé (vide : calculé)', u: 'L', d: '' },
      { g: 'Pompe' }, { k: 'Qp', l: 'Débit de la pompe', u: 'm³/h', d: 2 }, { k: 'Hp', l: 'Hauteur manométrique', u: 'mCE', d: 35 }, { k: 'rendPompe', l: 'Rendement de la pompe', u: '%', d: 40 },
      { k: 'Pel', l: 'Puissance électrique (fiche ; vide : calculée)', u: 'kW', d: '' }],
    calcul: calculerREP,
    // Surface et nature reprises d'un calcul d'eaux pluviales ; WC, urinoirs, lave-linge du calcul sanitaire ; établissement sensible
    lier(ctx) {
      const ep = notesDe(ctx, 'eauxPluviales')[0];
      if (ep) {
        const v = ctx.calculer(ep).valeurs || {}, t = v.toitures || [];
        if (t.length) {
          const par = {}; t.forEach(x => { par[x.nature] = (par[x.nature] || 0) + x.S; });
          const dom = Object.entries(par).sort((a, b) => b[1] - a[1])[0];
          ctx.proposer({ S: Math.round(v.Stot), nature: dom && dom[0] }, ctx.libelle(ep));
        }
      }
      const san = notesDe(ctx, 'sanitaire')[0];
      if (san) {
        const pts = (ctx.resoudre(san).points || []).filter(p => p && p.type), nb = ty => pts.filter(p => ty.includes(p.type)).length;
        const l = [['wc', ['wc', 'wcRobinet'], 'WC (repris du calcul sanitaire)'], ['urinoir', ['urinoir'], 'Urinoirs (repris du calcul sanitaire)'], ['lavelinge', ['lavelinge'], 'Lave-linge (repris du calcul sanitaire)']]
          .map(([u, ty, nom]) => ({ usage: u, nom, q: nb(ty), ratio: '', jours: '' })).filter(x => x.q > 0);
        if (l.length) ctx.proposer({ besoins: l }, `${ctx.libelle(san)} (points de puisage)`);
      }
      const tb = ctx.etude && ctx.etude.typeBatiment;
      if (['ehpad', 'creche'].includes(tb)) ctx.proposer({ etablissement: 'sensible' }, 'type de bâtiment de l\'étude');
      if (tb === 'enseignement') ctx.alertes.push(alerte('attention', 'Enseignement : usage intérieur de l\'eau de pluie interdit en école maternelle et élémentaire (arrêté du 21/08/2008) — préciser l\'établissement.'));
    },
    versElec: v => (v && v.Ba > 0 ? [{ rep: 'P-EDP', designation: `Pompe de distribution d'eau de pluie (${nf(v.Qp, 1)} m³/h, ${nf(v.Hp, 0)} mCE)`, type: 'pompe', P: Math.round(v.Pel * 100) / 100, tension: v.Pel > 2.2 ? 'tri' : 'mono', regulation: 'tor' }] : []),
  };

  /* =====================================================================================================================
     21. Anti-légionelle et bouclage d'ECS (arrêtés du 30/11/2005 et du 01/02/2010, circulaire du 21/12/2010)
     ===================================================================================================================== */
  const ETABS = { '': 'Non soumis à la surveillance (à préciser)', erp: 'ERP avec ECS collective (hébergement, hôtels, campings, établissements sportifs…)', sante: 'Établissement de santé (patients à haut risque)' };
  // Volume intérieur d'une conduite (L)
  const volume = (di, L) => Math.PI * (di / 2000) ** 2 * L * 1000;

  function calculerLeg(e) {
    const alertes = [], C = Ca(), D = Dn();
    const Tprod = ou(e.Tprod, 60), Tdep = ou(e.Tdep, 60), Tret = ou(e.Tret, 55), Ta = ou(e.Tamb, 20), Vst = ou(e.Vstock, 500);
    const iso = D.ISOLANTS[e.isolant] ? e.isolant : 'elastomere', eps = (D.REVETEMENTS[e.revetement] || ['', 0.9])[1], Tm = (Tdep + Tret) / 2;
    const TstR = vReg('legionelle.Tstock', 55), VstR = vReg('legionelle.Vstock', 400), TretR = vReg('legionelle.Tret', 50), VantR = vReg('legionelle.Vant', 3);
    const fl = C.liquide('eau', Tm), dT = Tdep - Tret;
    // Pertes thermiques de la boucle (aller et retour) : tube nu et isolé (même méthode que la note « isolation »)
    const lignes = (e.boucle || []).filter(l => l && (l.rep || num(l.L) > 0)).map((l, i) => {
      const de = num(l.de), di = ou(l.di, Math.max(0, de - 2)), L = num(l.L), ep = ou(l.ep, ou(e.epDefaut, 19));
      const nu = de > 0 ? C.isolation({ De: de / 1000, e: 0, Tf: Tm, Ta, isolant: iso, emissivite: 0.9 }) : { q: 0 };
      const is = de > 0 && ep > 0 ? C.isolation({ De: de / 1000, e: ep / 1000, Tf: Tm, Ta, isolant: iso, emissivite: eps }) : nu;
      if (!(de > 0)) alertes.push(alerte('attention', `${l.rep || `Ligne ${i + 1}`} : diamètre extérieur à saisir.`));
      return { rep: l.rep || `B${i + 1}`, sens: l.sens === 'retour' ? 'retour' : 'aller', de, di, L, ep, qNu: nu.q, q: is.q, P: is.q * L, V: volume(di, L) };
    });
    const forfait = !lignes.length, Pboucle = forfait ? ou(e.qForfait, 10) * ou(e.Lforfait, 100) : lignes.reduce((a, l) => a + l.P, 0);
    if (forfait) alertes.push(alerte('attention', `Pertes de la boucle forfaitaires (${nf(ou(e.Lforfait, 100), 0)} m à ${nf(ou(e.qForfait, 10), 1)} W/m) : saisir les tronçons de boucle ou relier le calcul sanitaire.`));
    const nus = lignes.filter(l => l.ep <= 0 && l.L > 0 && l.de > 0);
    if (nus.length) alertes.push(alerte('attention', `${nus.map(l => l.rep).join(', ')} : boucle non calorifugée (${nf(nus.reduce((a, l) => a + l.qNu * l.L, 0), 0)} W perdus) : calorifuger.`));
    // Débit de bouclage : pertes / (ρ · cp · ΔT) ; débit minimal pour garder 50 °C au retour
    const Qb = dT > 0 ? Pboucle / (fl.rho * fl.cp * dT) * 3600 : NaN, Qmin50 = Tdep > TretR ? Pboucle / (fl.rho * fl.cp * (Tdep - TretR)) * 3600 : NaN; // m³/h
    if (!(dT > 0)) alertes.push(alerte('erreur', 'Chute de température de la boucle nulle ou négative : le retour doit être plus froid que le départ.'));
    // Températures réglementaires
    if (Vst >= VstR && Tprod < TstR) alertes.push(alerte('erreur', `Stockage de ${nf(Vst, 0)} L (≥ ${nf(VstR, 0)} L) : eau à ${nf(Tprod, 0)} °C en sortie de production, au moins ${nf(TstR, 0)} °C en permanence (ou montée quotidienne à 60 °C pendant 1 h, arrêté du 30/11/2005).`));
    else if (Tprod < TstR) alertes.push(alerte('attention', `Production à ${nf(Tprod, 0)} °C : ${nf(TstR, 0)} °C au moins conseillés (stockage < ${nf(VstR, 0)} L).`));
    if (Tdep < TstR) alertes.push(alerte('attention', `Départ de boucle à ${nf(Tdep, 0)} °C : ${nf(TstR, 0)} °C au moins conseillés pour garder ${nf(TretR, 0)} °C en tout point.`));
    if (Tret < TretR) alertes.push(alerte('erreur', `Retour de boucle à ${nf(Tret, 0)} °C : au moins ${nf(TretR, 0)} °C en tout point du réseau bouclé (arrêté du 30/11/2005).`));
    else alertes.push(alerte('ok', `Boucle ${nf(Tdep, 0)} / ${nf(Tret, 0)} °C : ${nf(Pboucle, 0)} W de pertes, débit de bouclage ${nf(Qb * 1000, 0)} L/h (au moins ${nf(Qmin50 * 1000, 0)} L/h pour ${nf(TretR, 0)} °C au retour).`));
    if (Tdep > Tprod) alertes.push(alerte('attention', 'Départ de boucle plus chaud que la production : vérifier les températures.'));
    // Volumes hors boucle : antennes vers les points de puisage (≤ 3 L)
    const ant = (e.antennes || []).filter(a => a && (a.rep || num(a.L) > 0)).map((a, i) => { const di = num(a.di), L = num(a.L); return { rep: a.rep || `A${i + 1}`, di, L, V: volume(di, L) }; });
    const trop = ant.filter(a => a.V > VantR);
    trop.forEach(a => alertes.push(alerte('erreur', `${a.rep} : ${nf(a.V, 2)} L entre la boucle et le point de puisage (> ${nf(VantR, 1)} L, arrêté du 30/11/2005) : boucler l'antenne, la raccourcir ou réduire son diamètre.`)));
    if (ant.length && !trop.length) alertes.push(alerte('ok', `${ant.length} antenne(s) hors boucle, toutes ≤ ${nf(VantR, 1)} L (la plus grande : ${nf(Math.max(...ant.map(a => a.V)), 2)} L).`));
    // Pompe de bouclage
    const H = ou(e.Hpompe, 3), etaP = ou(e.rendPompe, 25) / 100, Pel = Number.isFinite(Qb) ? Math.max(15, fl.rho * 9.81 * Qb / 3600 * H / Math.max(0.05, etaP)) : 15;
    // Choc thermique curatif : énergie pour porter le stockage et le réseau de la température de départ à Tchoc
    const Tchoc = ou(e.Tchoc, 70), tChoc = ou(e.dureeChoc, 30), Vres = lignes.reduce((a, l) => a + l.V, 0) + ant.reduce((a, x) => a + x.V, 0);
    const Pchoc = forfait ? Pboucle * (Tchoc - Ta) / Math.max(1, Tm - Ta) : lignes.reduce((a, l) => a + l.q * l.L * (Tchoc - Ta) / Math.max(1, Tm - Ta), 0);
    const Echoc = (Vst + Vres) * fl.cp * Math.max(0, Tchoc - Tdep) / 3.6e6 + Pchoc * tChoc / 60 / 1000; // kWh (ρ ≈ 1 kg/L)
    if (Tprod < Tchoc && e.chocPossible === 'non') alertes.push(alerte('attention', `Production incapable de monter à ${nf(Tchoc, 0)} °C : choc thermique curatif impossible, prévoir un traitement chimique ou un appoint.`));
    // Surveillance (arrêté du 01/02/2010) : points de prélèvement indicatifs
    const etab = ETABS[e.etablissement] ? e.etablissement : '', nB = Math.max(0, Math.round(ou(e.nBallons, 1))), nBo = Math.max(1, Math.round(ou(e.nBoucles, 1))), nP = Math.max(0, Math.round(ou(e.nPoints, 20)));
    const nUsage = Math.max(1, Math.ceil(nP / Math.max(1, ou(e.ratioPoints, 50))));
    const prel = [['Sortie de la production d\'ECS (ou point le plus proche)', 1], ['Fond de ballon (le cas échéant)', nB], ['Retour de boucle (ou point le plus proche)', nBo], ['Points d\'usage à risque les plus représentatifs ou les plus éloignés', nUsage]];
    const nPrel = prel.reduce((a, x) => a + x[1], 0);
    if (etab) alertes.push(alerte('attention', `Surveillance des légionelles (arrêté du 01/02/2010) : ${nPrel} points de prélèvement indicatifs par campagne, analyses au moins annuelles par un laboratoire accrédité, températures relevées mensuellement en sortie de production et au retour de boucle.`));
    const R = VR(), mq = r => (R ? R.marquer(r, ['legionelle.Tstock', 'legionelle.Vstock', 'legionelle.Tret', 'legionelle.Vant']) : r);
    return mq({
      valeurs: { Tprod, Tdep, Tret, Pboucle, Qb, Qmin50, H, Pel, Vres, Echoc, nPrel, antennesHors: trop.length, lignes: lignes.length },
      resume: [['Températures', `production ${nf(Tprod, 0)} °C · départ ${nf(Tdep, 0)} °C · retour ${nf(Tret, 0)} °C`], ['Pertes thermiques de la boucle', `${nf(Pboucle, 0)} W${forfait ? ' (forfait)' : ` sur ${nf(lignes.reduce((a, l) => a + l.L, 0), 0)} m`}`],
        ['Débit de bouclage', `${nf(Qb * 1000, 0)} L/h (ΔT ${nf(dT, 1)} K) · minimum pour 50 °C au retour : ${nf(Qmin50 * 1000, 0)} L/h`], ['Pompe de bouclage', `${nf(Qb, 3)} m³/h sous ${nf(H, 1)} mCE · ≈ ${nf(Pel, 0)} W`],
        ['Antennes hors boucle', ant.length ? `${ant.length} antenne(s), ${trop.length} au-delà de 3 L` : 'non saisies'], ['Volume d\'eau du réseau bouclé', `${nf(Vres, 0)} L (+ stockage ${nf(Vst, 0)} L)`],
        ['Choc thermique curatif', `${nf(Tchoc, 0)} °C pendant ${nf(tChoc, 0)} min en tout point · ≈ ${nf(Echoc, 1)} kWh`], ['Points de prélèvement (indicatif)', etab ? `${nPrel} par campagne` : 'établissement non soumis (à préciser)']],
      tableaux: [...(lignes.length ? [{ titre: 'Boucle : pertes thermiques (tube nu et calorifugé)', entetes: ['Tronçon', 'Sens', 'De (mm)', 'Di (mm)', 'L (m)', 'Isolant (mm)', 'q nu (W/m)', 'q isolé (W/m)', 'Pertes (W)', 'Volume (L)', 'v au débit de bouclage (m/s)'],
        lignes: lignes.map(l => [l.rep, l.sens, nf(l.de, 1), nf(l.di, 1), nf(l.L, 1), nf(l.ep, 0), nf(l.qNu, 1), nf(l.q, 1), nf(l.P, 0), nf(l.V, 1), l.di > 0 && Number.isFinite(Qb) ? nf(Qb / 3600 / (Math.PI * (l.di / 2000) ** 2), 2) : '—']) }] : []),
        ...(ant.length ? [{ titre: 'Antennes hors boucle (volume entre la boucle et le point de puisage)', entetes: ['Antenne', 'Di (mm)', 'L (m)', 'Volume (L)', '≤ 3 L'], lignes: ant.map(a => [a.rep, nf(a.di, 1), nf(a.L, 1), nf(a.V, 2), a.V > VantR ? 'non' : 'oui']) }] : []),
        { titre: 'Points de prélèvement (arrêté du 01/02/2010, nombre indicatif)', entetes: ['Point', 'Nombre'], lignes: [...prel.map(([l, n]) => [l, String(n)]), ['Total par campagne', String(nPrel)]], total: true }],
      onglets: [{ titre: 'Réglementation', blocs: [{ titre: 'Températures et surveillance', items: [
        { niveau: 'obligatoire', texte: 'Stockage ≥ 400 L : eau ≥ 55 °C en permanence en sortie de production, ou portée au moins une fois par 24 h à 70 °C pendant 2 min, 65 °C pendant 4 min ou 60 °C pendant 60 min.', ref: 'Arrêté du 30/11/2005, art. 2' },
        { niveau: 'obligatoire', texte: 'Volume entre la production et le point de puisage le plus éloigné > 3 L : ≥ 50 °C en tout point du réseau, sauf les tubes finaux d\'alimentation des points de puisage (≤ 3 L).', ref: 'Arrêté du 30/11/2005, art. 2' },
        { niveau: 'obligatoire', texte: 'Pièces destinées à la toilette : 50 °C au plus aux points de puisage (60 °C dans les autres pièces, 90 °C en cuisine et buanderie d\'ERP avec signalisation).', ref: 'Arrêté du 30/11/2005, art. 1' },
        { niveau: 'obligatoire', texte: 'ERP soumis : fichier sanitaire, températures relevées au moins une fois par mois en sortie de production et au retour de boucle, campagne d\'analyses de légionelles au moins annuelle (laboratoire accrédité).', ref: 'Arrêté du 01/02/2010, art. 2 et 3' },
        { niveau: 'obligatoire', texte: 'Seuil d\'action : 1 000 UFC/L de Legionella pneumophila aux points d\'usage à risque ; établissements de santé, patients à haut risque : sous le seuil de détection.', ref: 'Arrêté du 01/02/2010, art. 4 ; circulaire du 21/12/2010' },
        { niveau: 'conseil', texte: `Choc thermique curatif : ${nf(Tchoc, 0)} °C pendant ${nf(tChoc, 0)} min à chaque point de puisage (après information des usagers, risque de brûlure), à défaut traitement chimique.`, ref: 'Guides techniques (CSTB, circulaire DGS 2002/243)' },
        { niveau: 'conseil', texte: 'Vannes thermostatiques d\'équilibrage sur chaque boucle, thermomètres au départ et au retour, purges en points bas, suppression des bras morts.', ref: 'NF DTU 60.11, guide CSTB' }] }] }],
      alertes,
      hypotheses: [`Pertes de la boucle à la température moyenne ${nf(Tm, 1)} °C, ambiance ${nf(Ta, 0)} °C : conduction radiale dans l'isolant (${D.ISOLANTS[iso].libelle}) et échanges extérieurs par convection naturelle et rayonnement (même méthode que la note « Isolation des tuyauteries ») ; épaisseur non saisie : ${nf(ou(e.epDefaut, 19), 0)} mm (indicatif).`,
        'Débit de bouclage Qb = P / (ρ · cp · ΔT), ΔT = départ − retour ; débit minimal = P / (ρ · cp · (départ − 50 °C)). Le réglage des boucles se fait par vannes thermostatiques.',
        `Pompe de bouclage : P = ρ · g · Q · H / η (η = ${nf(etaP * 100, 0)} %), 15 W minimum ; H repris du calcul sanitaire ou saisi.`,
        'Volume d\'une antenne : π · Di² / 4 · L ; limite de 3 L de l\'arrêté du 30/11/2005.',
        'Énergie du choc thermique : échauffement du stockage et du réseau de la température de départ à la température de choc, plus les pertes du réseau pendant la durée du choc.',
        `Points de prélèvement : sortie de production, fonds de ballon, retours de boucle et un point d'usage pour ${nf(ou(e.ratioPoints, 50), 0)} points de puisage (nombre indicatif, à adapter à la stratégie d'échantillonnage du fichier sanitaire).`],
      synthese: `${nf(Tdep, 0)}/${nf(Tret, 0)} °C · ${nf(Pboucle, 0)} W · ${nf(Qb * 1000, 0)} L/h${trop.length ? ` · ${trop.length} antenne(s) > 3 L` : ''}`,
    });
  }

  N.TYPES.legionelle = {
    titre: 'Anti-légionelle et bouclage d\'ECS', icone: '🦠', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Températures réglementaires, pertes thermiques et débit de la boucle, volumes hors boucle (3 L), choc thermique, points de prélèvement et pompe de bouclage (arrêtés du 30/11/2005 et du 01/02/2010).',
    champs: [{ g: 'Établissement' }, { k: 'etablissement', l: 'Surveillance des légionelles (arrêté du 01/02/2010)', t: 's', o: Object.entries(ETABS), d: '' },
      { g: 'Températures' }, { k: 'Tprod', l: 'Température en sortie de production (vide : reprise de l\'ECS / du sanitaire)', u: '°C', d: '' },
      { k: 'Vstock', l: 'Volume de stockage d\'ECS (vide : repris de la production d\'ECS)', u: 'L', d: '' },
      { k: 'Tdep', l: 'Départ de boucle (vide : repris du sanitaire)', u: '°C', d: '' }, { k: 'Tret', l: 'Retour de boucle (vide : repris du sanitaire)', u: '°C', d: '' },
      { k: 'Tamb', l: 'Température ambiante des locaux traversés', u: '°C', d: 20 },
      { g: 'Boucle' }, { k: 'isolant', l: 'Isolant de la boucle', t: 's', o: () => Object.entries(Dn().ISOLANTS).map(([k, i]) => [k, i.libelle]), d: 'elastomere' },
      { k: 'revetement', l: 'Surface extérieure', t: 's', o: () => Object.entries(Dn().REVETEMENTS).map(([k, [l]]) => [k, l]), d: 'pvc' },
      { k: 'boucle', l: 'Tronçons de la boucle (aller et retour)', t: 'lignes', d: [],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'sens', l: 'Sens', t: 's', o: [['aller', 'Aller'], ['retour', 'Retour']] }, { k: 'de', l: 'Ø extérieur (mm)' }, { k: 'di', l: 'Ø intérieur (mm)' },
          { k: 'L', l: 'Longueur (m)' }, { k: 'ep', l: 'Épaisseur d\'isolant (mm ; vide : par défaut, 0 = nu)' }] },
      { k: 'epDefaut', l: 'Épaisseur d\'isolant par défaut des tronçons (indicatif)', u: 'mm', d: 19 },
      { k: 'Lforfait', l: 'Sans tronçons : longueur de boucle forfaitaire', u: 'm', d: 100, si: e => !(e.boucle || []).length }, { k: 'qForfait', l: 'Sans tronçons : pertes linéiques forfaitaires', u: 'W/m', d: 10, si: e => !(e.boucle || []).length },
      { k: 'antennes', l: 'Antennes hors boucle vers les points de puisage', t: 'lignes', d: [],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'di', l: 'Ø intérieur (mm)' }, { k: 'L', l: 'Longueur (m)' }] },
      { g: 'Pompe de bouclage' }, { k: 'Hpompe', l: 'Hauteur manométrique (vide : reprise du sanitaire)', u: 'mCE', d: '' }, { k: 'rendPompe', l: 'Rendement du circulateur', u: '%', d: 25 },
      { g: 'Choc thermique et surveillance' }, { k: 'Tchoc', l: 'Température de choc thermique', u: '°C', d: 70 }, { k: 'dureeChoc', l: 'Durée du choc', u: 'min', d: 30 },
      { k: 'chocPossible', l: 'Production capable du choc thermique', t: 's', o: [['oui', 'Oui'], ['non', 'Non']], d: 'oui' },
      { k: 'nPoints', l: 'Points de puisage d\'ECS (vide : repris du sanitaire)', d: '' }, { k: 'nBallons', l: 'Ballons de stockage', d: 1 }, { k: 'nBoucles', l: 'Boucles (vide : reprises du sanitaire)', d: '' },
      { k: 'ratioPoints', l: 'Un point d\'usage prélevé pour (indicatif)', u: 'points de puisage', d: 50 }],
    calcul: calculerLeg,
    // Températures, boucle et antennes reprises du calcul sanitaire ; stockage et production de l'ECS ; établissement
    lier(ctx) {
      const san = notesDe(ctx, 'sanitaire')[0];
      const ecs = (san && (ctx.notes || []).find(n => n.type === 'ecs' && n.id === (ctx.resoudre(san).production || ''))) || notesDe(ctx, 'ecs')[0];
      if (ecs) {
        const ee = ctx.resoudre(ecs), v = ctx.calculer(ecs).valeurs || {};
        ctx.proposer({ Tprod: num(ee.Tc, NaN), Vstock: Number.isFinite(v.choisi) ? v.choisi : NaN }, ctx.libelle(ecs));
      }
      if (san) {
        const es = ctx.resoudre(san), r = ctx.calculer(san), v = r.valeurs || {}, B = v.bouclage, src = ctx.libelle(san), C = Ca();
        ctx.proposer({ Tprod: num(es.Tstock, NaN), nPoints: (es.points || []).filter(p => p && p.type && (Sanit().APPAREILS[p.type] || [])[2] > 0).length || NaN }, src);
        if (es.bouclage !== 'non') ctx.proposer({ Tdep: num(es.TdepB, NaN), Tret: num(es.TretB, NaN) }, src);
        const serie = v.serie || es.serie || 'cuivre-1057', tube = cle => (cle ? C.tube(serie, cle) : null), tr = v.troncons || [];
        if (B) {
          const boucle = tr.filter(t => t.boucle && tube(t.ecs)).map(t => { const u = tube(t.ecs); return { rep: t.rep, sens: 'aller', de: u.de, di: u.di, L: t.L, ep: '' }; });
          if (B.tR) boucle.push({ rep: 'Retour de boucle', sens: 'retour', de: B.tR.de, di: B.tR.di, L: Math.round(B.Lret * 10) / 10, ep: '' });
          if (boucle.length) ctx.proposer({ boucle, Hpompe: Math.round(B.H * 100) / 100, nBoucles: (B.vannes || []).length || 1 }, src);
        }
        const ant = tr.filter(t => !t.boucle && tube(t.ecs)).map(t => ({ rep: t.rep, di: tube(t.ecs).di, L: t.L }));
        if (ant.length && es.bouclage !== 'non') ctx.proposer({ antennes: ant }, src);
      }
      const tb = ctx.etude && ctx.etude.typeBatiment;
      if (tb === 'ehpad') ctx.proposer({ etablissement: 'sante' }, 'type de bâtiment de l\'étude');
      else if (['hotel', 'gymnase'].includes(tb)) ctx.proposer({ etablissement: 'erp' }, 'type de bâtiment de l\'étude');
    },
    versElec: v => (v && Number.isFinite(v.Qb) && v.Qb > 0 ? [{ rep: 'PB-ECS', designation: `Pompe de bouclage d'ECS (${nf(v.Qb * 1000, 0)} L/h, ${nf(v.H, 1)} mCE)`, type: 'pompe', P: Math.round(Math.max(0.015, v.Pel / 1000) * 1000) / 1000, tension: 'mono', regulation: 'tor' }] : []),
  };
  const Sanit = () => (typeof Sanitaire !== 'undefined' ? Sanitaire : require('./sanitaire'));

  return { INTENSITES, NATURES, PLUVIO, BESOINS, CUVES, ETABS, capaciteDescente, capaciteGouttiere, sectionGouttiere, bilanMensuel, volume, calculerEP, calculerREP, calculerLeg };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = AnnexesPlomberie;
