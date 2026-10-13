// Calculs métier : prix des ouvrages (fournitures + main-d'œuvre), totaux de devis/factures,
// livraison, pilotage de chantier (budget vs réel), commandes, synthèse par chargé d'affaires.
const num = v => (v === '' || v == null || isNaN(+v)) ? 0 : +v;
const sumBy = (arr, fn) => arr.reduce((t, x) => t + fn(x), 0);

const Calc = {
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

  // Remises (pourcentage négatif) et majorations (positif) appliquées à l'ensemble des lignes.
  ajustements(doc) {
    const list = (doc.ajustements || []).map(a => ({ ...a }));
    if (num(doc.remiseGlobale)) list.unshift({ libelle: 'Remise', pct: -num(doc.remiseGlobale) });
    return list;
  },

  // Sous-totaux par chapitre : { indexDeLigne: montant } sur la dernière ligne de chaque chapitre
  chapitres(doc) {
    const res = [];
    let cur = null;
    (doc.lignes || []).forEach((l, i) => {
      if (l.type === 'chapitre') { cur = { index: i, titre: l.titre, total: 0, last: i }; res.push(cur); return; }
      if (cur) { cur.total += this.ligneHT(l); cur.last = i; }
    });
    return res;
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
    let venteF = 0, venteMO = 0, coutF = 0, coutMO = 0, heures = 0, poids = 0;
    const hByMo = {};
    for (const l of doc.lignes || []) {
      if (l.type === 'chapitre') continue;
      const q = num(l.qte), r = 1 - num(l.remise) / 100, u = this.unit(l);
      venteF += q * u.f * r; venteMO += q * u.mo * r;
      coutF += q * u.coutF; coutMO += q * u.coutMO; heures += q * u.heures; poids += q * u.poids;
      for (const k in u.hByMo) hByMo[k] = (hByMo[k] || 0) + q * u.hByMo[k];
    }
    const brut = venteF + venteMO;
    const ajust = this.ajustements(doc).map(a => ({ ...a, montant: brut * num(a.pct) / 100 }));
    const totalAjust = sumBy(ajust, a => a.montant);
    const net = brut + totalAjust;
    const ratio = brut ? net / brut : 1;
    const livraison = this.livraison(doc, poids);
    const totalHT = net + livraison;
    const tva = totalHT * num(Store.data.settings.tva) / 100;
    const coutLivraison = this.coutLivraison(doc, poids);
    const margePrev = totalHT - coutF - coutMO - coutLivraison;
    return {
      brut, ajust, totalAjust, net, venteF: venteF * ratio, venteMO: venteMO * ratio,
      coutF, coutMO, heures, hByMo, poids, livraison, totalHT, tva, totalTTC: totalHT + tva,
      coutLivraison, margePrev, margePrevPct: totalHT ? margePrev / totalHT * 100 : 0,
      partMOPct: net ? venteMO * ratio / net * 100 : 0,
    };
  },

  commande(c) {
    return { total: sumBy(c.lignes || [], l => num(l.qte) * num(l.pu)) };
  },

  tauxUser(userId) {
    const u = Store.get('users', userId);
    return u ? num(u.tauxHoraire) : num(Store.data.settings.tauxHoraireDefaut);
  },

  // Pilotage d'un chantier : budget issu du/des devis accepté(s) face au réel (commandes, heures pointées).
  affaire(af) {
    const devis = Store.all('devis').filter(d => d.affaireId === af.id && d.statut === 'Accepté');
    const T = devis.map(d => this.doc(d));
    const factures = Store.all('factures').filter(f => f.affaireId === af.id);
    const commandes = Store.all('commandes').filter(c => c.affaireId === af.id && c.statut !== 'Annulée' && c.statut !== 'Brouillon');
    const temps = Store.all('temps').filter(t => t.affaireId === af.id);

    const caDevis = sumBy(T, t => t.totalHT);
    const caFacture = sumBy(factures, f => this.doc(f).totalHT);
    const ca = factures.length ? caFacture : caDevis;
    const budgetF = sumBy(T, t => t.coutF), budgetMO = sumBy(T, t => t.coutMO), budgetLiv = sumBy(T, t => t.coutLivraison);
    const venteF = sumBy(T, t => t.venteF), venteMO = sumBy(T, t => t.venteMO);
    const heuresBudget = sumBy(T, t => t.heures);
    const heuresPrevues = num(af.heuresPrevues) || heuresBudget;
    const heuresPassees = sumBy(temps, t => num(t.heures));
    const coutMO = sumBy(temps, t => num(t.heures) * this.tauxUser(t.userId));
    const achats = sumBy(commandes, c => this.commande(c).total);
    const marge = ca - achats - coutMO - budgetLiv;
    const margePrev = sumBy(T, t => t.margePrev);
    // Projection à terminaison : reste d'heures au coût moyen du devis, fournitures au plus haut du budget et de l'engagé
    const termine = ['Terminé', 'Facturé', 'Clos'].includes(af.statut);
    const resteHeures = termine ? 0 : Math.max(0, heuresPrevues - heuresPassees);
    const coutMoyenH = heuresBudget ? budgetMO / heuresBudget : num(Store.data.settings.tauxHoraireDefaut);
    const coutFFin = termine ? achats : Math.max(achats, budgetF);
    const coutMOFin = coutMO + resteHeures * coutMoyenH;
    const margeFin = (termine ? ca : Math.max(ca, caDevis)) - coutFFin - coutMOFin - budgetLiv;
    const caFin = termine ? ca : Math.max(ca, caDevis);

    // Heures prévues / passées par catégorie de main-d'œuvre
    const hByMo = {};
    T.forEach(t => { for (const k in t.hByMo) (hByMo[k] = hByMo[k] || { prevues: 0, passees: 0 }).prevues += t.hByMo[k]; });
    temps.forEach(t => { const k = (Store.get('users', t.userId) || {}).categorieId || 'autre'; (hByMo[k] = hByMo[k] || { prevues: 0, passees: 0 }).passees += num(t.heures); });

    return {
      nbDevis: devis.length, caDevis, caFacture, ca, resteAFacturer: Math.max(0, caDevis - caFacture),
      venteF, venteMO, budgetF, budgetMO, budgetLiv, achats, coutMO, coutLivraison: budgetLiv, coutMatiere: achats,
      consoF: budgetF ? achats / budgetF * 100 : 0, consoMO: budgetMO ? coutMO / budgetMO * 100 : 0,
      heuresBudget, heuresPrevues, heuresPassees,
      heuresPlanifiees: sumBy(Store.all('planning').filter(p => p.affaireId === af.id), p => num(p.heuresPrevues)),
      ecartHeures: heuresPassees - heuresPrevues,
      ecartHeuresPct: heuresPrevues ? (heuresPassees - heuresPrevues) / heuresPrevues * 100 : 0,
      avancement: heuresPrevues ? heuresPassees / heuresPrevues * 100 : 0,
      marge, margePct: ca ? marge / ca * 100 : 0, margePrev,
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

  // Paie : découpage des heures en normales / supplémentaires (25 %, 50 %) semaine par semaine,
  // puis rattachement au mois de chaque jour.
  paie(userId, mois) {
    const s = Store.data.settings;
    const base = num(s.dureeHebdo) || 35, seuil50 = num(s.seuilHS50) || 43;
    const parJour = {};
    Store.all('temps').filter(t => t.userId === userId && t.heures).forEach(t => { parJour[t.date] = (parJour[t.date] || 0) + num(t.heures); });
    const cumul = {};
    const res = { jours: 0, total: 0, normales: 0, hs25: 0, hs50: 0 };
    Object.keys(parJour).sort().forEach(date => {
      const wk = isoWeek(new Date(date)), h = parJour[date];
      const avant = cumul[wk] || 0, apres = avant + h;
      cumul[wk] = apres;
      if (!date.startsWith(mois)) return;
      const n = Math.max(0, Math.min(apres, base) - avant);
      const h25 = Math.max(0, Math.min(apres, seuil50) - Math.max(avant, base));
      const h50 = Math.max(0, apres - Math.max(avant, seuil50));
      res.jours++; res.total += h; res.normales += n; res.hs25 += h25; res.hs50 += h50;
    });
    const u = Store.get('users', userId) || {};
    const tx = num(u.salaireHoraire);
    res.brut = tx * (res.normales + res.hs25 * 1.25 + res.hs50 * 1.5);
    return res;
  },
};
