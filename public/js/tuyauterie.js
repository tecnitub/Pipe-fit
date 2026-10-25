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
  // Robinetterie à brides : longueur face à face EN 558 / ISO 5752 (série de base)
  const SERIE_1 = { 15: 130, 20: 150, 25: 160, 32: 180, 40: 200, 50: 230, 65: 290, 80: 310, 100: 350, 125: 400, 150: 480, 200: 600, 250: 730, 300: 850 };
  const SERIE_14 = { 50: 150, 65: 170, 80: 180, 100: 190, 125: 200, 150: 210, 200: 230, 250: 250, 300: 270 };
  const SERIE_20 = { 50: 43, 65: 46, 80: 46, 100: 52, 125: 56, 150: 56, 200: 60, 250: 68, 300: 78 };
  const VANNES = {
    boisseau: { lib: 'Robinet à tournant sphérique', serie: 'EN 558 série 1', table: SERIE_1, commande: 'levier' },
    papillon: { lib: 'Vanne papillon (entre brides)', serie: 'EN 558 série 20', table: SERIE_20, commande: 'levier' },
    opercule: { lib: 'Robinet-vanne à opercule', serie: 'EN 558 série 14', table: SERIE_14, commande: 'volant' },
    soupape: { lib: 'Robinet à soupape', serie: 'EN 558 série 1', table: SERIE_1, commande: 'volant' },
    clapet: { lib: 'Clapet anti-retour', serie: 'EN 558 série 1', table: SERIE_1, commande: '' },
    filtre: { lib: 'Filtre à tamis en Y', serie: 'EN 558 série 1', table: SERIE_1, commande: '' },
  };
  const RACCORDEMENTS = { bride: 'à brides', souder: 'à souder', taraude: 'taraudé' };
  const RACCORDS = { union: 'Raccord union (3 pièces)', manchon: 'Manchon' };
  const MATIERES = ['Acier P235GH', 'Acier galvanisé', 'Inox 304L', 'Inox 316L', 'Acier S235 (noir)', 'Autre'];
  const PN = ['PN10', 'PN16', 'PN25', 'PN40'];
  const TYPES = { tube: 'Tube', coude: 'Coude', te: 'Té', reduc: 'Réduction', vanne: 'Robinetterie', brides: 'Paire de brides', raccord: 'Raccord', fond: 'Fond bombé' };
  // Directions : X = Est, Y = Nord, Z = Haut (repère de l'isométrique, ISO 6412)
  const DIRS = { E: [1, 0, 0], O: [-1, 0, 0], N: [0, 1, 0], S: [0, -1, 0], H: [0, 0, 1], B: [0, 0, -1] };
  const DIRS_LIB = { E: 'Est', O: 'Ouest', N: 'Nord', S: 'Sud', H: 'Haut', B: 'Bas' };

  const n = v => (v === '' || v === null || v === undefined || isNaN(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));
  const r1 = v => Math.round(v * 10) / 10;
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = a => Math.sqrt(dot(a, a));
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
  function longueur(el) {
    switch (el.t) {
      case 'coude': return 0;
      case 'te': return 2 * axeFaceTe(el);
      case 'reduc': return n(el.l) || REDUC[Math.max(dnOk(el.dn), dnOk(el.dn2))];
      case 'vanne': return vanneLong(el);
      case 'brides': return 2 * BRIDE[dnOk(el.dn)][1] + JOINT;
      case 'raccord': return n(el.l) || r1(DE[dnOk(el.dn)] * (el.type === 'manchon' ? 1.2 : 1.6));
      case 'fond': return n(el.l) || FOND[dnOk(el.dn)];
      default: return n(el.l) || 0;
    }
  }
  const estNoeud = el => el.t === 'coude' || el.t === 'te';

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
        const a = autos[0], suiv = j < liste.length ? (liste[j].t === 'coude' ? axeFaceCoude(liste[j]) : axeFaceTe(liste[j])) : 0;
        const autres = troncon.filter(e => e !== a).reduce((s, e) => s + longueur(e), 0);
        const c = n(a.cote), l = c === null ? null : r1(c - prec - suiv - autres);
        if (c === null) erreurs.push({ i: liste.indexOf(a), msg: 'Cote axe à axe à saisir' });
        else if (l <= 0) erreurs.push({ i: liste.indexOf(a), msg: `Cote trop courte : ${r1(prec + suiv + autres)} mm d'accessoires sur ${c} mm` });
        res.set(liste.indexOf(a), l > 0 ? l : 0);
      }
      if (j >= liste.length) break;
      prec = liste[j].t === 'coude' ? axeFaceCoude(liste[j]) : axeFaceTe(liste[j]);
      i = j + 1;
    }
    return { res, erreurs };
  }

  // Placement en 3D : pièces avec leur géométrie (points en mm), erreurs de saisie, encombrement total
  function placer(rel) {
    const pieces = [], erreurs = [];
    const marcher = (liste, p, d, dn, chemin, debutNoeud) => {
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
          p = p1; d = d1; dn = dnEl;
          return;
        }
        if (el.t === 'te') {
          const c = axeFaceTe({ ...el, dn: dnEl }), centre = add(p, d, c), p1 = add(p, d, 2 * c);
          const v = DIRS[el.vers] || DIRS.H, perp = add(v, d, -dot(v, d));
          pieces.push({ ...base, p1, centre, axeFace: c, dnB: dnOk(el.dnB || dnEl) });
          if (len(perp) < 1e-6) erreurs.push({ chemin: id, msg: 'Té : la dérivation doit partir perpendiculairement à la ligne' });
          else {
            const vb = unit(perp), pb = add(centre, vb, c);
            pieces[pieces.length - 1].pb = pb; pieces[pieces.length - 1].vb = vb;
            marcher(el.branche || [], pb, vb, dnOk(el.dnB || dnEl), `${id}.b.`, c);
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
        if (el.t === 'vanne') {
          const v = DIRS[el.tige] || (Math.abs(d[2]) > 0.5 ? DIRS.E : DIRS.H), perp = add(v, d, -dot(v, d));
          piece.tige = len(perp) < 1e-6 ? (Math.abs(d[0]) > 0.5 ? [0, 1, 0] : [1, 0, 0]) : unit(perp);
          piece.brides = el.rac === 'bride' || !el.rac;
          piece.ftf = piece.brides ? L - 2 * (BRIDE[dnEl][1] + JOINT) : L;
        }
        if (el.t === 'fond') ferme = true;
        pieces.push(piece);
        p = p1; dn = dnSortie;
      });
      return { p, d, dn };
    };
    const fin = marcher(rel.elements || [], [0, 0, 0], DIRS[rel.dirDepart] || DIRS.E, dnOk(rel.dnDepart || 50), '', 0);
    return { pieces, erreurs, fin };
  }
  // Élément désigné par son chemin (« 3 », « 2.b.0 ») et la liste qui le contient
  function trouver(rel, chemin) {
    const parts = String(chemin).split('.b.').map(Number);
    let liste = rel.elements || [];
    for (let k = 0; k < parts.length - 1; k++) { const te = liste[parts[k]]; if (!te || te.t !== 'te') return null; liste = te.branche = te.branche || []; }
    const i = parts[parts.length - 1];
    return liste[i] ? { el: liste[i], liste, i } : null;
  }
  // Liste éditée (ligne principale « » ou dérivation du té « 2 », « 2.b.4 »…)
  function listeDe(rel, chemin) {
    if (!chemin) return rel.elements = rel.elements || [];
    const t = trouver(rel, chemin);
    return t && t.el.t === 'te' ? (t.el.branche = t.el.branche || []) : null;
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
      case 'brides': return [`Bride à collerette DN${pc.dn} ${pn}`, 'EN 1092-1 type 11 / ISO 7005-1'];
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
      ajoute(des, norme, pc.t === 'brides' ? 2 : 1);
      if (pc.t === 'brides' || (pc.t === 'vanne' && pc.brides)) {
        if (pc.t === 'vanne') ajoute(`Bride à collerette DN${pc.dn} ${pn}`, 'EN 1092-1 type 11 / ISO 7005-1', 2);
        ajoute(`Joint plat DN${pc.dn} ${pn}`, 'EN 1514-1', pc.t === 'vanne' ? 2 : 1);
        ajoute(`Jeu de boulonnerie DN${pc.dn} ${pn}`, 'ISO 4014 / ISO 4032', pc.t === 'vanne' ? 2 : 1);
      }
    });
    return [...lignes.values()].sort((a, b) => (a.unite === 'm' ? 0 : 1) - (b.unite === 'm' ? 0 : 1) || a.designation.localeCompare(b.designation, 'fr'));
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
  return { DN, DE, RAYON_3D, TE, REDUC, FOND, BRIDE, VANNES, RACCORDEMENTS, RACCORDS, MATIERES, PN, TYPES, DIRS, DIRS_LIB, STATUTS,
    lire, angle, axeFaceCoude, axeFaceTe, longueur, coupes, placer, trouver, listeDe, designation, nomenclature, debit, manques };
})();
if (typeof module !== 'undefined') module.exports = Tuyauterie;
