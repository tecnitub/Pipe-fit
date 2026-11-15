// Gantt : par chantier (onglet du chantier, phases modifiables et déplaçables à la souris) et global (onglet du
// Planning, par chantier ou par chargé d'affaires), avec le plan de charge à venir face à la capacité des équipes.
// Calcul des dates et de la charge : gantt-calc.js (phases enchaînées, recalées sur le planning des équipes).
const ganttDe = a => GanttCalc.calculer(a, { planning: Store.all('planning'), temps: Store.all('temps'), aujourdhui: isoDate(new Date()) });
const ETATS_PHASE = { 'à venir': '', 'en cours': 'b-info', 'en retard': 'b-bad', terminée: 'b-ok' };
const dateCourte = s => (s ? jourDe(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');
const TACHES_PLANNING = () => [...new Set([...Object.keys(ICONES_TACHE), ...Store.all('planning').map(p => p.tache).filter(Boolean)])];

// Capacité des compagnons sur une semaine (heures), absences du planning déduites
function capaciteSemaine(sem) {
  const [an, w] = sem.split('-W').map(Number), j4 = new Date(Date.UTC(an, 0, 4));
  const debut = new Date(j4.getTime() + ((1 - (j4.getUTCDay() || 7)) + (w - 1) * 7) * 86400000).toISOString().slice(0, 10);
  const jours = Array.from({ length: 5 }, (_, i) => GanttCalc.plus(debut, i));
  return sumBy(personnesPlanning(), u => capacite(u) * (1 - jours.filter(d => absenceJour(u.id, d)).length / 5));
}

/* ---------- Planning relié à l'étude (heures du métré, matériel à recevoir avant chaque tâche) ---------- */
// Études du bureau d'études reliées au chantier, avec les heures de main-d'œuvre du métré par lot
const etudesPlanning = a => (typeof liensChantier !== 'undefined' ? liensChantier.get(a.id) || [] : [])
  .filter(l => l.app === 'etudes' && ((l.resume || {}).heures || []).length).map(l => ({ etudeId: l.id, objet: (l.resume || {}).objet || 'Étude', lots: l.resume.heures }));
const materielGanttLu = new Set();
function materielGantt(a) {
  if (typeof materielChantier === 'undefined') return null;
  if (!materielGanttLu.has(a.id)) {
    materielGanttLu.add(a.id);
    api('GET', `/api/liens/materiel?affaireId=${encodeURIComponent(a.id)}`).then(ms => { if (Array.isArray(ms)) { materielChantier.set(a.id, ms); if (location.hash.includes(a.id)) App.render(); } }).catch(() => {});
  }
  return materielChantier.get(a.id) || null;
}
// Approvisionnement : pour chaque tâche, matériel reçu / commandé / à commander, alerte si la tâche démarre avant la réception
function approGanttHtml(a, phases) {
  if (!phases.some(p => (p.materiel || []).length)) return '';
  const ms = materielGantt(a);
  if (!ms) return '<h2>Approvisionnement des tâches</h2><p class="small muted">Matériel de l\'étude : lecture…</p>';
  const r = PlanningEtude.alertes(phases, ms, { aujourdhui: isoDate(new Date()), etatAchat: MaterielRetenu.etatAchat });
  const avec = phases.filter(p => (p.materiel || []).length);
  return `<h2>Approvisionnement des tâches <span class="muted small">matériel retenu à avoir reçu avant de commencer</span></h2>
    ${r.alertes.length ? `<ul class="gt-appro">${r.alertes.map(x => `<li class="${x.niveau === 'erreur' ? 'neg' : 'warn-text'}">${x.niveau === 'erreur' ? '⛔' : '⚠️'} ${esc(x.texte)}</li>`).join('')}</ul>` : '<p class="small pos">✓ Aucune tâche ne commence avant la réception prévue de son matériel.</p>'}
    <div class="table-wrap"><table class="compact"><tr><th>Tâche</th><th>Début</th><th class="num">Équipements</th><th class="num">Reçus</th><th class="num">Commandés</th><th class="num">À commander</th></tr>
      ${avec.map(p => { const b = r.bilan[p.id] || {}; return `<tr><td>${esc(p.libelle)}</td><td>${dateFr(p.debut)}</td><td class="num">${b.total}${b.inconnus ? ` <span class="muted small">(+${b.inconnus} sans référence choisie)</span>` : ''}</td><td class="num">${b.recus}</td><td class="num">${b.commandes}</td><td class="num ${b.retards ? 'neg' : ''}">${b.aCommander}</td></tr>`; }).join('')}</table></div>`;
}
function dialoguePhasesEtude(a, save, uid) {
  const es = etudesPlanning(a), premier = Store.all('planning').filter(p => p.affaireId === a.id && p.date).map(p => p.date).sort()[0];
  const box = Modal.open(`<h2 style="margin-top:0">Planning depuis l'étude</h2>
    <p class="small muted">Heures de main-d'œuvre du métré (${es.map(e => esc(e.objet)).join(', ')}) réparties en lots, durées selon l'effectif ; chaque tâche porte le matériel retenu à avoir reçu avant de commencer.</p>
    <div class="grid2"><div class="field"><label for="pe-neq">Nombre d'équipes</label><input id="pe-neq" type="number" min="1" max="9" step="1" value="${Math.max(1, (a.equipes || []).length || 1)}"></div>
      <div class="field"><label for="pe-eff">Effectif par équipe (compagnons)</label><input id="pe-eff" type="number" min="1" step="1" value="${((a.equipes || [])[0] || {}).effectif || 2}"></div>
      <div class="field"><label for="pe-hj">Heures par jour et par compagnon</label><input id="pe-hj" type="number" min="1" step="0.5" value="7"></div>
      <div class="field"><label for="pe-deb">Début de la préparation</label><input id="pe-deb" type="date" value="${esc(premier && premier > isoDate(new Date()) ? premier : GanttCalc.prochainOuvre(isoDate(new Date())))}"></div></div>
    <div id="pe-apercu"></div>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="pe-x">Annuler</button><button id="pe-ok">${(a.phases || []).length ? 'Remplacer les phases' : 'Créer les phases'}</button></div>`, true);
  const v = id => box.querySelector(id).value;
  // Équipes du chantier (noms gardés) et affectation des lots choisie dans l'aperçu
  const affectation = {};
  const equipes = () => { const n = Math.max(1, Math.min(9, Math.round(num(v('#pe-neq'))) || 1)), eff = Math.max(1, Math.round(num(v('#pe-eff'))) || 1);
    return Array.from({ length: n }, (_, i) => ({ id: `E${i + 1}`, nom: ((a.equipes || [])[i] || {}).nom || `Équipe ${i + 1}`, effectif: eff })); };
  const calc = () => PlanningEtude.proposer(es, { equipes: equipes(), affectation, heuresJour: num(v('#pe-hj')), debut: v('#pe-deb'), uid });
  const apercu = () => {
    const ph = calc(), eqs = equipes(), g = GanttCalc.calculer({ id: a.id, phases: ph, equipes: eqs, ganttRecaler: false }, { aujourdhui: isoDate(new Date()) }), dc = id => g.phases.find(q => q.id === id) || {};
    box.querySelector('#pe-apercu').innerHTML = ph.length ? `<div class="table-wrap"><table class="compact"><tr><th>Tâche</th><th class="num">Heures</th><th>Équipe</th><th class="num">Durée (j ouvrés)</th><th>Après</th><th>Dates</th><th class="num">Matériel</th></tr>
      ${ph.map(p => `<tr class="${dc(p.id).critique ? 'gt-crit-ligne' : ''}"><td>${esc(p.libelle)}${dc(p.id).critique ? ' <span class="badge b-bad" title="Chemin critique : sans marge">critique</span>' : ''}</td><td class="num">${fmt(p.heures)} h</td>
        <td>${p.equipeId ? `<select data-pe-lot="${esc(p.lot)}" style="min-width:140px" aria-label="Équipe de ${esc(p.libelle)}">${eqs.map(e => `<option value="${esc(e.id)}" ${e.id === p.equipeId ? 'selected' : ''}>${esc(e.nom)} (${e.effectif})</option>`).join('')}</select>` : '<span class="muted small">bureau</span>'}</td>
        <td class="num">${p.duree}</td><td class="small">${p.apres.map(id => esc((ph.find(q => q.id === id) || {}).libelle || '')).join(', ')}</td><td class="small nowrap">${dateCourte(dc(p.id).debut)} → ${dateCourte(dc(p.id).fin)}</td><td class="num">${p.materiel.length}</td></tr>`).join('')}</table></div>
      <p class="small muted">Fin prévue le ${dateFr(g.fin)} · une équipe ne fait qu'une tâche à la fois : ses tâches s'enchaînent dans l'ordre des dépendances.</p>` : '<p class="muted">Pas d\'heures de pose dans le métré de l\'étude.</p>';
    box.querySelectorAll('[data-pe-lot]').forEach(sel => { sel.onchange = () => { affectation[sel.dataset.peLot] = sel.value; apercu(); }; });
  };
  ['#pe-neq', '#pe-eff', '#pe-hj', '#pe-deb'].forEach(s2 => { box.querySelector(s2).oninput = apercu; });
  apercu();
  box.querySelector('#pe-x').onclick = Modal.close;
  box.querySelector('#pe-ok').onclick = async () => {
    const ph = calc();
    if (!ph.length) return;
    if ((a.phases || []).length && !await ask(`Remplacer les ${a.phases.length} phase(s) du chantier par les ${ph.length} tâches tirées de l'étude ?`, 'Remplacer')) return;
    a.phases = ph; a.equipes = equipes(); Modal.close(); save();
    App.toast(`${ph.length} tâches créées d'après le métré de l'étude`, 4000);
  };
}

/* ---------- Gantt d'un chantier ---------- */
function ganttChantier(a) {
  // Études reliées (heures du métré) lues en arrière-plan
  if (typeof chargerLiens === 'function' && typeof liensChantier !== 'undefined' && !liensChantier.has(a.id)) chargerLiens(a.id).then(l => { if ((l || []).length && location.hash.includes(a.id)) App.render(); });
  const g = ganttDe(a), edit = Store.can('write', 'affaires'), today = isoDate(new Date()), s = Calc.affaire(a);
  const phases = g.phases;
  const debut = GanttCalc.lundi(GanttCalc.plus([g.debut || today, today].sort()[0], -7));
  const fin = GanttCalc.plus([g.fin || today, today].sort().pop(), 14);
  const nbJours = Math.round((jourDe(fin) - jourDe(debut)) / 86400000) + 1, L = 26;
  const x = d => Math.round((jourDe(d) - jourDe(debut)) / 86400000) * L;
  const jours = Array.from({ length: nbJours }, (_, i) => GanttCalc.plus(debut, i));
  const semaines = jours.filter(d => jourDe(d).getDay() === 1);
  const resteTotal = sumBy(phases, p => p.reste), heuresPhases = sumBy(phases, p => p.heures);
  const rang = new Map(phases.map((p, i) => [p.id, i])), yL = i => 40 + i * 40 + 20;
  // Liens fin → début de toutes les dépendances (et enchaînements d'une même équipe, en pointillés)
  const liensSvg = () => {
    const ls = (g.liens || []).filter(l => rang.has(l.de) && rang.has(l.vers));
    if (!ls.length) return '';
    const H = 40 + phases.length * 40;
    return `<svg class="gt-liens" width="${nbJours * L}" height="${H}" viewBox="0 0 ${nbJours * L} ${H}" aria-hidden="true">
      <defs><marker id="gt-fl" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 Z" class="gt-fl"/></marker>
        <marker id="gt-fl-c" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 Z" class="gt-fl-c"/></marker></defs>
      ${ls.map(l => { const q = phases[rang.get(l.de)], p = phases[rang.get(l.vers)], x1 = x(q.fin) + L, y1 = yL(rang.get(l.de)), x2 = x(p.debut), y2 = yL(rang.get(l.vers));
        const d = x2 >= x1 + 8 ? `M${x1} ${y1} H${x1 + 4} V${y2} H${x2}` : `M${x1} ${y1} h4 V${y2 + (y2 > y1 ? -14 : 14)} H${x2 - 8} V${y2} H${x2}`;
        return `<path d="${d}" class="gt-lien${l.critique ? ' crit' : ''}${l.equipe ? ' equipe' : ''}" marker-end="url(#${l.critique ? 'gt-fl-c' : 'gt-fl'})" data-lien="${esc(l.de)}>${esc(l.vers)}"><title>${esc(q.libelle)} → ${esc(p.libelle)}${l.decalage ? ` (+${l.decalage} j)` : ''}${l.equipe ? ' · même équipe' : ''}</title></path>`; }).join('')}</svg>`;
  };
  const ligne = p => {
    const w = x(p.fin) - x(p.debut) + L;
    return `<div class="gt-ligne" data-ph="${esc(p.id)}">
      ${p.jours.map(d => (d >= debut && d <= fin ? `<i class="gt-jour" style="left:${x(d) + L / 2 - 3}px" title="Au planning le ${dateFr(d)}"></i>` : '')).join('')}
      <div class="gt-barre etat-${p.etat.replace(/\s/g, '-')} ${p.source === 'planning' ? 'planifiee' : ''} ${p.critique ? 'critique' : ''}" style="left:${x(p.debut)}px;width:${w}px;--h:${teinte(a.id)}" data-bar="${esc(p.id)}"
        title="${esc(p.libelle)} : ${dateFr(p.debut)} → ${dateFr(p.fin)} (${p.duree} j ouvrés)${p.equipeNom ? ` · ${esc(p.equipeNom)}` : ''}${p.contrainte ? ` · après « ${esc(p.contrainte)} »` : ''}${p.critique ? ' · chemin critique' : ` · marge ${p.marge} j`}${p.source === 'planning' ? ' · calée sur le planning' : ''}${p.glissement ? ` · décalée de ${p.glissement} j (pas commencée à la date prévue)` : ''}">
        <span class="gt-av" style="width:${Math.round(p.avancement * 100)}%"></span><span class="gt-txt">${esc(p.libelle)}</span>${edit ? '<span class="gt-poignee" data-resize="1"></span>' : ''}</div></div>`;
  };
  return `<div class="toolbar"><a href="#/chantiers" class="btn secondary">← Chantiers</a><span class="spacer"></span>
    ${edit ? `${etudesPlanning(a).length ? '<button id="gt-etude" title="Lots et durées d\'après les heures du métré de l\'étude, selon l\'effectif ; matériel à recevoir avant chaque tâche">📐 Planning depuis l\'étude</button>' : ''}${phases.length ? '' : '<button id="gt-types">Phases types (d\'après le budget d\'heures)</button>'}<button class="secondary" id="gt-add">+ Phase</button>` : ''}</div>
  <h1>${esc(affaireLabel(a))} ${badge(a.statut)}</h1>${chantierOnglets(a, 'gantt')}
  <div class="cards">
    <div class="card"><div class="label">Début → fin</div><div class="value">${g.debut ? `${dateCourte(g.debut)} → ${dateCourte(g.fin)}` : '—'}</div><div class="sub">${g.fin ? `${GanttCalc.ouvresEntre(g.debut, g.fin)} jours ouvrés` : 'Aucune phase'}</div></div>
    <div class="card"><div class="label">Heures des phases</div><div class="value">${fmt(heuresPhases)} h</div><div class="sub">budget du chantier ${fmt(s.heuresPrevues)} h${Math.abs(heuresPhases - s.heuresPrevues) > 1 && heuresPhases ? ` · <span class="warn-text">écart ${fmt(heuresPhases - s.heuresPrevues)} h</span>` : ''}</div></div>
    <div class="card"><div class="label">Reste à faire</div><div class="value">${fmt(resteTotal)} h</div><div class="sub">pointé ${fmt(s.heuresPassees, 1)} h</div></div>
    <div class="card"><div class="label">Chemin critique</div><div class="value">${(g.critique || []).length} phase(s)</div><div class="sub">${(a.equipes || []).length ? `${a.equipes.length} équipe(s) : ${a.equipes.map(e => `${esc(e.nom)} (${e.effectif})`).join(', ')}` : 'sans marge : un retard décale la fin'}</div></div>
    <div class="card"><div class="label">Décalage</div><div class="value ${g.retard ? 'neg' : ''}">${g.retard ? `${g.retard} j` : 'aucun'}</div><div class="sub">phases non commencées à la date prévue</div></div>
  </div>
  ${g.alertes.map(t => `<p class="warn-text">${esc(t)}</p>`).join('')}
  ${(() => { const r = phases.some(p => (p.materiel || []).length) && typeof materielChantier !== 'undefined' && materielChantier.get(a.id) ? PlanningEtude.alertes(phases, materielChantier.get(a.id), { aujourdhui: today, etatAchat: MaterielRetenu.etatAchat }).alertes.filter(x => x.niveau === 'erreur') : [];
    return r.length ? `<p class="neg">⛔ ${r.length} équipement(s) livré(s) après le début de leur tâche : voir « Approvisionnement des tâches ».</p>` : ''; })()}
  <label class="check no-print"><input type="checkbox" id="gt-recaler" ${a.ganttRecaler !== false ? 'checked' : ''} ${edit ? '' : 'disabled'}> Recaler sur le planning des équipes : une phase suit les jours où sa tâche est planifiée ou pointée, une phase pas commencée à temps glisse à aujourd'hui, et les phases suivantes se décalent</label>
  ${phases.length ? `<div class="gt-cadre"><div class="gt-noms"><div class="gt-tete">Phase</div>${phases.map(p => `<div class="gt-nom${p.critique ? ' critique' : ''}" title="${esc(p.libelle)}${p.critique ? ' (chemin critique)' : ''}"><strong>${esc(p.libelle)}</strong><span class="small muted">${dateCourte(p.debut)} → ${dateCourte(p.fin)}${p.equipeNom ? ` · ${esc(p.equipeNom)}` : ''} <span class="badge ${ETATS_PHASE[p.etat]}">${esc(p.etat)}</span></span></div>`).join('')}</div>
    <div class="gt-defile"><div class="gt-zone" style="width:${nbJours * L}px">
      <div class="gt-tete">${semaines.map(d => `<span class="gt-sem" style="left:${x(d)}px;width:${7 * L}px">S${isoWeek(jourDe(d)).split('-W')[1]} · ${dateCourte(d)}</span>`).join('')}
        ${jours.map(d => `<span class="gt-j ${GanttCalc.ouvre(d) ? '' : 'we'}" style="left:${x(d)}px;width:${L}px">${jourDe(d).getDate()}</span>`).join('')}</div>
      <div class="gt-fond">${jours.filter(d => !GanttCalc.ouvre(d)).map(d => `<i class="gt-we" style="left:${x(d)}px;width:${L}px"></i>`).join('')}<i class="gt-auj" style="left:${x(today) + L / 2}px" title="Aujourd'hui"></i></div>
      ${liensSvg()}${phases.map(ligne).join('')}
    </div></div></div>
    <p class="small muted no-print">● jour au planning des équipes ou pointé · barre pleine : calée sur le planning · partie foncée : heures pointées · <span class="gt-leg-crit">contour rouge : chemin critique</span> · flèches : dépendances fin → début (pointillés : même équipe)${edit ? ' · glissez une barre pour la déplacer, son bord droit pour changer sa durée' : ''}.</p>` : `<p class="muted">Pas encore de Gantt pour ce chantier.${edit ? ' « Phases types » crée la préparation, la préfabrication, le montage, les essais et la réception à partir du budget d\'heures, à ajuster ensuite.' : ''}</p>`}
  ${phases.length || (a.equipes || []).length ? `<h2>Équipes <span class="muted small">une équipe ne fait qu'une phase à la fois</span></h2>
    <div class="gt-equipes">${(a.equipes || []).map((e, k) => `<div class="gt-equipe" data-eq="${k}"><input data-eqk="nom" value="${esc(e.nom || '')}" aria-label="Nom de l'équipe" ${edit ? '' : 'disabled'}>
      <label class="small">Effectif <input data-eqk="effectif" type="number" min="1" step="1" value="${esc(e.effectif || 1)}" style="width:60px" ${edit ? '' : 'disabled'}></label>
      <span class="small muted">${phases.filter(p => p.equipeId === e.id).length} phase(s)</span>${edit ? `<button class="small danger" data-eqdel="${k}" aria-label="Supprimer l'équipe">✕</button>` : ''}</div>`).join('')}
      ${edit ? '<button class="small secondary" id="gt-eq-add">+ Équipe</button>' : ''}${(a.equipes || []).length ? '' : '<span class="small muted">Aucune équipe : les phases ne sont pas limitées par les ressources.</span>'}</div>` : ''}
  ${phases.length ? `<h2>Phases</h2><div class="table-wrap"><table class="gt-table"><tr><th>Phase</th><th>Tâche du planning</th><th>Équipe</th><th>Au plus tôt</th><th class="num">Durée (j)</th><th class="num">Heures</th><th>Après (fin → début, décalage en j ouvrés)</th><th class="num">Marge (j)</th><th>Terminée</th><th class="num">Pointé</th><th></th></tr>
    ${(a.phases || []).map((p, i) => { const c = phases.find(x => x.id === p.id) || {}; return `<tr data-i="${i}" class="${c.critique ? 'gt-crit-ligne' : ''}">
      <td><input data-k="libelle" value="${esc(p.libelle || '')}" ${edit ? '' : 'disabled'}></td>
      <td><input data-k="tache" list="gt-taches" value="${esc(p.tache || '')}" placeholder="—" ${edit ? '' : 'disabled'}></td>
      <td><select data-k="equipeId" ${edit ? '' : 'disabled'} aria-label="Équipe"><option value="">—</option>${(a.equipes || []).map(e => `<option value="${esc(e.id)}" ${p.equipeId === e.id ? 'selected' : ''}>${esc(e.nom)}</option>`).join('')}${p.equipeId && !(a.equipes || []).some(e => e.id === p.equipeId) ? `<option value="${esc(p.equipeId)}" selected>${esc(p.equipeId)}</option>` : ''}</select></td>
      <td><input data-k="debut" type="date" value="${esc(p.debut || '')}" ${edit ? '' : 'disabled'}></td>
      <td class="num"><input data-k="duree" type="number" min="1" step="1" value="${esc(p.duree || 1)}" style="width:70px" ${edit ? '' : 'disabled'}></td>
      <td class="num"><input data-k="heures" type="number" min="0" step="1" value="${esc(p.heures || 0)}" style="width:80px" ${edit ? '' : 'disabled'}></td>
      <td class="gt-deps">${(p.apres || []).filter(id => (a.phases || []).some(q => q.id === id)).map(id => `<span class="gt-dep" data-dep="${esc(id)}">${esc(((a.phases || []).find(q => q.id === id) || {}).libelle || '')}
        <input data-dep-lag="${esc(id)}" type="number" min="0" step="1" value="${GanttCalc.decalageDe(p, id)}" aria-label="Décalage après ${esc(((a.phases || []).find(q => q.id === id) || {}).libelle || '')}" ${edit ? '' : 'disabled'}> j${edit ? `<button class="small secondary" data-dep-del="${esc(id)}" aria-label="Retirer la dépendance">✕</button>` : ''}</span>`).join('')}
        ${edit ? `<select data-dep-add aria-label="Ajouter une dépendance"><option value="">+ après…</option>${(a.phases || []).filter(q => q.id !== p.id && !(p.apres || []).includes(q.id)).map(q => `<option value="${esc(q.id)}">${esc(q.libelle)}</option>`).join('')}</select>` : ''}</td>
      <td class="num ${c.critique ? 'neg' : ''}">${c.critique ? '0 · critique' : c.marge ?? ''}</td>
      <td><input data-k="termine" type="checkbox" ${p.termine ? 'checked' : ''} ${edit ? '' : 'disabled'}></td>
      <td class="num">${fmt(c.pointees || 0, 1)} h</td>
      <td class="nowrap">${edit ? `<button class="small secondary" data-haut="${i}" ${i ? '' : 'disabled'} aria-label="Monter">↑</button><button class="small danger" data-del="${i}" aria-label="Supprimer">✕</button>` : ''}</td></tr>`; }).join('')}
    </table></div><datalist id="gt-taches">${TACHES_PLANNING().map(t => `<option value="${esc(t)}">`).join('')}</datalist>
    <p class="small muted">« Tâche du planning » relie la phase aux affectations des équipes (Planning) et aux heures pointées sur cette tâche. « Au plus tôt » vide : la phase démarre après ses dépendances (toutes, fin → début, plus leur décalage) et quand son équipe est libre. Marge : jours ouvrés de retard possibles sans décaler la fin du chantier.</p>` : ''}
  ${approGanttHtml(a, phases)}`;
}

function bindGanttChantier(root, a) {
  const edit = Store.can('write', 'affaires');
  // Frise ouverte sur la semaine en cours (une semaine d'historique visible à gauche)
  const defile = root.querySelector('.gt-defile'), auj = root.querySelector('.gt-auj');
  if (defile && auj) defile.scrollLeft = Math.max(0, auj.offsetLeft - 7 * 26 - 13);
  const save = () => { Store.upsert('affaires', a); App.render(); };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const on = (s, fn) => { const el = root.querySelector(s); if (el) el.onclick = fn; };
  if (!edit) return;
  on('#gt-types', () => {
    const s = Calc.affaire(a), premier = Store.all('planning').filter(p => p.affaireId === a.id && p.date).map(p => p.date).sort()[0];
    a.phases = GanttCalc.phasesTypes(s.heuresPrevues || 0, premier || GanttCalc.prochainOuvre(isoDate(new Date())), uid);
    save();
  });
  on('#gt-etude', () => dialoguePhasesEtude(a, save, uid));
  on('#gt-add', () => {
    const der = (a.phases || []).slice(-1)[0];
    a.phases = [...(a.phases || []), { id: uid(), libelle: 'Nouvelle phase', tache: '', duree: 5, heures: 0, apres: der ? [der.id] : [], decalage: 0, termine: false, ...(der ? {} : { debut: GanttCalc.prochainOuvre(isoDate(new Date())) }) }];
    save();
  });
  const rec = root.querySelector('#gt-recaler');
  if (rec) rec.onchange = () => { a.ganttRecaler = rec.checked; save(); };
  // Équipes du chantier : nom, effectif, ajout, suppression (ses phases ne sont plus affectées)
  on('#gt-eq-add', () => { const eqs = a.equipes || []; let k = eqs.length + 1; while (eqs.some(e => e.id === `E${k}`)) k++; a.equipes = [...eqs, { id: `E${k}`, nom: `Équipe ${eqs.length + 1}`, effectif: 2 }]; save(); });
  root.querySelectorAll('.gt-equipe [data-eqk]').forEach(el => el.onchange = () => { const e = a.equipes[+el.closest('[data-eq]').dataset.eq]; e[el.dataset.eqk] = el.dataset.eqk === 'effectif' ? Math.max(1, Math.round(num(el.value)) || 1) : el.value; save(); });
  root.querySelectorAll('[data-eqdel]').forEach(b => b.onclick = async () => {
    const e = a.equipes[+b.dataset.eqdel];
    if (!await ask(`Supprimer « ${e.nom} » ? Ses phases ne seront plus affectées à une équipe.`, 'Supprimer')) return;
    a.equipes = a.equipes.filter(x => x !== e); (a.phases || []).forEach(p => { if (p.equipeId === e.id) delete p.equipeId; }); save();
  });
  // Dépendances multiples : ajout, retrait, décalage propre à chaque dépendance
  root.querySelectorAll('.gt-table tr[data-i] [data-dep-add]').forEach(el => el.onchange = () => { const p = a.phases[+el.closest('tr').dataset.i]; if (!el.value) return; p.apres = [...new Set([...(p.apres || []), el.value])]; save(); });
  root.querySelectorAll('.gt-table tr[data-i] [data-dep-del]').forEach(el => el.onclick = () => {
    const p = a.phases[+el.closest('tr').dataset.i], id = el.dataset.depDel;
    p.apres = (p.apres || []).filter(x => x !== id); if (p.decalages) delete p.decalages[id]; save();
  });
  root.querySelectorAll('.gt-table tr[data-i] [data-dep-lag]').forEach(el => el.onchange = () => { const p = a.phases[+el.closest('tr').dataset.i]; p.decalages = { ...(p.decalages || {}), [el.dataset.depLag]: Math.max(0, Math.round(num(el.value))) }; save(); });
  root.querySelectorAll('.gt-table tr[data-i] [data-k]').forEach(el => el.onchange = () => {
    const p = a.phases[+el.closest('tr').dataset.i], k = el.dataset.k;
    if (k === 'termine') p.termine = el.checked;
    else if (k === 'apres') p.apres = el.value ? [el.value] : [];
    else if (k === 'equipeId') { if (el.value) p.equipeId = el.value; else delete p.equipeId; }
    else if (['duree', 'heures', 'decalage'].includes(k)) p[k] = k === 'duree' ? Math.max(1, Math.round(num(el.value))) : num(el.value);
    else p[k] = el.value;
    save();
  });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const i = +b.dataset.del, p = a.phases[i];
    if (!await ask(`Supprimer la phase « ${p.libelle} » ?`, 'Supprimer')) return;
    a.phases.splice(i, 1);
    a.phases.forEach(q => { q.apres = [...new Set((q.apres || []).flatMap(id => (id === p.id ? p.apres || [] : [id])))]; if (q.decalages) delete q.decalages[p.id]; });
    save();
  });
  root.querySelectorAll('[data-haut]').forEach(b => b.onclick = () => { const i = +b.dataset.haut; [a.phases[i - 1], a.phases[i]] = [a.phases[i], a.phases[i - 1]]; save(); });
  // Glisser une barre : nouvelle date au plus tôt ; glisser son bord droit : nouvelle durée (jours ouvrés)
  const L = 26;
  root.querySelectorAll('.gt-barre[data-bar]').forEach(bar => {
    bar.addEventListener('pointerdown', e => {
      e.preventDefault();
      const redim = !!e.target.dataset.resize, x0 = e.clientX, left0 = bar.offsetLeft, w0 = bar.offsetWidth;
      bar.setPointerCapture(e.pointerId); bar.classList.add('glisse');
      const bouge = ev => { const dx = Math.round((ev.clientX - x0) / L) * L; if (redim) bar.style.width = `${Math.max(L, w0 + dx)}px`; else bar.style.left = `${left0 + dx}px`; };
      const fin = ev => {
        bar.removeEventListener('pointermove', bouge); bar.classList.remove('glisse');
        const dj = Math.round((ev.clientX - x0) / L);
        if (!dj) return;
        const p = a.phases.find(q => q.id === bar.dataset.bar), c = ganttDe(a).phases.find(q => q.id === p.id);
        if (redim) {
          const nf = GanttCalc.plus(c.fin, dj);
          p.duree = Math.max(1, GanttCalc.ouvresEntre(c.debut, nf < c.debut ? c.debut : nf));
        } else {
          p.debut = GanttCalc.deplacer(c.debut, dj);
          if (c.source === 'planning') App.toast('Phase calée sur le planning : ses dates suivent les affectations des équipes (décochez « Recaler » pour la déplacer librement).', 6000);
          else if (p.debut < c.auPlusTot) App.toast(`Elle ne peut pas commencer avant la fin de « ${c.contrainte} ».`, 5000);
        }
        save();
      };
      bar.addEventListener('pointermove', bouge);
      bar.addEventListener('pointerup', fin, { once: true });
    });
  });
}

