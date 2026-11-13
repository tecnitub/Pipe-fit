// Catalogue et calcul des prix de la boutique de tuyauterie inox préfabriquée.
// Partagé par le serveur (prix recalculés à la commande : le navigateur ne fixe jamais un prix) et par le navigateur (prix affichés en direct).
(function (racine) {
  'use strict';

  // Séries de tubes : diamètre extérieur (mm) et épaisseurs proposées (mm)
  const SERIES = {
    iso: { nom: 'ISO 1127 / EN 10217-7 (industrie)', dims: [
      { dn: 'DN15', de: 21.3, ep: [1.6, 2.0, 2.6] }, { dn: 'DN20', de: 26.9, ep: [1.6, 2.0, 2.6] },
      { dn: 'DN25', de: 33.7, ep: [2.0, 2.6, 3.2] }, { dn: 'DN32', de: 42.4, ep: [2.0, 2.6, 3.2] },
      { dn: 'DN40', de: 48.3, ep: [2.0, 2.6, 3.2] }, { dn: 'DN50', de: 60.3, ep: [2.0, 2.6, 3.2] },
      { dn: 'DN65', de: 76.1, ep: [2.0, 2.6, 3.2] }, { dn: 'DN80', de: 88.9, ep: [2.0, 3.2, 4.0] },
      { dn: 'DN100', de: 114.3, ep: [2.0, 3.2, 4.0] }, { dn: 'DN125', de: 139.7, ep: [2.6, 3.2, 4.0] },
      { dn: 'DN150', de: 168.3, ep: [2.6, 3.2, 4.0] }, { dn: 'DN200', de: 219.1, ep: [2.6, 3.2, 4.0] },
    ] },
    din: { nom: 'DIN 11850 série 2 (agroalimentaire)', dims: [
      { dn: 'DN10', de: 13, ep: [1.5] }, { dn: 'DN15', de: 19, ep: [1.5] }, { dn: 'DN20', de: 23, ep: [1.5] },
      { dn: 'DN25', de: 29, ep: [1.5] }, { dn: 'DN32', de: 35, ep: [1.5] }, { dn: 'DN40', de: 41, ep: [1.5] },
      { dn: 'DN50', de: 53, ep: [1.5] }, { dn: 'DN65', de: 70, ep: [2.0] }, { dn: 'DN80', de: 85, ep: [2.0] },
      { dn: 'DN100', de: 104, ep: [2.0] },
    ] },
  };

  const NUANCES = {
    '304L': { nom: '304L (1.4307)', prixKg: 6.4, usage: 'Eau, air comprimé, fluides peu corrosifs' },
    '316L': { nom: '316L (1.4404)', prixKg: 8.6, usage: 'Agroalimentaire, chimie, milieux chlorés' },
  };
  // Coefficient de prix et surcoût par mètre selon l'état de surface
  const FINITIONS = {
    decape: { nom: 'Décapé-passivé', coef: 1, parM: 0 },
    poli: { nom: 'Poli intérieur Ra ≤ 0,8 µm', coef: 1.35, parM: 9 },
    electropoli: { nom: 'Électropoli Ra ≤ 0,4 µm', coef: 1.7, parM: 18 },
  };
  const OPTIONS = {
    cert31: { nom: 'Certificats matière 3.1 (EN 10204)', prix: 35, par: 'commande' },
    epreuve: { nom: 'Épreuve hydraulique 1,5 × PS avec PV', prix: 45, par: 'piece' },
    radio: { nom: 'Contrôle radiographique 10 % des soudures', prix: 60, par: 'piece' },
    bouchons: { nom: 'Nettoyage, bouchonnage et ensachage', prix: 6, par: 'piece' },
  };

  // Familles de produits du catalogue
  const FAMILLES = [
    { id: 'spool', nom: 'Spools préfabriqués', icone: 'spool', texte: 'Tronçons soudés en atelier selon votre tracé, livrés prêts à poser.' },
    { id: 'tube', nom: 'Tubes coupés à longueur', icone: 'tube', texte: 'Tubes soudés recuits, coupés et chanfreinés à la cote.' },
    { id: 'coude', nom: 'Coudes', icone: 'coude', texte: 'Coudes à souder 90° et 45°, rayon 1,5 D.' },
    { id: 'te', nom: 'Tés', icone: 'te', texte: 'Tés égaux à souder, emboutis.' },
    { id: 'reduction', nom: 'Réductions', icone: 'reduction', texte: 'Concentriques ou excentriques, à souder.' },
    { id: 'bride', nom: 'Brides', icone: 'bride', texte: 'Collerettes et brides tournantes PN16, brides plates à souder.' },
    { id: 'hygienique', nom: 'Raccords hygiéniques', icone: 'hygienique', texte: 'Unions DIN 11851 et clamps ISO 2852.' },
    { id: 'support', nom: 'Supports', icone: 'support', texte: 'Colliers inox avec isolant EPDM, consoles.' },
  ];

  // Articles : prix calculé à partir de la masse de matière (ou d'un prix de base par DN), de la nuance et de la finition
  const PRODUITS = [
    { id: 'spool-sur-mesure', famille: 'spool', nom: 'Spool sur mesure (configurateur)', configurateur: true,
      texte: "Dessinez votre tracé (longueurs, changements de direction, extrémités) : le spool est soudé en atelier par soudure orbitale TIG, contrôlé et livré prêt à poser. Délai : 10 jours ouvrés.", delai: 10 },
    { id: 'tube', famille: 'tube', nom: 'Tube soudé recuit coupé à longueur', unite: 'm', longueur: true,
      texte: 'Tube soudé longitudinalement, recuit, décapé. Coupe à la scie, ébavurage et chanfrein 30° inclus.', delai: 3 },
    { id: 'coude90', famille: 'coude', nom: 'Coude 90° à souder 3D', base: 7, delai: 2, texte: 'Coude 90° rayon 1,5 D, extrémités droites prêtes à souder.' },
    { id: 'coude45', famille: 'coude', nom: 'Coude 45° à souder 3D', base: 5.5, delai: 2, texte: 'Coude 45° rayon 1,5 D, extrémités droites prêtes à souder.' },
    { id: 'te', famille: 'te', nom: 'Té égal à souder', base: 13, delai: 2, texte: 'Té égal embouti, dérivation au même diamètre.' },
    { id: 'reduc-c', famille: 'reduction', nom: 'Réduction concentrique', base: 6, delai: 2, reduction: true, texte: "Réduction concentrique vers le diamètre inférieur de la série." },
    { id: 'reduc-e', famille: 'reduction', nom: 'Réduction excentrique', base: 7.5, delai: 2, reduction: true, texte: "Réduction excentrique (génératrice droite) vers le diamètre inférieur, pour éviter les poches d'air ou de liquide." },
    { id: 'collerette', famille: 'bride', nom: 'Collerette à souder + bride tournante PN16', base: 16, delai: 3, serie: 'iso', texte: "Collerette inox à souder, bride tournante acier galvanisé ou inox, perçage EN 1092-1 PN16." },
    { id: 'bride-plate', famille: 'bride', nom: 'Bride plate à souder PN16', base: 19, delai: 3, serie: 'iso', texte: 'Bride plate EN 1092-1 type 01, perçage PN16, entièrement inox.' },
    { id: 'union-din', famille: 'hygienique', nom: 'Union complète DIN 11851 (fileté + écrou + joint)', base: 11, delai: 2, serie: 'din', finitionImposee: 'poli', texte: "Union laitière complète : douille filetée, douille lisse, écrou et joint EPDM." },
    { id: 'clamp', famille: 'hygienique', nom: 'Raccord clamp ISO 2852 complet', base: 12, delai: 2, serie: 'din', finitionImposee: 'poli', texte: "Deux férules à souder, collier clamp à charnière et joint EPDM." },
    { id: 'collier', famille: 'support', nom: 'Collier inox avec isolant EPDM, tige M10', base: 3.2, delai: 2, sansFinition: true, texte: 'Collier deux pièces inox, garniture EPDM anti-vibratile, écrou soudé M10.' },
  ];

  const arrondi = n => Math.round(n * 100) / 100;
  // Masse linéique d'un tube inox (kg/m) : π × (De − e) × e × 7,93 kg/dm³
  const masseM = (de, ep) => Math.PI * (de - ep) * ep * 7.93e-3;
  const dimension = (serie, dn) => (SERIES[serie] || { dims: [] }).dims.find(d => d.dn === dn) || null;
  // Facteur de taille des raccords : proportionnel au diamètre (base de prix donnée pour un DN50 ≈ 60 mm)
  const facteurTaille = de => Math.max(0.45, Math.pow(de / 60, 1.35));

  function verifierConfig(c) {
    const serie = SERIES[c.serie] ? c.serie : null;
    if (!serie) throw new Error('Série de tube inconnue');
    const d = dimension(serie, c.dn);
    if (!d) throw new Error('Diamètre inconnu pour cette série');
    const ep = +c.ep;
    if (!d.ep.includes(ep)) throw new Error('Épaisseur non proposée pour ce diamètre');
    if (!NUANCES[c.nuance]) throw new Error('Nuance inconnue');
    if (!FINITIONS[c.finition]) throw new Error('Finition inconnue');
    return { d, ep };
  }

  // Prix unitaire HT d'un tube (€/m) dans une configuration
  function prixTubeM(c) {
    const { d, ep } = verifierConfig(c);
    const f = FINITIONS[c.finition];
    return arrondi(masseM(d.de, ep) * NUANCES[c.nuance].prixKg * 1.4 * f.coef + 2.5 + f.parM * d.de / 60);
  }
  function prixRaccord(base, c) {
    const { d, ep } = verifierConfig(c);
    const f = FINITIONS[c.finition];
    return arrondi(base * facteurTaille(d.de) * (NUANCES[c.nuance].prixKg / 6.4) * f.coef * (0.85 + ep / 13));
  }
  // Soudure orbitale TIG bout à bout (main d'œuvre, gaz de protection intérieure, contrôle visuel)
  const prixSoudure = c => { const { d } = verifierConfig(c); return arrondi(14 + d.de * 0.32); };
  const EXTREMITES = {
    chanfrein: { nom: 'Chanfrein à souder', prix: () => 0 },
    collerette: { nom: 'Collerette + bride tournante PN16', prix: c => prixRaccord(16, c) },
    bride: { nom: 'Bride plate PN16', prix: c => prixRaccord(19, c) },
    clamp: { nom: 'Férule clamp ISO 2852', prix: c => prixRaccord(5, c) },
    din: { nom: 'Douille filetée DIN 11851', prix: c => prixRaccord(5.5, c) },
  };

  // Spool : suite de tronçons droits dans les 6 directions ; un coude 90° est posé à chaque changement de direction
  const DIRECTIONS = { E: [1, 0, 0], O: [-1, 0, 0], N: [0, 1, 0], S: [0, -1, 0], H: [0, 0, 1], B: [0, 0, -1] };
  const NOM_DIR = { E: 'Est (→ X+)', O: 'Ouest (← X−)', N: 'Nord (Y+)', S: 'Sud (Y−)', H: 'Haut (Z+)', B: 'Bas (Z−)' };
  const opposee = { E: 'O', O: 'E', N: 'S', S: 'N', H: 'B', B: 'H' };

  function analyserSpool(sp) {
    const troncons = Array.isArray(sp.troncons) ? sp.troncons : [];
    if (!troncons.length) throw new Error('Le spool doit comporter au moins un tronçon');
    if (troncons.length > 30) throw new Error('30 tronçons au maximum par spool');
    const { d } = verifierConfig(sp);
    const rayon = 1.5 * d.de; // rayon de cintrage des coudes 3D (axe)
    let coudes = 0, tube = 0;
    troncons.forEach((t, i) => {
      if (!DIRECTIONS[t.dir]) throw new Error(`Tronçon ${i + 1} : direction inconnue`);
      const l = +t.l;
      if (!(l >= 50 && l <= 6000)) throw new Error(`Tronçon ${i + 1} : longueur entre 50 et 6 000 mm`);
      if (i > 0) {
        const p = troncons[i - 1].dir;
        if (t.dir === opposee[p]) throw new Error(`Tronçon ${i + 1} : demi-tour impossible`);
        if (t.dir !== p) coudes++;
      }
      tube += l;
    });
    // Longueur de tube réelle : longueurs entre axes moins l'encombrement des coudes
    const longueurTube = Math.max(0, tube - coudes * 2 * rayon) / 1000;
    const changements = troncons.filter((t, i) => i > 0 && t.dir !== troncons[i - 1].dir).length;
    // Tronçons consécutifs dans la même direction : raboutés par une soudure
    const raboutages = troncons.length - 1 - changements;
    const soudures = coudes * 2 + raboutages + ['a', 'b'].filter(k => (sp.ext || {})[k] && sp.ext[k] !== 'chanfrein').length;
    return { coudes, longueurTube, soudures, rayon, d };
  }

  function prixSpool(sp) {
    const a = analyserSpool(sp);
    const ext = sp.ext || {};
    ['a', 'b'].forEach(k => { if (!EXTREMITES[ext[k] || 'chanfrein']) throw new Error('Extrémité inconnue'); });
    const lignes = [
      { lib: `Tube ${a.longueurTube.toFixed(2).replace('.', ',')} m`, montant: arrondi(a.longueurTube * prixTubeM(sp)) },
      { lib: `${a.coudes} coude(s) 90° 3D`, montant: arrondi(a.coudes * prixRaccord(7, sp)) },
      { lib: `${a.soudures} soudure(s) orbitale(s) TIG`, montant: arrondi(a.soudures * prixSoudure(sp)) },
      { lib: `Extrémité A : ${EXTREMITES[ext.a || 'chanfrein'].nom}`, montant: EXTREMITES[ext.a || 'chanfrein'].prix(sp) },
      { lib: `Extrémité B : ${EXTREMITES[ext.b || 'chanfrein'].nom}`, montant: EXTREMITES[ext.b || 'chanfrein'].prix(sp) },
      { lib: 'Repérage, décapage-passivation des soudures', montant: arrondi(18 + a.soudures * 4) },
    ];
    return { ...a, lignes, total: arrondi(lignes.reduce((s, l) => s + l.montant, 0)) };
  }

  // Prix unitaire HT d'une ligne de panier ; lève une erreur si la configuration est invalide
  function prixLigne(l) {
    const p = PRODUITS.find(x => x.id === l.produit);
    if (!p) throw new Error('Article inconnu');
    const c = { ...l.config };
    if (p.serie && c.serie !== p.serie) throw new Error('Série non proposée pour cet article');
    if (p.finitionImposee && c.finition === 'decape') throw new Error('Finition polie obligatoire pour cet article');
    if (p.sansFinition) c.finition = 'decape';
    let pu;
    if (p.configurateur) pu = prixSpool(c).total;
    else if (p.longueur) {
      const lg = +c.longueur;
      if (!(lg >= 100 && lg <= 6000)) throw new Error('Longueur de coupe entre 100 et 6 000 mm');
      pu = arrondi(prixTubeM(c) * lg / 1000 + 3.5);
    } else if (p.reduction) {
      const dims = SERIES[c.serie].dims, i = dims.findIndex(x => x.dn === c.dn);
      if (i < 1) throw new Error('Pas de diamètre inférieur pour la réduction');
      pu = prixRaccord(p.base, c);
    } else pu = prixRaccord(p.base, c);
    // Options facturées par pièce
    for (const o of l.options || []) {
      if (!OPTIONS[o]) throw new Error('Option inconnue');
      if (OPTIONS[o].par === 'piece') pu += OPTIONS[o].prix;
    }
    return arrondi(pu);
  }

  // Remise par quantité sur une ligne
  const remiseQte = q => (q >= 50 ? 0.12 : q >= 20 ? 0.08 : q >= 10 ? 0.05 : 0);
  const FRANCO = 800, PORT = 45, TVA = 0.2;

  // Total d'un panier : lignes recalculées, options par commande, port, TVA
  function totaliser(lignes) {
    if (!Array.isArray(lignes) || !lignes.length) throw new Error('Panier vide');
    if (lignes.length > 100) throw new Error('100 lignes au maximum par commande');
    let cert = false, delai = 0;
    const det = lignes.map(l => {
      const q = Math.floor(+l.qte);
      if (!(q >= 1 && q <= 999)) throw new Error('Quantité entre 1 et 999');
      const pu = prixLigne(l), r = remiseQte(q);
      if ((l.options || []).includes('cert31')) cert = true;
      delai = Math.max(delai, (PRODUITS.find(x => x.id === l.produit) || {}).delai || 3);
      return { ...l, qte: q, pu, remise: r, montant: arrondi(pu * q * (1 - r)) };
    });
    const sousTotal = arrondi(det.reduce((s, l) => s + l.montant, 0));
    const certificats = cert ? OPTIONS.cert31.prix : 0;
    const port = sousTotal >= FRANCO ? 0 : PORT;
    const ht = arrondi(sousTotal + certificats + port);
    const tva = arrondi(ht * TVA);
    return { lignes: det, sousTotal, certificats, port, ht, tva, ttc: arrondi(ht + tva), delai };
  }

  // Désignation lisible d'une ligne
  function designation(l) {
    const p = PRODUITS.find(x => x.id === l.produit) || { nom: l.produit };
    const c = l.config || {}, d = dimension(c.serie, c.dn);
    const parts = [p.nom, d ? `${c.dn} Ø${String(d.de).replace('.', ',')} × ${String(c.ep).replace('.', ',')}` : '', c.nuance,
      p.sansFinition ? '' : (FINITIONS[c.finition] || {}).nom];
    if (p.longueur) parts.push(`L = ${c.longueur} mm`);
    if (p.configurateur && Array.isArray(c.troncons)) parts.push(c.troncons.map(t => `${t.l}${t.dir}`).join('-'));
    if (c.repere) parts.push(`repère ${c.repere}`);
    return parts.filter(Boolean).join(' · ');
  }

  const API = { SERIES, NUANCES, FINITIONS, OPTIONS, FAMILLES, PRODUITS, EXTREMITES, DIRECTIONS, NOM_DIR, FRANCO, PORT, TVA,
    masseM, dimension, prixTubeM, prixRaccord, prixSoudure, analyserSpool, prixSpool, prixLigne, remiseQte, totaliser, designation, arrondi };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else racine.Catalogue = API;
})(typeof window !== 'undefined' ? window : globalThis);
