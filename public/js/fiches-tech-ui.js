// Bibliothèque → Fiches techniques : toutes les fiches des fabricants (dossier du serveur, dépôts, catalogues fournisseurs),
// rangées par fabricant et références ; dépôt en masse avec lecture du PDF, import d'un catalogue (liens des fiches),
// versions (la plus récente en vigueur, les anciennes « remplacées »). Utilisées par les études (matériel retenu, dossier
// de validation), le DOE (annexe B) et l'appli des compagnons.
const filtreFiches = { q: '', fab: '', etat: '' };
let etatFiches = null;
const SOURCES_FICHE = { dossier: 'Dossier du serveur', depot: 'Déposée', catalogue: 'Catalogue' };
const lienFiche = f => (f && f.fichierId ? fileUrl(f.fichierId) : '');
async function chargerEtatFiches() { try { etatFiches = await api('GET', '/api/fiches/etat'); } catch (e) { etatFiches = { erreur: e.message }; } }

Views.fichesTech = () => {
  const toutes = Store.all('fichesTech'), f = filtreFiches, q = FichesTech.cle(f.q), qd = String(f.q || '').toLowerCase();
  const fabs = [...new Set(toutes.map(x => x.fabricant).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const liste = toutes.filter(x => (!f.fab || x.fabricant === f.fab) && (f.etat === 'remplacees' ? x.remplaceePar : f.etat === 'absentes' ? x.absente : f.etat === 'verifier' ? x.aVerifier && !x.absente : !x.remplaceePar && !x.absente)
    && (!f.q || (x.references || []).some(r => FichesTech.cle(r).includes(q)) || `${x.fabricant} ${x.designation} ${x.nom}`.toLowerCase().includes(qd)))
    .sort((a, b) => String(a.fabricant || '').localeCompare(String(b.fabricant || '')) || String((a.references || [])[0] || '').localeCompare(String((b.references || [])[0] || '')));
  const e = etatFiches || {}, c = e.config || {}, cat = e.catalogue, n = k => toutes.filter(k).length;
  const peut = Store.can('write', 'fichesTech');
  return `<h1>Bibliothèque</h1>${biblioTabs('fiches')}
  <p class="muted">Les fiches techniques des fabricants, rangées par fabricant et par référence. Le matériel retenu des études, le dossier de validation envoyé au client, le DOE et l'appli des compagnons retrouvent seuls la fiche d'un matériel d'après son fabricant et sa référence exacte, dans la version en vigueur à la date de pose.</p>
  <div class="card"><h3 style="margin-top:0">📁 Dossier des fiches sur le serveur</h3>
    ${e.erreur && !c.chemin ? `<p class="muted small">${esc(e.erreur)}</p>` : `<p class="small">Rangez les PDF dans <code>${esc(c.chemin || '…')}</code>, <strong>un sous-dossier par fabricant</strong> (« Aldes », « France Air »…) : ils sont lus ${c.actif === false ? '<span class="neg">— lecture désactivée</span>' : `toutes les ${esc(String(c.intervalle || 30))} minutes`} (références lues dans le nom du fichier et dans le texte du PDF). Une fiche retirée du dossier reste dans la bibliothèque, marquée « absente ».</p>
    <p class="small muted">${e.dernier ? `Dernière lecture le ${dateFr(e.dernier.slice(0, 10))} à ${e.dernier.slice(11, 16)} : ${e.ajoutees || 0} ajoutée(s), ${e.modifiees || 0} modifiée(s), ${e.absentes || 0} retirée(s)` : 'Pas encore lu'}${e.erreur ? ` · <span class="neg">${esc(e.erreur)}</span>` : ''}${(e.erreurs || []).length ? ` · <span class="warn-text">${e.erreurs.length} fichier(s) illisible(s)</span>` : ''}</p>
    <div class="toolbar" style="margin:0">${peut ? '<button class="secondary small" id="ft-synchro">↻ Lire le dossier maintenant</button>' : ''}${Store.can('admin') && !c.impose ? '<button class="secondary small" id="ft-config">Changer le dossier…</button>' : ''}</div>`}
    ${cat ? `<p class="small">📚 Catalogue : ${cat.enCours ? `téléchargement en cours ${cat.faits}/${cat.total}…` : `${cat.telechargees} fiche(s) téléchargée(s), ${cat.deja} déjà présente(s)`}${(cat.erreurs || []).length ? ` · <span class="neg">${cat.erreurs.length} lien(s) cassé(s)</span>` : ''}</p>
      ${(cat.erreurs || []).length && !cat.enCours ? `<details><summary class="small">Liens cassés à faire corriger par le fournisseur</summary><ul class="small">${cat.erreurs.slice(0, 100).map(x => `<li>${esc([x.fabricant, x.reference].filter(Boolean).join(' '))} — <a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.url.slice(0, 80))}</a> : ${esc(x.erreur)}</li>`).join('')}</ul></details>` : ''}` : ''}
  </div>
  <div class="toolbar">
    <input id="ft-q" type="search" value="${esc(f.q)}" placeholder="Référence, fabricant, désignation…" style="width:auto;flex:1 1 220px;max-width:320px">
    <select id="ft-fab" style="width:auto" aria-label="Fabricant"><option value="">Tous les fabricants (${fabs.length})</option>${fabs.map(x => `<option ${x === f.fab ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
    <select id="ft-etat" style="width:auto" aria-label="État"><option value="">En vigueur (${n(x => !x.remplaceePar && !x.absente)})</option><option value="verifier" ${f.etat === 'verifier' ? 'selected' : ''}>À vérifier (${n(x => x.aVerifier && !x.absente)})</option>
      <option value="remplacees" ${f.etat === 'remplacees' ? 'selected' : ''}>Versions remplacées (${n(x => x.remplaceePar)})</option><option value="absentes" ${f.etat === 'absentes' ? 'selected' : ''}>Absentes du dossier (${n(x => x.absente)})</option></select>
    <span class="spacer"></span>
    ${peut ? `<label class="btn">📤 Déposer des fiches (PDF)<input type="file" id="ft-depot" accept=".pdf,application/pdf" multiple hidden></label>
    <label class="btn secondary" title="Excel ou CSV avec les colonnes Fabricant, Référence, Désignation et Fiche (lien du PDF)">📚 Catalogue fournisseur (liens des fiches)<input type="file" id="ft-cat" accept=".xlsx,.csv" hidden></label>` : ''}</div>
  ${liste.length ? `<div class="table-wrap"><table><tr><th>Fabricant</th><th>Références</th><th>Désignation</th><th>Version</th><th>Origine</th><th></th></tr>
    ${liste.slice(0, 500).map(x => `<tr class="clickable" data-ft="${esc(x.id)}"><td><strong>${esc(x.fabricant || '—')}</strong></td><td>${(x.references || []).slice(0, 6).map(r => `<span class="badge">${esc(r)}</span>`).join(' ')}${(x.references || []).length > 6 ? ` <span class="muted small">+${x.references.length - 6}</span>` : ''}</td>
      <td class="small">${esc(x.designation || x.nom || '')}${x.famille ? ` <span class="muted">· ${esc(x.famille)}</span>` : ''}</td>
      <td class="small nowrap">${x.date ? dateFr(x.date) : '<span class="muted">non datée</span>'}${x.remplaceePar ? '<br><span class="badge b-warn">remplacée</span>' : ''}${x.absente ? '<br><span class="badge b-bad">absente du dossier</span>' : ''}${x.aVerifier && !x.absente ? '<br><span class="badge b-info">à vérifier</span>' : ''}</td>
      <td class="small muted">${esc(SOURCES_FICHE[x.source] || x.source || '')}${x.chemin ? `<br><span title="${esc(x.chemin)}">${esc(x.chemin.slice(0, 40))}</span>` : ''}</td>
      <td data-nocl>${x.fichierId ? `<a href="${lienFiche(x)}" target="_blank" rel="noopener">📄 PDF</a>` : ''}</td></tr>`).join('')}</table></div>${liste.length > 500 ? `<p class="muted small">500 premières fiches sur ${liste.length} : affinez la recherche.</p>` : ''}`
    : `<p class="muted">${toutes.length ? 'Aucune fiche pour cette recherche.' : 'Aucune fiche pour l\'instant : rangez les PDF dans le dossier du serveur, déposez-les ici ou importez un catalogue fournisseur.'}</p>`}`;
};
Views.fichesTech.bind = root => {
  if (!etatFiches) chargerEtatFiches().then(() => { if (location.hash.startsWith('#/fichesTech')) App.render(); });
  const re = () => App.render();
  const q = root.querySelector('#ft-q');
  let tempo = null;
  if (q) q.oninput = () => { clearTimeout(tempo); tempo = setTimeout(() => { filtreFiches.q = q.value; re(); const n = document.querySelector('#ft-q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 300); };
  root.querySelector('#ft-fab').onchange = e => { filtreFiches.fab = e.target.value; re(); };
  root.querySelector('#ft-etat').onchange = e => { filtreFiches.etat = e.target.value; re(); };
  root.querySelectorAll('[data-ft]').forEach(tr => tr.onclick = ev => { if (!ev.target.closest('[data-nocl]')) editerFiche(tr.dataset.ft); });
  const sy = root.querySelector('#ft-synchro');
  if (sy) sy.onclick = async () => { sy.disabled = true; sy.textContent = 'Lecture…'; try { etatFiches = await api('POST', '/api/fiches/synchro'); await Store.load().catch(() => {}); App.toast(`${etatFiches.ajoutees} fiche(s) ajoutée(s), ${etatFiches.modifiees} modifiée(s)`); } catch (e) { notify(e.message); } re(); };
  const cf = root.querySelector('#ft-config');
  if (cf) cf.onclick = () => configFiches();
  const dp = root.querySelector('#ft-depot');
  if (dp) dp.onchange = () => { deposerFiches([...dp.files]); dp.value = ''; };
  const ct = root.querySelector('#ft-cat');
  if (ct) ct.onchange = () => { importerCatalogueFiches(ct.files[0]); ct.value = ''; };
};

function configFiches() {
  const c = (etatFiches || {}).config || {};
  const box = Modal.open(`<h2 style="margin-top:0">Dossier des fiches techniques</h2>
    <p class="small muted">Chemin complet sur le serveur (dossier partagé du réseau compris). Un sous-dossier par fabricant ; les fiches déposées dans l'appli y sont aussi écrites.</p>
    <div class="field"><label for="fc-ch">Dossier</label><input id="fc-ch" value="${esc(c.chemin || '')}" placeholder="\\\\serveur\\Fiches techniques"></div>
    <div class="grid2"><label class="check"><input type="checkbox" id="fc-actif" ${c.actif !== false ? 'checked' : ''}> Lire le dossier régulièrement</label>
      <div class="field"><label for="fc-int">Toutes les (minutes)</label><input id="fc-int" type="number" min="5" value="${esc(String(c.intervalle || 30))}" style="width:100px"></div></div>
    <div class="modal-actions"><button class="secondary" id="fc-x">Annuler</button><button id="fc-ok">Enregistrer</button></div>`);
  box.querySelector('#fc-x').onclick = Modal.close;
  box.querySelector('#fc-ok').onclick = async () => {
    try { etatFiches = await api('PUT', '/api/fiches/config', { chemin: box.querySelector('#fc-ch').value.trim(), actif: box.querySelector('#fc-actif').checked, intervalle: +box.querySelector('#fc-int').value }); Modal.close(); App.render(); App.toast('Dossier enregistré : lecture en cours.'); }
    catch (e) { notify(e.message); }
  };
}

function editerFiche(id) {
  const x = JSON.parse(JSON.stringify(Store.get('fichesTech', id))), peut = Store.can('write', 'fichesTech');
  const box = Modal.open(`<h2 style="margin-top:0">📄 ${esc(x.designation || x.nom || 'Fiche technique')}</h2>
    <p class="small muted">${esc(SOURCES_FICHE[x.source] || '')}${x.chemin ? ` · ${esc(x.chemin)}` : ''}${x.url ? ` · <a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">lien du fournisseur</a>` : ''}${x.fichierId ? ` · <a href="${lienFiche(x)}" target="_blank" rel="noopener">ouvrir le PDF</a>` : ''}</p>
    <div class="grid2"><div class="field"><label for="fe-fab">Fabricant</label><input id="fe-fab" value="${esc(x.fabricant || '')}" list="fe-fabs"></div>
      <div class="field"><label for="fe-date">Version du</label><input id="fe-date" type="date" value="${esc(x.date || '')}"></div></div>
    <datalist id="fe-fabs">${[...new Set(Store.all('fichesTech').map(f => f.fabricant).filter(Boolean))].map(f => `<option value="${esc(f)}">`).join('')}</datalist>
    <div class="field"><label for="fe-refs">Références couvertes (une par ligne ; une référence de gamme, ex. « DFC », sert à toutes les tailles)</label><textarea id="fe-refs" rows="4">${esc((x.references || []).join('\n'))}</textarea></div>
    <div class="field"><label for="fe-des">Désignation</label><input id="fe-des" value="${esc(x.designation || '')}"></div>
    ${x.remplaceePar ? `<p class="small warn-text">Remplacée par une version plus récente${(() => { const r = Store.get('fichesTech', x.remplaceePar); return r ? ` (${r.date ? dateFr(r.date) : 'non datée'})` : ''; })()} : gardée pour le matériel posé avant.</p>` : ''}
    <div class="modal-actions">${peut ? '<button class="danger" id="fe-suppr">Retirer de la bibliothèque</button>' : ''}<span style="flex:1"></span><button class="secondary" id="fe-x">Fermer</button>${peut ? '<button id="fe-ok">Enregistrer (vérifiée)</button>' : ''}</div>`);
  box.querySelector('#fe-x').onclick = Modal.close;
  if (!peut) return;
  box.querySelector('#fe-ok').onclick = () => {
    Object.assign(x, { fabricant: box.querySelector('#fe-fab').value.trim(), date: box.querySelector('#fe-date').value, designation: box.querySelector('#fe-des').value.trim(),
      references: box.querySelector('#fe-refs').value.split(/[\n;,]/).map(r => r.trim()).filter(Boolean), verifiee: true, aVerifier: false });
    Store.upsert('fichesTech', x); Modal.close(); App.render();
  };
  box.querySelector('#fe-suppr').onclick = async () => { if (!(await ask('Retirer cette fiche de la bibliothèque ? (le fichier du dossier du serveur n\'est pas effacé et serait relu : retirez-le aussi du dossier)', 'Retirer'))) return; Store.remove('fichesTech', id); Modal.close(); App.render(); };
}

// Dépôt en masse : chaque PDF est envoyé et lu (fabricant, références, date) ; on valide le tableau
async function deposerFiches(files) {
  if (!files.length) return;
  const box = Modal.open(`<h2 style="margin-top:0">Déposer ${files.length} fiche(s)</h2><p id="fd-etat" class="small">Lecture…</p>`, true);
  const lus = [];
  for (const [i, file] of files.entries()) {
    box.querySelector('#fd-etat').textContent = `Lecture de ${file.name} (${i + 1}/${files.length})…`;
    try {
      if (!/\.pdf$/i.test(file.name)) throw new Error('pas un PDF');
      const up = await envoyerFichierDocument(file), a = await api('POST', '/api/fiches/analyser', { fichierId: up.id, nom: file.name });
      lus.push({ ok: true, nom: file.name, fichierId: up.id, ...a, references: a.references.join('\n') });
    } catch (e) { lus.push({ ok: false, nom: file.name, erreur: e.message }); }
  }
  const fabs = [...new Set(Store.all('fichesTech').map(f => f.fabricant).filter(Boolean))];
  box.innerHTML = `<h2 style="margin-top:0">Déposer ${files.length} fiche(s)</h2>
    <p class="small muted">Vérifiez le fabricant et les références lus dans chaque PDF (première référence = référence principale, qui sert à suivre les versions). Les fiches sont rangées dans le dossier du fabricant sur le serveur.</p>
    <datalist id="fd-fabs">${fabs.map(f => `<option value="${esc(f)}">`).join('')}</datalist>
    <div class="table-wrap"><table><tr><th></th><th>Fichier</th><th>Fabricant</th><th>Références (une par ligne)</th><th>Désignation</th><th>Version du</th></tr>
    ${lus.map((l, i) => l.ok ? `<tr><td><input type="checkbox" data-fd="${i}" checked aria-label="Ajouter"></td><td class="small">${esc(l.nom)}${l.existe ? `<br><span class="badge b-warn">déjà dans la bibliothèque (version ${l.existe.date ? `du ${dateFr(l.existe.date)}` : 'non datée'}) : ajoutée comme nouvelle version</span>` : ''}</td>
      <td><input data-fk="fabricant" data-i="${i}" value="${esc(l.fabricant)}" list="fd-fabs" style="min-width:120px"></td><td><textarea data-fk="references" data-i="${i}" rows="2" style="min-width:150px">${esc(l.references)}</textarea></td>
      <td><input data-fk="designation" data-i="${i}" value="${esc(l.designation)}" style="min-width:200px"></td><td><input type="date" data-fk="date" data-i="${i}" value="${esc(l.date)}"></td></tr>`
      : `<tr><td></td><td class="small">${esc(l.nom)}</td><td colspan="4" class="neg small">${esc(l.erreur)}</td></tr>`).join('')}</table></div>
    <div class="modal-actions"><button class="secondary" id="fd-x">Annuler</button><button id="fd-ok">Ajouter à la bibliothèque</button></div>`;
  box.querySelectorAll('[data-fk]').forEach(el => el.onchange = () => { lus[+el.dataset.i][el.dataset.fk] = el.value; });
  box.querySelector('#fd-x').onclick = Modal.close;
  box.querySelector('#fd-ok').onclick = async () => {
    const choix = lus.filter((l, i) => l.ok && (box.querySelector(`[data-fd="${i}"]`) || {}).checked);
    if (choix.some(l => !l.fabricant.trim() || !l.references.trim())) return notify('Indiquez le fabricant et au moins une référence pour chaque fiche.');
    try {
      const out = await api('POST', '/api/fiches/depot', { fiches: choix.map(l => ({ fichierId: l.fichierId, nom: l.nom, fabricant: l.fabricant.trim(), references: l.references, designation: l.designation, famille: l.famille, date: l.date })) });
      Modal.close(); await Store.load().catch(() => {}); await chargerEtatFiches(); App.render(); App.toast(`${out.length} fiche(s) ajoutée(s) à la bibliothèque.`);
    } catch (e) { notify(e.message); }
  };
}

// Catalogue fournisseur : les PDF des liens sont téléchargés par le serveur et gardés ; liens cassés signalés
async function importerCatalogueFiches(file) {
  if (!file) return;
  try {
    const buf = await file.arrayBuffer(), feuilles = /\.csv$/i.test(file.name) ? XLSX.readCSV(buf) : await XLSX.read(buf);
    const lus = feuilles.map(s => FichesTech.lireCatalogue(s.rows || [])), lignes = lus.flatMap(l => l.lignes);
    if (!lignes.length) return notify((lus.find(l => l.erreur) || {}).erreur || 'Aucun lien de fiche (http…) dans ce fichier.');
    const urls = new Set(lignes.map(l => l.url)).size;
    if (!(await ask(`${lignes.length} référence(s), ${urls} fiche(s) à télécharger depuis les liens du catalogue. Le serveur les télécharge et les garde (le DOE ne dépendra plus des liens). Continuer ?`, 'Télécharger', false))) return;
    const c = await api('POST', '/api/fiches/catalogue', { lignes });
    etatFiches = { ...(etatFiches || {}), catalogue: c }; App.render();
    const suivre = async () => { await chargerEtatFiches(); if (location.hash.startsWith('#/fichesTech')) App.render(); if (etatFiches.catalogue && etatFiches.catalogue.enCours) setTimeout(suivre, 2000); else { await Store.load().catch(() => {}); App.render(); App.toast('Catalogue : téléchargement terminé.'); } };
    setTimeout(suivre, 1500);
  } catch (e) { notify(e.message); }
}
