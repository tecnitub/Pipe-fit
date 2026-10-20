// Réceptions des livraisons sur les commandes fournisseurs, et rapprochement ligne à ligne des factures fournisseurs
// avec les commandes et les livraisons (prix, quantités, lignes non commandées), validation « bon à payer » ou litige.
// Calculs : public/js/rapprochement.js.

/* ---------- Commande : réceptions ---------- */
function receptionsCommandeHtml(c) {
  const l = c.lignes || [], rec = c.receptions || [];
  if (!l.length || c.statut === 'Brouillon') return '';
  const reste = l.reduce((t, x) => t + Math.max(0, num(x.qte) - Rapprochement.recue(c, x)), 0);
  return `<h2 class="no-print">Livraisons</h2>
  <div class="card no-print"><div class="toolbar" style="margin:0 0 6px"><button id="c-recep" ${c.statut === 'Annulée' ? 'disabled' : ''}>📦 Réceptionner une livraison</button>
    <span class="small ${reste > 0 ? 'warn-text' : 'pos'}">${reste > 0 ? 'Reste à livrer : ' + l.filter(x => num(x.qte) > Rapprochement.recue(c, x)).map(x => `${esc(x.designation)} (${fmt(num(x.qte) - Rapprochement.recue(c, x), 2).replace(/,00$/, '')} ${esc(x.unite || '')})`).join(', ') : 'Tout est livré'}</span></div>
    ${rec.length ? `<ul class="hist-relances">${rec.map(r => `<li>${dateFr(r.date)} · BL ${esc(r.bl || '—')} · ${r.lignes.length} ligne(s) · ${esc(r.par || '')}${r.photoId ? ` · <a href="${fileUrl(r.photoId)}" target="_blank" rel="noopener">photo du BL</a>` : ''}${r.note ? ` · ${esc(r.note)}` : ''}</li>`).join('')}</ul>` : '<p class="small muted" style="margin:0">Aucune livraison enregistrée.</p>'}</div>`;
}
function receptionnerCommande(c) {
  const l = c.lignes || [];
  const box = Modal.open(`<h2 style="margin-top:0">Livraison de la commande ${esc(c.numero || '')}</h2>
    <div class="grid2"><div class="field"><label for="rc-d">Date</label><input id="rc-d" type="date" value="${isoDate(new Date())}"></div>
      <div class="field"><label for="rc-bl">N° du bon de livraison</label><input id="rc-bl"></div></div>
    <div class="table-wrap"><table><tr><th>Désignation</th><th class="num">Commandé</th><th class="num">Déjà reçu</th><th class="num">Reçu ce jour</th></tr>
      ${l.map((x, i) => { const deja = Rapprochement.recue(c, x), reste = Math.max(0, num(x.qte) - deja);
        return `<tr><td>${esc(x.designation)}</td><td class="num">${fmt(num(x.qte), 2).replace(/,00$/, '')} ${esc(x.unite || '')}</td><td class="num">${fmt(deja, 2).replace(/,00$/, '')}</td>
          <td class="num"><input type="number" step="any" min="0" data-rq="${i}" value="${reste}" style="width:90px" aria-label="Quantité reçue"></td></tr>`; }).join('')}</table></div>
    <div class="field"><label for="rc-n">Remarque (casse, manquant, reliquat annoncé…)</label><input id="rc-n"></div>
    <label class="btn secondary small">📷 Photo du bon de livraison<input type="file" id="rc-ph" accept="image/*" capture="environment" hidden></label> <span id="rc-phn" class="small muted"></span>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="rc-x">Annuler</button><button id="rc-ok">Enregistrer la livraison</button></div>`, true);
  let photo = null;
  box.querySelector('#rc-ph').onchange = async e => { const f = e.target.files[0]; if (f) { photo = await compressImage(f, 1600, 0.75); box.querySelector('#rc-phn').textContent = f.name; } };
  box.querySelector('#rc-x').onclick = Modal.close;
  box.querySelector('#rc-ok').onclick = async () => {
    const lignes = [...box.querySelectorAll('[data-rq]')].map(el => ({ i: +el.dataset.rq, qte: num(el.value) })).filter(x => x.qte > 0);
    if (!lignes.length) return notify('Aucune quantité reçue.');
    let photoId = '';
    try { if (photo) photoId = await envoyerImage(photo); } catch (err) { return notify(err.message); }
    lignes.forEach(x => { const lg = c.lignes[x.i]; lg.qteRecue = Math.round((Rapprochement.recue(c, lg) + x.qte) * 1000) / 1000; });
    c.receptions = [...(c.receptions || []), { date: box.querySelector('#rc-d').value, bl: box.querySelector('#rc-bl').value.trim(), note: box.querySelector('#rc-n').value.trim(), photoId, lignes, par: Store.me.nom || '' }];
    const complet = c.lignes.every(x => num(x.qteRecue) >= num(x.qte) - 1e-9);
    c.statut = complet ? 'Réceptionnée' : 'Réceptionnée partiellement';
    Store.upsert('commandes', c); Modal.close(); App.render(); App.toast(complet ? 'Commande entièrement livrée' : 'Livraison partielle enregistrée');
  };
}

