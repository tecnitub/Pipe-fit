// Écrans : tableau de bord, chantiers (pilotage), factures, planning, analyse, paramètres.
const charges = () => Store.all('users').filter(u => u.role === 'charge');
const operateurs = () => Store.all('users').filter(u => u.role !== 'charge');
const userName = id => (Store.get('users', id) || {}).nom || '—';
const affaireLabel = a => `${a.code || '…'} – ${a.nom}`;
const affaireOf = id => Store.get('affaires', id) || {};
const STATUTS_CHANTIER = ['En préparation', 'En cours', 'Terminé', 'Facturé', 'Clos'];
const chantiersActifs = () => Store.all('affaires').filter(a => !a.archive && ['En préparation', 'En cours', 'Ouvert'].includes(a.statut));

const Views = {};

// Barre budget / réel : remplissage = consommé, trait = 100 % du budget
function gauge(reel, budget) {
  const p = budget ? reel / budget * 100 : 0;
  return `<div class="gauge"><div class="bar ${p > 100 ? 'over' : ''}"><span style="width:${Math.min(100, p)}%"></span></div><span class="muted small">${budget ? pct(p) : '—'}</span></div>`;
}

/* ---------------- Tableau de bord ---------------- */
const FILTRES_TDB = { client: '', charge: '' };
Views.dashboard = (params, query) => {
  // Filtre client / chargé d'affaires : tout le tableau de bord se limite aux chantiers et documents concernés (archives exclues)
  const fd = lireFiltres('dashboard', query, FILTRES_TDB);
  const okAff = a => !!a.id && !a.archive && (!fd.client || a.clientId === fd.client) && (!fd.charge || a.chargeId === fd.charge);
  const okDoc = d => !d.archive && (!fd.client || docClientId(d) === fd.client) && (!fd.charge || docChargeId(d) === fd.charge);
  const surAff = o => !(fd.client || fd.charge) || okAff(affaireOf(o.affaireId));
  const affaires = Store.all('affaires').filter(okAff);
  const devis = Store.all('devis').filter(okDoc);
  const factures = Store.all('factures').filter(f => (!fd.client || docClientId(f) === fd.client) && (!fd.charge || docChargeId(f) === fd.charge));
  const actifs = chantiersActifs().filter(okAff);
  const stats = affaires.map(a => ({ a, s: Calc.affaire(a) }));
  const caFacture = sumBy(factures, f => Calc.facture(f).ht);
  const enAttente = devis.filter(d => d.statut === 'Envoyé');
  const impayes = sumBy(factures, f => Calc.resteDu(f));
  const retenuesALiberer = sumBy(stats, x => x.s.retenueALiberer);
  const tousDevis = Store.all('devis').filter(d => (!fd.client || docClientId(d) === fd.client) && (!fd.charge || docChargeId(d) === fd.charge)); // taux de transformation : archives comprises
  const acc = tousDevis.filter(d => d.statut === 'Accepté').length, ref = tousDevis.filter(d => d.statut === 'Refusé').length;
  const carnet = sumBy(stats.filter(x => !x.s.termine), x => x.s.caDevis - x.s.caFacture);
  const alertes = stats.filter(x => !x.s.termine && (x.s.ecartHeuresPct > 0 || x.s.consoF > 100 || x.s.margeFinPct < x.s.margePrevPct - 3));
  const commandesAttente = Store.all('commandes').filter(c => c.statut === 'Envoyée' && surAff(c));
  const week = isoWeek(new Date());
  const hdAFacturer = affaires.filter(a => estHorsDevis(a) && ['Terminé', 'Commande demandée'].includes(statutHD(a)));
  const rapportsJour = Store.all('rapports').filter(r => r.date >= isoDate(addDays(new Date(), -1)) && surAff(r)).length;
  const reservesOuv = Store.all('reserves').filter(r => r.statut !== 'Levée' && surAff(r)).length;
  const aValider = sumBy(Store.all('temps').filter(t => !t.statut && t.fin !== '' && surAff(t)), t => num(t.heures));
  const fraisAValider = Store.all('frais').filter(f => f.statut === 'Soumise' && surAff(f));
  const sitsProposees = Store.all('situations').filter(x => x.statut === 'Proposée' && surAff(x));
  const tempsSemaine = sumBy(Store.all('temps').filter(t => isoWeek(new Date(t.date)) === week && surAff(t)), t => num(t.heures));
  return `
  <h1>Tableau de bord</h1>
  ${barreFiltres(fd, { clients: [...new Set(Store.all('affaires').map(a => a.clientId))], recherche: false, defauts: FILTRES_TDB })}
  <div class="cards">
    <div class="card"><div class="label">Devis en attente</div><div class="value">${eur(sumBy(enAttente, d => Calc.doc(d).totalHT))}</div><div class="sub">${enAttente.length} devis envoyés · transformation ${pct((acc + ref) ? acc / (acc + ref) * 100 : 0)}</div></div>
    <div class="card"><div class="label">Carnet de commandes</div><div class="value">${eur(carnet)}</div><div class="sub">${actifs.length} chantiers en cours, reste à facturer</div></div>
    <div class="card"><div class="label">CA facturé HT</div><div class="value">${eur(caFacture)}</div><div class="sub">Restant dû ${eur(impayes)} TTC${retenuesALiberer ? ` · retenues de garantie à libérer ${eur(retenuesALiberer)}` : ''}</div></div>
    <div class="card"><div class="label">Heures pointées (${week.replace('-W', ' S')})</div><div class="value">${fmt(tempsSemaine, 1)} h</div><div class="sub">${commandesAttente.length} commande(s) fournisseur en attente de livraison</div></div>
  </div>
  <div class="cards">
    <a class="card clickable-card" href="#/rh/validation"><div class="label">Pointages à valider</div><div class="value ${aValider ? 'warn-text' : ''}">${fmt(aValider, 1)} h</div><div class="sub">avant envoi en paie</div></a>
    <a class="card clickable-card" href="#/rh/frais"><div class="label">Notes de frais à valider</div><div class="value">${fraisAValider.length}</div><div class="sub">${eur(sumBy(fraisAValider, f => num(f.montantTTC)))} TTC</div></a>
    <a class="card clickable-card" href="#/chantiers"><div class="label">Hors devis à facturer</div><div class="value">${hdAFacturer.length}</div><div class="sub">${eur(sumBy(hdAFacturer, a => Calc.horsDevis(a).total))} HT · ${Store.all('affaires').filter(a => estHorsDevis(a) && statutHD(a) === 'Ouvert').length} intervention(s) en cours</div></a>
    <div class="card"><div class="label">Terrain</div><div class="value">${rapportsJour} rapport(s)</div><div class="sub">reçus depuis hier · ${reservesOuv} réserve(s) ouverte(s) sur les chantiers</div></div>
    <a class="card clickable-card" href="#/situations?statut=Proposée"><div class="label">Situations en attente d'accord</div><div class="value">${sitsProposees.length}</div><div class="sub">${eur(sumBy(sitsProposees, x => Calc.situation(x).montant))} HT proposés à la maîtrise d'œuvre</div></a>
  </div>
  <h2>Chantiers à surveiller</h2>
  ${alertes.length ? `<div class="table-wrap"><table><tr><th>Chantier</th><th>Chargé</th><th>Heures</th><th>Fournitures</th><th class="num">Marge prévue</th><th class="num">À terminaison</th></tr>
    ${alertes.map(({ a, s }) => `<tr class="clickable" onclick="location.hash='#/chantier/${a.id}'"><td>${esc(affaireLabel(a))}</td><td>${esc(userName(a.chargeId))}</td>
      <td>${gauge(s.heuresPassees, s.heuresPrevues)}</td><td>${gauge(s.achats, s.budgetF)}</td><td class="num">${pct(s.margePrevPct)}</td><td class="num">${marginBadge(s.margeFinPct)}</td></tr>`).join('')}
  </table></div>` : '<p class="muted">Aucun chantier en dérive.</p>'}
  <h2>Chantiers en cours</h2>
  ${chantierTable(actifs)}`;
};

Views.dashboard.bind = (root, params, query) => bindFiltres(root, 'dashboard', lireFiltres('dashboard', query, FILTRES_TDB), FILTRES_TDB);

