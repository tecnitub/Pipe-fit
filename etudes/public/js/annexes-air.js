// Calculs annexes — Ventilation et traitement d'air : débits d'air neuf réglementaires, hotte de cuisine, parking, piscine / déshumidification, confort et diffusion, puits canadien.
// Rangés à part dans l'étude (famille « Calculs annexes », thème « Ventilation et traitement d'air ») ; chaque type déclare annexe: true, theme,
// et sa fonction lier(ctx) qui reprend les données des autres notes de l'étude (voir Liens.resoudreLiens).
// Valeurs réglementaires et coefficients indicatifs documentés et saisissables : à confirmer avec le texte en vigueur et le
// bureau de contrôle. Module pur (navigateur, node, tests).
const AnnexesAir = ((N) => {
  const { nf, num } = N;
  const alerte = (niveau, texte) => ({ niveau, texte });
  const THEME = 'Ventilation et traitement d\'air', FAMILLE = 'Calculs annexes';
  const vide = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
  const mod = (g, f) => () => (typeof globalThis[g] !== 'undefined' ? globalThis[g] : (() => { try { return require(f); } catch (e) { return null; } })());
  const P_ = () => (typeof Pieces !== 'undefined' ? Pieces : mod('Pieces', './pieces')());
  const L_ = () => (typeof Liens !== 'undefined' ? Liens : mod('Liens', './liens')());
  const C_ = () => (typeof Cta !== 'undefined' ? Cta : mod('Cta', './cta')());
  const climat = et => { const L = L_(); try { return L && L.climatEtude ? L.climatEtude(et) : null; } catch (e) { return null; } };
  // Liste de choix reliée à l'étude, évaluée sans étude (Notes.calculer) : valeur choisie conservée
  const garder = (e, k) => (e && e[k] ? [[e[k], String(e[k])]] : []);
  const ctasEtude = et => ((et && et.notes) || []).filter(n => n.type === 'cta');

  // Lignes « auto » reprises d'une autre note : méthode commune des calculs annexes (Liens, ctx.reprendreLignes) — après les
  // lignes saisies, cellules verrouillées ; une ligne saisie de même clé remplace la ligne reprise et en reprend les cellules vides
  const reprendre = (ctx, liste, auto, cle) => ctx.reprendreLignes(liste, auto, { cle });

  /* ---------- Psychrométrie (101 325 Pa) ---------- */
  const pws = T => (T >= 0 ? 610.94 * Math.exp(17.625 * T / (T + 243.04)) : 611.21 * Math.exp(22.587 * T / (T + 273.86)));
  const xDe = (T, HR) => { const pv = HR / 100 * pws(T); return 0.622 * pv / (101325 - pv); };
  const hDe = (T, x) => 1.006 * T + x * (2501 + 1.86 * T);
  const rhoAir = T => 1.293 * 273.15 / (273.15 + T);
  const rosee = (T, HR) => { const g = Math.log(Math.max(HR, 1) / 100) + 17.625 * T / (243.04 + T); return 243.04 * g / (17.625 - g); };
  const pFan = (Q, dp, eta) => Q / 3600 * dp / Math.max(eta, 0.05) / 1000; // kW

  /* ---------- 13. Débits d'air neuf réglementaires ---------- */
  // Usages : [libellé, code du travail R.4222-6 (m³/h/occupant), RSDT art. 64 non-fumeurs (m³/h/occupant), densité d'occupation indicative (occ/m²), mode]
  //  mode : occ (air neuf par occupant, soufflé), wc / sdb / sdbwc / groupes (extraction des locaux à pollution spécifique, RSDT),
  //  logement (extraction par logement, arrêté du 24 mars 1982), zero (sans exigence propre), perso (débit par occupant saisi)
  const USAGES = {
    bureau: ['Bureaux (sans travail physique)', 25, 18, 0.1, 'occ'], accueil: ['Accueil, bibliothèque, banque', 25, 18, 0.2, 'occ'],
    reunion: ['Salle de réunion', 30, 18, 0.5, 'occ'], spectacle: ['Salle de spectacle, de culte, club, foyer', 30, 18, 1, 'occ'],
    vente: ['Local de vente', 30, 22, 0.2, 'occ'], restauration: ['Restauration (salle, cantine, bar)', 30, 22, 0.7, 'occ'],
    classe1: ['Classe (maternelle, primaire, collège)', null, 15, 0.5, 'occ'], classe2: ['Classe (lycée, université), atelier d\'enseignement', null, 18, 0.5, 'occ'],
    hebergement: ['Chambre collective, dortoir, salle de repos', null, 18, 0.1, 'occ'], sport: ['Salle de sport (par sportif)', null, 25, 0.1, 'occ'], piscine: ['Piscine (par baigneur)', null, 22, 0.2, 'occ'],
    atelierLeger: ['Atelier, travail physique léger', 45, null, 0.05, 'occ'], atelier: ['Autre atelier, travail physique', 60, null, 0.05, 'occ'],
    wc: ['WC (extraction ; N = nombre de WC)', null, null, 0, 'wc'], sdb: ['Salle de bains ou douches isolée (extraction)', null, null, 0, 'sdb'],
    sdbwc: ['Salle de bains avec WC (extraction)', null, null, 0, 'sdbwc'], groupes: ['Bains, douches, WC groupés (extraction ; N = équipements)', null, null, 0, 'groupes'],
    logement: ['Logement (arrêté du 24 mars 1982 ; N = pièces principales)', null, null, 0, 'logement'],
    piecePrincipale: ['Pièce principale de logement (entrée d\'air)', null, null, 0, 'zero'], circulation: ['Circulation, dégagement', null, null, 0, 'zero'],
    perso: ['Débit par occupant saisi', null, null, 0.1, 'perso'],
  };
  // Extraction des locaux à pollution spécifique (RSDT art. 64.2, valeurs indicatives à vérifier dans le RSD du département) : m³/h
  const POLLUTION = { wc: N => (N > 1 ? 30 + 15 * N : 30), sdb: () => 45, sdbwc: () => 60, groupes: N => 30 + 15 * Math.max(1, N) };
  // Logement (arrêté du 24 mars 1982, art. 3 et 4) : [pièces principales, cuisine, salle de bains, autre salle d'eau, WC unique, WC multiples, débit total minimal, cuisine réduit]
  const LOGEMENT = [[1, 75, 15, 15, 15, 15, 35, 20], [2, 90, 15, 15, 15, 15, 60, 30], [3, 105, 30, 15, 15, 15, 75, 45], [4, 120, 30, 15, 30, 15, 90, 45],
    [5, 135, 30, 15, 30, 15, 105, 45], [6, 135, 30, 15, 30, 15, 120, 45], [7, 135, 30, 15, 30, 15, 135, 45]];
  const logement = n => LOGEMENT[Math.max(1, Math.min(7, Math.round(n))) - 1];
  const REGLES = [['auto', 'La plus exigeante applicable'], ['ct', 'Code du travail (R.4222-6)'], ['rsdt', 'RSDT (art. 64)']];
  // Usage du bilan pièce par pièce → usage de l'air neuf
  const DE_PIECES = { bureau: 'bureau', reunion: 'reunion', open: 'bureau', accueil: 'accueil', classe: 'classe1', chambre: 'hebergement', sejour: 'piecePrincipale', restaurant: 'restauration', commerce: 'vente', informatique: 'bureau', sanitaires: 'wc', circulation: 'circulation' };
  function debitLocal(l, ctx = {}) {
    const U = USAGES[l.usage] || USAGES.bureau, S = num(l.S), occ = num(l.occ) > 0 ? num(l.occ) : Math.round(S * U[3] * 10) / 10, Nq = Math.max(1, Math.round(num(l.N, 1)));
    if (U[4] === 'occ' || U[4] === 'perso') {
      const ct = U[1], rs = U[2], q = U[4] === 'perso' ? num(l.q) : num(l.q) > 0 ? num(l.q) : l.regle === 'ct' ? ct : l.regle === 'rsdt' ? rs : Math.max(ct || 0, rs || 0) || null;
      const regle = num(l.q) > 0 || U[4] === 'perso' ? 'débit par occupant saisi' : (l.regle === 'ct' || (l.regle !== 'rsdt' && (ct || 0) >= (rs || 0))) && ct ? `code du travail R.4222-6 : ${ct} m³/h/occ.` : rs ? `RSDT art. 64 : ${rs} m³/h/occ.` : 'aucune règle';
      return { souffle: (q || 0) * occ, extrait: 0, occ, q: q || 0, regle, sansRegle: !q };
    }
    if (U[4] === 'logement') { const r = logement(Nq); return { souffle: 0, extrait: r[1] + r[2] + r[4], occ, q: 0, regle: `arrêté du 24/03/1982, T${r[0]} : cuisine ${r[1]} + SdB ${r[2]} + WC ${r[4]} m³/h (total minimal ${r[6]} m³/h)`, Qmin: r[6] }; }
    if (POLLUTION[U[4]]) { const Q = POLLUTION[U[4]](Nq); return { souffle: 0, extrait: Q, occ, q: 0, regle: `RSDT art. 64.2 (indicatif) : ${nf(Q, 0)} m³/h` }; }
    void ctx;
    return { souffle: 0, extrait: 0, occ, q: 0, regle: 'pas d\'exigence propre (air de transfert)' };
  }
  function calculerAirNeuf(e) {
    const alertes = [], ctas = e._ctas || [];
    const lignes = (e.locaux || []).filter(l => l && (l.nom || num(l.S) > 0)).map((l, i) => { const d = debitLocal(l); return { nom: l.nom || `Local ${i + 1}`, usage: (USAGES[l.usage] || USAGES.bureau)[0], S: num(l.S), cta: l.cta || e.ctaDefaut || '', auto: l._auto || '', ...d }; });
    if (!lignes.length) alertes.push(alerte('attention', 'Ajoutez les locaux (ou reliez les pièces d\'un bilan pièce par pièce de l\'étude).'));
    lignes.filter(l => l.sansRegle).forEach(l => alertes.push(alerte('attention', `${l.nom} : aucune règle pour cet usage avec le choix retenu : débit par occupant à saisir.`)));
    const Qs = lignes.reduce((a, l) => a + l.souffle, 0), Qe = lignes.reduce((a, l) => a + l.extrait, 0), occ = lignes.reduce((a, l) => a + l.occ, 0);
    if (Qe > Qs * 1.05 && Qs > 0) alertes.push(alerte('info', `Extraction ${nf(Qe, 0)} m³/h supérieure à l'air neuf soufflé ${nf(Qs, 0)} m³/h : compensation par transfert ou entrées d'air à prévoir.`));
    // Comparaison avec les CTA de l'étude
    const parCta = [];
    if (ctas.length) {
      const affectes = lignes.some(l => l.cta);
      if (affectes) ctas.forEach(c => { const b = lignes.filter(l => l.cta === c.id).reduce((a, l) => a + l.souffle, 0); if (b > 0) parCta.push({ ...c, besoin: b }); });
      else parCta.push({ id: '*', lib: ctas.map(c => c.lib).join(' + '), Qs: ctas.reduce((a, c) => a + c.Qs, 0), besoin: Qs });
      parCta.forEach(c => alertes.push(c.Qs + 1e-6 < c.besoin ? alerte('erreur', `${c.lib} : ${nf(c.Qs, 0)} m³/h soufflés pour ${nf(c.besoin, 0)} m³/h d'air neuf réglementaire (manque ${nf(c.besoin - c.Qs, 0)} m³/h).`)
        : alerte('ok', `${c.lib} : ${nf(c.Qs, 0)} m³/h soufflés ≥ ${nf(c.besoin, 0)} m³/h d'air neuf requis (débit d'air neuf de la centrale à vérifier si elle recycle).`)));
    }
    alertes.push(alerte('attention', 'Débits minimaux réglementaires (code du travail R.4222-6, RSDT art. 64, arrêté du 24 mars 1982) : RSD du département, locaux à pollution spécifique et effectifs à confirmer.'));
    return {
      valeurs: { Qs, Qe, occ, locaux: lignes.map(l => ({ nom: l.nom, souffle: l.souffle, extrait: l.extrait, occ: l.occ })), ctas: parCta },
      resume: [['Locaux', String(lignes.length)], ['Occupants', nf(occ, 0)], ['Air neuf soufflé', `${nf(Qs, 0)} m³/h`], ['Extraction (pollution spécifique, logements)', `${nf(Qe, 0)} m³/h`],
        ...(parCta.length ? [['CTA de l\'étude', parCta.map(c => `${c.lib} : ${nf(c.Qs, 0)} / ${nf(c.besoin, 0)} m³/h`).join(' ; ')]] : [])],
      tableaux: [{ titre: 'Débits par local', entetes: ['Local', 'Usage', 'Surface (m²)', 'Occupants', 'm³/h/occ.', 'Air neuf soufflé (m³/h)', 'Extraction (m³/h)', 'Règle'],
        lignes: lignes.map(l => [`${l.auto ? '🔗 ' : ''}${l.nom}`, l.usage, nf(l.S, 1), nf(l.occ, 1), l.q ? nf(l.q, 0) : '—', nf(l.souffle, 0), nf(l.extrait, 0), l.regle]) }],
      alertes,
      hypotheses: ['Code du travail art. R.4222-6 (locaux à pollution non spécifique) : bureaux et locaux sans travail physique 25 m³/h/occupant, restauration, vente, réunion 30, ateliers à travail physique léger 45, autres ateliers 60.',
        'RSDT art. 64 (ERP, non-fumeurs) : enseignement 15 (maternelle à collège) ou 18, hébergement collectif 18, bureaux et locaux assimilés 18, réunion et spectacle 18, vente et restauration 22, sport 25 par sportif (22 en piscine).',
        'Locaux à pollution spécifique (RSDT art. 64.2, indicatif) : WC isolé 30 m³/h, salle de bains ou douche isolée 45, avec WC 60, équipements groupés 30 + 15 N.',
        'Logements (arrêté du 24 mars 1982) : débit de pointe = cuisine + salle de bains + WC unique du type de logement ; débit total minimal indiqué.',
        'Règle « la plus exigeante » : maximum du code du travail et du RSDT pour l\'usage ; occupants vides : densité indicative de l\'usage.'],
      synthese: `${lignes.length} local(aux) · ${nf(Qs, 0)} m³/h soufflés · ${nf(Qe, 0)} m³/h extraits`,
    };
  }
  N.TYPES.airNeuf = {
    titre: 'Débits d\'air neuf réglementaires par local', icone: '🌿', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Air neuf par occupant (code du travail, RSDT), extraction des locaux à pollution spécifique et des logements (arrêté de 1982), locaux repris des pièces de l\'étude, débits comparés aux CTA.',
    champs: [{ g: 'Locaux' },
      { k: 'reprise', l: 'Locaux', t: 's', o: [['etude', 'Repris des pièces de l\'étude (bilan pièce par pièce) + lignes saisies'], ['saisie', 'Saisis seulement']], d: 'etude' },
      { k: 'ctaDefaut', l: 'CTA desservant les locaux sans CTA choisie', t: 's', o: (e, et) => [['', '— (comparer au total des CTA)'], ...(et ? ctasEtude(et).map(n => [n.id, n.titre]) : garder(e, 'ctaDefaut'))], d: '' },
      { k: 'locaux', l: 'Locaux (🔗 repris des pièces ; une ligne saisie au même nom complète ou corrige la ligne reprise)', t: 'lignes', d: [],
        colonnes: [{ k: 'nom', l: 'Local', t: 't', lst: (e, et) => N.lieuxEtude(et).salles }, { k: 'usage', l: 'Usage', t: 's', o: Object.entries(USAGES).map(([k, u]) => [k, u[0]]) }, { k: 'S', l: 'Surface (m²)' },
          { k: 'occ', l: 'Occupants (vide : densité de l\'usage)' }, { k: 'N', l: 'N (WC, équipements, pièces principales)' }, { k: 'q', l: 'Débit imposé (m³/h/occ.)' },
          { k: 'regle', l: 'Règle', t: 's', o: REGLES }, { k: 'cta', l: 'CTA', t: 's', o: (e, et) => [['', '—'], ...ctasEtude(et).map(n => [n.id, n.titre])] }] }],
    calcul: calculerAirNeuf,
    lier(ctx) {
      const { e, notes } = ctx;
      e._ctas = notes.filter(n => n.type === 'cta').map(n => { const es = ctx.resoudre(n); return { id: n.id, lib: ctx.libelle(n), Qs: num(es.Qs) }; });
      if (e.reprise === 'saisie') return;
      const P = P_(), auto = [];
      notes.filter(n => n.type === 'pieces').forEach(n => (ctx.resoudre(n).pieces || []).filter(p => p && p.nom).forEach(p => {
        const U = P && P.USAGES[p.usage], S = num(p.S), occ = num(p.occ) > 0 ? num(p.occ) : U ? Math.round(S * U[1] * 10) / 10 : '';
        auto.push({ nom: p.nom, usage: DE_PIECES[p.usage] || 'bureau', S, occ, N: '', q: '', regle: 'auto', cta: '', _auto: ctx.libelle(n) });
      }));
      reprendre(ctx, 'locaux', auto, 'nom');
    },
  };

  /* ---------- 14. Hotte de cuisine professionnelle (VDI 2052) ---------- */
  // Méthode thermique de la VDI 2052 (panache convectif au-dessus de chaque appareil) :
  //   V_th = k · Q_conv^(1/3) · (z + 1,7 · d_h)^(5/3) · r   (m³/h), k = 18, Q_conv (W), z (m) entre plan de cuisson et bas de hotte,
  //   d_h = 2ab/(a+b) diamètre hydraulique du plan de cuisson, r facteur de position (îlot 1, mural 0,63, angle 0,4)
  // Chaleur convective par kW raccordé et simultanéité : ordres de grandeur indicatifs, à remplacer par le tableau de la VDI 2052
  // ou les données du cuisiniste. [libellé, W convectifs par kW, simultanéité]
  const APPAREILS = { fourneau: ['Fourneau, plaques, feux vifs', 300, 0.5], friteuse: ['Friteuse', 200, 0.5], grill: ['Grill, plancha, salamandre', 350, 0.6], four: ['Four mixte, four à convection', 100, 0.5],
    sauteuse: ['Sauteuse, braisière', 250, 0.5], marmite: ['Marmite, cuiseur', 150, 0.5], bainmarie: ['Bain-marie, maintien en température', 100, 0.5], lave: ['Lave-vaisselle (buées)', 50, 0.8], autre: ['Autre appareil', 200, 0.5] };
  const POSITIONS = { ilot: [1, 'Îlot (hotte centrale)'], mur: [0.63, 'Contre un mur'], angle: [0.4, 'En angle'] };
  const vdi2052 = (Qconv, z, a, b, r) => { const dh = a > 0 && b > 0 ? 2 * a * b / (a + b) : 0.6; return 18 * Math.cbrt(Math.max(0, Qconv)) * (z + 1.7 * dh) ** (5 / 3) * r; };
  function calculerHotte(e) {
    const alertes = [], z = num(e.z, 1.1), r = (POSITIONS[e.position] || POSITIONS.mur)[0], maj = 1 + num(e.majoration, 20) / 100;
    const app = (e.appareils || []).filter(a => a && (a.nom || num(a.P) > 0)).map((a, i) => {
      const T = APPAREILS[a.type] || APPAREILS.autre, P = num(a.P), phi = num(a.phi) > 0 ? num(a.phi) : T[2], qk = num(a.qk) > 0 ? num(a.qk) : T[1], A = num(a.a, 0.8), B = num(a.b, 0.7);
      const Qc = P * phi * qk, V = vdi2052(Qc, z, A, B, r);
      return { nom: a.nom || T[0] || `Appareil ${i + 1}`, type: T[0], P, phi, qk, Qc, a: A, b: B, V };
    });
    if (!app.length) alertes.push(alerte('attention', 'Ajoutez les appareils de cuisson sous la hotte.'));
    const Vth = app.reduce((s, a) => s + a.V, 0), Q = Math.ceil(Vth * maj / 10) * 10, Ptot = app.reduce((s, a) => s + a.P, 0);
    // Compensation
    const pc = num(e.compensation, 90), Qc = Q * pc / 100;
    if (pc < 80) alertes.push(alerte('erreur', `Air de compensation ${nf(pc, 0)} % : au moins 80–90 % de l'extraction (cuisine légèrement en dépression, sans aspiration par les portes).`));
    if (pc > 100) alertes.push(alerte('attention', 'Compensation supérieure à l\'extraction : la cuisine serait en surpression (odeurs vers la salle).'));
    // Hotte et filtres
    const Lh = num(e.Lh, 3), lh = num(e.lh, 1.2), deb = num(e.debord, 0.3), Lapp = app.reduce((s, a) => s + a.a, 0), lapp = app.reduce((m, a) => Math.max(m, a.b), 0);
    if (app.length && (Lh < Lapp + 2 * deb - 1e-9 || lh < lapp + deb - 1e-9)) alertes.push(alerte('attention', `Hotte ${nf(Lh, 2)} × ${nf(lh, 2)} m petite pour des appareils sur ${nf(Lapp, 2)} × ${nf(lapp, 2)} m : débord usuel de ${nf(deb, 2)} m (à confirmer avec le cuisiniste).`));
    const Sf = num(e.lf, 0.5) * num(e.hf, 0.5), vCible = num(e.vFiltre, 1.2), nf0 = num(e.nFiltres) > 0 ? Math.round(num(e.nFiltres)) : Math.max(1, Math.ceil(Q / 3600 / (vCible * Sf))), vF = Q / 3600 / Math.max(nf0 * Sf, 1e-9);
    const vMin = num(e.vFmin, 0.5), vMax = num(e.vFmax, 1.5);
    alertes.push(alerte(vF > vMax || vF < vMin ? 'attention' : 'ok', `Filtres à graisses : ${nf0} × ${nf(num(e.lf, 0.5), 2)} × ${nf(num(e.hf, 0.5), 2)} m, ${nf(vF, 2)} m/s (plage ${nf(vMin, 1)}–${nf(vMax, 1)} m/s, notice du filtre).`));
    const vFront = Q / 3600 / Math.max(Lh * lh, 1e-9);
    // Ventilateurs
    const PeE = pFan(Q, num(e.dpE, 500), num(e.eta, 0.5)), meca = e.compType !== 'transfert', PeC = meca ? pFan(Qc, num(e.dpC, 300), num(e.eta, 0.5)) : 0;
    alertes.push(alerte('ok', `Extraction ${nf(Q, 0)} m³/h (${nf(Q / Math.max(Ptot, 1e-9), 0)} m³/h par kW raccordé), compensation ${nf(Qc, 0)} m³/h${meca ? ' mécanique' : ' par transfert'} ; ventilateur d'extraction ≈ ${nf(PeE, 2)} kW.`));
    alertes.push(alerte('attention', 'Chaleurs convectives et simultanéités indicatives : à confirmer (VDI 2052, cuisiniste). Conduit d\'extraction et ventilateur selon la réglementation incendie des cuisines (ERP : GC), nettoyage des conduits, air de compensation tempéré.'));
    return {
      valeurs: { Q, Qc, Vth, PeE, PeC, vF, nFiltres: nf0, vFront, Ptot },
      resume: [['Appareils', `${app.length} · ${nf(Ptot, 1)} kW raccordés`], ['Débit d\'extraction', `${nf(Q, 0)} m³/h (panaches ${nf(Vth, 0)} m³/h + ${nf((maj - 1) * 100, 0)} %)`], ['Air de compensation', `${nf(Qc, 0)} m³/h (${nf(pc, 0)} %)`],
        ['Filtres', `${nf0} filtres, ${nf(vF, 2)} m/s`], ['Vitesse frontale de la hotte', `${nf(vFront, 2)} m/s`], ['Ventilateurs', `extraction ≈ ${nf(PeE, 2)} kW${meca ? ` · compensation ≈ ${nf(PeC, 2)} kW` : ''}`]],
      tableaux: [{ titre: 'Appareils (VDI 2052, méthode thermique)', entetes: ['Appareil', 'Type', 'Puissance (kW)', 'Simultanéité', 'W conv./kW', 'Chaleur convective (W)', 'Plan (m)', 'Débit du panache (m³/h)'],
        lignes: app.map(a => [a.nom, a.type, nf(a.P, 1), nf(a.phi, 2), nf(a.qk, 0), nf(a.Qc, 0), `${nf(a.a, 2)} × ${nf(a.b, 2)}`, nf(a.V, 0)]) }],
      alertes,
      hypotheses: ['VDI 2052 (méthode thermique) : V = 18 · Q_conv^(1/3) · (z + 1,7 · d_h)^(5/3) · r par appareil ; Q_conv = puissance × simultanéité × chaleur convective par kW ; d_h = 2ab/(a+b).',
        `Facteur de position r = ${nf(r, 2)} (îlot 1, mural 0,63, angle 0,4), z = ${nf(z, 2)} m ; majoration de ${nf((maj - 1) * 100, 0)} % (perturbations, courants d'air).`,
        'Puissance des ventilateurs = débit × pression / rendement.'],
      synthese: `${nf(Q, 0)} m³/h extraits · ${nf(Qc, 0)} m³/h compensés`,
    };
  }
  N.TYPES.hotte = {
    titre: 'Hotte de cuisine professionnelle (VDI 2052)', icone: '🍳', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Débit d\'extraction par appareil (méthode thermique VDI 2052), air de compensation, vitesse aux filtres à graisses et ventilateurs (bilan électrique).',
    champs: [{ g: 'Hotte' }, { k: 'position', l: 'Position de la hotte', t: 's', o: Object.entries(POSITIONS).map(([k, x]) => [k, x[1]]), d: 'mur' },
      { k: 'z', l: 'Hauteur entre plan de cuisson et bas de hotte', u: 'm', d: 1.1 }, { k: 'majoration', l: 'Majoration (perturbations)', u: '%', d: 20 },
      { k: 'Lh', l: 'Longueur de la hotte', u: 'm', d: 3 }, { k: 'lh', l: 'Profondeur de la hotte', u: 'm', d: 1.2 }, { k: 'debord', l: 'Débord usuel autour des appareils', u: 'm', d: 0.3 },
      { g: 'Appareils' }, { k: 'appareils', l: 'Appareils sous la hotte (vides : valeurs indicatives du type)', t: 'lignes', d: [
        { nom: 'Fourneau 4 feux', type: 'fourneau', P: 20, phi: '', qk: '', a: 0.8, b: 0.7 }, { nom: 'Friteuse', type: 'friteuse', P: 12, phi: '', qk: '', a: 0.4, b: 0.7 }, { nom: 'Four mixte', type: 'four', P: 18, phi: '', qk: '', a: 0.9, b: 0.8 }],
        colonnes: [{ k: 'nom', l: 'Appareil', t: 't' }, { k: 'type', l: 'Type', t: 's', o: Object.entries(APPAREILS).map(([k, x]) => [k, x[0]]) }, { k: 'P', l: 'Puissance raccordée (kW)' }, { k: 'phi', l: 'Simultanéité' },
          { k: 'qk', l: 'Chaleur convective (W/kW)' }, { k: 'a', l: 'Largeur du plan (m)' }, { k: 'b', l: 'Profondeur du plan (m)' }] },
      { g: 'Compensation et filtres' }, { k: 'compensation', l: 'Air de compensation', u: '% de l\'extraction', d: 90 },
      { k: 'compType', l: 'Compensation', t: 's', o: [['mecanique', 'Mécanique (ventilateur, air tempéré)'], ['transfert', 'Par transfert / entrées d\'air']], d: 'mecanique' },
      { k: 'lf', l: 'Largeur d\'un filtre', u: 'm', d: 0.5 }, { k: 'hf', l: 'Hauteur d\'un filtre', u: 'm', d: 0.5 }, { k: 'nFiltres', l: 'Nombre de filtres (vide : calculé)', d: '' },
      { k: 'vFiltre', l: 'Vitesse cible aux filtres', u: 'm/s', d: 1.2 }, { k: 'vFmin', l: 'Vitesse mini aux filtres', u: 'm/s', d: 0.5 }, { k: 'vFmax', l: 'Vitesse maxi aux filtres', u: 'm/s', d: 1.5 },
      { g: 'Ventilateurs' }, { k: 'dpE', l: 'Pression du ventilateur d\'extraction', u: 'Pa', d: 500 }, { k: 'dpC', l: 'Pression du ventilateur de compensation', u: 'Pa', d: 300 }, { k: 'eta', l: 'Rendement des ventilateurs', d: 0.5 },
      { k: 'repE', l: 'Repère de l\'extracteur', t: 't', d: 'EXT-CUI' }],
    calcul: calculerHotte,
    versElec(v, e) {
      const r = e.repE || 'EXT-CUI', out = [];
      if (v.PeE > 0) out.push({ rep: r, designation: `Extracteur de la hotte de cuisine (${nf(v.Q, 0)} m³/h)`, type: 'ventilateur', P: Math.round(v.PeE * 100) / 100, tension: v.PeE > 1.5 ? 'tri' : 'mono', regulation: 'var' });
      if (v.PeC > 0) out.push({ rep: `${r}-COMP`, designation: `Ventilateur d'air de compensation de la cuisine (${nf(v.Qc, 0)} m³/h)`, type: 'ventilateur', P: Math.round(v.PeC * 100) / 100, tension: v.PeC > 1.5 ? 'tri' : 'mono', regulation: 'var' });
      return out;
    },
  };

  /* ---------- 15. Ventilation de parking ---------- */
  function calculerParking(e) {
    const alertes = [], places = Math.max(0, Math.round(num(e.places, 100))), niv = Math.max(1, Math.round(num(e.niveaux, 1))), q = num(e.qPlace, 600), pv = num(e.pv, 50) / 100;
    const parNiv = Math.ceil(places / niv), S = num(e.S) > 0 ? num(e.S) : places * num(e.sPlace, 25), Sniv = S / niv, V = S * num(e.H, 2.5);
    const QGV = places * q, QPV = QGV * pv, nExt = Math.max(1, Math.round(num(e.nExt, 2))), QnivGV = parNiv * q, Qext = QnivGV / nExt;
    const dp = num(e.dp, 300), eta = num(e.eta, 0.5), Pext = pFan(Qext, dp, eta), Ptot = Pext * nExt * niv, PPV = Ptot * pv ** 3;
    const gaz = e.gaz || 'co+no2', sDet = num(e.sDet, 400), nDet = Math.ceil(Sniv / Math.max(sDet, 1)) * niv;
    const amenee = e.amenee || 'naturelle', Samen = QGV / 3600 / Math.max(num(e.vAmenee, 2), 0.1);
    if (!places) alertes.push(alerte('erreur', 'Nombre de places à saisir.'));
    alertes.push(alerte('ok', `Grande vitesse ${nf(QGV, 0)} m³/h (${nf(QGV / Math.max(V, 1), 1)} vol/h), petite vitesse ${nf(QPV, 0)} m³/h ; ${nExt} extracteur(s) par niveau de ${nf(Qext, 0)} m³/h, ≈ ${nf(Pext, 2)} kW chacun.`));
    if (nExt < 2) alertes.push(alerte('attention', 'Un seul extracteur par niveau : en prévoir au moins deux (secours, maintenance).'));
    if (amenee === 'naturelle') alertes.push(alerte('info', `Amenée d'air naturelle : ≈ ${nf(Samen, 2)} m² libres (${nf(num(e.vAmenee, 2), 1)} m/s), bien répartis à l'opposé des extractions.`));
    if (places > 1000) alertes.push(alerte('attention', 'Plus de 1 000 places : exigences renforcées (désenfumage, compartimentage) — voir le calcul de désenfumage et le bureau de contrôle.'));
    alertes.push(alerte('attention', `Débit de ${nf(q, 0)} m³/h par véhicule : valeur usuelle, réglementation à confirmer (habitation : arrêté du 31 janvier 1986 ; ERP : arrêté du 9 mai 2006, PS ; lieux de travail : code du travail). Seuils de détection indicatifs (valeurs limites d'exposition professionnelle, directive (UE) 2017/164) à valider.`));
    const det = [['co', 'CO', e.coPV, 20, e.coGV, 50, e.coAl, 100, 'ppm'], ['no2', 'NO₂', e.noPV, 0.5, e.noGV, 1, e.noAl, 1, 'ppm']].filter(([k]) => gaz.includes(k));
    const Pam = amenee === 'mecanique' ? pFan(QGV / niv / nExt, dp * 0.7, eta) * nExt * niv : 0;
    return {
      valeurs: { QGV, QPV, Qext, Pext, Ptot, PPV, nExt, niveaux: niv, nDet, Samen, Pam, S },
      resume: [['Parking', `${places} places sur ${niv} niveau(x), ${nf(S, 0)} m²`], ['Grande vitesse', `${nf(QGV, 0)} m³/h (${nf(q, 0)} m³/h/véhicule)`], ['Petite vitesse', `${nf(QPV, 0)} m³/h (${nf(pv * 100, 0)} %)`],
        ['Extracteurs', `${nExt * niv} × ${nf(Qext, 0)} m³/h, ${nf(dp, 0)} Pa, ≈ ${nf(Pext, 2)} kW (total ${nf(Ptot, 1)} kW, ${nf(PPV, 1)} kW en petite vitesse)`],
        ['Détection', `${nDet} détecteur(s) ${det.map(d => d[1]).join(' + ')} (1 pour ${nf(sDet, 0)} m²)`], ['Amenée d\'air', amenee === 'naturelle' ? `naturelle, ≈ ${nf(Samen, 1)} m² libres` : `mécanique, ≈ ${nf(Pam, 1)} kW`]],
      tableaux: [{ titre: 'Seuils de détection (indicatifs)', entetes: ['Gaz', 'Petite vitesse', 'Grande vitesse', 'Alarme'], lignes: det.map(d => [d[1], `${nf(num(d[2], d[3]), 1)} ${d[8]}`, `${nf(num(d[4], d[5]), 1)} ${d[8]}`, `${nf(num(d[6], d[7]), 1)} ${d[8]}`]) },
        { titre: 'Extraction par niveau', entetes: ['Niveau', 'Places', 'Débit GV (m³/h)', 'Extracteurs', 'Détecteurs'], lignes: Array.from({ length: niv }, (_, i) => [`Niveau ${i + 1}`, String(Math.min(parNiv, places - i * parNiv)), nf(QnivGV, 0), String(nExt), String(Math.ceil(Sniv / Math.max(sDet, 1)))]) }],
      alertes,
      hypotheses: [`Grande vitesse = places × ${nf(q, 0)} m³/h ; petite vitesse = ${nf(pv * 100, 0)} % (puissance ∝ débit³).`, 'Extracteurs : débit × pression / rendement, au moins deux par niveau.',
        `Détecteurs : 1 par ${nf(sDet, 0)} m² (rayon d'action selon le fabricant), CO pour l'essence, NO₂ pour le gazole.`, 'Seuils : petite vitesse vers la VLEP 8 h, alarme au plus tard à la VLCT 15 min (CO 20 / 100 ppm, NO₂ 0,5 / 1 ppm, directive (UE) 2017/164).'],
      synthese: `${places} places · ${nf(QGV, 0)} m³/h GV · ${nExt * niv} extracteur(s)`,
    };
  }
  N.TYPES.parking = {
    titre: 'Ventilation de parking (CO / NO₂, deux vitesses)', icone: '🚗', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Débit par véhicule, petite et grande vitesse, extracteurs par niveau (bilan électrique), détection CO / NO₂ et amenée d\'air.',
    champs: [{ g: 'Parking' }, { k: 'places', l: 'Nombre de places', d: 100 }, { k: 'niveaux', l: 'Niveaux', d: 1 }, { k: 'S', l: 'Surface totale (vide : places × surface par place)', u: 'm²', d: '' },
      { k: 'sPlace', l: 'Surface brute par place', u: 'm²', d: 25 }, { k: 'H', l: 'Hauteur sous plafond', u: 'm', d: 2.5 },
      { g: 'Ventilation' }, { k: 'qPlace', l: 'Débit par véhicule (grande vitesse, réglementation à confirmer)', u: 'm³/h', d: 600 }, { k: 'pv', l: 'Petite vitesse', u: '% de la grande', d: 50 },
      { k: 'nExt', l: 'Extracteurs par niveau', d: 2 }, { k: 'dp', l: 'Pression des extracteurs', u: 'Pa', d: 300 }, { k: 'eta', l: 'Rendement', d: 0.5 },
      { k: 'amenee', l: 'Amenée d\'air', t: 's', o: [['naturelle', 'Naturelle (rampes, ouvrants)'], ['mecanique', 'Mécanique']], d: 'naturelle' }, { k: 'vAmenee', l: 'Vitesse dans les amenées naturelles', u: 'm/s', d: 2, si: e => e.amenee !== 'mecanique' },
      { k: 'repExt', l: 'Repère des extracteurs', t: 't', d: 'EXT-PK' },
      { g: 'Détection (seuils indicatifs)' }, { k: 'gaz', l: 'Gaz détectés', t: 's', o: [['co+no2', 'CO et NO₂'], ['co', 'CO seul'], ['no2', 'NO₂ seul']], d: 'co+no2' }, { k: 'sDet', l: 'Surface couverte par détecteur', u: 'm²', d: 400 },
      { k: 'coPV', l: 'CO : petite vitesse', u: 'ppm', d: 20 }, { k: 'coGV', l: 'CO : grande vitesse', u: 'ppm', d: 50 }, { k: 'coAl', l: 'CO : alarme', u: 'ppm', d: 100 },
      { k: 'noPV', l: 'NO₂ : petite vitesse', u: 'ppm', d: 0.5 }, { k: 'noGV', l: 'NO₂ : grande vitesse', u: 'ppm', d: 1 }, { k: 'noAl', l: 'NO₂ : alarme', u: 'ppm', d: 1 }],
    calcul: calculerParking,
    versElec(v, e) {
      const out = [], r = e.repExt || 'EXT-PK';
      for (let n = 1; n <= v.niveaux; n++) for (let k = 1; k <= v.nExt; k++) out.push({ rep: `${r}${v.niveaux > 1 ? `-N${n}` : ''}-${k}`, designation: `Extracteur du parking${v.niveaux > 1 ? ` niveau ${n}` : ''} (${nf(v.Qext, 0)} m³/h, deux vitesses)`, type: 'ventilateur', P: Math.round(v.Pext * 100) / 100, tension: 'tri', regulation: 'var' });
      if (v.Pam > 0) out.push({ rep: `${r}-AM`, designation: 'Ventilateurs d\'amenée d\'air du parking', type: 'ventilateur', P: Math.round(v.Pam * 100) / 100, tension: 'tri', regulation: 'var' });
      if (v.nDet > 0) out.push({ rep: `${r}-DET`, designation: `Centrale de détection CO / NO₂ (${v.nDet} détecteurs)`, type: 'securite', P: 0.05, tension: 'mono', regulation: 'securite' });
      return out;
    },
  };

  /* ---------- 16. Piscine / déshumidification ---------- */
  // Évaporation : VDI 2089 — m = β / (R_v · T) · (p_sat,eau − p_v,air) · S (kg/h), β (m/h) selon l'usage du bassin ;
  // ou Bernier — m = S · (16 + 133 n) · (x_sat,eau − HR · x_sat,air) + 0,1 · N (kg/h), n = baigneurs par m²
  const BETA = { public: [28, 'Bassin public (profondeur > 1,35 m)'], loisirs: [40, 'Bassin de loisirs, eau peu profonde, attractions'], prive: [21, 'Piscine privée'], repos: [7, 'Bassin au repos (inoccupé)'], couvert: [0.7, 'Bassin couvert (bâche)'] };
  function evaporation(e) {
    const S = num(e.S, 250), Tw = num(e.Tw, 28), Ta = num(e.Ta, 30), HR = num(e.HR, 60), Nb = num(e.N, 0);
    if (e.methode === 'bernier') { const n = Nb / Math.max(S, 1e-9); return { m: S * (16 + 133 * n) * (xDe(Tw, 100) - HR / 100 * xDe(Ta, 100)) + 0.1 * Nb, formule: 'Bernier' }; }
    const beta = num(e.beta) > 0 ? num(e.beta) : (BETA[e.usage] || BETA.public)[0], T = 273.15 + (Tw + Ta) / 2;
    return { m: Math.max(0, beta / (461.5 * T) * (pws(Tw) - HR / 100 * pws(Ta)) * S), beta, formule: 'VDI 2089' };
  }
  function calculerPiscine(e) {
    const alertes = [], S = num(e.S, 250), Tw = num(e.Tw, 28), Ta = num(e.Ta, 30), HR = num(e.HR, 60), Nb = num(e.N, 0), ev = evaporation(e), m = ev.m;
    const xi = xDe(Ta, HR), TeE = num(e.TeE, 32), HReE = num(e.HReE, 40), TeH = num(e.TeH, -7), xeE = xDe(TeE, HReE), xeH = xDe(TeH, 90), rho = rhoAir(Ta);
    const dil = xe => (xi - xe > 0.0005 ? m / (rho * (xi - xe)) : Infinity);
    const QdilE = dil(xeE), QdilH = dil(xeH), Qhyg = Nb * num(e.qBaigneur, 22), Vh = num(e.Shall, S * 1.5) * num(e.Hhall, 6), Qbr = Vh * num(e.brassage, 4);
    const thermo = !Number.isFinite(QdilE) || e.deshu === 'thermo';
    const Qan = Math.max(Qhyg, thermo ? 0 : QdilE), Qsouffle = Math.max(Qan, Qbr), Plat = m * 2450 / 3600;
    if (!Number.isFinite(QdilE)) alertes.push(alerte('attention', `Air extérieur d'été (${nf(xeE * 1000, 1)} g/kg) aussi humide que le hall (${nf(xi * 1000, 1)} g/kg) : déshumidification thermodynamique nécessaire en été.`));
    if (Ta < Tw) alertes.push(alerte('erreur', `Air du hall (${nf(Ta, 0)} °C) plus froid que l'eau (${nf(Tw, 0)} °C) : évaporation accrue et inconfort ; air 2 à 3 K au-dessus de l'eau en général.`));
    else if (Ta - Tw > 4) alertes.push(alerte('attention', `Air ${nf(Ta - Tw, 0)} K au-dessus de l'eau : consommation de chauffage élevée (2 à 3 K usuels).`));
    if (HR < 50 || HR > 65) alertes.push(alerte('attention', `Humidité relative ${nf(HR, 0)} % hors de la plage usuelle 50–65 % (confort, condensation sur les parois froides).`));
    // Récupération et chauffage de l'air neuf en hiver
    const eps = num(e.recup, 60) / 100, Pan = Qan * rhoAir(TeH) / 3600 * 1.006 * (Ta - TeH), Prec = Pan * eps, Ptot = rho * Qan / 3600 * (hDe(Ta, xi) - hDe(TeH, xeH)) * eps;
    const Tr = rosee(Ta, HR);
    alertes.push(alerte('ok', `Évaporation ${nf(m, 1)} kg/h (${ev.formule}) soit ${nf(Plat, 1)} kW latents ; air neuf ${nf(Qan, 0)} m³/h, soufflage ${nf(Qsouffle, 0)} m³/h.`));
    alertes.push(alerte('info', `Point de rosée du hall ${nf(Tr, 1)} °C : surfaces intérieures des parois et vitrages à maintenir au-dessus (pont thermique, soufflage le long des vitrages).`));
    alertes.push(alerte('attention', 'Coefficients d\'évaporation et débits indicatifs (VDI 2089 / Bernier) ; nuit : bâche ou ralenti ; débit d\'air neuf hygiénique et traitement d\'eau à confirmer (RSDT, ARS).'));
    const Pvent = pFan(Qsouffle, num(e.dp, 600), 0.55) * 2;
    return {
      valeurs: { m, Plat, Qan, Qsouffle, QdilE, QdilH, Qhyg, Pan, Prec, Ptot, Pvent, xi, Tr },
      resume: [['Bassin', `${nf(S, 0)} m² · eau ${nf(Tw, 0)} °C · air ${nf(Ta, 0)} °C / ${nf(HR, 0)} %`], ['Évaporation', `${nf(m, 1)} kg/h (${ev.formule}${ev.beta ? `, β = ${nf(ev.beta, 1)} m/h` : ''}) · ${nf(m / Math.max(S, 1e-9) * 1000, 0)} g/h·m²`],
        ['Puissance de déshumidification', `${nf(m, 1)} kg/h · ${nf(Plat, 1)} kW latents`], ['Air neuf de déshumidification', `été ${Number.isFinite(QdilE) ? `${nf(QdilE, 0)} m³/h` : 'impossible'} · hiver ${Number.isFinite(QdilH) ? `${nf(QdilH, 0)} m³/h` : '—'}`],
        ['Air neuf retenu', `${nf(Qan, 0)} m³/h (hygiène ${nf(Qhyg, 0)} m³/h)`], ['Soufflage', `${nf(Qsouffle, 0)} m³/h (brassage ${nf(num(e.brassage, 4), 0)} vol/h : ${nf(Qbr, 0)} m³/h)`],
        ['Récupération (hiver)', `${nf(Prec, 1)} kW sensibles (${nf(Ptot, 1)} kW totaux) sur ${nf(Pan, 1)} kW de chauffage de l'air neuf`]],
      tableaux: [],
      alertes,
      hypotheses: [ev.formule === 'Bernier' ? 'Bernier : m = S · (16 + 133 n) · (x_sat(T eau) − HR · x_sat(T air)) + 0,1 · N (kg/h).' : 'VDI 2089 : m = β / (R_v · T) · (p_sat(T eau) − p_v(air)) · S, R_v = 461,5 J/kg·K, T moyenne eau / air ; β : 28 m/h bassin public, 40 loisirs, 21 privé, 7 au repos, 0,7 bâché.',
        'Air neuf de déshumidification = m / (ρ · (x hall − x extérieur)), été au climat de l\'étude, hiver à 90 % d\'humidité ; hygiène : 22 m³/h par baigneur (RSDT).',
        'Récupération : efficacité appliquée à l\'écart hall / extérieur d\'hiver ; chaleur latente de vaporisation 2 450 kJ/kg.'],
      synthese: `${nf(m, 1)} kg/h évaporés · ${nf(Qan, 0)} m³/h d'air neuf`,
    };
  }
  N.TYPES.piscine = {
    titre: 'Piscine : évaporation et déshumidification', icone: '🏊', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Évaporation du bassin (VDI 2089 ou Bernier), débit d\'air de déshumidification, puissance latente, air neuf hygiénique, brassage et récupération.',
    champs: [{ g: 'Bassin' }, { k: 'S', l: 'Surface du plan d\'eau', u: 'm²', d: 250 }, { k: 'Tw', l: 'Température de l\'eau', u: '°C', d: 28 }, { k: 'N', l: 'Baigneurs en pointe', d: 60 },
      { k: 'methode', l: 'Méthode d\'évaporation', t: 's', o: [['vdi', 'VDI 2089 (coefficient β)'], ['bernier', 'Bernier']], d: 'vdi' },
      { k: 'usage', l: 'Usage du bassin', t: 's', o: Object.entries(BETA).map(([k, b]) => [k, `${b[1]} (β = ${String(b[0]).replace('.', ',')} m/h)`]), d: 'public', si: e => e.methode !== 'bernier' },
      { k: 'beta', l: 'β imposé (vide : selon l\'usage)', u: 'm/h', d: '', si: e => e.methode !== 'bernier' },
      { g: 'Hall' }, { k: 'Ta', l: 'Température de l\'air', u: '°C', d: 30 }, { k: 'HR', l: 'Humidité relative', u: '%', d: 60 },
      { k: 'Shall', l: 'Surface du hall (vide : 1,5 × bassin)', u: 'm²', d: '' }, { k: 'Hhall', l: 'Hauteur moyenne du hall', u: 'm', d: 6 }, { k: 'brassage', l: 'Brassage', u: 'vol/h', d: 4 },
      { g: 'Air extérieur (climat de l\'étude)' }, { k: 'TeE', l: 'Température extérieure d\'été', u: '°C', d: 32 }, { k: 'HReE', l: 'Humidité relative d\'été', u: '%', d: 40 }, { k: 'TeH', l: 'Température extérieure d\'hiver', u: '°C', d: -7 },
      { g: 'Traitement' }, { k: 'deshu', l: 'Déshumidification', t: 's', o: [['air', 'Par air neuf (dilution)'], ['thermo', 'Thermodynamique (air neuf hygiénique seul)']], d: 'air' },
      { k: 'qBaigneur', l: 'Air neuf hygiénique par baigneur', u: 'm³/h', d: 22 }, { k: 'recup', l: 'Efficacité de la récupération', u: '%', d: 60 }, { k: 'dp', l: 'Pression des ventilateurs', u: 'Pa', d: 600 },
      { k: 'rep', l: 'Repère de la centrale', t: 't', d: 'CTA-PISC' }],
    calcul: calculerPiscine,
    lier(ctx) { const c = climat(ctx.etude); if (c) { const src = `climat de l'étude (${c.libelle})`; ctx.imposer({ TeE: c.Tete, HReE: c.HRete, TeH: c.Tbase }, src); } },
    versElec(v, e) { return v.Pvent > 0 ? [{ rep: e.rep || 'CTA-PISC', designation: `Centrale de déshumidification de la piscine (${nf(v.Qsouffle, 0)} m³/h, soufflage et reprise)`, type: 'cta', P: Math.round(v.Pvent * 100) / 100, tension: 'tri', regulation: 'bus' }] : []; },
  };

  /* ---------- 17. Confort (ISO 7730) et diffusion ---------- */
  // PMV / PPD : algorithme de l'ISO 7730 (annexe D), ta, tr (°C), var vitesse relative (m/s), HR (%), met, clo, travail externe (met)
  function pmvPpd(ta, tr, vel, rh, met, clo, wme = 0) {
    const pa = rh * 10 * Math.exp(16.6536 - 4030.183 / (ta + 235)), icl = 0.155 * clo, m = met * 58.15, w = wme * 58.15, mw = m - w;
    const fcl = icl <= 0.078 ? 1 + 1.29 * icl : 1.05 + 0.645 * icl, hcf = 12.1 * Math.sqrt(vel), taa = ta + 273, tra = tr + 273;
    const tcla = taa + (35.5 - ta) / (3.5 * icl + 0.1), p1 = icl * fcl, p2 = p1 * 3.96, p3 = p1 * 100, p4 = p1 * taa, p5 = 308.7 - 0.028 * mw + p2 * (tra / 100) ** 4;
    let xn = tcla / 100, xf = tcla / 50, hc = hcf, n = 0;
    while (Math.abs(xn - xf) > 0.00015 && n++ < 150) { xf = (xf + xn) / 2; const hcn = 2.38 * Math.abs(100 * xf - taa) ** 0.25; hc = hcf > hcn ? hcf : hcn; xn = (p5 + p4 * hc - p2 * xf ** 4) / (100 + p3 * hc); }
    const tcl = 100 * xn - 273;
    const hl1 = 3.05 * 0.001 * (5733 - 6.99 * mw - pa), hl2 = mw > 58.15 ? 0.42 * (mw - 58.15) : 0, hl3 = 1.7 * 0.00001 * m * (5867 - pa), hl4 = 0.0014 * m * (34 - ta);
    const hl5 = 3.96 * fcl * (xn ** 4 - (tra / 100) ** 4), hl6 = fcl * hc * (tcl - ta), ts = 0.303 * Math.exp(-0.036 * m) + 0.028;
    const pmv = ts * (mw - hl1 - hl2 - hl3 - hl4 - hl5 - hl6), ppd = 100 - 95 * Math.exp(-0.03353 * pmv ** 4 - 0.2179 * pmv ** 2);
    return { pmv, ppd, tcl, iter: n };
  }
  // Température opérative (ISO 7726) : to = A·ta + (1 − A)·tr, A = 0,5 / 0,6 / 0,7 selon la vitesse d'air
  const operative = (ta, tr, v) => { const A = v < 0.2 ? 0.5 : v < 0.6 ? 0.6 : 0.7; return A * ta + (1 - A) * tr; };
  // Taux d'inconfort dû aux courants d'air (ISO 7730) : DR = (34 − ta)(v − 0,05)^0,62 (0,37 · v · Tu + 3,14), % ; v < 0,05 → 0,05
  const draught = (ta, v, Tu) => { const va = Math.max(v, 0.05); return Math.min(100, Math.max(0, (34 - ta) * (va - 0.05) ** 0.62 * (0.37 * va * Tu + 3.14))); };
  // Catégories ISO 7730 annexe A : [catégorie, PPD maxi, |PMV| maxi, DR maxi]
  const CATEGORIES = [['A', 6, 0.2, 10], ['B', 10, 0.5, 20], ['C', 15, 0.7, 30]];
  const categorie = (pmv, ppd, dr) => (CATEGORIES.find(([, p, m, d]) => ppd <= p + 1e-9 && Math.abs(pmv) <= m + 1e-9 && dr <= d + 1e-9) || ['hors catégorie'])[0];
  const METS = [['0.8', 'Repos, allongé (0,8 met)'], ['1', 'Assis, détendu (1,0 met)'], ['1.2', 'Activité sédentaire, bureau (1,2 met)'], ['1.6', 'Activité légère debout (1,6 met)'], ['2', 'Activité moyenne debout (2,0 met)']];
  // Jet d'une bouche : vitesse sur l'axe v_x = K · q / (√A · x) ; portée x_t = K · q / (√A · v_t) ;
  // chute d'un jet non isotherme (relation de Koestel, coefficient saisissable) : y = c · Ar₀ · x³ / (K · d₀²), Ar₀ = g · ΔT · d₀ / (T · u₀²)
  function jet({ K, A, q, dT, x, vt, c = 0.42, Tair = 26 }) {
    const qs = q / 3600, u0 = qs / Math.max(A, 1e-9), d0 = Math.sqrt(4 * A / Math.PI), Ar = 9.81 * Math.abs(dT) * d0 / ((273.15 + Tair) * u0 * u0);
    const vx = K > 0 && x > 0 ? Math.min(u0, K * qs / (Math.sqrt(A) * x)) : NaN, portee = K > 0 ? K * qs / (Math.sqrt(A) * vt) : NaN, chute = K > 0 ? c * Ar * x ** 3 / (K * d0 * d0) : NaN;
    return { u0, d0, Ar, vx, portee, chute };
  }
  function calculerConfort(e) {
    const alertes = [], ta = num(e.ta, 24), tr = num(e.tr, ta), v = num(e.v, 0.15), HR = num(e.HR, 50), met = num(e.met, 1.2), clo = num(e.clo, 0.5), Tu = num(e.Tu, 40);
    const vr = met > 1 ? v + 0.3 * (met - 1) : v, r = pmvPpd(ta, tr, vr, HR, met, clo), to = operative(ta, tr, v), dr = draught(ta, v, Tu), cat = categorie(r.pmv, r.ppd, dr);
    if (r.iter >= 150) alertes.push(alerte('attention', 'Calcul de la température de vêture non convergé : vérifier les données.'));
    if (ta < 10 || ta > 30 || clo > 2 || met > 4 || v > 1) alertes.push(alerte('attention', 'Données hors du domaine de validité de l\'ISO 7730 (ta 10–30 °C, v ≤ 1 m/s, met 0,8–4, clo 0–2).'));
    alertes.push(alerte(cat === 'hors catégorie' ? 'attention' : 'ok', `PMV ${nf(r.pmv, 2)}, PPD ${nf(r.ppd, 1)} %, inconfort dû aux courants d'air ${nf(dr, 1)} % : ${cat === 'hors catégorie' ? 'hors des catégories A à C' : `catégorie ${cat}`} (ISO 7730).`));
    // Jet de la bouche
    const K = num(e.K, 1.4), A = num(e.A, 0.03), q = num(e.q, 150), dT = num(e.dT, -8), x = num(e.x, 2), vt = num(e.vt, 0.25), j = jet({ K, A, q, dT, x, vt, c: num(e.cKoestel, 0.42), Tair: ta });
    if (Number.isFinite(j.vx) && j.vx > v + 0.05 && j.vx > 0.25) alertes.push(alerte('attention', `Vitesse du jet ${nf(j.vx, 2)} m/s à ${nf(x, 1)} m : supérieure à la vitesse d'air retenue en zone occupée (${nf(v, 2)} m/s) — portée à revoir.`));
    if (Number.isFinite(j.chute) && dT < 0 && j.chute > num(e.hDispo, 0.8)) alertes.push(alerte('attention', `Chute du jet froid ${nf(j.chute, 2)} m à ${nf(x, 1)} m, plus que les ${nf(num(e.hDispo, 0.8), 2)} m disponibles au-dessus de la zone d'occupation : effet Coanda, ΔT ou vitesse à revoir.`));
    return {
      valeurs: { pmv: r.pmv, ppd: r.ppd, to, dr, categorie: cat, vx: j.vx, portee: j.portee, chute: j.chute, u0: j.u0, Ar: j.Ar },
      resume: [['PMV / PPD', `${nf(r.pmv, 2)} / ${nf(r.ppd, 1)} %`], ['Température opérative', `${nf(to, 1)} °C`], ['Courants d\'air (DR)', `${nf(dr, 1)} %`], ['Catégorie ISO 7730', cat],
        ['Bouche', `${nf(q, 0)} m³/h, ${nf(A * 1e4, 0)} cm², u₀ = ${nf(j.u0, 2)} m/s`], ['Portée (v = ' + nf(vt, 2) + ' m/s)', `${nf(j.portee, 2)} m`], [`Vitesse à ${nf(x, 1)} m`, `${nf(j.vx, 2)} m/s`], [`Chute à ${nf(x, 1)} m`, dT ? `${nf(j.chute, 2)} m (Ar₀ = ${nf(j.Ar, 4)})` : 'jet isotherme']],
      tableaux: [{ titre: 'Catégories ISO 7730', entetes: ['Catégorie', 'PPD (%)', 'PMV', 'DR (%)'], lignes: CATEGORIES.map(([c, p, m, d]) => [`${c === cat ? '★ ' : ''}${c}`, `< ${p}`, `± ${nf(m, 1)}`, `< ${d}`]) }],
      alertes,
      hypotheses: ['PMV / PPD : algorithme de Fanger de l\'ISO 7730 (annexe D) ; vitesse relative = v + 0,3 (met − 1) pour une activité > 1 met.', 'Température opérative : to = A·ta + (1 − A)·tr (A = 0,5 / 0,6 / 0,7 selon la vitesse).',
        'Courants d\'air : DR = (34 − ta)(v − 0,05)^0,62 (0,37 v Tu + 3,14).', 'Jet : v_x = K·q/(√A·x), portée à la vitesse terminale, chute y = c·Ar₀·x³/(K·d₀²) (relation de Koestel, coefficient c saisissable ; ordre de grandeur, confirmer par les abaques du fabricant).'],
      synthese: `PMV ${nf(r.pmv, 2)} · PPD ${nf(r.ppd, 0)} % · cat. ${cat}`,
    };
  }
  // Bouches de l'étude (calcul « Sélection des bouches ») : options « note|ligne »
  const optBouches = (e, et) => [['', '— (caractéristiques saisies)'], ...(et ? [] : garder(e, 'bouche')), ...((et && et.notes) || []).filter(n => n.type === 'bouches').flatMap(n => ((n.entrees || {}).locaux || []).map((l, i) => [`${n.id}|${i}`, `${n.titre} — ${l.local || `ligne ${i + 1}`}`]))];
  function caracBouche(ctx, n, i) {
    const C = C_(), v = (ctx.calculer(n).valeurs || {}).bouches || [], b = v[i], l = ((ctx.resoudre(n).locaux) || [])[i];
    if (!b || !C) return null;
    const cle = (l && C.BOUCHES[l.type]) ? l.type : Object.keys(C.BOUCHES).find(k => C.BOUCHES[k].libelle === b.type), B = C.BOUCHES[cle];
    if (!B || !B.K) return null;
    const t = B.tailles.find(([nom]) => nom === b.taille);
    return t ? { K: B.K, A: Math.round(t[1] * 1e5) / 1e5, q: Math.round(b.q), local: b.local } : null;
  }
  N.TYPES.confort = {
    titre: 'Confort thermique (PMV / PPD) et diffusion d\'air', icone: '🌡️', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'PMV et PPD de Fanger (ISO 7730), température opérative, courants d\'air et catégories ; portée, vitesse et chute du jet d\'une bouche (reprise des bouches de l\'étude).',
    champs: [{ g: 'Ambiance' }, { k: 'ta', l: 'Température de l\'air', u: '°C', d: 24 }, { k: 'tr', l: 'Température moyenne radiante', u: '°C', d: 24 }, { k: 'v', l: 'Vitesse d\'air en zone occupée', u: 'm/s', d: 0.15 },
      { k: 'HR', l: 'Humidité relative', u: '%', d: 50 }, { k: 'Tu', l: 'Intensité de turbulence', u: '%', d: 40 },
      { k: 'met', l: 'Activité', t: 's', o: METS, d: '1.2' }, { k: 'clo', l: 'Vêture (0,5 été, 1,0 hiver)', u: 'clo', d: 0.5 },
      { g: 'Bouche' }, { k: 'bouche', l: 'Bouche de l\'étude', t: 's', o: optBouches, d: '' },
      { k: 'K', l: 'Constante de jet K (vide : 1,4)', d: '' }, { k: 'A', l: 'Section effective (vide : 0,03)', u: 'm²', d: '' }, { k: 'q', l: 'Débit par bouche (vide : 150)', u: 'm³/h', d: '' },
      { k: 'dT', l: 'Écart soufflage − ambiance (négatif en froid)', u: 'K', d: -8 }, { k: 'x', l: 'Distance jusqu\'à la zone d\'occupation', u: 'm', d: 2 }, { k: 'vt', l: 'Vitesse terminale de la portée', u: 'm/s', d: 0.25 },
      { k: 'hDispo', l: 'Hauteur disponible au-dessus de la zone d\'occupation', u: 'm', d: 0.8 }, { k: 'cKoestel', l: 'Coefficient de chute (Koestel)', d: 0.42 }],
    calcul: calculerConfort,
    lier(ctx) {
      const { e, notes } = ctx;
      if (e.bouche) {
        const [id, i] = String(e.bouche).split('|'), n = notes.find(x => x.id === id && x.type === 'bouches');
        const c = n && caracBouche(ctx, n, +i);
        if (c) ctx.imposer({ K: c.K, A: c.A, q: c.q }, `${ctx.libelle(n)} (${c.local})`);
        else ctx.alertes.push(alerte('attention', 'La bouche choisie n\'existe plus ou n\'a pas de jet (extraction) : caractéristiques saisies conservées.'));
        return;
      }
      // Sans choix : première bouche de soufflage de l'étude proposée (champs vides seulement)
      for (const n of notes.filter(x => x.type === 'bouches')) {
        const nb = ((ctx.resoudre(n).locaux) || []).length;
        for (let i = 0; i < nb; i++) { const c = caracBouche(ctx, n, i); if (c) { ctx.proposer({ K: c.K, A: c.A, q: c.q }, `${ctx.libelle(n)} (${c.local})`); return; } }
      }
    },
  };

  /* ---------- 18. Puits canadien / géocooling ---------- */
  // Températures moyennes annuelles de l'air (≈ température du sol en profondeur), °C — ordres de grandeur par climat de l'étude, à confirmer
  const TMOY = { annonay: 11.5, lyon: 12.5, 'st-etienne': 11, valence: 13.5, grenoble: 12, chambery: 11.5, clermont: 11.5, dijon: 11.5, paris: 12.5, lille: 11, strasbourg: 11, nancy: 10.5, limoges: 11.5,
    nantes: 12.5, rennes: 12, brest: 11.5, bordeaux: 13.5, toulouse: 13.5, montpellier: 15.5, marseille: 15.5, nice: 16 };
  // Température du sol à la profondeur z : Tm ± As · exp(−z/d), d = √(2a/ω) (onde annuelle amortie ; déphasage négligé, côté sécurité)
  const amortissement = (z, a) => { const w = 2 * Math.PI / (365 * 86400), d = Math.sqrt(2 * a / w); return { d, f: Math.exp(-z / d) }; };
  const lambdaHaaland = (Re, eps, D) => (Re < 2300 ? 64 / Math.max(Re, 1) : (1 / (-1.8 * Math.log10((eps / D / 3.7) ** 1.11 + 6.9 / Re))) ** 2);
  function calculerPuits(e) {
    const alertes = [], Q = num(e.Q, 1000), n = Math.max(1, Math.round(num(e.nTubes, 3))), L = num(e.L, 40), D = num(e.D, 0.2), z = num(e.z, 2), lam = num(e.lambdaSol, 1.5), a = num(e.diff, 0.6) * 1e-6;
    if (vide(e.Q)) alertes.push(alerte('info', 'Débit d\'air non saisi : 1 000 m³/h pris en exemple (ou repris de la CTA de l\'étude).'));
    const Tm = num(e.Tm, 12), As = num(e.As, 9), am = amortissement(z, a), TsH = Tm - As * am.f, TsE = Tm + As * am.f;
    const TeH = num(e.TeH, -7), TeE = num(e.TeE, 32), HReE = num(e.HReE, 40);
    // Échange dans un tube
    const qt = Q / n / 3600, Ai = Math.PI * D * D / 4, v = qt / Ai, nu = 1.5e-5, Re = v * D / nu, lamA = 0.026, Pr = 0.71;
    const Nu = Re > 2300 ? 0.023 * Re ** 0.8 * Pr ** 0.35 : 3.66, h = Nu * lamA / D;
    const ep = num(e.ep, 6) / 1000, Rconv = 1 / (h * Math.PI * D), Rtube = Math.log((D + 2 * ep) / D) / (2 * Math.PI * num(e.lambdaTube, 0.4)), Rsol = Math.acosh(Math.max(1.0001, 2 * z / (D + 2 * ep))) / (2 * Math.PI * lam);
    const UA = L / (Rconv + Rtube + Rsol), mcp = 1.2 * qt * 1006, NUT = UA / mcp, eff = 1 - Math.exp(-NUT);
    const ToH = TeH + eff * (TsH - TeH), ToE = TeE - eff * (TeE - TsE), Pq = 1.2 * Q / 3600 * 1.006;
    const gainH = Pq * (ToH - TeH), gainE = Pq * (TeE - ToE);
    // Pertes de charge
    const lambda = lambdaHaaland(Re, num(e.rug, 0.01) / 1000, D), pd = 1.2 * v * v / 2, dP = lambda * L / D * pd + num(e.zeta, 3) * pd + num(e.dpFiltre, 50);
    // Condensation d'été
    const Td = rosee(TeE, HReE), cond = ToE < Td || TsE < Td;
    if (cond) alertes.push(alerte('attention', `Condensation en été (point de rosée de l'air extérieur ${nf(Td, 1)} °C, paroi des tubes ≈ ${nf(TsE, 1)} °C, sortie ${nf(ToE, 1)} °C) : pente ≥ 2 % vers un regard de purge siphonné, tubes lisses nettoyables.`));
    if (v < 1 || v > 3) alertes.push(alerte('attention', `Vitesse dans les tubes ${nf(v, 2)} m/s hors de la plage usuelle 1–3 m/s (échange / pertes de charge).`));
    if (z < 1.5) alertes.push(alerte('attention', `Profondeur ${nf(z, 1)} m : sol encore très influencé par la surface (1,5 à 3 m usuels).`));
    alertes.push(alerte('ok', `Efficacité ${nf(eff * 100, 0)} % (NUT ${nf(NUT, 2)}) : hiver ${nf(TeH, 0)} → ${nf(ToH, 1)} °C (+${nf(gainH, 2)} kW), été ${nf(TeE, 0)} → ${nf(ToE, 1)} °C (−${nf(gainE, 2)} kW) ; ΔP ${nf(dP, 0)} Pa.`));
    alertes.push(alerte('attention', 'Régime établi, sol à température non perturbée : en fonctionnement continu le sol autour des tubes se sature (gains réels plus faibles) ; température moyenne du sol et amplitude à confirmer (étude de sol, données locales). Hygiène : prise d\'air protégée, filtre, accès au nettoyage, radon.'));
    return {
      valeurs: { Q, v, Re, NUT, eff, TsH, TsE, ToH, ToE, gainH, gainE, dP, Td, cond },
      resume: [['Puits', `${n} tube(s) Ø ${nf(D * 1000, 0)} mm × ${nf(L, 0)} m à ${nf(z, 1)} m de profondeur`], ['Débit', `${nf(Q, 0)} m³/h (${nf(v, 2)} m/s, Re ${nf(Re, 0)})`],
        ['Sol (Tm ± amplitude amortie)', `hiver ${nf(TsH, 1)} °C · été ${nf(TsE, 1)} °C (Tm ${nf(Tm, 1)} °C, amortissement ${nf(am.f * 100, 0)} %)`], ['Efficacité', `${nf(eff * 100, 0)} % (NUT ${nf(NUT, 2)})`],
        ['Hiver', `${nf(TeH, 0)} → ${nf(ToH, 1)} °C, gain ${nf(gainH, 2)} kW`], ['Été', `${nf(TeE, 0)} → ${nf(ToE, 1)} °C, rafraîchissement ${nf(gainE, 2)} kW`], ['Pertes de charge', `${nf(dP, 0)} Pa (filtre compris)`],
        ['Condensation', cond ? `oui (rosée ${nf(Td, 1)} °C) : pente et purge` : `non (rosée ${nf(Td, 1)} °C)`]],
      tableaux: [],
      alertes,
      hypotheses: ['Sol : T(z) = Tm ± As · e^(−z/d), d = √(2a/ω), déphasage négligé (côté sécurité).',
        'Échange : Nu = 0,023 Re^0,8 Pr^0,35 (turbulent) ou 3,66 (laminaire) ; résistances convective, du tube et du sol (facteur de forme d\'un tube enterré, acosh(2z/D)/(2πλ)) ; ε = 1 − e^(−NUT).',
        'Pertes de charge : Darcy (λ de Haaland) + Σζ + filtre et prise d\'air.', 'Températures extérieures de base et d\'été, humidité d\'été : climat de l\'étude.'],
      synthese: `ε ${nf(eff * 100, 0)} % · +${nf(gainH, 1)} kW hiver · −${nf(gainE, 1)} kW été`,
    };
  }
  N.TYPES.puitsCanadien = {
    titre: 'Puits canadien / géocooling', icone: '🌍', famille: FAMILLE, annexe: true, theme: THEME,
    description: 'Température du sol selon la profondeur, efficacité de l\'échangeur (NUT), gains d\'hiver et d\'été, pertes de charge et risque de condensation.',
    champs: [{ g: 'Air' }, { k: 'Q', l: 'Débit d\'air (vide : CTA de l\'étude)', u: 'm³/h', d: '' },
      { g: 'Tubes' }, { k: 'nTubes', l: 'Tubes en parallèle', d: 3 }, { k: 'L', l: 'Longueur d\'un tube', u: 'm', d: 40 }, { k: 'D', l: 'Diamètre intérieur', u: 'm', d: 0.2 },
      { k: 'ep', l: 'Épaisseur du tube', u: 'mm', d: 6 }, { k: 'lambdaTube', l: 'Conductivité du tube (PE, PP)', u: 'W/m·K', d: 0.4 }, { k: 'z', l: 'Profondeur', u: 'm', d: 2 },
      { k: 'rug', l: 'Rugosité', u: 'mm', d: 0.01 }, { k: 'zeta', l: 'Singularités Σζ (entrée, coudes, sortie)', d: 3 }, { k: 'dpFiltre', l: 'Filtre et prise d\'air', u: 'Pa', d: 50 },
      { g: 'Sol et climat' }, { k: 'Tm', l: 'Température moyenne annuelle (vide : climat de l\'étude)', u: '°C', d: '' }, { k: 'As', l: 'Amplitude annuelle en surface', u: 'K', d: 9 },
      { k: 'lambdaSol', l: 'Conductivité du sol', u: 'W/m·K', d: 1.5 }, { k: 'diff', l: 'Diffusivité du sol', u: '10⁻⁶ m²/s', d: 0.6 },
      { k: 'TeH', l: 'Température extérieure d\'hiver', u: '°C', d: '' }, { k: 'TeE', l: 'Température extérieure d\'été', u: '°C', d: '' }, { k: 'HReE', l: 'Humidité relative d\'été', u: '%', d: '' }],
    calcul: calculerPuits,
    lier(ctx) {
      const c = climat(ctx.etude);
      if (c) { const src = `climat de l'étude (${c.libelle})`; ctx.proposer({ TeH: c.Tbase, TeE: c.Tete, HReE: c.HRete, ...(TMOY[c.cle] ? { Tm: TMOY[c.cle] } : {}) }, src); }
      const ctas = ctx.notes.filter(n => n.type === 'cta');
      if (ctas.length) { const n = ctas[0], Qs = num(ctx.resoudre(n).Qs); if (Qs > 0) ctx.proposer({ Q: Qs }, ctx.libelle(n)); }
    },
  };

  return { USAGES, POLLUTION, LOGEMENT, logement, debitLocal, calculerAirNeuf, APPAREILS, POSITIONS, vdi2052, calculerHotte, calculerParking, BETA, evaporation, calculerPiscine,
    pmvPpd, operative, draught, categorie, CATEGORIES, jet, calculerConfort, TMOY, amortissement, calculerPuits, pws, xDe, hDe, rosee, reprendre };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = AnnexesAir;
