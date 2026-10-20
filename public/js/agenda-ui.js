// Paramètres → Mon agenda (lien d'abonnement iCal personnel) et, pour l'administrateur, le planning dans Outlook.
function agendaCartes() {
  return `<h2>Mon planning dans mon agenda</h2><div class="card" id="ag-carte"><p class="muted small" style="margin:0">Chargement…</p></div>
    ${Store.me.role === 'admin' ? '<h2>Planning dans Outlook (Microsoft 365)</h2><div class="card" id="ol-carte"><p class="muted small" style="margin:0">Chargement…</p></div>' : ''}`;
}
function bindAgenda(root) {
  const carte = root.querySelector('#ag-carte');
  if (!carte) return;
  if (window.PIPEFIT_DEMO) {
    carte.innerHTML = '<p class="muted small" style="margin:0">Dans la version installée : un lien personnel ajoute votre planning (chantiers, horaires, adresse, consignes, absences) au calendrier de votre téléphone, d\'Outlook ou de Google Agenda, mis à jour automatiquement.</p>';
    const ol = root.querySelector('#ol-carte'); if (ol) ol.innerHTML = '<p class="muted small" style="margin:0">Dans la version installée : chaque journée planifiée apparaît dans le calendrier Outlook de la personne.</p>';
    return;
  }
  const dessiner = (etat, lien) => {
    carte.innerHTML = `<p class="small" style="margin-top:0">Votre planning (chantier, horaires, adresse du site, consignes, absences${Store.all('users').some(u => u.chefId === Store.me.userId) ? ', et celui de votre équipe' : ''}) dans le calendrier de votre téléphone ou d'Outlook, mis à jour automatiquement (environ toutes les heures).</p>
      ${!etat.relie ? '<p class="small warn-text">Votre compte n\'est relié à aucune fiche de l\'équipe : le calendrier sera vide.</p>' : ''}
      ${lien ? `<div class="field"><label for="ag-url">Votre lien (personnel : ne le partagez pas)</label><input id="ag-url" readonly value="${esc(lien.url)}"></div>
        <div class="toolbar" style="margin:0"><button class="small" id="ag-copier">Copier le lien</button><a class="btn small secondary" href="${esc(lien.webcal)}">📅 Ouvrir dans l'agenda du téléphone</a></div>
        <p class="small muted">iPhone : touchez « Ouvrir dans l'agenda » puis « S'abonner ». Android / Google Agenda : sur un ordinateur, Google Agenda → Autres agendas → + → À partir de l'URL. Outlook : Ajouter un calendrier → S'abonner à partir du web.</p>`
        : etat.actif ? '<p class="small">Un lien est actif. Pour l\'afficher à nouveau, créez-en un nouveau (l\'ancien cessera de fonctionner).</p>' : ''}
      <div class="toolbar" style="margin:6px 0 0"><button class="small ${etat.actif ? 'secondary' : ''}" id="ag-creer">${etat.actif ? 'Nouveau lien' : 'Créer mon lien d\'agenda'}</button>${etat.actif ? '<button class="small danger" id="ag-revoquer">Désactiver le lien</button>' : ''}</div>`;
    const c = carte.querySelector('#ag-copier');
    if (c) c.onclick = () => navigator.clipboard.writeText(lien.url).then(() => App.toast('Lien copié'), () => carte.querySelector('#ag-url').select());
    carte.querySelector('#ag-creer').onclick = async () => {
      if (etat.actif && !(await ask('Créer un nouveau lien ? L\'ancien cessera de fonctionner sur les appareils abonnés.', 'Nouveau lien', false))) return;
      api('POST', '/api/agenda/lien', {}).then(l => dessiner({ ...etat, actif: true }, l)).catch(e => notify(e.message));
    };
    const rv = carte.querySelector('#ag-revoquer');
    if (rv) rv.onclick = () => api('DELETE', '/api/agenda/lien', {}).then(() => dessiner({ ...etat, actif: false }, null)).catch(e => notify(e.message));
  };
  api('GET', '/api/agenda/lien').then(e => dessiner(e, null)).catch(e => { carte.innerHTML = `<p class="neg small" style="margin:0">${esc(e.message)}</p>`; });

  const ol = root.querySelector('#ol-carte');
  if (!ol) return;
  const afficher = s => {
    const c = s.config;
    ol.innerHTML = `<p class="small" style="margin-top:0">Chaque journée planifiée (7 jours passés, 90 jours à venir) est créée dans le calendrier Outlook de la personne, puis mise à jour ou supprimée quand le planning change. Boîte utilisée : l'adresse Microsoft 365 du compte relié à la personne, sinon l'e-mail de sa fiche.</p>
      ${!s.m365 ? '<p class="small warn-text">La connexion Microsoft 365 n\'est pas configurée : <a href="#/mails">E-mails et Microsoft 365</a>. L\'application doit aussi avoir l\'autorisation <strong>Calendars.ReadWrite</strong> (consentement administrateur).</p>' : '<p class="small muted">L\'application Microsoft 365 doit avoir l\'autorisation <strong>Calendars.ReadWrite</strong> (en plus de Mail.Send).</p>'}
      <div class="grid2"><label class="check"><input type="checkbox" id="ol-actif" ${c.actif ? 'checked' : ''}> Envoyer le planning dans les calendriers Outlook</label>
        <div class="field"><label for="ol-cat">Catégorie Outlook</label><input id="ol-cat" value="${esc(c.categorie)}"></div>
        <div class="field"><label for="ol-rap">Rappel (minutes avant, 0 = aucun)</label><input id="ol-rap" type="number" min="0" max="1440" value="${esc(c.rappel)}"></div></div>
      <p class="small">${s.dernier ? `Dernier passage : ${new Date(s.dernier).toLocaleString('fr-FR')}${s.actif ? ` · ${s.boites || 0} calendrier(s) · ${s.crees || 0} créé(s), ${s.modifies || 0} modifié(s), ${s.supprimes || 0} supprimé(s)` : ''}` : 'Pas encore synchronisé.'}</p>
      ${(s.erreurs || []).length ? `<ul class="small neg">${s.erreurs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="toolbar" style="margin:0"><button id="ol-save">Enregistrer</button><button class="secondary" id="ol-sync" ${c.actif && s.m365 ? '' : 'disabled'}>🔄 Synchroniser maintenant</button></div>`;
    ol.querySelector('#ol-save').onclick = () => api('PUT', '/api/agenda/outlook', { actif: ol.querySelector('#ol-actif').checked, categorie: ol.querySelector('#ol-cat').value, rappel: ol.querySelector('#ol-rap').value })
      .then(r => { App.toast('Réglage enregistré'); afficher(r); }).catch(e => notify(e.message));
    ol.querySelector('#ol-sync').onclick = ev => { ev.target.disabled = true; api('POST', '/api/agenda/outlook/synchro', {}).then(r => { App.toast('Synchronisation terminée'); afficher(r); }).catch(e => notify(e.message)); };
  };
  api('GET', '/api/agenda/outlook').then(afficher).catch(e => { ol.innerHTML = `<p class="neg small" style="margin:0">${esc(e.message)}</p>`; });
}
