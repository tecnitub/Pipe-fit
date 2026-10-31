// Dimensionnement des câbles des liaisons à la charge du lot CVC : du TGBT à une armoire CVC, d'une armoire à une pompe
// éloignée… Pour chaque liaison : courant d'emploi, protection, courant admissible corrigé (mode de pose, température,
// groupement), chute de tension cumulée depuis l'origine de l'installation, longueur maximale protégée contre les contacts
// indirects (schéma TN) ; section et câble retenus. Méthode simplifiée d'après la NF C 15-100 (CEI 60364-5-52), note à
// soumettre au bureau d'études électricité pour validation.
const Cables = ((N) => {
  const nf = N.nf, num = N.num, alerte = (niveau, texte) => ({ niveau, texte });
  const SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240];
  const CALIBRES = [2, 4, 6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400, 500, 630];
  // Courant admissible (A), cuivre, 3 conducteurs chargés, par section (CEI 60364-5-52 tableaux B.52.4, B.52.5, B.52.10, B.52.12)
  const IZ = {
    PVC: {
      B1: [15.5, 21, 28, 36, 50, 68, 89, 110, 134, 171, 207, 239, 262, 296, 346],
      B2: [15, 20, 27, 34, 46, 62, 80, 99, 118, 149, 179, 206, 225, 255, 297],
      C: [17.5, 24, 32, 41, 57, 76, 96, 119, 144, 184, 223, 259, 299, 341, 403],
      D: [18, 24, 31, 39, 52, 67, 86, 103, 122, 151, 179, 203, 230, 258, 297],
      E: [18.5, 25, 34, 43, 60, 80, 101, 126, 153, 196, 238, 276, 319, 364, 430],
    },
    PR: {
      B1: [20, 28, 37, 48, 66, 88, 117, 144, 175, 222, 269, 312, 342, 384, 450],
      B2: [19.5, 26, 35, 44, 60, 80, 105, 128, 154, 194, 233, 268, 300, 340, 398],
      C: [22, 30, 40, 51, 70, 94, 119, 148, 180, 232, 282, 328, 379, 434, 514],
      D: [21, 28, 36, 46, 61, 79, 101, 122, 144, 178, 211, 240, 271, 304, 351],
      E: [23, 32, 42, 54, 75, 100, 127, 158, 192, 246, 298, 346, 399, 456, 538],
    },
  };
  const POSES = {
    B1: 'B — conducteurs isolés sous conduit ou goulotte', B2: 'B — câble multiconducteur sous conduit ou goulotte',
    C: 'C — câble fixé sur paroi ou chemin de câbles non perforé', E: 'E — câble sur chemin de câbles perforé ou en tablettes (à l\'air libre)',
    D: 'D — câble enterré sous fourreau',
  };
  // Facteurs de groupement selon le nombre de circuits jointifs (B : en faisceau ; C : une couche sur paroi ; E : chemin perforé ; D : enterrés)
  const GROUPE = { B: [1, 0.8, 0.7, 0.65, 0.6, 0.57, 0.54, 0.52, 0.5], C: [1, 0.85, 0.79, 0.75, 0.73, 0.72, 0.72, 0.71, 0.7], E: [1, 0.88, 0.82, 0.77, 0.75, 0.73, 0.73, 0.72, 0.72], D: [1, 0.76, 0.64, 0.57, 0.52, 0.49, 0.46, 0.44, 0.42] };
  // Facteurs de température (air, référence 30 °C ; sol, référence 20 °C)
  const TEMP_AIR = { PVC: { 10: 1.22, 15: 1.17, 20: 1.12, 25: 1.06, 30: 1, 35: 0.94, 40: 0.87, 45: 0.79, 50: 0.71, 55: 0.61, 60: 0.5 }, PR: { 10: 1.15, 15: 1.12, 20: 1.08, 25: 1.04, 30: 1, 35: 0.96, 40: 0.91, 45: 0.87, 50: 0.82, 55: 0.76, 60: 0.71 } };
  const TEMP_SOL = { PVC: { 10: 1.1, 15: 1.05, 20: 1, 25: 0.95, 30: 0.89, 35: 0.84, 40: 0.77 }, PR: { 10: 1.07, 15: 1.04, 20: 1, 25: 0.96, 30: 0.93, 35: 0.89, 40: 0.85 } };
  const interp = (t, x) => { const k = Object.keys(t).map(Number).sort((a, b) => a - b); if (x <= k[0]) return t[k[0]]; if (x >= k[k.length - 1]) return t[k[k.length - 1]]; const i = k.findIndex(v => v >= x); const [a, b] = [k[i - 1], k[i]]; return t[a] + (t[b] - t[a]) * (x - a) / (b - a); };
  const RHO = { Cu: 0.0225, Al: 0.036 }; // Ω·mm²/m, en service (chute de tension)
  const RHO_DEFAUT = { Cu: 0.027, Al: 0.043 }; // Ω·mm²/m, méthode conventionnelle (courants de défaut)
  const LAMBDA = 0.00008; // Ω/m, réactance linéique
  const IM = { B: 5, C: 10, D: 20 }; // seuil magnétique / In (valeur haute de la plage)

  // Une liaison : { rep, de, vers, tension ('mono'|'tri'|'triN'), P (kW) ou Ib (A), cos, L, pose, isolant, mat, temp, groupes, In (imposée), courbe, duMax, amont (rep) }
  function liaison(x, duAmont = 0, schema = 'TT') {
    const tri = x.tension !== 'mono', U0 = 230, U = tri ? 400 : 230, cos = Math.min(1, Math.max(0.5, num(x.cos, 0.85))), sin = Math.sqrt(1 - cos * cos);
    const Ib = num(x.Ib) > 0 ? num(x.Ib) : num(x.P) > 0 ? num(x.P) * 1000 / (tri ? Math.sqrt(3) * 400 * cos : 230 * cos) : 0;
    const In = num(x.In) > 0 ? num(x.In) : (CALIBRES.find(c => c >= Ib) || CALIBRES[CALIBRES.length - 1]);
    const isolant = x.isolant === 'PVC' ? 'PVC' : 'PR', mat = x.mat === 'Al' ? 'Al' : 'Cu', pose = POSES[x.pose] ? x.pose : 'E', L = num(x.L);
    const famille = pose === 'D' ? 'D' : pose === 'E' ? 'E' : pose === 'C' ? 'C' : 'B';
    const kT = interp(pose === 'D' ? TEMP_SOL[isolant] : TEMP_AIR[isolant], num(x.temp, pose === 'D' ? 20 : 30));
    const g = Math.max(1, Math.round(num(x.groupes, 1))), kG = GROUPE[famille][Math.min(g, 9) - 1];
    // Mono : 2 conducteurs chargés (≈ +13 % sur 3 chargés) ; aluminium ≈ 0,78 du cuivre
    const kC = (tri ? 1 : 1.13) * (mat === 'Al' ? 0.78 : 1), f = kT * kG * kC;
    const Iz = i => IZ[isolant][pose][i] * f;
    const b = tri ? 1 : 2, duMax = num(x.duMax, 5);
    const du = S => (Ib && L ? b * (RHO[mat] * L / S * cos + LAMBDA * L * sin) * Ib / U0 * 100 : 0);
    // Longueur maxi protégée (schéma TN, conducteur de protection de même section que la phase) : Lmax = 0,8 U0 S / (ρ (1 + m) Ia)
    const Ia = In * (IM[x.courbe] || IM.C), Lmax = S => 0.8 * U0 * S / (RHO_DEFAUT[mat] * 2 * Ia);
    let i = SECTIONS.findIndex((S, k) => (mat === 'Al' ? S >= 16 : true) && Iz(k) >= In);
    const raisons = [];
    if (i < 0) { i = SECTIONS.length - 1; raisons.push('courant admissible insuffisant même en 240 mm²'); }
    const iIz = i;
    while (i < SECTIONS.length - 1 && duAmont + du(SECTIONS[i]) > duMax) i++;
    if (i > iIz) raisons.push('chute de tension');
    if (schema === 'TN') { while (i < SECTIONS.length - 1 && L > Lmax(SECTIONS[i])) i++; }
    const S = SECTIONS[i], duL = du(S);
    const cond = tri ? (x.tension === 'triN' ? '5G' : '4G') : '3G';
    return { Ib, In, tri, U, kT, kG, f, Iz: Iz(i), IzMin: In / f, S, Siz: SECTIONS[iIz], du: duL, duTotal: duAmont + duL, duMax, Lmax: Lmax(S), Ia, raisons,
      cable: `${mat === 'Al' ? 'AR2V' : isolant === 'PVC' ? 'H07RN-F / U1000 RO2V' : 'U1000 R2V'} ${cond}${String(S).replace('.', ',')}`, ok: Iz(i) >= In && duAmont + duL <= duMax + 1e-9 && Ib <= In };
  }

  function calculer(e) {
    const alertes = [], lignes = (e.liaisons || []).map((x, i) => ({ ...x, rep: String(x.rep || `L${i + 1}`).trim() }));
    const parRep = new Map(lignes.map(x => [x.rep, x])), res = new Map(), schema = e.schema === 'TN' ? 'TN' : 'TT';
    // Chute de tension cumulée : une liaison dont l'amont est une autre liaison part de la chute en bout de celle-ci
    const calc = (x, pile = new Set()) => {
      if (res.has(x.rep)) return res.get(x.rep);
      if (pile.has(x.rep)) { alertes.push(alerte('erreur', `${x.rep} : boucle dans les liaisons amont.`)); return null; }
      const am = x.amont && parRep.get(String(x.amont).trim());
      if (x.amont && !am) alertes.push(alerte('attention', `${x.rep} : liaison amont « ${x.amont} » introuvable (chute de tension amont saisie utilisée).`));
      const ra = am ? calc(am, new Set([...pile, x.rep])) : null;
      const r = liaison(x, ra ? ra.duTotal : num(x.duAmont, num(e.duOrigine, 0)), schema);
      res.set(x.rep, r); return r;
    };
    lignes.forEach(x => calc(x));
    const tab = lignes.map(x => {
      const r = res.get(x.rep);
      if (!r) return null;
      if (!r.Ib) alertes.push(alerte('attention', `${x.rep} : puissance ou intensité à renseigner.`));
      if (!num(x.L)) alertes.push(alerte('attention', `${x.rep} : longueur à renseigner.`));
      if (r.Ib > r.In) alertes.push(alerte('erreur', `${x.rep} : protection ${r.In} A inférieure au courant d'emploi ${nf(r.Ib, 1)} A.`));
      if (r.duTotal > r.duMax + 1e-9) alertes.push(alerte('erreur', `${x.rep} : chute de tension ${nf(r.duTotal, 2)} % au-delà de ${nf(r.duMax, 1)} % même en 240 mm².`));
      if (schema === 'TN' && num(x.L) > r.Lmax) alertes.push(alerte('erreur', `${x.rep} : longueur ${num(x.L)} m au-delà de la longueur protégée ${nf(r.Lmax, 0)} m (contacts indirects) : différentiel ou section supérieure.`));
      if (r.raisons.length) alertes.push(alerte('attention', `${x.rep} : section portée de ${String(r.Siz).replace('.', ',')} à ${String(r.S).replace('.', ',')} mm² (${r.raisons.join(', ')}).`));
      return { x, r };
    }).filter(Boolean);
    const dd = v => String(v).replace('.', ',');
    return {
      valeurs: { liaisons: tab.map(({ x, r }) => ({ rep: x.rep, S: r.S, cable: r.cable, In: r.In, du: r.duTotal })) },
      resume: [['Liaisons', String(tab.length)], ['Schéma de liaison à la terre', schema === 'TN' ? 'TN (longueurs maxi protégées vérifiées)' : 'TT (protection des personnes par différentiels)'],
        ...tab.map(({ x, r }) => [`${x.rep} — ${x.de || '?'} → ${x.vers || '?'}`, `${r.cable} · ${num(x.L)} m · protection ${r.In} A ${x.courbe || 'C'} · ΔU ${nf(r.duTotal, 2)} %`])],
      tableaux: [
        { titre: 'Courant admissible', entetes: ['Liaison', 'Ib (A)', 'In (A)', 'Mode de pose', 'Isolant / âme', 'k température', 'k groupement', 'Iz requis (A)', 'Section (Iz)', 'Iz retenu (A)'],
          lignes: tab.map(({ x, r }) => [x.rep, nf(r.Ib, 1), String(r.In), String(x.pose || 'E'), `${x.isolant === 'PVC' ? 'PVC' : 'PR'} / ${x.mat === 'Al' ? 'Al' : 'Cu'}`, nf(r.kT, 2), nf(r.kG, 2), nf(r.IzMin, 1), `${dd(r.Siz)} mm²`, nf(r.Iz, 1)]) },
        { titre: 'Chute de tension et longueur protégée', entetes: ['Liaison', 'Longueur (m)', 'cos φ', 'ΔU amont (%)', 'ΔU liaison (%)', 'ΔU cumulée (%)', 'Limite (%)', ...(schema === 'TN' ? ['L maxi protégée (m)'] : []), 'Section retenue', 'Câble'],
          lignes: tab.map(({ x, r }) => [x.rep, nf(num(x.L), 0), nf(num(x.cos, 0.85), 2), nf(r.duTotal - r.du, 2), nf(r.du, 2), nf(r.duTotal, 2), nf(r.duMax, 1), ...(schema === 'TN' ? [nf(r.Lmax, 0)] : []), `${dd(r.S)} mm²`, r.cable]) },
      ],
      alertes,
      hypotheses: [
        'Courant d\'emploi : Ib = P / (√3 · 400 · cos φ) en triphasé, P / (230 · cos φ) en monophasé (ou Ib saisi).',
        'Protection : In ≥ Ib (calibre normalisé, ou imposé) ; condition Iz ≥ In avec Iz = Iz0 × k température × k groupement (CEI 60364-5-52 / NF C 15-100, tableaux de courants admissibles pour 3 conducteurs chargés, 2 conducteurs chargés en monophasé ≈ +13 %, aluminium ≈ 0,78 du cuivre).',
        'Chute de tension : ΔU = b · (ρ1 · L / S · cos φ + λ · L · sin φ) · Ib, b = 1 en triphasé, 2 en monophasé, ρ1 = 0,0225 Ω·mm²/m (cuivre) ou 0,036 (aluminium), λ = 0,08 mΩ/m ; ΔU % rapportée à 230 V et cumulée depuis l\'origine (liaison amont).',
        'Limites usuelles depuis l\'origine d\'une installation alimentée par le réseau public BT : 3 % pour l\'éclairage, 5 % pour les autres usages (6 % / 8 % depuis un poste privé).',
        ...(schema === 'TN' ? ['Contacts indirects (schéma TN) : Lmax = 0,8 · U0 · S / (ρ · (1 + m) · Ia), ρ = 0,027 Ω·mm²/m, m = 1, Ia = seuil magnétique (5, 10 ou 20 In selon la courbe B, C ou D).'] : []),
        'Pré-dimensionnement : à valider par le bureau d\'études électricité (sélectivité, tenue aux courts-circuits, facteurs propres au cheminement réel).'],
      synthese: tab.length ? tab.map(({ x, r }) => `${x.rep} ${dd(r.S)} mm²`).join(' · ') : 'Aucune liaison',
    };
  }

  // Liaisons à notre charge d'après le calcul d'alimentation électrique : alimentation des armoires (du TGBT) et départs
  // des armoires CVC dont la longueur est connue ; les lignes déjà saisies (pose, isolant…) sont gardées
  function depuisElectricite(eElec, existantes = []) {
    const El = typeof Electricite !== 'undefined' ? Electricite : require('./electricite');
    const r = N.calculer('elec', eElec), out = existantes.slice();
    const garde = (rep, o) => { const ex = out.find(l => l.rep === rep); if (ex) Object.assign(ex, { de: o.de, vers: o.vers, P: o.P, tension: o.tension, L: ex.L || o.L }); else out.push({ rep, pose: 'E', isolant: 'PR', mat: 'Cu', temp: 30, groupes: 1, courbe: 'C', duMax: 5, In: '', Ib: '', amont: '', cos: 0.85, ...o }); };
    (eElec.armoires || []).filter(a => a.rep).forEach(a => {
      const v = (r.valeurs.armoires || []).find(x => x.rep === a.rep) || {};
      // Alimentation d'une armoire : 2 % au plus, pour garder de la marge aux départs en aval
      garde(`TGBT-${a.rep}`, { de: 'TGBT', vers: `Armoire ${a.rep}`, tension: 'triN', P: '', Ib: v.Ib ? Math.round(v.Ib * 10) / 10 : '', In: v.cal || '', L: num(a.L) || '', duMax: 2 });
    });
    const tension = q => q.tension || (El.TYPES_EQ[q.type] || [])[2] || 'mono';
    // Départs de puissance des armoires CVC (pas les organes 24 V) dont la longueur est saisie
    // Alimentation laissée vide : la première armoire (comme le calcul d'alimentation électrique)
    const premiere = ((eElec.armoires || []).find(a => a.rep) || {}).rep || 'elec', alim = q => q.alim || premiere;
    (eElec.equipements || []).filter(q => alim(q) !== 'elec' && tension(q) !== '24V' && num(q.L) > 0).forEach(q => {
      const t = (El.TYPES_EQ[q.type] || [])[1];
      garde(`${alim(q)}-${q.rep}`, { de: `Armoire ${alim(q)}`, vers: `${q.rep} ${q.designation || ''}`.trim(), tension: tension(q) === 'tri' ? 'tri' : 'mono', P: num(q.P), L: num(q.L), amont: `TGBT-${alim(q)}`, courbe: t && ['direct', 'contacteur', ''].includes(q.depart || '') ? 'D' : 'C' });
    });
    return out;
  }

  N.TYPES.cable = {
    titre: 'Dimensionnement des câbles (liaisons à la charge du lot CVC)', icone: '🔌', famille: 'Électricité et régulation',
    description: 'Pour chaque liaison (TGBT → armoire CVC, armoire → pompe éloignée…) : courant d\'emploi, protection, courant admissible corrigé, chute de tension cumulée, longueur protégée ; section et câble. Note à faire valider par le bureau d\'études électricité.',
    champs: [
      { g: 'Installation' },
      { k: 'schema', l: 'Schéma de liaison à la terre', t: 's', o: [['TT', 'TT (différentiels)'], ['TN', 'TN-S / TN-C']], d: 'TT' },
      { k: 'duOrigine', l: 'Chute de tension en amont des liaisons sans amont (TGBT)', u: '%', d: 0.5 },
      { g: 'Liaisons' },
      { k: 'liaisons', l: 'Liaisons — « 🔌 Reprendre les liaisons de l\'alimentation électrique » les ajoute depuis ce calcul', t: 'lignes', d: [
        { rep: 'L1', de: 'TGBT', vers: 'Armoire AR-CVC-01', tension: 'triN', P: 30, Ib: '', cos: 0.85, L: 60, pose: 'E', isolant: 'PR', mat: 'Cu', temp: 30, groupes: 3, In: '', courbe: 'C', duMax: 5, amont: '' },
        { rep: 'L2', de: 'Armoire AR-CVC-01', vers: 'Pompe de relevage P5', tension: 'tri', P: 4, Ib: '', cos: 0.85, L: 120, pose: 'D', isolant: 'PR', mat: 'Cu', temp: 20, groupes: 1, In: '', courbe: 'D', duMax: 5, amont: 'L1' }],
        colonnes: [{ k: 'rep', l: 'Repère', t: 't' }, { k: 'de', l: 'Depuis', t: 't' }, { k: 'vers', l: 'Vers', t: 't' },
          { k: 'tension', l: 'Tension', t: 's', o: [['triN', '400 V tri + N'], ['tri', '400 V tri'], ['mono', '230 V mono']] },
          { k: 'P', l: 'P (kW)' }, { k: 'Ib', l: 'ou Ib (A)' }, { k: 'cos', l: 'cos φ' }, { k: 'L', l: 'Longueur (m)' },
          { k: 'pose', l: 'Mode de pose', t: 's', o: Object.entries(POSES) }, { k: 'isolant', l: 'Isolant', t: 's', o: [['PR', 'PR (XLPE, 90 °C)'], ['PVC', 'PVC (70 °C)']] },
          { k: 'mat', l: 'Âme', t: 's', o: [['Cu', 'Cuivre'], ['Al', 'Aluminium']] }, { k: 'temp', l: 'T ambiante (°C)' }, { k: 'groupes', l: 'Circuits jointifs' },
          { k: 'In', l: 'Protection imposée (A)' }, { k: 'courbe', l: 'Courbe', t: 's', o: [['C', 'C'], ['D', 'D'], ['B', 'B']] },
          { k: 'duMax', l: 'ΔU maxi cumulée (%)' }, { k: 'amont', l: 'Liaison amont (repère)', t: 't' }] },
    ],
    calcul: calculer,
  };
  return { SECTIONS, IZ, POSES, liaison, calculer, depuisElectricite };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'));
if (typeof module !== 'undefined') module.exports = Cables;
