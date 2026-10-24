// Retour d'expérience Pipe-Fit pour caler le métré des Études : chantiers terminés, heures prévues aux devis acceptés
// et heures pointées, par catégorie de main-d'œuvre. Partagé par le serveur Études et la démonstration.
const RexPF = (() => {
  const nombre = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const TERMINES = ['Terminé', 'Facturé', 'Clos'];
  return function rexPF(d) {
    const users = new Map((d.users || []).map(u => [u.id, u])), affaires = [];
    for (const a of d.affaires || []) {
      if (!TERMINES.includes(a.statut) || a.type === 'horsDevis') continue;
      const parMo = {}, ajout = (id, cle, h) => { const k = id || 'autre'; (parMo[k] = parMo[k] || { prevues: 0, passees: 0 })[cle] += h; };
      for (const dv of (d.devis || []).filter(x => x.affaireId === a.id && x.statut === 'Accepté'))
        for (const l of dv.lignes || []) {
          if (['chapitre', 'texte', 'image'].includes(l.type)) continue;
          const q = nombre(l.qte);
          if (l.composants) l.composants.filter(c => c.type === 'mo').forEach(c => ajout(c.moId, 'prevues', q * nombre(c.heures)));
          else if (nombre(l.heures)) ajout('', 'prevues', q * nombre(l.heures));
        }
      for (const t of (d.temps || []).filter(x => x.affaireId === a.id && x.statut !== 'Refusé')) ajout((users.get(t.userId) || {}).categorieId, 'passees', nombre(t.heures));
      const prevues = Object.values(parMo).reduce((x, h) => x + h.prevues, 0), passees = Object.values(parMo).reduce((x, h) => x + h.passees, 0);
      if (prevues > 0 && passees > 0) affaires.push({ id: a.id, code: a.code, nom: a.nom, statut: a.statut, prevues, passees, parMo });
    }
    return { affaires, mainoeuvre: (d.mainoeuvre || []).map(m => ({ id: m.id, code: m.code, libelle: m.libelle })) };
  };
})();
if (typeof module !== 'undefined') module.exports = RexPF;
