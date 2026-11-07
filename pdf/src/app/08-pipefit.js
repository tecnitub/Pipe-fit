  // ---------- Pipe-Fit : documents des chantiers ----------
  // Connexion personnelle : identifiant et mot de passe Pipe-Fit -> jeton temporaire (12 h), révoqué à la déconnexion.
  // Aucun secret permanent n'est gardé sur le PC (une page locale peut lire le stockage des autres pages locales).
  // Gardés : l'adresse du serveur et l'identifiant ; le jeton jusqu'à son expiration.
  const PF = { url: '', login: '', jeton: '', expire: 0, nom: '' };
  try {
    PF.url = localStorage.getItem('atelierpdf.pipefit.url') || '';
    PF.login = localStorage.getItem('atelierpdf.pipefit.login') || '';
    const j = JSON.parse(localStorage.getItem('atelierpdf.pipefit.jeton') || 'null');
    if (j && j.expire > Date.now()) Object.assign(PF, j);
    localStorage.removeItem('atelierpdf.pipefit.cle'); // ancienne clé permanente (version 1.6) : effacée
  } catch { /* rien */ }
  const connecte = () => !!(PF.url && PF.jeton && PF.expire > Date.now() + 60000);
  const CATEGORIES_PF = ['Plan', 'Fiche technique', 'Notice', 'Demande client', 'Sécurité / PPSPS', 'PGC', 'Plan de prévention', 'Photo', 'Autre'];
  const echapper = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function pf(chemin, opts = {}) {
    let r;
    try {
      r = await fetch(`${PF.url.replace(/\/+$/, '')}/api/${chemin}`, { ...opts, headers: { ...(PF.jeton ? { Authorization: `Bearer ${PF.jeton}` } : {}), ...(opts.headers || {}) } });
    } catch { throw new Error(`serveur injoignable (${PF.url}) : vérifiez l'adresse et que le PC est sur le réseau de l'entreprise`); }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 && PF.jeton) { oublierJeton(); throw new Error('session expirée'); }
      throw new Error(r.status === 409 ? 'conflit' : (j.error || `erreur ${r.status}`));
    }
    return r;
  }
  const auteurPipeFit = () => (PF.nom ? `${PF.nom} (Atelier PDF)` : 'Atelier PDF');
  function oublierJeton() {
    Object.assign(PF, { jeton: '', expire: 0, nom: '' });
    try { localStorage.removeItem('atelierpdf.pipefit.jeton'); } catch { /* rien */ }
  }
  async function deconnexionPipeFit() {
    if (PF.jeton) { try { await pf('atelier/deconnexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch { /* déjà expirée */ } }
    oublierJeton();
    note('Déconnecté de Pipe-Fit.', 'ok');
  }
  const dlg = {
    ouvrir(titre, html, ok = null) {
      $('#pf-titre').textContent = titre;
      $('#pf-contenu').innerHTML = html;
      $('#pf-message').textContent = '';
      $('#pf-ok').hidden = !ok;
      if (ok) { $('#pf-ok').textContent = ok.texte; $('#pf-ok').onclick = ok.action; }
      $('#dlg-pf').hidden = false;
    },
    message(t, erreur = false) { $('#pf-message').textContent = t; $('#pf-message').style.color = erreur ? '#c62828' : ''; },
    fermer() { $('#dlg-pf').hidden = true; },
  };
  $('#pf-annuler').onclick = () => dlg.fermer();

  function connexionPipeFit(ensuite = null) {
    dlg.ouvrir('Connexion à Pipe-Fit', `
      <label class="champ">Adresse de Pipe-Fit<input id="pf-url" placeholder="http://SERVEUR:3000" value="${echapper(PF.url)}"></label>
      <label class="champ">Identifiant Pipe-Fit<input id="pf-login" autocomplete="username" value="${echapper(PF.login)}"></label>
      <label class="champ">Mot de passe<input id="pf-mdp" type="password" autocomplete="current-password"></label>
      <p class="aide">Votre compte Pipe-Fit habituel : vos droits s'appliquent (modifier les chantiers pour y enregistrer des documents),
      et Pipe-Fit note qui a enregistré quoi. La connexion dure 12 heures ; le mot de passe n'est pas gardé sur ce PC.</p>`,
    { texte: 'Se connecter', action: async () => {
      PF.url = $('#pf-url').value.trim().replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(PF.url)) PF.url = `http://${PF.url}`;
      PF.login = $('#pf-login').value.trim();
      oublierJeton();
      dlg.message('Connexion…');
      try {
        const r = await (await pf('atelier/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login: PF.login, password: $('#pf-mdp').value, appareil: 'Atelier PDF' }) })).json();
        Object.assign(PF, { jeton: r.jeton, expire: r.expire, nom: r.nom });
        try {
          localStorage.setItem('atelierpdf.pipefit.url', PF.url);
          localStorage.setItem('atelierpdf.pipefit.login', PF.login);
          localStorage.setItem('atelierpdf.pipefit.jeton', JSON.stringify({ jeton: PF.jeton, expire: PF.expire, nom: PF.nom }));
        } catch { /* rien */ }
        note(`Connecté à Pipe-Fit (${r.nom}) jusqu'à ${new Date(r.expire).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`, 'ok');
        dlg.fermer();
        if (ensuite) ensuite();
      } catch (e) { dlg.message(`Connexion impossible : ${e.message}`, true); }
    } });
    setTimeout(() => (PF.login ? $('#pf-mdp') : $('#pf-login')).focus(), 0);
  }
  async function chantiers() {
    const liste = await (await pf('records/affaires?limite=5000')).json();
    return liste.filter(a => a.type !== 'modele').sort((a, b) => String(b.code || '').localeCompare(String(a.code || '')));
  }
  const nomChantier = a => [a.code, a.nom].filter(Boolean).join(' – ');
  // Liste de chantiers avec recherche ; choix(a) appelé au clic
  function listeChantiers(liste, choix, choisiId = null) {
    $('#pf-contenu').innerHTML = `<input id="pf-filtre" placeholder="Rechercher un chantier (code, nom)…"><ul class="pf-liste" id="pf-chantiers"></ul>`;
    const remplir = () => {
      const f = sansAccent($('#pf-filtre').value.trim());
      const ul = $('#pf-chantiers');
      ul.replaceChildren(...liste.filter(a => !f || sansAccent(nomChantier(a)).includes(f)).slice(0, 300).map(a => {
        const li = document.createElement('li');
        li.innerHTML = `<b>${echapper(a.code || '')}</b> ${echapper(a.nom || '')}<span class="muet">${(a.documents || []).length} document(s)</span>`;
        if (a.id === choisiId) li.classList.add('choisi');
        li.onclick = () => choix(a);
        return li;
      }));
    };
    $('#pf-filtre').oninput = remplir;
    remplir();
    $('#pf-filtre').focus();
  }
  async function ouvrirDepuisPipeFit() {
    if (!connecte()) return connexionPipeFit(ouvrirDepuisPipeFit);
    dlg.ouvrir('Ouvrir un document d\'un chantier', '<p>Chargement des chantiers…</p>');
    let liste;
    try { liste = await chantiers(); } catch (e) { if (/session expirée/.test(e.message)) return connexionPipeFit(ouvrirDepuisPipeFit); dlg.message(e.message, true); return; }
    const montrerDocs = a => {
      const docs = (a.documents || []).filter(d => /pdf|image/.test(d.mime || '') || /\.(pdf|png|jpe?g)$/i.test(d.nom || ''));
      $('#pf-titre').textContent = nomChantier(a);
      $('#pf-contenu').innerHTML = `<button id="pf-retour">← Chantiers</button><ul class="pf-liste" id="pf-docs"></ul>`;
      $('#pf-retour').onclick = () => { $('#pf-titre').textContent = 'Ouvrir un document d\'un chantier'; listeChantiers(liste, montrerDocs); };
      $('#pf-docs').replaceChildren(...(docs.length ? docs.map(d => {
        const li = document.createElement('li');
        li.innerHTML = `${echapper(d.nom)}<span class="muet">${echapper(d.categorie || '')}${d.indice ? ` · ind. ${echapper(d.indice)}` : ''}</span>`;
        li.onclick = async () => {
          dlg.message(`Téléchargement de « ${d.nom} »…`);
          try {
            const octets = await (await pf(`files/${encodeURIComponent(d.fichierId)}`)).arrayBuffer();
            const type = /pdf/.test(d.mime || '') || /\.pdf$/i.test(d.nom) ? 'application/pdf' : (d.mime || 'image/jpeg');
            etat.origineImport = { affaireId: a.id, chantier: nomChantier(a), docId: d.id, nom: d.nom, categorie: d.categorie, indice: d.indice || '' };
            try { await importer([new File([octets], d.nom, { type })]); } finally { etat.origineImport = null; }
            dlg.fermer();
          } catch (e) { dlg.message(`Téléchargement impossible : ${e.message}`, true); }
        };
        return li;
      }) : [Object.assign(document.createElement('li'), { textContent: 'Aucun PDF ni image dans ce chantier.' })]));
    };
    listeChantiers(liste, montrerDocs);
  }
  const indiceSuivant = i => (/^[A-Y]$/i.test(i || '') ? String.fromCharCode(i.toUpperCase().charCodeAt(0) + 1) : /^\d+$/.test(i || '') ? String(+i + 1) : i ? `${i}+` : 'B');
  async function enregistrerDansPipeFit() {
    if (!etat.pages.length) return;
    if (!connecte()) return connexionPipeFit(enregistrerDansPipeFit);
    if (!$('#editeur').hidden) validerEditeur();
    dlg.ouvrir('Enregistrer dans un chantier', '<p>Chargement des chantiers…</p>');
    let liste;
    try { liste = await chantiers(); } catch (e) { if (/session expirée/.test(e.message)) return connexionPipeFit(enregistrerDansPipeFit); dlg.message(e.message, true); return; }
    const origine = [...new Set(etat.pages.map(p => etat.sources.get(p.source)?.pipefit).filter(Boolean))][0];
    const formulaire = a => {
      const docs = (a.documents || []).filter(d => /pdf/.test(d.mime || '') || /\.pdf$/i.test(d.nom || ''));
      const docOrigine = origine && origine.affaireId === a.id ? docs.find(d => d.id === origine.docId) : null;
      const nomDefaut = `${nomFichier($('#o-titre').value.trim() || etat.sources.get(etat.pages[0].source)?.nom || 'Document')}.pdf`;
      $('#pf-titre').textContent = `Enregistrer dans ${nomChantier(a)}`;
      $('#pf-contenu').innerHTML = `
        <button id="pf-retour">← Choisir un autre chantier</button>
        <label class="radio"><input type="radio" name="pf-mode" value="nouveau" ${docOrigine ? '' : 'checked'}> Nouveau document</label>
        <div class="sous ouvert">
          <label class="champ">Nom<input id="pf-nom" value="${echapper(nomDefaut)}"></label>
          <label class="champ">Catégorie<select id="pf-cat">${CATEGORIES_PF.map(c => `<option ${c === (origine?.categorie || 'Plan') ? 'selected' : ''}>${echapper(c)}</option>`).join('')}</select></label>
        </div>
        <label class="radio"><input type="radio" name="pf-mode" value="indice" ${docOrigine ? 'checked' : ''} ${docs.length ? '' : 'disabled'}> Nouvel indice d'un document du chantier (l'indice actuel est gardé dans l'historique)</label>
        <div class="sous ouvert"><select id="pf-doc" ${docs.length ? '' : 'disabled'}>${docs.map(d => `<option value="${echapper(d.id)}" ${docOrigine && d.id === docOrigine.id ? 'selected' : ''}>${echapper(d.nom)}${d.indice ? ` (ind. ${echapper(d.indice)} → ${echapper(indiceSuivant(d.indice))})` : ''}</option>`).join('')}</select></div>
        <label class="case"><input type="checkbox" id="pf-visible"> Transmettre aux compagnons (visible sur leur téléphone)</label>`;
      $('#pf-retour').onclick = () => { $('#pf-ok').hidden = true; listeChantiers(liste, formulaire, a.id); };
      $('#pf-ok').hidden = false;
      $('#pf-ok').textContent = 'Enregistrer';
      $('#pf-ok').onclick = () => envoyer(a);
    };
    const envoyer = async a => {
      const mode = document.querySelector('input[name=pf-mode]:checked')?.value;
      const nom = (() => { const n = nomFichier($('#pf-nom').value.trim() || 'Document'); return /\.pdf$/i.test(n) ? n : `${n}.pdf`; })();
      const docId = $('#pf-doc').value, visible = $('#pf-visible').checked, categorie = $('#pf-cat').value;
      $('#pf-ok').disabled = true;
      try {
        dlg.message('Création du PDF…');
        const octets = await produire(etat.pages, options());
        dlg.message('Envoi à Pipe-Fit…');
        const doc = mode === 'indice' ? (a.documents || []).find(d => d.id === docId) : null;
        const envoi = await (await pf('documents/fichier', { method: 'POST', headers: { 'X-PipeFit-Upload': '1', 'X-Filename': encodeURIComponent(doc ? doc.nom : nom) }, body: new Blob([octets], { type: 'application/pdf' }) })).json();
        // Ajout au chantier ; si quelqu'un a modifié le chantier entre-temps : relu puis réessayé
        for (let essai = 0; essai < 3; essai++) {
          const actuel = await (await pf(`records/affaires/${encodeURIComponent(a.id)}`)).json();
          const documents = (actuel.documents || []).map(d => ({ ...d }));
          const aujourdhui = new Date().toISOString().slice(0, 10);
          const d = doc && documents.find(x => x.id === doc.id);
          if (d) {
            d.anciens = [...(d.anciens || []), { fichierId: d.fichierId, indice: d.indice || 'A', date: d.date }];
            Object.assign(d, { fichierId: envoi.id, mime: envoi.mime, taille: envoi.taille, indice: indiceSuivant(d.indice || 'A'), date: aujourdhui, par: auteurPipeFit(), visible: visible || d.visible });
          } else {
            documents.push({ id: nouvelId('d'), fichierId: envoi.id, nom, categorie, indice: '', note: '', mime: envoi.mime, taille: envoi.taille, date: aujourdhui, par: auteurPipeFit(), visible });
          }
          try {
            await pf(`records/affaires/${encodeURIComponent(a.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { ...actuel, documents }, version: actuel._v }) });
            dlg.fermer();
            note(d ? `« ${d.nom} » : indice ${d.indice} enregistré dans ${nomChantier(a)}.` : `« ${nom} » enregistré dans ${nomChantier(a)}.`, 'ok');
            return;
          } catch (e) { if (e.message !== 'conflit') throw e; }
        }
        throw new Error('le chantier est modifié en ce moment par quelqu\'un d\'autre, réessayez');
      } catch (e) { dlg.message(`Enregistrement impossible : ${e.message}`, true); }
      finally { $('#pf-ok').disabled = false; }
    };
    const depart = origine && liste.find(a => a.id === origine.affaireId);
    if (depart) formulaire(depart); else listeChantiers(liste, formulaire);
  }
  $('#m-pf-ouvrir').onclick = () => { $('#menu-projet').hidden = true; ouvrirDepuisPipeFit(); };
  $('#m-pf-enregistrer').onclick = () => { $('#menu-projet').hidden = true; enregistrerDansPipeFit(); };
  $('#m-pf-connexion').onclick = () => { $('#menu-projet').hidden = true; connexionPipeFit(); };
  $('#m-pf-deconnexion').onclick = () => { $('#menu-projet').hidden = true; deconnexionPipeFit(); };
