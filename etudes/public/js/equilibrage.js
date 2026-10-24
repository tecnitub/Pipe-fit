// Réseau hydraulique arborescent (collecteur → antennes → émetteurs) : débits cumulés, diamètres, circuit le plus défavorisé,
// hauteur de la pompe et réglage des vannes d'équilibrage (Kv de réglage de chaque vanne), schéma unifilaire du réseau.
const Equilibrage = ((D, C, N) => {
  const { nf, num } = N;
  const alerte = (niveau, texte) => ({ niveau, texte });
  const optTubes = e => C.tubes(e.serie || 'acier-10216').map(t => [t.cle, t.nom]);
  // Vannes d'équilibrage à mesure de débit, gamme générique : Kvs à pleine ouverture par DN
  const VANNES = [[15, 2.52], [20, 5.7], [25, 8.7], [32, 14.2], [40, 19.2], [50, 33], [65, 85], [80, 120], [100, 190], [125, 300], [150, 420], [200, 765]];
  const vannePour = Kv => { const v = VANNES.find(([, k]) => Kv <= k) || VANNES[VANNES.length - 1]; return { dn: v[0], Kvs: v[1], ouverture: Kv / v[1] }; };

  N.TYPES.arbo = {
    titre: 'Réseau arborescent et équilibrage', icone: '🌳', famille: 'Hydraulique',
    description: 'Collecteur, antennes et émetteurs : débits cumulés, diamètres, circuit le plus défavorisé, pompe et réglage des vannes d\'équilibrage.',
    champs: [{ g: 'Fluide' }, { k: 'fluide', l: 'Fluide', t: 's', o: N.optFluides, d: 'eau' }, { k: 'T', l: 'Température moyenne du fluide', u: '°C', d: 60 },
      { k: 'dT', l: 'Écart de température aux émetteurs', u: 'K', d: 15 },
      { g: 'Réseau' }, { k: 'serie', l: 'Série de tubes', t: 's', o: Object.entries(D.SERIES).map(([k, s]) => [k, s.libelle]), d: 'acier-10216' },
      { k: 'vmax', l: 'Vitesse maximale (dimensionnement auto)', u: 'm/s', d: 1.5 }, { k: 'Rmax', l: 'Perte linéique maxi (dimensionnement auto)', u: 'Pa/m', d: 150 },
      { k: 'troncons', l: 'Tronçons (un tronçon sans tronçon en aval alimente un émetteur)', t: 'lignes', d: [
        { rep: 'C', amont: '', nom: 'Chaufferie → collecteur', L: 15, zeta: 4, tube: '', P: '', dpEm: '' },
        { rep: 'A1', amont: 'C', nom: 'Antenne bâtiment A', L: 20, zeta: 3, tube: '', P: '', dpEm: '' },
        { rep: 'A1.1', amont: 'A1', nom: 'Aérotherme atelier 1', L: 8, zeta: 5, tube: '', P: 30, dpEm: 15 },
        { rep: 'A1.2', amont: 'A1', nom: 'Aérotherme atelier 2', L: 14, zeta: 5, tube: '', P: 25, dpEm: 15 },
        { rep: 'A2', amont: 'C', nom: 'Antenne bureaux', L: 45, zeta: 4, tube: '', P: '', dpEm: '' },
        { rep: 'A2.1', amont: 'A2', nom: 'Radiateurs RDC', L: 6, zeta: 4, tube: '', P: 40, dpEm: 20 },
        { rep: 'A2.2', amont: 'A2', nom: 'Radiateurs R+1', L: 12, zeta: 4, tube: '', P: 20, dpEm: 10 },
        { rep: 'A3', amont: 'C', nom: 'CTA', L: 10, zeta: 6, tube: '', P: 60, dpEm: 25 }],
      colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'amont', l: 'Amont (vide = pompe)', t: 't' }, { k: 'nom', l: 'Désignation', t: 't' },
        { k: 'L', l: 'Longueur aller (m)' }, { k: 'zeta', l: 'Σζ aller + retour' }, { k: 'tube', l: 'Tube', t: 's', o: e => [['', 'Auto'], ...optTubes(e)] },
        { k: 'P', l: 'Puissance émetteur (kW)' }, { k: 'dpEm', l: 'ΔP émetteur + vanne de régulation (kPa)' }] },
      { g: 'Équilibrage et pompe' },
      { k: 'methode', l: 'Vannes d\'équilibrage', t: 's', o: [['emetteurs', 'Sur chaque émetteur'], ['antennes', 'Sur chaque émetteur et au pied de chaque antenne (vannes partenaires)']], d: 'emetteurs' },
      { k: 'dpMin', l: 'ΔP mini d\'une vanne d\'équilibrage (mesure fiable)', u: 'kPa', d: 3 },
      { k: 'dpGen', l: 'ΔP côté production (générateur, bouteille, accessoires)', u: 'kPa', d: 10 },
      { k: 'marge', l: 'Marge de sécurité sur la HMT', u: '%', d: 10 }, { k: 'rendement', l: 'Rendement global de la pompe', u: '%', d: 55 }],
    calcul(e) {
      const f = C.liquide(e.fluide, num(e.T, 20)), s = D.SERIES[e.serie] || D.SERIES['acier-10216'], tubes = C.tubes(e.serie), alertes = [];
      const vmax = num(e.vmax, 1.5), Rmax = num(e.Rmax, 150), dT = num(e.dT, 15), dpMin = num(e.dpMin, 3) * 1000, partenaires = e.methode === 'antennes';
      // Arbre des tronçons
      const tr = (e.troncons || []).map((x, i) => ({ i, rep: String(x.rep || `T${i + 1}`).trim(), amont: String(x.amont || '').trim(), nom: x.nom || '', L: num(x.L), zeta: num(x.zeta), tubeImpose: x.tube, P: num(x.P), dpEm: num(x.dpEm) * 1000, enfants: [] }));
      const parRep = new Map();
      tr.forEach(t => { if (parRep.has(t.rep)) alertes.push(alerte('erreur', `Repère ${t.rep} en double.`)); else parRep.set(t.rep, t); });
      const racines = [];
      tr.forEach(t => {
        const p = t.amont ? parRep.get(t.amont) : null;
        if (t.amont && !p) alertes.push(alerte('erreur', `${t.rep} : tronçon amont « ${t.amont} » introuvable (rattaché au départ pompe).`));
        if (p && p !== t) p.enfants.push(t); else racines.push(t);
      });
      // Boucles : un tronçon doit remonter au départ pompe
      const vus = new Set(), parcours = (t, prof) => { vus.add(t); t.prof = prof; t.enfants.forEach(c => parcours(c, prof + 1)); };
      racines.forEach(t => parcours(t, 0));
      tr.filter(t => !vus.has(t)).forEach(t => { alertes.push(alerte('erreur', `${t.rep} : boucle dans les tronçons amont, tronçon ignoré.`)); });
      const actifs = tr.filter(t => vus.has(t)), terminaux = actifs.filter(t => !t.enfants.length);
      // Débits cumulés depuis les émetteurs
      const debit = t => { t.Q = t.enfants.length ? t.enfants.reduce((a, c) => a + debit(c), 0) : (dT > 0 ? t.P * 1000 / (f.rho * f.cp * dT) * 3600 : 0); return t.Q; };
      racines.forEach(debit);
      actifs.filter(t => t.enfants.length && t.P).forEach(t => alertes.push(alerte('attention', `${t.rep} : puissance saisie sur un tronçon qui a des tronçons en aval, non prise en compte (créer un tronçon pour l'émetteur).`)));
      terminaux.filter(t => !(t.P > 0)).forEach(t => alertes.push(alerte('erreur', `${t.rep} : tronçon terminal sans puissance d'émetteur.`)));
      // Diamètres et pertes de charge (aller + retour)
      actifs.forEach(t => {
        const qv = t.Q / 3600;
        t.t = t.tubeImpose ? tubes.find(y => y.cle === t.tubeImpose) : null; t.auto = !t.t;
        if (!t.t) t.t = tubes.find(y => { const r = C.ecoulement(qv, y.di / 1000, f.rho, f.mu, s.rugosite); return r.v <= vmax && r.R <= Rmax; }) || tubes[tubes.length - 1];
        Object.assign(t, C.ecoulement(qv, t.t.di / 1000, f.rho, f.mu, s.rugosite));
        t.dp = t.R * 2 * t.L + t.zeta * t.pd;
        if (t.v > vmax * 1.001) alertes.push(alerte('attention', `${t.rep} : vitesse ${nf(t.v)} m/s supérieure à ${nf(vmax)} m/s.`));
      });
      // Pression nécessaire à l'entrée de chaque tronçon et réglage des vannes
      // Vannes partenaires : au pied des antennes qui ont des voisines (pas sur un départ unique)
      const aVanne = t => !t.enfants.length || (partenaires && (t.amont ? parRep.get(t.amont).enfants.length > 1 : racines.length > 1));
      const besoin = t => {
        const aval = t.enfants.length ? Math.max(...t.enfants.map(besoin)) : t.dpEm;
        t.enfants.forEach(c => { c.exces = aval - c.H; });
        t.H = t.dp + aval + (aVanne(t) ? dpMin : 0);
        return t.H;
      };
      racines.forEach(besoin);
      const Hres = racines.length ? Math.max(...racines.map(t => t.H)) : 0;
      racines.forEach(t => { t.exces = Hres - t.H; });
      // Sans vannes partenaires, l'excès d'un tronçon intermédiaire descend jusqu'aux vannes des émetteurs
      const regler = (t, report, dispo) => {
        t.dispo = dispo;
        const total = report + t.exces;
        if (aVanne(t)) { t.dpV = dpMin + total; t.Kv = t.Q > 0 ? C.kv(t.Q, t.dpV / 1000, f.rho) : NaN; t.vanne = vannePour(t.Kv); }
        const reste = aVanne(t) ? 0 : total;
        t.enfants.forEach(c => regler(c, reste, dispo - t.dp - (aVanne(t) ? t.dpV : 0)));
      };
      racines.forEach(t => regler(t, 0, Hres));
      terminaux.forEach(t => { t.chemin = []; for (let x = t; x; x = x.amont ? parRep.get(x.amont) : null) { t.chemin.unshift(x); if (t.chemin.length > tr.length) break; } });
      const defav = terminaux.reduce((a, t) => (!a || t.chemin.reduce((s2, x) => s2 + x.dp, 0) + t.dpEm > a.chemin.reduce((s2, x) => s2 + x.dp, 0) + a.dpEm ? t : a), null);
      const dpGen = num(e.dpGen) * 1000, marge = num(e.marge, 10), Qp = racines.reduce((a, t) => a + t.Q, 0), Ptot = terminaux.reduce((a, t) => a + t.P, 0);
      const dpTot = Hres + dpGen, HMT = dpTot * (1 + marge / 100) / (f.rho * C.G), Ph = Qp / 3600 * HMT * f.rho * C.G, Pabs = Ph / (num(e.rendement, 55) / 100);
      const pompes = Qp > 0 ? (typeof Catalogue !== 'undefined' ? Catalogue : require('./catalogue')).pompesPour(Qp, HMT) : [];
      const vannes = actifs.filter(t => t.vanne);
      vannes.filter(t => t.vanne.ouverture < 0.12).forEach(t => alertes.push(alerte('attention', `${t.rep} : vanne DN ${t.vanne.dn} presque fermée (Kv ${nf(t.Kv, 2)}, ${nf(t.dpV / 1000, 1)} kPa à dissiper) : risque de bruit et de bouchage, prévoir un régulateur de pression différentielle sur l'antenne ou revoir les diamètres.`)));
      vannes.filter(t => t.vanne.dn > t.t.dn).forEach(t => { const k = (VANNES.find(([d]) => d >= t.t.dn) || VANNES[VANNES.length - 1])[1]; alertes.push(alerte('attention', `${t.rep} : Kv de réglage ${nf(t.Kv, 1)} supérieur au Kvs d'une vanne au DN du tube (${t.t.dn}) : vanne DN ${t.vanne.dn} retenue, ou vanne DN ${t.t.dn} grande ouverte avec ${nf(C.dpVanne(t.Q, k, f.rho), 1)} kPa au lieu de ${nf(t.dpV / 1000, 1)} kPa (à reporter dans le circuit).`)); });
      if (vannes.some(t => t.dpV > 25000) && !partenaires) alertes.push(alerte('attention', 'Des vannes d\'émetteurs dissipent plus de 25 kPa : des vannes partenaires au pied des antennes, ou un régulateur de ΔP, répartissent mieux l\'excès de pression.'));
      if (defav && terminaux.length) alertes.push(alerte('ok', `Circuit le plus défavorisé : ${defav.chemin.map(x => x.rep).join(' → ')} (${nf(Hres / 1000, 1)} kPa, vannes d'équilibrage comprises). Pompe : ${nf(Qp, 2)} m³/h sous ${nf(HMT, 2)} mCE.`));
      if (!terminaux.length) alertes.push(alerte('erreur', 'Ajouter au moins un tronçon avec un émetteur.'));
      const nomDe = t => `${t.rep}${t.nom ? ` — ${t.nom}` : ''}`;
      return {
        valeurs: { Qp, HMT, dpTot, Hres, Ph, Pabs, Ptot, defavorise: defav ? defav.rep : null, pompe: pompes[0] || null,
          troncons: actifs.map(t => ({ rep: t.rep, serie: e.serie, tube: t.t.cle, dn: t.t.dn, L: 2 * t.L })),
          vannes: vannes.map(t => ({ rep: t.rep, dn: t.vanne.dn, Kvs: t.vanne.Kvs, Kv: t.Kv, dp: t.dpV, Q: t.Q })),
          noeuds: actifs.map(t => ({ rep: t.rep, Q: t.Q, dp: t.dp, H: t.H, dispo: t.dispo, dpV: t.dpV })) },
        resume: [['Puissance des émetteurs', `${nf(Ptot, 1)} kW`], ['Débit de la pompe', `${nf(Qp, 2)} m³/h`],
          ['Circuit le plus défavorisé', defav ? defav.chemin.map(x => x.rep).join(' → ') : '—'],
          ['ΔP du réseau (circuit le plus défavorisé, vannes comprises)', `${nf(Hres / 1000, 1)} kPa`], ['ΔP côté production', `${nf(dpGen / 1000, 1)} kPa`],
          [`HMT avec marge de ${nf(marge, 0)} %`, `${nf(HMT, 2)} mCE`], ['Puissance absorbée estimée', `${nf(Pabs / 1000, 2)} kW`],
          ['Pompe proposée', pompes.length ? N.libPompe(pompes[0]) : '—'], ['Vannes d\'équilibrage', `${vannes.length} (${partenaires ? 'émetteurs et antennes' : 'émetteurs'})`]],
        tableaux: [
          { titre: 'Tronçons (débits cumulés, aller + retour)', entetes: ['Tronçon', 'Amont', 'Q (m³/h)', 'Tube', 'L aller (m)', 'v (m/s)', 'R (Pa/m)', 'Σζ', 'ΔP (kPa)', 'ΔP dispo. à l\'entrée (kPa)'],
            lignes: actifs.map(t => [nomDe(t), t.amont || 'pompe', nf(t.Q, 2), `${t.t.nom}${t.auto ? ' (auto)' : ''}`, nf(t.L, 1), nf(t.v), nf(t.R, 0), nf(t.zeta, 1), nf(t.dp / 1000, 2), nf(t.dispo / 1000, 1)]) },
          { titre: 'Circuits des émetteurs', entetes: ['Émetteur', 'P (kW)', 'Q (m³/h)', 'Chemin', 'ΔP tuyauteries (kPa)', 'ΔP émetteur (kPa)', 'Vanne à dissiper (kPa)'],
            lignes: terminaux.map(t => [nomDe(t), nf(t.P, 1), nf(t.Q, 3), t.chemin.map(x => x.rep).join(' → '), nf(t.chemin.reduce((a, x) => a + x.dp, 0) / 1000, 2), nf(t.dpEm / 1000, 1), nf(t.dpV / 1000, 1)]),
            surligne: defav ? terminaux.indexOf(defav) : undefined },
          { titre: 'Réglage des vannes d\'équilibrage (gamme générique, Kvs à pleine ouverture)', entetes: ['Vanne', 'Q (m³/h)', 'ΔP à dissiper (kPa)', 'Kv de réglage', 'DN', 'Kvs', 'Ouverture ≈'],
            lignes: vannes.map(t => [nomDe(t), nf(t.Q, 3), nf(t.dpV / 1000, 1), nf(t.Kv, 2), String(t.vanne.dn), nf(t.vanne.Kvs, 1), `${nf(t.vanne.ouverture * 100, 0)} %`]) }],
        alertes,
        hypotheses: [`${f.libelle} à ${nf(num(e.T), 0)} °C : ρ = ${nf(f.rho, 1)} kg/m³, cp = ${nf(f.cp / 1000, 3)} kJ/kg·K ; débit d'un émetteur Q = P / (ρ · cp · ΔT), ΔT = ${nf(dT, 0)} K.`,
          `${s.libelle}. Tube « auto » : plus petit diamètre avec v ≤ ${nf(vmax)} m/s et R ≤ ${nf(Rmax, 0)} Pa/m. Retour identique à l'aller (longueur comptée deux fois).`, ...['Pertes de charge : Darcy-Weisbach et Colebrook-White ; singulières Σζ · ρv²/2.'],
          `Chaque vanne d'équilibrage garde au moins ${nf(dpMin / 1000, 1)} kPa pour une mesure de débit fiable ; elle dissipe en plus l'excès de pression de son circuit par rapport au circuit le plus défavorisé.`,
          partenaires ? 'Vannes partenaires : l\'excès de chaque antenne par rapport à ses voisines est dissipé au pied de l\'antenne, les émetteurs ne compensent que les écarts à l\'intérieur de leur antenne.' : 'Vannes sur les émetteurs seulement : l\'excès de pression de chaque circuit est dissipé dans la vanne de son émetteur.',
          'Kv de réglage = Q · √(ρ / 1000 / ΔP[bar]) ; la position (tours) se lit sur l\'abaque du constructeur de la vanne retenue. Ouverture indicative pour une caractéristique linéaire.',
          `HMT = (ΔP du réseau + ΔP production) × (1 + marge) / (ρ · g) ; puissance absorbée = ρ · g · Q · HMT / η (η = ${nf(num(e.rendement, 55), 0)} %).`],
        synthese: `${terminaux.length} émetteurs · ${nf(Qp, 2)} m³/h · HMT ${nf(HMT, 2)} mCE · ${vannes.length} vannes d'équilibrage`,
        schema: terminaux.length ? dessiner(racines, defav, f) : undefined,
      };
    },
  };

  /* ---------- Schéma unifilaire de l'arborescence (départ et retour) ---------- */
  const cD = '#c0392b', cR = '#2563eb', cT = '#1f2937';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function dessiner(racines, defav, f) {
    const PAS = 74, X0 = 150, DX = 200, out = [];
    let ligne = 0, profMax = 0;
    const placer = t => { profMax = Math.max(profMax, t.prof); if (!t.enfants.length) { t.y = 70 + ligne++ * PAS; return t.y; } t.enfants.forEach(placer); t.y = t.enfants[0].y; return t.y; };
    racines.forEach(placer);
    const W = X0 + (profMax + 1) * DX + 190, H = 70 + ligne * PAS + 20, X = p => X0 + p * DX;
    const L = (x1, y1, x2, y2, c, w = 2) => out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"/>`);
    const T = (x, y, t, o = {}) => out.push(`<text x="${x}" y="${y}" font-size="${o.fs || 10}" fill="${o.c || cT}"${o.a ? ` text-anchor="${o.a}"` : ''}${o.b ? ' font-weight="bold"' : ''}>${esc(t)}</text>`);
    const vanne = (x, y) => out.push(`<path d="M${x - 7} ${y - 5} L${x + 7} ${y + 5} L${x + 7} ${y - 5} L${x - 7} ${y + 5} Z" fill="#fff" stroke="${cT}" stroke-width="1.2"/>`);
    const chemin = new Set(defav ? defav.chemin : []);
    // Production : générateur, pompe et collecteur
    const y0 = racines[0].y, yN = racines[racines.length - 1].y;
    out.push(`<rect x="14" y="${y0 - 22}" width="56" height="56" fill="#fff" stroke="${cT}" stroke-width="1.5"/>`);
    T(42, y0 + 10, 'Prod.', { a: 'middle' });
    L(70, y0, X(0), y0, cD); L(70, y0 + 12, X(0) + 6, y0 + 12, cR);
    out.push(`<circle cx="104" cy="${y0}" r="9" fill="#fff" stroke="${cT}" stroke-width="1.5"/><path d="M99 ${y0 - 6} L111 ${y0} L99 ${y0 + 6} Z" fill="none" stroke="${cT}" stroke-width="1.2"/>`);
    if (racines.length > 1) { L(X(0), y0, X(0), yN, cD, 3); L(X(0) + 6, y0 + 12, X(0) + 6, yN + 12, cR, 3); }
    const tracer = t => {
      const x1 = X(t.prof), x2 = X(t.prof + 1), y = t.y, gras = chemin.has(t) ? 3 : 2;
      if (t.enfants.length) {
        L(x1, y, x2, y, cD, gras); L(x1 + 6, y + 12, x2 + 6, y + 12, cR, gras);
        const yl = t.enfants[t.enfants.length - 1].y;
        L(x2, y, x2, yl, cD, gras); L(x2 + 6, y + 12, x2 + 6, yl + 12, cR, gras);
        t.enfants.forEach(tracer);
      } else {
        const xe = X(profMax + 1) - 20;
        L(x1, y, xe, y, cD, gras); L(x1 + 6, y + 12, xe, y + 12, cR, gras);
        out.push(`<rect x="${xe}" y="${y - 12}" width="150" height="36" fill="#fff" stroke="${chemin.has(t) ? cD : cT}" stroke-width="${chemin.has(t) ? 2 : 1.2}"/>`);
        T(xe + 6, y + 1, t.nom || t.rep, { b: true }); T(xe + 6, y + 16, `${nf(t.P, 0)} kW · ${nf(t.Q, 2)} m³/h`);
      }
      T(x1 + 12, y - 6, `${t.rep} · DN ${t.t.dn} · ${nf(t.Q, 2)} m³/h`, { fs: 9 });
      if (t.vanne) { const xv = (t.enfants.length ? x1 + DX * 0.62 : X(profMax + 1) - 48); vanne(xv, y + 12); T(xv, y + 30, `DN ${t.vanne.dn} · Kv ${nf(t.Kv, 2)}`, { fs: 8.5, a: 'middle' }); }
    };
    racines.forEach(tracer);
    T(14, H - 6, `Départ en rouge, retour en bleu ; circuit le plus défavorisé en trait épais ; vannes d'équilibrage repérées par leur DN et leur Kv de réglage. ${f.libelle}.`, { fs: 9 });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-depart="${cD}" data-retour="${cR}"><rect width="${W}" height="${H}" fill="#fff"/>${out.join('')}</svg>`;
  }

  return { VANNES, vannePour };
})(typeof Donnees !== 'undefined' ? Donnees : require('./donnees'), typeof Calculs !== 'undefined' ? Calculs : require('./calculs'), typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = Equilibrage;
