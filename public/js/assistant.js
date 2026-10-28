// Assistant : on lui écrit (ou on lui dicte) une tâche, il prépare le travail dans Pipe-Fit avec les droits de la personne
// connectée (commande ou demande de prix en brouillon, point sur un chantier, planning ; pour un compagnon : les actions
// cochées dans les Paramètres). Rien ne part sans validation : la carte d'une commande ouvre le brouillon et l'envoi habituel.
// Le travail est fait par le serveur (server/assistant.js) ; ici, le fil de la conversation et les cartes d'action.
const Assistant = {
  conv: null, // { id, fil }
  attente: false,
  pret: () => !!(Store.me && Store.me.assistant && Store.me.assistant.actif),
};
const EXEMPLES_ASSISTANT = {
  bureau: ['Commande chez Téréva pour le chantier de Rumilly : 20 coudes 3D inox DN50 et 10 brides à collerette DN50 PN16, livraison jeudi sur le chantier',
    'Demande de prix à Téréva et Descours & Cabot pour 40 m de tube inox 316L DN50 sur le chantier des Tilleuls', 'Où en est le chantier CH-2026-001 ?', 'Qu\'est-ce que Kevin a au planning la semaine prochaine ?'],
  materiel: 'Il me faut 6 coudes 3D inox DN50 et 2 brides DN50 sur Rumilly pour lundi', planning: 'Où je suis demain ?', chantier: 'C\'est quoi l\'adresse et le contact du chantier des Tilleuls ?',
  signaler: 'Signale au bureau qu\'il manque les supports de la ligne vapeur sur Rumilly', articles: 'Quelle est la référence du coude 3D inox DN50 ?',
};

function carteAction(a) {
  if (a.type === 'commande') return `<div class="as-carte"><div><strong>Commande ${esc(a.numero || '')}</strong> <span class="badge">Brouillon</span><div class="small">${esc(a.fournisseur || '')} · ${esc(a.chantier || '')} · ${a.lignes} ligne(s) · ${eur(a.total || 0)} HT</div></div>
    <div class="as-boutons"><a class="btn small secondary" href="#/commandes/${esc(a.id)}">Ouvrir et vérifier</a>${Store.get('commandes', a.id) ? `<button class="small" data-as-envoyer="${esc(a.id)}">Valider et envoyer…</button>` : ''}</div></div>`;
  if (a.type === 'consultation') return `<div class="as-carte"><div><strong>Demande de prix ${esc(a.numero || '')}</strong> <span class="badge">Brouillon</span><div class="small">${esc((a.fournisseurs || []).join(', '))} · ${a.lignes} ligne(s)</div></div>
    <div class="as-boutons"><a class="btn small" href="#/consultations/${esc(a.id)}">Ouvrir et envoyer</a></div></div>`;
  if (a.type === 'demande') return `<div class="as-carte"><div><strong>Demande de matériel ${esc(a.numero || '')}</strong> <span class="badge b-info">Transmise au bureau</span><div class="small">${esc(a.chantier || '')} · ${a.lignes} ligne(s)</div></div></div>`;
  if (a.type === 'signalement') return `<div class="as-carte"><div><strong>Signalement transmis</strong> <span class="badge b-info">Bureau prévenu</span><div class="small">${esc(a.chantier || '')} ${esc(a.sujet || '')}</div></div></div>`;
  return '';
}

