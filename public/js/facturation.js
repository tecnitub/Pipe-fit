// Facturation à l'avancement : situations de travaux proposées à la maîtrise d'œuvre sous forme de BL numérotés
// (BL-AAAA-0001, numérotation indépendante des factures). Une situation acceptée génère sa facture.
const STATUTS_SITUATION = ['Brouillon', 'Proposée', 'Acceptée', 'Refusée'];
const r2 = v => Math.round(v * 100) / 100;
const situationsDe = devisId => Store.all('situations').filter(s => s.devisId === devisId)
  .sort((a, b) => ((a.numero || '~') + a.date).localeCompare((b.numero || '~') + b.date));
// Retenue de garantie du chantier (0 si aucune ou remplacée par une caution bancaire)
const retenueChantier = a => (a.caution ? 0 : num(a.retenueGarantie));
const situationRang = s => situationsDe(s.devisId).findIndex(x => x.id === s.id) + 1;

function facturationTabs(active) {
  const attente = Store.all('situations').filter(s => s.statut === 'Proposée').length;
  return `<div class="tabs">
    <a href="#/situations" class="${active === 'situations' ? 'active' : ''}">Situations (BL) ${attente ? `<span class="count">${attente} en attente</span>` : ''}</a>
    <a href="#/factures" class="${active === 'factures' ? 'active' : ''}">Factures et avoirs <span class="count">${Store.all('factures').length}</span></a>
    <a href="#/compta" class="${active === 'compta' ? 'active' : ''}">Comptabilité ${(() => { const n = Store.all('factures').filter(f => f.numero && !f.exportCompta).length; return n ? `<span class="count">${n} à transmettre</span>` : ''; })()}</a>
  </div>`;
}

// Nouvelle situation pour le devis accepté d'un chantier (une seule situation en cours à la fois)
function nouvelleSituation(affaireId) {
  const dv = Store.all('devis').find(d => d.affaireId === affaireId && d.statut === 'Accepté');
  if (!dv) { notify('Ce chantier n\'a pas de devis accepté.'); return null; }
  const enCours = situationsDe(dv.id).find(s => s.statut === 'Brouillon' || s.statut === 'Proposée');
  if (enCours) { App.toast(`La situation ${enCours.numero} est en cours : terminez-la d'abord.`, 4000); return enCours; }
  return Store.upsert('situations', { numero: '', affaireId, devisId: dv.id, date: isoDate(new Date()), statut: 'Brouillon', avancements: {}, factureId: '', commentaire: '' });
}

function facturerSituation(sit) {
  const dv = Store.get('devis', sit.devisId), c = Calc.situation(sit), s = Store.data.settings;
  const lignes = [];
  c.rows.forEach(r => {
    if (r.chap) { lignes.push({ type: 'chapitre', titre: r.titre, niveau: r.niveau }); return; }
    if (Math.abs(r.montant) >= 0.005) lignes.push({ designation: `${r.designation} – avancement ${fmt(r.prec, 1)} % → ${fmt(r.cumul, 1)} %`, unite: '', qte: 1, pu: r2(r.montant) });
  });
  const f = Store.upsert('factures', {
    numero: '', situationId: sit.id, devisId: dv.id, affaireId: sit.affaireId, clientId: docClientId(dv), contactId: dv.contactId || '', siteId: dv.siteId || '', chargeId: docChargeId(dv) || '',
    objet: `${dv.objet || ''} – situation n° ${situationRang(sit)}`, date: isoDate(new Date()), echeance: isoDate(addDays(new Date(), num(s.delaiPaiement))), statut: 'Émise',
    lignes: Calc.sansChapitresVides(lignes), ajustements: [], zoneId: '',
    retenuePct: retenueChantier(affaireOf(sit.affaireId)),
  });
  Object.assign(sit, { statut: 'Acceptée', factureId: f.id });
  Store.upsert('situations', sit);
  return f;
}

