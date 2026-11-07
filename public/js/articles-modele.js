// Bibliothèque au format du modèle d'export de l'entreprise (fichier « export_AAAA-MM-JJ.xlsx », feuille « Worksheet ») :
// Référence | Description | Fournisseur | Unité | Prix d'achat | Marge | Catégories
//  - prix d'achat « 4,83000 » (5 décimales), marge en % « 100,00 » : prix de vente = achat × (1 + marge / 100) ;
//  - catégories hiérarchisées « Famille|Sous-famille|Gamme » (1 à 3 niveaux) ;
//  - unités du modèle (Pièce, Ml, M2, Forfait, Heure(s)…) ↔ unités de Pipe-Fit (u, ml, m², forfait, h…).
// Module pur (navigateur, tests).
const ArticlesModele = (() => {
  const ENTETES = ['Référence', 'Description', 'Fournisseur', 'Unité', "Prix d'achat", 'Marge', 'Catégories'];
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const nombre = v => { if (typeof v === 'number') return v; const t = String(v ?? '').replace(/[\s€%]/g, '').replace(',', '.'); return t === '' || isNaN(+t) ? '' : +t; };
  const fr = (v, d) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? '' : Number(v).toFixed(d).replace('.', ','));
  // Unités : modèle → Pipe-Fit, et retour
  const VERS_PF = { piece: 'u', pieces: 'u', p: 'u', u: 'u', unite: 'u', '1': 'u', ml: 'ml', m: 'ml', metre: 'ml', m2: 'm²', 'm 2': 'm²', forfait: 'forfait', f: 'forfait', ft: 'forfait', 'heure s': 'h', heure: 'h', heures: 'h', h: 'h', kg: 'kg', ens: 'ens', ensemble: 'ens', jour: 'jour', semaine: 'semaine' };
  const VERS_MODELE = { u: 'Pièce', ml: 'Ml', 'm²': 'M2', forfait: 'Forfait', h: 'Heure(s)', kg: 'Kg', ens: 'Ensemble', jour: 'Jour', semaine: 'Semaine' };
  const UNITES_PF = ['u', 'ml', 'm²', 'kg', 'h', 'forfait', 'ens', 'semaine', 'jour'];
  const cleUnite = v => norm(String(v ?? '').replace(/²/g, '2'));
  const unitePF = v => (UNITES_PF.includes(String(v ?? '').trim()) ? String(v).trim() : VERS_PF[cleUnite(v)] || (String(v || '').trim() ? String(v).trim() : 'u'));
  const uniteConnue = v => UNITES_PF.includes(String(v ?? '').trim()) || !!VERS_PF[cleUnite(v)];
  const uniteModele = u => VERS_MODELE[u] || u || 'Pièce';
  // Catégories « A|B|C » → famille, sous-famille, gamme (au-delà de 3 niveaux : regroupés dans la gamme)
  function categories(v) {
    const l = String(v ?? '').split('|').map(x => x.trim()).filter(Boolean);
    return { famille: l[0] || '', sousFamille: l[1] || '', gamme: l.slice(2).join(' › ') };
  }
  const cheminCategories = a => [a.famille, a.sousFamille, ...String(a.gamme || '').split(' › ')].map(x => String(x || '').trim()).filter(Boolean).join('|');
  const prixVente = (achat, marge) => (Number.isFinite(+achat) && achat !== '' && Number.isFinite(+marge) && marge !== '' ? Math.round(achat * (1 + marge / 100) * 100) / 100 : '');
  const margeDe = a => { const pa = Number(a.coutRevient), pv = Number(a.prixVente); if (a.marge !== undefined && a.marge !== '' && Number.isFinite(+a.marge)) return +a.marge; return pa > 0 && pv > 0 ? Math.round((pv / pa - 1) * 10000) / 100 : ''; };
  // Ligne du fichier → valeurs d'un article (sans l'identifiant ni le fournisseur résolu)
  function lire(row) {
    const [ref, description, fournisseur, unite, achat, marge, cat] = row;
    const pa = nombre(achat), m = nombre(marge), c = categories(cat);
    return { ref: String(ref ?? '').trim(), designation: String(description ?? '').trim(), fournisseur: String(fournisseur ?? '').trim(), unite: unitePF(unite), coutRevient: pa, marge: m, prixVente: prixVente(pa, m), ...c };
  }
  // Article → ligne du modèle (textes au format français du modèle)
  const ligne = (a, nomFournisseur = '') => [String(a.ref || ''), String(a.designation || ''), nomFournisseur, uniteModele(a.unite), fr(a.coutRevient, 5), fr(margeDe(a), 2), cheminCategories(a)];
  // En-têtes reconnus (ordre libre, colonnes en plus ignorées)
  function colonnes(entete) {
    const n = entete.map(norm), i = l => n.findIndex(c => l.includes(c));
    const map = { ref: i(['reference', 'ref']), designation: i(['description', 'designation', 'libelle']), fournisseur: i(['fournisseur']), unite: i(['unite']), achat: i(['prix d achat', 'prix achat', 'pa']), marge: i(['marge', 'marge %']), cat: i(['categories', 'categorie']) };
    return Object.values(map).filter(x => x >= 0).length >= 4 && map.designation >= 0 ? map : null;
  }
  const estModele = entete => !!colonnes(entete || []) && norm((entete || [])[6]) === 'categories';
  function lireFeuille(rows) {
    const map = colonnes(rows[0] || []); if (!map) return null;
    return rows.slice(1).filter(r => r && r.some(c => String(c ?? '').trim() !== '')).map(r => lire([r[map.ref], r[map.designation], r[map.fournisseur], r[map.unite], r[map.achat], r[map.marge], r[map.cat]])).filter(x => x.designation || x.ref);
  }
  // Rapprochement des fournisseurs : même nom, singulier / pluriel (« Descour » / « Descours »), ou nom contenu en début
  // d'un autre (« PUM » / « PUM Plastiques ») ; renvoie l'entreprise existante la plus proche, sinon null
  function fournisseurProche(nom, entreprises) {
    const n = norm(nom); if (!n) return null;
    const sing = s => s.split(' ').map(w => w.replace(/s$/, '')).join(' ');
    return entreprises.find(e => norm(e.nom) === n) || entreprises.find(e => sing(norm(e.nom)) === sing(n))
      || (n.length >= 3 ? entreprises.find(e => { const m = norm(e.nom); return m.length >= 3 && (m.startsWith(`${n} `) || n.startsWith(`${m} `)); }) : null) || null;
  }
  // Variantes fournisseur : un fournisseur par défaut (fournisseurId, prix de l'article) et 3 autres au plus
  // (fournisseursConsult), chacun avec son prix d'achat et sa marge (prixFournisseurs[id])
  const MAX_VARIANTES = 3;
  function ajouterVariante(a, fid, prix = {}) {
    if (!fid) return a;
    if (!a.fournisseurId) { a.fournisseurId = fid; return a; }
    if (fid === a.fournisseurId) return a;
    const l = (a.fournisseursConsult || []).filter(x => x && x !== a.fournisseurId && x !== fid);
    if (l.length >= MAX_VARIANTES && !(a.fournisseursConsult || []).includes(fid)) return a;
    a.fournisseursConsult = [...(a.fournisseursConsult || []).filter(x => x && x !== a.fournisseurId)];
    if (!a.fournisseursConsult.includes(fid)) a.fournisseursConsult.push(fid);
    a.fournisseursConsult = a.fournisseursConsult.slice(0, MAX_VARIANTES);
    const p = {}; if (prix.coutRevient !== '' && prix.coutRevient !== undefined) p.coutRevient = prix.coutRevient; if (prix.marge !== '' && prix.marge !== undefined) p.marge = prix.marge;
    if (Object.keys(p).length) a.prixFournisseurs = { ...(a.prixFournisseurs || {}), [fid]: p };
    return a;
  }
  // Fournisseur par défaut changé : l'ancien passe dans les variantes (avec le prix de l'article), le nouveau en sort
  function changerDefaut(a, fid) {
    const ancien = a.fournisseurId; if (!fid || fid === ancien) return a;
    const pf = { ...(a.prixFournisseurs || {}) };
    if (ancien) pf[ancien] = { coutRevient: a.coutRevient, ...(a.marge !== undefined && a.marge !== '' ? { marge: a.marge } : {}) };
    delete pf[fid];
    a.fournisseurId = fid;
    a.fournisseursConsult = [...new Set([ancien, ...(a.fournisseursConsult || [])])].filter(x => x && x !== fid).slice(0, MAX_VARIANTES);
    a.prixFournisseurs = Object.fromEntries(Object.entries(pf).filter(([k]) => a.fournisseursConsult.includes(k)));
    return a;
  }
  // Lignes d'export d'un article : le fournisseur par défaut d'abord, puis une ligne par variante (même référence)
  function lignesVariantes(a, nomDe = () => '') {
    const out = [ligne(a, a.fournisseurId ? nomDe(a.fournisseurId) : '')];
    (a.fournisseursConsult || []).slice(0, MAX_VARIANTES).forEach(fid => {
      const p = (a.prixFournisseurs || {})[fid]; if (!p) return;
      out.push(ligne({ ...a, coutRevient: p.coutRevient ?? a.coutRevient, marge: p.marge ?? a.marge, prixVente: p.marge === undefined ? a.prixVente : prixVente(p.coutRevient, p.marge) }, nomDe(fid)));
    });
    return out;
  }
  return { ENTETES, UNITES_PF, uniteConnue, MAX_VARIANTES, ajouterVariante, changerDefaut, lignesVariantes, norm, nombre, unitePF, uniteModele, categories, cheminCategories, prixVente, margeDe, lire, ligne, colonnes, estModele, lireFeuille, fournisseurProche };
})();
if (typeof module !== 'undefined') module.exports = ArticlesModele;
