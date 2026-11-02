// Stock et QR codes : écran du bureau (Bibliothèque › Stock et QR codes, aussi dans Achats), étiquettes QR à imprimer
// (articles stockés et outillage), catalogue Tecnitub imprimé avec ses QR codes, scanner du téléphone (appareil photo
// ou photo de l'étiquette), fiche ouverte au scan : sortie vers un chantier, retour au stock, prise ou retour d'un outil ;
// au bureau, entrée en stock, inventaire et demande de prix de réassort.

const mvtsStock = () => Store.all('mouvementsStock') || [];
const consosStock = () => (Store.all('consommations') || []).filter(c => c.stock);
const qteStock = a => Stock.quantite(a.id, consosStock(), mvtsStock());
const badgeStock = (a, q = qteStock(a)) => { const [cls, lib] = Stock.ETATS[Stock.etat(a, q)]; return `<span class="badge ${cls}">${lib}</span>`; };
const fmtQ = q => fmt(q, Number.isInteger(q) ? 0 : 2);
const outilsQr = () => (Store.all('materiels') || []).filter(m => !m.archive && !estVehicule(m));
const bureauStock = () => Store.me.role !== 'atelier';

/* ---------- QR codes ---------- */
// Modules du QR code (bibliothèque qrcode-generator, niveau de correction M : lisible même un peu abîmé)
function qrMatrice(texte) { const q = qrcode(0, 'M'); q.addData(texte); q.make(); return q; }
function qrSvg(texte, taille = 120) {
  const q = qrMatrice(texte), n = q.getModuleCount(), m = 2, t = n + 2 * m;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 ${t} ${t}" width="${taille}" height="${taille}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
// Image du QR code (PDF des étiquettes et du catalogue)
const qrCache = new Map();
function qrPng(texte, px = 330) {
  if (qrCache.has(texte)) return qrCache.get(texte);
  const q = qrMatrice(texte), n = q.getModuleCount(), m = 2, c = Math.max(2, Math.floor(px / (n + 2 * m))), cv = document.createElement('canvas');
  cv.width = cv.height = c * (n + 2 * m);
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.fillStyle = '#000';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) ctx.fillRect((x + m) * c, (y + m) * c, c, c);
  const url = cv.toDataURL('image/png'); qrCache.set(texte, url); return url;
}
const origineQr = () => location.origin + location.pathname;
const lienArticle = a => Stock.lien(origineQr(), 'a', a.id), lienOutil = m => Stock.lien(origineQr(), 'm', m.id);

