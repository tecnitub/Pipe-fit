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
    date: isoDate(new Date()), validite: 30, statut: 'Brouillon', zoneId: '', ajustements: [], lignes: [], numAuto: true,
    ...(fields.clientId ? tvaDuClient(fields.clientId) : {}), ...fields,
  });
}

/* ---------- Rendu du document client (devis / facture) ---------- */
// Sens d'une remise globale ou d'une majoration : −1 remise, +1 majoration (0 si la valeur est nulle)
const ajSigne = a => Math.sign(num(a.mode === 'eur' ? a.montant : a.pct)) || (a.masque ? 1 : 0);
function docHeader(doc, type) {
  const a = affaireOf(doc.affaireId), cid = docClientId(doc), c = entreprise(cid), o = Doc.t(type);
  const bill = billingSite(cid), contact = Store.get('contacts', doc.contactId), site = siteOf(cid, doc.siteId);
  const objet = doc.objet || (Store.get('devis', doc.devisId) || {}).objet || a.nom;
  const refs = [`Date : ${dateFr(doc.date)}`, a.code ? `${estHorsDevis(a) ? 'Intervention' : 'Chantier'} : ${esc(a.code)}` : '',
    doc.refCommande ? `Votre commande n° ${esc(doc.refCommande)}` : '', o.charge ? `Chargé d'affaires : ${esc(userName(docChargeId(doc)))}` : ''].filter(Boolean).join('<br>');
  return `${Doc.entete(type, `${o.titre} ${doc.numero || '(numéro en cours…)'}`, refs)}
  <div class="doc-parties">
    <div><strong>${esc(c.nom || '—')}</strong>${bill ? `<br>${esc(bill.adresse)}<br>${esc(bill.cp)} ${esc(bill.ville)}` : ''}${c.tvaIntra ? `<br>TVA : ${esc(c.tvaIntra)}` : ''}</div>
    <div>${contact && o.contact ? `À l'attention de <strong>${esc(contactName(contact))}</strong>${contact.fonction ? `, ${esc(contact.fonction)}` : ''}${contact.email ? `<br>${esc(contact.email)}` : ''}${contact.mobile || contact.tel ? `<br>${esc(contact.mobile || contact.tel)}` : ''}` : ''}
      ${site && o.lieu ? `${contact && o.contact ? '<br><br>' : ''}Lieu d'intervention : <strong>${esc(site.libelle)}</strong><br>${esc(fullAddress(site))}` : ''}</div>
  </div>
  ${objet ? `<p class="doc-objet"><strong>Objet :</strong> ${esc(objet)}</p>` : ''}${Doc.intro(type)}`;
}

// Lignes du document client ; type absent = tout afficher
const LARGEURS_IMAGE = [['petite', 'Petite'], ['moyenne', 'Moyenne'], ['pleine', 'Pleine largeur']];
function docLinesClient(doc, type) {
  const o = type ? Doc.t(type) : { numeros: true, quantites: true, prix: true, detail: true, sousTotaux: true };
  // Prix du client : majorations masquées réparties (k) ; lignes avant remise commerciale, remise en colonne et en bas
  const k = Calc.coefMasque(doc), remises = o.prix && (doc.lignes || []).some(l => Calc.estPrix(l) && num(l.remise));
  const subAfter = Calc.sousTotauxApres(doc, l => Calc.ligneBrute(l) * k), numeros = Calc.numeros(doc);
  const nums = o.numeros && numeros.some(Boolean);
  const n = (nums ? 1 : 0) + 1 + (o.quantites ? 2 : 0) + (o.prix ? 2 : 0) + (remises ? 1 : 0);
  const sousTotal = o.sousTotaux || !o.prix;
  const pleine = html => (nums ? `<td></td><td colspan="${n - 1}">${html}</td>` : `<td colspan="${n}">${html}</td>`);
  const ligne = (l, i) => {
    if (l.type === 'chapitre') return `<tr class="chap niv-${Calc.niveau(l)}">${nums ? `<td>${esc(numeros[i])}</td><td colspan="${n - 1}">${esc(titreSansNum(l.titre, numeros[i]))}</td>` : `<td colspan="${n}">${esc(l.titre)}</td>`}</tr>`;
    if (l.type === 'texte') return l.texte ? `<tr class="doc-texte">${pleine(`<div class="pre">${esc(l.texte)}</div>`)}</tr>` : '';
    if (l.type === 'image') return l.imageId ? `<tr class="doc-image">${pleine(`<div class="doc-fig fig-${esc(l.largeur || 'moyenne')}"><img src="${fileUrl(l.imageId)}" alt="${esc(l.legende || 'Illustration')}">${l.legende ? `<div class="muted small">${esc(l.legende)}</div>` : ''}</div>`)}</tr>` : '';
    return `<tr>${nums ? `<td>${esc(numeros[i])}</td>` : ''}<td>${esc(l.designation)}${l.detail && o.detail ? `<div class="muted small pre">${esc(l.detail)}</div>` : ''}</td>${o.quantites ? `<td class="num">${fmt(l.qte, 2)}</td><td>${esc(l.unite)}</td>` : ''}${o.prix ? `<td class="num">${eur(Calc.pu(l) * k)}</td>${remises ? `<td class="num">${num(l.remise) ? `− ${fmt(num(l.remise), num(l.remise) % 1 ? 1 : 0)} %` : ''}</td>` : ''}<td class="num">${eur(Calc.ligneBrute(l) * k)}</td>` : ''}</tr>`;
  };
  return `<div class="table-wrap"><table class="doc-lines${o.prix && o.quantites ? '' : ' compact'}">
    <thead><tr>${nums ? '<th>N°</th>' : ''}<th>Désignation</th>${o.quantites ? '<th class="num">Qté</th><th>Unité</th>' : ''}${o.prix ? `<th class="num">PU HT</th>${remises ? '<th class="num">Remise</th>' : ''}<th class="num">Total HT</th>` : ''}</tr></thead>
    ${(doc.lignes || []).map((l, i) => ligne(l, i)
      + (sousTotal ? (subAfter[i] || []).filter(c => c.n).map(c => `<tr class="subtotal niv-${c.niveau}"><td colspan="${Math.max(1, n - 1)}">${o.prix ? 'Sous-total' : 'Total'} ${esc(c.titre)}</td><td class="num">${eur(c.total)}</td></tr>`).join('') : '')).join('')}
  </table></div>`;
}

/* ---------- TVA : taux du document, taux par ligne, autoliquidation, mentions ---------- */
const champsTVA = doc => ({ tauxTVA: doc.tauxTVA ?? '', autoliquidation: !!doc.autoliquidation, mentionTVA: doc.mentionTVA || '' });
// Régime par défaut d'un client (fiche entreprise) : taux usuel ou autoliquidation
function tvaDuClient(cid) {
  const v = entreprise(cid).regimeTVA;
  return v ? Calc.appliquerRegime({}, v) : { autoliquidation: false, tauxTVA: '' };
}
const MENTIONS_TVA = {
  AL: 'Autoliquidation : TVA due par le preneur assujetti, article 283-2 nonies du CGI (travaux de construction réalisés en sous-traitance).',
  10: 'TVA au taux de 10 % (article 279-0 bis du CGI) : travaux d\'amélioration, de transformation, d\'aménagement ou d\'entretien portant sur des locaux à usage d\'habitation achevés depuis plus de deux ans ; le client atteste que ces conditions sont remplies.',
  5.5: 'TVA au taux de 5,5 % (article 278-0 bis A du CGI) : travaux d\'amélioration de la qualité énergétique de locaux à usage d\'habitation achevés depuis plus de deux ans ; le client atteste que ces conditions sont remplies.',
  0: 'Exonération de TVA.',
};
function mentionsTVA(doc) {
  if (!doc) return '';
  const t = Calc.doc(doc), cl = entreprise(docClientId(doc)), l = [];
  if (t.autoliquidation) l.push(MENTIONS_TVA.AL + (cl.tvaIntra ? ` N° de TVA du client : ${cl.tvaIntra}.` : ''));
  else t.ventilation.filter(v => v.base && MENTIONS_TVA[v.taux]).forEach(v => l.push(MENTIONS_TVA[v.taux]));
  if (doc.mentionTVA) l.push(doc.mentionTVA);
  return l.length ? `<div class="doc-tva">${l.map(x => `<p class="doc-conditions">${esc(x)}</p>`).join('')}</div>` : '';
}
const libTaux = x => `${fmt(x, x % 1 ? 1 : 0)} %`;

function totalsTable(doc, type) {
  const t = Calc.doc(doc), z = Store.get('zones', doc.zoneId), o = type ? Doc.t(type) : { ajustements: true };
  const lignesTVA = t.autoliquidation ? `<tr><td>TVA autoliquidée par le preneur</td><td class="num">${eur(0)}</td></tr>`
    : t.ventilation.map(v => `<tr><td>TVA ${libTaux(v.taux)}${t.ventilation.length > 1 ? ` sur ${eur(v.base)}` : ''}</td><td class="num">${eur(v.tva)}</td></tr>`).join('');
  // Remise commerciale des lignes, puis remises globales (en % ou en €) et majorations visibles ; les majorations masquées
  // sont déjà dans les prix (rappelées sur l'écran interne seulement, type absent)
  const libAj = a => `${esc(a.libelle || (a.montant < 0 ? 'Remise' : 'Majoration'))}${a.mode === 'eur' ? '' : ` ${a.pct > 0 ? '+' : '−'}${fmt(Math.abs(a.pct), 1)} %`}`;
  const detail = o.ajustements || !t.ajust.length;
  return `<table class="totals">
    ${!type && t.majorationMasquee ? `<tr class="interne"><td>dont majorations non visibles du client (réparties dans les prix)</td><td class="num">+ ${eur(t.majorationMasquee)}</td></tr>` : ''}
    ${t.remiseLignes > 0.005 ? `<tr><td>Total des travaux HT</td><td class="num">${eur(t.brutAvantRemise)}</td></tr>
    <tr><td>Remise commerciale</td><td class="num">− ${eur(t.remiseLignes)}</td></tr>` : ''}
    ${detail ? `${t.remiseLignes > 0.005 ? '' : `<tr><td>Total des travaux</td><td class="num">${eur(t.brut)}</td></tr>`}
    ${t.ajust.map(a => `<tr><td>${libAj(a)}</td><td class="num">${a.montant < 0 ? '− ' : '+ '}${eur(Math.abs(a.montant))}</td></tr>`).join('')}
    ${t.ajust.length || t.remiseLignes > 0.005 ? `<tr class="sous-total"><td>${t.ajust.some(a => a.montant > 0) ? 'Total après remises et majorations' : 'Nouveau montant après remise'}</td><td class="num">${eur(t.net)}</td></tr>` : ''}`
    : `<tr><td>${t.remiseLignes > 0.005 ? 'Nouveau montant après remise' : 'Total des travaux'}</td><td class="num">${eur(t.net)}</td></tr>`}
    ${t.livraison || z ? `<tr><td>Livraison ${z ? `(${esc(z.nom)}, ${fmt(t.poids / 1000, 2)} t)` : ''}</td><td class="num">${eur(t.livraison)}</td></tr>` : ''}
    <tr><td>Total HT</td><td class="num">${eur(t.totalHT)}</td></tr>
    ${lignesTVA}
    <tr class="${t.retenue ? '' : 'grand'}"><td>Total TTC</td><td class="num">${eur(t.totalTTC)}</td></tr>
    ${t.retenue ? `<tr><td>Retenue de garantie ${fmt(doc.retenuePct, 1)} %</td><td class="num">− ${eur(t.retenue)}</td></tr>
    <tr class="grand"><td>Net à payer TTC</td><td class="num">${eur(t.netAPayer)}</td></tr>` : ''}
  </table>${t.retenue ? `<p class="doc-conditions">Retenue de garantie de ${fmt(doc.retenuePct, 1)} % du montant TTC (${eur(t.retenue)}), conformément à la loi n° 71-584 du 16 juillet 1971 : elle sera libérée un an après la réception des travaux, sauf réserves notifiées, ou remplacée par une caution bancaire.</p>` : ''}${mentionsTVA(doc)}`;
}

// Devis client complet (aperçu et impression)
function devisDocument(d) {
  const o = Doc.t('devis');
  return `${docHeader(d, 'devis')}${docLinesClient(d, 'devis')}${totalsTable(d, 'devis')}
    ${Doc.pied('devis', o.validite ? `<p class="doc-conditions">Devis valable ${esc(d.validite)} jours à compter du ${dateFr(d.date)}.</p>` : '',
      o.signature ? `<div class="signatures"><div>Pour ${esc(Store.data.settings.societe)}<br>${esc(userName(docChargeId(d)))}</div><div>Bon pour accord du client<br>Date, cachet et signature :</div></div>` : '')}`;
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
const FILTRES_DEVIS = { q: '', client: '', charge: '', statut: '' };
const devisFiltre = (d, f) => (!f.client || docClientId(d) === f.client) && (!f.charge || docChargeId(d) === f.charge)
  && correspond(f.q, d.numero, d.objet, clientName(docClientId(d)))
  && (f.statut === 'archives' ? d.archive : !d.archive && (f.statut === 'tous' || (f.statut ? d.statut === f.statut : ['Brouillon', 'Envoyé'].includes(d.statut))));
Views.devis = (params, query) => {
  if (params[0]) return devisEditor(params[0]);
  const f = lireFiltres('devis', query, FILTRES_DEVIS);
  const list = Store.all('devis').filter(d => devisFiltre(d, f)).sort((a, b) => (b.numero || '~').localeCompare(a.numero || '~'));
  const statuts = [['', 'En cours (brouillons et envoyés)'], ['tous', 'Tous (hors archivés)'], ...STATUTS_DEVIS.map(s => [s, s]), ['archives', 'Archivés']];
  const refusesActifs = Store.all('devis').filter(d => d.statut === 'Refusé' && !d.archive);
  return `<h1>Devis</h1>${devisTabs('devis')}
  <div class="toolbar">
    <button id="add">+ Nouveau devis</button>
    <span class="spacer"></span>
    ${refusesActifs.length && f.statut !== 'archives' ? `<button class="secondary" id="arch-refuses">Archiver les ${refusesActifs.length} devis refusé(s)</button>` : ''}
  </div>
  ${barreFiltres(f, { clients: [...new Set(Store.all('devis').map(docClientId))], statuts, defauts: FILTRES_DEVIS })}
  <div class="toolbar sel-bar hidden" id="sel-bar"><span id="sel-n"></span><button class="secondary" id="sel-arch">${f.statut === 'archives' ? 'Sortir des archives' : 'Archiver la sélection'}</button></div>
  <p class="muted small">${list.length} devis · ${eur(sumBy(list, d => Calc.doc(d).totalHT))} HT</p>
  ${list.length ? `<div class="table-wrap"><table><tr><th class="sel-cell"><input type="checkbox" data-sel-tout aria-label="Tout sélectionner"></th><th>N°</th><th>Date</th><th>Objet</th><th>Client</th><th>Contact</th><th>Chargé</th><th>Statut</th><th class="num">Total HT</th><th class="num">Part MO</th><th class="num">Marge prév.</th><th></th></tr>
  ${list.map(d => {
    const t = Calc.doc(d), ct = Store.get('contacts', d.contactId);
    return `<tr class="clickable ${d.archive ? 'archive' : ''}" data-go="#/devis/${d.id}"><td class="sel-cell"><input type="checkbox" data-sel-id="${d.id}" aria-label="Sélectionner ${esc(d.numero || '')}"></td><td>${esc(d.numero || '…')}</td><td>${dateFr(d.date)}</td><td>${esc(d.objet)}</td><td>${esc(clientName(docClientId(d)))}</td>
      <td>${ct ? esc(contactName(ct)) : ''}</td><td>${esc(userName(docChargeId(d)))}</td><td>${badge(d.statut)}${d.affaireId ? ' <span class="badge b-ok">Chantier</span>' : ''}${d.statut === 'Refusé' && d.motifRefus ? `<br><span class="muted small">${esc(d.motifRefus)}</span>` : ''}</td>
      <td class="num">${eur(t.totalHT)}</td><td class="num">${pct(t.partMOPct)}</td><td class="num">${marginBadge(t.margePrevPct)}</td>
      <td>${['Brouillon', 'Envoyé'].includes(d.statut) ? `<button class="small secondary" data-refuser="${d.id}" title="Marquer refusé">✕ Refusé</button>` : ''}</td></tr>`;
  }).join('')}</table></div>` : '<p class="muted">Aucun devis pour ces critères.</p>'}`;
};

/* ---------- Structure : chapitres, sous-chapitres, numéros ---------- */
const NIVEAUX_CHAPITRE = ['Chapitre', 'Sous-chapitre', 'Sous-sous-chapitre'];

// Arbre du devis : un chapitre contient ses lignes puis ses sous-chapitres ;
// textes et images restent collés à l'élément qui les précède.
function arbreDevis(d) {
  const nums = Calc.numeros(d), parIndex = {};
  const racine = { niveau: 0, enfants: [], colles: [], numero: '' }, pile = [racine];
  (d.lignes || []).forEach((l, i) => {
    if (l.type === 'texte' || l.type === 'image') {
      const p = pile[pile.length - 1];
      (p.enfants[p.enfants.length - 1] || p).colles.push(l); return;
    }
    const nd = { l, numero: nums[i], enfants: [], colles: [] };
    if (l.type === 'chapitre') {
      nd.chapitre = true; nd.niveau = Calc.niveau(l);
      while (pile.length > 1 && pile[pile.length - 1].niveau >= nd.niveau) pile.pop();
    }
    nd.parent = pile[pile.length - 1]; nd.parent.enfants.push(nd); parIndex[i] = nd;
    if (nd.chapitre) pile.push(nd);
  });
  return { racine, parIndex };
}
// Retour à la liste : les lignes d'un chapitre avant ses sous-chapitres, niveau = profondeur
function aplatirDevis(nd, profondeur = 0, out = []) {
  if (nd.l) { if (nd.chapitre) nd.l.niveau = Math.min(3, profondeur); out.push(nd.l); }
  out.push(...nd.colles);
  [...nd.enfants.filter(e => !e.chapitre), ...nd.enfants.filter(e => e.chapitre)].forEach(e => aplatirDevis(e, profondeur + 1, out));
  return out;
}
const contient = (nd, x) => nd === x || nd.enfants.some(e => contient(e, x));
const profondeurDe = nd => { let k = 0; for (let p = nd; p.parent; p = p.parent) k++; return k; };
const hauteurDe = nd => (nd.chapitre ? 1 + Math.max(0, ...nd.enfants.map(hauteurDe)) : 0);
const noeudsDe = (nd, out = []) => { nd.enfants.forEach(e => { out.push(e); noeudsDe(e, out); }); return out; };

// Numérotation automatique : taper « 2.3 » place la ligne (ou le chapitre et tout son contenu)
// en 3e position du chapitre 2. Renvoie un message d'erreur, ou '' si c'est fait.
function deplacerVers(d, index, saisie) {
  const v = String(saisie || '').trim().replace(/\.$/, '');
  if (!/^\d+(\.\d+)*$/.test(v) || /(^|\.)0+(\.|$)/.test(v)) return 'Numéro invalide : utilisez 1, 1.2, 1.2.3…';
  const { racine, parIndex } = arbreDevis(d), x = parIndex[index];
  if (!x) return '';
  const parts = v.split('.'), pos = +parts.pop(), numParent = parts.join('.');
  const parent = numParent ? noeudsDe(racine).find(n => n.chapitre && n.numero === numParent) : racine;
  if (!parent) return `Il n'y a pas de chapitre ${numParent}.`;
  if (contient(x, parent)) return 'Un chapitre ne peut pas être placé dans lui-même.';
  if (x.chapitre && profondeurDe(parent) + hauteurDe(x) > 3) return 'Trois niveaux de chapitres au maximum.';
  x.parent.enfants.splice(x.parent.enfants.indexOf(x), 1);
  const nbLignes = parent.enfants.filter(e => !e.chapitre).length;
  const k = x.chapitre ? Math.min(Math.max(pos - 1, nbLignes), parent.enfants.length) : Math.min(pos - 1, nbLignes);
  parent.enfants.splice(k, 0, x); x.parent = parent;
  d.lignes = aplatirDevis(racine);
  return '';
}

