// Dossier de consultation des entreprises (DCE) : archive zip décompressée dans le navigateur (lecteur zip de xlsx.js),
// pièces triées par nature d'après le nom et le contenu (CCTP, DPGF / DQE / BPU, annexes techniques, plans, pièces
// administratives) et par lot (seuls les lots CVC / plomberie sont retenus) ; puis questions à poser au maître d'œuvre
// pendant la consultation, tirées des écarts CCTP / DPGF et des caractéristiques manquantes de l'inventaire.
// Module commun navigateur / tests.
const Dce = (() => {
  const XL = typeof XLSX !== 'undefined' ? XLSX : (typeof require === 'function' ? require('./xlsx.js') : null);
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const ext = nom => ((/\.([a-z0-9]{1,5})$/i.exec(nom || '') || [])[1] || '').toLowerCase();
  const ignore = chemin => /(^|\/)(__macosx|\.ds_store|thumbs\.db|desktop\.ini)(\/|$)|(^|\/)~\$|(^|\/)\._/i.test(chemin);

  /* ---------- Décompression ---------- */
  // Pièces de l'archive : { chemin (sous-dossiers compris), nom, dossier, data: Uint8Array, taille } ; les zip contenus
  // dans le zip sont ouverts à leur tour (deux niveaux), leurs pièces rangées sous « <nom du zip>/ »
  async function decompresser(buf, { profondeur = 2, prefixe = '' } = {}) {
    const z = await XL.unzip(buf, 'Ce fichier n\'est pas une archive zip lisible.');
    const out = [];
    for (const n of z.noms()) {
      if (/\/$/.test(n) || ignore(n)) continue;
      const data = await z.octets(n), chemin = prefixe + n.replace(/\\/g, '/');
      if (ext(n) === 'zip' && profondeur > 0) {
        try { out.push(...await decompresser(data, { profondeur: profondeur - 1, prefixe: chemin.replace(/\.zip$/i, '') + '/' })); continue; } catch (e) { /* zip illisible : gardé tel quel */ }
      }
      const i = chemin.lastIndexOf('/');
      out.push({ chemin, nom: chemin.slice(i + 1), dossier: i > 0 ? chemin.slice(0, i) : '', data, taille: data.length });
    }
    return out;
  }

  /* ---------- Tri des pièces ---------- */
  const NATURES = { cctp: 'CCTP', dpgf: 'DPGF / DQE / BPU', annexe: 'Annexe technique', plan: 'Plan', admin: 'Pièce administrative', autre: 'Autre' };
  const LUES = ['cctp', 'dpgf', 'annexe'];
  // Lots CVC / plomberie (y compris « CVS », « fluides », « génie climatique ») ; les autres lots sont écartés
  const CVC = /plomb|sanitaire|chauff|ventil|climat|\bcvc\b|\bcvs\b|\bcvd\b|genie climatique|genie thermique|\bfluides?\b|thermique|\bvmc\b|desenfum|traitement d.air|\bpac\b|pompe a chaleur|\bcfa\b|\bgaz\b/;
  // Numéro et intitulé de lot : « LOT N°04. PLOMBERIE », « Lot 07 - CVC », « DPGFLOT N 21 », « lot_n_8 »
  const LOT = /lot\s*(?:n\s*[°o]?\s*\.?\s*|no\.?\s*|numero\s*)?(\d{1,3})(?![\d])([a-z]?)\b[\s.:,)-]*([^/]*)/;
  function lotDe(texte) {
    const m = LOT.exec(norm(texte).replace(/\.[a-z0-9]{1,5}$/, ''));
    if (!m) return null;
    const intitule = m[3].replace(/\.[a-z0-9]{1,5}$/, '').replace(/[\s.-]+$/, '').trim();
    return { numero: String(+m[1]) + m[2], intitule, cvc: CVC.test(intitule) ? true : intitule.length >= 3 ? false : null };
  }
  // Nature d'après le nom (et les sous-dossiers) — CCTP6, DPGF4, DPGFLOT… (le sigle collé à un numéro compte)
  function natureNom(nom) {
    const t = norm(nom), e = ext(nom);
    if (/^(dwg|dxf|dwf|ifc|rvt|plt|nwd)$/.test(e)) return 'plan';
    if (/^(jpe?g|png|gif|bmp|tiff?|webp|heic)$/.test(e)) return 'autre';
    if (/ppsps|\bpgc\b|plan de prevention|\bccap\b|\bccag\b|clauses administratives|\brc\b|reglement (de |de la )?(la )?consultation|\bae\b|acte d.engagement|\bdc ?[1-4]\b|\bdume\b|attestation|\bplanning\b|calendrier|memoire technique|cadre de (reponse|memoire)|avis d.appel|\baapc\b|lettre de consultation|bordereau d.envoi|amiante|diagnostic|geotechni|rapport (de sol|initial)|\bdiuo\b|\bcoordination\b|\bkbis\b|\burssaf\b/.test(t)) return 'admin';
    if (/cctp|clauses techniques|\bdescriptif\b|cahier des charges techniques|\bctp\b/.test(t)) return 'cctp';
    if (/dpgf|\bdqe\b|\bbpu\b|decomposition du prix|bordereau (des )?prix|quantitatif|\bdpu\b|cadre de decomposition|\bchiffrage\b/.test(t)) return 'dpgf';
    if (/annexe|liste (des )?(equipements|materiels|points)|nomenclature|carnet|tableau des|bilan (thermique|de puissance|des puissances)|note de (calcul|dimensionnement)|fiches? techniques?|\bft\b|caracteristiques des/.test(t)) return 'annexe';
    if (/\bplans?\b|\bpln\b|implantation|\bcoupes?\b|facades?|synoptique|schema|carroyage|\bniveau (r|rdc|ss)|\brdc\b|\br\+\d/.test(t)) return 'plan';
    return '';
  }
  // Nature d'après le contenu (texte de la première page d'un PDF, premières lignes d'un classeur)
  function natureContenu(texte) {
    const t = norm(texte).slice(0, 6000);
    if (!t) return '';
    if (/cahier des clauses techniques|clauses techniques particulieres|\bc\.?c\.?t\.?p\b/.test(t)) return 'cctp';
    if (/decomposition du prix global|bordereau des prix|detail quantitatif estimatif|\bd\.?p\.?g\.?f\b|\bd\.?q\.?e\b/.test(t)) return 'dpgf';
    if (/(prix unitaire|\bp\.? ?u\.?\b|\bpu ht\b)/.test(t) && /(quantite|\bqte\b|\bqt\b|\bq\b|\bu\b|unite)/.test(t)) return 'dpgf';
    if (/(montant|total) h\.?t/.test(t) && /(quantite|\bqte\b|unite)/.test(t)) return 'dpgf';
    if (/reglement de (la )?consultation|acte d.engagement|clauses administratives|plan particulier de securite|plan general de coordination/.test(t)) return 'admin';
    if (/\brepere\b|\brep\.\b/.test(t) && /debit|puissance|\bkw\b|m3\/h|m³\/h/.test(t)) return 'annexe';
    return '';
  }
  // Une pièce : nature (nom d'abord, sinon contenu ; un classeur sans signe est une annexe), lot, retenue ou non, raison
  function classer(piece, texte = '', lotArchive = null) {
    const nom = piece.nom || piece.name || '', chemin = piece.chemin || nom, e = ext(nom);
    const parNom = natureNom(nom) || natureNom(piece.dossier || '').replace(/^(plan|autre)$/, '');
    const parContenu = natureContenu(texte);
    let nature = parNom && parNom !== 'autre' ? parNom : parContenu || parNom;
    // Le contenu corrige un nom trompeur : classeur nommé « annexe » qui est un DPGF chiffré, PDF « descriptif » qui est un RC
    if (parNom === 'annexe' && parContenu === 'dpgf' && /^(xlsx?|xlsm|csv|ods)$/.test(e)) nature = 'dpgf';
    if (!nature) nature = /^(xlsx?|xlsm|csv)$/.test(e) ? 'annexe' : 'autre';
    if (nature === 'annexe' && !/^(xlsx?|xlsm|csv|pdf)$/.test(e)) nature = 'autre';
    if (LUES.includes(nature) && !/^(pdf|xlsx?|xlsm|csv)$/.test(e) && !(nature === 'cctp' && e === 'docx')) nature = 'autre';
    const lot = lotDe(chemin) || lotArchive || null;
    let retenu = LUES.includes(nature), raison = retenu ? '' : nature === 'plan' ? 'plan : listé, non lu' : nature === 'admin' ? 'pièce administrative' : 'non lue';
    if (retenu && lot && lot.cvc === false) { retenu = false; raison = `lot ${lot.numero}${lot.intitule ? ` ${lot.intitule}` : ''} : hors CVC / plomberie`; }
    return { nature, lot, retenu, raison, source: parNom && parNom === nature ? 'nom' : parContenu === nature ? 'contenu' : 'défaut' };
  }
  // Toutes les pièces : classées puis DPGF Excel préféré au PDF du même DPGF (même lot) ; CCTP gardés tous (parties)
  function trier(pieces, { textes = {}, archive = '' } = {}) {
    const lotArchive = archive ? lotDe(archive) : null;
    const out = pieces.map(p => ({ ...p, ...classer(p, textes[p.chemin || p.nom] || '', lotArchive) }));
    const tableur = p => /^(xlsx?|xlsm|csv)$/.test(ext(p.nom));
    const memeLot = (a, b) => !a.lot || !b.lot || a.lot.numero === b.lot.numero;
    out.filter(p => p.retenu && p.nature === 'dpgf' && /^pdf$/.test(ext(p.nom))).forEach(p => {
      const x = out.find(q => q !== p && q.retenu && q.nature === 'dpgf' && tableur(q) && memeLot(p, q));
      if (x) { p.retenu = false; p.raison = `DPGF Excel retenu (${x.nom})`; }
    });
    const ordre = ['cctp', 'dpgf', 'annexe', 'plan', 'admin', 'autre'];
    return out.sort((a, b) => (b.retenu - a.retenu) || ordre.indexOf(a.nature) - ordre.indexOf(b.nature) || String(a.chemin).localeCompare(String(b.chemin), 'fr', { numeric: true }));
  }

  /* ---------- Questions au maître d'œuvre ---------- */
  const CHAPITRE_CAT = { producteur: 'Production', emetteur: 'Émission et traitement d\'air', auxiliaire: 'Distribution et auxiliaires', sanitaire: 'Plomberie sanitaire' };
  const nf = v => (typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : String(v ?? ''));
  const unite = { P: 'kW', Pfr: 'kW', Pel: 'kW', Q: 'm³/h', regime: '°C', regimeChaud: '°C', regimeFroid: '°C', volume: 'L', Pdispo: 'Pa', HMT: 'mCE' };
  const val = (k, v) => `${nf(v)}${unite[k] && typeof v === 'number' ? ` ${unite[k]}` : ''}`;
  const LIB = { P: 'Puissance calorifique', Pfr: 'Puissance frigorifique', Pel: 'Puissance électrique', Q: 'Débit d\'air', regime: 'Régime de température', qte: 'Quantité' };
  // Champs qu'une réponse peut corriger directement dans l'inventaire
  const CORRIGEABLES = ['qte', 'P', 'Pfr', 'Pel', 'Q', 'regime'];
  const refsDe = x => (x && x.sources || []).filter(s => /^(CCTP|DPGF)/.test(s));
  const vide = v => v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v));
  const hydro = g => /^(chaudiere|pac-eau|pac-rev|gf-air|echangeur)/.test(g || '') || g === 'pac-air';
  const air = g => /^(cta)$/.test(g || '');
  // Questions numérotées, regroupées par chapitre : { cle, chapitre, type, designation, texte, refs, champ?, choix? }
  function questions(ecarts = [], inventaire = []) {
    const out = [], vu = new Set();
    const item = d => inventaire.find(x => x.designation === d);
    const chap = x => (x && (x.chapitre || CHAPITRE_CAT[x.categorie])) || 'Généralités';
    const art = x => (refsDe(x).find(s => /^CCTP/.test(s)) || 'CCTP').replace(/^CCTP\s*/, '') || '';
    const lig = x => (refsDe(x).find(s => /^DPGF/.test(s)) || 'DPGF').replace(/^DPGF\s*/, '') || '';
    const ajouter = q => { if (vu.has(q.cle)) return; vu.add(q.cle); out.push(q); };
    ecarts.forEach(e => {
      const x = item(e.designation), d = `« ${e.designation} »`, base = { type: e.type, designation: e.designation, chapitre: chap(x), refs: refsDe(x) };
      const cle = `${e.type}|${norm(e.designation)}|${e.champ || ''}`;
      if (e.type === 'absent-dpgf') ajouter({ ...base, cle, texte: `${d} est décrit au CCTP${art(x) ? ` (${art(x)})` : ''} mais n'est pas chiffré au DPGF : faut-il l'ajouter au DPGF, ou est-il fourni par un autre lot ?` });
      else if (e.type === 'absent-cctp') ajouter({ ...base, cle, texte: `${d} est chiffré au DPGF${lig(x) ? ` (ligne ${lig(x)})` : ''} mais n'est pas décrit au CCTP : quelles caractéristiques (puissance, débit, régime, marque) faut-il retenir ?` });
      else if (e.type === 'quantite') {
        const qc = x && x.qteCctp, qd = x && x.qte;
        ajouter({ ...base, cle, champ: 'qte', texte: `Quantité de ${d} : ${vide(qc) ? '?' : nf(qc)} au CCTP${art(x) ? ` (${art(x)})` : ''}, ${vide(qd) ? '?' : nf(qd)} au DPGF${lig(x) ? ` (ligne ${lig(x)})` : ''} : laquelle retenir ?`,
          choix: [vide(qc) ? null : { libelle: `CCTP : ${nf(qc)}`, v: qc }, vide(qd) ? null : { libelle: `DPGF : ${nf(qd)}`, v: qd }].filter(Boolean) });
      } else if (e.type === 'marque') ajouter({ ...base, cle, texte: `Marque de ${d} différente : ${e.texte.replace(/^Marque\s*:\s*/, '')} La marque est-elle imposée, ou une marque « ou équivalent » est-elle acceptée ?` });
      else if (e.type === 'valeur') {
        const k = ((x && x.conflits) || []).find(c => c.champ === e.champ);
        const lib = (k && k.libelle) || LIB[e.champ] || e.champ || 'Valeur';
        const texte = k ? `${lib} de ${d} : ${val(e.champ, k.cctp)} au CCTP (${String(k.sourceCctp || '').replace(/^CCTP\s*/, '')}), ${val(e.champ, k.dpgf)} au DPGF (${String(k.sourceDpgf || '').replace(/^DPGF\s*/, '')}) : laquelle retenir ?`
          : `${d} — ${e.texte.replace(/\.$/, '')} : laquelle retenir ?`;
        ajouter({ ...base, cle, champ: e.champ, texte, ...(k && CORRIGEABLES.includes(e.champ) ? { choix: [{ libelle: `CCTP : ${val(e.champ, k.cctp)}`, v: k.cctp }, { libelle: `DPGF : ${val(e.champ, k.dpgf)}`, v: k.dpgf }] } : {}) });
      }
    });
    const sansCctp = new Set(ecarts.filter(e => e.type === 'absent-cctp').map(e => e.designation));
    const retenus = inventaire.filter(x => !x.variante && x.inclus !== false);
    // Marque imposée sans « ou équivalent » (gros équipements)
    retenus.filter(x => !sansCctp.has(x.designation) && (x.principal || x.categorie === 'producteur') && /\bmarque\s+[A-Za-z]/i.test(x.prescrit || '') && !(x.details || {}).equivalent && !/equivalent|similaire/.test(norm(x.prescrit))).forEach(x => {
      ajouter({ cle: `marque-imposee|${norm(x.designation)}|`, type: 'marque-imposee', designation: x.designation, chapitre: chap(x), refs: refsDe(x), texte: `${x.prescrit.replace(/\.$/, '').replace(/^./, c => c.toUpperCase())} pour « ${x.designation} » sans mention « ou équivalent » : une marque équivalente est-elle acceptée (variante) ?` });
    });
    // Caractéristiques manquantes pour dimensionner : puissance, régime, débit (gros équipements) ; puissances des émetteurs
    retenus.filter(x => !sansCctp.has(x.designation) && (x.principal || x.categorie === 'producteur')).forEach(x => {
      const manque = [];
      if (x.categorie === 'producteur' && vide(x.P) && vide(x.Pfr)) manque.push('puissance');
      if (hydro(x.genre) && vide(x.regime) && !(x.champs && (x.champs.regimeChaud || x.champs.regimeFroid))) manque.push('régime de température');
      if (air(x.genre) && vide(x.Q)) manque.push('débit d\'air');
      if (air(x.genre) && vide(x.P) && vide(x.Pfr) && !manque.includes('puissance')) manque.push('puissance des batteries');
      if (manque.length) ajouter({ cle: `caracteristiques|${norm(x.designation)}|${manque.join(',')}`, type: 'caracteristiques', designation: x.designation, chapitre: chap(x), refs: refsDe(x),
        texte: `« ${x.designation} » : ${manque.join(', ')} à préciser (absent du dossier, nécessaire au dimensionnement).` });
    });
    const emetteurs = retenus.filter(x => x.categorie === 'emetteur' && !x.principal && !air(x.genre) && !/^bouche|^ecs$/.test(x.genre || '') && vide(x.P) && vide(x.Pfr) && !sansCctp.has(x.designation));
    if (emetteurs.length) ajouter({ cle: `puissances-emetteurs|${emetteurs.map(x => norm(x.designation)).sort().join(';').slice(0, 200)}|`, type: 'caracteristiques', designation: 'Émetteurs', chapitre: chap(emetteurs[0]), refs: [...new Set(emetteurs.flatMap(refsDe))].slice(0, 8),
      texte: `Puissances unitaires non indiquées pour ${emetteurs.length > 1 ? 'les émetteurs' : 'l\'émetteur'} ${emetteurs.slice(0, 6).map(x => `« ${x.designation} »`).join(', ')}${emetteurs.length > 6 ? ` et ${emetteurs.length - 6} autre(s)` : ''} : merci de fournir les puissances ou le bilan des déperditions par local.` });
    // Regroupées par chapitre (dans l'ordre d'apparition), puis numérotées
    const chapitres = [...new Set(out.map(q => q.chapitre))];
    const triees = chapitres.flatMap(c => out.filter(q => q.chapitre === c));
    triees.forEach((q, i) => { q.n = i + 1; });
    return triees;
  }
  // Suivi enregistré dans l'étude (et.questionsMoe : [{ cle, posee, recue, reponse, retenu, date }]) reporté sur les questions
  function avecSuivi(qs, suivi = []) {
    const m = new Map((suivi || []).map(s => [s.cle, s]));
    return qs.map(q => ({ ...q, ...(m.has(q.cle) ? { posee: !!m.get(q.cle).posee, recue: !!m.get(q.cle).recue, reponse: m.get(q.cle).reponse || '', retenu: m.get(q.cle).retenu, date: m.get(q.cle).date } : {}) }));
  }
  // Suivi à enregistrer : celui des questions actuelles, plus l'ancien des questions disparues (écart levé depuis)
  function suiviDe(qs, ancien = []) {
    const actuel = qs.filter(q => q.posee || q.recue || q.reponse || q.retenu !== undefined).map(q => ({ cle: q.cle, texte: q.texte, chapitre: q.chapitre, posee: !!q.posee, recue: !!q.recue, reponse: q.reponse || '', ...(q.retenu !== undefined ? { retenu: q.retenu } : {}), date: q.date || '' }));
    const cles = new Set(qs.map(q => q.cle));
    return [...actuel, ...(ancien || []).filter(s => !cles.has(s.cle))];
  }
  // Réponse reçue qui tranche une valeur : reportée sur les lignes de l'inventaire de même désignation
  function appliquerReponse(inventaire, q, v) {
    if (!q || !q.champ || !CORRIGEABLES.includes(q.champ)) return 0;
    let n = 0;
    inventaire.filter(x => x.designation === q.designation).forEach(x => {
      x[q.champ] = v;
      x.champs = { ...(x.champs || {}), [q.champ]: { v, source: 'Réponse du maître d\'œuvre', confiance: 'moyenne' } };
      x.conflits = (x.conflits || []).filter(c => c.champ !== q.champ);
      if (q.champ === 'qte') x.qteCctp = typeof v === 'number' ? v : x.qteCctp;
      n++;
    });
    return n;
  }
  const grouper = qs => [...new Set(qs.map(q => q.chapitre))].map(c => [c, qs.filter(q => q.chapitre === c)]);
  // Texte à coller dans un mail ou la plateforme de consultation
  function questionsTexte(qs, { objet = '', lot = '' } = {}) {
    const lignes = [`Objet : questions en période de consultation${objet ? ` — ${objet}` : ''}${lot ? ` — ${lot}` : ''}`, '', 'Madame, Monsieur,', '',
      'Dans le cadre de la consultation, nous vous remercions de bien vouloir nous apporter les précisions suivantes :', ''];
    grouper(qs).forEach(([c, l]) => {
      lignes.push(c.toUpperCase());
      l.forEach(q => lignes.push(`${q.n}. ${q.texte}${q.refs && q.refs.length ? ` [${q.refs.join(' ; ')}]` : ''}`));
      lignes.push('');
    });
    lignes.push('Restant à votre disposition, nous vous prions d\'agréer, Madame, Monsieur, nos salutations distinguées.');
    return lignes.join('\n');
  }
  // Blocs du document Word (Docx.build) : un tableau par chapitre, colonne réponse
  function questionsBlocs(qs, { titre = 'Questions au maître d\'œuvre', affaire = '', date = '' } = {}) {
    const blocs = [{ h1: titre }, { note: [affaire, date].filter(Boolean).join(' · ') },
      { p: 'Questions posées pendant la période de consultation, d\'après la comparaison du CCTP et du DPGF : équipements décrits mais non chiffrés (ou l\'inverse), quantités, valeurs ou marques différentes, caractéristiques manquantes pour le dimensionnement.' }];
    grouper(qs).forEach(([c, l]) => blocs.push({ h2: c }, { table: { entetes: ['N°', 'Question', 'Références', 'Réponse'], lignes: l.map(q => [String(q.n), q.texte, (q.refs || []).join('\n'), q.reponse || '']) } }));
    return blocs;
  }

  return { decompresser, NATURES, LUES, lotDe, natureNom, natureContenu, classer, trier, ext, questions, avecSuivi, suiviDe, appliquerReponse, questionsTexte, questionsBlocs, CORRIGEABLES };
})();
if (typeof module !== 'undefined') module.exports = Dce;
