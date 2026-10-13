// Pointage mobile (seul ou en équipe : un chef d'équipe pointe ses compagnons et intérimaires), paniers,
// notes de frais avec photo du justificatif, validation par le chargé d'affaires, synthèse RH et récap Excel.
const TACHES = ['Préfabrication', 'Soudure', 'Montage', 'Manutention', 'Contrôles / essais', 'Déplacement', 'Études', 'Autre'];
const CATEGORIES_FRAIS = [['Repas', 10], ['Carburant', 20], ['Péage', 20], ['Parking', 20], ['Hôtel', 10], ['Petites fournitures', 20], ['Autre', 20]];
const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const toMin = h => { const [a, b] = String(h || '0:0').split(':').map(Number); return a * 60 + (b || 0); };
// Durée en heures au quart d'heure, pause déduite (passage de minuit géré)
function dureeH(debut, fin, pause) {
  let m = toMin(fin) - toMin(debut);
  if (m < 0) m += 24 * 60;
  return Math.max(0, Math.round((m - num(pause)) / 15) / 4);
}
const equipeDe = uid => Store.all('users').filter(u => u.chefId === uid);
const enCoursDe = uid => Store.all('temps').find(t => t.userId === uid && t.debut && !t.fin);
const statutTemps = t => t.statut === 'Validé' ? '<span class="badge b-ok">Validé</span>' : t.statut === 'Refusé' ? `<span class="badge b-bad" title="${esc(t.motifRefus || '')}">Refusé</span>` : (t.debut && !t.fin) ? '<span class="badge b-info">En cours</span>' : '<span class="badge b-warn">À valider</span>';
const interimBadge = u => u.type === 'interimaire' ? `<span class="badge b-warn">Intérim${u.agenceId ? ' · ' + esc(clientName(u.agenceId)) : ''}</span>` : '';
const fileUrl = id => (window.FILE_URL ? window.FILE_URL(id) : `/api/files/${encodeURIComponent(id)}`);

const tempsFields = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'userId', label: 'Personne', type: 'select', options: v => options(Store.all('users'), v, undefined, false) },
  { key: 'affaireId', label: 'Chantier', type: 'select', options: v => options(Store.all('affaires'), v, affaireLabel) },
  { key: 'tache', label: 'Tâche', datalist: TACHES },
  { key: 'debut', label: 'Arrivée', type: 'time' },
  { key: 'fin', label: 'Départ', type: 'time' },
  { key: 'pause', label: 'Pause (minutes)', type: 'number', step: '5' },
  { key: 'heures', label: 'Heures (calculées si arrivée et départ)', type: 'number', step: '0.25' },
  { key: 'panier', label: 'Panier repas', type: 'select', options: v => `<option value="">Non</option><option value="1" ${v ? 'selected' : ''}>Oui</option>` },
];
const beforeSaveTemps = o => { if (o.debut && o.fin) o.heures = dureeH(o.debut, o.fin, o.pause); o.panier = !!o.panier && o.panier !== ''; };

// Personne pour qui l'on pointe : soi-même pour un opérateur ; au choix pour un chargé d'affaires / admin
function pointagePour(query) {
  if (Store.me.role === 'atelier') return Store.me.userId;
  return query.get('pour') || Store.me.userId || ((operateurs().find(u => equipeDe(u.id).length) || operateurs()[0]) || {}).id;
}

function pointageTabs(active, uid) {
  const q = Store.me.role === 'atelier' ? '' : `?pour=${uid}`;
  return `<div class="tabs"><a href="#/pointage${q}" class="${active === 'heures' ? 'active' : ''}">Heures</a><a href="#/pointage/frais${q}" class="${active === 'frais' ? 'active' : ''}">Notes de frais</a></div>`;
}

// Sélection des personnes en mode équipe (conservée entre deux rafraîchissements)
const equipeSel = { uid: null, ids: new Set(), filtre: 'tous' };

