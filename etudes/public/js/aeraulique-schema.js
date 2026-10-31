// Schéma de principe aéraulique : le producteur est la CTA (double flux, simple flux, à mélange) ou le caisson
// d'extraction / d'insufflation ; les émetteurs sont les bouches de soufflage, de reprise et d'extraction, groupées par zone.
// Pour chaque réseau : gaine principale découpée entre les piquages (débits cumulés), antennes, bouches choisies dans les
// gammes génériques, chemin le plus défavorisé, pression et puissance des ventilateurs avec les composants de la CTA ;
// schéma dessiné (SVG, DXF, note PDF) ; équipements repris par le métré et l'alimentation électrique.
const SchemaAir = ((D, C, N, Cta) => {
  const nf = N.nf, num = N.num, alerte = (niveau, texte) => ({ niveau, texte });
  const PRODUCTEURS = {
    'cta-df': ['CTA double flux (soufflage et reprise, récupérateur)', true, true],
    'cta-melange': ['CTA à mélange (air neuf et air recyclé)', true, true],
    'cta-sf': ['CTA simple flux (soufflage d\'air neuf)', true, false],
    insufflation: ['Caisson d\'insufflation', true, false],
    extraction: ['Caisson / tourelle d\'extraction (VMC simple flux)', false, true],
  };
  const RECUPERATEURS = { plaques: ['Échangeur à plaques', 150], roue: ['Roue (récupérateur rotatif)', 120], boucle: ['Boucle à eau glycolée', 180], aucun: ['Sans récupérateur', 0] };
  const RESEAUX = { soufflage: 'Soufflage', reprise: 'Reprise', extraction: 'Extraction' };
  const BOUCHES = Cta.BOUCHES;

  // Gaine circulaire automatique (ou rectangulaire à hauteur imposée) respectant vmax et Rmax
  function choisirGaine(Q, e, vmax) {
    const qv = Q / 3600, T = num(e.T, 20), rug = (D.RUGOSITE_GAINE[e.materiau] || D.RUGOSITE_GAINE.galva)[1], Rmax = num(e.Rmax, 1), h = num(e.h, 300);
    const dims = e.forme === 'rect' ? [200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000].map(a => ({ a, b: Math.min(a, h) })) : D.GAINES_RONDES.map(d => ({ a: d, b: 0 }));
    const d = dims.find(x => { const r = C.gaine(qv, x, T, rug); return r.v <= vmax && r.R <= Rmax; }) || dims[dims.length - 1];
    return { dim: d, nom: d.b ? `${d.a} × ${d.b}` : `Ø ${d.a}`, ...C.gaine(qv, d, T, rug) };
  }
  // Bouche : plus petite taille de la gamme dont la vitesse au col reste sous la vitesse maximale
  function choisirBouche(type, q, rho) {
    const b = BOUCHES[type] || BOUCHES.plafond, qv = q / 3600;
    const t = b.tailles.find(([, A]) => qv / A <= b.vmax) || b.tailles[b.tailles.length - 1], v = qv / t[1];
    return { b, nom: t[0], v, dp: b.zeta * rho * v * v / 2, Lw: Cta.lwBouche(t[1], b.zeta, v) };
  }

  // Un réseau (soufflage, ou reprise / extraction) : zones le long de la gaine principale, à leur distance du ventilateur
  function reseau(zones, e) {
    const rho = C.air(num(e.T, 20)).rho, alertes = [];
    const z = zones.map(x => ({ ...x, Q: num(x.Q), n: Math.max(1, Math.round(num(x.n, 1))), d: Math.max(0, num(x.distance)) })).filter(x => x.Q > 0).sort((a, b) => a.d - b.d);
    if (!z.length) return { zones: [], troncons: [], Q: 0, dp: 0, defav: null, alertes };
    // Gaine principale : un tronçon entre deux piquages, débit des zones en aval
    const troncons = [];
    let avant = 0;
    z.forEach((x, i) => {
      const L = x.d - avant, Q = z.slice(i).reduce((s, y) => s + y.Q, 0);
      if (L > 0 || i === 0) { const g = choisirGaine(Q, e, num(e.vmaxP, 6)); troncons.push({ rep: `Principal → ${x.rep}`, Q, L, ...g, dp: g.R * L + num(e.zetaP, 0.3) * g.pd }); }
      avant = x.d;
    });
    let cumul = 0;
    const amont = [];
    troncons.forEach(t => { cumul += t.dp; amont.push(cumul); });
    z.forEach(x => {
      x.bouche = choisirBouche(x.type, x.Q / x.n, rho);
      x.antenne = choisirGaine(x.Q, e, num(e.vmaxA, 4));
      x.dpA = x.antenne.R * num(x.L, 5) + num(x.zeta, 3) * x.antenne.pd;
      const k = troncons.findIndex(t => t.rep === `Principal → ${x.rep}`);
      x.dpPrincipal = k >= 0 ? amont[k] : amont[amont.length - 1] || 0;
      x.dpTotal = x.dpPrincipal + x.dpA + x.bouche.dp;
      if (x.bouche.v > x.bouche.b.vmax * 1.01) alertes.push(alerte('attention', `${x.rep} : ${x.n} bouche(s) insuffisante(s), vitesse au col ${nf(x.bouche.v, 1)} m/s (ajoutez des bouches).`));
    });
    const defav = z.reduce((m, x) => (!m || x.dpTotal > m.dpTotal ? x : m), null);
    return { zones: z, troncons, Q: z.reduce((s, x) => s + x.Q, 0), dp: defav.dpTotal, defav, alertes };
  }

  function calculer(e) {
    const P = PRODUCTEURS[e.producteur] || PRODUCTEURS['cta-df'], souffle = P[1], aspire = P[2], alertes = [];
    const zones = (e.zones || []).map((x, i) => ({ ...x, rep: String(x.rep || `Zone ${i + 1}`).trim(), reseau: RESEAUX[x.reseau] ? x.reseau : 'soufflage', type: BOUCHES[x.type] ? x.type : (x.reseau === 'soufflage' ? 'plafond' : 'extraction') }));
    const rS = reseau(souffle ? zones.filter(x => x.reseau === 'soufflage') : [], e), rR = reseau(aspire ? zones.filter(x => x.reseau !== 'soufflage') : [], e);
    alertes.push(...rS.alertes, ...rR.alertes);
    zones.filter(x => (x.reseau === 'soufflage' && !souffle) || (x.reseau !== 'soufflage' && !aspire)).forEach(x => alertes.push(alerte('attention', `${x.rep} : ${RESEAUX[x.reseau].toLowerCase()} sans ventilateur correspondant (${P[0]}).`)));
    // Composants de la CTA ou du caisson (pertes de charge usuelles, modifiables)
    const recup = (RECUPERATEURS[e.recuperateur] || RECUPERATEURS.aucun), dfx = e.producteur === 'cta-df';
    const compS = souffle ? [['Prise d\'air neuf, registre', num(e.dpPrise, 40)], ['Filtre air neuf', num(e.dpFiltreS, 150)], ...(dfx && recup[1] ? [[`${recup[0]} (air neuf)`, num(e.dpRecup, recup[1])]] : []),
      ...(e.batChaude === 'oui' ? [['Batterie chaude', num(e.dpBatC, 60)]] : []), ...(e.batFroide === 'oui' ? [['Batterie froide', num(e.dpBatF, 120)]] : []), ['Silencieux de soufflage', num(e.dpSil, 50)]] : [];
    const compR = aspire ? [['Filtre de reprise', dfx || e.producteur === 'cta-melange' ? num(e.dpFiltreR, 100) : 0], ...(dfx && recup[1] ? [[`${recup[0]} (air extrait)`, num(e.dpRecup, recup[1])]] : []), ['Silencieux', num(e.dpSil, 50)], ['Rejet, registre', num(e.dpRejet, 40)]].filter(c => c[1] > 0) : [];
    const sum = l => l.reduce((s, c) => s + c[1], 0), marge = num(e.marge, 10) / 100, eta = num(e.rendement, 60) / 100;
    const pS = (rS.dp + sum(compS)) * (1 + marge), pR = (rR.dp + sum(compR)) * (1 + marge);
    const PvS = rS.Q / 3600 * pS / eta, PvR = rR.Q / 3600 * pR / eta;
    const sfp = (PvS + PvR) / Math.max(rS.Q, rR.Q, 1) * 3600 / 1000;
    if (souffle && aspire && rS.Q && rR.Q && Math.abs(rS.Q - rR.Q) / rS.Q > 0.1) alertes.push(alerte('attention', `Débits soufflé ${nf(rS.Q, 0)} m³/h et repris ${nf(rR.Q, 0)} m³/h écartés de plus de 10 % : ${rS.Q > rR.Q ? 'locaux en surpression' : 'locaux en dépression'} (à justifier).`));
    if (!rS.Q && !rR.Q) alertes.push(alerte('erreur', 'Aucune zone avec un débit.'));
    if (sfp > 2.5) alertes.push(alerte('attention', `Puissance spécifique ${nf(sfp, 2)} kW/(m³/s) élevée (repère : ≤ 2 en double flux) : réduire les vitesses ou les pertes de charge.`));
    const ligneZ = x => [x.rep, RESEAUX[x.reseau], nf(x.Q, 0), `${x.n} × ${x.bouche.b.libelle} ${x.bouche.nom}`, nf(x.bouche.v, 1), nf(x.bouche.dp, 0), x.antenne.nom, nf(x.antenne.v, 1), nf(x.dpA, 0), nf(x.dpTotal, 0)];
    const ligneT = t => [t.rep, nf(t.Q, 0), t.nom, nf(t.L, 1), nf(t.v, 1), nf(t.R, 2), nf(t.dp, 0)];
    const titreS = { 'cta-df': 'Soufflage', 'cta-melange': 'Soufflage', 'cta-sf': 'Soufflage', insufflation: 'Insufflation' }[e.producteur] || 'Soufflage';
    return {
      valeurs: { Qs: rS.Q, Qr: rR.Q, pS, pR, PvS, PvR, sfp,
        troncons: [...rS.troncons, ...rR.troncons].map(t => ({ rep: t.rep, nom: t.nom, L: t.L })).concat([...rS.zones, ...rR.zones].map(x => ({ rep: `Antenne ${x.rep}`, nom: x.antenne.nom, L: num(x.L, 5) }))),
        producteur: e.producteur || 'cta-df',
        bouches: [...rS.zones, ...rR.zones].map(x => ({ local: x.rep, type: x.bouche.b.libelle, taille: x.bouche.nom, n: x.n })) },
      resume: [['Producteur', P[0]], ...(souffle ? [[`${titreS}`, `${nf(rS.Q, 0)} m³/h · ${nf(pS, 0)} Pa · ${nf(PvS / 1000, 2)} kW`]] : []),
        ...(aspire ? [[dfx || e.producteur === 'cta-melange' ? 'Reprise' : 'Extraction', `${nf(rR.Q, 0)} m³/h · ${nf(pR, 0)} Pa · ${nf(PvR / 1000, 2)} kW`]] : []),
        ['Puissance spécifique (SFP)', `${nf(sfp, 2)} kW/(m³/s)`], ['Bouches', `${[...rS.zones, ...rR.zones].reduce((s, x) => s + x.n, 0)} dans ${zones.length} zone(s)`],
        ...(rS.defav ? [['Zone la plus défavorisée au soufflage', `${rS.defav.rep} (${nf(rS.defav.dpTotal, 0)} Pa de réseau)`]] : []), ...(rR.defav ? [['Zone la plus défavorisée en reprise / extraction', `${rR.defav.rep} (${nf(rR.defav.dpTotal, 0)} Pa)`]] : [])],
      tableaux: [
        { titre: 'Zones et bouches (émetteurs)', entetes: ['Zone', 'Réseau', 'Q (m³/h)', 'Bouches', 'v col (m/s)', 'ΔP bouche (Pa)', 'Antenne', 'v (m/s)', 'ΔP antenne (Pa)', 'ΔP depuis le ventilateur (Pa)'], lignes: [...rS.zones, ...rR.zones].map(ligneZ) },
        ...(rS.troncons.length ? [{ titre: `Gaine principale de ${titreS.toLowerCase()}`, entetes: ['Tronçon', 'Q (m³/h)', 'Gaine (mm)', 'L (m)', 'v (m/s)', 'R (Pa/m)', 'ΔP (Pa)'], lignes: rS.troncons.map(ligneT) }] : []),
        ...(rR.troncons.length ? [{ titre: 'Gaine principale de reprise / extraction', entetes: ['Tronçon', 'Q (m³/h)', 'Gaine (mm)', 'L (m)', 'v (m/s)', 'R (Pa/m)', 'ΔP (Pa)'], lignes: rR.troncons.map(ligneT) }] : []),
        { titre: 'Ventilateurs', entetes: ['Ventilateur', 'Débit (m³/h)', 'Réseau (Pa)', 'Composants (Pa)', 'Pression avec marge (Pa)', 'Puissance absorbée (kW)'],
          lignes: [...(souffle ? [[titreS, nf(rS.Q, 0), nf(rS.dp, 0), `${nf(sum(compS), 0)} (${compS.map(c => c[0].toLowerCase()).join(', ')})`, nf(pS, 0), nf(PvS / 1000, 2)]] : []),
            ...(aspire ? [[dfx || e.producteur === 'cta-melange' ? 'Reprise' : 'Extraction', nf(rR.Q, 0), nf(rR.dp, 0), `${nf(sum(compR), 0)} (${compR.map(c => c[0].toLowerCase()).join(', ')})`, nf(pR, 0), nf(PvR / 1000, 2)]] : [])] },
      ],
      alertes,
      hypotheses: [`Air à ${nf(num(e.T, 20), 0)} °C ; gaines ${e.forme === 'rect' ? `rectangulaires de ${num(e.h, 300)} mm de hauteur` : 'circulaires'}, Darcy-Weisbach / Colebrook, singularités Σζ · ρv²/2.`,
        `Gaine principale : v ≤ ${nf(num(e.vmaxP, 6), 1)} m/s, antennes : v ≤ ${nf(num(e.vmaxA, 4), 1)} m/s, R ≤ ${nf(num(e.Rmax, 1), 2)} Pa/m ; principal découpé entre les piquages des zones, débit des zones en aval.`,
        'Bouches : gammes génériques, plus petite taille dont la vitesse au col reste sous la vitesse maximale de la gamme ; ΔP = ζ · ρv²/2 au col.',
        'Chemin le plus défavorisé : principal jusqu\'au piquage + antenne + bouche ; pression du ventilateur = réseau + composants de la CTA, avec la marge.',
        'Pertes de charge des composants : valeurs usuelles modifiables (filtres à mi-encrassement) ; à remplacer par celles du constructeur.'],
      synthese: `${P[0].split(' (')[0]} · ${souffle ? `${nf(rS.Q, 0)} m³/h soufflés` : ''}${souffle && aspire ? ' · ' : ''}${aspire ? `${nf(rR.Q, 0)} m³/h ${dfx || e.producteur === 'cta-melange' ? 'repris' : 'extraits'}` : ''} · SFP ${nf(sfp, 2)}`,
      schema: dessiner(e, P, rS, rR, { compS, compR, recup: dfx ? recup[0] : '', pS, pR }),
      titreSchema: 'Schéma de principe aéraulique',
    };
  }

  /* ---------- Dessin ---------- */
  function dessiner(e, P, rS, rR, o) {
    const out = [], COUL = { s: '#1f6fb2', r: '#c2410c', an: '#15803d', rej: '#6b7280' };
    const t = (x, y, s, opt = {}) => out.push(`<text x="${x}" y="${y}" font-size="${opt.fs || 10}" text-anchor="${opt.a || 'middle'}"${opt.b ? ' font-weight="bold"' : ''} fill="${opt.c || '#222'}">${String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`);
    const l = (x1, y1, x2, y2, c = '#222', w = 2) => out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"/>`);
    const r = (x, y, w, h, c = '#222') => out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="${c}" stroke-width="1.4"/>`);
    const fleche = (x, y, sens, c) => out.push(`<path d="M ${x} ${y} l ${-8 * sens} -5 l 0 10 z" fill="${c}"/>`);
    const pas = 140, n = Math.max(rS.zones.length, rR.zones.length, 1), yS = 340, yR = 150, H = 480;
    // Caisson du producteur : sections dans l'ordre de l'air (le récupérateur traverse les deux flux)
    const sections = (P[1] ? o.compS : o.compR).filter(c => !/silencieux|prise|rejet/i.test(c[0]));
    const largC = 40 + sections.length * 46 + 60, xV = 40 + largC - 26, xP = 40 + largC + 20, W = xP + n * pas + 40;
    r(40, yR - 50, largC, yS - yR + 100);
    t(40 + largC / 2, yR - 60, P[0].split(' (')[0], { b: true, fs: 12 });
    if (P[1]) l(40, yS, xV - 12, yS, COUL.s, 1);
    if (P[2]) l(40, yR, xV - 12, yR, COUL.r, 1);
    sections.forEach(([nom], i) => {
      const x = 60 + i * 46, court = nom.replace(/^(Filtre|Batterie|Échangeur|Roue|Boucle).*$/, m => m.split(' ')[0]).split(/[ ,(]/)[0].slice(0, 8);
      if (/récup|échangeur à plaques|roue|boucle/i.test(nom)) { r(x, yR - 18, 36, yS - yR + 36, '#7c3aed'); t(x + 18, (yR + yS) / 2, 'Récup.', { fs: 8, c: '#7c3aed' }); return; }
      const y = P[1] ? yS : yR;
      r(x, y - 16, 36, 32, P[1] ? COUL.s : COUL.r); t(x + 18, y + 4, court, { fs: 8 });
    });
    // Filtre de reprise d'une CTA (sur le flux du haut, avant le récupérateur)
    if (P[1] && P[2] && o.compR.some(c => /filtre/i.test(c[0]))) { r(60, yR - 16, 36, 32, COUL.r); t(78, yR + 4, 'Filtre', { fs: 8 }); }
    if (P[1]) {
      l(0, yS, 40, yS, COUL.an, 3); fleche(40, yS, 1, COUL.an); t(18, yS + 22, 'Air neuf', { c: COUL.an, fs: 9 });
      out.push(`<circle cx="${xV}" cy="${yS}" r="12" fill="#fff" stroke="${COUL.s}" stroke-width="1.6"/>`); t(xV, yS + 4, 'VS', { fs: 8, b: true });
      t(xV, yS + 30, `${nf(rS.Q, 0)} m³/h`, { fs: 9, c: COUL.s, b: true }); t(xV, yS + 42, `${nf(o.pS, 0)} Pa`, { fs: 8, c: COUL.s });
      l(xV + 12, yS, xP, yS, COUL.s, 4);
    }
    if (P[2]) {
      out.push(`<circle cx="${xV}" cy="${yR}" r="12" fill="#fff" stroke="${COUL.r}" stroke-width="1.6"/>`); t(xV, yR + 4, P[1] ? 'VR' : 'VE', { fs: 8, b: true });
      t(xV, yR - 30, `${nf(rR.Q, 0)} m³/h`, { fs: 9, c: COUL.r, b: true }); t(xV, yR - 18, `${nf(o.pR, 0)} Pa`, { fs: 8, c: COUL.r });
      l(0, yR, 40, yR, COUL.rej, 3); fleche(0, yR, -1, COUL.rej); t(18, yR - 10, 'Rejet', { c: COUL.rej, fs: 9 });
      l(xV + 12, yR, xP, yR, COUL.r, 4);
    }
    // Réseaux : gaine principale et piquages vers les zones
    const reseauDessin = (res, y, c, sens) => {
      if (!res.zones.length) return;
      const xFin = xP + res.zones.length * pas;
      l(xP, y, xFin, y, c, 4);
      res.troncons.forEach((tr, i) => t(xP + i * pas + pas / 2 - 30, sens > 0 ? y - 8 : y + 16, tr.nom, { fs: 8, c }));
      res.zones.forEach((z, i) => {
        const x = xP + (i + 1) * pas - 20, y2 = y + sens * 70;
        l(x, y, x, y2, c, 2); t(x + 6, y + sens * 36, z.antenne.nom, { a: 'start', fs: 8, c });
        for (let k = 0; k < Math.min(z.n, 4); k++) { const xb = x - 18 + k * 12; r(xb - 5, y2 + (sens > 0 ? 0 : -8), 10, 8, c); }
        t(x, y2 + sens * 22 + (sens > 0 ? 4 : 0), `${z.rep}`, { fs: 9, b: true });
        t(x, y2 + sens * 34 + (sens > 0 ? 4 : 0), `${nf(z.Q, 0)} m³/h · ${z.n} × ${z.bouche.nom}`, { fs: 8 });
      });
    };
    reseauDessin(rS, yS, COUL.s, 1);
    reseauDessin(rR, yR, COUL.r, -1);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>${out.join('')}</svg>`;
  }

  N.TYPES.aero = {
    titre: 'Schéma de principe aéraulique (CTA, extraction, bouches)', icone: '🌬️', famille: 'Schémas',
    description: 'Producteur (CTA double flux, simple flux, à mélange, caisson d\'extraction ou d\'insufflation) et émetteurs (bouches de soufflage, de reprise, d\'extraction par zone) : gaines dimensionnées, bouches choisies, chemin le plus défavorisé, pression et puissance des ventilateurs, schéma.',
    champs: [
      { g: 'Producteur' }, { k: 'titreInstallation', l: 'Installation', t: 't', d: 'CTA bureaux' },
      { k: 'producteur', l: 'Producteur', t: 's', o: Object.entries(PRODUCTEURS).map(([k, v]) => [k, v[0]]), d: 'cta-df' },
      { k: 'recuperateur', l: 'Récupérateur de chaleur', t: 's', o: Object.entries(RECUPERATEURS).map(([k, v]) => [k, v[0]]), d: 'plaques', si: e => e.producteur === 'cta-df' },
      { k: 'batChaude', l: 'Batterie chaude', t: 's', o: [['oui', 'Oui'], ['non', 'Non']], d: 'oui', si: e => !['extraction'].includes(e.producteur) },
      { k: 'batFroide', l: 'Batterie froide', t: 's', o: [['oui', 'Oui'], ['non', 'Non']], d: 'non', si: e => !['extraction'].includes(e.producteur) },
      { g: 'Gaines' }, { k: 'T', l: 'Température de l\'air', u: '°C', d: 20 },
      { k: 'materiau', l: 'Matériau', t: 's', o: Object.entries(D.RUGOSITE_GAINE).map(([k, v]) => [k, v[0]]), d: 'galva' },
      { k: 'forme', l: 'Forme', t: 's', o: [['rond', 'Circulaires'], ['rect', 'Rectangulaires (hauteur imposée)']], d: 'rond' },
      { k: 'h', l: 'Hauteur des gaines rectangulaires', u: 'mm', d: 300, si: e => e.forme === 'rect' },
      { k: 'vmaxP', l: 'Vitesse maxi dans la gaine principale', u: 'm/s', d: 6 }, { k: 'vmaxA', l: 'Vitesse maxi dans les antennes', u: 'm/s', d: 4 },
      { k: 'Rmax', l: 'Perte de charge linéique maxi', u: 'Pa/m', d: 1 }, { k: 'zetaP', l: 'Σζ par tronçon de la gaine principale', d: 0.3 },
      { g: 'Zones et bouches (émetteurs)' },
      { k: 'zones', l: 'Zones (distance : longueur de gaine principale du ventilateur jusqu\'au piquage de la zone)', t: 'lignes', d: [
        { rep: 'Bureaux R+1', reseau: 'soufflage', type: 'plafond', n: 8, Q: 1600, distance: 10, L: 12, zeta: 3 },
        { rep: 'Salle de réunion', reseau: 'soufflage', type: 'helico', n: 4, Q: 900, distance: 25, L: 8, zeta: 3 },
        { rep: 'Accueil', reseau: 'soufflage', type: 'grille', n: 2, Q: 500, distance: 35, L: 6, zeta: 3 },
        { rep: 'Bureaux R+1 (reprise)', reseau: 'reprise', type: 'extraction', n: 4, Q: 1500, distance: 10, L: 10, zeta: 3 },
        { rep: 'Sanitaires', reseau: 'extraction', type: 'extraction', n: 6, Q: 450, distance: 20, L: 8, zeta: 3 },
        { rep: 'Salle de réunion (reprise)', reseau: 'reprise', type: 'extraction', n: 2, Q: 950, distance: 25, L: 6, zeta: 3 }],
        colonnes: [{ k: 'rep', l: 'Zone', t: 't' }, { k: 'reseau', l: 'Réseau', t: 's', o: Object.entries(RESEAUX) }, { k: 'type', l: 'Bouches', t: 's', o: Object.entries(BOUCHES).map(([k, b]) => [k, b.libelle]) },
          { k: 'n', l: 'Nombre de bouches' }, { k: 'Q', l: 'Débit de la zone (m³/h)' }, { k: 'distance', l: 'Distance au ventilateur (m)' }, { k: 'L', l: 'Longueur de l\'antenne (m)' }, { k: 'zeta', l: 'Σζ de l\'antenne' }] },
      { g: 'Composants et ventilateurs' },
      { k: 'dpPrise', l: 'Prise d\'air neuf', u: 'Pa', d: 40, si: e => e.producteur !== 'extraction' }, { k: 'dpFiltreS', l: 'Filtre air neuf (mi-encrassement)', u: 'Pa', d: 150, si: e => e.producteur !== 'extraction' },
      { k: 'dpFiltreR', l: 'Filtre de reprise', u: 'Pa', d: 100, si: e => ['cta-df', 'cta-melange'].includes(e.producteur) },
      { k: 'dpRecup', l: 'Récupérateur (par flux)', u: 'Pa', d: '', si: e => e.producteur === 'cta-df' },
      { k: 'dpBatC', l: 'Batterie chaude', u: 'Pa', d: 60, si: e => e.batChaude === 'oui' && e.producteur !== 'extraction' }, { k: 'dpBatF', l: 'Batterie froide', u: 'Pa', d: 120, si: e => e.batFroide === 'oui' && e.producteur !== 'extraction' },
      { k: 'dpSil', l: 'Silencieux (par réseau)', u: 'Pa', d: 50 }, { k: 'dpRejet', l: 'Rejet', u: 'Pa', d: 40, si: e => e.producteur !== 'cta-sf' && e.producteur !== 'insufflation' },
      { k: 'marge', l: 'Marge de sécurité', u: '%', d: 10 }, { k: 'rendement', l: 'Rendement global des ventilateurs', u: '%', d: 60 },
    ],
    calcul: calculer,
  };
  return { PRODUCTEURS, RECUPERATEURS, RESEAUX, calculer, choisirGaine, choisirBouche };
})(typeof Donnees !== 'undefined' ? Donnees : require('./donnees'), typeof Calculs !== 'undefined' ? Calculs : require('./calculs'), typeof Notes !== 'undefined' ? Notes : require('./notes'), typeof Cta !== 'undefined' ? Cta : require('./cta'));
if (typeof module !== 'undefined') module.exports = SchemaAir;
