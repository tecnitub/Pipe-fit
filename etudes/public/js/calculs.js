// Moteur physique du bureau d'études fluides (unités SI sauf mention) : propriétés des fluides, pertes de charge
// (Darcy-Weisbach / Colebrook), écoulements compressibles (vapeur, air comprimé), aéraulique, isolation thermique,
// vases d'expansion (NF EN 12828), dilatation, épaisseur sous pression (NF EN 13480-3), portées entre supports.
const Calculs = (D => {
  const G = 9.81, SIGMA_SB = 5.67e-8;
  // Interpolation linéaire dans une table [[x, y1, y2…]] (bornée aux extrémités) ; col = indice de la colonne lue
  function interp(table, x, col = 1, log = false) {
    if (x <= table[0][0]) return table[0][col];
    for (let i = 1; i < table.length; i++) {
      if (x <= table[i][0]) {
        const [a, b] = [table[i - 1], table[i]], t = (x - a[0]) / (b[0] - a[0]);
        return log ? Math.exp(Math.log(a[col]) + t * (Math.log(b[col]) - Math.log(a[col]))) : a[col] + t * (b[col] - a[col]);
      }
    }
    return table[table.length - 1][col];
  }
  const horsTable = (table, x) => x < table[0][0] || x > table[table.length - 1][0];

  /* ---------- Fluides ---------- */
  // Eau liquide : masse volumique (Kell 1975, 0–150 °C), cp tabulé, viscosité dynamique (Vogel)
  function eau(T) {
    const rho = (999.83952 + 16.945176 * T - 7.9870401e-3 * T ** 2 - 46.170461e-6 * T ** 3 + 105.56302e-9 * T ** 4 - 280.54253e-12 * T ** 5) / (1 + 16.879850e-3 * T);
    const mu = 2.414e-5 * 10 ** (247.8 / (T + 273.15 - 140));
    return { rho, cp: interp(D.CP_EAU, T) * 1000, mu, nu: mu / rho, gel: 0 };
  }
  // Liquide caloporteur : 'eau', mélange glycolé (Donnees.GLYCOLS) ou { rho, cp (kJ/kg·K), mu (mPa·s) } personnalisé
  function liquide(fluide, T, perso) {
    if (!fluide || fluide === 'eau') return { ...eau(T), libelle: 'Eau' };
    if (fluide === 'perso') {
      const p = perso || {}, rho = +p.rho || 1000, mu = (+p.mu || 1) / 1000;
      return { rho, cp: (+p.cp || 4.18) * 1000, mu, nu: mu / rho, gel: p.gel !== undefined && p.gel !== '' ? +p.gel : null, libelle: 'Fluide défini par l\'utilisateur' };
    }
    // Fluide d'une fiche fabricant importée : points [T, ρ, cp, μ] interpolés (viscosité en logarithme)
    const fab = FLUIDES_FAB[fluide];
    if (fab) {
      const t = fab.points, rho = interp(t, T, 1), mu = interp(t, T, 3, true) / 1000;
      return { rho, cp: interp(t, T, 2) * 1000, mu, nu: mu / rho, gel: fab.gel, libelle: fab.libelle, horsPlage: horsTable(t, T), fabricant: true };
    }
    const g = D.GLYCOLS[fluide];
    if (!g) throw new Error(`Fluide inconnu : ${fluide}`);
    const rho = g.rho20 + g.drho * (T - 20), mu = interp(g.mu, T, 1, true) / 1000;
    return { rho, cp: (g.cp20 + g.dcp * (T - 20)) * 1000, mu, nu: mu / rho, gel: g.gel, libelle: g.libelle, horsPlage: horsTable(g.mu, T) };
  }
  // Fluides caloporteurs des fiches fabricants (Réglages) : { cle: { libelle, gel, points: [[T, ρ, cp kJ/kg·K, μ mPa·s]] } }
  let FLUIDES_FAB = {};
  const utiliserFluides = liste => { FLUIDES_FAB = Object.fromEntries((liste || []).map(f => [f.cle, f])); };
  const fluidesFabricant = () => Object.values(FLUIDES_FAB);
  // Import CSV : fluide;concentration %;T °C;ρ kg/m³;cp kJ/kg·K;μ mPa·s;gel °C — une ligne par température
  function lireFluidesCsv(texte) {
    const n = v => parseFloat(String(v || '').replace(',', '.').trim());
    const lignes = String(texte || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean), sep = (lignes[0] || '').includes(';') ? ';' : ',';
    const groupes = new Map(), rejets = [];
    lignes.forEach((l, i) => {
      const c = l.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
      if (i === 0 && /fluide/i.test(l)) return;
      const [nom, conc, T, rho, cp, mu, gel] = [c[0], n(c[1]), n(c[2]), n(c[3]), n(c[4]), n(c[5]), n(c[6])];
      if (!nom || ![T, rho, cp, mu].every(Number.isFinite) || rho <= 0 || cp <= 0 || mu <= 0) return rejets.push(i + 1);
      const cle = `fab:${nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}${Number.isFinite(conc) ? `-${conc}` : ''}`;
      const g = groupes.get(cle) || { cle, libelle: `${nom}${Number.isFinite(conc) ? ` ${conc} %` : ''} (fiche fabricant)`, gel: null, points: [] };
      g.points.push([T, rho, cp, mu]); if (Number.isFinite(gel)) g.gel = gel;
      groupes.set(cle, g);
    });
    const liste = [...groupes.values()].filter(g => g.points.length >= 2).map(g => ({ ...g, points: g.points.sort((a, b) => a[0] - b[0]) }));
    return { liste, rejets, incomplets: [...groupes.values()].filter(g => g.points.length < 2).map(g => g.libelle) };
  }
  // Air (ou gaz assimilé) : masse volumique à la pression absolue p (Pa) et viscosité de Sutherland
  const R_AIR = 287.05;
  const air = (T, p = 101325) => { const K = T + 273.15, mu = 1.716e-5 * (K / 273.15) ** 1.5 * (273.15 + 110.4) / (K + 110.4); return { rho: p / (R_AIR * K), mu, cp: 1006 }; };
  // Vapeur d'eau saturée à la pression absolue p (bar) ; interpolation logarithmique du volume massique
  function vapeurSat(pAbs) {
    const t = D.VAPEUR, lp = Math.log(Math.max(pAbs, 0.05));
    const tl = t.map(r => [Math.log(r[0]), r[1], r[2], r[3], r[4]]);
    const T = interp(tl, lp, 1), vg = interp(tl, lp, 2, true), hl = interp(tl, lp, 3), r = interp(tl, lp, 4);
    return { T, vg, rho: 1 / vg, hl, r, hv: hl + r, mu: (8.0 + 0.04 * T) * 1e-6, horsPlage: pAbs < t[0][0] || pAbs > t[t.length - 1][0] };
  }
  const pressionVapeurEau = T => (T <= 100 ? 0 : interp(D.PVAP, T)); // bar absolus
  // Point de rosée (formule de Magnus), °C
  function pointRosee(T, HR) {
    const g = Math.log(Math.max(HR, 1) / 100) + 17.62 * T / (243.12 + T);
    return 243.12 * g / (17.62 - g);
  }

  /* ---------- Tubes ---------- */
  const parDN = cle => /^(acier|inox-1127|inox-sch)/.test(cle);
  const tubes = cle => {
    const s = D.SERIES[cle];
    if (!s) throw new Error(`Série de tubes inconnue : ${cle}`);
    return s.tubes.map(([dn, de, ep]) => ({ cle: `${de}x${ep}`, dn, de, ep, di: de - 2 * ep, serie: cle, nom: nomTube(cle, dn, de, ep) }));
  };
  function nomTube(cle, dn, de, ep) {
    const f = v => String(v).replace('.', ',');
    return parDN(cle) ? `DN ${dn} (${f(de)} × ${f(ep)})` : `Ø ${f(de)} × ${f(ep)}`;
  }
  const tube = (cle, cleTube) => tubes(cle).find(t => t.cle === cleTube) || null;

  /* ---------- Pertes de charge ---------- */
  // Coefficient de frottement de Darcy : laminaire 64/Re, Colebrook-White en turbulent, interpolation en zone critique
  function colebrook(Re, rel) {
    let l = 0.25 / Math.log10(rel / 3.7 + 5.74 / Re ** 0.9) ** 2; // Swamee-Jain pour démarrer
    for (let i = 0; i < 30; i++) {
      const n = (-2 * Math.log10(rel / 3.7 + 2.51 / (Re * Math.sqrt(l)))) ** -2;
      if (Math.abs(n - l) < 1e-10) return n;
      l = n;
    }
    return l;
  }
  function frottement(Re, rel) {
    if (Re <= 0) return 0;
    if (Re < 2300) return 64 / Re;
    if (Re < 4000) { const t = (Re - 2300) / 1700; return (1 - t) * 64 / 2300 + t * colebrook(4000, rel); }
    return colebrook(Re, rel);
  }
  const regime = Re => (Re < 2300 ? 'laminaire' : Re < 4000 ? 'critique' : 'turbulent');
  // Écoulement en conduite pleine : qv (m³/s), Dh (m), rho, mu, rugosité (mm) → vitesse, Reynolds, λ, perte linéique R (Pa/m)
  function ecoulement(qv, Dh, rho, mu, rugMm, section) {
    const A = section || Math.PI * Dh * Dh / 4, v = qv / A, Re = rho * v * Dh / mu;
    const lambda = frottement(Re, rugMm / 1000 / Dh);
    return { v, Re, lambda, R: lambda / Dh * rho * v * v / 2, pd: rho * v * v / 2, regime: regime(Re) };
  }

  // Écoulement compressible isotherme par tranches (vapeur, air comprimé) : débit massique m (kg/s), pression d'entrée (bar abs),
  // longueur développée L (m) et Σζ (converti en longueur équivalente). rhoDe(p bar abs) → masse volumique.
  function compressible({ m, Di, L, zeta = 0, rug, pEntree, rhoDe, mu, tranches = 60 }) {
    const A = Math.PI * Di * Di / 4;
    const etat = p => { const rho = rhoDe(p), v = m / (rho * A), Re = rho * v * Di / mu; return { rho, v, Re, lambda: frottement(Re, rug / 1000 / Di) }; };
    const e0 = etat(pEntree), Ltot = L + (e0.lambda > 0 ? zeta * Di / e0.lambda : 0), dx = Ltot / tranches;
    let p = pEntree, vmax = e0.v;
    for (let i = 0; i < tranches; i++) {
      const e = etat(p), dp = e.lambda / Di * e.rho * e.v * e.v / 2 * dx / 1e5;
      p -= dp; vmax = Math.max(vmax, e.v);
      if (p <= pEntree * 0.2) return { ok: false, pSortie: p, dp: pEntree - p, v: e0.v, vSortie: e.v, vmax, Re: e0.Re, lambda: e0.lambda, Leq: Ltot - L };
    }
    const es = etat(p);
    return { ok: true, pSortie: p, dp: pEntree - p, v: e0.v, vSortie: es.v, vmax: Math.max(vmax, es.v), Re: e0.Re, lambda: e0.lambda, Leq: Ltot - L };
  }

  /* ---------- Aéraulique ---------- */
  const diametreHydraulique = (a, b) => 2 * a * b / (a + b);
  const diametreEquivalent = (a, b) => 1.30 * (a * b) ** 0.625 / (a + b) ** 0.25; // Huebscher, même perte de charge à débit égal
  // Gaine ronde (d en mm) ou rectangulaire (a × b en mm) : qv m³/s
  function gaine(qv, dim, T, rug) {
    const a = air(T), rect = dim.b > 0;
    const Dh = (rect ? diametreHydraulique(dim.a, dim.b) : dim.a) / 1000;
    const S = rect ? dim.a * dim.b / 1e6 : Math.PI * Dh * Dh / 4;
    return { ...ecoulement(qv, Dh, a.rho, a.mu, rug, S), Dh, S, rho: a.rho };
  }
  // Lecture d'une dimension saisie : « 400 », « Ø400 », « 600x300 », « 600 × 300 »
  function lireDimension(txt) {
    const m = /^\s*(?:Ø\s*)?(\d+(?:[.,]\d+)?)\s*(?:[x×*]\s*(\d+(?:[.,]\d+)?))?\s*$/i.exec(String(txt || ''));
    if (!m) return null;
    const a = parseFloat(m[1].replace(',', '.')), b = m[2] ? parseFloat(m[2].replace(',', '.')) : 0;
    return a > 0 ? { a, b } : null;
  }

  /* ---------- Isolation thermique (tube horizontal, régime permanent) ---------- */
  // De (m) diamètre extérieur du tube, e (m) épaisseur d'isolant, Tf fluide, Ta ambiance ; vent (m/s, 0 = air calme intérieur)
  function isolation({ De, e, Tf, Ta, isolant, emissivite, vent = 0 }) {
    const Dext = De + 2 * e, iso = D.ISOLANTS[isolant];
    let Ts = Ta + (Tf - Ta) * (e > 0 ? 0.1 : 0.9), q = 0, h = 10, lambda = iso ? iso.lambda10 : 0.04;
    for (let i = 0; i < 80; i++) {
      const dT = Math.abs(Ts - Ta) || 0.01, Ks = Ts + 273.15, Ka = Ta + 273.15;
      const hc = vent > 0 ? 8.9 * vent ** 0.9 / Dext ** 0.1 : 1.32 * (dT / Dext) ** 0.25;
      const hr = emissivite * SIGMA_SB * (Ks ** 4 - Ka ** 4) / ((Ks - Ka) || 0.01);
      h = hc + hr;
      lambda = iso ? iso.lambda10 + iso.dlambda * ((Tf + Ts) / 2 - 10) : 0.04;
      const Rt = (e > 0 ? Math.log(Dext / De) / (2 * Math.PI * lambda) : 0) + 1 / (h * Math.PI * Dext);
      q = (Tf - Ta) / Rt;
      const n = Ta + q / (h * Math.PI * Dext);
      if (Math.abs(n - Ts) < 1e-4) { Ts = n; break; }
      Ts = Ts + 0.6 * (n - Ts);
    }
    return { q, Ts, h, lambda, Dext };
  }

  /* ---------- Vase d'expansion fermé (NF EN 12828 annexe D) ---------- */
  // Vinst (L), Tmin (remplissage) et Tmax (°C), Hst hauteur statique au-dessus du vase (m), Psv tarage soupape (bar),
  // marge p0 (bar), fluide. Pressions relatives en bar.
  function vaseExpansion({ Vinst, Tmin, Tmax, Hst, Psv, fluide = 'eau', marge = 0.2, p0Impose }) {
    const r1 = liquide(fluide, Tmin).rho, r2 = liquide(fluide, Tmax).rho, e = r1 / r2 - 1;
    const Ve = e * Vinst, Vwr = Math.max(0.005 * Vinst, 3);
    const pst = Hst * liquide(fluide, Tmin).rho * G / 1e5, pD = Math.max(0, pressionVapeurEau(Tmax) - 1.013);
    const p0 = p0Impose > 0 ? p0Impose : pst + pD + marge;
    const pe = Psv <= 5 ? Psv - 0.5 : 0.9 * Psv;
    const Vn = pe > p0 ? (Ve + Vwr) * (pe + 1) / (pe - p0) : Infinity;
    const choisi = D.VASES.find(v => v >= Vn) || null;
    // Pression de remplissage à froid permettant de constituer la réserve Vwr dans le vase choisi
    const pa = choisi ? (p0 + 1) * choisi / (choisi - Vwr) - 1 : NaN;
    return { e, Ve, Vwr, pst, pD, p0, pe, Vn, choisi, pa, rendement: pe > p0 ? (pe - p0) / (pe + 1) : 0 };
  }

  /* ---------- Épaisseur des tubes sous pression intérieure (NF EN 13480-3 § 6.1) ---------- */
  function contrainteNominale(nuance, T) {
    const m = D.ACIERS_PRESSION[nuance];
    if (!m) throw new Error(`Nuance inconnue : ${nuance}`);
    const Rp = interp(m.Rp, T);
    // Ferritiques : min(Rp0,2t/1,5 ; Rm/2,4). Austénitiques : Rp1,0t/1,5 (option prudente du § 5.2)
    return { f: m.austenitique ? Rp / 1.5 : Math.min(Rp / 1.5, m.Rm / 2.4), Rp, Rm: m.Rm, f20: m.austenitique ? interp(m.Rp, 20) / 1.5 : Math.min(interp(m.Rp, 20) / 1.5, m.Rm / 2.4), horsPlage: horsTable(m.Rp, T) };
  }
  // P (bar), Do (mm), f (MPa), z coefficient de soudure → épaisseur minimale e (mm) ; inverse : pression maxi admissible (bar)
  const epaisseurMini = (P, Do, f, z) => (P / 10) * Do / (2 * f * z + P / 10);
  const pressionMaxi = (e, Do, f, z) => (e > 0 ? 10 * 2 * f * z * e / (Do - e) : 0);

  /* ---------- Portée entre supports (tube horizontal plein) ---------- */
  // Poutre sur deux appuis : flèche 5qL⁴/384EI ≤ δ, contrainte qL²/8Z ≤ σ. Unités : mm, N, MPa.
  function portee({ de, ep, rhoMat, E, rhoFluide = 1000, epIso = 0, rhoIso = 0, fleche = 2.5, sigma = 50, chargeSup = 0 }) {
    const di = de - 2 * ep, aire = d => Math.PI * d * d / 4 / 1e6; // m²
    const mTube = rhoMat * (aire(de) - aire(di)), mFluide = rhoFluide * aire(di), mIso = rhoIso * (aire(de + 2 * epIso) - aire(de));
    const q = (mTube + mFluide + mIso) * G + chargeSup; // N/m
    const I = Math.PI * (de ** 4 - di ** 4) / 64, Z = 2 * I / de; // mm⁴, mm³
    const qmm = q / 1000; // N/mm
    const Lf = (fleche * 384 * E * I / (5 * qmm)) ** 0.25, Ls = Math.sqrt(8 * sigma * Z / qmm);
    return { mTube, mFluide, mIso, q, I, Z, Lf: Lf / 1000, Ls: Ls / 1000, L: Math.min(Lf, Ls) / 1000, critere: Lf < Ls ? 'flèche' : 'contrainte' };
  }

  /* ---------- Vanne de régulation ---------- */
  const kv = (Q, dpKpa, rho = 1000) => Q * Math.sqrt(rho / 1000 / (dpKpa / 100)); // Q m³/h, ΔP kPa
  const dpVanne = (Q, Kvs, rho = 1000) => 100 * (rho / 1000) * (Q / Kvs) ** 2; // kPa

  return { G, interp, eau, liquide, utiliserFluides, fluidesFabricant, lireFluidesCsv, air, vapeurSat, pressionVapeurEau, pointRosee, tubes, tube, nomTube, parDN, frottement, colebrook, regime, ecoulement,
    compressible, gaine, diametreHydraulique, diametreEquivalent, lireDimension, isolation, vaseExpansion, contrainteNominale, epaisseurMini, pressionMaxi, portee, kv, dpVanne };
})(typeof Donnees !== 'undefined' ? Donnees : require('./donnees'));
if (typeof module !== 'undefined') module.exports = Calculs;
