// Registre unique des équipements d'une étude (et.equipements) : chaque modèle (fabricant, référence, valeurs lues sur
// sa fiche) n'existe qu'une fois. Les éléments des calculs qui l'utilisent (ligne de terminaux, bouche, point de puisage,
// organe de robinetterie, pompe d'un circuit ou d'un réseau, CTA, production, vase, ballon) portent seulement son
// identifiant (eq) : leurs valeurs sont reprises du registre (propagation) et verrouillées dans le formulaire. Changer de
// modèle ou corriger une valeur dans le registre met à jour tous les calculs. Module pur (navigateur, node, tests).
//
// Emplacements (genre) : term / termp (ligne de terminaux, pompe de distribution), aero (bouche), san (point de puisage),
// rob (robinetterie d'un circuit ou d'un tronçon), pompe (pompe d'un circuit du schéma de principe), arbo (pompe du
// réseau arborescent), cta, pid (production), gen (générateur d'une production détaillée : ligne de « generateurs »), vase,
// ecs, reseau (calcul entier : entrees.eq) ; calculs annexes (calcul entier : entrees.eq) : drv (unité extérieure DRV),
// radiateurs (modèle de radiateur), echangeurPlaques, piscine (déshumidificateur), chambreFroide (groupe), hotte et parking (extracteur).
const Registre = (() => {
  const N = () => (typeof Notes !== 'undefined' ? Notes : (() => { try { return require('./notes'); } catch (e) { return null; } })());
  const T = () => (typeof Terminaux !== 'undefined' ? Terminaux : require('./terminaux'));
  const FC = () => (typeof FicheCta !== 'undefined' ? FicheCta : require('./fiche-cta'));
  const FE = () => (typeof FicheEquip !== 'undefined' ? FicheEquip : require('./fiche-equipement'));
  const SAN = () => (typeof Sanitaire !== 'undefined' ? Sanitaire : require('./sanitaire'));
  const FA = () => (typeof FicheAnnexes !== 'undefined' ? FicheAnnexes : require('./fiche-annexes'));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const vide = x => x === undefined || x === null || x === '';
  const val = x => (typeof x === 'string' && /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(x) ? Number(x.replace(',', '.')) : x);

  const TYPES = { cta: 'Centrale de traitement d\'air', generateur: 'Générateur', pompe: 'Pompe, circulateur', terminal: 'Terminal', vase: 'Vase d\'expansion', ecs: 'Ballon, échangeur d\'ECS',
    bouche: 'Bouche, diffuseur', robinet: 'Vanne, robinetterie', sanitaire: 'Appareil sanitaire', regulateur: 'Régulateur préprogrammé, module',
    drvUE: 'Unité extérieure DRV / VRF', radiateur: 'Radiateur', echangeur: 'Échangeur à plaques', deshu: 'Déshumidificateur, centrale de piscine', groupeFroid: 'Groupe de chambre froide', extracteur: 'Extracteur, tourelle, caisson',
    tampon: 'Ballon tampon', fumee: 'Conduit de fumée', capteur: 'Capteur, instrumentation', accessoireSan: 'Accessoire sanitaire', document: 'Document commercial' };
  // Types jamais inscrits au registre (document commercial : joint au matériel retenu ou à la consultation)
  const NON_INSCRITS = ['document'];
  // Matériel sans calcul (ou hors métré) : une ligne « libre » du matériel retenu par modèle, [chapitre, désignation]
  const LIBRES = { accessoireSan: ['Équipements sanitaires', 'Accessoire sanitaire'], capteur: ['Régulation, instrumentation', 'Capteur'] };
  // Calculs annexes recevant un modèle entier (genre = type du calcul) → type de fiche
  const ANNEXES = { drv: 'drvUE', radiateurs: 'radiateur', echangeurPlaques: 'echangeur', piscine: 'deshu', chambreFroide: 'groupeFroid', hotte: 'extracteur', parking: 'extracteur' };
  const TYPE_GENRE = { gen: 'generateur', regul: 'regulateur', term: 'terminal', termp: 'pompe', aero: 'bouche', san: 'sanitaire', rob: 'robinet', pompe: 'pompe', arbo: 'pompe', cta: 'cta', pid: 'generateur', vase: 'vase', ecs: 'ecs', reseau: 'pompe',
    tamp: 'tampon', bal: 'tampon', capt: 'capteur', conduitFumee: 'fumee', ...ANNEXES };
  // Listes des calculs qui reçoivent des équipements : [champ de la note, genre de l'élément]
  const LISTES = { elec: [['capaSynco', () => 'regul'], ['equipements', () => 'capt']], terminaux: [['appareils', a => (a.type === 'pompeDist' ? 'termp' : 'term')]], aero: [['bouchesL', () => 'aero']], sanitaire: [['points', () => 'san']],
    pid: [['robinetterie', () => 'rob'], ['pompesFab', () => 'pompe'], ['generateurs', () => 'gen'], ['ballons', () => 'bal']], arbo: [['robinetterie', () => 'rob']] };
  const NIVEAU_NOTE = { cta: 'cta', pid: 'pid', vase: 'vase', ecs: 'ecs', reseau: 'reseau', conduitFumee: 'conduitFumee', ...Object.fromEntries(Object.keys(ANNEXES).map(t => [t, t])) };
  // Note de conduit de fumée : valeurs reportées dans le calcul annexe (le générateur raccordé n'est pas repris)
  const FUMEE = ['P', 'combustible', 'CO2', 'Tf', 'D', 'H', 'Lr', 'altitude'];
  // Signal de sortie d'un capteur → régulation de sa ligne d'armoire
  const REGUL_CAPTEUR = { '4-20mA': 'sonde', '0-10V': 'sonde', impulsion: 'impulsion', relais: 'contact', bus: 'bus' };
  const GRANDEURS = { debit: 'débit', pression: 'pression', temperature: 'température', niveau: 'niveau', 'qualite d\'air': 'qualité d\'air' };
  // Valeurs reprises au placement seulement (débit d'air de la CTA, débit d'une bouche : dimensionnés par le réseau)
  const PLACEMENT_SEUL = { cta: ['Qs', 'Qr'], aero: ['Q'] };

  // Libellés des valeurs d'un modèle (affichage et saisie dans le registre)
  function libelles() {
    const out = {};
    Object.entries(FE().LIBELLES).forEach(([k, d]) => { out[k] = d; });
    Object.entries(FC().LIBELLES).forEach(([k, d]) => { out[k] = d; });
    Object.entries(T().LIBELLES).forEach(([k, d]) => { out[k] = [d[0], d[1]]; });
    Object.entries(FA().LIBELLES).forEach(([k, d]) => { if (!out[k]) out[k] = d; });
    Object.assign(out, { Qair: ['Débit d\'air', 'm³/h'], Kvs: ['Kvs', ''], Qs: ['Débit soufflé', 'm³/h'], Qr: ['Débit repris', 'm³/h'], Lw: ['Puissance acoustique', 'dB(A)'], dn: ['DN', ''], kv: ['Kv (Kvs)', 'm³/h'],
      tours: ['Nombre de tours', ''], abaque: ['Abaque tours:Kv', ''], q: ['Débit', 'L/s'], pMin: ['Pression minimale', 'bar'], courbe: ['Courbe Q:H', 'm³/h:mCE'], X: ['Entrées universelles', ''], Y: ['Sorties 0-10 V', ''], Q: ['Sorties relais', ''], modulesMax: ['Modules d\'extension maxi', ''], app: ['Application', ''] });
    out.dp = ['Perte de charge', '(Pa ou kPa)'];
    return out;
  }

  const liste = et => (et.equipements = et.equipements || []);
  const nomEq = x => [x.fabricant, x.reference].filter(Boolean).join(' ') || x.nom || 'Équipement';
  const cleEq = (type, fab, ref) => `${type}|${norm(fab)}|${norm(ref)}`;
  const uid = () => `eq${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const parId = (et, id) => liste(et).find(x => x.id === id) || null;
  const compatibles = (a, b) => Object.keys(b).every(k => vide(a[k]) || vide(b[k]) || (typeof a[k] === 'number' && typeof b[k] === 'number' ? Math.abs(a[k] - b[k]) < 1e-6 : String(a[k]) === String(b[k])));

  // Ajoute un modèle au registre (ou met à jour celui de même type, fabricant et référence : la dernière fiche lue l'emporte)
  // qte : quantité du matériel sans calcul (accessoire sanitaire…) ; gamme : documentation de gamme dont le modèle reste à
  // choisir ({ titre, modeles }) — deux gammes d'un même fabricant ne sont pas confondues (pas de référence)
  function ajouter(et, { type, fabricant = '', reference = '', valeurs = {}, nom = '', qte, gamme }) {
    if (NON_INSCRITS.includes(type)) return null;
    const v = Object.fromEntries(Object.entries(valeurs || {}).filter(([, x]) => !vide(x)));
    const q = Math.max(1, Math.round(Number(qte) || 0)) || undefined;
    const ex = (fabricant || reference) && liste(et).find(x => cleEq(x.type, x.fabricant, x.reference) === cleEq(type, fabricant, reference) && (reference || (!gamme && !x.gamme) || norm(x.nom) === norm(nom)));
    if (ex) { Object.assign(ex.valeurs, v); if (nom) ex.nom = String(nom).slice(0, 120); if (gamme) ex.gamme = gamme; else delete ex.gamme; if (qte !== undefined && LIBRES[type]) ex.qte = q; return ex; }
    const x = { id: uid(), type, fabricant: fabricant || '', reference: reference || '', valeurs: v, nom: String(nom || '').slice(0, 120), ...(gamme ? { gamme } : {}), ...(qte !== undefined && LIBRES[type] ? { qte: q } : {}) };
    liste(et).push(x);
    return x;
  }
  // Modèle k de la gamme d'un équipement du registre : valeurs et référence de ce modèle (reportées partout à la propagation)
  function choisirModele(x, k) {
    const m = ((x && x.gamme && x.gamme.modeles) || [])[k]; if (!m) return false;
    const { ref, ...val } = m;
    x.reference = /^DN \d+$/.test(ref || '') && x.gamme.refGamme ? `${x.gamme.refGamme} ${ref}` : ref || x.reference;
    x.valeurs = { ...(x.valeurs || {}), ...Object.fromEntries(Object.entries(val).filter(([, y]) => !vide(y))) };
    delete x.gamme;
    return true;
  }

  // Valeurs d'un modèle reportées sur un élément d'un genre donné : { champ: valeur }
  function champs(x, genre, el = {}, note = null, placement = false) {
    const v = x.valeurs || {}, o = {}, set = (k, y) => { if (!vide(y)) o[k] = y; }, nom = nomEq(x);
    switch (genre) {
      case 'term': Object.entries(T().LIBELLES).forEach(([k, d]) => { if (k !== 'Qp' && k !== 'Hp') set(d[2], v[k]); }); set('ref', nom); break;
      case 'termp': set('Qp', v.Q); set('Hp', v.H); set('Pvent', v.P1); set('ref', nom); break;
      case 'aero': if (placement) set('Q', v.Q); set('dp', v.dp); set('Lw', v.Lw); set('ref', nom); break;
      case 'san': { const A = SAN().APPAREILS[el.type] || SAN().APPAREILS.lavabo || []; set('qEF', v.q); if (A[2]) set('qECS', v.q); set('pMin', v.pMin); set('ref', nom); break; }
      case 'rob': set('dn', v.dn); set('kv', v.kv); if (vide(v.kv) && !vide(v.dp)) set('dp', Math.round(v.dp * 100) / 100); if (el.type === 'equilibrage') { set('tours', v.tours); set('abaque', v.abaque); } set('ref', nom); break;
      case 'pompe': set('courbe', v.courbe); set('P1', v.P1); set('ref', nom); break;
      // Générateur d'une production détaillée : puissance et perte de charge côté eau (fiche du fabricant)
      case 'gen': set('P', v.P); set('dp', v.dpEau); if (Number.isFinite(Number(v.P1)) && Number(v.P1) > 0) set('Pel', Math.round(Number(v.P1) / 10) / 100); set('ref', nom); break;
      case 'regul': set('X', v.X); set('Y', v.Y); set('Q', v.Q); set('ref', nom); break;
      case 'arbo': set('pompeCourbe', v.courbe); set('pompeRef', nom); break;
      // Ballon tampon : en série ou de découplage (volume imposé du schéma de principe), ou ballon élément du schéma
      case 'tamp': set('Vtampon', v.V); break;
      case 'bal': set('V', v.V); break;
      // Capteur sur une ligne d'armoire : régulation selon le signal de sortie, alimentation, consommation en TBT
      case 'capt': set('regulation', REGUL_CAPTEUR[v.sortie]); set('tension', v.alim === 'mono' ? 'mono' : v.alim === '24V' ? '24V' : ''); if (v.alim === '24V') set('Paux', v.Paux); break;
      case 'conduitFumee': FUMEE.forEach(k => set(k, v[k])); break;
      case 'cta': FC().champs('cta', v).forEach(c => {
        if (!placement && (PLACEMENT_SEUL.cta.includes(c.k) || (['modeP', 'PchaudS', 'PfroidS'].includes(c.k) && ((note || {}).entrees || {}).modeP !== 'saisie'))) return;
        o[c.k] = c.val; }); break;
      case 'pid': case 'vase': case 'ecs': case 'reseau': FE().champs(genre, v).forEach(c => { o[c.k] = c.val; }); break;
      // Calcul annexe : valeurs de la fiche dans les champs « matériel retenu » (et puissances, fluide, charge…)
      default: if (ANNEXES[genre]) FA().champs(genre, v).forEach(c => { o[c.k] = c.val; }); break;
    }
    return o;
  }
  // Valeurs d'un modèle relues sur un élément existant (reprise des études faites avant le registre)
  function inverse(genre, el, note) {
    const o = {}, set = (k, y) => { if (!vide(y)) o[k] = val(y); };
    switch (genre) {
      case 'term': Object.entries(T().LIBELLES).forEach(([k, d]) => { if (k !== 'Qp' && k !== 'Hp') set(k, el[d[2]]); }); break;
      case 'termp': set('Q', el.Qp); set('H', el.Hp); set('P1', el.Pvent); break;
      case 'aero': set('dp', el.dp); set('Lw', el.Lw); break;
      case 'san': set('q', el.qEF); set('pMin', el.pMin); break;
      case 'rob': set('dn', el.dn); set('kv', el.kv); if (vide(el.kv)) set('dp', el.dp); if (el.type === 'equilibrage') { set('tours', el.tours); set('abaque', el.abaque); } break;
      case 'pompe': set('courbe', el.courbe); set('P1', el.P1); break;
      case 'gen': set('P', el.P); set('dpEau', el.dp); if (!vide(el.Pel)) set('P1', Math.round(val(el.Pel) * 1000)); break;
      case 'regul': set('X', el.X); set('Y', el.Y); set('Q', el.Q); break;
      case 'arbo': set('courbe', el.pompeCourbe); break;
      case 'tamp': set('V', el.Vtampon); break;
      case 'bal': set('V', el.V); break;
      case 'capt': { const s = Object.entries(REGUL_CAPTEUR).find(([, r]) => r === el.regulation); if (s) set('sortie', s[0]); set('alim', el.tension === 'mono' ? 'mono' : el.tension === '24V' ? '24V' : ''); set('Paux', el.Paux); break; }
      case 'conduitFumee': FUMEE.forEach(k => set(k, el[k])); break;
      case 'drv': case 'radiateurs': case 'echangeurPlaques': case 'piscine': case 'chambreFroide': case 'hotte': case 'parking': {
        // Fiche gardée avec le calcul, sinon champs du calcul (études faites avant le registre)
        const f = el.fiche || {}, de = Object.keys(f).filter(k => !['nom', 'fabricant', 'reference'].includes(k));
        if (de.length) de.forEach(k => set(k, f[k])); else Object.entries(FA().inverse(genre, el)).forEach(([k, y]) => set(k, y));
        break;
      }
      default: { const f = ((note || {}).entrees || {}).fiche || {}; Object.entries(f).forEach(([k, y]) => { if (!['nom', 'fabricant', 'reference'].includes(k)) set(k, y); }); }
    }
    return o;
  }

  // Tous les emplacements de l'étude : { eq, note, genre, liste, i, el }
  function emplacements(et, avecLibres = false) {
    const out = [];
    ((et && et.notes) || []).forEach(n => {
      const e = n.entrees || {};
      (LISTES[n.type] || []).forEach(([k, g]) => (e[k] || []).forEach((el, i) => { if (el && (el.eq || avecLibres)) out.push({ eq: el.eq, note: n, genre: g(el), liste: k, i, el }); }));
      if (NIVEAU_NOTE[n.type] && (e.eq || avecLibres)) out.push({ eq: e.eq, note: n, genre: NIVEAU_NOTE[n.type], liste: null, el: e });
      if (n.type === 'arbo' && (e.pompeEq || avecLibres)) out.push({ eq: e.pompeEq, note: n, genre: 'arbo', liste: null, el: e, champEq: 'pompeEq', champFiche: 'pompeFiche' });
      // Ballon tampon en série ou de découplage du schéma de principe
      if (n.type === 'pid' && (e.tamponEq || (avecLibres && e.tamponFiche))) out.push({ eq: e.tamponEq, note: n, genre: 'tamp', liste: null, el: e, champEq: 'tamponEq', champFiche: 'tamponFiche' });
    });
    return out;
  }
  const libelleEmplacement = (et, p) => {
    const n = p.note, lib = `N${et.notes.indexOf(n) + 1} — ${n.titre}`, el = p.el;
    if (!p.liste) return p.genre === 'arbo' ? `${lib} : pompe du réseau` : p.genre === 'pid' ? `${lib} : production` : p.genre === 'tamp' ? `${lib} : ballon tampon` : lib;
    const qui = el.rep || el.circuit || `ligne ${p.i + 1}`, ou = el.local || el.salle || el.circuit || el.troncon || '';
    return `${lib} : ${qui}${ou && ou !== qui ? ` (${ou})` : ''}`;
  };
  const ficheElement = x => ({ nom: x.nom || '', fabricant: x.fabricant, reference: x.reference });
  const ficheNote = (x, genre) => (genre === 'cta' ? FC() : FE()).fiche({ fabricant: x.fabricant, reference: x.reference, valeurs: x.valeurs || {} }, x.nom);
  // Reporte un modèle sur un emplacement ; renvoie le nombre de champs changés
  function reporter(x, p, placement = false) {
    const o = champs(x, p.genre, p.el, p.note, placement);
    let k = 0;
    Object.entries(o).forEach(([c, y]) => { if (String(p.el[c]) !== String(y)) { p.el[c] = y; k++; } });
    if (p.champFiche) { const f = ficheElement(x); if (JSON.stringify(p.el[p.champFiche]) !== JSON.stringify(f)) { p.el[p.champFiche] = f; k++; } }
    else if (p.liste) { const f = ficheElement(x); if (JSON.stringify(p.el.fiche) !== JSON.stringify(f)) { p.el.fiche = f; k++; } }
    else { const f = ficheNote(x, p.genre); if (JSON.stringify(p.el.fiche) !== JSON.stringify(f)) { p.el.fiche = f; k++; } }
    return k;
  }
  const lierEl = (p, id) => { p.el[p.champEq || 'eq'] = id; };

  // Reprise des études existantes : chaque élément qui a une fiche (fabricant ou référence) et n'est pas encore relié
  // au registre y est inscrit ; même modèle aux valeurs différentes → variante distincte (rien n'est écrasé)
  function collecter(et) {
    let k = 0;
    emplacements(et, true).forEach(p => {
      if (p.el[p.champEq || 'eq'] !== undefined) return; // relié, ou détaché volontairement (eq vide)
      const f = p.el[p.champFiche || 'fiche'];
      if (!f || !(f.fabricant || f.reference)) return;
      const type = TYPE_GENRE[p.genre], v = inverse(p.genre, p.el, p.note);
      let x = liste(et).find(y => cleEq(y.type, y.fabricant, y.reference) === cleEq(type, f.fabricant, f.reference) && compatibles(y.valeurs, v));
      if (x) Object.entries(v).forEach(([c, y]) => { if (vide(x.valeurs[c])) x.valeurs[c] = y; });
      else {
        const n = liste(et).filter(y => cleEq(y.type, y.fabricant, y.reference) === cleEq(type, f.fabricant, f.reference)).length;
        x = { id: uid(), type, fabricant: f.fabricant || '', reference: f.reference || '', valeurs: v, nom: f.nom || '', ...(n ? { variante: n + 1 } : {}) };
        liste(et).push(x);
      }
      lierEl(p, x.id); k++;
    });
    return k;
  }
  // Valeurs du registre reportées sur tous les emplacements (liens vers un modèle supprimé : détachés)
  function propager(et) {
    let k = 0;
    emplacements(et).forEach(p => { const x = parId(et, p.eq); if (!x) { lierEl(p, ''); k++; return; } k += reporter(x, p); });
    return k;
  }
  const synchroniser = et => collecter(et) + propager(et);

  // Champs verrouillés d'une note (repris du registre) : { 'liste.i.champ' ou 'champ': libellé }
  function verrous(et, note) {
    const out = {};
    emplacements({ notes: [note] }).forEach(p => {
      const x = parId(et, p.eq); if (!x) return;
      const lib = `Registre des équipements — ${nomEq(x)}`;
      Object.keys(champs(x, p.genre, p.el, p.note)).forEach(c => { out[p.liste ? `${p.liste}.${p.i}.${c}` : c] = lib; });
    });
    return out;
  }

  // Relie un élément dont on vient de charger la fiche : le modèle du registre est créé ou mis à jour (la fiche lue
  // l'emporte) puis reporté partout ailleurs à l'enregistrement. extra : valeurs lues non reportées sur l'élément
  function lier(et, note, el, extra = {}) {
    const p = emplacements({ notes: [note] }, true).find(y => y.el === el);
    if (!p) return null;
    const f = el[p.champFiche || 'fiche'];
    if (!f || !(f.fabricant || f.reference)) { lierEl(p, ''); return null; }
    const x = ajouter(et, { type: TYPE_GENRE[p.genre], fabricant: f.fabricant, reference: f.reference, nom: f.nom, valeurs: { ...extra, ...inverse(p.genre, el, note) } });
    lierEl(p, x.id);
    return x;
  }
  // Élément détaché du registre : ses valeurs deviennent des valeurs saisies
  function detacher(p) { lierEl(p, ''); }
  // Modèle retiré du registre : ses emplacements gardent leurs valeurs, détachés
  function supprimer(et, id) { emplacements(et).filter(p => p.eq === id).forEach(detacher); et.equipements = liste(et).filter(x => x.id !== id); }

  // Place un modèle dans un calcul. cible : term:<id|nouveau>, termp:<id>, cta:<id|nouveau>, pid:<id>, pidc:<pid>|<circuit>,
  // arbo:<id>, arbot:<arbo>|<tronçon>, reseau:<id>, vase:<id|nouveau>, ecs:<id|nouveau>, aero:<id>, san:<id>.
  // opts : { qte, rep, local, circuit, texte } ; nouvelleNote(type) crée un calcul ; renvoie un compte rendu (ou null)
  const prochain = (prefixe, deja) => { let k = 1, r; do { r = `${prefixe}-${String(k++).padStart(2, '0')}`; } while (deja.has(r)); deja.add(r); return r; };
  function typeTerminal(texte, v) {
    const x = norm(texte), q = /4 tubes|4t\b|quatre tubes/.test(x);
    const type = /cassette/.test(x) ? (q ? 'cassette4' : 'cassette2') : /gainable/.test(x) ? 'gainable' : /ventilo/.test(x) ? (q ? 'vc4' : 'vc2') : /aerotherme/.test(x) ? 'aerotherme' : /poutre/.test(x) ? 'poutre'
      : /rideau/.test(x) ? 'rideau' : /radiateur/.test(x) ? 'radiateur' : /split|unite interieure/.test(x) ? 'split' : 'autre';
    const batterie = q ? '4t' : v.Pch && v.Pfr ? '2t' : v.Pfr ? 'froide' : v.Pch ? 'chaude' : '2t';
    return { type, batterie, prefixe: { cassette2: 'CA', cassette4: 'CA', gainable: 'GA', vc2: 'VC', vc4: 'VC', aerotherme: 'AE', poutre: 'PF', rideau: 'RA', radiateur: 'RD', split: 'UI' }[type] || 'T' };
  }
  const typeOrgane = x => (/equilibr/.test(x) ? 'equilibrage' : /clapet/.test(x) ? 'clapet' : /filtre/.test(x) ? 'filtre' : /pot a boue|desemboueur/.test(x) ? 'desemboueur' : /compteur/.test(x) ? 'compteur'
    : /motoris|regulation|3 voies|2 voies/.test(x) ? 'regulation' : /manchette|anti-?vibr/.test(x) ? 'manchette' : /soupape/.test(x) ? 'soupape' : /purgeur/.test(x) ? 'purgeur' : /thermometre|manometre/.test(x) ? 'thermometre' : 'isolement');
  // Locaux d'un placement : « Bureau 1 ; Salle de réunion ×2 » → [Bureau 1, Salle de réunion, Salle de réunion] ;
  // un seul local sans multiplicateur → qte fois ce local
  function unites(local, qte) {
    const parts = String(local || '').split(';').map(t => t.trim()).filter(Boolean);
    const lus = parts.map(t => { const m = /^(.*?)\s*[×x*]\s*(\d+)$/i.exec(t); return m && m[1] ? [m[1].trim(), Math.max(1, +m[2])] : [t, null]; });
    if (lus.length <= 1 && !(lus[0] && lus[0][1])) return Array(qte).fill(lus[0] ? lus[0][0] : '');
    return lus.flatMap(([l, k]) => Array(k || 1).fill(l));
  }
  // Branches où raccorder ce qui est placé : terminal → tronçon amont d'un réseau arborescent ; bouche → tronçon du schéma
  // aéraulique ; point de puisage → tronçon du calcul sanitaire. [valeur, libellé]
  function branches(et, cible) {
    const [genre, rest = ''] = String(cible || '').split(':'), [id] = rest.split('|'), notes = (et && et.notes) || [], lib = n => `N${notes.indexOf(n) + 1} — ${n.titre}`;
    const trs = n => ((n.entrees || {}).troncons || (N() && N().TYPES[n.type] ? N().defauts(n.type).troncons : null) || []).filter(t => t && String(t.rep || '').trim());
    if (genre === 'term') return notes.filter(n => n.type === 'arbo').flatMap(n => trs(n).map(t => [`arbo:${n.id}|${t.rep}`, `${lib(n)} : sous ${t.rep}${t.nom ? ` — ${t.nom}` : ''}`]));
    if (genre === 'aero' || genre === 'san') { const n = notes.find(y => y.id === id); return n ? trs(n).map(t => [t.rep, `${t.rep}${t.nom ? ` — ${t.nom}` : ''}${t.reseau && t.reseau !== 'soufflage' ? ` (${t.reseau})` : ''}`]) : []; }
    return [];
  }
  // Terminaux placés raccordés au réseau arborescent : une branche par appareil, sous le tronçon amont choisi
  function raccorder(et, termNote, els, branche) {
    const m = /^arbo:([^|]+)\|(.+)$/.exec(String(branche || '')); if (!m) return 0;
    const n = et.notes.find(y => y.id === m[1] && y.type === 'arbo'); if (!n) return 0;
    const tr = n.entrees.troncons = n.entrees.troncons || [], reps = new Set(tr.map(t => String(t.rep || '').trim())), deja = new Set(tr.map(t => t.emetteur).filter(Boolean));
    let k = 0;
    els.forEach(el => {
      const cle = `${termNote.id}:${el.rep}`; if (deja.has(cle)) return;
      let r = el.rep, i = 2; while (reps.has(r)) r = `${el.rep}-${i++}`; reps.add(r);
      tr.push({ rep: r, amont: m[2], nom: el.local || '', L: 10, zeta: 5, tube: '', emetteur: cle, P: '', Q: '', dpEm: '' }); k++;
    });
    return k;
  }
  function placer(et, x, cible, opts = {}, nouvelleNote) {
    const [genre, rest = ''] = String(cible || '').split(':'), [id, sous] = rest.split('|'), notes = et.notes, nom = nomEq(x), v = x.valeurs || {};
    const qte = Math.max(1, Math.round(Number(opts.qte) || 1)), texte = norm(`${opts.texte || ''} ${x.nom || ''} ${x.reference || ''}`);
    const cibleNote = t => { if (id === 'nouveau' && nouvelleNote) { const n = nouvelleNote(t); notes.push(n); return n; } return notes.find(n => n.id === id && n.type === t); };
    const poser = (note, g, el, liste_, i) => { el.eq = x.id; reporter(x, { note, genre: g, el, liste: liste_, i }, true); };
    const noteEntiere = (n, g) => { n.entrees.eq = x.id; reporter(x, { note: n, genre: g, el: n.entrees, liste: null }, true); };
    if (genre === 'term' || genre === 'termp') {
      const n = cibleNote('terminaux'); if (!n) return null;
      const l = n.entrees.appareils = (n.entrees.appareils || []).filter(a => a.rep || a.local), deja = new Set(l.map(a => a.rep));
      const tt = genre === 'termp' ? { type: 'pompeDist', batterie: 'aucune', prefixe: 'PD' } : typeTerminal(texte, v), locaux = unites(opts.local, qte), crees = [];
      locaux.forEach(local => {
        const el = { rep: opts.rep && locaux.length === 1 && !deja.has(opts.rep) ? opts.rep : prochain(tt.prefixe, deja), local, type: tt.type, n: 1, batterie: tt.batterie, vanne: genre === 'termp' ? 'aucune' : '2v', alim: 'cvc', regul: 'propre', ...(opts.circuit ? { circuit: opts.circuit } : {}) };
        deja.add(el.rep); l.push(el); poser(n, genre, el, 'appareils', l.length - 1); crees.push(el);
      });
      const br = genre === 'term' ? raccorder(et, n, crees, opts.branche) : 0;
      return `${crees.length} ${genre === 'termp' ? 'pompe(s)' : 'terminal(aux)'} ${nom} ajouté(s) dans ${n.titre} : ${crees.map(e => e.rep + (e.local ? ` (${e.local})` : '')).join(', ')}${br ? ` — ${br} branche(s) raccordée(s) au réseau arborescent` : ''}`;
    }
    // CTA, vase, production d'ECS : un calcul par appareil. Calcul choisi déjà occupé, ou quantité > 1 : les appareils en
    // plus ont chacun leur calcul, copie du calcul choisi (mêmes réglages), numéroté (2), (3)…
    const unParNote = t => {
      const n0 = cibleNote(t); if (!n0) return null;
      if (id === 'nouveau' && t === 'cta') n0.titre = `CTA ${nom}`;
      else if (id === 'nouveau' && ANNEXES[t]) n0.titre = `${n0.titre} — ${nom}`;
      const base = String(n0.titre).replace(/ \(\d+\)$/, ''), cibles = n0.entrees.eq ? [] : [n0];
      while (cibles.length < qte) {
        const c = JSON.parse(JSON.stringify(n0)); c.id = nouvelleNote ? nouvelleNote(t).id : `${n0.id}-${cibles.length + 2}`;
        delete c.emissions; delete c.lien;
        let k = 2; while (notes.some(y => y.titre === `${base} (${k})`)) k++;
        c.titre = `${base} (${k})`; notes.splice(notes.indexOf(n0) + 1 + cibles.length, 0, c); cibles.push(c);
      }
      cibles.forEach(n => noteEntiere(n, t));
      return `${cibles.map(n => n.titre).join(', ')} : ${nom}`;
    };
    if (genre === 'cta') return unParNote('cta');
    // Générateurs : même modèle placé à nouveau → un générateur de plus en cascade
    if (genre === 'pid') {
      const n = notes.find(y => y.id === id && y.type === 'pid'); if (!n) return null;
      const meme = n.entrees.eq === x.id, nb = Math.min(6, (meme ? Math.max(1, Number(n.entrees.nGen) || 1) : 0) + qte);
      noteEntiere(n, 'pid'); n.entrees.nGen = String(nb);
      return `${n.titre} : production ${nom} — ${nb} générateur(s)${nb > 1 ? ' en cascade' : ''}`;
    }
    if (genre === 'pidc') {
      const n = notes.find(y => y.id === id && y.type === 'pid'); if (!n) return null;
      if (x.type === 'pompe') { const l = n.entrees.pompesFab = (n.entrees.pompesFab || []).filter(p => p.circuit !== sous), el = { circuit: sous }; l.push(el); poser(n, 'pompe', el, 'pompesFab', l.length - 1); return `Pompe du circuit ${sous} : ${nom}${v.courbe ? ' (courbe)' : ''}`; }
      const l = n.entrees.robinetterie = n.entrees.robinetterie || [], t = typeOrgane(texte);
      for (let k = 0; k < qte; k++) { const el = { rep: opts.rep && qte === 1 ? opts.rep : `${t.slice(0, 2).toUpperCase()}${l.length + 1}`, circuit: sous, type: t, qte: 1 }; l.push(el); poser(n, 'rob', el, 'robinetterie', l.length - 1); }
      return `${qte} organe(s) ${nom} sur le circuit ${sous}`;
    }
    if (genre === 'arbo') { const n = notes.find(y => y.id === id && y.type === 'arbo'); if (!n) return null; n.entrees.pompeEq = x.id; reporter(x, { note: n, genre: 'arbo', el: n.entrees, liste: null }, true); return `Pompe de ${n.titre} : ${nom}`; }
    if (genre === 'arbot') {
      const n = notes.find(y => y.id === id && y.type === 'arbo'); if (!n) return null;
      const l = n.entrees.robinetterie = n.entrees.robinetterie || [], t = typeOrgane(texte);
      for (let k = 0; k < qte; k++) { const el = { rep: opts.rep && qte === 1 ? opts.rep : `${t.slice(0, 2).toUpperCase()}${l.length + 1}`, troncon: sous, type: t, qte: 1 }; l.push(el); poser(n, 'rob', el, 'robinetterie', l.length - 1); }
      return `${qte} organe(s) ${nom} sur le tronçon ${sous}`;
    }
    if (genre === 'vase' || genre === 'ecs') return unParNote(genre);
    // Calculs annexes : un modèle par calcul (unité extérieure, échangeur, centrale de piscine, groupe : un calcul par appareil ;
    // radiateurs, extracteur de hotte ou de parking : le modèle du calcul, la quantité est calculée)
    if (ANNEXES[genre]) {
      if (!['drv', 'echangeurPlaques', 'piscine', 'chambreFroide'].includes(genre)) { const n = cibleNote(genre); if (!n) return null; if (id === 'nouveau') n.titre = `${n.titre} — ${nom}`; noteEntiere(n, genre); return id === 'nouveau' ? `Nouveau calcul « ${n.titre} »` : `${n.titre} : ${nom}`; }
      return unParNote(genre);
    }
    if (genre === 'reseau') { const n = cibleNote(genre); if (!n) return null; noteEntiere(n, genre); return `${n.titre} : ${nom}`; }
    if (genre === 'aero') {
      const n = notes.find(y => y.id === id && y.type === 'aero'); if (!n) return null;
      const l = n.entrees.bouchesL = n.entrees.bouchesL || [], deja = repsBouches(et), locaux = unites(opts.local, qte), tc = String(opts.branche || '');
      const t = ((n.entrees.troncons || (N() && N().TYPES[n.type] ? N().defauts(n.type).troncons : null) || []).find(y => String(y.rep || '').trim() === tc)) || {}, crees = [];
      locaux.forEach(local => { const el = { rep: opts.rep && locaux.length === 1 && !deja.has(opts.rep) ? opts.rep : prochain('B', deja), installation: n.id, reseau: t.reseau || 'soufflage', salle: local, zone: opts.zone || '', etage: '', type: 'plafond', troncon: tc }; deja.add(el.rep); l.push(el); poser(n, 'aero', el, 'bouchesL', l.length - 1); crees.push(el); });
      return `${crees.length} bouche(s) ${nom} ajoutée(s) dans ${n.titre} : ${crees.map(e => e.rep + (e.salle ? ` (${e.salle})` : '')).join(', ')}${tc ? ` — branche ${tc}` : ' (tronçon à choisir)'}`;
    }
    // Régulateur préprogrammé : capacités de l'application choisie dans le calcul des armoires
    if (genre === 'reg') {
      const n = notes.find(y => y.id === id && y.type === 'elec'); if (!n) return null;
      const app = sous || v.app || 'autre', defaut = (N() ? (N().defauts('elec').capaSynco || []) : []);
      const l = n.entrees.capaSynco = ((n.entrees.capaSynco && n.entrees.capaSynco.length ? n.entrees.capaSynco : defaut.map(x => ({ ...x }))) || []).filter(x => x.app !== app), el = { app };
      l.push(el); poser(n, 'regul', el, 'capaSynco', l.length - 1);
      const synco = (n.entrees.armoires || []).some(a => a.techno === 'synco');
      return `${nom} : régulateur ${app} de ${n.titre}${synco ? '' : ' (choisissez « régulateurs préprogrammés » sur l\'armoire)'}`;
    }
    // Ballon tampon : en série / de découplage (volume imposé), ballon élément existant (b<index>) ou nouveau ballon (+)
    if (genre === 'tamp') {
      const n = notes.find(y => y.id === id && y.type === 'pid'); if (!n) return null;
      if (!sous) { n.entrees.tamponEq = x.id; reporter(x, { note: n, genre: 'tamp', el: n.entrees, liste: null, champEq: 'tamponEq', champFiche: 'tamponFiche' }, true); return `${n.titre} : ballon tampon ${nom}${v.V ? ` (${v.V} L)` : ''}`; }
      const l = n.entrees.ballons = n.entrees.ballons || [];
      let i = /^b\d+$/.test(sous) ? Number(sous.slice(1)) : -1;
      if (!l[i]) { const deja = new Set(l.map(b => String((b && b.rep) || '').trim())); l.push({ rep: prochain('BT', deja), fonction: 'tampon', V: '', position: 'production' }); i = l.length - 1; }
      poser(n, 'bal', l[i], 'ballons', i);
      return `${n.titre} : ballon ${l[i].rep || `BAL${i + 1}`} — ${nom}${v.V ? ` (${v.V} L)` : ''}`;
    }
    // Capteur, instrumentation : une ligne « sonde » par appareil dans les équipements de l'armoire
    if (genre === 'capt') {
      const n = notes.find(y => y.id === id && y.type === 'elec'); if (!n) return null;
      const l = n.entrees.equipements = n.entrees.equipements || [], deja = new Set(l.map(e => String((e && e.rep) || '').trim())), locaux = unites(opts.local, qte);
      const pf = { debit: 'FT', pression: 'PT', temperature: 'TT', niveau: 'LT' }[v.grandeur] || 'CAP', crees = [];
      locaux.forEach(local => {
        const el = { rep: opts.rep && locaux.length === 1 && !deja.has(opts.rep) ? opts.rep : prochain(pf, deja), designation: `${v.grandeur ? `Capteur de ${GRANDEURS[v.grandeur] || v.grandeur}` : 'Capteur'} ${nom}`.slice(0, 120), type: 'sonde', P: 0, tension: '24V', regulation: 'sonde', local };
        deja.add(el.rep); l.push(el); poser(n, 'capt', el, 'equipements', l.length - 1); crees.push(el);
      });
      return `${crees.length} capteur(s) ${nom} dans ${n.titre} : ${crees.map(e => `${e.rep} (${e.regulation})`).join(', ')}`;
    }
    // Note de conduit de fumée : calcul annexe « conduit de fumée » (valeurs saisies)
    if (genre === 'fumee') {
      const n = cibleNote('conduitFumee'); if (!n) return null;
      n.entrees.eq = x.id; reporter(x, { note: n, genre: 'conduitFumee', el: n.entrees, liste: null }, true);
      const k = Object.keys(champs(x, 'conduitFumee')).length;
      if (k) n.entrees.source = '';
      return `${k} valeur(s) reportée(s) dans ${n.titre || 'le calcul de conduit de fumée'}`;
    }
    if (genre === 'san') {
      const n = notes.find(y => y.id === id && y.type === 'sanitaire'); if (!n) return null;
      const l = n.entrees.points = n.entrees.points || [], deja = new Set(l.map(p => p.rep));
      const type = /douche/.test(texte) ? 'douche' : /baignoire/.test(texte) ? 'baignoire' : /evier/.test(texte) ? 'evier' : /\bwc\b|cuvette/.test(texte) ? 'wc' : /urinoir/.test(texte) ? 'urinoir' : /vidoir|vide-seau/.test(texte) ? 'videSeau' : /lave-mains/.test(texte) ? 'laveMains' : 'lavabo';
      const locaux = unites(opts.local, qte), tc = String(opts.branche || '');
      locaux.forEach(local => { const el = { rep: prochain(type.slice(0, 2).toUpperCase(), deja), salle: local, etage: '', type, troncon: tc }; l.push(el); poser(n, 'san', el, 'points', l.length - 1); });
      return `${locaux.length} point(s) de puisage ${nom} ajouté(s) dans ${n.titre}${tc ? ` — tronçon ${tc}` : ' (tronçon à choisir)'}`;
    }
    return null;
  }

  // Vue d'ensemble : modèles avec leurs emplacements
  function bilan(et) {
    const emp = emplacements(et);
    return liste(et).map(x => ({ x, nom: nomEq(x), emplacements: emp.filter(p => p.eq === x.id).map(p => ({ ...p, libelle: libelleEmplacement(et, p) })) }));
  }

  // Repères manquants ou en double d'une liste (bouches, terminaux) renumérotés : préfixe-01, préfixe-02… ; renvoie le nombre
  function numeroter(liste, prefixe, cleRep = 'rep', garder = el => true) {
    const vus = new Set(), libres = new Set(liste.map(el => String(el[cleRep] || '').trim()).filter(Boolean)), a = [];
    liste.forEach(el => { if (!garder(el)) return; const r = String(el[cleRep] || '').trim(); if (r && !vus.has(r)) vus.add(r); else a.push(el); });
    a.forEach(el => { el[cleRep] = prochain(typeof prefixe === 'function' ? prefixe(el) : prefixe, new Set([...libres, ...vus])); vus.add(el[cleRep]); libres.add(el[cleRep]); });
    return a.length;
  }
  /* ---------- Bouches de l'étude : CTA ou extracteur, numéro unique ---------- */
  const schemasAir = et => ((et && et.notes) || []).filter(n => n.type === 'aero' && (n.entrees || {}).structure === 'arborescence');
  const remplie = b => b && (b.rep || b.salle || b.zone || b.Q || b.troncon);
  const repsBouches = et => new Set(schemasAir(et).flatMap(n => (n.entrees.bouchesL || []).map(b => String(b.rep || '').trim()).filter(Boolean)));
  // Repère suivant d'un repère numéroté (« B-07 » → « B-08 »), libre dans l'ensemble donné
  function repSuivant(rep, pris) {
    const m = /^(.*?)(\d+)$/.exec(String(rep || '').trim()), base = m ? m[1] : `${String(rep || 'B').trim()}-`, w = m ? m[2].length : 2;
    const max = [...pris].reduce((a, r) => { const x = String(r).startsWith(base) && /^\d+$/.test(String(r).slice(base.length)) ? +String(r).slice(base.length) : 0; return Math.max(a, x); }, m ? +m[2] : 0);
    return `${base}${String(max + 1).padStart(w, '0')}`;
  }
  // À l'enregistrement : chaque bouche est rattachée à sa CTA / son extracteur (schéma aéraulique choisi : la bouche y est
  // déplacée, tronçon à choisir s'il n'existe pas) ; les bouches sans repère reçoivent le numéro suivant
  function completerBouches(et) {
    const sch = schemasAir(et), ids = new Set(sch.map(n => n.id)), r = { deplacees: [], numerotees: 0 };
    sch.forEach(n => {
      const l = n.entrees.bouchesL || [];
      for (let i = l.length - 1; i >= 0; i--) {
        const b = l[i]; if (!remplie(b)) continue;
        if (!b.installation || !ids.has(b.installation)) { b.installation = n.id; continue; }
        if (b.installation === n.id) continue;
        const cible = sch.find(x => x.id === b.installation);
        l.splice(i, 1);
        if (!(cible.entrees.troncons || []).some(t => String(t.rep || '').trim() === String(b.troncon || '').trim())) b.troncon = '';
        (cible.entrees.bouchesL = cible.entrees.bouchesL || []).push(b);
        r.deplacees.push({ rep: b.rep, vers: cible.titre });
      }
    });
    // Réseau de chaque bouche compatible avec sa CTA / son extracteur (caisson d'extraction : extraction ; insufflation : soufflage)
    const SA = typeof SchemaAir !== 'undefined' ? SchemaAir : require('./aeraulique-schema');
    sch.forEach(n => { const P = SA.PRODUCTEURS[n.entrees.producteur] || SA.PRODUCTEURS['cta-df']; (n.entrees.bouchesL || []).forEach(b => { if (!remplie(b)) return; const res = b.reseau || 'soufflage'; if (res === 'soufflage' && !P[1]) b.reseau = 'extraction'; else if (res !== 'soufflage' && !P[2]) b.reseau = 'soufflage'; }); });
    const pris = repsBouches(et);
    sch.forEach(n => (n.entrees.bouchesL || []).forEach(b => { if (remplie(b) && !String(b.rep || '').trim()) { b.rep = prochain('B', pris); r.numerotees++; } }));
    return r;
  }
  // Numérotation de toutes les bouches, une fois l'étude au point : ordre (zone puis pièce, ou ordre des branches),
  // préfixe (« B » ; « reseau » : S- soufflage, R- reprise, E- extraction ; ou un texte), premier numéro, schémas concernés
  function renumeroterBouches(et, { notes, ordre = 'zone', prefixe = 'B', debut = 1 } = {}) {
    const sch = schemasAir(et).filter(n => !notes || notes.includes(n.id)), RES = { soufflage: 0, reprise: 1, extraction: 2 };
    const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), 'fr', { numeric: true, sensitivity: 'base' });
    const l = sch.flatMap((n, ni) => (n.entrees.bouchesL || []).map((b, i) => ({ b, ni, i, ti: (n.entrees.troncons || []).findIndex(t => String(t.rep || '').trim() === String(b.troncon || '').trim()) }))).filter(x => remplie(x.b));
    l.sort((x, y) => x.ni - y.ni || (RES[x.b.reseau || 'soufflage'] || 0) - (RES[y.b.reseau || 'soufflage'] || 0)
      || (ordre === 'branche' ? (x.ti < 0 ? 1e9 : x.ti) - (y.ti < 0 ? 1e9 : y.ti) : cmp(x.b.zone || x.b.etage, y.b.zone || y.b.etage) || cmp(x.b.salle, y.b.salle)) || x.ni - y.ni || x.i - y.i);
    const pf = b => (prefixe === 'reseau' ? { soufflage: 'S', reprise: 'R', extraction: 'E' }[b.reseau || 'soufflage'] || 'B' : String(prefixe || 'B').trim() || 'B');
    const compte = {}, w = String(Math.max(0, debut - 1) + l.length).length > 2 ? 3 : 2;
    // Hors des schémas renumérotés, les repères restent pris
    const autres = new Set(schemasAir(et).filter(n => !sch.includes(n)).flatMap(n => (n.entrees.bouchesL || []).map(b => String(b.rep || '').trim())));
    const avant = new Map(l.map(({ b }) => [b, String(b.rep || '').trim()])), vus = new Set(), doubles = new Set();
    avant.forEach(r => { if (r && vus.has(r)) doubles.add(r); vus.add(r); });
    l.forEach(({ b }) => { const p = pf(b); let k = compte[p] === undefined ? Math.max(1, Math.round(Number(debut) || 1)) : compte[p]; let r; do { r = `${p}-${String(k++).padStart(w, '0')}`; } while (autres.has(r)); compte[p] = k; b.rep = r; });
    // Correspondance ancien → nouveau (repères uniques seulement) : reprise dans les relevés et PV déjà ouverts sur le chantier
    const map = {};
    avant.forEach((r, b) => { if (r && !doubles.has(r) && r !== b.rep) map[r] = b.rep; });
    if (Object.keys(map).length) { et.renumerotations = [...(et.renumerotations || []), { date: new Date().toISOString().slice(0, 10), type: 'bouches', map }].slice(-20); }
    return l.length;
  }
  /* ---------- Matériel retenu rempli depuis le registre (pas de ressaisie) ---------- */
  // Lignes du métré dont le calcul a un modèle du registre : fabricant et référence repris (jamais un choix déjà fait) ;
  // calculs annexes : ligne de leur matériel principal ; terminaux et radiateurs (absents du métré) : une ligne par modèle
  // placé, quantité = nombre d'emplacements (radiateurs : nombre calculé). Ligne validée ou soumise jamais modifiée dans
  // son choix. Renvoie le nombre de changements
  function versMateriel(et, postes) {
    const m = et.materiel = et.materiel || {}, notes = (et && et.notes) || [], src = n => `N${notes.indexOf(n) + 1}`;
    let k = 0;
    const remplir = (cle, x) => { const s = m[cle] || {}; if (String(s.reference || '').trim() || /Valid|Soumis/.test(String(s.statut || '')) || !(x.fabricant || x.reference)) return; m[cle] = { ...s, fabricant: x.fabricant || '', reference: x.reference || '', registre: x.id }; k++; };
    (postes || []).forEach(p => {
      if (!p.cle || p.unite !== 'u') return;
      const pref = p.cle.split('|')[0], srcs = [...(p.sources || [])];
      for (const n of notes.filter(y => srcs.includes(src(y)))) {
        const e = n.entrees || {};
        let x = null;
        // Pompe d'un circuit retenue sur fiche : ligne « pompe|fab|<modèle> » ; générateur d'une production détaillée : type et puissance
        if (pref === 'pompe' && n.type === 'pid' && p.cle.startsWith('pompe|fab|')) x = [...new Set((e.pompesFab || []).filter(r => r && r.eq).map(r => r.eq))].map(id => parId(et, id)).find(y => y && p.cle === `pompe|fab|${nomEq(y)}`) || null;
        else if (pref === 'gen' && n.type === 'pid' && (e.generateurs || []).some(g => g && g.eq)) { const [, ty, P] = p.cle.split('|'), g = (e.generateurs || []).find(r => r && r.eq && r.type === ty && Math.abs(Number(r.P) - Number(P)) < 0.5); x = g ? parId(et, g.eq) : null; }
        else if ((pref === 'cta' && n.type === 'cta') || (pref === 'gen' && n.type === 'pid') || (pref === 'vase' && n.type === 'vase') || (pref === 'pompe' && n.type === 'reseau')) x = e.eq && parId(et, e.eq);
        else if (pref === 'pompe' && n.type === 'arbo') x = e.pompeEq && parId(et, e.pompeEq);
        // Ballon tampon du schéma de principe (en série ou de découplage) et ballons éléments du schéma : même volume
        else if (pref === 'tampon' && n.type === 'pid') x = e.tamponEq && parId(et, e.tamponEq);
        else if (pref === 'ballon' && n.type === 'pid') { const V = Number(p.cle.split('|')[2]), b = (e.ballons || []).find(y => y && y.eq && Number(y.V) === V); x = b ? parId(et, b.eq) : null; }
        // Bouches : la ligne du métré porte la référence de la fiche (taille = modèle) ; les bouches génériques restent à choisir
        else if (pref === 'bouche' && n.type === 'aero') x = [...new Set((e.bouchesL || []).filter(b => b && b.eq).map(b => b.eq))].map(id => parId(et, id)).find(y => y && p.cle.endsWith(`|${nomEq(y)}`)) || null;
        // Calcul annexe relié à un modèle (unité extérieure DRV, échangeur, déshumidificateur, groupe de chambre froide,
        // extracteur) : ligne « annexe|<type>|<repère> » de son matériel principal (poste marqué « modele » par le métré)
        else if (pref === 'annexe' && p.modele && ANNEXES[n.type] && p.cle.startsWith(`annexe|${n.type}|`) && e.eq) { const y = parId(et, e.eq); x = y && y.type === ANNEXES[n.type] ? y : null; }
        if (x) { remplir(p.cle, x); break; }
      }
    });
    // Radiateurs (absents du métré) : une ligne par modèle relié à une sélection de radiateurs, quantité = radiateurs de
    // ce modèle calculés (sinon radiateurs prévus) sur toutes les sélections qui l'utilisent
    const radiateurs = new Map();
    notes.filter(n => n.type === 'radiateurs' && (n.entrees || {}).eq).forEach(n => {
      const x = parId(et, n.entrees.eq); if (!x || x.type !== 'radiateur') return;
      let v = {};
      try { const L = typeof Liens !== 'undefined' ? Liens : require('./liens'); v = N().calculer('radiateurs', L.resoudre(et, n).entrees).valeurs || {}; } catch (err) { v = {}; }
      radiateurs.set(x.id, (radiateurs.get(x.id) || 0) + (Number(v.nbFab) > 0 ? Number(v.nbFab) : Number(v.nb) > 0 ? Number(v.nb) : 0));
    });
    // Terminaux : une ligne par modèle placé
    const emp = emplacements(et), vus = new Set();
    liste(et).filter(x => x.type === 'terminal').forEach(x => {
      const q = emp.filter(p => p.eq === x.id && p.genre === 'term').length, cle = `reg|${x.id}`;
      if (!q) return;
      vus.add(cle);
      const s = m[cle] || {}, d = `${TYPES.terminal} ${nomEq(x)}`;
      if (s.qte !== q || !s.libre || s.designation !== d || (!String(s.reference || '').trim() && x.reference)) {
        m[cle] = { ...s, libre: true, registre: x.id, chapitre: 'Terminaux', designation: d, qte: q, ...(String(s.reference || '').trim() ? {} : { fabricant: x.fabricant || '', reference: x.reference || '' }) }; k++;
      }
    });
    radiateurs.forEach((q, id) => {
      const x = parId(et, id), cle = `reg|${id}`;
      if (!x || !(q > 0)) return;
      vus.add(cle);
      const s = m[cle] || {}, d = `${TYPES.radiateur} ${nomEq(x)}`, garde = String(s.reference || '').trim() || /Valid|Soumis/.test(String(s.statut || ''));
      if (s.qte !== q || !s.libre || s.designation !== d || (!garde && x.reference && s.reference !== x.reference)) {
        m[cle] = { ...s, libre: true, registre: x.id, chapitre: 'Émetteurs', designation: d, qte: q, ...(garde ? {} : { fabricant: x.fabricant || '', reference: x.reference || '' }) }; k++;
      }
    });
    // Matériel sans calcul (accessoires sanitaires) et capteurs : une ligne par modèle, quantité = emplacements (capteurs placés
    // sur une armoire), sinon quantité saisie au chargement
    liste(et).filter(x => LIBRES[x.type]).forEach(x => {
      const cle = `reg|${x.id}`, n = emp.filter(p => p.eq === x.id).length, q = n || Math.max(1, Number(x.qte) || 1), [chapitre, lib] = LIBRES[x.type];
      vus.add(cle);
      const s = m[cle] || {}, d = `${lib} ${nomEq(x)}`, garde = String(s.reference || '').trim() || /Valid|Soumis/.test(String(s.statut || ''));
      if (s.qte !== q || !s.libre || s.designation !== d || s.chapitre !== chapitre || (!garde && (x.fabricant || x.reference) && (s.reference !== x.reference || s.fabricant !== x.fabricant))) {
        m[cle] = { ...s, libre: true, registre: x.id, chapitre, designation: d, qte: q, ...(garde ? {} : { fabricant: x.fabricant || '', reference: x.reference || '' }) }; k++;
      }
    });
    Object.keys(m).forEach(cle => { if (/^reg\|/.test(cle) && !vus.has(cle) && !/Valid|Soumis/.test(String(m[cle].statut || ''))) { delete m[cle]; k++; } });
    return k;
  }

  /* ---------- Repères : tout numéroter d'un clic (terminaux, bouches de toute l'étude) ---------- */
  function numeroterTout(et) {
    let k = 0;
    ((et && et.notes) || []).filter(n => n.type === 'terminaux').forEach(n => {
      k += numeroter(n.entrees.appareils || [], a => typeTerminal((T().TYPES[a.type] || [''])[0], a).prefixe, 'rep', a => a.type || a.rep);
    });
    const pris = new Set();
    schemasAir(et).forEach(n => (n.entrees.bouchesL || []).forEach(b => {
      if (!remplie(b)) return;
      const r = String(b.rep || '').trim();
      if (!r || pris.has(r)) { b.rep = r ? repSuivant(r, new Set([...pris, ...repsBouches(et)])) : prochain('B', new Set([...pris, ...repsBouches(et)])); k++; }
      pris.add(b.rep);
    }));
    return k;
  }
  // Repères manquants ou en double (terminaux par calcul, bouches dans toute l'étude)
  function reperesAReprendre(et) {
    let n = 0;
    ((et && et.notes) || []).filter(x => x.type === 'terminaux').forEach(x => { const vus = new Set(); (x.entrees.appareils || []).filter(a => a && (a.type || a.rep)).forEach(a => { const r = String(a.rep || '').trim(); if (!r || vus.has(r)) n++; vus.add(r); }); });
    const vus = new Set();
    schemasAir(et).forEach(x => (x.entrees.bouchesL || []).filter(remplie).forEach(b => { const r = String(b.rep || '').trim(); if (!r || vus.has(r)) n++; vus.add(r); }));
    return n;
  }
  return { ANNEXES, GRANDEURS, LIBRES, NON_INSCRITS, REGUL_CAPTEUR, choisirModele, versMateriel, numeroterTout, reperesAReprendre, schemasAir, repSuivant, repsBouches, completerBouches, renumeroterBouches, unites, branches, raccorder, numeroter, TYPES, TYPE_GENRE, libelles, ajouter, champs, inverse, emplacements, libelleEmplacement, collecter, propager, synchroniser, verrous, lier, detacher, supprimer, placer, bilan, nomEq, parId, typeTerminal, typeOrgane };
})();
if (typeof module !== 'undefined') module.exports = Registre;