// Numérotation manuelle (N° de prix d'un DPGF…) : chaque élément va sous le chapitre dont le N° le préfixe
// (2.1.3 sous 2.1), puis tout est trié dans l'ordre naturel des N° (1.2 avant 1.10).
function rangerSelonNumeros(d) {
  const { racine } = arbreDevis({ ...d, numAuto: false }), tous = noeudsDe(racine);
  const chapitres = tous.filter(n => n.chapitre && n.numero);
  tous.filter(n => n.numero).forEach(n => {
    const cible = chapitres.filter(c => n.numero.startsWith(c.numero + '.') && !contient(n, c)).sort((a, b) => b.numero.length - a.numero.length)[0];
    if (!cible || cible === n.parent || (n.chapitre && profondeurDe(cible) + hauteurDe(n) > 3)) return;
    n.parent.enfants.splice(n.parent.enfants.indexOf(n), 1); cible.enfants.push(n); n.parent = cible;
  });
  const trier = nd => {
    let cle = ''; const cles = new Map();
    nd.enfants.forEach(e => { if (e.numero) cle = e.numero; cles.set(e, cle); }); // sans N° : reste derrière l'élément précédent
    nd.enfants.sort((a, b) => cles.get(a).localeCompare(cles.get(b), 'fr', { numeric: true }));
    nd.enfants.forEach(trier);
  };
  trier(racine);
  d.lignes = aplatirDevis(racine);
}