/* ---------- Liste des situations ---------- */
const FILTRES_SITUATIONS = { q: '', client: '', charge: '', statut: '' };
Views.situations = (params, query) => {
  if (params[0]) return situationEditor(params[0]);
  const f = lireFiltres('situations', query, FILTRES_SITUATIONS);
  const list = Store.all('situations').filter(s => { const a = affaireOf(s.affaireId); return (!f.statut || s.statut === f.statut) && (!f.client || a.clientId === f.client) && (!f.charge || a.chargeId === f.charge)
    && correspond(f.q, s.numero, a.code, a.nom, clientName(a.clientId)); }).sort((a, b) => (b.numero || '~').localeCompare(a.numero || '~'));
  return `<h1>Facturation</h1>${facturationTabs('situations')}
  <p class="muted">Chaque mois, proposez l'avancement des travaux à la maîtrise d'œuvre (BL). Une fois le BL accepté, la facture de situation est générée automatiquement.</p>
  <div class="toolbar">
    <select id="new-sit" style="width:auto"><option value="">+ Nouvelle situation pour le chantier…</option>${options(Store.all('affaires').filter(a => !a.archive && !estHorsDevis(a) && !['Clos'].includes(a.statut)), '', affaireLabel, false)}</select>
  </div>
  ${barreFiltres(f, { clients: [...new Set(Store.all('situations').map(s => affaireOf(s.affaireId).clientId))], statuts: [['', 'Tous statuts'], ...STATUTS_SITUATION.map(s => [s, s])], defauts: FILTRES_SITUATIONS })}
  ${list.length ? `<div class="table-wrap"><table><tr><th>N° BL</th><th>Date</th><th>Chantier</th><th>Client</th><th>Statut</th><th class="num">Avancement cumulé</th><th class="num">Montant HT</th><th>Facture</th></tr>
  ${list.map(s => {
    const c = Calc.situation(s), a = affaireOf(s.affaireId), f = Store.get('factures', s.factureId);
    return `<tr class="clickable" onclick="location.hash='#/situations/${s.id}'"><td><strong>${esc(s.numero || '…')}</strong> <span class="muted small">n° ${situationRang(s)}</span></td><td>${dateFr(s.date)}</td>
      <td>${esc(affaireLabel(a))}</td><td>${esc(clientName(a.clientId))}</td><td>${badge(s.statut)}</td><td class="num">${pct(c.pctCumul)}</td><td class="num">${eur(c.montant)}</td><td>${f ? esc(f.numero) : ''}</td></tr>`;
  }).join('')}</table></div>` : '<p class="muted">Aucune situation.</p>'}`;
};

/* ---------- Éditeur de situation ---------- */
function situationEditor(id) {
  const sit = Store.get('situations', id);
  if (!sit) return '<p>Situation introuvable. <a href="#/situations">Retour</a></p>';
  const c = Calc.situation(sit), a = affaireOf(sit.affaireId), dv = Store.get('devis', sit.devisId) || {};
  const edit = sit.statut === 'Brouillon';
  const f = Store.get('factures', sit.factureId);
  const doc = blDocument(sit, c, a, dv);
  return `<div class="toolbar">
    <a href="#/situations" class="btn secondary">← Situations</a>
    <a href="#/chantier/${sit.affaireId}" class="btn secondary">Chantier ${esc(a.code || '')}</a>
    <span class="spacer"></span>
    <button class="secondary print-btn" onclick="window.print()">Imprimer le BL</button>${boutonsEnvoi('situation', sit.id)}
    ${sit.statut === 'Brouillon' ? '<button id="proposer">Proposer à la maîtrise d\'œuvre</button>' : ''}
    ${sit.statut === 'Proposée' ? '<button id="accepter">BL accepté : générer la facture</button><button class="secondary" id="refuser">BL refusé</button>' : ''}
    ${sit.statut === 'Refusée' || sit.statut === 'Proposée' ? '<button class="secondary" id="brouillon">Corriger (repasser en brouillon)</button>' : ''}
    ${f ? `<a class="btn" href="#/facture/${f.id}">Facture ${esc(f.numero)}</a>` : ''}
    ${sit.statut !== 'Acceptée' ? '<button class="danger" id="del">Supprimer</button>' : ''}
  </div>
  <h1>Situation n° ${situationRang(sit)} · ${esc(sit.numero || '')} ${badge(sit.statut)}</h1>${envoisHtml('situations', sit.id)}
  <p class="muted">Chantier ${esc(affaireLabel(a))} · Devis ${esc(dv.numero || '')} · ${c.prev ? `situation précédente acceptée : ${esc(c.prev.numero)}` : 'première situation'}</p>
  ${a.okFacturation ? `<p class="note">Réception signée le ${dateFr(a.dateReception)} : feu vert pour facturer le solde des travaux.</p>` : ''}

  <div class="cards">
    <div class="card"><div class="label">Montant du marché</div><div class="value">${eur(c.marche)}</div></div>
    <div class="card"><div class="label">Avancement cumulé</div><div class="value">${pct(c.pctCumul)}</div>${gauge(c.cumul, c.marche)}<div class="sub">${eur(c.cumul)} cumulés · précédent ${pct(c.pctPrec)}</div></div>
    <div class="card"><div class="label">Montant de cette situation</div><div class="value">${eur(c.montant)}</div><div class="sub">HT, à facturer après accord · reste ${eur(c.marche - c.cumul)}</div></div>
  </div>

  <div class="card no-print">
    <div class="grid2">
      <div class="field"><label for="s-date">Date du BL</label><input id="s-date" type="date" value="${esc(sit.date)}" ${edit ? '' : 'disabled'}></div>
      <div class="field" style="grid-column:span 2"><label for="s-com">Commentaire pour la maîtrise d'œuvre</label><input id="s-com" value="${esc(sit.commentaire)}" ${edit ? '' : 'disabled'}></div>
    </div>
    ${edit ? `<div class="toolbar" style="margin:12px 0 0"><label class="inline">Mettre toutes les lignes à <input id="s-all" type="number" min="0" max="100" step="5" style="width:80px"> %</label><button class="secondary" id="s-all-btn">Appliquer</button></div>` : ''}
  </div>

  <div class="table-wrap no-print" style="margin-top:12px"><table class="sit-table">
    <tr><th>Désignation</th><th class="num">Marché HT</th><th class="num">% préc.</th><th class="num">% cumulé</th><th class="num">Cumulé</th><th class="num">Précédent</th><th class="num">Cette situation</th></tr>
    ${c.rows.map(r => r.chap ? `<tr class="chap niv-${r.niveau || 1}"><td colspan="7">${esc(r.titre)}</td></tr>`
      : `<tr><td>${esc(r.designation)}</td><td class="num">${eur(r.marche)}</td><td class="num muted">${fmt(r.prec, 1)} %</td>
        <td class="num">${edit ? `<input data-av="${r.key}" type="number" min="${r.prec}" max="100" step="any" value="${r.cumul}" style="width:80px" aria-label="Avancement cumulé en %">` : `${fmt(r.cumul, 1)} %`}</td>
        <td class="num">${eur(r.montantCumul)}</td><td class="num muted">${eur(r.montantPrec)}</td><td class="num"><strong>${eur(r.montant)}</strong></td></tr>`).join('')}
    <tr class="subtotal"><td>Total</td><td class="num">${eur(c.marche)}</td><td class="num">${pct(c.pctPrec)}</td><td class="num">${pct(c.pctCumul)}</td><td class="num">${eur(c.cumul)}</td><td class="num">${eur(c.precedent)}</td><td class="num">${eur(c.montant)}</td></tr>
  </table></div>

  <details class="no-print preview"><summary>Aperçu du BL pour la maîtrise d'œuvre</summary><div class="doc-print">${doc}</div></details>
  <div class="print-only doc-print">${doc}</div>`;
}

