// Génération du DOE complet en PDF (charte TECNITUB) : page de garde, sommaire paginé, sections 1 à 10, signatures,
// puis les annexes avec leur page de titre et les pièces jointes (PDF fusionnés, images mises en page),
// en-tête logo + filet bleu sur les pages du dossier, pied de page et numérotation continue « Page X / Y ».
// Les pages du dossier sont mises en page par le moteur PDF de Pipe-Fit, l'assemblage par pdf-lib.
const Doc = { cfg: () => ({ police: 'sans' }), style: () => '' }; // réglages attendus par le moteur PDF de Pipe-Fit
const AC = `<em class="ac">${A_COMPLETER}</em>`;
const val = v => (vide(v) ? AC : esc(v));
const lignes2 = rows => `<table class="t2">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table>`;
const tableau = (entetes, rows) => `<table class="tn"><thead><tr>${entetes.map(e => `<th>${esc(e)}</th>`).join('')}</tr></thead>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
const coche = b => (b ? '☒' : '☐');
const nomFichierDOE = doe => `DOE_LOT${(doe.lot || 'X').replace(/\W+/g, '')}_${(doe.discipline || '').split(/[\s/]+/)[0].normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]/g, '').slice(0, 12) || 'CVC'}_${(doe.operation || 'Operation').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)}_Ind${doe.indice || 'A'}.pdf`;
const intervenantHtml = i => (i && i.raison ? `<strong>${esc(i.raison)}</strong><br>${[i.adresse, i.interlocuteur, i.tel && `Tél. ${i.tel}`, i.mail].map(x => (vide(x) ? AC : esc(x))).join('<br>')}` : AC);

function htmlGarde(doe, logo) {
  const c = S.config;
  return `<div class="doe-doc garde"><img src="${logo}" class="garde-logo" alt="">
    <h1>DOSSIER DES OUVRAGES EXÉCUTÉS</h1><p class="sous-titre">LOT N°${esc(doe.lot || '…')} — ${esc((doe.discipline || '').toUpperCase())}</p>
    <p class="operation">${val(doe.operation)}</p><p class="adresse">${val(doe.adresse)}</p>
    ${lignes2([...TRAME.intervenants.filter(([k]) => k !== 'acoustique' || (doe.intervenants.acoustique || {}).raison).map(([k, l]) => [l, intervenantHtml(doe.intervenants[k])]),
      ['Entreprise CVC', `<strong>${esc(c.societe.raison)}</strong><br>${esc(c.societe.adresse)}<br>Tél. ${esc(c.societe.tel)}${c.societe.email ? ` · ${esc(c.societe.email)}` : ''}<br>SIRET ${esc(c.societe.siret)} · APE ${esc(c.societe.ape)} · Qualibat ${val(c.societe.qualibat)}`],
      ['Affaire BET', val(doe.affaireBet)], ['Indice CCTP', vide(doe.cctp.indice) ? AC : `${esc(doe.cctp.indice)}${doe.cctp.date ? ` du ${dateFr(doe.cctp.date)}` : ''}`],
      ['Date de réception', vide(doe.dates.reception) ? AC : dateFr(doe.dates.reception)], ['Indice DOE', `${esc(doe.indice)} — ${esc(doe.indiceLib || '')}`]])}
    <p class="confidentiel">Document confidentiel — Usage interne et maître d'ouvrage</p></div>`;
}

