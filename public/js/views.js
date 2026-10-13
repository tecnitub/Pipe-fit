// Écrans de l'application.
const charges = () => Store.all('users').filter(u => u.role === 'charge');
const userName = id => (Store.get('users', id) || {}).nom || '—';
const clientName = id => (Store.get('clients', id) || {}).nom || '—';
const affaireLabel = a => `${a.code} – ${a.nom}`;
const affaireOf = id => Store.get('affaires', id) || {};

const Views = {};

/* ---------------- Tableau de bord ---------------- */
Views.dashboard = () => {
  const affaires = Store.all('affaires');
  const devis = Store.all('devis');
  const stats = affaires.map(a => ({ a, s: Calc.affaire(a) }));
  const caFacture = Store.all('factures').reduce((t, f) => t + Calc.doc(f).totalHT, 0);
  const pipeline = devis.filter(d => d.statut === 'Envoyé').reduce((t, d) => t + Calc.doc(d).totalHT, 0);
  const impayes = Store.all('factures').filter(f => f.statut !== 'Payée').reduce((t, f) => t + Calc.doc(f).totalTTC, 0);
  const acc = devis.filter(d => d.statut === 'Accepté').length, ref = devis.filter(d => d.statut === 'Refusé').length;
  const margeTot = stats.reduce((t, x) => t + x.s.marge, 0), caTot = stats.reduce((t, x) => t + x.s.ca, 0);
  const derives = stats.filter(x => x.s.heuresPrevues && x.s.ecartHeuresPct > 10);

  const week = isoWeek(new Date());
  const tempsSemaine = Store.all('temps').filter(t => isoWeek(new Date(t.date)) === week).reduce((t, x) => t + num(x.heures), 0);

  return `
  <h1>Tableau de bord</h1>
  <div class="cards">
    <div class="card"><div class="label">CA facturé HT</div><div class="value">${eur(caFacture)}</div></div>
    <div class="card"><div class="label">Devis en attente</div><div class="value">${eur(pipeline)}</div><div class="sub">${devis.filter(d => d.statut === 'Envoyé').length} devis envoyés</div></div>
    <div class="card"><div class="label">Taux de transformation</div><div class="value">${pct((acc + ref) ? acc / (acc + ref) * 100 : 0)}</div><div class="sub">${acc} acceptés / ${ref} refusés</div></div>
    <div class="card"><div class="label">Marge globale</div><div class="value ${signClass(margeTot)}">${pct(caTot ? margeTot / caTot * 100 : 0)}</div><div class="sub">${eur(margeTot)}</div></div>
    <div class="card"><div class="label">Restant dû TTC</div><div class="value">${eur(impayes)}</div></div>
    <div class="card"><div class="label">Heures saisies (${week})</div><div class="value">${fmt(tempsSemaine, 1)} h</div></div>
  </div>
  <h2>Affaires en dérive d'heures (&gt; 10 %)</h2>
  ${derives.length ? `<div class="table-wrap"><table><tr><th>Affaire</th><th>Chargé</th><th class="num">Prévu</th><th class="num">Passé</th><th class="num">Écart</th></tr>
    ${derives.map(({ a, s }) => `<tr class="clickable" onclick="location.hash='#/affaire/${a.id}'"><td>${esc(affaireLabel(a))}</td><td>${esc(userName(a.chargeId))}</td><td class="num">${fmt(s.heuresPrevues)} h</td><td class="num">${fmt(s.heuresPassees)} h</td><td class="num neg">+${pct(s.ecartHeuresPct)}</td></tr>`).join('')}
  </table></div>` : '<p class="muted">Aucune dérive détectée.</p>'}
  <h2>Affaires actives</h2>
  ${affaireTable(affaires.filter(a => !['Perdue', 'Facturée'].includes(a.statut)))}`;
};

/* ---------------- Clients ---------------- */
const clientFields = [
  { key: 'nom', label: 'Raison sociale' },
  { key: 'type', label: 'Type', type: 'select', options: v => optionsStr(['Négoce', 'Couvreur', 'Promoteur', 'Entreprise MH', 'Architecte', 'Particulier', 'Autre'], v) },
  { key: 'contact', label: 'Contact' },
  { key: 'tel', label: 'Téléphone' },
  { key: 'email', label: 'E-mail', type: 'email' },
  { key: 'cp', label: 'Code postal' },
  { key: 'ville', label: 'Ville' },
  { key: 'zoneId', label: 'Zone de livraison par défaut', type: 'select', options: v => options(Store.all('zones'), v) },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];
Views.clients = () => {
  const rows = Store.all('clients').map(c => {
    const affs = Store.all('affaires').filter(a => a.clientId === c.id);
    const ca = affs.reduce((t, a) => t + Calc.affaire(a).caFacture, 0);
    return `<tr class="clickable" data-id="${c.id}"><td>${esc(c.nom)}</td><td>${esc(c.type)}</td><td>${esc(c.contact)}</td><td>${esc(c.tel)}</td><td>${esc(c.ville)}</td><td class="num">${affs.length}</td><td class="num">${eur(ca)}</td></tr>`;
  }).join('');
  return `<h1>Clients</h1>
  <div class="toolbar"><button id="add">+ Nouveau client</button></div>
  <div class="table-wrap"><table><tr><th>Client</th><th>Type</th><th>Contact</th><th>Tél.</th><th>Ville</th><th class="num">Affaires</th><th class="num">CA facturé</th></tr>${rows}</table></div>`;
};
Views.clients.bind = root => {
  root.querySelector('#add').onclick = () => editModal({ title: 'Nouveau client', col: 'clients', fields: clientFields, obj: {} });
  root.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () =>
    editModal({ title: 'Client', col: 'clients', fields: clientFields, obj: { ...Store.get('clients', tr.dataset.id) } }));
};

/* ---------------- Affaires ---------------- */
const affaireFields = [
  { key: 'code', label: 'Code affaire' },
  { key: 'nom', label: 'Intitulé' },
  { key: 'clientId', label: 'Client', type: 'select', options: v => options(Store.all('clients'), v) },
  { key: 'chargeId', label: "Chargé d'affaires", type: 'select', options: v => options(charges(), v) },
  { key: 'statut', label: 'Statut', type: 'select', options: v => optionsStr(STATUTS_AFFAIRE, v) },
  { key: 'dateCreation', label: 'Date de création', type: 'date' },
  { key: 'heuresPrevues', label: 'Heures prévues (budget)', type: 'number', step: '0.5' },
];

function affaireTable(list) {
  if (!list.length) return '<p class="muted">Aucune affaire.</p>';
  return `<div class="table-wrap"><table><tr><th>Code</th><th>Affaire</th><th>Client</th><th>Chargé</th><th>Statut</th><th class="num">CA HT</th><th>Heures (passé / prévu)</th><th class="num">Marge</th></tr>
  ${list.map(a => {
    const s = Calc.affaire(a);
    return `<tr class="clickable" onclick="location.hash='#/affaire/${a.id}'"><td>${esc(a.code)}</td><td>${esc(a.nom)}</td><td>${esc(clientName(a.clientId))}</td><td>${esc(userName(a.chargeId))}</td><td>${badge(a.statut)}</td>
      <td class="num">${eur(s.ca)}</td><td>${bar(s.avancement)}<span class="muted">${fmt(s.heuresPassees)} / ${fmt(s.heuresPrevues)} h</span></td><td class="num">${s.ca ? marginBadge(s.margePct) : '—'}</td></tr>`;
  }).join('')}</table></div>`;
}

