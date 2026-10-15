// Bibliothèque : fournitures (prix d'achat / vente, fournisseur), taux de main-d'œuvre, tarifs de livraison.
const articleFields = [
  { key: 'ref', label: 'Référence' },
  { key: 'designation', label: 'Désignation' },
  { key: 'famille', label: 'Famille', datalist: ['Tubes', 'Raccords', 'Robinetterie', 'Supportage', 'Visserie et joints', 'Calorifuge', 'Location', 'Contrôles', 'Sous-traitance'] },
  { key: 'unite', label: 'Unité', type: 'select', options: v => optionsStr([...new Set([...UNITES, v || 'u'])], v || 'u') },
  { key: 'coutRevient', label: "Prix d'achat HT", type: 'number', step: '0.01' },
  { key: 'prixVente', label: 'Prix de vente HT', type: 'number', step: '0.01' },
  { key: 'poidsUnitaire', label: 'Poids / unité (kg)', type: 'number', step: '0.1' },
  { key: 'fournisseurId', label: 'Fournisseur habituel', type: 'select', options: v => options(fournisseursList(), v) },
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

function biblioTabs(active) {
  return `<div class="tabs">
    <a href="#/articles" class="${active === 'articles' ? 'active' : ''}">Fournitures <span class="count">${Store.all('articles').length}</span></a>
    <a href="#/mainoeuvre" class="${active === 'mo' ? 'active' : ''}">Main-d'œuvre <span class="count">${Store.all('mainoeuvre').length}</span></a>
    <a href="#/livraison" class="${active === 'livraison' ? 'active' : ''}">Livraison <span class="count">${Store.all('zones').length}</span></a>
    <a href="#/ouvrages" class="${active === 'ouvrages' ? 'active' : ''}">Ouvrages types <span class="count">${Store.all('ouvrages').length}</span></a>
    <a href="#/familles" class="${active === 'familles' ? 'active' : ''}">Familles CAO <span class="count">${Store.all('familles').length}</span></a>
  </div>`;
}

Views.articles = (params, query) => {
  const ff = query.get('famille') || '';
  const familles = [...new Set(Store.all('articles').map(a => a.famille).filter(Boolean))];
  const list = Store.all('articles').filter(a => !ff || a.famille === ff).sort((a, b) => (a.famille || '').localeCompare(b.famille || '') || a.ref.localeCompare(b.ref));
  return `<h1>Bibliothèque</h1>${biblioTabs('articles')}
  <div class="toolbar">
    <button id="add">+ Fourniture</button>
    <button class="secondary" id="hausse">Révision des prix de vente %</button>
    ${boutonsEchange('articles')}
    <span class="spacer"></span>
    <input id="search" type="search" placeholder="Rechercher…" style="width:auto;min-width:0;flex:1 1 160px;max-width:260px">
    <select id="ff" style="width:auto"><option value="">Toutes familles</option>${optionsStr(familles, ff)}</select>
  </div>
  <div class="table-wrap"><table><tr><th>Réf.</th><th>Désignation</th><th>Famille</th><th>Unité</th><th class="num">Achat</th><th class="num">Vente</th><th class="num">Coef.</th><th>Fournisseur</th></tr>
  ${list.map(a => `<tr class="clickable" data-id="${a.id}" data-search="${esc([a.ref, a.designation, a.famille].join(' ').toLowerCase())}"><td>${esc(a.ref)}</td><td>${esc(a.designation)}</td><td>${esc(a.famille)}</td><td>${esc(a.unite)}</td>
    <td class="num">${eur(a.coutRevient)}</td><td class="num">${eur(a.prixVente)}</td><td class="num">${num(a.coutRevient) ? fmt(num(a.prixVente) / num(a.coutRevient), 2) : '—'}</td><td>${esc(a.fournisseurId ? clientName(a.fournisseurId) : '')}</td></tr>`).join('')}
  </table></div>`;
};
Views.articles.bind = root => {
  bindSearch(root);
  bindEchange(root);
  root.querySelector('#ff').onchange = e => { location.hash = `#/articles?famille=${encodeURIComponent(e.target.value)}`; };
  root.querySelector('#add').onclick = () => editModal({ title: 'Nouvelle fourniture', col: 'articles', fields: articleFields, obj: { unite: 'u' } });
  root.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () =>
    editModal({ title: 'Fourniture', col: 'articles', fields: articleFields, obj: { ...Store.get('articles', tr.dataset.id) } }));
  root.querySelector('#hausse').onclick = async () => {
    const ff = new URLSearchParams(location.hash.split('?')[1] || '').get('famille') || '';
    const p = await askValue(`Révision des prix de vente en %${ff ? ` (famille « ${ff} »)` : ' (toutes les fournitures)'}`, '3', 'number');
    if (p === null || p === '' || isNaN(+p)) return;
    const maj = Store.all('articles').filter(a => !ff || a.famille === ff).map(a => {
      const c = { ...a, prixVente: Math.round(num(a.prixVente) * (1 + +p / 100) * 100) / 100 };
      Object.keys(c).filter(k => k.startsWith('_')).forEach(k => delete c[k]);
      return c;
    });
    try { await Store.bulk('articles', maj); } catch (e) { notify(e.message); return; }
    App.render(); App.toast(`${maj.length} prix de vente révisés`);
  };
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
