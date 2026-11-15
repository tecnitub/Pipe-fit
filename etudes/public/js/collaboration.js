// Travail à plusieurs sur une même étude (navigateur) :
// - version de départ de chaque étude gardée (dernière version chargée ou enregistrée par ce navigateur) ;
// - enregistrement refusé car l'étude a changé entre-temps (409) : fusion à trois (fusion-etude.js) des changements
//   de l'autre personne et des miens ; réunis sans question s'ils portent sur des parties différentes, sinon dialogue
//   « mes changements / ceux de X » élément par élément ; l'étude fusionnée est ensuite enregistrée (nouvelle version) ;
// - présence légère : le navigateur se signale toutes les 30 s sur l'étude ouverte ; les autres personnes qui l'ont
//   ouverte sont affichées, et une version plus récente enregistrée par quelqu'un d'autre est intégrée d'elle-même
//   quand je n'ai rien en cours d'enregistrement ;
// - versions de l'étude (liste, aperçu, restauration) et corbeille des calculs supprimés (versions-etude.js, serveur).
const Collaboration = (() => {
  const INTERVALLE = (typeof window !== 'undefined' && window.COLLAB_INTERVALLE_MS) || 30000;
  const bases = new Map(), presences = new Map();
  const sansMeta = o => { const c = JSON.parse(JSON.stringify(o || {})); ['_v', '_at', '_by'].forEach(k => delete c[k]); return c; };
  const instantane = et => sansMeta(et);
  const memoriser = (id, data) => { bases.set(id, sansMeta(data)); };
  const remplacer = (et, data) => {
    const id = et.id;
    Object.keys(et).forEach(k => { if (!['id', '_v', '_at', '_by'].includes(k)) delete et[k]; });
    Object.assign(et, JSON.parse(JSON.stringify(data)), { id });
    et.notes = et.notes || []; et.historique = et.historique || [];
  };
  const libChamp = (type, k) => { const t = typeof Notes !== 'undefined' && Notes.TYPES[type], c = t && (t.champs || []).find(x => x.k === k); return c && c.l ? c.l : ''; };
  const courante = () => { const m = /^#\/?etude\/([^/?]+)/.exec(location.hash || ''); return m ? decodeURIComponent(m[1]) : ''; };
  const redessiner = id => { if (courante() === id) { if (typeof avecFocus === 'function') avecFocus(() => App.render()); else App.render(); } };

  // Dialogue de conflit ; fermé sans choisir (clic à côté, changement d'écran) : mes changements sont gardés
  const dialogue = (conflits, autre, fusionnes) => new Promise(res => {
    let fini = false;
    const b = Modal.open(FusionEtude.dialogueHtml(conflits, { autre, fusionnes, champ: libChamp }));
    b.classList.add('large');
    const m = document.getElementById('modal');
    const obs = new MutationObserver(() => { if (m.hidden && !fini) { fini = true; obs.disconnect(); toast('Conflits : vos changements ont été gardés.', 5000); res({}); } });
    obs.observe(m, { attributes: true, attributeFilter: ['hidden'] });
    FusionEtude.lierDialogue(b, conflits, choix => { fini = true; obs.disconnect(); Modal.close(); res(choix); });
  });

  // Intègre la version enregistrée par quelqu'un d'autre ; renvoie s'il faut enregistrer l'étude fusionnée
  async function integrer(et, record) {
    const base = bases.get(et.id) || null, local = instantane(et), distant = sansMeta(record), autre = record._by || 'un autre utilisateur';
    let { fusion, conflits } = FusionEtude.fusionner(base, local, distant);
    const sansChangement = base && FusionEtude.egal(sansMeta(base), local);
    if (conflits.length) {
      const fusionnes = Math.max(0, FusionEtude.compterDistants(base, distant) - conflits.length);
      const choix = await dialogue(conflits, autre, fusionnes);
      ({ fusion } = FusionEtude.fusionner(base, local, distant, { choix }));
    }
    remplacer(et, fusion);
    Object.assign(et, { _v: record._v, _at: record._at, _by: record._by });
    memoriser(et.id, distant);
    const aEnregistrer = !FusionEtude.egal(fusion, distant);
    redessiner(et.id);
    toast(sansChangement ? `Étude mise à jour : modifications de ${autre}.`
      : conflits.length ? `${conflits.length} conflit(s) tranché(s) avec ${autre} : étude fusionnée enregistrée.`
        : `Modifications de ${autre} réunies aux vôtres (parties différentes) : étude fusionnée enregistrée.`, 6000);
    return { aEnregistrer, motif: aEnregistrer ? `Fusion avec les modifications de ${autre}`.slice(0, 200) : '', conflits: conflits.length };
  }
  const conflit = (et, record) => integrer(et, record);

  /* ---------- Présence ---------- */
  const ilYa = iso => { const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 60 ? 'à l\'instant' : `il y a ${Math.round(s / 60)} min`; };
  function afficherPresence() {
    const id = courante(), barre = document.querySelector('#app .barre');
    if (!barre) return;
    let z = barre.querySelector('.presence-etude');
    const autres = presences.get(id) || [];
    if (!autres.length) { if (z) z.remove(); return; }
    if (!z) { z = document.createElement('span'); z.className = 'presence-etude petit'; z.setAttribute('role', 'status'); const h = barre.querySelector('h1'); if (h) h.after(z); else barre.prepend(z); }
    z.title = autres.map(a => `${a.nom} : vu ${ilYa(a.vu)}${a.modifie ? `, dernière modification ${ilYa(a.modifie)}` : ''}`).join('\n');
    z.textContent = `👥 ${autres.map(a => a.nom).join(', ')} ${autres.length > 1 ? 'ont' : 'a'} aussi cette étude ouverte${autres.some(a => a.modifie && Date.now() - Date.parse(a.modifie) < 120000) ? ' (modifications en cours)' : ''}`;
  }
  let derniere = '';
  async function battre() {
    const id = courante();
    if (derniere && derniere !== id) { const q = derniere; derniere = ''; api('POST', `/api/etudes/${encodeURIComponent(q)}/presence`, { quitte: true }).catch(() => {}); }
    const et = id && typeof etudeDe === 'function' ? etudeDe(id) : null;
    if (!et || !et._v) return;
    derniere = id;
    let r;
    try { r = await api('POST', `/api/etudes/${encodeURIComponent(id)}/presence`, {}); } catch (e) { return; }
    presences.set(id, r.autres || []);
    afficherPresence();
    // Version plus récente enregistrée ailleurs, rien en cours ici : intégrée (fusion si j'ai des changements non envoyés)
    const st = S.enCours.get(id) || {}, libre = () => !st.vol && !st.attente && document.getElementById('modal').hidden;
    if (r._v && r._v > (et._v || 0) && libre()) {
      const rec = await api('GET', `/api/etudes/${encodeURIComponent(id)}`).catch(() => null);
      if (!rec || !(rec._v > (et._v || 0)) || !libre()) return;
      st.vol = true; S.enCours.set(id, st);
      try { const f = await integrer(et, rec); st.vol = false; if (f.aEnregistrer) enregistrer(et, { motif: f.motif }); }
      finally { st.vol = false; }
    }
  }

  /* ---------- Versions et corbeille ---------- */
  const dateHeure = iso => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
  const occupe = et => { const st = S.enCours.get(et.id) || {}; return st.vol || st.attente; };
  async function dialogueVersions(et) {
    let vs, cb;
    try { [vs, cb] = await Promise.all([api('GET', `/api/etudes/${encodeURIComponent(et.id)}/versions`), api('GET', `/api/etudes/${encodeURIComponent(et.id)}/corbeille`)]); }
    catch (e) { return toast(e.status === 404 ? 'Étude pas encore enregistrée : pas de versions.' : e.message, 5000); }
    const b = Modal.open(`<h2>Versions de l'étude</h2>
      <p class="muted petit">Une version par personne et par séance de travail (les enregistrements rapprochés d'une même personne la complètent) ; une restauration crée une nouvelle version : rien n'est perdu.</p>
      ${vs.length ? `<div class="defile-x"><table class="liste versions-etude"><thead><tr><th>Date</th><th>Par</th><th>Changements</th><th><span class="visuel-cache">Actions</span></th></tr></thead><tbody>
        ${vs.map((v, i) => `<tr><td style="white-space:nowrap">${esc(dateHeure(v.date))}${i === 0 ? '<div class="petit muted">version actuelle</div>' : ''}</td><td>${esc(v.auteur || '—')}</td>
          <td class="petit">${v.motif ? `<strong>${esc(v.motif)}</strong><br>` : ''}${esc(v.texte)}</td>
          <td style="white-space:nowrap"><button class="secondaire petit" data-apercu="${v.id}">Aperçu</button>${i ? ` <button class="petit" data-restaurer="${v.id}">Restaurer</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Aucune version enregistrée pour l\'instant.</p>'}
      <h3>Corbeille des calculs</h3>
      ${cb.length ? `<div class="defile-x"><table class="liste corbeille-etude"><thead><tr><th>Calcul</th><th>Supprimé le</th><th>Par</th><th><span class="visuel-cache">Actions</span></th></tr></thead><tbody>
        ${cb.map(c => `<tr><td>${esc(c.titre || c.type)}<div class="petit muted">${esc(((typeof Notes !== 'undefined' && Notes.TYPES[c.type]) || {}).titre || c.type)}</div></td><td style="white-space:nowrap">${esc(dateHeure(c.date))}</td><td>${esc(c.par || '—')}</td>
          <td><button class="petit" data-corbeille="${c.id}">Restaurer</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted petit">Aucun calcul supprimé.</p>'}
      <div class="actions"><button class="secondaire" data-fermer>Fermer</button></div>`);
    b.classList.add('large');
    b.querySelector('[data-fermer]').onclick = () => Modal.close();
    b.querySelectorAll('[data-apercu]').forEach(x => { x.onclick = () => apercu(et, x.dataset.apercu, x.closest('tr') === b.querySelector('tbody tr')); });
    b.querySelectorAll('[data-restaurer]').forEach(x => { x.onclick = () => apercu(et, x.dataset.restaurer, false); });
    b.querySelectorAll('[data-corbeille]').forEach(x => { x.onclick = () => restaurerCalcul(et, x.dataset.corbeille); });
  }
  async function apercu(et, vid, actuelle) {
    let v;
    try { v = await api('GET', `/api/etudes/${encodeURIComponent(et.id)}/versions/${encodeURIComponent(vid)}`); } catch (e) { return toast(e.message, 5000); }
    const d = v.data || {}, diff = VersionsEtude.resumer(instantane(et), d);
    const b = Modal.open(`<h2>Version du ${esc(dateHeure(v.date))}</h2>
      <p class="petit">Par ${esc(v.auteur || '—')}${v.motif ? ` · ${esc(v.motif)}` : ''} · ${esc(v.texte)}</p>
      <p><strong>${esc(d.objet || '')}</strong> · indice ${esc(d.indice || '')}${d.date ? ` · ${esc(dateFr(d.date))}` : ''}</p>
      <p class="petit"><strong>${(d.notes || []).length} calcul(s)</strong> : ${(d.notes || []).map(n => esc(n.titre || n.type)).join(', ') || '—'}</p>
      ${actuelle ? '<p class="muted petit">C\'est la version actuelle de l\'étude.</p>' : `<p class="petit">Restaurer cette version, par rapport à l'étude actuelle : ${esc(VersionsEtude.vide(diff) ? 'aucun changement' : VersionsEtude.texte(diff))}.</p>`}
      <div class="actions"><button class="secondaire" data-retour>Retour</button>${actuelle ? '' : '<button data-ok>Restaurer cette version</button>'}</div>`);
    b.querySelector('[data-retour]').onclick = () => dialogueVersions(et);
    const ok = b.querySelector('[data-ok]');
    if (ok) ok.onclick = () => {
      if (occupe(et)) return toast('Enregistrement en cours : réessayez dans un instant.', 4000);
      remplacer(et, d);
      enregistrer(et, { motif: `Restauration de la version du ${dateHeure(v.date)}${v.auteur ? ` (${v.auteur})` : ''}` });
      Modal.close(); App.render(); toast('Version restaurée : enregistrée comme nouvelle version (l\'état précédent reste dans l\'historique).', 6000);
    };
  }
  async function restaurerCalcul(et, cid) {
    let c;
    try { c = await api('GET', `/api/etudes/${encodeURIComponent(et.id)}/corbeille/${encodeURIComponent(cid)}`); } catch (e) { return toast(e.message, 5000); }
    if (occupe(et)) return toast('Enregistrement en cours : réessayez dans un instant.', 4000);
    const n = VersionsEtude.restaurerNote(et, c.note, uidE);
    enregistrer(et, { motif: `Calcul « ${n.titre || n.type} » restauré de la corbeille`.slice(0, 200) });
    Modal.close(); location.hash = `#/etude/${et.id}/${n.id}`;
    toast(`Calcul « ${n.titre || n.type} » restauré.`, 5000);
  }

  // Bouton « Versions » de la page de l'étude et présence, ajoutés après chaque affichage
  function apresRendu() {
    const id = courante(), et = id && typeof etudeDe === 'function' ? etudeDe(id) : null;
    const actions = document.querySelector('#app .actions-etude');
    if (et && actions && !actions.querySelector('#versions-etude')) {
      const bt = document.createElement('button'); bt.className = 'secondaire'; bt.id = 'versions-etude'; bt.type = 'button';
      bt.title = 'Versions enregistrées de l\'étude (aperçu, restauration) et corbeille des calculs supprimés'; bt.textContent = '🕘 Versions';
      bt.onclick = () => dialogueVersions(et);
      actions.appendChild(bt);
    }
    afficherPresence();
    if (/^#\/?reglages/.test(location.hash || '') && S.config) carteReglagesVersions();
  }
  // Réglages : nombre et âge des versions gardées, séance de travail, corbeille (administrateur)
  function carteReglagesVersions() {
    const app = document.getElementById('app');
    if (!app || app.querySelector('#reglages-versions')) return;
    const r = VersionsEtude.reglages(S.config.versions), admin = S.me && S.me.role === 'admin', dis = admin ? '' : 'disabled';
    const champs = [['max', 'Versions gardées par étude (au plus)'], ['jours', 'Âge maximal d\'une version (jours, 0 : sans limite)'], ['intervalleMin', 'Séance de travail (minutes) : enregistrements d\'une même personne regroupés'], ['corbeilleMax', 'Calculs gardés dans la corbeille (par étude)']];
    const c = document.createElement('div');
    c.className = 'carte'; c.id = 'reglages-versions';
    c.innerHTML = `<h2>Versions des études</h2><p class="muted petit">Chaque enregistrement significatif garde une version compressée de l'étude (aperçu, restauration depuis la page de l'étude). La version la plus récente est toujours gardée.</p>
      <div class="grille-champs">${champs.map(([k, l]) => `<label>${esc(l)}<input type="text" inputmode="numeric" data-versions="${k}" value="${esc(r[k])}" ${dis}></label>`).join('')}</div>
      ${admin ? '<div class="actions-ligne"><button class="petit" id="versions-ok">Enregistrer</button></div>' : ''}`;
    app.appendChild(c);
    const ok = c.querySelector('#versions-ok');
    if (ok) ok.onclick = async () => {
      const v = {};
      c.querySelectorAll('[data-versions]').forEach(x => { const n = parseInt(String(x.value).replace(/\s/g, ''), 10); if (Number.isFinite(n) && n >= 0) v[x.dataset.versions] = n; });
      try { S.config = await api('PUT', '/api/config', { ...S.config, versions: VersionsEtude.reglages(v) }); toast('Réglages des versions enregistrés.'); } catch (e) { toast(e.message, 5000); }
    };
  }
  if (typeof App !== 'undefined' && typeof window !== 'undefined') {
    const rendu = App.render;
    App.render = function () { const r = rendu.apply(this, arguments); try { apresRendu(); } catch (e) { /* affichage seul */ } return r; };
    window.addEventListener('hashchange', () => { setTimeout(battre, 50); });
    setInterval(() => { if (S.me && !document.hidden) battre(); }, INTERVALLE);
    window.addEventListener('pagehide', () => { if (derniere) fetch(`/api/etudes/${encodeURIComponent(derniere)}/presence`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: '{"quitte":true}' }).catch(() => {}); });
    setTimeout(() => { if (S.me) battre(); }, 1500);
  }
  return { instantane, memoriser, conflit, integrer, battre, dialogueVersions, base: id => bases.get(id) };
})();
