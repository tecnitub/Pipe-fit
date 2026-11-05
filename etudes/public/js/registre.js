// Registre unique des équipements d'une étude (et.equipements) : chaque modèle (fabricant, référence, valeurs lues sur
// sa fiche) n'existe qu'une fois. Les éléments des calculs qui l'utilisent (ligne de terminaux, bouche, point de puisage,
// organe de robinetterie, pompe d'un circuit ou d'un réseau, CTA, production, vase, ballon) portent seulement son
// identifiant (eq) : leurs valeurs sont reprises du registre (propagation) et verrouillées dans le formulaire. Changer de
// modèle ou corriger une valeur dans le registre met à jour tous les calculs. Module pur (navigateur, node, tests).
//
// Emplacements (genre) : term / termp (ligne de terminaux, pompe de distribution), aero (bouche), san (point de puisage),
// rob (robinetterie d'un circuit ou d'un tronçon), pompe (pompe d'un circuit du schéma de principe), arbo (pompe du
// réseau arborescent), cta, pid (production), vase, ecs, reseau (calcul entier : entrees.eq).
const Registre = (() => {
  const T = () => (typeof Terminaux !== 'undefined' ? Terminaux : require('./terminaux'));
  const FC = () => (typeof FicheCta !== 'undefined' ? FicheCta : require('./fiche-cta'));
  const FE = () => (typeof FicheEquip !== 'undefined' ? FicheEquip : require('./fiche-equipement'));
  const SAN = () => (typeof Sanitaire !== 'undefined' ? Sanitaire : require('./sanitaire'));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const vide = x => x === undefined || x === null || x === '';
  const val = x => (typeof x === 'string' && /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(x) ? Number(x.replace(',', '.')) : x);

  const TYPES = { cta: 'Centrale de traitement d\'air', generateur: 'Générateur', pompe: 'Pompe, circulateur', terminal: 'Terminal', vase: 'Vase d\'expansion', ecs: 'Ballon, échangeur d\'ECS',
    bouche: 'Bouche, diffuseur', robinet: 'Vanne, robinetterie', sanitaire: 'Appareil sanitaire' };
  const TYPE_GENRE = { term: 'terminal', termp: 'pompe', aero: 'bouche', san: 'sanitaire', rob: 'robinet', pompe: 'pompe', arbo: 'pompe', cta: 'cta', pid: 'generateur', vase: 'vase', ecs: 'ecs', reseau: 'pompe' };
  // Listes des calculs qui reçoivent des équipements : [champ de la note, genre de l'élément]
  const LISTES = { terminaux: [['appareils', a => (a.type === 'pompeDist' ? 'termp' : 'term')]], aero: [['bouchesL', () => 'aero']], sanitaire: [['points', () => 'san']],
    pid: [['robinetterie', () => 'rob'], ['pompesFab', () => 'pompe']], arbo: [['robinetterie', () => 'rob']] };
  const NIVEAU_NOTE = { cta: 'cta', pid: 'pid', vase: 'vase', ecs: 'ecs', reseau: 'reseau' };
  // Valeurs reprises au placement seulement (débit d'air de la CTA, débit d'une bouche : dimensionnés par le réseau)
  const PLACEMENT_SEUL = { cta: ['Qs', 'Qr'], aero: ['Q'] };

  // Libellés des valeurs d'un modèle (affichage et saisie dans le registre)
  function libelles() {
    const out = {};
    Object.entries(FE().LIBELLES).forEach(([k, d]) => { out[k] = d; });
    Object.entries(FC().LIBELLES).forEach(([k, d]) => { out[k] = d; });
    Object.entries(T().LIBELLES).forEach(([k, d]) => { out[k] = [d[0], d[1]]; });
    Object.assign(out, { Qair: ['Débit d\'air', 'm³/h'], Kvs: ['Kvs', ''], Qs: ['Débit soufflé', 'm³/h'], Qr: ['Débit repris', 'm³/h'], Lw: ['Puissance acoustique', 'dB(A)'], dn: ['DN', ''], kv: ['Kv (Kvs)', 'm³/h'],
      tours: ['Nombre de tours', ''], abaque: ['Abaque tours:Kv', ''], q: ['Débit', 'L/s'], pMin: ['Pression minimale', 'bar'], courbe: ['Courbe Q:H', 'm³/h:mCE'] });
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
  function ajouter(et, { type, fabricant = '', reference = '', valeurs = {}, nom = '' }) {
    const v = Object.fromEntries(Object.entries(valeurs || {}).filter(([, x]) => !vide(x)));
    const ex = (fabricant || reference) && liste(et).find(x => cleEq(x.type, x.fabricant, x.reference) === cleEq(type, fabricant, reference));
    if (ex) { Object.assign(ex.valeurs, v); if (nom) ex.nom = String(nom).slice(0, 120); return ex; }
    const x = { id: uid(), type, fabricant: fabricant || '', reference: reference || '', valeurs: v, nom: String(nom || '').slice(0, 120) };
    liste(et).push(x);
    return x;
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
      case 'pompe': set('courbe', v.courbe); set('ref', nom); break;
      case 'arbo': set('pompeCourbe', v.courbe); set('pompeRef', nom); break;
      case 'cta': FC().champs('cta', v).forEach(c => {
        if (!placement && (PLACEMENT_SEUL.cta.includes(c.k) || (['modeP', 'PchaudS', 'PfroidS'].includes(c.k) && ((note || {}).entrees || {}).modeP !== 'saisie'))) return;
        o[c.k] = c.val; }); break;
      case 'pid': case 'vase': case 'ecs': case 'reseau': FE().champs(genre, v).forEach(c => { o[c.k] = c.val; }); break;
      default: break;
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
      case 'pompe': set('courbe', el.courbe); break;
      case 'arbo': set('courbe', el.pompeCourbe); break;
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
      if (n.type === 'arbo' && (e.pompeEq || avecLibres)) out.push({ eq: e.pompeEq, note: n, genre: 'arbo', liste: null, el: e, champEq: 'pompeEq' });
    });
    return out;
  }
  const libelleEmplacement = (et, p) => {
    const n = p.note, lib = `N${et.notes.indexOf(n) + 1} — ${n.titre}`, el = p.el;
    if (!p.liste) return p.genre === 'arbo' ? `${lib} : pompe du réseau` : p.genre === 'pid' ? `${lib} : production` : lib;
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
    if (p.genre === 'arbo') { const f = ficheElement(x); if (JSON.stringify(p.el.pompeFiche) !== JSON.stringify(f)) { p.el.pompeFiche = f; k++; } }
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
      const f = p.genre === 'arbo' ? p.el.pompeFiche : p.el.fiche;
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
    const f = p.genre === 'arbo' ? el.pompeFiche : el.fiche;
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
  function placer(et, x, cible, opts = {}, nouvelleNote) {
    const [genre, rest = ''] = String(cible || '').split(':'), [id, sous] = rest.split('|'), notes = et.notes, nom = nomEq(x), v = x.valeurs || {};
    const qte = Math.max(1, Math.round(Number(opts.qte) || 1)), texte = norm(`${opts.texte || ''} ${x.nom || ''} ${x.reference || ''}`);
    const cibleNote = t => { if (id === 'nouveau' && nouvelleNote) { const n = nouvelleNote(t); notes.push(n); return n; } return notes.find(n => n.id === id && n.type === t); };
    const poser = (note, g, el, liste_, i) => { el.eq = x.id; reporter(x, { note, genre: g, el, liste: liste_, i }, true); };
    const noteEntiere = (n, g) => { n.entrees.eq = x.id; reporter(x, { note: n, genre: g, el: n.entrees, liste: null }, true); };
    if (genre === 'term' || genre === 'termp') {
      const n = cibleNote('terminaux'); if (!n) return null;
      const l = n.entrees.appareils = (n.entrees.appareils || []).filter(a => a.rep || a.local), deja = new Set(l.map(a => a.rep));
      const tt = genre === 'termp' ? { type: 'pompeDist', batterie: 'aucune', prefixe: 'PD' } : typeTerminal(texte, v);
      for (let k = 0; k < qte; k++) {
        const el = { rep: opts.rep && qte === 1 ? opts.rep : prochain(tt.prefixe, deja), local: opts.local || '', type: tt.type, n: 1, batterie: tt.batterie, vanne: genre === 'termp' ? 'aucune' : '2v', alim: 'cvc', regul: 'propre', ...(opts.circuit ? { circuit: opts.circuit } : {}) };
        l.push(el); poser(n, genre, el, 'appareils', l.length - 1);
      }
      return `${qte} ${genre === 'termp' ? 'pompe(s)' : 'terminal(aux)'} ${nom} ajouté(s) dans ${n.titre}`;
    }
    if (genre === 'cta') { const n = cibleNote('cta'); if (!n) return null; noteEntiere(n, 'cta'); if (id === 'nouveau') n.titre = `CTA ${nom}`; return `${n.titre} : ${nom}`; }
    if (genre === 'pid') { const n = notes.find(y => y.id === id && y.type === 'pid'); if (!n) return null; noteEntiere(n, 'pid'); return `${n.titre} : production ${nom}`; }
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
    if (genre === 'reseau' || genre === 'vase' || genre === 'ecs') { const n = cibleNote(genre); if (!n) return null; noteEntiere(n, genre); return `${n.titre} : ${nom}`; }
    if (genre === 'aero') {
      const n = notes.find(y => y.id === id && y.type === 'aero'); if (!n) return null;
      const l = n.entrees.bouchesL = n.entrees.bouchesL || [], deja = new Set(l.map(b => b.rep));
      for (let k = 0; k < qte; k++) { const el = { rep: opts.rep && qte === 1 ? opts.rep : prochain('B', deja), reseau: 'soufflage', salle: opts.local || '', etage: '', type: 'plafond', troncon: '' }; l.push(el); poser(n, 'aero', el, 'bouchesL', l.length - 1); }
      return `${qte} bouche(s) ${nom} ajoutée(s) dans ${n.titre} (tronçon à choisir)`;
    }
    if (genre === 'san') {
      const n = notes.find(y => y.id === id && y.type === 'sanitaire'); if (!n) return null;
      const l = n.entrees.points = n.entrees.points || [], deja = new Set(l.map(p => p.rep));
      const type = /douche/.test(texte) ? 'douche' : /baignoire/.test(texte) ? 'baignoire' : /evier/.test(texte) ? 'evier' : /\bwc\b|cuvette/.test(texte) ? 'wc' : /urinoir/.test(texte) ? 'urinoir' : /vidoir|vide-seau/.test(texte) ? 'videSeau' : /lave-mains/.test(texte) ? 'laveMains' : 'lavabo';
      for (let k = 0; k < qte; k++) { const el = { rep: prochain(type.slice(0, 2).toUpperCase(), deja), salle: opts.local || '', etage: '', type, troncon: '' }; l.push(el); poser(n, 'san', el, 'points', l.length - 1); }
      return `${qte} point(s) de puisage ${nom} ajouté(s) dans ${n.titre} (tronçon à choisir)`;
    }
    return null;
  }

  // Vue d'ensemble : modèles avec leurs emplacements
  function bilan(et) {
    const emp = emplacements(et);
    return liste(et).map(x => ({ x, nom: nomEq(x), emplacements: emp.filter(p => p.eq === x.id).map(p => ({ ...p, libelle: libelleEmplacement(et, p) })) }));
  }

  return { TYPES, TYPE_GENRE, libelles, ajouter, champs, inverse, emplacements, libelleEmplacement, collecter, propager, synchroniser, verrous, lier, detacher, supprimer, placer, bilan, nomEq, parId, typeTerminal, typeOrgane };
})();
if (typeof module !== 'undefined') module.exports = Registre;