Views.affaires = (params, query) => {
  const fc = query.get('charge') || '', fs = query.get('statut') || '';
  const list = Store.all('affaires').filter(a => (!fc || a.chargeId === fc) && (!fs || a.statut === fs));
  return `<h1>Affaires</h1>
  <div class="toolbar">
    <button id="add">+ Nouvelle affaire</button>
    <span class="spacer"></span>
    <select id="fc" style="width:auto"><option value="">Tous les chargés</option>${options(charges(), fc, undefined, false)}</select>
    <select id="fs" style="width:auto"><option value="">Tous statuts</option>${optionsStr(STATUTS_AFFAIRE, fs)}</select>
  </div>${affaireTable(list)}`;
};
Views.affaires.bind = root => {
  const upd = () => { location.hash = `#/affaires?charge=${root.querySelector('#fc').value}&statut=${encodeURIComponent(root.querySelector('#fs').value)}`; };
  root.querySelector('#fc').onchange = upd;
  root.querySelector('#fs').onchange = upd;
  root.querySelector('#add').onclick = () => {
    const n = Store.all('affaires').length + 1;
    editModal({ title: 'Nouvelle affaire', col: 'affaires', fields: affaireFields,
      obj: { code: `AF-${String(n).padStart(3, '0')}`, statut: 'Prospect', dateCreation: isoDate(new Date()), heuresPrevues: 0, rex: {} } });
  };
};

