// Liens entre les calculs d'une même étude : les valeurs reprises d'une autre note sont recalculées à chaque affichage
// (liens vivants) et les champs correspondants sont verrouillés dans le formulaire.
//  - schéma de principe : puissance d'un circuit reprise d'un bilan chauffage et climatisation ;
//  - notes créées depuis un schéma : réseau et pompe ou vanne de régulation d'un circuit, vase d'expansion de l'installation.
const Liens = ((N, Sc) => {
  const nf = N.nf, num = N.num;
  const copie = o => JSON.parse(JSON.stringify(o));
  const ROLES = { reseau: 'réseau et pompe', vanne: 'vanne de régulation', vase: 'vase d\'expansion' };

  // Entrées effectives d'une note : { entrees, verrous: { champ ou 'liste.i.colonne': libellé de la source }, alertes, source }
  function resoudre(etude, note, pile = new Set()) {
    const e = { ...N.defauts(note.type), ...copie(note.entrees || {}) }, verrous = {}, alertes = [];
    const notes = (etude && etude.notes) || [], libelle = n => `N${notes.indexOf(n) + 1} — ${n.titre}`;
    if (pile.has(note.id)) return { entrees: e, verrous, alertes: [{ niveau: 'erreur', texte: 'Liens circulaires entre calculs.' }], source: null };
    pile = new Set([...pile, note.id]);
    // Schéma : puissances des circuits reprises des bilans
    if (note.type === 'pid') {
      const froid = (() => { const r = Sc.REGIMES[e.reseau]; return e.reseau === 'perso' ? num(e.Tdep) < num(e.Tret) : r && r[1] < r[2]; })();
      (e.circuits || []).forEach((c, i) => {
        if (!c.bilan) return;
        const src = notes.find(n => n.id === c.bilan);
        if (!src) { alertes.push({ niveau: 'attention', texte: `${c.rep || `Circuit ${i + 1}`} : le bilan d'origine a été supprimé, puissance saisie conservée.` }); return; }
        const v = N.calculer(src.type, resoudre(etude, src, pile).entrees).valeurs;
        c.P = Math.round((froid ? v.Pfroid : v.Pchauf) / 100) / 10;
        verrous[`circuits.${i}.P`] = libelle(src);
      });
    }
    // Note créée depuis un schéma : valeurs du circuit (ou de l'installation) recalculées
    const lien = note.lien;
    if (lien && lien.note) {
      const src = notes.find(n => n.id === lien.note);
      if (!src) return { entrees: e, verrous, alertes: [{ niveau: 'attention', texte: 'Le schéma d\'origine a été supprimé : valeurs conservées, lien à détacher.' }], source: null };
      const es = resoudre(etude, src, pile).entrees, d = Sc.dimensionner(es), c = d.circuits[lien.circuit];
      const imposer = (vals, cles = Object.keys(vals)) => { Object.assign(e, vals); cles.forEach(k => { verrous[k] = libelle(src); }); };
      const Tm = c ? (c.rc[0] + c.rc[1]) / 2 : (d.Td + d.Tr) / 2;
      if (lien.role !== 'vase' && !c) return { entrees: e, verrous, alertes: [{ niveau: 'attention', texte: 'Le circuit d\'origine n\'existe plus dans le schéma : valeurs conservées, lien à détacher.' }], source: { note: src, libelle: libelle(src) } };
      if (lien.role === 'reseau') {
        imposer({ fluide: es.fluide, T: Math.round(Tm * 10) / 10, serie: es.serie, circuit: 'ferme' });
        e.troncons = e.troncons && e.troncons.length ? e.troncons : [{}];
        Object.assign(e.troncons[0], { rep: e.troncons[0].rep || `${c.rep} — aller + retour`, Q: Math.round(c.Q * 100) / 100, tube: c.t.cle, L: c.L });
        ['Q', 'tube', 'L'].forEach(k => { verrous[`troncons.0.${k}`] = libelle(src); });
      }
      if (lien.role === 'vanne') imposer({ fluide: es.fluide, T: Math.round(Tm * 10) / 10, mode: 'debit', Q: Math.round(c.Q * 100) / 100, type: c.reg === '3v' ? '3v' : '2v' });
      if (lien.role === 'vase') {
        const vol = Sc.volumeEau(d, es.generateur);
        imposer({ fluide: es.fluide, modeV: 'saisi', Vinst: Math.round(vol.total), Tmax: d.chaud ? d.Td : 35 });
      }
      return { entrees: e, verrous, alertes, source: { note: src, libelle: libelle(src), circuit: c ? c.rep : '' } };
    }
    return { entrees: e, verrous, alertes, source: null };
  }

  // Résultat d'une note dans son étude (entrées effectives, alertes de lien en tête)
  function calculer(etude, note) {
    const r = resoudre(etude, note), res = N.calculer(note.type, r.entrees);
    return r.alertes.length ? { ...res, alertes: [...r.alertes, ...res.alertes] } : res;
  }

  // Notes à créer depuis un schéma : réseau et pompe et vanne de chaque circuit, vase d'expansion ; renvoie les nouvelles notes
  function notesDepuisSchema(etude, pid, uid) {
    const es = resoudre(etude, pid).entrees, d = Sc.dimensionner(es), existe = (role, circuit) => etude.notes.some(n => n.lien && n.lien.note === pid.id && n.lien.role === role && n.lien.circuit === circuit);
    const nouvelles = [], cree = (type, role, circuit, titre, entrees) => { if (!existe(role, circuit)) nouvelles.push({ id: uid(), type, titre, entrees: { ...N.defauts(type), ...entrees }, commentaire: '', lien: { note: pid.id, role, circuit } }); };
    d.circuits.forEach((c, i) => {
      cree('reseau', 'reseau', i, `Réseau et pompe — ${c.rep}`, {
        vmax: es.vmax, Rmax: es.Rmax, marge: 10, rendement: 50,
        troncons: [{ rep: `${c.rep} — aller + retour`, Q: c.Q, tube: c.t.cle, L: c.L, zeta: 10 }],
        composants: [{ nom: c.em[0], dp: c.em[1] }, ...(c.reg === 'direct' ? [] : [{ nom: Sc.REGULATIONS[c.reg], dp: c.dpV }]), { nom: 'Vanne d\'équilibrage', dp: 5 }],
      });
      if (c.reg !== 'direct') cree('vanne', 'vanne', i, `Vanne de régulation — ${c.rep}`, { methode: 'autorite', dpCircuit: c.em[1], beta: 0.5 });
    });
    cree('vase', 'vase', -1, `Vase d'expansion — ${es.titreInstallation || 'installation'}`, { Tmin: Math.min(10, d.Td), Hst: 10, Psv: 3 });
    return nouvelles;
  }

  // Détache une note de ses sources : les valeurs reprises deviennent des valeurs saisies
  function detacher(etude, note) {
    const r = resoudre(etude, note);
    note.entrees = r.entrees;
    delete note.lien;
    if (note.type === 'pid') (note.entrees.circuits || []).forEach(c => { delete c.bilan; });
  }
  const description = (etude, note) => {
    const r = resoudre(etude, note);
    if (!r.source) return '';
    return `Données reprises de ${r.source.libelle}${r.source.circuit ? ` (circuit « ${r.source.circuit} »)` : ''} pour ce ${ROLES[note.lien.role] || 'calcul'} : mises à jour automatiquement.`;
  };
  return { resoudre, calculer, notesDepuisSchema, detacher, description, nf };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'), typeof Schema !== 'undefined' ? Schema : require('./schema'));
if (typeof module !== 'undefined') module.exports = Liens;
