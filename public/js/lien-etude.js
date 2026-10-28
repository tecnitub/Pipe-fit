// Étude d'exécution (application DOE) ↔ documents du chantier : une fiche technique visée par la maîtrise d'œuvre est
// ajoutée aux documents du chantier (catégorie « Fiche technique », transmise aux compagnons) ; son visa suit les
// changements de l'étude et une fiche refusée n'est plus transmise. Module commun navigateur (démo) / serveur DOE / tests.
const LienEtude = (() => {
  const ficheVisee = f => ['Visée', 'Visée avec observations'].includes(f.visa);
  const dateFrIso = d => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.split('-').reverse().join('/') : '');
  const noteVisa = f => `Étude d'exécution : ${String(f.visa || 'à soumettre').toLowerCase()}${f.dateVisa ? ` le ${dateFrIso(f.dateVisa)}` : ''}${f.obs ? ` — ${f.obs}` : ''}`;
  const docDe = (docs, f) => docs.find(x => x.etudeFicheId === f.id) || (f.fichier && f.fichier.src === 'pf' && docs.find(x => x.fichierId === f.fichier.id));

  // Visas reportés sur les documents liés (modifie docs) ; renvoie { change, aEnvoyer : fiches visées à ajouter }
  function appliquer(docs, fiches) {
    let change = false;
    const aEnvoyer = [];
    (fiches || []).forEach(f => {
      const d = docDe(docs, f);
      if (d) {
        const note = d.etudeFicheId ? noteVisa(f) : d.note, visible = d.etudeFicheId ? f.visa !== 'Refusée' : d.visible;
        if (d.visa !== f.visa || d.note !== note || d.visible !== visible) { Object.assign(d, { visa: f.visa, note, visible }); change = true; }
      } else if (ficheVisee(f) && f.fichier && f.fichier.src !== 'pf') aEnvoyer.push(f);
    });
    return { change, aEnvoyer };
  }
  // Document du chantier pour une fiche visée dont le fichier vient d'être envoyé ({ id, mime, taille })
  const documentFiche = (f, fichier, nom, par, id) => ({ id, fichierId: fichier.id, nom, categorie: 'Fiche technique', indice: f.indice || '', note: noteVisa(f), mime: fichier.mime,
    taille: fichier.taille, date: new Date().toISOString().slice(0, 10), par, visible: true, etudeFicheId: f.id, visa: f.visa });
  return { ficheVisee, noteVisa, appliquer, documentFiche };
})();
if (typeof module !== 'undefined') module.exports = LienEtude;