Views.affaire = params => {
  const a = Store.get('affaires', params[0]);
  if (!a) return '<p>Affaire introuvable.</p>';
  const s = Calc.affaire(a);
  const devis = Store.all('devis').filter(d => d.affaireId === a.id);
  const facts = Store.all('factures').filter(f => f.affaireId === a.id);
  const temps = Store.all('temps').filter(t => t.affaireId === a.id).sort((x, y) => y.date.localeCompare(x.date));
  const parRessource = {};
  temps.forEach(t => { parRessource[t.userId] = (parRessource[t.userId] || 0) + num(t.heures); });
  const rex = a.rex || {};
  return `
  <div class="toolbar"><a href="#/affaires" class="btn secondary">← Affaires</a><span class="spacer"></span><button id="edit" class="secondary">Modifier</button><button id="newdevis">+ Devis</button></div>
  <h1>${esc(affaireLabel(a))} ${badge(a.statut)}</h1>
  <p class="muted">Client : ${esc(clientName(a.clientId))} · Chargé d'affaires : ${esc(userName(a.chargeId))} · Créée le ${dateFr(a.dateCreation)}</p>
  <div class="cards">
    <div class="card"><div class="label">CA (devis acceptés)</div><div class="value">${eur(s.caDevis)}</div><div class="sub">Facturé : ${eur(s.caFacture)} · Reste : ${eur(s.resteAFacturer)}</div></div>
    <div class="card"><div class="label">Heures passées / prévues</div><div class="value">${fmt(s.heuresPassees, 1)} / ${fmt(s.heuresPrevues, 1)} h</div>${bar(s.avancement)}<div class="sub">Écart : <span class="${s.ecartHeures > 0 ? 'neg' : 'pos'}">${s.ecartHeures > 0 ? '+' : ''}${fmt(s.ecartHeures, 1)} h (${pct(s.ecartHeuresPct)})</span> · Planifié : ${fmt(s.heuresPlanifiees)} h</div></div>
    <div class="card"><div class="label">Marge prévisionnelle</div><div class="value">${eur(s.margePrev)}</div><div class="sub">${pct(s.margePrevPct)} (au chiffrage)</div></div>
    <div class="card"><div class="label">Marge réelle</div><div class="value ${signClass(s.marge)}">${eur(s.marge)}</div><div class="sub">${pct(s.margePct)} · écart vs prév. ${pct(s.margePct - s.margePrevPct)}</div></div>
  </div>
  <div class="table-wrap"><table>
    <tr><th>Décomposition rentabilité</th><th class="num">Montant</th></tr>
    <tr><td>Chiffre d'affaires HT ${facts.length ? '(facturé)' : '(devis acceptés)'}</td><td class="num">${eur(s.ca)}</td></tr>
    <tr><td>− Coût matière / énergie</td><td class="num">${eur(s.coutMatiere)}</td></tr>
    <tr><td>− Main d'œuvre réelle (${fmt(s.heuresPassees, 1)} h)</td><td class="num">${eur(s.coutMO)}</td></tr>
    <tr><td>− Coût transport</td><td class="num">${eur(s.coutLivraison)}</td></tr>
    <tr><td><strong>= Marge</strong></td><td class="num"><strong class="${signClass(s.marge)}">${eur(s.marge)}</strong></td></tr>
  </table></div>

  <h2>Devis</h2>
  ${devis.length ? `<div class="table-wrap"><table><tr><th>N°</th><th>Date</th><th>Statut</th><th class="num">Total HT</th></tr>
    ${devis.map(d => `<tr class="clickable" onclick="location.hash='#/devis/${d.id}'"><td>${esc(d.numero)}</td><td>${dateFr(d.date)}</td><td>${badge(d.statut)}</td><td class="num">${eur(Calc.doc(d).totalHT)}</td></tr>`).join('')}</table></div>` : '<p class="muted">Aucun devis.</p>'}

  <h2>Factures</h2>
  ${facts.length ? `<div class="table-wrap"><table><tr><th>N°</th><th>Date</th><th>Statut</th><th class="num">Total TTC</th></tr>
    ${facts.map(f => `<tr class="clickable" onclick="location.hash='#/facture/${f.id}'"><td>${esc(f.numero)}</td><td>${dateFr(f.date)}</td><td>${badge(f.statut)}</td><td class="num">${eur(Calc.doc(f).totalTTC)}</td></tr>`).join('')}</table></div>` : '<p class="muted">Aucune facture.</p>'}

  <h2>Heures passées par ressource</h2>
  ${Object.keys(parRessource).length ? `<div class="table-wrap"><table><tr><th>Ressource</th><th class="num">Heures</th><th class="num">Coût</th></tr>
    ${Object.entries(parRessource).map(([uid, h]) => `<tr><td>${esc(userName(uid))}</td><td class="num">${fmt(h, 1)} h</td><td class="num">${eur(h * Calc.tauxUser(uid))}</td></tr>`).join('')}</table></div>` : '<p class="muted">Aucune heure saisie.</p>'}

  <h2>Retour d'expérience (REX)</h2>
  <div class="card">
    <div class="grid2">
      <div class="field"><label>Note globale (1 à 5)</label><select id="rex-note">${['', 1, 2, 3, 4, 5].map(n => `<option ${String(n) === String(rex.note ?? '') ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="field" style="grid-column:1/-1"><label>Points positifs</label><textarea id="rex-positif">${esc(rex.positif)}</textarea></div>
      <div class="field" style="grid-column:1/-1"><label>Points négatifs / difficultés</label><textarea id="rex-negatif">${esc(rex.negatif)}</textarea></div>
      <div class="field" style="grid-column:1/-1"><label>Actions d'amélioration (à reporter sur les prochains chiffrages)</label><textarea id="rex-actions">${esc(rex.actions)}</textarea></div>
    </div>
    <div class="modal-actions"><button id="rex-save">Enregistrer le REX</button></div>
  </div>`;
};
Views.affaire.bind = (root, params) => {
  const a = Store.get('affaires', params[0]);
  if (!a) return;
  root.querySelector('#edit').onclick = () => editModal({ title: 'Affaire', col: 'affaires', fields: affaireFields, obj: { ...a },
    onDelete: () => { location.hash = '#/affaires'; } });
  root.querySelector('#newdevis').onclick = () => { const d = newDevis(a.id); location.hash = `#/devis/${d.id}`; };
  root.querySelector('#rex-save').onclick = () => {
    a.rex = { note: root.querySelector('#rex-note').value, positif: root.querySelector('#rex-positif').value,
      negatif: root.querySelector('#rex-negatif').value, actions: root.querySelector('#rex-actions').value };
    Store.upsert('affaires', a);
    App.toast('REX enregistré');
  };
};

/* ---------------- Devis ---------------- */
function newDevis(affaireId) {
  const af = affaireOf(affaireId);
  const cl = Store.get('clients', af.clientId) || {};
  return Store.upsert('devis', { numero: '', affaireId, date: isoDate(new Date()), validite: 30,
    statut: 'Brouillon', zoneId: cl.zoneId || '', remiseGlobale: 0, lignes: [] });
}

Views.devis = (params, query) => {
  if (params[0]) return devisEditor(params[0]);
  const fs = query.get('statut') || '';
  const list = Store.all('devis').filter(d => !fs || d.statut === fs).sort((a, b) => b.numero.localeCompare(a.numero));
  return `<h1>Devis</h1>
  <div class="toolbar">
    <select id="newaff" style="width:auto"><option value="">Nouveau devis pour l'affaire…</option>${options(Store.all('affaires'), '', affaireLabel, false)}</select>
    <span class="spacer"></span>
    <select id="fs" style="width:auto"><option value="">Tous statuts</option>${optionsStr(STATUTS_DEVIS, fs)}</select>
  </div>
  <div class="table-wrap"><table><tr><th>N°</th><th>Date</th><th>Affaire</th><th>Client</th><th>Chargé</th><th>Statut</th><th class="num">Total HT</th><th class="num">Marge prév.</th></tr>
  ${list.map(d => {
    const a = affaireOf(d.affaireId), t = Calc.doc(d);
    return `<tr class="clickable" onclick="location.hash='#/devis/${d.id}'"><td>${esc(d.numero)}</td><td>${dateFr(d.date)}</td><td>${esc(a.code)} – ${esc(a.nom)}</td><td>${esc(clientName(a.clientId))}</td><td>${esc(userName(a.chargeId))}</td><td>${badge(d.statut)}</td><td class="num">${eur(t.totalHT)}</td><td class="num">${marginBadge(t.margePrevPct)}</td></tr>`;
  }).join('')}</table></div>`;
};
Views.devis.bind = (root, params) => {
  if (params[0]) return bindDevisEditor(root, params[0]);
  root.querySelector('#fs').onchange = e => { location.hash = `#/devis?statut=${encodeURIComponent(e.target.value)}`; };
  root.querySelector('#newaff').onchange = e => { if (e.target.value) { const d = newDevis(e.target.value); location.hash = `#/devis/${d.id}`; } };
};

function docLinesTable(doc, editable) {
  return `<div class="table-wrap"><table>
    <tr><th>Désignation</th><th class="num">Qté</th><th>Unité</th><th class="num">PU HT</th><th class="num">Remise %</th><th class="num">Total HT</th>${editable ? '<th class="no-print"></th>' : ''}</tr>
    ${doc.lignes.map((l, i) => editable ? `<tr data-i="${i}">
      <td><input data-k="designation" value="${esc(l.designation)}"></td>
      <td class="num"><input data-k="qte" type="number" step="any" value="${esc(l.qte)}" style="width:90px"></td>
      <td>${esc(l.unite)}</td>
      <td class="num"><input data-k="pu" type="number" step="0.01" value="${esc(l.pu)}" style="width:100px"></td>
      <td class="num"><input data-k="remise" type="number" step="0.5" value="${esc(l.remise)}" style="width:70px"></td>
      <td class="num">${eur(Calc.ligneHT(l))}</td>
      <td class="no-print"><button class="small danger" data-del="${i}">✕</button></td></tr>`
    : `<tr><td>${esc(l.designation)}</td><td class="num">${fmt(l.qte, 2)}</td><td>${esc(l.unite)}</td><td class="num">${eur(l.pu)}</td><td class="num">${num(l.remise) ? fmt(l.remise, 1) + ' %' : ''}</td><td class="num">${eur(Calc.ligneHT(l))}</td></tr>`).join('')}
  </table></div>`;
}

function totalsTable(doc) {
  const t = Calc.doc(doc), z = Store.get('zones', doc.zoneId);
  return `<table class="totals">
    <tr><td>Total marchandise</td><td class="num">${eur(t.brut)}</td></tr>
    ${t.remiseGlobale ? `<tr><td>Remise ${fmt(doc.remiseGlobale, 1)} %</td><td class="num">− ${eur(t.remiseGlobale)}</td></tr>` : ''}
    <tr><td>Livraison ${z ? `(${esc(z.nom)}, ${fmt(t.poids / 1000, 2)} t)` : ''}</td><td class="num">${eur(t.livraison)}</td></tr>
    <tr><td>Total HT</td><td class="num">${eur(t.totalHT)}</td></tr>
    <tr><td>TVA ${fmt(Store.data.settings.tva, 1)} %</td><td class="num">${eur(t.tva)}</td></tr>
    <tr class="grand"><td>Total TTC</td><td class="num">${eur(t.totalTTC)}</td></tr>
  </table>`;
}

function docHeader(doc, title) {
  const s = Store.data.settings, a = affaireOf(doc.affaireId), c = Store.get('clients', a.clientId) || {};
  return `<div class="doc-head">
    <div><strong>${esc(s.societe)}</strong><br>${esc(s.adresse)}<br>SIRET ${esc(s.siret)}</div>
    <div style="text-align:right"><strong style="font-size:18px">${title} ${esc(doc.numero || '(numéro en cours…)')}</strong><br>Date : ${dateFr(doc.date)}<br>Affaire : ${esc(a.code)} – ${esc(a.nom)}<br>Suivi : ${esc(userName(a.chargeId))}</div>
  </div>
  <div style="margin-bottom:16px"><strong>${esc(c.nom)}</strong><br>${esc(c.contact)}<br>${esc(c.cp)} ${esc(c.ville)}</div>`;
}

function devisEditor(id) {
  const d = Store.get('devis', id);
  if (!d) return '<p>Devis introuvable.</p>';
  const t = Calc.doc(d);
  const facture = Store.all('factures').find(f => f.devisId === d.id);
  const familles = [...new Set(Store.all('articles').map(a => a.famille))];
  return `
  <div class="toolbar">
    <a href="#/devis" class="btn secondary">← Devis</a>
    <a href="#/affaire/${d.affaireId}" class="btn secondary">Affaire</a>
    <span class="spacer"></span>
    <button class="secondary" id="dup">Dupliquer</button>
    <button class="secondary print-btn" onclick="window.print()">Imprimer / PDF</button>
    ${facture ? `<a class="btn" href="#/facture/${facture.id}">Voir facture ${esc(facture.numero)}</a>` : (d.statut === 'Accepté' ? '<button id="facturer">Générer la facture</button>' : '')}
    <button class="danger" id="del">Supprimer</button>
  </div>
  <div class="card no-print" style="margin-bottom:12px">
    <div class="grid2">
      <div class="field"><label>Affaire</label><select id="d-affaire">${options(Store.all('affaires'), d.affaireId, affaireLabel, false)}</select></div>
      <div class="field"><label>Date</label><input id="d-date" type="date" value="${esc(d.date)}"></div>
      <div class="field"><label>Validité (jours)</label><input id="d-validite" type="number" value="${esc(d.validite)}"></div>
      <div class="field"><label>Statut</label><select id="d-statut">${optionsStr(STATUTS_DEVIS, d.statut)}</select></div>
      <div class="field"><label>Zone de livraison</label><select id="d-zone">${options(Store.all('zones'), d.zoneId)}</select></div>
      <div class="field"><label>Livraison forcée (€ HT, vide = calcul auto)</label><input id="d-livman" type="number" step="0.01" value="${esc(d.livraisonManuelle ?? '')}"></div>
      <div class="field"><label>Remise globale %</label><input id="d-remise" type="number" step="0.5" value="${esc(d.remiseGlobale)}"></div>
    </div>
    <h2>Ajouter depuis la bibliothèque de prix</h2>
    <div class="toolbar">
      <select id="fam" style="width:auto"><option value="">Toutes familles</option>${optionsStr(familles, '')}</select>
      <select id="art" style="flex:1;min-width:240px">${articleOptions('')}</select>
      <input id="qte" type="number" step="any" placeholder="Qté" style="width:100px">
      <button id="addline">Ajouter</button>
      <button class="secondary" id="addfree">Ligne libre</button>
    </div>
  </div>
  <div class="doc-print">
    ${docHeader(d, 'DEVIS')}
    ${docLinesTable(d, true)}
    ${totalsTable(d)}
    <p class="muted" style="margin-top:20px">Devis valable ${esc(d.validite)} jours. Poids total estimé : ${fmt(t.poids / 1000, 2)} t.</p>
  </div>
  <div class="card no-print" style="margin-top:12px">
    <strong>Analyse interne (non imprimée)</strong>
    <div class="cards" style="margin-top:8px">
      <div class="card"><div class="label">Coût matière/énergie</div><div class="value">${eur(t.coutMatiere)}</div></div>
      <div class="card"><div class="label">Heures de fabrication estimées</div><div class="value">${fmt(t.heures, 1)} h</div><div class="sub">${eur(t.coutMO)} à ${eur(Store.data.settings.tauxHoraireDefaut)}/h</div></div>
      <div class="card"><div class="label">Coût transport</div><div class="value">${eur(t.coutLivraison)}</div><div class="sub">Facturé : ${eur(t.livraison)}</div></div>
      <div class="card"><div class="label">Marge prévisionnelle</div><div class="value ${signClass(t.margePrev)}">${eur(t.margePrev)}</div><div class="sub">${marginBadge(t.margePrevPct)}</div></div>
    </div>
  </div>`;
}

function articleOptions(famille) {
  return Store.all('articles').filter(a => !famille || a.famille === famille)
    .map(a => `<option value="${a.id}">${esc(a.ref)} – ${esc(a.designation)} (${eur(a.prixVente)}/${esc(a.unite)})</option>`).join('');
}

function bindDevisEditor(root, id) {
  const d = Store.get('devis', id);
  if (!d) return;
  const save = () => { Store.upsert('devis', d); App.render(); };
  const field = (sel, key, isNum) => { root.querySelector(sel).onchange = e => { d[key] = isNum ? (e.target.value === '' ? '' : +e.target.value) : e.target.value; save(); }; };
  field('#d-affaire', 'affaireId'); field('#d-date', 'date'); field('#d-validite', 'validite', true);
  field('#d-statut', 'statut'); field('#d-zone', 'zoneId'); field('#d-remise', 'remiseGlobale', true);
  root.querySelector('#d-livman').onchange = e => { d.livraisonManuelle = e.target.value === '' ? null : +e.target.value; save(); };
  root.querySelector('#fam').onchange = e => { root.querySelector('#art').innerHTML = articleOptions(e.target.value); };
  root.querySelector('#addline').onclick = () => {
    const a = Store.get('articles', root.querySelector('#art').value);
    const q = +root.querySelector('#qte').value;
    if (!a || !q) { notify('Choisir un article et une quantité.'); return; }
    d.lignes.push({ articleId: a.id, designation: a.designation, unite: a.unite, qte: q, pu: a.prixVente, remise: 0,
      cout: a.coutRevient, poids: a.poidsUnitaire, heures: a.heuresUnitaires });
    save();
  };
  root.querySelector('#addfree').onclick = () => { d.lignes.push({ designation: 'Ligne libre', unite: 'u', qte: 1, pu: 0, remise: 0, cout: 0, poids: 0, heures: 0 }); save(); };
  root.querySelectorAll('tr[data-i] input').forEach(inp => inp.onchange = e => {
    const l = d.lignes[+e.target.closest('tr').dataset.i], k = e.target.dataset.k;
    l[k] = k === 'designation' ? e.target.value : +e.target.value;
    save();
  });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { d.lignes.splice(+b.dataset.del, 1); save(); });
  root.querySelector('#del').onclick = () => ask(`Supprimer le devis ${d.numero} ?`, 'Supprimer').then(ok => {
    if (ok) { Store.remove('devis', d.id); location.hash = '#/devis'; }
  });
  root.querySelector('#dup').onclick = () => {
    const copy = JSON.parse(JSON.stringify(d));
    Object.keys(copy).filter(k => k.startsWith('_')).forEach(k => delete copy[k]);
    delete copy.id; copy.numero = ''; copy.statut = 'Brouillon'; copy.date = isoDate(new Date());
    const n = Store.upsert('devis', copy);
    location.hash = `#/devis/${n.id}`;
  };
  const fb = root.querySelector('#facturer');
  if (fb) fb.onclick = () => {
    const s = Store.data.settings;
    const f = Store.upsert('factures', { numero: '', devisId: d.id, affaireId: d.affaireId,
      date: isoDate(new Date()), echeance: isoDate(addDays(new Date(), num(s.delaiPaiement))), statut: 'Émise',
      lignes: JSON.parse(JSON.stringify(d.lignes)), zoneId: d.zoneId, remiseGlobale: d.remiseGlobale, livraisonManuelle: d.livraisonManuelle });
    location.hash = `#/facture/${f.id}`;
  };
}