/* ---------------- Chantiers ---------------- */
const chantierFields = [
  { key: 'nom', label: 'Intitulé du chantier' },
  { key: 'clientId', label: 'Client', type: 'select', options: v => options(clientsList(), v) },
  { key: 'contactId', label: 'Contact client (chargé de travaux)', type: 'select', dynamic: true, options: (v, o) => contactOptions(o.clientId, v) },
  { key: 'siteId', label: "Site d'intervention", type: 'select', dynamic: true, options: (v, o) => siteOptions(o.clientId, v) },
  { key: 'moeId', label: "Maîtrise d'œuvre (destinataire des situations)", type: 'select', options: v => options(moeList(), v) },
  { key: 'moeContactId', label: "Contact maîtrise d'œuvre", type: 'select', dynamic: true, options: (v, o) => contactOptions(o.moeId, v) },
  { key: 'chargeId', label: "Chargé d'affaires", type: 'select', options: v => options(charges(), v) },
  { key: 'statut', label: 'Statut', type: 'select', options: v => optionsStr(STATUTS_CHANTIER, v) },
  { key: 'retenueGarantie', label: 'Retenue de garantie % (vide = aucune)', type: 'number', step: '0.5' },
  { key: 'caution', label: 'Retenue remplacée par une caution bancaire', type: 'select', options: v => `<option value="">Non</option><option value="1" ${v ? 'selected' : ''}>Oui</option>` },
  { key: 'dateReception', label: 'Date de réception des travaux', type: 'date' },
  { key: 'heuresPrevues', label: 'Heures prévues (vide = heures du devis)', type: 'number', step: '0.5' },
];

function chantierTable(list, selection = false) {
  if (!list.length) return '<p class="muted">Aucun chantier pour ces critères.</p>';
  return `<div class="table-wrap"><table><tr>${selection ? '<th class="sel-cell"><input type="checkbox" data-sel-tout aria-label="Tout sélectionner"></th>' : ''}<th>Chantier</th><th>Client</th><th>Chargé</th><th>Statut</th><th class="num">Montant HT</th><th>Heures</th><th>Fournitures</th><th class="num">Marge à terminaison</th></tr>
  ${list.map(a => {
    const s = Calc.affaire(a);
    return `<tr class="clickable ${a.archive ? 'archive' : ''}" onclick="location.hash='#/chantier/${a.id}'">${selection ? `<td class="sel-cell"><input type="checkbox" data-sel-id="${a.id}" aria-label="Sélectionner ${esc(a.code || '')}"></td>` : ''}<td><strong>${esc(a.code || '…')}</strong>${estHorsDevis(a) ? ' <span class="badge b-warn">Hors devis</span>' : ''}${a.archive ? ' <span class="badge">Archivé</span>' : ''}<br>${esc(a.nom)}</td><td>${esc(clientName(a.clientId))}</td><td>${esc(userName(a.chargeId))}</td><td>${badge(estHorsDevis(a) ? statutHD(a) : a.statut)}</td>
      <td class="num">${eur(s.caDevis)}</td><td>${gauge(s.heuresPassees, s.heuresPrevues)}<span class="muted small">${fmt(s.heuresPassees)} / ${fmt(s.heuresPrevues)} h</span></td>
      <td>${gauge(s.achats, s.budgetF)}</td><td class="num">${s.caDevis ? marginBadge(s.margeFinPct) : '—'}</td></tr>`;
  }).join('')}</table></div>`;
}

const FILTRES_CHANTIERS = { q: '', client: '', charge: '', statut: '' };
const chantierFiltre = (a, f) => (!f.client || a.clientId === f.client) && (!f.charge || a.chargeId === f.charge)
  && correspond(f.q, a.code, a.nom, clientName(a.clientId), a.refCommande)
  && (f.statut === 'archives' ? a.archive : !a.archive && (f.statut === 'tous' || (f.statut ? (estHorsDevis(a) ? statutHD(a) : a.statut) === f.statut : a.statut !== 'Clos')));
Views.chantiers = (params, query) => {
  const f = lireFiltres('chantiers', query, FILTRES_CHANTIERS);
  const list = Store.all('affaires').filter(a => chantierFiltre(a, f)).sort((x, y) => String(y.code || '').localeCompare(String(x.code || '')));
  const archivables = Store.all('affaires').filter(a => !a.archive && ['Clos'].includes(a.statut) && (!f.client || a.clientId === f.client) && (!f.charge || a.chargeId === f.charge));
  const statuts = [['', 'En cours (hors clos)'], ['tous', 'Tous (hors archivés)'], ...[...new Set([...STATUTS_CHANTIER, ...STATUTS_HD])].map(s => [s, s]), ['archives', 'Archivés']];
  return `<h1>Chantiers</h1>
  <p class="muted">Un chantier est créé lorsqu'un devis est accepté : le devis devient son budget (fournitures et main-d'œuvre). Archivez les chantiers terminés pour alléger les listes.</p>
  <div class="toolbar"><button id="add-hd">+ Intervention hors devis</button><span class="spacer"></span>
    ${archivables.length && f.statut !== 'archives' ? `<button class="secondary" id="arch-clos">Archiver les ${archivables.length} chantier(s) clos</button>` : ''}</div>
  ${barreFiltres(f, { clients: [...new Set(Store.all('affaires').map(a => a.clientId))], statuts, defauts: FILTRES_CHANTIERS })}
  <div class="toolbar sel-bar hidden" id="sel-bar"><span id="sel-n"></span><button class="secondary" id="sel-arch">${f.statut === 'archives' ? 'Sortir des archives' : 'Archiver la sélection'}</button></div>
  <p class="muted small">${list.length} chantier(s) · ${eur(sumBy(list, a => Calc.affaire(a).caDevis))} HT</p>
  ${chantierTable(list, true)}`;
};
Views.chantiers.bind = (root, params, query) => {
  const f = lireFiltres('chantiers', query, FILTRES_CHANTIERS);
  bindFiltres(root, 'chantiers', f, FILTRES_CHANTIERS);
  root.querySelector('#add-hd').onclick = nouvelleInterventionHD;
  const sel = selectionListe(root, ids => { root.querySelector('#sel-bar').classList.toggle('hidden', !ids.length); root.querySelector('#sel-n').textContent = `${ids.length} sélectionné(s)`; });
  root.querySelector('#sel-arch').onclick = () => archiver('affaires', sel().map(id => Store.get('affaires', id)), f.statut !== 'archives');
  const ac = root.querySelector('#arch-clos');
  if (ac) ac.onclick = () => archiver('affaires', Store.all('affaires').filter(a => !a.archive && a.statut === 'Clos' && (!f.client || a.clientId === f.client) && (!f.charge || a.chargeId === f.charge)));
};