Views.assistant = () => {
  if (!Assistant.pret()) return `<h1>Assistant</h1><p class="note">L'assistant n'est pas activé pour votre compte.${Store.can('admin') ? ' Réglage : <a href="#/parametres">Paramètres → Assistant</a>.' : ' Demandez à l\'administrateur.'}</p>`;
  const ac = Store.me.assistant, fil = (Assistant.conv && Assistant.conv.fil) || [];
  const exemples = ac.bureau ? EXEMPLES_ASSISTANT.bureau : ac.droits.map(d => EXEMPLES_ASSISTANT[d]).filter(Boolean);
  return `<div class="toolbar"><h1 style="margin:0">✨ Assistant</h1><span class="spacer"></span>${fil.length ? '<button class="secondary small" id="as-nouveau">Nouvelle demande</button>' : ''}</div>
  ${ac.pause ? '<p class="note warn-text">L\'assistant est en pause : le plafond de dépense du mois est atteint. Il reprendra le mois prochain, ou quand l\'administrateur relèvera le plafond.</p>' : ''}
  <p class="muted small">${ac.bureau ? 'Confiez-lui une tâche : il retrouve le chantier, le fournisseur, les articles et les derniers prix, puis prépare la commande ou la demande de prix <strong>en brouillon</strong>. Rien n\'est envoyé sans votre validation.'
    : 'Demandez ce dont vous avez besoin : vos demandes sont transmises au bureau, qui valide.'}${window.PIPEFIT_DEMO ? ' <strong>Démonstration : assistant simulé (sans IA), il comprend surtout les commandes et les demandes de matériel.</strong>' : ''}</p>
  <div class="as-fil" id="as-fil">${fil.map(m => `<div class="as-msg ${m.role === 'user' ? 'as-moi' : 'as-lui'} ${m.erreur ? 'as-erreur' : ''}"><div class="as-bulle">${esc(m.texte).replace(/\n/g, '<br>')}</div>${(m.actions || []).map(carteAction).join('')}</div>`).join('')
    || `<div class="as-vide"><p class="muted">Par exemple :</p>${exemples.map(e => `<button type="button" class="as-exemple" data-as-ex="${esc(e)}">${esc(e)}</button>`).join('')}</div>`}
    ${Assistant.attente ? '<div class="as-msg as-lui"><div class="as-bulle as-pense">L\'assistant prépare… <span class="as-points"><i></i><i></i><i></i></span></div></div>' : ''}</div>
  <form class="as-saisie" id="as-form"><textarea id="as-texte" rows="3" data-dictee aria-label="Votre demande" placeholder="Votre demande…" ${Assistant.attente ? 'disabled' : ''}></textarea>
    <button id="as-go" ${Assistant.attente ? 'disabled' : ''}>Envoyer</button></form>`;
};
Views.assistant.bind = root => {
  if (!Assistant.pret()) return;
  const ta = root.querySelector('#as-texte'), fil = root.querySelector('#as-fil');
  fil.scrollTop = fil.scrollHeight;
  if (!Assistant.attente && !matchMedia('(pointer: coarse)').matches) ta.focus();
  const envoyer = async texte => {
    if (!texte.trim() || Assistant.attente) return;
    Assistant.conv = Assistant.conv || { id: '', fil: [] };
    Assistant.conv.fil = [...Assistant.conv.fil, { role: 'user', texte }];
    Assistant.attente = true; App.render();
    try {
      const r = await api('POST', '/api/assistant/message', { conversationId: Assistant.conv.id, texte });
      Assistant.conv = { id: r.conversationId, fil: r.fil };
      if ((r.actions || []).length) await Store.load().catch(() => {});
    } catch (e) { Assistant.conv.fil = [...Assistant.conv.fil, { role: 'assistant', texte: e.message, erreur: true }]; }
    Assistant.attente = false;
    if (location.hash.startsWith('#/assistant')) App.render();
    else App.toast('L\'assistant a répondu', 4000);
  };
  root.querySelector('#as-form').onsubmit = e => { e.preventDefault(); envoyer(ta.value); };
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); envoyer(ta.value); } };
  root.querySelectorAll('[data-as-ex]').forEach(b => b.onclick = () => { ta.value = b.dataset.asEx; ta.focus(); });
  root.querySelectorAll('[data-as-envoyer]').forEach(b => b.onclick = () => envoyerParMail('commande', b.dataset.asEnvoyer));
  const n = root.querySelector('#as-nouveau');
  if (n) n.onclick = () => { Assistant.conv = null; App.render(); };
};

// Bouton flottant sur les autres écrans
function boutonAssistant() {
  let b = document.getElementById('as-fab');
  const voir = Assistant.pret() && !location.hash.startsWith('#/assistant');
  if (!voir) { if (b) b.remove(); return; }
  if (b) return;
  b = document.createElement('a');
  b.id = 'as-fab'; b.href = '#/assistant'; b.className = 'as-fab no-print'; b.textContent = '✨'; b.title = 'Assistant'; b.setAttribute('aria-label', 'Assistant');
  document.body.appendChild(b);
}

