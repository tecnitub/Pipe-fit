// Commandes fournisseurs affectées à un chantier : leur montant constitue le coût réel des fournitures.
const STATUTS_COMMANDE = ['Brouillon', 'Envoyée', 'Réceptionnée partiellement', 'Réceptionnée', 'Annulée'];
const fournisseursList = () => Store.all('entreprises').filter(e => e.categorie !== 'Client').sort((a, b) => a.nom.localeCompare(b.nom));

// Fournitures prévues au devis du chantier, moins ce qui est déjà commandé
function besoinsChantier(affaireId, fournisseurId) {
  const need = {};
  Store.all('devis').filter(d => d.affaireId === affaireId && d.statut === 'Accepté').forEach(d => (d.lignes || []).forEach(l => {
    if (l.type === 'chapitre') return;
    (l.composants || []).filter(c => c.type !== 'mo' && c.articleId).forEach(c => {
      need[c.articleId] = (need[c.articleId] || 0) + num(l.qte) * num(c.qte);
    });
  }));
  Store.all('commandes').filter(c => c.affaireId === affaireId && c.statut !== 'Annulée').forEach(c => (c.lignes || []).forEach(l => {
    if (l.articleId && need[l.articleId] !== undefined) need[l.articleId] -= num(l.qte);
  }));
  return Object.entries(need).map(([id, q]) => ({ a: Store.get('articles', id), q: Math.ceil(q * 100) / 100 }))
    .filter(x => x.a && x.q > 0 && (!fournisseurId || !x.a.fournisseurId || x.a.fournisseurId === fournisseurId));
}

Views.commandes = (params, query) => {
  if (params[0]) return commandeEditor(params[0]);
  const fa = query.get('chantier') || '', ff = query.get('fournisseur') || '', fs = query.get('statut') || '';
  const list = Store.all('commandes').filter(c => (!fa || c.affaireId === fa) && (!ff || c.fournisseurId === ff) && (!fs || c.statut === fs))
    .sort((a, b) => (b.numero || '~').localeCompare(a.numero || '~'));
  const total = sumBy(list.filter(c => c.statut !== 'Annulée'), c => Calc.commande(c).total);
  return `<h1>Achats</h1>${achatsTabs('commandes')}
  <div class="toolbar">
    <a class="btn" href="#/commandes/new">+ Nouvelle commande</a>
    <span class="spacer"></span>
    <select id="fa" style="width:auto"><option value="">Tous les chantiers</option>${options(Store.all('affaires'), fa, affaireLabel, false)}</select>
    <select id="ff" style="width:auto"><option value="">Tous les fournisseurs</option>${options(fournisseursList(), ff, undefined, false)}</select>
    <select id="fs" style="width:auto"><option value="">Tous statuts</option>${optionsStr(STATUTS_COMMANDE, fs)}</select>
  </div>
  ${list.length ? `<div class="table-wrap"><table><tr><th>N°</th><th>Date</th><th>Fournisseur</th><th>Chantier</th><th>Livraison prévue</th><th>Statut</th><th class="num">Montant HT</th></tr>
  ${list.map(c => `<tr class="clickable" data-go="#/commandes/${c.id}"><td>${esc(c.numero || '…')}</td><td>${dateFr(c.date)}</td><td>${esc(clientName(c.fournisseurId))}</td>
    <td>${c.affaireId ? esc(affaireLabel(affaireOf(c.affaireId))) : '<span class="muted">Stock / frais généraux</span>'}</td><td>${dateFr(c.dateLivraison)}</td><td>${badge(c.statut)}</td><td class="num">${eur(Calc.commande(c).total)}</td></tr>`).join('')}
  <tr class="subtotal"><td colspan="6">Total (hors annulées)</td><td class="num">${eur(total)}</td></tr></table></div>`
  : '<p class="muted">Aucune commande.</p>'}`;
};

