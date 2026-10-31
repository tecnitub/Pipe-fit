// Calculs métier : prix des ouvrages (fournitures + main-d'œuvre), totaux de devis/factures,
// livraison, pilotage de chantier (budget vs réel), commandes, synthèse par chargé d'affaires.
const num = v => (v === '' || v == null || isNaN(+v)) ? 0 : +v;
const sumBy = (arr, fn) => arr.reduce((t, x) => t + fn(x), 0);

// Taux de TVA proposés ; « AL » = autoliquidation (sous-traitance de travaux de construction, art. 283-2 nonies du CGI)
const TAUX_TVA = [20, 10, 5.5, 0];
const REGIMES_TVA = [['20', 'TVA 20 %'], ['10', 'TVA 10 % (travaux dans un logement de plus de 2 ans)'], ['5.5', 'TVA 5,5 % (rénovation énergétique d\'un logement)'], ['0', 'TVA 0 % (exonération)'], ['AL', 'Autoliquidation (sous-traitance BTP)']];
const videTVA = v => v === undefined || v === null || v === '';

const Calc = {
  // TVA : taux du document (celui du devis, repris sur ses factures), taux propre à une ligne, autoliquidation
  tauxDoc(doc) { return doc && doc.autoliquidation ? 0 : videTVA(doc && doc.tauxTVA) ? num(Store.data.settings.tva) : num(doc.tauxTVA); },
  tauxLigne(doc, l) { return doc && doc.autoliquidation ? 0 : videTVA(l && l.tva) ? this.tauxDoc(doc) : num(l.tva); },
  regimeTVA(doc) { return doc && doc.autoliquidation ? 'AL' : String(this.tauxDoc(doc)); },
  // Régime choisi dans une liste (REGIMES_TVA) : taux du document ou autoliquidation
  appliquerRegime(doc, v) {
    if (v === 'AL') { doc.autoliquidation = true; delete doc.tauxTVA; } else { doc.autoliquidation = false; doc.tauxTVA = num(v); }
    return doc;
  },

  // Décomposition d'un ouvrage pour UNE unité.
  // Ouvrage = composants fournitures (article × quantité) + composants main-d'œuvre (catégorie × heures).
  unit(l) {
    const out = { f: 0, mo: 0, coutF: 0, coutMO: 0, heures: 0, poids: 0, hByMo: {} };
    if (!l.composants) { // ligne simple (anciens devis)
      const taux = num(Store.data.settings.tauxHoraireDefaut);
      return { ...out, f: num(l.pu), coutF: num(l.cout), coutMO: num(l.heures) * taux, heures: num(l.heures), poids: num(l.poids) };
    }
    for (const c of l.composants) {
      if (c.type === 'mo') {
        const h = num(c.heures);
        out.mo += h * num(c.taux); out.coutMO += h * num(c.cout); out.heures += h;
        out.hByMo[c.moId || 'autre'] = (out.hByMo[c.moId || 'autre'] || 0) + h;
      } else {
        const q = num(c.qte);
        out.f += q * num(c.pu); out.coutF += q * num(c.cout); out.poids += q * num(c.poids);
      }
    }
    return out;
  },
  pu(l) { const u = this.unit(l); return u.f + u.mo; },
  ligneHT(l) { return num(l.qte) * this.pu(l) * (1 - num(l.remise) / 100); },
  // Montant de la ligne avant sa remise commerciale
  ligneBrute(l) { return num(l.qte) * this.pu(l); },

  // Remises (négatives) et majorations (positives) sur l'ensemble des lignes, en pourcentage (pct) ou en euros
  // (mode « eur », montant signé). Les majorations masquées ne figurent pas sur les documents du client : elles sont
  // réparties dans les prix des lignes (coefficient coefMasque). Seules les autres sont listées ici.
  ajustements(doc) {
    const list = (doc.ajustements || []).filter(a => !a.masque).map(a => ({ ...a }));
    if (num(doc.remiseGlobale)) list.unshift({ libelle: 'Remise', pct: -num(doc.remiseGlobale) });
    return list;
  },
  montantAjustement(a, base) { return a.mode === 'eur' ? num(a.montant) : base * num(a.pct) / 100; },
  // Coefficient appliqué aux prix des lignes sur les documents du client : 1 + majorations masquées / total des lignes
  coefMasque(doc) {
    const base = sumBy((doc.lignes || []).filter(l => this.estPrix(l)), l => this.ligneHT(l));
    const maj = sumBy((doc.ajustements || []).filter(a => a.masque), a => this.montantAjustement(a, base));
    return base > 0 ? Math.max(0, 1 + maj / base) : 1;
  },

  // Lignes chiffrées (ouvrages, postes libres) : hors chapitres, textes et images
  estPrix(l) { return !['chapitre', 'texte', 'image'].includes(l.type); },
  // Niveau d'un chapitre : 1 chapitre, 2 sous-chapitre, 3 sous-sous-chapitre (d'après le N° pour les anciens DPGF)
  niveau(l) { return Math.min(3, Math.max(1, Math.round(num(l.niveau)) || (l.num ? String(l.num).split('.').length : 1))); },

  // Sous-totaux hiérarchiques : un chapitre court jusqu'au chapitre suivant de même niveau ou de niveau supérieur.
  // { index, titre, niveau, total, last (dernière ligne couverte), n (lignes chiffrées) }
  // montant(l) : montant d'une ligne chiffrée (par défaut après sa remise, au prix interne)
  chapitres(doc, montant = l => this.ligneHT(l)) {
    const res = [], ouverts = [];
    (doc.lignes || []).forEach((l, i) => {
      if (l.type === 'chapitre') {
        const n = this.niveau(l);
        while (ouverts.length && ouverts[ouverts.length - 1].niveau >= n) ouverts.pop();
        ouverts.forEach(c => { c.last = i; });
        const c = { index: i, titre: l.titre, niveau: n, total: 0, last: i, n: 0 };
        res.push(c); ouverts.push(c); return;
      }
      const prix = this.estPrix(l), ht = prix ? montant(l) : 0;
      ouverts.forEach(c => { c.last = i; if (prix) { c.total += ht; c.n++; } });
    });
    return res;
  },
  // Retire les chapitres sans aucune ligne chiffrée (factures de situation)
  sansChapitresVides(lignes) {
    const garder = new Set();
    this.chapitres({ lignes }).forEach(c => { if (c.n) garder.add(c.index); });
    return lignes.filter((l, i) => l.type !== 'chapitre' || garder.has(i));
  },
  // Sous-totaux à afficher après chaque ligne (les plus profonds d'abord)
  sousTotauxApres(doc, montant) {
    const out = {};
    this.chapitres(doc, montant).forEach(c => { if (c.last > c.index) (out[c.last] = out[c.last] || []).push(c); });
    Object.values(out).forEach(list => list.sort((a, b) => b.niveau - a.niveau));
    return out;
  },
  // N° affichés : automatiques (1, 1.1, 1.1.1… chapitres et lignes partagent le compteur de leur parent)
  // ou saisis à la main (N° de prix du DPGF). Textes et images ne sont pas numérotés.
  numeros(doc) {
    const lignes = doc.lignes || [];
    if (!doc.numAuto) return lignes.map(l => (l.type === 'texte' || l.type === 'image' ? '' : String(l.num || '')));
    const racine = { numero: '', compteur: 0, niveau: 0 }, pile = [racine];
    return lignes.map(l => {
      if (l.type === 'texte' || l.type === 'image') return '';
      if (l.type === 'chapitre') {
        const n = this.niveau(l);
        while (pile.length > 1 && pile[pile.length - 1].niveau >= n) pile.pop();
        const p = pile[pile.length - 1], numero = (p.numero ? p.numero + '.' : '') + (++p.compteur);
        pile.push({ numero, compteur: 0, niveau: n });
        return numero;
      }
      const p = pile[pile.length - 1];
      return (p.numero ? p.numero + '.' : '') + (++p.compteur);
    });
  },

  livraison(doc, poidsKg) {
    if (doc.livraisonManuelle !== undefined && doc.livraisonManuelle !== null && doc.livraisonManuelle !== '') return num(doc.livraisonManuelle);
    const z = doc.zoneId && Store.get('zones', doc.zoneId);
    return z ? num(z.forfait) + num(z.prixParTonne) * poidsKg / 1000 : 0;
  },
  coutLivraison(doc, poidsKg) {
    const z = doc.zoneId && Store.get('zones', doc.zoneId);
    return z ? num(z.coutTransporteur) + num(z.coutParTonne) * poidsKg / 1000 : 0;
  },

  doc(doc) {
    let venteF = 0, venteMO = 0, coutF = 0, coutMO = 0, heures = 0, poids = 0, avantRemise = 0;
    const hByMo = {}, parTaux = {};
    for (const l of doc.lignes || []) {
      if (!this.estPrix(l)) continue;
      const q = num(l.qte), r = 1 - num(l.remise) / 100, u = this.unit(l);
      venteF += q * u.f * r; venteMO += q * u.mo * r; avantRemise += q * (u.f + u.mo);
      const tx = this.tauxLigne(doc, l); parTaux[tx] = (parTaux[tx] || 0) + q * (u.f + u.mo) * r;
      coutF += q * u.coutF; coutMO += q * u.coutMO; heures += q * u.heures; poids += q * u.poids;
      for (const k in u.hByMo) hByMo[k] = (hByMo[k] || 0) + q * u.hByMo[k];
    }
    // Lignes au prix du client : majorations masquées réparties (coefficient k) ; remises commerciales des lignes à part
    const lignesHT = venteF + venteMO, k = this.coefMasque(doc);
    const brut = lignesHT * k, brutAvantRemise = avantRemise * k, remiseLignes = brutAvantRemise - brut, majorationMasquee = brut - lignesHT;
    const ajust = this.ajustements(doc).map(a => ({ ...a, montant: this.montantAjustement(a, brut) }));
    const totalAjust = sumBy(ajust, a => a.montant);
    const net = brut + totalAjust;
    const ratio = lignesHT ? net / lignesHT : 1;
    const livraison = this.livraison(doc, poids);
    const totalHT = net + livraison;
    // Ventilation de la TVA par taux : remises / majorations au prorata, livraison au taux du document
    const tDoc = this.tauxDoc(doc);
    Object.keys(parTaux).forEach(k => { parTaux[k] *= ratio; });
    if (livraison) parTaux[tDoc] = (parTaux[tDoc] || 0) + livraison;
    if (!Object.keys(parTaux).length) parTaux[tDoc] = totalHT;
    const ventilation = Object.entries(parTaux).map(([k, base]) => ({ taux: +k, base, tva: base * +k / 100 })).sort((a, b) => b.taux - a.taux);
    const tva = sumBy(ventilation, v => v.tva);
    const coutLivraison = this.coutLivraison(doc, poids);
    const margePrev = totalHT - coutF - coutMO - coutLivraison;
    // Retenue de garantie (factures de situation) : pourcentage du TTC conservé par le client jusqu'à la réception
    const retenue = (totalHT + tva) * num(doc.retenuePct) / 100;
    return {
      ventilation, autoliquidation: !!doc.autoliquidation, tauxDoc: tDoc,
      brut, brutAvantRemise, remiseLignes, majorationMasquee, k, ratio, ajust, totalAjust, net, venteF: venteF * ratio, venteMO: venteMO * ratio,
      coutF, coutMO, heures, hByMo, poids, livraison, totalHT, tva, totalTTC: totalHT + tva, retenue, netAPayer: totalHT + tva - retenue,
      coutLivraison, margePrev, margePrevPct: totalHT ? margePrev / totalHT * 100 : 0,
      partMOPct: net ? venteMO * ratio / net * 100 : 0,
    };
  },

  // Note de frais : montant HT imputé au chantier
  // HT : TTC moins la TVA lue sur le ticket (plusieurs taux possibles), sinon déduit du taux
  fraisHT(f) { return num(f.montantTVA) > 0 && num(f.montantTVA) < num(f.montantTTC) ? num(f.montantTTC) - num(f.montantTVA) : num(f.montantTTC) / (1 + num(f.tauxTVA) / 100); },

  // Situation de travaux (BL) : avancement cumulé par ligne du devis, comparé à la dernière situation acceptée.
  // Les montants tiennent compte des remises / majorations du devis ; la livraison est une ligne à part.
  situation(sit) {
    const dv = Store.get('devis', sit.devisId) || { lignes: [] };
    const t = this.doc(dv), ratio = t.ratio;
    const ordre = x => (x.numero || '~') + (x.date || '');
    const prev = Store.all('situations').filter(x => x.devisId === sit.devisId && x.id !== sit.id && x.statut === 'Acceptée' && ordre(x) < ordre(sit))
      .sort((a, b) => ordre(a).localeCompare(ordre(b))).pop();
    const av = sit.avancements || {}, pav = (prev && prev.avancements) || {};
    const rows = [], numeros = this.numeros(dv);
    (dv.lignes || []).forEach((l, i) => {
      if (l.type === 'chapitre') { rows.push({ chap: true, titre: l.titre, niveau: this.niveau(l), num: numeros[i] }); return; }
      if (!this.estPrix(l)) return;
      rows.push({ key: String(i), num: numeros[i], designation: l.designation, qte: num(l.qte), unite: l.unite || '', tva: this.tauxLigne(dv, l), marche: this.ligneHT(l) * ratio, prec: num(pav[i]), cumul: av[i] === undefined ? num(pav[i]) : num(av[i]) });
    });
    if (t.livraison) rows.push({ key: 'liv', designation: 'Transport / livraison', tva: this.tauxDoc(dv), marche: t.livraison, prec: num(pav.liv), cumul: av.liv === undefined ? num(pav.liv) : num(av.liv) });
    let marche = 0, cumul = 0, precedent = 0;
    rows.filter(r => !r.chap).forEach(r => {
      r.montantCumul = r.marche * r.cumul / 100; r.montantPrec = r.marche * r.prec / 100; r.montant = r.montantCumul - r.montantPrec;
      marche += r.marche; cumul += r.montantCumul; precedent += r.montantPrec;
    });
    const tva = sumBy(rows.filter(r => !r.chap), r => r.montant * num(r.tva) / 100), montant = cumul - precedent;
    // Retenue de garantie : cochée sur la situation (taux repris du chantier par défaut, sauf caution bancaire)
    const af = Store.get('affaires', sit.affaireId) || {};
    const retenuePct = sit.retenue === undefined ? (af.caution ? 0 : num(af.retenueGarantie)) : sit.retenue ? num(sit.retenuePct) : 0;
    const ttc = montant + tva, retenue = ttc * retenuePct / 100;
    return { rows, prev, marche, cumul, precedent, tva, ttc, retenuePct, retenue, netAPayer: ttc - retenue, autoliquidation: !!dv.autoliquidation, montant,
      pctCumul: marche ? cumul / marche * 100 : 0, pctPrec: marche ? precedent / marche * 100 : 0 };
  },

  // Intervention hors devis (régie) : heures pointées valorisées au taux de vente de la catégorie de chaque personne,
  // matériel saisi par les équipes au prix de vente de la bibliothèque.
  horsDevis(af) {
    const temps = Store.all('temps').filter(t => t.affaireId === af.id && t.statut !== 'Refusé' && num(t.heures));
    const consos = Store.all('consommations').filter(c => c.affaireId === af.id);
    const parMo = {};
    temps.forEach(t => {
      const u = Store.get('users', t.userId) || {}, m = Store.get('mainoeuvre', u.categorieId) || {};
      const k = m.id || 'autre';
      const g = parMo[k] = parMo[k] || { moId: m.id || '', libelle: m.libelle || "Main-d'œuvre", taux: num(m.tauxVente) || num(Store.data.settings.tauxHoraireDefaut), heures: 0, cout: 0 };
      g.heures += num(t.heures); g.cout += num(t.heures) * this.tauxUser(t.userId);
    });
    const mo = Object.values(parMo).map(g => ({ ...g, montant: g.heures * g.taux }));
    const totalMO = sumBy(mo, g => g.montant), totalMat = sumBy(consos, c => num(c.qte) * num(c.pu));
    const coutMO = sumBy(mo, g => g.cout), coutMat = sumBy(consos, c => num(c.qte) * num(c.cout));
    return { temps, consos, mo, heures: sumBy(mo, g => g.heures), totalMO, totalMat, total: totalMO + totalMat, coutMO, coutMat,
      aValider: sumBy(temps.filter(t => t.statut !== 'Validé'), t => num(t.heures)) };
  },

  commande(c) {
    return { total: sumBy(c.lignes || [], l => num(l.qte) * num(l.pu)) };
  },

  tauxUser(userId) {
    const u = Store.get('users', userId);
    return u ? num(u.tauxHoraire) : num(Store.data.settings.tauxHoraireDefaut);
  },

  // Facture ou avoir en montants signés (un avoir vient en déduction : montants négatifs)
  facture(f) {
    const t = this.doc(f), k = f.type === 'avoir' ? -1 : 1;
    return { ...t, sens: k, ht: k * t.totalHT, tva: k * t.tva, ttc: k * t.totalTTC, retenueS: k * t.retenue, net: k * t.netAPayer };
  },
  avoirsDe(f) { return Store.all('factures').filter(x => x.type === 'avoir' && x.factureId === f.id); },
  // Reste dû par le client sur une facture : net à payer moins les avoirs qui s'y imputent
  resteDu(f) {
    if (f.type === 'avoir' || ['Payée', 'Annulée'].includes(f.statut)) return 0;
    return Math.max(0, Math.round((this.doc(f).netAPayer - sumBy(this.avoirsDe(f), a => this.doc(a).netAPayer)) * 100) / 100);
  },

  // Achats d'un chantier : commandes (au montant de la facture fournisseur quand elle est rapprochée,
  // sinon au montant commandé) + parts de factures fournisseurs imputées hors commande.
  imputations() { return Store.all('achats').flatMap(f => (f.imputations || []).map(l => ({ ...l, achat: f }))); },
  achatsChantier(afId) {
    const imp = this.imputations();
    const commandes = Store.all('commandes').filter(c => c.affaireId === afId && c.statut !== 'Annulée' && (c.statut !== 'Brouillon' || imp.some(l => l.commandeId === c.id))).map(c => {
      const liees = imp.filter(l => l.commandeId === c.id), commande = this.commande(c).total;
      const facture = sumBy(liees, l => num(l.montantHT));
      return { c, commande, facture, liees, cout: liees.length ? facture : commande };
    });
    const horsCommande = imp.filter(l => l.affaireId === afId && !l.commandeId);
    // Achats au comptoir déclarés avec le montant du BL : comptés tout de suite, jusqu'à la facture du fournisseur
    const comptoir = Store.all('enlevements').filter(e => e.affaireId === afId && e.statut === 'Déclaré' && !e.achatId && num(e.montant) > 0);
    return { commandes, horsCommande, comptoir, totalComptoir: sumBy(comptoir, e => num(e.montant)), totalCommandes: sumBy(commandes, x => x.cout), totalHorsCommande: sumBy(horsCommande, l => num(l.montantHT)),
      ecartFactures: sumBy(commandes.filter(x => x.liees.length), x => x.facture - x.commande) };
  },
  // Facture fournisseur : montants et part restant à imputer (frais généraux / stock)
  achat(f) {
    const ht = num(f.montantHT), tva = f.montantTVA === '' || f.montantTVA === undefined ? ht * num(Store.data.settings.tva) / 100 : num(f.montantTVA);
    const impute = sumBy(f.imputations || [], l => num(l.montantHT));
    return { ht, tva, ttc: ht + tva, impute, reste: Math.round((ht - impute) * 100) / 100 };
  },

  // Pilotage d'un chantier : budget issu du/des devis accepté(s) face au réel (commandes, heures pointées).
  affaire(af) {
    const devis = Store.all('devis').filter(d => d.affaireId === af.id && d.statut === 'Accepté');
    const T = devis.map(d => this.doc(d));
    const factures = Store.all('factures').filter(f => f.affaireId === af.id);
    const temps = Store.all('temps').filter(t => t.affaireId === af.id && t.statut !== 'Refusé');
    const frais = Store.all('frais').filter(f => f.affaireId === af.id && f.statut !== 'Refusée');
    const coutFrais = sumBy(frais, f => this.fraisHT(f));

    const hd = af.type === 'horsDevis' ? this.horsDevis(af) : null;
    const consoCout = sumBy(Store.all('consommations').filter(c => c.affaireId === af.id), c => num(c.qte) * num(c.cout));
    const caDevis = hd ? hd.total : sumBy(T, t => t.totalHT);
    const caFacture = sumBy(factures, f => this.facture(f).ht);
    const retenues = sumBy(factures, f => this.facture(f).retenueS);
    const ca = factures.length ? caFacture : caDevis;
    const budgetF = hd ? hd.coutMat : sumBy(T, t => t.coutF), budgetMO = hd ? hd.coutMO : sumBy(T, t => t.coutMO), budgetLiv = sumBy(T, t => t.coutLivraison);
    const venteF = hd ? hd.totalMat : sumBy(T, t => t.venteF), venteMO = hd ? hd.totalMO : sumBy(T, t => t.venteMO);
    const heuresBudget = sumBy(T, t => t.heures);
    const heuresPrevues = num(af.heuresPrevues) || heuresBudget;
    const heuresPassees = sumBy(temps, t => num(t.heures));
    const coutMO = sumBy(temps, t => num(t.heures) * this.tauxUser(t.userId));
    const ach = this.achatsChantier(af.id);
    const achats = ach.totalCommandes + ach.totalHorsCommande + ach.totalComptoir + consoCout;
    const marge = ca - achats - coutMO - budgetLiv - coutFrais;
    const margePrev = sumBy(T, t => t.margePrev);
    // Projection à terminaison : reste d'heures au coût moyen du devis, fournitures au plus haut du budget et de l'engagé
    const termine = ['Terminé', 'Facturé', 'Clos', 'Commande demandée'].includes(af.statut) || !!hd;
    const resteHeures = termine ? 0 : Math.max(0, heuresPrevues - heuresPassees);
    const coutMoyenH = heuresBudget ? budgetMO / heuresBudget : num(Store.data.settings.tauxHoraireDefaut);
    const coutFFin = termine ? achats : Math.max(achats, budgetF);
    const coutMOFin = coutMO + resteHeures * coutMoyenH;
    const margeFin = (termine ? ca : Math.max(ca, caDevis)) - coutFFin - coutMOFin - budgetLiv - coutFrais;
    const caFin = termine ? ca : Math.max(ca, caDevis);

    // Heures prévues / passées par catégorie de main-d'œuvre
    const hByMo = {};
    T.forEach(t => { for (const k in t.hByMo) (hByMo[k] = hByMo[k] || { prevues: 0, passees: 0 }).prevues += t.hByMo[k]; });
    temps.forEach(t => { const k = (Store.get('users', t.userId) || {}).categorieId || 'autre'; (hByMo[k] = hByMo[k] || { prevues: 0, passees: 0 }).passees += num(t.heures); });

    return {
      nbDevis: devis.length, caDevis, caFacture, ca, resteAFacturer: Math.max(0, caDevis - caFacture),
      venteF, venteMO, budgetF, budgetMO, budgetLiv, achats, achatsDetail: ach, coutMO, coutLivraison: budgetLiv, coutMatiere: achats,
      consoF: budgetF ? achats / budgetF * 100 : 0, consoMO: budgetMO ? coutMO / budgetMO * 100 : 0,
      heuresBudget, heuresPrevues, heuresPassees,
      heuresPlanifiees: sumBy(Store.all('planning').filter(p => p.affaireId === af.id), p => num(p.heuresPrevues)),
      ecartHeures: heuresPassees - heuresPrevues,
      ecartHeuresPct: heuresPrevues ? (heuresPassees - heuresPrevues) / heuresPrevues * 100 : 0,
      avancement: heuresPrevues ? heuresPassees / heuresPrevues * 100 : 0,
      marge, margePct: ca ? marge / ca * 100 : 0, margePrev,
      retenues, retenueALiberer: af.retenueLiberee ? 0 : retenues,
      coutFrais, nbFrais: frais.length, pctFacture: caDevis ? caFacture / caDevis * 100 : 0,
      termine, resteHeures, coutFFin, coutMOFin, margeFin, margeFinPct: caFin ? margeFin / caFin * 100 : 0, margePrevPct: caDevis ? margePrev / caDevis * 100 : 0,
      hByMo,
    };
  },

  charge(userId) {
    const affaires = Store.all('affaires').filter(a => a.chargeId === userId);
    const devis = Store.all('devis').filter(d => d.chargeId === userId);
    const acceptes = devis.filter(d => d.statut === 'Accepté').length;
    const refuses = devis.filter(d => d.statut === 'Refusé').length;
    const stats = affaires.map(a => this.affaire(a));
    const ca = sumBy(stats, s => s.ca), marge = sumBy(stats, s => s.margeFin);
    const hPrev = sumBy(stats, s => s.heuresPrevues), hPass = sumBy(stats, s => s.heuresPassees);
    const notes = affaires.map(a => a.rex && num(a.rex.note)).filter(n => n > 0);
    return {
      nbAffaires: affaires.length, nbDevis: devis.length, acceptes, refuses,
      enAttente: sumBy(devis.filter(d => d.statut === 'Envoyé'), d => this.doc(d).totalHT),
      transfo: (acceptes + refuses) ? acceptes / (acceptes + refuses) * 100 : 0,
      ca, marge, margePct: ca ? marge / ca * 100 : 0,
      hPrev, hPass, ecartPct: hPrev ? (hPass - hPrev) / hPrev * 100 : 0,
      noteMoy: notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : null,
      enCours: affaires.filter(a => ['En préparation', 'En cours'].includes(a.statut)).length,
    };
  },

  // Paie d'une personne sur un mois (« AAAA-MM ») ou une période { du, au } : voir paie.js
  paie(userId, periode) {
    return Paie.calculer({ user: Store.get('users', userId) || { id: userId }, temps: Store.all('temps'), frais: Store.all('frais'), planning: Store.all('planning'), settings: Store.data.settings, periode });
  },
};
