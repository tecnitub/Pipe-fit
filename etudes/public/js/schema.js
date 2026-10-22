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
        { k: 'regime', l: 'Régime (°C)', t: 't' }, { k: 'regulation', l: 'Régulation', t: 's', o: optListe(REGULATIONS) }, { k: 'L', l: 'Longueur aller + retour (m)' }] },
      { k: 'foisonnement', l: 'Coefficient de simultanéité des besoins', u: '%', d: 100 },
      { g: 'Accessoires' }, { k: 'vase', l: 'Vase d\'expansion et remplissage', t: 's', o: [['oui', 'Représentés'], ['non', 'Non représentés']], d: 'oui' },
      { k: 'desemboueur', l: 'Pot à boue / désemboueur', t: 's', o: [['oui', 'Représenté'], ['non', 'Non représenté']], d: 'oui' },
      { k: 'compteurs', l: 'Compteurs d\'énergie par circuit', t: 's', o: [['non', 'Non'], ['oui', 'Oui']], d: 'non' }],
    calcul(e) {
      const d = dimensionner(e), alertes = [...d.alertes];
      if (!alertes.some(a => a.niveau === 'erreur')) alertes.unshift(alerte('ok', `${d.n > 1 ? `Cascade de ${d.n} × ${nf(d.Pg, 0)} kW` : `Générateur de ${nf(d.Pg, 0)} kW`} pour ${nf(d.Pdem, 0)} kW de besoins ; débit primaire ${nf(d.Qp, 2)} m³/h, secondaire ${nf(d.Qs, 2)} m³/h${d.bouteille && d.tb ? `, bouteille ${d.tb.nom}` : ''}.`));
      return {
        valeurs: { Pprod: d.Pprod, Pdem: d.Pdem, Qp: d.Qp, Qs: d.Qs, Qg: d.Qg, bouteille: d.tb ? d.tb.cle : null, Db: d.Db, collecteur: d.tc.cle, circuits: d.circuits.map(c => ({ rep: c.rep, Q: c.Q, Qcoll: c.Qcoll, tube: c.t.cle, hmt: c.hmt, kvs: c.kvs })) },
        resume: [['Réseau', `${d.regime} — ${d.f.libelle}`], ['Production', `${d.n} × ${d.gen[0].toLowerCase()} de ${nf(d.Pg, 0)} kW = ${nf(d.Pprod, 0)} kW`],
          ['Besoins (avec simultanéité)', `${nf(d.Pdem, 0)} kW`], ['Débit par générateur', `${nf(d.Qg, 2)} m³/h — ${d.tg.nom}`], ['Débit primaire total', `${nf(d.Qp, 2)} m³/h`],
          ['Débit appelé par les circuits', `${nf(d.Qs, 2)} m³/h`], ['Collecteurs', `${d.tc.nom} (${nf(d.Qcoll, 2)} m³/h)`],
          ['Bouteille de découplage', d.bouteille ? `${d.tb ? d.tb.nom : '—'} (Ø intérieur mini ${nf(d.Db, 0)} mm)` : 'Sans']],
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
      };
    },
  };
  return { REGIMES, GENERATEURS, EMETTEURS, REGULATIONS, dimensionner, dessiner };
})(typeof Donnees !== 'undefined' ? Donnees : require('./donnees'), typeof Calculs !== 'undefined' ? Calculs : require('./calculs'), typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = Schema;
