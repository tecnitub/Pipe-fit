// Relances des factures impayées (Facturation → Relances), lettres de mise en demeure et de libération de la retenue de garantie,
// historique des relances sur la facture et la fiche client.

// Retenues de garantie pratiquées sur les factures d'un chantier
function retenuesChantier(a) {
  const lignes = Store.all('factures').filter(f => f.affaireId === a.id && f.type !== 'avoir' && f.statut !== 'Annulée')
    .map(f => ({ f, retenue: Calc.doc(f).retenue })).filter(x => x.retenue > 0).sort((x, y) => (x.f.date || '').localeCompare(y.f.date || ''));
  return { lignes, total: Math.round(sumBy(lignes, x => x.retenue) * 100) / 100 };
}
// En-tête de courrier : société, destinataire, lieu et date
function enteteCourrier(titre, refs, entrepriseId, contactId) {
  const c = entreprise(entrepriseId) || {}, bill = billingSite(entrepriseId), k = Store.get('contacts', contactId);
  return `${Doc.entete('facture', titre, refs)}
    <div class="doc-parties"><div></div><div><strong>${esc(c.nom || '')}</strong>${k ? `<br>À l'attention de ${esc(contactName(k))}` : ''}${bill ? `<br>${esc(bill.adresse)}<br>${esc(bill.cp)} ${esc(bill.ville)}` : ''}</div></div>
    <p class="doc-conditions" style="text-align:right">Le ${dateFr(isoDate(new Date()))}</p>`;
}
const signatureCourrier = () => `<p style="margin-top:28px">${esc(Store.me.nom || '')}<br>${esc(Store.data.settings.societe || '')}</p><div class="doc-pied">${esc(Doc.piedLegal())}</div>`;

function lettreDemeure(f) {
  const a = affaireOf(f.affaireId), t = Calc.doc(f), reste = Calc.resteDu(f), auj = isoDate(new Date());
  const relances = Relances.envoyees(f);
  return `${enteteCourrier('Mise en demeure de payer', `Lettre recommandée avec accusé de réception<br>Facture ${esc(f.numero || '')}`, docClientId(f), f.contactId)}
    <p class="doc-objet"><strong>Objet :</strong> mise en demeure de payer la facture ${esc(f.numero || '')} – ${esc(a.code ? `${a.code} ${a.nom}` : a.nom || '')}</p>
    <p>Madame, Monsieur,</p>
    <p>Nous constatons qu'à ce jour, la facture désignée ci-dessous demeure impayée malgré ${relances.length ? `nos relances du ${relances.map(r => dateFr(r.date)).join(', du ')}` : 'son échéance'} :</p>
    <table class="doc-lines"><tr><th>Facture</th><th>Date</th><th>Échéance</th><th class="num">Montant TTC</th><th class="num">Restant dû</th></tr>
      <tr><td>${esc(f.numero || '')}${f.refCommande ? `<br><span class="small">votre commande n° ${esc(f.refCommande)}</span>` : ''}</td><td>${dateFr(f.date)}</td><td>${dateFr(f.echeance)}</td><td class="num">${eur(t.retenue ? t.netAPayer : t.totalTTC)}</td><td class="num"><strong>${eur(reste)}</strong></td></tr></table>
    <p>En conséquence, nous vous mettons en demeure de nous régler la somme de <strong>${eur(reste)}</strong> dans un délai de <strong>8 jours</strong> à compter de la réception de ce courrier (retard constaté au ${dateFr(auj)} : ${Relances.joursRetard(f, auj)} jours).</p>
    <p>Conformément à l'article L441-10 du Code de commerce, ces sommes sont majorées de plein droit des pénalités de retard au taux prévu à nos conditions générales, ainsi que de l'indemnité forfaitaire de 40 € pour frais de recouvrement (article D441-5).</p>
    <p>À défaut de règlement dans ce délai, nous nous réserverons le droit d'engager une procédure de recouvrement judiciaire, sans autre avis.</p>
    <p>Si votre règlement nous est parvenu entre-temps, nous vous prions de ne pas tenir compte de ce courrier.</p>
    <p>Veuillez agréer, Madame, Monsieur, l'expression de nos salutations distinguées.</p>
    ${signatureCourrier()}`;
}
function lettreRetenue(a) {
  const rg = retenuesChantier(a), cid = a.moeId || a.clientId, kid = a.moeId ? a.moeContactId : a.contactId;
  return `${enteteCourrier('Libération de la retenue de garantie', `Chantier ${esc(a.code || '')}`, cid, kid)}
    <p class="doc-objet"><strong>Objet :</strong> demande de libération de la retenue de garantie – ${esc(a.code ? `${a.code} ${a.nom}` : a.nom || '')}</p>
    <p>Madame, Monsieur,</p>
    <p>La réception des travaux du chantier cité en objet a été prononcée le <strong>${dateFr(a.dateReception)}</strong>. Le délai de garantie d'un an étant écoulé
      ${num(a.retenueGarantie) ? ` (retenue de ${fmt(a.retenueGarantie, 1)} %)` : ''}, nous vous remercions de bien vouloir procéder à la libération des sommes retenues sur nos factures :</p>
    <table class="doc-lines"><tr><th>Facture</th><th>Date</th><th class="num">Retenue de garantie TTC</th></tr>
      ${rg.lignes.map(x => `<tr><td>${esc(x.f.numero || '')}</td><td>${dateFr(x.f.date)}</td><td class="num">${eur(x.retenue)}</td></tr>`).join('')}
      <tr><td colspan="2"><strong>Total à libérer</strong></td><td class="num"><strong>${eur(rg.total)}</strong></td></tr></table>
    <p>Nous vous prions d'agréer, Madame, Monsieur, l'expression de nos salutations distinguées.</p>
    ${signatureCourrier()}`;
}

/* ---------- Écran Facturation → Relances ---------- */
const relancesFiltre = { voir: 'arelancer' };
function relancesDonnees() {
  const auj = isoDate(new Date()), s = Store.data.settings;
  const impayees = Store.all('factures').filter(f => f.type !== 'avoir' && Calc.resteDu(f) > 0 && f.numero);
  const enRetard = impayees.filter(f => f.echeance && f.echeance < auj).map(f => ({ f, e: Relances.etat(f, auj, s), reste: Calc.resteDu(f) }))
    .sort((x, y) => y.e.retard - x.e.retard);
  const bientot = impayees.filter(f => f.echeance && f.echeance >= auj && f.echeance <= Relances.ajouter(auj, 7)).sort((x, y) => x.echeance.localeCompare(y.echeance));
  const retenues = Store.all('affaires').map(a => ({ a, rg: retenuesChantier(a) })).filter(x => x.rg.total > 0)
    .map(x => ({ ...x, r: Relances.retenue(x.a, x.rg.total, auj) })).filter(x => x.r).sort((x, y) => (x.r.le || '9').localeCompare(y.r.le || '9'));
  return { auj, enRetard, bientot, retenues, aRelancer: enRetard.filter(x => x.e.du) };
}
const nbARelancer = () => relancesDonnees().aRelancer.length;
const derniereRelanceTxt = f => { const l = (f.relances || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]; return l ? `${l.niveau === 'note' ? '📞 ' : ''}${esc(l.libelle || l.niveau)} le ${dateFr(l.date)}` : '—'; };

Views.relances = () => {
  const d = relancesDonnees(), f0 = relancesFiltre.voir;
  const liste = f0 === 'arelancer' ? d.aRelancer : d.enRetard;
  const total = sumBy(d.enRetard, x => x.reste), plus30 = d.enRetard.filter(x => x.e.retard > 30);
  const peut = ['admin', 'charge'].includes(Store.me.role);
  return `<h1>Facturation</h1>${facturationTabs('relances')}
  <div class="cards">
    <div class="card"><div class="label">Factures en retard</div><div class="value">${eur(total)}</div><div class="sub">${d.enRetard.length} facture(s) TTC restant dû</div></div>
    <div class="card"><div class="label">À relancer aujourd'hui</div><div class="value ${d.aRelancer.length ? 'warn-text' : ''}">${d.aRelancer.length}</div><div class="sub">${eur(sumBy(d.aRelancer, x => x.reste))}</div></div>
    <div class="card"><div class="label">Retard de plus de 30 jours</div><div class="value ${plus30.length ? 'neg' : ''}">${eur(sumBy(plus30, x => x.reste))}</div><div class="sub">${plus30.length} facture(s)</div></div>
    <div class="card"><div class="label">Retenues de garantie libérables</div><div class="value">${eur(sumBy(d.retenues.filter(x => x.r.etat === 'liberable'), x => x.rg.total))}</div><div class="sub">${d.retenues.filter(x => x.r.etat === 'liberable').length} chantier(s) · ${d.retenues.length} au total</div></div>
  </div>
  <div class="toolbar"><div class="seg" role="group" aria-label="Factures affichées">${[['arelancer', `À relancer (${d.aRelancer.length})`], ['tout', `Toutes les factures en retard (${d.enRetard.length})`]].map(([k, l]) => `<button class="${f0 === k ? 'on' : ''}" data-voir="${k}">${l}</button>`).join('')}</div>
    <span class="spacer"></span><span class="muted small">Délais après l'échéance : ${Relances.niveaux(Store.data.settings).map(n => `${n.court} J+${n.jours}`).join(' · ')}</span>${Store.can('admin') ? '<button class="small secondary" id="rl-delais">Modifier</button>' : ''}</div>
  ${liste.length ? `<div class="table-wrap"><table class="relances"><tr><th>Facture</th><th>Client</th><th>Chantier</th><th>Échéance</th><th class="num">Retard</th><th class="num">Restant dû</th><th>Dernière action</th><th>Prochaine étape</th><th></th></tr>
    ${liste.map(({ f, e, reste }) => `<tr><td><a href="#/facture/${f.id}">${esc(f.numero)}</a></td><td><a href="#/entreprise/${docClientId(f)}">${esc(clientName(docClientId(f)))}</a></td><td>${esc(affaireOf(f.affaireId).code || '')}</td>
      <td>${dateFr(f.echeance)}</td><td class="num"><span class="badge ${e.retard > 30 ? 'b-bad' : e.retard > 15 ? 'b-warn' : 'b-info'}">${e.retard} j</span></td><td class="num"><strong>${eur(reste)}</strong></td>
      <td class="small">${derniereRelanceTxt(f)}</td>
      <td class="small">${e.prochaine ? (e.du ? `<strong>${esc(e.prochaine.lib)}</strong> à envoyer` : `${esc(e.prochaine.lib)} le ${dateFr(e.le)}`) : '<span class="neg">Toutes les relances envoyées : recouvrement</span>'}</td>
      <td class="actions">${peut && e.prochaine ? `<button class="small ${e.du ? '' : 'secondary'}" data-relancer="${e.prochaine.cle}|${f.id}">✉ ${esc(e.prochaine.court)}</button>` : ''}
        ${peut ? `<button class="small secondary" data-note="${f.id}" title="Noter un appel ou une promesse de paiement">📞</button><button class="small secondary" data-payee="${f.id}">Payée</button>` : ''}
        ${e.prochaine && e.prochaine.cle === 'demeure' ? `<button class="small secondary" data-pdf="demeure|${f.id}" title="Lettre à envoyer en recommandé">PDF</button>` : ''}</td></tr>`).join('')}</table></div>`
    : `<p class="muted">${f0 === 'arelancer' ? 'Aucune facture à relancer aujourd\'hui.' : 'Aucune facture en retard.'}</p>`}
  ${d.bientot.length ? `<h2>Échéances dans les 7 jours</h2><div class="table-wrap"><table><tr><th>Facture</th><th>Client</th><th>Échéance</th><th class="num">Restant dû</th></tr>
    ${d.bientot.map(f => `<tr class="clickable" data-go="#/facture/${f.id}"><td>${esc(f.numero)}</td><td>${esc(clientName(docClientId(f)))}</td><td>${dateFr(f.echeance)}</td><td class="num">${eur(Calc.resteDu(f))}</td></tr>`).join('')}</table></div>` : ''}
  <h2>Retenues de garantie</h2>
  ${d.retenues.length ? `<div class="table-wrap"><table><tr><th>Chantier</th><th>Client</th><th>Réception</th><th>Libérable le</th><th class="num">Retenu TTC</th><th>État</th><th></th></tr>
    ${d.retenues.map(({ a, rg, r }) => `<tr><td><a href="#/chantier/${a.id}">${esc(a.code || '')}</a> ${esc(a.nom || '')}</td><td>${esc(clientName(a.clientId))}</td><td>${a.dateReception ? dateFr(a.dateReception) : '—'}</td>
      <td>${r.le ? dateFr(r.le) : '—'}</td><td class="num">${eur(rg.total)}</td>
      <td>${r.etat === 'liberable' ? `<span class="badge b-ok">Libérable</span>${a.rgDemandee ? ` <span class="small muted">demandée le ${dateFr(a.rgDemandee)}</span>` : ''}` : r.etat === 'a-venir' ? `<span class="badge">Dans ${r.dans} j</span>` : '<span class="badge b-warn">Réception à saisir</span>'}</td>
      <td class="actions">${peut && r.etat === 'liberable' ? `<button class="small" data-mail="liberationRG|${a.id}">✉ Demander</button><button class="small secondary" data-pdf="liberationRG|${a.id}">PDF</button><button class="small secondary" data-liberee="${a.id}">Libérée</button>` : ''}</td></tr>`).join('')}</table></div>`
    : '<p class="muted">Aucune retenue de garantie en cours.</p>'}`;
};
Views.relances.bind = root => {
  const dl = root.querySelector('#rl-delais');
  if (dl) dl.onclick = () => {
    const N = Relances.niveaux(Store.data.settings);
    const box = Modal.open(`<h2 style="margin-top:0">Délais de relance</h2><p class="muted small">Nombre de jours après l'échéance de la facture. Deux relances sont toujours espacées d'au moins ${Relances.INTERVALLE} jours.</p>
      <div class="grid2">${N.map(n => `<div class="field"><label for="rl-${n.cle}">${esc(n.lib)} (J+)</label><input id="rl-${n.cle}" type="number" min="0" value="${n.jours}"></div>`).join('')}</div>
      <p class="small">Les textes des e-mails se modifient dans Paramètres → E-mails (modèles « Relance 1 », « Relance 2 », « Relance 3 », « Mise en demeure »).</p>
      <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="rl-x">Annuler</button><button id="rl-ok">Enregistrer</button></div>`);
    box.querySelector('#rl-x').onclick = Modal.close;
    box.querySelector('#rl-ok').onclick = async () => {
      const relances = Object.fromEntries(N.map(n => [n.cle, Math.max(0, num(box.querySelector(`#rl-${n.cle}`).value))]));
      await Store.saveSettings({ ...Store.data.settings, relances }); Modal.close(); App.render();
    };
  };
  root.querySelectorAll('[data-voir]').forEach(b => b.onclick = () => { relancesFiltre.voir = b.dataset.voir; App.render(); });
  root.querySelectorAll('[data-relancer]').forEach(b => b.onclick = () => { const [type, id] = b.dataset.relancer.split('|'); envoyerParMail(type, id).catch(e => notify(e.message)); });
  root.querySelectorAll('[data-note]').forEach(b => b.onclick = () => noterRelance(b.dataset.note));
  root.querySelectorAll('[data-payee]').forEach(b => b.onclick = async () => {
    const f = Store.get('factures', b.dataset.payee);
    if (!await ask(`Marquer la facture ${f.numero} comme payée (${eur(Calc.resteDu(f))}) ?`, 'Payée', false)) return;
    Object.assign(f, { statut: 'Payée', datePaiement: isoDate(new Date()) }); Store.upsert('factures', f); App.render();
  });
  root.querySelectorAll('[data-liberee]').forEach(b => b.onclick = async () => {
    const a = Store.get('affaires', b.dataset.liberee);
    if (!await ask(`Retenue de garantie du chantier ${a.code} libérée par le client ?`, 'Libérée', false)) return;
    a.retenueLiberee = isoDate(new Date()); Store.upsert('affaires', a); App.render();
  });
};
// Appel téléphonique, promesse de paiement, contestation : gardé dans l'historique de la facture
async function noterRelance(id) {
  const f = Store.get('factures', id);
  const t = await askValue(`Note sur la facture ${f.numero} (appel, promesse de paiement, contestation…)`, '');
  if (!t || !t.trim()) return;
  f.relances = [...(f.relances || []), { niveau: 'note', date: isoDate(new Date()), par: Store.me.nom || Store.me.login, libelle: t.trim() }];
  Store.upsert('factures', f); App.render();
}
// Historique des relances (fiche facture et fiche client)
function historiqueRelances(f) {
  const l = (f.relances || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return l.map(r => `<li><strong>${dateFr(r.date)}</strong> · ${r.niveau === 'note' ? `📞 ${esc(r.libelle)}` : `✉ ${esc(r.libelle || r.niveau)}`} <span class="muted small">(${esc(r.par || '')})</span></li>`).join('');
}
function relancesFacture(f) {
  if (f.type === 'avoir' || !f.numero) return '';
  const auj = isoDate(new Date()), e = Relances.etat(f, auj, Store.data.settings), reste = Calc.resteDu(f), h = historiqueRelances(f);
  if (!h && !(reste > 0 && f.echeance < auj)) return '';
  return `<div class="card no-print relances-facture"><strong>Relances</strong>${reste > 0 && f.echeance < auj ? ` · <span class="badge b-warn">${e.retard} j de retard</span> ${e.prochaine ? (e.du ? `<button class="small" data-relancer-f="${e.prochaine.cle}|${f.id}">✉ ${esc(e.prochaine.lib)}</button>` : `<span class="small muted">prochaine étape : ${esc(e.prochaine.lib.toLowerCase())} le ${dateFr(e.le)}</span>`) : ''} <button class="small secondary" data-note-f="${f.id}">📞 Noter un appel</button>` : ''}
    ${h ? `<ul class="hist-relances">${h}</ul>` : ''}</div>`;
}
function relancesClient(eid) {
  const auj = isoDate(new Date());
  const fs = Store.all('factures').filter(f => docClientId(f) === eid && f.type !== 'avoir' && f.numero && (Calc.resteDu(f) > 0 || (f.relances || []).length))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!fs.length) return '';
  const du = sumBy(fs, f => Calc.resteDu(f)), retard = sumBy(fs.filter(f => f.echeance < auj), f => Calc.resteDu(f));
  return `<h2>Factures et relances</h2><p class="muted small">Restant dû ${eur(du)} TTC${retard ? ` · <strong class="neg">en retard ${eur(retard)}</strong>` : ''}</p>
    <div class="table-wrap"><table><tr><th>Facture</th><th>Échéance</th><th class="num">Restant dû</th><th>Relances et appels</th></tr>
    ${fs.map(f => `<tr><td><a href="#/facture/${f.id}">${esc(f.numero)}</a></td><td>${dateFr(f.echeance)}${Calc.resteDu(f) > 0 && f.echeance < auj ? ` <span class="badge b-warn">${Relances.joursRetard(f, auj)} j</span>` : ''}</td>
      <td class="num">${Calc.resteDu(f) > 0 ? eur(Calc.resteDu(f)) : '<span class="badge b-ok">Payée</span>'}</td><td>${(f.relances || []).length ? `<ul class="hist-relances">${historiqueRelances(f)}</ul>` : '<span class="muted small">—</span>'}</td></tr>`).join('')}</table></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-relancer-f], [data-note-f]');
  if (!b) return;
  if (b.dataset.noteF) return noterRelance(b.dataset.noteF);
  const [type, id] = b.dataset.relancerF.split('|');
  envoyerParMail(type, id).catch(err => notify(err.message));
});
