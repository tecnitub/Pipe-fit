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
  // Installations d'air de l'étude (une par schéma aéraulique en arborescence) : CTA reliée, sinon producteur (extracteur…)
  function installationsAir(et) {
    const notes = (et && et.notes) || [];
    return notes.filter(n => (n.type === 'aero') && (n.entrees || {}).structure === 'arborescence').map(n => {
      const e = n.entrees || {}, cta = e.cta && notes.find(x => x.id === e.cta && x.type === 'cta'), P = PRODUCTEURS[e.producteur] || PRODUCTEURS['cta-df'];
      return [n.id, `${cta ? cta.titre : P[0].split(' (')[0]}${e.titreInstallation ? ` — ${e.titreInstallation}` : ''} (N${notes.indexOf(n) + 1})`];
    });
  }

  const RECUPERATEURS = { plaques: ['Échangeur à plaques', 150], roue: ['Roue (récupérateur rotatif)', 120], boucle: ['Boucle à eau glycolée', 180], aucun: ['Sans récupérateur', 0] };
  const RESEAUX = { soufflage: 'Soufflage', reprise: 'Reprise', extraction: 'Extraction' };
  const BOUCHES = Cta.BOUCHES;

  // Σζ : singularités écrites en clair (« 2 coudes, piquage, registre ») si renseignées, sinon la valeur saisie
  function zetaAir(x, rep, alertes, defaut) {
    const s = String(x.sing || '').trim();
    if (!s) return num(x.zeta, defaut);
    const r = D.singularites(s, true);
    if (r.inconnus.length) alertes.push(alerte('attention', `${rep} : singularité(s) non reconnue(s) « ${r.inconnus.join(', ')} », non comptée(s).`));
    return r.zeta;
  }
  // Gaine circulaire automatique (ou rectangulaire à hauteur imposée) respectant vmax et Rmax
  // vitesse choisie pour la branche : la gaine est choisie sur cette seule vitesse (diamètre déduit)
  function choisirGaine(Q, e, vmax, vitesseChoisie) {
    const qv = Q / 3600, T = num(e.T, 20), rug = (D.RUGOSITE_GAINE[e.materiau] || D.RUGOSITE_GAINE.galva)[1], Rmax = vitesseChoisie ? Infinity : num(e.Rmax, 1), h = num(e.h, 300);
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
      x.zetaA = zetaAir(x, x.rep, alertes, 3);
      x.dpA = x.antenne.R * num(x.L, 5) + x.zetaA * x.antenne.pd;
      const k = troncons.findIndex(t => t.rep === `Principal → ${x.rep}`);
      x.dpPrincipal = k >= 0 ? amont[k] : amont[amont.length - 1] || 0;
      x.dpTotal = x.dpPrincipal + x.dpA + x.bouche.dp;
      if (x.bouche.v > x.bouche.b.vmax * 1.01) alertes.push(alerte('attention', `${x.rep} : ${x.n} bouche(s) insuffisante(s), vitesse au col ${nf(x.bouche.v, 1)} m/s (ajoutez des bouches).`));
    });
    const defav = z.reduce((m, x) => (!m || x.dpTotal > m.dpTotal ? x : m), null);
    return { zones: z, troncons, Q: z.reduce((s, x) => s + x.Q, 0), dp: defav.dpTotal, defav, alertes };
  }

  /* ---------- Réseau arborescent (antennes et ramifications, comme le réseau hydraulique) ---------- */
  // lignes : tronçons { rep, amont, nom, L, zeta, dim, type (bouches), n, Q (tronçon terminal) } d'un même réseau
  // Débits cumulés depuis les bouches, gaines (principales : vmaxP, terminales : vmaxA, ou dimension imposée),
  // pression nécessaire à l'entrée de chaque tronçon, registres d'équilibrage (sur chaque bouche ou partenaires au pied des antennes)
  function reseauArbo(lignes, e, reseauNom) {
    const rho = C.air(num(e.T, 20)).rho, alertes = [], T = num(e.T, 20), rug = (D.RUGOSITE_GAINE[e.materiau] || D.RUGOSITE_GAINE.galva)[1];
    const dpMin = num(e.dpRegistre, 10), partenaires = e.registres === 'antennes';
    const tr = lignes.map((x, i) => ({ x, rep: String(x.rep || `T${i + 1}`).trim(), amont: String(x.amont || '').trim(), nom: String(x.nom || '').trim(), L: Math.max(0, num(x.L)), zeta: zetaAir(x, String(x.rep || `T${i + 1}`), alertes, 0.5),
      Qsaisi: num(x.Q), n: Math.max(1, Math.round(num(x.n, 1))), type: BOUCHES[x.type] ? x.type : (reseauNom === 'soufflage' ? 'plafond' : 'extraction'), enfants: [] }));
    const parRep = new Map();
    tr.forEach(t => { if (parRep.has(t.rep)) alertes.push(alerte('erreur', `Repère ${t.rep} en double.`)); else parRep.set(t.rep, t); });
    const racines = [];
    tr.forEach(t => { const p = t.amont ? parRep.get(t.amont) : null; if (t.amont && !p) alertes.push(alerte('erreur', `${t.rep} : tronçon amont « ${t.amont} » introuvable dans le réseau de ${reseauNom} (rattaché au ventilateur).`)); if (p && p !== t) p.enfants.push(t); else racines.push(t); });
    const vus = new Set(), parcours = (t, prof) => { if (vus.has(t)) return; vus.add(t); t.prof = prof; t.enfants.forEach(c => parcours(c, prof + 1)); };
    racines.forEach(t => parcours(t, 0));
    tr.filter(t => !vus.has(t)).forEach(t => alertes.push(alerte('erreur', `${t.rep} : boucle dans les tronçons amont, tronçon ignoré.`)));
    const actifs = tr.filter(t => vus.has(t)), terminaux = actifs.filter(t => !t.enfants.length);
    if (!terminaux.length) return { zones: [], troncons: [], Q: 0, dp: 0, defav: null, alertes, arbre: { racines: [], actifs: [], terminaux: [] }, registres: [] };
    // Bouches saisies une par une (salle, étage, débit, fiche technique) et rattachées à leur tronçon terminal
    const rho0 = C.air(num(e.T, 20)).rho;
    const lesBouches = (e.bouchesL || []).filter(b => b && b.troncon && (b.reseau || 'soufflage') === reseauNom || (b && b.troncon && reseauNom !== 'soufflage' && (b.reseau || 'soufflage') !== 'soufflage'));
    tr.forEach(t => {
      const bs = lesBouches.filter(b => String(b.troncon).trim() === t.rep);
      if (!bs.length) return;
      t.bouchesL = bs.map(b => { const ty = BOUCHES[b.type] ? b.type : t.type, auto = choisirBouche(ty, num(b.Q), rho0);
        return { rep: b.rep || '', salle: b.salle || '', zone: b.zone || '', etage: b.etage || '', Q: num(b.Q), type: ty, dp: num(b.dp) > 0 ? num(b.dp) : auto.dp, Lw: num(b.Lw) > 0 ? num(b.Lw) : auto.Lw, taille: num(b.dp) > 0 ? (b.ref || 'fiche') : auto.nom, fiche: num(b.dp) > 0 }; });
      t.Qsaisi = t.bouchesL.reduce((a, b) => a + b.Q, 0); t.n = t.bouchesL.length; t.type = t.bouchesL[0].type;
    });
    const debit = t => { t.Q = t.enfants.length ? t.enfants.reduce((a, c) => a + debit(c), 0) : t.Qsaisi; return t.Q; };
    racines.forEach(debit);
    terminaux.filter(t => !(t.Q > 0)).forEach(t => alertes.push(alerte('erreur', `${t.rep} : tronçon terminal sans débit de bouches.`)));
    actifs.filter(t => t.enfants.length && t.Qsaisi > 0).forEach(t => alertes.push(alerte('attention', `${t.rep} : débit saisi sur un tronçon qui a des tronçons en aval, non pris en compte (les bouches sont en bout de tronçon).`)));
    // Gaines et pertes de charge ; bouches des tronçons terminaux
    actifs.forEach(t => {
      // Vitesse choisie pour la branche (sinon vitesse maxi principale / terminale) → diamètre de la gaine
      const vCh = num(t.x.v) > 0 ? num(t.x.v) : 0, vRef = vCh || (t.enfants.length ? num(e.vmaxP, 6) : num(e.vmaxA, 4));
      const dim = C.lireDimension(t.x.dim), g = dim ? { dim, nom: dim.b ? `${dim.a} × ${dim.b}` : `Ø ${dim.a}`, ...C.gaine(t.Q / 3600, dim, T, rug) } : choisirGaine(t.Q, e, vRef, !!vCh);
      Object.assign(t, { g, nomGaine: g.nom, v: g.v, R: g.R, dp: g.R * t.L + t.zeta * g.pd, auto: !dim, vCh });
      if (!t.enfants.length && t.bouchesL) { const pire = t.bouchesL.reduce((a, b) => (b.dp > a.dp ? b : a)); t.bouche = { b: BOUCHES[pire.type], nom: pire.taille, v: 0, dp: pire.dp, Lw: Math.max(...t.bouchesL.map(b => b.Lw)), liste: t.bouchesL }; }
      if (!dim && g.v > vRef * 1.01) alertes.push(alerte('attention', `${t.rep} : vitesse ${nf(g.v, 1)} m/s même dans la plus grande gaine.`));
      if (dim && g.v > num(e.vmaxP, 6) * 1.01) alertes.push(alerte('attention', `${t.rep} : vitesse ${nf(g.v, 1)} m/s dans la gaine imposée ${g.nom} (bruit, pertes de charge).`));
      if (!t.enfants.length && t.Q > 0 && !t.bouchesL) { t.bouche = choisirBouche(t.type, t.Q / t.n, rho); if (t.bouche.v > t.bouche.b.vmax * 1.01) alertes.push(alerte('attention', `${t.rep} : ${t.n} bouche(s) insuffisante(s), vitesse au col ${nf(t.bouche.v, 1)} m/s (ajoutez des bouches).`)); }
    });
    // Pression nécessaire et registres (même méthode que les vannes d'équilibrage du réseau hydraulique)
    const aRegistre = t => !t.enfants.length || (partenaires && (t.amont && parRep.get(t.amont) ? parRep.get(t.amont).enfants.length > 1 : racines.length > 1));
    const besoin = t => {
      const aval = t.enfants.length ? Math.max(...t.enfants.map(besoin)) : (t.bouche ? t.bouche.dp : 0);
      t.enfants.forEach(c => { c.exces = aval - c.H; });
      t.H = t.dp + aval + (aRegistre(t) ? dpMin : 0);
      return t.H;
    };
    racines.forEach(besoin);
    const Hres = Math.max(...racines.map(t => t.H));
    racines.forEach(t => { t.exces = Hres - t.H; });
    const regler = (t, report) => {
      const total = report + t.exces;
      if (aRegistre(t)) t.dpReg = dpMin + total;
      t.enfants.forEach(c => regler(c, aRegistre(t) ? 0 : total));
    };
    racines.forEach(t => regler(t, 0));
    terminaux.forEach(t => { t.chemin = []; for (let x = t; x; x = x.amont ? parRep.get(x.amont) : null) { t.chemin.unshift(x); if (t.chemin.length > tr.length) break; } });
    const somme = t => t.chemin.reduce((s, x) => s + x.dp, 0) + (t.bouche ? t.bouche.dp : 0);
    const defav = terminaux.reduce((a, t) => (!a || somme(t) > somme(a) ? t : a), null);
    const registres = actifs.filter(t => t.dpReg !== undefined);
    registres.filter(t => t.dpReg > 80).forEach(t => alertes.push(alerte('attention', `${t.rep} : registre à ${nf(t.dpReg, 0)} Pa à dissiper (risque de bruit) : réduire la gaine de ce côté ou rééquilibrer les longueurs.`)));
    // Mise en forme commune avec le réseau à piquages : zones = tronçons terminaux (bouches), tronçons = toutes les gaines
    const zones = terminaux.filter(t => t.bouche).map(t => ({ rep: t.nom || t.rep, reseau: reseauNom, type: t.type, n: t.n, Q: t.Q, L: t.L, d: t.chemin.reduce((s, x) => s + x.L, 0) - t.L,
      bouche: t.bouche, antenne: { nom: t.nomGaine, v: t.v }, dpA: t.dp, dpPrincipal: t.chemin.slice(0, -1).reduce((s, x) => s + x.dp, 0), dpTotal: somme(t) + (t.dpReg || 0), repTroncon: t.rep }));
    const troncons = actifs.map(t => ({ rep: `${t.rep}${t.nom ? ` — ${t.nom}` : ''}`, Q: t.Q, L: t.L, nom: t.nomGaine, v: t.v, R: t.R, dp: t.dp, amont: t.amont, H: t.H, dpReg: t.dpReg, auto: t.auto, vCh: t.vCh, defav: defav && defav.chemin.includes(t) }));
    const bouchesDet = terminaux.flatMap(t => (t.bouchesL || []).map(b => ({ ...b, troncon: t.rep, chemin: t.chemin.map(x => x.rep).join(' → '), dpTot: t.chemin.reduce((s, x) => s + x.dp, 0) + b.dp, defav: t === defav })));
    return { zones, troncons, Q: racines.reduce((s, t) => s + t.Q, 0), dp: Hres, defav: defav ? { rep: defav.nom || defav.rep, dpTotal: Hres, chemin: defav.chemin.map(x => x.rep) } : null, alertes,
      arbre: { racines, actifs, terminaux, defav }, registres, bouches: bouchesDet };
  }

  /* ---------- Acoustique par branche (niveau global pondéré A, méthode simplifiée du bilan acoustique) ---------- */
  // Pour chaque zone (tronçon terminal) : puissance du ventilateur − silencieux − atténuations le long du chemin (gaine nue,
  // coudes, dérivations) + bruit régénéré par le registre et par les bouches → niveau dans le local, comparé à l'objectif
  const log10 = Math.log10, somme = l => 10 * log10(l.reduce((s, x) => s + (Number.isFinite(x) ? 10 ** (x / 10) : 0), 0) || 1e-9);
  function acoustique(res, e, Q, p, LwFab, alertes, nomReseau) {
    if (e.acoustique === 'non' || !res.zones.length || !(Q > 0)) return [];
    const lw0 = Number.isFinite(parseFloat(LwFab)) && String(LwFab).trim() !== '' ? num(LwFab) : 40 + 10 * log10(Q / 3600) + 20 * log10(Math.max(p, 1)) - 7;
    const Lw1 = lw0 - num(e.attSil, 20), FIN = 6, h = num(e.hLocal, 2.7), Tr = num(e.TrLocal, 0.6), rho = C.air(num(e.T, 20)).rho;
    const obj = (Cta.OBJECTIFS[e.usageAcous] || Cta.OBJECTIFS.bureau)[1] || num(e.objectifAcous, 35);
    const coudes = x => (String((x && x.sing) || '').trim() ? D.singularites(x.sing, true).detail.filter(d => /^coude90[rs]/.test(d.code)).reduce((s, d) => s + d.n, 0) : 0);
    return res.zones.map(z => {
      let att = 0;
      if (res.arbre) {
        const t = res.arbre.terminaux.find(x => x.rep === z.repTroncon), chemin = t ? t.chemin : [];
        chemin.forEach((x, i) => { att += 0.15 * x.L + 2 * coudes(x.x); if (i > 0 && chemin[i - 1].Q > 0 && x.Q > 0) att += 10 * log10(chemin[i - 1].Q / x.Q); });
      } else {
        att = 0.15 * (z.d + num(z.L, 5)) + 2 * coudes(z) + (res.Q > 0 && z.Q > 0 ? 10 * log10(res.Q / z.Q) : 0);
      }
      // Plénum de la bouche et réflexion en bout de gaine : 6 dB sur le bruit arrivant par la gaine (ventilateur et registre)
      const Lres = Lw1 - att - FIN;
      // Registre d'équilibrage : bruit régénéré d'après sa perte de charge (ζ ramené à la vitesse de la gaine)
      const tt = res.arbre ? res.arbre.terminaux.find(x => x.rep === z.repTroncon) : null;
      const Lreg = tt && tt.dpReg > 0 && tt.g && tt.g.S ? Cta.lwBouche(tt.g.S, Math.max(0.1, tt.dpReg / Math.max(tt.g.pd, 0.01)), Math.max(tt.v, 0.1)) - FIN : NaN;
      const Lb = z.bouche ? z.bouche.Lw + 10 * log10(z.n) : NaN;
      const S = num(z.S, z.n * 20), loc = Cta.termeLocal(S, h, Tr), Lp = somme([Lres, Lreg, Lb]) + loc.d;
      const statut = Lp > obj ? 'dépassé' : Lp > obj - 3 ? 'marge faible' : 'conforme';
      if (Lp > obj) alertes.push(alerte('attention', `${z.rep} (${nomReseau}) : ${nf(Lp, 0)} dB(A) estimés pour ${nf(obj, 0)} dB(A) visés — ${Lres + loc.d > obj ? `ajouter ${nf(Math.ceil(Lres + loc.d - obj + 3), 0)} dB d'atténuation sur la branche (silencieux, gaine isolée)` : Number.isFinite(Lreg) && Lreg >= Math.max(Lres, Lb || -99) ? 'registre trop fermé : rééquilibrer les branches' : 'bouches trop bruyantes : en ajouter ou prendre la taille au-dessus'}.`));
      return { zone: z.rep, reseau: nomReseau, lw0, att, Lres, Lreg, Lb, S, Lp, obj, statut };
    });
  }

  function calculer(e) {
    const P = PRODUCTEURS[e.producteur] || PRODUCTEURS['cta-df'], souffle = P[1], aspire = P[2], alertes = [];
    const zones = (e.zones || []).map((x, i) => ({ ...x, rep: String(x.rep || `Zone ${i + 1}`).trim(), reseau: RESEAUX[x.reseau] ? x.reseau : 'soufflage', type: BOUCHES[x.type] ? x.type : (x.reseau === 'soufflage' ? 'plafond' : 'extraction') }));
    const arbo = e.structure === 'arborescence', lignesArbo = (e.troncons || []).filter(x => x && (x.rep || x.Q || x.L));
    const rS = arbo ? reseauArbo(souffle ? lignesArbo.filter(x => (x.reseau || 'soufflage') === 'soufflage') : [], e, 'soufflage') : reseau(souffle ? zones.filter(x => x.reseau === 'soufflage') : [], e);
    const rR = arbo ? reseauArbo(aspire ? lignesArbo.filter(x => (x.reseau || 'soufflage') !== 'soufflage') : [], e, (P[1] ? 'reprise' : 'extraction')) : reseau(aspire ? zones.filter(x => x.reseau !== 'soufflage') : [], e);
    if (arbo) lignesArbo.filter(x => (x.reseau || 'soufflage') === 'soufflage' ? !souffle : !aspire).forEach(x => alertes.push(alerte('attention', `${x.rep || 'Tronçon'} : ${(RESEAUX[x.reseau] || 'soufflage').toLowerCase()} sans ventilateur correspondant (${P[0]}).`)));
    alertes.push(...rS.alertes, ...rR.alertes);
    // Bouches une par une : numéro unique (repérage, relevé des débits à la mise en service), rattachées à un tronçon terminal
    if (arbo) {
      const vusB = new Set(), amonts = new Set(lignesArbo.map(t => String(t.amont || '').trim()).filter(Boolean)), reps = new Set(lignesArbo.map(t => String(t.rep || '').trim()));
      (e.bouchesL || []).filter(b => b && (b.rep || b.salle || b.Q || b.troncon)).forEach((b, i) => {
        const r = String(b.rep || '').trim(), qui = r || `Bouche ${i + 1}${b.salle ? ` (${b.salle})` : ''}`, tc = String(b.troncon || '').trim();
        if (!r) alertes.push(alerte('attention', `${qui} sans repère : numérotez les bouches (« 🔢 Numéroter les bouches ») pour les identifier à la mise en service.`));
        else if (vusB.has(r)) alertes.push(alerte('erreur', `Repère de bouche ${r} en double : chaque bouche doit avoir un numéro unique (relevé des débits à la mise en service).`));
        vusB.add(r);
        if (!tc) alertes.push(alerte('attention', `${qui} : rattachée à aucun tronçon, débit non compté dans le réseau.`));
        else if (!reps.has(tc)) alertes.push(alerte('erreur', `${qui} : tronçon « ${tc} » introuvable, débit non compté.`));
        else if (amonts.has(tc)) alertes.push(alerte('attention', `${qui} : piquée sur ${tc} qui alimente d'autres tronçons ; créez une branche terminale pour cette bouche (débit non compté).`));
      });
    }
    (arbo ? [] : zones).filter(x => (x.reseau === 'soufflage' && !souffle) || (x.reseau !== 'soufflage' && !aspire)).forEach(x => alertes.push(alerte('attention', `${x.rep} : ${RESEAUX[x.reseau].toLowerCase()} sans ventilateur correspondant (${P[0]}).`)));
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
    // Fiche technique de la CTA chargée : pression disponible, puissances électriques, débit
    if (e.fiche) { const FC = typeof FicheCta !== 'undefined' ? FicheCta : require('./fiche-cta');
      alertes.push(...FC.controles(e.fiche, { reseauS: souffle ? rS.dp + num(e.dpSil, 50) + num(e.dpPrise, 40) : NaN, reseauR: aspire ? rR.dp + num(e.dpSil, 50) + num(e.dpRejet, 40) : NaN, Pvent: (PvS + PvR) / 1000, Qs: rS.Q })); }
    const acS = acoustique(rS, e, rS.Q, pS, e.LwFabS, alertes, souffle ? 'soufflage' : ''), acR = acoustique(rR, e, rR.Q, pR, e.LwFabR, alertes, dfx || e.producteur === 'cta-melange' ? 'reprise' : 'extraction');
    const ac = [...acS, ...acR];
    const ligneZ = x => [x.rep, RESEAUX[x.reseau], nf(x.Q, 0), `${x.n} × ${x.bouche.b.libelle} ${x.bouche.nom}`, nf(x.bouche.v, 1), nf(x.bouche.dp, 0), x.antenne.nom, nf(x.antenne.v, 1), nf(x.dpA, 0), nf(x.dpTotal, 0)];
    const ligneT = t => [t.rep, nf(t.Q, 0), t.nom, nf(t.L, 1), nf(t.v, 1), nf(t.R, 2), nf(t.dp, 0)];
    const titreS = { 'cta-df': 'Soufflage', 'cta-melange': 'Soufflage', 'cta-sf': 'Soufflage', insufflation: 'Insufflation' }[e.producteur] || 'Soufflage';
    return {
      valeurs: { Qs: rS.Q, Qr: rR.Q, pS, pR, PvS, PvR, sfp, dpReseauS: rS.dp, dpReseauR: rR.dp, cta: e.cta || '',
        // Gaines (métré) : en arborescence chaque tronçon est déjà une gaine ; sinon gaine principale et antennes des zones
        troncons: [...rS.troncons, ...rR.troncons].map(t => ({ rep: t.rep, nom: t.nom, L: t.L })).concat(arbo ? [] : [...rS.zones, ...rR.zones].map(x => ({ rep: `Antenne ${x.rep}`, nom: x.antenne.nom, L: num(x.L, 5) }))),
        registres: [...(rS.registres || []), ...(rR.registres || [])].map(x => ({ rep: x.rep, gaine: x.nomGaine, Q: x.Q, dp: x.dpReg })),
        // Bouches une par une (fiche de mise en service de chaque bouche : débit attendu, branche)
        bouchesDetail: [[rS, 'soufflage'], [rR, P[1] ? 'reprise' : 'extraction']].flatMap(([r, res]) => (r.bouches || []).map(b => ({ rep: b.rep, salle: b.salle, zone: b.zone, etage: b.etage, Q: b.Q, dp: b.dp, troncon: b.troncon, chemin: b.chemin, reseau: res }))),
        // Éléments de gaine pour le métré : réseau, gaine, longueur, surface développée (m²), piquage, registre, singularités
        elements: elementsMetre(arbo, rS, rR, souffle),
        producteur: e.producteur || 'cta-df',
        bouches: [...rS.zones, ...rR.zones].map(x => ({ local: x.rep, type: x.bouche.b.libelle, taille: x.bouche.nom, n: x.n })),
        // Débits théoriques bouche par bouche (relevé d'équilibrage sur le chantier)
        debits: [...rS.zones, ...rR.zones].flatMap((x, i) => Array.from({ length: x.n }, (_, k) => ({ repere: `Z${i + 1}.${k + 1}`, local: x.rep, type: RESEAUX[x.reseau], theorique: Math.round(x.Q / x.n) }))) },
      resume: [['Producteur', `${P[0]}${e.fiche && (e.fiche.fabricant || e.fiche.reference) ? ` — ${[e.fiche.fabricant, e.fiche.reference].filter(Boolean).join(' ')}` : ''}`], ...(souffle ? [[`${titreS}`, `${nf(rS.Q, 0)} m³/h · ${nf(pS, 0)} Pa · ${nf(PvS / 1000, 2)} kW`]] : []),
        ...(aspire ? [[dfx || e.producteur === 'cta-melange' ? 'Reprise' : 'Extraction', `${nf(rR.Q, 0)} m³/h · ${nf(pR, 0)} Pa · ${nf(PvR / 1000, 2)} kW`]] : []),
        ['Puissance spécifique (SFP)', `${nf(sfp, 2)} kW/(m³/s)`], ['Bouches', `${[...rS.zones, ...rR.zones].reduce((s, x) => s + x.n, 0)} dans ${rS.zones.length + rR.zones.length} zone(s)`],
        ...(arbo ? [['Registres d\'équilibrage', `${(rS.registres || []).length + (rR.registres || []).length} (${e.registres === 'antennes' ? 'bouches et pied des antennes' : 'sur chaque branche terminale'})`]] : []),
        ...(rS.defav ? [['Zone la plus défavorisée au soufflage', `${rS.defav.rep} (${nf(rS.defav.dpTotal, 0)} Pa de réseau)`]] : []), ...(rR.defav ? [['Zone la plus défavorisée en reprise / extraction', `${rR.defav.rep} (${nf(rR.defav.dpTotal, 0)} Pa)`]] : [])],
      tableaux: [
        { titre: 'Zones et bouches (émetteurs)', entetes: ['Zone', 'Réseau', 'Q (m³/h)', 'Bouches', 'v col (m/s)', 'ΔP bouche (Pa)', 'Antenne', 'v (m/s)', 'ΔP antenne (Pa)', 'ΔP depuis le ventilateur (Pa)'], lignes: [...rS.zones, ...rR.zones].map(ligneZ) },
        ...(arbo ? [rS, rR].filter(r => r.troncons.length).flatMap((r, k) => [
          { titre: `Arborescence du réseau de ${r === rS ? titreS.toLowerCase() : (dfx || e.producteur === 'cta-melange' ? 'reprise' : 'extraction')} (débits cumulés ; ★ branche la plus défavorisée)`, entetes: ['Tronçon', 'Amont', 'Q (m³/h)', 'Vitesse choisie (m/s)', 'Gaine (mm)', 'L (m)', 'v réelle (m/s)', 'R (Pa/m)', 'ΔP (Pa)', 'Pression nécessaire à l\'entrée (Pa)'],
            lignes: r.troncons.map(x => [`${x.defav ? '★ ' : ''}${x.rep}`, x.amont || 'ventilateur', nf(x.Q, 0), x.vCh ? nf(x.vCh, 1) : 'auto', `${x.nom}${x.auto ? '' : ' (imposée)'}`, nf(x.L, 1), nf(x.v, 1), nf(x.R, 2), nf(x.dp, 0), nf(x.H, 0)]) },
          ...(r.bouches && r.bouches.length ? [{ titre: `Bouches — ${r === rS ? titreS.toLowerCase() : 'reprise / extraction'} (ΔP de la fiche technique, sinon de la gamme générique)`, entetes: ['Bouche', 'Salle', 'Étage', 'Q (m³/h)', 'Tronçon', 'Modèle', 'ΔP bouche (Pa)', 'Lw (dB(A))', 'ΔP depuis le ventilateur (Pa)', 'Chemin'],
            lignes: r.bouches.map(b => [`${b.defav ? '★ ' : ''}${b.rep}`, b.salle, b.etage, nf(b.Q, 0), b.troncon, `${b.taille}${b.fiche ? ' ✓' : ''}`, nf(b.dp, 0), nf(b.Lw, 0), nf(b.dpTot, 0), b.chemin]) }] : []),
          ...(r.registres.length ? [{ titre: `Registres d'équilibrage — ${r === rS ? titreS.toLowerCase() : 'reprise / extraction'}`, entetes: ['Registre', 'Gaine', 'Q (m³/h)', 'ΔP à dissiper (Pa)'], lignes: r.registres.map(x => [`${x.rep}${x.nom ? ` — ${x.nom}` : ''}`, x.nomGaine, nf(x.Q, 0), nf(x.dpReg, 0)]) }] : [])]) : []),
        ...(!arbo && rS.troncons.length ? [{ titre: `Gaine principale de ${titreS.toLowerCase()}`, entetes: ['Tronçon', 'Q (m³/h)', 'Gaine (mm)', 'L (m)', 'v (m/s)', 'R (Pa/m)', 'ΔP (Pa)'], lignes: rS.troncons.map(ligneT) }] : []),
        ...(!arbo && rR.troncons.length ? [{ titre: 'Gaine principale de reprise / extraction', entetes: ['Tronçon', 'Q (m³/h)', 'Gaine (mm)', 'L (m)', 'v (m/s)', 'R (Pa/m)', 'ΔP (Pa)'], lignes: rR.troncons.map(ligneT) }] : []),
        ...(ac.length ? [{ titre: 'Acoustique par zone (niveau global dB(A), méthode simplifiée)', entetes: ['Zone', 'Réseau', 'Lw ventilateur', 'Atténuation silencieux + réseau', 'Lw arrivant par le réseau', 'Lw registre', 'Lw bouches', 'LpA local', 'Objectif', 'Statut'],
          lignes: ac.map(a => [a.zone, a.reseau, nf(a.lw0, 0), nf(num(e.attSil, 20) + a.att + 6, 1), nf(a.Lres, 0), Number.isFinite(a.Lreg) ? nf(a.Lreg, 0) : '—', Number.isFinite(a.Lb) ? nf(a.Lb, 0) : '—', nf(a.Lp, 0), nf(a.obj, 0), a.statut]) }] : []),
        { titre: 'Ventilateurs', entetes: ['Ventilateur', 'Débit (m³/h)', 'Réseau (Pa)', 'Composants (Pa)', 'Pression avec marge (Pa)', 'Puissance absorbée (kW)'],
          lignes: [...(souffle ? [[titreS, nf(rS.Q, 0), nf(rS.dp, 0), `${nf(sum(compS), 0)} (${compS.map(c => c[0].toLowerCase()).join(', ')})`, nf(pS, 0), nf(PvS / 1000, 2)]] : []),
            ...(aspire ? [[dfx || e.producteur === 'cta-melange' ? 'Reprise' : 'Extraction', nf(rR.Q, 0), nf(rR.dp, 0), `${nf(sum(compR), 0)} (${compR.map(c => c[0].toLowerCase()).join(', ')})`, nf(pR, 0), nf(PvR / 1000, 2)]] : [])] },
      ],
      alertes,
      hypotheses: [`Air à ${nf(num(e.T, 20), 0)} °C ; gaines ${e.forme === 'rect' ? `rectangulaires de ${num(e.h, 300)} mm de hauteur` : 'circulaires'}, Darcy-Weisbach / Colebrook, singularités Σζ · ρv²/2.`,
        arbo ? `Réseau arborescent : chaque tronçon a son tronçon amont (vide : départ du ventilateur) ; débits cumulés depuis les bouches ; gaines avec aval : v ≤ ${nf(num(e.vmaxP, 6), 1)} m/s, terminales : v ≤ ${nf(num(e.vmaxA, 4), 1)} m/s, R ≤ ${nf(num(e.Rmax, 1), 2)} Pa/m (ou dimension imposée). Registres : ${nf(num(e.dpRegistre, 10), 0)} Pa mini pour un réglage fiable, plus l'excès de pression de leur branche par rapport à la plus défavorisée${e.registres === 'antennes' ? ' (registres partenaires au pied des antennes)' : ''}.`
          : `Gaine principale : v ≤ ${nf(num(e.vmaxP, 6), 1)} m/s, antennes : v ≤ ${nf(num(e.vmaxA, 4), 1)} m/s, R ≤ ${nf(num(e.Rmax, 1), 2)} Pa/m ; principal découpé entre les piquages des zones, débit des zones en aval.`,
        'Bouches : gammes génériques, plus petite taille dont la vitesse au col reste sous la vitesse maximale de la gamme ; ΔP = ζ · ρv²/2 au col.',
        'Chemin le plus défavorisé : principal jusqu\'au piquage + antenne + bouche ; pression du ventilateur = réseau + composants de la CTA, avec la marge.',
        'Pertes de charge des composants : valeurs usuelles modifiables (filtres à mi-encrassement) ; à remplacer par celles du constructeur.',
        ...(ac.length ? ['Acoustique (niveau global pondéré A, à confirmer par bande d\'octave pour les locaux sensibles) : ventilateur Lw ≈ 40 + 10 · log Q + 20 · log Δp − 7 dB(A) (ou donnée du fabricant), silencieux saisi, gaine nue 0,15 dB/m, coude 2 dB, dérivation 10 · log(Q amont / Q branche), plénum et réflexion en bout de gaine 6 dB ; registre et bouches : bruit régénéré d\'après leur perte de charge ; local : A = 0,16 · V / Tr, surface du local saisie ou 20 m² par bouche.'] : [])],
      synthese: `${P[0].split(' (')[0]} · ${souffle ? `${nf(rS.Q, 0)} m³/h soufflés` : ''}${souffle && aspire ? ' · ' : ''}${aspire ? `${nf(rR.Q, 0)} m³/h ${dfx || e.producteur === 'cta-melange' ? 'repris' : 'extraits'}` : ''} · SFP ${nf(sfp, 2)}`,
      schema: dessiner(e, P, arbo ? { ...rS, troncons: [] } : rS, arbo ? { ...rR, troncons: [] } : rR, { compS, compR, recup: dfx ? recup[0] : '', pS, pR }),
      titreSchema: 'Schéma de principe aéraulique',
      // Arborescence : schéma unifilaire de chaque réseau (antennes et ramifications, registres, chemin le plus défavorisé)
      schemas: arbo ? [[rS, titreS, '#1f6fb2'], [rR, dfx || e.producteur === 'cta-melange' ? 'Reprise' : 'Extraction', '#c2410c']].filter(([r]) => r.arbre && r.arbre.terminaux.length)
        .map(([r, nom, c]) => ({ titre: `Arborescence du réseau de ${nom.toLowerCase()}`, svg: dessinerArbre(r, nom, c) })) : [],
    };
  }

  // Surface développée d'une gaine (m² par m) d'après son nom (« Ø 450 », « 600 × 300 »)
  const perimetre = nom => { const r = /Ø\s*(\d+)/.exec(nom || ''), q = /(\d+)\s*×\s*(\d+)/.exec(nom || ''); return r ? Math.PI * r[1] / 1000 : q ? 2 * (+q[1] + +q[2]) / 1000 : 0; };
  const singDe = x => (String((x && x.sing) || '').trim() ? D.singularites(x.sing, true).detail : []);
  function elementsMetre(arbo, rS, rR, souffle) {
    const out = [], nomR = r => (r === rS && souffle ? 'soufflage' : 'reprise');
    [rS, rR].forEach(r => {
      if (arbo) (r.arbre ? r.arbre.actifs : []).forEach(t => out.push({ reseau: nomR(r), gaine: t.nomGaine, L: t.L, surface: perimetre(t.nomGaine) * t.L, piquage: !!t.amont, registre: t.dpReg !== undefined, sing: singDe(t.x) }));
      else {
        r.troncons.forEach(t => out.push({ reseau: nomR(r), gaine: t.nom, L: t.L, surface: perimetre(t.nom) * t.L, piquage: false, registre: false, sing: [] }));
        r.zones.forEach(z => out.push({ reseau: nomR(r), gaine: z.antenne.nom, L: num(z.L, 5), surface: perimetre(z.antenne.nom) * num(z.L, 5), piquage: true, registre: true, sing: singDe(z) }));
      }
    });
    return out;
  }

  /* ---------- Arborescence d'un réseau (comme le réseau hydraulique) ---------- */
  function dessinerArbre(res, nom, c) {
    const { racines, defav } = res.arbre, PAS = 62, X0 = 110, DX = 190, out = [];
    let ligne = 0, profMax = 0;
    const placer = t => { profMax = Math.max(profMax, t.prof); if (!t.enfants.length) { t.y = 60 + ligne++ * PAS; return t.y; } t.enfants.forEach(placer); t.y = t.enfants[0].y; return t.y; };
    racines.forEach(placer);
    const W = X0 + (profMax + 1) * DX + 220, H = 60 + ligne * PAS + 30, X = p => X0 + p * DX;
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const L = (x1, y1, x2, y2, w = 2.5) => out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"/>`);
    const T = (x, y, s, o = {}) => out.push(`<text x="${x}" y="${y}" font-size="${o.fs || 9}" fill="${o.c || '#222'}"${o.a ? ` text-anchor="${o.a}"` : ''}${o.b ? ' font-weight="bold"' : ''}>${esc(s)}</text>`);
    const registre = (x, y, t) => { out.push(`<line x1="${x - 7}" y1="${y + 7}" x2="${x + 7}" y2="${y - 7}" stroke="#222" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="7" fill="none" stroke="#222" stroke-width="1"/>`); T(x, y + 20, `${nf(t.dpReg, 0)} Pa`, { fs: 8, a: 'middle' }); };
    const chemin = new Set(defav ? defav.chemin : []);
    const y0 = racines[0].y, yN = racines[racines.length - 1].y;
    out.push(`<circle cx="40" cy="${y0}" r="16" fill="#fff" stroke="${c}" stroke-width="2"/>`); T(40, y0 + 4, { Soufflage: 'VS', Insufflation: 'VI', Reprise: 'VR' }[nom] || 'VE', { a: 'middle', b: true });
    T(40, y0 + 32, `${nf(res.Q, 0)} m³/h`, { a: 'middle', c, b: true }); T(40, y0 + 44, `${nf(res.dp, 0)} Pa`, { a: 'middle', fs: 8 });
    L(56, y0, X(0), y0, 4); if (racines.length > 1) L(X(0), y0, X(0), yN, 4);
    const tracer = t => {
      const x1 = X(t.prof), x2 = X(t.prof + 1), y = t.y, w = chemin.has(t) ? 4 : 2.2;
      if (t.enfants.length) { L(x1, y, x2, y, w); L(x2, y, x2, t.enfants[t.enfants.length - 1].y, w); t.enfants.forEach(tracer); }
      else {
        const xe = X(profMax + 1) - 10;
        L(x1, y, xe, y, w);
        for (let k = 0; k < Math.min(t.n, 5); k++) out.push(`<rect x="${xe + 4 + k * 13}" y="${y - 6}" width="10" height="12" fill="#fff" stroke="${c}"/>`);
        T(xe + 76, y - 3, t.nom || t.rep, { b: true }); T(xe + 76, y + 10, `${nf(t.Q, 0)} m³/h · ${t.n} × ${t.bouche ? t.bouche.nom : ''}`, { fs: 8 });
      }
      T(x1 + 10, y - 7, `${t.rep} · ${t.nomGaine} · ${nf(t.Q, 0)} m³/h`, { fs: 8.5, c: chemin.has(t) ? c : '#222' });
      if (t.dpReg !== undefined) registre(t.enfants.length ? x1 + DX * 0.7 : X(profMax + 1) - 40, y, t);
    };
    racines.forEach(tracer);
    T(10, H - 8, 'Chemin le plus défavorisé en trait épais ; registres d\'équilibrage avec la pression à dissiper ; gaines dimensionnées sur le débit cumulé.', { fs: 8.5 });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif"><rect width="${W}" height="${H}" fill="#fff"/>${out.join('')}</svg>`;
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
      { g: 'Producteur' },
      { k: 'cta', l: 'Calcul de CTA relié (type, récupérateur, batteries et pertes de charge repris ; débits et réseau renvoyés à la CTA)', t: 's', o: (e, ctx) => [['', 'Saisie (pas de calcul de CTA relié)'], ...((ctx && ctx.notes) || []).map((n, i) => [n, i]).filter(([n]) => n.type === 'cta').map(([n, i]) => [n.id, `N${i + 1} — ${n.titre}`])], d: '' },
      { k: 'titreInstallation', l: 'Installation', t: 't', d: 'CTA bureaux' },
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
      { k: 'structure', l: 'Structure du réseau', t: 's', o: [['piquages', 'Gaine principale et piquages vers les zones'], ['arborescence', 'Arborescence : antennes et ramifications (comme le réseau hydraulique)']], d: 'piquages' },
      { k: 'troncons', l: 'Tronçons (amont vide = départ du ventilateur ; un tronçon sans tronçon en aval porte les bouches et leur débit ; dimension vide = auto, « 400 » = Ø 400, « 600x300 »)', t: 'lignes', si: e => e.structure === 'arborescence', d: [
        { rep: 'S', reseau: 'soufflage', amont: '', nom: 'Gaine principale de soufflage', L: 8, zeta: 0.6, dim: '', type: 'plafond', n: '', Q: '' },
        { rep: 'S1', reseau: 'soufflage', amont: 'S', nom: 'Antenne R+1', L: 15, zeta: 0.5, dim: '', type: 'plafond', n: '', Q: '' },
        { rep: 'S1.1', reseau: 'soufflage', amont: 'S1', nom: 'Bureaux R+1 est', L: 6, zeta: 1.5, dim: '', type: 'plafond', n: 4, Q: 800 },
        { rep: 'S1.2', reseau: 'soufflage', amont: 'S1', nom: 'Bureaux R+1 ouest', L: 12, zeta: 1.5, dim: '', type: 'plafond', n: 4, Q: 800 },
        { rep: 'S2', reseau: 'soufflage', amont: 'S', nom: 'Antenne RDC', L: 20, zeta: 0.5, dim: '', type: 'plafond', n: '', Q: '' },
        { rep: 'S2.1', reseau: 'soufflage', amont: 'S2', nom: 'Salle de réunion', L: 6, zeta: 1.5, dim: '', type: 'helico', n: 4, Q: 900 },
        { rep: 'S2.2', reseau: 'soufflage', amont: 'S2', nom: 'Accueil', L: 9, zeta: 1.5, dim: '', type: 'grille', n: 2, Q: 500 },
        { rep: 'R', reseau: 'reprise', amont: '', nom: 'Gaine principale de reprise', L: 8, zeta: 0.6, dim: '', type: 'extraction', n: '', Q: '' },
        { rep: 'R1', reseau: 'reprise', amont: 'R', nom: 'Bureaux R+1 (reprise)', L: 12, zeta: 1.5, dim: '', type: 'extraction', n: 4, Q: 1500 },
        { rep: 'R2', reseau: 'reprise', amont: 'R', nom: 'Antenne RDC (reprise)', L: 15, zeta: 0.5, dim: '', type: 'extraction', n: '', Q: '' },
        { rep: 'R2.1', reseau: 'reprise', amont: 'R2', nom: 'Salle de réunion (reprise)', L: 5, zeta: 1.5, dim: '', type: 'extraction', n: 2, Q: 950 },
        { rep: 'R2.2', reseau: 'reprise', amont: 'R2', nom: 'Sanitaires', L: 8, zeta: 1.5, dim: '', type: 'extraction', n: 6, Q: 450 }],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'reseau', l: 'Réseau', t: 's', o: Object.entries(RESEAUX) }, { k: 'amont', l: 'Amont', t: 't' }, { k: 'nom', l: 'Désignation', t: 't' },
          { k: 'L', l: 'Longueur (m)' }, { k: 'zeta', l: 'Σζ' }, { k: 'sing', l: 'Singularités (ex. « 2 coudes, piquage, registre » : remplacent Σζ)', t: 't' }, { k: 'v', l: 'Vitesse choisie (m/s ; vide = auto)' }, { k: 'dim', l: 'Gaine (mm)', t: 't' }, { k: 'type', l: 'Bouches', t: 's', o: Object.entries(BOUCHES).map(([k, b]) => [k, b.libelle]) },
          { k: 'n', l: 'Nombre de bouches' }, { k: 'Q', l: 'Débit des bouches (m³/h)' }] },
      { k: 'bouchesL', l: 'Bouches une par une (salle et étage pour le repérage ; rattachées à un tronçon terminal, elles en donnent le débit ; « 📄 » charge la fiche technique)', t: 'lignes', si: e => e.structure === 'arborescence', d: [],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'installation', l: 'CTA / extracteur', t: 's', o: (e, et) => [['', 'Ce schéma'], ...installationsAir(et)] }, { k: 'reseau', l: 'Réseau', t: 's', o: Object.entries(RESEAUX) },
          { k: 'salle', l: 'Pièce', t: 't' }, { k: 'zone', l: 'Zone', t: 't' }, { k: 'etage', l: 'Étage', t: 't' },
          { k: 'type', l: 'Type', t: 's', o: Object.entries(BOUCHES).map(([k, b]) => [k, b.libelle]) }, { k: 'Q', l: 'Débit (m³/h)' },
          { k: 'troncon', l: 'Tronçon', t: 's', o: e => [['', '—'], ...(e.troncons || []).filter(t => t.rep).map(t => [t.rep, `${t.rep}${t.nom ? ` — ${t.nom}` : ''}`])] },
          { k: 'dp', l: 'ΔP fiche (Pa)' }, { k: 'Lw', l: 'Lw fiche (dB(A))' }, { k: 'ref', l: 'Fabricant, référence', t: 't' }] },
      { k: 'registres', l: 'Registres d\'équilibrage', t: 's', o: [['bouches', 'Sur chaque branche terminale (bouches)'], ['antennes', 'Sur chaque branche et au pied des antennes (registres partenaires)']], d: 'bouches', si: e => e.structure === 'arborescence' },
      { k: 'dpRegistre', l: 'ΔP mini d\'un registre (réglage fiable)', u: 'Pa', d: 10, si: e => e.structure === 'arborescence' },
      { k: 'zones', l: 'Zones (distance : longueur de gaine principale du ventilateur jusqu\'au piquage de la zone)', t: 'lignes', si: e => e.structure !== 'arborescence', d: [
        { rep: 'Bureaux R+1', reseau: 'soufflage', type: 'plafond', n: 8, Q: 1600, distance: 10, L: 12, zeta: 3 },
        { rep: 'Salle de réunion', reseau: 'soufflage', type: 'helico', n: 4, Q: 900, distance: 25, L: 8, zeta: 3 },
        { rep: 'Accueil', reseau: 'soufflage', type: 'grille', n: 2, Q: 500, distance: 35, L: 6, zeta: 3 },
        { rep: 'Bureaux R+1 (reprise)', reseau: 'reprise', type: 'extraction', n: 4, Q: 1500, distance: 10, L: 10, zeta: 3 },
        { rep: 'Sanitaires', reseau: 'extraction', type: 'extraction', n: 6, Q: 450, distance: 20, L: 8, zeta: 3 },
        { rep: 'Salle de réunion (reprise)', reseau: 'reprise', type: 'extraction', n: 2, Q: 950, distance: 25, L: 6, zeta: 3 }],
        colonnes: [{ k: 'rep', l: 'Zone', t: 't' }, { k: 'reseau', l: 'Réseau', t: 's', o: Object.entries(RESEAUX) }, { k: 'type', l: 'Bouches', t: 's', o: Object.entries(BOUCHES).map(([k, b]) => [k, b.libelle]) },
          { k: 'n', l: 'Nombre de bouches' }, { k: 'Q', l: 'Débit de la zone (m³/h)' }, { k: 'distance', l: 'Distance au ventilateur (m)' }, { k: 'L', l: 'Longueur de l\'antenne (m)' }, { k: 'zeta', l: 'Σζ de l\'antenne' }, { k: 'sing', l: 'Singularités de l\'antenne (remplacent Σζ)', t: 't' }] },
      { g: 'Acoustique des locaux' },
      { k: 'acoustique', l: 'Estimer le niveau sonore dans chaque zone', t: 's', o: [['oui', 'Oui'], ['non', 'Non']], d: 'oui' },
      { k: 'usageAcous', l: 'Objectif', t: 's', o: Object.entries(Cta.OBJECTIFS).filter(([k]) => k !== 'perso').map(([k, o]) => [k, `${o[0]} : ${o[1]} dB(A)`]), d: 'bureau', si: e => e.acoustique !== 'non' },
      { k: 'attSil', l: 'Atténuation des silencieux (par réseau, donnée du fabricant)', u: 'dB(A)', d: 20, si: e => e.acoustique !== 'non' },
      { k: 'LwFabS', l: 'Puissance acoustique du ventilateur de soufflage, côté gaine (vide : estimée)', u: 'dB(A)', d: '', si: e => e.acoustique !== 'non' && e.producteur !== 'extraction' },
      { k: 'LwFabR', l: 'Puissance acoustique du ventilateur de reprise / extraction (vide : estimée)', u: 'dB(A)', d: '', si: e => e.acoustique !== 'non' && !['cta-sf', 'insufflation'].includes(e.producteur) },
      { k: 'hLocal', l: 'Hauteur des locaux', u: 'm', d: 2.7, si: e => e.acoustique !== 'non' }, { k: 'TrLocal', l: 'Durée de réverbération des locaux', u: 's', d: 0.6, si: e => e.acoustique !== 'non' },
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
  // Fiche technique d'une bouche : perte de charge (Pa), puissance acoustique (dB(A)), débit de sélection, fabricant
  function lireFicheBouche(lignes) {
    const L = (Array.isArray(lignes) ? lignes : String(lignes || '').split(/\r?\n/)).map(String).filter(l => l.trim()), v = {}, src = {};
    const norm = x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/m\s*(?:³|3)\s*\/\s*h/g, 'm3/h');
    const nb = (x, u) => { const m = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${u})(?![a-z])`).exec(x); return m ? Number(m[1].replace(',', '.')) : undefined; };
    L.forEach((l, i) => { const x = norm(l);
      if (v.dp === undefined && /perte de charge|delta ?p|pression totale|pressure drop|\bdpt?\b/.test(x)) { const n = nb(x, 'pa'); if (n > 0 && n < 500) { v.dp = n; src.dp = l.trim(); } }
      if (v.Lw === undefined && /\blw|puissance acoustique|sound power|niveau de puissance/.test(x)) { const n = nb(x, 'db\\s*\\(?a\\)?|dba|db'); if (n > 5 && n < 100) { v.Lw = n; src.Lw = l.trim(); } }
      if (v.Q === undefined && /debit|air flow|airflow/.test(x)) { const n = nb(x, 'm3/h'); if (n > 5 && n < 20000) { v.Q = n; src.Q = l.trim(); } } });
    let fabricant = '', reference = '';
    try { const FT = typeof FichesTech !== 'undefined' ? FichesTech : require('../../../public/js/fiches-tech'); const a = FT.analyser({ texte: L.join('\n') }); fabricant = a.fabricant || ''; reference = (a.references || [])[0] || ''; } catch (err) { /* sans bibliothèque */ }
    return { valeurs: v, sources: src, fabricant, reference, nb: Object.keys(v).length };
  }
  return { PRODUCTEURS, RECUPERATEURS, RESEAUX, calculer, choisirGaine, choisirBouche, lireFicheBouche, installationsAir };
})(typeof Donnees !== 'undefined' ? Donnees : require('./donnees'), typeof Calculs !== 'undefined' ? Calculs : require('./calculs'), typeof Notes !== 'undefined' ? Notes : require('./notes'), typeof Cta !== 'undefined' ? Cta : require('./cta'));
if (typeof module !== 'undefined') module.exports = SchemaAir;
