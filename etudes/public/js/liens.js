// Liens entre les calculs d'une même étude : les valeurs reprises d'une autre note sont recalculées à chaque affichage
// (liens vivants) et les champs correspondants sont verrouillés dans le formulaire.
//  - schéma de principe : puissance d'un circuit reprise d'un bilan chauffage et climatisation ;
//  - notes créées depuis un schéma : réseau et pompe ou vanne de régulation d'un circuit, vase d'expansion de l'installation ;
//  - réseau aéraulique (schéma aéraulique ou réseau et ventilateur) relié à un calcul de CTA : type, récupérateur, batteries
//    et pertes de charge de la centrale repris dans le réseau ; débits et pertes de charge du réseau repris dans la CTA.
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
    // Réseau aéraulique relié à une CTA (et CTA alimentée par ses réseaux)
    const air = lienAir(etude, note, e, verrous, alertes, libelle);
    if (air) return { entrees: e, verrous, alertes, source: air };
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

  /* ---------- CTA ↔ réseau aéraulique ---------- */
  // Les deux côtés lisent les entrées saisies de l'autre (pas de liens circulaires) : la CTA donne ses composants,
  // le réseau donne ses débits et ses pertes de charge hors CTA.
  const brut = n => ({ ...N.defauts(n.type), ...copie(n.entrees || {}) });
  const TYPE_AIR = { double: 'cta-df', melange: 'cta-melange', simple: 'cta-sf' }, RECUP_AIR = { plaques: 'plaques', roue: 'roue', glycol: 'boucle', aucun: 'aucun' };
  const reseauxDeCta = (notes, cta) => notes.filter(n => (n.type === 'aero' || n.type === 'aeraulique') && n.entrees && n.entrees.cta === cta.id);
  function lienAir(etude, note, e, verrous, alertes, libelle) {
    const notes = (etude && etude.notes) || [];
    const imposer = (vals, lib) => Object.entries(vals).forEach(([k, v]) => { e[k] = v; verrous[k] = lib; });
    if ((note.type === 'aero' || note.type === 'aeraulique') && e.cta) {
      const src = notes.find(n => n.id === e.cta && n.type === 'cta');
      if (!src) { alertes.push({ niveau: 'attention', texte: 'Le calcul de CTA relié a été supprimé : choisissez-en un autre ou « Saisie ».' }); return null; }
      const c = brut(src), lib = libelle(src), recup = c.type === 'double' ? c.recup : 'aucun', froid = c.froid !== 'non';
      if (note.type === 'aero') {
        imposer({ producteur: TYPE_AIR[c.type] || 'cta-df', recuperateur: RECUP_AIR[recup] || 'aucun', batChaude: 'oui', batFroide: froid ? 'oui' : 'non',
          dpFiltreS: num(c.dpFiltreAN), dpFiltreR: c.type === 'simple' ? 0 : num(c.dpFiltreR), dpRecup: recup !== 'aucun' ? num(c.dpRecup) : 0, dpBatC: num(c.dpBC) + (c.humid === 'vapeur' ? 30 : 0), dpBatF: froid ? num(c.dpBF) : 0,
          // Caissons, silencieux et volets de la CTA : moitié à la prise d'air, moitié au silencieux (la reprise en compte la moitié)
          dpPrise: num(c.dpDivers) / 2, dpSil: num(c.dpDivers) / 2, dpRejet: 0, rendement: num(c.rendement, 60) }, lib);
        if (!String(e.titreInstallation || '').trim() || e.titreInstallation === N.defauts('aero').titreInstallation) e.titreInstallation = src.titre;
      } else {
        const reprise = e.ctaFlux === 'reprise' && c.type !== 'simple';
        const dpCta = reprise ? num(c.dpFiltreR) + (recup !== 'aucun' ? num(c.dpRecup) : 0) + num(c.dpDivers) / 2
          : num(c.dpFiltreAN) + (recup !== 'aucun' ? num(c.dpRecup) : 0) + num(c.dpBC) + (froid ? num(c.dpBF) : 0) + (c.humid === 'vapeur' ? 30 : 0) + num(c.dpDivers);
        imposer({ dpCta: Math.round(dpCta) }, lib);
        const doublons = (e.composants || []).filter(x => /filtre|batterie|recup|récup|echangeur|échangeur|roue/i.test(x.nom || '') && num(x.dp) > 0);
        if (doublons.length) alertes.push({ niveau: 'attention', texte: `Composants déjà comptés dans la CTA (${doublons.map(x => x.nom).join(', ')}) : à retirer de la liste des composants du réseau.` });
        if (e.ctaFlux === 'reprise' && c.type === 'simple') alertes.push({ niveau: 'attention', texte: `${lib} est une centrale en soufflage seul : pas de ventilateur de reprise.` });
      }
      return { note: src, libelle: lib, texte: `Centrale reprise de ${lib} (type, récupérateur, batteries, pertes de charge des composants) ; les débits et les pertes de charge de ce réseau sont repris par la CTA. Mise à jour automatique.` };
    }
    if (note.type === 'cta') {
      const reseaux = reseauxDeCta(notes, note);
      if (!reseaux.length) return null;
      const libs = [], double = e.type !== 'simple';
      const aero = reseaux.find(n => n.type === 'aero');
      if (aero) {
        const v = N.calculer('aero', brut(aero)).valeurs || {}, lib = libelle(aero);
        if (v.Qs > 0) imposer({ Qs: Math.round(v.Qs), dpReseauS: Math.round(v.dpReseauS) }, lib);
        if (double && v.Qr > 0) imposer({ Qr: Math.round(v.Qr), dpReseauR: Math.round(v.dpReseauR) }, lib);
        libs.push(lib);
      }
      reseaux.filter(n => n.type === 'aeraulique').forEach(n => {
        const v = N.calculer('aeraulique', { ...brut(n), dpCta: 0 }).valeurs || {}, lib = libelle(n), reprise = n.entrees.ctaFlux === 'reprise';
        if (reprise && !double) return;
        if (aero && (reprise ? verrous.Qr : verrous.Qs)) { alertes.push({ niveau: 'attention', texte: `${lib} et ${libelle(aero)} décrivent tous deux le ${reprise ? 'réseau de reprise' : 'réseau de soufflage'} : le schéma aéraulique est retenu.` }); return; }
        imposer(reprise ? { Qr: Math.round(v.Qv), dpReseauR: Math.round(v.dpTotal) } : { Qs: Math.round(v.Qv), dpReseauS: Math.round(v.dpTotal) }, lib);
        libs.push(lib);
      });
      return libs.length ? { note: null, libelle: libs.join(', '), texte: `Débits et pertes de charge des réseaux repris de ${libs.join(' et ')} (les composants de la centrale y sont repris) : mise à jour automatique.` } : null;
    }
    return null;
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
    if (note.entrees.cta) note.entrees.cta = '';
    if (note.type === 'cta') reseauxDeCta(etude.notes || [], note).forEach(n => { n.entrees = resoudre(etude, n).entrees; n.entrees.cta = ''; });
    if (note.type === 'pid') (note.entrees.circuits || []).forEach(c => { delete c.bilan; });
  }
  const description = (etude, note) => {
    const r = resoudre(etude, note);
    if (!r.source) return '';
    if (r.source.texte) return r.source.texte;
    return `Données reprises de ${r.source.libelle}${r.source.circuit ? ` (circuit « ${r.source.circuit} »)` : ''} pour ce ${ROLES[note.lien.role] || 'calcul'} : mises à jour automatiquement.`;
  };
  return { resoudre, calculer, notesDepuisSchema, detacher, description, reseauxDeCta, nf };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'), typeof Schema !== 'undefined' ? Schema : require('./schema'));
if (typeof module !== 'undefined') module.exports = Liens;
