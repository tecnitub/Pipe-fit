// Offres fournisseurs en PDF : lecture automatique (lignes, références, prix nets, port, validité, délai),
// vérification avant enregistrement, et recommandation de la meilleure proposition parmi les offres reçues
// (prix, délai au regard de la date de livraison souhaitée, validité, nombre de fournisseurs à commander).

const lireFichierEnDataUrl = f => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(f); });
async function joindrePiece(fichier) {
  const dataUrl = /^image\//.test(fichier.type) ? await compressImage(fichier, 1800, 0.8) : await lireFichierEnDataUrl(fichier);
  if (dataUrl.length > 9.5 * 1024 * 1024) throw new Error('Fichier trop volumineux (7 Mo maximum)');
  return (await api('POST', '/api/files', { dataUrl })).id;
}
// Offre du fournisseur gardée telle que reçue : PDF ou photo (compressée), tableau Excel ou CSV (fichier brut)
async function joindreOffre(fichier) {
  const id = /\.(xlsx|xls|csv)$/i.test(fichier.name) ? (await envoyerFichierDocument(fichier)).id : await joindrePiece(fichier);
  return { id, nom: fichier.name };
}
// Lecture avec une fenêtre de progression ; renvoie l'analyse de l'offre
async function lireOffreFichier(fichier) {
  const box = Modal.open(`<h2 style="margin-top:0">Lecture de ${esc(fichier.name)}</h2><p class="muted" id="lo-etat">Lecture du document…</p><progress id="lo-p" max="1" value="0" style="width:100%"></progress>`);
  try {
    const r = await PdfLecture.lire(fichier, x => { const p = box.querySelector('#lo-p'); if (p) p.value = x; });
    box.querySelector('#lo-etat').textContent = 'Analyse des lignes…';
    const a = OffreLecture.analyser(r.lignes);
    return { ...a, ocr: r.ocr, texte: r.lignes };
  } finally { Modal.close(); }
}

