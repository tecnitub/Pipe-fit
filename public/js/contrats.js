// Contrat d'entretien d'une installation livrée, construit à partir du carnet de maintenance du DOE (ou des opérations
// usuelles des équipements mis en service) : visites planifiées sur la durée du contrat, rappels des visites à venir ou en
// retard, compte rendu de visite, échéances de facturation. Le contrat est enregistré sur le chantier (affaire.contrat).
// Module commun navigateur / serveur (rappels) / démo / tests.
const Contrats = (() => {
  const txt = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
  const PERIODES = { annuelle: 12, semestrielle: 6, trimestrielle: 3, mensuelle: 1 };
  // Fréquence d'une opération du carnet (« Annuelle », « Semestrielle », « tous les 3 mois », « 12 »…) en mois
  function frequenceMois(f) {
    const s = String(f || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/hebdo/.test(s)) return 1; if (/mensuel/.test(s)) return 1; if (/trimestr/.test(s)) return 3; if (/semestr/.test(s)) return 6; if (/bisannuel|2 ans|biennal/.test(s)) return 24; if (/annuel|an\b|12/.test(s)) return 12;
    const m = /(\d+)\s*mois/.exec(s) || /^(\d+)$/.exec(s); return m ? Math.max(1, Math.min(60, +m[1])) : 12;
  }
  const plusMois = (iso, n) => { const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`), j = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(j, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return d.toISOString().slice(0, 10); };
  // Opérations du carnet : [équipement, opération, fréquence, intervenant] (DOE) ou { equipement, operation, frequence, intervenant }
  const operation = l => (Array.isArray(l) ? { equipement: txt(l[0]), operation: txt(l[1]), frequence: txt(l[2]), intervenant: txt(l[3]) } : { equipement: txt(l.equipement), operation: txt(l.operation), frequence: txt(l.frequence), intervenant: txt(l.intervenant) });
  // Contrat créé depuis le carnet : visites regroupées par date (toutes les opérations échues à la même date)
  function creer({ carnet = [], debut, dureeMois = 12, montantAnnuel = 0, facturation = 'annuelle', origine = '' } = {}) {
    const ops = carnet.map(operation).filter(o => o.operation), visites = new Map();
    ops.forEach(o => {
      const f = frequenceMois(o.frequence);
      for (let m = f; m <= dureeMois; m += f) {
        const date = plusMois(debut, m), v = visites.get(date) || { id: `v${date.replace(/-/g, '')}`, prevue: date, operations: [], statut: 'à faire' };
        v.operations.push({ ...o, frequenceMois: f, faite: false }); visites.set(date, v);
      }
    });
    return { actif: true, debut, dureeMois: Number(dureeMois) || 12, montantAnnuel: Number(montantAnnuel) || 0, facturation: PERIODES[facturation] ? facturation : 'annuelle', origine,
      carnet: ops, visites: [...visites.values()].sort((a, b) => a.prevue.localeCompare(b.prevue)), factures: [] };
  }
  const jours = (iso, auj) => Math.round((Date.parse(`${iso}T12:00:00`) - Date.parse(`${auj}T12:00:00`)) / 864e5);
  // État d'une visite : faite, en retard, à venir (dans le délai d'alerte) ou planifiée
  function etatVisite(v, auj, alerte = 30) {
    if (v.statut === 'faite') return 'faite';
    const j = jours(v.prevue, auj);
    return j < 0 ? 'retard' : j <= alerte ? 'bientot' : 'planifiee';
  }
  // Rappels : visites en retard et à venir dans le délai d'alerte
  const rappels = (c, auj, alerte = 30) => ((c && c.actif && c.visites) || []).map(v => ({ v, etat: etatVisite(v, auj, alerte), jours: jours(v.prevue, auj) })).filter(x => x.etat === 'retard' || x.etat === 'bientot');
  // Échéances de facturation : une par période (annuelle, semestrielle…), montant au prorata, facture liée si émise
  function echeances(c) {
    if (!c || !(c.montantAnnuel > 0)) return [];
    const p = PERIODES[c.facturation] || 12, n = Math.max(1, Math.ceil(c.dureeMois / p));
    return Array.from({ length: n }, (_, i) => { const du = plusMois(c.debut, i * p), au = plusMois(c.debut, Math.min(c.dureeMois, (i + 1) * p)), cle = `${du}`;
      const f = (c.factures || []).find(x => x.periode === cle);
      return { periode: cle, du, au, montant: Math.round(c.montantAnnuel * Math.min(p, c.dureeMois - i * p) / 12 * 100) / 100, factureId: f ? f.factureId : '' }; });
  }
  // Lignes de la facture d'une échéance
  const lignesFacture = (c, e, chantier) => [{ designation: `Contrat d'entretien${chantier ? ` — ${chantier}` : ''} : période du ${e.du.split('-').reverse().join('/')} au ${e.au.split('-').reverse().join('/')}`, unite: 'forfait', qte: 1, pu: e.montant }];
  // Synthèse : visites faites, en retard, à venir ; prochaine visite
  function bilan(c, auj) {
    const v = (c && c.visites) || [], e = v.map(x => etatVisite(x, auj));
    const prochaine = v.filter(x => x.statut !== 'faite').sort((a, b) => a.prevue.localeCompare(b.prevue))[0] || null;
    return { total: v.length, faites: e.filter(x => x === 'faite').length, retard: e.filter(x => x === 'retard').length, bientot: e.filter(x => x === 'bientot').length, prochaine, fin: c && c.debut ? plusMois(c.debut, c.dureeMois) : '' };
  }
  // Visite faite : opérations cochées, date, technicien, observations
  function marquerFaite(c, id, { date, par, observations = '', operations } = {}) {
    const v = (c.visites || []).find(x => x.id === id); if (!v) return c;
    v.operations.forEach((o, i) => { o.faite = operations ? !!operations[i] : true; });
    Object.assign(v, { statut: 'faite', faiteLe: txt(date, 10), par: txt(par, 80), observations: txt(observations, 2000) });
    return c;
  }
  // Renouvellement : nouveau contrat à la suite du précédent, mêmes opérations et conditions
  const renouveler = c => ({ ...creer({ carnet: c.carnet, debut: plusMois(c.debut, c.dureeMois), dureeMois: c.dureeMois, montantAnnuel: c.montantAnnuel, facturation: c.facturation, origine: c.origine }), precedent: { debut: c.debut, fin: plusMois(c.debut, c.dureeMois) } });
  return { PERIODES, frequenceMois, plusMois, creer, etatVisite, rappels, echeances, lignesFacture, bilan, marquerFaite, renouveler };
})();
if (typeof module !== 'undefined') module.exports = Contrats;