Views.chantier = params => {
  const a = Store.get('affaires', params[0]);
  if (!a) return '<p>Chantier introuvable. <a href="#/chantiers">Retour aux chantiers</a></p>';
  if (estHorsDevis(a)) return horsDevisView(a);
  const s = Calc.affaire(a);
  const devis = Store.all('devis').filter(d => d.affaireId === a.id);
  const facts = Store.all('factures').filter(f => f.affaireId === a.id);
  const commandes = Store.all('commandes').filter(c => c.affaireId === a.id).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  const temps = Store.all('temps').filter(t => t.affaireId === a.id);
  const parOp = {};
  temps.forEach(t => { parOp[t.userId] = (parOp[t.userId] || 0) + num(t.heures); });
  const rex = a.rex || {};
  const dAcc = devis.find(d => d.statut === 'Accepté');
  const rapports = Store.all('rapports').filter(r => r.affaireId === a.id).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  const reserves = Store.all('reserves').filter(r => r.affaireId === a.id), reservesOuvertes = reserves.filter(r => r.statut !== 'Levée').length;
  const pvRec = Store.all('receptions').find(p => p.affaireId === a.id && p.type === 'reception' && p.statut === 'Signé');
  const sits = Store.all('situations').filter(x => x.affaireId === a.id).sort((x, y) => (x.numero || '~').localeCompare(y.numero || '~'));
  const frais = Store.all('frais').filter(n => n.affaireId === a.id).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  return `
  <div class="toolbar"><a href="#/chantiers" class="btn secondary">← Chantiers</a><span class="spacer"></span>
    <button id="edit" class="secondary">Modifier</button>
    <a class="btn secondary" href="#/reception/${a.id}">Réserves et réception</a>
    <a class="btn secondary" href="#/commandes/new?chantier=${a.id}">+ Commande fournisseur</a>
    <button class="secondary" onclick="location.hash='#/consultations/' + nouvelleConsultation({ affaireId: '${a.id}', objet: 'Fournitures ${esc(a.code || '')}' }).id">+ Consultation fournisseurs</button>
    ${dAcc ? '<button id="situation">+ Situation de travaux</button>' : ''}
    ${a.archive ? '' : `<button class="secondary" data-archiver="affaires|${a.id}">Archiver</button>`}</div>
  <h1>${esc(affaireLabel(a))} ${badge(a.statut)} ${a.okFacturation ? '<span class="badge b-ok">Réceptionné · OK pour facturation</span>' : ''}</h1>${bandeauArchive(a, 'affaires')}
  <p class="muted">Client : ${a.clientId ? `<a href="#/entreprise/${a.clientId}">${esc(clientName(a.clientId))}</a>` : '—'}
    ${a.contactId ? ` · Contact : ${esc(contactName(Store.get('contacts', a.contactId)))}` : ''}
    ${a.siteId ? ` · Site : ${esc(siteLabel(siteOf(a.clientId, a.siteId)))}` : ''}
    ${a.moeId ? ` · Maîtrise d'œuvre : ${esc(clientName(a.moeId))}${a.moeContactId ? ` (${esc(contactName(Store.get('contacts', a.moeContactId)))})` : ''}` : ''}
    · Chargé d'affaires : ${esc(userName(a.chargeId))}
    ${devis.length ? ` · Devis : ${devis.map(d => `<a href="#/devis/${d.id}">${esc(d.numero)}</a>`).join(', ')}` : ''}</p>

  <div class="cards">
    <div class="card"><div class="label">Montant du marché</div><div class="value">${eur(s.caDevis)}</div>${gauge(s.caFacture, s.caDevis)}<div class="sub">Facturé ${eur(s.caFacture)} · reste ${eur(s.resteAFacturer)}</div></div>
    <div class="card"><div class="label">Heures</div><div class="value">${fmt(s.heuresPassees, 1)} / ${fmt(s.heuresPrevues, 1)} h</div>${gauge(s.heuresPassees, s.heuresPrevues)}<div class="sub">Reste ${fmt(s.resteHeures, 1)} h · planifié ${fmt(s.heuresPlanifiees)} h</div></div>
    ${num(a.retenueGarantie) ? `<div class="card"><div class="label">Retenue de garantie</div><div class="value">${a.caution ? 'Caution' : fmt(a.retenueGarantie, 1) + ' %'}</div>
      <div class="sub">${a.caution ? 'Remplacée par une caution bancaire : pas de retenue sur les factures.' : `Retenu à ce jour : ${eur(s.retenues)} TTC`}
      ${!a.caution && s.retenues ? (a.retenueLiberee ? ` · <span class="pos">libérée le ${dateFr(a.retenueLiberee)}</span>` : `<br>${a.dateReception ? `Réception le ${dateFr(a.dateReception)} · libérable le ${dateFr(isoDate(addDays(new Date(a.dateReception), 365)))}` : 'Libérable un an après la réception'} <button class="small secondary" id="liberer">Retenue libérée</button>`) : ''}</div></div>` : ''}
    <div class="card"><div class="label">Marge prévue</div><div class="value">${eur(s.margePrev)}</div><div class="sub">${pct(s.margePrevPct)} au devis</div></div>
    <div class="card"><div class="label">Marge à terminaison</div><div class="value ${signClass(s.margeFin)}">${eur(s.margeFin)}</div><div class="sub">${marginBadge(s.margeFinPct)} ${s.termine ? 'réelle' : 'projetée'}</div></div>
  </div>

  <h2>Pilotage : budget du devis face au réel</h2>
  <div class="table-wrap"><table>
    <tr><th>Poste</th><th class="num">Vendu</th><th class="num">Budget (coût)</th><th class="num">Réel à date</th><th>Consommé</th><th class="num">${s.termine ? 'Final' : 'Projection'}</th><th class="num">Écart</th></tr>
    <tr><td><strong>Fournitures</strong><br><span class="muted small">commandes (au montant facturé une fois rapprochées) + achats hors commande</span></td><td class="num">${eur(s.venteF)}</td><td class="num">${eur(s.budgetF)}</td><td class="num">${eur(s.achats)}</td><td>${gauge(s.achats, s.budgetF)}</td><td class="num">${eur(s.coutFFin)}</td><td class="num ${s.coutFFin > s.budgetF ? 'neg' : 'pos'}">${eur(s.budgetF - s.coutFFin)}</td></tr>
    <tr><td><strong>Main-d'œuvre</strong><br><span class="muted small">${fmt(s.heuresPassees, 1)} h pointées × coût horaire de chaque opérateur</span></td><td class="num">${eur(s.venteMO)}</td><td class="num">${eur(s.budgetMO)}</td><td class="num">${eur(s.coutMO)}</td><td>${gauge(s.coutMO, s.budgetMO)}</td><td class="num">${eur(s.coutMOFin)}</td><td class="num ${s.coutMOFin > s.budgetMO ? 'neg' : 'pos'}">${eur(s.budgetMO - s.coutMOFin)}</td></tr>
    <tr><td>Transport</td><td class="num"></td><td class="num">${eur(s.budgetLiv)}</td><td class="num">${eur(s.budgetLiv)}</td><td></td><td class="num">${eur(s.budgetLiv)}</td><td class="num"></td></tr>
    <tr><td>Notes de frais <span class="muted small">(HT, hors refusées)</span></td><td class="num"></td><td class="num">—</td><td class="num">${eur(s.coutFrais)}</td><td></td><td class="num">${eur(s.coutFrais)}</td><td class="num ${s.coutFrais ? 'neg' : ''}">${s.coutFrais ? eur(-s.coutFrais) : ''}</td></tr>
  </table></div>

  <h2>Heures par catégorie de main-d'œuvre</h2>
  ${Object.keys(s.hByMo).length ? `<div class="table-wrap"><table><tr><th>Catégorie</th><th class="num">Prévues</th><th class="num">Pointées</th><th>Consommé</th><th class="num">Reste</th></tr>
    ${Object.entries(s.hByMo).map(([k, v]) => `<tr><td>${esc(moOf(k).libelle || 'Autre')}</td><td class="num">${fmt(v.prevues, 1)} h</td><td class="num">${fmt(v.passees, 1)} h</td><td>${gauge(v.passees, v.prevues)}</td><td class="num ${v.prevues - v.passees < 0 ? 'neg' : ''}">${fmt(v.prevues - v.passees, 1)} h</td></tr>`).join('')}</table></div>` : '<p class="muted">Pas de budget d\'heures.</p>'}

  <h2>Rapports d'intervention <span class="muted small">${rapports.length}</span></h2>
  ${rapports.length ? `<div class="table-wrap"><table><tr><th>Date</th><th>Rédigé par</th><th>Travaux réalisés</th><th>Observations / besoins</th><th>Photos</th></tr>
    ${rapports.slice(0, 12).map(r => `<tr class="clickable" data-rapport="${r.id}"><td>${dateFr(r.date)}</td><td>${esc(userName(r.userId))}${(r.intervenants || []).length > 1 ? `<br><span class="muted small">+ ${r.intervenants.length - 1} intervenant(s)</span>` : ''}</td>
      <td>${esc((r.travaux || '').slice(0, 140))}${(r.travaux || '').length > 140 ? '…' : ''}</td><td class="small">${esc([r.observations, r.besoins].filter(Boolean).join(' · ').slice(0, 120))}</td>
      <td>${(r.photos || []).slice(0, 3).map(id => `<img class="thumb" src="${fileUrl(id)}" alt="">`).join('')}</td></tr>`).join('')}</table></div>`
  : '<p class="muted">Aucun rapport. Les équipes les rédigent depuis leur téléphone (Pointage › Rapports).</p>'}

  <h2>Réserves et réception</h2>
  <div class="card reception-card">
    ${pvRec ? `<span class="badge b-ok">PV ${esc(pvRec.numero)} signé le ${dateFr(pvRec.date)}</span> ${esc(pvRec.decision)} · signataire ${esc(pvRec.signataireNom)}` : '<span class="badge b-warn">Réception non signée</span>'}
    · ${reservesOuvertes} réserve(s) ouverte(s) sur ${reserves.length}
    <a class="btn small" href="#/reception/${a.id}" style="margin-left:8px">${pvRec ? 'Voir les réserves' : 'Préparer la réception'}</a>
  </div>

  ${achatsChantierHtml(a)}

  <h2>Heures par opérateur</h2>
  ${Object.keys(parOp).length ? `<div class="table-wrap"><table><tr><th>Opérateur</th><th>Catégorie</th><th class="num">Heures</th><th class="num">Coût</th></tr>
    ${Object.entries(parOp).sort((x, y) => y[1] - x[1]).map(([uid, h]) => `<tr><td>${esc(userName(uid))}</td><td>${esc(moOf((Store.get('users', uid) || {}).categorieId).libelle || '')}</td><td class="num">${fmt(h, 1)} h</td><td class="num">${eur(h * Calc.tauxUser(uid))}</td></tr>`).join('')}</table></div>` : '<p class="muted">Aucune heure pointée.</p>'}

  <h2>Situations de travaux et factures</h2>
  ${sits.length ? `<div class="table-wrap"><table><tr><th>Situation</th><th>Date</th><th>Statut</th><th class="num">Avancement cumulé</th><th class="num">Montant HT</th><th>Facture</th></tr>
    ${sits.map(x => { const c = Calc.situation(x), f = Store.get('factures', x.factureId); return `<tr class="clickable" onclick="location.hash='#/situations/${x.id}'"><td>n° ${situationRang(x)} · ${esc(x.numero || '…')}</td><td>${dateFr(x.date)}</td><td>${badge(x.statut)}</td><td class="num">${pct(c.pctCumul)}</td><td class="num">${eur(c.montant)}</td><td>${f ? `${esc(f.numero)} ${badge(f.statut)}` : ''}</td></tr>`; }).join('')}</table></div>`
  : '<p class="muted">Aucune situation. Utilisez « + Situation de travaux » pour proposer l\'avancement à la maîtrise d\'œuvre.</p>'}

  <h2>Notes de frais imputées</h2>
  ${frais.length ? `<div class="table-wrap"><table><tr><th>N°</th><th>Date</th><th>Personne</th><th>Catégorie</th><th>Description</th><th>Statut</th><th class="num">TTC</th></tr>
    ${frais.map(n => `<tr><td>${esc(n.numero || '')}</td><td>${dateFr(n.date)}</td><td>${esc(userName(n.userId))}</td><td>${esc(n.categorie)}</td><td>${esc(n.description)}</td><td>${badge(n.statut)}</td><td class="num">${eur(n.montantTTC)}</td></tr>`).join('')}</table></div>` : '<p class="muted">Aucune note de frais.</p>'}

  <h2>Retour d'expérience (REX)</h2>
  <div class="card">
    <div class="grid2">
      <div class="field"><label for="rex-note">Note globale (1 à 5)</label><select id="rex-note">${['', 1, 2, 3, 4, 5].map(n => `<option ${String(n) === String(rex.note ?? '') ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="field" style="grid-column:1/-1"><label for="rex-positif">Points positifs</label><textarea id="rex-positif">${esc(rex.positif)}</textarea></div>
      <div class="field" style="grid-column:1/-1"><label for="rex-negatif">Points négatifs / difficultés</label><textarea id="rex-negatif">${esc(rex.negatif)}</textarea></div>
      <div class="field" style="grid-column:1/-1"><label for="rex-actions">Actions d'amélioration (à reporter sur les prochains chiffrages)</label><textarea id="rex-actions">${esc(rex.actions)}</textarea></div>
    </div>
    <div class="modal-actions"><button id="rex-save">Enregistrer le REX</button></div>
  </div>`;
};
Views.chantier.bind = (root, params) => {
  const a = Store.get('affaires', params[0]);
  if (!a) return;
  if (estHorsDevis(a)) return bindHorsDevis(root, a);
  root.querySelector('#edit').onclick = () => editModal({ title: `Chantier ${a.code}`, col: 'affaires', fields: chantierFields, obj: { ...a },
    onDelete: () => { location.hash = '#/chantiers'; } });
  root.querySelectorAll('[data-rapport]').forEach(tr => tr.onclick = () => voirRapport(Store.get('rapports', tr.dataset.rapport)));
  const lib = root.querySelector('#liberer');
  if (lib) lib.onclick = () => ask(`Le client a reversé la retenue de garantie (${eur(Calc.affaire(a).retenues)} TTC) ?`, 'Retenue libérée', false).then(ok => {
    if (ok) { a.retenueLiberee = isoDate(new Date()); Store.upsert('affaires', a); App.render(); }
  });
  const sb = root.querySelector('#situation');
  if (sb) sb.onclick = () => { const x = nouvelleSituation(a.id); if (x) location.hash = `#/situations/${x.id}`; };
  root.querySelector('#rex-save').onclick = () => {
    a.rex = { note: root.querySelector('#rex-note').value, positif: root.querySelector('#rex-positif').value,
      negatif: root.querySelector('#rex-negatif').value, actions: root.querySelector('#rex-actions').value };
    Store.upsert('affaires', a);
    App.toast('REX enregistré');
  };
};

/* ---------------- Factures et avoirs ---------------- */
const STATUTS_FACTURE = ['Émise', 'Payée', 'En retard', 'Annulée'];
const STATUTS_AVOIR = ['Émis', 'Imputé', 'Remboursé'];
const estAvoir = f => f.type === 'avoir';
const FILTRES_FACTURES = { q: '', client: '', charge: '', statut: '' };
const statutFacture = f => (estAvoir(f) ? f.statut : !['Payée', 'Annulée'].includes(f.statut) && f.echeance < isoDate(new Date()) ? 'En retard' : f.statut);
Views.factures = (params, query) => {
  const f0 = lireFiltres('factures', query, FILTRES_FACTURES);
  const list = Store.all('factures').filter(f => (!f0.client || docClientId(f) === f0.client) && (!f0.charge || docChargeId(f) === f0.charge)
    && (!f0.statut || (f0.statut === 'impayees' ? Calc.resteDu(f) > 0 : f0.statut === 'avoirs' ? estAvoir(f) : f0.statut === 'factures' ? !estAvoir(f) : statutFacture(f) === f0.statut))
    && correspond(f0.q, f.numero, f.objet, clientName(docClientId(f)), affaireOf(f.affaireId).code, f.refCommande))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.numero || '~').localeCompare(a.numero || '~'));
  const statuts = [['', 'Factures et avoirs'], ['factures', 'Factures'], ['avoirs', 'Avoirs'], ['impayees', 'Reste dû'], ...STATUTS_FACTURE.map(s => [s, s])];
  return `<h1>Facturation</h1>${facturationTabs('factures')}
  <p class="muted">Les factures de situation sont générées quand un BL est accepté par la maîtrise d'œuvre. Une facture n'est jamais supprimée : pour l'annuler ou la corriger, établissez un avoir depuis la facture.</p>
  ${barreFiltres(f0, { clients: [...new Set(Store.all('factures').map(docClientId))], statuts, defauts: FILTRES_FACTURES })}
  <p class="muted small">${list.length} document(s) · ${eur(sumBy(list, f => Calc.facture(f).ht))} HT (avoirs déduits) · reste dû ${eur(sumBy(list, f => Calc.resteDu(f)))} TTC</p>
  ${list.length ? `<div class="table-wrap"><table><tr><th>N°</th><th>Date</th><th>Échéance</th><th>Chantier</th><th>Client</th><th>Statut</th><th class="num">Total HT</th><th class="num">Total TTC</th><th class="num">Reste dû</th><th>Compta</th></tr>
  ${list.map(f => {
    const a = affaireOf(f.affaireId), t = Calc.facture(f), orig = estAvoir(f) && Store.get('factures', f.factureId);
    return `<tr class="clickable ${estAvoir(f) ? 'ligne-avoir' : ''}" onclick="location.hash='#/facture/${f.id}'"><td>${esc(f.numero || '…')}${estAvoir(f) ? ` <span class="badge b-warn">Avoir</span>${orig ? `<br><span class="muted small">sur ${esc(orig.numero || '')}</span>` : ''}` : ''}</td><td>${dateFr(f.date)}</td><td>${estAvoir(f) ? '' : dateFr(f.echeance)}</td><td>${esc(a.code || '')}</td><td>${esc(clientName(docClientId(f)))}</td>
      <td>${badge(statutFacture(f))}${!estAvoir(f) && Calc.avoirsDe(f).length ? `<br><span class="muted small">${Calc.avoirsDe(f).length} avoir(s)</span>` : ''}</td><td class="num">${eur(t.ht)}</td><td class="num">${eur(t.ttc)}</td>
      <td class="num">${estAvoir(f) ? '' : eur(Calc.resteDu(f))}${t.retenue ? `<br><span class="muted small">RG ${eur(t.retenueS)}</span>` : ''}</td><td>${f.exportCompta ? `<span class="badge b-ok" title="Transmis le ${dateFr(f.exportCompta.date)}">Transmis</span>` : ''}</td></tr>`;
  }).join('')}</table></div>` : '<p class="muted">Aucune facture pour ces critères.</p>'}`;
};

