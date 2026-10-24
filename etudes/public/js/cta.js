// Aéraulique complète : centrale de traitement d'air (psychrométrie des batteries, récupérateur, ventilateurs, schéma de principe),
// sélection des bouches de soufflage et d'extraction, bilan acoustique simple d'un local.
const Cta = ((D, C, N) => {
  const { nf, num } = N;
  const alerte = (niveau, texte) => ({ niveau, texte });
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const log10 = Math.log10;

  /* ---------- Psychrométrie (air humide, pression atmosphérique normale) ---------- */
  const P0 = 101325;
  const pws = T => 610.94 * Math.exp(17.625 * T / (T + 243.04)); // Pa, formule de Magnus
  const xDe = (T, HR, p = P0) => { const pv = pws(T) * HR / 100; return 0.622 * pv / (p - pv); }; // kg/kg air sec
  const hDe = (T, x) => 1.006 * T + x * (2501 + 1.86 * T); // kJ/kg air sec
  const HRde = (T, x, p = P0) => Math.min(100, x * p / (0.622 + x) / pws(T) * 100);
  const TdeH = (h, x) => (h - 2501 * x) / (1.006 + 1.86 * x);
  const etat = (T, x) => ({ T, x, h: hDe(T, x), HR: HRde(T, x) });
  const melange = (a, b, fa) => { const x = fa * a.x + (1 - fa) * b.x, h = fa * a.h + (1 - fa) * b.h; return etat(TdeH(h, x), x); };
  const masseAir = (Q, T) => Q / 3600 * P0 / (287.05 * (T + 273.15)); // kg/s

  const RECUP = { aucun: ['Sans récupérateur', 0], plaques: ['Échangeur à plaques à contre-courant', 75], roue: ['Roue rotative', 80], glycol: ['Batteries à eau glycolée (boucle)', 50] };
  const CATEGORIES_SFP = [[500, 'SFP 1'], [750, 'SFP 2'], [1250, 'SFP 3'], [2000, 'SFP 4'], [3000, 'SFP 5'], [4500, 'SFP 6'], [Infinity, 'SFP 7']];

  N.TYPES.cta = {
    titre: 'Centrale de traitement d\'air', icone: '🏭', famille: 'Aéraulique',
    description: 'Schéma de principe de la CTA, évolutions de l\'air hiver et été, puissances et débits d\'eau des batteries, récupérateur, humidification, ventilateurs et SFP.',
    champs: [{ g: 'Centrale' },
      { k: 'type', l: 'Type de centrale', t: 's', o: [['double', 'Double flux tout air neuf'], ['melange', 'Air neuf et air recyclé (caisson de mélange)'], ['simple', 'Soufflage seul tout air neuf']], d: 'double' },
      { k: 'Qs', l: 'Débit d\'air soufflé', u: 'm³/h', d: 6000 }, { k: 'Qr', l: 'Débit d\'air repris', u: 'm³/h', d: 6000, si: e => e.type !== 'simple' },
      { k: 'pAN', l: 'Part d\'air neuf', u: '%', d: 30, si: e => e.type === 'melange' },
      { k: 'recup', l: 'Récupérateur de chaleur', t: 's', o: e => Object.entries(RECUP).filter(([k]) => e.type === 'double' || k === 'aucun').map(([k, r]) => [k, r[0]]), d: 'plaques', si: e => e.type === 'double' },
      { k: 'eta', l: 'Efficacité du récupérateur (vide : valeur courante du type)', u: '%', d: '', si: e => e.type === 'double' && e.recup !== 'aucun' },
      { k: 'vf', l: 'Vitesse frontale des batteries', u: 'm/s', d: 2.5 },
      { g: 'Conditions d\'hiver' }, { k: 'TeH', l: 'Température extérieure de base', u: '°C', d: -7 }, { k: 'HReH', l: 'Humidité relative extérieure', u: '%', d: 90 },
      { k: 'TiH', l: 'Température intérieure (reprise)', u: '°C', d: 20 }, { k: 'HRiH', l: 'Humidité relative intérieure (reprise)', u: '%', d: 35 },
      { k: 'TsH', l: 'Température de soufflage', u: '°C', d: 20 },
      { k: 'humid', l: 'Humidification', t: 's', o: [['aucune', 'Aucune'], ['vapeur', 'Humidificateur vapeur']], d: 'aucune' },
      { k: 'HRmin', l: 'Humidité relative intérieure à tenir', u: '%', d: 40, si: e => e.humid === 'vapeur' },
      { g: 'Conditions d\'été' }, { k: 'TeE', l: 'Température extérieure de base', u: '°C', d: 32 }, { k: 'HReE', l: 'Humidité relative extérieure', u: '%', d: 40 },
      { k: 'TiE', l: 'Température intérieure (reprise)', u: '°C', d: 26 }, { k: 'HRiE', l: 'Humidité relative intérieure (reprise)', u: '%', d: 50 },
      { k: 'TsE', l: 'Température de soufflage', u: '°C', d: 16 }, { k: 'froid', l: 'Batterie froide', t: 's', o: [['oui', 'Oui (eau glacée)'], ['non', 'Non']], d: 'oui' },
      { g: 'Régimes d\'eau' }, { k: 'TcAller', l: 'Batterie chaude : départ', u: '°C', d: 70 }, { k: 'TcRetour', l: 'Batterie chaude : retour', u: '°C', d: 50 },
      { k: 'TfAller', l: 'Batterie froide : départ', u: '°C', d: 7, si: e => e.froid !== 'non' }, { k: 'TfRetour', l: 'Batterie froide : retour', u: '°C', d: 12, si: e => e.froid !== 'non' },
      { g: 'Pertes de charge et ventilateurs' },
      { k: 'dpReseauS', l: 'Réseau de soufflage (hors CTA)', u: 'Pa', d: 250 }, { k: 'dpReseauR', l: 'Réseau de reprise (hors CTA)', u: 'Pa', d: 200, si: e => e.type !== 'simple' },
      { k: 'dpFiltreAN', l: 'Filtre d\'air neuf ePM1 (F7), perte moyenne', u: 'Pa', d: 150 }, { k: 'dpFiltreR', l: 'Filtre de reprise ePM10 (M5), perte moyenne', u: 'Pa', d: 100, si: e => e.type !== 'simple' },
      { k: 'dpRecup', l: 'Récupérateur (par flux)', u: 'Pa', d: 150, si: e => e.type === 'double' && e.recup !== 'aucun' },
      { k: 'dpBC', l: 'Batterie chaude', u: 'Pa', d: 60 }, { k: 'dpBF', l: 'Batterie froide (humide)', u: 'Pa', d: 120, si: e => e.froid !== 'non' },
      { k: 'dpDivers', l: 'Caissons, silencieux, volets', u: 'Pa', d: 80 }, { k: 'rendement', l: 'Rendement global des ventilateurs', u: '%', d: 60 }],
    calcul(e) {
      const alertes = [], type = e.type || 'double', Qs = num(e.Qs), Qr = type === 'simple' ? 0 : num(e.Qr, Qs);
      const recup = type === 'double' ? (RECUP[e.recup] ? e.recup : 'plaques') : 'aucun', eta = recup === 'aucun' ? 0 : (e.eta === '' || e.eta === undefined ? RECUP[recup][1] : num(e.eta)) / 100;
      const fAN = type === 'melange' ? Math.min(1, Math.max(0, num(e.pAN, 30) / 100)) : 1, froid = e.froid !== 'non';
      const saison = (Te, HRe, Ti, HRi, Ts, hiver) => {
        const E = etat(Te, xDe(Te, HRe)), R = etat(Ti, xDe(Ti, HRi)), pts = [['Air neuf extérieur', E]];
        // Récupérateur sensible (rapport des débits pris en compte pour la température rejetée)
        let A = E, rejet = null;
        if (eta > 0) {
          A = etat(Te + eta * (Ti - Te), E.x); pts.push(['Après récupérateur', A]);
          const mS = masseAir(Qs, Te), mR = masseAir(Qr, Ti), Tr = Ti - mS / Math.max(mR, 1e-9) * (A.T - Te);
          rejet = etat(Tr, Math.min(R.x, xDe(Tr, 100)));
        }
        if (type === 'melange') { A = melange(A, R, fAN); pts.push([`Mélange (${nf(fAN * 100, 0)} % d'air neuf)`, A]); }
        const m = masseAir(Qs, A.T); let P = 0, cond = 0, vapeur = 0, B = A;
        if (hiver) {
          if (Ts > A.T) { B = etat(Ts, A.x); P = m * (B.h - A.h); pts.push(['Après batterie chaude', B]); }
          if (e.humid === 'vapeur') { const xc = xDe(Ti, num(e.HRmin, 40)); if (xc > B.x) { vapeur = m * (xc - B.x) * 3600; B = etat(B.T, xc); pts.push(['Après humidificateur', B]); } }
        } else if (froid && Ts < A.T) {
          const xs = Math.min(A.x, xDe(Ts, 95)); B = etat(Ts, xs); P = m * (A.h - B.h); cond = m * (A.x - xs) * 3600; pts.push(['Après batterie froide', B]);
        }
        return { E, R, pts, soufflage: B, P, cond, vapeur, rejet, m, avantBatterie: A };
      };
      const H = saison(num(e.TeH, -7), num(e.HReH, 90), num(e.TiH, 20), num(e.HRiH, 35), num(e.TsH, 20), true);
      const S = saison(num(e.TeE, 32), num(e.HReE, 40), num(e.TiE, 26), num(e.HRiE, 50), num(e.TsE, 16), false);
      const eauC = C.eau((num(e.TcAller, 70) + num(e.TcRetour, 50)) / 2), dTc = num(e.TcAller, 70) - num(e.TcRetour, 50);
      const eauF = C.eau((num(e.TfAller, 7) + num(e.TfRetour, 12)) / 2), dTf = num(e.TfRetour, 12) - num(e.TfAller, 7);
      const QwC = dTc > 0 ? H.P * 1000 / (eauC.rho * eauC.cp * dTc) * 3600 : NaN, QwF = dTf > 0 ? S.P * 1000 / (eauF.rho * eauF.cp * dTf) * 3600 : NaN;
      const Sf = Qs / 3600 / num(e.vf, 2.5);
      // Ventilateurs
      const dpS = num(e.dpReseauS) + num(e.dpFiltreAN) + (recup !== 'aucun' ? num(e.dpRecup) : 0) + num(e.dpBC) + (froid ? num(e.dpBF) : 0) + (e.humid === 'vapeur' ? 30 : 0) + num(e.dpDivers);
      const dpR = type === 'simple' ? 0 : num(e.dpReseauR) + num(e.dpFiltreR) + (recup !== 'aucun' ? num(e.dpRecup) : 0) + num(e.dpDivers) / 2;
      const eta_v = num(e.rendement, 60) / 100, PvS = Qs / 3600 * dpS / eta_v, PvR = Qr / 3600 * dpR / eta_v;
      const sfpS = PvS / Math.max(Qs / 3600, 1e-9), sfpR = Qr ? PvR / (Qr / 3600) : 0, sfp = (PvS + PvR) / Math.max(Qs / 3600, 1e-9);
      const cat = v => CATEGORIES_SFP.find(([l]) => v <= l)[1];
      // Contrôles
      if (!(Qs > 0)) alertes.push(alerte('erreur', 'Débit d\'air soufflé à saisir.'));
      if (type === 'double' && recup !== 'aucun' && eta < (recup === 'glycol' ? 0.68 : 0.73)) alertes.push(alerte('attention', `Efficacité du récupérateur ${nf(eta * 100, 0)} % inférieure au minimum de l'écoconception (règlement UE 1253/2014 : 73 %, 68 % pour une boucle à eau glycolée).`));
      if (type === 'double' && recup === 'aucun') alertes.push(alerte('attention', 'Centrale double flux sans récupérateur : un récupérateur est exigé par le règlement UE 1253/2014 pour les unités de ventilation double flux.'));
      if (H.rejet && H.rejet.T < 1) alertes.push(alerte('attention', `Air rejeté à ${nf(H.rejet.T, 1)} °C en hiver : risque de givre dans le récupérateur, prévoir un by-pass modulant ou une batterie de préchauffage.`));
      if (type === 'double' && Qr && Math.abs(Qr - Qs) / Qs > 0.15) alertes.push(alerte('attention', `Débits soufflé et repris déséquilibrés de ${nf(Math.abs(Qr - Qs) / Qs * 100, 0)} % : vérifier la mise en pression des locaux.`));
      if (H.avantBatterie.T < 3 && num(e.TcAller, 70) > 0) alertes.push(alerte('attention', `Air à ${nf(H.avantBatterie.T, 1)} °C à l'entrée de la batterie chaude : thermostat antigel, pompe de batterie et vanne trois voies (ou eau glycolée).`));
      if (!froid && S.avantBatterie.T > num(e.TsE, 16) + 1) alertes.push(alerte('attention', `Sans batterie froide, l'air est soufflé à ${nf(S.avantBatterie.T, 1)} °C en été.`));
      if (froid && S.cond > 0) alertes.push(alerte('attention', `Batterie froide en régime humide (${nf(S.cond, 1)} kg/h de condensats) : bac de condensats inox, siphon dimensionné à la dépression du caisson, pare-gouttelettes si v > 2,5 m/s.`));
      if (num(e.vf, 2.5) > 2.8) alertes.push(alerte('attention', 'Vitesse frontale élevée : pertes de charge, bruit et entraînement de gouttelettes sur la batterie froide.'));
      if (sfpS > 2000) alertes.push(alerte('attention', `Puissance spécifique du ventilateur de soufflage ${nf(sfpS, 0)} W/(m³/s) (${cat(sfpS)}) : réduire les pertes de charge ou la vitesse frontale.`));
      alertes.push(alerte('ok', `Batterie chaude ${nf(H.P, 1)} kW${froid ? `, batterie froide ${nf(S.P, 1)} kW` : ''} ; ventilateurs ${nf((PvS + PvR) / 1000, 2)} kW, SFP ${nf(sfp, 0)} W/(m³/s).`));
      const lig = (nom, s) => [nom, nf(s.T, 1), nf(s.HR, 0), nf(s.x * 1000, 2), nf(s.h, 1)];
      return {
        valeurs: { Pchaud: H.P, Pfroid: S.P, QwC, QwF, condensats: S.cond, vapeur: H.vapeur, PvS, PvR, sfp, sfpS, sfpR, dpS, dpR, Sf, eta, hiver: H.pts.map(p => p[1]), ete: S.pts.map(p => p[1]) },
        resume: [['Débit soufflé / repris', `${nf(Qs, 0)} / ${nf(Qr, 0)} m³/h`], ...(eta ? [['Récupérateur', `${RECUP[recup][0]}, efficacité ${nf(eta * 100, 0)} %`]] : []),
          ['Batterie chaude', `${nf(H.P, 1)} kW · ${nf(QwC, 2)} m³/h d'eau (${nf(num(e.TcAller, 70), 0)}/${nf(num(e.TcRetour, 50), 0)} °C)`],
          ...(froid ? [['Batterie froide', `${nf(S.P, 1)} kW · ${nf(QwF, 2)} m³/h d'eau (${nf(num(e.TfAller, 7), 0)}/${nf(num(e.TfRetour, 12), 0)} °C)`], ['Condensats', `${nf(S.cond, 1)} kg/h`]] : []),
          ...(H.vapeur ? [['Humidificateur', `${nf(H.vapeur, 1)} kg/h de vapeur`]] : []),
          ['Section frontale des batteries', `${nf(Sf, 2)} m² (${nf(num(e.vf, 2.5), 1)} m/s)`],
          ['Ventilateur de soufflage', `${nf(dpS, 0)} Pa · ${nf(PvS / 1000, 2)} kW · ${cat(sfpS)}`], ...(Qr ? [['Ventilateur de reprise', `${nf(dpR, 0)} Pa · ${nf(PvR / 1000, 2)} kW · ${cat(sfpR)}`]] : []),
          ['SFP de la centrale', `${nf(sfp, 0)} W/(m³/s)`]],
        tableaux: [{ titre: 'Évolution de l\'air en hiver', entetes: ['Point', 'T (°C)', 'HR (%)', 'x (g/kg)', 'h (kJ/kg)'], lignes: [...H.pts.map(([n, s]) => lig(n, s)), ...(H.rejet ? [lig('Air rejeté', H.rejet)] : [])] },
          { titre: 'Évolution de l\'air en été', entetes: ['Point', 'T (°C)', 'HR (%)', 'x (g/kg)', 'h (kJ/kg)'], lignes: S.pts.map(([n, s]) => lig(n, s)) },
          { titre: 'Pertes de charge des ventilateurs (Pa)', entetes: ['Poste', 'Soufflage', 'Reprise'], lignes: [
            ['Réseau extérieur à la CTA', nf(num(e.dpReseauS), 0), type === 'simple' ? '—' : nf(num(e.dpReseauR), 0)], ['Filtres', nf(num(e.dpFiltreAN), 0), type === 'simple' ? '—' : nf(num(e.dpFiltreR), 0)],
            ...(recup !== 'aucun' ? [['Récupérateur', nf(num(e.dpRecup), 0), nf(num(e.dpRecup), 0)]] : []), ['Batteries et humidificateur', nf(num(e.dpBC) + (froid ? num(e.dpBF) : 0) + (e.humid === 'vapeur' ? 30 : 0), 0), '—'],
            ['Caissons, silencieux, volets', nf(num(e.dpDivers), 0), type === 'simple' ? '—' : nf(num(e.dpDivers) / 2, 0)], ['Total', nf(dpS, 0), type === 'simple' ? '—' : nf(dpR, 0)]], total: true }],
        alertes,
        hypotheses: ['Air humide à 101 325 Pa : pression de vapeur saturante par la formule de Magnus, x = 0,622 · pv / (p − pv), h = 1,006 · T + x · (2 501 + 1,86 · T).',
          'Récupérateur : efficacité sensible appliquée côté air neuf ; humidité de l\'air neuf inchangée (pas de transfert d\'humidité).',
          'Batterie froide : air en sortie à la température de soufflage, humidité relative limitée à 95 % (déshumidification si le point de rosée de l\'air entrant est supérieur).',
          'Puissance absorbée d\'un ventilateur = débit × perte de charge totale / rendement global ; SFP selon NF EN 16798-3 (catégories 1 à 7).'],
        synthese: `${nf(Qs, 0)} m³/h · BC ${nf(H.P, 0)} kW${froid ? ` · BF ${nf(S.P, 0)} kW` : ''} · SFP ${nf(sfp, 0)}`,
        schema: dessinerCta(e, { type, recup, froid, H, S, Qs, Qr }),
      };
    },
  };

  /* ---------- Schéma de principe de la CTA ---------- */
  function dessinerCta(e, { type, recup, froid, H, S, Qs, Qr }) {
    const out = [], c = '#1f2937', bleu = '#2563eb', rouge = '#c0392b', vert = '#15803d';
    const R = (x, y, w, h, col = c) => out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="${col}" stroke-width="1.5"/>`);
    const L = (x1, y1, x2, y2, col = c, w = 1.2) => out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}"/>`);
    const T = (x, y, t, o = {}) => out.push(`<text x="${x}" y="${y}" font-size="${o.fs || 10}" fill="${o.c || c}" text-anchor="${o.a || 'middle'}"${o.b ? ' font-weight="bold"' : ''}>${esc(t)}</text>`);
    const fleche = (x, y, sens, col) => out.push(`<path d="M${x} ${y} L${x - 9 * sens} ${y - 5} L${x - 9 * sens} ${y + 5} Z" fill="${col}" stroke="${col}"/>`);
    const W = 80, Hc = 70, yS = type === 'simple' ? 60 : 170, yR = 60, x0 = 110;
    const caisson = (x, y, sym, lib, col, sens = 1) => {
      R(x, y, W, Hc);
      const cx = x + W / 2, cy = y + Hc / 2;
      if (sym === 'filtre') out.push(`<path d="M${cx - 10} ${y + 8} L${cx + 10} ${y + 18} L${cx - 10} ${y + 28} L${cx + 10} ${y + 38} L${cx - 10} ${y + 48} L${cx + 10} ${y + 58}" fill="none" stroke="${c}" stroke-width="1.2"/>`);
      if (sym === 'batterie') { L(x + 12, y + Hc - 8, x + W - 12, y + 8, col, 2); T(cx + 18, cy + 18, col === rouge ? '+' : '−', { fs: 18, c: col, b: true }); }
      if (sym === 'ventilo') out.push(`<circle cx="${cx}" cy="${cy}" r="18" fill="#fff" stroke="${c}" stroke-width="1.5"/><path d="M${cx - 9 * sens} ${cy - 11} L${cx + 13 * sens} ${cy} L${cx - 9 * sens} ${cy + 11} Z" fill="none" stroke="${c}" stroke-width="1.2"/>`);
      if (sym === 'volet') { L(cx - 14, cy - 14, cx + 14, cy + 14, c, 2); out.push(`<circle cx="${cx}" cy="${cy}" r="3" fill="${c}" stroke="${c}"/>`); }
      if (sym === 'humid') for (let k = 0; k < 3; k++) out.push(`<circle cx="${cx - 12 + k * 12}" cy="${cy}" r="3" fill="${bleu}" stroke="${bleu}"/>`);
      if (sym === 'silencieux') for (let k = 0; k < 3; k++) R(x + 16 + k * 18, y + 10, 8, Hc - 20);
      T(cx, y + Hc + 13, lib, { fs: 9 });
    };
    const etatTxt = (x, y, s, coul) => { T(x, y, `${nf(s.T, 1)} °C · ${nf(s.HR, 0)} %`, { fs: 9, c: coul }); };
    // Ligne de soufflage
    const sousf = [['volet', 'Volet air neuf'], ['filtre', 'Filtre ePM1'], ...(recup !== 'aucun' ? [['recup', '']] : []), ...(type === 'melange' ? [['melange', '']] : []),
      ['batterie-c', 'Batterie chaude'], ...(froid ? [['batterie-f', 'Batterie froide']] : []), ...(e.humid === 'vapeur' ? [['humid', 'Humidificateur']] : []), ['ventilo', 'Ventilateur'], ['silencieux', 'Silencieux']];
    let x = x0;
    const xRecup = {};
    L(20, yS + Hc / 2, x0, yS + Hc / 2, bleu, 2.5); fleche(x0 - 2, yS + Hc / 2, 1, bleu); T(48, yS + Hc / 2 - 10, 'Air neuf', { fs: 10, b: true });
    etatTxt(55, yS + Hc / 2 + 18, H.pts[0][1], rouge); etatTxt(55, yS + Hc / 2 + 30, S.pts[0][1], bleu);
    for (const [sym, lib] of sousf) {
      if (sym === 'recup' || sym === 'melange') {
        xRecup[sym] = x;
        const h2 = yS + Hc - yR;
        R(x, yR, W, h2);
        if (sym === 'recup') { L(x, yR, x + W, yR + h2); L(x, yR + h2, x + W, yR); T(x + W / 2, yR + h2 + 13, RECUP[recup][0].replace(/ à contre-courant| \(boucle\)/, ''), { fs: 9 }); }
        else { L(x + W / 2, yR + Hc, x + W / 2, yS); out.push(`<path d="M${x + W / 2 - 14} ${yR + Hc + 30} L${x + W / 2 + 14} ${yR + Hc + 58}" stroke="${c}" stroke-width="2"/>`); T(x + W / 2, yR + h2 + 13, 'Caisson de mélange', { fs: 9 }); }
      } else caisson(x, yS, sym.replace(/-.*/, ''), lib, sym === 'batterie-c' ? rouge : vert);
      x += W + 14;
      if (x - 14 < x0 + 10000) L(x - 14, yS + Hc / 2, x, yS + Hc / 2, bleu, 2.5);
    }
    const xFin = x - 14;
    L(xFin, yS + Hc / 2, xFin + 60, yS + Hc / 2, bleu, 2.5); fleche(xFin + 62, yS + Hc / 2, 1, bleu); T(xFin + 40, yS + Hc / 2 - 10, 'Soufflage', { fs: 10, b: true });
    T(xFin + 40, yS + Hc / 2 + 18, `${nf(Qs, 0)} m³/h`, { fs: 9 }); etatTxt(xFin + 40, yS + Hc / 2 + 30, H.soufflage, rouge); etatTxt(xFin + 40, yS + Hc / 2 + 42, S.soufflage, bleu);
    // Ligne de reprise (droite → gauche)
    if (type !== 'simple') {
      const xr0 = xRecup.recup || xRecup.melange;
      const rep = [['filtre', 'Filtre ePM10'], ['ventilo', 'Ventilateur'], ['silencieux', 'Silencieux']];
      let xr = xFin - W;
      L(xFin, yR + Hc / 2, xFin + 60, yR + Hc / 2, '#7c3aed', 2.5); fleche(xFin + 2, yR + Hc / 2, -1, '#7c3aed'); T(xFin + 40, yR + Hc / 2 - 10, 'Reprise', { fs: 10, b: true });
      T(xFin + 40, yR + Hc / 2 + 18, `${nf(Qr, 0)} m³/h`, { fs: 9 });
      for (const [sym, lib] of rep.reverse()) { if (xr0 !== undefined && xr <= xr0 + W) break; caisson(xr, yR, sym, lib, c, -1); L(xr + W, yR + Hc / 2, xr + W + 14, yR + Hc / 2, '#7c3aed', 2.5); xr -= W + 14; }
      if (xr0 !== undefined) L(xr0 + W, yR + Hc / 2, xr + W + 14, yR + Hc / 2, '#7c3aed', 2.5);
      if (type === 'double' || type === 'melange') {
        const xg = xr0 !== undefined ? xr0 : x0;
        L(20, yR + Hc / 2, xg, yR + Hc / 2, '#7c3aed', 2.5); fleche(18, yR + Hc / 2, -1, '#7c3aed'); T(48, yR + Hc / 2 - 10, 'Rejet', { fs: 10, b: true });
        if (H.rejet) etatTxt(55, yR + Hc / 2 + 18, H.rejet, rouge);
      }
    }
    const Wt = xFin + 130, Ht = yS + Hc + 70;
    T(14, Ht - 10, 'États de l\'air : hiver en rouge, été en bleu (température sèche · humidité relative).', { fs: 9, a: 'start' });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${Wt}" height="${Ht}" viewBox="0 0 ${Wt} ${Ht}"><rect width="${Wt}" height="${Ht}" fill="#fff"/>${out.join('')}</svg>`;
  }

  /* ---------- Bouches de soufflage et d'extraction ---------- */
  // Gammes génériques : [désignation, aire de passage (m²)] ; ζ rapporté à la vitesse dans le col ; K constante de jet ; vmax au col
  const ronde = d => Math.PI * (d / 1000) ** 2 / 4;
  const BOUCHES = {
    plafond: { libelle: 'Diffuseur plafond carré 4 directions', zeta: 3.5, K: 1.4, vmax: 3.5, tailles: [160, 200, 250, 315, 400].map(d => [`col Ø ${d}`, ronde(d)]) },
    helico: { libelle: 'Diffuseur à jet hélicoïdal', zeta: 6, K: 1.1, vmax: 4, tailles: [[300, 160], [400, 200], [500, 250], [600, 315], [625, 355]].map(([p, d]) => [`${p} × ${p} (col Ø ${d})`, ronde(d)]) },
    grille: { libelle: 'Grille murale de soufflage double déflexion', zeta: 2.5, K: 5, vmax: 3, tailles: [[300, 100], [400, 150], [500, 200], [600, 200], [800, 300], [1000, 300]].map(([l, h]) => [`${l} × ${h}`, 0.7 * l * h / 1e6]) },
    extraction: { libelle: 'Grille ou bouche d\'extraction', zeta: 2, K: 0, vmax: 2.5, tailles: [[200, 100], [300, 100], [300, 150], [400, 150], [500, 200], [600, 300]].map(([l, h]) => [`${l} × ${h}`, 0.7 * l * h / 1e6]) },
  };
  // Puissance acoustique d'une bouche (formule empirique de la littérature allemande), dB(A)
  const lwBouche = (A, zeta, v) => 10 + 10 * log10(A) + 30 * log10(zeta) + 60 * log10(Math.max(v, 0.1));
  // Terme de local : aire d'absorption équivalente A = 0,16 · V / Tr (Sabine)
  const termeLocal = (S, h, Tr, r = 1.5, Qd = 2) => { const A = 0.16 * S * h / Math.max(Tr, 0.1); return { A, d: 10 * log10(Qd / (4 * Math.PI * r * r) + 4 / A) }; };

  N.TYPES.bouches = {
    titre: 'Sélection des bouches de soufflage et d\'extraction', icone: '🌬️', famille: 'Aéraulique',
    description: 'Taille, vitesse au col, perte de charge, portée du jet et niveau sonore de chaque bouche, local par local.',
    champs: [{ g: 'Locaux' }, { k: 'h', l: 'Hauteur sous plafond', u: 'm', d: 2.7 }, { k: 'Tr', l: 'Durée de réverbération des locaux', u: 's', d: 0.6 },
      { k: 'vt', l: 'Vitesse terminale de la portée', u: 'm/s', d: 0.25 },
      { k: 'locaux', l: 'Bouches par local', t: 'lignes', d: [
        { local: 'Bureau 1', S: 20, Q: 120, n: 1, type: 'plafond', portee: 1.5, LpMax: 35 },
        { local: 'Open space', S: 120, Q: 1200, n: 6, type: 'helico', portee: 2, LpMax: 40 },
        { local: 'Salle de réunion', S: 40, Q: 600, n: 2, type: 'plafond', portee: 3, LpMax: 35 },
        { local: 'Atelier', S: 300, Q: 3000, n: 4, type: 'grille', portee: 12, LpMax: 55 },
        { local: 'Sanitaires', S: 15, Q: 150, n: 2, type: 'extraction', portee: '', LpMax: 40 }],
      colonnes: [{ k: 'local', l: 'Local', t: 't' }, { k: 'S', l: 'Surface (m²)' }, { k: 'Q', l: 'Débit du local (m³/h)' }, { k: 'n', l: 'Nombre de bouches' },
        { k: 'type', l: 'Type', t: 's', o: Object.entries(BOUCHES).map(([k, b]) => [k, b.libelle]) }, { k: 'portee', l: 'Portée utile (m)' }, { k: 'LpMax', l: 'Niveau maxi (dB(A))' }] }],
    calcul(e) {
      const alertes = [], h = num(e.h, 2.7), Tr = num(e.Tr, 0.6), vt = num(e.vt, 0.25), rho = 1.2;
      const lignes = (e.locaux || []).map((l, i) => {
        const b = BOUCHES[l.type] || BOUCHES.plafond, n = Math.max(1, Math.round(num(l.n, 1))), q = num(l.Q) / n / 3600, Lmax = num(l.LpMax, 40), loc = termeLocal(num(l.S, 20), h, Tr);
        const essais = b.tailles.map(([nom, A]) => { const v = q / A, dp = b.zeta * rho * v * v / 2, Lw = lwBouche(A, b.zeta, v), Lp = Lw + 10 * log10(n) + loc.d; return { nom, A, v, dp, Lw, Lp, x: b.K ? b.K * q / (Math.sqrt(A) * vt) : NaN }; });
        const P = num(l.portee), ok = essais.find(t => t.v <= b.vmax && t.Lp <= Lmax && !(b.K && P > 0 && t.x > P * 1.3)) || essais.find(t => t.v <= b.vmax && t.Lp <= Lmax), t = ok || essais[essais.length - 1], nom = l.local || `Local ${i + 1}`;
        if (!ok) alertes.push(alerte('attention', `${nom} : aucune taille ne tient ${nf(b.vmax, 1)} m/s et ${nf(Lmax, 0)} dB(A) : augmenter le nombre de bouches.`));
        if (b.K && num(l.portee) > 0 && t.x > num(l.portee) * 1.3) alertes.push(alerte('attention', `${nom} : portée du jet ${nf(t.x, 1)} m pour ${nf(num(l.portee), 1)} m disponibles : risque de courant d'air (vitesse résiduelle élevée en zone occupée).`));
        if (b.K && num(l.portee) > 0 && t.x < num(l.portee) * 0.6) alertes.push(alerte('attention', `${nom} : portée du jet ${nf(t.x, 1)} m courte pour ${nf(num(l.portee), 1)} m : zones mal balayées, réduire la taille ou rapprocher les bouches.`));
        return { nom, b, n, t, Q: num(l.Q), qu: q * 3600 };
      });
      if (!lignes.length) alertes.push(alerte('erreur', 'Ajouter au moins un local.'));
      else alertes.push(alerte('ok', `${lignes.reduce((a, l) => a + l.n, 0)} bouches sélectionnées pour ${lignes.length} locaux.`));
      return {
        valeurs: { bouches: lignes.map(l => ({ local: l.nom, type: l.b.libelle, taille: l.t.nom, n: l.n, q: l.qu, dp: l.t.dp, Lw: l.t.Lw, Lp: l.t.Lp })) },
        resume: [['Nombre de bouches', String(lignes.reduce((a, l) => a + l.n, 0))], ['Débit total', `${nf(lignes.reduce((a, l) => a + l.Q, 0), 0)} m³/h`],
          ['Perte de charge maxi d\'une bouche', `${nf(Math.max(0, ...lignes.map(l => l.t.dp)), 0)} Pa`], ['Niveau sonore maxi estimé', `${nf(Math.max(0, ...lignes.map(l => l.t.Lp)), 0)} dB(A)`]],
        tableaux: [{ titre: 'Bouches retenues (gammes génériques : vérifier sur le catalogue du fabricant)', entetes: ['Local', 'Type', 'Taille', 'Nb', 'q unitaire (m³/h)', 'v col (m/s)', 'ΔP (Pa)', 'Portée (m)', 'LwA bouche', 'LpA local'],
          lignes: lignes.map(l => [l.nom, l.b.libelle, l.t.nom, String(l.n), nf(l.qu, 0), nf(l.t.v, 2), nf(l.t.dp, 0), Number.isFinite(l.t.x) ? nf(l.t.x, 1) : '—', nf(l.t.Lw, 0), nf(l.t.Lp, 0)]) }],
        alertes,
        hypotheses: ['Taille retenue : plus petite taille avec vitesse au col ≤ vitesse maxi du type, niveau sonore dans le local ≤ niveau maxi et portée ≤ 1,3 × portée utile.',
          'Perte de charge ΔP = ζ · ρv²/2 rapportée à la vitesse au col (ζ typique du type de bouche).',
          'Puissance acoustique LwA ≈ 10 + 10 · log A + 30 · log ζ + 60 · log v (A aire de passage en m², v en m/s) : estimation, à remplacer par la donnée du fabricant.',
          `Niveau dans le local : LpA = LwA + 10 · log n + 10 · log(Q/(4πr²) + 4/A), r = 1,5 m, Q = 2, A = 0,16 · V / Tr (Tr = ${nf(Tr, 1)} s, hauteur ${nf(h, 1)} m).`,
          `Portée : distance où la vitesse de l'air retombe à ${nf(vt, 2)} m/s, x = K · q / (√A · vt), K constante de jet typique du type de bouche.`],
        synthese: `${lignes.reduce((a, l) => a + l.n, 0)} bouches · ${lignes.length} locaux`,
      };
    },
  };

  /* ---------- Bilan acoustique simple d'un local ---------- */
  const OBJECTIFS = { log: ['Logement, pièce principale (arrêté du 30 juin 1999)', 30], logc: ['Logement, cuisine (arrêté du 30 juin 1999)', 35], bureau: ['Bureau individuel (valeur usuelle)', 35],
    open: ['Bureau paysager (valeur usuelle)', 40], reunion: ['Salle de réunion (valeur usuelle)', 35], classe: ['Salle d\'enseignement (valeur usuelle, à vérifier dans l\'arrêté du 25 avril 2003)', 33], hotel: ['Chambre d\'hôtel (arrêté du 25 avril 2003)', 30], atelier: ['Atelier (valeur usuelle)', 55], perso: ['Objectif saisi', null] };
  const ATTENUATIONS = { gaine: ['Gaine métallique nue (par m)', 0.15], isolee: ['Gaine isolée intérieurement (par m)', 1], coude: ['Coude sans aubes (par coude)', 2], derivation: ['Dérivation (part du débit en %)', null],
    silencieux: ['Silencieux (atténuation constructeur, dB(A))', null], plenum: ['Plénum isolé (dB(A))', null] };

  N.TYPES.acoustique = {
    titre: 'Bilan acoustique simple d\'un local', icone: '🔊', famille: 'Aéraulique',
    description: 'Puissance du ventilateur, atténuations du réseau (gaines, coudes, dérivations, silencieux), bruit des bouches et niveau dans le local comparé à l\'objectif.',
    champs: [{ g: 'Source' }, { k: 'source', l: 'Puissance acoustique du ventilateur', t: 's', o: [['estimee', 'Estimée d\'après débit et pression'], ['fabricant', 'Donnée du fabricant (dB(A), côté gaine)']], d: 'estimee' },
      { k: 'Qv', l: 'Débit du ventilateur', u: 'm³/h', d: 6000, si: e => e.source !== 'fabricant' }, { k: 'dp', l: 'Pression totale du ventilateur', u: 'Pa', d: 700, si: e => e.source !== 'fabricant' },
      { k: 'LwFab', l: 'Puissance acoustique au refoulement', u: 'dB(A)', d: 80, si: e => e.source === 'fabricant' },
      { g: 'Réseau jusqu\'au local' }, { k: 'elements', l: 'Éléments du réseau, de la CTA vers le local', t: 'lignes', d: [
        { nom: 'Silencieux de soufflage', type: 'silencieux', val: 25 }, { nom: 'Gaine principale', type: 'gaine', val: 25 }, { nom: 'Coudes', type: 'coude', val: 3 },
        { nom: 'Piquage vers le local', type: 'derivation', val: 10 }, { nom: 'Gaine isolée finale', type: 'isolee', val: 4 }, { nom: 'Plénum de bouche isolé', type: 'plenum', val: 6 }],
      colonnes: [{ k: 'nom', l: 'Élément', t: 't' }, { k: 'type', l: 'Type', t: 's', o: Object.entries(ATTENUATIONS).map(([k, a]) => [k, a[0]]) }, { k: 'val', l: 'Valeur (m, nombre, % ou dB)' }] },
      { g: 'Local' }, { k: 'LwBouches', l: 'Puissance acoustique des bouches du local (toutes bouches)', u: 'dB(A)', d: 30 },
      { k: 'S', l: 'Surface du local', u: 'm²', d: 40 }, { k: 'h', l: 'Hauteur', u: 'm', d: 2.7 }, { k: 'Tr', l: 'Durée de réverbération', u: 's', d: 0.6 },
      { k: 'r', l: 'Distance de l\'auditeur à la bouche', u: 'm', d: 1.5 },
      { k: 'usage', l: 'Objectif', t: 's', o: Object.entries(OBJECTIFS).map(([k, o]) => [k, o[1] ? `${o[0]} : ${o[1]} dB(A)` : o[0]]), d: 'reunion' },
      { k: 'objectif', l: 'Niveau maxi', u: 'dB(A)', d: 35, si: e => e.usage === 'perso' }],
    calcul(e) {
      const alertes = [];
      const Lw0 = e.source === 'fabricant' ? num(e.LwFab) : 40 + 10 * log10(Math.max(num(e.Qv), 1) / 3600) + 20 * log10(Math.max(num(e.dp), 1)) - 7;
      let L = Lw0;
      const chaine = [['Ventilateur', '', nf(Lw0, 1)]];
      (e.elements || []).forEach((x, i) => {
        const a = ATTENUATIONS[x.type] || ATTENUATIONS.gaine, v = num(x.val);
        const att = x.type === 'derivation' ? -10 * log10(Math.min(100, Math.max(v, 0.1)) / 100) : a[1] === null ? v : a[1] * v;
        L -= att; chaine.push([x.nom || `Élément ${i + 1}`, nf(att, 1), nf(L, 1)]);
      });
      const loc = termeLocal(num(e.S, 40), num(e.h, 2.7), num(e.Tr, 0.6), num(e.r, 1.5));
      const Lb = num(e.LwBouches), Ltot = 10 * log10(10 ** (L / 10) + 10 ** (Lb / 10)), Lp = Ltot + loc.d, LpRes = L + loc.d, LpB = Lb + loc.d;
      const obj = e.usage === 'perso' ? num(e.objectif, 35) : (OBJECTIFS[e.usage] || OBJECTIFS.reunion)[1];
      if (Lp > obj) alertes.push(alerte('erreur', `Niveau estimé ${nf(Lp, 0)} dB(A) supérieur à l'objectif de ${nf(obj, 0)} dB(A) : ${LpRes > LpB ? `bruit transmis par le réseau prépondérant, ajouter ${nf(Math.ceil(LpRes - obj + 3), 0)} dB d'atténuation (silencieux, gaine isolée)` : 'bruit des bouches prépondérant, bouches plus grandes ou plus nombreuses'}.`));
      else alertes.push(alerte(Lp > obj - 3 ? 'attention' : 'ok', `Niveau estimé ${nf(Lp, 0)} dB(A) pour un objectif de ${nf(obj, 0)} dB(A)${Lp > obj - 3 ? ' : marge faible' : ''}.`));
      if (e.source !== 'fabricant') alertes.push(alerte('attention', 'Puissance du ventilateur estimée : à remplacer par la donnée du fabricant (spectre par bande d\'octave pour un calcul détaillé).'));
      return {
        valeurs: { Lw0, LwReseau: L, Lp, objectif: obj, A: loc.A },
        resume: [['Puissance du ventilateur', `${nf(Lw0, 1)} dB(A)`], ['Puissance arrivant au local par le réseau', `${nf(L, 1)} dB(A)`], ['Puissance des bouches', `${nf(Lb, 1)} dB(A)`],
          ['Aire d\'absorption du local', `${nf(loc.A, 1)} m²`], ['Niveau de pression dans le local', `${nf(Lp, 1)} dB(A)`], ['Objectif', `${nf(obj, 0)} dB(A)`]],
        tableaux: [{ titre: 'Atténuations le long du réseau', entetes: ['Élément', 'Atténuation (dB)', 'Lw restant (dB(A))'], lignes: chaine },
          { titre: 'Contributions dans le local', entetes: ['Source', 'LpA (dB(A))'], lignes: [['Bruit transmis par le réseau', nf(LpRes, 1)], ['Bruit propre des bouches', nf(LpB, 1)], ['Total', nf(Lp, 1)]], total: true }],
        alertes,
        hypotheses: ['Calcul simplifié en niveau global pondéré A ; un calcul par bande d\'octave (63 à 8 000 Hz) reste nécessaire pour les locaux sensibles.',
          'Ventilateur estimé : Lw ≈ 40 + 10 · log Q[m³/s] + 20 · log Δp[Pa] − 7 dB(A).',
          'Atténuations moyennes : gaine nue 0,15 dB/m, gaine isolée intérieurement 1 dB/m, coude sans aubes 2 dB ; dérivation 10 · log(Q total / Q branche).',
          'Local : LpA = LwA + 10 · log(Q/(4πr²) + 4/A), Q = 2 (bouche en plafond), A = 0,16 · V / Tr.',
          'Objectifs : réglementation des logements (arrêté du 30 juin 1999) et des hôtels (arrêté du 25 avril 2003, 30 dB(A) dans les chambres) ; autres valeurs usuelles à confirmer au programme.'],
        synthese: `${nf(Lp, 0)} dB(A) pour ${nf(obj, 0)} dB(A) visés`,
      };
    },
  };

  return { pws, xDe, hDe, HRde, etat, BOUCHES, lwBouche, termeLocal };
})(typeof Donnees !== 'undefined' ? Donnees : require('./donnees'), typeof Calculs !== 'undefined' ? Calculs : require('./calculs'), typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = Cta;
