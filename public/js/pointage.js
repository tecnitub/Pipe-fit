// Pointage mobile des opérateurs (arrivée / départ par chantier) et synthèse RH pour la paie.
const TACHES = ['Préfabrication', 'Soudure', 'Montage', 'Manutention', 'Contrôles / essais', 'Déplacement', 'Études', 'Autre'];
const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const toMin = h => { const [a, b] = String(h || '0:0').split(':').map(Number); return a * 60 + (b || 0); };
// Durée en heures au quart d'heure, pause déduite (passage de minuit géré)
function dureeH(debut, fin, pause) {
  let m = toMin(fin) - toMin(debut);
  if (m < 0) m += 24 * 60;
  return Math.max(0, Math.round((m - num(pause)) / 15) / 4);
}
const tempsFields = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'userId', label: 'Personne', type: 'select', options: v => options(Store.all('users'), v, undefined, false) },
  { key: 'affaireId', label: 'Chantier', type: 'select', options: v => options(Store.all('affaires'), v, affaireLabel) },
  { key: 'tache', label: 'Tâche', datalist: TACHES },
  { key: 'debut', label: 'Arrivée', type: 'time' },
  { key: 'fin', label: 'Départ', type: 'time' },
  { key: 'pause', label: 'Pause (minutes)', type: 'number', step: '5' },
  { key: 'heures', label: 'Heures (calculées si arrivée et départ)', type: 'number', step: '0.25' },
];
const beforeSaveTemps = o => { if (o.debut && o.fin) o.heures = dureeH(o.debut, o.fin, o.pause); };

