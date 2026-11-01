// Matériel réellement installé : rapprochement des équipements du DOE avec les lignes des commandes fournisseurs du
// chantier (c'est ce qui a été livré et posé). Pour chaque équipement : la ligne de commande retrouvée (par la référence,
// sinon par la désignation), la livraison, et l'écart éventuel avec la référence portée au DOE (étude, matériel retenu) ;
// les lignes commandées qui ressemblent à un équipement et ne figurent pas au DOE sont listées.
// Module commun application DOE / tests.
const Installe = (() => {
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const compact = t => norm(t).replace(/ /g, '');
  const VIDES = new Set(['pour', 'avec', 'sans', 'type', 'mm', 'dans', 'des', 'les', 'une', 'aux', 'compris', 'raccordement', 'fourniture', 'pose', 'plenum', 'supports']);
  const mots = t => norm(t).split(' ').filter(m => (m.length >= 4 || /\d/.test(m)) && !VIDES.has(m));
  // Consommables et accessoires de tuyauterie / gaine : pas des équipements à décrire au DOE
  const consommable = t => /\b(tube|tuyau|raccord|coude|bride|te|reduction|manchon|joint|visserie|collier|support|calorifuge|coquille|gaine|soudure|consommable|fourreau|chemin de cable)\b/.test(norm(t));

  // Lignes des commandes du chantier (annulées écartées), avec la livraison
  function lignesCommandes(commandes, affaireId, nomFournisseur = () => '', article = () => null) {
    return (commandes || []).filter(c => c.affaireId === affaireId && c.statut !== 'Annulée').flatMap(c => (c.lignes || []).map((l, i) => {
      const art = l.articleId ? article(l.articleId) : null, qte = Number(l.qte) || 0, recue = Number(l.qteRecue) || 0;
      const livree = c.statut === 'Réceptionnée' || (qte > 0 && recue >= qte - 1e-9), partielle = !livree && (recue > 0 || c.statut === 'Réceptionnée partiellement');
      const derniere = (c.receptions || []).slice(-1)[0] || null;
      return { cle: `${c.id}:${i}`, commandeId: c.id, numero: c.numero || '', date: c.date || '', fournisseur: nomFournisseur(c.fournisseurId), statut: c.statut || '',
        designation: String(l.designation || (art && art.designation) || ''), ref: String((art && art.ref) || l.ref || ''), qte, qteRecue: recue,
        livraison: livree ? 'livrée' : partielle ? 'livrée en partie' : 'non livrée', dateLivraison: derniere ? derniere.date || '' : '' };
    }));
  }

  // Score d'une ligne de commande pour un équipement : 10 si la référence du DOE y figure, sinon ressemblance des désignations
  function score(e, l) {
    const texte = `${l.designation} ${l.ref}`, ref = compact(e.reference);
    if (ref.length >= 3 && compact(texte).includes(ref)) return { s: 10, parRef: true };
    const de = String(e.designation || '').split(' — ')[0], me = mots(de).filter(m => !/\d/.test(m)), ml = new Set(mots(texte));
    if (!me.length) return { s: 0 };
    const communs = me.filter(m => ml.has(m));
    // Les dimensions (DN 50, Ø 160, 200 L) doivent concorder quand l'équipement en porte (les débits, puissances… non)
    const dims = s => { const x = String(s || '').toLowerCase().replace(/(\d)\s+(\d{3})\b/g, '$1$2'), out = new Set(); let m; const re = /(?:\bdn\s*|ø\s*|\bd\s?=\s*)(\d+)|(\d+)\s*l\b/g; while ((m = re.exec(x))) out.add(m[1] || `${m[2]}l`); return out; };
    const dE = dims(de), dL = dims(texte);
    if (dE.size && ![...dE].some(d => dL.has(d) || new RegExp(`(^|[^0-9])${d.replace('l', '')}([^0-9]|$)`).test(texte.toLowerCase()))) return { s: 0 }; // « DF4-160 » porte aussi le Ø 160
    const ratio = communs.length / me.length;
    return { s: ratio >= 0.5 ? 3 + ratio : 0, parRef: false };
  }

  // Rapprochement : chaque ligne de commande sert à un seul équipement (le mieux placé)
  function rapprocher(equipements, lignes) {
    const paires = [];
    (equipements || []).forEach(e => (lignes || []).forEach(l => { const r = score(e, l); if (r.s > 0) paires.push({ e, l, ...r }); }));
    paires.sort((a, b) => b.s - a.s);
    const prisE = new Map(), prisL = new Set();
    paires.forEach(p => { if (!prisE.has(p.e.id) && !prisL.has(p.l.cle)) { prisE.set(p.e.id, p); prisL.add(p.l.cle); } });
    const resultats = (equipements || []).map(e => {
      const p = prisE.get(e.id);
      if (!p) return { id: e.id, etat: 'non-commande', texte: 'Pas retrouvé dans les commandes du chantier (fourni par un autre lot, pris en stock, ou désignation différente).' };
      const l = p.l, refDOE = String(e.reference || '').trim();
      const etat = p.parRef ? 'conforme' : refDOE ? 'reference-differente' : 'a-completer';
      const texte = etat === 'conforme' ? 'Référence du DOE retrouvée dans la commande.'
        : etat === 'reference-differente' ? `La commande porte « ${l.designation}${l.ref ? ` (${l.ref})` : ''} » et non la référence « ${refDOE} » : c'est ce qui a été installé.`
          : 'Référence à reprendre de la commande.';
      return { id: e.id, etat, texte, ligne: l, livraison: l.livraison };
    });
    const nonDecrites = (lignes || []).filter(l => !prisL.has(l.cle) && !consommable(`${l.designation}`));
    return { resultats, nonDecrites, bilan: {
      conformes: resultats.filter(r => r.etat === 'conforme').length, differentes: resultats.filter(r => r.etat === 'reference-differente').length,
      aCompleter: resultats.filter(r => r.etat === 'a-completer').length, nonCommandes: resultats.filter(r => r.etat === 'non-commande').length,
      nonLivres: resultats.filter(r => r.ligne && r.livraison !== 'livrée').length, nonDecrites: nonDecrites.length } };
  }

  // Ce que la commande dit de l'équipement (enregistré sur l'équipement du DOE et repris dans le document)
  const commandeDe = l => ({ numero: l.numero, date: l.date, fournisseur: l.fournisseur, designation: l.designation, ref: l.ref, livraison: l.livraison, dateLivraison: l.dateLivraison });
  // Référence installée lue dans la commande : celle de l'article, sinon la désignation commandée
  // Référence installée lue dans la commande : celle de l'article, sinon le texte qui suit la marque dans la désignation
  const referenceCommandee = (l, marque) => {
    if (l.ref) return l.ref;
    const m = String(marque || '').trim(), i = m ? norm(l.designation).indexOf(norm(m)) : -1;
    if (i >= 0) { const apres = String(l.designation).slice(String(l.designation).toLowerCase().indexOf(m.toLowerCase()) + m.length).trim(); if (apres) return apres; }
    return l.designation;
  };

  return { norm, lignesCommandes, score, rapprocher, commandeDe, referenceCommandee, consommable };
})();
if (typeof module !== 'undefined') module.exports = Installe;