/* ---------- Éditeur ---------- */
function devisEditor(id) {
  const d = Store.get('devis', id);
  if (!d) return '<p>Devis introuvable. <a href="#/devis">Retour aux devis</a></p>';
  const t = Calc.doc(d);
  const cid = docClientId(d);
  const locked = d.statut === 'Accepté';
  const subAfter = Calc.sousTotauxApres(d), numeros = Calc.numeros(d);
  const lines = d.lignes || [];
  return `
  <div class="toolbar">
    <a href="#/devis" class="btn secondary">← Devis</a>
    ${d.affaireId ? `<a href="#/chantier/${esc(d.affaireId)}" class="btn secondary">Chantier ${esc(affaireOf(d.affaireId).code || '')}</a>` : ''}
    <span class="spacer"></span>
    ${!locked ? '<button class="secondary" id="dpgf-imp">Importer un DPGF</button>' : ''}
    <button class="secondary dl-btn" id="dpgf-exp">Exporter le DPGF chiffré</button>
    <button class="secondary" data-chiffrage="${esc(d.id)}">Chiffrage depuis plan</button>
    <button class="secondary" id="dup">Dupliquer</button>
    <button class="secondary print-btn" data-print>Imprimer</button>${boutonsEnvoi('devis', d.id)}
    ${!d.affaireId && d.statut !== 'Refusé' ? '<button id="accept">Accepté : créer le chantier</button>' : ''}
    ${['Brouillon', 'Envoyé'].includes(d.statut) ? `<button class="secondary" data-refuser="${d.id}">Refusé…</button>` : ''}
    ${d.archive ? '' : `<button class="secondary" data-archiver="devis|${d.id}">Archiver</button>`}
    ${d.affaireId ? `<a class="btn secondary" href="#/situations?devis=${d.id}">Situations</a>` : ''}
    <button class="danger" id="del">Supprimer</button>
  </div>
  <h1 class="no-print">Devis ${esc(d.numero || '')} ${badge(d.statut)}</h1>${envoisHtml('devis', d.id)}${bandeauArchive(d, 'devis')}
  ${d.statut === 'Refusé' && d.motifRefus ? `<p class="note no-print">Refusé le ${dateFr(d.dateRefus)} · ${esc(d.motifRefus)}${d.commentaireRefus ? ` : ${esc(d.commentaireRefus)}` : ''}</p>` : ''}
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
      <div class="field"><label for="d-tva">TVA du devis</label><select id="d-tva" ${locked ? 'disabled' : ''}>${REGIMES_TVA.map(([k, l]) => `<option value="${k}" ${Calc.regimeTVA(d) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="d-mtva">Mention TVA complémentaire <span class="muted small">(facultatif)</span></label><input id="d-mtva" value="${esc(d.mentionTVA || '')}" placeholder="ex. attestation du client du ${dateFr(isoDate(new Date()))}" ${locked ? 'disabled' : ''}></div>
    </div>
  </div>

  <h2 class="no-print">Lignes du devis</h2>
  <div class="toolbar no-print num-bar">
    <label class="check"><input type="checkbox" id="num-auto" ${d.numAuto ? 'checked' : ''} ${locked ? 'disabled' : ''}> Numérotation automatique (1, 1.1, 1.1.1…)</label>
    ${!locked && !d.numAuto && lines.some(l => l.num) ? '<button class="secondary small" id="ranger">Ranger selon les numéros</button>' : ''}
    <span class="muted small">${locked ? '' : d.numAuto ? 'Tapez un autre N° pour déplacer la ligne ou le chapitre (avec son contenu) à cette place.' : 'Saisissez les N° : les lignes se rangent dans l\'ordre des numéros, sous le chapitre correspondant.'}</span>
  </div>
  <div class="table-wrap no-print"><table class="edit-lines">
    <tr><th></th><th>N°</th><th>Désignation</th><th class="num">Qté</th><th>Unité</th><th class="num">PU fournit.</th><th class="num">PU MO</th><th class="num">PU HT</th><th class="num" title="Remise commerciale sur la ligne : elle figure sur le devis, avec le total des remises en bas">Remise %</th><th class="num">Total HT</th><th></th></tr>
    ${lines.map((l, i) => {
      const move = locked ? '<td></td>' : `<td class="move"><button class="icon" data-up="${i}" aria-label="Monter" ${i === 0 ? 'disabled' : ''}>▲</button><button class="icon" data-down="${i}" aria-label="Descendre" ${i === lines.length - 1 ? 'disabled' : ''}>▼</button></td>`;
      const del = locked ? '<td></td>' : `<td><button class="small danger" data-del="${i}" aria-label="Supprimer la ligne">✕</button></td>`;
      const numCell = `<td><input class="num-in" data-num="${i}" value="${esc(numeros[i])}" ${locked ? 'disabled' : ''} aria-label="N°"></td>`;
      let row;
      if (l.type === 'chapitre') {
        const niv = Calc.niveau(l);
        row = `<tr class="chap niv-${niv}">${move}${numCell}<td colspan="7"><div class="chap-edit"><select data-niv="${i}" aria-label="Niveau" ${locked ? 'disabled' : ''}>${NIVEAUX_CHAPITRE.map((x, k) => `<option value="${k + 1}" ${niv === k + 1 ? 'selected' : ''}>${x}</option>`).join('')}</select><input data-titre="${i}" value="${esc(l.titre)}" ${locked ? 'disabled' : ''} aria-label="Titre du chapitre"></div></td><td></td>${del}</tr>`;
      } else if (l.type === 'texte') {
        row = `<tr class="ligne-texte">${move}<td></td><td colspan="8"><textarea data-texte="${i}" rows="2" placeholder="Texte libre (conditions, précisions, exclusions…)" ${locked ? 'disabled' : ''} aria-label="Texte">${esc(l.texte || '')}</textarea></td>${del}</tr>`;
      } else if (l.type === 'image') {
        row = `<tr class="ligne-image">${move}<td></td><td colspan="8"><div class="img-edit">${l.imageId ? `<img src="${fileUrl(l.imageId)}" alt="">` : '<span class="muted">Aucune image</span>'}
          <input data-legende="${i}" value="${esc(l.legende || '')}" placeholder="Légende (facultatif)" ${locked ? 'disabled' : ''} aria-label="Légende">
          <select data-largeur="${i}" ${locked ? 'disabled' : ''} aria-label="Largeur">${LARGEURS_IMAGE.map(([k, x]) => `<option value="${k}" ${(l.largeur || 'moyenne') === k ? 'selected' : ''}>${x}</option>`).join('')}</select>
          ${locked ? '' : `<button class="secondary small" data-img="${i}">Remplacer</button>`}</div></td>${del}</tr>`;
      } else {
        const u = Calc.unit(l);
        const nbF = (l.composants || []).filter(c => c.type !== 'mo').length;
        row = `<tr class="ligne-prix ${aChiffrer(l) ? 'a-chiffrer' : ''}">${move}${numCell}<td class="des"><button class="linklike" data-open="${i}">${esc(l.designation || 'Ouvrage sans titre')}</button>
            ${l.libre ? '<span class="badge">poste libre</span>' : ''}${!videTVA(l.tva) && !d.autoliquidation && num(l.tva) !== Calc.tauxDoc(d) ? `<span class="badge b-info">TVA ${libTaux(num(l.tva))}</span>` : ''}${aChiffrer(l) ? '<span class="badge b-warn">à chiffrer</span>' : ''}
            <div class="muted small">${nbF} fourniture${nbF > 1 ? 's' : ''} · ${fmt(u.heures, 2)} h de main-d'œuvre / ${esc(l.unite)}${l.detail ? ' · <span title="' + esc(l.detail) + '">descriptif</span>' : ''}</div></td>
          <td class="num" data-l="Qté"><input data-qte="${i}" type="number" step="any" value="${esc(l.qte)}" style="width:80px" ${locked ? 'disabled' : ''} aria-label="Quantité"></td>
          <td data-l="Unité">${esc(l.unite)}</td><td class="num" data-l="PU fournit.">${eur(u.f)}</td><td class="num" data-l="PU MO">${eur(u.mo)}</td><td class="num" data-l="PU HT">${eur(u.f + u.mo)}</td>
          <td class="num" data-l="Remise %"><input data-remise="${i}" type="number" step="0.5" min="0" max="100" value="${num(l.remise) ? esc(l.remise) : ''}" placeholder="0" style="width:64px" ${locked ? 'disabled' : ''} aria-label="Remise commerciale en %"></td>
          <td class="num" data-l="Total HT"><strong>${eur(Calc.ligneHT(l))}</strong>${num(l.remise) ? `<div class="muted small">avant remise ${eur(Calc.ligneBrute(l))}</div>` : ''}</td>${del}</tr>`;
      }
      const sub = (subAfter[i] || []).map(c => `<tr class="subtotal niv-${c.niveau}"><td></td><td></td><td colspan="7">Sous-total ${esc(c.titre)}</td><td class="num">${eur(c.total)}</td><td></td></tr>`).join('');
      return row + sub;
    }).join('') || '<tr><td colspan="11" class="muted">Aucune ligne. Ajoutez un chapitre puis des ouvrages.</td></tr>'}
  </table></div>
  ${locked ? '' : `<div class="toolbar no-print add-bar" style="margin-top:8px">
    <button class="secondary" data-add-chap="1">+ Chapitre</button>
    <button class="secondary" data-add-chap="2">+ Sous-chapitre</button>
    <button class="secondary" data-add-chap="3">+ Sous-sous-chapitre</button>
    <button id="add-ouv">+ Ouvrage</button>
    <button class="secondary" id="add-libre" title="Fournitures et main-d'œuvre propres à ce devis, sans rien enregistrer dans les bibliothèques">+ Poste libre</button>
    ${Store.all('ouvrages').length ? '<button class="secondary" id="add-type">+ Ouvrage type</button>' : ''}
    <button class="secondary" id="add-dictee" title="Dicter ou taper une liste de matériel : les articles de la bibliothèque sont reconnus">🎤 Dicter du matériel</button>
    <button class="secondary" id="add-texte">+ Texte</button>
    <button class="secondary" id="add-image">+ Image</button>
    <input type="file" id="img-file" accept="image/*" hidden>
  </div>`}

  <h2 class="no-print">Remise globale et majoration (sur l'ensemble des lignes)</h2>
  <div class="card no-print">
    ${(d.ajustements || []).map((a, i) => { const signe = ajSigne(a), base = a.masque ? t.brut - t.majorationMasquee : t.brut; return `<div class="ajust-row">
      <select data-aj-type="${i}" aria-label="Type" ${locked ? 'disabled' : ''}><option value="-" ${signe < 0 ? 'selected' : ''}>Remise</option><option value="+" ${signe > 0 ? 'selected' : ''}>Majoration</option></select>
      <input data-aj-lib="${i}" value="${esc(a.libelle)}" placeholder="Libellé" aria-label="Libellé" ${locked ? 'disabled' : ''}>
      <input data-aj-val="${i}" type="number" step="${a.mode === 'eur' ? '10' : '0.5'}" min="0" value="${esc(Math.abs(num(a.mode === 'eur' ? a.montant : a.pct)))}" aria-label="Valeur" style="width:100px" ${locked ? 'disabled' : ''}>
      <select data-aj-mode="${i}" aria-label="Unité" style="width:auto" ${locked ? 'disabled' : ''}><option value="pct" ${a.mode !== 'eur' ? 'selected' : ''}>%</option><option value="eur" ${a.mode === 'eur' ? 'selected' : ''}>€ HT</option></select>
      <span class="num ${signe < 0 ? 'neg' : ''}">${signe < 0 ? '− ' : '+ '}${eur(Math.abs(Calc.montantAjustement(a, base)))}</span>
      ${signe > 0 ? `<label class="check small" title="Majoration masquée : répartie dans les prix des lignes, elle n'apparaît nulle part sur le devis ni sur la facture"><input type="checkbox" data-aj-vis="${i}" ${a.masque ? '' : 'checked'} ${locked ? 'disabled' : ''}> visible par le client</label>${a.masque ? '<span class="badge b-info">non visible du client</span>' : ''}` : ''}
      ${locked ? '' : `<button class="small danger" data-aj-del="${i}" aria-label="Supprimer">✕</button>`}</div>`; }).join('') || '<p class="muted" style="margin:0">Aucune remise ni majoration.</p>'}
    ${locked ? '' : `<div class="toolbar" style="margin:10px 0 0"><button class="secondary small" id="add-remise">+ Remise globale</button><button class="secondary small" id="add-maj">+ Majoration (non visible du client)</button></div>`}
    <p class="muted small" style="margin:8px 0 0">Remise en % ou en € sur le total des lignes, affichée sur le devis. Majoration : répartie dans les prix des lignes, le client ne voit que les prix majorés. Remise par ligne : colonne « Remise % » ci-dessus.</p>
  </div>
  <div class="no-print">${totalsTable(d)}</div>

  <h2 class="no-print">Pilotage prévisionnel</h2>
  <div class="no-print">${pilotageDevis(t)}</div>

  <details class="no-print preview"><summary>Aperçu du devis client</summary>
    <div class="doc-print">${devisDocument(d)}</div></details>
  <div class="print-only doc-print">${devisDocument(d)}</div>`;
}

Views.devis.bind = (root, params, query) => {
  if (!params[0]) {
    root.querySelector('#add').onclick = () => { const d = newDevis(); location.hash = `#/devis/${d.id}`; };
    const f = lireFiltres('devis', query, FILTRES_DEVIS);
    bindFiltres(root, 'devis', f, FILTRES_DEVIS);
    const sel = selectionListe(root, ids => { root.querySelector('#sel-bar').classList.toggle('hidden', !ids.length); root.querySelector('#sel-n').textContent = `${ids.length} sélectionné(s)`; });
    root.querySelector('#sel-arch').onclick = () => archiver('devis', sel().map(id => Store.get('devis', id)), f.statut !== 'archives');
    const ar = root.querySelector('#arch-refuses');
    if (ar) ar.onclick = () => archiver('devis', Store.all('devis').filter(d => d.statut === 'Refusé' && !d.archive));
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
    if (entreprise(c).regimeTVA) Object.assign(d, tvaDuClient(c));
    save();
  });
  field('#d-objet', 'objet'); field('#d-contact', 'contactId'); field('#d-site', 'siteId'); field('#d-charge', 'chargeId');
  field('#d-date', 'date'); field('#d-validite', 'validite', true); field('#d-zone', 'zoneId'); field('#d-mtva', 'mentionTVA');
  on('#d-tva', 'onchange', e => { Calc.appliquerRegime(d, e.target.value); save(); });
  on('#d-livman', 'onchange', e => { d.livraisonManuelle = e.target.value === '' ? null : +e.target.value; save(); });
  on('#d-statut', 'onchange', e => {
    if (e.target.value === 'Accepté') { e.target.value = d.statut; acceptDevis(d); return; }
    d.statut = e.target.value; save();
  });

  // Lignes
  root.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openOuvrage(d, +b.dataset.open));
  root.querySelectorAll('[data-qte]').forEach(inp => inp.onchange = () => { d.lignes[+inp.dataset.qte].qte = +inp.value; save(); });
  root.querySelectorAll('[data-remise]').forEach(inp => inp.onchange = () => { const v = Math.min(100, Math.max(0, num(inp.value))); if (v) d.lignes[+inp.dataset.remise].remise = v; else delete d.lignes[+inp.dataset.remise].remise; save(); });
  root.querySelectorAll('[data-titre]').forEach(inp => inp.onchange = () => { d.lignes[+inp.dataset.titre].titre = inp.value; save(); });
  root.querySelectorAll('[data-niv]').forEach(sel => sel.onchange = () => { d.lignes[+sel.dataset.niv].niveau = +sel.value; save(); });
  root.querySelectorAll('[data-texte]').forEach(t => t.onchange = () => { d.lignes[+t.dataset.texte].texte = t.value; save(); });
  root.querySelectorAll('[data-legende]').forEach(t => t.onchange = () => { d.lignes[+t.dataset.legende].legende = t.value; save(); });
  root.querySelectorAll('[data-largeur]').forEach(t => t.onchange = () => { d.lignes[+t.dataset.largeur].largeur = t.value; save(); });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { d.lignes.splice(+b.dataset.del, 1); save(); });
  const swap = (i, j) => { [d.lignes[i], d.lignes[j]] = [d.lignes[j], d.lignes[i]]; save(); };
  root.querySelectorAll('[data-up]').forEach(b => b.onclick = () => swap(+b.dataset.up, +b.dataset.up - 1));
  root.querySelectorAll('[data-down]').forEach(b => b.onclick = () => swap(+b.dataset.down, +b.dataset.down + 1));

  // Numérotation : automatique (déplacement en tapant un N°) ou manuelle (rangement selon les N° saisis)
  root.querySelectorAll('[data-num]').forEach(inp => inp.onchange = () => {
    const i = +inp.dataset.num, v = inp.value.trim();
    if (d.numAuto) {
      const err = deplacerVers(d, i, v);
      if (err) { notify(err); App.render(); return; }
    } else {
      const l = d.lignes[i], ancien = String(l.num || '');
      if (l.type === 'chapitre' && ancien && v) { // le contenu du chapitre suit son nouveau N°
        const c = Calc.chapitres(d).find(x => x.index === i);
        for (let k = i + 1; c && k <= c.last; k++) { const x = d.lignes[k]; if (x.num && String(x.num).startsWith(ancien + '.')) x.num = v + String(x.num).slice(ancien.length); }
      }
      l.num = v;
      rangerSelonNumeros(d);
    }
    save();
  });
  on('#num-auto', 'onchange', e => {
    if (!e.target.checked) { const nums = Calc.numeros(d); d.lignes.forEach((l, i) => { if (nums[i]) l.num = nums[i]; }); } // on garde les N° affichés
    d.numAuto = e.target.checked; save();
  });
  on('#ranger', 'onclick', () => { rangerSelonNumeros(d); save(); App.toast('Lignes rangées selon leurs numéros.'); });

  root.querySelectorAll('[data-add-chap]').forEach(b => b.onclick = async () => {
    const niveau = +b.dataset.addChap;
    const titre = await askValue(`Titre du ${NIVEAUX_CHAPITRE[niveau - 1].toLowerCase()}`, `${NIVEAUX_CHAPITRE[niveau - 1]} ${d.lignes.filter(l => l.type === 'chapitre' && Calc.niveau(l) === niveau).length + 1}`);
    if (titre) { d.lignes.push({ type: 'chapitre', niveau, titre }); save(); }
  });
  on('#add-ouv', 'onclick', () => openOuvrage(d, null));
  on('#add-libre', 'onclick', () => openOuvrage(d, null, { libre: true }));
  on('#add-type', 'onclick', () => choisirOuvrageType(d));
  // Liste de matériel dictée : un ouvrage par article (bibliothèque, ou poste libre à chiffrer)
  on('#add-dictee', 'onclick', async () => {
    const choix = await dicterMateriel({ titre: 'Dicter du matériel', prix: true, cible: 'à la fin du devis, une ligne par article' });
    choix.forEach(m => d.lignes.push(m.articleId
      ? { type: 'ouvrage', designation: m.designation, unite: m.unite, qte: m.qte, composants: [{ type: 'f', articleId: m.articleId, designation: m.designation, unite: m.unite, qte: 1, pu: m.pu, cout: m.cout, poids: m.poids }] }
      : { type: 'ouvrage', libre: true, designation: m.designation, unite: m.unite, qte: m.qte, composants: [{ type: 'f', articleId: '', designation: m.designation, unite: m.unite, qte: 1, pu: 0, cout: 0 }] }));
    if (choix.length) { save(); const libres = choix.filter(m => !m.articleId).length; App.toast(`${choix.length} ligne(s) ajoutée(s)${libres ? ` dont ${libres} à chiffrer (hors bibliothèque)` : ''}`, 4000); }
  });
  on('#add-texte', 'onclick', () => { d.lignes.push({ type: 'texte', texte: '' }); save(); const t = [...root.querySelectorAll('[data-texte]')].pop(); if (t) t.focus(); });
  const fichier = root.querySelector('#img-file');
  let cibleImage = null;
  const choisirImage = i => { cibleImage = i; fichier.value = ''; fichier.click(); };
  on('#add-image', 'onclick', () => choisirImage(null));
  root.querySelectorAll('[data-img]').forEach(b => b.onclick = () => choisirImage(+b.dataset.img));
  if (fichier) fichier.onchange = async () => {
    const f = fichier.files[0];
    if (!f) return;
    try {
      const { id: imageId } = await api('POST', '/api/files', { dataUrl: await compressImage(f, 1600, 0.82) });
      if (cibleImage === null) d.lignes.push({ type: 'image', imageId, legende: '', largeur: 'moyenne' });
      else d.lignes[cibleImage].imageId = imageId;
      save();
    } catch (e) { notify('Image illisible ou trop lourde.'); }
  };

  // Remises / majorations
  // Remise globale / majoration : signe, valeur en % ou en €, majoration masquée au client (par défaut)
  const aj = i => d.ajustements[i];
  const poser = (a, signe, val) => { if (a.mode === 'eur') { a.montant = signe * Math.abs(num(val)); a.pct = 0; } else { a.pct = signe * Math.abs(num(val)); delete a.montant; } if (signe < 0) delete a.masque; };
  root.querySelectorAll('[data-aj-type]').forEach(s => s.onchange = () => { const a = aj(+s.dataset.ajType), signe = s.value === '-' ? -1 : 1; poser(a, signe, a.mode === 'eur' ? a.montant : a.pct); if (signe > 0 && a.masque === undefined) a.masque = true; save(); });
  root.querySelectorAll('[data-aj-lib]').forEach(s => s.onchange = () => { aj(+s.dataset.ajLib).libelle = s.value; save(); });
  root.querySelectorAll('[data-aj-val]').forEach(s => s.onchange = () => { const a = aj(+s.dataset.ajVal); poser(a, ajSigne(a) || -1, s.value); save(); });
  root.querySelectorAll('[data-aj-mode]').forEach(s => s.onchange = () => { const a = aj(+s.dataset.ajMode), signe = ajSigne(a) || -1; a.mode = s.value === 'eur' ? 'eur' : 'pct'; poser(a, signe, 0); save(); });
  root.querySelectorAll('[data-aj-vis]').forEach(c => c.onchange = () => { aj(+c.dataset.ajVis).masque = !c.checked; save(); });
  root.querySelectorAll('[data-aj-del]').forEach(b => b.onclick = () => { d.ajustements.splice(+b.dataset.ajDel, 1); save(); });
  on('#add-remise', 'onclick', () => { (d.ajustements = d.ajustements || []).push({ libelle: 'Remise globale', mode: 'pct', pct: -5 }); save(); });
  on('#add-maj', 'onclick', () => { (d.ajustements = d.ajustements || []).push({ libelle: 'Majoration', mode: 'pct', pct: 5, masque: true }); save(); });

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
    zoneId: d.zoneId, livraisonManuelle: d.livraisonManuelle, ...champsTVA(d),
  });
}

