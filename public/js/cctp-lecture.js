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
    [/centrales? de traitement d'air|\bcta\b/, '3.4', 'CTA'], [/desenfumage/, '3.6', 'DSF'],
    [/\bvmc\b|ventilation mecanique|caisson d'(?:extraction|insufflation)/, '3.5', 'VMC'], [/extracteur/, '3.5', 'EXT'],
    [/split|detente directe|unite (?:exterieure|interieure)|\b(?:drv|vrv)\b/, '3.3', 'SPL'],
    [/ventilo-?convecteur|cassette/, '3.2', 'VC'], [/radiateur/, '3.2', 'RAD'], [/aerotherme/, '3.2', 'AER'], [/plancher chauffant|plafond rayonnant|panneau rayonnant/, '3.2', 'EM'],
    [/circulateur|pompe (?:de circulation|double|simple|de relevage)|surpresseur|groupe de (?:surpression|maintien)/, '3.7', 'P'],
    [/vases? d'expansion/, '3.7', 'VE'], [/vannes? (?:3|trois) voies|\bv3v\b/, '3.7', 'V3V'], [/vannes? (?:2|deux) voies|\bv2v\b/, '3.7', 'V2V'],
    [/echangeur/, '3.7', 'ECH'], [/pot de decantation|desemboueur|filtre a tamis|filtre magnetique/, '3.7', 'FLT'], [/compteur/, '3.7', 'CPT'],
    [/robinetterie|vannes? d'equilibrage|vannes? d'isolement|clapet/, '3.7', 'V'],
    [/disconnecteur/, '3.9', 'DIS'], [/adoucisseur/, '3.9', 'ADO'], [/ballon|preparateur|chauffe-eau|production d'eau chaude|\becs\b/, '3.9', 'BAL'],
    [/appareils sanitaires|lavabo|\bwc\b|douche|evier/, '3.9', 'SAN'],
    [/tuyauteries?|reseaux? (?:hydrauliques?|d'eau|vapeur|process|eau glacee|eau chaude)|canalisations?/, '3.8', 'RES'],
  ];
  // Articles de prescriptions générales : jamais des équipements (mais gardés dans la liste de contrôle)
  const GENERAL = /generalit|objet du|consistance|normes?\b|reglementa|prescriptions? (?:generales|communes)|textes|documents? (?:a fournir|d'execution)|limites? de prestation|garantie|nettoyage|repli|reception|\bdoe\b|dossier des ouvrages|plan(?:s)? d'execution|planning|hygiene|securite|essais|mise en service|calorifug|peinture|reperage|etiquet|formation|maintenance|\bcontroles?\b|base de calcul|hypothese|definition|presentation|sommaire/;
  const typeDe = titre => { const t = norm(titre); return GENERAL.test(t) ? null : (TYPES.find(([re]) => re.test(t)) || null); };
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

  // Titre d'article : « 3.2.1 Pompe à chaleur air / eau », « Article 4.1 – CTA », lignes du sommaire comprises (points et page)
  const TITRE = /^\s*(?:art(?:icle)?\.?\s*)?(\d{1,2}(?:\.\d{1,2}){0,4})\s*[.)\-–]?\s+([A-Za-zÀ-ÿ'«"(].{2,150}?)\s*(?:\.{3,}\s*\d{1,3}|\t+\s*\d{1,3})?\s*$/;
  function articles(lignes) {
    const blocs = new Map();
    let courant = null;
    for (const brut of lignes) {
      const l = String(brut).replace(/\t+/g, ' ').trim();
      if (!l) continue;
      const m = TITRE.exec(l);
      // Article : numéro avec au moins un point (ou « Article 3 »), titre surtout en lettres
      if (m && (m[1].includes('.') || /^art/i.test(l)) && /[a-zà-ÿ]{3}/i.test(m[2]) && (m[2].match(/\d/g) || []).length < m[2].length / 3) {
        const num = m[1].replace(/\.$/, ''), titre = m[2].replace(/\s*\.{3,}.*$/, '').trim();
        courant = { num, titre, corps: [] };
        const ex = blocs.get(num);
        // Le sommaire puis le corps : on garde le titre du corps (même numéro), avec son texte
        if (!ex || !ex.corps.length) blocs.set(num, courant); else courant = { num, titre, corps: [] };
        continue;
      }
      if (courant) courant.corps.push(l);
    }
    // Blocs repris du corps quand le numéro revient (sommaire d'abord)
    return [...blocs.values()];
  }

  function analyser(lignes) {
    const L = lignes.map(x => String(x).replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
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

    r.articles = articles(L).map(a => ({ num: a.num, titre: a.titre }));
    // Équipements : articles d'équipement (titre reconnu), un par repère trouvé, sinon une ligne à numéroter
    for (const a of articles(L)) {
      const t = typeDe(a.titre);
      if (!t) continue;
      const corps = a.corps.join(' ');
      const reps = reperes(`${a.titre} ${corps}`).filter(x => x.split('-')[0] === t[2] || (t[2] === 'P' && /^(PO|CI)-/.test(x)) || (t[2] === 'SPL' && /^(UE|UI)-/.test(x)));
      const q = /(?:quantit[ée]|nombre|qt[ée])\s*[:=]?\s*(\d{1,4})\b/i.exec(corps) || /\b(\d{1,3})\s*(?:unit[ée]s?|exemplaires?|ensembles?)\b/i.exec(corps);
      const marque = /marque\s*[:\-]?\s*([A-Z][\w&'\-]+(?:\s[A-Z][\w&'\-]+)?)/.exec(corps), type = /(?:type|mod[eè]le|gamme|s[ée]rie)\s*[:\-]?\s*([A-Z0-9][\w\-/+]{1,24}(?:\s[A-Z0-9][\w\-/+]{1,12})?)/.exec(corps);
      const caract = [...new Set([...corps.matchAll(/(\d+(?:[.,]\d+)?)\s*kW\b/g)].map(x => `${x[1]} kW`).slice(0, 2).concat([...corps.matchAll(/(\d[\d\s]{0,6}(?:[.,]\d+)?)\s*m(?:3|³)\s*\/\s*h/g)].map(x => `${x[1].replace(/\s/g, ' ').trim()} m³/h`).slice(0, 2)))].join(' · ');
      const prescrit = [marque && `marque ${marque[1]}`, type && `type ${type[1]}`].filter(Boolean).join(', ') + (/ou [ée]quivalent/i.test(corps) && (marque || type) ? ' ou équivalent' : '');
      const base = { article: a.num, designation: a.titre, famille: t[1], prefixe: t[2], prescrit, caract };
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

  return { analyser, articles, reperes, numeroter, prefixeDe, dateIso, typeDe };
})();
if (typeof module !== 'undefined') module.exports = CctpLecture;
