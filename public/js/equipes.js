// Planning des équipes jour par jour : affectations préparées au bureau, consultées sur le téléphone,
// puis confrontées aux heures réellement pointées par les compagnons (qui saisissent leur journée à partir du planning).
const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const jourDe = s => new Date(`${s}T12:00:00`);
const semaineDe = p => p.semaine || isoWeek(jourDe(p.date));
const planJour = (uid, date) => Store.all('planning').filter(p => p.date === date && p.userId === uid && !p.absence);
const toutJour = (uid, date) => Store.all('planning').filter(p => p.date === date && p.userId === uid);
const absenceJour = (uid, date) => Store.all('planning').find(p => p.date === date && p.userId === uid && p.absence);
const MOTIFS_ABSENCE = ['Congés', 'RTT', 'Maladie', 'Formation', 'Récupération', 'Absent'];
const ICONES_ABSENCE = { Congés: '🏖️', RTT: '🌤️', Maladie: '🤒', Formation: '🎓', Récupération: '😴', Absent: '🚫' };
const iconeAbsence = m => ICONES_ABSENCE[m] || '🚫';
const ICONES_TACHE = { Préfabrication: '🏭', Soudure: '🔥', Montage: '🔧', Manutention: '🏋️', 'Contrôles / essais': '🔍', Déplacement: '🚚', Études: '📐' };
const iconeTache = t => ICONES_TACHE[t] || '🛠️';
const reelJour = (uid, date) => Store.all('temps').filter(t => t.date === date && t.userId === uid);
const joursSemaine = lundi => Array.from({ length: 6 }, (_, i) => isoDate(addDays(lundi, i)));
// Couleur d'un chantier ou d'une personne : teintes réparties par l'angle d'or (deux chantiers voisins ne se ressemblent pas)
const teinte = id => {
  for (const col of ['affaires', 'users']) {
    const i = Store.all(col).findIndex(x => x.id === id);
    if (i >= 0) return Math.round((i * 137.508 + (col === 'users' ? 200 : 15)) % 360);
  }
  let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return h;
};
const jourLong = date => jourDe(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

// Prévu / réalisé d'une personne sur une journée
function bilanJour(uid, date) {
  const plan = planJour(uid, date), reel = reelJour(uid, date), today = isoDate(new Date()), absence = absenceJour(uid, date);
  const hp = sumBy(plan, p => num(p.heuresPrevues)), hr = sumBy(reel.filter(t => t.fin || !t.debut), t => num(t.heures));
  let statut;
  if (absence && !reel.length && !plan.length) statut = 'absent';
  else if (!plan.length && !reel.length) statut = 'libre';
  else if (reel.some(t => t.debut && !t.fin)) statut = 'en-cours';
  else if (!plan.length) statut = 'hors-planning';
  else if (!reel.length) statut = date < today ? 'non-pointe' : 'a-venir';
  else if (reel.some(t => !plan.some(p => p.affaireId === t.affaireId))) statut = 'autre-chantier';
  else statut = Math.abs(hr - hp) <= 0.25 ? 'conforme' : 'ecart';
  return { plan, reel, hp, hr, statut, absence };
}
const BILANS = { conforme: ['b-ok', 'Conforme'], ecart: ['b-warn', 'Écart d\'heures'], 'autre-chantier': ['b-warn', 'Autre chantier'], 'non-pointe': ['b-bad', 'Non pointé'],
  'en-cours': ['b-info', 'En cours'], 'a-venir': ['', 'Prévu'], 'hors-planning': ['b-info', 'Hors planning'], libre: ['', ''], absent: ['', 'Absent'] };
const badgeBilan = b => (b.statut === 'absent' ? `<span class="badge b-abs">${iconeAbsence(b.absence.absence)} ${esc(b.absence.absence)}</span>` : BILANS[b.statut][1] ? `<span class="badge ${BILANS[b.statut][0]}">${BILANS[b.statut][1]}${b.statut === 'ecart' ? ` ${b.hr > b.hp ? '+' : '−'}${fmt(Math.abs(b.hr - b.hp), 2)} h` : ''}</span>` : '');
const puceChantier = (a, txt) => `<span class="chip-ch" style="--h:${teinte(a.id || '')}">${esc(txt || a.code || a.nom || '?')}</span>`;

// Compagnons à planifier : chefs d'équipe suivis de leur équipe, puis les autres
function personnesPlanning() {
  const ops = operateurs(), vus = new Set(), out = [];
  ops.filter(u => equipeDe(u.id).length).forEach(chef => { [chef, ...equipeDe(chef.id)].forEach(u => { if (!vus.has(u.id)) { vus.add(u.id); out.push(u); } }); });
  ops.forEach(u => { if (!vus.has(u.id)) out.push(u); });
  return out;
}

function planningTabs(actif) {
  return `<div class="tabs">${[['semaine', '#/planning', '🗓️ Semaine'], ['personne', '#/planning/personne', '🧑‍🔧 Par personne'], ['equipes', '#/planning/tableau', 'Tableau jour par jour'], ['charge', '#/planning/charge', 'Charge par semaine'], ['gantt', '#/planning/gantt', '📊 Gantt et plan de charge']]
    .map(([k, h, l]) => `<a href="${h}" class="${actif === k ? 'active' : ''}">${l}</a>`).join('')}</div>`;
}

/* ---------- Bureau : grille personnes × jours ---------- */
function planningEquipes(query) {
  const s = +(query.get('s') || 0), today = isoDate(new Date());
  const lundi = addDays(mondayOf(new Date()), s * 7), jours = joursSemaine(lundi);
  const personnes = personnesPlanning(), edit = Store.can('write', 'planning');
  const chefs = new Set(personnes.filter(u => equipeDe(u.id).length).map(u => u.id));
  const cellule = (u, date) => {
    const b = bilanJour(u.id, date);
    const items = b.plan.map(p => { const a = affaireOf(p.affaireId); return `<div class="pl-item">${puceChantier(a)}<span class="small">${esc(p.tache || '')} · ${fmt(p.heuresPrevues, 2)} h</span>${p.note ? '<span class="small muted" title="' + esc(p.note) + '"> ✎</span>' : ''}</div>`; }).join('');
    const reel = b.reel.length && b.statut !== 'conforme' ? `<div class="small muted">pointé ${b.reel.map(t => `${esc(affaireOf(t.affaireId).code || '')} ${t.fin || !t.debut ? fmt(t.heures, 2) + ' h' : 'en cours'}`).join(', ')}</div>` : '';
    return `<td class="pl-cell ${date === today ? 'today' : ''} ${date < today ? 'passe' : ''}" ${edit ? `data-u="${u.id}" data-d="${date}"` : ''}>${items}${reel}${b.plan.length || b.reel.length || b.absence ? badgeBilan(b) : ''}</td>`;
  };
  const semaine = jours.flatMap(date => personnes.map(u => bilanJour(u.id, date)));
  const parChantier = {};
  Store.all('planning').filter(p => p.date && jours.includes(p.date)).forEach(p => { (parChantier[p.affaireId] = parChantier[p.affaireId] || { prevu: 0, reel: 0 }).prevu += num(p.heuresPrevues); });
  Store.all('temps').filter(t => jours.includes(t.date)).forEach(t => { (parChantier[t.affaireId] = parChantier[t.affaireId] || { prevu: 0, reel: 0 }).reel += num(t.heures); });
  const nb = st => semaine.filter(b => b.statut === st).length;
  return `<h1>Planning</h1>${planningTabs('equipes')}
  <div class="toolbar">
    <button class="secondary" data-go="#/planning/tableau?s=${s - 1}">◀</button>
    <button class="secondary" data-go="#/planning/tableau">Cette semaine</button>
    <button class="secondary" data-go="#/planning/tableau?s=${s + 1}">▶</button>
    <strong>Semaine du ${jourDe(jours[0]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</strong>
    <span class="spacer"></span>
    ${edit ? '<button class="secondary" id="pl-copier">Copier la semaine précédente</button>' : ''}
  </div>
  <p class="muted">${edit ? 'Cliquez sur une case pour affecter une personne (ou toute son équipe) à un chantier, sur un ou plusieurs jours. ' : ''}Les compagnons voient leur planning sur leur téléphone et saisissent leur journée à partir de celui-ci : le réalisé remplace le prévu et les écarts apparaissent ici.</p>
  <div class="cards">
    <div class="card"><div class="label">Journées planifiées</div><div class="value">${semaine.filter(b => b.plan.length).length}</div></div>
    <div class="card"><div class="label">Conformes</div><div class="value pos">${nb('conforme')}</div></div>
    <div class="card"><div class="label">Écarts</div><div class="value ${nb('ecart') + nb('autre-chantier') ? 'warn-text' : ''}">${nb('ecart') + nb('autre-chantier')}</div><div class="sub">${nb('hors-planning')} hors planning</div></div>
    <div class="card"><div class="label">Non pointées</div><div class="value ${nb('non-pointe') ? 'neg' : ''}">${nb('non-pointe')}</div></div>
  </div>
  <div class="table-wrap"><table class="pl-grid"><tr><th>Personne</th>${jours.map(d => `<th class="${d === today ? 'today' : ''}">${JOURS_COURTS[jourDe(d).getDay() - 1]} ${jourDe(d).getDate()}</th>`).join('')}<th class="num">Semaine</th></tr>
    ${personnes.map(u => {
      const hp = sumBy(jours, d => bilanJour(u.id, d).hp), hr = sumBy(jours, d => bilanJour(u.id, d).hr);
      return `<tr class="${u.chefId && chefs.has(u.chefId) ? 'pl-membre' : ''}"><td><strong>${esc(u.nom)}</strong>${signalHabilitation(u.id)}${chefs.has(u.id) ? ' <span class="badge b-info">Chef d\'équipe</span>' : ''} ${interimBadge(u)}<br><span class="muted small">${esc(moOf(u.categorieId).libelle || '')}</span></td>
        ${jours.map(d => cellule(u, d)).join('')}<td class="num"><strong>${fmt(hp, 1)} h</strong><br><span class="muted small">pointé ${fmt(hr, 1)} h</span></td></tr>`;
    }).join('')}</table></div>
  <h2>Chantiers cette semaine</h2>
  ${Object.keys(parChantier).length ? `<div class="table-wrap"><table><tr><th>Chantier</th><th class="num">Prévu</th><th class="num">Pointé</th><th class="num">Reste à faire (budget)</th></tr>
    ${Object.entries(parChantier).map(([id, v]) => { const a = affaireOf(id), c = Calc.affaire(a); return `<tr class="clickable" data-go="#/chantier/${id}"><td>${puceChantier(a)} ${esc(a.nom || '')}</td><td class="num">${fmt(v.prevu, 1)} h</td><td class="num">${fmt(v.reel, 1)} h</td><td class="num ${c.heuresPrevues - c.heuresPassees < 0 ? 'neg' : ''}">${c.heuresPrevues ? fmt(c.heuresPrevues - c.heuresPassees, 1) + ' h' : '—'}</td></tr>`; }).join('')}</table></div>` : '<p class="muted">Rien de planifié cette semaine.</p>'}`;
}

function bindPlanningEquipes(root, query) {
  const s = +(query.get('s') || 0), lundi = addDays(mondayOf(new Date()), s * 7);
  root.querySelectorAll('td[data-u]').forEach(td => td.onclick = () => editerJour(td.dataset.u, td.dataset.d));
  const cp = root.querySelector('#pl-copier');
  if (cp) cp.onclick = async () => {
    const avant = joursSemaine(addDays(lundi, -7)), apres = joursSemaine(lundi);
    const src = Store.all('planning').filter(p => p.date && avant.includes(p.date));
    if (!src.length) return notify('Rien à copier : la semaine précédente est vide.');
    const libres = src.filter(p => !toutJour(p.userId, apres[avant.indexOf(p.date)]).length);
    if (!await ask(`Copier ${libres.length} affectation(s) de la semaine précédente ? Les journées déjà planifiées ne sont pas modifiées.`, 'Copier', false)) return;
    libres.forEach(p => { const { id, _v, _at, _by, ...rest } = p; Store.upsert('planning', { ...rest, date: apres[avant.indexOf(p.date)] }); });
    App.render(); App.toast(`${libres.length} affectation(s) copiée(s)`);
  };
}

// Fenêtre d'affectation d'une journée (copiable sur d'autres jours et sur l'équipe)
function editerJour(userId, date) {
  const u = Store.get('users', userId), equipe = equipeDe(userId), jours = joursSemaine(mondayOf(jourDe(date)));
  let lignes = planJour(userId, date).map(p => ({ ...p }));
  if (!lignes.length) {
    const veille = Store.all('planning').filter(p => p.userId === userId && p.date && p.date < date && !p.absence).sort((a, b) => b.date.localeCompare(a.date))[0];
    lignes = [{ affaireId: veille ? veille.affaireId : (chantiersActifs()[0] || {}).id, tache: veille ? veille.tache : TACHES[0], debut: '07:30', fin: '16:30', pause: 60, note: '' }];
  }
  const ligne = (p, i) => `<div class="pl-ligne card" data-i="${i}">
    <div class="grid2"><div class="field"><label>Chantier</label><select data-k="affaireId">${options(Store.all('affaires').filter(a => chantiersActifs().includes(a) || a.id === p.affaireId), p.affaireId, affaireLabel, false)}</select></div>
      <div class="field"><label>Tâche</label><input data-k="tache" list="pl-taches" value="${esc(p.tache || '')}"></div>
      <div class="field"><label>Arrivée</label><input data-k="debut" type="time" value="${esc(p.debut || '')}"></div>
      <div class="field"><label>Départ</label><input data-k="fin" type="time" value="${esc(p.fin || '')}"></div>
      <div class="field"><label>Pause (min)</label><input data-k="pause" type="number" step="5" value="${esc(p.pause ?? 60)}"></div>
      <div class="field"><label>Heures prévues</label><input data-k="heuresPrevues" type="number" step="0.25" value="${esc(p.heuresPrevues ?? dureeH(p.debut, p.fin, p.pause))}"></div></div>
    <div class="field"><label>Consigne pour l'équipe (lieu de RDV, accès, matériel…)</label><input data-k="note" value="${esc(p.note || '')}"></div>
    <button class="small danger" data-retirer="${i}" type="button">Retirer</button></div>`;
  const abs = absenceJour(userId, date);
  const box = Modal.open(`<h2 style="margin-top:0">${esc(u.nom)}${signalHabilitation(u.id)} · ${esc(jourLong(date))}</h2>${alertesHabPlanning(u.id)}
    <div class="seg" role="group" aria-label="Type de journée" style="margin-bottom:10px"><button type="button" data-type="chantier" class="${abs ? '' : 'on'}">🏗️ Sur chantier</button><button type="button" data-type="absence" class="${abs ? 'on' : ''}">🏖️ Absence</button></div>
    <div data-pane="absence" ${abs ? '' : 'hidden'}><div class="chips">${MOTIFS_ABSENCE.map((m, i) => `<label class="chip"><input type="radio" name="pl-motif" value="${esc(m)}" ${(abs ? abs.absence === m : !i) ? 'checked' : ''}><span>${iconeAbsence(m)} ${esc(m)}</span></label>`).join('')}</div></div>
    <div data-pane="chantier" ${abs ? 'hidden' : ''}>
    <datalist id="pl-taches">${TACHES.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
    <div id="pl-lignes">${lignes.map(ligne).join('')}</div>
    <button class="secondary small" id="pl-plus" type="button">+ Autre chantier dans la journée</button></div>
    <fieldset class="doc-opts" style="margin-top:12px"><legend>Appliquer aussi (remplace ce qui est déjà prévu)</legend>
      <div class="chips">${jours.map(d => `<label class="chip"><input type="checkbox" data-jour="${d}" ${d === date ? 'checked disabled' : ''}><span>${JOURS_COURTS[jourDe(d).getDay() - 1]} ${jourDe(d).getDate()}</span></label>`).join('')}</div>
      ${equipe.length ? `<label class="check"><input type="checkbox" id="pl-equipe"> À toute son équipe : ${equipe.map(m => esc(m.nom)).join(', ')}</label>` : ''}
    </fieldset>
    <div class="modal-actions"><button class="danger" id="pl-vider" type="button">Libérer la journée</button><span style="flex:1"></span><button class="secondary" id="pl-annuler">Annuler</button><button id="pl-ok">Enregistrer</button></div>`);
  const lire = () => [...box.querySelectorAll('.pl-ligne')].map(div => {
    const o = {};
    div.querySelectorAll('[data-k]').forEach(el => { o[el.dataset.k] = el.value; });
    o.pause = num(o.pause); o.heuresPrevues = num(o.heuresPrevues);
    return o;
  });
  const lier = () => {
    box.querySelectorAll('.pl-ligne').forEach(div => {
      const recalc = () => { const g = k => div.querySelector(`[data-k="${k}"]`).value; if (g('debut') && g('fin')) div.querySelector('[data-k="heuresPrevues"]').value = dureeH(g('debut'), g('fin'), g('pause')); };
      ['debut', 'fin', 'pause'].forEach(k => { div.querySelector(`[data-k="${k}"]`).oninput = recalc; });
    });
    box.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => { lignes = lire(); lignes.splice(+b.dataset.retirer, 1); box.querySelector('#pl-lignes').innerHTML = lignes.map(ligne).join(''); lier(); });
  };
  lier();
  box.querySelector('#pl-plus').onclick = () => { lignes = lire(); lignes.push({ affaireId: '', tache: '', debut: '', fin: '', pause: 0, heuresPrevues: 4, note: '' }); box.querySelector('#pl-lignes').innerHTML = lignes.map(ligne).join(''); lier(); };
  const cibles = () => {
    const ds = [date, ...[...box.querySelectorAll('[data-jour]:checked:not(:disabled)')].map(c => c.dataset.jour)];
    const us = [userId, ...(box.querySelector('#pl-equipe') && box.querySelector('#pl-equipe').checked ? equipe.map(m => m.id) : [])];
    return { ds, us };
  };
  let type = abs ? 'absence' : 'chantier';
  box.querySelectorAll('[data-type]').forEach(b => b.onclick = () => {
    type = b.dataset.type;
    box.querySelectorAll('[data-type]').forEach(x => x.classList.toggle('on', x === b));
    box.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== type; });
  });
  const remplacer = nouvelles => {
    const { ds, us } = cibles();
    us.forEach(uid => ds.forEach(d => {
      toutJour(uid, d).forEach(p => Store.remove('planning', p.id));
      nouvelles.forEach(n => Store.upsert('planning', { ...n, userId: uid, date: d }));
    }));
    return us.length * ds.length;
  };
  box.querySelector('#pl-annuler').onclick = Modal.close;
  box.querySelector('#pl-vider').onclick = () => { remplacer([]); Modal.close(); App.render(); };
  box.querySelector('#pl-ok').onclick = () => {
    if (type === 'absence') {
      const motif = (box.querySelector('[name="pl-motif"]:checked') || {}).value || 'Absent';
      const n = remplacer([{ absence: motif, affaireId: '', heuresPrevues: 0 }]);
      Modal.close(); App.render(); App.toast(n > 1 ? `${n} journées d'absence (${motif})` : `${motif} enregistré`);
      return;
    }
    const nouvelles = lire().filter(l => l.affaireId && l.heuresPrevues > 0);
    if (!nouvelles.length) return notify('Choisissez un chantier et des heures, ou libérez la journée.');
    const n = remplacer(nouvelles);
    Modal.close(); App.render(); if (n > 1) App.toast(`${n} journées planifiées`);
  };
}

