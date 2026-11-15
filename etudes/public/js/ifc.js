// Lecture des maquettes IFC (fichier STEP texte ISO 10303-21, IFC2x3 ou IFC4) dans le navigateur, sans dépendance :
// espaces (IfcSpace : numéro, nom, étage IfcBuildingStorey, surface, hauteur et volume lus dans les quantités
// IfcElementQuantity ou les propriétés), éléments de réseaux (IfcPipeSegment, IfcDuctSegment, IfcFlowSegment) avec leur
// longueur, leur repère (propriété « Repère » / « Mark » / « Commentaires », sinon Tag, sinon nom) et leur système.
// Alimente le bilan pièce par pièce (pièces de l'étude) et les longueurs des tronçons (comme l'import Revit CSV / DXF).
// Unités du projet (IfcSIUnit avec préfixe, IfcConversionBasedUnit) converties en m, m², m³. Module pur (navigateur, node, tests).
const Ifc = (() => {
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  /* ---------- Fichier STEP ---------- */
  // Chaîne STEP décodée : '' → ', \X2\00E9\X0\ → é, \X\E9 → é, \S\x → caractère + 128, \\ → \
  function decoder(s) {
    return String(s).replace(/\\X2\\((?:[0-9A-F]{4})+)\\X0\\/gi, (m, h) => h.match(/.{4}/g).map(x => String.fromCharCode(parseInt(x, 16))).join(''))
      .replace(/\\X4\\((?:[0-9A-F]{8})+)\\X0\\/gi, (m, h) => h.match(/.{8}/g).map(x => String.fromCodePoint(parseInt(x, 16))).join(''))
      .replace(/\\X\\([0-9A-F]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\S\\(.)/g, (m, c) => String.fromCharCode(c.charCodeAt(0) + 128))
      .replace(/\\P[A-I]\\/g, '').replace(/\\\\/g, '\\');
  }
  // Arguments d'une entité : listes → tableaux, #12 → { r: 12 }, 'texte' → chaîne, .ENUM. → { e: 'ENUM' },
  // $ et * → null, IFCLABEL('x') → { t: 'IFCLABEL', v: 'x' }, nombres → nombres
  function lireArgs(s) {
    let i = 0;
    const blanc = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    function valeur() {
      blanc();
      const c = s[i];
      if (c === '(') { i++; const l = []; blanc(); if (s[i] === ')') { i++; return l; } for (;;) { l.push(valeur()); blanc(); if (s[i] === ',') { i++; continue; } if (s[i] === ')') { i++; return l; } throw new Error(`liste mal fermée (position ${i})`); } }
      if (c === '\'') { let t = ''; i++; for (;;) { if (i >= s.length) throw new Error('chaîne non terminée'); if (s[i] === '\'') { if (s[i + 1] === '\'') { t += '\''; i += 2; continue; } i++; break; } t += s[i++]; } return decoder(t); }
      if (c === '"') { const j = s.indexOf('"', i + 1); const t = s.slice(i + 1, j); i = j + 1; return t; }
      if (c === '#') { const m = /^#(\d+)/.exec(s.slice(i, i + 20)); i += m[0].length; return { r: +m[1] }; }
      if (c === '.') { const j = s.indexOf('.', i + 1); const t = s.slice(i + 1, j); i = j + 1; return { e: t.toUpperCase() }; }
      if (c === '$' || c === '*') { i++; return null; }
      if (/[A-Za-z]/.test(c)) {
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i, i + 80)); i += m[0].length; blanc();
        if (s[i] !== '(') return { e: m[0].toUpperCase() };
        i++; const v = []; blanc();
        if (s[i] !== ')') for (;;) { v.push(valeur()); blanc(); if (s[i] === ',') { i++; continue; } break; }
        blanc(); if (s[i] === ')') i++;
        return { t: m[0].toUpperCase(), v: v.length === 1 ? v[0] : v };
      }
      const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(s.slice(i, i + 40));
      if (m) { i += m[0].length; return Number(m[0]); }
      throw new Error(`valeur illisible « ${s.slice(i, i + 12)} »`);
    }
    const out = [];
    blanc();
    if (s[i] === ')') return out;
    for (;;) { out.push(valeur()); blanc(); if (s[i] === ',') { i++; continue; } break; }
    return out;
  }
  // Entités de la section DATA : Map(id → { t, a }) ; instructions découpées sur « ; » hors chaînes et commentaires
  function entites(texte) {
    const T = String(texte || ''), out = new Map(), erreurs = [];
    if (!/ISO-10303-21/.test(T.slice(0, 200))) throw new Error('Ce n\'est pas un fichier IFC au format STEP (en-tête ISO-10303-21 attendu ; l\'IFC XML ou compressé n\'est pas lu).');
    const schema = ((/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(T) || [])[1] || '').toUpperCase();
    const d = T.search(/\bDATA\s*;/);
    if (d < 0) throw new Error('Section DATA introuvable dans le fichier IFC.');
    let i = T.indexOf(';', d) + 1, debut = i, q = false;
    for (; i < T.length; i++) {
      const c = T[i];
      if (q) { if (c === '\'') { if (T[i + 1] === '\'') i++; else q = false; } continue; }
      if (c === '\'') { q = true; continue; }
      if (c === '/' && T[i + 1] === '*') { const j = T.indexOf('*/', i + 2); i = j < 0 ? T.length : j + 1; continue; }
      if (c !== ';') continue;
      const ins = T.slice(debut, i).replace(/\/\*[\s\S]*?\*\//g, '').trim(); debut = i + 1;
      if (/^ENDSEC$/i.test(ins)) break;
      const m = /^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(([\s\S]*)\)$/.exec(ins);
      if (!m) continue;
      try { out.set(+m[1], { t: m[2].toUpperCase(), a: lireArgs(m[3]) }); } catch (e) { if (erreurs.length < 20) erreurs.push(`#${m[1]} ${m[2]} : ${e.message}`); }
    }
    return { schema, ents: out, erreurs };
  }

  /* ---------- Modèle ---------- */
  const PREFIXES = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 10, DECI: 0.1, CENTI: 0.01, MILLI: 1e-3, MICRO: 1e-6 };
  const SEGMENTS = ['IFCPIPESEGMENT', 'IFCDUCTSEGMENT', 'IFCFLOWSEGMENT'];
  const SYSTEMES = ['IFCSYSTEM', 'IFCDISTRIBUTIONSYSTEM', 'IFCDISTRIBUTIONCIRCUIT', 'IFCBUILDINGSYSTEM'];
  // Clés lues (quantités ou propriétés), par ordre de préférence
  const CLES = {
    S: [/^netfloorarea$/, /^(qto_spacebasequantities\.)?netfloorarea$/, /^netplannedarea$/, /^surface (nette|utile|habitable)?$/, /^grossfloorarea$/, /^grossplannedarea$/, /^floorarea$/, /^area$/, /^surface$/, /^superficie$/],
    H: [/^(finishceilingheight|clearheight|netheight|height|hauteur( sous plafond)?|hsp|unboundedheight|limit offset)$/, /^grossheight$/],
    V: [/^netvolume$/, /^grossvolume$/, /^volume$/],
    L: [/^length$/, /^longueur$/, /^netlength$/, /^grosslength$/],
    rep: [/^(rep[eè]re|repere|mark|marque|tag repere|troncon|tronçon)$/, /^(comments?|commentaires?)$/],
  };
  const clePref = (obj, l) => { for (const re of l) { const k = Object.keys(obj).find(x => re.test(norm(x))); if (k !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]; } return undefined; };
  const guidLike = s => /^[0-9A-Za-z_$]{22}$/.test(String(s || '')) && /[A-Z]/.test(s) && /[a-z0-9_$]/.test(s);

  function lire(texte) {
    const { schema, ents, erreurs } = entites(texte);
    const parType = new Map();
    ents.forEach((e, id) => { if (!parType.has(e.t)) parType.set(e.t, []); parType.get(e.t).push(id); });
    const de = t => (parType.get(t) || []).map(id => [id, ents.get(id)]);
    const ent = r => (r && r.r !== undefined ? ents.get(r.r) : null);
    const brut = v => (v && typeof v === 'object' && 't' in v ? brut(v.v) : v && typeof v === 'object' && 'e' in v ? v.e : v);
    const txt = v => { const x = brut(v); return x === null || x === undefined ? '' : String(x).trim(); };

    // Unités du projet
    const facteurUnite = u => {
      if (!u) return null;
      if (u.t === 'IFCSIUNIT') { const p = u.a[2] && u.a[2].e ? PREFIXES[u.a[2].e] || 1 : 1; return { type: (u.a[1] || {}).e, f: p }; }
      if (u.t === 'IFCCONVERSIONBASEDUNIT') { const m = ent(u.a[3]); const v = m ? Number(brut(m.a[0])) : NaN, b = m ? facteurUnite(ent(m.a[1])) : null; return { type: (u.a[1] || {}).e, f: Number.isFinite(v) ? v * ((b && b.f) || 1) : 1, nom: txt(u.a[2]) }; }
      return null;
    };
    const unites = { L: 1, S: 1, V: 1, nomL: 'm' };
    de('IFCUNITASSIGNMENT').slice(0, 1).forEach(([, e]) => (e.a[0] || []).forEach(r => {
      const u = facteurUnite(ent(r)); if (!u) return;
      if (u.type === 'LENGTHUNIT') { unites.L = u.f; unites.nomL = u.f === 1e-3 ? 'mm' : u.f === 0.01 ? 'cm' : u.f === 1 ? 'm' : u.nom || 'unité'; }
      if (u.type === 'AREAUNIT') unites.S = u.nom ? u.f : u.f * u.f;
      if (u.type === 'VOLUMEUNIT') unites.V = u.nom ? u.f : u.f * u.f * u.f;
    }));
    const MESURE = { IFCLENGTHMEASURE: 'L', IFCPOSITIVELENGTHMEASURE: 'L', IFCNONNEGATIVELENGTHMEASURE: 'L', IFCAREAMEASURE: 'S', IFCVOLUMEMEASURE: 'V' };
    const mesure = v => { const x = Number(brut(v)); if (!Number.isFinite(x)) return brut(v); const g = v && v.t && MESURE[v.t]; return g ? x * unites[g] : x; };

    // Propriétés et quantités de chaque objet
    const defs = new Map();
    de('IFCRELDEFINESBYPROPERTIES').forEach(([, e]) => { const p = e.a[5]; (e.a[4] || []).forEach(o => { if (!o || o.r === undefined) return; if (!defs.has(o.r)) defs.set(o.r, []); defs.get(o.r).push(p); }); });
    const typeDe = new Map();
    de('IFCRELDEFINESBYTYPE').forEach(([, e]) => { const ty = ent(e.a[5]); (e.a[4] || []).forEach(o => { if (o && ty) typeDe.set(o.r, ty); }); });
    function proprietes(id) {
      const q = {}, p = {};
      const lirePset = d => {
        if (!d) return;
        if (d.t === 'IFCELEMENTQUANTITY') (d.a[5] || []).forEach(r => { const x = ent(r); if (!x || !/^IFCQUANTITY/.test(x.t)) return; const g = { IFCQUANTITYLENGTH: 'L', IFCQUANTITYAREA: 'S', IFCQUANTITYVOLUME: 'V' }[x.t]; const v = Number(brut(x.a[3])); if (Number.isFinite(v)) q[txt(x.a[0])] = g ? v * unites[g] : v; });
        else if (d.t === 'IFCPROPERTYSET') (d.a[4] || []).forEach(r => { const x = ent(r); if (x && x.t === 'IFCPROPERTYSINGLEVALUE') p[txt(x.a[0])] = mesure(x.a[2]); });
      };
      (defs.get(id) || []).forEach(r => lirePset(ent(r)));
      // Propriétés du type (IfcPipeSegmentType…) : complètent celles de l'occurrence
      const ty = typeDe.get(id);
      if (ty && Array.isArray(ty.a[5])) ty.a[5].forEach(r => { const d = ent(r); if (!d) return; const avant = { ...p }; lirePset(d); Object.assign(p, avant); });
      return { q, p };
    }

    // Étages (IfcRelAggregates, IfcRelContainedInSpatialStructure) et systèmes (IfcRelAssignsToGroup)
    const parent = new Map();
    const rattacher = (enfants, pere) => (enfants || []).forEach(o => { if (o && o.r !== undefined && pere && pere.r !== undefined) parent.set(o.r, pere.r); });
    de('IFCRELAGGREGATES').forEach(([, e]) => rattacher(e.a[5], e.a[4]));
    de('IFCRELCONTAINEDINSPATIALSTRUCTURE').forEach(([, e]) => rattacher(e.a[4], e.a[5]));
    const etages = de('IFCBUILDINGSTOREY').map(([id, e]) => ({ id, nom: txt(e.a[2]) || txt(e.a[7]) || `Niveau #${id}`, elevation: Number.isFinite(Number(brut(e.a[9]))) ? Number(brut(e.a[9])) * unites.L : null }));
    const etageDe = id => { let k = id, n = 0; while (parent.has(k) && n++ < 20) { k = parent.get(k); const x = ents.get(k); if (x && x.t === 'IFCBUILDINGSTOREY') return etages.find(s => s.id === k).nom; } return ''; };
    const systeme = new Map();
    de('IFCRELASSIGNSTOGROUP').forEach(([, e]) => { const g = ent(e.a[6]); if (!g || !SYSTEMES.includes(g.t)) return; (e.a[4] || []).forEach(o => { if (o && !systeme.has(o.r)) systeme.set(o.r, txt(g.a[2]) || txt(g.a[7])); }); });

    // Espaces
    const arr = (x, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
    const espaces = de('IFCSPACE').map(([id, e]) => {
      const { q, p } = proprietes(id), tout = { ...p, ...q };
      const numero = txt(e.a[2]), longNom = txt(e.a[7]), nom = longNom || numero || `Espace #${id}`;
      const S = Number(clePref(q, CLES.S) ?? clePref(p, CLES.S)), V = Number(clePref(q, CLES.V) ?? clePref(p, CLES.V));
      let H = Number(clePref(q, CLES.H) ?? clePref(p, CLES.H));
      if (!(H > 0) && S > 0 && V > 0) H = V / S;
      return { id, numero: longNom ? numero : '', nom, libelle: longNom && numero && norm(numero) !== norm(longNom) ? `${numero} ${longNom}` : nom, etage: etageDe(id),
        S: S > 0 ? arr(S) : null, H: H > 0 ? arr(H) : null, V: V > 0 ? arr(V) : (S > 0 && H > 0 ? arr(S * H) : null), proprietes: Object.keys(tout).length };
    });

    // Éléments de réseaux
    const segments = SEGMENTS.flatMap(t => de(t)).map(([id, e]) => {
      const { q, p } = proprietes(id), ty = typeDe.get(id);
      const L = Number(clePref(q, CLES.L) ?? clePref(p, CLES.L)), tag = txt(e.a[7]), nom = txt(e.a[2]);
      const repP = clePref(p, CLES.rep), rep = (repP !== undefined && String(repP).trim()) || (tag && !guidLike(tag) && !/^\d{5,}$/.test(tag) ? tag : '') || nom;
      const genre = e.t === 'IFCPIPESEGMENT' || (ty && /^IFCPIPE/.test(ty.t)) ? 'tuyauterie' : e.t === 'IFCDUCTSEGMENT' || (ty && /^IFCDUCT/.test(ty.t)) ? 'gaine' : 'réseau';
      return { id, type: e.t, genre, nom, rep: String(rep || '').trim(), systeme: systeme.get(id) || '', etage: etageDe(id), L: L > 0 ? L : null };
    });
    return { schema, unites, etages, espaces, segments, erreurs, entites: ents.size };
  }

  /* ---------- Bilan pièce par pièce ---------- */
  // Usage du bilan d'après le nom de l'espace (Pieces.USAGES)
  const USAGES = [[/reunion|conference|visio/, 'reunion'], [/open ?space|plateau/, 'open'], [/bureau|office|direction|secretariat/, 'bureau'], [/classe|cours|formation|amphi/, 'classe'],
    [/chambre|dortoir/, 'chambre'], [/sejour|salon|living/, 'sejour'], [/restaurant|refectoire|cantine|self|salle a manger|cafeteria/, 'restaurant'], [/commerce|boutique|magasin|vente/, 'commerce'],
    [/informatique|serveur|baie|datacenter|local it/, 'informatique'], [/sanitaire|wc|toilette|douche|vestiaire|sdb|salle de bain|salle d.eau/, 'sanitaires'], [/circulation|couloir|degagement|palier|escalier|sas/, 'circulation'],
    [/accueil|hall|entree|attente/, 'accueil']];
  const usageDe = nom => { const n = norm(nom); const u = USAGES.find(([re]) => re.test(n)); return u ? u[1] : 'bureau'; };
  // Propositions pour les pièces d'un bilan : [{ action: 'ajout' | 'maj', i, piece, avant }] ; remplacer : liste reprise de zéro
  function versPieces(lu, existantes, { remplacer = false } = {}) {
    const ex = remplacer ? [] : (existantes || []).map(p => ({ ...p })), out = [], vus = new Set();
    const noms = new Map(); (lu.espaces || []).forEach(s => noms.set(norm(s.nom), (noms.get(norm(s.nom)) || 0) + 1));
    (lu.espaces || []).forEach(s => {
      if (!(s.S > 0) && !s.nom) return;
      const lib = s.libelle || s.nom;
      let i = ex.findIndex((p, k) => !vus.has(k) && norm(p.nom) === norm(lib));
      if (i < 0 && noms.get(norm(s.nom)) === 1) i = ex.findIndex((p, k) => !vus.has(k) && norm(p.nom) === norm(s.nom));
      const H = s.H > 0 ? s.H : null;
      if (i >= 0) {
        vus.add(i);
        const avant = ex[i], piece = { ...avant, ...(s.S > 0 ? { S: s.S } : {}), ...(H ? { H } : {}), ...(s.etage ? { etage: s.etage } : {}) };
        out.push({ action: 'maj', i, piece, avant, espace: s });
      } else out.push({ action: 'ajout', i: -1, piece: { nom: lib, etage: s.etage || '', usage: usageDe(s.nom), S: s.S > 0 ? s.S : '', H: H || 2.7, vitrage: '', orient: 'aucune', occ: '', Qair: '' }, avant: null, espace: s });
    });
    return out;
  }
  // Pièces du bilan après application des propositions retenues (index de out cochés)
  function appliquerPieces(existantes, propositions, { remplacer = false, retenues } = {}) {
    const l = remplacer ? [] : (existantes || []).map(p => ({ ...p }));
    propositions.forEach((x, k) => { if (retenues && !retenues.has(k)) return; if (x.action === 'maj' && !remplacer) l[x.i] = x.piece; else l.push(x.piece); });
    return l;
  }

  /* ---------- Longueurs des tronçons ---------- */
  // Même forme que Longueurs.dxf / depuisTableau : { parRep: Map(repère → m), lignes, colonnes, unite } ; cle : 'rep' ou 'systeme'
  function longueurs(lu, { cle = 'rep' } = {}) {
    const parRep = new Map(), segs = (lu.segments || []).filter(s => s.L > 0 && String(s[cle] || '').trim());
    segs.forEach(s => { const k = String(s[cle]).trim(); parRep.set(k, (parRep.get(k) || 0) + s.L * unites(lu)); });
    const sansL = (lu.segments || []).filter(s => !(s.L > 0)).length;
    return { parRep: new Map([...parRep].map(([k, v]) => [k, Math.round(v * 1000) / 1000])), lignes: segs.length, colonnes: [cle === 'systeme' ? 'Système' : 'Repère', 'Longueur'], unite: 'm', sansLongueur: sansL,
      ...(!(lu.segments || []).length ? { erreur: 'Aucun élément de réseau (IfcPipeSegment, IfcDuctSegment, IfcFlowSegment) dans la maquette.' } : !segs.length ? { erreur: 'Éléments de réseau sans longueur ni repère : exportez les quantités (Qto) et une propriété « Repère » / « Commentaires ».' } : {}) };
  }
  // Longueurs déjà converties en mètres par lire() : facteur 1 (gardé pour les objets construits à la main)
  const unites = () => 1;
  // Résumé de lecture
  const resume = lu => `${lu.schema || 'IFC'} : ${lu.etages.length} étage(s), ${lu.espaces.length} espace(s), ${lu.segments.length} élément(s) de réseau${lu.unites && lu.unites.nomL !== 'm' ? ` (longueurs du projet en ${lu.unites.nomL}, converties en m)` : ''}`;

  return { decoder, lireArgs, entites, lire, versPieces, appliquerPieces, longueurs, usageDe, resume };
})();
if (typeof module !== 'undefined') module.exports = Ifc;
