// Factures fournisseurs : saisie, ventilation sur les chantiers (rapprochement d'une commande ou achat hors commande,
// ex. raccords achetés au comptoir chez Descours & Cabot ou Téréva avec le n° de chantier), pièce jointe.
const STATUTS_ACHAT = ['À payer', 'Payée'];
const FILTRES_ACHATS = { q: '', fournisseur: '', chantier: '', statut: '' };

function achatsTabs(actif) {
  const aVentiler = Store.all('achats').filter(f => Calc.achat(f).reste > 0.005 && !f.fraisGeneraux).length;
  return `<div class="tabs"><a href="#/consultations" class="${actif === 'consultations' ? 'active' : ''}">Consultations ${consultationsTab() ? `<span class="count">${consultationsTab()} en cours</span>` : ''}</a><a href="#/commandes" class="${actif === 'commandes' ? 'active' : ''}">Commandes</a>
    <a href="#/achats" class="${actif === 'achats' ? 'active' : ''}">Factures fournisseurs ${aVentiler ? `<span class="count">${aVentiler} à ventiler</span>` : ''}</a>
    <a href="#/efactures" class="${actif === 'efactures' ? 'active' : ''}">Factures reçues ${(() => { const n = Store.all('efactures').filter(e => e.statut === 'Reçue').length; return n ? `<span class="count">${n} à traiter</span>` : ''; })()}</a>
    <a href="#/comptoir" class="${actif === 'comptoir' ? 'active' : ''}">Comptoir ${(() => { const n = Store.all('enlevements').filter(e => e.statut === 'Déclaré').length; return n ? `<span class="count">${n}</span>` : ''; })()}</a>
    <a href="#/prixAchats" class="${actif === 'prix' ? 'active' : ''}">Historique des prix</a></div>`;
}
const etatVentilation = f => { const t = Calc.achat(f); return t.reste <= 0.005 ? (t.reste < -0.005 ? ['b-bad', 'Sur-imputée'] : ['b-ok', 'Ventilée']) : f.fraisGeneraux ? ['', 'Frais généraux'] : t.impute ? ['b-warn', 'Partielle'] : ['b-warn', 'À ventiler']; };

Views.achats = (params, query) => {
  if (params[0]) return achatEditeur(params[0], query);
  const f = lireFiltres('achats', query, FILTRES_ACHATS);
  const list = Store.all('achats').filter(x => (!f.fournisseur || x.fournisseurId === f.fournisseur) && (!f.chantier || (x.imputations || []).some(l => l.affaireId === f.chantier))
    && (!f.statut || (f.statut === 'aventiler' ? Calc.achat(x).reste > 0.005 && !x.fraisGeneraux : x.statut === f.statut))
    && correspond(f.q, x.numeroFournisseur, x.ref, clientName(x.fournisseurId), (x.imputations || []).map(l => `${affaireOf(l.affaireId).code} ${l.libelle}`).join(' ')))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const fournisseurs = [...new Set(Store.all('achats').map(x => x.fournisseurId))].map(entreprise).filter(e => e.id).sort((a, b) => a.nom.localeCompare(b.nom));
  return `<h1>Achats</h1>${achatsTabs('achats')}
  <p class="muted">Factures des fournisseurs, ventilées sur les chantiers : rapprochement d'une commande (le montant facturé remplace le montant commandé dans la rentabilité) ou achat hors commande (fournitures prises au comptoir avec le n° de chantier). Le reste non imputé va en frais généraux ou en stock.</p>
  <div class="toolbar"><a class="btn" href="#/achats/new">+ Facture fournisseur</a></div>
  ${barreFiltres(f, { recherche: 'Rechercher (n° de facture, chantier, désignation…)', statuts: [['', 'Tous statuts'], ['aventiler', 'À ventiler'], ...STATUTS_ACHAT.map(s => [s, s])], defauts: FILTRES_ACHATS,
    extra: `<select data-f="fournisseur" aria-label="Fournisseur"><option value="">Tous les fournisseurs</option>${fournisseurs.map(e => `<option value="${esc(e.id)}" ${e.id === f.fournisseur ? 'selected' : ''}>${esc(e.nom)}</option>`).join('')}</select>
      <select data-f="chantier" aria-label="Chantier"><option value="">Tous les chantiers</option>${options(Store.all('affaires').filter(a => !a.archive || a.id === f.chantier), f.chantier, affaireLabel, false)}</select>` })}
  <p class="muted small">${list.length} facture(s) · ${eur(sumBy(list, x => Calc.achat(x).ht))} HT · imputé aux chantiers ${eur(sumBy(list, x => Calc.achat(x).impute))}</p>
  ${list.length ? `<div class="table-wrap"><table><tr><th>Réf.</th><th>Date</th><th>Fournisseur</th><th>N° facture</th><th>Chantiers</th><th class="num">HT</th><th class="num">Imputé</th><th>Ventilation</th><th>Rapprochement</th><th>Paiement</th></tr>
    ${list.map(x => { const t = Calc.achat(x), [cls, lib] = etatVentilation(x); const chs = [...new Set((x.imputations || []).map(l => affaireOf(l.affaireId).code).filter(Boolean))];
      return `<tr class="clickable" data-go="#/achats/${x.id}"><td>${esc(x.ref || '…')}</td><td>${dateFr(x.date)}</td><td>${esc(clientName(x.fournisseurId))}</td><td>${esc(x.numeroFournisseur || '')}</td>
        <td>${chs.map(c => esc(c)).join(', ')}</td><td class="num">${eur(t.ht)}</td><td class="num">${eur(t.impute)}</td><td><span class="badge ${cls}">${lib}</span></td><td>${badgeRapprochement(x)}</td><td>${badge(x.statut)}</td></tr>`; }).join('')}</table></div>` : '<p class="muted">Aucune facture fournisseur pour ces critères.</p>'}`;
};

