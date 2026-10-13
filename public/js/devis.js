// Devis : en-tête (client, contact, chargé d'affaires), lignes en chapitres et ouvrages
// (fournitures de la bibliothèque + main-d'œuvre), remises / majorations, passage en chantier.
const STATUTS_DEVIS = ['Brouillon', 'Envoyé', 'Accepté', 'Refusé'];
const UNITES = ['u', 'ml', 'm²', 'kg', 'h', 'forfait', 'ens', 'semaine', 'jour'];

const docClientId = doc => doc.clientId || affaireOf(doc.affaireId).clientId;
const docChargeId = doc => doc.chargeId || affaireOf(doc.affaireId).chargeId;
const moList = () => Store.all('mainoeuvre');
const moOf = id => Store.get('mainoeuvre', id) || {};

function newDevis(fields = {}) {
  const me = Store.get('users', Store.me.userId);
  return Store.upsert('devis', {
    numero: '', objet: '', clientId: '', contactId: '', siteId: '', chargeId: me && me.role === 'charge' ? me.id : '',
    date: isoDate(new Date()), validite: 30, statut: 'Brouillon', zoneId: '', ajustements: [], lignes: [], ...fields,
  });
}

/* ---------- Rendu du document client (devis / facture) ---------- */
function docHeader(doc, title) {
  const s = Store.data.settings, a = affaireOf(doc.affaireId), cid = docClientId(doc), c = entreprise(cid);
  const bill = billingSite(cid), contact = Store.get('contacts', doc.contactId), site = siteOf(cid, doc.siteId);
  const objet = doc.objet || (Store.get('devis', doc.devisId) || {}).objet || a.nom;
  return `<div class="doc-head">
    <div><strong>${esc(s.societe)}</strong><br>${esc(s.adresse)}<br>SIRET ${esc(s.siret)}</div>
    <div><strong style="font-size:18px">${title} ${esc(doc.numero || '(numéro en cours…)')}</strong><br>Date : ${dateFr(doc.date)}
      ${a.code ? `<br>${estHorsDevis(a) ? 'Intervention' : 'Chantier'} : ${esc(a.code)}` : ''}${doc.refCommande ? `<br>Votre commande n° ${esc(doc.refCommande)}` : ''}<br>Chargé d'affaires : ${esc(userName(docChargeId(doc)))}</div>
  </div>
  <div class="doc-parties">
    <div><strong>${esc(c.nom || '—')}</strong>${bill ? `<br>${esc(bill.adresse)}<br>${esc(bill.cp)} ${esc(bill.ville)}` : ''}${c.tvaIntra ? `<br>TVA : ${esc(c.tvaIntra)}` : ''}</div>
    <div>${contact ? `À l'attention de <strong>${esc(contactName(contact))}</strong>${contact.fonction ? `, ${esc(contact.fonction)}` : ''}${contact.email ? `<br>${esc(contact.email)}` : ''}${contact.mobile || contact.tel ? `<br>${esc(contact.mobile || contact.tel)}` : ''}` : ''}
      ${site ? `<br><br>Lieu d'intervention : <strong>${esc(site.libelle)}</strong><br>${esc(fullAddress(site))}` : ''}</div>
  </div>
  ${objet ? `<p class="doc-objet"><strong>Objet :</strong> ${esc(objet)}</p>` : ''}`;
}

function docLinesClient(doc) {
  const chaps = Calc.chapitres(doc);
  const subAfter = {};
  chaps.forEach(c => { if (c.last > c.index) subAfter[c.last] = c; });
  const nums = (doc.lignes || []).some(l => l.num);
  const n = nums ? 6 : 5;
  return `<div class="table-wrap"><table class="doc-lines">
    <tr>${nums ? '<th>N°</th>' : ''}<th>Désignation</th><th class="num">Qté</th><th>Unité</th><th class="num">PU HT</th><th class="num">Total HT</th></tr>
    ${(doc.lignes || []).map((l, i) => (l.type === 'chapitre'
      ? `<tr class="chap"><td colspan="${n}">${esc(l.titre)}</td></tr>`
      : `<tr>${nums ? `<td>${esc(l.num || '')}</td>` : ''}<td>${esc(l.designation)}${l.detail ? `<div class="muted small pre">${esc(l.detail)}</div>` : ''}</td><td class="num">${fmt(l.qte, 2)}</td><td>${esc(l.unite)}</td><td class="num">${eur(Calc.pu(l))}</td><td class="num">${eur(Calc.ligneHT(l))}</td></tr>`)
      + (subAfter[i] ? `<tr class="subtotal"><td colspan="${n - 1}">Sous-total ${esc(subAfter[i].titre)}</td><td class="num">${eur(subAfter[i].total)}</td></tr>` : '')).join('')}
  </table></div>`;
}

function totalsTable(doc) {
  const t = Calc.doc(doc), z = Store.get('zones', doc.zoneId);
  return `<table class="totals">
    <tr><td>Total des travaux</td><td class="num">${eur(t.brut)}</td></tr>
    ${t.ajust.map(a => `<tr><td>${esc(a.libelle || (a.pct < 0 ? 'Remise' : 'Majoration'))} ${a.pct > 0 ? '+' : ''}${fmt(a.pct, 1)} %</td><td class="num">${a.montant < 0 ? '− ' : '+ '}${eur(Math.abs(a.montant))}</td></tr>`).join('')}
    ${t.ajust.length ? `<tr><td>Total après ajustements</td><td class="num">${eur(t.net)}</td></tr>` : ''}
    ${t.livraison || z ? `<tr><td>Livraison ${z ? `(${esc(z.nom)}, ${fmt(t.poids / 1000, 2)} t)` : ''}</td><td class="num">${eur(t.livraison)}</td></tr>` : ''}
    <tr><td>Total HT</td><td class="num">${eur(t.totalHT)}</td></tr>
    <tr><td>TVA ${fmt(Store.data.settings.tva, 1)} %</td><td class="num">${eur(t.tva)}</td></tr>
    <tr class="${t.retenue ? '' : 'grand'}"><td>Total TTC</td><td class="num">${eur(t.totalTTC)}</td></tr>
    ${t.retenue ? `<tr><td>Retenue de garantie ${fmt(doc.retenuePct, 1)} %</td><td class="num">− ${eur(t.retenue)}</td></tr>
    <tr class="grand"><td>Net à payer TTC</td><td class="num">${eur(t.netAPayer)}</td></tr>` : ''}
  </table>`;
}

// Pilotage : part fournitures / part main-d'œuvre, heures par catégorie, marge
function pilotageDevis(t) {
  const mo = Object.entries(t.hByMo).map(([k, h]) => `<tr><td>${esc(moOf(k).libelle || 'Autre')}</td><td class="num">${fmt(h, 1)} h</td></tr>`).join('');
  return `<div class="cards">
    <div class="card"><div class="label">Fournitures</div><div class="value">${eur(t.venteF)}</div><div class="sub">Coût d'achat ${eur(t.coutF)} · marge ${eur(t.venteF - t.coutF)}</div></div>
    <div class="card"><div class="label">Main-d'œuvre</div><div class="value">${eur(t.venteMO)}</div><div class="sub">${fmt(t.heures, 1)} h · coût ${eur(t.coutMO)} · ${pct(t.partMOPct)} du montant</div></div>
    <div class="card"><div class="label">Marge prévisionnelle</div><div class="value ${signClass(t.margePrev)}">${eur(t.margePrev)}</div><div class="sub">${marginBadge(t.margePrevPct)} après transport ${eur(t.coutLivraison)}</div></div>
  </div>
  ${mo ? `<div class="table-wrap" style="max-width:420px"><table><tr><th>Heures par catégorie</th><th class="num">Heures</th></tr>${mo}</table></div>` : ''}`;
}

/* ---------- Liste ---------- */
Views.devis = (params, query) => {
  if (params[0]) return devisEditor(params[0]);
  const fs = query.get('statut') || '', fc = query.get('charge') || '';
  const list = Store.all('devis').filter(d => (!fs || d.statut === fs) && (!fc || docChargeId(d) === fc))
    .sort((a, b) => (b.numero || '~').localeCompare(a.numero || '~'));
  return `<h1>Devis</h1>
  <div class="toolbar">
    <button id="add">+ Nouveau devis</button>
    <span class="spacer"></span>
    <select id="fc" style="width:auto"><option value="">Tous les chargés</option>${options(charges(), fc, undefined, false)}</select>
    <select id="fs" style="width:auto"><option value="">Tous statuts</option>${optionsStr(STATUTS_DEVIS, fs)}</select>
  </div>
  ${list.length ? `<div class="table-wrap"><table><tr><th>N°</th><th>Date</th><th>Objet</th><th>Client</th><th>Contact</th><th>Chargé</th><th>Statut</th><th class="num">Total HT</th><th class="num">Part MO</th><th class="num">Marge prév.</th></tr>
  ${list.map(d => {
    const t = Calc.doc(d), ct = Store.get('contacts', d.contactId);
    return `<tr class="clickable" onclick="location.hash='#/devis/${d.id}'"><td>${esc(d.numero || '…')}</td><td>${dateFr(d.date)}</td><td>${esc(d.objet)}</td><td>${esc(clientName(docClientId(d)))}</td>
      <td>${ct ? esc(contactName(ct)) : ''}</td><td>${esc(userName(docChargeId(d)))}</td><td>${badge(d.statut)}${d.affaireId ? ' <span class="badge b-ok">Chantier</span>' : ''}</td>
      <td class="num">${eur(t.totalHT)}</td><td class="num">${pct(t.partMOPct)}</td><td class="num">${marginBadge(t.margePrevPct)}</td></tr>`;
  }).join('')}</table></div>` : '<p class="muted">Aucun devis. Créez-en un avec « + Nouveau devis ».</p>'}`;
};

/* ---------- Éditeur ---------- */
function devisEditor(id) {
  const d = Store.get('devis', id);
  if (!d) return '<p>Devis introuvable. <a href="#/devis">Retour aux devis</a></p>';
  const t = Calc.doc(d);
  const cid = docClientId(d);
  const locked = d.statut === 'Accepté';
  const chaps = Calc.chapitres(d);
  const subAfter = {};
  chaps.forEach(c => { subAfter[c.last] = c; });
  const lines = d.lignes || [];
  return `
  <div class="toolbar">
    <a href="#/devis" class="btn secondary">← Devis</a>
    ${d.affaireId ? `<a href="#/chantier/${d.affaireId}" class="btn secondary">Chantier ${esc(affaireOf(d.affaireId).code || '')}</a>` : ''}
    <span class="spacer"></span>
    ${!locked ? '<button class="secondary" id="dpgf-imp">Importer un DPGF</button>' : ''}
    <button class="secondary dl-btn" id="dpgf-exp">Exporter le DPGF chiffré</button>
    <button class="secondary" id="dup">Dupliquer</button>
    <button class="secondary print-btn" onclick="window.print()">Imprimer / PDF</button>
    ${!d.affaireId && d.statut !== 'Refusé' ? '<button id="accept">Accepté : créer le chantier</button>' : ''}
    ${d.affaireId ? `<a class="btn secondary" href="#/situations?devis=${d.id}">Situations</a>` : ''}
    <button class="danger" id="del">Supprimer</button>
  </div>
  <h1>Devis ${esc(d.numero || '')} ${badge(d.statut)}</h1>
  ${locked ? '<p class="note no-print">Devis accepté : il sert de budget au chantier. Pour le modifier, dupliquez-le en avenant.</p>' : ''}
  ${!locked && lines.filter(aChiffrer).length ? `<p class="note warn no-print">${lines.filter(aChiffrer).length} ouvrage(s) à chiffrer : cliquez sur chaque désignation pour ajouter fournitures et main-d'œuvre.</p>` : ''}

  <div class="card no-print">
    <div class="grid2">
      <div class="field" style="grid-column:1/-1"><label for="d-objet">Objet des travaux</label><input id="d-objet" value="${esc(d.objet)}" ${locked ? 'disabled' : ''}></div>
      <div class="field"><label for="d-client">Client</label><select id="d-client">${options(clientsList(), cid)}</select></div>
      <div class="field"><label for="d-contact">Contact client (chargé de travaux)</label><select id="d-contact">${contactOptions(cid, d.contactId)}</select></div>
      <div class="field"><label for="d-site">Site d'intervention</label><select id="d-site">${siteOptions(cid, d.siteId)}</select></div>
      <div class="field"><label for="d-charge">Chargé d'affaires (suivi des travaux)</label><select id="d-charge">${options(charges(), docChargeId(d))}</select></div>
      <div class="field"><label for="d-date">Date</label><input id="d-date" type="date" value="${esc(d.date)}"></div>
      <div class="field"><label for="d-validite">Validité (jours)</label><input id="d-validite" type="number" value="${esc(d.validite)}"></div>
      <div class="field"><label for="d-statut">Statut</label><select id="d-statut" ${d.affaireId ? 'disabled' : ''}>${optionsStr(STATUTS_DEVIS, d.statut)}</select></div>
      <div class="field"><label for="d-zone">Livraison (zone)</label><select id="d-zone">${options(Store.all('zones'), d.zoneId)}</select></div>
      <div class="field"><label for="d-livman">Livraison forcée € HT (vide = calcul)</label><input id="d-livman" type="number" step="0.01" value="${esc(d.livraisonManuelle ?? '')}"></div>
    </div>
  </div>

  <h2 class="no-print">Lignes du devis</h2>
  <div class="table-wrap no-print"><table class="edit-lines">
    <tr><th></th><th>Désignation</th><th class="num">Qté</th><th>Unité</th><th class="num">PU fournit.</th><th class="num">PU MO</th><th class="num">PU HT</th><th class="num">Total HT</th><th></th></tr>
    ${lines.map((l, i) => {
      const move = locked ? '<td></td>' : `<td class="move"><button class="icon" data-up="${i}" aria-label="Monter" ${i === 0 ? 'disabled' : ''}>▲</button><button class="icon" data-down="${i}" aria-label="Descendre" ${i === lines.length - 1 ? 'disabled' : ''}>▼</button></td>`;
      const del = locked ? '<td></td>' : `<td><button class="small danger" data-del="${i}" aria-label="Supprimer la ligne">✕</button></td>`;
      let row;
      if (l.type === 'chapitre') {
        row = `<tr class="chap">${move}<td colspan="7"><input data-titre="${i}" value="${esc(l.titre)}" ${locked ? 'disabled' : ''} aria-label="Titre du chapitre"></td>${del}</tr>`;
      } else {
        const u = Calc.unit(l);
        const nbF = (l.composants || []).filter(c => c.type !== 'mo').length;
        row = `<tr class="${aChiffrer(l) ? 'a-chiffrer' : ''}">${move}<td>${l.num ? `<span class="muted small">${esc(l.num)}</span> ` : ''}<button class="linklike" data-open="${i}">${esc(l.designation || 'Ouvrage sans titre')}</button>
            ${aChiffrer(l) ? '<span class="badge b-warn">à chiffrer</span>' : ''}
            <div class="muted small">${nbF} fourniture${nbF > 1 ? 's' : ''} · ${fmt(u.heures, 2)} h de main-d'œuvre / ${esc(l.unite)}${l.detail ? ' · <span title="' + esc(l.detail) + '">descriptif</span>' : ''}</div></td>
          <td class="num"><input data-qte="${i}" type="number" step="any" value="${esc(l.qte)}" style="width:80px" ${locked ? 'disabled' : ''} aria-label="Quantité"></td>
          <td>${esc(l.unite)}</td><td class="num">${eur(u.f)}</td><td class="num">${eur(u.mo)}</td><td class="num">${eur(u.f + u.mo)}</td><td class="num"><strong>${eur(Calc.ligneHT(l))}</strong></td>${del}</tr>`;
      }
      const sub = subAfter[i] ? `<tr class="subtotal"><td></td><td colspan="6">Sous-total ${esc(subAfter[i].titre)}</td><td class="num">${eur(subAfter[i].total)}</td><td></td></tr>` : '';
      return row + sub;
    }).join('') || '<tr><td colspan="9" class="muted">Aucune ligne. Ajoutez un chapitre puis des ouvrages.</td></tr>'}
  </table></div>
  ${locked ? '' : `<div class="toolbar no-print" style="margin-top:8px">
    <button class="secondary" id="add-chap">+ Chapitre</button>
    <button id="add-ouv">+ Ouvrage</button>
  </div>`}

  <h2 class="no-print">Remises et majorations (sur l'ensemble des lignes)</h2>
  <div class="card no-print">
    ${(d.ajustements || []).map((a, i) => `<div class="ajust-row">
      <select data-aj-type="${i}" aria-label="Type" ${locked ? 'disabled' : ''}><option value="-" ${num(a.pct) < 0 ? 'selected' : ''}>Remise</option><option value="+" ${num(a.pct) >= 0 ? 'selected' : ''}>Majoration</option></select>
      <input data-aj-lib="${i}" value="${esc(a.libelle)}" placeholder="Libellé" aria-label="Libellé" ${locked ? 'disabled' : ''}>
      <input data-aj-pct="${i}" type="number" step="0.5" min="0" value="${esc(Math.abs(num(a.pct)))}" aria-label="Pourcentage" style="width:90px" ${locked ? 'disabled' : ''}><span>%</span>
      <span class="num ${num(a.pct) < 0 ? 'neg' : ''}">${eur(t.brut * num(a.pct) / 100)}</span>
      ${locked ? '' : `<button class="small danger" data-aj-del="${i}" aria-label="Supprimer">✕</button>`}</div>`).join('') || '<p class="muted" style="margin:0">Aucune remise ni majoration.</p>'}
    ${locked ? '' : `<div class="toolbar" style="margin:10px 0 0"><button class="secondary small" id="add-remise">+ Remise</button><button class="secondary small" id="add-maj">+ Majoration</button></div>`}
  </div>
  ${totalsTable(d)}

  <h2 class="no-print">Pilotage prévisionnel</h2>
  <div class="no-print">${pilotageDevis(t)}</div>

  <details class="no-print preview"><summary>Aperçu du devis client</summary>
    <div class="doc-print">${docHeader(d, 'DEVIS')}${docLinesClient(d)}${totalsTable(d)}
    <p class="muted" style="margin-top:20px">Devis valable ${esc(d.validite)} jours.</p></div></details>
  <div class="print-only doc-print">${docHeader(d, 'DEVIS')}${docLinesClient(d)}${totalsTable(d)}
    <p style="margin-top:20px">Devis valable ${esc(d.validite)} jours. Bon pour accord, date et signature :</p></div>`;
}

Views.devis.bind = (root, params) => {
  if (!params[0]) {
    root.querySelector('#add').onclick = () => { const d = newDevis(); location.hash = `#/devis/${d.id}`; };
    const upd = () => { location.hash = `#/devis?statut=${encodeURIComponent(root.querySelector('#fs').value)}&charge=${root.querySelector('#fc').value}`; };
    root.querySelector('#fs').onchange = upd;
    root.querySelector('#fc').onchange = upd;
    return;
  }
  const d = Store.get('devis', params[0]);
  if (!d) return;
  const save = () => { Store.upsert('devis', d); App.render(); };
  const on = (sel, ev, fn) => { const el = root.querySelector(sel); if (el) el[ev] = fn; };
  const field = (sel, key, isNum) => on(sel, 'onchange', e => { d[key] = isNum ? (e.target.value === '' ? '' : +e.target.value) : e.target.value; save(); });

  on('#d-client', 'onchange', e => {
    const c = e.target.value, sites = entreprise(c).adresses || [];
    Object.assign(d, { clientId: c, contactId: defaultContact(c), siteId: sites.length === 1 ? sites[0].id : '' });
    if (entreprise(c).zoneId) d.zoneId = entreprise(c).zoneId;
    save();
  });
  field('#d-objet', 'objet'); field('#d-contact', 'contactId'); field('#d-site', 'siteId'); field('#d-charge', 'chargeId');
  field('#d-date', 'date'); field('#d-validite', 'validite', true); field('#d-zone', 'zoneId');
  on('#d-livman', 'onchange', e => { d.livraisonManuelle = e.target.value === '' ? null : +e.target.value; save(); });
  on('#d-statut', 'onchange', e => {
    if (e.target.value === 'Accepté') { e.target.value = d.statut; acceptDevis(d); return; }
    d.statut = e.target.value; save();
  });

  // Lignes
  root.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openOuvrage(d, +b.dataset.open));
  root.querySelectorAll('[data-qte]').forEach(inp => inp.onchange = () => { d.lignes[+inp.dataset.qte].qte = +inp.value; save(); });
  root.querySelectorAll('[data-titre]').forEach(inp => inp.onchange = () => { d.lignes[+inp.dataset.titre].titre = inp.value; save(); });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { d.lignes.splice(+b.dataset.del, 1); save(); });
  const swap = (i, j) => { [d.lignes[i], d.lignes[j]] = [d.lignes[j], d.lignes[i]]; save(); };
  root.querySelectorAll('[data-up]').forEach(b => b.onclick = () => swap(+b.dataset.up, +b.dataset.up - 1));
  root.querySelectorAll('[data-down]').forEach(b => b.onclick = () => swap(+b.dataset.down, +b.dataset.down + 1));
  on('#add-chap', 'onclick', async () => {
    const titre = await askValue('Titre du chapitre', `Chapitre ${d.lignes.filter(l => l.type === 'chapitre').length + 1}`);
    if (titre) { d.lignes.push({ type: 'chapitre', titre }); save(); }
  });
  on('#add-ouv', 'onclick', () => openOuvrage(d, null));

  // Remises / majorations
  const aj = i => d.ajustements[i];
  root.querySelectorAll('[data-aj-type]').forEach(s => s.onchange = () => { const a = aj(+s.dataset.ajType); a.pct = (s.value === '-' ? -1 : 1) * Math.abs(num(a.pct)); save(); });
  root.querySelectorAll('[data-aj-lib]').forEach(s => s.onchange = () => { aj(+s.dataset.ajLib).libelle = s.value; save(); });
  root.querySelectorAll('[data-aj-pct]').forEach(s => s.onchange = () => { const a = aj(+s.dataset.ajPct); a.pct = (num(a.pct) < 0 ? -1 : 1) * Math.abs(+s.value); save(); });
  root.querySelectorAll('[data-aj-del]').forEach(b => b.onclick = () => { d.ajustements.splice(+b.dataset.ajDel, 1); save(); });
  on('#add-remise', 'onclick', () => { (d.ajustements = d.ajustements || []).push({ libelle: 'Remise commerciale', pct: -5 }); save(); });
  on('#add-maj', 'onclick', () => { (d.ajustements = d.ajustements || []).push({ libelle: 'Majoration', pct: 5 }); save(); });

  on('#accept', 'onclick', () => acceptDevis(d));
  on('#dpgf-imp', 'onclick', () => importerDPGF(d));
  on('#dpgf-exp', 'onclick', () => exporterDPGF(d));
  on('#del', 'onclick', () => ask(`Supprimer le devis ${d.numero} ?${d.affaireId ? ' Le chantier associé sera conservé.' : ''}`, 'Supprimer').then(ok => {
    if (ok) { Store.remove('devis', d.id); location.hash = '#/devis'; }
  }));
  on('#dup', 'onclick', () => {
    const copy = JSON.parse(JSON.stringify(d));
    Object.keys(copy).filter(k => k.startsWith('_')).forEach(k => delete copy[k]);
    delete copy.id;
    Object.assign(copy, { numero: '', statut: 'Brouillon', date: isoDate(new Date()), affaireId: '', objet: d.objet + ' (copie)' });
    const n = Store.upsert('devis', copy);
    location.hash = `#/devis/${n.id}`;
  });
};