/* ---------- Ouvrage : fournitures + main-d'œuvre ---------- */
// Liste des fournitures de la bibliothèque, rangées par famille › sous-famille, avec un champ de recherche qui la filtre
const optionsArticles = (q = '') => {
  const l = RechercheArticles.filtrer(Store.all('articles'), { q, fournisseurDe: a => (a.fournisseurId ? clientName(a.fournisseurId) : '') });
  const groupe = a => `${RechercheArticles.familleDe(a)}${a.sousFamille ? ` › ${a.sousFamille}` : ''}`;
  const opt = a => `<option value="${a.id}">${esc(a.ref)} – ${esc(a.designation)} (${eur(a.prixVente)}/${esc(a.unite)})</option>`;
  if (q.trim()) return l.length ? l.map(opt).join('') : '<option value="">Aucune fourniture trouvée</option>';
  const g = new Map(); l.forEach(a => { if (!g.has(groupe(a))) g.set(groupe(a), []); g.get(groupe(a)).push(a); });
  return `<option value="">Choisir une fourniture…</option>${[...g.entries()].map(([f, list]) => `<optgroup label="${esc(f)}">${list.map(opt).join('')}</optgroup>`).join('')}`;
};
function articleSelect(id) {
  return `<span class="art-pick"><input type="search" data-art-filtre="${id}" placeholder="Rechercher…" aria-label="Rechercher une fourniture" autocomplete="off"><select id="${id}" aria-label="Fourniture de la bibliothèque">${optionsArticles()}</select></span>`;
}
document.addEventListener('input', ev => {
  const id = ev.target.dataset && ev.target.dataset.artFiltre;
  if (!id) return;
  const sel = document.getElementById(id);
  if (sel) sel.innerHTML = optionsArticles(ev.target.value);
});