/* ---------- Consultation : offre d'un fournisseur lue dans son PDF ---------- */
async function importerOffrePdf(c, eid, fichier, { pieceDeja = '' } = {}) {
  let lu;
  try { lu = await lireOffreFichier(fichier); } catch (e) { return notify(`Lecture impossible : ${e.message}`); }
  if (!lu.lignes.length) return notify(`Aucune ligne de prix reconnue dans ${fichier.name}${lu.ocr ? ' (document scanné : lecture moins fiable)' : ''}. Saisissez l'offre avec « Saisir l'offre ».`);
  const { parDemande, nonAssociees } = OffreLecture.associer(lu.lignes, c.lignes, Store.all('articles'));
  const opt = j => lu.lignes.map((l, k) => `<option value="${k}" ${k === j ? 'selected' : ''}>${esc([l.ref, l.designation].filter(Boolean).join(' · ').slice(0, 70))} · ${fmt(l.qte, 2)} × ${eur(l.pu)}</option>`).join('');
  const box = Modal.open(`<h2 style="margin-top:0">Offre de ${esc(clientName(eid))}</h2>
    <p class="small ${lu.coherent ? 'pos' : 'warn-text'}">${lu.lignes.length} ligne(s) lue(s)${lu.reference ? ` · offre n° ${esc(lu.reference)}` : ''}${lu.totalHT !== null ? ` · total HT du document ${eur(lu.totalHT)} ${lu.coherent ? '✓ cohérent avec les lignes' : '⚠ différent de la somme des lignes : vérifiez'}` : ''}${lu.ocr ? ' · document scanné : vérifiez les prix' : ''}</p>
    <div class="table-wrap"><table class="compact lo-table"><tr><th>N°</th><th>Demandé</th><th class="num">Qté</th><th>Ligne de l'offre</th><th>Réf. fournisseur</th><th class="num">Qté offerte</th><th class="num">PU net HT</th></tr>
      ${c.lignes.map((l, i) => { const j = parDemande[i], x = j === undefined ? null : lu.lignes[j];
        return `<tr data-i="${i}" class="${x ? (x.verifier ? 'lo-verifier' : '') : 'lo-manque'}"><td>${i + 1}</td><td>${esc(l.designation)}</td><td class="num">${fmt(num(l.qte), 2)} ${esc(l.unite || '')}</td>
          <td><select data-lo="${i}" aria-label="Ligne de l'offre"><option value="">— non chiffrée —</option>${opt(j)}</select></td>
          <td><input data-ref="${i}" value="${esc(x ? x.ref : '')}" style="width:110px" aria-label="Référence fournisseur"></td>
          <td class="num ${x && Math.abs(x.qte - num(l.qte)) > 1e-9 ? 'warn-text' : ''}" data-q="${i}">${x ? fmt(x.qte, 2) : ''}</td>
          <td class="num"><input data-pu="${i}" type="number" step="0.0001" value="${x ? x.pu : ''}" style="width:100px" aria-label="Prix unitaire net">${x && x.verifier ? '<br><span class="small warn-text">à vérifier</span>' : ''}</td></tr>`; }).join('')}</table></div>
    ${nonAssociees.length ? `<p class="small muted">Lignes de l'offre non rapprochées : ${nonAssociees.map(j => esc(`${lu.lignes[j].designation} (${eur(lu.lignes[j].montant)})`)).join(' · ')}</p>` : ''}
    <div class="grid2">
      <div class="field"><label for="lo-port">Frais de port HT</label><input id="lo-port" type="number" step="0.01" value="${lu.port || ''}"></div>
      <div class="field"><label for="lo-rem">Remise globale (%)</label><input id="lo-rem" type="number" step="0.5" value="${lu.remiseGlobale || ''}"></div>
      <div class="field"><label for="lo-del">Délai de livraison (jours)</label><input id="lo-del" type="number" value="${esc(lu.delai || '')}"></div>
      <div class="field"><label for="lo-val">Offre valable jusqu'au</label><input id="lo-val" type="date" value="${esc(lu.validite || '')}"></div>
    </div>
    <details class="small"><summary>Texte lu dans le document</summary><pre class="lo-texte">${esc(lu.texte.join('\n').slice(0, 6000))}</pre></details>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="lo-x">Annuler</button><button id="lo-ok">Enregistrer l'offre</button></div>`, true);
  box.querySelectorAll('[data-lo]').forEach(s => s.onchange = () => {
    const i = s.dataset.lo, x = s.value === '' ? null : lu.lignes[+s.value];
    box.querySelector(`[data-ref="${i}"]`).value = x ? x.ref : '';
    box.querySelector(`[data-pu="${i}"]`).value = x ? x.pu : '';
    box.querySelector(`[data-q="${i}"]`).textContent = x ? fmt(x.qte, 2) : '';
    s.closest('tr').classList.toggle('lo-manque', !x);
  });
  box.querySelector('#lo-x').onclick = Modal.close;
  box.querySelector('#lo-ok').onclick = async () => {
    const prix = {}, refs = {};
    c.lignes.forEach((l, i) => {
      const pu = box.querySelector(`[data-pu="${i}"]`).value, ref = box.querySelector(`[data-ref="${i}"]`).value.trim();
      if (pu !== '') prix[i] = num(pu);
      if (ref) refs[i] = ref;
    });
    let pieceId = '';
    // Offre reçue par e-mail : le fichier est déjà enregistré
    if (pieceDeja) pieceId = pieceDeja;
    else try { pieceId = await joindrePiece(fichier); } catch (e) { notify(`Offre enregistrée sans le PDF : ${e.message}`); }
    const f = c.fournisseurs.find(x => x.entrepriseId === eid);
    const v = s => box.querySelector(s).value;
    f.offre = { ...(f.offre || {}), prix, refs, port: v('#lo-port'), remise: v('#lo-rem'), delai: v('#lo-del'), validite: v('#lo-val'), pieceId: pieceId || (f.offre || {}).pieceId || '', pieceNom: pieceId ? fichier.name : (f.offre || {}).pieceNom || '', aLire: false,
      reference: lu.reference || '', date: isoDate(new Date()), lecture: { fichier: fichier.name, lignes: lu.lignes.length, ocr: lu.ocr, coherent: lu.coherent } };
    f.statut = 'Offre reçue';
    Store.upsert('consultations', c); Modal.close(); App.render();
    App.toast(`Offre de ${clientName(eid)} : ${Object.keys(prix).length}/${c.lignes.length} ligne(s) chiffrée(s)`, 4000);
  };
}

/* ---------- Meilleure proposition ---------- */
// Options : un seul fournisseur (offre complète), deux fournisseurs, ligne par ligne au meilleur prix.
// Retenue : la moins chère parmi celles qui couvrent toutes les lignes, sont valides et livrent à temps ;
// moins de fournisseurs préférés si l'écart reste sous 2 % (ou 150 €) : moins de commandes, de ports et de réceptions.
function propositionsConsultation(c, auj = isoDate(new Date())) {
  const offres = (c.fournisseurs || []).filter(f => f.statut === 'Offre reçue').map(f => ({ f, t: offreTotaux(c, f) }));
  const n = (c.lignes || []).length;
  if (!offres.length || !n) return { options: [], retenue: null };
  const info = o => {
    const off = o.f.offre || {}, delai = num(off.delai);
    const livre = c.dateLivraison && delai ? isoDate(addDays(new Date(), delai)) : '';
    return { expiree: !!(off.validite && off.validite < auj), tard: !!(livre && livre > c.dateLivraison), delai, livre };
  };
  // Coût d'un groupe de fournisseurs : chaque ligne au meilleur prix du groupe, ports des fournisseurs utilisés
  const evaluer = groupe => {
    const attribution = {}, utilises = new Set();
    let total = 0;
    for (let i = 0; i < n; i++) {
      const cands = groupe.map(o => ({ o, pu: o.t.pu(i) })).filter(x => x.pu !== null).sort((a, b) => a.pu - b.pu);
      if (!cands.length) return null;
      attribution[i] = cands[0].o.f.entrepriseId; utilises.add(cands[0].o); total += cands[0].pu * num(c.lignes[i].qte);
    }
    total += sumBy([...utilises], o => num((o.f.offre || {}).port));
    const infos = [...utilises].map(info);
    return { attribution, fournisseurs: [...utilises].map(o => o.f.entrepriseId), total: Math.round(total * 100) / 100,
      expiree: infos.some(x => x.expiree), tard: infos.some(x => x.tard), delai: Math.max(0, ...infos.map(x => x.delai)) };
  };
  const options = [];
  offres.forEach(o => { const e = evaluer([o]); if (e) options.push({ ...e, type: 'unique', libelle: `Tout chez ${clientName(o.f.entrepriseId)}` }); });
  for (let a = 0; a < offres.length; a++) for (let b = a + 1; b < offres.length; b++) {
    const e = evaluer([offres[a], offres[b]]);
    if (e && e.fournisseurs.length === 2) options.push({ ...e, type: 'deux', libelle: `Partagé entre ${e.fournisseurs.map(clientName).join(' et ')}` });
  }
  const opt = evaluer(offres);
  if (opt && opt.fournisseurs.length > 2) options.push({ ...opt, type: 'optimum', libelle: `Ligne par ligne (${opt.fournisseurs.length} fournisseurs)` });
  options.sort((x, y) => x.total - y.total);
  const possibles = options.filter(o => !o.expiree && !o.tard);
  const pool = possibles.length ? possibles : options;
  const moinsChere = pool[0];
  let retenue = moinsChere;
  if (moinsChere) {
    const seuil = Math.max(moinsChere.total * 0.02, 150);
    const simples = pool.filter(o => o.fournisseurs.length < moinsChere.fournisseurs.length && o.total - moinsChere.total <= seuil).sort((x, y) => x.fournisseurs.length - y.fournisseurs.length || x.total - y.total);
    if (simples.length) retenue = simples[0];
  }
  const raisons = [];
  if (retenue) {
    raisons.push(`${eur(retenue.total)} HT port compris`);
    if (retenue !== moinsChere) raisons.push(`${eur(retenue.total - moinsChere.total)} de plus que la solution la moins chère, mais ${retenue.fournisseurs.length} commande(s) au lieu de ${moinsChere.fournisseurs.length}`);
    else if (pool[1]) raisons.push(`${eur(pool[1].total - retenue.total)} de moins que la solution suivante`);
    if (c.dateLivraison) raisons.push(retenue.tard ? '⚠ livraison après la date souhaitée' : retenue.delai ? `livré sous ${retenue.delai} j, avant le ${dateFr(c.dateLivraison)}` : 'délai non indiqué');
    if (retenue.expiree) raisons.push('⚠ offre dont la validité est dépassée : faites-la confirmer');
    const ecartees = options.filter(o => (o.expiree || o.tard) && o.total < retenue.total);
    if (ecartees.length) raisons.push(`écarté(es) car ${ecartees.some(o => o.tard) ? 'trop tardive(s)' : ''}${ecartees.some(o => o.tard) && ecartees.some(o => o.expiree) ? ' ou ' : ''}${ecartees.some(o => o.expiree) ? 'expirée(s)' : ''} : ${ecartees.slice(0, 2).map(o => `${o.libelle} (${eur(o.total)})`).join(', ')}`);
  }
  return { options, retenue, moinsChere, raisons };
}
function propositionHtml(c) {
  const p = propositionsConsultation(c);
  if (!p.retenue) return '';
  const actuelle = JSON.stringify(c.attribution || {}) === JSON.stringify(p.retenue.attribution);
  return `<div class="card proposition"><div><strong>💡 Meilleure proposition : ${esc(p.retenue.libelle)}</strong></div>
    <ul class="small">${p.raisons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    ${c.statut === 'En cours' ? `<div class="toolbar" style="margin:4px 0 0">${actuelle ? '<span class="badge b-ok">retenue</span>' : '<button id="cs-reco">Retenir cette proposition</button>'}</div>` : ''}
    ${p.options.length > 1 ? `<details class="small"><summary>Toutes les solutions (${p.options.length})</summary><table class="compact"><tr><th>Solution</th><th class="num">Total HT port compris</th><th>Délai</th><th></th></tr>
      ${p.options.map(o => `<tr class="${o === p.retenue ? 'meilleur' : ''}"><td>${esc(o.libelle)}</td><td class="num">${eur(o.total)}</td><td>${o.delai ? `${o.delai} j` : '—'}</td><td>${o.tard ? '<span class="badge b-warn">trop tard</span>' : ''}${o.expiree ? ' <span class="badge b-bad">validité dépassée</span>' : ''}</td></tr>`).join('')}</table></details>` : ''}</div>`;
}
function bindProposition(root, c, save) {
  const b = root.querySelector('#cs-reco');
  if (b) b.onclick = () => { c.attribution = { ...propositionsConsultation(c).retenue.attribution }; save(); App.toast('Proposition retenue : vérifiez puis créez les commandes'); };
}

/* ---------- Commande : lignes reprises du devis du fournisseur ---------- */
async function chargerDevisFournisseur(c, fichier) {
  let lu;
  try { lu = await lireOffreFichier(fichier); } catch (e) { return notify(`Lecture impossible : ${e.message}`); }
  if (!lu.lignes.length) return notify(`Aucune ligne de prix reconnue dans ${fichier.name}.`);
  const arts = Store.all('articles');
  // Lignes déjà présentes (commande issue d'une consultation) : mises à jour plutôt qu'ajoutées en double
  const { parDemande } = OffreLecture.associer(lu.lignes, c.lignes || [], arts);
  const existante = {}; Object.entries(parDemande).forEach(([i, j]) => { existante[j] = +i; });
  // Article de la bibliothèque : même référence, sinon la désignation la plus proche (dimensions identiques)
  const article = l => {
    const r = l.ref && arts.find(a => [a.ref, a.refFournisseur].filter(Boolean).some(x => x.toLowerCase() === l.ref.toLowerCase()));
    if (r) return r;
    const best = arts.map(a => ({ a, s: Rapprochement.ressemblance(a.designation, l.designation) })).sort((x, y) => y.s - x.s)[0];
    return best && best.s >= 0.6 ? best.a : null;
  };
  const box = Modal.open(`<h2 style="margin-top:0">Devis ${esc(lu.reference || fichier.name)}</h2>
    <p class="small ${lu.coherent ? 'pos' : 'warn-text'}">${lu.lignes.length} ligne(s) lue(s)${lu.totalHT !== null ? ` · total HT ${eur(lu.totalHT)} ${lu.coherent ? '✓ cohérent' : '⚠ à vérifier'}` : ''}${lu.port ? ` · port ${eur(lu.port)}` : ''}${lu.ocr ? ' · document scanné : vérifiez' : ''}</p>
    <div class="table-wrap"><table class="compact lo-table"><tr><th></th><th>Réf.</th><th>Désignation</th><th class="num">Qté</th><th>Unité</th><th class="num">PU net HT</th><th class="num">Montant</th><th>Dans la commande</th></tr>
      ${lu.lignes.map((l, j) => { const a = article(l), i = existante[j];
        return `<tr data-j="${j}" class="${l.verifier ? 'lo-verifier' : ''}"><td><input type="checkbox" data-pris="${j}" checked aria-label="Reprendre"></td><td><input data-k="ref" value="${esc(l.ref)}" style="width:110px"></td>
          <td><input data-k="designation" value="${esc(l.designation)}"></td><td class="num"><input data-k="qte" type="number" step="any" value="${l.qte}" style="width:80px"></td><td><input data-k="unite" value="${esc(l.unite)}" style="width:55px"></td>
          <td class="num"><input data-k="pu" type="number" step="0.0001" value="${l.pu}" style="width:95px">${l.remise ? `<br><span class="small muted">brut ${eur(l.puBrut)} − ${fmt(l.remise, 1)} %</span>` : ''}</td><td class="num">${eur(l.montant)}${l.verifier ? '<br><span class="small warn-text">à vérifier</span>' : ''}</td>
          <td class="small">${i !== undefined ? `met à jour la ligne ${i + 1}` : a ? `nouvelle · ${esc(a.ref || a.designation)}` : 'nouvelle ligne'}</td></tr>`; }).join('')}</table></div>
    <label class="check small"><input type="checkbox" id="dv-port" ${lu.port ? 'checked' : ''}> Ajouter les frais de port (${eur(lu.port)})</label>
    <label class="check small"><input type="checkbox" id="dv-maj" checked> Mettre à jour le prix d'achat et la référence fournisseur dans la bibliothèque</label>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="dv-x">Annuler</button><button id="dv-ok">Remplir la commande</button></div>`, true);
  box.querySelector('#dv-x').onclick = Modal.close;
  box.querySelector('#dv-ok').onclick = async () => {
    c.lignes = c.lignes || [];
    let maj = 0, ajout = 0;
    box.querySelectorAll('tr[data-j]').forEach(tr => {
      const j = +tr.dataset.j;
      if (!tr.querySelector('[data-pris]').checked) return;
      const v = k => tr.querySelector(`[data-k="${k}"]`).value;
      const l = { refFournisseur: v('ref').trim(), designation: v('designation').trim(), qte: num(v('qte')), unite: v('unite').trim(), pu: num(v('pu')) };
      const i = existante[j];
      if (i !== undefined) { Object.assign(c.lignes[i], { refFournisseur: l.refFournisseur || c.lignes[i].refFournisseur, qte: l.qte, pu: l.pu }); maj++; }
      else { const a = article(lu.lignes[j]); c.lignes.push({ articleId: a ? a.id : '', ...l, unite: l.unite || (a && a.unite) || 'u' }); ajout++; }
      const a = (i !== undefined && Store.get('articles', c.lignes[i].articleId)) || article(lu.lignes[j]);
      if (box.querySelector('#dv-maj').checked && a && l.pu) {
        const prix = Math.round(l.pu * 100) / 100;
        if (Math.abs(num(a.coutRevient) - prix) > 0.005 || (l.refFournisseur && a.refFournisseur !== l.refFournisseur)) Store.upsert('articles', { ...a, coutRevient: prix, refFournisseur: l.refFournisseur || a.refFournisseur || '', fournisseurId: c.fournisseurId || a.fournisseurId });
      }
    });
    if (box.querySelector('#dv-port').checked && lu.port && !c.lignes.some(l => /port/i.test(l.designation))) c.lignes.push({ articleId: '', designation: 'Frais de port', unite: 'forfait', qte: 1, pu: lu.port });
    try { c.devisFournisseurId = await joindrePiece(fichier); c.devisFournisseurNom = fichier.name; c.devisFournisseurRef = lu.reference || ''; } catch (e) { /* lignes gardées même sans la pièce */ }
    Store.upsert('commandes', c); Modal.close(); App.render();
    App.toast(`${ajout} ligne(s) ajoutée(s)${maj ? `, ${maj} mise(s) à jour` : ''} depuis le devis du fournisseur`, 4000);
  };
}

/* ---------- Démonstration : devis fournisseur d'exemple à importer ---------- */
function devisExempleHtml() {
  const l = [['CO3D316-50', 'COUDE 90° 3D INOX 316L DN50 A SOUDER', 40, 24, 19.2], ['TE316-50', 'TE EGAL INOX 316L DN50 A SOUDER', 12, 36.5, 29.2],
    ['CO3D316-100', 'COUDE 90° 3D INOX 316L DN100', 16, 74, 59.2], ['BC316-50PN16', 'BRIDE A COLLERETTE INOX 316L DN50 PN16', 10, 39, 31.2]];
  const tot = l.reduce((t, x) => t + x[2] * x[4], 0) + 35;
  return `<div class="doc-head"><div class="doc-societe"><div><strong>TÉRÉVA – exemple de démonstration</strong><br>Agence de Saint-Priest</div></div><div class="doc-ref"><strong class="doc-titre">DEVIS N° TRV-26-04512</strong><br>Date : ${dateFr(isoDate(new Date()))}</div></div>
    <table class="doc-lines"><tr><th>Réf.</th><th>Désignation</th><th class="num">Qté</th><th>U</th><th class="num">Prix brut</th><th class="num">Remise</th><th class="num">Prix net</th><th class="num">Montant HT</th></tr>
    ${l.map(x => `<tr><td>${x[0]}</td><td>${x[1]}</td><td class="num">${x[2]}</td><td>U</td><td class="num">${fmt(x[3], 2)}</td><td class="num">20 %</td><td class="num">${fmt(x[4], 2)}</td><td class="num">${fmt(x[2] * x[4], 2)}</td></tr>`).join('')}</table>
    <p>Participation port : 35,00<br>Total HT : ${fmt(tot, 2)}</p><p>Délai de livraison : 6 jours ouvrés. Offre valable jusqu'au ${dateFr(isoDate(addDays(new Date(), 30)))}.</p>`;
}