// Paramètres (administrateur) : activation, clé API, modèle, actions ouvertes aux compagnons
function reglagesAssistantCarte() {
  if (Store.me.role !== 'admin') return '';
  return '<h2>Assistant</h2><div class="card" id="as-reglages"><p class="muted small">Chargement…</p></div>';
}
function bindReglagesAssistant(root) {
  const carte = root.querySelector('#as-reglages');
  if (!carte) return;
  api('GET', '/api/assistant/config').then(c => {
    if (!carte.isConnected) return;
    carte.innerHTML = `<p class="muted small" style="margin-top:0">L'assistant comprend une demande écrite ou dictée et prépare le travail dans Pipe-Fit (commande ou demande de prix en brouillon, point sur un chantier, planning) avec les droits de la personne. Rien n'est envoyé à un fournisseur ou à un client sans validation.
      Il utilise l'IA Claude (API Anthropic) : les éléments utiles à chaque demande (chantier, articles, prix) sont transmis au service pour être traités ; chaque demande est facturée par Anthropic selon le modèle.${window.PIPEFIT_DEMO ? ' <strong>Démonstration : assistant simulé, sans clé ni IA.</strong>' : ''}</p>
      <label class="check"><input type="checkbox" id="as-actif" ${c.actif ? 'checked' : ''}> Activer l'assistant (bureau : administrateurs et chargés d'affaires)</label>
      <div class="grid2"><div class="field"><label for="as-cle">Clé API Anthropic ${c.cleDefinie ? (c.cleEnv ? '(fournie par la variable ANTHROPIC_API_KEY)' : '(enregistrée, laisser vide pour la garder)') : ''}</label><input id="as-cle" type="password" autocomplete="new-password" placeholder="${c.cleDefinie ? '••••••••' : 'sk-ant-…'}"></div>
        <div class="field"><label for="as-modele">Modèle du bureau</label><select id="as-modele">${optionsModeles(c, c.modele)}</select></div>
        <div class="field"><label for="as-modele-comp">Modèle des compagnons</label><select id="as-modele-comp">${optionsModeles(c, c.modeleCompagnons)}</select></div>
        <div class="field"><label for="as-plafond">Plafond de dépense par mois ($, 0 = sans plafond)</label><input id="as-plafond" type="number" min="0" step="10" value="${esc(c.plafond || 0)}">
          <span class="small muted">Atteint : l'assistant se met en pause jusqu'au mois suivant et les administrateurs sont prévenus.</span></div></div>
      <div id="as-conso" class="as-conso"><p class="muted small">Consommation…</p></div>
      <fieldset class="adr-groupe"><legend>Compagnons (appli téléphone)</legend>
        <label class="check"><input type="checkbox" id="as-comp" ${c.compagnons.actif ? 'checked' : ''}> Ouvrir l'assistant aux compagnons, pour les actions cochées :</label>
        ${c.droitsCompagnon.map(([k, l]) => `<label class="check" style="margin-left:22px"><input type="checkbox" data-as-droit="${k}" ${c.compagnons.droits[k] ? 'checked' : ''}> ${esc(l)}</label>`).join('')}
        <p class="muted small">Un compagnon ne passe jamais de commande : sa demande de matériel arrive au chargé d'affaires du chantier (notification), qui choisit le fournisseur, valide et envoie.</p></fieldset>
      <div class="toolbar" style="margin:10px 0 0"><button id="as-save">Enregistrer</button>${c.cleDefinie && !c.cleEnv ? '<button class="secondary" id="as-effacer">Effacer la clé</button>' : ''}</div>`;
    const $ = s => carte.querySelector(s);
    consommationAssistant($('#as-conso'));
    const lire = () => ({ actif: $('#as-actif').checked, cleApi: $('#as-cle').value, modele: $('#as-modele').value, modeleCompagnons: $('#as-modele-comp').value, plafond: $('#as-plafond').value,
      compagnons: { actif: $('#as-comp').checked, droits: Object.fromEntries([...carte.querySelectorAll('[data-as-droit]')].map(x => [x.dataset.asDroit, x.checked])) } });
    const apres = async msg => { App.toast(msg); Store.me = await api('GET', '/api/me').catch(() => Store.me); boutonAssistant(); bindReglagesAssistant(root); };
    $('#as-save').onclick = () => api('PUT', '/api/assistant/config', lire()).then(() => apres('Assistant enregistré')).catch(e => notify(e.message));
    if ($('#as-effacer')) $('#as-effacer').onclick = async () => { if (await ask('Effacer la clé API ? L\'assistant sera désactivé.', 'Effacer')) api('PUT', '/api/assistant/config', { ...lire(), actif: false, effacerCle: true }).then(() => apres('Clé effacée')).catch(e => notify(e.message)); };
  }).catch(e => { carte.innerHTML = `<p class="neg">${esc(e.message)}</p>`; });
}

