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
  return `<div class="tabs"><a href="#/pointage${q}" class="${active === 'heures' ? 'active' : ''}">Heures</a><a href="#/pointage/planning${q}" class="${active === 'planning' ? 'active' : ''}">Planning</a><a href="#/pointage/chantiers${q}" class="${active === 'chantiers' ? 'active' : ''}">Chantiers</a><a href="#/pointage/rapports${q}" class="${active === 'rapports' ? 'active' : ''}">Rapports</a><a href="#/pointage/frais${q}" class="${active === 'frais' ? 'active' : ''}">Notes de frais</a></div>`;
}

// Sélection des personnes en mode équipe (conservée entre deux rafraîchissements)
const equipeSel = { uid: null, ids: new Set(), filtre: 'tous' };

/* ---------------- Chantier du pointage : prévus, hors devis, autres ; nouvelle intervention hors devis ---------------- */
const NOUVELLE_HD = '__hd';
let chantierChoisi = null; // intervention qui vient d'être ouverte : proposée pour pointer
function optionsChantiers(uid, date, sel) {
  const actifs = chantiersActifs(), prevus = new Set(planJour(uid, date).map(p => p.affaireId));
  const garde = Store.get('affaires', sel); // chantier d'un pointage existant, même clos
  const opt = a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(affaireLabel(a))}</option>`;
  const groupe = (lib, l) => (l.length ? `<optgroup label="${esc(lib)}">${l.map(opt).join('')}</optgroup>` : '');
  return groupe('Prévu au planning', actifs.filter(a => prevus.has(a.id)))
    + groupe('Interventions hors devis (dépannage, régie)', actifs.filter(a => estHorsDevis(a) && !prevus.has(a.id)))
    + groupe('Autres chantiers', actifs.filter(a => !estHorsDevis(a) && !prevus.has(a.id)))
    + (garde && !actifs.includes(garde) ? opt(garde) : '')
    + `<option value="${NOUVELLE_HD}">➕ Nouvelle intervention hors devis…</option>`;
}
// Choix « nouvelle intervention » dans une liste de chantiers : ouvre le formulaire, puis sélectionne l'intervention créée
function brancherNouvelleHD(select, apres) {
  let avant = select.value === NOUVELLE_HD ? '' : select.value;
  select.addEventListener('change', () => {
    if (select.value !== NOUVELLE_HD) { avant = select.value; return; }
    select.value = avant;
    nouvelleHDCompagnon(a => { if (apres) apres(a); else { select.insertAdjacentHTML('afterbegin', `<option value="${a.id}">${esc(affaireLabel(a))}</option>`); select.value = a.id; avant = a.id; } });
  });
}
// Dépannage non planifié : le compagnon ouvre l'intervention, le bureau complète (client, site, chargé d'affaires) et facture
function nouvelleHDCompagnon(fait) {
  const clients = clientsList().filter(c => c.nom);
  const box = Modal.open(`<h2 style="margin-top:0">🛠️ Nouvelle intervention hors devis</h2>
    <p class="muted small">Dépannage ou travaux demandés sur place, sans planning ni devis. Le bureau complète ensuite le dossier.</p>
    <div class="field"><label for="hd-nom">Objet de l'intervention</label><input id="hd-nom" placeholder="Ex. fuite vapeur ligne 3, remplacement vanne DN80…"></div>
    <div class="field"><label for="hd-client">Client</label><select id="hd-client"><option value="">${clients.length ? 'Choisir…' : '—'}</option>${clients.map(c => `<option value="${c.id}">${esc(c.nom)}</option>`).join('')}<option value="autre">Autre / pas dans la liste</option></select></div>
    <div class="field" id="hd-libre-f" ${clients.length ? 'hidden' : ''}><label for="hd-libre">Nom du client</label><input id="hd-libre" placeholder="Société et nom du demandeur"></div>
    <div class="field"><label for="hd-lieu">Lieu (site, bâtiment, machine)</label><input id="hd-lieu"></div>
    <div class="field"><label for="hd-demande">Demande du client</label><textarea id="hd-demande" rows="3" placeholder="Ce qui a été demandé, par qui"></textarea></div>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="hd-x">Annuler</button><button id="hd-ok">Ouvrir l'intervention</button></div>`);
  const $ = s => box.querySelector(s);
  $('#hd-client').onchange = () => { $('#hd-libre-f').hidden = $('#hd-client').value !== 'autre' && clients.length > 0; };
  $('#hd-x').onclick = Modal.close;
  $('#hd-ok').onclick = async () => {
    const client = $('#hd-client').value;
    const o = { type: 'horsDevis', code: '', statut: 'Ouvert', nom: $('#hd-nom').value.trim(), clientId: client && client !== 'autre' ? client : '', clientLibre: client && client !== 'autre' ? '' : $('#hd-libre').value.trim(),
      lieu: $('#hd-lieu').value.trim(), demande: $('#hd-demande').value.trim(), dateCreation: isoDate(new Date()), heuresPrevues: 0, rex: {} };
    if (!o.nom) return notify('Indiquez l\'objet de l\'intervention.');
    if (!o.clientId && !o.clientLibre) return notify('Indiquez le client.');
    if (Store.me.role !== 'atelier') o.chargeId = Store.me.userId || '';
    const a = Store.upsert('affaires', o);
    $('#hd-ok').disabled = true;
    const rec = await Store.attendre('affaires', a.id);
    Modal.close();
    if (!rec || !Store.get('affaires', a.id)) return notify('Intervention non enregistrée : réessayez.');
    App.toast(`Intervention ${rec.code || ''} ouverte : le bureau est prévenu`);
    fait(rec);
  };
  setTimeout(() => $('#hd-nom').focus(), 50);
}

