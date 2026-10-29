// Règles du pointage des compagnons, communes au serveur, au navigateur et à la démo :
// - un oubli se rattrape sur les jours de la semaine en cours (jusqu'à aujourd'hui) ; au-delà, c'est le bureau qui corrige ;
// - un compagnon non planifié peut ouvrir une intervention hors devis (dépannage) depuis son téléphone : le bureau la complète ;
// - un intérimaire n'a pas d'accès : le compagnon avec qui il a travaillé le pointe, et le déclare s'il n'est pas encore connu
//   (fiche et mission créées « à compléter », le bureau est prévenu).
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
  const CHAMPS_HD = ['nom', 'clientId', 'clientLibre', 'contactId', 'contactLibre', 'contactTel', 'siteId', 'siteLibre', 'lieu', 'demande'];
  function horsDevisCompagnon(obj, existing, userId, auj) {
    if (existing) return { refus: 'Seul le bureau peut modifier un chantier ou une intervention' };
    if (!obj || obj.type !== 'horsDevis') return { refus: 'Seul le bureau peut créer un chantier' };
    if (!String(obj.nom || '').trim()) return { refus: 'Indiquez l\'objet de l\'intervention' };
    if (!obj.clientId && !String(obj.clientLibre || '').trim()) return { refus: 'Indiquez le client' };
    const propre = { id: obj.id, type: 'horsDevis', code: '', statut: 'Ouvert', dateCreation: auj, heuresPrevues: 0, rex: {}, ouvertePar: userId, aCompleter: true };
    CHAMPS_HD.forEach(k => { if (obj[k] !== undefined && obj[k] !== null) propre[k] = String(obj[k]).trim().slice(0, 500); });
    // Photos de la demande (bon papier, note du client) : identifiants de fichiers déjà envoyés
    if (Array.isArray(obj.photosDemande)) propre.photosDemande = obj.photosDemande.filter(x => /^[a-f0-9]{16,40}$/.test(String(x))).slice(0, 10);
    return { obj: propre };
  }

  // Intérimaire déclaré par un compagnon : fiche de l'équipe (sans accès) et mission à compléter par le bureau (registre)
  function interimaireDeclare(b, ids, declarePar, auj) {
    const t = (v, n = 120) => String(v || '').trim().slice(0, n);
    const nom = t(b && b.nom);
    if (nom.length < 3) return { refus: 'Indiquez le nom et le prénom de l\'intérimaire' };
    if (!b.agenceId && !t(b.agenceLibre)) return { refus: 'Indiquez l\'agence d\'intérim' };
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) && b.date <= auj ? b.date : auj;
    const commun = { nom, agenceId: t(b.agenceId, 40), agenceLibre: b.agenceId ? '' : t(b.agenceLibre), qualification: t(b.qualification) };
    const user = { id: ids.user, ...commun, role: 'atelier', type: 'interimaire', categorieId: t(b.categorieId, 40), chefId: '', capaciteHebdo: 35, declarePar, aCompleter: true };
    const mission = { id: ids.mission, userId: ids.user, ...commun, dateEntree: date, finPrevue: '', dateSortie: '', motif: '', numeroContrat: '', affaireIds: b.affaireId ? [t(b.affaireId, 40)] : [],
      notes: `Déclaré par ${declarePar} depuis le pointage : dossier à compléter (contrat de mise à disposition, motif, état civil).`, declarePar, aCompleter: true };
    return { user, mission };
  }

  return { semaine, jourIso, jourModifiable, joursSemaine, refusTemps, horsDevisCompagnon, interimaireDeclare };
})();
if (typeof module !== 'undefined') module.exports = ReglesPointage;
