// Règles du pointage des compagnons, communes au serveur, au navigateur et à la démo :
// - un oubli se rattrape sur les jours de la semaine en cours (jusqu'à aujourd'hui) ; au-delà, c'est le bureau qui corrige ;
// - un compagnon non planifié peut ouvrir une intervention hors devis (dépannage) depuis son téléphone : le bureau la complète.
const ReglesPointage = (() => {
  const jourIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Semaine ISO « 2026-W42 » d'une date « AAAA-MM-JJ »
  function semaine(date) {
    const [a, m, j] = String(date).split('-').map(Number), d = new Date(Date.UTC(a, m - 1, j)), w = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - w);
    const n = Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(n).padStart(2, '0')}`;
  }
  const jourModifiable = (date, auj) => /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) && date <= auj && semaine(date) === semaine(auj);
  // Lundi à dimanche de la semaine en cours
  function joursSemaine(auj) {
    const d = new Date(`${auj}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() || 7) - 1));
    return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return jourIso(x); });
  }

  // Pointage saisi ou modifié par un compagnon (null si autorisé)
  function refusTemps(obj, existing, auj) {
    // Terminer un pointage commencé la veille (nuit) reste possible
    const fin = existing && existing.debut && !existing.fin && obj && obj.date === existing.date;
    if (fin) return null;
    if (existing && !jourModifiable(existing.date, auj)) return 'Ce pointage n\'est plus dans la semaine en cours : demandez la correction à votre chargé d\'affaires';
    if (obj && obj.date > auj) return 'Impossible de pointer un jour à venir';
    if (obj && !jourModifiable(obj.date, auj)) return 'Seuls les jours de la semaine en cours peuvent être pointés : pour une semaine passée, voyez votre chargé d\'affaires';
    return null;
  }

  // Intervention hors devis ouverte par un compagnon : création seulement, champs limités, à compléter par le bureau
  const CHAMPS_HD = ['nom', 'clientId', 'clientLibre', 'siteId', 'lieu', 'demande'];
  function horsDevisCompagnon(obj, existing, userId, auj) {
    if (existing) return { refus: 'Seul le bureau peut modifier un chantier ou une intervention' };
    if (!obj || obj.type !== 'horsDevis') return { refus: 'Seul le bureau peut créer un chantier' };
    if (!String(obj.nom || '').trim()) return { refus: 'Indiquez l\'objet de l\'intervention' };
    if (!obj.clientId && !String(obj.clientLibre || '').trim()) return { refus: 'Indiquez le client' };
    const propre = { id: obj.id, type: 'horsDevis', code: '', statut: 'Ouvert', dateCreation: auj, heuresPrevues: 0, rex: {}, ouvertePar: userId, aCompleter: true };
    CHAMPS_HD.forEach(k => { if (obj[k] !== undefined && obj[k] !== null) propre[k] = String(obj[k]).trim().slice(0, 500); });
    return { obj: propre };
  }

  return { semaine, jourIso, jourModifiable, joursSemaine, refusTemps, horsDevisCompagnon };
})();
if (typeof module !== 'undefined') module.exports = ReglesPointage;