/* ---------------- Ma semaine : chaque jour de la semaine en cours, pour rattraper un oubli ---------------- */
const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
function semaineCompagnon(u) {
  const auj = isoDate(new Date()), jours = ReglesPointage.joursSemaine(auj);
  const ts = Store.all('temps').filter(t => t.userId === u.id && jours.includes(t.date));
  const total = sumBy(ts, t => num(t.heures)), base = num(Store.data.settings.dureeHebdo) || 35;
  const cartes = jours.map((d, i) => {
    const reel = ts.filter(t => t.date === d).sort((a, b) => (a.debut || '').localeCompare(b.debut || ''));
    if (i === 6 && !reel.length) return '';
    const plan = planJour(u.id, d), abs = absenceJour(u.id, d), futur = d > auj, h = sumBy(reel, t => num(t.heures));
    const oubli = !futur && d < auj && !reel.length && !abs && (plan.length || i < 5);
    const etat = abs ? `<span class="badge b-info">${esc(ICONES_ABSENCE[abs.absence] || '')} ${esc(abs.absence)}</span>` : oubli ? '<span class="badge b-warn">Oubli ?</span>' : d === auj ? '<span class="badge b-info">Aujourd\'hui</span>' : '';
    return `<div class="jour-p ${futur ? 'futur' : ''} ${oubli ? 'oubli' : ''}">
      <div class="jour-tete"><strong>${JOURS_SEMAINE[i]} ${jourDe(d).getDate()}</strong> ${etat}<span class="spacer"></span>${reel.length ? `<strong>${fmt(h, 2)} h</strong>` : ''}</div>
      ${plan.length ? `<div class="small muted">Prévu : ${plan.map(p => `${esc(affaireOf(p.affaireId).code || '')} ${p.heuresPrevues ? `· ${fmt(p.heuresPrevues, 2)} h` : ''}`).join(' + ')}</div>` : ''}
      ${reel.map(t => { const bloque = t.statut === 'Validé';
        return `<button class="ligne-t" ${bloque ? 'disabled' : `data-edit="${t.id}"`}><span>${t.debut ? `${esc(t.debut)} – ${esc(t.fin || 'en cours')}` : 'saisie'} · <strong>${esc(affaireOf(t.affaireId).code || '?')}</strong>${t.tache ? ` · ${esc(t.tache)}` : ''}${t.panier ? ' · panier' : ''} ${statutTemps(t)}</span><span>${t.fin || !t.debut ? `${fmt(t.heures, 2)} h` : '…'}${bloque ? '' : ' ✎'}</span></button>`; }).join('')}
      ${futur ? '' : `<div class="jour-actions"><button class="secondary small" data-ajout="${d}">+ Pointer</button>${plan.length && !reel.length && !abs ? `<button class="small" data-prevu="${d}">Comme prévu</button>` : ''}</div>`}
    </div>`;
  }).join('');
  return `<h2>Ma semaine</h2>
    <div class="card">
      <div class="week-total"><strong>${fmt(total, 2)} h</strong><span class="muted"> / ${fmt(base)} h</span>${total > base ? ` <span class="badge b-warn">+${fmt(total - base, 2)} h sup.</span>` : ''} <span class="muted small">· ${ts.filter(t => t.panier).length} panier(s)</span></div>
      ${gauge(total, base)}
      <p class="small muted">Un oubli ? Touchez le jour pour pointer, ou un pointage pour le corriger (semaine en cours ; avant, voyez le bureau).</p>
      <div class="semaine-p">${cartes}</div>
    </div>`;
}
// Ajout ou correction d'un pointage d'un jour de la semaine
function editerPointage({ t, date, uid, pour }) {
  const d = t ? t.date : date, enCours = t && t.debut && !t.fin, src = t || {};
  const prevu = planJour(uid, d)[0] || {};
  const v = { affaireId: src.affaireId || prevu.affaireId || '', tache: src.tache || prevu.tache || TACHES[0], debut: src.debut || prevu.debut || '07:30', fin: t ? src.fin || '' : prevu.fin || '16:30', pause: src.pause ?? 60, panier: t ? !!src.panier : true };
  const box = Modal.open(`<h2 style="margin-top:0">${t ? 'Corriger le pointage' : 'Pointer'} · ${esc(jourLong(d))}</h2>
    ${!t && pour.length > 1 ? `<div class="field"><label for="ep-user">Pour</label><select id="ep-user">${options(pour, uid, undefined, false)}</select></div>` : ''}
    <div class="field"><label for="ep-aff">Chantier</label><select id="ep-aff">${optionsChantiers(uid, d, v.affaireId)}</select></div>
    <div class="grid2">
      <div class="field"><label for="ep-tache">Tâche</label><input id="ep-tache" list="ep-taches" value="${esc(v.tache)}"><datalist id="ep-taches">${TACHES.map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
      <div class="field"><label for="ep-pause">Pause (min)</label><input id="ep-pause" type="number" step="5" min="0" value="${esc(v.pause)}"></div>
      <div class="field"><label for="ep-debut">Arrivée</label><input id="ep-debut" type="time" value="${esc(v.debut)}"></div>
      <div class="field"><label for="ep-fin">Départ</label><input id="ep-fin" type="time" value="${esc(v.fin)}">${enCours ? '<span class="small muted">vide = toujours en cours</span>' : ''}</div>
    </div>
    <label class="check"><input type="checkbox" id="ep-panier" ${v.panier ? 'checked' : ''}> Panier repas</label>
    <p id="ep-h" class="week-total"></p>
    <div class="modal-actions">${t ? '<button class="danger" id="ep-del">Supprimer</button>' : ''}<span style="flex:1"></span><button class="secondary" id="ep-x">Annuler</button><button id="ep-ok">Enregistrer</button></div>`);
  const $ = s => box.querySelector(s);
  const maj = () => { $('#ep-h').innerHTML = $('#ep-fin').value ? `<strong>${fmt(dureeH($('#ep-debut').value, $('#ep-fin').value, $('#ep-pause').value), 2)} h</strong>` : '<span class="muted small">en cours</span>'; };
  ['#ep-debut', '#ep-fin', '#ep-pause'].forEach(s => { $(s).oninput = maj; }); maj();
  brancherNouvelleHD($('#ep-aff'));
  $('#ep-x').onclick = Modal.close;
  if (t) $('#ep-del').onclick = () => { Modal.close(); ask('Supprimer ce pointage ?', 'Supprimer').then(ok => { if (ok) { Store.remove('temps', t.id); App.render(); } }); };
  $('#ep-ok').onclick = async () => {
    const o = { ...src, userId: t ? t.userId : ($('#ep-user') || {}).value || uid, date: d, affaireId: $('#ep-aff').value, tache: $('#ep-tache').value, debut: $('#ep-debut').value, fin: $('#ep-fin').value,
      pause: num($('#ep-pause').value), panier: $('#ep-panier').checked, statut: t && t.statut === 'Refusé' ? '' : src.statut || '', saisiPar: Store.me.userId || uid };
    if (!o.affaireId || o.affaireId === NOUVELLE_HD || !o.debut) return notify('Renseignez le chantier et l\'heure d\'arrivée.');
    if (!o.fin && !(enCours && d === isoDate(new Date()))) return notify('Renseignez l\'heure de départ.');
    o.heures = o.fin ? dureeH(o.debut, o.fin, o.pause) : 0;
    // Deux pointages qui se chevauchent le même jour : sans doute un doublon
    const fin = x => (x.fin ? toMin(x.fin) + (toMin(x.fin) < toMin(x.debut) ? 1440 : 0) : 1440);
    const chevauche = Store.all('temps').find(x => x.id !== o.id && x.userId === o.userId && x.date === d && x.debut && toMin(x.debut) < fin(o) && toMin(o.debut) < fin(x));
    if (chevauche && !(await ask(`Ce pointage chevauche celui de ${chevauche.debut} – ${chevauche.fin || 'en cours'} (${affaireOf(chevauche.affaireId).code || ''}). Enregistrer quand même ?`, 'Enregistrer', false))) return;
    Store.upsert('temps', o);
    Modal.close(); App.render(); App.toast(o.fin ? `${fmt(o.heures, 2)} h enregistrées le ${dateFr(d)}` : 'Pointage mis à jour');
  };
}