/* ---------------- Factures ---------------- */
Views.factures = () => {
  const today = isoDate(new Date());
  const list = Store.all('factures').slice().sort((a, b) => b.numero.localeCompare(a.numero));
  return `<h1>Factures</h1>
  <p class="muted">Les factures sont générées depuis un devis accepté (bouton « Générer la facture »). La livraison y est reprise automatiquement.</p>
  <div class="table-wrap"><table><tr><th>N°</th><th>Date</th><th>Échéance</th><th>Affaire</th><th>Client</th><th>Statut</th><th class="num">Livraison HT</th><th class="num">Total HT</th><th class="num">Total TTC</th></tr>
  ${list.map(f => {
    const a = affaireOf(f.affaireId), t = Calc.doc(f);
    const statut = f.statut !== 'Payée' && f.echeance < today ? 'En retard' : f.statut;
    return `<tr class="clickable" onclick="location.hash='#/facture/${f.id}'"><td>${esc(f.numero)}</td><td>${dateFr(f.date)}</td><td>${dateFr(f.echeance)}</td><td>${esc(a.code)}</td><td>${esc(clientName(a.clientId))}</td><td>${badge(statut)}</td><td class="num">${eur(t.livraison)}</td><td class="num">${eur(t.totalHT)}</td><td class="num">${eur(t.totalTTC)}</td></tr>`;
  }).join('')}</table></div>`;
};

Views.facture = params => {
  const f = Store.get('factures', params[0]);
  if (!f) return '<p>Facture introuvable.</p>';
  return `<div class="toolbar">
    <a href="#/factures" class="btn secondary">← Factures</a>
    <span class="spacer"></span>
    <select id="f-statut" style="width:auto">${optionsStr(STATUTS_FACTURE, f.statut)}</select>
    <button class="secondary print-btn" onclick="window.print()">Imprimer / PDF</button>
    ${Store.can('delete', 'factures') ? '<button class="danger" id="del">Supprimer</button>' : ''}
  </div>
  <div class="doc-print">
    ${docHeader(f, 'FACTURE')}
    ${docLinesTable(f, false)}
    ${totalsTable(f)}
    <p class="muted" style="margin-top:20px">Échéance de paiement : ${dateFr(f.echeance)}. ${f.devisId ? `Selon devis ${esc((Store.get('devis', f.devisId) || {}).numero)}.` : ''}</p>
  </div>`;
};
Views.facture.bind = (root, params) => {
  const f = Store.get('factures', params[0]);
  if (!f) return;
  root.querySelector('#f-statut').onchange = e => { f.statut = e.target.value; Store.upsert('factures', f); App.toast('Statut mis à jour'); };
  const del = root.querySelector('#del');
  if (del) del.onclick = () => ask(`Supprimer la facture ${f.numero} ?`, 'Supprimer').then(ok => {
    if (ok) { Store.remove('factures', f.id); location.hash = '#/factures'; }
  });
};

