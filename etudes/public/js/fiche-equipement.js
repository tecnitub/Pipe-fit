// Fiche technique d'un équipement autre qu'une CTA (pompe, vase d'expansion, ballon d'ECS, générateur) : caractéristiques
// lues dans le PDF, champs du calcul remplis, et contrôles ajoutés aux résultats du calcul (point de fonctionnement de la
// pompe, volume et pression du vase, volume du ballon, puissance du générateur). Module pur (navigateur, node, tests).
const FicheEquip = (() => {
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘`]/g, "'")
    .replace(/m\s*(?:³|3)\s*\/\s*h/g, 'm3/h').replace(/(\d)\s*m\s*\/\s*h\b/g, '$1 m3/h').replace(/(\d)\s*°?\s*c(?![a-z0-9])/g, '$1 °c').replace(/puissnace/g, 'puissance').replace(/\s+/g, ' ').trim();
  const nb = s => Number(String(s).replace(/[\s  ]/g, '').replace(',', '.'));
  const N = '(\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+(?:[.,]\\d+)?)';
  const apres = (x, cle, unite, fenetre = 60) => { const m = new RegExp(`(?:${cle})[^0-9]{0,${fenetre}}?${N}\\s*(?:${unite})(?![a-z])`).exec(x); return m ? nb(m[1]) : undefined; };
  const TYPES = { reseau: 'pompe', arbo: 'pompe', vase: 'vase', ecs: 'ecs', pid: 'generateur' };

  function lire(lignes) {
    const L = (Array.isArray(lignes) ? lignes : String(lignes || '').split(/\r?\n/)).map(String).filter(l => l.trim()), X = L.map(norm), tout = X.join('\n'), v = {}, src = {};
    const pose = (k, val, i, min, max) => { if (v[k] === undefined && Number.isFinite(val) && val >= min && val <= max) { v[k] = Math.round(val * 1000) / 1000; src[k] = L[i].trim().slice(0, 140); } };
    X.forEach((x, i) => {
      // Pompe : point de fonctionnement (Q et H sur la même ligne), débit et hauteur maximaux, puissance absorbée P1
      const pt = new RegExp(`${N}\\s*m3/h[^0-9]{1,25}${N}\\s*(?:m\\s*ce|mce|m)(?![a-z0-9])`).exec(x);
      if (pt && /point|fonctionnement|duty|nominal|selection|service/.test(x)) { pose('Q', nb(pt[1]), i, 0.05, 5000); pose('H', nb(pt[2]), i, 0.3, 300); }
      if (/max/.test(x)) { pose('Qmax', apres(x, 'debit max\\w*|q ?max', 'm3/h'), i, 0.1, 10000); pose('Hmax', apres(x, 'hmt max\\w*|hauteur max\\w*|h ?max|hauteur manometrique max\\w*', 'm\\s*ce|mce|m'), i, 0.3, 400); }
      if (/debit (?:nominal|de service|au point)/.test(x)) pose('Q', apres(x, 'debit (?:nominal|de service|au point)', 'm3/h'), i, 0.05, 5000);
      if (/(?:hmt|hauteur manometrique|hauteur) (?:nominale|de service|au point)/.test(x)) pose('H', apres(x, '(?:hmt|hauteur manometrique|hauteur) (?:nominale|de service|au point)', 'm\\s*ce|mce|m'), i, 0.3, 300);
      if (/\bp1\b|puissance absorbee|puissance electrique/.test(x)) { const w = apres(x, '\\bp1\\b|puissance absorbee|puissance electrique', 'w'), kw = apres(x, '\\bp1\\b|puissance absorbee|puissance electrique', 'kw'); pose('P1', Number.isFinite(kw) ? kw * 1000 : w, i, 5, 500000); }
      if (/rendement|efficacite|\beta\b/.test(x) && /pompe|hydraulique|global|moteur|\beta\b/.test(x)) pose('rendement', apres(x, 'rendement|efficacite|\\beta\\b', '%'), i, 10, 95);
      // Vase, ballon : volume, pression de gonflage (prégonflage usine), pression maximale de service
      if (/volume|capacite|contenance|litres?\b|\d\s*l\b/.test(x) && !/inox|aisi|acier|stainless/.test(x)) { const l = apres(x, 'volume(?: nominal| utile| total)?|capacite|contenance', 'litres?|l\\b') ?? (/(\d{2,5})\s*(?:litres?|l)\b(?!\s*\/|['’])/.exec(x) ? nb(/(\d{2,5})\s*(?:litres?|l)\b(?!\s*\/|['’])/.exec(x)[1]) : undefined); pose('V', l, i, 2, 100000); }
      if (/gonflage|precharge|pre-?pression|pression initiale/.test(x)) pose('p0', apres(x, 'gonflage|precharge|pre-?pression|pression initiale', 'bar'), i, 0.2, 10);
      if (/pression (?:maxi|max|maximale)|pression de service max|\bpn ?\d|pms/.test(x)) { const pn = /\bpn ?(\d{1,2})\b/.exec(x); pose('pmax', apres(x, 'pression (?:maxi|max|maximale)(?: de service| admissible)?|pression de service max\\w*|pms', 'bar') ?? (pn ? nb(pn[1]) : undefined), i, 1, 100); }
      // Générateur, échangeur : puissance nominale (chaud, froid)
      if (/puissance|output|capacity/.test(x) && !/absorbee|electrique|acoustique|sonore|\bp1\b/.test(x)) {
        const kw = apres(x, 'puissance(?: calorifique| thermique| utile| nominale| de chauffage| chaud)?|output|capacity', 'kw');
        if (/froid|frigorifique|refroidissement|cooling/.test(x)) pose('Pfr', kw, i, 0.5, 20000); else pose('P', kw, i, 0.5, 20000);
      }
      // Perte de charge côté eau (générateur, échangeur) : kPa, ou mCE / mbar convertis
      if (/perte de charge|pertes de charge|\bpdc\b|delta ?p|chute de pression/.test(x) && !/air|gaine|filtre/.test(x)) {
        const k = apres(x, 'perte(?:s)? de charge(?: cote eau| hydraulique| eau| evaporateur| condenseur| primaire| secondaire)?|\\bpdc\\b|delta ?p|chute de pression', 'kpa'), mb = k === undefined ? apres(x, 'perte(?:s)? de charge[^0-9]{0,30}|\\bpdc\\b', 'mbar') : undefined, m = k === undefined && mb === undefined ? apres(x, 'perte(?:s)? de charge[^0-9]{0,30}|\\bpdc\\b', 'm\\s*ce|mce') : undefined;
        pose('dpEau', k !== undefined ? k : mb !== undefined ? mb / 10 : m !== undefined ? m * 9.81 : undefined, i, 0.1, 500);
      }
      if (/scop|cop|rendement (?:utile|saisonnier|pci|pcs)|etas/.test(x) && !/pompe/.test(x)) pose('rendGen', apres(x, 'rendement (?:utile|saisonnier|pci|pcs)|etas', '%'), i, 30, 115);
    });
    // Débit et hauteur sans « point de fonctionnement » : lignes « débit … m3/h », « HMT … m »
    if (v.Q === undefined && v.Qmax === undefined) X.forEach((x, i) => { if (/debit/.test(x) && !/air|l\/s|eau|fluide|evap|cond|mini|maxi/.test(x)) pose('Q', apres(x, 'debit', 'm3/h'), i, 0.05, 5000); });
    if (v.H === undefined && v.Hmax === undefined) X.forEach((x, i) => { if (/hmt|hauteur manometrique/.test(x)) pose('H', apres(x, 'hmt|hauteur manometrique', 'm\\s*ce|mce|m'), i, 0.3, 300); });
    groupe(L, X, v, src);
    // Vase : le volume retenu (« vase principal 500 L ») l'emporte sur le volume minimal calculé par la note de sélection
    X.forEach((x, i) => { if (/\bvase\b/.test(x) && !/minimum|mini\b|calcul|contrepression|san\b/.test(x)) { const m = /(\d{2,5})\s*(?:litres?|l)\b(?!['’])/.exec(x); if (m && (v.V === undefined || /minimum|calcul/.test(norm(src.V || '')))) { v.V = nb(m[1]); src.V = L[i].trim().slice(0, 140); } } });
    if (/note de selection|selection systeme expansion|volume minimum/.test(tout)) X.forEach((x, i) => { if (/volume minimum|volume d'expansion calcule/.test(x)) { const m = /(\d{2,6})\s*(?:litres?|l)\b/.exec(x) || /\(l\)\s*(\d{2,6})/.exec(x); if (m) pose(/minimum/.test(x) ? 'Vmin' : 'Ve', nb(m[1]), i, 1, 100000); } });
    if (/alimentation|tension/.test(tout)) X.forEach((x, i) => { if (v.tension === undefined && /alimentation|tension/.test(x)) { const t = /400\s*v|3\s*x\s*400|400\s*-\s*3|3\s*ph|\btri/.test(x) ? 'tri' : /230\s*v|1\s*ph|mono/.test(x) ? 'mono' : ''; if (t) { v.tension = t; src.tension = L[i].trim().slice(0, 140); } } });
    // Documentation de gamme (plusieurs modèles) : liste des modèles, et aucune valeur « première venue »
    const gm = gammeDe(L, X);
    if (gm) gm.cles.forEach(k => { delete v[k]; delete src[k]; });
    const id = identifier(L);
    return { valeurs: v, sources: src, fabricant: id.fabricant, reference: gm ? '' : id.reference, nb: Object.keys(v).length, tout, ...(gm ? { gamme: gm.titre, modeles: gm.modeles } : {}) };
  }

  // ---- Pompes à chaleur, groupes froids : tableaux à deux colonnes (froid | chauffage, ou évaporateur | condenseur) ----
  // « Puissance frigorifique <tab> kW <tab> 500 <tab> - » (unité puis valeurs), « Puissance nette 400 kW 300 kW » (valeur puis
  // unité), « EER/COP net 3,2 EER (kW/kW) 4,1 COP (kW/kW) », valeur décalée d'une ligne dans les blocs centrés.
  const NV = '(-?\\d+(?:[.,]\\d+)?|-)';
  function serie(x, u) {
    // Valeur puis unité (« 405 kW 525 kW ») d'abord, sinon unité puis valeurs (« kW 600 - »)
    const b = [...x.matchAll(new RegExp(`(?<![a-z0-9.,-])${N}\\s*(?:${u})(?![a-z0-9/])`, 'g'))].map(m => nb(m[1]));
    if (b.length) return b;
    const a = new RegExp(`(?:^|\\s)(?:${u})\\s+((?:${NV}(?:\\s+|$)){1,4})`).exec(x);
    return a ? a[1].trim().split(/\s+/).map(t => (t === '-' ? NaN : nb(t))) : [];
  }
  // Valeurs en fin de ligne (unité puis valeurs) sur la ligne voisine : libellé seul sur sa ligne
  const voisine = (X, i, u) => { for (const j of [i + 1, i - 1]) { if (!X[j]) continue; const a = new RegExp(`(?:^|\\s)(?:${u})\\s+((?:${NV}\\s*){1,3})$`).exec(X[j]); if (a) return a[1].trim().split(/\s+/).map(t => (t === '-' ? NaN : nb(t))); } return []; };
  const fini = a => a.filter(Number.isFinite);
  function groupe(L, X, v, src) {
    const tout = X.join('\n');
    if (!/frigorifique|refroidisseur|groupe (?:froid|d'eau glacee)|pompe a chaleur|\bpac\b|chiller|heat pump|\beer\b|evap|condenseur/.test(tout)) return;
    // Colonnes : évaporateur | condenseur (groupe à condensation par eau), sinon froid | chauffage
    const ec = X.some(x => /^(?:evap\.?|evaporateur) (?:cond\.?|condenseur)$/.test(x));
    const fc = !ec && X.some(x => /\bfroid\b.*\bchauffage\b|mode froid/.test(x));
    const prio = {};
    const met = (k, val, i, min, max, p = 1) => { if (!Number.isFinite(val) || val < min || val > max || (prio[k] || 0) >= p) return; v[k] = Math.round(val * 1000) / 1000; src[k] = L[i].trim().slice(0, 140); prio[k] = p; };
    X.forEach((x, i) => {
      if (/^\(|selon|according|conforme|norme/.test(x) && !/\d\s*(?:kw|kg|a)\b/.test(x)) return;
      const net = /\bnet(?:te)?\b/.test(x) ? 3 : /\bbrut(?:e)?\b/.test(x) ? 2 : 1;
      // Puissances utiles
      if (/puissance (?:frigorifique|froid|nette|brute|utile)|capacite (?:frigorifique|brute|nette)|cooling capacity/.test(x) && !/absorb|abs\.|max|min|electrique|acoustique|sonore|recuper/.test(x)) {
        let s = serie(x, 'kw'); if (!s.length) s = voisine(X, i, 'kw');
        if (s.length) {
          if (/frigorifique|froid|cooling/.test(x) || ec || fc) met('Pfr', s[0], i, 0.5, 20000, net);
          if (ec && s.length >= 2) met('Pcond', s[1], i, 0.5, 30000, net); else if ((fc || /nette|brute/.test(x)) && s.length >= 2) met('P', s[1], i, 0.5, 20000, net + 1);
        }
      }
      if (/puissance calorifique|capacite calorifique|heating capacity|puissance (?:de )?chauffage/.test(x) && !/absorb|max|min|electrique/.test(x)) {
        let s = fini(serie(x, 'kw')); if (!s.length) s = fini(voisine(X, i, 'kw'));
        if (s.length) met('P', s[s.length - 1], i, 0.5, 20000, 4);
      }
      // Puissance électrique absorbée (W dans la fiche, comme P1 des pompes)
      if (/puissance absorbee de l'unite|p\. ?abs\.? (?:brute|nette)|puissance absorbee (?:brute|nette|totale)|puissance electrique absorbee|power input/.test(x) && !/ventilateur|max/.test(x)) {
        const s = fini(serie(x, 'kw'));
        if (s.length) { met('P1', s[0] * 1000, i, 100, 1e7, net + 1); if ((fc) && s.length >= 2) met('P1ch', s[1] * 1000, i, 100, 1e7, net + 1); }
      }
      // EER, COP
      const e1 = new RegExp(`${N}\\s*eer\\b`).exec(x), c1 = new RegExp(`${N}\\s*cop\\b`).exec(x);
      if (e1) met('EER', nb(e1[1]), i, 1, 12, net + 2); if (c1) met('COP', nb(c1[1]), i, 1, 12, net + 2);
      if (/\(eer\)|\beer\b/.test(x) && !e1 && !/seer|ηs|etas|scop/.test(x)) { const s = fini(serie(x, 'kw/kw')); const t = s.length ? s : fini(voisine(X, i, 'kw/kw')); if (t.length) met('EER', t[0], i, 1, 12, 1); }
      if (/\(cop\)|\bcop\b/.test(x) && !c1 && !/scop/.test(x)) { const s = serie(x, 'kw/kw'); const t = s.length ? s : voisine(X, i, 'kw/kw'); const f = fini(t); if (f.length) met('COP', f[f.length - 1], i, 1, 12, 1); }
      // Fluide frigorigène, charge, équivalent CO2
      if (/refrigerant|frigorigene|charge (?:usine|complete)/.test(x) && !/huile|detection|fuite|circuits?$|nombre|nb de/.test(x) && v.fluide === undefined) {
        const f = FA().fluide(L[i]); if (f) { v.fluide = f; src.fluide = L[i].trim().slice(0, 140); }
      }
      if (/masse de refrigerant|charge (?:en )?(?:refrigerant|fluide|frigorigene)|refrigerant charge/.test(x) && !/huile/.test(x)) {
        const s = fini(serie(x, 'kg')); if (s.length) met('charge', /circuit/.test(x) && s.length >= 2 ? s.reduce((a, b) => a + b, 0) : s[0], i, 0.1, 5000);
      }
      if (/equivalent co2|teq ?co2|t ?eq\.? ?co2/.test(x)) { const s = fini(serie(x, 'tonnes?|t')); if (s.length) met('teqCO2', s[0], i, 0.01, 100000); }
      // Eau : débits, pertes de charge, régimes (colonne 1 : évaporateur / froid ; colonne 2 : condenseur / chauffage)
      if (/debit (?:d'eau|de fluide|evap|d'eau glacee)|water flow/.test(x) && !/mini|maxi|air/.test(x)) {
        const s = serie(x, 'l/s|lis'), m3 = s.length ? s.map(q => q * 3.6) : serie(x, 'm3/h');
        if (m3.length) { met('Qeau', m3[0], i, 0.1, 10000); if (ec && m3.length >= 2) met('Qcond', m3[1], i, 0.1, 10000); }
      }
      if (/pertes? de charges? (?:fluide|totale|evap|eau|cote eau)/.test(x) && !/air/.test(x)) {
        const s = serie(x, 'kpa'); if (s.length) { met('dpEau', s[0], i, 0.1, 500, 2); if (ec && s.length >= 2) met('dpCond', s[1], i, 0.1, 500); }
      }
      const reg = /temp(?:erature)?\.? (?:d'|de )?(?:a l')?(entree|sortie)/.exec(x);
      if (reg && /fluide|evap|eau|^temperature (?:de |a l')|^temp\. (?:entree|sortie)/.test(x) && !/air|bulbe|refrig|saturee|ambiante|fumee/.test(x)) {
        const s = serie(x, '°\\s*c|c'); if (s.length) {
          const ent = reg[1] === 'entree';
          if (Number.isFinite(s[0])) met(ent ? 'TfRet' : 'TfDep', s[0], i, -15, 30);
          if (s.length >= 2 && Number.isFinite(s[1])) met(ec ? (ent ? 'TcondE' : 'TcondS') : (ent ? 'TcRet' : 'TcDep'), s[1], i, 10, 90);
        }
      }
      // Électricité, encombrement, acoustique
      if (/intensite (?:max|maxi|maximale)|courant (?:max|maxi|maximal)|max(?:imum)? (?:current|amps)/.test(x)) { const s = fini(serie(x, 'a')); if (s.length) met('Imax', s[0], i, 0.1, 5000); }
      if (/intensite de demarrage|courant de demarrage/.test(x)) { const s = fini(serie(x, 'a')); if (s.length) met('Idem', s[0], i, 0.1, 10000); }
      if (/^poids|poids (?:en ordre de marche|a l'utilisation|en service|en fonctionnement)/.test(x)) { const s = fini(serie(x, 'kg')); if (s.length) met('poids', s[0], i, 1, 100000, /marche|utilisation|service|fonctionnement/.test(x) ? 2 : 1); }
      [['longueur', /^longueur\b/], ['largeur', /^largeur\b/], ['hauteur', /^hauteur\b/]].forEach(([k, re]) => { if (re.test(x)) { const s = fini(serie(x, 'mm')); if (s.length) met(k, s[0], i, 100, 30000); } });
      if (/puissance (?:acoustique|sonore)|puissnace sonore|\blwa?\b/.test(x) && !/pression|rayonn|a \d+ ?m\b|spectre|spectrum|octave/.test(x)) { const s = fini(serie(x, 'db\\s*\\(?a\\)?|dba')); if (s.length) met('Lw', s[0], i, 40, 130); }
      if (/\btension\b|alimentation electrique|v-ph-hz/.test(x) && v.tension === undefined) { const t = /400\s*-\s*3|400\s*v.{0,4}3\s*ph|3\s*x\s*400|400\s*v\s*tri|3\s*ph/.test(x) ? 'tri' : /230\s*v|1\s*ph|mono/.test(x) ? 'mono' : ''; if (t) { v.tension = t; src.tension = L[i].trim().slice(0, 140); } }
    });
    // Groupe à condensation par eau : la puissance « brute / nette » de la colonne évaporateur est la puissance froid ;
    // un groupe n'a pas de volume (le « 12 L » d'une ligne de codes option n'en est pas un)
    if (ec && v.P !== undefined && /puissance (?:brute|nette)/.test(norm(src.P || ''))) { delete v.P; delete src.P; }
    if (v.V !== undefined && !/contenance|volume d'eau|capacite en eau/.test(norm(src.V || ''))) { delete v.V; delete src.V; }
  }
  const FA = () => (typeof FicheAnnexes !== 'undefined' ? FicheAnnexes : require('./fiche-annexes'));

  // ---- Documentation de gamme : plusieurs modèles dans un même document ----
  // Tableau horizontal (ligne d'en-tête des modèles, puis ligne de puissances en kW) ou vertical (une ligne par capacité) ;
  // renvoie { titre, modeles: [{ ref, P | V }], cles } ou null quand la fiche décrit un seul modèle
  function gammeDe(L, X) {
    const tete = X.slice(0, 12).join(' ');
    const annonce = /(\d+) (?:modeles|tailles|versions)\b|gamme\b[^.]{0,40}?\bde [\d ]+ a [\d ]+|\bde [\d ]{3,} a [\d ]{3,}(?:kw|l\b|litres)/.exec(tete);
    // Horizontal : « UNITÉS 10 11 … 14 » puis « max kW 500 … 2500 » à proximité d'une ligne « puissance »
    for (let i = 0; i < L.length; i++) {
      const c = L[i].split('\t').map(t => t.trim()).filter(Boolean);
      const mods = c.slice(1).flatMap(t => t.split(/\s+/)).filter(t => /^[A-Z]{0,5}[\s-]?\d{1,5}[A-Z]{0,3}$/i.test(t));
      if (mods.length < 4 || mods.length !== c.slice(1).flatMap(t => t.split(/\s+/)).length || !/unites?|modeles?|types?|tailles?|references?|designations?/i.test(sansAcc(c[0]))) continue;
      for (let j = i + 1; j < Math.min(L.length, i + 12); j++) {
        if (!/(?:^|\s)kw\s/.test(X[j])) continue;
        const vals = (X[j].split(/(?:^|\s)kw\s/)[1] || '').trim().split(/\s+/).map(nb).filter(Number.isFinite);
        if (vals.length !== mods.length || !/puissance/.test(X.slice(Math.max(0, j - 2), j + 2).join(' '))) continue;
        const pref = (() => { const m = new RegExp(`\\b([A-Z]{2,6})\\s?${mods[0]}\\b`).exec(L.join('\n')); return m ? `${m[1]} ` : ''; })();
        return { titre: (annonce && annonce[0]) || `${mods.length} modèles`, cle: 'P', cles: ['P', 'Pfr'], modeles: mods.map((m, k) => ({ ref: `${pref}${m}`.trim(), P: vals[k] })) };
      }
    }
    // Vertical : lignes qui commencent par une capacité croissante (« 200 », « 1 000 »), suivies de cotes
    const caps = [];
    L.forEach(l => { const c = l.split('\t').map(t => t.trim()), m = /^(\d{1,2}(?: \d{3})+|\d{2,5})[A-Z]?$/.exec(c[0]); if (m && c.slice(1).filter(t => /^[\d\s.,/]+$/.test(t)).length >= 3) { const n = nb(m[1]); if (n >= 10 && !caps.includes(n)) caps.push(n); } });
    const croissant = caps.filter((n, k) => k === 0 || n > caps[k - 1]);
    if (croissant.length >= 4 && /capacite|volume|litres/.test(X.join(' '))) return { titre: (annonce && annonce[0]) || `${croissant.length} capacités`, cle: 'V', cles: ['V'], modeles: croissant.map(n => ({ ref: `${n} L`, V: n })) };
    return annonce && Number(annonce[1] || 0) >= 2 ? { titre: annonce[0], cle: '', cles: ['P', 'V', 'Pfr'], modeles: [] } : null;
  }
  // Modèle choisi dans une documentation de gamme : ses valeurs remplacent celles de la fiche
  function choisir(lu, k) {
    const m = ((lu && lu.modeles) || [])[k]; if (!m) return lu;
    const { ref, ...val } = m;
    return { ...lu, reference: ref || lu.reference, valeurs: { ...(lu.valeurs || {}), ...val }, modele: ref };
  }

  // ---- Fabricant et référence ----
  // Jamais l'entreprise utilisatrice (émettrice ou destinataire du document), un organisme de certification, un mot
  // générique (« NOTICE », « CTA »), un numéro de document ; colonne « Fabricant » du document d'abord, puis site internet,
  // marque déposée (« Marque® »), enfin bibliothèque des fiches techniques
  const sansAcc = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const EMETTEURS = /tecnitub/i;
  const PAS_FAB = /eurovent|certita|certification|afnor|\bt[uü]v\b|cstb|veritas|socotec|apave|dekra|ahri|ashrae|qualitel|ecodesign|^(?:notice|fiches?|documents?|documentation|catalogue|tarifs?|pages?|cta|pac|ecs|vmc|oda|eta|sup|eha|ce|nf|projet|offre|devis|job|proposition|rapport|note|selection|technique|gamme|caracteristiques|donnees|descriptif|plan|schema|client|affaire|select|assist|version|www|http|https)$/i;
  const nettoyerFab = f => String(f || '').replace(/[®™©]/g, '').replace(/\s+(?:gmbh|s\.?a\.?s\.?|sarl|s\.?a\.?|ag|ltd|inc|s\.?p\.?a\.?|b\.?v\.?|srl|co\.? ?kg|kg|france)\b\.?/gi, '').replace(/\s{2,}/g, ' ').trim();
  const fabValide = f => { const x = nettoyerFab(f); return x.length >= 2 && x.length <= 40 && /[A-Za-z]{2}/.test(x) && !EMETTEURS.test(x) && !PAS_FAB.test(sansAcc(x)) && !/\d{4,}|@|https?:|\btel\b|\bfax\b/i.test(x); };
  const DOMAINES_EXCLUS = /eurovent|certita|ahridirectory|ashrae|afnor|cstb|legifrance|europa|ecodesign|tecnitub|google|microsoft|adobe/i;
  function identifier(lignes, fab0 = '', ref0 = '') {
    const L = (Array.isArray(lignes) ? lignes : String(lignes || '').split(/\r?\n/)).map(String), tx = L.join('\n');
    let fabricant = '';
    // Colonne « Fabricant » (en-tête seul en fin de ligne, nom dans la même colonne des lignes suivantes) ou « Fabricant : X »
    for (let i = 0; i < Math.min(L.length, 120) && !fabricant; i++) {
      const c = L[i].split('\t'), k = c.findIndex(x => /^\s*(?:fabricant|manufacturer|constructeur|hersteller)\s*:?\s*$/i.test(x));
      if (k < 0) continue;
      if (k < c.length - 1 && fabValide(c[k + 1])) { fabricant = nettoyerFab(c[k + 1]); break; }
      for (let j = i + 1; j <= i + 3 && j < L.length; j++) { const d = L[j].split('\t'); const y = d[d.length - 1]; if (k >= 1 && d.length >= 2 && fabValide(y) && !/\d{3,}|,/.test(y)) { fabricant = nettoyerFab(y); break; } }
    }
    // Site internet : « www.marque.com » d'abord, adresses sans « www » en dernier recours
    const domaine = re => { const d = (tx.match(re) || []).map(u => /([a-z][a-z0-9-]{2,30})\.(?:com|fr|de|it|eu|net|es|be|ch|at|nl|co\.uk|org)\b/i.exec(u.replace(/^(?:www\.|https?:\/\/)/i, '').split('.').slice(-2).join('.'))).filter(Boolean).map(x => x[1]).find(x => !DOMAINES_EXCLUS.test(x)); return d ? d.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()) : ''; };
    if (!fabricant) fabricant = domaine(/www\.(?:[a-z0-9-]+\.)*[a-z][a-z0-9-]{2,30}\.(?:com|fr|de|it|eu|net|es|be|ch|at|nl|co\.uk|org)\b/gi);
    if (!fabricant) { const m = /©\s*(?:\d{4}\s+)?([A-Z][A-Za-z-]{2,20})/.exec(tx); if (m && fabValide(m[1])) fabricant = m[1]; }
    if (!fabricant) {
      // Marque déposée : la plus citée (« Marque® », ou « Marque Produit® » : le mot qui précède le produit)
      const n = {};
      for (const m of tx.matchAll(/(?:\b([A-Z][A-Za-z]{2,20}) )?\b([A-Z][A-Za-z0-9-]{1,20}) ?[®™]/g)) { const c = m[1] && !/^(?:Les?|La|Une?|Des|Du|De|The|Avec|Pour|Données|Modèle|Gamme|Logiciel|Version)$/.test(m[1]) ? m[1] : m[2]; if (fabValide(c)) n[c] = (n[c] || 0) + 1; }
      const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0]; if (best && best[1] >= 2) fabricant = best[0];
    }
    if (!fabricant) fabricant = domaine(/https?:\/\/(?:[a-z0-9-]+\.)*[a-z][a-z0-9-]{2,30}\.(?:com|fr|de|it|eu|net|es|be|ch|at|nl|co\.uk|org)\b/gi);
    if (!fabricant && fabValide(fab0)) fabricant = nettoyerFab(fab0);
    let reference = ref0;
    try {
      const FT = typeof FichesTech !== 'undefined' ? FichesTech : require('../../../public/js/fiches-tech');
      const a = FT.analyser({ texte: tx });
      if (!fabricant && fabValide(a.fabricant)) fabricant = nettoyerFab(a.fabricant);
      const refs = (a.references || []).filter(r => !EMETTEURS.test(r) && (!fabricant || FT.cle(r) !== FT.cle(fabricant)));
      // Référence proposée par le lecteur gardée si elle a la forme d'une référence (ni norme, ni n° de document…)
      if (!reference || !FT.estReference(reference) || EMETTEURS.test(reference)) reference = refs[0] || '';
    } catch (e) { /* sans bibliothèque */ }
    return { fabricant, reference };
  }

  const LIBELLES = { Q: ['Débit au point de fonctionnement', 'm³/h'], H: ['Hauteur au point de fonctionnement', 'mCE'], Qmax: ['Débit maximal', 'm³/h'], Hmax: ['Hauteur maximale', 'mCE'],
    P1: ['Puissance absorbée P1', 'W'], rendement: ['Rendement de la pompe', '%'], V: ['Volume', 'L'], p0: ['Pression de gonflage (usine)', 'bar'], pmax: ['Pression maximale de service', 'bar'],
    P: ['Puissance', 'kW'], Pfr: ['Puissance froid', 'kW'], rendGen: ['Rendement du générateur', '%'], dpEau: ['Perte de charge côté eau', 'kPa'],
    // Pompes à chaleur, groupes froids (contrôles, registre ; fluide et charge repris par les calculs de fluides frigorigènes)
    EER: ['EER', ''], COP: ['COP', ''], fluide: ['Fluide frigorigène', ''], charge: ['Charge en fluide', 'kg'], teqCO2: ['Équivalent CO₂', 't'], P1ch: ['Puissance absorbée en chauffage', 'W'],
    Pcond: ['Puissance au condenseur', 'kW'], Qeau: ['Débit d\'eau (évaporateur)', 'm³/h'], Qcond: ['Débit d\'eau (condenseur)', 'm³/h'], dpCond: ['Perte de charge condenseur', 'kPa'],
    TfDep: ['Eau glacée : départ', '°C'], TfRet: ['Eau glacée : retour', '°C'], TcDep: ['Eau chaude : départ', '°C'], TcRet: ['Eau chaude : retour', '°C'], TcondE: ['Condenseur : entrée', '°C'], TcondS: ['Condenseur : sortie', '°C'],
    Imax: ['Intensité maximale', 'A'], Idem: ['Intensité de démarrage', 'A'], tension: ['Tension', ''], poids: ['Poids', 'kg'], longueur: ['Longueur', 'mm'], largeur: ['Largeur', 'mm'], hauteur: ['Hauteur', 'mm'], Lw: ['Puissance acoustique', 'dB(A)'],
    Vmin: ['Volume minimal (note de sélection)', 'L'], Ve: ['Volume d\'expansion calculé', 'L'] };
  // Champs du calcul remplis par la fiche
  function champs(type, v) {
    const out = [], a = (k, cle, val) => { if (val !== undefined && Number.isFinite(val)) out.push({ k, cle, val: Math.round(val * 100) / 100, libelle: LIBELLES[cle][0], unite: LIBELLES[cle][1] }); };
    const t = TYPES[type];
    if (t === 'pompe') {
      // Rendement : donné par la fiche, sinon ρ·g·Q·H / P1 au point de fonctionnement
      const eta = v.rendement !== undefined ? v.rendement : v.Q && v.H && v.P1 ? Math.min(90, 1000 * 9.81 * v.Q / 3600 * v.H / v.P1 * 100) : undefined;
      if (eta !== undefined) out.push({ k: 'rendement', cle: 'rendement', val: Math.round(eta), libelle: v.rendement !== undefined ? 'Rendement de la pompe' : 'Rendement de la pompe (ρ·g·Q·H / P1)', unite: '%' });
    }
    if (t === 'ecs') a('P', 'P', v.P);
    if (t === 'generateur') { a('Pgen', 'P', v.P); a('PgenF', 'Pfr', v.Pfr); a('dpGen', 'dpEau', v.dpEau); if (v.P1 !== undefined) out.push({ k: 'PelecGen', cle: 'P1', val: Math.round(v.P1 / 10) / 100, libelle: 'Puissance électrique absorbée', unite: 'kW' }); }
    return out;
  }
  // Fiche gardée avec le calcul (contrôles)
  const fiche = (r, nom) => ({ nom: String(nom || '').slice(0, 120), fabricant: r.fabricant, reference: r.reference, ...r.valeurs });
  const fx = (x, d = 1) => (Number.isFinite(x) ? x.toLocaleString('fr-FR', { maximumFractionDigits: d }) : '—');
  // Contrôles ajoutés aux résultats du calcul ; v = valeurs du calcul, e = entrées
  function controles(type, f, v, e = {}) {
    if (!f || !v) return [];
    const out = [], al = (niveau, texte) => out.push({ niveau, texte }), nom = [f.fabricant, f.reference].filter(Boolean).join(' ') || 'fiche technique', t = TYPES[type];
    if (t === 'pompe') {
      const Q = type === 'arbo' ? v.Qp : v.Qpompe, H = v.HMT;
      if (Number.isFinite(f.Q) && Number.isFinite(f.H)) {
        const ok = f.Q >= Q * 0.95 && f.H >= H * 0.95;
        al(ok ? 'ok' : 'erreur', `Pompe ${nom} : point de fonctionnement ${fx(f.Q, 2)} m³/h à ${fx(f.H, 2)} mCE pour ${fx(Q, 2)} m³/h à ${fx(H, 2)} mCE calculés${ok ? '' : ' : insuffisant'}.`);
        if (ok && (f.Q > Q * 1.3 || f.H > H * 1.3)) al('attention', `Pompe surdimensionnée de plus de 30 % : régler la vitesse (consigne) ou choisir un modèle plus petit.`);
      } else if (Number.isFinite(f.Qmax) || Number.isFinite(f.Hmax)) {
        const ok = (!Number.isFinite(f.Qmax) || f.Qmax >= Q) && (!Number.isFinite(f.Hmax) || f.Hmax >= H);
        al(ok ? 'ok' : 'erreur', `Pompe ${nom} : plage jusqu'à ${fx(f.Qmax, 1)} m³/h et ${fx(f.Hmax, 1)} mCE pour ${fx(Q, 2)} m³/h à ${fx(H, 2)} mCE calculés${ok ? ' (point à vérifier sur la courbe)' : ' : hors plage'}.`);
      }
      if (Number.isFinite(f.P1) && Number.isFinite(v.Pabs) && v.Pabs > 0) al(Math.abs(f.P1 - v.Pabs) / v.Pabs <= 0.3 ? 'ok' : 'attention', `Puissance absorbée : ${fx(f.P1, 0)} W sur la fiche, ${fx(v.Pabs, 0)} W estimés.`);
    }
    if (t === 'vase') {
      if (Number.isFinite(f.V) && Number.isFinite(v.Vn)) al(f.V >= v.Vn ? 'ok' : 'erreur', `Vase ${nom} : ${fx(f.V, 0)} L pour ${fx(v.Vn, 0)} L de volume nominal calculé${f.V >= v.Vn ? '' : ' : trop petit'}.`);
      if (Number.isFinite(f.pmax) && Number.isFinite(v.pe)) al(f.pmax >= v.pe ? 'ok' : 'erreur', `Pression maximale du vase ${fx(f.pmax, 1)} bar pour ${fx(v.pe, 2)} bar de pression finale${f.pmax >= v.pe ? '' : ' : insuffisante'}.`);
      if (Number.isFinite(f.p0) && Number.isFinite(v.p0) && Math.abs(f.p0 - v.p0) > 0.1) al('attention', `Gonflage usine ${fx(f.p0, 1)} bar : régler à ${fx(v.p0, 2)} bar à la mise en service (vase isolé et vidangé).`);
    }
    if (t === 'ecs' && Number.isFinite(f.V) && Number.isFinite(v.Vb)) al(f.V >= v.Vb ? 'ok' : 'erreur', `Ballon ${nom} : ${fx(f.V, 0)} L pour ${fx(v.Vb, 0)} L de stockage nécessaire${f.V >= v.Vb ? '' : ' : insuffisant'}.`);
    if (t === 'generateur' && Number.isFinite(f.P)) {
      const n = Math.max(1, Number(e.nGen) || 1), tot = f.P * n;
      al(tot >= (v.Pdem || 0) ? 'ok' : 'erreur', `Générateur ${nom} : ${fx(f.P, 0)} kW${n > 1 ? ` × ${n} = ${fx(tot, 0)} kW` : ''} pour ${fx(v.Pdem, 0)} kW de besoin${tot >= (v.Pdem || 0) ? '' : ' : insuffisant'}.`);
    }
    return out;
  }
  // Calculs annexes reliés au registre (fiche-annexes.js) : contrôles faits par le calcul lui-même, matériel rappelé au résumé
  const ANNEXES = ['drv', 'radiateurs', 'echangeurPlaques', 'piscine', 'chambreFroide', 'hotte', 'parking'];
  const gere = type => !!TYPES[type] || ANNEXES.includes(type);
  return { lire, champs, fiche, controles, gere, identifier, choisir, gammeDe, LIBELLES, TYPES };
})();
if (typeof module !== 'undefined') module.exports = FicheEquip;
