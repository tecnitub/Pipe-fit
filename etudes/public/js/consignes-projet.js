// Consignes du projet : on saisit les consignes d'ambiance par zone (avec les horaires d'occupation) et, si besoin, les
// lois d'eau des circuits ; tout le reste de la régulation en découle :
//  - consigne de la production (plus haute demande des circuits + 5 K, priorité ECS) et seuils de la cascade ;
//  - seuils d'alarme déduits des consignes (ambiance, départ des circuits, ECS, soufflage) ;
//  - seuils du change-over d'après les régimes chaud / froid ;
//  - réduit, hors gel et heure de relance (inertie de l'émetteur) ; plannings par zone + jours fériés de l'année ;
//  - réglages PID de départ selon l'organe ; consignes de pression des CTA (relevé de mise en service) ;
//  - vitesses des ventilo-convecteurs / cassettes ; contrôle de cohérence avant la saisie dans l'automate.
// Module pur (navigateur, tests).
const ConsignesProjet = (() => {
  const num = (v, d = 0) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : d; };
  const vide = v => v === '' || v === null || v === undefined;
  const nf = (v, d = 0) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',');
  const INERTIE = { plancher: 3, radiant: 1, radiateurs: 1, aerotherme: 0.5, ventilo: 0.5, cassette: 0.5, cta: 0.5, split: 0.5 };
  const PID = { circuit: ['20 K', '240 s'], ecs: ['15 K', '120 s'], batterie: ['10 K', '180 s'], pression: ['100 Pa', '60 s'], dp: ['50 kPa', '60 s'], production: ['20 K', '240 s'] };
  const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

  // Jours fériés en France (métropole) d'une année
  function feries(annee) {
    const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1, paques = Date.UTC(annee, mois - 1, jour);
    const iso = t => new Date(t).toISOString().slice(0, 10), J = 86400000, fixe = (mm, jj) => iso(Date.UTC(annee, mm - 1, jj));
    return [[fixe(1, 1), 'Jour de l\'an'], [iso(paques + J), 'Lundi de Pâques'], [fixe(5, 1), 'Fête du travail'], [fixe(5, 8), 'Victoire 1945'], [iso(paques + 39 * J), 'Ascension'],
      [iso(paques + 50 * J), 'Lundi de Pentecôte'], [fixe(7, 14), 'Fête nationale'], [fixe(8, 15), 'Assomption'], [fixe(11, 1), 'Toussaint'], [fixe(11, 11), 'Armistice'], [fixe(12, 25), 'Noël']];
  }
  const heure = v => { const m = /^(\d{1,2})(?:[h:](\d{2}))?/.exec(String(v ?? '').trim()); return m ? Number(m[1]) + Number(m[2] || 0) / 60 : null; };
  const hTxt = h => `${Math.floor(h)} h${Math.round((h % 1) * 60) ? String(Math.round((h % 1) * 60)).padStart(2, '0') : ''}`;
  const typeEmetteur = s => { const t = String(s || '').toLowerCase(); return /\becs\b|ballon|sanitaire/.test(t) ? 'ecs' : /plancher/.test(t) ? 'plancher' : /cassette/.test(t) ? 'cassette' : /ventilo/.test(t) ? 'ventilo' : /radiant|panneau/.test(t) ? 'radiant' : /aéro|aero/.test(t) ? 'aerotherme' : /cta/.test(t) ? 'cta' : /split/.test(t) ? 'split' : /radiat/.test(t) ? 'radiateurs' : ''; };

  // zones : [{ zone, confort, clim, inocc, horsGel, jours, debut, fin, diff, decalage }] ; lois : [{ circuit, base, d18 }] ;
  // pressions : [{ cta, soufflage, reprise }] ; installations : contexte de la régulation (donnees) ; eqs : équipements
  function calculer({ installations = [], zones = [], lois = [], pressions = [], eqs = [], annee = new Date().getFullYear() } = {}) {
    const prod = installations.filter(x => x.donnees && x.donnees.circuits), ctas = installations.filter(x => x.donnees && x.donnees.cta);
    const ecs = installations.find(x => x.donnees && x.donnees.ecs), term = installations.filter(x => x.donnees && x.donnees.terminaux);
    const alertes = [], ajout = (niveau, t) => alertes.push({ niveau, texte: t });
    // 1. Saisie : zones (valeurs par défaut courantes) et circuits (loi d'eau calculée ou saisie)
    const Z = (zones || []).filter(z => z && (String(z.zone || '').trim() || !vide(z.confort))).map(z => ({ zone: String(z.zone || '').trim() || 'Toutes zones', confort: num(z.confort, 20), clim: num(z.clim, 26), inocc: num(z.inocc, 16), horsGel: num(z.horsGel, 8),
      jours: String(z.jours || 'lun-ven').trim() || 'lun-ven', debut: heure(z.debut) ?? 7, fin: heure(z.fin) ?? 19, diff: num(z.diff, 0.5), decalage: num(z.decalage, 2), emetteur: typeEmetteur(z.emetteur) }));
    const zonesEff = Z.length ? Z : [{ zone: 'Toutes zones', confort: 20, clim: 26, inocc: 16, horsGel: 8, jours: 'lun-ven', debut: 7, fin: 19, diff: 0.5, decalage: 2, emetteur: '' }];
    const Tbase = prod.length ? prod[0].donnees.Tbase : -10;
    const circuits = prod.flatMap(x => x.donnees.circuits.map(c => {
      const s = (lois || []).find(l => String(l.circuit || '').trim().toLowerCase() === String(c.rep).trim().toLowerCase());
      const base = s && !vide(s.base) ? num(s.base) : c.loi ? c.dep : null, d18 = s && !vide(s.d18) ? num(s.d18) : c.d18;
      return { rep: c.rep, emetteur: typeEmetteur(c.emetteur) || c.emetteur, dep: c.dep, ret: c.ret, loi: c.loi || !!(s && !vide(s.base)), base: base ?? c.dep, d18: d18 ?? null, source: s && (!vide(s.base) || !vide(s.d18)) ? 'saisie' : 'étude', Td: x.donnees.Td };
    }));
    const saisie = [...zonesEff.map(z => ['Zone', z.zone, `confort ${nf(z.confort, 1)} °C · rafraîchissement ${nf(z.clim, 1)} °C · inoccupation ${nf(z.inocc, 1)} °C · hors gel ${nf(z.horsGel, 1)} °C`, `${z.jours} ${hTxt(z.debut)} – ${hTxt(z.fin)}`, Z.length ? 'saisie' : 'par défaut']),
      ...circuits.map(c => ['Circuit', c.rep, c.loi ? `loi d'eau : ${nf(c.base, 0)} °C par ${nf(Tbase, 0)} °C ext., ${nf(c.d18 ?? 30, 0)} °C par 18 °C ext.` : `consigne fixe ${nf(c.base, 0)} °C`, `régime ${nf(c.dep, 0)}/${nf(c.ret, 0)} °C${c.emetteur ? `, ${c.emetteur}` : ''}`, c.source])];
    // 2. Production : plus haute demande + 5 K (plafonnée au régime), priorité ECS
    const chauffe = circuits.filter(c => c.emetteur !== 'ecs'), maxCircuit = chauffe.length ? Math.max(...chauffe.map(c => c.base)) : null, TdProd = prod.length ? prod[0].donnees.Td : null;
    const production = prod.length ? { consigneBase: Math.min(TdProd, (maxCircuit ?? TdProd - 5) + 5), Td: TdProd, ecsMin: ecs ? Math.max(70, num(ecs.donnees.Tc, 60) + 10) : null, enclenche: [5, 10], deleste: [5, 5], generateurs: prod[0].donnees.generateurs } : null;
    // 3. Seuils d'alarme déduits des consignes
    const seuils = [];
    circuits.forEach(c => seuils.push({ cible: 'circuit', circuit: c.rep, libelle: `Départ ${c.rep} trop bas / trop haut`, bas: Math.round((c.loi ? (c.d18 ?? 30) : c.base) - 10), haut: Math.round(c.dep + 5), tempo: '30 min', prio: 'P2 (défaut)' }));
    zonesEff.forEach(z => seuils.push({ cible: 'ambiance', zone: z.zone, libelle: `Ambiance hors plage — ${z.zone}`, bas: z.confort - 4, haut: z.clim + 2, tempo: '30 min (en occupation)', prio: 'P3 (maintenance)' }));
    if (ecs) seuils.push({ cible: 'ecs', libelle: 'ECS trop basse', bas: num(ecs.donnees.Tc, 60) - 5, haut: 75, tempo: '30 min', prio: 'P2 (défaut)' }, { cible: 'bouclage', libelle: 'Retour de bouclage trop bas', bas: 50, haut: '', tempo: '30 min', prio: 'P2 (défaut)' });
    ctas.forEach(x => seuils.push({ cible: 'soufflage', cta: x.titre, libelle: `Soufflage hors limites — ${x.titre}`, bas: Math.min(12, x.donnees.TsE - 4), haut: Math.max(35, x.donnees.TsH + 15), tempo: '60 s', prio: 'P2 (défaut)' }));
    // 4. Change-over : seuils d'après les régimes
    const regC = prod.find(x => x.donnees.changeOver) || prod[0], froidReg = regC && regC.donnees.froid;
    const changeOver = { chaud: regC && regC.donnees.changeOver ? Math.round((regC.donnees.Tr + 20) / 2) : 30, froid: froidReg ? Math.round(froidReg.Tr + 6) : 18, source: regC && regC.donnees.changeOver ? `régimes ${nf(regC.donnees.Td, 0)}/${nf(regC.donnees.Tr, 0)} et ${nf(froidReg.Td, 0)}/${nf(froidReg.Tr, 0)} °C` : 'valeurs courantes' };
    // 5. Réduit, hors gel, relance
    const relance = em => INERTIE[typeEmetteur(em)] ?? 1;
    const regimes = [...zonesEff.map(z => { const em = z.emetteur || (term.length ? 'ventilo' : circuits[0] ? circuits[0].emetteur : ''); return { quoi: `Zone ${z.zone}`, reduit: Math.max(0, z.confort - z.inocc), horsGel: z.horsGel, relance: relance(em), emetteur: em }; }),
      ...chauffe.map(c => ({ quoi: `Circuit ${c.rep}`, reduit: Math.max(0, zonesEff[0].confort - zonesEff[0].inocc), horsGel: zonesEff[0].horsGel, relance: relance(c.emetteur), emetteur: c.emetteur }))];
    // 6. Plannings : par zone, et circuits / CTA sur l'amplitude la plus large des zones
    const deb = Math.min(...zonesEff.map(z => z.debut)), fin = Math.max(...zonesEff.map(z => z.fin)), joursLarges = zonesEff.map(z => z.jours).sort((a, b) => b.length - a.length)[0];
    const plannings = [...zonesEff.map((z, i) => ({ nom: `PL_Z${i + 1}`, agit: `Zone ${z.zone}`, occupation: `${z.jours} ${hTxt(z.debut)} – ${hTxt(z.fin)}`, relance: relance(z.emetteur || (term.length ? 'ventilo' : '')), hors: `réduit ${nf(z.inocc, 1)} °C, hors gel ${nf(z.horsGel, 1)} °C` })),
      ...chauffe.map((c, i) => ({ nom: `PL_C${i + 1}`, agit: `Circuit ${c.rep}`, occupation: `${joursLarges} ${hTxt(Math.max(0, deb - relance(c.emetteur)))} – ${hTxt(fin)} (relance ${nf(relance(c.emetteur), 1)} h comprise)`, relance: relance(c.emetteur), hors: c.loi ? 'loi d\'eau réduite, hors gel actif' : 'circuit arrêté, hors gel actif' })),
      ...ctas.map((x, i) => ({ nom: `PL_CTA${i + 1}`, agit: x.titre, occupation: `${joursLarges} ${hTxt(Math.max(0, deb - 0.5))} – ${hTxt(fin)}`, relance: 0.5, hors: 'CTA à l\'arrêt, registres fermés' })),
      ...(ecs ? [{ nom: 'PL_ECS_CHOC', agit: 'Montée en température ECS', occupation: 'lundi 2 h – 3 h (selon le carnet sanitaire)', relance: 0, hors: '—' }] : []),
      ...(production && production.generateurs > 1 ? [{ nom: 'PL_PERMUT', agit: 'Permutation générateurs / pompes', occupation: 'lundi 10 h', relance: 0, hors: '—' }] : [])];
    // 7. Réglages PID de départ selon l'organe (temps de course repris de l'équipement s'il est connu)
    const pid = eqs.filter(q => ['v3p', 'v010', 'v010r', 'var', 'mod'].includes(q.regulation) || q.depart === 'variateur').map(q => {
      const t = `${q.designation || ''}`, k = q.regulation === 'mod' ? 'production' : q.regulation === 'var' || q.depart === 'variateur' ? (q.type === 'pompe' ? 'dp' : 'pression') : /\becs\b|ballon|échangeur/i.test(t) ? 'ecs' : /\bcta\b|batterie/i.test(t) ? 'batterie' : 'circuit';
      return [q.rep, q.designation || q.rep, { circuit: 'Vanne de circuit (température de départ)', ecs: 'Échangeur ECS', batterie: 'Batterie de CTA', pression: 'Ventilateur (pression de gaine)', dp: 'Pompe (pression différentielle)', production: 'Générateur (modulation)' }[k],
        PID[k][0], PID[k][1], !vide(q.course) ? `${q.course} s` : q.regulation === 'v3p' ? '120 s (à vérifier sur la fiche)' : '—'];
    });
    // 8. Pressions des CTA (relevé de mise en service)
    const P = (pressions || []).filter(x => x && (String(x.cta || '').trim() || !vide(x.soufflage)));
    const pressionsCta = ctas.map(x => { const r = P.find(p => String(p.cta || '').trim().toLowerCase() && x.titre.toLowerCase().includes(String(p.cta).trim().toLowerCase())) || (ctas.length === 1 ? P[0] : null); return { cta: x.titre, soufflage: r && !vide(r.soufflage) ? num(r.soufflage) : null, reprise: r && !vide(r.reprise) ? num(r.reprise) : null, source: r ? (r.source || 'saisie') : '' }; });
    // 9. Vitesses des terminaux
    const vitesses = term.length || eqs.some(q => q.type === 'ventilo' || /ventilo|cassette/i.test(q.designation || '')) ? zonesEff.map(z => ({ zone: z.zone, chaud: z.confort, froid: z.clim, decalage: z.decalage, ouverture: z.diff, pv: z.diff * 2, mv: z.diff * 4 })) : [];
    // 10. Cohérence
    chauffe.forEach(c => {
      if (c.base > c.Td) ajout('attention', `Loi d'eau du circuit ${c.rep} (${nf(c.base, 0)} °C) au-dessus du départ de la production (${nf(c.Td, 0)} °C).`);
      if (c.emetteur === 'plancher' && c.base > 50) ajout('attention', `Circuit plancher ${c.rep} : départ ${nf(c.base, 0)} °C > 50 °C (risque pour la dalle et le confort).`);
      if (c.loi && c.d18 !== null && c.d18 >= c.base) ajout('attention', `Loi d'eau du circuit ${c.rep} : départ à 18 °C ext. (${nf(c.d18, 0)} °C) ≥ départ par grand froid.`);
    });
    zonesEff.forEach(z => {
      if (z.clim <= z.confort) ajout('attention', `Zone ${z.zone} : consigne de rafraîchissement (${nf(z.clim, 1)} °C) ≤ consigne de chauffage (${nf(z.confort, 1)} °C) : prévoir une zone neutre d'au moins 2 K.`);
      else if (z.clim - z.confort < 2) ajout('info', `Zone ${z.zone} : zone neutre de ${nf(z.clim - z.confort, 1)} K seulement entre chaud et froid.`);
      if (z.inocc >= z.confort) ajout('attention', `Zone ${z.zone} : consigne d'inoccupation ≥ consigne de confort.`);
      if (z.horsGel > z.inocc) ajout('attention', `Zone ${z.zone} : hors gel au-dessus de l'inoccupation.`);
      if (!(z.fin > z.debut)) ajout('attention', `Zone ${z.zone} : horaires d'occupation incohérents.`);
    });
    if (!Z.length) ajout('info', 'Consignes d\'ambiance non saisies : valeurs courantes (20 / 26 / 16 / 8 °C, lundi-vendredi 7 h – 19 h).');
    if (ecs && num(ecs.donnees.Tc, 60) < 55) ajout('attention', `ECS : consigne de stockage ${nf(num(ecs.donnees.Tc), 0)} °C < 55 °C (risque légionelle).`);
    if (production && production.ecsMin && production.ecsMin > production.Td) ajout('attention', `Priorité ECS : ${nf(production.ecsMin, 0)} °C demandés, au-dessus du départ de la production (${nf(production.Td, 0)} °C).`);
    pressionsCta.filter(x => x.soufflage === null).forEach(x => ajout('info', `${x.cta} : consigne de pression de soufflage à relever à la mise en service (reprise automatique depuis le PV de mise en service du chantier).`));
    return { saisie, Tbase, zones: zonesEff, circuits, production, seuils, changeOver, regimes, plannings, feries: feries(annee), pid, pressionsCta, vitesses, alertes };
  }

  // Réglages de points déduits (seuils bas / haut) pour la table d'échange : sondes de départ des circuits, ECS, bouclage
  function reglagesPoints(r, eqs = []) {
    const out = [], sondes = eqs.filter(q => q.type === 'sonde' || q.regulation === 'sonde');
    r.seuils.forEach(s => {
      if (s.cible === 'circuit') { const q = sondes.find(x => String(x.designation || '').includes(s.circuit)); if (q) out.push({ rep: q.rep, libelle: '', bas: s.bas, haut: s.haut, priorite: s.prio }); }
      if (s.cible === 'ecs') { const q = sondes.find(x => /\becs\b|ballon/i.test(x.designation || '') && !/bouclage/i.test(x.designation || '')); if (q) out.push({ rep: q.rep, libelle: '', bas: s.bas, haut: s.haut, priorite: s.prio }); }
      if (s.cible === 'bouclage') { const q = sondes.find(x => /bouclage/i.test(x.designation || '')); if (q) out.push({ rep: q.rep, libelle: '', bas: s.bas, haut: '', priorite: s.prio }); }
    });
    return out;
  }

  return { calculer, reglagesPoints, feries, typeEmetteur, INERTIE, PID };
})();
if (typeof module !== 'undefined') module.exports = ConsignesProjet;
