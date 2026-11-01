// Bibliothèque → Fiches techniques : toutes les fiches des fabricants (dossier du serveur, dépôts, catalogues fournisseurs),
// rangées par fabricant et références ; dépôt en masse avec lecture du PDF, import d'un catalogue (liens des fiches),
// versions (la plus récente en vigueur, les anciennes « remplacées »). Utilisées par les études (matériel retenu, dossier
// de validation), le DOE (annexe B) et l'appli des compagnons.
const filtreFiches = { q: '', fab: '', etat: '', type: '', texte: '' };
let etatFiches = null, santeFiches = null, resultatsTexte = null, demandesFiches = null;
const SOURCES_FICHE = { dossier: 'Dossier du serveur', depot: 'Déposée', catalogue: 'Catalogue', mail: 'Reçue par e-mail' };
const ICONE_DOC = { fiche: '📄', notice: '📘', dop: '🏷️', garantie: '🛡️' };
async function chargerSanteFiches() { try { [santeFiches, demandesFiches] = await Promise.all([api('GET', '/api/fiches/sante'), api('GET', '/api/fiches/demandes')]); } catch (e) { santeFiches = { erreur: e.message }; } }
// Texte d'un PDF scanné lu dans le navigateur (reconnaissance de caractères, 3 premières pages)
async function texteOcrFiche(file, progression = () => {}) {
  const r = await PdfLecture.lire(file, progression, { pagesMax: 3, ocr: true });
  return (r.lignes || []).join('\n');
}
const lienFiche = f => (f && f.fichierId ? fileUrl(f.fichierId) : '');
async function chargerEtatFiches() { try { etatFiches = await api('GET', '/api/fiches/etat'); } catch (e) { etatFiches = { erreur: e.message }; } }

