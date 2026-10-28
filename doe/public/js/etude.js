// Étude d'exécution et CCTP : le dossier d'un chantier commence par l'étude (CCTP lu, équipements repérés et numérotés,
// fiches techniques soumises au visa du maître d'œuvre / BET) et devient le DOE une fois les travaux terminés ; il ne reste
// alors que les attestations, PV et essais à joindre.
//   - CCTP : chargé depuis les documents du chantier dans Pipe-Fit (catégorie « CCTP ») ou envoyé ici, lu sur l'appareil
//     (pdf.js) : références du lot, articles, équipements à mettre en place (repères, quantités, prescriptions) ;
//   - contrôle article par article : chaque article d'équipement doit avoir son équipement dans le dossier, les autres sont
//     vérifiés ou déclarés « non concernés » ;
//   - visas : chaque fiche technique est à soumettre, soumise, visée (avec ou sans observations) ou refusée ; bordereau
//     d'envoi en PDF avec les fiches jointes.
const VISAS = ['À soumettre', 'Soumise', 'Visée', 'Visée avec observations', 'Refusée'];
const viseeOk = f => ['Visée', 'Visée avec observations'].includes(f.visa);
const enEtude = doe => doe.statut === 'Étude' || !!doe.etude;
const classeVisa = v => (v === 'Refusée' ? 'refus' : ['Visée', 'Visée avec observations'].includes(v) ? 'ok' : v === 'Soumise' ? 'pf' : '');
const aujourdhuiIso = () => new Date().toISOString().slice(0, 10);
const ESSAIS_CCTP = /essai|mise en service|equilibr|epreuve|\bcontroles?\b|mesures?\b|desenfum/;
const normE = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function fichierEnFile(f) {
  const r = await fetch(fichierUrl(f));
  if (!r.ok) throw new Error(`Fichier indisponible (${r.status})`);
  return new File([await r.blob()], f.nom || 'cctp.pdf', { type: f.mime || 'application/pdf' });
}

// Lecture du CCTP et pré-remplissage des champs vides ; renvoie { n (champs remplis), lu }
async function lireCctp(doe, progression = () => {}) {
  const f = doe.cctp.fichier;
  if (!f) throw new Error('Aucun CCTP chargé');
  const { lignes, pages } = await PdfLecture.lire(await fichierEnFile(f), progression, { pagesMax: 200, ocr: false });
  if (lignes.join('').replace(/\s/g, '').length < 300) throw new Error('Ce CCTP ne contient pas de texte lisible (document scanné) : demandez la version PDF d\'origine au maître d\'œuvre.');
  const r = CctpLecture.analyser(lignes);
  doe.cctpLu = { le: new Date().toISOString(), nom: f.nom, pages, refs: { lot: r.lot, lotLibelle: r.lotLibelle, indice: r.indice, date: r.date, dossier: r.dossier, bet: r.bet, moa: r.moa, moe: r.moe, operation: r.operation },
    articles: r.articles, equipements: r.equipements };
  let n = 0;
  const si = (o, k, v) => { if (v && vide(o[k])) { o[k] = v; n++; } };
  si(doe, 'lot', r.lot); si(doe.cctp, 'indice', r.indice); si(doe.cctp, 'date', r.date); si(doe.cctp, 'dossier', r.dossier); si(doe, 'affaireBet', r.dossier); si(doe.cctp, 'bet', r.bet);
  if (r.bet && !(doe.intervenants.bet && doe.intervenants.bet.raison)) { doe.intervenants.bet = { ...(doe.intervenants.bet || {}), raison: r.bet }; n++; }
  if (r.lotLibelle && (vide(doe.discipline) || doe.discipline === (S.config.disciplineDefaut || 'GÉNIE CLIMATIQUE / PLOMBERIE'))) { doe.discipline = r.lotLibelle.toUpperCase(); n++; }
  return { n, lu: doe.cctpLu };
}

