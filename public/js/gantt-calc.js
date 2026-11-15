// Gantt des chantiers : phases enchaînées (« après » une autre phase, avec décalage), recalées sur le planning des
// équipes, et plan de charge à venir semaine par semaine. Module commun navigateur / tests.
//
// Phase enregistrée dans le chantier (a.phases) : { id, libelle, tache (tâche du planning, ex. « Montage »),
//   debut (au plus tôt, AAAA-MM-JJ, facultatif), duree (jours ouvrés), heures, apres: [id…] (toutes fin → début),
//   decalage (jours ouvrés, commun), decalages: { id: jours } (décalage propre à une dépendance, facultatif),
//   equipeId (équipe du chantier a.equipes [{ id, nom, effectif }], facultatif), termine (bool) }.
// Règles de calcul, dans l'ordre des dépendances :
//   1. début au plus tôt = max(date saisie, fin des phases précédentes + 1 jour ouvré + décalage) ;
//   2. phase déjà au planning (affectations ou heures pointées sur sa tâche) : elle commence au premier jour planifié et
//      finit au plus tôt à son dernier jour planifié ; les phases suivantes se décalent d'autant ;
//   3. phase non commencée dont le début est passé : elle glisse au prochain jour ouvré (retard), et les suivantes avec ;
//   4. heures restantes = heures prévues − heures pointées sur la phase, réparties sur ses jours ouvrés à venir ;
//   5. ressources : deux phases de la même équipe ne se chevauchent pas ; les phases sont placées dans l'ordre de leur
//      début au plus tôt (dépendances seules), puis de la liste, au premier créneau libre de l'équipe ;
//   6. chemin critique : marge totale de chaque phase (jours ouvrés libres jusqu'à ses suivantes, dépendances et
//      enchaînements d'équipe compris, ou jusqu'à la fin du chantier) ; marge nulle = phase critique.
const GanttCalc = (() => {
  const JOUR = 86400000;
  const d = s => new Date(`${s}T12:00:00Z`);
  const iso = x => x.toISOString().slice(0, 10);
  const ouvre = s => { const j = d(s).getUTCDay(); return j !== 0 && j !== 6; };
  const plus = (s, n) => iso(new Date(d(s).getTime() + n * JOUR));
  const prochainOuvre = s => { let x = s; while (!ouvre(x)) x = plus(x, 1); return x; };
  // n-ième jour ouvré après s (n = 0 : s lui-même s'il est ouvré, sinon le suivant)
  function ajouterOuvres(s, n) {
    let x = prochainOuvre(s);
    for (let k = 0; k < n; k++) x = prochainOuvre(plus(x, 1));
    return x;
  }
  function ouvresEntre(a, b) { // jours ouvrés de a à b inclus
    if (b < a) return 0;
    let n = 0;
    for (let x = a; x <= b; x = plus(x, 1)) if (ouvre(x)) n++;
    return n;
  }
  const lundi = s => { const j = d(s).getUTCDay(); return plus(s, j === 0 ? -6 : 1 - j); };
  function semaineIso(s) {
    const t = d(s); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const an = t.getUTCFullYear(), n = Math.ceil(((t - Date.UTC(an, 0, 1)) / JOUR + 1) / 7);
    return `${an}-W${String(n).padStart(2, '0')}`;
  }
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

  // Phases types d'un chantier de tuyauterie, heures du budget réparties ; une équipe de 2 à 7 h par jour
  const MODELE = [
    { libelle: 'Préparation et approvisionnements', tache: 'Études', part: 0.05, joursMin: 10 },
    { libelle: 'Préfabrication atelier', tache: 'Préfabrication', part: 0.35 },
    { libelle: 'Montage sur site', tache: 'Montage', part: 0.45 },
    { libelle: 'Contrôles et essais', tache: 'Contrôles / essais', part: 0.1 },
    { libelle: 'Réception et DOE', tache: '', part: 0.05, joursMin: 2 },
  ];
  function phasesTypes(heures, debut, uid = () => Math.random().toString(36).slice(2, 10), parJour = 14) {
    let prec = null;
    return MODELE.map((m, i) => {
      const h = Math.round(num(heures) * m.part);
      const p = { id: uid(), libelle: m.libelle, tache: m.tache, duree: Math.max(m.joursMin || 1, Math.ceil(h / parJour) || 1), heures: h, apres: prec ? [prec] : [], decalage: 0, termine: false, ...(i === 0 && debut ? { debut } : {}) };
      prec = p.id;
      return p;
    });
  }

  // Affectations (planning) et heures pointées d'un chantier, rattachées à la phase de même tâche (ou de même libellé)
  function rattacher(phases, items) {
    const parPhase = new Map(phases.map(p => [p.id, []])), libres = [];
    for (const it of items) {
      const t = norm(it.tache);
      const p = t && (phases.find(x => x.tache && norm(x.tache) === t) || phases.find(x => norm(x.libelle) === t));
      if (p) parPhase.get(p.id).push(it); else libres.push(it);
    }
    return { parPhase, libres };
  }

  // Décalage d'une dépendance : celui de la dépendance, sinon le décalage commun de la phase
  const decalageDe = (p, id) => Math.max(0, Math.round(num(p.decalages && p.decalages[id] !== undefined && p.decalages[id] !== '' ? p.decalages[id] : p.decalage)));
  // a : chantier ; o : { planning, temps, aujourdhui, recaler (défaut : a.ganttRecaler !== false) }
  function calculer(a, o = {}) {
    const p1 = calculerPasse(a, o, null);
    // Ressources : une équipe ne fait qu'une phase à la fois (ordre : début au plus tôt sans ressources, puis la liste)
    const avecEquipe = (a.phases || []).some(p => p.equipeId);
    const r = avecEquipe ? calculerPasse(a, o, new Map(p1.phases.map((p, i) => [p.id, [p.auPlusTot, i]]))) : p1;
    critique(r, a);
    return r;
  }
  // Marge totale et chemin critique sur les dates calculées (dépendances et enchaînements d'équipe)
  function critique(r, a) {
    const L = r.phases, fin = r.fin, par = new Map(L.map(p => [p.id, p])), succ = new Map(L.map(p => [p.id, []]));
    L.forEach(p => {
      p.apres.forEach(id => { if (par.has(id) && id !== p.id) succ.get(id).push({ p, lag: decalageDe(p, id) }); });
      if (p.bloqueePar && par.has(p.bloqueePar)) succ.get(p.bloqueePar).push({ p, lag: 0, equipe: true });
    });
    const libres = (q, p, lag) => Math.max(0, (p.debut > q.fin ? ouvresEntre(plus(q.fin, 1), plus(p.debut, -1)) : 0) - lag);
    const ordre = L.slice().sort((x, y) => (y.debut > x.debut ? 1 : y.debut < x.debut ? -1 : 0));
    const marge = new Map();
    const m = q => {
      if (marge.has(q.id)) return marge.get(q.id);
      marge.set(q.id, Infinity);
      const s = succ.get(q.id);
      const v = s.length ? Math.min(...s.map(x => libres(q, x.p, x.lag) + m(x.p))) : (fin > q.fin ? ouvresEntre(plus(q.fin, 1), fin) : 0);
      marge.set(q.id, v); return v;
    };
    ordre.forEach(m);
    L.forEach(p => { const v = marge.get(p.id); p.marge = Number.isFinite(v) ? v : 0; p.critique = !p.termine && p.marge <= 0; });
    r.critique = L.filter(p => p.critique).sort((x, y) => (x.debut < y.debut ? -1 : x.debut > y.debut ? 1 : 0)).map(p => p.id);
    // Liens à dessiner : toutes les dépendances (fin → début) et l'enchaînement imposé par l'équipe
    r.liens = L.flatMap(p => [...p.apres.filter(id => par.has(id) && id !== p.id).map(id => ({ de: id, vers: p.id, decalage: decalageDe(p, id), critique: par.get(id).critique && p.critique && libres(par.get(id), p, decalageDe(p, id)) === 0 })),
      ...(p.bloqueePar && par.has(p.bloqueePar) && !p.apres.includes(p.bloqueePar) ? [{ de: p.bloqueePar, vers: p.id, decalage: 0, equipe: true, critique: par.get(p.bloqueePar).critique && p.critique && libres(par.get(p.bloqueePar), p, 0) === 0 }] : [])]);
    const eqs = new Map(((a && a.equipes) || []).map(e => [e.id, e]));
    L.forEach(p => { if (p.equipeId) p.equipeNom = (eqs.get(p.equipeId) || {}).nom || p.equipeId; });
  }
  // Une passe de calcul ; prio : Map(id → [début au plus tôt, rang]) pour placer les phases d'équipe (sinon : pas de ressources)
  function calculerPasse(a, o, prio) {
    const aujourdhui = o.aujourdhui || iso(new Date());
    const recaler = o.recaler ?? a.ganttRecaler !== false;
    const phases = (a.phases || []).map(p => ({ ...p, duree: Math.max(1, Math.round(num(p.duree)) || 1), heures: num(p.heures), decalage: Math.round(num(p.decalage)), apres: (p.apres || []).filter(Boolean) }));
    const plan = (o.planning || []).filter(p => p.affaireId === a.id && p.date && !p.absence);
    const temps = (o.temps || []).filter(t => t.affaireId === a.id && t.date);
    const rp = rattacher(phases, plan), rt = rattacher(phases, temps);
    const ids = new Set(phases.map(p => p.id));
    // Début du chantier sans date : premier jour au planning, sinon aujourd'hui
    const premierPlan = [...plan, ...temps].map(x => x.date).sort()[0];
    const departDefaut = prochainOuvre(premierPlan && premierPlan < aujourdhui ? premierPlan : aujourdhui);
    const res = new Map(), enCalcul = new Set(), alertes = [], occupe = new Map();
    function calc(p) {
      if (res.has(p.id)) return res.get(p.id);
      if (enCalcul.has(p.id)) { alertes.push(`Boucle de dépendances autour de « ${p.libelle} »`); return null; }
      enCalcul.add(p.id);
      let auPlusTot = prochainOuvre(p.debut || departDefaut), contrainte = '';
      for (const id of p.apres) {
        if (!ids.has(id) || id === p.id) continue;
        const q = calc(phases.find(x => x.id === id));
        if (!q) continue;
        const apres = ajouterOuvres(plus(q.fin, 1), decalageDe(p, id));
        if (apres > auPlusTot) { auPlusTot = apres; contrainte = q.libelle; }
      }
      // Phase terminée : seuls les jours passés comptent (une affectation future sur la même tâche ne la rouvre pas)
      const jours = [...new Set([...rp.parPhase.get(p.id), ...rt.parPhase.get(p.id)].map(x => x.date))].filter(x => !p.termine || x <= aujourdhui).sort();
      const pointees = rt.parPhase.get(p.id).reduce((s, t) => s + num(t.heures), 0);
      const planifieesAVenir = rp.parPhase.get(p.id).filter(x => x.date >= aujourdhui).reduce((s, x) => s + num(x.heuresPrevues), 0);
      let debut = auPlusTot, fin, etat, glissement = 0, source = 'prévision', bloqueePar = '';
      if (recaler && jours.length) {
        source = 'planning';
        debut = jours[0];
        fin = jours[jours.length - 1];
        // Une phase non terminée garde au moins sa durée prévue, à partir de son premier jour planifié
        if (!p.termine) { const finTheo = ajouterOuvres(debut, p.duree - 1); if (finTheo > fin) fin = finTheo; }
      } else {
        if (!p.termine && recaler && debut < aujourdhui) { glissement = ouvresEntre(debut, aujourdhui) - 1; debut = prochainOuvre(aujourdhui); }
        // Équipe déjà occupée : premier créneau libre de la durée de la phase
        if (prio && p.equipeId && !p.termine) {
          for (let k = 0; k < 500; k++) {
            const f = ajouterOuvres(debut, p.duree - 1), gene = (occupe.get(p.equipeId) || []).filter(x => x.debut <= f && x.fin >= debut).sort((x, y) => (x.fin > y.fin ? -1 : 1))[0];
            if (!gene) break;
            debut = prochainOuvre(plus(gene.fin, 1)); bloqueePar = gene.id;
          }
          if (bloqueePar) contrainte = `${(res.get(bloqueePar) || {}).libelle || ''} (même équipe)`;
        }
        fin = ajouterOuvres(debut, p.duree - 1);
      }
      if (prio && p.equipeId) {
        if (!occupe.has(p.equipeId)) occupe.set(p.equipeId, []);
        // Phase calée sur le planning (ou terminée) : ses dates sont des faits ; un chevauchement d'équipe est signalé
        const gene = !p.termine && occupe.get(p.equipeId).find(x => x.debut <= fin && x.fin >= debut);
        if (gene) { const nomEq = ((a.equipes || []).find(e => e.id === p.equipeId) || {}).nom || p.equipeId; alertes.push(`${nomEq} : « ${(res.get(gene.id) || {}).libelle || ''} » et « ${p.libelle} » en même temps (dates du planning des équipes)`); }
        occupe.get(p.equipeId).push({ id: p.id, debut, fin });
      }
      if (p.termine) etat = 'terminée';
      else if (fin < aujourdhui) etat = 'en retard';
      else if (debut <= aujourdhui) etat = 'en cours';
      else etat = 'à venir';
      const r = { ...p, debut, fin, auPlusTot, contrainte, etat, glissement, source, jours, pointees, planifieesAVenir, bloqueePar,
        reste: p.termine ? 0 : Math.max(0, p.heures - pointees), avancement: p.termine ? 1 : p.heures ? Math.min(1, pointees / p.heures) : 0 };
      enCalcul.delete(p.id);
      res.set(p.id, r);
      return r;
    }
    // Ordre de placement : sans ressources, celui de la liste ; avec, le début au plus tôt de la première passe
    (prio ? phases.slice().sort((x, y) => { const a1 = prio.get(x.id) || ['', 0], b1 = prio.get(y.id) || ['', 0]; return a1[0] < b1[0] ? -1 : a1[0] > b1[0] ? 1 : a1[1] - b1[1]; }) : phases).forEach(calc);
    const liste = phases.map(p => res.get(p.id)).filter(Boolean);
    const libres = [...new Set([...rp.libres, ...rt.libres].map(x => x.date))].sort();
    const bornes = [...liste.flatMap(p => [p.debut, p.fin]), ...libres].sort();
    return { phases: liste, debut: bornes[0] || '', fin: bornes[bornes.length - 1] || '', joursHorsPhase: libres, alertes,
      retard: liste.reduce((m, p) => Math.max(m, p.glissement), 0) };
  }

  // Heures restantes de chaque phase réparties sur ses jours ouvrés à venir → { 'AAAA-Www': heures }
  function chargeParSemaine(phasesCalc, aujourdhui = iso(new Date())) {
    const out = {};
    for (const p of phasesCalc) {
      if (!p.reste) continue;
      const depart = p.debut > aujourdhui ? p.debut : prochainOuvre(aujourdhui);
      const fin = p.fin < depart ? depart : p.fin;
      const n = ouvresEntre(depart, fin) || 1;
      for (let x = depart; x <= fin; x = plus(x, 1)) if (ouvre(x)) { const s = semaineIso(x); out[s] = (out[s] || 0) + p.reste / n; }
    }
    return out;
  }

  // Phase déplacée à la souris (dj jours calendaires) : nouvelle date « au plus tôt », en jours ouvrés
  const deplacer = (debutActuel, dj) => prochainOuvre(plus(debutActuel, dj));

  return { calculer, decalageDe, chargeParSemaine, phasesTypes, ajouterOuvres, ouvresEntre, prochainOuvre, ouvre, plus, lundi, semaineIso, deplacer, MODELE };
})();
if (typeof module !== 'undefined') module.exports = GanttCalc;