function achatEditeur(id, query) {
  if (id === 'new') return '<p class="muted">Création…</p>';
  const x = Store.get('achats', id);
  if (!x) return '<p>Facture introuvable. <a href="#/achats">Retour</a></p>';
  const t = Calc.achat(x), [cls, lib] = etatVentilation(x);
  const imp = x.imputations || [];
  // Commandes du fournisseur, à rapprocher (montant commandé et déjà facturé)
  const commandesF = Store.all('commandes').filter(c => c.fournisseurId === x.fournisseurId && c.statut !== 'Annulée');
  const dejaFacture = cid => sumBy(Calc.imputations().filter(l => l.commandeId === cid && l.achat.id !== x.id), l => num(l.montantHT));
  const nonFacturees = commandesF.filter(c => !imp.some(l => l.commandeId === c.id) && dejaFacture(c.id) < Calc.commande(c).total - 0.01);
  const piece = x.pieceId ? fileUrl(x.pieceId) : '';
  return `<div class="toolbar"><a href="#/achats" class="btn secondary">← Factures fournisseurs</a><span class="spacer"></span><button class="danger" id="ac-del">Supprimer</button></div>
  <h1>Facture fournisseur ${esc(x.ref || '')} <span class="badge ${cls}">${lib}</span> ${badge(x.statut)}</h1>
  <div class="card">
    <div class="grid2">
      <div class="field"><label for="ac-four">Fournisseur</label><select id="ac-four">${options(fournisseursList(), x.fournisseurId)}</select></div>
      <div class="field"><label for="ac-num">N° de facture du fournisseur</label><input id="ac-num" value="${esc(x.numeroFournisseur || '')}"></div>
      <div class="field"><label for="ac-date">Date de facture</label><input id="ac-date" type="date" value="${esc(x.date || '')}"></div>
      <div class="field"><label for="ac-ech">Échéance</label><input id="ac-ech" type="date" value="${esc(x.echeance || '')}"></div>
      <div class="field"><label for="ac-ht">Montant HT</label><input id="ac-ht" type="number" step="0.01" value="${esc(x.montantHT ?? '')}"></div>
      <div class="field"><label for="ac-tva">TVA (vide = ${fmt(Store.data.settings.tva, 1)} %)</label><input id="ac-tva" type="number" step="0.01" value="${esc(x.montantTVA ?? '')}"></div>
      <div class="field"><label>Total TTC</label><output class="ac-ttc">${eur(t.ttc)}</output></div>
      <div class="field"><label for="ac-statut">Paiement</label><select id="ac-statut">${optionsStr(STATUTS_ACHAT, x.statut)}</select></div>
    </div>
    <div class="field"><label for="ac-notes">Notes</label><input id="ac-notes" value="${esc(x.notes || '')}" placeholder="Relevé mensuel, tickets comptoir n°…"></div>
    <div class="ac-piece">${piece ? (x.pieceType === 'pdf' ? `<a class="btn secondary small" href="${piece}" target="_blank" rel="noopener">📄 Voir la facture (PDF)</a>` : `<a href="${piece}" target="_blank" rel="noopener"><img class="thumb" src="${piece}" alt="Facture"></a>`) : ''}
      <label class="btn secondary small">${piece ? 'Remplacer la pièce' : '📎 Joindre la facture (photo ou PDF)'}<input type="file" id="ac-file" accept="image/*,application/pdf" hidden></label>
      <label class="btn small" title="Relevé mensuel des bons de livraison (achats au comptoir) : ventilation automatique par chantier">📄 Importer le relevé des BL (PDF, Excel)<input type="file" id="ac-releve" accept=".pdf,.xlsx,.csv,image/*" hidden></label>
      ${x.releve ? `<span class="small muted">Relevé ${esc(x.releve.fichier)} : ${x.releve.bls} BL, le ${dateFr(x.releve.date)}</span>` : ''}</div>
  </div>

  <h2>Ventilation sur les chantiers</h2>
  <div class="table-wrap"><table class="ac-imp"><tr><th>Chantier</th><th>Commande rapprochée</th><th>Désignation</th><th class="num">Montant HT</th><th></th></tr>
    ${imp.map((l, i) => {
      const cmds = commandesF.filter(c => !l.affaireId || c.affaireId === l.affaireId);
      const c = Store.get('commandes', l.commandeId);
      return `<tr data-i="${i}"><td><select data-k="affaireId" aria-label="Chantier">${options(Store.all('affaires').filter(a => !a.archive || a.id === l.affaireId), l.affaireId, affaireLabel)}</select></td>
        <td><select data-k="commandeId" aria-label="Commande"><option value="">Hors commande</option>${cmds.map(cc => `<option value="${cc.id}" ${cc.id === l.commandeId ? 'selected' : ''}>${esc(cc.numero || '…')} · ${eur(Calc.commande(cc).total)}</option>`).join('')}</select>
          ${c ? `<div class="small ${Math.abs(num(l.montantHT) - Calc.commande(c).total) > 0.01 ? 'warn-text' : 'muted'}">commandé ${eur(Calc.commande(c).total)}${Math.abs(num(l.montantHT) - Calc.commande(c).total) > 0.01 ? ` · écart ${eur(num(l.montantHT) - Calc.commande(c).total)}` : ''}</div>` : ''}</td>
        <td><input data-k="libelle" value="${esc(l.libelle || '')}" placeholder="Raccords, colliers, consommables…" aria-label="Désignation"></td>
        <td class="num"><input data-k="montantHT" type="number" step="0.01" value="${esc(l.montantHT ?? '')}" style="width:110px" aria-label="Montant HT"></td>
        <td><button class="small danger" data-del="${i}" aria-label="Retirer">✕</button></td></tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">Aucune imputation : ajoutez une ligne par chantier.</td></tr>'}
    <tr class="subtotal"><td colspan="3">Imputé aux chantiers</td><td class="num">${eur(t.impute)}</td><td></td></tr>
    <tr class="subtotal"><td colspan="3">${t.reste < -0.005 ? '<span class="neg">Imputé au-delà du montant de la facture</span>' : 'Reste non imputé'}</td><td class="num ${t.reste < -0.005 ? 'neg' : ''}">${eur(t.reste)}</td><td></td></tr>
  </table></div>
  <div class="toolbar">
    <button class="secondary" id="ac-add">+ Imputer sur un chantier</button>
    ${t.reste > 0.005 ? '<button class="secondary" id="ac-solde">Imputer le reste</button>' : ''}
    ${nonFacturees.length ? `<select id="ac-cde" style="width:auto"><option value="">Rapprocher une commande…</option>${nonFacturees.map(c => `<option value="${c.id}">${esc(c.numero || '…')} · ${esc(affaireOf(c.affaireId).code || 'stock')} · ${eur(Calc.commande(c).total - dejaFacture(c.id))}</option>`).join('')}</select>` : ''}
    <label class="check small"><input type="checkbox" id="ac-fg" ${x.fraisGeneraux ? 'checked' : ''}> Le reste est en frais généraux / stock (ne plus le signaler à ventiler)</label>
  </div>
  ${rapprochementAchatHtml(x)}`;
}

Views.achats.bind = (root, params, query) => {
  if (params[0] === 'new') {
    const ch = query.get('chantier') || '';
    const x = Store.upsert('achats', { ref: '', fournisseurId: '', numeroFournisseur: '', date: isoDate(new Date()), echeance: '', montantHT: '', montantTVA: '', statut: 'À payer', imputations: ch ? [{ affaireId: ch, commandeId: '', libelle: '', montantHT: '' }] : [] });
    location.replace(`#/achats/${x.id}`);
    return;
  }
  if (!params[0]) { const f = lireFiltres('achats', query, FILTRES_ACHATS); return bindFiltres(root, 'achats', f, FILTRES_ACHATS); }
  const x = Store.get('achats', params[0]);
  if (!x) return;
  x.imputations = x.imputations || [];
  const save = (rerender = true) => { Store.upsert('achats', x); if (rerender) App.render(); };
  const q = s => root.querySelector(s);
  [['#ac-four', 'fournisseurId'], ['#ac-num', 'numeroFournisseur'], ['#ac-date', 'date'], ['#ac-ech', 'echeance'], ['#ac-statut', 'statut'], ['#ac-notes', 'notes']].forEach(([s, k]) => {
    q(s).onchange = () => {
      x[k] = q(s).value;
      if (k === 'fournisseurId' && !x.echeance) x.echeance = isoDate(addDays(new Date(x.date || new Date()), 45));
      save(k === 'fournisseurId' || k === 'statut');
    };
  });
  ['#ac-ht', '#ac-tva'].forEach(s => { q(s).onchange = () => { x[s === '#ac-ht' ? 'montantHT' : 'montantTVA'] = q(s).value === '' ? '' : num(q(s).value); save(); }; });
  root.querySelectorAll('.ac-imp tr[data-i] [data-k]').forEach(el => el.onchange = () => {
    const l = x.imputations[+el.closest('tr').dataset.i];
    l[el.dataset.k] = el.dataset.k === 'montantHT' ? num(el.value) : el.value;
    // Commande choisie : chantier et montant repris de la commande
    if (el.dataset.k === 'commandeId' && el.value) { const c = Store.get('commandes', el.value); l.affaireId = c.affaireId || l.affaireId; if (!num(l.montantHT)) l.montantHT = Math.round(Calc.commande(c).total * 100) / 100; if (!l.libelle) l.libelle = `Commande ${c.numero || ''}`; }
    if (el.dataset.k === 'affaireId' && l.commandeId && (Store.get('commandes', l.commandeId) || {}).affaireId !== el.value) l.commandeId = '';
    save();
  });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { x.imputations.splice(+b.dataset.del, 1); save(); });
  q('#ac-add').onclick = () => { x.imputations.push({ affaireId: '', commandeId: '', libelle: '', montantHT: Math.max(0, Calc.achat(x).reste) || '' }); save(); };
  const solde = q('#ac-solde');
  if (solde) solde.onclick = () => { const r = Calc.achat(x).reste, last = x.imputations[x.imputations.length - 1]; if (last && !num(last.montantHT)) last.montantHT = r; else x.imputations.push({ affaireId: last ? last.affaireId : '', commandeId: '', libelle: '', montantHT: r }); save(); };
  const cde = q('#ac-cde');
  if (cde) cde.onchange = () => {
    const c = Store.get('commandes', cde.value);
    if (!c) return;
    x.imputations.push({ affaireId: c.affaireId || '', commandeId: c.id, libelle: `Commande ${c.numero || ''}`, montantHT: Math.round(Calc.commande(c).total * 100) / 100 });
    save();
  };
  q('#ac-fg').onchange = e => { x.fraisGeneraux = e.target.checked; save(); };
  q('#ac-releve').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (!x.fournisseurId) return notify('Choisissez d\'abord le fournisseur.'); importerReleve(x, f); };
  bindRapprochementAchat(root, x, save);
  q('#ac-file').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const pdf = file.type === 'application/pdf';
      if (pdf && file.size > 8 * 1024 * 1024) return notify('PDF trop volumineux (8 Mo maximum).');
      const dataUrl = pdf ? await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(file); }) : await compressImage(file, 1800, 0.8);
      const { id } = await api('POST', '/api/files', { dataUrl });
      x.pieceId = id; x.pieceType = pdf ? 'pdf' : 'image'; save();
    } catch (err) { notify('Pièce jointe impossible : ' + err.message); }
  };
  q('#ac-del').onclick = () => ask(`Supprimer la facture fournisseur ${x.ref || ''} et ses imputations ?`, 'Supprimer').then(ok => { if (ok) { Store.remove('achats', x.id); location.hash = '#/achats'; } });
};

