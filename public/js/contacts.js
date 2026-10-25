// Contacts : entreprises (clients / fournisseurs, avec plusieurs sites) et personnes rattachées.
const CATEGORIES = ['Client', 'Fournisseur', 'Client et fournisseur', "Maîtrise d'œuvre"];
const SECTEURS = ['Pétrochimie', 'Chimie', 'Pharmacie', 'Agroalimentaire', 'Énergie', 'Eau et environnement', 'Papeterie', 'Métallurgie', 'Négoce tubes et raccords', 'Robinetterie', 'Sous-traitance', 'Autre'];
const FONCTIONS = ['Chargé de travaux', 'Responsable maintenance', 'Responsable travaux neufs', 'Acheteur', 'Acheteuse', "Ingénieur d'affaires", 'Directeur technique', 'Responsable HSE', 'Comptabilité', 'Commercial', 'Commerciale', 'Technico-commercial'];

const entreprise = id => Store.get('entreprises', id) || {};
const isClient = e => ['Client', 'Client et fournisseur'].includes(e.categorie || 'Client');
const moeList = () => Store.all('entreprises').filter(e => e.categorie === "Maîtrise d'œuvre" || isClient(e)).sort((a, b) => a.nom.localeCompare(b.nom));
const clientsList = () => Store.all('entreprises').filter(isClient).sort((a, b) => a.nom.localeCompare(b.nom));
const clientName = id => entreprise(id).nom || '—';
const contactName = c => (c && (c.prenom || c.nom)) ? [c.prenom, c.nom].filter(Boolean).join(' ') : '—';
const contactsOf = eid => Store.all('contacts').filter(c => c.entrepriseId === eid);
const siteOf = (eid, sid) => (entreprise(eid).adresses || []).find(s => s.id === sid);
const siteLabel = s => s ? `${s.libelle}${s.ville ? ' – ' + s.ville : ''}` : '';
const billingSite = eid => { const a = entreprise(eid).adresses || []; return a.find(s => s.facturation) || a[0]; };
const fullAddress = s => s ? [s.adresse, [s.cp, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
const categoryBadge = c => `<span class="badge ${c === 'Fournisseur' ? 'b-warn' : c === 'Client' ? 'b-info' : c === "Maîtrise d'œuvre" ? '' : 'b-ok'}">${esc(c || 'Client')}</span>`;

// Listes déroulantes dépendantes de l'entreprise choisie
const contactOptions = (eid, sel) => '<option value="">—</option>' + contactsOf(eid)
  .map(c => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(contactName(c))}${c.fonction ? ' · ' + esc(c.fonction) : ''}</option>`).join('');
const siteOptions = (eid, sel) => '<option value="">—</option>' + (entreprise(eid).adresses || [])
  .map(s => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc(siteLabel(s))}</option>`).join('');
// Contact proposé par défaut : le chargé de travaux de l'entreprise
const defaultContact = eid => (contactsOf(eid).find(c => /charg[ée] de travaux/i.test(c.fonction || '')) || contactsOf(eid)[0] || {}).id || '';

const entrepriseFields = [
  { key: 'nom', label: 'Raison sociale' },
  { key: 'categorie', label: 'Catégorie', type: 'select', options: v => optionsStr(CATEGORIES, v || 'Client') },
  { key: 'secteur', label: "Secteur d'activité", datalist: SECTEURS },
  { key: 'siret', label: 'SIRET' },
  { key: 'tvaIntra', label: 'N° TVA intracommunautaire' },
  { key: 'regimeTVA', label: 'TVA des devis et factures', type: 'select', options: v => `<option value="">Taux habituel (${fmt(Store.data.settings.tva, 1)} %)</option>${REGIMES_TVA.map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('')}` },
  { key: 'compteComptable', label: 'Compte comptable (auxiliaire, donné par le comptable)' },
  { key: 'compteCharge', label: 'Compte de charge par défaut de ce fournisseur (ex. 611000 sous-traitance, 621100 intérim)' },
  { key: 'tel', label: 'Téléphone standard', type: 'tel' },
  { key: 'email', label: 'E-mail', type: 'email' },
  { key: 'web', label: 'Site web' },
  { key: 'zoneId', label: 'Zone de livraison par défaut', type: 'select', options: v => options(Store.all('zones'), v) },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];
const contactFields = [
  { key: 'civilite', label: 'Civilité', type: 'select', options: v => optionsStr(['', 'Madame', 'Monsieur'], v || '') },
  { key: 'prenom', label: 'Prénom' },
  { key: 'nom', label: 'Nom' },
  { key: 'fonction', label: 'Fonction', datalist: FONCTIONS },
  { key: 'entrepriseId', label: 'Entreprise', type: 'select', options: v => options(Store.all('entreprises').slice().sort((a, b) => a.nom.localeCompare(b.nom)), v) },
  { key: 'siteId', label: 'Site de rattachement', type: 'select', dynamic: true, options: (v, o) => siteOptions(o.entrepriseId, v) },
  { key: 'tel', label: 'Téléphone fixe', type: 'tel' },
  { key: 'mobile', label: 'Portable', type: 'tel' },
  { key: 'email', label: 'E-mail', type: 'email' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];
const siteFields = [
  { key: 'libelle', label: 'Nom du site (ex. Siège, Usine de…, Site de…)' },
  { key: 'adresse', label: 'Adresse' },
  { key: 'cp', label: 'Code postal' },
  { key: 'ville', label: 'Ville' },
  { key: 'facturation', label: 'Adresse de facturation', type: 'select', options: v => `<option value="">Non</option><option value="1" ${v ? 'selected' : ''}>Oui</option>` },
  { key: 'acces', label: "Consignes d'accès (badge, EPI, horaires…)", type: 'textarea' },
];

function openContact(obj, onSave) {
  editModal({ title: obj.id ? contactName(obj) : 'Nouveau contact', col: 'contacts', fields: contactFields, obj, onSave });
}

function openEntreprise(obj) {
  editModal({ title: obj.id ? obj.nom : 'Nouvelle entreprise', col: 'entreprises', fields: entrepriseFields, obj,
    onSave: () => { if (location.hash !== `#/entreprise/${obj.id}`) location.hash = `#/entreprise/${obj.id}`; else App.render(); },
    onDelete: () => { location.hash = '#/contacts'; } });
}

// Les sites sont stockés dans la fiche entreprise
function openSite(ent, site) {
  const isNew = !site;
  const obj = site ? { ...site, facturation: site.facturation ? '1' : '' } : { libelle: '', facturation: (ent.adresses || []).length ? '' : '1' };
  const box = Modal.open(`<h2 style="margin-top:0">${isNew ? 'Nouveau site' : esc(site.libelle)} · ${esc(ent.nom)}</h2>
    ${formFields(siteFields, obj)}
    <div class="modal-actions">
      ${isNew ? '' : '<button class="danger" data-act="del">Supprimer</button>'}
      <span style="flex:1"></span>
      <button class="secondary" data-act="cancel">Annuler</button><button data-act="save">Enregistrer</button>
    </div>`);
  const save = list => { Store.upsert('entreprises', { ...ent, adresses: list }); Modal.close(); App.render(); };
  box.querySelector('[data-act=cancel]').onclick = Modal.close;
  box.querySelector('[data-act=save]').onclick = () => {
    const v = readForm(box, siteFields, { ...obj });
    const rec = { ...v, id: obj.id || uid(), facturation: v.facturation === '1' };
    let list = (ent.adresses || []).filter(s => s.id !== rec.id);
    if (rec.facturation) list = list.map(s => ({ ...s, facturation: false }));
    list.push(rec);
    save(list);
  };
  const del = box.querySelector('[data-act=del]');
  if (del) del.onclick = async () => {
    const used = Store.all('contacts').filter(c => c.siteId === site.id).length + Store.all('affaires').filter(a => a.siteId === site.id).length;
    if (await ask(`Supprimer le site « ${site.libelle} » ?${used ? ` Il est utilisé par ${used} contact(s) ou affaire(s).` : ''}`, 'Supprimer')) {
      save((ent.adresses || []).filter(s => s.id !== site.id));
    }
  };
}

function contactsTabs(active) {
  return `<div class="tabs">
    <a href="#/contacts" class="${active === 'entreprises' ? 'active' : ''}">Entreprises <span class="count">${Store.all('entreprises').length}</span></a>
    <a href="#/contacts/personnes" class="${active === 'personnes' ? 'active' : ''}">Contacts <span class="count">${Store.all('contacts').length}</span></a>
  </div>`;
}

// Recherche instantanée dans un tableau sans re-rendu (garde le focus)
function bindSearch(root, sel = '#search') {
  const input = root.querySelector(sel);
  if (!input) return;
  input.oninput = () => {
    const q = input.value.trim().toLowerCase();
    root.querySelectorAll('tr[data-search]').forEach(tr => { tr.hidden = q && !tr.dataset.search.includes(q); });
  };
}

Views.contacts = (params, query) => {
  if (params[0] === 'personnes') return personnesView(query);
  const fc = query.get('categorie') || '';
  const list = Store.all('entreprises')
    .filter(e => !fc || (fc === 'Client' ? isClient(e) : fc === 'MOE' ? e.categorie === "Maîtrise d'œuvre" : ['Fournisseur', 'Client et fournisseur'].includes(e.categorie)))
    .sort((a, b) => a.nom.localeCompare(b.nom));
  return `<h1>Contacts</h1>
  ${contactsTabs('entreprises')}
  <div class="toolbar">
    <button id="add">+ Entreprise</button>
    ${boutonsEchange('entreprises')}
    <span class="spacer"></span>
    <input id="search" type="search" placeholder="Rechercher…" style="width:auto;min-width:0;flex:1 1 160px;max-width:260px">
    <select id="fc" style="width:auto"><option value="">Clients et fournisseurs</option>
      <option value="Client" ${fc === 'Client' ? 'selected' : ''}>Clients</option><option value="Fournisseur" ${fc === 'Fournisseur' ? 'selected' : ''}>Fournisseurs</option><option value="MOE" ${fc === 'MOE' ? 'selected' : ''}>Maîtrise d'œuvre</option></select>
  </div>
  ${list.length ? `<div class="table-wrap"><table><tr><th>Entreprise</th><th>Catégorie</th><th>Secteur</th><th>Ville</th><th>Téléphone</th><th class="num">Sites</th><th class="num">Contacts</th><th class="num">Affaires</th></tr>
  ${list.map(e => {
    const b = billingSite(e.id);
    const nbAff = Store.all('affaires').filter(a => a.clientId === e.id).length;
    return `<tr class="clickable" data-search="${esc([e.nom, e.secteur, b && b.ville, e.siret].join(' ').toLowerCase())}" data-go="#/entreprise/${e.id}">
      <td><strong>${esc(e.nom)}</strong></td><td>${categoryBadge(e.categorie)}</td><td>${esc(e.secteur)}</td><td>${esc(b ? b.ville : '')}</td><td>${esc(e.tel)}</td>
      <td class="num">${(e.adresses || []).length}</td><td class="num">${contactsOf(e.id).length}</td><td class="num">${nbAff || ''}</td></tr>`;
  }).join('')}</table></div>` : '<p class="muted">Aucune entreprise. Ajoutez vos clients et fournisseurs avec « + Entreprise ».</p>'}`;
};
Views.contacts.bind = (root, params) => {
  bindEchange(root);
  if (params[0] === 'personnes') return bindPersonnes(root);
  root.querySelector('#add').onclick = () => openEntreprise({ categorie: 'Client', adresses: [] });
  root.querySelector('#fc').onchange = e => { location.hash = `#/contacts?categorie=${encodeURIComponent(e.target.value)}`; };
  bindSearch(root);
};

function personnesView(query) {
  const fe = query.get('entreprise') || '';
  const list = Store.all('contacts').filter(c => !fe || c.entrepriseId === fe)
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
  return `<h1>Contacts</h1>
  ${contactsTabs('personnes')}
  <div class="toolbar">
    <button id="add">+ Contact</button>
    ${boutonsEchange('contacts')}
    <span class="spacer"></span>
    <input id="search" type="search" placeholder="Rechercher…" style="width:auto;min-width:0;flex:1 1 160px;max-width:260px">
    <select id="fe" style="width:auto"><option value="">Toutes les entreprises</option>${options(Store.all('entreprises').slice().sort((a, b) => a.nom.localeCompare(b.nom)), fe, undefined, false)}</select>
  </div>
  ${list.length ? `<div class="table-wrap"><table><tr><th>Nom</th><th>Fonction</th><th>Entreprise</th><th>Site</th><th>Téléphone</th><th>E-mail</th></tr>
  ${list.map(c => {
    const e = entreprise(c.entrepriseId);
    return `<tr class="clickable" data-id="${c.id}" data-search="${esc([c.prenom, c.nom, c.fonction, e.nom].join(' ').toLowerCase())}">
      <td><strong>${esc(contactName(c))}</strong></td><td>${esc(c.fonction)}</td><td>${e.nom ? `${esc(e.nom)} ${e.categorie === 'Fournisseur' ? categoryBadge(e.categorie) : ''}` : '—'}</td>
      <td>${esc(siteLabel(siteOf(c.entrepriseId, c.siteId)))}</td><td>${esc(c.mobile || c.tel)}</td><td>${esc(c.email)}</td></tr>`;
  }).join('')}</table></div>` : '<p class="muted">Aucun contact.</p>'}`;
}
function bindPersonnes(root) {
  const fe = new URLSearchParams(location.hash.split('?')[1] || '').get('entreprise') || '';
  root.querySelector('#add').onclick = () => openContact({ entrepriseId: fe });
  root.querySelector('#fe').onchange = e => { location.hash = `#/contacts/personnes?entreprise=${e.target.value}`; };
  root.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => openContact({ ...Store.get('contacts', tr.dataset.id) }));
  bindSearch(root);
}

Views.entreprise = params => {
  const e = Store.get('entreprises', params[0]);
  if (!e) return '<p>Entreprise introuvable. <a href="#/contacts">Retour aux contacts</a></p>';
  const contacts = contactsOf(e.id);
  const affaires = Store.all('affaires').filter(a => a.clientId === e.id);
  const info = [['SIRET', e.siret], ['TVA intracom.', e.tvaIntra], ['TVA appliquée', e.regimeTVA ? (REGIMES_TVA.find(x => x[0] === e.regimeTVA) || [])[1] : ''], ['Téléphone', e.tel], ['E-mail', e.email], ['Site web', e.web],
    ['Zone de livraison', (Store.get('zones', e.zoneId) || {}).nom]].filter(([, v]) => v);
  return `<div class="toolbar"><a href="#/contacts" class="btn secondary">← Entreprises</a><span class="spacer"></span>
    <button class="secondary" id="edit">Modifier</button></div>
  <h1>${esc(e.nom)} ${categoryBadge(e.categorie)}</h1>
  ${e.secteur ? `<p class="muted" style="margin-top:-8px">${esc(e.secteur)}</p>` : ''}
  <div class="card"><dl class="infos">${info.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('') || '<div><dd class="muted">Aucune information. Cliquez sur « Modifier ».</dd></div>'}</dl>
    ${e.notes ? `<p style="margin-bottom:0;white-space:pre-line">${esc(e.notes)}</p>` : ''}</div>

  <h2>Sites et adresses</h2>
  <div class="toolbar"><button id="add-site">+ Site</button></div>
  ${(e.adresses || []).length ? `<div class="table-wrap"><table><tr><th>Site</th><th>Adresse</th><th>Usage</th><th class="num">Contacts</th></tr>
    ${e.adresses.map(s => `<tr class="clickable" data-site="${esc(s.id)}"><td><strong>${esc(s.libelle)}</strong>${s.acces ? `<br><span class="muted">${esc(s.acces)}</span>` : ''}</td>
      <td>${esc(fullAddress(s))}</td><td>${s.facturation ? '<span class="badge b-info">Facturation</span>' : ''}</td>
      <td class="num">${contacts.filter(c => c.siteId === s.id).length || ''}</td></tr>`).join('')}</table></div>`
  : '<p class="muted">Aucune adresse. Ajoutez le siège (facturation) puis les sites d\'intervention.</p>'}

  <h2>Contacts</h2>
  <div class="toolbar"><button id="add-contact">+ Contact</button></div>
  ${contacts.length ? `<div class="table-wrap"><table><tr><th>Nom</th><th>Fonction</th><th>Site</th><th>Téléphone</th><th>E-mail</th></tr>
    ${contacts.map(c => `<tr class="clickable" data-contact="${c.id}"><td><strong>${esc(contactName(c))}</strong></td><td>${esc(c.fonction)}</td>
      <td>${esc(siteLabel(siteOf(e.id, c.siteId)))}</td><td>${esc(c.mobile || c.tel)}</td><td>${esc(c.email)}</td></tr>`).join('')}</table></div>`
  : '<p class="muted">Aucun contact rattaché.</p>'}

  ${isClient(e) ? `${plansPreventionClient(e)}<h2>Chantiers</h2>${chantierTable(affaires)}${relevesClientHtml(e)}${relancesClient(e.id)}` : ''}`;
};
Views.entreprise.bind = (root, params) => {
  const e = Store.get('entreprises', params[0]);
  if (!e) return;
  root.querySelector('#edit').onclick = () => openEntreprise({ ...e });
  root.querySelector('#add-site').onclick = () => openSite(e, null);
  root.querySelector('#add-contact').onclick = () => openContact({ entrepriseId: e.id, siteId: (e.adresses || []).length === 1 ? e.adresses[0].id : '' });
  root.querySelectorAll('tr[data-site]').forEach(tr => tr.onclick = () => openSite(e, e.adresses.find(s => s.id === tr.dataset.site)));
  root.querySelectorAll('tr[data-contact]').forEach(tr => tr.onclick = () => openContact({ ...Store.get('contacts', tr.dataset.contact) }));
  if (isClient(e)) bindPlansPrevention(root, e);
};