Views.factures.bind = (root, params, query) => bindFiltres(root, 'factures', lireFiltres('factures', query, FILTRES_FACTURES), FILTRES_FACTURES);

Views.facture = params => {
  const f = Store.get('factures', params[0]);
  if (!f) return '<p>Facture introuvable.</p>';
  const av = estAvoir(f), orig = av && Store.get('factures', f.factureId), avoirs = av ? [] : Calc.avoirsDe(f);
  const reste = Calc.resteDu(f), dejaCredite = sumBy(avoirs, a => Calc.doc(a).netAPayer);
  return `<div class="toolbar">
    <a href="#/factures" class="btn secondary">← Factures</a>
    ${f.affaireId ? `<a href="#/chantier/${f.affaireId}" class="btn secondary">Chantier</a>` : ''}
    ${orig ? `<a href="#/facture/${orig.id}" class="btn secondary">Facture ${esc(orig.numero || '')}</a>` : ''}
    <span class="spacer"></span>
    <select id="f-statut" style="width:auto" aria-label="Statut">${optionsStr(av ? STATUTS_AVOIR : STATUTS_FACTURE, f.statut)}</select>
    <button class="secondary print-btn" onclick="window.print()">Imprimer</button>${boutonsEnvoi(av ? 'avoir' : 'facture', f.id)}
    ${['admin', 'charge'].includes(Store.me.role) ? `<button class="secondary" data-efacture="${f.id}">Facture électronique</button>` : ''}
    ${!av && f.statut !== 'Annulée' && Store.can('write', 'factures') ? '<button class="secondary" id="avoir">Créer un avoir</button>' : ''}
  </div>
  <h1 class="no-print">${av ? 'Avoir' : 'Facture'} ${esc(f.numero || '')} ${badge(statutFacture(f))}${f.exportCompta ? ` <span class="badge b-ok">Transmis au comptable le ${dateFr(f.exportCompta.date)}</span>` : ''}</h1>${envoisHtml('factures', f.id)}
  ${avoirs.length ? `<div class="card no-print avoirs-card"><strong>Avoirs sur cette facture</strong>
    <ul>${avoirs.map(a => `<li><a href="#/facture/${a.id}">${esc(a.numero || '…')}</a> du ${dateFr(a.date)} · ${eur(Calc.doc(a).netAPayer)} TTC${a.motif ? ` · ${esc(a.motif)}` : ''} ${badge(a.statut)}</li>`).join('')}</ul>
    <div class="small">Facture ${eur(Calc.doc(f).netAPayer)} − avoirs ${eur(dejaCredite)} = <strong>reste dû ${eur(reste)}</strong></div></div>` : ''}
  <div class="doc-print feuille">
    ${factureDocument(f)}
  </div>`;
};
// Mentions obligatoires des factures depuis la réforme de la facturation électronique (2026)
function mentionsReforme(f, o) {
  if (!o.mentions2026) return '';
  const siren = String(entreprise(docClientId(f)).siret || '').replace(/\D/g, '').slice(0, 9);
  return `<p class="doc-conditions">Catégorie de l'opération : prestation de services${siren ? ` · SIREN du client : ${esc(siren)}` : ''} · TVA acquittée sur les encaissements.</p>`;
}
function factureDocument(f) {
  const type = estAvoir(f) ? 'avoir' : 'facture', o = Doc.t(type), dv = Store.get('devis', f.devisId), sit = Store.get('situations', f.situationId);
  if (estAvoir(f)) {
    const orig = Store.get('factures', f.factureId);
    const refs = o.references && orig ? `<p class="doc-conditions"><strong>Avoir sur la facture ${esc(orig.numero || '')} du ${dateFr(orig.date)}</strong>${f.motif ? ` · motif : ${esc(f.motif)}` : ''}.</p>` : (f.motif ? `<p class="doc-conditions">Motif : ${esc(f.motif)}</p>` : '');
    return `${docHeader(f, 'avoir')}${docLinesClient(f, 'avoir')}${totalsTable(f, 'avoir')}${Doc.pied('avoir', refs + mentionsReforme(f, o))}`;
  }
  const refs = o.references && dv ? `<p class="doc-conditions">Selon devis ${esc(dv.numero || '')}${sit ? ` et situation de travaux ${esc(sit.numero || '')} acceptée` : ''}.</p>` : '';
  return `${docHeader(f, 'facture')}${docLinesClient(f, 'facture')}${totalsTable(f, 'facture')}
    ${Doc.pied('facture', `<p class="doc-conditions"><strong>Échéance de paiement : ${dateFr(f.echeance)}</strong></p>${refs}${mentionsReforme(f, o)}`)}`;
}
Views.facture.bind = (root, params) => {
  const f = Store.get('factures', params[0]);
  if (!f) return;
  root.querySelector('#f-statut').onchange = e => { f.statut = e.target.value; Store.upsert('factures', f); App.toast('Statut mis à jour'); App.render(); };
  const b = root.querySelector('#avoir');
  if (b) b.onclick = () => creerAvoir(f);
};

