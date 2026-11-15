// Lecture des maquettes IFC (fichier STEP texte ISO 10303-21, IFC2x3 ou IFC4) dans le navigateur, sans dépendance :
// espaces (IfcSpace : numéro, nom, étage IfcBuildingStorey, surface, hauteur et volume lus dans les quantités
// IfcElementQuantity ou les propriétés), éléments de réseaux (IfcPipeSegment, IfcDuctSegment, IfcFlowSegment) avec leur
// longueur, leur repère (propriété « Repère » / « Mark » / « Commentaires », sinon Tag, sinon nom) et leur système.
// Alimente le bilan pièce par pièce (pièces de l'étude) et les longueurs des tronçons (comme l'import Revit CSV / DXF).
// Unités du projet (IfcSIUnit avec préfixe, IfcConversionBasedUnit) converties en m, m², m³.
// Vitrages : fenêtres (IfcWindow) rattachées aux espaces par les limites d'espace (IfcRelSpaceBoundary), directement ou par
// leur mur (IfcRelFillsElement → IfcOpeningElement → IfcRelVoidsElement → mur) ; surface lue dans les quantités
// (IfcQuantityArea), sinon OverallWidth × OverallHeight ; orientation par la normale de la limite d'espace (IfcPlane de la
// géométrie de connexion, dirigée vers l'extérieur de l'espace), sinon par l'axe Y local du mur, ramenée au nord
// géographique (IfcGeometricRepresentationContext.TrueNorth) par la chaîne des placements (IfcLocalPlacement /
// IfcAxis2Placement3D) — sans moteur géométrique.
// IFC XML (ifcXML IFC2x3 ou IFC4, .ifcxml) lu vers le même modèle d'entités que le STEP. Module pur (navigateur, node, tests).
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
    if (!/ISO-10303-21/.test(T.slice(0, 200))) throw new Error('Ce n\'est pas un fichier IFC au format STEP (en-tête ISO-10303-21 attendu) ni IFC XML (.ifcxml) ; l\'IFC compressé (.ifczip) n\'est pas lu.');
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

  /* ---------- IFC XML (ifcXML, ISO 10303-28) ---------- */
  // Arbre XML minimal : { nom (sans préfixe d'espace de noms), at, enf, txt }
  function xmlArbre(texte) {
    const T = String(texte || ''), racine = { nom: '#doc', at: {}, enf: [], txt: '' }, pile = [racine];
    const ent = x => x.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, c) => (c[0] === '#' ? String.fromCodePoint(c[1] === 'x' || c[1] === 'X' ? parseInt(c.slice(2), 16) : +c.slice(1)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' }[c.toLowerCase()]));
    const local = n => n.replace(/^[^:]*:/, '');
    let i = 0;
    while (i < T.length) {
      const j = T.indexOf('<', i), haut = pile[pile.length - 1];
      if (j < 0) { haut.txt += ent(T.slice(i)); break; }
      if (j > i) haut.txt += ent(T.slice(i, j));
      if (T.startsWith('<!--', j)) { const k = T.indexOf('-->', j); i = k < 0 ? T.length : k + 3; continue; }
      if (T.startsWith('<![CDATA[', j)) { const k = T.indexOf(']]>', j); haut.txt += T.slice(j + 9, k < 0 ? T.length : k); i = k < 0 ? T.length : k + 3; continue; }
      if (T[j + 1] === '?' || T[j + 1] === '!') { const k = T.indexOf('>', j); i = k < 0 ? T.length : k + 1; continue; }
      let k = j + 1, q = '';
      for (; k < T.length; k++) { const c = T[k]; if (q) { if (c === q) q = ''; } else if (c === '"' || c === '\'') q = c; else if (c === '>') break; }
      const tag = T.slice(j + 1, k); i = k + 1;
      if (tag[0] === '/') { if (pile.length > 1) pile.pop(); continue; }
      const auto = /\/\s*$/.test(tag), corps = tag.replace(/\/\s*$/, ''), m = /^\s*([^\s/>]+)/.exec(corps);
      if (!m) continue;
      const at = {}, re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g; let a;
      const reste = corps.slice(m[0].length);
      while ((a = re.exec(reste))) at[local(a[1])] = ent(a[3] !== undefined ? a[3] : a[4]);
      const el = { nom: local(m[1]), at, enf: [], txt: '' };
      haut.enf.push(el); if (!auto) pile.push(el);
    }
    return racine;
  }
  // Noms des attributs (ordre du schéma) des entités lues : l'IFC XML nomme les attributs, le STEP les range par position
  const RACINE = ['GlobalId', 'OwnerHistory', 'Name', 'Description'], OBJET = [...RACINE, 'ObjectType'], PRODUIT = [...OBJET, 'ObjectPlacement', 'Representation'], ELEMENT = [...PRODUIT, 'Tag'];
  const SPATIAL = [...PRODUIT, 'LongName', 'CompositionType'], REL = n => [...RACINE, ...n];
  const ATTRS = {
    IFCPROJECT: [...OBJET, 'LongName', 'Phase', 'RepresentationContexts', 'UnitsInContext'], IFCSITE: [...SPATIAL, 'RefLatitude', 'RefLongitude', 'RefElevation', 'LandTitleNumber', 'SiteAddress'],
    IFCBUILDING: [...SPATIAL, 'ElevationOfRefHeight', 'ElevationOfTerrain', 'BuildingAddress'], IFCBUILDINGSTOREY: [...SPATIAL, 'Elevation'], IFCSPACE: [...SPATIAL, 'PredefinedType', 'ElevationWithFlooring'],
    IFCWINDOW: [...ELEMENT, 'OverallHeight', 'OverallWidth', 'PredefinedType', 'PartitioningType', 'UserDefinedPartitioningType'], IFCOPENINGELEMENT: [...ELEMENT, 'PredefinedType'],
    IFCWALL: [...ELEMENT, 'PredefinedType'], IFCCURTAINWALL: [...ELEMENT, 'PredefinedType'], IFCPIPESEGMENT: [...ELEMENT, 'PredefinedType'], IFCDUCTSEGMENT: [...ELEMENT, 'PredefinedType'], IFCFLOWSEGMENT: ELEMENT,
    IFCSYSTEM: OBJET, IFCDISTRIBUTIONSYSTEM: [...OBJET, 'LongName', 'PredefinedType'], IFCDISTRIBUTIONCIRCUIT: [...OBJET, 'LongName', 'PredefinedType'], IFCBUILDINGSYSTEM: [...OBJET, 'PredefinedType', 'LongName'],
    IFCRELAGGREGATES: REL(['RelatingObject', 'RelatedObjects']), IFCRELCONTAINEDINSPATIALSTRUCTURE: REL(['RelatedElements', 'RelatingStructure']),
    IFCRELDEFINESBYPROPERTIES: REL(['RelatedObjects', 'RelatingPropertyDefinition']), IFCRELDEFINESBYTYPE: REL(['RelatedObjects', 'RelatingType']),
    IFCRELASSIGNSTOGROUP: REL(['RelatedObjects', 'RelatedObjectsType', 'RelatingGroup']), IFCRELFILLSELEMENT: REL(['RelatingOpeningElement', 'RelatedBuildingElement']),
    IFCRELVOIDSELEMENT: REL(['RelatingBuildingElement', 'RelatedOpeningElement']), IFCRELSPACEBOUNDARY: REL(['RelatingSpace', 'RelatedBuildingElement', 'ConnectionGeometry', 'PhysicalOrVirtualBoundary', 'InternalOrExternalBoundary']),
    IFCELEMENTQUANTITY: [...RACINE, 'MethodOfMeasurement', 'Quantities'], IFCPROPERTYSET: [...RACINE, 'HasProperties'], IFCPROPERTYSINGLEVALUE: ['Name', 'Description', 'NominalValue', 'Unit'],
    IFCQUANTITYLENGTH: ['Name', 'Description', 'Unit', 'LengthValue', 'Formula'], IFCQUANTITYAREA: ['Name', 'Description', 'Unit', 'AreaValue', 'Formula'], IFCQUANTITYVOLUME: ['Name', 'Description', 'Unit', 'VolumeValue', 'Formula'],
    IFCQUANTITYCOUNT: ['Name', 'Description', 'Unit', 'CountValue', 'Formula'], IFCUNITASSIGNMENT: ['Units'], IFCSIUNIT: ['Dimensions', 'UnitType', 'Prefix', 'Name'],
    IFCCONVERSIONBASEDUNIT: ['Dimensions', 'UnitType', 'Name', 'ConversionFactor'], IFCMEASUREWITHUNIT: ['ValueComponent', 'UnitComponent'],
    IFCLOCALPLACEMENT: ['PlacementRelTo', 'RelativePlacement'], IFCAXIS2PLACEMENT3D: ['Location', 'Axis', 'RefDirection'], IFCAXIS2PLACEMENT2D: ['Location', 'RefDirection'],
    IFCCARTESIANPOINT: ['Coordinates'], IFCDIRECTION: ['DirectionRatios'], IFCGEOMETRICREPRESENTATIONCONTEXT: ['ContextIdentifier', 'ContextType', 'CoordinateSpaceDimension', 'Precision', 'WorldCoordinateSystem', 'TrueNorth'],
    IFCCONNECTIONSURFACEGEOMETRY: ['SurfaceOnRelatingElement', 'SurfaceOnRelatedElement'], IFCCURVEBOUNDEDPLANE: ['BasisSurface', 'OuterBoundary', 'InnerBoundaries'], IFCPLANE: ['Position'],
    IFCFACESURFACE: ['Bounds', 'FaceSurface', 'SameSense'], IFCPOLYLINE: ['Points'],
  };
  ['IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE'].forEach(t => { ATTRS[t] = ATTRS.IFCWALL; }); ATTRS.IFCWINDOWSTANDARDCASE = ATTRS.IFCWINDOW;
  ['IFCPIPESEGMENTTYPE', 'IFCDUCTSEGMENTTYPE', 'IFCWINDOWTYPE', 'IFCWALLTYPE'].forEach(t => { ATTRS[t] = [...RACINE, 'ApplicableOccurrence', 'HasPropertySets', 'RepresentationMaps', 'Tag', 'ElementType', 'PredefinedType']; });
  const LISTES = new Set(['RelatedObjects', 'RelatedElements', 'HasProperties', 'Quantities', 'Units', 'HasPropertySets', 'Coordinates', 'DirectionRatios', 'RepresentationContexts', 'InnerBoundaries', 'Points', 'Bounds', 'RepresentationMaps', 'RefLatitude', 'RefLongitude']);
  const ENUMS = new Set(['UnitType', 'Prefix', 'PredefinedType', 'CompositionType', 'InternalOrExternalBoundary', 'PhysicalOrVirtualBoundary', 'PartitioningType', 'InteriorOrExteriorSpace', 'ElementType']);
  const NOMBRES = new Set(['OverallHeight', 'OverallWidth', 'Elevation', 'LengthValue', 'AreaValue', 'VolumeValue', 'CountValue', 'ElevationWithFlooring', 'Precision', 'CoordinateSpaceDimension', 'ElevationOfRefHeight', 'ElevationOfTerrain', 'RefElevation']);
  const XSI = new Set(['id', 'ref', 'type', 'nil', 'pos', 'cType', 'arraySize', 'itemType', 'schemaLocation', 'href', 'proxy', 'edo', 'path']);
  const TEXTES = /^IFC(LABEL|TEXT|IDENTIFIER|LOGICAL|BOOLEAN|DATETIME|DATE|TIME|URIREFERENCE)$/;
  const nombre = v => { const t = String(v).trim(); return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : t; };
  // Entités d'un fichier IFC XML : même forme que entites() (Map(id → { t, a }))
  function entitesXml(texte) {
    const T = String(texte || ''), doc = xmlArbre(T), ents = new Map(), erreurs = [], ids = new Map();
    let n = 0;
    const cle = s => { if (!ids.has(s)) ids.set(s, ++n); return ids.get(s); };
    const simple = (k, v) => (ENUMS.has(k) ? { e: String(v).trim().toUpperCase() } : LISTES.has(k) ? String(v).trim().split(/\s+/).filter(Boolean).map(nombre) : NOMBRES.has(k) ? nombre(v) : String(v));
    const estEntite = x => /^Ifc[A-Z0-9]/.test(x.nom) && !/-wrapper$/.test(x.nom) && (x.at.id !== undefined || x.enf.length > 0 || Object.keys(x.at).some(k => !XSI.has(k)));
    function entite(el, nomType) {
      const id = el.at.id !== undefined ? cle(el.at.id) : cle(`#anonyme${n + 1}`), t = String(nomType || el.nom).toUpperCase(), vals = {};
      Object.entries(el.at).forEach(([k, v]) => { if (!XSI.has(k)) vals[k] = simple(k, v); });
      el.enf.forEach(c => { vals[c.nom] = attr(c); });
      const noms = ATTRS[t];
      ents.set(id, { t, a: noms ? noms.map(k => (k in vals ? vals[k] : null)) : Object.values(vals) });
      return { r: id };
    }
    // Valeur dans un attribut : référence, entité en ligne ou valeur typée (IfcLabel, IfcAreaMeasure-wrapper…)
    function element(x) {
      if (x.at.ref !== undefined) return { r: cle(x.at.ref) };
      if (estEntite(x) && !(x.enf.length === 0 && x.txt.trim() && x.at.id === undefined)) return entite(x);
      const t = x.nom.replace(/-wrapper$/, '').toUpperCase();
      return { t, v: TEXTES.test(t) ? x.txt.trim() : nombre(x.txt) };
    }
    function attr(c) {
      if (c.at.ref !== undefined) return { r: cle(c.at.ref) };
      const ty = c.at.type ? c.at.type.replace(/^[^:]*:/, '') : '';
      // Entité en ligne dans l'attribut (xsi:type = entité, avec identifiant, attributs ou enfants)
      if (ty && /^Ifc/.test(ty) && !/-wrapper$/.test(ty) && (c.at.id !== undefined || c.enf.length || Object.keys(c.at).some(k => !XSI.has(k)))) return entite(c, ty);
      if (c.enf.length) { const l = c.enf.map(element); return LISTES.has(c.nom) || c.at.cType || l.length > 1 ? l : l[0]; }
      if (c.at.nil === 'true') return null;
      const v = c.txt.trim();
      if (ty && /^Ifc/.test(ty)) { const t = ty.replace(/-wrapper$/, '').toUpperCase(); return { t, v: TEXTES.test(t) ? v : nombre(v) }; }
      return v === '' ? null : simple(c.nom, v);
    }
    const parcourir = el => el.enf.forEach(x => { if (/^Ifc[A-Z0-9]/.test(x.nom) && x.at.id !== undefined) { try { entite(x); } catch (e) { if (erreurs.length < 20) erreurs.push(`${x.nom} ${x.at.id} : ${e.message}`); } } else parcourir(x); });
    parcourir(doc);
    const tete = T.slice(0, 3000), schema = /IFC4X3/i.test(tete) ? 'IFC4X3' : /IFC4/i.test(tete) ? 'IFC4' : /IFC2X3|IFC2x3/i.test(tete) ? 'IFC2X3' : 'IFC';
    return { schema, ents, erreurs, format: 'ifcXML' };
  }
  const estXml = texte => /^\s*</.test(String(texte || '').replace(/^\uFEFF/, '').slice(0, 200));

  /* ---------- Géométrie légère : placements, nord, orientation ---------- */
  const ORIENTS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const v3 = {
    norm: v => { const l = Math.hypot(...v); return l > 1e-12 ? v.map(x => x / l) : null; },
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    mul: (M, v) => [0, 1, 2].map(i => M[0][i] * v[0] + M[1][i] * v[1] + M[2][i] * v[2]), // M : colonnes [X, Y, Z]
    tmul: (M, v) => M.map(c => c[0] * v[0] + c[1] * v[1] + c[2] * v[2]),
  };
  const ID = { o: [0, 0, 0], R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
  // Azimut (degrés, sens horaire depuis le nord) d'une direction horizontale du projet, nord géographique (x, y) du projet
  function azimut(n, nord) {
    const N = v3.norm([nord[0], nord[1], 0]) || [0, 1, 0], E = [N[1], -N[0], 0], h = Math.hypot(n[0], n[1]);
    if (h < 0.3) return null;
    const a = Math.atan2(n[0] * E[0] + n[1] * E[1], n[0] * N[0] + n[1] * N[1]) * 180 / Math.PI;
    return (a + 360) % 360;
  }
  const orientDe = az => (az === null ? '' : ORIENTS[Math.round(az / 45) % 8]);

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
    const xml = estXml(texte), { schema, ents, erreurs } = xml ? entitesXml(texte) : entites(texte);
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
    // Vitrages : fenêtres → espaces (limites d'espace), surface et orientation
    const vitrages = lireVitrages({ ents, de, ent, brut, txt, proprietes, unites });
    const parEsp = new Map();
    vitrages.forEach(w => (w.espaces || []).slice(0, 1).forEach(sid => { if (!parEsp.has(sid)) parEsp.set(sid, []); parEsp.get(sid).push(w); }));
    espaces.forEach(s => {
      const l = parEsp.get(s.id) || [], par = {};
      l.forEach(w => { const k = w.orient || '?'; par[k] = (par[k] || 0) + (w.S || 0); });
      s.vitrages = Object.entries(par).map(([orient, S]) => ({ orient: orient === '?' ? '' : orient, S: arr(S) })).filter(x => x.S > 0).sort((a, b) => b.S - a.S);
      s.Svitrage = s.vitrages.length ? arr(s.vitrages.reduce((a, x) => a + x.S, 0)) : null;
      s.aVerifier = l.some(w => w.aVerifier);
      s.fenetres = l.length;
    });
    return { schema, format: xml ? 'ifcXML' : 'STEP', unites, etages, espaces, segments, vitrages, nord: vitrages.nord, erreurs, entites: ents.size };
  }

  // Fenêtres de la maquette : [{ id, nom, S (m²), orient, az, espaces: [id d'espace], source, aVerifier }] ; .nord : nord géographique
  function lireVitrages({ ents, de, ent, brut, txt, proprietes, unites }) {
    const L = unites.L;
    const coords = r => { const p = ent(r); return p && Array.isArray(p.a[0]) ? [0, 1, 2].map(i => Number(brut(p.a[0][i])) || 0) : null; };
    const dir = r => { const p = ent(r); return p && Array.isArray(p.a[0]) ? v3.norm([0, 1, 2].map(i => Number(brut(p.a[0][i])) || 0)) : null; };
    // Repère d'un IfcAxis2Placement3D / 2D : origine (m) et axes (colonnes X, Y, Z)
    function repere(r) {
      const p = ent(r); if (!p) return ID;
      const o = (coords(p.a[0]) || [0, 0, 0]).map(x => x * L);
      let z = [0, 0, 1], xr = [1, 0, 0];
      if (p.t === 'IFCAXIS2PLACEMENT3D') { z = dir(p.a[1]) || z; xr = dir(p.a[2]) || (Math.abs(z[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0]); } else if (p.t === 'IFCAXIS2PLACEMENT2D') xr = dir(p.a[1]) || xr;
      const d = v3.dot(xr, z), x = v3.norm([xr[0] - d * z[0], xr[1] - d * z[1], xr[2] - d * z[2]]) || [1, 0, 0], y = v3.cross(z, x);
      return { o, R: [x, y, z] };
    }
    const compose = (P, Q) => ({ o: P.o.map((x, i) => x + v3.mul(P.R, Q.o)[i]), R: Q.R.map(c => v3.mul(P.R, c)) });
    const memo = new Map();
    // Placement absolu d'un IfcLocalPlacement (chaîne PlacementRelTo)
    function absolu(r, prof = 0) {
      if (!r || r.r === undefined) return ID;
      if (memo.has(r.r)) return memo.get(r.r);
      const p = ents.get(r.r); let res = ID;
      if (p && p.t === 'IFCLOCALPLACEMENT' && prof < 50) res = compose(p.a[0] ? absolu(p.a[0], prof + 1) : ID, repere(p.a[1]));
      memo.set(r.r, res); return res;
    }
    const placementDe = id => { const e = ents.get(id); return e ? absolu(e.a[5]) : ID; };
    // Nord géographique : contexte de représentation 3D (TrueNorth, dans son système de coordonnées)
    let nord = { x: 0, y: 1, source: 'axe Y du projet (TrueNorth absent)' };
    const ctx = de('IFCGEOMETRICREPRESENTATIONCONTEXT').map(([, e]) => e).filter(e => e.a[5]).sort((a, b) => (txt(b.a[1]) === 'Model') - (txt(a.a[1]) === 'Model'))[0];
    if (ctx) { const d = dir(ctx.a[5]), W = ctx.a[4] ? repere(ctx.a[4]) : ID; if (d) { const n = v3.mul(W.R, d); nord = { x: n[0], y: n[1], source: 'IfcGeometricRepresentationContext.TrueNorth' }; } }
    nord.rotation = Math.round(((Math.atan2(-nord.x, nord.y) * 180 / Math.PI) + 360) % 360 * 10) / 10; // angle du nord depuis l'axe Y, sens trigonométrique
    // Relations : ouverture → mur, fenêtre → ouverture, limites d'espace
    const murDe = new Map(), ouvDe = new Map(), limites = [];
    de('IFCRELVOIDSELEMENT').forEach(([, e]) => { if (e.a[4] && e.a[5]) murDe.set(e.a[5].r, e.a[4].r); });
    de('IFCRELFILLSELEMENT').forEach(([, e]) => { if (e.a[4] && e.a[5]) ouvDe.set(e.a[5].r, e.a[4].r); });
    de('IFCRELSPACEBOUNDARY').concat(de('IFCRELSPACEBOUNDARY1STLEVEL'), de('IFCRELSPACEBOUNDARY2NDLEVEL')).forEach(([, e]) => {
      if (!e.a[4] || !e.a[5]) return;
      limites.push({ espace: e.a[4].r, elem: e.a[5].r, geom: ent(e.a[6]), ext: (e.a[8] && e.a[8].e) || '' });
    });
    // Plan d'une limite d'espace (repère du plan dans le repère de l'espace) et sa normale absolue, dirigée hors de l'espace
    function planLimite(b) {
      let g = b.geom, sens = 1; if (!g) return null;
      let surf = g.t === 'IFCCONNECTIONSURFACEGEOMETRY' ? ent(g.a[0]) : null, poly = null;
      if (surf && (surf.t === 'IFCCURVEBOUNDEDPLANE' || surf.t === 'IFCCURVEBOUNDEDSURFACE')) { poly = ent(surf.a[1]); surf = ent(surf.a[0]); }
      else if (surf && surf.t === 'IFCFACESURFACE') { if (surf.a[2] && surf.a[2].e === 'F') sens = -1; surf = ent(surf.a[1]); }
      if (!surf || surf.t !== 'IFCPLANE') return null;
      const P = compose(placementDe(b.espace), repere(surf.a[0])), n = P.R[2].map(x => x * sens);
      let boite = null;
      if (poly && poly.t === 'IFCPOLYLINE' && Array.isArray(poly.a[0])) {
        const pts = poly.a[0].map(coords).filter(Boolean).map(c => c.map(x => x * L));
        if (pts.length) boite = [Math.min(...pts.map(q => q[0])), Math.max(...pts.map(q => q[0])), Math.min(...pts.map(q => q[1])), Math.max(...pts.map(q => q[1]))];
      }
      return { P, n, boite };
    }
    const dansPlan = (pl, pt) => { if (!pl || !pl.boite) return null; const q = v3.tmul(pl.P.R, pt.map((x, i) => x - pl.P.o[i])), t = 0.3; return q[0] >= pl.boite[0] - t && q[0] <= pl.boite[1] + t && q[1] >= pl.boite[2] - t && q[1] <= pl.boite[3] + t && Math.abs(q[2]) < 1; };
    const CLES_S = [/^area$/, /^netarea$/, /^grossarea$/, /^surface$/, /^superficie$/], CLES_W = [/^(width|overallwidth|largeur)$/], CLES_H = [/^(height|overallheight|hauteur)$/];
    const fenetres = ['IFCWINDOW', 'IFCWINDOWSTANDARDCASE'].flatMap(t => de(t));
    const out = fenetres.map(([id, e]) => {
      const { q, p } = proprietes(id), ouv = ouvDe.get(id), mur = ouv !== undefined ? murDe.get(ouv) : undefined, po = ouv !== undefined ? proprietes(ouv) : { q: {}, p: {} };
      // Surface : quantité de la fenêtre, sinon largeur × hauteur hors tout, sinon quantités de l'ouverture
      let S = Number(clePref(q, CLES_S) ?? clePref(p, CLES_S)), src = 'quantité (IfcQuantityArea)';
      const Hh = Number(brut(e.a[8])), Ww = Number(brut(e.a[9]));
      if (!(S > 0) && Hh > 0 && Ww > 0) { S = Hh * Ww * L * L; src = 'OverallWidth × OverallHeight'; }
      if (!(S > 0)) { const w = Number(clePref(q, CLES_W) ?? clePref(po.q, CLES_W)), h = Number(clePref(q, CLES_H) ?? clePref(po.q, CLES_H)); if (w > 0 && h > 0) { S = w * h; src = 'largeur × hauteur (quantités)'; } }
      if (!(S > 0)) { const so = Number(clePref(po.q, CLES_S)); if (so > 0) { S = so; src = 'surface de l\'ouverture'; } }
      // Espaces : limites portant la fenêtre, sinon son mur (limites extérieures d'abord)
      const pt = placementDe(id).o;
      let lims = limites.filter(b => b.elem === id), viaMur = false;
      if (!lims.length && mur !== undefined) { lims = limites.filter(b => b.elem === mur); viaMur = true; }
      if (lims.some(b => b.ext === 'EXTERNAL')) lims = lims.filter(b => b.ext === 'EXTERNAL');
      const plans = lims.map(b => ({ b, pl: planLimite(b) }));
      // Plusieurs espaces le long du même mur : celui dont la limite contient la fenêtre
      let choix = plans;
      if (plans.length > 1) { const d = plans.filter(x => dansPlan(x.pl, pt) === true); if (d.length) choix = d; }
      const espaces = [...new Set(choix.map(x => x.b.espace))];
      let n = null, source = '', aVerifier = espaces.length > 1;
      const pl = (choix.find(x => x.pl) || {}).pl;
      if (pl) { n = pl.n; source = 'limite d\'espace (IfcRelSpaceBoundary)'; }
      else if (mur !== undefined) {
        // Axe Y local du mur, dirigé à l'opposé de l'origine de l'espace (à vérifier)
        const M = placementDe(mur); n = M.R[1].slice(); source = 'axe du mur (sens à vérifier)'; aVerifier = true;
        if (espaces.length) { const o = placementDe(espaces[0]).o, d = pt.map((x, i) => x - o[i]); if (v3.dot(n, d) < 0) n = n.map(x => -x); }
      }
      const az = n ? azimut(n, [nord.x, nord.y]) : null;
      return { id, nom: txt(e.a[2]) || txt(e.a[7]) || `Fenêtre #${id}`, S: S > 0 ? Math.round(S * 100) / 100 : null, surfaceSource: S > 0 ? src : '', orient: orientDe(az), az: az === null ? null : Math.round(az), horizontale: !!n && az === null,
        espaces, viaMur, source, aVerifier: aVerifier || (!!n && az === null) };
    });
    out.nord = nord;
    return out;
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
      const H = s.H > 0 ? s.H : null, vit = vitragesPiece(s);
      if (i >= 0) {
        vus.add(i);
        const avant = ex[i], piece = { ...avant, ...(s.S > 0 ? { S: s.S } : {}), ...(H ? { H } : {}), ...(s.etage ? { etage: s.etage } : {}), ...(vit || {}) };
        out.push({ action: 'maj', i, piece, avant, espace: s });
      } else out.push({ action: 'ajout', i: -1, piece: { nom: lib, etage: s.etage || '', usage: usageDe(s.nom), S: s.S > 0 ? s.S : '', H: H || 2.7, vitrage: '', orient: 'aucune', occ: '', Qair: '', ...(vit || {}) }, avant: null, espace: s });
    });
    return out;
  }
  // Vitrages d'un espace pour le bilan : surface totale, orientation dominante, détail par orientation (plusieurs façades)
  function vitragesPiece(s) {
    const l = (s && s.vitrages || []).filter(x => x.S > 0); if (!l.length) return null;
    const S = Math.round(l.reduce((a, x) => a + x.S, 0) * 100) / 100, o = l.filter(x => x.orient);
    return { vitrage: S, orient: o.length ? o[0].orient : 'aucune', vitragesDetail: o.length > 1 || (o.length && o.length < l.length) ? detailVitrages(o) : '' };
  }
  const detailVitrages = l => l.map(x => `${x.orient} ${String(x.S).replace('.', ',')}`).join(' ; ');
  // Orientation choisie dans l'aperçu : une seule orientation pour toute la surface vitrée de la pièce
  function changerOrientation(prop, orient) { if (!prop || !prop.piece) return prop; prop.piece = { ...prop.piece, orient, vitragesDetail: '' }; return prop; }
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
  const resume = lu => `${lu.schema || 'IFC'}${lu.format === 'ifcXML' ? ' (IFC XML)' : ''} : ${lu.etages.length} étage(s), ${lu.espaces.length} espace(s), ${lu.segments.length} élément(s) de réseau${(lu.vitrages || []).length ? `, ${lu.vitrages.length} fenêtre(s)` : ''}${lu.unites && lu.unites.nomL !== 'm' ? ` (longueurs du projet en ${lu.unites.nomL}, converties en m)` : ''}`;

  return { ORIENTS, decoder, lireArgs, entites, entitesXml, xmlArbre, lire, versPieces, appliquerPieces, changerOrientation, vitragesPiece, longueurs, usageDe, resume, azimut, orientDe };
})();
if (typeof module !== 'undefined') module.exports = Ifc;
