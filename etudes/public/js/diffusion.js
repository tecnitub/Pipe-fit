// Documents émis d'une étude : liste des documents émis (LDE, Excel / PDF à cartouche), liste de diffusion, diffusion
// par e-mail (bordereau de transmission PDF à cartouche, PDF joints) et tableau « qui a reçu quel indice » ; retours du
// maître d'œuvre (VSO / VAO / REF, observations, PDF annoté) ; calculs à réémettre par répercussion d'une modification,
// réémis ensemble ; comparaison de deux indices d'un calcul (données, résultats, schémas colorés).
const ROLES_DIFFUSION = ['Maîtrise d\'œuvre', 'Bureau de contrôle', 'Client / maître d\'ouvrage', 'Sous-traitant', 'Entreprise', 'Interne', 'Autre'];
const codeAffaire = et => (affaireDe(et.affaireId) || {}).code || '';
// Fichier d'une pièce : gardé par l'application Études ({ id }) ou document de Pipe-Fit ({ pf })
const urlFichierEtude = f => (f.pf ? `/api/pf/fichier/${encodeURIComponent(f.pf)}` : `/api/fichiers/${encodeURIComponent(f.id)}`);
const octetsFichier = async f => new Uint8Array(await (await fetch(urlFichierEtude(f), { credentials: 'same-origin' })).arrayBuffer());

/* ---------- Pièces jointes à l'étude : plans et documents du chantier, fiches techniques, matériel à valider ---------- */
const typeDocChantier = d => (/plan|isom|sch[ée]ma|dwg|dxf/i.test(`${d.categorie} ${d.nom}`) ? 'plan' : /fiche|technique|notice/i.test(`${d.categorie} ${d.nom}`) ? 'fiche' : 'doc');
// Indices suivis : plan remplacé dans Pipe-Fit, fiche technique remplacée dans la bibliothèque
function synchroniserPieces(et) {
  const a = affaireDe(et.affaireId), docs = (a && (a.tousDocuments || a.documents)) || [];
  let n = 0;
  (et.pieces || []).filter(x => !x.retiree && x.source && x.source.pfDocId).forEach(x => {
    const d = docs.find(y => y.id === x.source.pfDocId);
    if (d && Revisions.synchroniserPiece(x, { fichier: { pf: d.fichierId, nom: d.nom }, indice: d.indice ? String(d.indice) : '', date: d.date || '' })) n++;
  });
  if (n) enregistrer(et);
  return n;
}
async function synchroniserFiches(et) {
  const l = (et.pieces || []).filter(x => !x.retiree && x.type === 'fiche' && x.source && x.source.reference);
  if (!l.length) return 0;
  try {
    const r = await api('POST', '/api/pf/fiches/trouver', { demandes: l.map(x => ({ cle: x.id, fabricant: x.source.fabricant, reference: x.source.reference })) });
    let n = 0;
    r.forEach(y => { const x = l.find(z => z.id === y.cle); if (x && y.fiche && Revisions.synchroniserPiece(x, { fichier: { pf: y.fiche.fichierId, nom: y.fiche.nom }, date: y.fiche.date || '' })) n++; });
    if (n) enregistrer(et);
    return n;
  } catch (e) { return 0; }
}
function dialogueDocumentsChantier(et) {
  const a = affaireDe(et.affaireId);
  if (!a) return toast('Rattachez l\'étude à une affaire Pipe-Fit pour joindre ses documents.', 6000);
  const deja = new Set((et.pieces || []).filter(x => !x.retiree).map(x => (x.source || {}).pfDocId));
  const docs = (a.tousDocuments || a.documents || []).filter(d => !deja.has(d.id) && d.etudeId !== et.id).sort((x, y) => String(x.categorie).localeCompare(String(y.categorie)) || String(x.nom).localeCompare(String(y.nom)));
  if (!docs.length) return toast('Aucun autre document dans le chantier Pipe-Fit.', 5000);
  const box = Modal.open(`<h2>📎 Plans et documents du chantier ${esc(a.code || '')}</h2>
    <p class="petit muted">Les documents cochés sont numérotés et suivis comme les calculs : LDE, diffusion, indice reçu par chaque destinataire. Un nouvel indice déposé dans Pipe-Fit devient automatiquement un nouvel indice ici.</p>
    <div class="defile">${docs.map((d, i) => `<label class="case petit"><input type="checkbox" data-dc="${i}"> <span class="badge">${esc(d.categorie || 'Document')}</span> ${esc(d.nom)}${d.indice ? ` — indice ${esc(d.indice)}` : ''} <span class="muted">${dateFr(d.date || '')}</span></label>`).join('')}</div>
    <div class="actions"><button class="secondaire" id="dc-x">Annuler</button><button id="dc-ok">Joindre à l'étude</button></div>`);
  box.querySelector('#dc-x').onclick = Modal.close;
  box.querySelector('#dc-ok').onclick = () => {
    const choix = docs.filter((d, i) => box.querySelector(`[data-dc="${i}"]`).checked);
    choix.forEach(d => Revisions.nouvellePiece(et, a.code, { type: typeDocChantier(d), titre: String(d.nom).replace(/\.[a-z0-9]+$/i, ''), source: { pfDocId: d.id, categorie: d.categorie || '' }, fichier: { pf: d.fichierId, nom: d.nom }, indice: d.indice ? String(d.indice) : 'A', date: d.date || aujourdhui() }));
    enregistrer(et); Modal.close(); App.render(); if (choix.length) toast(`${choix.length} document(s) joint(s) à l'étude.`);
  };
}
async function joindreFichesMateriel(et) {
  const ls = (typeof lignesMateriel === 'function' ? lignesMateriel(et) : []).filter(l => l.reference && !l.orphelin);
  if (!ls.length) return toast('Aucune référence dans le matériel retenu.', 5000);
  try {
    const r = await api('POST', '/api/pf/fiches/trouver', { demandes: ls.map(l => ({ cle: l.cle, fabricant: l.fabricant, reference: l.reference })) });
    const deja = new Set((et.pieces || []).filter(x => !x.retiree && x.type === 'fiche').map(x => `${x.source.fabricant}|${x.source.reference}`.toLowerCase()));
    let n = 0;
    const sans = [];
    ls.forEach(l => {
      const f = (r.find(y => y.cle === l.cle) || {}).fiche, k = `${l.fabricant}|${l.reference}`.toLowerCase();
      if (!f) { sans.push(`${l.fabricant || ''} ${l.reference}`.trim()); return; }
      if (deja.has(k)) return;
      deja.add(k);
      Revisions.nouvellePiece(et, codeAffaire(et), { type: 'fiche', titre: `${l.fabricant || f.fabricant} ${l.reference} — fiche technique`, source: { fabricant: l.fabricant || f.fabricant, reference: l.reference, ficheId: f.id }, fichier: { pf: f.fichierId, nom: f.nom }, indice: 'A', date: f.date || aujourdhui() });
      n++;
    });
    enregistrer(et); App.render();
    toast(`${n} fiche(s) technique(s) jointe(s)${sans.length ? ` · sans fiche dans la bibliothèque : ${sans.slice(0, 5).join(', ')}${sans.length > 5 ? '…' : ''}` : ''}.`, 7000);
  } catch (e) { toast(e.message, 6000); }
}
// Liste du matériel à valider (PDF généré) : pièce de l'étude, nouvel indice à chaque nouvelle liste
async function enregistrerListeMateriel(et, nom, bytes) {
  const f = await garderPdf(nom, bytes);
  if (!f) return;
  const fichier = { id: f.id, nom }, x = (et.pieces || []).find(p => !p.retiree && p.type === 'materiel');
  if (x) Revisions.synchroniserPiece(x, { fichier, date: aujourdhui() });
  else Revisions.nouvellePiece(et, codeAffaire(et), { type: 'materiel', titre: 'Liste du matériel proposé — à valider', source: { materiel: true }, fichier, indice: 'A', date: aujourdhui() });
  enregistrer(et);
}