/* ---------- Facture fournisseur : rapprochement ---------- */
const commandesRapprochees = x => [...new Set((x.imputations || []).map(l => l.commandeId).filter(Boolean))].map(id => Store.get('commandes', id)).filter(Boolean);
function analyseAchat(x) {
  const cmds = commandesRapprochees(x);
  if (!cmds.length) return null;
  return Rapprochement.analyser({ lignes: x.lignes || [], montantHT: x.montantHT }, cmds, Rapprochement.dejaFactureHors(Store.all('achats'), x.id), Store.all('articles'));
}
const ETATS_RAPPROCHEMENT = { conforme: ['b-ok', 'Conforme'], ecarts: ['b-bad', 'Écarts'], accepte: ['b-ok', 'Bon à payer'], litige: ['b-bad', 'Litige'], vide: ['b-warn', 'Lignes à saisir'] };
function etatRapprochement(x) {
  if (x.rapprochement && ['accepte', 'litige'].includes(x.rapprochement.statut)) return x.rapprochement.statut;
  const a = analyseAchat(x);
  return a ? a.statut : null;
}
const badgeRapprochement = x => { const e = etatRapprochement(x); return e ? `<span class="badge ${ETATS_RAPPROCHEMENT[e][0]}">${ETATS_RAPPROCHEMENT[e][1]}</span>` : '<span class="muted small">—</span>'; };

