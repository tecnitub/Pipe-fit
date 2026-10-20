// Rapprochement des factures fournisseurs, ligne à ligne : ce qui est facturé face à ce qui a été commandé
// (prix, quantités) et réellement livré (réceptions enregistrées sur la commande).
// Module commun navigateur / tests.
const Rapprochement = (() => {
  const TOL = { prixPct: 1, prixMin: 0.02, montantMin: 1 }; // écart de prix toléré : 1 % (2 centimes au moins) ; écarts de moins de 1 € ignorés
  const r2 = v => Math.round(v * 100) / 100;
  const num = v => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, '')) || 0);
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\bdn (\d+)/g, 'dn$1').trim();
  // Dimensions d'une désignation (DN50 -> 50, « 90 » degrés…) : deux articles de dimensions différentes ne se rapprochent pas
  const dimensions = M => new Set([...M].map(m => (/^dn(\d+)$/.exec(m) || /^(\d+)$/.exec(m) || [])[1]).filter(Boolean));
  const mots = s => new Set(norm(s).split(' ').filter(m => m.length > 1));
  // Ressemblance de deux désignations (0 à 1) : mots communs, les nombres (DN, diamètres, épaisseurs) comptent double
  function ressemblance(a, b) {
    const A = mots(a), B = mots(b);
    if (!A.size || !B.size) return 0;
    let commun = 0, total = 0;
    const poids = m => (/\d/.test(m) ? 2 : 1);
    new Set([...A, ...B]).forEach(m => { total += poids(m); if (A.has(m) && B.has(m)) commun += poids(m); });
    // Dimensions incompatibles (DN50 / DN100, 90° / 45°) : ce n'est pas le même article ; une désignation plus courte (sans l'angle) reste possible
    const dA = dimensions(A), dB = dimensions(B);
    if (dA.size && dB.size && ![...dA].every(x => dB.has(x)) && ![...dB].every(x => dA.has(x))) return 0;
    return commun / total;
  }
  const FRAIS = /\b(port|transport|livraison|emballage|frais|eco ?participation|taxe|palette|consigne)\b/;

  // Quantité reçue d'une ligne de commande : réceptions enregistrées, sinon tout si la commande est réceptionnée
  const recue = (c, l) => (l.qteRecue !== undefined && l.qteRecue !== '' ? num(l.qteRecue) : c.statut === 'Réceptionnée' ? num(l.qte) : 0);

  // facture : { lignes:[{designation, reference, articleId, qte, pu, montantHT}], montantHT }
  // commandes : commandes rapprochées (lignes avec qte, pu, qteRecue)
  // dejaFacture : « commandeId|index » -> quantité déjà facturée par d'autres factures
  function analyser(facture, commandes, dejaFacture = new Map(), articles = []) {
    const cands = commandes.flatMap(c => (c.lignes || []).map((l, i) => ({ c, l, i, cle: `${c.id}|${i}`, ref: ((articles.find(a => a.id === l.articleId) || {}).ref || '') })));
    const pris = new Set();
    const lignes = (facture.lignes || []).map(lf => {
      // Meilleure ligne de commande : même article, même référence, ou désignation la plus proche
      let best = null, score = 0;
      cands.filter(x => !pris.has(x.cle)).forEach(x => {
        let s = 0;
        if (lf.articleId && lf.articleId === x.l.articleId) s = 1;
        else if (lf.reference && x.ref && norm(lf.reference) === norm(x.ref)) s = 0.95;
        else s = ressemblance(lf.designation, x.l.designation);
        if (s > score) { score = s; best = x; }
      });
      const qf = num(lf.qte), puf = num(lf.pu) || (qf ? num(lf.montantHT) / qf : 0), mf = lf.montantHT !== undefined && lf.montantHT !== '' ? num(lf.montantHT) : r2(qf * puf);
      if (!best || score < 0.5) return { facture: lf, qte: qf, pu: puf, montant: mf, cmd: null, frais: FRAIS.test(norm(lf.designation)), ecarts: [], ecart: 0 };
      pris.add(best.cle);
      const { c, l } = best, puc = num(l.pu), qc = num(l.qte), deja = num(dejaFacture.get(best.cle));
      const qr = recue(c, l), ecarts = [];
      if (Math.abs(puf - puc) > Math.max(TOL.prixMin, puc * TOL.prixPct / 100)) ecarts.push({ type: 'prix', attendu: puc, facture: puf, montant: r2((puf - puc) * qf) });
      const dispoRecu = r2(qr - deja), dispoCde = r2(qc - deja);
      if (qf > dispoCde + 1e-9) ecarts.push({ type: 'commande', attendu: dispoCde, facture: qf, montant: r2((qf - dispoCde) * puf) });
      else if (qf > dispoRecu + 1e-9) ecarts.push({ type: 'livraison', attendu: Math.max(0, dispoRecu), facture: qf, montant: r2((qf - Math.max(0, dispoRecu)) * puf) });
      return { facture: lf, qte: qf, pu: puf, montant: mf, cmd: { commandeId: c.id, numero: c.numero, index: best.i, designation: l.designation, qte: qc, pu: puc, recu: qr, deja }, score: r2(score), ecarts,
        ecart: r2(ecarts.reduce((t, e) => t + e.montant, 0)) };
    });
    // Lignes livrées et pas encore facturées (ni ici ni ailleurs) : rien à signaler, juste pour information
    const nonFacturees = cands.filter(x => !pris.has(x.cle) && recue(x.c, x.l) - num(dejaFacture.get(x.cle)) > 1e-9)
      .map(x => ({ commandeId: x.c.id, numero: x.c.numero, index: x.i, designation: x.l.designation, reste: r2(recue(x.c, x.l) - num(dejaFacture.get(x.cle))), pu: num(x.l.pu) }));
    const horsCommande = lignes.filter(l => !l.cmd);
    const totalLignes = r2(lignes.reduce((t, l) => t + l.montant, 0));
    const ecartTotal = facture.montantHT !== undefined && facture.montantHT !== '' ? r2(num(facture.montantHT) - totalLignes) : 0;
    const ecart = r2(lignes.reduce((t, l) => t + l.ecart, 0) + horsCommande.reduce((t, l) => t + l.montant, 0) + ecartTotal);
    const significatif = lignes.some(l => Math.abs(l.ecart) >= TOL.montantMin) || horsCommande.some(l => Math.abs(l.montant) >= TOL.montantMin) || Math.abs(ecartTotal) >= TOL.montantMin;
    return { lignes, horsCommande, nonFacturees, totalLignes, ecartTotal, ecart, statut: !lignes.length ? 'vide' : significatif ? 'ecarts' : 'conforme' };
  }

  // Quantités déjà facturées par les autres factures (lignes rapprochées)
  function dejaFactureHors(achats, achatId) {
    const m = new Map();
    achats.filter(a => a.id !== achatId).forEach(a => (a.rapprochementLignes || []).forEach(x => { if (x.cle) m.set(x.cle, num(m.get(x.cle)) + num(x.qte)); }));
    return m;
  }
  const LIB = { prix: 'Prix différent de la commande', commande: 'Quantité au-delà de la commande', livraison: 'Quantité au-delà de la livraison' };

  return { analyser, ressemblance, dejaFactureHors, recue, LIB, TOL };
})();
if (typeof module !== 'undefined') module.exports = Rapprochement;
