// Interventions hors devis (travaux en régie sur demande du client, sans devis préalable).
// Les équipes y pointent leurs heures et y saisissent le matériel depuis leur téléphone ; le client signe le bon
// d'intervention ; le bureau envoie l'attachement pour obtenir une commande, facture puis clôt le dossier.
const STATUTS_HD = ['Ouvert', 'Terminé', 'Commande demandée', 'Facturé', 'Clos'];
const estHorsDevis = a => a && a.type === 'horsDevis';
const bonSigne = a => Store.all('rapports').find(r => r.affaireId === a.id && r.signatureClientId && r.termine);
// Statut affiché : un bon signé « intervention terminée » fait passer l'intervention ouverte à « Terminé »
const statutHD = a => (a.statut === 'Ouvert' && bonSigne(a) ? 'Terminé' : a.statut);

const hdFields = [
  { key: 'nom', label: "Objet de l'intervention (ex. machine à papier PM2 – collecteur de purge)" },
  { key: 'clientId', label: 'Client', type: 'select', options: v => options(clientsList(), v) },
  { key: 'contactId', label: 'Demandeur (contact client)', type: 'select', dynamic: true, options: (v, o) => contactOptions(o.clientId, v) },
  { key: 'siteId', label: "Site d'intervention", type: 'select', dynamic: true, options: (v, o) => siteOptions(o.clientId, v) },
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

function facturerHD(a) {
  const v = Calc.horsDevis(a), s = Store.data.settings;
  const lignes = [];
  if (v.mo.length) { lignes.push({ type: 'chapitre', titre: "Main-d'œuvre" }); v.mo.forEach(g => lignes.push({ designation: g.libelle, unite: 'h', qte: Math.round(g.heures * 100) / 100, pu: g.taux })); }
  if (v.consos.length) { lignes.push({ type: 'chapitre', titre: 'Fournitures et matériel' }); v.consos.forEach(c => lignes.push({ designation: c.designation, unite: c.unite, qte: num(c.qte), pu: num(c.pu) })); }
  const f = Store.upsert('factures', {
    numero: '', affaireId: a.id, clientId: a.clientId, contactId: a.contactId || '', siteId: a.siteId || '', chargeId: a.chargeId || '',
    objet: `Intervention ${a.code} – ${a.nom}`, refCommande: a.refCommande || '', date: isoDate(new Date()), echeance: isoDate(addDays(new Date(), num(s.delaiPaiement))),
    statut: 'Émise', lignes, ajustements: [], zoneId: '',
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
    <button class="secondary print-btn" onclick="window.print()">Imprimer l'attachement</button>${boutonsEnvoi('attachement', a.id, 'Envoyer l\'attachement')}
    ${['Ouvert', 'Terminé'].includes(st) ? '<button class="secondary" id="hd-cde">Demander une commande au client</button>' : ''}
    ${['Ouvert', 'Terminé', 'Commande demandée'].includes(st) && !f ? '<button id="hd-fact">Facturer</button>' : ''}
    ${f ? `<a class="btn secondary" href="#/facture/${f.id}">Facture ${esc(f.numero || '')}</a>` : ''}
    ${st === 'Facturé' ? '<button class="secondary" id="hd-clore">Clore</button>' : ''}
    ${a.archive ? '' : `<button class="secondary" data-archiver="affaires|${a.id}">Archiver</button>`}</div>
  <h1>${esc(affaireLabel(a))} <span class="badge b-warn">Hors devis</span> ${badge(st)}</h1>${bandeauArchive(a, 'affaires')}
  <p class="muted">Client : ${a.clientId ? `<a href="#/entreprise/${a.clientId}">${esc(clientName(a.clientId))}</a>` : '—'}
    ${a.contactId ? ` · Demandeur : ${esc(contactName(Store.get('contacts', a.contactId)))}` : ''}${a.siteId ? ` · ${esc(siteLabel(siteOf(a.clientId, a.siteId)))}` : ''}
    · Chargé d'affaires : ${esc(userName(a.chargeId))} · ouvert le ${dateFr(a.dateCreation)}${a.refCommande ? ` · <strong>commande client n° ${esc(a.refCommande)}</strong>` : ''}</p>
  ${envoisHtml('affaires', a.id)}
  ${a.demande ? `<p class="note pre">${esc(a.demande)}</p>` : ''}
  ${bon ? `<p class="note">Bon d'intervention signé par ${esc(bon.signataireNom)} le ${dateFr(bon.date)} : <a href="#/bon/${bon.id}">voir le bon</a>. ${a.refCommande ? 'Commande reçue : vous pouvez facturer.' : 'Demandez la commande au client ou facturez directement.'}</p>` : ''}

  <div class="cards">
    <div class="card"><div class="label">Heures pointées</div><div class="value">${fmt(v.heures, 2)} h</div><div class="sub">${v.aValider ? `<span class="warn-text">${fmt(v.aValider, 2)} h à valider</span> · ` : ''}${eur(v.totalMO)} HT</div></div>
    <div class="card"><div class="label">Matériel</div><div class="value">${eur(v.totalMat)}</div><div class="sub">${v.consos.length} ligne(s) saisie(s) par les équipes</div></div>
    <div class="card"><div class="label">À facturer</div><div class="value">${eur(v.total)}</div><div class="sub">HT, soit ${eur(v.total * (1 + num(Store.data.settings.tva) / 100))} TTC</div></div>
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
  <div class="toolbar"><button class="secondary" id="hd-addmat">+ Matériel</button></div>
  ${v.consos.length ? `<div class="table-wrap"><table><tr><th>Date</th><th>Saisi par</th><th>Désignation</th><th class="num">Qté</th><th>Unité</th><th class="num">PU vente</th><th class="num">Montant HT</th><th class="num">Achat</th></tr>
    ${v.consos.sort((x, y) => (x.date || '').localeCompare(y.date || '')).map(c => `<tr class="clickable ${num(c.pu) ? '' : 'a-chiffrer'}" data-conso="${c.id}"><td>${dateFr(c.date)}</td><td>${esc(userName(c.userId))}</td><td>${esc(c.designation)}${num(c.pu) ? '' : ' <span class="badge b-warn">prix à saisir</span>'}</td>
      <td class="num">${fmt(c.qte, 2)}</td><td>${esc(c.unite)}</td><td class="num">${eur(c.pu)}</td><td class="num">${eur(num(c.qte) * num(c.pu))}</td><td class="num muted">${eur(num(c.qte) * num(c.cout))}</td></tr>`).join('')}
    <tr class="subtotal"><td colspan="6">Total</td><td class="num">${eur(v.totalMat)}</td><td class="num">${eur(v.coutMat)}</td></tr></table></div>` : '<p class="muted">Aucun matériel saisi.</p>'}

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
    <p class="doc-objet"><strong>Objet :</strong> ${esc(a.nom)}</p>
    ${a.demande && o.demande ? `<p class="pre">${esc(a.demande)}</p>` : ''}${Doc.intro('attachement')}
    <div class="table-wrap"><table class="doc-lines${o.prix ? '' : ' compact'}"><tr><th>Désignation</th><th class="num">Qté</th><th>Unité</th>${o.prix ? '<th class="num">PU HT</th><th class="num">Montant HT</th>' : ''}</tr>
      ${v.mo.length ? `<tr class="chap"><td colspan="${n}">Main-d'œuvre</td></tr>${v.mo.map(g => ligne(g.libelle, g.heures, 'h', g.taux, g.montant)).join('')}` : ''}
      ${v.consos.length ? `<tr class="chap"><td colspan="${n}">Fournitures et matériel</td></tr>${v.consos.map(c => ligne(c.designation, c.qte, c.unite, c.pu, num(c.qte) * num(c.pu))).join('')}` : ''}
    </table></div>
    ${o.prix ? `<table class="totals"><tr><td>Total HT</td><td class="num">${eur(v.total)}</td></tr><tr><td>TVA ${fmt(s.tva, 1)} %</td><td class="num">${eur(v.total * num(s.tva) / 100)}</td></tr>
      <tr class="grand"><td>Total TTC</td><td class="num">${eur(v.total * (1 + num(s.tva) / 100))}</td></tr></table>` : ''}
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
    if (!await ask(`Facturer ${eur(v.total)} HT${a.refCommande ? ` (commande n° ${a.refCommande})` : ''} ?${avert.length ? ' Attention : ' + avert.join(', ') + '.' : ''}`, 'Facturer', false)) return;
    const f = facturerHD(a);
    location.hash = `#/facture/${f.id}`;
  });
  on('#hd-clore', () => { a.statut = 'Clos'; Store.upsert('affaires', a); App.render(); });
  on('#hd-addmat', () => editModal({ title: 'Matériel', col: 'consommations', fields: consoFields, obj: { affaireId: a.id, date: isoDate(new Date()), unite: 'u', qte: 1, userId: Store.me.userId || '' } }));
  root.querySelectorAll('[data-conso]').forEach(tr => tr.onclick = () => editModal({ title: 'Matériel', col: 'consommations', fields: consoFields, obj: { ...Store.get('consommations', tr.dataset.conso) } }));
}