// Avoir total (annule la facture) ou partiel (lignes et quantités choisies, ou montant libre)
function creerAvoir(f) {
  const lignes = (f.lignes || []).map((l, i) => ({ l, i })).filter(x => Calc.estPrix(x.l));
  const deja = sumBy(Calc.avoirsDe(f), a => Calc.doc(a).netAPayer), net = Calc.doc(f).netAPayer;
  const box = Modal.open(`<h2 style="margin-top:0">Avoir sur la facture ${esc(f.numero || '')}</h2>
    <p class="muted small">Facture ${eur(net)} TTC${deja ? ` · déjà ${eur(deja)} en avoirs` : ''}. L'avoir reçoit son propre numéro dans la suite des avoirs ; la facture n'est ni modifiée ni supprimée.</p>
    <div class="seg" role="group" aria-label="Type d'avoir" style="margin-bottom:10px">${[['total', 'Avoir total (annule la facture)'], ['lignes', 'Partiel : lignes'], ['montant', 'Partiel : montant']].map(([k, l], i) => `<button type="button" data-mode="${k}" class="${i ? '' : 'on'}">${l}</button>`).join('')}</div>
    <div data-pane="lignes" hidden><div class="table-wrap"><table><tr><th>Désignation</th><th class="num">Facturé</th><th class="num">Qté à créditer</th><th class="num">PU HT</th></tr>
      ${lignes.map(({ l, i }) => `<tr><td>${esc(l.designation)}</td><td class="num">${fmt(l.qte, 2)} ${esc(l.unite || '')}</td><td class="num"><input type="number" step="any" min="0" max="${esc(l.qte)}" data-qi="${i}" value="0" style="width:90px"></td><td class="num">${eur(Calc.pu(l))}</td></tr>`).join('')}</table></div></div>
    <div data-pane="montant" hidden><div class="grid2"><div class="field"><label for="av-lib">Libellé</label><input id="av-lib" value="Geste commercial"></div>
      <div class="field"><label for="av-ht">Montant HT</label><input id="av-ht" type="number" step="0.01" min="0"></div>
      ${!f.autoliquidation && Calc.doc(f).ventilation.length > 1 ? `<div class="field"><label for="av-tva">TVA</label><select id="av-tva">${Calc.doc(f).ventilation.map(v => `<option value="${v.taux}">${libTaux(v.taux)}</option>`).join('')}</select></div>` : ''}</div></div>
    <div class="field"><label for="av-motif">Motif (figure sur l'avoir)</label><input id="av-motif" list="av-motifs" placeholder="Erreur de facturation, geste commercial, travaux non réalisés…">
      <datalist id="av-motifs">${['Erreur de facturation', 'Annulation de la facture', 'Geste commercial', 'Travaux non réalisés', 'Réfaction suite à réserve', 'Remise de fin d\'année'].map(m => `<option value="${m}">`).join('')}</datalist></div>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="av-annuler">Annuler</button><button id="av-ok">Créer l'avoir</button></div>`);
  let mode = 'total';
  box.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    mode = b.dataset.mode;
    box.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
    box.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== mode; });
  });
  box.querySelector('#av-annuler').onclick = Modal.close;
  box.querySelector('#av-ok').onclick = () => {
    const { id, _v, _at, _by, numero, exportCompta, statut, ...base } = f;
    let nouv;
    if (mode === 'total') nouv = { ...base, lignes: JSON.parse(JSON.stringify(f.lignes || [])) };
    else if (mode === 'lignes') {
      const choisies = [...box.querySelectorAll('[data-qi]')].map(el => ({ l: f.lignes[+el.dataset.qi], q: Math.min(num(el.value), num(f.lignes[+el.dataset.qi].qte)) })).filter(x => x.q > 0);
      if (!choisies.length) return notify('Indiquez au moins une quantité à créditer.');
      nouv = { ...base, lignes: choisies.map(x => ({ ...JSON.parse(JSON.stringify(x.l)), qte: x.q })), zoneId: '', livraisonManuelle: null };
    } else {
      const ht = num(box.querySelector('#av-ht').value);
      if (!(ht > 0)) return notify('Indiquez le montant HT de l\'avoir.');
      const tv = box.querySelector('#av-tva');
      nouv = { ...base, lignes: [{ designation: box.querySelector('#av-lib').value || 'Avoir', unite: 'forfait', qte: 1, pu: ht, ...(tv ? { tva: num(tv.value) } : {}) }], ajustements: [], zoneId: '', livraisonManuelle: null };
    }
    Object.assign(nouv, { type: 'avoir', factureId: f.id, numero: '', date: isoDate(new Date()), statut: 'Émis', motif: box.querySelector('#av-motif').value.trim() || (mode === 'total' ? 'Annulation de la facture' : ''), echeance: '' });
    if (nouv.objet) nouv.objet = `Avoir sur facture ${f.numero} – ${nouv.objet}`;
    if (Calc.doc(nouv).netAPayer > net - deja + 0.01) return notify(`L'avoir (${eur(Calc.doc(nouv).netAPayer)}) dépasse ce qui reste à créditer sur la facture (${eur(net - deja)}).`);
    const a = Store.upsert('factures', nouv);
    if (mode === 'total' || Calc.doc(nouv).netAPayer >= net - deja - 0.01) { f.statut = 'Annulée'; Store.upsert('factures', f); }
    Modal.close(); location.hash = `#/facture/${a.id}`; App.toast('Avoir créé');
  };
}