// Modèles proposés, avec leur tarif (dollars par million de tokens lus / écrits)
const optionsModeles = (c, sel) => c.modeles.map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${{ 'claude-opus-5-5': 'Claude Opus 5.5 (recommandé)', 'claude-sonnet-5-5': 'Claude Sonnet 5.5 (≈ 2 fois moins cher)', 'claude-haiku-5-5': 'Claude Haiku 5.5 (≈ 40 fois moins cher, questions simples)' }[m] || m}${c.tarifs && c.tarifs[m] ? ` — ${c.tarifs[m][0]} $ / ${c.tarifs[m][1]} $` : ''}</option>`).join('');
const dollars = v => `${(Number(v) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
// Consommation : jour, mois face au plafond, mois précédent, par personne et par modèle, 30 derniers jours
function consommationAssistant(el) {
  if (!el) return;
  api('GET', '/api/assistant/consommation').then(s => {
    if (!el.isConnected) return;
    const pct = s.plafond ? Math.min(100, s.mois.cout / s.plafond * 100) : 0, max = Math.max(0.01, ...s.parJour.map(j => j.cout));
    el.innerHTML = `<h3 style="margin:14px 0 6px">Consommation</h3>
      <div class="as-chiffres"><div><span class="small muted">Aujourd'hui</span><strong>${dollars(s.jour.cout)}</strong><span class="small muted">${s.jour.demandes} demande(s)</span></div>
        <div><span class="small muted">Ce mois-ci</span><strong class="${s.atteint ? 'neg' : ''}">${dollars(s.mois.cout)}</strong><span class="small muted">${s.mois.demandes} demande(s)${s.plafond ? ` · plafond ${dollars(s.plafond)}` : ''}</span>
          ${s.plafond ? `<span class="as-jauge"><i style="width:${pct}%" class="${pct >= 100 ? 'plein' : pct >= 80 ? 'haut' : ''}"></i></span>` : ''}</div>
        <div><span class="small muted">Mois précédent</span><strong>${dollars(s.moisPrecedent.cout)}</strong><span class="small muted">${s.moisPrecedent.demandes} demande(s)</span></div>
        <div><span class="small muted">Coût moyen</span><strong>${dollars(s.mois.demandes ? s.mois.cout / s.mois.demandes : 0)}</strong><span class="small muted">par demande ce mois-ci</span></div></div>
      ${s.atteint ? '<p class="neg small">Plafond atteint : l\'assistant est en pause jusqu\'au mois prochain (relevez le plafond pour le relancer).</p>' : ''}
      ${s.parJour.length ? `<div class="as-barres" role="img" aria-label="Coût par jour sur les 30 derniers jours">${Array.from({ length: 30 }, (_, i) => { const d = isoDate(addDays(new Date(), i - 29)), j = s.parJour.find(x => x.jour === d) || { cout: 0, demandes: 0 };
        return `<span class="${j.demandes ? '' : 'vide'}" title="${dateFr(d)} : ${dollars(j.cout)} (${j.demandes} demande(s))" style="height:${j.demandes ? Math.max(4, j.cout / max * 100) : 2}%"></span>`; }).join('')}</div><div class="small muted as-axe"><span>il y a 30 jours</span><span>aujourd'hui</span></div>` : ''}
      ${s.parPersonne.length ? `<div class="table-wrap"><table><tr><th>Ce mois-ci</th><th>Profil</th><th class="num">Demandes</th><th class="num">Coût</th></tr>
        ${s.parPersonne.map(p => `<tr><td>${esc(p.nom || p.login)}</td><td>${p.profil === 'bureau' ? 'Bureau' : 'Compagnon'}</td><td class="num">${p.demandes}</td><td class="num">${dollars(p.cout)}</td></tr>`).join('')}
        ${s.parModele.map(m => `<tr class="muted"><td colspan="2">${esc(m.modele)}</td><td class="num">${m.demandes}</td><td class="num">${dollars(m.cout)}</td></tr>`).join('')}</table></div>` : '<p class="muted small">Aucune demande ce mois-ci.</p>'}
      <p class="muted small">${window.PIPEFIT_DEMO ? 'Démonstration : coûts simulés (coût moyen estimé d\'une demande pour chaque modèle).' : 'Estimation d\'après les tokens facturés et le tarif public de chaque modèle ; la facture de la console Anthropic fait foi.'}</p>`;
  }).catch(() => { el.innerHTML = ''; });
}
