// Outils de la bibliothèque de fournitures (module pur : navigateur, tests) :
//  - offres d'un article chez ses fournisseurs (défaut + 3 variantes) : prix, délai, le moins cher, le plus rapide ;
//    comparatif d'une commande entière par fournisseur ;
//  - tarif d'un fournisseur (Excel) comparé à la bibliothèque, appliqué avec un historique daté des prix ;
//  - prix facturé comparé au prix de la bibliothèque (alerte au-delà d'un seuil) ;
//  - marges par catégorie (Famille|Sous-famille|Gamme, la plus précise l'emporte) ;
//  - arbre des catégories sur 3 niveaux, renommer / fusionner / déplacer une catégorie ;
//  - doublons (même référence ou même désignation) fusionnés en variantes fournisseur ;
//  - contrôle des lignes d'un import avant validation.
const BiblioOutils = (() => {
  const MAX_VARIANTES = 3, HISTO_MAX = 60;
  const n = v => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')));
  const ok = v => v !== '' && v !== null && v !== undefined && Number.isFinite(n(v));
  const r2 = v => Math.round(v * 100) / 100, r5 = v => Math.round(v * 100000) / 100000;
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const cleRef = s => norm(s).replace(/ /g, '');
  const pct = (a, b) => (ok(a) && n(a) > 0 && ok(b) ? r2((n(b) / n(a) - 1) * 100) : null);

  /* ---------- Offres fournisseurs ---------- */
  // [{ fid, defaut, coutRevient, delai }] : le fournisseur par défaut d'abord, puis les variantes
  function offres(a) {
    if (!a) return [];
    const l = [];
    if (a.fournisseurId) l.push({ fid: a.fournisseurId, defaut: true, coutRevient: ok(a.coutRevient) ? n(a.coutRevient) : null, delai: ok(a.delai) ? n(a.delai) : null });
    (a.fournisseursConsult || []).slice(0, MAX_VARIANTES).forEach(fid => {
      if (!fid || fid === a.fournisseurId) return;
      const p = (a.prixFournisseurs || {})[fid] || {};
      l.push({ fid, defaut: false, coutRevient: ok(p.coutRevient) ? n(p.coutRevient) : null, delai: ok(p.delai) ? n(p.delai) : null });
    });
    return l;
  }
  const prixChez = (a, fid) => { const o = offres(a).find(x => x.fid === fid); return o ? o.coutRevient : null; };
  const avecPrix = a => offres(a).filter(o => o.coutRevient !== null && o.coutRevient > 0);
  const moinsCher = a => avecPrix(a).sort((x, y) => x.coutRevient - y.coutRevient || (y.defaut - x.defaut))[0] || null;
  const plusRapide = a => offres(a).filter(o => o.delai !== null).sort((x, y) => x.delai - y.delai || (x.coutRevient ?? 1e12) - (y.coutRevient ?? 1e12))[0] || null;
  // Conseil pour une ligne chez le fournisseur fid : moins cher ailleurs (écart en € et en %)
  function conseil(a, fid) {
    const ici = prixChez(a, fid), m = moinsCher(a);
    if (!m || m.fid === fid || ici === null || m.coutRevient >= ici) return null;
    return { fid: m.fid, prix: m.coutRevient, ecart: r5(ici - m.coutRevient), pct: r2((1 - m.coutRevient / ici) * 100) };
  }
  // Commande entière : total par fournisseur (lignes de la bibliothèque connues chez lui), trié du moins cher
  function comparerCommande(lignes, articleDe) {
    const parF = new Map(), lb = (lignes || []).filter(l => l.articleId && articleDe(l.articleId));
    lb.forEach(l => {
      const a = articleDe(l.articleId);
      offres(a).forEach(o => {
        if (o.coutRevient === null) return;
        const x = parF.get(o.fid) || { fid: o.fid, total: 0, lignes: 0, delai: null };
        x.total += n(l.qte) * o.coutRevient; x.lignes++;
        if (o.delai !== null) x.delai = Math.max(x.delai ?? 0, o.delai);
        parF.set(o.fid, x);
      });
    });
    return { nb: lb.length, fournisseurs: [...parF.values()].map(x => ({ ...x, total: r2(x.total), complet: x.lignes === lb.length })).sort((x, y) => (y.complet - x.complet) || x.total - y.total) };
  }

  /* ---------- Prix : historique, tarif fournisseur, facture ---------- */
  // Nouveau prix d'achat d'un article chez fid (défaut ou variante) ; prix de vente recalculé par la marge ; historique daté
  function appliquerPrix(a, fid, prix, { date = '', source = '' } = {}) {
    if (!ok(prix)) return a;
    const p = r5(n(prix)), defaut = !fid || fid === a.fournisseurId;
    const ancien = defaut ? (ok(a.coutRevient) ? n(a.coutRevient) : null) : prixChez(a, fid);
    if (ancien !== null && Math.abs(ancien - p) < 0.000005) return a;
    if (defaut) {
      a.coutRevient = p;
      if (ok(a.marge)) a.prixVente = r2(p * (1 + n(a.marge) / 100));
    } else {
      if (!(a.fournisseursConsult || []).includes(fid)) {
        if ((a.fournisseursConsult || []).filter(x => x !== a.fournisseurId).length >= MAX_VARIANTES) return a;
        a.fournisseursConsult = [...(a.fournisseursConsult || []), fid];
      }
      a.prixFournisseurs = { ...(a.prixFournisseurs || {}), [fid]: { ...((a.prixFournisseurs || {})[fid] || {}), coutRevient: p } };
    }
    a.historiquePrix = [...(a.historiquePrix || []), { date, fid: fid || a.fournisseurId || '', ancien, nouveau: p, source }].slice(-HISTO_MAX);
    return a;
  }
  // Colonnes d'un tarif : référence (ou désignation) et prix
  // Colonnes d'un tarif : référence (ou désignation), prix (le plus précis d'abord : « prix net » avant « prix de base »),
  // écotaxe comprise si la colonne existe, liens fiche technique / page produit / photo
  function colonnesTarif(entete) {
    const h = (entete || []).map(norm);
    const i = l => { for (const m of l) { const k = h.findIndex(c => c === m || c.startsWith(`${m} `)); if (k >= 0) return k; } return -1; };
    const ref = i(['code produit', 'reference', 'ref fournisseur', 'code article', 'ref', 'code', 'article']), des = i(['designation', 'description', 'libelle']);
    const prix = i(['prix net', 'net', 'prix d achat', 'prix achat', 'prix unitaire', 'pu ht', 'prix ht', 'pu', 'tarif', 'prix']);
    const eco = h.findIndex(c => /^prix net .*eco ?taxe/.test(c) || /ecotaxe incluse|eco taxe incluse/.test(c));
    const fiche = i(['url fiche technique', 'lien fiche technique', 'fiche technique', 'url fiche', 'documentation']);
    const page = i(['url page produit', 'page produit', 'lien produit', 'url produit']);
    const photo = i(['url image', 'url photo', 'lien image', 'lien photo', 'image', 'photo', 'visuel']);
    return prix >= 0 && (ref >= 0 || des >= 0) ? { ref, des, prix, eco, fiche, page, photo } : null;
  }
  const motsDes = s => new Set(norm(s).split(' ').filter(m => m.length > 1));
  // Ressemblance de deux désignations (mots communs / mots de la plus courte)
  const ressemble = (a, b) => { const x = motsDes(a), y = motsDes(b); if (!x.size || !y.size) return 0; let c = 0; x.forEach(m => { if (y.has(m)) c++; }); return c / Math.min(x.size, y.size); };
  const cleDesTarif = s => norm(s).split(' ').filter(Boolean).sort().join(' ');
  // Lignes du tarif rapprochées de la bibliothèque :
  //  - articles chez ce fournisseur (par défaut ou en variante) : même référence ET désignation ressemblante, sinon même désignation ;
  //  - autres articles de même désignation (autre fournisseur) : le fournisseur y est proposé en nouvelle variante (option autres) ;
  //  - désignation présente plusieurs fois dans le tarif à des prix différents : ambiguë, non reprise.
  function comparerTarif(articles, fid, rows, { autres = false, ecotaxe = true } = {}) {
    const c = colonnesTarif(rows[0]); if (!c) return null;
    const chez = articles.filter(a => a.fournisseurId === fid || (a.fournisseursConsult || []).includes(fid));
    const parRef = new Map(), parDes = new Map(), autresDes = new Map();
    chez.forEach(a => { if (a.ref) parRef.set(cleRef(a.ref), a); if (a.designation) parDes.set(cleDesTarif(a.designation), a); });
    if (autres) articles.forEach(a => { if (!chez.includes(a) && a.designation) { const k = cleDesTarif(a.designation); (autresDes.get(k) || autresDes.set(k, []).get(k)).push(a); } });
    const txt = (r, k) => (k >= 0 ? String(r[k] ?? '').trim() : '');
    const lus = rows.slice(1).map((r, k) => {
      const prix = n(c.eco >= 0 && ecotaxe && ok(r[c.eco]) ? r[c.eco] : r[c.prix]);
      const lien = k2 => { const u = txt(r, k2); return /^https?:\/\/\S+$/i.test(u) ? u : ''; };
      return { ligne: k + 2, ref: txt(r, c.ref), designation: txt(r, c.des), prix, ficheUrl: lien(c.fiche), pageUrl: lien(c.page), photoUrl: lien(c.photo) };
    }).filter(l => (l.ref || l.designation) && Number.isFinite(l.prix));
    // Désignations du tarif : prix unique ou ambigu
    const tarifDes = new Map();
    lus.forEach(l => { if (!l.designation) return; const k = cleDesTarif(l.designation); (tarifDes.get(k) || tarifDes.set(k, []).get(k)).push(l); });
    const unique = k => { const l = tarifDes.get(k) || []; return l.length && l.every(x => Math.abs(x.prix - l[0].prix) < 0.000005) ? l[0] : l.length ? 'ambigu' : null; };
    const lignes = [], nonTrouves = [], vus = new Set();
    let ambigus = 0;
    const ajouter = (a, l, role) => {
      if (vus.has(a.id)) return; vus.add(a.id);
      const ancien = role === 'défaut' ? (ok(a.coutRevient) ? n(a.coutRevient) : null) : prixChez(a, fid);
      lignes.push({ id: a.id, ref: a.ref || l.ref, designation: a.designation || l.designation, refFournisseur: l.ref, designationFournisseur: l.designation, role, ancien, nouveau: r5(l.prix), pct: ancien === null ? null : pct(ancien, l.prix),
        ...(l.ficheUrl ? { ficheUrl: l.ficheUrl } : {}), ...(l.pageUrl ? { pageUrl: l.pageUrl } : {}), ...(l.photoUrl ? { photoUrl: l.photoUrl } : {}) });
    };
    lus.forEach(l => {
      const parR = l.ref && parRef.get(cleRef(l.ref));
      const a = parR && (!parR.designation || !l.designation || ressemble(parR.designation, l.designation) >= 0.5) ? parR : null;
      if (a) return ajouter(a, l, a.fournisseurId === fid ? 'défaut' : 'variante');
      const k = l.designation && cleDesTarif(l.designation), u = k && unique(k);
      const b = k && parDes.get(k);
      if (b) { if (u === 'ambigu') { if (!vus.has(b.id)) ambigus++; vus.add(b.id); return; } return ajouter(b, l, b.fournisseurId === fid ? 'défaut' : 'variante'); }
      const o = k && autresDes.get(k);
      if (o && u && u !== 'ambigu') { o.forEach(x => ajouter(x, l, 'nouvelle variante')); return; }
      if (!o) nonTrouves.push(l);
    });
    const hausses = lignes.filter(l => l.pct > 0), baisses = lignes.filter(l => l.pct < 0), egaux = lignes.filter(l => l.pct === 0);
    return { lignes, nonTrouves, ambigus, ecotaxe: c.eco >= 0 && ecotaxe, colonneEcotaxe: c.eco >= 0, liens: lignes.filter(l => l.ficheUrl || l.pageUrl || l.photoUrl).length,
      hausses: hausses.length, baisses: baisses.length, egaux: egaux.length, nouveaux: lignes.filter(l => l.ancien === null).length, nouvellesVariantes: lignes.filter(l => l.role === 'nouvelle variante').length };
  }
  // Prix facturé face au prix de la bibliothèque chez ce fournisseur
  function ecartFacture(a, fid, pu, seuil = 5) {
    if (!a || !ok(pu) || n(pu) <= 0) return null;
    const ancien = fid && fid !== a.fournisseurId ? prixChez(a, fid) : (ok(a.coutRevient) ? n(a.coutRevient) : null);
    const p = pct(ancien, pu);
    if (ancien !== null && Math.abs(n(pu) - ancien) < 0.005) return null;
    return { ancien, nouveau: r5(n(pu)), pct: p, alerte: p !== null && Math.abs(p) > seuil };
  }

  /* ---------- Catégories et marges ---------- */
  const niveaux = a => [a.famille, a.sousFamille, ...String(a.gamme || '').split(' › ')].map(x => String(x || '').trim()).filter(Boolean).slice(0, 3);
  const chemin = a => niveaux(a).join('|');
  // Marge de la catégorie la plus précise (« A|B|C », puis « A|B », puis « A »)
  function margeCategorie(a, marges) {
    const l = niveaux(a);
    for (let k = l.length; k > 0; k--) { const m = (marges || {})[l.slice(0, k).join('|')]; if (ok(m)) return { chemin: l.slice(0, k).join('|'), marge: n(m) }; }
    return null;
  }
  const margeEffective = (a, marges) => (ok(a.marge) ? n(a.marge) : (margeCategorie(a, marges) || {}).marge ?? null);
  // Prix de vente des articles sans marge propre, d'après la marge de leur catégorie
  function appliquerMarges(articles, marges) {
    return articles.filter(a => !ok(a.marge) && ok(a.coutRevient) && n(a.coutRevient) > 0).map(a => {
      const m = margeCategorie(a, marges); if (!m) return null;
      const pv = r2(n(a.coutRevient) * (1 + m.marge / 100));
      return Math.abs(pv - n(a.prixVente || 0)) < 0.005 ? null : { ...a, prixVente: pv };
    }).filter(Boolean);
  }
  // Arbre sur 3 niveaux avec le nombre d'articles ; « Non classé » pour les articles sans catégorie
  function arbre(articles, SANS = 'Non classé') {
    const racine = new Map(); let sans = 0;
    articles.forEach(a => {
      const l = niveaux(a); if (!l.length) { sans++; return; }
      let m = racine;
      l.forEach((nom, k) => { const x = m.get(nom) || { nom, chemin: l.slice(0, k + 1).join('|'), n: 0, enfants: new Map() }; x.n++; m.set(nom, x); m = x.enfants; });
    });
    const plat = m => [...m.values()].sort((x, y) => x.nom.localeCompare(y.nom)).map(x => ({ nom: x.nom, chemin: x.chemin, n: x.n, enfants: plat(x.enfants) }));
    return { noeuds: plat(racine), sans, SANS };
  }
  // Renommer / fusionner / déplacer : les articles sous « de » passent sous « vers » (le reste du chemin est gardé)
  function deplacer(articles, de, vers) {
    const d = String(de || '').split('|').map(s => s.trim()).filter(Boolean), v = String(vers || '').split('|').map(s => s.trim()).filter(Boolean);
    if (!d.length || !v.length || v.length > 3) return [];
    return articles.filter(a => { const l = niveaux(a); return d.every((x, k) => l[k] === x); }).map(a => {
      const l = [...v, ...niveaux(a).slice(d.length)].slice(0, 3);
      return { ...a, famille: l[0] || '', sousFamille: l[1] || '', gamme: l[2] || '' };
    }).filter(x => { const a = articles.find(y => y.id === x.id); return chemin(a) !== chemin(x); });
  }

  /* ---------- Doublons ---------- */
  const cleDes = s => norm(s).split(' ').filter(Boolean).sort().join(' ');
  // Groupes d'articles quasi identiques : même référence (sans séparateurs) ou même désignation (mots dans le désordre),
  // même unité ; un article n'apparaît que dans un groupe
  function doublons(articles) {
    const groupes = [], pris = new Set();
    const regrouper = cle => {
      const m = new Map();
      articles.forEach(a => { if (pris.has(a.id)) return; const k = cle(a); if (!k) return; const u = String(a.unite || 'u'); (m.get(`${k}#${u}`) || m.set(`${k}#${u}`, []).get(`${k}#${u}`)).push(a); });
      return [...m.values()].filter(g => g.length > 1);
    };
    regrouper(a => (a.ref ? cleRef(a.ref) : '')).forEach(g => { g.forEach(a => pris.add(a.id)); groupes.push({ motif: 'même référence', articles: g }); });
    regrouper(a => (norm(a.designation).length >= 6 ? cleDes(a.designation) : '')).forEach(g => { g.forEach(a => pris.add(a.id)); groupes.push({ motif: 'même désignation', articles: g }); });
    return groupes;
  }
  // Fusion : l'article gardé reprend les fournisseurs (et prix) des autres en variantes (3 au plus) et complète ses champs vides
  function fusionner(garde, autres) {
    const a = JSON.parse(JSON.stringify(garde)), perdus = [];
    autres.forEach(b => {
      ['ref', 'famille', 'sousFamille', 'gamme', 'poidsUnitaire', 'photoId', 'emplacement'].forEach(k => { if ((a[k] === '' || a[k] === undefined || a[k] === null) && b[k] !== '' && b[k] !== undefined) a[k] = b[k]; });
      offres(b).forEach(o => {
        if (o.fid === a.fournisseurId) return;
        if (!a.fournisseurId) { a.fournisseurId = o.fid; if (!ok(a.coutRevient) && o.coutRevient !== null) a.coutRevient = o.coutRevient; return; }
        const deja = (a.fournisseursConsult || []).includes(o.fid);
        if (!deja && (a.fournisseursConsult || []).length >= MAX_VARIANTES) { perdus.push(o.fid); return; }
        if (!deja) a.fournisseursConsult = [...(a.fournisseursConsult || []), o.fid];
        if (o.coutRevient !== null && !ok(((a.prixFournisseurs || {})[o.fid] || {}).coutRevient)) a.prixFournisseurs = { ...(a.prixFournisseurs || {}), [o.fid]: { coutRevient: o.coutRevient, ...(o.delai !== null ? { delai: o.delai } : {}) } };
      });
      if (b.stockGere && !a.stockGere) a.stockGere = b.stockGere;
      a.historiquePrix = [...(a.historiquePrix || []), ...(b.historiquePrix || [])].sort((x, y) => String(x.date).localeCompare(String(y.date))).slice(-HISTO_MAX);
      a.alias = [...new Set([...(a.alias || []), b.designation, b.ref].filter(x => x && x !== a.designation && x !== a.ref))];
    });
    return { article: a, perdus };
  }
  // Remplace les identifiants d'articles fusionnés partout où ils sont cités (champs « articleId »), en profondeur
  function remplacerReferences(obj, remplace) {
    let change = false;
    const walk = o => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== 'object') return;
      Object.keys(o).forEach(k => {
        if (k === 'articleId' && typeof o[k] === 'string' && remplace[o[k]]) { o[k] = remplace[o[k]]; change = true; } else walk(o[k]);
      });
    };
    walk(obj);
    return change;
  }

  /* ---------- Contrôle d'un import ---------- */
  // vals : lignes lues (ref, designation, unite, coutRevient, prixVente, marge, fournisseur) ; unitesConnues : fonction
  function controlerImport(vals, { uniteConnue = () => true, margeMax = 300, prixAttendu = true } = {}) {
    const vus = new Map(), out = [];
    vals.forEach((v, k) => {
      const m = [];
      if (!String(v.ref ?? '').trim()) m.push('référence vide');
      if (!String(v.designation ?? '').trim()) m.push('désignation vide');
      if (v.coutRevient === '' || v.coutRevient === undefined) { if (prixAttendu) m.push('prix d\'achat vide'); }
      else if (n(v.coutRevient) === 0) m.push('prix d\'achat à 0');
      else if (n(v.coutRevient) < 0) m.push('prix d\'achat négatif');
      if (ok(v.marge) && n(v.marge) < 0) m.push(`marge négative (${n(v.marge)} %)`);
      if (ok(v.marge) && n(v.marge) > margeMax) m.push(`marge de ${n(v.marge)} %`);
      if (ok(v.prixVente) && ok(v.coutRevient) && n(v.prixVente) > 0 && n(v.prixVente) < n(v.coutRevient)) m.push('vendu moins cher qu\'acheté');
      if (String(v.unite ?? '').trim() && !uniteConnue(v.unite)) m.push(`unité inconnue « ${v.unite} »`);
      const cle = `${cleRef(v.ref)}|${norm(v.fournisseur)}`;
      if (cleRef(v.ref) && vus.has(cle)) m.push(`même référence et même fournisseur que la ligne ${vus.get(cle)}`); else if (cleRef(v.ref)) vus.set(cle, v._ligne || k + 2);
      if (m.length) out.push({ ligne: v._ligne || k + 2, ref: v.ref || '', designation: v.designation || '', motifs: m });
    });
    return out;
  }

  return { MAX_VARIANTES, norm, offres, prixChez, moinsCher, plusRapide, conseil, comparerCommande, appliquerPrix, colonnesTarif, comparerTarif, ressemble, ecartFacture,
    niveaux, chemin, margeCategorie, margeEffective, appliquerMarges, arbre, deplacer, doublons, fusionner, remplacerReferences, controlerImport };
})();
if (typeof module !== 'undefined') module.exports = BiblioOutils;
