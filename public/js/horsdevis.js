// Interventions hors devis (travaux en régie sur demande du client, sans devis préalable).
// Les équipes y pointent leurs heures et y saisissent le matériel depuis leur téléphone ; le client signe le bon
// d'intervention ; le bureau envoie l'attachement pour obtenir une commande, facture puis clôt le dossier.
const STATUTS_HD = ['Ouvert', 'Terminé', 'Commande demandée', 'Facturé', 'Clos'];
const estHorsDevis = a => a && a.type === 'horsDevis';
const bonSigne = a => Store.all('rapports').find(r => r.affaireId === a.id && r.signatureClientId && r.termine);
// Statut affiché : un bon signé « intervention terminée » fait passer l'intervention ouverte à « Terminé »
// Intervention ouverte par un compagnon dont le bureau n'a pas encore renseigné le client ou le chargé d'affaires
const aCompleterHD = a => estHorsDevis(a) && a.aCompleter && (!a.clientId || !a.chargeId);
// Une intervention couvre la préfabrication à l'atelier et le travail sur le chantier : séparées par la tâche pointée
const estPrefa = t => /pr[ée]fa/i.test(t.tache || '');
const statutHD = a => (a.statut === 'Ouvert' && bonSigne(a) ? 'Terminé' : a.statut);

const hdFields = [
  { key: 'nom', label: "Objet de l'intervention (ex. machine à papier PM2 – collecteur de purge)" },
  { key: 'clientId', label: 'Client', type: 'select', options: v => options(clientsList(), v) },
  { key: 'contactId', label: 'Contact client (demandeur)', type: 'select', dynamic: true, options: (v, o) => contactOptions(o.clientId, v) },
  { key: 'siteId', label: 'Nom du site', type: 'select', dynamic: true, options: (v, o) => siteOptions(o.clientId, v) },
  { key: 'chargeId', label: "Chargé d'affaires", type: 'select', options: v => options(charges(), v) },
  { key: 'statut', label: 'Statut', type: 'select', options: v => optionsStr(STATUTS_HD, v || 'Ouvert') },
  { key: 'refCommande', label: 'N° de commande du client' },
  { key: 'demande', label: 'Demande du client', type: 'textarea' },
];
const consoFields = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'designation', label: 'Désignation' },
  { key: 'unite', label: 'Unité', type: 'select', options: v => optionsStr([...new Set([...UNITES, v || 'u'])], v || 'u') },
  { key: 'qte', label: 'Quantité', type: 'number', step: 'any' },
  { key: 'pu', label: 'Prix de vente HT', type: 'number', step: '0.01' },
  { key: 'cout', label: "Prix d'achat HT", type: 'number', step: '0.01' },
  { key: 'userId', label: 'Saisi par', type: 'select', options: v => options(Store.all('users'), v) },
];

function nouvelleInterventionHD() {
  const me = Store.get('users', Store.me.userId);
  editModal({ title: 'Nouvelle intervention hors devis', col: 'affaires', fields: hdFields,
    obj: { type: 'horsDevis', code: '', statut: 'Ouvert', dateCreation: isoDate(new Date()), chargeId: me && me.role === 'charge' ? me.id : '', heuresPrevues: 0, rex: {} },
    onSave: () => { const a = Store.all('affaires').filter(estHorsDevis).slice(-1)[0]; location.hash = `#/chantier/${a.id}`; } });
}

function facturerHD(a, retenuePct = 0) {
  const v = Calc.horsDevis(a), s = Store.data.settings;
  const lignes = [];
  if (v.mo.length) { lignes.push({ type: 'chapitre', titre: "Main-d'œuvre" }); v.mo.forEach(g => lignes.push({ designation: g.libelle, unite: 'h', qte: Math.round(g.heures * 100) / 100, pu: g.taux })); }
  if (v.consos.length) { lignes.push({ type: 'chapitre', titre: 'Fournitures et matériel' }); v.consos.forEach(c => lignes.push({ designation: c.designation, unite: c.unite, qte: num(c.qte), pu: num(c.pu) })); }
  const f = Store.upsert('factures', {
    numero: '', affaireId: a.id, clientId: a.clientId, contactId: a.contactId || '', siteId: a.siteId || '', chargeId: a.chargeId || '',
    objet: `Intervention ${a.code} – ${a.nom}`, refCommande: a.refCommande || '', date: isoDate(new Date()), echeance: isoDate(addDays(new Date(), num(s.delaiPaiement))),
    statut: 'Émise', lignes, ajustements: [], zoneId: '', retenuePct, ...tvaDuClient(a.clientId),
  });
  Object.assign(a, { statut: 'Facturé', factureId: f.id });
  Store.upsert('affaires', a);
  return f;
}

