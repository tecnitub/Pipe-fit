// Documents du chantier (plans, fiches techniques, notices, sécurité…) déposés par le bureau et transmis aux compagnons,
// et fiche chantier du compagnon sur son téléphone : documents, matériel prévu (sans prix ni heures, selon les réglages),
// commandes et livraisons attendues.
const CATEGORIES_DOC = [['Demande client', '📧'], ['CCTP', '📑'], ['Plan', '📐'], ['Fiche technique', '📄'], ['Notice', '📘'], ['Note de calcul', '🧮'], ['Sécurité / PPSPS', '⛑️'], ['PGC', '🦺'], ['Plan de prévention', '🛡️'], ['Photo', '🖼️'], ['Autre', '📁']];
const iconeDoc = c => (CATEGORIES_DOC.find(x => x[0] === c) || CATEGORIES_DOC[CATEGORIES_DOC.length - 1])[1];
const categorieDevinee = Classement.categorieDevinee;
const tailleLisible = o => (o > 1048576 ? `${fmt(o / 1048576, 1)} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);
const reglesCompagnon = () => Compagnon.regles(Store.data.settings);
// Lien d'ouverture : PDF et images affichés, le reste téléchargé avec son nom
function lienDocument(d) {
  const u = fileUrl(d.fichierId);
  return u.startsWith('/api/') ? `${u}?nom=${encodeURIComponent(d.nom)}` : u;
}
const documentsVisibles = a => (a.documents || []).filter(d => d.visible);

// Onglets de la page chantier (bureau)
function chantierOnglets(a, actif) {
  const n = (a.documents || []).length;
  return `<div class="tabs no-print"><a href="#/chantier/${a.id}" class="${actif === 'apercu' ? 'active' : ''}">Vue d'ensemble</a>
    <a href="#/chantier/${a.id}/documents" class="${actif === 'documents' ? 'active' : ''}">📎 Documents <span class="count">${n}</span></a>
    <a href="#/chantier/${a.id}/securite" class="${actif === 'securite' ? 'active' : ''}">⛑️ Sécurité${(a.documents || []).some(d => d.categorie === 'Sécurité / PPSPS') ? '' : ' <span class="count">à faire</span>'}</a>
    ${estHorsDevis(a) ? '' : `<a href="#/chantier/${a.id}/gantt" class="${actif === 'gantt' ? 'active' : ''}">📊 Gantt${(a.phases || []).length ? '' : ' <span class="count">à faire</span>'}</a>`}
    ${estHorsDevis(a) ? '' : `<a href="#/situations">Situations</a>`}
    ${estHorsDevis(a) || !lienDOE(a) ? '' : `<a href="${esc(lienDOE(a))}" ${window.PIPEFIT_DEMO ? '' : 'target="_blank" rel="noopener"'} title="Dossier des ouvrages exécutés (application DOE)">📘 DOE${window.PIPEFIT_DEMO ? '' : ' ↗'}</a>`}
    ${estHorsDevis(a) || !lienEtudes(a) ? '' : `<a href="${esc(lienEtudes(a))}" ${window.PIPEFIT_DEMO ? '' : 'target="_blank" rel="noopener"'} title="Notes de calcul du bureau d'études (application Études)">📐 Études${window.PIPEFIT_DEMO ? '' : ' ↗'}</a>`}</div>`;
}
// Lien vers le dossier DOE du chantier dans l'application DOE (bureau uniquement)
function lienDOE(a) {
  if (!Store.me || Store.me.role === 'atelier') return '';
  // Démonstration : application DOE publiée à côté de la page (doe.html), ouverte dans un cadre de la page (voir Views.doe)
  if (window.PIPEFIT_DEMO) return `#/doe/${encodeURIComponent(a.id)}`;
  const base = String((Store.data.settings || {}).doeUrl || (/^https?:$/.test(location.protocol) && !window.PIPEFIT_DEMO ? `${location.protocol}//${location.hostname}:3100` : '')).trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(base) ? `${base}/#/chantier/${encodeURIComponent(a.id)}` : '';
}

// Lien vers les études (notes de calcul) du chantier dans l'application Études (bureau uniquement)
function lienEtudes(a) {
  if (!Store.me || Store.me.role === 'atelier') return '';
  // Démonstration : application Études publiée à côté de la page (etudes.html), ouverte dans un cadre (voir Views.etudes)
  if (window.PIPEFIT_DEMO) return `#/etudes/${encodeURIComponent(a.id)}`;
  const base = String((Store.data.settings || {}).etudesUrl || (/^https?:$/.test(location.protocol) && !window.PIPEFIT_DEMO ? `${location.protocol}//${location.hostname}:3200` : '')).trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(base) ? `${base}/#/chantier/${encodeURIComponent(a.id)}` : '';
}