Views.pointage = (params, query) => {
  const uid = pointagePour(query);
  const u = Store.get('users', uid);
  if (!u) return `<div class="pointage"><h1>Pointage</h1><p>Votre compte n'est relié à aucune fiche de l'équipe. Demandez à l'administrateur de le faire dans Paramètres › Comptes utilisateurs.</p></div>`;
  if (params[0] === 'frais') return fraisView(u);
  const today = isoDate(new Date());
  const team = equipeDe(u.id);
  const week = isoWeek(new Date());
  const semaine = Store.all('temps').filter(t => t.userId === u.id && isoWeek(new Date(t.date)) === week)
    .sort((a, b) => (b.date + (b.debut || '')).localeCompare(a.date + (a.debut || '')));
  const total = sumBy(semaine, t => num(t.heures));
  const base = num(Store.data.settings.dureeHebdo) || 35;
  const dateLongue = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const dernier = semaine[0] || Store.all('temps').filter(t => t.userId === u.id).sort((a, b) => b.date.localeCompare(a.date))[0] || {};
  const choixChantier = (id, sel) => `<select id="${id}" class="big-select" aria-label="Chantier">${options(chantiersActifs(), sel, affaireLabel, false)}</select>`;
  const chips = sel => `<div class="chips" role="radiogroup" aria-label="Tâche">${TACHES.map(t => `<label class="chip"><input type="radio" name="p-tache" value="${esc(t)}" ${(sel || TACHES[0]) === t ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>`;
  const panierBox = `<label class="check"><input type="checkbox" id="p-panier" checked> Panier repas</label>`;

  let bloc;
  if (team.length) {
    // Mode chef d'équipe
    if (equipeSel.uid !== u.id) { equipeSel.uid = u.id; equipeSel.ids = new Set([u.id, ...team.map(x => x.id)]); equipeSel.filtre = 'tous'; }
    const membres = [u, ...team].filter(m => equipeSel.filtre === 'tous' || (equipeSel.filtre === 'interim' ? m.type === 'interimaire' : m.type !== 'interimaire'));
    const enCours = membres.filter(m => equipeSel.ids.has(m.id) && enCoursDe(m.id));
    const aDemarrer = membres.filter(m => equipeSel.ids.has(m.id) && !enCoursDe(m.id));
    bloc = `<div class="card punch">
      <div class="team-head"><strong>Mon équipe</strong>
        <div class="seg" role="group" aria-label="Filtrer l'équipe">${[['tous', 'Tous'], ['salaries', 'Salariés'], ['interim', 'Intérimaires']].map(([k, l]) => `<button class="${equipeSel.filtre === k ? 'on' : ''}" data-filtre="${k}">${l}</button>`).join('')}</div></div>
      <ul class="team-list">${membres.map(m => {
        const ec = enCoursDe(m.id), jour = sumBy(Store.all('temps').filter(t => t.userId === m.id && t.date === today), t => num(t.heures));
        return `<li><label><input type="checkbox" data-sel="${m.id}" ${equipeSel.ids.has(m.id) ? 'checked' : ''}> <span><strong>${esc(m.nom)}</strong>${m.id === u.id ? ' <span class="muted small">(moi)</span>' : ''} ${interimBadge(m)}<br>
          <span class="small ${ec ? 'pos' : 'muted'}">${ec ? `Au travail depuis ${esc(ec.debut)} · ${esc(affaireOf(ec.affaireId).code || '')}` : jour ? `${fmt(jour, 2)} h aujourd'hui` : 'Pas encore pointé'}</span></span></label></li>`;
      }).join('')}</ul>
      <div class="field"><label for="p-aff">Chantier</label>${choixChantier('p-aff', dernier.affaireId)}</div>
      ${chips(dernier.tache)}
      ${panierBox}
      <button class="big" id="p-start-team" ${aDemarrer.length && chantiersActifs().length ? '' : 'disabled'}>Commencer pour ${aDemarrer.length} personne${aDemarrer.length > 1 ? 's' : ''}</button>
      <button class="big danger" id="p-stop-team" ${enCours.length ? '' : 'disabled'}>Terminer pour ${enCours.length} personne${enCours.length > 1 ? 's' : ''}</button>
    </div>`;
  } else {
    const ec = enCoursDe(u.id), af = ec && affaireOf(ec.affaireId);
    bloc = ec ? `<div class="card punch running">
        <div class="label">Au travail depuis ${esc(ec.debut)}${ec.date !== today ? ` (le ${dateFr(ec.date)})` : ''}</div>
        <div class="punch-site">${esc(af.code || '')} – ${esc(af.nom || 'Chantier')}</div>
        ${ec.tache ? `<div class="muted">${esc(ec.tache)}${ec.panier ? ' · panier' : ''}</div>` : ''}
        <button class="big danger" id="p-stop">Terminer</button>
        <button class="secondary" id="p-switch">Changer de chantier</button>
      </div>`
      : `<div class="card punch">
        <div class="field"><label for="p-aff">Chantier</label>${choixChantier('p-aff', dernier.affaireId)}</div>
        ${chips(dernier.tache)}
        ${panierBox}
        <button class="big" id="p-start" ${chantiersActifs().length ? '' : 'disabled'}>Commencer</button>
      </div>`;
  }

  const pourOptions = [u, ...team];
  return `<div class="pointage">
    <h1>Pointage</h1>
    ${Store.me.role !== 'atelier' ? `<div class="field"><label for="p-pour">Pointer en tant que</label><select id="p-pour">${options(operateurs(), u.id, x => x.nom + (equipeDe(x.id).length ? ` (chef d'équipe, ${equipeDe(x.id).length} pers.)` : ''), false)}</select></div>` : ''}
    ${pointageTabs('heures', u.id)}
    <p class="hello">Bonjour ${esc(u.nom.split(' ')[0])} · ${esc(dateLongue)}</p>
    ${bloc}

    <details class="card"><summary>Saisie manuelle (oubli de pointage)</summary>
      <div class="grid2" style="margin-top:10px">
        ${team.length ? `<div class="field"><label for="m-user">Pour</label><select id="m-user">${options(pourOptions, u.id, undefined, false)}</select></div>` : ''}
        <div class="field"><label for="m-date">Date</label><input id="m-date" type="date" value="${today}"></div>
        <div class="field"><label for="m-aff">Chantier</label><select id="m-aff">${options(Store.all('affaires'), dernier.affaireId, affaireLabel, false)}</select></div>
        <div class="field"><label for="m-debut">Arrivée</label><input id="m-debut" type="time" value="07:30"></div>
        <div class="field"><label for="m-fin">Départ</label><input id="m-fin" type="time" value="16:30"></div>
        <div class="field"><label for="m-pause">Pause (min)</label><input id="m-pause" type="number" step="5" value="60"></div>
        <div class="field"><label for="m-tache">Tâche</label><input id="m-tache" list="m-taches" value="${esc(dernier.tache || TACHES[0])}"><datalist id="m-taches">${TACHES.map(t => `<option value="${esc(t)}">`).join('')}</datalist></div>
      </div>
      <label class="check"><input type="checkbox" id="m-panier" checked> Panier repas</label>
      <button id="m-save" style="margin-top:10px">Enregistrer</button>
    </details>

    <h2>Ma semaine</h2>
    <div class="card">
      <div class="week-total"><strong>${fmt(total, 2)} h</strong><span class="muted"> / ${fmt(base)} h</span>${total > base ? ` <span class="badge b-warn">+${fmt(total - base, 2)} h sup.</span>` : ''} <span class="muted small">· ${semaine.filter(t => t.panier).length} panier(s)</span></div>
      ${gauge(total, base)}
      <ul class="punch-list">${semaine.map(t => `<li><div><strong>${new Date(t.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</strong> · ${esc(affaireOf(t.affaireId).code || '')} ${statutTemps(t)}<br>
        <span class="muted small">${t.debut ? `${esc(t.debut)} – ${esc(t.fin || 'en cours')}${num(t.pause) ? ` · pause ${t.pause} min` : ''}` : 'saisie manuelle'}${t.tache ? ` · ${esc(t.tache)}` : ''}${t.panier ? ' · panier' : ''}${t.saisiPar && t.saisiPar !== t.userId ? ` · pointé par ${esc(userName(t.saisiPar))}` : ''}</span></div>
        <div class="num"><strong>${t.fin || !t.debut ? fmt(t.heures, 2) + ' h' : '…'}</strong>${t.statut !== 'Validé' ? `<button class="icon" data-del="${t.id}" aria-label="Supprimer">✕</button>` : ''}</div></li>`).join('') || '<li class="muted">Aucun pointage cette semaine.</li>'}</ul>
    </div>
    ${team.length ? `<h2>Mon équipe cette semaine</h2><div class="card"><ul class="punch-list">${team.map(m => {
      const ts = Store.all('temps').filter(t => t.userId === m.id && isoWeek(new Date(t.date)) === week);
      return `<li><div><strong>${esc(m.nom)}</strong> ${interimBadge(m)}<br><span class="muted small">${ts.filter(t => t.panier).length} panier(s) · ${ts.filter(t => !t.statut).length} pointage(s) à valider</span></div><div class="num"><strong>${fmt(sumBy(ts, t => num(t.heures)), 2)} h</strong></div></li>`;
    }).join('')}</ul></div>` : ''}
  </div>`;
};

Views.pointage.bind = (root, params, query) => {
  const uid = pointagePour(query);
  const pour = root.querySelector('#p-pour');
  if (pour) pour.onchange = () => { location.hash = `#/pointage${params[0] === 'frais' ? '/frais' : ''}?pour=${pour.value}`; };
  if (params[0] === 'frais') return bindFrais(root, uid);
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  const tache = () => (root.querySelector('input[name=p-tache]:checked') || {}).value || '';
  const panier = () => !!(root.querySelector('#p-panier') || {}).checked;
  const saisiPar = Store.me.userId || uid;
  const demarrer = ids => ids.forEach(id => Store.upsert('temps', { userId: id, affaireId: root.querySelector('#p-aff').value, date: isoDate(new Date()), debut: nowHHMM(), fin: '', pause: 0, heures: 0, tache: tache(), panier: panier(), statut: '', saisiPar }));
  // Fin de pointage : une seule question de pause pour toutes les personnes
  const terminer = async entries => {
    const fin = nowHHMM();
    let pause = 0;
    if (entries.some(e => dureeH(e.debut, fin, 0) > 5)) {
      const v = await askValue(`Fin à ${fin}. Durée de la pause (minutes) ?`, '60', 'number');
      if (v === null) return false;
      pause = num(v);
    }
    entries.forEach(e => { Object.assign(e, { fin, pause, heures: dureeH(e.debut, fin, pause) }); Store.upsert('temps', e); });
    App.toast(entries.length > 1 ? `${entries.length} pointages terminés` : `${fmt(entries[0].heures, 2)} h enregistrées`);
    return true;
  };

  on('#p-start', () => { demarrer([uid]); App.render(); App.toast('Bonne journée !'); });
  on('#p-stop', async () => { if (await terminer([enCoursDe(uid)])) App.render(); });
  on('#p-switch', async () => { if (await terminer([enCoursDe(uid)])) App.render(); });
  root.querySelectorAll('[data-filtre]').forEach(b => b.onclick = () => { equipeSel.filtre = b.dataset.filtre; App.render(); });
  root.querySelectorAll('[data-sel]').forEach(cb => cb.onchange = () => { cb.checked ? equipeSel.ids.add(cb.dataset.sel) : equipeSel.ids.delete(cb.dataset.sel); App.render(); });
  const visibles = () => [...root.querySelectorAll('[data-sel]')].filter(cb => cb.checked).map(cb => cb.dataset.sel);
  on('#p-start-team', () => {
    const ids = visibles().filter(id => !enCoursDe(id));
    demarrer(ids); App.render(); App.toast(`${ids.length} personne(s) pointée(s)`);
  });
  on('#p-stop-team', async () => {
    const entries = visibles().map(enCoursDe).filter(Boolean);
    if (entries.length && await terminer(entries)) App.render();
  });
  on('#m-save', () => {
    const userSel = root.querySelector('#m-user');
    const o = { userId: userSel ? userSel.value : uid, date: root.querySelector('#m-date').value, affaireId: root.querySelector('#m-aff').value,
      debut: root.querySelector('#m-debut').value, fin: root.querySelector('#m-fin').value, pause: num(root.querySelector('#m-pause').value),
      tache: root.querySelector('#m-tache').value, panier: root.querySelector('#m-panier').checked, statut: '', saisiPar };
    if (!o.affaireId || !o.debut || !o.fin) { notify('Renseignez le chantier, l\'arrivée et le départ.'); return; }
    o.heures = dureeH(o.debut, o.fin, o.pause);
    Store.upsert('temps', o);
    App.render(); App.toast(`${fmt(o.heures, 2)} h enregistrées`);
  });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => ask('Supprimer ce pointage ?', 'Supprimer').then(ok => {
    if (ok) { Store.remove('temps', b.dataset.del); App.render(); }
  }));
};

/* ---------------- Notes de frais (opérateur) ---------------- */
// Photo réduite à 1280 px en JPEG avant envoi (une photo de téléphone pèse plusieurs Mo)
function compressImage(file, max = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}
let fraisPhoto = null; // data URL de la photo en attente d'envoi

function fraisView(u) {
  const mes = Store.all('frais').filter(f => f.userId === u.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const dernier = Store.all('temps').filter(t => t.userId === u.id).sort((a, b) => b.date.localeCompare(a.date))[0] || {};
  return `<div class="pointage">
    <h1>Pointage</h1>
    ${Store.me.role !== 'atelier' ? `<div class="field"><label for="p-pour">Pointer en tant que</label><select id="p-pour">${options(operateurs(), u.id, undefined, false)}</select></div>` : ''}
    ${pointageTabs('frais', u.id)}
    <div class="card punch">
      <label class="photo-drop ${fraisPhoto ? 'has-photo' : ''}" for="f-photo">
        ${fraisPhoto ? `<img src="${fraisPhoto}" alt="Justificatif">` : '<span class="photo-icon" aria-hidden="true">📷</span><span>Prendre en photo le justificatif</span>'}
        <input id="f-photo" type="file" accept="image/*" capture="environment" hidden>
      </label>
      <div class="field"><label for="f-aff">Chantier</label><select id="f-aff" class="big-select">${options(Store.all('affaires').filter(a => a.statut !== 'Clos'), dernier.affaireId, affaireLabel, false)}</select></div>
      <div class="chips" role="radiogroup" aria-label="Catégorie">${CATEGORIES_FRAIS.map(([c], i) => `<label class="chip"><input type="radio" name="f-cat" value="${esc(c)}" ${i === 0 ? 'checked' : ''}><span>${esc(c)}</span></label>`).join('')}</div>
      <div class="grid2">
        <div class="field"><label for="f-montant">Montant TTC (€)</label><input id="f-montant" type="number" step="0.01" min="0" inputmode="decimal"></div>
        <div class="field"><label for="f-date">Date</label><input id="f-date" type="date" value="${isoDate(new Date())}"></div>
      </div>
      <div class="field"><label for="f-desc">Description</label><input id="f-desc" placeholder="Ex. repas équipe, péage A43…"></div>
      <button class="big" id="f-save">Envoyer la note de frais</button>
    </div>
    <h2>Mes notes de frais</h2>
    <div class="card"><ul class="punch-list">${mes.map(f => `<li><div class="frais-item">${f.photoId ? `<img class="thumb" src="${fileUrl(f.photoId)}" alt="">` : '<span class="thumb empty" aria-hidden="true"></span>'}
      <div><strong>${esc(f.categorie)}</strong> · ${esc(affaireOf(f.affaireId).code || '')} ${badge(f.statut)}<br><span class="muted small">${dateFr(f.date)}${f.description ? ' · ' + esc(f.description) : ''}</span></div></div>
      <div class="num"><strong>${eur(f.montantTTC)}</strong>${f.statut === 'Soumise' ? `<button class="icon" data-del="${f.id}" aria-label="Supprimer">✕</button>` : ''}</div></li>`).join('') || '<li class="muted">Aucune note de frais.</li>'}</ul></div>
  </div>`;
}

function bindFrais(root, uid) {
  const input = root.querySelector('#f-photo');
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try { fraisPhoto = await compressImage(file); App.render(); } catch (e) { notify('Photo illisible : réessayez.'); }
  };
  root.querySelector('#f-save').onclick = async () => {
    const montant = num(root.querySelector('#f-montant').value);
    if (!montant) { notify('Indiquez le montant TTC.'); return; }
    const cat = (root.querySelector('input[name=f-cat]:checked') || {}).value || 'Autre';
    const btn = root.querySelector('#f-save'); btn.disabled = true;
    let photoId = '';
    try { if (fraisPhoto) photoId = (await api('POST', '/api/files', { dataUrl: fraisPhoto })).id; }
    catch (e) { btn.disabled = false; notify('Envoi de la photo impossible : ' + e.message); return; }
    Store.upsert('frais', { numero: '', userId: uid, affaireId: root.querySelector('#f-aff').value, date: root.querySelector('#f-date').value, categorie: cat,
      montantTTC: montant, tauxTVA: (CATEGORIES_FRAIS.find(c => c[0] === cat) || [0, 20])[1], description: root.querySelector('#f-desc').value, photoId, statut: 'Soumise' });
    fraisPhoto = null;
    App.render(); App.toast('Note de frais envoyée au chargé d\'affaires');
  };
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => ask('Supprimer cette note de frais ?', 'Supprimer').then(ok => {
    if (ok) { Store.remove('frais', b.dataset.del); App.render(); }
  }));
}

/* ---------------- RH ---------------- */
function rhTabs(active) {
  const aValider = Store.all('temps').filter(t => !t.statut && !(t.debut && !t.fin)).length;
  const fraisAValider = Store.all('frais').filter(f => f.statut === 'Soumise').length;
  return `<div class="tabs">
    <a href="#/rh" class="${active === 'paie' ? 'active' : ''}">Synthèse paie</a>
    <a href="#/rh/validation" class="${active === 'validation' ? 'active' : ''}">Validation ${aValider ? `<span class="count">${aValider}</span>` : ''}</a>
    <a href="#/rh/frais" class="${active === 'frais' ? 'active' : ''}">Notes de frais ${fraisAValider ? `<span class="count">${fraisAValider}</span>` : ''}</a>
    <a href="#/rh/pointages" class="${active === 'pointages' ? 'active' : ''}">Tous les pointages</a>
  </div>`;
}

Views.rh = (params, query) => {
  if (params[0] === 'pointages') return rhPointages(query);
  if (params[0] === 'validation') return rhValidation(query);
  if (params[0] === 'frais') return rhFrais(query);
  const mois = query.get('mois') || isoDate(new Date()).slice(0, 7);
  const s = Store.data.settings;
  const actifs = Store.all('users').filter(u => Store.all('temps').some(t => t.userId === u.id && t.date.startsWith(mois)));
  const rows = actifs.map(u => ({ u, p: Calc.paie(u.id, mois) }));
  const sal = rows.filter(r => r.u.type !== 'interimaire'), inter = rows.filter(r => r.u.type === 'interimaire');
  const libMois = new Date(mois + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const attente = sumBy(rows, r => r.p.attente);
  const ligne = ({ u, p }, interim) => `<tr class="clickable" data-u="${u.id}"><td><strong>${esc(u.nom)}</strong>${interim ? `<br><span class="muted small">${esc(clientName(u.agenceId))}</span>` : ''}</td><td>${esc(moOf(u.categorieId).libelle || (u.role === 'charge' ? "Chargé d'affaires" : ''))}</td>
    <td class="num">${p.jours}</td><td class="num">${fmt(p.total, 2)}</td><td class="num">${fmt(p.normales, 2)}</td><td class="num ${p.hs25 ? 'warn-text' : ''}">${fmt(p.hs25, 2)}</td><td class="num ${p.hs50 ? 'neg' : ''}">${fmt(p.hs50, 2)}</td>
    <td class="num">${p.paniers}</td>${interim ? '' : `<td class="num">${eur(p.montantPaniers + p.frais)}</td><td class="num">${num(u.salaireHoraire) ? eur(p.brut) : '—'}</td>`}<td class="num ${p.attente ? 'warn-text' : 'muted'}">${p.attente ? fmt(p.attente, 2) + ' h' : '—'}</td></tr>`;
  return `<h1>RH</h1>${rhTabs('paie')}
  <div class="toolbar">
    <label class="inline">Mois <input id="mois" type="month" value="${esc(mois)}" style="width:auto"></label>
    <span class="spacer"></span><button class="dl-btn" id="xlsx">Récap Excel du mois</button>
  </div>
  ${attente ? `<p class="note">${fmt(attente, 2)} h pointées en ${esc(libMois)} ne sont pas encore validées : elles n'entrent pas dans la paie. <a href="#/rh/validation">Valider les pointages</a></p>` : ''}
  <p class="muted">Heures validées. Heures supplémentaires calculées par semaine : au-delà de ${fmt(num(s.dureeHebdo) || 35)} h à 25 %, au-delà de ${fmt(num(s.seuilHS50) || 43)} h à 50 %. Panier : ${eur(s.montantPanier)}. Salaire brut indicatif, hors primes et absences.</p>
  <h2>Salariés</h2>
  <div class="table-wrap"><table><tr><th>Salarié</th><th>Catégorie</th><th class="num">Jours</th><th class="num">Heures</th><th class="num">Normales</th><th class="num">Sup. 25 %</th><th class="num">Sup. 50 %</th><th class="num">Paniers</th><th class="num">Paniers + frais</th><th class="num">Brut estimé</th><th class="num">À valider</th></tr>
  ${sal.map(r => ligne(r, false)).join('') || '<tr><td colspan="11" class="muted">Aucune heure ce mois-ci.</td></tr>'}</table></div>
  ${inter.length ? `<h2>Intérimaires <span class="muted small">(relevé d'heures à rapprocher de la facture de l'agence)</span></h2>
  <div class="table-wrap"><table><tr><th>Intérimaire</th><th>Catégorie</th><th class="num">Jours</th><th class="num">Heures</th><th class="num">Normales</th><th class="num">Sup. 25 %</th><th class="num">Sup. 50 %</th><th class="num">Paniers</th><th class="num">À valider</th></tr>
  ${inter.map(r => ligne(r, true)).join('')}</table></div>` : ''}`;
};

/* Validation des pointages par le chargé d'affaires (ses chantiers) ou l'administrateur */
const valSel = new Set();
function rhValidation(query) {
  const tous = query.get('tous') === '1' || Store.me.role === 'admin' || !Store.me.userId;
  const mesChantiers = new Set(Store.all('affaires').filter(a => tous || a.chargeId === Store.me.userId).map(a => a.id));
  const list = Store.all('temps').filter(t => !t.statut && !(t.debut && !t.fin) && mesChantiers.has(t.affaireId))
    .sort((a, b) => (userName(a.userId) + a.date + (a.debut || '')).localeCompare(userName(b.userId) + b.date + (b.debut || '')));
  const groupes = {};
  list.forEach(t => { const k = t.userId + '|' + isoWeek(new Date(t.date)); (groupes[k] = groupes[k] || []).push(t); });
  return `<h1>RH</h1>${rhTabs('validation')}
  <p class="muted">Contrôlez les pointages ${tous ? 'de tous les chantiers' : 'de vos chantiers'} avant leur envoi en paie. Un pointage validé n'est plus modifiable par l'opérateur.</p>
  <div class="toolbar">
    <button id="v-all" class="secondary">Tout sélectionner</button>
    <button id="v-ok">Valider la sélection</button>
    <button id="v-ko" class="danger">Refuser la sélection</button>
    <span class="spacer"></span>
    ${Store.me.role === 'charge' ? `<label class="check"><input type="checkbox" id="v-tous" ${tous ? 'checked' : ''}> Tous les chantiers</label>` : ''}
  </div>
  ${list.length ? Object.entries(groupes).map(([k, ts]) => {
    const [uid, wk] = k.split('|'), u = Store.get('users', uid) || {};
    const totalSem = sumBy(Store.all('temps').filter(t => t.userId === uid && isoWeek(new Date(t.date)) === wk && t.statut !== 'Refusé'), t => num(t.heures));
    return `<div class="table-wrap val-group"><table>
      <tr class="val-head"><td colspan="8"><label><input type="checkbox" data-grp="${k}"> <strong>${esc(u.nom)}</strong> ${interimBadge(u)} · semaine ${wk.split('-W')[1]} · ${fmt(totalSem, 2)} h sur la semaine${totalSem > (num(Store.data.settings.dureeHebdo) || 35) ? ` <span class="badge b-warn">+${fmt(totalSem - (num(Store.data.settings.dureeHebdo) || 35), 2)} h sup.</span>` : ''}</label></td></tr>
      ${ts.map(t => `<tr><td><input type="checkbox" data-v="${t.id}" data-g="${k}" ${valSel.has(t.id) ? 'checked' : ''} aria-label="Sélectionner"></td><td>${new Date(t.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
        <td>${esc(affaireOf(t.affaireId).code || '')}</td><td>${esc(t.tache)}</td><td>${t.debut ? `${esc(t.debut)} – ${esc(t.fin)}` : 'manuel'}${num(t.pause) ? ` · ${t.pause} min` : ''}</td>
        <td>${t.panier ? 'Panier' : ''}</td><td class="muted small">${t.saisiPar && t.saisiPar !== t.userId ? 'par ' + esc(userName(t.saisiPar)) : ''}</td><td class="num"><strong>${fmt(t.heures, 2)} h</strong></td></tr>`).join('')}
    </table></div>`;
  }).join('') : '<p class="muted">Aucun pointage à valider.</p>'}`;
}

/* Notes de frais : contrôle du justificatif, validation, remboursement */
function rhFrais(query) {
  const fs = query.get('statut') || 'Soumise';
  const list = Store.all('frais').filter(f => !fs || f.statut === fs).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<h1>RH</h1>${rhTabs('frais')}
  <div class="toolbar"><span class="spacer"></span><select id="fs" style="width:auto"><option value="">Toutes</option>${optionsStr(['Soumise', 'Validée', 'Refusée', 'Remboursée'], fs)}</select></div>
  ${list.length ? `<div class="table-wrap"><table><tr><th>Justificatif</th><th>N°</th><th>Date</th><th>Personne</th><th>Chantier</th><th>Catégorie</th><th>Description</th><th class="num">TTC</th><th>Statut</th><th></th></tr>
  ${list.map(f => `<tr><td>${f.photoId ? `<button class="linklike" data-photo="${f.photoId}"><img class="thumb" src="${fileUrl(f.photoId)}" alt="Voir le justificatif"></button>` : '<span class="muted small">sans photo</span>'}</td>
    <td>${esc(f.numero || '')}</td><td>${dateFr(f.date)}</td><td>${esc(userName(f.userId))}</td><td>${esc(affaireOf(f.affaireId).code || '')}</td><td>${esc(f.categorie)}</td><td>${esc(f.description)}</td>
    <td class="num">${eur(f.montantTTC)}</td><td>${badge(f.statut)}</td>
    <td class="actions">${f.statut === 'Soumise' ? `<button class="small" data-st="Validée" data-f="${f.id}">Valider</button><button class="small danger" data-st="Refusée" data-f="${f.id}">Refuser</button>` : ''}${f.statut === 'Validée' ? `<button class="small secondary" data-st="Remboursée" data-f="${f.id}">Remboursée</button>` : ''}</td></tr>`).join('')}
  </table></div>` : '<p class="muted">Aucune note de frais.</p>'}`;
}

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
  <div class="table-wrap"><table><tr><th>Date</th><th>Personne</th><th>Chantier</th><th>Tâche</th><th>Arrivée – départ</th><th class="num">Pause</th><th>Panier</th><th class="num">Heures</th><th>Statut</th></tr>
  ${list.map(t => `<tr class="clickable" data-t="${t.id}"><td>${dateFr(t.date)}</td><td>${esc(userName(t.userId))}</td><td>${esc(affaireOf(t.affaireId).code || '')}</td><td>${esc(t.tache)}</td>
    <td>${t.debut ? `${esc(t.debut)} – ${esc(t.fin || 'en cours')}` : '<span class="muted">manuel</span>'}</td><td class="num">${num(t.pause) ? t.pause + ' min' : ''}</td><td>${t.panier ? 'Oui' : ''}</td><td class="num">${fmt(t.heures, 2)}</td><td>${statutTemps(t)}</td></tr>`).join('')}
  </table></div>`;
}

Views.rh.bind = (root, params) => {
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  if (params[0] === 'pointages') {
    const upd = () => { location.hash = `#/rh/pointages?user=${root.querySelector('#fu').value}&chantier=${root.querySelector('#fa').value}&semaine=${root.querySelector('#fw').value}`; };
    ['#fu', '#fa', '#fw'].forEach(s => { root.querySelector(s).onchange = upd; });
    on('#add', () => editModal({ title: 'Nouveau pointage', col: 'temps', fields: tempsFields, beforeSave: beforeSaveTemps,
      obj: { date: isoDate(new Date()), userId: (operateurs()[0] || {}).id, pause: 60, debut: '07:30', fin: '16:30', panier: '1', statut: '' } }));
    root.querySelectorAll('tr[data-t]').forEach(tr => tr.onclick = () => {
      const t = Store.get('temps', tr.dataset.t);
      editModal({ title: 'Pointage', col: 'temps', fields: tempsFields, beforeSave: beforeSaveTemps, obj: { ...t, panier: t.panier ? '1' : '' } });
    });
    return;
  }
  if (params[0] === 'validation') {
    const tous = root.querySelector('#v-tous');
    if (tous) tous.onchange = () => { location.hash = `#/rh/validation?tous=${tous.checked ? 1 : 0}`; };
    root.querySelectorAll('[data-v]').forEach(cb => cb.onchange = () => { cb.checked ? valSel.add(cb.dataset.v) : valSel.delete(cb.dataset.v); });
    root.querySelectorAll('[data-grp]').forEach(g => g.onchange = () => root.querySelectorAll(`[data-g="${g.dataset.grp}"]`).forEach(cb => { cb.checked = g.checked; cb.onchange(); }));
    on('#v-all', () => root.querySelectorAll('[data-v], [data-grp]').forEach(cb => { cb.checked = true; if (cb.dataset.v) valSel.add(cb.dataset.v); }));
    const appliquer = (statut, motif) => {
      const ids = [...valSel].filter(id => root.querySelector(`[data-v="${id}"]`));
      if (!ids.length) { notify('Sélectionnez au moins un pointage.'); return; }
      ids.forEach(id => { const t = Store.get('temps', id); if (t) Store.upsert('temps', { ...t, statut, valideBy: Store.me.nom, valideLe: isoDate(new Date()), motifRefus: motif || '' }); valSel.delete(id); });
      App.render(); App.toast(`${ids.length} pointage(s) ${statut === 'Validé' ? 'validé(s)' : 'refusé(s)'}`);
    };
    on('#v-ok', () => appliquer('Validé'));
    on('#v-ko', async () => { const m = await askValue('Motif du refus (visible par l\'opérateur)', ''); if (m !== null) appliquer('Refusé', m); });
    return;
  }
  if (params[0] === 'frais') {
    root.querySelector('#fs').onchange = e => { location.hash = `#/rh/frais?statut=${encodeURIComponent(e.target.value)}`; };
    root.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
      const f = Store.get('frais', b.dataset.f);
      Store.upsert('frais', { ...f, statut: b.dataset.st, valideBy: Store.me.nom, valideLe: isoDate(new Date()) });
      App.render(); App.toast(`Note ${f.numero || ''} : ${b.dataset.st.toLowerCase()}`);
    });
    root.querySelectorAll('[data-photo]').forEach(b => b.onclick = () => {
      const box = Modal.open(`<img src="${fileUrl(b.dataset.photo)}" alt="Justificatif" style="width:100%;border-radius:6px"><div class="modal-actions"><button id="close">Fermer</button></div>`);
      box.querySelector('#close').onclick = Modal.close;
    });
    return;
  }
  root.querySelector('#mois').onchange = e => { location.hash = `#/rh?mois=${e.target.value}`; };
  const mois = root.querySelector('#mois').value;
  root.querySelectorAll('tr[data-u]').forEach(tr => tr.onclick = () => { location.hash = `#/rh/pointages?user=${tr.dataset.u}`; });
  on('#xlsx', () => download(`recap-heures-${mois}.xlsx`, recapExcel(mois), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
};

/* Récapitulatif Excel du mois : une feuille de synthèse + une feuille détaillée par personne,
   avec le total des heures de chaque semaine et le découpage en heures supplémentaires. */
function recapExcel(mois) {
  const s = Store.data.settings;
  const libMois = new Date(mois + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const personnes = Store.all('users').filter(u => Store.all('temps').some(t => t.userId === u.id && t.date.startsWith(mois)))
    .sort((a, b) => (a.type === 'interimaire') - (b.type === 'interimaire') || a.nom.localeCompare(b.nom));
  const H = v => ({ v, s: 'head' });
  const synth = [
    [{ v: `Récapitulatif des heures – ${libMois}`, s: 'title' }],
    [{ v: `${s.societe} · heures validées · semaine de ${fmt(num(s.dureeHebdo) || 35)} h · HS 50 % au-delà de ${fmt(num(s.seuilHS50) || 43)} h · panier ${fmt(num(s.montantPanier), 2)} €`, s: 'muted' }],
    [],
    ['Nom', 'Statut', 'Agence', 'Catégorie', 'Jours', 'Heures validées', 'Normales', 'HS 25 %', 'HS 50 %', 'Paniers', 'Montant paniers', 'Notes de frais', 'Brut estimé', 'Heures à valider'].map(H),
  ];
  const sheets = [];
  personnes.forEach(u => {
    const p = Calc.paie(u.id, mois);
    const interim = u.type === 'interimaire';
    synth.push([{ v: u.nom, s: 'bold' }, interim ? 'Intérimaire' : 'Salarié', interim ? clientName(u.agenceId) : '', moOf(u.categorieId).libelle || '', p.jours, p.total, p.normales, p.hs25, p.hs50, p.paniers,
      { v: p.montantPaniers, s: 'eur' }, { v: p.frais, s: 'eur' }, interim || !num(u.salaireHoraire) ? '' : { v: p.brut, s: 'eur' }, p.attente || '']);

    // Feuille détaillée
    const rows = [
      [{ v: `${u.nom} – ${libMois}`, s: 'title' }],
      [{ v: `${interim ? `Intérimaire (${clientName(u.agenceId)})` : 'Salarié'} · ${moOf(u.categorieId).libelle || ''}${num(u.salaireHoraire) ? ` · taux brut ${fmt(u.salaireHoraire, 2)} €/h` : ''}`, s: 'muted' }],
      [],
      ['Semaine', 'Date', 'Jour', 'Chantier', 'Tâche', 'Arrivée', 'Départ', 'Pause (min)', 'Heures', 'Panier', 'Statut', 'Normales', 'HS 25 %', 'HS 50 %'].map(H),
    ];
    const entries = Store.all('temps').filter(t => t.userId === u.id && t.date.startsWith(mois)).sort((a, b) => (a.date + (a.debut || '')).localeCompare(b.date + (b.debut || '')));
    const semaines = [...new Set(entries.map(t => isoWeek(new Date(t.date))))];
    semaines.forEach(wk => {
      entries.filter(t => isoWeek(new Date(t.date)) === wk).forEach(t => {
        const a = affaireOf(t.affaireId);
        rows.push([wk.replace('-W', ' S'), dateFr(t.date), new Date(t.date).toLocaleDateString('fr-FR', { weekday: 'long' }), `${a.code || ''} ${a.nom || ''}`.trim(), t.tache || '',
          t.debut || '', t.fin || '', num(t.pause) || '', num(t.heures), t.panier ? 'Oui' : '', t.statut || 'À valider']);
      });
      const w = p.semaines[wk] || { total: 0, normales: 0, hs25: 0, hs50: 0 };
      const complete = w.semaineComplete !== undefined && Math.abs(w.semaineComplete - w.total) > 0.001 ? ` (semaine complète : ${fmt(w.semaineComplete, 2)} h)` : '';
      rows.push([{ v: `Total semaine ${wk.split('-W')[1]}${complete}`, s: 'bold' }, { v: '', s: 'total' }, { v: '', s: 'total' }, { v: '', s: 'total' }, { v: '', s: 'total' }, { v: '', s: 'total' }, { v: '', s: 'total' }, { v: '', s: 'total' },
        { v: w.total, s: 'total' }, { v: '', s: 'total' }, { v: 'validées', s: 'total' }, { v: w.normales, s: 'total' }, { v: w.hs25, s: 'total' }, { v: w.hs50, s: 'total' }]);
      rows.push([]);
    });
    rows.push([{ v: 'Total du mois (heures validées)', s: 'bold' }, '', '', '', '', '', '', '', { v: p.total, s: 'boldnum' }, '', '', { v: p.normales, s: 'boldnum' }, { v: p.hs25, s: 'boldnum' }, { v: p.hs50, s: 'boldnum' }]);
    rows.push(['Jours travaillés', p.jours]);
    rows.push(['Paniers repas', p.paniers, { v: p.montantPaniers, s: 'eur' }]);
    rows.push(['Notes de frais validées (TTC)', '', { v: p.frais, s: 'eur' }]);
    if (!interim && num(u.salaireHoraire)) rows.push(['Salaire brut estimé', '', { v: p.brut, s: 'boldeur' }]);
    if (p.attente) rows.push([{ v: `Attention : ${fmt(p.attente, 2)} h pointées ne sont pas encore validées et ne sont pas comptées.`, s: 'muted' }]);
    sheets.push({ name: u.nom, cols: [16, 11, 11, 34, 16, 8, 8, 10, 9, 8, 10, 10, 9, 9], freeze: 4, rows });
  });
  // Notes de frais du mois
  const frais = Store.all('frais').filter(f => (f.date || '').startsWith(mois)).sort((a, b) => a.date.localeCompare(b.date));
  const fraisRows = [[{ v: `Notes de frais – ${libMois}`, s: 'title' }], [], ['N°', 'Date', 'Personne', 'Chantier', 'Catégorie', 'Description', 'TTC', 'TVA %', 'HT', 'Statut'].map(H),
    ...frais.map(f => [f.numero || '', dateFr(f.date), userName(f.userId), affaireOf(f.affaireId).code || '', f.categorie, f.description || '', { v: num(f.montantTTC), s: 'eur' }, num(f.tauxTVA), { v: Calc.fraisHT(f), s: 'eur' }, f.statut])];
  return XLSX.build([{ name: 'Synthèse', cols: [22, 12, 22, 22, 7, 14, 10, 9, 9, 8, 14, 14, 13, 14], freeze: 4, rows: synth }, ...sheets, { name: 'Notes de frais', cols: [14, 11, 18, 14, 16, 34, 11, 7, 11, 12], freeze: 3, rows: fraisRows }]);
}
