// Ma journée (compagnon) : plusieurs chantiers dans la journée, prévus ou non (sur devis ou hors devis), la journée prévue
// gardée ou remplacée, et pour chaque personne qui a travaillé avec lui (son équipe, un intérimaire sans accès au CRM)
// ses propres lignes. Intérimaire pas encore connu : déclaré ici, le bureau complète sa mission.

/* ---------- Intérimaires avec moi aujourd'hui (pointage « Commencer / Terminer ») ---------- */
const cleAvec = (uid, date) => `pf-avec:${uid}:${date}`;
function avecMoi(uid, date) {
  try { return (JSON.parse(localStorage.getItem(cleAvec(uid, date))) || []).filter(id => Store.get('users', id)); } catch (e) { return []; }
}
function majAvecMoi(uid, date, ids) {
  try { localStorage.setItem(cleAvec(uid, date), JSON.stringify([...new Set(ids)])); } catch (e) { /* stockage indisponible : pour cet affichage seulement */ }
}

// Intérimaires connus (présents en mission d'abord), et déclaration d'un nouveau
const interimairesConnus = date => Store.all('users').filter(u => u.type === 'interimaire')
  .map(u => ({ u, present: Store.all('missions').some(m => m.userId === u.id && Interim.present(m, date)) || u.aCompleter }))
  .sort((a, b) => (b.present - a.present) || a.u.nom.localeCompare(b.u.nom));
function choisirInterimaire({ date, affaireId, exclure = [] }) {
  return new Promise(fini => {
    const connus = interimairesConnus(date).filter(x => !exclure.includes(x.u.id)), ags = agences();
    const box = Modal.open(`<h2 style="margin-top:0">👷 Intérimaire avec moi</h2>
      <p class="muted small">Il n'a pas d'accès à Pipe-Fit : vous pointez ses heures avec les vôtres.</p>
      ${connus.length ? `<div class="field"><label for="ci-q">Rechercher</label><input id="ci-q" type="search" placeholder="Nom, agence…" autocomplete="off"></div>
        <ul class="ci-liste">${connus.map(({ u, present }) => `<li><button class="ligne-t" data-ci="${u.id}" data-txt="${esc(`${u.nom} ${(u.agenceId ? clientName(u.agenceId) : u.agenceLibre) || ''}`.toLowerCase())}">
          <span><strong>${esc(u.nom)}</strong> <span class="small muted">${esc((u.agenceId ? clientName(u.agenceId) : u.agenceLibre) || '')}${u.qualification ? ` · ${esc(u.qualification)}` : ''}</span></span>${present ? '<span class="badge b-info">en mission</span>' : ''}</button></li>`).join('')}</ul>` : ''}
      <details class="ci-nouveau" ${connus.length ? '' : 'open'}><summary><strong>Il n'est pas dans la liste</strong></summary>
        <div class="field"><label for="ci-nom">Nom et prénom</label><input id="ci-nom" autocomplete="off" placeholder="Ex. Yanis Morel"></div>
        <div class="field"><label for="ci-ag">Agence d'intérim</label><select id="ci-ag"><option value="">Choisir…</option>${ags.map(a => `<option value="${a.id}">${esc(a.nom)}</option>`).join('')}<option value="autre">Autre agence</option></select></div>
        <div class="field" id="ci-agl-f" ${ags.length ? 'hidden' : ''}><label for="ci-agl">Nom de l'agence</label><input id="ci-agl" autocomplete="off" placeholder="Ex. Adecco Annecy"></div>
        <div class="field"><label for="ci-qual">Métier (facultatif)</label><input id="ci-qual" autocomplete="off" placeholder="Ex. tuyauteur, soudeur TIG"></div>
        <p class="small muted">Le bureau est prévenu et complète son dossier (contrat de mise à disposition, registre du personnel).</p>
        <button id="ci-ok">Ajouter cet intérimaire</button></details>
      <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="ci-x">Annuler</button></div>`);
    const $ = s => box.querySelector(s);
    let rendu = false;
    const finir = u => { if (rendu) return; rendu = true; Modal.close(); fini(u); };
    $('#ci-x').onclick = () => finir(null);
    const q = $('#ci-q');
    if (q) q.oninput = () => box.querySelectorAll('[data-ci]').forEach(b => { b.parentElement.hidden = !b.dataset.txt.includes(q.value.trim().toLowerCase()); });
    box.querySelectorAll('[data-ci]').forEach(b => b.onclick = () => finir(Store.get('users', b.dataset.ci)));
    $('#ci-ag').onchange = () => { $('#ci-agl-f').hidden = $('#ci-ag').value !== 'autre' && ags.length > 0; };
    $('#ci-ok').onclick = async () => {
      const ag = $('#ci-ag').value, corps = { nom: $('#ci-nom').value.trim(), agenceId: ag && ag !== 'autre' ? ag : '', agenceLibre: ag && ag !== 'autre' ? '' : $('#ci-agl').value.trim(),
        qualification: $('#ci-qual').value.trim(), date, affaireId: affaireId || '' };
      if (corps.nom.length < 3) return notify('Indiquez son nom et son prénom.');
      if (!corps.agenceId && !corps.agenceLibre) return notify('Indiquez son agence d\'intérim.');
      $('#ci-ok').disabled = true;
      try {
        const r = await api('POST', '/api/pointage/interimaire', corps);
        Store._put('users', r.user);
        if (r.mission) Store._put('missions', r.mission);
        App.toast(`${r.user.nom} ajouté : le bureau complétera son dossier`, 4000);
        finir(Store.get('users', r.user.id));
      } catch (e) { $('#ci-ok').disabled = false; notify(HorsLigne.estReseau(e) ? 'Pas de réseau : un nouvel intérimaire se déclare avec le réseau. Réessayez, ou choisissez-le dans la liste.' : e.message); }
    };
    setTimeout(() => (q || $('#ci-nom')).focus(), 50);
  });
}