// Envoi d'un fichier brut (jusqu'à 40 Mo) : renvoie { id, mime, taille }
async function envoyerFichierDocument(file) {
  const r = await fetch('/api/documents/fichier', { method: 'POST', body: file,
    headers: { 'X-PipeFit-Upload': '1', 'X-Filename': encodeURIComponent(file.name), 'Content-Type': file.type || 'application/octet-stream' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Envoi impossible (${r.status})`);
  return j;
}

/* ---------- Bureau : onglet Documents du chantier ---------- */
function documentsChantier(a) {
  const docs = (a.documents || []).slice().sort((x, y) => CATEGORIES_DOC.findIndex(c => c[0] === x.categorie) - CATEGORIES_DOC.findIndex(c => c[0] === y.categorie) || (y.date || '').localeCompare(x.date || ''));
  const edit = Store.can('write', 'affaires'), R = reglesCompagnon();
  const planifies = [...new Set(Store.all('planning').filter(p => p.affaireId === a.id && p.date >= isoDate(new Date())).map(p => p.userId))];
  return `<div class="toolbar"><a href="#/chantiers" class="btn secondary">← Chantiers</a></div>
  <h1>${esc(affaireLabel(a))} ${badge(a.statut)}</h1>${chantierOnglets(a, 'documents')}
  <p class="muted">Plans, fiches techniques, notices, documents de sécurité… Cochez « Transmettre aux compagnons » : ils les retrouvent dans la fiche du chantier sur leur téléphone${planifies.length ? ` et les ${planifies.length} personne(s) planifiée(s) à venir sont prévenues (${planifies.map(id => esc(prenomDe(userName(id)))).join(', ')})` : ''}.
    ${R.documents ? '' : '<span class="warn-text">L\'affichage des documents est désactivé pour les compagnons (Paramètres → Appli des compagnons).</span>'}</p>
  ${bandeauDossierChantier(a)}
  ${edit ? `<label class="doc-depot" id="doc-depot"><input type="file" id="doc-fichiers" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.dwg,.dxf,.dwf,.ifc,.stp,.step,.xlsx,.xls,.docx,.doc,.pptx,.csv,.zip,.txt,.eml,.msg">
    <strong>📤 Déposer des documents</strong><span class="small muted">Glissez les fichiers ici ou cliquez · PDF, images, DWG/DXF, IFC, STEP, Excel, Word, ZIP, e-mails · 40 Mo maximum par fichier</span>
    <span class="small"><input type="checkbox" id="doc-transmettre" checked> Transmettre aux compagnons</span></label>
    <div id="doc-progres" class="small muted"></div>` : ''}
  ${docs.length ? `<div class="table-wrap"><table class="docs-table"><tr><th>Document</th><th>Catégorie</th><th>Indice</th><th>Ajouté</th><th class="num">Taille</th><th>Compagnons</th>${edit ? '<th></th>' : ''}</tr>
    ${docs.map(d => `<tr data-doc="${d.id}">
      <td><a href="${lienDocument(d)}" target="_blank" rel="noopener" class="doc-nom">${iconeDoc(d.categorie)} ${esc(d.nom)}</a>${d.note ? `<div class="muted small">${esc(d.note)}</div>` : ''}${(d.anciens || []).length ? `<div class="muted small">Indices précédents : ${d.anciens.map(x => `<a href="${lienDocument({ ...d, fichierId: x.fichierId })}" target="_blank" rel="noopener">${esc(x.indice || '—')}</a>`).join(', ')}</div>` : ''}</td>
      <td>${edit ? `<select data-k="categorie" aria-label="Catégorie">${CATEGORIES_DOC.map(([c]) => `<option ${d.categorie === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : esc(d.categorie)}</td>
      <td>${edit ? `<input data-k="indice" value="${esc(d.indice || '')}" style="width:60px" aria-label="Indice">` : esc(d.indice || '')}</td>
      <td class="small">${dateFr(d.date)}<br><span class="muted">${esc(d.par || '')}</span></td><td class="num small">${tailleLisible(num(d.taille))}</td>
      <td>${edit ? `<label class="check small"><input type="checkbox" data-k="visible" ${d.visible ? 'checked' : ''}> transmis</label>` : d.visible ? '<span class="badge b-ok">transmis</span>' : '<span class="badge">bureau</span>'}</td>
      ${edit ? `<td class="nowrap"><label class="btn secondary small" title="Remplacer par un nouvel indice">Nouvel indice<input type="file" data-indice="${d.id}" hidden></label> <button class="small danger" data-suppr="${d.id}" aria-label="Supprimer">✕</button></td>` : ''}</tr>`).join('')}</table></div>`
    : '<p class="muted">Aucun document pour ce chantier.</p>'}`;
}

function bindDocumentsChantier(root, a) {
  bindDossierChantier(root, a);
  const enreg = () => { Store.upsert('affaires', a); App.render(); };
  const indiceSuivant = i => (/^[A-Y]$/i.test(i || '') ? String.fromCharCode(i.toUpperCase().charCodeAt(0) + 1) : /^\d+$/.test(i || '') ? String(+i + 1) : i ? `${i}+` : 'B');
  const deposer = async files => {
    const prog = root.querySelector('#doc-progres'), visible = (root.querySelector('#doc-transmettre') || {}).checked !== false;
    const ajoutes = [];
    for (const [k, f] of [...files].entries()) {
      prog.textContent = `Envoi ${k + 1}/${files.length} : ${f.name}…`;
      try {
        const r = await envoyerFichierDocument(f);
        ajoutes.push({ id: uid(), fichierId: r.id, nom: f.name, categorie: categorieDevinee(f.name), indice: '', note: '', mime: r.mime, taille: r.taille, date: isoDate(new Date()), par: Store.me.nom, visible });
      } catch (e) { notify(`${f.name} : ${e.message}`); }
    }
    prog.textContent = '';
    if (ajoutes.length) { a.documents = [...(a.documents || []), ...ajoutes]; enreg(); App.toast(`${ajoutes.length} document(s) ajouté(s)${visible ? ' et transmis aux compagnons' : ''}`); }
  };
  const input = root.querySelector('#doc-fichiers'), zone = root.querySelector('#doc-depot');
  if (input) input.onchange = () => { if (input.files.length) deposer(input.files); input.value = ''; };
  if (zone) {
    zone.ondragover = e => { e.preventDefault(); zone.classList.add('survol'); };
    zone.ondragleave = () => zone.classList.remove('survol');
    zone.ondrop = e => { e.preventDefault(); zone.classList.remove('survol'); if (e.dataTransfer.files.length) deposer(e.dataTransfer.files); };
  }
  const doc = el => (a.documents || []).find(d => d.id === el.closest('[data-doc]').dataset.doc);
  root.querySelectorAll('[data-doc] [data-k]').forEach(el => el.onchange = () => { const d = doc(el); d[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; enreg(); });
  root.querySelectorAll('[data-indice]').forEach(el => el.onchange = async () => {
    const d = (a.documents || []).find(x => x.id === el.dataset.indice), f = el.files[0];
    if (!d || !f) return;
    try {
      const r = await envoyerFichierDocument(f);
      d.anciens = [...(d.anciens || []), { fichierId: d.fichierId, indice: d.indice || 'A', date: d.date }];
      Object.assign(d, { fichierId: r.id, mime: r.mime, taille: r.taille, indice: indiceSuivant(d.indice || 'A'), date: isoDate(new Date()), par: Store.me.nom });
      enreg(); App.toast(`${d.nom} : indice ${d.indice}${d.visible ? ' transmis aux compagnons' : ''}`);
    } catch (e) { notify(e.message); }
  });
  root.querySelectorAll('[data-suppr]').forEach(b => b.onclick = async () => {
    const d = (a.documents || []).find(x => x.id === b.dataset.suppr);
    if (d && await ask(`Retirer « ${d.nom} » des documents du chantier ?`, 'Retirer')) { a.documents = a.documents.filter(x => x !== d); enreg(); }
  });
}

/* ---------- Compagnon : mes chantiers ---------- */
// Chantiers du compagnon : planifiés de J-7 à J+21, ou pointés ces 15 derniers jours (lui et son équipe)
function chantiersDuCompagnon(u) {
  const ids = [u.id, ...equipeDe(u.id).map(m => m.id)], auj = isoDate(new Date()), debut = isoDate(addDays(new Date(), -7)), fin = isoDate(addDays(new Date(), 21)), recent = isoDate(addDays(new Date(), -15));
  const prochains = {};
  Store.all('planning').filter(p => ids.includes(p.userId) && p.affaireId && p.date >= debut && p.date <= fin).forEach(p => { if (p.date >= auj && (!prochains[p.affaireId] || p.date < prochains[p.affaireId])) prochains[p.affaireId] = p.date; else prochains[p.affaireId] = prochains[p.affaireId] || ''; });
  Store.all('temps').filter(t => ids.includes(t.userId) && t.date >= recent).forEach(t => { if (!(t.affaireId in prochains)) prochains[t.affaireId] = ''; });
  return Object.entries(prochains).map(([id, d]) => ({ a: Store.get('affaires', id), prochain: d })).filter(x => x.a)
    .sort((x, y) => (x.prochain || '9999').localeCompare(y.prochain || '9999'));
}
const docsNonVus = affaireId => Notifs.nonLues().filter(n => n.type === 'document' && n.affaireId === affaireId).length;

function chantiersCompagnon(u) {
  const liste = chantiersDuCompagnon(u), R = reglesCompagnon();
  return `<div class="pointage"><h1>Mes chantiers</h1>${pointageTabs('chantiers', u.id)}
    ${liste.length ? liste.map(({ a, prochain }) => {
      const site = siteOf(a.clientId, a.siteId), nd = documentsVisibles(a).length, nv = docsNonVus(a.id);
      return `<a class="card ch-carte" href="#/pointage/chantier/${a.id}" style="--h:${teinte(a.id)}">
        <div><strong>${esc(a.code || '')}</strong> ${esc(a.nom || '')}</div>
        ${R.client && clientName(a.clientId) ? `<div class="small muted">${esc(clientName(a.clientId))}</div>` : ''}
        ${site ? `<div class="small">📍 ${esc(site.libelle)} · ${esc(site.ville || '')}</div>` : ''}
        <div class="small">${prochain ? `📅 ${prochain === isoDate(new Date()) ? 'aujourd\'hui' : jourLong(prochain)}` : '<span class="muted">pas de date prévue</span>'}${R.documents ? ` · 📎 ${nd} document${nd > 1 ? 's' : ''}` : ''}${nv ? ' <span class="badge b-warn">nouveau</span>' : ''}</div></a>`;
    }).join('') : '<p class="muted">Aucun chantier prévu pour vous en ce moment.</p>'}${mesHabilitations(u)}${monMateriel(u)}</div>`;
}

// Matériel prévu au devis : total par article et détail par ouvrage (quantités selon les réglages)
function materielPrevu(a) {
  const dv = Store.all('devis').find(d => d.affaireId === a.id && d.statut === 'Accepté');
  if (!dv) return null;
  const total = new Map(), ouvrages = [];
  let heures = 0;
  (dv.lignes || []).forEach(l => {
    if (l.type === 'chapitre') { ouvrages.push({ chap: true, titre: l.titre, niveau: l.niveau || 1 }); return; }
    if (!Calc.estPrix(l)) return;
    const fournitures = (l.composants || []).filter(c => c.type !== 'mo');
    (l.composants || []).filter(c => c.type === 'mo').forEach(c => { heures += num(c.heures) * num(l.qte); });
    ouvrages.push({ designation: l.designation, qte: l.qte, unite: l.unite, fournitures: fournitures.map(c => ({ ...c, total: c.qte === undefined || l.qte === undefined ? undefined : num(c.qte) * num(l.qte) })) });
    fournitures.forEach(c => {
      const k = c.articleId || c.designation, art = c.articleId ? Store.get('articles', c.articleId) : null;
      const x = total.get(k) || { designation: art ? art.designation : c.designation, ref: art ? art.ref : '', famille: art ? art.famille || 'Divers' : 'Divers', unite: c.unite || (art || {}).unite || '', qte: 0, articleId: c.articleId, avecQte: c.qte !== undefined };
      if (c.qte !== undefined && l.qte !== undefined) x.qte += num(c.qte) * num(l.qte);
      total.set(k, x);
    });
  });
  // Commandé / livré d'après les commandes du chantier
  const commandes = Store.all('commandes').filter(c => c.affaireId === a.id && c.statut !== 'Annulée');
  total.forEach(x => {
    const lignes = commandes.flatMap(c => (c.lignes || []).filter(l => (x.articleId && l.articleId === x.articleId) || (!x.articleId && l.designation === x.designation)).map(l => ({ l, c })));
    x.commande = sumBy(lignes, y => num(y.l.qte));
    x.livre = lignes.length && lignes.every(y => y.c.statut === 'Réceptionnée') ? 'livré' : lignes.some(y => /Réceptionnée/.test(y.c.statut)) ? 'en partie' : lignes.length ? 'commandé' : '';
  });
  return { dv, total: [...total.values()].sort((x, y) => x.famille.localeCompare(y.famille) || x.designation.localeCompare(y.designation)), ouvrages, heures };
}

const ficheCompagnonSel = { mode: 'article' };
function ficheChantierCompagnon(u, id) {
  const a = Store.get('affaires', id);
  if (!a) return `<div class="pointage"><h1>Chantier</h1>${pointageTabs('chantiers', u.id)}<p class="muted">Chantier introuvable.</p></div>`;
  const R = reglesCompagnon(), site = siteOf(a.clientId, a.siteId), adr = site ? fullAddress(site) : '', contact = Store.get('contacts', a.contactId);
  const jours = Store.all('planning').filter(p => p.affaireId === a.id && p.userId === u.id && p.date >= isoDate(new Date())).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 6);
  const docs = documentsVisibles(a).filter(d => !Securite.estDocSecurite(d.categorie)).sort((x, y) => CATEGORIES_DOC.findIndex(c => c[0] === x.categorie) - CATEGORIES_DOC.findIndex(c => c[0] === y.categorie));
  const nouveaux = new Set(Notifs.nonLues().filter(n => n.type === 'document' && n.affaireId === a.id).flatMap(n => (n.texte || '').split('\n')));
  const m = R.materiel ? materielPrevu(a) : null;
  const commandes = R.commandes ? Store.all('commandes').filter(c => c.affaireId === a.id && c.statut !== 'Annulée').sort((x, y) => (x.dateLivraison || '').localeCompare(y.dateLivraison || '')) : [];
  const qte = (v, unite) => (v === undefined ? '' : `<strong>${fmt(v, 2).replace(/,00$/, '')}</strong> ${esc(unite || '')}`);
  return `<div class="pointage"><h1>${esc(a.code || '')} <span class="muted small">${esc(a.nom || '')}</span></h1>${pointageTabs('chantiers', u.id)}
    <div class="card" style="--h:${teinte(a.id)}">
      ${R.client && clientName(a.clientId) ? `<div><strong>${esc(clientName(a.clientId))}</strong></div>` : ''}
      ${adr ? `<div class="small">📍 ${esc(site.libelle)} · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adr)}" target="_blank" rel="noopener">${esc(adr)}</a></div>` : ''}
      ${site && site.acces ? `<div class="small">🚧 Accès : ${esc(site.acces)}</div>` : ''}
      ${R.contactSite && contact ? `<div class="small">👤 ${esc(contactName(contact))}${contact.fonction ? `, ${esc(contact.fonction)}` : ''}${contact.mobile || contact.tel ? ` · <a href="tel:${esc((contact.mobile || contact.tel).replace(/\s/g, ''))}">${esc(contact.mobile || contact.tel)}</a>` : ''}</div>` : ''}
      ${R.heuresBudget && num(a.heuresPrevues) ? `<div class="small">⏱️ ${fmt(a.heuresPrevues, 0)} h prévues sur le chantier</div>` : ''}
      ${jours.length ? `<div class="small">📅 Vous y êtes prévu : ${jours.map(p => esc(NotifPlanning.jourCourt(p.date))).join(', ')}</div>` : ''}
    </div>
    ${securiteCompagnon(u, a)}
    ${R.documents ? `<h2>📎 Documents <span class="muted small">${docs.length}</span></h2>
      ${docs.length ? `<ul class="docs-mobile">${docs.map(d => `<li><a href="${lienDocument(d)}" target="_blank" rel="noopener"><span class="doc-ic">${iconeDoc(d.categorie)}</span>
        <span><strong>${esc(d.nom)}</strong>${[...nouveaux].some(t => t.includes(d.nom)) ? ' <span class="badge b-warn">nouveau</span>' : ''}<br><span class="small muted">${esc(d.categorie)}${d.indice ? ` · indice ${esc(d.indice)}` : ''} · ${dateFr(d.date)} · ${tailleLisible(num(d.taille))}</span></span></a></li>`).join('')}</ul>`
        : '<p class="muted small">Aucun document transmis pour ce chantier.</p>'}` : ''}
    ${m ? `<h2>🔩 Matériel prévu</h2>
      <div class="seg" role="group" aria-label="Affichage du matériel" style="margin-bottom:8px">${[['article', 'Total par article'], ['ouvrage', 'Par ouvrage']].map(([k, l]) => `<button type="button" data-matmode="${k}" class="${ficheCompagnonSel.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${ficheCompagnonSel.mode === 'article' ? `<ul class="mat-liste">${m.total.map((x, i, t) => `${i === 0 || t[i - 1].famille !== x.famille ? `<li class="mat-famille">${esc(x.famille)}</li>` : ''}<li><span>${esc(x.designation)}${x.ref ? ` <span class="muted small">${esc(x.ref)}</span>` : ''}</span>
          <span class="mat-q">${x.avecQte ? qte(x.qte, x.unite) : ''}${R.commandes && x.livre ? `<br><span class="badge ${x.livre === 'livré' ? 'b-ok' : x.livre === 'en partie' ? 'b-warn' : 'b-info'}">${x.livre}</span>` : ''}</span></li>`).join('') || '<li class="muted">Aucune fourniture au devis.</li>'}</ul>`
        : `<div class="mat-ouvrages">${m.ouvrages.map(o => (o.chap ? `<div class="mat-chap niv-${o.niveau}">${esc(o.titre)}</div>`
          : `<div class="mat-ouv"><div><strong>${esc(o.designation)}</strong> ${o.qte !== undefined ? `<span class="muted small">${qte(o.qte, o.unite)}</span>` : ''}</div>
            ${o.fournitures.length ? `<ul>${o.fournitures.map(f => `<li><span>${esc(f.designation)}</span><span class="mat-q">${f.total !== undefined ? qte(f.total, f.unite) : ''}</span></li>`).join('')}</ul>` : ''}</div>`)).join('')}</div>`}
      ${R.heuresBudget && m.heures ? `<p class="small muted">Heures prévues au devis : ${fmt(m.heures, 1)} h</p>` : ''}` : ''}
    ${R.commandes && commandes.length ? `<h2>🚚 Livraisons</h2><ul class="mat-liste">${commandes.map(c => `<li><span><strong>${esc(c.numero || '')}</strong> · ${esc(clientName(c.fournisseurId))}<br><span class="small muted">${(c.lignes || []).length} ligne(s)${c.dateLivraison ? ` · livraison ${dateFr(c.dateLivraison)}` : ''}</span></span><span>${badge(c.statut)}</span></li>`).join('')}</ul>` : ''}
  </div>`;
}
function bindFicheChantierCompagnon(root, id) {
  root.querySelectorAll('[data-matmode]').forEach(b => b.onclick = () => { ficheCompagnonSel.mode = b.dataset.matmode; App.render(); });
  // Documents vus : les notifications du chantier passent en « lues » (le badge « nouveau » reste jusqu'au prochain affichage)
  Notifs.nonLues().filter(n => n.type === 'document' && n.affaireId === id).forEach(n => Notifs.marquerLue(n));
}

/* ---------- Paramètres : ce que voient les compagnons ---------- */
function reglagesCompagnonCarte() {
  const R = reglesCompagnon();
  return `<h2>Appli des compagnons : ce qu'ils voient</h2>
  <div class="card" id="cp-carte">
    <p class="muted small" style="margin-top:0">Le serveur filtre les données avant l'envoi : ce qui est décoché ne part pas sur leur téléphone. Factures, situations, achats, taux horaires et salaires ne leur sont jamais envoyés. Ils voient toujours leur planning, leurs heures, leurs rapports et l'adresse du chantier.</p>
    <div class="cp-options">${Compagnon.OPTIONS.map(([k, l, , aide]) => `<label class="check cp-opt"><input type="checkbox" data-cp="${k}" ${R[k] ? 'checked' : ''}><span>${esc(l)}${aide ? `<br><span class="muted small">${esc(aide)}</span>` : ''}</span></label>`).join('')}</div>
    <div class="toolbar" style="margin:10px 0 0"><button class="secondary small" id="cp-chantier">Réglage « chantier seul, sans prix »</button><button class="secondary small" id="cp-defaut">Réglage par défaut</button></div>
  </div>`;
}
function bindReglagesCompagnon(root) {
  const carte = root.querySelector('#cp-carte');
  if (!carte) return;
  const enregistrer = async regles => { await Store.saveSettings({ ...Store.data.settings, compagnon: regles }); App.toast('Réglages des compagnons enregistrés'); App.render(); };
  carte.querySelectorAll('[data-cp]').forEach(cb => cb.onchange = () => enregistrer({ ...reglesCompagnon(), [cb.dataset.cp]: cb.checked }));
  carte.querySelector('#cp-chantier').onclick = () => enregistrer({ ...Compagnon.DEFAUT, client: false, contactSite: true, materiel: true, quantites: true, commandes: true, documents: true, collegues: true, heuresBudget: false, prix: false });
  carte.querySelector('#cp-defaut').onclick = () => enregistrer({ ...Compagnon.DEFAUT });
}

// Démonstration : l'application DOE (doe.html, construite à côté de la page) dans un cadre, reliée aux chantiers de la démo.
// #/doe/<id> ouvre le dossier du chantier, #/doe/<id>/etude son étude d'exécution (créée au besoin).
Views.doe = params => {
  const a = Store.get('affaires', params[0]);
  if (!window.PIPEFIT_DEMO || !a) return '<p>Application DOE : voir Paramètres → Société (adresse de l\'application DOE).</p>';
  return `<div class="toolbar"><a class="btn secondary" href="#/chantier/${esc(a.id)}">← ${esc(a.code || 'Chantier')}</a><span class="muted small">Application DOE de démonstration : mêmes chantiers et même compte que la démo du CRM. L'avancement de l'étude et les fiches visées remontent sur la fiche du chantier.</span></div>
    <iframe class="doe-cadre" src="doe.html#/${params[1] === 'etude' ? 'etude' : 'chantier'}/${encodeURIComponent(a.id)}" title="Application DOE"></iframe>`;
};
Views.doe.garder = true;
Views.doe.bind = root => {
  const cadre = root.querySelector('.doe-cadre');
  if (!cadre) return;
  if (window.__doeEcoute) window.removeEventListener('message', window.__doeEcoute);
  window.__doeEcoute = e => {
    if (e.source !== cadre.contentWindow || !e.data) return;
    // PDF généré dans le cadre : enregistré par cette page (autorisation de téléchargement de la démo)
    if (e.data.type === 'pipefit-doe-enregistrer' && e.data.data instanceof ArrayBuffer) download(String(e.data.nom).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 150) || 'DOE.pdf', new Uint8Array(e.data.data), 'application/pdf');
    if (e.data.type === 'pipefit-doe-etat') recevoirEtatEtude(String(e.data.affaireId || ''), e.data.resume || null, cadre.contentWindow);
    if (e.data.type === 'pipefit-doe-fiche' && e.data.data instanceof ArrayBuffer) ajouterFicheVisee(e.data);
  };
  window.addEventListener('message', window.__doeEcoute);
};

// Démonstration : l'application Études (etudes.html) dans un cadre ; #/etudes/<id> ouvre les études du chantier,
// #/etudes/<id>/<étude> une étude. Ses devis, notes de calcul et états sont enregistrés ici comme le ferait son serveur.
Views.etudes = (params, query = new URLSearchParams()) => {
  // « _ » : sans chantier (liste des études, nouvelle étude pour un client ou un devis, étude ouverte depuis la liste)
  const a = params[0] === '_' ? null : Store.get('affaires', params[0]);
  if (!window.PIPEFIT_DEMO || (!a && params[0] !== '_')) return '<p>Application Études : voir Paramètres → Société (adresse de l\'application Études).</p>';
  const chemin = a ? (params[1] ? `etude/${encodeURIComponent(params[1])}` : `chantier/${encodeURIComponent(a.id)}`) : `${params.slice(1).map(encodeURIComponent).join('/')}${[...query].length ? `?${query}` : ''}`;
  return `<div class="toolbar">${a ? `<a class="btn secondary" href="#/chantier/${esc(a.id)}">← ${esc(a.code || 'Chantier')}</a>` : '<a class="btn secondary" href="#/etudes-be">← Études</a>'}<span class="muted small">Application Études de démonstration : mêmes chantiers et même compte que la démo du CRM. Ses devis et notes de calcul arrivent dans le CRM, l'état des études aussi (avec ou sans chantier).</span></div>
    <iframe class="doe-cadre" src="etudes.html#/${chemin}" title="Application Études"></iframe>`;
};
Views.etudes.garder = true;
Views.etudes.bind = root => {
  const cadre = root.querySelector('.doe-cadre');
  if (!cadre) return;
  if (window.__etudesEcoute) window.removeEventListener('message', window.__etudesEcoute);
  window.__etudesEcoute = async e => {
    const m = e.data;
    if (e.source !== cadre.contentWindow || !m) return;
    if (m.type === 'pipefit-doe-enregistrer' && m.data instanceof ArrayBuffer) {
      const nom = String(m.nom).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 150) || 'note.pdf', ext = (/\.([a-z0-9]+)$/i.exec(nom) || [])[1] || '';
      return download(nom, new Uint8Array(m.data), { pdf: 'application/pdf', svg: 'image/svg+xml', csv: 'text/csv', zip: 'application/zip' }[ext.toLowerCase()] || 'application/octet-stream');
    }
    if (m.type === 'pipefit-etudes-etat') {
      // Comme le serveur Études : étude avec ou sans chantier enregistrée ; supprimée ou devenue modèle : retirée
      await api(m.supprime ? 'DELETE' : 'PUT', `/api/liens/etudes/${encodeURIComponent(m.id)}`, m.supprime ? {} : { affaireId: m.affaireId || '', resume: m.resume || { objet: '' }, clientId: (m.resume || {}).clientId || '', devisId: (m.resume || {}).devisId || '' }).catch(() => {});
      etudesBE = null;
      [...liensChantier.keys()].forEach(id => liensModifies(id));
      if (m.affaireId) liensModifies(m.affaireId);
      return;
    }
    if (m.type !== 'pipefit-etudes-devis' && m.type !== 'pipefit-etudes-document') return;
    const repondre = (ok, data, error) => cadre.contentWindow.postMessage({ type: 'pipefit-etudes-reponse', rid: m.rid, ok, data, error }, '*');
    try { repondre(true, m.type === 'pipefit-etudes-devis' ? await devisDepuisEtude(m) : await noteDepuisEtude(m)); } catch (er) { repondre(false, null, er.message); }
  };
  window.addEventListener('message', window.__etudesEcoute);
};
// Devis brouillon à partir du métré d'une étude (comme le serveur Études : client, contact, site, TVA du client)
async function devisDepuisEtude(m) {
  // Étude sans chantier : devis pour le client
  const a = Store.get('affaires', String(m.affaireId || '')) || (m.clientId ? { id: '', clientId: String(m.clientId), nom: '' } : null);
  if (!a || !Array.isArray(m.lignes) || !m.lignes.length) throw new Error('Affaire (ou client) et lignes du devis requises');
  if (!Store.can('write', 'devis')) throw new Error('Droits insuffisants pour créer un devis');
  const client = Store.get('entreprises', a.clientId) || {};
  const tva = client.regimeTVA === 'AL' ? { autoliquidation: true } : { autoliquidation: false, tauxTVA: client.regimeTVA ? Number(client.regimeTVA) : '' };
  const d = Store.upsert('devis', { numero: '', objet: String(m.objet || a.nom || 'Chiffrage bureau d\'études').slice(0, 200), clientId: a.clientId || '', contactId: a.contactId || '', siteId: a.siteId || '', chargeId: a.chargeId || '',
    affaireId: a.id, date: isoDate(new Date()), validite: 30, statut: 'Brouillon', zoneId: '', ajustements: [], lignes: m.lignes, numAuto: true, ...tva,
    notes: `Métré établi par le bureau d'études (application Études${m.etudeId ? `, étude ${m.etudeId}` : ''}) : quantités et prix à vérifier.` });
  const r = await Store.attendre('devis', d.id);
  App.toast(`Devis ${(r || d).numero || ''} créé en brouillon depuis l'étude`, 4000);
  return { id: d.id, numero: (r || d).numero || '' };
}
// Note de calcul déposée dans les documents du chantier (nouvel indice si déjà déposée pour cette étude)
async function noteDepuisEtude(m) {
  const a = Store.get('affaires', String(m.affaireId || '')), nom = String(m.nom || '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 150);
  if (!a || !/\.pdf$/i.test(nom) || !(m.data instanceof ArrayBuffer)) throw new Error('Affaire, nom de fichier PDF et contenu requis');
  const f = await envoyerFichierDocument(new File([m.data], nom, { type: 'application/pdf' }));
  const docs = a.documents || (a.documents = []), ex = m.etudeId && docs.find(d => d.categorie === 'Note de calcul' && d.etudeId === m.etudeId), date = isoDate(new Date());
  let doc;
  if (ex) {
    ex.anciens = [...(ex.anciens || []), { fichierId: ex.fichierId, indice: ex.indice || 'A', date: ex.date }];
    Object.assign(ex, { fichierId: f.id, nom, mime: f.mime, taille: f.taille, indice: String(m.indice || ex.indice || 'A'), date, par: Store.me.nom, note: String(m.note || ex.note || '') });
    doc = ex;
  } else {
    doc = { id: uid(), fichierId: f.id, nom, categorie: 'Note de calcul', indice: String(m.indice || 'A'), note: String(m.note || ''), mime: f.mime, taille: f.taille, date, par: Store.me.nom, visible: false, etudeId: String(m.etudeId || '') };
    docs.push(doc);
  }
  Store.upsert('affaires', a);
  App.toast(`Note de calcul déposée dans les documents de ${a.code} (indice ${doc.indice})`, 4000);
  return { ok: true, docId: doc.id, indice: doc.indice };
}

/* ---------- Applications Études et DOE ↔ chantier ---------- */
// État envoyé par les applications à chaque enregistrement (serveur : /api/liens ; démo : cadre ci-dessus), lu à l'affichage
const liensChantier = new Map(); // affaireId -> [{ app, id, resume, maj, par }]
async function chargerLiens(affaireId) {
  if (!Store.me || Store.me.role === 'atelier' || !affaireId) return [];
  try { liensChantier.set(affaireId, await api('GET', `/api/liens?affaireId=${encodeURIComponent(affaireId)}`)); } catch (e) { if (!liensChantier.has(affaireId)) liensChantier.set(affaireId, []); }
  return liensChantier.get(affaireId);
}
const lienDoeDe = affaireId => (liensChantier.get(affaireId) || []).find(l => l.app === 'doe');
// Une application a enregistré : carte du chantier affiché mise à jour
function liensModifies(affaireId) {
  if (!liensChantier.has(affaireId) && !location.hash.includes(affaireId)) return;
  chargerLiens(affaireId).then(() => { const z = document.querySelector(`#liens-apps[data-affaire="${CSS.escape(affaireId)}"]`); if (z) { z.innerHTML = liensAppsHtml(Store.get('affaires', affaireId)); bindLiensApps(z, Store.get('affaires', affaireId)); } });
}

// Démonstration : état envoyé par l'application DOE du cadre, enregistré comme le ferait son serveur ; fiches visées
// demandées au cadre puis ajoutées aux documents du chantier
const fichesDemandees = new Set();
async function recevoirEtatEtude(affaireId, resume, cadre) {
  const a = Store.get('affaires', affaireId);
  if (!a || estHorsDevis(a)) return;
  const avant = (lienDoeDe(affaireId) || (await chargerLiens(affaireId), lienDoeDe(affaireId)) || {}).resume;
  if (resume && avant) {
    const visaAvant = id => ((avant.fiches || []).find(f => f.id === id) || {}).visa;
    const nouvelles = v => resume.fiches.filter(f => f.visa === v && visaAvant(f.id) !== v).length;
    const n = { refus: nouvelles('Refusée'), vise: nouvelles('Visée') + nouvelles('Visée avec observations') };
    if (n.refus) App.toast(`${a.code} : ${n.refus} fiche(s) technique(s) refusée(s) par la maîtrise d'œuvre`, 5000);
    else if (n.vise) App.toast(`${a.code} : ${n.vise} fiche(s) technique(s) visée(s)`, 4000);
  }
  const cle = r => (r ? JSON.stringify({ ...r, maj: '', par: '' }) : '');
  if (cle(avant) !== cle(resume)) {
    const id = (resume && resume.doeId) || ((lienDoeDe(affaireId) || {}).id);
    if (id) await api(resume ? 'PUT' : 'DELETE', `/api/liens/doe/${encodeURIComponent(id)}`, resume ? { affaireId, resume } : {}).catch(() => {});
    liensModifies(affaireId);
  }
  if (!resume) return;
  const { change, aEnvoyer } = LienEtude.appliquer(a.documents || (a.documents = []), resume.fiches);
  if (change) Store.upsert('affaires', a);
  aEnvoyer.filter(f => !fichesDemandees.has(f.id)).forEach(f => { fichesDemandees.add(f.id); cadre.postMessage({ type: 'pipefit-crm-fiche', doeId: resume.doeId, ficheId: f.id }, '*'); });
}
async function ajouterFicheVisee(m) {
  const a = Store.get('affaires', String(m.affaireId || '')), f = a && (((lienDoeDe(a.id) || {}).resume || {}).fiches || []).find(x => x.id === m.ficheId);
  if (!f || (a.documents || []).some(d => d.etudeFicheId === f.id)) return;
  const nom = String(m.nom || 'fiche.pdf').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 150);
  try {
    const r = await envoyerFichierDocument(new File([m.data], nom, { type: m.mime || 'application/pdf' }));
    a.documents = [...(a.documents || []), LienEtude.documentFiche(f, r, nom, Store.me.nom, uid())];
    Store.upsert('affaires', a);
    App.toast(`Fiche visée « ${f.designation || nom} » ajoutée aux documents de ${a.code} et transmise aux compagnons`, 4000);
  } catch (e) { fichesDemandees.delete(f.id); notify(`Fiche « ${nom} » : ${e.message}`); }
}

// Vue d'ensemble du chantier (bureau) : études du bureau d'études et étude d'exécution / DOE, remplies après lecture
function etudeChantierHtml(a) {
  if (estHorsDevis(a) || !Store.me || Store.me.role === 'atelier' || (!lienDOE(a) && !lienEtudes(a))) return '';
  return `<div id="liens-apps" data-affaire="${esc(a.id)}">${liensChantier.has(a.id) ? liensAppsHtml(a) : '<p class="muted small">Études et DOE : lecture…</p>'}</div>`;
}
function bindEtudeChantier(root, a) {
  const z = root.querySelector('#liens-apps');
  if (!z) return;
  bindLiensApps(z, a);
  chargerLiens(a.id).then(() => { const n = document.querySelector(`#liens-apps[data-affaire="${CSS.escape(a.id)}"]`); if (n) { n.innerHTML = liensAppsHtml(a); bindLiensApps(n, a); } });
}
function bindLiensApps(z, a) {
  const ec = z.querySelector('#etude-consultation');
  if (ec) ec.onclick = () => { location.hash = '#/consultations/' + nouvelleConsultation({ affaireId: a.id, objet: `Équipements ${a.code || ''} (étude d'exécution)`, lignes: lignesEtude(a) }).id; };
}
const lienExterne = () => (window.PIPEFIT_DEMO ? '' : 'target="_blank" rel="noopener"');
const quandMaj = l => (l.maj ? `Mis à jour le ${new Date(l.maj).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}${l.par ? ` par ${esc(l.par)}` : ''}` : '');
function liensAppsHtml(a) {
  const liens = liensChantier.get(a.id) || [];
  return `${lienEtudes(a) ? etudesBeHtml(a, liens.filter(l => l.app === 'etudes')) : ''}${lienDOE(a) ? etudeExecutionHtml(a, liens.find(l => l.app === 'doe')) : ''}`;
}
// Études du bureau d'études (application Études) : calculs, contrôles, notes déposées, devis, équipements dimensionnés
function etudesBeHtml(a, liens) {
  const base = lienEtudes(a), nouvelle = base;
  const notesDeposees = (a.documents || []).filter(d => d.categorie === 'Note de calcul');
  return `<h2>Études du bureau d'études <span class="muted small">${liens.length}</span></h2><div class="card etude-card">
    <div class="etude-tete"><span class="muted">Notes de calcul (réseaux, pompes, vannes, vases, bilans, schémas de principe…) faites dans l'application Études pour ce chantier.</span>
      <span class="spacer"></span><a class="btn small" href="${esc(nouvelle)}" ${lienExterne()}>${liens.length ? 'Ouvrir les études' : 'Démarrer une étude'}</a></div>
    ${liens.length ? `<div class="table-wrap"><table><tr><th>Étude</th><th>Indice</th><th>Calculs</th><th>Contrôles</th><th>Rédacteur / vérificateur</th><th>Note de calcul</th><th>Devis</th></tr>
      ${liens.map(l => { const r = l.resume || {}, nd = notesDeposees.find(d => d.etudeId === l.id);
        return `<tr><td><a href="${esc(window.PIPEFIT_DEMO ? `#/etudes/${encodeURIComponent(a.id)}/${encodeURIComponent(l.id)}` : base.replace(/#\/chantier\/.*$/, `#/etude/${encodeURIComponent(l.id)}`))}" ${lienExterne()}><strong>${esc(r.objet || 'Étude')}</strong></a>
          ${(r.equipements || []).length ? `<div class="muted small">${r.equipements.slice(0, 4).map(e => `${fmt(e.qte)} × ${esc(e.designation)}`).join(' · ')}${r.equipements.length > 4 ? ` · +${r.equipements.length - 4}` : ''}</div>` : ''}<div class="muted small">${quandMaj(l)}</div></td>
          <td>${esc(r.indice || '')}</td><td>${(r.notes || []).length}</td>
          <td>${r.erreurs ? `<span class="badge b-bad">${r.erreurs} non-conformité(s)</span>` : r.attention ? `<span class="badge b-warn">${r.attention} point(s) d'attention</span>` : (r.notes || []).length ? '<span class="badge b-ok">Conforme</span>' : ''}</td>
          <td>${esc(r.auteur || '')}${r.verificateur ? ` / ${esc(r.verificateur)}` : ' <span class="muted small">(à vérifier)</span>'}</td>
          <td>${nd ? `<a href="${lienDocument(nd)}" target="_blank" rel="noopener">🧮 indice ${esc(nd.indice || 'A')}</a>` : '<span class="muted small">pas déposée</span>'}</td>
          <td>${(r.devis || []).map(d => Store.get('devis', d.id) ? `<a href="#/devis/${esc(d.id)}">${esc(Store.get('devis', d.id).numero || d.numero || 'brouillon')}</a>` : esc(d.numero || '')).join(', ')}</td></tr>`; }).join('')}</table></div>`
    : '<p class="muted small">Aucune étude pour l\'instant.</p>'}</div>`;
}
// Étude d'exécution et DOE (application DOE)
function etudeExecutionHtml(a, l) {
  const r = l && l.resume, lien = window.PIPEFIT_DEMO ? `#/doe/${encodeURIComponent(a.id)}/etude` : lienDOE(a);
  if (!r) {
    return `<h2>Étude d'exécution et DOE</h2><div class="card etude-card"><p class="muted">Pas encore d'étude : le CCTP du chantier est lu, les équipements à mettre en place sont repérés et numérotés,
      les fiches techniques soumises au visa. À la fin des travaux, l'étude devient le DOE (il ne reste que les attestations, PV et essais).</p>
      <a class="btn" href="${esc(lien)}" ${lienExterne()}>Démarrer l'étude</a></div>`;
  }
  const v = r.visas || {}, nb = k => v[k] || 0, vises = nb('Visée') + nb('Visée avec observations'), fiches = (r.fiches || []).length;
  const refusees = (r.fiches || []).filter(f => f.visa === 'Refusée'), eqs = r.equipements || [];
  const phase = r.statut === 'Remis' ? '<span class="badge b-ok">DOE remis</span>' : r.etude ? '<span class="badge b-info">Étude en cours</span>' : '<span class="badge b-warn">DOE en cours</span>';
  return `<h2>Étude d'exécution et DOE</h2><div class="card etude-card">
    <div class="etude-tete">${phase} <strong>${r.pct}%</strong> complété · ${r.aFaire} point(s) à compléter${r.indice ? ` · indice ${esc(r.indice)}` : ''}
      <span class="spacer"></span><a class="btn small" href="${esc(lien)}" ${lienExterne()}>Ouvrir l'étude</a>
      ${eqs.length && Store.can('write', 'consultations') ? '<button class="small secondary" id="etude-consultation">Consulter les fournisseurs sur ces équipements</button>' : ''}</div>
    ${gauge(r.pct, 100)}
    <div class="etude-lignes">
      <div><span class="label">CCTP</span>${r.cctp ? `${esc(r.cctp.nom)} · ${r.cctp.articles} article(s), ${r.cctp.equipements} équipement(s) prévus${r.cctp.manquants ? ` · <span class="neg">${r.cctp.manquants} pas encore dans l'étude</span>` : ' · tous repris'}` : r.sansCctp ? 'Pas de CCTP pour ce chantier' : '<span class="neg">pas encore chargé</span>'}</div>
      <div><span class="label">Équipements</span>${eqs.length} repéré(s)${eqs.length ? ` : ${eqs.slice(0, 10).map(e => `<span class="etude-rep" title="${esc([e.designation, e.marque, e.reference].filter(Boolean).join(' · '))}">${esc(e.repere || e.designation)}</span>`).join(' ')}${eqs.length > 10 ? ` +${eqs.length - 10}` : ''}` : ''}</div>
      <div><span class="label">Fiches techniques</span>${fiches ? `${vises}/${fiches} visée(s) · ${nb('Soumise')} soumise(s) · ${nb('À soumettre')} à soumettre${refusees.length ? ` · <span class="neg">${refusees.length} refusée(s) : ${refusees.map(f => esc(f.designation)).join(', ')}</span>` : ''}` : 'aucune'}${vises ? ' <span class="muted small">(les fiches visées sont dans les documents du chantier, transmises aux compagnons)</span>' : ''}</div>
      ${(r.manques || []).length ? `<div><span class="label">À compléter</span>${r.manques.slice(0, 4).map(esc).join(' · ')}${r.aFaire > 4 ? ` · <span class="muted">et ${r.aFaire - 4} autre(s)</span>` : ''}</div>` : ''}
    </div>
    <div class="muted small">${quandMaj(l)}</div></div>`;
}
// Lignes de consultation : équipements de l'étude d'exécution pas encore choisis (sans marque ni référence), sinon tous
function lignesEtude(a) {
  const eqs = ((lienDoeDe((a || {}).id) || {}).resume || {}).equipements || [], libres = eqs.filter(e => !e.marque && !e.reference);
  return (libres.length ? libres : eqs).map(e => ({ articleId: '', designation: [e.repere, e.designation].filter(Boolean).join(' — ') + (e.prescrit ? ` (CCTP : ${e.prescrit})` : e.refCctp ? ` (CCTP art. ${e.refCctp})` : ''), unite: 'u', qte: num(e.quantite) || 1 }));
}
