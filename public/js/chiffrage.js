// Chiffrage depuis plan : la nomenclature exportée du logiciel de dessin (Revit, AutoCAD Plant 3D… : .txt, .csv, .xlsx)
// est rapprochée des familles CAO, elles-mêmes reliées à la bibliothèque de prix (article par diamètre, nombre de
// soudures, temps de préfabrication et de pose). Les heures de soudure sont calculées en pouces-diamètre (cadence
// atelier / chantier), un niveau de complexité ajuste les heures et la marge sur les achats du plan, et des chapitres
// hors plan (container, levage, manutention, nacelle…) complètent le devis généré.
const DN_POUCES = { 8: 0.25, 10: 0.375, 15: 0.5, 20: 0.75, 25: 1, 32: 1.25, 40: 1.5, 50: 2, 65: 2.5, 80: 3, 100: 4, 125: 5, 150: 6, 200: 8, 250: 10, 300: 12, 350: 14, 400: 16, 450: 18, 500: 20, 600: 24 };
const DE_DN = { 13.5: 8, 17.2: 10, 21.3: 15, 26.9: 20, 33.7: 25, 42.4: 32, 48.3: 40, 60.3: 50, 76.1: 65, 88.9: 80, 114.3: 100, 139.7: 125, 168.3: 150, 219.1: 200, 273: 250, 323.9: 300, 355.6: 350, 406.4: 400, 457: 450, 508: 500, 610: 600 };
const poucesDN = dn => DN_POUCES[dn] || num(dn) / 25;
// Diamètre lu dans la nomenclature : « DN50 », « 50 mm », « 60,3 » (diamètre extérieur), « 2" », « 100-50 » (réduction : le plus grand)
function lireDN(v) {
  const s = String(v ?? '').replace(',', '.');
  let m = /DN\s*(\d+)/i.exec(s);
  if (m) return +m[1];
  m = /(\d+(?:\.\d+)?)\s*(?:"|''|pouces?|inch|in\b)/i.exec(s);
  if (m) { const p = +m[1]; const dn = Object.keys(DN_POUCES).find(k => DN_POUCES[k] === p); return dn ? +dn : Math.round(p * 25); }
  m = /(\d+(?:\.\d+)?)/.exec(s);
  if (!m) return 0;
  const x = +m[1];
  if (DE_DN[x]) return DE_DN[x];
  if (DN_POUCES[x]) return x;
  if (x <= 12) { const dn = Object.keys(DN_POUCES).find(k => DN_POUCES[k] === x); if (dn) return +dn; }
  return Math.round(x);
}

const COLONNES_PLAN = {
  systeme: ['systeme', 'nomdusysteme', 'systemname', 'system', 'ligne', 'reseau', 'repere', 'spool', 'circuit', 'abreviationdusysteme', 'typedesysteme'],
  famille: ['famille', 'family', 'familleettype', 'familyandtype', 'objet', 'designation', 'description', 'element', 'composant'],
  type: ['type', 'typename', 'nomdutype'],
  taille: ['taille', 'size', 'diametre', 'dn', 'diametrenominal', 'nominaldiameter', 'dimension', 'diametreexterieur'],
  longueur: ['longueur', 'length', 'long', 'longueurmm', 'longueurm', 'longueurdecoupe', 'cutlength'],
  quantite: ['nombre', 'quantite', 'qte', 'count', 'qty', 'quantity', 'nb'],
  // Chapitres et sous-chapitres du devis (colonne ajoutée à la nomenclature, ex. paramètre partagé « Chapitre devis »)
  chapitre: ['chapitre', 'chapitredevis', 'lot', 'lotdevis', 'chapter', 'zone', 'batiment'],
  sousChapitre: ['souschapitre', 'souschapitredevis', 'souslot', 'sousensemble', 'sectiondevis', 'subchapter', 'niveau', 'local'],
};
const nomCol = s => normRecherche(s).replace(/[^a-z0-9]/g, '');
// En-tête : la ligne (parmi les 10 premières) qui reconnaît le plus de colonnes (les exports Revit commencent par le titre)
function analyserNomenclature(sheet) {
  let best = { score: 0, idx: 0, map: {} };
  sheet.rows.slice(0, 10).forEach((r, idx) => {
    const map = {};
    r.forEach((c, j) => { const n = nomCol(c); Object.entries(COLONNES_PLAN).forEach(([k, syn]) => { if (map[k] === undefined && syn.includes(n)) map[k] = j; }); });
    if (Object.keys(map).length > best.score) best = { score: Object.keys(map).length, idx, map };
  });
  return { entete: best.idx, colonnes: best.map, titres: sheet.rows[best.idx] || [] };
}
// cols : colonnes choisies pour le chapitre et le sous-chapitre (index ; sinon celles reconnues)
function lignesPlan(sheet, analyse, uniteLongueur, cols = {}) {
  const c = { ...analyse.colonnes };
  ['chapitre', 'sousChapitre'].forEach(k => { if (cols[k] !== undefined && cols[k] !== null) { if (cols[k] === '') delete c[k]; else c[k] = +cols[k]; } });
  const val = (r, k) => (c[k] === undefined ? '' : String(r[c[k]] ?? '').trim());
  const rows = sheet.rows.slice(analyse.entete + 1).filter(r => val(r, 'famille') || val(r, 'type'));
  const long = rows.map(r => num(String(val(r, 'longueur')).replace(/[^\d.,-]/g, '').replace(',', '.')));
  const enMm = uniteLongueur === 'mm' || (uniteLongueur !== 'm' && Math.max(0, ...long) > 60);
  return rows.map((r, i) => ({ systeme: val(r, 'systeme'), famille: val(r, 'famille'), type: val(r, 'type'), taille: val(r, 'taille'), dn: lireDN(val(r, 'taille') || val(r, 'type') || val(r, 'famille')),
    longueur: Math.round((enMm ? long[i] / 1000 : long[i]) * 1000) / 1000, qte: num(String(val(r, 'quantite')).replace(',', '.')) || 1,
    chapitre: val(r, 'chapitre'), sousChapitre: val(r, 'sousChapitre') }));
}

/* ---------- Familles CAO ---------- */
const cleFamille = s => normRecherche(s).replace(/[^a-z0-9]+/g, ' ').trim();
function familleDe(ligne) {
  const texte = cleFamille(`${ligne.famille} ${ligne.type}`), fam = cleFamille(ligne.famille);
  let best = null, lg = 0;
  Store.all('familles').forEach(f => [f.nom, ...String(f.alias || '').split(',')].map(cleFamille).filter(Boolean).forEach(k => {
    if ((fam === k || ` ${texte} `.includes(` ${k} `)) && k.length > lg) { best = f; lg = k.length; }
  }));
  return best;
}
const declinaisonDe = (f, dn) => (f ? (f.declinaisons || []).find(x => num(x.dn) === num(dn)) || (f.declinaisons || []).find(x => !num(x.dn)) : null);
const articleDe = (f, dn) => { const d = declinaisonDe(f, dn); return d ? Store.get('articles', d.articleId) : null; };
// Catégorie de la famille : le tube est compté en fourniture seule (préfabrication) et posé au mètre selon son diamètre,
// la robinetterie est posée à l'unité selon son diamètre, les raccords portent les soudures.
const CATEGORIES_FAMILLE = [['tube', 'Tube (fourniture seule, pose au mètre selon le DN)'], ['raccord', 'Raccord à souder (coude, té, bride, réduction…)'], ['robinetterie', 'Robinetterie / accessoire (pose à l\'unité selon le DN)'], ['autre', 'Supportage / autre (temps de la famille)']];
function categorieFamille(f) {
  if (!f) return 'autre';
  if (f.categorie) return f.categorie;
  const n = normRecherche(`${f.nom} ${f.alias || ''}`);
  if (/support|collier|rail/.test(n)) return 'autre';
  if (f.unite === 'ml' && /tub|tuyau|pipe|canalisation/.test(n)) return 'tube';
  if (/vanne|robinet|clapet|purgeur|filtre|valve|soupape|compteur|manometre|detendeur/.test(n)) return 'robinetterie';
  return num(f.soudures) ? 'raccord' : 'autre';
}
// Soudures par unité : celles de l'article pour ce diamètre, sinon celles de la famille (ex. coude DN50 = 2 soudures de 2")
const souduresDe = (f, dn) => { const d = declinaisonDe(f, dn); return d && d.soudures !== '' && d.soudures != null ? num(d.soudures) : num(f && f.soudures); };

/* ---------- Paramètres et calcul ---------- */
const NIVEAUX_DEFAUT = [{ nom: 'Simple (atelier, accès facile)', coef: 1, marge: 15 }, { nom: 'Standard', coef: 1.15, marge: 20 }, { nom: 'Complexe (encombré, en hauteur, en site occupé)', coef: 1.35, marge: 25 }, { nom: 'Très complexe (arrêt technique, ATEX, travail de nuit)', coef: 1.6, marge: 30 }];
const EXTRAS_TYPES = ['Container de chantier', 'Levage (grue, camion-grue)', 'Manutention', 'Nacelle', 'Échafaudage', 'Études et plans d\'exécution', 'Essais et contrôles', 'Dossier des ouvrages exécutés (DOE)', 'Transport', 'Consignation / mise en sécurité', 'Installation de chantier', 'Livraison', 'Frais annexes', 'Calorifuge', 'Sous-traitance', 'Divers'];
// Chapitres ajoutés d'un coup (« + Chapitres habituels »)
const EXTRAS_HABITUELS = ['Nacelle', 'Livraison', 'Frais annexes', 'Calorifuge', 'Sous-traitance', 'Divers'];
// Ligne d'un chapitre hors plan pré-remplie : unité, quantité, main-d'œuvre, prix de vente et coût par défaut ;
// livraison selon la zone (du devis, sinon du client) et le poids des fournitures du plan ; calorifuge sur la longueur
// de tube du plan au prix du calorifuge de la bibliothèque
function extraModele(ch, v) {
  const mo = code => (Store.all('mainoeuvre').find(m => m.code === code) || {}).id || '', r = calculerChiffrage(ch);
  const ligne = (designation, unite, qte, moId, pu, cout, heures) => ({ chapitre: v === 'libre' ? 'Prestations complémentaires' : v, designation, unite, qte, moId: moId || '', heures: moId ? (heures ?? (unite === 'h' ? 1 : 8)) : '', pu, cout });
  if (v === 'Livraison') {
    const d = Store.get('devis', ch.devisId) || {}, z = Store.get('zones', d.zoneId) || Store.get('zones', (Store.get('entreprises', d.clientId) || {}).zoneId);
    const t = Math.round(sumBy(r.liste, g => num((g.a || {}).poidsUnitaire) * g.qte)) / 1000;
    if (z) return ligne(`Livraison ${z.nom}${t ? ` (${fmt(t * 1000, 0)} kg)` : ''}`, 'forfait', 1, '', Math.round((num(z.forfait) + num(z.prixParTonne) * t) * 100) / 100, Math.round((num(z.coutTransporteur) + num(z.coutParTonne) * t) * 100) / 100);
    return ligne('Livraison sur chantier', 'forfait', 1, '', 150, 110);
  }
  if (v === 'Calorifuge') {
    const ml = Math.round(sumBy(r.liste.filter(g => g.unite === 'ml'), g => g.qte) * 10) / 10;
    const a = Store.all('articles').filter(x => /calorifu|isolant|isolation/i.test(`${x.famille} ${x.designation}`)).sort((x, y) => (x.unite === 'ml' ? 0 : 1) - (y.unite === 'ml' ? 0 : 1))[0];
    return ligne(a ? `Calorifuge : ${a.designation}` : 'Calorifuge des tuyauteries (fourniture et pose)', 'ml', ml || 1, '', a ? num(a.prixVente) : 0, a ? num(a.coutRevient) : 0);
  }
  const m = { 'Container de chantier': ['forfait', 1, '', 650, 480], 'Levage (grue, camion-grue)': ['jour', 1, '', 1250, 980], 'Manutention': ['h', 8, mo('MONT'), 0, 0],
    'Nacelle': ['semaine', 1, '', 690, 520], 'Échafaudage': ['semaine', 1, '', 400, 320], 'Études et plans d\'exécution': ['h', 16, mo('BE'), 0, 0], 'Installation de chantier': ['forfait', 1, mo('CHEF'), 0, 0],
    'Frais annexes': ['forfait', 1, '', 0, 0, 'Frais annexes (déplacements, hébergement, petites fournitures)'], 'Sous-traitance': ['forfait', 1, '', 0, 0, 'Sous-traitance (à préciser)'],
    'Divers': ['forfait', 1, '', 0, 0, 'Divers et imprévus'] }[v] || ['forfait', 1, '', 0, 0];
  return ligne(v === 'libre' ? '' : m[5] || v, m[0], m[1], m[2], m[3], m[4]);
}
const POSE_TUBE_DEFAUT = [[15, 0.25], [25, 0.3], [50, 0.4], [80, 0.5], [100, 0.6], [150, 0.85], [200, 1.1], [300, 1.6]].map(([dn, h]) => ({ dn, h }));
const POSE_ROB_DEFAUT = [[15, 0.3], [25, 0.4], [50, 0.6], [80, 0.9], [100, 1.2], [150, 1.8], [200, 2.5], [300, 4]].map(([dn, h]) => ({ dn, h }));
function parametresDefaut() {
  const mo = code => (Store.all('mainoeuvre').find(m => m.code === code) || {}).id || '';
  return { cadenceAtelier: 70, cadenceChantier: 35, partAtelier: 70, heuresJour: 7, moAtelier: mo('PREF') || mo('SOUD'), moChantier: mo('MONT') || mo('SOUD'), tauxAtelier: '', tauxPose: '', coutPose: '',
    poseTubes: POSE_TUBE_DEFAUT.map(x => ({ ...x })), poseRobinetterie: POSE_ROB_DEFAUT.map(x => ({ ...x })),
    niveaux: NIVEAUX_DEFAUT.map(n => ({ ...n })), niveau: 1, regroupement: 'systeme', uniteLongueur: 'auto' };
}
// Temps lu dans un barème par diamètre : la ligne du DN, sinon celle du diamètre supérieur le plus proche
function tempsBareme(bareme, dn) {
  const l = (bareme || []).filter(x => num(x.dn) > 0).sort((a, b) => num(a.dn) - num(b.dn));
  if (!l.length) return null;
  return num((l.find(x => num(x.dn) >= num(dn)) || l[l.length - 1]).h);
}
// Taux de vente / coût horaire : ceux saisis dans le chiffrage, sinon ceux de la catégorie de main-d'œuvre
const tauxDe = (m, vente, cout) => ({ m, vente: vente === '' || vente == null ? num(m.tauxVente) : num(vente), cout: cout === '' || cout == null ? num(m.tauxCout) : num(cout) });

// Groupes (système × famille × DN) : fourniture, heures de préfabrication (soudures atelier), heures de pose
// (tube au mètre et robinetterie selon le DN, soudures de raccordement sur site, temps de la famille sinon)
function calculerChiffrage(ch) {
  const p = { ...parametresDefaut(), ...(ch.params || {}) }, niv = p.niveaux[p.niveau] || p.niveaux[0];
  const groupes = {};
  (ch.lignes || []).forEach(l => {
    const parCol = p.regroupement === 'colonnes', chap = parCol ? l.chapitre || 'Sans chapitre' : '', sous = parCol ? l.sousChapitre || '' : '';
    const fam = familleDe(l), cle = `${p.regroupement === 'systeme' ? l.systeme : ''}|${chap}|${sous}|${fam ? fam.id : cleFamille(`${l.famille} ${l.type}`)}|${l.dn}`;
    const g = groupes[cle] = groupes[cle] || { systeme: p.regroupement === 'systeme' ? l.systeme : '', chapitre: chap, sousChapitre: sous, fam, dn: l.dn, brut: `${l.famille}${l.type ? ' : ' + l.type : ''}`, famille: l.famille, type: l.type, qte: 0, n: 0 };
    g.qte += fam && fam.unite === 'ml' ? (l.longueur || 0) * l.qte : l.qte; g.n += l.qte;
  });
  const A = tauxDe(Store.get('mainoeuvre', p.moAtelier) || {}, p.tauxAtelier), C = tauxDe(Store.get('mainoeuvre', p.moChantier) || {}, p.tauxPose, p.coutPose);
  const hj = num(p.heuresJour), part = Math.min(1, Math.max(0, num(p.partAtelier) / 100));
  const liste = Object.values(groupes).map(g => {
    const cat = categorieFamille(g.fam), a = articleDe(g.fam, g.dn), inch = poucesDN(g.dn);
    const sd = g.fam && cat !== 'tube' ? souduresDe(g.fam, g.dn) : 0;
    const poucesA = sd * part * inch, poucesC = sd * (1 - part) * inch;
    // Préfabrication : soudures réalisées en atelier + temps de la famille (le tube est en fourniture seule)
    const hA = g.fam && cat !== 'tube' ? (poucesA / Math.max(1, num(p.cadenceAtelier)) * hj + num(g.fam.tempsPrefab)) * niv.coef : 0;
    // Pose sur site : barème par DN (tube au mètre, robinetterie à l'unité), sinon temps de pose de la famille
    const bareme = cat === 'tube' ? tempsBareme(p.poseTubes, g.dn) : cat === 'robinetterie' ? tempsBareme(p.poseRobinetterie, g.dn) : null;
    const hPose = g.fam ? (bareme ?? num(g.fam.tempsPose)) * niv.coef : 0;
    const hSoudC = g.fam ? poucesC / Math.max(1, num(p.cadenceChantier)) * hj * niv.coef : 0;
    const cout = a ? num(a.coutRevient) : 0, pu = Math.round(cout * (1 + num(niv.marge) / 100) * 100) / 100;
    return { ...g, cat, a, sd, inch, qte: Math.round(g.qte * 100) / 100, unite: g.fam ? g.fam.unite || 'u' : 'u', poucesA: poucesA * g.qte, poucesC: poucesC * g.qte,
      souduresC: sd * (1 - part) * g.qte, hA, hPose, hSoudC, hC: hPose + hSoudC, cout, pu, A, C, statut: !g.fam ? 'famille' : !a ? 'article' : 'ok' };
  }).sort((x, y) => x.systeme.localeCompare(y.systeme) || x.chapitre.localeCompare(y.chapitre, 'fr', { numeric: true }) || x.sousChapitre.localeCompare(y.sousChapitre, 'fr', { numeric: true }) || (x.fam ? x.fam.nom : x.brut).localeCompare(y.fam ? y.fam.nom : y.brut) || x.dn - y.dn);
  const extras = (ch.extras || []).filter(e => e.designation && num(e.qte));
  const tot = {
    poucesA: sumBy(liste, g => g.poucesA), poucesC: sumBy(liste, g => g.poucesC), hA: sumBy(liste, g => g.hA * g.qte), hC: sumBy(liste, g => g.hC * g.qte),
    achats: sumBy(liste, g => g.cout * g.qte), fournitures: sumBy(liste, g => g.pu * g.qte),
    mo: sumBy(liste, g => (g.hA * A.vente + g.hC * C.vente) * g.qte), coutMO: sumBy(liste, g => (g.hA * A.cout + g.hC * C.cout) * g.qte),
    extras: sumBy(extras, e => num(e.qte) * (e.moId ? num(e.heures) * num((Store.get('mainoeuvre', e.moId) || {}).tauxVente) : num(e.pu))),
    coutExtras: sumBy(extras, e => num(e.qte) * (e.moId ? num(e.heures) * num((Store.get('mainoeuvre', e.moId) || {}).tauxCout) : num(e.cout))),
    manquants: liste.filter(g => g.statut !== 'ok').length,
  };
  tot.prefab = tot.fournitures + sumBy(liste, g => g.hA * A.vente * g.qte); tot.pose = sumBy(liste, g => g.hC * C.vente * g.qte);
  tot.total = tot.fournitures + tot.mo + tot.extras; tot.cout = tot.achats + tot.coutMO + tot.coutExtras;
  return { p, niv, liste, extras, tot, A, C };
}

const POUCES_TXT = x => `${fmt(x, 2).replace(/,00$/, '')}"`;
// Structure du devis : chapitres > sous-chapitres > ouvrages. Par réseau : sous-chapitres « Préfabrication atelier »
// (fournitures, tube en fourniture seule, soudures d'atelier) et « Pose sur site » ; par chapitres de la nomenclature :
// chaque matériel fourni-posé (fourniture, préfabrication, pose et soudures sur site) dans son chapitre et sous-chapitre ;
// puis les chapitres hors plan
function structureDevis(ch) {
  const { p, liste, extras, A, C } = calculerChiffrage(ch), chapitres = [];
  const mo = (t, h) => ({ type: 'mo', moId: t.m.id, libelle: t.m.libelle, heures: Math.round(h * 1000) / 1000, taux: t.vente, cout: t.cout });
  const nomDe = g => `${g.fam ? g.fam.nom : g.brut}${g.dn ? ' DN' + g.dn : ''}`;
  const fourniture = g => (g.a ? [{ type: 'f', articleId: g.a.id, designation: g.a.designation, unite: g.a.unite, qte: 1, pu: g.pu, cout: g.cout, poids: num(g.a.poidsUnitaire) }] : []);
  if (p.regroupement === 'colonnes') {
    [...new Set(liste.map(g => g.chapitre))].forEach(titre => {
      const gc = liste.filter(g => g.chapitre === titre), sous = [...new Set(gc.map(g => g.sousChapitre))];
      chapitres.push({ titre, plan: true, sous: sous.map(st => ({ titre: st, ouvrages: gc.filter(g => g.sousChapitre === st).map(g => {
        const comp = [...fourniture(g)];
        if (g.hA > 0 && A.m.id) comp.push(mo(A, g.hA));
        if (g.hC > 0 && C.m.id) comp.push(mo(C, g.hC));
        return { type: 'ouvrage', plan: ch.id, designation: g.a ? g.a.designation : nomDe(g), unite: g.unite, qte: g.qte, composants: comp,
          detail: g.cat === 'tube' ? 'Fourni-posé (préfabrication et pose)' : g.sd ? `${fmt(g.sd, 2).replace(/,00$/, '')} soudure(s) de ${POUCES_TXT(g.inch)} par ${g.unite}` : '' };
      }) })) });
    });
  } else {
    [...new Set(liste.map(g => g.systeme))].forEach(sys => {
      const gs = liste.filter(g => g.systeme === sys), prefab = [], pose = [];
      gs.forEach(g => {
        const comp = [...fourniture(g)];
        if (g.hA > 0 && A.m.id) comp.push(mo(A, g.hA));
        if (!comp.length && g.statut === 'ok') return;
        prefab.push({ type: 'ouvrage', plan: ch.id, designation: g.a ? g.a.designation : nomDe(g), unite: g.unite, qte: g.qte, composants: comp,
          detail: g.cat === 'tube' ? 'Fourniture seule' : g.sd ? `${fmt(g.sd, 2).replace(/,00$/, '')} soudure(s) de ${POUCES_TXT(g.inch)} par ${g.unite}, ${fmt(num(p.partAtelier), 0)} % en atelier` : '' });
      });
      gs.filter(g => g.hPose > 0).forEach(g => pose.push({ type: 'ouvrage', plan: ch.id, designation: g.cat === 'tube' ? `Pose tuyauterie DN${g.dn}${g.a ? ` (${g.a.designation})` : ''}` : `Pose ${nomDe(g)}`,
        unite: g.unite, qte: g.qte, composants: C.m.id ? [mo(C, g.hPose)] : [] }));
      // Soudures de raccordement sur site, regroupées par diamètre
      const parDN = {};
      gs.filter(g => g.hSoudC > 0).forEach(g => { const x = parDN[g.dn] = parDN[g.dn] || { n: 0, h: 0, inch: g.inch }; x.n += g.souduresC; x.h += g.hSoudC * g.qte; });
      Object.entries(parDN).forEach(([dn, x]) => { if (x.n > 0) pose.push({ type: 'ouvrage', plan: ch.id, designation: `Soudures de raccordement sur site DN${dn} (${POUCES_TXT(x.inch)})`, unite: 'soudure', qte: Math.round(x.n * 100) / 100,
        composants: C.m.id ? [mo(C, x.h / x.n)] : [] }); });
      chapitres.push({ titre: sys ? `Réseau ${sys}` : 'Tuyauterie (d\'après plan)', plan: true, sous: [{ titre: 'Préfabrication atelier', ouvrages: prefab }, ...(pose.length ? [{ titre: 'Pose sur site', ouvrages: pose }] : [])] });
    });
  }
  [...new Set(extras.map(e => e.chapitre || 'Prestations complémentaires'))].forEach(titre => {
    chapitres.push({ titre, plan: false, sous: [{ titre: '', ouvrages: extras.filter(e => (e.chapitre || 'Prestations complémentaires') === titre).map(e => {
      const m = Store.get('mainoeuvre', e.moId);
      return { type: 'ouvrage', plan: ch.id, designation: e.designation, unite: e.unite || 'forfait', qte: num(e.qte),
        composants: m ? [mo(tauxDe(m), num(e.heures))] : [{ type: 'f', articleId: e.articleId || '', designation: e.designation, unite: e.unite || 'forfait', qte: 1, pu: num(e.pu), cout: num(e.cout), poids: 0 }] };
    }) }] });
  });
  return chapitres;
}
// Présentation d'un chapitre dans le devis : détaillé (chaque matériel), regroupé (une ligne par sous-chapitre), ou
// une seule ligne pour tout le chapitre. Les composants (fournitures, heures) sont cumulés : prix et marge identiques.
const PRESENTATIONS = [['detail', 'Détaillé (chaque matériel)'], ['sous', 'Une ligne par sous-chapitre'], ['global', 'Une seule ligne pour le chapitre']];
function cumulerOuvrages(ouvrages, designation, plan, detail) {
  const comp = [];
  ouvrages.forEach(o => (o.composants || []).forEach(c => {
    const qte = num(c.type === 'mo' ? c.heures : c.qte) * num(o.qte), k = c.type === 'mo' ? `mo|${c.moId}|${c.taux}|${c.cout}` : `f|${c.articleId || c.designation}|${c.pu}|${c.cout}`, ex = comp.find(x => x._k === k);
    if (ex) { if (c.type === 'mo') ex.heures = Math.round((ex.heures + qte) * 1000) / 1000; else ex.qte = Math.round((ex.qte + qte) * 1000) / 1000; }
    else comp.push(c.type === 'mo' ? { ...c, heures: Math.round(qte * 1000) / 1000, _k: k } : { ...c, qte: Math.round(qte * 1000) / 1000, _k: k });
  }));
  // Matériel sans prix (non relié à la bibliothèque) : signalé, à chiffrer
  const sans = ouvrages.filter(o => !(o.composants || []).length).map(o => o.designation);
  return { type: 'ouvrage', plan, designation, unite: 'ens', qte: 1, composants: comp.map(({ _k, ...c }) => c), detail: sans.length ? `${detail}${detail ? ' — ' : ''}À chiffrer : ${sans.join(', ')}` : detail };
}
function lignesDevisDepuis(ch) {
  const pres = ((ch.params || {}).presentation) || {}, out = [];
  structureDevis(ch).forEach(chap => {
    const mode = pres[chap.titre] || 'detail', sous = chap.sous.filter(s => s.ouvrages.length);
    if (!sous.length) return;
    out.push({ type: 'chapitre', niveau: 1, titre: chap.titre, plan: ch.id });
    if (mode === 'global') {
      const tous = sous.flatMap(s => s.ouvrages), noms = sous.map(s => s.titre).filter(Boolean);
      out.push(cumulerOuvrages(tous, chap.titre, ch.id, noms.length ? noms.join(' · ') : `${tous.length} article(s)`));
      return;
    }
    sous.forEach(s => {
      if (mode === 'sous' && s.titre) { out.push(cumulerOuvrages(s.ouvrages, s.titre, ch.id, s.ouvrages.map(o => `${o.designation} × ${fmt(o.qte, 2).replace(/,00$/, '')} ${o.unite}`).join(' · ').slice(0, 900))); return; }
      if (s.titre) out.push({ type: 'chapitre', niveau: 2, titre: s.titre, plan: ch.id });
      out.push(...s.ouvrages);
    });
  });
  return out;
}

/* ---------- Écrans ---------- */
function devisTabs(actif) {
  return `<div class="tabs"><a href="#/devis" class="${actif === 'devis' ? 'active' : ''}">Devis</a><a href="#/chiffrages" class="${actif === 'chiffrages' ? 'active' : ''}">Chiffrage depuis plan <span class="count">${Store.all('chiffrages').length}</span></a><a href="#/visites" class="${actif === 'visites' ? 'active' : ''}">📐 Visites (prises de cotes) <span class="count">${(Store.all('releves') || []).filter(r => !r.affaireId).length}</span></a></div>`;
}
Views.chiffrages = () => `<h1>Devis</h1>${devisTabs('chiffrages')}
  <p class="muted">Importez la nomenclature exportée de votre logiciel de dessin (Revit : Exporter → Rapports → Nomenclature, fichier .txt ; ou .csv / .xlsx) :
    chaque élément est relié à une famille CAO de la bibliothèque (article et nombre de soudures par diamètre). La préfabrication atelier compte les fournitures
    (le tube en fourniture seule) et les soudures en pouces-diamètre ; la pose sur site a son propre taux horaire et ses temps par diamètre (tube au mètre,
    robinetterie à l'unité). Le devis est rangé par chapitres et sous-chapitres lus dans la nomenclature (ou par réseau), avec les chapitres hors plan ;
    chaque chapitre est détaillé, regroupé par sous-chapitre ou en une seule ligne. Glissez la nomenclature directement sur un devis pour le chiffrer.</p>
  <div class="toolbar"><button id="ch-new">+ Nouveau chiffrage</button><a class="btn secondary" href="#/familles">Familles CAO (${Store.all('familles').length})</a></div>
  ${Store.all('chiffrages').length ? `<div class="table-wrap"><table data-colonnes="chiffrages"><tr><th>Chiffrage</th><th>Devis</th><th>Client</th><th class="num">Éléments</th><th class="num">Pouces atelier / chantier</th><th class="num">Total HT</th><th class="num">Marge</th></tr>
    ${Store.all('chiffrages').map(ch => { const r = calculerChiffrage(ch), d = Store.get('devis', ch.devisId) || {};
      return `<tr class="clickable" data-go="#/chiffrage/${ch.id}"><td>${esc(ch.nom || 'Sans titre')}${r.tot.manquants ? ` <span class="badge b-warn">${r.tot.manquants} à relier</span>` : ''}</td><td>${esc(d.numero || '')}</td><td>${esc(clientName(docClientId(d)))}</td>
        <td class="num">${(ch.lignes || []).length}</td><td class="num">${fmt(r.tot.poucesA, 0)} / ${fmt(r.tot.poucesC, 0)}</td><td class="num">${eur(r.tot.total)}</td><td class="num">${r.tot.total ? marginBadge((r.tot.total - r.tot.cout) / r.tot.total * 100) : '—'}</td></tr>`; }).join('')}</table></div>`
  : '<p class="muted">Aucun chiffrage. Créez-en un, ou ouvrez un devis et cliquez sur « Chiffrage depuis plan ».</p>'}`;
Views.chiffrages.bind = root => { root.querySelector('#ch-new').onclick = () => { const ch = nouveauChiffrage(''); location.hash = `#/chiffrage/${ch.id}`; }; };

function nouveauChiffrage(devisId) {
  const d = Store.get('devis', devisId);
  // Paramètres (cadences, taux, barèmes de pose) repris du dernier chiffrage
  const dernier = Store.all('chiffrages').slice(-1)[0];
  const params = dernier ? { ...parametresDefaut(), ...JSON.parse(JSON.stringify(dernier.params || {})) } : parametresDefaut();
  return Store.upsert('chiffrages', { nom: d ? (d.objet || d.numero || 'Chiffrage') : 'Nouveau chiffrage', devisId: devisId || '', fichier: '', lignes: [], extras: [], params });
}
// Import d'une nomenclature (fichier .txt, .csv, .tsv, .xlsx) dans un chiffrage
async function importerNomenclature(ch, file) {
  const buf = await file.arrayBuffer(), sheets = /\.xlsx$/i.test(file.name) ? await XLSX.read(buf) : XLSX.readCSV(buf);
  return chargerNomenclature(ch, file.name, sheets.sort((a, b) => b.rows.length - a.rows.length)[0]);
}
function chargerNomenclature(ch, nom, sheet) {
  const an = analyserNomenclature(sheet);
  if (an.colonnes.famille === undefined && an.colonnes.type === undefined) throw new Error('Colonnes « Famille » ou « Type » introuvables dans la nomenclature.');
  ch.params = { ...parametresDefaut(), ...(ch.params || {}) };
  // Colonne de chapitre reconnue : regroupement par chapitres de la nomenclature
  if (an.colonnes.chapitre !== undefined) { ch.params.regroupement = 'colonnes'; ch.params.colChapitre = String(an.colonnes.chapitre); ch.params.colSousChapitre = an.colonnes.sousChapitre !== undefined ? String(an.colonnes.sousChapitre) : ''; }
  Object.assign(ch, { fichier: nom, sheet, colonnes: Object.fromEntries(Object.entries(an.colonnes).map(([k, j]) => [k, an.titres[j]])), lignes: lignesPlan(sheet, an, ch.params.uniteLongueur, colsDe(ch)) });
  Store.upsert('chiffrages', ch);
  return ch.lignes.length;
}
const colsDe = ch => (ch.params && ch.params.regroupement === 'colonnes' ? { chapitre: ch.params.colChapitre ?? '', sousChapitre: ch.params.colSousChapitre ?? '' } : {});
// Colonnes de la nomenclature (titres) pour le choix du chapitre et du sous-chapitre
const titresNomenclature = ch => (ch.sheet ? (ch.sheet.rows[analyserNomenclature(ch.sheet).entete] || []).map(String) : []);
function ouvrirChiffrage(devisId) {
  const ch = Store.all('chiffrages').find(c => c.devisId === devisId) || nouveauChiffrage(devisId);
  location.hash = `#/chiffrage/${ch.id}`;
}

Views.chiffrage = params => {
  const ch = Store.get('chiffrages', params[0]);
  if (!ch) return '<p>Chiffrage introuvable. <a href="#/chiffrages">Retour</a></p>';
  const r = calculerChiffrage(ch), p = r.p, d = Store.get('devis', ch.devisId), t = r.tot;
  const moOpts = sel => options(Store.all('mainoeuvre'), sel, m => m.libelle, false);
  const marge = t.total ? (t.total - t.cout) / t.total * 100 : 0;
  return `<div class="toolbar"><a href="#/chiffrages" class="btn secondary">← Chiffrages</a>${d ? `<a class="btn secondary" href="#/devis/${d.id}">Devis ${esc(d.numero || '')}</a>` : ''}<span class="spacer"></span>
    <button class="danger" id="ch-del">Supprimer</button><button class="secondary" id="ch-cs" ${r.liste.some(g => g.a) ? '' : 'disabled'}>Consulter les fournisseurs</button><button id="ch-gen" ${(ch.lignes || []).length || r.extras.length ? '' : 'disabled'}>${d ? 'Mettre à jour le devis' : 'Créer le devis'}</button></div>
  <h1>Chiffrage depuis plan</h1>
  <div class="card"><div class="grid2">
    <div class="field"><label for="ch-nom">Intitulé</label><input id="ch-nom" value="${esc(ch.nom || '')}"></div>
    <div class="field"><label for="ch-devis">Devis à alimenter</label><select id="ch-devis"><option value="">Nouveau devis</option>${options(Store.all('devis').filter(x => x.statut !== 'Accepté' && !x.archive || x.id === ch.devisId), ch.devisId, x => `${x.numero || '…'} – ${x.objet || ''}`, false)}</select></div>
  </div></div>

  <h2>1. Nomenclature du plan</h2>
  <div class="ch-depot" id="ch-depot">📥 <strong>Glissez ici la nomenclature extraite de Revit</strong> (.txt, .csv ou .xlsx) — une ligne par pièce (occurrence) ou par type avec sa quantité ; les colonnes « Chapitre » et « Sous-chapitre » ajoutées dans Revit rangent le devis.</div>
  <div class="toolbar">
    <label class="btn secondary">${(ch.lignes || []).length ? 'Remplacer la nomenclature' : 'Importer la nomenclature (.txt, .csv, .xlsx)'}<input type="file" id="ch-file" accept=".txt,.csv,.tsv,.xlsx" hidden></label>
    ${document.body.classList.contains('demo') ? '<button class="secondary" id="ch-exemple">Nomenclature d\'exemple (Revit)</button>' : ''}
    <label class="inline small">Longueurs <select id="ch-ul"><option value="auto" ${p.uniteLongueur === 'auto' ? 'selected' : ''}>détection auto</option><option value="mm" ${p.uniteLongueur === 'mm' ? 'selected' : ''}>en mm</option><option value="m" ${p.uniteLongueur === 'm' ? 'selected' : ''}>en m</option></select></label>
    <label class="inline small">Chapitres du devis <select id="ch-grp"><option value="colonnes" ${p.regroupement === 'colonnes' ? 'selected' : ''}>colonnes de la nomenclature (chapitre / sous-chapitre)</option><option value="systeme" ${p.regroupement === 'systeme' ? 'selected' : ''}>par réseau / système (préfabrication et pose)</option><option value="" ${!['systeme', 'colonnes'].includes(p.regroupement) ? 'selected' : ''}>tout ensemble</option></select></label>
  </div>
  ${p.regroupement === 'colonnes' && ch.sheet ? (() => { const tt = titresNomenclature(ch), sel = (id, v) => `<select id="${id}"><option value="">— aucune —</option>${tt.map((x, j) => `<option value="${j}" ${String(v) === String(j) ? 'selected' : ''}>${esc(x || `Colonne ${j + 1}`)}</option>`).join('')}</select>`;
    return `<div class="toolbar"><label class="inline small">Colonne des chapitres ${sel('ch-colc', p.colChapitre)}</label><label class="inline small">Colonne des sous-chapitres ${sel('ch-cols', p.colSousChapitre)}</label></div>`; })() : ''}
  ${ch.fichier ? `<p class="muted small">${esc(ch.fichier)} · ${(ch.lignes || []).length} ligne(s) · colonnes reconnues : ${esc(Object.keys(ch.colonnes || {}).join(', '))}</p>` : ''}

  ${r.liste.length ? `<h2>2. Correspondance avec la bibliothèque ${t.manquants ? `<span class="badge b-warn">${t.manquants} à relier</span>` : '<span class="badge b-ok">complète</span>'}</h2>
  <div class="table-wrap"><table class="compact ch-table"><tr><th>${p.regroupement === 'colonnes' ? 'Chapitre / sous-chapitre' : 'Réseau'}</th><th>Élément du plan</th><th>DN</th><th class="num">Qté</th><th>Famille CAO / article</th><th class="num">Soudures / u</th><th class="num">Pouces atelier / chantier</th><th class="num">h préfab / u</th><th class="num">h pose / u</th><th class="num">Achat / u</th><th class="num">Vente / u</th></tr>
    ${r.liste.map((g, i) => `<tr class="${g.statut !== 'ok' ? 'a-chiffrer' : ''}"><td class="small">${esc(p.regroupement === 'colonnes' ? [g.chapitre, g.sousChapitre].filter(Boolean).join(' › ') : g.systeme)}</td><td>${esc(g.fam ? g.fam.nom : g.brut)}</td><td>${g.dn || ''}</td><td class="num">${fmt(g.qte, 2)} ${esc(g.unite)}</td>
      <td>${g.statut === 'ok' ? `<span class="small">${esc(g.a.ref)} · ${esc(g.a.designation)}</span> <button class="icon small" data-modif-art="${i}" title="Modifier l'article (prix, désignation) dans la bibliothèque">✎</button>`
        : `<button class="small" data-nouvel-art="${i}" title="Article créé dans la bibliothèque et relié à cet élément du plan : reconnu au prochain import">➕ Créer l'article</button> ${g.statut === 'famille' ? `<button class="small secondary" data-creer="${i}">Famille CAO…</button>` : `<button class="small secondary" data-relier="${i}">Article existant DN${g.dn}…</button>`}`}</td>
      <td class="num small">${g.cat === 'tube' ? '<span class="muted">fourniture seule</span>' : g.sd ? `${fmt(g.sd, 2).replace(/,00$/, '')} × ${POUCES_TXT(g.inch)}` : '—'}</td>
      <td class="num">${fmt(g.poucesA, 1)} / ${fmt(g.poucesC, 1)}</td><td class="num">${fmt(g.hA, 2)}</td><td class="num" title="pose ${fmt(g.hPose, 2)} h + soudures sur site ${fmt(g.hSoudC, 2)} h">${fmt(g.hC, 2)}</td><td class="num">${g.a ? eur(g.cout) : '—'}</td><td class="num">${g.a ? eur(g.pu) : '—'}</td></tr>`).join('')}</table></div>` : ''}

  <h2>3. Paramètres du chiffrage</h2>
  <div class="card">
  <div class="ch-params">
    <div><h3 style="margin-top:0">Préfabrication atelier</h3>
      <p class="muted small">Fournitures du plan (le tube en fourniture seule) et soudures des raccords réalisées en atelier.</p>
      <div class="field"><label for="cp-cA">Cadence atelier (pouces / jour / soudeur)</label><input id="cp-cA" data-p="cadenceAtelier" type="number" step="1" value="${esc(p.cadenceAtelier)}"></div>
      <div class="field"><label for="cp-part">Soudures réalisées en atelier (%)</label><input id="cp-part" data-p="partAtelier" type="number" step="5" min="0" max="100" value="${esc(p.partAtelier)}"></div>
      <div class="field"><label for="cp-hj">Heures par jour</label><input id="cp-hj" data-p="heuresJour" type="number" step="0.5" value="${esc(p.heuresJour)}"></div>
      <div class="field"><label for="cp-moA">Main-d'œuvre atelier</label><select id="cp-moA" data-p="moAtelier">${moOpts(p.moAtelier)}</select></div>
      <div class="field"><label for="cp-tA">Taux horaire atelier €/h <span class="muted small">(vide = ${eur(num((Store.get('mainoeuvre', p.moAtelier) || {}).tauxVente))})</span></label><input id="cp-tA" data-p="tauxAtelier" data-vide="1" type="number" step="0.5" value="${esc(p.tauxAtelier ?? '')}"></div>
    </div>
    <div><h3 style="margin-top:0">Pose sur site</h3>
      <p class="muted small">Pose des tubes au mètre et de la robinetterie à l'unité selon le diamètre, soudures de raccordement restantes.</p>
      <div class="field"><label for="cp-moC">Main-d'œuvre de pose</label><select id="cp-moC" data-p="moChantier">${moOpts(p.moChantier)}</select></div>
      <div class="grid2" style="gap:0 10px">
        <div class="field"><label for="cp-tC">Taux de vente pose €/h <span class="muted small">(vide = ${eur(num((Store.get('mainoeuvre', p.moChantier) || {}).tauxVente))})</span></label><input id="cp-tC" data-p="tauxPose" data-vide="1" type="number" step="0.5" value="${esc(p.tauxPose ?? '')}"></div>
        <div class="field"><label for="cp-kC">Coût horaire pose €/h <span class="muted small">(vide = ${eur(num((Store.get('mainoeuvre', p.moChantier) || {}).tauxCout))})</span></label><input id="cp-kC" data-p="coutPose" data-vide="1" type="number" step="0.5" value="${esc(p.coutPose ?? '')}"></div>
      </div>
      <div class="field"><label for="cp-cC">Cadence soudure sur site (pouces / jour / soudeur)</label><input id="cp-cC" data-p="cadenceChantier" type="number" step="1" value="${esc(p.cadenceChantier)}"></div>
      <div class="baremes">
        ${[['poseTubes', 'Pose des tubes', 'h / ml'], ['poseRobinetterie', 'Pose de la robinetterie', 'h / u']].map(([k, titre, u]) => `<div><table class="compact bareme"><tr><th>${titre}</th><th class="num">${u}</th><th></th></tr>
          ${(p[k] || []).map((x, i) => `<tr><td>DN <input data-bar="${k}" data-i="${i}" data-k="dn" type="number" value="${esc(x.dn)}" style="width:70px" aria-label="DN"></td><td class="num"><input data-bar="${k}" data-i="${i}" data-k="h" type="number" step="0.05" value="${esc(x.h)}" style="width:70px" aria-label="Heures"></td><td><button class="small danger" data-bardel="${k}|${i}" aria-label="Retirer">✕</button></td></tr>`).join('')}
          </table><button class="secondary small" data-baradd="${k}">+ Diamètre</button></div>`).join('')}
      </div>
      <p class="muted small">Pour un diamètre absent du barème, le temps du diamètre supérieur le plus proche est retenu.</p>
    </div>
  </div>
  <h3>Complexité du chantier</h3>
  <div class="table-wrap"><table class="compact"><tr><th></th><th>Niveau</th><th class="num">Coefficient sur les heures</th><th class="num">Marge sur les achats du plan (%)</th></tr>
    ${p.niveaux.map((n, i) => `<tr><td><input type="radio" name="ch-niv" value="${i}" ${+p.niveau === i ? 'checked' : ''} aria-label="${esc(n.nom)}"></td><td><input data-niv="${i}" data-k="nom" value="${esc(n.nom)}"></td>
      <td class="num"><input data-niv="${i}" data-k="coef" type="number" step="0.05" value="${esc(n.coef)}" style="width:90px"></td><td class="num"><input data-niv="${i}" data-k="marge" type="number" step="1" value="${esc(n.marge)}" style="width:90px"></td></tr>`).join('')}</table></div></div>

  <h2>4. Chapitres hors plan</h2>
  <div class="table-wrap"><table class="compact ch-extras"><tr><th>Chapitre</th><th>Désignation</th><th>Unité</th><th class="num">Qté</th><th>Main-d'œuvre</th><th class="num">Heures / u</th><th class="num">PU vente</th><th class="num">Coût / u</th><th></th></tr>
    ${(ch.extras || []).map((e, i) => `<tr data-x="${i}"><td><input data-k="chapitre" value="${esc(e.chapitre || '')}" list="ch-chaps"></td><td><input data-k="designation" value="${esc(e.designation || '')}"></td><td><input data-k="unite" value="${esc(e.unite || '')}" style="width:80px"></td>
      <td class="num"><input data-k="qte" type="number" step="any" value="${esc(e.qte ?? '')}" style="width:70px"></td><td><select data-k="moId"><option value="">— (fourniture / prestation)</option>${options(Store.all('mainoeuvre'), e.moId, m => m.libelle, false)}</select></td>
      <td class="num"><input data-k="heures" type="number" step="0.5" value="${esc(e.heures ?? '')}" style="width:70px" ${e.moId ? '' : 'disabled'}></td><td class="num"><input data-k="pu" type="number" step="0.01" value="${esc(e.pu ?? '')}" style="width:90px" ${e.moId ? 'disabled' : ''}></td>
      <td class="num"><input data-k="cout" type="number" step="0.01" value="${esc(e.cout ?? '')}" style="width:90px" ${e.moId ? 'disabled' : ''}></td><td><button class="small danger" data-xdel="${i}" aria-label="Retirer">✕</button></td></tr>`).join('') || '<tr><td colspan="9" class="muted">Aucun chapitre complémentaire.</td></tr>'}</table></div>
  <datalist id="ch-chaps">${EXTRAS_TYPES.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
  <div class="toolbar"><select id="ch-xadd" style="width:auto"><option value="">+ Ajouter…</option>${EXTRAS_TYPES.map(x => `<option>${esc(x)}</option>`).join('')}<option value="libre">Autre (libre)</option></select>
    <button class="secondary small" id="ch-xhab" title="${esc(EXTRAS_HABITUELS.join(', '))}">+ Chapitres habituels (nacelle, livraison, frais annexes, calorifuge, sous-traitance, divers)</button></div>

  ${(() => { const chaps = structureDevis(ch).filter(c => c.sous.some(x => x.ouvrages.length)), pres = p.presentation || {};
    return chaps.length ? `<h2>5. Présentation du devis</h2><p class="small muted">Pour chaque chapitre : le détail de chaque matériel, une ligne par sous-chapitre, ou une seule ligne pour tout le chapitre. Le prix et la marge ne changent pas ; « Mettre à jour le devis » applique le choix.</p>
      <div class="table-wrap"><table class="compact ch-pres"><tr><th>Chapitre</th><th class="num">Sous-chapitres</th><th class="num">Lignes détaillées</th><th>Présentation dans le devis</th></tr>
      ${chaps.map(c => { const sc = c.sous.filter(x => x.ouvrages.length); return `<tr><td><strong>${esc(c.titre)}</strong>${sc.filter(x => x.titre).length ? `<br><span class="small muted">${esc(sc.map(x => x.titre).filter(Boolean).join(' · '))}</span>` : ''}</td><td class="num">${sc.filter(x => x.titre).length || '—'}</td><td class="num">${sc.reduce((n, x) => n + x.ouvrages.length, 0)}</td>
        <td><select data-pres="${esc(c.titre)}">${PRESENTATIONS.filter(([k]) => k !== 'sous' || sc.some(x => x.titre)).map(([k, l]) => `<option value="${k}" ${(pres[c.titre] || 'detail') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td></tr>`; }).join('')}
      </table></div><div class="toolbar"><button class="small secondary" data-pres-tout="detail">Tout détailler</button><button class="small secondary" data-pres-tout="sous">Tout par sous-chapitre</button><button class="small secondary" data-pres-tout="global">Tout en une ligne par chapitre</button></div>` : ''; })()}

  <h2>Synthèse</h2>
  <div class="cards">
    <div class="card"><div class="label">Soudures</div><div class="value">${fmt(t.poucesA + t.poucesC, 0)} pouces</div><div class="sub">atelier ${fmt(t.poucesA, 0)} · chantier ${fmt(t.poucesC, 0)}</div></div>
    <div class="card"><div class="label">Préfabrication atelier</div><div class="value">${eur(t.prefab)}</div><div class="sub">${fmt(t.hA, 1)} h à ${eur(r.A.vente)}/h + fournitures · coef ${fmt(r.niv.coef, 2)}</div></div>
    <div class="card"><div class="label">Pose sur site</div><div class="value">${eur(t.pose)}</div><div class="sub">${fmt(t.hC, 1)} h à ${eur(r.C.vente)}/h</div></div>
    <div class="card"><div class="label">Fournitures du plan</div><div class="value">${eur(t.fournitures)}</div><div class="sub">achat ${eur(t.achats)} · marge ${fmt(r.niv.marge, 0)} %</div></div>
    <div class="card"><div class="label">Total HT</div><div class="value">${eur(t.total)}</div><div class="sub">MO ${eur(t.mo)} · hors plan ${eur(t.extras)} · ${marginBadge(marge)} marge</div></div>
  </div>`;
};

Views.chiffrage.bind = (root, params) => {
  const ch = Store.get('chiffrages', params[0]);
  if (!ch) return;
  ch.params = { ...parametresDefaut(), ...(ch.params || {}) }; ch.extras = ch.extras || [];
  const save = (rerender = true) => { Store.upsert('chiffrages', ch); if (rerender) App.render(); };
  const q = s => root.querySelector(s);
  q('#ch-nom').onchange = e => { ch.nom = e.target.value; save(false); };
  q('#ch-devis').onchange = e => { ch.devisId = e.target.value; save(); };
  const relire = () => { if (ch.sheet) ch.lignes = lignesPlan(ch.sheet, analyserNomenclature(ch.sheet), ch.params.uniteLongueur, colsDe(ch)); };
  q('#ch-ul').onchange = e => { ch.params.uniteLongueur = e.target.value; relire(); save(); };
  q('#ch-grp').onchange = e => {
    ch.params.regroupement = e.target.value;
    if (e.target.value === 'colonnes' && ch.sheet && ch.params.colChapitre === undefined) { const an = analyserNomenclature(ch.sheet); ch.params.colChapitre = an.colonnes.chapitre !== undefined ? String(an.colonnes.chapitre) : ''; ch.params.colSousChapitre = an.colonnes.sousChapitre !== undefined ? String(an.colonnes.sousChapitre) : ''; }
    relire(); save();
  };
  const cc = q('#ch-colc'); if (cc) cc.onchange = e => { ch.params.colChapitre = e.target.value; relire(); save(); };
  const cs2 = q('#ch-cols'); if (cs2) cs2.onchange = e => { ch.params.colSousChapitre = e.target.value; relire(); save(); };
  const charger = (nom, sheet) => { try { const n = chargerNomenclature(ch, nom, sheet); App.render(); App.toast(`${n} élément(s) importé(s)`); } catch (err) { notify(err.message); } };
  const importer = async file => { try { const n = await importerNomenclature(ch, file); App.render(); App.toast(`${n} élément(s) importé(s) de ${file.name}`); } catch (err) { notify('Lecture impossible : ' + err.message); } };
  q('#ch-file').onchange = e => { const file = e.target.files[0]; e.target.value = ''; if (file) importer(file); };
  // Glisser-déposer de la nomenclature sur la page
  const zone = q('#ch-depot');
  root.ondragover = e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); zone.classList.add('survol'); } };
  root.ondragleave = e => { if (!root.contains(e.relatedTarget)) zone.classList.remove('survol'); };
  root.ondrop = e => { const f = [...(e.dataTransfer.files || [])].find(x => /\.(txt|csv|tsv|xlsx)$/i.test(x.name)); if (!f) return; e.preventDefault(); zone.classList.remove('survol'); importer(f); };
  // Présentation des chapitres dans le devis
  root.querySelectorAll('[data-pres]').forEach(el => el.onchange = () => { ch.params.presentation = { ...(ch.params.presentation || {}), [el.dataset.pres]: el.value }; save(false); });
  root.querySelectorAll('[data-pres-tout]').forEach(b => b.onclick = () => { const v = b.dataset.presTout; ch.params.presentation = Object.fromEntries(structureDevis(ch).map(c => [c.titre, v === 'sous' && !c.sous.some(x => x.titre) ? 'detail' : v])); save(); });
  const ex = q('#ch-exemple');
  if (ex) ex.onclick = () => charger('Nomenclature tuyauterie (exemple Revit).txt', XLSX.readCSV(new TextEncoder().encode(nomenclatureExemple()).buffer)[0]);
  root.querySelectorAll('[data-p]').forEach(el => el.onchange = () => { ch.params[el.dataset.p] = el.tagName === 'SELECT' || (el.dataset.vide && el.value === '') ? el.value : num(el.value); save(); });
  root.querySelectorAll('[data-bar]').forEach(el => el.onchange = () => { ch.params[el.dataset.bar][+el.dataset.i][el.dataset.k] = num(el.value); ch.params[el.dataset.bar].sort((a, b) => num(a.dn) - num(b.dn)); save(); });
  root.querySelectorAll('[data-bardel]').forEach(b => b.onclick = () => { const [k, i] = b.dataset.bardel.split('|'); ch.params[k].splice(+i, 1); save(); });
  root.querySelectorAll('[data-baradd]').forEach(b => b.onclick = () => { const l = ch.params[b.dataset.baradd] = ch.params[b.dataset.baradd] || []; const der = l[l.length - 1]; l.push({ dn: der ? num(der.dn) * 2 : 50, h: der ? num(der.h) : 0.5 }); save(); });
  root.querySelectorAll('[name="ch-niv"]').forEach(el => el.onchange = () => { ch.params.niveau = +el.value; save(); });
  root.querySelectorAll('[data-niv]').forEach(el => el.onchange = () => { const n = ch.params.niveaux[+el.dataset.niv]; n[el.dataset.k] = el.dataset.k === 'nom' ? el.value : num(el.value); save(); });
  root.querySelectorAll('.ch-extras tr[data-x] [data-k]').forEach(el => el.onchange = () => {
    const e = ch.extras[+el.closest('tr').dataset.x];
    e[el.dataset.k] = ['qte', 'heures', 'pu', 'cout'].includes(el.dataset.k) ? num(el.value) : el.value;
    save(el.dataset.k === 'moId');
  });
  root.querySelectorAll('[data-xdel]').forEach(b => b.onclick = () => { ch.extras.splice(+b.dataset.xdel, 1); save(); });
  q('#ch-xadd').onchange = e => {
    const v = e.target.value;
    if (!v) return;
    ch.extras.push(extraModele(ch, v));
    save();
  };
  // Chapitres habituels absents du chiffrage, ajoutés d'un coup (quantités et prix à ajuster)
  q('#ch-xhab').onclick = () => {
    const manquants = EXTRAS_HABITUELS.filter(v => !ch.extras.some(e => e.chapitre === v));
    if (!manquants.length) return App.toast('Les chapitres habituels sont déjà dans le chiffrage');
    manquants.forEach(v => ch.extras.push(extraModele(ch, v)));
    save(); App.toast(`${manquants.length} chapitre(s) ajouté(s) : ajustez quantités et prix`);
  };
  // Liaisons manquantes : création de la famille CAO ou choix de l'article pour le diamètre
  const r = calculerChiffrage(ch);
  root.querySelectorAll('[data-creer]').forEach(b => b.onclick = () => { const g = r.liste[+b.dataset.creer]; editerFamille({ nom: g.brut.split(' : ')[0], alias: g.brut, unite: /tuyau|tube|pipe/i.test(g.brut) ? 'ml' : 'u', soudures: /coude|elbow/i.test(g.brut) ? 2 : /t[ée]\b|tee/i.test(g.brut) ? 3 : /bride|flange/i.test(g.brut) ? 1 : /r[ée]duction|reducer/i.test(g.brut) ? 2 : 0, tempsPrefab: 0.1, tempsPose: 0.1, declinaisons: [{ dn: g.dn, articleId: '' }] }); });
  root.querySelectorAll('[data-nouvel-art]').forEach(b => b.onclick = () => articleDepuisPlan(r.liste[+b.dataset.nouvelArt], ch, () => { relire(); save(); }));
  root.querySelectorAll('[data-modif-art]').forEach(b => b.onclick = () => { const g = r.liste[+b.dataset.modifArt]; if (typeof editArticle === 'function') editArticle({ ...g.a }); });
  root.querySelectorAll('[data-relier]').forEach(b => b.onclick = () => { const g = r.liste[+b.dataset.relier]; const f = { ...g.fam, declinaisons: [...(g.fam.declinaisons || []), { dn: g.dn, articleId: '' }] }; editerFamille(f); });
  q('#ch-gen').onclick = async () => {
    const lignes = lignesDevisDepuis(ch), t = calculerChiffrage(ch).tot;
    if (t.manquants && !await ask(`${t.manquants} élément(s) ne sont pas reliés à la bibliothèque : ils seront « à chiffrer » dans le devis. Continuer ?`, 'Générer', false)) return;
    let d = Store.get('devis', ch.devisId);
    if (!d) { d = newDevis({ objet: ch.nom, ...(ch.clientId ? { clientId: ch.clientId } : {}) }); ch.devisId = d.id; }
    if (d.statut === 'Accepté') return notify('Ce devis est accepté : dupliquez-le pour chiffrer un avenant.');
    d.lignes = [...lignes, ...(d.lignes || []).filter(l => l.plan !== ch.id)];
    Store.upsert('devis', d); save(false);
    location.hash = `#/devis/${d.id}`;
    App.toast(`Devis mis à jour : ${lignes.filter(l => Calc.estPrix(l)).length} ouvrage(s) depuis le plan`, 4000);
  };
  q('#ch-cs').onclick = () => {
    const d = Store.get('devis', ch.devisId) || {}, lignes = [];
    calculerChiffrage(ch).liste.filter(g => g.a).forEach(g => { const ex = lignes.find(x => x.articleId === g.a.id); if (ex) ex.qte = Math.round((ex.qte + g.qte) * 100) / 100; else lignes.push({ articleId: g.a.id, designation: g.a.designation, unite: g.a.unite, qte: g.qte }); });
    const fs = [...new Set(lignes.map(l => (Store.get('articles', l.articleId) || {}).fournisseurId).filter(Boolean))].map(eid => ({ entrepriseId: eid, statut: 'À consulter' }));
    const cs = nouvelleConsultation({ objet: ch.nom, affaireId: d.affaireId || '', lignes, fournisseurs: fs });
    location.hash = `#/consultations/${cs.id}`;
  };
  q('#ch-del').onclick = () => ask('Supprimer ce chiffrage ? Le devis déjà généré est conservé.', 'Supprimer').then(ok => { if (ok) { Store.remove('chiffrages', ch.id); location.hash = '#/chiffrages'; } });
};

/* ---------- Bibliothèque → Familles CAO ---------- */
Views.familles = () => `<h1>Bibliothèque</h1>${biblioTabs('familles')}
  <p class="muted">Familles du logiciel de dessin reliées à la bibliothèque de prix : l'article est choisi selon le diamètre de l'élément et porte son nombre de soudures (ex. coude DN50 = 2 soudures de 2"). Le tube est compté en fourniture seule en préfabrication ; sa pose et celle de la robinetterie se calculent au diamètre (barèmes du chiffrage). Le nom et les synonymes servent à reconnaître les éléments de la nomenclature.</p>
  <div class="toolbar"><button id="fam-add">+ Famille</button></div>
  <div class="table-wrap"><table><tr><th>Famille</th><th>Catégorie</th><th>Unité</th><th class="num">Soudures</th><th class="num">Préfab. h</th><th class="num">Pose h</th><th>Articles par diamètre (soudures × pouces)</th></tr>
    ${Store.all('familles').slice().sort((a, b) => a.nom.localeCompare(b.nom)).map(f => `<tr class="clickable" data-fam="${f.id}"><td><strong>${esc(f.nom)}</strong>${f.alias ? `<div class="muted small">${esc(f.alias)}</div>` : ''}</td><td class="small">${esc(CATEGORIES_FAMILLE.find(c => c[0] === categorieFamille(f))[1].split(' (')[0])}</td><td>${esc(f.unite)}</td>
      <td class="num">${categorieFamille(f) === 'tube' ? '—' : fmt(f.soudures)}</td><td class="num">${categorieFamille(f) === 'tube' ? '—' : fmt(f.tempsPrefab, 2)}</td><td class="num">${['tube', 'robinetterie'].includes(categorieFamille(f)) ? '<span class="muted small">barème DN</span>' : fmt(f.tempsPose, 2)}</td>
      <td class="small">${(f.declinaisons || []).map(d => { const sd = souduresDe(f, d.dn); return `${d.dn ? 'DN' + d.dn : 'tous DN'} → ${esc((Store.get('articles', d.articleId) || {}).ref || '?')}${categorieFamille(f) !== 'tube' && sd && d.dn ? ` (${fmt(sd, 2).replace(/,00$/, '')} × ${POUCES_TXT(poucesDN(d.dn))})` : ''}`; }).join(' · ')}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Aucune famille.</td></tr>'}</table></div>`;
Views.familles.bind = root => {
  root.querySelector('#fam-add').onclick = () => editerFamille({ nom: '', unite: 'u', soudures: 0, tempsPrefab: 0, tempsPose: 0, declinaisons: [] });
  root.querySelectorAll('[data-fam]').forEach(tr => tr.onclick = () => editerFamille({ ...Store.get('familles', tr.dataset.fam) }));
};
// Élément du plan inconnu de la bibliothèque : article créé (désignation, référence, prix d'achat et de vente, fournisseur)
// et famille CAO créée ou complétée pour ce diamètre, de sorte qu'il soit reconnu et chiffré au prochain import
function articleDepuisPlan(g, ch, apres) {
  const p = { ...parametresDefaut(), ...(ch.params || {}) }, niv = p.niveaux[p.niveau] || p.niveaux[0];
  const cat = g.fam ? categorieFamille(g.fam) : /tuyau|tube|pipe/i.test(g.brut) ? 'tube' : /vanne|robinet|clapet|purgeur|filtre/i.test(g.brut) ? 'robinetterie' : /coude|t[ée]\b|bride|r[ée]duction|manchon/i.test(g.brut) ? 'raccord' : 'autre';
  const unite = g.fam ? g.fam.unite || 'u' : cat === 'tube' ? 'ml' : 'u';
  const familleBiblio = { tube: 'Tubes', raccord: 'Raccords', robinetterie: 'Robinetterie' }[cat] || 'Supportage';
  const box = Modal.open(`<h2 style="margin-top:0">Nouvel article de la bibliothèque</h2>
    <p class="small muted">Élément du plan : <strong>${esc(g.brut)}</strong>${g.dn ? ` · DN${g.dn}` : ''} · ${fmt(g.qte, 2)} ${esc(unite)}. L'article est relié à cet élément : au prochain import, il est reconnu et chiffré.</p>
    <div class="grid2"><div class="field"><label for="na-des">Désignation</label><input id="na-des" value="${esc(`${g.famille || g.brut}${g.type ? ` ${g.type}` : ''}${g.dn ? ` DN${g.dn}` : ''}`)}"></div>
      <div class="field"><label for="na-ref">Référence</label><input id="na-ref" placeholder="Réf. fournisseur ou interne"></div>
      <div class="field"><label for="na-fam">Famille (bibliothèque)</label><input id="na-fam" list="na-fams" value="${esc(familleBiblio)}"><datalist id="na-fams">${famillesArticles().map(f => `<option value="${esc(f)}">`).join('')}</datalist></div>
      <div class="field"><label for="na-u">Unité</label><select id="na-u">${optionsStr([...new Set([...UNITES, unite])], unite)}</select></div>
      <div class="field"><label for="na-cout">Prix d'achat HT</label><input id="na-cout" type="number" step="0.01" min="0"></div>
      <div class="field"><label for="na-pv">Prix de vente HT <span class="small muted">(vide : achat + ${fmt(num(niv.marge), 0)} %)</span></label><input id="na-pv" type="number" step="0.01" min="0"></div>
      <div class="field"><label for="na-four">Fournisseur préféré</label><select id="na-four">${options(fournisseursList(), '')}</select></div>
      <div class="field"><label for="na-sd">Soudures par ${esc(unite)}</label><input id="na-sd" type="number" step="0.5" min="0" value="${esc(g.fam ? num(g.fam.soudures) : cat === 'raccord' ? (/t[ée]\b/i.test(g.brut) ? 3 : 2) : 0)}"></div></div>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="na-x">Annuler</button><button id="na-ok">Enregistrer dans la bibliothèque</button></div>`);
  box.querySelector('#na-x').onclick = Modal.close;
  box.querySelector('#na-ok').onclick = () => {
    const v = k => box.querySelector(k).value.trim(), cout = num(v('#na-cout')), pv = v('#na-pv') === '' ? Math.round(cout * (1 + num(niv.marge) / 100) * 100) / 100 : num(v('#na-pv'));
    if (!v('#na-des')) return notify('Indiquez la désignation.');
    const a = Store.upsert('articles', { ref: v('#na-ref') || `PLAN-${uid().slice(0, 6).toUpperCase()}`, designation: v('#na-des'), famille: v('#na-fam'), sousFamille: '', unite: v('#na-u'), coutRevient: cout, prixVente: pv, poidsUnitaire: 0, fournisseurId: v('#na-four') });
    const f = g.fam ? { ...g.fam, declinaisons: [...(g.fam.declinaisons || []).filter(x => num(x.dn) !== num(g.dn))] } : { nom: g.famille || g.brut.split(' : ')[0], alias: g.brut, unite: v('#na-u'), categorie: cat, soudures: num(v('#na-sd')), tempsPose: '', declinaisons: [] };
    f.declinaisons.push({ dn: g.dn || '', articleId: a.id, ...(g.fam && num(v('#na-sd')) !== num(g.fam.soudures) ? { soudures: num(v('#na-sd')) } : {}) });
    if (g.fam && !String(f.alias || '').split(',').map(x => x.trim()).includes(g.brut)) f.alias = [f.alias, g.brut].filter(Boolean).join(', ');
    Store.upsert('familles', f);
    Modal.close(); App.toast(`« ${a.designation} » enregistré dans la bibliothèque et relié au plan`); if (apres) apres();
  };
}
function editerFamille(f) {
  f.declinaisons = (f.declinaisons || []).map(d => ({ ...d }));
  f.categorie = categorieFamille(f);
  const art = sel => `<option value="">— choisir —</option>${Store.all('articles').slice().sort((a, b) => (a.famille || '').localeCompare(b.famille || '') || a.ref.localeCompare(b.ref)).map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.ref)} · ${esc(a.designation)}</option>`).join('')}`;
  const dessiner = () => `<h2 style="margin-top:0">${f.id ? 'Famille CAO' : 'Nouvelle famille CAO'}</h2>
    <div class="grid2">
      <div class="field"><label for="fa-nom">Nom (tel qu'il apparaît dans la nomenclature)</label><input id="fa-nom" value="${esc(f.nom)}"></div>
      <div class="field"><label for="fa-alias">Synonymes (séparés par des virgules)</label><input id="fa-alias" value="${esc(f.alias || '')}"></div>
      <div class="field" style="grid-column:1/-1"><label for="fa-cat">Catégorie</label><select id="fa-cat">${CATEGORIES_FAMILLE.map(([k, l]) => `<option value="${k}" ${f.categorie === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="fa-unite">Unité</label><select id="fa-unite"><option value="u" ${f.unite !== 'ml' ? 'selected' : ''}>à l'unité</option><option value="ml" ${f.unite === 'ml' ? 'selected' : ''}>au mètre (tubes)</option></select></div>
      ${f.categorie === 'tube' ? `<p class="muted small" style="grid-column:1/-1">Tube : fourniture seule en préfabrication (les soudures sont portées par les raccords), pose au mètre selon le diamètre (barème du chiffrage).</p>
        <input id="fa-sd" type="hidden" value="0"><input id="fa-pf" type="hidden" value="0"><input id="fa-po" type="hidden" value="${esc(f.tempsPose)}">` : `
      <div class="field"><label for="fa-sd">Soudures par ${f.unite === 'ml' ? 'mètre' : 'unité'} <span class="muted small">(si l'article n'en précise pas)</span></label><input id="fa-sd" type="number" step="0.5" value="${esc(f.soudures)}"></div>
      <div class="field"><label for="fa-pf">Temps de préfabrication (h, hors soudure)</label><input id="fa-pf" type="number" step="0.05" value="${esc(f.tempsPrefab)}"></div>
      ${f.categorie === 'robinetterie' ? `<p class="muted small" style="grid-column:1/-1">Pose à l'unité selon le diamètre (barème du chiffrage).</p><input id="fa-po" type="hidden" value="${esc(f.tempsPose)}">`
        : `<div class="field"><label for="fa-po">Temps de pose (h, hors soudure)</label><input id="fa-po" type="number" step="0.05" value="${esc(f.tempsPose)}"></div>`}`}
    </div>
    <h3>Article de la bibliothèque par diamètre</h3>
    <div class="table-wrap"><table class="compact"><tr><th>DN (vide = tous)</th><th>Article</th>${f.categorie === 'tube' ? '' : '<th class="num">Soudures / u</th><th class="num">Pouces / u</th>'}<th></th></tr>
      ${f.declinaisons.map((d, i) => `<tr><td><input data-di="${i}" data-k="dn" type="number" value="${esc(d.dn || '')}" style="width:90px"></td><td><select data-di="${i}" data-k="articleId">${art(d.articleId)}</select></td>
        ${f.categorie === 'tube' ? '' : `<td class="num"><input data-di="${i}" data-k="soudures" type="number" step="0.5" min="0" value="${esc(d.soudures ?? '')}" placeholder="${esc(f.soudures)}" style="width:70px" aria-label="Soudures"></td><td class="num muted">${d.dn ? `${fmt(souduresDe(f, d.dn) * poucesDN(d.dn), 2)}` : ''}</td>`}
        <td><button class="small danger" data-ddel="${i}" type="button">✕</button></td></tr>`).join('')}</table></div>
    <button class="secondary small" id="fa-plus" type="button">+ Diamètre</button>
    <div class="modal-actions">${f.id ? '<button class="danger" id="fa-del">Supprimer</button>' : ''}<span style="flex:1"></span><button class="secondary" id="fa-annuler">Annuler</button><button id="fa-ok">Enregistrer</button></div>`;
  const box = Modal.open(dessiner());
  const lire = () => {
    const v = s => box.querySelector(s).value;
    Object.assign(f, { nom: v('#fa-nom').trim(), alias: v('#fa-alias').trim(), categorie: v('#fa-cat'), unite: v('#fa-unite'), soudures: num(v('#fa-sd')), tempsPrefab: num(v('#fa-pf')), tempsPose: num(v('#fa-po')) });
    box.querySelectorAll('[data-di]').forEach(el => { f.declinaisons[+el.dataset.di][el.dataset.k] = el.dataset.k === 'articleId' ? el.value : el.dataset.k === 'soudures' && el.value === '' ? '' : num(el.value); });
  };
  const lier = () => {
    box.querySelector('#fa-plus').onclick = () => { lire(); f.declinaisons.push({ dn: '', articleId: '' }); box.innerHTML = dessiner(); lier(); };
    box.querySelectorAll('[data-ddel]').forEach(b => b.onclick = () => { lire(); f.declinaisons.splice(+b.dataset.ddel, 1); box.innerHTML = dessiner(); lier(); });
    box.querySelector('#fa-unite').onchange = () => { lire(); box.innerHTML = dessiner(); lier(); };
    box.querySelector('#fa-cat').onchange = () => { lire(); if (f.categorie === 'tube') f.unite = 'ml'; box.innerHTML = dessiner(); lier(); };
    box.querySelectorAll('[data-di][data-k="soudures"], [data-di][data-k="dn"]').forEach(el => el.onchange = () => { lire(); box.innerHTML = dessiner(); lier(); });
    box.querySelector('#fa-annuler').onclick = Modal.close;
    const del = box.querySelector('#fa-del');
    if (del) del.onclick = () => ask(`Supprimer la famille ${f.nom} ?`, 'Supprimer').then(ok => { if (ok) { Store.remove('familles', f.id); Modal.close(); App.render(); } });
    box.querySelector('#fa-ok').onclick = () => {
      lire();
      if (!f.nom) return notify('Indiquez le nom de la famille.');
      f.declinaisons = f.declinaisons.filter(d => d.articleId);
      Store.upsert('familles', f); Modal.close(); App.render();
    };
  };
  lier();
}

// Démonstration : export de nomenclature Revit (texte séparé par tabulations, longueurs en mm, titre en première ligne)
// Démonstration : nomenclature Revit d'une pièce par ligne (occurrences), avec les colonnes « Chapitre » et
// « Sous-chapitre » ajoutées au projet (paramètres partagés) et une pièce absente de la bibliothèque
function nomenclatureExemple() {
  const L = [['Nomenclature de canalisations et raccords – Ligne NEP'], ['Chapitre', 'Sous-chapitre', 'Abréviation du système', 'Famille', 'Type', 'Taille', 'Longueur', 'Nombre']];
  const piece = (chap, sous, sys, fam, type, taille, long = '', n = 1) => { for (let i = 0; i < n; i++) L.push([chap, sous, sys, fam, type, taille, long, '1']); };
  [['1 – Ligne NEP', 'Aller', 'NEP-ALLER', 50, ['31200', '18400', '12200']], ['1 – Ligne NEP', 'Retour', 'NEP-RETOUR', 50, ['30100', '19800', '11900']], ['2 – Eau glacée process', 'Collecteur', 'EG-101', 100, ['21500', '21000']]].forEach(([chap, sous, sys, dn, longs]) => {
    longs.forEach(l => piece(chap, sous, sys, 'Tuyau', dn === 100 ? 'Acier P235GH' : 'Inox 316L soudé', `${dn} mm`, l));
    piece(chap, sous, sys, 'Coude - Soudé', 'Standard 90°', `${dn} mm`, '', dn === 100 ? 9 : 7);
    piece(chap, sous, sys, 'Té - Soudé', 'Égal', `${dn} mm`, '', 2);
    piece(chap, sous, sys, 'Bride à collerette', 'PN16', `${dn} mm`, '', 4);
    if (dn === 50) piece(chap, sous, sys, 'Vanne papillon', 'À levier PN16', `${dn} mm`, '', 2);
    longs.forEach(l => piece(chap, sous, sys, 'Support de tuyauterie', 'Collier sur rail', `${dn} mm`, l));
  });
  piece('2 – Eau glacée process', 'Collecteur', 'EG-101', 'Réduction concentrique', 'Soudée', '100 mm-50 mm', '', 2);
  piece('2 – Eau glacée process', 'Équipements', 'EG-101', 'Purgeur automatique', 'Standard', '15 mm', '', 2);
  piece('2 – Eau glacée process', 'Équipements', 'EG-101', 'Manomètre à cadran', 'Glycérine 0-10 bar', '15 mm', '', 2);
  return L.map(r => r.map(c => `"${c}"`).join('\t')).join('\r\n');
}