// Équipements du CCTP pas encore dans le dossier (même article et même repère, ou même article sans repère)
function equipementsCctpManquants(doe) {
  return ((doe.cctpLu || {}).equipements || []).filter(x => !doe.equipements.some(e => e.refCctp === x.article && (x.repere ? e.repere === x.repere || e.repereCctp === x.repere : true)));
}
function ajouterEquipementsCctp(doe) {
  const nouveaux = equipementsCctpManquants(doe);
  nouveaux.forEach(x => {
    doe.equipements.push({ id: uidD(), famille: x.famille, repere: x.repere, repereCctp: x.repere, designation: x.designation, marque: '', reference: '', serie: '', quantite: x.quantite > 1 ? String(x.quantite) : '',
      localisation: '', champs: [], garantie: '', sav: '', refCctp: x.article, prescrit: x.prescrit, caract: x.caract, origines: [`CCTP art. ${x.article}`] });
    if (!doe.familles.includes(x.famille)) doe.familles.push(x.famille);
  });
  return nouveaux.length;
}

// Suivi d'un article du CCTP : équipement prévu, essai (sections 5 et 6), ou à vérifier ; décision manuelle prioritaire
function suiviArticle(doe, art) {
  const decision = (doe.cctpSuivi || {})[art.num];
  if (decision === 'non concerné') return { etat: 'non concerné', classe: '', texte: 'Non concerné' };
  const eqCctp = ((doe.cctpLu || {}).equipements || []).filter(x => x.article === art.num);
  if (eqCctp.length) {
    const eqs = doe.equipements.filter(e => e.refCctp === art.num);
    if (!eqs.length) return { etat: 'manquant', classe: 'refus', texte: 'Équipement absent du dossier' };
    const sansFiche = eqs.filter(e => !doe.fiches.some(f => (f.equipements || []).includes(e.id) || (f.refCctp && f.refCctp === art.num)));
    return { etat: 'ok', classe: sansFiche.length ? '' : 'ok', texte: `${eqs.map(e => e.repere || e.designation).join(', ')}${sansFiche.length ? ' · fiche à joindre' : ' · fiche jointe'}` };
  }
  if (decision === 'vérifié') return { etat: 'vérifié', classe: 'ok', texte: 'Vérifié' };
  if (ESSAIS_CCTP.test(normE(art.titre))) return { etat: 'essais', classe: 'pf', texte: 'Essais / mise en service : sections 5 et 6' };
  return { etat: 'à vérifier', classe: '', texte: 'À vérifier' };
}

// Ce qui reste à faire pour le CCTP et l'étude (appelé par manquesDOE)
function manquesEtude(doe, verif) {
  if (!doe.sansCctp) {
    verif('cctp', !!doe.cctpLu, 'Charger et lire le CCTP du chantier (ou cocher « pas de CCTP »)');
    ((doe.cctpLu || {}).articles || []).forEach(a => { const s = suiviArticle(doe, a); if (s.etat === 'manquant') verif('cctp', false, `Art. ${a.num} ${a.titre} : équipement absent du dossier`); });
  }
  if (!enEtude(doe) && !doe.fiches.some(f => f.visa)) return;
  doe.fiches.forEach(f => verif('etude', viseeOk(f), `Fiche « ${f.designation} » : ${f.visa ? f.visa.toLowerCase() : 'à soumettre'}${f.visa === 'Refusée' ? ' — nouvelle fiche à fournir' : ''}`));
  doe.equipements.filter(e => doe.familles.includes(e.famille) && e.famille !== '3.8').forEach(e => verif('etude', doe.fiches.some(f => (f.equipements || []).includes(e.id)), `${e.repere || e.designation} : fiche technique à joindre`));
}

