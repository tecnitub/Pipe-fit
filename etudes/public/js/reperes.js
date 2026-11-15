// Table des repères d'une étude : un seul repère par équipement, partout. Un même équipement (pompe PC1, CTA, extracteur
// EXT-PK-1, unité extérieure UE1-N2, thermostat TS-PL…) apparaît dans plusieurs pièces : la note de calcul qui le
// dimensionne, la ligne de l'armoire électrique (src stable « <note>:<clé> »), les points GTC (nommés d'après la ligne
// d'armoire), le poste du métré et la ligne du matériel retenu (clé « annexe|<type>|<repère> » ou clé de dimension),
// les fiches de mise en service. Ce module :
//  - construit la table repère → équipement avec toutes ses sources ;
//  - détecte les conflits (même repère pour deux équipements, même équipement sous deux repères, ligne d'armoire
//    restée sous un ancien repère) ;
//  - renomme un repère à un seul endroit et propage le nouveau repère partout où il est stocké dans l'étude (champ de
//    la note qui le porte, sinon renommage mémorisé et appliqué au calcul de l'armoire ; lignes d'armoire et leurs
//    sources, réglages des points GTC, clés du matériel retenu avec leur statut, réserves, références entre calculs,
//    renumérotations transmises aux PV du chantier) et liste ce qui est hors de l'étude (étiquettes imprimées,
//    commandes passées, documents et DOE déjà émis) ;
//  - photographie l'état des équipements (puissances, protections, débits, modèles, points GTC, MES) pour les
//    conséquences d'un changement après émission (revisions.js).
// Module commun navigateur / node (tests).
const Reperes = (() => {
  const req = f => { try { return require(f); } catch (e) { return null; } };
  const Nt = () => (typeof Notes !== 'undefined' ? Notes : req('./notes'));
  const El = () => (typeof Electricite !== 'undefined' ? Electricite : req('./electricite'));
  const Li = () => (typeof Liens !== 'undefined' ? Liens : req('./liens'));
  const Me = () => (typeof Metre !== 'undefined' ? Metre : req('./metre'));
  const Pm = () => (typeof PointsMes !== 'undefined' ? PointsMes : req('./points-mes'));
  const Rg = () => (typeof Registre !== 'undefined' ? Registre : req('./registre'));
  const txt = v => String(v ?? '').trim();
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const echap = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Repère pris comme un mot (« PC1 » dans « Pompe PC1 », pas dans « PC10 »)
  const motRe = r => new RegExp(`(^|[^A-Za-z0-9_-])${echap(r)}(?![A-Za-z0-9_])`, 'g');
  const remplacerMot = (s, a, b) => String(s).replace(motRe(a), (m, p) => `${p}${b}`);
  const contientMot = (s, a) => !!a && motRe(a).test(String(s));
  const VALIDES = ['Validé', 'Validé avec réserves'];
  const ENGAGES = [...VALIDES, 'Soumis au client'];
  const aujourdhui = () => new Date().toISOString().slice(0, 10);
  const noteDe = (et, id) => ((et && et.notes) || []).find(n => n.id === id) || null;
  const libNote = (et, n) => (n ? `N${et.notes.indexOf(n) + 1} — ${n.titre || n.type}` : '');
  const noteDeSrc = src => String(src || '').split(':')[0];
  const sansMoteur = src => String(src || '').replace(/#M\d+$/, '');
  const essai = (f, d) => { try { return f(); } catch (e) { return d; } };

  /* ---------- Lectures ---------- */
  const derives = et => essai(() => El().equipementsEtude(et, Li()), []);
  const notesElec = et => ((et && et.notes) || []).filter(n => n.type === 'elec');
  const lignesArmoire = et => notesElec(et).flatMap(n => ((n.entrees || {}).equipements || []).map((l, i) => ({ n, l, i })).filter(x => x.l));
  const postes = et => essai(() => Me().metre(et), []);
  const pointsMes = et => essai(() => appliquerMes(et, Pm().extraire(et, n => Li().calculer(et, n))), []);
  const calcElec = (et, n) => essai(() => Li().calculer(et, n), null);
  // Bouches des schémas aérauliques (repérées, sans ligne d'armoire)
  const bouches = et => ((et && et.notes) || []).filter(n => n.type === 'aero').flatMap(n => ((n.entrees || {}).bouchesL || []).map((b, i) => ({ n, b, i })).filter(x => x.b && txt(x.b.rep)));

  // Points de mise en service : repères renommés sans champ dans le calcul (pompe d'un circuit « PC1 »…) appliqués
  function appliquerMes(et, points) {
    const ren = Object.values((et && et.renommesReperes) || {}).filter(r => r && r.de && r.vers);
    if (!ren.length) return points;
    return (points || []).map(p => {
      let q = p;
      ren.filter(r => !r.noteId || r.noteId === p.noteId).forEach(r => {
        if (txt(q.repere) === r.de || contientMot(q.titre, r.de)) q = { ...q, repere: txt(q.repere) === r.de ? r.vers : q.repere, titre: remplacerMot(q.titre || '', r.de, r.vers) };
      });
      return q;
    });
  }

  /* ---------- Table des repères ---------- */
  // { lignes: [{ cle, rep, designation, type, noteId, note, src, armoire, derive, gtb, metre, materiel, mes, sources }], conflits }
  function table(et, opts = {}) {
    const der = opts.derives || derives(et), arm = lignesArmoire(et), out = new Map();
    const derParSrc = new Map(der.filter(q => q.src).map(q => [q.src, q]));
    const ajouter = (cle, o) => { if (!out.has(cle)) out.set(cle, { cle, rep: '', designation: '', type: '', noteId: '', note: '', src: '', armoire: null, derive: null, gtb: 0, points: [], metre: [], materiel: [], mes: [], bouche: null, armoireRep: null, ...o }); return out.get(cle); };
    // Armoires CVC elles-mêmes
    notesElec(et).forEach(n => ((n.entrees || {}).armoires || []).forEach((a, i) => { if (txt(a && a.rep)) ajouter(`arm:${n.id}:${i}`, { rep: txt(a.rep), designation: `Armoire CVC${a.local ? ` — ${a.local}` : ''}`, type: 'armoire', noteId: n.id, note: libNote(et, n), armoireRep: { noteId: n.id, i } }); }));
    // Lignes d'armoire (repère stocké)
    arm.forEach(({ n, l, i }) => {
      const src = txt(l.src), d = src ? derParSrc.get(src) : null, nid = src && noteDe(et, noteDeSrc(src)) ? noteDeSrc(src) : n.id;
      const x = ajouter(src || `man:${n.id}:${i}`, { rep: txt(l.rep), designation: txt(l.designation), type: l.type || '', src, noteId: nid, note: libNote(et, noteDe(et, nid)) });
      x.armoire = { noteId: n.id, i, rep: txt(l.rep), note: libNote(et, n) };
      if (d) { x.derive = txt(d.rep); if (d.metre) x.metre.push(d.metre); }
    });
    // Équipements calculés sans ligne d'armoire (pas encore repris, ou pas de calcul d'armoire)
    der.forEach(q => {
      if (q.src && out.has(q.src)) return;
      const nid = noteDe(et, noteDeSrc(q.src)) ? noteDeSrc(q.src) : '';
      const x = ajouter(q.src || `der:${q.rep}`, { rep: txt(q.rep), designation: txt(q.designation), type: q.type || '', src: txt(q.src), noteId: nid, note: libNote(et, noteDe(et, nid)), derive: txt(q.rep) });
      if (q.metre) x.metre.push(q.metre);
    });
    // Bouches (schémas aérauliques)
    bouches(et).forEach(({ n, b, i }) => ajouter(`bouche:${n.id}:${i}`, { rep: txt(b.rep), designation: `Bouche${b.salle ? ` — ${b.salle}` : ''}${b.reseau ? ` (${b.reseau})` : ''}`, type: 'bouche', noteId: n.id, note: libNote(et, n), bouche: { noteId: n.id, i } }));
    const lignes = [...out.values()], parRep = new Map();
    lignes.forEach(x => { if (!parRep.has(x.rep)) parRep.set(x.rep, []); parRep.get(x.rep).push(x); });
    // Points GTC (src de la ligne d'armoire, sinon repère)
    if (opts.gtb !== false) notesElec(et).forEach(n => { const r = calcElec(et, n), pts = (r && r.valeurs && r.valeurs.listePoints) || []; pts.forEach(p => { const x = (p[8] && out.get(sansMoteur(p[8]))) || (parRep.get(String(p[0]).split('.')[0]) || [])[0]; if (x) { x.gtb++; if (x.points.length < 40) x.points.push(`${p[0]} — ${p[7] || p[1]}`); } }); });
    // Métré et matériel retenu : postes « annexe|<type>|<repère> » rattachés par le repère et la note
    const ps = opts.postes || (opts.metre === false ? [] : postes(et)), m = (et && et.materiel) || {};
    // (poste d'un groupe « EXT-PK » : rattaché aux équipements « EXT-PK-1 », « EXT-PK-2 »… de la note qui n'ont pas leur propre poste)
    const deNote = (x, p) => !x.noteId || (p.sources || []).includes(`N${et.notes.findIndex(n => n.id === x.noteId) + 1}`);
    const ann = ps.map(p => [p, /^annexe\|([^|]+)\|(.+)$/.exec(p.cle || '')]).filter(([, mm]) => mm), exacts = new Set();
    ann.forEach(([p, mm]) => (parRep.get(mm[2]) || []).filter(x => deNote(x, p)).forEach(x => { exacts.add(x); if (!x.metre.includes(p.cle)) x.metre.push(p.cle); }));
    ann.forEach(([p, mm]) => { if ((parRep.get(mm[2]) || []).length) return; lignes.filter(x => !exacts.has(x) && x.rep.startsWith(`${mm[2]}-`) && x.noteId && deNote(x, p)).forEach(x => { if (!x.metre.includes(p.cle)) x.metre.push(p.cle); }); });
    lignes.forEach(x => { x.materiel = x.metre.filter(k => m[k] && (txt(m[k].reference) || txt(m[k].statut))).map(k => ({ cle: k, statut: m[k].statut || '', reference: [m[k].fabricant, m[k].reference].filter(Boolean).join(' ') })); });
    // Mise en service : fiches de la note portant le repère
    if (opts.mes !== false) (opts.points || pointsMes(et)).filter(p => p.nature === 'mes').forEach(p => {
      const cands = lignes.filter(x => x.noteId === p.noteId && x.rep && (txt(p.repere) === x.rep || contientMot(p.titre, x.rep)));
      cands.forEach(x => { if (x.mes.length < 6) x.mes.push(p.titre); });
    });
    lignes.forEach(x => {
      x.sources = [x.noteId && x.type !== 'armoire' ? `Note ${x.note.split(' — ')[0]}` : '', x.armoire ? 'Armoire' : '', x.armoireRep ? 'Armoire (repère)' : '', x.gtb ? `GTC (${x.gtb} point${x.gtb > 1 ? 's' : ''})` : '', x.metre.length ? 'Métré' : '', x.materiel.length ? `Matériel retenu (${x.materiel.map(y => y.statut || 'saisi').join(', ')})` : '', x.mes.length ? 'Mise en service' : ''].filter(Boolean);
    });
    lignes.sort((a, b) => String(a.rep).localeCompare(String(b.rep), 'fr', { numeric: true }));
    return { lignes, conflits: conflits(et, lignes, der) };
  }

  // Conflits : [{ nature: 'doublon' | 'deuxReperes' | 'ancienneLigne', rep, cles, texte, proposition }]
  function conflits(et, lignes, der) {
    const out = [], parRep = new Map();
    lignes.filter(x => x.rep).forEach(x => { if (!parRep.has(x.rep)) parRep.set(x.rep, []); parRep.get(x.rep).push(x); });
    parRep.forEach((l, rep) => { if (l.length > 1) out.push({ nature: 'doublon', rep, cles: l.map(x => x.cle), texte: `Repère ${rep} porté par ${l.length} équipements : ${l.map(x => `${x.designation || x.type}${x.note ? ` (${x.note.split(' — ')[0]})` : ''}`).join(' ; ')}.` }); });
    // Même équipement : repère de l'armoire différent de celui du calcul
    lignes.filter(x => x.armoire && x.derive && x.derive !== x.rep).forEach(x => out.push({ nature: 'deuxReperes', rep: x.rep, cles: [x.cle], reps: [x.rep, x.derive], texte: `${x.designation || x.rep} : « ${x.rep} » dans l'armoire, « ${x.derive} » dans le calcul (${x.note.split(' — ')[0]}).` }));
    // Ligne d'armoire d'un calcul existant dont l'équipement n'est plus calculé sous cette source (repère changé dans la note)
    const srcs = new Set((der || []).map(q => q.src)), dejaArm = new Set(lignes.filter(x => x.armoire && x.src).map(x => x.src));
    lignes.filter(x => x.armoire && x.src && !/^(inv|opt)/.test(x.src) && noteDe(et, noteDeSrc(x.src)) && !srcs.has(x.src)).forEach(x => {
      const cand = (der || []).filter(q => noteDeSrc(q.src) === noteDeSrc(x.src) && (q.type || '') === (x.type || ''));
      const pref = String(x.src).split(':').slice(0, 2).join(':'), libres = cand.filter(q => !dejaArm.has(q.src)), p = cand.find(q => String(q.src).split(':').slice(0, 2).join(':') === pref) || (libres.length === 1 ? libres[0] : null);
      out.push({ nature: 'ancienneLigne', rep: x.rep, cles: [x.cle], vers: p ? { src: p.src, rep: txt(p.rep) } : null, texte: `${x.rep} : ligne d'armoire restée sous l'ancien repère du calcul${p ? ` (devenu « ${txt(p.rep)} » dans ${x.note.split(' — ')[0]})` : ' (équipement retiré ou renommé dans le calcul)'}.` });
    });
    // Ligne d'armoire en double (même src deux fois)
    const vus = new Map();
    lignesArmoire(et).forEach(({ l }) => { if (!l.src) return; vus.set(l.src, (vus.get(l.src) || 0) + 1); });
    vus.forEach((k, src) => { if (k > 1) out.push({ nature: 'doublon', rep: (lignes.find(x => x.src === src) || {}).rep || src, cles: [src], texte: `Équipement ${src} présent ${k} fois dans l'armoire.` }); });
    return out;
  }

  /* ---------- Propagation d'un changement de nom dans les calculs ---------- */
  // Exécute fn (qui change des repères dans les calculs) puis reporte les changements des équipements calculés :
  // lignes d'armoire (src et repère), clés du matériel retenu (statut, fabricant, référence gardés)
  function avecSuivi(et, fn) {
    const avant = derives(et), pAvant = postes(et);
    const r = fn();
    const apres = derives(et), pApres = postes(et), modifs = [], cles = {};
    // Les équipements calculés gardent leur ordre : appariés rang par rang (même nombre), sinon par source
    const paires = new Map();
    if (avant.length === apres.length) avant.forEach((a, i) => { const b = apres[i]; if (a.src && b.src && (a.src !== b.src || txt(a.rep) !== txt(b.rep))) paires.set(a.src, { src: b.src, rep: txt(b.rep), repAvant: txt(a.rep) }); });
    else { const m = new Map(apres.map(b => [b.src, b])); avant.forEach(a => { const b = m.get(a.src); if (b && txt(a.rep) !== txt(b.rep)) paires.set(a.src, { src: b.src, rep: txt(b.rep), repAvant: txt(a.rep) }); }); }
    lignesArmoire(et).forEach(({ n, l }) => {
      const p = paires.get(txt(l.src));
      if (!p) return;
      if (p.src !== l.src) l.src = p.src;
      if (txt(l.rep) === p.repAvant && p.rep !== p.repAvant) { modifs.push({ ou: 'Armoire', detail: `${libNote(et, n).split(' — ')[0]} : ligne ${p.repAvant} → ${p.rep}` }); l.rep = p.rep; }
    });
    // Métré : les postes gardent aussi leur ordre ; une clé changée emporte la saisie du matériel retenu
    const m = et.materiel || {};
    if (pAvant.length === pApres.length) pAvant.forEach((a, i) => { const b = pApres[i]; if (a.cle && b.cle && a.cle !== b.cle && m[a.cle] && !m[b.cle] && !pApres.some(x => x.cle === a.cle)) { cles[a.cle] = b.cle; } });
    Object.entries(cles).forEach(([a, b]) => { m[b] = { ...m[a] }; delete m[a]; modifs.push({ ou: 'Matériel retenu', detail: `${a} → ${b}${m[b].statut ? ` (statut « ${m[b].statut} » gardé)` : ''}${m[b].reference ? `, ${[m[b].fabricant, m[b].reference].filter(Boolean).join(' ')}` : ''}` }); });
    return { r, paires, cles, modifs };
  }

  // Champs d'un calcul qui portent le repère (« rep », « repExt », « repUE »…, et colonnes « rep » de ses listes)
  function editerSource(n, ancien, nouveau) {
    const e = n.entrees || {}, ou = [];
    Object.keys(e).forEach(c => {
      if (/^rep/i.test(c) && typeof e[c] === 'string' && e[c].trim() === ancien) { e[c] = nouveau; ou.push(c); }
      if (Array.isArray(e[c])) e[c].forEach((l, i) => { if (l && typeof l === 'object' && !Array.isArray(l)) Object.keys(l).forEach(f => { if (/^rep/i.test(f) && typeof l[f] === 'string' && l[f].trim() === ancien) { l[f] = nouveau; ou.push(`${c} ligne ${i + 1}`); } }); });
    });
    return ou;
  }
  // Références « <note>:<repère> » des autres calculs (émetteur d'un tronçon de réseau : terminal de la note)
  function editerReferences(et, noteId, ancien, nouveau) {
    const a = `${noteId}:${ancien}`, b = `${noteId}:${nouveau}`;
    let k = 0;
    (et.notes || []).forEach(n => Object.values(n.entrees || {}).forEach(v => { if (Array.isArray(v)) v.forEach(l => { if (l && typeof l === 'object') Object.keys(l).forEach(f => { if (l[f] === a) { l[f] = b; k++; } }); }); }));
    return k;
  }

  // Hors de l'étude, toujours à vérifier : étiquettes, commandes, PV ouverts sur le chantier, DOE
  const generiques = (et, ancien) => {
    const chantier = !!et.affaireId;
    return [{ ou: 'Étiquettes', detail: `${chantier ? 'Étiquettes QR et plaques' : 'Étiquettes QR et plaques, si'} déjà imprimées (CRM, stock) avec ${ancien} : à réimprimer` },
      { ou: 'Commandes', detail: `${chantier ? 'Commandes' : 'Commandes, si'} déjà passées : le repère ${ancien} peut figurer sur les bons de commande et de livraison (pas de mise à jour automatique)` },
      { ou: 'Chantier', detail: 'PV et relevés de mise en service déjà ouverts dans Pipe-Fit : bouton « Reprendre les repères de l\'étude » (correspondance transmise)' },
      { ou: 'DOE', detail: `${chantier ? 'DOE' : 'DOE, si'} déjà émis : à réémettre (liste des équipements, PV, table d'échange GTC, synoptiques)` }];
  };
  // Même équipement sous deux repères (armoire / calcul) : on garde « rep » ; repère du calcul → la ligne d'armoire est
  // renommée ; repère de l'armoire → le calcul suit (champ du calcul, sinon renommage mémorisé)
  function aligner(et, cle, rep, opts = {}) {
    const t = table(et, { gtb: false, mes: false }), x = t.lignes.find(y => y.cle === cle);
    if (!x || !x.derive) return { ok: false, erreur: 'Équipement introuvable.' };
    if (x.derive === rep) return renommer(et, x.rep, rep, { ...opts, cle, forcer: true });
    const note = noteDe(et, x.noteId), modifs = [], le = opts.date || aujourdhui(), ancien = x.derive;
    const suivi = avecSuivi(et, () => {
      const ou = note ? editerSource(note, ancien, rep) : [], ren = et.renommesReperes = et.renommesReperes || {};
      if (ou.length) { modifs.push({ ou: 'Note de calcul', detail: `${libNote(et, note)} : ${ou.join(', ')}` }); editerReferences(et, note.id, ancien, rep); delete ren[x.src]; }
      else if (x.src) { ren[x.src] = { de: (ren[x.src] && ren[x.src].de) || ancien, vers: rep, noteId: x.noteId, le }; modifs.push({ ou: 'Note de calcul', detail: `${x.note.split(' — ')[0]} : repère calculé « ${ancien} » renommé « ${rep} » (mémorisé dans l'étude)` }); }
      if (!Object.keys(ren).length) delete et.renommesReperes;
    });
    modifs.push(...suivi.modifs);
    et.renumerotations = [...(et.renumerotations || []), { date: le, type: 'repere', map: { [ancien]: rep } }].slice(-20);
    return { ok: true, equipement: { cle, designation: x.designation, note: x.note }, modifs, horsEtude: generiques(et, ancien) };
  }

  /* ---------- Renommer un repère ---------- */
  // opts.cle : équipement choisi quand plusieurs portent le repère ; renvoie { ok, erreur, modifs: [{ ou, detail }], horsEtude: [{ ou, detail }] }
  function renommer(et, ancien, nouveau, opts = {}) {
    ancien = txt(ancien); nouveau = txt(nouveau);
    if (!ancien || !nouveau) return { ok: false, erreur: 'Repère vide.' };
    if (ancien === nouveau) return { ok: false, erreur: 'Le nouveau repère est identique à l\'ancien.' };
    if (/[|]/.test(nouveau) || nouveau.length > 40) return { ok: false, erreur: 'Repère de 40 caractères au plus, sans « | ».' };
    const t = table(et, { gtb: false, mes: false }), cands = t.lignes.filter(x => x.rep === ancien && (!opts.cle || x.cle === opts.cle));
    if (!cands.length) return renommerGroupe(et, ancien, nouveau, t, opts);
    if (cands.length > 1) return { ok: false, erreur: `${cands.length} équipements portent le repère ${ancien} : choisissez celui à renommer.`, choix: cands.map(x => ({ cle: x.cle, designation: x.designation, note: x.note })) };
    const x = cands[0], deja = t.lignes.find(y => y.rep === nouveau && y.cle !== x.cle);
    if (deja && !opts.forcer) return { ok: false, erreur: `Le repère ${nouveau} est déjà porté par ${deja.designation || deja.type}${deja.note ? ` (${deja.note.split(' — ')[0]})` : ''}.` };
    const modifs = [], horsEtude = [], note = noteDe(et, x.noteId), le = opts.date || aujourdhui();
    // Matériel lié avant le renommage (pour les signalements)
    const materielAvant = x.materiel.slice();
    const suivi = avecSuivi(et, () => {
      // 1. Le calcul qui porte le repère (champ saisi) ; sinon renommage mémorisé, appliqué au calcul de l'armoire
      let ou = [];
      if (x.armoireRep) {
        const n = noteDe(et, x.armoireRep.noteId), e = n.entrees;
        e.armoires[x.armoireRep.i].rep = nouveau; ou.push('armoires');
        (e.armoires || []).forEach(a => { if (txt(a.amont) === ancien) a.amont = nouveau; });
        (e.equipements || []).forEach(l => { ['alim', 'pilote'].forEach(k => { if (txt(l[k]) === ancien) l[k] = nouveau; }); });
        modifs.push({ ou: 'Armoire', detail: `${libNote(et, n)} : armoire ${ancien} → ${nouveau} (alimentations et pilotes des lignes suivis)` });
        modifs.push({ ou: 'GTC', detail: `Points de l'armoire (automate, mesures communes, table d'échange) sous ${nouveau}` });
      } else if (x.bouche) {
        const n = noteDe(et, x.bouche.noteId); n.entrees.bouchesL[x.bouche.i].rep = nouveau; ou.push('bouches');
        modifs.push({ ou: 'Note de calcul', detail: `${libNote(et, n)} : bouche ${ancien} → ${nouveau}` });
      } else if (note && (x.src || !x.armoire)) {
        ou = editerSource(note, ancien, nouveau);
        if (ou.length) modifs.push({ ou: 'Note de calcul', detail: `${libNote(et, note)} : ${ou.join(', ')}` });
        const k = editerReferences(et, note.id, ancien, nouveau);
        if (k) modifs.push({ ou: 'Note de calcul', detail: `${k} référence(s) d'un autre calcul (émetteur d'un tronçon…)` });
      }
      const ren = et.renommesReperes = et.renommesReperes || {};
      if (x.src && !ou.length && (x.derive !== null || !x.armoire)) {
        const de = (ren[x.src] && ren[x.src].de) || x.derive || ancien;
        if (de === nouveau) delete ren[x.src]; else ren[x.src] = { de, vers: nouveau, noteId: x.noteId, le };
        modifs.push({ ou: 'Note de calcul', detail: `${x.note ? `${x.note.split(' — ')[0]} : ` : ''}repère calculé « ${de} » renommé « ${nouveau} » (mémorisé dans l'étude, le calcul ne porte pas ce repère)` });
      } else if (x.src && ren[x.src] && ou.length) delete ren[x.src];
      if (!Object.keys(ren).length) delete et.renommesReperes;
    });
    modifs.push(...suivi.modifs);
    // 2. Lignes d'armoire restées sous l'ancien repère (ligne saisie à la main, ou repère déjà différent du calcul)
    lignesArmoire(et).forEach(({ n, l }) => {
      const meme = x.src ? txt(l.src) === x.src || (suivi.paires.get(x.src) || {}).src === txt(l.src) : x.armoire && n.id === x.armoire.noteId && l === n.entrees.equipements[x.armoire.i];
      if (meme && txt(l.rep) === ancien) { l.rep = nouveau; modifs.push({ ou: 'Armoire', detail: `${libNote(et, n).split(' — ')[0]} : ligne ${ancien} → ${nouveau}` }); }
    });
    // 3. Réglages des points GTC (repère exact ou préfixe « REP. ») ; les points eux-mêmes découlent de la ligne d'armoire
    notesElec(et).forEach(n => {
      let k = 0;
      ((n.entrees || {}).reglagesPoints || []).forEach(r => { const v = txt(r && r.rep); if (v === ancien) { r.rep = nouveau; k++; } else if (v.startsWith(`${ancien}.`)) { r.rep = nouveau + v.slice(ancien.length); k++; } });
      if (k) modifs.push({ ou: 'GTC', detail: `${libNote(et, n).split(' — ')[0]} : ${k} réglage(s) de points` });
    });
    if (x.gtb || lignesArmoire(et).some(({ l }) => txt(l.rep) === nouveau)) modifs.push({ ou: 'GTC', detail: `Points GTC, table d'échange, cahier de programmation et analyse fonctionnelle renommés d'après la ligne d'armoire (${nouveau}.…)` });
    // 4. Réserves de conformité levées (clé contenant le repère)
    const rc = et.reservesConformite || {}, na = norm(ancien), nn = norm(nouveau);
    Object.keys(rc).forEach(k => {
      const k2 = k.split('|').map(s => ` ${s} `.replace(` ${na} `, ` ${nn} `).trim()).join('|');
      if (k2 !== k && !rc[k2]) { rc[k2] = rc[k]; delete rc[k]; modifs.push({ ou: 'Réserves', detail: `Réserve levée suivie sous le nouveau repère (${k2})` }); }
    });
    // 5. Matériel retenu saisi à la main (ligne libre) : désignation
    Object.values(et.materiel || {}).forEach(s => { if (s && s.libre && contientMot(s.designation, ancien)) { s.designation = remplacerMot(s.designation, ancien, nouveau); modifs.push({ ou: 'Matériel retenu', detail: `Désignation « ${s.designation} »` }); } });
    // 6. Renumérotation transmise au chantier (PV de mise en service, relevés d'équilibrage : « Reprendre les repères de l'étude »)
    et.renumerotations = [...(et.renumerotations || []), { date: le, type: 'repere', map: { [ancien]: nouveau } }].slice(-20);
    modifs.push({ ou: 'Mise en service', detail: 'Fiches de mise en service de l\'étude sous le nouveau repère ; correspondance transmise aux PV et relevés du chantier' });
    // Hors de l'étude : ce qui ne peut pas être mis à jour automatiquement
    const chantier = !!et.affaireId, mat = [...materielAvant, ...x.metre.filter(k => !materielAvant.some(y => y.cle === k)).map(k => ({ cle: k, ...(et.materiel || {})[k] }))];
    mat.forEach(y => {
      const s = (et.materiel || {})[suivi.cles[y.cle] || y.cle] || {};
      if (ENGAGES.includes(s.statut)) horsEtude.push({ ou: 'Client', detail: `Matériel « ${[s.fabricant, s.reference].filter(Boolean).join(' ') || y.cle} » ${s.statut === 'Soumis au client' ? 'soumis' : 'validé'} au client sous l'ancien repère : le signaler à la prochaine diffusion de la liste du matériel` });
      if (suivi.cles[y.cle] && chantier) horsEtude.push({ ou: 'Chantier', detail: `Suivi du chantier (pose, mise en service, photo de plaque) enregistré dans Pipe-Fit sous l'ancienne clé ${y.cle} : à reprendre` });
      if (s.substitution || s.commande || s.commandeLe) horsEtude.push({ ou: 'Commandes', detail: `Commande déjà passée pour ${[s.fabricant, s.reference].filter(Boolean).join(' ') || y.cle} : le bon de commande et le bon de livraison portent l'ancien repère` });
    });
    (et.notes || []).forEach(n => { const d = (n.emissions || []).slice(-1)[0]; if (d && contientMot(JSON.stringify(d.entrees || {}), ancien)) horsEtude.push({ ou: 'Documents émis', detail: `${libNote(et, n)} émise à l'indice ${d.indice} avec ${ancien} : réémettre pour diffuser ${nouveau}` }); });
    horsEtude.push(...generiques(et, ancien));
    return { ok: true, equipement: { cle: suivi.paires.get(x.src) ? suivi.paires.get(x.src).src : x.cle, designation: x.designation, note: x.note }, modifs, horsEtude };
  }

  // Repère de groupe saisi dans un calcul (« EXT-PK » des extracteurs EXT-PK-1, EXT-PK-2…, « UE1 » d'un DRV) : le champ
  // du calcul est renommé, les repères qui en découlent suivent (armoire, GTC, métré, matériel retenu)
  function renommerGroupe(et, ancien, nouveau, t, opts) {
    const notes = (et.notes || []).filter(n => n.type !== 'elec' && editerSource(JSON.parse(JSON.stringify({ entrees: n.entrees || {} })), ancien, nouveau).length);
    if (notes.length !== 1) return { ok: false, erreur: notes.length ? `Le repère ${ancien} est saisi dans ${notes.length} calculs : renommez-le dans chacun.` : `Repère ${ancien} introuvable dans l'étude.` };
    const n = notes[0], modifs = [], le = opts.date || aujourdhui();
    const suivi = avecSuivi(et, () => { const ou = editerSource(n, ancien, nouveau); modifs.push({ ou: 'Note de calcul', detail: `${libNote(et, n)} : ${ou.join(', ')}` }); editerReferences(et, n.id, ancien, nouveau); });
    modifs.push(...suivi.modifs);
    const map = {};
    suivi.paires.forEach(p => { if (p.repAvant !== p.rep) map[p.repAvant] = p.rep; });
    if (Object.values(map).some(r => t.lignes.some(y => y.rep === r && noteDeSrc(y.src) !== n.id)) && !opts.forcer) modifs.push({ ou: 'Conflit', detail: 'Un repère obtenu est déjà porté par un autre équipement : voir les conflits de la table des repères' });
    et.renumerotations = [...(et.renumerotations || []), { date: le, type: 'repere', map: Object.keys(map).length ? map : { [ancien]: nouveau } }].slice(-20);
    const horsEtude = [{ ou: 'Étiquettes', detail: `Étiquettes QR et plaques déjà imprimées avec ${Object.keys(map).join(', ') || ancien} : à réimprimer` },
      { ou: 'Commandes', detail: 'Commandes déjà passées : l\'ancien repère peut figurer sur les bons de commande et de livraison' },
      { ou: 'DOE', detail: 'DOE déjà émis : à réémettre' }];
    Object.keys(suivi.cles).forEach(k => { const s = et.materiel[suivi.cles[k]] || {}; if (ENGAGES.includes(s.statut)) horsEtude.unshift({ ou: 'Client', detail: `Matériel « ${[s.fabricant, s.reference].filter(Boolean).join(' ')} » ${s.statut === 'Soumis au client' ? 'soumis' : 'validé'} au client sous l'ancien repère : le signaler à la prochaine diffusion` }); });
    return { ok: true, groupe: true, equipement: { designation: `Repère ${ancien} de ${libNote(et, n)}` }, map, modifs, horsEtude };
  }

  // Ligne d'armoire restée sous l'ancien repère du calcul : reprend la source et le repère calculés (la ligne en double
  // ajoutée par la reprise automatique est retirée, ses choix d'alimentation gardés sur la ligne d'origine)
  function realigner(et, c) {
    if (!c || c.nature !== 'ancienneLigne' || !c.vers) return 0;
    let k = 0;
    notesElec(et).forEach(n => {
      const l = (n.entrees || {}).equipements || [], i = l.findIndex(y => y && y.src === c.cles[0]);
      if (i < 0) return;
      const j = l.findIndex(y => y && y.src === c.vers.src);
      if (j >= 0) l.splice(j, 1);
      const y = l.find(z => z && z.src === c.cles[0]);
      y.src = c.vers.src; y.rep = c.vers.rep; k++;
    });
    return k;
  }

  // Après une numérotation automatique (registre : terminaux) : lignes d'armoire et renumérotation transmise au chantier
  // changes : [{ noteId, de, vers }]
  function apresNumerotation(et, changes) {
    const l = (changes || []).filter(c => c && c.de && c.vers && c.de !== c.vers);
    if (!l.length) return 0;
    let k = 0;
    lignesArmoire(et).forEach(({ l: y }) => {
      const c = l.find(z => noteDeSrc(y.src) === z.noteId && (!z.prefixe || String(y.src).startsWith(z.prefixe)) && (txt(y.rep) === z.de || txt(y.rep).startsWith(`${z.de}.`)) && String(y.src).split(':').includes(z.de));
      if (!c) return;
      y.src = String(y.src).split(':').map(s => (s === c.de ? c.vers : s)).join(':');
      y.rep = txt(y.rep) === c.de ? c.vers : c.vers + txt(y.rep).slice(c.de.length); k++;
    });
    // Doublon renuméroté (l'ancien repère reste porté par un autre appareil) : pas transmis aux PV du chantier
    const map = Object.fromEntries(l.filter(c => !c.ambigu).map(c => [c.de, c.vers]));
    if (Object.keys(map).length) et.renumerotations = [...(et.renumerotations || []), { date: aujourdhui(), type: 'reperes', map }].slice(-20);
    return k;
  }

  /* ---------- État des équipements (conséquences d'un changement après émission) ---------- */
  const IMPORTANT = /puissance|débit|debit|kW|m³\/h|l\/s|hmt|hauteur|pression disponible|nombre|volume|modèle|référence/i;
  const court = s => String(s ?? '').slice(0, 120);
  function etat(et) {
    const der = derives(et), arm = lignesArmoire(et), E = El(), T = (E && E.TYPES_EQ) || {};
    const out = { le: aujourdhui(), notes: {}, eq: {}, postes: {}, materiel: {}, gtb: {}, mes: {} };
    (et.notes || []).forEach((n, i) => {
      const r = essai(() => Li().calculer(et, n), null), e = n.entrees || {}, nb = {};
      ['appareils', 'bouchesL', 'points', 'generateurs', 'circuits', 'ballons'].forEach(k => { if (Array.isArray(e[k]) && e[k].length) nb[k] = e[k].filter(Boolean).length; });
      const R = Rg(), mod = R ? R.emplacements({ notes: [n] }).filter(p => p.eq).map(p => { const x = R.parId(et, p.eq); return x ? `${R.nomEq(x)}${x.modele !== undefined ? `#${x.modele}` : ''}` : ''; }).filter(Boolean).sort() : [];
      out.notes[n.id] = { n: `N${i + 1}`, titre: court(n.titre), type: n.type, res: ((r && r.resume) || []).filter(([l]) => IMPORTANT.test(l)).slice(0, 12).map(([l, v]) => [court(l), court(v)]), nb, modeles: [...new Set(mod)].slice(0, 30) };
    });
    // Équipements : ligne d'armoire (repère, puissance, protection), sinon équipement calculé
    const vus = new Set();
    const prot = q => essai(() => { if (q.tension === '24V' || !(Number(q.P) > 0)) return 0; const t = T[q.type] || T.autre || []; return E.depart({ ...q, moteur: t[1], tension: q.tension || t[2], depart: q.depart || t[3] }).cal; }, 0);
    arm.forEach(({ n, l, i }) => { const cle = l.src || `man:${n.id}:${i}`; vus.add(l.src); out.eq[cle] = { rep: txt(l.rep), des: court(l.designation), noteId: noteDeSrc(l.src) || n.id, P: Number(l.P) || 0, cal: prot(l), type: l.type || '', metre: '' }; });
    der.forEach(q => { const d = der.find(z => z.src === q.src); if (q.src && out.eq[q.src]) { if (d && d.metre) out.eq[q.src].metre = d.metre; return; } if (!q.src || vus.has(q.src)) return; out.eq[q.src] = { rep: txt(q.rep), des: court(q.designation), noteId: noteDeSrc(q.src), P: Number(q.P) || 0, cal: prot(q), type: q.type || '', metre: q.metre || '' }; });
    postes(et).filter(p => p.cle && (p.unite || 'u') === 'u').forEach(p => { out.postes[p.cle] = { qte: Number(p.qte) || 0, src: (p.sources || []).slice(0, 6), des: court(p.designation) }; });
    Object.entries(et.materiel || {}).forEach(([k, s]) => { if (s && (txt(s.reference) || txt(s.statut))) out.materiel[k] = { statut: s.statut || '', ref: court([s.fabricant, s.reference].filter(Boolean).join(' ')), qte: Number(s.qte) || 0 }; });
    notesElec(et).forEach(n => { const r = calcElec(et, n), pts = (r && r.valeurs && r.valeurs.listePoints) || []; out.gtb[n.id] = pts.map(p => court(`${p[0]} — ${p[7] || p[1]}`)).slice(0, 800); });
    pointsMes(et).filter(p => p.nature === 'mes').forEach(p => { const k = `${p.noteId}|${p.cle || ''}|${p.repere || p.titre}`; out.mes[k] = { titre: court(p.titre), noteId: p.noteId, cle: p.cle || '', att: (p.attendus || []).filter(a => a && a.valeur !== null && a.valeur !== undefined && a.valeur !== '').slice(0, 30).map(a => court(`${a.libelle}=${a.valeur}${a.unite ? ` ${a.unite}` : ''}`)) }; });
    return out;
  }

  return { table, conflits, renommer, aligner, realigner, avecSuivi, apresNumerotation, appliquerMes, etat, editerSource, remplacerMot, contientMot };
})();
if (typeof module !== 'undefined') module.exports = Reperes;