function rapprochementAchatHtml(x) {
  const cmds = commandesRapprochees(x);
  if (!cmds.length) return '';
  const a = analyseAchat(x), r = x.rapprochement || {}, q = v => fmt(num(v), 2).replace(/,00$/, '');
  const ec = l => l.ecarts.map(e => `<span class="badge b-bad" title="${esc(Rapprochement.LIB[e.type])}">${e.type === 'prix' ? `prix ${eur(e.attendu)} → ${eur(e.facture)}` : e.type === 'livraison' ? `livré ${q(e.attendu)}` : `commandé ${q(e.attendu)}`} : ${e.montant > 0 ? '+' : ''}${eur(e.montant)}</span>`).join(' ');
  return `<h2>Rapprochement facture / commande / livraison</h2>
  <p class="muted small">Chaque ligne facturée est comparée à la commande ${cmds.map(c => esc(c.numero || '')).join(', ')} (prix d'achat) et aux quantités livrées. Tolérance : ${Rapprochement.TOL.prixPct} % sur les prix, écarts de moins de ${eur(Rapprochement.TOL.montantMin)} ignorés.</p>
  <div class="table-wrap"><table class="rp-table"><tr><th>Ligne facturée</th><th class="num">Qté</th><th class="num">PU HT</th><th class="num">Montant</th><th>Commande</th><th class="num">Cdé</th><th class="num">Livré</th><th class="num">PU cdé</th><th>Écart</th><th></th></tr>
    ${(x.lignes || []).map((lf, i) => { const l = a.lignes[i];
      return `<tr data-li="${i}" class="${l.ecarts.length ? 'rp-ko' : !l.cmd && !l.frais ? 'rp-hc' : ''}">
        <td><input data-lk="designation" value="${esc(lf.designation || '')}" aria-label="Désignation facturée">${lf.reference ? `<br><span class="small muted">réf. ${esc(lf.reference)}</span>` : ''}</td>
        <td class="num"><input data-lk="qte" type="number" step="any" value="${esc(lf.qte ?? '')}" style="width:70px" aria-label="Quantité facturée"></td>
        <td class="num"><input data-lk="pu" type="number" step="0.0001" value="${esc(lf.pu ?? '')}" style="width:90px" aria-label="Prix unitaire facturé"></td>
        <td class="num">${eur(l.montant)}</td>
        <td class="small">${l.cmd ? `${esc(l.cmd.numero || '')} · ${esc(l.cmd.designation)}` : l.frais ? '<span class="muted">frais (port, emballage…)</span>' : '<span class="warn-text">non commandé</span>'}</td>
        <td class="num">${l.cmd ? q(l.cmd.qte - l.cmd.deja) : ''}</td><td class="num">${l.cmd ? q(Math.max(0, l.cmd.recu - l.cmd.deja)) : ''}</td><td class="num">${l.cmd ? eur(l.cmd.pu) : ''}</td>
        <td>${ec(l) || (l.cmd ? '<span class="pos">✓</span>' : !l.frais ? `<span class="badge b-warn">${eur(l.montant)}</span>` : '')}</td>
        <td><button class="icon" data-lrm="${i}" aria-label="Retirer la ligne">✕</button></td></tr>`; }).join('') || '<tr><td colspan="10" class="muted">Saisissez les lignes de la facture (ou reprenez celles de la commande puis corrigez les prix et quantités facturés).</td></tr>'}
    <tr class="subtotal"><td colspan="3">Total des lignes</td><td class="num">${eur(a.totalLignes)}</td><td colspan="6" class="small ${Math.abs(a.ecartTotal) >= 1 ? 'warn-text' : 'muted'}">${Math.abs(a.ecartTotal) >= 0.01 ? `écart avec le montant HT de la facture : ${eur(a.ecartTotal)}` : 'égal au montant HT de la facture'}</td></tr>
  </table></div>
  <div class="toolbar"><button class="secondary small" id="rp-add">+ Ligne</button>${!(x.lignes || []).length ? '<button class="secondary small" id="rp-rep">Reprendre les lignes de la commande</button>' : ''}</div>
  ${a.nonFacturees.length ? `<p class="small muted">Livré et pas encore facturé : ${a.nonFacturees.map(n => `${esc(n.designation)} (${q(n.reste)})`).join(', ')}.</p>` : ''}
  <div class="card rp-verdict ${a.statut === 'conforme' || r.statut === 'accepte' ? 'ok' : a.statut === 'ecarts' || r.statut === 'litige' ? 'ko' : ''}">
    ${a.statut === 'vide' ? '<strong>Lignes de la facture à saisir</strong>' : a.statut === 'conforme' ? '<strong>✓ Facture conforme à la commande et aux livraisons</strong>'
      : `<strong>Écarts : ${a.ecart > 0 ? '+' : ''}${eur(a.ecart)} HT</strong> par rapport à la commande et aux livraisons`}
    ${r.statut === 'accepte' ? `<br><span class="small">Bon à payer validé par ${esc(r.par || '')} le ${dateFr(r.date)}${r.note ? ` : ${esc(r.note)}` : ''}</span>` : ''}
    ${r.statut === 'litige' ? `<br><span class="small">Litige ouvert par ${esc(r.par || '')} le ${dateFr(r.date)}${r.note ? ` : ${esc(r.note)}` : ''}</span>` : ''}
    <div class="toolbar" style="margin:8px 0 0">${a.statut === 'ecarts' && r.statut !== 'accepte' ? '<button class="small" id="rp-ok">Accepter les écarts (bon à payer)</button>' : ''}${a.statut === 'conforme' && r.statut !== 'accepte' ? '<button class="small" id="rp-ok">Bon à payer</button>' : ''}
      ${a.statut === 'ecarts' && r.statut !== 'litige' ? '<button class="small danger" id="rp-litige">Litige fournisseur</button>' : ''}${r.statut ? '<button class="small secondary" id="rp-raz">Annuler la décision</button>' : ''}</div>
  </div>`;
}
function bindRapprochementAchat(root, x, save) {
  if (!root.querySelector('.rp-table')) return;
  x.lignes = x.lignes || [];
  // Lignes rapprochées enregistrées sur la facture : les autres factures de la même commande en tiennent compte
  const memoriser = () => { const a = analyseAchat(x); x.rapprochementLignes = a ? a.lignes.filter(l => l.cmd).map(l => ({ cle: `${l.cmd.commandeId}|${l.cmd.index}`, qte: l.qte })) : []; };
  root.querySelectorAll('.rp-table [data-lk]').forEach(el => el.onchange = () => {
    const l = x.lignes[+el.closest('[data-li]').dataset.li];
    l[el.dataset.lk] = el.dataset.lk === 'designation' ? el.value : num(el.value);
    if (el.dataset.lk !== 'designation') l.montantHT = Math.round(num(l.qte) * num(l.pu) * 100) / 100;
    if (x.rapprochement && x.rapprochement.statut === 'accepte') x.rapprochement = null; // facture modifiée : décision à reprendre
    memoriser(); save();
  });
  root.querySelectorAll('[data-lrm]').forEach(b => b.onclick = () => { x.lignes.splice(+b.dataset.lrm, 1); memoriser(); save(); });
  root.querySelector('#rp-add').onclick = () => { x.lignes.push({ designation: '', qte: 1, pu: 0, montantHT: 0 }); save(); };
  const rep = root.querySelector('#rp-rep');
  if (rep) rep.onclick = () => {
    commandesRapprochees(x).forEach(c => (c.lignes || []).forEach(l => x.lignes.push({ designation: l.designation, articleId: l.articleId || '', qte: num(l.qte), unite: l.unite, pu: num(l.pu), montantHT: Math.round(num(l.qte) * num(l.pu) * 100) / 100 })));
    memoriser(); save(); App.toast('Lignes reprises : corrigez les prix et quantités qui diffèrent sur la facture');
  };
  const decider = async (statut, question) => {
    const note = question ? await askValue(question, '') : '';
    if (note === null) return;
    x.rapprochement = { statut, note: note || '', par: Store.me.nom || '', date: isoDate(new Date()) };
    memoriser(); save();
  };
  const ok = root.querySelector('#rp-ok'); if (ok) ok.onclick = () => decider('accepte', analyseAchat(x).statut === 'ecarts' ? 'Motif de l\'acceptation (hausse convenue, reliquat livré…)' : '');
  const li = root.querySelector('#rp-litige'); if (li) li.onclick = () => decider('litige', 'Motif du litige (à réclamer au fournisseur) :');
  const raz = root.querySelector('#rp-raz'); if (raz) raz.onclick = () => { x.rapprochement = null; save(); };
}