Views.fichesTech = () => {
  const toutes = Store.all('fichesTech'), f = filtreFiches, q = FichesTech.cle(f.q), qd = String(f.q || '').toLowerCase();
  const fabs = [...new Set(toutes.map(x => x.fabricant).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const liste = toutes.filter(x => (!f.fab || x.fabricant === f.fab) && (!f.type || (x.type || 'fiche') === f.type) && (f.etat === 'remplacees' ? x.remplaceePar : f.etat === 'absentes' ? x.absente : f.etat === 'verifier' ? x.aVerifier && !x.absente : !x.remplaceePar && !x.absente)
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
  ${santeHtml(peut)}
  <div class="card"><h3 style="margin-top:0">🔎 Rechercher dans le texte des documents</h3>
    <div class="toolbar" style="margin:0"><input id="ft-texte" type="search" value="${esc(f.texte)}" placeholder="ex. ePM1, 400 Pa, R32, IP54, une référence…" style="width:auto;flex:1 1 260px;max-width:420px"><button class="secondary small" id="ft-texte-ok">Rechercher</button></div>
    ${resultatsTexte ? (resultatsTexte.length ? `<ul class="small" style="margin:8px 0 0">${resultatsTexte.map(r => `<li>${ICONE_DOC[r.type] || '📄'} <a href="${lienFiche(r)}#page=${r.page}" target="_blank" rel="noopener"><strong>${esc(r.fabricant || '')} ${esc((r.references || []).slice(0, 3).join(', '))}</strong> — page ${r.page}</a>${r.remplacee ? ' <span class="badge b-warn">remplacée</span>' : ''} <span class="muted">${esc(r.date ? dateFr(r.date) : '')}</span><br><span class="muted">… ${esc(r.extrait)} …</span></li>`).join('')}</ul>` : '<p class="small muted">Aucun document ne contient ces mots.</p>') : ''}</div>
  <div class="toolbar">
    <input id="ft-q" type="search" value="${esc(f.q)}" placeholder="Référence, fabricant, désignation…" style="width:auto;flex:1 1 220px;max-width:320px">
    <select id="ft-fab" style="width:auto" aria-label="Fabricant"><option value="">Tous les fabricants (${fabs.length})</option>${fabs.map(x => `<option ${x === f.fab ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
    <select id="ft-type" style="width:auto" aria-label="Type de document"><option value="">Tous les documents</option>${Object.entries(FichesTech.TYPES_DOC).map(([k, l]) => `<option value="${k}" ${k === f.type ? 'selected' : ''}>${ICONE_DOC[k]} ${esc(l)} (${n(x => (x.type || 'fiche') === k && !x.remplaceePar && !x.absente)})</option>`).join('')}</select>
    <select id="ft-etat" style="width:auto" aria-label="État"><option value="">En vigueur (${n(x => !x.remplaceePar && !x.absente)})</option><option value="verifier" ${f.etat === 'verifier' ? 'selected' : ''}>À vérifier (${n(x => x.aVerifier && !x.absente)})</option>
      <option value="remplacees" ${f.etat === 'remplacees' ? 'selected' : ''}>Versions remplacées (${n(x => x.remplaceePar)})</option><option value="absentes" ${f.etat === 'absentes' ? 'selected' : ''}>Absentes du dossier (${n(x => x.absente)})</option></select>
    <span class="spacer"></span>
    ${peut ? `<label class="btn">📤 Déposer des fiches (PDF)<input type="file" id="ft-depot" accept=".pdf,application/pdf" multiple hidden></label>
    <label class="btn secondary" title="Excel ou CSV avec les colonnes Fabricant, Référence, Désignation et Fiche (lien du PDF)">📚 Catalogue fournisseur (liens des fiches)<input type="file" id="ft-cat" accept=".xlsx,.csv" hidden></label>` : ''}</div>
  ${liste.length ? `<div class="table-wrap"><table><tr><th>Fabricant</th><th>Références</th><th>Désignation</th><th>Version</th><th>Origine</th><th></th></tr>
    ${liste.slice(0, 500).map(x => `<tr class="clickable" data-ft="${esc(x.id)}"><td><strong>${esc(x.fabricant || '—')}</strong></td><td>${(x.references || []).slice(0, 6).map(r => `<span class="badge">${esc(r)}</span>`).join(' ')}${(x.references || []).length > 6 ? ` <span class="muted small">+${x.references.length - 6}</span>` : ''}</td>
      <td class="small">${ICONE_DOC[x.type || 'fiche']} ${esc(x.designation || x.nom || '')}${x.famille ? ` <span class="muted">· ${esc(x.famille)}</span>` : ''}${(x.type || 'fiche') !== 'fiche' ? ` <span class="badge">${esc(FichesTech.TYPES_DOC[x.type])}</span>` : ''}${x.scan && !x.ocr ? ' <span class="badge b-warn">scan</span>' : ''}${x.source === 'mail' && x.aVerifier ? ' <span class="badge b-info">reçue par e-mail</span>' : ''}
        ${x.carac ? `<br><span class="muted">${esc(InventaireCVC.caracTexte(x.carac).slice(0, 140))}</span>` : ''}</td>
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
  root.querySelector('#ft-type').onchange = e => { filtreFiches.type = e.target.value; re(); };
  // Recherche dans le texte des PDF (serveur)
  const tx = root.querySelector('#ft-texte'), lancer = async () => { filtreFiches.texte = tx.value.trim(); try { resultatsTexte = filtreFiches.texte ? await api('GET', `/api/fiches/recherche?q=${encodeURIComponent(filtreFiches.texte)}`) : null; } catch (e) { notify(e.message); } re(); };
  root.querySelector('#ft-texte-ok').onclick = lancer;
  tx.onkeydown = e => { if (e.key === 'Enter') lancer(); };
  if (!santeFiches && Store.can('write', 'fichesTech')) chargerSanteFiches().then(() => { if (location.hash.startsWith('#/fichesTech')) App.render(); });
  bindSante(root);
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
    <div class="grid2"><div class="field"><label for="fe-des">Désignation</label><input id="fe-des" value="${esc(x.designation || '')}"></div>
      <div class="field"><label for="fe-type">Type de document</label><select id="fe-type">${Object.entries(FichesTech.TYPES_DOC).map(([k, l]) => `<option value="${k}" ${k === (x.type || 'fiche') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>
    ${x.carac ? `<p class="small"><strong>Caractéristiques lues :</strong> ${esc(InventaireCVC.caracTexte(x.carac))}${x.caracParRef ? ` <span class="muted">(et par référence : ${Object.keys(x.caracParRef).length})</span>` : ''}</p>` : ''}
    ${x.scan && !x.ocr ? '<p class="small warn-text">PDF scanné (sans texte) : <button class="small secondary" id="fe-ocr">Lire par reconnaissance de caractères</button></p>' : ''}
    ${x.remplaceePar ? `<p class="small warn-text">Remplacée par une version plus récente${(() => { const r = Store.get('fichesTech', x.remplaceePar); return r ? ` (${r.date ? dateFr(r.date) : 'non datée'})` : ''; })()} : gardée pour le matériel posé avant.</p>` : ''}
    <div class="modal-actions">${peut ? '<button class="danger" id="fe-suppr">Retirer de la bibliothèque</button>' : ''}<span style="flex:1"></span><button class="secondary" id="fe-x">Fermer</button>${peut ? '<button id="fe-ok">Enregistrer (vérifiée)</button>' : ''}</div>`);
  box.querySelector('#fe-x').onclick = Modal.close;
  if (!peut) return;
  box.querySelector('#fe-ok').onclick = () => {
    Object.assign(x, { fabricant: box.querySelector('#fe-fab').value.trim(), date: box.querySelector('#fe-date').value, designation: box.querySelector('#fe-des').value.trim(),
      references: box.querySelector('#fe-refs').value.split(/[\n;,]/).map(r => r.trim()).filter(Boolean), type: box.querySelector('#fe-type').value, verifiee: true, aVerifier: false });
    Store.upsert('fichesTech', x); Modal.close(); App.render();
  };
  const oc = box.querySelector('#fe-ocr');
  if (oc) oc.onclick = async () => { oc.disabled = true; oc.textContent = 'Lecture…'; try { await ocrFicheExistante(x); Modal.close(); App.render(); } catch (e) { notify(e.message); oc.disabled = false; } };
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
      const up = await envoyerFichierDocument(file);
      let a = await api('POST', '/api/fiches/analyser', { fichierId: up.id, nom: file.name }), texteOcr = '';
      // PDF scanné : lu par reconnaissance de caractères dans le navigateur, puis relu
      if (a.scan) {
        box.querySelector('#fd-etat').textContent = `${file.name} est scanné : reconnaissance des caractères (${i + 1}/${files.length})…`;
        try { texteOcr = await texteOcrFiche(file, x => { if (typeof x === 'number') box.querySelector('#fd-etat').textContent = `${file.name} : reconnaissance des caractères ${Math.round(x * 100)} %`; }); if (texteOcr.trim()) a = await api('POST', '/api/fiches/analyser', { fichierId: up.id, nom: file.name, texte: texteOcr }); } catch (e) { /* OCR indisponible : saisie à la main */ }
      }
      lus.push({ ok: true, nom: file.name, fichierId: up.id, ...a, texteOcr, references: a.references.join('\n') });
    } catch (e) { lus.push({ ok: false, nom: file.name, erreur: e.message }); }
  }
  const fabs = [...new Set(Store.all('fichesTech').map(f => f.fabricant).filter(Boolean))];
  box.innerHTML = `<h2 style="margin-top:0">Déposer ${files.length} fiche(s)</h2>
    <p class="small muted">Vérifiez le fabricant et les références lus dans chaque PDF (première référence = référence principale, qui sert à suivre les versions). Les fiches sont rangées dans le dossier du fabricant sur le serveur.</p>
    <datalist id="fd-fabs">${fabs.map(f => `<option value="${esc(f)}">`).join('')}</datalist>
    <div class="table-wrap"><table><tr><th></th><th>Fichier</th><th>Type</th><th>Fabricant</th><th>Références (une par ligne)</th><th>Désignation</th><th>Version du</th></tr>
    ${lus.map((l, i) => l.ok ? `<tr><td><input type="checkbox" data-fd="${i}" ${l.memeFichier ? '' : 'checked'} aria-label="Ajouter"></td><td class="small">${esc(l.nom)}${l.memeFichier ? '<br><span class="badge b-bad">même fichier déjà dans la bibliothèque : décoché</span>' : l.existe ? `<br><span class="badge b-warn">déjà dans la bibliothèque (version ${l.existe.date ? `du ${dateFr(l.existe.date)}` : 'non datée'}) : ajoutée comme nouvelle version</span>` : ''}${l.ocr ? '<br><span class="badge b-info">scan lu par reconnaissance de caractères</span>' : l.scan ? '<br><span class="badge b-warn">scan illisible : saisir références et date</span>' : ''}</td>
      <td><select data-fk="type" data-i="${i}">${Object.entries(FichesTech.TYPES_DOC).map(([k, t]) => `<option value="${k}" ${k === (l.type || 'fiche') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></td>
      <td><input data-fk="fabricant" data-i="${i}" value="${esc(l.fabricant)}" list="fd-fabs" style="min-width:120px"></td><td><textarea data-fk="references" data-i="${i}" rows="2" style="min-width:150px">${esc(l.references)}</textarea></td>
      <td><input data-fk="designation" data-i="${i}" value="${esc(l.designation)}" style="min-width:200px"></td><td><input type="date" data-fk="date" data-i="${i}" value="${esc(l.date)}"></td></tr>`
      : `<tr><td></td><td class="small">${esc(l.nom)}</td><td colspan="5" class="neg small">${esc(l.erreur)}</td></tr>`).join('')}</table></div>
    <div class="modal-actions"><button class="secondary" id="fd-x">Annuler</button><button id="fd-ok">Ajouter à la bibliothèque</button></div>`;
  box.querySelectorAll('[data-fk]').forEach(el => el.onchange = () => { lus[+el.dataset.i][el.dataset.fk] = el.value; });
  box.querySelector('#fd-x').onclick = Modal.close;
  box.querySelector('#fd-ok').onclick = async () => {
    const choix = lus.filter((l, i) => l.ok && (box.querySelector(`[data-fd="${i}"]`) || {}).checked);
    if (choix.some(l => !l.fabricant.trim() || !l.references.trim())) return notify('Indiquez le fabricant et au moins une référence pour chaque fiche.');
    try {
      const out = await api('POST', '/api/fiches/depot', { fiches: choix.map(l => ({ fichierId: l.fichierId, nom: l.nom, fabricant: l.fabricant.trim(), references: l.references, designation: l.designation, famille: l.famille, date: l.date, type: l.type, texteOcr: l.texteOcr || '' })) });
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

// Fiche scannée déjà dans la bibliothèque : lue par reconnaissance de caractères, texte envoyé au serveur
async function ocrFicheExistante(x) {
  const blob = await (await fetch(lienFiche(x), { credentials: 'same-origin' })).blob();
  const t = await texteOcrFiche(new File([blob], x.nom || 'fiche.pdf', { type: 'application/pdf' }));
  if (!t.trim()) throw new Error('Aucun texte reconnu sur ce scan.');
  await api('POST', '/api/fiches/texte', { id: x.id, texte: t });
  await Store.load().catch(() => {}); santeFiches = null;
  App.toast('Scan lu : références, date et caractéristiques complétées (à vérifier).');
}

/* ---------- État de la bibliothèque ---------- */
function santeHtml(peut) {
  const s = santeFiches;
  if (!peut) return '';
  if (!s) return '<div class="card small muted">État de la bibliothèque : chargement…</div>';
  if (s.erreur) return `<div class="card small muted">${esc(s.erreur)}</div>`;
  const auj = isoDate(new Date()), dem = (demandesFiches || []).filter(d => !['close'].includes(d.statut));
  const ref = f => `${esc(f.fabricant || '?')} ${esc((f.references || []).slice(0, 2).join(', '))}`;
  const parFab = new Map();
  (s.manquantes || []).forEach(m => { const k = m.fabricant || 'Fabricant non indiqué'; if (!parFab.has(k)) parFab.set(k, []); parFab.get(k).push(m); });
  return `<div class="card"><h3 style="margin-top:0">🩺 État de la bibliothèque</h3>
    <div class="toolbar" style="margin:0 0 6px">
      <span class="badge ${s.aVerifier ? 'b-info' : 'b-ok'}">${s.aVerifier} à vérifier</span>
      <span class="badge ${(s.manquantes || []).length ? 'b-bad' : 'b-ok'}">${(s.manquantes || []).length} référence(s) du matériel retenu sans fiche</span>
      <span class="badge ${s.doublons.length ? 'b-warn' : 'b-ok'}">${s.doublons.length} doublon(s)</span>
      <span class="badge ${s.fabricants.length ? 'b-warn' : 'b-ok'}">${s.fabricants.length} fabricant(s) à uniformiser</span>
      <span class="badge ${s.anciennes.length ? 'b-warn' : 'b-ok'}">${s.anciennes.length} fiche(s) de plus de 5 ans</span>
      <span class="badge ${s.scans.length ? 'b-warn' : 'b-ok'}">${s.scans.length} scan(s) non lu(s)</span>
      <button class="secondary small" id="fs-maj">↻</button></div>
    ${(s.manquantes || []).length ? `<details ${dem.length ? '' : 'open'}><summary class="small"><strong>Références du matériel retenu sans fiche</strong> (chantiers en cours)</summary>
      ${[...parFab.entries()].map(([fab, l]) => `<div class="small" style="margin:6px 0"><strong>${esc(fab)}</strong> ${peut ? `<button class="small" data-fs-demande="${esc(fab)}">✉️ Demander au fournisseur (${l.filter(m => !m.demande).length || l.length})</button>` : ''}
        <ul>${l.map(m => `<li>${esc(m.reference)} <span class="muted">${esc(m.designation || '')} · ${m.chantiers.map(c => esc(c.code)).join(', ')}</span>${m.demande ? ` <span class="badge b-info">demandée le ${dateFr(String(m.demande.envoyeeLe).slice(0, 10))} à ${esc(m.demande.fournisseur || '')}${m.demande.relances ? `, ${m.demande.relances} relance(s)` : ''}</span>` : ''}</li>`).join('')}</ul></div>`).join('')}</details>` : ''}
    ${dem.length ? `<details><summary class="small"><strong>Demandes aux fournisseurs</strong> (${dem.length})</summary><table class="small"><tr><th>Envoyée le</th><th>Fournisseur</th><th>Références</th><th>État</th><th></th></tr>
      ${dem.map(d => `<tr><td>${dateFr(String(d.envoyeeLe).slice(0, 10))}</td><td>${esc(d.fournisseur || d.to.join(', '))}</td><td>${d.lignes.length - d.manquantes}/${d.lignes.length} reçue(s)</td>
        <td><span class="badge ${d.statut === 'reçue' ? 'b-ok' : d.statut === 'sans réponse' || d.statut === 'erreur' ? 'b-bad' : 'b-info'}">${esc(d.statut)}</span>${(d.relances || []).length ? ` <span class="muted">${d.relances.length} relance(s)</span>` : ''}</td>
        <td>${d.statut !== 'reçue' ? `<button class="small secondary" data-fs-relancer="${esc(d.id)}">Relancer</button> <button class="small secondary" data-fs-clore="${esc(d.id)}">Clore</button>` : ''}</td></tr>`).join('')}</table>
      <p class="small muted">Relance automatique au bout de 7 jours (deux au plus). Les PDF reçus en réponse dans la boîte des offres sont ajoutés « à vérifier ».</p></details>` : ''}
    ${s.doublons.length ? `<details><summary class="small"><strong>Doublons</strong> (même fichier, ou même référence et même date)</summary><ul class="small">${s.doublons.map(g => `<li>${g.map((f, k) => `${k ? ' · ' : ''}<a href="${lienFiche(f)}" target="_blank" rel="noopener">${esc(f.nom || ref(f))}</a> <span class="muted">${esc(SOURCES_FICHE[f.source] || '')}</span>${k ? ` <button class="small secondary" data-fs-retirer="${esc(f.id)}">Retirer</button>` : ' <span class="badge b-ok">gardée</span>'}`).join('')}</li>`).join('')}</ul></details>` : ''}
    ${s.fabricants.length ? `<details open><summary class="small"><strong>Fabricants écrits de plusieurs façons</strong></summary><ul class="small">${s.fabricants.map((g, k) => `<li>${g.map(x => `« ${esc(x.nom)} » (${x.nombre})`).join(', ')} → <select data-fs-nom="${k}">${g.map(x => `<option>${esc(x.nom)}</option>`).join('')}</select> <button class="small" data-fs-unif="${k}">Uniformiser</button></li>`).join('')}</ul></details>` : ''}
    ${s.anciennes.length ? `<details><summary class="small"><strong>Fiches de plus de 5 ans</strong> (version à jour à redemander au fabricant)</summary><ul class="small">${s.anciennes.map(f => `<li><a href="${lienFiche(f)}" target="_blank" rel="noopener">${ref(f)}</a> <span class="muted">version du ${dateFr(f.date)}</span></li>`).join('')}</ul></details>` : ''}
    ${s.scans.length ? `<details><summary class="small"><strong>Scans non lus</strong> (PDF sans texte)</summary><ul class="small">${s.scans.map(f => `<li>${esc(f.nom || ref(f))} <button class="small secondary" data-fs-ocr="${esc(f.id)}">Lire par reconnaissance de caractères</button></li>`).join('')}</ul></details>` : ''}
    <span class="muted small" hidden>${auj}</span></div>`;
}
function bindSante(root) {
  const s = santeFiches;
  if (!s || s.erreur) return;
  const maj = async () => { santeFiches = null; await chargerSanteFiches(); await Store.load().catch(() => {}); App.render(); };
  const b = root.querySelector('#fs-maj'); if (b) b.onclick = maj;
  root.querySelectorAll('[data-fs-unif]').forEach(x => x.onclick = async () => {
    const g = s.fabricants[+x.dataset.fsUnif], nom = root.querySelector(`[data-fs-nom="${x.dataset.fsUnif}"]`).value;
    try { const r = await api('PUT', '/api/fiches/alias', { noms: g.map(y => y.nom), nom }); App.toast(`${r.modifiees} fiche(s) rangée(s) sous « ${nom} » ; les prochaines lectures aussi.`); await maj(); } catch (e) { notify(e.message); }
  });
  root.querySelectorAll('[data-fs-retirer]').forEach(x => x.onclick = async () => { if (!(await ask('Retirer ce doublon de la bibliothèque ?', 'Retirer'))) return; Store.remove('fichesTech', x.dataset.fsRetirer); await maj(); });
  root.querySelectorAll('[data-fs-ocr]').forEach(x => x.onclick = async () => { x.disabled = true; x.textContent = 'Lecture…'; try { await ocrFicheExistante(Store.get('fichesTech', x.dataset.fsOcr)); await maj(); } catch (e) { notify(e.message); x.disabled = false; } });
  root.querySelectorAll('[data-fs-demande]').forEach(x => x.onclick = () => { const l = (s.manquantes || []).filter(m => (m.fabricant || 'Fabricant non indiqué') === x.dataset.fsDemande && !m.demande); demanderFiches((l.length ? l : (s.manquantes || []).filter(m => (m.fabricant || 'Fabricant non indiqué') === x.dataset.fsDemande)), maj); });
  root.querySelectorAll('[data-fs-relancer]').forEach(x => x.onclick = async () => { try { await api('POST', `/api/fiches/demandes/${x.dataset.fsRelancer}/relancer`); App.toast('Relance envoyée.'); await maj(); } catch (e) { notify(e.message); } });
  root.querySelectorAll('[data-fs-clore]').forEach(x => x.onclick = async () => { await api('POST', `/api/fiches/demandes/${x.dataset.fsClore}/close`).catch(() => {}); await maj(); });
}

// Demande des fiches manquantes à un fournisseur (ou au fabricant) : e-mail repéré « [FT-…] », relances automatiques,
// réponse lue dans la boîte des offres. lignes : [{ fabricant, reference, designation, chantiers: [{ code }], fournisseurId }]
function demanderFiches(lignes, apres = () => {}) {
  const fournisseurs = Store.all('entreprises').filter(e => /fournisseur|fabricant/i.test(e.categorie || '') || e.email).sort((a, b) => a.nom.localeCompare(b.nom));
  const fid0 = (lignes.find(l => l.fournisseurId) || {}).fournisseurId || (fournisseurs.find(e => lignes.some(l => l.fabricant && FichesTech.memeFab(e.nom, l.fabricant))) || {}).id || '';
  const mailDe = id => { const e = Store.get('entreprises', id) || {}; return e.email || ((Store.all('contacts').find(c => c.entrepriseId === id && c.email) || {}).email || ''); };
  const box = Modal.open(`<h2 style="margin-top:0">✉️ Demander les fiches techniques</h2>
    <div class="grid2"><div class="field"><label for="dfm-f">Fournisseur ou fabricant</label><select id="dfm-f"><option value="">— choisir —</option>${fournisseurs.map(e => `<option value="${esc(e.id)}" ${e.id === fid0 ? 'selected' : ''}>${esc(e.nom)}</option>`).join('')}</select></div>
      <div class="field"><label for="dfm-to">E-mail</label><input id="dfm-to" type="email" value="${esc(fid0 ? mailDe(fid0) : '')}" placeholder="adv@fournisseur.fr"></div></div>
    <div class="field"><span class="label">Références demandées</span>${lignes.map((l, i) => `<label class="check small"><input type="checkbox" data-dfm="${i}" checked> ${esc([l.fabricant, l.reference].filter(Boolean).join(' '))} <span class="muted">${esc(l.designation || '')}${(l.chantiers || []).length ? ` · ${l.chantiers.map(c => esc(c.code)).join(', ')}` : ''}</span></label>`).join('')}</div>
    <div class="field"><label for="dfm-msg">Message (facultatif)</label><textarea id="dfm-msg" rows="2"></textarea></div>
    <p class="small muted">Le fournisseur répond au mail en joignant les PDF : ils arrivent « à vérifier » dans la bibliothèque (boîte des offres relevée). Relance automatique au bout de 7 jours.</p>
    <div class="modal-actions"><button class="secondary" id="dfm-x">Annuler</button><button id="dfm-ok">Envoyer la demande</button></div>`);
  box.querySelector('#dfm-x').onclick = Modal.close;
  box.querySelector('#dfm-f').onchange = e => { box.querySelector('#dfm-to').value = mailDe(e.target.value); };
  box.querySelector('#dfm-ok').onclick = async () => {
    const choix = lignes.filter((l, i) => box.querySelector(`[data-dfm="${i}"]`).checked);
    if (!choix.length) return notify('Cochez au moins une référence.');
    try {
      await api('POST', '/api/fiches/demande', { fournisseurId: box.querySelector('#dfm-f').value, to: box.querySelector('#dfm-to').value.trim(), message: box.querySelector('#dfm-msg').value,
        lignes: choix.map(l => ({ fabricant: l.fabricant, reference: l.reference, designation: l.designation, chantier: ((l.chantiers || [])[0] || {}).code || l.chantier || '' })) });
      Modal.close(); App.toast(`Demande envoyée : ${choix.length} référence(s).`); apres();
    } catch (e) { notify(e.message); }
  };
}
