// Valeurs réglementaires et repères normatifs utilisés par les calculs annexes (PRP des fluides, seuils F-gaz, limites
// pratiques EN 378, débits de ventilation, seuils de détection, températures réglementaires, seuils de chaufferie…).
// Chaque valeur a un défaut (celui des calculs : aucun résultat ne change tant qu'elle n'est pas surchargée), un libellé,
// une unité, une source et la date de cette source. L'administrateur peut la surcharger dans les Réglages d'Études
// (section « Valeurs réglementaires », config.valeursRegl = { clé: valeur }) ; les notes de calcul le signalent alors.
// Les défauts sont des valeurs de référence à confirmer dans l'édition en vigueur des textes. Module pur (navigateur, node, tests).
const ValeursRegl = (() => {
  const DEFS = {}, ORDRE = [];
  const def = (cle, groupe, libelle, unite, defaut, source, date) => { DEFS[cle] = { cle, groupe, libelle, unite, defaut, source, date }; ORDRE.push(cle); };

  /* ---------- Fluides frigorigènes : PRP (AR4, AR5), limite pratique et LFL (EN 378-1 annexe C) ---------- */
  // [clé, libellé, PRP AR4, PRP AR5, limite pratique (kg/m³), LFL (kg/m³, 0 : ininflammable)]
  const FL = [['R32', 'R32', 675, 677, 0.061, 0.307], ['R410A', 'R410A', 2088, 1924, 0.44, 0], ['R454B', 'R454B', 466, 467, 0.059, 0.296], ['R407C', 'R407C', 1774, 1624, 0.31, 0],
    ['R134a', 'R134a', 1430, 1300, 0.25, 0], ['R513A', 'R513A', 631, 573, 0.35, 0], ['R404A', 'R404A', 3922, 3943, 0.52, 0], ['R449A', 'R449A', 1397, 1282, 0.36, 0],
    ['R448A', 'R448A', 1387, 1273, 0.39, 0], ['R452A', 'R452A', 2140, 1945, 0.42, 0], ['R454C', 'R454C', 148, 146, 0.059, 0.293], ['R1234yf', 'R1234yf', 4, 1, 0.058, 0.289],
    ['R1234ze', 'R1234ze(E)', 7, 1, 0.061, 0.303], ['R290', 'R290 (propane)', 3, 3, 0.008, 0.038], ['R600a', 'R600a (isobutane)', 3, 3, 0.011, 0.043], ['R744', 'R744 (CO₂)', 1, 1, 0.1, 0],
    ['R717', 'R717 (ammoniac)', 0, 0, 0.00035, 0.116]];
  const S_AR4 = ['Règlement (UE) n° 517/2014, annexes I et IV (PRP AR4, étiquetage)', '2014-04-16'], S_AR5 = ['GIEC, 5e rapport d\'évaluation (AR5), PRP à 100 ans', '2013-09-30'];
  const S_378 = ['NF EN 378-1+A1, annexe C (et fiche de données de sécurité du fluide)', '2020-12-01'];
  FL.forEach(([k, l, ar4, ar5]) => {
    def(`fluide.${k}.ar4`, 'Fluides frigorigènes : PRP', `${l} : PRP AR4`, '', ar4, ...S_AR4);
    def(`fluide.${k}.ar5`, 'Fluides frigorigènes : PRP', `${l} : PRP AR5`, '', ar5, ...S_AR5);
  });
  FL.forEach(([k, l, , , lp, lfl]) => {
    def(`fluide.${k}.lp`, 'Fluides frigorigènes : EN 378', `${l} : limite pratique`, 'kg/m³', lp, ...S_378);
    def(`fluide.${k}.lfl`, 'Fluides frigorigènes : EN 378', `${l} : LFL (0 : ininflammable)`, 'kg/m³', lfl, ...S_378);
  });

  /* ---------- Règlement F-gaz : contrôles d'étanchéité ---------- */
  const S_FG = ['Règlement (UE) 2024/573, art. 5 (seuils repris du règlement 517/2014)', '2024-02-07'];
  def('fgaz.seuil1', 'Règlement F-gaz', 'Contrôle d\'étanchéité : premier seuil', 'tCO₂e', 5, ...S_FG);
  def('fgaz.mois1', 'Règlement F-gaz', 'Périodicité au premier seuil (sans détection)', 'mois', 12, ...S_FG);
  def('fgaz.mois1d', 'Règlement F-gaz', 'Périodicité au premier seuil (avec détection)', 'mois', 24, ...S_FG);
  def('fgaz.seuil2', 'Règlement F-gaz', 'Contrôle d\'étanchéité : deuxième seuil', 'tCO₂e', 50, ...S_FG);
  def('fgaz.mois2', 'Règlement F-gaz', 'Périodicité au deuxième seuil (sans détection)', 'mois', 6, ...S_FG);
  def('fgaz.mois2d', 'Règlement F-gaz', 'Périodicité au deuxième seuil (avec détection)', 'mois', 12, ...S_FG);
  def('fgaz.seuil3', 'Règlement F-gaz', 'Contrôle d\'étanchéité : troisième seuil', 'tCO₂e', 500, ...S_FG);
  def('fgaz.mois3', 'Règlement F-gaz', 'Périodicité au troisième seuil (sans détection)', 'mois', 3, ...S_FG);
  def('fgaz.mois3d', 'Règlement F-gaz', 'Périodicité au troisième seuil (avec détection)', 'mois', 6, ...S_FG);
  def('fgaz.detection', 'Règlement F-gaz', 'Détection de fuite obligatoire à partir de', 'tCO₂e', 500, ...S_FG);
  def('fgaz.hermetique', 'Règlement F-gaz', 'Équipement hermétiquement scellé : exempté en dessous de', 'tCO₂e', 10, ...S_FG);

  /* ---------- Parking ---------- */
  def('parking.qPlace', 'Ventilation de parking', 'Débit d\'extraction par véhicule (grande vitesse)', 'm³/h', 600, 'Arrêté du 31/01/1986 (habitation), valeur usuelle ; ERP : arrêté du 09/05/2006 (PS)', '1986-01-31');
  const S_VLEP = ['Directive (UE) 2017/164 (valeurs limites d\'exposition professionnelle), seuils indicatifs', '2017-01-31'];
  def('parking.coPV', 'Ventilation de parking', 'CO : passage en petite vitesse', 'ppm', 20, ...S_VLEP);
  def('parking.coGV', 'Ventilation de parking', 'CO : passage en grande vitesse', 'ppm', 50, ...S_VLEP);
  def('parking.coAl', 'Ventilation de parking', 'CO : alarme', 'ppm', 100, ...S_VLEP);
  def('parking.noPV', 'Ventilation de parking', 'NO₂ : passage en petite vitesse', 'ppm', 0.5, ...S_VLEP);
  def('parking.noGV', 'Ventilation de parking', 'NO₂ : passage en grande vitesse', 'ppm', 1, ...S_VLEP);
  def('parking.noAl', 'Ventilation de parking', 'NO₂ : alarme', 'ppm', 1, ...S_VLEP);

  /* ---------- Air neuf, extraction des sanitaires (RSDT, code du travail) ---------- */
  const S_RSDT = ['Règlement sanitaire départemental type, art. 64 (à vérifier dans le RSD du département)', '1978-08-09'];
  def('rsdt.wc', 'Extraction des sanitaires (RSDT)', 'WC isolé', 'm³/h', 30, ...S_RSDT);
  def('rsdt.wcSup', 'Extraction des sanitaires (RSDT)', 'WC multiples : par WC (30 + 15 × N)', 'm³/h', 15, ...S_RSDT);
  def('rsdt.sdb', 'Extraction des sanitaires (RSDT)', 'Salle de bains ou douche isolée', 'm³/h', 45, ...S_RSDT);
  def('rsdt.sdbwc', 'Extraction des sanitaires (RSDT)', 'Salle de bains avec WC', 'm³/h', 60, ...S_RSDT);
  def('rsdt.groupes', 'Extraction des sanitaires (RSDT)', 'Équipements groupés : base', 'm³/h', 30, ...S_RSDT);
  def('rsdt.groupesN', 'Extraction des sanitaires (RSDT)', 'Équipements groupés : par équipement', 'm³/h', 15, ...S_RSDT);
  def('piscine.qBaigneur', 'Air neuf hygiénique', 'Piscine : air neuf par baigneur', 'm³/h', 22, ...S_RSDT);
  // Air neuf par occupant : [usage, libellé, code du travail R.4222-6, RSDT art. 64] (null : pas de valeur dans ce texte)
  const S_CT = ['Code du travail, art. R.4222-6 (locaux à pollution non spécifique)', '2008-05-01'];
  [['bureau', 'Bureaux', 25, 18], ['accueil', 'Accueil, bibliothèque, banque', 25, 18], ['reunion', 'Salle de réunion', 30, 18], ['spectacle', 'Spectacle, culte, club', 30, 18],
    ['vente', 'Local de vente', 30, 22], ['restauration', 'Restauration', 30, 22], ['classe1', 'Classe (maternelle à collège)', null, 15], ['classe2', 'Classe (lycée, université)', null, 18],
    ['hebergement', 'Hébergement collectif', null, 18], ['sport', 'Salle de sport (par sportif)', null, 25], ['piscine', 'Piscine (par baigneur)', null, 22],
    ['atelierLeger', 'Atelier, travail physique léger', 45, null], ['atelier', 'Autre atelier, travail physique', 60, null]].forEach(([k, l, ct, rs]) => {
    if (ct !== null) def(`airNeuf.ct.${k}`, 'Air neuf par occupant', `${l} : code du travail`, 'm³/h/occ.', ct, ...S_CT);
    if (rs !== null) def(`airNeuf.rsdt.${k}`, 'Air neuf par occupant', `${l} : RSDT`, 'm³/h/occ.', rs, ...S_RSDT);
  });

  /* ---------- Diffusion d'air, sol ---------- */
  def('jet.cKoestel', 'Diffusion d\'air', 'Coefficient de chute des jets non isothermes (relation de Koestel)', '', 0.42, 'Relation de Koestel (jets non isothermes), ordre de grandeur', 'date non précisée');
  [['annonay', 'Annonay', 11.5], ['lyon', 'Lyon', 12.5], ['st-etienne', 'Saint-Étienne', 11], ['valence', 'Valence', 13.5], ['grenoble', 'Grenoble', 12], ['chambery', 'Chambéry', 11.5],
    ['clermont', 'Clermont-Ferrand', 11.5], ['dijon', 'Dijon', 11.5], ['paris', 'Paris', 12.5], ['lille', 'Lille', 11], ['strasbourg', 'Strasbourg', 11], ['nancy', 'Nancy', 10.5],
    ['limoges', 'Limoges', 11.5], ['nantes', 'Nantes', 12.5], ['rennes', 'Rennes', 12], ['brest', 'Brest', 11.5], ['bordeaux', 'Bordeaux', 13.5], ['toulouse', 'Toulouse', 13.5],
    ['montpellier', 'Montpellier', 15.5], ['marseille', 'Marseille', 15.5], ['nice', 'Nice', 16]].forEach(([k, l, t]) =>
    def(`sol.${k}`, 'Température moyenne du sol (puits canadien)', l, '°C', t, 'Ordre de grandeur des températures moyennes annuelles de l\'air (normales climatiques), à confirmer', 'date non précisée'));

  /* ---------- Légionelle, chaufferie ---------- */
  const S_LEG = ['Arrêté du 30/11/2005 (modifiant l\'arrêté du 23/06/1978), ECS', '2005-11-30'];
  def('legionelle.Tstock', 'Eau chaude sanitaire (légionelle)', 'Température minimale en sortie de stockage', '°C', 55, ...S_LEG);
  def('legionelle.Vstock', 'Eau chaude sanitaire (légionelle)', 'Volume de stockage à partir duquel la température est exigée', 'L', 400, ...S_LEG);
  def('legionelle.Tret', 'Eau chaude sanitaire (légionelle)', 'Température minimale en tout point du réseau bouclé', '°C', 50, ...S_LEG);
  def('legionelle.Vant', 'Eau chaude sanitaire (légionelle)', 'Volume maximal entre la boucle et un point de puisage', 'L', 3, ...S_LEG);
  def('chaufferie.seuil', 'Chaufferie et ICPE', 'Seuil de chaufferie (puissance utile)', 'kW', 70, 'Arrêté du 23/06/1978 (installations fixes de chauffage)', '1978-06-23');
  const S_ICPE = ['Nomenclature des ICPE, rubriques 2910 et 3110 (code de l\'environnement)', '2018-08-03'];
  def('icpe.dc', 'Chaufferie et ICPE', 'Rubrique 2910 : seuil de déclaration (PCI)', 'kW', 1000, ...S_ICPE);
  def('icpe.e', 'Chaufferie et ICPE', 'Rubrique 2910 : seuil d\'enregistrement (PCI)', 'kW', 20000, ...S_ICPE);
  def('icpe.a', 'Chaufferie et ICPE', 'Rubrique 3110 : seuil (PCI)', 'kW', 50000, ...S_ICPE);

  /* ---------- Surcharges (Réglages) ---------- */
  let surcharges = {};
  const fini = x => typeof x === 'number' && Number.isFinite(x);
  const lireNombre = x => (fini(x) ? x : typeof x === 'string' && /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(x) ? Number(x.replace(',', '.')) : NaN);
  // Surcharges des Réglages : seules les clés connues, à valeur numérique différente du défaut, sont gardées
  function nettoyer(o) {
    const out = {};
    Object.entries(o || {}).forEach(([k, x]) => { const d = DEFS[k], y = lireNombre(x); if (d && fini(y) && Math.abs(y - d.defaut) > 1e-12) out[k] = y; });
    return out;
  }
  const utiliser = o => { surcharges = nettoyer(o); return surcharges; };
  const defaut = cle => (DEFS[cle] ? DEFS[cle].defaut : undefined);
  const surchargee = cle => Object.prototype.hasOwnProperty.call(surcharges, cle);
  // Valeur retenue : surcharge des Réglages, sinon défaut ; clé inconnue → secours
  const v = (cle, secours) => (surchargee(cle) ? surcharges[cle] : DEFS[cle] ? DEFS[cle].defaut : secours);
  const fmt = x => String(Math.round(x * 1e6) / 1e6).replace('.', ',');
  const texte = cle => { const d = DEFS[cle]; return `${d.libelle} = ${fmt(surcharges[cle])}${d.unite ? ` ${d.unite}` : ''} (défaut ${fmt(d.defaut)}${d.unite ? ` ${d.unite}` : ''} : ${d.source}, ${d.date})`; };
  // Clés (ou préfixes « fluide.R32. ») surchargées parmi celles qu'un calcul utilise
  const utilisees = cles => [...new Set((cles || []).flatMap(c => (c.endsWith('.') ? Object.keys(surcharges).filter(k => k.startsWith(c)) : surchargee(c) ? [c] : [])))];
  // Résultat d'un calcul : hypothèse et alerte quand une valeur surchargée a servi
  function marquer(r, cles) {
    const u = utilisees(cles);
    if (!u.length || !r) return r;
    (r.hypotheses = r.hypotheses || []).push(...u.map(k => `Valeur réglementaire modifiée dans les Réglages : ${texte(k)}.`));
    (r.alertes = r.alertes || []).push({ niveau: 'attention', texte: `${u.length} valeur(s) réglementaire(s) modifiée(s) dans les Réglages utilisée(s) : ${u.map(k => DEFS[k].libelle).join(' ; ')} (voir les hypothèses).` });
    return r;
  }
  const liste = () => ORDRE.map(k => ({ ...DEFS[k], valeur: v(k), surchargee: surchargee(k) }));
  const groupes = () => [...new Set(ORDRE.map(k => DEFS[k].groupe))];
  return { DEFS, ORDRE, utiliser, nettoyer, v, defaut, surchargee, utilisees, marquer, texte, liste, groupes, surcharges: () => ({ ...surcharges }) };
})();
if (typeof module !== 'undefined') module.exports = ValeursRegl;
