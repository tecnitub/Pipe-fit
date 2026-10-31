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
function entreesHtml(type, e) {
  return rubriques(type, e).map(r => {
    const simples = r.champs.filter(c => c.t !== 'lignes').map(c => {
      const v = c.t === 's' ? ((optionsDe(c, e).find(([k]) => String(k) === String(e[c.k] ?? '')) || [])[1] || '—') : e[c.k] === '' || e[c.k] === undefined ? '—' : `${valeurChamp(e[c.k])}${c.u ? ` ${c.u}` : ''}`;
      return [c.l, esc(v)];
    });
    const listes = r.champs.filter(c => c.t === 'lignes').map(c => `<p class="sous">${esc(c.l)}</p>${tableauPdf(colonnesDe(c, e).map(x => x.l), (e[c.k] || []).map(l => colonnesDe(c, e).map(col => (col.t === 's' ? ((optionsDe(col, e).find(([k]) => String(k) === String(l[col.k] ?? '')) || [])[1] || '') : valeurChamp(l[col.k])))))}`).join('');
    return `${r.titre ? `<h4>${esc(r.titre)}</h4>` : ''}${simples.length ? lignes2(simples) : ''}${listes}`;
  }).join('');
}
function htmlNotePdf(et, n, i) {
  const t = Notes.TYPES[n.type], e = Liens.resoudre(et, n).entrees, r = Liens.calculer(et, n), lien = Liens.description(et, n);
  return `<div class="doe-doc ndc"><h2>N${i + 1} — ${esc(n.titre)}</h2><p class="petit">${esc(t.description)}</p>${lien ? `<p class="petit"><em>${esc(lien)}</em></p>` : ''}
    <h3>1. Données d'entrée</h3>${entreesHtml(n.type, e)}
    <h3>2. Hypothèses et méthode</h3><ul>${r.hypotheses.map(h => `<li>${esc(h)}</li>`).join('')}</ul>
    <h3>3. Résultats</h3>${r.schema ? `<p class="sous">${esc(r.titreSchema || 'Schéma de principe')} : en fin de chapitre, sur une page au format paysage.</p>` : ''}
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
    const opts = { numeros: false, margeHaut: 96, margeBas: 60 }, parties = [];
    for (const [k, n] of notes.entries()) {
      etape(`Mise en page : ${n.titre}…`, 10 + 70 * k / notes.length);
      const num = et.notes.indexOf(n) >= 0 ? et.notes.indexOf(n) : k;
      const doc = await PDFDocument.load(await PDF.depuisHTML(pourPdf(htmlNotePdf(et, n, num)), n.titre, null, opts));
      const r = Liens.calculer(et, n);
      if (r.schema) await pageSchema(doc, r.schema, `N${num + 1} — ${n.titre}`);
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
    const titre = 'NOTE DE CALCUL', sous = winAnsi(pourPdf([a && a.code, et.objet, `indice ${et.indice}`].filter(Boolean).join(' — ')).slice(0, 95)), pied = winAnsi(`${soc.raison} — ${soc.adresse}`);
    out.getPages().forEach((pg, i) => {
      const { width: W, height: H } = pg.getSize(), lh = 28, lw = logo.width * lh / logo.height;
      pg.drawImage(logo, { x: 31, y: H - 22 - lh, width: lw, height: lh });
      pg.drawText(titre, { x: W - 31 - gras.widthOfTextAtSize(titre, 10), y: H - 34, size: 10, font: gras, color: bleu });
      pg.drawText(sous, { x: W - 31 - police.widthOfTextAtSize(sous, 7.5), y: H - 46, size: 7.5, font: police, color: gris });
      pg.drawLine({ start: { x: 31, y: H - 58 }, end: { x: W - 31, y: H - 58 }, thickness: 1.4, color: bleu });
      const num = `Page ${i + 1} / ${total}`;
      pg.drawText(pied, { x: 31, y: 20, size: 7, font: police, color: gris, maxWidth: W - 120 });
      pg.drawText(num, { x: W - 31 - police.widthOfTextAtSize(num, 8), y: 18, size: 8, font: police, color: gris });
    });
    out.setTitle(winAnsi(`Note de calcul — ${et.objet} — indice ${et.indice}`)); out.setAuthor(winAnsi(et.auteur || soc.raison)); out.setCreator('Pipe-Fit Études'); out.setProducer('Pipe-Fit Études');
    const bytes = await out.save();
    const nom = `NDC_${sansAccents(a && a.code) || 'ETUDE'}_${sansAccents(et.objet).slice(0, 40) || 'note'}${notes.length === 1 && et.notes.length > 1 ? `_N${et.notes.indexOf(notes[0]) + 1}` : ''}_Ind${sansAccents(et.indice) || 'A'}.pdf`;
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
async function pageSchema(doc, svg, titre) {
  const { StandardFonts, rgb } = PDFLib, png = await doc.embedPng(await svgEnPng(svg)), W = 841.89, H = 595.28, pg = doc.addPage([W, H]);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold), t = winAnsi(pourPdf(`Schéma de principe — ${titre}`)).slice(0, 110);
  pg.drawText(t, { x: 31, y: H - 76, size: 10, font: gras, color: rgb(0.12, 0.22, 0.39) });
  const bx = 31, by = 34, bw = W - 62, bh = H - 92 - by, k = Math.min(bw / png.width, bh / png.height);
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
