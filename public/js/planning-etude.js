// Planning du chantier relié à l'étude : à partir des heures de main-d'œuvre du métré (application Études), proposition
// de lots / tâches (réseaux, production, CTA et ventilation, terminaux, régulation et électricité, essais et mise en
// service, DOE) avec des durées estimées selon l'effectif, enchaînés logiquement ; chaque tâche porte le matériel qu'il
// faut avoir reçu avant de la commencer, et l'état d'achat du matériel (consulté, commandé, livraison prévue, reçu)
// signale une tâche qui démarre avant la réception prévue. Phases au format du Gantt du chantier (gantt-calc.js).
// Module pur commun navigateur (Pipe-Fit, Études) / tests.
const PlanningEtude = (() => {
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const sansAcc = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Lots dans l'ordre d'exécution ; tache : nom de la tâche du planning des équipes
  const LOTS = [
    { lot: 'preparation', libelle: 'Préparation, études d\'exécution et approvisionnements', tache: 'Études' },
    { lot: 'reseaux', libelle: 'Réseaux (tuyauteries, gaines, calorifuge)', tache: 'Réseaux' },
    { lot: 'production', libelle: 'Production (chaufferie, PAC, groupes, ballons)', tache: 'Production' },
    { lot: 'cta', libelle: 'CTA, ventilation et désenfumage', tache: 'CTA' },
    { lot: 'terminaux', libelle: 'Terminaux (émetteurs, bouches, appareils)', tache: 'Terminaux' },
    { lot: 'regulation', libelle: 'Régulation et électricité', tache: 'Régulation' },
    { lot: 'essais', libelle: 'Essais et mise en service', tache: 'Contrôles / essais' },
    { lot: 'doe', libelle: 'Réception et DOE', tache: '' },
  ];
  // Lot d'un poste du métré : chapitre, clé et désignation
  function lotDe(p) {
    const ch = p.chapitre || '', cle = String(p.cle || ''), t = sansAcc(p.designationBase || p.designation);
    if (ch === 'Études') return 'preparation';
    if (['Production', 'Énergies renouvelables', 'Froid'].includes(ch)) return 'production';
    if (ch === 'Régulation et sécurités') return 'regulation';
    if (/^(aero|cta)\|/.test(cle) || ch === 'Désenfumage' || (ch === 'Aéraulique' && /centrale|\bcta\b|caisson|extracteur|ventilateur|tourelle/.test(t) && p.unite === 'u')) return 'cta';
    if (['Émetteurs', 'Appareils sanitaires'].includes(ch) || /^bouche\|/.test(cle) || (p.unite === 'u' && /bouche|grille|diffuseur|ventilo|radiateur|cassette|unite interieure/.test(t))) return 'terminaux';
    if (/^cctp\|regulation/.test(cle) || /armoire|automate|regulation/.test(t) && p.unite === 'u') return 'regulation';
    return 'reseaux';
  }
  // Heures du métré par lot (heures par unité × quantité) et équipements à approvisionner (unités) de chaque lot
  function heuresMetre(postes) {
    const out = new Map();
    (postes || []).filter(p => p && p.inclus !== false).forEach(p => {
      const lot = lotDe(p), x = out.get(lot) || { lot, heures: 0, cles: [], chapitres: [] };
      x.heures += num(p.qte) * num(p.heures);
      if (p.unite === 'u' && p.chapitre !== 'Études' && p.cle) x.cles.push(String(p.cle));
      if (p.chapitre && !x.chapitres.includes(p.chapitre)) x.chapitres.push(p.chapitre);
      out.set(lot, x);
    });
    return LOTS.map(l => out.get(l.lot)).filter(Boolean).map(x => ({ ...x, heures: Math.round(x.heures * 10) / 10, cles: x.cles.slice(0, 300) }));
  }

  // Proposition de phases. lots : heuresMetre d'une ou plusieurs études ([{ etudeId, lots }]) ;
  // o : { effectif (compagnons), heuresJour, debut, uid, partEssais, joursDoe, joursAppro }
  function proposer(etudes, o = {}) {
    const effectif = Math.max(1, Math.round(num(o.effectif) || 2)), hj = Math.max(1, num(o.heuresJour) || 7), uid = o.uid || (() => Math.random().toString(36).slice(2, 10));
    const parLot = new Map();
    (etudes || []).forEach(e => (e.lots || []).forEach(l => {
      const x = parLot.get(l.lot) || { heures: 0, materiel: [] };
      x.heures += num(l.heures);
      x.materiel.push(...(l.cles || []).map(c => `${e.etudeId}|${c}`));
      parLot.set(l.lot, x);
    }));
    const chantier = ['reseaux', 'production', 'cta', 'terminaux', 'regulation'].reduce((s, k) => s + ((parLot.get(k) || {}).heures || 0), 0);
    if (!chantier) return [];
    // Essais et mise en service : part des heures de pose (8 % par défaut, au moins une journée) ; DOE : jours du bureau
    parLot.set('essais', { heures: Math.max(effectif * hj, Math.round(chantier * (o.partEssais ?? 0.08))), materiel: [] });
    parLot.set('doe', { heures: (o.joursDoe ?? 3) * hj, materiel: [], equipe: 1 });
    const prep = parLot.get('preparation') || { heures: 0, materiel: [] };
    parLot.set('preparation', { ...prep, equipe: 1, joursMin: o.joursAppro ?? 15 });
    // Équipe partagée en deux si elle est assez nombreuse : production et CTA en parallèle
    const deuxEquipes = effectif >= 4 && (parLot.get('production') || {}).heures > 0 && (parLot.get('cta') || {}).heures > 0;
    const phases = [], idDe = {};
    LOTS.forEach(L => {
      const x = parLot.get(L.lot);
      if (!x || !(x.heures > 0) && !['preparation', 'doe'].includes(L.lot)) return;
      const eq = x.equipe || (deuxEquipes && ['production', 'cta'].includes(L.lot) ? Math.ceil(effectif / 2) : effectif);
      const duree = Math.max(x.joursMin || 1, Math.ceil(x.heures / (eq * hj)) || 1);
      // Enchaînement : chaque lot après le précédent ; production et CTA après les réseaux (en parallèle à deux équipes) ;
      // terminaux après les réseaux et la CTA ; régulation après la production, la CTA et les terminaux ; essais, puis DOE
      const avant = { preparation: [], reseaux: ['preparation'], production: ['reseaux'], cta: deuxEquipes ? ['reseaux'] : ['production', 'reseaux'], terminaux: ['cta', 'production', 'reseaux'],
        regulation: ['terminaux', 'cta', 'production', 'reseaux'], essais: ['regulation', 'terminaux', 'cta', 'production', 'reseaux'], doe: ['essais'] }[L.lot];
      // Dépendances : les lots précédents présents (le plus proche d'abord ; tous pour un parallèle)
      const presents = avant.filter(k => idDe[k]);
      const apres = L.lot === 'terminaux' || L.lot === 'regulation' || L.lot === 'essais' ? presents.filter(k => ['cta', 'production', 'terminaux', 'regulation'].includes(k)).slice(0, 2) : presents.slice(0, 1);
      const p = { id: uid(), libelle: L.libelle, tache: L.tache, duree, heures: Math.round(x.heures), apres: (apres.length ? apres : presents.slice(0, 1)).map(k => idDe[k]), decalage: 0, termine: false,
        lot: L.lot, equipe: eq, materiel: [...new Set(x.materiel)], origine: 'etude', ...(L.lot === 'preparation' && o.debut ? { debut: o.debut } : {}) };
      idDe[L.lot] = p.id;
      phases.push(p);
    });
    return phases;
  }

  // Alertes d'approvisionnement : pour chaque phase calculée (GanttCalc.calculer) portant du matériel, l'état d'achat de
  // chaque équipement (lignes du chantier : suiviCommandes, clé « étude|clé ») ; etatAchat : MaterielRetenu.etatAchat
  // o : { aujourdhui, delaiAppro (jours calendaires pour commander avant le début), etatAchat }
  function alertes(phases, materiel, o = {}) {
    const auj = o.aujourdhui || new Date().toISOString().slice(0, 10), delai = o.delaiAppro ?? 21;
    const etat = o.etatAchat || (m => ({ etat: m.livraison === 'livrée' ? 'recu' : m.commande ? 'commande' : m.consultation ? 'consulte' : '', prevue: (m.commande || {}).datePrevue || '' }));
    const parCle = new Map((materiel || []).map(m => [`${m.etudeId}|${m.cle}`, m]));
    const jours = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
    const out = [], bilan = {};
    (phases || []).forEach(p => {
      const b = { total: 0, recus: 0, commandes: 0, aCommander: 0, retards: 0, inconnus: 0 };
      (p.materiel || []).forEach(k => {
        const m = parCle.get(k);
        if (!m) { b.inconnus++; return; }
        b.total++;
        const a = etat(m), nom = m.designation || k, rep = [m.fabricant, m.reference].filter(Boolean).join(' ');
        if (a.etat === 'recu') { b.recus++; return; }
        if (p.termine) return;
        if (a.etat === 'commande' || a.etat === 'partiel') {
          b.commandes++;
          if (!a.prevue) out.push({ phaseId: p.id, phase: p.libelle, cle: k, niveau: 'attention', texte: `${nom}${rep ? ` (${rep})` : ''} : commandé sans date de livraison — à confirmer avant le ${p.debut}.` });
          else if (a.prevue > p.debut) { b.retards++; out.push({ phaseId: p.id, phase: p.libelle, cle: k, niveau: 'erreur', texte: `${nom}${rep ? ` (${rep})` : ''} : livraison prévue le ${a.prevue}, après le début de « ${p.libelle} » (${p.debut}).` }); }
          return;
        }
        b.aCommander++;
        const reste = jours(auj, p.debut);
        if (reste <= delai) { b.retards++; out.push({ phaseId: p.id, phase: p.libelle, cle: k, niveau: reste < 0 ? 'erreur' : 'attention', texte: `${nom}${rep ? ` (${rep})` : ''} : ${a.etat ? 'consulté, pas encore commandé' : 'pas encore commandé'} — « ${p.libelle} » commence le ${p.debut}${reste >= 0 ? ` (dans ${reste} j)` : ' (déjà commencée)'}.` }); }
      });
      bilan[p.id] = b;
    });
    return { alertes: out, bilan };
  }
  return { LOTS, lotDe, heuresMetre, proposer, alertes };
})();
if (typeof module !== 'undefined') module.exports = PlanningEtude;