/* ---------------- Bibliothèque de prix ---------------- */
const articleFields = [
  { key: 'ref', label: 'Référence' },
  { key: 'designation', label: 'Désignation' },
  { key: 'famille', label: 'Famille' },
  { key: 'unite', label: 'Unité', type: 'select', options: v => optionsStr(['m²', 'ml', 'u', 'forfait', 'palette', 't'], v) },
  { key: 'prixVente', label: 'Prix de vente HT', type: 'number', step: '0.01' },
  { key: 'coutRevient', label: 'Coût matière + énergie (hors MO)', type: 'number', step: '0.01' },
  { key: 'heuresUnitaires', label: 'Heures de fabrication / unité', type: 'number', step: '0.001' },
  { key: 'poidsUnitaire', label: 'Poids / unité (kg)', type: 'number', step: '0.1' },
];
Views.articles = (params, query) => {
  const ff = query.get('famille') || '';
  const familles = [...new Set(Store.all('articles').map(a => a.famille))];
  const taux = num(Store.data.settings.tauxHoraireDefaut);
  const list = Store.all('articles').filter(a => !ff || a.famille === ff);
  return `<h1>Bibliothèque de prix</h1>
  <div class="toolbar">
    <button id="add">+ Article</button>
    <button class="secondary" id="hausse">Révision tarifaire %</button>
    <button class="secondary dl-btn" id="csv">Export CSV</button>
    <span class="spacer"></span>
    <select id="ff" style="width:auto"><option value="">Toutes familles</option>${optionsStr(familles, ff)}</select>
  </div>
  <div class="table-wrap"><table><tr><th>Réf.</th><th>Désignation</th><th>Famille</th><th>Unité</th><th class="num">Prix vente</th><th class="num">Coût mat.</th><th class="num">h/unité</th><th class="num">kg/unité</th><th class="num">Marge unitaire*</th></tr>
  ${list.map(a => {
    const m = num(a.prixVente) - num(a.coutRevient) - num(a.heuresUnitaires) * taux;
    return `<tr class="clickable" data-id="${a.id}"><td>${esc(a.ref)}</td><td>${esc(a.designation)}</td><td>${esc(a.famille)}</td><td>${esc(a.unite)}</td><td class="num">${eur(a.prixVente)}</td><td class="num">${eur(a.coutRevient)}</td><td class="num">${fmt(a.heuresUnitaires, 3)}</td><td class="num">${fmt(a.poidsUnitaire, 1)}</td><td class="num">${marginBadge(num(a.prixVente) ? m / num(a.prixVente) * 100 : 0)}</td></tr>`;
  }).join('')}</table></div>
  <p class="muted">* Marge après matière et main d'œuvre au taux horaire standard (${eur(taux)}/h).</p>`;
};
Views.articles.bind = root => {
  root.querySelector('#ff').onchange = e => { location.hash = `#/articles?famille=${encodeURIComponent(e.target.value)}`; };
  root.querySelector('#add').onclick = () => editModal({ title: 'Nouvel article', col: 'articles', fields: articleFields, obj: { unite: 'm²' } });
  root.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () =>
    editModal({ title: 'Article', col: 'articles', fields: articleFields, obj: { ...Store.get('articles', tr.dataset.id) } }));
  root.querySelector('#hausse').onclick = async () => {
    const ff = new URLSearchParams(location.hash.split('?')[1] || '').get('famille') || '';
    const p = await askValue(`Révision des prix de vente en %${ff ? ` (famille « ${ff} »)` : ' (tous les articles)'}`, '3', 'number');
    if (p === null || p === '' || isNaN(+p)) return;
    Store.all('articles').filter(a => !ff || a.famille === ff).forEach(a => {
      a.prixVente = Math.round(num(a.prixVente) * (1 + +p / 100) * 100) / 100;
      Store.upsert('articles', a);
    });
    App.render(); App.toast('Tarifs révisés');
  };
  root.querySelector('#csv').onclick = () => download('bibliotheque-prix.csv',
    toCSV([['Ref', 'Designation', 'Famille', 'Unite', 'PrixVente', 'CoutRevient', 'HeuresUnitaires', 'PoidsUnitaire'],
      ...Store.all('articles').map(a => [a.ref, a.designation, a.famille, a.unite, a.prixVente, a.coutRevient, a.heuresUnitaires, a.poidsUnitaire])]), 'text/csv');
};

/* ---------------- Zones de livraison ---------------- */
const zoneFields = [
  { key: 'nom', label: 'Nom de la zone' },
  { key: 'forfait', label: 'Forfait facturé HT', type: 'number', step: '0.01' },
  { key: 'prixParTonne', label: 'Prix facturé / tonne', type: 'number', step: '0.01' },
  { key: 'coutTransporteur', label: 'Coût transporteur (forfait)', type: 'number', step: '0.01' },
  { key: 'coutParTonne', label: 'Coût transporteur / tonne', type: 'number', step: '0.01' },
];
Views.livraison = () => `<h1>Tarifs de livraison</h1>
  <p class="muted">Livraison facturée = forfait + prix/tonne × poids du devis (calculé à partir des poids unitaires de la bibliothèque). Montant modifiable sur chaque devis.</p>
  <div class="toolbar"><button id="add">+ Zone</button></div>
  <div class="table-wrap"><table><tr><th>Zone</th><th class="num">Forfait</th><th class="num">€/t</th><th class="num">Coût forfait</th><th class="num">Coût €/t</th><th class="num">Ex. 10 t facturé</th><th class="num">Marge transport</th></tr>
  ${Store.all('zones').map(z => {
    const f = num(z.forfait) + num(z.prixParTonne) * 10, c = num(z.coutTransporteur) + num(z.coutParTonne) * 10;
    return `<tr class="clickable" data-id="${z.id}"><td>${esc(z.nom)}</td><td class="num">${eur(z.forfait)}</td><td class="num">${eur(z.prixParTonne)}</td><td class="num">${eur(z.coutTransporteur)}</td><td class="num">${eur(z.coutParTonne)}</td><td class="num">${eur(f)}</td><td class="num ${signClass(f - c)}">${eur(f - c)}</td></tr>`;
  }).join('')}</table></div>`;
Views.livraison.bind = root => {
  root.querySelector('#add').onclick = () => editModal({ title: 'Nouvelle zone', col: 'zones', fields: zoneFields, obj: {} });
  root.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () =>
    editModal({ title: 'Zone', col: 'zones', fields: zoneFields, obj: { ...Store.get('zones', tr.dataset.id) } }));
};

