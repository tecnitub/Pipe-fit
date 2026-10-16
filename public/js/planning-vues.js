// Planning visuel : la semaine par chantier (chaque compagnon est une pastille qu'on glisse d'un chantier à l'autre)
// et le planning d'une personne sur cinq semaines (calendrier coloré, heures prévues / pointées, absences).
// Chaque changement prévient le compagnon sur son téléphone (voir server/notifs.js).
const initiales = nom => String(nom || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(m => m[0].toUpperCase()).join('');
const prenomDe = nom => String(nom || '').split(' ')[0];
const capacite = u => num(u.capaciteHebdo) || num(Store.data.settings.dureeHebdo) || 35;
// Pastille d'une personne (couleur propre, initiales) ; glissable si elle porte une affectation
function avatar(u, opts = {}) {
  const attrs = opts.d ? `data-av="${u.id}" data-d="${opts.d}" ${opts.pid ? `data-pid="${opts.pid}"` : ''} ${opts.drag ? 'draggable="true"' : ''}` : '';
  return `<button type="button" class="av ${opts.taille || ''} ${opts.classe || ''}" style="--h:${teinte(u.id)}" title="${esc(u.nom)}${opts.titre ? ' · ' + esc(opts.titre) : ''}" ${attrs}>${esc(initiales(u.nom))}${opts.coin ? `<i>${opts.coin}</i>` : ''}</button>`;
}
// Anneau de charge : heures prévues / capacité de la semaine
function anneau(u, hp, opts = {}) {
  const cap = capacite(u), pct = Math.min(100, Math.round(hp / cap * 100));
  const humeur = hp > cap + 0.1 ? '🔥' : hp === 0 ? '💤' : hp >= cap * 0.9 ? '💪' : '';
  return `<a class="anneau ${opts.lien ? '' : 'statique'}" ${opts.lien ? `href="${opts.lien}"` : ''} title="${esc(u.nom)} : ${fmt(hp, 1)} h prévues sur ${fmt(cap)} h">
    <span class="anneau-cercle" style="--p:${pct};--h:${teinte(u.id)}">${avatar(u, { taille: 'moyen' })}</span>
    <span class="anneau-nom">${esc(prenomDe(u.nom))}${humeur ? ` ${humeur}` : ''}</span><span class="anneau-h ${hp > cap + 0.1 ? 'neg' : ''}">${fmt(hp, 1)}/${fmt(cap)} h</span></a>`;
}

/* ---------- La semaine par chantier ---------- */
function planningSemaine(query) {
  const s = +(query.get('s') || 0), today = isoDate(new Date()), edit = Store.can('write', 'planning');
  const lundi = addDays(mondayOf(new Date()), s * 7), personnes = personnesPlanning();
  const jours = joursSemaine(lundi).filter(d => jourDe(d).getDay() !== 6 || personnes.some(u => toutJour(u.id, d).length));
  const hpSemaine = u => sumBy(jours, d => bilanJour(u.id, d).hp);
  const chantiers = new Set(), stats = { planifies: 0, libres: 0, absents: 0 };

  const colonne = d => {
    const groupes = new Map(), absents = [], libres = [];
    personnes.forEach(u => {
      const plan = planJour(u.id, d), abs = absenceJour(u.id, d);
      if (abs && !plan.length) { absents.push({ u, abs }); return; }
      if (!plan.length) { libres.push(u); return; }
      plan.forEach(p => { if (!groupes.has(p.affaireId)) groupes.set(p.affaireId, []); groupes.get(p.affaireId).push({ u, p }); });
    });
    const occupes = personnes.length - libres.length - absents.length;
    stats.planifies += occupes; stats.libres += libres.length; stats.absents += absents.length;
    groupes.forEach((_, id) => chantiers.add(id));
    const cartes = [...groupes.entries()].sort((a, b) => b[1].length - a[1].length).map(([id, items]) => {
      const a = affaireOf(id), taches = [...new Set(items.map(x => x.p.tache).filter(Boolean))];
      return `<div class="pl-carte" style="--h:${teinte(id)}" data-a="${id}" data-d="${d}">
        <div class="pl-carte-tete"><strong>${esc(a.code || '?')}</strong><span class="small">${esc(a.nom || '')}</span></div>
        <div class="pl-carte-taches">${taches.map(t => `<span title="${esc(t)}">${iconeTache(t)} ${esc(t)}</span>`).join('')}</div>
        <div class="pl-avs">${items.map(({ u, p }) => avatar(u, { d, pid: p.id, drag: edit, titre: `${p.debut || ''}${p.fin ? '–' + p.fin : ''} ${fmt(p.heuresPrevues, 2)} h${p.tache ? ' · ' + p.tache : ''}` })).join('')}</div>
        <div class="pl-carte-pied small">${items.length} pers. · ${fmt(sumBy(items, x => num(x.p.heuresPrevues)), 1)} h${items.some(x => x.p.note) ? ' · 📝' : ''}</div></div>`;
    }).join('');
    const pct = personnes.length ? Math.round(occupes / personnes.length * 100) : 0;
    return `<section class="pl-col ${d === today ? 'today' : ''} ${d < today ? 'passe' : ''}">
      <header><strong>${JOURS_COURTS[jourDe(d).getDay() - 1]} ${jourDe(d).getDate()}</strong>${d === today ? ' <span class="badge b-info">Aujourd\'hui</span>' : ''}
        <div class="pl-jauge" title="${occupes} personne(s) affectée(s) sur ${personnes.length}"><span style="width:${pct}%"></span></div><span class="small muted">${occupes}/${personnes.length} sur chantier</span></header>
      ${cartes || '<p class="muted small pl-vide">Personne sur chantier.</p>'}
      ${edit ? `<div class="pl-nouveau" data-nouveau="${d}">＋ Déposer ici pour un autre chantier</div>` : ''}
      <div class="pl-libres" data-libres="${d}"><div class="small"><strong>🪑 Disponibles</strong> ${libres.length ? `(${libres.length})` : ''}</div>
        <div class="pl-avs">${libres.map(u => avatar(u, { d, drag: edit, classe: 'libre' })).join('') || '<span class="muted small">Tout le monde est occupé 🎉</span>'}</div></div>
      ${absents.length ? `<div class="pl-absents small">${absents.map(({ u, abs }) => `<span title="${esc(u.nom)} : ${esc(abs.absence)}">${iconeAbsence(abs.absence)} ${esc(prenomDe(u.nom))}</span>`).join(' ')}</div>` : ''}
    </section>`;
  };
  const html = jours.map(colonne).join('');
  const complet = stats.libres === 0 && stats.planifies > 0;
  return `<h1>Planning</h1>${planningTabs('semaine')}
  <div class="toolbar">
    <button class="secondary" onclick="location.hash='#/planning?s=${s - 1}'" aria-label="Semaine précédente">◀</button>
    <button class="secondary" onclick="location.hash='#/planning'">Cette semaine</button>
    <button class="secondary" onclick="location.hash='#/planning?s=${s + 1}'" aria-label="Semaine suivante">▶</button>
    <strong>Semaine ${isoWeek(lundi).split('-W')[1]} · du ${jourDe(jours[0]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</strong>
    <span class="spacer"></span>
    ${edit ? `<button class="secondary" id="pl-copier">Copier la semaine précédente</button>` : ''}
  </div>
  <div class="pl-stats">
    <span class="pl-stat">🏗️ <strong>${chantiers.size}</strong> chantier${chantiers.size > 1 ? 's' : ''}</span>
    <span class="pl-stat">👷 <strong>${stats.planifies}</strong> journées planifiées</span>
    <span class="pl-stat ${stats.libres ? 'attention' : ''}">🪑 <strong>${stats.libres}</strong> journée${stats.libres > 1 ? 's' : ''} à pourvoir</span>
    ${stats.absents ? `<span class="pl-stat">🏖️ <strong>${stats.absents}</strong> d'absence</span>` : ''}
    ${complet ? '<span class="pl-stat bravo">✅ Semaine complète !</span>' : ''}
  </div>
  <div class="pl-equipe">${personnes.map(u => anneau(u, hpSemaine(u), { lien: `#/planning/personne?u=${u.id}` })).join('')}</div>
  <p class="muted small">${edit ? 'Glissez une pastille d\'un chantier à l\'autre, ou depuis « Disponibles » vers un chantier ; déposez-la dans « Disponibles » pour libérer la journée. Cliquez sur une pastille pour le détail (horaires, consigne, absence). ' : ''}Chaque compagnon reçoit une notification sur son téléphone quand son planning change.</p>
  <div class="pl-board">${html}</div>`;
}

function bindPlanningSemaine(root, query) {
  bindPlanningEquipes(root, query); // bouton « Copier la semaine précédente »
  const edit = Store.can('write', 'planning');
  root.querySelectorAll('[data-av]').forEach(b => b.onclick = () => { if (edit) editerJour(b.dataset.av, b.dataset.d); });
  if (!edit) return;
  let source = null;
  root.querySelectorAll('[data-av][draggable]').forEach(b => {
    b.ondragstart = e => { source = { u: b.dataset.av, d: b.dataset.d, pid: b.dataset.pid || '' }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', source.u); b.classList.add('drag'); root.querySelector('.pl-board').classList.add('glisse'); };
    b.ondragend = () => { b.classList.remove('drag'); root.querySelector('.pl-board').classList.remove('glisse'); root.querySelectorAll('.survol').forEach(x => x.classList.remove('survol')); };
  });
  const cible = (el, fn) => {
    el.ondragover = e => { if (!source) return; e.preventDefault(); el.classList.add('survol'); };
    el.ondragleave = () => el.classList.remove('survol');
    el.ondrop = e => { e.preventDefault(); el.classList.remove('survol'); if (source) { const s = source; source = null; fn(s); } };
  };
  root.querySelectorAll('.pl-carte').forEach(el => cible(el, s => deposerSurChantier(s, el.dataset.a, el.dataset.d)));
  root.querySelectorAll('[data-libres]').forEach(el => cible(el, s => {
    if (s.d !== el.dataset.libres || !s.pid) return;
    toutJour(s.u, s.d).forEach(p => Store.remove('planning', p.id));
    App.render(); App.toast(`${prenomDe(userName(s.u))} libéré(e) le ${NotifPlanning.jourCourt(s.d)}`);
  }));
  root.querySelectorAll('[data-nouveau]').forEach(el => cible(el, s => editerJour(s.u, el.dataset.nouveau)));
}

// Pastille déposée sur un chantier : même jour = changement de chantier ; autre jour ou « disponible » = affectation
async function deposerSurChantier(src, affaireId, date) {
  const u = Store.get('users', src.u), p = src.pid && Store.get('planning', src.pid);
  if (p && p.date === date) {
    if (p.affaireId === affaireId) return;
    const deja = planJour(src.u, date).find(x => x.affaireId === affaireId && x.id !== p.id);
    if (deja) Store.remove('planning', p.id); else Store.upsert('planning', { ...p, affaireId });
    App.render(); App.toast(`${prenomDe(u.nom)} → ${affaireOf(affaireId).code || 'chantier'}`);
    return;
  }
  const abs = absenceJour(src.u, date);
  if (abs && !await ask(`${u.nom} est en ${abs.absence.toLowerCase()} le ${jourLong(date)}. L'affecter quand même au chantier ?`, 'Affecter', false)) return;
  // Horaires : ceux d'un collègue sur ce chantier ce jour-là, sinon ceux de l'affectation glissée, sinon la journée type
  const modele = Store.all('planning').find(x => x.date === date && x.affaireId === affaireId && !x.absence && x.userId !== src.u) || p || {};
  toutJour(src.u, date).forEach(x => Store.remove('planning', x.id));
  const debut = modele.debut || '07:30', fin = modele.fin || '16:30', pause = modele.pause ?? 60;
  Store.upsert('planning', { userId: src.u, date, affaireId, debut, fin, pause, heuresPrevues: num(modele.heuresPrevues) || dureeH(debut, fin, pause), tache: modele.tache || TACHES[0], note: modele.note || '' });
  App.render(); App.toast(`${prenomDe(u.nom)} affecté(e) à ${affaireOf(affaireId).code || 'ce chantier'} le ${NotifPlanning.jourCourt(date)}`);
}

/* ---------- Planning d'une personne (5 semaines) ---------- */
function planningPersonne(query) {
  const personnes = personnesPlanning(), edit = Store.can('write', 'planning'), today = isoDate(new Date());
  const u = Store.get('users', query.get('u')) || personnes[0];
  if (!u) return `<h1>Planning</h1>${planningTabs('personne')}<p class="muted">Aucune personne à planifier.</p>`;
  const m = +(query.get('m') || 0), lundi0 = addDays(mondayOf(new Date()), m * 7);
  const semaines = Array.from({ length: 5 }, (_, i) => addDays(lundi0, i * 7));
  const tousJours = semaines.flatMap(l => joursSemaine(l));
  const samedi = tousJours.some(d => jourDe(d).getDay() === 6 && toutJour(u.id, d).length);
  const bilans = Object.fromEntries(tousJours.map(d => [d, bilanJour(u.id, d)]));
  const parChantier = {};
  tousJours.forEach(d => bilans[d].plan.forEach(p => { parChantier[p.affaireId] = (parChantier[p.affaireId] || 0) + num(p.heuresPrevues); }));
  const nb = st => tousJours.filter(d => bilans[d].statut === st).length;
  const hp = sumBy(tousJours, d => bilans[d].hp), hr = sumBy(tousJours, d => bilans[d].hr);
  const chef = u.chefId && Store.get('users', u.chefId), equipe = equipeDe(u.id);
  const PICTO = { conforme: '✓', ecart: '±', 'autre-chantier': '⇄', 'non-pointe': '!', 'en-cours': '⏱', 'hors-planning': '+' };
  const tuile = d => {
    const b = bilans[d], dt = jourDe(d);
    const contenu = b.statut === 'absent' ? `<div class="pl-tuile-abs">${iconeAbsence(b.absence.absence)}<br>${esc(b.absence.absence)}</div>`
      : b.plan.map(p => { const a = affaireOf(p.affaireId); return `<div class="pl-tuile-ch" style="--h:${teinte(p.affaireId)}"><strong>${esc(a.code || '?')}</strong> ${iconeTache(p.tache)}<span>${fmt(p.heuresPrevues, 1)} h${p.debut ? ` · ${esc(p.debut)}` : ''}</span></div>`; }).join('')
        || (b.reel.length ? '' : '<div class="pl-tuile-vide">—</div>');
    const reel = b.reel.length && b.statut !== 'conforme' ? `<div class="small muted">pointé ${fmt(b.hr, 1)} h</div>` : '';
    return `<div class="pl-tuile ${d === today ? 'today' : ''} ${d < today ? 'passe' : ''} st-${b.statut}" ${edit ? `data-tuile="${d}" role="button" tabindex="0"` : ''} title="${esc(jourLong(d))}${BILANS[b.statut] && BILANS[b.statut][1] ? ' · ' + BILANS[b.statut][1] : ''}">
      <div class="pl-tuile-date"><span>${JOURS_COURTS[dt.getDay() - 1]}</span> ${dt.getDate()}${dt.getDate() === 1 || d === tousJours[0] ? ` ${dt.toLocaleDateString('fr-FR', { month: 'short' })}` : ''}${PICTO[b.statut] ? `<i class="pl-picto">${PICTO[b.statut]}</i>` : ''}</div>${contenu}${reel}</div>`;
  };
  return `<h1>Planning</h1>${planningTabs('personne')}
  <div class="pl-choix">${personnes.map(x => `<a href="#/planning/personne?u=${x.id}${m ? `&m=${m}` : ''}" class="${x.id === u.id ? 'on' : ''}">${avatar(x, { taille: 'petit' })}<span>${esc(prenomDe(x.nom))}</span></a>`).join('')}</div>
  <div class="card pl-profil">
    ${avatar(u, { taille: 'grand' })}
    <div><h2 style="margin:0">${esc(u.nom)} ${interimBadge(u)}</h2>
      <div class="muted small">${esc(moOf(u.categorieId).libelle || '')}${chef ? ` · équipe de ${esc(chef.nom)}` : ''}${equipe.length ? ` · chef d'équipe de ${equipe.map(x => esc(prenomDe(x.nom))).join(', ')}` : ''} · ${fmt(capacite(u))} h / semaine</div>
      <div class="pl-stats">
        <span class="pl-stat">📅 <strong>${tousJours.filter(d => bilans[d].plan.length).length}</strong> jours sur chantier</span>
        <span class="pl-stat">⏱️ <strong>${fmt(hp, 0)} h</strong> prévues · ${fmt(hr, 0)} h pointées</span>
        <span class="pl-stat">🏗️ <strong>${Object.keys(parChantier).length}</strong> chantier${Object.keys(parChantier).length > 1 ? 's' : ''}</span>
        ${nb('conforme') ? `<span class="pl-stat bravo">🎯 <strong>${nb('conforme')}</strong> journée${nb('conforme') > 1 ? 's' : ''} conforme${nb('conforme') > 1 ? 's' : ''}</span>` : ''}
        ${nb('absent') ? `<span class="pl-stat">🏖️ <strong>${nb('absent')}</strong> jour${nb('absent') > 1 ? 's' : ''} d'absence</span>` : ''}
        ${nb('non-pointe') ? `<span class="pl-stat attention">⚠️ <strong>${nb('non-pointe')}</strong> non pointé${nb('non-pointe') > 1 ? 's' : ''}</span>` : ''}
      </div></div>
  </div>
  <div class="toolbar">
    <a class="btn secondary" href="#/planning/personne?u=${u.id}&m=${m - 5}" aria-label="Cinq semaines plus tôt">◀</a>
    <a class="btn secondary" href="#/planning/personne?u=${u.id}">Aujourd'hui</a>
    <a class="btn secondary" href="#/planning/personne?u=${u.id}&m=${m + 5}" aria-label="Cinq semaines plus tard">▶</a>
    <strong>Du ${jourDe(tousJours[0]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au ${jourDe(tousJours[tousJours.length - 1]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</strong>
  </div>
  <div class="pl-cal ${samedi ? 'avec-samedi' : ''}">
    ${semaines.map(l => {
      const ds = joursSemaine(l).filter(d => samedi || jourDe(d).getDay() !== 6), h = sumBy(ds, d => bilans[d].hp), cap = capacite(u);
      return `<div class="pl-sem"><div class="pl-sem-tete"><strong>S${isoWeek(l).split('-W')[1]}</strong><div class="pl-jauge ${h > cap + 0.1 ? 'trop' : ''}"><span style="width:${Math.min(100, h / cap * 100)}%"></span></div><span class="small">${fmt(h, 1)}/${fmt(cap)} h</span></div>
        <div class="pl-jours">${ds.map(tuile).join('')}</div></div>`;
    }).join('')}
  </div>
  ${Object.keys(parChantier).length ? `<h2>Chantiers sur la période</h2><div class="pl-legende">${Object.entries(parChantier).sort((a, b) => b[1] - a[1]).map(([id, h]) => { const a = affaireOf(id); return `<a class="pl-leg" href="#/chantier/${id}" style="--h:${teinte(id)}"><strong>${esc(a.code || '?')}</strong> ${esc(a.nom || '')} <span>${fmt(h, 1)} h</span></a>`; }).join('')}</div>` : ''}
  <p class="muted small">${edit ? 'Cliquez sur un jour pour planifier, changer de chantier ou poser une absence. ' : ''}${PICTO.conforme} conforme · ${PICTO.ecart} écart d'heures · ! non pointé · ⇄ autre chantier · + hors planning.</p>`;
}
function bindPlanningPersonne(root, query) {
  const u = Store.get('users', query.get('u')) || personnesPlanning()[0];
  if (!u) return;
  root.querySelectorAll('[data-tuile]').forEach(t => {
    t.onclick = () => editerJour(u.id, t.dataset.tuile);
    t.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editerJour(u.id, t.dataset.tuile); } };
  });
}