/* ---------------- Planning ---------------- */
function planningCharge(query) {
  const offset = +(query.get('o') || 0);
  const start = addDays(mondayOf(new Date()), (offset - 2) * 7);
  const weeks = Array.from({ length: 8 }, (_, i) => isoWeek(addDays(start, i * 7)));
  const current = isoWeek(new Date());
  const users = Store.all('users');
  const plan = Store.all('planning'), temps = Store.all('temps');
  const passe = (uid, wk) => sumBy(temps.filter(t => t.userId === uid && isoWeek(new Date(t.date)) === wk), t => num(t.heures));
  const canEdit = Store.me.role !== 'atelier';

  const grid = users.map(u => `<tr><td><strong>${esc(u.nom)}</strong><br><span class="muted small">${esc(u.role === 'charge' ? "Chargé d'affaires" : moOf(u.categorieId).libelle || '')} · ${fmt(u.capaciteHebdo)} h</span></td>
    ${weeks.map(wk => {
      const items = plan.filter(p => p.userId === u.id && semaineDe(p) === wk);
      const h = sumBy(items, p => num(p.heuresPrevues));
      const r = num(u.capaciteHebdo) ? h / num(u.capaciteHebdo) : 0;
      const cls = !h ? 'load-0' : r > 1 ? 'load-over' : r > 0.85 ? 'load-high' : 'load-ok';
      const real = passe(u.id, wk);
      return `<td class="plan-cell ${cls}" ${canEdit ? `data-u="${u.id}" data-w="${wk}" style="cursor:pointer"` : ''} title="${esc(items.map(p => `${affaireOf(p.affaireId).code} : ${p.heuresPrevues} h – ${p.libelle || ''}`).join('\n'))}">
        <strong>${h ? fmt(h) + ' h' : '·'}</strong>${h ? `<br><span class="muted">${fmt(r * 100)} %</span>` : ''}${real ? `<br><span class="muted">pointé ${fmt(real, 1)} h</span>` : ''}</td>`;
    }).join('')}</tr>`).join('');

  return `<h1>Planning</h1>${planningTabs('charge')}
  <div class="toolbar">
    <button class="secondary" onclick="location.hash='#/planning/charge?o=${offset - 4}'">◀ 4 sem.</button>
    <button class="secondary" onclick="location.hash='#/planning/charge'">Aujourd'hui</button>
    <button class="secondary" onclick="location.hash='#/planning/charge?o=${offset + 4}'">4 sem. ▶</button>
    <span class="spacer"></span>
    <span class="badge load-ok">≤ 85 %</span><span class="badge load-high">85–100 %</span><span class="badge load-over">&gt; 100 %</span>
  </div>
  <p class="muted">${canEdit ? 'Cliquez sur une case pour affecter des heures sur un chantier (charge globale de la semaine ; le détail jour par jour se fait dans l\'onglet Équipes). ' : ''}« pointé » = heures réellement pointées la semaine concernée.</p>
  <div class="table-wrap"><table><tr><th>Personne</th>${weeks.map(w => `<th class="plan-cell ${w === current ? 'today' : ''}">${w.replace('-W', ' S')}</th>`).join('')}</tr>${grid}</table></div>

  <h2>Reste à planifier par chantier</h2>
  <div class="table-wrap"><table><tr><th>Chantier</th><th class="num">Budget</th><th class="num">Pointé</th><th class="num">Reste à faire</th><th>Consommé</th><th class="num">Planifié à venir</th><th class="num">Reste à planifier</th></tr>
  ${chantiersActifs().map(a => {
    const s = Calc.affaire(a);
    const reste = s.heuresPrevues - s.heuresPassees;
    const futur = sumBy(plan.filter(p => p.affaireId === a.id && (p.date ? p.date > isoDate(new Date()) : p.semaine > current)), p => num(p.heuresPrevues));
    const aPlanifier = reste - futur;
    return `<tr class="clickable" onclick="location.hash='#/chantier/${a.id}'"><td>${esc(affaireLabel(a))}</td><td class="num">${fmt(s.heuresPrevues)} h</td><td class="num">${fmt(s.heuresPassees, 1)} h</td>
      <td class="num ${reste < 0 ? 'neg' : ''}">${fmt(reste, 1)} h</td><td>${gauge(s.heuresPassees, s.heuresPrevues)}</td><td class="num">${fmt(futur)} h</td><td class="num ${aPlanifier > 0 ? 'neg' : ''}">${aPlanifier > 0 ? fmt(aPlanifier, 1) + ' h' : '—'}</td></tr>`;
  }).join('')}</table></div>`;
}
function bindPlanningCharge(root) {
  root.querySelectorAll('td[data-u]').forEach(td => td.onclick = () => planningCell(td.dataset.u, td.dataset.w));
}

function planningCell(userId, semaine) {
  const items = Store.all('planning').filter(p => p.userId === userId && p.semaine === semaine && !p.date);
  const affs = chantiersActifs();
  const box = Modal.open(`<h2 style="margin-top:0">${esc(userName(userId))} – ${esc(semaine)}</h2>
    <table><tr><th>Chantier</th><th>Tâche</th><th class="num">Heures</th><th></th></tr>
    ${items.map(p => `<tr data-id="${p.id}"><td><select data-k="affaireId">${options(Store.all('affaires'), p.affaireId, affaireLabel, false)}</select></td><td><input data-k="libelle" value="${esc(p.libelle)}"></td><td><input data-k="heuresPrevues" type="number" step="0.5" value="${esc(p.heuresPrevues)}" style="width:90px"></td><td><button class="small danger" data-del="${p.id}">✕</button></td></tr>`).join('')}
    <tr><td><select id="n-aff">${options(affs, '', affaireLabel, false)}</select></td><td><input id="n-lib" placeholder="Tâche"></td><td><input id="n-h" type="number" step="0.5" style="width:90px"></td><td><button class="small" id="n-add">+</button></td></tr>
    </table>
    <div class="modal-actions"><button id="close">Fermer</button></div>`);
  const refresh = () => { App.render(); planningCell(userId, semaine); };
  box.querySelectorAll('tr[data-id] [data-k]').forEach(el => el.onchange = () => {
    const p = Store.get('planning', el.closest('tr').dataset.id);
    p[el.dataset.k] = el.dataset.k === 'heuresPrevues' ? +el.value : el.value;
    Store.upsert('planning', p); App.render();
  });
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { Store.remove('planning', b.dataset.del); refresh(); });
  box.querySelector('#n-add').onclick = () => {
    const h = +box.querySelector('#n-h').value;
    if (!h || !box.querySelector('#n-aff').value) return;
    Store.upsert('planning', { userId, semaine, affaireId: box.querySelector('#n-aff').value, libelle: box.querySelector('#n-lib').value, heuresPrevues: h });
    refresh();
  };
  box.querySelector('#close').onclick = Modal.close;
}

