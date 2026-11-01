// Note de calcul en PDF : page de garde (identification, visa, sommaire paginé), puis un chapitre par calcul
// (données d'entrée, hypothèses et méthode, résultats, conclusions, commentaire). En-tête et pied de page sur chaque page.
// Pages mises en page par le moteur PDF de Pipe-Fit, assemblage et numérotation par pdf-lib.
const Doc = { cfg: () => ({ police: 'sans' }), style: () => '' }; // réglages attendus par le moteur PDF de Pipe-Fit
const lignes2 = rows => `<table class="t2">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table>`;
const tableauPdf = (entetes, rows, surligne = -1, total = false) => `<table class="tn"><thead><tr>${entetes.map(e => `<th>${esc(e)}</th>`).join('')}</tr></thead>
  ${rows.map((r, i) => `<tr class="${i === surligne ? 'retenu' : ''}${total && i === rows.length - 1 ? ' total' : ''}">${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
const winAnsi = t => String(t).replace(/[^\x20-\x7e -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '?');
// Lettres grecques et exposants absents des polices standard du PDF (WinAnsi)
const GREC = { 'Σζ': 'somme zeta', 'ΔP': 'Delta P', 'ΔL': 'Delta L', 'ΔT': 'Delta T', 'Δ': 'Delta ', 'ζ': 'zeta', 'λ': 'lambda', 'ρ': 'rho', 'μ': 'mu', 'σ': 'sigma', 'α': 'alpha', 'β': 'beta',
  'η': 'eta', 'π': 'pi', 'ε': 'epsilon', 'Σ': 'somme ', '√': 'racine', '≈': '~', '⁴': '^4', '⁻⁶': '^-6', '⁻': '-' };
const pourPdf = html => html.replace(/Σζ|Δ[PLT]|[ΔζλρμσαβηπεΣ√≈⁴]|⁻⁶|⁻/g, m => GREC[m]);
const sansAccents = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');

// Données d'entrée lisibles (libellés des listes, unités, tableaux de lignes)
// marques : données modifiées depuis l'indice précédent (clés), repérées « » » et en gras dans le PDF émis
function entreesHtml(type, e, marques = null) {
  const marque = k => marques && [...marques].some(m => m === k || m.startsWith(`${k}.`));
  return rubriques(type, e).map(r => {
    const simples = r.champs.filter(c => c.t !== 'lignes').map(c => {
      const v = c.t === 's' ? ((optionsDe(c, e).find(([k]) => String(k) === String(e[c.k] ?? '')) || [])[1] || '—') : e[c.k] === '' || e[c.k] === undefined ? '—' : `${valeurChamp(e[c.k])}${c.u ? ` ${c.u}` : ''}`;
      return marque(c.k) ? [`» ${c.l}`, `<strong>${esc(v)}</strong>`] : [c.l, esc(v)];
    });
    const listes = r.champs.filter(c => c.t === 'lignes').map(c => `<p class="sous">${marque(c.k) ? '» ' : ''}${esc(c.l)}${marque(c.k) ? ' (modifiée, voir le suivi des modifications)' : ''}</p>${tableauPdf(colonnesDe(c, e).map(x => x.l), (e[c.k] || []).map(l => colonnesDe(c, e).map(col => (col.t === 's' ? ((optionsDe(col, e).find(([k]) => String(k) === String(l[col.k] ?? '')) || [])[1] || '') : valeurChamp(l[col.k])))))}`).join('');
    return `${r.titre ? `<h4>${esc(r.titre)}</h4>` : ''}${simples.length ? lignes2(simples) : ''}${listes}`;
  }).join('');
}
function htmlNotePdf(et, n, i, em = null) {
  const t = Notes.TYPES[n.type], e = Liens.resoudre(et, n).entrees, r = Liens.calculer(et, n), lien = Liens.description(et, n);
  const marques = em && em.depuis ? new Set(em.modifs.map(m => m.cle)) : null;
  return `<div class="doe-doc ndc"><h2>N${i + 1} — ${esc(n.titre)}</h2><p class="petit">${esc(t.description)}</p>${lien ? `<p class="petit"><em>${esc(lien)}</em></p>` : ''}
    ${em ? suiviModifsHtml(n, em) : ''}
    <h3>1. Données d'entrée</h3>${entreesHtml(n.type, e, marques)}
    <h3>2. Hypothèses et méthode</h3><ul>${r.hypotheses.map(h => `<li>${esc(h)}</li>`).join('')}</ul>
    <h3>3. Résultats</h3>${tousSchemas(r).length ? `<p class="sous">${esc(tousSchemas(r).map(s => s.titre).join(', '))} : en fin de chapitre, chacun sur une page au format paysage.</p>` : ''}
    ${lignes2(r.resume.map(([k, v]) => [k, esc(v)]))}
    ${r.tableaux.map(x => `<p class="sous">${esc(x.titre)}</p>${tableauPdf(x.entetes, x.lignes, x.surligne, x.total)}`).join('')}
    <h3>4. Conclusions</h3><ul class="conclusions">${r.alertes.map(a => `<li class="${a.niveau}">${esc({ ok: 'Résultat', attention: 'Point d\'attention', erreur: 'Non conforme' }[a.niveau])} : ${esc(a.texte)}</li>`).join('')}</ul>
    ${(r.onglets || []).map((o, j) => `<h3>${5 + j}. ${esc(o.titre)}</h3>${o.blocs.map(bl => `${bl.titre ? `<h4>${esc(bl.titre)}</h4>` : ''}
      ${bl.items ? `<ul class="exigences">${bl.items.map(it => `<li class="${it.niveau}"><strong>${esc({ obligatoire: 'Obligatoire', conseil: 'Conseillé', info: 'Information' }[it.niveau])}</strong> : ${esc(it.texte)}${it.ref ? ` <em>(${esc(it.ref)})</em>` : ''}</li>`).join('')}</ul>` : ''}
      ${bl.liste ? `<ul>${bl.liste.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${bl.tableau ? tableauPdf(bl.tableau.entetes, bl.tableau.lignes, -1, bl.tableau.total) : ''}${(bl.texte || []).map(t => `<p class="petit">${esc(t)}</p>`).join('')}`).join('')}`).join('')}
    ${n.commentaire ? `<h3>Commentaire</h3><p class="pre">${esc(n.commentaire)}</p>` : ''}</div>`;
}
function htmlGardeNdc(et, logo, entrees) {
  const a = affaireDe(et.affaireId), c = S.config.societe;
  return `<div class="doe-doc garde ndc"><img src="${logo}" class="garde-logo" alt=""><h1>NOTE DE CALCUL</h1><p class="sous-titre">${esc(et.objet)}</p>
    ${lignes2([['Affaire', esc(libelleAffaire(a)) || '—'], ['Client / maître d\'ouvrage', esc(et.client || clientDe(a)) || '—'], ['Indice', `${esc(et.indice)} du ${dateFr(et.date)}`],
      ['Entreprise', `<strong>${esc(c.raison)}</strong><br>${esc(c.adresse)}<br>Tél. ${esc(c.tel)}${c.email ? ` · ${esc(c.email)}` : ''}`], ...(et.description ? [['Objet détaillé, références', `<span class="pre">${esc(et.description)}</span>`]] : [])])}
    <table class="tn visa"><thead><tr><th>Indice</th><th>Date</th><th>Motif</th><th>Rédigé par</th><th>Vérifié par</th></tr></thead>
      ${[...et.historique, { indice: et.indice, date: et.date, motif: et.motifIndice || (et.historique.length ? '' : 'Première émission') }].slice(-4).map((h, i, arr) => `<tr><td>${esc(h.indice)}</td><td>${dateFr(h.date)}</td><td>${esc(h.motif || '')}</td><td>${i === arr.length - 1 ? esc(et.auteur) : ''}</td><td>${i === arr.length - 1 ? esc(et.verificateur) : ''}</td></tr>`).join('')}</table>
    <h3>Sommaire</h3><table class="sommaire">${entrees.map(x => `<tr><td>${esc(x.titre)}</td><td class="num">${x.page}</td></tr>`).join('')}</table>
    <p class="petit">Calculs de pré-dimensionnement établis avec les données de référence de l'application (séries de tubes, propriétés des fluides, coefficients usuels). Les documents des fabricants et les normes applicables font foi pour l'exécution.</p></div>`;
}

async function genererNoteCalcul(et, ids) {
  if (typeof PDFLib === 'undefined') return toast('Module PDF indisponible', 5000);
  const notes = ids ? et.notes.filter(n => ids.includes(n.id)) : et.notes;
  contexteEtude = S.etudes.includes(et) ? et : null;
  if (!notes.length) return toast('Aucun calcul dans cette étude.');
  const box = Modal.open(`<h2>Note de calcul</h2><p id="gen-etape">Préparation…</p><div class="barre-prog"><span id="gen-prog" style="width:0%"></span></div>`);
  const etape = (t, p) => { box.querySelector('#gen-etape').textContent = t; box.querySelector('#gen-prog').style.width = `${p}%`; };
  try {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const couleur = /^#[0-9a-f]{6}$/i.test(S.config.couleur) ? S.config.couleur : '#1F3864', bleu = rgb(...[1, 3, 5].map(i => parseInt(couleur.slice(i, i + 2), 16) / 255));
    // Cartouche en pied de chaque page : indices de l'étude (historique + indice en cours) ; marge basse à sa hauteur
    const emissions = emissionsEtude(et), hCartouche = 14 + 64 + (Math.min(3, emissions.length) + 1) * 10 + 8;
    const opts = { numeros: false, margeHaut: 80, margeBas: Math.ceil(hCartouche / 0.75) + 10 }, parties = [];
    for (const [k, n] of notes.entries()) {
      etape(`Mise en page : ${n.titre}…`, 10 + 70 * k / notes.length);
      const num = et.notes.indexOf(n) >= 0 ? et.notes.indexOf(n) : k;
      const doc = await PDFDocument.load(await PDF.depuisHTML(pourPdf(htmlNotePdf(et, n, num)), n.titre, null, opts));
      const r = Liens.calculer(et, n);
      for (const s of tousSchemas(r)) await pageSchema(doc, s.svg, `${s.titre} — N${num + 1} — ${n.titre}`, hCartouche);
      parties.push({ n, doc, pages: doc.getPageCount() });
    }
    // Page de garde avec sommaire paginé (recalculé si elle déborde sur plusieurs pages)
    etape('Page de garde…', 85);
    const garde = async nGarde => { let page = 1 + nGarde; const entrees = parties.map(pt => { const x = { titre: `N${(et.notes.indexOf(pt.n) >= 0 ? et.notes.indexOf(pt.n) : parties.indexOf(pt)) + 1} — ${pt.n.titre}`, page }; page += pt.pages; return x; });
      return PDFDocument.load(await PDF.depuisHTML(pourPdf(htmlGardeNdc(et, 'logo-tecnitub.png', entrees)), 'Page de garde', null, opts)); };
    let g = await garde(1);
    if (g.getPageCount() > 1) g = await garde(g.getPageCount());
    const out = await PDFDocument.create();
    for (const d of [g, ...parties.map(pt => pt.doc)]) (await out.copyPages(d, d.getPageIndices())).forEach(pg => out.addPage(pg));
    etape('En-têtes et numérotation…', 93);
    const police = await out.embedFont(StandardFonts.Helvetica), gras = await out.embedFont(StandardFonts.HelveticaBold);
    const logo = await out.embedPng(await octetsDe('logo-tecnitub.png'));
    const total = out.getPageCount(), gris = rgb(0.4, 0.4, 0.4), soc = S.config.societe, a = affaireDe(et.affaireId);
    const numero = `${String((a && a.code) || 'ETU').replace(/\s+/g, '')}-NDC${notes.length === 1 && et.notes.length > 1 ? `-N${String(et.notes.indexOf(notes[0]) + 1).padStart(2, '0')}` : ''}`, courant = emissions[emissions.length - 1];
    const infos = { societe: soc.raison, adresse: soc.adresse, contact: [soc.tel && `Tél. ${soc.tel}`, soc.email].filter(Boolean).join(' · '), affaire: libelleAffaire(a) || '—', client: et.client || clientDe(a) || '—', objet: et.description ? String(et.description).split('\n')[0] : '',
      titre: notes.length === 1 && et.notes.length > 1 ? `N${et.notes.indexOf(notes[0]) + 1} — ${notes[0].titre}` : et.objet, typeDoc: `Note de calcul — ${notes.length} calcul(s)`, numero, indice: courant.indice, date: dateFr(courant.date), statut: courant.statut };
    out.getPages().forEach((pg, i) => {
      const { width: W, height: H } = pg.getSize(), lh = 22, lw = logo.width * lh / logo.height, t = winAnsi(`NOTE DE CALCUL — ${numero} — indice ${courant.indice}`);
      pg.drawImage(logo, { x: 31, y: H - 18 - lh, width: lw, height: lh });
      pg.drawText(t, { x: W - 31 - gras.widthOfTextAtSize(t, 9), y: H - 32, size: 9, font: gras, color: bleu });
      pg.drawLine({ start: { x: 31, y: H - 46 }, end: { x: W - 31, y: H - 46 }, thickness: 1.2, color: bleu });
      dessinerCartouche(pg, { police, gras, logo, bleu, gris, infos, emissions, page: i + 1, total });
    });
    out.setTitle(winAnsi(`Note de calcul — ${et.objet} — indice ${et.indice}`)); out.setAuthor(winAnsi(et.auteur || soc.raison)); out.setCreator('Pipe-Fit Études'); out.setProducer('Pipe-Fit Études');
    const bytes = await out.save();
    const nom = `NDC_${sansAccents(a && a.code) || 'ETUDE'}_${sansAccents(et.objet).slice(0, 40) || 'note'}${notes.length === 1 && et.notes.length > 1 ? `_N${et.notes.indexOf(notes[0]) + 1}` : ''}_Ind${sansAccents(et.indice) || 'A'}.pdf`;
    // Note complète de l'indice en cours : gardée pour la diffusion
    if (!ids && S.etudes.includes(et)) garderPdf(nom, bytes).then(f => { if (f) { et.pdfEtude = { indice: et.indice, date: et.date, fichier: { id: f.id, nom } }; enregistrer(et); } });
    etape('Terminé', 100);
    box.innerHTML = `<h2>Note de calcul générée</h2><p><strong>${esc(nom)}</strong> · ${total} page(s) · ${notes.length} calcul(s)</p>
      ${S.etudes.includes(et) && et.affaireId && affaireDe(et.affaireId) ? `<p class="petit muted">Le PDF peut être déposé dans les documents du chantier ${esc(libelleAffaire(affaireDe(et.affaireId)))} (catégorie « Note de calcul », reprise dans le DOE en annexe C).</p>` : ''}
      <div class="actions"><button class="secondaire" id="gen-fermer">Fermer</button>${S.etudes.includes(et) && et.affaireId && affaireDe(et.affaireId) ? '<button class="secondaire" id="gen-pf">📤 Déposer dans le chantier Pipe-Fit</button>' : ''}<button id="gen-dl">Télécharger le PDF</button></div>`;
    window.DERNIERE_NOTE = { nom, bytes, pages: total };
    box.querySelector('#gen-fermer').onclick = Modal.close;
    const bpf = box.querySelector('#gen-pf');
    if (bpf) bpf.onclick = async () => {
      bpf.disabled = true; bpf.textContent = 'Envoi…';
      try {
        const r = await api('POST', '/api/pf/document', { affaireId: et.affaireId, etudeId: et.id, nom, indice: et.indice, note: `${et.objet} — ${notes.length} calcul(s)`, base64: base64(bytes) });
        bpf.textContent = `✓ Déposé (indice ${r.indice})`; toast('Note de calcul déposée dans les documents du chantier');
      } catch (e) { bpf.disabled = false; bpf.textContent = '📤 Déposer dans le chantier Pipe-Fit'; toast(e.message, 6000); }
    };
    box.querySelector('#gen-dl').onclick = () => enregistrerFichier(box, nom, bytes, 'application/pdf');
  } catch (e) {
    console.error(e);
    box.innerHTML = `<h2>Génération impossible</h2><p class="erreur">${esc(e.message)}</p><div class="actions"><button id="gen-fermer">Fermer</button></div>`;
    box.querySelector('#gen-fermer').onclick = Modal.close;
  }
}
// Schéma sur une page A4 paysage : rendu en image haute définition (le moteur PDF met en page en portrait)
const base64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
async function svgEnPng(svg, largeur = 3200) {
  const img = new Image();
  img.src = `data:image/svg+xml;base64,${base64(new TextEncoder().encode(svg))}`;
  await img.decode();
  const cv = document.createElement('canvas'), k = largeur / img.naturalWidth;
  cv.width = largeur; cv.height = Math.round(img.naturalHeight * k);
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
  return octetsDe(cv.toDataURL('image/png'));
}
async function pageSchema(doc, svg, titre, bas = 34) {
  const { StandardFonts, rgb } = PDFLib, png = await doc.embedPng(await svgEnPng(svg)), W = 841.89, H = 595.28, pg = doc.addPage([W, H]);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold), t = winAnsi(pourPdf(titre)).slice(0, 110);
  pg.drawText(t, { x: 31, y: H - 76, size: 10, font: gras, color: rgb(0.12, 0.22, 0.39) });
  const bx = 31, by = bas, bw = W - 62, bh = H - 92 - by, k = Math.min(bw / png.width, bh / png.height);
  pg.drawImage(png, { x: bx + (bw - png.width * k) / 2, y: by + (bh - png.height * k) / 2, width: png.width * k, height: png.height * k });
}
// Octets d'une image : décodage direct d'une adresse data: (la page publiée peut interdire fetch sur data:)
async function octetsDe(url) {
  if (url.startsWith('data:')) { const bin = atob(url.slice(url.indexOf(',') + 1)), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Logo introuvable (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}
// Téléchargement avec compte rendu dans la fenêtre : enregistré, refusé, ou lien d'ouverture si le téléchargement est impossible
async function enregistrerFichier(box, nom, data, type) {
  let etat = box.querySelector('.etat-dl');
  if (!etat) { etat = document.createElement('p'); etat.className = 'etat-dl petit'; box.querySelector('.actions').before(etat); }
  etat.className = 'etat-dl petit'; etat.textContent = 'Enregistrement…';
  try {
    const r = await telecharger(nom, data, type);
    etat.textContent = r === 'refuse' ? 'Téléchargement annulé.' : 'Fichier enregistré (dossier Téléchargements, ou partage sur téléphone).';
  } catch (e) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    etat.className = 'etat-dl petit erreur';
    etat.innerHTML = `${esc(e.message || 'Téléchargement impossible ici.')} <a href="${url}" target="_blank" rel="noopener" download="${esc(nom)}">Ouvrir le PDF</a>`;
  }
}
function telecharger(nom, data, type) {
  if (window.SAVE_FILE) return window.SAVE_FILE(nom, data);
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const download = telecharger; // utilisé par le moteur PDF de Pipe-Fit

/* ---------- Émissions d'un calcul : cartouche, indices, suivi des modifications ---------- */
// Données d'un calcul décrites pour la comparaison d'un indice à l'autre (libellés, unités, listes de choix)
function schemaNote(type, e) {
  return rubriques(type, e).flatMap(r => r.champs.map(c => (c.t === 'lignes'
    ? { k: c.k, l: c.l, t: 'lignes', rubrique: r.titre, colonnes: colonnesDe(c, e).map(col => ({ k: col.k, l: col.l, u: col.u, options: col.t === 's' ? optionsDe(col, e) : null })) }
    : { k: c.k, l: c.l, u: c.u, rubrique: r.titre, options: c.t === 's' ? optionsDe(c, e) : null })));
}
// Tableau des indices et modifications de l'indice émis (en tête du calcul)
function suiviModifsHtml(n, em) {
  const toutes = [...(n.emissions || []), em];
  return `<h3>Suivi des modifications</h3>
    <table class="tn"><thead><tr><th>Ind.</th><th>Date</th><th>Objet de la modification</th><th>Statut</th><th>Rédigé</th><th>Vérifié</th><th>Approuvé</th></tr></thead>
      ${toutes.slice().reverse().map(x => `<tr${x === em ? ' class="retenu"' : ''}><td><strong>${esc(x.indice)}</strong></td><td>${dateFr(x.date)}</td><td>${esc(x.objet)}</td><td>${esc(x.statut)}</td><td>${esc(x.redige)}</td><td>${esc(x.verifie)}</td><td>${esc(x.approuve)}</td></tr>`).join('')}</table>
    ${em.depuis ? (em.modifs.length || em.modifsResultats.length ? `<p class="sous">Modifications de l'indice ${esc(em.indice)} par rapport à l'indice ${esc(em.depuis)} (données repérées « » » dans le chapitre 1)</p>
      ${em.modifs.length ? tableauPdf(['Rubrique', 'Donnée', `Indice ${em.depuis}`, `Indice ${em.indice}`], em.modifs.map(m => [m.rubrique || '—', m.libelle, m.avant, m.apres])) : ''}
      ${em.modifsResultats.length ? `<p class="sous">Résultats modifiés</p>${tableauPdf(['Résultat', `Indice ${em.depuis}`, `Indice ${em.indice}`], em.modifsResultats.map(m => [m.libelle, m.avant, m.apres]))}` : ''}`
      : `<p class="petit">Aucune donnée modifiée depuis l'indice ${esc(em.depuis)} : ${esc(em.objet)}.</p>`) : ''}
    ${(em.observationsLevees || []).length ? `<p class="sous">Observations du maître d'œuvre levées par l'indice ${esc(em.indice)}</p>${tableauPdf(['Indice visé', 'Avis', 'Observation'], em.observationsLevees.map(o => [o.indice, o.avis, o.texte]))}` : ''}`;
}
// Texte réduit à une largeur (police standard du PDF)
const ajuster = (t, font, size, max) => { let x = winAnsi(pourPdf(String(t || '').replace(/→/g, '->').replace(/[≤]/g, '<=').replace(/[≥]/g, '>='))); while (x.length > 1 && font.widthOfTextAtSize(x, size) > max) x = `${x.slice(0, -2)}…`.replace(/……$/, '…'); return winAnsi(x); };
// Cartouche en pied de chaque page : entreprise, affaire et objet, titre du document, n°, indice, date, statut, page ;
// au-dessus, les derniers indices (objet, statut, visas)
function dessinerCartouche(pg, { police, gras, logo, bleu, gris, infos, emissions, page, total }) {
  const { rgb } = PDFLib, { width: W } = pg.getSize(), x0 = 31, x1 = W - 31, l = x1 - x0, noir = rgb(0.15, 0.15, 0.15), trait = { thickness: 0.6, color: rgb(0.45, 0.45, 0.45) };
  const y0 = 14, hB = 64, hRow = 10, revs = emissions.slice(-3).reverse(), hR = (revs.length + 1) * hRow, yR = y0 + hB;
  const cadre = (x, y, w, h) => pg.drawRectangle({ x, y, width: w, height: h, borderColor: trait.color, borderWidth: trait.thickness });
  const txt = (t, x, y, size, f = police, max = 200, c = noir) => pg.drawText(ajuster(t, f, size, max), { x, y, size, font: f, color: c });
  // Indices
  const cols = [[22, 'Ind.'], [44, 'Date'], [l - 22 - 44 - 70 - 3 * 58, 'Objet de la modification'], [70, 'Statut'], [58, 'Rédigé'], [58, 'Vérifié'], [58, 'Approuvé']];
  cadre(x0, yR, l, hR);
  let x = x0;
  cols.forEach(([w, h], k) => { if (k) pg.drawLine({ start: { x, y: yR }, end: { x, y: yR + hR }, ...trait }); txt(h, x + 2, yR + hR - 7.5, 6, gras, w - 4, bleu); x += w; });
  pg.drawLine({ start: { x: x0, y: yR + hR - hRow }, end: { x: x1, y: yR + hR - hRow }, ...trait });
  revs.forEach((r, i) => {
    const y = yR + hR - hRow * (i + 2) + 2.5; let xx = x0;
    [r.indice, dateFr(r.date), r.objet, r.statut, r.redige, r.verifie, r.approuve].forEach((v, k) => { txt(v, xx + 2, y, 6, k === 0 ? gras : police, cols[k][0] - 4); xx += cols[k][0]; });
  });
  // Bloc principal
  const wG = 150, wD = 165, wM = l - wG - wD;
  cadre(x0, y0, wG, hB); cadre(x0 + wG, y0, wM, hB); cadre(x1 - wD, y0, wD, hB);
  const lh = 20, lw = Math.min(wG - 10, logo.width * lh / logo.height);
  pg.drawImage(logo, { x: x0 + 5, y: y0 + hB - lh - 5, width: lw, height: lh });
  txt(infos.societe, x0 + 5, y0 + 22, 6.5, gras, wG - 10); txt(infos.adresse, x0 + 5, y0 + 14, 5.5, police, wG - 10, gris); txt(infos.contact, x0 + 5, y0 + 6, 5.5, police, wG - 10, gris);
  const xm = x0 + wG + 5;
  txt(`Affaire : ${infos.affaire}`, xm, y0 + hB - 11, 6.5, police, wM - 10); txt(`Client : ${infos.client}`, xm, y0 + hB - 20, 6.5, police, wM - 10);
  txt(infos.objet, xm, y0 + hB - 31, 7, gras, wM - 10);
  // Titre long : police réduite plutôt que coupé
  const tt = winAnsi(pourPdf(String(infos.titre || '').replace(/→/g, '->'))), tz = [9.5, 8.5, 7.5, 6.5].find(z => gras.widthOfTextAtSize(tt, z) <= wM - 10) || 6.5;
  txt(infos.titre, xm, y0 + 12, tz, gras, wM - 10, bleu); txt(infos.typeDoc, xm, y0 + 4, 6, police, wM - 10, gris);
  const xd = x1 - wD, lig = (k, v, i, f = police, sz = 7) => { txt(k, xd + 4, y0 + hB - 10 - i * 11, 6, police, 52, gris); txt(v, xd + 56, y0 + hB - 10 - i * 11, sz, f, wD - 60); };
  lig('N° document', infos.numero, 0, gras); lig('Indice', infos.indice, 1, gras, 8.5); lig('Date', infos.date, 2); lig('Statut', infos.statut, 3, gras);
  lig('Page', `${page} / ${total}`, 4);
}

// Émission d'un calcul : PDF du calcul avec cartouche sur chaque page, suivi des modifications ; l'émission est enregistrée
function emettreNote(et, n) {
  contexteEtude = S.etudes.includes(et) ? et : null;
  const e = Liens.resoudre(et, n).entrees, r = Liens.calculer(et, n), schema = schemaNote(n.type, e), d = Revisions.derniere(n);
  const apercu = Revisions.emission(n, {}, e, r.resume, schema), rang = et.notes.indexOf(n) + 1, a = affaireDe(et.affaireId);
  const box = Modal.open(`<h2>🖋️ Émettre « ${esc(n.titre)} »</h2>
    <p class="petit muted">Le PDF du calcul porte un cartouche sur chaque page (entreprise, affaire, titre, n° ${esc(Revisions.numero(a && a.code, rang))}, indice, date, statut, visas) et le suivi des modifications depuis l'indice précédent. L'émission fige les données : les suivantes seront comparées à celle-ci.</p>
    <div class="grille-champs"><label>Indice<input id="em-ind" value="${esc(apercu.indice)}" style="width:80px"></label><label>Date<input id="em-date" type="date" value="${aujourdhui()}"></label>
      <label>Statut<select id="em-statut">${Revisions.STATUTS.map(x => `<option ${x === (d ? d.statut : 'Pour avis') ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label></div>
    <label class="champ-libre">Objet de la modification<textarea id="em-objet" rows="2">${esc(apercu.objet)}</textarea></label>
    <div class="grille-champs"><label>Rédigé par<input id="em-red" value="${esc(S.me.nom || S.me.login)}"></label><label>Vérifié par<input id="em-ver" value="${esc(et.verificateur || '')}"></label><label>Approuvé par<input id="em-app" value=""></label></div>
    ${d ? (apercu.modifs.length || apercu.modifsResultats.length ? `<details open><summary class="petit"><strong>${apercu.modifs.length} donnée(s) et ${apercu.modifsResultats.length} résultat(s) modifiés depuis l'indice ${esc(d.indice)}</strong></summary>
      <div class="defile-x"><table class="liste compact"><thead><tr><th>Donnée</th><th>Indice ${esc(d.indice)}</th><th>Maintenant</th></tr></thead>${[...apercu.modifs.map(m => [m.libelle, m.avant, m.apres]), ...apercu.modifsResultats.map(m => [`Résultat : ${m.libelle}`, m.avant, m.apres])].map(([x, y, z]) => `<tr><td>${esc(x)}</td><td>${esc(y)}</td><td><strong>${esc(z)}</strong></td></tr>`).join('')}</table></div></details>`
      : `<p class="petit avert">Aucune donnée modifiée depuis l'indice ${esc(d.indice)} : précisez l'objet de la nouvelle émission (changement de statut, visa…).</p>`) : ''}
    ${(() => { const o = Revisions.observationsOuvertes(n); return o.length ? `<fieldset><legend>Observations du maître d'œuvre à lever (${o.length})</legend>${o.map(x => `<label class="case petit"><input type="checkbox" data-lever="${esc(x.id)}" checked> <strong>${esc(x.avis)}</strong> sur l'indice ${esc(x.indice)}${x.de ? ` (${esc(x.de)})` : ''} : ${esc(x.texte)}</label>`).join('')}</fieldset>` : ''; })()}
    ${d && tousSchemas(r).length ? `<label class="case petit"><input type="checkbox" id="em-comp" ${apercu.modifs.length ? 'checked' : ''}> Joindre en annexe les schémas des indices ${esc(d.indice)} et ${esc(apercu.indice)} avec les différences colorées</label>` : ''}
    <div class="actions"><button class="secondaire" id="em-x">Annuler</button><button id="em-ok">Émettre l'indice et générer le PDF</button></div>`);
  box.querySelector('#em-x').onclick = Modal.close;
  box.querySelector('#em-ok').onclick = async () => {
    const v = id => box.querySelector(id).value.trim();
    if (!v('#em-ind')) return toast('Indiquez l\'indice.');
    if ((n.emissions || []).some(x => x.indice === v('#em-ind'))) return toast(`L'indice ${v('#em-ind')} est déjà émis : choisissez le suivant.`, 5000);
    const em = Revisions.emission(n, { indice: v('#em-ind'), date: v('#em-date') || aujourdhui(), objet: v('#em-objet'), statut: v('#em-statut'), redige: v('#em-red'), verifie: v('#em-ver'), approuve: v('#em-app') }, e, r.resume, schema);
    const leves = [...box.querySelectorAll('[data-lever]:checked')].map(c => c.dataset.lever), comp = !!(box.querySelector('#em-comp') || {}).checked;
    await genererEmission(et, n, em, box, { leves, comparaison: comp });
  };
}
// PDF d'une émission : calcul, suivi des modifications (et observations levées), schémas, comparaison des schémas avec
// l'indice précédent en annexe si demandé ; cartouche et en-tête sur chaque page
async function pdfEmission(et, n, em, { comparaison = false } = {}) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  contexteEtude = S.etudes.includes(et) ? et : contexteEtude;
  const couleur = /^#[0-9a-f]{6}$/i.test(S.config.couleur) ? S.config.couleur : '#1F3864', bleu = rgb(...[1, 3, 5].map(i => parseInt(couleur.slice(i, i + 2), 16) / 255)), gris = rgb(0.4, 0.4, 0.4);
  const rang = et.notes.indexOf(n), a = affaireDe(et.affaireId), soc = S.config.societe, emissions = [...(n.emissions || []), em];
  const hCartouche = 14 + 64 + (Math.min(3, emissions.length) + 1) * 10 + 8;
  const doc = await PDFDocument.load(await PDF.depuisHTML(pourPdf(htmlNotePdf(et, n, rang, em)), n.titre, null, { numeros: false, margeHaut: 80, margeBas: Math.ceil(hCartouche / 0.75) + 10 }));
  // Schémas en paysage, au-dessus du cartouche
  const schemas = tousSchemas(Liens.calculer(et, n));
  for (const sc of schemas) await pageSchema(doc, sc.svg, `${sc.titre} — N${rang + 1} — ${n.titre}`, hCartouche);
  // Annexe : schémas de l'indice précédent et de celui-ci, différences colorées (rouge : retiré, vert : ajouté)
  const prec = Revisions.derniere(n);
  if (comparaison && prec) {
    const anciens = tousSchemas(calculIndice(n, prec));
    for (const [k, sc] of schemas.entries()) {
      const old = anciens[k];
      if (!old) continue;
      const c = Revisions.comparerSchemas(old.svg, sc.svg);
      await pageSchema(doc, c.avant, `Annexe — ${sc.titre} : indice ${prec.indice} (en rouge : retiré à l'indice ${em.indice})`, hCartouche);
      await pageSchema(doc, c.apres, `Annexe — ${sc.titre} : indice ${em.indice} (en vert : ajouté depuis l'indice ${prec.indice})`, hCartouche);
    }
  }
  const police = await doc.embedFont(StandardFonts.Helvetica), gras = await doc.embedFont(StandardFonts.HelveticaBold), logo = await doc.embedPng(await octetsDe('logo-tecnitub.png'));
  const numero = Revisions.numero(a && a.code, rang + 1), total = doc.getPageCount();
  const infos = { societe: soc.raison, adresse: soc.adresse, contact: [soc.tel && `Tél. ${soc.tel}`, soc.email].filter(Boolean).join(' · '), affaire: libelleAffaire(a) || '—', client: et.client || clientDe(a) || '—', objet: et.objet,
    titre: `N${rang + 1} — ${n.titre}`, typeDoc: `Note de calcul — ${Notes.TYPES[n.type].titre}`, numero, indice: em.indice, date: dateFr(em.date), statut: em.statut };
  doc.getPages().forEach((pg, i) => {
    const { width: W, height: H } = pg.getSize(), lh = 22, lw = logo.width * lh / logo.height, t = winAnsi(`${numero} — indice ${em.indice}`);
    pg.drawImage(logo, { x: 31, y: H - 18 - lh, width: lw, height: lh });
    pg.drawText(t, { x: W - 31 - gras.widthOfTextAtSize(t, 9), y: H - 32, size: 9, font: gras, color: bleu });
    pg.drawLine({ start: { x: 31, y: H - 46 }, end: { x: W - 31, y: H - 46 }, thickness: 1.2, color: bleu });
    dessinerCartouche(pg, { police, gras, logo, bleu, gris, infos, emissions, page: i + 1, total });
  });
  doc.setTitle(winAnsi(`${numero} — ${n.titre} — indice ${em.indice}`)); doc.setAuthor(winAnsi(em.redige || soc.raison)); doc.setCreator('Pipe-Fit Études');
  return { bytes: await doc.save(), nom: `${sansAccents(numero)}_${sansAccents(n.titre).slice(0, 40)}_Ind${sansAccents(em.indice)}.pdf`, total, numero };
}
// Résultats d'un indice émis (données figées) : schémas et tableaux de cet indice
const calculIndice = (n, em) => { try { return Notes.calculer(n.type, Revisions.figer(em.entrees)); } catch (e) { return { schemas: [], resume: em.resultats || [], tableaux: [], alertes: [], hypotheses: [] }; } };
// PDF émis gardé avec l'étude (diffusion par e-mail, liste des documents émis)
async function garderPdf(nom, bytes) { try { return await api('POST', '/api/fichiers', { nom, base64: base64(bytes) }); } catch (e) { return null; } }
// Émission enregistrée : observations levées, données figées, PDF gardé
async function enregistrerEmission(et, n, em, bytes, nom, leves = []) {
  if (leves.length) Revisions.lever(n, leves, em.indice);
  const f = await garderPdf(nom, bytes);
  if (f) em.fichier = { id: f.id, nom };
  n.emissions = [...(n.emissions || []), em]; n.indice = em.indice; enregistrer(et);
}
async function deposerEmission(et, n, em, bytes, nom, numero) {
  const rr = await api('POST', '/api/pf/document', { affaireId: et.affaireId, etudeId: et.id, noteId: n.id, nom, indice: em.indice, note: `${numero} — ${n.titre} — ${em.statut}${em.objet ? ` — ${em.objet}` : ''}`.slice(0, 300), base64: base64(bytes) });
  em.deposeLe = aujourdhui(); enregistrer(et);
  return rr;
}
async function genererEmission(et, n, em, box, opts = {}) {
  box.innerHTML = `<h2>Émission ${esc(em.indice)}</h2><p>Mise en page…</p>`;
  try {
    // Observations levées : notées avant la mise en page (elles figurent dans le suivi des modifications)
    if ((opts.leves || []).length) em.observationsLevees = Revisions.observationsOuvertes(n).filter(o => opts.leves.includes(o.id)).map(o => ({ texte: o.texte, indice: o.indice, avis: o.avis }));
    const { bytes, nom, total, numero } = await pdfEmission(et, n, em, opts);
    await enregistrerEmission(et, n, em, bytes, nom, opts.leves || []);
    window.DERNIERE_NOTE = { nom, bytes, pages: total };
    const pf = S.etudes.includes(et) && et.affaireId && affaireDe(et.affaireId);
    box.innerHTML = `<h2>Indice ${esc(em.indice)} émis</h2><p><strong>${esc(nom)}</strong> · ${total} page(s) · ${esc(em.statut)}</p>
      ${em.depuis ? `<p class="petit">${em.modifs.length} donnée(s) et ${em.modifsResultats.length} résultat(s) modifiés depuis l'indice ${esc(em.depuis)}, listés dans le suivi des modifications${(em.observationsLevees || []).length ? ` ; ${em.observationsLevees.length} observation(s) du maître d'œuvre levée(s)` : ''}.</p>` : ''}
      <div class="actions"><button class="secondaire" id="gen-fermer">Fermer</button>${pf ? '<button class="secondaire" id="gen-pf">📤 Déposer dans le chantier Pipe-Fit</button>' : ''}<button class="secondaire" id="gen-diff">📨 Diffuser</button><button id="gen-dl">Télécharger le PDF</button></div>`;
    box.querySelector('#gen-fermer').onclick = () => { Modal.close(); App.render(); };
    box.querySelector('#gen-dl').onclick = () => enregistrerFichier(box, nom, bytes, 'application/pdf');
    box.querySelector('#gen-diff').onclick = () => dialogueDiffuser(et, [n.id]);
    const bpf = box.querySelector('#gen-pf');
    if (bpf) bpf.onclick = async () => {
      bpf.disabled = true; bpf.textContent = 'Envoi…';
      try { const rr = await deposerEmission(et, n, em, bytes, nom, numero); bpf.textContent = `✓ Déposé (indice ${rr.indice})`; }
      catch (er) { bpf.disabled = false; bpf.textContent = '📤 Déposer dans le chantier Pipe-Fit'; toast(er.message, 6000); }
    };
  } catch (e2) {
    console.error(e2);
    box.innerHTML = `<h2>Émission impossible</h2><p class="erreur">${esc(e2.message)}</p><div class="actions"><button id="gen-fermer">Fermer</button></div>`;
    box.querySelector('#gen-fermer').onclick = Modal.close;
  }
}

// Indices de l'étude pour le cartouche de la note de calcul complète : historique, puis l'indice en cours
function emissionsEtude(et) {
  const h = (et.historique || []).map(x => ({ indice: x.indice, date: x.date, objet: x.motif || '', statut: x.statut || '', redige: x.redige || '', verifie: x.verifie || '', approuve: x.approuve || '' }));
  return [...h, { indice: et.indice, date: et.date, objet: et.motifIndice || (h.length ? '' : 'Première émission'), statut: et.statut || 'Pour avis', redige: et.auteur || '', verifie: et.verificateur || '', approuve: et.approbateur || '' }];
}
