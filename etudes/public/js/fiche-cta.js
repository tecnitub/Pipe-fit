// Lecture de la fiche technique (fiche de sélection) d'une centrale de traitement d'air : débits, récupérateur et son
// efficacité, régimes d'eau et puissances des batteries, pertes de charge côté air (filtres, récupérateur, batteries),
// pression disponible, puissances électriques et SFP, puissances acoustiques. Les valeurs lues remplissent le calcul de
// CTA ou le schéma aéraulique ; celles qui ne remplacent pas une saisie (puissances, pression disponible…) servent de
// contrôle. Module pur (navigateur, node, tests) : lignes de texte du PDF en entrée.
const FicheCta = (() => {
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’‘`]/g, "'").replace(/m\s*(?:³|3)\s*\/\s*h/g, 'm3/h').replace(/(\d)\s*m\s*\/\s*h\b/g, '$1 m3/h').replace(/m\s*(?:³|3)\s*\/\s*s/g, 'm3/s').replace(/[‐-―−]/g, '-').replace(/(\d)\s*°?\s*c(?![a-z0-9])/g, '$1 °c').replace(/\s+/g, ' ').trim();
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

  // Sections d'une fiche présentée par composant (« Filtre », « Batterie chaude », « AN - Ventilateur - Plug fan »,
  // « ÉCHANGEUR THERMIQUE », « Moteur ») : les valeurs d'une section se rapportent à ce composant
  const SECTIONS = [['erp', /^(?:caracteristiques|informations?|verification de la conformite) erp|^erp information|^informations erp/], ['filtre', /^(?:pre-?)?filtres?\b/],
    ['co', /^change ?over\b/], ['be', /^batterie electrique|^rechauffeur electrique|^resistance electrique/], ['bc', /^batterie (?:chaude|mixte)\b|^post-?chauffage\b|^prechauffage\b/], ['bf', /^batterie froide\b/],
    ['humid', /^humidificat/], ['moteur', /^-? ?moteur\b/], ['vent', /^ventilateur\b|^plug fan\b/], ['recup', /^echangeur(?: thermique| rotatif| a plaques| de chaleur)?$|^recuperateur\b|^roue\b|^recuperation de chaleur$/],
    ['autre', /^(?:caisson|chambre vide|registre|silencieux|accessoires|composants|remarques|donnees generales|valeurs de reference|resultats|caisson vide|caisson intermediaire)\b/]];
  const PREFIXE = /^(?:an|as|ae|ar|ra|ea|oda|sup|eta|eha|ae|rae)\s*-\s*/;
  // Ligne qui porte une valeur avec son unité : jamais un titre de section
  const UNITE = /\d\s*(?:kw|k?pa|m3\/[hs]|°c|%|kg|mm|w|a|v|db|l|bar|hz)(?![a-z0-9])/;
  function section(x, cellules) {
    if (cellules > 4 || x.length > 70 || UNITE.test(x)) return null;
    const t = x.split('\t')[0].replace(PREFIXE, '').trim(), s = SECTIONS.find(([, re]) => re.test(t));
    return s ? { nom: s[0], cote: /^(?:an|oda|sup|ae)\s*-/.test(x) ? 'AN' : /^(?:as|eta|ar|ra|rae|eha|ea)\s*-/.test(x) ? 'R' : '' } : null;
  }

  function lire(lignes) {
    const L = (Array.isArray(lignes) ? lignes : String(lignes || '').split(/\r?\n/)).map(l => String(l || '')).filter(l => l.trim());
    const X = L.map(norm), tout = X.join('\n'), v = {}, src = {}, prio = {};
    const pose = (k, val, i, min = -Infinity, max = Infinity, p = 0) => {
      if (!Number.isFinite(val) || val < min || val > max || (v[k] !== undefined && (prio[k] ?? 0) >= p)) return;
      v[k] = Math.round(val * 100) / 100; src[k] = L[i].trim().slice(0, 140); prio[k] = p;
    };
    // Paire soufflage / reprise sur une même ligne (tableau à deux colonnes) ou valeurs séparées
    const paire = (i, x, kS, kR, unite, min, max, p = 0) => {
      // « 300 300 Pa » (consigne, réel) n'est pas 300 300 Pa : sans regroupement des milliers quand la valeur sort de la plage
      let vals = valeurs(x, unite).filter(n => n >= min && n <= max);
      if (!vals.length) vals = [...x.matchAll(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${unite})(?![a-z])`, 'g'))].map(m => nb(m[1])).filter(n => n >= min && n <= max);
      if (!vals.length) return;
      const s = SOUF.test(x), r = REPR.test(x);
      if (vals.length >= 2 && !(s !== r)) { pose(kS, vals[0], i, min, max, p); pose(kR, vals[1], i, min, max, p); }
      else if (r && !s) pose(kR, vals[0], i, min, max, p);
      else pose(kS, vals[0], i, min, max, p);
    };
    const simpleFlux = /simple flux|\buvu\b|nrvu-uvu|appareil de soufflage/.test(tout) && !/double flux|\bbvu\b|nrvu-bvu/.test(tout);
    // Cumuls par composant : plusieurs batteries chaudes (préchauffage + post-chauffage), plusieurs filtres
    const parSec = [], cumul = (k, sec, val, i, p = 0) => { const c = sec.cumul[k]; if (!c || p > c.p) sec.cumul[k] = { val, i, p }; };
    let sec = { nom: '', cote: '', cumul: {}, lignes: [] }, alternatif = false, entree = null;
    const secDe = [];
    // Composant nommé en tête de ligne (« Filtre air neuf … 110 Pa ») : prioritaire sur la section en cours
    const COMP = [['filtre', /^(?:pre-?)?filtres?\b/], ['bc', /^batterie chaude\b/], ['bf', /^batterie froide\b/], ['be', /^batterie electrique\b/], ['vent', /^ventilateurs?\b/], ['recup', /^(?:recuperateur|echangeur)\b/]];
    X.forEach((x, i) => {
      const cel = L[i].split('\t').filter(c => c.trim()).length, nouv = section(norm(L[i].split('\t')[0]), cel);
      if (nouv && !UNITE.test(x)) { sec = { ...nouv, cumul: {}, lignes: [] }; parSec.push(sec); alternatif = false; entree = null; secDe[i] = sec.nom; return; }
      sec.lignes.push(x); secDe[i] = sec.nom;
      // Variante de régime (« Fonctionnement alternatif avec régime d'eau chaude 35/30 °C ») : ignorée
      if (/fonctionnement alternatif|alternative operation|regime alternatif/.test(x)) { alternatif = true; return; }
      if (alternatif) return;
      const S = (COMP.find(([, re]) => re.test(x)) || [sec.nom])[0], dansBat = S === 'bc' || S === 'bf' || S === 'co';
      // Débits d'air (une liste de tailles d'une gamme n'est pas un débit)
      const listeQ = (x.match(/m3\/h/g) || []).length >= 3;
      if (!listeQ && /debit|volume d'air|air flow|airflow|flux d'air|m3\/h/.test(x) && !/eau|water|condensat|m3\/h d'eau|fluide|kvs|nozzle|k factor/.test(x)) paire(i, x, 'Qs', 'Qr', 'm3/h', 100, 200000, S === '' ? 1 : 0);
      // Pression disponible (réseau extérieur à la CTA)
      if (/pression (?:statique )?(?:disponible|externe|utile)|pression dispo|\besp\b|external static|pression totale disponible|perte de charge externe/.test(x) && !/amont|en entree/.test(x)) paire(i, x, 'PdispoS', 'PdispoR', 'pa', 20, 3000);
      // Efficacité du récupérateur (pas les valeurs de consigne de l'écoconception)
      if (/(efficacite|rendement|efficiency)/.test(x) && (RECUP.test(x) || /thermique|temperature|sec\b|sensible/.test(x)) && !/ventil|moteur|fan|systeme|consigne|>|erp|jusqu/.test(x)) {
        const p = avecUnite(x, '%').filter(n => n >= 40 && n <= 98), q = p.length ? p : /\[%\]|\(%\)/.test(x) ? nombres(x).filter(n => n >= 40 && n <= 98) : [];
        if (q.length) pose('eta', q[0], i);
      }
      // Batteries : régime d'eau (sur une ligne « 40 °C / 35 °C », ou entrée et sortie du fluide sur deux lignes) et puissance
      const estBC = S === 'bc' || (BC.test(x) && !BF.test(x) && !dansBat), estBF = S === 'bf' || (BF.test(x) && !BC.test(x) && !dansBat);
      const reg = /(\d{1,2}(?:[.,]\d)?)\s*(?:°\s*c)?\s*\/\s*(\d{1,2}(?:[.,]\d)?)\s*°?\s*c/.exec(x) || /(?:entree|aller|depart)[^0-9]{0,15}(\d{1,2})\s*°?\s*c.{0,30}(?:sortie|retour)[^0-9]{0,15}(\d{1,2})\s*°?\s*c/.exec(x);
      const regime = (a, b) => {
        if ((estBC || (S === 'co' && a > b) || (!estBF && a > b && a >= 30)) && a > b) { pose('TcAller', a, i, 30, 150); pose('TcRetour', b, i, 20, 140); }
        else if ((estBF || (S === 'co' && a < b) || (!estBC && a < b && a <= 15)) && a < b) { pose('TfAller', a, i, -10, 18); pose('TfRetour', b, i, 0, 25); }
      };
      if (reg && (!/\bair\b/.test(x) || /fluide|eau/.test(x))) regime(nb(reg[1]), nb(reg[2]));
      else if (dansBat || /fluide|medium/.test(x)) {
        const t = /(?:fluide|medium|eau)[^0-9-]{0,25}(-?\d{1,3}(?:[.,]\d)?)\s*°?\s*c/.exec(x) || /(?:entree|sortie|\bin\b|\bout\b)[^0-9-]{0,10}(-?\d{1,3}(?:[.,]\d)?)\s*°?\s*c/.exec(x);
        if (t && /fluide|medium|eau/.test(x) && !/air/.test(x.replace(/fluide/, ''))) {
          if (/entree|\bin\b|aller/.test(x)) entree = nb(t[1]); else if (/sortie|\bout\b|retour/.test(x) && entree !== null) { regime(entree, nb(t[1])); entree = null; }
        }
      }
      if (/puissance|capacite|capacity|output/.test(x) && !/electri|absorb|acoustique|sonore|moteur|ventil|humidification|epingle|recuper|minimale|arbre|nominale \[kw\]/.test(x) && S !== 'be' && S !== 'erp') {
        const kw = avecUnite(x, 'kw').filter(n => n >= 0.1 && n <= 5000), k0 = kw.length ? kw : /\[kw\]|\(kw\)/.test(x) ? nombres(x.replace(/n°\s*\d/, ' ')).filter(n => n >= 0.1 && n <= 5000) : [];
        if (k0.length) {
          if (S === 'co') { if (/heat|chaud|chauffage/.test(x)) pose('PchBC', k0[0], i, 0.1, 5000); else pose('PfrBF', k0[0], i, 0.1, 5000); }
          else if (S === 'bc' && sec.nom === 'bc') cumul('PchBC', sec, k0[0], i);
          else if (S === 'bf' && sec.nom === 'bf') cumul('PfrBF', sec, k0[0], i);
          else if (estBC) pose('PchBC', k0[0], i, 0.1, 5000);
          else if (estBF) pose('PfrBF', k0[0], i, 0.1, 5000);
        }
      }
      // Pertes de charge côté eau des batteries (kPa)
      if (/perte de charge|pertes de charge|delta ?p|pressure drop|\bpdc\b/.test(x) && (/eau|hydraulique|water|fluide/.test(x) || dansBat) && (estBC || estBF || S === 'co')) {
        const k = valeurs(x, 'kpa').filter(n => n > 0 && n < 300);
        if (k.length) { if (S === 'bc' && sec.nom === 'bc') cumul('dpEauBC', sec, k[0], i); else pose(estBF || (S === 'co') ? 'dpEauBF' : 'dpEauBC', k[0], i); }
      }
      // Pertes de charge côté air
      if (/perte de charge|pertes de charge|delta ?p|\bdp\b|pressure drop|δp|resistance|pression de dimensionnement|pression finale/.test(x) || ((/filtre|filter/.test(x) || S === 'filtre') && /\bpa\b/.test(x))) {
        const pa = avecUnite(x, 'pa').filter(n => n > 0 && n <= 1500), triple = /(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*(?:pa)?/.exec(x), entete = /\[pa\]\s*((?:\d+(?:[.,]\d+)?\s*)+)$/.exec(x);
        const vals = pa.length ? pa : entete ? nombres(entete[1]) : [];
        const autre = /interne|externe|totale|dynamique|caisson|ecodesign|statique|fluide|kpa|bypass/.test(x);
        if (S === 'filtre' || (/filtre|filter/.test(x) && !S)) {
          // Initiale / finale / dimensionnement : la valeur de dimensionnement (ou « design », « sélection », « moyenne »)
          let d, p = 1;
          if (triple) { const lib0 = x.slice(0, triple.index), lib = lib0.slice(Math.max(0, lib0.lastIndexOf('charge'))), ordre = [...lib.matchAll(/\b(i|initiale?|propre|clean|f|finale?|d|dimensionnement|design|moyenne|selection)\b/g)].map(m => m[1][0]); const k = ordre.findIndex(c => c === 'd' || c === 'm' || c === 's'); d = nb(triple[k >= 0 && k < 3 ? k + 1 : 2]); p = 3; }
          else if (/dimensionnement|design|selection|moyenne/.test(x)) { d = vals[0]; p = 3; }
          else if (/finale|final|encrass/.test(x)) d = undefined;
          else if (/initiale|propre/.test(x)) { d = vals[0]; p = 1; }
          else { d = vals[0]; p = 2; }
          if (Number.isFinite(d) && d > 0 && d <= 1500) {
            if (S === 'filtre' && sec.nom === 'filtre') cumul('dpFiltre', sec, d, i, p);
            else if (/epm\s*10|\bm[56]\b|\bg4\b|reprise|extrait/.test(x)) pose('dpFiltreR', d, i);
            else if (/epm\s*1\b|\bf[789]\b|air neuf/.test(x)) pose('dpFiltreAN', d, i);
            else pose(v.dpFiltreAN === undefined ? 'dpFiltreAN' : 'dpFiltreR', d, i);
          }
        } else if (vals.length && !autre) {
          if (S === 'recup' || (RECUP.test(x) && !/roue libre|vitesse de rotation/.test(x) && !S)) pose('dpRecup', vals[0], i);
          else if (S === 'bc' && sec.nom === 'bc') cumul('dpBC', sec, vals[0], i);
          else if ((S === 'bf' || S === 'co') && sec.nom === S) { const c = sec.cumul.dpBF; sec.cumul.dpBF = { val: (c ? c.val : 0) + vals[0], i: c ? c.i : i, p: 0 }; }
          else if (estBC && sec.nom !== 'bc') pose('dpBC', vals[0], i);
          else if (estBF && sec.nom !== 'bf' && sec.nom !== 'co') pose('dpBF', vals[0], i);
        }
      }
      // Batterie électrique (préchauffage, réchauffage, appoint) : puissance installée en kW, courant
      if (S === 'be' || /batterie electrique|resistance(?:s)? electrique|rechauffeur electrique|prechauffage electrique|electric heater/.test(x)) {
        const kw = valeurs(x, 'kw').filter(n => n > 0 && n < 1000);
        if (kw.length && /puissance|kw/.test(x) && !/minimale|electricite consommee|veille/.test(x) && (!/epingle/.test(x) || /installee/.test(x))) pose('Pbe', kw[kw.length - 1], i, 0.1, 1000, /installee/.test(x) ? 3 : /tot/.test(x) ? 2 : /necessai/.test(x) ? 0 : 1);
        if (S === 'be' && /courant|intensite/.test(x)) { const a = avecUnite(x, 'a').filter(n => n > 0 && n < 5000); if (a.length) pose('Ibe', a[0], i); }
      } else if (S === 'moteur' && /puissance|courant|intensite/.test(x)) {
        // Moteur : puissance nominale et courant (protection électrique), puissance absorbée
        if (/puissance(?:\(s\))? nominale|^puissance\b(?! abs| sur| a l)/.test(x)) { const kw = avecUnite(x, 'kw').filter(n => n > 0 && n < 500); if (kw.length) pose('Pmot', kw[0], i); }
        if (/puissance abs/.test(x) && !/max/.test(x)) { const kw = avecUnite(x, 'kw').filter(n => n > 0 && n < 500); if (kw.length) pose('PelS', kw[0], i, 0, 500, /variateur/.test(x) ? 3 : 2); }
        if (/courant|intensite/.test(x)) { const m = /(\d+(?:[.,]\d+)?)(?:\s*\/\s*\d+(?:[.,]\d+)?)?\s*a\b/.exec(x); if (m) pose('Imot', nb(m[1]), i, 0.1, 2000); }
      } else
      // Ventilateurs : puissance électrique, rendement
      if (/ventil|fan|moteur|motor/.test(x) || S === 'vent' || /puissance (?:electrique )?absorbee|puissance electrique/.test(x)) {
        if (/puissance|absorb|power|p1\b/.test(x) && !/acoustique|sonore|arbre|shaft|max|reference|raccordement|sur arbre/.test(x) && S !== 'erp') {
          const kw = valeurs(x, 'kw').filter(n => n > 0 && n < 500), w = kw.length ? [] : avecUnite(x, 'w').filter(n => n >= 20 && n < 500000).map(n => n / 1000);
          const p = kw.length ? kw : w;
          if (p.length) { const s = SOUF.test(x), r = REPR.test(x), pr = /variateur/.test(x) ? 3 : 1; if (p.length >= 2 && s === r) { pose('PelS', p[0], i, 0, 500, pr); pose('PelR', p[1], i, 0, 500, pr); } else if (r && !s) pose('PelR', p[0], i, 0, 500, pr); else pose('PelS', p[0], i, 0, 500, pr); }
        }
        if (/rendement|efficiency|efficacite/.test(x) && !RECUP.test(x) && !/systeme|totale|class/.test(x)) { const p = avecUnite(x, '%').filter(n => n >= 20 && n <= 90); if (p.length) pose('rendement', p[0], i); }
      }
      // SFP de la centrale : SFPv (EN 16798-3) d'abord ; jamais le SFP interne ni les limites de l'écoconception ; les années
      // (« GEG 2020 ») et numéros de norme ne sont pas des valeurs ; « 1.234 W/m3/s » : point séparateur de milliers
      if (/\bsfpv?\b|puissance specifique/.test(x) && !/interne|sfpint|\bint\b|limite|consigne|classe|class\b|page/.test(x) && S !== 'erp') {
        const y = x.replace(/\ben\s*\d{3,5}(?:-\d)?/g, ' ').replace(/\b(?:19|20)\d{2}\b/g, ' ').replace(/\(filtre[^)]*\)/g, ' ');
        const m = new RegExp(`${N}\\s*(kw|w)\\s*\\/\\s*\\(?\\s*m3\\/(s|h)`).exec(y) || new RegExp(`\\[(kw|w)\\s*\\/\\s*\\(?\\s*m3\\/(s|h)\\)?\\]\\s*${N}`).exec(y) || new RegExp(`\\bsfpv?\\b[^0-9]{0,20}${N}`).exec(y);
        if (m) {
          const [n, u, t] = m.length === 4 && /^(?:kw|w)$/.test(m[1]) ? [nb(m[3]), m[1], m[2]] : [nb(m[1]), m[2], m[3]];
          // W/(m³/h) × 3 600 ; kW/(m³/s) × 1 000 ; « 1.234 W/(m³/s) » (moins de 10) : milliers
          const val = t === 'h' ? n * 3600 * (u === 'kw' ? 1000 : 1) : n * (u === 'kw' || n < 10 ? 1000 : 1);
          pose('SFP', val, i, 100, 10000, /sfpv|16798/.test(x) ? 3 : /\bsfp\b/.test(x) ? 2 : 1);
        }
      }
      // Puissance acoustique côté gaine : soufflage (refoulement), reprise ; le niveau rayonné par le caisson en dernier recours
      if (/puissance acoustique|puissance sonore|\blw\b|\blwa?\d?\b|sound power/.test(x) || /^(?:soufflage|refoulement|sortie|discharge)\b.*db\s*\(?a/.test(x)) {
        const ray = /caisson|rayonn|a cote|casing|breakout|lwa?2\b/.test(x) ? -1 : /soufflage|sortie|refoulement|discharge|lwa?4\b/.test(x) ? 2 : 0;
        if (/^(?:soufflage|refoulement|sortie)\b|en sortie|lwa4\b/.test(x)) { const d = avecUnite(x, 'db\\s*\\(?a\\)?|dba'); if (d.length) pose('LwS', d[d.length > 1 && /lwa4/.test(x) ? d.length - 1 : 0], i, 30, 120, 3); }
        else if (!/^(?:aspiration|entree)\b|en entree|lwa?3\b/.test(x) || !simpleFlux) paire(i, x, 'LwS', 'LwR', 'db\\s*\\(?a\\)?|dba|db', 30, 120, ray);
      }
      // Températures de soufflage hiver / été
      if (/temperature (?:de )?souffl|soufflage.*°c/.test(x)) {
        const t = avecUnite(x, '°\\s*c').filter(n => n >= 5 && n <= 45);
        if (t.length && /hiver|winter|chaud/.test(x)) pose('TsH', t[0], i); else if (t.length && /ete|summer|froid/.test(x)) pose('TsE', t[0], i);
      }
      // Encombrement et poids (manutention) : poids total, ou somme des caissons (« ca. 500 kg » …) d'un plan
      if (/poids (?:total|au transport|en service)|^poids\s*:|, poids\s*:/.test(x)) { const m = /(\d{1,2}(?: \d{3})+|\d+(?:[.,]\d+)?)\s*kg/.exec(x.slice(x.search(/poids/))); if (m) pose('poids', nb(m[1]), i, 10, 100000, 1); }
      { const ca = [...x.matchAll(/\bca\.?\s*(\d+(?:[.,]\d+)?)\s*kg/g)].map(m => nb(m[1])); if (ca.length >= 2) pose('poids', ca.reduce((a, b) => a + b, 0), i, 10, 100000, 0); }
      [['longueur', /longueur\s*:?\s*(\d{1,2}(?: \d{3})+|\d{3,5})\s*mm/], ['largeur', /largeur\s*:?\s*(\d{1,2}(?: \d{3})+|\d{3,5})\s*mm/], ['hauteur', /hauteur\s*:?\s*(\d{1,2}(?: \d{3})+|\d{3,5})\s*mm/]].forEach(([k, re]) => { if (/^longueur :|dimensions/.test(x) || /longueur :.*largeur/.test(x)) { const m = re.exec(x); if (m) pose(k, nb(m[1]), i, 300, 30000); } });
      if (S === 'humid' && /puissance humidification|charge d'humidification/.test(x)) { const kg = avecUnite(x, 'kg\\s*\\/\\s*h'); if (kg.length) pose('mHum', kg[0], i, 0.1, 5000); }
    });
    // Composants à plusieurs sections : batteries chaudes en série (puissances et pertes de charge côté air additionnées),
    // filtres additionnés par côté (préfiltre + filtre d'air neuf)
    const somme = (k, cle, filtre = () => true) => {
      const l = parSec.filter(s => s.cumul[cle] && filtre(s)).map(s => s.cumul[cle]);
      if (!l.length) return;
      const t = l.reduce((a, c) => a + c.val, 0);
      if (v[k] === undefined || (prio[k] ?? 0) < 2) { v[k] = Math.round(t * 100) / 100; src[k] = l.length > 1 ? `${l.map(c => String(Math.round(c.val * 100) / 100).replace('.', ',')).join(' + ')} (${l.length} composants) : ${L[l[0].i].trim().slice(0, 90)}` : L[l[0].i].trim().slice(0, 140); prio[k] = 2; }
    };
    somme('PchBC', 'PchBC'); somme('dpBC', 'dpBC'); somme('PfrBF', 'PfrBF'); somme('dpBF', 'dpBF');
    { const l = parSec.filter(s => s.cumul.dpEauBC).map(s => s.cumul.dpEauBC); if (l.length && v.dpEauBC === undefined) { const m = l.reduce((a, c) => (c.val > a.val ? c : a)); v.dpEauBC = m.val; src.dpEauBC = L[m.i].trim().slice(0, 140); } }
    const coteFiltre = s => s.cote || (s.lignes || []).reduce((c, x) => c || (/(?:^|[^a-z])(?:eta|eha|rae)(?:[^a-z]|$)|air extrait|reprise|air vicie|extraction/.test(x) && !/maintenance/.test(x) ? 'R' : /(?:^|[^a-z])(?:oda|sup)(?:[^a-z]|$)|air neuf/.test(x) ? 'AN' : ''), '') || 'AN';
    somme('dpFiltreAN', 'dpFiltre', s => simpleFlux || coteFiltre(s) === 'AN'); if (!simpleFlux) somme('dpFiltreR', 'dpFiltre', s => coteFiltre(s) === 'R');
    // Récupérateur : d'après les lignes qui le décrivent (pas la roue libre du ventilateur, ni le texte générique de l'écoconception :
    // « roue de récupération », « échangeur à plaques » cités comme valeurs de consigne ou taux de fuite)
    const decrit = X.filter((x, i) => !/roue libre|roue a reaction|vitesse de rotation|consigne|taux de fuite|si presence|src -|si src|cf donnees|ventilateur|rotor du moteur|protection anti/.test(x) && !/^(?:erp|vent|moteur)$/.test(secDe[i] || '')).join('\n');
    const ROUE = /rotati|roue|rotary|wheel|regenerat/, PLAQUES = /plaques?|contre-?courant|counter-?flow|plate|flux croises|cross-?flow/, GLYCOL = /boucle|glycol|run-?around/;
    const nomme = (decrit.match(/(?:type de src|type de recuperateur|recuperateur|echangeur|recuperation)[^\n]*/g) || []).join('\n');
    const recup = simpleFlux ? '' : ROUE.test(nomme) ? 'roue' : PLAQUES.test(nomme) ? 'plaques' : GLYCOL.test(nomme) ? 'glycol'
      : ROUE.test(decrit) ? 'roue' : PLAQUES.test(decrit) ? 'plaques' : GLYCOL.test(decrit) && RECUP.test(decrit) ? 'glycol' : '';
    if (recup) v.recup = recup;
    if (simpleFlux) { delete v.dpRecup; delete src.dpRecup; delete v.eta; delete src.eta; }
    // Batteries à eau : change-over (une batterie, eau chaude l'hiver et eau glacée l'été), chaude seule, chaude + froide
    if (parSec.some(s => s.nom === 'co')) v.froid = 'co';
    else if (/sans batterie froide|batterie froide\s*:?\s*(?:non|sans|-)\b|pas d'exigence sur la puissance froide/.test(tout) && v.PfrBF === undefined) v.froid = 'non';
    else if (v.TfAller !== undefined || v.PfrBF !== undefined || v.dpBF !== undefined || parSec.some(s => s.nom === 'bf' || s.nom === 'co') || /batterie froide (?:eau|a eau|eg|a detente)|eau glacee|cooling coil|batt\. froide/.test(tout)) v.froid = 'oui';
    // Humidification : vapeur, ou adiabatique (humidificateur de contact, à ruissellement, évaporatif, pulvérisation)
    if (/humidificat/.test(tout)) v.humid = /vapeur|steam/.test(tout) ? 'vapeur' : /contact|ruissel|adiabat|evapora|pulveris|laveur/.test(tout) ? 'adiabatique' : 'autre';
    // Débit unique : même débit soufflé et repris (centrale double flux équilibrée) ; jamais pour une centrale simple flux
    if (v.Qs !== undefined && v.Qr === undefined && !simpleFlux && /double flux|reprise|extraction|recuper/.test(tout)) { v.Qr = v.Qs; src.Qr = `${src.Qs} (même débit)`; }
    if (simpleFlux) { ['Qr', 'PdispoR', 'PelR', 'LwR', 'dpFiltreR'].forEach(k => { delete v[k]; delete src[k]; }); }
    // Documentation de gamme (« 4 tailles : 05 (500 m³/h) / 10 (1 000 m³/h) … ») : modèles à choisir, pas de débit « premier venu »
    const ligneGamme = L.map(norm).join(' ').match(/(\d+)\s*tailles?\s*:([^.]*(?:\([\d ]+\s*m3\/h\)[^.(]*){2,})/);
    let modeles = [];
    if (ligneGamme) modeles = [...ligneGamme[2].matchAll(/([a-z0-9]{1,6})\s*\(([\d ]+)\s*m3\/h\)/g)].map(m => ({ ref: m[1].toUpperCase(), Qs: nb(m[2]) }));
    // Catalogue ou notice de gamme : les valeurs lues ne sont pas celles d'un modèle (seule la constitution est gardée)
    if (modeles.length >= 2) Object.keys(v).forEach(k => { if (!['recup', 'froid', 'humid'].includes(k)) { delete v[k]; delete src[k]; } });
    // Fabricant et référence (bibliothèque des fiches techniques), contrôlés : ni l'entreprise utilisatrice, ni un organisme,
    // ni un mot générique ; référence : « Type : EX4-F 12x14 » de la fiche quand il y en a un
    let fabricant = '', reference = '';
    try {
      const FT = typeof FichesTech !== 'undefined' ? FichesTech : require('../../../public/js/fiches-tech');
      const a = FT.analyser({ texte: L.join('\n') });
      fabricant = a.fabricant || ''; reference = (a.references || [])[0] || '';
      // Marque en capitales en tête de fiche (« VENTILIA - Fiche de sélection »)
      if (!fabricant) { const m = /^\s*([A-Z][A-Z0-9&.-]{2,30})(?:\s|$)/.exec(L[0] || ''); if (m && !/^(FICHE|CENTRALE|CTA|DOCUMENT|PAGE|NOTICE)$/.test(m[1])) fabricant = m[1]; }
      const t = L.map(l => /^\s*[Tt]ype\s*:\s*\t?\s*([A-Z0-9][A-Za-z0-9.\-/+ ]{2,30}?)(?:\s+-\s+|\t|$)/.exec(l)).find(m => m && /\d/.test(m[1]) && /[A-Za-z]/.test(m[1]));
      if (t) reference = t[1].trim();
      const FE = typeof FicheEquip !== 'undefined' ? FicheEquip : require('./fiche-equipement');
      const id = FE.identifier(L, fabricant, reference); fabricant = id.fabricant; reference = t ? t[1].trim() : id.reference;
    } catch (e) { /* bibliothèque absente : sans fabricant */ }
    if (modeles.length >= 2) reference = '';
    return { valeurs: v, sources: src, fabricant, reference, nb: Object.keys(v).length, ...(modeles.length >= 2 ? { gamme: `${modeles.length} tailles`, modeles } : {}) };
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
    Pmot: ['Moteur de ventilateur : puissance nominale', 'kW'], Imot: ['Moteur de ventilateur : intensité nominale', 'A'], Ibe: ['Batterie électrique : intensité', 'A'], mHum: ['Humidificateur : débit d\'eau évaporée', 'kg/h'],
    poids: ['Poids (manutention)', 'kg'], longueur: ['Longueur', 'mm'], largeur: ['Largeur', 'mm'], hauteur: ['Hauteur', 'mm'],
  };
  // Valeurs de contrôle : comparées au calcul, ou gardées avec la note (protection électrique, manutention), sans remplacer une saisie
  const CONTROLES = ['PdispoS', 'PdispoR', 'PchBC', 'PfrBF', 'PelS', 'PelR', 'SFP', 'dpEauBC', 'dpEauBF', 'Pmot', 'Imot', 'Ibe', 'mHum', 'poids', 'longueur', 'largeur', 'hauteur'];
  // Champ de la note pour chaque valeur lue (null : contrôle seulement)
  function champs(type, valeurs) {
    const out = [];
    const ajoute = (cle, k, val) => out.push({ cle, k, val, libelle: LIBELLES[cle][0], unite: LIBELLES[cle][1] });
    Object.entries(valeurs).forEach(([cle, val]) => {
      if (CONTROLES.includes(cle) || !LIBELLES[cle]) return;
      if (type === 'cta') {
        if (cle === 'LwS' || cle === 'LwR' || cle === 'Pbe') return;
        if (cle === 'humid') { if (val === 'vapeur' || val === 'adiabatique') ajoute(cle, 'humid', val); return; }
        ajoute(cle, cle, val);
      } else if (type === 'aero') {
        const k = { recup: 'recuperateur', froid: 'batFroide', dpFiltreAN: 'dpFiltreS', dpFiltreR: 'dpFiltreR', dpRecup: 'dpRecup', dpBC: 'dpBatC', dpBF: 'dpBatF', rendement: 'rendement', LwS: 'LwFabS', LwR: 'LwFabR' }[cle];
        if (!k) return;
        ajoute(cle, k, cle === 'recup' ? (val === 'glycol' ? 'boucle' : val) : cle === 'froid' && val === 'co' ? 'oui' : val);
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
    // Humidificateur : eau évaporée (adiabatique) ou vapeur produite selon la fiche, face au besoin calculé
    if (Number.isFinite(f.mHum) && Number.isFinite(calc.mHum) && calc.mHum > 0) a(f.mHum >= calc.mHum * 0.95 ? 'ok' : 'attention', `Humidificateur de la fiche : ${fx(f.mHum, 1)} kg/h pour ${fx(calc.mHum, 1)} kg/h calculés${f.mHum >= calc.mHum * 0.95 ? '' : ' : insuffisant (vérifier l\'humidité de consigne, l\'efficacité d\'un humidificateur adiabatique et les conditions d\'hiver)'}.`);
    if (Number.isFinite(f.Qs) && Number.isFinite(calc.Qs) && calc.Qs > 0 && Math.abs(f.Qs - calc.Qs) / calc.Qs > 0.05) a('attention', `Débit de soufflage de la fiche (${fx(f.Qs)} m³/h) différent du débit calculé (${fx(calc.Qs)} m³/h).`);
    return out;
  }
  return { lire, champs, fiche, controles, LIBELLES, norm };
})();
if (typeof module !== 'undefined') module.exports = FicheCta;
