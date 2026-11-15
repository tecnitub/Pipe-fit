// Réserves levées par les compagnons : les réserves de conformité de l'étude (application Études) et les réserves des PV
// de mise en service deviennent des réserves du chantier (collection « reserves »), affectées à un compagnon ; elles
// apparaissent dans son appli, se lèvent avec photo et commentaire (hors connexion : file d'envoi de l'appli) et la levée
// remonte dans l'étude (réserve de conformité cochée) et le DOE (état des réserves). Module commun CRM / serveur / tests (pur).
const ReservesTerrain = (() => {
  const txt = (v, k = 300) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, k);
  // Champs qu'un compagnon peut renseigner sur une réserve qui lui est affectée (levée)
  const CHAMPS_LEVEE = ['statut', 'dateLevee', 'commentaireLevee', 'photoLeveeId', 'leveePar', 'leveeParId'];

  // Résumé de l'étude envoyé au CRM : réserves de conformité non encore levées (AnnexesExploitation.reserves + état coché)
  const pourCrm = (liste, etat = {}) => (liste || []).filter(x => x && x.cle && !(etat[x.cle] && etat[x.cle].le)).slice(0, 150)
    .map(x => ({ cle: txt(x.cle, 200), categorie: txt(x.categorie, 60), texte: txt(x.texte, 400), valeur: txt(x.valeur, 80), reference: txt(x.reference, 240), origine: txt(x.origine, 120) }));

  // Réserves à créer sur le chantier : celles des études reliées (liens Pipe-Fit) et des PV de mise en service
  // (Essais.reservesReception), sauf celles déjà créées. liens : [{ app, id, resume: { objet, reserves } }]
  function candidats({ liens = [], mesReserves = [], reserves = [] } = {}) {
    const deja = new Set((reserves || []).flatMap(r => [r.cleMes, r.origine && r.origine.app === 'etudes' ? `${r.origine.etudeId}|${r.origine.cle}` : ''].filter(Boolean)));
    const etude = (liens || []).filter(l => l && l.app === 'etudes').flatMap(l => (((l.resume || {}).reserves) || []).map(x => ({
      cle: `${l.id}|${x.cle}`, source: 'etude', localisation: txt(x.origine, 120) || txt((l.resume || {}).objet, 120), description: `${txt(x.texte, 400)}${x.valeur ? ` (${txt(x.valeur, 80)})` : ''}`,
      categorie: txt(x.categorie, 60), reference: txt(x.reference, 240), origine: { app: 'etudes', etudeId: txt(l.id, 64), cle: txt(x.cle, 200), etude: txt((l.resume || {}).objet, 120) } })));
    const mes = (mesReserves || []).map(x => ({ cle: x.cle, source: 'mes', localisation: txt(x.localisation, 120), description: `${txt(x.description, 400)}${x.source ? ` (PV ${txt(x.source, 40)})` : ''}`, categorie: 'Mise en service', cleMes: x.cle }));
    return [...etude, ...mes].filter(c => !deja.has(c.cle));
  }
  // Enregistrement « reserves » d'un candidat, affecté (ou non) à un compagnon
  function creer(c, { numero, assigneA = '', echeance = '', responsable = 'Pipe-Fit' } = {}) {
    return { numero, localisation: c.localisation, description: c.description, responsable, echeance, photoId: '', statut: 'Ouverte', pvId: '', assigneA: txt(assigneA, 64),
      ...(c.cleMes ? { cleMes: c.cleMes } : {}), ...(c.origine ? { origine: c.origine } : {}), ...(c.categorie ? { categorie: c.categorie } : {}) };
  }
  // Appli des compagnons : réserves qui lui sont affectées, ouvertes d'abord (échéance la plus proche)
  const duCompagnon = (reserves, userId, affaireId) => (reserves || []).filter(r => r && r.assigneA && r.assigneA === userId && (!affaireId || r.affaireId === affaireId))
    .sort((a, b) => Number(a.statut === 'Levée') - Number(b.statut === 'Levée') || String(a.echeance || '9').localeCompare(String(b.echeance || '9')));
  // Levée saisie sur le téléphone (enregistrée tout de suite ou mise en file hors connexion)
  const lever = (r, { date, commentaire = '', photoId = '', par = '', parId = '' }) => ({ ...r, statut: 'Levée', dateLevee: txt(date, 10), commentaireLevee: txt(commentaire, 500), photoLeveeId: txt(photoId, 64), leveePar: txt(par, 80), leveeParId: txt(parId, 64) });

  // Contrôle côté serveur d'une écriture « reserves » par un compagnon : seule la levée d'une réserve qui lui est affectée
  // est acceptée (les autres champs sont repris de l'enregistrement existant). → { obj } ou { refus }
  function ecritureCompagnon(existing, obj, userId) {
    if (!existing) return { refus: 'Seul le bureau crée les réserves' };
    if (!userId || existing.assigneA !== userId) return { refus: 'Réserve affectée à un autre intervenant' };
    if (existing.statut === 'Levée' && existing.pvLeveeId) return { refus: 'Levée déjà signée au PV de levée des réserves' };
    const o = { ...existing };
    CHAMPS_LEVEE.forEach(k => { if (obj && obj[k] !== undefined) o[k] = obj[k]; });
    if (!['Ouverte', 'Levée'].includes(o.statut)) o.statut = existing.statut;
    if (o.statut === 'Levée' && !txt(o.commentaireLevee) && !txt(o.photoLeveeId)) return { refus: 'Photo ou commentaire de levée requis' };
    if (o.statut === 'Levée') { o.dateLevee = txt(o.dateLevee, 10) || new Date().toISOString().slice(0, 10); o.leveeParId = userId; }
    else ['dateLevee', 'commentaireLevee', 'photoLeveeId', 'leveePar', 'leveeParId'].forEach(k => { o[k] = ''; });
    return { obj: o };
  }

  // Retour vers l'étude : réserves de conformité levées sur le chantier [{ cle, le, par, obs, photo, numero }]
  const leveesEtude = (reserves, etudeId) => (reserves || []).filter(r => r && r.origine && r.origine.app === 'etudes' && r.origine.etudeId === etudeId && r.statut === 'Levée')
    .map(r => ({ cle: r.origine.cle, le: txt(r.dateLevee, 10), par: txt(r.leveePar, 80), obs: txt(`Levée sur le chantier${r.numero ? ` (réserve n° ${r.numero})` : ''}${r.commentaireLevee ? ` : ${r.commentaireLevee}` : ''}`, 300), photo: txt(r.photoLeveeId, 64), numero: r.numero || '' }));
  // Affectation en cours (pas encore levée) : affichée dans l'étude
  const affecteesEtude = (reserves, etudeId) => (reserves || []).filter(r => r && r.origine && r.origine.app === 'etudes' && r.origine.etudeId === etudeId && r.statut !== 'Levée')
    .map(r => ({ cle: r.origine.cle, numero: r.numero || '', assigneA: r.assigneA || '', echeance: r.echeance || '' }));
  // Application dans l'étude : cocher(et, cle, coche, opts) (AnnexesExploitation.cocher) ; une réserve déjà cochée n'est pas modifiée
  function appliquerEtude(et, levees, cocher) {
    let k = 0;
    (levees || []).forEach(l => {
      const s = ((et && et.reservesConformite) || {})[l.cle];
      if (s && s.le) return;
      cocher(et, l.cle, true, { le: l.le, par: l.par || 'Chantier', obs: l.obs, photo: l.photo });
      k++;
    });
    return k;
  }
  return { CHAMPS_LEVEE, pourCrm, candidats, creer, duCompagnon, lever, ecritureCompagnon, leveesEtude, affecteesEtude, appliquerEtude };
})();
if (typeof module !== 'undefined') module.exports = ReservesTerrain;
