// Retour du chantier vers l'étude (application Études) : ce que Pipe-Fit sait du chantier d'une étude, lu en une fois —
// relevés d'équilibrage et PV de mise en service (débits et pressions mesurés), réserves de conformité levées ou affectées
// sur le chantier, suivi du matériel retenu (pose, mise en service, n° de série, plaque lue). Sans prix ni données
// personnelles autres que le nom de l'intervenant. Module commun serveur Pipe-Fit / démonstration / tests (pur).
const RetourChantier = (() => {
  const RT = () => (typeof ReservesTerrain !== 'undefined' ? ReservesTerrain : require('./reserves-terrain'));
  const txt = (v, k = 200) => String(v == null ? '' : v).trim().slice(0, k);
  const mesure = x => ({ libelle: txt(x.libelle, 200), unite: txt(x.unite, 20), section: txt(x.section, 40), valeur: x.valeur ?? '', ...(x.attendu !== undefined && x.attendu !== '' ? { attendu: x.attendu } : {}), ...(x.reglage ? { reglage: txt(x.reglage, 80) } : {}), ...(Array.isArray(x.alias) ? { alias: x.alias.slice(0, 6) } : {}) });
  const mise = m => ({ id: m.id, numero: txt(m.numero, 30), date: txt(m.date, 10), type: txt(m.type, 20), equipement: txt(m.equipement, 160), repere: txt(m.repere, 40), statut: txt(m.statut, 20), resultat: txt(m.resultat, 60),
    marque: txt(m.marque, 80), modele: txt(m.modele, 120), numeroSerie: txt(m.numeroSerie, 60), materiel: txt(m.materiel, 260), mesures: (m.mesures || []).slice(0, 600).map(mesure),
    ...(Array.isArray(m.courbePompe) && m.courbePompe.length ? { courbePompe: m.courbePompe.slice(0, 40) } : {}) });
  const equilibrage = e => ({ id: e.id, numero: txt(e.numero, 30), date: txt(e.date, 10), type: e.type === 'Hydraulique' ? 'Hydraulique' : 'Aéraulique', installation: txt(e.installation, 160), unite: txt(e.unite, 10), tolerance: e.tolerance ?? '', statut: txt(e.statut, 20),
    lignes: (e.lignes || []).slice(0, 800).map(l => ({ repere: txt(l.repere, 40), local: txt(l.local, 160), type: txt(l.type, 40), theorique: l.theorique ?? '', mesure: l.mesure ?? '', reglage: txt(l.reglage, 80) })) });
  // data : { misesEnService, equilibrages, reserves, suivis } du chantier
  function collecter(data, affaireId, etudeId) {
    const du = r => r && r.affaireId === affaireId;
    const R = RT(), res = (data.reserves || []).filter(du);
    return {
      mises: (data.misesEnService || []).filter(du).map(mise),
      equilibrages: (data.equilibrages || []).filter(du).map(equilibrage),
      reserves: { levees: R.leveesEtude(res, etudeId), affectees: R.affecteesEtude(res, etudeId) },
      suivis: (data.suivis || []).filter(s => s && s.etudeId === etudeId).map(s => ({ cle: s.cle, poseLe: txt(s.poseLe, 10), mesLe: txt(s.mesLe, 10), serie: txt(s.serie, 60), plaque: s.plaque || null, substitution: s.substitution || null })),
    };
  }
  return { collecter };
})();
if (typeof module !== 'undefined') module.exports = RetourChantier;