Views.pointage = (params, query) => {
  const uid = pointagePour(query);
  const u = Store.get('users', uid);
  if (!u) return `<div class="pointage"><h1>Pointage</h1><p>Votre compte n'est relié à aucune fiche de l'équipe. Demandez à l'administrateur de le faire dans Paramètres › Comptes utilisateurs.</p></div>`;
  if (params[0] === 'frais') return fraisView(u);
  if (params[0] === 'rapports') return rapportsView(u);
  if (params[0] === 'planning') return planningMobile(u, query);
  if (params[0] === 'chantiers') return chantiersCompagnon(u);
  if (params[0] === 'chantier') return ficheChantierCompagnon(u, params[1]);
  const today = isoDate(new Date());
  const team = equipeDe(u.id);
  const week = isoWeek(new Date());
  const semaine = Store.all('temps').filter(t => t.userId === u.id && isoWeek(new Date(t.date)) === week)
    .sort((a, b) => (b.date + (b.debut || '')).localeCompare(a.date + (a.debut || '')));
  const dateLongue = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const prevu = planJour(u.id, today);
  // Chantier et tâche proposés : ceux du planning du jour, sinon ceux du dernier pointage
  const dernier = prevu[0] || semaine[0] || Store.all('temps').filter(t => t.userId === u.id).sort((a, b) => b.date.localeCompare(a.date))[0] || {};
  const choixChantier = (id, sel) => `<select id="${id}" class="big-select" aria-label="Chantier">${optionsChantiers(u.id, today, Store.get('affaires', chantierChoisi) ? chantierChoisi : sel)}</select>`;
  // Pas de planning aujourd'hui : dépannage possible sur une intervention hors devis
  const sansPlanning = !prevu.length && !absenceJour(u.id, today) ? `<p class="hd-astuce small">📅 Rien de prévu aujourd'hui. Dépannage ou travaux demandés sur place ? Choisissez l'intervention hors devis, ou <button class="linklike small" id="p-hd">ouvrez-en une nouvelle</button>.</p>` : '';
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
      ${sansPlanning}
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
 ${sansPlanning}
        <div class="field"><label for="p-aff">Chantier</label>${choixChantier('p-aff', dernier.affaireId)}</div>
        ${chips(dernier.tache)}
        ${panierBox}
        <button class="big" id="p-start" ${chantiersActifs().length ? '' : 'disabled'}>Commencer</button>
      </div>`;
  }

  return `<div class="pointage">
    <h1>Pointage</h1>
    ${Store.me.role !== 'atelier' ? `<div class="field"><label for="p-pour">Pointer en tant que</label><select id="p-pour">${options(operateurs(), u.id, x => x.nom + (equipeDe(x.id).length ? ` (chef d'équipe, ${equipeDe(x.id).length} pers.)` : ''), false)}</select></div>` : ''}
    ${pointageTabs('heures', u.id)}
    <p class="hello">Bonjour ${esc(u.nom.split(' ')[0])} · ${esc(dateLongue)}</p>
    ${prevu.length ? `<div class="card pl-aujourdhui"><div class="label">Prévu aujourd'hui</div>
      ${prevu.map(p => `<div>${puceChantier(affaireOf(p.affaireId), affaireLabel(affaireOf(p.affaireId)))} <span class="small">${esc(p.tache || '')}${p.debut ? ` · ${esc(p.debut)} – ${esc(p.fin || '')}` : ''} · ${fmt(p.heuresPrevues, 2)} h</span>${p.note ? `<div class="small pl-note">${esc(p.note)}</div>` : ''}</div>`).join('')}
      ${!reelJour(u.id, today).length ? '<button class="secondary" id="p-journee">Saisir ma journée comme prévu (heures modifiables)</button>' : ''}
      <a class="small" href="#/pointage/planning${Store.me.role === 'atelier' ? '' : `?pour=${u.id}`}">Voir mon planning</a></div>` : ''}
    ${bloc}

    ${semaineCompagnon(u)}
    ${team.length ? `<h2>Mon équipe cette semaine</h2><div class="card"><ul class="punch-list">${team.map(m => {
      const ts = Store.all('temps').filter(t => t.userId === m.id && isoWeek(new Date(t.date)) === week);
      return `<li><div><strong>${esc(m.nom)}</strong> ${interimBadge(m)}<br><span class="muted small">${ts.filter(t => t.panier).length} panier(s) · ${ts.filter(t => !t.statut).length} pointage(s) à valider</span></div><div class="num"><strong>${fmt(sumBy(ts, t => num(t.heures)), 2)} h</strong></div></li>`;
    }).join('')}</ul></div>` : ''}
  </div>`;
};

Views.pointage.bind = (root, params, query) => {
  const uid = pointagePour(query);
  const pour = root.querySelector('#p-pour');
  if (pour) pour.onchange = () => { location.hash = `#/pointage${params[0] ? '/' + params[0] : ''}?pour=${pour.value}`; };
  if (params[0] === 'frais') return bindFrais(root, uid);
  if (params[0] === 'rapports') return bindRapports(root, uid);
  if (params[0] === 'planning') return bindPlanningMobile(root, uid);
  if (params[0] === 'chantier') return bindFicheChantierCompagnon(root, params[1]);
  if (params[0] === 'chantiers') return;
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
  on('#p-journee', () => saisirJournee(isoDate(new Date()), [uid]));
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
  // Chantier : « nouvelle intervention hors devis » ouvre le formulaire
  const aff = root.querySelector('#p-aff');
  const choisie = a => { chantierChoisi = a.id; App.render(); };
  if (aff) brancherNouvelleHD(aff, choisie);
  on('#p-hd', () => nouvelleHDCompagnon(choisie));
  // Semaine en cours : pointer un jour oublié, corriger un pointage, saisir un jour comme prévu
  const equipe = [Store.get('users', uid), ...equipeDe(uid)].filter(Boolean);
  root.querySelectorAll('[data-ajout]').forEach(b => b.onclick = () => editerPointage({ date: b.dataset.ajout, uid, pour: equipe }));
  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editerPointage({ t: Store.get('temps', b.dataset.edit), uid, pour: equipe }));
  root.querySelectorAll('[data-prevu]').forEach(b => b.onclick = () => saisirJournee(b.dataset.prevu, [uid]));

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
// Note en cours de saisie (gardée quand l'écran se redessine) : photo, champs, convives, lecture du ticket
let fraisB = null;
const tvaCategorie = cat => (CATEGORIES_FRAIS.find(c => c[0] === cat) || [0, 20])[1];
function brouillonFrais(u, affaireId) {
  if (!fraisB || fraisB.userId !== u.id) {
    fraisB = { userId: u.id, affaireId: affaireId || '', categorie: CATEGORIES_FRAIS[0][0], montantTTC: '', tauxTVA: tvaCategorie(CATEGORIES_FRAIS[0][0]), date: isoDate(new Date()),
      description: '', convives: [{ nom: u.nom, userId: u.id }], photo: null, ocr: null, lus: {}, saisis: {}, jeton: 0 };
  }
  return fraisB;
}
// Collègues proposés pour un repas : affectés au même chantier cette semaine-là (planning), puis les autres
function collegues(b) {
  const sem = isoWeek(jourDe(b.date || isoDate(new Date())));
  const planifies = new Set(Store.all('planning').filter(p => p.affaireId === b.affaireId && !p.absence && (p.date === b.date || semaineDe(p) === sem)).map(p => p.userId));
  const tous = Store.all('users').filter(x => x.id !== b.userId && !x.archive);
  return { equipe: tous.filter(x => planifies.has(x.id)), autres: tous.filter(x => !planifies.has(x.id)) };
}
const LIBELLES_LUS = { montantTTC: 'montant', date: 'date', tauxTVA: 'TVA', categorie: 'catégorie', description: 'enseigne' };
const lu = (b, k) => (b.lus[k] ? ' <span class="badge b-info lu" title="Lu sur le ticket : vérifiez">lu sur le ticket</span>' : '');

function fraisView(u) {
  const mes = Store.all('frais').filter(f => f.userId === u.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const dernier = Store.all('temps').filter(t => t.userId === u.id).sort((a, b) => b.date.localeCompare(a.date))[0] || {};
  const b = brouillonFrais(u, dernier.affaireId), o = b.ocr, repas = NoteFrais.convivesRequis(b);
  const { equipe, autres } = repas ? collegues(b) : { equipe: [], autres: [] };
  const internes = new Set(b.convives.filter(c => c.userId).map(c => c.userId));
  const proposes = [u, ...equipe, ...autres.filter(x => internes.has(x.id))];
  const externes = b.convives.map((c, i) => ({ c, i })).filter(x => !x.c.userId);
  const nb = NoteFrais.nomsConvives(b).length;
  return `<div class="pointage">
    <h1>Pointage</h1>
    ${Store.me.role !== 'atelier' ? `<div class="field"><label for="p-pour">Pointer en tant que</label><select id="p-pour">${options(operateurs(), u.id, undefined, false)}</select></div>` : ''}
    ${pointageTabs('frais', u.id)}
    <div class="card punch">
      <label class="photo-drop ${b.photo ? 'has-photo' : ''}" for="f-photo">
        ${b.photo ? `<img src="${b.photo}" alt="Justificatif">` : '<span class="photo-icon" aria-hidden="true">📷</span><span>Prendre en photo le ticket</span><span class="small">montant, date et TVA sont lus automatiquement</span>'}
        <input id="f-photo" type="file" accept="image/*" capture="environment" hidden>
      </label>
      ${o && o.etat === 'lecture' ? `<div class="ocr-etat"><span>🔍 Lecture du ticket…</span><div class="ocr-barre"><span id="ocr-prog" style="width:${Math.round((o.p || 0) * 100)}%"></span></div></div>` : ''}
      ${o && o.etat === 'ok' ? `<div class="ocr-etat ${Object.keys(b.lus).length ? 'ok' : 'warn'}">${Object.keys(b.lus).length ? `✓ Lu sur le ticket : ${Object.keys(b.lus).map(k => LIBELLES_LUS[k]).join(', ')}. Vérifiez avant d'envoyer.` : 'Ticket peu lisible : saisissez le montant (ou reprenez la photo bien à plat, sans reflet).'}</div>` : ''}
      ${o && o.etat === 'echec' ? `<div class="ocr-etat warn">Lecture automatique indisponible (${esc(o.msg)}) : saisissez le montant.</div>` : ''}
      <div class="field"><label for="f-aff">Chantier</label><select id="f-aff" class="big-select">${options(Store.all('affaires').filter(a => a.statut !== 'Clos'), b.affaireId, affaireLabel, false)}</select></div>
      <div class="chips" role="radiogroup" aria-label="Catégorie">${CATEGORIES_FRAIS.map(([c]) => `<label class="chip"><input type="radio" name="f-cat" value="${esc(c)}" ${c === b.categorie ? 'checked' : ''}><span>${c === 'Repas' ? 'Restaurant' : esc(c)}</span></label>`).join('')}</div>
      ${repas ? `<fieldset class="convives ${nb ? '' : 'manque'}"><legend>Personnes présentes au repas <span class="req">obligatoire</span></legend>
        <div class="chips">${proposes.map(x => `<label class="chip"><input type="checkbox" data-conv="${x.id}" ${internes.has(x.id) ? 'checked' : ''}><span>${esc(x.nom)}</span></label>`).join('')}</div>
        ${externes.map(({ c, i }) => `<div class="conv-ext"><input data-ext-nom="${i}" value="${esc(c.nom)}" placeholder="Nom et prénom" aria-label="Nom de l'invité"><input data-ext-soc="${i}" value="${esc(c.societe || '')}" placeholder="Société" aria-label="Société de l'invité"><button class="icon" data-ext-del="${i}" aria-label="Retirer">✕</button></div>`).join('')}
        <div class="conv-actions">${autres.filter(x => !internes.has(x.id)).length ? `<select id="conv-coll" aria-label="Ajouter un collègue"><option value="">+ Un collègue…</option>${autres.filter(x => !internes.has(x.id)).map(x => `<option value="${x.id}">${esc(x.nom)}</option>`).join('')}</select>` : ''}
          <button class="secondary small" id="conv-ext">+ Un invité (client, fournisseur…)</button></div>
        <p class="small ${b.couverts && b.couverts !== nb ? 'warn-text' : 'muted'}">${nb} personne${nb > 1 ? 's' : ''}${b.couverts ? ` · le ticket indique ${b.couverts} couvert${b.couverts > 1 ? 's' : ''}` : ''}</p></fieldset>` : ''}
      <div class="grid2">
        <div class="field"><label for="f-montant">Montant TTC (€)${lu(b, 'montantTTC')}</label><input id="f-montant" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(b.montantTTC)}"></div>
        <div class="field"><label for="f-date">Date${lu(b, 'date')}</label><input id="f-date" type="date" value="${esc(b.date)}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="f-desc">Description${lu(b, 'description')}</label><input id="f-desc" value="${esc(b.description)}" placeholder="${repas ? 'Ex. restaurant, motif du repas' : 'Ex. péage A43, plein camionnette…'}"></div>
        <div class="field"><label for="f-tva">TVA${lu(b, 'tauxTVA')}</label><select id="f-tva">${[20, 10, 5.5, 0].map(t => `<option value="${t}" ${Number(b.tauxTVA) === t ? 'selected' : ''}>${String(t).replace('.', ',')} %</option>`).join('')}</select></div>
      </div>
      <button class="big" id="f-save">Envoyer la note de frais</button>
      ${b.photo || b.montantTTC ? '<button class="linklike small" id="f-raz">Effacer et recommencer</button>' : ''}
    </div>
    <h2>Mes notes de frais</h2>
    <div class="card"><ul class="punch-list">${mes.map(f => `<li><div class="frais-item">${f.photoId ? `<img class="thumb" src="${fileUrl(f.photoId)}" alt="">` : '<span class="thumb empty" aria-hidden="true"></span>'}
      <div><strong>${f.categorie === 'Repas' ? 'Restaurant' : esc(f.categorie)}</strong> · ${esc(affaireOf(f.affaireId).code || '')} ${badge(f.statut)}<br><span class="muted small">${dateFr(f.date)}${f.description ? ' · ' + esc(f.description) : ''}</span>
      ${f.convives && f.convives.length ? `<br><span class="small">👥 ${esc(NoteFrais.libelleConvives(f))}</span>` : ''}</div></div>
      <div class="num"><strong>${eur(f.montantTTC)}</strong>${f.statut === 'Soumise' ? `<button class="icon" data-del="${f.id}" aria-label="Supprimer">✕</button>` : ''}</div></li>`).join('') || '<li class="muted">Aucune note de frais.</li>'}</ul></div>
  </div>`;
}

// Reprend les valeurs lues sur le ticket, sans écraser ce que la personne a déjà saisi
function appliquerTicket(b, r) {
  const met = (k, v) => { if (v !== null && v !== undefined && v !== '' && !b.saisis[k]) { b[k] = v; b.lus[k] = true; } };
  met('montantTTC', r.montantTTC ? r.montantTTC.toFixed(2) : '');
  met('date', r.date);
  if (r.categorie && !b.saisis.categorie) { b.categorie = r.categorie; b.lus.categorie = true; if (!b.saisis.tauxTVA) b.tauxTVA = tvaCategorie(r.categorie); }
  met('tauxTVA', r.tauxTVA);
  met('description', r.enseigne);
  // Description déjà saisie : l'enseigne lue est ajoutée devant (« Le Bistrot du Port — réunion de chantier »)
  if (r.enseigne && b.saisis.description && b.description && !b.description.toLowerCase().includes(r.enseigne.toLowerCase())) b.description = `${r.enseigne} — ${b.description}`;
  b.montantTVA = r.montantTVA || null;
  b.couverts = r.couverts || null;
  b.ticketLu = { montantTTC: r.montantTTC || null, date: r.date || '', couverts: r.couverts || null };
}

function bindFrais(root, uid) {
  const b = fraisB;
  const input = root.querySelector('#f-photo');
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const jeton = ++b.jeton;
    try { b.photo = await compressImage(file); } catch (e) { notify('Photo illisible : réessayez.'); return; }
    b.ocr = { etat: 'lecture', p: 0 }; b.lus = {};
    App.render();
    try {
      const texte = await OCR.lire(await compressImage(file, 2000, 0.92), p => { b.ocr.p = p; const e = document.getElementById('ocr-prog'); if (e) e.style.width = `${Math.round(p * 100)}%`; });
      if (jeton !== b.jeton || fraisB !== b) return;
      appliquerTicket(b, NoteFrais.analyserTicket(texte, isoDate(new Date())));
      b.ocr = { etat: 'ok' };
    } catch (e) {
      if (jeton !== b.jeton || fraisB !== b) return;
      b.ocr = { etat: 'echec', msg: e.message || 'erreur' };
    }
    if (location.hash.startsWith('#/pointage/frais')) App.render();
  };
  // Chaque champ modifié à la main n'est plus remplacé par la lecture du ticket
  const champ = (sel, k, conv = v => v, rendu = false) => { const el = root.querySelector(sel); if (el) el[rendu ? 'onchange' : 'oninput'] = () => { b[k] = conv(el.value); b.saisis[k] = true; delete b.lus[k]; if (rendu) App.render(); }; };
  champ('#f-montant', 'montantTTC'); champ('#f-desc', 'description'); champ('#f-tva', 'tauxTVA', Number, true);
  champ('#f-date', 'date', v => v, true); champ('#f-aff', 'affaireId', v => v, true);
  root.querySelectorAll('input[name=f-cat]').forEach(r => r.onchange = () => {
    b.categorie = r.value; b.saisis.categorie = true; delete b.lus.categorie;
    if (!b.lus.tauxTVA && !b.saisis.tauxTVA) b.tauxTVA = tvaCategorie(r.value);
    App.render();
  });
  // Convives
  const users = id => Store.get('users', id) || {};
  root.querySelectorAll('[data-conv]').forEach(cb => cb.onchange = () => {
    b.convives = cb.checked ? [...b.convives, { nom: users(cb.dataset.conv).nom, userId: cb.dataset.conv }] : b.convives.filter(c => c.userId !== cb.dataset.conv);
    App.render();
  });
  const coll = root.querySelector('#conv-coll');
  if (coll) coll.onchange = () => { if (coll.value) { b.convives.push({ nom: users(coll.value).nom, userId: coll.value }); App.render(); } };
  const ext = root.querySelector('#conv-ext');
  if (ext) ext.onclick = () => { b.convives.push({ nom: '', societe: '', externe: true }); App.render(); const l = root.querySelectorAll('[data-ext-nom]'); if (l.length) document.querySelector(`[data-ext-nom="${l[l.length - 1].dataset.extNom}"]`).focus(); };
  root.querySelectorAll('[data-ext-nom]').forEach(el => el.oninput = () => { b.convives[+el.dataset.extNom].nom = el.value; });
  root.querySelectorAll('[data-ext-soc]').forEach(el => el.oninput = () => { b.convives[+el.dataset.extSoc].societe = el.value; });
  root.querySelectorAll('[data-ext-del]').forEach(el => el.onclick = () => { b.convives.splice(+el.dataset.extDel, 1); App.render(); });
  const raz = root.querySelector('#f-raz');
  if (raz) raz.onclick = () => { fraisB = null; App.render(); };

  root.querySelector('#f-save').onclick = async () => {
    const montant = num(b.montantTTC);
    if (!montant) { notify('Indiquez le montant TTC.'); return; }
    const convives = NoteFrais.convivesRequis(b) ? b.convives.map(c => ({ ...c, nom: String(c.nom || '').trim(), ...(c.societe !== undefined ? { societe: String(c.societe).trim() } : {}) })).filter(c => c.nom) : [];
    const note = { numero: '', userId: uid, affaireId: b.affaireId, date: b.date, categorie: b.categorie, montantTTC: montant, tauxTVA: Number(b.tauxTVA),
      ...(b.montantTVA && b.lus.tauxTVA && b.lus.montantTTC ? { montantTVA: b.montantTVA } : {}), description: b.description, convives, ...(b.ticketLu ? { ticketLu: b.ticketLu } : {}), statut: 'Soumise' };
    const err = NoteFrais.erreur(note);
    if (err) { notify(err); const f = root.querySelector('.convives'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (b.couverts && b.couverts !== convives.length && !(await ask(`Le ticket indique ${b.couverts} couvert(s) mais ${convives.length} personne(s) sont nommées. Envoyer quand même ?`, 'Envoyer'))) return;
    const btn = root.querySelector('#f-save'); btn.disabled = true;
    let photoId = '';
    try { if (b.photo) photoId = (await api('POST', '/api/files', { dataUrl: b.photo })).id; }
    catch (e) { btn.disabled = false; notify('Envoi de la photo impossible : ' + e.message); return; }
    Store.upsert('frais', { ...note, photoId });
    fraisB = null;
    App.render(); App.toast('Note de frais envoyée au chargé d\'affaires');
  };
  root.querySelectorAll('[data-del]').forEach(x => x.onclick = () => ask('Supprimer cette note de frais ?', 'Supprimer').then(ok => {
    if (ok) { Store.remove('frais', x.dataset.del); App.render(); }
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
// Convives d'un repas et écarts avec le ticket lu (montant ou date corrigés, couverts différents)
function fraisControle(f) {
  const t = f.ticketLu || {}, alertes = [];
  if (NoteFrais.convivesRequis(f) && !NoteFrais.nomsConvives(f).length) alertes.push('Noms des convives manquants');
  if (t.montantTTC && Math.abs(t.montantTTC - num(f.montantTTC)) > 0.009) alertes.push(`Ticket lu : ${eur(t.montantTTC)}`);
  if (t.date && t.date !== f.date) alertes.push(`Date du ticket : ${dateFr(t.date)}`);
  if (t.couverts && f.convives && t.couverts !== NoteFrais.nomsConvives(f).length) alertes.push(`${t.couverts} couverts sur le ticket`);
  return `${f.convives && f.convives.length ? `<div class="small">👥 ${esc(NoteFrais.libelleConvives(f))}</div>` : ''}${alertes.map(a => ` <span class="badge b-warn">${esc(a)}</span>`).join('')}`;
}
function rhFrais(query) {
  const fs = query.get('statut') || 'Soumise';
  const list = Store.all('frais').filter(f => !fs || f.statut === fs).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<h1>RH</h1>${rhTabs('frais')}
  <div class="toolbar"><span class="spacer"></span><select id="fs" style="width:auto"><option value="">Toutes</option>${optionsStr(['Soumise', 'Validée', 'Refusée', 'Remboursée'], fs)}</select></div>
  ${list.length ? `<div class="table-wrap"><table><tr><th>Justificatif</th><th>N°</th><th>Date</th><th>Personne</th><th>Chantier</th><th>Catégorie</th><th>Description</th><th class="num">TTC</th><th>Statut</th><th></th></tr>
  ${list.map(f => `<tr><td>${f.photoId ? `<button class="linklike" data-photo="${f.photoId}"><img class="thumb" src="${fileUrl(f.photoId)}" alt="Voir le justificatif"></button>` : '<span class="muted small">sans photo</span>'}</td>
    <td>${esc(f.numero || '')}</td><td>${dateFr(f.date)}</td><td>${esc(userName(f.userId))}</td><td>${esc(affaireOf(f.affaireId).code || '')}</td><td>${f.categorie === 'Repas' ? 'Restaurant' : esc(f.categorie)}</td><td>${esc(f.description)}${fraisControle(f)}</td>
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
    ['Nom', 'Statut', 'Agence', 'Catégorie', 'Jours', 'Heures validées', 'Normales', 'HS 25 %', 'HS 50 %', 'Paniers', 'Montant paniers', 'Notes de frais', 'Brut estimé', 'Heures à valider', 'Déplacements (à compléter)', 'Primes (à compléter)', 'Observations'].map(H),
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
  const fraisRows = [[{ v: `Notes de frais – ${libMois}`, s: 'title' }], [], ['N°', 'Date', 'Personne', 'Chantier', 'Catégorie', 'Description', 'Convives (restaurant)', 'TTC', 'TVA %', 'HT', 'Statut'].map(H),
    ...frais.map(f => [f.numero || '', dateFr(f.date), userName(f.userId), affaireOf(f.affaireId).code || '', f.categorie === 'Repas' ? 'Restaurant' : f.categorie, f.description || '', NoteFrais.libelleConvives(f), { v: num(f.montantTTC), s: 'eur' }, num(f.tauxTVA), { v: Calc.fraisHT(f), s: 'eur' }, f.statut])];
  return XLSX.build([{ name: 'Synthèse', cols: [22, 12, 22, 22, 7, 14, 10, 9, 9, 8, 14, 14, 13, 14, 22, 18, 30], freeze: 4, rows: synth }, ...sheets, { name: 'Notes de frais', cols: [14, 11, 18, 14, 16, 34, 40, 11, 7, 11, 12], freeze: 3, rows: fraisRows }]);
}