function commandeEditor(id) {
  if (id === 'new') return '<p class="muted">Création…</p>';
  const c = Store.get('commandes', id);
  if (!c) return '<p>Commande introuvable. <a href="#/commandes">Retour</a></p>';
  const f = entreprise(c.fournisseurId), fSite = billingSite(c.fournisseurId);
  const af = affaireOf(c.affaireId), livSite = siteOf(af.clientId, af.siteId);
  const s = Store.data.settings;
  const besoins = c.affaireId ? besoinsChantier(c.affaireId, c.fournisseurId) : [];
  const total = Calc.commande(c).total;
  return `
  <div class="toolbar">
    <a href="#/commandes" class="btn secondary">← Commandes</a>
    ${c.affaireId ? `<a href="#/chantier/${esc(c.affaireId)}" class="btn secondary">Chantier ${esc(af.code || '')}</a>` : ''}
    <span class="spacer"></span>
    <button class="secondary print-btn" data-print>Imprimer</button>${boutonsEnvoi('demandePrix', c.id, 'Demande de prix', false)}${boutonsEnvoi('commande', c.id, 'Envoyer la commande')}
    <button class="danger" id="del">Supprimer</button>
  </div>
  <h1 class="no-print">Commande ${esc(c.numero || '')} ${badge(c.statut)}</h1>${envoisHtml('commandes', c.id)}
  ${(() => { const liees = Calc.imputations().filter(l => l.commandeId === c.id); if (!liees.length) return '';
    const fac = sumBy(liees, l => num(l.montantHT)), ec = fac - total;
    return `<p class="note no-print">Facturée : ${liees.map(l => `<a href="#/achats/${l.achat.id}">${esc(l.achat.numeroFournisseur || l.achat.ref || 'facture')}</a> (${eur(l.montantHT)})`).join(', ')} · ${Math.abs(ec) > 0.01 ? `<strong>écart ${ec > 0 ? '+' : ''}${eur(ec)}</strong> par rapport à la commande ; ` : ''}c'est le montant facturé qui compte dans la rentabilité du chantier.</p>`; })()}
  <div class="card no-print">
    <div class="grid2">
      <div class="field"><label for="c-four">Fournisseur</label><select id="c-four">${options(fournisseursList(), c.fournisseurId)}</select></div>
      <div class="field"><label for="c-aff">Chantier (affectation du coût)</label><select id="c-aff"><option value="">Stock / frais généraux</option>${options(Store.all('affaires'), c.affaireId, affaireLabel, false)}</select></div>
      <div class="field"><label for="c-date">Date de commande</label><input id="c-date" type="date" value="${esc(c.date)}"></div>
      <div class="field"><label for="c-liv">Livraison prévue</label><input id="c-liv" type="date" value="${esc(c.dateLivraison || '')}"></div>
      <div class="field"><label for="c-statut">Statut</label><select id="c-statut">${optionsStr(STATUTS_COMMANDE, c.statut)}</select></div>
    </div>
  </div>

  ${besoins.length ? `<div class="card no-print note-card">
    <strong>Fournitures prévues au devis et pas encore commandées</strong>${c.fournisseurId ? ` <span class="muted small">(fournisseur habituel : ${esc(f.nom)})</span>` : ''}
    <ul class="besoins">${besoins.map(x => `<li>${esc(x.a.designation)} : ${fmt(x.q, 2)} ${esc(x.a.unite)}</li>`).join('')}</ul>
    <button id="reprendre">Ajouter ces fournitures à la commande</button></div>` : ''}

  <h2 class="no-print">Lignes</h2>
  <div class="table-wrap no-print"><table>
    <tr><th>Désignation</th><th class="num">Qté</th><th>Unité</th><th class="num">PU achat HT</th><th class="num">Total HT</th><th></th></tr>
    ${(c.lignes || []).map((l, i) => `<tr><td><input data-i="${i}" data-k="designation" value="${esc(l.designation)}" aria-label="Désignation"></td>
      <td class="num"><input data-i="${i}" data-k="qte" type="number" step="any" value="${esc(l.qte)}" style="width:90px" aria-label="Quantité"></td><td>${esc(l.unite)}</td>
      <td class="num"><input data-i="${i}" data-k="pu" type="number" step="0.01" value="${esc(l.pu)}" style="width:100px" aria-label="Prix unitaire"></td>
      <td class="num">${eur(num(l.qte) * num(l.pu))}</td><td><button class="small danger" data-del="${i}" aria-label="Retirer">✕</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Aucune ligne.</td></tr>'}
    <tr class="subtotal"><td colspan="4">Total HT</td><td class="num">${eur(total)}</td><td></td></tr>
  </table></div>
  <div class="toolbar no-print" style="margin-top:8px">${articleSelect('c-art')}<input id="c-art-q" type="number" step="any" value="1" style="width:90px" aria-label="Quantité"><button class="secondary" id="c-add">Ajouter</button><button class="secondary" id="c-free">Ligne libre</button><button class="secondary" id="c-dicter">🎤 Dicter du matériel</button></div>

  <details class="no-print preview"><summary>Aperçu du bon de commande</summary><div class="doc-print">${commandeDocument(c)}</div></details>
  <div class="print-only doc-print">${commandeDocument(c)}</div>`;
}

Views.commandes.bind = (root, params, query) => {
  if (params[0] === 'new') {
    const aff = query.get('chantier') || '';
    const c = Store.upsert('commandes', { numero: '', fournisseurId: '', affaireId: aff, date: isoDate(new Date()), dateLivraison: '', statut: 'Brouillon', lignes: [] });
    location.replace(`#/commandes/${c.id}`);
    return;
  }
  if (!params[0]) {
    const upd = () => { location.hash = `#/commandes?chantier=${root.querySelector('#fa').value}&fournisseur=${root.querySelector('#ff').value}&statut=${encodeURIComponent(root.querySelector('#fs').value)}`; };
    ['#fa', '#ff', '#fs'].forEach(s => { root.querySelector(s).onchange = upd; });
    return;
  }
  const c = Store.get('commandes', params[0]);
  if (!c) return;
  const save = () => { Store.upsert('commandes', c); App.render(); };
  const field = (sel, key) => { root.querySelector(sel).onchange = e => { c[key] = e.target.value; save(); }; };
  field('#c-four', 'fournisseurId'); field('#c-aff', 'affaireId'); field('#c-date', 'date'); field('#c-liv', 'dateLivraison'); field('#c-statut', 'statut');
  root.querySelectorAll('[data-i]').forEach(el => el.onchange = () => {
    const l = c.lignes[+el.dataset.i];
    l[el.dataset.k] = el.dataset.k === 'designation' ? el.value : +el.value;
    save();
  });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { c.lignes.splice(+b.dataset.del, 1); save(); });
  const ligne = (a, q) => ({ articleId: a.id, designation: a.designation, unite: a.unite, qte: q, pu: num(a.coutRevient) });
  root.querySelector('#c-add').onclick = () => {
    const a = Store.get('articles', root.querySelector('#c-art').value);
    if (!a) { notify('Choisissez une fourniture dans la liste.'); return; }
    c.lignes.push(ligne(a, num(root.querySelector('#c-art-q').value) || 1));
    if (!c.fournisseurId && a.fournisseurId) c.fournisseurId = a.fournisseurId;
    save();
  };
  // Liste dictée : prix d'achat de la bibliothèque, prix à demander pour le matériel hors bibliothèque
  root.querySelector('#c-dicter').onclick = async () => {
    const choix = await dicterMateriel({ titre: `Dicter la commande ${c.numero || ''}`, cible: 'à la commande, au prix d\'achat de la bibliothèque' });
    choix.forEach(m => { const a = m.articleId && Store.get('articles', m.articleId); c.lignes.push(a ? ligne(a, m.qte) : { articleId: '', designation: m.designation, unite: m.unite, qte: m.qte, pu: 0 }); if (a && !c.fournisseurId && a.fournisseurId) c.fournisseurId = a.fournisseurId; });
    if (choix.length) save();
  };
  root.querySelector('#c-free').onclick = () => { c.lignes.push({ designation: 'Fourniture', unite: 'u', qte: 1, pu: 0 }); save(); };
  const rep = root.querySelector('#reprendre');
  if (rep) rep.onclick = () => {
    besoinsChantier(c.affaireId, c.fournisseurId).forEach(x => c.lignes.push(ligne(x.a, x.q)));
    save(); App.toast('Fournitures du devis ajoutées');
  };
  root.querySelector('#del').onclick = () => ask(`Supprimer la commande ${c.numero || ''} ?`, 'Supprimer').then(ok => {
    if (ok) { Store.remove('commandes', c.id); location.hash = '#/commandes'; }
  });
};

// Bon de commande ou demande de prix (même document, sans prix pour la demande)
function commandeDocument(c, type = 'commande') {
  const s = Store.data.settings, f = entreprise(c.fournisseurId), fSite = billingSite(c.fournisseurId);
  const af = affaireOf(c.affaireId), livSite = siteOf(af.clientId, af.siteId), total = Calc.commande(c).total;
  const o = { ...Doc.t(type), prix: type === 'commande' && Doc.t('commande').prix };
  return `${Doc.entete(type, `${o.titre} ${type === 'commande' ? c.numero || '' : ''}`, `${type === 'commande' ? '' : `Référence ${esc(c.numero || '')}<br>`}Date : ${dateFr(type === 'commande' ? c.date : isoDate(new Date()))}${af.code && o.chantier ? `<br>Chantier : ${esc(af.code)} – ${esc(af.nom)}` : ''}${c.dateLivraison && o.livraison ? `<br>Livraison souhaitée : ${dateFr(c.dateLivraison)}` : ''}`)}
    <div class="doc-parties"><div><strong>${esc(f.nom || '—')}</strong>${fSite ? `<br>${esc(fullAddress(fSite))}` : ''}${f.email ? `<br>${esc(f.email)}` : ''}</div>
    <div>${!o.livraison ? '' : livSite ? `Livraison : <strong>${esc(clientName(af.clientId))} – ${esc(livSite.libelle)}</strong><br>${esc(fullAddress(livSite))}${livSite.acces ? `<br>${esc(livSite.acces)}` : ''}` : `Livraison à notre atelier : ${esc(s.adresse)}`}</div></div>
    ${Doc.intro(type)}
    <div class="table-wrap"><table class="doc-lines${o.prix ? '' : ' compact'}"><tr><th>Désignation</th><th class="num">Qté</th><th>Unité</th>${o.prix ? '<th class="num">PU HT</th><th class="num">Total HT</th>' : ''}</tr>
    ${(c.lignes || []).map(l => `<tr><td>${esc(l.designation)}</td><td class="num">${fmt(l.qte, 2)}</td><td>${esc(l.unite)}</td>${o.prix ? `<td class="num">${eur(l.pu)}</td><td class="num">${eur(num(l.qte) * num(l.pu))}</td>` : ''}</tr>`).join('')}
    </table></div>${o.prix ? `<table class="totals"><tr class="grand"><td>Total HT</td><td class="num">${eur(total)}</td></tr></table>` : ''}
    ${Doc.pied(type)}`;
}
