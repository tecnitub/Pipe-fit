// Filtres des listes (client, chargé d'affaires, statut, recherche), mémorisés par écran sur le poste,
// et archivage des chantiers et devis terminés pour alléger les listes et le tableau de bord.
const MEMO_FILTRES = 'pipefit-filtres';
const memoFiltres = () => { try { return JSON.parse(localStorage.getItem(MEMO_FILTRES)) || {}; } catch (e) { return {}; } };
const normRecherche = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Filtres de l'écran : ceux de l'adresse s'il y en a, sinon les derniers utilisés sur ce poste
function lireFiltres(ecran, query, defauts) {
  const cles = Object.keys(defauts), memo = memoFiltres();
  const f = { ...defauts };
  if (cles.some(k => query.has(k))) cles.forEach(k => { if (query.has(k)) f[k] = query.get(k); });
  else Object.assign(f, memo[ecran] || {});
  try { localStorage.setItem(MEMO_FILTRES, JSON.stringify({ ...memo, [ecran]: f })); } catch (e) { /* stockage indisponible */ }
  return f;
}
const lienFiltres = (ecran, f) => `#/${ecran}?${new URLSearchParams(Object.entries(f).map(([k, v]) => [k, v || '']))}`;
const correspond = (q, ...champs) => !q || normRecherche(champs.join(' ')).includes(normRecherche(q));
const filtresActifs = (f, defauts) => Object.keys(defauts).some(k => (f[k] || '') !== (defauts[k] || ''));