// Bloc « Achats » de la fiche chantier : commandes rapprochées et achats hors commande
function achatsChantierHtml(a) {
  const d = Calc.achatsChantier(a.id);
  return `<h2>Achats et factures fournisseurs</h2>
  <div class="toolbar"><a class="btn secondary small" href="#/achats/new?chantier=${a.id}">+ Facture fournisseur</a><a class="btn secondary small" href="#/achats?chantier=${a.id}&q=&fournisseur=&statut=">Toutes les factures du chantier</a></div>
  <div class="table-wrap"><table><tr><th>Origine</th><th>Fournisseur</th><th>Désignation</th><th class="num">Commandé</th><th class="num">Facturé</th><th class="num">Retenu pour la rentabilité</th></tr>
    ${d.commandes.map(x => `<tr class="clickable" data-go="#/commandes/${x.c.id}"><td>Commande ${esc(x.c.numero || '…')} ${badge(x.c.statut)}</td><td>${esc(clientName(x.c.fournisseurId))}</td>
      <td class="small">${x.liees.length ? x.liees.map(l => `facture ${esc(l.achat.numeroFournisseur || l.achat.ref || '')}`).join(', ') : '<span class="muted">pas encore facturée</span>'}</td>
      <td class="num">${eur(x.commande)}</td><td class="num ${x.liees.length && Math.abs(x.facture - x.commande) > 0.01 ? 'warn-text' : ''}">${x.liees.length ? eur(x.facture) : '—'}</td><td class="num">${eur(x.cout)}</td></tr>`).join('')}
    ${d.horsCommande.map(l => `<tr class="clickable" data-go="#/achats/${l.achat.id}"><td>Hors commande <span class="muted small">${dateFr(l.achat.date)}</span></td><td>${esc(clientName(l.achat.fournisseurId))}</td>
      <td class="small">${esc(l.libelle || '')} · facture ${esc(l.achat.numeroFournisseur || l.achat.ref || '')}</td><td class="num">—</td><td class="num">${eur(l.montantHT)}</td><td class="num">${eur(l.montantHT)}</td></tr>`).join('')}
    ${d.comptoir.map(e => `<tr class="clickable" data-go="#/comptoir"><td>Comptoir <span class="muted small">${dateFr(e.date)}</span> <span class="badge b-warn">BL, facture à venir</span></td><td>${esc(clientName(e.fournisseurId))}</td>
      <td class="small">BL ${esc(e.bl || '—')} · ${esc(userName(e.userId))}${e.note ? ` · ${esc(e.note)}` : ''}${e.photoId ? ` <a href="${fileUrl(e.photoId)}" target="_blank" rel="noopener" data-nocl>📷</a>` : ''}</td><td class="num">—</td><td class="num">${eur(e.montant)}</td><td class="num">${eur(e.montant)}</td></tr>`).join('')}
    ${d.commandes.length || d.horsCommande.length || d.comptoir.length ? `<tr class="subtotal"><td colspan="5">Total des achats (commandes ${eur(d.totalCommandes)} + hors commande ${eur(d.totalHorsCommande)}${d.comptoir.length ? ` + comptoir sur BL ${eur(d.totalComptoir)}` : ''})</td><td class="num">${eur(d.totalCommandes + d.totalHorsCommande + d.totalComptoir)}</td></tr>` : '<tr><td colspan="6" class="muted">Aucun achat. Passez une commande ou imputez une facture fournisseur sur ce chantier.</td></tr>'}
  </table></div>
  ${comptoirChantierHtml(a)}
  ${Math.abs(d.ecartFactures) > 0.01 ? `<p class="small ${d.ecartFactures > 0 ? 'warn-text' : 'pos'}">Écart factures / commandes rapprochées : ${d.ecartFactures > 0 ? '+' : ''}${eur(d.ecartFactures)}</p>` : ''}`;
}
