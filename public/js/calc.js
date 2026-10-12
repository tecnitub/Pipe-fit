// Calculs métier : totaux de devis/factures, livraison, rentabilité par affaire et par chargé d'affaires.
const num = v => (v === '' || v == null || isNaN(+v)) ? 0 : +v;

const Calc = {
  ligneHT(l) { return num(l.qte) * num(l.pu) * (1 - num(l.remise) / 100); },

  // Livraison : forfait de zone + prix à la tonne, sauf montant forcé sur le document.
  livraison(doc, poidsKg) {
    if (doc.livraisonManuelle !== undefined && doc.livraisonManuelle !== null && doc.livraisonManuelle !== '') {
      return num(doc.livraisonManuelle);
    }
    const z = doc.zoneId && Store.get('zones', doc.zoneId);
    if (!z) return 0;
    return num(z.forfait) + num(z.prixParTonne) * poidsKg / 1000;
  },

  coutLivraison(doc, poidsKg) {
    const z = doc.zoneId && Store.get('zones', doc.zoneId);
    if (!z) return 0;
    return num(z.coutTransporteur) + num(z.coutParTonne) * poidsKg / 1000;
  },

  doc(doc) {
    const s = Store.data.settings;
    const lignes = doc.lignes || [];
    const brut = lignes.reduce((t, l) => t + this.ligneHT(l), 0);
    const remiseGlobale = brut * num(doc.remiseGlobale) / 100;
    const netMarchandise = brut - remiseGlobale;
    const poids = lignes.reduce((t, l) => t + num(l.qte) * num(l.poids), 0);
    const livraison = this.livraison(doc, poids);
    const totalHT = netMarchandise + livraison;
    const tva = totalHT * num(s.tva) / 100;
    const coutMatiere = lignes.reduce((t, l) => t + num(l.qte) * num(l.cout), 0);
    const heures = lignes.reduce((t, l) => t + num(l.qte) * num(l.heures), 0);
    const coutLivraison = this.coutLivraison(doc, poids);
    const coutMO = heures * num(s.tauxHoraireDefaut);
    const margePrev = totalHT - coutMatiere - coutMO - coutLivraison;
    return {
      brut, remiseGlobale, netMarchandise, poids, livraison, totalHT, tva, totalTTC: totalHT + tva,
      coutMatiere, heures, coutMO, coutLivraison, margePrev, margePrevPct: totalHT ? margePrev / totalHT * 100 : 0,
    };
  },

  tauxUser(userId) {
    const u = Store.get('users', userId);
    return u ? num(u.tauxHoraire) : num(Store.data.settings.tauxHoraireDefaut);
  },

  affaire(af) {
    const devis = Store.all('devis').filter(d => d.affaireId === af.id);
    const acceptes = devis.filter(d => d.statut === 'Accepté');
    const factures = Store.all('factures').filter(f => f.affaireId === af.id);
    const temps = Store.all('temps').filter(t => t.affaireId === af.id);

    const sum = (arr, fn) => arr.reduce((t, x) => t + fn(x), 0);
    const totDevis = acceptes.map(d => this.doc(d));
    const totFact = factures.map(f => this.doc(f));

    const caDevis = sum(totDevis, t => t.totalHT);
    const caFacture = sum(totFact, t => t.totalHT);
    const base = totFact.length ? totFact : totDevis;
    const ca = totFact.length ? caFacture : caDevis;
    const coutMatiere = sum(base, t => t.coutMatiere);
    const coutLivraison = sum(base, t => t.coutLivraison);
    const heuresEstimees = sum(totDevis, t => t.heures);
    const heuresPrevues = num(af.heuresPrevues) || heuresEstimees;
    const heuresPassees = sum(temps, t => num(t.heures));
    const coutMO = sum(temps, t => num(t.heures) * this.tauxUser(t.userId));
    const marge = ca - coutMatiere - coutMO - coutLivraison;
    const margePrev = sum(totDevis, t => t.margePrev);
    const heuresPlanifiees = sum(Store.all('planning').filter(p => p.affaireId === af.id), p => num(p.heuresPrevues));

    return {
      nbDevis: devis.length, caDevis, caFacture, ca, coutMatiere, coutLivraison, coutMO,
      heuresEstimees, heuresPrevues, heuresPassees, heuresPlanifiees,
      ecartHeures: heuresPassees - heuresPrevues,
      ecartHeuresPct: heuresPrevues ? (heuresPassees - heuresPrevues) / heuresPrevues * 100 : 0,
      avancement: heuresPrevues ? heuresPassees / heuresPrevues * 100 : 0,
      marge, margePct: ca ? marge / ca * 100 : 0,
      margePrev, margePrevPct: caDevis ? margePrev / caDevis * 100 : 0,
      resteAFacturer: Math.max(0, caDevis - caFacture),
    };
  },

  charge(userId) {
    const affaires = Store.all('affaires').filter(a => a.chargeId === userId);
    const ids = new Set(affaires.map(a => a.id));
    const devis = Store.all('devis').filter(d => ids.has(d.affaireId));
    const acceptes = devis.filter(d => d.statut === 'Accepté').length;
    const refuses = devis.filter(d => d.statut === 'Refusé').length;
    const stats = affaires.map(a => this.affaire(a));
    const sum = fn => stats.reduce((t, x) => t + fn(x), 0);
    const ca = sum(s => s.ca);
    const marge = sum(s => s.marge);
    const hPrev = sum(s => s.heuresPrevues);
    const hPass = sum(s => s.heuresPassees);
    const notes = affaires.map(a => a.rex && num(a.rex.note)).filter(n => n > 0);
    return {
      nbAffaires: affaires.length, nbDevis: devis.length, acceptes, refuses,
      transfo: (acceptes + refuses) ? acceptes / (acceptes + refuses) * 100 : 0,
      ca, marge, margePct: ca ? marge / ca * 100 : 0,
      hPrev, hPass, ecartPct: hPrev ? (hPass - hPrev) / hPrev * 100 : 0,
      noteMoy: notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : null,
      enCours: affaires.filter(a => ['En production', 'Devis envoyé', 'Prospect'].includes(a.statut)).length,
    };
  },
};
