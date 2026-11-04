// Autorisations délivrées par l'employeur à partir des habilitations : conduite de nacelle (PEMP), de chariot
// élévateur, de pont roulant (Code du travail R4323-55 à R4323-57 : aptitude médicale, formation / CACES,
// connaissance des lieux) et travail en hauteur avec port du harnais (R4323-104 et R4323-106).
// Contrôle des conditions, validité, fiche récapitulative des habilitations à jour et suivi des plans de
// prévention annuels des clients. Module partagé navigateur / serveur.
const Autorisations = (() => {
  const TYPES = [
    { cle: 'caces_nacelle', court: 'Nacelle', titre: 'Autorisation de conduite', objet: 'Plates-formes élévatrices mobiles de personnes (PEMP, nacelles)',
      formation: 'CACES R486', categories: 'A (déplacement en position de transport), B (déplacement en position de travail), C (conduite hors production)',
      textes: 'Articles R4323-55 à R4323-57 du Code du travail ; arrêté du 2 décembre 1998 ; recommandation CNAM R486' },
    { cle: 'caces_chariot', court: 'Chariot', titre: 'Autorisation de conduite', objet: 'Chariots de manutention automoteurs à conducteur porté (chariots élévateurs)',
      formation: 'CACES R489', categories: '1A, 1B, 2A, 2B, 3, 4, 5, 6, 7',
      textes: 'Articles R4323-55 à R4323-57 du Code du travail ; arrêté du 2 décembre 1998 ; recommandation CNAM R489' },
    { cle: 'pont', court: 'Pont', titre: 'Autorisation de conduite', objet: 'Ponts roulants, portiques et palans de levage',
      formation: 'CACES R484 ou formation à la conduite des ponts roulants', categories: '1 (commande au sol), 2 (commande en cabine)',
      textes: 'Articles R4323-55 à R4323-57 du Code du travail ; arrêté du 2 décembre 1998 ; recommandation CNAM R484' },
    { cle: 'hauteur', court: 'Hauteur', titre: 'Autorisation de travail en hauteur', objet: 'Travail en hauteur avec port du harnais antichute (équipement de protection individuelle)',
      formation: 'Formation au travail en hauteur et au port du harnais', categories: 'Harnais avec longe ou antichute à rappel automatique, ligne de vie, point d\'ancrage',
      textes: 'Articles R4323-104 et R4323-106 du Code du travail (formation et entraînement au port des EPI contre les chutes de hauteur)' },
  ];
  const type = cle => TYPES.find(t => t.cle === cle);
  const derniere = (habs, uid, cle) => habs.filter(h => h.userId === uid && h.cle === cle).sort((a, b) => (b.expire || '').localeCompare(a.expire || ''))[0] || null;
  const valide = (h, auj) => !!h && (!h.expire || h.expire >= auj) && (!h.obtenue || h.obtenue <= auj);

  // Aptitude médicale : seule condition indispensable (le CACES n'est pas obligatoire : l'employeur peut former et
  // évaluer lui-même le salarié, R4323-55 et R4323-56)
  function aptitude(uid, habs, auj) {
    const v = derniere(habs, uid, 'visite');
    if (!v) return { ok: false, motif: 'aucune visite médicale enregistrée', visite: null };
    if (!valide(v, auj)) return { ok: false, motif: `visite médicale échue le ${fr(v.expire)}`, visite: v };
    if (/inapte/i.test(v.niveau || '')) return { ok: false, motif: 'avis médical d\'inaptitude', visite: v };
    return { ok: true, motif: '', visite: v };
  }
  // Conditions de délivrance d'une autorisation : habilitation (CACES / formation) en cours de validité et visite
  // médicale à jour. Validité de l'autorisation = la plus proche des deux échéances.
  function conditions(uid, cle, habs, auj) {
    const h = derniere(habs, uid, cle), v = derniere(habs, uid, 'visite'), motifs = [];
    if (!h) motifs.push(`aucune ${cle === 'hauteur' ? 'formation au travail en hauteur' : 'formation / CACES'} enregistrée`);
    else if (!valide(h, auj)) motifs.push(`${type(cle).formation} expiré le ${fr(h.expire)}`);
    if (!v) motifs.push('aucune visite médicale enregistrée');
    else if (!valide(v, auj)) motifs.push(`visite médicale échue le ${fr(v.expire)}`);
    else if (/inapte/i.test(v.niveau || '')) motifs.push('avis médical d\'inaptitude');
    const fins = [h && h.expire, v && v.expire].filter(Boolean).sort();
    return { ok: !motifs.length, motifs, hab: h, visite: v, jusqua: fins[0] || '' };
  }
  // Autorisations possibles pour une personne (types dont elle a l'habilitation), avec leurs conditions
  const pourPersonne = (uid, habs, auj) => TYPES.filter(t => derniere(habs, uid, t.cle)).map(t => ({ ...t, ...conditions(uid, t.cle, habs, auj) }));

  // Visite médicale : rendez-vous à prendre (échue ou dans les 60 jours, sans rendez-vous pris)
  function rendezVousVisite(h, auj, seuil = 60) {
    if (!h || !h.expire) return null;
    const j = Math.round((new Date(`${h.expire}T12:00:00`) - new Date(`${auj}T12:00:00`)) / 86400000);
    if (j > seuil) return null;
    if (h.rdv && h.rdv >= auj) return { etat: 'pris', rdv: h.rdv, jours: j };
    return { etat: 'a-prendre', jours: j };
  }

  // Fiche récapitulative : une ligne par personne, une colonne par habilitation détenue par au moins une
  // personne ; seules les habilitations en cours de validité si « aJour »
  function recap(personnes, habs, auj, { aJour = true, cles } = {}) {
    const lignes = personnes.map(u => {
      const cells = {};
      habs.filter(h => h.userId === u.id).forEach(h => {
        if (aJour && !valide(h, auj)) return;
        const ex = cells[h.cle];
        if (!ex || (h.expire || '9999') > (ex.expire || '9999')) cells[h.cle] = h;
      });
      return { u, cells };
    });
    const presentes = new Set(lignes.flatMap(l => Object.keys(l.cells)));
    return { lignes, cles: (cles || []).length ? cles.filter(c => presentes.has(c)) : [...presentes] };
  }

  // Plans de prévention annuels des clients suivis : dernier plan, état, alerte « à recharger »
  function etatPlanAnnuel(e, auj, seuil = 45) {
    const plans = (e.plansPrevention || []).filter(p => p.fin || p.debut).sort((a, b) => (b.fin || '9999').localeCompare(a.fin || '9999'));
    const p = plans[0] || null;
    if (!p) return { plan: null, etat: 'absent', jours: null };
    if (!p.fin) return { plan: p, etat: 'valide', jours: null };
    const j = Math.round((new Date(`${p.fin}T12:00:00`) - new Date(`${auj}T12:00:00`)) / 86400000);
    return { plan: p, etat: j < 0 ? 'echu' : j <= seuil ? 'bientot' : 'valide', jours: j };
  }
  const clientSuivi = e => !e.archive && (e.pdpAnnuel || (e.plansPrevention || []).length > 0) && e.pdpAnnuel !== false;
  function alertesPlans(entreprises, auj) {
    return entreprises.filter(clientSuivi).map(e => ({ e, ...etatPlanAnnuel(e, auj) })).filter(x => x.etat !== 'valide')
      .map(x => ({ entrepriseId: x.e.id, nom: x.e.nom, etat: x.etat, jours: x.jours, fin: x.plan && x.plan.fin,
        texte: x.etat === 'absent' ? 'aucun plan de prévention annuel chargé' : x.etat === 'echu' ? `plan de prévention échu depuis ${-x.jours} j (${fr(x.plan.fin)}) : charger le nouveau plan` : `plan de prévention à renouveler : échéance le ${fr(x.plan.fin)} (dans ${x.jours} j)` }));
  }
  const fr = s => { const [a, m, j] = String(s || '').split('-'); return a ? `${j}/${m}/${a}` : ''; };

  return { TYPES, type, aptitude, conditions, pourPersonne, rendezVousVisite, recap, etatPlanAnnuel, clientSuivi, alertesPlans, valide };
})();
if (typeof module !== 'undefined') module.exports = Autorisations;