/* ---------- Ma journée ---------- */
function journeeCompagnon(date, ids) {
  const moi = ids[0], auj = date === isoDate(new Date());
  const prevusDe = uid => planJour(uid, date).map(p => p.affaireId);
  const dernier = (Store.all('temps').filter(t => t.userId === moi).sort((a, b) => (b.date + (b.debut || '')).localeCompare(a.date + (a.debut || '')))[0]) || {};
  const nouvellePersonne = uid => {
    const reel = reelJour(uid, date);
    return { uid, lignes: Journee.lignesInitiales({ plan: planJour(uid, date), reel, defaut: dernier }), panier: reel.length ? reel.some(t => t.panier) : true, existants: reel };
  };
  const pers = [...new Set([...ids, ...avecMoi(moi, date)])].filter(id => Store.get('users', id)).map(nouvellePersonne);
  // Zone de la fenêtre : rouverte après le choix d'un intérimaire (qui a sa propre fenêtre), saisie conservée
  let zone = null;
  const ouvrir = () => { zone = Modal.open('<div id="jr" class="jr"></div>', true).querySelector('#jr'); rendre(); };
  const nomDe = p => `${esc(userName(p.uid))}${p.uid === Store.me.userId ? ' <span class="muted small">(moi)</span>' : ''} ${interimBadge(Store.get('users', p.uid) || {})}`;
  const ligneHtml = (p, pi, l, li) => {
    const prevu = prevusDe(p.uid).includes(l.affaireId), af = Store.get('affaires', l.affaireId);
    if (l.bloque) return `<div class="jr-ligne bloque"><span>${esc(l.debut || '')}${l.debut ? ' – ' + esc(l.fin) : 'saisie'} · <strong>${esc((af || {}).code || '?')}</strong> ${esc(l.tache || '')}</span><span class="badge b-ok">Validé · ${fmt(Journee.heuresLigne(l), 2)} h</span></div>`;
    return `<div class="jr-ligne" data-p="${pi}" data-l="${li}">
      <div class="field jr-ch">${champChantier({ id: `jr-aff-${pi}-${li}`, uid: p.uid, date, sel: l.affaireId, raccourcis: !l.affaireId })}
        ${l.affaireId && !prevu ? `<span class="badge b-warn">non prévu${af && estHorsDevis(af) ? ' · hors devis' : ''}</span>` : ''}</div>
      <input data-k="tache" list="jr-taches" value="${esc(l.tache || '')}" placeholder="Tâche" aria-label="Tâche">
      <div class="jr-heures"><input data-k="debut" type="time" value="${esc(l.debut)}" aria-label="Arrivée"><span>–</span><input data-k="fin" type="time" value="${esc(l.fin)}" aria-label="Départ">
        <input data-k="pause" type="number" min="0" step="5" value="${esc(l.pause)}" aria-label="Pause en minutes" title="Pause (min)"><span class="small muted">min</span>
        <output class="jr-h">${l.enCours && !l.fin ? 'en cours' : `${fmt(Journee.heuresLigne(l), 2)} h`}</output>
        <button class="icon" data-retirer="${pi}:${li}" title="Retirer cette ligne" aria-label="Retirer cette ligne">✕</button></div></div>`;
  };
  const rendre = () => {
    const plan = planJour(moi, date);
    zone.innerHTML = `<h2 style="margin-top:0">${pers.length > 1 ? 'Journée de l\'équipe' : 'Ma journée'} · ${esc(jourLong(date))}</h2>
      ${plan.length ? `<div class="card pl-aujourdhui"><div class="label">Prévu au planning</div>${plan.map(x => `<div class="small">${esc(affaireOf(x.affaireId).code || '')} ${esc(affaireOf(x.affaireId).nom || '')} · ${esc(x.tache || '')}${x.heuresPrevues ? ` · ${fmt(x.heuresPrevues, 2)} h` : ''}</div>`).join('')}
        <div class="jr-actions"><button class="secondary small" id="jr-prevu">Comme prévu</button><button class="secondary small" id="jr-autre">Journée différente (tout remplacer)</button></div></div>`
        : '<p class="small muted">Rien de prévu ce jour-là : ajoutez les chantiers où vous avez travaillé (sur devis ou hors devis).</p>'}
      <datalist id="jr-taches">${TACHES.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
      ${pers.map((p, pi) => { const total = p.lignes.reduce((s, l) => s + Journee.heuresLigne(l), 0), rempl = Journee.remplacee(p.lignes, prevusDe(p.uid));
        return `<div class="card jr-pers">
        <div class="jr-tete"><strong>${nomDe(p)}</strong><span class="spacer"></span><strong>${fmt(total, 2)} h</strong>
          ${pi ? `<button class="icon" data-sans="${pi}" title="Retirer cette personne de la journée" aria-label="Retirer cette personne">✕</button>` : ''}</div>
        ${rempl ? '<p class="small warn-text">Journée prévue remplacée : le bureau verra les chantiers non prévus.</p>' : ''}
        ${p.lignes.map((l, li) => ligneHtml(p, pi, l, li)).join('')}
        <div class="jr-actions"><button class="secondary small" data-plus="${pi}">+ Chantier</button>
          ${pi ? `<button class="secondary small" data-copie="${pi}">Mêmes chantiers que ${esc(prenomDe(userName(moi)))}</button>` : ''}
          <label class="check"><input type="checkbox" data-panier="${pi}" ${p.panier ? 'checked' : ''}> Panier repas</label></div></div>`; }).join('')}
      <button class="secondary" id="jr-interim">+ Intérimaire avec moi ce jour-là</button>
      ${equipeDe(moi).filter(u => !pers.some(p => p.uid === u.id)).length ? `<select id="jr-equipier" style="width:auto"><option value="">+ Un équipier…</option>${equipeDe(moi).filter(u => !pers.some(p => p.uid === u.id)).map(u => `<option value="${u.id}">${esc(u.nom)}</option>`).join('')}</select>` : ''}
      <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="jr-x">Annuler</button><button id="jr-ok">Enregistrer</button></div>`;
    brancher();
  };
  const brancher = () => {
    const $ = s => zone.querySelector(s);
    zone.querySelectorAll('.jr-ligne[data-p]').forEach(div => {
      const l = pers[+div.dataset.p].lignes[+div.dataset.l];
      div.querySelectorAll('[data-k]').forEach(el => {
        const k = el.dataset.k;
        el.addEventListener('input', () => {
          l[k] = k === 'pause' ? num(el.value) : el.value;
          if (k === 'fin' && l.fin) l.enCours = false;
          div.querySelector('.jr-h').textContent = l.enCours && !l.fin ? 'en cours' : `${fmt(Journee.heuresLigne(l), 2)} h`;
        });
      });
    });
    zone.querySelectorAll('.jr-ligne[data-p]').forEach(div => {
      const p = pers[+div.dataset.p], l = p.lignes[+div.dataset.l];
      brancherChampChantier(div, `jr-aff-${div.dataset.p}-${div.dataset.l}`, { uid: p.uid, date, onChange: a => { l.affaireId = a.id; rendre(); }, onHD: a => { l.affaireId = a.id; ouvrir(); }, annuleHD: ouvrir });
    });
    zone.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => { const [pi, li] = b.dataset.retirer.split(':').map(Number); pers[pi].lignes.splice(li, 1); rendre(); });
    zone.querySelectorAll('[data-plus]').forEach(b => b.onclick = () => {
      const ls = pers[+b.dataset.plus].lignes, der = ls[ls.length - 1];
      ls.push({ affaireId: '', tache: der ? der.tache : '', debut: der && der.fin ? der.fin : '13:30', fin: '', pause: 0 });
      rendre();
    });
    zone.querySelectorAll('[data-copie]').forEach(b => b.onclick = () => {
      const p = pers[+b.dataset.copie];
      p.lignes = [...p.lignes.filter(l => l.bloque), ...pers[0].lignes.filter(l => !l.bloque).map(({ tid, bloque, enCours, ...l }) => ({ ...l }))];
      p.panier = pers[0].panier; rendre();
    });
    zone.querySelectorAll('[data-panier]').forEach(c => c.onchange = () => { pers[+c.dataset.panier].panier = c.checked; });
    zone.querySelectorAll('[data-sans]').forEach(b => b.onclick = () => { const p = pers.splice(+b.dataset.sans, 1)[0]; majAvecMoi(moi, date, avecMoi(moi, date).filter(id => id !== p.uid)); rendre(); });
    const prevu = $('#jr-prevu');
    if (prevu) prevu.onclick = () => { pers.forEach(p => { const plan = planJour(p.uid, date); if (plan.length) p.lignes = [...p.lignes.filter(l => l.bloque), ...Journee.comme(plan)]; }); rendre(); };
    const autre = $('#jr-autre');
    if (autre) autre.onclick = () => { pers.forEach(p => { p.lignes = [...p.lignes.filter(l => l.bloque), { affaireId: '', tache: '', debut: '07:30', fin: '16:30', pause: 60 }]; }); rendre(); };
    $('#jr-interim').onclick = async () => {
      const u = await choisirInterimaire({ date, affaireId: (pers[0].lignes.find(l => l.affaireId) || {}).affaireId, exclure: pers.map(p => p.uid) });
      if (!u) return journeeRouvrir();
      majAvecMoi(moi, date, [...avecMoi(moi, date), u.id]);
      const p = nouvellePersonne(u.id);
      if (!p.existants.length) { p.lignes = pers[0].lignes.filter(l => !l.bloque).map(({ tid, bloque, enCours, ...l }) => ({ ...l })); p.panier = pers[0].panier; }
      pers.push(p); journeeRouvrir();
    };
    const eq = $('#jr-equipier');
    if (eq) eq.onchange = () => { if (eq.value) { pers.push(nouvellePersonne(eq.value)); rendre(); } };
    $('#jr-x').onclick = Modal.close;
    $('#jr-ok').onclick = enregistrer;
  };
  const journeeRouvrir = () => ouvrir();
  async function enregistrer() {
    const saisiPar = Store.me.userId || moi;
    for (const p of pers) {
      const e = Journee.erreur(p.lignes, { aujourdhui: auj });
      if (e) return notify(`${userName(p.uid)} : ${e}`);
      if (!p.lignes.some(l => !l.bloque) && !p.existants.some(t => t.statut !== 'Validé') && p.uid !== moi) return notify(`${userName(p.uid)} : ajoutez au moins un chantier, ou retirez-le de la journée.`);
    }
    const plans = pers.map(p => Journee.aEnregistrer({ userId: p.uid, date, lignes: p.lignes, panier: p.panier, existants: reelJour(p.uid, date), prevus: prevusDe(p.uid), saisiPar }));
    const retraits = plans.reduce((s, x) => s + x.suppressions.length, 0);
    if (retraits && !(await ask(`${retraits} pointage(s) déjà enregistré(s) ce jour-là seront remplacés par cette saisie. Continuer ?`, 'Remplacer', false))) return;
    plans.forEach(x => { x.suppressions.forEach(id => Store.remove('temps', id)); x.upserts.forEach(o => Store.upsert('temps', o)); });
    Modal.close(); App.render();
    const total = plans.reduce((s, x) => s + x.total, 0);
    App.toast(`${fmt(total, 2)} h enregistrées${pers.length > 1 ? ` pour ${pers.length} personnes` : ''}`, 4000);
  }
  ouvrir();
}