// Devis accepté : création du chantier avec le devis comme budget
async function acceptDevis(d) {
  if (!docClientId(d)) { notify('Choisissez d\'abord le client.'); return; }
  if (!await ask(`Le client a accepté le devis ${d.numero} (${eur(Calc.doc(d).totalHT)} HT). Créer le chantier ?`, 'Créer le chantier', false)) return;
  const af = Store.upsert('affaires', {
    code: '', nom: d.objet || `Chantier ${clientName(docClientId(d))}`, clientId: docClientId(d), contactId: d.contactId || '', siteId: d.siteId || '',
    chargeId: docChargeId(d) || '', statut: 'En préparation', devisId: d.id, dateCreation: isoDate(new Date()), heuresPrevues: 0, rex: {},
  });
  Object.assign(d, { statut: 'Accepté', affaireId: af.id });
  Store.upsert('devis', d);
  App.toast('Chantier créé : le devis devient son budget.', 4000);
  location.hash = `#/chantier/${af.id}`;
}

function facturerDevis(d) {
  const s = Store.data.settings;
  return Store.upsert('factures', {
    numero: '', devisId: d.id, affaireId: d.affaireId || '', clientId: docClientId(d), contactId: d.contactId || '', siteId: d.siteId || '', chargeId: docChargeId(d) || '',
    objet: d.objet, date: isoDate(new Date()), echeance: isoDate(addDays(new Date(), num(s.delaiPaiement))), statut: 'Émise',
    lignes: JSON.parse(JSON.stringify(d.lignes)), ajustements: JSON.parse(JSON.stringify(d.ajustements || [])), remiseGlobale: d.remiseGlobale || 0,
    zoneId: d.zoneId, livraisonManuelle: d.livraisonManuelle,
  });
}

