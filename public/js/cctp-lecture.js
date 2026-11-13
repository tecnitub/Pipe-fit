// Lecture d'un CCTP (cahier des clauses techniques particulières) de lot CVC / plomberie / tuyauterie, à partir des lignes
// de texte du PDF : références (lot, indice, date, n° d'affaire, BET, maître d'ouvrage, opération), articles numérotés et
// équipements à mettre en place (repères, quantité, famille du DOE, prescription « marque … ou équivalent », puissance /
// débit). Sert au DOE et à l'étude d'exécution : pré-remplissage, liste de contrôle article par article, numérotation.
// Module commun navigateur / tests.
const CctpLecture = (() => {
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  function dateIso(t) {
    let m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
    if (m) { const an = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${an}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    m = new RegExp(`(\\d{1,2})(?:er)?\\s+(${MOIS.join('|')})\\s+(\\d{4})`).exec(norm(t));
    return m ? `${m[3]}-${String(MOIS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
  }

  // Équipements reconnus d'après le titre de l'article : famille du DOE (3.x) et préfixe de repère
  const TYPES = [
    [/thermofrigopompe|\btfp\b/, '3.1', 'TFP'], [/pompes? a chaleur|\bpac\b/, '3.1', 'PAC'], [/groupes? (?:de production )?(?:froid|d'eau glacee)|refroidisseur|chiller/, '3.1', 'GF'],
    [/rooftop/, '3.1', 'RT'], [/chaudiere/, '3.1', 'CH'],
    [/^ventilations? (?:du |des |de la )?(?:locale?s?|locaux)\b/, '3.5', 'EXT'],
    [/centrales? de traitement d'air|\bcta\b|centrales? (?:d'air )?(?:de (?:vmc|ventilation) )?(?:double flux|de soufflage)|\bvmc double flux|caissons? double flux/, '3.4', 'CTA'], [/desenfumage/, '3.6', 'DSF'],
    [/\bvmc\b|ventilation mecanique|caisson d'(?:extraction|insufflation)/, '3.5', 'VMC'], [/extracteur|tourelle|caisson (?:d'extraction|de ventilation)|hotte/, '3.5', 'EXT'],
    [/split|detente directe|unites? (?:exterieures?|interieures?)|groupes? de condensation|\b(?:drv|vrv|vrf)\b/, '3.3', 'SPL'],
    [/ventilo-?convecteur|cassette/, '3.2', 'VC'], [/radiateur/, '3.2', 'RAD'], [/aerotherme|aero-?chauffeur/, '3.2', 'AER'], [/plancher chauffant|plafonds? rayonnants?|panneaux? rayonnants?/, '3.2', 'EM'],
    [/circulateurs?|pompes? (?:de circulation|doubles?|simples?|de relevage|de bouclage)|surpresseur|groupe de (?:surpression|maintien)/, '3.7', 'P'],
    [/vases? d'expansion/, '3.7', 'VE'], [/vannes? (?:3|trois) voies|\bv3v\b/, '3.7', 'V3V'], [/vannes? (?:2|deux) voies|\bv2v\b/, '3.7', 'V2V'],
    [/echangeur/, '3.7', 'ECH'], [/pot de decantation|desemboueur|filtre a tamis|filtre magnetique/, '3.7', 'FLT'], [/compteur/, '3.7', 'CPT'],
    [/robinetterie|vannes? d'equilibrage|vannes? d'isolement|clapet/, '3.7', 'V'],
    [/disconnecteur/, '3.9', 'DIS'], [/adoucisseur/, '3.9', 'ADO'], [/ballon|preparateur|chauffe-eau|cumulus|production d'eau chaude|\becs\b/, '3.9', 'BAL'],
    [/appareils sanitaires|lavabo|\bwc\b|douche|evier/, '3.9', 'SAN'],
    [/tuyauteries?|reseaux? (?:hydrauliques?|d'eau|vapeur|process|eau glacee|eau chaude)|canalisations?/, '3.8', 'RES'],
  ];
  // Articles de prescriptions générales : jamais des équipements (mais gardés dans la liste de contrôle)
  const GENERAL = /generalit|principes? generaux|principe general|objet du|consistance|normes?\b|reglementa|prescriptions? (?:generales|communes)|textes|documents? (?:a fournir|d'execution)|limites? de prestation|garantie|nettoyage|repli|reception|\bdoe\b|dossier des ouvrages|plan(?:s)? d'execution|planning|hygiene|securite|essais|mise en service|calorifug|peinture|reperage|etiquet|formation|maintenance|\bcontroles?\b|base de calcul|hypothese|definition|presentation|sommaire/;
  const typeDe = titre => { const t = norm(titre); return GENERAL.test(t) ? null : (TYPES.find(([re]) => re.test(t)) || null); };
  // Type et texte qui l'a fait reconnaître (« panneaux rayonnants » dans « … les corps de chauffe sont des panneaux rayonnants »)
  const objetDe = texte => { const t = norm(texte); for (const ty of TYPES) { const m = ty[0].exec(t); if (m) return { type: ty, objet: m[0] }; } return null; };
  const PREFIXES = '(TFP|PAC|GF|RT|CH|CTA|DSF|VMC|EXT|SPL|UE|UI|VC|RAD|AER|P|PO|CI|VE|V3V|V2V|ECH|FLT|CPT|DIS|ADO|BAL|TA|CE|CR)';
  const REPERE = new RegExp(`\\b${PREFIXES}(?:[-_.](\\d{1,3}[A-Z]?)|(\\d{1,3}[A-Z]?)|\\s(\\d{1,2}[A-Z]?))\\b`, 'g');
  function reperes(texte) {
    const out = [];
    for (const m of String(texte).matchAll(REPERE)) {
      const n = m[2] || m[3] || m[4];
      // Préfixe d'une lettre (P) : repère seulement s'il est collé ou relié par un tiret (« P1 », « P-01 », pas « p 12 »)
      if (m[1].length === 1 && m[4]) continue;
      const r = `${m[1]}-${n}`;
      if (!out.includes(r)) out.push(r);
    }
    return out;
  }

  // Titre d'article : « 3.2.1 Pompe à chaleur air / eau », « Article 4.1 – CTA », lignes du sommaire comprises (points ou
  // traits de soulignement, puis la page). Numérotation décimale (3.2.1), à chapitre romain (III.1.1, « III – 02.2 ») ou à
  // tirets (4-3-1)
  const SEP = '\\s?[.\\-–]\\s?', NUM = `(?:[IVX]{1,5}${SEP})?\\d{1,2}(?:${SEP}\\d{1,2}){0,4}`;
  const TITRE = new RegExp(`^\\s*(?:art(?:icle)?\\.?\\s*)?(${NUM})(?:\\s*[.)\\-–]?\\s+|\\.(?=[A-ZÀ-Ý]))([A-Za-zÀ-ÿ'«"(].{2,150}?)\\s*(?:[._…]{2,}\\s*\\.?\\s*\\d{0,3}|\\t+\\s*\\d{1,3})?\\s*$`);
  const NUMERO_SEUL = new RegExp(`^(?:art(?:icle)?\\.?\\s*)?(?:[IVX]{1,5}${SEP}\\d{1,2}(?:${SEP}\\d{1,2}){0,4}|\\d{1,2}(?:${SEP}\\d{1,2}){1,4})\\.?$`, 'i');
  // Forme commune d'un numéro : « III – 02.2 » → « III.2.2 », « 4-3-1 » → « 4.3.1 » (le DPGF est écrit de la même façon)
  const numeroCanon = n => String(n || '').trim().replace(/^art(?:icle)?\.?\s*/i, '').replace(/\s*[.\-–—]\s*/g, '.').replace(/^\.+|\.+$/g, '').split('.').map(p => (/^\d+$/.test(p) ? String(+p) : p.toUpperCase())).join('.');
  // PDF dont la police perd les ligatures : « ﬂ », « ﬀ » (rendues par NFKC), « ti » rendu « Ɵ » ou disparu (« extrac on »)
  const LIGATURE = /([A-Za-zÀ-ÿ]{2,}[aiuc]) (ons?)\b|([A-Za-zÀ-ÿ]{3,}i) (fs?)\b|([A-Za-zÀ-ÿ]+(?:ma|ous)) (ques?)\b|\b([Cc]ass|[Mm]anchet|[Bb]aguet|[Hh]o)e? (es?)\b/g;
  const LIGATURE2 = /([A-Za-zÀ-ÿ]{3,}) sa (ons?)\b/g; // « Clima sa on » : deux « ti » perdus
  function reparer(lignes) {
    // « Ɵ », « Ʃ » : glyphes des ligatures « ti », « tt » de certaines polices, tel que pdf.js le rend (« restauraƟon »)
    let L = lignes.map(x => String(x ?? '').normalize('NFKC').replace(/Ɵ/g, 'ti').replace(/Ʃ/g, 'tt'));
    // Exposant écrit sur sa propre ligne (« 3 » au-dessus de « 2 290 m /h ») : unité recollée, ligne de l'exposant retirée
    L = L.filter((l, i) => !(/^[\s\t23]+$/.test(l) && /\bm \/ ?[hs]\b/.test(L[i + 1] || ''))).map(l => l.replace(/\bm \/ ?h\b/g, 'm³/h'));
    const n =L.reduce((s, l) => s + (l.match(LIGATURE) || []).length + (l.match(LIGATURE2) || []).length, 0);
    if (n < 3) return L;
    return L.map(l => l.replace(LIGATURE2, '$1tisati$2').replace(LIGATURE, (t, a, b, c, d, e, f, g, h) => (a ? `${a}ti${b}` : c ? `${c}ti${d}` : e ? `${e}ti${f}` : /^ho$/i.test(g) ? `${g}tt${h}` : `${g}ett${h}`)));
  }
  // Numéro d'article seul sur sa ligne, titre à la ligne suivante : réunis
  // En-têtes et pieds de page (lignes courtes répétées sur beaucoup de pages, « Page 16/70 ») : retirés pour ne pas couper
  // un titre d'article de son numéro
  // Pied de page : « Page 16/70 », « … Page : 27 », « Dossier n° … Page - 15 »
  const PIED = /^page \d+\s*\/\s*\d+$|^.{0,80}\bpage\s*[:\-]?\s*\d{1,3}(?:\s*\/\s*\d{1,3})?$/i;
  function sansEntetes(L) {
    const n = new Map(), cle = l => String(l).replace(/\s+/g, ' ').trim();
    L.forEach(l => { const k = cle(l); if (k && k.length < 120) n.set(k, (n.get(k) || 0) + 1); });
    const pages = Math.max(1, L.filter(l => PIED.test(cle(l))).length);
    return L.filter(l => { const k = cle(l); return !PIED.test(k) && !(pages >= 5 && (n.get(k) || 0) >= Math.max(5, pages * 0.6) && !NUMERO_SEUL.test(k)); });
  }
  function joindre(L) {
    L = sansEntetes(L);
    const out = [];
    for (let i = 0; i < L.length; i++) {
      const l = L[i].trim(), s = (L[i + 1] || '').trim();
      if (NUMERO_SEUL.test(l) && s && s.length < 150 && /^[A-Za-zÀ-ÿ'«"(]/.test(s)) { out.push(`${l.replace(/\.$/, '')} ${s}`); i++; } else out.push(L[i]);
    }
    return out;
  }
  function articles(lignes) {
    const blocs = new Map();
    let courant = null;
    for (const brut of lignes) {
      const l = String(brut).replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!l) continue;
      const m = TITRE.exec(l);
      // Article : numéro en au moins deux parties (ou « Article 3 »), titre surtout en lettres ; numéro à tirets (« 4-3-1 »)
      // suivi d'un titre en majuscule (pas « 10-12 personnes »)
      const parties = m ? numeroCanon(m[1]).split('.').length : 0, tirets = m && !/[.]/.test(m[1]);
      if (m && (parties >= 2 || /^art/i.test(l)) && (!tirets || /^[A-ZÀ-Ý'«"(]/.test(m[2])) && /[a-zà-ÿ]{3}/i.test(m[2]) && (m[2].match(/\d/g) || []).length < m[2].length / 3) {
        const num = numeroCanon(m[1]), titre = m[2].replace(/\s*(?:[._…]{3,}|\.{2,}\s*\d{1,3}\s*$).*$/, '').trim();
        courant = { num, titre, corps: [], brut: [], sommaire: /[._…]{3,}|\.{2,}\s*\d{1,3}\s*$/.test(l) };
        const ex = blocs.get(num);
        // Le sommaire puis le corps : on garde le texte du corps ; le titre du sommaire (lignes pointillées) prime, celui du
        // corps pouvant être déplacé par la mise en page du PDF (titre écrit plus bas que son numéro)
        if (!ex || !ex.corps.length) { if (ex && ex.sommaire) courant.titre = ex.titre; blocs.set(num, courant); } else courant = { num, titre, corps: [], brut: [] };
        continue;
      }
      // Corps de l'article ; les lignes brutes gardent les colonnes (tabulations) des tableaux de caractéristiques
      if (courant) { courant.corps.push(l); courant.brut.push(String(brut).trim()); }
    }
    // Blocs repris du corps quand le numéro revient (sommaire d'abord)
    return [...blocs.values()];
  }

  // Prescription lue dans un texte : « marque … », « type … », « ou équivalent »
  function prescription(texte) {
    const marque = /(?:marque|fabrication)\s*(?:et type)?\s*[:\-]?\s*(?:\d+\s*x\s*)?([A-Z][\w&'\-]+(?:\s[A-Z][\w&'\-]+)?)/.exec(texte), type = /(?:type|mod[eè]le|gamme|s[ée]rie)\s*[:\-]?\s*([A-Z0-9][\w\-/+]{1,24}(?:\s[A-Z0-9][\w\-/+]{1,12})?)/.exec(texte);
    return [marque && `marque ${marque[1]}`, type && `type ${type[1]}`].filter(Boolean).join(', ') + (/ou (?:techniquement )?[ée]quivalent/i.test(texte) && (marque || type) ? ' ou équivalent' : '');
  }
  // Équipements énumérés dans le texte d'un article (« 1 pompe double de circulation … type … : » puis « Puissance absorbée :
  // 850 W », « Débit = 9 m3/h ») : un équipement par énumération, ses caractéristiques sur les lignes qui suivent ; la
  // phrase qui l'annonce nomme son circuit (« Le circuit alimentant les panneaux rayonnants sera équipé »)
  const PUCE = /^(?:[-–•➢▪●*]|o(?=\s))\s*/;
  // Nombre en chiffres, ou en lettres derrière une puce (« - deux vases … ») : pas « une centrale … » au fil d'une phrase
  const ENUM = /^(?:[-–•➢▪●*]\s*(\d{1,3}|une?|deux|trois|quatre)|(\d{1,3}))\s+(?:x\s+)?((?:pompes?|circulateurs?|vases?|ballons?|chauffe-eau|preparateurs?|aerothermes?|aero-?chauffeurs?|centrales?|caissons?|extracteurs?|unites?|cassettes?|ventilo-?convecteurs?|groupes?|chaudieres?|echangeurs?|adoucisseurs?|surpresseurs?|thermofrigopompes?)\b.*)$/;
  const CARAC = /^(?:[-–•➢▪●*]\s*)?(?:puissances?|p ?(?:calo|abs|elec|froid|chaud)\w*|debits?|pressions?|hmt|hauteur|tension|intensite|capacite|volume|contenance|regime|marque|type|modele|reference|alimentation|niveau|rendement|cop|scop|eer|seer|temperature|vitesse|frigorigene|fluide|poids|dimensions?)\b/;
  const NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4 };
  function enumeres(corps) {
    const out = [];
    for (let i = 0; i < corps.length; i++) {
      const m = ENUM.exec(norm(corps[i]));
      const o = m && objetDe(m[3].slice(0, 80));
      if (!o || ['RES', 'V', 'FLT', 'CPT', 'SAN'].includes(o.type[2])) continue;
      const lignes = [corps[i]];
      let j = i + 1;
      for (; j < corps.length && j < i + 14; j++) {
        const y = norm(corps[j]), prec = lignes[lignes.length - 1];
        if (/^(?:[-–•➢▪●*]\s*)?(?:\d{1,3}|une?|deux)\s+(?:x\s+)?[a-z]/.test(y)) break;
        // Ligne terminée par une abréviation (« moteur E.C.M. ») : pas la fin de la phrase
        const finie = /[.;:]\s*$/.test(prec) && !/(?:\b[A-Z]\.){2,}\s*$/.test(prec);
        if (CARAC.test(y) || (!finie && !PUCE.test(corps[j]) && /^[a-z0-9(]/i.test(y))) lignes.push(corps[j]); else break;
      }
      const avant = i > 0 ? corps[i - 1] : '';
      const circuit = /\b(?:circuits?|reseaux?|alimentant|departs?|boucles?|bouclage|primaire|secondaire)\b/.test(norm(avant)) && !ENUM.test(norm(avant)) && avant.length < 160
        ? avant.replace(/\s+(?:ser(?:a|ont)\s+(?:[ée]quip|muni)|comprendr?a\b|comportera\b).*$/i, '').replace(/^(?:le|la|les|chaque)\s+/i, '').trim() : '';
      const nom = corps[i].replace(PUCE, '').replace(/^(?:\d{1,3}|une?|deux|trois|quatre)\s+(?:x\s+)?/i, '').split(/,\s|\s:\s*$/)[0].trim();
      out.push({ type: o.type, objet: o.objet, quantite: NOMBRES[m[1]] || +(m[1] || m[2]) || 1, texte: lignes.join(' '), nom, designation: `${nom.charAt(0).toUpperCase()}${nom.slice(1, 90)}${circuit ? ` — ${circuit}` : ''}`, circuit });
      i = j - 1;
    }
    return out;
  }
  // Blocs de caractéristiques : titre court terminé par « : » puis au moins trois lignes à puce « libellé : valeur », dont la
  // marque, le type, une puissance ou un débit
  function blocsCaracteristiques(corps) {
    const out = [];
    for (let i = 0; i < corps.length; i++) {
      const l = corps[i];
      if (!/:\s*$/.test(l) || l.length > 70 || PUCE.test(l)) continue;
      let j = i + 1;
      while (j < corps.length && PUCE.test(corps[j])) j++;
      const lignes = corps.slice(i + 1, j);
      if (lignes.length >= 3 && lignes.filter(x => /:/.test(x)).length >= 3 && lignes.some(x => /marque|type|puissance|debit/.test(norm(x)))) {
        const q = /:\s*(\d{1,3})\s*x\s/i.exec(lignes.join(' '));
        out.push({ titre: l.replace(/\s*:\s*$/, '').trim(), texte: lignes.map(x => x.replace(PUCE, '')).join(' ; '), quantite: q ? +q[1] : 0 });
        i = j - 1;
      }
    }
    return out;
  }
  // Tableau de caractéristiques en colonnes, un équipement par colonne (« RDC Zone Sud | RDC Zone Nord | R+2 », « CTA n°2 |
  // CTA n°1 | CTA n°5 », « Débit … | 2 100 m³/h | 2 400 m³/h | 1 700 m³/h ») : lignes à colonnes (tabulations) du corps de
  // l'article. Chaque ligne : libellé, unité éventuelle, puis une valeur par colonne ; une ligne de valeurs seules prend le
  // libellé écrit au-dessus. Rend [{ repere, nom, zone, texte }] (une entrée par colonne), ou [] sans tableau
  const REP_COLONNE = /^([A-Za-z]{2,5})\s*(?:n\s*°|no|n°|°)?\s*-?\s*(\d{1,3})$/;
  function tableauColonnes(brut) {
    const cellules = l => String(l).split('\t').map(c => c.replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (let i = 0; i < brut.length; i++) {
      const tete = cellules(brut[i]), n = tete.length;
      // En-tête : une cellule par colonne, en lettres (« RDC Zone Sud », « Groupe extérieur »), pas un libellé ni des nombres
      if (n < 2 || n > 8 || tete.some(c => /:\s*$/.test(c) || !/[A-Za-zÀ-ÿ]/.test(c) || /^\d/.test(c)) || !tete.some(c => /[A-Za-zÀ-ÿ]{2,}/.test(c))) continue;
      const memes = tete.every(c => c === tete[0]), reps = tete.every(c => REP_COLONNE.test(c));
      const cols = Array.from({ length: n }, (_, k) => { const m = reps && REP_COLONNE.exec(tete[k]); return { repere: m ? `${m[1].toUpperCase()}-${+m[2]}` : '', nom: '', zone: memes || reps ? '' : tete[k], lignes: [] }; });
      let libelle = '', seules = 0, lues = 0, libelles = 0, ecarts = 0, j = i + 1;
      for (; j < brut.length && seules <= 2 && ecarts <= 3; j++) {
        const c = cellules(brut[j]);
        if (c.length < 2) { seules++; libelle = c[0] || ''; continue; }
        seules = 0;
        let lib, val;
        // Ligne mal découpée par la mise en page (cellules en trop ou en moins) : passée
        if (c.length === n) { lib = libelle; val = c; } else if (c.length === n + 1) { lib = c[0]; val = c.slice(1); libelles++; } else if (c.length === n + 2) { lib = `${c[0]} (${c[1]})`; val = c.slice(2); libelles++; } else { ecarts++; continue; }
        ecarts = 0;
        libelle = '';
        lues++;
        if (/^(?:-\s*)?(?:locaux|zones?|niveaux?|desservi)/i.test(lib) && !cols[0].zone) val.forEach((v, k) => { cols[k].zone = v; });
        // Ligne des repères (« CTA n°2 | CTA n°1 ») ; référence ou type de chaque colonne
        const nomme = /^(?:-\s*)?(?:r[ée]f[ée]rence|type|mod[eè]le|d[ée]signation|marque)\b/i.test(lib);
        // « Type : DF 300 | DF 500 » ressemble à des repères : c'est le modèle
        if (!nomme && val.every(v => REP_COLONNE.test(v))) { val.forEach((v, k) => { const m = REP_COLONNE.exec(v); cols[k].repere = `${m[1].toUpperCase()}-${+m[2]}`; }); continue; }
        if (/^(?:-\s*)?(?:r[ée]f[ée]rence|type|mod[eè]le|d[ée]signation)\b/i.test(lib) && !cols[0].nom) val.forEach((v, k) => { cols[k].nom = v; });
        val.forEach((v, k) => cols[k].lignes.push(`${lib.replace(/^-\s*/, '').replace(/\s*:\s*$/, '')} : ${v}`));
      }
      const texte = cols[0].lignes.join(' ');
      if (lues >= 4 && libelles >= 2 && /d[ée]bit|puissance|marque|type|r[ée]f[ée]rence/i.test(texte)) return cols.map(c => ({ repere: c.repere, nom: c.nom, zone: c.zone, texte: c.lignes.join(' ; ') }));
      i = j - 1;
    }
    return [];
  }
  // Tableau à une ligne par équipement (« N° | Zone | Débit | Marque/Type » puis « V1 Sanitaires 280 m3/h ACME / FX 04 ») :
  // repère, zone, débit et type de chaque ligne ; une ligne coupée par la mise en page (« LE Stock » puis « 45 m3/h … ») est
  // recollée. Rend [{ repere, zone, debit, type, texte }], ou [] sans tableau (deux lignes au moins)
  const LIGNE_EQ = /^([A-Z]{1,3}\d{0,2}[a-z]?)\s+(.+?)\s+(\d[\d ]{0,6}(?:[.,]\d+)?)\s*m\s?[3³]\s*\/\s*h\b\s*(.*)$/;
  function tableauLignes(corps) {
    const h = corps.findIndex((l, i) => i < 40 && l.length < 120 && /\bdebits?\b/.test(norm(l)) && /(?:^n°|\bn°|\bzones?\b|\blocal\b|\breperes?\b)/.test(norm(l)) && !/m\s?[3³]\s*\/\s*h/i.test(l));
    if (h < 0) return [];
    const out = [];
    for (let i = h + 1, sans = 0; i < corps.length && i < h + 30 && sans <= 3; i++) {
      let l = corps[i].trim(), m = LIGNE_EQ.exec(l);
      if (!m && /^[A-Z]{1,3}\d{0,2}\s+\S/.test(l) && i + 1 < corps.length && /^\d[\d ]{0,6}\s*m\s?[3³]\s*\/\s*h/i.test(corps[i + 1])) { m = LIGNE_EQ.exec(`${l} ${corps[i + 1]}`); if (m) i++; }
      if (!m) { sans++; continue; }
      sans = 0;
      // Cellules séparées par « | » (alimentation, lot) : le type s'arrête à la première
      const zone = m[2].replace(/\s*\|\s*/g, ' ').trim(), debit = m[3].replace(/\s/g, ''), type = m[4].split('|')[0].trim();
      // « Marque / Type » dans la même cellule (« ACME / FX 04 ») : la marque, puis le modèle
      const mt = /^([A-Z][\w&'-]+)\s*\/\s*(\S.*)$/.exec(type);
      out.push({ repere: m[1], zone, debit, type: mt ? mt[2] : type, texte: `Zone : ${zone} ; Débit : ${debit} m3/h${mt ? ` ; Marque : ${mt[1]} ; Type : ${mt[2]}` : type ? ` ; Type : ${type}` : ''}` });
    }
    return out.length >= 2 ? out : [];
  }
  function analyser(lignes) {
    // R : lignes réparées, colonnes (tabulations) gardées pour les tableaux ; L : texte suivi
    const R = joindre(reparer(lignes).map(x => x.replace(/ +/g, ' ').trim()).filter(Boolean));
    const L = R.map(x => String(x).replace(/\s*\t+\s*/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const tete = L.slice(0, 120), tout = L.join('\n');
    const cherche = (re, src = tete) => { for (const l of src) { const m = re.exec(l); if (m) return m; } return null; };
    const r = { lot: '', lotLibelle: '', indice: '', date: '', dossier: '', bet: '', moa: '', moe: '', operation: '', articles: [], equipements: [] };
    let m = cherche(/\blot\s*(?:n\s*[°o]\s*|n°\s*)?(\d{1,3}[a-z]?)\b\s*[-–:]?\s*(.*)$/i);
    if (m) { r.lot = m[1].toUpperCase(); r.lotLibelle = m[2].replace(/^[-–:\s]+/, '').trim(); }
    m = cherche(/\bind(?:ice)?\.?\s*[:\-]?\s*([A-Z]|\d{1,2})\b(?:\s*(?:du|le|en date du|[-–:])\s*(.+))?/i);
    if (m) { r.indice = m[1].toUpperCase(); r.date = dateIso(m[2] || ''); }
    if (!r.date) { m = cherche(/\bdate\b\s*(?:d'[ée]dition|d'[ée]mission)?\s*[:\-]?\s*(.+)/i); if (m) r.date = dateIso(m[1]); }
    m = cherche(/\b(?:affaire|dossier|n°\s*d'affaire|r[ée]f(?:[ée]rence)?\s*(?:affaire|dossier))\s*(?:n\s*[°o]|n°)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-/._]{2,24})\b/i);
    if (m && /\d/.test(m[1])) r.dossier = m[1];
    m = cherche(/\b(?:bureau d'[ée]tudes?(?: techniques?)?(?: fluides?)?|b\.?e\.?t\.?(?: fluides?)?)\s*[:\-–]\s*(.+)$/i); if (m) r.bet = m[1].trim();
    m = cherche(/\bma[iî]tre d'ouvrage\s*[:\-–]?\s*(.+)$/i); if (m) r.moa = m[1].trim();
    m = cherche(/\bma[iî]tr(?:e|ise) d'(?:œ|oe)uvre\s*[:\-–]?\s*(.+)$/i); if (m) r.moe = m[1].trim();
    m = cherche(/^(?:op[ée]ration|objet|projet)\s*[:\-–]\s*(.+)$/i); if (m) r.operation = m[1].trim();
    // Sinon : intitulé écrit juste au-dessus (ou au-dessous) du titre « Cahier des clauses techniques particulières »
    if (!r.operation) {
      const i = tete.findIndex(l => /clauses techniques particuli/i.test(l));
      const ok = l => l && l.length > 12 && !/\blot\b|indice|\bdate\b|cctp|affaire|dossier|ma[iî]tr|b\.?e\.?t\b|bureau|sommaire|clauses/i.test(l);
      const c = i >= 0 && ([tete[i - 1], tete[i - 2]].find(ok) || tete.slice(i + 1, i + 6).find(ok));
      if (c) r.operation = c;
    }

    const tous = articles(R);
    r.articles = tous.map(a => ({ num: a.num, titre: a.titre }));
    // Texte de chaque article (début) : nature, régime et équipements des réseaux décrits
    r.articlesDetail = tous.map(a => ({ num: a.num, titre: a.titre, texte: a.corps.join(' ').slice(0, 6000) }));
    const CHAP_GENERAL = /dispositions? generales?|prescriptions?|generalites?|normes?|clauses? (?:administratives|generales)|presentation|conditions? generales?|bases? de (?:l'etude|calcul|dimensionnement)|hypotheses|principes? generaux|principe general|performances? energetiques?/;
    // Chapitres (« I DISPOSITIONS GENERALES », « CHAPITRE III – DESCRIPTION DES INSTALLATIONS ») : les équipements ne sont
    // pris que hors des chapitres de généralités et de prescriptions
    const chapitres = {};
    L.forEach(l => { const c = /^(?:chapitre\s+)?([IVX]{1,5}|\d{1,2})\s*[.\-–:]?\s+([A-ZÀ-Ý][A-ZÀ-Ý0-9 '’\-–/,]{4,}?)\s*(?:[._…]{3,}.*)?$/i.exec(l); if (c && /^[^a-zà-ÿ]*$/.test(c[2]) && !chapitres[c[1].toUpperCase()]) chapitres[c[1].toUpperCase()] = c[2].replace(/[\s–-]+$/, '').trim(); });
    r.chapitres = chapitres;
    const general = a => CHAP_GENERAL.test(norm(chapitres[a.num.split('.')[0]] || ''));
    // Articles des chapitres de généralités : ni équipements ni réseaux
    r.articlesDetail.forEach(a => { if (general(a)) a.general = true; });
    // Titre de réseau, d'électricité ou de régulation : l'équipement cité dans son texte n'est pas l'objet de l'article
    // Prestation, accessoire ou description d'ensemble (« Remplissage », « Câblage », « Spécifications techniques », « Pièges à
    // sons », « Implantation des … ») : l'équipement cité dans le texte n'est pas l'objet de l'article
    const PAS_EQUIPEMENT = /^(?:reseaux?|gaines?|distribution|electricite|regulation|raccordements?|dispositifs? de securite|vitesses?|traitement|remplissage|cablage|specifications?|implantation|alarmes?|silencieux|pieges? a sons?|batteries?|accessoires?|armoires?|vidange|peinture|reperage|programmation|asservissement|automatisme|configuration|principes?|besoins?|architecture|supervision|vues?|analyse|fonctionnement|robinetterie|tuyauteries?|isolation|fourreaux?|protections?|dispositions?|ventilations? (?:basse|haute)|evacuations?|condensats?|supports?|fixations?|attentes?|etiquetage|commande)/;
    // Titre d'émission ou de terminaux (« Émission de chauffage des locaux ») : l'émetteur nommé au texte compte aussi
    const EMISSION = /^(?:emission|emetteurs?|terminaux|corps de chauffe|chauffage (?:des|du|de la)|diffusion)/;
    // Équipements : articles d'équipement (titre reconnu), un par repère trouvé, sinon une ligne à numéroter
    for (const a of tous) {
      if (general(a)) continue;
      const corps = a.corps.join(' ');
      // Titre non parlant (« Compensation Cuisine », « Extraction Locaux techniques ») : gros équipement nommé au début du texte
      let t = typeDe(a.titre), objet = '';
      // « Spécifications techniques particulières » d'un chapitre qui nomme l'équipement (« Désenfumage mécanique ») :
      // l'équipement du chapitre, décrit là ; la désignation reprend le titre du chapitre
      let titre = a.titre;
      if (!t && /^(?:specifications?|prescriptions?) techniques? particulieres?/.test(norm(a.titre))) {
        const p = a.num.split('.'), parent = p.length > 1 ? (tous.find(y => y.num === p.slice(0, -1).join('.')) || {}).titre || chapitres[p[0]] : '';
        const tp = parent ? typeDe(parent) : null;
        if (tp && ['3.1', '3.4', '3.5', '3.6'].includes(tp[1])) { t = tp; titre = `${parent.charAt(0)}${parent.slice(1).toLowerCase()}`; }
      }
      if (!t && a.num.split('.').length >= 3 && !PAS_EQUIPEMENT.test(norm(a.titre)) && !GENERAL.test(norm(a.titre))) {
        const g = objetDe(corps.slice(0, 260));
        if (g && (['3.1', '3.3', '3.4', '3.5', '3.6'].includes(g.type[1]) || (EMISSION.test(norm(a.titre)) && g.type[1] === '3.2'))) { t = g.type; objet = g.objet; }
      }
      // Équipements énumérés au texte (« 1 pompe double … », « 1 vase d'expansion … ») et blocs de caractéristiques
      // (« Modèle en recyclage : » puis « • Débit … », « • Puissance … ») : un équipement chacun
      // Un seul équipement énuméré du type de l'article (« Deux chaudières repères CH-01 et CH-02 … ») : c'est l'article lui-même
      const en0 = GENERAL.test(norm(a.titre)) ? [] : enumeres(a.corps), en = t && en0.filter(e => e.type[2] === t[2]).length < 2 ? en0.filter(e => e.type[2] !== t[2]) : en0, bl = t ? blocsCaracteristiques(a.corps) : [];
      // Pompe énumérée sans phrase qui nomme son circuit, dans un article de circuit (« Bouclage ») : le circuit de l'article
      en.forEach(e => { if (!e.circuit && e.type[2] === 'P' && /^(?:bouclage|circuits?|reseaux?|primaire|secondaire|departs?)\b/.test(norm(a.titre))) { e.circuit = a.titre.trim(); e.designation = `${e.designation} — ${e.circuit}`; } });
      en.forEach(e => r.equipements.push({ article: a.num, designation: e.designation, famille: e.type[1], prefixe: e.type[2], objet: e.objet, prescrit: prescription(e.texte), caract: '', texte: `${e.texte}${e.circuit ? ` Circuit : ${e.circuit}.` : ''}`, quantiteLue: true, repere: '', quantite: e.quantite, enumere: true, nom: e.nom, ...(e.circuit ? { circuit: e.circuit } : {}) }));
      if (!t || en.some(e => e.type[2] === t[2])) continue;
      const reps = reperes(`${a.titre} ${corps}`).filter(x => x.split('-')[0] === t[2] || (t[2] === 'P' && /^(PO|CI)-/.test(x)) || (t[2] === 'SPL' && /^(UE|UI)-/.test(x)));
      // Quantité annoncée au début de l'article (plus loin, « Nombre : 3 sur chaque gaine » parle d'un accessoire)
      const debut = corps.slice(0, 700), q = /(?:quantit[ée]|nombre|qt[ée])\s*[:=]?\s*(\d{1,4})\b(?!\s*(?:sur|par)\s)/i.exec(debut) || /\b(\d{1,3})\s*(?:unit[ée]s?|exemplaires?|ensembles?)\b/i.exec(debut);
      const caract = [...new Set([...corps.matchAll(/(\d+(?:[.,]\d+)?)\s*kW\b/g)].map(x => `${x[1]} kW`).slice(0, 2).concat([...corps.matchAll(/(\d[\d\s]{0,6}(?:[.,]\d+)?)\s*m(?:3|³)\s*\/\s*h/g)].map(x => `${x[1].replace(/\s/g, ' ').trim()} m³/h`).slice(0, 2)))].join(' · ');
      // Régime de température cité (« régime 70/50 °C »), utile au schéma de principe de l'étude
      const reg = /(\d{1,2})\s*\/\s*(\d{1,2})\s*°\s*C\b/.exec(corps);
      const caractR = reg && !caract.includes(`${reg[1]}/${reg[2]} °C`) ? [caract, `${reg[1]}/${reg[2]} °C`].filter(Boolean).join(' · ') : caract;
      // Texte de l'article : caractéristiques techniques (puissances, débit, pression, fluide…) lues par l'inventaire
      const base = { article: a.num, designation: titre, famille: t[1], prefixe: t[2], prescrit: prescription(corps), caract: caractR, texte: corps.slice(0, 6000), quantiteLue: !!q, ...(objet ? { objet } : {}) };
      // Tableau de caractéristiques en colonnes : un équipement par colonne (repère, zone, caractéristiques de sa colonne)
      const tc = tableauColonnes(a.brut || []);
      if (tc.length >= 2) {
        tc.forEach(c => r.equipements.push({ ...base, designation: `${a.titre} — ${c.repere || c.nom || c.zone}`, prescrit: prescription(c.texte) || base.prescrit, caract: '', texte: `${c.texte}. ${corps}`.slice(0, 6000), quantiteLue: false, repere: c.repere, quantite: 1, ...(c.zone && c.zone !== c.repere ? { zone: c.zone } : {}) }));
        continue;
      }
      // Tableau à une ligne par équipement : un équipement par ligne (repère, zone, débit, type)
      const tl = tableauLignes(a.corps);
      if (tl.length >= 2) {
        tl.forEach(c => r.equipements.push({ ...base, designation: `${a.titre} — ${c.repere} ${c.zone}`.slice(0, 120), prescrit: prescription(c.texte) || base.prescrit, caract: `${c.debit} m³/h`, texte: `${c.texte} ; ${corps}`.slice(0, 6000), quantiteLue: false, repere: c.repere, quantite: 1, zone: c.zone }));
        continue;
      }
      // Plusieurs blocs de caractéristiques : un équipement par bloc (sa désignation : le titre du bloc)
      if (bl.length >= 2 && !reps.length) { bl.forEach(b => r.equipements.push({ ...base, designation: `${a.titre} — ${b.titre}`, prescrit: prescription(b.texte) || base.prescrit, caract: '', texte: `${b.texte}. ${corps}`.slice(0, 6000), quantiteLue: !!b.quantite, repere: '', quantite: b.quantite || 1 })); continue; }
      if (reps.length) reps.forEach(rep => r.equipements.push({ ...base, repere: rep, quantite: 1 }));
      else r.equipements.push({ ...base, repere: '', quantite: q ? +q[1] : 1 });
    }
    return r;
  }

  // Préfixe de repère d'un équipement (désignation, sinon famille du DOE)
  const PAR_FAMILLE = { '3.1': 'PAC', '3.2': 'EM', '3.3': 'SPL', '3.4': 'CTA', '3.5': 'VMC', '3.6': 'DSF', '3.7': 'V', '3.8': 'RES', '3.9': 'SAN' };
  const prefixeDe = e => (e.prefixe || ((TYPES.find(([re]) => re.test(norm(e.designation))) || [])[2]) || PAR_FAMILLE[e.famille] || 'EQ');
  // Repères manquants : suite de chaque préfixe (PAC-01, PAC-02…), après les numéros déjà pris ; renvoie le nombre attribué
  function numeroter(equipements) {
    const max = {};
    equipements.forEach(e => { const m = /^([A-Z0-9]+)-(\d+)/.exec(e.repere || ''); if (m) max[m[1]] = Math.max(max[m[1]] || 0, +m[2]); });
    let n = 0;
    equipements.forEach(e => {
      if (e.repere) return;
      const p = prefixeDe(e);
      max[p] = (max[p] || 0) + 1;
      e.repere = `${p}-${String(max[p]).padStart(2, '0')}`;
      n++;
    });
    return n;
  }

  return { analyser, reparer, joindre, articles, reperes, numeroter, prefixeDe, dateIso, typeDe, objetDe, numeroCanon, enumeres, blocsCaracteristiques, tableauColonnes, tableauLignes };
})();
if (typeof module !== 'undefined') module.exports = CctpLecture;
