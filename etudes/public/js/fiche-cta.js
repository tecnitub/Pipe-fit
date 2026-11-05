// Lecture de la fiche technique (fiche de sélection) d'une centrale de traitement d'air : débits, récupérateur et son
// efficacité, régimes d'eau et puissances des batteries, pertes de charge côté air (filtres, récupérateur, batteries),
// pression disponible, puissances électriques et SFP, puissances acoustiques. Les valeurs lues remplissent le calcul de
// CTA ou le schéma aéraulique ; celles qui ne remplacent pas une saisie (puissances, pression disponible…) servent de
// contrôle. Module pur (navigateur, node, tests) : lignes de texte du PDF en entrée.
const FicheCta = (() => {
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’‘`]/g, "'").replace(/m\s*(?:³|3)\s*\/\s*h/g, 'm3/h').replace(/(\d)\s*m\s*\/\s*h\b/g, '$1 m3/h').replace(/m\s*(?:³|3)\s*\/\s*s/g, 'm3/s').replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim();
  const nb = s => Number(String(s).replace(/[\s  ]/g, '').replace(',', '.'));
  // Nombres suivis d'une unité (« 3 000 m3/h », « 120 Pa », « 14,5 kW ») ; les milliers séparés par une espace sont regroupés
  const avecUnite = (x, unite) => [...x.matchAll(new RegExp(`(\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*(?:${unite})(?![a-z])`, 'g'))].map(m => nb(m[1])).filter(Number.isFinite);
  // Tous les nombres d'une ligne avec l'unité donnée, même sans unité répétée : « Débit d'air (m3/h) 3 000 2 900 »
  // Colonnes séparées par une espace : « 250 200 » = deux valeurs, « 3 000 2 900 » = 3000 et 2900 (milliers regroupés
  // seulement derrière un premier groupe de 1 ou 2 chiffres)
  const nombres = x => [...x.replace(/\d+\s*\/\s*\d+\s*°?\s*c/g, ' ').matchAll(/(?<!\d)(\d{1,2}(?:[ \u00a0\u202f]\d{3})+(?!\d)|\d+(?:[.,]\d+)?)/g)].map(m => nb(m[1])).filter(Number.isFinite);
  const N = '(\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+(?:[.,]\\d+)?)';
  // « 300 / 250 Pa » : deux valeurs pour une seule unité (soufflage / reprise)
  const doubles = (x, unite) => { const m = new RegExp(`${N}\\s*\\/\\s*${N}\\s*(?:${unite})(?![a-z])`).exec(x); return m ? [nb(m[1]), nb(m[2])] : null; };
  const valeurs = (x, unite, re) => { const d = doubles(x, unite); if (d) return d; const v = avecUnite(x, unite); return v.length ? v : new RegExp(`\\(\\s*(?:${unite})\\s*\\)|\\[\\s*(?:${unite})\\s*\\]`).test(x) ? nombres(x.replace(re || /^$/, ' ')) : []; };

  const SOUF = /souffl|insuffl|supply|air neuf|pulsion|\bsup\b/, REPR = /reprise|repris|extrai|extract|exhaust|retour d'air|air vicie/;
  const BC = /batterie chaude|batt?\.? chaude|\bb\.?c\.?\b|eau chaude|lphw|chauffage|post-?chauffage|heating coil/, BF = /batterie froide|batt?\.? froide|\bb\.?f\.?\b|eau glacee|chw|refroidissement|cooling coil/;
  const RECUP = /recuper|echangeur|roue|rotati|plaques|contre-?courant|heat recovery|recovery/;

  function lire(lignes) {
    const L = (Array.isArray(lignes) ? lignes : String(lignes || '').split(/\r?\n/)).map(l => String(l || '')).filter(l => l.trim());
    const X = L.map(norm), tout = X.join('\n'), v = {}, src = {};
    const pose = (k, val, i, min = -Infinity, max = Infinity) => { if (v[k] === undefined && Number.isFinite(val) && val >= min && val <= max) { v[k] = Math.round(val * 100) / 100; src[k] = L[i].trim().slice(0, 140); } };
    // Paire soufflage / reprise sur une même ligne (tableau à deux colonnes) ou valeurs séparées
    const paire = (i, x, kS, kR, unite, min, max) => {
      const vals = valeurs(x, unite).filter(n => n >= min && n <= max);
      if (!vals.length) return;
      const s = SOUF.test(x), r = REPR.test(x);
      if (vals.length >= 2 && !(s !== r)) { pose(kS, vals[0], i, min, max); pose(kR, vals[1], i, min, max); }
      else if (r && !s) pose(kR, vals[0], i, min, max);
      else pose(kS, vals[0], i, min, max);
    };
    X.forEach((x, i) => {
      // Débits d'air
      if (/debit|volume d'air|air flow|airflow|m3\/h/.test(x) && !/eau|water|condensat|m3\/h d'eau/.test(x)) paire(i, x, 'Qs', 'Qr', 'm3/h', 100, 200000);
      // Pression disponible (réseau extérieur à la CTA)
      if (/pression (?:statique )?(?:disponible|externe|utile)|pression dispo|\besp\b|external static|pression totale disponible/.test(x)) paire(i, x, 'PdispoS', 'PdispoR', 'pa', 20, 3000);
      // Efficacité du récupérateur
      if (/(efficacite|rendement|efficiency)/.test(x) && (RECUP.test(x) || /thermique|temperature|sec\b|sensible/.test(x)) && !/ventil|moteur|fan/.test(x)) {
        const p = avecUnite(x, '%').filter(n => n >= 40 && n <= 98); if (p.length) pose('eta', p[0], i);
      }
      // Batteries : régime d'eau et puissance
      const reg = /(\d{1,2}(?:[.,]\d)?)\s*(?:°\s*c)?\s*\/\s*(\d{1,2}(?:[.,]\d)?)\s*°?\s*c/.exec(x) || /(?:entree|aller|depart)[^0-9]{0,15}(\d{1,2})\s*°?\s*c.{0,30}(?:sortie|retour)[^0-9]{0,15}(\d{1,2})\s*°?\s*c/.exec(x);
      const estBC = BC.test(x) && !BF.test(x), estBF = BF.test(x) && !BC.test(x);
      if (reg) {
        const a = nb(reg[1]), b = nb(reg[2]);
        if ((estBC || (!estBF && a > b && a >= 30)) && a > b) { pose('TcAller', a, i, 30, 150); pose('TcRetour', b, i, 20, 140); }
        else if ((estBF || (!estBC && a < b && a <= 15)) && a < b) { pose('TfAller', a, i, -10, 18); pose('TfRetour', b, i, 0, 25); }
      }
      if (/puissance|capacite|capacity|output/.test(x) && !/electri|absorb|acoustique|sonore|moteur|ventil/.test(x)) {
        const kw = avecUnite(x, 'kw');
        if (kw.length && estBC) pose('PchBC', kw[0], i, 0.1, 5000);
        if (kw.length && estBF) pose('PfrBF', kw[0], i, 0.1, 5000);
      }
      // Pertes de charge côté eau des batteries (kPa)
      if (/perte de charge|pertes de charge|delta ?p|pressure drop/.test(x) && /eau|hydraulique|water/.test(x) && (estBC || estBF)) {
        const k = valeurs(x, 'kpa').filter(n => n > 0 && n < 300); if (k.length) pose(estBF ? 'dpEauBF' : 'dpEauBC', k[0], i);
      }
      // Pertes de charge côté air
      if (/perte de charge|pertes de charge|delta ?p|\bdp\b|pressure drop|δp|resistance/.test(x) || (/filtre|filter/.test(x) && /\bpa\b/.test(x))) {
        const pa = avecUnite(x, 'pa').filter(n => n > 0 && n <= 1500);
        if (pa.length) {
          if (/filtre|filter/.test(x)) {
            if (/epm\s*10|\bm[56]\b|\bg4\b|reprise|extrait/.test(x)) pose('dpFiltreR', pa[0], i);
            else if (/epm\s*1\b|\bf[789]\b|air neuf/.test(x)) pose('dpFiltreAN', pa[0], i);
            else pose(v.dpFiltreAN === undefined ? 'dpFiltreAN' : 'dpFiltreR', pa[0], i);
          } else if (RECUP.test(x)) pose('dpRecup', pa[0], i);
          else if (estBC) pose('dpBC', pa[0], i);
          else if (estBF) pose('dpBF', pa[0], i);
        }
      }
      // Batterie électrique (préchauffage, réchauffage, appoint) : puissance en kW
      if (/batterie electrique|resistance(?:s)? electrique|rechauffeur electrique|prechauffage electrique|electric heater/.test(x)) {
        const kw = valeurs(x, 'kw').filter(n => n > 0 && n < 1000); if (kw.length) pose('Pbe', kw[0], i, 0.1, 1000);
      } else
      // Ventilateurs : puissance électrique, rendement, SFP
      if (/ventil|fan|moteur|motor/.test(x) || /puissance (?:electrique )?absorbee|puissance electrique/.test(x)) {
        if (/puissance|absorb|power|p1\b/.test(x) && !/acoustique|sonore/.test(x)) {
          const kw = valeurs(x, 'kw').filter(n => n > 0 && n < 500), w = kw.length ? [] : avecUnite(x, 'w').filter(n => n >= 20 && n < 500000).map(n => n / 1000);
          const p = kw.length ? kw : w;
          if (p.length) { const s = SOUF.test(x), r = REPR.test(x); if (p.length >= 2 && s === r) { pose('PelS', p[0], i); pose('PelR', p[1], i); } else if (r && !s) pose('PelR', p[0], i); else pose('PelS', p[0], i); }
        }
        if (/rendement|efficiency|efficacite/.test(x) && !RECUP.test(x)) { const p = avecUnite(x, '%').filter(n => n >= 20 && n <= 90); if (p.length) pose('rendement', p[0], i); }
      }
      if (/\bsfp\b|puissance specifique/.test(x)) {
        const m = new RegExp(`${N}\\s*(kw|w)\\s*\\/\\s*\\(?\\s*m3\\/s`).exec(x) || new RegExp(`\\bsfp\\b[^0-9]{0,20}${N}`).exec(x);
        if (m) { const val = nb(m[1]) * (m[2] === 'kw' || nb(m[1]) < 10 ? 1000 : 1); pose('SFP', val, i, 100, 10000); }
      }
      // Puissance acoustique côté gaine
      if (/puissance acoustique|puissance sonore|\blw\b|sound power/.test(x)) paire(i, x, 'LwS', 'LwR', 'db\\s*\\(?a\\)?|dba|db', 30, 120);
      // Températures de soufflage hiver / été
      if (/temperature (?:de )?souffl|soufflage.*°c/.test(x)) {
        const t = avecUnite(x, '°\\s*c').filter(n => n >= 5 && n <= 45);
        if (t.length && /hiver|winter|chaud/.test(x)) pose('TsH', t[0], i); else if (t.length && /ete|summer|froid/.test(x)) pose('TsE', t[0], i);
      }
    });
    // Récupérateur, batterie froide, humidification : d'après tout le texte
    const recup = /roue|rotati|rotary|wheel/.test(tout) ? 'roue' : /plaques|contre-?courant|counter-?flow|plate|flux croises|cross-?flow/.test(tout) ? 'plaques' : /boucle|glycol|run-?around/.test(tout) && RECUP.test(tout) ? 'glycol' : '';
    if (recup) v.recup = recup;
    if (/sans batterie froide|batterie froide\s*:?\s*(?:non|sans|-)\b/.test(tout)) v.froid = 'non';
    else if (v.TfAller !== undefined || v.PfrBF !== undefined || v.dpBF !== undefined || /batterie froide|eau glacee|cooling coil/.test(tout)) v.froid = 'oui';
    if (/humidificat/.test(tout)) v.humid = /vapeur|steam/.test(tout) ? 'vapeur' : 'autre';
    // Débit unique : même débit soufflé et repris (centrale double flux équilibrée)
    if (v.Qs !== undefined && v.Qr === undefined && /double flux|reprise|extraction|recuper/.test(tout)) { v.Qr = v.Qs; src.Qr = `${src.Qs} (même débit)`; }
    // Fabricant et référence (bibliothèque des fiches techniques)
    let fabricant = '', reference = '';
    try {
      const FT = typeof FichesTech !== 'undefined' ? FichesTech : require('../../../public/js/fiches-tech');
      const a = FT.analyser({ texte: L.join('\n') });
      fabricant = a.fabricant || ''; reference = (a.references || [])[0] || '';
      // Marque en capitales en tête de fiche (« VENTILIA - Fiche de sélection »)
      if (!fabricant) { const m = /^\s*([A-Z][A-Z0-9&.-]{2,30})(?:\s|$)/.exec(L[0] || ''); if (m && !/^(FICHE|CENTRALE|CTA|DOCUMENT|PAGE)$/.test(m[1])) fabricant = m[1]; }
    } catch (e) { /* bibliothèque absente : sans fabricant */ }
    return { valeurs: v, sources: src, fabricant, reference, nb: Object.keys(v).length };
  }

  // Libellés et champs des notes remplis par la fiche ; « controle » : comparé au calcul, ne remplace pas une saisie
  const LIBELLES = {
    Qs: ['Débit soufflé', 'm³/h'], Qr: ['Débit repris', 'm³/h'], recup: ['Récupérateur', ''], eta: ['Efficacité du récupérateur', '%'],
    TcAller: ['Batterie chaude : départ', '°C'], TcRetour: ['Batterie chaude : retour', '°C'], TfAller: ['Batterie froide : départ', '°C'], TfRetour: ['Batterie froide : retour', '°C'],
    froid: ['Batteries', ''], humid: ['Humidification', ''], TsH: ['Soufflage en hiver', '°C'], TsE: ['Soufflage en été', '°C'],
    dpFiltreAN: ['Filtre d\'air neuf', 'Pa'], dpFiltreR: ['Filtre de reprise', 'Pa'], dpRecup: ['Récupérateur (par flux)', 'Pa'], dpBC: ['Batterie chaude (côté air)', 'Pa'], dpBF: ['Batterie froide (côté air)', 'Pa'],
    rendement: ['Rendement des ventilateurs', '%'], LwS: ['Lw ventilateur de soufflage', 'dB(A)'], LwR: ['Lw ventilateur de reprise', 'dB(A)'],
    PdispoS: ['Pression disponible soufflage', 'Pa'], PdispoR: ['Pression disponible reprise', 'Pa'], PchBC: ['Puissance batterie chaude', 'kW'], PfrBF: ['Puissance batterie froide', 'kW'],
    dpEauBC: ['Batterie chaude : perte de charge côté eau', 'kPa'], dpEauBF: ['Batterie froide : perte de charge côté eau', 'kPa'],
    PelS: ['Puissance électrique ventilateur soufflage', 'kW'], PelR: ['Puissance électrique ventilateur reprise', 'kW'], SFP: ['SFP', 'W/(m³/s)'], Pbe: ['Batterie électrique', 'kW'],
  };
  const CONTROLES = ['PdispoS', 'PdispoR', 'PchBC', 'PfrBF', 'PelS', 'PelR', 'SFP', 'dpEauBC', 'dpEauBF'];
  // Champ de la note pour chaque valeur lue (null : contrôle seulement)
  function champs(type, valeurs) {
    const out = [];
    const ajoute = (cle, k, val) => out.push({ cle, k, val, libelle: LIBELLES[cle][0], unite: LIBELLES[cle][1] });
    Object.entries(valeurs).forEach(([cle, val]) => {
      if (CONTROLES.includes(cle) || !LIBELLES[cle]) return;
      if (type === 'cta') {
        if (cle === 'LwS' || cle === 'LwR' || cle === 'Pbe') return;
        if (cle === 'humid') { if (val === 'vapeur') ajoute(cle, 'humid', 'vapeur'); return; }
        ajoute(cle, cle, val);
      } else if (type === 'aero') {
        const k = { recup: 'recuperateur', froid: 'batFroide', dpFiltreAN: 'dpFiltreS', dpFiltreR: 'dpFiltreR', dpRecup: 'dpRecup', dpBC: 'dpBatC', dpBF: 'dpBatF', rendement: 'rendement', LwS: 'LwFabS', LwR: 'LwFabR' }[cle];
        if (!k) return;
        ajoute(cle, k, cle === 'recup' ? (val === 'glycol' ? 'boucle' : val) : val);
      }
    });
    // Données électriques de la centrale : reprises dans la note (bilan électrique de l'étude)
    if (type === 'cta') { [['PelS', 'PelecVS'], ['PelR', 'PelecVR'], ['Pbe', 'PelBe']].forEach(([cle, k]) => { if (valeurs[cle] !== undefined) ajoute(cle, k, valeurs[cle]); }); }
    // Puissances des batteries lues sur la fiche : saisie directe (sans refaire le calcul depuis les conditions extérieures)
    if (type === 'cta' && (valeurs.PchBC !== undefined || valeurs.PfrBF !== undefined)) {
      if (valeurs.PchBC !== undefined) ajoute('PchBC', 'PchaudS', valeurs.PchBC);
      if (valeurs.PfrBF !== undefined) ajoute('PfrBF', 'PfroidS', valeurs.PfrBF);
      out.push({ cle: 'modeP', k: 'modeP', val: 'saisie', libelle: 'Puissances chaud et froid', unite: 'saisies depuis la fiche' });
    }
    if (type === 'aero' && (valeurs.TcAller !== undefined || valeurs.PchBC !== undefined || valeurs.dpBC !== undefined)) ajoute('TcAller', 'batChaude', 'oui');
    if (type === 'aero') out.forEach(c => { if (c.k === 'batChaude') c.libelle = 'Batterie chaude'; });
    return out;
  }
  // Informations gardées avec la note (contrôles dans le calcul)
  const fiche = (r, nom) => ({ nom: String(nom || '').slice(0, 120), fabricant: r.fabricant, reference: r.reference, ...Object.fromEntries(CONTROLES.filter(k => r.valeurs[k] !== undefined).map(k => [k, r.valeurs[k]])),
    ...(r.valeurs.Qs !== undefined ? { Qs: r.valeurs.Qs } : {}), ...(r.valeurs.Qr !== undefined ? { Qr: r.valeurs.Qr } : {}) });
  // Contrôles du calcul face à la fiche (alertes)
  function controles(f, calc) {
    if (!f) return [];
    const out = [], fx = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('fr-FR', { maximumFractionDigits: d }) : '—'), nom = [f.fabricant, f.reference].filter(Boolean).join(' ') || 'fiche technique';
    const a = (niveau, texte) => out.push({ niveau, texte });
    if (Number.isFinite(f.PdispoS) && Number.isFinite(calc.reseauS)) a(f.PdispoS >= calc.reseauS ? 'ok' : 'erreur', `Pression disponible au soufflage ${nom} : ${fx(f.PdispoS)} Pa pour ${fx(calc.reseauS)} Pa de réseau calculé${f.PdispoS >= calc.reseauS ? '' : ' : insuffisante'}.`);
    if (Number.isFinite(f.PdispoR) && Number.isFinite(calc.reseauR) && calc.reseauR > 0) a(f.PdispoR >= calc.reseauR ? 'ok' : 'erreur', `Pression disponible à la reprise : ${fx(f.PdispoR)} Pa pour ${fx(calc.reseauR)} Pa de réseau calculé${f.PdispoR >= calc.reseauR ? '' : ' : insuffisante'}.`);
    if (Number.isFinite(f.PchBC) && Number.isFinite(calc.Pchaud) && calc.Pchaud > 0) a(f.PchBC >= calc.Pchaud * 0.97 ? 'ok' : 'erreur', `Batterie chaude de la fiche : ${fx(f.PchBC, 1)} kW pour ${fx(calc.Pchaud, 1)} kW calculés${f.PchBC >= calc.Pchaud * 0.97 ? '' : ' : insuffisante'}.`);
    if (Number.isFinite(f.PfrBF) && Number.isFinite(calc.Pfroid) && calc.Pfroid > 0) a(f.PfrBF >= calc.Pfroid * 0.97 ? 'ok' : 'erreur', `Batterie froide de la fiche : ${fx(f.PfrBF, 1)} kW pour ${fx(calc.Pfroid, 1)} kW calculés${f.PfrBF >= calc.Pfroid * 0.97 ? '' : ' : insuffisante'}.`);
    const pel = (f.PelS || 0) + (f.PelR || 0);
    if (pel > 0 && Number.isFinite(calc.Pvent) && calc.Pvent > 0) a(Math.abs(pel - calc.Pvent) / calc.Pvent <= 0.25 ? 'ok' : 'attention', `Ventilateurs : ${fx(pel, 2)} kW électriques sur la fiche, ${fx(calc.Pvent, 2)} kW estimés par le calcul${Math.abs(pel - calc.Pvent) / calc.Pvent <= 0.25 ? '' : ' : vérifier les pertes de charge et le rendement saisis'}.`);
    if (Number.isFinite(f.Qs) && Number.isFinite(calc.Qs) && calc.Qs > 0 && Math.abs(f.Qs - calc.Qs) / calc.Qs > 0.05) a('attention', `Débit de soufflage de la fiche (${fx(f.Qs)} m³/h) différent du débit calculé (${fx(calc.Qs)} m³/h).`);
    return out;
  }
  return { lire, champs, fiche, controles, LIBELLES, norm };
})();
if (typeof module !== 'undefined') module.exports = FicheCta;
