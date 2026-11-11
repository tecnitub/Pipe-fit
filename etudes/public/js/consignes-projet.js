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
  function calculer({ installations = [], zones = [], lois = [], pressions = [], eqs = [], annee = new Date().getFullYear(), profil: profilId = '', cctp = null, origineZones = '' } = {}) {
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
    const saisie = [...(profilId && PROFILS[profilId] ? [['Bâtiment', PROFILS[profilId].nom, 'consignes et horaires types, contrôle du code de l\'énergie', '', origineZones && /profil/.test(origineZones) ? origineZones : 'choisi']] : []),
      ...zonesEff.map(z => ['Zone', z.zone, `confort ${nf(z.confort, 1)} °C · rafraîchissement ${nf(z.clim, 1)} °C · inoccupation ${nf(z.inocc, 1)} °C · hors gel ${nf(z.horsGel, 1)} °C`, `${z.jours} ${hTxt(z.debut)} – ${hTxt(z.fin)}`, origineZones || (Z.length ? 'saisie' : 'par défaut')]),
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
    const res = { saisie, Tbase, zones: zonesEff, circuits, production, seuils, changeOver, regimes, plannings, feries: feries(annee), pid, pressionsCta, vitesses, alertes, profil: profilId };
    alertes.push(...controleReglementaire(zonesEff, profilId), ...comparerCctp(cctp, res));
    return res;
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

  /* ---------- 1. Profils de bâtiment (consignes et horaires types) et contrôle réglementaire ---------- */
  // Code de l'énergie : chauffage limité à 19 °C en moyenne (R.241-26) hors établissements de soins, crèches et
  // logements de personnes âgées ; pas de climatisation en dessous de 26 °C (R.241-30)
  const PROFILS = {
    bureaux: { nom: 'Bureaux', zones: [{ zone: 'Toutes zones', confort: 19, clim: 26, inocc: 16, horsGel: 8, jours: 'lun-ven', debut: '7:00', fin: '19:00', diff: 0.5, decalage: 2 }] },
    enseignement: { nom: 'Enseignement (collège, lycée, école)', zones: [{ zone: 'Salles de cours', confort: 19, clim: 26, inocc: 16, horsGel: 8, jours: 'lun-ven', debut: '7:30', fin: '18:00', diff: 0.5, decalage: 1 },
      { zone: 'Restauration', confort: 19, clim: 26, inocc: 15, horsGel: 8, jours: 'lun-ven', debut: '10:30', fin: '14:30', diff: 0.5, decalage: 1 }, { zone: 'Gymnase', confort: 16, clim: 28, inocc: 12, horsGel: 7, jours: 'lun-sam', debut: '8:00', fin: '22:00', diff: 1, decalage: 1 }] },
    ehpad: { nom: 'EHPAD, établissement de soins', exempte: true, zones: [{ zone: 'Chambres', confort: 22, clim: 26, inocc: 20, horsGel: 8, jours: 'lun-dim', debut: '0:00', fin: '24:00', diff: 0.5, decalage: 2 },
      { zone: 'Parties communes', confort: 21, clim: 26, inocc: 19, horsGel: 8, jours: 'lun-dim', debut: '7:00', fin: '21:00', diff: 0.5, decalage: 1 }] },
    creche: { nom: 'Crèche, petite enfance', exempte: true, zones: [{ zone: 'Toutes zones', confort: 21, clim: 26, inocc: 17, horsGel: 8, jours: 'lun-ven', debut: '7:00', fin: '19:00', diff: 0.5, decalage: 1 }] },
    gymnase: { nom: 'Salle de sport, gymnase', zones: [{ zone: 'Salle', confort: 16, clim: 28, inocc: 12, horsGel: 7, jours: 'lun-dim', debut: '8:00', fin: '22:00', diff: 1, decalage: 1 },
      { zone: 'Vestiaires', confort: 19, clim: 26, inocc: 15, horsGel: 8, jours: 'lun-dim', debut: '8:00', fin: '22:30', diff: 0.5, decalage: 1 }] },
    logement: { nom: 'Logements collectifs', zones: [{ zone: 'Logements', confort: 19, clim: 26, inocc: 17, horsGel: 8, jours: 'lun-dim', debut: '6:00', fin: '22:00', diff: 0.5, decalage: 2 }] },
  };
  const profil = id => PROFILS[id] || null;
  // Type de bâtiment deviné d'après l'objet de l'étude (« Collège des Tilleuls » → enseignement)
  const PROFIL_MOTS = [[/coll[eè]ge|lyc[ée]e|[ée]cole|groupe scolaire|enseignement|universit|campus/i, 'enseignement'], [/ehpad|h[oô]pital|clinique|sant[ée]|maison de retraite|soins|foyer/i, 'ehpad'],
    [/cr[eè]che|petite enfance|multi-?accueil/i, 'creche'], [/gymnase|salle de sport|complexe sportif|dojo|salle polyvalente/i, 'gymnase'], [/logements?|r[ée]sidence|immeuble/i, 'logement'], [/bureaux?|si[eè]ge|administratif|mairie|agence|tertiaire/i, 'bureaux']];
  const detecterProfil = texte => (PROFIL_MOTS.find(([re]) => re.test(String(texte || ''))) || [])[1] || '';
  // Zones de l'étude : terminaux (étage / zone, type d'appareil), pièces des réseaux aérauliques
  function zonesEtude(et) {
    const m = new Map(), aj = (z, em) => { const k = String(z || '').trim(); if (!k) return; const x = m.get(k) || { zone: k, types: {} }; if (em) x.types[em] = (x.types[em] || 0) + 1; m.set(k, x); };
    ((et && et.notes) || []).forEach(n => {
      const e = n.entrees || {};
      if (n.type === 'terminaux') (e.appareils || []).forEach(a => aj(a.zone, typeEmetteur(a.type) || 'ventilo'));
      (e.salles || e.pieces || []).forEach(sl => aj(sl.zone));
    });
    return [...m.values()].map(x => ({ zone: x.zone, emetteur: (Object.entries(x.types).sort((a, b) => b[1] - a[1])[0] || [''])[0] }));
  }
  // Zones préremplies : zones de l'étude, consignes et horaires du profil (zone du profil de même nom, sinon la première)
  function zonesDepuis(zones, profilId) {
    const p = PROFILS[profilId] || PROFILS.bureaux, cl = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (!(zones || []).length) return JSON.parse(JSON.stringify(p.zones));
    return zones.map(z => { const m = p.zones.find(x => cl(x.zone).split(' ').some(w => w.length > 3 && cl(z.zone).includes(w.replace(/s$/, '')))) || p.zones[0]; return { ...JSON.parse(JSON.stringify(m)), zone: z.zone, ...(z.emetteur ? { emetteur: z.emetteur } : {}) }; });
  }
  const ZONES_DEFAUT = [{ zone: 'Toutes zones', confort: 20, clim: 26, inocc: 16, horsGel: 8, jours: 'lun-ven', debut: '7:00', fin: '19:00', diff: 0.5, decalage: 2 }];
  const estDefaut = l => !(l || []).length || JSON.stringify((l || []).map(z => [z.zone, +z.confort, +z.clim, +z.inocc, +z.horsGel, z.jours, z.debut, z.fin])) === JSON.stringify(ZONES_DEFAUT.map(z => [z.zone, z.confort, z.clim, z.inocc, z.horsGel, z.jours, z.debut, z.fin]));
  const JOURS_OPTIONS = ['lun-ven', 'lun-sam', 'lun-dim', 'lun-jeu', 'mar-sam', 'sam-dim'];
  const HEURES_OPTIONS = Array.from({ length: 49 }, (_, i) => `${Math.floor(i / 2)}:${i % 2 ? '30' : '00'}`);
  function controleReglementaire(zones, profilId) {
    const out = [], ex = (PROFILS[profilId] || {}).exempte;
    zones.forEach(z => {
      if (!ex && z.confort > 19) out.push({ niveau: 'info', texte: `Zone ${z.zone} : chauffage à ${nf(z.confort, 1)} °C, au-dessus des 19 °C en moyenne du code de l'énergie (art. R.241-26), sauf soins, petite enfance ou personnes âgées.` });
      if (z.clim < 26) out.push({ niveau: 'attention', texte: `Zone ${z.zone} : climatisation à ${nf(z.clim, 1)} °C ; le code de l'énergie (art. R.241-30) interdit de refroidir en dessous de 26 °C (hors locaux à exigences particulières).` });
    });
    return out;
  }

  /* ---------- 2. Exigences du CCTP comparées aux consignes ---------- */
  // cctp : { chauffage: [°C], clim: [°C], regimes: [[dep, ret]], horaires: [[debut, fin]] } (lecture du CCTP)
  function comparerCctp(cctp, r) {
    if (!cctp) return [];
    const out = [], z = r.zones;
    if ((cctp.chauffage || []).length) { const c = cctp.chauffage[0]; z.filter(x => Math.abs(x.confort - c) >= 0.5).forEach(x => out.push({ niveau: 'attention', texte: `CCTP : ${nf(c, 1)} °C en chauffage ; saisi ${nf(x.confort, 1)} °C (zone ${x.zone}).` })); }
    if ((cctp.clim || []).length) { const c = cctp.clim[0]; z.filter(x => Math.abs(x.clim - c) >= 0.5).forEach(x => out.push({ niveau: 'attention', texte: `CCTP : ${nf(c, 1)} °C en rafraîchissement ; saisi ${nf(x.clim, 1)} °C (zone ${x.zone}).` })); }
    (cctp.regimes || []).forEach(([d, t]) => { if (r.circuits.length && !r.circuits.some(c => Math.abs(c.dep - d) < 1 && Math.abs(c.ret - t) < 1) && !(r.production && Math.abs(r.production.Td - d) < 1)) out.push({ niveau: 'attention', texte: `CCTP : régime ${d}/${t} °C cité, absent de l'étude (production et circuits).` }); });
    (cctp.horaires || []).forEach(([d, f]) => { if (!z.some(x => Math.abs(x.debut - d) < 0.26 && Math.abs(x.fin - f) < 0.26)) out.push({ niveau: 'info', texte: `CCTP : horaires ${hTxt(d)} – ${hTxt(f)} cités ; à reporter sur la zone concernée.` }); });
    return out;
  }
  // Lecture des consignes dans un texte de CCTP
  function consignesCctp(texte) {
    const t = String(texte || '').replace(/\s+/g, ' '), n = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), out = { chauffage: [], clim: [], regimes: [], horaires: [] };
    for (const m of n.matchAll(/(\d{2}(?:[.,]\d)?)\s*°\s*c/g)) {
      const v = num(m[1]), ctx = n.slice(Math.max(0, m.index - 90), m.index + 30);
      if (v < 15 || v > 28) continue;
      if (/ete|climatisation|rafraichissement|refroidissement|\bfroid\b/.test(ctx) && v >= 22) out.clim.push(v);
      else if (/hiver|chauffage|confort|ambiance|interieure|temperature (de|des) locaux/.test(ctx) && v <= 23) out.chauffage.push(v);
    }
    for (const m of n.matchAll(/regime\s*(?:d'eau\s*)?(?:de\s*)?(\d{1,2})\s*\/\s*(\d{1,2})\s*°?\s*c?/g)) out.regimes.push([num(m[1]), num(m[2])]);
    for (const m of n.matchAll(/(?:de|entre)?\s*(\d{1,2})\s*h\s*(\d{2})?\s*(?:a|-|–|et)\s*(\d{1,2})\s*h\s*(\d{2})?/g)) { const d = num(m[1]) + num(m[2]) / 60, f = num(m[3]) + num(m[4]) / 60; if (f > d && d >= 5 && f <= 24) out.horaires.push([d, f]); }
    const uniq = l => [...new Set(l.map(x => JSON.stringify(x)))].map(x => JSON.parse(x));
    return { chauffage: uniq(out.chauffage), clim: uniq(out.clim), regimes: uniq(out.regimes), horaires: uniq(out.horaires).slice(0, 4) };
  }

  /* ---------- 7. PV de réglage : valeurs attendues du cahier (valeur réglée saisie à la mise en service) ---------- */
  function attendusReglage(r) {
    const a = (libelle, valeur, unite) => (Number.isFinite(valeur) ? { libelle, valeur: Math.round(valeur * 10) / 10, unite } : null);
    return [
      ...(r.production ? [a('Consigne de départ de la production (grand froid)', r.production.consigneBase, '°C'), r.production.ecsMin ? a('Départ minimal pendant la charge ECS', r.production.ecsMin, '°C') : null] : []),
      ...r.circuits.flatMap(c => (c.loi ? [a(`Loi d'eau ${c.rep} : départ par ${nf(r.Tbase, 0)} °C ext.`, c.base, '°C'), c.d18 !== null ? a(`Loi d'eau ${c.rep} : départ à 18 °C ext.`, c.d18, '°C') : null] : [a(`Consigne de départ ${c.rep}`, c.base, '°C')])),
      ...r.zones.flatMap(z => [a(`Consigne confort chauffage — ${z.zone}`, z.confort, '°C'), a(`Consigne confort rafraîchissement — ${z.zone}`, z.clim, '°C'), a(`Consigne inoccupation — ${z.zone}`, z.inocc, '°C'), a(`Hors gel — ${z.zone}`, z.horsGel, '°C')]),
      a('Change-over : seuil chaud (eau)', r.changeOver.chaud, '°C'), a('Change-over : seuil froid (eau)', r.changeOver.froid, '°C'),
      ...r.pressionsCta.flatMap(p => [p.soufflage !== null ? a(`Pression de soufflage — ${p.cta}`, p.soufflage, 'Pa') : null, p.reprise !== null ? a(`Pression de reprise — ${p.cta}`, p.reprise, 'Pa') : null]),
      ...r.seuils.flatMap(s => [s.bas !== '' ? a(`Seuil bas — ${s.libelle}`, s.bas, '°C') : null, s.haut !== '' ? a(`Seuil haut — ${s.libelle}`, s.haut, '°C') : null]),
    ].filter(Boolean);
  }
  const controlesReglage = r => [...r.plannings.map(p => `Planning ${p.nom} (${p.agit}) : ${p.occupation} saisi`), 'Calendrier des jours fériés de l\'année chargé', ...r.pid.map(x => `Boucle R-${x[0]} : PI de départ ${x[3]} / ${x[4]} saisi`)];

  /* ---------- 8. Essais des séquences (d'après la logique pas à pas et les alarmes du cahier) ---------- */
  function essaisSequences(cahier) {
    const out = [];
    (cahier || []).forEach(c => {
      const sec = re => (c.sections.find(s => re.test(s.titre)) || { lignes: [] }).lignes;
      const lg = sec(/^Logique/), vus = new Set();
      lg.forEach(l => { if (!vus.has(l[0])) { vus.add(l[0]); } });
      [...vus].forEach(f => {
        if (/^Cascade/.test(f)) out.push(`${f} : couper le générateur pilote → le suivant prend le relais et l'alarme remonte`, `${f} : abaisser la consigne de 10 K → délestage du dernier générateur après 5 min`);
        else if (/^Pompes doubles/.test(f)) out.push(`${f} : déclencher la pompe en service → bascule sur l'autre et alarme`, `${f} : forcer la permutation → recouvrement de 5 s, une seule pompe en marche ensuite`);
        else if (/^Pompes de circuit/.test(f)) out.push(`${f} : simuler une température extérieure < 3 °C hors occupation → marche hors gel des pompes`);
        else if (/^Circuit/.test(f)) out.push(`${f} : simuler deux températures extérieures → la consigne de départ suit la loi d'eau`, `${f} : passer en inoccupation → départ abaissé (réduit)`);
        else if (/^ECS/.test(f)) out.push(`${f} : abaisser la température du ballon → charge, priorité ECS sur le chauffage, arrêt à la consigne`, `${f} : lancer la montée en température anti-légionelle → consigne tenue 1 h`);
        else if (/^CTA/.test(f)) out.push(`${f} : démarrage → registres ouverts avant les ventilateurs, reprise puis soufflage, pressostats sous 30 s`, `${f} : simuler l'antigel → ventilateurs arrêtés, registres fermés, vanne chaude 100 %`, `${f} : contact SSI → arrêt immédiat, prioritaire sur le mode Manu`);
        else if (/^Terminaux/.test(f)) out.push(`${f} : écart de 0,5 / 1 / 2 K à la consigne → vanne ouverte, PV, puis MV, puis GV`, `${f} : ouvrir la fenêtre → arrêt des terminaux`, `${f} : alarme condensats → seule la vanne du terminal concerné se ferme`);
        else out.push(`${f} : vérifier chaque étape de la logique`);
      });
      sec(/^Alarmes$/).filter(l => l[5] && l[5] !== '—').slice(0, 30).forEach(l => out.push(`Alarme ${l[0]} (${l[1]}) : provoquer → ${l[5]}, report GTB ${l[4] || ''}`.trim()));
      out.push('Coupure secteur puis retour → redémarrages échelonnés, consignes et plannings conservés');
    });
    return [...new Set(out)].slice(0, 120);
  }

  /* ---------- 6. Chiffrage de la régulation (devis du CRM) ---------- */
  // pts : liste des points ; nomenclature : [[famille, désignation, caractéristiques, qté…]] ; nbInst : installations
  function chiffrage({ pts = [], nomenclature = [], boucles = 0, installations = 1 } = {}) {
    const n = pts.filter(p => p[2] !== 'LOG').length, h = v => Math.round(v * 4) / 4;
    const materiel = nomenclature.filter(l => /automat|capteur|sonde|régul|regul/i.test(l[0] || '')).map(l => ({ designation: [l[1], l[2]].filter(Boolean).join(' — '), qte: num(l[3], 1) || 1 }));
    return { materiel, heures: [
      ['Programmation de l\'automate (points, boucles, plannings, alarmes)', h(n * 0.25 + boucles * 1.5 + installations * 4)],
      ['Essais point à point (automate et GTB)', h(n * 0.1 + 1)],
      ['Mise en service, réglages et essais des séquences', h(installations * 4 + 4)]] };
  }

  /* ---------- 10. Suivi après réception : relevés de la GTB comparés aux consignes ---------- */
  // rows : tableau (1re ligne = en-têtes) ; colonnes reconnues : date, température extérieure, départ <circuit>, ambiance <zone>
  function analyserReleves(rows, r) {
    const h = (rows[0] || []).map(x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()), lignes = rows.slice(1);
    const iExt = h.findIndex(x => /ext/.test(x) && /temp|t\b|°/.test(x) || /^text|exterieur/.test(x)), iDate = h.findIndex(x => /date|heure|horodat/.test(x));
    if (iExt < 0) return { erreur: 'Colonne de température extérieure introuvable (en-tête contenant « ext »).' };
    const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const out = { circuits: [], zones: [], mesures: lignes.length };
    r.circuits.filter(c => c.loi).forEach(c => {
      const k = h.findIndex(x => x.includes(norm(c.rep)) || (x.includes('depart') && norm(c.rep).split(' ').some(m => m.length > 3 && x.includes(m))));
      if (k < 0) return;
      const pts = lignes.map(l => [num(l[iExt], NaN), num(l[k], NaN)]).filter(([e, d]) => Number.isFinite(e) && Number.isFinite(d) && e < 18);
      if (pts.length < 5) return;
      const loi = e => c.base + (Math.min(18, Math.max(r.Tbase, e)) - r.Tbase) * ((c.d18 ?? 30) - c.base) / (18 - r.Tbase);
      const ecarts = pts.map(([e, d]) => d - loi(e)), moy = ecarts.reduce((s, x) => s + x, 0) / ecarts.length;
      out.circuits.push({ circuit: c.rep, mesures: pts.length, ecartMoyen: Math.round(moy * 10) / 10, proposition: Math.abs(moy) < 2 ? 'loi d\'eau tenue : rien à corriger' : moy < 0 ? `départ ${nf(-moy, 1)} K sous la loi d'eau : vérifier la production (consigne, priorité ECS) et la vanne (course, encrassement) avant de toucher la courbe` : `départ ${nf(moy, 1)} K au-dessus de la loi d'eau : vérifier la vanne (fuite, servomoteur) et la sonde de départ` });
    });
    r.zones.forEach((z, iz) => {
      let k = h.findIndex(x => /amb|salle|piece|zone/.test(x) && norm(z.zone) !== 'toutes zones' && x.includes(norm(z.zone).split(' ')[0]));
      if (k < 0 && (iz === 0 || norm(z.zone) === 'toutes zones')) k = h.findIndex(x => /amb/.test(x) && !r.zones.some(y => norm(y.zone) !== 'toutes zones' && x.includes(norm(y.zone).split(' ')[0])));
      if (k < 0) return;
      const jours = new Map();
      lignes.forEach(l => { const v = num(l[k], NaN); if (!Number.isFinite(v)) return; const d = iDate >= 0 ? String(l[iDate]).slice(0, 10) : 'sans date'; const j = jours.get(d) || { n: 0, hors: 0, froid: 0, chaud: 0 }; j.n++; if (v < z.confort - 1) { j.hors++; j.froid++; } else if (v > z.clim + 1) { j.hors++; j.chaud++; } jours.set(d, j); });
      if (!jours.size) return;
      const horsJ = [...jours.values()].filter(j => j.hors / j.n > 0.25), froid = horsJ.filter(j => j.froid >= j.chaud).length;
      out.zones.push({ zone: z.zone, jours: jours.size, joursHors: horsJ.length, proposition: !horsJ.length ? 'ambiance tenue' : froid >= horsJ.length / 2 ? `trop froid ${froid} jour(s) : relever la courbe de chauffe (déplacement parallèle +1 K) ou avancer la relance` : 'trop chaud : abaisser la courbe (déplacement parallèle −1 K) ou vérifier les apports internes' });
    });
    return out;
  }

  // Valeurs réglées sur site → saisie de l'étude (lois d'eau, consignes des zones, pressions des CTA) ; les autres
  // (production, seuils, change-over : valeurs déduites) sont listées à part
  function appliquerReglees(entrees, diffs, r) {
    const e = JSON.parse(JSON.stringify({ consignesZones: entrees.consignesZones || [], loisEau: entrees.loisEau || [], pressionsCta: entrees.pressionsCta || [] })), appliques = [], ignores = [];
    const zone = nom => { let z = e.consignesZones.find(x => String(x.zone || '').trim() === nom); if (!z) { const d = r.zones.find(x => x.zone === nom) || r.zones[0]; z = { zone: nom, confort: d.confort, clim: d.clim, inocc: d.inocc, horsGel: d.horsGel, jours: d.jours, debut: hTxt(d.debut).replace(' h', ':').replace(/:$/, ':00'), fin: hTxt(d.fin).replace(' h', ':').replace(/:$/, ':00'), diff: d.diff, decalage: d.decalage }; e.consignesZones.push(z); } return z; };
    const loi = c => { let l = e.loisEau.find(x => String(x.circuit || '').trim().toLowerCase() === c.toLowerCase()); if (!l) { l = { circuit: c, base: '', d18: '' }; e.loisEau.push(l); } return l; };
    const cta = c => { let l = e.pressionsCta.find(x => String(x.cta || '').trim().toLowerCase() === c.toLowerCase()); if (!l) { l = { cta: c, soufflage: '', reprise: '', source: '' }; e.pressionsCta.push(l); } return l; };
    (diffs || []).forEach(d => {
      let m;
      if ((m = /^Loi d'eau (.+) : départ à 18 °C ext\.$/.exec(d.libelle))) { loi(m[1]).d18 = d.regle; appliques.push(d); }
      else if ((m = /^Loi d'eau (.+) : départ par .* ext\.$/.exec(d.libelle)) || (m = /^Consigne de départ (?!de la production)(.+)$/.exec(d.libelle))) { loi(m[1]).base = d.regle; appliques.push(d); }
      else if ((m = /^Consigne (confort chauffage|confort rafraîchissement|inoccupation) — (.+)$/.exec(d.libelle))) { zone(m[2])[{ 'confort chauffage': 'confort', 'confort rafraîchissement': 'clim', inoccupation: 'inocc' }[m[1]]] = d.regle; appliques.push(d); }
      else if ((m = /^Hors gel — (.+)$/.exec(d.libelle))) { zone(m[1]).horsGel = d.regle; appliques.push(d); }
      else if ((m = /^Pression de (soufflage|reprise) — (.+)$/.exec(d.libelle))) { const x = cta(m[2]); x[m[1] === 'soufflage' ? 'soufflage' : 'reprise'] = d.regle; x.source = d.source; appliques.push(d); }
      else ignores.push(d);
    });
    return { entrees: e, appliques, ignores };
  }
  const indiceSuivant = i => (/^[A-Y]$/i.test(String(i || '').trim()) ? String.fromCharCode(String(i).trim().toUpperCase().charCodeAt(0) + 1) : /^\d+$/.test(String(i || '').trim()) ? String(Number(i) + 1) : 'B');
  return { detecterProfil, zonesEtude, zonesDepuis, ZONES_DEFAUT, estDefaut, JOURS_OPTIONS, HEURES_OPTIONS, appliquerReglees, indiceSuivant, calculer, reglagesPoints, feries, typeEmetteur, INERTIE, PID, PROFILS, profil, controleReglementaire, comparerCctp, consignesCctp, attendusReglage, controlesReglage, essaisSequences, chiffrage, analyserReleves };
})();
if (typeof module !== 'undefined') module.exports = ConsignesProjet;
