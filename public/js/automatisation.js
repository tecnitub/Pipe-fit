// API et automatisations : clés personnelles, webhooks sortants, documentation et exemples
// (Power Automate, Make, Zapier, n8n, PowerShell, scripts, badgeuse, logiciel de dessin…).
const COLL_LIB = { devis: 'Devis', affaires: 'Chantiers', factures: 'Factures et avoirs', situations: 'Situations (BL)', commandes: 'Commandes fournisseurs', achats: 'Factures fournisseurs',
  consultations: 'Consultations fournisseurs', temps: 'Pointages', frais: 'Notes de frais', rapports: 'Rapports et bons d\'intervention', receptions: 'PV de réception', reserves: 'Réserves', epreuves: 'PV d\'épreuve hydraulique',
  entreprises: 'Entreprises', contacts: 'Contacts', articles: 'Fournitures (bibliothèque)', ouvrages: 'Ouvrages types', mainoeuvre: 'Main-d\'œuvre', efactures: 'Factures électroniques reçues', planning: 'Planning', envois: 'E-mails envoyés' };

Views.api = () => {
  const admin = Store.can('admin'), base = location.origin.startsWith('http') ? location.origin : 'https://votre-serveur';
  const ex = (titre, code) => `<details class="card api-ex"><summary><strong>${esc(titre)}</strong></summary><pre class="code">${esc(code)}</pre></details>`;
  return `<div class="toolbar"><a href="#/parametres" class="btn secondary">← Paramètres</a></div>
  <h1>API et automatisations</h1>
  <p class="muted">Tout ce que fait l'application est accessible par l'API : un autre logiciel, un script ou un outil d'automatisation (Power Automate, Make, Zapier, n8n…) peut lire, créer ou modifier devis, chantiers, pointages, commandes, factures… avec les droits du compte qui a créé la clé. Inversement, les <strong>webhooks</strong> préviennent ces outils à chaque création ou modification (devis accepté, facture émise, facture fournisseur reçue…).</p>

  <h2>Mes clés d'API</h2>
  <div class="card"><div class="toolbar"><input id="k-nom" placeholder="Nom de la clé (ex. Power Automate compta)" style="max-width:340px"><button id="k-add">Créer une clé</button></div>
    <div id="k-liste"><p class="muted small">Chargement…</p></div>
    <p class="muted small">La clé n'est affichée qu'une fois : conservez-la dans le coffre de l'outil qui l'utilise. Une clé révoquée cesse immédiatement de fonctionner.</p></div>

  ${admin ? `<h2>Webhooks (notifications sortantes)</h2>
  <div class="card"><p class="muted small" style="margin-top:0">À chaque création, modification ou suppression dans les listes choisies, le serveur envoie un POST JSON <code>{ evenement: "factures.creation", collection, id, date, donnees }</code> à l'adresse indiquée, signé par l'en-tête <code>X-PipeFit-Signature: sha256=…</code> (HMAC SHA-256 du corps avec le secret du webhook).</p>
    <div id="w-liste"><p class="muted small">Chargement…</p></div>
    <div class="toolbar"><button class="secondary" id="w-add">+ Webhook</button><button id="w-save">Enregistrer les webhooks</button></div></div>` : ''}

  <h2>Documentation</h2>
  <div class="card">
    <p style="margin-top:0">Adresse : <code>${esc(base)}/api/…</code> · en-tête <code>Authorization: Bearer pf_…</code> · corps et réponses en JSON (<code>Content-Type: application/json</code>).
      Description complète au format OpenAPI (import direct dans un connecteur personnalisé Power Automate, Make, Postman…) : <a href="${esc(base)}/api/openapi.json" target="_blank" rel="noopener">/api/openapi.json</a>.</p>
    <div class="table-wrap"><table class="compact"><tr><th>Méthode</th><th>Adresse</th><th>Rôle</th></tr>
      <tr><td>GET</td><td><code>/api/records/{liste}?modifieDepuis=…&amp;filtre=champ:valeur&amp;limite=…</code></td><td>Lister (synchronisation incrémentale avec <code>modifieDepuis</code>)</td></tr>
      <tr><td>GET</td><td><code>/api/records/{liste}/{id}</code></td><td>Lire un élément</td></tr>
      <tr><td>PUT</td><td><code>/api/records/{liste}/{id}</code></td><td>Créer (nouvel id) ou modifier : <code>{ data, version }</code> ; les numéros sont attribués par le serveur, un conflit de version renvoie 409</td></tr>
      <tr><td>DELETE</td><td><code>/api/records/{liste}/{id}</code></td><td>Supprimer (selon les droits ; jamais une facture numérotée)</td></tr>
      <tr><td>POST</td><td><code>/api/bulk/{articles|mainoeuvre|entreprises|contacts}</code></td><td>Import groupé <code>{ items: […] }</code> (mise à jour des prix fournisseurs…)</td></tr>
      <tr><td>POST</td><td><code>/api/efacture/import</code></td><td>Déposer une facture électronique fournisseur <code>{ nom, base64 }</code></td></tr>
      <tr><td>POST</td><td><code>/api/mail</code></td><td>Envoyer un e-mail par Microsoft 365</td></tr>
      <tr><td>GET</td><td><code>/api/data</code></td><td>Toutes les données (sauvegarde, tableau de bord externe Power BI / Excel)</td></tr></table></div>
    <p class="small">Listes disponibles : ${Object.entries(COLL_LIB).map(([k, l]) => `<code>${k}</code> (${esc(l)})`).join(', ')}.</p>
  </div>
  ${ex('Lister les factures émises (PowerShell)', `$h = @{ Authorization = "Bearer pf_VOTRE_CLE" }\nInvoke-RestMethod "${base}/api/records/factures?filtre=statut:Émise" -Headers $h |\n  Select-Object numero, date, echeance | Format-Table`)}
  ${ex('Pointer des heures depuis une badgeuse (curl)', `curl -X PUT "${base}/api/records/temps/badge-20261014-o1" \\\n  -H "Authorization: Bearer pf_VOTRE_CLE" -H "Content-Type: application/json" \\\n  -d '{"data":{"userId":"o1","affaireId":"af1","date":"2026-10-14","debut":"07:30","fin":"16:30","pause":60,"heures":8,"tache":"Montage","statut":""}}'`)}
  ${ex('Mettre à jour les prix d\'achat d\'un fournisseur (curl)', `curl -X POST "${base}/api/bulk/articles" \\\n  -H "Authorization: Bearer pf_VOTRE_CLE" -H "Content-Type: application/json" \\\n  -d '{"items":[{"id":"a1","coutRevient":42.5},{"id":"a4","coutRevient":21.9}]}'`)}
  ${ex('Synchroniser les chantiers modifiés depuis la dernière fois (Python)', `import requests\nh = {"Authorization": "Bearer pf_VOTRE_CLE"}\nr = requests.get("${base}/api/records/affaires", headers=h, params={"modifieDepuis": "2026-10-01T00:00:00Z"})\nfor ch in r.json():\n    print(ch["code"], ch["nom"], ch["statut"])`)}
  ${ex('Power Automate : prévenir dans Teams à chaque devis accepté', `1. Flux automatisé « Lors de la réception d'une requête HTTP » : copiez l'URL générée.\n2. Ici, ajoutez un webhook avec cette URL et la liste « Devis ».\n3. Condition : evenement = devis.modification ET donnees/statut = Accepté.\n4. Action « Publier un message dans une conversation Teams » avec donnees/numero et donnees/objet.`)}
  ${ex('Vérifier la signature d\'un webhook (Node.js)', `const crypto = require('crypto');\nconst attendu = 'sha256=' + crypto.createHmac('sha256', SECRET).update(corpsBrut).digest('hex');\nif (attendu !== req.headers['x-pipefit-signature']) throw new Error('Signature invalide');`)}`;
};