/* ---------- Calculs à réémettre : modifiés, ou modifiés par répercussion d'un autre calcul ---------- */
function impactsEtude(et) {
  contexteEtude = et;
  return et.notes.map(n => {
    const d = Revisions.derniere(n);
    if (!d) return null;
    const e = Liens.resoudre(et, n).entrees;
    if (!Revisions.modifieDepuis(n, e)) return null;
    // Données propres inchangées : la modification vient du calcul relié (schéma de principe, CTA…)
    const propre = d.brutes ? JSON.stringify(Revisions.figer(n.entrees)) !== JSON.stringify(d.brutes) || (n.commentaire || '') !== (d.commentaire || '') : true;
    return { n, d, cause: propre ? 'modifié' : 'répercussion', source: propre ? '' : Liens.description(et, n) };
  }).filter(Boolean);
}

/* ---------- Carte de l'étude : documents émis et diffusion ---------- */
function carteDocuments(et) {
  if (et.modele) return '';
  synchroniserPieces(et);
  const docs = Revisions.documentsEtude(et, codeAffaire(et)), etat = Revisions.etatDiffusion(et, docs), imp = impactsEtude(et);
  const emis = docs.filter(x => x.type === 'calcul'), autres = docs.filter(x => x.piece).length, perimes = etat.reduce((s, d) => s + d.documents.filter(x => x.perime).length, 0);
  const AV = { VSO: 'ok', VAO: 'attention', REF: 'erreur' };
  return `<div class="carte"><h3>📨 Documents émis et diffusion</h3>
    ${imp.length ? `<div class="alerte attention petit">🔁 ${imp.length} calcul(s) à réémettre : ${imp.map(x => `<strong>${esc(x.n.titre)}</strong> (${x.cause === 'répercussion' ? `par répercussion${x.source ? ` — ${esc(x.source.slice(0, 80))}` : ''}` : `modifié depuis l'indice ${esc(x.d.indice)}`})`).join(' · ')}
      <button class="petit" id="doc-reemettre">Réémettre ensemble</button></div>` : ''}
    <div class="defile-x"><table class="liste compact"><thead><tr><th>N° document</th><th>Type</th><th>Titre</th><th>Ind.</th><th>Date</th><th>Statut</th><th>Visa MOE</th>${(et.diffusion || []).map(d => `<th title="${esc(d.role || '')} ${esc(d.email || '')}">${esc(d.nom || d.societe)}</th>`).join('')}</tr></thead>
      ${docs.map((doc, k) => `<tr><td class="petit">${esc(doc.numero)}</td><td class="petit">${esc(Revisions.TYPES_DOC[doc.type] || '')}</td><td>${esc(doc.titre)}${doc.piece ? ` <button class="icone" data-piece-retour="${esc(doc.cle)}" title="Saisir le visa reçu">📥</button><button class="icone" data-piece-retirer="${esc(doc.cle)}" title="Retirer de l'étude">✕</button>` : ''}</td><td><strong>${esc(doc.indice)}</strong></td><td>${dateFr(doc.date)}</td><td class="petit">${esc(doc.statut || '')}</td>
        <td>${doc.avis ? `<span class="badge ${AV[doc.avis] || ''}" title="${esc(Revisions.AVIS[doc.avis])} — ${dateFr(doc.avisLe)}">${esc(doc.avis)}</span>` : '<span class="muted petit">—</span>'}</td>
        ${etat.map(d => { const x = d.documents[k]; return `<td class="petit">${x.jamais ? '<span class="muted">—</span>' : `<span class="badge ${x.perime ? 'attention' : 'ok'}" title="Reçu le ${dateFr(x.recu.date)}">${esc(x.recu.indice)}${x.perime ? ' ⚠' : ''}</span>`}</td>`; }).join('')}</tr>`).join('')}</table></div>
    <p class="petit muted">${emis.length} calcul(s) émis${autres ? `, ${autres} autre(s) document(s) (plans, fiches, matériel)` : ''}.${perimes ? ` <span class="avert">${perimes} envoi(s) périmé(s) : un destinataire travaille sur un indice dépassé.</span>` : ''} Cellules : indice reçu par chaque destinataire (⚠ : périmé).</p>
    <div class="actions-ligne"><button class="secondaire petit" id="doc-pieces">📎 Plans et documents du chantier</button><button class="secondaire petit" id="doc-fiches">📄 Fiches techniques du matériel retenu</button></div>
    <div class="actions-ligne"><button class="secondaire petit" id="doc-liste">👥 Liste de diffusion (${(et.diffusion || []).length})</button><button class="petit" id="doc-diffuser" ${emis.length || et.pdfEtude || (et.pieces || []).some(x => !x.retiree) ? '' : 'disabled'}>📨 Diffuser</button>
      <button class="secondaire petit" id="doc-lde-xlsx">📋 LDE (Excel)</button><button class="secondaire petit" id="doc-lde-pdf">📋 LDE (PDF)</button>
      ${(et.diffusions || []).length ? `<span class="petit muted">Dernière diffusion le ${dateFr(et.diffusions[et.diffusions.length - 1].date)}</span>` : ''}</div></div>`;
}
function bindDocuments(root, et) {
  const on = (id, f) => { const b = root.querySelector(id); if (b) b.onclick = f; };
  on('#doc-liste', () => dialogueListeDiffusion(et));
  on('#doc-diffuser', () => dialogueDiffuser(et));
  on('#doc-reemettre', () => dialogueReemettre(et));
  on('#doc-lde-xlsx', () => ldeExcel(et));
  on('#doc-lde-pdf', () => ldePdf(et));
  on('#doc-pieces', () => dialogueDocumentsChantier(et));
  on('#doc-fiches', () => joindreFichesMateriel(et));
  root.querySelectorAll('[data-piece-retirer]').forEach(b => b.onclick = async () => { const x = et.pieces.find(y => y.id === b.dataset.pieceRetirer); if (x && await confirmer(`Retirer « ${x.titre} » des documents de l'étude ? (son historique de diffusion est gardé)`, 'Retirer')) { x.retiree = true; enregistrer(et); App.render(); } });
  root.querySelectorAll('[data-piece-retour]').forEach(b => b.onclick = () => { const x = et.pieces.find(y => y.id === b.dataset.pieceRetour); if (x) dialogueRetour(et, x, x.indice); });
  // Fiches techniques remplacées dans la bibliothèque : nouvel indice
  synchroniserFiches(et).then(n => { if (n) { toast(`${n} fiche(s) technique(s) mise(s) à jour dans la bibliothèque : nouvel indice.`); App.render(); } });
}

/* ---------- Liste de diffusion ---------- */
function dialogueListeDiffusion(et) {
  et.diffusion = et.diffusion || [];
  const box = Modal.open('');
  const rendu = () => {
    box.innerHTML = `<h2>👥 Liste de diffusion</h2><p class="petit muted">Destinataires des documents de l'étude : maîtrise d'œuvre, bureau de contrôle, client, sous-traitants… Le tableau des documents montre l'indice reçu par chacun.</p>
      <div class="defile-x"><table class="edit"><thead><tr><th>Nom</th><th>Société</th><th>Rôle</th><th>E-mail</th><th>Copie</th><th></th></tr></thead>
      ${et.diffusion.map((d, i) => `<tr><td><input data-dl="${i}" data-k="nom" value="${esc(d.nom || '')}"></td><td><input data-dl="${i}" data-k="societe" value="${esc(d.societe || '')}" list="dl-soc"></td>
        <td><select data-dl="${i}" data-k="role">${ROLES_DIFFUSION.map(r => `<option ${r === d.role ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></td>
        <td><input data-dl="${i}" data-k="email" type="email" value="${esc(d.email || '')}"></td><td><input type="checkbox" data-dl="${i}" data-k="copie" ${d.copie ? 'checked' : ''} title="En copie des e-mails"></td><td><button class="icone" data-dl-suppr="${i}">✕</button></td></tr>`).join('')}</table></div>
      <datalist id="dl-soc">${((S.pf || {}).entreprises || []).map(e => `<option value="${esc(e.nom)}">`).join('')}</datalist>
      <div class="actions"><button class="secondaire" id="dl-ajout">+ Destinataire</button><span class="espace"></span><button id="dl-ok">Fermer</button></div>`;
    box.querySelectorAll('[data-dl]').forEach(el => el.onchange = () => { et.diffusion[+el.dataset.dl][el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value.trim(); enregistrer(et); });
    box.querySelectorAll('[data-dl-suppr]').forEach(b => b.onclick = () => { et.diffusion.splice(+b.dataset.dlSuppr, 1); enregistrer(et); rendu(); });
    box.querySelector('#dl-ajout').onclick = () => { et.diffusion.push({ id: uidE(), nom: '', societe: '', role: ROLES_DIFFUSION[0], email: '' }); enregistrer(et); rendu(); };
    box.querySelector('#dl-ok').onclick = () => { Modal.close(); App.render(); };
  };
  rendu();
}

/* ---------- PDF à cartouche (bordereau, LDE) ---------- */
async function pdfCartouche(et, html, titre, numero, typeDoc) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib, emissions = emissionsEtude(et), hC = 14 + 64 + (Math.min(3, emissions.length) + 1) * 10 + 8;
  const doc = await PDFDocument.load(await PDF.depuisHTML(pourPdf(html), titre, null, { numeros: false, margeHaut: 80, margeBas: Math.ceil(hC / 0.75) + 10 }));
  const police = await doc.embedFont(StandardFonts.Helvetica), gras = await doc.embedFont(StandardFonts.HelveticaBold), logo = await doc.embedPng(await octetsDe('logo-tecnitub.png'));
  const couleur = /^#[0-9a-f]{6}$/i.test(S.config.couleur) ? S.config.couleur : '#1F3864', bleu = rgb(...[1, 3, 5].map(i => parseInt(couleur.slice(i, i + 2), 16) / 255)), gris = rgb(0.4, 0.4, 0.4);
  const a = affaireDe(et.affaireId), soc = S.config.societe, total = doc.getPageCount(), courant = emissions[emissions.length - 1];
  const infos = { societe: soc.raison, adresse: soc.adresse, contact: [soc.tel && `Tél. ${soc.tel}`, soc.email].filter(Boolean).join(' · '), affaire: libelleAffaire(a) || '—', client: et.client || clientDe(a) || '—', objet: et.objet, titre, typeDoc, numero, indice: courant.indice, date: dateFr(aujourdhui()), statut: 'Pour information' };
  doc.getPages().forEach((pg, i) => {
    const { width: W, height: H } = pg.getSize(), lh = 22, lw = logo.width * lh / logo.height, t = winAnsi(`${titre.toUpperCase().slice(0, 40)} — ${numero}`);
    pg.drawImage(logo, { x: 31, y: H - 18 - lh, width: lw, height: lh });
    pg.drawText(t, { x: W - 31 - gras.widthOfTextAtSize(t, 9), y: H - 32, size: 9, font: gras, color: bleu });
    pg.drawLine({ start: { x: 31, y: H - 46 }, end: { x: W - 31, y: H - 46 }, thickness: 1.2, color: bleu });
    dessinerCartouche(pg, { police, gras, logo, bleu, gris, infos, emissions, page: i + 1, total });
  });
  return doc.save();
}

/* ---------- Diffusion : bordereau de transmission, e-mail ---------- */
// Pièce à transmettre : PDF gardé à l'émission (calcul) ou à la génération de la note complète
function piecesDiffusables(et) {
  const docs = Revisions.documentsEtude(et, codeAffaire(et));
  return docs.map(doc => {
    if (doc.cle === 'etude') return { ...doc, fichier: et.pdfEtude && et.pdfEtude.indice === et.indice ? et.pdfEtude.fichier : null };
    if (doc.piece) { const x = et.pieces.find(y => y.id === doc.cle); return { ...doc, fichier: x && x.fichier ? x.fichier : null }; }
    const n = et.notes.find(x => x.id === doc.cle), d = Revisions.derniere(n);
    return { ...doc, fichier: d && d.fichier ? d.fichier : null };
  });
}
function htmlBordereau(et, envoi, pieces, dest) {
  const a = affaireDe(et.affaireId);
  return `<div class="doe-doc ndc"><h2>BORDEREAU DE TRANSMISSION N° ${esc(envoi.numero)}</h2>
    <table class="tn"><tbody><tr><th>Affaire</th><td>${esc(libelleAffaire(a)) || '—'}</td><th>Date</th><td>${dateFr(envoi.date)}</td></tr><tr><th>Étude</th><td colspan="3">${esc(et.objet)}</td></tr>
      <tr><th>Émetteur</th><td colspan="3">${esc(S.config.societe.raison)} — ${esc(envoi.par)}</td></tr></tbody></table>
    <h3>Destinataires</h3>${tableauPdf(['Nom', 'Société', 'Rôle', 'E-mail'], dest.map(d => [d.nom || '—', d.societe || '—', d.role || '—', d.email || '—']))}
    <h3>Documents transmis</h3>${tableauPdf(['N° document', 'Type', 'Titre', 'Indice', 'Date', 'Statut'], pieces.map(p => [p.numero, Revisions.TYPES_DOC[p.type] || '', p.titre, p.indice, dateFr(p.date), p.statut || '']))}
    <p class="petit">Objet : ${esc(envoi.objet || 'pour avis et visa')}.</p>${envoi.message ? `<p class="pre petit">${esc(envoi.message)}</p>` : ''}
    <p class="petit">Merci de nous retourner votre avis sur chaque document (VSO : visa sans observation ; VAO : visa avec observations ; REF : refusé) en rappelant son numéro et son indice.</p>
    <table class="tn visa"><thead><tr><th>Accusé de réception</th><th>Nom</th><th>Date</th><th>Signature</th></tr></thead><tbody><tr><td style="height:60px"></td><td></td><td></td><td></td></tr></tbody></table></div>`;
}
function dialogueDiffuser(et, cles = null) {
  const pieces = piecesDiffusables(et), dest = et.diffusion || [], etat = Revisions.etatDiffusion(et, pieces);
  // Par défaut : les documents demandés, sinon ceux qu'au moins un destinataire n'a pas dans leur indice en vigueur
  const coche = p => (cles ? cles.includes(p.cle) : etat.some(d => d.documents.find(x => x.cle === p.cle && (x.perime || x.jamais))) && (p.cle !== 'etude' || p.fichier));
  const box = Modal.open(`<h2>📨 Diffuser des documents</h2>
    ${dest.length ? '' : '<p class="avert petit">Liste de diffusion vide : ajoutez les destinataires (maîtrise d\'œuvre, bureau de contrôle…).</p>'}
    <fieldset><legend>Documents</legend>${pieces.map((p, i) => `<label class="case petit"><input type="checkbox" data-dp="${i}" ${coche(p) ? 'checked' : ''}> ${esc(p.numero)} — ${esc(p.titre)} — <strong>indice ${esc(p.indice)}</strong> ${p.fichier ? '<span class="muted">(PDF joint)</span>' : `<span class="avert">(PDF non disponible : ${p.cle === 'etude' ? 'générez la note de calcul de cet indice' : 'réémettez le calcul'})</span>`}</label>`).join('')}</fieldset>
    <fieldset><legend>Destinataires</legend>${dest.map(d => `<label class="case petit"><input type="checkbox" data-dd="${esc(d.id)}" ${d.copie ? '' : 'checked'}> ${esc(d.nom || '')} ${d.societe ? `(${esc(d.societe)})` : ''} — ${esc(d.role || '')} ${d.email ? `<span class="muted">${esc(d.email)}</span>` : '<span class="avert">sans e-mail</span>'}${d.copie ? ' <span class="muted">copie</span>' : ''}</label>`).join('') || '<span class="muted petit">aucun</span>'}</fieldset>
    <div class="grille-champs"><label>Objet<input id="dp-objet" value="Pour avis et visa"></label></div>
    <label class="champ-libre">Message<textarea id="dp-msg" rows="2"></textarea></label>
    <div class="actions"><button class="secondaire" id="dp-x">Annuler</button><button class="secondaire" id="dp-bt">Bordereau seul (PDF, remis autrement)</button><button id="dp-mail">✉️ Envoyer par e-mail (bordereau + PDF)</button></div>`);
  box.classList.add('large');
  box.querySelector('#dp-x').onclick = Modal.close;
  const choix = () => ({ pcs: pieces.filter((p, i) => box.querySelector(`[data-dp="${i}"]`).checked), ds: dest.filter(d => box.querySelector(`[data-dd="${CSS.escape(d.id)}"]`).checked || d.copie) });
  const preparer = async () => {
    const { pcs, ds } = choix();
    if (!pcs.length) throw new Error('Cochez au moins un document.');
    if (!ds.length) throw new Error('Cochez au moins un destinataire.');
    const envoi = { id: uidE(), numero: `${codeAffaire(et) || 'ETU'}-BT-${String((et.diffusions || []).length + 1).padStart(3, '0')}`, date: aujourdhui(), par: S.me.nom || S.me.login, objet: box.querySelector('#dp-objet').value.trim(), message: box.querySelector('#dp-msg').value.trim(),
      destinataires: ds.map(d => d.id), documents: pcs.map(p => ({ cle: p.cle, numero: p.numero, indice: p.indice })) };
    const bytes = await pdfCartouche(et, htmlBordereau(et, envoi, pcs, ds), `Bordereau de transmission ${envoi.numero}`, envoi.numero, 'Bordereau de transmission');
    return { envoi, bytes, pcs, ds, nom: `${sansAccents(envoi.numero)}_Bordereau.pdf` };
  };
  const conclure = async (x, mode) => {
    const f = await garderPdf(x.nom, x.bytes);
    x.envoi.mode = mode; if (f) x.envoi.bordereau = { id: f.id, nom: x.nom };
    et.diffusions = [...(et.diffusions || []), x.envoi]; enregistrer(et);
  };
  box.querySelector('#dp-bt').onclick = async () => {
    try { const x = await preparer(); await conclure(x, 'bordereau'); enregistrerFichier(box, x.nom, x.bytes, 'application/pdf'); toast(`Bordereau ${x.envoi.numero} : diffusion enregistrée.`); setTimeout(() => { Modal.close(); App.render(); }, 300); } catch (e) { toast(e.message, 6000); }
  };
  box.querySelector('#dp-mail').onclick = async () => {
    const bt = box.querySelector('#dp-mail'); bt.disabled = true; bt.textContent = 'Préparation…';
    try {
      const x = await preparer(), to = x.ds.filter(d => !d.copie && d.email).map(d => d.email), cc = x.ds.filter(d => d.copie && d.email).map(d => d.email);
      if (!to.length) throw new Error('Aucun destinataire principal avec une adresse e-mail.');
      // PDF joints jusqu'à 2,8 Mo au total (limite de l'envoi) ; plans DWG et documents trop lourds : à transmettre autrement
      const pj = [{ name: x.nom, base64: base64(x.bytes) }], nonJoints = [];
      let poids = x.bytes.length;
      for (const p of x.pcs.filter(y => y.fichier)) {
        const ext = ((/\.([a-z0-9]+)$/i.exec(p.fichier.nom || '.pdf') || [])[1] || 'pdf').toLowerCase();
        if (!['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) { nonJoints.push(`${p.numero} (${(/\.([a-z0-9]+)$/i.exec(p.fichier.nom) || [])[1] || 'fichier'})`); continue; }
        const o = await octetsFichier(p.fichier);
        if (poids + o.length > 2.8 * 1024 * 1024) { nonJoints.push(`${p.numero} (trop lourd)`); continue; }
        poids += o.length;
        pj.push({ name: `${sansAccents(p.numero)}_ind${sansAccents(p.indice)}.${ext === 'jpeg' ? 'jpg' : ext}`, base64: base64(o) });
      }
      x.envoi.nonJoints = nonJoints;
      const html = `<p>Bonjour,</p><p>Veuillez trouver ci-joint, ${esc(x.envoi.objet.toLowerCase())}, les documents suivants de l'affaire ${esc(libelleAffaire(affaireDe(et.affaireId)) || et.objet)} :</p><ul>${x.pcs.map(p => `<li>${esc(p.numero)} — ${esc(p.titre)} — indice ${esc(p.indice)}</li>`).join('')}</ul>${x.envoi.message ? `<p>${esc(x.envoi.message).replace(/\n/g, '<br>')}</p>` : ''}${nonJoints.length ? `<p>Documents à vous transmettre par un autre moyen (format ou poids) : ${nonJoints.map(esc).join(', ')}.</p>` : ''}<p>Bordereau de transmission ${esc(x.envoi.numero)} joint. Merci de nous retourner votre avis (VSO / VAO / REF) en rappelant le numéro et l'indice de chaque document.</p><p>Cordialement,<br>${esc(x.envoi.par)}<br>${esc(S.config.societe.raison)}</p>`;
      await api('POST', '/api/pf/mail', { to, cc, subject: `${x.envoi.numero} — ${et.objet} — ${x.pcs.length} document(s)`, html, attachments: pj });
      await conclure(x, 'e-mail'); toast(`Envoyé à ${to.length} destinataire(s)${cc.length ? ` (+${cc.length} en copie)` : ''} : bordereau ${x.envoi.numero}${nonJoints.length ? ` ; non joints : ${nonJoints.join(', ')}` : ''}.`, 8000); Modal.close(); App.render();
    } catch (e) { bt.disabled = false; bt.textContent = '✉️ Envoyer par e-mail (bordereau + PDF)'; toast(e.message, 7000); }
  };
}

/* ---------- Retours du maître d'œuvre ---------- */
// n : calcul émis, ou pièce jointe à l'étude (plan, fiche technique, liste du matériel)
function dialogueRetour(et, n, indice) {
  const dest = (et.diffusion || []).filter(d => d.role !== 'Interne');
  const box = Modal.open(`<h2>📥 Retour sur l'indice ${esc(indice)} — ${esc(n.titre)}</h2>
    <div class="grille-champs"><label>Reçu le<input type="date" id="rt-date" value="${aujourdhui()}"></label>
      <label>De<input id="rt-de" list="rt-dest" value="${esc((dest.find(d => /œuvre/.test(d.role)) || dest[0] || {}).nom || '')}"></label>
      <label>Avis<select id="rt-avis">${Object.entries(Revisions.AVIS).map(([k, l]) => `<option value="${k}">${k} — ${esc(l)}</option>`).join('')}</select></label></div>
    <datalist id="rt-dest">${dest.map(d => `<option value="${esc(d.nom || d.societe)}">`).join('')}</datalist>
    <label class="champ-libre">Observations (une par ligne : chacune devient une remarque à lever à l'indice suivant)<textarea id="rt-obs" rows="4"></textarea></label>
    <label>PDF annoté retourné (facultatif)<input type="file" id="rt-pdf" accept=".pdf,image/*"></label>
    <div class="actions"><button class="secondaire" id="rt-x">Annuler</button><button id="rt-ok">Enregistrer le retour</button></div>`);
  box.querySelector('#rt-x').onclick = Modal.close;
  box.querySelector('#rt-ok').onclick = async () => {
    try {
      let fichier = null;
      const f = box.querySelector('#rt-pdf').files[0];
      if (f) { const u = new Uint8Array(await f.arrayBuffer()), r = await api('POST', '/api/fichiers', { nom: f.name, base64: base64(u) }); fichier = { id: r.id, nom: f.name }; }
      const champs = { date: box.querySelector('#rt-date').value, de: box.querySelector('#rt-de').value.trim(), avis: box.querySelector('#rt-avis').value, observations: box.querySelector('#rt-obs').value, fichier };
      if (n.emissions === undefined && n.numero) {
        // Pièce jointe : visa gardé sur la pièce (indice visé)
        n.retours = [...(n.retours || []), { id: uidE(), indice, ...champs, observations: String(champs.observations || '').split(/\n+/).map(t => t.trim()).filter(Boolean).map(texte => ({ id: uidE(), texte, leveeIndice: '' })) }];
        enregistrer(et); Modal.close(); App.render(); toast(`${champs.avis} enregistré pour ${n.numero} indice ${indice}.`); return;
      }
      const r = Revisions.ajouterRetour(n, indice, champs, uidE);
      enregistrer(et); Modal.close(); App.render();
      toast(`${r.avis} enregistré${r.observations.length ? ` : ${r.observations.length} observation(s) à lever à l'indice ${Revisions.prochainIndice(n)}` : ''}.`, 6000);
    } catch (e) { toast(e.message, 6000); }
  };
}

/* ---------- Réémission groupée des calculs modifiés (ou par répercussion) ---------- */
function dialogueReemettre(et) {
  const imp = impactsEtude(et);
  if (!imp.length) return toast('Aucun calcul à réémettre.');
  const box = Modal.open(`<h2>🔁 Réémettre les calculs impactés</h2>
    <p class="petit muted">Chaque calcul reçoit son indice suivant ; les modifications (et la cause : donnée modifiée ou répercussion d'un calcul relié) sont relevées dans son suivi des modifications.</p>
    <fieldset><legend>Calculs</legend>${imp.map((x, i) => `<label class="case petit"><input type="checkbox" data-rm="${i}" checked> <strong>${esc(x.n.titre)}</strong> : ${esc(x.d.indice)} → ${esc(Revisions.prochainIndice(x.n))} <span class="muted">(${x.cause === 'répercussion' ? 'répercussion' : 'modifié'})</span></label>`).join('')}</fieldset>
    <div class="grille-champs"><label>Date<input type="date" id="rm-date" value="${aujourdhui()}"></label><label>Statut<select id="rm-statut">${Revisions.STATUTS.map(x => `<option>${esc(x)}</option>`).join('')}</select></label>
      <label>Rédigé par<input id="rm-red" value="${esc(S.me.nom || S.me.login)}"></label><label>Vérifié par<input id="rm-ver" value="${esc(et.verificateur || '')}"></label><label>Approuvé par<input id="rm-app" value="${esc(et.approbateur || '')}"></label></div>
    <label class="champ-libre">Objet commun (complété par les modifications de chaque calcul)<input id="rm-objet" placeholder="ex. Mise à jour suite au visa du maître d'œuvre"></label>
    ${imp.some(x => Revisions.observationsOuvertes(x.n).length) ? `<label class="case petit"><input type="checkbox" id="rm-lever"> Lever les observations du maître d'œuvre de ces calculs (${imp.reduce((t, x) => t + Revisions.observationsOuvertes(x.n).length, 0)}) : elles figureront dans le suivi des modifications</label>` : ''}
    <label class="case petit"><input type="checkbox" id="rm-etude"> Nouvel indice de l'étude (${esc(suivantIndice(et.indice))}) pour la note de calcul complète</label>
    ${et.affaireId && affaireDe(et.affaireId) ? '<label class="case petit"><input type="checkbox" id="rm-pf" checked> Déposer chaque PDF dans les documents du chantier Pipe-Fit</label>' : ''}
    <div class="actions"><button class="secondaire" id="rm-x">Annuler</button><button id="rm-ok">Réémettre</button></div>`);
  box.querySelector('#rm-x').onclick = Modal.close;
  box.querySelector('#rm-ok').onclick = async () => {
    // Valeurs lues avant que la fenêtre n'affiche l'avancement
    const lu = Object.fromEntries(['#rm-date', '#rm-statut', '#rm-red', '#rm-ver', '#rm-app', '#rm-objet'].map(id => [id, ((box.querySelector(id) || {}).value || '').trim()]));
    const v = id => lu[id] || '', choisis = imp.filter((x, i) => box.querySelector(`[data-rm="${i}"]`).checked);
    if (!choisis.length) return toast('Cochez au moins un calcul.');
    const lever = !!(box.querySelector('#rm-lever') || {}).checked, depot = !!(box.querySelector('#rm-pf') || {}).checked, nouvelIndice = box.querySelector('#rm-etude').checked, faits = [];
    box.innerHTML = '<h2>Réémission</h2><p id="rm-etape">…</p>';
    try {
      for (const x of choisis) {
        box.querySelector('#rm-etape').textContent = `${x.n.titre}…`;
        const e = Liens.resoudre(et, x.n).entrees, r = Liens.calculer(et, x.n), schema = schemaNote(x.n.type, e);
        const base = Revisions.emission(x.n, {}, e, r.resume, schema);
        const objet = [v('#rm-objet'), x.cause === 'répercussion' ? `Répercussion${x.source ? ` (${x.source.split(' ;')[0].slice(0, 80)})` : ''}` : '', base.objet].filter(Boolean).join(' — ');
        const em = Revisions.emission(x.n, { date: v('#rm-date') || aujourdhui(), statut: v('#rm-statut'), objet, redige: v('#rm-red'), verifie: v('#rm-ver'), approuve: v('#rm-app') }, e, r.resume, schema);
        const obs = lever ? Revisions.observationsOuvertes(x.n) : [];
        if (obs.length) em.observationsLevees = obs.map(o => ({ texte: o.texte, indice: o.indice, avis: o.avis }));
        const out = await pdfEmission(et, x.n, em);
        await enregistrerEmission(et, x.n, em, out.bytes, out.nom, obs.map(o => o.id));
        if (depot) await deposerEmission(et, x.n, em, out.bytes, out.nom, out.numero).catch(er => toast(er.message, 5000));
        faits.push({ n: x.n, em, ...out });
      }
      if (nouvelIndice) { et.historique.push({ indice: et.indice, date: et.date, motif: et.motifIndice || '', statut: et.statut || '', redige: et.auteur || '', verifie: et.verificateur || '', approuve: et.approbateur || '' }); et.indice = suivantIndice(et.indice); et.motifIndice = v('#rm-objet') || `Réémission de ${faits.length} calcul(s)`; et.date = aujourdhui(); enregistrer(et); }
      box.innerHTML = `<h2>${faits.length} calcul(s) réémis</h2><ul>${faits.map((f, i) => `<li>${esc(f.n.titre)} — indice <strong>${esc(f.em.indice)}</strong> <button class="petit secondaire" data-rdl="${i}">Télécharger</button></li>`).join('')}</ul>
        <div class="actions"><button class="secondaire" id="rm-f">Fermer</button><button id="rm-diff">📨 Diffuser</button></div>`;
      box.querySelectorAll('[data-rdl]').forEach(b => b.onclick = () => { const f = faits[+b.dataset.rdl]; enregistrerFichier(box, f.nom, f.bytes, 'application/pdf'); });
      box.querySelector('#rm-f').onclick = () => { Modal.close(); App.render(); };
      box.querySelector('#rm-diff').onclick = () => dialogueDiffuser(et, faits.map(f => f.n.id));
    } catch (e) { box.innerHTML = `<h2>Réémission interrompue</h2><p class="erreur">${esc(e.message)}</p><div class="actions"><button id="rm-f">Fermer</button></div>`; box.querySelector('#rm-f').onclick = () => { Modal.close(); App.render(); }; }
  };
}

/* ---------- Liste des documents émis (LDE) ---------- */
function lignesLde(et) {
  const docs = Revisions.documentsEtude(et, codeAffaire(et)), dest = et.diffusion || [], etat = Revisions.etatDiffusion(et, docs);
  return { docs, dest, etat, entetes: ['N° document', 'Type', 'Titre', 'Indice', 'Date', 'Statut', 'Rédigé', 'Vérifié', 'Approuvé', 'Visa MOE', ...dest.map(d => d.nom || d.societe)],
    lignes: docs.map((d, k) => [d.numero, Revisions.TYPES_DOC[d.type] || '', d.titre, d.indice, dateFr(d.date), d.statut || '', d.redige || '', d.verifie || '', d.approuve || '', d.avis ? `${d.avis} ${dateFr(d.avisLe)}` : '', ...etat.map(x => { const c = x.documents[k]; return c.recu ? `${c.recu.indice}${c.perime ? ' (périmé)' : ''}` : ''; })]) };
}
function ldeExcel(et) {
  const l = lignesLde(et), H = v => ({ v, s: 'head' });
  synchroniserPieces(et);
  const octets = XLSX.build([{ name: 'LDE', freeze: 3, cols: l.entetes.map((h, i) => (i === 1 ? 50 : 14)), rows: [[{ v: `Liste des documents émis — ${et.objet}`, s: 'title' }], [{ v: `${libelleAffaire(affaireDe(et.affaireId)) || ''} · ${dateFr(aujourdhui())}`, s: 'muted' }], l.entetes.map(H), ...l.lignes] }]);
  Promise.resolve(telecharger(`LDE_${sansAccents(codeAffaire(et) || et.objet).slice(0, 30)}.xlsx`, octets, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).catch(e => toast(e.message, 6000));
}
async function ldePdf(et) {
  const box = Modal.open('<h2>Liste des documents émis</h2><p>Mise en page…</p>');
  try {
    const l = lignesLde(et), numero = `${codeAffaire(et) || 'ETU'}-LDE`;
    const html = `<div class="doe-doc ndc"><h2>LISTE DES DOCUMENTS ÉMIS</h2><p class="petit">${esc(et.objet)} — état au ${dateFr(aujourdhui())}</p>
      ${tableauPdf(l.entetes.slice(0, 10), l.lignes.map(x => x.slice(0, 10)))}
      ${l.dest.length ? `<h3>Diffusion : indice reçu par destinataire</h3>${tableauPdf(['N° document', 'Ind. en vigueur', ...l.dest.map(d => d.nom || d.societe)], l.lignes.map(x => [x[0], x[3], ...x.slice(10)]))}` : ''}
      ${(et.diffusions || []).length ? `<h3>Bordereaux de transmission</h3>${tableauPdf(['N°', 'Date', 'Mode', 'Documents', 'Destinataires'], et.diffusions.map(e => [e.numero, dateFr(e.date), e.mode || '', e.documents.map(d => `${d.numero} ind. ${d.indice}`).join(', '), e.destinataires.map(id => ((l.dest.find(d => d.id === id) || {}).nom || '?')).join(', ')]))}` : ''}</div>`;
    const bytes = await pdfCartouche(et, html, 'Liste des documents émis', numero, 'LDE'), nom = `${sansAccents(numero)}_Liste_des_documents_emis.pdf`;
    const pf = et.affaireId && affaireDe(et.affaireId);
    box.innerHTML = `<h2>Liste des documents émis</h2><p><strong>${esc(nom)}</strong></p>${pf ? '<p class="petit muted">Déposée dans le chantier (catégorie « Note de calcul »), elle est reprise par le DOE en annexe C.</p>' : ''}
      <div class="actions"><button class="secondaire" id="lde-f">Fermer</button>${pf ? '<button class="secondaire" id="lde-pf">📤 Déposer dans le chantier Pipe-Fit</button>' : ''}<button id="lde-dl">Télécharger</button></div>`;
    box.querySelector('#lde-f').onclick = Modal.close;
    box.querySelector('#lde-dl').onclick = () => enregistrerFichier(box, nom, bytes, 'application/pdf');
    const b = box.querySelector('#lde-pf');
    if (b) b.onclick = async () => { b.disabled = true; try { await api('POST', '/api/pf/document', { affaireId: et.affaireId, etudeId: et.id, noteId: 'lde', nom, indice: et.indice, note: `Liste des documents émis — ${et.objet}`, base64: base64(bytes) }); b.textContent = '✓ Déposée'; } catch (e) { b.disabled = false; toast(e.message, 6000); } };
  } catch (e) { box.innerHTML = `<h2>Impossible</h2><p class="erreur">${esc(e.message)}</p>`; }
}

/* ---------- Comparaison de deux indices d'un calcul ---------- */
function dialogueComparerIndices(et, n) {
  const l = n.emissions || [];
  if (l.length < 1) return toast('Il faut au moins un indice émis.');
  const opts = [...l.map(x => [x.indice, `Indice ${x.indice} (${dateFr(x.date)})`]), ['', 'État actuel (non émis)']];
  const box = Modal.open('');
  box.classList.add('large');
  const rendu = (ia, ib) => {
    contexteEtude = et;
    const ea = l.find(x => x.indice === ia), eb = l.find(x => x.indice === ib);
    const ent = x => (x ? x.entrees : Liens.resoudre(et, n).entrees), res = x => (x ? calculIndice(n, x) : Liens.calculer(et, n));
    const A = ent(ea), B = ent(eb), ra = res(ea), rb = res(eb), schema = schemaNote(n.type, B);
    const m = Revisions.comparer(schema, A, B), mr = Revisions.comparerResultats(ra.resume || [], rb.resume || []);
    const sa = tousSchemas(ra), sb = tousSchemas(rb), lib = x => (x ? `Indice ${x.indice}` : 'Actuel');
    box.innerHTML = `<h2>⚖️ Comparer deux indices — ${esc(n.titre)}</h2>
      <div class="grille-champs"><label>De<select id="ci-a">${opts.map(([k, t]) => `<option value="${esc(k)}" ${k === ia ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label>À<select id="ci-b">${opts.map(([k, t]) => `<option value="${esc(k)}" ${k === ib ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label></div>
      <h3>Données (${m.length} différence(s))</h3>${m.length ? `<div class="defile-x"><table class="liste compact"><thead><tr><th>Rubrique</th><th>Donnée</th><th>${lib(ea)}</th><th>${lib(eb)}</th></tr></thead>${m.map(x => `<tr><td class="petit">${esc(x.rubrique || '')}</td><td>${esc(x.libelle)}</td><td class="manque">${esc(x.avant)}</td><td class="ok-texte"><strong>${esc(x.apres)}</strong></td></tr>`).join('')}</table></div>` : '<p class="petit muted">Données identiques.</p>'}
      <h3>Résultats (${mr.length} différence(s))</h3>${mr.length ? `<table class="liste compact"><thead><tr><th>Résultat</th><th>${lib(ea)}</th><th>${lib(eb)}</th></tr></thead>${mr.map(x => `<tr><td>${esc(x.libelle)}</td><td class="manque">${esc(x.avant)}</td><td class="ok-texte"><strong>${esc(x.apres)}</strong></td></tr>`).join('')}</table>` : '<p class="petit muted">Résultats identiques.</p>'}
      ${sb.map((s, k) => { const c = sa[k] ? Revisions.comparerSchemas(sa[k].svg, s.svg) : null; return `<h3>${esc(s.titre)}${c ? ` <span class="petit muted">${c.retires} élément(s) retiré(s) en rouge, ${c.ajoutes} ajouté(s) en vert</span>` : ''}</h3>
        <div class="deux-col"><div><p class="petit">${lib(ea)}</p><div class="schema-svg">${c ? c.avant : (sa[k] || {}).svg || '<p class="muted">—</p>'}</div></div><div><p class="petit">${lib(eb)}</p><div class="schema-svg">${c ? c.apres : s.svg}</div></div></div>
        ${c && (c.listeAjoutes.length || c.listeRetires.length) ? `<p class="petit">${c.listeRetires.length ? `<span class="manque">Retiré : ${esc(c.listeRetires.slice(0, 12).join(', '))}</span> ` : ''}${c.listeAjoutes.length ? `<span class="ok-texte">Ajouté : ${esc(c.listeAjoutes.slice(0, 12).join(', '))}</span>` : ''}</p>` : ''}`; }).join('')}
      <div class="actions"><button class="secondaire" id="ci-f">Fermer</button><button id="ci-pdf">📄 PDF de la comparaison</button></div>`;
    box.querySelector('#ci-a').onchange = e => rendu(e.target.value, ib);
    box.querySelector('#ci-b').onchange = e => rendu(ia, e.target.value);
    box.querySelector('#ci-f').onclick = Modal.close;
    box.querySelector('#ci-pdf').onclick = async () => {
      try {
        const { PDFDocument } = PDFLib, hC = 14 + 64 + 4 * 10 + 8;
        const html = `<div class="doe-doc ndc"><h2>COMPARAISON — ${esc(n.titre)}</h2><p class="petit">${esc(lib(ea))} et ${esc(lib(eb))} — ${dateFr(aujourdhui())}</p>
          <h3>Données</h3>${m.length ? tableauPdf(['Rubrique', 'Donnée', lib(ea), lib(eb)], m.map(x => [x.rubrique || '—', x.libelle, x.avant, x.apres])) : '<p class="petit">Identiques.</p>'}
          <h3>Résultats</h3>${mr.length ? tableauPdf(['Résultat', lib(ea), lib(eb)], mr.map(x => [x.libelle, x.avant, x.apres])) : '<p class="petit">Identiques.</p>'}</div>`;
        const base = await pdfCartouche(et, html, `Comparaison ${lib(ea)} / ${lib(eb)} — ${n.titre}`, `${Revisions.numero(codeAffaire(et), et.notes.indexOf(n) + 1)}-COMP`, 'Comparaison d\'indices');
        const doc = await PDFDocument.load(base);
        for (const [k, s] of sb.entries()) { const c = sa[k] ? Revisions.comparerSchemas(sa[k].svg, s.svg) : null; if (!c) continue; await pageSchema(doc, c.avant, `${s.titre} — ${lib(ea)} (rouge : retiré)`, hC); await pageSchema(doc, c.apres, `${s.titre} — ${lib(eb)} (vert : ajouté)`, hC); }
        enregistrerFichier(box, `Comparaison_${sansAccents(n.titre).slice(0, 30)}_${sansAccents(ia || 'actuel')}_${sansAccents(ib || 'actuel')}.pdf`, await doc.save(), 'application/pdf');
      } catch (e) { toast(e.message, 6000); }
    };
  };
  rendu(l.length >= 2 ? l[l.length - 2].indice : l[0].indice, l.length >= 2 ? l[l.length - 1].indice : '');
}