function horsDevisView(a) {
  const v = Calc.horsDevis(a), s = Calc.affaire(a), st = statutHD(a);
  const rapports = Store.all('rapports').filter(r => r.affaireId === a.id).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  const f = Store.get('factures', a.factureId) || Store.all('factures').find(x => x.affaireId === a.id);
  const bon = bonSigne(a);
  const parPersonne = {};
  v.temps.forEach(t => { const k = t.userId; (parPersonne[k] = parPersonne[k] || []).push(t); });
  const doc = attachementHD(a, v);
  return `<div class="toolbar"><a href="#/chantiers" class="btn secondary">← Chantiers</a><span class="spacer"></span>
    <button class="secondary" id="hd-edit">Modifier</button>
    <button class="secondary print-btn" data-print>Imprimer l'attachement</button>${boutonsEnvoi('attachement', a.id, 'Envoyer l\'attachement')}
    ${['Ouvert', 'Terminé'].includes(st) ? '<button class="secondary" id="hd-cde">Demander une commande au client</button>' : ''}
    ${['Ouvert', 'Terminé', 'Commande demandée'].includes(st) && !f ? '<button id="hd-fact">Facturer</button>' : ''}
    ${f ? `<a class="btn secondary" href="#/facture/${f.id}">Facture ${esc(f.numero || '')}</a>` : ''}
    ${st === 'Facturé' ? '<button class="secondary" id="hd-clore">Clore</button>' : ''}
    ${a.archive ? '' : `<button class="secondary" data-archiver="affaires|${a.id}">Archiver</button>`}</div>
  <h1>${esc(affaireLabel(a))} <span class="badge b-warn">Hors devis</span> ${badge(st)}</h1>${chantierOnglets(a, 'apercu')}${bandeauArchive(a, 'affaires')}
  ${aCompleterHD(a) || a.clientLibre || a.contactLibre || a.siteLibre ? `<div class="note warn-note">${a.ouvertePar ? `🛠️ Ouverte sur le téléphone par ${esc(userName(a.ouvertePar))} le ${dateFr(a.dateCreation)}.` : ''}
    ${a.clientLibre ? `<br>Client indiqué : <strong>${esc(a.clientLibre)}</strong> <button class="small" data-hd-creer="client">Créer ce client</button> ou le choisir avec « Modifier »` : ''}
    ${a.contactLibre ? `<br>Contact indiqué : <strong>${esc(a.contactLibre)}</strong>${a.contactTel ? ` (${esc(a.contactTel)})` : ''} ${a.clientId ? '<button class="small" data-hd-creer="contact">Ajouter au client</button>' : '<span class="small">(créez d\'abord le client)</span>'}` : ''}
    ${a.siteLibre ? `<br>Site indiqué : <strong>${esc(a.siteLibre)}</strong> ${a.clientId ? '<button class="small" data-hd-creer="site">Ajouter au client</button>' : '<span class="small">(créez d\'abord le client)</span>'}` : ''}
    ${!a.chargeId ? '<br>Chargé d\'affaires à désigner (bouton Modifier).' : ''}</div>` : ''}
  <p class="muted">Client : ${a.clientId ? `<a href="#/entreprise/${esc(a.clientId)}">${esc(clientName(a.clientId))}</a>` : a.clientLibre ? `${esc(a.clientLibre)} <span class="badge b-warn">à rattacher</span>` : '—'}${!a.contactId && a.contactLibre ? ` · Contact : ${esc(a.contactLibre)}${a.contactTel ? ` (${esc(a.contactTel)})` : ''}` : ''}${!a.siteId && a.siteLibre ? ` · Site : ${esc(a.siteLibre)}` : ''}${a.lieu ? ` · ${esc(a.lieu)}` : ''}
    ${a.contactId ? ` · Demandeur : ${esc(contactName(Store.get('contacts', a.contactId)))}` : ''}${a.siteId ? ` · ${esc(siteLabel(siteOf(a.clientId, a.siteId)))}` : ''}
    · Chargé d'affaires : ${esc(userName(a.chargeId))} · ${traceHD(a)}${a.doublonConfirme ? ' <span class="badge b-warn" title="Ouverte alors qu\'une intervention semblable existait (confirmé par la personne)">doublon confirmé</span>' : ''}${a.refCommande ? ` · <strong>commande client n° ${esc(a.refCommande)}</strong>` : ''}</p>
  ${envoisHtml('affaires', a.id)}
  ${a.demande ? `<p class="note pre">${esc(a.demande)}</p>` : ''}
  ${demandeClientHtml(a)}
  ${bon ? `<p class="note">Bon d'intervention signé par ${esc(bon.signataireNom)} le ${dateFr(bon.date)} : <a href="#/bon/${bon.id}">voir le bon</a>. ${a.refCommande ? 'Commande reçue : vous pouvez facturer.' : 'Demandez la commande au client ou facturez directement.'}</p>` : ''}

  <div class="cards">
    <div class="card"><div class="label">Heures pointées</div><div class="value">${fmt(v.heures, 2)} h</div><div class="sub">${v.aValider ? `<span class="warn-text">${fmt(v.aValider, 2)} h à valider</span> · ` : ''}${eur(v.totalMO)} HT</div>
      ${v.heures ? `<div class="sub">Préfabrication atelier ${fmt(sumBy(v.temps.filter(estPrefa), t => num(t.heures)), 2)} h · chantier ${fmt(sumBy(v.temps.filter(t => !estPrefa(t)), t => num(t.heures)), 2)} h</div>` : ''}</div>
    <div class="card"><div class="label">Matériel</div><div class="value">${eur(v.totalMat)}</div><div class="sub">${v.consos.length} ligne(s) saisie(s) par les équipes</div></div>
    <div class="card"><div class="label">À facturer</div><div class="value">${eur(v.total)}</div><div class="sub">HT, soit ${eur(v.total * (1 + Calc.tauxDoc(tvaDuClient(a.clientId)) / 100))} TTC</div></div>
    <div class="card"><div class="label">Marge</div><div class="value ${signClass(s.margeFin)}">${eur(s.margeFin)}</div><div class="sub">${marginBadge(s.margeFinPct)} coût réel ${eur(v.coutMO + v.coutMat + s.coutFrais)}</div></div>
  </div>

  <h2>Main-d'œuvre</h2>
  ${v.mo.length ? `<div class="table-wrap"><table><tr><th>Catégorie</th><th class="num">Heures</th><th class="num">Taux</th><th class="num">Montant HT</th></tr>
    ${v.mo.map(g => `<tr><td>${esc(g.libelle)}</td><td class="num">${fmt(g.heures, 2)} h</td><td class="num">${eur(g.taux)}</td><td class="num">${eur(g.montant)}</td></tr>`).join('')}
    <tr class="subtotal"><td>Total</td><td class="num">${fmt(v.heures, 2)} h</td><td></td><td class="num">${eur(v.totalMO)}</td></tr></table></div>
    <details class="card" style="margin-top:8px"><summary>Détail par personne</summary><div class="table-wrap" style="margin-top:8px"><table><tr><th>Personne</th><th>Date</th><th>Tâche</th><th>Horaires</th><th class="num">Heures</th><th>Statut</th></tr>
      ${Object.entries(parPersonne).map(([uid, ts]) => ts.sort((x, y) => x.date.localeCompare(y.date)).map(t => `<tr><td>${esc(userName(uid))}</td><td>${dateFr(t.date)}</td><td>${esc(t.tache)}</td><td>${t.debut ? `${esc(t.debut)} – ${esc(t.fin || '…')}` : ''}</td><td class="num">${fmt(t.heures, 2)}</td><td>${statutTemps(t)}</td></tr>`).join('')).join('')}
    </table></div></details>` : '<p class="muted">Aucune heure pointée. Les équipes pointent sur cette intervention depuis leur téléphone.</p>'}

  <h2>Matériel à facturer</h2>
  <div class="toolbar"><button id="hd-biblio">📦 Matériel de la bibliothèque</button><button class="secondary" id="hd-dicter">🎤 Dicter du matériel</button><button class="secondary" id="hd-addmat">+ Matériel libre</button></div>
  ${v.consos.length ? `<div class="table-wrap"><table><tr><th>Date</th><th>Saisi par</th><th>Désignation</th><th class="num">Qté</th><th>Unité</th><th class="num">PU vente</th><th class="num">Montant HT</th><th class="num">Achat</th></tr>
    ${v.consos.sort((x, y) => (x.date || '').localeCompare(y.date || '')).map(c => `<tr class="clickable ${num(c.pu) ? '' : 'a-chiffrer'}" data-conso="${c.id}"><td>${dateFr(c.date)}</td><td>${esc(userName(c.userId))}</td><td>${esc(c.designation)}${c.releveId ? ` <a class="small" href="#/releve/${esc(c.releveId)}" title="Matériel issu de la prise de cotes">📐 relevé</a>` : ''}${num(c.pu) ? '' : ' <span class="badge b-warn">prix à saisir</span>'}</td>
      <td class="num">${fmt(c.qte, 2)}</td><td>${esc(c.unite)}</td><td class="num">${eur(c.pu)}</td><td class="num">${eur(num(c.qte) * num(c.pu))}</td><td class="num muted">${eur(num(c.qte) * num(c.cout))}</td></tr>`).join('')}
    <tr class="subtotal"><td colspan="6">Total</td><td class="num">${eur(v.totalMat)}</td><td class="num">${eur(v.coutMat)}</td></tr></table></div>` : '<p class="muted">Aucun matériel saisi.</p>'}

  ${relevesChantierHtml(a)}

  <h2>Rapports et bons d'intervention</h2>
  ${rapports.length ? `<div class="table-wrap"><table><tr><th>Date</th><th>Par</th><th>Travaux réalisés</th><th>Signature client</th><th></th></tr>
    ${rapports.map(r => `<tr><td>${dateFr(r.date)}</td><td>${esc(userName(r.userId))}</td><td>${esc((r.travaux || '').slice(0, 140))}</td>
      <td>${r.signatureClientId ? `<span class="badge b-ok">Signé · ${esc(r.signataireNom || '')}</span>` : '<span class="muted small">non signé</span>'}</td><td><a class="btn small secondary" href="#/bon/${r.id}">Bon</a></td></tr>`).join('')}</table></div>`
  : '<p class="muted">Aucun rapport. En fin de travaux, l\'équipe rédige le rapport sur son téléphone et le fait signer au client.</p>'}

  <details class="no-print preview"><summary>Aperçu de l'attachement (à envoyer au client pour obtenir la commande)</summary><div class="doc-print">${doc}</div></details>
  <div class="print-only doc-print">${doc}</div>`;
}

function attachementHD(a, v) {
  const s = Store.data.settings, site = siteOf(a.clientId, a.siteId), contact = Store.get('contacts', a.contactId), bon = bonSigne(a), o = Doc.t('attachement');
  const n = o.prix ? 5 : 3;
  const ligne = (d, q, u, pu, m) => `<tr><td>${esc(d)}</td><td class="num">${fmt(q, 2)}</td><td>${esc(u)}</td>${o.prix ? `<td class="num">${eur(pu)}</td><td class="num">${eur(m)}</td>` : ''}</tr>`;
  return `${Doc.entete('attachement', o.titre, `Intervention ${esc(a.code || '')} du ${dateFr(a.dateCreation)}${a.refCommande ? `<br>Votre commande n° ${esc(a.refCommande)}` : ''}`)}
    <div class="doc-parties"><div><strong>${esc(clientName(a.clientId))}</strong>${site ? `<br>${esc(site.libelle)}<br>${esc(fullAddress(site))}` : ''}</div>
    <div>${contact && o.contact ? `Demandeur : <strong>${esc(contactName(contact))}</strong>${contact.fonction ? `, ${esc(contact.fonction)}` : ''}` : ''}${bon ? `${contact && o.contact ? '<br>' : ''}Bon d'intervention signé le ${dateFr(bon.date)} par ${esc(bon.signataireNom)}` : ''}</div></div>
    <p class="doc-objet"><strong>Objet :</strong> ${esc(a.nom)}${(() => { const m = ((a.documents || []).find(d => d.categorie === 'Demande client' && d.mail && d.mail.date) || {}).mail; return m ? ` · <span class="small">suite à votre demande du ${dateFr(m.date.slice(0, 10))}${m.objet ? ` (« ${esc(m.objet)} »)` : ''}</span>` : ''; })()}</p>
    ${a.demande && o.demande ? `<p class="pre">${esc(a.demande)}</p>` : ''}${Doc.intro('attachement')}
    <div class="table-wrap"><table class="doc-lines${o.prix ? '' : ' compact'}"><tr><th>Désignation</th><th class="num">Qté</th><th>Unité</th>${o.prix ? '<th class="num">PU HT</th><th class="num">Montant HT</th>' : ''}</tr>
      ${v.mo.length ? `<tr class="chap"><td colspan="${n}">Main-d'œuvre</td></tr>${v.mo.map(g => ligne(g.libelle, g.heures, 'h', g.taux, g.montant)).join('')}` : ''}
      ${v.consos.length ? `<tr class="chap"><td colspan="${n}">Fournitures et matériel</td></tr>${v.consos.map(c => ligne(c.designation, c.qte, c.unite, c.pu, num(c.qte) * num(c.pu))).join('')}` : ''}
    </table></div>
    ${o.prix ? (() => { const tv = tvaDuClient(a.clientId), tx = Calc.tauxDoc(tv); return `<table class="totals"><tr><td>Total HT</td><td class="num">${eur(v.total)}</td></tr><tr><td>${tv.autoliquidation ? 'TVA autoliquidée par le preneur' : `TVA ${libTaux(tx)}`}</td><td class="num">${eur(v.total * tx / 100)}</td></tr>
      <tr class="grand"><td>Total TTC</td><td class="num">${eur(v.total * (1 + tx / 100))}</td></tr></table>${tv.autoliquidation ? `<p class="doc-conditions">${esc(MENTIONS_TVA.AL)}</p>` : ''}`; })() : ''}
    ${Doc.pied('attachement', '', o.signature ? `<div class="signatures"><div>Pour ${esc(s.societe)}<br>${esc(userName(a.chargeId))}</div><div>Bon pour commande<br>Date, signature et n° de commande :</div></div>` : '')}`;
}

function bindHorsDevis(root, a) {
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  on('#hd-edit', () => editModal({ title: `Intervention ${a.code}`, col: 'affaires', fields: hdFields, obj: { ...a }, onDelete: () => { location.hash = '#/chantiers'; } }));
  on('#hd-cde', async () => {
    const ref = await askValue('N° de commande du client (laisser vide si la commande est demandée mais pas encore reçue)', a.refCommande || '');
    if (ref === null) return;
    if (ref) { a.refCommande = ref; if (a.statut === 'Commande demandée' || bonSigne(a)) a.statut = 'Terminé'; }
    else a.statut = 'Commande demandée';
    Store.upsert('affaires', a); App.render();
    App.toast(ref ? `Commande n° ${ref} enregistrée` : 'Imprimez l\'attachement et envoyez-le au client pour obtenir sa commande.', 4000);
  });
  on('#hd-fact', async () => {
    const v = Calc.horsDevis(a);
    if (!v.total) { notify('Rien à facturer : aucune heure ni matériel valorisé.'); return; }
    const avert = [v.aValider ? `${fmt(v.aValider, 2)} h ne sont pas encore validées` : '', v.consos.some(c => !num(c.pu)) ? 'du matériel n\'a pas de prix' : '', !bonSigne(a) ? 'aucun bon d\'intervention n\'est signé' : ''].filter(Boolean);
    // Confirmation, avec la retenue de garantie à cocher (taux du chantier, sinon 5 %)
    const rgDefaut = (a.caution ? 0 : num(a.retenueGarantie)) || Retenue.PLAFOND;
    const rgPct = await dialog(`<form><p>Facturer ${eur(v.total)} HT${a.refCommande ? ` (commande n° ${esc(a.refCommande)})` : ''} ?${avert.length ? ` Attention : ${esc(avert.join(', '))}.` : ''}</p>
      <p><label class="check"><input type="checkbox" id="dlg-rg" ${num(a.retenueGarantie) && !a.caution ? 'checked' : ''}> Retenue de garantie</label>
        <input id="dlg-rgpct" type="number" min="0" max="10" step="0.5" value="${esc(rgDefaut)}" style="width:80px" aria-label="Taux de retenue"> % du TTC</p>
      <div class="modal-actions"><button type="button" class="secondary" data-cancel>Annuler</button><button type="submit">Facturer</button></div></form>`,
    (wrap, done) => {
      wrap.querySelector('[data-cancel]').onclick = () => done(null);
      wrap.querySelector('form').onsubmit = e => { e.preventDefault(); done(wrap.querySelector('#dlg-rg').checked ? Retenue.taux(wrap.querySelector('#dlg-rgpct').value) || Retenue.PLAFOND : 0); };
    });
    if (rgPct === null) return;
    if (rgPct > Retenue.PLAFOND) App.toast('Au-delà de 5 %, la retenue de garantie n\'est pas conforme à la loi du 16 juillet 1971.', 5000);
    const f = facturerHD(a, rgPct);
    location.hash = `#/facture/${f.id}`;
  });
  on('#hd-clore', () => { a.statut = 'Clos'; Store.upsert('affaires', a); App.render(); });
  // Client, contact ou site saisis sur le téléphone : créés en un clic dans les contacts
  root.querySelectorAll('[data-hd-creer]').forEach(b => b.onclick = async () => {
    const quoi = b.dataset.hdCreer;
    if (quoi === 'client') {
      const e = Store.upsert('entreprises', { nom: a.clientLibre, categorie: 'Client', adresses: a.siteLibre ? [{ id: uid(), libelle: a.siteLibre, adresse: '', cp: '', ville: '', facturation: true }] : [] });
      Object.assign(a, { clientId: e.id, clientLibre: '', ...(a.siteLibre ? { siteId: e.adresses[0].id, siteLibre: '' } : {}) });
    } else if (quoi === 'contact') {
      const k = Store.upsert('contacts', { entrepriseId: a.clientId, nom: a.contactLibre, mobile: a.contactTel || '' });
      Object.assign(a, { contactId: k.id, contactLibre: '', contactTel: '' });
    } else if (quoi === 'site') {
      const e = { ...entreprise(a.clientId) }, sid = uid();
      e.adresses = [...(e.adresses || []), { id: sid, libelle: a.siteLibre, adresse: '', cp: '', ville: '', facturation: !(e.adresses || []).length }];
      Store.upsert('entreprises', e);
      Object.assign(a, { siteId: sid, siteLibre: '' });
    }
    Store.upsert('affaires', a); App.render(); App.toast(quoi === 'client' ? 'Client créé : complétez sa fiche (adresse, SIRET…)' : quoi === 'contact' ? 'Contact ajouté au client' : 'Site ajouté au client');
  });
  bindDemandeClient(root, a);
  on('#hd-dicter', async () => {
    const choix = await dicterMateriel({ titre: `Dicter du matériel · ${a.code || ''}`, prix: true, cible: 'au matériel à facturer de l\'intervention' });
    choix.forEach(m => Store.upsert('consommations', { articleId: m.articleId, designation: m.designation, unite: m.unite, qte: m.qte, pu: m.pu, cout: m.cout, affaireId: a.id, date: isoDate(new Date()), userId: Store.me.userId || '' }));
    if (choix.length) { App.render(); App.toast(`${choix.length} ligne(s) de matériel ajoutée(s)`); }
  });
  on('#hd-biblio', async () => {
    const choix = await choisirMateriel({ titre: `Matériel · ${a.code || ''}`, affaireId: a.id, prix: true });
    choix.forEach(m => Store.upsert('consommations', { ...m, affaireId: a.id, date: isoDate(new Date()), userId: Store.me.userId || '' }));
    if (choix.length) { App.render(); App.toast(`${choix.length} ligne(s) de matériel ajoutée(s)`); }
  });
  on('#hd-addmat', () => editModal({ title: 'Matériel', col: 'consommations', fields: consoFields, obj: { affaireId: a.id, date: isoDate(new Date()), unite: 'u', qte: 1, userId: Store.me.userId || '' } }));
  root.querySelectorAll('[data-conso]').forEach(tr => tr.onclick = () => editModal({ title: 'Matériel', col: 'consommations', fields: consoFields, obj: { ...Store.get('consommations', tr.dataset.conso) } }));
}
