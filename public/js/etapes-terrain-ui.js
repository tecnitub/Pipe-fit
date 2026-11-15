// Suivi des étapes des études dans le CRM (SuiviEtapes, etudes/public/js/suivi-etapes.js) :
// - bureau : avancement des étapes par chantier dans la liste des chantiers (résumé envoyé par l'application Études à
//   chaque enregistrement) et écran « Étapes des études » (portefeuille : avancement par phase, retards, ce qui attend
//   telle personne ; filtres responsable, phase, retard) ;
// - appli des compagnons : « Mes étapes » (chantier, mise en service, réception) affectées au compagnon, cochées « fait »
//   avec photo et commentaire, hors connexion comprise (file d'attente HorsLigne) ; reprises dans l'étude.
const CHEMIN_ETAPE_FAITE = '/api/liens/etapes/fait';
let etapesPF = null, etapesPFLu = 0;
function chargerEtapesPF(force) {
  if (!Store.me || !['admin', 'charge'].includes(Store.me.role) || (!force && Date.now() - etapesPFLu < 3000)) return;
  etapesPFLu = Date.now();
  api('GET', '/api/liens/etapes').then(r => { etapesPF = Array.isArray(r) ? r : []; if (/^#\/(chantiers|etapes)/.test(location.hash)) App.render(); }).catch(() => {});
}
// Liste des chantiers : avancement des étapes des études du chantier (moyenne pondérée), retards
function etapesChantierHtml(affaireId) {
  if (!etapesPF || typeof SuiviEtapes === 'undefined') return '';
  const l = etapesPF.filter(x => x.affaireId === affaireId && x.avancement);
  if (!l.length) return '';
  const faits = l.reduce((t, x) => t + (x.avancement.faits || 0), 0), total = l.reduce((t, x) => t + (x.avancement.total || 0), 0), pct = total ? Math.round(faits / total * 100) : 100;
  const retards = SuiviEtapes.portefeuille(l, { retard: true }).lignes.length;
  const fr = l.map(x => fraicheurTexte(x.fraicheur || SuiviEtapes.fraicheur(x.avancement))).filter(Boolean)[0] || '';
  return `<a class="small etapes-ch" href="#/etapes?affaire=${encodeURIComponent(affaireId)}" title="Étapes des études : ${faits} / ${total} faites${retards ? `, ${retards} en retard` : ''}${fr ? ` — ${esc(fr)}` : ''}"><span class="badge ${pct === 100 ? 'b-ok' : 'b-info'}">${pct} %</span>${retards ? ` <span class="badge b-bad">${retards} en retard</span>` : ''}</a>`;
}

// Fraîcheur de l'avancement : calcul dans l'application Études, ajustement du CRM depuis (terrain, chantier)
const SOURCES_AJUSTEMENT = { terrain: 'étape faite sur le terrain', chantier: 'données du chantier' };
function fraicheurTexte(f) {
  if (!f) return '';
  const quand = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? dateFr(String(iso).slice(0, 10)) : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); };
  return [f.calcule ? `calculé dans Études le ${dateFr(f.calcule)}` : '', f.ajuste ? `à jour le ${quand(f.ajuste)} (${SOURCES_AJUSTEMENT[f.source] || 'Pipe-Fit'}${f.par && f.source === 'terrain' ? `, ${f.par}` : ''})` : ''].filter(Boolean).join(' · ');
}

// Récapitulatif des relances par e-mail : préférence de la personne (désinscription en un clic)
let prefsEtapes = null;
function chargerPrefsEtapes() {
  if (prefsEtapes || !Store.me || !Store.me.userId) return;
  prefsEtapes = { charge: true };
  api('GET', '/api/liens/etapes/preferences').then(p => { prefsEtapes = p; const z = document.querySelector('#etapes-prefs'); if (z) { z.outerHTML = prefsEtapesHtml(); lierPrefsEtapes(document); } }).catch(() => { prefsEtapes = null; });
}
function prefsEtapesHtml(enAvant) {
  if (!Store.me || !Store.me.userId) return '';
  const p = prefsEtapes && !prefsEtapes.charge ? prefsEtapes : null;
  return `<div id="etapes-prefs" class="small${enAvant ? ' note' : ''}"><label class="check small"><input type="checkbox" id="etapes-mail" ${p && p.email ? 'checked' : ''} ${p ? '' : 'disabled'}> 📧 Récapitulatif par e-mail des étapes à suivre (un par jour au plus)</label>${p && !p.adresse ? ' <span class="muted">— pas d\'adresse e-mail sur votre compte</span>' : ''}</div>`;
}
function lierPrefsEtapes(root) {
  const c = root.querySelector('#etapes-mail');
  if (c) c.onchange = () => api('PUT', '/api/liens/etapes/preferences', { email: c.checked }).then(p => { prefsEtapes = p; App.toast(p.email ? 'Récapitulatif des étapes par e-mail activé' : 'Vous ne recevrez plus le récapitulatif des étapes par e-mail', 3500); }).catch(e => { c.checked = !c.checked; notify(e.message); });
}

// Ouverture de session : étapes qui attendent la personne (retard, échéance proche, blocage), une fois par session
async function etapesALaConnexion() {
  if (!Store.me || !Store.me.userId || Store.horsLigne) return;
  try { if (sessionStorage.getItem('pipefit-etapes-dues')) return; sessionStorage.setItem('pipefit-etapes-dues', '1'); } catch (e) { /* stockage indisponible */ }
  let l;
  try { l = await api('GET', '/api/liens/etapes/dues'); } catch (e) { return; }
  if (!Array.isArray(l) || !l.length) return;
  const retards = l.filter(x => x.type === 'retard').length, bureau = ['admin', 'charge'].includes(Store.me.role);
  App.toast(`${retards ? `⏰ ${retards} étape(s) en retard` : `🔔 ${l.length} étape(s) à suivre`}${retards && l.length > retards ? ` et ${l.length - retards} à suivre` : ''} : ${bureau ? '« Étapes des études »' : '« Mes étapes » de vos chantiers'}`, 7000);
}

// Écran « Étapes des études » (bureau)
const FILTRES_ETAPES = { affaire: '', responsable: '', phase: '', retard: '', moi: '' };
Views.etapes = (params, query) => {
  if (!['admin', 'charge'].includes(Store.me.role)) return '<p>Réservé au bureau.</p>';
  const SE = SuiviEtapes, f = { ...FILTRES_ETAPES, ...Object.fromEntries([...query.entries()].filter(([k]) => k in FILTRES_ETAPES)) };
  if (!etapesPF) return '<h1>Étapes des études</h1><p class="muted">Chargement…</p>';
  const nomAff = id => { const a = Store.get('affaires', id); return a ? [a.code, a.nom].filter(Boolean).join(' — ') : ''; };
  const items = etapesPF.filter(x => !f.affaire || x.affaireId === f.affaire).map(x => ({ ...x, affaire: nomAff(x.affaireId) || x.affaire || 'Sans chantier', chargeId: (Store.get('affaires', x.affaireId) || {}).chargeId || x.chargeId || '' }));
  const moi = { id: Store.me.userId || '', role: Store.me.role, nom: Store.me.nom };
  const r = SE.portefeuille(items, { responsable: f.responsable, phase: f.phase, retard: f.retard === '1', moi: f.moi === '1' ? moi : null });
  const lien = (k, v) => { const q = new URLSearchParams({ ...f, [k]: v }); [...q.keys()].forEach(x => { if (!q.get(x)) q.delete(x); }); return `#/etapes${q.toString() ? `?${q}` : ''}`; };
  const sel = (id, k, opts, tous) => `<span class="etf-champ"><label class="small" for="${id}">${tous}</label><select id="${id}" data-etf="${k}" style="width:auto"><option value="">Tous</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${f[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></span>`;
  const phases = av => SE.PHASES.filter(([k]) => av.phases[k]).map(([k, l, i]) => `<span class="nowrap etf-phase" title="${esc(l)} : ${av.phases[k].faits} / ${av.phases[k].total}">${i} ${esc(l)} <strong>${Math.round(av.phases[k].faits / av.phases[k].total * 100)} %</strong></span>`).join(' ');
  // Avancement arrondi, comme dans l'application Études (même pourcentage des deux côtés)
  const jauge = av => `<div class="gauge"><div class="bar"><span style="width:${Math.min(100, av.pct)}%"></span></div><span class="muted small nowrap">${av.pct} %</span></div>`;
  const lienEtude = x => (typeof urlEtudes === 'function' && x.etudeId ? urlEtudes(`etude/${encodeURIComponent(x.etudeId)}`) : '');
  const nomEtude = x => { const u = lienEtude(x); return u ? `<a href="${esc(u)}" ${window.PIPEFIT_DEMO ? '' : 'target="_blank" rel="noopener"'} title="Ouvrir l'étude dans l'application Études">${esc(x.objet)}</a>` : esc(x.objet); };
  const uneEtude = r.etudes.length <= 1;
  const ech = x => (x.echeance ? `<span class="badge ${x.etatEcheance === 'retard' ? 'b-bad' : x.etatEcheance === 'bientot' ? 'b-warn' : ''}">${x.etatEcheance === 'retard' ? '⏰ ' : ''}${dateFr(x.echeance)}</span>` : '');
  return `<h1>Étapes des études</h1>
    <p class="muted">Avancement des études par phase (étude, achats, chantier, mise en service, réception, DOE, exploitation), étapes en retard et ce qui attend chaque personne. Les responsables et échéances se fixent dans l'application Études ; les personnes sont relancées deux jours avant l'échéance et quand elle est dépassée (cloche, téléphone et récapitulatif quotidien par e-mail ; compagnons du planning du chantier pour les étapes « compagnon »). L'avancement se met à jour dès qu'une étape est faite sur le terrain, qu'une réserve est levée ou que le PV de réception est signé.</p>
    ${prefsEtapesHtml(query.get('preferences') === '1')}
    <div class="toolbar">${f.affaire ? `<a class="btn secondary" href="${lien('affaire', '')}">Tous les chantiers</a>` : ''}${sel('etf-resp', 'responsable', [['aucun', 'Non affectées'], ...SE.responsables(items)], 'Responsable')}${sel('etf-phase', 'phase', SE.PHASES.map(([k, l]) => [k, l]), 'Phase')}
      <label class="check small"><input type="checkbox" data-etf-c="retard" ${f.retard === '1' ? 'checked' : ''}> En retard</label><label class="check small"><input type="checkbox" data-etf-c="moi" ${f.moi === '1' ? 'checked' : ''}> Mes étapes</label></div>
    <div class="table-wrap"><table class="cartes-tel"><tr><th>Étude</th><th>Chantier</th><th>Avancement</th><th>Par phase</th><th>Retards</th></tr>
    ${r.etudes.map(x => `<tr><td class="ct-titre" data-l=""><strong>${nomEtude(x)}</strong>${(fr => (fr ? `<div class="small muted etf-frais">${esc(fr)}</div>` : ''))(fraicheurTexte(x.fraicheur || SE.fraicheur(x.avancement)))}</td><td>${x.affaireId ? `<a href="#/chantier/${esc(x.affaireId)}">${esc(x.affaire)}</a>` : `<span class="muted">${esc(x.affaire)}</span>`}</td><td>${jauge(x.avancement)}</td><td class="small etf-phases ct-large">${phases(x.avancement)}</td><td>${x.retards ? `<span class="badge b-bad">${x.retards}</span>` : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Aucune étude pour ces critères.</td></tr>'}</table></div>
    <h2>Étapes restantes <span class="muted small">${r.lignes.length}${r.retards ? ` · ${r.retards} en retard` : ''}</span></h2>
    ${uneEtude && r.etudes.length ? `<p class="small muted">Étude : ${nomEtude(r.etudes[0])}</p>` : ''}
    <div class="table-wrap"><table class="cartes-tel"><tr><th>Phase</th><th>Étape</th>${uneEtude ? '' : '<th>Étude</th>'}<th>Responsable</th><th>Échéance</th></tr>
    ${r.lignes.slice(0, 300).map(x => `<tr class="${x.etatEcheance === 'retard' ? 'rp-ko' : ''}"><td class="small nowrap">${SE.PHASE[x.phase].ico} ${esc(SE.PHASE[x.phase].libelle)}</td><td class="ct-titre" data-l="">${esc(x.titre)}${(x.bloquePar || []).length ? ' <span class="badge b-warn" title="Attend une autre étape">🔒 bloquée</span>' : ''}</td>${uneEtude ? '' : `<td class="small">${esc(x.objet)}</td>`}<td>${esc(SE.libelleResponsable(x.responsable) || '—')}</td><td class="nowrap">${ech(x)}</td></tr>`).join('') || `<tr><td colspan="${uneEtude ? 4 : 5}" class="muted">Rien à faire pour ces critères.</td></tr>`}</table></div>
    ${r.lignes.length > 300 ? `<p class="small muted">300 étapes affichées sur ${r.lignes.length} : filtrez par responsable ou par phase.</p>` : ''}`;
};
Views.etapes.bind = (root, params, query) => {
  chargerEtapesPF(); chargerPrefsEtapes(); lierPrefsEtapes(root);
  const f = Object.fromEntries([...query.entries()]);
  const aller = (k, v) => { const q = new URLSearchParams({ ...f, [k]: v }); [...q.keys()].forEach(x => { if (!q.get(x) || !(x in FILTRES_ETAPES)) q.delete(x); }); location.hash = `#/etapes${q.toString() ? `?${q}` : ''}`; };
  root.querySelectorAll('[data-etf]').forEach(s => s.onchange = () => aller(s.dataset.etf, s.value));
  root.querySelectorAll('[data-etf-c]').forEach(c => c.onchange = () => aller(c.dataset.etfC, c.checked ? '1' : ''));
};

/* ---------- Appli des compagnons : mes étapes ---------- */
const mesEtapesCache = new Map();
// Étapes cochées hors connexion (pas encore envoyées) : affichées comme faites
const etapesEnAttente = () => new Set((HorsLigne.appelsEnAttente(CHEMIN_ETAPE_FAITE) || []).map(o => `${(o.corps || {}).etudeId}|${(o.corps || {}).etapeId}`));
function mesEtapesListeHtml(l, affaireId) {
  if (!l || !l.length) return '';
  const SE = SuiviEtapes, att = etapesEnAttente(), ouvertes = l.filter(e => !e.faitTerrain && !att.has(`${e.etudeId}|${e.id}`));
  return `<h2>✅ Mes étapes <span class="muted small">${ouvertes.length} à faire sur ${l.length}</span></h2>
    <ul class="mat-liste mes-etapes">${l.map(e => { const enAtt = att.has(`${e.etudeId}|${e.id}`), fait = e.faitTerrain || enAtt;
      return `<li class="${e.etatEcheance === 'retard' && !fait ? 'etape-retard' : ''}"><span><strong>${esc(e.titre)}</strong><br><span class="small muted">${SE.PHASE[e.phase] ? `${SE.PHASE[e.phase].ico} ${esc(SE.PHASE[e.phase].libelle)}` : ''}${affaireId ? '' : ` · ${esc((Store.get('affaires', e.affaireId) || {}).code || '')}`}</span>
        ${e.echeance && !fait ? `<br><span class="small ${e.etatEcheance === 'retard' ? 'neg' : e.etatEcheance === 'bientot' ? 'etape-bientot' : 'muted'}">${e.etatEcheance === 'retard' ? '⏰ en retard : ' : ''}à faire avant le ${dateFr(e.echeance)}</span>` : ''}
        ${e.faitTerrain ? `<br><span class="small pos">✓ Fait le ${dateFr(e.faitTerrain.le)}${e.faitTerrain.commentaire ? ` : ${esc(e.faitTerrain.commentaire)}` : ''}</span>` : ''}${enAtt ? '<br><span class="badge b-warn">⏳ à envoyer</span>' : ''}</span>
        <span>${e.faitTerrain && e.faitTerrain.photoId ? `<img class="thumb" src="${fileUrl(e.faitTerrain.photoId)}" alt="Photo de l'étape">` : fait ? '' : `<button type="button" class="small" data-etape-fait="${esc(e.etudeId)}|${esc(e.id)}">✅ Fait</button>`}</span></li>`; }).join('')}</ul>${prefsEtapesHtml()}`;
}
// Zone remplie après lecture (affaireId vide : tous les chantiers du compagnon)
const mesEtapesZone = affaireId => `<div id="mes-etapes" data-affaire="${esc(affaireId || '')}">${mesEtapesListeHtml(mesEtapesCache.get(affaireId || ''), affaireId)}</div>`;
async function chargerMesEtapes(root, affaireId = '') {
  const z = root.querySelector('#mes-etapes'); if (!z) return;
  const cle = `etapes/${affaireId || 'tout'}`;
  let l;
  try { l = await api('GET', `/api/liens/etapes/mes${affaireId ? `?affaireId=${encodeURIComponent(affaireId)}` : ''}`); HorsLigne.garder(cle, l); }
  catch (e) { l = mesEtapesCache.get(affaireId); if (!l) { try { l = await HorsLigne.relire(cle); } catch (er) { l = null; } } }
  mesEtapesCache.set(affaireId, Array.isArray(l) ? l : []);
  chargerPrefsEtapes();
  const n = document.querySelector('#mes-etapes'); if (!n || n.dataset.affaire !== affaireId) return;
  n.innerHTML = mesEtapesListeHtml(mesEtapesCache.get(affaireId), affaireId);
  lierMesEtapes(n, affaireId);
}
function lierMesEtapes(z, affaireId) {
  lierPrefsEtapes(z);
  z.querySelectorAll('[data-etape-fait]').forEach(b => b.onclick = () => {
    const [etudeId, id] = b.dataset.etapeFait.split('|'), e = (mesEtapesCache.get(affaireId) || []).find(x => x.etudeId === etudeId && x.id === id);
    if (e) etapeFaiteTerrain(e, affaireId);
  });
}
function etapeFaiteTerrain(e, affaireId) {
  let photo = null;
  const box = Modal.open(`<h2 style="margin-top:0">Étape faite</h2><p><strong>${esc(e.titre)}</strong></p>
    <div class="field"><label for="ef-com">Commentaire</label><textarea id="ef-com" rows="3" data-dictee placeholder="Ex. CTA posée sur plots antivibratiles, raccordements faits"></textarea></div>
    <div class="toolbar" style="margin-top:8px"><label class="btn secondary" for="ef-photo">📷 Photo<input id="ef-photo" type="file" accept="image/*" capture="environment" hidden></label><img class="thumb" id="ef-apercu" alt="" hidden></div>
    <p class="small muted">Sans réseau, l'étape est gardée sur le téléphone et envoyée au retour de la connexion. Elle est reprise dans l'étude.</p>
    <div class="modal-actions"><button class="secondary" id="ef-x">Annuler</button><button id="ef-ok">C'est fait</button></div>`);
  box.querySelector('#ef-x').onclick = Modal.close;
  box.querySelector('#ef-photo').onchange = async ev => { try { photo = await compressImage(ev.target.files[0], 1600, 0.8); const im = box.querySelector('#ef-apercu'); im.src = photo; im.hidden = false; } catch (err) { notify('Photo illisible.'); } };
  box.querySelector('#ef-ok').onclick = async () => {
    const commentaire = box.querySelector('#ef-com').value.trim();
    if (!commentaire && !photo) return notify('Ajoutez une photo ou un commentaire.');
    box.querySelector('#ef-ok').disabled = true;
    try {
      const photoId = photo ? await HorsLigne.envoyerImage(photo) : '';
      const r = await HorsLigne.appeler('POST', CHEMIN_ETAPE_FAITE, { etudeId: e.etudeId, etapeId: e.id, commentaire, photoId });
      if (!r.enAttente && r.reponse) e.faitTerrain = { le: r.reponse.le, par: r.reponse.par, commentaire: r.reponse.commentaire, photoId: r.reponse.photoId };
      Modal.close(); App.toast(r.enAttente ? 'Étape faite — enregistrée sur le téléphone, envoyée au retour du réseau' : 'Étape faite : le bureau d\'études est informé', 4000); App.render();
    } catch (err) { box.querySelector('#ef-ok').disabled = false; notify(err.message); }
  };
}
