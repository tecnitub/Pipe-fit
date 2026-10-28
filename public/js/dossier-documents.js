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

// Paramètres (administrateur) : pièces jointes recopiées dans l'arborescence du serveur, sauvegarde quotidienne de la base
function reglagesReseauCarte() {
  if (Store.me.role !== 'admin') return '';
  return `<h2>Pièces jointes et sauvegardes sur le réseau</h2><div class="card" id="rs-carte"><p class="muted small">Chargement…</p></div>`;
}
function bindReglagesReseau(root) {
  const carte = root.querySelector('#rs-carte');
  if (!carte) return;
  if (window.PIPEFIT_DEMO) { carte.innerHTML = '<p class="muted small" style="margin:0">Dans la version installée : toutes les pièces jointes (offres, factures fournisseurs, photos, prises de cotes…) sont recopiées dans une arborescence par chantier sur le serveur ou le NAS, et la base est sauvegardée chaque soir dans le dossier de votre choix.</p>'; return; }
  const dessiner = e => {
    if (!carte.isConnected) return;
    const pj = e.pj, sv = e.sauvegarde, pc = pj.config, sc = sv.config;
    carte.innerHTML = `<p class="muted small" style="margin-top:0">Copie de sécurité en sens unique, lisible depuis l'explorateur : <code>Chantiers\\&lt;code&gt; - &lt;nom&gt;\\Offres fournisseurs</code>, <code>Factures fournisseurs</code>,
      <code>Commandes fournisseurs</code>, <code>Rapports d'intervention</code>, <code>Prise de cotes</code>… ; hors chantier : <code>Hors chantier\\&lt;rubrique&gt;\\&lt;année&gt;</code>, <code>Entreprises</code>, <code>Bibliothèque\\FDS</code>.
      Rien n'est effacé ni relu depuis ce dossier. Chemin réseau possible (ex. <code>\\\\NAS\\PipeFit\\Pièces jointes</code>) si le compte qui fait tourner Pipe-Fit y a les droits d'écriture.</p>
      <div class="field"><label for="rs-pjch">Dossier des pièces jointes</label><input id="rs-pjch" value="${esc(pc.chemin)}" ${pc.impose ? 'disabled' : ''}>${pc.impose ? '<span class="small muted">Imposé par la variable PJ_DIR.</span>' : ''}</div>
      <label class="check"><input type="checkbox" id="rs-pjact" ${pc.actif ? 'checked' : ''} ${pc.impose ? 'disabled' : ''}> Recopier toutes les pièces jointes (toutes les 2 minutes)</label>
      <p class="small">${pj.erreur ? `<span class="neg">${esc(pj.erreur)}</span>` : pj.dernier ? `Dernier passage : ${new Date(pj.dernier).toLocaleString('fr-FR')} · ${pj.enregistres || 0} fichier(s) sur le réseau${pj.copies ? `, ${pj.copies} nouveau(x)` : ''}` : 'Pas encore copiées.'}</p>
      ${(pj.erreurs || []).length ? `<ul class="small warn-text">${pj.erreurs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <hr>
      <div class="grid2">
        <div class="field"><label for="rs-svch">Dossier des sauvegardes de la base</label><input id="rs-svch" value="${esc(sc.chemin)}" ${sc.impose ? 'disabled' : ''}>${sc.impose ? '<span class="small muted">Imposé par la variable BACKUP_DIR.</span>' : '<span class="small muted">De préférence sur un autre disque ou un NAS.</span>'}</div>
        <div class="grid2"><div class="field"><label for="rs-svh">Chaque jour à</label><select id="rs-svh">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === sc.heure ? 'selected' : ''}>${h} h</option>`).join('')}</select></div>
        <div class="field"><label for="rs-svj">Garder (jours)</label><input id="rs-svj" type="number" min="1" max="365" value="${esc(sc.conserver)}"></div></div>
      </div>
      <label class="check"><input type="checkbox" id="rs-svact" ${sc.actif ? 'checked' : ''} ${sc.impose ? 'disabled' : ''}> Sauvegarder la base automatiquement (données, comptes, pièces jointes et réglages)</label>
      <p class="small">${sv.erreur ? `<span class="neg">${esc(sv.erreur)}</span>` : sc.dernier ? `Dernière sauvegarde : ${new Date(sc.dernier).toLocaleString('fr-FR')}` : '<span class="warn-text">Aucune sauvegarde pour l\'instant.</span>'}</p>
      ${sv.fichiers.length ? `<details class="small"><summary>${sv.fichiers.length} sauvegarde(s) dans le dossier</summary><ul>${sv.fichiers.map(f => `<li>${esc(f.nom)} · ${tailleLisible(f.taille)}</li>`).join('')}</ul></details>` : ''}
      <p class="muted small">Restaurer : arrêter Pipe-Fit, remplacer <code>pipefit.db</code> du dossier des données par la sauvegarde choisie (renommée <code>pipefit.db</code>), redémarrer.</p>
      <div class="toolbar" style="margin:10px 0 0"><button id="rs-save">Enregistrer</button><button class="secondary" id="rs-pj">📎 Recopier les pièces jointes</button><button class="secondary" id="rs-sv">💾 Sauvegarder maintenant</button></div>`;
    const $ = s => carte.querySelector(s);
    const action = (b, url, msg) => async () => {
      b.disabled = true;
      try { const r = await api('POST', url, {}); dessiner(r); App.toast(msg(r), 4000); } catch (err) { notify(err.message); b.disabled = false; }
    };
    $('#rs-save').onclick = () => api('PUT', '/api/reseau', { pj: { actif: $('#rs-pjact').checked, chemin: pc.impose ? undefined : $('#rs-pjch').value },
      sauvegarde: { actif: $('#rs-svact').checked, chemin: sc.impose ? undefined : $('#rs-svch').value, heure: $('#rs-svh').value, conserver: $('#rs-svj').value } })
      .then(r => { dessiner(r); App.toast('Réglages enregistrés'); }).catch(err => notify(err.message));
    $('#rs-pj').onclick = action($('#rs-pj'), '/api/reseau/pj', r => r.pj.erreur || `${r.pj.enregistres || 0} pièce(s) jointe(s) sur le réseau`);
    $('#rs-sv').onclick = action($('#rs-sv'), '/api/reseau/sauvegarde', r => r.sauvegarde.erreur || `Sauvegarde faite : ${r.sauvegarde.fichier} (${tailleLisible(r.sauvegarde.taille)})`);
  };
  api('GET', '/api/reseau').then(dessiner).catch(e => { carte.innerHTML = `<p class="neg">${esc(e.message)}</p>`; });
}