/* ---------- Téléphone : mon planning (et celui de mon équipe) ---------- */
const planningMobileSel = { mode: 'moi' };
function planningMobile(u, query) {
  const s = +(query.get('s') || 0), today = isoDate(new Date());
  const equipe = equipeDe(u.id), modeEquipe = equipe.length && planningMobileSel.mode === 'equipe';
  const modifies = u.id === Store.me.userId ? Notifs.joursModifies() : new Set();
  const lundi = addDays(mondayOf(new Date()), s * 7);
  const jours = [...joursSemaine(lundi), ...joursSemaine(addDays(lundi, 7))]
    .filter(d => jourDe(d).getDay() !== 6 || [u, ...equipe].some(m => planJour(m.id, d).length || reelJour(m.id, d).length));
  const q = Store.me.role === 'atelier' ? '' : `pour=${u.id}&`;
  const detailPlan = (p, uid) => {
    const a = affaireOf(p.affaireId), site = siteOf(a.clientId, a.siteId), adr = site ? fullAddress(site) : '';
    const avec = Store.all('planning').filter(x => x.date === p.date && x.affaireId === p.affaireId && x.userId !== uid).map(x => userName(x.userId).split(' ')[0]);
    return `<div class="pl-detail">${puceChantier(a, `${a.code || ''} · ${a.nom || ''}`)}
      <div class="small">${esc(p.tache || '')}${p.debut ? ` · ${esc(p.debut)} – ${esc(p.fin || '')}` : ''} · <strong>${fmt(p.heuresPrevues, 2)} h</strong></div>
      ${adr ? `<div class="small muted">📍 ${esc(site.libelle)} · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adr)}" target="_blank" rel="noopener">${esc(adr)}</a></div>` : ''}
      ${site && site.acces ? `<div class="small muted">Accès : ${esc(site.acces)}</div>` : ''}
      ${p.note ? `<div class="small pl-note">${esc(p.note)}</div>` : ''}
      ${avec.length ? `<div class="small muted">Avec : ${esc(avec.join(', '))}</div>` : ''}</div>`;
  };
  const reelHtml = b => b.reel.length ? `<div class="small pl-reel">Pointé : ${b.reel.map(t => `${esc(affaireOf(t.affaireId).code || '')} ${t.debut ? `${esc(t.debut)}–${esc(t.fin || '…')}` : ''} ${t.fin || !t.debut ? `<strong>${fmt(t.heures, 2)} h</strong>` : ''}`).join(' · ')}</div>` : '';
  const carte = d => {
    const peutSaisir = d <= today;
    if (modeEquipe) {
      const membres = [u, ...equipe], bilans = membres.map(m => ({ m, b: bilanJour(m.id, d) }));
      const aSaisir = bilans.filter(x => x.b.plan.length && !x.b.reel.length);
      return `<div class="card pl-jour ${d === today ? 'today' : ''}"><div class="pl-jour-tete"><strong>${esc(jourLong(d))}</strong></div>
        <ul class="punch-list">${bilans.filter(x => x.b.plan.length || x.b.reel.length).map(({ m, b }) => `<li><div><strong>${esc(m.nom)}</strong> ${interimBadge(m)} ${badgeBilan(b)}<br>
          ${b.plan.map(p => `<span class="small">${puceChantier(affaireOf(p.affaireId))} ${esc(p.tache || '')} ${fmt(p.heuresPrevues, 2)} h</span>`).join(' ')}${reelHtml(b)}</div></li>`).join('') || '<li class="muted small">Rien de prévu.</li>'}</ul>
        ${peutSaisir && aSaisir.length ? `<button class="big" data-saisir="${d}" data-ids="${aSaisir.map(x => x.m.id).join(',')}">Saisir la journée de l'équipe (${aSaisir.length})</button>` : ''}</div>`;
    }
    const b = bilanJour(u.id, d), modifie = modifies.has(d);
    return `<div class="card pl-jour ${d === today ? 'today' : ''} ${modifie ? 'modifie' : ''}" id="jour-${d}"><div class="pl-jour-tete"><strong>${esc(jourLong(d))}</strong> ${modifie ? '<span class="badge b-warn">🔔 Modifié</span>' : ''} ${badgeBilan(b)}</div>
      ${b.statut === 'absent' ? `<p class="pl-abs-mobile">${iconeAbsence(b.absence.absence)} ${esc(b.absence.absence)}${['Congés', 'RTT', 'Récupération'].includes(b.absence.absence) ? ' : bon repos !' : ''}</p>`
        : b.plan.map(p => detailPlan(p, u.id)).join('') || '<p class="muted small" style="margin:4px 0">Rien de prévu.</p>'}
      ${reelHtml(b)}
      ${b.statut === 'ecart' ? `<div class="small warn-text">${b.hr > b.hp ? `${fmt(b.hr - b.hp, 2)} h de plus` : `${fmt(b.hp - b.hr, 2)} h de moins`} que prévu</div>` : ''}
      ${peutSaisir && b.plan.length && !b.reel.length ? `<button class="big" data-saisir="${d}" data-ids="${u.id}">${d === today ? 'Saisir ma journée' : 'Saisir cette journée (oubli)'}</button>` : ''}</div>`;
  };
  return `<div class="pointage"><h1>Pointage</h1>
    ${Store.me.role !== 'atelier' ? `<div class="field"><label for="p-pour">Pointer en tant que</label><select id="p-pour">${options(operateurs(), u.id, undefined, false)}</select></div>` : ''}
    ${pointageTabs('planning', u.id)}
    ${equipe.length ? `<div class="seg" role="group" aria-label="Planning affiché" style="margin-bottom:10px">${[['moi', 'Mon planning'], ['equipe', `Mon équipe (${equipe.length + 1})`]].map(([k, l]) => `<button class="${(planningMobileSel.mode || 'moi') === k ? 'on' : ''}" data-plmode="${k}">${l}</button>`).join('')}</div>` : ''}
    <div class="toolbar"><a class="btn secondary small" href="#/pointage/planning?${q}s=${s - 1}">◀</a><a class="btn secondary small" href="#/pointage/planning?${q}">Aujourd'hui</a><a class="btn secondary small" href="#/pointage/planning?${q}s=${s + 1}">▶</a></div>
    ${modeEquipe ? '' : bandeauSemaine(u, jours.slice(0, 6), today, modifies)}
    <p class="muted small">Planning préparé par le bureau ; vous êtes prévenu sur votre téléphone dès qu'il change. En fin de journée, « Saisir ma journée » reprend le chantier et les horaires prévus : corrigez-les avec ce que vous avez réellement fait.</p>
    ${jours.map(carte).join('')}</div>`;
}

// Bandeau de la semaine : une pastille par jour, couleur du chantier, heures ou absence (touchez pour aller au jour)
function bandeauSemaine(u, jours, today, modifies) {
  const auj = bilanJour(u.id, today), p0 = auj.plan[0], a0 = p0 && affaireOf(p0.affaireId);
  const salut = jours.includes(today) ? `<div class="pl-salut">👋 Bonjour ${esc(prenomDe(u.nom))} ! ${auj.statut === 'absent' ? `Aujourd'hui : ${iconeAbsence(auj.absence.absence)} ${esc(auj.absence.absence)}.`
    : p0 ? `Aujourd'hui : <strong>${esc(a0.code || '')}</strong> ${esc(a0.nom || '')}${p0.debut ? ` · ${esc(p0.debut)}–${esc(p0.fin || '')}` : ''} · ${iconeTache(p0.tache)} ${esc(p0.tache || '')}` : 'Rien de prévu aujourd\'hui.'}</div>` : '';
  return `${salut}<div class="pl-bulles">${jours.map(d => {
    const b = bilanJour(u.id, d), p = b.plan[0];
    return `<a href="#" role="button" data-aller="${d}" class="pl-bulle ${d === today ? 'today' : ''} ${modifies.has(d) ? 'modifie' : ''}" style="--h:${p ? teinte(p.affaireId) : 0}" title="${esc(jourLong(d))}">
      <span class="small">${JOURS_COURTS[jourDe(d).getDay() - 1]}</span><strong>${jourDe(d).getDate()}</strong>
      <span class="pl-bulle-pt ${p ? 'plein' : ''}">${b.statut === 'absent' ? iconeAbsence(b.absence.absence) : p ? iconeTache(p.tache) : '·'}</span>
      <span class="small">${b.statut === 'absent' ? '' : b.hp ? fmt(b.hp, 1) + ' h' : ''}</span></a>`;
  }).join('')}</div>`;
}

function bindPlanningMobile(root, uid) {
  root.querySelectorAll('[data-plmode]').forEach(b => b.onclick = () => { planningMobileSel.mode = b.dataset.plmode; App.render(); });
  root.querySelectorAll('[data-aller]').forEach(a => a.onclick = ev => { ev.preventDefault(); const c = root.querySelector(`#jour-${a.dataset.aller}`); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  // Le compagnon a vu son planning : ses notifications de planning passent en « lues » (la mise en avant reste jusqu'au prochain affichage)
  if (uid === Store.me.userId) Notifs.nonLues().filter(n => n.type === 'planning').forEach(n => Notifs.marquerLue(n));
  root.querySelectorAll('[data-saisir]').forEach(b => b.onclick = () => saisirJournee(b.dataset.saisir, b.dataset.ids.split(',')));
}

// Saisie d'une journée à partir du planning : voir journee-ui.js (plusieurs chantiers, intérimaire, journée remplacée)
const saisirJournee = (date, ids) => journeeCompagnon(date, ids);

/* ---------- Routage de l'écran Planning ---------- */
Views.planning = (params, query) => {
  if (Store.me.role === 'atelier') return Views.pointage(['planning'], query);
  if (params[0] === 'charge') return planningCharge(query);
  if (params[0] === 'gantt') return planningGantt(query);
  if (params[0] === 'tableau') return planningEquipes(query);
  if (params[0] === 'personne') return planningPersonne(query);
  return planningSemaine(query);
};
Views.planning.bind = (root, params, query) => {
  if (Store.me.role === 'atelier') return Views.pointage.bind(root, ['planning'], query);
  if (params[0] === 'charge') return bindPlanningCharge(root);
  if (params[0] === 'gantt') return bindPlanningGantt(root, query);
  if (params[0] === 'tableau') return bindPlanningEquipes(root, query);
  if (params[0] === 'personne') return bindPlanningPersonne(root, query);
  return bindPlanningSemaine(root, query);
};