// Corps du DOE : une partie par section (chaque section commence sur une nouvelle page)
function sectionsHtml(doe) {
  const out = [], fin = t => `<p class="renvoi">${esc(t)}</p>`;
  const s = (cle, titre, corps) => out.push([cle, titre, `<div class="doe-doc"><h2>${esc(titre)}</h2>${corps}</div>`]);
  s('s1', '1. DOCUMENTS ADMINISTRATIFS', `<h3>1.1 Identification de l'opération</h3>${lignes2([['Désignation', val(doe.operation)], ['Adresse', val(doe.adresse)], ['Lot', `Lot n°${esc(doe.lot || '…')} — ${esc(doe.discipline)}`], ['Phase', val(doe.phase)],
    ['Date de début de chantier', vide(doe.dates.debut) ? AC : dateFr(doe.dates.debut)], ['Date de fin de travaux', vide(doe.dates.fin) ? AC : dateFr(doe.dates.fin)], ['Date de réception', vide(doe.dates.reception) ? AC : dateFr(doe.dates.reception)],
    ['Fin de GPA (1 an)', vide(doe.dates.gpa) ? AC : dateFr(doe.dates.gpa)], ['Référence CCTP', [doe.cctp.dossier && `Dossier ${doe.cctp.dossier}`, doe.cctp.indice && `indice ${doe.cctp.indice}`, doe.cctp.date && `du ${dateFr(doe.cctp.date)}`, doe.cctp.bet].filter(Boolean).map(esc).join(' — ') || AC]])}
    <h3>1.2 Phasage des travaux</h3><p class="pre">${val(doe.phasage)}</p>`);
  s('s2', '2. PLANS DE RECOLLEMENT', `<p>Les plans de recollement représentent les ouvrages tels que réellement exécutés. Ils sont fournis en formats papier, PDF et DWG / IFC (conformément au CCTP).</p>
    ${TRAME.sousPlans.map(([k, l]) => { const ps = doe.plans.filter(p => p.section === k); return ps.length ? `<h3>${k} ${esc(l)}</h3><ul>${ps.map(p => `<li>${vide(p.numero) ? AC : esc(p.numero)} — ${esc(p.designation)}${p.echelle ? ` — échelle ${esc(p.echelle)}` : ''}${p.indice ? ` — indice ${esc(p.indice)}` : ''}</li>`).join('')}</ul>` : ''; }).join('') || `<p>${AC}</p>`}
    ${fin('Plans joints en annexe A.')}`);
  s('s3', '3. FICHES TECHNIQUES DES ÉQUIPEMENTS', doe.familles.slice().sort().map(fid => {
    const f = familleDe(fid), eqs = doe.equipements.filter(e => e.famille === fid);
    const corps = !eqs.length ? `<p>${AC}</p>` : f.fiche
      ? eqs.map(e => lignes2([['Repère', val(e.repere)], ['Désignation', val(e.designation)], ['Marque / référence', vide(e.marque) && vide(e.reference) ? AC : esc([e.marque, e.reference].filter(Boolean).join(' — '))], ...f.champs.map((c, j) => [c, val((e.champs || [])[j])]), ['N° de série', val(e.serie)], ['Localisation', val(e.localisation)]])).join('<div class="sep"></div>')
      : tableau(['Repère', 'Désignation', 'Marque / référence', 'Caractéristiques', 'Qté', 'Localisation', 'N° de série'], eqs.map(e => [val(e.repere), val(e.designation), vide(e.marque) && vide(e.reference) ? AC : esc([e.marque, e.reference].filter(Boolean).join(' ')),
        f.champs.map((c, j) => ((e.champs || [])[j] ? `${esc(c)} : ${esc(e.champs[j])}` : '')).filter(Boolean).join('<br>') || '—', esc(e.quantite || ''), val(e.localisation), val(e.serie)]));
    return `<h3>${fid} ${esc(f.titre)}</h3>${corps}${fin('Fiches techniques constructeurs et notices de montage jointes en annexe B.')}`;
  }).join('') || `<p>${AC}</p>`);
  const ctl = cles => cles.map(k => `<h3>${k} ${esc(TRAME.controles[k].titre)}</h3>${tableau(['N°', 'Document / pièce', 'Présent'], (doe.controles[k] || TRAME.controles[k].items.map(l => ({ libelle: l }))).map((it, i) => [String(i + 1), esc(it.libelle), coche(it.present || (it.fichiers || []).length)]))}`).join('');
  s('s5', '5. RAPPORTS DE MISE EN SERVICE', `${ctl(controlesActifs(doe).filter(k => k[0] === '5')) || `<p>${AC}</p>`}${fin('Tous les PV signés par le technicien et le responsable de chantier sont joints en annexe F.')}`);
  s('s6', '6. ESSAIS, CONTRÔLES ET MESURES', ctl(controlesActifs(doe).filter(k => k[0] === '6')) + fin('Procès-verbaux d\'essais et rapports de contrôle joints en annexe G.'));
  s('s7', '7. MAINTENANCE ET EXPLOITATION', `<h3>7.1 Carnet de maintenance préventive</h3>${doe.maintenance.length ? tableau(['Équipement', 'Opération', 'Fréquence', 'Intervenant'], doe.maintenance.map(l => l.map(val))) : `<p>${AC}</p>`}
    <h3>7.2 Notices d'exploitation</h3>${doe.notices.length ? `<ul>${doe.notices.map(n => `<li>${esc(n.libelle)}</li>`).join('')}</ul>` : `<p>${AC}</p>`}
    <h3>7.3 Pièces de rechange recommandées</h3>${doe.pieces.length ? tableau(['Équipement', 'Pièce', 'Référence constructeur', 'Qté min.'], doe.pieces.map(l => l.map(val))) : '<p>Sans objet.</p>'}`);
  s('s8', '8. FORMATION DES EXPLOITANTS', `<h3>8.1 Programme de formation</h3>${tableau(['Module', 'Contenu', 'Durée', 'Formateur'], doe.formation.map(l => l.map(val)))}<p>Formation dispensée conformément au CCTP.</p>${ctl(['8.2'])}`);
  const rec = doe.dates.reception;
  s('s9', '9. GARANTIES ET ASSURANCES', `<h3>9.1 Garanties contractuelles</h3>${tableau(['Type', 'Durée', 'Date de début', 'Date de fin', 'Prestataire'], TRAME.garanties.map(([t, n]) => [esc(t), `${n} an${n > 1 ? 's' : ''}`, rec ? dateFr(rec) : AC, rec ? dateFr(ajouterAns(rec, n)) : AC, esc(S.config.societe.raison)]))}
    <h3>9.2 Garanties constructeurs</h3>${(() => { const eqs = doe.equipements.filter(e => doe.familles.includes(e.famille)); return eqs.length ? tableau(['Équipement', 'Marque / référence', 'N° de série', 'Durée de garantie', 'Contact SAV'], eqs.map(e => [val(e.repere || e.designation), esc([e.marque, e.reference].filter(Boolean).join(' ')) || AC, val(e.serie), val(e.garantie), val(e.sav)])) : `<p>${AC}</p>`; })()}`);
  s('s10', '10. ANNEXES', annexesDOE(doe).map(a => `<h3>Annexe ${a.lettre} — ${esc(a.titre)}</h3>${tableau(['N°', 'Document / pièce', 'Présent'], a.pieces.map((p, i) => [`${a.lettre}${String(i + 1).padStart(2, '0')}`, esc(p.fichier ? (p.fichier.nom || p.libelle) : p.libelle), coche(p.present)]))}`).join('') || '<p>Aucune annexe.</p>');
  s('signatures', 'SIGNATURES DE REMISE DU DOE', `<p class="fait">Fait à ${esc(S.config.lieu)}, le ${doe.signatures.date ? dateFr(doe.signatures.date) : '…'}</p>
    <table class="t2 signatures">${signatairesDOE(doe).map(x => `<tr><th>${esc(x)}</th><td>Nom, cachet, signature, date</td></tr>`).join('')}</table>
    <p class="fin">— FIN DU DOSSIER DES OUVRAGES EXÉCUTÉS — LOT ${esc(doe.lot || '…')} ${esc(doe.discipline)} — ${esc(doe.operation)} —</p>`);
  return out;
}
const htmlIntercalaire = (a, nonIntegres) => `<div class="doe-doc intercalaire"><p class="annexe-lettre">ANNEXE ${a.lettre}</p><p class="annexe-titre">${esc(a.titre.toUpperCase())}</p>
  <ul>${a.pieces.map((p, i) => `<li>${a.lettre}${String(i + 1).padStart(2, '0')} — ${esc(p.fichier ? p.fichier.nom || p.libelle : p.libelle)}${p.fichier && nonIntegres.has(p.fichier) ? ' (fichier numérique joint)' : !p.fichier && !p.genere ? (p.present ? ' (fourni sur support papier)' : ' — non fourni') : ''}</li>`).join('')}</ul></div>`;