/* ---------------- Planning ---------------- */
Views.planning = (params, query) => {
  const offset = +(query.get('o') || 0);
  const start = addDays(mondayOf(new Date()), (offset - 2) * 7);
  const weeks = Array.from({ length: 8 }, (_, i) => isoWeek(addDays(start, i * 7)));
  const current = isoWeek(new Date());
  const users = Store.all('users');
  const plan = Store.all('planning'), temps = Store.all('temps');
  const passe = (uid, wk) => temps.filter(t => t.userId === uid && isoWeek(new Date(t.date)) === wk).reduce((s, t) => s + num(t.heures), 0);

  const grid = users.map(u => `<tr><td><strong>${esc(u.nom)}</strong><br><span class="muted">${fmt(u.capaciteHebdo)} h/sem.</span></td>
    ${weeks.map(wk => {
      const items = plan.filter(p => p.userId === u.id && p.semaine === wk);
      const h = items.reduce((s, p) => s + num(p.heuresPrevues), 0);
      const r = num(u.capaciteHebdo) ? h / num(u.capaciteHebdo) : 0;
      const cls = !h ? 'load-0' : r > 1 ? 'load-over' : r > 0.85 ? 'load-high' : 'load-ok';
      const real = passe(u.id, wk);
      return `<td class="plan-cell ${cls}" data-u="${u.id}" data-w="${wk}" style="cursor:pointer" title="${esc(items.map(p => `${affaireOf(p.affaireId).code} : ${p.heuresPrevues} h – ${p.libelle || ''}`).join('\n'))}">
        <strong>${h ? fmt(h) + ' h' : '·'}</strong>${h ? `<br><span class="muted">${fmt(r * 100)} %</span>` : ''}${real ? `<br><span class="muted">réel ${fmt(real, 1)} h</span>` : ''}</td>`;
    }).join('')}</tr>`).join('');

  const affs = Store.all('affaires').filter(a => !['Perdue', 'Facturée'].includes(a.statut));
  return `<h1>Planning de charge</h1>
  <div class="toolbar">
    <button class="secondary" onclick="location.hash='#/planning?o=${offset - 4}'">◀ 4 sem.</button>
    <button class="secondary" onclick="location.hash='#/planning'">Aujourd'hui</button>
    <button class="secondary" onclick="location.hash='#/planning?o=${offset + 4}'">4 sem. ▶</button>
    <span class="spacer"></span>
    <span class="badge load-ok">≤ 85 %</span><span class="badge load-high">85–100 %</span><span class="badge load-over">&gt; 100 %</span>
  </div>
  <p class="muted">Cliquez sur une case pour planifier des heures sur une affaire. « réel » = heures effectivement saisies la semaine concernée.</p>
  <div class="table-wrap"><table><tr><th>Ressource</th>${weeks.map(w => `<th class="plan-cell ${w === current ? 'today' : ''}">${w.replace('-W', ' S')}</th>`).join('')}</tr>${grid}</table></div>

  <h2>Avancement des affaires (heures)</h2>
  <div class="table-wrap"><table><tr><th>Affaire</th><th class="num">Budget</th><th class="num">Planifié</th><th class="num">Passé</th><th class="num">Reste à faire</th><th>Consommation</th><th class="num">Reste à planifier</th></tr>
  ${affs.map(a => {
    const s = Calc.affaire(a);
    const reste = s.heuresPrevues - s.heuresPassees;
    const futur = plan.filter(p => p.affaireId === a.id && p.semaine > current).reduce((t, p) => t + num(p.heuresPrevues), 0);
    const aPlanifier = reste - futur;
    return `<tr class="clickable" onclick="location.hash='#/affaire/${a.id}'"><td>${esc(affaireLabel(a))}</td><td class="num">${fmt(s.heuresPrevues)} h</td><td class="num">${fmt(s.heuresPlanifiees)} h</td><td class="num">${fmt(s.heuresPassees, 1)} h</td>
      <td class="num ${reste < 0 ? 'neg' : ''}">${fmt(reste, 1)} h</td><td>${bar(s.avancement)}</td><td class="num ${aPlanifier > 0 ? 'neg' : ''}">${aPlanifier > 0 ? fmt(aPlanifier, 1) + ' h' : '—'}</td></tr>`;
  }).join('')}</table></div>`;
};
Views.planning.bind = root => {
  root.querySelectorAll('td[data-u]').forEach(td => td.onclick = () => planningCell(td.dataset.u, td.dataset.w));
};

function planningCell(userId, semaine) {
  const items = Store.all('planning').filter(p => p.userId === userId && p.semaine === semaine);
  const affs = Store.all('affaires').filter(a => a.statut !== 'Perdue');
  const box = Modal.open(`<h2 style="margin-top:0">${esc(userName(userId))} – ${esc(semaine)}</h2>
    <table><tr><th>Affaire</th><th>Tâche</th><th class="num">Heures</th><th></th></tr>
    ${items.map(p => `<tr data-id="${p.id}"><td><select data-k="affaireId">${options(affs, p.affaireId, affaireLabel, false)}</select></td><td><input data-k="libelle" value="${esc(p.libelle)}"></td><td><input data-k="heuresPrevues" type="number" step="0.5" value="${esc(p.heuresPrevues)}" style="width:90px"></td><td><button class="small danger" data-del="${p.id}">✕</button></td></tr>`).join('')}
    <tr><td><select id="n-aff">${options(affs, '', affaireLabel, false)}</select></td><td><input id="n-lib" placeholder="Tâche"></td><td><input id="n-h" type="number" step="0.5" style="width:90px"></td><td><button class="small" id="n-add">+</button></td></tr>
    </table>
    <div class="modal-actions"><button id="close">Fermer</button></div>`);
  const refresh = () => { App.render(); planningCell(userId, semaine); };
  box.querySelectorAll('tr[data-id] [data-k]').forEach(el => el.onchange = () => {
    const p = Store.get('planning', el.closest('tr').dataset.id);
    p[el.dataset.k] = el.dataset.k === 'heuresPrevues' ? +el.value : el.value;
    Store.upsert('planning', p); App.render();
  });
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { Store.remove('planning', b.dataset.del); refresh(); });
  box.querySelector('#n-add').onclick = () => {
    const h = +box.querySelector('#n-h').value;
    if (!h) return;
    Store.upsert('planning', { userId, semaine, affaireId: box.querySelector('#n-aff').value, libelle: box.querySelector('#n-lib').value, heuresPrevues: h });
    refresh();
  };
  box.querySelector('#close').onclick = Modal.close;
}

/* ---------------- Heures passées ---------------- */
Views.temps = (params, query) => {
  const fu = query.get('user') || '', fa = query.get('affaire') || '';
  const list = Store.all('temps').filter(t => (!fu || t.userId === fu) && (!fa || t.affaireId === fa))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300);
  const total = list.reduce((s, t) => s + num(t.heures), 0);
  const affs = Store.all('affaires').filter(a => a.statut !== 'Perdue');
  return `<h1>Saisie des heures passées</h1>
  <div class="card" style="margin-bottom:16px">
    <div class="grid2">
      <div class="field"><label>Date</label><input id="t-date" type="date" value="${isoDate(new Date())}"></div>
      <div class="field"><label>Ressource</label><select id="t-user">${options(Store.all('users'), fu || Store.me.userId, undefined, false)}</select></div>
      <div class="field"><label>Affaire</label><select id="t-aff">${options(affs, fa, affaireLabel, false)}</select></div>
      <div class="field"><label>Tâche</label><input id="t-tache" placeholder="Pressage, cuisson, émaillage, suivi…"></div>
      <div class="field"><label>Heures</label><input id="t-h" type="number" step="0.25"></div>
      <div class="field"><label>&nbsp;</label><button id="t-add" style="width:100%">Enregistrer</button></div>
    </div>
  </div>
  <div class="toolbar">
    <select id="fu" style="width:auto"><option value="">Toutes ressources</option>${options(Store.all('users'), fu, undefined, false)}</select>
    <select id="fa" style="width:auto"><option value="">Toutes affaires</option>${options(Store.all('affaires'), fa, affaireLabel, false)}</select>
    <span class="spacer"></span><strong>Total : ${fmt(total, 2)} h</strong>
  </div>
  <div class="table-wrap"><table><tr><th>Date</th><th>Semaine</th><th>Ressource</th><th>Affaire</th><th>Tâche</th><th class="num">Heures</th><th></th></tr>
  ${list.map(t => `<tr><td>${dateFr(t.date)}</td><td>${isoWeek(new Date(t.date))}</td><td>${esc(userName(t.userId))}</td><td>${esc(affaireOf(t.affaireId).code)}</td><td>${esc(t.tache)}</td><td class="num">${fmt(t.heures, 2)}</td><td><button class="small danger" data-del="${t.id}">✕</button></td></tr>`).join('')}
  </table></div>`;
};
Views.temps.bind = root => {
  const upd = () => { location.hash = `#/temps?user=${root.querySelector('#fu').value}&affaire=${root.querySelector('#fa').value}`; };
  root.querySelector('#fu').onchange = upd;
  root.querySelector('#fa').onchange = upd;
  root.querySelector('#t-add').onclick = () => {
    const h = +root.querySelector('#t-h').value;
    if (!h || !root.querySelector('#t-aff').value) { notify('Renseigner une affaire et un nombre d\'heures.'); return; }
    Store.upsert('temps', { date: root.querySelector('#t-date').value, userId: root.querySelector('#t-user').value,
      affaireId: root.querySelector('#t-aff').value, tache: root.querySelector('#t-tache').value, heures: h });
    App.render(); App.toast('Heures enregistrées');
  };
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { Store.remove('temps', b.dataset.del); App.render(); });
};

