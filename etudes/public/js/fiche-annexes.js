// Fiches techniques du matériel des calculs annexes : unité extérieure DRV / VRF, radiateur, échangeur à plaques,
// déshumidificateur (centrale de piscine), groupe de chambre froide, extracteur (tourelle, caisson). Lecture des lignes
// « Libellé : valeur unité » (format Pipe-Fit, fiche bien structurée), champs du calcul annexe remplis (registre des
// équipements : valeurs reprises et verrouillées), résumé lisible. Module pur (navigateur, node, tests).
const FicheAnnexes = (() => {
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘`]/g, "'")
    .replace(/m\s*(?:³|3)\s*\/\s*h/g, 'm3/h').replace(/m\s*²|m2\b/g, 'm2').replace(/[δΔ]\s*/g, 'delta ').replace(/\s+/g, ' ').trim();
  const nb = s => Number(String(s).replace(/[\s  ]/g, '').replace(',', '.'));
  const NUM = '(-?\\d+(?:[.,]\\d+)?)';
  // Types de fiche (registre, vrac) → calcul annexe qui les reçoit
  const TYPES = { drvUE: 'Unité extérieure DRV / VRF', radiateur: 'Radiateur', echangeur: 'Échangeur à plaques', deshu: 'Déshumidificateur, centrale de piscine', groupeFroid: 'Groupe de chambre froide', extracteur: 'Extracteur, tourelle, caisson' };
  const CALCULS = { drvUE: ['drv'], radiateur: ['radiateurs'], echangeur: ['echangeurPlaques'], deshu: ['piscine'], groupeFroid: ['chambreFroide'], extracteur: ['hotte', 'parking'] };
  // Genre d'emplacement (type du calcul annexe) → type de fiche
  const GENRE_TYPE = { drv: 'drvUE', radiateurs: 'radiateur', echangeurPlaques: 'echangeur', piscine: 'deshu', chambreFroide: 'groupeFroid', hotte: 'extracteur', parking: 'extracteur' };
  const LIBELLES = { Pfr: ['Puissance frigorifique', 'kW'], Pch: ['Puissance calorifique', 'kW'], EER: ['EER', ''], COP: ['COP', ''], Pel: ['Puissance électrique absorbée', 'kW'],
    fluide: ['Fluide frigorigène', ''], charge: ['Charge en fluide (usine)', 'kg'], Lpre: ['Longueur de liaison préchargée', 'm'], nUImax: ['Unités intérieures raccordables (maxi)', ''],
    P50: ['Puissance à ΔT 50', 'W'], nExp: ['Exposant n', ''], Hmm: ['Hauteur', 'mm'], Lmm: ['Longueur', 'mm'], Veau: ['Contenance en eau', 'L'],
    P: ['Puissance', 'kW'], dp1: ['Perte de charge primaire', 'kPa'], dp2: ['Perte de charge secondaire', 'kPa'], Sech: ['Surface d\'échange', 'm²'], nPlaques: ['Nombre de plaques', ''],
    mDeshu: ['Capacité de déshumidification', 'kg/h'], Qair: ['Débit d\'air', 'm³/h'], Tevap: ['Température d\'évaporation', '°C'], Pabs: ['Puissance absorbée', 'kW'],
    pDispo: ['Pression disponible', 'Pa'], tension: ['Tension', ''] };

  // Valeur d'une ligne dans une unité : [motif d'unité, facteur] ; la première unité trouvée l'emporte
  function valeur(x, unites) {
    for (const [u, k] of unites) {
      const m = new RegExp(`${NUM}\\s*(?:${u})(?![a-z0-9])`).exec(x);
      if (m) return nb(m[1]) * k;
    }
    return undefined;
  }
  const KW = [['kw', 1], ['w', 0.001]], W = [['w', 1], ['kw', 1000]], KPA = [['kpa', 1], ['mbar', 0.1], ['m\\s*ce|mce', 9.81], ['bar', 100]], MM = [['mm', 1], ['cm', 10], ['m', 1000]];
  const SANS = [['', 1]];
  // Fluide : « R32 », « R-410A », « R1234ze(E) » → clé des calculs (annexes-froid)
  const FLUIDES = ['R32', 'R410A', 'R454B', 'R407C', 'R134a', 'R513A', 'R404A', 'R449A', 'R448A', 'R452A', 'R454C', 'R1234yf', 'R1234ze', 'R290', 'R600a', 'R744', 'R717'];
  function fluide(t) {
    const m = /\br\s*-?\s*(\d{2,4}[a-z]{0,2})/i.exec(String(t || '').replace(/\(e\)/i, ''));
    if (!m) return /propane/i.test(t) ? 'R290' : /isobutane/i.test(t) ? 'R600a' : /\bco2\b|co₂/i.test(t) ? 'R744' : /ammoniac/i.test(t) ? 'R717' : undefined;
    return FLUIDES.find(f => f.toLowerCase() === `r${m[1].toLowerCase()}`);
  }
  const tension = t => (/400|tri/.test(t) ? 'tri' : /230|mono/.test(t) ? 'mono' : undefined);
  // Règles de lecture par type : [clé, motif du libellé, unités | fonction(texte de la valeur), min, max]
  const REGLES = {
    drvUE: [['Pfr', /puissance (?:frigorifique|froid)|capacite (?:frigorifique|froid)|cooling capacity|puissance nominale froid/, KW, 1, 2000],
      ['Pch', /puissance (?:calorifique|chaud)|capacite (?:calorifique|chaud)|heating capacity|puissance nominale chaud/, KW, 1, 2000],
      ['EER', /\beer\b/, SANS, 1, 12], ['COP', /\bcop\b/, SANS, 1, 12],
      ['Pel', /puissance electrique|puissance absorbee|power input/, KW, 0.1, 1000], ['fluide', /fluide|refrigerant/, fluide],
      ['charge', /charge/, [['kg', 1]], 0.1, 500], ['Lpre', /prechar|longueur sans (?:complement|charge)/, [['m', 1]], 1, 300],
      ['nUImax', /(?:nombre|nb).*(?:unites? interieures?|ui\b)|unites? interieures? (?:raccordables|maxi)/, SANS, 1, 200]],
    radiateur: [['P50', /delta ?t ?=? ?50|dt ?50|en 442|puissance nominale|puissance/, W, 50, 20000], ['nExp', /exposant|coefficient n\b|^n\b/, SANS, 1, 2],
      ['Hmm', /hauteur/, MM, 100, 3000], ['Lmm', /longueur|largeur/, MM, 100, 6000], ['Veau', /contenance|volume d.eau|capacite en eau|volume/, [['litres?|l', 1]], 0.1, 200]],
    echangeur: [['dp1', /(?:perte de charge|delta ?p|pdc).*primaire|primaire.*(?:perte de charge|delta ?p|pdc)/, KPA, 0.1, 500],
      ['dp2', /(?:perte de charge|delta ?p|pdc).*secondaire|secondaire.*(?:perte de charge|delta ?p|pdc)/, KPA, 0.1, 500],
      ['P', /puissance/, KW, 1, 50000], ['Sech', /surface/, [['m2', 1]], 0.05, 5000], ['nPlaques', /plaques/, SANS, 3, 1000]],
    deshu: [['mDeshu', /deshumidification|condensation|eau extraite|capacite d.extraction/, [['kg\\s*/\\s*h', 1], ['l\\s*/\\s*h', 1], ['l\\s*/\\s*24\\s*h|l\\s*/\\s*j', 1 / 24]], 0.1, 2000],
      ['Qair', /debit/, [['m3/h', 1]], 50, 500000], ['Pel', /puissance electrique|puissance absorbee|^puissance$/, KW, 0.05, 1000]],
    groupeFroid: [['Pfr', /puissance frigorifique|capacite frigorifique|puissance froid|puissance utile/, KW, 0.1, 5000], ['Tevap', /temperature d.evaporation|evaporation|tevap|\bto\b/, [['°?\\s*c', 1]], -60, 20],
      ['Pabs', /puissance absorbee|puissance electrique/, KW, 0.05, 2000], ['fluide', /fluide|refrigerant/, fluide], ['charge', /charge/, [['kg', 1]], 0.05, 500]],
    extracteur: [['Qair', /debit/, [['m3/h', 1], ['l\\s*/\\s*s', 3.6]], 10, 500000], ['pDispo', /pression|hauteur manometrique/, [['pa', 1], ['mm\\s*ce', 9.81]], 5, 5000],
      ['Pel', /puissance (?:absorbee|electrique|moteur|installee)|^puissance$/, KW, 0.005, 500], ['tension', /tension|alimentation/, tension]],
  };

  function lire(type, lignes) {
    const L = (Array.isArray(lignes) ? lignes : String(lignes || '').split(/\r?\n/)).map(String).filter(l => l.trim()), v = {}, src = {};
    let fabricant = '', reference = '';
    L.forEach(l => {
      const i = l.indexOf(':'); if (i < 0) return;
      const lib = norm(l.slice(0, i)), brut = l.slice(i + 1).trim(), x = norm(brut);
      if (/^fabricant|^marque|^constructeur/.test(lib)) { fabricant = fabricant || brut; return; }
      if (/^reference|^modele|^ref\b/.test(lib)) { reference = reference || brut; return; }
      if (/^type\b/.test(lib)) return;
      for (const [k, re, u, min, max] of REGLES[type] || []) {
        if (v[k] !== undefined || !re.test(lib)) continue;
        // Température d'évaporation portée par le libellé : « Puissance frigorifique à -10 °C »
        if (type === 'groupeFroid' && k === 'Pfr' && v.Tevap === undefined) { const t = new RegExp(`${NUM}\\s*°?\\s*c\\b`).exec(lib); if (t) { v.Tevap = nb(t[1]); src.Tevap = l.trim(); } }
        const y = typeof u === 'function' ? u(brut) : valeur(x, u);
        if (y === undefined || (typeof y === 'number' && !(Number.isFinite(y) && y >= min && y <= max))) continue;
        v[k] = typeof y === 'number' ? Math.round(y * 1000) / 1000 : y; src[k] = l.trim().slice(0, 140);
        break;
      }
    });
    if (v.nUImax !== undefined) v.nUImax = Math.round(v.nUImax);
    if (v.nPlaques !== undefined) v.nPlaques = Math.round(v.nPlaques);
    // Fabricant et référence sans ligne dédiée : bibliothèque des fiches techniques de Pipe-Fit, sinon première ligne
    if (!fabricant || !reference) {
      try {
        const FT = typeof FichesTech !== 'undefined' ? FichesTech : require('../../../public/js/fiches-tech');
        const a = FT.analyser({ texte: L.join('\n') }); fabricant = fabricant || a.fabricant || ''; reference = reference || (a.references || [])[0] || '';
      } catch (e) { /* sans bibliothèque */ }
    }
    return { valeurs: v, sources: src, fabricant, reference, nb: Object.keys(v).length };
  }

  const nf = (x, d = 1) => (Number.isFinite(x) ? String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ',') : '');
  function resume(type, v = {}) {
    const r = {
      drvUE: [v.Pfr && `froid ${nf(v.Pfr)} kW`, v.Pch && `chaud ${nf(v.Pch)} kW`, v.fluide, v.charge && `${nf(v.charge, 2)} kg`, v.nUImax && `${v.nUImax} UI maxi`],
      radiateur: [v.P50 && `${nf(v.P50, 0)} W à ΔT 50`, v.nExp && `n ${nf(v.nExp, 2)}`, v.Hmm && v.Lmm && `${nf(v.Hmm, 0)} × ${nf(v.Lmm, 0)} mm`],
      echangeur: [v.P && `${nf(v.P)} kW`, v.Sech && `${nf(v.Sech, 2)} m²`, v.nPlaques && `${v.nPlaques} plaques`, (v.dp1 || v.dp2) && `ΔP ${nf(v.dp1)} / ${nf(v.dp2)} kPa`],
      deshu: [v.mDeshu && `${nf(v.mDeshu)} kg/h`, v.Qair && `${nf(v.Qair, 0)} m³/h`, v.Pel && `${nf(v.Pel, 2)} kW élec.`],
      groupeFroid: [v.Pfr && `${nf(v.Pfr, 2)} kW froid${Number.isFinite(v.Tevap) ? ` à ${nf(v.Tevap, 0)} °C` : ''}`, v.Pabs && `${nf(v.Pabs, 2)} kW élec.`, v.fluide],
      extracteur: [v.Qair && `${nf(v.Qair, 0)} m³/h`, v.pDispo && `${nf(v.pDispo, 0)} Pa`, v.Pel && `${nf(v.Pel, 2)} kW`, v.tension && (v.tension === 'tri' ? '400 V tri' : '230 V mono')],
    }[type] || [];
    return r.filter(Boolean).join(' · ');
  }

  // Champs du calcul annexe (genre = type du calcul) remplis par les valeurs du modèle : [{ k, cle, val, libelle, unite }]
  const MAPPING = {
    drv: [['PfrUE', 'Pfr'], ['PchUE', 'Pch'], ['EER', 'EER'], ['PelUE', 'Pel'], ['fluide', 'fluide'], ['chargeUsine', 'charge'], ['Lprecharge', 'Lpre'], ['nUImax', 'nUImax']],
    radiateurs: [['n', 'nExp'], ['P50fab', 'P50'], ['Hfab', 'Hmm'], ['Lfab', 'Lmm'], ['Vfab', 'Veau']],
    echangeurPlaques: [['Pfab', 'P'], ['dp1', 'dp1'], ['dp2', 'dp2'], ['Afab', 'Sech'], ['nPlaques', 'nPlaques']],
    piscine: [['mFab', 'mDeshu'], ['Qfab', 'Qair'], ['PelFab', 'Pel']],
    chambreFroide: [['PfrGroupe', 'Pfr'], ['TevapFab', 'Tevap'], ['Pgroupe', 'Pabs'], ['fluide', 'fluide'], ['charge', 'charge']],
    hotte: [['QextFab', 'Qair'], ['dpE', 'pDispo'], ['PextFab', 'Pel'], ['tensionExt', 'tension']],
    parking: [['QextFab', 'Qair'], ['dp', 'pDispo'], ['PextFab', 'Pel'], ['tensionExt', 'tension']],
  };
  function champs(genre, v = {}) {
    return (MAPPING[genre] || []).flatMap(([k, cle]) => {
      let y = v[cle];
      if (y === undefined || y === null || y === '') return [];
      if (typeof y === 'string' && /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(y)) y = Number(y.replace(',', '.'));
      if (cle === 'fluide' && !FLUIDES.includes(y)) return [];
      if (typeof y === 'number') { if (!Number.isFinite(y)) return []; y = Math.round(y * 1000) / 1000; }
      return [{ k, cle, val: y, libelle: (LIBELLES[cle] || [cle])[0], unite: (LIBELLES[cle] || ['', ''])[1] }];
    });
  }
  // Valeurs de la fiche relues sur un calcul existant (inverse de champs)
  function inverse(genre, e = {}) {
    const o = {};
    (MAPPING[genre] || []).forEach(([k, cle]) => { const y = e[k]; if (y !== undefined && y !== null && y !== '') o[cle] = typeof y === 'string' && /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(y) ? Number(y.replace(',', '.')) : y; });
    return o;
  }
  const gere = genre => !!MAPPING[genre];
  return { TYPES, CALCULS, GENRE_TYPE, LIBELLES, MAPPING, REGLES, lire, resume, champs, inverse, gere, fluide };
})();
if (typeof module !== 'undefined') module.exports = FicheAnnexes;
