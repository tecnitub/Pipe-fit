// Schéma de principe hydraulique (P&ID) d'un réseau d'eau chaude ou d'eau glacée : production (un générateur ou une cascade),
// bouteille de découplage ou non, collecteurs, circuits de distribution vers les émetteurs. Le calcul dimensionne débits,
// diamètres, pompes, vannes, bouteille et collecteurs, et dessine le schéma en SVG (affiché, joint à la note de calcul PDF).
const Schema = ((D, C, N) => {
  const { nf, num } = N;
  const alerte = (niveau, texte) => ({ niveau, texte });
  const xe = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- Données ---------- */
  // Régimes de température [libellé, départ, retour]
  const REGIMES = {
    'ch-80-60': ['Eau chaude 80/60 °C', 80, 60], 'ch-70-50': ['Eau chaude 70/50 °C', 70, 50], 'ch-55-45': ['Eau chaude 55/45 °C (condensation, PAC haute température)', 55, 45],
    'ch-45-35': ['Eau chaude 45/35 °C (PAC)', 45, 35], 'ch-35-30': ['Eau chaude 35/30 °C (plancher chauffant)', 35, 30],
    'eg-7-12': ['Eau glacée 7/12 °C', 7, 12], 'eg-6-12': ['Eau glacée 6/12 °C', 6, 12], 'eg-10-15': ['Eau glacée 10/15 °C (froid sensible)', 10, 15],
    'eg-14-17': ['Eau froide 14/17 °C (plafonds et poutres froides)', 14, 17], perso: ['Autre régime (températures saisies)'],
  };
  // Générateurs [libellé, usage : chaud, froid ou les deux]
  const GENERATEURS = {
    'chaudiere-cond': ['Chaudière gaz à condensation', 'chaud'], 'chaudiere-gaz': ['Chaudière gaz basse température', 'chaud'], 'chaudiere-fioul': ['Chaudière fioul', 'chaud'],
    'chaudiere-bois': ['Chaudière bois / biomasse', 'chaud'], 'pac-air': ['Pompe à chaleur air/eau', 'chaud'], 'pac-eau': ['Pompe à chaleur eau/eau', 'chaud'],
    'pac-rev': ['PAC réversible air/eau', 'mixte'], 'gf-air': ['Groupe froid air/eau', 'froid'], 'gf-eau': ['Groupe froid eau/eau (tour, aéroréfrigérant)', 'froid'],
    echangeur: ['Échangeur (sous-station, réseau de chaleur ou de froid)', 'mixte'], 'echangeur-vapeur': ['Échangeur vapeur / eau', 'chaud'],
  };
  // Émetteurs et utilisateurs [libellé, perte de charge usuelle kPa, usage]
  const EMETTEURS = {
    radiateurs: ['Radiateurs', 10, 'chaud'], plancher: ['Plancher chauffant', 25, 'chaud'], cta: ['Batterie de CTA', 20, 'mixte'], ventilo: ['Ventilo-convecteurs', 30, 'mixte'],
    aerotherme: ['Aérothermes', 15, 'chaud'], radiant: ['Panneaux rayonnants', 15, 'chaud'], plafond: ['Plafonds / poutres froides', 25, 'froid'],
    ecs: ['Production d\'ECS (ballon, échangeur)', 20, 'chaud'], process: ['Process (échangeur, machine)', 30, 'mixte'], sousstation: ['Départ réseau / sous-station', 20, 'mixte'],
  };
  const REGULATIONS = { '3v': 'Vanne 3 voies mélangeuse', '2v': 'Vanne 2 voies (débit variable)', direct: 'Sans vanne (départ direct)' };

  /* ---------- Calcul ---------- */
  const regimeCircuit = txt => { const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*\/\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(String(txt || '')); return m ? [num(m[1]), num(m[2])] : null; };
  function dimensionner(e) {
    const r = REGIMES[e.reseau] || REGIMES['ch-70-50'], Td = e.reseau === 'perso' ? num(e.Tdep, 70) : r[1], Tr = e.reseau === 'perso' ? num(e.Tret, 50) : r[2];
    const chaud = Td > Tr, dT = Math.abs(Td - Tr), f = C.liquide(e.fluide || 'eau', (Td + Tr) / 2), s = D.SERIES[e.serie] || D.SERIES['acier-10216'];
    const vmax = num(e.vmax, 1.5), Rmax = num(e.Rmax, 150), tubes = C.tubes(e.serie || 'acier-10216'), alertes = [];
    const debit = (P, ecart) => (ecart > 0 ? P * 1000 / (f.rho * f.cp * ecart) * 3600 : 0); // m³/h
    const choisir = (Q, v = vmax) => tubes.find(t => { const x = C.ecoulement(Q / 3600, t.di / 1000, f.rho, f.mu, s.rugosite); return x.v <= v && x.R <= Rmax; }) || tubes[tubes.length - 1];
    const ecoul = (Q, t) => C.ecoulement(Q / 3600, t.di / 1000, f.rho, f.mu, s.rugosite);
    if (dT <= 0) alertes.push(alerte('erreur', 'Les températures de départ et de retour doivent être différentes.'));

    // Circuits de distribution
    const circuits = (e.circuits || []).map((c, i) => {
      const em = EMETTEURS[c.emetteur] || EMETTEURS.radiateurs, reg = REGULATIONS[c.regulation] ? c.regulation : '3v';
      const rc = regimeCircuit(c.regime) || [Td, Tr], dTc = Math.abs(rc[0] - rc[1]), P = num(c.P), rep = c.rep || `C${i + 1}`;
      const Q = debit(P, dTc), t = choisir(Q), x = ecoul(Q, t);
      // Débit appelé sur le collecteur : un circuit mélangé reprend l'écart entre le départ du réseau et son propre retour
      const Qcoll = reg === '3v' ? debit(P, Math.abs(Td - rc[1])) : Q;
      const dpEm = em[1], dpV = reg === 'direct' ? 0 : Math.max(dpEm, 10), dpL = x.R * num(c.L) * 1.3 / 1000;
      const hmt = (dpL + dpEm + dpV + 5) * 1000 / (f.rho * C.G), kvs = reg === 'direct' ? null : D.KVS.find(k => k >= C.kv(Q, dpV, f.rho) * 0.97) || null;
      const different = Math.abs(rc[0] - Td) > 0.5 || Math.abs(rc[1] - Tr) > 0.5;
      if (different && reg !== '3v') alertes.push(alerte('attention', `${rep} : régime ${rc[0]}/${rc[1]} °C différent du réseau sans vanne 3 voies de mélange.`));
      if (reg === '3v' && (chaud ? rc[0] > Td : rc[0] < Td)) alertes.push(alerte('erreur', `${rep} : départ du circuit (${rc[0]} °C) ${chaud ? 'plus chaud' : 'plus froid'} que le départ du réseau (${Td} °C).`));
      if (em[2] !== 'mixte' && em[2] !== (chaud ? 'chaud' : 'froid')) alertes.push(alerte('attention', `${rep} : ${em[0].toLowerCase()} sur un réseau d'${chaud ? 'eau chaude' : 'eau glacée'}.`));
      return { rep, em, emetteur: c.emetteur, reg, rc, P, Q, Qcoll, t, v: x.v, hmt, kvs, dpV, L: num(c.L) };
    });
    // Production
    const n = Math.max(1, Math.min(6, Math.round(num(e.nGen, 1)))), Pg = num(e.Pgen), Pprod = n * Pg, gen = GENERATEURS[e.generateur] || GENERATEURS['chaudiere-cond'];
    const Qg = debit(Pg, dT), tg = choisir(Qg), Qp = n * Qg;
    const Pdem = circuits.reduce((a, c) => a + c.P, 0) * num(e.foisonnement, 100) / 100, Qs = circuits.reduce((a, c) => a + c.Qcoll, 0);
    const bouteille = e.bouteille === 'oui', pompesInd = n === 1 || e.pompesPrim !== 'commune';
    const Qcoll = Math.max(bouteille ? Qs : Math.max(Qs, Qp), 0.01), tc = choisir(Qcoll, Math.min(vmax, 1.0));
    // Bouteille de découplage : vitesse verticale ≤ 0,2 m/s et diamètre ≥ 3 fois le plus gros piquage
    let tb = null, Db = 0;
    if (bouteille) {
      const Qmax = Math.max(Qp, Qs) / 3600, Dv = Math.sqrt(4 * Qmax / (Math.PI * 0.2)) * 1000, d3 = 3 * Math.max(tc.dn, tg.dn);
      Db = Math.max(Dv, d3); tb = C.tubes('acier-10216').find(t => t.di >= Db) || null;
    }
    // Contrôles
    if (gen[1] !== 'mixte' && gen[1] !== (chaud ? 'chaud' : 'froid')) alertes.push(alerte('erreur', `${gen[0]} incompatible avec un réseau d'${chaud ? 'eau chaude' : 'eau glacée'}.`));
    if (!circuits.length) alertes.push(alerte('erreur', 'Ajouter au moins un circuit de distribution.'));
    if (Pprod < Pdem * 0.999) alertes.push(alerte('erreur', `Production insuffisante : ${nf(Pprod, 0)} kW installés pour ${nf(Pdem, 0)} kW appelés.`));
    else if (Pdem > 0 && Pprod > 1.5 * Pdem) alertes.push(alerte('attention', `Production surdimensionnée (${nf(Pprod / Pdem * 100, 0)} % des besoins) : risque de cycles courts.`));
    if (n > 1 && Pdem > 0 && Pprod - Pg < Pdem * 0.6) alertes.push(alerte('attention', `Secours : un générateur à l'arrêt, il reste ${nf(Pprod - Pg, 0)} kW (${nf((Pprod - Pg) / Pdem * 100, 0)} % des besoins).`));
    if (bouteille && Qp < Qs) alertes.push(alerte('attention', `Débit primaire (${nf(Qp, 2)} m³/h) inférieur au débit secondaire (${nf(Qs, 2)} m³/h) : le retour se recycle dans la bouteille et ${chaud ? 'abaisse' : 'relève'} la température de départ.`));
    if (bouteille && Qp > 1.25 * Qs && /condensation|pac/i.test(gen[0] + e.generateur)) alertes.push(alerte('attention', 'Débit primaire nettement supérieur au secondaire : le départ se recycle vers le retour et dégrade la condensation ou le COP ; pompes primaires à vitesse variable conseillées.'));
    if (!bouteille && n > 1) alertes.push(alerte('attention', 'Cascade sans bouteille de découplage : pompes primaires et secondaires en série interagissent ; à réserver à des générateurs acceptant un débit variable, avec vannes d\'isolement motorisées.'));
    if (!bouteille && circuits.some(c => c.reg === '2v')) alertes.push(alerte('attention', 'Circuits à vanne 2 voies sans bouteille : prévoir une soupape différentielle ou un by-pass pour garantir le débit minimal des générateurs.'));
    if (!chaud || /pac/.test(e.generateur)) alertes.push(alerte('attention', 'Vérifier le volume d\'eau minimal exigé par le constructeur (anti-courts-cycles) : ballon tampon si le réseau est trop court.'));
    if (bouteille && chaud === false && Qp < Qs) alertes.push(alerte('attention', 'En eau glacée, un débit secondaire supérieur au primaire réchauffe le départ : prévoir des pompes secondaires à vitesse variable.'));
    return { Td, Tr, chaud, dT, f, s, n, Pg, Pprod, Pdem, gen, Qg, tg, Qp, Qs, bouteille, pompesInd, Qcoll, tc, tb, Db, circuits, alertes, regime: e.reseau === 'perso' ? `Régime ${Td}/${Tr} °C` : r[0] };
  }

  /* ---------- Volume d'eau de l'installation (pour le vase d'expansion) ---------- */
  // Contenance des émetteurs (L/kW) et des générateurs (L/kW) : ordres de grandeur, à remplacer par les données constructeur
  const CONTENANCE = { radiateurs: 10, plancher: 15, cta: 1, ventilo: 2, aerotherme: 1.5, radiant: 2, plafond: 3, ecs: 2, process: 2, sousstation: 2 };
  const CONTENANCE_GEN = g => (/^chaudiere-(fioul|bois)/.test(g) ? 1 : /^chaudiere/.test(g) ? 0.4 : /echangeur/.test(g) ? 0.1 : 0.3);
  function volumeEau(d, generateur) {
    const sec = di => Math.PI * (di / 1000) ** 2 / 4 * 1000; // L/m
    const tubes = d.circuits.reduce((a, c) => a + sec(c.t.di) * c.L, 0), emet = d.circuits.reduce((a, c) => a + (CONTENANCE[c.emetteur] || 2) * c.P, 0);
    const coll = sec(d.tc.di) * 2 * (d.circuits.length + 2), prod = d.n * d.Pg * CONTENANCE_GEN(generateur || '') + sec(d.tg.di) * d.n * 6;
    const bout = d.tb ? sec(d.tb.di) * 1.2 : 0;
    const postes = [['Tuyauteries des circuits', tubes], ['Émetteurs', emet], ['Collecteurs', coll], ['Générateurs et raccordements', prod], ...(bout ? [['Bouteille de découplage', bout]] : [])];
    return { total: postes.reduce((a, [, v]) => a + v, 0), postes };
  }

  /* ---------- Dessin ---------- */
  function dessiner(d, e) {
    const nG = d.n, nC = Math.max(d.circuits.length, 1), Y1 = 330, Y2 = 380, H = 720;
    const xG0 = 150, pasG = 150, xB = xG0 + nG * pasG + 90, xS0 = d.bouteille ? xB + 110 : xG0 + nG * pasG + 110, pasC = 175;
    const W = Math.max(xS0 + nC * pasC + 150, 900);
    const cD = d.chaud ? '#c62828' : '#1565c0', cR = d.chaud ? '#1565c0' : '#2e7d32', out = [], masques = [], dessus = [];
    const ligne = (x1, y1, x2, y2, c, ep = 3) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${ep}" stroke-linecap="round"/>`;
    const texte = (x, y, t, o = {}) => `<text x="${x}" y="${y}" font-size="${o.fs || 11}" font-family="Arial, Helvetica, sans-serif" fill="${o.c || '#222'}" text-anchor="${o.a || 'start'}"${o.b ? ' font-weight="700"' : ''}${o.rot ? ` transform="rotate(${o.rot} ${x} ${y})"` : ''}>${xe(t)}</text>`;
    const point = (x, y, c) => `<circle cx="${x}" cy="${y}" r="4" fill="${c}"/>`;
    const croisement = (x, y) => masques.push(`<rect x="${x - 5}" y="${y - 4}" width="10" height="8" fill="#fff"/>`);
    // Symboles (sur une conduite verticale en x, centrés en y)
    const vanne = (x, y) => `<path d="M${x - 7} ${y - 8} L${x + 7} ${y - 8} L${x - 7} ${y + 8} L${x + 7} ${y + 8} Z" fill="#fff" stroke="#222" stroke-width="1.4"/>`;
    const vanneH = (x, y) => `<path d="M${x - 8} ${y - 7} L${x - 8} ${y + 7} L${x + 8} ${y - 7} L${x + 8} ${y + 7} Z" fill="#fff" stroke="#222" stroke-width="1.4"/>`;
    const equilibrage = (x, y) => `${vanne(x, y)}<line x1="${x - 11}" y1="${y + 10}" x2="${x + 11}" y2="${y - 10}" stroke="#222" stroke-width="1.2"/><path d="M${x + 11} ${y - 10} l-6 1 l3 4 Z" fill="#222"/>`;
    const pompe = (x, y, haut = true) => `<circle cx="${x}" cy="${y}" r="12" fill="#fff" stroke="#222" stroke-width="1.6"/><path d="${haut ? `M${x - 8} ${y + 6} L${x} ${y - 10} L${x + 8} ${y + 6}` : `M${x - 8} ${y - 6} L${x} ${y + 10} L${x + 8} ${y - 6}`}" fill="none" stroke="#222" stroke-width="1.4"/>`;
    const pompeH = (x, y) => `<circle cx="${x}" cy="${y}" r="12" fill="#fff" stroke="#222" stroke-width="1.6"/><path d="M${x - 6} ${y - 8} L${x + 10} ${y} L${x - 6} ${y + 8}" fill="none" stroke="#222" stroke-width="1.4"/>`;
    const clapet = (x, y, haut = true) => `<path d="M${x - 7} ${haut ? y + 7 : y - 7} L${x + 7} ${haut ? y + 7 : y - 7} L${x} ${haut ? y - 6 : y + 6} Z" fill="#222"/><line x1="${x - 8}" y1="${haut ? y - 7 : y + 7}" x2="${x + 8}" y2="${haut ? y - 7 : y + 7}" stroke="#222" stroke-width="2"/>`;
    const moteur = (x, y) => `<line x1="${x}" y1="${y}" x2="${x - 18}" y2="${y}" stroke="#222" stroke-width="1.2"/><circle cx="${x - 25}" cy="${y}" r="7" fill="#fff" stroke="#222" stroke-width="1.2"/>${texte(x - 25, y + 4, 'M', { fs: 9, a: 'middle', b: true })}`;
    const vanne3v = (x, y) => `${vanne(x, y)}<path d="M${x} ${y} L${x + 14} ${y - 7} L${x + 14} ${y + 7} Z" fill="#fff" stroke="#222" stroke-width="1.4"/>${moteur(x - 7, y)}`;
    const vanne2v = (x, y) => `${vanne(x, y)}${moteur(x - 7, y)}`;
    const compteur = (x, y) => `<rect x="${x - 11}" y="${y - 9}" width="22" height="18" fill="#fff" stroke="#222" stroke-width="1.3"/>${texte(x, y + 4, 'CE', { fs: 9, a: 'middle', b: true })}`;
    const thermo = (x, y) => `<line x1="${x}" y1="${y}" x2="${x + 12}" y2="${y}" stroke="#222" stroke-width="1"/><circle cx="${x + 17}" cy="${y}" r="5" fill="#fff" stroke="#222" stroke-width="1"/>${texte(x + 17, y + 3, 'T', { fs: 7, a: 'middle' })}`;
    const fleche = (x, y, sens, c) => ({ haut: `<path d="M${x - 5} ${y + 4} L${x} ${y - 5} L${x + 5} ${y + 4} Z" fill="${c}"/>`, bas: `<path d="M${x - 5} ${y - 4} L${x} ${y + 5} L${x + 5} ${y - 4} Z" fill="${c}"/>`,
      droite: `<path d="M${x - 4} ${y - 5} L${x + 5} ${y} L${x - 4} ${y + 5} Z" fill="${c}"/>`, gauche: `<path d="M${x + 4} ${y - 5} L${x - 5} ${y} L${x + 4} ${y + 5} Z" fill="${c}"/>` }[sens]);

    out.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
    out.push(texte(20, 26, `Schéma de principe hydraulique — ${d.regime}`, { fs: 15, b: true, c: '#1F3864' }));
    out.push(texte(20, 44, `${e.titreInstallation || ''}${e.titreInstallation ? ' · ' : ''}Production ${nf(d.Pprod, 0)} kW${d.n > 1 ? ` (cascade ${d.n} × ${nf(d.Pg, 0)} kW)` : ''} · besoins ${nf(d.Pdem, 0)} kW · ${d.bouteille ? 'avec' : 'sans'} bouteille de découplage`, { fs: 11, c: '#555' }));

    // Collecteurs
    const xFinD = d.circuits.length ? xS0 + (d.circuits.length - 1) * pasC + 50 : xS0 + 50, xFinR = d.circuits.length ? xS0 + (d.circuits.length - 1) * pasC + 120 : xS0 + 120;
    if (d.bouteille) {
      out.push(ligne(xG0 + 40, Y1, xB, Y1, cD), ligne(40, Y2, xB, Y2, cR), ligne(xB + 50, Y1, xFinD, Y1, cD), ligne(xB + 50, Y2, xFinR, Y2, cR));
      out.push(`<rect x="${xB}" y="${Y1 - 60}" width="50" height="${Y2 - Y1 + 120}" rx="10" fill="#eef2f8" stroke="#222" stroke-width="1.6"/>`);
      out.push(ligne(xB + 25, Y1 - 60, xB + 25, Y1 - 75, '#222', 1.4), `<path d="M${xB + 19} ${Y1 - 75} h12 v-8 h-12 Z" fill="#fff" stroke="#222" stroke-width="1.2"/>`, texte(xB + 37, Y1 - 75, 'Purgeur', { fs: 9 }));
      out.push(ligne(xB + 25, Y2 + 60, xB + 25, Y2 + 78, '#222', 1.4), vanneH(xB + 25, Y2 + 86), texte(xB + 37, Y2 + 90, 'Vidange', { fs: 9 }));
      out.push(texte(xB + 25, Y2 + 115, 'Bouteille de', { fs: 10, a: 'middle', b: true }), texte(xB + 25, Y2 + 128, 'découplage', { fs: 10, a: 'middle', b: true }),
        texte(xB + 25, Y2 + 141, d.tb ? d.tb.nom.replace(/ \(.*/, '') : `Ø ${nf(d.Db, 0)} mm`, { fs: 9.5, a: 'middle' }));
    } else {
      out.push(ligne(xG0 + 40, Y1, xFinD, Y1, cD), ligne(40, Y2, xFinR, Y2, cR));
    }
    out.push(texte(xFinR + 14, Y1 + 4, 'Collecteur départ', { fs: 9.5, c: cD, b: true }), texte(xFinR + 14, Y1 + 16, d.tc.nom.replace(/ \(.*/, ''), { fs: 9, c: cD }),
      texte(xFinR + 14, Y2 + 4, 'Collecteur retour', { fs: 9.5, c: cR, b: true }));
    out.push(fleche(xS0 - 30, Y1, 'droite', cD), fleche(xS0 - 30, Y2, 'gauche', cR));

    out.push(`<circle cx="30" cy="72" r="10" fill="#fff" stroke="#222" stroke-width="1.3"/>`, texte(30, 76, 'TE', { fs: 8, a: 'middle', b: true }), texte(46, 76, 'Sonde extérieure', { fs: 9 }));
    // Générateurs
    const yGen = 560;
    for (let i = 0; i < nG; i++) {
      const x = xG0 + i * pasG, xd = x + 40, xr = x + 100;
      out.push(`<rect x="${x + 10}" y="${yGen}" width="120" height="70" rx="6" fill="${d.chaud ? '#fdecea' : '#e3f0ff'}" stroke="#222" stroke-width="1.6"/>`);
      const lib = d.gen[0].split(/ (?=[a-z(])/);
      out.push(texte(x + 70, yGen + 18, `${d.chaud ? 'G' : 'GF'}${i + 1}`, { fs: 11, a: 'middle', b: true }), texte(x + 70, yGen + 33, lib[0], { fs: 9, a: 'middle' }),
        texte(x + 70, yGen + 45, lib.slice(1).join(' ').slice(0, 26), { fs: 9, a: 'middle' }), texte(x + 70, yGen + 61, `${nf(d.Pg, 0)} kW · ${nf(d.Qg, 2)} m³/h`, { fs: 9.5, a: 'middle', b: true }));
      out.push(ligne(xd, yGen, xd, Y1, cD), ligne(xr, Y2, xr, yGen, cR));
      croisement(xd, Y2);
      dessus.push(point(xd, Y1, cD), point(xr, Y2, cR), vanne(xd, Y2 + 30), vanne(xr, Y2 + 30), thermo(xd, yGen - 30));
      if (d.pompesInd && (d.bouteille || nG > 1)) dessus.push(pompe(xr, Y2 + 75, false), texte(xr + 16, Y2 + 79, `P${d.chaud ? 'G' : 'GF'}${i + 1}`, { fs: 9 }), clapet(xr, Y2 + 110, false));
      else if (nG > 1) dessus.push(vanne2v(xr, Y2 + 85), texte(xr + 12, Y2 + 89, 'Vanne motorisée', { fs: 8.5 }));
      dessus.push(`<line x1="${xd}" y1="${yGen - 55}" x2="${xd - 22}" y2="${yGen - 55}" stroke="#222" stroke-width="1.2"/><path d="M${xd - 22} ${yGen - 62} l-12 7 l12 7 Z" fill="#fff" stroke="#222" stroke-width="1.2"/>`,
        texte(xd - 30, yGen - 66, 'Soupape', { fs: 8.5, a: 'middle' }));
      dessus.push(texte(xd + 6, yGen - 8, d.tg.nom.replace(/ \(.*/, ''), { fs: 9, c: cD }));
      if (d.chaud && d.Pg > 300) dessus.push(`<line x1="${xd}" y1="${yGen - 95}" x2="${xd - 18}" y2="${yGen - 95}" stroke="#222" stroke-width="1"/><circle cx="${xd - 26}" cy="${yGen - 95}" r="8" fill="#fff" stroke="#222" stroke-width="1.2"/>`, texte(xd - 26, yGen - 92, 'PS', { fs: 7, a: 'middle', b: true }), texte(xd - 36, yGen - 92, 'Manque d\'eau', { fs: 8, a: 'end' }));
    }
    if (!d.pompesInd && nG > 1 && d.bouteille) dessus.push(pompeH(xB - 45, Y1), texte(xB - 45, Y1 - 18, 'Pompe primaire', { fs: 8.5, a: 'middle' }));
    // Accessoires du primaire : vase d'expansion, remplissage, désemboueur
    if (e.vase !== 'non') {
      out.push(ligne(40, Y2, 40, 470, cR, 2.5), `<path d="M15 475 q25 -18 50 0 v70 q-25 18 -50 0 Z" fill="#f1f1f1" stroke="#222" stroke-width="1.5"/>`);
      dessus.push(point(40, Y2, cR), vanne(40, 445), texte(40, 575, 'Vase', { fs: 9.5, a: 'middle', b: true }), texte(40, 587, 'd\'expansion', { fs: 9.5, a: 'middle', b: true }));
      dessus.push(`<line x1="40" y1="420" x2="80" y2="420" stroke="#666" stroke-width="1.6"/>`, point(40, 420, cR), `<rect x="80" y="412" width="16" height="16" fill="#fff" stroke="#222" stroke-width="1.2"/>`,
        texte(88, 424, 'D', { fs: 9, a: 'middle', b: true }), texte(100, 424, 'Remplissage (disconnecteur)', { fs: 8.5 }));
    }
    if (e.desemboueur !== 'non') {
      const xd = (d.bouteille ? xB : xS0) - 60;
      dessus.push(`<rect x="${xd - 14}" y="${Y2 - 12}" width="28" height="34" rx="4" fill="#fff" stroke="#222" stroke-width="1.4"/>`, texte(xd, Y2 + 36, 'Pot à boue', { fs: 8.5, a: 'middle' }),
        texte(xd, Y2 + 46, 'désemboueur', { fs: 8.5, a: 'middle' }));
    }

    // Circuits
    d.circuits.forEach((c, i) => {
      const x = xS0 + i * pasC, xd = x + 50, xr = x + 120, yE = 80;
      out.push(ligne(xd, Y1, xd, yE + 70, cD), ligne(xr, yE + 70, xr, Y2, cR));
      croisement(xr, Y1);
      out.push(`<rect x="${x + 20}" y="${yE}" width="130" height="70" rx="6" fill="#fff" stroke="#222" stroke-width="1.6"/>`);
      out.push(texte(x + 85, yE + 16, c.rep.slice(0, 24), { fs: 10.5, a: 'middle', b: true }), texte(x + 85, yE + 30, c.em[0].split(' (')[0].slice(0, 28), { fs: 9, a: 'middle' }),
        texte(x + 85, yE + 45, `${nf(c.P, 0)} kW · ${c.rc[0]}/${c.rc[1]} °C`, { fs: 9.5, a: 'middle' }), texte(x + 85, yE + 60, `${nf(c.Q, 2)} m³/h`, { fs: 9.5, a: 'middle', b: true }));
      dessus.push(point(xd, Y1, cD), point(xr, Y2, cR), vanne(xd, Y1 - 22), vanne(xr, Y1 - 22));
      dessus.push(pompe(xd, 255), texte(xd - 16, 259, `PC${i + 1}`, { fs: 8.5, a: 'end' }), clapet(xd, 285));
      if (c.reg === '3v') { dessus.push(`<line x1="${xd + 14}" y1="200" x2="${xr}" y2="200" stroke="${cR}" stroke-width="2.5"/>`, point(xr, 200, cR), vanne3v(xd, 200), texte(xd + 14, 192, 'V3V', { fs: 8.5 })); }
      if (c.reg === '2v') dessus.push(vanne2v(xd, 200), texte(xd + 10, 192, 'V2V', { fs: 8.5 }));
      dessus.push(thermo(xd, 172), equilibrage(xr, 260), texte(xr + 13, 276, 'Équil.', { fs: 8 }));
      if (e.compteurs === 'oui') dessus.push(compteur(xr, 228));
      dessus.push(fleche(xd, 228, 'haut', cD), fleche(xr, 172, 'bas', cR));
      dessus.push(texte(xd - 6, 150 + 14, c.t.nom.replace(/ \(.*/, ''), { fs: 9, c: cD, a: 'end', rot: -90 }));
    });

    // Légende
    const yl = H - 34, lg = [[`<line x1="0" y1="0" x2="26" y2="0" stroke="${cD}" stroke-width="3"/>`, `Départ ${d.Td} °C`], [`<line x1="0" y1="0" x2="26" y2="0" stroke="${cR}" stroke-width="3"/>`, `Retour ${d.Tr} °C`],
      [pompeH(13, 0), 'Pompe'], [vanneH(13, 0), 'Vanne d\'isolement'], [`${vanne(13, 0)}<path d="M13 0 L27 -7 L27 7 Z" fill="#fff" stroke="#222" stroke-width="1.4"/>`, 'Vanne 3 voies'],
      [equilibrage(13, 0), 'Vanne d\'équilibrage'], [clapet(13, 0), 'Clapet anti-retour'], [compteur(13, 0), 'Compteur d\'énergie']];
    out.push(`<line x1="20" y1="${yl - 22}" x2="${W - 20}" y2="${yl - 22}" stroke="#ccc" stroke-width="1"/>`);
    let xl = 20;
    lg.forEach(([sym, lib]) => { out.push(`<g transform="translate(${xl} ${yl})">${sym}</g>`, texte(xl + 34, yl + 4, lib, { fs: 9.5 })); xl += 40 + lib.length * 5.6; });
    out.push(texte(W - 20, H - 8, 'Schéma de principe — ne vaut pas plan d\'exécution', { fs: 8.5, a: 'end', c: '#888' }));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${out.join('')}${masques.join('')}${dessus.join('')}</svg>`;
  }

  /* ---------- Réglementation selon la puissance (synthèse indicative) ---------- */
  // Fluides frigorigènes : potentiel de réchauffement planétaire (PRP, règlement UE 2024/573)
  const FLUIDES_FRIGO = { R32: 675, R410A: 2088, R134a: 1430, R513A: 631, R454B: 466, R1234ze: 7, R290: 3, R744: 1 };
  const exigence = (niveau, texte, ref = '') => ({ niveau, texte, ref });
  function reglementation(d, e) {
    const g = e.generateur, P = d.Pprod, Pg = d.Pg, comb = /^chaudiere/.test(g), gaz = /^chaudiere-(cond|gaz)$/.test(g), thermo = /^(pac|gf)/.test(g);
    const usage = e.usage || 'tertiaire', tertiaire = usage === 'tertiaire' || usage === 'erp', blocs = [];
    // Sécurité hydraulique
    const soupape = [[50, 'DN 15'], [100, 'DN 20'], [200, 'DN 25'], [350, 'DN 32'], [600, 'DN 40'], [900, 'DN 50']].find(([p]) => Pg <= p);
    const sec = [
      exigence('obligatoire', `Soupape de sécurité sur chaque générateur, tarée au plus à la pression maximale admissible, ${soupape ? `de diamètre ${soupape[1]} au minimum pour ${nf(Pg, 0)} kW` : 'en plusieurs soupapes au-delà de 900 kW'}, avec décharge visible vers l'égout.`, 'NF EN 12828, NF EN ISO 4126'),
      exigence('obligatoire', 'Vase d\'expansion ou maintien de pression sans organe d\'isolement manœuvrable par erreur (vanne cadenassée), manomètre et thermomètre à la production.', 'NF EN 12828'),
      exigence('obligatoire', `Disconnecteur sur le remplissage depuis l'eau potable${e.fluide && e.fluide !== 'eau' ? ', adapté à la catégorie du fluide glycolé (BA en général), remplissage par bac de préparation' : ''}.`, 'NF EN 1717, code de la santé publique'),
    ];
    if (d.chaud && comb) sec.push(exigence('obligatoire', 'Thermostat de réglage et limiteur de température de sécurité à réarmement manuel sur chaque générateur.', 'NF EN 12828'));
    if (d.chaud && Pg > 300) sec.push(exigence('obligatoire', `Générateurs de plus de 300 kW : limiteur de pression maximale et sécurité de manque d'eau (pressostat, limiteur de niveau ou de débit) sur chaque générateur.`, 'NF EN 12828'));
    if (d.Td > 105) sec.push(exigence('obligatoire', 'Départ au-delà de 105 °C : eau surchauffée hors NF EN 12828, soumise à la réglementation des équipements sous pression (conception et suivi en service).', 'Directive 2014/68/UE, arrêté du 20 novembre 2017'));
    if (g === 'echangeur-vapeur') sec.push(exigence('obligatoire', 'Échangeur alimenté en vapeur : équipement sous pression (déclaration, requalification selon PS·V) ; sécurité de surchauffe coupant la vapeur côté primaire.', 'Directive 2014/68/UE, arrêté du 20 novembre 2017'));
    sec.push(exigence('conseil', 'Désemboueur et traitement d\'eau conformes aux prescriptions des constructeurs (dureté, pH, oxygène).', 'Constructeurs, VDI 2035'));
    blocs.push({ titre: 'Sécurité de l\'installation', items: sec });
    // Local et combustible
    if (comb) {
      const loc = [], Pcomb = P / 0.92;
      loc.push(P > 70 ? exigence('obligatoire', `Puissance totale de ${nf(P, 0)} kW (> 70 kW) : chaufferie en local dédié, parois et porte coupe-feu, ventilation haute et basse, arrêt d'urgence et coupure du combustible depuis l'extérieur du local.`,
        usage === 'erp' ? 'Règlement de sécurité ERP (articles CH)' : usage === 'industrie' ? 'Arrêté du 23 juin 1978, code du travail' : 'Arrêté du 23 juin 1978')
        : exigence('info', 'Puissance totale ≤ 70 kW : pas d\'obligation de chaufferie dédiée (règles du constructeur et des DTU).', 'Arrêté du 23 juin 1978'));
      if (gaz) loc.push(exigence('obligatoire', 'Alimentation gaz : robinet de coupure extérieur au local, conduits d\'évacuation des produits de combustion et amenée d\'air comburant dimensionnés.', usage === 'erp' ? 'NF DTU 61.1, NF DTU 24.1, ERP articles GZ' : 'NF DTU 61.1, NF DTU 24.1'));
      if (g === 'chaudiere-fioul') loc.push(exigence('obligatoire', 'Stockage de fioul : cuve double paroi ou en rétention, limiteur de remplissage, jaugeage ; classement ICPE selon la quantité stockée.', 'Arrêté du 1er juillet 2004, rubrique ICPE 4734'));
      if (g === 'chaudiere-bois') loc.push(exigence('obligatoire', 'Chaudière biomasse : silo séparé, dispositif anti-retour de flamme, évacuation des cendres.', 'Arrêté du 23 juin 1978, constructeur'));
      loc.push(Pcomb >= 1000
        ? exigence('obligatoire', `Puissance thermique nominale ≈ ${nf(Pcomb / 1000, 2)} MW : installation de combustion classée ICPE (rubrique 2910) — ${Pcomb < 20000 ? 'déclaration avec contrôle périodique' : Pcomb < 50000 ? 'enregistrement' : 'autorisation'}.`, 'Nomenclature ICPE 2910')
        : exigence('info', `Puissance thermique nominale ≈ ${nf(Pcomb, 0)} kW (< 1 MW) : pas de classement ICPE au titre de la rubrique 2910.`, 'Nomenclature ICPE 2910'));
      blocs.push({ titre: 'Local et combustible', items: loc });
    }
    // Exploitation et contrôles
    const exp = [];
    if (comb && Pg >= 4 && Pg <= 400) exp.push(exigence('obligatoire', 'Entretien annuel de chaque chaudière par un professionnel qualifié, avec attestation d\'entretien.', 'Code de l\'environnement R.224-41-4 et suivants'));
    if (comb && Pg > 400) exp.push(exigence('obligatoire', 'Chaudières de plus de 400 kW : contrôle de l\'efficacité énergétique tous les 2 ans par un organisme accrédité, livret de chaufferie, appareils de mesure (fumées, combustible).', 'Code de l\'environnement R.224-20 et suivants, arrêté du 2 octobre 2009'));
    exp.push(P > 70 ? exigence('obligatoire', `Système de ${d.chaud ? 'chauffage' : 'climatisation'} de plus de 70 kW : inspection périodique tous les 5 ans par une personne certifiée.`, 'Décret n° 2020-912 du 28 juillet 2020')
      : exigence('info', 'Système de 70 kW ou moins : pas d\'inspection périodique obligatoire (entretien selon le générateur).', 'Décret n° 2020-912'));
    if (tertiaire) {
      exp.push(P > 290 ? exigence('obligatoire', 'Bâtiment tertiaire, système de plus de 290 kW : système d\'automatisation et de contrôle (BACS / GTB) obligatoire depuis le 1er janvier 2025.', 'Code de la construction R.175-1 à R.175-6 (décret BACS)')
        : P > 70 ? exigence('obligatoire', 'Bâtiment tertiaire, système de plus de 70 kW : système d\'automatisation et de contrôle (BACS / GTB) obligatoire au 1er janvier 2027.', 'Code de la construction R.175-1 à R.175-6 (décret BACS)')
          : exigence('info', 'Système de 70 kW ou moins : GTB non imposée par le décret BACS.', 'Décret BACS'));
      exp.push(exigence('info', 'Bâtiment tertiaire de 1 000 m² ou plus : objectifs de réduction des consommations et déclaration annuelle (dispositif éco-énergie tertiaire) ; le comptage par circuit facilite le suivi.', 'Code de la construction L.174-1, R.174-22 et suivants'));
    }
    exp.push(exigence(e.compteurs === 'oui' ? 'info' : 'conseil', e.compteurs === 'oui' ? 'Compteurs d\'énergie par circuit prévus.' : 'Comptage de l\'énergie par circuit ou par usage conseillé (exigé en construction neuve selon le type de bâtiment).', 'RE 2020, décret BACS'));
    blocs.push({ titre: 'Exploitation et contrôles périodiques', items: exp });
    // Froid et fluides frigorigènes
    if (thermo) {
      const fl = FLUIDES_FRIGO[e.fluideFrigo] ? e.fluideFrigo : 'R32', estimee = !(num(e.chargeFrigo) > 0), charge = estimee ? 0.3 * P : num(e.chargeFrigo), teq = charge * FLUIDES_FRIGO[fl] / 1000, it = [];
      it.push(exigence('info', `Charge ${estimee ? 'estimée (≈ 0,3 kg/kW, à remplacer par la valeur constructeur)' : 'déclarée'} : ${nf(charge, 0)} kg de ${fl} (PRP ${FLUIDES_FRIGO[fl]}), soit ${nf(teq, 1)} t éq. CO₂ pour l'ensemble de la production.`));
      if (fl !== 'R290' && fl !== 'R744' && teq / d.n >= 5) it.push(exigence('obligatoire', `Contrôle d'étanchéité périodique de chaque équipement : tous les ${teq / d.n >= 500 ? '3' : teq / d.n >= 50 ? '6' : '12'} mois (délais doublés avec un système de détection des fuites), fiche d'intervention et registre, opérateur titulaire d'une attestation de capacité.`, 'Règlement (UE) 2024/573, code de l\'environnement R.543-75 et suivants'));
      if (teq / d.n >= 500) it.push(exigence('obligatoire', 'Plus de 500 t éq. CO₂ par équipement : système de détection des fuites obligatoire.', 'Règlement (UE) 2024/573'));
      if (fl !== 'R290' && fl !== 'R744' && charge > 300) it.push(exigence('obligatoire', `Quantité cumulée de fluides fluorés supérieure à 300 kg : installation classée ICPE (rubrique 1185), déclaration avec contrôle périodique.`, 'Nomenclature ICPE 1185'));
      if (fl === 'R290') it.push(exigence('obligatoire', 'Fluide inflammable (propane, classe A3) : charge limitée selon l\'emplacement, zones ATEX, installation en extérieur ou en salle des machines ventilée avec détection.', 'NF EN 378, directives ATEX'));
      if (fl === 'R744') it.push(exigence('obligatoire', 'CO₂ (R744) : très hautes pressions, équipements sous pression ; détection de CO₂ en local occupé.', 'NF EN 378, directive 2014/68/UE'));
      if (g === 'gf-eau') it.push(exigence('obligatoire', 'Tour aéroréfrigérante ouverte (le cas échéant) : ICPE 2921 — déclaration avec contrôle en dessous de 3 000 kW, enregistrement au-delà — et plan de prévention des légionelles ; sans objet avec un aéroréfrigérant sec.', 'Nomenclature ICPE 2921, arrêtés du 14 décembre 2013'));
      it.push(exigence('obligatoire', 'Conception et installation de l\'équipement frigorifique (salle des machines, ventilation, détection) selon le fluide et sa charge.', 'NF EN 378'));
      blocs.push({ titre: 'Fluides frigorigènes', items: it });
    }
    // Distribution et usages
    const dist = [];
    if (d.circuits.some(c => c.emetteur === 'plancher')) dist.push(exigence('obligatoire', 'Plancher chauffant : thermostat de sécurité sur le départ du circuit, coupant le circulateur au-delà de la température admissible des tubes et du revêtement.', 'NF DTU 65.14'));
    if (d.circuits.some(c => c.emetteur === 'ecs')) dist.push(exigence('obligatoire', 'Eau chaude sanitaire : 55 °C au moins en sortie de production et 50 °C dans le bouclage (prévention des légionelles), 50 °C au plus aux points de puisage des pièces de toilette.', 'Arrêté du 30 novembre 2005'));
    if (d.circuits.some(c => c.emetteur === 'plafond')) dist.push(exigence('obligatoire', 'Plafonds et poutres froides : sécurité anti-condensation (sonde de point de rosée coupant la vanne du circuit).', 'Constructeurs'));
    dist.push(d.chaud ? exigence('obligatoire', 'Calorifugeage des réseaux de distribution situés hors volume chauffé.', 'RE 2020 (neuf), arrêté du 3 mai 2007 (existant)')
      : exigence('obligatoire', 'Calorifugeage des réseaux d\'eau glacée avec pare-vapeur continu (voir le calcul d\'isolation).', 'NF DTU 45.2'));
    dist.push(exigence('obligatoire', 'Organes d\'équilibrage et de mesure permettant le réglage et le contrôle des débits de chaque circuit.', 'NF DTU 65.11'));
    blocs.push({ titre: 'Distribution et usages', items: dist });
    // Seuils
    // [seuil, exigence, s'applique, puissance comparée]
    const seuils = [[70, 'Chaufferie dédiée (générateurs à combustion)', comb, P], [70, 'Inspection périodique des systèmes (5 ans)', true, P], [70, 'BACS / GTB en tertiaire (2027)', tertiaire, P], [290, 'BACS / GTB en tertiaire (2025)', tertiaire, P],
      [300, 'Sécurité manque d\'eau, pression maxi (par générateur)', d.chaud, Pg], [400, 'Contrôle d\'efficacité énergétique, livret de chaufferie (par chaudière)', comb, Pg], [1000, 'ICPE 2910 (puissance thermique de combustion)', comb, P / 0.92]].filter(s => s[2]);
    blocs.push({ titre: 'Seuils de puissance', tableau: { entetes: ['Seuil', 'Exigence', 'Situation'], lignes: seuils.map(([s, lib, , ref]) => [`${nf(s, 0)} kW`, lib, ref > s ? `Concerné (${nf(ref, 0)} kW)` : `Non concerné (${nf(ref, 0)} kW)`]) } });
    blocs.push({ titre: '', texte: ['Synthèse indicative établie d\'après la puissance, le type de générateur et l\'usage du bâtiment : vérifier les textes en vigueur, le CCTP et les exigences du bureau de contrôle.'] });
    return blocs;
  }

  /* ---------- Régulation : analyse fonctionnelle et liste des points ---------- */
  function regulation(d, e) {
    const Tb = num(e.Tbase, -10), red = num(e.reduit, 3), perm = num(e.permutation, 168), af = [], pts = [];
    const pt = (rep, des, type, rem = '') => pts.push([rep, des, type, rem]);
    const G = d.chaud ? 'G' : 'GF';
    pt('TE', 'Température extérieure', 'EA', 'Façade nord, à l\'abri du soleil');
    // Production
    af.push(d.chaud ? `Production : la consigne de départ ${d.bouteille ? 'mesurée en aval de la bouteille de découplage (sonde de départ commun)' : 'mesurée sur le collecteur de départ'} est égale à la demande la plus élevée des circuits majorée de 5 K, plafonnée à ${d.Td} °C.`
      : `Production : consigne de départ d'eau glacée ${d.Td} °C ${d.bouteille ? 'en aval de la bouteille de découplage' : 'sur le collecteur'}, relevée jusqu'à ${d.Td + 3} °C par temps doux ou faible hygrométrie.`);
    if (d.n > 1) af.push(e.cascadeMode === 'parallele'
      ? `Cascade de ${d.n} générateurs en modulation parallèle : les générateurs en service modulent ensemble au-dessus de leur taux de charge minimal (meilleur rendement${/cond|pac/.test(g(e)) ? ' et condensation' : ''}) ; un générateur supplémentaire démarre lorsque les autres dépassent 80 % de charge.`
      : `Cascade de ${d.n} générateurs en séquence : le générateur suivant démarre lorsque la consigne n'est pas atteinte après une temporisation (10 min réglable) avec le précédent au-delà de 90 % de charge ; arrêt dans l'ordre inverse.`);
    if (d.n > 1) af.push(`Permutation de l'ordre de priorité toutes les ${nf(perm, 0)} h de fonctionnement et basculement automatique sur le générateur suivant en cas de défaut (secours).`);
    for (let i = 1; i <= d.n; i++) {
      pt(`${G}${i}`, `Autorisation de marche du générateur ${i}`, 'STOR'); pt(`${G}${i}`, `Consigne ou modulation du générateur ${i}`, 'SA', '0-10 V ou bus constructeur'); pt(`${G}${i}`, `État de marche du générateur ${i}`, 'ETOR'); pt(`${G}${i}`, `Défaut du générateur ${i}`, 'ETOR');
      if (d.pompesInd && (d.bouteille || d.n > 1)) { pt(`P${G}${i}`, `Commande de la pompe primaire ${i}`, 'STOR', 'Post-circulation 5 min'); pt(`P${G}${i}`, `Défaut de la pompe primaire ${i}`, 'ETOR'); }
      else if (d.n > 1) { pt(`VM${i}`, `Vanne d'isolement motorisée du générateur ${i}`, 'STOR'); pt(`VM${i}`, `Fin de course de la vanne ${i}`, 'ETOR'); }
    }
    if (d.pompesInd && (d.bouteille || d.n > 1)) af.push(`Pompes primaires asservies à leur générateur, avec post-circulation de 5 min à l'arrêt${d.bouteille && /cond|pac/.test(g(e)) ? ' ; vitesse variable pour limiter le débit primaire et garder un retour froid' : ''}.`);
    if (!d.pompesInd && d.n > 1) { af.push('Vannes d\'isolement motorisées : ouverture avant le démarrage du générateur, fermeture après sa post-circulation ; un générateur à l\'arrêt n\'est pas irrigué.'); if (d.bouteille) { pt('PP', 'Commande de la pompe primaire commune', 'STOR'); pt('PP', 'Défaut de la pompe primaire commune', 'ETOR'); pt('PP', 'Vitesse de la pompe primaire commune', 'SA'); } }
    pt('TD', d.bouteille ? 'Température de départ commun (aval bouteille)' : 'Température du collecteur de départ', 'EA'); pt('TR', d.bouteille ? 'Température de retour commun (amont bouteille)' : 'Température du collecteur de retour', 'EA');
    pt('PI', 'Pression de l\'installation', 'EA', `Alarme basse sous ${nf(1, 1)} bar (réglable)`);
    if (d.chaud && d.Pg > 300) pt('MDE', 'Sécurité de manque d\'eau', 'ETOR', 'Coupe les générateurs');
    // Circuits
    d.circuits.forEach((c, i) => {
      const k = i + 1, nom = `circuit ${k} (${c.rep})`, rc = c.rc, loi = rc[0] > rc[1] && ['radiateurs', 'plancher', 'radiant', 'aerotherme'].includes(c.emetteur);
      const base = c.emetteur === 'plancher' ? 25 : 30, txt = [];
      if (loi && c.reg !== 'direct') txt.push(`loi d'eau : départ à ${rc[0]} °C pour ${Tb} °C extérieur, ${base} °C pour 18 °C extérieur (courbe réglable, influence de la température ambiante possible)`);
      if (c.emetteur === 'cta') txt.push(`vanne pilotée par la régulation de la CTA (température de soufflage ou de reprise), pompe autorisée sur demande de la CTA${d.chaud ? ', protection antigel : vanne ouverte et pompe en marche si l\'air descend sous 5 °C' : ', déshumidification possible'}`);
      if (c.emetteur === 'ventilo') txt.push('vannes 2 voies sur chaque ventilo-convecteur commandées par les régulateurs terminaux, pompe à vitesse variable à pression différentielle constante, soupape différentielle en bout de réseau');
      if (c.emetteur === 'ecs') txt.push('charge du ballon sur demande de sa sonde (consigne 60 °C, différentiel 5 K), priorité ECS réglable, choc thermique hebdomadaire à 70 °C');
      if (c.emetteur === 'plancher') txt.push(`thermostat de sécurité sur le départ coupant la pompe (${d.chaud ? '50 °C' : 'sans objet'})`);
      if (c.emetteur === 'plafond') txt.push('départ régulé au-dessus du point de rosée ambiant (sonde d\'hygrométrie), détecteur de condensation fermant la vanne');
      if (c.emetteur === 'process') txt.push('consigne fixe donnée par le process, marche autorisée par le process');
      if (c.emetteur === 'sousstation') txt.push('pression différentielle disponible maintenue en tête de réseau');
      if (c.reg === '2v' && c.emetteur !== 'ventilo') txt.push('pompe à vitesse variable à pression différentielle constante');
      if (d.chaud && !['ecs', 'cta', 'process'].includes(c.emetteur)) txt.push('arrêt de la pompe et fermeture de la vanne au-delà de 17 °C extérieur (réglable)');
      af.push(`Circuit ${k} — ${c.rep} (${c.em[0].split(' (')[0]}, ${REGULATIONS[c.reg].toLowerCase()}) : ${txt.join(' ; ') || 'marche selon la programmation horaire'}.`);
      pt(`TD${k}`, `Température de départ du ${nom}`, 'EA');
      if (c.reg !== 'direct') pt(`V${k}`, `Vanne de régulation du ${nom}`, 'SA', '0-10 V');
      pt(`PC${k}`, `Commande de la pompe du ${nom}`, 'STOR'); pt(`PC${k}`, `Défaut de la pompe du ${nom}`, 'ETOR');
      if (c.reg === '2v' || c.emetteur === 'ventilo') pt(`PC${k}`, `Vitesse de la pompe du ${nom}`, 'SA', 'ou consigne Δp par bus');
      if (c.emetteur === 'plancher') pt(`TS${k}`, `Thermostat de sécurité du ${nom}`, 'ETOR');
      if (c.emetteur === 'ecs') pt(`TB${k}`, 'Température du ballon d\'ECS', 'EA');
      if (c.emetteur === 'cta') pt(`DC${k}`, `Demande de la CTA (${c.rep})`, 'ETOR');
      if (c.emetteur === 'plafond') pt(`HR${k}`, 'Hygrométrie ambiante / détecteur de condensation', 'EA');
      if (e.compteurs === 'oui') pt(`CE${k}`, `Compteur d'énergie du ${nom}`, 'Bus', 'M-Bus ou Modbus');
    });
    af.push(`Programmation horaire par circuit : confort, réduit (abaissement de ${nf(red, 0)} K${d.chaud ? '' : ' ou arrêt'}) et hors gel ; relance optimisée selon la température extérieure.`);
    af.push('Hors gel : pompes en marche en dessous de 3 °C extérieur ; dégommage des pompes et des vannes 30 s par semaine en période d\'arrêt.');
    af.push('Alarmes remontées : défauts des générateurs et des pompes, pression basse, sécurités, écart de température prolongé par rapport à la consigne.');
    if (e.gtb && e.gtb !== 'aucune') af.push(`Communication ${e.gtb} avec la GTB : états, défauts, consignes, mesures et comptages, historiques ; suivi et comparaison des consommations, détection des dérives (exigences du décret BACS).`);
    const types = ['EA', 'SA', 'ETOR', 'STOR', 'Bus'], nb = t => pts.filter(p => p[2] === t).length;
    const total = types.map(t => [t, nb(t)]).filter(([, n]) => n);
    return [
      { titre: 'Analyse fonctionnelle', liste: af },
      { titre: 'Liste des points (automate / GTB)', tableau: { entetes: ['Repère', 'Désignation', 'Type', 'Remarque'], lignes: pts } },
      { titre: 'Récapitulatif des entrées / sorties', tableau: { entetes: ['Type', 'Nombre', 'Avec 20 % de réserve'], lignes: [...total.map(([t, n]) => [{ EA: 'Entrées analogiques (EA)', SA: 'Sorties analogiques (SA)', ETOR: 'Entrées tout-ou-rien (ETOR)', STOR: 'Sorties tout-ou-rien (STOR)', Bus: 'Équipements communicants (bus)' }[t], String(n), String(Math.ceil(n * 1.2))]),
        ['Total', String(pts.length), String(total.reduce((a, [, n]) => a + Math.ceil(n * 1.2), 0))]], total: true } },
    ];
  }
  const g = e => e.generateur || '';

  /* ---------- Type de note ---------- */
  const optListe = t => Object.entries(t).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]);
  N.TYPES.pid = {
    titre: 'Schéma de principe hydraulique (P&ID) eau chaude / eau glacée', icone: '🗺️', famille: 'Schémas',
    description: 'Production (un générateur ou une cascade), bouteille de découplage ou non, collecteurs et circuits vers les émetteurs : schéma dessiné automatiquement, débits, diamètres, pompes, vannes et bouteille dimensionnés.',
    champs: [{ g: 'Réseau' }, { k: 'titreInstallation', l: 'Installation', t: 't', d: 'Chaufferie bâtiment A' },
      { k: 'reseau', l: 'Régime', t: 's', o: optListe(REGIMES), d: 'ch-70-50' },
      { k: 'Tdep', l: 'Température de départ', u: '°C', d: 70, si: e => e.reseau === 'perso' }, { k: 'Tret', l: 'Température de retour', u: '°C', d: 50, si: e => e.reseau === 'perso' },
      { k: 'fluide', l: 'Fluide', t: 's', o: [['eau', 'Eau'], ...Object.entries(D.GLYCOLS).map(([k, g]) => [k, g.libelle])], d: 'eau' },
      { k: 'serie', l: 'Série de tubes', t: 's', o: Object.entries(D.SERIES).map(([k, s]) => [k, s.libelle]), d: 'acier-10216' },
      { k: 'vmax', l: 'Vitesse maximale', u: 'm/s', d: 1.5 }, { k: 'Rmax', l: 'Perte de charge linéique maximale', u: 'Pa/m', d: 150 },
      { g: 'Production' }, { k: 'generateur', l: 'Générateur', t: 's', o: optListe(GENERATEURS), d: 'chaudiere-cond' },
      { k: 'nGen', l: 'Nombre de générateurs', t: 's', o: [['1', '1 générateur (sans cascade)'], ['2', '2 en cascade'], ['3', '3 en cascade'], ['4', '4 en cascade'], ['5', '5 en cascade'], ['6', '6 en cascade']], d: '2' },
      { k: 'Pgen', l: 'Puissance unitaire', u: 'kW', d: 150 },
      { k: 'pompesPrim', l: 'Pompes de la cascade', t: 's', o: [['individuelles', 'Une pompe et un clapet par générateur'], ['commune', 'Pompe primaire commune et vannes motorisées']], d: 'individuelles', si: e => num(e.nGen, 1) > 1 },
      { k: 'bouteille', l: 'Bouteille de découplage', t: 's', o: [['oui', 'Avec bouteille de découplage'], ['non', 'Sans bouteille (raccordement direct)']], d: 'oui' },
      { g: 'Distribution' },
      { k: 'circuits', l: 'Circuits (régime : « 45/35 » si différent du réseau, vide = régime du réseau)', t: 'lignes', d: [
        { rep: 'Radiateurs bureaux', emetteur: 'radiateurs', P: 90, regime: '', regulation: '3v', L: 120 },
        { rep: 'CTA atelier', emetteur: 'cta', P: 80, regime: '', regulation: '3v', L: 60 },
        { rep: 'Plancher vestiaires', emetteur: 'plancher', P: 30, regime: '40/32', regulation: '3v', L: 40 },
        { rep: 'Ballon ECS', emetteur: 'ecs', P: 40, regime: '', regulation: 'direct', L: 20 }],
      colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'emetteur', l: 'Émetteur', t: 's', o: optListe(EMETTEURS) }, { k: 'P', l: 'Puissance (kW)' },
        { k: 'bilan', l: 'Puissance reprise de', t: 's', o: (e, ctx) => [['', 'Saisie'], ...((ctx && ctx.notes) || []).map((n, i) => [n, i]).filter(([n]) => n.type === 'bilan').map(([n, i]) => [n.id, `N${i + 1} — ${n.titre}`])] },
        { k: 'regime', l: 'Régime (°C)', t: 't' }, { k: 'regulation', l: 'Régulation', t: 's', o: optListe(REGULATIONS) }, { k: 'L', l: 'Longueur aller + retour (m)' }] },
      { k: 'foisonnement', l: 'Coefficient de simultanéité des besoins', u: '%', d: 100 },
      { g: 'Réglementation' }, { k: 'usage', l: 'Usage du bâtiment', t: 's', o: [['tertiaire', 'Tertiaire (bureaux, commerces…)'], ['erp', 'Établissement recevant du public'], ['habitation', 'Habitation collective'], ['industrie', 'Industriel (locaux de production)']], d: 'tertiaire' },
      { k: 'fluideFrigo', l: 'Fluide frigorigène', t: 's', o: Object.keys(FLUIDES_FRIGO).map(k => [k, k]), d: 'R32', si: e => /^(pac|gf)/.test(e.generateur || '') },
      { k: 'chargeFrigo', l: 'Charge totale de fluide (vide : estimée)', u: 'kg', d: '', si: e => /^(pac|gf)/.test(e.generateur || '') },
      { g: 'Régulation' }, { k: 'Tbase', l: 'Température extérieure de base (loi d\'eau)', u: '°C', d: -10 },
      { k: 'reduit', l: 'Abaissement en période réduite', u: 'K', d: 3 },
      { k: 'cascadeMode', l: 'Gestion de la cascade', t: 's', o: [['sequence', 'Enclenchement séquentiel'], ['parallele', 'Modulation parallèle']], d: 'sequence', si: e => num(e.nGen, 1) > 1 },
      { k: 'permutation', l: 'Permutation de la priorité des générateurs', u: 'h', d: 168, si: e => num(e.nGen, 1) > 1 },
      { k: 'gtb', l: 'Communication avec la GTB', t: 's', o: [['BACnet IP', 'BACnet IP'], ['Modbus TCP', 'Modbus TCP'], ['KNX', 'KNX'], ['aucune', 'Aucune (régulateur autonome)']], d: 'BACnet IP' },
      { g: 'Accessoires' }, { k: 'vase', l: 'Vase d\'expansion et remplissage', t: 's', o: [['oui', 'Représentés'], ['non', 'Non représentés']], d: 'oui' },
      { k: 'desemboueur', l: 'Pot à boue / désemboueur', t: 's', o: [['oui', 'Représenté'], ['non', 'Non représenté']], d: 'oui' },
      { k: 'compteurs', l: 'Compteurs d\'énergie par circuit', t: 's', o: [['non', 'Non'], ['oui', 'Oui']], d: 'non' }],
    calcul(e) {
      const d = dimensionner(e), alertes = [...d.alertes], vol = volumeEau(d, e.generateur);
      if (!alertes.some(a => a.niveau === 'erreur')) alertes.unshift(alerte('ok', `${d.n > 1 ? `Cascade de ${d.n} × ${nf(d.Pg, 0)} kW` : `Générateur de ${nf(d.Pg, 0)} kW`} pour ${nf(d.Pdem, 0)} kW de besoins ; débit primaire ${nf(d.Qp, 2)} m³/h, secondaire ${nf(d.Qs, 2)} m³/h${d.bouteille && d.tb ? `, bouteille ${d.tb.nom}` : ''}.`));
      return {
        valeurs: { volume: vol.total, Pprod: d.Pprod, Pdem: d.Pdem, Qp: d.Qp, Qs: d.Qs, Qg: d.Qg, bouteille: d.tb ? d.tb.cle : null, Db: d.Db, collecteur: d.tc.cle, circuits: d.circuits.map(c => ({ rep: c.rep, Q: c.Q, Qcoll: c.Qcoll, tube: c.t.cle, hmt: c.hmt, kvs: c.kvs })) },
        resume: [['Réseau', `${d.regime} — ${d.f.libelle}`], ['Production', `${d.n} × ${d.gen[0].toLowerCase()} de ${nf(d.Pg, 0)} kW = ${nf(d.Pprod, 0)} kW`],
          ['Besoins (avec simultanéité)', `${nf(d.Pdem, 0)} kW`], ['Débit par générateur', `${nf(d.Qg, 2)} m³/h — ${d.tg.nom}`], ['Débit primaire total', `${nf(d.Qp, 2)} m³/h`],
          ['Débit appelé par les circuits', `${nf(d.Qs, 2)} m³/h`], ['Collecteurs', `${d.tc.nom} (${nf(d.Qcoll, 2)} m³/h)`],
          ['Bouteille de découplage', d.bouteille ? `${d.tb ? d.tb.nom : '—'} (Ø intérieur mini ${nf(d.Db, 0)} mm)` : 'Sans'], ['Volume d\'eau estimé', `${nf(vol.total, 0)} L`]],
        tableaux: [{ titre: 'Circuits de distribution', entetes: ['Circuit', 'Émetteur', 'P (kW)', 'Régime (°C)', 'Débit (m³/h)', 'Tube', 'v (m/s)', 'Régulation', 'Kvs', 'Pompe (m³/h × mCE)'],
          lignes: d.circuits.map(c => [c.rep, c.em[0], nf(c.P, 0), `${c.rc[0]}/${c.rc[1]}`, nf(c.Q, 2), c.t.nom, nf(c.v, 2), REGULATIONS[c.reg], c.kvs ? nf(c.kvs, c.kvs < 1 ? 2 : 1) : '—', `${nf(c.Q, 2)} × ${nf(c.hmt, 1)}`]) },
        { titre: 'Production', entetes: ['Générateur', 'P (kW)', 'Débit (m³/h)', 'Raccordement', 'Pompe primaire'],
          lignes: Array.from({ length: d.n }, (_, i) => [`${d.chaud ? 'G' : 'GF'}${i + 1} — ${d.gen[0]}`, nf(d.Pg, 0), nf(d.Qg, 2), d.tg.nom,
            d.pompesInd && (d.bouteille || d.n > 1) ? `${nf(d.Qg, 2)} m³/h, avec clapet` : d.n > 1 && d.bouteille ? `pompe commune ${nf(d.Qp, 2)} m³/h, vanne motorisée` : d.n > 1 ? 'vanne motorisée (pompes des circuits)' : 'sans (pompes des circuits)'] ) }],
        alertes,
        hypotheses: ['Débits : Q = P / (ρ · cp · ΔT) au régime de chaque circuit ; un circuit à vanne 3 voies mélangeuse appelle sur le collecteur P / (ρ · cp · (départ réseau − retour circuit)).',
          'Diamètres : plus petit tube de la série respectant la vitesse et la perte de charge linéique maximales ; collecteurs limités à 1 m/s.',
          'Pompes de circuit : HMT estimée = pertes linéiques × 1,3 (singularités) + émetteur (valeur usuelle) + vanne de régulation (autorité ≈ 0,5) + équilibrage 5 kPa. À confirmer par le calcul de réseau.',
          'Bouteille de découplage : vitesse verticale ≤ 0,2 m/s et diamètre ≥ 3 fois le plus gros piquage ; piquages départ en partie haute, retours en partie basse.',
          'Schéma de principe : ne remplace pas le plan d\'exécution (organes de sécurité, vidanges, purges et appareils de mesure à compléter selon le CCTP).'],
        synthese: `${d.n > 1 ? `Cascade ${d.n} × ${nf(d.Pg, 0)} kW` : `${nf(d.Pg, 0)} kW`} · ${d.circuits.length} circuit(s) · ${d.bouteille ? 'bouteille' : 'sans bouteille'} · ${nf(d.Qs, 1)} m³/h`,
        schema: dessiner(d, e),
        onglets: [{ titre: 'Réglementation', blocs: reglementation(d, e) }, { titre: 'Régulation', blocs: regulation(d, e) }],
      };
    },
  };
  return { REGIMES, GENERATEURS, EMETTEURS, REGULATIONS, FLUIDES_FRIGO, CONTENANCE, volumeEau, dimensionner, dessiner, reglementation, regulation };
})(typeof Donnees !== 'undefined' ? Donnees : require('./donnees'), typeof Calculs !== 'undefined' ? Calculs : require('./calculs'), typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = Schema;