function blDocument(sit, c, a, dv) {
  const s = Store.data.settings;
  const dest = a.moeId ? entreprise(a.moeId) : entreprise(a.clientId);
  const destContact = Store.get('contacts', a.moeId ? a.moeContactId : a.contactId);
  const bill = billingSite(a.moeId || a.clientId), site = siteOf(a.clientId, a.siteId);
  const o = Doc.t('situation');
  const cols = [['Désignation', r => esc(r.designation), 'Total'], o.marche && ['Marché HT', r => eur(r.marche), eur(c.marche)], ['% cumulé', r => `${fmt(r.cumul, 1)} %`, pct(c.pctCumul)],
    o.precedent && ['Cumulé HT', r => eur(r.montantCumul), eur(c.cumul)], o.precedent && ['Précédent HT', r => eur(r.montantPrec), eur(c.precedent)], ['Situation HT', r => eur(r.montant), eur(c.montant)]].filter(Boolean);
  return `${Doc.entete('situation', `${o.titre} N° ${situationRang(sit)}`, `BL ${esc(sit.numero || '')} du ${dateFr(sit.date)}<br>Chantier ${esc(a.code || '')} · Devis ${esc(dv.numero || '')}`)}
    <div class="doc-parties"><div>${a.moeId ? 'Maîtrise d\'œuvre' : 'Client'} : <strong>${esc(dest.nom || '—')}</strong>${bill ? `<br>${esc(fullAddress(bill))}` : ''}${destContact ? `<br>À l'attention de ${esc(contactName(destContact))}${destContact.fonction ? `, ${esc(destContact.fonction)}` : ''}` : ''}</div>
    <div>${o.maitreOuvrage ? `Maître d'ouvrage : <strong>${esc(clientName(a.clientId))}</strong>${site ? `<br>${esc(site.libelle)} – ${esc(fullAddress(site))}` : ''}` : ''}</div></div>
    <p class="doc-objet"><strong>Objet :</strong> ${esc(dv.objet || a.nom)} – avancement des travaux au ${dateFr(sit.date)}</p>
    ${Doc.intro('situation')}${sit.commentaire ? `<p>${esc(sit.commentaire)}</p>` : ''}
    <div class="table-wrap"><table class="doc-lines${cols.length < 5 ? ' compact' : ''}"><tr>${cols.map((k, i) => `<th${i ? ' class="num"' : ''}>${k[0]}</th>`).join('')}</tr>
    ${c.rows.map(r => r.chap ? `<tr class="chap niv-${r.niveau || 1}"><td colspan="${cols.length}">${esc(r.titre)}</td></tr>`
      : `<tr>${cols.map((k, i) => `<td${i ? ' class="num"' : ''}>${k[1](r)}</td>`).join('')}</tr>`).join('')}
    <tr class="subtotal">${cols.map((k, i) => `<td${i ? ' class="num"' : ''}>${k[2]}</td>`).join('')}</tr></table></div>
    <table class="totals"><tr><td>Montant de la situation HT</td><td class="num">${eur(c.montant)}</td></tr>
      <tr><td>TVA ${fmt(s.tva, 1)} %</td><td class="num">${eur(c.montant * num(s.tva) / 100)}</td></tr>
      <tr class="${retenueChantier(a) ? '' : 'grand'}"><td>Montant TTC</td><td class="num">${eur(c.montant * (1 + num(s.tva) / 100))}</td></tr>
      ${retenueChantier(a) ? `<tr><td>Retenue de garantie ${fmt(retenueChantier(a), 1)} %</td><td class="num">− ${eur(c.montant * (1 + num(s.tva) / 100) * retenueChantier(a) / 100)}</td></tr>
      <tr class="grand"><td>Net à payer TTC</td><td class="num">${eur(c.montant * (1 + num(s.tva) / 100) * (1 - retenueChantier(a) / 100))}</td></tr>` : ''}</table>
    ${Doc.pied('situation', '', o.signature ? `<div class="signatures"><div>Pour ${esc(s.societe)}<br>${esc(userName(a.chargeId))}</div><div>Bon pour accord de la maîtrise d'œuvre<br>Date et signature :</div></div>` : '')}`;
}

Views.situations.bind = (root, params, query) => {
  if (!params[0]) {
    bindFiltres(root, 'situations', lireFiltres('situations', query, FILTRES_SITUATIONS), FILTRES_SITUATIONS);
    root.querySelector('#new-sit').onchange = e => { const s = e.target.value && nouvelleSituation(e.target.value); if (s) location.hash = `#/situations/${s.id}`; };
    return;
  }
  const sit = Store.get('situations', params[0]);
  if (!sit) return;
  const save = () => { Store.upsert('situations', sit); App.render(); };
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  const set = (k, v) => { sit.avancements = { ...(sit.avancements || {}), [k]: v }; };
  root.querySelectorAll('[data-av]').forEach(inp => inp.onchange = () => {
    const min = num(inp.min), v = Math.max(min, Math.min(100, num(inp.value)));
    if (num(inp.value) < min) App.toast(`L'avancement ne peut pas être inférieur à la situation précédente (${fmt(min, 1)} %).`, 4000);
    set(inp.dataset.av, v); save();
  });
  on('#s-all-btn', () => {
    const v = num(root.querySelector('#s-all').value);
    root.querySelectorAll('[data-av]').forEach(inp => set(inp.dataset.av, Math.max(num(inp.min), Math.min(100, v))));
    save();
  });
  const d = root.querySelector('#s-date'); if (d) d.onchange = () => { sit.date = d.value; save(); };
  const cm = root.querySelector('#s-com'); if (cm) cm.onchange = () => { sit.commentaire = cm.value; save(); };
  on('#proposer', () => {
    if (Calc.situation(sit).montant <= 0) { notify('Le montant de cette situation est nul : saisissez l\'avancement des lignes.'); return; }
    sit.statut = 'Proposée'; save(); App.toast('BL proposé : imprimez-le ou envoyez-le à la maîtrise d\'œuvre.', 4000);
  });
  on('#accepter', async () => {
    if (!await ask(`La maîtrise d'œuvre a accepté le BL ${sit.numero} (${eur(Calc.situation(sit).montant)} HT). Générer la facture ?`, 'Générer la facture', false)) return;
    const f = facturerSituation(sit);
    location.hash = `#/facture/${f.id}`;
  });
  on('#refuser', () => { sit.statut = 'Refusée'; save(); });
  on('#brouillon', () => { sit.statut = 'Brouillon'; save(); });
  on('#del', () => ask(`Supprimer la situation ${sit.numero} ?`, 'Supprimer').then(ok => { if (ok) { Store.remove('situations', sit.id); location.hash = '#/situations'; } }));
};