// Bordereau d'envoi des fiches techniques pour visa (PDF), suivi des fiches jointes ; les fiches passent « Soumise »
async function bordereauVisa(doe, fiches) {
  const a = PF.get('affaires', doe.affaireId) || {}, moe = doe.intervenants.moe || {}, bet = doe.intervenants.bet || {};
  const reps = f => (f.equipements || []).map(id => (doe.equipements.find(e => e.id === id) || {}).repere).filter(Boolean).join(', ');
  const html = `<div class="doe-doc"><h2>Bordereau de transmission — fiches techniques pour visa</h2>
    <p><strong>${esc(doe.operation || a.nom || '')}</strong><br>Lot n° ${esc(doe.lot || '…')} — ${esc(doe.discipline || '')}${doe.cctp.dossier ? `<br>Affaire ${esc(doe.cctp.dossier)}` : ''}</p>
    <p>De : ${esc(S.config.societe.raison)}<br>À : ${esc([moe.raison, bet.raison].filter(Boolean).join(' / ') || 'Maître d\'œuvre / BET')}<br>Date d'envoi : ${dateFr(aujourdhuiIso())}</p>
    <table><tr><th>N°</th><th>Repère(s)</th><th>Désignation</th><th>Art. CCTP</th><th>Indice</th><th>Visa (VISA / VAO / REFUS)</th></tr>
    ${fiches.map((f, i) => `<tr><td>${i + 1}</td><td>${esc(reps(f))}</td><td>${esc(f.designation)}</td><td>${esc(f.refCctp || [...new Set((f.equipements || []).map(id => (doe.equipements.find(e => e.id === id) || {}).refCctp).filter(Boolean))].join(', '))}</td><td>${esc(f.indice || 'A')}</td><td></td></tr>`).join('')}</table>
    <p>Merci de nous retourner ce bordereau visé (VISA, VAO : visa avec observations, REFUS) dans les délais prévus au marché.</p></div>`;
  const pdfBordereau = await PDF.depuisHTML(html, 'Bordereau de transmission', null, { numeros: false });
  const { PDFDocument } = PDFLib, out = await PDFDocument.create(), ajoute = async bytes => { const d = await PDFDocument.load(bytes, { ignoreEncryption: true }); (await out.copyPages(d, d.getPageIndices())).forEach(p => out.addPage(p)); };
  await ajoute(pdfBordereau);
  const nonJointes = [];
  for (const f of fiches) {
    try { const r = await fetch(fichierUrl(f.fichier)); if (!r.ok || !/pdf/i.test(`${r.headers.get('content-type')} ${f.fichier.nom}`)) throw new Error(); await ajoute(new Uint8Array(await r.arrayBuffer())); }
    catch (e) { nonJointes.push(f.designation); }
  }
  telecharger(`Bordereau visa ${a.code || ''} lot ${doe.lot || ''} ${aujourdhuiIso()}.pdf`.replace(/\s+/g, ' '), await out.save(), 'application/pdf');
  fiches.forEach(f => { if (!f.visa || f.visa === 'À soumettre' || f.visa === 'Refusée') { f.visa = 'Soumise'; f.envoi = aujourdhuiIso(); } });
  return nonJointes;
}

