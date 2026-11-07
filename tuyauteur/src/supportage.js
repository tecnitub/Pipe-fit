// Tuyauteur : supports de tuyauterie fabriqués sur mesure (carnet de supportage).
//   Au sol : platine + poteau + traverse (étrier) ou platine de tête (collier).
//   Contre poteau acier, bois ou béton : console (potence) avec ou sans jambe de force, fixée par platine chevillée,
//   tire-fonds, boulons traversants, soudure, crapauds ou ceinture (étrier / tiges autour du poteau).
//   Maintien du tube par collier ou par étrier (DIN 3570).
// Chaque support donne : cotes de fabrication, débit des profilés, platines (DXF découpe laser) et quincaillerie.
// Dimensions de quincaillerie indicatives : à valider selon les charges et le catalogue du fournisseur.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./dessin.js'), require('./platine.js'));
  else racine.Supportage = fabrique(racine.Dessin, racine.Platine);
}(typeof self !== 'undefined' ? self : this, function (Dessin, Platine) {
  'use strict';
  const exiger = (c, m) => { if (!c) throw new Dessin.ErreurSaisie(m); };
  const nb = v => (v === '' || v == null || !isFinite(+v)) ? NaN : +v;
  const num = (v, d = 0) => isFinite(nb(v)) ? nb(v) : d;
  const fmt = (v, d = 0) => (+v).toFixed(d).replace('.', ',');
  const arr = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

  // Profilés : [désignation, hauteur h, largeur b, épaisseur d'aile, masse kg/m]
  const PROFILS = {
    'L40': ['Cornière 40 × 40 × 4', 40, 40, 4, 2.42], 'L50': ['Cornière 50 × 50 × 5', 50, 50, 5, 3.77], 'L60': ['Cornière 60 × 60 × 6', 60, 60, 6, 5.42],
    'L70': ['Cornière 70 × 70 × 7', 70, 70, 7, 7.38], 'L80': ['Cornière 80 × 80 × 8', 80, 80, 8, 9.63],
    'UPN80': ['UPN 80', 80, 45, 8, 8.64], 'UPN100': ['UPN 100', 100, 50, 8.5, 10.6], 'UPN120': ['UPN 120', 120, 55, 9, 13.4],
    'T40': ['Tube carré 40 × 40 × 3', 40, 40, 3, 3.3], 'T50': ['Tube carré 50 × 50 × 3', 50, 50, 3, 4.25], 'T60': ['Tube carré 60 × 60 × 4', 60, 60, 4, 6.97],
    'T80': ['Tube carré 80 × 80 × 4', 80, 80, 4, 9.22], 'T100': ['Tube carré 100 × 100 × 5', 100, 100, 5, 14.4],
    'HEA100': ['HEA 100', 96, 100, 8, 16.7], 'HEA120': ['HEA 120', 114, 120, 8, 19.9], 'IPE100': ['IPE 100', 100, 55, 5.7, 8.1], 'IPE120': ['IPE 120', 120, 64, 6.3, 10.4],
  };
  // Étriers DIN 3570 (indicatif) : Ø ext. maxi → filetage
  const ETRIERS = [[26.9, 'M10'], [60.3, 'M10'], [114.3, 'M12'], [219.1, 'M16'], [355.6, 'M20'], [610, 'M24'], [1100, 'M24']];
  const filetageEtrier = de => (ETRIERS.find(([dmax]) => de <= dmax + 0.1) || ETRIERS[ETRIERS.length - 1])[1];
  // Colliers à embase taraudée (indicatif) : Ø ext. maxi → tige
  const filetageCollier = de => de <= 60.3 ? 'M8' : de <= 168.3 ? 'M10' : de <= 323.9 ? 'M12' : 'M16';
  const dFil = f => +f.slice(1);
  const perçage = f => dFil(f) + (dFil(f) <= 12 ? 1 : 2);
  const ecrou = f => ({ M8: 6.8, M10: 8.4, M12: 10.8, M16: 14.8, M20: 18, M24: 21.5 }[f] || 0.8 * dFil(f));
  const arrondi5 = v => Math.ceil(v / 5 - 1e-9) * 5;

  const FIXATIONS = {
    sol: [['cheville', 'Chevilles d\'ancrage (dalle béton)'], ['chimique', 'Scellement chimique'], ['soude', 'Platine soudée sur charpente']],
    beton: [['cheville', 'Platine + chevilles mécaniques'], ['chimique', 'Platine + scellement chimique'], ['ceinture', 'Ceinture (tiges + contre-plaque)']],
    bois: [['tirefond', 'Platine + tire-fonds'], ['traversant', 'Platine + boulons traversants'], ['ceinture', 'Ceinture (tiges + contre-plaque)']],
    acier: [['soude', 'Soudé sur le poteau'], ['crapauds', 'Platine + crapauds (sans soudure ni perçage)'], ['boulonne', 'Platine boulonnée (poteau percé)'], ['ceinture', 'Ceinture (étrier autour du poteau)']],
  };

  // p : { repere, de (Ø tube), fixation: 'sol' | 'poteau', materiau: 'beton'|'bois'|'acier', mode (voir FIXATIONS),
  //       maintien: 'etrier' | 'collier', hauteurAxe (axe/sol ou axe/dessous de console), deport (face poteau → axe),
  //       profil, profilPoteau, poteauL (largeur), poteauP (profondeur), poteauRond (bool), cotesCollier (axe → embase),
  //       platineSol {L, l, t}, jambe ('auto'|'oui'|'non'), quantite, isolant (épaisseur de cale) }
  function support(p) {
    const de = num(p.de); exiger(de > 0, 'Ø extérieur du tube : saisir une valeur positive.');
    const rep = (p.repere || 'S1').trim() || 'S1';
    const q = Math.max(1, Math.round(num(p.quantite, 1)));
    const maintien = p.maintien === 'collier' ? 'collier' : 'etrier';
    const prof = PROFILS[p.profil] || PROFILS.L50;
    const cale = num(p.cale, 0);
    // Hauteur entre l'axe du tube et le dessus du profil porteur
    const fE = filetageEtrier(de), fC = filetageCollier(de);
    const hc = maintien === 'collier' ? num(p.cotesCollier, de / 2 + 30) : de / 2 + cale;
    const pieces = [], platines = [], quinc = [], avert = [];
    const d = Dessin.creer();
    const hT = Math.max(12, de / 6);
    // Maintien du tube, dessiné au-dessus d'un profil dont le dessus est à y = 0, axe du tube en (xa, hc)
    const dessinerTube = (xa) => {
      d.cercle(xa, hc, de / 2, 'DECOUPE', 96);
      d.ligne([xa - de / 2 - 20, hc], [xa + de / 2 + 20, hc], 'AXES'); d.ligne([xa, hc - de / 2 - 20], [xa, hc + de / 2 + 20], 'AXES');
      if (maintien === 'etrier') {
        const r = de / 2 + dFil(fE) / 2 + 1;
        // arceau au-dessus du tube, branches traversant le profil
        const pts = [[xa - r, -prof[1] - 30]];
        for (let k = 0; k <= 24; k++) { const a = Math.PI - Math.PI * k / 24; pts.push([xa + r * Math.cos(a), hc + r * Math.sin(a)]); }
        pts.push([xa + r, -prof[1] - 30]);
        d.polyligne(pts, 'TRACAGE');
      } else {
        d.cercle(xa, hc, de / 2 + 6, 'TRACAGE', 96);
        d.polyligne([[xa - 25, 0], [xa + 25, 0], [xa + 25, hc - de / 2 - 6], [xa - 25, hc - de / 2 - 6]], 'TRACAGE', true);
      }
    };
    const maintienQuinc = () => {
      if (maintien === 'etrier') {
        const e = de + dFil(fE) + 2;
        quinc.push([`Étrier DIN 3570 pour Ø${fmt(de, 1)} (${fE})`, q, `entraxe des trous ${fmt(e, 0)}, perçage Ø${perçage(fE)}`]);
        quinc.push([`Écrous ${fE} + rondelles`, 4 * q, '2 par branche (blocage dessus / dessous)']);
        return e;
      }
      quinc.push([`Collier 2 pièces Ø${fmt(de, 1)} à embase ${fC}${p.isolant ? ', avec isolant' : ''}`, q, `axe → embase ${fmt(hc, 0)} mm`]);
      quinc.push([`Tige filetée ${fC} + écrous`, q, `perçage Ø${perçage(fC)} dans le profil`]);
      return 0;
    };

    let resume;
    if (p.fixation === 'sol') {
      // ------------------------------------------------ Support au sol
      const Haxe = num(p.hauteurAxe); exiger(Haxe > 0, 'Hauteur de l\'axe du tube au sol : saisir une valeur positive.');
      const ps = { L: num(p.platineL, 200), l: num(p.platineLa, 200), t: num(p.platineT, 10) };
      const pPot = PROFILS[p.profilPoteau] || PROFILS.T60;
      const entraxeEtrier = maintienQuinc();
      // Traverse pour l'étrier ; platine de tête pour le collier
      const traverse = maintien === 'etrier' ? arrondi5(Math.max(entraxeEtrier + 2 * perçage(fE) + 40, pPot[2] + 40)) : 0;
      const hTete = maintien === 'etrier' ? prof[1] : 8;
      const lPoteau = Haxe - hc - hTete - ps.t;
      exiger(lPoteau > 50, `Hauteur trop faible : il reste ${fmt(lPoteau)} mm de poteau. Prévoir un patin ou une semelle soudée.`);
      pieces.push([`${rep} poteau`, pPot[0], q, arr(lPoteau), 'coupe droite', pPot[4]]);
      if (traverse) pieces.push([`${rep} traverse`, prof[0], q, traverse, `percer 2 × Ø${perçage(fE)} à ${fmt(entraxeEtrier, 0)}`, prof[4]]);
      const solMode = p.mode || 'cheville';
      const ancr = ps.L >= 250 ? 'M16' : 'M12';
      const pl = Platine.platine({ forme: 'rect', L: ps.L, l: ps.l, epaisseur: ps.t, coins: 'chanfreins', rayon: 10, disposition: solMode === 'soude' ? 'aucun' : 'coins', bordX: 30, dTrou: perçage(ancr), repere: `${rep}-PS`, quantite: q });
      platines.push({ nom: `${rep}-PS platine de sol ${ps.L} × ${ps.l} × ${ps.t}`, ...pl, quantite: q });
      if (maintien === 'collier') {
        const pt = Platine.platine({ forme: 'rect', L: Math.max(pPot[2] + 20, 80), l: Math.max(pPot[2] + 20, 80), epaisseur: 8, coins: 'vifs', disposition: 'aucun', dCentral: perçage(fC), dTrou: 0, repere: `${rep}-PT`, quantite: q });
        platines.push({ nom: `${rep}-PT platine de tête`, ...pt, quantite: q });
      }
      if (solMode === 'cheville') quinc.push([`Chevilles d'ancrage ${ancr}`, 4 * q, 'goujons acier zingué, dalle béton ≥ 150 mm']);
      else if (solMode === 'chimique') quinc.push([`Tiges ${ancr} + scellement chimique`, 4 * q, 'cartouche résine']);
      // Dessin : sol en y = −(Haxe − hc), tube au-dessus du profil de tête (dessus en y = 0)
      const ySol = -(Haxe - hc);
      d.ligne([-ps.L, ySol], [ps.L, ySol], 'TRACAGE');
      d.polyligne([[-ps.L / 2, ySol], [ps.L / 2, ySol], [ps.L / 2, ySol + ps.t], [-ps.L / 2, ySol + ps.t]], 'DECOUPE', true);
      d.polyligne([[-pPot[2] / 2, ySol + ps.t], [pPot[2] / 2, ySol + ps.t], [pPot[2] / 2, -hTete], [-pPot[2] / 2, -hTete]], 'DECOUPE', true);
      if (traverse) d.polyligne([[-traverse / 2, -hTete], [traverse / 2, -hTete], [traverse / 2, 0], [-traverse / 2, 0]], 'DECOUPE', true);
      else d.polyligne([[-pPot[2] / 2 - 10, -hTete], [pPot[2] / 2 + 10, -hTete], [pPot[2] / 2 + 10, 0], [-pPot[2] / 2 - 10, 0]], 'DECOUPE', true);
      dessinerTube(0);
      d.cote([ps.L / 2 + 60, ySol], [ps.L / 2 + 60, hc], -2 * hT, `axe ${fmt(Haxe)}`, hT);
      d.cote([-ps.L / 2 - 30, ySol + ps.t], [-ps.L / 2 - 30, -hTete], 2 * hT, `poteau ${fmt(lPoteau)}`, hT);
      resume = `Support au sol, axe à ${fmt(Haxe)} mm, poteau ${pPot[0]} ${fmt(lPoteau)} mm`;
      if (lPoteau > 1500 && /L40|T40|T50/.test(p.profilPoteau || '')) avert.push('Poteau élancé : vérifier le flambement ou choisir un profil plus fort.');
    } else {
      // ------------------------------------------------ Console contre poteau
      const mat = ['acier', 'bois', 'beton'].includes(p.materiau) ? p.materiau : 'beton';
      const mode = p.mode || FIXATIONS[mat][0][0];
      const deport = num(p.deport); exiger(deport > de / 2 + 20, `Déport (face du poteau → axe du tube) : au moins ${fmt(de / 2 + 20)} mm.`);
      const pl = num(p.poteauL, mat === 'acier' ? 200 : 200), pp = num(p.poteauP, pl);
      const entraxeEtrier = maintienQuinc();
      const tPl = (mode === 'soude' || (mode === 'ceinture' && mat === 'acier')) ? 0 : num(p.platineT, 10);
      const debord = maintien === 'etrier' ? entraxeEtrier / 2 + perçage(fE) + 25 : 40;
      const lConsole = arrondi5(deport - tPl + debord);
      pieces.push([`${rep} console`, prof[0], q, lConsole, mode === 'soude' ? 'souder en about sur le poteau' : 'souder sur la platine', prof[4]]);
      if (maintien === 'etrier') pieces[pieces.length - 1][4] += `, percer 2 × Ø${perçage(fE)} : axe à ${fmt(deport - tPl, 0)} du talon, entraxe ${fmt(entraxeEtrier, 0)}`;
      else pieces[pieces.length - 1][4] += `, percer Ø${perçage(fC)} à ${fmt(deport - tPl, 0)} du talon`;
      // Jambe de force à 45° au-delà de 500 mm de déport (ou sur demande)
      const jambe = p.jambe === 'oui' || (p.jambe !== 'non' && deport > 500);
      let lJambe = 0, hJambe = 0;
      if (jambe) {
        const xj = Math.max(lConsole - debord - 40, lConsole * 0.6);
        hJambe = xj; lJambe = arrondi5(xj * Math.SQRT2);
        pieces.push([`${rep} jambe de force`, prof[0], q, lJambe, 'coupes 45° aux deux bouts', prof[4]]);
      }
      // Platine sur le poteau
      const hPl = Math.max(prof[1] + 100, jambe ? hJambe + prof[1] + 60 : 0);
      const lPl = mat === 'acier' && mode === 'crapauds' ? pl + 100 : Math.max(prof[2] + 80, 140);
      if (tPl > 0) {
        let disp = 'grille', nx = 2, ny = jambe ? 3 : 2, ax = lPl - 60, ay = (hPl - 60) / (ny - 1), dT = 14;
        let note = '';
        if (mode === 'cheville' || mode === 'chimique') { dT = perçage(lPl >= 180 ? 'M16' : 'M12'); quinc.push([`${mode === 'chimique' ? 'Tiges + scellement chimique' : 'Chevilles d\'ancrage'} ${lPl >= 180 ? 'M16' : 'M12'}`, nx * ny * q, 'distance au bord du béton ≥ 100 mm']); if (pl < 200) avert.push('Poteau béton étroit : distance aux bords des chevilles à vérifier (≥ 100 mm).'); }
        else if (mode === 'tirefond') { dT = 11; quinc.push(['Tire-fonds Ø10 × ' + arrondi5(tPl + Math.min(100, pp * 0.6)), nx * ny * q, 'avant-trou Ø7']); }
        else if (mode === 'traversant' || mode === 'boulonne' || mode === 'ceinture') {
          const f = 'M12'; dT = perçage(f);
          if (mode === 'ceinture') { nx = 2; ax = (p.poteauRond ? pl : pl) + dFil(f) + 4; }
          const traverse = mode === 'boulonne' ? (num(p.epaisseurAile, 10)) : pp + 8;
          const lTige = arrondi5(tPl + traverse + 2 * (ecrou(f) + 2 * 1.75) + 2 * 2.5);
          quinc.push([`${mode === 'boulonne' ? 'Vis' : 'Tiges filetées'} ${f} × ${lTige} + écrous + rondelles`, nx * ny * q, mode === 'traversant' ? `poteau percé Ø${dT}` : mode === 'ceinture' ? 'autour du poteau' : 'aile du poteau percée']);
          if (mode === 'ceinture') {
            const cp = Platine.platine({ forme: 'rect', L: ax + 2 * 30, l: 60 + (ny - 1) * ay, epaisseur: 10, coins: 'chanfreins', rayon: 5, disposition: 'grille', nx, ny, entraxeX: ax, entraxeY: ay, dTrou: dT, repere: `${rep}-CP`, quantite: q });
            platines.push({ nom: `${rep}-CP contre-plaque de ceinture`, ...cp, quantite: q });
            note = 'ceinture';
          }
        } else if (mode === 'crapauds') {
          ax = pl + 2 * 15; dT = 14;
          quinc.push(['Crapauds (pinces de poutre) M12 + vis', nx * ny * q, `serrage sur l'aile de ${fmt(pl, 0)} mm`]);
        }
        const larg = Math.max(lPl, ax + 60);
        const pf = Platine.platine({ forme: 'rect', L: larg, l: hPl, epaisseur: tPl, coins: 'chanfreins', rayon: 10, disposition: disp, nx, ny, entraxeX: ax, entraxeY: ay, dTrou: dT, repere: `${rep}-PF`, quantite: q });
        platines.push({ nom: `${rep}-PF platine de fixation ${fmt(larg)} × ${fmt(hPl)} × ${tPl}${note ? ' (ceinture)' : ''}`, ...pf, quantite: q });
      } else if (mode === 'ceinture') {
        const f = 'M12';
        quinc.push([`Étrier de poteau ${p.poteauRond ? `rond Ø${fmt(pl)}` : `${fmt(pl)} × ${fmt(pp)}`} ${f} + écrous`, q, 'console soudée sur une contre-plaque, ou crapaud']);
      }
      // Dessin (élévation) : poteau à gauche (face en x = 0), console dessus en y = 0, tube en x = deport
      const H = Math.max(hPl, 300) + 200;
      d.polyligne([[-pp, -H + 100], [0, -H + 100], [0, hc + de / 2 + 150], [-pp, hc + de / 2 + 150]], 'TRACAGE', true);
      d.texte(-pp / 2, -H + 130, hT, { acier: 'poteau acier', bois: 'poteau bois', beton: 'poteau béton' }[mat], 'TEXTE', 'c', 90);
      if (tPl) d.polyligne([[0, prof[1] / 2 - hPl + 50], [tPl, prof[1] / 2 - hPl + 50], [tPl, 50], [0, 50]], 'DECOUPE', true);
      d.polyligne([[tPl, -prof[1]], [tPl + lConsole, -prof[1]], [tPl + lConsole, 0], [tPl, 0]], 'DECOUPE', true);
      if (jambe) d.polyligne([[tPl, -prof[1] - hJambe], [tPl + hJambe, -prof[1]]], 'DECOUPE');
      dessinerTube(deport);
      d.cote([0, hc + de / 2 + 40], [deport, hc + de / 2 + 40], 2 * hT, `déport ${fmt(deport)}`, hT);
      d.cote([tPl, -prof[1] - 20], [tPl + lConsole, -prof[1] - 20], -2 * hT, `console ${fmt(lConsole)}`, hT);
      d.cote([deport + de / 2 + 30, 0], [deport + de / 2 + 30, hc], -2 * hT, `axe ${fmt(hc)}`, hT);
      resume = `Console ${prof[0]} ${fmt(lConsole)} mm, déport ${fmt(deport)} mm, ${FIXATIONS[mat].find(f => f[0] === mode)?.[1] || mode}`;
      if (deport > 800 && /L40|L50|T40/.test(p.profil || 'L50')) avert.push('Grand déport pour ce profil : vérifier la flèche et la tenue de la console.');
      if (num(p.hauteurAxe) > 0) resume += `, dessus de console à ${fmt(num(p.hauteurAxe) - hc)} mm du sol`;
    }
    if (maintien === 'etrier' && de > 323.9) avert.push('Gros diamètre : préférer un berceau (selle) soudé ou un collier à patin.');
    d.texte(Dessin.boite(d).x0, Dessin.boite(d).y1 + hT, hT * 1.2, `${rep} - ${resume}`, 'TEXTE', 'g');
    const masse = pieces.reduce((s, x) => s + x[3] / 1000 * x[5] * x[2], 0) + platines.reduce((s, x) => s + x.resultats.masse * x.quantite, 0);
    return { repere: rep, quantite: q, resume, pieces, platines, quincaillerie: quinc, avertissements: avert, dessin: d, masse: arr(masse, 1), hauteurAxeProfil: arr(hc) };
  }

  // Carnet : récapitulatif des débits (par profil) et de la quincaillerie
  function recapitulatif(supports) {
    const profils = new Map(), quinc = new Map();
    let masse = 0;
    for (const s of supports) {
      masse += s.masse;
      for (const [, prof, n, l, , kgm] of s.pieces) {
        const r = profils.get(prof) || { prof, longueur: 0, pieces: 0, kgm };
        r.longueur += n * l; r.pieces += n; profils.set(prof, r);
      }
      for (const [nom, n] of s.quincaillerie) quinc.set(nom, (quinc.get(nom) || 0) + n);
    }
    return {
      profils: [...profils.values()].map(r => ({ ...r, barres6m: Math.ceil(r.longueur * 1.05 / 6000), masse: arr(r.longueur / 1000 * r.kgm, 1) })),
      quincaillerie: [...quinc.entries()].map(([nom, n]) => ({ nom, n })),
      masse: arr(masse, 1),
    };
  }

  return { PROFILS, FIXATIONS, support, recapitulatif, filetageEtrier, filetageCollier };
}));
