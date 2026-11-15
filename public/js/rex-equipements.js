// Retour d'expérience des équipements : les interventions du contrat d'entretien (pannes, pièces changées) sont
// rattachées à l'équipement du matériel retenu (par n° de série, sinon par repère) ; historique par modèle (fabricant +
// référence) sur toutes les affaires ; à l'étude suivante, alerte quand on retient un modèle au taux de pannes élevé
// (seuil réglable). Module commun CRM / serveur / Études / tests (pur).
const RexEquipements = (() => {
  const txt = (v, k = 200) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, k);
  const cle = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  const TYPES = ['Panne', 'Pièce changée', 'Réglage', 'Visite préventive'];
  // Défaillance : panne, ou pièce changée hors visite préventive
  const defaillance = iv => iv.type === 'Panne' || (iv.type === 'Pièce changée');
  const modele = (fabricant, reference) => (cle(reference) ? `${cle(fabricant)}|${cle(reference)}` : '');
  const listePieces = p => (Array.isArray(p) ? p : String(p || '').split(/[;\n]+/)).map(x => (typeof x === 'string' ? { designation: txt(x, 120), qte: 1 } : { designation: txt(x.designation, 120), qte: Number(x.qte) || 1 })).filter(x => x.designation);

  // Équipement du chantier visé par une intervention : n° de série d'abord, puis repère (segment de la clé, mot de la
  // désignation ou repère du DOE), puis fabricant + référence saisis
  function rattacher(iv, materiel) {
    const ms = materiel || [], s = cle(iv.serie), r = cle(iv.repere);
    if (iv.equipement) { const m = ms.find(x => `${x.etudeId}|${x.cle}` === iv.equipement); if (m) return { m, par: 'lien' }; }
    if (s) { const m = ms.find(x => cle(x.serie) === s); if (m) return { m, par: 'série' }; }
    if (r) {
      const m = ms.find(x => cle(x.repere) === r || String(x.cle || '').split('|').some(k => cle(k) === r) || String(x.designation || '').split(/[\s—–,()]+/).some(w => cle(w) === r));
      if (m) return { m, par: 'repère' };
    }
    if (cle(iv.reference)) { const m = ms.find(x => modele(x.fabricant, x.reference) === modele(iv.fabricant, iv.reference)); if (m) return { m, par: 'modèle' }; }
    return null;
  }
  // Nouvelle intervention du contrat, complétée par l'équipement retrouvé (fabricant, référence, désignation, lien)
  function intervention(iv, materiel, { id, par = '' } = {}) {
    const o = { id: txt(id || iv.id, 64), date: txt(iv.date, 10), type: TYPES.includes(iv.type) ? iv.type : 'Panne', repere: txt(iv.repere, 40), serie: txt(iv.serie, 60), description: txt(iv.description, 500),
      pieces: listePieces(iv.pieces), fabricant: txt(iv.fabricant, 80), reference: txt(iv.reference, 120), designation: txt(iv.designation, 160), equipement: txt(iv.equipement, 260), par: txt(par || iv.par, 80) };
    const t = rattacher(o, materiel);
    if (t) Object.assign(o, { equipement: `${t.m.etudeId}|${t.m.cle}`, fabricant: o.fabricant || t.m.fabricant, reference: o.reference || t.m.reference, designation: o.designation || t.m.designation, serie: o.serie || txt(t.m.serie, 60), rattachePar: t.par });
    return o;
  }

  // Historique par modèle sur toutes les affaires. affaires : [{ id, code, materiel: [lignes du matériel retenu],
  // interventions: [...] }] ; aujourdhui : pour les années de service. Renvoie une liste triée par taux de pannes.
  function historique(affaires, aujourdhui) {
    const par = new Map(), jour = Date.parse(aujourdhui || new Date().toISOString().slice(0, 10));
    const get = (f, r, d) => { const k = modele(f, r); if (!k) return null; if (!par.has(k)) par.set(k, { modele: k, fabricant: txt(f, 80), reference: txt(r, 120), designation: txt(d, 160), installes: 0, anneesService: 0, pannes: 0, interventions: 0, pieces: {}, affaires: new Set(), dernieres: [] }); return par.get(k); };
    (affaires || []).forEach(a => {
      (a.materiel || []).filter(m => m.mesLe || m.poseLe).forEach(m => {
        const h = get(m.fabricant, m.reference, m.designation); if (!h) return;
        const q = Math.max(1, Math.round(Number(m.qte) || 1)), debut = Date.parse(m.mesLe || m.poseLe);
        h.installes += q; h.affaires.add(a.id);
        if (Number.isFinite(debut) && jour > debut) h.anneesService += q * (jour - debut) / (365.25 * 864e5);
      });
      (a.interventions || []).forEach(iv => {
        const h = get(iv.fabricant, iv.reference, iv.designation); if (!h) return;
        h.interventions++; h.affaires.add(a.id);
        if (defaillance(iv)) h.pannes++;
        listePieces(iv.pieces).forEach(p => { h.pieces[p.designation] = (h.pieces[p.designation] || 0) + p.qte; });
        h.dernieres.push({ affaire: txt(a.code || a.id, 40), date: iv.date, type: iv.type, description: txt(iv.description, 160) });
      });
    });
    return [...par.values()].map(h => ({ ...h, affaires: h.affaires.size, anneesService: Math.round(h.anneesService * 10) / 10,
      // Pannes par équipement installé ; et par équipement et par an de service quand la durée est connue
      taux: h.installes ? Math.round(h.pannes / h.installes * 100) / 100 : null, tauxAnnuel: h.anneesService >= 0.5 ? Math.round(h.pannes / h.anneesService * 100) / 100 : null,
      pieces: Object.entries(h.pieces).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([designation, qte]) => ({ designation, qte })), dernieres: h.dernieres.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5) }))
      .sort((a, b) => (b.taux ?? -1) - (a.taux ?? -1) || b.pannes - a.pannes);
  }
  // Alertes de l'étude : modèles retenus dont le taux de pannes atteint le seuil (pannes par équipement installé),
  // sur au moins minInstalles équipements en service. lignes : matériel retenu de l'étude [{ cle, designation, fabricant, reference }]
  function alertes(lignes, hist, { seuil = 0.3, minInstalles = 2 } = {}) {
    const par = new Map((hist || []).map(h => [h.modele, h]));
    return (lignes || []).filter(l => l && l.reference).map(l => ({ l, h: par.get(modele(l.fabricant, l.reference)) }))
      .filter(({ h }) => h && h.installes >= minInstalles && h.taux !== null && h.taux >= seuil - 1e-9)
      .map(({ l, h }) => ({ cle: l.cle, designation: txt(l.designation, 160), modele: [h.fabricant, h.reference].filter(Boolean).join(' '), taux: h.taux, tauxAnnuel: h.tauxAnnuel, pannes: h.pannes, installes: h.installes, affaires: h.affaires,
        pieces: h.pieces, texte: `${[h.fabricant, h.reference].filter(Boolean).join(' ')} : ${h.pannes} panne(s) pour ${h.installes} équipement(s) en service sur ${h.affaires} affaire(s) (${Math.round(h.taux * 100)} %${h.tauxAnnuel !== null ? `, ${String(h.tauxAnnuel).replace('.', ',')} par équipement et par an` : ''})${h.pieces.length ? ` — pièces changées : ${h.pieces.map(p => `${p.designation} × ${p.qte}`).join(', ')}` : ''}` }));
  }
  return { TYPES, defaillance, modele, listePieces, rattacher, intervention, historique, alertes };
})();
if (typeof module !== 'undefined') module.exports = RexEquipements;