// opts.libre : poste libre (fournitures et main-d'œuvre propres à ce devis, rien n'est enregistré en bibliothèque)
// opts.initial : ouvrage de départ (ouvrage type) ; opts.enregistrer(l) : édition hors devis (bibliothèque d'ouvrages types)
function openOuvrage(d, index, opts = {}) {
  const locked = !!d && d.statut === 'Accepté', enBiblio = !!opts.enregistrer;
  const nouveau = () => {
    if (opts.initial) return { ...JSON.parse(JSON.stringify(opts.initial)), type: 'ouvrage', qte: 1 };
    if (!opts.libre) return { type: 'ouvrage', designation: '', unite: 'u', qte: 1, composants: [] };
    const m = moList()[0] || {};
    return { type: 'ouvrage', libre: true, designation: '', detail: '', unite: 'forfait', qte: 1, composants: [
      { type: 'f', designation: 'Fourniture', unite: '', qte: 1, pu: 0, cout: 0, poids: 0 },
      { type: 'mo', moId: m.id || '', libelle: m.libelle || "Main-d'œuvre", heures: 1, taux: num(m.tauxVente), cout: num(m.tauxCout) }] };
  };
  const l = index === null ? nouveau() : JSON.parse(JSON.stringify(d.lignes[index]));
  if (!l.composants) { // ancienne ligne simple -> ouvrage avec une fourniture
    l.composants = [{ type: 'f', articleId: l.articleId || '', designation: l.designation, unite: l.unite, qte: 1, pu: num(l.pu), cout: num(l.cout), poids: num(l.poids) }];
    l.type = 'ouvrage';
  }
  let premier = true;
  const render = () => {
    // Fenêtre fermée : le « change » d'un champ qui perd le focus à la fermeture ne doit pas la rouvrir
    if (!premier && document.getElementById('modal').classList.contains('hidden')) return;
    premier = false;
    const u = Calc.unit(l);
    const F = l.composants.map((c, i) => ({ c, i })).filter(x => x.c.type !== 'mo');
    const M = l.composants.map((c, i) => ({ c, i })).filter(x => x.c.type === 'mo');
    const dis = locked ? 'disabled' : '';
    const titre = enBiblio ? 'Ouvrage type' : l.libre ? (index === null ? 'Nouveau poste libre' : 'Poste libre') : index === null ? 'Nouvel ouvrage' : 'Ouvrage';
    const box = Modal.open(`<h2 style="margin-top:0">${titre}</h2>
      ${l.libre && !enBiblio ? '<p class="note">Poste propre à ce devis : saisissez librement fournitures et main-d\'œuvre, rien n\'est ajouté aux bibliothèques.</p>' : ''}
      ${enBiblio ? '<p class="note">Ouvrage réutilisable : il s\'insère dans les devis par « + Ouvrage type », aux prix à jour des bibliothèques.</p>' : ''}
      <div class="grid2">
        ${enBiblio ? `<div class="field"><label for="o-fam">Famille</label><input id="o-fam" value="${esc(l.famille || '')}" list="o-fams"><datalist id="o-fams">${[...new Set(Store.all('ouvrages').map(o => o.famille).filter(Boolean))].map(f => `<option value="${esc(f)}">`).join('')}</datalist></div>`
          : `<div class="field"><label for="o-num">N° de prix (DPGF)</label><input id="o-num" value="${esc(l.num || '')}" ${dis} ${d && d.numAuto ? 'placeholder="automatique"' : ''}></div>`}
        <div class="field" style="grid-column:1/-1"><label for="o-des">Désignation (texte du devis)</label><input id="o-des" value="${esc(l.designation)}" ${dis}></div>
        <div class="field" style="grid-column:1/-1"><label for="o-detail">Descriptif <span class="muted small">(facultatif, imprimé sous la désignation)</span></label><textarea id="o-detail" rows="2" ${dis}>${esc(l.detail || '')}</textarea></div>
        ${enBiblio ? '' : `<div class="field"><label for="o-qte">Quantité</label><input id="o-qte" type="number" step="any" value="${esc(l.qte)}" ${dis}></div>`}
        ${enBiblio || !d || d.autoliquidation ? '' : `<div class="field"><label for="o-tva">TVA de la ligne</label><select id="o-tva" ${dis}><option value="">Taux du devis (${libTaux(Calc.tauxDoc(d))})</option>${TAUX_TVA.map(x => `<option value="${x}" ${!videTVA(l.tva) && num(l.tva) === x ? 'selected' : ''}>${libTaux(x)}</option>`).join('')}</select></div>`}
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
      <div class="modal-actions">${locked || enBiblio ? '' : `<button class="secondary" id="o-type" title="Pour le réutiliser dans d'autres devis">${l.ouvrageTypeId && Store.get('ouvrages', l.ouvrageTypeId) ? 'Mettre à jour l\'ouvrage type' : 'Enregistrer comme ouvrage type'}</button>`}<span class="spacer"></span><button class="secondary" id="o-cancel">${locked ? 'Fermer' : 'Annuler'}</button>${locked ? '' : `<button id="o-save">${enBiblio ? 'Enregistrer' : l.libre ? 'Enregistrer le poste' : 'Enregistrer l\'ouvrage'}</button>`}</div>`, true);

    const keep = () => {
      const val = sel => { const el = box.querySelector(sel); return el ? el.value : undefined; };
      l.designation = val('#o-des'); l.unite = val('#o-unite'); l.detail = val('#o-detail');
      if (!enBiblio) { l.qte = num(val('#o-qte')); l.num = val('#o-num'); const tv = val('#o-tva'); if (tv !== undefined) { if (tv === '') delete l.tva; else l.tva = num(tv); } } else l.famille = val('#o-fam');
    };
    const applique = el => {
      const c = l.composants[+el.dataset.c], k = el.dataset.k;
      if (k === 'moId') { const m = moOf(el.value); Object.assign(c, { moId: el.value, libelle: m.libelle, taux: num(m.tauxVente), cout: num(m.tauxCout) }); }
      else c[k] = k === 'designation' ? el.value : +el.value;
    };
    // Les boutons ne prennent pas le focus : la saisie en cours est reprise par flush() au lieu de redessiner
    // la fenêtre sous le pointeur (le clic sur « Enregistrer » juste après une saisie n'est plus perdu)
    const flush = () => { keep(); const a = box.querySelector('[data-c]:focus'); if (a) applique(a); };
    box.onmousedown = e => { if (e.target.closest('button')) e.preventDefault(); };
    box.querySelectorAll('#o-qte, #o-unite').forEach(el => el.onchange = () => { keep(); render(); });
    box.querySelectorAll('[data-c]').forEach(el => el.onchange = () => { keep(); applique(el); render(); });
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { flush(); l.composants.splice(+b.dataset.rm, 1); render(); });
    const addF = box.querySelector('#o-add-f');
    if (addF) addF.onclick = () => {
      flush();
      const a = Store.get('articles', box.querySelector('#o-art').value);
      if (!a) { notify('Choisissez une fourniture dans la liste.'); return; }
      l.composants.push({ type: 'f', articleId: a.id, designation: a.designation, unite: a.unite, qte: num(box.querySelector('#o-art-q').value) || 1, pu: num(a.prixVente), cout: num(a.coutRevient), poids: num(a.poidsUnitaire) });
      if (!l.designation) { l.designation = a.designation; l.unite = a.unite; }
      render();
    };
    const addL = box.querySelector('#o-add-libre');
    if (addL) addL.onclick = () => { flush(); l.composants.push({ type: 'f', designation: 'Fourniture ou sous-traitance', unite: '', qte: 1, pu: 0, cout: 0, poids: 0 }); render(); };
    const addMO = box.querySelector('#o-add-mo');
    if (addMO) addMO.onclick = () => {
      flush();
      const m = moList()[0] || {};
      l.composants.push({ type: 'mo', moId: m.id || '', libelle: m.libelle || "Main-d'œuvre", heures: 1, taux: num(m.tauxVente), cout: num(m.tauxCout) });
      render();
    };
    box.querySelector('#o-cancel').onclick = Modal.close;
    const ty = box.querySelector('#o-type');
    if (ty) ty.onclick = () => {
      flush();
      if (!l.designation) { notify('Indiquez la désignation de l\'ouvrage.'); return; }
      const t = Store.upsert('ouvrages', { ...(l.ouvrageTypeId ? Store.get('ouvrages', l.ouvrageTypeId) : {}), ...versOuvrageType(l) });
      l.ouvrageTypeId = t.id; delete l.libre;
      App.toast(`« ${l.designation} » est enregistré dans la bibliothèque d'ouvrages types.`, 4000);
      render();
    };
    const sv = box.querySelector('#o-save');
    if (sv) sv.onclick = () => {
      flush();
      if (!l.designation) { notify('Indiquez la désignation de l\'ouvrage.'); return; }
      if (enBiblio) { opts.enregistrer(l); Modal.close(); App.render(); return; }
      if (index === null) d.lignes.push(l); else d.lignes[index] = l;
      Store.upsert('devis', d);
      Modal.close(); App.render();
    };
  };
  render();
}

