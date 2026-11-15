// Versions d'une étude : résumé des changements d'une version à la suivante (calculs ajoutés, supprimés, modifiés ;
// données de l'en-tête), règle d'enregistrement (une version par personne et par séance de travail : les
// enregistrements rapprochés d'une même personne mettent à jour sa dernière version ; nouvelle version quand une
// autre personne enregistre, après l'intervalle réglé, après une restauration ou une fusion, ou quand un calcul est
// supprimé, pour qu'il reste dans l'historique), limites en nombre et en âge (la plus récente est toujours gardée).
// Module commun navigateur (démo) / serveur Études.
const VersionsEtude = (() => {
  const DEFAUTS = { max: 50, jours: 180, intervalleMin: 15, corbeilleMax: 100, corbeilleJours: 365 };
  // Champs recalculés à chaque enregistrement : pas un changement de l'étude
  const DERIVES = new Set(['avancement', 'consequences', 'etatReference', 'equipements', '_v', '_at', '_by', 'id']);
  const ENTETE = { objet: 'objet', client: 'client', indice: 'indice', date: 'date', auteur: 'rédacteur', verificateur: 'vérificateur', approbateur: 'approbateur', statut: 'statut',
    description: 'objet détaillé', affaireId: 'affaire', clientId: 'client Pipe-Fit', devisId: 'devis', climat: 'climat', typeBatiment: 'type de bâtiment', neuf: 'neuf / existant',
    materiel: 'matériel retenu', suiviEtapes: 'suivi des étapes', inventaire: 'inventaire CCTP / DPGF', historique: 'historique des indices', reservesConformite: 'réserves de conformité', modele: 'modèle' };
  const egal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const titreNote = n => String((n && (n.titre || n.type)) || 'Calcul');

  function reglages(r) {
    const o = { ...DEFAUTS };
    Object.keys(DEFAUTS).forEach(k => { const v = Number(r && r[k]); if (Number.isFinite(v) && v >= 0) o[k] = Math.round(v); });
    o.max = Math.min(Math.max(o.max, 1), 1000); o.corbeilleMax = Math.min(Math.max(o.corbeilleMax, 1), 1000);
    return o;
  }
  // Changements de `avant` à `apres` (avant null : création)
  function resumer(avant, apres) {
    const r = { creation: !avant, notesAjoutees: [], notesSupprimees: [], notesModifiees: [], entete: [], autres: 0 };
    const nb = new Map(((avant && avant.notes) || []).map(n => [n.id, n])), na = new Map(((apres && apres.notes) || []).map(n => [n.id, n]));
    na.forEach((n, id) => { if (!nb.has(id)) r.notesAjoutees.push(titreNote(n)); else if (!egal(nb.get(id), n)) r.notesModifiees.push(titreNote(n)); });
    nb.forEach((n, id) => { if (!na.has(id)) r.notesSupprimees.push(titreNote(n)); });
    if (avant && !egal(((avant.notes || []).map(n => n.id)).filter(id => na.has(id)), ((apres.notes || []).map(n => n.id)).filter(id => nb.has(id)))) r.ordre = true;
    if (avant) new Set([...Object.keys(avant), ...Object.keys(apres || {})]).forEach(k => {
      if (k === 'notes' || DERIVES.has(k) || egal(avant[k], (apres || {})[k])) return;
      if (ENTETE[k]) r.entete.push(ENTETE[k]); else r.autres++;
    });
    return r;
  }
  const vide = r => !r.creation && !r.notesAjoutees.length && !r.notesSupprimees.length && !r.notesModifiees.length && !r.entete.length && !r.autres && !r.ordre;
  const liste = (t, max = 4) => t.slice(0, max).map(x => `« ${x} »`).join(', ') + (t.length > max ? ` et ${t.length - max} autre(s)` : '');
  function texte(r) {
    if (!r) return '';
    const m = [];
    if (r.creation) m.push('création de l\'étude');
    if (r.notesAjoutees.length) m.push(`${r.notesAjoutees.length} calcul(s) ajouté(s) : ${liste(r.notesAjoutees)}`);
    if (r.notesSupprimees.length) m.push(`${r.notesSupprimees.length} calcul(s) supprimé(s) : ${liste(r.notesSupprimees)}`);
    if (r.notesModifiees.length) m.push(`calcul(s) modifié(s) : ${liste(r.notesModifiees)}`);
    if (r.ordre) m.push('calculs réordonnés');
    if (r.entete.length) m.push(`fiche de l'étude : ${r.entete.join(', ')}`);
    if (r.autres) m.push(`${r.autres} autre(s) donnée(s)`);
    return m.join(' · ') || 'aucun changement';
  }
  // Règle : 'ajouter' une version, 'remplacer' la dernière (même personne, même séance) ou 'rien' (aucun changement réel)
  function politique(derniere, resume, ctx) {
    const reg = reglages(ctx.reglages);
    if (!derniere) return 'ajouter';
    if (vide(resume) && !ctx.motif) return 'rien';
    if (ctx.motif || derniere.motif) return 'ajouter';
    if (resume.notesSupprimees.length) return 'ajouter';
    if (derniere.auteur !== ctx.auteur) return 'ajouter';
    const debut = Date.parse(derniere.created_at || derniere.date || 0);
    if (!(debut > 0) || Date.parse(ctx.maintenant) - debut >= reg.intervalleMin * 60000) return 'ajouter';
    return 'remplacer';
  }
  // Versions à retirer (liste triée de la plus ancienne à la plus récente : { id, date }) : au-delà du nombre ou de l'âge réglés
  function aPurger(versions, ctx) {
    const reg = reglages(ctx.reglages), maint = Date.parse(ctx.maintenant), out = new Set();
    const n = versions.length;
    versions.forEach((v, i) => {
      if (i === n - 1) return;
      if (n - i > reg.max) out.add(v.id);
      else if (reg.jours > 0 && maint - Date.parse(v.date) > reg.jours * 86400000) out.add(v.id);
    });
    return [...out];
  }
  // Calculs supprimés entre deux états (pour la corbeille)
  const notesSupprimees = (avant, apres) => {
    const ids = new Set(((apres && apres.notes) || []).map(n => n.id));
    return ((avant && avant.notes) || []).filter(n => n && n.id && !ids.has(n.id));
  };
  // Calcul de la corbeille remis dans l'étude : nouvel identifiant si le sien est repris entre-temps
  function restaurerNote(et, note, uid) {
    const n = JSON.parse(JSON.stringify(note));
    if ((et.notes || []).some(x => x.id === n.id)) n.id = uid();
    et.notes = [...(et.notes || []), n];
    return n;
  }
  return { DEFAUTS, reglages, resumer, vide, texte, politique, aPurger, notesSupprimees, restaurerNote };
})();
if (typeof module !== 'undefined') module.exports = VersionsEtude;