Views.api.bind = root => {
  const q = s => root.querySelector(s);
  const chargerCles = () => api('GET', '/api/cles').then(l => {
    q('#k-liste').innerHTML = l.length ? `<div class="table-wrap"><table class="compact"><tr><th>Nom</th><th>Clé</th>${Store.can('admin') ? '<th>Compte</th>' : ''}<th>Créée le</th><th>Dernière utilisation</th><th></th></tr>
      ${l.map(k => `<tr><td>${esc(k.nom)}</td><td><code>${esc(k.prefixe)}…</code></td>${Store.can('admin') ? `<td>${esc(k.login)}</td>` : ''}<td>${dateFr((k.creeLe || '').slice(0, 10))}</td><td>${k.utiliseeLe ? new Date(k.utiliseeLe).toLocaleString('fr-FR') : 'jamais'}</td>
        <td><button class="small danger" data-rev="${esc(k.id)}">Révoquer</button></td></tr>`).join('')}</table></div>` : '<p class="muted small">Aucune clé.</p>';
    q('#k-liste').querySelectorAll('[data-rev]').forEach(b => b.onclick = () => ask('Révoquer cette clé ? Les outils qui l\'utilisent cesseront de fonctionner.', 'Révoquer').then(ok => ok && api('DELETE', `/api/cles/${b.dataset.rev}`).then(chargerCles)));
  }).catch(e => { q('#k-liste').innerHTML = `<p class="neg">${esc(e.message)}</p>`; });
  chargerCles();
  q('#k-add').onclick = async () => {
    try {
      const r = await api('POST', '/api/cles', { nom: q('#k-nom').value.trim() || 'Clé API' });
      const box = Modal.open(`<h2 style="margin-top:0">Nouvelle clé d'API</h2><p>Copiez-la maintenant : elle ne sera plus affichée.</p><pre class="code" id="k-val">${esc(r.cle)}</pre>
        <div class="modal-actions"><button class="secondary" id="k-copy">Copier</button><button id="k-ok">J'ai copié la clé</button></div>`);
      box.querySelector('#k-copy').onclick = () => navigator.clipboard.writeText(r.cle).then(() => App.toast('Clé copiée')).catch(() => notify('Copie impossible : sélectionnez la clé.'));
      box.querySelector('#k-ok').onclick = () => { Modal.close(); q('#k-nom').value = ''; chargerCles(); };
    } catch (e) { notify(e.message); }
  };
  if (!Store.can('admin')) return;
  let hooks = [];
  const dessiner = () => {
    q('#w-liste').innerHTML = hooks.length ? hooks.map((w, i) => `<fieldset class="doc-opts wh" data-w="${i}"><legend>${esc(w.nom || 'Webhook')}</legend>
      <div class="grid2"><div class="field"><label>Nom</label><input data-k="nom" value="${esc(w.nom || '')}"></div><div class="field"><label>Adresse (URL)</label><input data-k="url" value="${esc(w.url || '')}" placeholder="https://…"></div></div>
      <div class="chips">${['*', ...Object.keys(COLL_LIB)].map(c => `<label class="chip"><input type="checkbox" data-c="${c}" ${(w.collections || []).includes(c) ? 'checked' : ''}><span>${c === '*' ? 'Toutes les listes' : esc(COLL_LIB[c])}</span></label>`).join('')}</div>
      <label class="check"><input type="checkbox" data-k="actif" ${w.actif ? 'checked' : ''}> Actif</label>
      ${w.secret ? `<p class="small">Secret de signature : <code>${esc(w.secret)}</code>${w.dernier ? ` · dernier envoi ${new Date(w.dernier.date).toLocaleString('fr-FR')} : <strong>${esc(String(w.dernier.statut))}</strong>` : ''}</p>` : ''}
      <div class="toolbar">${w.id && w.secret ? `<button class="secondary small" data-test="${esc(w.id)}" type="button">Envoyer un test</button>` : ''}<button class="small danger" data-wdel="${i}" type="button">Supprimer</button></div></fieldset>`).join('') : '<p class="muted small">Aucun webhook.</p>';
    q('#w-liste').querySelectorAll('[data-wdel]').forEach(b => b.onclick = () => { lire(); hooks.splice(+b.dataset.wdel, 1); dessiner(); });
    q('#w-liste').querySelectorAll('[data-test]').forEach(b => b.onclick = () => api('POST', `/api/webhooks/${b.dataset.test}/test`, {}).then(r => { notify(`Réponse de l'adresse : ${r.statut}`); return api('GET', '/api/webhooks'); }).then(l => { if (l) { hooks = l; dessiner(); } }).catch(e => notify(e.message)));
  };
  const lire = () => q('#w-liste').querySelectorAll('[data-w]').forEach(fs => {
    const w = hooks[+fs.dataset.w];
    w.nom = fs.querySelector('[data-k="nom"]').value; w.url = fs.querySelector('[data-k="url"]').value.trim(); w.actif = fs.querySelector('[data-k="actif"]').checked;
    w.collections = [...fs.querySelectorAll('[data-c]:checked')].map(c => c.dataset.c);
  });
  api('GET', '/api/webhooks').then(l => { hooks = l; dessiner(); }).catch(e => { q('#w-liste').innerHTML = `<p class="neg">${esc(e.message)}</p>`; });
  q('#w-add').onclick = () => { lire(); hooks.push({ nom: '', url: '', collections: ['devis', 'factures'], actif: true }); dessiner(); };
  q('#w-save').onclick = () => { lire(); api('PUT', '/api/webhooks', { liste: hooks }).then(l => { hooks = l; dessiner(); App.toast('Webhooks enregistrés'); }).catch(e => notify(e.message)); };
};
