// Retenue de garantie sur une facture (loi n° 71-584 du 16 juillet 1971) : taux plafonné à 5 % du TTC.
// Elle se coche ou se change sur la facture tant que celle-ci n'est ni transmise au comptable, ni déposée en facture
// électronique, ni payée. Module commun navigateur / serveur / tests.
const Retenue = (() => {
  const PLAFOND = 5;
  const modifiable = f => !!f && f.type !== 'avoir' && f.statut === 'Émise' && !f.exportCompta && !f.efacture && !f.datePaiement;
  // Taux enregistré : 0 (sans retenue) ou un taux entre 0 et 10 %
  const taux = v => { const x = Number(String(v ?? '').replace(',', '.')); return x > 0 ? Math.min(10, Math.round(x * 100) / 100) : 0; };
  return { PLAFOND, modifiable, taux };
})();
if (typeof module !== 'undefined') module.exports = Retenue;