/* ---------------- Analyse & REX ---------------- */
Views.analyse = (params, query) => {
  const fc = query.get('charge') || '';
  const affaires = Store.all('affaires').filter(a => !fc || a.chargeId === fc);
  const rows = affaires.map(a => ({ a, s: Calc.affaire(a) })).sort((x, y) => x.s.margeFinPct - y.s.margeFinPct);
  const rex = Store.all('affaires').filter(a => a.rex && (a.rex.negatif || a.rex.actions || a.rex.positif) && (!fc || a.chargeId === fc));
  return `<h1>Analyse de rentabilité &amp; retour d'expérience</h1>
  <div class="toolbar">
    <select id="fc" style="width:auto"><option value="">Tous les chargés d'affaires</option>${options(charges(), fc, undefined, false)}</select>
    <span class="spacer"></span><button class="secondary dl-btn" id="csv">Export CSV</button>
  </div>

  <h2>Par chargé d'affaires</h2>
  <div class="table-wrap"><table><tr><th>Chargé d'affaires</th><th class="num">Devis</th><th class="num">En attente</th><th class="num">Transfo.</th><th class="num">Chantiers</th><th class="num">CA</th><th class="num">Marge à term.</th><th class="num">Marge %</th><th class="num">Heures pointé / prévu</th><th class="num">Écart heures</th><th class="num">Note REX</th></tr>
  ${charges().filter(u => !fc || u.id === fc).map(u => {
    const c = Calc.charge(u.id);
    return `<tr class="clickable" onclick="location.hash='#/analyse?charge=${u.id}'"><td>${esc(u.nom)}</td><td class="num">${c.nbDevis}</td><td class="num">${eur(c.enAttente)}</td><td class="num">${pct(c.transfo)}</td><td class="num">${c.nbAffaires}</td><td class="num">${eur(c.ca)}</td><td class="num ${signClass(c.marge)}">${eur(c.marge)}</td><td class="num">${marginBadge(c.margePct)}</td><td class="num">${fmt(c.hPass)} / ${fmt(c.hPrev)} h</td><td class="num ${c.ecartPct > 0 ? 'neg' : 'pos'}">${c.ecartPct > 0 ? '+' : ''}${pct(c.ecartPct)}</td><td class="num">${c.noteMoy ? fmt(c.noteMoy, 1) + ' / 5' : '—'}</td></tr>`;
  }).join('')}</table></div>

  <h2>Par chantier (du moins rentable au plus rentable)</h2>
  <div class="table-wrap"><table><tr><th>Chantier</th><th>Chargé</th><th>Statut</th><th class="num">Montant</th><th class="num">Fournitures budget / réel</th><th class="num">MO budget / réel</th><th class="num">Écart heures</th><th class="num">Marge prévue</th><th class="num">À terminaison</th></tr>
  ${rows.map(({ a, s }) => `<tr class="clickable" onclick="location.hash='#/chantier/${a.id}'"><td>${esc(affaireLabel(a))}</td><td>${esc(userName(a.chargeId))}</td><td>${badge(a.statut)}</td><td class="num">${eur(s.caDevis)}</td>
    <td class="num">${eur(s.budgetF)}<br><span class="${s.coutFFin > s.budgetF ? 'neg' : 'muted'}">${eur(s.coutFFin)}</span></td><td class="num">${eur(s.budgetMO)}<br><span class="${s.coutMOFin > s.budgetMO ? 'neg' : 'muted'}">${eur(s.coutMOFin)}</span></td>
    <td class="num ${s.ecartHeures > 0 ? 'neg' : 'pos'}">${s.heuresPrevues ? (s.ecartHeures > 0 ? '+' : '') + pct(s.ecartHeuresPct) : '—'}</td><td class="num">${pct(s.margePrevPct)}</td><td class="num">${marginBadge(s.margeFinPct)}</td></tr>`).join('')}
  </table></div>

  ${(() => {
    const refuses = Store.all('devis').filter(d => d.statut === 'Refusé' && (!fc || docChargeId(d) === fc));
    if (!refuses.length) return '';
    const par = {};
    refuses.forEach(d => { const k = d.motifRefus || 'Non renseigné'; (par[k] = par[k] || []).push(d); });
    return `<h2>Devis refusés par motif</h2><div class="table-wrap"><table><tr><th>Motif</th><th class="num">Nombre</th><th class="num">Montant HT</th><th>Devis</th></tr>
      ${Object.entries(par).sort((x, y) => y[1].length - x[1].length).map(([m, l]) => `<tr><td>${esc(m)}</td><td class="num">${l.length}</td><td class="num">${eur(sumBy(l, d => Calc.doc(d).totalHT))}</td>
        <td>${l.map(d => `<a href="#/devis/${d.id}">${esc(d.numero || '')}</a>${d.commentaireRefus ? ` <span class="muted small">${esc(d.commentaireRefus)}</span>` : ''}`).join('<br>')}</td></tr>`).join('')}</table></div>`;
  })()}

  <h2>Capitalisation des retours d'expérience</h2>
  ${rex.length ? `<div class="table-wrap"><table><tr><th>Chantier</th><th>Chargé</th><th>Note</th><th>Points positifs</th><th>Points négatifs</th><th>Actions</th></tr>
    ${rex.map(a => `<tr class="clickable" onclick="location.hash='#/chantier/${a.id}'"><td>${esc(affaireLabel(a))}</td><td>${esc(userName(a.chargeId))}</td><td>${a.rex.note ? esc(a.rex.note) + '/5' : '—'}</td><td>${esc(a.rex.positif)}</td><td>${esc(a.rex.negatif)}</td><td>${esc(a.rex.actions)}</td></tr>`).join('')}
  </table></div>` : '<p class="muted">Aucun REX saisi.</p>'}`;
};
Views.analyse.bind = root => {
  root.querySelector('#fc').onchange = e => { location.hash = `#/analyse?charge=${e.target.value}`; };
  root.querySelector('#csv').onclick = () => download('analyse-chantiers.csv', toCSV([
    ['Code', 'Chantier', 'Client', 'Charge', 'Statut', 'Montant', 'BudgetFournitures', 'FournituresFin', 'BudgetMO', 'MOFin', 'HeuresPrevues', 'HeuresPointees', 'MargePrevPct', 'MargeFinPct', 'NoteREX'],
    ...Store.all('affaires').map(a => { const s = Calc.affaire(a); return [a.code, a.nom, clientName(a.clientId), userName(a.chargeId), a.statut,
      s.caDevis.toFixed(2), s.budgetF.toFixed(2), s.coutFFin.toFixed(2), s.budgetMO.toFixed(2), s.coutMOFin.toFixed(2),
      s.heuresPrevues.toFixed(1), s.heuresPassees, s.margePrevPct.toFixed(1), s.margeFinPct.toFixed(1), (a.rex || {}).note || '']; })]), 'text/csv');
};

/* ---------------- Paramètres ---------------- */
const settingsFields = [
  { key: 'societe', label: 'Société' },
  { key: 'adresse', label: 'Adresse' },
  { key: 'siret', label: 'SIRET' },
  { key: 'tva', label: 'TVA %', type: 'number', step: '0.1' },
  { key: 'delaiPaiement', label: 'Délai de paiement (jours)', type: 'number' },
  { key: 'dureeHebdo', label: 'Durée hebdomadaire de travail (h)', type: 'number', step: '0.5' },
  { key: 'seuilHS50', label: 'Heures sup. majorées à 50 % au-delà de (h/semaine)', type: 'number', step: '0.5' },
  { key: 'montantPanier', label: 'Montant du panier repas (€)', type: 'number', step: '0.01' },
];
const userFields = [
  { key: 'nom', label: 'Nom' },
  { key: 'role', label: 'Rôle', type: 'select', options: v => `<option value="charge" ${v === 'charge' ? 'selected' : ''}>Chargé d'affaires</option><option value="atelier" ${v === 'atelier' ? 'selected' : ''}>Opérateur</option>` },
  { key: 'type', label: 'Statut', type: 'select', options: v => `<option value="salarie" ${v !== 'interimaire' ? 'selected' : ''}>Salarié</option><option value="interimaire" ${v === 'interimaire' ? 'selected' : ''}>Intérimaire</option>` },
  { key: 'agenceId', label: "Agence d'intérim", type: 'select', options: v => options(fournisseursList(), v) },
  { key: 'chefId', label: "Chef d'équipe (peut pointer pour cette personne)", type: 'select', options: v => options(Store.all('users').filter(u => u.role !== 'charge'), v) },
  { key: 'categorieId', label: "Catégorie de main-d'œuvre", type: 'select', options: v => options(moList(), v, m => m.libelle) },
  { key: 'tauxHoraire', label: 'Coût horaire chargé €/h (rentabilité)', type: 'number', step: '0.5' },
  { key: 'salaireHoraire', label: 'Salaire horaire brut €/h (paie)', type: 'number', step: '0.01' },
  { key: 'capaciteHebdo', label: 'Capacité hebdomadaire (h)', type: 'number' },
  { key: 'email', label: 'E-mail professionnel (copie des envois, signature)', type: 'email' },
  { key: 'tel', label: 'Téléphone professionnel (signature des e-mails)', type: 'tel' },
];
Views.parametres = () => {
  const admin = Store.can('admin');
  return `<h1>Paramètres</h1>
  <h2>Mon compte</h2>
  <div class="card">
    <p class="muted" style="margin-top:0">Connecté en tant que <strong>${esc(Store.me.login)}</strong> (${esc(ROLE_LABELS[Store.me.role])}).</p>
    <div class="grid2">
      <div class="field"><label>Mot de passe actuel</label><input id="pw-cur" type="password" autocomplete="current-password"></div>
      <div class="field"><label>Nouveau mot de passe (8 caractères min.)</label><input id="pw-new" type="password" autocomplete="new-password"></div>
      <div class="field"><label>&nbsp;</label><button id="pw-save">Changer le mot de passe</button></div>
    </div>
  </div>
  ${admin ? `
  <h2>Société</h2>
  <div class="card">${formFields(settingsFields, Store.data.settings)}<div class="modal-actions"><button id="s-save">Enregistrer</button></div></div>

  <h2>Documents</h2>
  <div class="card inline" style="justify-content:space-between;flex-wrap:wrap"><span>Logo, couleur, coordonnées, RIB, mentions légales et éléments affichés sur les devis, factures, BL, bons de commande, attachements, bons d'intervention et PV.</span>
    <a class="btn" href="#/documents">Mise en page des documents</a></div>
  <div class="card inline" style="justify-content:space-between;flex-wrap:wrap;margin-top:10px"><span>Modèles d'e-mails (devis, factures, BL, demandes de prix, commandes…) et connexion Microsoft 365 pour envoyer depuis le CRM avec copie dans les éléments envoyés.</span>
    <a class="btn" href="#/mails">E-mails et Microsoft 365</a></div>
  <div class="card inline" style="justify-content:space-between;flex-wrap:wrap;margin-top:10px"><span>API et webhooks pour automatiser : Power Automate, Make, Zapier, scripts, badgeuse, logiciel de dessin, Power BI…</span>
    <a class="btn" href="#/api">API et automatisations</a></div>
  <div class="card inline" style="justify-content:space-between;flex-wrap:wrap;margin-top:10px"><span>📲 Appli téléphone des compagnons : planning, pointage et notifications dès que leur planning change.</span>
    <a class="btn" href="#/notifications?installer=1">Appli téléphone</a></div>

  ${numerotationCarte()}

  <h2>Comptes utilisateurs</h2>
  <p class="muted">Administrateur : tout. Chargé d'affaires : contacts, devis, chantiers, commandes, factures, planning, RH (pas de suppression de facture). Opérateur : pointage de ses propres heures et consultation du planning. Liez chaque compte opérateur à sa fiche dans « Équipe ».</p>
  <div class="toolbar"><button id="acc-add">+ Compte</button></div>
  <div class="table-wrap"><table id="accounts"><tr><td class="muted">Chargement…</td></tr></table></div>` : ''}

  ${Store.can('write', 'users') ? `
  <h2>Équipe</h2>
  <div class="toolbar"><button id="u-add">+ Personne</button></div>
  <div class="table-wrap"><table><tr><th>Nom</th><th>Rôle</th><th>Statut</th><th>Chef d'équipe</th><th>Catégorie</th><th class="num">Coût horaire</th><th class="num">Salaire brut</th><th class="num">Capacité / sem.</th></tr>
  ${Store.all('users').map(u => `<tr class="clickable" data-id="${u.id}"><td>${esc(u.nom)}</td><td>${u.role === 'charge' ? "Chargé d'affaires" : 'Opérateur'}</td><td>${u.type === 'interimaire' ? `<span class="badge b-warn">Intérimaire</span> ${esc(u.agenceId ? clientName(u.agenceId) : '')}` : 'Salarié'}</td><td>${u.chefId ? esc(userName(u.chefId)) : ''}</td><td>${esc(moOf(u.categorieId).libelle || '')}</td><td class="num">${eur(u.tauxHoraire)}</td><td class="num">${num(u.salaireHoraire) ? eur(u.salaireHoraire) : '—'}</td><td class="num">${fmt(u.capaciteHebdo)} h</td></tr>`).join('')}
  </table></div>` : ''}

  ${Store.me.role !== 'atelier' ? `
  <h2>Données</h2>
  <p class="muted">Les données sont stockées sur le serveur et partagées par tous les utilisateurs. ${admin ? "Sauvegarde complète : copier le fichier de base de données du serveur, ou exporter ici." : ''}</p>
  <div class="toolbar">
    <button class="secondary dl-btn" id="export">Exporter (JSON)</button>
    ${admin ? `<label class="btn secondary">Importer (JSON) – remplace tout<input type="file" id="import" accept=".json" style="display:none"></label>
    <button class="danger" id="reset">Réinitialiser avec les données de démo</button>` : ''}
  </div>` : ''}

  ${admin ? `<h2>Historique des modifications</h2><div class="table-wrap"><table id="audit"><tr><td class="muted">Chargement…</td></tr></table></div>` : ''}`;
};