/* ---------- Ouvrage : fournitures + main-d'œuvre ---------- */
function articleSelect(id) {
  const fam = {};
  Store.all('articles').forEach(a => { (fam[a.famille || 'Divers'] = fam[a.famille || 'Divers'] || []).push(a); });
  return `<select id="${id}" aria-label="Fourniture de la bibliothèque"><option value="">Choisir une fourniture…</option>${Object.entries(fam).map(([f, list]) =>
    `<optgroup label="${esc(f)}">${list.map(a => `<option value="${a.id}">${esc(a.ref)} – ${esc(a.designation)} (${eur(a.prixVente)}/${esc(a.unite)})</option>`).join('')}</optgroup>`).join('')}</select>`;
}

function openOuvrage(d, index) {
  const locked = d.statut === 'Accepté';
  const l = index === null ? { type: 'ouvrage', designation: '', unite: 'u', qte: 1, composants: [] } : JSON.parse(JSON.stringify(d.lignes[index]));
  if (!l.composants) { // ancienne ligne simple -> ouvrage avec une fourniture
    l.composants = [{ type: 'f', articleId: l.articleId || '', designation: l.designation, unite: l.unite, qte: 1, pu: num(l.pu), cout: num(l.cout), poids: num(l.poids) }];
    l.type = 'ouvrage';
  }
  const render = () => {
    const u = Calc.unit(l);
    const F = l.composants.map((c, i) => ({ c, i })).filter(x => x.c.type !== 'mo');
    const M = l.composants.map((c, i) => ({ c, i })).filter(x => x.c.type === 'mo');
    const dis = locked ? 'disabled' : '';
    const box = Modal.open(`<h2 style="margin-top:0">${index === null ? 'Nouvel ouvrage' : 'Ouvrage'}</h2>
      <div class="grid2">
        <div class="field"><label for="o-num">N° de prix (DPGF)</label><input id="o-num" value="${esc(l.num || '')}" ${dis}></div>
        <div class="field" style="grid-column:1/-1"><label for="o-des">Désignation (texte du devis)</label><input id="o-des" value="${esc(l.designation)}" ${dis}></div>
        ${l.detail ? `<div class="field" style="grid-column:1/-1"><label for="o-detail">Descriptif</label><textarea id="o-detail" ${dis}>${esc(l.detail)}</textarea></div>` : ''}
        <div class="field"><label for="o-qte">Quantité</label><input id="o-qte" type="number" step="any" value="${esc(l.qte)}" ${dis}></div>
        <div class="field"><label for="o-unite">Unité</label><select id="o-unite" ${dis}>${optionsStr([...new Set([...UNITES, l.unite])], l.unite)}</select></div>
      </div>

      <h3>Fournitures <span class="muted small">pour 1 ${esc(l.unite)}</span></h3>
      <div class="table-wrap"><table><tr><th>Fourniture</th><th class="num">Qté</th><th class="num">PU vente</th><th class="num">Achat</th><th class="num">Total</th><th></th></tr>
        ${F.map(({ c, i }) => `<tr><td>${c.articleId || locked ? `${esc(c.designation)}${c.unite ? ` <span class="muted">(${esc(c.unite)})</span>` : ''}` : `<input data-c="${i}" data-k="designation" value="${esc(c.designation)}" aria-label="Désignation de la fourniture">`}</td>
          <td class="num"><input data-c="${i}" data-k="qte" type="number" step="any" value="${esc(c.qte)}" style="width:80px" ${dis}></td>
          <td class="num"><input data-c="${i}" data-k="pu" type="number" step="0.01" value="${esc(c.pu)}" style="width:90px" ${dis}></td>
          <td class="num">${c.articleId || locked ? `<span class="muted">${eur(c.cout)}</span>` : `<input data-c="${i}" data-k="cout" type="number" step="0.01" value="${esc(c.cout)}" style="width:90px" aria-label="Prix d'achat">`}</td><td class="num">${eur(num(c.qte) * num(c.pu))}</td>
          <td>${locked ? '' : `<button class="small danger" data-rm="${i}" aria-label="Retirer">✕</button>`}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Aucune fourniture.</td></tr>'}
      </table></div>
      ${locked ? '' : `<div class="toolbar" style="margin-top:8px">${articleSelect('o-art')}<input id="o-art-q" type="number" step="any" value="1" style="width:80px" aria-label="Quantité pour une unité"><button class="secondary" id="o-add-f">Ajouter</button><button class="secondary" id="o-add-libre">+ Fourniture libre</button></div>`}

      <h3>Main-d'œuvre <span class="muted small">pour 1 ${esc(l.unite)}</span></h3>
      <div class="table-wrap"><table><tr><th>Catégorie</th><th class="num">Heures</th><th class="num">Taux vente</th><th class="num">Coût</th><th class="num">Total</th><th></th></tr>
        ${M.map(({ c, i }) => `<tr><td><select data-c="${i}" data-k="moId" ${dis} aria-label="Catégorie">${options(moList(), c.moId, m => m.libelle, false)}</select></td>
          <td class="num"><input data-c="${i}" data-k="heures" type="number" step="any" value="${esc(c.heures)}" style="width:80px" ${dis}></td>
          <td class="num"><input data-c="${i}" data-k="taux" type="number" step="0.5" value="${esc(c.taux)}" style="width:80px" ${dis}></td>
          <td class="num muted">${eur(c.cout)}/h</td><td class="num">${eur(num(c.heures) * num(c.taux))}</td>
          <td>${locked ? '' : `<button class="small danger" data-rm="${i}" aria-label="Retirer">✕</button>`}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Aucune main-d\'œuvre.</td></tr>'}
      </table></div>
      ${locked ? '' : '<div class="toolbar" style="margin-top:8px"><button class="secondary" id="o-add-mo">+ Main-d\'œuvre</button></div>'}

      <div class="ouvrage-sum">
        <div><span class="label">Fournitures</span><strong>${eur(u.f)}</strong></div><span>+</span>
        <div><span class="label">Main-d'œuvre (${fmt(u.heures, 2)} h)</span><strong>${eur(u.mo)}</strong></div><span>=</span>
        <div><span class="label">Prix unitaire HT</span><strong>${eur(u.f + u.mo)}</strong></div><span>×</span>
        <div><span class="label">${fmt(l.qte, 2)} ${esc(l.unite)}</span><strong>${eur(Calc.ligneHT(l))}</strong></div>
      </div>
      <p class="muted small">Coût unitaire ${eur(u.coutF + u.coutMO)} · marge ${marginBadge((u.f + u.mo) ? (u.f + u.mo - u.coutF - u.coutMO) / (u.f + u.mo) * 100 : 0)}</p>
      <div class="modal-actions"><button class="secondary" id="o-cancel">${locked ? 'Fermer' : 'Annuler'}</button>${locked ? '' : '<button id="o-save">Enregistrer l\'ouvrage</button>'}</div>`, true);

    const keep = () => {
      l.designation = box.querySelector('#o-des').value; l.qte = num(box.querySelector('#o-qte').value); l.unite = box.querySelector('#o-unite').value;
      l.num = box.querySelector('#o-num').value;
      const det = box.querySelector('#o-detail'); if (det) l.detail = det.value;
    };
    box.querySelectorAll('#o-qte, #o-unite').forEach(el => el.onchange = () => { keep(); render(); });
    box.querySelectorAll('[data-c]').forEach(el => el.onchange = () => {
      keep();
      const c = l.composants[+el.dataset.c], k = el.dataset.k;
      if (k === 'moId') { const m = moOf(el.value); Object.assign(c, { moId: el.value, libelle: m.libelle, taux: num(m.tauxVente), cout: num(m.tauxCout) }); }
      else c[k] = k === 'designation' ? el.value : +el.value;
      render();
    });
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { keep(); l.composants.splice(+b.dataset.rm, 1); render(); });
    const addF = box.querySelector('#o-add-f');
    if (addF) addF.onclick = () => {
      keep();
      const a = Store.get('articles', box.querySelector('#o-art').value);
      if (!a) { notify('Choisissez une fourniture dans la liste.'); return; }
      l.composants.push({ type: 'f', articleId: a.id, designation: a.designation, unite: a.unite, qte: num(box.querySelector('#o-art-q').value) || 1, pu: num(a.prixVente), cout: num(a.coutRevient), poids: num(a.poidsUnitaire) });
      if (!l.designation) { l.designation = a.designation; l.unite = a.unite; }
      render();
    };
    const addL = box.querySelector('#o-add-libre');
    if (addL) addL.onclick = () => { keep(); l.composants.push({ type: 'f', designation: 'Fourniture ou sous-traitance', unite: '', qte: 1, pu: 0, cout: 0, poids: 0 }); render(); };
    const addMO = box.querySelector('#o-add-mo');
    if (addMO) addMO.onclick = () => {
      keep();
      const m = moList()[0] || {};
      l.composants.push({ type: 'mo', moId: m.id || '', libelle: m.libelle || "Main-d'œuvre", heures: 1, taux: num(m.tauxVente), cout: num(m.tauxCout) });
      render();
    };
    box.querySelector('#o-cancel').onclick = Modal.close;
    const sv = box.querySelector('#o-save');
    if (sv) sv.onclick = () => {
      keep();
      if (!l.designation) { notify('Indiquez la désignation de l\'ouvrage.'); return; }
      if (index === null) d.lignes.push(l); else d.lignes[index] = l;
      Store.upsert('devis', d);
      Modal.close(); App.render();
    };
  };
  render();
}
