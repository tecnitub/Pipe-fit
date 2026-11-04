// Plomberie sanitaire : eau froide (EF) et eau chaude sanitaire (ECS) distribuées en arborescence depuis le compteur et la
// production d'ECS (ballon), jusqu'aux points de puisage (lavabo, WC, douche, évier, vide-seau…) repérés par salle et étage.
// Débits de base des appareils (DTU 60.11), foisonnement (coefficient y = 0,8 / √(x − 1)), diamètres à la vitesse maxi,
// point le plus défavorisé (pression résiduelle, hauteur), bouclage d'ECS (pertes thermiques, débit, retour, pompe de
// bouclage, températures de l'arrêté du 30 novembre 2005). Module pur (navigateur, node, tests).
const Sanitaire = ((D, C, N) => {
  const { nf, num } = N;
  const alerte = (niveau, texte) => ({ niveau, texte });
  // Appareils : [libellé, débit EF (L/s), débit ECS (L/s), pression mini (bar)] — débits de base DTU 60.11
  const APPAREILS = {
    lavabo: ['Lavabo', 0.20, 0.20, 1], laveMains: ['Lave-mains', 0.10, 0.10, 1], douche: ['Douche', 0.20, 0.20, 1], baignoire: ['Baignoire', 0.33, 0.33, 1],
    evier: ['Évier', 0.20, 0.20, 1], videSeau: ['Vide-seau / poste d\'eau', 0.33, 0.33, 1], wc: ['WC (réservoir de chasse)', 0.12, 0, 0.5], wcRobinet: ['WC (robinet de chasse directe)', 1.50, 0, 1.2],
    urinoir: ['Urinoir', 0.15, 0, 1], bidet: ['Bidet', 0.20, 0.20, 1], lavelinge: ['Lave-linge', 0.20, 0, 1], lavevaisselle: ['Lave-vaisselle', 0.10, 0, 1], puisage: ['Robinet de puisage (extérieur, garage)', 0.33, 0, 1],
  };
  const FOISONNEMENTS = { dtu: 'Coefficient du DTU 60.11 : y = 0,8 / √(x − 1)', saisi: 'Coefficient saisi', aucun: 'Sans foisonnement (débits cumulés bruts)' };
  // Volume d'ECS à 40 °C par puisage (L) ; usages : [libellé, puisages par appareil pendant la pointe, part du besoin journalier
  // dans la pointe, durée de la pointe (h)] — méthode des puisages, besoin ramené à la température de stockage
  const V40 = { lavabo: 5, laveMains: 2, douche: 40, baignoire: 150, evier: 10, videSeau: 10, bidet: 5 };
  const USAGES = {
    logement: ['Logements', { douche: 1, baignoire: 0.5, lavabo: 2, evier: 2, bidet: 1 }, 0.3, 1], bureau: ['Bureaux', { lavabo: 4, laveMains: 4, evier: 2, douche: 0.5, videSeau: 1 }, 0.5, 1],
    vestiaire: ['Vestiaires, salles de sport', { douche: 3, lavabo: 3, laveMains: 3 }, 1, 0.5], hotel: ['Hôtel', { douche: 1, baignoire: 0.5, lavabo: 2, bidet: 1 }, 0.35, 1.5],
    sante: ['EHPAD, établissement de santé', { douche: 0.5, baignoire: 0.3, lavabo: 3, laveMains: 3, evier: 2, videSeau: 2 }, 0.3, 2], creche: ['Crèche, scolaire', { lavabo: 6, laveMains: 6, evier: 2, douche: 0.5, videSeau: 1 }, 0.4, 1.5],
    restauration: ['Restauration', { evier: 6, lavabo: 4, laveMains: 4, videSeau: 2 }, 0.5, 2], industrie: ['Industrie, ateliers', { douche: 2, lavabo: 3, laveMains: 3, evier: 1 }, 0.8, 0.5],
  };
  const TOILETTE = ['lavabo', 'laveMains', 'douche', 'baignoire', 'bidet'];
  // Compteurs d'eau : DN et débit permanent Q3 (m³/h)
  const COMPTEURS = [[15, 2.5], [20, 4], [25, 6.3], [32, 10], [40, 16], [50, 25], [65, 40], [80, 63], [100, 100]];
  const etageNum = s => { const m = /([+-]?\d+)/.exec(String(s || '')); return /ss|sous/i.test(String(s)) && m ? -Math.abs(+m[1]) : m ? +m[1] : /rdc|rez/i.test(String(s)) ? 0 : 0; };

  /* ---------- Schéma de distribution : EF en bleu, ECS en rouge, retour de bouclage en pointillé ---------- */
  const cEF = '#2563eb', cC = '#c0392b', cB = '#d97706', cT = '#1f2937';
  const esc = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function dessiner(racines, tr, boucles, pireEF, S, B, avecECS) {
    const PAS = 84, X0 = 190, DX = 210, out = [];
    let ligne = 0, profMax = 0;
    const placer = (t, prof) => { t.prof = prof; profMax = Math.max(profMax, prof); if (!t.enfants.length) { t.y = 80 + ligne++ * PAS; return; } t.enfants.forEach(c => placer(c, prof + 1)); t.y = t.enfants[0].y; };
    racines.forEach(t => placer(t, 0));
    const W = X0 + (profMax + 1) * DX + 230, H = 80 + ligne * PAS + 30, X = p => X0 + p * DX;
    const L = (x1, y1, x2, y2, c, w = 2, pt) => out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"${pt ? ' stroke-dasharray="6 4"' : ''}/>`);
    const T = (x, y, t, o = {}) => out.push(`<text x="${x}" y="${y}" font-size="${o.fs || 10}" fill="${o.c || cT}"${o.a ? ` text-anchor="${o.a}"` : ''}${o.b ? ' font-weight="bold"' : ''}>${esc(t)}</text>`);
    const chemin = new Set(); if (pireEF) for (let x = pireEF.p.t; x; x = tr.find(t => t.rep === x.amont)) { if (chemin.has(x)) break; chemin.add(x); }
    const y0 = racines[0].y, yN = racines[racines.length - 1].y, dEF = 0, dC = 12, dB = 24;
    // Compteur, surpresseur, ballon d'ECS et pompe de bouclage
    out.push(`<circle cx="30" cy="${y0}" r="11" fill="#fff" stroke="${cEF}" stroke-width="1.5"/>`); T(30, y0 + 4, 'C', { a: 'middle', b: true, c: cEF }); T(30, y0 - 16, 'Compteur', { a: 'middle', fs: 9 });
    let xs = 41;
    if (S) { out.push(`<rect x="52" y="${y0 - 10}" width="34" height="20" fill="#fff" stroke="${cEF}" stroke-width="1.3"/>`); T(69, y0 + 4, 'SUR', { a: 'middle', fs: 8.5 }); L(41, y0, 52, y0, cEF); xs = 86; }
    L(xs, y0 + dEF, X(0), y0 + dEF, cEF);
    if (avecECS) {
      out.push(`<rect x="96" y="${y0 + 4}" width="38" height="52" rx="10" fill="#fff" stroke="${cC}" stroke-width="1.5"/>`); T(115, y0 + 34, 'ECS', { a: 'middle', b: true, c: cC });
      L(115, y0, 115, y0 + 4, cEF, 1.5); L(134, y0 + dC + 6, X(0), y0 + dC, cC);
      if (B) { L(134, y0 + 44, 160, y0 + 44, cB, 2, true); L(160, y0 + 44, 160, y0 + dB, cB, 2, true); L(160, y0 + dB, X(0), y0 + dB, cB, 2, true);
        out.push(`<circle cx="160" cy="${y0 + 34}" r="7" fill="#fff" stroke="${cB}" stroke-width="1.4"/>`); T(172, y0 + 64, 'Pompe de bouclage', { fs: 8.5, c: cB }); }
    }
    if (racines.length > 1) { L(X(0), y0 + dEF, X(0), yN + dEF, cEF, 3); if (avecECS) L(X(0) + 6, y0 + dC, X(0) + 6, yN + dC, cC, 3); if (B) L(X(0) + 12, y0 + dB, X(0) + 12, yN + dB, cB, 2, true); }
    const tracer = t => {
      const x1 = X(t.prof), x2 = X(t.prof + 1), y = t.y, gras = chemin.has(t) ? 3 : 2, bou = boucles.includes(t), xe = t.enfants.length ? x2 : X(profMax + 1) - 20;
      if (t.ef && t.qEF > 0) L(x1, y + dEF, xe, y + dEF, cEF, gras);
      if (t.ecs && t.qC > 0) L(x1 + 6, y + dC, xe, y + dC, cC, gras);
      if (bou) L(x1 + 12, y + dB, xe, y + dB, cB, 1.6, true);
      if (t.enfants.length) {
        const yl = t.enfants[t.enfants.length - 1].y;
        L(x2, y + dEF, x2, yl + dEF, cEF, gras); if (t.ecs && t.qC > 0) L(x2 + 6, y + dC, x2 + 6, yl + dC, cC, gras); if (bou && t.enfants.some(c => boucles.includes(c))) L(x2 + 12, y + dB, x2 + 12, yl + dB, cB, 1.6, true);
        t.enfants.forEach(tracer);
      }
      if (!t.enfants.length || t.pts.length) {
        const bx = t.enfants.length ? x1 + 20 : xe, by = t.enfants.length ? y + 34 : y - 14, w = t.enfants.length ? DX - 40 : 200;
        const liste = t.pts.map(p => p.rep).join(', ');
        if (!t.enfants.length) { out.push(`<rect x="${bx}" y="${by}" width="${w}" height="44" fill="#fff" stroke="${chemin.has(t) ? cEF : cT}" stroke-width="${chemin.has(t) ? 2 : 1.2}"/>`); T(bx + 6, by + 14, t.nom || t.rep, { b: true }); T(bx + 6, by + 28, liste.slice(0, 38), { fs: 9 }); T(bx + 6, by + 40, `${t.pts.length} point(s)`, { fs: 8.5 }); }
        else if (liste) T(bx, by + 4, `↳ ${liste}`.slice(0, 40), { fs: 8.5 });
      }
      T(x1 + 16, y - 6, `${t.rep}${t.gEF ? ` · EF ${t.gEF.tb.nom.replace(/ \(.*/, '')}` : ''}${t.gC ? ` · ECS ${t.gC.tb.nom.replace(/ \(.*/, '')}` : ''}`, { fs: 9 });
    };
    racines.forEach(tracer);
    T(14, H - 8, 'Eau froide en bleu, eau chaude en rouge, retour de bouclage en pointillé orange ; chemin du point le plus défavorisé en trait épais.', { fs: 9 });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${out.join('')}</svg>`;
  }

  function calculer(e) {
    const alertes = [], tubes = C.tubes(e.serie || 'cuivre-1057'), s = D.SERIES[e.serie] || D.SERIES['cuivre-1057'], fEF = C.liquide('eau', num(e.Tef, 12)), fC = C.liquide('eau', num(e.Tecs, 55));
    const vmax = num(e.vmax, 1.5), hEt = num(e.hEtage, 3), mode = e.foisonnement || 'dtu', coefS = num(e.coefSaisi, 60) / 100;
    const y = x => (mode === 'aucun' || x <= 1 ? 1 : mode === 'saisi' ? Math.min(1, coefS) : Math.min(1, 0.8 / Math.sqrt(x - 1)));
    // Arbre des tronçons (comme le réseau hydraulique) ; les points de puisage sont rattachés à un tronçon
    const tr = (e.troncons || []).filter(x => x && x.rep).map((x, i) => ({ x, i, rep: String(x.rep).trim(), amont: String(x.amont || '').trim(), nom: x.nom || '', L: num(x.L), zeta: num(x.zeta, 3), ef: x.reseaux !== 'ecs', ecs: x.reseaux !== 'ef', enfants: [], pts: [] }));
    const parRep = new Map(); tr.forEach(t => { if (parRep.has(t.rep)) alertes.push(alerte('erreur', `Repère ${t.rep} en double.`)); else parRep.set(t.rep, t); });
    const racines = []; tr.forEach(t => { const p = t.amont && parRep.get(t.amont); if (t.amont && !p) alertes.push(alerte('erreur', `${t.rep} : tronçon amont « ${t.amont} » introuvable.`)); if (p && p !== t) p.enfants.push(t); else racines.push(t); });
    const pts = (e.points || []).filter(p => p && (p.rep || p.type)).map((p, i) => {
      const a = APPAREILS[p.type] || APPAREILS.lavabo, t = parRep.get(String(p.troncon || '').trim());
      const o = { rep: p.rep || `PT${i + 1}`, salle: p.salle || '', etage: p.etage || '', type: p.type || 'lavabo', a, qEF: num(p.qEF) > 0 ? num(p.qEF) : a[1], qECS: a[2] ? (num(p.qECS) > 0 ? num(p.qECS) : a[2]) : 0, pMin: num(p.pMin) > 0 ? num(p.pMin) : a[3], z: etageNum(p.etage) * hEt, t, fiche: !!(p.fiche || num(p.qEF) > 0) };
      if (!t) alertes.push(alerte('erreur', `${o.rep} (${o.salle || a[0]}) : rattachez le point de puisage à un tronçon.`)); else t.pts.push(o);
      return o;
    });
    if (!pts.length) alertes.push(alerte('attention', 'Ajoutez les points de puisage (lavabos, WC, douches…) et rattachez-les aux tronçons.'));
    // Cumul des débits de base et du nombre d'appareils, foisonnement, diamètre et pertes de charge pour EF et ECS
    const cumul = t => { t.enfants.forEach(cumul); const ps = [...t.pts, ...t.enfants.flatMap(c => c.tous)]; t.tous = ps;
      t.qbEF = ps.reduce((a, p) => a + p.qEF, 0); t.xEF = ps.filter(p => p.qEF > 0).length; t.qbC = ps.reduce((a, p) => a + p.qECS, 0); t.xC = ps.filter(p => p.qECS > 0).length; };
    racines.forEach(cumul);
    const dim = (q, f) => { const qv = q / 1000, tb = tubes.find(u => C.ecoulement(qv, u.di / 1000, f.rho, f.mu, s.rugosite).v <= vmax) || tubes[tubes.length - 1]; return { tb, ...C.ecoulement(qv, tb.di / 1000, f.rho, f.mu, s.rugosite) }; };
    tr.forEach(t => {
      t.yEF = y(t.xEF); t.qEF = t.qbEF * t.yEF; t.yC = y(t.xC); t.qC = t.qbC * t.yC;
      if (t.ef && t.qEF > 0) { t.gEF = dim(t.qEF, fEF); t.dpEF = t.gEF.R * t.L + t.zeta * t.gEF.pd; } else t.dpEF = 0;
      if (t.ecs && t.qC > 0) { t.gC = dim(t.qC, fC); t.dpC = t.gC.R * t.L + t.zeta * t.gC.pd; } else t.dpC = 0;
    });
    // Point le plus défavorisé : pression résiduelle + hauteur + pertes de charge du chemin (EF depuis le compteur, ECS depuis la production)
    const chemin = t => { const c = []; for (let x = t; x; x = x.amont ? parRep.get(x.amont) : null) { c.unshift(x); if (c.length > tr.length) break; } return c; };
    const besoins = pts.filter(p => p.t).map(p => { const c = chemin(p.t);
      return { p, c, ef: p.pMin * 1e5 + fEF.rho * 9.81 * p.z + c.reduce((a, t) => a + t.dpEF, 0), ecs: p.qECS > 0 ? p.pMin * 1e5 + fC.rho * 9.81 * p.z + c.reduce((a, t) => a + t.dpC, 0) + num(e.dpProdECS, 30) * 1000 : 0 }; });
    const pireEF = besoins.reduce((a, b) => (!a || b.ef > a.ef ? b : a), null), pireC = besoins.filter(b => b.ecs).reduce((a, b) => (!a || b.ecs > a.ecs ? b : a), null);
    const totC = racines.reduce((a, t) => a + (t.ecs ? t.qC : 0), 0);
    const pDispo = num(e.pDispo, 3) * 1e5, totEF0 = racines.reduce((a, t) => a + (t.ef ? t.qEF : 0), 0);
    // Surpresseur : automatique si la pression disponible ne suffit pas au point le plus défavorisé, ou imposé
    const modeS = e.surpresseur || 'auto', manque = pireEF ? pireEF.ef - pDispo : 0;
    const S = modeS === 'oui' || (modeS === 'auto' && manque > 0) ? (() => { const Q = totEF0 * 3.6, H = Math.max(0, manque) / (fEF.rho * 9.81) + 3, Pel = Math.max(370, Q / 3600 * fEF.rho * 9.81 * H / 0.5); return { Q, H, Pel, pompes: 2 }; })() : null;
    if (pireEF) alertes.push(alerte(pireEF.ef <= pDispo || S ? 'ok' : 'erreur', `Point le plus défavorisé en eau froide : ${pireEF.p.rep} (${pireEF.p.salle || pireEF.p.a[0]}, ${pireEF.p.etage || '—'}) : ${nf(pireEF.ef / 1e5, 2)} bar nécessaires au compteur pour ${nf(pDispo / 1e5, 2)} bar disponibles${pireEF.ef <= pDispo ? '' : S ? ' : surpresseur prévu' : ' : surpresseur nécessaire'}.`));
    if (S) alertes.push(alerte('ok', `Surpresseur : ${S.pompes} pompes (dont 1 en secours), ${nf(S.Q, 2)} m³/h sous ${nf(S.H, 1)} mCE, ≈ ${nf(S.Pel, 0)} W par pompe ; réservoir à vessie et protection contre le manque d'eau.`));
    if (pireC) alertes.push(alerte(pireC.ecs <= pDispo || S ? 'ok' : 'erreur', `Point le plus défavorisé en eau chaude : ${pireC.p.rep} (${pireC.p.salle || pireC.p.a[0]}) : ${nf(pireC.ecs / 1e5, 2)} bar nécessaires (production d'ECS comprise).`));
    // Bouclage d'ECS : tronçons qui ont des tronçons en aval ; antennes vers les appareils non bouclées (volume ≤ 3 L)
    const boucles = e.bouclage !== 'non' ? tr.filter(t => t.ecs && t.qC > 0 && (t.enfants.some(c => c.ecs) || t.x.boucle === 'oui') && t.x.boucle !== 'non') : [];
    const Tdep = num(e.TdepB, 60), Tret = num(e.TretB, 55), Tamb = num(e.Tamb, 20), dTb = Math.max(1, Tdep - Tret);
    const perteLin = dn => (6 + 0.18 * dn) * (((Tdep + Tret) / 2 - Tamb) / 35); // W/m, tube calorifugé
    let Pperte = 0;
    boucles.forEach(t => { t.perte = perteLin(t.gC.tb.dn) * t.L; Pperte += t.perte; });
    tr.filter(t => t.ecs && t.qC > 0 && !boucles.includes(t)).forEach(t => {
      const V = Math.PI * (t.gC.tb.di / 2000) ** 2 * t.L * 1000;
      if (e.bouclage !== 'non' && V > 3) alertes.push(alerte('attention', `${t.rep} : antenne d'ECS non bouclée de ${nf(V, 1)} L (> 3 L entre le bouclage et le point de puisage, arrêté du 30/11/2005) : la boucler ou la raccourcir.`));
    });
    let B = null;
    if (boucles.length) {
      // Débit de chaque boucle (vanne thermostatique) : pertes de son chemin, tronçons communs partagés entre les boucles en aval
      const finales0 = boucles.filter(t => !t.enfants.some(c => boucles.includes(c))), qMin = num(e.qMinBoucle, 50);
      const nFin = t => finales0.filter(f => chemin(f).includes(t)).length || 1;
      const vannes = finales0.map(f => { const P = chemin(f).filter(x => boucles.includes(x)).reduce((a, x) => a + x.perte / nFin(x), 0), qc = P / (4186 * dTb) / fC.rho * 3600 * 1000;
        return { rep: f.rep, nom: f.nom, P, qc, q: Math.max(qc, qMin) }; });
      const Qb = vannes.reduce((a, v) => a + v.q, 0) / 1000; // m³/h
      const tR = tubes.find(u => C.ecoulement(Qb / 3600, u.di / 1000, fC.rho, fC.mu, s.rugosite).v <= 0.5 && u.di >= 10) || tubes[0];
      const rR = C.ecoulement(Qb / 3600, tR.di / 1000, fC.rho, fC.mu, s.rugosite);
      // Circuit de bouclage le plus long : aller (au débit de bouclage) + retour, + vannes thermostatiques d'équilibrage
      const finales = boucles.filter(t => !t.enfants.some(c => boucles.includes(c)));
      const longueur = t => chemin(t).filter(x => boucles.includes(x)).reduce((a, x) => a + x.L, 0);
      const plusLong = finales.reduce((a, t) => (!a || longueur(t) > longueur(a) ? t : a), null), Lb = plusLong ? longueur(plusLong) : 0;
      const dpAller = chemin(plusLong).filter(x => boucles.includes(x)).reduce((a, x) => { const r = C.ecoulement(Qb / 3600, x.gC.tb.di / 1000, fC.rho, fC.mu, s.rugosite); return a + r.R * x.L + x.zeta * r.pd; }, 0);
      const dpRet = rR.R * Lb * 1.3, H = (dpAller + dpRet + num(e.dpVanneB, 10) * 1000) * 1.1 / (fC.rho * 9.81), Pel = Math.max(15, Qb / 3600 * fC.rho * 9.81 * H / 0.25);
      const Lret = boucles.reduce((a, x) => a + x.L, 0);
      B = { Pperte, Qb, tR, vR: rR.v, H, Pel, Lb, Lret, branches: finales.length, plusLong: plusLong && plusLong.rep, vannes: vannes.map(v => ({ rep: v.rep, nom: v.nom, P: v.P, qc: v.qc, q: v.q })) };
      if (vannes.some(v => v.qc < qMin)) alertes.push(alerte('attention', `Bouclage : ${vannes.filter(v => v.qc < qMin).length} boucle(s) sous le débit minimal de ${nf(qMin, 0)} L/h, réglées au minimum (fonctionnement des vannes thermostatiques).`));
      if (Tdep < 55) alertes.push(alerte('erreur', `Bouclage : départ à ${nf(Tdep, 0)} °C, au moins 55 °C requis (arrêté du 30/11/2005, légionelles).`));
      if (Tret < 50) alertes.push(alerte('erreur', `Bouclage : retour à ${nf(Tret, 0)} °C, au moins 50 °C en tout point du réseau bouclé.`));
      alertes.push(alerte('ok', `Bouclage : ${nf(Pperte / 1000, 2)} kW de pertes, ${nf(Qb * 1000, 0)} L/h (ΔT ${nf(dTb, 0)} K), retour ${tR.nom.replace(/ \(.*/, '')}, pompe ${nf(Qb, 2)} m³/h sous ${nf(H, 2)} mCE (≈ ${nf(Pel, 0)} W) ; ${finales.length} vanne(s) thermostatique(s) d'équilibrage.`));
    }
    // Besoin d'ECS par la méthode des puisages : volume de pointe ramené à la température de stockage, besoin journalier
    const U = USAGES[e.usage] || USAGES.bureau, Tst = num(e.Tstock, 60), Tef = num(e.Tef, 12);
    const puisages = pts.filter(p => p.qECS > 0 && V40[p.type]).map(p => ({ p, n: U[1][p.type] ?? 1, V: V40[p.type] }));
    const Vp40 = puisages.reduce((a, x) => a + x.n * x.V, 0), Vp = Vp40 * (40 - Tef) / Math.max(1, Tst - Tef), Vj = Vp / U[2];
    const besoinECS = { Vp, Vj, part: U[2], tp: U[3], usage: U[0], Tst };
    // Protections et accessoires du réseau (NF EN 1717, DTU 60.11, arrêté du 30/11/2005)
    const nEcsToilette = pts.filter(p => p.qECS > 0 && TOILETTE.includes(p.type)).length, sensibles = ['sante', 'creche'].includes(e.usage);
    const Qm3 = totEF0 * 3.6, compteur = COMPTEURS.find(c => c[1] >= Qm3) || COMPTEURS[COMPTEURS.length - 1];
    const rapides = pts.filter(p => ['wcRobinet', 'lavelinge', 'lavevaisselle'].includes(p.type)).length;
    const protections = [
      ['Compteur d\'eau', `DN ${compteur[0]} (Q3 ${nf(compteur[1], 1)} m³/h)`, 'En tête de réseau', `Débit probable ${nf(Qm3, 2)} m³/h`],
      ['Clapet antiretour contrôlable (EA)', '1', 'Après le compteur', 'Protection du réseau public contre les retours d\'eau (NF EN 1717)'],
      ...(e.remplissageCvc !== 'non' ? [['Disconnecteur à zone de pression réduite contrôlable (BA)', '1', 'Remplissage des réseaux de chauffage / eau glacée', 'Fluide de catégorie 3 (eau traitée, glycolée) : contrôle annuel']] : []),
      ...(num(e.pDispo, 3) > 3 && !S ? [['Réducteur de pression', '1', 'Après le compteur', `${nf(num(e.pDispo, 3), 1)} bar disponibles : 3 bar maximum aux points de puisage (DTU 60.11)`]] : []),
      ...(S ? [['Surpresseur', `${S.pompes} pompes`, 'Local technique', `${nf(S.Q, 2)} m³/h · ${nf(S.H, 1)} mCE ; réservoir à vessie, protection manque d'eau`]] : []),
      ...(rapides ? [['Anti-bélier', String(rapides), 'Près des robinets à fermeture rapide', 'Robinets de chasse directe, électrovannes de lave-linge / lave-vaisselle']] : []),
      ...(totC > 0 ? [['Groupe de sécurité 7 bar et vase d\'expansion sanitaire', '1', 'Arrivée d\'eau froide du ballon', 'Dilatation de l\'eau chaude, eau potable (vase à membrane alimentaire)']] : []),
      ...(nEcsToilette ? [['Mitigeur thermostatique ou limiteur de température', String(nEcsToilette), 'Points de puisage des pièces de toilette', sensibles ? '50 °C maximum (arrêté du 30/11/2005), 38 °C conseillé sur douches et baignoires en crèche ou établissement de santé' : '50 °C maximum aux points de puisage des pièces de toilette (arrêté du 30/11/2005)']] : []),
      ...(B ? [['Vanne thermostatique d\'équilibrage du bouclage', String(B.vannes.length), 'Retour de chaque boucle', 'Réglage à 55 °C'], ['Clapet antiretour et thermomètre', '1', 'Retour de boucle, avant le ballon', 'Contrôle de la température de retour (≥ 50 °C)']] : [])];
    const ligneT = (t, ecs) => [t.rep, t.amont || (ecs ? 'production ECS' : 'compteur'), nf(ecs ? t.qbC : t.qbEF, 2), String(ecs ? t.xC : t.xEF), nf(ecs ? t.yC : t.yEF, 2), nf(ecs ? t.qC : t.qEF, 2), (ecs ? t.gC : t.gEF).tb.nom.replace(/ \(.*/, ''), nf((ecs ? t.gC : t.gEF).v, 2), nf(t.L, 1), nf((ecs ? t.dpC : t.dpEF) / 1000, 2), ...(ecs ? [boucles.includes(t) ? `oui (${nf(t.perte, 0)} W)` : 'non'] : [])];
    const totEF = totEF0;
    return {
      valeurs: { totEF, totC, bouclage: B, surpresseur: S, besoinECS, compteur: compteur[0], pireEF: pireEF && pireEF.p.rep, pireC: pireC && pireC.p.rep, points: pts.length, serie: e.serie || 'cuivre-1057',
        troncons: tr.map(t => ({ rep: t.rep, L: t.L, ef: t.ef && t.gEF ? t.gEF.tb.cle : null, ecs: t.ecs && t.gC ? t.gC.tb.cle : null, boucle: boucles.includes(t) })),
        appareils: pts.reduce((o, p) => ({ ...o, [p.type]: (o[p.type] || 0) + 1 }), {}), mitigeurs: nEcsToilette },
      resume: [['Points de puisage', `${pts.length} (${Object.entries(pts.reduce((o, p) => ({ ...o, [p.a[0]]: (o[p.a[0]] || 0) + 1 }), {})).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ')})`],
        ['Foisonnement', FOISONNEMENTS[mode]], ['Débit probable eau froide au compteur', `${nf(totEF, 2)} L/s (${nf(totEF * 3.6, 2)} m³/h)`], ['Débit probable eau chaude en sortie de production', `${nf(totC, 2)} L/s (${nf(totC * 3.6, 2)} m³/h)`],
        ...(pireEF ? [['Point le plus défavorisé (EF)', `${pireEF.p.rep} — ${pireEF.p.salle} ${pireEF.p.etage} : ${nf(pireEF.ef / 1e5, 2)} bar au compteur`]] : []),
        ...(pireC ? [['Point le plus défavorisé (ECS)', `${pireC.p.rep} — ${pireC.p.salle} ${pireC.p.etage} : ${nf(pireC.ecs / 1e5, 2)} bar`]] : []),
        ...(Vp > 0 ? [['Besoin d\'ECS (méthode des puisages)', `${nf(Vp, 0)} L à ${nf(Tst, 0)} °C en pointe de ${nf(U[3], 1)} h · ${nf(Vj, 0)} L/jour (${U[0].toLowerCase()})`]] : []),
        ...(S ? [['Surpresseur', `${nf(S.Q, 2)} m³/h · ${nf(S.H, 1)} mCE · 2 × ${nf(S.Pel, 0)} W`]] : []), ['Compteur', `DN ${compteur[0]}`],
        ...(B ? [['Bouclage ECS', `${nf(B.Pperte / 1000, 2)} kW de pertes · ${nf(B.Qb * 1000, 0)} L/h · retour ${B.tR.nom.replace(/ \(.*/, '')}`], ['Pompe de bouclage', `${nf(B.Qb, 2)} m³/h · ${nf(B.H, 2)} mCE · ≈ ${nf(B.Pel, 0)} W`]] : [])],
      tableaux: [
        { titre: 'Points de puisage (débits de base DTU 60.11, ou fiche technique)', entetes: ['Repère', 'Salle', 'Étage', 'Appareil', 'EF (L/s)', 'ECS (L/s)', 'Pression mini (bar)', 'Tronçon', 'Pression nécessaire EF (bar)', 'Fiche'],
          lignes: besoins.map(b => [`${b === pireEF ? '★ ' : ''}${b.p.rep}`, b.p.salle, b.p.etage, b.p.a[0], nf(b.p.qEF, 2), b.p.qECS ? nf(b.p.qECS, 2) : '—', nf(b.p.pMin, 1), b.p.t.rep, nf(b.ef / 1e5, 2), b.p.fiche ? '✓' : '']) },
        { titre: 'Eau froide : tronçons (débit probable = débit de base × y)', entetes: ['Tronçon', 'Amont', 'Σ débits de base (L/s)', 'Appareils', 'y', 'Débit probable (L/s)', 'Tube', 'v (m/s)', 'L (m)', 'ΔP (kPa)'], lignes: tr.filter(t => t.ef && t.qEF > 0).map(t => ligneT(t, false)) },
        { titre: 'Eau chaude sanitaire : tronçons', entetes: ['Tronçon', 'Amont', 'Σ débits de base (L/s)', 'Appareils', 'y', 'Débit probable (L/s)', 'Tube', 'v (m/s)', 'L (m)', 'ΔP (kPa)', 'Bouclé'], lignes: tr.filter(t => t.ecs && t.qC > 0).map(t => ligneT(t, true)) },
        ...(B ? [{ titre: 'Bouclage : débits de réglage des vannes thermostatiques', entetes: ['Boucle', 'Désignation', 'Pertes thermiques (W)', 'Débit calculé (L/h)', 'Débit retenu (L/h)', 'Consigne'],
          lignes: B.vannes.map(v => [v.rep, v.nom, nf(v.P, 0), nf(v.qc, 0), nf(v.q, 0), '55 °C']) }] : []),
        ...(puisages.length ? [{ titre: `Besoin d'ECS en pointe (${U[0]})`, entetes: ['Appareil', 'Nombre', 'Puisages par appareil', 'Volume à 40 °C (L)', `Volume à ${nf(Tst, 0)} °C (L)`],
          lignes: Object.entries(puisages.reduce((o, x) => { const k = x.p.type; o[k] = o[k] || { n: 0, nb: x.n, V: x.V }; o[k].n++; return o; }, {})).map(([k, x]) => [APPAREILS[k][0], String(x.n), nf(x.nb, 1), nf(x.n * x.nb * x.V, 0), nf(x.n * x.nb * x.V * (40 - Tef) / Math.max(1, Tst - Tef), 0)]) }] : []),
        { titre: 'Protections et accessoires du réseau', entetes: ['Organe', 'Quantité', 'Emplacement', 'Justification'], lignes: protections }],
      schema: tr.length ? dessiner(racines, tr, boucles, pireEF, S, B, totC > 0) : undefined, titreSchema: 'Schéma de distribution EF / ECS / bouclage',
      alertes,
      hypotheses: ['Débits de base des appareils selon le DTU 60.11 ; débit probable = Σ débits de base × y, y = 0,8 / √(x − 1) (x : nombre d\'appareils desservis), sauf choix contraire.',
        'Pression nécessaire au compteur = pression mini du point de puisage + hauteur (étage × hauteur d\'étage) + pertes de charge du chemin ; en ECS, + perte de charge de la production.',
        'Bouclage : pertes des tubes calorifugés ≈ (6 + 0,18 × DN) W/m pour 35 K d\'écart, débit = pertes / (ρ · cp · ΔT), pompe sur le circuit bouclé le plus long + vanne thermostatique.'],
      synthese: `${pts.length} points · EF ${nf(totEF, 2)} L/s · ECS ${nf(totC, 2)} L/s${B ? ` · bouclage ${nf(B.Qb * 1000, 0)} L/h` : ''}`,
    };
  }

  N.TYPES.sanitaire = {
    titre: 'Eau froide et eau chaude sanitaires (points de puisage, bouclage)', icone: '🚰', famille: 'Hydraulique',
    description: 'Points de puisage par salle et étage (lavabo, WC, douche, évier, vide-seau…), débits de base et foisonnement, diamètres EF et ECS, point le plus défavorisé, bouclage d\'ECS et pompe de bouclage.',
    champs: [{ g: 'Production et réseau' },
      { k: 'production', l: 'Production d\'ECS (ballon) de l\'étude', t: 's', o: (e, et) => [['', 'Saisie'], ...(et ? (et.notes || []).map((n, i) => [n, i]).filter(([n]) => n.type === 'ecs').map(([n, i]) => [n.id, `N${i + 1} — ${n.titre}`]) : e.production ? [[e.production, e.production]] : [])], d: '' },
      { k: 'serie', l: 'Tubes', t: 's', o: Object.entries(D.SERIES).map(([k, x]) => [k, x.libelle]), d: 'cuivre-1057' },
      { k: 'Tef', l: 'Température de l\'eau froide', u: '°C', d: 12 }, { k: 'Tecs', l: 'Température de distribution de l\'ECS', u: '°C', d: 55 },
      { k: 'pDispo', l: 'Pression disponible au compteur (ou après surpresseur)', u: 'bar', d: 3 }, { k: 'dpProdECS', l: 'Perte de charge de la production d\'ECS (ballon, mitigeur)', u: 'kPa', d: 30 },
      { k: 'vmax', l: 'Vitesse maximale', u: 'm/s', d: 1.5 }, { k: 'hEtage', l: 'Hauteur d\'un étage', u: 'm', d: 3 },
      { k: 'usage', l: 'Usage du bâtiment (besoin d\'ECS, mitigeurs)', t: 's', o: Object.entries(USAGES).map(([k, u]) => [k, u[0]]), d: 'bureau' },
      { k: 'Tstock', l: 'Température de stockage de l\'ECS', u: '°C', d: 60 },
      { k: 'surpresseur', l: 'Surpresseur', t: 's', o: [['auto', 'Automatique (si la pression ne suffit pas)'], ['oui', 'Prévu'], ['non', 'Sans']], d: 'auto' },
      { k: 'alimSurp', l: 'Surpresseur alimenté par', t: 's', o: (e, et) => (typeof Terminaux !== 'undefined' ? Terminaux : require('./terminaux')).optAlim(e, et, e.alimSurp), d: '', si: e => e.surpresseur !== 'non' },
      { k: 'remplissageCvc', l: 'Remplissage des réseaux CVC depuis l\'eau froide (disconnecteur BA)', t: 's', o: [['oui', 'Oui'], ['non', 'Non']], d: 'oui' },
      { g: 'Foisonnement' }, { k: 'foisonnement', l: 'Foisonnement', t: 's', o: Object.entries(FOISONNEMENTS), d: 'dtu' }, { k: 'coefSaisi', l: 'Coefficient saisi', u: '%', d: 60, si: e => e.foisonnement === 'saisi' },
      { g: 'Réseau (tronçons) et points de puisage' },
      { k: 'troncons', l: 'Tronçons (amont vide = compteur pour l\'EF, production pour l\'ECS)', t: 'lignes', d: [
        { rep: 'C', amont: '', nom: 'Colonne montante', L: 12, zeta: 4, reseaux: 'les2', boucle: '' }, { rep: 'R1', amont: 'C', nom: 'Distribution R+1', L: 15, zeta: 5, reseaux: 'les2', boucle: '' },
        { rep: 'R1.1', amont: 'R1', nom: 'Sanitaires R+1', L: 4, zeta: 6, reseaux: 'les2', boucle: '' }],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'amont', l: 'Amont', t: 't' }, { k: 'nom', l: 'Désignation', t: 't' }, { k: 'L', l: 'Longueur (m)' }, { k: 'zeta', l: 'Σζ' },
          { k: 'reseaux', l: 'Réseaux', t: 's', o: [['les2', 'EF et ECS'], ['ef', 'EF seule'], ['ecs', 'ECS seule']] }, { k: 'boucle', l: 'Bouclage', t: 's', o: [['', 'Auto (tronçons avec aval)'], ['oui', 'Bouclé'], ['non', 'Non bouclé']] }] },
      { k: 'points', l: 'Points de puisage, une ligne par appareil (salle et étage pour le repérage ; « 📄 » charge la fiche technique)', t: 'lignes', d: [
        { rep: 'LV-01', salle: 'Sanitaires H', etage: 'R+1', type: 'lavabo', troncon: 'R1.1' }, { rep: 'WC-01', salle: 'Sanitaires H', etage: 'R+1', type: 'wc', troncon: 'R1.1' },
        { rep: 'DO-01', salle: 'Vestiaire', etage: 'R+1', type: 'douche', troncon: 'R1.1' }, { rep: 'EV-01', salle: 'Office', etage: 'R+1', type: 'evier', troncon: 'R1' }],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'salle', l: 'Salle', t: 't' }, { k: 'etage', l: 'Étage', t: 't' }, { k: 'type', l: 'Appareil', t: 's', o: Object.entries(APPAREILS).map(([k, a]) => [k, a[0]]) },
          { k: 'troncon', l: 'Tronçon', t: 's', o: e => [['', '—'], ...(e.troncons || []).filter(t => t.rep).map(t => [t.rep, `${t.rep}${t.nom ? ` — ${t.nom}` : ''}`])] },
          { k: 'qEF', l: 'Débit EF fiche (L/s)' }, { k: 'qECS', l: 'Débit ECS fiche (L/s)' }, { k: 'pMin', l: 'Pression mini fiche (bar)' }, { k: 'ref', l: 'Fabricant, référence', t: 't' }] },
      { g: 'Bouclage de l\'ECS' }, { k: 'bouclage', l: 'Bouclage', t: 's', o: [['oui', 'Réseau d\'ECS bouclé (pompe de bouclage)'], ['non', 'Sans bouclage']], d: 'oui' },
      { k: 'TdepB', l: 'Température de départ de la boucle', u: '°C', d: 60, si: e => e.bouclage !== 'non' }, { k: 'TretB', l: 'Température de retour de la boucle', u: '°C', d: 55, si: e => e.bouclage !== 'non' },
      { k: 'Tamb', l: 'Température ambiante des locaux traversés', u: '°C', d: 20, si: e => e.bouclage !== 'non' },
      { k: 'dpVanneB', l: 'Vanne thermostatique d\'équilibrage', u: 'kPa', d: 10, si: e => e.bouclage !== 'non' },
      { k: 'qMinBoucle', l: 'Débit minimal par boucle', u: 'L/h', d: 50, si: e => e.bouclage !== 'non' },
      { k: 'alimBouclage', l: 'Pompe de bouclage alimentée par', t: 's', o: (e, et) => (typeof Terminaux !== 'undefined' ? Terminaux : require('./terminaux')).optAlim(e, et, e.alimBouclage), d: '', si: e => e.bouclage !== 'non' }],
    calcul: calculer,
  };

  // Fiche d'un appareil sanitaire (robinetterie) : débit (L/s ou L/min), pression mini (bar), fabricant
  function lireFichePoint(lignes) {
    const L = (Array.isArray(lignes) ? lignes : String(lignes || '').split(/\r?\n/)).map(String).filter(l => l.trim()), v = {}, src = {};
    const n = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    L.forEach(l => { const x = n(l);
      if (v.q === undefined && /debit/.test(x)) { const ls = /(\d+(?:[.,]\d+)?)\s*l\s*\/\s*s/.exec(x), lm = /(\d+(?:[.,]\d+)?)\s*l\s*\/\s*min/.exec(x); const q = ls ? +ls[1].replace(',', '.') : lm ? +lm[1].replace(',', '.') / 60 : undefined; if (q > 0 && q < 5) { v.q = Math.round(q * 1000) / 1000; src.q = l.trim(); } }
      if (v.pMin === undefined && /pression (?:mini|minimale|de service mini|dynamique mini)|pression min/.test(x)) { const m = /(\d+(?:[.,]\d+)?)\s*bar/.exec(x); if (m) { v.pMin = +m[1].replace(',', '.'); src.pMin = l.trim(); } } });
    let fabricant = '', reference = '';
    try { const FT = typeof FichesTech !== 'undefined' ? FichesTech : require('../../../public/js/fiches-tech'); const a = FT.analyser({ texte: L.join('\n') }); fabricant = a.fabricant || ''; reference = (a.references || [])[0] || ''; } catch (err) { /* sans bibliothèque */ }
    return { valeurs: v, sources: src, fabricant, reference, nb: Object.keys(v).length };
  }
  return { APPAREILS, FOISONNEMENTS, USAGES, V40, calculer, lireFichePoint };
})(typeof Donnees !== 'undefined' ? Donnees : require('./donnees'), typeof Calculs !== 'undefined' ? Calculs : require('./calculs'), typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = Sanitaire;