function htmlReception(doe) {
  const r = receptionPF(doe.affaireId);
  return `<div class="doe-doc"><h2>PV DE RÉCEPTION ET LEVÉE DES RÉSERVES</h2><p class="petit">Repris de Pipe-Fit (chantier ${esc((PF.get('affaires', doe.affaireId) || {}).code || '')}).</p>
    ${r.pv.map(p => `<h3>${esc(p.numero || 'PV')} — ${esc(p.type === 'reception' ? 'Procès-verbal de réception' : 'Procès-verbal de levée des réserves')}</h3>${lignes2([['Date', dateFr(p.date)], ['Lieu', val(p.lieu)], ['Décision', val(p.decision)], ['Présents', val(p.presents)], ['Signataire (maître d\'ouvrage)', `${esc(p.signataireNom || '')}${p.signataireQualite ? `, ${esc(p.signataireQualite)}` : ''}`], ['Statut', `${esc(p.statut || '')}${p.signeLe ? ` le ${new Date(p.signeLe).toLocaleDateString('fr-FR')}` : ''}`]])}`).join('') || '<p>Aucun PV de réception enregistré.</p>'}
    <h3>Réserves</h3>${r.reserves.length ? tableau(['N°', 'Localisation', 'Description', 'Statut', 'Levée le'], r.reserves.map(x => [String(x.numero || ''), esc(x.localisation || ''), esc(x.description || ''), esc(x.statut || ''), x.dateLevee ? dateFr(x.dateLevee) : '—'])) : '<p>Aucune réserve.</p>'}</div>`;
}
const htmlSommaire = (entrees, doe) => `<div class="doe-doc"><h2>SOMMAIRE</h2><table class="sommaire">${entrees.map(e => `<tr class="${e.annexe ? 'annexe' : ''}"><td>${esc(e.titre)}</td><td class="pts"></td><td class="num">${e.page}</td></tr>`).join('')}</table>
  <p class="petit">DOE lot n°${esc(doe.lot || '…')} — ${esc(doe.operation)} — indice ${esc(doe.indice)}</p></div>`;

