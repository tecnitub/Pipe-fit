// Paramètres → E-mails : agent IA de tri des e-mails (configuration pour l'administrateur) et journal des e-mails triés.
function triMailsCarte() {
  return `<h2>🤖 Tri des e-mails par IA</h2><div class="card" id="tri-carte"><p class="muted small" style="margin:0">Chargement…</p></div>`;
}
function bindTriMails(root) {
  const carte = root.querySelector('#tri-carte');
  if (!carte) return;
  if (window.PIPEFIT_DEMO) {
    carte.innerHTML = '<p class="muted small" style="margin:0">Dans la version installée : un agent IA lit les nouveaux e-mails des boîtes Microsoft 365 choisies, reconnaît le chantier concerné, range le message dans Outlook (Chantiers/&lt;code&gt; - &lt;nom&gt;), enregistre l\'e-mail et ses pièces jointes dans les documents du chantier et prépare un brouillon de réponse à relire.</p>';
    return;
  }
  const admin = Store.can('admin');
  const vue = { filtre: '' };
  const badge = l => l.statut === 'erreur' ? '<span class="badge b-bad">Erreur</span>' : l.statut === 'classé' ? '<span class="badge b-ok">Classé</span>' : '<span class="badge b-warn">À trier</span>';
  const chantier = id => { const a = id && Store.get('affaires', id); return a ? `<a href="#/chantier/${esc(a.id)}">${esc(a.code)}</a> <span class="muted small">${esc(a.nom || '')}</span>` : '<span class="muted">—</span>'; };
  const journal = s => {
    const l = (s.journal || []).filter(x => !vue.filtre || (vue.filtre === 'urgent' ? x.urgent : x.statut === vue.filtre));
    return `<div class="toolbar" style="margin:8px 0"><select id="tri-filtre" style="width:auto"><option value="">Tous les e-mails</option>${[['classé', 'Classés dans un chantier'], ['à trier', 'À trier à la main'], ['urgent', 'Urgents'], ['erreur', 'En erreur']].map(([v, t]) => `<option value="${v}" ${vue.filtre === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <span class="spacer"></span><button class="secondary small" id="tri-relever" ${s.etat && (s.config ? s.config.actif : s.actif) ? '' : 'disabled'}>📥 Trier maintenant</button></div>
      ${l.length ? `<div class="table-wrap"><table><tr><th>Reçu le</th><th>De</th><th>Objet / résumé</th><th>Chantier</th><th>Nature</th><th>Réponse</th><th>Statut</th></tr>
      ${l.map(x => `<tr><td class="small">${esc(x.recuLe ? new Date(x.recuLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '')}${admin ? `<br><span class="muted">${esc(x.boite)}</span>` : ''}</td>
        <td>${esc(x.de || x.deEmail)}<br><span class="muted small">${esc(x.deEmail)}</span></td>
        <td>${x.urgent ? '<span class="badge b-bad">Urgent</span> ' : ''}<strong>${esc(x.objet || '(sans objet)')}</strong>${x.resume ? `<br><span class="small">${esc(x.resume)}</span>` : ''}${x.erreur ? `<br><span class="small neg">${esc(x.erreur)}</span>` : ''}</td>
        <td>${chantier(x.affaireId)}${x.dossier ? `<br><span class="muted small">📁 ${esc(x.dossier)}</span>` : ''}${x.documents ? `<br><span class="muted small">${x.documents} document(s) enregistré(s)</span>` : ''}</td>
        <td class="small">${esc(x.categorie || '')}${x.confiance && x.confiance !== 'haute' ? `<br><span class="muted">confiance ${esc(x.confiance)}</span>` : ''}</td>
        <td class="small">${x.brouillon ? '✍️ Brouillon prêt' : '<span class="muted">—</span>'}</td><td>${badge(x)}</td></tr>`).join('')}</table></div>` : '<p class="muted small">Aucun e-mail trié pour l\'instant.</p>'}`;
  };
  const resultat = r => r ? `${r.messages} e-mail(s) lu(s) · ${r.chantiers} rangé(s) dans un chantier · ${r.aTrier} à trier · ${r.brouillons} brouillon(s) de réponse${r.erreurs && r.erreurs.length ? ` · ${r.erreurs.length} erreur(s)` : ''}` : '';
  const formulaire = s => {
    const c = s.config;
    return `<p class="small" style="margin-top:0">Toutes les 5 minutes, chaque nouvel e-mail de la boîte de réception est lu par Claude (IA d'Anthropic) qui reconnaît le <strong>chantier</strong> (code cité, expéditeur, site, objet), la nature du message et son urgence. Le message est alors
      rangé dans Outlook (<em>Boîte de réception/${esc(c.dossierRacine)}/&lt;code&gt; - &lt;nom&gt;</em>, publicités dans « Publicités »), l'e-mail et ses pièces jointes sont enregistrés dans les documents du chantier (dossier « E-mails »)
      et une <strong>réponse est préparée en brouillon</strong> dans Outlook, à relire et envoyer vous-même : rien n'est envoyé automatiquement. Un e-mail dont le chantier n'est pas reconnu avec certitude reste dans la boîte de réception, avec sa catégorie.</p>
      ${!s.m365 ? '<p class="small warn-text">La connexion Microsoft 365 ci-dessus n\'est pas configurée.</p>' : ''}
      <p class="small muted">Prérequis : autorisation d'application <strong>Mail.ReadWrite</strong> (consentement administrateur) pour l'application Microsoft 365, et une clé d'API Anthropic (console.anthropic.com). Le texte des e-mails et la liste des chantiers ouverts sont transmis à l'API Anthropic pour l'analyse.</p>
      <div class="grid2">
        <div class="field"><label for="tri-boites">Boîtes à trier (une adresse par ligne)</label><textarea id="tri-boites" rows="3" placeholder="prenom.nom@votre-domaine.fr">${esc(c.boites.join('\n'))}</textarea>
          <button type="button" class="secondary small" id="tri-comptes">+ Adresses des comptes</button></div>
        <div>
          <div class="field"><label for="tri-cle">Clé d'API Anthropic ${s.config.cleDefinie ? (s.config.cleEnv ? '(variable ANTHROPIC_API_KEY du serveur)' : '(enregistrée, laisser vide pour la conserver)') : ''}</label><input id="tri-cle" type="password" autocomplete="new-password" placeholder="${s.config.cleDefinie ? '••••••••' : 'sk-ant-…'}"></div>
          <div class="field"><label for="tri-modele">Modèle</label><select id="tri-modele">${c.modeles.map(x => `<option value="${x}" ${x === c.modele ? 'selected' : ''}>${{ 'claude-opus-5-5': 'Claude Opus 5.5 (le plus précis)', 'claude-sonnet-5-5': 'Claude Sonnet 5.5 (rapide)', 'claude-haiku-5-5': 'Claude Haiku 5.5 (le plus économique)' }[x] || x}</option>`).join('')}</select></div>
          <div class="field"><label for="tri-racine">Dossier Outlook des chantiers</label><input id="tri-racine" value="${esc(c.dossierRacine)}"></div>
        </div>
      </div>
      <div class="field"><label for="tri-consignes">Consignes pour les réponses (facultatif)</label><textarea id="tri-consignes" rows="3" placeholder="Ex. : vouvoyer, proposer un rappel téléphonique pour toute panne, délai d'intervention habituel 48 h, ne jamais confirmer de prix par e-mail…">${esc(c.consignes)}</textarea></div>
      <label class="check"><input type="checkbox" id="tri-rep" ${c.reponses ? 'checked' : ''}> Préparer les réponses en brouillon</label>
      <label class="check"><input type="checkbox" id="tri-enr" ${c.enregistrer ? 'checked' : ''}> Enregistrer l'e-mail et ses pièces jointes dans les documents du chantier</label>
      <label class="check"><input type="checkbox" id="tri-ran" ${c.ranger ? 'checked' : ''}> Ranger les e-mails dans les dossiers Outlook</label>
      <label class="check"><input type="checkbox" id="tri-actif" ${c.actif ? 'checked' : ''}> <strong>Activer le tri automatique</strong> (à la première activation, les e-mails des dernières 24 heures sont triés)</label>
      <div class="toolbar" style="margin-top:8px"><button id="tri-save">Enregistrer</button>${c.cleDefinie && !c.cleEnv ? '<button class="secondary" id="tri-oublier">Supprimer la clé</button>' : ''}</div>`;
  };
  const afficher = s => {
    const e = s.etat || {};
    carte.innerHTML = `${admin ? formulaire(s) : `<p class="small" style="margin-top:0">${s.actif ? 'Le tri automatique est actif : vos nouveaux e-mails (si votre boîte fait partie des boîtes triées) sont rangés par chantier, enregistrés dans les documents du chantier, et une réponse est préparée dans vos brouillons Outlook.' : 'Le tri automatique des e-mails n\'est pas activé (réglage de l\'administrateur).'}</p>`}
      <p class="small">${e.dernier ? `Dernier passage : ${new Date(e.dernier).toLocaleString('fr-FR')}${e.resultat ? ` · ${esc(resultat(e.resultat))}` : ''}` : 'Pas encore de passage.'}${e.erreur ? `<br><span class="neg">${esc(e.erreur)}</span>` : ''}</p>
      <div id="tri-journal">${journal(s)}</div>`;
    const lier = () => {
      const f = carte.querySelector('#tri-filtre');
      f.onchange = () => { vue.filtre = f.value; carte.querySelector('#tri-journal').innerHTML = journal(s); lier(); };
      carte.querySelector('#tri-relever').onclick = ev => {
        ev.target.disabled = true; ev.target.textContent = 'Tri en cours…';
        api('POST', '/api/tri-mails/relever', {}).then(r => { App.toast(resultat(r.resultat), 6000); afficher(r); }).catch(err => { notify(err.message); ev.target.disabled = false; ev.target.textContent = '📥 Trier maintenant'; });
      };
    };
    lier();
    if (!admin) return;
    const q = sel => carte.querySelector(sel);
    const lire = extra => ({ boites: q('#tri-boites').value, cleApi: q('#tri-cle').value, modele: q('#tri-modele').value, dossierRacine: q('#tri-racine').value, consignes: q('#tri-consignes').value,
      reponses: q('#tri-rep').checked, enregistrer: q('#tri-enr').checked, ranger: q('#tri-ran').checked, actif: q('#tri-actif').checked, ...extra });
    q('#tri-save').onclick = () => api('PUT', '/api/tri-mails', lire()).then(r => { App.toast('Tri des e-mails enregistré'); afficher(r); }).catch(err => notify(err.message));
    const o = q('#tri-oublier');
    if (o) o.onclick = () => ask('Supprimer la clé d\'API Anthropic ? Le tri automatique sera arrêté.', 'Supprimer', true).then(ok => ok && api('PUT', '/api/tri-mails', lire({ oublierCle: true, actif: false })).then(afficher).catch(err => notify(err.message)));
    q('#tri-comptes').onclick = () => api('GET', '/api/accounts').then(l => {
      const t = q('#tri-boites'), deja = new Set(t.value.split(/\s+/).filter(Boolean).map(x => x.toLowerCase()));
      (Array.isArray(l) ? l : []).map(a => String(a.email || '').toLowerCase()).filter(x => x && !deja.has(x)).forEach(x => deja.add(x));
      t.value = [...deja].join('\n');
    }).catch(err => notify(err.message));
  };
  api('GET', '/api/tri-mails').then(afficher).catch(e => { carte.innerHTML = `<p class="neg small" style="margin:0">${esc(e.message)}</p>`; });
}