/* ---------- Gantt global et plan de charge (Planning) ---------- */
function planningGantt(query) {
  const vue = query.get('vue') || 'chantiers', filtreCharge = query.get('charge') || '', o = +(query.get('o') || 0), h = +(query.get('h') || 16);
  const today = isoDate(new Date()), debut = GanttCalc.plus(GanttCalc.lundi(today), (o - 1) * 7), nbJours = h * 7, fin = GanttCalc.plus(debut, nbJours - 1);
  const pc = d => Math.max(0, Math.min(100, (jourDe(d) - jourDe(debut)) / 86400000 / nbJours * 100));
  const semaines = Array.from({ length: h }, (_, i) => GanttCalc.plus(debut, i * 7));
  const chantiers = chantiersActifs().filter(a => !filtreCharge || a.chargeId === filtreCharge).map(a => ({ a, g: ganttDe(a) }))
    .sort((x, y) => (x.g.debut || '9999').localeCompare(y.g.debut || '9999'));
  const charges = [...new Set(chantiersActifs().map(a => a.chargeId).filter(Boolean))];
  // Plan de charge : heures restantes des phases, affectations déjà au planning, capacité des équipes
  const parSemaine = {}, parChargeSem = {};
  chantiers.forEach(({ a, g }) => Object.entries(GanttCalc.chargeParSemaine(g.phases, today)).forEach(([s, v]) => {
    parSemaine[s] = (parSemaine[s] || 0) + v;
    const k = a.chargeId || ''; (parChargeSem[k] = parChargeSem[k] || {})[s] = (parChargeSem[k][s] || 0) + v;
  }));
  const ids = new Set(chantiers.map(c => c.a.id));
  const affecte = {};
  Store.all('planning').filter(p => p.date && p.date >= today && ids.has(p.affaireId) && !p.absence).forEach(p => { const s = GanttCalc.semaineIso(p.date); affecte[s] = (affecte[s] || 0) + num(p.heuresPrevues); });
  const sem = semaines.map(d => { const s = GanttCalc.semaineIso(d); return { d, s, charge: parSemaine[s] || 0, affecte: affecte[s] || 0, cap: capaciteSemaine(s) }; });
  const max = Math.max(1, ...sem.map(x => Math.max(x.charge, x.affecte, x.cap)));
  const sansGantt = chantiers.filter(c => !c.g.phases.length);
  const rangee = ({ a, g }) => {
    // Phases qui se chevauchent : chacune sur sa propre ligne (la première ligne libre)
    const voies = [], visibles = g.phases.filter(p => p.fin >= debut && p.debut <= fin).sort((x, y) => x.debut.localeCompare(y.debut));
    const voie = p => { let i = voies.findIndex(f => f < p.debut); if (i < 0) { i = voies.length; voies.push(''); } voies[i] = p.fin; return i; };
    const barres = g.phases.length ? visibles.map(p => `<span class="gg-ph etat-${p.etat.replace(/\s/g, '-')}" style="left:${pc(p.debut)}%;width:${Math.max(0.6, pc(GanttCalc.plus(p.fin, 1)) - pc(p.debut))}%;top:${6 + voie(p) * 13}px;--h:${teinte(a.id)}" title="${esc(p.libelle)} : ${dateFr(p.debut)} → ${dateFr(p.fin)} · ${fmt(p.reste)} h restantes${p.glissement ? ` · décalée de ${p.glissement} j` : ''}"></span>`).join('')
      : g.joursHorsPhase.filter(d => d >= debut && d <= fin).map(d => `<span class="gg-jour" style="left:${pc(d)}%;--h:${teinte(a.id)}" title="Au planning le ${dateFr(d)}"></span>`).join('');
    return `<div class="gg-rang" data-go="#/chantier/${a.id}/gantt"><div class="gg-nom"><strong>${esc(a.code || '')}</strong> <span class="small">${esc(a.nom || '')}</span><br><span class="small muted">${esc(userName(a.chargeId) || '—')}${g.debut ? ` · ${dateCourte(g.debut)} → ${dateCourte(g.fin)}` : ''}${g.retard ? ` · <span class="neg">+${g.retard} j</span>` : ''}${g.phases.length ? '' : ' · <span class="warn-text">sans Gantt</span>'}</span></div>
      <div class="gg-piste" style="min-height:${Math.max(38, 12 + voies.length * 13)}px">${barres}</div></div>`;
  };
  const groupes = vue === 'charges' ? [...new Set(chantiers.map(c => c.a.chargeId || ''))].map(k => ({ k, liste: chantiers.filter(c => (c.a.chargeId || '') === k) })) : [{ k: null, liste: chantiers }];
  const entete = `<div class="gg-rang gg-tete"><div class="gg-nom small muted">${chantiers.length} chantier(s)</div><div class="gg-piste">${semaines.map(d => `<span class="gg-sem" style="left:${pc(d)}%;width:${100 / h}%">S${GanttCalc.semaineIso(d).split('-W')[1]}<br><span class="muted">${dateCourte(d)}</span></span>`).join('')}<i class="gg-auj" style="left:${pc(today)}%"></i></div></div>`;
  const lien = p => `#/planning/gantt?${new URLSearchParams({ vue, ...(filtreCharge ? { charge: filtreCharge } : {}), o: String(o), h: String(h), ...p })}`;
  return `<h1>Planning</h1>${planningTabs('gantt')}
  <div class="toolbar">
    <span class="seg" role="group" aria-label="Regrouper">${[['chantiers', 'Par chantier'], ['charges', 'Par chargé d\'affaires']].map(([k, l]) => `<a class="btn small ${vue === k ? '' : 'secondary'}" href="${lien({ vue: k })}">${l}</a>`).join('')}</span>
    <select id="gg-charge" style="width:auto" aria-label="Chargé d'affaires"><option value="">Tous les chargés d'affaires</option>${charges.map(id => `<option value="${esc(id)}" ${id === filtreCharge ? 'selected' : ''}>${esc(userName(id))}</option>`).join('')}</select>
    <select id="gg-h" style="width:auto" aria-label="Horizon">${[8, 16, 26, 52].map(n => `<option value="${n}" ${n === h ? 'selected' : ''}>${n} semaines</option>`).join('')}</select>
    <span class="spacer"></span>
    <a class="btn secondary" href="${lien({ o: String(o - 4) })}">◀ 4 sem.</a><a class="btn secondary" href="${lien({ o: '0' })}">Aujourd'hui</a><a class="btn secondary" href="${lien({ o: String(o + 4) })}">4 sem. ▶</a>
  </div>
  <div class="gg-cadre">${entete}${groupes.map(gr => `${gr.k !== null ? `<div class="gg-groupe"><strong>${esc(userName(gr.k) || 'Sans chargé d\'affaires')}</strong> <span class="small muted">${gr.liste.length} chantier(s) · ${fmt(sumBy(Object.values(parChargeSem[gr.k] || {}), v => v))} h à venir</span></div>` : ''}${gr.liste.map(rangee).join('')}`).join('') || '<p class="muted">Aucun chantier actif.</p>'}</div>
  <p class="small muted">Cliquez sur un chantier pour ouvrir son Gantt. Barres : phases (foncé : en cours, rouge : en retard) ; points : jours au planning d'un chantier sans Gantt.${sansGantt.length ? ` <span class="warn-text">${sansGantt.length} chantier(s) sans Gantt : leur charge à venir n'est comptée que par le planning.</span>` : ''}</p>

  <h2>Plan de charge à venir${filtreCharge ? ` · ${esc(userName(filtreCharge))}` : ''}</h2>
  <div class="pc-graphe" role="img" aria-label="Heures à faire par semaine face à la capacité des équipes">
    ${sem.map(x => `<div class="pc-col" title="S${x.s.split('-W')[1]} : ${fmt(x.charge)} h à faire (Gantt), ${fmt(x.affecte)} h déjà affectées, capacité ${fmt(x.cap)} h">
      <div class="pc-barres"><span class="pc-b pc-gantt ${x.charge > x.cap + 0.5 ? 'pc-sur' : ''}" style="height:${x.charge / max * 100}%"></span><span class="pc-b pc-affecte" style="height:${x.affecte / max * 100}%"></span><i class="pc-cap" style="bottom:${x.cap / max * 100}%"></i></div>
      <span class="pc-lib">S${x.s.split('-W')[1]}</span></div>`).join('')}
  </div>
  <p class="small"><span class="pc-leg pc-gantt"></span> à faire selon les Gantt <span class="pc-leg pc-sur"></span> au-delà de la capacité <span class="pc-leg pc-affecte"></span> déjà affecté au planning <span class="pc-leg-cap"></span> capacité des compagnons (absences déduites)</p>
  <div class="table-wrap"><table><tr><th>Semaine</th>${sem.map(x => `<th class="num ${x.s === GanttCalc.semaineIso(today) ? 'today' : ''}">S${x.s.split('-W')[1]}</th>`).join('')}</tr>
    <tr><td>À faire (Gantt)</td>${sem.map(x => `<td class="num">${fmt(x.charge)}</td>`).join('')}</tr>
    <tr><td>Déjà affecté</td>${sem.map(x => `<td class="num">${fmt(x.affecte)}</td>`).join('')}</tr>
    <tr><td>Capacité</td>${sem.map(x => `<td class="num">${fmt(x.cap)}</td>`).join('')}</tr>
    <tr><td><strong>Charge</strong></td>${sem.map(x => { const t = x.cap ? x.charge / x.cap : 0; return `<td class="num"><span class="badge ${t > 1 ? 'load-over' : t > 0.85 ? 'load-high' : t ? 'load-ok' : ''}">${x.cap ? fmt(t * 100) : '—'} %</span></td>`; }).join('')}</tr>
    ${vue === 'charges' && !filtreCharge ? Object.keys(parChargeSem).map(k => `<tr><td class="small">${esc(userName(k) || 'Sans chargé')}</td>${sem.map(x => `<td class="num small muted">${fmt((parChargeSem[k] || {})[x.s] || 0)}</td>`).join('')}</tr>`).join('') : ''}
  </table></div>`;
}
function bindPlanningGantt(root, query) {
  const go = p => { const q = new URLSearchParams(query); Object.entries(p).forEach(([k, v]) => (v ? q.set(k, v) : q.delete(k))); location.hash = `#/planning/gantt?${q}`; };
  root.querySelector('#gg-charge').onchange = e => go({ charge: e.target.value });
  root.querySelector('#gg-h').onchange = e => go({ h: e.target.value });
}
