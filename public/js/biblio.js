// Bibliothèque : fournitures (prix d'achat / vente, fournisseur), taux de main-d'œuvre, tarifs de livraison.
const articleFields = [
  { key: 'ref', label: 'Référence' },
  { key: 'designation', label: 'Désignation' },
  { key: 'famille', label: 'Famille', get datalist() { return famillesArticles(); } },
  { key: 'sousFamille', label: 'Sous-famille', get datalist() { return sousFamillesArticles(); } },
  { key: 'gamme', label: 'Gamme (3e niveau de catégorie)' },
  { key: 'unite', label: 'Unité', type: 'select', options: v => optionsStr([...new Set([...UNITES, v || 'u'])], v || 'u') },
  { key: 'coutRevient', label: "Prix d'achat HT", type: 'number', step: '0.00001' },
  { key: 'marge', label: 'Marge (%) — prix de vente = achat × (1 + marge)', type: 'number', step: '0.01' },
  { key: 'prixVente', label: 'Prix de vente HT (calculé si la marge est saisie)', type: 'number', step: '0.01' },
  { key: 'poidsUnitaire', label: 'Poids / unité (kg)', type: 'number', step: '0.1' },
  { key: 'photoUrl', label: 'Lien de la photo (récupérée par « 🖼 Photos et fiches »)' },
  { key: 'ficheUrl', label: 'Lien de la fiche technique (PDF)' },
  { key: 'fournisseurId', label: 'Fournisseur par défaut', type: 'select', options: v => options(fournisseursList(), v) },
  { key: 'delai', label: 'Délai de livraison chez ce fournisseur (jours)', type: 'number', step: '1' },
  // Stock de l'atelier (étiquette QR) : emplacement, minimum avant réassort, quantité commandée au réassort
  { key: 'stockGere', label: 'Géré en stock (étiquette QR)', type: 'select', options: v => optionsStr(['Non', 'Oui'], v === true || v === 'Oui' ? 'Oui' : 'Non') },
  { key: 'emplacement', label: 'Emplacement en stock' },
  { key: 'stockMini', label: 'Stock minimum (réassort en dessous)', type: 'number', step: 'any' },
  { key: 'stockReassort', label: 'Quantité commandée au réassort', type: 'number', step: 'any' },
];
const moFields = [
  { key: 'code', label: 'Code' },
  { key: 'libelle', label: 'Catégorie' },
  { key: 'tauxVente', label: 'Taux horaire de vente €/h', type: 'number', step: '0.5' },
  { key: 'tauxCout', label: 'Coût horaire moyen chargé €/h', type: 'number', step: '0.5' },
];
const zoneFields = [
  { key: 'nom', label: 'Nom de la zone' },
  { key: 'forfait', label: 'Forfait facturé HT', type: 'number', step: '0.01' },
  { key: 'prixParTonne', label: 'Prix facturé / tonne', type: 'number', step: '0.01' },
  { key: 'coutTransporteur', label: 'Coût transporteur (forfait)', type: 'number', step: '0.01' },
  { key: 'coutParTonne', label: 'Coût transporteur / tonne', type: 'number', step: '0.01' },
];

