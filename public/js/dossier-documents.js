// Répertoire des documents sur le serveur (Paramètres) et chemin du dossier de chaque chantier (onglet Documents).
// La synchronisation elle-même est faite par le serveur (server/dossier-documents.js).
let etatDossier = null;
const chargerEtatDossier = () => api('GET', '/api/documents/dossier').then(e => { etatDossier = e; return e; }).catch(() => { etatDossier = { indisponible: true }; return etatDossier; });
const cheminChantier = a => (etatDossier && etatDossier.config ? [etatDossier.config.chemin, 'Chantiers', Classement.dossierChantier(a)].join(etatDossier.sep || '/') : '');

// Onglet Documents du chantier : où copier les fichiers sur le serveur
function bandeauDossierChantier(a) {
  if (!['admin', 'charge'].includes(Store.me.role) || window.PIPEFIT_DEMO) return '';
  return `<div class="dossier-serveur small" id="dossier-serveur" data-affaire="${esc(a.id)}"><span class="muted">📁 Répertoire du serveur…</span></div>`;
}
function bindDossierChantier(root, a) {
  const el = root.querySelector('#dossier-serveur');
  if (!el) return;
  chargerEtatDossier().then(e => {
    if (!el.isConnected) return;
    if (e.indisponible || !e.config || !e.config.actif) { el.innerHTML = '<span class="muted">📁 Répertoire des documents sur le serveur désactivé (Paramètres).</span>'; return; }
    const c = cheminChantier(a);
    el.innerHTML = `📁 Aussi dans le répertoire du serveur : <code class="chemin" title="Copiez des fichiers dans ce dossier : ils apparaissent ici">${esc(c)}</code>
      <button class="small secondary" id="ds-copier" title="Copier le chemin">Copier</button><button class="small secondary" id="ds-sync">🔄 Synchroniser</button>
      <span class="muted">${e.dernier ? `dernier passage ${new Date(e.dernier).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}${e.erreur ? ` · <span class="neg">${esc(e.erreur)}</span>` : ''}</span>`;
    el.querySelector('#ds-copier').onclick = () => navigator.clipboard.writeText(c).then(() => App.toast('Chemin copié'), () => notify(c));
    el.querySelector('#ds-sync').onclick = async ev => {
      ev.target.disabled = true;
      try { const r = await api('POST', '/api/documents/dossier/synchro', {}); App.toast(bilanSynchro(r), 4000); await Store.load(); App.render(); }
      catch (err) { notify(err.message); ev.target.disabled = false; }
    };
  });
}
const bilanSynchro = r => (r.erreur ? r.erreur : [r.importes && `${r.importes} fichier(s) ajouté(s) depuis le serveur`, r.nouveauxIndices && `${r.nouveauxIndices} nouvel(s) indice(s)`,
  r.exportes && `${r.exportes} fichier(s) écrit(s) sur le serveur`, r.deplaces && `${r.deplaces} déplacé(s)`, r.supprimes && `${r.supprimes} retiré(s)`].filter(Boolean).join(' · ') || 'Déjà à jour');

// Paramètres : réglage du répertoire (administrateur), état de la synchronisation
function reglagesDossierCarte() {
  if (!['admin', 'charge'].includes(Store.me.role)) return '';
  return `<h2>Répertoire des documents sur le serveur</h2><div class="card" id="ds-carte"><p class="muted small">Chargement…</p></div>`;
}
function bindReglagesDossier(root) {
  const carte = root.querySelector('#ds-carte');
  if (!carte) return;
  if (window.PIPEFIT_DEMO) { carte.innerHTML = '<p class="muted small" style="margin:0">Disponible dans la version installée : les documents des chantiers sont enregistrés dans un répertoire du serveur (partageable sur le réseau), synchronisé avec l\'appli dans les deux sens.</p>'; return; }
  chargerEtatDossier().then(e => {
    if (!carte.isConnected) return;
    if (e.indisponible) { carte.innerHTML = '<p class="muted small" style="margin:0">Indisponible.</p>'; return; }
    const c = e.config, admin = Store.me.role === 'admin', dis = admin ? '' : 'disabled';
    carte.innerHTML = `<p class="muted small" style="margin-top:0">Chaque chantier a son dossier <code>Chantiers\\&lt;code&gt; - &lt;nom&gt;</code>, rangé par catégorie (Plan, Fiche technique, PGC…). Un document déposé dans l'appli y est écrit ;
      un fichier copié dans le dossier d'un chantier apparaît dans l'appli (posé à la racine du chantier, il est rangé d'après son nom ; un fichier remplacé devient un nouvel indice). Partagez ce répertoire sur le réseau pour y accéder depuis les postes du bureau.</p>
      <div class="grid2">
        <div class="field"><label for="ds-ch">Chemin sur le serveur</label><input id="ds-ch" value="${esc(c.chemin)}" ${c.impose || !admin ? 'disabled' : ''}>${c.impose ? '<span class="small muted">Imposé par la variable d\'environnement DOCUMENTS_DIR.</span>' : ''}</div>
        <div class="field"><label for="ds-int">Vérification du répertoire toutes les (secondes)</label><input id="ds-int" type="number" min="10" max="3600" value="${esc(c.intervalle)}" ${dis}></div>
      </div>
      <label class="check"><input type="checkbox" id="ds-actif" ${c.actif ? 'checked' : ''} ${c.impose ? 'disabled' : dis}> Synchroniser les documents des chantiers avec ce répertoire</label>
      <label class="check"><input type="checkbox" id="ds-tr" ${c.transmettre ? 'checked' : ''} ${dis}> Transmettre aux compagnons les fichiers ajoutés par le répertoire (sinon : visibles du bureau seulement)</label>
      <p class="small">${e.erreur ? `<span class="neg">${esc(e.erreur)}</span>` : e.dernier ? `Dernier passage : ${new Date(e.dernier).toLocaleString('fr-FR')} (${e.duree} ms) · ${esc(bilanSynchro(e))}` : 'Pas encore synchronisé.'}</p>
      ${(e.alertes || []).length ? `<ul class="small warn-text">${e.alertes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${(e.ignores || []).length ? `<details class="small"><summary>${e.ignores.length} fichier(s) ignoré(s)</summary><ul>${e.ignores.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
      <div class="toolbar" style="margin:10px 0 0">${admin ? '<button id="ds-save">Enregistrer</button>' : ''}<button class="secondary" id="ds-now">🔄 Synchroniser maintenant</button></div>`;
    const $ = s => carte.querySelector(s);
    if ($('#ds-save')) $('#ds-save').onclick = () => api('PUT', '/api/documents/dossier', { chemin: c.impose ? undefined : $('#ds-ch').value, actif: $('#ds-actif').checked, transmettre: $('#ds-tr').checked, intervalle: num($('#ds-int').value) })
      .then(() => { App.toast('Répertoire enregistré'); setTimeout(() => App.render(), 800); }).catch(err => notify(err.message));
    $('#ds-now').onclick = () => api('POST', '/api/documents/dossier/synchro', {}).then(r => { App.toast(bilanSynchro(r), 4000); return Store.load(); }).then(() => App.render()).catch(err => notify(err.message));
  });
}