// Texte compatible avec les polices standard du PDF (WinAnsi)
const winAnsi = t => String(t).replace(/[^\x20-\x7e -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '?');

async function genererDOE(doe) {
  if (typeof PDFLib === 'undefined') return toast('Module PDF indisponible', 5000);
  const box = Modal.open(`<h2>Génération du DOE</h2><p id="gen-etape">Préparation…</p><div class="barre-prog"><span id="gen-prog" style="width:0%"></span></div>`);
  const etape = (t, p) => { box.querySelector('#gen-etape').textContent = t; if (p !== undefined) box.querySelector('#gen-prog').style.width = `${p}%`; };
  try {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const bleu = (h => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255))(/^#[0-9a-f]{6}$/i.test(S.config.couleur) ? S.config.couleur : '#1F3864');
    const logoUrl = S.config.logoFichierId ? fichierUrl({ src: 'doe', id: S.config.logoFichierId }) : 'logo-tecnitub.png';
    const opts = { numeros: false, margeHaut: 100, margeBas: 62 };
    const parties = [];
    etape('Page de garde…', 5);
    parties.push({ cle: 'garde', bytes: await PDF.depuisHTML(htmlGarde(doe, logoUrl), 'Page de garde', null, { numeros: false, margeHaut: 42, margeBas: 62 }), entete: false });
    const secs = sectionsHtml(doe);
    for (const [i, [cle, titre, html]] of secs.entries()) {
      etape(`Mise en page : ${titre}…`, 8 + i * 4);
      parties.push({ cle, titre, bytes: await PDF.depuisHTML(html, titre, null, opts), entete: true, sommaire: true });
    }
    // Annexes : page de titre, puis les pièces (PDF fusionnés, images mises en page) ; les autres formats sont listés
    const annexes = annexesDOE(doe), nonIntegres = new Set(), erreurs = [];
    for (const [ia, a] of annexes.entries()) {
      etape(`Annexe ${a.lettre} : ${a.titre}…`, 55 + ia * 5);
      a.pieces.filter(p => p.fichier && !integrable(p.fichier)).forEach(p => nonIntegres.add(p.fichier));
      parties.push({ titre: `Annexe ${a.lettre} — ${a.titre}`, bytes: await PDF.depuisHTML(htmlIntercalaire(a, nonIntegres), a.titre, null, opts), entete: true, sommaire: true, annexe: true });
      for (const p of a.pieces) {
        if (p.genere && a.lettre === 'R') { parties.push({ bytes: await PDF.depuisHTML(htmlReception(doe), 'Réception', null, opts), entete: true }); continue; }
        if (!p.fichier || nonIntegres.has(p.fichier)) continue;
        try {
          const r = await fetch(fichierUrl(p.fichier));
          if (!r.ok) throw new Error(`fichier indisponible (${r.status})`);
          const buf = new Uint8Array(await r.arrayBuffer()), type = r.headers.get('content-type') || p.fichier.mime || '';
          if (/pdf/.test(type) || /\.pdf$/i.test(p.fichier.nom || '')) parties.push({ bytes: buf, entete: false, externe: true });
          else parties.push({ image: buf, png: /png/.test(type) || /\.png$/i.test(p.fichier.nom || ''), nom: p.fichier.nom, entete: false, externe: true });
        } catch (e) { erreurs.push(`${p.fichier.nom} : ${e.message}`); }
      }
    }
    // Comptage des pages, puis sommaire paginé
    etape('Assemblage…', 85);
    for (const pt of parties) {
      if (pt.image) { pt.n = 1; continue; }
      try { pt.doc = await PDFDocument.load(pt.bytes, { ignoreEncryption: true }); pt.n = pt.doc.getPageCount(); }
      catch (e) { erreurs.push(`un PDF joint est illisible (${e.message})`); pt.n = 0; }
    }
    const construireSommaire = async nSom => {
      let page = 1 + parties[0].n + nSom;
      const entrees = [];
      parties.slice(1).forEach(pt => { if (pt.sommaire) entrees.push({ titre: pt.titre, page, annexe: pt.annexe }); page += pt.n; });
      return PDF.depuisHTML(htmlSommaire(entrees, doe), 'Sommaire', null, opts);
    };
    let somBytes = await construireSommaire(1), som = await PDFDocument.load(somBytes);
    if (som.getPageCount() > 1) { somBytes = await construireSommaire(som.getPageCount()); som = await PDFDocument.load(somBytes); }
    parties.splice(1, 0, { cle: 'sommaire', doc: som, n: som.getPageCount(), entete: true });

    const out = await PDFDocument.create(), drapeaux = [];
    for (const pt of parties) {
      if (pt.image) {
        const img = pt.png ? await out.embedPng(pt.image) : await out.embedJpg(pt.image);
        const page = out.addPage([595.28, 841.89]), k = Math.min(515 / img.width, 720 / img.height, 1);
        page.drawImage(img, { x: (595.28 - img.width * k) / 2, y: 70 + (720 - img.height * k) / 2, width: img.width * k, height: img.height * k });
        drapeaux.push(pt.entete); continue;
      }
      if (!pt.doc) continue;
      const pages = await out.copyPages(pt.doc, pt.doc.getPageIndices());
      pages.forEach(pg => { out.addPage(pg); drapeaux.push(pt.entete); });
    }
    // En-tête (logo + titre + filet) sur les pages du dossier, pied de page et numérotation continue partout
    etape('En-têtes et numérotation…', 93);
    const police = await out.embedFont(StandardFonts.Helvetica), gras = await out.embedFont(StandardFonts.HelveticaBold);
    const logoBuf = new Uint8Array(await (await fetch(logoUrl)).arrayBuffer());
    const logo = logoBuf[0] === 0x89 ? await out.embedPng(logoBuf) : await out.embedJpg(logoBuf);
    const total = out.getPageCount(), gris = rgb(0.4, 0.4, 0.4), soc = S.config.societe;
    const pied = winAnsi(`${soc.raison} — ${soc.adresse} — SIRET ${soc.siret}`), titreEntete = 'DOSSIER DES OUVRAGES EXÉCUTÉS', sousEntete = winAnsi(`Lot n°${doe.lot || '…'} — ${doe.operation || ''}`.slice(0, 80));
    out.getPages().forEach((pg, i) => {
      const { width: W, height: H } = pg.getSize();
      if (drapeaux[i]) {
        const lh = 30, lw = logo.width * lh / logo.height;
        pg.drawImage(logo, { x: 31, y: H - 24 - lh, width: lw, height: lh });
        pg.drawText(titreEntete, { x: W - 31 - gras.widthOfTextAtSize(titreEntete, 10), y: H - 36, size: 10, font: gras, color: bleu });
        pg.drawText(sousEntete, { x: W - 31 - police.widthOfTextAtSize(sousEntete, 7.5), y: H - 48, size: 7.5, font: police, color: gris });
        pg.drawLine({ start: { x: 31, y: H - 60 }, end: { x: W - 31, y: H - 60 }, thickness: 1.4, color: bleu });
      }
      const num = `Page ${i + 1} / ${total}`, wn = police.widthOfTextAtSize(num, 8);
      if (!drapeaux[i]) pg.drawRectangle({ x: W - 37 - wn, y: 14, width: wn + 12, height: 14, color: rgb(1, 1, 1), opacity: 0.85 });
      else pg.drawText(pied, { x: 31, y: 20, size: 7, font: police, color: gris, maxWidth: W - 120 });
      pg.drawText(num, { x: W - 31 - wn, y: 18, size: 8, font: police, color: gris });
    });
    out.setTitle(winAnsi(`DOE lot ${doe.lot} — ${doe.operation} — indice ${doe.indice}`)); out.setAuthor(winAnsi(soc.raison)); out.setCreator('Pipe-Fit DOE'); out.setProducer('Pipe-Fit DOE');
    const bytes = await out.save();
    etape('Terminé', 100);
    const nom = nomFichierDOE(doe);
    box.innerHTML = `<h2>DOE généré</h2><p><strong>${esc(nom)}</strong> · ${total} pages · ${(bytes.length / 1048576).toFixed(1).replace('.', ',')} Mo</p>
      ${nonIntegres.size ? `<p class="petit">Fichiers numériques à remettre avec le DOE (non intégrables au PDF) : ${[...nonIntegres].map(f => esc(f.nom)).join(', ')}.</p>` : ''}
      ${erreurs.length ? `<p class="erreur petit">Pièces non intégrées : ${erreurs.map(esc).join(' · ')}</p>` : ''}
      ${manquesDOE(doe).manques.length ? `<p class="petit">${manquesDOE(doe).manques.length} élément(s) « À compléter » figurent dans le document.</p>` : ''}
      <div class="actions"><button class="secondaire" id="gen-fermer">Fermer</button><button id="gen-dl">Télécharger le PDF</button></div>`;
    window.DERNIER_DOE = { nom, bytes, pages: total };
    box.querySelector('#gen-fermer').onclick = Modal.close;
    box.querySelector('#gen-dl').onclick = () => telecharger(nom, bytes, 'application/pdf');
  } catch (e) {
    console.error(e);
    box.innerHTML = `<h2>Génération impossible</h2><p class="erreur">${esc(e.message)}</p><div class="actions"><button id="gen-fermer">Fermer</button></div>`;
    box.querySelector('#gen-fermer').onclick = Modal.close;
  }
}
function telecharger(nom, data, type) {
  if (window.SAVE_FILE) return window.SAVE_FILE(nom, data);
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const download = telecharger; // utilisé par le moteur PDF de Pipe-Fit