// Barre de filtres : recherche, client, chargé d'affaires, statut (et filtres propres à l'écran)
function barreFiltres(f, { clients, statuts, recherche = 'Rechercher (n°, objet, client…)', defauts, extra = '' }) {
  const cl = (clients || []).map(id => entreprise(id)).filter(e => e.id).sort((a, b) => a.nom.localeCompare(b.nom));
  return `<div class="toolbar filtres">
    ${recherche ? `<input type="search" data-f="q" value="${esc(f.q || '')}" placeholder="${esc(recherche)}" aria-label="Rechercher">` : ''}
    ${clients ? `<select data-f="client" aria-label="Client"><option value="">Tous les clients</option>${cl.map(e => `<option value="${esc(e.id)}" ${e.id === f.client ? 'selected' : ''}>${esc(e.nom)}</option>`).join('')}</select>` : ''}
    ${'charge' in f ? `<select data-f="charge" aria-label="Chargé d'affaires"><option value="">Tous les chargés d'affaires</option>${options(charges(), f.charge, undefined, false)}</select>` : ''}
    ${statuts ? `<select data-f="statut" aria-label="Statut">${statuts.map(([v, l]) => `<option value="${esc(v)}" ${v === (f.statut || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
    ${extra}
    ${defauts && filtresActifs(f, defauts) ? '<button class="secondary small" data-f-reset type="button">Effacer les filtres</button>' : ''}
  </div>`;
}
function bindFiltres(root, ecran, f, defauts) {
  root.querySelectorAll('[data-f]').forEach(el => {
    el.addEventListener(el.type === 'search' ? 'change' : 'input', () => { location.hash = lienFiltres(ecran, { ...f, [el.dataset.f]: el.value }); });
    if (el.type === 'search') el.addEventListener('search', () => { location.hash = lienFiltres(ecran, { ...f, q: el.value }); });
  });
  const r = root.querySelector('[data-f-reset]');
  if (r) r.onclick = () => { location.hash = lienFiltres(ecran, defauts); };
}

/* ---------- Archivage ---------- */
function archiver(col, objs, oui = true) {
  objs.forEach(o => {
    if (oui) Object.assign(o, { archive: true, archiveLe: isoDate(new Date()), archivePar: Store.me.nom });
    else { delete o.archive; delete o.archiveLe; delete o.archivePar; }
    Store.upsert(col, o);
  });
  App.render();
  App.toast(`${objs.length} ${col === 'devis' ? 'devis' : objs.length > 1 ? 'chantiers' : 'chantier'} ${oui ? 'archivé(s)' : 'sorti(s) des archives'}`);
}
const bandeauArchive = (o, col) => (o.archive ? `<p class="note archive-note">Archivé le ${dateFr(o.archiveLe)}${o.archivePar ? ` par ${esc(o.archivePar)}` : ''} : masqué des listes et du tableau de bord. <button class="small secondary" data-desarchiver="${col}|${esc(o.id)}">Sortir des archives</button></p>` : '');
document.addEventListener('click', e => {
  const b = e.target.closest('[data-desarchiver], [data-archiver]');
  if (!b) return;
  const [col, id] = (b.dataset.desarchiver || b.dataset.archiver).split('|');
  const o = Store.get(col, id);
  if (!o) return;
  if (b.dataset.desarchiver) return archiver(col, [o], false);
  const encours = col === 'affaires' ? !['Terminé', 'Facturé', 'Clos'].includes(o.statut) : ['Brouillon', 'Envoyé'].includes(o.statut);
  ask(encours ? `${col === 'devis' ? 'Ce devis' : 'Ce chantier'} est encore « ${o.statut} ». L'archiver quand même ? Il restera consultable dans les archives.` : 'Archiver ? Il restera consultable (filtre « Archivés ») et compté dans les analyses.', 'Archiver', false)
    .then(ok => { if (ok) archiver(col, [o]); });
});

// Sélection multiple dans une liste (cases à cocher) + barre d'actions
function selectionListe(root, onChange) {
  const cases = [...root.querySelectorAll('[data-sel-id]')], tout = root.querySelector('[data-sel-tout]');
  const ids = () => cases.filter(c => c.checked).map(c => c.dataset.selId);
  const maj = () => { if (tout) tout.checked = cases.length && cases.every(c => c.checked); onChange(ids()); };
  cases.forEach(c => { c.onclick = e => e.stopPropagation(); c.onchange = maj; });
  root.querySelectorAll('.sel-cell').forEach(td => td.onclick = e => e.stopPropagation());
  if (tout) tout.onchange = () => { cases.forEach(c => { c.checked = tout.checked; }); maj(); };
  return ids;
}

/* ---------- Devis refusé ---------- */
const MOTIFS_REFUS = ['Prix trop élevé', 'Délai', 'Concurrent retenu', 'Projet reporté', 'Projet abandonné', 'Sans réponse du client', 'Autre'];
function refuserDevis(d) {
  const box = Modal.open(`<h2 style="margin-top:0">Devis ${esc(d.numero || '')} refusé</h2>
    <div class="field"><label for="rf-motif">Motif</label><select id="rf-motif">${optionsStr(MOTIFS_REFUS, d.motifRefus || MOTIFS_REFUS[0])}</select></div>
    <div class="field"><label for="rf-com">Commentaire (concurrent, écart de prix, contexte…)</label><textarea id="rf-com" rows="3">${esc(d.commentaireRefus || '')}</textarea></div>
    <label class="check"><input type="checkbox" id="rf-arch" checked> Archiver le devis (il disparaît des listes, reste dans les analyses)</label>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="rf-annuler">Annuler</button><button class="danger" id="rf-ok">Marquer refusé</button></div>`);
  box.querySelector('#rf-annuler').onclick = Modal.close;
  box.querySelector('#rf-ok').onclick = () => {
    Object.assign(d, { statut: 'Refusé', motifRefus: box.querySelector('#rf-motif').value, commentaireRefus: box.querySelector('#rf-com').value, dateRefus: isoDate(new Date()) });
    if (box.querySelector('#rf-arch').checked) Object.assign(d, { archive: true, archiveLe: isoDate(new Date()), archivePar: Store.me.nom });
    Store.upsert('devis', d);
    Modal.close(); App.render(); App.toast(`Devis ${d.numero || ''} marqué refusé${d.archive ? ' et archivé' : ''}`);
  };
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-refuser]');
  if (!b) return;
  e.stopPropagation();
  const d = Store.get('devis', b.dataset.refuser);
  if (d) refuserDevis(d);
}, true);
