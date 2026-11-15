// Mesures de mise en service reprises dans l'étude : débits et pressions relevés sur le chantier (relevés d'équilibrage
// hydraulique et aéraulique, PV de mise en service de Pipe-Fit) comparés aux valeurs calculées, par terminal, circuit,
// bouche, pompe et ventilateur (écart en %, tolérance réglable), et réglages proposés :
// - vanne d'équilibrage : nouveau nombre de tours (abaque tours:Kv du fabricant, sinon caractéristique linéaire) ;
// - pompe : consigne de hauteur et vitesse (lois de similitude, courbe du fabricant si elle est connue) ;
// - ventilateur : fréquence / signal du variateur et consigne de pression de gaine (lois des ventilateurs) ;
// - bouche : sens et ampleur du réglage (Q proportionnel à √ΔP).
// Module pur (navigateur, node, tests) ; tableau « Réglages proposés » imprimable (html).
const MesuresRetour = (() => {
  const n = v => (v === '' || v === null || v === undefined ? null : Number.isFinite(Number(String(v).replace(',', '.'))) ? Number(String(v).replace(',', '.')) : null);
  const r = (v, d = 1) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
  const txt = (v, k = 160) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, k);
  const nf = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const essai = f => { try { return f(); } catch (e) { return null; } };
  const NIVEAUX = { terminal: 'Terminal', circuit: 'Circuit', bouche: 'Bouche', pompe: 'Pompe', ventilateur: 'Ventilateur', equipement: 'Équipement', installation: 'Installation' };
  // Grandeurs comparées : débits et pressions (les températures ont leur propre tolérance dans le PV)
  const UNITE_DEBIT = /m³\/h|m3\/h|l\/s|l\/h/i, UNITE_PRESSION = /^(pa|kpa|mce|bar)$/i;
  const comparable = u => UNITE_DEBIT.test(String(u || '')) || UNITE_PRESSION.test(String(u || '').trim());

  /* ---------- Abaques des vannes d'équilibrage ---------- */
  // « 1:0,9 ; 2:2,1 ; 3:3,6 » → [[1, 0.9], [2, 2.1], [3, 3.6]] (tours croissants)
  const lireAbaque = t => (Array.isArray(t) ? t : String(t || '').split(/[;|\n]+/).map(p => p.trim().split(/\s*[:=/]\s*/).map(n)))
    .filter(p => p && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])).map(p => [p[0], p[1]]).sort((a, b) => a[0] - b[0]);
  // Kv d'une vanne à un nombre de tours (abaque interpolée, sinon linéaire Kvs · t / tmax)
  function kvAuxTours(v, t) {
    if (!(t > 0)) return null;
    const ab = lireAbaque(v.abaque);
    if (ab.length >= 2) {
      if (t <= ab[0][0]) return ab[0][1] * t / ab[0][0];
      for (let i = 1; i < ab.length; i++) if (t <= ab[i][0]) { const [t0, k0] = ab[i - 1], [t1, k1] = ab[i]; return k0 + (k1 - k0) * (t - t0) / (t1 - t0); }
      return ab[ab.length - 1][1];
    }
    return v.Kvs > 0 && v.toursMax > 0 ? v.Kvs * Math.min(t, v.toursMax) / v.toursMax : null;
  }
  // Tours pour un Kv (abaque interpolée, sinon linéaire) ; borne : 'mini' (vanne trop grande) / 'maxi' (vanne grande ouverte)
  function toursPourKv(v, Kv) {
    if (!(Kv > 0)) return null;
    const ab = lireAbaque(v.abaque);
    if (ab.length >= 2) {
      if (Kv < ab[0][1]) return { tours: ab[0][0], borne: 'mini', abaque: true };
      for (let i = 1; i < ab.length; i++) { const [t0, k0] = ab[i - 1], [t1, k1] = ab[i]; if (Kv <= k1) return { tours: k1 === k0 ? t1 : t0 + (t1 - t0) * (Kv - k0) / (k1 - k0), borne: '', abaque: true }; }
      return { tours: ab[ab.length - 1][0], borne: 'maxi', abaque: true };
    }
    if (!(v.Kvs > 0 && v.toursMax > 0)) return null;
    const t = v.toursMax * Kv / v.Kvs;
    return { tours: Math.max(0.5, Math.min(v.toursMax, t)), borne: t > v.toursMax ? 'maxi' : t < 0.5 ? 'mini' : '', abaque: false };
  }
  // Nombre de tours lu dans le réglage noté sur le relevé (« 2,5 tours », « préréglage 3 t », « pos. 4,2 »)
  const toursDe = s => { const m = /(\d+(?:[.,]\d+)?)\s*(?:tours?|t\b)/i.exec(String(s || '')) || /(?:pos(?:ition)?\.?|pr[ée]r[ée]glage)\s*(\d+(?:[.,]\d+)?)/i.exec(String(s || '')); return m ? n(m[1]) : null; };

  // Nouveau réglage d'une vanne d'équilibrage : débit mesuré Qm au réglage actuel, débit calculé Qc. À pression
  // différentielle inchangée aux bornes de la vanne (première approche), Kv suivant = Kv actuel × Qc / Qm.
  function reglageVanne(v, Qc, Qm, toursActuels) {
    if (!(Qc > 0) || !(Qm > 0)) return null;
    const t0 = toursActuels > 0 ? toursActuels : v.tours, k0 = kvAuxTours(v, t0);
    if (!(k0 > 0)) return null;
    const k1 = k0 * Qc / Qm, p = toursPourKv(v, k1);
    if (!p) return null;
    return { toursActuels: r(t0, 1), kvActuel: r(k0, 2), kvPropose: r(k1, 2), tours: r(p.tours, 1), borne: p.borne, abaque: p.abaque,
      note: p.borne === 'maxi' ? 'vanne grande ouverte : le débit calculé n\'est pas atteint, contrôler la pompe (consigne) ou les vannes en amont'
        : p.borne === 'mini' ? 'vanne presque fermée : vanne plus petite ou régulateur de pression différentielle' : '' };
  }
  // Pompe : point mesuré (Qm, Hm) sur la courbe du réseau H = k · Q² ; pour Qc : Hc = Hm · (Qc / Qm)², vitesse × Qc / Qm
  // (lois de similitude) ; avec la courbe du fabricant (pleine vitesse), vitesse de réglage pour atteindre (Qc, Hc)
  function reglagePompe({ Qc, Qm, Hm, vitesse, courbe }) {
    if (!(Qc > 0) || !(Qm > 0)) return null;
    const ratio = Qc / Qm, Hc = Hm > 0 ? Hm * ratio * ratio : null, out = { ratio: r(ratio, 3), consigneH: r(Hc, 2), vitesseActuelle: vitesse > 0 ? r(vitesse, 0) : null, vitesse: vitesse > 0 ? r(vitesse * ratio, 0) : null };
    const PO = essai(() => (typeof Pompes !== 'undefined' ? Pompes : require('./pompes')));
    if (PO && Hc > 0 && courbe && (Array.isArray(courbe) ? courbe.length >= 2 : String(courbe).trim())) {
      const c = Array.isArray(courbe) ? courbe.map(p => ({ Q: n(p.Q), H: n(p.H), P: null })).filter(p => p.Q !== null && p.H !== null) : PO.lireCourbe(courbe);
      const pt = c.length >= 2 ? essai(() => PO.point(c, Qc, Hc)) : null;
      if (pt && pt.ok && pt.vitesse) Object.assign(out, { vitesseCourbe: r(pt.vitesse, 0) });
      else if (pt && !pt.ok) out.note = 'pompe insuffisante à pleine vitesse pour le débit calculé (courbe du fabricant)';
    }
    return out;
  }
  // Ventilateur : Q ∝ N (fréquence, signal), ΔP ∝ N² ; consigne de pression de gaine × (Qc / Qm)²
  function reglageVentilateur({ Qc, Qm, frequence, signal, pression }) {
    if (!(Qc > 0) || !(Qm > 0)) return null;
    const k = Qc / Qm, f = frequence > 0 ? frequence * k : null;
    return { ratio: r(k, 3), frequence: r(f, 1), frequenceActuelle: frequence > 0 ? r(frequence, 1) : null, signal: signal > 0 ? r(Math.min(100, signal * k), 0) : null, signalActuel: signal > 0 ? r(signal, 0) : null,
      pression: pression > 0 ? r(pression * k * k, 0) : null, pressionActuelle: pression > 0 ? r(pression, 0) : null,
      note: f > 50.5 ? 'au-delà de 50 Hz : vérifier l\'intensité du moteur et la courbe du ventilateur' : signal > 0 && signal * k > 100 ? 'signal maxi atteint : ventilateur insuffisant, réseau à reprendre' : '' };
  }
  // Bouche : Q ∝ √ΔP au plénum → ΔP × (Qc / Qm)²
  function reglageBouche(Qc, Qm) {
    if (!(Qc > 0) || !(Qm > 0)) return null;
    const k = Qc / Qm;
    return { ratio: r(k, 3), sens: k > 1 ? 'ouvrir' : 'fermer', dp: r(k * k, 2), variation: r((k - 1) * 100, 0) };
  }

  /* ---------- Valeurs calculées de l'étude ---------- */
  // Vannes d'équilibrage et pompes des réseaux arborescents, débits théoriques transmis au chantier (par repère)
  function calcules(et, L) {
    const vannes = new Map(), pompes = [], theoriques = new Map();
    const PM = essai(() => (typeof PointsMes !== 'undefined' ? PointsMes : require('./points-mes')));
    (essai(() => PM.debits(et, L)) || []).forEach(d => (d.lignes || []).forEach(l => { if (l.repere && n(l.theorique) !== null) theoriques.set(String(l.repere).trim(), { Q: n(l.theorique), unite: d.unite, installation: d.installation, type: d.type, local: l.local || '' }); }));
    ((et && et.notes) || []).filter(x => x.type === 'arbo').forEach(note => {
      const v = (essai(() => L.calculer(et, note)) || {}).valeurs || {}, e = (essai(() => L.resoudre(et, note).entrees)) || note.entrees || {};
      const rob = e.robinetterie || [];
      (v.vannes || []).forEach(x => {
        const fiche = rob.find(o => o && o.type === 'equilibrage' && (o.rep === x.vanneRep || (o.troncon === x.rep && !x.vanneRep)));
        vannes.set(String(x.repVanne || x.rep).trim(), { rep: x.rep, repVanne: x.repVanne || x.rep, nom: x.nom || '', Q: x.Q, Kv: x.Kv, Kvs: x.Kvs, tours: x.tours, toursMax: x.toursMax || 4, dn: x.dn,
          abaque: fiche && fiche.abaque ? fiche.abaque : '', ref: x.ref || '', terminal: !!x.terminal, chemin: x.chemin || '', noteId: note.id, installation: note.titre || '' });
      });
      if (v.Qp > 0) pompes.push({ noteId: note.id, installation: note.titre || '', ref: e.pompeRef || '', Q: v.Qp, H: v.HMT, courbe: e.pompeCourbe || '', vitesse: v.pompeRetenue ? v.pompeRetenue.vitesse : null });
    });
    return { vannes, pompes, theoriques };
  }

  /* ---------- Comparaison mesuré / calculé ---------- */
  const NIVEAU_PV = { terminal: 'terminal', pompes: 'pompe', cta: 'ventilateur', vmc: 'ventilateur', bouche: 'bouche', reseau: 'circuit', desenfumage: 'ventilateur' };
  const releveDe = m => { const x = /^(Débit(?: d'eau)?) (\S+)(?: — (.*?))? · (.+)$/.exec(String((m && m.libelle) || '')); return x ? { repere: x[2], piece: x[3] || '', detail: x[4] } : null; };
  // Débit calculé de l'étude dans l'unité du relevé (vannes en m³/h ; débits transmis dans leur unité)
  const M3H = { 'm³/h': 1, 'm3/h': 1, 'l/h': 0.001, 'l/s': 3.6 };
  const conv = (q, de, vers) => { const a = M3H[String(de || '').toLowerCase()], b = M3H[String(vers || '').toLowerCase()]; return a && b ? q * a / b : q; };
  const calculDe = (C, l, unite) => { const rep = txt(l.repere, 40), v = C.vannes.get(rep), t = C.theoriques.get(rep); return v ? conv(v.Q, 'm³/h', unite) : t ? conv(t.Q, t.unite, unite) : n(l.theorique); };
  const ecartPct = (c, m) => (c > 0 && m !== null ? r((m - c) / c * 100, 1) : null);
  const val = (ms, re, sec) => { const x = (ms || []).find(y => re.test(y.libelle || '') && (sec === undefined || (y.section || '') === sec) && n(y.valeur) !== null); return x ? n(x.valeur) : null; };

  // { et, L, equilibrages, mises, tolerance } → { lignes, reglages, bilan, tolerance }
  function comparer({ et, L, equilibrages = [], mises = [], tolerance = 10 } = {}) {
    const tol = n(tolerance) > 0 ? n(tolerance) : 10, C = et && L ? calcules(et, L) : { vannes: new Map(), pompes: [], theoriques: new Map() };
    const lignes = [], reglages = [], vus = new Set();
    const ajouter = (o) => { const e = ecartPct(o.calcule, o.mesure); lignes.push({ ...o, ecart: e, conforme: e === null ? null : Math.abs(e) <= tol + 1e-9 }); return lignes[lignes.length - 1]; };
    // 1. Relevés d'équilibrage (bouche par bouche, vanne par vanne)
    (equilibrages || []).forEach(eq => {
      const hydro = eq.type === 'Hydraulique', unite = eq.unite || (hydro ? 'm³/h' : 'm³/h'), src = `${eq.numero ? `Relevé ${eq.numero}` : 'Relevé d\'équilibrage'}${eq.date ? ` du ${String(eq.date).slice(0, 10).split('-').reverse().join('/')}` : ''}`;
      let sc = 0, sm = 0, k = 0;
      (eq.lignes || []).forEach(l => {
        const rep = txt(l.repere, 40), mes = n(l.mesure); if (!rep && !l.local) return;
        const v = C.vannes.get(rep), t = C.theoriques.get(rep), calc = calculDe(C, l, unite);
        if (mes === null || !(calc > 0)) return;
        vus.add(rep);
        const niveau = hydro ? (v ? (v.terminal ? 'terminal' : 'circuit') : /antenne|partenaire/i.test(l.local || '') ? 'circuit' : 'terminal') : 'bouche';
        const li = ajouter({ niveau, repere: rep, libelle: txt(l.local || (v && v.nom) || (t && t.local), 120), installation: txt(eq.installation, 120), source: src, calcule: r(calc, 3), mesure: mes, unite, reglageActuel: txt(l.reglage, 80) });
        sc += calc; sm += mes; k++;
        if (li.conforme === false) {
          if (hydro && v) { const p = reglageVanne(v, calc, mes, toursDe(l.reglage)); if (p) reglages.push({ niveau, repere: rep, organe: `Vanne d'équilibrage ${v.repVanne}${v.ref ? ` (${v.ref})` : ` DN ${v.dn || ''}`.trimEnd()}`, ecart: li.ecart,
            actuel: `${nf(p.toursActuels, 1)} tours (Kv ${nf(p.kvActuel, 2)})`, propose: `${nf(p.tours, 1)} tours (Kv ${nf(p.kvPropose, 2)})`, detail: [p.abaque ? 'abaque du fabricant' : 'caractéristique linéaire', p.note].filter(Boolean).join(' ; '), valeur: p.tours }); }
          else if (!hydro) { const p = reglageBouche(calc, mes); reglages.push({ niveau, repere: rep, organe: `Bouche ${rep}${l.local ? ` — ${txt(l.local, 60)}` : ''}`, ecart: li.ecart, actuel: txt(l.reglage, 80) || '—',
            propose: `${p.sens === 'ouvrir' ? 'Ouvrir' : 'Fermer'} le réglage : débit ${p.variation > 0 ? '+' : ''}${nf(p.variation, 0)} %`, detail: `ΔP au plénum × ${nf(p.dp, 2)} (Q proportionnel à √ΔP)`, valeur: p.ratio }); }
          else reglages.push({ niveau, repere: rep, organe: `Organe ${rep}`, ecart: li.ecart, actuel: txt(l.reglage, 80) || '—', propose: `Débit à corriger de ${nf(r((calc / mes - 1) * 100, 0), 0)} %`, detail: 'vanne non trouvée dans les réseaux arborescents de l\'étude', valeur: null });
        }
      });
      // Installation entière (circuit ou réseau de ventilation) : débit total ; un écart d'ensemble se corrige à la pompe ou au ventilateur
      if (k >= 2) {
        const li = ajouter({ niveau: hydro ? 'circuit' : 'installation', repere: '', libelle: `Total ${txt(eq.installation, 100)}`, installation: txt(eq.installation, 120), source: src, calcule: r(sc, 3), mesure: r(sm, 3), unite, total: true });
        const ec = (eq.lignes || []).map(l => { const rep = txt(l.repere, 40), v = C.vannes.get(rep), t = C.theoriques.get(rep), c = calculDe(C, l, unite), m = n(l.mesure); return c > 0 && m !== null ? (m - c) / c * 100 : null; }).filter(x => x !== null);
        const moy = ec.reduce((a, b) => a + b, 0) / ec.length, dispersion = Math.sqrt(ec.reduce((a, b) => a + (b - moy) ** 2, 0) / ec.length);
        // Pompe du réseau arborescent de même nom : consigne et vitesse proposées (point calculé pris comme point actuel)
        const po = hydro ? C.pompes.find(p => txt(p.installation, 120).toLowerCase() === txt(eq.installation, 120).toLowerCase()) : null;
        const g = po ? reglagePompe({ Qc: sc, Qm: sm, Hm: po.H, vitesse: po.vitesse, courbe: po.courbe }) : null;
        if (li.conforme === false && dispersion <= tol) reglages.push({ niveau: hydro ? 'pompe' : 'ventilateur', repere: '', organe: hydro ? `Pompe du circuit ${txt(eq.installation, 60)}${po && po.ref ? ` (${txt(po.ref, 60)})` : ''}` : `Ventilateur de ${txt(eq.installation, 60)}`, ecart: li.ecart,
          actuel: g && g.vitesseActuelle ? `vitesse de réglage ${nf(g.vitesseActuelle, 0)} % (étude)` : '—',
          propose: g ? [g.consigneH !== null ? `consigne Δp ≈ ${nf(g.consigneH, 2)} mCE` : '', g.vitesse ? `vitesse ≈ ${nf(g.vitesse, 0)} %` : ''].filter(Boolean).join(' · ') : `Corriger d'abord le débit total de ${nf(r((sc / sm - 1) * 100, 0), 0)} % (${hydro ? 'consigne de la pompe' : 'vitesse du ventilateur'})`,
          detail: [`écarts réguliers sur toutes les ${hydro ? 'vannes' : 'bouches'} (dispersion ${nf(r(dispersion, 1), 1)} %) : régler la ${hydro ? 'pompe' : 'machine'} avant les organes terminaux`, g && g.note].filter(Boolean).join(' ; '), valeur: g ? g.consigneH : sc / sm, global: true });
      }
    });
    // 2. PV de mise en service : mesures avec une valeur attendue de l'étude (débits, pressions)
    (mises || []).forEach(m => {
      const niveau = NIVEAU_PV[m.type] || 'equipement', src = `${m.numero ? `PV ${m.numero}` : 'PV de mise en service'}${m.date ? ` du ${String(m.date).slice(0, 10).split('-').reverse().join('/')}` : ''}`, eqt = txt(m.equipement || m.installation, 100);
      (m.mesures || []).forEach(x => {
        const a = n(x.attendu), v = n(x.valeur);
        if (a === null || v === null || !comparable(x.unite)) return;
        const rl = releveDe(x);
        if (rl && vus.has(rl.repere)) return; // déjà dans un relevé d'équilibrage
        if (rl) vus.add(rl.repere);
        ajouter({ niveau: rl ? (/vanne/i.test(rl.detail) || /^Débit d'eau/.test(x.libelle) ? 'terminal' : 'bouche') : niveau, repere: rl ? rl.repere : txt(m.repere, 40), libelle: rl ? txt(rl.piece || rl.detail, 100) : `${txt(x.libelle, 80)}${x.section ? ` (${txt(x.section, 30)})` : ''}`,
          installation: eqt, source: src, calcule: a, mesure: v, unite: x.unite || '', grandeur: x.libelle });
      });
      // Pompe : point mesuré face au point calculé
      if (m.type === 'pompes') {
        const E = essai(() => (typeof Essais !== 'undefined' ? Essais : require('../../../public/js/essais'))), p = E && essai(() => E.pointsPompe(m));
        if (p && p.Q !== null && p.Qp > 0 && Math.abs((p.Q - p.Qp) / p.Qp * 100) > tol + 1e-9) {
          const vit = val(m.mesures, /^Vitesse lue maxi/) || val(m.mesures, /^Vitesse lue mini/), cons = val(m.mesures, /^Consigne$/);
          const g = reglagePompe({ Qc: p.Qp, Qm: p.Q, Hm: p.H !== null ? p.H : p.Hp, vitesse: vit, courbe: p.courbe });
          if (g) reglages.push({ niveau: 'pompe', repere: txt(m.repere, 40), organe: `Pompe ${eqt}`, ecart: r((p.Q - p.Qp) / p.Qp * 100, 1),
            actuel: [`${nf(p.Q, 2)} m³/h`, p.H !== null ? `${nf(p.H, 2)} mCE` : '', cons !== null ? `consigne ${nf(cons, 1)}` : '', vit ? `${nf(vit, 0)} tr/min` : ''].filter(Boolean).join(' · '),
            propose: [g.consigneH !== null ? `consigne Δp constant ${nf(g.consigneH, 2)} mCE` : '', g.vitesse ? `vitesse ≈ ${nf(g.vitesse, 0)} tr/min` : '', g.vitesseCourbe ? `≈ ${nf(g.vitesseCourbe, 0)} % de la vitesse maxi (courbe du fabricant)` : ''].filter(Boolean).join(' · ') || `débit × ${nf(g.ratio, 2)}`,
            detail: [`pour ${nf(p.Qp, 2)} m³/h calculés (lois de similitude, courbe du réseau H = k · Q²)`, g.note].filter(Boolean).join(' ; '), valeur: g.consigneH });
        }
      }
      // Ventilateur (CTA, extracteur) : par côté (soufflage, extraction)
      if (['cta', 'vmc', 'desenfumage'].includes(m.type)) {
        const secs = [...new Set((m.mesures || []).map(x => x.section || ''))];
        secs.forEach(sec => {
          const d = (m.mesures || []).find(x => (x.section || '') === sec && /^Débit (mesuré|extraction|extrait)$/.test(x.libelle || '') && n(x.attendu) !== null && n(x.valeur) !== null);
          if (!d) return;
          const Qc = n(d.attendu), Qm = n(d.valeur); if (!(Qc > 0) || Math.abs((Qm - Qc) / Qc * 100) <= tol + 1e-9) return;
          const g = reglageVentilateur({ Qc, Qm, frequence: val(m.mesures, /^Fréquence ventilateur/, sec), signal: val(m.mesures, /^Signal/, sec), pression: val(m.mesures, /^Pression (de soufflage|d'extraction|extraction)/, sec) });
          if (!g) return;
          reglages.push({ niveau: 'ventilateur', repere: txt(m.repere, 40), organe: `Ventilateur ${eqt}${sec ? ` — ${sec.toLowerCase()}` : ''}`, ecart: r((Qm - Qc) / Qc * 100, 1),
            actuel: [`${nf(Qm, 0)} m³/h`, g.frequenceActuelle ? `${nf(g.frequenceActuelle, 1)} Hz` : '', g.signalActuel ? `signal ${nf(g.signalActuel, 0)} %` : '', g.pressionActuelle ? `${nf(g.pressionActuelle, 0)} Pa` : ''].filter(Boolean).join(' · '),
            propose: [g.frequence ? `${nf(g.frequence, 1)} Hz` : '', g.signal ? `signal ${nf(g.signal, 0)} %` : '', g.pression ? `consigne de pression ${nf(g.pression, 0)} Pa` : ''].filter(Boolean).join(' · ') || `vitesse × ${nf(g.ratio, 2)}`,
            detail: [`pour ${nf(Qc, 0)} m³/h calculés (Q proportionnel à N, ΔP à N²)`, g.note].filter(Boolean).join(' ; '), valeur: g.frequence || g.signal });
        });
      }
    });
    // Réglages des ventilateurs et pompes d'abord, puis organes terminaux
    const ordre = ['pompe', 'ventilateur', 'circuit', 'terminal', 'bouche', 'equipement', 'installation'];
    reglages.sort((a, b) => ordre.indexOf(a.niveau) - ordre.indexOf(b.niveau) || String(a.repere).localeCompare(String(b.repere), 'fr', { numeric: true }));
    const mes = lignes.filter(l => l.conforme !== null && !l.total);
    return { tolerance: tol, lignes, reglages, bilan: { comparees: mes.length, conformes: mes.filter(l => l.conforme).length, horsTolerance: mes.filter(l => l.conforme === false).length, reglages: reglages.length,
      parNiveau: Object.fromEntries(Object.keys(NIVEAUX).map(k => [k, mes.filter(l => l.niveau === k).length]).filter(([, v]) => v)) } };
  }

  /* ---------- Document imprimable ---------- */
  function html(et, res, opts = {}) {
    const soc = (opts.societe && opts.societe.nom) || '', b = res.bilan, sig = v => (v === null ? '—' : `${v > 0 ? '+' : ''}${nf(v, 1)} %`);
    return `<div class="doe-doc reglages-proposes"><h2>RÉGLAGES PROPOSÉS APRÈS MISE EN SERVICE</h2>
      <p><strong>${esc(et.objet || '')}</strong>${et.client ? ` — ${esc(et.client)}` : ''}${et.indice ? ` · indice ${esc(et.indice)}` : ''}${soc ? ` · ${esc(soc)}` : ''}${opts.date ? ` · ${esc(opts.date)}` : ''}</p>
      <p class="petit">Débits et pressions relevés sur le chantier comparés aux valeurs calculées de l'étude : ${b.comparees} mesure(s), ${b.conformes} dans la tolérance de ± ${nf(res.tolerance, 0)} %, ${b.horsTolerance} hors tolérance.
        Réglez d'abord les pompes et les ventilateurs, puis les vannes et les bouches en partant du circuit le plus défavorisé ; contrôlez de nouveau les débits après réglage.</p>
      <h3>Réglages proposés (${res.reglages.length})</h3>
      ${res.reglages.length ? `<table class="tn"><thead><tr><th>Niveau</th><th>Organe</th><th>Écart mesuré</th><th>Réglage actuel</th><th>Réglage proposé</th><th>Méthode, remarque</th><th style="width:10%">Réglé (date, visa)</th></tr></thead>
        <tbody>${res.reglages.map(x => `<tr><td>${esc(NIVEAUX[x.niveau] || x.niveau)}</td><td>${esc(x.organe)}</td><td>${sig(x.ecart)}</td><td>${esc(x.actuel)}</td><td><strong>${esc(x.propose)}</strong></td><td class="petit">${esc(x.detail)}</td><td></td></tr>`).join('')}</tbody></table>`
        : '<p>Aucun réglage à reprendre : toutes les mesures sont dans la tolérance.</p>'}
      <h3>Mesuré / calculé</h3>
      <table class="tn"><thead><tr><th>Niveau</th><th>Repère</th><th>Désignation</th><th>Calculé</th><th>Mesuré</th><th>Écart</th><th>Source</th></tr></thead>
        <tbody>${res.lignes.map(l => `<tr${l.conforme === false ? ' class="hors-tol"' : ''}><td>${esc(NIVEAUX[l.niveau] || l.niveau)}</td><td>${esc(l.repere)}</td><td>${esc(l.libelle)}${l.installation && !l.total ? `<br><span class="petit">${esc(l.installation)}</span>` : ''}</td>
          <td>${nf(l.calcule, l.calcule >= 100 ? 0 : 2)} ${esc(l.unite)}</td><td>${nf(l.mesure, l.mesure >= 100 ? 0 : 2)} ${esc(l.unite)}</td><td>${l.conforme === false ? '<strong>' : ''}${sig(l.ecart)}${l.conforme === false ? '</strong>' : ''}</td><td class="petit">${esc(l.source)}</td></tr>`).join('')}</tbody></table>
      <table class="tn signatures"><tbody><tr><th>Bureau d'études (nom, date, signature)</th><th>Metteur au point (nom, date, signature)</th></tr><tr><td style="height:50px"></td><td></td></tr></tbody></table>
      <style>.reglages-proposes tr.hors-tol td { background: #fdecea; } .reglages-proposes td { vertical-align: top; }</style></div>`;
  }
  return { NIVEAUX, lireAbaque, kvAuxTours, toursPourKv, toursDe, reglageVanne, reglagePompe, reglageVentilateur, reglageBouche, calcules, comparer, html };
})();
if (typeof module !== 'undefined') module.exports = MesuresRetour;
