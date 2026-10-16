// Texte de la notification envoyée à un compagnon quand son planning change (partagé serveur / démonstration) :
// une ligne par journée modifiée avec le chantier et les horaires prévus, ou « libre » / l'absence.
const NotifPlanning = (() => {
  const jourCourt = d => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\.(?=\s|$)/g, '');
  const prenom = nom => String(nom || '').split(' ')[0];
  // planning : affectations actuelles de la personne ; affaire(id) : chantier
  function message({ user, jours, planning, affaire, pourChef }) {
    const ds = [...new Set(jours)].sort();
    const lignes = ds.map(d => {
      const ps = planning.filter(p => p.date === d);
      if (!ps.length) return `${jourCourt(d)} : libre`;
      return `${jourCourt(d)} : ${ps.map(p => {
        if (p.absence) return p.absence;
        const a = affaire(p.affaireId) || {};
        return `${a.code || a.nom || 'chantier'}${p.debut && p.fin ? ` ${p.debut}–${p.fin}` : p.heuresPrevues ? ` ${p.heuresPrevues} h` : ''}${p.tache ? ` (${p.tache})` : ''}`;
      }).join(' + ')}`;
    });
    const quoi = ds.length === 1 ? jourCourt(ds[0]) : `${ds.length} jours`;
    return {
      titre: pourChef ? `Planning de ${prenom(user.nom)} modifié : ${quoi}` : `Votre planning a changé : ${quoi}`,
      texte: lignes.join('\n'),
      lien: '#/pointage/planning',
      tag: `planning-${user.id}`,
      jours: ds,
    };
  }
  // Modification qui concerne le compagnon : chantier, horaires, tâche, consigne ou absence
  const CHAMPS = ['date', 'userId', 'affaireId', 'debut', 'fin', 'pause', 'heuresPrevues', 'tache', 'note', 'absence'];
  const change = (avant, apres) => !avant || !apres || CHAMPS.some(k => String(avant[k] ?? '') !== String(apres[k] ?? ''));
  return { message, change, jourCourt };
})();
if (typeof module !== 'undefined') module.exports = NotifPlanning;