// Fiche d'une fourniture : champs habituels, puis un fournisseur par défaut et 3 autres (variantes, chacune avec son prix d'achat) avec le préféré (demandes de prix)
function editArticle(obj, base) {
  const o = base ? { ...base } : obj, titre = base ? obj.titre : 'Fourniture';
  editModal({ title: titre, col: 'articles', fields: articleFields, obj: o, beforeSave: x => {
    if (x.marge !== '' && x.marge !== undefined && x.marge !== null && Number.isFinite(+x.marge) && Number(x.coutRevient) > 0) x.prixVente = Math.round(Number(x.coutRevient) * (1 + Number(x.marge) / 100) * 100) / 100;
    else if ((x.prixVente === '' || x.prixVente === undefined || x.prixVente === null || Number(x.prixVente) === 0) && Number(x.coutRevient) > 0 && typeof BiblioOutils !== 'undefined') { const mc = BiblioOutils.margeCategorie(x, margesCategories()); if (mc) x.prixVente = Math.round(Number(x.coutRevient) * (1 + mc.marge / 100) * 100) / 100; }
    const sel = [...document.querySelectorAll('#modal [data-fc-autre]')].map(s => { const r = s.closest('.fc-var'); return [s.value, r.querySelector('[data-fc-prix]').value, r.querySelector('[data-fc-delai]').value]; }).filter(([v]) => v && v !== x.fournisseurId);
    x.fournisseursConsult = [...new Set(sel.map(s => s[0]))].slice(0, ConsultTerrain.MAX_AUTRES);
    const pf = {}; sel.forEach(([fid, p, d]) => { if (!x.fournisseursConsult.includes(fid)) return; const v = { ...((o.prixFournisseurs || {})[fid] || {}) }; if (p !== '' && Number.isFinite(+p)) v.coutRevient = +p; else delete v.coutRevient; if (d !== '' && Number.isFinite(+d)) v.delai = +d; else delete v.delai; pf[fid] = v; });
    x.prixFournisseurs = Object.fromEntries(Object.entries(pf).filter(([, v]) => Object.keys(v).length));
  } });
  const box = document.querySelector('#modal .modal-box') || document.querySelector('.modal-box'), act = box && box.querySelector('.modal-actions');
  if (!act) return;
  const autres = (o.fournisseursConsult || []).slice(0, ConsultTerrain.MAX_AUTRES);
  // Marge de la catégorie quand l'article n'a pas la sienne
  const mc = typeof BiblioOutils !== 'undefined' && (o.marge === '' || o.marge === undefined || o.marge === null) && BiblioOutils.margeCategorie(o, margesCategories());
  const im = box.querySelector('[name="marge"], #f-marge'); if (mc && im) { im.placeholder = `${mc.marge} % (catégorie ${mc.chemin.replace(/\|/g, ' › ')})`; }
  act.insertAdjacentHTML('beforebegin', `<fieldset class="hd-bloc"><legend>Variantes fournisseur : ${ConsultTerrain.MAX_AUTRES} autres au plus</legend>
    <p class="small muted" style="margin-top:0">La même fourniture chez d'autres fournisseurs, avec leur prix d'achat. Avec le fournisseur par défaut, ils reçoivent les demandes de prix de cet article (bureau et demandes du terrain).</p>
    ${Array.from({ length: ConsultTerrain.MAX_AUTRES }, (_, i) => { const p = (o.prixFournisseurs || {})[autres[i]] || {}; return `<div class="grid2 fc-var"><div class="field"><label>Fournisseur ${i + 2}</label><select data-fc-autre="${i}"><option value="">—</option>${options(fournisseursList(), autres[i] || '')}</select></div><div class="field"><label>Prix d'achat HT chez ce fournisseur</label><input type="number" step="0.00001" data-fc-prix="${i}" value="${p.coutRevient ?? ''}"></div><div class="field"><label>Délai (jours)</label><input type="number" step="1" data-fc-delai="${i}" value="${p.delai ?? ''}"></div></div>`; }).join('')}</fieldset>
    ${typeof offresArticleHtml === 'function' && o.id ? offresArticleHtml(o) + historiquePrixHtml(o) : ''}`);
}
// Fournisseurs consultés par famille (lignes libres des demandes du terrain, articles sans fournisseur)
async function fournisseursParFamille() {
  let c = {};
  try { c = await api('GET', '/api/achats/familles-fournisseurs'); } catch (e) { return notify(e.message); }
  const fams = famillesArticles(), sel = (f, i, v) => `<select data-ff="${esc(f)}" data-i="${i}" aria-label="${i ? `Fournisseur ${i + 1}` : 'Fournisseur préféré'} — ${esc(f)}"><option value="">—</option>${options(fournisseursList(), v || '')}</select>`;
  const box = Modal.open(`<h2 style="margin-top:0">🏭 Fournisseurs consultés par famille</h2>
    <p class="small muted">Pour une ligne libre d'une demande de matériel (« type de matériel ») ou un article sans fournisseur : le préféré et jusqu'à ${ConsultTerrain.MAX_AUTRES} autres reçoivent la demande de prix.</p>
    <div class="table-wrap" style="max-height:60vh"><table><tr><th>Famille</th><th>Préféré</th>${Array.from({ length: ConsultTerrain.MAX_AUTRES }, (_, i) => `<th>Fournisseur ${i + 2}</th>`).join('')}</tr>
      ${fams.map(f => { const x = c[f] || {}; return `<tr><td><strong>${esc(f)}</strong></td><td>${sel(f, 0, x.prefere)}</td>${Array.from({ length: ConsultTerrain.MAX_AUTRES }, (_, i) => `<td>${sel(f, i + 1, (x.autres || [])[i])}</td>`).join('')}</tr>`; }).join('')}</table></div>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="ff-x">Annuler</button><button id="ff-ok">Enregistrer</button></div>`);
  box.classList.add('wide');
  box.querySelector('#ff-x').onclick = Modal.close;
  box.querySelector('#ff-ok').onclick = async () => {
    const out = {};
    box.querySelectorAll('[data-ff]').forEach(s => { if (!s.value) return; const f = s.dataset.ff, x = out[f] || (out[f] = { prefere: '', autres: [] }); if (s.dataset.i === '0') x.prefere = s.value; else x.autres.push(s.value); });
    try { await api('PUT', '/api/achats/familles-fournisseurs', out); if (typeof famillesFournisseursCache !== 'undefined') famillesFournisseursCache = out; Modal.close(); App.toast('Fournisseurs par famille enregistrés'); } catch (e) { notify(e.message); }
  };
}

function biblioTabs(active) {
  return `<div class="tabs">
    <a href="#/articles" class="${active === 'articles' ? 'active' : ''}">Fournitures <span class="count">${Store.all('articles').length}</span></a>
    <a href="#/mainoeuvre" class="${active === 'mo' ? 'active' : ''}">Main-d'œuvre <span class="count">${Store.all('mainoeuvre').length}</span></a>
    <a href="#/livraison" class="${active === 'livraison' ? 'active' : ''}">Livraison <span class="count">${Store.all('zones').length}</span></a>
    <a href="#/ouvrages" class="${active === 'ouvrages' ? 'active' : ''}">Ouvrages types <span class="count">${Store.all('ouvrages').length}</span></a>
    <a href="#/familles" class="${active === 'familles' ? 'active' : ''}">Familles CAO <span class="count">${Store.all('familles').length}</span></a>
    <a href="#/stock" class="${active === 'stock' ? 'active' : ''}">📦 Stock et QR codes <span class="count">${Store.all('articles').filter(Stock.gere).length}</span></a>
    <a href="#/fichesTech" class="${active === 'fiches' ? 'active' : ''}">📄 Fiches techniques <span class="count">${Store.all('fichesTech').filter(f => !f.remplaceePar && !f.absente).length}</span></a>
  </div>`;
}

/* ---------------- Fournitures : rangement par famille / sous-famille, recherche ---------------- */
const FAMILLES_TYPES = ['Tubes', 'Raccords', 'Robinetterie', 'Supportage', 'Visserie et joints', 'Calorifuge', 'Location', 'Contrôles', 'Sous-traitance'];
const famillesArticles = () => [...new Set([...FAMILLES_TYPES, ...Store.all('articles').map(a => String(a.famille || '').trim()).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
const sousFamillesArticles = fam => [...new Set(Store.all('articles').filter(a => !fam || a.famille === fam).map(a => String(a.sousFamille || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const biblioEtat = { q: '', famille: '', sous: '', gamme: '', sel: new Set() };
const fournisseurArticle = a => (a.fournisseurId ? clientName(a.fournisseurId) : '');

function arbreFamilles() {
  const tous = Store.all('articles'), e = biblioEtat;
  const lien = (f, s, lib, n, extra = '', g = '') => `<div class="arb-l ${g ? 'sous gam' : s ? 'sous' : ''} ${e.famille === f && e.sous === s && (e.gamme || '') === g ? 'actif' : ''}" ${g ? 'style="padding-left:18px"' : ''}><button class="linklike" data-f="${esc(f)}" data-s="${esc(s)}" data-g="${esc(g)}">${esc(lib)} <span class="count">${n}</span></button>${extra}</div>`;
  const ren = (f, s) => (Store.can('write', 'articles') && f !== RechercheArticles.SANS ? `<button class="icon" data-ren="${esc(f)}" data-ren-s="${esc(s)}" title="Renommer" aria-label="Renommer">✎</button>` : '');
  return lien('', '', 'Toutes les fournitures', tous.length)
    + RechercheArticles.arbre(tous).map(f => lien(f.nom, '', f.nom, f.n, ren(f.nom, ''))
      + (e.famille === f.nom || !e.famille ? f.sous.map(s => lien(f.nom, s.nom, s.nom, s.n, ren(f.nom, s.nom))
        + (e.famille === f.nom && e.sous === s.nom ? (s.gammes || []).map(g => lien(f.nom, s.nom, `› ${g.nom}`, g.n, '', g.nom)).join('') : '')).join('') : '')).join('');
}
function listeArticles() {
  const e = biblioEtat;
  const list = RechercheArticles.filtrer(Store.all('articles'), { q: e.q, famille: e.famille, sousFamille: e.sous, gamme: e.gamme || '', fournisseurDe: fournisseurArticle });
  const groupe = a => `${RechercheArticles.familleDe(a)}${a.sousFamille ? ` › ${a.sousFamille}` : ''}`;
  const lignes = list.map((a, i) => `${!e.q && (i === 0 || groupe(list[i - 1]) !== groupe(a)) ? `<tr class="grp"><td colspan="9">${esc(groupe(a))}</td></tr>` : ''}
    <tr class="clickable" data-id="${a.id}"><td class="sel-cell" data-nocl><input type="checkbox" data-sel-art="${a.id}" ${e.sel.has(a.id) ? 'checked' : ''} aria-label="Sélectionner ${esc(a.ref)}"></td><td>${esc(a.ref)}</td><td>${a.photoId ? `<img class="vign-art" src="${esc(fileUrl(a.photoId))}" alt="" loading="lazy">` : ''}${esc(a.designation)}</td>
    <td class="small">${esc(a.famille || '')}${a.sousFamille ? `<br><span class="muted">${esc(a.sousFamille)}${a.gamme ? ` › ${esc(a.gamme)}` : ''}</span>` : ''}</td><td>${esc(a.unite)}</td>
    <td class="num">${eur(a.coutRevient)}</td><td class="num">${eur(a.prixVente)}</td><td class="num">${num(a.coutRevient) ? fmt(num(a.prixVente) / num(a.coutRevient), 2) : '—'}</td><td>${esc(fournisseurArticle(a))}</td></tr>`).join('');
  return { n: list.length, html: list.length ? `<div class="table-wrap"><table data-colonnes="articles" class="articles"><tr><th class="sel-cell"><input type="checkbox" id="sel-tout" aria-label="Tout sélectionner"></th><th>Réf.</th><th>Désignation</th><th>Famille</th><th>Unité</th><th class="num">Achat</th><th class="num">Vente</th><th class="num">Coef.</th><th>Fournisseur</th></tr>${lignes}</table></div>`
    : `<p class="muted">Aucune fourniture ne correspond${e.q ? ` à « ${esc(e.q)} »` : ''}.</p>` };
}

Views.articles = () => {
  const e = biblioEtat, l = listeArticles();
  return `<h1>Bibliothèque</h1>${biblioTabs('articles')}
  <div class="toolbar">
    <button id="add">+ Fourniture</button>
    <button class="secondary" id="hausse">Révision des prix de vente %</button>
    <button class="secondary" id="fam-four">🏭 Fournisseurs par famille</button>
    ${Store.can('write', 'articles') ? `<button class="secondary" id="bo-tarif">📥 Tarif fournisseur</button><button class="secondary" id="bo-marges">% Marges par catégorie</button><button class="secondary" id="bo-cat">🌳 Catégories</button><button class="secondary" id="bo-dbl">🧹 Doublons</button><button class="secondary" id="bo-medias">🖼 Photos et fiches</button>` : ''}
    ${boutonsEchange('articles')}
  </div>
  <div class="biblio">
    <details class="arbre card" open><summary>Familles</summary><nav id="arbre">${arbreFamilles()}</nav></details>
    <section>
      <div class="recherche-art"><input id="search" type="search" value="${esc(e.q)}" placeholder="Rechercher : référence, désignation, DN, matière, fournisseur…" aria-label="Rechercher une fourniture" autocomplete="off">
        <span id="nb" class="muted small">${l.n} fourniture${l.n > 1 ? 's' : ''}${e.famille ? ` · ${esc(e.famille)}${e.sous ? ` › ${esc(e.sous)}` : ''}${e.gamme ? ` › ${esc(e.gamme)}` : ''} <button class="linklike small" id="tout-voir">voir tout</button>` : ''}</span></div>
      <div id="sel-barre" class="sel-barre" ${e.sel.size ? '' : 'hidden'}><span id="sel-n">${e.sel.size} sélectionnée(s)</span><button class="small" id="ranger">Ranger dans une famille…</button><button class="small" id="sel-marge">% Marge…</button><button class="small" id="sel-stock">📦 Mettre en stock (QR)</button><button class="small secondary" id="sel-x">Désélectionner</button></div>
      <div id="liste-art">${l.html}</div>
    </section>
  </div>`;
};
// Range les fournitures choisies dans une famille / sous-famille
function rangerArticles(ids) {
  const box = Modal.open(`<h2 style="margin-top:0">Ranger ${ids.length} fourniture${ids.length > 1 ? 's' : ''}</h2>
    <div class="field"><label for="rg-f">Famille</label><input id="rg-f" list="rg-fl" autocomplete="off"><datalist id="rg-fl">${famillesArticles().map(f => `<option value="${esc(f)}">`).join('')}</datalist></div>
    <div class="field"><label for="rg-s">Sous-famille (facultatif)</label><input id="rg-s" list="rg-sl" autocomplete="off"><datalist id="rg-sl"></datalist></div>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="rg-x">Annuler</button><button id="rg-ok">Ranger</button></div>`);
  const majSous = () => { box.querySelector('#rg-sl').innerHTML = sousFamillesArticles(box.querySelector('#rg-f').value.trim()).map(s => `<option value="${esc(s)}">`).join(''); };
  box.querySelector('#rg-f').oninput = majSous; majSous();
  box.querySelector('#rg-x').onclick = Modal.close;
  box.querySelector('#rg-ok').onclick = async () => {
    const famille = box.querySelector('#rg-f').value.trim(), sousFamille = box.querySelector('#rg-s').value.trim();
    if (!famille) return notify('Indiquez la famille.');
    await majArticles(ids.map(id => Store.get('articles', id)).filter(Boolean), a => ({ ...a, famille, sousFamille }));
    biblioEtat.sel.clear(); Modal.close(); App.render(); App.toast(`${ids.length} fourniture(s) rangée(s) dans ${famille}${sousFamille ? ` › ${sousFamille}` : ''}`);
  };
  setTimeout(() => box.querySelector('#rg-f').focus(), 50);
}
async function majArticles(liste, fn) {
  const maj = liste.map(a => { const c = fn({ ...a }); Object.keys(c).filter(k => k.startsWith('_')).forEach(k => delete c[k]); return c; });
  try { await Store.bulk('articles', maj); } catch (err) { notify(err.message); throw err; }
}
Views.articles.bind = root => {
  const ff = root.querySelector('#fam-four'); if (ff) ff.onclick = fournisseursParFamille;
  const ms = root.querySelector('#sel-stock'); if (ms) ms.onclick = () => choisirArticlesStock([...biblioEtat.sel]);
  [['#bo-tarif', () => importerTarif()], ['#bo-marges', () => editerMargesCategories()], ['#bo-cat', () => editerCategories()], ['#bo-dbl', () => editerDoublons()], ['#bo-medias', () => recupererMedias()], ['#sel-marge', () => margeSelection([...biblioEtat.sel])]]
    .forEach(([s, f]) => { const b = root.querySelector(s); if (b) b.onclick = f; });
  const e = biblioEtat;
  bindEchange(root);
  const lier = () => {
    root.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = ev => {
      if (ev.target.closest('[data-nocl]')) return;
      editArticle({ ...Store.get('articles', tr.dataset.id) });
    });
    const majSel = () => { root.querySelector('#sel-barre').hidden = !e.sel.size; root.querySelector('#sel-n').textContent = `${e.sel.size} sélectionnée(s)`; };
    root.querySelectorAll('[data-sel-art]').forEach(cb => cb.onchange = () => { cb.checked ? e.sel.add(cb.dataset.selArt) : e.sel.delete(cb.dataset.selArt); majSel(); });
    const tout = root.querySelector('#sel-tout');
    if (tout) tout.onchange = () => { root.querySelectorAll('[data-sel-art]').forEach(cb => { cb.checked = tout.checked; tout.checked ? e.sel.add(cb.dataset.selArt) : e.sel.delete(cb.dataset.selArt); }); majSel(); };
  };
  lier();
  // Recherche au fil de la frappe : seule la liste est redessinée (le champ garde le focus)
  const s = root.querySelector('#search');
  s.oninput = () => {
    e.q = s.value;
    const l = listeArticles();
    root.querySelector('#liste-art').innerHTML = l.html;
    root.querySelector('#nb').firstChild.textContent = `${l.n} fourniture${l.n > 1 ? 's' : ''}`;
    lier();
  };
  root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { e.famille = b.dataset.f; e.sous = b.dataset.s; e.gamme = b.dataset.g || ''; App.render(); });
  const tv = root.querySelector('#tout-voir'); if (tv) tv.onclick = () => { e.famille = ''; e.sous = ''; e.gamme = ''; App.render(); };
  root.querySelectorAll('[data-ren]').forEach(b => b.onclick = async () => {
    const f = b.dataset.ren, sf = b.dataset.renS;
    const nv = (await askValue(sf ? `Renommer la sous-famille « ${sf} » (${f})` : `Renommer la famille « ${f} »`, sf || f) || '').trim();
    if (!nv || nv === (sf || f)) return;
    const liste = Store.all('articles').filter(a => a.famille === f && (!sf || a.sousFamille === sf));
    await majArticles(liste, a => (sf ? { ...a, sousFamille: nv } : { ...a, famille: nv }));
    if (e.famille === f) { if (sf && e.sous === sf) e.sous = nv; if (!sf) e.famille = nv; }
    App.render(); App.toast(`${liste.length} fourniture(s) mise(s) à jour`);
  });
  root.querySelector('#ranger').onclick = () => rangerArticles([...e.sel]);
  root.querySelector('#sel-x').onclick = () => { e.sel.clear(); App.render(); };
  root.querySelector('#add').onclick = () => editArticle({ titre: 'Nouvelle fourniture' },  { unite: 'u', famille: e.famille && e.famille !== RechercheArticles.SANS ? e.famille : '', sousFamille: e.sous });
  root.querySelector('#hausse').onclick = async () => {
    const cible = RechercheArticles.filtrer(Store.all('articles'), { famille: e.famille, sousFamille: e.sous });
    const p = await askValue(`Révision des prix de vente en %${e.famille ? ` (${e.famille}${e.sous ? ` › ${e.sous}` : ''} : ${cible.length} fourniture(s))` : ' (toutes les fournitures)'}`, '3', 'number');
    if (p === null || p === '' || isNaN(+p)) return;
    await majArticles(cible, a => ({ ...a, prixVente: Math.round(num(a.prixVente) * (1 + +p / 100) * 100) / 100 }));
    App.render(); App.toast(`${cible.length} prix de vente révisés`);
  };
  if (e.q) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
};

Views.mainoeuvre = () => `<h1>Bibliothèque</h1>${biblioTabs('mo')}
  <p class="muted">Taux utilisés dans les ouvrages des devis. Le coût réel des chantiers est calculé avec le coût horaire de chaque personne (Paramètres › Équipe).</p>
  <div class="toolbar"><button id="add">+ Catégorie</button>${boutonsEchange('mainoeuvre')}</div>
  <div class="table-wrap"><table><tr><th>Code</th><th>Catégorie</th><th class="num">Taux de vente</th><th class="num">Coût moyen</th><th class="num">Marge horaire</th><th class="num">Personnes</th></tr>
  ${Store.all('mainoeuvre').map(m => `<tr class="clickable" data-id="${m.id}"><td>${esc(m.code)}</td><td>${esc(m.libelle)}</td><td class="num">${eur(m.tauxVente)}/h</td><td class="num">${eur(m.tauxCout)}/h</td>
    <td class="num">${marginBadge(num(m.tauxVente) ? (num(m.tauxVente) - num(m.tauxCout)) / num(m.tauxVente) * 100 : 0)}</td><td class="num">${Store.all('users').filter(u => u.categorieId === m.id).length || ''}</td></tr>`).join('')}
  </table></div>`;
Views.mainoeuvre.bind = root => {
  bindEchange(root);
  root.querySelector('#add').onclick = () => editModal({ title: "Nouvelle catégorie de main-d'œuvre", col: 'mainoeuvre', fields: moFields, obj: {} });
  root.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () =>
    editModal({ title: "Main-d'œuvre", col: 'mainoeuvre', fields: moFields, obj: { ...Store.get('mainoeuvre', tr.dataset.id) } }));
};

Views.livraison = () => `<h1>Bibliothèque</h1>${biblioTabs('livraison')}
  <p class="muted">Livraison facturée = forfait + prix/tonne × poids des fournitures du devis. Le montant peut être forcé sur chaque devis.</p>
  <div class="toolbar"><button id="add">+ Zone</button></div>
  <div class="table-wrap"><table><tr><th>Zone</th><th class="num">Forfait</th><th class="num">€/t</th><th class="num">Coût forfait</th><th class="num">Coût €/t</th><th class="num">Ex. 2 t facturé</th><th class="num">Marge transport</th></tr>
  ${Store.all('zones').map(z => {
    const f = num(z.forfait) + num(z.prixParTonne) * 2, c = num(z.coutTransporteur) + num(z.coutParTonne) * 2;
    return `<tr class="clickable" data-id="${z.id}"><td>${esc(z.nom)}</td><td class="num">${eur(z.forfait)}</td><td class="num">${eur(z.prixParTonne)}</td><td class="num">${eur(z.coutTransporteur)}</td><td class="num">${eur(z.coutParTonne)}</td><td class="num">${eur(f)}</td><td class="num ${signClass(f - c)}">${eur(f - c)}</td></tr>`;
  }).join('')}</table></div>`;
Views.livraison.bind = root => {
  root.querySelector('#add').onclick = () => editModal({ title: 'Nouvelle zone', col: 'zones', fields: zoneFields, obj: {} });
  root.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () =>
    editModal({ title: 'Zone', col: 'zones', fields: zoneFields, obj: { ...Store.get('zones', tr.dataset.id) } }));
};