Views.pointage = (params, query) => {
  const canChoose = Store.me.role !== 'atelier';
  const uidSel = canChoose ? (query.get('pour') || Store.me.userId || (operateurs()[0] || {}).id) : Store.me.userId;
  const u = Store.get('users', uidSel);
  if (!u) return `<div class="pointage"><h1>Pointage</h1><p>Votre compte n'est relié à aucune fiche de l'équipe. Demandez à l'administrateur de le faire dans Paramètres › Comptes utilisateurs.</p></div>`;
  const today = isoDate(new Date());
  const enCours = Store.all('temps').find(t => t.userId === u.id && t.debut && !t.fin);
  const week = isoWeek(new Date());
  const semaine = Store.all('temps').filter(t => t.userId === u.id && isoWeek(new Date(t.date)) === week)
    .sort((a, b) => (b.date + (b.debut || '')).localeCompare(a.date + (a.debut || '')));
  const total = sumBy(semaine, t => num(t.heures));
  const base = num(Store.data.settings.dureeHebdo) || 35;
  const prenom = u.nom.split(' ')[0];
  const dateLongue = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const af = enCours && affaireOf(enCours.affaireId);
  return `<div class="pointage">
    <h1>Pointage</h1>
    ${canChoose ? `<div class="field"><label for="p-pour">Pointer pour</label><select id="p-pour">${options(Store.all('users'), u.id, undefined, false)}</select></div>` : ''}
    <p class="hello">Bonjour ${esc(prenom)} · ${esc(dateLongue)}</p>
    ${enCours ? `<div class="card punch running">
        <div class="label">Au travail depuis ${esc(enCours.debut)}${enCours.date !== today ? ` (le ${dateFr(enCours.date)})` : ''}</div>
        <div class="punch-site">${esc(af.code || '')} – ${esc(af.nom || 'Chantier')}</div>
        ${enCours.tache ? `<div class="muted">${esc(enCours.tache)}</div>` : ''}
        <button class="big danger" id="p-stop">Terminer</button>
        <button class="secondary" id="p-switch">Changer de chantier</button>
      </div>`
    : `<div class="card punch">
        <div class="field"><label for="p-aff">Chantier</label><select id="p-aff" class="big-select">${options(chantiersActifs(), (semaine[0] || {}).affaireId, affaireLabel, false)}</select></div>
        <div class="chips" role="radiogroup" aria-label="Tâche">${TACHES.map((t, i) => `<label class="chip"><input type="radio" name="p-tache" value="${esc(t)}" ${(semaine[0] ? semaine[0].tache === t : i === 0) ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>
        <button class="big" id="p-start" ${chantiersActifs().length ? '' : 'disabled'}>Commencer</button>
      </div>`}

    <details class="card"><summary>Saisie manuelle (oubli de pointage)</summary>
      <div class="grid2" style="margin-top:10px">
        <div class="field"><label for="m-date">Date</label><input id="m-date" type="date" value="${today}"></div>
        <div class="field"><label for="m-aff">Chantier</label><select id="m-aff">${options(Store.all('affaires'), '', affaireLabel, false)}</select></div>
        <div class="field"><label for="m-debut">Arrivée</label><input id="m-debut" type="time" value="07:30"></div>
        <div class="field"><label for="m-fin">Départ</label><input id="m-fin" type="time" value="16:30"></div>
        <div class="field"><label for="m-pause">Pause (min)</label><input id="m-pause" type="number" step="5" value="60"></div>
        <div class="field"><label for="m-tache">Tâche</label><input id="m-tache" list="m-taches" value="${esc(TACHES[0])}"><datalist id="m-taches">${TACHES.map(t => `<option value="${esc(t)}">`).join('')}</datalist></div>
      </div>
      <button id="m-save" style="margin-top:10px">Enregistrer</button>
    </details>

    <h2>Ma semaine</h2>
    <div class="card">
      <div class="week-total"><strong>${fmt(total, 2)} h</strong><span class="muted"> / ${fmt(base)} h</span>${total > base ? ` <span class="badge b-warn">+${fmt(total - base, 2)} h sup.</span>` : ''}</div>
      ${gauge(total, base)}
      <ul class="punch-list">${semaine.map(t => `<li><div><strong>${new Date(t.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</strong> · ${esc(affaireOf(t.affaireId).code || '')}<br>
        <span class="muted small">${t.debut ? `${esc(t.debut)} – ${esc(t.fin || 'en cours')}${num(t.pause) ? ` · pause ${t.pause} min` : ''}` : 'saisie manuelle'}${t.tache ? ` · ${esc(t.tache)}` : ''}</span></div>
        <div class="num"><strong>${t.fin || !t.debut ? fmt(t.heures, 2) + ' h' : '…'}</strong>${t.date === today || Store.me.role !== 'atelier' ? `<button class="icon" data-del="${t.id}" aria-label="Supprimer">✕</button>` : ''}</div></li>`).join('') || '<li class="muted">Aucun pointage cette semaine.</li>'}</ul>
    </div>
  </div>`;
};

Views.pointage.bind = (root, params, query) => {
  const canChoose = Store.me.role !== 'atelier';
  const uid = canChoose ? (query.get('pour') || Store.me.userId || (operateurs()[0] || {}).id) : Store.me.userId;
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  const pour = root.querySelector('#p-pour');
  if (pour) pour.onchange = () => { location.hash = `#/pointage?pour=${pour.value}`; };
  const enCours = Store.all('temps').find(t => t.userId === uid && t.debut && !t.fin);

  const stop = async () => {
    const fin = nowHHMM();
    const brut = dureeH(enCours.debut, fin, 0);
    let pause = 0;
    if (brut > 5) {
      const v = await askValue(`Fin à ${fin}. Durée de la pause (minutes) ?`, '60', 'number');
      if (v === null) return false;
      pause = num(v);
    }
    Object.assign(enCours, { fin, pause, heures: dureeH(enCours.debut, fin, pause) });
    Store.upsert('temps', enCours);
    App.toast(`${fmt(enCours.heures, 2)} h enregistrées`);
    return true;
  };
  on('#p-stop', async () => { if (await stop()) App.render(); });
  on('#p-switch', async () => { if (await stop()) App.render(); });
  on('#p-start', () => {
    const tache = (root.querySelector('input[name=p-tache]:checked') || {}).value || '';
    Store.upsert('temps', { userId: uid, affaireId: root.querySelector('#p-aff').value, date: isoDate(new Date()), debut: nowHHMM(), fin: '', pause: 0, heures: 0, tache });
    App.render(); App.toast('Bonne journée !');
  });
  on('#m-save', () => {
    const o = { userId: uid, date: root.querySelector('#m-date').value, affaireId: root.querySelector('#m-aff').value,
      debut: root.querySelector('#m-debut').value, fin: root.querySelector('#m-fin').value, pause: num(root.querySelector('#m-pause').value), tache: root.querySelector('#m-tache').value };
    if (!o.affaireId || !o.debut || !o.fin) { notify('Renseignez le chantier, l\'arrivée et le départ.'); return; }
    beforeSaveTemps(o);
    Store.upsert('temps', o);
    App.render(); App.toast(`${fmt(o.heures, 2)} h enregistrées`);
  });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => ask('Supprimer ce pointage ?', 'Supprimer').then(ok => {
    if (ok) { Store.remove('temps', b.dataset.del); App.render(); }
  }));
};

