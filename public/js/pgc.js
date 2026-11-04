// Lecture d'un PGC (plan général de coordination du coordonnateur SPS) pour pré-remplir le PPSPS de l'entreprise :
// opération, adresse, intervenants (maître d'ouvrage, architecte / maître d'œuvre, OPC, bureaux d'études, contrôleur),
// coordonnateur SPS, effectifs, durée, horaires, secours, base vie, délai de remise du PPSPS, exigences du coordonnateur
// (avec le lot qui en a la charge : EC, TCE, CVC…) et risques évoqués.
// Entrée : les lignes de texte du PDF (PdfLecture.lire : cellules séparées par des tabulations, ou mise en page par
// espaces). Module partagé navigateur / serveur.
const Pgc = (() => {
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, '\'');
  const propre = s => String(s || '').replace(/[\t ]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s:.\-–•·*<>4]+(?=\S)|[\s:.\-–•·*]+$/g, '').trim();
  const cellules = l => String(l).split(/\t|\s{3,}/).map(x => x.trim()).filter(Boolean);
  const TEL = /(?:\+33\s?|0)[1-9](?:[ .-]?\d{2}){4}/;
  const MAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
  const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  // Codes des lots (colonnes « Installation » / « Entretien » du PGC) : EC = entreprise concernée, TCE = tous corps d'état…
  const CODES = 'EC|TCE|CES|GO|MO|MOE|MO-Moe|OPC|CSPS|CP|SO|VRD|D|T|DESA|DESAM|PAR|ETAN|CHAR|CHARP|COUV|EL|PB|CVC|MEX|MIN|PLAQ|FA|CAR|ENR|SERR|ASC|VDR|GO-CP|GO-EC|EL-PB-CVC|MOE-SERR|GO-MEX|MOE - GO|GO/MOE|GO - VRD|MO - VRD|MO - GO|D et GO|DESA - D|DESA - TCE|EC - MO|VRD - GO|TCE\\s+EC';
  const CODE_FIN = new RegExp(`(?:\\s{2,}|\\t)((?:${CODES})(?:\\s*[-/]\\s*(?:${CODES}))*)(?:(?:\\s{2,}|\\t)((?:${CODES})(?:\\s*[-/]\\s*(?:${CODES}))*))?\\s*$`);

  function lireDate(s) {
    const t = norm(s);
    let m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
    if (m) { const a = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    m = new RegExp(`(?:(\\d{1,2})(?:er)?\\s+)?(${MOIS.join('|')})\\s+(\\d{4})`).exec(t);
    if (m) return `${m[3]}-${String(MOIS.indexOf(m[2]) + 1).padStart(2, '0')}-${(m[1] || '1').padStart(2, '0')}`;
    return '';
  }
  const chercher = (lignes, re, depuis = 0) => { for (let i = depuis; i < lignes.length; i++) if (re.test(norm(lignes[i]))) return i; return -1; };
  // Valeur d'une rubrique « Libellé : valeur » (ou valeur sur la ligne suivante)
  function valeur(lignes, i) {
    const l = lignes[i], k = l.indexOf(':');
    let v = propre(k >= 0 ? l.slice(k + 1) : cellules(l).slice(1).join(' '));
    if (!v && lignes[i + 1]) v = propre(lignes[i + 1]);
    return v.slice(0, 220);
  }

  // Tableau des intervenants (§ « Présentation des intervenants ») : une ligne par rôle, puis ses lignes de suite
  const ROLES = /^(ma[iî]tre d'ouvrage|ma[iî]trise d'ouvrage|architecte|ma[iî]tre d'(?:œ|oe)uvre|ma[iî]trise d'(?:œ|oe)uvre|opc|pilote|bet\b[^\t]*|bureau d'[ée]tudes[^\t]*|bureau de contr[ôo]le|contr[ôo]leur technique|coordonnateur sps|assistant[^\t]*ma[iî]trise d'ouvrage|amo\b)/i;
  function intervenants(lignes) {
    // Le titre du tableau (pas la ligne du sommaire) : le dernier titre « intervenants » suivi d'un rôle dans les lignes proches
    const titres = lignes.map((l, i) => (/intervenants maitrise d'ouvrage|presentation des intervenants|^\W*\d[.\d]*\s+intervenants/.test(norm(l)) ? i : -1)).filter(i => i >= 0);
    const deb = titres.reverse().find(i => lignes.slice(i + 1, i + 8).some(l => ROLES.test(propre(cellules(l)[0] || '')))) ?? -1;
    if (deb < 0) return [];
    const out = [];
    let cur = null;
    for (let i = deb + 1; i < Math.min(lignes.length, deb + 80); i++) {
      const l = lignes[i], c = cellules(l);
      if (/^\s*\d+(\.\d+)+\s/.test(l) && cur) break; // section suivante
      if (/^(designation|raison sociale)/i.test(propre(l))) continue;
      const m = ROLES.exec(propre(c[0] || ''));
      if (m) { cur = { role: propre(c[0]).replace(/\s+[A-Z]{2,}.*$/, '') || propre(c[0]), lignes: [c.slice(1)] }; out.push(cur); continue; }
      if (cur) cur.lignes.push(c);
    }
    return out.map(x => {
      const tout = x.lignes.flat().map(propre).filter(Boolean), texte = tout.join(' ');
      const contact = tout.find(t => /^(m\.|mr|mme|monsieur|madame)\b/i.test(t)) || '';
      const nom = [];
      for (const cols of x.lignes) { const v = propre(cols[0] || ''); if (!v || /^(m\.|mr|mme|monsieur|madame)\b/i.test(v) || TEL.test(v) || MAIL.test(v) || /^\d/.test(v)) break; nom.push(v); }
      const adresse = x.lignes.map(cols => propre(cols[cols.length - 1] || '')).filter(v => v && !TEL.test(v) && !MAIL.test(v) && !/^fax/i.test(v) && !nom.includes(v) && v !== contact.replace(MAIL, '').trim());
      return { role: x.role, societe: nom.join(' '), contact: propre(contact.replace(MAIL, '')), adresse: adresse.join(', ').slice(0, 160),
        tel: ((/t[ée]l\s*:?\s*([+\d][\d .-]{8,})/i.exec(texte) || [])[1] || (TEL.exec(texte) || [''])[0]).trim().replace(/[.-]/g, ' '), email: (MAIL.exec(texte) || [''])[0] };
    }).filter(x => x.societe || x.contact);
  }

  // Coordonnateur SPS : nom (« Le coordonnateur SPS » puis le nom), société et coordonnées de l'agence (en-tête)
  function coordonnateur(lignes) {
    const r = {};
    const i = chercher(lignes, /^\W*(le )?coordonnateur(?: s\.?p\.?s\.?)?\s*:?\s*$/);
    if (i >= 0) r.nom = propre(lignes[i + 1]);
    else { const j = chercher(lignes, /coordonnateur(?: s\.?p\.?s\.?)?\s*:/); if (j >= 0) r.nom = valeur(lignes, j); }
    const tete = lignes.slice(0, 15).join('\n');
    const soc = lignes.find(l => /alpes contr[ôo]les|apave|socotec|bureau veritas|qualiconsult|dekra|ceten|elyfec|bureau [a-z]+ contr[ôo]les?|agence csps/i.test(l));
    if (soc) r.societe = propre(cellules(soc)[0]).replace(/\s*-\s*si[èe]ge social.*$/i, '');
    const tel = TEL.exec(tete), mail = MAIL.exec(tete);
    if (tel) r.tel = tel[0].replace(/[.-]/g, ' ');
    if (mail) r.email = mail[0];
    const ag = lignes.slice(0, 6).map(propre).filter(l => l && !TEL.test(l) && !MAIL.test(l));
    if (ag.length >= 2) r.adresse = ag.slice(1, 3).join(', ');
    return r;
  }

  // Phrases reconstituées : lignes coupées par la mise en page recollées, codes de lot en fin de ligne retirés et gardés
  function phrases(lignes) {
    const out = [];
    let cur = null;
    lignes.forEach(brute => {
      let l = String(brute).replace(/\t/g, '   ');
      if (/^\s*(pgc|sps[- ]r0|a\d{2}s\d+|chapitre \d)/i.test(l.trim()) || /page \d+\/\d+/i.test(l)) return;
      let lots = '';
      const m = CODE_FIN.exec(l);
      if (m) { lots = [m[1], m[2]].filter(Boolean).join(' / '); l = l.slice(0, m.index); }
      const t = propre(l);
      if (!t) return;
      const puce = /^\s*[<4•\-–]\s/.test(l) || /^\s*[]/.test(l);
      const titre = /^\s*\d+(\.\d+)+\s/.test(l) || (t.length < 70 && !/[.,;:]$/.test(t) && /^[A-ZÉÈ]/.test(t) && !lots && !cur);
      const suite = /^[a-zàâéèêëîïôûùç(«"]/.test(t) || (/^\d/.test(t) && !/^\d+(\.\d+)*\s+[A-ZÉ]{2,}/.test(t) && !/^\d{5}\b/.test(t) && cur && cur.t.length > 40);
      if (cur && !puce && !titre && !/[.:]$/.test(cur.t) && suite) { cur.t += ` ${t}`; if (lots && !cur.lots) cur.lots = lots; return; }
      cur = { t, lots, titre }; out.push(cur);
    });
    // Codes de lot glissés dans la phrase par la mise en page (« devra être EC formalisé ») : retirés et gardés
    const inline = new RegExp(`(?<!\\b(?:lot|le|du|au|par))\\s((?:${CODES})(?:\\s*[-/]\\s*(?:${CODES}))*)\\s(?=[a-zàâéèêëîïôûùç(])`, 'g');
    out.forEach(p => { p.t = p.t.replace(inline, (m, c) => { p.lots = [p.lots, c].filter(Boolean).join(' / '); return ' '; }).replace(/\s{2,}/g, ' '); });
    return out;
  }
  const IMPERATIF = /\b(obligatoire|obligatoirement|interdit|interdite|interdiction|devra|devront|doit|doivent|imperati|exige|permis de feu|autorisation de conduite|port d[eu]s? |balisage|consignation|transmettre|ppsps|inspection commune|fiches? de donnees de securite|\bfds\b|secouriste|extincteur|surveillance)/;

  function analyser(lignesBrutes, opts = {}) {
    const lignes = (lignesBrutes || []).map(l => String(l)).filter(l => l.trim());
    const texte = lignes.join('\n'), t = norm(texte), r = {};
    // Opération et adresse
    let i = chercher(lignes, /nom de l'operation|intitule de l'operation|designation de l'operation/);
    if (i >= 0) r.operation = valeur(lignes, i);
    else { i = chercher(lignes, /^\W*operation\s*:?\s*$/); if (i >= 0) r.operation = propre(lignes[i + 1]); }
    i = chercher(lignes, /^\W*(adresse(?: du chantier| de l'operation| des travaux)?|lieu des travaux|situation du chantier)\s*:/);
    if (i >= 0) { r.adresse = valeur(lignes, i); const s = propre(lignes[i + 1] || ''); if (/^\d{5}\b/.test(s) && !r.adresse.includes(s.slice(0, 5))) r.adresse += `, ${s.replace(/^(\d{5})\s*-\s*/, '$1 ')}`; }
    else if (r.operation) { const j = lignes.findIndex(l => propre(l) === r.operation); if (j >= 0 && /\d/.test(lignes[j + 1] || '')) r.adresse = [propre(lignes[j + 1]), /^\d{5}/.test(propre(lignes[j + 2] || '')) ? propre(lignes[j + 2]) : ''].filter(Boolean).join(', '); }
    i = chercher(lignes, /type d'ouvrage\s*:/); if (i >= 0) r.typeOuvrage = valeur(lignes, i);
    // Intervenants et coordonnateur
    r.intervenants = intervenants(lignes);
    const moa = r.intervenants.find(x => /ouvrage/i.test(x.role));
    if (moa) r.moa = moa.societe;
    else { i = chercher(lignes, /^\W*ma[iî]tre d'ouvrage\s*:?\s*$/); if (i >= 0) r.moa = propre(lignes[i + 1]); }
    const moe = r.intervenants.find(x => /architecte|(œ|oe)uvre/i.test(x.role)); if (moe) r.moe = moe.societe;
    const cs = coordonnateur(lignes);
    if (cs.nom) r.coordonnateur = [cs.nom, cs.societe].filter(Boolean).join(' – ');
    if (cs.tel) r.coordTel = cs.tel;
    if (cs.email) r.coordEmail = cs.email;
    if (cs.adresse) r.coordAdresse = cs.adresse;
    // Catégorie, effectifs, durée, dates
    const cat = /classee? (?:par le maitre d'ouvrage )?en categorie\s*(\d)/.exec(t) || /categorie\s*(\d)\b/.exec(t); if (cat) r.categorie = +cat[1];
    const em = /effectif moyen[^\d\n]{0,60}(\d{1,4})/.exec(t); if (em) r.effectif = +em[1];
    const ep = /effectif (?:de pointe|maximum|max)[^\d\n]{0,60}(\d{1,4})/.exec(t); if (ep) r.effectifMax = +ep[1];
    if (!em) { const e = /effectif[^\d\n]{0,40}(\d{1,4})/.exec(t); if (e) r.effectif = +e[1]; }
    const du = /duree d'execution des travaux[^\d\n]{0,30}(\d+)\s*(mois|semaines|jours)/.exec(t) || /duree (?:des travaux|du chantier|previsionnelle)[^\d\n]{0,30}(\d+)\s*(mois|semaines|jours)/.exec(t); if (du) r.duree = `${du[1]} ${du[2]}`;
    i = chercher(lignes, /(?:demarrage|debut) (?:des travaux|du chantier|previsionnel)|date de (?:demarrage|debut)/); if (i >= 0) { const d = lireDate(lignes[i]) || lireDate(lignes[i + 1] || ''); if (d) r.debut = d; }
    i = chercher(lignes, /fin (?:des travaux|du chantier|previsionnelle)|achevement des travaux/); if (i >= 0) { const d = lireDate(lignes[i]) || lireDate(lignes[i + 1] || ''); if (d) r.fin = d; }
    i = chercher(lignes, /^\W*date d'edition/); if (i >= 0) r.dateEdition = lireDate(lignes[i]);
    i = chercher(lignes, /^\W*reference\s*:/); if (i >= 0) r.reference = valeur(lignes, i);
    // Horaires (une ligne avec des heures)
    i = chercher(lignes, /horaires?/);
    while (i >= 0) { const v = [lignes[i], lignes[i + 1] || ''].map(propre).find(x => /\d{1,2}\s*h\s*\d{0,2}\s*(?:-|–|a|à)/i.test(x)); if (v) { r.horaires = propre(v.replace(/^.*?horaires?[^:]*:?/i, '')).slice(0, 160); break; } i = chercher(lignes, /horaires?/, i + 1); }
    // Secours
    i = chercher(lignes, /centre hospitalier|hopital|\bchu\b|clinique/);
    if (i >= 0) r.hopital = propre(lignes.slice(i, i + 3).map(propre).join(', ').replace(/^.*?(?=(?:centre hospitalier|h[ôo]pital|chu|clinique))/i, '')).slice(0, 200);
    i = chercher(lignes, /point de rassemblement|lieu de rassemblement/); if (i >= 0) { const v = valeur(lignes, i); if (v && v.length > 3) r.rassemblement = v; }
    if (/secouriste dans la proportion de 1 pour (\d+)/.test(t)) r.sstRatio = +/secouriste dans la proportion de 1 pour (\d+)/.exec(t)[1];
    // Base vie : locaux communs mis en place par le gros œuvre
    if (/locaux communs|base vie|cantonnement/.test(t)) {
      const parGo = /[Bb]ase vie[\s\S]{0,1500}?\bGO\b/.test(texte) || /[Ll]ocaux communs[\s\S]{0,800}?\bGO\b/.test(texte);
      r.baseVie = `Utilisation des locaux communs prévus au PGC (base vie : bureau de chantier, vestiaires, réfectoire, sanitaires et lavabos, point d'eau potable)${parGo ? ', mis en place et entretenus par le lot Gros œuvre' : ''}.`;
    }
    const dl = /ppsps[^.\n]{0,120}?(\d{1,3})\s*jours/.exec(t) || /(\d{1,3})\s*jours[^.\n]{0,80}ppsps/.exec(t); if (dl) r.delaiPpsps = +dl[1];
    // Exigences : phrases impératives à la charge de l'entreprise (EC, TCE, CES) ou du lot de l'entreprise
    const lot = new RegExp(`\\b(EC|TCE|CES|${(opts.lots || ['CVC', 'PB']).join('|')})\\b`);
    const notreLot = new RegExp(`\\b(${(opts.lots || ['CVC', 'PB']).join('|')})\\b`);
    const vus = new Set();
    r.exigences = phrases(lignes).filter(p => !p.titre && (p.t.length > 60 || /[.]$/.test(p.t)) && p.t.length < 420 && (IMPERATIF.test(norm(p.t)) || (p.lots && notreLot.test(p.lots))) && (!p.lots || lot.test(p.lots))
        && !/par le ma[iî]tre d'ouvrage|ma[iî]tre d'ouvrage (doit|devra)|lot gros (œ|oe)uvre|organisme agr/i.test(p.t))
      .filter(p => { const k = norm(p.t).slice(0, 80); if (vus.has(k)) return false; vus.add(k); return true; })
      .filter(p => !/suivant(e)?s\s*:?$/i.test(p.t)).map(p => ({ texte: p.t, lots: p.lots })).slice(0, 80);
    // Moyens mis en commun dont l'entreprise est utilisatrice (ex. grue du lot charpente pour le CVC)
    const mc = lignes.filter(l => new RegExp(`\\b(${(opts.lots || ['CVC', 'PB']).join('|')})\\b`).test(l) && /levage|grue|echafaud|nacelle|moyen/i.test(norm(l))).map(propre);
    if (mc.length) r.moyensCommuns = mc.slice(0, 5);
    r.risques = typeof Securite !== 'undefined' ? Securite.detecter(r.exigences.map(e => e.texte).join(' ')) : [];
    return r;
  }
  return { analyser, lireDate, phrases };
})();
if (typeof module !== 'undefined') module.exports = Pgc;