/* ---------- Étiquettes et catalogue (PDF) ---------- */
const itemArticle = a => ({ lien: lienArticle(a), titre: a.designation, sous: [a.ref, a.unite && `(${a.unite})`].filter(Boolean).join(' '), emplacement: a.emplacement ? `Empl. ${a.emplacement}` : '', photo: a.photoId ? fileUrl(a.photoId) : '' });
const itemOutil = m => ({ lien: lienOutil(m), titre: m.designation, sous: [m.categorie, m.numeroSerie && `n° ${m.numeroSerie}`].filter(Boolean).join(' · '), emplacement: 'scanner pour le prendre ou le rendre', photo: m.photoId ? fileUrl(m.photoId) : '' });
// Impression : modèle de planche (papier à découper ou autocollant du commerce), case de départ pour une planche
// entamée, décalage de l'imprimante en mm (retenu sur ce poste), feuille de test des cadres
const CLE_ETQ = 'pipefit-etiquettes';
const reglagesEtq = () => { try { return { modele: 'libre-20', dx: 0, dy: 0, ...(JSON.parse(localStorage.getItem(CLE_ETQ)) || {}) }; } catch (e) { return { modele: 'libre-20', dx: 0, dy: 0 }; } };
const mesureTexte = (() => { let ctx; return (t, taille, gras) => { ctx = ctx || document.createElement('canvas').getContext('2d'); ctx.font = `${gras ? 'bold ' : ''}${taille}px Helvetica, Arial, sans-serif`; return ctx.measureText(t).width; }; })();
// Photo en JPEG pour le PDF (300 px au plus)
function jpegPhoto(url) {
  return new Promise(ok => {
    if (!url) return ok(null);
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { const k = Math.min(1, 300 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      try { ok({ jpeg: atob(c.toDataURL('image/jpeg', 0.82).split(',')[1]), w: c.width, h: c.height }); } catch (e) { ok(null); } };
    img.onerror = () => ok(null); img.src = url;
  });
}
async function imprimerEtiquettes(items, nom) {
  if (!items.length) return notify('Aucune étiquette à imprimer.');
  const r = reglagesEtq();
  const box = Modal.open(`<h2 style="margin-top:0">🏷️ ${items.length} étiquette(s)</h2>
    <div class="field"><label for="et-m">Planche</label><select id="et-m">${Planches.MODELES.map(m => `<option value="${m.id}" ${m.id === r.modele ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}</select></div>
    <div class="grid3"><div class="field"><label for="et-d">Commencer à l'étiquette n°</label><input id="et-d" type="number" min="1" value="1"></div>
      <div class="field"><label for="et-x">Décalage horizontal (mm)</label><input id="et-x" type="number" step="0.5" value="${r.dx}"></div>
      <div class="field"><label for="et-y">Décalage vertical (mm)</label><input id="et-y" type="number" step="0.5" value="${r.dy}"></div></div>
    <p class="small muted" id="et-info"></p>
    <p class="small muted">Imprimer à <strong>100 % (taille réelle)</strong>, sans « ajuster à la page ». Première fois : imprimez la feuille de test sur papier blanc, posez-la sur une planche à contre-jour, puis réglez le décalage (+ vers la droite / vers le bas).</p>
    <div class="modal-actions"><button class="secondary" id="et-test">Feuille de test (cadres)</button><span style="flex:1"></span><button class="secondary" id="et-x0">Annuler</button><button id="et-ok">Créer le PDF</button></div>`);
  const $ = s => box.querySelector(s), lire = () => ({ modele: $('#et-m').value, dx: Number($('#et-x').value) || 0, dy: Number($('#et-y').value) || 0, depart: Math.max(1, Number($('#et-d').value) || 1) });
  const info = () => { const m = Planches.modele($('#et-m').value), n = m.cols * m.lignes; $('#et-d').max = n; $('#et-info').textContent = `${n} étiquettes par planche · ${Math.ceil((items.length + lire().depart - 1) / n)} planche(s)`; };
  $('#et-m').onchange = info; $('#et-d').oninput = info; info();
  $('#et-x0').onclick = Modal.close;
  const creer = async test => {
    const o = lire(); try { localStorage.setItem(CLE_ETQ, JSON.stringify({ modele: o.modele, dx: o.dx, dy: o.dy })); } catch (e) { /* stockage indisponible */ }
    const m = Planches.modele(o.modele);
    const liste = test ? Array.from({ length: m.cols * m.lignes }, (_, i) => ({ titre: `Étiquette ${i + 1}`, sous: m.nom.split(' — ')[0], qr: null, photo: null }))
      : await Promise.all(items.map(async x => { const q = qrMatrice(x.lien); return { titre: x.titre, sous: [x.sous, x.emplacement].filter(Boolean).join(' · '), qr: { n: q.getModuleCount(), sombre: (y, c) => q.isDark(y, c) }, photo: await jpegPhoto(x.photo) }; }));
    const r2 = Planches.pdf(liste, { modele: o.modele, depart: test ? 1 : o.depart, decal: { x: o.dx, y: o.dy }, cadres: test, mesure: mesureTexte });
    download(test ? `Test-${m.id}.pdf` : nom, r2.octets, 'application/pdf');
    if (!test) { Modal.close(); App.toast(`${items.length} étiquette(s) sur ${r2.pages} planche(s) ${m.nom.split(' — ')[0]}`); }
  };
  $('#et-test').onclick = () => creer(true);
  $('#et-ok').onclick = () => creer(false);
}
// Catalogue Tecnitub : articles du stock par famille avec leur QR code, à donner aux compagnons
function documentCatalogue(articles) {
  const fam = new Map();
  articles.slice().sort((x, y) => `${x.famille} ${x.sousFamille} ${x.designation}`.localeCompare(`${y.famille} ${y.sousFamille} ${y.designation}`)).forEach(a => { const f = a.famille || 'Divers'; if (!fam.has(f)) fam.set(f, []); fam.get(f).push(a); });
  return `${Doc.entete('pv', 'CATALOGUE DU MATÉRIEL EN STOCK', `état au ${dateFr(isoDate(new Date()))} · ${articles.length} article(s)`)}
    <p class="small">Scannez le QR code avec l'appli Pipe-Fit (onglet « Stock ») pour sortir l'article vers votre chantier ou le remettre en stock.</p>
    ${[...fam.entries()].map(([f, l]) => `<h3 class="doc-h">${esc(f)}</h3><table class="doc-lines compact"><tr><th style="width:62px">QR</th><th style="width:62px">Photo</th><th>Article</th><th>Réf.</th><th>Unité</th><th>Emplacement</th></tr>
      ${l.map(a => `<tr><td><img src="${qrPng(lienArticle(a), 220)}" alt="" style="width:54px;height:54px"></td><td>${a.photoId ? `<img src="${fileUrl(a.photoId)}" alt="" style="width:54px;height:54px;object-fit:cover">` : ''}</td><td><strong>${esc(a.designation)}</strong>${a.sousFamille ? `<br><span class="small">${esc(a.sousFamille)}</span>` : ''}</td><td>${esc(a.ref || '')}</td><td>${esc(a.unite || '')}</td><td>${esc(a.emplacement || '')}</td></tr>`).join('')}</table>`).join('')}
    <div class="doc-pied">${esc(Doc.piedLegal())}</div>`;
}

/* ---------- Photos des articles et de l'outillage ---------- */
// Vignette (catalogue de l'appli, tableau du stock) ; au bureau, un clic ajoute ou change la photo
function vignettePhoto(o, modifiable = false) {
  const img = o.photoId ? `<img class="vign" src="${esc(fileUrl(o.photoId))}" alt="" loading="lazy">` : `<span class="vign vide" aria-hidden="true">${modifiable ? '📷' : '📦'}</span>`;
  return modifiable && Store.can('write', 'articles') ? `<label class="vign-l" title="${o.photoId ? 'Changer la photo' : 'Ajouter une photo'}">${img}<input type="file" accept="image/*" capture="environment" data-ph-art="${esc(o.id)}" hidden></label>` : img;
}
// Photo réduite (400 px) envoyée au serveur puis rattachée à l'article
function lierPhotos(root) {
  root.querySelectorAll('[data-ph-art], [data-ph-mat]').forEach(inp => inp.onchange = async ev => {
    const col = inp.dataset.phMat ? 'materiels' : 'articles', f = ev.target.files[0], a = Store.get(col, inp.dataset.phMat || inp.dataset.phArt); ev.target.value = '';
    if (!f || !a) return;
    try {
      const id = await envoyerImage(await compressImage(f, 400, 0.8));
      Store.upsert(col, { ...a, photoId: id }); App.render(); App.toast('Photo enregistrée : elle apparaît sur l\'étiquette et dans le catalogue');
    } catch (e) { notify(`Photo non enregistrée : ${e.message}`); }
  });
}

/* ---------- Écran du bureau : stock et QR codes ---------- */
const stockEtat = { q: '', filtre: '', sel: new Set() };
Views.stock = () => {
  const lst = Stock.etatStock(Store.all('articles'), consosStock(), mvtsStock()), e = stockEtat, nq = RechercheArticles.norm(e.q);
  const vus = lst.filter(x => (!e.filtre || (e.filtre === 'reassort' ? x.etat !== 'ok' : x.etat === e.filtre)) && (!nq || RechercheArticles.norm([x.a.ref, x.a.designation, x.a.famille, x.a.emplacement].join(' ')).includes(nq)));
  const reass = lst.filter(x => x.etat !== 'ok'), valeur = lst.reduce((s, x) => s + x.valeur, 0), outils = outilsQr();
  const sorties = consosStock().slice().sort((x, y) => `${y.date}${y._at || ''}`.localeCompare(`${x.date}${x._at || ''}`)).slice(0, 12);
  return `<h1>Stock et QR codes</h1>${biblioTabs('stock')}
  <div class="cards"><div class="card"><div class="label">Articles en stock</div><div class="value">${lst.length}</div><div class="sub">valeur ${eur(valeur)} au prix d'achat</div></div>
    <div class="card ${reass.length ? 'warn-card' : ''}"><div class="label">À réassortir</div><div class="value">${reass.length}</div><div class="sub">${lst.filter(x => x.etat === 'rupture').length} en rupture</div></div>
    <div class="card"><div class="label">Outillage étiqueté</div><div class="value">${outils.filter(m => m.scan).length}/${outils.length}</div><div class="sub">${outils.filter(m => m.scan && (m.affectation || {}).affaireId).length} sur chantier</div></div></div>
  <div class="toolbar"><a class="btn" href="#/scan">📷 Scanner</a><button class="secondary" id="st-ajout">+ Mettre des articles en stock</button>
    ${reass.length ? `<button id="st-reass">🛒 Demande de prix de réassort (${reass.length})</button>` : ''}
    <button class="secondary" id="st-etq">🏷️ Étiquettes QR${e.sel.size ? ` (${e.sel.size})` : ''}</button><button class="secondary" id="st-cat">📒 Catalogue Tecnitub (PDF)</button><button class="secondary" id="st-outils">🔧 Étiquettes de l'outillage</button></div>
  <div class="toolbar"><input type="search" id="st-q" value="${esc(e.q)}" placeholder="Rechercher : référence, désignation, emplacement…" aria-label="Rechercher dans le stock" style="flex:1;min-width:200px">
    <select id="st-f" aria-label="Filtrer"><option value="">Tout le stock</option>${optionsStr(['reassort', 'rupture', 'ok'], e.filtre).replace(/>reassort</, '>À réassortir (et ruptures)<').replace(/>rupture</, '>En rupture<').replace(/>ok</, '>En stock<')}</select></div>
  ${lst.length ? `<div class="table-wrap"><table><tr><th><input type="checkbox" id="st-tout" aria-label="Tout sélectionner"></th><th>Photo</th><th>Article</th><th>Emplacement</th><th class="num">En stock</th><th class="num">Mini</th><th>État</th><th></th></tr>
    ${vus.map(x => `<tr><td><input type="checkbox" data-st-sel="${esc(x.a.id)}" ${e.sel.has(x.a.id) ? 'checked' : ''} aria-label="Sélectionner"></td><td>${vignettePhoto(x.a, true)}</td><td><a href="#/scan/a/${esc(x.a.id)}"><strong>${esc(x.a.designation)}</strong></a><br><span class="small muted">${esc(x.a.ref || '')} · ${esc(x.a.famille || '')}</span></td>
      <td>${esc(x.a.emplacement || '—')}</td><td class="num"><strong>${fmtQ(x.q)}</strong> ${esc(x.a.unite || '')}</td><td class="num">${x.a.stockMini ? fmtQ(Number(x.a.stockMini)) : '—'}</td><td>${badgeStock(x.a, x.q)}</td>
      <td class="nowrap"><button class="small secondary" data-st-in="${esc(x.a.id)}">Entrée</button><button class="small secondary" data-st-inv="${esc(x.a.id)}">Inventaire</button></td></tr>`).join('')}</table></div>`
    : '<p class="muted">Aucun article géré en stock. « + Mettre des articles en stock » (ou dans la Bibliothèque, sélectionnez des fournitures) : emplacement, quantité minimale, puis étiquettes QR à coller sur les bacs.</p>'}
  ${sorties.length ? `<h2>Dernières sorties et retours</h2><div class="table-wrap"><table><tr><th>Date</th><th>Article</th><th class="num">Quantité</th><th>Chantier</th><th>Par</th></tr>
    ${sorties.map(c => `<tr><td>${dateFr(c.date)}</td><td>${esc(c.designation || '')}</td><td class="num ${Number(c.qte) < 0 ? 'pos' : ''}">${Number(c.qte) < 0 ? `retour ${fmtQ(-Number(c.qte))}` : fmtQ(Number(c.qte))} ${esc(c.unite || '')}</td><td>${esc(affaireLabel(affaireOf(c.affaireId)))}</td><td>${esc(userName(c.userId))}</td></tr>`).join('')}</table></div>` : ''}
  <p class="small muted">Chaque étiquette porte l'adresse de la fiche : le scanner de l'appli (onglet 📷 Stock des compagnons) l'ouvre partout ; l'appareil photo du téléphone aussi, quand l'adresse de Pipe-Fit est joignable. Une sortie est imputée au chantier au prix de la bibliothèque (rentabilité du chantier).</p>`;
};
Views.stock.bind = root => {
  const e = stockEtat, $ = s => root.querySelector(s);
  $('#st-q').oninput = ev => { e.q = ev.target.value; App.render(); const s = document.querySelector('#st-q'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } };
  $('#st-f').onchange = ev => { e.filtre = ev.target.value; App.render(); };
  root.querySelectorAll('[data-st-sel]').forEach(cb => cb.onchange = () => { cb.checked ? e.sel.add(cb.dataset.stSel) : e.sel.delete(cb.dataset.stSel); App.render(); });
  const tout = $('#st-tout'); if (tout) tout.onchange = () => { root.querySelectorAll('[data-st-sel]').forEach(cb => (tout.checked ? e.sel.add(cb.dataset.stSel) : e.sel.delete(cb.dataset.stSel))); App.render(); };
  root.querySelectorAll('[data-st-in]').forEach(b => b.onclick = () => mouvementStock(Store.get('articles', b.dataset.stIn), 'entree'));
  lierPhotos(root);
  root.querySelectorAll('[data-st-inv]').forEach(b => b.onclick = () => mouvementStock(Store.get('articles', b.dataset.stInv), 'inventaire'));
  $('#st-ajout').onclick = () => choisirArticlesStock();
  const r = $('#st-reass'); if (r) r.onclick = () => demandeReassort(Stock.aReassortir(Store.all('articles'), consosStock(), mvtsStock()));
  $('#st-etq').onclick = () => { const l = Store.all('articles').filter(a => Stock.gere(a) && (!e.sel.size || e.sel.has(a.id))); imprimerEtiquettes(l.map(itemArticle), 'Etiquettes-QR-stock.pdf'); };
  $('#st-cat').onclick = () => { const l = Store.all('articles').filter(Stock.gere); if (!l.length) return notify('Aucun article en stock.'); App.toast('Préparation du catalogue…'); PDF.telecharger(documentCatalogue(l), 'Catalogue-Tecnitub.pdf').catch(er => notify(er.message)); };
  $('#st-outils').onclick = () => etiquettesOutillage();
};
// Entrée en stock (réception) ou inventaire (quantité comptée)
function mouvementStock(a, type) {
  if (!a) return;
  const q = qteStock(a), box = Modal.open(`<h2 style="margin-top:0">${type === 'inventaire' ? 'Inventaire' : 'Entrée en stock'} : ${esc(a.designation)}</h2>
    <p class="small muted">En stock actuellement : ${fmtQ(q)} ${esc(a.unite || '')}${a.emplacement ? ` · ${esc(a.emplacement)}` : ''}</p>
    <div class="grid2"><div class="field"><label for="ms-q">${type === 'inventaire' ? 'Quantité comptée' : 'Quantité reçue'} (${esc(a.unite || 'u')})</label><input id="ms-q" type="number" inputmode="decimal" step="any" min="0" value="${type === 'inventaire' ? fmtQ(q).replace(/\s/g, '').replace(',', '.') : (a.stockReassort || '')}"></div>
      <div class="field"><label for="ms-d">Date</label><input id="ms-d" type="date" value="${isoDate(new Date())}"></div></div>
    <div class="field"><label for="ms-n">${type === 'inventaire' ? 'Remarque' : 'Commande, bon de livraison'}</label><input id="ms-n"></div>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="ms-x">Annuler</button><button id="ms-ok">Enregistrer</button></div>`);
  box.querySelector('#ms-x').onclick = Modal.close;
  box.querySelector('#ms-ok').onclick = () => {
    const v = Number(String(box.querySelector('#ms-q').value).replace(',', '.'));
    if (!Number.isFinite(v) || v < 0 || (type === 'entree' && !v)) return notify('Indiquez la quantité.');
    Store.upsert('mouvementsStock', { articleId: a.id, type, qte: v, date: box.querySelector('#ms-d').value || isoDate(new Date()), userId: Store.me.userId || '', note: box.querySelector('#ms-n').value.trim().slice(0, 200) });
    Modal.close(); App.render(); App.toast(type === 'inventaire' ? `Inventaire enregistré : ${fmtQ(v)} ${a.unite || ''}` : `${fmtQ(v)} ${a.unite || ''} entré(s) en stock`);
  };
  setTimeout(() => box.querySelector('#ms-q').select(), 50);
}
// Demande de prix de réassort : consultation « stock » (sans chantier) aux fournisseurs habituels
function demandeReassort(liste) {
  if (!liste.length) return notify('Rien à réassortir.');
  const d = Stock.demandeReassort(liste);
  const c = nouvelleConsultation({ objet: `Réassort du stock (${liste.length} article${liste.length > 1 ? 's' : ''})`, affaireId: '', lignes: d.lignes, fournisseurs: d.fournisseurs });
  location.hash = `#/consultations/${c.id}`;
  App.toast('Demande de prix préparée : vérifiez les quantités puis envoyez-la aux fournisseurs');
}
// Choix d'articles de la bibliothèque à gérer en stock (emplacement et minimum communs, modifiables ensuite)
function choisirArticlesStock(ids) {
  const dispo = Store.all('articles').filter(a => !Stock.gere(a));
  const box = Modal.open(`<h2 style="margin-top:0">Mettre des articles en stock</h2>
    ${ids ? `<p>${ids.length} fourniture(s) sélectionnée(s) dans la bibliothèque.</p>` : `<input type="search" id="ca-q" placeholder="Rechercher une fourniture…" style="width:100%"><div id="ca-l" class="ca-liste"></div>`}
    <div class="grid2"><div class="field"><label for="ca-emp">Emplacement (rayonnage, bac)</label><input id="ca-emp" placeholder="Rayonnage A1"></div>
      <div class="field"><label for="ca-min">Quantité minimale (réassort en dessous)</label><input id="ca-min" type="number" min="0" step="any"></div>
      <div class="field"><label for="ca-re">Quantité à commander au réassort</label><input id="ca-re" type="number" min="0" step="any"></div>
      <div class="field"><label for="ca-qte">Quantité en stock aujourd'hui (inventaire)</label><input id="ca-qte" type="number" min="0" step="any"></div></div>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="ca-x">Annuler</button><button id="ca-ok">Mettre en stock</button></div>`);
  const choix = new Set(ids || []);
  const liste = () => { const z = box.querySelector('#ca-l'); if (!z) return; const q = RechercheArticles.norm(box.querySelector('#ca-q').value);
    z.innerHTML = dispo.filter(a => !q || RechercheArticles.norm(`${a.ref} ${a.designation} ${a.famille}`).includes(q)).slice(0, 60).map(a => `<label class="ca-l"><input type="checkbox" data-ca="${esc(a.id)}" ${choix.has(a.id) ? 'checked' : ''}> ${esc(a.designation)} <span class="muted small">${esc(a.ref || '')}</span></label>`).join('') || '<p class="muted small">Aucune fourniture.</p>';
    z.querySelectorAll('[data-ca]').forEach(cb => cb.onchange = () => (cb.checked ? choix.add(cb.dataset.ca) : choix.delete(cb.dataset.ca))); };
  if (!ids) { box.querySelector('#ca-q').oninput = liste; liste(); }
  box.querySelector('#ca-x').onclick = Modal.close;
  box.querySelector('#ca-ok').onclick = async () => {
    if (!choix.size) return notify('Choisissez au moins une fourniture.');
    const v = k => box.querySelector(k).value.trim(), nb = k => (v(k) === '' ? '' : Number(v(k).replace(',', '.')));
    const arts = [...choix].map(id => Store.get('articles', id)).filter(Boolean);
    await majArticles(arts, a => ({ ...a, stockGere: true, emplacement: v('#ca-emp') || a.emplacement || '', stockMini: nb('#ca-min') === '' ? a.stockMini || '' : nb('#ca-min'), stockReassort: nb('#ca-re') === '' ? a.stockReassort || '' : nb('#ca-re') }));
    if (nb('#ca-qte') !== '') arts.forEach(a => Store.upsert('mouvementsStock', { articleId: a.id, type: 'inventaire', qte: nb('#ca-qte'), date: isoDate(new Date()), userId: Store.me.userId || '', note: 'Mise en stock' }));
    if (typeof biblioEtat !== 'undefined') biblioEtat.sel.clear();
    Modal.close(); location.hash = '#/stock'; App.render(); App.toast(`${arts.length} article(s) en stock : imprimez leurs étiquettes QR`);
  };
}
// Étiquettes de l'outillage (hors véhicules) : l'outil devient « étiqueté », visible et sortable par les compagnons
async function etiquettesOutillage() {
  const l = outilsQr();
  if (!l.length) return notify('Aucun outillage dans le parc.');
  const box = Modal.open(`<h2 style="margin-top:0">Étiquettes QR de l'outillage</h2><p class="small muted">Un outil étiqueté se prend et se rend en scannant son étiquette, compagnons compris (affectation et historique du parc).</p>
    <div class="ca-liste">${l.map(m => `<label class="ca-l"><input type="checkbox" data-ou="${esc(m.id)}" checked> ${esc(m.designation)} <span class="muted small">${esc(m.categorie || '')}${m.scan ? ' · déjà étiqueté' : ''}</span></label>`).join('')}</div>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="ou-x">Annuler</button><button id="ou-ok">Imprimer les étiquettes</button></div>`);
  box.querySelector('#ou-x').onclick = Modal.close;
  box.querySelector('#ou-ok').onclick = async () => {
    const ch = [...box.querySelectorAll('[data-ou]:checked')].map(cb => Store.get('materiels', cb.dataset.ou)).filter(Boolean);
    if (!ch.length) return notify('Aucun outil coché.');
    ch.filter(m => !m.scan).forEach(m => Store.upsert('materiels', { ...m, scan: true }));
    Modal.close(); await imprimerEtiquettes(ch.map(itemOutil), 'Etiquettes-QR-outillage.pdf');
  };
}

/* ---------- Scanner (bureau et compagnons) ---------- */
const scanEtat = { flux: null, minuterie: 0 };
function arreterScan() { clearTimeout(scanEtat.minuterie); if (scanEtat.flux) scanEtat.flux.getTracks().forEach(t => t.stop()); scanEtat.flux = null; }
window.addEventListener('hashchange', () => { if (!/^#\/scan\/?$/.test(location.hash)) arreterScan(); });
// Lecture d'une image (photo de l'étiquette ou image de la caméra)
function lireQrImage(source, w, h) {
  const cv = document.createElement('canvas'), k = Math.min(1, 900 / Math.max(w, h)); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(source, 0, 0, cv.width, cv.height);
  const r = jsQR(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'attemptBoth' });
  return r ? r.data : '';
}
function ouvrirCode(texte) {
  const c = Stock.lire(texte);
  if (!c) return notify('Ce QR code n\'est pas une étiquette Pipe-Fit.');
  if (navigator.vibrate) navigator.vibrate(60);
  location.hash = `#/scan/${c.type}/${c.id}`;
}
async function demarrerScan(video, etat) {
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { etat.textContent = 'Caméra indisponible ici (adresse sans https ?) : prenez l\'étiquette en photo.'; return; }
  try { scanEtat.flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
  catch (e) { etat.textContent = 'Accès à la caméra refusé : autorisez-le, ou prenez l\'étiquette en photo.'; return; }
  video.srcObject = scanEtat.flux; video.setAttribute('playsinline', ''); video.muted = true; await video.play().catch(() => {});
  etat.textContent = 'Visez l\'étiquette QR…';
  const det = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
  const tour = async () => {
    if (!scanEtat.flux) return;
    if (video.readyState >= 2 && video.videoWidth) {
      let txt = '';
      try { if (det) { const r = await det.detect(video); txt = r[0] ? r[0].rawValue : ''; } else txt = lireQrImage(video, video.videoWidth, video.videoHeight); } catch (e) { txt = ''; }
      if (txt && Stock.lire(txt)) { arreterScan(); return ouvrirCode(txt); }
    }
    scanEtat.minuterie = setTimeout(tour, 180);
  };
  tour();
}

// Fiche ouverte au scan, scanner et catalogue de l'appli
Views.scan = (params = []) => {
  if (params[0] === 'a') return ficheArticleScan(Store.get('articles', params[1]));
  if (params[0] === 'm') return ficheOutilScan(Store.get('materiels', params[1]));
  if (params[0] === 'demande') return demandeMaterielHtml();
  const arts = Store.all('articles').filter(Stock.gere), outils = outilsQr().filter(m => m.scan);
  return `${Store.me.role === 'atelier' ? pointageTabs('scan', Store.me.userId) : '<div class="toolbar"><a class="btn secondary" href="#/stock">← Stock et QR codes</a></div>'}
  <h1>📷 Stock et outillage</h1>
  <a class="btn big secondary" href="#/scan/demande" style="display:block;text-align:center;margin-bottom:10px">🛒 Demande de matériel aux fournisseurs${lireDemande().lignes.length ? ` (${lireDemande().lignes.length} ligne(s) en cours)` : ''}</a>
  ${panierHtml()}
  <div class="card scan-card"><video id="sc-video" class="scan-video" playsinline muted></video><p id="sc-etat" class="small muted">Scannez l'étiquette QR d'un article du stock ou d'un outil.</p>
    <div class="toolbar" style="margin:0"><button id="sc-go" class="big">📷 Scanner une étiquette</button><label class="btn secondary">🖼️ Photo de l'étiquette<input type="file" id="sc-photo" accept="image/*" capture="environment" hidden></label></div></div>
  <h2>Catalogue ${esc(((Store.data.settings.societe || '').split('\n')[0] || 'Tecnitub'))}</h2>
  <input type="search" id="sc-q" placeholder="Pas d'étiquette ? Rechercher : coude DN50, bride, poste TIG…" aria-label="Rechercher dans le catalogue" style="width:100%;margin-bottom:8px">
  <div id="sc-liste">${catalogueScanHtml(arts, outils, '')}</div>`;
};
function catalogueScanHtml(arts, outils, q) {
  const nq = RechercheArticles.norm(q), ok = t => !nq || RechercheArticles.norm(t).includes(nq);
  const a = arts.filter(x => ok(`${x.ref} ${x.designation} ${x.famille} ${x.sousFamille} ${x.emplacement}`)).sort((x, y) => `${x.famille}${x.designation}`.localeCompare(`${y.famille}${y.designation}`));
  const o = outils.filter(m => ok(`${m.designation} ${m.categorie} ${m.marque}`));
  let fam = '';
  return `${a.map(x => `${x.famille !== fam ? `<div class="mat-famille">${esc((fam = x.famille) || 'Divers')}</div>` : ''}<a class="sc-item" href="#/scan/a/${esc(x.id)}">${vignettePhoto(x)}<span class="sc-txt"><strong>${esc(x.designation)}</strong><br><span class="small muted">${esc(x.ref || '')}${x.emplacement ? ` · 📍 ${esc(x.emplacement)}` : ''}</span></span><span class="small">${bureauStock() || Store.all('mouvementsStock') ? `${fmtQ(qteStock(x))} ${esc(x.unite || '')}` : ''}</span></a>`).join('')}
    ${o.length ? `<div class="mat-famille">Outillage</div>${o.map(m => `<a class="sc-item" href="#/scan/m/${esc(m.id)}">${vignettePhoto(m)}<span class="sc-txt"><strong>${esc(m.designation)}</strong><br><span class="small muted">${esc(m.categorie || '')}</span></span><span class="small">${(m.affectation || {}).userId || (m.affectation || {}).affaireId ? affectationTxt(m) : 'au dépôt'}</span></a>`).join('')}` : ''}
    ${!a.length && !o.length ? '<p class="muted small">Rien trouvé.</p>' : ''}`;
}
// Chantiers proposés : ceux du planning du jour et récents d'abord, puis tous les chantiers en cours
function optionsChantierScan(sel) {
  const proches = typeof chantiersProches === 'function' ? chantiersProches(Store.me.userId, isoDate(new Date()), 6).map(x => x.a) : [];
  const autres = chantiersActifs().filter(a => !proches.includes(a));
  return `<option value="">— Choisir le chantier —</option>${proches.length ? `<optgroup label="Mes chantiers">${proches.map(a => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(affaireLabel(a))}</option>`).join('')}</optgroup>` : ''}
    <optgroup label="Tous les chantiers">${autres.map(a => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(affaireLabel(a))}</option>`).join('')}</optgroup>`;
}
const dernierChantierScan = { id: '' };
// Panier de sortie gardé sur le téléphone (rechargement, coupure réseau)
const CLE_PANIER = 'pipefit-panier-sortie';
const lirePanier = () => { try { return JSON.parse(localStorage.getItem(CLE_PANIER)) || { affaireId: '', lignes: [] }; } catch (e) { return { affaireId: '', lignes: [] }; } };
const garderPanier = p => { try { localStorage.setItem(CLE_PANIER, JSON.stringify(p)); } catch (e) { /* stockage indisponible */ } };
function panierHtml() {
  const p = lirePanier();
  if (!p.lignes.length) return '';
  return `<div class="card panier"><h2 style="margin-top:0">🧺 Panier de sortie <span class="muted small">${p.lignes.length} article(s)</span></h2>
    ${p.lignes.map((l, i) => { const a = Store.get('articles', l.articleId) || { designation: 'Article supprimé', unite: '' }; return `<div class="panier-l">${vignettePhoto(a)}<span class="sc-txt"><strong>${esc(a.designation)}</strong><br><span class="small muted">${esc(a.ref || '')}</span></span>
      <span class="qte-pm petit"><button type="button" class="secondary" data-pn="${i}" data-d="-1" aria-label="Moins">−</button><input data-pq="${i}" type="number" inputmode="decimal" step="any" min="0" value="${l.qte}" aria-label="Quantité"><button type="button" class="secondary" data-pn="${i}" data-d="1" aria-label="Plus">+</button></span><span class="small">${esc(a.unite || '')}</span><button type="button" class="icon" data-px="${i}" aria-label="Retirer">✕</button></div>`; }).join('')}
    <div class="field"><label for="pn-ch">Chantier</label><select id="pn-ch">${optionsChantierScan(p.affaireId || dernierChantierScan.id)}</select></div>
    <div class="toolbar" style="margin-bottom:0"><button id="pn-ok" class="big">⬆️ Sortir tout pour ce chantier</button><button id="pn-vider" class="secondary">Vider le panier</button></div></div>`;
}
function ficheArticleScan(a) {
  if (!a) return '<p>Article introuvable (étiquette d\'un article supprimé ?). <a href="#/scan">Retour</a></p>';
  const q = qteStock(a), hist = Stock.historique(a.id, consosStock(), mvtsStock()).slice(-6).reverse();
  return `<div class="toolbar"><a class="btn secondary" href="#/scan">← Scanner</a>${bureauStock() ? '<a class="btn secondary" href="#/stock">Stock</a>' : ''}</div>
  ${a.photoId ? `<img class="scan-photo" src="${esc(fileUrl(a.photoId))}" alt="Photo de l'article">` : ''}<h1>${esc(a.designation)}</h1>
  <p class="muted">${esc([a.ref, a.famille, a.sousFamille].filter(Boolean).join(' · '))}${a.emplacement ? `<br>📍 ${esc(a.emplacement)}` : ''}</p>
  ${Stock.gere(a) ? `<p>En stock : <strong>${fmtQ(q)} ${esc(a.unite || '')}</strong> ${badgeStock(a, q)}</p>` : '<p class="small muted">Article de la bibliothèque non géré en stock.</p>'}
  <div class="card"><div class="grid2"><div class="field"><label for="sa-q">Quantité (${esc(a.unite || 'u')})</label><div class="qte-pm"><button type="button" class="secondary" data-pm="-1" aria-label="Moins">−</button><input id="sa-q" type="number" inputmode="decimal" step="any" min="0" value="1"><button type="button" class="secondary" data-pm="1" aria-label="Plus">+</button></div></div>
    <div class="field"><label for="sa-ch">Chantier</label><select id="sa-ch">${optionsChantierScan(dernierChantierScan.id)}</select></div></div>
    <div class="field"><label for="sa-n">Note (facultatif)</label><input id="sa-n" placeholder="Repère, ouvrage…"></div>
    <div class="toolbar" style="margin-bottom:0"><button id="sa-sortir" class="big">⬆️ Sortir pour ce chantier</button><button id="sa-panier" class="secondary">🧺 Ajouter au panier et scanner le suivant</button><button id="sa-retour" class="secondary">⬇️ Remettre en stock</button></div></div>
  ${bureauStock() ? `<div class="toolbar"><label class="btn secondary">📷 ${a.photoId ? 'Changer la photo' : 'Photo de l\'article'}<input type="file" accept="image/*" capture="environment" data-ph-art="${esc(a.id)}" hidden></label><button class="secondary" id="sa-entree">Entrée en stock</button><button class="secondary" id="sa-inv">Inventaire</button><button class="secondary" id="sa-reass">🛒 Demande de prix de réassort</button><button class="secondary" id="sa-etq">🏷️ Étiquette</button><button class="secondary" id="sa-modif">Modifier l'article</button></div>` : ''}
  ${hist.length ? `<h2>Derniers mouvements</h2><ul class="hist-relances">${hist.map(m => `<li>${dateFr(m.date)} · ${{ sortie: 'Sortie', retour: 'Retour', entree: 'Entrée', inventaire: 'Inventaire' }[m.type]} ${fmtQ(Math.abs(m.qte))} ${esc(a.unite || '')}${m.affaireId ? ` · ${esc(affaireLabel(affaireOf(m.affaireId)))}` : ''}${m.userId ? ` · ${esc(userName(m.userId))}` : ''}${m.note ? ` · ${esc(m.note)}` : ''}</li>`).join('')}</ul>` : ''}`;
}
function ficheOutilScan(m) {
  if (!m) return '<p>Outil introuvable ou non étiqueté. <a href="#/scan">Retour</a></p>';
  const af = m.affectation || {}, chezMoi = af.userId && af.userId === Store.me.userId;
  return `<div class="toolbar"><a class="btn secondary" href="#/scan">← Scanner</a>${bureauStock() ? `<a class="btn secondary" href="#/parc">Parc</a>` : ''}</div>
  ${m.photoId ? `<img class="scan-photo" src="${esc(fileUrl(m.photoId))}" alt="Photo de l'outil">` : ''}<h1>🔧 ${esc(m.designation)}</h1>
  <p class="muted">${esc([m.categorie, m.marque, m.numeroSerie && `n° ${m.numeroSerie}`].filter(Boolean).join(' · '))}</p>
  <p>Actuellement : ${af.userId || af.affaireId ? affectationTxt(m) : '<strong>au dépôt</strong>'}${af.depuis ? ` <span class="small muted">depuis le ${dateFr(af.depuis)}</span>` : ''}</p>
  ${typeof prochaineEcheance === 'function' && prochaineEcheance(m) ? `<p class="small">Prochain contrôle : ${badgeEcheance(prochaineEcheance(m), isoDate(new Date()))}</p>` : ''}
  <div class="card">${chezMoi ? '' : `<div class="field"><label for="so-ch">Chantier (facultatif)</label><select id="so-ch">${optionsChantierScan(dernierChantierScan.id)}</select></div>`}
    <div class="toolbar" style="margin-bottom:0">${bureauStock() && Store.can('write', 'materiels') ? `<label class="btn secondary">📷 ${m.photoId ? 'Changer la photo' : 'Photo de l\'outil'}<input type="file" accept="image/*" capture="environment" data-ph-mat="${esc(m.id)}" hidden></label>` : ''}${chezMoi ? '' : '<button id="so-prendre" class="big">✋ Je le prends</button>'}${af.userId || af.affaireId ? '<button id="so-rendre" class="secondary">↩️ Rendu au dépôt</button>' : ''}</div></div>`;
}
Views.scan.bind = (root, params = []) => {
  const $ = s => root.querySelector(s);
  if (params[0] === 'demande') return bindDemandeMateriel(root);
  if (params[0] === 'a') {
    const a = Store.get('articles', params[1]); if (!a) return;
    root.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { const i = $('#sa-q'); i.value = Math.max(0, (Number(i.value) || 0) + Number(b.dataset.pm)); });
    const enreg = signe => {
      try {
        const ch = $('#sa-ch').value; dernierChantierScan.id = ch;
        const o = Stock.sortie(a, { qte: signe * Number(String($('#sa-q').value).replace(',', '.')), affaireId: ch, userId: Store.me.userId || '', date: isoDate(new Date()), note: $('#sa-n').value.trim() });
        Store.upsert('consommations', o);
        App.toast(`${signe > 0 ? 'Sortie' : 'Retour'} enregistré${signe > 0 ? 'e' : ''} : ${fmtQ(Math.abs(o.qte))} ${a.unite || ''} ${a.designation} — ${affaireLabel(affaireOf(ch))}`, 4500);
        location.hash = '#/scan';
      } catch (e) { notify(e.message); }
    };
    $('#sa-sortir').onclick = () => enreg(1);
    $('#sa-retour').onclick = () => enreg(-1);
    // Panier : l'article s'ajoute, le scanner se rouvre pour le suivant
    $('#sa-panier').onclick = () => {
      const q = Number(String($('#sa-q').value).replace(',', '.'));
      if (!(q > 0)) return notify('Indiquez la quantité.');
      const p = Stock.panierAjouter(lirePanier(), a.id, q); if ($('#sa-ch').value) p.affaireId = $('#sa-ch').value;
      garderPanier(p); scanEtat.relancer = true;
      App.toast(`${a.designation} ajouté au panier (${p.lignes.length} article(s))`); location.hash = '#/scan';
    };
    const on = (s, f) => { const b = $(s); if (b) b.onclick = f; };
    on('#sa-entree', () => mouvementStock(a, 'entree'));
    on('#sa-inv', () => mouvementStock(a, 'inventaire'));
    on('#sa-reass', () => { const q = qteStock(a); demandeReassort([{ a, q, commande: Stock.aCommander(a, q) }]); });
    on('#sa-etq', () => imprimerEtiquettes([itemArticle(a)], `Etiquette-${a.ref || a.id}.pdf`.replace(/[^\w.-]+/g, '_')));
    lierPhotos(root);
    on('#sa-modif', () => editArticle({ ...a }));
    return;
  }
  if (params[0] === 'm') {
    const m = Store.get('materiels', params[1]); if (!m) return;
    const action = async act => {
      const ch = $('#so-ch') ? $('#so-ch').value : ''; dernierChantierScan.id = ch || dernierChantierScan.id;
      try {
        const rec = await api('POST', '/api/parc/scan', { materielId: m.id, action: act, affaireId: ch });
        if (rec) Store._put('materiels', { ...Store.get('materiels', m.id), ...rec });
        App.toast(act === 'prendre' ? `${m.designation} : pris${ch ? ` pour ${affaireLabel(affaireOf(ch))}` : ''}` : `${m.designation} : rendu au dépôt`, 4000);
        location.hash = '#/scan';
      } catch (e) { notify(e.message); }
    };
    lierPhotos(root);
    const p = $('#so-prendre'); if (p) p.onclick = () => action('prendre');
    const r = $('#so-rendre'); if (r) r.onclick = () => action('rendre');
    return;
  }
  // Panier de sortie : quantités, retrait, chantier, sortie groupée
  const majP = fn => { const p = lirePanier(); fn(p); p.lignes = p.lignes.filter(l => l.qte > 0); garderPanier(p); App.render(); };
  root.querySelectorAll('[data-pn]').forEach(b => b.onclick = () => majP(p => { const l = p.lignes[+b.dataset.pn]; l.qte = Math.max(0, Math.round((Number(l.qte) + Number(b.dataset.d)) * 1000) / 1000); }));
  root.querySelectorAll('[data-pq]').forEach(i => i.onchange = () => majP(p => { p.lignes[+i.dataset.pq].qte = Number(String(i.value).replace(',', '.')) || 0; }));
  root.querySelectorAll('[data-px]').forEach(b => b.onclick = () => majP(p => { p.lignes.splice(+b.dataset.px, 1); }));
  const pch = $('#pn-ch'); if (pch) pch.onchange = () => { const p = lirePanier(); p.affaireId = pch.value; garderPanier(p); };
  const pv = $('#pn-vider'); if (pv) pv.onclick = async () => { if (await ask('Vider le panier sans rien sortir ?', 'Vider')) { garderPanier({ affaireId: '', lignes: [] }); App.render(); } };
  const pok = $('#pn-ok'); if (pok) pok.onclick = () => {
    try {
      const p = lirePanier(), ch = $('#pn-ch').value;
      const ss = Stock.panierSorties(p, Store.all('articles'), { affaireId: ch, userId: Store.me.userId || '', date: isoDate(new Date()) });
      ss.forEach(o => Store.upsert('consommations', o));
      dernierChantierScan.id = ch; garderPanier({ affaireId: '', lignes: [] });
      App.render(); App.toast(`${ss.length} article(s) sorti(s) pour ${affaireLabel(affaireOf(ch))}`, 5000);
    } catch (e) { notify(e.message); }
  };
  if (scanEtat.relancer) { scanEtat.relancer = false; setTimeout(() => { const b = document.querySelector('#sc-go'); if (b) b.click(); }, 50); }
  $('#sc-go').onclick = () => { $('#sc-video').classList.add('actif'); demarrerScan($('#sc-video'), $('#sc-etat')); };
  $('#sc-photo').onchange = ev => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => { const t = lireQrImage(img, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(url); if (t) ouvrirCode(t); else notify('Aucun QR code lisible sur la photo : rapprochez-vous de l\'étiquette.'); };
    img.src = url;
  };
  const arts = Store.all('articles').filter(Stock.gere), outils = outilsQr().filter(m => m.scan);
  $('#sc-q').oninput = ev => { $('#sc-liste').innerHTML = catalogueScanHtml(arts, outils, ev.target.value); };
};

/* ---------- Demande de matériel du terrain : consultation des fournisseurs ---------- */
// Lignes de la bibliothèque (fournisseur préféré et autres consultés de l'article) ou libres avec leur type de matériel
// (fournisseurs de la famille) ; « Consulter les fournisseurs » envoie tout de suite les demandes de prix par e-mail.
const CLE_DEMANDE = 'pipefit-demande-materiel';
const lireDemande = () => { try { return { affaireId: '', date: '', note: '', lignes: [], ...(JSON.parse(localStorage.getItem(CLE_DEMANDE)) || {}) }; } catch (e) { return { affaireId: '', date: '', note: '', lignes: [] }; } };
const garderDemande = d => { try { localStorage.setItem(CLE_DEMANDE, JSON.stringify(d)); } catch (e) { /* stockage indisponible */ } };
let resultatDemande = null;
function demandeMaterielHtml() {
  const d = lireDemande(), fams = typeof famillesArticles === 'function' ? famillesArticles() : [];
  return `${Store.me.role === 'atelier' ? pointageTabs('scan', Store.me.userId) : ''}<div class="toolbar"><a class="btn secondary" href="#/scan">← Stock</a></div>
  <h1>🛒 Demande de matériel</h1>
  ${resultatDemande ? resultatDemandeHtml(resultatDemande) : ''}
  <div class="card"><div class="field"><label for="dm-ch">Chantier</label><select id="dm-ch">${optionsChantierScan(d.affaireId || dernierChantierScan.id)}</select></div>
    ${d.lignes.length ? d.lignes.map((l, i) => `<div class="panier-l"><span class="sc-txt"><strong>${esc(l.designation)}</strong><br><span class="small muted">${esc([l.ref, l.famille].filter(Boolean).join(' · ') || 'ligne libre')}</span></span>
      <span class="qte-pm petit"><button type="button" class="secondary" data-dq="${i}" data-d="-1" aria-label="Moins">−</button><input data-dqv="${i}" type="number" inputmode="decimal" step="any" min="0" value="${l.qte}" aria-label="Quantité"><button type="button" class="secondary" data-dq="${i}" data-d="1" aria-label="Plus">+</button></span><span class="small">${esc(l.unite || '')}</span><button type="button" class="icon" data-dx="${i}" aria-label="Retirer">✕</button></div>`).join('')
      : '<p class="muted small">Ajoutez le matériel : recherchez-le dans la bibliothèque ou écrivez-le avec son type.</p>'}
    <h3>Ajouter depuis la bibliothèque</h3>
    <input type="search" id="dm-q" placeholder="Coude inox DN50, bride, vanne papillon…" aria-label="Rechercher dans la bibliothèque" style="width:100%"><div id="dm-res"></div>
    <h3>Ou écrire une ligne</h3>
    <div class="grid2"><div class="field"><label for="dm-des">Désignation</label><input id="dm-des" placeholder="Robinet 1/4 tour laiton DN20"></div>
      <div class="field"><label for="dm-fam">Type de matériel</label><select id="dm-fam"><option value="">— Choisir —</option>${fams.map(f => `<option>${esc(f)}</option>`).join('')}</select></div>
      <div class="field"><label for="dm-qte">Quantité</label><input id="dm-qte" type="number" inputmode="decimal" step="any" min="0" value="1"></div>
      <div class="field"><label for="dm-u">Unité</label><select id="dm-u">${optionsStr(['u', 'ml', 'm²', 'kg', 'lot'], 'u')}</select></div></div>
    <button class="secondary" id="dm-libre">+ Ajouter la ligne</button>
    <div class="grid2" style="margin-top:10px"><div class="field"><label for="dm-date">Livraison souhaitée le</label><input id="dm-date" type="date" value="${esc(d.date || '')}"></div>
      <div class="field"><label for="dm-note">Message aux fournisseurs (facultatif)</label><input id="dm-note" value="${esc(d.note || '')}" placeholder="Livraison sur chantier avant 8 h…"></div></div>
    <button class="big" id="dm-go" ${d.lignes.length ? '' : 'disabled'}>📨 Consulter les fournisseurs</button>
    <p class="small muted">Chaque ligne part chez le fournisseur préféré et les autres fournisseurs consultés de l'article (ou de son type de matériel), par e-mail, avec le chantier et la date. Le chargé d'affaires est prévenu et compare les offres.</p></div>
  <h2>📋 Mes demandes</h2><div id="dm-mes"><p class="muted small">Chargement…</p></div>`;
}
function resultatDemandeHtml(r) {
  if (r.enAttente) return '<div class="card warn-card">⏳ Pas de réseau : la demande partira automatiquement au retour de la connexion.</div>';
  return `<div class="card ${r.envoyes ? '' : 'warn-card'}"><strong>📨 ${r.envoyes} demande(s) de prix envoyée(s)${r.demo ? ' (démonstration : e-mails simulés)' : ''}</strong>
    ${r.consultations.map(c => `<p class="small" style="margin:6px 0 0"><strong>${esc(c.ref || '')}</strong> · ${c.lignes} ligne(s) : ${c.fournisseurs.map(f => `${esc(f.nom)} ${f.envoye ? '✅' : `⚠️ <span class="muted">${esc(f.raison)}</span>`}`).join(', ')}</p>`).join('')}
    ${r.aChoisir ? `<p class="small warn-text">${r.aChoisir.lignes} ligne(s) sans fournisseur connu : le bureau les envoie (${esc(r.aChoisir.ref || '')}).</p>` : ''}</div>`;
}
// Suivi des demandes : envoyée, offres reçues, commandée (fournisseur, livraison prévue), livrée — sans prix
const BADGE_DEMANDE = { envoyee: 'b-info', offres: 'b-warn', commandee: 'b-ok', partielle: 'b-warn', livree: 'b-ok', bureau: 'b-warn', close: '' };
function mesDemandesHtml(l) {
  if (!l || !l.length) return '<p class="muted small">Aucune demande ces deux derniers mois.</p>';
  return l.map(d => `<div class="card demande-l"><div class="toolbar" style="margin:0;justify-content:space-between"><strong>${esc(d.ref)}</strong><span class="badge ${BADGE_DEMANDE[d.etat] || ''}">${esc(d.libelle)}</span></div>
    <div class="small muted">${dateFr(d.date)} · ${esc(affaireLabel(affaireOf(d.affaireId)))}</div>
    <div class="small">${d.lignes.slice(0, 4).map(x => `${esc(x.designation)} × ${fmtQ(x.qte)} ${esc(x.unite)}`).join(' · ')}${d.lignes.length > 4 ? ` · +${d.lignes.length - 4}` : ''}</div>
    ${d.commande ? `<div class="small">🧾 Commande ${esc(d.commande.numero)} chez <strong>${esc(d.commande.fournisseur)}</strong>${d.commande.dateLivraison ? ` · livraison prévue le <strong>${dateFr(d.commande.dateLivraison)}</strong>` : ''}${d.commande.auto ? ' · commandée automatiquement' : ''}</div>` : ''}</div>`).join('');
}
async function chargerMesDemandes() {
  const z = document.querySelector('#dm-mes'); if (!z) return;
  let l = null;
  try { l = await api('GET', '/api/consultations/terrain/miennes'); HorsLigne.garder('mes-demandes', l); } catch (e) { l = await HorsLigne.relire('mes-demandes'); }
  const z2 = document.querySelector('#dm-mes'); if (z2) z2.innerHTML = mesDemandesHtml(l);
}
function bindDemandeMateriel(root) {
  chargerMesDemandes();
  const $ = s => root.querySelector(s), maj = fn => { const d = lireDemande(); fn(d); d.lignes = d.lignes.filter(l => Number(l.qte) > 0); garderDemande(d); resultatDemande = null; App.render(); };
  const champs = () => { const d = lireDemande(); d.affaireId = $('#dm-ch').value; d.date = $('#dm-date').value; d.note = $('#dm-note').value; garderDemande(d); };
  ['#dm-ch', '#dm-date', '#dm-note'].forEach(k => { $(k).onchange = champs; });
  root.querySelectorAll('[data-dq]').forEach(b => b.onclick = () => maj(d => { const l = d.lignes[+b.dataset.dq]; l.qte = Math.max(0, Math.round((Number(l.qte) + Number(b.dataset.d)) * 1000) / 1000); }));
  root.querySelectorAll('[data-dqv]').forEach(i => i.onchange = () => maj(d => { d.lignes[+i.dataset.dqv].qte = Number(String(i.value).replace(',', '.')) || 0; }));
  root.querySelectorAll('[data-dx]').forEach(b => b.onclick = () => maj(d => { d.lignes.splice(+b.dataset.dx, 1); }));
  const ajouter = l => maj(d => { const ex = l.articleId && d.lignes.find(x => x.articleId === l.articleId); if (ex) ex.qte = Number(ex.qte) + Number(l.qte); else d.lignes.push(l); });
  $('#dm-q').oninput = ev => {
    const q = RechercheArticles.norm(ev.target.value), z = $('#dm-res');
    if (q.length < 2) { z.innerHTML = ''; return; }
    const l = Store.all('articles').filter(a => RechercheArticles.norm(`${a.ref} ${a.designation} ${a.famille} ${a.sousFamille}`).includes(q)).slice(0, 12);
    z.innerHTML = l.map(a => `<button type="button" class="sc-item linklike" data-dart="${esc(a.id)}" style="width:100%;text-align:left">${vignettePhoto(a)}<span class="sc-txt"><strong>${esc(a.designation)}</strong><br><span class="small muted">${esc([a.ref, a.famille].filter(Boolean).join(' · '))}</span></span><span>＋</span></button>`).join('') || '<p class="small muted">Rien dans la bibliothèque : écrivez la ligne ci-dessous.</p>';
    z.querySelectorAll('[data-dart]').forEach(b => b.onclick = () => { const a = Store.get('articles', b.dataset.dart); champs(); ajouter({ articleId: a.id, designation: a.designation, ref: a.ref || '', famille: a.famille || '', unite: a.unite || 'u', qte: 1 }); });
  };
  $('#dm-libre').onclick = () => {
    const des = $('#dm-des').value.trim(), q = Number(String($('#dm-qte').value).replace(',', '.'));
    if (!des) return notify('Écrivez la désignation.');
    if (!$('#dm-fam').value) return notify('Choisissez le type de matériel : il désigne les fournisseurs consultés.');
    champs(); ajouter({ articleId: '', designation: des, ref: '', famille: $('#dm-fam').value, unite: $('#dm-u').value, qte: q > 0 ? q : 1 });
  };
  $('#dm-go').onclick = async ev => {
    champs();
    const d = lireDemande();
    if (!d.affaireId) return notify('Choisissez le chantier.');
    ev.target.disabled = true;
    try {
      const r = await HorsLigne.appeler('POST', '/api/consultations/terrain', { affaireId: d.affaireId, date: d.date, note: d.note, lignes: d.lignes.map(l => ({ articleId: l.articleId, designation: l.designation, famille: l.famille, unite: l.unite, qte: l.qte })) });
      resultatDemande = r.enAttente ? { enAttente: true } : r.reponse;
      dernierChantierScan.id = d.affaireId; garderDemande({ affaireId: d.affaireId, date: '', note: '', lignes: [] });
      if (!r.enAttente) setTimeout(chargerMesDemandes, 300);
      App.render(); App.toast(r.enAttente ? 'Demande gardée : elle partira au retour du réseau' : `${resultatDemande.envoyes} demande(s) de prix envoyée(s) aux fournisseurs`, 5000);
    } catch (e) { ev.target.disabled = false; notify(e.message); }
  };
}