/* ---------------- RH : synthèse pour la paie et contrôle des pointages ---------------- */
function rhTabs(active) {
  return `<div class="tabs"><a href="#/rh" class="${active === 'paie' ? 'active' : ''}">Synthèse paie</a><a href="#/rh/pointages" class="${active === 'pointages' ? 'active' : ''}">Pointages</a></div>`;
}

Views.rh = (params, query) => {
  if (params[0] === 'pointages') return rhPointages(query);
  const mois = query.get('mois') || isoDate(new Date()).slice(0, 7);
  const s = Store.data.settings;
  const rows = Store.all('users').filter(u => u.role !== 'charge' || Store.all('temps').some(t => t.userId === u.id)).map(u => ({ u, p: Calc.paie(u.id, mois) }));
  const tot = k => sumBy(rows, r => r.p[k]);
  const libMois = new Date(mois + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return `<h1>RH</h1>${rhTabs('paie')}
  <div class="toolbar">
    <label class="inline">Mois <input id="mois" type="month" value="${esc(mois)}" style="width:auto"></label>
    <span class="spacer"></span><button class="secondary dl-btn" id="csv">Export pour la paie (CSV)</button>
  </div>
  <p class="muted">Heures pointées en ${esc(libMois)}. Heures supplémentaires calculées par semaine : au-delà de ${fmt(num(s.dureeHebdo) || 35)} h à 25 %, au-delà de ${fmt(num(s.seuilHS50) || 43)} h à 50 %. Salaire brut indicatif, hors primes, paniers et absences.</p>
  <div class="table-wrap"><table><tr><th>Salarié</th><th>Catégorie</th><th class="num">Jours</th><th class="num">Heures</th><th class="num">Normales</th><th class="num">Sup. 25 %</th><th class="num">Sup. 50 %</th><th class="num">Taux brut</th><th class="num">Brut estimé</th></tr>
  ${rows.map(({ u, p }) => `<tr class="clickable" data-u="${u.id}"><td><strong>${esc(u.nom)}</strong></td><td>${esc(moOf(u.categorieId).libelle || (u.role === 'charge' ? "Chargé d'affaires" : ''))}</td>
    <td class="num">${p.jours}</td><td class="num">${fmt(p.total, 2)}</td><td class="num">${fmt(p.normales, 2)}</td><td class="num ${p.hs25 ? 'warn-text' : ''}">${fmt(p.hs25, 2)}</td><td class="num ${p.hs50 ? 'neg' : ''}">${fmt(p.hs50, 2)}</td>
    <td class="num">${num(u.salaireHoraire) ? eur(u.salaireHoraire) : '—'}</td><td class="num">${num(u.salaireHoraire) ? eur(p.brut) : '—'}</td></tr>`).join('')}
  <tr class="subtotal"><td colspan="2">Total</td><td class="num">${tot('jours')}</td><td class="num">${fmt(tot('total'), 2)}</td><td class="num">${fmt(tot('normales'), 2)}</td><td class="num">${fmt(tot('hs25'), 2)}</td><td class="num">${fmt(tot('hs50'), 2)}</td><td></td><td class="num">${eur(tot('brut'))}</td></tr>
  </table></div>`;
};

function rhPointages(query) {
  const fu = query.get('user') || '', fa = query.get('chantier') || '', fw = query.get('semaine') || '';
  const list = Store.all('temps').filter(t => (!fu || t.userId === fu) && (!fa || t.affaireId === fa) && (!fw || isoWeek(new Date(t.date)) === fw))
    .sort((a, b) => (b.date + (b.debut || '')).localeCompare(a.date + (a.debut || ''))).slice(0, 400);
  const weeks = [...new Set(Store.all('temps').map(t => isoWeek(new Date(t.date))))].sort().reverse().slice(0, 16);
  return `<h1>RH</h1>${rhTabs('pointages')}
  <div class="toolbar">
    <button id="add">+ Pointage</button>
    <span class="spacer"></span>
    <select id="fu" style="width:auto"><option value="">Toute l'équipe</option>${options(Store.all('users'), fu, undefined, false)}</select>
    <select id="fa" style="width:auto"><option value="">Tous les chantiers</option>${options(Store.all('affaires'), fa, affaireLabel, false)}</select>
    <select id="fw" style="width:auto"><option value="">Toutes les semaines</option>${optionsStr(weeks, fw)}</select>
  </div>
  <p><strong>${fmt(sumBy(list, t => num(t.heures)), 2)} h</strong> <span class="muted">sur ${list.length} pointage(s)</span></p>
  <div class="table-wrap"><table><tr><th>Date</th><th>Personne</th><th>Chantier</th><th>Tâche</th><th>Arrivée – départ</th><th class="num">Pause</th><th class="num">Heures</th></tr>
  ${list.map(t => `<tr class="clickable" data-t="${t.id}"><td>${dateFr(t.date)}</td><td>${esc(userName(t.userId))}</td><td>${esc(affaireOf(t.affaireId).code || '')}</td><td>${esc(t.tache)}</td>
    <td>${t.debut ? `${esc(t.debut)} – ${esc(t.fin || 'en cours')}` : '<span class="muted">manuel</span>'}</td><td class="num">${num(t.pause) ? t.pause + ' min' : ''}</td><td class="num">${fmt(t.heures, 2)}</td></tr>`).join('')}
  </table></div>`;
}

Views.rh.bind = (root, params) => {
  if (params[0] === 'pointages') {
    const upd = () => { location.hash = `#/rh/pointages?user=${root.querySelector('#fu').value}&chantier=${root.querySelector('#fa').value}&semaine=${root.querySelector('#fw').value}`; };
    ['#fu', '#fa', '#fw'].forEach(s => { root.querySelector(s).onchange = upd; });
    root.querySelector('#add').onclick = () => editModal({ title: 'Nouveau pointage', col: 'temps', fields: tempsFields, beforeSave: beforeSaveTemps,
      obj: { date: isoDate(new Date()), userId: (operateurs()[0] || {}).id, pause: 60, debut: '07:30', fin: '16:30' } });
    root.querySelectorAll('tr[data-t]').forEach(tr => tr.onclick = () =>
      editModal({ title: 'Pointage', col: 'temps', fields: tempsFields, beforeSave: beforeSaveTemps, obj: { ...Store.get('temps', tr.dataset.t) } }));
    return;
  }
  root.querySelector('#mois').onchange = e => { location.hash = `#/rh?mois=${e.target.value}`; };
  const mois = root.querySelector('#mois').value;
  root.querySelectorAll('tr[data-u]').forEach(tr => tr.onclick = () => { location.hash = `#/rh/pointages?user=${tr.dataset.u}`; });
  root.querySelector('#csv').onclick = () => download(`paie-${mois}.csv`, toCSV([
    ['Salarie', 'Categorie', 'Mois', 'Jours', 'Heures', 'Normales', 'HS25', 'HS50', 'TauxBrut', 'BrutEstime'],
    ...Store.all('users').map(u => { const p = Calc.paie(u.id, mois); return [u.nom, moOf(u.categorieId).libelle || '', mois, p.jours, p.total, p.normales, p.hs25, p.hs50, u.salaireHoraire || '', p.brut.toFixed(2)]; })
      .filter(r => r[4] > 0)]), 'text/csv');
};
