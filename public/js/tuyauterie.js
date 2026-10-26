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
    // Filtre à tamis : taraudé femelle-femelle du DN15 au DN50, à brides du DN50 au DN300
    filtre: { lib: 'Filtre à tamis en Y', serie: 'EN 558 série 1', table: SERIE_1, commande: '', racs: { taraude: [15, 50], bride: [50, 300] },
      taraude: { 15: 70, 20: 80, 25: 95, 32: 115, 40: 125, 50: 150 }, libTaraude: 'taraudé FF' },
    // Disconnecteur à zone de pression réduite contrôlable (BA), avec entonnoir de vidange
    disconnecteur: { lib: 'Disconnecteur BA', serie: 'EN 12729', table: { 50: 400, 65: 450, 80: 500, 100: 560, 125: 650, 150: 750, 200: 900, 250: 1050 }, commande: '', racs: { taraude: [15, 50], bride: [50, 250] },
      taraude: { 15: 150, 20: 170, 25: 200, 32: 230, 40: 270, 50: 300 }, libTaraude: 'taraudé' },
  };
  const ANGLES_DEVOIEMENT = [45, 30, 60, 90];
  const RACCORDEMENTS = { bride: 'à brides', souder: 'à souder', taraude: 'taraudé', sertir: 'à sertir' };
  // Types de tube : diamètres, épaisseurs, raccords (à souder ou à sertir) et familles du chiffrage. Valeurs indicatives
  // (épaisseurs courantes, cotes d'emboîtement des raccords à sertir variables selon le fabricant : Viega, Geberit…).
  const tableDN = f => Object.fromEntries(DN.map(d => [d, f(d)]));
  const SERTIR_DN = [15, 20, 25, 32, 40, 50, 65, 80, 100];
  const SYSTEMES = {
    acier: { lib: 'Acier à souder (ISO 4200)', dns: DN, de: DE, ep: { 15: 2.0, 20: 2.3, 25: 2.6, 32: 2.6, 40: 2.6, 50: 2.9, 65: 2.9, 80: 3.2, 100: 3.6, 125: 4.0, 150: 4.5, 200: 6.3, 250: 6.3, 300: 7.1 },
      matiere: 'Acier P235GH', normeTube: 'ISO 4200 / EN 10220', normeRaccords: 'ISO 3419 / EN 10253-1', familleTube: 'Tube acier', suffixe: 'acier' },
    t10: { lib: 'Acier noir T10 (NF A 49-145)', dns: DN, de: DE, ep: { 15: 2.3, 20: 2.3, 25: 2.9, 32: 2.9, 40: 2.9, 50: 2.9, 65: 2.9, 80: 3.2, 100: 3.6, 125: 4.0, 150: 4.5, 200: 5.9, 250: 6.3, 300: 7.1 },
      matiere: 'Acier noir T10', normeTube: 'NF A 49-145 (T10)', normeRaccords: 'ISO 3419 / EN 10253-1', familleTube: 'Tube acier T10', suffixe: 'acier', abrege: 'T10' },
    inoxSoude: { lib: 'Inox soudé (EN 10217-7)', dns: DN, de: DE, ep: tableDN(d => (d <= 100 ? 2.0 : d <= 200 ? 2.6 : 3.0)),
      matiere: 'Inox 304L', normeTube: 'EN 10217-7 / ISO 1127', normeRaccords: 'ISO 5251 / EN 10253-4', familleTube: 'Tube inox soudé', suffixe: 'inox' },
    inoxSertir: { lib: 'Inox à sertir (EN 10312)', dns: SERTIR_DN, sertir: true, de: { 15: 18, 20: 22, 25: 28, 32: 35, 40: 42, 50: 54, 65: 76.1, 80: 88.9, 100: 108 },
      ep: { 15: 1.0, 20: 1.2, 25: 1.2, 32: 1.5, 40: 1.5, 50: 1.5, 65: 2.0, 80: 2.0, 100: 2.0 }, matiere: 'Inox 316L', normeTube: 'EN 10312', normeRaccords: 'DVGW W 534 (raccords à sertir)',
      familleTube: 'Tube inox à sertir', suffixe: 'à sertir',
      // Cote axe – butée du tube (z) des raccords à sertir : coude 90°, té ; encombrement des réductions, manchons, bouchons, vannes
      rayon: { 15: 20, 20: 23, 25: 28, 32: 36, 40: 45, 50: 58, 65: 85, 80: 100, 100: 120 }, te: { 15: 16, 20: 18, 25: 21, 32: 25, 40: 30, 50: 36, 65: 52, 80: 60, 100: 72 },
      reduc: { 15: 20, 20: 22, 25: 26, 32: 30, 40: 34, 50: 40, 65: 55, 80: 60, 100: 70 }, manchon: { 15: 8, 20: 8, 25: 8, 32: 10, 40: 10, 50: 12, 65: 16, 80: 16, 100: 18 },
      fond: { 15: 12, 20: 14, 25: 16, 32: 18, 40: 20, 50: 24, 65: 30, 80: 34, 100: 38 }, vanne: { 15: 60, 20: 70, 25: 80, 32: 95, 40: 110, 50: 130, 65: 180, 80: 200, 100: 230 } },
  };
  // Type de tube d'un relevé (ancien relevé sans type : d'après la matière)
  const systeme = rel => SYSTEMES[rel && rel.systeme] || (/^inox/i.test((rel && rel.matiere) || '') ? SYSTEMES.inoxSoude : SYSTEMES.acier);
  const cleSysteme = rel => Object.keys(SYSTEMES).find(k => SYSTEMES[k] === systeme(rel));
  const RACCORDS = { union: 'Raccord union (3 pièces)', manchon: 'Manchon' };
  const MATIERES = ['Acier P235GH', 'Acier noir T10', 'Acier galvanisé', 'Inox 304L', 'Inox 316L', 'Acier S235 (noir)', 'Autre'];
  const PN = ['PN10', 'PN16', 'PN25', 'PN40'];
  // Instruments sur piquage (doigt de gant ou prise de pression) : sans encombrement sur l'axe (soudé) ou sur té à sertir
  const INSTRUMENTS = { thermometre: { lib: 'Thermomètre à cadran avec doigt de gant', norme: 'EN 13190', famille: 'Thermomètre', doigt: true },
    sonde_t: { lib: 'Sonde de température à plongeur avec doigt de gant', norme: 'EN 60751 (Pt100)', famille: 'Sonde de température', doigt: true },
    sonde_p: { lib: 'Sonde (capteur) de pression avec robinet', norme: 'EN 837-1 / ISO 228-1 (G½)', famille: 'Sonde de pression', doigt: false } };
  const TYPES = { tube: 'Tube', instrument: 'Instrument', coude: 'Coude', devoie: 'Dévoiement', te: 'Té', v3v: 'Vanne 3 voies', reduc: 'Réduction', vanne: 'Robinetterie', brides: 'Paire de brides', raccord: 'Raccord', fond: 'Fond bombé' };
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
    const v = VANNES[el.type] || VANNES.boisseau, ftf = n(el.l) || lire(el.rac === 'taraude' && v.taraude ? v.taraude : v.table, dnOk(el.dn)).v;
    return el.rac === 'bride' || !el.rac ? ftf + 2 * (BRIDE[dnOk(el.dn)][1] + JOINT) : ftf;
  }
  // Vanne 3 voies : cote axe-face = demi face à face (+ contre-bride et joint si à brides) sur les trois voies
  const axeFaceV3V = el => r1((n(el.l) || SERIE_1[dnOk(el.dn)]) / 2 + (el.rac === 'bride' || !el.rac ? BRIDE[dnOk(el.dn)][1] + JOINT : 0));
  // Dévoiement : deux coudes de l'angle choisi ; cote axe-face de chacun
  const angleDev = el => (ANGLES_DEVOIEMENT.includes(+el.angle) ? +el.angle : 45);
  const axeFaceDev = el => axeFaceCoude({ dn: el.dn, angle: angleDev(el), rayon: el.rayon });
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
      ec.forEach(e => erreurs.push({ chemin: `${chemin}${liste[e.i] && liste[e.i]._i !== undefined ? liste[e.i]._i : e.i}`, msg: e.msg }));
      let ferme = false;
      liste.forEach((el, i) => {
        const id = `${chemin}${el._i !== undefined ? el._i : i}`, dnEl = dnOk(el.dn || dn);
        if (ferme) { erreurs.push({ chemin: id, msg: 'Élément placé après un fond bombé' }); return; }
        if (el._erreur) erreurs.push({ chemin: id, msg: el._erreur });
        const base = { id, el, t: el.t, dn: dnEl, de: sys.de[dnEl] || DE[dnEl], p0: p, dir: d };
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
          const th = angleDev(el), a = (th * Math.PI) / 180, run = th === 90 ? 0 : lo / Math.tan(a), c = axeFaceDev({ ...el, dn: dnEl }), R = rayon({ ...el, dn: dnEl });
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
          pieces.push({ ...base, p1, centre, axeFace: c, dnB: dnOk(el.dnB || dnEl), deB: sys.de[dnOk(el.dnB || dnEl)] || DE[dnOk(el.dnB || dnEl)] });
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
          piece.dn2 = dnSortie; piece.de2 = sys.de[dnSortie] || DE[dnSortie];
          // Excentrique : génératrice plate en haut (aspiration de pompe) ou en bas ; l'axe aval se décale
          if (el.exc && Math.abs(d[2]) < 0.5) { const k = (piece.de - piece.de2) / 2; p1 = add(p1, [0, 0, el.exc === 'haut' ? -k : k]); piece.p1 = p1; }
        }
        // Assemblages à brides : un point par joint (repéré en bleu sur l'isométrique) et le type de chaque bride
        const typeB = t => (BRIDES_TYPES[t] ? t : BRIDES_TYPES[rel.typeBride] ? rel.typeBride : 'collerette');
        if (el.t === 'brides') {
          const t = typeB(el.typeBride), mid = add(p, d, L / 2);
          piece.joints = [mid];
          piece.flanges = t === 'mixte' ? ['collerette', 'tournante'] : [t, t];
        }
        if (el.t === 'instrument') {
          const v = DIRS[el.vers] || (Math.abs(d[2]) > 0.5 ? DIRS.E : DIRS.H), perp = add(v, d, -dot(v, d));
          piece.tige = len(perp) < 1e-6 ? (Math.abs(d[0]) > 0.5 ? [0, 1, 0] : [1, 0, 0]) : unit(perp);
          piece.centre = add(p, d, L / 2);
          piece.piquage = add(piece.centre, piece.tige, piece.de / 2);
        }
        if (el.t === 'vanne') {
          const vv = VANNES[el.type] || VANNES.boisseau, plage = vv.racs && vv.racs[el.rac || 'bride'];
          if (vv.racs && !plage) erreurs.push({ chemin: id, msg: `${vv.lib} : ${Object.entries(vv.racs).map(([k, [a, b]]) => `${k === 'taraude' ? vv.libTaraude || 'taraudé' : RACCORDEMENTS[k]} DN${a} à DN${b}`).join(', ')}` });
          else if (plage && (dnEl < plage[0] || dnEl > plage[1])) erreurs.push({ chemin: id, msg: `${vv.lib} ${el.rac === 'taraude' ? vv.libTaraude || 'taraudé' : RACCORDEMENTS[el.rac || 'bride']} : du DN${plage[0]} au DN${plage[1]}` });
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
    // Copie des éléments avec le DN de chacun et les cotes des raccords du type de tube (sauf longueur saisie)
    const sys = systeme(rel);
    // Changement de diamètre sans réduction saisie : réduction concentrique ISO ajoutée devant l'élément (repère « n-r »).
    // Tube orienté dans une autre direction que celle de la ligne : coude 3D (90° ou 45°) ajouté devant lui (repère « n-c »).
    const tourner = (d, v, deg) => { const q = add(v, d, -dot(v, d)); if (len(q) < 1e-6) return null; const a = (deg * Math.PI) / 180; return unit(add(d.map(z => z * Math.cos(a)), unit(q), Math.sin(a))); };
    const prep = (liste, dn0, d0) => {
      let dnc = dnOk(dn0), d = d0;
      return (liste || []).flatMap((e, i) => {
        const x = { ...e, dn: dnOk(e.dn || dnc), _i: i }, dn = x.dn, af = n(e.af);
        const auto = [];
        if (x.t === 'tube' && DIRS[x.vers]) {
          const v = DIRS[x.vers], c = Math.max(-1, Math.min(1, dot(d, v))), deg = (Math.acos(c) * 180) / Math.PI;
          if (deg > 0.5) {
            const ang = [90, 45].find(a => Math.abs(a - deg) < 0.5);
            if (ang) { auto.push({ t: 'coude', dn: dnc, angle: ang, vers: x.vers, auto: true, _i: `${i}-c`, rayon: sys.rayon ? sys.rayon[dnc] : '' }); d = v; }
            else x._erreur = deg > 179.5 ? 'Demi-tour : ajoutez deux coudes (ou un dévoiement)' : `Changement de direction de ${Math.round(deg)}° : coudes à 90° ou 45° seulement`;
          }
        }
        if (dn !== dnc) auto.push({ t: 'reduc', dn: dnc, dn2: dn, exc: '', auto: true, _i: `${i}-r`, l: sys.reduc ? sys.reduc[Math.max(dn, dnc)] : '' });
        if (x.t === 'coude') d = tourner(d, DIRS[x.vers] || DIRS.N, angle(x)) || d;
        if (x.t === 'coude' || x.t === 'devoie') {
          const th = x.t === 'coude' ? angle(x) : angleDev(x);
          if (af > 0 && x.t === 'coude') x.rayon = af / Math.tan((th * Math.PI) / 360);
          else if (!n(x.rayon) && sys.rayon) x.rayon = sys.rayon[dn];
        }
        if (x.t === 'te' && !n(x.l)) x.l = af > 0 ? af : sys.te ? sys.te[dn] : '';
        if (x.t === 'reduc' && !n(x.l) && sys.reduc) x.l = sys.reduc[Math.max(dn, dnOk(x.dn2 || dn))];
        if (x.t === 'fond' && !n(x.l) && sys.fond) x.l = sys.fond[dn];
        if (x.t === 'raccord' && !n(x.l) && sys.manchon) x.l = sys.manchon[dn];
        if (x.t === 'instrument' && sys.sertir) x.l = 2 * sys.te[dn];
        if (x.t === 'instrument' && !sys.sertir) x.l = 0;
        if ((x.t === 'vanne' || x.t === 'v3v') && x.rac === 'sertir' && !n(x.l) && sys.vanne) x.l = x.type === 'dilatation' ? DILAT[dn] : sys.vanne[dn];
        if (aBranche(x)) { const v = DIRS[x.vers] || (x.t === 'te' ? DIRS.H : DIRS.B), q = add(v, d, -dot(v, d)); x.branche = prep(x.branche, x.t === 'te' ? (e.dnB || dn) : dn, len(q) > 1e-6 ? unit(q) : v); }
        dnc = x.t === 'reduc' ? dnOk(x.dn2 || dn) : dn;
        return [...auto, x];
      });
    };
    const fin = marcher(prep(rel.elements, rel.dnDepart || 50, DIRS[rel.dirDepart] || DIRS.E), [0, 0, 0], DIRS[rel.dirDepart] || DIRS.E, dnOk(rel.dnDepart || 50), '', 0);
    const asm = sys.sertir ? sertissages(pieces) : [];
    return { pieces, erreurs, fin, cotes, triangles, soudures: sys.sertir ? [] : soudures(pieces, rel), sertissages: asm, sertir: !!sys.sertir, depart: { p: [0, 0, 0], note: String(rel.noteDepart || '').trim() } };
  }
  // Soudures bout à bout : extrémités des raccords à souder (coudes, tés, réductions, fonds), collerettes et collets des
  // brides, vannes à souder, tube contre tube, raccordement du départ sur l'existant. Les assemblages filetés n'en ont pas.
  function soudures(pieces, rel) {
    const out = new Map(), ajoute = (p, dn) => { const k = p.map(x => Math.round(x)).join(','); if (!out.has(k)) out.set(k, { p, dn }); };
    let precTube = null;
    pieces.forEach(pc => {
      const filete = pc.el.rac === 'taraude';
      if (pc.t === 'tube') { if (precTube && Math.hypot(...precTube.p1.map((x, i) => x - pc.p0[i])) < 1) ajoute(pc.p0, pc.dn); precTube = pc; return; }
      precTube = null;
      if (['coude', 'te', 'reduc', 'brides'].includes(pc.t) || (['vanne', 'v3v'].includes(pc.t) && !filete)) {
        ajoute(pc.p0, pc.dn); ajoute(pc.p1, pc.t === 'reduc' ? pc.dn2 : pc.dn);
        if (pc.pb) ajoute(pc.pb, pc.dnB || pc.dn);
      }
      if (pc.t === 'fond') ajoute(pc.p0, pc.dn);
      // Piquage de l'instrument : manchon ½" soudé sur le tube
      if (pc.t === 'instrument') ajoute(pc.piquage, 15);
    });
    // Départ piqué ou soudé sur l'existant
    const premier = pieces[0];
    if (premier && premier.id === '0' && ['tube', 'coude', 'te', 'reduc'].includes(premier.t) && !rel.departFilete) ajoute(premier.p0, premier.dn);
    return [...out.values()];
  }
  // Sertissages (tube inox à sertir) : une sertie à chaque emboîture de raccord, de vanne à sertir ou de raccord à bride
  function sertissages(pieces) {
    const out = [], ajoute = (p, dn) => out.push({ p, dn });
    pieces.forEach(pc => {
      if (['coude', 'te', 'reduc', 'raccord', 'brides', 'v3v', 'instrument'].includes(pc.t) || (pc.t === 'vanne' && pc.el.rac !== 'taraude')) {
        ajoute(pc.p0, pc.dn); ajoute(pc.p1, pc.t === 'reduc' ? pc.dn2 : pc.dn);
        if (pc.pb) ajoute(pc.pb, pc.dnB || pc.dn);
      }
      if (pc.t === 'fond') ajoute(pc.p0, pc.dn);
    });
    return out;
  }
  // Pouces-diamètre des soudures (cadence de soudage)
  const POUCES = { 15: 0.5, 20: 0.75, 25: 1, 32: 1.25, 40: 1.5, 50: 2, 65: 2.5, 80: 3, 100: 4, 125: 5, 150: 6, 200: 8, 250: 10, 300: 12 };
  function bilanSoudures(placement, quoi = 'soudures') {
    const parDN = {};
    (placement[quoi] || []).forEach(s => { parDN[s.dn] = (parDN[s.dn] || 0) + 1; });
    return { nombre: (placement[quoi] || []).length, parDN, pouces: Object.entries(parDN).reduce((t, [dn, k]) => t + k * (POUCES[dn] || dn / 25), 0) };
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
  // Taille affichée : « Ø22 » pour le tube à sertir, « DN50 » sinon
  const taille = (rel, dn) => { const s = systeme(rel); return s.sertir ? `Ø${s.de[dn] || dn}` : `DN${dn}`; };
  function designation(pc, rel) {
    const el = pc.el, m = rel.matiere || '', pn = rel.pn || 'PN16', s = systeme(rel), T = dn => taille(rel, dn), nr = s.normeRaccords;
    const k = s.sertir ? ' à sertir' : '';
    switch (pc.t) {
      case 'tube': { const ep = String(s.ep[pc.dn] || '').replace('.', ','), dim = `Ø${String(pc.de).replace('.', ',')}${ep ? ` × ${ep}` : ''}`;
        return [s.sertir ? `Tube ${m} à sertir ${dim}` : `Tube ${m}${s.abrege && !m.includes(s.abrege) ? ` ${s.abrege}` : ''} DN${pc.dn} (${dim})`, s.normeTube]; }
      case 'coude': return [s.sertir ? `Coude ${angle(el)}° à sertir ${m} ${T(pc.dn)}` : `Coude ${angle(el)}° 3D ${m} ${T(pc.dn)}`, nr];
      case 'te': return [pc.dnB !== pc.dn ? `Té réduit${k} ${m} ${T(pc.dn)} × ${T(pc.dnB)}` : `Té égal${k} ${m} ${T(pc.dn)}`, nr];
      case 'reduc': return [`Réduction ${s.sertir ? 'à sertir' : el.exc ? 'excentrique' : 'concentrique'} ${m} ${T(Math.max(pc.dn, pc.dn2))} × ${T(Math.min(pc.dn, pc.dn2))}`, nr];
      case 'vanne': { const v = VANNES[el.type] || VANNES.boisseau; return [`${v.lib} ${el.rac === 'taraude' && v.libTaraude ? v.libTaraude : RACCORDEMENTS[el.rac || 'bride']} ${T(pc.dn)} ${pn}`, el.rac === 'taraude' ? 'ISO 7-1 (filetage)' : el.rac === 'sertir' ? nr : `${v.serie} / ISO 5752`]; }
      case 'v3v': return [`Vanne 3 voies motorisée ${RACCORDEMENTS[el.rac || 'bride']} ${T(pc.dn)} ${pn}`, el.rac === 'sertir' ? nr : 'EN 558 série 1 / ISO 5752'];
      case 'brides': return pc.flanges && pc.flanges[0] === 'tournante' && pc.flanges[1] === 'tournante' ? [`Paire de brides tournantes sur collets DN${pc.dn} ${pn}`, 'EN 1092-1 type 02 / 35']
        : pc.flanges && pc.flanges[0] !== pc.flanges[1] ? [`Assemblage bride à collerette + bride tournante DN${pc.dn} ${pn}`, 'EN 1092-1 type 11 / 02'] : [`Paire de brides à collerette DN${pc.dn} ${pn}`, 'EN 1092-1 type 11 / ISO 7005-1'];
      case 'raccord': return s.sertir ? [`${el.type === 'union' ? 'Raccord union' : 'Manchon'} à sertir ${T(pc.dn)}`, nr] : [`${RACCORDS[el.type] || RACCORDS.union} DN${pc.dn}`, 'ISO 49 / EN 10242'];
      case 'fond': return s.sertir ? [`Bouchon à sertir ${T(pc.dn)}`, nr] : [`Fond bombé ${m} DN${pc.dn}`, nr];
      case 'instrument': { const it = INSTRUMENTS[el.type] || INSTRUMENTS.thermometre; return [`${it.lib}${el.plage ? ` ${el.plage}` : ''}`, it.norme]; }
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
        if (systeme(rel).sertir) ajoute(`Bride à sertir (raccord à bride) ${taille(rel, pc.dn)} ${pn}`, `${systeme(rel).normeRaccords} / EN 1092-1`, 1);
        else if (t === 'tournante') { ajoute(`Bride tournante DN${pc.dn} ${pn}`, 'EN 1092-1 type 02', 1); ajoute(`Collet à souder DN${pc.dn} ${pn}`, 'EN 1092-1 type 35', 1); }
        else ajoute(`Bride à collerette DN${pc.dn} ${pn}`, 'EN 1092-1 type 11 / ISO 7005-1', 1);
      });
      if (pc.t === 'instrument') {
        if (systeme(rel).sertir) ajoute(`Té à sertir à piquage taraudé ½" ${taille(rel, pc.dn)}`, systeme(rel).normeRaccords, 1);
        else ajoute('Manchon à souder ½" (piquage)', 'EN 10241', 1);
      }
      (pc.joints || []).forEach(() => { ajoute(`Joint plat DN${pc.dn} ${pn}`, 'EN 1514-1', 1); ajoute(`Jeu de boulonnerie DN${pc.dn} ${pn}`, 'ISO 4014 / ISO 4032', 1); });
    });
    return [...lignes.values()].sort((a, b) => (a.unite === 'm' ? 0 : 1) - (b.unite === 'm' ? 0 : 1) || a.designation.localeCompare(b.designation, 'fr'));
  }
  // Lignes pour le chiffrage depuis plan (même format qu'une nomenclature importée de Revit : réseau, famille, type, taille,
  // longueur en m, nombre), reconnues par les familles CAO de la bibliothèque (Tuyau, Coude, Té, Bride, Réduction, Vanne…)
  function lignesChiffrage(rel, placement = placer(rel)) {
    const out = new Map(), sys = String(rel.ligne || '').trim(), pn = rel.pn || 'PN16', m = rel.matiere || '', S = systeme(rel), suf = ` ${S.suffixe}`;
    // Taille lue par le chiffrage : « DN50 », ou « Ø22 DN20 » pour le tube à sertir
    const ajoute = (famille, type, dn, qte, longueur = 0, taille = S.sertir ? `Ø${S.de[dn]} DN${dn}` : `DN${dn}`) => {
      const k = `${famille}|${type}|${taille}`, l = out.get(k) || { systeme: sys, famille, type, taille, dn, longueur: 0, qte: longueur ? 1 : 0 };
      if (longueur) l.longueur = Math.round((l.longueur + longueur) * 1000) / 1000; else l.qte += qte;
      out.set(k, l);
    };
    // Brides une à une (une tournante va avec son collet), un joint et une boulonnerie par assemblage
    const brides = pc => {
      (pc.flanges || []).forEach(t => { if (S.sertir) ajoute('Bride à sertir', `${pn} raccord à bride`, pc.dn, 1); else if (t === 'tournante') { ajoute('Bride tournante', `${pn} EN 1092-1 type 02`, pc.dn, 1); ajoute('Collet à souder', `${m} EN 1092-1 type 35`.trim(), pc.dn, 1); } else ajoute('Bride à collerette', `${pn} EN 1092-1 type 11`, pc.dn, 1); });
      (pc.joints || []).forEach(() => { ajoute('Joint plat', `${pn} EN 1514-1`, pc.dn, 1); ajoute('Boulonnerie', `Jeu ${pn}`, pc.dn, 1); });
    };
    placement.pieces.forEach(pc => {
      const el = pc.el;
      switch (pc.t) {
        case 'tube': if (pc.coupe > 0) ajoute(S.familleTube, m, pc.dn, 1, pc.coupe / 1000); break;
        case 'coude': ajoute(`Coude${suf}`, `${angle(el)}°${S.sertir ? '' : ' 3D'} ${m}`.trim(), pc.dn, 1); break;
        case 'te': ajoute(`Té${suf}`, pc.dnB !== pc.dn ? `réduit ${taille(rel, pc.dn)} × ${taille(rel, pc.dnB)} ${m}`.trim() : `égal ${m}`.trim(), pc.dn, 1); break;
        case 'reduc': ajoute(`Réduction${suf}`, `${S.sertir ? '' : el.exc ? 'excentrique ' : 'concentrique '}${m}`.trim(), Math.max(pc.dn, pc.dn2), 1, 0, S.sertir ? `Ø${S.de[pc.dn]}-Ø${S.de[pc.dn2]} DN${Math.max(pc.dn, pc.dn2)}` : `DN${pc.dn}-DN${pc.dn2}`); break;
        case 'vanne': {
          const v = VANNES[el.type] || VANNES.boisseau;
          ajoute(v.lib.replace(/ \([^)]*\)$/, ''), `${el.rac === 'taraude' && v.libTaraude ? v.libTaraude : RACCORDEMENTS[el.rac || 'bride']} ${pn}`, pc.dn, 1);
          brides(pc);
          break;
        }
        case 'brides': brides(pc); break;
        case 'v3v': ajoute('Vanne 3 voies motorisée', `${RACCORDEMENTS[el.rac || 'bride']} ${pn}`, pc.dn, 1); brides(pc); break;
        case 'raccord': ajoute(`${el.type === 'manchon' ? 'Manchon' : 'Raccord union'}${S.sertir ? suf : ''}`, m, pc.dn, 1); break;
        case 'fond': ajoute(S.sertir ? `Bouchon${suf}` : `Fond bombé${suf}`, m, pc.dn, 1); break;
        case 'instrument': {
          const it = INSTRUMENTS[el.type] || INSTRUMENTS.thermometre;
          ajoute(it.famille, String(el.plage || '').trim() || 'standard', 15, 1);
          if (it.doigt) ajoute('Doigt de gant', `${m} G½`.trim(), 15, 1);
          if (S.sertir) ajoute('Té à sertir piquage taraudé', 'G½', pc.dn, 1); else ajoute('Piquage ½"', 'manchon à souder', 15, 1);
          break;
        }
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
    return [!r.affaireId && !r.clientId && !String(r.clientLibre || '').trim() && 'chantier ou client (visite)', !String(r.ligne || '').trim() && 'repère de la ligne', !r.userId && 'technicien', !r.date && 'date',
      !((r.elements || []).length || (r.cotes || []).some(c => n(c.valeur) !== null)) && 'au moins une cote ou un élément de tuyauterie'].filter(Boolean);
  }
  const STATUTS = ['Brouillon', 'Relevé', 'Terminé'];
  return { DN, DE, INSTRUMENTS, SYSTEMES, systeme, cleSysteme, taille, RAYON_3D, TE, REDUC, FOND, BRIDE, BRIDES_TYPES, VANNES, ANGLES_DEVOIEMENT, aBranche, axeFaceV3V, axeFaceDev, RACCORDEMENTS, RACCORDS, MATIERES, PN, TYPES, DIRS, DIRS_LIB, STATUTS,
    lire, angle, axeFaceCoude, axeFaceTe, longueur, coupes, placer, trouver, listeDe, designation, nomenclature, bilanSoudures, lignesChiffrage, csvChiffrage, debit, manques };
})();
if (typeof module !== 'undefined') module.exports = Tuyauterie;
