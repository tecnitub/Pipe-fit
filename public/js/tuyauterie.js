// Prise de cotes tuyauterie : dimensions normalisées (ISO / EN) des tubes et accessoires, placement en 3D d'une ligne
// (tubes, coudes, tés et dérivations, réductions, robinetterie, brides, raccords, fonds), longueurs de coupe calculées
// depuis les cotes axe à axe relevées, nomenclature. Module commun navigateur / serveur / tests.
const Tuyauterie = (() => {
  const DN = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300];
  // Diamètre extérieur des tubes acier (mm) : ISO 4200 / EN 10220, série 1
  const DE = { 15: 21.3, 20: 26.9, 25: 33.7, 32: 42.4, 40: 48.3, 50: 60.3, 65: 76.1, 80: 88.9, 100: 114.3, 125: 139.7, 150: 168.3, 200: 219.1, 250: 273, 300: 323.9 };
  // Coude 90° grand rayon type 3D (R ≈ 1,5 D) : cote axe-face = rayon (ISO 3419 / EN 10253)
  const RAYON_3D = { 15: 28, 20: 29, 25: 38, 32: 48, 40: 57, 50: 76, 65: 95, 80: 114, 100: 152, 125: 190, 150: 229, 200: 305, 250: 381, 300: 457 };
  // Té égal : cote axe-face (ISO 3419 / EN 10253)
  const TE = { 15: 25, 20: 29, 25: 38, 32: 48, 40: 57, 50: 64, 65: 76, 80: 86, 100: 105, 125: 124, 150: 143, 200: 178, 250: 216, 300: 254 };
  // Réduction : longueur selon le grand diamètre (ISO 3419 / EN 10253)
  const REDUC = { 15: 38, 20: 38, 25: 51, 32: 51, 40: 64, 50: 76, 65: 89, 80: 89, 100: 102, 125: 127, 150: 140, 200: 152, 250: 178, 300: 203 };
  // Fond bombé (calotte) : hauteur (ISO 3419 / EN 10253)
  const FOND = { 15: 25, 20: 25, 25: 38, 32: 38, 40: 38, 50: 38, 65: 38, 80: 51, 100: 64, 125: 76, 150: 89, 200: 102, 250: 127, 300: 152 };
  // Bride à collerette EN 1092-1 type 11 (ISO 7005-1) PN16 : diamètre extérieur et hauteur (valeurs indicatives)
  const BRIDE = { 15: [95, 35], 20: [105, 38], 25: [115, 38], 32: [140, 40], 40: [150, 42], 50: [165, 45], 65: [185, 45], 80: [200, 50], 100: [220, 52], 125: [250, 55], 150: [285, 55], 200: [340, 62], 250: [405, 70], 300: [460, 78] };
  const JOINT = 2; // joint plat EN 1514-1 comprimé (mm)
  // Types de brides : à collerette à souder en bout (EN 1092-1 type 11), tournante sur collet à souder (type 02 + collet type 35).
  // « mixte » : assemblage d'une bride à collerette et d'une bride tournante. Même encombrement retenu (valeurs indicatives).
  const BRIDES_TYPES = { collerette: 'À collerette (type 11)', tournante: 'Tournante + collet (type 02 / 35)', mixte: 'Collerette + tournante' };
  // Robinetterie à brides : longueur face à face EN 558 / ISO 5752 (série de base)
  const SERIE_1 = { 15: 130, 20: 150, 25: 160, 32: 180, 40: 200, 50: 230, 65: 290, 80: 310, 100: 350, 125: 400, 150: 480, 200: 600, 250: 730, 300: 850 };
  const SERIE_14 = { 50: 150, 65: 170, 80: 180, 100: 190, 125: 200, 150: 210, 200: 230, 250: 250, 300: 270 };
  const SERIE_20 = { 50: 43, 65: 46, 80: 46, 100: 52, 125: 56, 150: 56, 200: 60, 250: 68, 300: 78 };
  // Manchon de dilatation (compensateur à brides) : longueur courante, très variable selon le fabricant (valeurs indicatives)
  const DILAT = { 15: 150, 20: 150, 25: 160, 32: 160, 40: 170, 50: 180, 65: 200, 80: 210, 100: 230, 125: 250, 150: 270, 200: 300, 250: 330, 300: 360 };
  const VANNES = {
    boisseau: { lib: 'Vanne à boisseau sphérique (BS)', serie: 'EN 558 série 1', table: SERIE_1, commande: 'levier' },
    papillon: { lib: 'Vanne papillon (entre brides)', serie: 'EN 558 série 20', table: SERIE_20, commande: 'levier' },
    clapet: { lib: 'Clapet anti-retour', serie: 'EN 558 série 1', table: SERIE_1, commande: '' },
    equilibrage: { lib: 'Vanne d\'équilibrage', serie: 'EN 558 série 1', table: SERIE_1, commande: 'volant', prises: true },
    v2v: { lib: 'Vanne 2 voies motorisée', serie: 'EN 558 série 1', table: SERIE_1, commande: 'moteur' },
    dilatation: { lib: 'Manchon de dilatation', serie: 'EN 14917 (longueur du fabricant)', table: DILAT, commande: '' },
    opercule: { lib: 'Robinet-vanne à opercule', serie: 'EN 558 série 14', table: SERIE_14, commande: 'volant' },
    soupape: { lib: 'Robinet à soupape', serie: 'EN 558 série 1', table: SERIE_1, commande: 'volant' },
    filtre: { lib: 'Filtre à tamis en Y', serie: 'EN 558 série 1', table: SERIE_1, commande: '' },
  };
  const ANGLES_DEVOIEMENT = [45, 30, 60, 90];
  const RACCORDEMENTS = { bride: 'à brides', souder: 'à souder', taraude: 'taraudé' };
  const RACCORDS = { union: 'Raccord union (3 pièces)', manchon: 'Manchon' };
  const MATIERES = ['Acier P235GH', 'Acier galvanisé', 'Inox 304L', 'Inox 316L', 'Acier S235 (noir)', 'Autre'];
  const PN = ['PN10', 'PN16', 'PN25', 'PN40'];
  const TYPES = { tube: 'Tube', coude: 'Coude', devoie: 'Dévoiement', te: 'Té', v3v: 'Vanne 3 voies', reduc: 'Réduction', vanne: 'Robinetterie', brides: 'Paire de brides', raccord: 'Raccord', fond: 'Fond bombé' };
  // Directions : X = Est, Y = Nord, Z = Haut (repère de l'isométrique, ISO 6412)
  const DIRS = { E: [1, 0, 0], O: [-1, 0, 0], N: [0, 1, 0], S: [0, -1, 0], H: [0, 0, 1], B: [0, 0, -1] };
  const DIRS_LIB = { E: 'Est', O: 'Ouest', N: 'Nord', S: 'Sud', H: 'Haut', B: 'Bas' };

  const n = v => (v === '' || v === null || v === undefined || isNaN(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));
  const r1 = v => Math.round(v * 10) / 10;
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = a => Math.sqrt(dot(a, a));
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const dnOk = d => (DE[d] ? +d : 50);
  // Valeur d'une table pour un DN, sinon celle du DN le plus proche (et l'indication qu'elle est à vérifier)
  function lire(table, dn) {
    if (table[dn] !== undefined) return { v: table[dn], approx: false };
    const k = Object.keys(table).map(Number).sort((a, b) => Math.abs(a - dn) - Math.abs(b - dn))[0];
    return { v: table[k], approx: true };
  }

  // Dimensions d'un élément (mm) : encombrement le long de l'axe, cote axe-face des coudes et tés
  function angle(el) { const a = n(el.angle); return a > 0 && a <= 180 ? a : 90; }
  const rayon = el => n(el.rayon) || RAYON_3D[dnOk(el.dn)];
  const axeFaceCoude = el => r1(rayon(el) * Math.tan((angle(el) * Math.PI) / 360));
  const axeFaceTe = el => n(el.l) || TE[dnOk(el.dn)];
  function vanneLong(el) {
    const v = VANNES[el.type] || VANNES.boisseau, ftf = n(el.l) || lire(v.table, dnOk(el.dn)).v;
    return el.rac === 'bride' || !el.rac ? ftf + 2 * (BRIDE[dnOk(el.dn)][1] + JOINT) : ftf;
  }
  // Vanne 3 voies : cote axe-face = demi face à face (+ contre-bride et joint si à brides) sur les trois voies
  const axeFaceV3V = el => r1((n(el.l) || SERIE_1[dnOk(el.dn)]) / 2 + (el.rac === 'bride' || !el.rac ? BRIDE[dnOk(el.dn)][1] + JOINT : 0));
  // Dévoiement : deux coudes de l'angle choisi ; cote axe-face de chacun
  const angleDev = el => (ANGLES_DEVOIEMENT.includes(+el.angle) ? +el.angle : 45);
  const axeFaceDev = el => axeFaceCoude({ dn: el.dn, angle: angleDev(el) });
  // Cotes axe-face d'un nœud (coude, té, vanne 3 voies, dévoiement) à l'entrée et à la sortie
  const axeFaceNoeud = el => (el.t === 'coude' ? axeFaceCoude(el) : el.t === 'te' ? axeFaceTe(el) : el.t === 'v3v' ? axeFaceV3V(el) : axeFaceDev(el));
  const aBranche = el => el && (el.t === 'te' || el.t === 'v3v');
  function longueur(el) {
    switch (el.t) {
      case 'coude': case 'devoie': return 0;
      case 'v3v': return 2 * axeFaceV3V(el);
      case 'te': return 2 * axeFaceTe(el);
      case 'reduc': return n(el.l) || REDUC[Math.max(dnOk(el.dn), dnOk(el.dn2))];
      case 'vanne': return vanneLong(el);
      case 'brides': return 2 * BRIDE[dnOk(el.dn)][1] + JOINT;
      case 'raccord': return n(el.l) || r1(DE[dnOk(el.dn)] * (el.type === 'manchon' ? 1.2 : 1.6));
      case 'fond': return n(el.l) || FOND[dnOk(el.dn)];
      default: return n(el.l) || 0;
    }
  }
  const estNoeud = el => ['coude', 'te', 'v3v', 'devoie'].includes(el.t);

  // Longueurs de coupe des tubes « à la cote » d'une liste (ligne principale ou dérivation) : la cote est relevée axe à axe
  // entre deux nœuds (coude, té, départ de dérivation) ou une extrémité ; on retire les cotes axe-face des nœuds et
  // l'encombrement des autres éléments du tronçon. debutNoeud : cote axe-face au départ (dérivation d'un té).
  // Résultat par position dans la liste. Les éléments sans DN prennent celui de l'élément précédent (ou dnDepart).
  function coupes(liste0, debutNoeud = 0, dnDepart = 50) {
    let dnc = dnOk(dnDepart);
    const liste = liste0.map(e => { const x = { ...e, dn: dnOk(e.dn || dnc) }; dnc = e.t === 'reduc' ? dnOk(e.dn2 || x.dn) : x.dn; return x; });
    const res = new Map(), erreurs = [];
    let i = 0, prec = debutNoeud;
    while (i <= liste.length) {
      let j = i;
      while (j < liste.length && !estNoeud(liste[j])) j++;
      const troncon = liste.slice(i, j), autos = troncon.filter(e => e.t === 'tube' && e.auto);
      if (autos.length > 1) erreurs.push({ i: liste.indexOf(autos[1]), msg: 'Un seul tube « à la cote » par tronçon entre deux coudes ou tés' });
      if (autos.length) {
        const a = autos[0], suiv = j < liste.length ? axeFaceNoeud(liste[j]) : 0;
        const autres = troncon.filter(e => e !== a).reduce((s, e) => s + longueur(e), 0);
        const c = n(a.cote), l = c === null ? null : r1(c - prec - suiv - autres);
        if (c === null) erreurs.push({ i: liste.indexOf(a), msg: 'Cote axe à axe à saisir' });
        else if (l <= 0) erreurs.push({ i: liste.indexOf(a), msg: `Cote trop courte : ${r1(prec + suiv + autres)} mm d'accessoires sur ${c} mm` });
        res.set(liste.indexOf(a), l > 0 ? l : 0);
      }
      if (j >= liste.length) break;
      prec = axeFaceNoeud(liste[j]);
      i = j + 1;
    }
    return { res, erreurs };
  }

  // Placement en 3D : pièces avec leur géométrie (points en mm), erreurs de saisie, encombrement total
  function placer(rel) {
    const pieces = [], erreurs = [], cotes = [], triangles = [];
    // Cotes à l'axe : d'un nœud au suivant (départ, centre des coudes et des tés, extrémité)
    const coter = (a, b, chemin) => { const v = Math.round(len(add(b, a, -1))); if (v >= 1) cotes.push({ a, b, valeur: v, chemin }); };
    const marcher = (liste, p, d, dn, chemin, debutNoeud, noeud = p) => {
      const { res, erreurs: ec } = coupes(liste, debutNoeud, dn);
      ec.forEach(e => erreurs.push({ chemin: `${chemin}${e.i}`, msg: e.msg }));
      let ferme = false;
      liste.forEach((el, i) => {
        const id = `${chemin}${i}`, dnEl = dnOk(el.dn || dn);
        if (ferme) { erreurs.push({ chemin: id, msg: 'Élément placé après un fond bombé' }); return; }
        const base = { id, el, t: el.t, dn: dnEl, de: DE[dnEl], p0: p, dir: d };
        if (el.t === 'coude') {
          const v = DIRS[el.vers] || DIRS.N, perp = add(v, d, -dot(v, d));
          if (len(perp) < 1e-6) { erreurs.push({ chemin: id, msg: 'Coude : la direction de sortie doit être différente de la direction d\'arrivée' }); return; }
          const u = unit(perp), a = (angle(el) * Math.PI) / 180, R = rayon({ ...el, dn: dnEl }), c = axeFaceCoude({ ...el, dn: dnEl });
          const d1 = unit(add(d.map(x => x * Math.cos(a)), u, Math.sin(a)));
          const centre = add(p, d, c), p1 = add(centre, d1, c);
          pieces.push({ ...base, p1, d1, u, R, a, centre, axeFace: c });
          coter(noeud, centre, chemin); noeud = centre;
          p = p1; d = d1; dn = dnEl;
          return;
        }
        // Dévoiement (simple ou double) : coude, tube oblique, coude ; décalages perpendiculaires à la ligne, triangles de l'isométrique
        if (el.t === 'devoie') {
          const comp = (k, v) => { const w = DIRS[k]; if (!w || !(n(v) > 0)) return null; const q = add(w, d, -dot(w, d)); return len(q) > 1e-6 && Math.abs(dot(w, d)) < 1e-6 ? w.map(x => x * n(v)) : null; };
          const o1 = comp(el.vers, el.dec), o2 = comp(el.vers2, el.dec2) || [0, 0, 0], o = add(o1 || [0, 0, 0], o2), lo = len(o);
          if (!o1 || lo < 1e-6) { erreurs.push({ chemin: id, msg: 'Dévoiement : direction (perpendiculaire à la ligne) et décalage à saisir' }); return; }
          const th = angleDev(el), a = (th * Math.PI) / 180, run = th === 90 ? 0 : lo / Math.tan(a), c = axeFaceDev({ ...el, dn: dnEl }), R = RAYON_3D[dnEl];
          const A = add(p, d, c), B = add(add(A, d, run), o), obl = len(add(B, A, -1)), u = unit(o), dObl = unit(add(B, A, -1));
          const tube = r1(obl - 2 * c);
          if (tube <= 0) erreurs.push({ chemin: id, msg: `Dévoiement : décalage trop court pour des coudes à ${th}° (minimum ${Math.ceil(2 * c * Math.sin(a))} mm)` });
          const e1 = add(A, dObl, c), s2 = add(B, dObl, -c), p1 = add(B, d, c), elC = { t: 'coude', dn: dnEl, angle: th, repere: '' };
          pieces.push({ ...base, t: 'coude', el: { ...elC, note: el.note, repere: el.repere }, p1: e1, d1: dObl, u, R, a, centre: A, axeFace: c, dev: true });
          pieces.push({ ...base, t: 'tube', el: { t: 'tube', auto: true, cote: r1(obl) }, p0: e1, p1: s2, dir: dObl, L: Math.max(0, tube), coupe: Math.max(0, tube), dev: true });
          pieces.push({ ...base, t: 'coude', el: elC, p0: s2, dir: dObl, p1, d1: d, u: unit(add(d, dObl, -dot(d, dObl))), R, a, centre: B, axeFace: c, dev: true });
          // Triangles : décalage dans un plan (un triangle) ou dévoiement double (deux triangles)
          const C1 = add(A, d, run), C2 = add(C1, o1);
          if (run > 0.5) triangles.push({ pts: [A, C1, len(o2) > 0.5 ? C2 : B], chemin: id });
          if (len(o2) > 0.5) triangles.push({ pts: [run > 0.5 ? A : add(A, o1, 0), C2, B], chemin: id });
          coter(noeud, A, chemin);
          if (run > 0.5) cotes.push({ a: A, b: C1, valeur: Math.round(run), chemin, dev: true });
          cotes.push({ a: C1, b: C2, valeur: Math.round(n(el.dec)), chemin, dev: true });
          if (len(o2) > 0.5) cotes.push({ a: C2, b: B, valeur: Math.round(n(el.dec2)), chemin, dev: true });
          noeud = B; p = p1; dn = dnEl;
          return;
        }
        // Vanne 3 voies : corps sur la ligne, troisième voie (B) raccordée comme une dérivation de té
        if (el.t === 'v3v') {
          const c = axeFaceV3V({ ...el, dn: dnEl }), centre = add(p, d, c), p1 = add(p, d, 2 * c);
          const v = DIRS[el.vers] || DIRS.B, perp = add(v, d, -dot(v, d)), brides = el.rac === 'bride' || !el.rac;
          const t = (BRIDES_TYPES[el.typeBride] ? el.typeBride : rel.typeBride) === 'tournante' ? 'tournante' : 'collerette', h = BRIDE[dnEl][1] + JOINT / 2;
          const tg = DIRS[el.tige] || (Math.abs(d[2]) > 0.5 ? DIRS.E : DIRS.H);
          const piece = { ...base, p1, centre, axeFace: c, dnB: dnEl, brides, ftf: 2 * c - (brides ? 2 * (BRIDE[dnEl][1] + JOINT) : 0) };
          pieces.push(piece);
          coter(noeud, centre, chemin); noeud = centre;
          if (len(perp) < 1e-6) erreurs.push({ chemin: id, msg: 'Vanne 3 voies : la voie B doit partir perpendiculairement à la ligne' });
          else {
            const vb = unit(perp), pb = add(centre, vb, c), tq = add(tg, vb, -dot(tg, vb)), tq2 = add(tq, d, -dot(tq, d));
            Object.assign(piece, { pb, vb, tige: len(tq2) > 1e-6 ? unit(tq2) : unit(cross3(d, vb)) });
            if (brides) { piece.joints = [add(p, d, h), add(p1, d, -h), add(pb, vb, -h)]; piece.flanges = [t, t, t]; }
            marcher(el.branche || [], pb, vb, dnEl, `${id}.b.`, c, centre);
          }
          p = p1; dn = dnEl;
          return;
        }
        if (el.t === 'te') {
          const c = axeFaceTe({ ...el, dn: dnEl }), centre = add(p, d, c), p1 = add(p, d, 2 * c);
          const v = DIRS[el.vers] || DIRS.H, perp = add(v, d, -dot(v, d));
          pieces.push({ ...base, p1, centre, axeFace: c, dnB: dnOk(el.dnB || dnEl) });
          coter(noeud, centre, chemin); noeud = centre;
          if (len(perp) < 1e-6) erreurs.push({ chemin: id, msg: 'Té : la dérivation doit partir perpendiculairement à la ligne' });
          else {
            const vb = unit(perp), pb = add(centre, vb, c);
            pieces[pieces.length - 1].pb = pb; pieces[pieces.length - 1].vb = vb;
            marcher(el.branche || [], pb, vb, dnOk(el.dnB || dnEl), `${id}.b.`, c, centre);
          }
          p = p1; dn = dnEl;
          return;
        }
        let L = el.t === 'tube' && el.auto ? (res.get(i) || 0) : longueur({ ...el, dn: dnEl });
        if (el.t === 'tube' && !el.auto && !(L > 0)) erreurs.push({ chemin: id, msg: 'Longueur de coupe à saisir' });
        let p1 = add(p, d, L), dnSortie = dnEl;
        const piece = { ...base, p1, L };
        if (el.t === 'tube') piece.coupe = L;
        if (el.t === 'reduc') {
          dnSortie = dnOk(el.dn2 || dnEl);
          piece.dn2 = dnSortie; piece.de2 = DE[dnSortie];
          // Excentrique : génératrice plate en haut (aspiration de pompe) ou en bas ; l'axe aval se décale
          if (el.exc && Math.abs(d[2]) < 0.5) { const k = (DE[dnEl] - DE[dnSortie]) / 2; p1 = add(p1, [0, 0, el.exc === 'haut' ? -k : k]); piece.p1 = p1; }
        }
        // Assemblages à brides : un point par joint (repéré en bleu sur l'isométrique) et le type de chaque bride
        const typeB = t => (BRIDES_TYPES[t] ? t : BRIDES_TYPES[rel.typeBride] ? rel.typeBride : 'collerette');
        if (el.t === 'brides') {
          const t = typeB(el.typeBride), mid = add(p, d, L / 2);
          piece.joints = [mid];
          piece.flanges = t === 'mixte' ? ['collerette', 'tournante'] : [t, t];
        }
        if (el.t === 'vanne') {
          const v = DIRS[el.tige] || (Math.abs(d[2]) > 0.5 ? DIRS.E : DIRS.H), perp = add(v, d, -dot(v, d));
          piece.tige = len(perp) < 1e-6 ? (Math.abs(d[0]) > 0.5 ? [0, 1, 0] : [1, 0, 0]) : unit(perp);
          piece.brides = el.rac === 'bride' || !el.rac;
          piece.ftf = piece.brides ? L - 2 * (BRIDE[dnEl][1] + JOINT) : L;
          if (piece.brides) {
            const t = typeB(el.typeBride) === 'tournante' ? 'tournante' : 'collerette', h = BRIDE[dnEl][1] + JOINT / 2;
            piece.joints = [add(p, d, h), add(p1, d, -h)];
            piece.flanges = [t, t];
          }
        }
        if (el.t === 'fond') ferme = true;
        pieces.push(piece);
        p = p1; dn = dnSortie;
      });
      if (liste.length) coter(noeud, p, chemin);
      return { p, d, dn };
    };
    const fin = marcher(rel.elements || [], [0, 0, 0], DIRS[rel.dirDepart] || DIRS.E, dnOk(rel.dnDepart || 50), '', 0);
    return { pieces, erreurs, fin, cotes, triangles, depart: { p: [0, 0, 0], note: String(rel.noteDepart || '').trim() } };
  }
  // Élément désigné par son chemin (« 3 », « 2.b.0 ») et la liste qui le contient
  function trouver(rel, chemin) {
    const parts = String(chemin).split('.b.').map(Number);
    let liste = rel.elements || [];
    for (let k = 0; k < parts.length - 1; k++) { const te = liste[parts[k]]; if (!aBranche(te)) return null; liste = te.branche = te.branche || []; }
    const i = parts[parts.length - 1];
    return liste[i] ? { el: liste[i], liste, i } : null;
  }
  // Liste éditée (ligne principale « » ou dérivation du té « 2 », « 2.b.4 »…)
  function listeDe(rel, chemin) {
    if (!chemin) return rel.elements = rel.elements || [];
    const t = trouver(rel, chemin);
    return t && aBranche(t.el) ? (t.el.branche = t.el.branche || []) : null;
  }

  // Désignation et norme d'un élément placé
  function designation(pc, rel) {
    const el = pc.el, m = rel.matiere || '', pn = rel.pn || 'PN16';
    switch (pc.t) {
      case 'tube': return [`Tube ${m} DN${pc.dn} (Ø${pc.de})`, 'ISO 4200 / EN 10220'];
      case 'coude': return [`Coude ${angle(el)}° 3D ${m} DN${pc.dn}`, 'ISO 3419 / EN 10253'];
      case 'te': return [pc.dnB !== pc.dn ? `Té réduit ${m} DN${pc.dn} × DN${pc.dnB}` : `Té égal ${m} DN${pc.dn}`, 'ISO 3419 / EN 10253'];
      case 'reduc': return [`Réduction ${el.exc ? 'excentrique' : 'concentrique'} ${m} DN${pc.dn} × DN${pc.dn2}`, 'ISO 3419 / EN 10253'];
      case 'vanne': { const v = VANNES[el.type] || VANNES.boisseau; return [`${v.lib} ${RACCORDEMENTS[el.rac || 'bride']} DN${pc.dn} ${pn}`, el.rac === 'taraude' ? 'ISO 7-1 (filetage)' : `${v.serie} / ISO 5752`]; }
      case 'v3v': return [`Vanne 3 voies motorisée ${RACCORDEMENTS[el.rac || 'bride']} DN${pc.dn} ${pn}`, 'EN 558 série 1 / ISO 5752'];
      case 'brides': return pc.flanges && pc.flanges[0] === 'tournante' && pc.flanges[1] === 'tournante' ? [`Paire de brides tournantes sur collets DN${pc.dn} ${pn}`, 'EN 1092-1 type 02 / 35']
        : pc.flanges && pc.flanges[0] !== pc.flanges[1] ? [`Assemblage bride à collerette + bride tournante DN${pc.dn} ${pn}`, 'EN 1092-1 type 11 / 02'] : [`Paire de brides à collerette DN${pc.dn} ${pn}`, 'EN 1092-1 type 11 / ISO 7005-1'];
      case 'raccord': return [`${RACCORDS[el.type] || RACCORDS.union} DN${pc.dn}`, 'ISO 49 / EN 10242'];
      case 'fond': return [`Fond bombé ${m} DN${pc.dn}`, 'ISO 3419 / EN 10253'];
      default: return [TYPES[pc.t] || pc.t, ''];
    }
  }
  // Nomenclature : accessoires regroupés, tubes en longueur totale par DN, brides de raccordement et joints compris
  function nomenclature(rel, placement = placer(rel)) {
    const lignes = new Map();
    const ajoute = (des, norme, q, unite = 'u') => { const k = `${des}|${norme}`; const l = lignes.get(k) || { designation: des, norme, quantite: 0, unite }; l.quantite = r1(l.quantite + q); lignes.set(k, l); };
    const pn = rel.pn || 'PN16';
    placement.pieces.forEach(pc => {
      const [des, norme] = designation(pc, rel);
      if (pc.t === 'tube') { ajoute(des, norme, (pc.coupe || 0) / 1000, 'm'); return; }
      // Brides comptées une à une (collerettes, tournantes et leurs collets), joints et boulonnerie par assemblage
      if (pc.t !== 'brides') ajoute(des, norme, 1);
      (pc.flanges || []).forEach(t => {
        if (t === 'tournante') { ajoute(`Bride tournante DN${pc.dn} ${pn}`, 'EN 1092-1 type 02', 1); ajoute(`Collet à souder DN${pc.dn} ${pn}`, 'EN 1092-1 type 35', 1); }
        else ajoute(`Bride à collerette DN${pc.dn} ${pn}`, 'EN 1092-1 type 11 / ISO 7005-1', 1);
      });
      (pc.joints || []).forEach(() => { ajoute(`Joint plat DN${pc.dn} ${pn}`, 'EN 1514-1', 1); ajoute(`Jeu de boulonnerie DN${pc.dn} ${pn}`, 'ISO 4014 / ISO 4032', 1); });
    });
    return [...lignes.values()].sort((a, b) => (a.unite === 'm' ? 0 : 1) - (b.unite === 'm' ? 0 : 1) || a.designation.localeCompare(b.designation, 'fr'));
  }
  // Lignes pour le chiffrage depuis plan (même format qu'une nomenclature importée de Revit : réseau, famille, type, taille,
  // longueur en m, nombre), reconnues par les familles CAO de la bibliothèque (Tuyau, Coude, Té, Bride, Réduction, Vanne…)
  function lignesChiffrage(rel, placement = placer(rel)) {
    const out = new Map(), sys = String(rel.ligne || '').trim(), pn = rel.pn || 'PN16', m = rel.matiere || '';
    const ajoute = (famille, type, dn, qte, longueur = 0, taille = `DN${dn}`) => {
      const k = `${famille}|${type}|${taille}`, l = out.get(k) || { systeme: sys, famille, type, taille, dn, longueur: 0, qte: longueur ? 1 : 0 };
      if (longueur) l.longueur = Math.round((l.longueur + longueur) * 1000) / 1000; else l.qte += qte;
      out.set(k, l);
    };
    // Brides une à une (une tournante va avec son collet), un joint et une boulonnerie par assemblage
    const brides = pc => {
      (pc.flanges || []).forEach(t => { if (t === 'tournante') { ajoute('Bride tournante', `${pn} EN 1092-1 type 02`, pc.dn, 1); ajoute('Collet à souder', `${m} EN 1092-1 type 35`.trim(), pc.dn, 1); } else ajoute('Bride à collerette', `${pn} EN 1092-1 type 11`, pc.dn, 1); });
      (pc.joints || []).forEach(() => { ajoute('Joint plat', `${pn} EN 1514-1`, pc.dn, 1); ajoute('Boulonnerie', `Jeu ${pn}`, pc.dn, 1); });
    };
    placement.pieces.forEach(pc => {
      const el = pc.el;
      switch (pc.t) {
        case 'tube': if (pc.coupe > 0) ajoute('Tuyau', m, pc.dn, 1, pc.coupe / 1000); break;
        case 'coude': ajoute('Coude', `${angle(el)}° 3D ${m}`.trim(), pc.dn, 1); break;
        case 'te': ajoute('Té', pc.dnB !== pc.dn ? `réduit DN${pc.dn} × DN${pc.dnB} ${m}`.trim() : `égal ${m}`.trim(), pc.dn, 1); break;
        case 'reduc': ajoute('Réduction', `${el.exc ? 'excentrique' : 'concentrique'} ${m}`.trim(), Math.max(pc.dn, pc.dn2), 1, 0, `DN${pc.dn}-DN${pc.dn2}`); break;
        case 'vanne': {
          const v = VANNES[el.type] || VANNES.boisseau;
          ajoute(v.lib.replace(/ \([^)]*\)$/, ''), `${RACCORDEMENTS[el.rac || 'bride']} ${pn}`, pc.dn, 1);
          brides(pc);
          break;
        }
        case 'brides': brides(pc); break;
        case 'v3v': ajoute('Vanne 3 voies motorisée', `${RACCORDEMENTS[el.rac || 'bride']} ${pn}`, pc.dn, 1); brides(pc); break;
        case 'raccord': ajoute(el.type === 'manchon' ? 'Manchon' : 'Raccord union', m, pc.dn, 1); break;
        case 'fond': ajoute('Fond bombé', m, pc.dn, 1); break;
        default: break;
      }
    });
    return [...out.values()];
  }
  // Liste du matériel en CSV (séparateur « ; », ouvrable dans Excel) : mêmes colonnes que l'import du chiffrage
  function csvChiffrage(lignes) {
    const c = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return ['Réseau;Famille;Type;Taille;Longueur (m);Nombre', ...lignes.map(l => [l.systeme, l.famille, l.type, l.taille, l.longueur ? String(l.longueur).replace('.', ',') : '', l.qte].map(c).join(';'))].join('\r\n');
  }
  // Fiche de débit : longueurs de coupe des tubes, dans l'ordre de la ligne
  function debit(placement) {
    return placement.pieces.filter(pc => pc.t === 'tube').map(pc => ({ id: pc.id, dn: pc.dn, de: pc.de, coupe: pc.coupe || 0, auto: !!pc.el.auto, cote: pc.el.auto ? n(pc.el.cote) : null, repere: pc.el.repere || '' }));
  }
  // Ce qui manque pour valider le relevé
  function manques(r) {
    return [!r.affaireId && 'chantier', !String(r.ligne || '').trim() && 'repère de la ligne', !r.userId && 'technicien', !r.date && 'date',
      !((r.elements || []).length || (r.cotes || []).some(c => n(c.valeur) !== null)) && 'au moins une cote ou un élément de tuyauterie'].filter(Boolean);
  }
  const STATUTS = ['Brouillon', 'Relevé', 'Terminé'];
  return { DN, DE, RAYON_3D, TE, REDUC, FOND, BRIDE, BRIDES_TYPES, VANNES, ANGLES_DEVOIEMENT, aBranche, axeFaceV3V, axeFaceDev, RACCORDEMENTS, RACCORDS, MATIERES, PN, TYPES, DIRS, DIRS_LIB, STATUTS,
    lire, angle, axeFaceCoude, axeFaceTe, longueur, coupes, placer, trouver, listeDe, designation, nomenclature, lignesChiffrage, csvChiffrage, debit, manques };
})();
if (typeof module !== 'undefined') module.exports = Tuyauterie;