/* ---------- Section : CCTP ---------- */
SECTIONS.cctp = {
  html: doe => {
    const lu = doe.cctpLu, f = doe.cctp.fichier, manquants = equipementsCctpManquants(doe);
    const suivis = lu ? lu.articles.map(a => ({ a, s: suiviArticle(doe, a) })) : [];
    const compte = e => suivis.filter(x => x.s.etat === e).length;
    return `<h2>CCTP : lecture et contrôle</h2>
    <p class="muted">Le CCTP du chantier remplit une partie du dossier (lot, indice, BET, n° d'affaire), donne la liste des équipements à mettre en place avec leurs repères, et sert de liste de contrôle pour ne rien oublier.</p>
    <div class="actions-ligne">${f ? `<span>${lienFichier(f)}</span>` : '<span class="manque">Aucun CCTP</span>'}
      <button id="cctp-charger" class="${f ? 'secondaire' : ''}">${f ? 'Remplacer le CCTP' : 'Charger le CCTP (PDF)'}</button>
      ${f ? `<button class="secondaire" id="cctp-lire">${lu ? '🔄 Relire le CCTP' : '📖 Lire le CCTP'}</button>` : ''}
      ${window.CCTP_EXEMPLE && !f ? '<button class="secondaire" id="cctp-exemple">CCTP d\'exemple (démo)</button>' : ''}
      <label class="case"><input type="checkbox" data-ch="sansCctp" data-rendu ${doe.sansCctp ? 'checked' : ''}> Pas de CCTP pour ce chantier</label></div>
    <p class="muted petit">Astuce : déposez le CCTP dans les documents du chantier sur Pipe-Fit (catégorie « CCTP ») : il est repris ici avec « 🔄 Reprendre depuis Pipe-Fit ».</p>
    ${lu ? `<p class="petit">Lu le ${dateFr(lu.le)} · ${lu.pages} page(s) · ${lu.articles.length} article(s) · ${lu.equipements.length} équipement(s) repéré(s)</p>
      <h3>Références lues</h3><table class="liste"><tr><th>Lot</th><th>Intitulé</th><th>Indice</th><th>Date</th><th>N° d'affaire</th><th>BET</th><th>Maître d'ouvrage</th></tr>
      <tr><td>${esc(lu.refs.lot || '—')}</td><td>${esc(lu.refs.lotLibelle || '—')}</td><td>${esc(lu.refs.indice || '—')}</td><td>${lu.refs.date ? dateFr(lu.refs.date) : '—'}</td><td>${esc(lu.refs.dossier || '—')}</td><td>${esc(lu.refs.bet || '—')}</td><td>${esc(lu.refs.moa || '—')}</td></tr></table>
      <p class="muted petit">Reportées dans la page de garde et la section 1 quand les champs étaient vides.</p>
      <h3>Équipements à mettre en place <span class="compte">${lu.equipements.length}</span></h3>
      <div class="actions-ligne">${manquants.length ? `<button id="cctp-eq">Créer les ${manquants.length} équipement(s) manquant(s)</button>` : '<span class="badge ok">Tous les équipements du CCTP sont dans le dossier</span>'}
        <button class="secondaire" id="cctp-num">Numéroter les équipements sans repère</button></div>
      <table class="liste"><tr><th>Art.</th><th>Repère</th><th>Désignation</th><th>Qté</th><th>Famille</th><th>Prescription CCTP</th><th>Dans le dossier</th></tr>
      ${lu.equipements.map(x => { const ok = !manquants.includes(x); return `<tr><td>${esc(x.article)}</td><td>${esc(x.repere || '—')}</td><td>${esc(x.designation)}</td><td>${x.quantite}</td><td>${esc(x.famille)}</td>
        <td class="petit">${esc([x.prescrit, x.caract].filter(Boolean).join(' · '))}</td><td>${ok ? '<span class="badge ok">✓</span>' : '<span class="badge refus">à créer</span>'}</td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Aucun équipement reconnu dans les titres des articles.</td></tr>'}</table>
      <h3>Contrôle article par article</h3>
      <p class="petit"><span class="badge refus">${compte('manquant')} manquant(s)</span> <span class="badge">${compte('à vérifier')} à vérifier</span> <span class="badge pf">${compte('essais')} essais</span> <span class="badge ok">${compte('ok') + compte('vérifié')} couvert(s)</span> <span class="badge">${compte('non concerné')} non concerné(s)</span></p>
      <table class="liste"><tr><th>Art.</th><th>Titre</th><th>Suivi</th><th>Décision</th></tr>
      ${suivis.map(({ a, s }) => `<tr><td>${esc(a.num)}</td><td>${esc(a.titre)}</td><td><span class="badge ${s.classe}">${esc(s.texte)}</span></td>
        <td><select data-suivi="${esc(a.num)}"><option value="">—</option>${['vérifié', 'non concerné'].map(v => `<option ${(doe.cctpSuivi || {})[a.num] === v ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`).join('')}</table>` : ''}`;
  },
  bind: (root, doe) => {
    const lire = async () => {
      const b = root.querySelector('#cctp-lire') || root.querySelector('#cctp-charger');
      if (b) { b.disabled = true; b.textContent = 'Lecture du CCTP…'; }
      try { const { n, lu } = await lireCctp(doe, p => { if (b) b.textContent = `Lecture du CCTP… ${Math.round(p * 100)} %`; }); enregistrer(doe); App.render(); toast(`CCTP lu : ${lu.articles.length} article(s), ${lu.equipements.length} équipement(s)${n ? `, ${n} champ(s) rempli(s)` : ''}`, 5000); }
      catch (e) { toast(e.message, 7000); App.render(); }
    };
    const on = (s, fn) => { const el = root.querySelector(s); if (el) el.onclick = fn; };
    on('#cctp-charger', async () => { const [f] = await choisirFichiers(false, '.pdf'); if (!f) return; doe.cctp.fichier = f; enregistrer(doe); await lire(); });
    on('#cctp-exemple', async () => { try { doe.cctp.fichier = await window.CCTP_EXEMPLE(); enregistrer(doe); await lire(); } catch (e) { toast(e.message, 6000); } });
    on('#cctp-lire', lire);
    on('#cctp-eq', () => { const n = ajouterEquipementsCctp(doe); enregistrer(doe); App.render(); toast(`${n} équipement(s) créé(s) dans la section 3 (repères du CCTP repris)`); });
    on('#cctp-num', () => { const n = CctpLecture.numeroter(doe.equipements); enregistrer(doe); App.render(); toast(n ? `${n} repère(s) attribué(s)` : 'Tous les équipements ont déjà un repère'); });
    root.querySelectorAll('[data-suivi]').forEach(s => s.onchange = () => { doe.cctpSuivi = { ...(doe.cctpSuivi || {}), [s.dataset.suivi]: s.value }; if (!s.value) delete doe.cctpSuivi[s.dataset.suivi]; enregistrer(doe); App.render(); });
  },
};

/* ---------- Section : étude, fiches techniques et visas ---------- */
SECTIONS.etude = {
  html: doe => {
    const eqs = doe.equipements.filter(e => doe.familles.includes(e.famille) || e.refCctp), fiches = doe.fiches;
    const nb = v => fiches.filter(f => (f.visa || 'À soumettre') === v).length;
    const reps = f => (f.equipements || []).map(id => (doe.equipements.find(e => e.id === id) || {}).repere || '').filter(Boolean).join(', ');
    return `<h2>Étude : fiches techniques et visas</h2>
    ${doe.statut === 'Étude' ? `<div class="actions-ligne"><span class="badge pf">Dossier en phase d'étude</span><span class="espace"></span><button id="etude-doe">Travaux terminés : passer en DOE</button></div>`
      : enEtude(doe) ? '<p class="petit"><span class="badge ok">Étude terminée</span> Le dossier est passé en DOE : les fiches visées figurent en annexe B.</p>'
        : '<div class="actions-ligne"><span class="muted">Suivez ici les visas des fiches techniques (étude d\'exécution).</span><button class="secondaire" id="etude-activer">Suivre les visas</button></div>'}
    <p class="muted">Chaque équipement repéré reçoit sa fiche technique, soumise au visa du maître d'œuvre / BET. Une fois les fiches visées, le DOE est rempli : il ne restera que les attestations, PV et essais.</p>
    <p class="petit">${VISAS.map(v => `<span class="badge ${classeVisa(v)}">${nb(v)} ${v.toLowerCase()}</span>`).join(' ')}</p>
    <h3>Équipements et fiches techniques <span class="compte">${eqs.length}</span></h3>
    ${eqs.length ? `<table class="liste"><tr><th>Repère</th><th>Équipement</th><th>Art. CCTP</th><th>Fiche(s)</th><th></th></tr>
      ${eqs.map(e => { const fs = fiches.filter(f => (f.equipements || []).includes(e.id)); const autres = fiches.filter(f => !(f.equipements || []).includes(e.id));
        return `<tr><td><strong>${esc(e.repere || '—')}</strong></td><td>${esc(e.designation || '')}${e.prescrit ? `<div class="muted petit">${esc(e.prescrit)}</div>` : ''}</td><td>${esc(e.refCctp || '')}</td>
          <td>${fs.map(f => `<div>${lienFichier(f.fichier)} <span class="badge ${classeVisa(f.visa)}">${esc(f.visa || 'À soumettre')}</span></div>`).join('') || '<span class="manque">aucune</span>'}</td>
          <td class="petit"><button class="secondaire petit" data-fiche-eq="${e.id}">Joindre la fiche</button>${autres.length ? `<select data-lier="${e.id}"><option value="">Lier une fiche…</option>${autres.map(f => `<option value="${f.id}">${esc(f.designation)}</option>`).join('')}</select>` : ''}</td></tr>`; }).join('')}</table>`
      : '<p class="muted">Aucun équipement : lisez le CCTP (créer les équipements), ou importez le matériel du chantier en section 3.</p>'}
    <h3>Fiches techniques <span class="compte">${fiches.length}</span></h3>
    ${fiches.length ? `<table class="edit"><tr><th></th><th>Fiche</th><th>Désignation</th><th>Repères</th><th>Indice</th><th>Visa</th><th>Envoyée le</th><th>Visée le</th><th>Observations</th></tr>
      ${fiches.map((f, i) => `<tr><td><input type="checkbox" data-choix="${i}" ${!f.visa || f.visa === 'À soumettre' ? 'checked' : ''} aria-label="Joindre au bordereau"></td><td>${lienFichier(f.fichier)}</td>
        <td><input data-ch="fiches.${i}.designation" value="${esc(f.designation)}"></td><td class="petit">${esc(reps(f))}</td><td><input data-ch="fiches.${i}.indice" value="${esc(f.indice || 'A')}" style="width:44px"></td>
        <td><select data-ch="fiches.${i}.visa" data-rendu style="min-width:150px">${VISAS.map(v => `<option ${(f.visa || 'À soumettre') === v ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td><input type="date" data-ch="fiches.${i}.envoi" value="${esc(f.envoi || '')}"></td><td><input type="date" data-ch="fiches.${i}.dateVisa" value="${esc(f.dateVisa || '')}"></td>
        <td><input data-ch="fiches.${i}.obs" value="${esc(f.obs || '')}" placeholder="VAO, motif du refus…"></td></tr>`).join('')}</table>
      <div class="actions-ligne"><button id="bordereau">📨 Bordereau d'envoi pour visa (PDF, fiches jointes)</button><span class="muted petit">Fiches cochées ; elles passent « Soumise » à la date du jour.</span></div>`
      : '<p class="muted">Aucune fiche technique.</p>'}`;
  },
  bind: (root, doe) => {
    const on = (s, fn) => { const el = root.querySelector(s); if (el) el.onclick = fn; };
    on('#etude-activer', () => { doe.etude = true; enregistrer(doe); App.render(); });
    on('#etude-doe', async () => { if (!await confirmer('Passer le dossier en DOE ? L\'étude reste consultable ici.', 'Passer en DOE')) return; doe.statut = 'En cours'; doe.etude = true; enregistrer(doe); App.render(); });
    root.querySelectorAll('[data-fiche-eq]').forEach(b => b.onclick = async () => {
      const e = doe.equipements.find(x => x.id === b.dataset.ficheEq), fs = await choisirFichiers(true, '.pdf,.jpg,.jpeg,.png');
      fs.forEach(f => doe.fiches.push({ id: uidD(), famille: e.famille, designation: `${e.repere ? `${e.repere} — ` : ''}${f.nom.replace(/\.[a-z0-9]+$/i, '')}`, fichier: f, visa: 'À soumettre', indice: 'A', equipements: [e.id], refCctp: e.refCctp || '' }));
      if (fs.length) { enregistrer(doe); App.render(); }
    });
    root.querySelectorAll('[data-lier]').forEach(s => s.onchange = () => { const f = doe.fiches.find(x => x.id === s.value); if (!f) return; f.equipements = [...new Set([...(f.equipements || []), s.dataset.lier])]; if (!f.visa) f.visa = 'À soumettre'; enregistrer(doe); App.render(); });
    root.querySelectorAll('[data-ch$=".visa"]').forEach(s => s.addEventListener('change', () => { const f = doe.fiches[+s.dataset.ch.split('.')[1]]; if (viseeOk(f) && !f.dateVisa) { f.dateVisa = aujourdhuiIso(); enregistrer(doe); App.render(); } }));
    on('#bordereau', async () => {
      const choix = [...root.querySelectorAll('[data-choix]:checked')].map(c => doe.fiches[+c.dataset.choix]);
      if (!choix.length) return toast('Cochez les fiches à envoyer.');
      try { const nj = await bordereauVisa(doe, choix); enregistrer(doe); App.render(); toast(`Bordereau de ${choix.length} fiche(s) prêt${nj.length ? ` (non jointes au PDF : ${nj.join(', ')})` : ''}`, 6000); }
      catch (e) { toast(`Bordereau impossible : ${e.message}`, 6000); }
    });
  },
};

// Création du dossier en phase d'étude : CCTP de Pipe-Fit lu tout de suite s'il est là
async function creerEtude(affaireId) {
  const doe = { ...doeVide(affaireId, S.config), id: uidD(), statut: 'Étude', etude: true };
  const n = prefillDepuisPF(doe);
  let r = await api('PUT', `/api/does/${doe.id}`, { data: doe });
  S.does.unshift(r);
  if (r.cctp.fichier) {
    toast('Lecture du CCTP du chantier…', 2500);
    try { await lireCctp(r); ajouterEquipementsCctp(r); r = Object.assign(r, await api('PUT', `/api/does/${r.id}`, { data: r, version: r._v })); toast(`Étude créée : CCTP lu (${r.cctpLu.equipements.length} équipement(s)), ${n} information(s) reprises du chantier`, 5000); }
    catch (e) { toast(`Étude créée ; CCTP non lu : ${e.message}`, 6000); }
  } else toast(`Étude créée : ${n} information(s) reprises du chantier. Chargez le CCTP pour la compléter.`, 5000);
  location.hash = `#/doe/${r.id}/cctp`;
}

// Résumé de l'étude et du dossier pour la fiche chantier du CRM (démonstration : transmis à la page du CRM à chaque
// enregistrement) : avancement, CCTP, équipements repérés, fiches techniques et leurs visas
function resumeEtude(doe) {
  const m = manquesDOE(doe), lu = doe.cctpLu, visas = {};
  doe.fiches.forEach(f => { const v = f.visa || 'À soumettre'; visas[v] = (visas[v] || 0) + 1; });
  const ficheDe = e => doe.fiches.find(f => (f.equipements || []).includes(e.id));
  return {
    doeId: doe.id, statut: doe.statut || 'En cours', etude: enEtude(doe), indice: doe.indice || '', pct: m.pct, aFaire: m.manques.length,
    manques: m.manques.slice(0, 6).map(x => x.libelle),
    cctp: lu ? { nom: lu.nom || '', le: lu.le || '', articles: (lu.articles || []).length, equipements: (lu.equipements || []).length, manquants: equipementsCctpManquants(doe).length } : null,
    sansCctp: !!doe.sansCctp,
    equipements: doe.equipements.slice(0, 300).map(e => ({ repere: e.repere || '', designation: e.designation || '', quantite: e.quantite || '', famille: e.famille || '', refCctp: e.refCctp || '',
      prescrit: e.prescrit || '', marque: e.marque || '', reference: e.reference || '', visa: (ficheDe(e) || {}).visa || '' })),
    fiches: doe.fiches.map(f => ({ id: f.id, designation: f.designation || '', visa: f.visa || 'À soumettre', dateVisa: f.dateVisa || '', obs: f.obs || '', indice: f.indice || '',
      fichier: f.fichier ? { src: f.fichier.src || 'doe', id: f.fichier.id, nom: f.fichier.nom || '', mime: f.fichier.mime || '' } : null })),
    visas, maj: doe._at || '', par: doe._by || '',
  };
}