/* ---------- Ouvrages types (bibliothèque d'ouvrages réutilisables) ---------- */
const versOuvrageType = l => ({ designation: l.designation, detail: l.detail || '', unite: l.unite, famille: l.famille || '', composants: JSON.parse(JSON.stringify(l.composants || [])) });
// Insertion dans un devis : prix des fournitures et taux de main-d'œuvre repris des bibliothèques actuelles
function ouvrageAJour(t) {
  const l = { ...versOuvrageType(t), type: 'ouvrage', qte: 1, ouvrageTypeId: t.id };
  l.composants.forEach(c => {
    const a = c.type !== 'mo' && c.articleId && Store.get('articles', c.articleId);
    if (a) Object.assign(c, { designation: a.designation, unite: a.unite, pu: num(a.prixVente), cout: num(a.coutRevient), poids: num(a.poidsUnitaire) });
    const m = c.type === 'mo' && c.moId && Store.get('mainoeuvre', c.moId);
    if (m) Object.assign(c, { libelle: m.libelle, taux: num(m.tauxVente), cout: num(m.tauxCout) });
  });
  return l;
}
function choisirOuvrageType(d) {
  const liste = Store.all('ouvrages').sort((a, b) => (a.famille || '').localeCompare(b.famille || '') || a.designation.localeCompare(b.designation));
  const box = Modal.open(`<h2 style="margin-top:0">Ouvrage type</h2>
    <input id="ot-q" type="search" placeholder="Rechercher…" aria-label="Rechercher">
    <div class="table-wrap" style="margin-top:8px"><table><tr><th>Famille</th><th>Désignation</th><th>Unité</th><th class="num">PU HT</th></tr>
    ${liste.map(t => `<tr class="clickable" data-ot="${t.id}" data-search="${esc([t.famille, t.designation].join(' ').toLowerCase())}"><td>${esc(t.famille || '')}</td><td>${esc(t.designation)}</td><td>${esc(t.unite)}</td><td class="num">${eur(Calc.pu(ouvrageAJour(t)))}</td></tr>`).join('')}</table></div>
    <div class="modal-actions"><a class="btn secondary" href="#/ouvrages">Gérer la bibliothèque</a><span class="spacer"></span><button class="secondary" id="ot-x">Annuler</button></div>`, true);
  box.querySelector('#ot-q').oninput = e => { const q = e.target.value.toLowerCase(); box.querySelectorAll('[data-search]').forEach(tr => { tr.style.display = tr.dataset.search.includes(q) ? '' : 'none'; }); };
  box.querySelector('#ot-x').onclick = Modal.close;
  box.querySelector('.modal-actions a').onclick = Modal.close;
  box.querySelectorAll('[data-ot]').forEach(tr => tr.onclick = () => { Modal.close(); openOuvrage(d, null, { initial: ouvrageAJour(Store.get('ouvrages', tr.dataset.ot)) }); });
}
Views.ouvrages = () => {
  const liste = Store.all('ouvrages').sort((a, b) => (a.famille || '').localeCompare(b.famille || '') || a.designation.localeCompare(b.designation));
  return `<h1>Bibliothèque</h1>${biblioTabs('ouvrages')}
  <p class="muted">Ouvrages réutilisés d'un devis à l'autre (« + Ouvrage type » dans le devis). Les prix sont repris des fournitures et de la main-d'œuvre à jour.
    Pour un besoin ponctuel, utilisez plutôt « + Poste libre » dans le devis : rien n'est enregistré ici.</p>
  <div class="toolbar"><button id="add">+ Ouvrage type</button><span class="spacer"></span><input id="search" type="search" placeholder="Rechercher…" style="width:auto;min-width:0;flex:1 1 160px;max-width:260px"></div>
  ${liste.length ? `<div class="table-wrap"><table><tr><th>Famille</th><th>Désignation</th><th>Unité</th><th class="num">Fournitures</th><th class="num">Heures</th><th class="num">PU HT</th><th></th></tr>
  ${liste.map(t => { const u = Calc.unit(ouvrageAJour(t)); return `<tr class="clickable" data-id="${t.id}" data-search="${esc([t.famille, t.designation].join(' ').toLowerCase())}"><td>${esc(t.famille || '')}</td><td>${esc(t.designation)}</td><td>${esc(t.unite)}</td>
    <td class="num">${eur(u.f)}</td><td class="num">${fmt(u.heures, 2)} h</td><td class="num">${eur(u.f + u.mo)}</td><td><button class="small danger" data-del="${t.id}" aria-label="Supprimer">✕</button></td></tr>`; }).join('')}</table></div>`
    : '<p class="muted">Aucun ouvrage type. Créez-en ici, ou depuis un devis avec « Enregistrer comme ouvrage type ».</p>'}`;
};
Views.ouvrages.bind = root => {
  bindSearch(root);
  const editer = t => openOuvrage(null, null, { initial: t ? ouvrageAJour(t) : { designation: '', unite: 'u', composants: [] },
    enregistrer: l => Store.upsert('ouvrages', { ...(t || {}), ...versOuvrageType(l) }) });
  root.querySelector('#add').onclick = () => editer(null);
  root.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = e => { if (!e.target.closest('[data-del]')) editer(Store.get('ouvrages', tr.dataset.id)); });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const t = Store.get('ouvrages', b.dataset.del);
    if (await ask(`Supprimer l'ouvrage type « ${t.designation} » ? Les devis existants ne changent pas.`, 'Supprimer')) Store.remove('ouvrages', t.id);
  });
};
