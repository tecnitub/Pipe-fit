// Documents du chantier (plans, fiches techniques, notices, sécurité…) déposés par le bureau et transmis aux compagnons,
// et fiche chantier du compagnon sur son téléphone : documents, matériel prévu (sans prix ni heures, selon les réglages),
// commandes et livraisons attendues.
const CATEGORIES_DOC = [['Plan', '📐'], ['Fiche technique', '📄'], ['Notice', '📘'], ['Sécurité / PPSPS', '⛑️'], ['Photo', '🖼️'], ['Autre', '📁']];
const iconeDoc = c => (CATEGORIES_DOC.find(x => x[0] === c) || CATEGORIES_DOC[CATEGORIES_DOC.length - 1])[1];
const categorieDevinee = nom => (/\.(dwg|dxf|ifc)$|plan|iso(m[ée]trique)?\b|p&?id|implantation|coupe|synoptique/i.test(nom) ? 'Plan'
  : /fiche|\bft\b|datasheet|technique|catalogue/i.test(nom) ? 'Fiche technique' : /notice|manuel|mode d.emploi/i.test(nom) ? 'Notice'
    : /ppsps|s[ée]curit|pr[ée]vention|amiante|permis/i.test(nom) ? 'Sécurité / PPSPS' : /\.(jpe?g|png|webp)$/i.test(nom) ? 'Photo' : 'Autre');
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
    ${estHorsDevis(a) ? '' : `<a href="#/situations">Situations</a>`}</div>`;
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
  ${edit ? `<label class="doc-depot" id="doc-depot"><input type="file" id="doc-fichiers" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.dwg,.dxf,.ifc,.xlsx,.docx,.zip,.txt">
    <strong>📤 Déposer des documents</strong><span class="small muted">Glissez les fichiers ici ou cliquez · PDF, images, DWG/DXF, IFC, Excel, Word, ZIP · 40 Mo maximum par fichier</span>
    <span class="small"><input type="checkbox" id="doc-transmettre" checked onclick="event.stopPropagation()"> Transmettre aux compagnons</span></label>
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
    }).join('') : '<p class="muted">Aucun chantier prévu pour vous en ce moment.</p>'}</div>`;
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
  const docs = documentsVisibles(a).sort((x, y) => CATEGORIES_DOC.findIndex(c => c[0] === x.categorie) - CATEGORIES_DOC.findIndex(c => c[0] === y.categorie));
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
