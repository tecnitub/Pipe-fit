// Liens entre les calculs d'une même étude : les valeurs reprises d'une autre note sont recalculées à chaque affichage
// (liens vivants) et les champs correspondants sont verrouillés dans le formulaire.
//  - schéma de principe : puissance d'un circuit reprise d'un bilan chauffage et climatisation ;
//  - notes créées depuis un schéma : réseau et pompe ou vanne de régulation d'un circuit, vase d'expansion de l'installation ;
//  - réseau aéraulique (schéma aéraulique ou réseau et ventilateur) relié à un calcul de CTA : type, récupérateur, batteries
//    et pertes de charge de la centrale repris dans le réseau ; débits et pertes de charge du réseau repris dans la CTA ;
//  - circuit d'une chaufferie ou d'une sous-station (schéma de principe) relié à un réseau annexe (réseau arborescent,
//    réseau et pompe, batteries d'une CTA) : fluide, régime et pertes de charge côté production vers le réseau ;
//    puissance (ou débit) et pertes de charge du réseau vers le circuit, dont la pompe est dimensionnée en conséquence.
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
    // Terminaux : régimes d'eau chaude et glacée repris de la production choisie (schéma de principe)
    if (note.type === 'terminaux') [['prodChaud', 'TcAller', 'TcRetour', false], ['prodFroid', 'TfAller', 'TfRetour', true]].forEach(([k, kd, kr, froid]) => {
      if (!e[k]) return;
      const src = notes.find(n => n.id === e[k] && n.type === 'pid');
      if (!src) { alertes.push({ niveau: 'attention', texte: 'La production reliée a été supprimée : régimes saisis conservés.' }); return; }
      const es = brut(src), R = Sc.REGIMES[es.reseau];
      const rg = es.reseau === 'co' ? (froid ? [es.TdepF, es.TretF] : [es.TdepC, es.TretC]) : es.reseau === 'perso' ? [es.Tdep, es.Tret] : R ? [R[1], R[2]] : null;
      if (!rg) return;
      if (froid !== (num(rg[0]) < num(rg[1]))) { alertes.push({ niveau: 'attention', texte: `${libelle(src)} : régime ${rg[0]}/${rg[1]} °C, pas un régime ${froid ? 'd\'eau glacée' : 'd\'eau chaude'}.` }); return; }
      e[kd] = num(rg[0]); e[kr] = num(rg[1]); verrous[kd] = libelle(src); verrous[kr] = libelle(src);
    });
    // Production d'ECS choisie par un calcul sanitaire : besoins repris des points de puisage (méthode des puisages)
    if (note.type === 'ecs') {
      const san = notes.find(n => n.type === 'sanitaire' && (n.entrees || {}).production === note.id);
      if (san) {
        try {
          const v = N.calculer('sanitaire', resoudre(etude, san, pile).entrees).valeurs, b = v.besoinECS;
          if (b && b.Vj > 0) {
            Object.assign(e, { usage: 'perso', Vj: Math.round(b.Vj), pointe: Math.round(b.part * 100), tp: b.tp, Tc: b.Tst, Tf: num(brut(san).Tef) || e.Tf });
            ['usage', 'Vj', 'pointe', 'tp', 'Tc', 'Tf'].forEach(k => { verrous[k] = `${libelle(san)} (${v.points} points de puisage)`; });
          }
        } catch (err) { alertes.push({ niveau: 'attention', texte: 'Calcul sanitaire relié incomplet : besoins saisis conservés.' }); }
      }
    }
    // Terminaux : besoins des pièces des bilans pièce par pièce de l'étude
    if (note.type === 'terminaux' && notes.some(n => n.type === 'pieces')) { try { e._besoins = (typeof Pieces !== 'undefined' ? Pieces : require('./pieces')).besoinsEtude(etude); } catch (err) { /* sans bilan */ } }
    // Réseau arborescent : branches reliées à un émetteur de l'étude (terminal, batterie de CTA)
    if (note.type === 'arbo') lienEmetteurs(etude, e, verrous, alertes, libelle, pile);
    // Schéma : puissance des circuits sans bilan ni réseau annexe = somme des terminaux qui y sont rattachés
    if (note.type === 'pid') {
      const terms = notes.filter(n => n.type === 'terminaux');
      (e.circuits || []).forEach((c, i) => {
        if (!c.rep || c.bilan || c.annexe) return;
        const cle = `${note.id}|${c.rep}`, srcs = [];
        let P = 0, Pf = 0, nb = 0;
        terms.forEach(n => {
          const r = N.calculer('terminaux', resoudre(etude, n, pile).entrees);
          (r.valeurs.lignes || []).forEach((x, k) => { const a = ((n.entrees || {}).appareils || []).find(y => y.rep === x.rep); if (a && a.circuit === cle) { P += x.Pch; Pf += x.Pfr; nb++; if (!srcs.includes(n)) srcs.push(n); } });
        });
        if (!nb) return;
        c.P = Math.round(P * 10) / 10; verrous[`circuits.${i}.P`] = `${nb} terminal(aux) de ${srcs.map(libelle).join(', ')}`;
        if (e.reseau === 'co') { c.Pf = Math.round(Pf * 10) / 10; verrous[`circuits.${i}.Pf`] = verrous[`circuits.${i}.P`]; }
      });
    }
    // Réseau aéraulique relié à une CTA (et CTA alimentée par ses réseaux)
    const air = lienAir(etude, note, e, verrous, alertes, libelle), eau = note.lien ? null : lienHydro(etude, note, e, verrous, alertes, libelle, pile);
    if (air || eau) return { entrees: e, verrous, alertes, source: air && eau ? { ...air, libelle: `${air.libelle}, ${eau.libelle}`, texte: `${air.texte} ${eau.texte}` } : air || eau };
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

  /* ---------- Réseau arborescent ← émetteurs (terminaux, batteries de CTA) ---------- */
  // Chaque branche reliée prend la puissance, le débit (régime de l'émetteur) et la perte de charge côté eau de la
  // batterie (fiche technique) + vanne de régulation ; seule l'arborescence (tronçons amont, longueurs) reste à saisir
  function lienEmetteurs(etude, e, verrous, alertes, libelle, pile) {
    const notes = (etude && etude.notes) || [], froid = e.saison === 'froid', cache = new Map();
    const calc = src => { if (!cache.has(src.id)) { try { cache.set(src.id, N.calculer(src.type, resoudre(etude, src, pile).entrees)); } catch (err) { cache.set(src.id, null); } } return cache.get(src.id); };
    // Pompes placées : point de fonctionnement repris de l'équipement (fiche technique)
    (e.troncons || []).forEach(t => {
      if (!t || !t.pompe) return;
      const [id, cle] = String(t.pompe).split(':'), src = notes.find(n => n.id === id), a = src && ((src.entrees || {}).appareils || []).find(x => x.rep === cle);
      if (!a) { alertes.push({ niveau: 'attention', texte: `${t.rep || 'Tronçon'} : la pompe placée n'existe plus dans les équipements.` }); return; }
      Object.assign(t, { pompeQ: num(a.Qp), pompeH: num(a.Hp), pompeNom: `${a.rep}${a.ref ? ` (${a.ref})` : ''}` });
    });
    (e.troncons || []).forEach((t, i) => {
      if (!t || !t.emetteur) return;
      const [id, cle] = String(t.emetteur).split(':'), src = notes.find(n => n.id === id), rep = t.rep || `Tronçon ${i + 1}`;
      if (!src) { alertes.push({ niveau: 'attention', texte: `${rep} : l'émetteur relié a été supprimé de l'étude, valeurs saisies conservées.` }); return; }
      const r = calc(src); if (!r) return;
      let P, Q, dp;
      if (src.type === 'terminaux') {
        const x = (r.valeurs.lignes || []).find(l => l.rep === cle);
        if (!x) { alertes.push({ niveau: 'attention', texte: `${rep} : terminal ${cle} introuvable dans ${libelle(src)}.` }); return; }
        const dpV = num((src.entrees || {}).dpVanne, 15), dpB = froid ? x.dpF : x.dpC;
        P = froid ? x.Pfr : x.Pch; Q = froid ? x.qf : x.qc; dp = (dpB || 0) + (x.nbV ? dpV : 0);
        if (!dpB) alertes.push({ niveau: 'info', texte: `${rep} : perte de charge eau de ${cle} non renseignée (fiche technique du terminal) : seule la vanne est comptée.` });
      } else if (src.type === 'cta') {
        const v = r.valeurs, f = (src.entrees || {}).fiche || {}, dpB = froid ? f.dpEauBF : f.dpEauBC;
        P = froid ? v.Pfroid : v.Pchaud; Q = froid ? v.QwF : v.QwC; dp = (Number.isFinite(dpB) ? dpB : 20) + 15;
        if (!Number.isFinite(dpB)) alertes.push({ niveau: 'info', texte: `${rep} : batterie de ${src.titre} : 20 kPa côté eau pris par défaut (fiche technique de la CTA à charger) + 15 kPa de vanne.` });
      } else return;
      Object.assign(t, { P: Math.round(num(P) * 100) / 100, Q: Math.round(num(Q) * 1000) / 1000, dpEm: Math.round(dp * 10) / 10 });
      if (!String(t.nom || '').trim()) t.nom = src.type === 'cta' ? `${src.titre} (batterie ${froid ? 'froide' : 'chaude'})` : cle;
      ['P', 'Q', 'dpEm'].forEach(k => { verrous[`troncons.${i}.${k}`] = libelle(src); });
    });
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

  /* ---------- Chaufferie / sous-station ↔ réseaux annexes ---------- */
  const ANNEXES = ['arbo', 'reseau', 'cta'];
  // Circuit du schéma qui alimente une note : { pid, i } (premier trouvé)
  function circuitDeAnnexe(notes, note) {
    for (const pid of notes.filter(n => n.type === 'pid')) {
      const i = ((pid.entrees || {}).circuits || []).findIndex(c => c && c.annexe === note.id);
      if (i >= 0) return { pid, i };
    }
    return null;
  }
  function lienHydro(etude, note, e, verrous, alertes, libelle, pile) {
    const notes = (etude && etude.notes) || [];
    const imposer = (vals, lib) => Object.entries(vals).forEach(([k, v]) => { e[k] = v; verrous[k] = lib; });
    // Schéma : chaque circuit relié prend la puissance et les pertes de charge de son réseau annexe
    if (note.type === 'pid') {
      // Régimes des circuits (indépendants des réseaux annexes) : le réseau annexe est calculé au régime de son circuit
      let d0 = null;
      if ((e.circuits || []).some(c => c && c.annexe)) { try { d0 = Sc.dimensionner(e); } catch (err) { d0 = null; } }
      (e.circuits || []).forEach((c, i) => {
        if (!c.annexe) return;
        const src = notes.find(n => n.id === c.annexe && ANNEXES.includes(n.type)), rep = c.rep || `Circuit ${i + 1}`;
        if (!src) { alertes.push({ niveau: 'attention', texte: `${rep} : le réseau annexe relié a été supprimé, valeurs saisies conservées.` }); delete c.annexe; return; }
        const dc = d0 && d0.circuits[i], rc = dc && (dc.rc || dc.rcC), regime = rc && src.type !== 'cta' ? { fluide: e.fluide, T: Math.round((rc[0] + rc[1]) / 2 * 10) / 10, serie: e.serie, ...(src.type === 'arbo' ? { dT: Math.abs(rc[0] - rc[1]) } : {}) } : {};
        const lib = libelle(src), v = N.calculer(src.type, { ...brut(src), ...regime }).valeurs || {}, lock = k => { verrous[`circuits.${i}.${k}`] = lib; };
        if (src.type === 'cta') {
          const co = e.reseau === 'co', froid = (() => { const r = Sc.REGIMES[e.reseau]; return e.reseau === 'perso' ? num(e.Tdep) < num(e.Tret) : r && r[1] < r[2]; })();
          if (!c.bilan) { c.P = Math.round((co || !froid ? v.Pchaud : v.Pfroid) * 10) / 10; lock('P'); }
          if (co) { c.Pf = Math.round(v.Pfroid * 10) / 10; lock('Pf'); }
          if (c.emetteur !== 'cta') { c.emetteur = 'cta'; lock('emetteur'); }
          return;
        }
        // Réseau arborescent ou réseau et pompe : il décrit la distribution depuis le collecteur (longueur du circuit à 0)
        c.L = 0; lock('L');
        if (src.type === 'arbo') {
          c.dpAnnexe = Math.round(v.Hres / 100) / 10;
          if (!c.bilan) { c.P = Math.round(v.Ptot * 10) / 10; lock('P'); }
        } else {
          c.dpAnnexe = Math.round(v.dpTotal / 100) / 10;
          if (!c.bilan && v.Qpompe > 0 && d0) {
            const f = d0.f;
            c.P = Math.round(v.Qpompe / 3600 * f.rho * f.cp * Math.abs(rc[0] - rc[1]) / 100) / 10; lock('P');
          }
        }
      });
      return null;
    }
    if (!ANNEXES.includes(note.type)) return null;
    const ref = circuitDeAnnexe(notes, note);
    if (!ref) return null;
    const lib = libelle(ref.pid), es = resoudre(etude, ref.pid, pile).entrees;
    let d;
    try { d = Sc.dimensionner(es); } catch (err) { return null; }
    const c = d.circuits[ref.i];
    if (!c) return null;
    const rc = c.rc || c.rcC, Tm = Math.round((rc[0] + rc[1]) / 2 * 10) / 10, rep = c.rep;
    if (note.type === 'arbo') imposer({ fluide: es.fluide, T: Tm, dT: Math.abs(rc[0] - rc[1]), serie: es.serie, dpGen: Math.round((c.dpL + c.dpV + 5) * 10) / 10 }, lib);
    if (note.type === 'reseau') {
      imposer({ fluide: es.fluide, T: Tm, serie: es.serie, circuit: 'ferme' }, lib);
      const doublons = (e.composants || []).filter(x => /vanne de r[ée]gulation|g[ée]n[ée]rateur|[ée]changeur|chaudi[eè]re/i.test(x.nom || '') && num(x.dp) > 0);
      if (doublons.length) alertes.push({ niveau: 'attention', texte: `Déjà comptés par le circuit « ${rep} » du schéma (vanne de régulation, production) : ${doublons.map(x => x.nom).join(', ')} — à retirer des équipements de ce réseau.` });
    }
    if (note.type === 'cta') {
      if (c.rcC) imposer({ TcAller: c.rcC[0], TcRetour: c.rcC[1], TfAller: c.rcF[0], TfRetour: c.rcF[1] }, lib);
      else if (d.chaud) imposer({ TcAller: rc[0], TcRetour: rc[1] }, lib);
      else imposer({ TfAller: rc[0], TfRetour: rc[1], froid: 'oui' }, lib);
    }
    const quoi = note.type === 'cta' ? 'régime d\'eau des batteries' : note.type === 'arbo' ? 'fluide, régime, série de tubes et pertes de charge côté production' : 'fluide, température et série de tubes';
    return { note: ref.pid, libelle: lib, texte: `Alimenté par le circuit « ${rep} » de ${lib} (${quoi} repris) ; ${note.type === 'cta' ? 'puissances des batteries' : 'puissance et pertes de charge de ce réseau'} renvoyées au circuit, dont la pompe est dimensionnée en conséquence. Mise à jour automatique.` };
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
      if ((es.circuits[i] || {}).annexe) return; // circuit déjà relié à un réseau annexe
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
    // Réseau annexe détaché de son circuit ; schéma détaché de ses réseaux annexes (valeurs conservées)
    const ref = ANNEXES.includes(note.type) && circuitDeAnnexe(etude.notes || [], note);
    if (ref) ref.pid.entrees.circuits[ref.i] = { ...resoudre(etude, ref.pid).entrees.circuits[ref.i], annexe: '' };
    if (note.type === 'pid') (note.entrees.circuits || []).forEach(c => { delete c.annexe; });
    if (note.type === 'cta') reseauxDeCta(etude.notes || [], note).forEach(n => { n.entrees = resoudre(etude, n).entrees; n.entrees.cta = ''; });
    if (note.type === 'pid') (note.entrees.circuits || []).forEach(c => { delete c.bilan; });
  }
  const description = (etude, note) => {
    const r = resoudre(etude, note);
    if (!r.source) return '';
    if (r.source.texte) return r.source.texte;
    return `Données reprises de ${r.source.libelle}${r.source.circuit ? ` (circuit « ${r.source.circuit} »)` : ''} pour ce ${ROLES[note.lien.role] || 'calcul'} : mises à jour automatiquement.`;
  };
  // Fiches techniques de l'installation, vues depuis le schéma de principe ou le réseau arborescent : production,
  // terminaux et pompes (rattachés au circuit ou à une branche), CTA ; chaque ligne dit où charger la fiche
  function fichesInstallation(etude, note) {
    const notes = (etude && etude.notes) || [], out = [], vus = new Set(), lib = n => `N${notes.indexOf(n) + 1} — ${n.titre}`;
    const ficheDe = f => (f && (f.fabricant || f.reference || f.nom) ? f : null);
    const ajTerm = (n, a) => { const k = `${n.id}:${a.rep}`; if (vus.has(k)) return; vus.add(k); out.push({ element: `${a.rep}${a.local ? ` — ${a.local}` : ''}`, nature: (typeof Terminaux !== 'undefined' ? Terminaux : require('./terminaux')).TYPES[a.type] ? (typeof Terminaux !== 'undefined' ? Terminaux : require('./terminaux')).TYPES[a.type][0] : 'Équipement', fiche: ficheDe(a.fiche) || (a.ref ? { reference: a.ref } : null), note: n.id, rep: a.rep, ou: lib(n) }); };
    const ajNote = (n, nature) => { if (vus.has(n.id)) return; vus.add(n.id); out.push({ element: n.titre, nature, fiche: ficheDe((n.entrees || {}).fiche), note: n.id, ou: lib(n) }); };
    const terms = notes.filter(n => n.type === 'terminaux');
    if (note.type === 'pid') {
      ajNote(note, 'Production (générateur)');
      // Robinetterie et accessoires des circuits : une fiche par organe
      const RB = (typeof Schema !== 'undefined' ? Schema : require('./schema')).ROBINETTERIE;
      ((note.entrees || {}).robinetterie || []).forEach((r, i) => { if (r && r.type) out.push({ element: `${r.rep || `Organe ${i + 1}`}${r.circuit ? ` — ${r.circuit}` : ''}`, nature: (RB[r.type] || RB.autre)[0], fiche: ficheDe(r.fiche) || (r.ref ? { reference: r.ref } : null), note: note.id, robinet: i, ou: lib(note) }); });
      const reps = new Set(((note.entrees || {}).circuits || []).map(c => `${note.id}|${c.rep}`));
      ((note.entrees || {}).circuits || []).forEach(c => { const an = c.annexe && notes.find(n => n.id === c.annexe); if (an && an.type === 'cta') ajNote(an, 'CTA (batteries)'); if (an && an.type === 'arbo') (an.entrees.troncons || []).forEach(t => { if (t.pompe) { const [id, r] = String(t.pompe).split(':'); const tn = notes.find(n => n.id === id), a = tn && (tn.entrees.appareils || []).find(x => x.rep === r); if (a) ajTerm(tn, a); } }); });
      terms.forEach(n => (n.entrees.appareils || []).forEach(a => { if (reps.has(a.circuit)) ajTerm(n, a); }));
    } else if (note.type === 'aero') {
      const cta = notes.find(n => n.id === (note.entrees || {}).cta && n.type === 'cta');
      if (cta) ajNote(cta, 'CTA'); else out.push({ element: (note.entrees || {}).titreInstallation || note.titre, nature: 'Producteur (CTA, caisson)', fiche: ficheDe((note.entrees || {}).fiche), note: note.id, ou: lib(note) });
      ((note.entrees || {}).bouchesL || []).forEach((b, i) => { if (b && (b.rep || b.salle)) out.push({ element: `${b.rep || 'Bouche'}${b.salle ? ` — ${b.salle}` : ''}${b.etage ? ` (${b.etage})` : ''}`, nature: 'Bouche', fiche: ficheDe(b.fiche) || (b.ref ? { reference: b.ref } : null), note: note.id, bouche: i, ou: lib(note) }); });
    } else if (note.type === 'arbo') {
      const pid = notes.find(n => n.type === 'pid' && ((n.entrees || {}).circuits || []).some(c => c.annexe === note.id));
      if (pid) ajNote(pid, 'Production (générateur)');
      ((note.entrees || {}).troncons || []).forEach(t => [t.emetteur, t.pompe].filter(Boolean).forEach(cl => {
        const [id, r] = String(cl).split(':'), n = notes.find(x => x.id === id); if (!n) return;
        if (n.type === 'cta') ajNote(n, 'CTA (batteries)'); else { const a = (n.entrees.appareils || []).find(x => x.rep === r); if (a) ajTerm(n, a); }
      }));
    } else if (note.type === 'sanitaire') {
      const ecs = notes.find(n => n.id === (note.entrees || {}).production && n.type === 'ecs');
      if (ecs) ajNote(ecs, 'Production d\'ECS (ballon)');
      const A = (typeof Sanitaire !== 'undefined' ? Sanitaire : require('./sanitaire')).APPAREILS;
      ((note.entrees || {}).points || []).forEach((p, i) => { if (p && (p.rep || p.salle)) out.push({ element: `${p.rep || 'Point'}${p.salle ? ` — ${p.salle}` : ''}${p.etage ? ` (${p.etage})` : ''}`, nature: (A[p.type] || ['Point de puisage'])[0], fiche: ficheDe(p.fiche) || (p.ref ? { reference: p.ref } : null), note: note.id, point: i, ou: lib(note) }); });
    }
    return out;
  }
  return { fichesInstallation, resoudre, calculer, notesDepuisSchema, detacher, description, reseauxDeCta, circuitDeAnnexe, nf };
})(typeof Notes !== 'undefined' ? Notes : require('./notes'), typeof Schema !== 'undefined' ? Schema : require('./schema'));
if (typeof module !== 'undefined') module.exports = Liens;
