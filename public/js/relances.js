// Relances des factures impayées et libération des retenues de garantie : règles communes (navigateur, démo, tests).
// Niveaux par défaut : rappel courtois à J+1 après l'échéance, 2e relance à J+15, dernière relance à J+30, mise en demeure à J+45
// (délais réglables dans Paramètres → settings.relances). Un niveau n'est proposé que si le précédent a été envoyé depuis 7 jours.
const Relances = (() => {
  const NIVEAUX = [
    { cle: 'relance1', lib: '1re relance', court: 'Rappel', jours: 1 },
    { cle: 'relance2', lib: '2e relance', court: 'Relance 2', jours: 15 },
    { cle: 'relance3', lib: 'Dernière relance', court: 'Relance 3', jours: 30 },
    { cle: 'demeure', lib: 'Mise en demeure', court: 'Mise en demeure', jours: 45 },
  ];
  const INTERVALLE = 7; // jours minimum entre deux relances
  const jour = s => new Date(`${String(s).slice(0, 10)}T12:00:00`);
  const ecart = (a, b) => Math.round((jour(b) - jour(a)) / 86400000);
  const ajouter = (s, n) => { const d = jour(s); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  const niveaux = (settings = {}) => NIVEAUX.map(n => ({ ...n, jours: Number(((settings.relances || {})[n.cle])) || n.jours }));
  const joursRetard = (f, auj) => (f.echeance ? Math.max(0, ecart(f.echeance, auj)) : 0);
  // Relances déjà envoyées (les notes d'appel ne comptent pas comme un niveau)
  const envoyees = f => (f.relances || []).filter(r => NIVEAUX.some(n => n.cle === r.niveau)).sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // Où en est une facture impayée : { retard, derniere, prochaine, du (à envoyer aujourd'hui), le (date à partir de laquelle) }
  function etat(f, auj, settings) {
    const N = niveaux(settings), retard = joursRetard(f, auj), faites = envoyees(f), derniere = faites[faites.length - 1] || null;
    const rang = derniere ? N.findIndex(n => n.cle === derniere.niveau) : -1;
    const prochaine = N[rang + 1] || null;
    let le = '';
    if (prochaine && f.echeance) {
      le = ajouter(f.echeance, prochaine.jours);
      if (derniere && ajouter(derniere.date, INTERVALLE) > le) le = ajouter(derniere.date, INTERVALLE);
    }
    return { retard, derniere, prochaine, le, du: !!(prochaine && le && le <= auj), epuise: !prochaine };
  }

  // Retenue de garantie d'un chantier : libérable un an après la réception (sauf caution ou déjà libérée)
  function retenue(a, montant, auj) {
    if (!montant || a.caution || a.retenueLiberee) return null;
    if (!a.dateReception) return { etat: 'sans-reception', le: '' };
    const le = ajouter(a.dateReception, 365);
    return { etat: le <= auj ? 'liberable' : 'a-venir', le, dans: ecart(auj, le) };
  }
  return { NIVEAUX, INTERVALLE, niveaux, joursRetard, envoyees, etat, retenue, ajouter, ecart };
})();
if (typeof module !== 'undefined') module.exports = Relances;