/* ---------------- Analyse & REX ---------------- */
Views.analyse = (params, query) => {
  const fc = query.get('charge') || '';
  const affaires = Store.all('affaires').filter(a => a.statut !== 'Perdue' && (!fc || a.chargeId === fc));
  const rows = affaires.map(a => ({ a, s: Calc.affaire(a) })).sort((x, y) => x.s.margePct - y.s.margePct);
  const rex = Store.all('affaires').filter(a => a.rex && (a.rex.negatif || a.rex.actions || a.rex.positif) && (!fc || a.chargeId === fc));
  return `<h1>Analyse de rentabilité &amp; retour d'expérience</h1>
  <div class="toolbar">
    <select id="fc" style="width:auto"><option value="">Tous les chargés d'affaires</option>${options(charges(), fc, undefined, false)}</select>
    <span class="spacer"></span><button class="secondary dl-btn" id="csv">Export CSV</button>
  </div>

  <h2>Par chargé d'affaires</h2>
  <div class="table-wrap"><table><tr><th>Chargé d'affaires</th><th class="num">Affaires</th><th class="num">En cours</th><th class="num">Devis</th><th class="num">Transfo.</th><th class="num">CA</th><th class="num">Marge</th><th class="num">Marge %</th><th class="num">Heures passé / prévu</th><th class="num">Écart heures</th><th class="num">Note REX moy.</th></tr>
  ${charges().filter(u => !fc || u.id === fc).map(u => {
    const c = Calc.charge(u.id);
    return `<tr class="clickable" onclick="location.hash='#/analyse?charge=${u.id}'"><td>${esc(u.nom)}</td><td class="num">${c.nbAffaires}</td><td class="num">${c.enCours}</td><td class="num">${c.nbDevis}</td><td class="num">${pct(c.transfo)}</td><td class="num">${eur(c.ca)}</td><td class="num ${signClass(c.marge)}">${eur(c.marge)}</td><td class="num">${marginBadge(c.margePct)}</td><td class="num">${fmt(c.hPass)} / ${fmt(c.hPrev)} h</td><td class="num ${c.ecartPct > 0 ? 'neg' : 'pos'}">${c.ecartPct > 0 ? '+' : ''}${pct(c.ecartPct)}</td><td class="num">${c.noteMoy ? fmt(c.noteMoy, 1) + ' / 5' : '—'}</td></tr>`;
  }).join('')}</table></div>

  <h2>Par affaire (de la moins rentable à la plus rentable)</h2>
  <div class="table-wrap"><table><tr><th>Affaire</th><th>Chargé</th><th>Statut</th><th class="num">CA</th><th class="num">Matière</th><th class="num">MO réelle</th><th class="num">Transport</th><th class="num">Marge</th><th class="num">Prév.</th><th class="num">Réel</th><th class="num">Écart h</th></tr>
  ${rows.map(({ a, s }) => `<tr class="clickable" onclick="location.hash='#/affaire/${a.id}'"><td>${esc(affaireLabel(a))}</td><td>${esc(userName(a.chargeId))}</td><td>${badge(a.statut)}</td><td class="num">${eur(s.ca)}</td><td class="num">${eur(s.coutMatiere)}</td><td class="num">${eur(s.coutMO)}</td><td class="num">${eur(s.coutLivraison)}</td><td class="num ${signClass(s.marge)}">${eur(s.marge)}</td><td class="num">${s.caDevis ? pct(s.margePrevPct) : '—'}</td><td class="num">${s.ca ? marginBadge(s.margePct) : '—'}</td><td class="num ${s.ecartHeures > 0 ? 'neg' : 'pos'}">${s.heuresPrevues ? (s.ecartHeures > 0 ? '+' : '') + pct(s.ecartHeuresPct) : '—'}</td></tr>`).join('')}
  </table></div>

  <h2>Capitalisation des retours d'expérience</h2>
  ${rex.length ? `<div class="table-wrap"><table><tr><th>Affaire</th><th>Chargé</th><th>Note</th><th>Points positifs</th><th>Points négatifs</th><th>Actions</th></tr>
    ${rex.map(a => `<tr class="clickable" onclick="location.hash='#/affaire/${a.id}'"><td>${esc(affaireLabel(a))}</td><td>${esc(userName(a.chargeId))}</td><td>${a.rex.note ? esc(a.rex.note) + '/5' : '—'}</td><td>${esc(a.rex.positif)}</td><td>${esc(a.rex.negatif)}</td><td>${esc(a.rex.actions)}</td></tr>`).join('')}
  </table></div>` : '<p class="muted">Aucun REX saisi.</p>'}`;
};
Views.analyse.bind = root => {
  root.querySelector('#fc').onchange = e => { location.hash = `#/analyse?charge=${e.target.value}`; };
  root.querySelector('#csv').onclick = () => download('analyse-affaires.csv', toCSV([
    ['Code', 'Affaire', 'Client', 'Charge', 'Statut', 'CA', 'CoutMatiere', 'CoutMO', 'CoutTransport', 'Marge', 'MargePct', 'MargePrevPct', 'HeuresPrevues', 'HeuresPassees', 'EcartHeuresPct', 'NoteREX'],
    ...Store.all('affaires').map(a => { const s = Calc.affaire(a); return [a.code, a.nom, clientName(a.clientId), userName(a.chargeId), a.statut,
      s.ca.toFixed(2), s.coutMatiere.toFixed(2), s.coutMO.toFixed(2), s.coutLivraison.toFixed(2), s.marge.toFixed(2), s.margePct.toFixed(1), s.margePrevPct.toFixed(1),
      s.heuresPrevues, s.heuresPassees, s.ecartHeuresPct.toFixed(1), (a.rex || {}).note || '']; })]), 'text/csv');
};

