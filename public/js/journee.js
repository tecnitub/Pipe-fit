// Journée d'un compagnon : plusieurs chantiers dans la même journée (prévus ou non, avec ou sans devis), la journée prévue
// gardée ou remplacée entièrement, et les personnes qui ont travaillé avec lui (son équipe, un intérimaire sans accès).
// Calcul des lignes de départ et des enregistrements à faire. Module commun navigateur / démo / tests.
const Journee = (() => {
  const toMin = h => { const [a, b] = String(h || '0:0').split(':').map(Number); return a * 60 + (b || 0); };
  const n = v => Number(String(v ?? '').replace(',', '.')) || 0;
  // Durée en heures au quart d'heure, pause déduite (passage de minuit géré)
  function duree(debut, fin, pause) {
    if (!debut || !fin) return 0;
    let m = toMin(fin) - toMin(debut);
    if (m < 0) m += 24 * 60;
    return Math.max(0, Math.round((m - n(pause)) / 15) / 4);
  }
  const fin = l => (l.fin ? toMin(l.fin) + (toMin(l.fin) < toMin(l.debut) ? 1440 : 0) : 1440);

  // Lignes de départ d'une personne : ce qui est déjà pointé ; sinon le planning ; sinon une ligne à remplir
  function lignesInitiales({ plan = [], reel = [], defaut = {} }) {
    if (reel.length) {
      return reel.slice().sort((a, b) => (a.debut || '').localeCompare(b.debut || '')).map(t => ({ tid: t.id, affaireId: t.affaireId, tache: t.tache || '', debut: t.debut || '', fin: t.fin || '',
        pause: n(t.pause), heures: t.debut ? 0 : n(t.heures), bloque: t.statut === 'Validé', enCours: !!(t.debut && !t.fin) }));
    }
    if (plan.length) return comme(plan);
    return [{ affaireId: defaut.affaireId || '', tache: defaut.tache || '', debut: '07:30', fin: '16:30', pause: 60 }];
  }
  // Journée prévue au planning : un créneau par affectation (horaires prévus, sinon à la suite des précédents)
  function comme(plan) {
    let t = toMin('07:30');
    return plan.map((p, i) => {
      const debut = p.debut || `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      const h = n(p.heuresPrevues) || (plan.length === 1 ? 8 : 4), pause = i === 0 && h >= 6 ? 60 : 0;
      const f = p.fin || (() => { const m = toMin(debut) + Math.round(h * 60) + pause; return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; })();
      t = toMin(f);
      return { affaireId: p.affaireId, tache: p.tache || '', debut, fin: f, pause: p.pause ?? pause, prevu: true };
    });
  }
  const heuresLigne = l => (l.debut ? duree(l.debut, l.fin, l.pause) : n(l.heures));

  // Contrôle des lignes d'une personne (null si correctes)
  function erreur(lignes, { aujourdhui = false } = {}) {
    const actives = lignes.filter(l => !l.bloque);
    for (const l of actives) {
      if (!l.affaireId) return 'Choisissez le chantier de chaque ligne';
      if (!l.debut && !n(l.heures)) return 'Renseignez l\'arrivée et le départ de chaque ligne';
      if (l.debut && !l.fin && !(l.enCours && aujourdhui)) return 'Renseignez l\'heure de départ de chaque ligne';
    }
    const avecHeures = lignes.filter(l => l.debut);
    for (let i = 0; i < avecHeures.length; i++) for (let j = i + 1; j < avecHeures.length; j++) {
      const a = avecHeures[i], b = avecHeures[j];
      if (toMin(a.debut) < fin(b) && toMin(b.debut) < fin(a)) return `Deux lignes se chevauchent (${a.debut} – ${a.fin || '…'} et ${b.debut} – ${b.fin || '…'})`;
    }
    return null;
  }

  // Enregistrements d'une personne pour le jour : pointages créés ou modifiés, pointages retirés (non validés)
  // existants : pointages du jour de la personne ; prevus : chantiers prévus au planning ce jour-là
  function aEnregistrer({ userId, date, lignes, panier, existants = [], prevus = [], saisiPar }) {
    const gardes = lignes.filter(l => !l.bloque), ids = new Set(gardes.map(l => l.tid).filter(Boolean));
    const ordre = gardes.slice().sort((a, b) => (a.debut || '99').localeCompare(b.debut || '99'));
    const prevuSet = new Set(prevus), aPanier = panier && !existants.some(t => t.statut === 'Validé' && t.panier);
    const upserts = ordre.map((l, i) => {
      const ex = l.tid && existants.find(t => t.id === l.tid);
      const o = { ...(ex || {}), userId, date, affaireId: l.affaireId, tache: l.tache || '', debut: l.debut || '', fin: l.fin || '', pause: n(l.pause),
        heures: heuresLigne(l), panier: !!aPanier && i === 0, statut: ex && ex.statut === 'Refusé' ? '' : (ex && ex.statut) || '', saisiPar,
        horsPlanning: !prevuSet.has(l.affaireId) };
      if (!o.horsPlanning) delete o.horsPlanning;
      return o;
    });
    const suppressions = existants.filter(t => t.statut !== 'Validé' && !ids.has(t.id)).map(t => t.id);
    return { upserts, suppressions, total: upserts.reduce((s, o) => s + o.heures, 0) };
  }
  // Journée prévue remplacée : aucun des chantiers prévus n'est pointé
  const remplacee = (lignes, prevus) => prevus.length > 0 && !lignes.some(l => prevus.includes(l.affaireId));

  return { duree, lignesInitiales, comme, heuresLigne, erreur, aEnregistrer, remplacee };
})();
if (typeof module !== 'undefined') module.exports = Journee;