const COL_LABELS = { consommations: 'Matériel', rapports: "Rapport d'intervention", reserves: 'Réserve', receptions: 'PV de réception', situations: 'Situation', frais: 'Note de frais', users: 'Personne', entreprises: 'Entreprise', contacts: 'Contact', articles: 'Fourniture', mainoeuvre: "Main-d'œuvre", zones: 'Zone', affaires: 'Chantier', devis: 'Devis', commandes: 'Commande', factures: 'Facture', planning: 'Planning', temps: 'Pointage' };

function accountModal(acc, onDone) {
  const isNew = !acc.id;
  const box = Modal.open(`<h2 style="margin-top:0">${isNew ? 'Nouveau compte' : 'Compte ' + esc(acc.login)}</h2>
    <div class="grid2">
      ${isNew ? '<div class="field"><label>Identifiant de connexion</label><input id="a-login" autocomplete="off"></div>' : ''}
      <div class="field"><label>Nom affiché</label><input id="a-nom" value="${esc(acc.nom)}"></div>
      <div class="field"><label>Rôle</label><select id="a-role">${Object.entries(ROLE_LABELS).map(([k, v]) => `<option value="${k}" ${k === acc.role ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>Fiche de la personne (pointage, planning)</label><select id="a-user">${options(Store.all('users'), acc.userId)}</select></div>
      <div class="field"><label>Adresse Microsoft 365 (expéditeur des e-mails)</label><input id="a-email" type="email" value="${esc(acc.email || '')}" autocomplete="off"></div>
      <div class="field"><label>${isNew ? 'Mot de passe (8 caractères min.)' : 'Nouveau mot de passe (laisser vide pour ne pas changer)'}</label><input id="a-pw" type="password" autocomplete="new-password"></div>
    </div>
    <div class="modal-actions">
      ${!isNew && acc.id !== Store.me.id ? '<button class="danger" id="a-del">Supprimer</button>' : ''}
      <span style="flex:1"></span>
      <button class="secondary" id="a-cancel">Annuler</button><button id="a-save">Enregistrer</button>
    </div>`);
  const v = id => box.querySelector(id).value;
  box.querySelector('#a-cancel').onclick = Modal.close;
  box.querySelector('#a-save').onclick = async () => {
    const body = { nom: v('#a-nom'), role: v('#a-role'), userId: v('#a-user'), email: v('#a-email').trim() };
    if (v('#a-pw')) body.password = v('#a-pw');
    try {
      if (isNew) await api('POST', '/api/accounts', { ...body, login: v('#a-login') });
      else await api('PUT', `/api/accounts/${acc.id}`, body);
      Modal.close(); App.toast('Compte enregistré'); onDone();
    } catch (e) { notify(e.message); }
  };
  const del = box.querySelector('#a-del');
  if (del) del.onclick = async () => {
    if (!await ask(`Supprimer le compte ${acc.login} ?`, 'Supprimer')) return;
    try { await api('DELETE', `/api/accounts/${acc.id}`); Modal.close(); onDone(); } catch (e) { notify(e.message); }
  };
}

Views.parametres.bind = root => {
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  on('#pw-save', async () => {
    try {
      await api('POST', '/api/me/password', { current: root.querySelector('#pw-cur').value, next: root.querySelector('#pw-new').value });
      root.querySelector('#pw-cur').value = root.querySelector('#pw-new').value = '';
      App.toast('Mot de passe modifié');
    } catch (e) { notify(e.message); }
  });
  on('#s-save', async () => {
    try { await Store.saveSettings(readForm(root, settingsFields, { ...Store.data.settings })); App.toast('Paramètres enregistrés'); }
    catch (e) { notify(e.message); }
  });
  on('#u-add', () => editModal({ title: 'Nouvelle personne', col: 'users', fields: userFields, obj: { role: 'atelier', capaciteHebdo: 35, tauxHoraire: Store.data.settings.tauxHoraireDefaut } }));
  root.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () =>
    editModal({ title: 'Personne', col: 'users', fields: userFields, obj: { ...Store.get('users', tr.dataset.id) } }));
  on('#export', () => download(`pipefit-crm-${isoDate(new Date())}.json`, Store.exportJSON()));
  const imp = root.querySelector('#import');
  if (imp) imp.onchange = async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !await ask('Remplacer TOUTES les données du serveur par ce fichier ?', 'Remplacer')) return;
    file.text().then(t => Store.importJSON(t)).then(() => { App.render(); App.toast('Import réussi'); }).catch(err => notify('Import impossible : ' + err.message));
  };
  on('#reset', async () => {
    if (!await ask('Effacer toutes les données (pour tous les utilisateurs) et recharger la démo ?', 'Tout effacer')) return;
    Store.reset().then(() => App.render()).catch(e => notify(e.message));
  });

  if (!Store.can('admin')) return;
  bindNumerotation(root);
  const loadAccounts = () => api('GET', '/api/accounts').then(list => {
    const t = root.querySelector('#accounts');
    if (!t) return;
    t.innerHTML = `<tr><th>Identifiant</th><th>Nom</th><th>Rôle</th><th>Ressource liée</th><th>E-mail d'envoi</th><th>Créé le</th></tr>` +
      list.map(a => `<tr class="clickable" data-acc="${a.id}"><td>${esc(a.login)}</td><td>${esc(a.nom)}</td><td>${esc(ROLE_LABELS[a.role])}</td><td>${esc(a.userId ? userName(a.userId) : '—')}</td><td>${esc(a.email || '—')}</td><td>${dateFr(a.createdAt)}</td></tr>`).join('');
    t.querySelectorAll('tr[data-acc]').forEach(tr => tr.onclick = () => accountModal(list.find(a => a.id === tr.dataset.acc), loadAccounts));
  });
  on('#acc-add', () => accountModal({ role: 'charge' }, loadAccounts));
  loadAccounts();
  api('GET', '/api/audit').then(rows => {
    const t = root.querySelector('#audit');
    if (!t) return;
    t.innerHTML = `<tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Élément</th></tr>` +
      rows.map(r => `<tr><td>${new Date(r.at).toLocaleString('fr-FR')}</td><td>${esc(r.login)}</td><td>${esc(r.action)}</td><td>${esc(COL_LABELS[r.col] || '')} ${esc(r.label || '')}</td></tr>`).join('');
  });
};