/* ---------------- Paramètres ---------------- */
const settingsFields = [
  { key: 'societe', label: 'Société' },
  { key: 'adresse', label: 'Adresse' },
  { key: 'siret', label: 'SIRET' },
  { key: 'tva', label: 'TVA %', type: 'number', step: '0.1' },
  { key: 'tauxHoraireDefaut', label: 'Taux horaire standard (chiffrage) €/h', type: 'number', step: '0.5' },
  { key: 'delaiPaiement', label: 'Délai de paiement (jours)', type: 'number' },
];
const userFields = [
  { key: 'nom', label: 'Nom' },
  { key: 'role', label: 'Rôle', type: 'select', options: v => `<option value="charge" ${v === 'charge' ? 'selected' : ''}>Chargé d'affaires</option><option value="atelier" ${v === 'atelier' ? 'selected' : ''}>Atelier / opérateur</option>` },
  { key: 'tauxHoraire', label: 'Taux horaire chargé €/h', type: 'number', step: '0.5' },
  { key: 'capaciteHebdo', label: 'Capacité hebdomadaire (h)', type: 'number' },
];
Views.parametres = () => {
  const admin = Store.can('admin');
  return `<h1>Paramètres</h1>
  <h2>Mon compte</h2>
  <div class="card">
    <p class="muted" style="margin-top:0">Connecté en tant que <strong>${esc(Store.me.login)}</strong> (${esc(ROLE_LABELS[Store.me.role])}).</p>
    <div class="grid2">
      <div class="field"><label>Mot de passe actuel</label><input id="pw-cur" type="password" autocomplete="current-password"></div>
      <div class="field"><label>Nouveau mot de passe (8 caractères min.)</label><input id="pw-new" type="password" autocomplete="new-password"></div>
      <div class="field"><label>&nbsp;</label><button id="pw-save">Changer le mot de passe</button></div>
    </div>
  </div>
  ${admin ? `
  <h2>Société</h2>
  <div class="card">${formFields(settingsFields, Store.data.settings)}<div class="modal-actions"><button id="s-save">Enregistrer</button></div></div>

  <h2>Comptes utilisateurs</h2>
  <p class="muted">Administrateur : tout. Chargé d'affaires : clients, affaires, devis, factures, planning, heures (pas de suppression de facture). Atelier : saisie des heures et consultation du planning.</p>
  <div class="toolbar"><button id="acc-add">+ Compte</button></div>
  <div class="table-wrap"><table id="accounts"><tr><td class="muted">Chargement…</td></tr></table></div>` : ''}

  ${Store.can('write', 'users') ? `
  <h2>Équipe &amp; ressources (planning)</h2>
  <div class="toolbar"><button id="u-add">+ Ressource</button></div>
  <div class="table-wrap"><table><tr><th>Nom</th><th>Rôle</th><th class="num">Taux horaire</th><th class="num">Capacité / sem.</th></tr>
  ${Store.all('users').map(u => `<tr class="clickable" data-id="${u.id}"><td>${esc(u.nom)}</td><td>${u.role === 'charge' ? "Chargé d'affaires" : 'Atelier'}</td><td class="num">${eur(u.tauxHoraire)}</td><td class="num">${fmt(u.capaciteHebdo)} h</td></tr>`).join('')}
  </table></div>` : ''}

  ${Store.me.role !== 'atelier' ? `
  <h2>Données</h2>
  <p class="muted">Les données sont stockées sur le serveur et partagées par tous les utilisateurs. ${admin ? "Sauvegarde complète : copier le fichier de base de données du serveur, ou exporter ici." : ''}</p>
  <div class="toolbar">
    <button class="secondary dl-btn" id="export">Exporter (JSON)</button>
    ${admin ? `<label class="btn secondary">Importer (JSON) – remplace tout<input type="file" id="import" accept=".json" style="display:none"></label>
    <button class="danger" id="reset">Réinitialiser avec les données de démo</button>` : ''}
  </div>` : ''}

  ${admin ? `<h2>Historique des modifications</h2><div class="table-wrap"><table id="audit"><tr><td class="muted">Chargement…</td></tr></table></div>` : ''}`;
};

const COL_LABELS = { users: 'Ressource', clients: 'Client', articles: 'Article', zones: 'Zone', affaires: 'Affaire', devis: 'Devis', factures: 'Facture', planning: 'Planning', temps: 'Heures' };

function accountModal(acc, onDone) {
  const isNew = !acc.id;
  const box = Modal.open(`<h2 style="margin-top:0">${isNew ? 'Nouveau compte' : 'Compte ' + esc(acc.login)}</h2>
    <div class="grid2">
      ${isNew ? '<div class="field"><label>Identifiant de connexion</label><input id="a-login" autocomplete="off"></div>' : ''}
      <div class="field"><label>Nom affiché</label><input id="a-nom" value="${esc(acc.nom)}"></div>
      <div class="field"><label>Rôle</label><select id="a-role">${Object.entries(ROLE_LABELS).map(([k, v]) => `<option value="${k}" ${k === acc.role ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>Ressource liée (planning / heures)</label><select id="a-user">${options(Store.all('users'), acc.userId)}</select></div>
      <div class="field"><label>${isNew ? 'Mot de passe (8 caractères min.)' : 'Nouveau mot de passe (laisser vide pour ne pas changer)'}</label><input id="a-pw" type="password" autocomplete="new-password"></div>
    </div>
    <div class="modal-actions">
      ${!isNew && acc.id !== Store.me.id ? '<button class="danger" id="a-del">Supprimer</button>' : ''}
      <span style="flex:1"></span>
      <button class="secondary" id="a-cancel">Annuler</button><button id="a-save">Enregistrer</button>
    </div>`);
  const v = id => box.querySelector(id).value;
  box.querySelector('#a-cancel').onclick = Modal.close;
  box.querySelector('#a-save').onclick = async () => {
    const body = { nom: v('#a-nom'), role: v('#a-role'), userId: v('#a-user') };
    if (v('#a-pw')) body.password = v('#a-pw');
    try {
      if (isNew) await api('POST', '/api/accounts', { ...body, login: v('#a-login') });
      else await api('PUT', `/api/accounts/${acc.id}`, body);
      Modal.close(); App.toast('Compte enregistré'); onDone();
    } catch (e) { notify(e.message); }
  };
  const del = box.querySelector('#a-del');
  if (del) del.onclick = async () => {
    if (!await ask(`Supprimer le compte ${acc.login} ?`, 'Supprimer')) return;
    try { await api('DELETE', `/api/accounts/${acc.id}`); Modal.close(); onDone(); } catch (e) { notify(e.message); }
  };
}

Views.parametres.bind = root => {
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  on('#pw-save', async () => {
    try {
      await api('POST', '/api/me/password', { current: root.querySelector('#pw-cur').value, next: root.querySelector('#pw-new').value });
      root.querySelector('#pw-cur').value = root.querySelector('#pw-new').value = '';
      App.toast('Mot de passe modifié');
    } catch (e) { notify(e.message); }
  });
  on('#s-save', async () => {
    try { await Store.saveSettings(readForm(root, settingsFields, { ...Store.data.settings })); App.toast('Paramètres enregistrés'); }
    catch (e) { notify(e.message); }
  });
  on('#u-add', () => editModal({ title: 'Nouvelle ressource', col: 'users', fields: userFields, obj: { role: 'atelier', capaciteHebdo: 35, tauxHoraire: Store.data.settings.tauxHoraireDefaut } }));
  root.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () =>
    editModal({ title: 'Ressource', col: 'users', fields: userFields, obj: { ...Store.get('users', tr.dataset.id) } }));
  on('#export', () => download(`tuilerie-crm-${isoDate(new Date())}.json`, Store.exportJSON()));
  const imp = root.querySelector('#import');
  if (imp) imp.onchange = async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !await ask('Remplacer TOUTES les données du serveur par ce fichier ?', 'Remplacer')) return;
    file.text().then(t => Store.importJSON(t)).then(() => { App.render(); App.toast('Import réussi'); }).catch(err => notify('Import impossible : ' + err.message));
  };
  on('#reset', async () => {
    if (!await ask('Effacer toutes les données (pour tous les utilisateurs) et recharger la démo ?', 'Tout effacer')) return;
    Store.reset().then(() => App.render()).catch(e => notify(e.message));
  });

  if (!Store.can('admin')) return;
  const loadAccounts = () => api('GET', '/api/accounts').then(list => {
    const t = root.querySelector('#accounts');
    if (!t) return;
    t.innerHTML = `<tr><th>Identifiant</th><th>Nom</th><th>Rôle</th><th>Ressource liée</th><th>Créé le</th></tr>` +
      list.map(a => `<tr class="clickable" data-acc="${a.id}"><td>${esc(a.login)}</td><td>${esc(a.nom)}</td><td>${esc(ROLE_LABELS[a.role])}</td><td>${esc(a.userId ? userName(a.userId) : '—')}</td><td>${dateFr(a.createdAt)}</td></tr>`).join('');
    t.querySelectorAll('tr[data-acc]').forEach(tr => tr.onclick = () => accountModal(list.find(a => a.id === tr.dataset.acc), loadAccounts));
  });
  on('#acc-add', () => accountModal({ role: 'charge' }, loadAccounts));
  loadAccounts();
  api('GET', '/api/audit').then(rows => {
    const t = root.querySelector('#audit');
    if (!t) return;
    t.innerHTML = `<tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Élément</th></tr>` +
      rows.map(r => `<tr><td>${new Date(r.at).toLocaleString('fr-FR')}</td><td>${esc(r.login)}</td><td>${esc(r.action)}</td><td>${esc(COL_LABELS[r.col] || '')} ${esc(r.label || '')}</td></tr>`).join('');
  });
};
